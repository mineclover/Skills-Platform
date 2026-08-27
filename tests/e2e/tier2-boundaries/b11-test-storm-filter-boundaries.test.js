const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

function evaluateTestCommand(cmd, targetTest) {
  if (!cmd || typeof cmd !== "string") return { allowed: false, reason: "Empty command" };
  const lower = cmd.toLowerCase().trim();

  // Check for full suite patterns in subshells or direct
  const blockedPatterns = [
    /\bnpm\s+(?:run\s+)?test\b/,
    /\bpytest\b/,
    /\bcargo\s+test\b/,
    /\bvitest\s+run\b/,
    /\bjest\b/,
    /\bnode\s+--test\s*$/,
  ];

  for (const pattern of blockedPatterns) {
    if (pattern.test(lower)) {
      return { allowed: false, reason: "Full regression suite storm blocked during Phase 2 inner loop." };
    }
  }

  if (targetTest) {
    const normTarget = path.normalize(targetTest).toLowerCase();
    const tokens = cmd.split(/\s+/).map((t) => path.normalize(t.replace(/['"]/g, "")).toLowerCase());
    const targets = tokens.filter((t) => t.endsWith(".js") || t.endsWith(".ts") || t.endsWith(".py"));

    if (targets.length > 1) {
      return { allowed: false, reason: "Multiple test targets provided; single scoped test required." };
    }

    if (targets.length === 1 && !targets[0].includes(normTarget) && !normTarget.includes(targets[0])) {
      return { allowed: false, reason: `Target ${targets[0]} does not match assigned task target: ${targetTest}` };
    }
  }

  return { allowed: true };
}

test("Tier 2 - B11.1: Blocks Subshell Nested Invocations", () => {
  const cmd = 'pwsh -Command "npm test"';
  const res = evaluateTestCommand(cmd, "tests/unit/scoped.test.js");
  assert.equal(res.allowed, false);
  assert.ok(res.reason.includes("storm blocked"));
});

test("Tier 2 - B11.2: Blocks Full Suite with Additional Flags", () => {
  const cmd = "npm test -- --bail --coverage";
  const res = evaluateTestCommand(cmd, "tests/unit/scoped.test.js");
  assert.equal(res.allowed, false);
});

test("Tier 2 - B11.3: Path Traversal Normalization Matches Assigned Scoped Target", () => {
  const cmd = "node --test ./tests/unit/../unit/scoped.test.js";
  const res = evaluateTestCommand(cmd, "tests/unit/scoped.test.js");
  assert.equal(res.allowed, true);
});

test("Tier 2 - B11.4: Multiple Test Files In Single Invocations Are Blocked", () => {
  const cmd = "node --test tests/unit/scoped.test.js tests/unit/other.test.js";
  const res = evaluateTestCommand(cmd, "tests/unit/scoped.test.js");
  assert.equal(res.allowed, false);
  assert.ok(res.reason.includes("Multiple test targets"));
});

test("Tier 2 - B11.5: Trailing Comment Injection Does Not Bypass Filter", () => {
  const cmd = "npm test # run only scoped";
  const res = evaluateTestCommand(cmd, "tests/unit/scoped.test.js");
  assert.equal(res.allowed, false);
});
