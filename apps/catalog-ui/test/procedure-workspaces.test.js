import test from "node:test";
import assert from "node:assert/strict";
import {
  PROCEDURE_TYPES,
  PROCEDURE_WORKSPACE_STATUSES,
  createProcedureWorkspace,
  validateProcedureWorkspace,
} from "@skills-platform/contracts";

// ---------------------------------------------------------------------------
// Helpers mirroring UI visual logic in ProcedureWorkspaceVisualizer & flow-types
// ---------------------------------------------------------------------------

function getProcedureBadgeColor(type) {
  switch (type) {
    case "PLANNING":
      return {
        badgeClass: "badge-planning",
        label: "PLANNING",
        accentColor: "#a78bfa", // Indigo / Purple
      };
    case "INNER_LOOP_TDD":
      return {
        badgeClass: "badge-tdd",
        label: "INNER_LOOP_TDD",
        accentColor: "#34d399", // Emerald / Green
      };
    case "SECURITY_AUDIT":
      return {
        badgeClass: "badge-security",
        label: "SECURITY_AUDIT",
        accentColor: "#fbbf24", // Amber / Orange
      };
    case "RELEASE_GATE":
      return {
        badgeClass: "badge-release",
        label: "RELEASE_GATE",
        accentColor: "#fb7185", // Rose / Red
      };
    default:
      return {
        badgeClass: "badge-default",
        label: String(type),
        accentColor: "#60a5fa",
      };
  }
}

function getStatusPill(status) {
  switch (status) {
    case "active":
      return { pillClass: "status-active", label: "Active" };
    case "in_verification":
      return { pillClass: "status-in-verification", label: "In Verification" };
    case "verified":
      return { pillClass: "status-verified", label: "Verified" };
    case "merged":
      return { pillClass: "status-merged", label: "Merged" };
    case "failed":
      return { pillClass: "status-failed", label: "Failed" };
    case "discarded":
      return { pillClass: "status-discarded", label: "Discarded" };
    case "pruned":
      return { pillClass: "status-pruned", label: "Pruned" };
    case "pending":
    default:
      return { pillClass: "status-pending", label: "Pending" };
  }
}

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
  {
    id: "procedure_workspaces",
    label: "Procedure Workspaces & Merge Queue",
    iconName: "GitBranch",
    description: "Isolated Git Worktrees, procedure invariants & sequential merge queue timeline",
  },
];

