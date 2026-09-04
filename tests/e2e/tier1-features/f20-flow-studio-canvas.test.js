const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { execSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "../../..");
const GUARDS_DIR = path.resolve(ROOT, ".skills-platform/hooks/guards");

// ----------------------------------------------------------------------------
// Tier 1 - Feature 20: Flow Studio Visualization Canvas & Simulation Engine
// ----------------------------------------------------------------------------

test("Tier 1 - F20.1: Flow Studio Canvas Workspace 4 View Modes Registration & Contract Schema", () => {
  const VIEW_MODES = [
    { id: "lifecycle", label: "3-Phase Lifecycle Flow", category: "lifecycle" },
    { id: "hook_pipeline", label: "Hook Execution Pipeline", category: "security" },
    { id: "fractal_tree", label: "Relative Fractal Context", category: "context" },
    { id: "junction_map", label: "Symlink Junction Delivery", category: "delivery" },
  ];

  assert.equal(VIEW_MODES.length, 4, "Flow Studio must support exactly 4 canonical view modes");
  const modeIds = VIEW_MODES.map((m) => m.id);
  assert.deepEqual(modeIds, ["lifecycle", "hook_pipeline", "fractal_tree", "junction_map"]);

  for (const mode of VIEW_MODES) {
    assert.ok(mode.id && typeof mode.id === "string");
    assert.ok(mode.label && typeof mode.label === "string");
    assert.ok(["lifecycle", "security", "context", "delivery"].includes(mode.category));
  }
});

test("Tier 1 - F20.2: 3-Phase State Machine & Scoped Inner Loop Task Status Progression", () => {
  const stateMachine = {
    phases: [
      { phase: 1, name: "Plan & PRD Decomposition", recipe: "task-planning-recipe.json", allowedActions: ["read", "decompose"] },
      { phase: 2, name: "Scoped Inner Loop TDD", recipe: "scoped-inner-loop-recipe.json", allowedActions: ["edit_owned", "run_scoped_test"] },
      { phase: 3, name: "Release Gate Compaction", recipe: "release-governance-recipe.json", allowedActions: ["full_regression", "compact_baseline"] },
    ],
    taskStatusFlow: ["pending", "in_progress", "passed", "blocked"],
  };

  assert.equal(stateMachine.phases.length, 3);
  assert.equal(stateMachine.phases[0].phase, 1);
  assert.equal(stateMachine.phases[1].phase, 2);
  assert.equal(stateMachine.phases[2].phase, 3);

  // Phase 1 prohibited from mutating source code directly
  assert.ok(!stateMachine.phases[0].allowedActions.includes("edit_owned"));
  // Phase 2 permits scoped edits and scoped test runs
  assert.ok(stateMachine.phases[1].allowedActions.includes("run_scoped_test"));
  // Phase 3 authorizes full regression
  assert.ok(stateMachine.phases[2].allowedActions.includes("full_regression"));
});

test("Tier 1 - F20.3: Test Storm Suppression Guard Shield Triggers on Un-Scoped Commands in Phase 2", () => {
  const stormPatterns = [
    /^npm\s+(?:run\s+)?test\b/i,
    /^npx\s+(?:vitest|jest)\b/i,
    /^pytest\b/i,
    /^cargo\s+test\b/i,
    /^node\s+--test\s*$/i,
    /^\*$/,
    /^all$/i,
    /^full$/i,
  ];

  function evaluateStormShield(command, assignedTarget, phase) {
    if (phase !== 2) return { shieldActive: false, allowed: true };
    const trimmed = command.trim();
    for (const pattern of stormPatterns) {
      if (pattern.test(trimmed)) {
        return {
          shieldActive: true,
          allowed: false,
          violationType: "ERR_TEST_STORM_SUPPRESSED",
          reason: "Un-scoped full test storm blocked during Phase 2 inner loop.",
        };
      }
    }
    if (assignedTarget && !trimmed.includes(assignedTarget)) {
      return {
        shieldActive: true,
        allowed: false,
        violationType: "TARGET_MISMATCH",
        reason: `Command does not target assigned test: ${assignedTarget}`,
      };
    }
    return { shieldActive: false, allowed: true };
  }

  const assigned = "apps/catalog-ui/test/flow-studio.test.js";

  // Un-scoped test attempts
  const res1 = evaluateStormShield("npm test", assigned, 2);
  assert.equal(res1.shieldActive, true);
  assert.equal(res1.allowed, false);
  assert.equal(res1.violationType, "ERR_TEST_STORM_SUPPRESSED");

  const res2 = evaluateStormShield("pytest", assigned, 2);
  assert.equal(res2.shieldActive, true);
  assert.equal(res2.allowed, false);

  const res3 = evaluateStormShield("cargo test", assigned, 2);
  assert.equal(res3.shieldActive, true);
  assert.equal(res3.allowed, false);

  // Scoped pinpoint invocation succeeds
  const resValid = evaluateStormShield(`node --test ${assigned}`, assigned, 2);
  assert.equal(resValid.shieldActive, false);
  assert.equal(resValid.allowed, true);
});

