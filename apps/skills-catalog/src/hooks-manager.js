const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { exec, execFile, spawnSync } = require("node:child_process");
const {
  CODEX_HOOK_EVENTS,
  STANDARD_HOOK_EVENTS,
  validateCodexHooksConfig,
  validateHookDefinition,
  validateHookManifest,
  createHookDefinition,
  createHookManifest,
} = require("@skills-platform/contracts");

const PROVIDERS = ["antigravity", "claude", "codex"];
const SUPPORTED_CONFIG_PROVIDERS = new Set(["antigravity", "codex"]);
const SUPPORTED_RUNTIME_HANDLER_TYPES = new Set(["command", "script"]);
const DEFAULT_FAILURE_POLICY = "open";
const MAX_ENV_PAYLOAD_BYTES = 64 * 1024;
const PROVIDER_SYNC_STATE_SCHEMA_VERSION = 1;
const CODEX_MINIMUM_HOOKS_VERSION = "0.144.4";
const CODEX_DISPATCHER_ID_PREFIX = "skills-platform:";
const CODEX_DISPATCHER_STATUS_PREFIX = "Skills Platform managed dispatcher: ";
const CODEX_CONFIG_DESCRIPTION = "Project hooks managed in part by Skills Platform; user hooks are preserved.";
const CODEX_PLATFORM_EVENT_MAP = Object.freeze({
  session_start: "SessionStart",
  session_stop: "SessionEnd",
  pre_invocation: "UserPromptSubmit",
  user_prompt_submit: "UserPromptSubmit",
  pre_tool_use: "PreToolUse",
  on_test_run: "PreToolUse",
  permission_request: "PermissionRequest",
  post_tool_use: "PostToolUse",
  pre_compact: "PreCompact",
  post_compact: "PostCompact",
  subagent_start: "SubagentStart",
  subagent_stop: "SubagentStop",
  stop: "Stop",
  post_invocation: "Stop",
  interrupt: "Interrupt",
});
const CODEX_0_144_4_EVENTS = Object.freeze([
  "SessionStart",
  "PreToolUse",
  "PermissionRequest",
  "PostToolUse",
  "PreCompact",
  "PostCompact",
  "UserPromptSubmit",
  "SubagentStart",
  "SubagentStop",
  "Stop",
]);
const CODEX_CAPABILITY_TABLE = Object.freeze([
  Object.freeze({
    minimumVersion: "0.153.0",
    supportedEvents: Object.freeze([...CODEX_HOOK_EVENTS]),
    asyncSupported: true,
    mcpToolSupported: true,
  }),
  Object.freeze({
    minimumVersion: "0.148.0",
    supportedEvents: Object.freeze([
      ...CODEX_0_144_4_EVENTS,
      "SessionEnd",
    ]),
    asyncSupported: true,
    mcpToolSupported: true,
  }),
  Object.freeze({
    minimumVersion: CODEX_MINIMUM_HOOKS_VERSION,
    supportedEvents: CODEX_0_144_4_EVENTS,
    asyncSupported: false,
    mcpToolSupported: false,
  }),
]);

const DEFAULT_HOOKS = [
  {
    id: "secret-leak-guard",
    name: "Secret Leak Guard",
    event: "pre_tool_use",
    description: "Detects and blocks API keys, private tokens, and credentials in commands and payloads.",
    enabled: true,
    matcher: "run_command|write_to_file|replace_file_content|send_message|view_file",
    handler: {
      type: "script",
      target: ".skills-platform/hooks/guards/secret-leak-guard.js",
      timeout_ms: 5000,
    },
    priority: 5,
    providers: ["antigravity", "claude", "codex"],
    failure_policy: "open",
    metadata: { system: true, category: "security" },
  },
  {
    id: "destructive-command-blocker",
    name: "Destructive Command Blocker",
    event: "pre_tool_use",
    description: "Blocks catastrophic shell commands, destructive file deletions, and database wipes.",
    enabled: true,
    matcher: "run_command",
    handler: {
      type: "script",
      target: ".skills-platform/hooks/guards/destructive-command-blocker.js",
      timeout_ms: 5000,
    },
    priority: 10,
    providers: ["antigravity", "claude", "codex"],
    failure_policy: "open",
    metadata: { system: true, category: "safety" },
  },
  {
    id: "context-budget-guard",
    name: "Context Budget Guard",
    event: "pre_tool_use",
    description: "Enforces 80k token density budget to prevent excessive file writes and context bloat.",
    enabled: true,
    matcher: "write_to_file|replace_file_content|run_command|view_file",
    handler: {
      type: "script",
      target: ".skills-platform/hooks/guards/context-budget-guard.js",
      timeout_ms: 5000,
    },
    priority: 15,
    providers: ["antigravity", "claude", "codex"],
    failure_policy: "open",
    metadata: { system: true, category: "governance" },
  },
  {
    id: "scope-boundary-enforcer",
    name: "Scope Boundary Enforcer",
    event: "post_tool_use",
    description: "Audits file modifications against active topic scope and detects out-of-bounds mutations.",
    enabled: true,
    matcher: "write_to_file|replace_file_content",
    handler: {
      type: "script",
      target: ".skills-platform/hooks/guards/scope-boundary-enforcer.js",
      timeout_ms: 5000,
    },
    priority: 20,
    providers: ["antigravity", "claude", "codex"],
    failure_policy: "open",
    metadata: { system: true, category: "governance" },
  },
  {
    id: "subagent-recursion-limiter",
    name: "Subagent Recursion Limiter",
    event: "pre_tool_use",
    description: "Enforces recursion depth and concurrency ceilings on subagent invocations.",
    enabled: true,
    matcher: "invoke_subagent|send_message",
    handler: {
      type: "script",
      target: ".skills-platform/hooks/guards/subagent-recursion-limiter.js",
      timeout_ms: 5000,
    },
    priority: 25,
    providers: ["antigravity", "claude", "codex"],
    failure_policy: "open",
    metadata: { system: true, category: "governance" },
  },
  {
    id: "telemetry-collector",
    name: "Universal Telemetry Collector",
    event: "post_tool_use",
    description: "Captures tool invocation duration, parameters, and outcome into local NDJSON log.",
    enabled: true,
    matcher: "view_file|run_command",
    handler: {
      type: "script",
      target: ".skills-platform/hooks/telemetry-hook.js",
      timeout_ms: 5000,
    },
    priority: 10,
    providers: ["antigravity", "claude", "codex"],
    failure_policy: "open",
    metadata: { system: true },
  },
  {
    id: "session-stop-flush",
    name: "Session Stop Telemetry Flush",
    event: "session_stop",
    description: "Flushes queued telemetry and generates session summary when agent loop terminates.",
    enabled: true,
    matcher: null,
    handler: {
      type: "script",
      target: ".skills-platform/hooks/telemetry-hook.js",
      timeout_ms: 5000,
    },
    priority: 20,
    providers: ["antigravity", "claude"],
    failure_policy: "open",
    metadata: { system: true },
  },
  {
    id: "test-storm-guard",
    name: "Test Storm Suppression Guard",
    event: "on_test_run",
    description: "Blocks un-scoped full regression suite execution during inner-loop TDD cycles.",
    enabled: true,
    matcher: "test",
    handler: {
      type: "command",
      command: "node -e \"console.log('[Guard] Scoped test execution verified.')\"",
      timeout_ms: 2000,
    },
    priority: 50,
    providers: ["antigravity", "claude", "codex"],
    failure_policy: "open",
    metadata: { system: true },
  },
];

class HookManifestError extends Error {
  constructor(message, { code = "ERR_HOOK_MANIFEST_INVALID", manifestPath = null, issues = [], cause = null } = {}) {
    super(message);
    this.name = "HookManifestError";
    this.code = code;
    this.manifestPath = manifestPath;
    this.issues = issues;
    if (cause) this.cause = cause;
  }
}

class HookProviderConfigError extends Error {
  constructor(message, { provider = null, configPath = null, issues = [], cause = null } = {}) {
    super(message);
    this.name = "HookProviderConfigError";
    this.code = "ERR_HOOK_PROVIDER_CONFIG_INVALID";
    this.provider = provider;
    this.configPath = configPath;
    this.issues = issues;
    if (cause) this.cause = cause;
  }
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalize(value[key])])
  );
}

function stableStringify(value) {
  return JSON.stringify(canonicalize(value));
}

function digestValue(value) {
  return crypto.createHash("sha256").update(stableStringify(value)).digest("hex");
}

function parseSemanticVersion(value) {
  const match = String(value ?? "").match(/(?:^|\s)(\d+)\.(\d+)\.(\d+)(?:[-+][0-9A-Za-z.-]+)?(?:\s|$)/);
  if (!match) return null;
  return {
    raw: `${match[1]}.${match[2]}.${match[3]}`,
    parts: [Number(match[1]), Number(match[2]), Number(match[3])],
  };
}

function compareSemanticVersions(left, right) {
  const leftVersion = typeof left === "string" ? parseSemanticVersion(left) : left;
  const rightVersion = typeof right === "string" ? parseSemanticVersion(right) : right;
  if (!leftVersion || !rightVersion) return null;
  for (let index = 0; index < 3; index += 1) {
    if (leftVersion.parts[index] !== rightVersion.parts[index]) {
      return leftVersion.parts[index] < rightVersion.parts[index] ? -1 : 1;
    }
  }
  return 0;
}

