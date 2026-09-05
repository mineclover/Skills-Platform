const fs = require("node:fs/promises");
const path = require("node:path");
const { createPlanFromRegistry } = require("./activation-plans");
const { getPreset, getProject, PRISTINE_PRESET_ID } = require("./catalog-state");
const { getRegistrySkills, latestSkillsByArtifact, listRegistrySkills } = require("./registry");
const { listSkillNotes } = require("./skill-management");

const PROJECT_OVERRIDE_TARGETS = Symbol("projectOverrideTargets");

function hasAllTags(candidateTags, requestedTags) {
  return candidateTags.every((tag) => requestedTags.has(tag));
}

function overrideReason(desiredState) {
  return desiredState === "enabled" ? "enabled_by_project_override" : "disabled_by_project_override";
}

async function applyProjectSkillOverrides({ project, selection, selectedByLineage, registryRoot }) {
  const overrides = project.skill_overrides ?? [];
  if (overrides.length === 0) return selection;

  const resolvedByLineage = new Map([...selectedByLineage].filter(([, item]) => item));
  const mappedSkillIds = new Set([...resolvedByLineage.values()].map((item) => item.registry_skill_id));
  const unmappedSkillIds = selection.selected
    .map((item) => item.registry_skill_id)
    .filter((registrySkillId) => !mappedSkillIds.has(registrySkillId));
  if (registryRoot && unmappedSkillIds.length > 0) {
    const skills = await getRegistrySkills(registryRoot, unmappedSkillIds);
    const selectedById = new Map(selection.selected.map((item) => [item.registry_skill_id, item]));
    for (const skill of skills) resolvedByLineage.set(skill.lineage_id, selectedById.get(skill.id));
  } else {
    const selectedById = new Map(selection.selected.map((item) => [item.registry_skill_id, item]));
    for (const registrySkillId of unmappedSkillIds) {
      resolvedByLineage.set(`registry_skill:${registrySkillId}`, selectedById.get(registrySkillId));
    }
  }

  const overrideTargets = new Map();
  for (const override of overrides) {
    const currentSelection = resolvedByLineage.get(override.lineage_id);
    overrideTargets.set(
      override.lineage_id,
      override.desired_state === "enabled"
        ? override.registry_skill_id
        : currentSelection?.registry_skill_id ?? null,
    );
    resolvedByLineage.delete(override.lineage_id);
    for (const [key, selected] of resolvedByLineage) {
      if (selected.registry_skill_id === override.registry_skill_id) resolvedByLineage.delete(key);
    }
    if (override.desired_state === "enabled") {
      resolvedByLineage.set(override.lineage_id, {
        lineage_id: override.lineage_id,
        registry_skill_id: override.registry_skill_id,
        reason: overrideReason(override.desired_state),
        override: { ...override },
      });
    }
  }

  const selected = [...resolvedByLineage.values()];
  return {
    ...selection,
    mode: selected.length === 0 ? "pristine" : "apply",
    selected,
    skill_overrides: overrides.map((override) => ({ ...override })),
    [PROJECT_OVERRIDE_TARGETS]: overrideTargets,
  };
}

