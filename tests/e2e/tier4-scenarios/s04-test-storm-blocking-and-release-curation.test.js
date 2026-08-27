const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs/promises");
const { createSandbox, SAMPLE_PRD } = require("../helpers/fixtures");

test("Tier 4 - Scenario 4.1: Rogue Agent Test Storm Attempt & Suppression Guard", async (t) => {
  const { sandboxPath, cleanup } = await createSandbox("tier4-s04-");
  t.after(cleanup);

  let currentPhase = "Phase 2 (Inner Loop)";
  const assignedTask = { id: "TASK-002", target_test: "tests/unit/api.test.js" };

  function executeCommandInPhase(cmd) {
    if (currentPhase === "Phase 2 (Inner Loop)") {
      if (/npm\s+test|pytest|cargo\s+test/i.test(cmd)) {
        return {
          allowed: false,
          error: "Full regression suite storm blocked during Phase 2. Use pinpoint scoped test.",
        };
      }
      if (!cmd.includes(assignedTask.target_test)) {
        return {
          allowed: false,
          error: `Test target does not match assigned scoped target: ${assignedTask.target_test}`,
        };
      }
    }
    return { allowed: true, stdout: "1 test passed" };
  }

  // 1. Rogue agent attempts full regression scan
  const stormAttempt = executeCommandInPhase("npm test");
  assert.equal(stormAttempt.allowed, false);
  assert.ok(stormAttempt.error.includes("storm blocked"));

  // 2. Rogue agent attempts wrong test file
  const wrongTargetAttempt = executeCommandInPhase("node --test tests/unit/other.test.js");
  assert.equal(wrongTargetAttempt.allowed, false);
  assert.ok(wrongTargetAttempt.error.includes("does not match assigned scoped target"));

  // 3. Agent follows guard instruction and runs pinpoint scoped test
  const validScopedRun = executeCommandInPhase("node --test tests/unit/api.test.js");
  assert.equal(validScopedRun.allowed, true);
  assert.equal(validScopedRun.stdout, "1 test passed");
});

test("Tier 4 - Scenario 4.2: Phase 3 Release Gate Passage & Baseline Curation", async (t) => {
  const { sandboxPath, cleanup } = await createSandbox("tier4-s04-");
  t.after(cleanup);

  const baselineFile = path.join(sandboxPath, "MASTER_BASELINE.md");
  await fs.writeFile(baselineFile, "# Master Baseline\n\n## Status\nInitial baseline.\n", "utf8");

  const completedTasks = SAMPLE_PRD.tasks.map((t) => t.id);
  const phase = "Phase 3 (Release Gate)";

  // Release gate authorizes single regression run
  const regressionResult = {
    authorized: phase === "Phase 3 (Release Gate)",
    total_tests: 174,
    passed_tests: 174,
    failed_tests: 0,
    duration_ms: 320,
  };

  assert.equal(regressionResult.authorized, true);
  assert.equal(regressionResult.failed_tests, 0);

  // Update canonical baseline
  const releaseEntry = `
## Cycle Release: ${SAMPLE_PRD.id}
- Date: ${new Date().toISOString()}
- Total Tasks Resolved: ${completedTasks.length} (${completedTasks.join(", ")})
- Regression Suite: ${regressionResult.passed_tests}/${regressionResult.total_tests} passed
- Status: Release Approved & Active
`;

  await fs.appendFile(baselineFile, releaseEntry, "utf8");

  const finalBaseline = await fs.readFile(baselineFile, "utf8");
  assert.ok(finalBaseline.includes("Release Approved & Active"));
  assert.ok(finalBaseline.length < 50000); // Under token limit
});
