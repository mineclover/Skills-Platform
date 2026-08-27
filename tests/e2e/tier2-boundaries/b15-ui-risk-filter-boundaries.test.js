const test = require("node:test");
const assert = require("node:assert/strict");

function extractReviewQueueItems(events) {
  if (!Array.isArray(events)) return [];
  const riskOutcomes = new Set(["risk", "correction", "scope_mismatch"]);

  return events
    .filter((e) => e && e.outcome && riskOutcomes.has(e.outcome.toLowerCase()))
    .map((e) => ({
      timestamp: e.timestamp,
      skill_name: e.skill_name,
      outcome: e.outcome.toLowerCase(),
      evidence_type: e.evidence_type,
      summary: e.summary || "No summary provided",
      provider_id: e.provider_id,
    }));
}

test("Tier 2 - B15.1: Case-Insensitive Outcome Normalization", () => {
  const events = [
    { skill_name: "s1", outcome: "RISK", summary: "Uppercase risk" },
    { skill_name: "s2", outcome: "Correction", summary: "Mixed case correction" },
    { skill_name: "s3", outcome: "SUCCESS", summary: "Uppercase success" },
  ];

  const queue = extractReviewQueueItems(events);
  assert.equal(queue.length, 2);
  assert.equal(queue[0].outcome, "risk");
  assert.equal(queue[1].outcome, "correction");
});

test("Tier 2 - B15.2: Unknown Outcome Safely Excluded from Risk Queue", () => {
  const events = [{ skill_name: "s1", outcome: "unknown_weird_state", summary: "Weird outcome" }];
  const queue = extractReviewQueueItems(events);
  assert.equal(queue.length, 0);
});

test("Tier 2 - B15.3: Empty or Non-Array Input Returns Empty Queue", () => {
  assert.deepEqual(extractReviewQueueItems([]), []);
  assert.deepEqual(extractReviewQueueItems(null), []);
  assert.deepEqual(extractReviewQueueItems(undefined), []);
});

test("Tier 2 - B15.4: 100% Risk Events Retained in Full", () => {
  const events = [
    { skill_name: "s1", outcome: "risk" },
    { skill_name: "s2", outcome: "scope_mismatch" },
    { skill_name: "s3", outcome: "correction" },
  ];

  const queue = extractReviewQueueItems(events);
  assert.equal(queue.length, 3);
});

test("Tier 2 - B15.5: Fallback Summary When Summary Is Null or Missing", () => {
  const events = [{ skill_name: "s1", outcome: "risk", summary: null }];
  const queue = extractReviewQueueItems(events);
  assert.equal(queue[0].summary, "No summary provided");
});
