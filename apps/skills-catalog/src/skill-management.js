const crypto = require("node:crypto");
const { getSkillLineage, getSourceRevision, latestSkillsByArtifact, listRegistrySkills, listSkillLineages } = require("./registry");
const { getPreset, loadCatalog, saveCatalog } = require("./catalog-state");

const NOTE_SCOPES = new Set(["global", "project", "revision", "preset", "activation_run"]);
const NOTE_KINDS = new Set(["usage", "caveat", "decision", "dependency", "migration", "review"]);
const FEEDBACK_OUTCOMES = new Set(["success", "correction", "scope_mismatch", "freshness", "risk", "neutral"]);
const EVIDENCE_TYPES = new Set(["manual", "evaluation", "activation_report", "user_feedback", "incident"]);
const REDACTION_STATES = new Set(["none", "redacted", "withheld"]);
const RISK_LEVELS = new Set(["unknown", "low", "medium", "high", "critical"]);
const REVIEW_STATES = new Set(["unreviewed", "reviewed", "deprecated"]);
const VISIBILITIES = new Set(["private", "team"]);
const ARRAY_FIELDS = new Set(["use_when", "avoid_when", "tags", "domains", "work_scope_tags", "maintainers", "provider_constraints", "runtime_requirements"]);
const TEXT_FIELDS = new Set(["title", "summary", "purpose", "owner"]);

function timestamp() {
  return new Date().toISOString();
}

function optionalText(value, field) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") throw new Error(`${field} must be a string`);
  const normalized = value.trim();
  return normalized === "" ? null : normalized;
}

function stringList(value, field) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new Error(`${field} must be an array`);
  return [...new Set(value.map((item) => {
    if (typeof item !== "string" || item.trim() === "") throw new Error(`${field} must contain non-empty strings`);
    return item.trim();
  }))].sort((left, right) => left.localeCompare(right));
}

function defaultProfile(lineage, latestSkill) {
  return {
    lineage_id: lineage.id,
    title: lineage.skill_name,
    summary: latestSkill?.description ?? null,
    purpose: null,
    use_when: [],
    avoid_when: [],
    tags: [],
    domains: [],
    work_scope_tags: [],
    owner: null,
    maintainers: [],
    visibility: "private",
    provider_constraints: [],
    runtime_requirements: [],
    risk_level: "unknown",
    review_state: "unreviewed",
    reviewed_at: null,
    created_at: null,
    updated_at: null,
  };
}

function normalizeProfilePatch(patch) {
  const normalized = {};
  for (const field of TEXT_FIELDS) {
    const value = optionalText(patch[field], field);
    if (value !== undefined) normalized[field] = value;
  }
  for (const field of ARRAY_FIELDS) {
    const value = stringList(patch[field], field);
    if (value !== undefined) normalized[field] = value;
  }
  for (const [field, accepted] of [["visibility", VISIBILITIES], ["risk_level", RISK_LEVELS], ["review_state", REVIEW_STATES]]) {
    if (patch[field] === undefined) continue;
    if (!accepted.has(patch[field])) throw new Error(`${field} is not valid`);
    normalized[field] = patch[field];
  }
  return normalized;
}

async function skillContext(registryRoot) {
  const [lineages, skills] = await Promise.all([listSkillLineages(registryRoot), listRegistrySkills(registryRoot)]);
  const latestByLineage = new Map();
  for (const skill of latestSkillsByArtifact(skills)) latestByLineage.set(skill.lineage_id, skill);
  return { lineages, latestByLineage };
}

async function getSkillProfile({ catalogRoot, registryRoot, lineageId }) {
  const [catalog, lineage, context] = await Promise.all([
    loadCatalog(catalogRoot),
    getSkillLineage(registryRoot, lineageId),
    skillContext(registryRoot),
  ]);
  const profile = catalog.skill_profiles.find((item) => item.lineage_id === lineage.id);
  return { ...defaultProfile(lineage, context.latestByLineage.get(lineage.id)), ...profile };
}

