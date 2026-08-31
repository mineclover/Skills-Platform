const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

function defaultRootDir() {
  return path.resolve(__dirname, "..", "..", "..");
}

function defaultLedgersDir(rootDir = defaultRootDir()) {
  return path.join(rootDir, ".skills-platform", "ledgers");
}

function planDirectory(planId, rootDir = defaultRootDir()) {
  return path.join(defaultLedgersDir(rootDir), planId);
}

function timestamp() {
  return new Date().toISOString();
}

function sha256(data) {
  return crypto.createHash("sha256").update(typeof data === "string" ? data : JSON.stringify(data)).digest("hex");
}

/**
 * Write a JSON file atomically via temp file and rename
 */
async function writeJsonAtomic(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp-${Date.now()}`;
  await fs.writeFile(tempPath, JSON.stringify(data, null, 2), "utf8");
  await fs.rename(tempPath, filePath);
}

/**
 * Read JSON file safely, returns null if missing
 */
async function readJsonSafe(filePath) {
  try {
    const content = await fs.readFile(filePath, "utf8");
    return JSON.parse(content);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

/**
 * Append an event to events.ndjson
 */
async function appendLedgerEvent(planId, { phase, actor = "system", action, payload = {} }, rootDir = defaultRootDir()) {
  const dir = planDirectory(planId, rootDir);
  await fs.mkdir(dir, { recursive: true });
  const eventsFile = path.join(dir, "events.ndjson");
  const event = {
    event_id: `evt-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`,
    plan_id: planId,
    timestamp: timestamp(),
    phase: phase || "UNSPECIFIED",
    actor,
    action,
    payload,
    checksum: sha256({ planId, action, payload }),
  };
  await fs.appendFile(eventsFile, `${JSON.stringify(event)}\n`, "utf8");
  return event;
}

/**
 * Create a new Plan Ledger
 */
async function createPlan({
  planId,
  title,
  contract = null,
  rootDir = defaultRootDir(),
  actor = "user",
} = {}) {
  const resolvedPlanId = planId || `plan-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
  const dir = planDirectory(resolvedPlanId, rootDir);

  const existing = await readJsonSafe(path.join(dir, "manifest.json"));
  if (existing) {
    throw new Error(`Plan already exists: ${resolvedPlanId}`);
  }

  const manifest = {
    plan_id: resolvedPlanId,
    title: title || resolvedPlanId,
    current_phase: "P01_CONTRACT_COMPILER",
    status: "active",
    is_complete: false,
    created_at: timestamp(),
    updated_at: timestamp(),
  };

  const initialContract = contract || {
    contract_id: `contract-${resolvedPlanId}`,
    version: 1,
    goal: { statement: title || "Unspecified goal" },
    deliverables: [],
    acceptance_checks: [],
    non_goals: [],
    stop_conditions: [],
  };

  const initialLedger = {
    plan_id: resolvedPlanId,
    updated_at: timestamp(),
    obligations: [],
  };

  const initialVerifications = {
    plan_id: resolvedPlanId,
    updated_at: timestamp(),
    records: [],
  };

  await writeJsonAtomic(path.join(dir, "manifest.json"), manifest);
  await writeJsonAtomic(path.join(dir, "contract.json"), initialContract);
  await writeJsonAtomic(path.join(dir, "ledger.json"), initialLedger);
  await writeJsonAtomic(path.join(dir, "verifications.json"), initialVerifications);

  await appendLedgerEvent(
    resolvedPlanId,
    { phase: "P01_CONTRACT_COMPILER", actor, action: "PLAN_CREATED", payload: { title, manifest } },
    rootDir
  );

  return getPlan(resolvedPlanId, rootDir);
}

/**
 * Get the full 7-state plan snapshot
 */
