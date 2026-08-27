const test = require("node:test");
const assert = require("node:assert/strict");

function topologicalSortTasks(tasks) {
  const taskMap = new Map(tasks.map((t) => [t.id, t]));
  const order = [];
  const visiting = new Set();
  const visited = new Set();

  function visit(taskId) {
    if (visiting.has(taskId)) {
      throw new Error(`Circular dependency detected involving task: ${taskId}`);
    }
    if (visited.has(taskId)) return;

    visiting.add(taskId);
    const task = taskMap.get(taskId);
    if (!task) throw new Error(`Task dependency not found: ${taskId}`);

    for (const depId of task.dependencies || []) {
      visit(depId);
    }
    visiting.delete(taskId);
    visited.add(taskId);
    order.push(taskId);
  }

  for (const t of tasks) {
    if (!visited.has(t.id)) visit(t.id);
  }
  return order;
}

test("Tier 2 - B09.1: Circular Dependency Detection in PRD Tasks", () => {
  const circularTasks = [
    { id: "TASK-A", dependencies: ["TASK-B"] },
    { id: "TASK-B", dependencies: ["TASK-C"] },
    { id: "TASK-C", dependencies: ["TASK-A"] },
  ];

  assert.throws(() => topologicalSortTasks(circularTasks), /Circular dependency detected/);
});

test("Tier 2 - B09.2: Empty PRD Tasks List Handled Gracefully", () => {
  const emptyTasks = [];
  const order = topologicalSortTasks(emptyTasks);
  assert.deepEqual(order, []);
});

test("Tier 2 - B09.3: Duplicate Task IDs Flagged as Invalid", () => {
  const tasks = [
    { id: "TASK-1", dependencies: [] },
    { id: "TASK-1", dependencies: [] },
  ];

  function validateTaskUniqueness(list) {
    const ids = new Set();
    for (const t of list) {
      if (ids.has(t.id)) return { valid: false, error: `Duplicate task ID: ${t.id}` };
      ids.add(t.id);
    }
    return { valid: true };
  }

  const res = validateTaskUniqueness(tasks);
  assert.equal(res.valid, false);
  assert.ok(res.error.includes("Duplicate task ID"));
});

test("Tier 2 - B09.4: Deep Linear Dependency Graph (10 Tasks)", () => {
  const tasks = [];
  for (let i = 0; i < 10; i++) {
    tasks.push({
      id: `TASK-${i}`,
      dependencies: i === 0 ? [] : [`TASK-${i - 1}`],
    });
  }

  const order = topologicalSortTasks(tasks);
  assert.equal(order.length, 10);
  assert.equal(order[0], "TASK-0");
  assert.equal(order[9], "TASK-9");
});

test("Tier 2 - B09.5: Missing Target Test File Path Rejection", () => {
  function validateTaskSchema(task) {
    if (!task.target_test || typeof task.target_test !== "string" || task.target_test.trim().length === 0) {
      return { valid: false, error: `Task ${task.id} is missing target_test` };
    }
    return { valid: true };
  }

  const invalid = { id: "TASK-X", dependencies: [] };
  const res = validateTaskSchema(invalid);
  assert.equal(res.valid, false);
  assert.ok(res.error.includes("missing target_test"));
});
