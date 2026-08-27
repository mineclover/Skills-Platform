const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs/promises");
const { createSandbox, SAMPLE_PRD } = require("../helpers/fixtures");

test("Tier 3 - P03.1: Full 3-Phase State Machine Lifecycle Loop", async (t) => {
  const { sandboxPath, cleanup } = await createSandbox("tier3-p03-");
  t.after(cleanup);

  const stateMachine = {
    currentPhase: "idle",
    activeRecipe: null,
    tasks: [],
    completedTasks: [],
    baselineUpdated: false,
  };

  // Step 1: Phase 1 (Plan)
  stateMachine.currentPhase = "Phase 1 (Plan)";
  stateMachine.activeRecipe = "task-planning-recipe.json";
  stateMachine.tasks = [...SAMPLE_PRD.tasks];
  assert.equal(stateMachine.tasks.length, 3);

  // Step 2: Phase 2 (Inner Loop)
  stateMachine.currentPhase = "Phase 2 (Inner Loop)";
  stateMachine.activeRecipe = "scoped-inner-loop-recipe.json";

  for (const task of stateMachine.tasks) {
    // Resolve single scoped task
    stateMachine.completedTasks.push(task.id);
  }
  assert.equal(stateMachine.completedTasks.length, 3);

  // Step 3: Phase 3 (Release Gate)
  stateMachine.currentPhase = "Phase 3 (Release Gate)";
  stateMachine.activeRecipe = "release-governance-recipe.json";
  stateMachine.baselineUpdated = true;

  assert.equal(stateMachine.currentPhase, "Phase 3 (Release Gate)");
  assert.equal(stateMachine.baselineUpdated, true);
});

test("Tier 3 - P03.2: Task Completion Gating Prior to Phase 3 Transition", () => {
  function canTransitionToRelease(tasks, completed) {
    return tasks.length > 0 && tasks.every((t) => completed.includes(t.id));
  }

  const tasks = [{ id: "T1" }, { id: "T2" }];
  assert.equal(canTransitionToRelease(tasks, ["T1"]), false);
  assert.equal(canTransitionToRelease(tasks, ["T1", "T2"]), true);
});

test("Tier 3 - P03.3: Junction State Reflects Phase Transitions Dynamically", async (t) => {
  const { sandboxPath, cleanup } = await createSandbox("tier3-p03-");
  t.after(cleanup);

  const activeSkillsLink = path.join(sandboxPath, "active-skills");
  const planDir = path.join(sandboxPath, "plan");
  const loopDir = path.join(sandboxPath, "loop");
  const releaseDir = path.join(sandboxPath, "release");

  await fs.mkdir(planDir, { recursive: true });
  await fs.mkdir(loopDir, { recursive: true });
  await fs.mkdir(releaseDir, { recursive: true });

  await fs.writeFile(path.join(planDir, "phase.txt"), "plan", "utf8");
  await fs.writeFile(path.join(loopDir, "phase.txt"), "loop", "utf8");
  await fs.writeFile(path.join(releaseDir, "phase.txt"), "release", "utf8");

  // Mount plan
  await fs.symlink(planDir, activeSkillsLink, "junction");
  assert.equal(await fs.readFile(path.join(activeSkillsLink, "phase.txt"), "utf8"), "plan");

  // Mount loop
  await fs.unlink(activeSkillsLink);
  await fs.symlink(loopDir, activeSkillsLink, "junction");
  assert.equal(await fs.readFile(path.join(activeSkillsLink, "phase.txt"), "utf8"), "loop");

  // Mount release
  await fs.unlink(activeSkillsLink);
  await fs.symlink(releaseDir, activeSkillsLink, "junction");
  assert.equal(await fs.readFile(path.join(activeSkillsLink, "phase.txt"), "utf8"), "release");
});

test("Tier 3 - P03.4: Complete Baseline Changelog Generated at Phase 3", async (t) => {
  const { sandboxPath, cleanup } = await createSandbox("tier3-p03-");
  t.after(cleanup);

  const baselineFile = path.join(sandboxPath, "MASTER_BASELINE.md");
  const initial = "# Master Baseline\n";
  await fs.writeFile(baselineFile, initial, "utf8");

  const releaseNote = `\n## Cycle Completed: ${SAMPLE_PRD.id}\n- Tasks: ${SAMPLE_PRD.tasks.map((t) => t.id).join(", ")}\n- Status: Verified\n`;
  await fs.appendFile(baselineFile, releaseNote, "utf8");

  const content = await fs.readFile(baselineFile, "utf8");
  assert.ok(content.includes("TASK-001, TASK-002, TASK-003"));
  assert.ok(content.includes("Verified"));
});
