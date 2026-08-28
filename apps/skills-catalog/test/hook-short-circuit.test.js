const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const {
  DEFAULT_HOOKS,
  loadHookManifest,
  saveHookManifest,
  listHooks,
  registerHook,
  removeHook,
  updateHookStatus,
  compileProviderConfigs,
  executeHook,
  triggerHookEvent,
} = require("../src/hooks-manager");

const PROJECT_ROOT = path.resolve(__dirname, "../../..");

// Helper to create a temporary test project directory with empty or initialized manifest
function createTempProject({ includeGuards = false, emptyManifest = true } = {}) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sp-hook-test-"));
  if (includeGuards) {
    const srcGuardsDir = path.resolve(PROJECT_ROOT, ".skills-platform", "hooks");
    const destGuardsDir = path.resolve(tmpDir, ".skills-platform", "hooks");
    if (fs.existsSync(srcGuardsDir)) {
      fs.cpSync(srcGuardsDir, destGuardsDir, { recursive: true });
    }
  }
  if (emptyManifest) {
    saveHookManifest({ projectPath: tmpDir, manifest: { hooks: [] } });
  }
  return tmpDir;
}

// Helper to clean up temporary project directory
function cleanupTempProject(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // ignore cleanup error
  }
}

test("Hook Subsystem: DEFAULT_HOOKS contains all 5 built-in guards with correct configuration", () => {
  const expectedGuards = [
    {
      id: "secret-leak-guard",
      event: "pre_tool_use",
      priority: 5,
      matcher: "run_command|write_to_file|replace_file_content|send_message|view_file",
      target: ".skills-platform/hooks/guards/secret-leak-guard.js",
    },
    {
      id: "destructive-command-blocker",
      event: "pre_tool_use",
      priority: 10,
      matcher: "run_command",
      target: ".skills-platform/hooks/guards/destructive-command-blocker.js",
    },
    {
      id: "context-budget-guard",
      event: "pre_tool_use",
      priority: 15,
      matcher: "write_to_file|replace_file_content|run_command|view_file",
      target: ".skills-platform/hooks/guards/context-budget-guard.js",
    },
    {
      id: "scope-boundary-enforcer",
      event: "post_tool_use",
      priority: 20,
      matcher: "write_to_file|replace_file_content",
      target: ".skills-platform/hooks/guards/scope-boundary-enforcer.js",
    },
    {
      id: "subagent-recursion-limiter",
      event: "pre_tool_use",
      priority: 25,
      matcher: "invoke_subagent|send_message",
      target: ".skills-platform/hooks/guards/subagent-recursion-limiter.js",
    },
  ];

  for (const exp of expectedGuards) {
    const found = DEFAULT_HOOKS.find((h) => h.id === exp.id);
    assert.ok(found, `Guard ${exp.id} should be present in DEFAULT_HOOKS`);
    assert.equal(found.event, exp.event, `Guard ${exp.id} event should match`);
    assert.equal(found.priority, exp.priority, `Guard ${exp.id} priority should match`);
    assert.equal(found.matcher, exp.matcher, `Guard ${exp.id} matcher should match`);
    assert.equal(found.handler.target, exp.target, `Guard ${exp.id} target should match`);
    assert.equal(found.enabled, true, `Guard ${exp.id} should be enabled by default`);
  }
});

test("Short-Circuit Engine: Priority ascending execution order (priority 5 before 10 before 30)", async () => {
  const tmpDir = createTempProject({ emptyManifest: true });
  try {
    const logFile = path.join(tmpDir, "execution_order.log");

    // Register hooks with out-of-order priorities
    registerHook({
      projectPath: tmpDir,
      hook: {
        id: "hook-priority-30",
        name: "Priority 30 Hook",
        event: "pre_tool_use",
        enabled: true,
        priority: 30,
        handler: {
          type: "command",
          command: `node -e "const fs = require('fs'); fs.appendFileSync('${logFile.replace(/\\/g, "/")}', '30\\n'); console.log(JSON.stringify({ allow: true }))"`,
        },
      },
    });

    registerHook({
      projectPath: tmpDir,
      hook: {
        id: "hook-priority-5",
        name: "Priority 5 Hook",
        event: "pre_tool_use",
        enabled: true,
        priority: 5,
        handler: {
          type: "command",
          command: `node -e "const fs = require('fs'); fs.appendFileSync('${logFile.replace(/\\/g, "/")}', '5\\n'); console.log(JSON.stringify({ allow: true }))"`,
        },
      },
    });

    registerHook({
      projectPath: tmpDir,
      hook: {
        id: "hook-priority-10",
        name: "Priority 10 Hook",
        event: "pre_tool_use",
        enabled: true,
        priority: 10,
        handler: {
          type: "command",
          command: `node -e "const fs = require('fs'); fs.appendFileSync('${logFile.replace(/\\/g, "/")}', '10\\n'); console.log(JSON.stringify({ allow: true }))"`,
        },
      },
    });

    const report = await triggerHookEvent({
      projectPath: tmpDir,
      eventName: "pre_tool_use",
      payload: { action: "test" },
    });

    assert.equal(report.allow, true);
    assert.equal(report.halted, false);
    assert.equal(report.executedCount, 3);
    assert.equal(report.results[0].hookId, "hook-priority-5");
    assert.equal(report.results[1].hookId, "hook-priority-10");
    assert.equal(report.results[2].hookId, "hook-priority-30");

    const orderContent = fs.readFileSync(logFile, "utf8").trim().split(/\r?\n/);
    assert.deepEqual(orderContent, ["5", "10", "30"]);
  } finally {
    cleanupTempProject(tmpDir);
  }
});