async function updateSkillProfile({ catalogRoot, registryRoot, lineageId, patch }) {
  const profilePatch = normalizeProfilePatch(patch);
  if (Object.keys(profilePatch).length === 0) throw new Error("At least one profile field is required");
  const [catalog, lineage, context] = await Promise.all([
    loadCatalog(catalogRoot),
    getSkillLineage(registryRoot, lineageId),
    skillContext(registryRoot),
  ]);
  const index = catalog.skill_profiles.findIndex((item) => item.lineage_id === lineage.id);
  const existing = index < 0
    ? defaultProfile(lineage, context.latestByLineage.get(lineage.id))
    : catalog.skill_profiles[index];
  const updatedAt = timestamp();
  const profile = {
    ...existing,
    ...profilePatch,
    lineage_id: lineage.id,
    created_at: existing.created_at ?? updatedAt,
    updated_at: updatedAt,
  };
  if (profile.review_state === "reviewed" && !profile.reviewed_at) profile.reviewed_at = updatedAt;
  if (profilePatch.review_state && profilePatch.review_state !== "reviewed") profile.reviewed_at = null;
  if (index < 0) catalog.skill_profiles.push(profile);
  else catalog.skill_profiles[index] = profile;
  await saveCatalog(catalogRoot, catalog);
  return profile;
}

function validateNoteTarget(note) {
  if (!NOTE_SCOPES.has(note.scope)) throw new Error("Note scope is not valid");
  if (!NOTE_KINDS.has(note.kind)) throw new Error("Note kind is not valid");
  if (typeof note.body !== "string" || note.body.trim() === "") throw new Error("Note body is required");
  const requiredByScope = {
    project: "project_id",
    revision: "source_revision_id",
    preset: "preset_id",
    activation_run: "activation_plan_id",
  };
  const requiredField = requiredByScope[note.scope];
  if (requiredField && (typeof note[requiredField] !== "string" || note[requiredField].trim() === "")) {
    throw new Error(`${requiredField} is required for ${note.scope} notes`);
  }
}

async function addSkillNote({ catalogRoot, registryRoot, lineageId, scope = "global", kind = "usage", body, author = "local", projectId = null, sourceRevisionId = null, presetId = null, activationPlanId = null, visibility = "private", injectIntoPrompt = false }) {
  await getSkillLineage(registryRoot, lineageId);
  if (!VISIBILITIES.has(visibility)) throw new Error("Note visibility is not valid");
  const note = {
    id: `note_${crypto.randomUUID()}`,
    lineage_id: lineageId,
    scope,
    kind,
    body: typeof body === "string" ? body.trim() : body,
    author: typeof author === "string" && author.trim() ? author.trim() : "local",
    project_id: projectId,
    source_revision_id: sourceRevisionId,
    preset_id: presetId,
    activation_plan_id: activationPlanId,
    visibility,
    inject_into_prompt: injectIntoPrompt === true,
    version: 1,
    history: [],
    created_at: timestamp(),
    updated_at: timestamp(),
  };
  validateNoteTarget(note);
  const catalog = await loadCatalog(catalogRoot);
  if (note.scope === "project" && !catalog.projects.some((project) => project.id === note.project_id)) {
    throw new Error(`Project not found for note: ${note.project_id}`);
  }
  if (note.scope === "preset") await getPreset(catalogRoot, note.preset_id);
  if (note.scope === "revision") await getSourceRevision(registryRoot, note.source_revision_id);
  catalog.skill_notes.push(note);
  await saveCatalog(catalogRoot, catalog);
  return note;
}

