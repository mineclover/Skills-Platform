const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");

const {
  exportRecipe,
  inspectRecipe,
  applyRecipe,
  importLocalSource,
  importGitSource,
  listRegistrySkills,
  createPreset,
  createProject,
  assignPreset,
  getProject,
  getSkillProfile,
} = require("../src");

const execFileAsync = promisify(execFile);

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
    owner: "Recipe Maintainers",
    lifecycle: "reviewed",
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
  assert.equal(recipe.presets[0].owner, "Recipe Maintainers");
  assert.equal(recipe.presets[0].lifecycle, "reviewed");

  const inspected = await inspectRecipe({ recipeContent: recipe });
  assert.equal(inspected.valid, true);
  assert.equal(inspected.summary.skills_count, 2);
  assert.equal(inspected.summary.presets_count, 1);

  // Now apply onto clean target environment
  const targetRegistry = path.join(root, "target-registry");
  const targetCatalog = path.join(root, "target-catalog");
  const targetProject = path.join(root, "target-project");
  await fs.mkdir(targetProject, { recursive: true });

  const mismatchedRecipe = JSON.parse(JSON.stringify(recipe));
  mismatchedRecipe.skills[0].content_digest = "0".repeat(64);
  await assert.rejects(
    () => applyRecipe({
      catalogRoot: targetCatalog,
      registryRoot: targetRegistry,
      recipeContent: mismatchedRecipe,
      projectPath: targetProject,
      providerId: "codex",
      confirm: false,
    }),
    /cannot be resolved to one immutable registry revision/,
  );

  const applied = await applyRecipe({
    catalogRoot: targetCatalog,
    registryRoot: targetRegistry,
    recipeContent: recipe,
    projectPath: targetProject,
    providerId: "codex",
    confirm: true,
  });

  assert.equal(applied.name, "Exported Test Recipe");
  assert.equal(applied.sources_imported[0].imported_skills, 2);
  assert.equal(applied.presets_reconciled.length, 1);
  assert.equal(applied.delivery.applied, true);
  assert.equal(applied.delivery.report.summary.applied, 2);
  const replayedPreset = await require("../src").getPreset(targetCatalog, "test-preset");
  assert.equal(replayedPreset.owner, "Recipe Maintainers");
  assert.equal(replayedPreset.lifecycle, "reviewed");

  const deliverySkillA = path.join(targetProject, ".agents", "skills", "skill-a", "SKILL.md");
  const content = await fs.readFile(deliverySkillA, "utf8");
  assert.match(content, /Skill A/);

  await fs.rm(root, { recursive: true, force: true });
});

test("recipes: verifies and profiles every declared skill even when a skill is absent from all presets", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "recipe-inactive-skill-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const sourceRoot = path.join(root, "source");
  const seedRegistry = path.join(root, "seed-registry");
  const targetRegistry = path.join(root, "target-registry");
  const targetCatalog = path.join(root, "target-catalog");

  for (const [name, description] of [
    ["active-skill", "Active recipe skill"],
    ["inactive-skill", "Managed but intentionally inactive recipe skill"],
  ]) {
    await fs.mkdir(path.join(sourceRoot, name), { recursive: true });
    await fs.writeFile(
      path.join(sourceRoot, name, "SKILL.md"),
      `---\nname: ${name}\ndescription: ${description}\n---\n# ${name}\n`,
      "utf8",
    );
  }

  const seeded = await importLocalSource({ registryRoot: seedRegistry, sourcePath: sourceRoot });
  const seededByName = new Map(seeded.skills.map((skill) => [skill.skill_name, skill]));
  const recipe = {
    schema_version: 1,
    recipe_id: "inactive-skill-recipe",
    name: "Inactive skill recipe",
    created_at: new Date().toISOString(),
    sources: [{ source_id: "local-source", type: "local", locator: sourceRoot }],
    skills: [
      {
        name: "active-skill",
        artifact_type: "skill",
        invocation_mode: "model_invoked",
        source_id: "local-source",
        source_relative_path: "active-skill",
        content_digest: seededByName.get("active-skill").content_digest,
        description: "Active profile summary",
      },
      {
        name: "inactive-skill",
        artifact_type: "skill",
        invocation_mode: "user_invoked",
        source_id: "local-source",
        source_relative_path: "inactive-skill",
        content_digest: seededByName.get("inactive-skill").content_digest,
        description: "Inactive profile summary",
      },
    ],
    presets: [{
      id: "active-only",
      name: "Active only",
      version: 1,
      skills: [{ skill_name: "active-skill", artifact_type: "skill", required: true }],
    }],
    projects: [],
  };

  const tampered = structuredClone(recipe);
  tampered.skills[1].content_digest = "0".repeat(64);
  await assert.rejects(
    () => applyRecipe({ catalogRoot: targetCatalog, registryRoot: targetRegistry, recipeContent: tampered }),
    /Recipe skill inactive-skill cannot be resolved to one immutable registry revision/,
  );

  await applyRecipe({ catalogRoot: targetCatalog, registryRoot: targetRegistry, recipeContent: recipe });
  const imported = await listRegistrySkills(targetRegistry);
  const inactive = imported.find((skill) => skill.skill_name === "inactive-skill");
  const profile = await getSkillProfile({
    catalogRoot: targetCatalog,
    registryRoot: targetRegistry,
    lineageId: inactive.lineage_id,
  });
  assert.equal(profile.invocation_mode, "user_invoked");
  assert.equal(profile.artifact_type, "skill");
  assert.equal(profile.summary, "Inactive profile summary");
});

