const test = require("node:test");
const assert = require("node:assert/strict");
const { VALID_TELEMETRY_EVENTS } = require("../helpers/fixtures");

/**
 * Filter risk items for ReviewQueue component
 */
function extractRiskSignals(events) {
  const riskOutcomes = new Set(["risk", "correction", "scope_mismatch"]);
  return events.filter((e) => riskOutcomes.has(e.outcome));
}

test("Tier 1 - F15.1: ReviewQueue Risk Signal Extraction", () => {
  const events = [
    VALID_TELEMETRY_EVENTS.antigravitySkillLoad, // outcome: success
    VALID_TELEMETRY_EVENTS.claudeToolExecution,   // outcome: correction
    VALID_TELEMETRY_EVENTS.releaseGovernanceGate, // outcome: risk
    VALID_TELEMETRY_EVENTS.codexRalphStream,      // outcome: neutral
  ];

  const risks = extractRiskSignals(events);
  assert.equal(risks.length, 2);
  assert.equal(risks[0].outcome, "correction");
  assert.equal(risks[1].outcome, "risk");
});

test("Tier 1 - F15.2: Live Activity Feed Stream Sorting", () => {
  const events = [
    { ...VALID_TELEMETRY_EVENTS.minimalEvent, timestamp: "2026-08-28T07:00:00.000Z", summary: "Event 1" },
    { ...VALID_TELEMETRY_EVENTS.minimalEvent, timestamp: "2026-08-28T07:05:00.000Z", summary: "Event 2" },
    { ...VALID_TELEMETRY_EVENTS.minimalEvent, timestamp: "2026-08-28T07:02:00.000Z", summary: "Event 3" },
  ];

  const sorted = [...events].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  assert.equal(sorted[0].summary, "Event 2");
  assert.equal(sorted[1].summary, "Event 3");
  assert.equal(sorted[2].summary, "Event 1");
});

test("Tier 1 - F15.3: LiveActivationDrawer Provider Indicator Aggregation", () => {
  const events = [
    { ...VALID_TELEMETRY_EVENTS.antigravitySkillLoad, provider_id: "antigravity" },
    { ...VALID_TELEMETRY_EVENTS.claudeToolExecution, provider_id: "claude" },
    { ...VALID_TELEMETRY_EVENTS.codexRalphStream, provider_id: "codex" },
    { ...VALID_TELEMETRY_EVENTS.releaseGovernanceGate, provider_id: "ralph-tui" },
  ];

  const providerCounts = events.reduce((acc, e) => {
    acc[e.provider_id] = (acc[e.provider_id] || 0) + 1;
    return acc;
  }, {});

  assert.equal(providerCounts.antigravity, 1);
  assert.equal(providerCounts.claude, 1);
  assert.equal(providerCounts.codex, 1);
  assert.equal(providerCounts["ralph-tui"], 1);
});

test("Tier 1 - F15.4: Skill Activity Breakdown Aggregation", () => {
  const events = [
    { ...VALID_TELEMETRY_EVENTS.antigravitySkillLoad, skill_name: "task-decomposer" },
    { ...VALID_TELEMETRY_EVENTS.antigravitySkillLoad, skill_name: "task-decomposer" },
    { ...VALID_TELEMETRY_EVENTS.claudeToolExecution, skill_name: "scoped-tdd-executor" },
  ];

  const skillCounts = events.reduce((acc, e) => {
    acc[e.skill_name] = (acc[e.skill_name] || 0) + 1;
    return acc;
  }, {});

  assert.equal(skillCounts["task-decomposer"], 2);
  assert.equal(skillCounts["scoped-tdd-executor"], 1);
});

test("Tier 1 - F15.5: Event Deduplication In Stream Feeds", () => {
  const event = VALID_TELEMETRY_EVENTS.antigravitySkillLoad;
  const feed = [event, { ...event }, { ...event, timestamp: "2026-08-28T07:01:00.000Z" }];

  const seen = new Set();
  const deduped = feed.filter((e) => {
    const key = `${e.timestamp}|${e.provider_id}|${e.skill_name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  assert.equal(deduped.length, 2);
});