test("Short-Circuit Engine: Halts pipeline when priority 5 blocks (priority 10 must NOT execute)", async () => {
  const tmpDir = createTempProject({ emptyManifest: true });
  try {
    const executedFile = path.join(tmpDir, "priority_10_marker.txt");

    // Hook at priority 5 that blocks
    registerHook({
      projectPath: tmpDir,
      hook: {
        id: "guard-p5-blocker",
        name: "Priority 5 Blocking Guard",
        event: "pre_tool_use",
        enabled: true,
        priority: 5,
        handler: {
          type: "command",
          command: 'node -e "console.log(JSON.stringify({ allow: false, reason: \'Secret leak detected\', self_correct_hint: \'Redact API key\' }))"',
        },
      },
    });

    // Hook at priority 10 that must NOT execute
    registerHook({
      projectPath: tmpDir,
      hook: {
        id: "guard-p10-subsequent",
        name: "Priority 10 Subsequent Guard",
        event: "pre_tool_use",
        enabled: true,
        priority: 10,
        handler: {
          type: "command",
          command: `node -e "const fs = require('fs'); fs.writeFileSync('${executedFile.replace(/\\/g, "/")}', 'EXECUTED'); console.log(JSON.stringify({ allow: true }))"`,
        },
      },
    });

    const report = await triggerHookEvent({
      projectPath: tmpDir,
      eventName: "pre_tool_use",
      payload: { CommandLine: "export KEY=secret" },
    });

    assert.equal(report.allow, false);
    assert.equal(report.halted, true);
    assert.equal(report.blockedBy, "guard-p5-blocker");
    assert.equal(report.reason, "Secret leak detected");
    assert.equal(report.self_correct_hint, "Redact API key");
    assert.equal(report.executedCount, 1);
    assert.equal(report.results.length, 1);
    assert.equal(report.results[0].hookId, "guard-p5-blocker");
    assert.equal(report.results[0].status, "blocked");
    assert.equal(report.results[0].allow, false);

    // Verify priority 10 guard never ran
    assert.equal(fs.existsSync(executedFile), false, "Priority 10 guard should NOT have been executed");
  } finally {
    cleanupTempProject(tmpDir);
  }
});

test("Short-Circuit Engine: Middle pipeline blocking (p5 passes, p15 blocks, p25 skipped)", async () => {
  const tmpDir = createTempProject({ emptyManifest: true });
  try {
    const logFile = path.join(tmpDir, "pipeline.log");

    registerHook({
      projectPath: tmpDir,
      hook: {
        id: "hook-p5",
        name: "P5 Pass",
        event: "pre_tool_use",
        enabled: true,
        priority: 5,
        handler: {
          type: "command",
          command: `node -e "const fs = require('fs'); fs.appendFileSync('${logFile.replace(/\\/g, "/")}', 'p5\\n'); console.log(JSON.stringify({ allow: true }))"`,
        },
      },
    });

    registerHook({
      projectPath: tmpDir,
      hook: {
        id: "hook-p15",
        name: "P15 Block",
        event: "pre_tool_use",
        enabled: true,
        priority: 15,
        handler: {
          type: "command",
          command: `node -e "const fs = require('fs'); fs.appendFileSync('${logFile.replace(/\\/g, "/")}', 'p15\\n'); console.log(JSON.stringify({ allow: false, reason: 'Budget limit exceeded', self_correct_hint: 'Reduce payload' }))"`,
        },
      },
    });

    registerHook({
      projectPath: tmpDir,
      hook: {
        id: "hook-p25",
        name: "P25 Should Skip",
        event: "pre_tool_use",
        enabled: true,
        priority: 25,
        handler: {
          type: "command",
          command: `node -e "const fs = require('fs'); fs.appendFileSync('${logFile.replace(/\\/g, "/")}', 'p25\\n'); console.log(JSON.stringify({ allow: true }))"`,
        },
      },
    });

    const report = await triggerHookEvent({
      projectPath: tmpDir,
      eventName: "pre_tool_use",
      payload: { data: "large" },
    });

    assert.equal(report.allow, false);
    assert.equal(report.halted, true);
    assert.equal(report.blockedBy, "hook-p15");
    assert.equal(report.reason, "Budget limit exceeded");
    assert.equal(report.self_correct_hint, "Reduce payload");
    assert.equal(report.executedCount, 2);
    assert.equal(report.results.length, 2);
    assert.equal(report.results[0].hookId, "hook-p5");
    assert.equal(report.results[0].status, "success");
    assert.equal(report.results[1].hookId, "hook-p15");
    assert.equal(report.results[1].status, "blocked");

    const logs = fs.readFileSync(logFile, "utf8").trim().split(/\r?\n/);
    assert.deepEqual(logs, ["p5", "p15"]);
  } finally {
    cleanupTempProject(tmpDir);
  }
});