test("recipes: local skill resolution excludes an identical artifact imported from another locator", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "recipe-local-locator-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const sourceRoot = path.join(root, "source");
  const registryRoot = path.join(root, "registry");
  const catalogRoot = path.join(root, "catalog");
  await fs.mkdir(path.join(sourceRoot, "same-skill"), { recursive: true });
  await fs.writeFile(
    path.join(sourceRoot, "same-skill", "SKILL.md"),
    "---\nname: same-skill\ndescription: Same bytes, distinct source identity\n---\n# Same\n",
    "utf8",
  );

  const preexisting = await importLocalSource({ registryRoot, sourcePath: sourceRoot });
  const recipe = {
    schema_version: 1,
    recipe_id: "stable-local-locator",
    name: "Stable local locator",
    created_at: new Date().toISOString(),
    sources: [{ source_id: "portable-source", type: "local", locator: "./source" }],
    skills: [{
      name: "same-skill",
      artifact_type: "skill",
      invocation_mode: "model_invoked",
      source_id: "portable-source",
      source_relative_path: "same-skill",
      content_digest: preexisting.skills[0].content_digest,
    }],
    presets: [{
      id: "same-skill-preset",
      name: "Same skill preset",
      version: 1,
      skills: [{ skill_name: "same-skill", required: true }],
    }],
    projects: [],
  };
  const recipePath = path.join(root, "recipe.json");
  await fs.writeFile(recipePath, `${JSON.stringify(recipe, null, 2)}\n`, "utf8");

  const applied = await applyRecipe({ catalogRoot, registryRoot, recipePath });
  assert.equal(applied.presets_reconciled[0].matched_skills, 1);
  assert.equal((await listRegistrySkills(registryRoot)).length, 2);
});

test("recipes: project delivery honors the compatible declared project and its default preset", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "recipe-declared-project-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const sourceRoot = path.join(root, "source");
  const seedRegistry = path.join(root, "seed-registry");
  const targetRegistry = path.join(root, "target-registry");
  const targetCatalog = path.join(root, "target-catalog");
  const targetProject = path.join(root, "arbitrary-checkout-name");
  await fs.mkdir(targetProject, { recursive: true });

  for (const name of ["antigravity-skill", "codex-skill"]) {
    await fs.mkdir(path.join(sourceRoot, name), { recursive: true });
    await fs.writeFile(
      path.join(sourceRoot, name, "SKILL.md"),
      `---\nname: ${name}\ndescription: ${name}\n---\n# ${name}\n`,
      "utf8",
    );
  }
  const seeded = await importLocalSource({ registryRoot: seedRegistry, sourcePath: sourceRoot });
  const seededByName = new Map(seeded.skills.map((skill) => [skill.skill_name, skill]));
  const recipe = {
    schema_version: 1,
    recipe_id: "provider-projects",
    name: "Provider projects",
    created_at: new Date().toISOString(),
    sources: [{ source_id: "provider-source", type: "local", locator: sourceRoot }],
    skills: ["antigravity-skill", "codex-skill"].map((name) => ({
      name,
      artifact_type: "skill",
      invocation_mode: "model_invoked",
      source_id: "provider-source",
      source_relative_path: name,
      content_digest: seededByName.get(name).content_digest,
    })),
    presets: [
      {
        id: "antigravity-default",
        name: "Antigravity default",
        version: 1,
        skills: [{ skill_name: "antigravity-skill", required: true }],
      },
      {
        id: "codex-default",
        name: "Codex default",
        version: 1,
        skills: [{ skill_name: "codex-skill", required: true }],
      },
    ],
    projects: [
      {
        project_id: "declared-antigravity-project",
        project_name: "Declared Antigravity Project",
        provider_id: "antigravity",
        scope: "project",
        default_preset_id: "antigravity-default",
        default_preset_version: 1,
      },
      {
        project_id: "declared-codex-project",
        project_name: "Declared Codex Project",
        provider_id: "codex",
        scope: "project",
        default_preset_id: "codex-default",
        default_preset_version: 1,
      },
    ],
  };

  const applied = await applyRecipe({
    catalogRoot: targetCatalog,
    registryRoot: targetRegistry,
    recipeContent: recipe,
    projectPath: targetProject,
    providerId: "codex",
    confirm: false,
    enabledOnly: true,
  });
  assert.equal(applied.delivery.project_id, "declared-codex-project");
  assert.equal(applied.delivery.preview.operations.length, 1);
  assert.equal(applied.delivery.preview.operations[0].operation.skill_name, "codex-skill");
  const project = await getProject(targetCatalog, "declared-codex-project");
  assert.equal(project.name, "Declared Codex Project");
  assert.equal(project.provider_id, "codex");
  assert.equal(project.default_preset_id, "codex-default");
  assert.equal(project.default_preset_version, 1);
  await assert.rejects(
    () => getProject(targetCatalog, "arbitrary-checkout-name"),
    /Project not found/,
  );
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
  assert.equal(applied.hooks_synced.claudeHooks, 0);
  assert.equal(applied.hooks_synced.providers.claude.status, "unsupported");

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

  await assert.rejects(
    () => fs.readFile(path.join(targetProject, ".claude", "settings.json"), "utf8"),
    (error) => error.code === "ENOENT",
  );

  await fs.rm(root, { recursive: true, force: true });
});