async function editSkillNote({ catalogRoot, noteId, body, kind, visibility, injectIntoPrompt }) {
  const catalog = await loadCatalog(catalogRoot);
  const note = catalog.skill_notes.find((item) => item.id === noteId);
  if (!note) throw new Error(`Skill note not found: ${noteId}`);
  const nextBody = body === undefined ? note.body : optionalText(body, "body");
  const nextKind = kind ?? note.kind;
  const nextVisibility = visibility ?? note.visibility;
  if (!NOTE_KINDS.has(nextKind)) throw new Error("Note kind is not valid");
  if (!VISIBILITIES.has(nextVisibility)) throw new Error("Note visibility is not valid");
  if (!nextBody) throw new Error("Note body is required");
  note.history.push({
    version: note.version,
    body: note.body,
    kind: note.kind,
    visibility: note.visibility,
    inject_into_prompt: note.inject_into_prompt,
    changed_at: timestamp(),
  });
  note.body = nextBody;
  note.kind = nextKind;
  note.visibility = nextVisibility;
  if (injectIntoPrompt !== undefined) note.inject_into_prompt = injectIntoPrompt === true;
  note.version += 1;
  note.updated_at = timestamp();
  await saveCatalog(catalogRoot, catalog);
  return note;
}

async function deleteSkillNote({ catalogRoot, noteId, author = "local" }) {
  const catalog = await loadCatalog(catalogRoot);
  const note = catalog.skill_notes.find((item) => item.id === noteId);
  if (!note) throw new Error(`Skill note not found: ${noteId}`);
  if (note.deleted_at) return note;
  note.deleted_at = timestamp();
  note.deleted_by = typeof author === "string" && author.trim() ? author.trim() : "local";
  note.updated_at = note.deleted_at;
  await saveCatalog(catalogRoot, catalog);
  return note;
}

async function restoreSkillNote({ catalogRoot, noteId }) {
  const catalog = await loadCatalog(catalogRoot);
  const note = catalog.skill_notes.find((item) => item.id === noteId);
  if (!note) throw new Error(`Skill note not found: ${noteId}`);
  note.deleted_at = null;
  note.deleted_by = null;
  note.updated_at = timestamp();
  await saveCatalog(catalogRoot, catalog);
  return note;
}

async function listSkillNotes({ catalogRoot, lineageId, scope, projectId, presetId, sourceRevisionId, includeDeleted = false }) {
  const catalog = await loadCatalog(catalogRoot);
  return catalog.skill_notes.filter((note) => {
    if (!includeDeleted && note.deleted_at) return false;
    if (lineageId && note.lineage_id !== lineageId) return false;
    if (scope && note.scope !== scope) return false;
    if (projectId && note.project_id !== projectId) return false;
    if (presetId && note.preset_id !== presetId) return false;
    if (sourceRevisionId && note.source_revision_id !== sourceRevisionId) return false;
    return true;
  }).sort((left, right) => right.updated_at.localeCompare(left.updated_at));
}

function validateFeedbackTarget(feedback) {
  if (!NOTE_SCOPES.has(feedback.scope)) throw new Error("Feedback scope is not valid");
  if (!FEEDBACK_OUTCOMES.has(feedback.outcome)) throw new Error("Feedback outcome is not valid");
  if (!EVIDENCE_TYPES.has(feedback.evidence_type)) throw new Error("Feedback evidence type is not valid");
  if (!REDACTION_STATES.has(feedback.redaction)) throw new Error("Feedback redaction state is not valid");
  if (typeof feedback.summary !== "string" || feedback.summary.trim() === "") throw new Error("Feedback summary is required");
  const requiredByScope = {
    project: "project_id",
    revision: "source_revision_id",
    preset: "preset_id",
    activation_run: "activation_plan_id",
  };
  const requiredField = requiredByScope[feedback.scope];
  if (requiredField && (typeof feedback[requiredField] !== "string" || feedback[requiredField].trim() === "")) {
    throw new Error(`${requiredField} is required for ${feedback.scope} feedback`);
  }
}