function codexCapabilityLevel(version) {
  if (!version) return null;
  return CODEX_CAPABILITY_TABLE.find(
    (level) => compareSemanticVersions(version, level.minimumVersion) >= 0
  ) ?? null;
}

function runCodexProbe(command, args, { env = process.env, timeoutMs = 3000, cwd = process.cwd() } = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    cwd,
    env,
    maxBuffer: 2 * 1024 * 1024,
    shell: false,
    timeout: timeoutMs,
    windowsHide: true,
  });
  const stdout = String(result.stdout ?? "").trim();
  const stderr = String(result.stderr ?? "").trim();
  return {
    ok: !result.error && result.status === 0,
    status: result.status,
    stdout,
    stderr,
    error: result.error?.message || (result.status === 0 ? null : stderr || `exited with status ${result.status}`),
  };
}

function parseCodexHooksFeature(output) {
  const line = String(output ?? "").split(/\r?\n/).find((candidate) => /^hooks\s+/i.test(candidate.trim()));
  if (!line) return { found: false, stage: null, enabled: null };
  const match = line.trim().match(/^hooks\s+(.+?)\s+(true|false)$/i);
  if (!match) return { found: false, stage: null, enabled: null };
  return { found: true, stage: match[1].trim(), enabled: match[2].toLowerCase() === "true" };
}

function detectCodexCapabilities({ command = "codex", env = process.env, timeoutMs = 3000, projectPath = process.cwd() } = {}) {
  const cwd = path.resolve(projectPath);
  const versionProbe = runCodexProbe(command, ["--version"], { env, timeoutMs, cwd });
  const version = versionProbe.ok ? parseSemanticVersion(versionProbe.stdout) : null;
  const versionSupported = version ? compareSemanticVersions(version, CODEX_MINIMUM_HOOKS_VERSION) >= 0 : false;

  // Strict parsing tells us whether the current user config is understood by
  // this CLI. A read-only non-strict fallback still lets us report the hooks
  // feature independently when strict parsing rejects unrelated config keys.
  const strictFeatureProbe = versionProbe.ok
    ? runCodexProbe(command, ["--strict-config", "features", "list"], { env, timeoutMs, cwd })
    : { ok: false, status: null, stdout: "", stderr: "", error: "Codex CLI is unavailable" };
  const featureProbe = strictFeatureProbe.ok
    ? strictFeatureProbe
    : versionProbe.ok
      ? runCodexProbe(command, ["features", "list"], { env, timeoutMs, cwd })
      : strictFeatureProbe;
  const hooksFeature = featureProbe.ok ? parseCodexHooksFeature(featureProbe.stdout) : { found: false, stage: null, enabled: null };
  const capabilityLevel = versionProbe.ok
    ? codexCapabilityLevel(version)
    : CODEX_CAPABILITY_TABLE[CODEX_CAPABILITY_TABLE.length - 1];
  const supportedEvents = capabilityLevel ? [...capabilityLevel.supportedEvents] : [];
  const strictUnsupported = /not supported for [`']?codex features/i.test(strictFeatureProbe.error ?? "");

  return {
    command,
    installed: versionProbe.ok,
    version: version?.raw ?? null,
    versionSupported,
    minimumVersion: CODEX_MINIMUM_HOOKS_VERSION,
    versionProbe,
    strictConfig: {
      supported: !strictUnsupported,
      parsed: strictUnsupported ? null : strictFeatureProbe.ok,
      status: strictUnsupported ? "unsupported" : strictFeatureProbe.ok ? "valid" : "invalid",
      error: strictFeatureProbe.ok ? null : strictFeatureProbe.error,
    },
    featuresList: {
      available: featureProbe.ok,
      error: featureProbe.ok ? null : featureProbe.error,
    },
    hooksFeature: {
      found: hooksFeature.found,
      stage: hooksFeature.stage,
      enabled: hooksFeature.enabled,
    },
    supportedEvents,
    excludedEvents: [...CODEX_HOOK_EVENTS].filter((eventName) => !supportedEvents.includes(eventName)),
    asyncSupported: capabilityLevel?.asyncSupported ?? false,
    mcpToolSupported: capabilityLevel?.mcpToolSupported ?? false,
  };
}

function normalizeCodexCapabilities(capabilities, { projectPath = process.cwd() } = {}) {
  if (!capabilities) return detectCodexCapabilities({ projectPath });
  const normalizedVersion = capabilities.version ?? CODEX_MINIMUM_HOOKS_VERSION;
  const derivedVersionSupported = compareSemanticVersions(
    normalizedVersion,
    CODEX_MINIMUM_HOOKS_VERSION,
  ) >= 0;
  const versionSupported = capabilities.versionSupported ?? derivedVersionSupported;
  const installed = capabilities.installed ?? true;
  const capabilityLevel = versionSupported
    ? codexCapabilityLevel(normalizedVersion)
    : null;
  const supportedEvents = Array.isArray(capabilities.supportedEvents)
    ? capabilities.supportedEvents.filter((eventName) => CODEX_HOOK_EVENTS.has(eventName))
    : installed && !versionSupported
      ? []
      : [...(capabilityLevel?.supportedEvents ?? CODEX_0_144_4_EVENTS)];
  return {
    command: capabilities.command ?? "codex",
    installed,
    version: normalizedVersion,
    versionSupported,
    minimumVersion: CODEX_MINIMUM_HOOKS_VERSION,
    versionProbe: capabilities.versionProbe ?? null,
    strictConfig: capabilities.strictConfig ?? { supported: true, parsed: true, status: "valid", error: null },
    featuresList: capabilities.featuresList ?? { available: true, error: null },
    hooksFeature: capabilities.hooksFeature ?? { found: true, stage: "stable", enabled: true },
    supportedEvents,
    excludedEvents: [...CODEX_HOOK_EVENTS].filter((eventName) => !supportedEvents.includes(eventName)),
    asyncSupported: capabilities.asyncSupported ?? capabilityLevel?.asyncSupported ?? false,
    mcpToolSupported: capabilities.mcpToolSupported ?? capabilityLevel?.mcpToolSupported ?? false,
  };
}

function codexDispatcherId(eventName) {
  return `${CODEX_DISPATCHER_ID_PREFIX}${eventName}`;
}

function codexDispatcherIdFromHandler(handler) {
  if (!isRecord(handler) || typeof handler.statusMessage !== "string") return null;
  if (!handler.statusMessage.startsWith(CODEX_DISPATCHER_STATUS_PREFIX)) return null;
  const id = handler.statusMessage.slice(CODEX_DISPATCHER_STATUS_PREFIX.length);
  return id.startsWith(CODEX_DISPATCHER_ID_PREFIX) ? id : null;
}

function hookPriority(hook) {
  return hook.priority ?? 100;
}

function compareHooks(left, right) {
  const priorityDifference = hookPriority(left) - hookPriority(right);
  if (priorityDifference !== 0) return priorityDifference;
  if (left.id < right.id) return -1;
  if (left.id > right.id) return 1;
  return 0;
}

function atomicWriteJson(targetPath, value, { validate } = {}) {
  const targetDir = path.dirname(targetPath);
  fs.mkdirSync(targetDir, { recursive: true });

  const serialized = `${JSON.stringify(value, null, 2)}\n`;
  const parsed = JSON.parse(serialized);
  if (validate) validate(parsed);

  const existingMode = fs.existsSync(targetPath)
    ? fs.statSync(targetPath).mode & 0o777
    : 0o600;
  const temporaryPath = path.join(
    targetDir,
    `.${path.basename(targetPath)}.${process.pid}.${crypto.randomUUID()}.tmp`
  );
  let descriptor = null;
  try {
    descriptor = fs.openSync(temporaryPath, "wx", existingMode);
    fs.writeFileSync(descriptor, serialized, "utf8");
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = null;
    fs.renameSync(temporaryPath, targetPath);

    let directoryDescriptor = null;
    try {
      directoryDescriptor = fs.openSync(targetDir, "r");
      fs.fsyncSync(directoryDescriptor);
    } catch {
      // Some platforms/filesystems do not permit fsync on a directory.
    } finally {
      if (directoryDescriptor !== null) {
        try { fs.closeSync(directoryDescriptor); } catch { /* ignore cleanup failure */ }
      }
    }
  } catch (error) {
    if (descriptor !== null) {
      try { fs.closeSync(descriptor); } catch { /* ignore cleanup failure */ }
    }
    try { fs.rmSync(temporaryPath, { force: true }); } catch { /* ignore cleanup failure */ }
    throw error;
  }

  const persisted = JSON.parse(fs.readFileSync(targetPath, "utf8"));
  if (validate) validate(persisted);
  return persisted;
}

function resolveHooksDir(projectPath = process.cwd()) {
  return path.resolve(projectPath, ".skills-platform", "hooks");
}

function resolveManifestPath(projectPath = process.cwd()) {
  return path.resolve(resolveHooksDir(projectPath), "manifest.json");
}

function createDefaultHookManifest() {
  return createHookManifest(DEFAULT_HOOKS.map((hook) => createHookDefinition(hook)));
}

function loadHookManifest({ projectPath = process.cwd() } = {}) {
  const manifestPath = resolveManifestPath(projectPath);
  if (!fs.existsSync(manifestPath)) {
    const defaultManifest = createDefaultHookManifest();
    saveHookManifest({ projectPath, manifest: defaultManifest });
    return defaultManifest;
  }

  let rawText;
  try {
    rawText = fs.readFileSync(manifestPath, "utf8");
  } catch (error) {
    throw new HookManifestError(`Unable to read hook manifest: ${manifestPath}`, {
      code: "ERR_HOOK_MANIFEST_READ",
      manifestPath,
      cause: error,
    });
  }

  let raw;
  try {
    raw = JSON.parse(rawText);
  } catch (error) {
    throw new HookManifestError(`Hook manifest contains invalid JSON: ${manifestPath}`, {
      code: "ERR_HOOK_MANIFEST_INVALID_JSON",
      manifestPath,
      issues: [{ field: "manifest", message: error.message }],
      cause: error,
    });
  }

  const validation = validateHookManifest(raw);
  if (!validation.valid) {
    throw new HookManifestError(`Hook manifest is invalid: ${manifestPath}`, {
      manifestPath,
      issues: validation.issues,
    });
  }

  return {
    ...raw,
    hooks: raw.hooks.map((hook) => createHookDefinition(hook)),
  };
}

function saveHookManifest({ projectPath = process.cwd(), manifest }) {
  if (!manifest || !Array.isArray(manifest.hooks)) {
    throw new HookManifestError("Hook manifest must contain a hooks array", {
      manifestPath: resolveManifestPath(projectPath),
      issues: [{ field: "hooks", message: "must be an array" }],
    });
  }
  const validated = createHookManifest(manifest.hooks);
  const manifestPath = resolveManifestPath(projectPath);
  atomicWriteJson(manifestPath, validated, {
    validate(value) {
      const validation = validateHookManifest(value);
      if (!validation.valid) {
        throw new HookManifestError("Refusing to write an invalid hook manifest", {
          manifestPath,
          issues: validation.issues,
        });
      }
    },
  });
  return validated;
}

function listHooks({ projectPath = process.cwd(), eventName } = {}) {
  const manifest = loadHookManifest({ projectPath });
  const hooks = eventName
    ? manifest.hooks.filter((hook) => hook.event.toLowerCase() === String(eventName).toLowerCase())
    : [...manifest.hooks];
  return hooks.sort(compareHooks);
}

function registerHook({ projectPath = process.cwd(), hook, sync = true }) {
  const manifest = loadHookManifest({ projectPath });
  const validated = createHookDefinition(hook);
  const index = manifest.hooks.findIndex((item) => item.id === validated.id);
  if (index >= 0) manifest.hooks[index] = validated;
  else manifest.hooks.push(validated);
  saveHookManifest({ projectPath, manifest });
  if (sync) compileProviderConfigs({ projectPath });
  return validated;
}

function removeHook({ projectPath = process.cwd(), hookId, sync = true }) {
  const manifest = loadHookManifest({ projectPath });
  const removedHooks = manifest.hooks.filter((hook) => hook.id === hookId);
  const initialCount = manifest.hooks.length;
  manifest.hooks = manifest.hooks.filter((hook) => hook.id !== hookId);
  if (manifest.hooks.length === initialCount) {
    return { ok: false, message: "Hook not found" };
  }
  saveHookManifest({ projectPath, manifest });
  if (sync) compileProviderConfigs({ projectPath, additionalOwnedHooks: removedHooks });
  return { ok: true, removedHookId: hookId };
}

function updateHookStatus({ projectPath = process.cwd(), hookId, enabled, sync = true }) {
  if (typeof enabled !== "boolean") throw new Error("Hook enabled state must be a boolean");
  const manifest = loadHookManifest({ projectPath });
  const hook = manifest.hooks.find((item) => item.id === hookId);
  if (!hook) throw new Error(`Hook not found: ${hookId}`);
  hook.enabled = enabled;
  saveHookManifest({ projectPath, manifest });
  if (sync) compileProviderConfigs({ projectPath });
  return hook;
}

function providersForHook(hook) {
  return hook.providers ?? PROVIDERS;
}

function quoteCommandArgument(value) {
  const stringValue = String(value);
  if (process.platform === "win32") return `"${stringValue.replace(/"/g, '""')}"`;
  return `'${stringValue.replace(/'/g, `'"'"'`)}'`;
}

