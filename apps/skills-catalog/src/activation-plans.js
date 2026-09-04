const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { createActivationPlan } = require("@skills-platform/contracts");
const { getRegistrySkills } = require("./registry");

function deliveryDirectoryName(skillName, _artifactType = "skill") {
  return skillName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "artifact";
}

function normalizedProviderId(target) {
  return String(target?.provider_id ?? "").trim().toLowerCase();
}

function comparablePath(value) {
  const resolved = path.resolve(value);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function expectedCodexDeliveryRoot(target) {
  if (target?.scope === "global") return path.join(os.homedir(), ".agents", "skills");
  if (typeof target?.project_path !== "string" || !target.project_path.trim()) {
    throw new Error("Codex project activation requires target.project_path");
  }
  return path.join(path.resolve(target.project_path), ".agents", "skills");
}

function isAntigravityTarget(target) {
  return ["antigravity", "agy", "gemini"].includes(normalizedProviderId(target));
}

function expectedAntigravityDeliveryRoots(target) {
  if (target?.scope === "global") {
    return [path.join(os.homedir(), ".gemini", "config", "skills")];
  }
  if (typeof target?.project_path !== "string" || !target.project_path.trim()) {
    throw new Error("Antigravity project activation requires target.project_path");
  }
  const projectRoot = path.resolve(target.project_path);
  return [
    path.join(projectRoot, ".agents", "skills"),
    path.join(projectRoot, ".agent", "skills"),
  ];
}

async function validateProviderSkillArtifact({ skill, providerLabel, desiredState }) {
  if (desiredState !== "enabled") return;
  if ((skill.artifact_type ?? "skill") !== "skill") {
    throw new Error(
      `${providerLabel} skill delivery accepts only skill artifacts; '${skill.skill_name}' is ${skill.artifact_type}`,
    );
  }
  if (typeof skill.description !== "string" || !skill.description.trim()) {
    throw new Error(`${providerLabel} skill '${skill.skill_name}' requires a non-empty frontmatter description`);
  }
  let entries;
  try {
    entries = await fs.readdir(skill.canonical_path);
  } catch (error) {
    throw new Error(`${providerLabel} skill '${skill.skill_name}' canonical directory cannot be read: ${error.message}`);
  }
  if (!entries.includes("SKILL.md")) {
    throw new Error(`${providerLabel} skill '${skill.skill_name}' must contain an exact-case SKILL.md manifest`);
  }
  const manifest = await fs.lstat(path.join(skill.canonical_path, "SKILL.md"));
  if (!manifest.isFile() || manifest.isSymbolicLink()) {
    throw new Error(`${providerLabel} skill '${skill.skill_name}' SKILL.md manifest must be a regular file`);
  }
}

async function validateCodexSkill({ skill, target, deliveryRoot, desiredState }) {
  if (normalizedProviderId(target) !== "codex") return;
  const expectedRoot = expectedCodexDeliveryRoot(target);
  if (comparablePath(deliveryRoot) !== comparablePath(expectedRoot)) {
    throw new Error(
      `Codex delivery root must be ${expectedRoot}; received ${path.resolve(deliveryRoot)}`,
    );
  }
  await validateProviderSkillArtifact({
    skill,
    providerLabel: "Codex",
    desiredState,
  });
}

async function validateAntigravitySkill({ skill, target, deliveryRoot, desiredState }) {
  if (!isAntigravityTarget(target)) return;
  const expectedRoots = expectedAntigravityDeliveryRoots(target);
  if (!expectedRoots.some((expectedRoot) => comparablePath(deliveryRoot) === comparablePath(expectedRoot))) {
    throw new Error(
      `Antigravity delivery root must be one of ${expectedRoots.join(", ")}; received ${path.resolve(deliveryRoot)}`,
    );
  }
  await validateProviderSkillArtifact({
    skill,
    providerLabel: "Antigravity",
    desiredState,
  });
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
  for (const skill of skills) {
    await validateCodexSkill({
      skill,
      target,
      deliveryRoot,
      desiredState: desiredStateBySkillId[skill.id] ?? desiredState,
    });
    await validateAntigravitySkill({
      skill,
      target,
      deliveryRoot,
      desiredState: desiredStateBySkillId[skill.id] ?? desiredState,
    });
  }
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
        invocation_mode: skill.invocation_mode ?? "unspecified",
        source_revision_id: skill.source_revision_id,
        content_digest: skill.content_digest,
        canonical_path: skill.canonical_path,
        delivery_path: path.join(path.resolve(deliveryRoot), deliveryDirectoryName(skill.skill_name, artifactType)),
        desired_state: desiredStateBySkillId[skill.id] ?? desiredState,
      };
    }),
  });
}

module.exports = {
  createPlanFromRegistry,
  expectedAntigravityDeliveryRoots,
  expectedCodexDeliveryRoot,
  validateAntigravitySkill,
  validateCodexSkill,
};
