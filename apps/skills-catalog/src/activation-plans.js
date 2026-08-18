const path = require("node:path");
const { createActivationPlan } = require("@skills-platform/contracts");
const { getRegistrySkills } = require("./registry");

function deliveryDirectoryName(skillName, _artifactType = "skill") {
  return skillName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "artifact";
}

async function createPlanFromRegistry({
  registryRoot,
  skillIds,
  target,
  deliveryRoot,
  distribution,
  desiredState = "enabled",
  desiredStateBySkillId = {},
  mode = "apply",
  now,
}) {
  if (!deliveryRoot) throw new Error("deliveryRoot is required for a delivery plan preview");
  const skills = await getRegistrySkills(registryRoot, skillIds);
  return createActivationPlan({
    target,
    distribution,
    mode,
    now,
    operations: skills.map((skill) => {
      const artifactType = skill.artifact_type ?? "skill";
      return {
        registry_skill_id: skill.id,
        skill_name: skill.skill_name,
        artifact_type: artifactType,
        source_revision_id: skill.source_revision_id,
        content_digest: skill.content_digest,
        canonical_path: skill.canonical_path,
        delivery_path: path.join(path.resolve(deliveryRoot), deliveryDirectoryName(skill.skill_name, artifactType)),
        desired_state: desiredStateBySkillId[skill.id] ?? desiredState,
      };
    }),
  });
}

module.exports = { createPlanFromRegistry };
