const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  assignPreset,
  compareRecordedPlanWithObservedState,
  createPreset,
  createProject,
  createProjectPlan,
  importLocalSource,
  recordActivationPlan,
  recordObservedState,
} = require("../src");

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
});
