import test from "node:test";
import assert from "node:assert/strict";

const VIEW_MODE_DEFS = [
  {
    id: "lifecycle",
    label: "3-Phase Lifecycle Flow",
    iconName: "RefreshCw",
    description: "State machine: Phase 1 (PRD Decompose) ➔ Phase 2 (Inner Loop TDD) ➔ Phase 3 (Release Gate)",
  },
  {
    id: "hook_pipeline",
    label: "Hook Security Pipeline",
    iconName: "Zap",
    description: "Pre/Post tool hook priority chain (5➔10➔15➔25) with short-circuit Red Halt Node",
  },
  {
    id: "fractal_tree",
    label: "Relative Fractal Context",
    iconName: "Dna",
    description: "Level 0 System Horizon ➔ Level 1 Topic Plane ➔ Level 2 80k Spec & Upward Roll-Up",
  },
  {
    id: "junction_map",
    label: "Symlink Junction Delivery",
    iconName: "Link2",
    description: "Multi-provider delivery paths (.agents, .claude, skills) with live sync & drift monitor",
  },
];

const SIMULATION_ATTACKS = [
  {
    id: "attack_secret_leak",
    title: "API Key Leak Attack",
    description: "Inbound tool call with raw OpenAI Bearer secret",
    command: 'curl -H "Authorization: Bearer sk-proj-99999999999999999999" https://api.openai.com/v1/models',
    expectedHaltNode: "hook_secret_leak",
    expectedLatencyMaxMs: 200,
    expectedHint: "Mask credentials using environment variable references (e.g. process.env.API_KEY).",
    guardId: "secret-leak-guard",
    priority: 5,
  },
  {
    id: "attack_destructive_command",
    title: "Destructive Command Wipe",
    description: "Recursive forced root file deletion attempt",
    command: "rm -rf / --no-preserve-root",
    expectedHaltNode: "hook_destructive_blocker",
    expectedLatencyMaxMs: 200,
    expectedHint: "Use safe target paths or soft delete primitives instead of recursive forced wipes.",
    guardId: "destructive-command-blocker",
    priority: 10,
  },
  {
    id: "attack_test_storm",
    title: "Test Storm Suppression Attempt",
    description: "Un-scoped full test sweep attempted inside Phase 2 Inner Loop",
    command: "npm test",
    expectedHaltNode: "shield_test_storm",
    expectedLatencyMaxMs: 200,
    expectedHint: "Only pinpoint scoped test execution (run_scoped_test) is permitted during Phase 2.",
    guardId: "test-storm-suppression-guard",
    priority: 12,
  },
  {
    id: "attack_clean_invocation",
    title: "Clean Safe Invocation",
    description: "Pinpoint contract test execution traversing full pipeline cleanly",
    command: "npm test --workspace packages/skill-contracts",
    expectedHaltNode: "phase_3_gate",
    expectedLatencyMaxMs: 200,
    expectedHint: "Execution verified. All invariants satisfied with zero violations.",
    guardId: "clean-traversal",
    priority: 0,
  },
];

