const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const {
  applyRecipe, exportRecipe, importLocalSource, importGitSource, listRegistrySkills, createPreset,
  updatePresetTemplate, getPreset, createProject, assignPreset, getProject,
  updateSkillProfile, getSkillProfile, loadCatalog, saveCatalog, recordSourceReview,
} = require("../src");
const execFileAsync = promisify(execFile);

async function fixture(context) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "recipe-metadata-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const sourcePath = path.join(root, "source");
  const registryRoot = path.join(root, "registry");
  const catalogRoot = path.join(root, "catalog");
  const projectPath = path.join(root, "original-project");
  await fs.mkdir(projectPath, { recursive: true });
  for (const name of ["baseline", "debugging"]) {
    await fs.mkdir(path.join(sourcePath, name), { recursive: true });
    await fs.writeFile(path.join(sourcePath, name, "SKILL.md"), `---\nname: ${name}\ndescription: ${name} package\n---\n# ${name}\n`);
  }
  const imported = await importLocalSource({ registryRoot, sourcePath });
  const skills = Object.fromEntries(imported.skills.map((skill) => [skill.skill_name, skill]));
  return { root, sourcePath, registryRoot, catalogRoot, projectPath, skills };
}

function assignments(project) {
  return project.preset_assignments.map(({ preset_id, template_version, role, priority, work_scope_tags, enabled }) => ({
    preset_id, template_version, role, priority, work_scope_tags, enabled,
  }));
}

