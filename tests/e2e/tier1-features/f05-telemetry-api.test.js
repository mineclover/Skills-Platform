const test = require("node:test");
const assert = require("node:assert/strict");
const { createMockTelemetryServer, VALID_TELEMETRY_EVENTS, INVALID_TELEMETRY_EVENTS } = require("../helpers/fixtures");

test("Tier 1 - F05.1: POST /api/telemetry/record Ingests Valid Telemetry Event", async (t) => {
  const mockServer = await createMockTelemetryServer();
  t.after(() => mockServer.close());

  const event = VALID_TELEMETRY_EVENTS.antigravitySkillLoad;
  const res = await fetch(`${mockServer.url}/api/telemetry/record`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(event),
  });

  assert.equal(res.status, 201);
  const data = await res.json();
  assert.equal(data.ok, true);
  assert.equal(mockServer.recordedEvents.length, 1);
  assert.equal(mockServer.recordedEvents[0].skill_name, "task-decomposer");
});

test("Tier 1 - F05.2: Ingestion Handles All Supported Providers", async (t) => {
  const mockServer = await createMockTelemetryServer();
  t.after(() => mockServer.close());

  const providers = ["antigravity", "claude", "codex", "ralph-tui"];
  for (const provider of providers) {
    const event = {
      ...VALID_TELEMETRY_EVENTS.minimalEvent,
      provider_id: provider,
      summary: `Test event for ${provider}`,
    };
    const res = await fetch(`${mockServer.url}/api/telemetry/record`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event),
    });
    assert.equal(res.status, 201);
  }

  assert.equal(mockServer.recordedEvents.length, 4);
});

test("Tier 1 - F05.3: Ingestion API Rejects Schema Violations with 400 Bad Request", async (t) => {
  const mockServer = await createMockTelemetryServer();
  t.after(() => mockServer.close());

  const invalidEvent = INVALID_TELEMETRY_EVENTS.invalidProviderId;
  const res = await fetch(`${mockServer.url}/api/telemetry/record`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(invalidEvent),
  });

  assert.equal(res.status, 400);
  const body = await res.json();
  assert.ok(body.error);
  assert.ok(Array.isArray(body.issues));
  assert.equal(mockServer.recordedEvents.length, 0);
});

test("Tier 1 - F05.4: Ingestion Accepts Omission of Optional Fields", async (t) => {
  const mockServer = await createMockTelemetryServer();
  t.after(() => mockServer.close());

  const minimal = VALID_TELEMETRY_EVENTS.minimalEvent;
  assert.equal(minimal.recipe_id, undefined);
  assert.equal(minimal.lineage_id, undefined);
  assert.equal(minimal.metrics, undefined);

  const res = await fetch(`${mockServer.url}/api/telemetry/record`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(minimal),
  });

  assert.equal(res.status, 201);
  assert.equal(mockServer.recordedEvents[0].skill_name, "baseline-convention-registry");
});

test("Tier 1 - F05.5: Ingestion Rejects Non-JSON Payloads Gracefully", async (t) => {
  const mockServer = await createMockTelemetryServer();
  t.after(() => mockServer.close());

  const res = await fetch(`${mockServer.url}/api/telemetry/record`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "NOT_VALID_JSON_STRING{{{",
  });

  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.error, "Invalid JSON");
});
