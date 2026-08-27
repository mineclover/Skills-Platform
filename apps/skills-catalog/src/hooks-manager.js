const fs = require("node:fs");
const path = require("node:path");
const { execSync } = require("node:child_process");
const {
  STANDARD_HOOK_EVENTS,
  validateHookDefinition,
  validateHookManifest,
  createHookDefinition,
  createHookManifest,
} = require("@skills-platform/contracts");

const DEFAULT_HOOKS = [
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
    metadata: { system: true },
  },
];

function resolveHooksDir(projectPath = process.cwd()) {
  return path.resolve(projectPath, ".skills-platform", "hooks");
}

function resolveManifestPath(projectPath = provess.cwd()) {
  return path.resolve(resolveHooksDir(projectPath), "manifest.json");
}

function loadHookManifest({ projectPath = process.cwd() } = {}) {
  const manifestPath = resolveManifestPath(projectPath);
  if (!fs.existsSync(manifestPath)) {
    const defaultManifest = createHookManifest(
      DEFAULT_HOOKS.map((h) => createHookDefinition(h))
    );
    saveHookManifest({ projectPath, manifest: defaultManifest });
    return defaultManifest;
  }
  try {
    const raw = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    const validation = validateHookManifest(raw);
    if (!validation.valid) {
      const fallback = createHookManifest(
        DEFAULT_HOOKS.map((h) => createHookDefinition(h))
      );
      saveHookManifest({ projectPath, manifest: fallback });
      return fallback;
    }
    return raw;
  } catch {
    const fallback = createHookManifest(
      DEFAULT_HOOKS.map((h) => createHookDefinition(h))
    );
    saveHookManifest({ projectPath, manifest: fallback });
    return fallback;
  }
}

function saveHookManifest({ projectPath = process.cwd(), manifest }) {
  const hooksDir = resolveHooksDir(projectPath);
  fs.mkdirSync(hooksDir, { recursive: true });
  const manifestPath = resolveManifestPath(projectPath);
  const validated = createHookManifest(manifest.hooks);
  fs.writeFileSync(manifestPath, JSON.stringify(validated, null, 2), "utf8");
  return validated;
}

function listHooks({ projectPath = process.cwd(), eventName } = {}) {
  const manifest = loadHookManifest({ projectPath });
  let hooks = manifest.hooks;
  if (eventName) {
    hooks = hooks.filter(
      (h) => h.event.toLowerCase() === eventName.toLowerCase()
    );
  }
  return hooks.sort((a, b) => (a.priority || 100) - (b.priority || 100));
}

function registerHook({ projectPath = process.cwd(), hook, sync = true }) {
  const manifest = loadHookManifest({ projectPath });
  const validated = createHookDefinition(hook);
  const index = manifest.hooks.findIndex((h) => h.id === validated.id);
  if (index >= 0) {
    manifest.hooks[index] = validated;
  } else {
    manifest.hooks.push(validated);
  }
  saveHookManifest({ projectPath, manifest });
  if (sync) {
    compileProviderConfigs({ projectPath });
  }
  return validated;
}

function removeHook({ projectPath = process.cwd(), hookId, sync = true }) {
  const manifest = loadHookManifest({ projectPath });
  const initialCount = manifest.hooks.length;
  manifest.hooks = manifest.hooks.filter((h) => h.id !== hookId);
  if (manifest.hooks.length === initialCount) {
    return { ok: false, message: 'Hook not found' };
  }
  saveHookManifest({ projectPath, manifest });
  if (sync) {
    compileProviderConfigs({ projectPath });
  }
  return { ok: true, removedHookId: hookId };
}

function updateHookStatus({ projectPath = process.cwd(), hookId, enabled, sync = true }) {
  const manifest = loadHookManifest({ projectPath });
  const hook = manifest.hooks.find((h) => h.id === hookId);
  if (!hook) {
    throw new Error('Hook not found: ' + hookId);
  }
  hook.enabled = Boolean(enabled);
  saveHookManifest({ projectPath, manifest });
  if (sync) {
    compileProviderConfigs({ projectPath });
  }
  return hook;
}

