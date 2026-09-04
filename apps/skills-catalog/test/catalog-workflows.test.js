const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  PRISTINE_PRESET_ID,
  addSkillNote,
  assignPreset,
  buildProjectSystemPrompt,
  buildSystemPrompt,
  createPreset,
  createProject,
  createProjectPlan,
  importLocalSource,
  listActivationHistory,
  loadCatalog,
  recordActivationPlan,
  recordActivationReport,
  replaceWorkScopeOverlay,
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

test("Codex projects default to official repository and user skill roots", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "codex-delivery-roots-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const catalogRoot = path.join(root, "catalog");
  const projectPath = path.join(root, "project");

  const project = await createProject({
    catalogRoot,
    id: "codex-project",
    name: "Codex project",
    projectPath,
    providerId: "codex",
  });
  const global = await createProject({
    catalogRoot,
    id: "codex-global",
    name: "Codex global",
    projectPath: path.join(root, "must-not-be-used-for-global"),
    providerId: "codex",
    scope: "global",
  });

  assert.equal(project.delivery_root, path.join(projectPath, ".agents", "skills"));
  assert.equal(global.delivery_root, path.join(os.homedir(), ".agents", "skills"));
  await assert.rejects(
    () => createProject({
      catalogRoot,
      id: "codex-custom-root",
      name: "Codex custom root",
      projectPath,
      providerId: "codex",
      deliveryRoot: path.join(projectPath, "skills"),
    }),
    /Codex delivery root must be/,
  );
});

test("legacy Codex defaults migrate without rewriting custom delivery roots", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "codex-delivery-migration-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const catalogRoot = path.join(root, "catalog");
  const projectPath = path.join(root, "project");
  const customProjectRoot = path.join(projectPath, "custom-skills");
  const customGlobalRoot = path.join(root, "shared-custom-skills");
  const project = (id, scope, deliveryRoot) => ({
    id,
    name: id,
    provider_id: "codex",
    scope,
    project_path: scope === "project" ? projectPath : null,
    delivery_root: deliveryRoot,
    default_preset_id: PRISTINE_PRESET_ID,
    default_preset_version: 1,
    preset_assignments: [],
    created_at: "2026-01-01T00:00:00.000Z",
  });
  await fs.mkdir(catalogRoot, { recursive: true });
  await fs.writeFile(path.join(catalogRoot, "catalog.json"), JSON.stringify({
    schema_version: 9,
    projects: [
      project("legacy-project", "project", path.join(projectPath, "skills")),
      project("custom-project", "project", customProjectRoot),
      project("legacy-global", "global", path.resolve("skills")),
      project("custom-global", "global", customGlobalRoot),
    ],
    presets: [],
  }), "utf8");

  const catalog = await loadCatalog(catalogRoot);
  const byId = new Map(catalog.projects.map((item) => [item.id, item]));
  assert.equal(byId.get("legacy-project").delivery_root, path.join(projectPath, ".agents", "skills"));
  assert.equal(byId.get("custom-project").delivery_root, customProjectRoot);
  assert.equal(byId.get("legacy-global").delivery_root, path.join(os.homedir(), ".agents", "skills"));
  assert.equal(byId.get("custom-global").delivery_root, customGlobalRoot);
});

test("Antigravity projects use provider-specific project and global discovery roots", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "antigravity-delivery-roots-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const catalogRoot = path.join(root, "catalog");
  const projectPath = path.join(root, "project");

  const project = await createProject({
    catalogRoot,
    id: "agy-project",
    name: "Antigravity project",
    projectPath,
    providerId: "antigravity",
  });
  const legacyProject = await createProject({
    catalogRoot,
    id: "agy-legacy-project",
    name: "Antigravity legacy project",
    projectPath,
    providerId: "agy",
    deliveryRoot: path.join(projectPath, ".agent", "skills"),
  });
  const global = await createProject({
    catalogRoot,
    id: "agy-global",
    name: "Antigravity global",
    providerId: "gemini",
    scope: "global",
  });

  assert.equal(project.delivery_root, path.join(projectPath, ".agents", "skills"));
  assert.equal(legacyProject.delivery_root, path.join(projectPath, ".agent", "skills"));
  assert.equal(global.delivery_root, path.join(os.homedir(), ".gemini", "config", "skills"));
  await assert.rejects(
    () => createProject({
      catalogRoot,
      id: "agy-invalid",
      name: "Invalid Antigravity root",
      projectPath,
      providerId: "antigravity",
      deliveryRoot: path.join(projectPath, "skills"),
    }),
    /Antigravity delivery root must be/,
  );
});

test("legacy Antigravity global default migrates without rewriting a custom root", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "antigravity-delivery-migration-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const catalogRoot = path.join(root, "catalog");
  const customRoot = path.join(root, "custom-global-skills");
  const project = (id, deliveryRoot) => ({
    id,
    name: id,
    provider_id: "antigravity",
    scope: "global",
    project_path: null,
    delivery_root: deliveryRoot,
    default_preset_id: PRISTINE_PRESET_ID,
    default_preset_version: 1,
    preset_assignments: [],
    created_at: "2026-01-01T00:00:00.000Z",
  });
  await fs.mkdir(catalogRoot, { recursive: true });
  await fs.writeFile(path.join(catalogRoot, "catalog.json"), JSON.stringify({
    schema_version: 10,
    projects: [
      project("legacy-agy-global", path.resolve("skills")),
      project("custom-agy-global", customRoot),
    ],
    presets: [],
  }), "utf8");

  const catalog = await loadCatalog(catalogRoot);
  const byId = new Map(catalog.projects.map((item) => [item.id, item]));
  assert.equal(
    byId.get("legacy-agy-global").delivery_root,
    path.join(os.homedir(), ".gemini", "config", "skills"),
  );
  assert.equal(byId.get("custom-agy-global").delivery_root, customRoot);
});

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

