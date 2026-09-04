const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  CATALOG_SCHEMA_VERSION,
  PRISTINE_PRESET_ID,
  assignPreset,
  buildProjectSystemPrompt,
  clearProjectSkillOverride,
  createPreset,
  createProject,
  createProjectPlan,
  getProject,
  importLocalSource,
  loadCatalog,
  resolveProjectEffectiveSet,
  resolveProjectSelection,
  saveCatalog,
  setProjectSkillOverride,
} = require("../src");

async function setup(context) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "project-skill-overrides-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const sourceRoot = path.join(root, "source");
  const writingPath = path.join(sourceRoot, "writer");
  const reviewPath = path.join(sourceRoot, "review");
  await fs.mkdir(writingPath, { recursive: true });
  await fs.mkdir(reviewPath, { recursive: true });
  await fs.writeFile(
    path.join(writingPath, "SKILL.md"),
    "---\nname: writing-guide\ndescription: Write clear docs.\n---\n\n# Writing guide\n\nVersion one.\n",
  );
  await fs.writeFile(
    path.join(reviewPath, "SKILL.md"),
    "---\nname: review-guide\ndescription: Review changes.\n---\n\n# Review guide\n",
  );

  const registryRoot = path.join(root, "registry");
  const catalogRoot = path.join(root, "catalog");
  const firstImport = await importLocalSource({ registryRoot, sourcePath: sourceRoot });
  const writingV1 = firstImport.skills.find((skill) => skill.skill_name === "writing-guide");

  await fs.writeFile(
    path.join(writingPath, "SKILL.md"),
    "---\nname: writing-guide\ndescription: Write clearer docs.\n---\n\n# Writing guide\n\nVersion two.\n",
  );
  const secondImport = await importLocalSource({ registryRoot, sourcePath: sourceRoot });
  const writingV2 = secondImport.skills.find((skill) => skill.skill_name === "writing-guide");
  const reviewV2 = secondImport.skills.find((skill) => skill.skill_name === "review-guide");
  const project = await createProject({
    catalogRoot,
    id: "docs",
    name: "Documentation",
    projectPath: path.join(root, "project"),
    providerId: "codex",
  });

  return { catalogRoot, project, registryRoot, reviewV2, root, writingV1, writingV2 };
}

function stablePlan(plan) {
  return {
    mode: plan.mode,
    target: plan.target,
    distribution: plan.distribution,
    operations: plan.operations,
  };
}

test("catalog v9 projects migrate compatibly with an empty skill override collection", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "project-skill-override-migration-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const catalogRoot = path.join(root, "catalog");
  await fs.mkdir(catalogRoot, { recursive: true });
  await fs.writeFile(path.join(catalogRoot, "catalog.json"), JSON.stringify({
    schema_version: 9,
    projects: [{
      id: "legacy",
      name: "Legacy",
      provider_id: "codex",
      scope: "project",
      project_path: path.join(root, "legacy"),
      delivery_root: path.join(root, "legacy", "skills"),
      default_preset_id: PRISTINE_PRESET_ID,
      default_preset_version: 1,
      preset_assignments: [],
      created_at: "2026-01-01T00:00:00.000Z",
    }],
    presets: [],
  }), "utf8");

  const catalog = await loadCatalog(catalogRoot);
  assert.equal(catalog.schema_version, CATALOG_SCHEMA_VERSION);
  assert.deepEqual(catalog.projects[0].skill_overrides, []);
  await saveCatalog(catalogRoot, catalog);
  const persisted = JSON.parse(await fs.readFile(path.join(catalogRoot, "catalog.json"), "utf8"));
  assert.equal(persisted.schema_version, CATALOG_SCHEMA_VERSION);
  assert.deepEqual(persisted.projects[0].skill_overrides, []);
});

