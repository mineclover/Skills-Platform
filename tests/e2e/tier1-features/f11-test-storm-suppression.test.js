const test = require("node:test");
const assert = require("node:assert/strict");

/**
 * Filter logic verifying test storm suppression rules
 */
function isScopedTestExecution(commandLine, allowedTarget) {
  if (!commandLine || typeof commandLine !== "string") return false;
  const trimmed = commandLine.trim();

  // Full-suite regression commands that constitute test storms
  const stormPatterns = [
    /^npm\s+test\s*$/,
    /^npm\s+run\s+test\s*$/,
    /^npm\s+run\s+test:all\s*$/,
    /^npx\s+vitest\s+run\s*$/,
    /^npx\s+jest\s*$/,
    /^pytest\s*$/,
    /^cargo\s+test\s*$/,
    /^node\s+--test\s*$/,
  ];

  for (const pattern of stormPatterns) {
    if (pattern.test(trimmed)) {
      return { allowed: false, reason: "Full regression suite storm blocked during Phase 2 inner loop." };
    }
  }

  if (allowedTarget && !trimmed.includes(allowedTarget)) {
    return { allowed: false, reason: `Command does not target the assigned scoped test: ${allowedTarget}` };
  }

  return { allowed: true, target: allowedTarget || "scoped" };
}

test("Tier 1 - F11.1: Permitted Scoped Test Execution on Single Target", () => {
  const cmd = "node --test tests/unit/scoped-hook.test.js";
  const result = isScopedTestExecution(cmd, "tests/unit/scoped-hook.test.js");
  assert.equal(result.allowed, true);
});

test("Tier 1 - F11.2: Strict Suppression of 'npm test' Storms in Phase 2", () => {
  const result1 = isScopedTestExecution("npm test", "tests/unit/hook.test.js");
  assert.equal(result1.allowed, false);
  assert.ok(result1.reason.includes("storm blocked"));

  const result2 = isScopedTestExecution("npm run test", "tests/unit/hook.test.js");
  assert.equal(result2.allowed, false);
});

test("Tier 1 - F11.3: Suppression of Wildcard / Multi-File Invocations", () => {
  const result = isScopedTestExecution("node --test", "tests/unit/hook.test.js");
  assert.equal(result.allowed, false);
});

test("Tier 1 - F11.4: Validation Against Assigned Task Target Test", () => {
  const assigned = "tests/unit/my-module.test.js";
  const attempted = "node --test tests/unit/different-module.test.js";
  const result = isScopedTestExecution(attempted, assigned);

  assert.equal(result.allowed, false);
  assert.ok(result.reason.includes("does not target the assigned scoped test"));
});

test("Tier 1 - F11.5: Detailed Blocking Diagnostics Provided to Agent", () => {
  const result = isScopedTestExecution("pytest", "tests/unit/math.test.py");
  assert.equal(result.allowed, false);
  assert.ok(typeof result.reason === "string" && result.reason.length > 10);
});
