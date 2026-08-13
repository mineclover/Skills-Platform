const fs = require("node:fs/promises");
const path = require("node:path");
const { getRegistrySkills } = require("./registry");

const CATALOG_SCHEMA_VERSION = 2;
const PRISTINE_PRESET_ID = "builtin-pristine";

function now() {
  return new Date().toISOString();
}

function catalogFile(catalogRoot) {
  return path.join(catalogRoot, "catalog.json");
}

function blankCatalog() {
  return { schema_version: CATALOG_SCHEMA_VERSION, projects: [], presets: [], skill_profiles: [], skill_notes: [] };
}

function normalizeCatalog(catalog) {
  if (catalog.schema_version !== 1 && catalog.schema_version !== CATALOG_SCHEMA_VERSION) {
    throw new Error(`Unsupported catalog schema: ${catalog.schema_version}`);
  }
  catalog.projects ??= [];
  catalog.presets ??= [];
  catalog.skill_profiles ??= [];
  catalog.skill_notes ??= [];
  catalog.schema_version = CATALOG_SCHEMA_VERSION;
  return catalog;
}

function pristinePreset() {
  return {
    id: PRISTINE_PRESET_ID,
    name: "Pristine · No managed skills",
    description: "A clean managed baseline that disables every catalog skill for the selected target.",
    kind: "builtin",
    registry_skill_ids: [],
  };
}

async function loadCatalog(catalogRoot) {
  try {
    return normalizeCatalog(JSON.parse(await fs.readFile(catalogFile(catalogRoot), "utf8")));
  } catch (error) {
    if (error.code === "ENOENT") return blankCatalog();
    throw error;
  }
}

async function saveCatalog(catalogRoot, catalog) {
  await fs.mkdir(catalogRoot, { recursive: true });
  const temporary = `${catalogFile(catalogRoot)}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
  await fs.rename(temporary, catalogFile(catalogRoot));
}

function requireIdentifier(value, label) {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${label} is required`);
  return value.trim();
}

async function createProject({ catalogRoot, id, name, projectPath, providerId, deliveryRoot, scope = "project" }) {
  id = requireIdentifier(id, "Project id");
  name = requireIdentifier(name, "Project name");
  providerId = requireIdentifier(providerId, "Provider id");
  deliveryRoot = requireIdentifier(deliveryRoot, "Delivery root");
  if (scope !== "project" && scope !== "global") throw new Error("Project scope must be project or global");
  if (scope === "project") projectPath = requireIdentifier(projectPath, "Project path");

  const catalog = await loadCatalog(catalogRoot);
  if (catalog.projects.some((project) => project.id === id)) throw new Error(`Project already exists: ${id}`);
  const project = {
    id,
    name,
    project_path: scope === "project" ? path.resolve(projectPath) : null,
    provider_id: providerId,
    delivery_root: path.resolve(deliveryRoot),
    scope,
    default_preset_id: PRISTINE_PRESET_ID,
    created_at: now(),
  };
  catalog.projects.push(project);
  await saveCatalog(catalogRoot, catalog);
  return project;
}

async function listProjects(catalogRoot) {
  return (await loadCatalog(catalogRoot)).projects.slice().sort((left, right) => left.name.localeCompare(right.name));
}

async function createPreset({ catalogRoot, registryRoot, id, name, description = null, registrySkillIds }) {
  id = requireIdentifier(id, "Preset id");
  name = requireIdentifier(name, "Preset name");
  if (id === PRISTINE_PRESET_ID) throw new Error(`${PRISTINE_PRESET_ID} is reserved`);
  if (!Array.isArray(registrySkillIds) || registrySkillIds.length === 0) {
    throw new Error("A custom preset must contain at least one registry skill");
  }
  const selectedSkills = await getRegistrySkills(registryRoot, registrySkillIds);
  const artifactKeys = selectedSkills.map((skill) => skill.artifact_key ?? `${skill.source_id}:${skill.source_relative_path}`);
  if (new Set(artifactKeys).size !== artifactKeys.length) {
    throw new Error("A preset cannot contain multiple revisions of the same artifact");
  }

  const catalog = await loadCatalog(catalogRoot);
  if (catalog.presets.some((preset) => preset.id === id)) throw new Error(`Preset already exists: ${id}`);
  const preset = {
    id,
    name,
    description,
    kind: "custom",
    registry_skill_ids: [...new Set(registrySkillIds)],
    created_at: now(),
    updated_at: now(),
  };
  catalog.presets.push(preset);
  await saveCatalog(catalogRoot, catalog);
  return preset;
}

async function listPresets(catalogRoot) {
  const catalog = await loadCatalog(catalogRoot);
  return [pristinePreset(), ...catalog.presets.slice().sort((left, right) => left.name.localeCompare(right.name))];
}

async function getPreset(catalogRoot, presetId) {
  if (presetId === PRISTINE_PRESET_ID) return pristinePreset();
  const catalog = await loadCatalog(catalogRoot);
  const preset = catalog.presets.find((item) => item.id === presetId);
  if (!preset) throw new Error(`Preset not found: ${presetId}`);
  return preset;
}

async function assignPreset({ catalogRoot, projectId, presetId }) {
  await getPreset(catalogRoot, presetId);
  const catalog = await loadCatalog(catalogRoot);
  const project = catalog.projects.find((item) => item.id === projectId);
  if (!project) throw new Error(`Project not found: ${projectId}`);
  project.default_preset_id = presetId;
  project.updated_at = now();
  await saveCatalog(catalogRoot, catalog);
  return project;
}

async function getProject(catalogRoot, projectId) {
  const catalog = await loadCatalog(catalogRoot);
  const project = catalog.projects.find((item) => item.id === projectId);
  if (!project) throw new Error(`Project not found: ${projectId}`);
  return project;
}

function createPlanFileName(plan) {
  return `activation-plan-${plan.plan_id}.json`;
}

module.exports = {
  CATALOG_SCHEMA_VERSION,
  PRISTINE_PRESET_ID,
  assignPreset,
  createPlanFileName,
  createPreset,
  createProject,
  getPreset,
  getProject,
  listPresets,
  listProjects,
  loadCatalog,
  saveCatalog,
};
