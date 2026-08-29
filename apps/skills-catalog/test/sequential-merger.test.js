"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { execFile } = require("node:child_process");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { promisify } = require("node:util");

const {
  spawnProcedureWorkspace,
  pruneProcedureWorkspace,
  getProcedureWorkspace,
  loadWorkspaces,
} = require("../src/workspace-manager");

const {
  enqueueWorkspace,
  verifyWorkspace,
  mergeWorkspace,
  discardWorkspace,
  getQueueStatus,
  processQueue,
  loadMergeQueue,
  SequentialMerger,
} = require("../src/sequential-merger");

const execFileAsync = promisify(execFile);

/**
 * Creates an isolated temporary Git sandbox repository for tests.
 */
async function createSandboxGitRepo() {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "sp-merge-sandbox-"));

  await execFileAsync("git", ["init", "-b", "main"], { cwd: tmpDir });
  await execFileAsync("git", ["config", "user.name", "Test Agent"], { cwd: tmpDir });
  await execFileAsync("git", ["config", "user.email", "agent@skills-platform.test"], { cwd: tmpDir });

  // Initial commit
  await fs.writeFile(path.join(tmpDir, "README.md"), "# Skills Platform Test Repo\n", "utf8");
  await fs.writeFile(
    path.join(tmpDir, ".gitignore"),
    ".workspaces\n.agents/skills\n.claude/skills\n.skills-platform\n",
    "utf8"
  );
  await execFileAsync("git", ["add", "."], { cwd: tmpDir });
  await execFileAsync("git", ["commit", "-m", "Initial commit on main"], { cwd: tmpDir });

  return tmpDir;
}

/**
 * Cleans up a temporary sandbox Git repository.
 */
async function cleanupSandboxGitRepo(tmpDir) {
  try {
    await execFileAsync("git", ["worktree", "prune"], { cwd: tmpDir }).catch(() => {});
    await fs.rm(tmpDir, { recursive: true, force: true });
  } catch {}
}

