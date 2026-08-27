const test = require("node:test");
const assert = require("node:assert/strict");
const { createMockTelemetryServer, VALID_TELEMETRY_EVENTS } = require("../helpers/fixtures");

/**
 * Simulated UI API Client polling and fallback logic
 */
async function fetchTelemetrySummaryWithFallback(apiUrl) {
  if (!apiUrl) {
    return {
      total_invocations: 0,
      average_duration_ms: 0,
      success_rate: 1.0,
      by_mode: { model_invoked: 0, user_invoked: 0, hybrid: 0, unspecified: 0 },
      by_provider: {},
      by_health: { healthy: 0, needs_review: 0, unknown: 0 },
      recent_events: [],
      is_fallback: true,
    };
  }

  try {
    const res = await fetch(`${apiUrl}/api/telemetry/summary`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return { ...data, is_fallback: false };
  } catch (err) {
    return {
      total_invocations: 0,
      average_duration_ms: 0,
      success_rate: 1.0,
      by_mode: { model_invoked: 0, user_invoked: 0, hybrid: 0, unspecified: 0 },
      by_provider: {},
      by_health: { healthy: 0, needs_review: 0, unknown: 0 },
      recent_events: [],
      is_fallback: true,
      error_message: err.message,
    };
  }
}

test("Tier 1 - F13.1: Live Server Polling Fetches Real Telemetry Summary", async (t) => {
  const mockServer = await createMockTelemetryServer();
  t.after(() => mockServer.close());

  await fetch(`${mockServer.url}/api/telemetry/record`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(VALID_TELEMETRY_EVENTS.antigravitySkillLoad),
  });

  const summary = await fetchTelemetrySummaryWithFallback(mockServer.url);
  assert.equal(summary.is_fallback, false);
  assert.equal(summary.total_invocations, 1);
  assert.equal(summary.by_mode.model_invoked, 1);
});

test("Tier 1 - F13.2: Disconnected Server Triggers Offline Fallback Data", async () => {
  const deadUrl = "http://127.0.0.1:59998";
  const summary = await fetchTelemetrySummaryWithFallback(deadUrl);

  assert.equal(summary.is_fallback, true);
  assert.equal(summary.total_invocations, 0);
  assert.ok(summary.error_message);
});

test("Tier 1 - F13.3: Missing API URL Defaults to Safe Mock Fallback", async () => {
  const summary = await fetchTelemetrySummaryWithFallback("");
  assert.equal(summary.is_fallback, true);
  assert.equal(summary.total_invocations, 0);
  assert.equal(summary.success_rate, 1.0);
});

test("Tier 1 - F13.4: Polling Cycle Updates Data When New Invocations Arrive", async (t) => {
  const mockServer = await createMockTelemetryServer();
  t.after(() => mockServer.close());

  const poll1 = await fetchTelemetrySummaryWithFallback(mockServer.url);
  assert.equal(poll1.total_invocations, 0);

  // Ingest new event
  await fetch(`${mockServer.url}/api/telemetry/record`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(VALID_TELEMETRY_EVENTS.claudeToolExecution),
  });

  const poll2 = await fetchTelemetrySummaryWithFallback(mockServer.url);
  assert.equal(poll2.total_invocations, 1);
  assert.equal(poll2.by_mode.user_invoked, 1);
});

test("Tier 1 - F13.5: UI Error Boundary Resilience to Sever Malformed 500 Responses", async (t) => {
  const server = require("node:http").createServer((_, res) => {
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end("Internal error");
  });

  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  t.after(() => new Promise((r) => server.close(r)));

  const url = `http://127.0.0.1:${server.address().port}`;
  const summary = await fetchTelemetrySummaryWithFallback(url);

  assert.equal(summary.is_fallback, true);
  assert.equal(summary.total_invocations, 0);
});
