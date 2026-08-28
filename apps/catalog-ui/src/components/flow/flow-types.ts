import type { InvocationMode } from "../../types";

export type FlowViewMode = "lifecycle" | "hook_pipeline" | "fractal_tree" | "junction_map";

export type TopicLifecycleState = "OPEN" | "IN_PROGRESS" | "VERIFIED" | "REOPENED" | "CLOSED";

export type TaskStatus = "pending" | "in_progress" | "passed" | "blocked";

export type FlowNodeStatus =
  | "idle"
  | "active"
  | "passed"
  | "blocked"
  | "drift"
  | "insync"
  | "pending"
  | "in_progress";

export type FlowNodeType =
  | "lifecycle_phase"
  | "task_card"
  | "hook_guard"
  | "halt_node"
  | "topic_node"
  | "junction_node"
  | "shield_guard";

export interface FlowNodeDetail {
  id: string;
  type: FlowNodeType;
  name: string;
  category?: string;
  status: FlowNodeStatus;
  description?: string;
  phase?: number;
  badge?: string;
  position?: { x: number; y: number };
  invocationMode?: InvocationMode;

  lineage: {
    topicId?: string;
    canonicalName?: string;
    path: string[];
    lifecycleState?: TopicLifecycleState;
    phaseIndex?: number;
  };

  verification?: {
    targetTestFile: string;
    allowedCommand: string;
    prohibitedCommands: string[];
    invariants: {
      preConditions: string[];
      strictInvariants: string[];
      postConditions: string[];
    };
  };

  diagnostics?: {
    hookId?: string;
    priority?: number;
    violationType?: string;
    blockedCommand?: string;
    reason?: string;
    selfCorrectHint?: string;
    matchedPattern?: string;
  };

  metrics?: {
    durationMs: number;
    latencyMs?: number;
    toolCallsCount?: number;
    tokensDensityKb?: number;
    liveDiff?: {
      targetFile: string;
      additions: number;
      deletions: number;
      diffSnippet: string;
    };
  };

  junction?: {
    providerId: "antigravity" | "codex" | "claude";
    deliveryPath: string;
    syncState: "insync" | "drift" | "pristine";
    symlinkTarget: string;
    managedCount?: number;
    activePreset?: string;
  };
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  animated?: boolean;
  variant?: "normal" | "halt" | "success" | "dotted" | "drift";
}

export interface SimulationAttack {
  id: "attack_secret_leak" | "attack_destructive_command" | "attack_test_storm" | "attack_clean_invocation";
  title: string;
  description: string;
  command: string;
  expectedHaltNode: string;
  expectedLatencyMaxMs: number; // 200ms
  expectedHint: string;
  guardId?: string;
  priority?: number;
}

export interface SimulationPlaybackState {
  isPlaying: boolean;
  currentStep: number;
  totalSteps: number;
  speed: number;
  activeAttackId: string | null;
  activePacket: {
    fromNodeId: string;
    toNodeId: string;
    progress: number;
    status: "normal" | "blocked" | "success";
  } | null;
  haltedNodeId: string | null;
  haltedReason: string | null;
  haltedHint: string | null;
  elapsedMs: number;
  logMessages: Array<{
    timestamp: number;
    type: "info" | "warning" | "error" | "success";
    text: string;
  }>;
}

export const VIEW_MODE_DEFS: Array<{
  id: FlowViewMode;
  label: string;
  iconName: string;
  description: string;
}> = [
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

export const SIMULATION_ATTACKS: SimulationAttack[] = [
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

// Initial mock lifecycle tasks for Phase 2
export const INITIAL_LIFECYCLE_TASKS: FlowNodeDetail[] = [
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
      prohibitedCommands: ["npm test", "pytest", "jest", "cargo test"],
      invariants: {
        preConditions: ["PRD.md exists and is readable", "No source code files modified"],
        strictInvariants: ["Read-only file system access during Phase 1"],
        postConditions: ["task-queue.json emitted with status=pending"],
      },
    },
    metrics: {
      durationMs: 42,
      latencyMs: 8,
      toolCallsCount: 3,
      tokensDensityKb: 14.2,
      liveDiff: {
        targetFile: "task-queue.json",
        additions: 48,
        deletions: 0,
        diffSnippet: `+  "tasks": [\n+    { "id": "TASK-01", "name": "PRD Schema Decomposition", "status": "passed" },\n+    { "id": "TASK-02", "name": "Flow Studio Canvas Visualizer", "status": "in_progress" }\n+  ]`,
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
        preConditions: ["Work scope set to implementation", "Scoped test file pinned"],
        strictInvariants: [
          "Only scoped test file executed",
          "Test storm execution strictly blocked by guard",
        ],
        postConditions: ["Canvas renders all 4 views", "Inspector drawer opens on click"],
      },
    },
    metrics: {
      durationMs: 118,
      latencyMs: 14,
      toolCallsCount: 7,
      tokensDensityKb: 28.6,
      liveDiff: {
        targetFile: "apps/catalog-ui/src/components/flow/FlowStudioCanvas.tsx",
        additions: 185,
        deletions: 0,
        diffSnippet: `+export function FlowStudioCanvas() {\n+  const [viewMode, setViewMode] = useState<FlowViewMode>("lifecycle");\n+  return <div className="flow-canvas-container">...</div>;\n+}`,
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
    metrics: {
      durationMs: 15,
      latencyMs: 4,
      toolCallsCount: 2,
      tokensDensityKb: 12.0,
      liveDiff: {
        targetFile: "apps/catalog-ui/src/components/flow/FlowPlaybackController.tsx",
        additions: 92,
        deletions: 0,
        diffSnippet: `+export function runSimulationAttack(attack: SimulationAttack) {\n+  // Short-circuit traversal in < 200ms\n+  return evaluateGuardPipeline(attack.command);\n+}`,
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
    metrics: {
      durationMs: 0,
      tokensDensityKb: 45.1,
    },
  },
];