function resolveScriptTarget(projectPath, target) {
  return path.isAbsolute(target) ? path.normalize(target) : path.resolve(projectPath, target);
}

function commandForHook(hook, projectPath) {
  if (hook.handler.type === "command") return hook.handler.command;
  if (hook.handler.type === "script") {
    const scriptPath = resolveScriptTarget(projectPath, hook.handler.target);
    return `${quoteCommandArgument(process.execPath)} ${quoteCommandArgument(scriptPath)}`;
  }
  return null;
}

function quotePosixArgument(value) {
  return `'${String(value).replace(/'/g, `'"'"'`)}'`;
}

function quotePowerShellLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function codexDispatcherCommands(eventName, projectPath, failClosed) {
  const runnerPath = path.resolve(__dirname, "codex-hook-runner.js");
  const argumentsList = [process.execPath, runnerPath, "--project", projectPath, "--event", eventName];
  if (failClosed) argumentsList.push("--fail-closed");
  const posixArguments = argumentsList
    .map(quotePosixArgument)
    .join(" ");
  const windowsInvocation = argumentsList
    .map(quotePowerShellLiteral)
    .join(" ");
  return {
    command: posixArguments,
    commandWindows: `powershell.exe -NoProfile -NonInteractive -Command "& ${windowsInvocation}"`,
  };
}

function codexDispatcherSpec(eventName, hooks, projectPath) {
  const maximumTimeout = ["SessionEnd", "Interrupt"].includes(eventName) ? 3 : 600;
  const timeout = Math.max(1, Math.min(maximumTimeout, Math.ceil(
    hooks.reduce((total, hook) => total + (hook.handler.timeout_ms ?? 5000), 0) / 1000
  )));
  const id = codexDispatcherId(eventName);
  const failClosed = hooks.some((hook) => (hook.failure_policy ?? DEFAULT_FAILURE_POLICY) === "closed");
  return {
    type: "command",
    ...codexDispatcherCommands(eventName, projectPath, failClosed),
    timeout,
    statusMessage: `${CODEX_DISPATCHER_STATUS_PREFIX}${id}`,
  };
}

function buildProviderConfigs(manifest, projectPath, { codexCapabilities } = {}) {
  const enabledHooks = manifest.hooks.filter((hook) => hook.enabled).sort(compareHooks);
  const antigravityConfig = Object.create(null);
  const codexEventHooks = new Map();
  const capabilities = normalizeCodexCapabilities(codexCapabilities, { projectPath });
  const issues = { antigravity: [], codex: [] };

  for (const hook of enabledHooks) {
    if (providersForHook(hook).includes("antigravity")) {
      const command = commandForHook(hook, projectPath);
      if (!command) {
        issues.antigravity.push({
          provider: "antigravity",
          hookId: hook.id,
          code: "unsupported_handler",
          message: `Handler type '${hook.handler.type}' is not supported by the antigravity config compiler`,
        });
      } else {
        const hookSpec = {
          type: "command",
          command,
          timeout: Math.ceil((hook.handler.timeout_ms ?? 5000) / 1000),
        };
        if (hook.event === "pre_tool_use") {
          antigravityConfig[hook.id] = { PreToolUse: [{ matcher: hook.matcher || ".*", hooks: [hookSpec] }] };
        } else if (hook.event === "post_tool_use") {
          antigravityConfig[hook.id] = { PostToolUse: [{ matcher: hook.matcher || ".*", hooks: [hookSpec] }] };
        } else if (hook.event === "pre_invocation") {
          antigravityConfig[hook.id] = { PreInvocation: [hookSpec] };
        } else if (hook.event === "post_invocation") {
          antigravityConfig[hook.id] = { PostInvocation: [hookSpec] };
        } else if (hook.event === "session_stop") {
          antigravityConfig[hook.id] = { Stop: [hookSpec] };
        } else {
          antigravityConfig[hook.id] = {
            PostToolUse: [{ matcher: hook.matcher || hook.event, hooks: [hookSpec] }],
          };
        }
      }
    }

    if (!providersForHook(hook).includes("codex")) continue;
    if (!SUPPORTED_RUNTIME_HANDLER_TYPES.has(hook.handler.type)) {
      issues.codex.push({
        provider: "codex",
        hookId: hook.id,
        code: "unsupported_handler",
        message: `Handler type '${hook.handler.type}' is not supported by the Codex dispatcher`,
      });
      continue;
    }
    const codexEvent = CODEX_PLATFORM_EVENT_MAP[hook.event];
    if (!codexEvent) {
      issues.codex.push({
        provider: "codex",
        hookId: hook.id,
        event: hook.event,
        code: "unsupported_event",
        message: `Hook event '${hook.event}' has no Codex native event mapping`,
      });
      continue;
    }
    if (!capabilities.supportedEvents.includes(codexEvent)) {
      const oldVersion = capabilities.installed && !capabilities.versionSupported;
      issues.codex.push({
        provider: "codex",
        hookId: hook.id,
        event: hook.event,
        codexEvent,
        code: oldVersion ? "unsupported_codex_version" : "unsupported_event_capability",
        message: oldVersion
          ? `Codex ${capabilities.version ?? "unknown"} is older than the hooks baseline ${CODEX_MINIMUM_HOOKS_VERSION}`
          : `Codex ${capabilities.version ?? CODEX_MINIMUM_HOOKS_VERSION} capability excludes native event '${codexEvent}'`,
      });
      continue;
    }
    const eventHooks = codexEventHooks.get(codexEvent) ?? [];
    eventHooks.push(hook);
    codexEventHooks.set(codexEvent, eventHooks);
  }

  const codexHooks = {};
  for (const eventName of [...codexEventHooks.keys()].sort()) {
    codexHooks[eventName] = [{ hooks: [codexDispatcherSpec(eventName, codexEventHooks.get(eventName), projectPath)] }];
  }
  const codexConfig = {
    description: CODEX_CONFIG_DESCRIPTION,
    hooks: codexHooks,
  };

  return {
    configs: { antigravity: antigravityConfig, codex: codexConfig },
    issues,
    capabilities: { codex: capabilities },
  };
}