test("Sequential Dependency Merge Orchestrator", async (t) => {
  let sandboxPath;

  t.beforeEach(async () => {
    sandboxPath = await createSandboxGitRepo();
  });

  t.afterEach(async () => {
    if (sandboxPath) {
      await cleanupSandboxGitRepo(sandboxPath);
    }
  });

  await t.test("1. Enqueues tasks with dependency lineage and persists merge-queue.json", async () => {
    // Spawn 3 workspaces
    await spawnProcedureWorkspace({
      procedure_type: "PLANNING",
      task_id: "task-01",
      project_path: sandboxPath,
    });
    await spawnProcedureWorkspace({
      procedure_type: "INNER_LOOP_TDD",
      task_id: "task-02",
      project_path: sandboxPath,
    });
    await spawnProcedureWorkspace({
      procedure_type: "RELEASE_GATE",
      task_id: "task-03",
      project_path: sandboxPath,
    });

    const enq1 = await enqueueWorkspace({
      workspace_id: "task-01",
      dependencies: [],
      project_path: sandboxPath,
    });
    assert.equal(enq1.enqueued, true);
    assert.equal(enq1.workspace_id, "task-01");
    assert.equal(enq1.position, 1);
    assert.equal(enq1.status, "pending");

    const enq2 = await enqueueWorkspace({
      workspace_id: "task-02",
      dependencies: ["task-01"],
      project_path: sandboxPath,
    });
    assert.equal(enq2.enqueued, true);
    assert.equal(enq2.workspace_id, "task-02");
    assert.equal(enq2.position, 2);

    const enq3 = await enqueueWorkspace({
      workspace_id: "task-03",
      dependencies: ["task-02"],
      project_path: sandboxPath,
    });
    assert.equal(enq3.enqueued, true);
    assert.equal(enq3.position, 3);

    // Verify persisted queue file
    const queue = await loadMergeQueue({ project_path: sandboxPath });
    assert.equal(queue.length, 3);
    assert.equal(queue[0].workspace_id, "task-01");
    assert.deepEqual(queue[0].dependencies, []);
    assert.equal(queue[1].workspace_id, "task-02");
    assert.deepEqual(queue[1].dependencies, ["task-01"]);
    assert.equal(queue[2].workspace_id, "task-03");
    assert.deepEqual(queue[2].dependencies, ["task-02"]);

    // Verify queue status summary
    const status = await getQueueStatus({ project_path: sandboxPath });
    assert.equal(status.queue.length, 3);
    assert.equal(status.pending.length, 3);
    assert.equal(status.merged.length, 0);
    assert.equal(status.current?.workspace_id, "task-01");
  });

  await t.test("2. Blocks out-of-order merge when dependencies are not merged yet", async () => {
    await spawnProcedureWorkspace({
      procedure_type: "INNER_LOOP_TDD",
      task_id: "task-01",
      project_path: sandboxPath,
    });
    await spawnProcedureWorkspace({
      procedure_type: "INNER_LOOP_TDD",
      task_id: "task-02",
      project_path: sandboxPath,
    });

    await enqueueWorkspace({ workspace_id: "task-01", dependencies: [], project_path: sandboxPath });
    await enqueueWorkspace({ workspace_id: "task-02", dependencies: ["task-01"], project_path: sandboxPath });

    // Attempt to merge task-02 before task-01 is merged
    await assert.rejects(
      async () => {
        await mergeWorkspace("task-02", { project_path: sandboxPath });
      },
      (err) => {
        assert.equal(err.code, "DEPENDENCY_NOT_MERGED");
        assert.ok(err.message.includes("task-01"));
        return true;
      }
    );

    // Main HEAD remains untouched
    const { stdout: mainHash } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: sandboxPath });
    const { stdout: logCount } = await execFileAsync("git", ["rev-list", "--count", "HEAD"], { cwd: sandboxPath });
    assert.equal(logCount.trim(), "1");
  });

  await t.test("3. 1:1 Target Test Verification Gate: passing test verifies successfully", async () => {
    const ws = await spawnProcedureWorkspace({
      procedure_type: "INNER_LOOP_TDD",
      task_id: "task-tdd-pass",
      target_test_file: "test/unit.test.js",
      owned_files: ["src/calculator.js", "test/unit.test.js"],
      project_path: sandboxPath,
    });

    const worktreePath = path.join(sandboxPath, ".workspaces", "task-tdd-pass");
    await fs.mkdir(path.join(worktreePath, "src"), { recursive: true });
    await fs.mkdir(path.join(worktreePath, "test"), { recursive: true });

    // Write implementation and test
    await fs.writeFile(
      path.join(worktreePath, "src", "calculator.js"),
      "function add(a, b) { return a + b; }\nmodule.exports = { add };\n",
      "utf8"
    );
    await fs.writeFile(
      path.join(worktreePath, "test", "unit.test.js"),
      'const test = require("node:test");\nconst assert = require("node:assert/strict");\nconst { add } = require("../src/calculator");\ntest("adds numbers", () => { assert.equal(add(2, 3), 5); });\n',
      "utf8"
    );

    // Stage and commit in worktree
    await execFileAsync("git", ["add", "."], { cwd: worktreePath });
    await execFileAsync("git", ["commit", "-m", "feat: add calculator with unit test"], { cwd: worktreePath });

    const verifyRes = await verifyWorkspace("task-tdd-pass", { project_path: sandboxPath });
    assert.equal(verifyRes.verified, true);
    assert.equal(verifyRes.invariant_checks.target_test, true);
    assert.equal(verifyRes.invariant_checks.owned_files, true);
    assert.equal(verifyRes.invariant_checks.prohibited_actions, true);
    assert.equal(verifyRes.issues.length, 0);

    const updatedWs = await getProcedureWorkspace("task-tdd-pass", { project_path: sandboxPath });
    assert.equal(updatedWs.status, "verified");
  });

  await t.test("4. 1:1 Target Test Verification Gate: failing test halts merge and discards branch", async () => {
    await spawnProcedureWorkspace({
      procedure_type: "INNER_LOOP_TDD",
      task_id: "task-tdd-fail",
      target_test_file: "test/failing.test.js",
      owned_files: ["src/failing.js", "test/failing.test.js"],
      project_path: sandboxPath,
    });

    const worktreePath = path.join(sandboxPath, ".workspaces", "task-tdd-fail");
    await fs.mkdir(path.join(worktreePath, "src"), { recursive: true });
    await fs.mkdir(path.join(worktreePath, "test"), { recursive: true });

    await fs.writeFile(
      path.join(worktreePath, "test", "failing.test.js"),
      'const test = require("node:test");\nconst assert = require("node:assert/strict");\ntest("intentionally fails", () => { assert.equal(1, 2, "Expected 1 to equal 2"); });\n',
      "utf8"
    );

    await execFileAsync("git", ["add", "."], { cwd: worktreePath });
    await execFileAsync("git", ["commit", "-m", "feat: broken implementation"], { cwd: worktreePath });

    await enqueueWorkspace({ workspace_id: "task-tdd-fail", dependencies: [], project_path: sandboxPath });

    // Attempting to merge should reject and discard
    await assert.rejects(
      async () => {
        await mergeWorkspace("task-tdd-fail", { project_path: sandboxPath });
      },
      (err) => {
        assert.equal(err.code, "VERIFICATION_FAILED");
        return true;
      }
    );

    // Verify workspace is marked discarded
    const updatedWs = await getProcedureWorkspace("task-tdd-fail", { project_path: sandboxPath });
    assert.equal(updatedWs.status, "discarded");

    // Verify worktree folder was removed
    let worktreeExists = true;
    try {
      await fs.stat(worktreePath);
    } catch {
      worktreeExists = false;
    }
    assert.equal(worktreeExists, false);

    // Verify root main is pristine
    const { stdout: logCount } = await execFileAsync("git", ["rev-list", "--count", "HEAD"], { cwd: sandboxPath });
    assert.equal(logCount.trim(), "1");
  });

  await t.test("5. Responsibility Invariant Gate: out-of-bounds file modifications fail verification", async () => {
    await spawnProcedureWorkspace({
      procedure_type: "INNER_LOOP_TDD",
      task_id: "task-out-of-bounds",
      target_test_file: "test/scoped.test.js",
      owned_files: ["src/scoped.js", "test/scoped.test.js"],
      project_path: sandboxPath,
    });

    const worktreePath = path.join(sandboxPath, ".workspaces", "task-out-of-bounds");
    await fs.mkdir(path.join(worktreePath, "src"), { recursive: true });
    await fs.mkdir(path.join(worktreePath, "test"), { recursive: true });

    // Create allowed files and a passing test
    await fs.writeFile(path.join(worktreePath, "src", "scoped.js"), "module.exports = 42;\n", "utf8");
    await fs.writeFile(
      path.join(worktreePath, "test", "scoped.test.js"),
      'const test = require("node:test");\nconst assert = require("node:assert/strict");\ntest("passes", () => { assert.ok(true); });\n',
      "utf8"
    );

    // Modify a forbidden out-of-bounds file
    await fs.writeFile(path.join(worktreePath, "unauthorized-secret.config"), "SECRET=true\n", "utf8");

    await execFileAsync("git", ["add", "."], { cwd: worktreePath });
    await execFileAsync("git", ["commit", "-m", "feat: scoped with forbidden file"], { cwd: worktreePath });

    const verifyRes = await verifyWorkspace("task-out-of-bounds", { project_path: sandboxPath });
    assert.equal(verifyRes.verified, false);
    assert.equal(verifyRes.invariant_checks.target_test, true);
    assert.equal(verifyRes.invariant_checks.owned_files, false);
    assert.ok(verifyRes.issues.some((issue) => issue.includes("unauthorized-secret.config")));

    const updatedWs = await getProcedureWorkspace("task-out-of-bounds", { project_path: sandboxPath });
    assert.equal(updatedWs.status, "failed");
  });

  await t.test("6. Atomic Fast-forward merge advances main HEAD and prunes worktree cleanly", async () => {
    await spawnProcedureWorkspace({
      procedure_type: "INNER_LOOP_TDD",
      task_id: "task-ff-01",
      target_test_file: "test/pass.test.js",
      owned_files: ["src/feature.js", "test/pass.test.js"],
      project_path: sandboxPath,
    });

    const worktreePath = path.join(sandboxPath, ".workspaces", "task-ff-01");
    await fs.mkdir(path.join(worktreePath, "src"), { recursive: true });
    await fs.mkdir(path.join(worktreePath, "test"), { recursive: true });

    await fs.writeFile(path.join(worktreePath, "src", "feature.js"), 'console.log("feature ready");\n', "utf8");
    await fs.writeFile(
      path.join(worktreePath, "test", "pass.test.js"),
      'const test = require("node:test");\nconst assert = require("node:assert/strict");\ntest("ok", () => assert.ok(true));\n',
      "utf8"
    );

    await execFileAsync("git", ["add", "."], { cwd: worktreePath });
    await execFileAsync("git", ["commit", "-m", "feat: new feature module"], { cwd: worktreePath });

    await enqueueWorkspace({ workspace_id: "task-ff-01", dependencies: [], project_path: sandboxPath });

    const mergeRes = await mergeWorkspace("task-ff-01", { project_path: sandboxPath });
    assert.equal(mergeRes.merged, true);
    assert.equal(mergeRes.workspace_id, "task-ff-01");
    assert.equal(mergeRes.status, "merged");
    assert.ok(typeof mergeRes.commit_hash === "string" && mergeRes.commit_hash.length >= 7);

    // Verify main repository has the merged file and advanced HEAD commit
    const { stdout: mainHead } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: sandboxPath });
    assert.equal(mainHead.trim(), mergeRes.commit_hash);

    const mergedFeatureContent = await fs.readFile(path.join(sandboxPath, "src", "feature.js"), "utf8");
    assert.ok(mergedFeatureContent.includes("feature ready"));

    // Verify worktree folder was pruned
    let worktreeExists = true;
    try {
      await fs.stat(worktreePath);
    } catch {
      worktreeExists = false;
    }
    assert.equal(worktreeExists, false);

    // Verify workspace status in storage
    const updatedWs = await getProcedureWorkspace("task-ff-01", { project_path: sandboxPath });
    assert.equal(updatedWs.status, "merged");
    assert.ok(updatedWs.completed_at !== null);
  });

  await t.test("7. Fault Isolation: discardWorkspace cleans worktree without polluting main", async () => {
    await spawnProcedureWorkspace({
      procedure_type: "PLANNING",
      task_id: "task-discard-test",
      project_path: sandboxPath,
    });

    const worktreePath = path.join(sandboxPath, ".workspaces", "task-discard-test");
    await fs.writeFile(path.join(worktreePath, "dirty-draft.txt"), "DRAFT DIRTY\n", "utf8");
    await execFileAsync("git", ["add", "."], { cwd: worktreePath });
    await execFileAsync("git", ["commit", "-m", "draft dirty work"], { cwd: worktreePath });

    await enqueueWorkspace({ workspace_id: "task-discard-test", dependencies: [], project_path: sandboxPath });

    const discardRes = await discardWorkspace("task-discard-test", {
      project_path: sandboxPath,
      reason: "Abandoned feature",
    });

    assert.equal(discardRes.discarded, true);
    assert.equal(discardRes.workspace_id, "task-discard-test");
    assert.equal(discardRes.reason, "Abandoned feature");

    // Check main branch is clean and has no trace of dirty-draft.txt
    let draftExistsInMain = true;
    try {
      await fs.stat(path.join(sandboxPath, "dirty-draft.txt"));
    } catch {
      draftExistsInMain = false;
    }
    assert.equal(draftExistsInMain, false);

    // Check branch was deleted
    const { stdout: branchList } = await execFileAsync("git", ["branch", "--list", "worktree/task-discard-test"], {
      cwd: sandboxPath,
    });
    assert.equal(branchList.trim(), "");
  });

  await t.test("8. processQueue executes full multi-task pipeline in dependency order", async () => {
    // task-01: Creates base helper
    await spawnProcedureWorkspace({
      procedure_type: "INNER_LOOP_TDD",
      task_id: "task-pipeline-01",
      target_test_file: "test/base.test.js",
      owned_files: ["src/base.js", "test/base.test.js"],
      project_path: sandboxPath,
    });
    const wt1 = path.join(sandboxPath, ".workspaces", "task-pipeline-01");
    await fs.mkdir(path.join(wt1, "src"), { recursive: true });
    await fs.mkdir(path.join(wt1, "test"), { recursive: true });
    await fs.writeFile(path.join(wt1, "src", "base.js"), "const BASE = 100;\nmodule.exports = { BASE };\n", "utf8");
    await fs.writeFile(
      path.join(wt1, "test", "base.test.js"),
      'const test = require("node:test");\nconst assert = require("node:assert/strict");\nconst { BASE } = require("../src/base");\ntest("base", () => assert.equal(BASE, 100));\n',
      "utf8"
    );
    await execFileAsync("git", ["add", "."], { cwd: wt1 });
    await execFileAsync("git", ["commit", "-m", "feat: step 1 base"], { cwd: wt1 });

    // task-02: Builds on base (depends on task-pipeline-01)
    await spawnProcedureWorkspace({
      procedure_type: "INNER_LOOP_TDD",
      task_id: "task-pipeline-02",
      target_test_file: "test/step2.test.js",
      owned_files: ["src/step2.js", "test/step2.test.js"],
      project_path: sandboxPath,
    });
    const wt2 = path.join(sandboxPath, ".workspaces", "task-pipeline-02");
    await fs.mkdir(path.join(wt2, "src"), { recursive: true });
    await fs.mkdir(path.join(wt2, "test"), { recursive: true });
    await fs.writeFile(path.join(wt2, "src", "step2.js"), "const STEP2 = 200;\nmodule.exports = { STEP2 };\n", "utf8");
    await fs.writeFile(
      path.join(wt2, "test", "step2.test.js"),
      'const test = require("node:test");\nconst assert = require("node:assert/strict");\nconst { STEP2 } = require("../src/step2");\ntest("step2", () => assert.equal(STEP2, 200));\n',
      "utf8"
    );
    await execFileAsync("git", ["add", "."], { cwd: wt2 });
    await execFileAsync("git", ["commit", "-m", "feat: step 2 module"], { cwd: wt2 });

    // task-03: Depends on task-pipeline-02
    await spawnProcedureWorkspace({
      procedure_type: "RELEASE_GATE",
      task_id: "task-pipeline-03",
      target_test_file: "test/step3.test.js",
      owned_files: ["src/step3.js", "test/step3.test.js"],
      project_path: sandboxPath,
    });
    const wt3 = path.join(sandboxPath, ".workspaces", "task-pipeline-03");
    await fs.mkdir(path.join(wt3, "src"), { recursive: true });
    await fs.mkdir(path.join(wt3, "test"), { recursive: true });
    await fs.writeFile(path.join(wt3, "src", "step3.js"), "const STEP3 = 300;\nmodule.exports = { STEP3 };\n", "utf8");
    await fs.writeFile(
      path.join(wt3, "test", "step3.test.js"),
      'const test = require("node:test");\nconst assert = require("node:assert/strict");\nconst { STEP3 } = require("../src/step3");\ntest("step3", () => assert.equal(STEP3, 300));\n',
      "utf8"
    );
    await execFileAsync("git", ["add", "."], { cwd: wt3 });
    await execFileAsync("git", ["commit", "-m", "feat: step 3 gate"], { cwd: wt3 });

    // Enqueue all 3
    await enqueueWorkspace({ workspace_id: "task-pipeline-01", dependencies: [], project_path: sandboxPath });
    await enqueueWorkspace({ workspace_id: "task-pipeline-02", dependencies: ["task-pipeline-01"], project_path: sandboxPath });
    await enqueueWorkspace({ workspace_id: "task-pipeline-03", dependencies: ["task-pipeline-02"], project_path: sandboxPath });

    // Process entire queue
    const processRes = await processQueue({ project_path: sandboxPath });
    assert.equal(processRes.processed.length, 3);
    assert.equal(processRes.processed.every((p) => p.merged === true), true);
    assert.equal(processRes.merged.length, 3);
    assert.equal(processRes.failed.length, 0);

    // Verify all 3 modules exist in root main repository
    const f1 = await fs.readFile(path.join(sandboxPath, "src", "base.js"), "utf8");
    const f2 = await fs.readFile(path.join(sandboxPath, "src", "step2.js"), "utf8");
    const f3 = await fs.readFile(path.join(sandboxPath, "src", "step3.js"), "utf8");
    assert.ok(f1.includes("BASE"));
    assert.ok(f2.includes("STEP2"));
    assert.ok(f3.includes("STEP3"));

    // Total commits in main is initial (1) + 3 tasks = 4
    const { stdout: commitCount } = await execFileAsync("git", ["rev-list", "--count", "HEAD"], { cwd: sandboxPath });
    assert.equal(commitCount.trim(), "4");
  });

  await t.test("9. SequentialMerger Class wrapper methods operate smoothly", async () => {
    const merger = new SequentialMerger({ project_path: sandboxPath });

    await spawnProcedureWorkspace({
      procedure_type: "PLANNING",
      task_id: "class-task-01",
      project_path: sandboxPath,
    });

    const enqRes = await merger.enqueue("class-task-01", { dependencies: [] });
    assert.equal(enqRes.enqueued, true);
    assert.equal(enqRes.workspace_id, "class-task-01");

    const status1 = await merger.getQueueStatus();
    assert.equal(status1.queue.length, 1);
    assert.equal(status1.pending.length, 1);

    const verifyRes = await merger.verifyWorkspace("class-task-01");
    assert.equal(verifyRes.verified, true);

    const mergeNextRes = await merger.mergeNext();
    assert.equal(mergeNextRes.merged, true);
    assert.equal(mergeNextRes.workspace_id, "class-task-01");

    const status2 = await merger.getQueueStatus();
    assert.equal(status2.merged.length, 1);
    assert.equal(status2.pending.length, 0);
  });
});
