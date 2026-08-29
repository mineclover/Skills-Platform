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
  saveWorkspaces,
} = require("../src/workspace-manager");

const {
  enqueueWorkspace,
  verifyWorkspace,
  mergeWorkspace,
  discardWorkspace,
  getQueueStatus,
  processQueue,
  loadMergeQueue,
  saveMergeQueue,
  SequentialMerger,
} = require("../src/sequential-merger");

const execFileAsync = promisify(execFile);

/**
 * Creates an isolated temporary Git sandbox repository with standard ignore patterns.
 */
async function createSandboxGitRepo() {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "sp-m3-c2-sandbox-"));

  await execFileAsync("git", ["init", "-b", "main"], { cwd: tmpDir });
  await execFileAsync("git", ["config", "user.name", "Challenger2 Tester"], { cwd: tmpDir });
  await execFileAsync("git", ["config", "user.email", "challenger2@skills-platform.test"], { cwd: tmpDir });

  // Baseline .gitignore to ensure ephemeral mounted agent dirs are ignored by default
  await fs.writeFile(
    path.join(tmpDir, ".gitignore"),
    ".agents/\n.claude/\n.workspaces/\n.skills-platform/\nnode_modules/\n",
    "utf8"
  );
  await fs.writeFile(path.join(tmpDir, "README.md"), "# Root Main Baseline\n", "utf8");
  await execFileAsync("git", ["add", "."], { cwd: tmpDir });
  await execFileAsync("git", ["commit", "-m", "Initial root commit on main"], { cwd: tmpDir });

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

