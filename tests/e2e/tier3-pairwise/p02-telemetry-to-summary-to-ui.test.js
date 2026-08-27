const test = require("node:test");
const assert = require("node:assert/strict");
const { createMockTelemetryServer, VALID_TELEMETRY_EVENTS } = require("../helpers/fixtures");

test("Tier 3 - P02.1: Telemetry Stream Aggregates Correctly for UI Dashboard Consumption", async (t) => {
  const mockServer = await createMockTelemetryServer();
  t.after(() => mockServer.close());

  // Ingest mix of modes: 2 model_invoked, 1 user_invoked
  await fetch(`${mockServer.url}/api/telemetry/record`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...VALID_TELEMETRY_EVENTS.antigravitySkillLoad, invocation_mode: "model_invoked" }),
  });
  await fetch(`${mockServer.url}/api/telemetry/record`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...VALID_TELEMETRY_EVENTS.antigravitySkillLoad, invocation_mode: "model_invoked" }),
  });
  await fetch(`${mockServer.url}/api/telemetry/record`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...VALID_TELEMETRY_EVENTS.claudeToolExecution, invocation_mode: "user_invoked" }),
  });

  const res = await fetch(`${mockServer.url}/api/telemetry/summary`);
  const summary = await res.json();

  assert.equal(summary.total_invocations, 3);
  assert.equal(summary.by_mode.model_invoked, 2);
  assert.equal(summary.by_mode.user_invoked, 1);

  // Compute UI visualizer ratios
  const modelRatio = (summary.by_mode.model_invoked / summary.total_invocations) * 100;
  const userRatio = (summary.by_mode.user_invoked / summary.total_invocations) * 100;

  assert.equal(Math.round(modelRatio), 67);
  assert.equal(Math.round(userRatio), 33);
});

test("Tier 3 - P02.2: Live Polling Updates When Burst Events Arrive", async (t) => {
  const mockServer = await createMockTelemetryServer();
  t.after(() => mockServer.close());

  const poll1 = await fetch(`${mockServer.url}/api/telemetry/summary`).then((r) => r.json());
  assert.equal(poll1.total_invocations, 0);

  // Ingest 5 events
  for (let i = 0; i < 5; i++) {
    await fetch(`${mockServer.url}/api/telemetry/record`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...VALID_TELEMETRY_EVENTS.minimalEvent, summary: `Event ${i}` }),
    });
  }

  const poll2 = await fetch(`${mockServer.url}/api/telemetry/summary`).then((r) => r.json());
  assert.equal(poll2.total_invocations, 5);
  assert.equal(poll2.recent_events.length, 5);
});

test("Tier 3 - P02.3: Provider Filter Queries on Summary Stream", async (t) => {
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
    body: JSON.stringify(VALID_TELEMETRY_EVENTS.claudeToolExecution),
  });

  const summary = await fetch(`${mockServer.url}/api/telemetry/summary`).then((r) => r.json());
  const antigravityEvents = summary.recent_events.filter((e) => e.provider_id === "antigravity");
  const claudeEvents = summary.recent_events.filter((e) => e.provider_id === "claude");

  assert.equal(antigravityEvents.length, 1);
  assert.equal(claudeEvents.length, 1);
});

test("Tier 3 - P02.4: Seamless Reconnect from Offline State to Active Server", async (t) => {
  let server = await createMockTelemetryServer();

  // Initially connected
  let res = await fetch(`${server.url}/api/telemetry/summary`).catch(() => null);
  assert.ok(res && res.ok);

  // Server goes down
  await server.close();
  res = await fetch(`${server.url}/api/telemetry/summary`).catch(() => null);
  assert.equal(res, null);

  // Server re-established on new port
  server = await createMockTelemetryServer();
  t.after(() => server.close());

  res = await fetch(`${server.url}/api/telemetry/summary`).catch(() => null);
  assert.ok(res && res.ok);
});
