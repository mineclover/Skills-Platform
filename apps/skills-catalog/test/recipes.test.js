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

test("recipes: auto-sync and compile hooks into target project on recipe apply", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "recipe-hooks-test-"));
  const targetProject = path.join(root, "target-project");
  const targetCatalog = path.join(root, "target-catalog");
  const targetRegistry = path.join(root, "target-registry");
  await fs.mkdir(targetProject, { recursive: true });

  const sampleRecipe = {
    schema_version: 1,
    recipe_id: "recipe-with-guards",
    name: "Governance Guarded Recipe",
    description: "Recipe with embedded guard hooks",
    created_at: new Date().toISOString(),
    sources: [],
    skills: [],
    presets: [],
    projects: [],
    hooks: [
      {
        id: "secret-leak-guard",
        name: "Secret Leak Guard",
        event: "pre_tool_use",
        description: "Detects and blocks API keys",
        enabled: true,
        matcher: "run_command|write_to_file",
        handler: {
          type: "script",
          target: ".skills-platform/hooks/guards/secret-leak-guard.js",
          timeout_ms: 5000,
        },
        priority: 5,
        providers: ["antigravity", "claude"],
      },
      {
        id: "destructive-command-blocker",
        name: "Destructive Command Blocker",
        event: "pre_tool_use",
        description: "Blocks destructive commands",
        enabled: true,
        matcher: "run_command",
        handler: {
          type: "script",
          target: ".skills-platform/hooks/guards/destructive-command-blocker.js",
          timeout_ms: 5000,
        },
        priority: 10,
        providers: ["antigravity", "claude"],
      },
    ],
  };

  const inspected = await inspectRecipe({ recipeContent: sampleRecipe });
  assert.equal(inspected.valid, true);
  assert.equal(inspected.summary.hooks_count, 2);
  assert.equal(inspected.hooks.length, 2);

  const applied = await applyRecipe({
    catalogRoot: targetCatalog,
    registryRoot: targetRegistry,
    recipeContent: sampleRecipe,
    projectPath: targetProject,
  });

  assert.equal(applied.name, "Governance Guarded Recipe");
  assert.equal(applied.hooks_applied.length, 2);
  assert.equal(applied.hooks_synced.antigravityHooks >= 2, true);
  assert.equal(applied.hooks_synced.claudeHooks >= 2, true);

  // Verify target filesystem configs
  const manifestRaw = await fs.readFile(
    path.join(targetProject, ".skills-platform", "hooks", "manifest.json"),
    "utf8"
  );
  const manifest = JSON.parse(manifestRaw);
  assert.ok(manifest.hooks.some((h) => h.id === "secret-leak-guard"));
  assert.ok(manifest.hooks.some((h) => h.id === "destructive-command-blocker"));

  const antigravityRaw = await fs.readFile(
    path.join(targetProject, ".agents", "hooks.json"),
    "utf8"
  );
  const antigravity = JSON.parse(antigravityRaw);
  assert.ok(antigravity["secret-leak-guard"]);
  assert.ok(antigravity["destructive-command-blocker"]);

  const claudeRaw = await fs.readFile(
    path.join(targetProject, ".claude", "hooks.json"),
    "utf8"
  );
  const claude = JSON.parse(claudeRaw);
  assert.ok(claude.hooks.some((h) => h.id === "secret-leak-guard"));
  assert.ok(claude.hooks.some((h) => h.id === "destructive-command-blocker"));

  await fs.rm(root, { recursive: true, force: true });
});

test("canonical recipes: all root recipe files validate cleanly with embedded hooks", async () => {
  const canonicalFiles = [
    path.resolve(__dirname, "../../../task-planning-recipe.json"),
    path.resolve(__dirname, "../../../scoped-inner-loop-recipe.json"),
    path.resolve(__dirname, "../../../release-governance-recipe.json"),
  ];

  for (const file of canonicalFiles) {
    const inspected = await inspectRecipe({ recipePath: file });
    assert.equal(inspected.valid, true, `Recipe ${file} must be valid`);
    assert.ok(inspected.summary.hooks_count > 0, `Recipe ${file} should have embedded hooks`);
  }
});