test("Challenger 2 M3 Empirical Adversarial & Race-Condition Suite", async (suite) => {

  // =========================================================================
  // SCENARIO 1: CONCURRENT MERGE CALLS & RACE CONDITIONS ON INTERDEPENDENT TASKS
  // =========================================================================

  await suite.test("1.1 Concurrent mergeWorkspace calls on interdependent tasks (01 -> 02 -> 03)", async () => {
    const sandboxPath = await createSandboxGitRepo();
    try {
      // 3 tasks: task-01 -> task-02 -> task-03
      for (let i = 1; i <= 3; i++) {
        const id = `task-conc-dep-${i}`;
        await spawnProcedureWorkspace({
          procedure_type: "INNER_LOOP_TDD",
          task_id: id,
          target_test_file: `test/task${i}.test.js`,
          owned_files: [`src/task${i}.js`, `test/task${i}.test.js`],
          project_path: sandboxPath,
        });

        const wt = path.join(sandboxPath, ".workspaces", id);
        await fs.mkdir(path.join(wt, "src"), { recursive: true });
        await fs.mkdir(path.join(wt, "test"), { recursive: true });
        await fs.writeFile(path.join(wt, "src", `task${i}.js`), `module.exports = 'task${i}';\n`, "utf8");
        await fs.writeFile(
          path.join(wt, "test", `task${i}.test.js`),
          `const test = require('node:test'); test('task${i}', () => {});\n`,
          "utf8"
        );
        await execFileAsync("git", ["add", "."], { cwd: wt });
        await execFileAsync("git", ["commit", "-m", `feat: task ${i}`], { cwd: wt });
      }

      await enqueueWorkspace({ workspace_id: "task-conc-dep-1", dependencies: [], project_path: sandboxPath });
      await enqueueWorkspace({ workspace_id: "task-conc-dep-2", dependencies: ["task-conc-dep-1"], project_path: sandboxPath });
      await enqueueWorkspace({ workspace_id: "task-conc-dep-3", dependencies: ["task-conc-dep-2"], project_path: sandboxPath });

      // Fire mergeWorkspace concurrently on all 3
      const results = await Promise.allSettled([
        mergeWorkspace("task-conc-dep-1", { project_path: sandboxPath }),
        mergeWorkspace("task-conc-dep-2", { project_path: sandboxPath }),
        mergeWorkspace("task-conc-dep-3", { project_path: sandboxPath }),
      ]);

      // task-1 must have succeeded
      assert.equal(results[0].status, "fulfilled", "task-conc-dep-1 should succeed");
      assert.equal(results[0].value.merged, true);

      // Verify mutex protected repository integrity
      const status = await getQueueStatus({ project_path: sandboxPath });
      assert.ok(status.merged.some((m) => m.workspace_id === "task-conc-dep-1"));

      // Now if we run processQueue, remaining tasks complete cleanly
      const finalProcess = await processQueue({ project_path: sandboxPath });
      const finalStatus = await getQueueStatus({ project_path: sandboxPath });
      assert.equal(finalStatus.merged.length, 3);
      assert.equal(finalStatus.pending.length, 0);

      // Verify all 3 files exist on main
      assert.equal(await fs.stat(path.join(sandboxPath, "src", "task1.js")).then(() => true).catch(() => false), true);
      assert.equal(await fs.stat(path.join(sandboxPath, "src", "task2.js")).then(() => true).catch(() => false), true);
      assert.equal(await fs.stat(path.join(sandboxPath, "src", "task3.js")).then(() => true).catch(() => false), true);
    } finally {
      await cleanupSandboxGitRepo(sandboxPath);
    }
  });

  await suite.test("1.2 Hammering: 5 concurrent mergeWorkspace calls on the EXACT SAME workspace", async () => {
    const sandboxPath = await createSandboxGitRepo();
    try {
      const taskId = "task-single-hammer";
      await spawnProcedureWorkspace({
        procedure_type: "INNER_LOOP_TDD",
        task_id: taskId,
        target_test_file: "test/single.test.js",
        owned_files: ["src/single.js", "test/single.test.js"],
        project_path: sandboxPath,
      });

      const wt = path.join(sandboxPath, ".workspaces", taskId);
      await fs.mkdir(path.join(wt, "src"), { recursive: true });
      await fs.mkdir(path.join(wt, "test"), { recursive: true });
      await fs.writeFile(path.join(wt, "src", "single.js"), "module.exports = 42;\n", "utf8");
      await fs.writeFile(path.join(wt, "test", "single.test.js"), "const test = require('node:test'); test('single', () => {});\n", "utf8");
      await execFileAsync("git", ["add", "."], { cwd: wt });
      await execFileAsync("git", ["commit", "-m", "feat: single hammer"], { cwd: wt });

      await enqueueWorkspace({ workspace_id: taskId, dependencies: [], project_path: sandboxPath });

      // 5 concurrent merge attempts on the exact same task
      const promises = Array.from({ length: 5 }, () =>
        mergeWorkspace(taskId, { project_path: sandboxPath }).catch((err) => ({ error: err.message }))
      );

      const outcomes = await Promise.all(promises);
      const successfulMerges = outcomes.filter((o) => o && o.merged === true);

      // At least 1 succeeded
      assert.ok(successfulMerges.length >= 1, "At least one merge call must succeed");

      // Total commits in main is initial (1) + 1 merge = 2
      const { stdout: commitCount } = await execFileAsync("git", ["rev-list", "--count", "HEAD"], { cwd: sandboxPath });
      assert.equal(commitCount.trim(), "2", "Exactly 1 commit should be added on main");
    } finally {
      await cleanupSandboxGitRepo(sandboxPath);
    }
  });

  await suite.test("1.3 Multi-runner race: 3 concurrent processQueue calls on 6 interconnected tasks", async () => {
    const sandboxPath = await createSandboxGitRepo();
    try {
      const taskCount = 6;
      for (let i = 1; i <= taskCount; i++) {
        const id = `dag-t${i}`;
        await spawnProcedureWorkspace({
          procedure_type: "INNER_LOOP_TDD",
          task_id: id,
          target_test_file: `test/t${i}.test.js`,
          owned_files: [`src/t${i}.js`, `test/t${i}.test.js`],
          project_path: sandboxPath,
        });

        const wt = path.join(sandboxPath, ".workspaces", id);
        await fs.mkdir(path.join(wt, "src"), { recursive: true });
        await fs.mkdir(path.join(wt, "test"), { recursive: true });
        await fs.writeFile(path.join(wt, "src", `t${i}.js`), `module.exports = ${i};\n`, "utf8");
        await fs.writeFile(path.join(wt, "test", `t${i}.test.js`), `const test = require('node:test'); test('t${i}', () => {});\n`, "utf8");
        await execFileAsync("git", ["add", "."], { cwd: wt });
        await execFileAsync("git", ["commit", "-m", `feat: dag task ${i}`], { cwd: wt });
      }

      await enqueueWorkspace({ workspace_id: "dag-t1", dependencies: [], project_path: sandboxPath });
      await enqueueWorkspace({ workspace_id: "dag-t2", dependencies: [], project_path: sandboxPath });
      await enqueueWorkspace({ workspace_id: "dag-t3", dependencies: ["dag-t1", "dag-t2"], project_path: sandboxPath });
      await enqueueWorkspace({ workspace_id: "dag-t4", dependencies: ["dag-t3"], project_path: sandboxPath });
      await enqueueWorkspace({ workspace_id: "dag-t5", dependencies: ["dag-t3"], project_path: sandboxPath });
      await enqueueWorkspace({ workspace_id: "dag-t6", dependencies: ["dag-t4", "dag-t5"], project_path: sandboxPath });

      // 3 concurrent processQueue calls
      await Promise.all([
        processQueue({ project_path: sandboxPath }),
        processQueue({ project_path: sandboxPath }),
        processQueue({ project_path: sandboxPath }),
      ]);

      const status = await getQueueStatus({ project_path: sandboxPath });
      assert.equal(status.merged.length, 6, "All 6 tasks must be merged");
      assert.equal(status.pending.length, 0, "No pending tasks remain");
      assert.equal(status.failed.length, 0, "No failed tasks");

      // Verify all 6 files exist
      for (let i = 1; i <= 6; i++) {
        assert.equal(await fs.stat(path.join(sandboxPath, "src", `t${i}.js`)).then(() => true).catch(() => false), true);
      }

      // Commits = 1 initial + 6 tasks = 7
      const { stdout: commitCount } = await execFileAsync("git", ["rev-list", "--count", "HEAD"], { cwd: sandboxPath });
      assert.equal(commitCount.trim(), "7");
    } finally {
      await cleanupSandboxGitRepo(sandboxPath);
    }
  });

  // =========================================================================
  // SCENARIO 2: REBASE CONFLICTS & DIVERGENCE HANDLING
  // =========================================================================

  await suite.test("2.1 Non-conflicting divergent branches rebase and fast-forward cleanly", async () => {
    const sandboxPath = await createSandboxGitRepo();
    try {
      await spawnProcedureWorkspace({
        procedure_type: "INNER_LOOP_TDD",
        task_id: "task-div-a",
        target_test_file: "test/a.test.js",
        owned_files: ["src/a.js", "test/a.test.js"],
        project_path: sandboxPath,
      });
      await spawnProcedureWorkspace({
        procedure_type: "INNER_LOOP_TDD",
        task_id: "task-div-b",
        target_test_file: "test/b.test.js",
        owned_files: ["src/b.js", "test/b.test.js"],
        project_path: sandboxPath,
      });

      const wtA = path.join(sandboxPath, ".workspaces", "task-div-a");
      const wtB = path.join(sandboxPath, ".workspaces", "task-div-b");

      await fs.mkdir(path.join(wtA, "src"), { recursive: true });
      await fs.mkdir(path.join(wtA, "test"), { recursive: true });
      await fs.writeFile(path.join(wtA, "src", "a.js"), "module.exports = 'a';\n", "utf8");
      await fs.writeFile(path.join(wtA, "test", "a.test.js"), "const test = require('node:test'); test('a', () => {});\n", "utf8");
      await execFileAsync("git", ["add", "."], { cwd: wtA });
      await execFileAsync("git", ["commit", "-m", "feat: div a"], { cwd: wtA });

      await fs.mkdir(path.join(wtB, "src"), { recursive: true });
      await fs.mkdir(path.join(wtB, "test"), { recursive: true });
      await fs.writeFile(path.join(wtB, "src", "b.js"), "module.exports = 'b';\n", "utf8");
      await fs.writeFile(path.join(wtB, "test", "b.test.js"), "const test = require('node:test'); test('b', () => {});\n", "utf8");
      await execFileAsync("git", ["add", "."], { cwd: wtB });
      await execFileAsync("git", ["commit", "-m", "feat: div b"], { cwd: wtB });

      await enqueueWorkspace({ workspace_id: "task-div-a", dependencies: [], project_path: sandboxPath });
      await enqueueWorkspace({ workspace_id: "task-div-b", dependencies: [], project_path: sandboxPath });

      // Merge task A first
      const resA = await mergeWorkspace("task-div-a", { project_path: sandboxPath });
      assert.equal(resA.merged, true);

      // Now task B is behind main HEAD. mergeWorkspace automatically rebases and ff merges!
      const resB = await mergeWorkspace("task-div-b", { project_path: sandboxPath });
      assert.equal(resB.merged, true);

      assert.equal(await fs.stat(path.join(sandboxPath, "src", "a.js")).then(() => true).catch(() => false), true);
      assert.equal(await fs.stat(path.join(sandboxPath, "src", "b.js")).then(() => true).catch(() => false), true);

      const { stdout: commitCount } = await execFileAsync("git", ["rev-list", "--count", "HEAD"], { cwd: sandboxPath });
      assert.equal(commitCount.trim(), "3");
    } finally {
      await cleanupSandboxGitRepo(sandboxPath);
    }
  });

  await suite.test("2.2 Hard rebase conflict throws MERGE_FAILED without corrupting main HEAD", async () => {
    const sandboxPath = await createSandboxGitRepo();
    try {
      await spawnProcedureWorkspace({
        procedure_type: "INNER_LOOP_TDD",
        task_id: "task-conflict-1",
        target_test_file: "test/c1.test.js",
        owned_files: ["src/shared.js", "test/c1.test.js"],
        project_path: sandboxPath,
      });
      await spawnProcedureWorkspace({
        procedure_type: "INNER_LOOP_TDD",
        task_id: "task-conflict-2",
        target_test_file: "test/c2.test.js",
        owned_files: ["src/shared.js", "test/c2.test.js"],
        project_path: sandboxPath,
      });

      const wt1 = path.join(sandboxPath, ".workspaces", "task-conflict-1");
      const wt2 = path.join(sandboxPath, ".workspaces", "task-conflict-2");

      await fs.mkdir(path.join(wt1, "src"), { recursive: true });
      await fs.mkdir(path.join(wt1, "test"), { recursive: true });
      await fs.writeFile(path.join(wt1, "src", "shared.js"), "const VAL = 'VERSION_1';\nmodule.exports = VAL;\n", "utf8");
      await fs.writeFile(path.join(wt1, "test", "c1.test.js"), "const test = require('node:test'); test('c1', () => {});\n", "utf8");
      await execFileAsync("git", ["add", "."], { cwd: wt1 });
      await execFileAsync("git", ["commit", "-m", "feat: version 1"], { cwd: wt1 });

      await fs.mkdir(path.join(wt2, "src"), { recursive: true });
      await fs.mkdir(path.join(wt2, "test"), { recursive: true });
      await fs.writeFile(path.join(wt2, "src", "shared.js"), "const VAL = 'VERSION_2_CONFLICT';\nmodule.exports = VAL;\n", "utf8");
      await fs.writeFile(path.join(wt2, "test", "c2.test.js"), "const test = require('node:test'); test('c2', () => {});\n", "utf8");
      await execFileAsync("git", ["add", "."], { cwd: wt2 });
      await execFileAsync("git", ["commit", "-m", "feat: version 2 conflict"], { cwd: wt2 });

      await enqueueWorkspace({ workspace_id: "task-conflict-1", dependencies: [], project_path: sandboxPath });
      await enqueueWorkspace({ workspace_id: "task-conflict-2", dependencies: [], project_path: sandboxPath });

      // Merge 1 passes
      await mergeWorkspace("task-conflict-1", { project_path: sandboxPath });
      const { stdout: mainHeadAfter1 } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: sandboxPath });

      // Merge 2 MUST fail with MERGE_FAILED due to rebase conflict
      await assert.rejects(
        async () => {
          await mergeWorkspace("task-conflict-2", { project_path: sandboxPath });
        },
        (err) => {
          assert.equal(err.code, "MERGE_FAILED");
          return true;
        }
      );

      // Verify main branch HEAD is unaffected and still matches after task 1
      const { stdout: mainHeadAfterConflict } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: sandboxPath });
      assert.equal(mainHeadAfterConflict, mainHeadAfter1);

      // Verify shared.js on main contains VERSION_1
      const sharedContent = await fs.readFile(path.join(sandboxPath, "src", "shared.js"), "utf8");
      assert.ok(sharedContent.includes("VERSION_1"));
      assert.ok(!sharedContent.includes("VERSION_2_CONFLICT"));

      // Cleanup via discardWorkspace must succeed cleanly
      const discardRes = await discardWorkspace("task-conflict-2", { project_path: sandboxPath, reason: "Rebase conflict" });
      assert.equal(discardRes.discarded, true);
    } finally {
      await cleanupSandboxGitRepo(sandboxPath);
    }
  });

  await suite.test("2.3 processQueue isolates rebase conflict and continues processing subsequent independent tasks", async () => {
    const sandboxPath = await createSandboxGitRepo();
    try {
      // Task 1: baseline helper
      await spawnProcedureWorkspace({
        procedure_type: "INNER_LOOP_TDD",
        task_id: "task-q-1",
        target_test_file: "test/q1.test.js",
        owned_files: ["src/q_shared.js", "test/q1.test.js"],
        project_path: sandboxPath,
      });
      // Task 2: conflicting modification of q_shared.js
      await spawnProcedureWorkspace({
        procedure_type: "INNER_LOOP_TDD",
        task_id: "task-q-2-conflict",
        target_test_file: "test/q2.test.js",
        owned_files: ["src/q_shared.js", "test/q2.test.js"],
        project_path: sandboxPath,
      });
      // Task 3: completely independent feature
      await spawnProcedureWorkspace({
        procedure_type: "INNER_LOOP_TDD",
        task_id: "task-q-3-indep",
        target_test_file: "test/q3.test.js",
        owned_files: ["src/independent.js", "test/q3.test.js"],
        project_path: sandboxPath,
      });

      const wt1 = path.join(sandboxPath, ".workspaces", "task-q-1");
      const wt2 = path.join(sandboxPath, ".workspaces", "task-q-2-conflict");
      const wt3 = path.join(sandboxPath, ".workspaces", "task-q-3-indep");

      await fs.mkdir(path.join(wt1, "src"), { recursive: true });
      await fs.mkdir(path.join(wt1, "test"), { recursive: true });
      await fs.writeFile(path.join(wt1, "src", "q_shared.js"), "const Q = 10;\n", "utf8");
      await fs.writeFile(path.join(wt1, "test", "q1.test.js"), "const test = require('node:test'); test('q1', () => {});\n", "utf8");
      await execFileAsync("git", ["add", "."], { cwd: wt1 });
      await execFileAsync("git", ["commit", "-m", "q1 commit"], { cwd: wt1 });

      await fs.mkdir(path.join(wt2, "src"), { recursive: true });
      await fs.mkdir(path.join(wt2, "test"), { recursive: true });
      await fs.writeFile(path.join(wt2, "src", "q_shared.js"), "const Q = 999_CONFLICT;\n", "utf8");
      await fs.writeFile(path.join(wt2, "test", "q2.test.js"), "const test = require('node:test'); test('q2', () => {});\n", "utf8");
      await execFileAsync("git", ["add", "."], { cwd: wt2 });
      await execFileAsync("git", ["commit", "-m", "q2 conflict commit"], { cwd: wt2 });

      await fs.mkdir(path.join(wt3, "src"), { recursive: true });
      await fs.mkdir(path.join(wt3, "test"), { recursive: true });
      await fs.writeFile(path.join(wt3, "src", "independent.js"), "const INDEP = true;\n", "utf8");
      await fs.writeFile(path.join(wt3, "test", "q3.test.js"), "const test = require('node:test'); test('q3', () => {});\n", "utf8");
      await execFileAsync("git", ["add", "."], { cwd: wt3 });
      await execFileAsync("git", ["commit", "-m", "q3 commit"], { cwd: wt3 });

      await enqueueWorkspace({ workspace_id: "task-q-1", dependencies: [], project_path: sandboxPath });
      await enqueueWorkspace({ workspace_id: "task-q-2-conflict", dependencies: [], project_path: sandboxPath });
      await enqueueWorkspace({ workspace_id: "task-q-3-indep", dependencies: [], project_path: sandboxPath });

      const processRes = await processQueue({ project_path: sandboxPath });

      // Task 1 and Task 3 merged, Task 2 recorded as failed
      assert.ok(processRes.merged.some((m) => m.workspace_id === "task-q-1"));
      assert.ok(processRes.merged.some((m) => m.workspace_id === "task-q-3-indep"));
      assert.ok(processRes.processed.some((p) => p.workspace_id === "task-q-2-conflict" && p.merged === false));

      // Both q_shared (version 1) and independent.js exist on main
      assert.equal(await fs.stat(path.join(sandboxPath, "src", "q_shared.js")).then(() => true).catch(() => false), true);
      assert.equal(await fs.stat(path.join(sandboxPath, "src", "independent.js")).then(() => true).catch(() => false), true);
    } finally {
      await cleanupSandboxGitRepo(sandboxPath);
    }
  });

  // =========================================================================
  // SCENARIO 3: DIRTY WORKTREE MERGE ATTEMPTS & ROOT PROTECTION
  // =========================================================================

  await suite.test("3.1 Dirty uncommitted file in worktree violating owned_files blocks verification and merge", async () => {
    const sandboxPath = await createSandboxGitRepo();
    try {
      await spawnProcedureWorkspace({
        procedure_type: "INNER_LOOP_TDD",
        task_id: "task-dirty-violator",
        target_test_file: "test/dirty.test.js",
        owned_files: ["src/valid.js", "test/dirty.test.js"],
        project_path: sandboxPath,
      });

      const wt = path.join(sandboxPath, ".workspaces", "task-dirty-violator");
      await fs.mkdir(path.join(wt, "src"), { recursive: true });
      await fs.mkdir(path.join(wt, "test"), { recursive: true });
      await fs.writeFile(path.join(wt, "src", "valid.js"), "module.exports = 'valid';\n", "utf8");
      await fs.writeFile(path.join(wt, "test", "dirty.test.js"), "const test = require('node:test'); test('dirty', () => {});\n", "utf8");
      await execFileAsync("git", ["add", "."], { cwd: wt });
      await execFileAsync("git", ["commit", "-m", "valid commit"], { cwd: wt });

      // Add uncommitted dirty file NOT in owned_files
      await fs.writeFile(path.join(wt, "dirty-untracked-secret.env"), "DB_PASS=xyz\n", "utf8");

      await enqueueWorkspace({ workspace_id: "task-dirty-violator", dependencies: [], project_path: sandboxPath });

      // Verify must reject due to dirty untracked file violating owned_files
      const verifyRes = await verifyWorkspace("task-dirty-violator", { project_path: sandboxPath });
      assert.equal(verifyRes.verified, false);
      assert.equal(verifyRes.invariant_checks.owned_files, false);
      assert.ok(verifyRes.issues.some((i) => i.includes("dirty-untracked-secret.env")));

      // Merge must be rejected and discarded
      await assert.rejects(
        async () => {
          await mergeWorkspace("task-dirty-violator", { project_path: sandboxPath });
        },
        (err) => {
          assert.equal(err.code, "VERIFICATION_FAILED");
          return true;
        }
      );
    } finally {
      await cleanupSandboxGitRepo(sandboxPath);
    }
  });

  await suite.test("3.2 Root main uncommitted dirty changes are preserved and not destroyed during fast-forward merge", async () => {
    const sandboxPath = await createSandboxGitRepo();
    try {
      await spawnProcedureWorkspace({
        procedure_type: "INNER_LOOP_TDD",
        task_id: "task-clean-ws",
        target_test_file: "test/clean.test.js",
        owned_files: ["src/clean.js", "test/clean.test.js"],
        project_path: sandboxPath,
      });

      const wt = path.join(sandboxPath, ".workspaces", "task-clean-ws");
      await fs.mkdir(path.join(wt, "src"), { recursive: true });
      await fs.mkdir(path.join(wt, "test"), { recursive: true });
      await fs.writeFile(path.join(wt, "src", "clean.js"), "module.exports = 'clean';\n", "utf8");
      await fs.writeFile(path.join(wt, "test", "clean.test.js"), "const test = require('node:test'); test('clean', () => {});\n", "utf8");
      await execFileAsync("git", ["add", "."], { cwd: wt });
      await execFileAsync("git", ["commit", "-m", "clean commit"], { cwd: wt });

      await enqueueWorkspace({ workspace_id: "task-clean-ws", dependencies: [], project_path: sandboxPath });

      // Create untracked draft in root repo
      const rootDraftPath = path.join(sandboxPath, "local-dev-notes.tmp");
      await fs.writeFile(rootDraftPath, "ROOT LOCAL NOTES\n", "utf8");

      const mergeRes = await mergeWorkspace("task-clean-ws", { project_path: sandboxPath });
      assert.equal(mergeRes.merged, true);

      // Root local notes must remain completely intact
      const rootNotesExist = await fs.stat(rootDraftPath).then(() => true).catch(() => false);
      assert.equal(rootNotesExist, true, "Root local files must not be destroyed");
      const notesContent = await fs.readFile(rootDraftPath, "utf8");
      assert.equal(notesContent, "ROOT LOCAL NOTES\n");
    } finally {
      await cleanupSandboxGitRepo(sandboxPath);
    }
  });

  // =========================================================================
  // SCENARIO 4: CORRUPT QUEUE SELF-HEALING & PERSISTENCE RESILIENCE
  // =========================================================================

  await suite.test("4.1 Malformed JSON in merge-queue.json is handled gracefully and self-healed on save", async () => {
    const sandboxPath = await createSandboxGitRepo();
    try {
      const queueFilePath = path.join(sandboxPath, ".skills-platform", "workspaces", "merge-queue.json");
      await fs.mkdir(path.dirname(queueFilePath), { recursive: true });

      // Write corrupted JSON
      await fs.writeFile(queueFilePath, "{ this is completely broken json corrupt ...\n", "utf8");

      // loadMergeQueue should not throw, returns empty array
      const loaded = await loadMergeQueue({ project_path: sandboxPath });
      assert.deepEqual(loaded, []);

      // getQueueStatus should work gracefully
      const status = await getQueueStatus({ project_path: sandboxPath });
      assert.deepEqual(status.queue, []);
      assert.equal(status.current, null);

      // Enqueueing a new task should self-heal and write valid JSON
      await spawnProcedureWorkspace({
        procedure_type: "PLANNING",
        task_id: "task-heal-1",
        project_path: sandboxPath,
      });

      const enq = await enqueueWorkspace({
        workspace_id: "task-heal-1",
        dependencies: [],
        project_path: sandboxPath,
      });
      assert.equal(enq.enqueued, true);

      // Read file directly from disk and parse
      const rawAfterHeal = await fs.readFile(queueFilePath, "utf8");
      const parsed = JSON.parse(rawAfterHeal);
      assert.equal(Array.isArray(parsed.queue), true);
      assert.equal(parsed.queue.length, 1);
      assert.equal(parsed.queue[0].workspace_id, "task-heal-1");
    } finally {
      await cleanupSandboxGitRepo(sandboxPath);
    }
  });

  await suite.test("4.2 Missing or deleted merge-queue.json during runtime recovers cleanly", async () => {
    const sandboxPath = await createSandboxGitRepo();
    try {
      const queueFilePath = path.join(sandboxPath, ".skills-platform", "workspaces", "merge-queue.json");
      await fs.rm(queueFilePath, { force: true });

      const status = await getQueueStatus({ project_path: sandboxPath });
      assert.deepEqual(status.queue, []);

      await spawnProcedureWorkspace({
        procedure_type: "PLANNING",
        task_id: "task-recover-file",
        project_path: sandboxPath,
      });

      await enqueueWorkspace({
        workspace_id: "task-recover-file",
        project_path: sandboxPath,
      });

      const fileExists = await fs.stat(queueFilePath).then(() => true).catch(() => false);
      assert.equal(fileExists, true);
    } finally {
      await cleanupSandboxGitRepo(sandboxPath);
    }
  });

  await suite.test("4.3 Queue with raw array format safely filters and enriches status", async () => {
    const sandboxPath = await createSandboxGitRepo();
    try {
      const queueFilePath = path.join(sandboxPath, ".skills-platform", "workspaces", "merge-queue.json");
      await fs.mkdir(path.dirname(queueFilePath), { recursive: true });

      // Manually write raw array format
      await fs.writeFile(
        queueFilePath,
        JSON.stringify([
          { workspace_id: "raw-array-ws-1", dependencies: [], status: "pending" },
          { workspace_id: "raw-array-ws-2", dependencies: ["raw-array-ws-1"], status: "pending" },
        ]),
        "utf8"
      );

      const loaded = await loadMergeQueue({ project_path: sandboxPath });
      assert.equal(loaded.length, 2);

      const status = await getQueueStatus({ project_path: sandboxPath });
      assert.equal(status.queue.length, 2);
      assert.equal(status.current?.workspace_id, "raw-array-ws-1");
    } finally {
      await cleanupSandboxGitRepo(sandboxPath);
    }
  });

  // =========================================================================
  // SCENARIO 5: ADVERSARIAL FUZZING & EDGE CASES
  // =========================================================================

  await suite.test("5.1 Invalid input fuzzing on all merger entrypoints throws descriptive errors", async () => {
    const sandboxPath = await createSandboxGitRepo();
    try {
      // Enqueue fuzzing
      await assert.rejects(async () => await enqueueWorkspace(null, { project_path: sandboxPath }));
      await assert.rejects(async () => await enqueueWorkspace("", { project_path: sandboxPath }));
      await assert.rejects(async () => await enqueueWorkspace({}, { project_path: sandboxPath }));

      // Verify fuzzing
      await assert.rejects(async () => await verifyWorkspace(null, { project_path: sandboxPath }));
      await assert.rejects(async () => await verifyWorkspace("", { project_path: sandboxPath }));

      // Merge fuzzing
      await assert.rejects(async () => await mergeWorkspace(null, { project_path: sandboxPath }));
      await assert.rejects(async () => await mergeWorkspace("", { project_path: sandboxPath }));

      // Discard fuzzing
      await assert.rejects(async () => await discardWorkspace(null, { project_path: sandboxPath }));
      await assert.rejects(async () => await discardWorkspace("", { project_path: sandboxPath }));
    } finally {
      await cleanupSandboxGitRepo(sandboxPath);
    }
  });

  await suite.test("5.2 Deep sequential dependency chain (6 nodes) resolves in exact topological sequence", async () => {
    const sandboxPath = await createSandboxGitRepo();
    try {
      const chainLength = 6;
      for (let i = 1; i <= chainLength; i++) {
        const id = `chain-${i}`;
        await spawnProcedureWorkspace({
          procedure_type: "INNER_LOOP_TDD",
          task_id: id,
          target_test_file: `test/chain${i}.test.js`,
          owned_files: [`src/chain${i}.js`, `test/chain${i}.test.js`],
          project_path: sandboxPath,
        });

        const wt = path.join(sandboxPath, ".workspaces", id);
        await fs.mkdir(path.join(wt, "src"), { recursive: true });
        await fs.mkdir(path.join(wt, "test"), { recursive: true });
        await fs.writeFile(path.join(wt, "src", `chain${i}.js`), `module.exports = ${i};\n`, "utf8");
        await fs.writeFile(path.join(wt, "test", `chain${i}.test.js`), `const test = require('node:test'); test('chain${i}', () => {});\n`, "utf8");
        await execFileAsync("git", ["add", "."], { cwd: wt });
        await execFileAsync("git", ["commit", "-m", `feat: chain ${i}`], { cwd: wt });

        const deps = i === 1 ? [] : [`chain-${i - 1}`];
        await enqueueWorkspace({ workspace_id: id, dependencies: deps, project_path: sandboxPath });
      }

      const processRes = await processQueue({ project_path: sandboxPath });
      assert.equal(processRes.merged.length, chainLength);
      assert.equal(processRes.failed.length, 0);

      // Verify ordering
      for (let i = 0; i < chainLength; i++) {
        assert.equal(processRes.processed[i].workspace_id, `chain-${i + 1}`);
        assert.equal(processRes.processed[i].merged, true);
      }

      // Verify commits = 1 + 6 = 7
      const { stdout: commitCount } = await execFileAsync("git", ["rev-list", "--count", "HEAD"], { cwd: sandboxPath });
      assert.equal(commitCount.trim(), "7");
    } finally {
      await cleanupSandboxGitRepo(sandboxPath);
    }
  });

  await suite.test("5.3 Cyclic dependency DAG terminates immediately without infinite looping", async () => {
    const sandboxPath = await createSandboxGitRepo();
    try {
      await spawnProcedureWorkspace({ procedure_type: "PLANNING", task_id: "cyc-A", project_path: sandboxPath });
      await spawnProcedureWorkspace({ procedure_type: "PLANNING", task_id: "cyc-B", project_path: sandboxPath });

      await enqueueWorkspace({ workspace_id: "cyc-A", dependencies: ["cyc-B"], project_path: sandboxPath });
      await enqueueWorkspace({ workspace_id: "cyc-B", dependencies: ["cyc-A"], project_path: sandboxPath });

      const startTime = Date.now();
      const res = await processQueue({ project_path: sandboxPath });
      const duration = Date.now() - startTime;

      assert.ok(duration < 2000, `processQueue took ${duration}ms, must be < 2000ms`);
      assert.equal(res.processed.length, 0);
      assert.equal(res.merged.length, 0);
      assert.equal(res.pending.length, 2);
    } finally {
      await cleanupSandboxGitRepo(sandboxPath);
    }
  });
});