test("recipe metadata roundtrip preserves profiles, pinned assignments, recommendations and portable delivery roots", async (context) => {
  const fixtureData = await fixture(context);
  const { root, catalogRoot, registryRoot, projectPath, skills } = fixtureData;
  const profilePatch = {
    title: "Platform guide", summary: "Curated guide", purpose: "Consistent onboarding",
    use_when: ["First project setup"], avoid_when: ["Unrelated deployment"], tags: ["guide"], domains: ["platform"],
    work_scope_tags: ["onboarding"], owner: "Platform", maintainers: ["Maintainer"], visibility: "team",
    provider_constraints: ["codex"], runtime_requirements: ["node >=20"], risk_level: "low",
    review_state: "reviewed", invocation_mode: "user_invoked", artifact_type: "skill",
  };
  await updateSkillProfile({ catalogRoot, registryRoot, lineageId: skills.baseline.lineage_id, patch: profilePatch });
  await createPreset({ catalogRoot, registryRoot, id: "platform", name: "Platform", registrySkillIds: [skills.baseline.id], purpose: "Default onboarding", lifecycle: "reviewed" });
  await updatePresetTemplate({ catalogRoot, registryRoot, presetId: "platform", patch: { registrySkillIds: [skills.debugging.id], purpose: "Optional debugging" } });
  await updatePresetTemplate({ catalogRoot, registryRoot, presetId: "platform", patch: { registrySkillIds: [skills.baseline.id, skills.debugging.id], purpose: "New unpublished set" } });
  await createProject({ catalogRoot, id: "portable-project", name: "Portable project", projectPath, providerId: "codex" });
  await assignPreset({ catalogRoot, projectId: "portable-project", presetId: "platform", version: 1, role: "default", priority: 5, workScopeTags: ["onboarding"] });
  await assignPreset({ catalogRoot, projectId: "portable-project", presetId: "platform", version: 2, role: "recommended", priority: 20, workScopeTags: ["debugging"] });
  await assignPreset({ catalogRoot, projectId: "portable-project", presetId: "platform", version: 2, role: "work_scope_overlay", priority: 30, workScopeTags: ["debugging"], enabled: false });
  // Evidence lives in the source Catalog and must not become imported approval.
  const catalog = await loadCatalog(catalogRoot);
  catalog.source_reviews.push({ id: "source-review", source_revision_id: skills.baseline.source_revision_id, decision: "approved", reviewed_at: new Date().toISOString() });
  catalog.evaluation_runs.push({ id: "evaluation-evidence", lineage_id: skills.baseline.lineage_id });
  await saveCatalog(catalogRoot, catalog);

  const recipe = await exportRecipe({ catalogRoot, registryRoot, projectId: "portable-project" });
  assert.equal(recipe.schema_version, 1);
  assert.deepEqual(recipe.skills.find((skill) => skill.name === "baseline").profile, profilePatch);
  assert.deepEqual(recipe.presets.map((preset) => [preset.version, preset.purpose]), [[1, "Default onboarding"], [2, "Optional debugging"]]);
  assert.equal(recipe.projects[0].delivery_root_relative, ".agents/skills");
  assert.deepEqual(recipe.projects[0].preset_assignments, assignments(await getProject(catalogRoot, "portable-project")));
  assert.equal(JSON.stringify(recipe).includes("source-review"), false);
  assert.equal(JSON.stringify(recipe).includes("evaluation-evidence"), false);
  assert.equal(JSON.stringify(recipe).includes("reviewed_at"), false);
  assert.equal(JSON.stringify(recipe.projects).includes(projectPath), false);

  const targetCatalog = path.join(root, "target-catalog");
  const targetRegistry = path.join(root, "target-registry");
  const targetPath = path.join(root, "target-project");
  await fs.mkdir(targetPath, { recursive: true });
  const applied = await applyRecipe({ catalogRoot: targetCatalog, registryRoot: targetRegistry, recipeContent: recipe, projectPath: targetPath, enabledOnly: true });
  assert.deepEqual(applied.delivery.preview.operations.map((operation) => operation.operation.skill_name), ["baseline"]);
  const project = await getProject(targetCatalog, "portable-project");
  assert.deepEqual(assignments(project), recipe.projects[0].preset_assignments);
  assert.equal(project.delivery_root, path.join(targetPath, ".agents", "skills"));
  const targetSkill = (await listRegistrySkills(targetRegistry)).find((skill) => skill.skill_name === "baseline");
  const profile = await getSkillProfile({ catalogRoot: targetCatalog, registryRoot: targetRegistry, lineageId: targetSkill.lineage_id });
  for (const [field, value] of Object.entries(profilePatch)) assert.deepEqual(profile[field], value, field);
  assert.deepEqual((await loadCatalog(targetCatalog)).source_reviews, []);
  assert.deepEqual((await loadCatalog(targetCatalog)).evaluation_runs, []);
  assert.equal((await getPreset(targetCatalog, "platform")).lifecycle, "reviewed");

  await applyRecipe({ catalogRoot: targetCatalog, registryRoot: targetRegistry, recipeContent: recipe, projectPath: targetPath, enabledOnly: true });
  assert.deepEqual(assignments(await getProject(targetCatalog, "portable-project")), assignments(project));
  assert.equal((await getPreset(targetCatalog, "platform")).versions.length, 2);
});

test("legacy recipes preserve omitted local profile, preset metadata and additional project assignments", async (context) => {
  const { root, catalogRoot, registryRoot, projectPath, skills } = await fixture(context);
  await createPreset({ catalogRoot, registryRoot, id: "default-set", name: "Default", registrySkillIds: [skills.baseline.id], description: "Local description", purpose: "Local purpose", workScopeTags: ["local"], owner: "Local owner", lifecycle: "reviewed" });
  await createPreset({ catalogRoot, registryRoot, id: "optional-set", name: "Optional", registrySkillIds: [skills.debugging.id] });
  await createProject({ catalogRoot, id: "legacy-project", name: "Legacy", projectPath, providerId: "codex" });
  await assignPreset({ catalogRoot, projectId: "legacy-project", presetId: "default-set" });
  await assignPreset({ catalogRoot, projectId: "legacy-project", presetId: "optional-set", role: "recommended", enabled: false, priority: 9 });
  const expectedProfile = await updateSkillProfile({ catalogRoot, registryRoot, lineageId: skills.baseline.lineage_id, patch: { purpose: "Local profile purpose", summary: "Local summary", tags: ["local"], invocation_mode: "hybrid" } });
  const recipe = await exportRecipe({ catalogRoot, registryRoot, projectId: "legacy-project" });
  for (const skill of recipe.skills) {
    delete skill.profile;
    delete skill.artifact_type;
    delete skill.invocation_mode;
    delete skill.description;
  }
  for (const preset of recipe.presets) {
    for (const field of ["owner", "lifecycle", "description", "purpose", "work_scope_tags"]) delete preset[field];
  }
  delete recipe.projects[0].preset_assignments;
  const beforeAssignments = assignments(await getProject(catalogRoot, "legacy-project"));
  await applyRecipe({ catalogRoot, registryRoot, recipeContent: recipe, projectPath, enabledOnly: true });
  assert.deepEqual(assignments(await getProject(catalogRoot, "legacy-project")), beforeAssignments);
  const profile = await getSkillProfile({ catalogRoot, registryRoot, lineageId: skills.baseline.lineage_id });
  assert.deepEqual(profile, expectedProfile);
  const preset = await getPreset(catalogRoot, "default-set");
  assert.equal(preset.purpose, "Local purpose");
  assert.equal(preset.description, "Local description");
  assert.equal(preset.owner, "Local owner");
  assert.equal(preset.lifecycle, "reviewed");
  assert.deepEqual(preset.work_scope_tags, ["local"]);
  assert.equal(preset.versions.length, 1);
});

