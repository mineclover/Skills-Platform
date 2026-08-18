const test = require("node:test");
const assert = require("node:assert/strict");
const { createActivationPlan, validateActivationPlan } = require("../src");

function operation() {
  return {
    registry_skill_id: "skill_local_ux",
    source_revision_id: "revision_abc",
    content_digest: "a".repeat(64),
    canonical_path: "C:/registry/revisions/abc/artifacts/ux",
    delivery_path: "C:/project/.agents/skills/ux",
    desired_state: "enabled",
  };
}

test("creates a validated default symlink activation plan", () => {
  const plan = createActivationPlan({
    now: new Date("2026-08-14T00:00:00.000Z"),
    target: {
      project_id: "project_ui",
      project_path: "C:/project",
      provider_id: "codex",
      scope: "project",
    },
    operations: [operation()],
  });

  assert.equal(plan.schema_version, 1);
  assert.equal(plan.mode, "apply");
  assert.equal(plan.distribution.method, "symlink");
  assert.equal(validateActivationPlan(plan).valid, true);
});

test("rejects a project plan without a project target", () => {
  const result = validateActivationPlan({
    plan_id: "plan_1",
    schema_version: 1,
    created_at: "2026-08-14T00:00:00.000Z",
    mode: "apply",
    target: { provider_id: "codex", scope: "project" },
    distribution: { method: "symlink" },
    operations: [operation()],
  });

  assert.equal(result.valid, false);
  assert.ok(result.issues.some((issue) => issue.field === "target.project_id"));
});

test("allows an empty pristine plan so the adapter can reconcile an empty managed set", () => {
  const plan = createActivationPlan({
    mode: "pristine",
    target: { provider_id: "codex", scope: "global" },
    operations: [],
  });

  assert.equal(plan.mode, "pristine");
  assert.equal(plan.operations.length, 0);
});

test("rejects two operations that would mutate the same delivery path", () => {
  const first = operation();
  const result = validateActivationPlan({
    plan_id: "plan_duplicated_path",
    schema_version: 1,
    created_at: "2026-08-14T00:00:00.000Z",
    mode: "apply",
    target: { provider_id: "codex", scope: "global" },
    distribution: { method: "symlink" },
    operations: [first, { ...first, registry_skill_id: "skill_other" }],
  });

  assert.equal(result.valid, false);
  assert.ok(result.issues.some((issue) => issue.message.includes("duplicate")));
});

test("supports specific artifact types (rule, hook, plugin, mcp_server) and rejects unknown types", () => {
  const ruleOp = { ...operation(), artifact_type: "rule" };
  const plan = createActivationPlan({
    target: { provider_id: "antigravity", scope: "global" },
    operations: [ruleOp],
  });
  assert.equal(plan.operations[0].artifact_type, "rule");

  const invalidResult = validateActivationPlan({
    plan_id: "plan_invalid_type",
    schema_version: 1,
    created_at: "2026-08-14T00:00:00.000Z",
    mode: "apply",
    target: { provider_id: "antigravity", scope: "global" },
    distribution: { method: "symlink" },
    operations: [{ ...operation(), artifact_type: "invalid_type" }],
  });
  assert.equal(invalidResult.valid, false);
  assert.ok(invalidResult.issues.some((issue) => issue.field === "operations[0].artifact_type"));
});
