const test = require("node:test");
const assert = require("node:assert/strict");
const { createMockTelemetryServer, VALID_TELEMETRY_EVENTS } = require("../helpers/fixtures");

test("Tier 2 - B07.1: Zero Invocations Summary Edge Case", async (t) => {
  const mockServer = await createMockTelemetryServer();
  t.after(() => mockServer.close());

  const res = await fetch(`${mockServer.url}/api/telemetry/summary`);
  assert.equal(res.status, 200);

  const summary = await res.json();
  assert.equal(summary.total_invocations, 0);
  assert.equal(summary.average_duration_ms, 0);
  assert.equal(summary.success_rate, 1.0);
  assert.deepEqual(summary.recent_events, []);
});

test("Tier 2 - B07.2: 100% Success Rate Calculation", async (t) => {
  const mockServer = await createMockTelemetryServer();
  t.after(() => mockServer.close());

  for (let i = 0; i < 5; i++) {
    await fetch(`${mockServer.url}/api/telemetry/record`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...VALID_TELEMETRY_EVENTS.minimalEvent, outcome: "success" }),
    });
  }

  const res = await fetch(`${mockServer.url}/api/telemetry/summary`);
  const summary = await res.json();

  assert.equal(summary.total_invocations, 5);
  assert.equal(summary.success_rate, 1.0);
});

test("Tier 2 - B07.3: 0% Success Rate (All Incidents / Risks)", async (t) => {
  const mockServer = await createMockTelemetryServer();
  t.after(() => mockServer.close());

  for (let i = 0; i < 4; i++) {
    await fetch(`${mockServer.url}/api/telemetry/record`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...VALID_TELEMETRY_EVENTS.minimalEvent, outcome: "risk" }),
    });
  }

  const res = await fetch(`${mockServer.url}/api/telemetry/summary`);
  const summary = await res.json();

  assert.equal(summary.total_invocations, 4);
  assert.equal(summary.success_rate, 0.0);
});

test("Tier 2 - B07.4: Monopolistic Single Provider Invocations", async (t) => {
  const mockServer = await createMockTelemetryServer();
  t.after(() => mockServer.close());

  for (let i = 0; i < 10; i++) {
    await fetch(`${mockServer.url}/api/telemetry/record`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...VALID_TELEMETRY_EVENTS.minimalEvent, provider_id: "antigravity" }),
    });
  }

  const res = await fetch(`${mockServer.url}/api/telemetry/summary`);
  const summary = await res.json();

  assert.equal(summary.by_provider.antigravity, 10);
  assert.equal(summary.by_provider.claude, undefined);
});

test("Tier 2 - B07.5: Recent Events Capped to 20 Elements Max", async (t) => {
  const mockServer = await createMockTelemetryServer();
  t.after(() => mockServer.close());

  for (let i = 0; i < 30; i++) {
    await fetch(`${mockServer.url}/api/telemetry/record`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...VALID_TELEMETRY_EVENTS.minimalEvent, summary: `Event #${i}` }),
    });
  }

  const res = await fetch(`${mockServer.url}/api/telemetry/summary`);
  const summary = await res.json();

  assert.equal(summary.total_invocations, 30);
  assert.equal(summary.recent_events.length, 20);
  assert.equal(summary.recent_events[0].summary, "Event #29");
});
