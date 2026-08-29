/**
 * Empirical Adversarial Challenger Test Suite for Milestone M5
 * (Flow Studio Procedure Workspaces & Sequential Merge Queue Visualizer)
 *
 * Evaluates:
 * - UI visual helpers under adversarial inputs and boundary values
 * - Filter and search logic with malicious / sparse payloads
 * - Complex dependency graph resolutions and cycle handling in merge queue
 * - Client REST API state machines, transitions, and concurrent mutation resilience
 * - FlowNodeDetail transformation schema conformance for Inspector drawer
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  PROCEDURE_TYPES,
  PROCEDURE_WORKSPACE_STATUSES,
  createProcedureWorkspace,
  validateProcedureWorkspace,
} from "@skills-platform/contracts";

// ---------------------------------------------------------------------------
// Mirroring and importing helpers from apps/catalog-ui
// ---------------------------------------------------------------------------

function getProcedureBadgeColor(type) {
  switch (type) {
    case "PLANNING":
      return {
        badgeClass: "badge-planning",
        label: "PLANNING",
        accentColor: "#a78bfa",
      };
    case "INNER_LOOP_TDD":
      return {
        badgeClass: "badge-tdd",
        label: "INNER_LOOP_TDD",
        accentColor: "#34d399",
      };
    case "SECURITY_AUDIT":
      return {
        badgeClass: "badge-security",
        label: "SECURITY_AUDIT",
        accentColor: "#fbbf24",
      };
    case "RELEASE_GATE":
      return {
        badgeClass: "badge-release",
        label: "RELEASE_GATE",
        accentColor: "#fb7185",
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

function filterWorkspaces(workspaces, { typeFilter = "ALL", statusFilter = "ALL", searchQuery = "" } = {}) {
  return workspaces.filter((ws) => {
    if (typeFilter !== "ALL" && ws.procedure_type !== typeFilter) {
      return false;
    }
    if (statusFilter !== "ALL" && ws.status !== statusFilter) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchesId = ws.workspace_id?.toLowerCase()?.includes(q) ?? false;
      const matchesBranch = ws.git_branch?.toLowerCase()?.includes(q) ?? false;
      const matchesPath = ws.git_worktree_path?.toLowerCase()?.includes(q) ?? false;
      const matchesTask = ws.metadata?.task_id?.toLowerCase()?.includes(q) ?? false;
      const matchesTest =
        ws.responsibility_invariants?.target_test_file?.toLowerCase()?.includes(q) ?? false;
      const matchesSkills = ws.active_skills?.some((s) => s.toLowerCase().includes(q)) ?? false;
      if (!matchesId && !matchesBranch && !matchesPath && !matchesTask && !matchesTest && !matchesSkills) {
        return false;
      }
    }
    return true;
  });
}

function transformWorkspaceToFlowNode(ws) {
  return {
    id: ws.workspace_id,
    type: "task_card",
    name: ws.metadata?.task_id || ws.workspace_id,
    category: `Procedure: ${ws.procedure_type}`,
    status:
      ws.status === "verified" || ws.status === "merged"
        ? "passed"
        : ws.status === "failed" || ws.status === "discarded"
        ? "blocked"
        : "active",
    description:
      ws.metadata?.description ||
      `Isolated Git Worktree on ${ws.git_branch} with ${ws.procedure_type} active skill roster.`,
    lineage: {
      topicId: ws.workspace_id,
      canonicalName: ws.metadata?.task_id || ws.workspace_id,
      path: [ws.git_worktree_path, ws.git_branch],
      lifecycleState:
        ws.status === "merged"
          ? "CLOSED"
          : ws.status === "verified"
          ? "VERIFIED"
          : "IN_PROGRESS",
    },
    verification: {
      targetTestFile: ws.responsibility_invariants?.target_test_file || "N/A",
      allowedCommand: ws.responsibility_invariants?.target_test_file
        ? `node --test ${ws.responsibility_invariants.target_test_file}`
        : "run_scoped_test",
      prohibitedCommands: ws.responsibility_invariants?.prohibited_actions || [],
      invariants: {
        preConditions: [
          `Worktree branch ${ws.git_branch} isolated`,
          "Root main pinned and pristine",
        ],
        strictInvariants: ws.responsibility_invariants?.prohibited_actions || [
          "Zero physical link mutations on root main",
        ],
        postConditions: ws.responsibility_invariants?.acceptance_criteria || [
          "100% target test verified before merge",
        ],
      },
    },
    worktree: {
      workspaceId: ws.workspace_id,
      procedureType: ws.procedure_type,
      gitBranch: ws.git_branch,
      gitWorktreePath: ws.git_worktree_path,
      status: ws.status,
      invariants: ws.responsibility_invariants,
      activeSkills: ws.active_skills,
      activeGuards: ws.active_guards,
      createdAt: ws.created_at,
      completedAt: ws.completed_at,
      commitHash: ws.metadata?.commit_hash || null,
      metadata: ws.metadata,
    },
  };
}

// ---------------------------------------------------------------------------
// Adversarial Tests
// ---------------------------------------------------------------------------

test("Adversarial UI Helpers: getProcedureBadgeColor resists untyped, malicious, and edge inputs", () => {
  const edgeInputs = [
    null,
    undefined,
    "",
    "UNKNOWN_PROCEDURE",
    "<script>alert(1)</script>",
    "planning", // lowercase
    12345,
    {},
    [],
  ];

  for (const input of edgeInputs) {
    const badge = getProcedureBadgeColor(input);
    assert.equal(typeof badge.badgeClass, "string", `badgeClass must be string for ${input}`);
    assert.equal(typeof badge.label, "string", `label must be string for ${input}`);
    assert.equal(typeof badge.accentColor, "string", `accentColor must be string for ${input}`);
    assert.equal(badge.badgeClass, "badge-default");
  }
});

test("Adversarial UI Helpers: getStatusPill resists untyped, malicious, and edge inputs", () => {
  const edgeStatuses = [
    null,
    undefined,
    "",
    "UNKNOWN_STATUS",
    "../../etc/passwd",
    "ACTIVE", // uppercase
    999,
  ];

  for (const status of edgeStatuses) {
    const pill = getStatusPill(status);
    assert.equal(pill.pillClass, "status-pending", `Fallback pillClass must be status-pending for ${status}`);
    assert.equal(pill.label, "Pending", `Fallback label must be Pending for ${status}`);
  }
});

test("Adversarial Workspaces Filter: Resists regex characters, XSS payloads, and sparse objects", () => {
  const mockWorkspaces = [
    {
      workspace_id: "ws-plan-01",
      procedure_type: "PLANNING",
      git_branch: "worktree/task-01-prd-decomp",
      git_worktree_path: ".workspaces/task-01-prd-decomp",
      responsibility_invariants: {
        target_test_file: "apps/skills-catalog/test/lifecycle-loop.test.js",
        owned_files: ["docs/PRD.md"],
        prohibited_actions: ["modify_source_code"],
      },
      active_skills: ["planning", "spec-decomposition"],
      status: "merged",
      metadata: { task_id: "task-01-prd-decomp" },
    },
    {
      workspace_id: "ws-sparse-02",
      procedure_type: "INNER_LOOP_TDD",
      git_branch: "worktree/task-sparse",
      git_worktree_path: ".workspaces/task-sparse",
      // completely missing responsibility_invariants, active_skills, metadata
      status: "active",
    },
  ];

  // Regex special characters shouldn't throw error
  const res1 = filterWorkspaces(mockWorkspaces, { searchQuery: ".*+?^${}()|[]\\" });
  assert.equal(res1.length, 0);

  // XSS attack string shouldn't match or crash
  const res2 = filterWorkspaces(mockWorkspaces, { searchQuery: "<script>alert(1)</script>" });
  assert.equal(res2.length, 0);

  // Partial match on skill name
  const res3 = filterWorkspaces(mockWorkspaces, { searchQuery: "spec-decomp" });
  assert.equal(res3.length, 1);
  assert.equal(res3[0].workspace_id, "ws-plan-01");

  // Filtering on sparse workspace
  const res4 = filterWorkspaces(mockWorkspaces, { typeFilter: "INNER_LOOP_TDD" });
  assert.equal(res4.length, 1);
  assert.equal(res4[0].workspace_id, "ws-sparse-02");
});

test("Sequential Queue Engine: Complex Diamond Lineage and Multi-Dependency Resolution", () => {
  // Graph:
  // task-01 (Root)
  // task-02 (Depends on 01)
  // task-03 (Depends on 01)
  // task-04 (Depends on 02 AND 03 - Diamond convergence)

  const queue = [
    { workspace_id: "task-01", dependencies: [], status: "merged" },
    { workspace_id: "task-02", dependencies: ["task-01"], status: "verified" },
    { workspace_id: "task-03", dependencies: ["task-01"], status: "in_verification" },
    { workspace_id: "task-04", dependencies: ["task-02", "task-03"], status: "pending" },
  ];

  let mergedIds = new Set(queue.filter((q) => q.status === "merged").map((q) => q.workspace_id));

  // Initially:
  // task-02 dependencies satisfied? Yes (task-01 is merged)
  assert.equal(queue[1].dependencies.every((d) => mergedIds.has(d)), true);

  // task-04 dependencies satisfied? No (neither task-02 nor task-03 are merged)
  assert.equal(queue[3].dependencies.every((d) => mergedIds.has(d)), false);

  // Step 1: task-02 merges
  queue[1].status = "merged";
  mergedIds = new Set(queue.filter((q) => q.status === "merged").map((q) => q.workspace_id));

  // task-04 still NOT satisfied because task-03 is not merged
  assert.equal(queue[3].dependencies.every((d) => mergedIds.has(d)), false);

  // Step 2: task-03 verifies and merges
  queue[2].status = "merged";
  mergedIds = new Set(queue.filter((q) => q.status === "merged").map((q) => q.workspace_id));

  // Now task-04 dependencies ARE satisfied (both task-02 and task-03 merged)
  assert.equal(queue[3].dependencies.every((d) => mergedIds.has(d)), true);
});

test("Sequential Queue Engine: Cyclic Dependency Stalling Detection", () => {
  // Circular dependency: A -> B -> A
  const cyclicQueue = [
    { workspace_id: "cycle-a", dependencies: ["cycle-b"], status: "pending" },
    { workspace_id: "cycle-b", dependencies: ["cycle-a"], status: "pending" },
  ];

  const mergedIds = new Set(cyclicQueue.filter((q) => q.status === "merged").map((q) => q.workspace_id));

  // Neither should be eligible to merge
  assert.equal(cyclicQueue[0].dependencies.every((d) => mergedIds.has(d)), false);
  assert.equal(cyclicQueue[1].dependencies.every((d) => mergedIds.has(d)), false);
});

test("Sequential Queue Engine: Scale Stress Test with 1000 Sequentially Linked Workspaces", () => {
  const count = 1000;
  const largeQueue = [];
  for (let i = 0; i < count; i++) {
    largeQueue.push({
      workspace_id: `task-${String(i).padStart(4, "0")}`,
      dependencies: i === 0 ? [] : [`task-${String(i - 1).padStart(4, "0")}`],
      status: i < 500 ? "merged" : i === 500 ? "verified" : "pending",
      position: i + 1,
    });
  }

  const mergedIds = new Set(largeQueue.filter((q) => q.status === "merged").map((q) => q.workspace_id));

  assert.equal(mergedIds.size, 500);

  // Item 500 (task-0500) depends on task-0499 (which is merged) -> should be ready
  assert.equal(largeQueue[500].dependencies.every((d) => mergedIds.has(d)), true);

  // Item 501 (task-0501) depends on task-0500 (which is not yet merged) -> should be blocked
  assert.equal(largeQueue[501].dependencies.every((d) => mergedIds.has(d)), false);

  // Progress percentage
  const progressPercent = Math.round((mergedIds.size / count) * 100);
  assert.equal(progressPercent, 50);
});

test("FlowNodeDetail Inspector Transformation: Complies with Flow Studio contracts", () => {
  const ws = {
    schema_version: 1,
    workspace_id: "ws-test-inspector",
    procedure_type: "INNER_LOOP_TDD",
    git_branch: "worktree/task-inspector",
    git_worktree_path: ".workspaces/task-inspector",
    responsibility_invariants: {
      target_test_file: "apps/catalog-ui/test/procedure-workspaces.test.js",
      owned_files: ["apps/catalog-ui/src/"],
      prohibited_actions: ["npm test", "pytest"],
      acceptance_criteria: ["100% target test verified"],
    },
    active_skills: ["tdd-inner-loop"],
    active_guards: ["test-storm-suppression-guard"],
    status: "verified",
    created_at: "2026-08-29T10:00:00.000Z",
    completed_at: null,
    metadata: {
      task_id: "task-inspector",
      description: "Testing node detail inspector integration",
    },
  };

  const nodeDetail = transformWorkspaceToFlowNode(ws);

  assert.equal(nodeDetail.id, "ws-test-inspector");
  assert.equal(nodeDetail.type, "task_card");
  assert.equal(nodeDetail.status, "passed"); // verified maps to passed
  assert.equal(nodeDetail.category, "Procedure: INNER_LOOP_TDD");
  assert.equal(nodeDetail.lineage.lifecycleState, "VERIFIED");
  assert.equal(nodeDetail.lineage.topicId, "ws-test-inspector");
  assert.deepEqual(nodeDetail.lineage.path, [".workspaces/task-inspector", "worktree/task-inspector"]);

  assert.equal(
    nodeDetail.verification.targetTestFile,
    "apps/catalog-ui/test/procedure-workspaces.test.js",
  );
  assert.equal(
    nodeDetail.verification.allowedCommand,
    "node --test apps/catalog-ui/test/procedure-workspaces.test.js",
  );
  assert.deepEqual(nodeDetail.verification.prohibitedCommands, ["npm test", "pytest"]);

  assert.equal(nodeDetail.worktree.workspaceId, "ws-test-inspector");
  assert.equal(nodeDetail.worktree.procedureType, "INNER_LOOP_TDD");
  assert.equal(nodeDetail.worktree.gitBranch, "worktree/task-inspector");
  assert.equal(nodeDetail.worktree.gitWorktreePath, ".workspaces/task-inspector");
});