test("Short-Circuit Engine: Full pipeline execution when all hooks allow", async () => {
  const tmpDir = createTempProject({ emptyManifest: true });
  try {
    registerHook({
      projectPath: tmpDir,
      hook: {
        id: "guard-1",
        name: "Guard 1",
        event: "pre_tool_use",
        enabled: true,
        priority: 10,
        handler: {
          type: "command",
          command: 'node -e "console.log(JSON.stringify({ allow: true, details: { check1: \'ok\' } }))"',
        },
      },
    });

    registerHook({
      projectPath: tmpDir,
      hook: {
        id: "guard-2",
        name: "Guard 2",
        event: "pre_tool_use",
        enabled: true,
        priority: 20,
        handler: {
          type: "command",
          command: 'node -e "console.log(JSON.stringify({ allow: true, details: { check2: \'ok\' } }))"',
        },
      },
    });

    const report = await triggerHookEvent({
      projectPath: tmpDir,
      eventName: "pre_tool_use",
      payload: { action: "safe_read" },
    });

    assert.equal(report.allow, true);
    assert.equal(report.halted, false);
    assert.equal(report.executedCount, 2);
    assert.equal(report.results.length, 2);
    assert.equal(report.results[0].status, "success");
    assert.equal(report.results[0].allow, true);
    assert.equal(report.results[1].status, "success");
    assert.equal(report.results[1].allow, true);
  } finally {
    cleanupTempProject(tmpDir);
  }
});

test("Short-Circuit Engine: Timeout handling and clean child process termination", async () => {
  const tmpDir = createTempProject({ emptyManifest: true });
  try {
    const hook = {
      id: "slow-hook",
      name: "Slow Hanging Hook",
      event: "pre_tool_use",
      enabled: true,
      priority: 10,
      handler: {
        type: "command",
        command: 'node -e "setTimeout(() => console.log(\'finished late\'), 5000)"',
        timeout_ms: 400,
      },
    };

    const startTime = Date.now();
    const result = await executeHook({
      hook,
      eventName: "pre_tool_use",
      payload: {},
      projectPath: tmpDir,
    });
    const elapsed = Date.now() - startTime;

    assert.equal(result.status, "timed_out");
    assert.ok(result.error.includes("Execution exceeded 400ms limit"));
    assert.ok(elapsed >= 350, `Expected elapsed time >= 350ms, got ${elapsed}ms`);
    assert.ok(elapsed < 4000, `Expected elapsed time < 4000ms, got ${elapsed}ms`);
  } finally {
    cleanupTempProject(tmpDir);
  }
});

test("Short-Circuit Engine: Disabled hook handling", async () => {
  const tmpDir = createTempProject({ emptyManifest: true });
  try {
    const hook = {
      id: "disabled-guard",
      name: "Disabled Guard",
      event: "pre_tool_use",
      enabled: false,
      priority: 10,
      handler: {
        type: "command",
        command: 'node -e "console.log(JSON.stringify({ allow: false }))"',
      },
    };

    const singleResult = await executeHook({
      hook,
      eventName: "pre_tool_use",
      payload: {},
      projectPath: tmpDir,
    });

    assert.equal(singleResult.status, "skipped");
    assert.equal(singleResult.allow, true);
    assert.equal(singleResult.reason, "Hook disabled");

    registerHook({ projectPath: tmpDir, hook });
    const report = await triggerHookEvent({
      projectPath: tmpDir,
      eventName: "pre_tool_use",
      payload: {},
    });

    assert.equal(report.allow, true);
    assert.equal(report.executedCount, 0);
  } finally {
    cleanupTempProject(tmpDir);
  }
});