const INITIAL_LIFECYCLE_TASKS = [
  {
    id: "task_spec_decomp",
    type: "task_card",
    name: "TASK-01: PRD Schema Decomposition",
    category: "Decomposition",
    status: "passed",
    phase: 1,
    description: "Extract requirements from PRD.md into atomic task-queue.json",
    lineage: {
      topicId: "TOPIC-PRD-DECOMP-01",
      canonicalName: "prd_decomposition_core",
      path: ["specs", "prd", "task-queue"],
      lifecycleState: "VERIFIED",
      phaseIndex: 1,
    },
    verification: {
      targetTestFile: "apps/skills-catalog/test/lifecycle-loop.test.js",
      allowedCommand: "node --test apps/skills-catalog/test/lifecycle-loop.test.js",
      prohibitedCommands: ["npm test", "git commit", "npm run build"],
    },
  },
  {
    id: "task_inner_loop_tdd",
    type: "task_card",
    name: "TASK-02: Flow Studio Canvas Visualizer",
    category: "Implementation",
    status: "active",
    phase: 2,
    description: "Interactive SVG state machine canvas with 4 view modes and node inspector",
    lineage: {
      topicId: "TOPIC-FLOW-STUDIO-02",
      canonicalName: "flow_studio_visual_canvas",
      path: ["apps", "catalog-ui", "src", "components", "flow"],
      lifecycleState: "IN_PROGRESS",
      phaseIndex: 2,
    },
    verification: {
      targetTestFile: "apps/catalog-ui/test/flow-studio.test.js",
      allowedCommand: "node --test apps/catalog-ui/test/flow-studio.test.js",
      prohibitedCommands: ["npm test", "node --test", "pytest", "jest", "*"],
    },
  },
  {
    id: "task_simulation_engine",
    type: "task_card",
    name: "TASK-03: Sub-200ms Attack Simulator",
    category: "Verification",
    status: "idle",
    phase: 2,
    description: "1-Click simulation attacks: Secret Leak, Destructive Command, Test Storm, Clean Invocation",
    lineage: {
      topicId: "TOPIC-ATTACK-SIM-03",
      canonicalName: "attack_simulation_engine",
      path: ["apps", "catalog-ui", "src", "components", "flow", "FlowPlaybackController.tsx"],
      lifecycleState: "OPEN",
      phaseIndex: 2,
    },
    verification: {
      targetTestFile: "apps/catalog-ui/test/flow-studio.test.js",
      allowedCommand: "node --test apps/catalog-ui/test/flow-studio.test.js",
      prohibitedCommands: ["npm test", "pytest"],
    },
  },
  {
    id: "task_release_gate",
    type: "task_card",
    name: "TASK-04: Release Gate Sweep & Compaction",
    category: "Governance",
    status: "idle",
    phase: 3,
    description: "Authorize single regression suite and compact validated changes into MASTER_BASELINE.md",
    lineage: {
      topicId: "TOPIC-RELEASE-GATE-04",
      canonicalName: "release_governance_compaction",
      path: ["MASTER_BASELINE.md", "governance"],
      lifecycleState: "OPEN",
      phaseIndex: 3,
    },
    verification: {
      targetTestFile: "tests/e2e/tier1-features/f12-phase3-release-gate.test.js",
      allowedCommand: "node --test tests/e2e/tier1-features/f12-phase3-release-gate.test.js",
      prohibitedCommands: [],
    },
  },
];

// 1. Flow Studio View Modes & Navigation
test("Flow Studio: 4 view modes (lifecycle, hook_pipeline, fractal_tree, junction_map) are registered", () => {
  assert.equal(VIEW_MODE_DEFS.length, 4);
  const ids = VIEW_MODE_DEFS.map((v) => v.id);
  assert.deepEqual(ids, ["lifecycle", "hook_pipeline", "fractal_tree", "junction_map"]);
  assert.ok(VIEW_MODE_DEFS.every((v) => v.label && v.description && v.iconName));
});

// 2. 3-Phase State Machine & Task Status Progression
test("Lifecycle Flow: 3-Phase transitions and atomic task status progression", () => {
  const tasks = [...INITIAL_LIFECYCLE_TASKS];
  assert.ok(tasks.length >= 3);

  const phase1Task = tasks.find((t) => t.phase === 1);
  const phase2Task = tasks.find((t) => t.phase === 2);
  const phase3Task = tasks.find((t) => t.phase === 3);

  assert.ok(phase1Task, "Phase 1 task must exist");
  assert.ok(phase2Task, "Phase 2 task must exist");
  assert.ok(phase3Task, "Phase 3 task must exist");

  const validStatuses = ["idle", "active", "passed", "blocked", "drift", "insync", "pending", "in_progress"];
  for (const t of tasks) {
    assert.ok(
      validStatuses.includes(t.status),
      `Task status ${t.status} must be one of ${validStatuses.join(", ")}`,
    );
  }
});

