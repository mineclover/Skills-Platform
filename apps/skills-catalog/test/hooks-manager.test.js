const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const {
  listHooks,
  registerHook,
  removeHook,
  updateHookStatus,
  compileProviderConfigs,
  executeHook,
  triggerHookEvent,
  loadHookManifest,
  saveHookManifest,
  getHookDiagnostics,
} = require("../src/hooks-manager");

test("Hooks Manager: Initializes default manifest when none exists", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pkg-hooks-"));
  try {
    const manifest = loadHookManifest({ projectPath: tmpDir });
    assert.ok(manifest);
    assert.strictEqual(manifest.schema_version, 1);
    assert.ok(manifest.hooks.length >= 3);
    assert.ok(manifest.hooks.some((h) => h.id === "telemetry-collector"));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("Hooks Manager: Registers, updates, and removes custom hooks", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pkg-hooks-"));
  try {
    // 1. Register new hook
    const newHook = {
      id: "custom-lint",
      name: "Custom Linter",
      event: "pre_tool_use",
      description: "Runs linter before command",
      enabled: true,
      matcher: "run_command",
      handler: {
        type: "command",
        command: "node -e \"console.log('lint ok')\"",
        timeout_ms: 1000,
      },
      priority: 5,
    };
    registerHook({ projectPath: tmpDir, hook: newHook });

    const list1 = listHooks({ projectPath: tmpDir });
    assert.ok(list1.some((h) => h.id === "custom-lint"));

    // 2. Toggle status
    updateHookStatus({ projectPath: tmpDir, hookId: "custom-lint", enabled: false });
    const updated = listHooks({ projectPath: tmpDir }).find((h) => h.id === "custom-lint");
    assert.strictEqual(updated.enabled, false);
    const disabledAgentsConfig = JSON.parse(
      fs.readFileSync(path.join(tmpDir, ".agents", "hooks.json"), "utf8")
    );
    assert.strictEqual(disabledAgentsConfig["custom-lint"], undefined);
    const disabledDiagnostic = getHookDiagnostics({ projectPath: tmpDir })
      .hooks.find((hook) => hook.id === "custom-lint");
    assert.strictEqual(disabledDiagnostic.desiredEnabled, false);
    assert.strictEqual(disabledDiagnostic.providers.antigravity.status, "disabled");

    // 3. Remove hook
    removeHook({ projectPath: tmpDir, hookId: "custom-lint" });
    const list2 = listHooks({ projectPath: tmpDir });
    assert.ok(!list2.some((h) => h.id === "custom-lint"));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("Hooks Manager: Compiles Antigravity and Codex native configs while Claude remains unsupported", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pkg-hooks-"));
  try {
    const sync = compileProviderConfigs({ projectPath: tmpDir });
    const agentsHooksPath = path.join(tmpDir, ".agents", "hooks.json");
    const codexHooksPath = path.join(tmpDir, ".codex", "hooks.json");

    assert.ok(fs.existsSync(agentsHooksPath));
    assert.ok(fs.existsSync(codexHooksPath));
    assert.strictEqual(fs.existsSync(path.join(tmpDir, ".claude", "settings.json")), false);
    assert.strictEqual(sync.claudeHooks, 0);
    assert.strictEqual(sync.providers.claude.status, "unsupported");
    assert.strictEqual(sync.providers.codex.status, "synced");
    assert.strictEqual(sync.providers.codex.supported, true);
    assert.strictEqual(sync.providers.codex.runtimeReady, false);

    const agentsRaw = JSON.parse(fs.readFileSync(agentsHooksPath, "utf8"));
    assert.ok(agentsRaw["telemetry-collector"]);
    assert.ok(agentsRaw["telemetry-collector"].PostToolUse);
    const codexRaw = JSON.parse(fs.readFileSync(codexHooksPath, "utf8"));
    assert.strictEqual(codexRaw.hooks.PreToolUse.length, 1);
    assert.strictEqual(codexRaw.hooks.PostToolUse.length, 1);

  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("Hooks Manager: Executes hooks and triggers events successfully", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pkg-hooks-"));
  try {
    registerHook({
      projectPath: tmpDir,
      hook: {
        id: "test-event-hook",
        name: "Test Event Hook",
        event: "custom:my_event",
        enabled: true,
        handler: {
          type: "command",
          command: "node -e \"console.log('triggered:' + process.env.HOOK_EVENT)\"",
          timeout_ms: 2000,
        },
      },
    });

    const report = await triggerHookEvent({
      projectPath: tmpDir,
      eventName: "custom:my_event",
      payload: { foo: "bar" },
    });

    assert.strictEqual(report.eventName, "custom:my_event");
    assert.strictEqual(report.executedCount, 1);
    assert.strictEqual(report.results[0].status, "success");
    assert.ok(report.results[0].stdout.includes("triggered:custom:my_event"));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("Hooks Manager: Invalid JSON is reported without replacing the manifest", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pkg-hooks-corrupt-"));
  try {
    const hooksDir = path.join(tmpDir, ".skills-platform", "hooks");
    const manifestPath = path.join(hooksDir, "manifest.json");
    fs.mkdirSync(hooksDir, { recursive: true });
    const corruptContent = '{"schema_version":1,"hooks":[';
    fs.writeFileSync(manifestPath, corruptContent, "utf8");

    assert.throws(
      () => loadHookManifest({ projectPath: tmpDir }),
      (error) => error.code === "ERR_HOOK_MANIFEST_INVALID_JSON" && error.manifestPath === manifestPath,
    );
    assert.strictEqual(fs.readFileSync(manifestPath, "utf8"), corruptContent);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("Hooks Manager: Invalid manifest schema is reported without silently enabling defaults", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pkg-hooks-invalid-"));
  try {
    const hooksDir = path.join(tmpDir, ".skills-platform", "hooks");
    const manifestPath = path.join(hooksDir, "manifest.json");
    fs.mkdirSync(hooksDir, { recursive: true });
    const invalidContent = JSON.stringify({ schema_version: 1, updated_at: "invalid", hooks: [] }, null, 2);
    fs.writeFileSync(manifestPath, invalidContent, "utf8");

    assert.throws(
      () => loadHookManifest({ projectPath: tmpDir }),
      (error) => error.code === "ERR_HOOK_MANIFEST_INVALID" && error.issues.some((issue) => issue.field === "updated_at"),
    );
    assert.strictEqual(fs.readFileSync(manifestPath, "utf8"), invalidContent);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("Hooks Manager: Manifest and provider config writes are atomic and leave no temporary files", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pkg-hooks-atomic-"));
  try {
    saveHookManifest({ projectPath: tmpDir, manifest: { hooks: [] } });
    registerHook({
      projectPath: tmpDir,
      sync: false,
      hook: {
        id: "atomic-hook",
        name: "Atomic Hook",
        event: "pre_tool_use",
        enabled: true,
        handler: { type: "command", command: "node -v" },
        providers: ["antigravity"],
      },
    });
    compileProviderConfigs({ projectPath: tmpDir });

    for (const directory of [
      path.join(tmpDir, ".skills-platform", "hooks"),
      path.join(tmpDir, ".agents"),
    ]) {
      assert.deepStrictEqual(fs.readdirSync(directory).filter((name) => name.endsWith(".tmp")), []);
    }
    assert.doesNotThrow(() => JSON.parse(fs.readFileSync(path.join(tmpDir, ".agents", "hooks.json"), "utf8")));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("Hooks Manager: Diagnostics distinguish desired, configured, synced, drift, missing handler, and unsupported provider states", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pkg-hooks-diagnostics-"));
  try {
    saveHookManifest({ projectPath: tmpDir, manifest: { hooks: [] } });
    registerHook({
      projectPath: tmpDir,
      sync: false,
      hook: {
        id: "diagnostic-command",
        name: "Diagnostic Command",
        event: "pre_tool_use",
        enabled: true,
        matcher: "run_command",
        handler: { type: "command", command: "node -v" },
        providers: ["antigravity"],
      },
    });
    registerHook({
      projectPath: tmpDir,
      sync: false,
      hook: {
        id: "missing-script",
        name: "Missing Script",
        event: "post_tool_use",
        enabled: true,
        handler: { type: "script", target: "hooks/missing.js" },
        providers: ["antigravity", "codex"],
      },
    });

    const beforeSync = getHookDiagnostics({ projectPath: tmpDir });
    assert.strictEqual(beforeSync.desired.enabled, 2);
    assert.strictEqual(beforeSync.providers.antigravity.status, "not_configured");
    assert.strictEqual(beforeSync.providers.codex.status, "not_configured");
    assert.strictEqual(beforeSync.providers.codex.supported, true);
    assert.strictEqual(beforeSync.summary.missingHandlers, 1);

    const syncResult = compileProviderConfigs({ projectPath: tmpDir });
    assert.strictEqual(syncResult.providers.antigravity.status, "synced");
    assert.strictEqual(syncResult.providers.codex.status, "synced");
    assert.strictEqual(syncResult.providers.codex.runtimeReady, false);
    assert.strictEqual(syncResult.fullySynced, true);

    const afterSync = getHookDiagnostics({ projectPath: tmpDir });
    assert.strictEqual(afterSync.providers.antigravity.synced, true);
    assert.strictEqual(afterSync.hooks.find((hook) => hook.id === "missing-script").handler.exists, false);
    assert.strictEqual(afterSync.hooks.find((hook) => hook.id === "missing-script").runtimeReady, false);

    const agentsPath = path.join(tmpDir, ".agents", "hooks.json");
    const drifted = JSON.parse(fs.readFileSync(agentsPath, "utf8"));
    drifted["unexpected-hook"] = { PreInvocation: [{ type: "command", command: "node -v", timeout: 1 }] };
    fs.writeFileSync(agentsPath, JSON.stringify(drifted, null, 2), "utf8");
    const withUnmanaged = getHookDiagnostics({ projectPath: tmpDir });
    assert.strictEqual(withUnmanaged.providers.antigravity.status, "synced");
    assert.ok(withUnmanaged.providers.antigravity.unmanagedHookIds.includes("unexpected-hook"));

    drifted["diagnostic-command"].PreToolUse[0].matcher = "view_file";
    fs.writeFileSync(agentsPath, JSON.stringify(drifted, null, 2), "utf8");
    const withDrift = getHookDiagnostics({ projectPath: tmpDir });
    assert.strictEqual(withDrift.providers.antigravity.status, "drift");

    fs.writeFileSync(agentsPath, "{invalid-json", "utf8");
    const withInvalidConfig = getHookDiagnostics({ projectPath: tmpDir });
    assert.strictEqual(withInvalidConfig.providers.antigravity.status, "invalid");
    assert.strictEqual(withInvalidConfig.providers.antigravity.configured, true);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("Hooks Manager: Matcher filtering and equal-priority ordering are deterministic", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pkg-hooks-matcher-"));
  try {
    saveHookManifest({ projectPath: tmpDir, manifest: { hooks: [] } });
    for (const [id, matcher] of [["z-hook", "run_command"], ["a-hook", "run_command"], ["view-hook", "view_file"]]) {
      registerHook({
        projectPath: tmpDir,
        sync: false,
        hook: {
          id,
          name: id,
          event: "pre_tool_use",
          enabled: true,
          matcher,
          priority: 10,
          handler: { type: "command", command: `node -e "console.log('${id}')"` },
          providers: ["antigravity"],
        },
      });
    }

    const report = await triggerHookEvent({
      projectPath: tmpDir,
      eventName: "pre_tool_use",
      payload: { CommandLine: "node -v" },
    });
    assert.strictEqual(report.totalHooks, 3);
    assert.strictEqual(report.matchedHooks, 2);
    assert.deepStrictEqual(report.results.map((result) => result.hookId), ["a-hook", "z-hook"]);

    const batchedReport = await triggerHookEvent({
      projectPath: tmpDir,
      eventName: "pre_tool_use",
      payload: [{ batch: [{ toolCall: { name: "run_command", args: { CommandLine: "node -v" } } }] }],
    });
    assert.strictEqual(batchedReport.matchedHooks, 2);
    assert.deepStrictEqual(batchedReport.results.map((result) => result.hookId), ["a-hook", "z-hook"]);

    compileProviderConfigs({ projectPath: tmpDir });
    const compiled = JSON.parse(fs.readFileSync(path.join(tmpDir, ".agents", "hooks.json"), "utf8"));
    assert.deepStrictEqual(Object.keys(compiled), ["a-hook", "view-hook", "z-hook"]);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("Hooks Manager: Sync preserves unmanaged provider entries and removes only owned entries", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pkg-hooks-managed-merge-"));
  try {
    saveHookManifest({ projectPath: tmpDir, manifest: { hooks: [] } });
    const agentsDir = path.join(tmpDir, ".agents");
    const agentsPath = path.join(agentsDir, "hooks.json");
    fs.mkdirSync(agentsDir, { recursive: true });
    const unmanagedEntry = {
      enabled: false,
      PreInvocation: [{ type: "command", command: "node -e \"console.log('user')\"", timeout: 5 }],
    };
    fs.writeFileSync(agentsPath, JSON.stringify({ "user-owned-hook": unmanagedEntry }, null, 2), "utf8");

    registerHook({
      projectPath: tmpDir,
      hook: {
        id: "platform-owned-hook",
        name: "Platform Owned Hook",
        event: "pre_tool_use",
        enabled: true,
        matcher: "run_command",
        handler: { type: "command", command: "node -v" },
        providers: ["antigravity"],
      },
    });
    let config = JSON.parse(fs.readFileSync(agentsPath, "utf8"));
    assert.deepStrictEqual(config["user-owned-hook"], unmanagedEntry);
    assert.ok(config["platform-owned-hook"]);
    let diagnostics = getHookDiagnostics({ projectPath: tmpDir });
    assert.strictEqual(diagnostics.providers.antigravity.synced, true);
    assert.deepStrictEqual(diagnostics.providers.antigravity.unmanagedHookIds, ["user-owned-hook"]);

    updateHookStatus({ projectPath: tmpDir, hookId: "platform-owned-hook", enabled: false });
    config = JSON.parse(fs.readFileSync(agentsPath, "utf8"));
    assert.deepStrictEqual(config["user-owned-hook"], unmanagedEntry);
    assert.strictEqual(config["platform-owned-hook"], undefined);

    updateHookStatus({ projectPath: tmpDir, hookId: "platform-owned-hook", enabled: true });
    removeHook({ projectPath: tmpDir, hookId: "platform-owned-hook" });
    config = JSON.parse(fs.readFileSync(agentsPath, "utf8"));
    assert.deepStrictEqual(config, { "user-owned-hook": unmanagedEntry });

    const corruptConfig = "{not-json";
    fs.writeFileSync(agentsPath, corruptConfig, "utf8");
    assert.throws(() => compileProviderConfigs({ projectPath: tmpDir }), /refusing to overwrite/i);
    assert.strictEqual(fs.readFileSync(agentsPath, "utf8"), corruptConfig);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("Hooks Manager: Unsupported Claude sync never mutates existing Claude settings", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pkg-hooks-claude-unsupported-"));
  try {
    saveHookManifest({ projectPath: tmpDir, manifest: { hooks: [] } });
    const claudeDir = path.join(tmpDir, ".claude");
    const settingsPath = path.join(claudeDir, "settings.json");
    fs.mkdirSync(claudeDir, { recursive: true });
    const originalSettings = '{\n  "permissions": { "allow": ["Read"] }\n}\n';
    fs.writeFileSync(settingsPath, originalSettings, "utf8");
    registerHook({
      projectPath: tmpDir,
      sync: false,
      hook: {
        id: "claude-requested-hook",
        name: "Claude Requested Hook",
        event: "pre_tool_use",
        enabled: true,
        handler: { type: "command", command: "node -v" },
        providers: ["claude"],
      },
    });

    const sync = compileProviderConfigs({ projectPath: tmpDir });
    assert.strictEqual(sync.providers.claude.supported, false);
    assert.strictEqual(sync.providers.claude.status, "unsupported");
    assert.strictEqual(sync.claudeHooks, 0);
    assert.strictEqual(fs.readFileSync(settingsPath, "utf8"), originalSettings);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("Hooks Manager: Script execution uses a safe argv path and explicit failure policies", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pkg hooks script "));
  try {
    const scriptDir = path.join(tmpDir, "folder with spaces");
    const scriptPath = path.join(scriptDir, "guard script.js");
    fs.mkdirSync(scriptDir, { recursive: true });
    fs.writeFileSync(scriptPath, "process.stdout.write(JSON.stringify({allow:false, reason:'safe argv'}));\n", "utf8");

    const blocked = await executeHook({
      projectPath: tmpDir,
      eventName: "pre_tool_use",
      hook: {
        id: "safe-script",
        name: "Safe Script",
        event: "pre_tool_use",
        enabled: true,
        handler: { type: "script", target: scriptPath },
      },
    });
    assert.strictEqual(blocked.status, "blocked");
    assert.strictEqual(blocked.interception.reason, "safe argv");

    for (const [failurePolicy, expectedAllow] of [["open", true], ["closed", false]]) {
      const result = await executeHook({
        projectPath: tmpDir,
        eventName: "pre_tool_use",
        hook: {
          id: `missing-${failurePolicy}`,
          name: `Missing ${failurePolicy}`,
          event: "pre_tool_use",
          enabled: true,
          failure_policy: failurePolicy,
          handler: { type: "script", target: "does-not-exist.js", timeout_ms: 1000 },
        },
      });
      assert.strictEqual(result.status, "failed");
      assert.strictEqual(result.allow, expectedAllow);
      assert.strictEqual(result.failurePolicy, failurePolicy);
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("Hooks Manager: Unsupported handlers never report successful execution or compile to echo", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pkg-hooks-unsupported-"));
  try {
    const hook = {
      id: "webhook-handler",
      name: "Webhook Handler",
      event: "post_tool_use",
      enabled: true,
      failure_policy: "closed",
      handler: { type: "webhook", url: "https://example.test/hook" },
      providers: ["antigravity"],
    };
    saveHookManifest({ projectPath: tmpDir, manifest: { hooks: [hook] } });
    const execution = await executeHook({ hook, eventName: "post_tool_use", projectPath: tmpDir });
    assert.strictEqual(execution.status, "failed");
    assert.strictEqual(execution.allow, false);
    assert.match(execution.error, /Unsupported hook handler type/);

    const sync = compileProviderConfigs({ projectPath: tmpDir });
    assert.strictEqual(sync.providers.antigravity.status, "invalid");
    assert.strictEqual(sync.ok, false);
    const generated = fs.readFileSync(path.join(tmpDir, ".agents", "hooks.json"), "utf8");
    assert.doesNotMatch(generated, /echo ok/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