test("set and clear validate registry identity, lineage membership, and desired state", async (context) => {
  const { catalogRoot, project, registryRoot, reviewV2, writingV1, writingV2 } = await setup(context);

  await assert.rejects(
    () => setProjectSkillOverride({
      catalogRoot,
      registryRoot,
      projectId: project.id,
      lineageId: reviewV2.lineage_id,
      registrySkillId: writingV1.id,
      desiredState: "enabled",
    }),
    /does not belong to lineage/,
  );
  await assert.rejects(
    () => setProjectSkillOverride({
      catalogRoot,
      registryRoot,
      projectId: project.id,
      lineageId: writingV1.lineage_id,
      registrySkillId: "skill_missing",
      desiredState: "enabled",
    }),
    /Registry skills not found/,
  );
  await assert.rejects(
    () => setProjectSkillOverride({
      catalogRoot,
      registryRoot,
      projectId: project.id,
      lineageId: writingV1.lineage_id,
      registrySkillId: writingV1.id,
      desiredState: "inherit",
    }),
    /desired state must be enabled or disabled/,
  );

  const enabled = await setProjectSkillOverride({
    catalogRoot,
    registryRoot,
    projectId: project.id,
    lineageId: writingV1.lineage_id,
    registrySkillId: writingV1.id,
    desiredState: "enabled",
    updatedAt: "2026-09-04T01:00:00.000Z",
  });
  assert.deepEqual(enabled, {
    lineage_id: writingV1.lineage_id,
    registry_skill_id: writingV1.id,
    desired_state: "enabled",
    updated_at: "2026-09-04T01:00:00.000Z",
  });

  await setProjectSkillOverride({
    catalogRoot,
    registryRoot,
    projectId: project.id,
    lineageId: writingV2.lineage_id,
    registrySkillId: writingV2.id,
    desiredState: "disabled",
    updatedAt: "2026-09-04T02:00:00.000Z",
  });
  const stored = await getProject(catalogRoot, project.id);
  assert.equal(stored.skill_overrides.length, 1);
  assert.equal(stored.skill_overrides[0].registry_skill_id, writingV2.id);
  assert.equal(stored.skill_overrides[0].desired_state, "disabled");

  await assert.rejects(
    () => clearProjectSkillOverride({
      catalogRoot,
      registryRoot,
      projectId: project.id,
      lineageId: "lineage_missing",
    }),
    /Skill lineage not found/,
  );
  const cleared = await clearProjectSkillOverride({
    catalogRoot,
    registryRoot,
    projectId: project.id,
    lineageId: writingV1.lineage_id,
  });
  assert.equal(cleared.cleared, true);
  assert.equal(cleared.override.registry_skill_id, writingV2.id);
  assert.deepEqual((await getProject(catalogRoot, project.id)).skill_overrides, []);
  assert.equal((await clearProjectSkillOverride({
    catalogRoot,
    registryRoot,
    projectId: project.id,
    lineageId: writingV1.lineage_id,
  })).cleared, false);

  await Promise.all([
    setProjectSkillOverride({
      catalogRoot,
      registryRoot,
      projectId: project.id,
      lineageId: reviewV2.lineage_id,
      registrySkillId: reviewV2.id,
      desiredState: "disabled",
      updatedAt: "2026-09-04T05:00:00.000Z",
    }),
    setProjectSkillOverride({
      catalogRoot,
      registryRoot,
      projectId: project.id,
      lineageId: writingV1.lineage_id,
      registrySkillId: writingV1.id,
      desiredState: "enabled",
      updatedAt: "2026-09-04T05:00:01.000Z",
    }),
  ]);
  const concurrent = (await getProject(catalogRoot, project.id)).skill_overrides;
  assert.equal(concurrent.length, 2);
  assert.deepEqual(
    concurrent.map((override) => override.lineage_id),
    [reviewV2.lineage_id, writingV1.lineage_id].sort((left, right) => left.localeCompare(right)),
  );
});

