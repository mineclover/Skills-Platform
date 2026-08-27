const test = require("node:test");
const assert = require("node:assert/strict");

function formatPercentage(num, total) {
  if (!total || total <= 0) return "0.0%";
  const pct = (num / total) * 100;
  return `${pct.toFixed(1)}%`;
}

function formatNumber(num) {
  if (typeof num !== "number" || isNaN(num)) return "0";
  return num.toLocaleString("en-US");
}

function formatAvgDuration(avg) {
  if (typeof avg !== "number" || isNaN(avg) || avg < 0) return "0ms";
  return `${Math.round(avg * 100) / 100}ms`;
}

test("Tier 2 - B14.1: Floating Point Percentages Formatted Cleanly (1 Decimal)", () => {
  assert.equal(formatPercentage(1, 3), "33.3%");
  assert.equal(formatPercentage(2, 3), "66.7%");
  assert.equal(formatPercentage(1, 1), "100.0%");
});

test("Tier 2 - B14.2: Division by Zero Percentage Returns Safe Default", () => {
  assert.equal(formatPercentage(0, 0), "0.0%");
  assert.equal(formatPercentage(5, 0), "0.0%");
});

test("Tier 2 - B14.3: Average Duration Decimal Rounding", () => {
  assert.equal(formatAvgDuration(45.6789), "45.68ms");
  assert.equal(formatAvgDuration(0), "0ms");
  assert.equal(formatAvgDuration(-10), "0ms");
});

test("Tier 2 - B14.4: Large Integer Number Formatting with Commas", () => {
  assert.equal(formatNumber(1000), "1,000");
  assert.equal(formatNumber(1500250), "1,500,250");
  assert.equal(formatNumber(0), "0");
});

test("Tier 2 - B14.5: Metric Values Sanitization for Negative Numbers", () => {
  function sanitizeMetric(val) {
    if (typeof val !== "number" || isNaN(val) || val < 0) return 0;
    return val;
  }

  assert.equal(sanitizeMetric(-50), 0);
  assert.equal(sanitizeMetric(NaN), 0);
  assert.equal(sanitizeMetric(120), 120);
});
