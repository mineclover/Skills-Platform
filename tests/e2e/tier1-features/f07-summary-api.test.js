const test = require("node:test");
const assert = require("node:assert/strict");
const { createMockTelemetryServer, VALID_TELEMETRY_EVENTS, validateTelemetrySummary } = require("../helpers/fixtures");

test("Tier 1 - F07.1: GET /api/telemetry/summary Returns Valid Aggregated Telemetry Schema", async (t) => {
  const mockServer = await createMockTelemetryServer();
  t.after(() => mockServer.close());

  // Ingest sample events
  await fetch(`${mockServer.url}/api/telemetry/record`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(VALID_TELEMETRY_EVENTS.antigravitySkillLoad),
  });
  await fetch(`${mockServer.url}/api/telemetry/record`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(VALID_TELEMETRY_EVENTS.claudeToolExecution),
  });

  const res = await fetch(`${mockServer.url}/api/telemetry/summary`);
  assert.equal(res.status, 200);

  const summary = await res.json();
  const validation = validateTelemetrySummary(summary);
  assert.equal(validation.valid, true, `Summary validation failed: ${validation.issues?.join(", ")}`);
  assert.equal(summary.total_invocations, 2);
});

test("Tier 1 - F07.2: Invocation Mode Breakdown Aggregation", async (t) => {
  const mockServer = await createMockTelemetryServer();
  t.after(() => mockServer.close());

  // 1 model_invoked, 1 user_invoked, 1 hybrid
  await fetch(`${mockServer.url}/api/telemetry/record`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(VALID_TELEMETRY_EVENTS.antigravitySkillLoad), // model_invoked
  });
  await fetch(`${mockServer.url}/api/telemetry/record`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(VALID_TELEMETRY_EVENTS.claudeToolExecution), // user_invoked
  });
  await fetch(`${mockServer.url}/api/telemetry/record`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(VALID_TELEMETRY_EVENTS.codexRalphStream), // hybrid
  });

  const res = await fetch(`${mockServer.url}/api/telemetry/summary`);
  const summary = await res.json();

  assert.equal(summary.by_mode.model_invoked, 1);
  assert.equal(summary.by_mode.user_invoked, 1);
  assert.equal(summary.by_mode.hybrid, 1);
  assert.equal(summary.by_mode.unspecified, 0);
});

test("Tier 1 - F07.3: Average Duration and Success Rate Accuracy", async (t) => {
  const mockServer = await createMockTelemetryServer();
  t.after(() => mockServer.close());

  // Event 1: duration 30, outcome: success
  await fetch(`${mockServer.url}/api/telemetry/record`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...VALID_TELEMETRY_EVENTS.minimalEvent, duration_ms: 30, outcome: "success" }),
  });
  // Event 2: duration 50, outcome: risk
  await fetch(`${mockServer.url}/api/telemetry/record`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...VALID_TELEMETRY_EVENTS.minimalEvent, duration_ms: 50, outcome: "risk" }),
  });

  const res = await fetch(`${mockServer.url}/api/telemetry/summary`);
  const summary = await res.json();

  assert.equal(summary.total_invocations, 2);
  assert.equal(summary.average_duration_ms, 40);
  assert.equal(summary.success_rate, 0.5);
});

test("Tier 1 - F07.4: Provider Distribution Aggregation", async (t) => {
  const mockServer = await createMockTelemetryServer();
  t.after(() => mockServer.close());

  await fetch(`${mockServer.url}/api/telemetry/record`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(VALID_TELEMETRY_EVENTS.antigravitySkillLoad),
  });
  await fetch(`${mockServer.url}/api/telemetry/record`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(VALID_TELEMETRY_EVENTS.antigravitySkillLoad),
  });
  await fetch(`${mockServer.url}/api/telemetry/record`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(VALID_TELEMETRY_EVENTS.claudeToolExecution),
  });

  const res = await fetch(`${mockServer.url}/api/telemetry/summary`);
  const summary = await res.json();

  assert.equal(summary.by_provider.antigravity, 2);
  assert.equal(summary.by_provider.claude, 1);
});

test("Tier 1 - F07.5: Recent Event Stream in Reverse Chronological Order", async (t) => {
  const mockServer = await createMockTelemetryServer();
  t.after(() => mockServer.close());

  const event1 = { ...VALID_TELEMETRY_EVENTS.minimalEvent, summary: "First event" };
  const event2 = { ...VALID_TELEMETRY_EVENTS.minimalEvent, summary: "Second event" };

  await fetch(`${mockServer.url}/api/telemetry/record`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(event1),
  });
  await fetch(`${mockServer.url}/api/telemetry/record`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(event2),
  });

  const res = await fetch(`${mockServer.url}/api/telemetry/summary`);
  const summary = await res.json();

  assert.equal(summary.recent_events.length, 2);
  assert.equal(summary.recent_events[0].summary, "Second event");
  assert.equal(summary.recent_events[1].summary, "First event");
});