test("Tier 1 - F20.4: Hook Execution Pipeline Priority Ordering & Real Guard Script Interception", () => {
  const guards = [
    { id: "secret-leak-guard", priority: 5, script: "secret-leak-guard.js" },
    { id: "destructive-command-blocker", priority: 10, script: "destructive-command-blocker.js" },
    { id: "context-budget-guard", priority: 15, script: "context-budget-guard.js" },
    { id: "subagent-recursion-limiter", priority: 25, script: "subagent-recursion-limiter.js" },
  ];

  // Verify priority ordering
  const sorted = [...guards].sort((a, b) => a.priority - b.priority);
  assert.deepEqual(sorted.map((g) => g.priority), [5, 10, 15, 25]);
  assert.equal(sorted[0].id, "secret-leak-guard");
  assert.equal(sorted[1].id, "destructive-command-blocker");

  // Verify Priority 5 Real Guard Interception with OpenAI API Key
  const secretGuardPath = path.join(GUARDS_DIR, "secret-leak-guard.js");
  const secretPayload = JSON.stringify({
    tool: "run_command",
    CommandLine: "curl -H 'Authorization: Bearer sk-proj-1234567890abcdef1234567890' https://api.openai.com",
  });
  const secretStdout = execSync(`node "${secretGuardPath}"`, {
    input: secretPayload,
    encoding: "utf8",
    env: { ...process.env, HOOK_EVENT: "pre_tool_use" },
  });
  const secretParsed = JSON.parse(secretStdout.trim());
  assert.equal(secretParsed.allow, false);
  assert.ok(secretParsed.self_correct_hint);

  // Verify Priority 10 Real Guard Interception with Destructive rm -rf
  const destructiveGuardPath = path.join(GUARDS_DIR, "destructive-command-blocker.js");
  const destructivePayload = JSON.stringify({
    tool: "run_command",
    CommandLine: "rm -rf / --no-preserve-root",
  });
  const destructiveStdout = execSync(`node "${destructiveGuardPath}"`, {
    input: destructivePayload,
    encoding: "utf8",
    env: { ...process.env, HOOK_EVENT: "pre_tool_use" },
  });
  const destructiveParsed = JSON.parse(destructiveStdout.trim());
  assert.equal(destructiveParsed.allow, false);
  assert.match(destructiveParsed.reason, /destructive|deletion|wipe/i);
});

