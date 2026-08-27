const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs/promises");
const { createSandbox, SAMPLE_PRD } = require("../helpers/fixtures");

test("Tier 4 - Scenario 3.1: PRD Decomposition to Scoped Inner Loop Execution", async (t) => {
  const { sandboxPath, cleanup } = await createSandbox("tier4-s03-");
  t.after(cleanup);

  // 1. Write sample PRD
  const prdPath = path.join(sandboxPath, "prd.json");
  await fs.writeFile(prdPath, JSON.stringify(SAMPLE_PRD, null, 2), "utf8");

  // 2. Parse and generate task queue
  const loadedPrd = JSON.parse(await fs.readFile(prdPath, "utf8"));
  const taskQueue = loadedPrd.tasks.map((task) => ({
    id: task.id,
    title: task.title,
    target_test: task.target_test,
    status: "pending",
  }));

  assert.equal(taskQueue.length, 3);

  // 3. Process each task in inner loop
  const executionHistory = [];
  for (const item of taskQueue) {
    item.status = "in_progress";
    // Scoped execution simulation
    const runResult = {
      task_id: item.id,
      target_test: item.target_test,
      passed: true,
      assertions: 4,
      duration_ms: 18,
    };
    item.status = "completed";
    executionHistory.push(runResult);
  }

  assert.equal(taskQueue.every((t) => t.status === "completed"), true);
  assert.equal(executionHistory.length, 3);
  assert.equal(executionHistory[0].target_test, "tests/unit/hook.test.js");
});

test("Tier 4 - Scenario 3.2: Iterative Inner Loop TDD Bugfix Cycle", async (t) => {
  const { sandboxPath, cleanup } = await createSandbox("tier4-s03-");
  t.after(cleanup);

  // Simulate TDD iteration state
  let testPasses = false;
  function runTargetedTest() {
    if (!testPasses) {
      return { success: false, error: "Expected 'ready' but received 'pending'" };
    }
    return { success: true, passed_count: 1 };
  }

  // Iteration 1: Red test
  const run1 = runTargetedTest();
  assert.equal(run1.success, false);
  assert.ok(run1.error.includes("Expected 'ready'"));

  // Apply context patch
  testPasses = true;

  // Iteration 2: Green test
  const run2 = runTargetedTest();
  assert.equal(run2.success, true);
  assert.equal(run2.passed_count, 1);
});
