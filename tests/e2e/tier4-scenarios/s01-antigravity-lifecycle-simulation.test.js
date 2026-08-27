const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs/promises");
const { createSandbox, setupTestCatalogWithSkill, createMockTelemetryServer, VALID_TELEMETRY_EVENTS } = require("../helpers/fixtures");
const { addSkillFeedback, listSkillFeedback } = require("../../../apps/skills-catalog/src/skill-management");

test("Tier 4 - Scenario 1.1: Complete Google Antigravity Agent Telemetry Flow", async (t) => {
  const { sandboxPath, cleanup } = await createSandbox("tier4-s01-");
  t.after(cleanup);

  const { catalogRoot, registryRoot, lineageId } = await setupTestCatalogWithSkill({
    sandboxPath,
    skillName: "task-decomposer",
  });

  const mockServer = await createMockTelemetryServer();
  t.after(() => mockServer.close());

  const ndjsonPath = path.join(sandboxPath, ".skills-platform", "telemetry", "events.ndjson");
  await fs.mkdir(path.dirname(ndjsonPath), { recursive: true });

  // 1. Antigravity Agent triggers PostToolUse on view_file for task-decomposer
  const hookPayload = {
    hook_event: "PostToolUse",
    tool_name: "view_file",
    tool_input: { AbsolutePath: "C:\\Users\\minec\\Skills-Platform\\skills\\task-decomposer\\SKILL.md" },
    tool_output: "Task Decomposer skill documentation...",
    provider_id: "antigravity",
    project_id: "agent-sim-project",
  };

  // 2. Structured telemetry event generated
  const telemetryEvent = {
    timestamp: new Date().toISOString(),
    provider_id: hookPayload.provider_id,
    project_id: hookPayload.project_id,
    recipe_id: "mlc-task-planning",
    skill_name: "task-decomposer",
    invocation_mode: "model_invoked",
    duration_ms: 28,
    tool_calls_count: 1,
    outcome: "success",
    evidence_type: "activation_report",
    summary: "Loaded task-decomposer for autonomous project planning",
  };

  // 3. Local flush to NDJSON
  await fs.appendFile(ndjsonPath, `${JSON.stringify(telemetryEvent)}\n`, "utf8");

  // 4. Remote HTTP ingestion
  const res = await fetch(`${mockServer.url}/api/telemetry/record`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(telemetryEvent),
  });
  assert.equal(res.status, 201);

  // 5. Feedback bridge into catalog
  await addSkillFeedback({
    catalogRoot,
    registryRoot,
    lineageId,
    scope: "global",
    outcome: telemetryEvent.outcome,
    evidenceType: telemetryEvent.evidence_type,
    summary: telemetryEvent.summary,
    author: `telemetry:${telemetryEvent.provider_id}`,
  });

  // 6. Verify catalog feedback records
  const feedbackList = await listSkillFeedback({ catalogRoot, lineageId });
  assert.equal(feedbackList.length, 1);
  assert.equal(feedbackList[0].author, "telemetry:antigravity");
  assert.equal(feedbackList[0].lineage_id, lineageId);
});

test("Tier 4 - Scenario 1.2: Antigravity Multi-Turn Reasoning & Tool Invocation Loop", async (t) => {
  const mockServer = await createMockTelemetryServer();
  t.after(() => mockServer.close());

  const turns = [
    { tool: "view_file", skill: "task-decomposer", duration: 15, outcome: "success" },
    { tool: "run_command", skill: "scoped-tdd-executor", duration: 40, outcome: "correction" },
    { tool: "run_command", skill: "scoped-tdd-executor", duration: 30, outcome: "success" },
  ];

  for (let i = 0; i < turns.length; i++) {
    const turn = turns[i];
    const event = {
      timestamp: new Date(Date.now() + i * 1000).toISOString(),
      provider_id: "antigravity",
      project_id: "multi-turn-proj",
      skill_name: turn.skill,
      invocation_mode: "model_invoked",
      duration_ms: turn.duration,
      tool_calls_count: 1,
      outcome: turn.outcome,
      evidence_type: turn.outcome === "correction" ? "evaluation" : "activation_report",
      summary: `Turn ${i + 1}: ${turn.tool} on ${turn.skill}`,
    };

    const res = await fetch(`${mockServer.url}/api/telemetry/record`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event),
    });
    assert.equal(res.status, 201);
  }

  const summary = await fetch(`${mockServer.url}/api/telemetry/summary`).then((r) => r.json());
  assert.equal(summary.total_invocations, 3);
  assert.equal(summary.by_mode.model_invoked, 3);
  assert.equal(summary.by_health.healthy, 2);
  assert.equal(summary.by_health.needs_review, 1);
});
