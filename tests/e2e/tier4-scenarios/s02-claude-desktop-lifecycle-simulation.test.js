const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs/promises");
const { createSandbox, createMockTelemetryServer, VALID_TELEMETRY_EVENTS } = require("../helpers/fixtures");

test("Tier 4 - Scenario 2.1: Anthropic Claude Code Session Simulation with Risk Flagging", async (t) => {
  const { sandboxPath, cleanup } = await createSandbox("tier4-s02-");
  t.after(cleanup);

  const mockServer = await createMockTelemetryServer();
  t.after(() => mockServer.close());

  // Claude Code executes tool and reports boundary correction
  const claudeEvent = {
    ...VALID_TELEMETRY_EVENTS.claudeToolExecution,
    project_id: "claude-session-project",
    outcome: "correction",
    summary: "Claude Code adjusted test regex after initial assertion failure",
  };

  const res = await fetch(`${mockServer.url}/api/telemetry/record`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(claudeEvent),
  });
  assert.equal(res.status, 201);

  // Check summary reflects need for review
  const summary = await fetch(`${mockServer.url}/api/telemetry/summary`).then((r) => r.json());
  assert.equal(summary.by_health.needs_review, 1);
  assert.equal(summary.by_provider.claude, 1);
  assert.equal(summary.recent_events[0].provider_id, "claude");
});

test("Tier 4 - Scenario 2.2: Claude & Antigravity Collaborative Pairwise Workflow", async (t) => {
  const mockServer = await createMockTelemetryServer();
  t.after(() => mockServer.close());

  // 1. Antigravity does planning (model_invoked)
  await fetch(`${mockServer.url}/api/telemetry/record`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...VALID_TELEMETRY_EVENTS.antigravitySkillLoad,
      project_id: "collaborative-project",
      summary: "Antigravity generated PRD task queue",
    }),
  });

  // 2. Claude executes scoped TDD (user_invoked)
  await fetch(`${mockServer.url}/api/telemetry/record`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...VALID_TELEMETRY_EVENTS.claudeToolExecution,
      project_id: "collaborative-project",
      outcome: "success",
      summary: "Claude passed scoped test assertions",
    }),
  });

  // 3. Ralph-TUI reviews and logs hybrid verification
  await fetch(`${mockServer.url}/api/telemetry/record`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...VALID_TELEMETRY_EVENTS.codexRalphStream,
      project_id: "collaborative-project",
      summary: "Ralph-TUI verified task completion",
    }),
  });

  const summary = await fetch(`${mockServer.url}/api/telemetry/summary`).then((r) => r.json());
  assert.equal(summary.total_invocations, 3);
  assert.equal(summary.by_provider.antigravity, 1);
  assert.equal(summary.by_provider.claude, 1);
  assert.equal(summary.by_provider.codex, 1);
  assert.equal(summary.by_mode.model_invoked, 1);
  assert.equal(summary.by_mode.user_invoked, 1);
  assert.equal(summary.by_mode.hybrid, 1);
});
