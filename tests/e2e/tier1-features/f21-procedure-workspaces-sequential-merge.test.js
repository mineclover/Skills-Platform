const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs/promises");
const os = require("node:os");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(__dirname, "../../..");

const {
  validateProcedureWorkspace,
  createProcedureWorkspace,
  PROCEDURE_TYPES,
  PROCEDURE_WORKSPACE_STATUSES,
} = require(path.resolve(ROOT, "packages/skill-contracts/dist/index.js"));

const {
  spawnProcedureWorkspace,
  pruneProcedureWorkspace,
  listProcedureWorkspaces,
  getProcedureWorkspace,
} = require(path.resolve(ROOT, "apps/skills-catalog/src/workspace-manager.js"));

const {
  enqueueWorkspace,
  verifyWorkspace,
  mergeWorkspace,
  discardWorkspace,
  getQueueStatus,
  processQueue,
} = require(path.resolve(ROOT, "apps/skills-catalog/src/sequential-merger.js"));

async function createSandboxGitRepo() {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "sp-e2e-sandbox-"));
  await execFileAsync("git", ["init", "-b", "main"], { cwd: tmpDir });
  await execFileAsync("git", ["config", "user.name", "E2E Tester"], { cwd: tmpDir });
  await execFileAsync("git", ["config", "user.email", "e2e@skills-platform.test"], { cwd: tmpDir });
  await fs.writeFile(path.join(tmpDir, "README.md"), "# E2E Sandbox\n", "utf8");
  await execFileAsync("git", ["add", "."], { cwd: tmpDir });
  await execFileAsync("git", ["commit", "-m", "Initial commit"], { cwd: tmpDir });
  return tmpDir;
}

// ----------------------------------------------------------------------------
// Tier 1 - Feature 21: Procedure-Responsible Isolated Workspaces & Merge Pipeline
// ----------------------------------------------------------------------------

test("Tier 1 - F21.1: ProcedureWorkspace Contract Schema Validation & Defaults", () => {
  assert.equal(PROCEDURE_TYPES.has("PLANNING"), true);
  assert.equal(PROCEDURE_TYPES.has("INNER_LOOP_TDD"), true);
  assert.equal(PROCEDURE_TYPES.has("SECURITY_AUDIT"), true);
  assert.equal(PROCEDURE_TYPES.has("RELEASE_GATE"), true);

  const ws = createProcedureWorkspace({
    procedure_type: "INNER_LOOP_TDD",
    workspace_id: "ws-test-tdd",
    responsibility_invariants: {
      target_test_file: "test/auth.test.js",
      owned_files: ["src/auth/"],
      prohibited_actions: ["npm test", "modify_contracts"],
      acceptance_criteria: ["100% target test pass"],
    },
    active_skills: ["tdd-inner-loop"],
    active_guards: ["test-storm-suppression-guard"],
  });

  assert.equal(ws.schema_version, 1);
  assert.equal(ws.workspace_id, "ws-test-tdd");
  assert.equal(ws.procedure_type, "INNER_LOOP_TDD");
  assert.equal(ws.status, "pending");
  assert.equal(ws.git_branch, "worktree/ws-test-tdd");

  const validation = validateProcedureWorkspace(ws);
  assert.equal(validation.valid, true);
  assert.deepEqual(validation.issues, []);
});