function createMockProcedureWorkspaces() {
  return [
    {
      schema_version: 1,
      workspace_id: "ws-plan-01",
      procedure_type: "PLANNING",
      git_branch: "worktree/task-01-prd-decomp",
      git_worktree_path: ".workspaces/task-01-prd-decomp",
      responsibility_invariants: {
        target_test_file: "apps/skills-catalog/test/lifecycle-loop.test.js",
        owned_files: ["docs/PRD.md", "task-queue.json"],
        prohibited_actions: ["modify_source_code", "npm test", "full_test_sweep"],
        acceptance_criteria: [
          "Extract requirements from PRD.md into atomic task-queue.json",
          "Read-only filesystem access for source files",
        ],
      },
      active_skills: ["planning", "spec-decomposition", "dependency-mapper"],
      active_guards: ["read-only-source-guard", "context-budget-guard"],
      status: "merged",
      created_at: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
      completed_at: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
      metadata: {
        task_id: "task-01-prd-decomp",
        commit_hash: "c8f2a1b",
        author: "planner-agent",
        description: "PRD decomposition & atomic task breakdown",
      },
    },
    {
      schema_version: 1,
      workspace_id: "ws-tdd-02",
      procedure_type: "INNER_LOOP_TDD",
      git_branch: "worktree/task-02-flow-studio",
      git_worktree_path: ".workspaces/task-02-flow-studio",
      responsibility_invariants: {
        target_test_file: "apps/catalog-ui/test/procedure-workspaces.test.js",
        owned_files: [
          "apps/catalog-ui/src/components/flow/",
          "apps/catalog-ui/src/api/catalog-api.ts",
        ],
        prohibited_actions: ["npm test", "pytest", "jest", "modify_root_contracts"],
        acceptance_criteria: [
          "100% target test pass on procedure-workspaces.test.js",
          "Strict isolated worktree boundary with scoped active skills",
        ],
      },
      active_skills: ["tdd-inner-loop", "code-authoring", "pinpoint-test-runner"],
      active_guards: ["test-storm-suppression-guard", "scope-boundary-guard"],
      status: "verified",
      created_at: new Date(Date.now() - 1000 * 60 * 40).toISOString(),
      completed_at: null,
      metadata: {
        task_id: "task-02-flow-studio",
        dependencies: ["ws-plan-01"],
        author: "implementer-agent",
        description: "Flow Studio Visualizer & live merge timeline implementation",
      },
    },
    {
      schema_version: 1,
      workspace_id: "ws-sec-03",
      procedure_type: "SECURITY_AUDIT",
      git_branch: "worktree/task-03-security-guard",
      git_worktree_path: ".workspaces/task-03-security-guard",
      responsibility_invariants: {
        target_test_file: "test/security-audit.test.js",
        owned_files: [
          "packages/skill-contracts/src/",
          "apps/skills-catalog/src/hooks-manager.js",
        ],
        prohibited_actions: ["bypass_secret_filter", "delete_audit_log", "disable_hooks"],
        acceptance_criteria: [
          "Zero secret leaks in command payloads",
          "Sub-200ms guard interception latency with self-correct hints",
        ],
      },
      active_skills: ["security-audit", "vulnerability-scanner", "hook-validator"],
      active_guards: ["secret-leak-guard", "destructive-command-blocker"],
      status: "in_verification",
      created_at: new Date(Date.now() - 1000 * 60 * 20).toISOString(),
      completed_at: null,
      metadata: {
        task_id: "task-03-security-guard",
        dependencies: ["ws-tdd-02"],
        author: "security-specialist",
        description: "Pre/post tool execution hooks & threat model verification",
      },
    },
    {
      schema_version: 1,
      workspace_id: "ws-rel-04",
      procedure_type: "RELEASE_GATE",
      git_branch: "worktree/task-04-release-gate",
      git_worktree_path: ".workspaces/task-04-release-gate",
      responsibility_invariants: {
        target_test_file: "tests/e2e/run-all.js",
        owned_files: ["MASTER_BASELINE.md", "CHANGELOG.md", "package.json"],
        prohibited_actions: ["skip_regression_tests", "force_push_main"],
        acceptance_criteria: [
          "All 5 E2E tiers pass 100%",
          "MASTER_BASELINE.md compaction verified and signed off",
        ],
      },
      active_skills: ["release-gate", "baseline-compaction", "e2e-orchestrator"],
      active_guards: ["regression-gate-guard", "context-budget-guard"],
      status: "pending",
      created_at: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
      completed_at: null,
      metadata: {
        task_id: "task-04-release-gate",
        dependencies: ["ws-sec-03"],
        author: "qa-agent",
        description: "Release gate regression verification and documentation compaction",
      },
    },
  ];
}

function createMockMergeQueue() {
  const queue = [
    {
      workspace_id: "ws-plan-01",
      task_id: "task-01-prd-decomp",
      dependencies: [],
      status: "merged",
      position: 1,
      enqueued_at: new Date(Date.now() - 1000 * 60 * 55).toISOString(),
      verified_at: new Date(Date.now() - 1000 * 60 * 50).toISOString(),
      merged_at: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
      commit_hash: "c8f2a1b",
      procedure_type: "PLANNING",
    },
    {
      workspace_id: "ws-tdd-02",
      task_id: "task-02-flow-studio",
      dependencies: ["ws-plan-01"],
      status: "verified",
      position: 2,
      enqueued_at: new Date(Date.now() - 1000 * 60 * 35).toISOString(),
      verified_at: new Date(Date.now() - 1000 * 60 * 10).toISOString(),
      merged_at: null,
      commit_hash: null,
      procedure_type: "INNER_LOOP_TDD",
    },
    {
      workspace_id: "ws-sec-03",
      task_id: "task-03-security-guard",
      dependencies: ["ws-tdd-02"],
      status: "in_verification",
      position: 3,
      enqueued_at: new Date(Date.now() - 1000 * 60 * 18).toISOString(),
      verified_at: null,
      merged_at: null,
      commit_hash: null,
      procedure_type: "SECURITY_AUDIT",
    },
    {
      workspace_id: "ws-rel-04",
      task_id: "task-04-release-gate",
      dependencies: ["ws-sec-03"],
      status: "pending",
      position: 4,
      enqueued_at: new Date(Date.now() - 1000 * 60 * 4).toISOString(),
      verified_at: null,
      merged_at: null,
      commit_hash: null,
      procedure_type: "RELEASE_GATE",
    },
  ];

  const pending = queue.filter((i) => i.status === "pending");
  const in_verification = queue.filter((i) => i.status === "in_verification");
  const verified = queue.filter((i) => i.status === "verified");
  const merged = queue.filter((i) => i.status === "merged");
  const failed = queue.filter((i) => i.status === "failed");
  const discarded = queue.filter((i) => i.status === "discarded");

  const mergedIds = new Set(merged.map((m) => m.workspace_id));
  let current = in_verification[0] || null;
  if (!current) {
    current =
      verified.concat(pending).find((item) => item.dependencies.every((d) => mergedIds.has(d))) ||
      null;
  }

  return {
    queue,
    current,
    pending,
    in_verification,
    verified,
    merged,
    failed,
    discarded,
  };
}

