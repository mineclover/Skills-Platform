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

    // 3. Remove hook
    removeHook({ projectPath: tmpDir, hookId: "custom-lint" });
    const list2 = listHooks({ projectPath: tmpDir });
    assert.ok(!list2.some((h) => h.id === "custom-lint"));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("Hooks Manager: Compiles .agents/hooks.json and .claude/hooks.json sync", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pkg-hooks-"));
  try {
    compileProviderConfigs({ projectPath: tmpDir });
    const agentsHooksPath = path.join(tmpDir, ".agents", "hooks.json");
    const claudeHooksPath = path.join(tmpDir, ".claude", "hooks.json");

    assert.ok(fs.existsSync(agentsHooksPath));
    assert.ok(fs.existsSync(claudeHooksPath));

    const agentsRaw = JSON.parse(fs.readFileSync(agentsHooksPath, "utf8"));
    assert.ok(agentsRaw["telemetry-collector"]);
    assert.ok(agentsRaw["telemetry-collector"].PostToolUse);

    const claudeRaw = JSON.parse(fs.readFileSync(claudeHooksPath, "utf8"));
    assert.strictEqual(claudeRaw.version, 1);
    assert.ok(claudeRaw.hooks.some((h) => h.id === "telemetry-collector"));
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
