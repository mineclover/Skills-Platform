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

test("supports invocation modes (model_invoked, user_invoked, hybrid, unspecified) and rejects unknown modes", () => {
  const userOp = { ...operation(), invocation_mode: "user_invoked" };
  const plan = createActivationPlan({
    target: { provider_id: "codex", scope: "global" },
    operations: [userOp],
  });
  assert.equal(plan.operations[0].invocation_mode, "user_invoked");

  const invalidResult = validateActivationPlan({
    plan_id: "plan_invalid_mode",
    schema_version: 1,
    created_at: "2026-08-14T00:00:00.000Z",
    mode: "apply",
    target: { provider_id: "codex", scope: "global" },
    distribution: { method: "symlink" },
    operations: [{ ...operation(), invocation_mode: "magic_invoked" }],
  });
  assert.equal(invalidResult.valid, false);
  assert.ok(invalidResult.issues.some((issue) => issue.field === "operations[0].invocation_mode"));
});

test("Vertical Topic Spec: validates, creates, and renders compliant markdown specification", () => {
  const {
    createVerticalTopicSpec,
    validateVerticalTopicSpec,
    renderVerticalTopicMarkdown,
  } = require("../src");

  const spec = createVerticalTopicSpec({
    topic_id: "topic:auth_subsystem/jwt_verification_latency",
    canonical_name: "Resolve JWT Signature Verification Latency and Cache Drift",
    lineage_path: ["root", "topic:auth_subsystem", "topic:jwt_verification_latency"],
    lifecycle_state: "IN_PROGRESS",
    local_horizontal_scope: {
      owned_files: ["packages/auth/src/jwt-verifier.js", "packages/auth/src/cache.js"],
      read_only_interfaces: ["packages/skill-contracts/src/types.ts"],
      out_of_bounds: ["apps/*", "packages/db/*"],
    },
    invariants: {
      pre_conditions: ["Valid signing key exists"],
      post_conditions: ["2nd verification is cached and takes < 1ms"],
      strict_invariants: ["Cache TTL cannot exceed token exp claim"],
    },
    verification: {
      target_test_file: "packages/auth/test/jwt-verifier.test.js",
      allowed_command: "node --test packages/auth/test/jwt-verifier.test.js",
      prohibited_commands: ["npm test", "pytest"],
    },
    acceptance_criteria: [
      "Target scoped unit test passes with 0 failures",
      "Latency anomaly telemetry records < 1ms on warm cache",
    ],
  });

  assert.equal(spec.schema_version, 1);
  assert.equal(spec.topic_id, "topic:auth_subsystem/jwt_verification_latency");
  assert.equal(validateVerticalTopicSpec(spec).valid, true);

  const md = renderVerticalTopicMarkdown(spec);
  assert.ok(md.includes("VERTICAL SPECIFICATION: topic:auth_subsystem/jwt_verification_latency"));
  assert.ok(md.includes("Local Horizontal Scope"));
  assert.ok(md.includes("packages/auth/src/jwt-verifier.js"));
  assert.ok(md.includes("Test Storm Guard"));
  assert.ok(md.includes("Target scoped unit test passes with 0 failures"));
});

test("Vertical Topic Spec: rejects missing required fields and invalid states", () => {
  const { validateVerticalTopicSpec } = require("../src");
  const invalid = validateVerticalTopicSpec({
    topic_id: "invalid_topic",
    canonical_name: "",
  });
  assert.equal(invalid.valid, false);
  assert.ok(invalid.issues.some((i) => i.field === "canonical_name"));
});
