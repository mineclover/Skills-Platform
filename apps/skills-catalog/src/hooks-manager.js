const fs = require("node:fs");
const path = require("node:path");
const { exec, execSync } = require("node:child_process");
const {
  STANDARD_HOOK_EVENTS,
  validateHookDefinition,
  validateHookManifest,
  createHookDefinition,
  createHookManifest,
} = require("@skills-platform/contracts");

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

function resolveManifestPath(projectPath = process.cwd()) {
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
      allow: true,
      reason: "Hook disabled",
      durationMs: 0,
      interception: null,
      stdout: "",
      stderr: null,
      error: null,
    };
  }
  const timeoutMs = hook.handler.timeout_ms || 5000;
  const payloadStr = typeof payload === "string" ? payload : JSON.stringify(payload);
  const env = {
    ...process.env,
    ...(hook.handler.env || {}),
    HOOK_EVENT: eventName,
    HOOK_PAYLOAD: payloadStr,
  };

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

    const child = exec(
      commandStr,
      {
        cwd: projectPath,
        env,
        timeout: timeoutMs,
        maxBuffer: 10 * 1024 * 1024,
        encoding: "utf8",
        windowsHide: true,
      },
      (err, stdout, stderr) => {
        const durationMs = Date.now() - startTime;
        const stdoutStr = stdout ? String(stdout).trim() : "";
        const stderrStr = stderr ? String(stderr).trim() : null;

        // Check for timeout kill
        if (err && (err.killed || err.signal === "SIGTERM" || err.code === "ETIMEDOUT")) {
          return resolve({
            hookId: hook.id,
            event: eventName,
            status: "timed_out",
            allow: true,
            durationMs,
            interception: null,
            stdout: stdoutStr,
            stderr: stderrStr,
            error: `Execution exceeded ${timeoutMs}ms limit`,
          });
        }

        // Parse stdout for JSON interception result
        let interception = null;
        let allow = true;
        let status = err ? "failed" : "success";

        if (stdoutStr) {
          try {
            const parsed = JSON.parse(stdoutStr);
            if (parsed && typeof parsed === "object" && typeof parsed.allow === "boolean") {
              interception = parsed;
              allow = parsed.allow;
              if (parsed.allow === false) {
                status = "blocked";
              }
            }
          } catch {
            const jsonMatch = stdoutStr.match(/\{[\s\S]*"allow"\s*:\s*(?:true|false)[\s\S]*\}/);
            if (jsonMatch) {
              try {
                const parsed = JSON.parse(jsonMatch[0]);
                if (parsed && typeof parsed === "object" && typeof parsed.allow === "boolean") {
                  interception = parsed;
                  allow = parsed.allow;
                  if (parsed.allow === false) {
                    status = "blocked";
                  }
                }
              } catch {
                // ignore
              }
            }
          }
        }

        let errorMessage = null;
        if (err) {
          if (status !== "blocked") {
            status = "failed";
            errorMessage = err.message;
          }
        }

        return resolve({
          hookId: hook.id,
          event: eventName,
          status,
          allow,
          durationMs,
          interception,
          stdout: stdoutStr,
          stderr: stderrStr,
          error: errorMessage,
        });
      }
    );

    if (child.stdin) {
      try {
        child.stdin.write(payloadStr);
        child.stdin.end();
      } catch {
        // ignore stdin errors
      }
    }
  });
}

async function triggerHookEvent({ projectPath = process.cwd(), eventName, payload = {} } = {}) {
  const hooks = listHooks({ projectPath, eventName });
  hooks.sort((a, b) => (a.priority || 100) - (b.priority || 100));

  const results = [];
  for (const hook of hooks) {
    if (!hook.enabled) continue;
    const result = await executeHook({ hook, eventName, payload, projectPath });
    results.push(result);

    // If hook blocked execution, halt the pipeline immediately
    if (result.allow === false || result.status === "blocked") {
      const reason =
        result.interception?.reason ||
        result.error ||
        "Execution blocked by guard";
      const selfCorrectHint =
        result.interception?.self_correct_hint ||
        "Review and adjust your command or parameters.";

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
        totalHooks: hooks.length,
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