async function resolveProjectSelection({ catalogRoot, registryRoot, projectId, presetId, workScopeTags = [] }) {
  const project = await getProject(catalogRoot, projectId);
  if (presetId) {
    const preset = await getPreset(catalogRoot, presetId);
    const selected = preset.registry_skill_ids.map((registrySkillId) => ({
      registry_skill_id: registrySkillId,
      reason: "selected_by_explicit_template",
      preset_id: preset.id,
      template_version: preset.selected_version,
    }));
    const selectedById = new Map(selected.map((item) => [item.registry_skill_id, item]));
    const selectedByLineage = new Map(preset.entries.map((entry) => [entry.lineage_id, selectedById.get(entry.registry_skill_id)]));
    return applyProjectSkillOverrides({
      project,
      registryRoot,
      selectedByLineage,
      selection: {
        project,
        requested_work_scope_tags: workScopeTags,
        mode: preset.id === PRISTINE_PRESET_ID ? "pristine" : "apply",
        assignments: [{ preset_id: preset.id, template_version: preset.selected_version, role: "explicit", priority: 0, work_scope_tags: [] }],
        selected,
      },
    });
  }
  const requestedTags = new Set(workScopeTags);
  const assignments = project.preset_assignments.filter((assignment) => assignment.enabled !== false);
  const defaultAssignment = assignments.find((assignment) => assignment.role === "default");
  if (!defaultAssignment) throw new Error(`Project has no default preset assignment: ${project.id}`);
  const resolvedAssignments = [{ ...defaultAssignment, preset: await getPreset(catalogRoot, defaultAssignment.preset_id, defaultAssignment.template_version) }];
  const overlays = assignments
    .filter((assignment) => assignment.role === "work_scope_overlay" && hasAllTags(assignment.work_scope_tags, requestedTags))
    .sort((left, right) => left.priority - right.priority || left.preset_id.localeCompare(right.preset_id));
  for (const assignment of overlays) {
    resolvedAssignments.push({ ...assignment, preset: await getPreset(catalogRoot, assignment.preset_id, assignment.template_version) });
  }
  const selectedByLineage = new Map();
  for (const assignment of resolvedAssignments) {
    if (assignment.preset.id === PRISTINE_PRESET_ID) continue;
    for (const entry of assignment.preset.entries) {
      selectedByLineage.set(entry.lineage_id, {
        registry_skill_id: entry.registry_skill_id,
        reason: assignment.role === "default" ? "selected_by_default_template" : "selected_by_work_scope_overlay",
        preset_id: assignment.preset.id,
        template_version: assignment.preset.selected_version,
        priority: assignment.priority,
      });
    }
  }
  return applyProjectSkillOverrides({
    project,
    registryRoot,
    selectedByLineage,
    selection: {
      project,
      requested_work_scope_tags: workScopeTags,
      mode: selectedByLineage.size === 0 ? "pristine" : "apply",
      assignments: resolvedAssignments.map(({ preset, ...assignment }) => ({ ...assignment, name: preset.name, purpose: preset.purpose })),
      selected: [...selectedByLineage.values()],
    },
  });
}

async function createProjectPlan({
  catalogRoot,
  registryRoot,
  projectId,
  presetId,
  workScopeTags,
  distribution,
  enabledOnly = false,
}) {
  const selection = await resolveProjectSelection({ catalogRoot, registryRoot, projectId, presetId, workScopeTags });
  const { project } = selection;
  const isPristine = selection.mode === "pristine";
  if (enabledOnly && isPristine) {
    throw new Error("enabledOnly cannot be used with the pristine baseline because pristine requires explicit disable operations");
  }
  const registeredSkills = await listRegistrySkills(registryRoot);
  const selectedSkills = selection.selected.length === 0
    ? []
    : await getRegistrySkills(registryRoot, selection.selected.map((item) => item.registry_skill_id));
  const overrides = selection.skill_overrides ?? [];
  const overrideTargets = selection[PROJECT_OVERRIDE_TARGETS] ?? new Map();
  const overrideTargetIds = overrides
    .map((override) => override.desired_state === "enabled"
      ? override.registry_skill_id
      : overrideTargets.get(override.lineage_id))
    .filter(Boolean);
  const overrideTargetSkills = overrideTargetIds.length === 0
    ? []
    : await getRegistrySkills(registryRoot, overrideTargetIds);
  const selectedByArtifact = new Map(selectedSkills.map((skill) => [
    skill.artifact_key ?? `${skill.source_id}:${skill.source_relative_path}`,
    skill,
  ]));
  let effectiveSkills = latestSkillsByArtifact(registeredSkills).map((latest) => {
    const key = latest.artifact_key ?? `${latest.source_id}:${latest.source_relative_path}`;
    return selectedByArtifact.get(key) ?? latest;
  });
  if (overrideTargetSkills.length > 0) {
    const effectiveByArtifact = new Map(effectiveSkills.map((skill) => [
      skill.artifact_key ?? `${skill.source_id}:${skill.source_relative_path}`,
      skill,
    ]));
    for (const skill of overrideTargetSkills) {
      effectiveByArtifact.set(skill.artifact_key ?? `${skill.source_id}:${skill.source_relative_path}`, skill);
    }
    effectiveSkills = [...effectiveByArtifact.values()];
  }
  const selectedIds = new Set(selectedSkills.map((skill) => skill.id));
  const desiredStateBySkillId = Object.fromEntries(effectiveSkills.map((skill) => [
    skill.id,
    selectedIds.has(skill.id) ? "enabled" : "disabled",
  ]));
  const plannedSkills = enabledOnly
    ? effectiveSkills.filter((skill) => desiredStateBySkillId[skill.id] === "enabled")
    : effectiveSkills;

  const plan = await createPlanFromRegistry({
    registryRoot,
    skillIds: plannedSkills.map((skill) => skill.id),
    target: {
      project_id: project.scope === "project" ? project.id : undefined,
      project_path: project.project_path ?? undefined,
      provider_id: project.provider_id,
      scope: project.scope,
    },
    deliveryRoot: project.delivery_root,
    distribution,
    desiredState: isPristine ? "disabled" : "enabled",
    desiredStateBySkillId,
    mode: isPristine ? "pristine" : "apply",
  });
  if (overrides.length === 0) return plan;

  const lineageByRegistrySkillId = new Map(plannedSkills.map((skill) => [skill.id, skill.lineage_id]));
  const overrideByLineage = new Map(overrides.map((override) => [override.lineage_id, override]));
  plan.operations = plan.operations.map((operation) => {
    const override = overrideByLineage.get(lineageByRegistrySkillId.get(operation.registry_skill_id));
    if (!override) return operation;
    return {
      ...operation,
      reason: overrideReason(override.desired_state),
      override: { ...override },
    };
  });
  return plan;
}

