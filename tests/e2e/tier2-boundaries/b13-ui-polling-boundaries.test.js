const test = require("node:test");
const assert = require("node:assert/strict");

test("Tier 2 - B13.1: Polling Exponential Backoff on HTTP 503 Service Unavailable", () => {
  function getNextInterval(currentInterval, consecutiveFailures, maxInterval = 30000) {
    if (consecutiveFailures === 0) return 3000;
    const backoff = currentInterval * Math.pow(1.5, consecutiveFailures);
    return Math.min(Math.round(backoff), maxInterval);
  }

  assert.equal(getNextInterval(3000, 0), 3000);
  assert.equal(getNextInterval(3000, 1), 4500);
  assert.equal(getNextInterval(3000, 2), 6750);
  assert.equal(getNextInterval(3000, 10), 30000); // capped at max
});

test("Tier 2 - B13.2: Handles Empty JSON Response Gracefully", () => {
  function sanitizeSummaryResponse(data) {
    return {
      total_invocations: data?.total_invocations ?? 0,
      average_duration_ms: data?.average_duration_ms ?? 0,
      success_rate: data?.success_rate ?? 1.0,
      by_mode: data?.by_mode ?? { model_invoked: 0, user_invoked: 0, hybrid: 0, unspecified: 0 },
      by_provider: data?.by_provider ?? {},
      by_health: data?.by_health ?? { healthy: 0, needs_review: 0, unknown: 0 },
      recent_events: data?.recent_events ?? [],
    };
  }

  const sanitized = sanitizeSummaryResponse({});
  assert.equal(sanitized.total_invocations, 0);
  assert.equal(sanitized.success_rate, 1.0);
  assert.deepEqual(sanitized.recent_events, []);
});

test("Tier 2 - B13.3: Polling Timer Lifecycle and Cleanup", () => {
  let timerActive = false;
  function startPolling() {
    timerActive = true;
    return () => {
      timerActive = false;
    };
  }

  const stop = startPolling();
  assert.equal(timerActive, true);
  stop();
  assert.equal(timerActive, false);
});

test("Tier 2 - B13.4: Rejects Malformed Content-Type Header", () => {
  function isJsonContent(contentType) {
    if (!contentType) return false;
    return contentType.toLowerCase().includes("application/json");
  }

  assert.equal(isJsonContent("text/html; charset=utf-8"), false);
  assert.equal(isJsonContent("application/json; charset=utf-8"), true);
});

test("Tier 2 - B13.5: Prevents Race Conditions in Out-of-Order Responses", () => {
  let lastRequestId = 0;
  let activeState = null;

  function handleResponse(reqId, data) {
    if (reqId < lastRequestId) {
      // Ignore stale response
      return false;
    }
    lastRequestId = reqId;
    activeState = data;
    return true;
  }

  assert.equal(handleResponse(1, { version: 1 }), true);
  assert.equal(handleResponse(3, { version: 3 }), true);
  // Stale request 2 arrives late
  assert.equal(handleResponse(2, { version: 2 }), false);
  assert.equal(activeState.version, 3);
});
