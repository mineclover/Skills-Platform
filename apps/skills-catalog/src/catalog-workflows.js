const fs = require("node:fs/promises");
const path = require("node:path");
const { createPlanFromRegistry } = require("./activation-plans");
const { getPreset, getProject, PRISTINE_PRESET_ID } = require("./catalog-state");
const { getRegistrySkills, latestSkillsByArtifact, listRegistrySkills } = require("./registry");
const { listSkillNotes } = require("./skill-management");

function hasAllTags(candidateTags, requestedTags) {
  return candidateTags.every((tag) => requestedTags.has(tag));
}

async function resolveProjectSelection({ catalogRoot, projectId, presetId, workScopeTags = [] }) {
  const project = await getProject(catalogRoot, projectId);
  if (presetId) {
    const preset = await getPreset(catalogRoot, presetId);
    return {
      project,
      requested_work_scope_tags: workScopeTags,
      mode: preset.id === PRISTINE_PRESET_ID ? "pristine" : "apply",
      assignments: [{ preset_id: preset.id, template_version: preset.selected_version, role: "explicit", priority: 0, work_scope_tags: [] }],
      selected: preset.registry_skill_ids.map((registrySkillId) => ({
        registry_skill_id: registrySkillId,
        reason: "selected_by_explicit_template",
        preset_id: preset.id,
        template_version: preset.selected_version,
      })),
    };
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
  return {
    project,
    requested_work_scope_tags: workScopeTags,
    mode: selectedByLineage.size === 0 ? "pristine" : "apply",
    assignments: resolvedAssignments.map(({ preset, ...assignment }) => ({ ...assignment, name: preset.name, purpose: preset.purpose })),
    selected: [...selectedByLineage.values()],
  };
}

async function createProjectPlan({ catalogRoot, registryRoot, projectId, presetId, workScopeTags, distribution }) {
  const selection = await resolveProjectSelection({ catalogRoot, projectId, presetId, workScopeTags });
  const { project } = selection;
  const isPristine = selection.mode === "pristine";
  const registeredSkills = await listRegistrySkills(registryRoot);
  const selectedSkills = isPristine
    ? []
    : await getRegistrySkills(registryRoot, selection.selected.map((item) => item.registry_skill_id));
  const selectedByArtifact = new Map(selectedSkills.map((skill) => [
    skill.artifact_key ?? `${skill.source_id}:${skill.source_relative_path}`,
    skill,
  ]));
  const effectiveSkills = latestSkillsByArtifact(registeredSkills).map((latest) => {
    const key = latest.artifact_key ?? `${latest.source_id}:${latest.source_relative_path}`;
    return selectedByArtifact.get(key) ?? latest;
  });
  const selectedIds = new Set(selectedSkills.map((skill) => skill.id));
  const desiredStateBySkillId = Object.fromEntries(effectiveSkills.map((skill) => [
    skill.id,
    selectedIds.has(skill.id) ? "enabled" : "disabled",
  ]));

  return createPlanFromRegistry({
    registryRoot,
    skillIds: effectiveSkills.map((skill) => skill.id),
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
  const selection = await resolveProjectSelection({ catalogRoot, projectId, presetId, workScopeTags });
  const plan = await createProjectPlan({ catalogRoot, registryRoot, projectId, presetId, workScopeTags });
  const selected = new Map(selection.selected.map((item) => [item.registry_skill_id, item]));
  return {
    project: selection.project,
    requested_work_scope_tags: selection.requested_work_scope_tags,
    assignments: selection.assignments,
    mode: plan.mode,
    skills: plan.operations.map((operation) => ({
      registry_skill_id: operation.registry_skill_id,
      skill_name: operation.skill_name,
      artifact_type: operation.artifact_type ?? "skill",
      source_revision_id: operation.source_revision_id,
      desired_state: operation.desired_state,
      reason: plan.mode === "pristine"
        ? "pristine_baseline"
        : selected.has(operation.registry_skill_id)
          ? selected.get(operation.registry_skill_id).reason
          : "not_selected_by_template",
      selected_by: selected.get(operation.registry_skill_id) ?? null,
    })),
  };
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
  const selection = await resolveProjectSelection({ catalogRoot, projectId, presetId, workScopeTags });
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

module.exports = {
  buildProjectSystemPrompt,
  buildSystemPrompt,
  createProjectPlan,
  exportActivationPlan,
  resolveProjectEffectiveSet,
  resolveProjectSelection,
};
