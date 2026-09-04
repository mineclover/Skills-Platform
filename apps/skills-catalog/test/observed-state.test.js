const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  assignPreset,
  compareActivationPlanWithObservedState,
  compareRecordedPlanWithObservedState,
  createPreset,
  createProject,
  createProjectPlan,
  importLocalSource,
  recordActivationPlan,
  recordObservedState,
} = require("../src");

function comparisonFixture({ deliveryPath, binding = {} }) {
  const operation = {
    registry_skill_id: "skill_planning",
    skill_name: "planning",
    source_revision_id: "revision_planning",
    content_digest: "a".repeat(64),
    canonical_path: path.join(path.dirname(deliveryPath), "registry", "planning"),
    delivery_path: deliveryPath,
    desired_state: "enabled",
  };
  return {
    operation,
    plan: {
      plan_id: "plan_observed_path",
      target: { provider_id: "codex" },
      operations: [operation],
    },
    observedState: {
      id: "observed_path",
      project_id: "demo",
      provider_id: "codex",
      captured_at: new Date(0).toISOString(),
      inventory: { providers: [{ provider_id: "codex", detected: true, reachable: true }] },
      bindings: [{ provider_id: "codex", state: "enabled", target_path: deliveryPath, ...binding }],
    },
  };
}

test("records upstream Skills Manager observations and compares them with a pinned plan", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "skills-observed-state-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const sourceRoot = path.join(root, "source", "planning");
  const registryRoot = path.join(root, "registry");
  const catalogRoot = path.join(root, "catalog");
  const projectPath = path.join(root, "project");
  await fs.mkdir(sourceRoot, { recursive: true });
  await fs.writeFile(path.join(sourceRoot, "SKILL.md"), "---\nname: planning\ndescription: Plan safely.\n---\n\n# Planning\n", "utf8");
  const imported = await importLocalSource({ registryRoot, sourcePath: path.join(root, "source") });
  await createProject({ catalogRoot, id: "demo", name: "Demo", projectPath, providerId: "codex", deliveryRoot: path.join(projectPath, ".agents", "skills") });
  await createPreset({ catalogRoot, registryRoot, id: "planning", name: "Planning", registrySkillIds: [imported.skills[0].id] });
  await assignPreset({ catalogRoot, projectId: "demo", presetId: "planning" });
  const plan = await createProjectPlan({ catalogRoot, registryRoot, projectId: "demo" });
  await recordActivationPlan({ catalogRoot, plan, projectId: "demo" });
  const operation = plan.operations[0];

  await recordObservedState({
    catalogRoot,
    projectId: "demo",
    providerId: "codex",
    inventory: { checked_at: 1, providers: [{ provider_id: "codex", detected: true, reachable: true }], orca: {} },
    bindings: [{ provider_id: "codex", state: "enabled", target_path: operation.delivery_path }],
  });
  const synced = await compareRecordedPlanWithObservedState({ catalogRoot, planId: plan.plan_id });
  assert.equal(synced.in_sync, true);
  assert.equal(synced.operations[0].status, "matched");

  await recordObservedState({
    catalogRoot,
    projectId: "demo",
    providerId: "codex",
    inventory: { checked_at: 2, providers: [{ provider_id: "codex", detected: true, reachable: true }], orca: {} },
    bindings: [{ provider_id: "codex", state: "disabled", target_path: operation.delivery_path }],
  });
  const drifted = await compareRecordedPlanWithObservedState({ catalogRoot, planId: plan.plan_id });
  assert.equal(drifted.in_sync, false);
  assert.equal(drifted.operations[0].status, "disabled");

  const newestCapture = await recordObservedState({
    catalogRoot,
    projectId: "demo",
    providerId: "codex",
    capturedAt: "2099-01-02T00:00:00.000Z",
    inventory: { providers: [{ provider_id: "codex", detected: true, reachable: true }] },
    bindings: [{ provider_id: "codex", state: "enabled", target_path: operation.delivery_path }],
  });
  await recordObservedState({
    catalogRoot,
    projectId: "demo",
    providerId: "codex",
    capturedAt: "2099-01-01T00:00:00.000Z",
    inventory: { providers: [{ provider_id: "codex", detected: true, reachable: true }] },
    bindings: [{ provider_id: "codex", state: "disabled", target_path: operation.delivery_path }],
  });
  const captureOrdered = await compareRecordedPlanWithObservedState({ catalogRoot, planId: plan.plan_id });
  assert.equal(captureOrdered.observed_state_id, newestCapture.id);
  assert.equal(captureOrdered.in_sync, true);
});

test("compares Windows binding paths case-insensitively even when reviewing them on another platform", () => {
  const { plan, observedState } = comparisonFixture({
    deliveryPath: "C:\\Users\\Demo\\Project\\.agents\\skills\\Planning",
    binding: { target_path: "c:/users/demo/project/.agents/skills/planning" },
  });

  const result = compareActivationPlanWithObservedState({ plan, observedState });
  assert.equal(result.in_sync, true);
  assert.equal(result.operations[0].status, "matched");
});

test("does not fold case for unresolved POSIX paths", { skip: process.platform === "win32" }, () => {
  const deliveryPath = path.join(os.tmpdir(), "skills-observed-case", "Planning");
  const { plan, observedState } = comparisonFixture({
    deliveryPath,
    binding: { target_path: path.join(os.tmpdir(), "skills-observed-case", "planning") },
  });

  const result = compareActivationPlanWithObservedState({ plan, observedState });
  assert.equal(result.in_sync, false);
  assert.equal(result.operations[0].status, "missing");
});

test("reports immutable binding identity drift as a conflict", () => {
  const deliveryPath = path.join(os.tmpdir(), "skills-observed-identity", "planning");
  const { operation, plan, observedState } = comparisonFixture({
    deliveryPath,
    binding: {
      content_digest: "b".repeat(64),
      source_revision_id: "revision_other",
      registry_skill_id: "skill_other",
    },
  });

  const result = compareActivationPlanWithObservedState({ plan, observedState });
  assert.equal(result.in_sync, false);
  assert.equal(result.operations[0].status, "conflict");
  assert.deepEqual(
    result.operations[0].identity_mismatches.map((item) => item.field),
    ["content_digest", "source_revision_id", "registry_skill_id"],
  );

  observedState.bindings[0] = {
    provider_id: "codex",
    state: "enabled",
    target_path: deliveryPath,
    content_digest: `sha256:${operation.content_digest}`,
    source_revision_id: operation.source_revision_id,
    registry_skill_id: operation.registry_skill_id,
  };
  assert.equal(compareActivationPlanWithObservedState({ plan, observedState }).in_sync, true);
});

test("uses source path as a fallback identity claim when no digest or revision is available", () => {
  const deliveryPath = path.join(os.tmpdir(), "skills-observed-source", "planning");
  const { plan, observedState } = comparisonFixture({
    deliveryPath,
    binding: { source_path: path.join(os.tmpdir(), "another-registry", "planning") },
  });

  const result = compareActivationPlanWithObservedState({ plan, observedState });
  assert.equal(result.operations[0].status, "conflict");
  assert.equal(result.operations[0].identity_mismatches[0].field, "source_path");
});