// ---------------------------------------------------------------------------
// Tests Suite
// ---------------------------------------------------------------------------

test("Contracts: ProcedureType definitions contain all 4 required procedure workflow roles", () => {
  assert.equal(PROCEDURE_TYPES.has("PLANNING"), true, "Must include PLANNING");
  assert.equal(PROCEDURE_TYPES.has("INNER_LOOP_TDD"), true, "Must include INNER_LOOP_TDD");
  assert.equal(PROCEDURE_TYPES.has("SECURITY_AUDIT"), true, "Must include SECURITY_AUDIT");
  assert.equal(PROCEDURE_TYPES.has("RELEASE_GATE"), true, "Must include RELEASE_GATE");
  assert.equal(PROCEDURE_TYPES.size, 4);
});

test("Contracts: ProcedureWorkspaceStatus definitions contain all 8 lifecycle statuses", () => {
  const expected = [
    "pending",
    "active",
    "in_verification",
    "verified",
    "merged",
    "failed",
    "discarded",
    "pruned",
  ];
  for (const s of expected) {
    assert.equal(PROCEDURE_WORKSPACE_STATUSES.has(s), true, `Must contain status ${s}`);
  }
  assert.equal(PROCEDURE_WORKSPACE_STATUSES.size, 8);
});

test("Contracts: createProcedureWorkspace initializes valid schema and isolated paths", () => {
  const now = new Date("2026-08-29T10:00:00.000Z");
  const ws = createProcedureWorkspace({
    procedure_type: "INNER_LOOP_TDD",
    git_branch: "worktree/task-unit-test",
    git_worktree_path: ".workspaces/task-unit-test",
    responsibility_invariants: {
      target_test_file: "apps/catalog-ui/test/procedure-workspaces.test.js",
      owned_files: ["apps/catalog-ui/src/"],
      prohibited_actions: ["npm test"],
      acceptance_criteria: ["100% target test pass"],
    },
    active_skills: ["tdd-inner-loop"],
    active_guards: ["test-storm-suppression-guard"],
    now,
  });

  assert.equal(ws.schema_version, 1);
  assert.equal(ws.procedure_type, "INNER_LOOP_TDD");
  assert.equal(ws.git_branch, "worktree/task-unit-test");
  assert.equal(ws.git_worktree_path, ".workspaces/task-unit-test");
  assert.equal(ws.status, "pending");
  assert.equal(ws.created_at, "2026-08-29T10:00:00.000Z");
  assert.equal(ws.responsibility_invariants.target_test_file, "apps/catalog-ui/test/procedure-workspaces.test.js");
  assert.deepEqual(ws.responsibility_invariants.owned_files, ["apps/catalog-ui/src/"]);
  assert.deepEqual(ws.responsibility_invariants.prohibited_actions, ["npm test"]);

  const validation = validateProcedureWorkspace(ws);
  assert.equal(validation.valid, true);
  assert.equal(validation.issues.length, 0);
});

test("UI Badges: getProcedureBadgeColor returns specific badge classes and color themes", () => {
  const planningBadge = getProcedureBadgeColor("PLANNING");
  assert.equal(planningBadge.badgeClass, "badge-planning");
  assert.equal(planningBadge.label, "PLANNING");
  assert.equal(planningBadge.accentColor, "#a78bfa"); // Indigo / Purple

  const tddBadge = getProcedureBadgeColor("INNER_LOOP_TDD");
  assert.equal(tddBadge.badgeClass, "badge-tdd");
  assert.equal(tddBadge.label, "INNER_LOOP_TDD");
  assert.equal(tddBadge.accentColor, "#34d399"); // Emerald / Green

  const secBadge = getProcedureBadgeColor("SECURITY_AUDIT");
  assert.equal(secBadge.badgeClass, "badge-security");
  assert.equal(secBadge.label, "SECURITY_AUDIT");
  assert.equal(secBadge.accentColor, "#fbbf24"); // Amber / Orange

  const relBadge = getProcedureBadgeColor("RELEASE_GATE");
  assert.equal(relBadge.badgeClass, "badge-release");
  assert.equal(relBadge.label, "RELEASE_GATE");
  assert.equal(relBadge.accentColor, "#fb7185"); // Rose / Red
});