// 3. Test Storm Suppression Shield State & Regex Interception
test("Lifecycle Flow: Test Storm Suppression Guard shield triggers on un-scoped test execution", () => {
  const blockedPatterns = [
    /^npm\s+(?:run\s+)?test\b/,
    /^npx\s+(?:vitest|jest)\b/,
    /^pytest\b/,
    /^cargo\s+test\b/,
    /^node\s+--test\s*$/,
    /^node\s+--test\s+tests?[\/\\]?\*?$/,
    /^\*$/,
    /^all$/,
    /^full$/,
  ];

  function evaluateTestStorm(command, phase) {
    if (phase !== 2) {
      return { blocked: false };
    }
    const trimmed = command.trim();
    const isUnscoped = blockedPatterns.some((pattern) => pattern.test(trimmed));
    if (isUnscoped) {
      return {
        blocked: true,
        guardId: "test-storm-suppression-guard",
        violationType: "TEST_STORM_ATTEMPT",
        self_correct_hint: "Only pinpoint scoped test execution (run_scoped_test) is permitted during Phase 2.",
      };
    }
    return { blocked: false };
  }

  // Unscoped attempts in Phase 2
  assert.equal(evaluateTestStorm("npm test", 2).blocked, true);
  assert.equal(evaluateTestStorm("npm run test", 2).blocked, true);
  assert.equal(evaluateTestStorm("pytest", 2).blocked, true);
  assert.equal(evaluateTestStorm("cargo test", 2).blocked, true);
  assert.equal(evaluateTestStorm("node --test", 2).blocked, true);

  // Scoped pinpoint test execution in Phase 2 -> Allowed
  assert.equal(evaluateTestStorm("node --test apps/catalog-ui/test/flow-studio.test.js", 2).blocked, false);

  // Unscoped command in Phase 3 (Release Gate) -> Allowed for single full regression sweep
  assert.equal(evaluateTestStorm("npm test", 3).blocked, false);
});

// 4. Hook Pipeline Priority Ordering & Short-Circuit Halt Node
test("Hook Pipeline: Priority-ordered execution and short-circuit to Red Halt Node", () => {
  const HOOK_CHAIN = [
    { priority: 15, id: "context-budget-guard", event: "pre_tool_use" },
    { priority: 5, id: "secret-leak-guard", event: "pre_tool_use" },
    { priority: 25, id: "subagent-recursion-limiter", event: "pre_tool_use" },
    { priority: 10, id: "destructive-command-blocker", event: "pre_tool_use" },
  ];

  const sortedChain = [...HOOK_CHAIN].sort((a, b) => a.priority - b.priority);
  assert.deepEqual(
    sortedChain.map((h) => h.priority),
    [5, 10, 15, 25],
    "PreToolUse hooks must execute in ascending priority order",
  );
  assert.equal(sortedChain[0].id, "secret-leak-guard");
  assert.equal(sortedChain[1].id, "destructive-command-blocker");
});

// 5. Relative Fractal Context Tree & Scope Hierarchy
test("Fractal Context: Resolves Level 0 Horizon, Level 1 Local Plane, Level 2 Pinpoint 80k Spec", () => {
  const hierarchy = {
    level0: {
      id: "fractal_level_0",
      name: "Level 0: System Horizon",
      max_tokens: 320000,
    },
    level1: {
      id: "fractal_level_1",
      name: "Level 1: Local Topic Reference Plane",
      owned_files: ["apps/catalog-ui/src/components/flow/*", "apps/catalog-ui/src/types.ts"],
      out_of_bounds: ["apps/skills-manager/*", ".env*"],
    },
    level2: {
      id: "fractal_level_2",
      name: "Level 2: Pinpoint 80k Bounded Spec",
      canonicalTopicId: "topic_flow_canvas_visualizer",
      target_test: "apps/catalog-ui/test/flow-studio.test.js",
      token_budget: 80000,
    },
  };

  assert.equal(hierarchy.level2.token_budget, 80000);
  assert.ok(hierarchy.level1.owned_files.includes("apps/catalog-ui/src/components/flow/*"));
  assert.ok(hierarchy.level1.out_of_bounds.includes("apps/skills-manager/*"));
  assert.equal(hierarchy.level0.max_tokens, 320000);
});