test("recipe assignment versions map to immutable local snapshots without losing declared versions on a fresh catalog", async (context) => {
  const { root, catalogRoot, registryRoot, skills } = await fixture(context);
  await createPreset({ catalogRoot, registryRoot, id: "versioned", name: "Versioned", registrySkillIds: [skills.baseline.id] });
  const recipe = await exportRecipe({ catalogRoot, registryRoot, presetId: "versioned" });
  recipe.presets[0].version = 4;
  const projectPath = path.join(root, "versioned-project");
  await fs.mkdir(projectPath, { recursive: true });
  recipe.projects = [{ project_id: "versioned-project", project_name: "Versioned project", provider_id: "codex", scope: "project", default_preset_id: "versioned", default_preset_version: 4,
    preset_assignments: [{ preset_id: "versioned", template_version: 4, role: "default", priority: 7, enabled: true, work_scope_tags: [] }] }];
  const targetCatalog = path.join(root, "version-catalog");
  const targetRegistry = path.join(root, "version-registry");
  await applyRecipe({ catalogRoot: targetCatalog, registryRoot: targetRegistry, recipeContent: recipe, projectPath, enabledOnly: true });
  assert.equal((await getProject(targetCatalog, "versioned-project")).default_preset_version, 4);
  await updatePresetTemplate({ catalogRoot: targetCatalog, registryRoot: targetRegistry, presetId: "versioned", patch: { purpose: "Local next version" } });
  recipe.presets[0].purpose = "Changed portable version";
  await applyRecipe({ catalogRoot: targetCatalog, registryRoot: targetRegistry, recipeContent: recipe, projectPath, enabledOnly: true });
  assert.equal((await getProject(targetCatalog, "versioned-project")).default_preset_version, 6);
  assert.equal((await getPreset(targetCatalog, "versioned", 4)).purpose, null);
  await applyRecipe({ catalogRoot: targetCatalog, registryRoot: targetRegistry, recipeContent: recipe, projectPath, enabledOnly: true });
  assert.equal((await getPreset(targetCatalog, "versioned")).versions.length, 3);
});

