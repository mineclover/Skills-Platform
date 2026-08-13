const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  PRISTINE_PRESET_ID,
  assignPreset,
  buildSystemPrompt,
  createPreset,
  createProject,
  createProjectPlan,
  importLocalSource,
} = require("../src");

async function setup(context) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "skills-catalog-workflow-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const sourcePath = path.join(root, "source", "writer");
  await fs.mkdir(sourcePath, { recursive: true });
  await fs.writeFile(path.join(sourcePath, "SKILL.md"), "---\nname: writing-guide\ndescription: Write clear docs.\n---\n\n# Writing guide\n\nUse short sentences.\n");
  const reviewPath = path.join(root, "source", "review");
  await fs.mkdir(reviewPath, { recursive: true });
  await fs.writeFile(path.join(reviewPath, "SKILL.md"), "---\nname: review-guide\ndescription: Review changes.\n---\n\n# Review guide\n");
  const registryRoot = path.join(root, "registry");
  const catalogRoot = path.join(root, "catalog");
  const imported = await importLocalSource({ registryRoot, sourcePath: path.join(root, "source") });
  const project = await createProject({
    catalogRoot,
    id: "docs",
    name: "Documentation",
    projectPath: path.join(root, "project"),
    providerId: "codex",
    deliveryRoot: path.join(root, "project", ".agents", "skills"),
  });
  return { catalogRoot, imported, project, registryRoot };
}

test("project preset produces a pinned link-first plan", async (context) => {
  const { catalogRoot, imported, project, registryRoot } = await setup(context);
  const preset = await createPreset({
    catalogRoot,
    registryRoot,
    id: "docs-writing",
    name: "Docs writing",
    registrySkillIds: [imported.skills[0].id],
  });
  await assignPreset({ catalogRoot, projectId: project.id, presetId: preset.id });

  const plan = await createProjectPlan({ catalogRoot, registryRoot, projectId: project.id });

  assert.equal(plan.mode, "apply");
  assert.equal(plan.distribution.method, "symlink");
  assert.equal(plan.operations.length, 2);
  assert.ok(plan.operations.some((operation) => operation.registry_skill_id === imported.skills[0].id && operation.desired_state === "enabled"));
  assert.ok(plan.operations.some((operation) => operation.desired_state === "disabled"));
});

test("pristine baseline disables all known managed skills for a project", async (context) => {
  const { catalogRoot, imported, project, registryRoot } = await setup(context);
  await assignPreset({ catalogRoot, projectId: project.id, presetId: PRISTINE_PRESET_ID });

  const plan = await createProjectPlan({ catalogRoot, registryRoot, projectId: project.id });

  assert.equal(plan.mode, "pristine");
  assert.equal(plan.operations.length, imported.skills.length);
  assert.ok(plan.operations.every((operation) => operation.desired_state === "disabled"));
});

test("system prompt export uses the pinned canonical SKILL.md content", async (context) => {
  const { catalogRoot, imported, registryRoot } = await setup(context);
  const writingSkill = imported.skills.find((skill) => skill.skill_name === "writing-guide");
  await createPreset({
    catalogRoot,
    registryRoot,
    id: "docs-writing",
    name: "Docs writing",
    registrySkillIds: [writingSkill.id],
  });

  const prompt = await buildSystemPrompt({ catalogRoot, registryRoot, presetId: "docs-writing" });

  assert.deepEqual(prompt.included_skill_ids, [writingSkill.id]);
  assert.match(prompt.content, /registry_skill_id:/);
  assert.match(prompt.content, /Use short sentences/);
});