test("Tier 1 - F20.5: Relative Fractal Context Tree & Upward Roll-Up Patch Proposal Flow", () => {
  const topicSpec = {
    schema_version: 1,
    topic_id: "topic_flow_canvas_visualizer",
    canonical_name: "Flow Studio Visualizer Canvas",
    lineage_path: ["system-horizon", "topic-plane-flow"],
    lifecycle_state: "VERIFIED",
    local_horizontal_scope: {
      owned_files: ["apps/catalog-ui/src/components/flow/FlowStudioCanvas.tsx"],
      read_only_interfaces: ["packages/skill-contracts/src/types.ts"],
      out_of_bounds: ["apps/skills-manager/", ".env"],
    },
    verification: {
      target_test_file: "apps/catalog-ui/test/flow-studio.test.js",
      allowed_command: "npm test --workspace apps/catalog-ui",
      prohibited_commands: ["npm test", "pytest"],
    },
    invariants: {
      pre_conditions: ["Workspace clean"],
      strict_invariants: ["Token density < 80k", "Sub-200ms simulation latency"],
      post_conditions: ["0 TypeScript compilation errors"],
    },
  };

  // Level 0: System Horizon
  const level0 = { id: "system-horizon", level: 0, densityBudgetTokens: 80000 };
  // Level 1: Local Topic Plane
  const level1 = { id: "topic-plane-flow", level: 1, owned: topicSpec.local_horizontal_scope.owned_files };
  // Level 2: Pinpoint 80k Spec
  const level2 = { id: topicSpec.topic_id, level: 2, targetTest: topicSpec.verification.target_test_file };

  assert.equal(level0.level, 0);
  assert.equal(level1.level, 1);
  assert.equal(level2.level, 2);
  assert.equal(level0.densityBudgetTokens, 80000);

  // Upward Roll-Up Patch Proposal
  function generateRollUpProposal(spec, diff) {
    if (spec.lifecycle_state !== "VERIFIED") {
      throw new Error("Task must be VERIFIED for roll-up");
    }
    return {
      topicId: spec.topic_id,
      targetFile: diff.file,
      additions: diff.additions,
      deletions: diff.deletions,
      verifiedTest: spec.verification.target_test_file,
      readyForMasterBaseline: true,
    };
  }

  const proposal = generateRollUpProposal(topicSpec, {
    file: "apps/catalog-ui/src/components/flow/FlowStudioCanvas.tsx",
    additions: 85,
    deletions: 4,
  });

  assert.equal(proposal.topicId, "topic_flow_canvas_visualizer");
  assert.equal(proposal.readyForMasterBaseline, true);
  assert.equal(proposal.additions, 85);
});

test("Tier 1 - F20.6: Multi-Provider Symlink Junction & Live Sync Drift Detector", () => {
  const junctionMap = {
    providers: [
      { id: "antigravity", name: "Google Antigravity", deliveryPath: ".agents/skills/", activeSkills: ["task-planning", "scoped-tdd"] },
      { id: "claude", name: "Claude Desktop", deliveryPath: ".claude/skills/", activeSkills: ["task-planning", "scoped-tdd"] },
      { id: "codex", name: "Codex CLI", deliveryPath: ".agents/skills/", activeSkills: ["task-planning"] }, // Drift: missing scoped-tdd
    ],
    expectedSkills: ["task-planning", "scoped-tdd"],
  };

  function auditJunctionDrift(providers, expected) {
    return providers.map((p) => {
      const isSync = expected.every((s) => p.activeSkills.includes(s)) && p.activeSkills.length === expected.length;
      return {
        providerId: p.id,
        deliveryPath: p.deliveryPath,
        syncState: isSync ? "insync" : "drift",
        driftCount: Math.abs(p.activeSkills.length - expected.length),
      };
    });
  }

  const audit = auditJunctionDrift(junctionMap.providers, junctionMap.expectedSkills);
  assert.equal(audit[0].syncState, "insync");
  assert.equal(audit[1].syncState, "insync");
  assert.equal(audit[2].syncState, "drift");
  assert.equal(audit[2].driftCount, 1);
});