function normalizeFeedbackMetrics(metrics) {
  if (metrics === undefined || metrics === null) return {};
  if (!metrics || typeof metrics !== "object" || Array.isArray(metrics)) throw new Error("Feedback metrics must be an object");
  const normalized = {};
  for (const field of ["attempted", "successful", "corrections", "scope_mismatches", "freshness_issues", "risk_events"]) {
    if (metrics[field] === undefined) continue;
    const value = Number(metrics[field]);
    if (!Number.isInteger(value) || value < 0) throw new Error(`Feedback metric ${field} must be a non-negative integer`);
    normalized[field] = value;
  }
  for (const field of Object.keys(metrics)) {
    if (!(field in normalized)) throw new Error(`Feedback metric is not supported: ${field}`);
  }
  return normalized;
}

async function addSkillFeedback({
  catalogRoot,
  registryRoot,
  lineageId,
  scope = "global",
  outcome = "neutral",
  evidenceType = "manual",
  summary,
  details = null,
  author = "local",
  projectId = null,
  sourceRevisionId = null,
  presetId = null,
  activationPlanId = null,
  redaction = "none",
  metrics,
}) {
  await getSkillLineage(registryRoot, lineageId);
  const feedback = {
    id: `feedback_${crypto.randomUUID()}`,
    lineage_id: lineageId,
    scope,
    outcome,
    evidence_type: evidenceType,
    summary: typeof summary === "string" ? summary.trim() : summary,
    details: optionalText(details, "details"),
    author: typeof author === "string" && author.trim() ? author.trim() : "local",
    project_id: projectId,
    source_revision_id: sourceRevisionId,
    preset_id: presetId,
    activation_plan_id: activationPlanId,
    redaction,
    metrics: normalizeFeedbackMetrics(metrics),
    created_at: timestamp(),
  };
  validateFeedbackTarget(feedback);
  const catalog = await loadCatalog(catalogRoot);
  if (feedback.scope === "project" && !catalog.projects.some((project) => project.id === feedback.project_id)) {
    throw new Error(`Project not found for feedback: ${feedback.project_id}`);
  }
  if (feedback.scope === "preset") await getPreset(catalogRoot, feedback.preset_id);
  if (feedback.scope === "revision") await getSourceRevision(registryRoot, feedback.source_revision_id);
  if (feedback.scope === "activation_run" && !catalog.activation_plans.some((plan) => plan.plan_id === feedback.activation_plan_id)) {
    throw new Error(`Activation plan not found for feedback: ${feedback.activation_plan_id}`);
  }
  catalog.skill_feedback.push(feedback);
  await saveCatalog(catalogRoot, catalog);
  return feedback;
}

async function listSkillFeedback({ catalogRoot, lineageId, scope, outcome, evidenceType, projectId, presetId, sourceRevisionId, activationPlanId }) {
  const catalog = await loadCatalog(catalogRoot);
  return catalog.skill_feedback.filter((feedback) => {
    if (lineageId && feedback.lineage_id !== lineageId) return false;
    if (scope && feedback.scope !== scope) return false;
    if (outcome && feedback.outcome !== outcome) return false;
    if (evidenceType && feedback.evidence_type !== evidenceType) return false;
    if (projectId && feedback.project_id !== projectId) return false;
    if (presetId && feedback.preset_id !== presetId) return false;
    if (sourceRevisionId && feedback.source_revision_id !== sourceRevisionId) return false;
    if (activationPlanId && feedback.activation_plan_id !== activationPlanId) return false;
    return true;
  }).sort((left, right) => right.created_at.localeCompare(left.created_at));
}

function emptyCounts(keys) {
  return Object.fromEntries([...keys].sort().map((key) => [key, 0]));
}