async function getPlan(planId, rootDir = defaultRootDir()) {
  const dir = planDirectory(planId, rootDir);
  const manifest = await readJsonSafe(path.join(dir, "manifest.json"));
  if (!manifest) {
    throw new Error(`Plan not found: ${planId}`);
  }

  const [contract, context, ledger, binding, verifications, certificate] = await Promise.all([
    readJsonSafe(path.join(dir, "contract.json")),
    readJsonSafe(path.join(dir, "context.json")),
    readJsonSafe(path.join(dir, "ledger.json")),
    readJsonSafe(path.join(dir, "binding.json")),
    readJsonSafe(path.join(dir, "verifications.json")),
    readJsonSafe(path.join(dir, "certificate.json")),
  ]);

  return {
    manifest,
    contract: contract || null,
    context: context || null,
    ledger: ledger?.obligations || [],
    binding: binding || null,
    verifications: verifications?.records || [],
    certificate: certificate || null,
  };
}

/**
 * List all plans with progress summary
 */
async function listPlans({ filter = {}, rootDir = defaultRootDir() } = {}) {
  const baseDir = defaultLedgersDir(rootDir);
  await fs.mkdir(baseDir, { recursive: true });
  const entries = await fs.readdir(baseDir, { withFileTypes: true });

  const summaries = [];
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const manifest = await readJsonSafe(path.join(baseDir, entry.name, "manifest.json"));
      if (manifest) {
        if (filter.status && manifest.status !== filter.status) continue;
        if (filter.phase && manifest.current_phase !== filter.phase) continue;
        if (filter.is_complete !== undefined && manifest.is_complete !== filter.is_complete) continue;
        summaries.push(manifest);
      }
    }
  }

  return summaries.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

/**
 * Delete a plan directory
 */
async function deletePlan(planId, rootDir = defaultRootDir()) {
  const dir = planDirectory(planId, rootDir);
  await fs.rm(dir, { recursive: true, force: true });
  return { deleted: true, plan_id: planId };
}

/**
 * Update the plan completion contract (Phase 1)
 */
async function updatePlanContract(planId, contract, { actor = "system", rootDir = defaultRootDir() } = {}) {
  const dir = planDirectory(planId, rootDir);
  const manifest = await readJsonSafe(path.join(dir, "manifest.json"));
  if (!manifest) throw new Error(`Plan not found: ${planId}`);

  await writeJsonAtomic(path.join(dir, "contract.json"), contract);

  manifest.current_phase = "P01_CONTRACT_COMPILER";
  manifest.updated_at = timestamp();
  await writeJsonAtomic(path.join(dir, "manifest.json"), manifest);

  await appendLedgerEvent(
    planId,
    { phase: "P01_CONTRACT_COMPILER", actor, action: "CONTRACT_UPDATED", payload: { contract_id: contract.contract_id } },
    rootDir
  );

  return getPlan(planId, rootDir);
}

/**
 * Update horizontal exploration context (Phase 2)
 */
async function updatePlanContext(planId, context, { actor = "system", rootDir = defaultRootDir() } = {}) {
  const dir = planDirectory(planId, rootDir);
  const manifest = await readJsonSafe(path.join(dir, "manifest.json"));
  if (!manifest) throw new Error(`Plan not found: ${planId}`);

  await writeJsonAtomic(path.join(dir, "context.json"), context);

  manifest.current_phase = "P02_HORIZONTAL_EXPLORER";
  manifest.updated_at = timestamp();
  await writeJsonAtomic(path.join(dir, "manifest.json"), manifest);

  await appendLedgerEvent(
    planId,
    { phase: "P02_HORIZONTAL_EXPLORER", actor, action: "CONTEXT_UPDATED", payload: { topics_count: context.topic_candidates?.length || 0 } },
    rootDir
  );

  return getPlan(planId, rootDir);
}

/**
 * Update obligations in progress ledger (Phase 3)
 */
async function updatePlanObligations(planId, obligations, { actor = "system", rootDir = defaultRootDir() } = {}) {
  const dir = planDirectory(planId, rootDir);
  const manifest = await readJsonSafe(path.join(dir, "manifest.json"));
  if (!manifest) throw new Error(`Plan not found: ${planId}`);

  const ledgerData = {
    plan_id: planId,
    updated_at: timestamp(),
    obligations,
  };

  await writeJsonAtomic(path.join(dir, "ledger.json"), ledgerData);

  manifest.current_phase = "P03_OBLIGATION_LEDGER";
  manifest.updated_at = timestamp();
  await writeJsonAtomic(path.join(dir, "manifest.json"), manifest);

  await appendLedgerEvent(
    planId,
    { phase: "P03_OBLIGATION_LEDGER", actor, action: "OBLIGATIONS_INITIALIZED", payload: { count: obligations.length } },
    rootDir
  );

  return getPlan(planId, rootDir);
}