test("an enabled override wins over Pristine and pins the exact requested revision", async (context) => {
  const { catalogRoot, project, registryRoot, writingV1, writingV2 } = await setup(context);
  const baseline = await createProjectPlan({
    catalogRoot,
    registryRoot,
    projectId: project.id,
    presetId: PRISTINE_PRESET_ID,
  });

  await setProjectSkillOverride({
    catalogRoot,
    registryRoot,
    projectId: project.id,
    lineageId: writingV1.lineage_id,
    registrySkillId: writingV1.id,
    desiredState: "enabled",
    updatedAt: "2026-09-04T03:00:00.000Z",
  });

  const selection = await resolveProjectSelection({
    catalogRoot,
    registryRoot,
    projectId: project.id,
    presetId: PRISTINE_PRESET_ID,
  });
  assert.equal(selection.mode, "apply");
  assert.equal(selection.selected.length, 1);
  assert.equal(selection.selected[0].registry_skill_id, writingV1.id);
  assert.equal(selection.selected[0].reason, "enabled_by_project_override");

  const plan = await createProjectPlan({
    catalogRoot,
    registryRoot,
    projectId: project.id,
    presetId: PRISTINE_PRESET_ID,
  });
  const writingOperation = plan.operations.find((operation) => operation.skill_name === "writing-guide");
  assert.equal(plan.mode, "apply");
  assert.equal(writingOperation.registry_skill_id, writingV1.id);
  assert.notEqual(writingOperation.registry_skill_id, writingV2.id);
  assert.equal(writingOperation.source_revision_id, writingV1.source_revision_id);
  assert.equal(writingOperation.desired_state, "enabled");
  assert.equal(writingOperation.reason, "enabled_by_project_override");
  assert.deepEqual(writingOperation.override, selection.skill_overrides[0]);

  const effective = await resolveProjectEffectiveSet({
    catalogRoot,
    registryRoot,
    projectId: project.id,
    presetId: PRISTINE_PRESET_ID,
  });
  const effectiveWriting = effective.skills.find((skill) => skill.skill_name === "writing-guide");
  assert.equal(effectiveWriting.lineage_id, writingV1.lineage_id);
  assert.equal(effectiveWriting.registry_skill_id, writingV1.id);
  assert.equal(effectiveWriting.reason, "enabled_by_project_override");
  assert.equal(effectiveWriting.override.desired_state, "enabled");

  const prompt = await buildProjectSystemPrompt({
    catalogRoot,
    registryRoot,
    projectId: project.id,
    presetId: PRISTINE_PRESET_ID,
  });
  assert.deepEqual(prompt.included_skill_ids, [writingV1.id]);
  assert.match(prompt.content, /Version one\./);
  assert.doesNotMatch(prompt.content, /Version two\./);

  await clearProjectSkillOverride({
    catalogRoot,
    registryRoot,
    projectId: project.id,
    lineageId: writingV1.lineage_id,
  });
  const restored = await createProjectPlan({
    catalogRoot,
    registryRoot,
    projectId: project.id,
    presetId: PRISTINE_PRESET_ID,
  });
  assert.deepEqual(stablePlan(restored), stablePlan(baseline));
});

test("a disabled override turns off its lineage even when a preset selects another revision", async (context) => {
  const { catalogRoot, project, registryRoot, reviewV2, writingV1, writingV2 } = await setup(context);
  const preset = await createPreset({
    catalogRoot,
    registryRoot,
    id: "docs-suite",
    name: "Docs suite",
    registrySkillIds: [writingV2.id, reviewV2.id],
  });
  await assignPreset({ catalogRoot, projectId: project.id, presetId: preset.id });
  await setProjectSkillOverride({
    catalogRoot,
    registryRoot,
    projectId: project.id,
    lineageId: writingV1.lineage_id,
    registrySkillId: writingV1.id,
    desiredState: "disabled",
    updatedAt: "2026-09-04T04:00:00.000Z",
  });

  const plan = await createProjectPlan({ catalogRoot, registryRoot, projectId: project.id });
  const writingOperation = plan.operations.find((operation) => operation.skill_name === "writing-guide");
  const reviewOperation = plan.operations.find((operation) => operation.skill_name === "review-guide");
  assert.equal(plan.mode, "apply");
  assert.equal(writingOperation.registry_skill_id, writingV2.id);
  assert.equal(writingOperation.desired_state, "disabled");
  assert.equal(writingOperation.reason, "disabled_by_project_override");
  assert.equal(writingOperation.override.registry_skill_id, writingV1.id);
  assert.equal(reviewOperation.desired_state, "enabled");

  const effective = await resolveProjectEffectiveSet({ catalogRoot, registryRoot, projectId: project.id });
  const effectiveWriting = effective.skills.find((skill) => skill.skill_name === "writing-guide");
  const effectiveReview = effective.skills.find((skill) => skill.skill_name === "review-guide");
  assert.equal(effectiveWriting.lineage_id, writingV1.lineage_id);
  assert.equal(effectiveWriting.desired_state, "disabled");
  assert.equal(effectiveWriting.reason, "disabled_by_project_override");
  assert.equal(effectiveWriting.selected_by, null);
  assert.equal(effectiveWriting.registry_skill_id, writingV2.id);
  assert.equal(effectiveWriting.override.registry_skill_id, writingV1.id);
  assert.equal(effectiveReview.lineage_id, reviewV2.lineage_id);
  assert.equal(effectiveReview.desired_state, "enabled");
  assert.equal(effectiveReview.reason, "selected_by_default_template");
  assert.equal(Object.hasOwn(effectiveReview, "override"), false);

  await clearProjectSkillOverride({
    catalogRoot,
    registryRoot,
    projectId: project.id,
    lineageId: writingV1.lineage_id,
  });
  const restored = await resolveProjectEffectiveSet({ catalogRoot, registryRoot, projectId: project.id });
  const restoredWriting = restored.skills.find((skill) => skill.skill_name === "writing-guide");
  assert.equal(restoredWriting.lineage_id, writingV2.lineage_id);
  assert.equal(restoredWriting.registry_skill_id, writingV2.id);
  assert.equal(restoredWriting.desired_state, "enabled");
  assert.equal(restoredWriting.reason, "selected_by_default_template");
  assert.equal(Object.hasOwn(restoredWriting, "override"), false);
});

