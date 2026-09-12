const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const adapter = require("@skills-platform/skills-manager-adapter");
const hooksManager = require("../src/hooks-manager");
const {
  applyRecipe, exportRecipe, importLocalSource, createPreset, createProject,
  assignPreset, recordSourceReview, setProjectReviewPolicy, listRegistrySkills,
  loadCatalog,
} = require("../src");
const { mountLifecycleRecipe, runLifecycleLoop, LifecycleLoopError } = require("../src/lifecycle-loop");

async function paths(context) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "recipe-delivery-failure-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const options = { catalogRoot: path.join(root, "catalog"), registryRoot: path.join(root, "registry"), projectPath: path.join(root, "project"), providerId: "codex" };
  await fs.mkdir(options.projectPath, { recursive: true });
  return { root, ...options };
}

async function review(options, sourceRevisionId, decision) {
  return recordSourceReview({ ...options, sourceRevisionId, decision, summary: `Fixture ${decision}` });
}

function revokeAfterAdapterPreview(context, options) {
  const originalApply = adapter.applyActivationPlan;
  context.mock.method(adapter, "applyActivationPlan", (plan, adapterOptions) => originalApply(plan, {
    ...adapterOptions,
    beforeOperation: async (operation) => {
      await review(options, operation.source_revision_id, "rejected");
      await adapterOptions.beforeOperation(operation);
    },
  }));
}

async function assertFailedDeliveryRecorded(options) {
  const catalog = await loadCatalog(options.catalogRoot);
  assert.equal(catalog.activation_reports.length, 1);
  assert.equal(catalog.activation_reports[0].report.status, "failed");
  const plan = catalog.activation_plans[0].plan;
  for (const operation of plan.operations) {
    await assert.rejects(fs.lstat(operation.delivery_path), { code: "ENOENT" });
  }
}

test("public recipe apply reports revoked delivery as unapplied, preserves failure history and skips subsequent hooks", async (context) => {
  const options = await paths(context);
  const sourcePath = path.join(options.root, "source", "reviewed-skill");
  await fs.mkdir(sourcePath, { recursive: true });
  await fs.writeFile(path.join(sourcePath, "SKILL.md"), "---\nname: reviewed-skill\ndescription: Reviewed fixture.\n---\n# Fixture\n");
  const skill = (await importLocalSource({ registryRoot: options.registryRoot, sourcePath })).skills[0];
  await createProject({ ...options, id: "recipe-project", name: "Recipe", reviewPolicy: "require_approved" });
  await createPreset({ ...options, id: "preset", name: "Preset", registrySkillIds: [skill.id] });
  await assignPreset({ ...options, projectId: "recipe-project", presetId: "preset" });
  await review(options, skill.source_revision_id, "approved");
  const recipe = await exportRecipe({ ...options, projectId: "recipe-project", hooks: [{ id: "after-delivery", name: "After delivery", event: "session_start", enabled: true, handler: { type: "command", command: "node -v" } }] });
  revokeAfterAdapterPreview(context, options);
  const registerHook = context.mock.method(hooksManager, "registerHook");
  const result = await applyRecipe({ ...options, recipeContent: recipe, confirm: true, enabledOnly: true });
  assert.equal(result.delivery.applied, false);
  assert.equal(result.delivery.report.status, "failed");
  assert.match(result.delivery.report.error, /approved source review/);
  assert.deepEqual(result.hooks_applied, []);
  assert.equal(registerHook.mock.callCount(), 0);
  await assertFailedDeliveryRecorded(options);
});

async function lifecycleFixture(context) {
  const options = await paths(context);
  const preview = await mountLifecycleRecipe("task-planning", { ...options, confirm: false });
  await setProjectReviewPolicy({ ...options, projectId: preview.delivery.project_id, reviewPolicy: "require_approved" });
  for (const revision of new Set((await listRegistrySkills(options.registryRoot)).map((skill) => skill.source_revision_id))) {
    await review(options, revision, "approved");
  }
  revokeAfterAdapterPreview(context, options);
  return options;
}

function assertMountFailure(error) {
  assert.ok(error instanceof LifecycleLoopError);
  assert.equal(error.phase, "mount");
  assert.equal(error.details.recipe_id, "mlc-task-planning");
  assert.equal(error.details.delivery.applied, false);
  assert.equal(error.details.delivery.report.status, "failed");
  return true;
}

test("confirmed lifecycle mount throws on revoked delivery after persisting its failed report", async (context) => {
  const options = await lifecycleFixture(context);
  await assert.rejects(mountLifecycleRecipe("task-planning", { ...options, confirm: true }), assertMountFailure);
  await assertFailedDeliveryRecorded(options);
});

test("lifecycle loop stops before task parsing, further phases or test runners when its confirmed mount fails", async (context) => {
  const options = await lifecycleFixture(context);
  const phases = [];
  let scopedRuns = 0;
  let regressionRuns = 0;
  await assert.rejects(runLifecycleLoop({
    ...options,
    confirm: true,
    prdContent: "# Failure fixture\n- [ ] [task-1] Task after mount (scoped_test: test/task.test.js)\n",
    onPhaseChange: (phase) => phases.push(phase),
    scopedTestRunner: async () => { scopedRuns += 1; return { success: true }; },
    regressionRunner: async () => { regressionRuns += 1; return { success: true }; },
  }), assertMountFailure);
  assert.deepEqual(phases, ["plan"]);
  assert.equal(scopedRuns, 0);
  assert.equal(regressionRuns, 0);
  await assert.rejects(fs.lstat(path.join(options.projectPath, ".skills-platform", "loop", "task-queue.json")), { code: "ENOENT" });
  await assert.rejects(fs.lstat(path.join(options.projectPath, "MASTER_BASELINE.md")), { code: "ENOENT" });
  await assertFailedDeliveryRecorded(options);
});
