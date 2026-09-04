const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  applyRecipe,
  createCatalogServer,
  createPreset,
  exportRecipe,
  getProject,
  importLocalSource,
  inspectRecipe,
  loadCatalog,
} = require("../src");

async function createTestEnvironment() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "recipe-adv-test-"));
  const sourceRoot = path.join(root, "source");
  const origRegistry = path.join(root, "orig-registry");
  const origCatalog = path.join(root, "orig-catalog");

  // Create two distinct test skills with different invocation modes
  await fs.mkdir(path.join(sourceRoot, "planner-skill"), { recursive: true });
  await fs.writeFile(
    path.join(sourceRoot, "planner-skill", "SKILL.md"),
    "---\nname: planner-skill\ndescription: Reflex planner for multi-step reasoning\n---\n# Planner Skill\nAutonomous reasoning logic.\n",
    "utf8"
  );

  await fs.mkdir(path.join(sourceRoot, "deploy-skill"), { recursive: true });
  await fs.writeFile(
    path.join(sourceRoot, "deploy-skill", "SKILL.md"),
    "---\nname: deploy-skill\ndescription: User command for deployment\n---\n# Deploy Skill\nHuman steered deployment logic.\n",
    "utf8"
  );

  const imported = await importLocalSource({
    registryRoot: origRegistry,
    sourcePath: sourceRoot,
  });

  const preset = await createPreset({
    catalogRoot: origCatalog,
    registryRoot: origRegistry,
    id: "dev-preset",
    name: "Developer Suite Preset",
    registrySkillIds: imported.skills.map((s) => s.id),
  });

  const recipe = await exportRecipe({
    catalogRoot: origCatalog,
    registryRoot: origRegistry,
    presetId: "dev-preset",
    name: "Enterprise Multi-Provider Recipe",
    description: "Exported recipe for testing delivery mappings across Codex, Antigravity, and Claude",
  });

  return {
    root,
    sourceRoot,
    origRegistry,
    origCatalog,
    recipe,
    cleanup: () => fs.rm(root, { recursive: true, force: true }),
  };
}

test("Empirical: Provider Mappings correctly materialize into provider-specific delivery paths", async (t) => {
  const { root, sourceRoot, recipe, cleanup } = await createTestEnvironment();
  t.after(cleanup);

  const providers = [
    { id: "antigravity", expectedSubdir: path.join(".agents", "skills") },
    { id: "codex", expectedSubdir: path.join(".agents", "skills") },
    { id: "claude", expectedSubdir: path.join(".claude", "skills") },
  ];

  for (const provider of providers) {
    const targetRegistry = path.join(root, `target-reg-${provider.id}`);
    const targetCatalog = path.join(root, `target-cat-${provider.id}`);
    const targetProject = path.join(root, `project-${provider.id}`);
    await fs.mkdir(targetProject, { recursive: true });

    // Seed target registry with the local source
    await importLocalSource({
      registryRoot: targetRegistry,
      sourcePath: sourceRoot,
    });

    const result = await applyRecipe({
      catalogRoot: targetCatalog,
      registryRoot: targetRegistry,
      recipeContent: recipe,
      projectPath: targetProject,
      providerId: provider.id,
      confirm: true,
    });

    assert.equal(result.name, "Enterprise Multi-Provider Recipe");
    assert.ok(result.delivery);
    assert.equal(result.delivery.applied, true);
    assert.equal(result.delivery.report.summary.applied, 2);

    // Verify delivery path on disk
    const expectedSkillA = path.join(targetProject, provider.expectedSubdir, "planner-skill", "SKILL.md");
    const expectedSkillB = path.join(targetProject, provider.expectedSubdir, "deploy-skill", "SKILL.md");

    const statA = await fs.stat(expectedSkillA);
    assert.ok(statA.isFile(), `Skill A SKILL.md must exist at ${expectedSkillA}`);
    const contentA = await fs.readFile(expectedSkillA, "utf8");
    assert.match(contentA, /Planner Skill/);

    const statB = await fs.stat(expectedSkillB);
    assert.ok(statB.isFile(), `Skill B SKILL.md must exist at ${expectedSkillB}`);
    const contentB = await fs.readFile(expectedSkillB, "utf8");
    assert.match(contentB, /Deploy Skill/);

    // Ensure non-selected provider directories were NOT created
    if (provider.id === "antigravity") {
      await assert.rejects(fs.stat(path.join(targetProject, ".claude")));
      await assert.rejects(fs.stat(path.join(targetProject, "skills")));
    } else if (provider.id === "codex") {
      await assert.rejects(fs.stat(path.join(targetProject, ".claude")));
      await assert.rejects(fs.stat(path.join(targetProject, "skills")));
    } else if (provider.id === "claude") {
      await assert.rejects(fs.stat(path.join(targetProject, ".agents")));
      await assert.rejects(fs.stat(path.join(targetProject, "skills")));
    }
  }
});

