const fs = require("node:fs/promises");
const path = require("node:path");
const { createSkillRecipe, validateSkillRecipe } = require("@skills-platform/contracts");
const { getPreset, getProject, listPresets, loadCatalog, recordActivationPlan, recordActivationReport, saveCatalog } = require("./catalog-state");
const { createProjectPlan, resolveProjectSelection } = require("./catalog-workflows");
const { getRegistrySkills, importGitSource, importLocalSource, listRegistrySkills, loadRegistry } = require("./registry");
const { updateSkillProfile } = require("./skill-management");

async function exportRecipe({ catalogRoot, registryRoot, projectId, presetId, name, description, hooks, projectPath }) {
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
  const recipeSourceIdByRevision = new Map();
  const relevantSources = [];
  for (const src of registry.sources.filter((item) => sourceIds.has(item.id))) {
    const pinnedRevisionIds = [...new Set(relevantSkills
      .filter((skill) => skill.source_id === src.id)
      .map((skill) => skill.source_revision_id))];
    for (const revisionId of pinnedRevisionIds) {
      const exportedSourceId = pinnedRevisionIds.length === 1
        ? src.id
        : `${src.id}__${revisionId.slice(0, 20)}`;
      const pinnedRevision = registry.revisions.find((item) => item.id === revisionId);
      if (!pinnedRevision) throw new Error(`Pinned source revision is missing: ${revisionId}`);
      recipeSourceIdByRevision.set(`${src.id}:${revisionId}`, exportedSourceId);
      relevantSources.push({
        source_id: exportedSourceId,
        type: src.kind ?? "local",
        locator: src.locator,
        ref: src.requested_ref ?? "HEAD",
        resolved_commit: pinnedRevision.resolved_revision ?? pinnedRevision.id,
      });
    }
  }

  const recipeSkills = relevantSkills.map((skill) => ({
    name: skill.skill_name,
    artifact_type: skill.artifact_type ?? "skill",
    invocation_mode: skill.invocation_mode ?? "unspecified",
    source_id: recipeSourceIdByRevision.get(`${skill.source_id}:${skill.source_revision_id}`),
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
      owner: preset.owner ?? null,
      lifecycle: preset.lifecycle ?? "draft",
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

  let exportHooks = hooks;
  if (!exportHooks && projectPath) {
    try {
      const { listHooks } = require("./hooks-manager");
      exportHooks = listHooks({ projectPath });
    } catch {
      exportHooks = undefined;
    }
  }

  const recipeName = name || (presetId ? `Recipe for ${presetId}` : projectId ? `Recipe for ${projectId}` : "Catalog Skills Recipe");

  return createSkillRecipe({
    name: recipeName,
    description: description || `Automated skill installation recipe generated at ${new Date().toISOString()}`,
    sources: relevantSources,
    skills: recipeSkills,
    presets: recipePresets,
    projects: recipeProjects,
    hooks: exportHooks,
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

function candidateMatchesRecipeSource({ skill, recipeSource, registry }) {
  const source = registry.sources.find((item) => item.id === skill.source_id);
  const revision = registry.revisions.find((item) => item.id === skill.source_revision_id);
  if (!source || !revision) return false;
  const recipeType = recipeSource.type ?? "local";
  if ((source.kind ?? "local") !== recipeType) return false;
  if (recipeSource.resolved_commit
    && revision.resolved_revision !== recipeSource.resolved_commit
    && revision.content_digest !== recipeSource.resolved_commit) {
    return false;
  }
  if (recipeType === "git" && source.locator !== recipeSource.locator) return false;
  if (recipeType === "local" && normalizeLocalLocator(source.locator) !== normalizeLocalLocator(recipeSource.locator)) return false;
  return true;
}

function normalizeLocalLocator(locator) {
  const normalized = path.posix.normalize(String(locator).trim().replaceAll("\\", "/"));
  return /^[A-Za-z]:\//.test(normalized)
    ? `${normalized[0].toLowerCase()}${normalized.slice(1)}`
    : normalized;
}

function providerFamily(providerId) {
  const normalized = String(providerId ?? "").trim().toLowerCase();
  return ["antigravity", "agy", "gemini"].includes(normalized) ? "antigravity" : normalized;
}

function providersAreCompatible(left, right) {
  return providerFamily(left) === providerFamily(right);
}

function selectDeclaredProject(recipeProjects, providerId) {
  if (!Array.isArray(recipeProjects) || recipeProjects.length === 0) return null;

  const requestedProvider = providerId
    ?? (recipeProjects.length === 1 ? recipeProjects[0].provider_id : "codex");
  const compatible = recipeProjects.filter((project) => providersAreCompatible(project.provider_id, requestedProvider));
  if (compatible.length === 0) {
    throw new Error(`Recipe does not declare a project compatible with provider ${requestedProvider}`);
  }
  if (compatible.length > 1) {
    throw new Error(`Recipe declares multiple projects compatible with provider ${requestedProvider}; select a unique provider`);
  }
  return compatible[0];
}

function recipeSkillMatchesPresetEntry(skill, entry) {
  return skill.name === entry.skill_name
    && (entry.source_relative_path === undefined || skill.source_relative_path === entry.source_relative_path)
    && (entry.artifact_type === undefined || (skill.artifact_type ?? "skill") === entry.artifact_type);
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
      hooks_count: recipe.hooks?.length ?? 0,
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
      owner: p.owner ?? null,
      lifecycle: p.lifecycle ?? "draft",
      skills_count: p.skills?.length ?? 0,
    })),
    projects: recipe.projects ?? [],
    hooks: recipe.hooks ?? [],
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
  enabledOnly = false,
  reuseRegistryLocalSource = false,
}) {
  const recipe = await readRecipe(recipePath, recipeContent);
  const validation = validateSkillRecipe(recipe);
  if (!validation.valid) {
    const error = new Error("Invalid skill recipe");
    error.issues = validation.issues;
    throw error;
  }

  const sourceResults = [];
  const recipeBaseDirectory = recipePath
    ? path.dirname(path.resolve(recipePath))
    : projectPath
      ? path.resolve(projectPath)
      : process.cwd();
  for (const source of recipe.sources ?? []) {
    if (source.type === "git") {
      const result = await importGitSource({
        registryRoot,
        repository: source.locator,
        ref: source.resolved_commit || source.ref || "HEAD",
      });
      sourceResults.push({ source_id: source.source_id, locator: source.locator, imported_skills: result.skills.length });
    } else if (source.type === "local") {
      const sourcePath = path.isAbsolute(source.locator)
        ? path.normalize(source.locator)
        : path.resolve(recipeBaseDirectory, source.locator);
      // Canonical lifecycle recipes are synthesized directly into the target
      // Registry before reconciliation. Their local source is deliberately the
      // Registry itself, so recursively importing it would create a second
      // provenance identity. Only the lifecycle caller can opt into this exact
      // self-source reuse; ordinary recipes always replay local sources.
      if (reuseRegistryLocalSource) {
        sourceResults.push({
          source_id: source.source_id,
          locator: source.locator,
          resolved_locator: sourcePath,
          imported_skills: 0,
          reused_registry: true,
        });
        continue;
      }
      const selectedSkillNames = (recipe.skills ?? [])
        .filter((skill) => skill.source_id === source.source_id)
        .map((skill) => skill.name);
      if (selectedSkillNames.length === 0) {
        throw new Error(`Local recipe source ${source.source_id} does not declare any skills`);
      }
      const result = await importLocalSource({
        registryRoot,
        sourcePath,
        selectedSkillNames,
        source: {
          kind: "local",
          // Keep a checked-in relative locator stable across clones while
          // reading from the runtime-resolved absolute path above.
          locator: source.locator,
        },
      });
      sourceResults.push({
        source_id: source.source_id,
        locator: source.locator,
        resolved_locator: sourcePath,
        imported_skills: result.skills.length,
      });
    }
  }

  const allLocalSkills = await listRegistrySkills(registryRoot);
  const registryState = await loadRegistry(registryRoot);
  const resolvedRecipeSkills = new Map();
  for (const specification of recipe.skills ?? []) {
    const recipeSource = (recipe.sources ?? []).find((source) => source.source_id === specification.source_id);
    if (!recipeSource) throw new Error(`Recipe skill ${specification.name} references an undeclared source ${specification.source_id}`);
    const candidates = allLocalSkills.filter((skill) => (
      skill.skill_name === specification.name
      && skill.content_digest === specification.content_digest
      && skill.source_relative_path === specification.source_relative_path
      && (skill.artifact_type ?? "skill") === (specification.artifact_type ?? "skill")
      && candidateMatchesRecipeSource({ skill, recipeSource, registry: registryState })
    ));
    if (candidates.length !== 1) {
      throw new Error(`Recipe skill ${specification.name} cannot be resolved to one immutable registry revision (${specification.content_digest})`);
    }
    resolvedRecipeSkills.set(specification, candidates[0]);
  }

  const catalog = await loadCatalog(catalogRoot);
  const presetResults = [];
  const resolvedPresetVersions = new Map();
  for (const recipePreset of recipe.presets ?? []) {
    const matchedSkillIds = [];
    for (const entry of recipePreset.skills ?? []) {
      const specifications = (recipe.skills ?? []).filter((skill) => recipeSkillMatchesPresetEntry(skill, entry));
      if (specifications.length !== 1) {
        throw new Error(`Recipe preset ${recipePreset.id} must reference exactly one declared skill named ${entry.skill_name}`);
      }
      const specification = specifications[0];
      matchedSkillIds.push(resolvedRecipeSkills.get(specification).id);
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
      const currentVersion = existing.versions.find((version) => version.version === existing.active_version)
        ?? existing.versions.at(-1);
      const nextShape = {
        registry_skill_ids: matchedSkillIds,
        description: recipePreset.description ?? null,
        purpose: recipePreset.purpose ?? null,
        work_scope_tags: recipePreset.work_scope_tags ?? [],
      };
      const changed = existing.name !== recipePreset.name
        || JSON.stringify(currentVersion.registry_skill_ids ?? []) !== JSON.stringify(nextShape.registry_skill_ids)
        || (currentVersion.description ?? null) !== nextShape.description
        || (currentVersion.purpose ?? null) !== nextShape.purpose
        || JSON.stringify(currentVersion.work_scope_tags ?? []) !== JSON.stringify(nextShape.work_scope_tags);
      if (changed) {
        const nextVersion = Math.max(...existing.versions.map((version) => version.version)) + 1;
        existing.versions.push({
          version: nextVersion,
          ...nextShape,
          entries,
          template_notes: (currentVersion.template_notes ?? []).map((note) => ({ ...note })),
          created_at: new Date().toISOString(),
        });
        existing.name = recipePreset.name;
        existing.description = nextShape.description;
        existing.purpose = nextShape.purpose;
        existing.work_scope_tags = nextShape.work_scope_tags;
        existing.registry_skill_ids = matchedSkillIds;
        existing.entries = entries;
        existing.active_version = nextVersion;
        existing.selected_version = nextVersion;
        existing.updated_at = new Date().toISOString();
      }
      if (recipePreset.owner !== undefined) existing.owner = recipePreset.owner;
      if (recipePreset.lifecycle !== undefined) existing.lifecycle = recipePreset.lifecycle;
      resolvedPresetVersions.set(recipePreset.id, existing.active_version);
    } else {
      const initialVersion = recipePreset.version ?? 1;
      catalog.presets.push({
        id: recipePreset.id,
        name: recipePreset.name,
        owner: recipePreset.owner ?? null,
        lifecycle: recipePreset.lifecycle ?? "draft",
        description: recipePreset.description,
        purpose: recipePreset.purpose,
        work_scope_tags: recipePreset.work_scope_tags ?? [],
        registry_skill_ids: matchedSkillIds,
        entries,
        active_version: initialVersion,
        selected_version: initialVersion,
        versions: [{
          version: initialVersion,
          registry_skill_ids: matchedSkillIds,
          entries,
          description: recipePreset.description,
          purpose: recipePreset.purpose,
          work_scope_tags: recipePreset.work_scope_tags ?? [],
          template_notes: [],
          created_at: new Date().toISOString(),
        }],
      });
      resolvedPresetVersions.set(recipePreset.id, initialVersion);
    }
    presetResults.push({
      id: recipePreset.id,
      matched_skills: matchedSkillIds.length,
      template_version: resolvedPresetVersions.get(recipePreset.id),
    });
  }

  await saveCatalog(catalogRoot, catalog);

  for (const recipeSkill of recipe.skills ?? []) {
    const matched = resolvedRecipeSkills.get(recipeSkill);
    if (matched) {
      const patch = {
        artifact_type: recipeSkill.artifact_type ?? "skill",
        invocation_mode: recipeSkill.invocation_mode ?? "unspecified",
      };
      if (recipeSkill.description !== undefined) patch.summary = recipeSkill.description;
      await updateSkillProfile({
        catalogRoot,
        registryRoot,
        lineageId: matched.lineage_id,
        patch,
      });
    }
  }

  const { createProject, assignPreset } = require("./catalog-state");

  let deliveryResult = null;
  if (projectPath) {
    const resolvedPath = path.resolve(projectPath);
    const declaredProject = selectDeclaredProject(recipe.projects, providerId);
    const resolvedProvider = declaredProject?.provider_id ?? providerId ?? "codex";
    const projectId = declaredProject?.project_id
      ?? path.basename(resolvedPath).toLowerCase().replace(/[^a-z0-9]+/g, "-");

    let project = null;
    try {
      project = await getProject(catalogRoot, projectId);
    } catch (error) {
      if (!String(error?.message).startsWith("Project not found:")) throw error;
    }
    if (project && !providersAreCompatible(project.provider_id, resolvedProvider)) {
      throw new Error(`Existing project ${project.id} uses provider ${project.provider_id}, not ${resolvedProvider}`);
    }
    if (!project) {
      project = await createProject({
        catalogRoot,
        id: projectId,
        name: declaredProject?.project_name ?? path.basename(resolvedPath),
        projectPath: resolvedPath,
        providerId: resolvedProvider,
        scope: declaredProject?.scope ?? "project",
        deliveryRoot: declaredProject?.delivery_root_relative
          ? path.resolve(resolvedPath, declaredProject.delivery_root_relative)
          : undefined,
      });
    }

    const defaultPreset = declaredProject
      ? (recipe.presets ?? []).find((preset) => preset.id === declaredProject.default_preset_id)
      : recipe.presets?.[0];
    if (declaredProject && !defaultPreset) {
      throw new Error(`Recipe project ${declaredProject.project_id} references an undeclared default preset ${declaredProject.default_preset_id}`);
    }
    if (defaultPreset) {
      await assignPreset({
        catalogRoot,
        projectId: project.id,
        presetId: defaultPreset.id,
        version: resolvedPresetVersions.get(defaultPreset.id) ?? defaultPreset.version ?? 1,
        role: "default",
      });
    }

    const plan = await createProjectPlan({
      catalogRoot,
      registryRoot,
      projectId: project.id,
      distribution: { method: "symlink" },
      enabledOnly,
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
      const selection = await resolveProjectSelection({ catalogRoot, registryRoot, projectId: project.id });
      await recordActivationPlan({ catalogRoot, plan, projectId: project.id, assignments: selection.assignments });
      await recordActivationReport({ catalogRoot, planId: plan.plan_id, report });
      deliveryResult = {
        project_id: project.id,
        report,
        applied: true,
      };
    }
  }

  const hookResults = [];
  let hooksSyncResult = null;
  if (Array.isArray(recipe.hooks) && recipe.hooks.length > 0) {
    const hooksTarget = projectPath
      ? path.resolve(projectPath)
      : catalogRoot
        ? path.resolve(catalogRoot, "..")
        : process.cwd();
    const { registerHook, compileProviderConfigs } = require("./hooks-manager");
    for (const hook of recipe.hooks) {
      const registered = registerHook({ projectPath: hooksTarget, hook, sync: false });
      hookResults.push({
        id: registered.id,
        name: registered.name,
        event: registered.event,
        enabled: registered.enabled,
        priority: registered.priority,
      });
    }
    hooksSyncResult = compileProviderConfigs({ projectPath: hooksTarget });
  }

  return {
    recipe_id: recipe.recipe_id,
    name: recipe.name,
    sources_imported: sourceResults,
    presets_reconciled: presetResults,
    delivery: deliveryResult,
    hooks_applied: hookResults,
    hooks_synced: hooksSyncResult,
  };
}

module.exports = {
  applyRecipe,
  exportRecipe,
  inspectRecipe,
};