async function getSkillFeedbackSummary({ catalogRoot, registryRoot, lineageId, projectId, sourceRevisionId }) {
  await getSkillLineage(registryRoot, lineageId);
  const feedback = await listSkillFeedback({ catalogRoot, lineageId, projectId, sourceRevisionId });
  const byOutcome = emptyCounts(FEEDBACK_OUTCOMES);
  const byEvidenceType = emptyCounts(EVIDENCE_TYPES);
  const reportedMetrics = { attempted: 0, successful: 0, corrections: 0, scope_mismatches: 0, freshness_issues: 0, risk_events: 0 };
  for (const item of feedback) {
    byOutcome[item.outcome] += 1;
    byEvidenceType[item.evidence_type] += 1;
    for (const [name, value] of Object.entries(item.metrics ?? {})) reportedMetrics[name] += value;
  }
  const signalCount = byOutcome.success + byOutcome.correction + byOutcome.scope_mismatch + byOutcome.freshness + byOutcome.risk;
  const successRate = signalCount === 0 ? null : Number((byOutcome.success / signalCount).toFixed(3));
  const health = feedback.length === 0 ? "unknown"
    : (byOutcome.risk > 0 || byOutcome.scope_mismatch > byOutcome.success || byOutcome.freshness > byOutcome.success ? "needs_review" : "healthy");
  return {
    lineage_id: lineageId,
    project_id: projectId ?? null,
    source_revision_id: sourceRevisionId ?? null,
    total_feedback: feedback.length,
    by_outcome: byOutcome,
    by_evidence_type: byEvidenceType,
    reported_metrics: reportedMetrics,
    success_rate: successRate,
    health,
    latest_feedback_at: feedback[0]?.created_at ?? null,
  };
}

async function searchSkills({ catalogRoot, registryRoot, query = "", tags = [], domains = [], providerId, reviewState }) {
  const [catalog, context] = await Promise.all([loadCatalog(catalogRoot), skillContext(registryRoot)]);
  const queryText = query.trim().toLocaleLowerCase();
  const expectedTags = stringList(tags, "tags") ?? [];
  const expectedDomains = stringList(domains, "domains") ?? [];
  const profiles = new Map(catalog.skill_profiles.map((profile) => [profile.lineage_id, profile]));
  const notes = new Map();
  for (const note of catalog.skill_notes) {
    if (!note.deleted_at) notes.set(note.lineage_id, [...(notes.get(note.lineage_id) ?? []), note]);
  }
  return context.lineages.map((lineage) => {
    const latestSkill = context.latestByLineage.get(lineage.id);
    const profile = { ...defaultProfile(lineage, latestSkill), ...profiles.get(lineage.id) };
    const skillNotes = notes.get(lineage.id) ?? [];
    return { lineage, latest_skill: latestSkill ?? null, profile, notes: skillNotes };
  }).filter((entry) => {
    if (expectedTags.some((tag) => !entry.profile.tags.includes(tag))) return false;
    if (expectedDomains.some((domain) => !entry.profile.domains.includes(domain))) return false;
    if (providerId && !entry.profile.provider_constraints.includes(providerId)) return false;
    if (reviewState && entry.profile.review_state !== reviewState) return false;
    if (!queryText) return true;
    const haystack = [
      entry.lineage.skill_name,
      entry.latest_skill?.description,
      entry.profile.title,
      entry.profile.summary,
      entry.profile.purpose,
      ...entry.profile.use_when,
      ...entry.profile.avoid_when,
      ...entry.profile.tags,
      ...entry.profile.domains,
      ...entry.notes.map((note) => note.body),
    ].filter(Boolean).join("\n").toLocaleLowerCase();
    return haystack.includes(queryText);
  }).sort((left, right) => left.profile.title.localeCompare(right.profile.title));
}

module.exports = {
  NOTE_KINDS,
  NOTE_SCOPES,
  EVIDENCE_TYPES,
  FEEDBACK_OUTCOMES,
  REDACTION_STATES,
  REVIEW_STATES,
  RISK_LEVELS,
  VISIBILITIES,
  addSkillFeedback,
  addSkillNote,
  deleteSkillNote,
  editSkillNote,
  getSkillProfile,
  getSkillFeedbackSummary,
  listSkillFeedback,
  listSkillNotes,
  searchSkills,
  restoreSkillNote,
  updateSkillProfile,
};