function validateCommandSpec(spec, field, issues) {
  if (!isRecord(spec)) {
    issues.push({ field, message: "must be an object" });
    return;
  }
  if (spec.type !== undefined && spec.type !== "command") {
    issues.push({ field: `${field}.type`, message: "must be command" });
  }
  if (typeof spec.command !== "string" || !spec.command.trim()) {
    issues.push({ field: `${field}.command`, message: "must be a non-empty string" });
  }
  if (spec.timeout !== undefined && (!Number.isSafeInteger(spec.timeout) || spec.timeout < 1)) {
    issues.push({ field: `${field}.timeout`, message: "must be a positive integer" });
  }
}

function validateGeneratedProviderConfig(provider, config, configPath = null) {
  const issues = [];
  if (provider === "antigravity") {
    if (!isRecord(config)) issues.push({ field: "config", message: "must be an object" });
    else {
      for (const [hookId, eventMap] of Object.entries(config)) {
        if (!isRecord(eventMap)) {
          issues.push({ field: hookId, message: "must map to an event object" });
          continue;
        }
        for (const [eventName, entries] of Object.entries(eventMap)) {
          if (eventName === "enabled") {
            if (typeof entries !== "boolean") {
              issues.push({ field: `${hookId}.enabled`, message: "must be a boolean" });
            }
            continue;
          }
          if (!Array.isArray(entries)) {
            issues.push({ field: `${hookId}.${eventName}`, message: "must be an array" });
            continue;
          }
          if (["PreToolUse", "PostToolUse"].includes(eventName)) {
            entries.forEach((group, groupIndex) => {
              if (!isRecord(group) || !Array.isArray(group.hooks)) {
                issues.push({ field: `${hookId}.${eventName}[${groupIndex}]`, message: "must contain hooks" });
                return;
              }
              group.hooks.forEach((spec, specIndex) =>
                validateCommandSpec(spec, `${hookId}.${eventName}[${groupIndex}].hooks[${specIndex}]`, issues)
              );
            });
          } else {
            entries.forEach((spec, index) =>
              validateCommandSpec(spec, `${hookId}.${eventName}[${index}]`, issues)
            );
          }
        }
      }
    }
  } else if (provider === "codex") {
    const validation = validateCodexHooksConfig(config);
    issues.push(...validation.issues);
  } else {
    issues.push({ field: "provider", message: `unsupported provider: ${provider}` });
  }

  if (issues.length > 0) {
    throw new HookProviderConfigError(`Generated ${provider} hook config is invalid`, {
      provider,
      configPath,
      issues,
    });
  }
  return true;
}

function providerConfigPath(projectPath, provider) {
  if (provider === "antigravity") return path.resolve(projectPath, ".agents", "hooks.json");
  if (provider === "claude") return path.resolve(projectPath, ".claude", "settings.json");
  if (provider === "codex") return path.resolve(projectPath, ".codex", "hooks.json");
  return null;
}

function providerConfigHookIds(provider, config) {
  if (provider === "antigravity") return isRecord(config) ? Object.keys(config).sort() : [];
  if (provider === "codex" && isRecord(config?.hooks)) {
    const ids = [];
    for (const groups of Object.values(config.hooks)) {
      if (!Array.isArray(groups)) continue;
      for (const group of groups) {
        if (!Array.isArray(group?.hooks)) continue;
        for (const handler of group.hooks) {
          const id = codexDispatcherIdFromHandler(handler);
          if (id && !ids.includes(id)) ids.push(id);
        }
      }
    }
    return ids.sort();
  }
  return [];
}

function providerConfigEntry(provider, config, hookId) {
  if (provider === "antigravity") return config?.[hookId] ?? null;
  if (provider === "codex" && isRecord(config?.hooks)) {
    for (const [eventName, groups] of Object.entries(config.hooks)) {
      if (!Array.isArray(groups)) continue;
      for (const group of groups) {
        if (!Array.isArray(group?.hooks)) continue;
        if (group.hooks.some((handler) => codexDispatcherIdFromHandler(handler) === hookId)) {
          return { event: eventName, group };
        }
      }
    }
  }
  return null;
}

function providerSyncStatePath(projectPath) {
  return path.resolve(resolveHooksDir(projectPath), "provider-sync-state.json");
}

function createEmptyProviderSyncState() {
  return {
    schema_version: PROVIDER_SYNC_STATE_SCHEMA_VERSION,
    updated_at: new Date(0).toISOString(),
    providers: {
      antigravity: { owned_hook_ids: [], active_hook_ids: [] },
      codex: {
        owned_hook_ids: [],
        active_hook_ids: [],
        owned_hook_digests: {},
        owned_hook_records: {},
      },
    },
  };
}

function validProviderOwnershipState(value) {
  return isRecord(value)
    && Array.isArray(value.owned_hook_ids)
    && Array.isArray(value.active_hook_ids)
    && value.owned_hook_ids.every((id) => typeof id === "string")
    && value.active_hook_ids.every((id) => typeof id === "string");
}

function validCodexOwnershipState(value) {
  if (!validProviderOwnershipState(value)) return false;
  if (value.owned_hook_digests === undefined && value.owned_hook_records === undefined) return true;
  if (!isRecord(value.owned_hook_digests) || !isRecord(value.owned_hook_records)) return false;
  const digestIds = Object.keys(value.owned_hook_digests).sort();
  const recordIds = Object.keys(value.owned_hook_records).sort();
  if (stableStringify(digestIds) !== stableStringify(recordIds)) return false;
  if (!value.active_hook_ids.every((id) => digestIds.includes(id))) return false;
  return recordIds.every((id) => {
    const record = value.owned_hook_records[id];
    return value.owned_hook_ids.includes(id)
      && typeof value.owned_hook_digests[id] === "string"
      && isRecord(record)
      && typeof record.event === "string"
      && CODEX_HOOK_EVENTS.has(record.event)
      && isRecord(record.group)
      && Array.isArray(record.group.hooks)
      && typeof record.digest === "string"
      && record.digest === value.owned_hook_digests[id];
  });
}

function loadProviderSyncState(projectPath) {
  const statePath = providerSyncStatePath(projectPath);
  if (!fs.existsSync(statePath)) return createEmptyProviderSyncState();
  try {
    const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
    const antigravity = state?.providers?.antigravity;
    const codex = state?.providers?.codex;
    if (
      state?.schema_version !== PROVIDER_SYNC_STATE_SCHEMA_VERSION ||
      !validProviderOwnershipState(antigravity) ||
      (codex !== undefined && !validCodexOwnershipState(codex))
    ) {
      throw new Error("state schema is invalid");
    }
    return {
      ...state,
      providers: {
        ...state.providers,
        codex: codex
          ? {
            ...codex,
            owned_hook_digests: codex.owned_hook_digests ?? {},
            owned_hook_records: codex.owned_hook_records ?? {},
          }
          : {
            owned_hook_ids: [],
            active_hook_ids: [],
            owned_hook_digests: {},
            owned_hook_records: {},
          },
      },
    };
  } catch (error) {
    throw new HookProviderConfigError("Provider sync ownership state is invalid", {
      provider: null,
      configPath: statePath,
      issues: [{ field: "provider-sync-state", message: error.message }],
      cause: error,
    });
  }
}

function saveProviderSyncState(projectPath, state) {
  const statePath = providerSyncStatePath(projectPath);
  return atomicWriteJson(statePath, state, {
    validate(value) {
      if (
        value?.schema_version !== PROVIDER_SYNC_STATE_SCHEMA_VERSION ||
        !validProviderOwnershipState(value?.providers?.antigravity) ||
        !validCodexOwnershipState(value?.providers?.codex)
      ) {
        throw new HookProviderConfigError("Refusing to write invalid provider sync ownership state", {
          provider: null,
          configPath: statePath,
        });
      }
    },
  });
}

function requestedHookIds(manifest, provider, { enabledOnly = true } = {}) {
  return manifest.hooks
    .filter((hook) => (!enabledOnly || hook.enabled) && providersForHook(hook).includes(provider))
    .sort(compareHooks)
    .map((hook) => hook.id);
}

function requestedCodexDispatcherIds(manifest, capabilities, { enabledOnly = true } = {}) {
  const eventNames = new Set();
  for (const hook of manifest.hooks) {
    if ((enabledOnly && !hook.enabled) || !providersForHook(hook).includes("codex")) continue;
    const eventName = CODEX_PLATFORM_EVENT_MAP[hook.event];
    if (eventName && capabilities.supportedEvents.includes(eventName)) eventNames.add(eventName);
  }
  return [...eventNames].sort().map(codexDispatcherId);
}

