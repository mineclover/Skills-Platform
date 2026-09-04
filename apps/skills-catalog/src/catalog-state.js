const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { getRegistrySkills, getSkillLineage } = require("./registry");
const { validateActivationPlan } = require("../../../packages/skill-contracts/src");

const crypto = require("node:crypto");

const CATALOG_SCHEMA_VERSION = 11;
const PRISTINE_PRESET_ID = "builtin-pristine";
const TEMPLATE_LIFECYCLES = new Set(["draft", "reviewed", "deprecated"]);
const PROJECT_PRESET_ROLES = new Set(["default", "recommended", "work_scope_overlay"]);
const SKILL_OVERRIDE_STATES = new Set(["enabled", "disabled"]);
const catalogMutationLocks = new Map();

function now() {
  return new Date().toISOString();
}

function catalogFile(catalogRoot) {
  return path.join(catalogRoot, "catalog.json");
}

async function withCatalogMutationLock(catalogRoot, operation) {
  const key = path.resolve(catalogRoot);
  const previous = catalogMutationLocks.get(key) ?? Promise.resolve();
  let release;
  const current = new Promise((resolve) => {
    release = resolve;
  });
  catalogMutationLocks.set(key, current);
  try {
    await previous;
    return await operation();
  } finally {
    release();
    if (catalogMutationLocks.get(key) === current) catalogMutationLocks.delete(key);
  }
}

function blankCatalog() {
  return {
    schema_version: CATALOG_SCHEMA_VERSION,
    projects: [],
    presets: [],
    skill_profiles: [],
    skill_notes: [],
    skill_feedback: [],
    evaluation_cases: [],
    evaluation_runs: [],
    observed_states: [],
    source_reviews: [],
    activation_plans: [],
    activation_reports: [],
  };
}

function uniqueStrings(values) {
  return [...new Set((values ?? []).filter((value) => typeof value === "string" && value.trim() !== "").map((value) => value.trim()))]
    .sort((left, right) => left.localeCompare(right));
}

function templateSnapshot(preset, version = preset.active_version ?? 1) {
  return {
    version,
    registry_skill_ids: [...new Set(preset.registry_skill_ids ?? [])],
    entries: (preset.entries ?? []).map((entry) => ({ ...entry })),
    description: preset.description ?? null,
    purpose: preset.purpose ?? null,
    work_scope_tags: uniqueStrings(preset.work_scope_tags),
    template_notes: (preset.template_notes ?? []).map((note) => ({ ...note })),
    created_at: preset.updated_at ?? preset.created_at ?? now(),
  };
}

function normalizePreset(preset) {
  preset.kind ??= "custom";
  preset.lifecycle ??= "draft";
  preset.owner ??= null;
  preset.work_scope_tags = uniqueStrings(preset.work_scope_tags);
  preset.purpose ??= null;
  preset.template_notes ??= [];
  preset.active_version ??= 1;
  preset.versions ??= [templateSnapshot(preset, preset.active_version)];
  for (const version of preset.versions) {
    version.registry_skill_ids ??= preset.registry_skill_ids ?? [];
    version.entries ??= [];
    version.work_scope_tags = uniqueStrings(version.work_scope_tags);
    version.template_notes ??= [];
  }
  const current = preset.versions.find((version) => version.version === preset.active_version) ?? preset.versions.at(-1);
  preset.active_version = current.version;
  // selected_version is a presentation field. Persisted legacy values must
  // never override the current active template during catalog-wide exports.
  preset.selected_version = current.version;
  preset.registry_skill_ids = current.registry_skill_ids;
  preset.entries = current.entries;
  return preset;
}

function normalizeAssignment(assignment) {
  assignment.role ??= "work_scope_overlay";
  if (!PROJECT_PRESET_ROLES.has(assignment.role)) assignment.role = "work_scope_overlay";
  assignment.template_version ??= 1;
  assignment.priority = Number.isFinite(assignment.priority) ? assignment.priority : 0;
  assignment.work_scope_tags = uniqueStrings(assignment.work_scope_tags);
  assignment.enabled = assignment.enabled !== false;
  return assignment;
}

