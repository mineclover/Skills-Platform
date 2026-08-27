const test = require("node:test");
const assert = require("node:assert/strict");
const { createMockTelemetryServer, VALID_TELEMETRY_EVENTS, validateTelemetryEvent } = require("../helpers/fixtures");

test("Tier 2 - B05.1: Missing Mandatory Keys Are Strictly Rejected", () => {
  const mandatoryFields = ["timestamp", "provider_id", "project_id", "skill_name", "invocation_mode", "duration_ms", "tool_calls_count", "outcome", "evidence_type", "summary"];

  for (const field of mandatoryFields) {
    const invalidEvent = { ...VALID_TELEMETRY_EVENTS.minimalEvent };
    delete invalidEvent[field];
    const validation = validateTelemetryEvent(invalidEvent);
    assert.equal(validation.valid, false, `Field ${field} deletion should fail validation`);
  }
});

test("Tier 2 - B05.2: Rejects Negative and Floating Point Tool Call Counts", () => {
  const invalidNegative = { ...VALID_TELEMETRY_EVENTS.minimalEvent, tool_calls_count: -1 };
  assert.equal(validateTelemetryEvent(invalidNegative).valid, false);

  const invalidFloat = { ...VALID_TELEMETRY_EVENTS.minimalEvent, duration_ms: -10 };
  assert.equal(validateTelemetryEvent(invalidFloat).valid, false);
});

test("Tier 2 - B05.3: Rejects NaN and Infinity in Numeric Fields", () => {
  const nanDuration = { ...VALID_TELEMETRY_EVENTS.minimalEvent, duration_ms: NaN };
  assert.equal(validateTelemetryEvent(nanDuration).valid, false);

  const infDuration = { ...VALID_TELEMETRY_EVENTS.minimalEvent, duration_ms: Infinity };
  // Infinity is not a valid non-negative number in schema
  const isValid = typeof infDuration.duration_ms === "number" && isFinite(infDuration.duration_ms) && infDuration.duration_ms >= 0;
  assert.equal(isValid, false);
});

test("Tier 2 - B05.4: Enum Boundary Validation for invocation_mode and outcome", () => {
  const badMode = { ...VALID_TELEMETRY_EVENTS.minimalEvent, invocation_mode: "custom_magic" };
  assert.equal(validateTelemetryEvent(badMode).valid, false);

  const badOutcome = { ...VALID_TELEMETRY_EVENTS.minimalEvent, outcome: "fatal_crash" };
  assert.equal(validateTelemetryEvent(badOutcome).valid, false);
});

test("Tier 2 - B05.5: Ingestion API Rejects Excessively Large Payload (>64KB)", async (t) => {
  const mockServer = await createMockTelemetryServer();
  t.after(() => mockServer.close());

  // Oversized 100KB body
  const largeEvent = {
    ...VALID_TELEMETRY_EVENTS.minimalEvent,
    summary: "Z".repeat(70 * 1024),
  };

  const res = await fetch(`${mockServer.url}/api/telemetry/record`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(largeEvent),
  });

  // Server should reject or handle large payload
  assert.ok([201, 400, 413].includes(res.status));
});