test("Integration with Real Guards: Secret leak guard intercepts credentials", async () => {
  const tmpDir = createTempProject({ includeGuards: true, emptyManifest: true });
  try {
    const secretGuardPath = path.resolve(tmpDir, ".skills-platform/hooks/guards/secret-leak-guard.js");

    registerHook({
      projectPath: tmpDir,
      hook: {
        id: "secret-leak-guard",
        name: "Secret Leak Guard",
        event: "pre_tool_use",
        enabled: true,
        priority: 5,
        matcher: "run_command|write_to_file",
        handler: {
          type: "script",
          target: secretGuardPath,
          timeout_ms: 5000,
        },
      },
    });

    registerHook({
      projectPath: tmpDir,
      hook: {
        id: "subsequent-guard",
        name: "Subsequent Guard",
        event: "pre_tool_use",
        enabled: true,
        priority: 10,
        handler: {
          type: "command",
          command: 'node -e "console.log(JSON.stringify({ allow: true }))"',
        },
      },
    });

    // 1. Trigger with AWS API key payload -> should BLOCK
    const blockReport = await triggerHookEvent({
      projectPath: tmpDir,
      eventName: "pre_tool_use",
      payload: { CommandLine: "export AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE" },
    });

    assert.equal(blockReport.allow, false);
    assert.equal(blockReport.halted, true);
    assert.equal(blockReport.blockedBy, "secret-leak-guard");
    assert.ok(blockReport.reason.includes("AWS Access Key ID"));
    assert.ok(blockReport.self_correct_hint);
    assert.equal(blockReport.executedCount, 1);

    // 2. Trigger with benign payload -> should ALLOW both
    const allowReport = await triggerHookEvent({
      projectPath: tmpDir,
      eventName: "pre_tool_use",
      payload: { CommandLine: "npm run test" },
    });

    assert.equal(allowReport.allow, true);
    assert.equal(allowReport.halted, false);
    assert.equal(allowReport.executedCount, 2);
  } finally {
    cleanupTempProject(tmpDir);
  }
});

test("Integration with Real Guards: Destructive command blocker rejects rm -rf /", async () => {
  const tmpDir = createTempProject({ includeGuards: true, emptyManifest: true });
  try {
    const destructiveGuardPath = path.resolve(tmpDir, ".skills-platform/hooks/guards/destructive-command-blocker.js");

    registerHook({
      projectPath: tmpDir,
      hook: {
        id: "destructive-command-blocker",
        name: "Destructive Command Blocker",
        event: "pre_tool_use",
        enabled: true,
        priority: 10,
        matcher: "run_command",
        handler: {
          type: "script",
          target: destructiveGuardPath,
          timeout_ms: 5000,
        },
      },
    });

    const report = await triggerHookEvent({
      projectPath: tmpDir,
      eventName: "pre_tool_use",
      payload: { CommandLine: "rm -rf /" },
    });

    assert.equal(report.allow, false);
    assert.equal(report.halted, true);
    assert.equal(report.blockedBy, "destructive-command-blocker");
    assert.ok(report.reason.toLowerCase().includes("destructive"));
    assert.ok(report.self_correct_hint);
  } finally {
    cleanupTempProject(tmpDir);
  }
});

test("Provider Config Compilation: Compiles .agents/hooks.json and .claude/hooks.json with 5 guard hooks", () => {
  const tmpDir = createTempProject({ emptyManifest: false });
  try {
    // Initializes default manifest which contains 5 guards + telemetry hooks
    loadHookManifest({ projectPath: tmpDir });
    const syncResult = compileProviderConfigs({ projectPath: tmpDir });

    assert.ok(syncResult.antigravityHooks >= 5);
    assert.ok(syncResult.claudeHooks >= 5);

    const agentsPath = path.join(tmpDir, ".agents", "hooks.json");
    const claudePath = path.join(tmpDir, ".claude", "hooks.json");

    assert.ok(fs.existsSync(agentsPath));
    assert.ok(fs.existsSync(claudePath));

    const agentsConfig = JSON.parse(fs.readFileSync(agentsPath, "utf8"));
    assert.ok(agentsConfig["secret-leak-guard"]);
    assert.ok(agentsConfig["secret-leak-guard"].PreToolUse);
    assert.equal(
      agentsConfig["secret-leak-guard"].PreToolUse[0].matcher,
      "run_command|write_to_file|replace_file_content|send_message|view_file"
    );

    assert.ok(agentsConfig["destructive-command-blocker"]);
    assert.ok(agentsConfig["destructive-command-blocker"].PreToolUse);

    assert.ok(agentsConfig["scope-boundary-enforcer"]);
    assert.ok(agentsConfig["scope-boundary-enforcer"].PostToolUse);

    const claudeConfig = JSON.parse(fs.readFileSync(claudePath, "utf8"));
    assert.equal(claudeConfig.version, 1);
    const claudeGuardIds = claudeConfig.hooks.map((h) => h.id);
    assert.ok(claudeGuardIds.includes("secret-leak-guard"));
    assert.ok(claudeGuardIds.includes("destructive-command-blocker"));
    assert.ok(claudeGuardIds.includes("context-budget-guard"));
    assert.ok(claudeGuardIds.includes("scope-boundary-enforcer"));
    assert.ok(claudeGuardIds.includes("subagent-recursion-limiter"));
  } finally {
    cleanupTempProject(tmpDir);
  }
});