test("recipe classification and lifecycle do not approve sources or weaken an existing strict project", async (context) => {
  const { root, catalogRoot, registryRoot, skills } = await fixture(context);
  await createPreset({ catalogRoot, registryRoot, id: "strict-set", name: "Strict", registrySkillIds: [skills.baseline.id], lifecycle: "reviewed" });
  await updateSkillProfile({ catalogRoot, registryRoot, lineageId: skills.baseline.lineage_id, patch: { review_state: "reviewed" } });
  const recipe = await exportRecipe({ catalogRoot, registryRoot, presetId: "strict-set" });
  recipe.projects = [{ project_id: "strict-project", project_name: "Strict", provider_id: "codex", scope: "project", default_preset_id: "strict-set", default_preset_version: 1, review_policy: "require_approved" }];
  const targetCatalog = path.join(root, "strict-catalog");
  const targetRegistry = path.join(root, "strict-registry");
  const projectPath = path.join(root, "strict-project");
  await fs.mkdir(projectPath, { recursive: true });
  const apply = () => applyRecipe({ catalogRoot: targetCatalog, registryRoot: targetRegistry, recipeContent: recipe, projectPath, enabledOnly: true });
  await assert.rejects(apply, /requires an approved source review/);
  assert.equal((await getProject(targetCatalog, "strict-project")).review_policy, "require_approved");
  recipe.projects[0].review_policy = "advisory";
  await assert.rejects(apply, /requires an approved source review/);
  delete recipe.projects[0].review_policy;
  await assert.rejects(apply, /requires an approved source review/);
  assert.equal((await getProject(targetCatalog, "strict-project")).review_policy, "require_approved");
  const targetSkill = (await listRegistrySkills(targetRegistry)).find((skill) => skill.skill_name === "baseline");
  await recordSourceReview({ catalogRoot: targetCatalog, registryRoot: targetRegistry, sourceRevisionId: targetSkill.source_revision_id, decision: "approved", summary: "Reviewed exact test revision" });
  assert.equal((await apply()).delivery.applied, false);
});

test("project recipe resolves the same skill name at multiple pinned Git revisions", async (context) => {
  const { root, catalogRoot, registryRoot, projectPath } = await fixture(context);
  const repository = path.join(root, "git-source");
  const skillRoot = path.join(repository, "skills", "same-name");
  await fs.mkdir(skillRoot, { recursive: true });
  await execFileAsync("git", ["init", "--quiet", repository]);
  await execFileAsync("git", ["-C", repository, "config", "user.name", "Test"]);
  await execFileAsync("git", ["-C", repository, "config", "user.email", "test@example.com"]);
  const versions = [];
  for (const version of [1, 2]) {
    await fs.writeFile(path.join(skillRoot, "SKILL.md"), `---\nname: same-name\ndescription: version ${version}\n---\n# Version ${version}\n`);
    await execFileAsync("git", ["-C", repository, "add", "."]);
    await execFileAsync("git", ["-C", repository, "commit", "--quiet", "-m", `Version ${version}`]);
    versions.push((await importGitSource({ registryRoot, repository, ref: "HEAD" })).skills[0]);
  }
  await createPreset({ catalogRoot, registryRoot, id: "git-pinned", name: "Git pinned", registrySkillIds: [versions[0].id] });
  await updatePresetTemplate({ catalogRoot, registryRoot, presetId: "git-pinned", patch: { registrySkillIds: [versions[1].id] } });
  await createProject({ catalogRoot, id: "git-project", name: "Git project", projectPath, providerId: "codex" });
  await assignPreset({ catalogRoot, projectId: "git-project", presetId: "git-pinned", version: 1 });
  await assignPreset({ catalogRoot, projectId: "git-project", presetId: "git-pinned", version: 2, role: "recommended" });
  const recipe = await exportRecipe({ catalogRoot, registryRoot, projectId: "git-project" });
  assert.equal(recipe.sources.length, 2);
  assert.equal(recipe.skills.length, 2);
  assert.notEqual(recipe.presets[0].skills[0].content_digest, recipe.presets[1].skills[0].content_digest);
  const targetRegistry = path.join(root, "git-target-registry");
  const targetCatalog = path.join(root, "git-target-catalog");
  const targetPath = path.join(root, "git-target-project");
  await fs.mkdir(targetPath, { recursive: true });
  const result = await applyRecipe({ catalogRoot: targetCatalog, registryRoot: targetRegistry, recipeContent: recipe, projectPath: targetPath, enabledOnly: true });
  assert.equal(result.delivery.preview.operations.length, 1);
  assert.equal(result.delivery.preview.operations[0].operation.content_digest, versions[0].content_digest);
  const allTargetSkills = new Map((await listRegistrySkills(targetRegistry)).map((skill) => [skill.id, skill]));
  for (const version of [1, 2]) {
    const preset = await getPreset(targetCatalog, "git-pinned", version);
    assert.equal(allTargetSkills.get(preset.registry_skill_ids[0]).content_digest, versions[version - 1].content_digest);
  }
});