test("enabled-only project plans bootstrap selected skills without emitting unrelated disables", async (context) => {
  const { catalogRoot, imported, project, registryRoot } = await setup(context);
  const selected = imported.skills.find((skill) => skill.skill_name === "writing-guide");
  const preset = await createPreset({
    catalogRoot,
    registryRoot,
    id: "additive-writing",
    name: "Additive writing",
    registrySkillIds: [selected.id],
  });
  await assignPreset({ catalogRoot, projectId: project.id, presetId: preset.id });

  const plan = await createProjectPlan({
    catalogRoot,
    registryRoot,
    projectId: project.id,
    enabledOnly: true,
  });

  assert.equal(plan.mode, "apply");
  assert.deepEqual(plan.operations.map((operation) => operation.registry_skill_id), [selected.id]);
  assert.ok(plan.operations.every((operation) => operation.desired_state === "enabled"));
});

test("pristine baseline disables all known managed skills for a project", async (context) => {
  const { catalogRoot, imported, project, registryRoot } = await setup(context);
  await assignPreset({ catalogRoot, projectId: project.id, presetId: PRISTINE_PRESET_ID });

  const plan = await createProjectPlan({ catalogRoot, registryRoot, projectId: project.id });

  assert.equal(plan.mode, "pristine");
  assert.equal(plan.operations.length, imported.skills.length);
  assert.ok(plan.operations.every((operation) => operation.desired_state === "disabled"));
  await assert.rejects(
    () => createProjectPlan({ catalogRoot, registryRoot, projectId: project.id, enabledOnly: true }),
    /enabledOnly cannot be used with the pristine baseline/,
  );
});

test("a work-scope overlay can be replaced or cleared without changing the default template", async (context) => {
  const { catalogRoot, imported, project, registryRoot } = await setup(context);
  const writing = imported.skills.find((skill) => skill.skill_name === "writing-guide");
  const review = imported.skills.find((skill) => skill.skill_name === "review-guide");
  const defaultPreset = await createPreset({ catalogRoot, registryRoot, id: "default", name: "Default", registrySkillIds: [writing.id] });
  await createPreset({ catalogRoot, registryRoot, id: "review", name: "Review", registrySkillIds: [review.id] });
  await assignPreset({ catalogRoot, projectId: project.id, presetId: defaultPreset.id });
  await replaceWorkScopeOverlay({ catalogRoot, projectId: project.id, presetId: "review", workScopeTags: ["review"] });
  assert.equal((await createProjectPlan({ catalogRoot, registryRoot, projectId: project.id, workScopeTags: ["review"] })).operations.filter((item) => item.desired_state === "enabled").length, 2);
  await replaceWorkScopeOverlay({ catalogRoot, projectId: project.id, presetId: null, workScopeTags: ["review"] });
  assert.equal((await createProjectPlan({ catalogRoot, registryRoot, projectId: project.id, workScopeTags: ["review"] })).operations.filter((item) => item.desired_state === "enabled").length, 1);
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

test("project prompt export follows the effective selection and includes scoped notes", async (context) => {
  const { catalogRoot, imported, project, registryRoot } = await setup(context);
  const writingSkill = imported.skills.find((skill) => skill.skill_name === "writing-guide");
  const preset = await createPreset({
    catalogRoot,
    registryRoot,
    id: "docs-writing",
    name: "Docs writing",
    registrySkillIds: [writingSkill.id],
  });
  await assignPreset({ catalogRoot, projectId: project.id, presetId: preset.id });
  await addSkillNote({
    catalogRoot,
    registryRoot,
    lineageId: writingSkill.lineage_id,
    scope: "project",
    projectId: project.id,
    body: "Project-only guardrail.",
    injectIntoPrompt: true,
  });

  const prompt = await buildProjectSystemPrompt({
    catalogRoot,
    registryRoot,
    projectId: project.id,
    workScopeTags: ["implementation"],
    includeInjectedNotes: true,
  });

  assert.equal(prompt.project_id, project.id);
  assert.deepEqual(prompt.included_skill_ids, [writingSkill.id]);
  assert.match(prompt.content, /Project-only guardrail\./);
});

test("records immutable plan context and adapter reports for project history", async (context) => {
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
  const recorded = await recordActivationPlan({
    catalogRoot,
    plan,
    projectId: project.id,
    assignments: [{ preset_id: preset.id, template_version: 1, role: "default" }],
  });
  await recordActivationReport({
    catalogRoot,
    planId: plan.plan_id,
    report: {
      plan_id: plan.plan_id,
      completed_at: "2026-08-14T00:00:00.000Z",
      operations: [],
      summary: { applied: 1, skipped: 1 },
    },
  });
  const history = await listActivationHistory({ catalogRoot, projectId: project.id });

  assert.equal(recorded.digest.length, 64);
  assert.equal(history.length, 1);
  assert.equal(history[0].assignments[0].preset_id, preset.id);
  assert.equal(history[0].reports[0].status, "completed");
});
