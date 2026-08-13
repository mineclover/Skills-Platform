const fs = require("node:fs/promises");
const path = require("node:path");
const { createPlanFromRegistry } = require("./activation-plans");
const { getPreset, getProject, PRISTINE_PRESET_ID } = require("./catalog-state");
const { getRegistrySkills, latestSkillsByArtifact, listRegistrySkills } = require("./registry");

async function createProjectPlan({ catalogRoot, registryRoot, projectId, presetId, distribution }) {
  const project = await getProject(catalogRoot, projectId);
  const preset = await getPreset(catalogRoot, presetId ?? project.default_preset_id);
  const isPristine = preset.id === PRISTINE_PRESET_ID;
  const registeredSkills = await listRegistrySkills(registryRoot);
  const selectedSkills = isPristine
    ? []
    : await getRegistrySkills(registryRoot, preset.registry_skill_ids);
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

async function exportActivationPlan({ outputPath, plan }) {
  const resolvedOutputPath = path.resolve(outputPath);
  await fs.mkdir(path.dirname(resolvedOutputPath), { recursive: true });
  await fs.writeFile(resolvedOutputPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
  return resolvedOutputPath;
}

async function buildSystemPrompt({ catalogRoot, registryRoot, presetId }) {
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
      const skillMarkdown = await fs.readFile(path.join(skill.canonical_path, "SKILL.md"), "utf8");
      if (skillMarkdown.trim() === "") throw new Error("Empty SKILL.md");
      includedSkillIds.push(skill.id);
      sections.push([
        `<!-- registry_skill_id:${skill.id} revision:${skill.source_revision_id} digest:${skill.content_digest} -->`,
        skillMarkdown.trim(),
      ].join("\n"));
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

module.exports = { buildSystemPrompt, createProjectPlan, exportActivationPlan };
