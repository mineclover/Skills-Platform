const fs = require("node:fs/promises");
const path = require("node:path");
const { createSkillRecipe, validateSkillRecipe } = require("@skills-platform/contracts");
const { getPreset, getProject, listPresets, loadCatalog, recordActivationPlan, recordActivationReport } = require("./catalog-state");
const { createProjectPlan, resolveProjectSelection } = require("./catalog-workflows");
const { getRegistrySkills, importGitSource, listRegistrySkills, loadRegistry } = require("./registry");
const { updateSkillProfile } = require("./skill-management");

async function exportRecipe({ catalogRoot, registryRoot, projectId, presetId, name, description }) {
  const [catalog, registry] = await Promise.all([loadCatalog(catalogRoot), loadRegistry(registryRoot)]);

  let targetPresets = [];
  let targetProjects = [];

  if (presetId) {
    const preset = await getPreset(catalogRoot, presetId);
    targetPresets = [preset];
  } else if (projectId) {
    const project = await getProject(catalogRoot, projectId);
    targetProjects = [project];
    const assignedIds = new Set(project.preset_assignments.map((a) => a.preset_id));
    targetPresets = catalog.presets.filter((p) => assignedIds.has(p.id));
  } else {
    targetPresets = catalog.presets.filter((p) => p.id !== "builtin-pristine");
    targetProjects = catalog.projects;
  }

  const skillIds = new Set();
  for (const preset of targetPresets) {
    for (const id of preset.registry_skill_ids ?? []) skillIds.add(id);
  }

  const allSkills = await listRegistrySkills(registryRoot);
  const relevantSkills = allSkills.filter((skill) => skillIds.has(skill.id));

  const sourceIds = new Set(relevantSkills.map((s) => s.source_id));
  const relevantSources = registry.sources
    .filter((src) => sourceIds.has(src.id))
    .map((src) => {
      const revision = registry.revisions.find((r) => r.source_id === src.id);
      return {
        source_id: src.id,
        type: src.kind ?? "local",
        locator: src.locator,
        ref: src.requested_ref ?? "HEAD",
        resolved_commit: revision?.resolved_revision ?? revision?.id ?? undefined,
      };
    });

  const recipeSkills = relevantSkills.map((skill) => ({
    name: skill.skill_name,
    artifact_type: skill.artifact_type ?? "skill",
    invocation_mode: skill.invocation_mode ?? "unspecified",
    source_id: skill.source_id,
    source_relative_path: skill.source_relative_path,
    content_digest: skill.content_digest,
    description: skill.description ?? null,
  }));

  const allSkillsById = new Map(allSkills.map((s) => [s.id, s]));
  const recipePresets = targetPresets.map((preset) => {
    const version = preset.selected_version ?? preset.active_version ?? 1;
    const versionData = preset.versions?.find((v) => v.version === version) ?? preset;
    const skillIds = versionData.registry_skill_ids ?? preset.registry_skill_ids ?? [];
    return {
      id: preset.id,
      name: preset.name,
      version,
      description: preset.description ?? null,
      purpose: preset.purpose ?? null,
      work_scope_tags: preset.work_scope_tags ?? [],
      skills: skillIds.map((id) => {
        const skill = allSkillsById.get(id);
        return {
          skill_name: skill?.skill_name ?? "unknown",
          source_relative_path: skill?.source_relative_path,
          artifact_type: skill?.artifact_type ?? "skill",
          required: true,
        };
      }),
    };
  });

  const recipeProjects = targetProjects.map((p) => ({
    project_id: p.id,
    project_name: p.name,
    provider_id: p.provider_id ?? "codex",
    scope: p.scope ?? "project",
    default_preset_id: p.default_preset_id,
    default_preset_version: p.default_preset_version,
  }));

  const recipeName = name || (presetId ? `Recipe for ${presetId}` : projectId ? `Recipe for ${projectId}` : "Catalog Skills Recipe");

  return createSkillRecipe({
    name: recipeName,
    description: description || `Automated skill installation recipe generated at ${new Date().toISOString()}`,
    sources: relevantSources,
    skills: recipeSkills,
    presets: recipePresets,
    projects: recipeProjects,
  });
}

