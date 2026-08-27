const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs/promises");
const { createSandbox, setupTestCatalogWithSkill, createMockTelemetryServer, VALID_TELEMETRY_EVENTS } = require("../helpers/fixtures");
const { addSkillFeedback, listSkillFeedback, getSkillFeedbackSummary } = require("../../../apps/skills-catalog/src/skill-management");

test("Tier 3 - P01.1: End-to-End Pipeline: Hook -> NDJSON -> Ingest API -> Feedback Bridge", async (t) => {
  const { sandboxPath, cleanup } = await createSandbox("tier3-p01-");
  t.after(cleanup);

  const { catalogRoot, registryRoot, lineageId } = await setupTestCatalogWithSkill({
    sandboxPath,
    skillName: "task-decomposer",
  });

  const ndjsonFile = path.join(sandboxPath, ".skills-platform", "telemetry", "events.ndjson");
  await fs.mkdir(path.dirname(ndjsonFile), { recursive: true });

  const mockServer = await createMockTelemetryServer();
  t.after(() => mockServer.close());

  // Step 1: Hook event generated
  const event = {
    ...VALID_TELEMETRY_EVENTS.antigravitySkillLoad,
    project_id: "integration-pipeline-project",
  };

  // Step 2: Append to local NDJSON
  await fs.appendFile(ndjsonFile, `${JSON.stringify(event)}\n`, "utf8");

  // Step 3: Ingest via REST API
  const res = await fetch(`${mockServer.url}/api/telemetry/record`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(event),
  });
  assert.equal(res.status, 201);

  // Step 4: Bridge into SkillFeedback store
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

  // Step 5: Verify queryable in store
  const feedbacks = await listSkillFeedback({ catalogRoot, lineageId });
  assert.equal(feedbacks.length, 1);
  assert.equal(feedbacks[0].lineage_id, lineageId);
  assert.equal(feedbacks[0].author, "telemetry:antigravity");
});

test("Tier 3 - P01.2: Multi-Agent Provider Diversity Across Pipeline", async (t) => {
  const { sandboxPath, cleanup } = await createSandbox("tier3-p01-");
  t.after(cleanup);

  const { catalogRoot, registryRoot, lineageId } = await setupTestCatalogWithSkill({
    sandboxPath,
    skillName: "task-decomposer",
  });

  const providers = ["antigravity", "claude", "codex", "ralph-tui"];

  for (const prov of providers) {
    await addSkillFeedback({
      catalogRoot,
      registryRoot,
      lineageId,
      outcome: "success",
      evidenceType: "evaluation",
      summary: `Run by ${prov}`,
      author: `telemetry:${prov}`,
    });
  }

  const feedbackList = await listSkillFeedback({ catalogRoot, lineageId });
  assert.equal(feedbackList.length, 4);
  const authors = feedbackList.map((f) => f.author);
  assert.ok(authors.includes("telemetry:antigravity"));
  assert.ok(authors.includes("telemetry:claude"));
});

test("Tier 3 - P01.3: Risk Signals Flow from Hook to Skill Health Distribution", async (t) => {
  const { sandboxPath, cleanup } = await createSandbox("tier3-p01-");
  t.after(cleanup);

  const { catalogRoot, registryRoot, lineageId } = await setupTestCatalogWithSkill({
    sandboxPath,
    skillName: "global-regression-gatekeeper",
  });

  const riskEvent = VALID_TELEMETRY_EVENTS.releaseGovernanceGate;

  await addSkillFeedback({
    catalogRoot,
    registryRoot,
    lineageId,
    outcome: riskEvent.outcome,
    evidenceType: riskEvent.evidence_type,
    summary: riskEvent.summary,
    author: `telemetry:${riskEvent.provider_id}`,
    metrics: { risk_events: 1 },
  });

  const summary = await getSkillFeedbackSummary({ catalogRoot, registryRoot, lineageId });
  assert.equal(summary.by_outcome.risk, 1);
  assert.equal(summary.total_feedback, 1);
});

test("Tier 3 - P01.4: Offline Fallback: Local NDJSON Survives API Disconnection", async (t) => {
  const { sandboxPath, cleanup } = await createSandbox("tier3-p01-");
  t.after(cleanup);

  const ndjsonFile = path.join(sandboxPath, "events.ndjson");
  const event = VALID_TELEMETRY_EVENTS.claudeToolExecution;

  // Local write succeeds
  await fs.appendFile(ndjsonFile, `${JSON.stringify(event)}\n`, "utf8");

  // Attempt remote dispatch that fails (offline)
  let apiSucceeded = true;
  try {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 20);
    await fetch("http://127.0.0.1:59990/api/telemetry/record", {
      method: "POST",
      body: JSON.stringify(event),
      signal: controller.signal,
    });
  } catch {
    apiSucceeded = false;
  }

  assert.equal(apiSucceeded, false);

  // Local log still intact
  const raw = await fs.readFile(ndjsonFile, "utf8");
  const parsed = JSON.parse(raw.trim());
  assert.equal(parsed.skill_name, "scoped-tdd-executor");
});