test("Empirical: Provider aliases (AGY, Gemini, CLAUDE, Codex) resolve to correct delivery directories", async (t) => {
  const { root, sourceRoot, recipe, cleanup } = await createTestEnvironment();
  t.after(cleanup);

  const aliases = [
    { alias: "AGY", expectedSubdir: path.join(".agents", "skills") },
    { alias: "gemini", expectedSubdir: path.join(".agents", "skills") },
    { alias: "CLAUDE", expectedSubdir: path.join(".claude", "skills") },
    { alias: "CODEX", expectedSubdir: path.join(".agents", "skills") },
  ];

  for (const item of aliases) {
    const targetRegistry = path.join(root, `target-reg-${item.alias}`);
    const targetCatalog = path.join(root, `target-cat-${item.alias}`);
    const targetProject = path.join(root, `project-${item.alias}`);
    await fs.mkdir(targetProject, { recursive: true });

    await importLocalSource({
      registryRoot: targetRegistry,
      sourcePath: sourceRoot,
    });

    const result = await applyRecipe({
      catalogRoot: targetCatalog,
      registryRoot: targetRegistry,
      recipeContent: recipe,
      projectPath: targetProject,
      providerId: item.alias,
      confirm: true,
    });

    assert.equal(result.delivery?.applied, true);
    const expectedSkill = path.join(targetProject, item.expectedSubdir, "planner-skill", "SKILL.md");
    const stat = await fs.stat(expectedSkill);
    assert.ok(stat.isFile(), `Skill must materialize for alias ${item.alias} at ${expectedSkill}`);
  }
});

test("Empirical: Preview vs Confirmed apply invariant holds (no disk mutations on preview)", async (t) => {
  const { root, sourceRoot, recipe, cleanup } = await createTestEnvironment();
  t.after(cleanup);

  const targetRegistry = path.join(root, "preview-reg");
  const targetCatalog = path.join(root, "preview-cat");
  const targetProject = path.join(root, "preview-project");
  await fs.mkdir(targetProject, { recursive: true });

  await importLocalSource({
    registryRoot: targetRegistry,
    sourcePath: sourceRoot,
  });

  // Step 1: Execute with confirm: false (Preview mode)
  const previewResult = await applyRecipe({
    catalogRoot: targetCatalog,
    registryRoot: targetRegistry,
    recipeContent: recipe,
    projectPath: targetProject,
    providerId: "antigravity",
    confirm: false,
  });

  assert.ok(previewResult.delivery);
  assert.equal(previewResult.delivery.applied, false);
  assert.ok(previewResult.delivery.preview);
  assert.equal(previewResult.delivery.preview.operations.length, 2);
  assert.match(previewResult.delivery.message, /Preview ready/);

  // EMPIRICAL INVARIANT: No .agents directory or skills should exist on disk after preview
  await assert.rejects(
    fs.stat(path.join(targetProject, ".agents")),
    /ENOENT/,
    "Preview must NEVER create .agents directory on disk"
  );
  await assert.rejects(
    fs.stat(path.join(targetProject, ".agents", "skills", "planner-skill")),
    /ENOENT/,
    "Preview must NEVER create skill symlinks on disk"
  );

  // Step 2: Execute with confirm: true (Confirmed Materialization)
  const confirmedResult = await applyRecipe({
    catalogRoot: targetCatalog,
    registryRoot: targetRegistry,
    recipeContent: recipe,
    projectPath: targetProject,
    providerId: "antigravity",
    confirm: true,
  });

  assert.ok(confirmedResult.delivery);
  assert.equal(confirmedResult.delivery.applied, true);
  assert.equal(confirmedResult.delivery.report.summary.applied, 2);

  // EMPIRICAL INVARIANT: Skills now MUST exist on disk
  const stat = await fs.stat(path.join(targetProject, ".agents", "skills", "planner-skill", "SKILL.md"));
  assert.ok(stat.isFile(), "Confirmed apply must materialize skill files on disk");
});

