const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  assignPreset,
  createPreset,
  createProject,
  createProjectPlan,
  importLocalSource,
} = require("../../../apps/skills-catalog/src");
const { applyActivationPlan, previewActivationPlan } = require("../src");

test("catalog plan crosses the adapter boundary and materializes its pinned registry skill", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "skills-platform-e2e-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const sourcePath = path.join(root, "source", "demo");
  const registryRoot = path.join(root, "registry");
  const catalogRoot = path.join(root, "catalog");
  const deliveryRoot = path.join(root, "project", ".agents", "skills");
  await fs.mkdir(sourcePath, { recursive: true });
  await fs.writeFile(path.join(sourcePath, "SKILL.md"), "---\nname: catalog-demo\ndescription: E2E.\n---\n\n# Catalog demo\n");

  const imported = await importLocalSource({ registryRoot, sourcePath: path.join(root, "source") });
  await createProject({
    catalogRoot,
    id: "demo",
    name: "Demo",
    projectPath: path.join(root, "project"),
    providerId: "codex",
    deliveryRoot,
  });
  await createPreset({
    catalogRoot,
    registryRoot,
    id: "demo-preset",
    name: "Demo preset",
    registrySkillIds: [imported.skills[0].id],
  });
  await assignPreset({ catalogRoot, projectId: "demo", presetId: "demo-preset" });

  const plan = await createProjectPlan({ catalogRoot, registryRoot, projectId: "demo" });
  assert.equal((await previewActivationPlan(plan)).valid, true);
  await applyActivationPlan(plan, { confirm: true });

  const deliveryPath = plan.operations.find((operation) => operation.desired_state === "enabled").delivery_path;
  assert.equal((await fs.lstat(deliveryPath)).isSymbolicLink(), true);
  assert.match(await fs.readFile(path.join(deliveryPath, "SKILL.md"), "utf8"), /Catalog demo/);
});