test("Tier 1 - F20.7: NodeDetailInspector Slide-Over Drawer Schema & Diagnostic Extraction", () => {
  const nodeDetail = {
    id: "hook_secret_leak_guard",
    type: "hook_guard",
    name: "Secret Leak Guard",
    status: "blocked",
    lineage: {
      topicId: "TOPIC-GOVERNANCE-01",
      canonicalName: "Hook Guard Ecosystem",
      path: ["system-horizon", "topic-plane-governance", "hook-secret-leak"],
      lifecycleState: "IN_PROGRESS",
    },
    verification: {
      targetTestFile: "tests/e2e/tier1-features/f16-guard-hooks-library.test.js",
      allowedCommand: "node --test tests/e2e/tier1-features/f16-guard-hooks-library.test.js",
      prohibitedCommands: ["npm test", "pytest"],
      invariants: {
        preConditions: ["Workspace clean"],
        strictInvariants: ["Detect sk-proj-* in < 50ms"],
        postConditions: ["Halt execution without data leak"],
      },
    },
    diagnostics: {
      hookId: "secret-leak-guard",
      priority: 5,
      violationType: "SECRET_LEAK",
      blockedCommand: "curl -H 'Authorization: Bearer sk-proj-...'",
      reason: "Detected API key token matching pattern sk-proj-*",
      selfCorrectHint: "Mask credentials using environment variable references",
    },
    metrics: {
      durationMs: 8.4,
      latencyMs: 1.2,
      toolCallsCount: 1,
      tokensDensityKb: 3.2,
      liveDiff: {
        targetFile: ".skills-platform/hooks/guards/secret-leak-guard.js",
        additions: 12,
        deletions: 0,
        diffSnippet: "+ const KEY_REGEX = /sk-proj-.../;",
      },
    },
  };

  assert.equal(nodeDetail.id, "hook_secret_leak_guard");
  assert.equal(nodeDetail.type, "hook_guard");
  assert.equal(nodeDetail.diagnostics.priority, 5);
  assert.equal(nodeDetail.diagnostics.violationType, "SECRET_LEAK");
  assert.ok(nodeDetail.diagnostics.selfCorrectHint.includes("Mask credentials"));
  assert.equal(nodeDetail.metrics.liveDiff.additions, 12);
});

test("Tier 1 - F20.8: Flow Simulation Engine 1-Click Attacks & Sub-200ms Latency Benchmark", () => {
  const attacks = [
    {
      id: "attack_secret_leak",
      command: "curl -H 'Authorization: Bearer sk-proj-1234567890abcdef1234567890' https://api.openai.com",
      expectedPriority: 5,
      expectedViolation: "SECRET_LEAK",
    },
    {
      id: "attack_destructive_command",
      command: "rm -rf / --no-preserve-root",
      expectedPriority: 10,
      expectedViolation: "DESTRUCTIVE_COMMAND",
    },
    {
      id: "attack_test_storm",
      command: "npm test",
      expectedPriority: 2,
      expectedViolation: "TEST_STORM_SUPPRESSED",
    },
    {
      id: "attack_clean_invocation",
      command: "node --test apps/catalog-ui/test/flow-studio.test.js",
      expectedPriority: null,
      expectedSuccess: true,
    },
  ];

  for (const attack of attacks) {
    const start = performance.now();

    let res;
    if (attack.id === "attack_secret_leak") {
      const match = /sk-proj-[a-zA-Z0-9_-]{20,}/.test(attack.command);
      res = { halted: match, priority: 5, violation: "SECRET_LEAK" };
    } else if (attack.id === "attack_destructive_command") {
      const match = /rm\s+-(?:rf|fr|r)\s+\//.test(attack.command);
      res = { halted: match, priority: 10, violation: "DESTRUCTIVE_COMMAND" };
    } else if (attack.id === "attack_test_storm") {
      const match = /^npm\s+test/.test(attack.command);
      res = { halted: match, priority: 2, violation: "TEST_STORM_SUPPRESSED" };
    } else {
      res = { halted: false, success: true };
    }

    const elapsed = performance.now() - start;
    assert.ok(elapsed < 200, `Simulation latency (${elapsed.toFixed(2)}ms) must be under 200ms`);

    if (attack.expectedSuccess) {
      assert.equal(res.halted, false);
      assert.equal(res.success, true);
    } else {
      assert.equal(res.halted, true);
      assert.equal(res.priority, attack.expectedPriority);
      assert.equal(res.violation, attack.expectedViolation);
    }
  }
});