function normalizeSkillOverride(override) {
  if (!override || typeof override !== "object" || Array.isArray(override)) {
    throw new Error("Project skill override must be an object");
  }
  const lineageId = requireIdentifier(override.lineage_id, "Project skill override lineage id");
  const registrySkillId = requireIdentifier(override.registry_skill_id, "Project skill override registry skill id");
  if (!SKILL_OVERRIDE_STATES.has(override.desired_state)) {
    throw new Error("Project skill override desired state must be enabled or disabled");
  }
  const updatedAt = requireIdentifier(override.updated_at, "Project skill override updated at");
  if (Number.isNaN(Date.parse(updatedAt))) {
    throw new Error("Project skill override updated at must be an ISO timestamp");
  }
  return {
    lineage_id: lineageId,
    registry_skill_id: registrySkillId,
    desired_state: override.desired_state,
    updated_at: updatedAt,
  };
}

function normalizeSkillOverrides(overrides) {
  if (!Array.isArray(overrides)) throw new Error("Project skill overrides must be an array");
  const latestByLineage = new Map();
  for (const override of overrides ?? []) {
    const normalized = normalizeSkillOverride(override);
    const current = latestByLineage.get(normalized.lineage_id);
    if (!current || current.updated_at <= normalized.updated_at) {
      latestByLineage.set(normalized.lineage_id, normalized);
    }
  }
  return [...latestByLineage.values()].sort((left, right) => left.lineage_id.localeCompare(right.lineage_id));
}

function isWindowsAbsolute(value) {
  return typeof value === "string" && (/^[A-Za-z]:[\\/]/.test(value) || /^\\\\/.test(value));
}