/**
 * Transition the state of a single obligation
 */
async function transitionObligation(
  planId,
  obligationId,
  newStatus,
  { actor = "system", reason = null, rootDir = defaultRootDir() } = {}
) {
  const VALID_STATUSES = new Set(["pending", "ready", "active", "proposed_done", "verified", "failed", "blocked"]);
  if (!VALID_STATUSES.has(newStatus)) {
    throw new Error(`Invalid obligation status: ${newStatus}`);
  }

  const dir = planDirectory(planId, rootDir);
  const ledgerData = await readJsonSafe(path.join(dir, "ledger.json"));
  if (!ledgerData) throw new Error(`Ledger not found for plan: ${planId}`);

  const obligation = (ledgerData.obligations || []).find((o) => o.id === obligationId);
  if (!obligation) {
    throw new Error(`Obligation not found: ${obligationId} in plan ${planId}`);
  }

  const prevStatus = obligation.status;
  obligation.status = newStatus;
  obligation.updated_at = timestamp();

  if (newStatus === "active") {
    obligation.attempt_count = (obligation.attempt_count || 0) + 1;
  }

  ledgerData.updated_at = timestamp();
  await writeJsonAtomic(path.join(dir, "ledger.json"), ledgerData);

  const manifest = await readJsonSafe(path.join(dir, "manifest.json"));
  if (manifest) {
    manifest.updated_at = timestamp();
    await writeJsonAtomic(path.join(dir, "manifest.json"), manifest);
  }

  await appendLedgerEvent(
    planId,
    {
      phase: "P03_OBLIGATION_LEDGER",
      actor,
      action: "OBLIGATION_STATE_CHANGED",
      payload: { obligation_id: obligationId, previous_status: prevStatus, new_status: newStatus, reason },
    },
    rootDir
  );

  return getPlan(planId, rootDir);
}

/**
 * Record a verification from independent auditor (Phase 7)
 */
async function recordPlanVerification(planId, record, { actor = "auditor", rootDir = defaultRootDir() } = {}) {
  const dir = planDirectory(planId, rootDir);
  const verificationsData = (await readJsonSafe(path.join(dir, "verifications.json"))) || {
    plan_id: planId,
    records: [],
  };

  const verificationRecord = {
    id: record.id || `VR-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`,
    obligation_id: record.obligation_id,
    evaluator_ref: record.evaluator_ref,
    result: record.result || "pass", // pass | fail | inconclusive
    assertions: record.assertions || [],
    verified_at: timestamp(),
    environment: record.environment || {},
  };

  verificationsData.records.push(verificationRecord);
  verificationsData.updated_at = timestamp();

  await writeJsonAtomic(path.join(dir, "verifications.json"), verificationsData);

  // If verification passed, transition obligation to verified
  if (verificationRecord.result === "pass" && verificationRecord.obligation_id) {
    await transitionObligation(planId, verificationRecord.obligation_id, "verified", {
      actor: "independent_auditor",
      reason: `Verification passed: ${verificationRecord.id}`,
      rootDir,
    });
  }

  await appendLedgerEvent(
    planId,
    {
      phase: "P07_INDEPENDENT_AUDITOR",
      actor,
      action: "VERIFICATION_RECORDED",
      payload: { verification_id: verificationRecord.id, result: verificationRecord.result, obligation_id: verificationRecord.obligation_id },
    },
    rootDir
  );

  return getPlan(planId, rootDir);
}

/**
 * Issue and sign completion certificate (Phase 9)
 */