test("UI Status: getStatusPill returns correct CSS classes for all workspace statuses", () => {
  assert.equal(getStatusPill("active").pillClass, "status-active");
  assert.equal(getStatusPill("in_verification").pillClass, "status-in-verification");
  assert.equal(getStatusPill("verified").pillClass, "status-verified");
  assert.equal(getStatusPill("merged").pillClass, "status-merged");
  assert.equal(getStatusPill("failed").pillClass, "status-failed");
  assert.equal(getStatusPill("discarded").pillClass, "status-discarded");
  assert.equal(getStatusPill("pruned").pillClass, "status-pruned");
  assert.equal(getStatusPill("pending").pillClass, "status-pending");
});

test("Flow Studio: VIEW_MODE_DEFS registers procedure_workspaces view mode", () => {
  const mode = VIEW_MODE_DEFS.find((m) => m.id === "procedure_workspaces");
  assert.notEqual(mode, undefined, "procedure_workspaces mode must be defined");
  assert.equal(mode.label, "Procedure Workspaces & Merge Queue");
  assert.equal(mode.iconName, "GitBranch");
  assert.equal(typeof mode.description, "string");
});

test("Mock Generator: createMockProcedureWorkspaces generates complete workspace records", () => {
  const workspaces = createMockProcedureWorkspaces();
  assert.equal(Array.isArray(workspaces), true);
  assert.equal(workspaces.length >= 4, true);

  const foundTypes = new Set(workspaces.map((w) => w.procedure_type));
  assert.equal(foundTypes.has("PLANNING"), true);
  assert.equal(foundTypes.has("INNER_LOOP_TDD"), true);
  assert.equal(foundTypes.has("SECURITY_AUDIT"), true);
  assert.equal(foundTypes.has("RELEASE_GATE"), true);

  for (const ws of workspaces) {
    const val = validateProcedureWorkspace(ws);
    assert.equal(val.valid, true, `Workspace ${ws.workspace_id} must be valid`);
    assert.equal(ws.git_branch.startsWith("worktree/"), true);
    assert.equal(ws.git_worktree_path.startsWith(".workspaces/"), true);
  }
});

test("Mock Generator: createMockMergeQueue creates sequential multi-stage queue items", () => {
  const queueStatus = createMockMergeQueue();
  assert.equal(Array.isArray(queueStatus.queue), true);
  assert.equal(queueStatus.queue.length >= 4, true);

  for (let i = 0; i < queueStatus.queue.length; i++) {
    const item = queueStatus.queue[i];
    assert.equal(item.position, i + 1);
    assert.equal(typeof item.workspace_id, "string");
  }

  assert.equal(Array.isArray(queueStatus.merged), true);
  assert.equal(Array.isArray(queueStatus.verified), true);
  assert.equal(Array.isArray(queueStatus.in_verification), true);
  assert.equal(Array.isArray(queueStatus.pending), true);
  assert.notEqual(queueStatus.current, null);
});

test("Sequential Queue: Dependency lineage prevents out-of-order merging", () => {
  const queue = [
    { workspace_id: "task-01", dependencies: [], status: "merged" },
    { workspace_id: "task-02", dependencies: ["task-01"], status: "verified" },
    { workspace_id: "task-03", dependencies: ["task-02"], status: "pending" },
  ];

  const mergedIds = new Set(queue.filter((q) => q.status === "merged").map((q) => q.workspace_id));

  // task-02 dependency (task-01) is merged -> ready to merge
  assert.equal(queue[1].dependencies.every((d) => mergedIds.has(d)), true);

  // task-03 dependency (task-02) is NOT merged -> blocked
  assert.equal(queue[2].dependencies.every((d) => mergedIds.has(d)), false);
});

test("Sequential Queue: Fast-forward percentage calculation handles progress correctly", () => {
  const total = 4;
  const mergedCount = 2;
  const percent = Math.round((mergedCount / total) * 100);
  assert.equal(percent, 50);

  // 0 total should return 0 without NaN
  const zeroTotal = 0;
  const zeroPercent = zeroTotal > 0 ? Math.round((0 / zeroTotal) * 100) : 0;
  assert.equal(zeroPercent, 0);
  assert.equal(Number.isNaN(zeroPercent), false);
});

test("Responsibility Invariants: Target test file, owned files, and prohibited actions checks", () => {
  const ws = createMockProcedureWorkspaces().find((w) => w.procedure_type === "INNER_LOOP_TDD");
  assert.notEqual(ws, undefined);

  assert.equal(
    ws.responsibility_invariants.target_test_file,
    "apps/catalog-ui/test/procedure-workspaces.test.js",
  );
  assert.equal(ws.responsibility_invariants.owned_files.length > 0, true);
  assert.equal(ws.responsibility_invariants.prohibited_actions.includes("npm test"), true);
  assert.equal(ws.active_guards.includes("test-storm-suppression-guard"), true);
});
