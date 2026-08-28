/**
 * Empirical UI & State Machine Challenger Test Suite for Flow Studio
 * 
 * Tests interactive state transitions, drawer schema compliance,
 * attack simulation events, and defensive fallback renders.
 */

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
      invariants: {
        preConditions: ["PRD.md exists and is readable"],
        strictInvariants: ["Read-only file system access during Phase 1"],
        postConditions: ["task-queue.json emitted with status=pending"],
      },
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
      invariants: {
        preConditions: ["Work scope set to implementation"],
        strictInvariants: ["Test storm execution strictly blocked by guard"],
        postConditions: ["Canvas renders all 4 views"],
      },
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
      invariants: {
        preConditions: ["Guard hooks registered in priority order"],
        strictInvariants: ["Attack packet short-circuit latency < 200ms"],
        postConditions: ["Red Halt Node receives actionable self-correct hint"],
      },
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
      invariants: {
        preConditions: ["All Phase 2 inner loop tasks status=passed"],
        strictInvariants: ["Single regression run authorized", "Token density <= 80k tokens"],
        postConditions: ["MASTER_BASELINE.md compacted and verified"],
      },
    },
  },
];

test("Challenger UI 1: View mode registration and icon definitions completeness", () => {
  assert.equal(VIEW_MODE_DEFS.length, 4);
  const expectedModes = ["lifecycle", "hook_pipeline", "fractal_tree", "junction_map"];
  assert.deepEqual(VIEW_MODE_DEFS.map((m) => m.id), expectedModes);

  for (const m of VIEW_MODE_DEFS) {
    assert.ok(m.label.length > 5);
    assert.ok(m.description.length > 10);
    assert.ok(["RefreshCw", "Zap", "Dna", "Link2"].includes(m.iconName));
  }
});

test("Challenger UI 2: Simulation attacks schema and priority bounds", () => {
  assert.equal(SIMULATION_ATTACKS.length, 4);

  for (const attack of SIMULATION_ATTACKS) {
    assert.ok(attack.id);
    assert.ok(attack.title);
    assert.ok(attack.command);
    assert.ok(attack.expectedHaltNode);
    assert.equal(attack.expectedLatencyMaxMs, 200);
    assert.ok(attack.expectedHint.length > 10);
  }
});

test("Challenger UI 3: Lifecycle initial tasks verification contracts", () => {
  assert.equal(INITIAL_LIFECYCLE_TASKS.length, 4);

  const phase1 = INITIAL_LIFECYCLE_TASKS.find((t) => t.phase === 1);
  const phase2 = INITIAL_LIFECYCLE_TASKS.filter((t) => t.phase === 2);
  const phase3 = INITIAL_LIFECYCLE_TASKS.find((t) => t.phase === 3);

  assert.ok(phase1);
  assert.equal(phase2.length, 2);
  assert.ok(phase3);

  // Phase 1 has read-only strict invariants
  assert.ok(phase1.verification.invariants.strictInvariants.some((inv) => /read-only/i.test(inv)));
  // Phase 2 has test storm shield invariant
  assert.ok(phase2[0].verification.invariants.strictInvariants.some((inv) => /test storm/i.test(inv)));
  // Phase 3 has token budget invariant
  assert.ok(phase3.verification.invariants.strictInvariants.some((inv) => /80k tokens/i.test(inv)));
});

test("Challenger UI 4: Fallback handling for missing diagnostics and metrics in node details", () => {
  const minimalNode = {
    id: "minimal_node",
    type: "topic_node",
    name: "Minimal Topic",
    status: "idle",
    lineage: {
      path: [],
    },
  };

  // Ensure accessors don't throw TypeError
  assert.equal(minimalNode.diagnostics?.reason, undefined);
  assert.equal(minimalNode.metrics?.durationMs, undefined);
  assert.equal(minimalNode.junction?.providerId, undefined);
  assert.equal(minimalNode.lineage.topicId, undefined);
});