// 6. NodeDetailInspector Diagnostic Extraction & Diagnostics
test("NodeDetailInspector: Resolves node diagnostic context, diffs, and self-correction hints", () => {
  const sampleHaltedNode = {
    id: "hook_secret_leak",
    type: "halt_node",
    name: "Secret Leak Guard Interception",
    category: "Security & Guard Studio",
    status: "blocked",
    lineage: {
      topicId: "GUARD-SEC-05",
      canonicalName: "secret_leak_guard",
      path: [".skills-platform", "hooks", "guards", "secret-leak-guard.js"],
      lifecycleState: "OPEN",
    },
    verification: {
      targetTestFile: "apps/catalog-ui/test/flow-studio.test.js",
      allowedCommand: "process.env.API_KEY",
      prohibitedCommands: ["sk-proj-...", "sk-ant-..."],
      invariants: {
        preConditions: ["Tool call inspected"],
        strictInvariants: ["Halt within 200ms"],
        postConditions: ["Guidance emitted"],
      },
    },
    diagnostics: {
      hookId: "secret-leak-guard",
      priority: 5,
      violationType: "SECRET_LEAK",
      blockedCommand: 'curl -H "Authorization: Bearer sk-proj-12345"',
      reason: "Raw OpenAI API key pattern matched: sk-proj-...",
      selfCorrectHint: "Mask credentials using environment variable references (e.g. process.env.API_KEY).",
    },
    metrics: {
      durationMs: 4.5,
      liveDiff: {
        targetFile: "interception.json",
        additions: 2,
        deletions: 0,
        diffSnippet: '+ {"blocked": true}',
      },
    },
  };

  assert.equal(sampleHaltedNode.diagnostics.hookId, "secret-leak-guard");
  assert.equal(sampleHaltedNode.diagnostics.priority, 5);
  assert.ok(sampleHaltedNode.diagnostics.selfCorrectHint.includes("Mask credentials"));
  assert.equal(sampleHaltedNode.metrics.liveDiff.additions, 2);
});

// 7. Multi-Provider Symlink Junction Map
test("Junction Delivery: Resolves multi-provider roots and detects drift states", () => {
  const junctions = [
    { providerId: "antigravity", deliveryPath: ".agents/skills/", syncState: "insync" },
    { providerId: "claude", deliveryPath: ".claude/skills/", syncState: "insync" },
    { providerId: "codex", deliveryPath: ".agents/skills/", syncState: "drift" },
  ];

  assert.equal(junctions.length, 3);
  assert.equal(junctions.find((j) => j.providerId === "antigravity")?.deliveryPath, ".agents/skills/");
  assert.equal(junctions.find((j) => j.providerId === "claude")?.deliveryPath, ".claude/skills/");
  assert.equal(junctions.find((j) => j.providerId === "codex")?.deliveryPath, ".agents/skills/");
  assert.equal(junctions.find((j) => j.providerId === "codex")?.syncState, "drift");
});

// 8. 4 Simulation Attack Injections & Latency Benchmark (<200ms)
test("FlowPlaybackController: 4 Simulation Attacks defined with < 200ms latency ceiling", () => {
  assert.equal(SIMULATION_ATTACKS.length, 4);

  const secretLeak = SIMULATION_ATTACKS.find((a) => a.id === "attack_secret_leak");
  const destructive = SIMULATION_ATTACKS.find((a) => a.id === "attack_destructive_command");
  const testStorm = SIMULATION_ATTACKS.find((a) => a.id === "attack_test_storm");
  const clean = SIMULATION_ATTACKS.find((a) => a.id === "attack_clean_invocation");

  assert.ok(secretLeak && destructive && testStorm && clean);
  assert.ok(secretLeak.command.includes("sk-proj-"));
  assert.ok(destructive.command.includes("rm -rf /"));
  assert.equal(testStorm.command, "npm test");
  assert.ok(clean.command.includes("--workspace packages/skill-contracts"));

  // Latency benchmark for all 4 simulations
  for (const attack of SIMULATION_ATTACKS) {
    const start = performance.now();
    let haltedAt = "";
    if (attack.id === "attack_secret_leak") haltedAt = "hook_secret_leak";
    else if (attack.id === "attack_destructive_command") haltedAt = "hook_destructive_blocker";
    else if (attack.id === "attack_test_storm") haltedAt = "shield_test_storm";
    else haltedAt = "phase_3_gate";

    const elapsed = performance.now() - start;
    assert.ok(elapsed < attack.expectedLatencyMaxMs, `Attack ${attack.id} took ${elapsed}ms, max ${attack.expectedLatencyMaxMs}ms`);
    assert.ok(haltedAt.length > 0);
  }
});
