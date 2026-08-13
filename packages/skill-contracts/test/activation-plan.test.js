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
  assert.equal(plan.distribution.method, "symlink");
  assert.equal(validateActivationPlan(plan).valid, true);
});

test("rejects a project plan without a project target", () => {
  const result = validateActivationPlan({
    plan_id: "plan_1",
    schema_version: 1,
    created_at: "2026-08-14T00:00:00.000Z",
    target: { provider_id: "codex", scope: "project" },
    distribution: { method: "symlink" },
    operations: [operation()],
  });

  assert.equal(result.valid, false);
  assert.ok(result.issues.some((issue) => issue.field === "target.project_id"));
});
