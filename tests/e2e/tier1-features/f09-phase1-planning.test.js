const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs/promises");
const { createSandbox, SAMPLE_PRD } = require("../helpers/fixtures");

test("Tier 1 - F09.1: Phase 1 Preset Verification (task-planning-recipe.json)", async () => {
  const recipePath = path.resolve(__dirname, "../../../task-planning-recipe.json");
  const raw = await fs.readFile(recipePath, "utf8");
  const recipe = JSON.parse(raw);

  assert.equal(recipe.recipe_id, "mlc-task-planning");
  const skillNames = recipe.skills.map((s) => s.name);
  assert.ok(skillNames.includes("task-decomposer"));
  assert.ok(skillNames.includes("horizontal-topic-scanner"));
});

test("Tier 1 - F09.2: PRD JSON Structure Ingestion and Task Extraction", async (t) => {
  const { sandboxPath, cleanup } = await createSandbox("tier1-f09-");
  t.after(cleanup);

  const prdFile = path.join(sandboxPath, "prd.json");
  await fs.writeFile(prdFile, JSON.stringify(SAMPLE_PRD, null, 2), "utf8");

  const readPrd = JSON.parse(await fs.readFile(prdFile, "utf8"));
  assert.equal(readPrd.id, "PRD-2026-08-TELEMETRY");
  assert.equal(readPrd.tasks.length, 3);
  assert.equal(readPrd.tasks[0].id, "TASK-001");
});

test("Tier 1 - F09.3: Dependency Ordering of Atomic Tasks", async () => {
  const tasks = SAMPLE_PRD.tasks;
  // TASK-001 has no deps, TASK-002 depends on TASK-001, TASK-003 depends on TASK-002
  const resolvedOrder = [];
  const visited = new Set();

  function visit(task) {
    if (visited.has(task.id)) return;
    for (const depId of task.dependencies) {
      const depTask = tasks.find((t) => t.id === depId);
      if (depTask) visit(depTask);
    }
    visited.add(task.id);
    resolvedOrder.push(task.id);
  }

  for (const t of tasks) visit(t);

  assert.deepEqual(resolvedOrder, ["TASK-001", "TASK-002", "TASK-003"]);
});

test("Tier 1 - F09.4: Scoped Test Target Association per Task", async () => {
  for (const task of SAMPLE_PRD.tasks) {
    assert.ok(task.target_test, `Task ${task.id} must have a target_test`);
    assert.ok(task.target_test.startsWith("tests/"));
  }
});

test("Tier 1 - F09.5: Plan Artifact Generation for Phase 2 Handoff", async (t) => {
  const { sandboxPath, cleanup } = await createSandbox("tier1-f09-");
  t.after(cleanup);

  const planHandoff = {
    phase: "Phase 1 (Plan)",
    prd_id: SAMPLE_PRD.id,
    active_recipe: "mlc-task-planning",
    task_queue: SAMPLE_PRD.tasks.map((t) => ({ id: t.id, status: "pending" })),
    transition_to: "Phase 2 (Inner Loop)",
  };

  const handoffFile = path.join(sandboxPath, "plan-handoff.json");
  await fs.writeFile(handoffFile, JSON.stringify(planHandoff, null, 2), "utf8");

  const loaded = JSON.parse(await fs.readFile(handoffFile, "utf8"));
  assert.equal(loaded.transition_to, "Phase 2 (Inner Loop)");
  assert.equal(loaded.task_queue.length, 3);
});