test("Tier 1 - F21.2: Git-Native Isolated Worktree Spawning & Skill Profile Isolation", async () => {
  const tempProject = await createSandboxGitRepo();
  try {
    // Spawn an isolated procedure workspace
    const ws = await spawnProcedureWorkspace({
      procedure_type: "INNER_LOOP_TDD",
      task_id: "task-01-jwt-fix",
      target_test_file: "test/jwt.test.js",
      owned_files: ["src/jwt.js"],
      prohibited_actions: ["npm test"],
      acceptance_criteria: ["Pass jwt.test.js"],
      project_path: tempProject,
      active_skills: ["vertical-spec-documenter", "skills-manager-testing"],
    });

    assert.ok(ws.workspace_id);
    assert.equal(ws.procedure_type, "INNER_LOOP_TDD");
    assert.equal(ws.status, "active");

    const worktreeStat = await fs.stat(path.resolve(tempProject, ws.git_worktree_path));
    assert.ok(worktreeStat.isDirectory(), "Worktree directory must exist on disk");

    const activeList = await listProcedureWorkspaces({ project_path: tempProject, status: "active" });
    assert.equal(activeList.length, 1);
    assert.equal(activeList[0].workspace_id, ws.workspace_id);

    // Prune workspace
    const pruneRes = await pruneProcedureWorkspace(ws.workspace_id, { project_path: tempProject });
    assert.equal(pruneRes.pruned, true);

    const afterPruneActive = await listProcedureWorkspaces({ project_path: tempProject, status: "active" });
    assert.equal(afterPruneActive.length, 0);

    const prunedList = await listProcedureWorkspaces({ project_path: tempProject, status: "pruned" });
    assert.equal(prunedList.length, 1);
  } finally {
    await fs.rm(tempProject, { recursive: true, force: true }).catch(() => {});
  }
});

test("Tier 1 - F21.3: Sequential Merge Dependency Enforcement & Fast-Forward Progression", async () => {
  const tempProject = await createSandboxGitRepo();
  try {
    // Spawn Task 1 (Parent)
    const ws1 = await spawnProcedureWorkspace({
      procedure_type: "PLANNING",
      task_id: "task-01-plan",
      owned_files: ["docs/plan.md"],
      project_path: tempProject,
    });

    // Write file in ws1 and commit
    const ws1Path = path.resolve(tempProject, ws1.git_worktree_path);
    await fs.mkdir(path.join(ws1Path, "docs"), { recursive: true });
    await fs.writeFile(path.join(ws1Path, "docs/plan.md"), "# Plan Done\n", "utf8");
    await execFileAsync("git", ["add", "."], { cwd: ws1Path });
    await execFileAsync("git", ["commit", "-m", "feat: complete plan"], { cwd: ws1Path });

    // Spawn Task 2 (Child dependent on Task 1)
    const ws2 = await spawnProcedureWorkspace({
      procedure_type: "INNER_LOOP_TDD",
      task_id: "task-02-impl",
      owned_files: ["src/code.js"],
      project_path: tempProject,
    });

    const ws2Path = path.resolve(tempProject, ws2.git_worktree_path);
    await fs.mkdir(path.join(ws2Path, "src"), { recursive: true });
    await fs.writeFile(path.join(ws2Path, "src/code.js"), "module.exports = {};\n", "utf8");
    await execFileAsync("git", ["add", "."], { cwd: ws2Path });
    await execFileAsync("git", ["commit", "-m", "feat: complete code"], { cwd: ws2Path });

    // Enqueue both with dependency
    await enqueueWorkspace(ws1.workspace_id, { project_path: tempProject });
    await enqueueWorkspace(ws2.workspace_id, { project_path: tempProject, dependencies: [ws1.workspace_id] });

    // Try to merge Task 2 before Task 1 -> Must fail with DEPENDENCY_NOT_MERGED
    await assert.rejects(
      async () => {
        await mergeWorkspace(ws2.workspace_id, { project_path: tempProject });
      },
      (err) => {
        return err.code === "DEPENDENCY_NOT_MERGED";
      }
    );

    // Merge Task 1 -> Succeeds
    const merge1 = await mergeWorkspace(ws1.workspace_id, { project_path: tempProject });
    assert.equal(merge1.merged, true);

    // Now Task 2 can merge -> Succeeds
    const merge2 = await mergeWorkspace(ws2.workspace_id, { project_path: tempProject });
    assert.equal(merge2.merged, true);

    // Verify main branch now has both files
    const mainPlan = await fs.readFile(path.join(tempProject, "docs/plan.md"), "utf8");
    const mainCode = await fs.readFile(path.join(tempProject, "src/code.js"), "utf8");
    assert.ok(mainPlan.includes("Plan Done"));
    assert.ok(mainCode.includes("module.exports"));
  } finally {
    await fs.rm(tempProject, { recursive: true, force: true }).catch(() => {});
  }
});
