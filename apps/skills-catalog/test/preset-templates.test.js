const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  addPresetTemplateNote,
  assignPreset,
  comparePresetVersions,
  createPreset,
  createProject,
  createProjectPlan,
  getPreset,
  importLocalSource,
  resolveProjectEffectiveSet,
  updatePresetTemplate,
} = require("../src");

async function fixture(context) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "preset-template-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const sourceRoot = path.join(root, "source");
  for (const [directory, name] of [["plan", "planning"], ["test", "testing"]]) {
    const skillRoot = path.join(sourceRoot, directory);
    await fs.mkdir(skillRoot, { recursive: true });
    await fs.writeFile(path.join(skillRoot, "SKILL.md"), `---\nname: ${name}\ndescription: ${name}.\n---\n\n# ${name}\n`);
  }
  const registryRoot = path.join(root, "registry");
  const catalogRoot = path.join(root, "catalog");
  const imported = await importLocalSource({ registryRoot, sourcePath: sourceRoot });
  const skills = Object.fromEntries(imported.skills.map((skill) => [skill.skill_name, skill]));
  await createProject({
    catalogRoot, id: "app", name: "App", projectPath: path.join(root, "app"), providerId: "codex",
    deliveryRoot: path.join(root, "app", ".agents", "skills"),
  });
  return { catalogRoot, registryRoot, skills };
}

test("template revisions preserve an assigned project's pinned membership", async (context) => {
  const { catalogRoot, registryRoot, skills } = await fixture(context);
  const template = await createPreset({
    catalogRoot, registryRoot, id: "build", name: "Build", purpose: "Implement safely.",
    workScopeTags: ["implementation"], owner: "platform", lifecycle: "reviewed",
    registrySkillIds: [skills.planning.id],
  });
  await assignPreset({ catalogRoot, projectId: "app", presetId: template.id });
  const updated = await updatePresetTemplate({
    catalogRoot, registryRoot, presetId: template.id,
    patch: { registrySkillIds: [skills.planning.id, skills.testing.id], purpose: "Implement and verify safely." },
  });
  const diff = await comparePresetVersions({ catalogRoot, presetId: template.id, leftVersion: 1, rightVersion: 2 });

  assert.equal(updated.selected_version, 2);
  assert.deepEqual(diff.added_registry_skill_ids, [skills.testing.id]);
  assert.equal((await getPreset(catalogRoot, template.id, 1)).registry_skill_ids.length, 1);
  assert.equal((await getPreset(catalogRoot, template.id, 2)).registry_skill_ids.length, 2);

  const pinnedPlan = await createProjectPlan({ catalogRoot, registryRoot, projectId: "app" });
  assert.equal(pinnedPlan.operations.filter((operation) => operation.desired_state === "enabled").length, 1);
  await assignPreset({ catalogRoot, projectId: "app", presetId: template.id, version: 2 });
  const upgradedPlan = await createProjectPlan({ catalogRoot, registryRoot, projectId: "app" });
  assert.equal(upgradedPlan.operations.filter((operation) => operation.desired_state === "enabled").length, 2);
  const effectiveSet = await resolveProjectEffectiveSet({ catalogRoot, registryRoot, projectId: "app" });
  assert.equal(effectiveSet.preset.selected_version, 2);
  assert.ok(effectiveSet.skills.every((skill) => skill.reason === "selected_by_template"));
});

test("template notes create a new version without modifying a frozen version", async (context) => {
  const { catalogRoot, registryRoot, skills } = await fixture(context);
  await createPreset({ catalogRoot, registryRoot, id: "build", name: "Build", registrySkillIds: [skills.planning.id] });
  const note = await addPresetTemplateNote({ catalogRoot, presetId: "build", author: "mina", body: "Planning is required before implementation." });
  const template = await getPreset(catalogRoot, "build");

  assert.equal(template.template_notes[0].id, note.id);
  assert.equal(template.template_notes[0].author, "mina");
  assert.equal(template.selected_version, 2);
  assert.equal((await getPreset(catalogRoot, "build", 1)).template_notes.length, 0);
});