async function readPrimaryManifest(canonicalPath) {
  const candidates = [
    "SKILL.md", "RULE.md", "HOOK.md", "PLUGIN.md", "plugin.json", "MCP.md", "mcp.json",
    "skill.md", "rule.md", "hook.md", "plugin.md", "mcp.md",
  ];
  for (const candidate of candidates) {
    try {
      const content = await fs.readFile(path.join(canonicalPath, candidate), "utf8");
      if (content.trim() !== "") return content;
    } catch {}
  }
  throw new Error("No manifest found");
}

async function resolveProjectEffectiveSet({ catalogRoot, registryRoot, projectId, presetId, workScopeTags }) {
  const selection = await resolveProjectSelection({ catalogRoot, registryRoot, projectId, presetId, workScopeTags });
  const plan = await createProjectPlan({ catalogRoot, registryRoot, projectId, presetId, workScopeTags });
  const operationSkills = await getRegistrySkills(registryRoot, plan.operations.map((operation) => operation.registry_skill_id));
  const lineageByRegistrySkillId = new Map(operationSkills.map((skill) => [skill.id, skill.lineage_id]));
  const selected = new Map(selection.selected.map((item) => [item.registry_skill_id, item]));
  const effectiveSet = {
    project: selection.project,
    requested_work_scope_tags: selection.requested_work_scope_tags,
    assignments: selection.assignments,
    mode: plan.mode,
    skills: plan.operations.map((operation) => ({
      registry_skill_id: operation.registry_skill_id,
      lineage_id: lineageByRegistrySkillId.get(operation.registry_skill_id),
      skill_name: operation.skill_name,
      artifact_type: operation.artifact_type ?? "skill",
      invocation_mode: operation.invocation_mode ?? "unspecified",
      source_revision_id: operation.source_revision_id,
      desired_state: operation.desired_state,
      reason: operation.reason ?? (plan.mode === "pristine"
        ? "pristine_baseline"
        : selected.has(operation.registry_skill_id)
          ? selected.get(operation.registry_skill_id).reason
          : "not_selected_by_template"),
      selected_by: selected.get(operation.registry_skill_id) ?? null,
      ...(operation.override ? { override: { ...operation.override } } : {}),
    })),
  };
  if (selection.skill_overrides) {
    effectiveSet.skill_overrides = selection.skill_overrides.map((override) => ({ ...override }));
  }
  return effectiveSet;
}