test("Integration with Real Guards: Context budget guard blocks excessive payload", async () => {
  const tmpDir = createTempProject({ includeGuards: true, emptyManifest: true });
  try {
    const budgetGuardPath = path.resolve(tmpDir, ".skills-platform/hooks/guards/context-budget-guard.js");

    registerHook({
      projectPath: tmpDir,
      hook: {
        id: "context-budget-guard",
        name: "Context Budget Guard",
        event: "pre_tool_use",
        enabled: true,
        priority: 15,
        matcher: "write_to_file",
        handler: {
          type: "script",
          target: budgetGuardPath,
          timeout_ms: 5000,
        },
      },
    });

    // 400KB oversized content (>320KB limit)
    const largeContent = "a".repeat(400 * 1024);
    const report = await triggerHookEvent({
      projectPath: tmpDir,
      eventName: "pre_tool_use",
      payload: { CodeContent: largeContent },
    });

    assert.equal(report.allow, false);
    assert.equal(report.halted, true);
    assert.equal(report.blockedBy, "context-budget-guard");
    assert.ok(report.reason.includes("Context budget exceeded"));
  } finally {
    cleanupTempProject(tmpDir);
  }
});

test("Integration with Real Guards: Subagent recursion limiter halts deep recursion", async () => {
  const tmpDir = createTempProject({ includeGuards: true, emptyManifest: true });
  try {
    const limiterGuardPath = path.resolve(tmpDir, ".skills-platform/hooks/guards/subagent-recursion-limiter.js");

    registerHook({
      projectPath: tmpDir,
      hook: {
        id: "subagent-recursion-limiter",
        name: "Subagent Recursion Limiter",
        event: "pre_tool_use",
        enabled: true,
        priority: 25,
        matcher: "invoke_subagent|send_message",
        handler: {
          type: "script",
          target: limiterGuardPath,
          timeout_ms: 5000,
        },
      },
    });

    // Payload exceeding depth limit (depth 4 > max depth 3)
    const report = await triggerHookEvent({
      projectPath: tmpDir,
      eventName: "pre_tool_use",
      payload: {
        tool: "invoke_subagent",
        call_chain: ["orchestrator", "worker1", "subagent1", "subagent2"],
      },
    });

    assert.equal(report.allow, false);
    assert.equal(report.halted, true);
    assert.equal(report.blockedBy, "subagent-recursion-limiter");
    assert.ok(report.reason.toLowerCase().includes("recursion limit"));
  } finally {
    cleanupTempProject(tmpDir);
  }
});

test("Short-Circuit Engine: Parses JSON interception when logs precede JSON in stdout", async () => {
  const tmpDir = createTempProject({ emptyManifest: true });
  try {
    registerHook({
      projectPath: tmpDir,
      hook: {
        id: "noisy-guard",
        name: "Noisy Guard",
        event: "pre_tool_use",
        enabled: true,
        priority: 5,
        handler: {
          type: "command",
          command: 'node -e "console.log(\'[DEBUG] Initializing scanner...\'); console.log(JSON.stringify({ allow: false, reason: \'Blocked by noisy scanner\', self_correct_hint: \'Fix issue\' }))"',
        },
      },
    });

    const report = await triggerHookEvent({
      projectPath: tmpDir,
      eventName: "pre_tool_use",
      payload: {},
    });

    assert.equal(report.allow, false);
    assert.equal(report.halted, true);
    assert.equal(report.blockedBy, "noisy-guard");
    assert.equal(report.reason, "Blocked by noisy scanner");
    assert.equal(report.self_correct_hint, "Fix issue");
  } finally {
    cleanupTempProject(tmpDir);
  }
});