test("a disabled override follows a renamed lineage to its current delivery path", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "project-skill-override-rename-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const sourceRoot = path.join(root, "source");
  const skillRoot = path.join(sourceRoot, "renamed-skill");
  const skillFile = path.join(skillRoot, "SKILL.md");
  await fs.mkdir(skillRoot, { recursive: true });
  await fs.writeFile(
    skillFile,
    "---\nname: old-writing-guide\ndescription: Original name.\n---\n\n# Old writing guide\n",
  );
  const registryRoot = path.join(root, "registry");
  const catalogRoot = path.join(root, "catalog");
  const oldRevision = (await importLocalSource({ registryRoot, sourcePath: sourceRoot })).skills[0];

  await fs.writeFile(
    skillFile,
    "---\nname: new-writing-guide\ndescription: Renamed skill.\n---\n\n# New writing guide\n",
  );
  const newRevision = (await importLocalSource({ registryRoot, sourcePath: sourceRoot })).skills[0];
  assert.equal(newRevision.lineage_id, oldRevision.lineage_id);
  assert.notEqual(newRevision.skill_name, oldRevision.skill_name);

  const project = await createProject({
    catalogRoot,
    id: "renamed",
    name: "Renamed skill project",
    projectPath: path.join(root, "project"),
    providerId: "codex",
  });
  const preset = await createPreset({
    catalogRoot,
    registryRoot,
    id: "renamed-current",
    name: "Renamed current",
    registrySkillIds: [newRevision.id],
  });
  await assignPreset({ catalogRoot, projectId: project.id, presetId: preset.id });
  await setProjectSkillOverride({
    catalogRoot,
    registryRoot,
    projectId: project.id,
    lineageId: oldRevision.lineage_id,
    registrySkillId: oldRevision.id,
    desiredState: "disabled",
    updatedAt: "2026-09-04T06:00:00.000Z",
  });

  const plan = await createProjectPlan({ catalogRoot, registryRoot, projectId: project.id });
  assert.equal(plan.operations.length, 1);
  const [operation] = plan.operations;
  assert.equal(operation.registry_skill_id, newRevision.id);
  assert.equal(operation.skill_name, "new-writing-guide");
  assert.equal(path.basename(operation.delivery_path), "new-writing-guide");
  assert.equal(operation.desired_state, "disabled");
  assert.equal(operation.reason, "disabled_by_project_override");
  assert.equal(operation.override.registry_skill_id, oldRevision.id);

  const pristinePlan = await createProjectPlan({
    catalogRoot,
    registryRoot,
    projectId: project.id,
    presetId: PRISTINE_PRESET_ID,
  });
  assert.equal(pristinePlan.mode, "pristine");
  assert.equal(pristinePlan.operations[0].registry_skill_id, newRevision.id);
  assert.equal(path.basename(pristinePlan.operations[0].delivery_path), "new-writing-guide");
  assert.equal(pristinePlan.operations[0].override.registry_skill_id, oldRevision.id);

  const effective = await resolveProjectEffectiveSet({ catalogRoot, registryRoot, projectId: project.id });
  assert.equal(effective.skills.length, 1);
  assert.equal(effective.skills[0].lineage_id, oldRevision.lineage_id);
  assert.equal(effective.skills[0].registry_skill_id, newRevision.id);
  assert.equal(effective.skills[0].skill_name, "new-writing-guide");
  assert.equal(effective.skills[0].override.registry_skill_id, oldRevision.id);
});