test("Empirical: Repeated recipe apply is idempotent and reconciles existing project & presets", async (t) => {
  const { root, sourceRoot, recipe, cleanup } = await createTestEnvironment();
  t.after(cleanup);

  const targetRegistry = path.join(root, "idempotent-reg");
  const targetCatalog = path.join(root, "idempotent-cat");
  const targetProject = path.join(root, "idempotent-project");
  await fs.mkdir(targetProject, { recursive: true });

  await importLocalSource({
    registryRoot: targetRegistry,
    sourcePath: sourceRoot,
  });

  // Apply 1st time
  const apply1 = await applyRecipe({
    catalogRoot: targetCatalog,
    registryRoot: targetRegistry,
    recipeContent: recipe,
    projectPath: targetProject,
    providerId: "codex",
    confirm: true,
  });
  assert.equal(apply1.delivery?.applied, true);

  // Apply 2nd time (should succeed without duplicate project or preset conflict errors)
  const apply2 = await applyRecipe({
    catalogRoot: targetCatalog,
    registryRoot: targetRegistry,
    recipeContent: recipe,
    projectPath: targetProject,
    providerId: "codex",
    confirm: true,
  });
  assert.equal(apply2.delivery?.applied, true);
  assert.equal(apply2.presets_reconciled.length, 1);

  // Check project in catalog
  const catalog = await loadCatalog(targetCatalog);
  assert.equal(catalog.projects.filter((p) => p.id === "idempotent-project").length, 1);
  assert.equal(catalog.presets.find((preset) => preset.id === recipe.presets[0].id).versions.length, 1);

  const revisedRecipe = JSON.parse(JSON.stringify(recipe));
  revisedRecipe.presets[0].purpose = "A revised, explicitly imported purpose";
  await applyRecipe({
    catalogRoot: targetCatalog,
    registryRoot: targetRegistry,
    recipeContent: revisedRecipe,
  });
  const revisedCatalog = await loadCatalog(targetCatalog);
  const revisedPreset = revisedCatalog.presets.find((preset) => preset.id === recipe.presets[0].id);
  assert.equal(revisedPreset.versions.length, 2);
  assert.notEqual(revisedPreset.versions[0].purpose, revisedPreset.versions[1].purpose);
  assert.equal(revisedPreset.selected_version, revisedPreset.active_version);
  const reexported = await exportRecipe({
    catalogRoot: targetCatalog,
    registryRoot: targetRegistry,
  });
  assert.deepEqual(
    reexported.presets[0].skills.map((skill) => skill.skill_name).sort(),
    reexported.skills.map((skill) => skill.name).sort(),
  );
});

test("Empirical: Missing project_path applies recipe to catalog/registry only without delivery", async (t) => {
  const { root, sourceRoot, recipe, cleanup } = await createTestEnvironment();
  t.after(cleanup);

  const targetRegistry = path.join(root, "no-project-reg");
  const targetCatalog = path.join(root, "no-project-cat");

  await importLocalSource({
    registryRoot: targetRegistry,
    sourcePath: sourceRoot,
  });

  const result = await applyRecipe({
    catalogRoot: targetCatalog,
    registryRoot: targetRegistry,
    recipeContent: recipe,
    projectPath: null, // No project path
    confirm: true,
  });

  assert.equal(result.name, "Enterprise Multi-Provider Recipe");
  assert.equal(result.presets_reconciled.length, 1);
  assert.equal(result.delivery, null);
});