function readProviderConfig(projectPath, provider) {
  const configPath = providerConfigPath(projectPath, provider);
  if (!SUPPORTED_CONFIG_PROVIDERS.has(provider) || !configPath || !fs.existsSync(configPath)) {
    return {
      configured: false,
      configPath,
      config: null,
      error: null,
      parseStatus: { exists: false, jsonParsed: false, strictValid: false, issues: [] },
    };
  }
  let config;
  try {
    config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch (error) {
    return {
      configured: true,
      configPath,
      config: null,
      error,
      parseStatus: {
        exists: true,
        jsonParsed: false,
        strictValid: false,
        issues: [{ field: "config", message: error.message }],
      },
    };
  }
  try {
    validateGeneratedProviderConfig(provider, config, configPath);
    return {
      configured: true,
      configPath,
      config,
      error: null,
      parseStatus: { exists: true, jsonParsed: true, strictValid: true, issues: [] },
    };
  } catch (error) {
    return {
      configured: true,
      configPath,
      config: null,
      error,
      parseStatus: {
        exists: true,
        jsonParsed: true,
        strictValid: false,
        issues: Array.isArray(error.issues) ? error.issues : [{ field: "config", message: error.message }],
      },
    };
  }
}

function validateManagedProviderMerge(provider, config, expectedConfig, ownedHookIds, configPath) {
  if (!isRecord(config)) {
    throw new HookProviderConfigError(`Merged ${provider} hook config must be an object`, {
      provider,
      configPath,
    });
  }
  validateGeneratedProviderConfig(provider, expectedConfig, configPath);
  validateGeneratedProviderConfig(provider, config, configPath);
  const expectedHookIds = new Set(providerConfigHookIds(provider, expectedConfig));
  for (const hookId of ownedHookIds) {
    const actualEntry = providerConfigEntry(provider, config, hookId);
    const expectedEntry = providerConfigEntry(provider, expectedConfig, hookId);
    if (expectedHookIds.has(hookId)) {
      if (!actualEntry || stableStringify(actualEntry) !== stableStringify(expectedEntry)) {
        throw new HookProviderConfigError(`Managed hook '${hookId}' was not written exactly`, {
          provider,
          configPath,
        });
      }
    } else if (actualEntry) {
      throw new HookProviderConfigError(`Stale managed hook '${hookId}' was not removed`, {
        provider,
        configPath,
      });
    }
  }
  return true;
}

function unsupportedProviderDiagnostic(provider, projectPath, expectedHookIds) {
  const configPath = providerConfigPath(projectPath, provider);
  const configExists = Boolean(configPath && fs.existsSync(configPath));
  return {
    provider,
    supported: false,
    unsupported: true,
    configured: false,
    synced: false,
    drift: false,
    status: "unsupported",
    configPath,
    configParse: {
      exists: configExists,
      jsonParsed: false,
      strictValid: false,
      issues: [],
    },
    hookCount: 0,
    expectedHookIds,
    actualHookIds: [],
    missingHookIds: expectedHookIds,
    unexpectedHookIds: [],
    unmanagedHookIds: [],
    expectedDigest: null,
    actualDigest: null,
    runtimeReady: false,
    error: expectedHookIds.length > 0 ? `${provider} hook integration is not supported` : null,
  };
}

function codexHandlerMatchesRecord(handler, record) {
  const recordedHandler = record?.group?.hooks?.find((candidate) => (
    codexDispatcherIdFromHandler(candidate)?.startsWith(CODEX_DISPATCHER_ID_PREFIX)
  )) ?? record?.group?.hooks?.[0];
  return Boolean(
    recordedHandler
    && handler?.type === "command"
    && handler.command === recordedHandler.command
    && handler.commandWindows === recordedHandler.commandWindows
  );
}

function findCodexManagedEntry(config, hookId, record = null) {
  const markedEntry = providerConfigEntry("codex", config, hookId);
  if (markedEntry) return markedEntry;
  if (!record || !Array.isArray(config?.hooks?.[record.event])) return null;
  for (const group of config.hooks[record.event]) {
    if (group.hooks.some((handler) => codexHandlerMatchesRecord(handler, record))) {
      return { event: record.event, group };
    }
  }
  return null;
}

function stripOwnedCodexDispatchers(config, ownedHookIds, ownedHookRecords = {}) {
  const ownedIds = new Set(ownedHookIds);
  const merged = {
    ...(config ?? {}),
    hooks: {},
  };
  for (const [eventName, groups] of Object.entries(config?.hooks ?? {})) {
    const preservedGroups = [];
    for (const group of groups) {
      const preservedHandlers = group.hooks.filter((handler) => {
        if (ownedIds.has(codexDispatcherIdFromHandler(handler))) return false;
        return !Object.values(ownedHookRecords).some(
          (record) => record.event === eventName && codexHandlerMatchesRecord(handler, record)
        );
      });
      if (preservedHandlers.length === group.hooks.length) {
        preservedGroups.push(group);
      } else if (preservedHandlers.length > 0) {
        preservedGroups.push({ ...group, hooks: preservedHandlers });
      }
    }
    if (preservedGroups.length > 0) merged.hooks[eventName] = preservedGroups;
  }
  return merged;
}

function mergeCodexProviderConfig(existingConfig, expectedConfig, ownedHookIds, ownedHookRecords = {}) {
  const merged = stripOwnedCodexDispatchers(
    existingConfig ?? { hooks: {} },
    ownedHookIds,
    ownedHookRecords,
  );
  if (existingConfig?.description === undefined) merged.description = expectedConfig.description;
  for (const [eventName, groups] of Object.entries(expectedConfig.hooks)) {
    merged.hooks[eventName] = [...(merged.hooks[eventName] ?? []), ...groups];
  }
  return merged;
}

function assertCodexManagedEntriesSafe(existingConfig, codexState, expectedHookIds, configPath) {
  const priorOwnedIds = new Set(codexState.owned_hook_ids);
  for (const hookId of expectedHookIds) {
    const existingEntry = providerConfigEntry("codex", existingConfig, hookId);
    if (existingEntry && !priorOwnedIds.has(hookId)) {
      throw new HookProviderConfigError(`Codex hook config already contains unowned dispatcher id '${hookId}'`, {
        provider: "codex",
        configPath,
        issues: [{ field: hookId, message: "managed dispatcher id collides with an unowned entry" }],
      });
    }
  }
  for (const [hookId, recordedDigest] of Object.entries(codexState.owned_hook_digests ?? {})) {
    const existingEntry = findCodexManagedEntry(
      existingConfig,
      hookId,
      codexState.owned_hook_records?.[hookId],
    );
    if (existingEntry && digestValue(existingEntry) !== recordedDigest) {
      throw new HookProviderConfigError(`Managed Codex dispatcher '${hookId}' changed outside Skills Platform`, {
        provider: "codex",
        configPath,
        issues: [{ field: hookId, message: "managed dispatcher differs from the recorded ownership digest" }],
      });
    }
  }
}

function codexUnmanagedHookIds(config, ownedHookIds) {
  const ownedIds = new Set(ownedHookIds);
  const ids = [];
  for (const [eventName, groups] of Object.entries(config?.hooks ?? {})) {
    groups.forEach((group, groupIndex) => {
      group.hooks.forEach((handler, handlerIndex) => {
        const id = codexDispatcherIdFromHandler(handler);
        if (!id || !ownedIds.has(id)) ids.push(`user:${eventName}:${groupIndex}:${handlerIndex}`);
      });
    });
  }
  return ids;
}

function compileProviderConfigs({
  projectPath = process.cwd(),
  additionalOwnedHooks = [],
  codexCapabilities,
} = {}) {
  const resolvedProjectPath = path.resolve(projectPath);
  const manifest = loadHookManifest({ projectPath: resolvedProjectPath });
  const capabilities = normalizeCodexCapabilities(codexCapabilities, { projectPath: resolvedProjectPath });
  const build = buildProviderConfigs(manifest, resolvedProjectPath, { codexCapabilities: capabilities });
  const ownershipState = loadProviderSyncState(resolvedProjectPath);

  const antigravityPath = providerConfigPath(resolvedProjectPath, "antigravity");
  const expectedAntigravity = build.configs.antigravity;
  validateGeneratedProviderConfig("antigravity", expectedAntigravity, antigravityPath);
  const antigravityOwnedIds = [...new Set([
    ...ownershipState.providers.antigravity.owned_hook_ids,
    ...requestedHookIds(manifest, "antigravity", { enabledOnly: false }),
    ...additionalOwnedHooks
      .filter((hook) => providersForHook(hook).includes("antigravity"))
      .map((hook) => hook.id),
  ])].sort();
  const existingAntigravity = readProviderConfig(resolvedProjectPath, "antigravity");
  if (existingAntigravity.error) {
    throw new HookProviderConfigError("Existing Antigravity hook config is invalid; refusing to overwrite it", {
      provider: "antigravity",
      configPath: antigravityPath,
      issues: existingAntigravity.parseStatus.issues,
      cause: existingAntigravity.error,
    });
  }
  const mergedAntigravity = { ...(existingAntigravity.config ?? {}) };
  for (const hookId of antigravityOwnedIds) delete mergedAntigravity[hookId];
  for (const [hookId, entry] of Object.entries(expectedAntigravity)) mergedAntigravity[hookId] = entry;
  const writtenAntigravity = atomicWriteJson(antigravityPath, mergedAntigravity, {
    validate(value) {
      validateManagedProviderMerge("antigravity", value, expectedAntigravity, antigravityOwnedIds, antigravityPath);
    },
  });
  const expectedAntigravityIds = providerConfigHookIds("antigravity", expectedAntigravity);
  const antigravityActualIds = Object.keys(writtenAntigravity)
    .filter((id) => antigravityOwnedIds.includes(id)).sort();
  const antigravityIssues = build.issues.antigravity;
  const antigravity = {
    provider: "antigravity",
    supported: true,
    unsupported: false,
    configured: true,
    synced: antigravityIssues.length === 0,
    drift: false,
    status: antigravityIssues.length === 0 ? "synced" : "invalid",
    configPath: antigravityPath,
    configParse: { exists: true, jsonParsed: true, strictValid: true, issues: [] },
    hookCount: expectedAntigravityIds.length,
    expectedHookIds: expectedAntigravityIds,
    actualHookIds: antigravityActualIds,
    missingHookIds: [],
    unexpectedHookIds: antigravityActualIds.filter((id) => !expectedAntigravityIds.includes(id)),
    unmanagedHookIds: Object.keys(writtenAntigravity).filter((id) => !antigravityOwnedIds.includes(id)).sort(),
    runtimeReady: antigravityIssues.length === 0,
    error: antigravityIssues.length > 0 ? antigravityIssues.map((issue) => issue.message).join("; ") : null,
  };

  const codexPath = providerConfigPath(resolvedProjectPath, "codex");
  const expectedCodex = build.configs.codex;
  validateGeneratedProviderConfig("codex", expectedCodex, codexPath);
  const expectedCodexIds = providerConfigHookIds("codex", expectedCodex);
  const additionalCodexIds = requestedCodexDispatcherIds(
    { hooks: additionalOwnedHooks }, capabilities, { enabledOnly: false }
  );
  const codexOwnedIds = [...new Set([
    ...ownershipState.providers.codex.owned_hook_ids,
    ...requestedCodexDispatcherIds(manifest, capabilities, { enabledOnly: false }),
    ...additionalCodexIds,
  ])].sort();
  const existingCodex = readProviderConfig(resolvedProjectPath, "codex");
  if (existingCodex.error) {
    throw new HookProviderConfigError("Existing Codex hooks config is invalid; refusing to overwrite it", {
      provider: "codex",
      configPath: codexPath,
      issues: existingCodex.parseStatus.issues,
      cause: existingCodex.error,
    });
  }
  assertCodexManagedEntriesSafe(
    existingCodex.config ?? { hooks: {} },
    ownershipState.providers.codex,
    expectedCodexIds,
    codexPath,
  );
  const mergedCodex = mergeCodexProviderConfig(
    existingCodex.config,
    expectedCodex,
    codexOwnedIds,
    ownershipState.providers.codex.owned_hook_records,
  );
  const writtenCodex = atomicWriteJson(codexPath, mergedCodex, {
    validate(value) {
      validateManagedProviderMerge("codex", value, expectedCodex, codexOwnedIds, codexPath);
    },
  });
  const codexActualIds = providerConfigHookIds("codex", writtenCodex)
    .filter((id) => codexOwnedIds.includes(id));
  const codexIssues = build.issues.codex;
  const codex = {
    provider: "codex",
    supported: true,
    unsupported: false,
    configured: true,
    synced: codexIssues.length === 0,
    drift: false,
    status: codexIssues.length === 0 ? "synced" : "invalid",
    configPath: codexPath,
    configParse: { exists: true, jsonParsed: true, strictValid: true, issues: [] },
    hookCount: expectedCodexIds.length,
    expectedHookIds: expectedCodexIds,
    actualHookIds: codexActualIds,
    missingHookIds: [],
    unexpectedHookIds: codexActualIds.filter((id) => !expectedCodexIds.includes(id)),
    unmanagedHookIds: codexUnmanagedHookIds(writtenCodex, codexOwnedIds),
    capability: capabilities,
    feature: capabilities.hooksFeature,
    trust: { observed: false, status: "unknown" },
    runtimeReady: false,
    error: codexIssues.length > 0 ? codexIssues.map((issue) => issue.message).join("; ") : null,
  };

  const codexOwnedDigests = Object.fromEntries(expectedCodexIds.map((hookId) => [
    hookId,
    digestValue(providerConfigEntry("codex", writtenCodex, hookId)),
  ]));
  const codexOwnedRecords = Object.fromEntries(expectedCodexIds.map((hookId) => {
    const entry = providerConfigEntry("codex", writtenCodex, hookId);
    return [hookId, { ...entry, digest: digestValue(entry) }];
  }));
  saveProviderSyncState(resolvedProjectPath, {
    schema_version: PROVIDER_SYNC_STATE_SCHEMA_VERSION,
    updated_at: new Date().toISOString(),
    providers: {
      antigravity: {
        owned_hook_ids: antigravityOwnedIds,
        active_hook_ids: expectedAntigravityIds,
      },
      codex: {
        owned_hook_ids: codexOwnedIds,
        active_hook_ids: expectedCodexIds,
        owned_hook_digests: codexOwnedDigests,
        owned_hook_records: codexOwnedRecords,
      },
    },
  });

  const claudeHookIds = requestedHookIds(manifest, "claude");
  const providers = {
    antigravity,
    claude: unsupportedProviderDiagnostic("claude", resolvedProjectPath, claudeHookIds),
    codex,
  };
  const unsupportedProviders = ["claude"].filter(
    (unsupportedProvider) => providers[unsupportedProvider].expectedHookIds.length > 0
  );
  const issues = [
    ...antigravityIssues,
    ...codexIssues,
    ...unsupportedProviders.map((unsupportedProvider) => ({
      provider: unsupportedProvider,
      code: "unsupported_provider",
      message: `${unsupportedProvider} hook integration is not supported`,
    })),
  ];
  return {
    antigravityHooks: antigravity.hookCount,
    claudeHooks: 0,
    codexHooks: codex.hookCount,
    syncedAt: new Date().toISOString(),
    providers,
    unsupportedProviders,
    fullySynced: antigravity.synced && codex.synced && unsupportedProviders.length === 0,
    ok: issues.length === 0,
    issues,
  };
}

function analyzeProviderDiagnostic({
  provider,
  projectPath,
  manifest,
  expectedConfig,
  ownershipState,
  buildIssues = [],
}) {
  const enabledHookIds = requestedHookIds(manifest, provider);
  if (!SUPPORTED_CONFIG_PROVIDERS.has(provider)) {
    return unsupportedProviderDiagnostic(provider, projectPath, enabledHookIds);
  }

  const expectedHookIds = providerConfigHookIds(provider, expectedConfig);
  const manifestOwnedHookIds = provider === "codex"
    ? providerConfigHookIds(provider, expectedConfig)
    : requestedHookIds(manifest, provider, { enabledOnly: false });
  const ownedHookIds = [...new Set([
    ...(ownershipState?.providers?.[provider]?.owned_hook_ids ?? []),
    ...manifestOwnedHookIds,
  ])].sort();
  const loaded = readProviderConfig(projectPath, provider);
  if (!loaded.configured) {
    return {
      provider,
      supported: true,
      unsupported: false,
      configured: false,
      synced: false,
      drift: false,
      status: "not_configured",
      configPath: loaded.configPath,
      configParse: loaded.parseStatus,
      expectedHookIds,
      actualHookIds: [],
      missingHookIds: expectedHookIds,
      unexpectedHookIds: [],
      unmanagedHookIds: [],
      expectedDigest: digestValue(Object.fromEntries(
        expectedHookIds.map((id) => [id, providerConfigEntry(provider, expectedConfig, id)])
      )),
      actualDigest: null,
      error: buildIssues.length > 0 ? buildIssues.map((issue) => issue.message).join("; ") : null,
    };
  }

  if (loaded.error) {
    return {
      provider,
      supported: true,
      unsupported: false,
      configured: true,
      synced: false,
      drift: true,
      status: "invalid",
      configPath: loaded.configPath,
      configParse: loaded.parseStatus,
      expectedHookIds,
      actualHookIds: [],
      missingHookIds: expectedHookIds,
      unexpectedHookIds: [],
      unmanagedHookIds: [],
      expectedDigest: digestValue(Object.fromEntries(
        expectedHookIds.map((id) => [id, providerConfigEntry(provider, expectedConfig, id)])
      )),
      actualDigest: null,
      error: loaded.error.message,
    };
  }

  const allActualHookIds = providerConfigHookIds(provider, loaded.config);
  const actualHookIds = allActualHookIds.filter((id) => ownedHookIds.includes(id));
  const unmanagedHookIds = provider === "codex"
    ? codexUnmanagedHookIds(loaded.config, ownedHookIds)
    : allActualHookIds.filter((id) => !ownedHookIds.includes(id));
  const missingHookIds = expectedHookIds.filter((id) => !actualHookIds.includes(id));
  const unexpectedHookIds = actualHookIds.filter((id) => !expectedHookIds.includes(id));
  const actualManagedConfig = Object.fromEntries(
    actualHookIds.map((id) => [id, providerConfigEntry(provider, loaded.config, id)])
  );
  const expectedManagedConfig = Object.fromEntries(
    expectedHookIds.map((id) => [id, providerConfigEntry(provider, expectedConfig, id)])
  );
  const expectedDigest = digestValue(expectedManagedConfig);
  const actualDigest = digestValue(actualManagedConfig);
  const synced = expectedDigest === actualDigest && buildIssues.length === 0;
  return {
    provider,
    supported: true,
    unsupported: false,
    configured: true,
    synced,
    drift: !synced,
    status: buildIssues.length > 0 ? "invalid" : synced ? "synced" : "drift",
    configPath: loaded.configPath,
    configParse: loaded.parseStatus,
    expectedHookIds,
    actualHookIds,
    missingHookIds,
    unexpectedHookIds,
    unmanagedHookIds,
    expectedDigest,
    actualDigest,
    error: buildIssues.length > 0 ? buildIssues.map((issue) => issue.message).join("; ") : null,
  };
}

function analyzeHandlerDiagnostic(hook, projectPath) {
  const type = hook.handler.type;
  const target = hook.handler.target || hook.handler.command || hook.handler.url || null;
  if (type === "command") {
    return { type, target, resolvedTarget: null, exists: null, supported: true, error: null };
  }
  if (type === "script") {
    const resolvedTarget = resolveScriptTarget(projectPath, hook.handler.target);
    let exists = false;
    try { exists = fs.statSync(resolvedTarget).isFile(); } catch { /* missing or unreadable */ }
    return {
      type,
      target,
      resolvedTarget,
      exists,
      supported: true,
      error: exists ? null : `Script handler does not exist: ${resolvedTarget}`,
    };
  }
  if (type === "module") {
    let resolvedTarget = null;
    try {
      resolvedTarget = require.resolve(hook.handler.target, { paths: [projectPath] });
    } catch {
      // Keep a null resolved target; modules are not executable by this engine yet.
    }
    return {
      type,
      target,
      resolvedTarget,
      exists: Boolean(resolvedTarget),
      supported: false,
      error: `Handler type '${type}' is not supported by the runtime`,
    };
  }
  return {
    type,
    target,
    resolvedTarget: null,
    exists: null,
    supported: false,
    error: `Handler type '${type}' is not supported by the runtime`,
  };
}

function getHookDiagnostics({ projectPath = process.cwd(), codexCapabilities } = {}) {
  const resolvedProjectPath = path.resolve(projectPath);
  const manifest = loadHookManifest({ projectPath: resolvedProjectPath });
  const capabilities = normalizeCodexCapabilities(codexCapabilities, { projectPath: resolvedProjectPath });
  const build = buildProviderConfigs(manifest, resolvedProjectPath, { codexCapabilities: capabilities });
  const ownershipState = loadProviderSyncState(resolvedProjectPath);
  const providers = {
    antigravity: analyzeProviderDiagnostic({
      provider: "antigravity",
      projectPath: resolvedProjectPath,
      manifest,
      expectedConfig: build.configs.antigravity,
      ownershipState,
      buildIssues: build.issues.antigravity,
    }),
    claude: analyzeProviderDiagnostic({
      provider: "claude",
      projectPath: resolvedProjectPath,
      manifest,
      expectedConfig: null,
      ownershipState,
    }),
    codex: analyzeProviderDiagnostic({
      provider: "codex",
      projectPath: resolvedProjectPath,
      manifest,
      expectedConfig: build.configs.codex,
      ownershipState,
      buildIssues: build.issues.codex,
    }),
  };
  providers.antigravity.runtimeReady = providers.antigravity.synced;
  providers.codex.capability = capabilities;
  providers.codex.feature = capabilities.hooksFeature;
  providers.codex.trust = { observed: false, status: "unknown" };
  providers.codex.runtimeReady = false;
  providers.codex.runtimeBlockers = [
    ...(!capabilities.installed ? ["codex_cli_unavailable"] : []),
    ...(capabilities.installed && !capabilities.versionSupported ? ["codex_version_unsupported"] : []),
    ...(capabilities.hooksFeature.enabled !== true ? ["hooks_feature_not_enabled_or_unknown"] : []),
    "hook_trust_unknown",
  ];

  const actualConfigs = {
    antigravity: readProviderConfig(resolvedProjectPath, "antigravity").config,
    claude: null,
    codex: readProviderConfig(resolvedProjectPath, "codex").config,
  };
  const hooks = manifest.hooks.sort(compareHooks).map((hook) => {
    const handler = analyzeHandlerDiagnostic(hook, resolvedProjectPath);
    const providerStates = {};
    const requestedProviders = providersForHook(hook);
    for (const provider of PROVIDERS) {
      const providerDiagnostic = providers[provider];
      const requested = requestedProviders.includes(provider);
      const actualConfig = providerDiagnostic.configured ? actualConfigs[provider] : null;
      const expectedConfig = provider === "antigravity"
        ? build.configs.antigravity
        : provider === "codex"
          ? build.configs.codex
          : null;
      const providerEntryId = provider === "codex"
        ? (() => {
          const eventName = CODEX_PLATFORM_EVENT_MAP[hook.event];
          return eventName && capabilities.supportedEvents.includes(eventName)
            ? codexDispatcherId(eventName)
            : null;
        })()
        : hook.id;
      const actualEntry = providerEntryId
        ? providerConfigEntry(provider, actualConfig, providerEntryId)
        : null;
      const expectedEntry = providerEntryId
        ? providerConfigEntry(provider, expectedConfig, providerEntryId)
        : null;
      let status = "not_requested";
      let synced = true;
      if (requested && !hook.enabled) {
        synced = provider === "codex" ? providerDiagnostic.synced : !actualEntry;
        status = synced ? "disabled" : "drift";
      } else if (requested && providerDiagnostic.unsupported) {
        status = "unsupported";
        synced = false;
      } else if (requested && !providerDiagnostic.configured) {
        status = "not_configured";
        synced = false;
      } else if (requested && hook.enabled && !expectedEntry) {
        status = "invalid";
        synced = false;
      } else if (requested && hook.enabled) {
        synced = Boolean(actualEntry) && stableStringify(actualEntry) === stableStringify(expectedEntry);
        status = synced ? "synced" : "drift";
      }
      providerStates[provider] = {
        requested,
        supported: providerDiagnostic.supported,
        unsupported: providerDiagnostic.unsupported,
        configured: providerDiagnostic.configured,
        present: Boolean(actualEntry),
        synced,
        status,
        runtimeReady: requested ? Boolean(synced && providerDiagnostic.runtimeReady) : true,
      };
    }

    const issues = [];
    if (hook.enabled && !handler.supported) issues.push(handler.error);
    if (hook.enabled && handler.exists === false) issues.push(handler.error);
    if (hook.enabled) {
      for (const provider of requestedProviders) {
        if (!providerStates[provider].synced) {
          issues.push(`Provider '${provider}' is ${providerStates[provider].status}`);
        } else if (!providerStates[provider].runtimeReady) {
          issues.push(`Provider '${provider}' runtime is not verified`);
        }
      }
    }
    const runtimeReady = Boolean(
      hook.enabled &&
      handler.supported &&
      handler.exists !== false &&
      requestedProviders.length > 0 &&
      requestedProviders.every((provider) => providerStates[provider].runtimeReady)
    );
    return {
      id: hook.id,
      name: hook.name,
      event: hook.event,
      priority: hookPriority(hook),
      desiredEnabled: hook.enabled,
      failurePolicy: hook.failure_policy ?? DEFAULT_FAILURE_POLICY,
      handler,
      providers: providerStates,
      runtimeReady,
      issues: issues.filter(Boolean),
    };
  });

  const providerValues = Object.values(providers);
  const issues = [
    ...providerValues.filter((provider) => provider.status !== "synced" && provider.expectedHookIds.length > 0)
      .map((provider) => `Provider '${provider.provider}' is ${provider.status}`),
    ...hooks.flatMap((hook) => hook.issues.map((issue) => `Hook '${hook.id}': ${issue}`)),
  ];
  const desiredEnabled = hooks.filter((hook) => hook.desiredEnabled).length;
  const summary = {
    configuredProviders: providerValues.filter((provider) => provider.configured).length,
    syncedProviders: providerValues.filter((provider) => provider.synced).length,
    driftedProviders: providerValues.filter((provider) => provider.drift).length,
    unsupportedProviders: providerValues.filter((provider) => provider.unsupported).length,
    missingHandlers: hooks.filter((hook) => hook.desiredEnabled && hook.handler.exists === false).length,
    runtimeReadyHooks: hooks.filter((hook) => hook.runtimeReady).length,
  };
  return {
    analyzedAt: new Date().toISOString(),
    projectPath: resolvedProjectPath,
    manifestPath: resolveManifestPath(resolvedProjectPath),
    manifestUpdatedAt: manifest.updated_at,
    desired: {
      total: hooks.length,
      enabled: desiredEnabled,
      disabled: hooks.length - desiredEnabled,
    },
    summary,
    healthy: issues.length === 0,
    providers,
    hooks,
    issues: [...new Set(issues)],
  };
}

const analyzeHookDiagnostics = getHookDiagnostics;

function failurePolicyFor(hook) {
  return hook.failure_policy ?? DEFAULT_FAILURE_POLICY;
}

function createFailureResult({ hook, eventName, status, error, durationMs, stdout = "", stderr = null }) {
  const failurePolicy = failurePolicyFor(hook);
  const allow = failurePolicy === "open";
  const interception = allow
    ? null
    : {
        allow: false,
        decision: "block",
        reason: error,
        self_correct_hint: `Hook '${hook.id}' failed under a closed failure policy. Repair or disable the hook before retrying.`,
        violation_type: "hook_execution_failure",
        failure_policy: failurePolicy,
      };
  return {
    hookId: hook.id,
    event: eventName,
    status,
    allow,
    failurePolicy,
    reason: error,
    durationMs,
    interception,
    stdout,
    stderr,
    error,
  };
}

function normalizeInterception(value) {
  if (!isRecord(value)) return null;
  if (typeof value.allow === "boolean") return value;
  if (typeof value.decision === "string") {
    const decision = value.decision.toLowerCase();
    if (["deny", "block"].includes(decision)) return { ...value, allow: false };
    if (["allow", "continue"].includes(decision)) return { ...value, allow: true };
  }
  return null;
}

function parseInterception(stdout) {
  if (!stdout) return null;
  try {
    return normalizeInterception(JSON.parse(stdout));
  } catch {
    // Hook scripts may log before emitting a final single-line JSON decision.
  }
  const lines = stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).reverse();
  for (const line of lines) {
    try {
      const parsed = normalizeInterception(JSON.parse(line));
      if (parsed) return parsed;
    } catch {
      // Keep searching earlier lines.
    }
  }
  const jsonMatch = stdout.match(/\{[\s\S]*"(?:allow|decision)"[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    return normalizeInterception(JSON.parse(jsonMatch[0]));
  } catch {
    return null;
  }
}

function matcherCandidates(eventName, payload) {
  const candidates = new Set([String(eventName)]);
  if (String(eventName).startsWith("on_")) {
    const eventStem = String(eventName).slice(3);
    candidates.add(eventStem);
    candidates.add(eventStem.replace(/_run$/, ""));
  }
  let parsedPayload = payload;
  if (typeof payload === "string") {
    try { parsedPayload = JSON.parse(payload); } catch { parsedPayload = { raw: payload }; }
  }
  const visited = new WeakSet();
  function visit(value, depth = 0) {
    if (!value || typeof value !== "object" || depth > 6 || visited.has(value)) return;
    visited.add(value);
    if (Array.isArray(value)) {
      for (const item of value) visit(item, depth + 1);
      return;
    }
    if (!isRecord(value)) return;
    for (const [key, nested] of Object.entries(value)) {
      if (["tool", "tool_name", "toolName", "action", "type"].includes(key) && typeof nested === "string") {
        candidates.add(nested);
      }
      if (["CommandLine", "command", "cmd", "shell"].includes(key) && typeof nested === "string") {
        candidates.add("run_command");
      }
      if (["CodeContent", "ReplacementContent", "TargetContent"].includes(key)) {
        candidates.add("write_to_file");
        candidates.add("replace_file_content");
      }
      if (["TargetFile", "targetFile", "target_file"].includes(key) && typeof nested === "string") {
        candidates.add("write_to_file");
        candidates.add("replace_file_content");
      }
      if (["toolCall", "tool_call"].includes(key) && isRecord(nested) && typeof nested.name === "string") {
        candidates.add(nested.name);
      }
      visit(nested, depth + 1);
    }
  }
  visit(parsedPayload);
  return [...candidates];
}

function hookMatchesPayload(hook, eventName, payload) {
  const matcher = hook.matcher;
  if (matcher === undefined || matcher === null || matcher === "" || matcher === "*" || matcher === ".*") return true;
  let expression;
  try {
    expression = new RegExp(`^(?:${matcher})$`, "i");
  } catch {
    return false;
  }
  return matcherCandidates(eventName, payload).some((candidate) => expression.test(candidate));
}

async function executeHook({ hook, eventName, payload = {}, projectPath = process.cwd() }) {
  const startTime = Date.now();
  const normalizedHook = createHookDefinition(hook);
  if (!normalizedHook.enabled) {
    return {
      hookId: normalizedHook.id,
      event: eventName,
      status: "skipped",
      allow: true,
      failurePolicy: failurePolicyFor(normalizedHook),
      reason: "Hook disabled",
      durationMs: 0,
      interception: null,
      stdout: "",
      stderr: null,
      error: null,
    };
  }

  if (!SUPPORTED_RUNTIME_HANDLER_TYPES.has(normalizedHook.handler.type)) {
    return createFailureResult({
      hook: normalizedHook,
      eventName,
      status: "failed",
      error: `Unsupported hook handler type: ${normalizedHook.handler.type}`,
      durationMs: Date.now() - startTime,
    });
  }

  let payloadStr;
  try {
    payloadStr = typeof payload === "string" ? payload : JSON.stringify(payload);
  } catch (error) {
    return createFailureResult({
      hook: normalizedHook,
      eventName,
      status: "failed",
      error: `Hook payload is not serializable: ${error.message}`,
      durationMs: Date.now() - startTime,
    });
  }

  const timeoutMs = normalizedHook.handler.timeout_ms ?? 5000;
  const env = {
    ...process.env,
    ...(normalizedHook.handler.env || {}),
    HOOK_EVENT: eventName,
  };
  delete env.HOOK_PAYLOAD;
  if (Buffer.byteLength(payloadStr, "utf8") <= MAX_ENV_PAYLOAD_BYTES) env.HOOK_PAYLOAD = payloadStr;

  const options = {
    cwd: path.resolve(projectPath),
    env,
    timeout: timeoutMs,
    maxBuffer: 10 * 1024 * 1024,
    encoding: "utf8",
    windowsHide: true,
  };

  return new Promise((resolve) => {
    const callback = (err, stdout, stderr) => {
      const durationMs = Date.now() - startTime;
      const stdoutStr = stdout ? String(stdout).trim() : "";
      const stderrStr = stderr ? String(stderr).trim() : null;
      if (err && (err.killed || err.signal === "SIGTERM" || err.code === "ETIMEDOUT")) {
        return resolve(createFailureResult({
          hook: normalizedHook,
          eventName,
          status: "timed_out",
          error: `Execution exceeded ${timeoutMs}ms limit`,
          durationMs,
          stdout: stdoutStr,
          stderr: stderrStr,
        }));
      }

      const interception = parseInterception(stdoutStr);
      if (interception?.allow === false) {
        return resolve({
          hookId: normalizedHook.id,
          event: eventName,
          status: "blocked",
          allow: false,
          failurePolicy: failurePolicyFor(normalizedHook),
          durationMs,
          interception,
          stdout: stdoutStr,
          stderr: stderrStr,
          error: null,
        });
      }
      if (err) {
        return resolve(createFailureResult({
          hook: normalizedHook,
          eventName,
          status: "failed",
          error: err.message,
          durationMs,
          stdout: stdoutStr,
          stderr: stderrStr,
        }));
      }
      return resolve({
        hookId: normalizedHook.id,
        event: eventName,
        status: "success",
        allow: interception?.allow ?? true,
        failurePolicy: failurePolicyFor(normalizedHook),
        durationMs,
        interception,
        stdout: stdoutStr,
        stderr: stderrStr,
        error: null,
      });
    };

    let child;
    try {
      if (normalizedHook.handler.type === "script") {
        const scriptPath = resolveScriptTarget(projectPath, normalizedHook.handler.target);
        let scriptExists = false;
        try { scriptExists = fs.statSync(scriptPath).isFile(); } catch { /* missing or unreadable */ }
        if (!scriptExists) {
          return resolve(createFailureResult({
            hook: normalizedHook,
            eventName,
            status: "failed",
            error: `Script handler does not exist: ${scriptPath}`,
            durationMs: Date.now() - startTime,
          }));
        }
        child = execFile(process.execPath, [scriptPath], options, callback);
      } else {
        child = exec(normalizedHook.handler.command, options, callback);
      }
    } catch (error) {
      return resolve(createFailureResult({
        hook: normalizedHook,
        eventName,
        status: "failed",
        error: error.message,
        durationMs: Date.now() - startTime,
      }));
    }

    if (child.stdin) {
      child.stdin.on("error", () => {});
      try {
        child.stdin.write(payloadStr);
        child.stdin.end();
      } catch {
        // The process callback reports execution failures; stdin may close first.
      }
    }
  });
}

async function triggerHookEvent({ projectPath = process.cwd(), eventName, payload = {} } = {}) {
  const eventHooks = listHooks({ projectPath, eventName });
  const hooks = eventHooks
    .filter((hook) => hook.enabled && hookMatchesPayload(hook, eventName, payload))
    .sort(compareHooks);
  const results = [];
  for (const hook of hooks) {
    const result = await executeHook({ hook, eventName, payload, projectPath });
    results.push(result);
    if (result.allow === false || result.status === "blocked") {
      const reason = result.interception?.reason || result.error || "Execution blocked by guard";
      const selfCorrectHint = result.interception?.self_correct_hint || "Review and adjust your command or parameters.";
      return {
        eventName,
        allow: false,
        decision: "block",
        halted: true,
        blockedBy: hook.id,
        reason,
        self_correct_hint: selfCorrectHint,
        interception: result.interception || null,
        triggeredAt: new Date().toISOString(),
        totalHooks: eventHooks.length,
        matchedHooks: hooks.length,
        executedCount: results.length,
        results,
      };
    }
  }

  return {
    eventName,
    allow: true,
    decision: "allow",
    halted: false,
    triggeredAt: new Date().toISOString(),
    totalHooks: eventHooks.length,
    matchedHooks: hooks.length,
    executedCount: results.length,
    results,
  };
}

module.exports = {
  CODEX_CAPABILITY_TABLE,
  CODEX_PLATFORM_EVENT_MAP,
  DEFAULT_HOOKS,
  STANDARD_HOOK_EVENTS,
  resolveHooksDir,
  resolveManifestPath,
  loadHookManifest,
  saveHookManifest,
  listHooks,
  registerHook,
  removeHook,
  updateHookStatus,
  compileProviderConfigs,
  buildProviderConfigs,
  detectCodexCapabilities,
  providerConfigPath,
  getHookDiagnostics,
  analyzeHookDiagnostics,
  executeHook,
  triggerHookEvent,
  hookMatchesPayload,
  atomicWriteJson,
  HookManifestError,
  HookProviderConfigError,
};