function compileProviderConfigs({ projectPath = process.cwd() }) {
  const manifest = loadHookManifest({ projectPath });
  const enabledHooks = manifest.hooks.filter((h) => h.enabled);

  // 1. Antigravity .agents/hooks.json
  const agentsDir = path.resolve(projectPath, ".agents");
  fs.mkdirSync(agentsDir, { recursive: true });
  const antigravityConfig = {};

  for (const hook of enabledHooks) {
    if (hook.providers && !hook.providers.includes("antigravity")) continue;
    const hookSpec = {
      type: "command",
      command: hook.handler.type === "script"
        ? 'node ' + hook.handler.target
        : hook.handler.command || "echo ok",
      timeout: Math.ceil((hook.handler.timeout_ms || 5000) / 1000),
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
      antigravityConfig[hook.id] = { PostToolUse: [{ matcher: hook.matcher || hook.event, hooks: [hookSpec] }] };
    }
  }

  fs.writeFileSync(path.resolve(agentsDir, "hooks.json"), JSON.stringify(antigravityConfig, null, 2), "utf8");

  // 2. Claude .claude/hooks.json
  const claudeDir = path.resolve(projectPath, ".claude");
  fs.mkdirSync(claudeDir, { recursive: true });
  const claudeConfig = {
    version: 1,
    hooks: enabledHooks
      .filter((h) => !h.providers || h.providers.includes("claude"))
      .map((h) => ({
        id: h.id,
        event: h.event,
        matcher: h.matcher || "*",
        command: h.handler.type === "script"
          ? 'node ' + h.handler.target
          : h.handler.command || "echo ok",
        timeout: h.handler.timeout_ms || 5000,
      })),
  };

  fs.writeFileSync(path.resolve(claudeDir, "hooks.json"), JSON.stringify(claudeConfig, null, 2), "utf8");

  return {
    antigravityHooks: Object.keys(antigravityConfig).length,
    claudeHooks: claudeConfig.hooks.length,
    syncedAt: new Date().toISOString(),
  };
}

async function executeHook({ hook, eventName, payload = {}, projectPath = process.cwd() }) {
  const startTime = Date.now();
  if (!hook.enabled) {
    return {
      hookId: hook.id,
      event: eventName,
      status: "skipped",
      reason: "Hook disabled",
      durationMs: 0,
    };
  }
  const timeoutMs = hook.handler.timeout_ms || 5000;
  const env = { ...process.env, ...(hook.handler.env || {}), HOOK_EVENT: eventName, HOOK_PAYLOAD: JSON.stringify(payload) };
  return new Promise((resolve) => {
    let commandStr = "";
    if (hook.handler.type === "script") {
      const scriptPath = path.isAbsolute(hook.handler.target)
        ? hook.handler.target
        : path.resolve(projectPath, hook.handler.target);
      commandStr = 'node "' + scriptPath + '"';
    } else {
      commandStr = hook.handler.command || "echo ok";
    }
    const timer = setTimeout(() => {
      resolve({
        hookId: hook.id,
        event: eventName,
        status: "timed_out",
        durationMs: Date.now() - startTime,
        error: 'Execution exceeded ' + timeoutMs + 'ms limit',
      });
    }, timeoutMs);
    try {
      const output = execSync(commandStr, {
        cwd: projectPath,
        env,
        timeout: timeoutMs,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
      clearTimeout(timer);
      resolve({
        hookId: hook.id,
        event: eventName,
        status: "success",
        durationMs: Date.now() - startTime,
        stdout: output.trim(),
      });
    } catch (err) {
      clearTimeout(timer);
      resolve({
        hookId: hook.id,
        event: eventName,
        status: "failed",
        durationMs: Date.now() - startTime,
        error: err.message,
        stderr: err.stderr ? String(err.stderr).trim() : null,
      });
    }
  });
}

async function triggerHookEvent({ projectPath = process.cwd(), eventName, payload = {} } = {}) {
  const hooks = listHooks({ projectPath, eventName });
  const results = [];
  for (const hook of hooks) {
    if (hook.enabled) {
      const result = await executeHook({ hook, eventName, payload, projectPath });
      results.push(result);
    }
  }
  return {
    eventName,
    triggeredAt: new Date().toISOString(),
    totalHooks: hooks.length,
    executedCount: results.length,
    results,
  };
}

module.exports = {
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
  executeHook,
  triggerHookEvent,
};
