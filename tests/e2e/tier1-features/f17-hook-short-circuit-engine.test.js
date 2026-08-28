const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs/promises");
const os = require("node:os");

const ROOT = path.resolve(__dirname, "../../..");
const { triggerHookEvent, registerHook } = require(path.join(
  ROOT,
  "apps/skills-catalog/src/hooks-manager"
));

test("Tier 1 - F17.1: triggerHookEvent short-circuits execution pipeline when pre_tool_use is blocked", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "sc-e2e-"));

  registerHook({
    projectPath: tempDir,
    hook: {
      id: "secret-leak-guard",
      name: "Secret Leak Guard",
      event: "pre_tool_use",
      enabled: true,
      handler: {
        type: "script",
        target: path.join(ROOT, ".skills-platform/hooks/guards/secret-leak-guard.js"),
        timeout_ms: 5000,
      },
      priority: 5,
    },
    sync: false,
  });

  registerHook({
    projectPath: tempDir,
    hook: {
      id: "late-hook",
      name: "Late Hook",
      event: "pre_tool_use",
      enabled: true,
      handler: {
        type: "command",
        command: "node -e 'console.log(\"should not run\")'",
        timeout_ms: 2000,
      },
      priority: 99,
    },
    sync: false,
  });

  const res = await triggerHookEvent({
    projectPath: tempDir,
    eventName: "pre_tool_use",
    payload: {
      tool: "run_command",
      CommandLine: "echo sk-proj-1234567890abcdef1234567890",
    },
  });

  assert.equal(res.allow, false);
  assert.equal(res.halted, true);
  assert.equal(res.blockedBy, "secret-leak-guard");
  assert.equal(res.executedCount, 1);
  assert.ok(res.reason);
  assert.ok(res.self_correct_hint);

  await fs.rm(tempDir, { recursive: true, force: true });
});

test("Tier 1 - F17.2: triggerHookEvent executes full pipeline when payload is benign", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "sc-e2e-pass-"));

  registerHook({
    projectPath: tempDir,
    hook: {
      id: "secret-leak-guard",
      name: "Secret Leak Guard",
      event: "pre_tool_use",
      enabled: true,
      handler: {
        type: "script",
        target: path.join(ROOT, ".skills-platform/hooks/guards/secret-leak-guard.js"),
        timeout_ms: 5000,
      },
      priority: 5,
    },
    sync: false,
  });

  const res = await triggerHookEvent({
    projectPath: tempDir,
    eventName: "pre_tool_use",
    payload: {
      tool: "run_command",
      CommandLine: "echo hello world",
    },
  });

  assert.equal(res.allow, true);
  assert.equal(res.halted, false);
  assert.ok(res.executedCount >= 1);

  await fs.rm(tempDir, { recursive: true, force: true });
});