async function exportActivationPlan({ outputPath, plan }) {
  const resolvedOutputPath = path.resolve(outputPath);
  await fs.mkdir(path.dirname(resolvedOutputPath), { recursive: true });
  await fs.writeFile(resolvedOutputPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
  return resolvedOutputPath;
}

async function buildSystemPrompt({ catalogRoot, registryRoot, presetId, includeInjectedNotes = false, projectId = null }) {
  const preset = await getPreset(catalogRoot, presetId);
  if (preset.id === PRISTINE_PRESET_ID) {
    return { preset_id: preset.id, included_skill_ids: [], skipped_skill_ids: [], content: "" };
  }
  const skills = await getRegistrySkills(registryRoot, preset.registry_skill_ids);
  const includedSkillIds = [];
  const skippedSkillIds = [];
  const sections = [];
  for (const skill of skills) {
    try {
      const skillMarkdown = await readPrimaryManifest(skill.canonical_path);
      includedSkillIds.push(skill.id);
      const section = [
        `<!-- registry_skill_id:${skill.id} artifact_type:${skill.artifact_type ?? "skill"} revision:${skill.source_revision_id} digest:${skill.content_digest} -->`,
        skillMarkdown.trim(),
      ];
      if (includeInjectedNotes) {
        const notes = await listSkillNotes({ catalogRoot, lineageId: skill.lineage_id });
        for (const note of notes.filter((item) => {
          if (!item.inject_into_prompt) return false;
          if (item.scope === "global") return true;
          if (item.scope === "revision") return item.source_revision_id === skill.source_revision_id;
          if (item.scope === "preset") return item.preset_id === preset.id;
          if (item.scope === "project") return item.project_id === projectId;
          return false;
        })) {
          section.push(`<!-- registry_note:${note.id} scope:${note.scope} kind:${note.kind} -->`, note.body);
        }
      }
      sections.push(section.join("\n"));
    } catch {
      skippedSkillIds.push(skill.id);
    }
  }
  return {
    preset_id: preset.id,
    included_skill_ids: includedSkillIds,
    skipped_skill_ids: skippedSkillIds,
    content: sections.join("\n\n"),
  };
}

async function buildProjectSystemPrompt({ catalogRoot, registryRoot, projectId, presetId, workScopeTags = [], includeInjectedNotes = false }) {
  const selection = await resolveProjectSelection({ catalogRoot, registryRoot, projectId, presetId, workScopeTags });
  if (selection.mode === "pristine") {
    return {
      project_id: selection.project.id,
      requested_work_scope_tags: selection.requested_work_scope_tags,
      assignments: selection.assignments,
      included_skill_ids: [],
      skipped_skill_ids: [],
      content: "",
    };
  }
  const selectedBySkillId = new Map(selection.selected.map((item) => [item.registry_skill_id, item]));
  const skills = await getRegistrySkills(registryRoot, selection.selected.map((item) => item.registry_skill_id));
  const includedSkillIds = [];
  const skippedSkillIds = [];
  const sections = [];
  for (const skill of skills) {
    try {
      const skillMarkdown = await readPrimaryManifest(skill.canonical_path);
      includedSkillIds.push(skill.id);
      const selected = selectedBySkillId.get(skill.id);
      const section = [
        `<!-- registry_skill_id:${skill.id} artifact_type:${skill.artifact_type ?? "skill"} revision:${skill.source_revision_id} digest:${skill.content_digest} -->`,
        skillMarkdown.trim(),
      ];
      if (includeInjectedNotes) {
        const notes = await listSkillNotes({ catalogRoot, lineageId: skill.lineage_id });
        for (const note of notes.filter((item) => {
          if (!item.inject_into_prompt) return false;
          if (item.scope === "global") return true;
          if (item.scope === "revision") return item.source_revision_id === skill.source_revision_id;
          if (item.scope === "preset") return item.preset_id === selected?.preset_id;
          if (item.scope === "project") return item.project_id === selection.project.id;
          return false;
        })) {
          section.push(`<!-- registry_note:${note.id} scope:${note.scope} kind:${note.kind} -->`, note.body);
        }
      }
      sections.push(section.join("\n"));
    } catch {
      skippedSkillIds.push(skill.id);
    }
  }
  return {
    project_id: selection.project.id,
    requested_work_scope_tags: selection.requested_work_scope_tags,
    assignments: selection.assignments,
    included_skill_ids: includedSkillIds,
    skipped_skill_ids: skippedSkillIds,
    content: sections.join("\n\n"),
  };
}

async function resolveSkillPackageSource({ skillName, version = null, packagesRoot = null, instancesRoot = null }) {
  const targetFolderName = version ? `${skillName}@${version}` : skillName;
  const searchRoots = [];

  if (version) {
    // Version requested: search instances repository first, then packages repository as fallback
    if (instancesRoot) searchRoots.push(path.resolve(instancesRoot));
    searchRoots.push(path.resolve(process.cwd(), "skills-instances"));
    searchRoots.push(path.resolve(__dirname, "../../../skills-instances"));
    if (packagesRoot) searchRoots.push(path.resolve(packagesRoot));
    searchRoots.push(path.resolve(process.cwd(), "skills-packages"));
    searchRoots.push(path.resolve(__dirname, "../../../skills-packages"));
  } else {
    // Latest requested: search packages repository first, then instances repository as fallback
    if (packagesRoot) searchRoots.push(path.resolve(packagesRoot));
    searchRoots.push(path.resolve(process.cwd(), "skills-packages"));
    searchRoots.push(path.resolve(__dirname, "../../../skills-packages"));
    if (instancesRoot) searchRoots.push(path.resolve(instancesRoot));
    searchRoots.push(path.resolve(process.cwd(), "skills-instances"));
    searchRoots.push(path.resolve(__dirname, "../../../skills-instances"));
  }

  const uniqueRoots = [...new Set(searchRoots)];

  for (const root of uniqueRoots) {
    try {
      const groups = await fs.readdir(root);
      for (const group of groups) {
        const candidate = path.join(root, group, targetFolderName);
        try {
          const st = await fs.stat(candidate);
          if (st.isDirectory()) return candidate;
        } catch {}
      }
      const directCandidate = path.join(root, targetFolderName);
      try {
        const st = await fs.stat(directCandidate);
        if (st.isDirectory()) return directCandidate;
      } catch {}
    } catch {}
  }
  return null;
}

async function linkProjectSkill({
  catalogRoot,
  projectId,
  skillName,
  version = null,
  packagesRoot = null,
  instancesRoot = null,
}) {
  const project = await getProject(catalogRoot, projectId);
  if (!project.delivery_root) {
    throw new Error(`Project ${projectId} does not have a delivery_root defined`);
  }

  const targetSourcePath = await resolveSkillPackageSource({ skillName, version, packagesRoot, instancesRoot });
  if (!targetSourcePath) {
    const requestedName = version ? `${skillName}@${version}` : skillName;
    throw new Error(`Skill source package not found: ${requestedName}`);
  }

  await fs.mkdir(project.delivery_root, { recursive: true });
  const deliveryPath = path.join(project.delivery_root, skillName);
  const sidecarPath = `${deliveryPath}.skills-platform-link-ownership.json`;

  try {
    const lst = await fs.lstat(deliveryPath);
    if (lst.isSymbolicLink()) {
      await fs.unlink(deliveryPath);
    } else if (lst.isDirectory()) {
      try {
        await fs.access(sidecarPath);
        await fs.rm(deliveryPath, { recursive: true, force: true });
      } catch {
        throw new Error(`Unmanaged directory exists at ${deliveryPath}. Remove or back up before linking.`);
      }
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  const linkType = process.platform === "win32" ? "junction" : "dir";
  await fs.symlink(targetSourcePath, deliveryPath, linkType);

  const sidecarRecord = {
    schema_version: 1,
    managed_by: "skills-platform-adapter",
    method: "direct_source_symlink",
    binding_policy: version ? "version_pinned" : "floating_latest",
    skill_name: skillName,
    pinned_version: version ?? null,
    canonical_path: targetSourcePath,
    delivery_path: deliveryPath,
    delivery_name: skillName,
  };
  await fs.writeFile(sidecarPath, JSON.stringify(sidecarRecord, null, 2) + "\n", "utf8");

  return {
    linked: true,
    project_id: projectId,
    skill_name: skillName,
    binding_policy: version ? "version_pinned" : "floating_latest",
    pinned_version: version ?? null,
    canonical_path: targetSourcePath,
    delivery_path: deliveryPath,
  };
}

async function getProjectSkillStatus({ catalogRoot, projectId }) {
  const project = await getProject(catalogRoot, projectId);
  if (!project.delivery_root) {
    throw new Error(`Project ${projectId} does not have a delivery_root defined`);
  }

  const skills = [];
  try {
    const entries = await fs.readdir(project.delivery_root);
    for (const entry of entries) {
      if (entry.endsWith(".skills-platform-link-ownership.json") || entry === "README.md") continue;
      const fullPath = path.join(project.delivery_root, entry);
      const sidecarPath = `${fullPath}.skills-platform-link-ownership.json`;
      let isSymlink = false;
      let linkTarget = null;
      try {
        const lst = await fs.lstat(fullPath);
        isSymlink = lst.isSymbolicLink();
        if (isSymlink) {
          linkTarget = await fs.readlink(fullPath);
        }
      } catch {}

      let sidecar = null;
      try {
        sidecar = JSON.parse(await fs.readFile(sidecarPath, "utf8"));
      } catch {}

      let targetExists = false;
      if (linkTarget) {
        try {
          await fs.access(path.resolve(path.dirname(fullPath), linkTarget));
          targetExists = true;
        } catch {}
      }

      skills.push({
        skill_name: entry,
        is_symlink: isSymlink,
        link_target: linkTarget,
        target_exists: targetExists,
        managed: !!sidecar,
        binding_policy: sidecar?.binding_policy ?? (sidecar ? "version_pinned" : "unmanaged"),
        pinned_version: sidecar?.pinned_version ?? null,
        canonical_path: sidecar?.canonical_path ?? null,
      });
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  return {
    project_id: projectId,
    delivery_root: project.delivery_root,
    skills,
  };
}

module.exports = {
  buildProjectSystemPrompt,
  buildSystemPrompt,
  createProjectPlan,
  exportActivationPlan,
  getProjectSkillStatus,
  linkProjectSkill,
  resolveProjectEffectiveSet,
  resolveProjectSelection,
  resolveSkillPackageSource,
};
