const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const {
  compileProviderConfigs,
  detectCodexCapabilities,
  getHookDiagnostics,
  loadHookManifest,
  removeHook,
  saveHookManifest,
} = require("../src/hooks-manager");

function makeProject(prefix = "codex hooks ") {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function commandHook(id, event, overrides = {}) {
  return {
    id,
    name: id,
    event,
    enabled: true,
    matcher: null,
    priority: 10,
    providers: ["codex"],
    failure_policy: "open",
    handler: { type: "command", command: "node -e \"process.exit(0)\"", timeout_ms: 1200 },
    ...overrides,
  };
}

function capabilities(version = "0.144.4", overrides = {}) {
  return {
    installed: true,
    version,
    hooksFeature: { found: true, stage: "stable", enabled: true },
    strictConfig: { supported: true, parsed: true, status: "valid", error: null },
    featuresList: { available: true, error: null },
    ...overrides,
  };
}

test("Codex compiler emits one absolute dispatcher per native event and reports unsupported mappings", () => {
  const projectPath = makeProject();
  try {
    saveHookManifest({
      projectPath,
      manifest: {
        hooks: [
          commandHook("pre-first", "pre_tool_use", { priority: 1 }),
          commandHook("pre-closed", "pre_tool_use", { priority: 2, failure_policy: "closed" }),
          commandHook("test-event", "on_test_run", { priority: 3 }),
          commandHook("post", "post_tool_use"),
          commandHook("start", "session_start"),
          commandHook("end", "session_stop"),
          commandHook("interrupt", "interrupt"),
          commandHook("recipe", "on_recipe_apply"),
        ],
      },
    });

    const result = compileProviderConfigs({
      projectPath,
      codexCapabilities: capabilities("0.144.4"),
    });
    const config = JSON.parse(fs.readFileSync(path.join(projectPath, ".codex", "hooks.json"), "utf8"));
    assert.deepEqual(Object.keys(config.hooks), ["PostToolUse", "PreToolUse", "SessionStart"]);
    assert.equal(config.hooks.PreToolUse.length, 1);
    assert.equal(config.hooks.PreToolUse[0].hooks.length, 1);

    const dispatcher = config.hooks.PreToolUse[0].hooks[0];
    assert.equal(dispatcher.type, "command");
    assert.match(dispatcher.command, new RegExp(process.execPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(dispatcher.command, /codex-hook-runner\.js/);
    assert.match(dispatcher.command, /--fail-closed/);
    assert.match(dispatcher.command, /--event' 'PreToolUse/);
    assert.match(dispatcher.commandWindows, /^powershell\.exe /);
    assert.match(dispatcher.commandWindows, /--fail-closed/);
    assert.equal(dispatcher.timeout, 4);

    assert.equal(result.providers.codex.supported, true);
    assert.equal(result.providers.codex.synced, false);
    assert.equal(result.providers.codex.runtimeReady, false);
    assert.equal(result.codexHooks, 3);
    assert.ok(result.issues.some((issue) => issue.hookId === "end" && issue.code === "unsupported_event_capability"));
    assert.ok(result.issues.some((issue) => issue.hookId === "interrupt" && issue.code === "unsupported_event_capability"));
    assert.ok(result.issues.some((issue) => issue.hookId === "recipe" && issue.code === "unsupported_event"));

    const ownership = JSON.parse(
      fs.readFileSync(path.join(projectPath, ".skills-platform", "hooks", "provider-sync-state.json"), "utf8")
    );
    assert.deepEqual(ownership.providers.codex.active_hook_ids, [
      "skills-platform:PostToolUse",
      "skills-platform:PreToolUse",
      "skills-platform:SessionStart",
    ]);
    assert.ok(ownership.providers.codex.owned_hook_digests["skills-platform:PreToolUse"]);
    assert.equal(ownership.providers.codex.owned_hook_records["skills-platform:PreToolUse"].event, "PreToolUse");

    if (process.platform !== "win32") {
      const execution = spawnSync(dispatcher.command, {
        cwd: projectPath,
        shell: true,
        encoding: "utf8",
        input: JSON.stringify({
          cwd: projectPath,
          hook_event_name: "PreToolUse",
          tool_name: "Bash",
          tool_input: { command: "echo safe" },
        }),
      });
      assert.equal(execution.status, 0, execution.stderr);
    }
  } finally {
    fs.rmSync(projectPath, { recursive: true, force: true });
  }
});

test("Codex merge preserves user groups and handlers, is idempotent, and removes only its dispatcher", () => {
  const projectPath = makeProject();
  try {
    saveHookManifest({
      projectPath,
      manifest: { hooks: [commandHook("platform-pre", "pre_tool_use")] },
    });
    const codexPath = path.join(projectPath, ".codex", "hooks.json");
    fs.mkdirSync(path.dirname(codexPath), { recursive: true });
    const userConfig = {
      description: "User description must survive",
      hooks: {
        PreToolUse: [{
          matcher: "Bash",
          hooks: [{
            type: "command",
            command: "user-pre",
            async: true,
            additionalContextLimit: 5000,
          }],
        }],
        PostToolUse: [{
          matcher: "Edit|Write",
          hooks: [{
            type: "mcp_tool",
            server: "scanner",
            tool: "scan_patch",
            input: { patch: "${tool_input.command}" },
            timeout: 30,
          }],
        }],
      },
    };
    fs.writeFileSync(codexPath, `${JSON.stringify(userConfig, null, 2)}\n`, "utf8");

    compileProviderConfigs({ projectPath, codexCapabilities: capabilities() });
    const firstBytes = fs.readFileSync(codexPath, "utf8");
    compileProviderConfigs({ projectPath, codexCapabilities: capabilities() });
    assert.equal(fs.readFileSync(codexPath, "utf8"), firstBytes);

    let merged = JSON.parse(firstBytes);
    assert.equal(merged.description, userConfig.description);
    assert.deepEqual(merged.hooks.PreToolUse[0], userConfig.hooks.PreToolUse[0]);
    assert.deepEqual(merged.hooks.PostToolUse, userConfig.hooks.PostToolUse);
    assert.equal(merged.hooks.PreToolUse.length, 2);

    const manifest = loadHookManifest({ projectPath });
    manifest.hooks[0].enabled = false;
    saveHookManifest({ projectPath, manifest });
    compileProviderConfigs({ projectPath, codexCapabilities: capabilities() });
    merged = JSON.parse(fs.readFileSync(codexPath, "utf8"));
    assert.deepEqual(merged.hooks.PreToolUse, userConfig.hooks.PreToolUse);
    assert.deepEqual(merged.hooks.PostToolUse, userConfig.hooks.PostToolUse);

    removeHook({ projectPath, hookId: "platform-pre", sync: false });
    compileProviderConfigs({ projectPath, codexCapabilities: capabilities() });
    merged = JSON.parse(fs.readFileSync(codexPath, "utf8"));
    assert.deepEqual(merged, userConfig);
  } finally {
    fs.rmSync(projectPath, { recursive: true, force: true });
  }
});

test("Codex compiler fails closed for malformed config, corrupt ownership state, and marker tampering", () => {
  const projectPath = makeProject();
  try {
    saveHookManifest({
      projectPath,
      manifest: { hooks: [commandHook("platform-pre", "pre_tool_use")] },
    });
    const codexPath = path.join(projectPath, ".codex", "hooks.json");
    fs.mkdirSync(path.dirname(codexPath), { recursive: true });
    fs.writeFileSync(codexPath, "{not-json", "utf8");
    assert.throws(
      () => compileProviderConfigs({ projectPath, codexCapabilities: capabilities() }),
      /Existing Codex hooks config is invalid/,
    );
    assert.equal(fs.readFileSync(codexPath, "utf8"), "{not-json");

    fs.rmSync(codexPath, { force: true });
    compileProviderConfigs({ projectPath, codexCapabilities: capabilities() });
    const tampered = JSON.parse(fs.readFileSync(codexPath, "utf8"));
    delete tampered.hooks.PreToolUse[0].hooks[0].statusMessage;
    fs.writeFileSync(codexPath, `${JSON.stringify(tampered, null, 2)}\n`, "utf8");
    const tamperedBytes = fs.readFileSync(codexPath, "utf8");
    assert.throws(
      () => compileProviderConfigs({ projectPath, codexCapabilities: capabilities() }),
      /changed outside Skills Platform/,
    );
    assert.equal(fs.readFileSync(codexPath, "utf8"), tamperedBytes);

    const statePath = path.join(projectPath, ".skills-platform", "hooks", "provider-sync-state.json");
    fs.writeFileSync(statePath, JSON.stringify({ schema_version: 1, providers: { antigravity: {} } }), "utf8");
    assert.throws(
      () => compileProviderConfigs({ projectPath, codexCapabilities: capabilities() }),
      /ownership state is invalid/,
    );
    assert.equal(fs.readFileSync(codexPath, "utf8"), tamperedBytes);
  } finally {
    fs.rmSync(projectPath, { recursive: true, force: true });
  }
});

test("Codex capability table gates SessionEnd, Interrupt, async, and MCP support by version", () => {
  const projectPath = makeProject();
  try {
    saveHookManifest({
      projectPath,
      manifest: {
        hooks: [
          commandHook("start", "session_start"),
          commandHook("end", "session_stop"),
          commandHook("interrupt", "interrupt"),
        ],
      },
    });

    let result = compileProviderConfigs({ projectPath, codexCapabilities: capabilities("0.144.4") });
    assert.deepEqual(result.providers.codex.capability.supportedEvents.includes("SessionEnd"), false);
    assert.equal(result.providers.codex.capability.asyncSupported, false);
    assert.equal(result.providers.codex.capability.mcpToolSupported, false);

    result = compileProviderConfigs({ projectPath, codexCapabilities: capabilities("0.148.0") });
    assert.equal(result.providers.codex.capability.supportedEvents.includes("SessionEnd"), true);
    assert.equal(result.providers.codex.capability.supportedEvents.includes("Interrupt"), false);
    assert.equal(result.providers.codex.capability.asyncSupported, true);
    assert.equal(result.providers.codex.capability.mcpToolSupported, true);
    let config = JSON.parse(fs.readFileSync(path.join(projectPath, ".codex", "hooks.json"), "utf8"));
    assert.ok(config.hooks.SessionEnd);
    assert.equal(config.hooks.SessionEnd[0].hooks[0].timeout, 2);
    assert.equal(config.hooks.Interrupt, undefined);

    result = compileProviderConfigs({ projectPath, codexCapabilities: capabilities("0.153.0") });
    assert.equal(result.providers.codex.capability.supportedEvents.includes("Interrupt"), true);
    config = JSON.parse(fs.readFileSync(path.join(projectPath, ".codex", "hooks.json"), "utf8"));
    assert.ok(config.hooks.Interrupt);
    assert.equal(config.hooks.Interrupt[0].hooks[0].timeout, 2);

    result = compileProviderConfigs({ projectPath, codexCapabilities: capabilities("0.143.9") });
    assert.equal(result.providers.codex.capability.versionSupported, false);
    assert.ok(result.issues.every((issue) => issue.provider !== "codex" || issue.code === "unsupported_codex_version"));
  } finally {
    fs.rmSync(projectPath, { recursive: true, force: true });
  }
});

test("Codex diagnostics separate config sync, feature state, CLI capability, and unobserved trust", () => {
  const projectPath = makeProject();
  try {
    saveHookManifest({
      projectPath,
      manifest: { hooks: [commandHook("pre", "pre_tool_use")] },
    });
    const disabledFeature = capabilities("0.144.4", {
      hooksFeature: { found: true, stage: "stable", enabled: false },
    });
    compileProviderConfigs({ projectPath, codexCapabilities: disabledFeature });
    const diagnostics = getHookDiagnostics({ projectPath, codexCapabilities: disabledFeature });
    const codex = diagnostics.providers.codex;
    assert.equal(codex.status, "synced");
    assert.equal(codex.configParse.jsonParsed, true);
    assert.equal(codex.configParse.strictValid, true);
    assert.equal(codex.capability.version, "0.144.4");
    assert.equal(codex.feature.enabled, false);
    assert.deepEqual(codex.trust, { observed: false, status: "unknown" });
    assert.equal(codex.runtimeReady, false);
    assert.ok(codex.runtimeBlockers.includes("hooks_feature_not_enabled_or_unknown"));
    assert.ok(codex.runtimeBlockers.includes("hook_trust_unknown"));
    assert.equal(diagnostics.hooks[0].providers.codex.synced, true);
    assert.equal(diagnostics.hooks[0].providers.codex.runtimeReady, false);
    assert.equal(diagnostics.hooks[0].runtimeReady, false);
  } finally {
    fs.rmSync(projectPath, { recursive: true, force: true });
  }
});

test("Codex CLI probes use argv execution and report strict-config support separately", {
  skip: process.platform === "win32",
}, () => {
  const projectPath = makeProject("codex probe target ");
  const toolDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex probe bin "));
  try {
    const fakeCodex = path.join(toolDir, "codex fake");
    fs.writeFileSync(fakeCodex, `#!/bin/sh
if [ "$1" = "--version" ]; then
  echo "codex-cli 0.153.0"
  exit 0
fi
if [ "$1" = "--strict-config" ]; then
  echo '\`--strict-config\` is not supported for \`codex features\`' >&2
  exit 2
fi
if [ "$1" = "features" ] && [ "$2" = "list" ]; then
  echo "hooks stable false"
  exit 0
fi
exit 3
`, "utf8");
    fs.chmodSync(fakeCodex, 0o755);

    const detected = detectCodexCapabilities({ command: fakeCodex, projectPath });
    assert.equal(detected.installed, true);
    assert.equal(detected.version, "0.153.0");
    assert.equal(detected.strictConfig.supported, false);
    assert.equal(detected.strictConfig.parsed, null);
    assert.equal(detected.strictConfig.status, "unsupported");
    assert.equal(detected.featuresList.available, true);
    assert.equal(detected.hooksFeature.enabled, false);
    assert.ok(detected.supportedEvents.includes("SessionEnd"));
    assert.ok(detected.supportedEvents.includes("Interrupt"));
  } finally {
    fs.rmSync(projectPath, { recursive: true, force: true });
    fs.rmSync(toolDir, { recursive: true, force: true });
  }
});
