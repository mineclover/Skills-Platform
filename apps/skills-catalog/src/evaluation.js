const crypto = require("node:crypto");
const { getSkillLineage, listSkillLineages, listSkillRevisions } = require("./registry");
const { loadCatalog, saveCatalog } = require("./catalog-state");
const { getSkillFeedbackSummary, getSkillProfile } = require("./skill-management");

const EVALUATION_LIFECYCLES = new Set(["draft", "active", "retired"]);
const EVALUATION_OUTCOMES = new Set(["passed", "failed", "blocked"]);
const CRITERION_OUTCOMES = new Set(["passed", "failed", "skipped"]);

function timestamp() {
  return new Date().toISOString();
}

function requiredText(value, field) {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${field} is required`);
  return value.trim();
}

function optionalText(value, field) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") throw new Error(`${field} must be a string`);
  const normalized = value.trim();
  return normalized || null;
}

function criteriaList(criteria) {
  if (!Array.isArray(criteria) || criteria.length === 0) throw new Error("Evaluation criteria must be a non-empty array");
  const normalized = criteria.map((criterion) => requiredText(criterion, "Evaluation criterion"));
  if (new Set(normalized).size !== normalized.length) throw new Error("Evaluation criteria must be unique");
  return normalized;
}

function caseSnapshot(evaluationCase, version) {
  return {
    version,
    objective: evaluationCase.objective,
    criteria: [...evaluationCase.criteria],
    created_at: timestamp(),
  };
}

function presentCase(evaluationCase, version = evaluationCase.active_version) {
  const snapshot = evaluationCase.versions.find((item) => item.version === Number(version));
  if (!snapshot) throw new Error(`Evaluation case version not found: ${evaluationCase.id}@${version}`);
  return { ...evaluationCase, ...snapshot, selected_version: snapshot.version };
}

async function createEvaluationCase({ catalogRoot, registryRoot, id, lineageId, name, objective, criteria, owner = "local", lifecycle = "draft" }) {
  id = requiredText(id, "Evaluation case id");
  name = requiredText(name, "Evaluation case name");
  objective = requiredText(objective, "Evaluation objective");
  if (!EVALUATION_LIFECYCLES.has(lifecycle)) throw new Error("Evaluation lifecycle is not valid");
  await getSkillLineage(registryRoot, lineageId);
  const catalog = await loadCatalog(catalogRoot);
  if (catalog.evaluation_cases.some((item) => item.id === id)) throw new Error(`Evaluation case already exists: ${id}`);
  const evaluationCase = {
    id,
    lineage_id: lineageId,
    name,
    owner: optionalText(owner, "Evaluation owner") ?? "local",
    lifecycle,
    objective,
    criteria: criteriaList(criteria),
    active_version: 1,
    versions: [],
    created_at: timestamp(),
    updated_at: timestamp(),
  };
  evaluationCase.versions.push(caseSnapshot(evaluationCase, 1));
  catalog.evaluation_cases.push(evaluationCase);
  await saveCatalog(catalogRoot, catalog);
  return presentCase(evaluationCase);
}

async function getEvaluationCase({ catalogRoot, caseId, version }) {
  const catalog = await loadCatalog(catalogRoot);
  const evaluationCase = catalog.evaluation_cases.find((item) => item.id === caseId);
  if (!evaluationCase) throw new Error(`Evaluation case not found: ${caseId}`);
  return presentCase(evaluationCase, version);
}

async function listEvaluationCases({ catalogRoot, lineageId, lifecycle, includeRetired = false }) {
  const catalog = await loadCatalog(catalogRoot);
  return catalog.evaluation_cases
    .filter((item) => (!lineageId || item.lineage_id === lineageId) && (!lifecycle || item.lifecycle === lifecycle) && (includeRetired || item.lifecycle !== "retired"))
    .map((item) => presentCase(item))
    .sort((left, right) => left.name.localeCompare(right.name));
}

async function updateEvaluationCase({ catalogRoot, caseId, name, owner, lifecycle, objective, criteria }) {
  const catalog = await loadCatalog(catalogRoot);
  const evaluationCase = catalog.evaluation_cases.find((item) => item.id === caseId);
  if (!evaluationCase) throw new Error(`Evaluation case not found: ${caseId}`);
  if ([name, owner, lifecycle, objective, criteria].every((item) => item === undefined)) throw new Error("At least one evaluation case field is required");
  if (lifecycle !== undefined && !EVALUATION_LIFECYCLES.has(lifecycle)) throw new Error("Evaluation lifecycle is not valid");
  const nextObjective = objective === undefined ? evaluationCase.objective : requiredText(objective, "Evaluation objective");
  const nextCriteria = criteria === undefined ? evaluationCase.criteria : criteriaList(criteria);
  const definitionChanged = nextObjective !== evaluationCase.objective || JSON.stringify(nextCriteria) !== JSON.stringify(evaluationCase.criteria);
  if (name !== undefined) evaluationCase.name = requiredText(name, "Evaluation case name");
  if (owner !== undefined) evaluationCase.owner = optionalText(owner, "Evaluation owner");
  if (lifecycle !== undefined) evaluationCase.lifecycle = lifecycle;
  if (definitionChanged) {
    evaluationCase.objective = nextObjective;
    evaluationCase.criteria = nextCriteria;
    evaluationCase.active_version = Math.max(...evaluationCase.versions.map((item) => item.version)) + 1;
    evaluationCase.versions.push(caseSnapshot(evaluationCase, evaluationCase.active_version));
  }
  evaluationCase.updated_at = timestamp();
  await saveCatalog(catalogRoot, catalog);
  return presentCase(evaluationCase);
}

function normalizeCriterionResults(criteria, results) {
  if (!Array.isArray(results)) throw new Error("Criterion results must be an array");
  const byCriterion = new Map();
  for (const result of results) {
    if (!result || typeof result !== "object" || Array.isArray(result)) throw new Error("Criterion result must be an object");
    const criterion = requiredText(result.criterion, "Criterion result criterion");
    if (!CRITERION_OUTCOMES.has(result.outcome)) throw new Error("Criterion result outcome is not valid");
    if (byCriterion.has(criterion)) throw new Error(`Duplicate criterion result: ${criterion}`);
    byCriterion.set(criterion, { criterion, outcome: result.outcome, notes: optionalText(result.notes, "Criterion result notes") ?? null });
  }
  if (byCriterion.size !== criteria.length || criteria.some((criterion) => !byCriterion.has(criterion))) {
    throw new Error("Criterion results must cover every evaluation criterion exactly once");
  }
  return criteria.map((criterion) => byCriterion.get(criterion));
}

async function recordEvaluationRun({ catalogRoot, registryRoot, caseId, version, sourceRevisionId, outcome, summary, details = null, author = "local", criterionResults }) {
  const evaluationCase = await getEvaluationCase({ catalogRoot, caseId, version });
  if (!EVALUATION_OUTCOMES.has(outcome)) throw new Error("Evaluation outcome is not valid");
  const revisions = await listSkillRevisions({ registryRoot, lineageId: evaluationCase.lineage_id });
  if (!revisions.some((revision) => revision.source_revision_id === sourceRevisionId)) {
    throw new Error(`Source revision is not available for evaluation case lineage: ${sourceRevisionId}`);
  }
  const run = {
    id: `evaluation_run_${crypto.randomUUID()}`,
    case_id: evaluationCase.id,
    case_version: evaluationCase.selected_version,
    lineage_id: evaluationCase.lineage_id,
    source_revision_id: sourceRevisionId,
    outcome,
    summary: requiredText(summary, "Evaluation summary"),
    details: optionalText(details, "Evaluation details") ?? null,
    author: optionalText(author, "Evaluation author") ?? "local",
    criterion_results: normalizeCriterionResults(evaluationCase.criteria, criterionResults),
    created_at: timestamp(),
  };
  const catalog = await loadCatalog(catalogRoot);
  catalog.evaluation_runs.push(run);
  await saveCatalog(catalogRoot, catalog);
  return run;
}

async function listEvaluationRuns({ catalogRoot, lineageId, caseId, sourceRevisionId, outcome }) {
  const catalog = await loadCatalog(catalogRoot);
  return catalog.evaluation_runs.filter((run) => {
    if (lineageId && run.lineage_id !== lineageId) return false;
    if (caseId && run.case_id !== caseId) return false;
    if (sourceRevisionId && run.source_revision_id !== sourceRevisionId) return false;
    if (outcome && run.outcome !== outcome) return false;
    return true;
  }).sort((left, right) => right.created_at.localeCompare(left.created_at));
}

async function getSkillEvaluationSummary({ catalogRoot, registryRoot, lineageId, sourceRevisionId }) {
  await getSkillLineage(registryRoot, lineageId);
  const [cases, runs] = await Promise.all([
    listEvaluationCases({ catalogRoot, lineageId }),
    listEvaluationRuns({ catalogRoot, lineageId, sourceRevisionId }),
  ]);
  const byOutcome = { passed: 0, failed: 0, blocked: 0 };
  for (const run of runs) byOutcome[run.outcome] += 1;
  const completed = byOutcome.passed + byOutcome.failed;
  const activeCases = cases.filter((item) => item.lifecycle === "active");
  const activeVersions = new Map(activeCases.map((item) => [item.id, item.selected_version]));
  const evaluatedActiveCaseIds = new Set(runs
    .filter((run) => activeVersions.get(run.case_id) === run.case_version)
    .map((run) => run.case_id));
  return {
    lineage_id: lineageId,
    source_revision_id: sourceRevisionId ?? null,
    active_case_count: activeCases.length,
    evaluated_active_case_count: evaluatedActiveCaseIds.size,
    total_runs: runs.length,
    by_outcome: byOutcome,
    pass_rate: completed === 0 ? null : Number((byOutcome.passed / completed).toFixed(3)),
    latest_run_at: runs[0]?.created_at ?? null,
    latest_outcome: runs[0]?.outcome ?? null,
  };
}

function reviewReason(code, severity, detail) {
  return { code, severity, detail };
}

async function listReviewQueue({ catalogRoot, registryRoot }) {
  const lineages = await listSkillLineages(registryRoot);
  const severityRank = { critical: 0, high: 1, medium: 2, low: 3 };
  const items = await Promise.all(lineages.map(async (lineage) => {
    const revisions = await listSkillRevisions({ registryRoot, lineageId: lineage.id });
    const latestRevision = revisions.at(-1)?.source_revision_id ?? null;
    const [profile, feedback, evaluations] = await Promise.all([
      getSkillProfile({ catalogRoot, registryRoot, lineageId: lineage.id }),
      getSkillFeedbackSummary({ catalogRoot, registryRoot, lineageId: lineage.id }),
      getSkillEvaluationSummary({ catalogRoot, registryRoot, lineageId: lineage.id, sourceRevisionId: latestRevision }),
    ]);
    const reasons = [];
    if (profile.review_state === "unreviewed") reasons.push(reviewReason("unreviewed_profile", "medium", "The skill profile has not been reviewed."));
    if (["high", "critical"].includes(profile.risk_level)) reasons.push(reviewReason("profile_risk", profile.risk_level, `Profile risk is ${profile.risk_level}.`));
    if (feedback.health === "needs_review") reasons.push(reviewReason("feedback_health", "high", "Recorded feedback contains risk, freshness, or scope-mismatch signals."));
    if (evaluations.active_case_count > evaluations.evaluated_active_case_count) reasons.push(reviewReason("unevaluated_current_revision", "medium", "The latest source revision has no recorded result for every active evaluation case version."));
    if (["failed", "blocked"].includes(evaluations.latest_outcome)) reasons.push(reviewReason("evaluation_outcome", evaluations.latest_outcome === "failed" ? "high" : "medium", `Latest evaluation ${evaluations.latest_outcome}.`));
    if (reasons.length === 0) return null;
    const severity = reasons.slice().sort((left, right) => severityRank[left.severity] - severityRank[right.severity])[0].severity;
    return { lineage, latest_source_revision_id: latestRevision, severity, reasons, profile, feedback, evaluations };
  }));
  return items.filter(Boolean).sort((left, right) => severityRank[left.severity] - severityRank[right.severity] || left.lineage.skill_name.localeCompare(right.lineage.skill_name));
}

module.exports = {
  CRITERION_OUTCOMES,
  EVALUATION_LIFECYCLES,
  EVALUATION_OUTCOMES,
  createEvaluationCase,
  getEvaluationCase,
  getSkillEvaluationSummary,
  listEvaluationCases,
  listEvaluationRuns,
  listReviewQueue,
  recordEvaluationRun,
  updateEvaluationCase,
};
