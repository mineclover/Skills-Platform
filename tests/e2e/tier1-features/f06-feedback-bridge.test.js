const test = require("node:test");
const assert = require("node:assert/strict");
const { createSandbox, setupTestCatalogWithSkill, VALID_TELEMETRY_EVENTS } = require("../helpers/fixtures");

// Test feedback bridging against skill-management module
const {
  addSkillFeedback,
  listSkillFeedback,
  getSkillFeedbackSummary,
} = require("../../../apps/skills-catalog/src/skill-management");

test("Tier 1 - F06.1: Telemetry Event Bridges Directly into SkillFeedback Store", async (t) => {
  const { sandboxPath, cleanup } = await createSandbox("tier1-f06-");
  t.after(cleanup);

  const { catalogRoot, registryRoot, lineageId } = await setupTestCatalogWithSkill({
    sandboxPath,
    skillName: "task-decomposer",
  });

  const event = VALID_TELEMETRY_EVENTS.antigravitySkillLoad;

  const feedbackRecord = await addSkillFeedback({
    catalogRoot,
    registryRoot,
    lineageId,
    scope: "global",
    outcome: event.outcome,
    evidenceType: event.evidence_type,
    summary: event.summary,
    author: `telemetry:${event.provider_id}`,
    metrics: { attempted: 1, successful: 1 },
  });

  assert.ok(feedbackRecord);
  assert.equal(feedbackRecord.lineage_id, lineageId);
  assert.equal(feedbackRecord.outcome, "success");
});

test("Tier 1 - F06.2: Outcome 'success' Records Positive Activation Evidence", async (t) => {
  const { sandboxPath, cleanup } = await createSandbox("tier1-f06-");
  t.after(cleanup);

  const { catalogRoot, registryRoot, lineageId } = await setupTestCatalogWithSkill({
    sandboxPath,
    skillName: "scoped-tdd-executor",
  });

  const event = VALID_TELEMETRY_EVENTS.claudeToolExecution;

  await addSkillFeedback({
    catalogRoot,
    registryRoot,
    lineageId,
    scope: "global",
    outcome: event.outcome,
    evidenceType: event.evidence_type,
    summary: event.summary,
    author: `telemetry:${event.provider_id}`,
  });

  const feedbackList = await listSkillFeedback({ catalogRoot, lineageId });
  assert.ok(feedbackList.length >= 1);
  assert.equal(feedbackList[0].outcome, "correction");
  assert.equal(feedbackList[0].evidence_type, "evaluation");
});

test("Tier 1 - F06.3: Risk Outcomes Surface in Feedback Store for Inspection", async (t) => {
  const { sandboxPath, cleanup } = await createSandbox("tier1-f06-");
  t.after(cleanup);

  const { catalogRoot, registryRoot, lineageId } = await setupTestCatalogWithSkill({
    sandboxPath,
    skillName: "global-regression-gatekeeper",
  });

  const event = VALID_TELEMETRY_EVENTS.releaseGovernanceGate;

  await addSkillFeedback({
    catalogRoot,
    registryRoot,
    lineageId,
    scope: "global",
    outcome: event.outcome,
    evidenceType: event.evidence_type,
    summary: event.summary,
    author: `telemetry:${event.provider_id}`,
    metrics: { risk_events: 1 },
  });

  const feedbackList = await listSkillFeedback({ catalogRoot, lineageId });
  const riskEntry = feedbackList.find((f) => f.outcome === "risk");
  assert.ok(riskEntry);
  assert.equal(riskEntry.evidence_type, "incident");
  assert.equal(riskEntry.metrics.risk_events, 1);
});

test("Tier 1 - F06.4: Feedback Summary Aggregates Bridged Telemetry Records", async (t) => {
  const { sandboxPath, cleanup } = await createSandbox("tier1-f06-");
  t.after(cleanup);

  const { catalogRoot, registryRoot, lineageId } = await setupTestCatalogWithSkill({
    sandboxPath,
    skillName: "task-decomposer",
  });

  await addSkillFeedback({
    catalogRoot,
    registryRoot,
    lineageId,
    outcome: "success",
    evidenceType: "evaluation",
    summary: "Success run 1",
    author: "telemetry:antigravity",
  });
  await addSkillFeedback({
    catalogRoot,
    registryRoot,
    lineageId,
    outcome: "success",
    evidenceType: "evaluation",
    summary: "Success run 2",
    author: "telemetry:claude",
  });
  await addSkillFeedback({
    catalogRoot,
    registryRoot,
    lineageId,
    outcome: "risk",
    evidenceType: "incident",
    summary: "Risk run",
    author: "telemetry:ralph-tui",
  });

  const summary = await getSkillFeedbackSummary({ catalogRoot, registryRoot, lineageId });
  assert.equal(summary.total_feedback, 3);
  assert.equal(summary.by_outcome.success, 2);
  assert.equal(summary.by_outcome.risk, 1);
});

test("Tier 1 - F06.5: Feedback Ingestion Does Not Corrupt Non-Telemetry Feedback Records", async (t) => {
  const { sandboxPath, cleanup } = await createSandbox("tier1-f06-");
  t.after(cleanup);

  const { catalogRoot, registryRoot, lineageId } = await setupTestCatalogWithSkill({
    sandboxPath,
    skillName: "hybrid-skill",
  });

  // Add manual feedback
  await addSkillFeedback({
    catalogRoot,
    registryRoot,
    lineageId,
    outcome: "neutral",
    evidenceType: "manual",
    summary: "Manual human review note",
    author: "human-auditor",
  });

  // Bridge telemetry feedback
  await addSkillFeedback({
    catalogRoot,
    registryRoot,
    lineageId,
    outcome: "success",
    evidenceType: "activation_report",
    summary: "Auto telemetry",
    author: "telemetry:antigravity",
  });

  const list = await listSkillFeedback({ catalogRoot, lineageId });
  assert.equal(list.length, 2);
  // listSkillFeedback is reverse chronological
  assert.equal(list[0].author, "telemetry:antigravity");
  assert.equal(list[1].author, "human-auditor");
});