test("recipes: Git export pins the preset revision and replays the exact commit", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "recipe-git-roundtrip-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const repository = path.join(root, "source-repository");
  const skillRoot = path.join(repository, "skills", "git-skill");
  await fs.mkdir(skillRoot, { recursive: true });
  await execFileAsync("git", ["init", "--quiet", repository]);
  await execFileAsync("git", ["-C", repository, "config", "user.email", "test@example.com"]);
  await execFileAsync("git", ["-C", repository, "config", "user.name", "Test"]);

  await fs.writeFile(path.join(skillRoot, "SKILL.md"), "---\nname: git-skill\ndescription: Git v1.\n---\n# V1\n", "utf8");
  await execFileAsync("git", ["-C", repository, "add", "."]);
  await execFileAsync("git", ["-C", repository, "commit", "--quiet", "-m", "v1"]);

  const sourceRegistry = path.join(root, "source-registry");
  const sourceCatalog = path.join(root, "source-catalog");
  await importGitSource({ registryRoot: sourceRegistry, repository, ref: "HEAD" });

  await fs.writeFile(path.join(skillRoot, "SKILL.md"), "---\nname: git-skill\ndescription: Git v2.\n---\n# V2\n", "utf8");
  await execFileAsync("git", ["-C", repository, "add", "."]);
  await execFileAsync("git", ["-C", repository, "commit", "--quiet", "-m", "v2"]);
  const secondCommit = (await execFileAsync("git", ["-C", repository, "rev-parse", "HEAD"])).stdout.trim();
  const importedV2 = await importGitSource({ registryRoot: sourceRegistry, repository, ref: "HEAD" });
  await createPreset({
    catalogRoot: sourceCatalog,
    registryRoot: sourceRegistry,
    id: "git-preset",
    name: "Git preset",
    registrySkillIds: [importedV2.skills[0].id],
  });
  const recipe = await exportRecipe({
    catalogRoot: sourceCatalog,
    registryRoot: sourceRegistry,
    presetId: "git-preset",
  });
  assert.equal(recipe.sources[0].resolved_commit, secondCommit);

  const targetRegistry = path.join(root, "target-registry");
  const targetCatalog = path.join(root, "target-catalog");
  const applied = await applyRecipe({
    catalogRoot: targetCatalog,
    registryRoot: targetRegistry,
    recipeContent: recipe,
  });
  assert.equal(applied.presets_reconciled[0].matched_skills, 1);
  const targetSkills = await listRegistrySkills(targetRegistry);
  assert.equal(targetSkills.length, 1);
  assert.equal(targetSkills[0].content_digest, recipe.skills[0].content_digest);
  assert.match(await fs.readFile(path.join(targetSkills[0].canonical_path, "SKILL.md"), "utf8"), /# V2/);
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
