const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const {
  exportRecipe,
  inspectRecipe,
  applyRecipe,
  importLocalSource,
  createPreset,
  createProject,
  assignPreset,
} = require("../src");

test("recipes: export, inspect, and apply recipe onto a fresh registry/catalog", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "recipe-test-"));
  const sourceRoot = path.join(root, "source");
  const origRegistry = path.join(root, "orig-registry");
  const origCatalog = path.join(root, "orig-catalog");

  await fs.mkdir(path.join(sourceRoot, "skill-a"), { recursive: true });
  await fs.writeFile(
    path.join(sourceRoot, "skill-a", "SKILL.md"),
    "---\nname: skill-a\ndescription: Model-invoked reflex for tests\n---\n# Skill A\nInstructions",
    "utf8"
  );
  await fs.mkdir(path.join(sourceRoot, "skill-b"), { recursive: true });
  await fs.writeFile(
    path.join(sourceRoot, "skill-b", "SKILL.md"),
    "---\nname: skill-b\ndescription: User-invoked command for tests\n---\n# Skill B\nInstructions",
    "utf8"
  );

  const imported = await importLocalSource({
    registryRoot: origRegistry,
    sourcePath: sourceRoot,
  });

  const preset = await createPreset({
    catalogRoot: origCatalog,
    registryRoot: origRegistry,
    id: "test-preset",
    name: "Test Preset",
    registrySkillIds: imported.skills.map((s) => s.id),
  });

  const recipe = await exportRecipe({
    catalogRoot: origCatalog,
    registryRoot: origRegistry,
    presetId: "test-preset",
    name: "Exported Test Recipe",
  });

  assert.equal(recipe.name, "Exported Test Recipe");
  assert.equal(recipe.skills.length, 2);
  assert.equal(recipe.presets.length, 1);
  assert.equal(recipe.presets[0].skills.length, 2);

  const inspected = await inspectRecipe({ recipeContent: recipe });
  assert.equal(inspected.valid, true);
  assert.equal(inspected.summary.skills_count, 2);
  assert.equal(inspected.summary.presets_count, 1);

  // Now apply onto clean target environment
  const targetRegistry = path.join(root, "target-registry");
  const targetCatalog = path.join(root, "target-catalog");
  const targetProject = path.join(root, "target-project");
  await fs.mkdir(targetProject, { recursive: true });

  // For testing local source replaying, pre-import so target registry has the skills
  await importLocalSource({
    registryRoot: targetRegistry,
    sourcePath: sourceRoot,
  });

  const applied = await applyRecipe({
    catalogRoot: targetCatalog,
    registryRoot: targetRegistry,
    recipeContent: recipe,
    projectPath: targetProject,
    providerId: "codex",
    confirm: true,
  });

  assert.equal(applied.name, "Exported Test Recipe");
  assert.equal(applied.presets_reconciled.length, 1);
  assert.equal(applied.delivery.applied, true);
  assert.equal(applied.delivery.report.summary.applied, 2);

  const deliverySkillA = path.join(targetProject, "skills", "skill-a", "SKILL.md");
  const content = await fs.readFile(deliverySkillA, "utf8");
  assert.match(content, /Skill A/);

  await fs.rm(root, { recursive: true, force: true });
});