function pathsEqualForHost(left, right) {
  if (typeof left !== "string" || typeof right !== "string") return false;
  if (isWindowsAbsolute(left) || isWindowsAbsolute(right)) {
    return path.win32.resolve(left.replace(/\//g, "\\")).toLowerCase()
      === path.win32.resolve(right.replace(/\//g, "\\")).toLowerCase();
  }
  const resolvedLeft = path.resolve(left);
  const resolvedRight = path.resolve(right);
  return process.platform === "win32"
    ? resolvedLeft.toLowerCase() === resolvedRight.toLowerCase()
    : resolvedLeft === resolvedRight;
}

function isAntigravityProvider(providerId) {
  return ["antigravity", "agy", "gemini"].includes(String(providerId ?? "").trim().toLowerCase());
}

function migrateLegacyCodexDeliveryRoot(project, sourceSchemaVersion) {
  if (sourceSchemaVersion > 9 || String(project.provider_id ?? "").toLowerCase() !== "codex") return;
  if (project.scope === "project" && typeof project.project_path === "string") {
    const pathApi = isWindowsAbsolute(project.project_path) ? path.win32 : path;
    const legacyDefault = pathApi.join(project.project_path, "skills");
    if (pathsEqualForHost(project.delivery_root, legacyDefault)) {
      project.delivery_root = pathApi.join(project.project_path, ".agents", "skills");
    }
    return;
  }
  if (project.scope === "global" && pathsEqualForHost(project.delivery_root, path.resolve("skills"))) {
    project.delivery_root = path.join(os.homedir(), ".agents", "skills");
  }
}

function migrateLegacyAntigravityDeliveryRoot(project, sourceSchemaVersion) {
  if (sourceSchemaVersion > 10 || !isAntigravityProvider(project.provider_id)) return;
  if (project.scope === "global" && pathsEqualForHost(project.delivery_root, path.resolve("skills"))) {
    project.delivery_root = path.join(os.homedir(), ".gemini", "config", "skills");
  }
}

function normalizeProject(project, { sourceSchemaVersion = CATALOG_SCHEMA_VERSION } = {}) {
  migrateLegacyCodexDeliveryRoot(project, sourceSchemaVersion);
  migrateLegacyAntigravityDeliveryRoot(project, sourceSchemaVersion);
  project.upstream_project_id ??= project.id;
  project.default_preset_id ??= PRISTINE_PRESET_ID;
  project.default_preset_version ??= 1;
  project.preset_assignments = (project.preset_assignments ?? []).map(normalizeAssignment);
  project.skill_overrides = normalizeSkillOverrides(project.skill_overrides ?? []);
  if (!project.preset_assignments.some((assignment) => assignment.role === "default")) {
    project.preset_assignments.unshift({
      preset_id: project.default_preset_id,
      template_version: project.default_preset_version,
      role: "default",
      priority: 0,
      work_scope_tags: [],
      enabled: true,
      created_at: project.created_at ?? now(),
    });
  }
  const defaultAssignment = project.preset_assignments.find((assignment) => assignment.role === "default");
  project.default_preset_id = defaultAssignment.preset_id;
  project.default_preset_version = defaultAssignment.template_version;
  return project;
}

function presentPreset(preset, version = preset.active_version) {
  const snapshot = preset.versions.find((item) => item.version === Number(version));
  if (!snapshot) throw new Error(`Preset version not found: ${preset.id}@${version}`);
  return {
    ...preset,
    ...snapshot,
    active_version: preset.active_version,
    selected_version: snapshot.version,
  };
}

function normalizeCatalog(catalog) {
  if (![1, 2, 3, 4, 5, 6, 7, 8, 9, 10, CATALOG_SCHEMA_VERSION].includes(catalog.schema_version)) {
    throw new Error(`Unsupported catalog schema: ${catalog.schema_version}`);
  }
  const sourceSchemaVersion = catalog.schema_version;
  catalog.projects = (catalog.projects ?? []).map((project) => normalizeProject(project, { sourceSchemaVersion }));
  catalog.presets = (catalog.presets ?? []).map(normalizePreset);
  catalog.skill_profiles ??= [];
  catalog.skill_notes ??= [];
  catalog.skill_feedback ??= [];
  catalog.evaluation_cases ??= [];
  catalog.evaluation_runs ??= [];
  catalog.observed_states ??= [];
  catalog.source_reviews ??= [];
  catalog.activation_plans ??= [];
  catalog.activation_reports ??= [];
  catalog.schema_version = CATALOG_SCHEMA_VERSION;
  return catalog;
}

function pristinePreset() {
  return {
    id: PRISTINE_PRESET_ID,
    name: "Pristine · No managed skills",
    description: "A clean managed baseline that disables every catalog skill for the selected target.",
    kind: "builtin",
    lifecycle: "reviewed",
    owner: "Skills Platform",
    purpose: "Return a target to its clean managed baseline.",
    work_scope_tags: [],
    registry_skill_ids: [],
    entries: [],
    active_version: 1,
    selected_version: 1,
    template_notes: [],
    versions: [{ version: 1, registry_skill_ids: [], entries: [], description: "Clean managed baseline.", purpose: "Return a target to its clean managed baseline.", work_scope_tags: [], template_notes: [], created_at: null }],
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
  const temporary = `${catalogFile(catalogRoot)}.${process.pid}.${crypto.randomUUID()}.tmp`;
  try {
    const handle = await fs.open(temporary, "wx", 0o600);
    try {
      await handle.writeFile(`${JSON.stringify(catalog, null, 2)}\n`, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    await fs.rename(temporary, catalogFile(catalogRoot));
  } finally {
    await fs.rm(temporary, { force: true }).catch(() => {});
  }
}

function requireIdentifier(value, label) {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${label} is required`);
  return value.trim();
}

function defaultDeliveryRoot(providerId, projectPath) {
  const normalized = (providerId ?? "").toLowerCase();
  if (!projectPath) {
    if (normalized === "codex") return path.join(os.homedir(), ".agents", "skills");
    if (isAntigravityProvider(normalized)) return path.join(os.homedir(), ".gemini", "config", "skills");
    return path.resolve("skills");
  }
  const base = path.resolve(projectPath);
  if (normalized === "codex") {
    return path.join(base, ".agents", "skills");
  }
  if (normalized === "antigravity" || normalized === "agy" || normalized === "gemini") {
    return path.join(base, ".agents", "skills");
  }
  if (normalized === "claude") {
    return path.join(base, ".claude", "skills");
  }
  return path.join(base, "skills");
}

async function createProject({ catalogRoot, id, name, projectPath, providerId, deliveryRoot, scope = "project", upstreamProjectId = id }) {
  id = requireIdentifier(id, "Project id");
  name = requireIdentifier(name, "Project name");
  providerId = requireIdentifier(providerId, "Provider id");
  if (scope !== "project" && scope !== "global") throw new Error("Project scope must be project or global");
  if (scope === "project") projectPath = requireIdentifier(projectPath, "Project path");
  const scopedProjectPath = scope === "project" ? projectPath : null;
  const resolvedDeliveryRoot = deliveryRoot ? requireIdentifier(deliveryRoot, "Delivery root") : defaultDeliveryRoot(providerId, scopedProjectPath);
  if (providerId.toLowerCase() === "codex") {
    const expectedRoot = defaultDeliveryRoot(providerId, scopedProjectPath);
    if (!pathsEqualForHost(resolvedDeliveryRoot, expectedRoot)) {
      throw new Error(`Codex delivery root must be ${expectedRoot}; received ${path.resolve(resolvedDeliveryRoot)}`);
    }
  }
  if (isAntigravityProvider(providerId)) {
    const expectedRoot = defaultDeliveryRoot(providerId, scopedProjectPath);
    const acceptedRoots = scope === "project"
      ? [expectedRoot, path.join(path.resolve(scopedProjectPath), ".agent", "skills")]
      : [expectedRoot];
    if (!acceptedRoots.some((candidate) => pathsEqualForHost(resolvedDeliveryRoot, candidate))) {
      throw new Error(
        `Antigravity delivery root must be one of ${acceptedRoots.join(", ")}; received ${path.resolve(resolvedDeliveryRoot)}`,
      );
    }
  }

  const catalog = await loadCatalog(catalogRoot);
  if (catalog.projects.some((project) => project.id === id)) throw new Error(`Project already exists: ${id}`);
  const project = {
    id,
    name,
    upstream_project_id: requireIdentifier(upstreamProjectId, "Upstream Skills Manager project id"),
    project_path: scope === "project" ? path.resolve(scopedProjectPath) : null,
    provider_id: providerId,
    delivery_root: path.resolve(resolvedDeliveryRoot),
    scope,
    default_preset_id: PRISTINE_PRESET_ID,
    default_preset_version: 1,
    preset_assignments: [{
      preset_id: PRISTINE_PRESET_ID,
      template_version: 1,
      role: "default",
      priority: 0,
      work_scope_tags: [],
      enabled: true,
      created_at: now(),
    }],
    skill_overrides: [],
    created_at: now(),
  };
  catalog.projects.push(project);
  await saveCatalog(catalogRoot, catalog);
  return project;
}

async function listProjects(catalogRoot) {
  return (await loadCatalog(catalogRoot)).projects.slice().sort((left, right) => left.name.localeCompare(right.name));
}

function templateEntries(skills) {
  return skills.map((skill) => ({
    lineage_id: skill.lineage_id,
    source_revision_id: skill.source_revision_id,
    registry_skill_id: skill.id,
    revision_policy: "pinned",
    required: true,
    enabled_by_default: true,
  }));
}

async function createPreset({ catalogRoot, registryRoot, id, name, description = null, purpose = null, workScopeTags = [], owner = null, lifecycle = "draft", registrySkillIds }) {
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
  if (!TEMPLATE_LIFECYCLES.has(lifecycle)) throw new Error("Preset lifecycle is not valid");

  const catalog = await loadCatalog(catalogRoot);
  if (catalog.presets.some((preset) => preset.id === id)) throw new Error(`Preset already exists: ${id}`);
  const preset = {
    id,
    name,
    description,
    kind: "custom",
    registry_skill_ids: [...new Set(registrySkillIds)],
    entries: templateEntries(selectedSkills),
    purpose,
    work_scope_tags: uniqueStrings(workScopeTags),
    owner,
    lifecycle,
    active_version: 1,
    template_notes: [],
    created_at: now(),
    updated_at: now(),
  };
  preset.versions = [templateSnapshot(preset, 1)];
  catalog.presets.push(preset);
  await saveCatalog(catalogRoot, catalog);
  return preset;
}

async function listPresets(catalogRoot) {
  const catalog = await loadCatalog(catalogRoot);
  return [pristinePreset(), ...catalog.presets.slice().sort((left, right) => left.name.localeCompare(right.name)).map((preset) => presentPreset(preset))];
}

async function getPreset(catalogRoot, presetId, version) {
  if (presetId === PRISTINE_PRESET_ID) return pristinePreset();
  const catalog = await loadCatalog(catalogRoot);
  const preset = catalog.presets.find((item) => item.id === presetId);
  if (!preset) throw new Error(`Preset not found: ${presetId}`);
  return presentPreset(preset, version ?? preset.active_version);
}

async function assignPreset({ catalogRoot, projectId, presetId, version, role = "default", priority = 0, workScopeTags = [], enabled = true }) {
  if (!PROJECT_PRESET_ROLES.has(role)) throw new Error("Project preset role is not valid");
  const preset = await getPreset(catalogRoot, presetId, version);
  const catalog = await loadCatalog(catalogRoot);
  const project = catalog.projects.find((item) => item.id === projectId);
  if (!project) throw new Error(`Project not found: ${projectId}`);
  const assignment = {
    preset_id: presetId,
    template_version: preset.selected_version,
    role,
    priority: Number(priority),
    work_scope_tags: uniqueStrings(workScopeTags),
    enabled: enabled !== false,
    updated_at: now(),
  };
  if (!Number.isFinite(assignment.priority)) throw new Error("Project preset priority must be a number");
  const existingIndex = role === "default"
    ? project.preset_assignments.findIndex((item) => item.role === "default")
    : project.preset_assignments.findIndex((item) => item.role === role && item.preset_id === presetId && item.template_version === preset.selected_version);
  if (existingIndex >= 0) {
    project.preset_assignments[existingIndex] = { ...project.preset_assignments[existingIndex], ...assignment };
  } else {
    assignment.created_at = now();
    project.preset_assignments.push(assignment);
  }
  if (role === "default") {
    project.default_preset_id = presetId;
    project.default_preset_version = preset.selected_version;
  }
  project.updated_at = now();
  await saveCatalog(catalogRoot, catalog);
  return project;
}

function sameTags(left, right) {
  if (left.length !== right.length) return false;
  return left.every((tag, index) => tag === right[index]);
}

async function replaceWorkScopeOverlay({ catalogRoot, projectId, presetId, version, workScopeTags, priority = 0 }) {
  const tags = uniqueStrings(workScopeTags);
  if (tags.length === 0) throw new Error("A work-scope overlay requires at least one work-scope tag");
  const catalog = await loadCatalog(catalogRoot);
  const project = catalog.projects.find((item) => item.id === projectId);
  if (!project) throw new Error(`Project not found: ${projectId}`);
  project.preset_assignments = project.preset_assignments.filter((assignment) => !(assignment.role === "work_scope_overlay" && sameTags(assignment.work_scope_tags, tags)));
  if (presetId) {
    const preset = await getPreset(catalogRoot, presetId, version);
    const assignment = {
      preset_id: preset.id,
      template_version: preset.selected_version,
      role: "work_scope_overlay",
      priority: Number(priority),
      work_scope_tags: tags,
      enabled: true,
      created_at: now(),
      updated_at: now(),
    };
    if (!Number.isFinite(assignment.priority)) throw new Error("Project preset priority must be a number");
    project.preset_assignments.push(assignment);
  }
  project.updated_at = now();
  await saveCatalog(catalogRoot, catalog);
  return project;
}

async function updatePresetTemplate({ catalogRoot, registryRoot, presetId, patch }) {
  if (presetId === PRISTINE_PRESET_ID) throw new Error("Pristine template cannot be changed");
  const catalog = await loadCatalog(catalogRoot);
  const preset = catalog.presets.find((item) => item.id === presetId);
  if (!preset) throw new Error(`Preset not found: ${presetId}`);
  if (patch.lifecycle !== undefined && !TEMPLATE_LIFECYCLES.has(patch.lifecycle)) throw new Error("Preset lifecycle is not valid");
  const current = presentPreset(preset);
  let selectedSkills = null;
  if (patch.registrySkillIds !== undefined) {
    if (!Array.isArray(patch.registrySkillIds) || patch.registrySkillIds.length === 0) throw new Error("A template must contain at least one registry skill");
    selectedSkills = await getRegistrySkills(registryRoot, patch.registrySkillIds);
    const keys = selectedSkills.map((skill) => skill.lineage_id);
    if (new Set(keys).size !== keys.length) throw new Error("A template cannot contain multiple revisions of the same skill lineage");
  }
  const nextVersion = Math.max(...preset.versions.map((item) => item.version)) + 1;
  const snapshot = {
    version: nextVersion,
    registry_skill_ids: selectedSkills ? selectedSkills.map((skill) => skill.id) : current.registry_skill_ids,
    entries: selectedSkills ? templateEntries(selectedSkills) : current.entries,
    description: patch.description ?? current.description,
    purpose: patch.purpose ?? current.purpose,
    work_scope_tags: patch.workScopeTags === undefined ? current.work_scope_tags : uniqueStrings(patch.workScopeTags),
    template_notes: current.template_notes.map((note) => ({ ...note })),
    created_at: now(),
  };
  preset.name = patch.name ?? preset.name;
  preset.owner = patch.owner ?? preset.owner;
  preset.lifecycle = patch.lifecycle ?? preset.lifecycle;
  preset.versions.push(snapshot);
  preset.active_version = nextVersion;
  preset.registry_skill_ids = snapshot.registry_skill_ids;
  preset.entries = snapshot.entries;
  preset.description = snapshot.description;
  preset.purpose = snapshot.purpose;
  preset.work_scope_tags = snapshot.work_scope_tags;
  preset.updated_at = now();
  await saveCatalog(catalogRoot, catalog);
  return presentPreset(preset);
}

async function clonePresetTemplate({ catalogRoot, registryRoot, sourcePresetId, id, name, owner = null }) {
  const source = await getPreset(catalogRoot, sourcePresetId);
  if (source.id === PRISTINE_PRESET_ID) throw new Error("Pristine template cannot be cloned; create a template from selected registry skills");
  return createPreset({
    catalogRoot,
    registryRoot,
    id,
    name,
    description: source.description,
    purpose: source.purpose,
    workScopeTags: source.work_scope_tags,
    owner: owner ?? source.owner,
    lifecycle: "draft",
    registrySkillIds: source.registry_skill_ids,
  });
}

async function comparePresetVersions({ catalogRoot, presetId, leftVersion, rightVersion }) {
  const left = await getPreset(catalogRoot, presetId, leftVersion);
  const right = await getPreset(catalogRoot, presetId, rightVersion);
  const leftIds = new Set(left.registry_skill_ids);
  const rightIds = new Set(right.registry_skill_ids);
  return {
    preset_id: presetId,
    left_version: left.selected_version,
    right_version: right.selected_version,
    added_registry_skill_ids: [...rightIds].filter((id) => !leftIds.has(id)),
    removed_registry_skill_ids: [...leftIds].filter((id) => !rightIds.has(id)),
    retained_registry_skill_ids: [...rightIds].filter((id) => leftIds.has(id)),
  };
}

async function addPresetTemplateNote({ catalogRoot, presetId, body, author = "local" }) {
  if (typeof body !== "string" || body.trim() === "") throw new Error("Template note body is required");
  if (presetId === PRISTINE_PRESET_ID) throw new Error("Pristine template cannot be changed");
  const catalog = await loadCatalog(catalogRoot);
  const preset = catalog.presets.find((item) => item.id === presetId);
  if (!preset) throw new Error(`Preset not found: ${presetId}`);
  const note = { id: `template_note_${crypto.randomUUID()}`, body: body.trim(), author, created_at: now() };
  const current = presentPreset(preset);
  const nextVersion = Math.max(...preset.versions.map((item) => item.version)) + 1;
  const snapshot = {
    version: nextVersion,
    registry_skill_ids: [...current.registry_skill_ids],
    entries: current.entries.map((entry) => ({ ...entry })),
    description: current.description,
    purpose: current.purpose,
    work_scope_tags: [...current.work_scope_tags],
    template_notes: [...current.template_notes.map((item) => ({ ...item })), note],
    created_at: now(),
  };
  preset.versions.push(snapshot);
  preset.active_version = nextVersion;
  preset.registry_skill_ids = snapshot.registry_skill_ids;
  preset.entries = snapshot.entries;
  preset.template_notes = snapshot.template_notes;
  preset.updated_at = now();
  await saveCatalog(catalogRoot, catalog);
  return { ...note, template_version: nextVersion };
}

async function getProject(catalogRoot, projectId) {
  const catalog = await loadCatalog(catalogRoot);
  const project = catalog.projects.find((item) => item.id === projectId);
  if (!project) throw new Error(`Project not found: ${projectId}`);
  return project;
}

async function listProjectPresetAssignments(catalogRoot, projectId) {
  const project = await getProject(catalogRoot, projectId);
  return project.preset_assignments.slice().sort((left, right) => {
    if (left.role === "default") return -1;
    if (right.role === "default") return 1;
    return right.priority - left.priority || left.preset_id.localeCompare(right.preset_id);
  });
}

async function setProjectSkillOverride({
  catalogRoot,
  registryRoot,
  projectId,
  lineageId,
  registrySkillId,
  desiredState,
  updatedAt,
}) {
  projectId = requireIdentifier(projectId, "Project id");
  lineageId = requireIdentifier(lineageId, "Skill lineage id");
  registrySkillId = requireIdentifier(registrySkillId, "Registry skill id");
  if (!SKILL_OVERRIDE_STATES.has(desiredState)) {
    throw new Error("Project skill override desired state must be enabled or disabled");
  }

  const [registrySkill] = await getRegistrySkills(registryRoot, [registrySkillId]);
  if (registrySkill.lineage_id !== lineageId) {
    throw new Error(`Registry skill ${registrySkillId} does not belong to lineage ${lineageId}`);
  }

  const override = normalizeSkillOverride({
    lineage_id: lineageId,
    registry_skill_id: registrySkillId,
    desired_state: desiredState,
    updated_at: updatedAt ?? now(),
  });
  return withCatalogMutationLock(catalogRoot, async () => {
    const catalog = await loadCatalog(catalogRoot);
    const project = catalog.projects.find((item) => item.id === projectId);
    if (!project) throw new Error(`Project not found: ${projectId}`);
    const index = project.skill_overrides.findIndex((item) => item.lineage_id === lineageId);
    if (index < 0) project.skill_overrides.push(override);
    else project.skill_overrides[index] = override;
    project.skill_overrides = normalizeSkillOverrides(project.skill_overrides);
    project.updated_at = override.updated_at;
    await saveCatalog(catalogRoot, catalog);
    return override;
  });
}

async function clearProjectSkillOverride({ catalogRoot, registryRoot, projectId, lineageId }) {
  projectId = requireIdentifier(projectId, "Project id");
  lineageId = requireIdentifier(lineageId, "Skill lineage id");
  await getSkillLineage(registryRoot, lineageId);

  return withCatalogMutationLock(catalogRoot, async () => {
    const catalog = await loadCatalog(catalogRoot);
    const project = catalog.projects.find((item) => item.id === projectId);
    if (!project) throw new Error(`Project not found: ${projectId}`);
    const index = project.skill_overrides.findIndex((item) => item.lineage_id === lineageId);
    if (index < 0) {
      return { cleared: false, project_id: projectId, lineage_id: lineageId, override: null };
    }
    const [removed] = project.skill_overrides.splice(index, 1);
    project.updated_at = now();
    await saveCatalog(catalogRoot, catalog);
    return { cleared: true, project_id: projectId, lineage_id: lineageId, override: removed };
  });
}

function activationPlanDigest(plan) {
  return crypto.createHash("sha256").update(JSON.stringify(plan)).digest("hex");
}

async function recordActivationPlan({ catalogRoot, plan, projectId, assignments = [] }) {
  if (!plan?.plan_id) throw new Error("Activation plan id is required");
  const validation = validateActivationPlan(plan);
  if (!validation.valid) {
    const error = new Error("Activation plan cannot be recorded because it is invalid");
    error.issues = validation.issues;
    throw error;
  }
  return withCatalogMutationLock(catalogRoot, async () => {
    const catalog = await loadCatalog(catalogRoot);
    const effectiveProjectId = projectId ?? plan.target?.project_id;
    if (!effectiveProjectId || !catalog.projects.some((project) => project.id === effectiveProjectId)) {
      throw new Error("Activation plan must reference a registered project");
    }
    if (catalog.activation_plans.some((item) => item.plan_id === plan.plan_id)) {
      throw new Error(`Activation plan already recorded: ${plan.plan_id}`);
    }
    const record = {
      plan_id: plan.plan_id,
      project_id: effectiveProjectId,
      mode: plan.mode,
      created_at: plan.created_at,
      recorded_at: now(),
      digest: activationPlanDigest(plan),
      assignments: assignments.map((assignment) => ({ ...assignment })),
      plan,
    };
    catalog.activation_plans.push(record);
    await saveCatalog(catalogRoot, catalog);
    return record;
  });
}

async function recordActivationReport({ catalogRoot, planId, report }) {
  if (!report || typeof report !== "object") throw new Error("Activation report is required");
  if (report.plan_id && report.plan_id !== planId) throw new Error("Activation report plan id does not match");
  if (!Array.isArray(report.operations)) throw new Error("Activation report operations must be an array");
  if (!report.summary || typeof report.summary !== "object" || Array.isArray(report.summary)) {
    throw new Error("Activation report summary must be an object");
  }
  return withCatalogMutationLock(catalogRoot, async () => {
    const catalog = await loadCatalog(catalogRoot);
    if (!catalog.activation_plans.some((item) => item.plan_id === planId)) throw new Error(`Activation plan not found: ${planId}`);
    const record = {
      report_id: `activation_report_${crypto.randomUUID()}`,
      plan_id: planId,
      recorded_at: now(),
      status: report.status ?? (report.completed_at ? "completed" : "reported"),
      report: { ...report, plan_id: planId },
    };
    catalog.activation_reports.push(record);
    await saveCatalog(catalogRoot, catalog);
    return record;
  });
}

async function listActivationHistory({ catalogRoot, projectId, planId }) {
  const catalog = await loadCatalog(catalogRoot);
  const reportsByPlanId = new Map();
  for (const report of catalog.activation_reports) {
    const items = reportsByPlanId.get(report.plan_id) ?? [];
    items.push(report);
    reportsByPlanId.set(report.plan_id, items);
  }
  return catalog.activation_plans
    .filter((plan) => (!projectId || plan.project_id === projectId) && (!planId || plan.plan_id === planId))
    .sort((left, right) => right.recorded_at.localeCompare(left.recorded_at))
    .map((plan) => ({
      ...plan,
      reports: (reportsByPlanId.get(plan.plan_id) ?? []).slice().sort((left, right) => left.recorded_at.localeCompare(right.recorded_at)),
    }));
}

function createPlanFileName(plan) {
  return `activation-plan-${plan.plan_id}.json`;
}

module.exports = {
  CATALOG_SCHEMA_VERSION,
  PRISTINE_PRESET_ID,
  PROJECT_PRESET_ROLES,
  SKILL_OVERRIDE_STATES,
  assignPreset,
  addPresetTemplateNote,
  clearProjectSkillOverride,
  clonePresetTemplate,
  comparePresetVersions,
  createPlanFileName,
  createPreset,
  createProject,
  getPreset,
  getProject,
  listPresets,
  listProjectPresetAssignments,
  listActivationHistory,
  listProjects,
  loadCatalog,
  saveCatalog,
  setProjectSkillOverride,
  recordActivationPlan,
  recordActivationReport,
  replaceWorkScopeOverlay,
  TEMPLATE_LIFECYCLES,
  updatePresetTemplate,
};