async function readRecipe(recipePath, recipeContent) {
  if (recipeContent) {
    return typeof recipeContent === "string" ? JSON.parse(recipeContent) : recipeContent;
  }
  if (!recipePath) throw new Error("Recipe path or content is required");
  const raw = await fs.readFile(path.resolve(recipePath), "utf8");
  return JSON.parse(raw);
}

async function inspectRecipe({ recipePath, recipeContent }) {
  const recipe = await readRecipe(recipePath, recipeContent);
  const validation = validateSkillRecipe(recipe);
  if (!validation.valid) {
    return { valid: false, issues: validation.issues };
  }

  const byInvocationMode = { user_invoked: 0, model_invoked: 0, hybrid: 0, unspecified: 0 };
  const byArtifactType = {};
  for (const skill of recipe.skills ?? []) {
    byInvocationMode[skill.invocation_mode ?? "unspecified"] = (byInvocationMode[skill.invocation_mode ?? "unspecified"] ?? 0) + 1;
    byArtifactType[skill.artifact_type ?? "skill"] = (byArtifactType[skill.artifact_type ?? "skill"] ?? 0) + 1;
  }

  return {
    valid: true,
    recipe_id: recipe.recipe_id,
    name: recipe.name,
    description: recipe.description,
    created_at: recipe.created_at,
    summary: {
      sources_count: recipe.sources?.length ?? 0,
      skills_count: recipe.skills?.length ?? 0,
      presets_count: recipe.presets?.length ?? 0,
      projects_count: recipe.projects?.length ?? 0,
      by_invocation_mode: byInvocationMode,
      by_artifact_type: byArtifactType,
    },
    sources: (recipe.sources ?? []).map((s) => ({
      source_id: s.source_id,
      type: s.type,
      locator: s.locator,
      resolved_commit: s.resolved_commit,
    })),
    presets: (recipe.presets ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      version: p.version,
      skills_count: p.skills?.length ?? 0,
    })),
    projects: recipe.projects ?? [],
  };
}

