const fs = require("node:fs/promises");
const path = require("node:path");
const { createSkillRecipe, validateSkillRecipe, RECIPE_PROFILE_FIELDS } = require("@skills-platform/contracts");
const { getPreset, getProject, loadCatalog, recordActivationPlan, recordActivationReport, mutateCatalog } = require("./catalog-state");
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
  } else {
    targetPresets = await Promise.all(catalog.presets
      .filter((p) => p.id !== "builtin-pristine")
      .map((preset) => getPreset(catalogRoot, preset.id)));
    targetProjects = catalog.projects;
  }

  // Assignments pin template versions. Include those exact snapshots even when
  // the Catalog's active version has moved on, or projects use several versions.
  for (const project of targetProjects) {
    for (const assignment of project.preset_assignments) {
      targetPresets.push(await getPreset(catalogRoot, assignment.preset_id, assignment.template_version));
    }
  }
  targetPresets = [...new Map(targetPresets.map((preset) => [
    presetVersionKey(preset.id, preset.selected_version ?? preset.active_version ?? 1), preset,
  ])).values()].sort((left, right) => left.id.localeCompare(right.id)
    || (left.selected_version ?? left.active_version) - (right.selected_version ?? right.active_version));

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

  const profilesByLineage = new Map(catalog.skill_profiles.map((profile) => [profile.lineage_id, profile]));
  const recipeSkills = relevantSkills.map((skill) => ({
    name: skill.skill_name,
    artifact_type: skill.artifact_type ?? "skill",
    invocation_mode: profilesByLineage.get(skill.lineage_id)?.invocation_mode ?? skill.invocation_mode ?? "unspecified",
    source_id: recipeSourceIdByRevision.get(`${skill.source_id}:${skill.source_revision_id}`),
    source_relative_path: skill.source_relative_path,
    content_digest: skill.content_digest,
    description: skill.description ?? null,
    ...(profilesByLineage.has(skill.lineage_id)
      ? { profile: portableProfile(profilesByLineage.get(skill.lineage_id)) }
      : {}),
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
      description: versionData.description ?? null,
      purpose: versionData.purpose ?? null,
      work_scope_tags: versionData.work_scope_tags ?? [],
      skills: skillIds.map((id) => {
        const skill = allSkillsById.get(id);
        return {
          skill_name: skill?.skill_name ?? "unknown",
          source_relative_path: skill?.source_relative_path,
          artifact_type: skill?.artifact_type ?? "skill",
          source_id: skill && recipeSourceIdByRevision.get(`${skill.source_id}:${skill.source_revision_id}`),
          content_digest: skill?.content_digest,
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
    ...(p.review_policy !== undefined ? { review_policy: p.review_policy } : {}),
    ...(p.scope === "project" && p.project_path && p.delivery_root
      ? { delivery_root_relative: relativeDeliveryRoot(p) }
      : {}),
    preset_assignments: p.preset_assignments.map((assignment) => ({
      preset_id: assignment.preset_id,
      template_version: assignment.template_version,
      role: assignment.role,
      priority: assignment.priority,
      work_scope_tags: assignment.work_scope_tags,
      enabled: assignment.enabled,
    })),
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

function presetVersionKey(presetId, version) {
  return JSON.stringify([presetId, version]);
}

function portableProfile(profile) {
  return Object.fromEntries(RECIPE_PROFILE_FIELDS
    .filter((field) => profile[field] !== undefined)
    .map((field) => [field, profile[field]]));
}

function relativeDeliveryRoot(project) {
  const pathApi = /^[A-Za-z]:[\\/]/.test(project.project_path) ? path.win32 : path;
  const relative = pathApi.relative(project.project_path, project.delivery_root).replaceAll("\\", "/") || ".";
  if (relative === ".." || relative.startsWith("../") || pathApi.isAbsolute(relative)) {
    throw new Error(`Project ${project.id} delivery root cannot be represented relative to its project path`);
  }
  return relative;
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
    && (entry.artifact_type === undefined || (skill.artifact_type ?? "skill") === entry.artifact_type)
    && (entry.source_id === undefined || skill.source_id === entry.source_id)
    && (entry.content_digest === undefined || skill.content_digest === entry.content_digest);
}

function presetShapeMatches(snapshot, shape) {
  return JSON.stringify(snapshot.registry_skill_ids ?? []) === JSON.stringify(shape.registry_skill_ids)
    && (snapshot.description ?? null) === shape.description
    && (snapshot.purpose ?? null) === shape.purpose
    && JSON.stringify(snapshot.work_scope_tags ?? []) === JSON.stringify(shape.work_scope_tags);
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
    const invocationMode = skill.profile?.invocation_mode ?? skill.invocation_mode ?? "unspecified";
    byInvocationMode[invocationMode] = (byInvocationMode[invocationMode] ?? 0) + 1;
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
      profiles_count: recipe.skills?.filter((skill) => skill.profile !== undefined).length ?? 0,
      presets_count: recipe.presets?.length ?? 0,
      projects_count: recipe.projects?.length ?? 0,
      project_assignments_count: (recipe.projects ?? []).reduce((sum, project) => sum + (project.preset_assignments?.length ?? 0), 0),
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

  const presetResults = [];
  const resolvedPresetVersions = new Map();
  await mutateCatalog(catalogRoot, async (catalog) => {
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
          description: recipePreset.description !== undefined ? recipePreset.description : currentVersion.description ?? null,
          purpose: recipePreset.purpose !== undefined ? recipePreset.purpose : currentVersion.purpose ?? null,
          work_scope_tags: recipePreset.work_scope_tags ?? currentVersion.work_scope_tags ?? [],
        };
        const declaredVersion = existing.versions.find((version) => version.version === recipePreset.version);
        const matchingVersion = declaredVersion && (presetShapeMatches(declaredVersion, nextShape)
          ? declaredVersion
          : existing.versions.find((version) => presetShapeMatches(version, nextShape)));
        let localVersion = matchingVersion?.version;
        if (localVersion === undefined) {
          // Local template history is immutable. Preserve the portable version
          // number when available; otherwise map it to a new local snapshot.
          const nextVersion = Math.max(recipePreset.version ?? 1, ...existing.versions.map((version) => version.version + 1));
          existing.versions.push({
            version: nextVersion,
            ...nextShape,
            entries,
            template_notes: (currentVersion.template_notes ?? []).map((note) => ({ ...note })),
            created_at: new Date().toISOString(),
          });
          localVersion = nextVersion;
        }
        existing.name = recipePreset.name;
        existing.description = nextShape.description;
        existing.purpose = nextShape.purpose;
        existing.work_scope_tags = nextShape.work_scope_tags;
        existing.registry_skill_ids = matchedSkillIds;
        existing.entries = entries;
        existing.active_version = localVersion;
        existing.selected_version = localVersion;
        existing.updated_at = new Date().toISOString();
        if (recipePreset.owner !== undefined) existing.owner = recipePreset.owner;
        if (recipePreset.lifecycle !== undefined) existing.lifecycle = recipePreset.lifecycle;
        resolvedPresetVersions.set(presetVersionKey(recipePreset.id, recipePreset.version), localVersion);
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
        resolvedPresetVersions.set(presetVersionKey(recipePreset.id, recipePreset.version), initialVersion);
      }
      presetResults.push({
        id: recipePreset.id,
        recipe_version: recipePreset.version,
        matched_skills: matchedSkillIds.length,
        template_version: resolvedPresetVersions.get(presetVersionKey(recipePreset.id, recipePreset.version)),
      });
    }

  });

  for (const recipeSkill of recipe.skills ?? []) {
    const matched = resolvedRecipeSkills.get(recipeSkill);
    if (matched) {
      const patch = {
        ...(recipeSkill.artifact_type !== undefined ? { artifact_type: recipeSkill.artifact_type } : {}),
        ...(recipeSkill.invocation_mode !== undefined ? { invocation_mode: recipeSkill.invocation_mode } : {}),
      };
      if (recipeSkill.description !== undefined) patch.summary = recipeSkill.description;
      Object.assign(patch, portableProfile(recipeSkill.profile ?? {}));
      if (Object.keys(patch).length > 0) await updateSkillProfile({
        catalogRoot,
        registryRoot,
        lineageId: matched.lineage_id,
        patch,
      });
    }
  }

  const { createProject, assignPreset, setProjectReviewPolicy } = require("./catalog-state");

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
        reviewPolicy: declaredProject?.review_policy ?? "advisory",
        deliveryRoot: declaredProject?.delivery_root_relative
          ? path.resolve(resolvedPath, declaredProject.delivery_root_relative)
          : undefined,
      });
    } else if (declaredProject?.review_policy === "require_approved" && project.review_policy !== "require_approved") {
      project = await setProjectReviewPolicy({ catalogRoot, projectId: project.id, reviewPolicy: "require_approved" });
    }

    const defaultPreset = declaredProject
      ? ((recipe.presets ?? []).find((preset) => preset.id === declaredProject.default_preset_id
        && (declaredProject.default_preset_version === undefined || preset.version === declaredProject.default_preset_version))
        ?? (declaredProject.preset_assignments === undefined
          ? (recipe.presets ?? []).find((preset) => preset.id === declaredProject.default_preset_id)
          : undefined))
      : recipe.presets?.[0];
    if (declaredProject && !defaultPreset) {
      throw new Error(`Recipe project ${declaredProject.project_id} references an undeclared default preset ${declaredProject.default_preset_id}`);
    }
    if (declaredProject?.preset_assignments !== undefined) {
      await mutateCatalog(catalogRoot, async (latestCatalog) => {
        const storedProject = latestCatalog.projects.find((item) => item.id === project.id);
        storedProject.preset_assignments = declaredProject.preset_assignments.map((assignment) => {
          const localVersion = resolvedPresetVersions.get(presetVersionKey(assignment.preset_id, assignment.template_version));
          const existing = storedProject.preset_assignments.find((item) => item.preset_id === assignment.preset_id
            && item.role === assignment.role && item.template_version === localVersion);
          return {
            preset_id: assignment.preset_id,
            template_version: localVersion,
            role: assignment.role,
            priority: assignment.priority ?? existing?.priority ?? 0,
            work_scope_tags: assignment.work_scope_tags ?? existing?.work_scope_tags ?? [],
            enabled: assignment.enabled ?? existing?.enabled ?? true,
            created_at: existing?.created_at ?? new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
        });
        const defaultAssignment = storedProject.preset_assignments.find((assignment) => assignment.role === "default");
        storedProject.default_preset_id = defaultAssignment.preset_id;
        storedProject.default_preset_version = defaultAssignment.template_version;
      });
    } else if (defaultPreset) {
      const existingDefault = project.preset_assignments.find((assignment) => assignment.role === "default");
      await assignPreset({
        catalogRoot,
        projectId: project.id,
        presetId: defaultPreset.id,
        version: resolvedPresetVersions.get(presetVersionKey(defaultPreset.id, defaultPreset.version)) ?? defaultPreset.version ?? 1,
        role: "default",
        priority: existingDefault?.priority ?? 0,
        workScopeTags: existingDefault?.work_scope_tags ?? [],
        enabled: existingDefault?.enabled ?? true,
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
      const selection = await resolveProjectSelection({ catalogRoot, registryRoot, projectId: project.id });
      const { applyCatalogActivationPlan } = require("./activation-policy");
      await recordActivationPlan({ catalogRoot, registryRoot, plan, projectId: project.id, assignments: selection.assignments });
      const report = await applyCatalogActivationPlan({ catalogRoot, registryRoot, projectId: project.id, plan, assignments: selection.assignments, adapter });
      await recordActivationReport({ catalogRoot, planId: plan.plan_id, report });
      deliveryResult = {
        project_id: project.id,
        report,
        applied: report.status === "completed",
      };
    }
  }

  const hookResults = [];
  let hooksSyncResult = null;
  if (Array.isArray(recipe.hooks) && recipe.hooks.length > 0
    && !(confirm && deliveryResult && !deliveryResult.applied)) {
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
