const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createPlanFromRegistry, importLocalSource, listRegistrySkills } = require("../src");

async function writeSkill(root, directory, name, description) {
  const skillRoot = path.join(root, directory);
  await fs.mkdir(path.join(skillRoot, "references"), { recursive: true });
  await fs.writeFile(path.join(skillRoot, "SKILL.md"), `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n`, "utf8");
  await fs.writeFile(path.join(skillRoot, "references", "guide.md"), `Guide for ${name}\n`, "utf8");
}

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "skills-platform-"));
  const sourcePath = path.join(root, "source");
  const registryRoot = path.join(root, "registry");
  await writeSkill(sourcePath, "frontend", "frontend-design", "Build intentional user interfaces.");
  await writeSkill(sourcePath, "testing", "test-first", "Test behaviour before implementation.");
  return { root, sourcePath, registryRoot };
}

test("imports selected local skills into immutable canonical storage", async (context) => {
  const { root, sourcePath, registryRoot } = await fixture();
  context.after(() => fs.rm(root, { recursive: true, force: true }));

  const result = await importLocalSource({
    registryRoot,
    sourcePath,
    selectedSkillNames: ["frontend-design"],
  });

  assert.equal(result.skills.length, 1);
  const [skill] = result.skills;
  assert.equal(skill.skill_name, "frontend-design");
  assert.ok(await fs.stat(path.join(skill.canonical_path, "SKILL.md")));

  await fs.writeFile(path.join(sourcePath, "frontend", "SKILL.md"), "changed upstream source", "utf8");
  assert.match(await fs.readFile(path.join(skill.canonical_path, "SKILL.md"), "utf8"), /frontend-design/);
});

test("re-importing an unchanged source reuses the source revision", async (context) => {
  const { root, sourcePath, registryRoot } = await fixture();
  context.after(() => fs.rm(root, { recursive: true, force: true }));

  const first = await importLocalSource({ registryRoot, sourcePath });
  const second = await importLocalSource({ registryRoot, sourcePath });
  const skills = await listRegistrySkills(registryRoot);

  assert.equal(first.source_revision_id, second.source_revision_id);
  assert.equal(skills.length, 2);
});

test("a changed source creates a new immutable revision and skill identity", async (context) => {
  const { root, sourcePath, registryRoot } = await fixture();
  context.after(() => fs.rm(root, { recursive: true, force: true }));

  const first = await importLocalSource({
    registryRoot,
    sourcePath,
    selectedSkillNames: ["frontend-design"],
  });
  await fs.appendFile(path.join(sourcePath, "frontend", "SKILL.md"), "\nNew reviewed content.\n", "utf8");
  const second = await importLocalSource({
    registryRoot,
    sourcePath,
    selectedSkillNames: ["frontend-design"],
  });

  assert.notEqual(first.source_revision_id, second.source_revision_id);
  assert.notEqual(first.skills[0].id, second.skills[0].id);
  assert.ok(await fs.stat(path.join(first.skills[0].canonical_path, "SKILL.md")));
});

test("creates a link-first activation plan from pinned registry skills", async (context) => {
  const { root, sourcePath, registryRoot } = await fixture();
  context.after(() => fs.rm(root, { recursive: true, force: true }));

  const imported = await importLocalSource({ registryRoot, sourcePath });
  const plan = await createPlanFromRegistry({
    registryRoot,
    skillIds: imported.skills.map((skill) => skill.id),
    target: {
      project_id: "project_catalog",
      project_path: "C:/workspace/catalog",
      provider_id: "codex",
      scope: "project",
    },
    deliveryRoot: "C:/workspace/catalog/.agents/skills",
  });

  assert.equal(plan.distribution.method, "symlink");
  assert.equal(plan.operations.length, 2);
  assert.equal(plan.operations[0].desired_state, "enabled");
  assert.ok(plan.operations.every((operation) => operation.source_revision_id === imported.source_revision_id));
});