async function issuePlanCertificate(planId, certificate, { actor = "gatekeeper", rootDir = defaultRootDir() } = {}) {
  const dir = planDirectory(planId, rootDir);
  const manifest = await readJsonSafe(path.join(dir, "manifest.json"));
  if (!manifest) throw new Error(`Plan not found: ${planId}`);

  const certData = {
    certificate_id: certificate.certificate_id || `CERT-${planId}`,
    plan_id: planId,
    contract_id: certificate.contract_id,
    result: certificate.result || "completed",
    baseline_ref: certificate.baseline_ref || "HEAD",
    verified_obligations: certificate.verified_obligations || [],
    cost: certificate.cost || {},
    issued_at: timestamp(),
  };

  await writeJsonAtomic(path.join(dir, "certificate.json"), certData);

  manifest.is_complete = true;
  manifest.current_phase = "P09_CLOSURE_GATE";
  manifest.status = "completed";
  manifest.updated_at = timestamp();
  await writeJsonAtomic(path.join(dir, "manifest.json"), manifest);

  await appendLedgerEvent(
    planId,
    {
      phase: "P09_CLOSURE_GATE",
      actor,
      action: "COMPLETION_CERTIFICATE_ISSUED",
      payload: { certificate_id: certData.certificate_id, result: certData.result },
    },
    rootDir
  );

  return getPlan(planId, rootDir);
}

/**
 * Calculate deterministic completion gap: Gap_t = A_required - V_t
 */
async function calculatePlanGap(planId, rootDir = defaultRootDir()) {
  const plan = await getPlan(planId, rootDir);
  const contract = plan.contract;
  const obligations = plan.ledger;
  const verifications = plan.verifications;

  const requiredChecks = (contract?.acceptance_checks || []).filter((c) => c.required !== false);
  const passedChecks = new Set(
    verifications
      .filter((v) => v.result === "pass")
      .flatMap((v) => (v.assertions || []).filter((a) => a.result === "pass").map((a) => a.id))
  );

  const missingChecks = requiredChecks.filter((c) => !passedChecks.has(c.id));

  const totalObligations = obligations.length;
  const verifiedObligations = obligations.filter((o) => o.status === "verified");
  const pendingObligations = obligations.filter((o) => o.status === "pending" || o.status === "ready");
  const failedObligations = obligations.filter((o) => o.status === "failed");
  const activeObligations = obligations.filter((o) => o.status === "active" || o.status === "proposed_done");

  const isComplete = missingChecks.length === 0 && totalObligations > 0 && verifiedObligations.length === totalObligations;

  return {
    plan_id: planId,
    is_complete: isComplete,
    completion_ratio: totalObligations > 0 ? verifiedObligations.length / totalObligations : 0,
    required_checks_count: requiredChecks.length,
    passed_checks_count: passedChecks.size,
    missing_checks: missingChecks,
    obligations_summary: {
      total: totalObligations,
      verified: verifiedObligations.length,
      active: activeObligations.length,
      pending: pendingObligations.length,
      failed: failedObligations.length,
    },
  };
}

/**
 * Get ready obligations whose dependencies are all verified
 */
async function getReadyObligations(planId, rootDir = defaultRootDir()) {
  const plan = await getPlan(planId, rootDir);
  const obligations = plan.ledger;
  const verifiedIds = new Set(obligations.filter((o) => o.status === "verified").map((o) => o.id));

  return obligations.filter((o) => {
    if (o.status === "verified") return false;
    const deps = o.depends_on || [];
    return deps.every((depId) => verifiedIds.has(depId));
  });
}

/**
 * Get event history stream from events.ndjson
 */
async function getEventHistory(planId, rootDir = defaultRootDir()) {
  const dir = planDirectory(planId, rootDir);
  const eventsFile = path.join(dir, "events.ndjson");
  try {
    const content = await fs.readFile(eventsFile, "utf8");
    return content
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line));
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

module.exports = {
  createPlan,
  getPlan,
  listPlans,
  deletePlan,
  updatePlanContract,
  updatePlanContext,
  updatePlanObligations,
  transitionObligation,
  recordPlanVerification,
  issuePlanCertificate,
  calculatePlanGap,
  getReadyObligations,
  getEventHistory,
  appendLedgerEvent,
  defaultLedgersDir,
  planDirectory,
};