test("Empirical: Invalid recipe manifest throws descriptive validation issues", async (t) => {
  const { root, cleanup } = await createTestEnvironment();
  t.after(cleanup);

  const targetRegistry = path.join(root, "err-reg");
  const targetCatalog = path.join(root, "err-cat");

  const invalidRecipe = {
    schema_version: 999, // unsupported
    recipe_id: "",
    name: "",
    sources: "invalid_type",
  };

  await assert.rejects(
    async () => {
      await applyRecipe({
        catalogRoot: targetCatalog,
        registryRoot: targetRegistry,
        recipeContent: invalidRecipe,
      });
    },
    (err) => {
      assert.match(err.message, /Invalid skill recipe/);
      assert.ok(Array.isArray(err.issues));
      assert.ok(err.issues.some((i) => i.field === "schema_version"));
      assert.ok(err.issues.some((i) => i.field === "sources"));
      return true;
    }
  );
});

test("Empirical: HTTP Server REST endpoint handles preview, confirm, multi-provider, and errors", async (t) => {
  const { root, sourceRoot, recipe, cleanup } = await createTestEnvironment();
  t.after(cleanup);

  const catalogRoot = path.join(root, "server-catalog");
  const registryRoot = path.join(root, "server-registry");

  await importLocalSource({ registryRoot, sourcePath: sourceRoot });

  const server = createCatalogServer({ catalogRoot, registryRoot });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());

  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}/api/recipes`;

  // 1. Test POST /api/recipes/inspect
  const inspectRes = await fetch(`${baseUrl}/inspect`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ recipe }),
  });
  assert.equal(inspectRes.status, 200);
  const inspectData = await inspectRes.json();
  assert.equal(inspectData.valid, true);
  assert.equal(inspectData.summary.skills_count, 2);

  // 2. Test POST /api/recipes/apply (Preview for claude)
  const claudeProject = path.join(root, "server-claude-project");
  await fs.mkdir(claudeProject, { recursive: true });

  const previewRes = await fetch(`${baseUrl}/apply`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      recipe,
      project_path: claudeProject,
      provider_id: "claude",
      confirm: false,
    }),
  });
  assert.equal(previewRes.status, 200);
  const previewData = await previewRes.json();
  assert.equal(previewData.delivery.applied, false);
  assert.ok(previewData.delivery.preview);
  await assert.rejects(fs.stat(path.join(claudeProject, ".claude")));

  // 3. Test POST /api/recipes/apply (Confirmed for claude)
  const confirmRes = await fetch(`${baseUrl}/apply`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      recipe,
      project_path: claudeProject,
      provider_id: "claude",
      confirm: true,
    }),
  });
  assert.equal(confirmRes.status, 200);
  const confirmData = await confirmRes.json();
  assert.equal(confirmData.delivery.applied, true);
  assert.equal(confirmData.delivery.report.summary.applied, 2);

  const claudeSkillFile = path.join(claudeProject, ".claude", "skills", "planner-skill", "SKILL.md");
  const stat = await fs.stat(claudeSkillFile);
  assert.ok(stat.isFile());

  // 4. Test POST /api/recipes/apply (Invalid JSON schema)
  const invalidRes = await fetch(`${baseUrl}/apply`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      recipe: { schema_version: 5 },
      project_path: claudeProject,
    }),
  });
  assert.equal(invalidRes.status, 400);
  const errData = await invalidRes.json();
  assert.match(errData.error, /Invalid skill recipe/);
  assert.ok(errData.issues.length > 0);

  // 5. Test POST /api/recipes/apply without project_path
  const noProjRes = await fetch(`${baseUrl}/apply`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      recipe,
      confirm: true,
    }),
  });
  assert.equal(noProjRes.status, 200);
  const noProjData = await noProjRes.json();
  assert.equal(noProjData.delivery, null);
  assert.equal(noProjData.presets_reconciled.length, 1);
});
