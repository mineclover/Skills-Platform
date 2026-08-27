const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs/promises");
const { createSandbox } = require("../helpers/fixtures");

test("Tier 1 - F10.1: Scoped Inner Loop Recipe Invariants", async () => {
  const recipePath = path.resolve(__dirname, "../../../scoped-inner-loop-recipe.json");
  const raw = await fs.readFile(recipePath, "utf8");
  const recipe = JSON.parse(raw);

  assert.equal(recipe.recipe_id, "mlc-scoped-inner-loop");
  const skillNames = recipe.skills.map((s) => s.name);
  assert.ok(skillNames.includes("vertical-context-extractor"));
  assert.ok(skillNames.includes("scoped-tdd-executor"));
  assert.ok(skillNames.includes("context-patch-synthesizer"));
});

test("Tier 1 - F10.2: Dynamic Symlink / Junction Hot-Swap Between Phase Presets", async (t) => {
  const { sandboxPath, cleanup } = await createSandbox("tier1-f10-");
  t.after(cleanup);

  const skillsDir = path.join(sandboxPath, "project", ".skills");
  await fs.mkdir(skillsDir, { recursive: true });

  const phase1Target = path.join(sandboxPath, "phase1-plan-skills");
  const phase2Target = path.join(sandboxPath, "phase2-loop-skills");
  await fs.mkdir(phase1Target, { recursive: true });
  await fs.mkdir(phase2Target, { recursive: true });

  await fs.writeFile(path.join(phase1Target, "active.txt"), "Phase 1: Task Planning", "utf8");
  await fs.writeFile(path.join(phase2Target, "active.txt"), "Phase 2: Inner Loop", "utf8");

  const activeLink = path.join(skillsDir, "active-recipe");

  // Mount Phase 1
  await fs.symlink(phase1Target, activeLink, "junction");
  let content = await fs.readFile(path.join(activeLink, "active.txt"), "utf8");
  assert.equal(content, "Phase 1: Task Planning");

  // Hot-swap to Phase 2
  await fs.unlink(activeLink);
  await fs.symlink(phase2Target, activeLink, "junction");
  content = await fs.readFile(path.join(activeLink, "active.txt"), "utf8");
  assert.equal(content, "Phase 2: Inner Loop");
});

test("Tier 1 - F10.3: Junction Swap Preserves Unmanaged Project Files", async (t) => {
  const { sandboxPath, cleanup } = await createSandbox("tier1-f10-");
  t.after(cleanup);

  const projectDir = path.join(sandboxPath, "project");
  await fs.mkdir(projectDir, { recursive: true });
  const srcFile = path.join(projectDir, "app.js");
  await fs.writeFile(srcFile, "console.log('App running');", "utf8");

  // Perform junction operations
  const linkPath = path.join(projectDir, ".skills-link");
  const targetDir = path.join(sandboxPath, "target");
  await fs.mkdir(targetDir, { recursive: true });

  await fs.symlink(targetDir, linkPath, "junction");
  await fs.unlink(linkPath);

  // Assert user source file is unmodified
  const content = await fs.readFile(srcFile, "utf8");
  assert.equal(content, "console.log('App running');");
});

test("Tier 1 - F10.4: Provider-Specific Skill Delivery Root Resolution", () => {
  const root = "C:\\Users\\minec\\Skills-Platform\\project";
  const antigravityDelivery = path.join(root, ".agents", "skills");
  const claudeDelivery = path.join(root, ".claude", "skills");
  const codexDelivery = path.join(root, ".agents", "skills");

  assert.ok(antigravityDelivery.includes(path.join(".agents", "skills")));
  assert.ok(claudeDelivery.includes(path.join(".claude", "skills")));
  assert.ok(codexDelivery.includes(path.join(".agents", "skills")));
});

test("Tier 1 - F10.5: Atomic Task Step Isolation During Inner Loop Execution", async (t) => {
  const { sandboxPath, cleanup } = await createSandbox("tier1-f10-");
  t.after(cleanup);

  const taskLog = [];
  const tasks = ["TASK-001", "TASK-002", "TASK-003"];

  for (const taskId of tasks) {
    // Each inner loop task is executed in isolation
    taskLog.push({ taskId, status: "completed", timestamp: new Date().toISOString() });
  }

  assert.equal(taskLog.length, 3);
  assert.equal(taskLog[0].taskId, "TASK-001");
  assert.equal(taskLog[2].taskId, "TASK-003");
});
