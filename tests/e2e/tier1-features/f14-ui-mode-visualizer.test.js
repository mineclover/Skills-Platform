const test = require("node:test");
const assert = require("node:assert/strict");

/**
 * Invocation mode calculation and visualizer helper logic
 */
function calculateModePercentages(byMode, total) {
  if (!total || total <= 0) {
    return {
      model_invoked: 0,
      user_invoked: 0,
      hybrid: 0,
      unspecified: 0,
    };
  }
  return {
    model_invoked: Math.round(((byMode.model_invoked || 0) / total) * 1000) / 10,
    user_invoked: Math.round(((byMode.user_invoked || 0) / total) * 1000) / 10,
    hybrid: Math.round(((byMode.hybrid || 0) / total) * 1000) / 10,
    unspecified: Math.round(((byMode.unspecified || 0) / total) * 1000) / 10,
  };
}

function getModeDisplayMeta(mode) {
  switch (mode) {
    case "model_invoked":
      return { label: "Model Invoked", color: "blue", tag: "AI Auto" };
    case "user_invoked":
      return { label: "User Invoked", color: "purple", tag: "Explicit" };
    case "hybrid":
      return { label: "Hybrid", color: "teal", tag: "Collaborative" };
    case "unspecified":
    default:
      return { label: "Unspecified", color: "gray", tag: "Default" };
  }
}

test("Tier 1 - F14.1: Invocation Mode Percentage Distribution Math", () => {
  const byMode = { model_invoked: 50, user_invoked: 30, hybrid: 20, unspecified: 0 };
  const total = 100;
  const pcts = calculateModePercentages(byMode, total);

  assert.equal(pcts.model_invoked, 50.0);
  assert.equal(pcts.user_invoked, 30.0);
  assert.equal(pcts.hybrid, 20.0);
  assert.equal(pcts.unspecified, 0.0);
});

test("Tier 1 - F14.2: Zero-Invocation Avoids NaN or Division by Zero", () => {
  const byMode = { model_invoked: 0, user_invoked: 0, hybrid: 0, unspecified: 0 };
  const pcts = calculateModePercentages(byMode, 0);

  assert.equal(isNaN(pcts.model_invoked), false);
  assert.equal(pcts.model_invoked, 0);
  assert.equal(pcts.user_invoked, 0);
});

test("Tier 1 - F14.3: Visual Metadata Resolution for All Invocation Modes", () => {
  const modes = ["model_invoked", "user_invoked", "hybrid", "unspecified"];
  for (const mode of modes) {
    const meta = getModeDisplayMeta(mode);
    assert.ok(meta.label);
    assert.ok(meta.color);
    assert.ok(meta.tag);
  }
});

test("Tier 1 - F14.4: Health Distribution Calculation", () => {
  const byHealth = { healthy: 95, needs_review: 5, unknown: 0 };
  const total = byHealth.healthy + byHealth.needs_review + byHealth.unknown;
  const healthRate = (byHealth.healthy / total) * 100;

  assert.equal(healthRate, 95);
});

test("Tier 1 - F14.5: Duration Formatting for UI Display", () => {
  function formatDuration(ms) {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  }

  assert.equal(formatDuration(45), "45ms");
  assert.equal(formatDuration(1500), "1.50s");
  assert.equal(formatDuration(10000), "10.00s");
});