async function applyRecipe({
  catalogRoot,
  registryRoot,
  recipePath,
  recipeContent,
  projectPath,
  providerId,
  confirm = false,
}) {
  const recipe = await readRecipe(recipePath, recipeContent);
  const validation = validateSkillRecipe(recipe);
  if (!validation.valid) {
    const error = new Error("Invalid skill recipe");
    error.issues = validation.issues;
    throw error;
  }

  const sourceResults = [];
  for (const source of recipe.sources ?? []) {
    if (source.type === "git") {
      const result = await importGitSource({
        registryRoot,
        repository: source.locator,
        ref: source.resolved_commit || source.ref || "HEAD",
      });
      sourceResults.push({ source_id: source.source_id, locator: source.locator, imported_skills: result.skills.length });
    }
  }

  const allLocalSkills = await listRegistrySkills(registryRoot);
  const localSkillsByName = new Map();
  for (const skill of allLocalSkills) {
    localSkillsByName.set(skill.skill_name, skill);
  }

  const catalog = await loadCatalog(catalogRoot);
  const presetResults = [];
  for (const recipePreset of recipe.presets ?? []) {
    const matchedSkillIds = [];
    for (const entry of recipePreset.skills ?? []) {
      const matched = localSkillsByName.get(entry.skill_name);
      if (matched) matchedSkillIds.push(matched.id);
    }
    const matchedSkills = await getRegistrySkills(registryRoot, matchedSkillIds);
    const entries = matchedSkills.map((skill) => ({
      lineage_id: skill.lineage_id,
      source_revision_id: skill.source_revision_id,
      registry_skill_id: skill.id,
      revision_policy: "pinned",
      required: true,
      enabled_by_default: true,
    }));
    const existing = catalog.presets.find((p) => p.id === recipePreset.id);
    if (existing) {
      existing.name = recipePreset.name;
      existing.description = recipePreset.description;
      existing.purpose = recipePreset.purpose;
      existing.work_scope_tags = recipePreset.work_scope_tags ?? [];
      existing.registry_skill_ids = matchedSkillIds;
      existing.entries = entries;
      if (existing.versions && existing.versions.length > 0) {
        existing.versions[existing.versions.length - 1].entries = entries;
        existing.versions[existing.versions.length - 1].registry_skill_ids = matchedSkillIds;
      }
    } else {
      catalog.presets.push({
        id: recipePreset.id,
        name: recipePreset.name,
        description: recipePreset.description,
        purpose: recipePreset.purpose,
        work_scope_tags: recipePreset.work_scope_tags ?? [],
        registry_skill_ids: matchedSkillIds,
        entries,
        active_version: recipePreset.version ?? 1,
        selected_version: recipePreset.version ?? 1,
        versions: [{
          version: recipePreset.version ?? 1,
          registry_skill_ids: matchedSkillIds,
          entries,
          description: recipePreset.description,
          purpose: recipePreset.purpose,
          work_scope_tags: recipePreset.work_scope_tags ?? [],
          template_notes: [],
          created_at: new Date().toISOString(),
        }],
      });
    }
    presetResults.push({ id: recipePreset.id, matched_skills: matchedSkillIds.length });
  }

  for (const recipeSkill of recipe.skills ?? []) {
    const matched = localSkillsByName.get(recipeSkill.name);
    if (matched && recipeSkill.invocation_mode) {
      await updateSkillProfile({
        catalogRoot,
        registryRoot,
        lineageId: matched.lineage_id,
        patch: {
          invocation_mode: recipeSkill.invocation_mode,
          summary: recipeSkill.description,
        },
      });
    }
  }

  const { saveCatalog, createProject, getProject, assignPreset } = require("./catalog-state");
  await saveCatalog(catalogRoot, catalog);

  let deliveryResult = null;
  if (projectPath) {
    const resolvedPath = path.resolve(projectPath);
    const resolvedProvider = providerId || "codex";
    const projectId = path.basename(resolvedPath).toLowerCase().replace(/[^a-z0-9]+/g, "-");

    let project;
    try {
      project = await getProject(catalogRoot, projectId);
    } catch {
      project = await createProject({
        catalogRoot,
        id: projectId,
        name: path.basename(resolvedPath),
        projectPath: resolvedPath,
        providerId: resolvedProvider,
      });
    }

    const defaultPreset = recipe.presets?.[0];
    if (defaultPreset) {
      await assignPreset({
        catalogRoot,
        projectId: project.id,
        presetId: defaultPreset.id,
        version: defaultPreset.version ?? 1,
        role: "default",
      });
    }

    const plan = await createProjectPlan({
      catalogRoot,
      registryRoot,
      projectId: project.id,
      distribution: { method: "symlink" },
    });

    const adapter = require("@skills-platform/skills-manager-adapter");
    if (!confirm) {
      const preview = await adapter.previewActivationPlan(plan);
      deliveryResult = {
        project_id: project.id,
        preview,
        applied: false,
        message: "Preview ready. Pass --confirm to apply delivery bindings.",
      };
    } else {
      const report = await adapter.applyActivationPlan(plan, { confirm: true });
      const selection = await resolveProjectSelection({ catalogRoot, projectId: project.id });
      await recordActivationPlan({ catalogRoot, plan, projectId: project.id, assignments: selection.assignments });
      await recordActivationReport({ catalogRoot, planId: plan.plan_id, report });
      deliveryResult = {
        project_id: project.id,
        report,
        applied: true,
      };
    }
  }

  return {
    recipe_id: recipe.recipe_id,
    name: recipe.name,
    sources_imported: sourceResults,
    presets_reconciled: presetResults,
    delivery: deliveryResult,
  };
}

module.exports = {
  applyRecipe,
  exportRecipe,
  inspectRecipe,
};
