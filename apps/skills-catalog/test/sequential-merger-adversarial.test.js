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
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "sp-adv-merge-sandbox-"));

  await execFileAsync("git", ["init", "-b", "main"], { cwd: tmpDir });
  await execFileAsync("git", ["config", "user.name", "Adversarial Tester"], { cwd: tmpDir });
  await execFileAsync("git", ["config", "user.email", "tester@skills-platform.test"], { cwd: tmpDir });

  // Initial commit on main
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

test("Milestone M3 Empirical Adversarial & Stress Harness", async (suite) => {
  let sandboxPath;

  suite.beforeEach(async () => {
    sandboxPath = await createSandboxGitRepo();
  });

  suite.afterEach(async () => {
    if (sandboxPath) {
      await cleanupSandboxGitRepo(sandboxPath);
    }
  });

  // =========================================================================
  // CATEGORY 1: COMPLEX DEPENDENCY GRAPHS
  // =========================================================================

  await suite.test("1.1 Diamond Dependency Graph (A -> B & C -> D) processes in strict topological order", async () => {
    // Topology:
    //      task-A
    //     /      \
    //  task-B   task-C
    //     \      /
    //      task-D

    // 1. Spawn all 4 workspaces
    await spawnProcedureWorkspace({
      procedure_type: "INNER_LOOP_TDD",
      task_id: "task-A",
      target_test_file: "test/a.test.js",
      owned_files: ["src/a.js", "test/a.test.js"],
      project_path: sandboxPath,
    });
    await spawnProcedureWorkspace({
      procedure_type: "INNER_LOOP_TDD",
      task_id: "task-B",
      target_test_file: "test/b.test.js",
      owned_files: ["src/b.js", "test/b.test.js"],
      project_path: sandboxPath,
    });
    await spawnProcedureWorkspace({
      procedure_type: "INNER_LOOP_TDD",
      task_id: "task-C",
      target_test_file: "test/c.test.js",
      owned_files: ["src/c.js", "test/c.test.js"],
      project_path: sandboxPath,
    });
    await spawnProcedureWorkspace({
      procedure_type: "RELEASE_GATE",
      task_id: "task-D",
      target_test_file: "test/d.test.js",
      owned_files: ["src/d.js", "test/d.test.js"],
      project_path: sandboxPath,
    });

    // Populate code & passing tests in each worktree
    const populateWorktree = async (taskId, filename, exportName) => {
      const wtPath = path.join(sandboxPath, ".workspaces", taskId);
      await fs.mkdir(path.join(wtPath, "src"), { recursive: true });
      await fs.mkdir(path.join(wtPath, "test"), { recursive: true });
      await fs.writeFile(
        path.join(wtPath, "src", `${filename}.js`),
        `const ${exportName} = "${taskId}-payload";\nmodule.exports = { ${exportName} };\n`,
        "utf8"
      );
      await fs.writeFile(
        path.join(wtPath, "test", `${filename}.test.js`),
        `const test = require("node:test");\nconst assert = require("node:assert/strict");\nconst { ${exportName} } = require("../src/${filename}");\ntest("${taskId} test", () => { assert.equal(${exportName}, "${taskId}-payload"); });\n`,
        "utf8"
      );
      await execFileAsync("git", ["add", "."], { cwd: wtPath });
      await execFileAsync("git", ["commit", "-m", `feat: implement ${taskId}`], { cwd: wtPath });
    };

    await populateWorktree("task-A", "a", "VAL_A");
    await populateWorktree("task-B", "b", "VAL_B");
    await populateWorktree("task-C", "c", "VAL_C");
    await populateWorktree("task-D", "d", "VAL_D");

    // Enqueue in out-of-order sequence (D, C, B, A) to stress dependency resolution
    await enqueueWorkspace({ workspace_id: "task-D", dependencies: ["task-B", "task-C"], project_path: sandboxPath });
    await enqueueWorkspace({ workspace_id: "task-C", dependencies: ["task-A"], project_path: sandboxPath });
    await enqueueWorkspace({ workspace_id: "task-B", dependencies: ["task-A"], project_path: sandboxPath });
    await enqueueWorkspace({ workspace_id: "task-A", dependencies: [], project_path: sandboxPath });

    // Verify cannot merge task-D directly
    await assert.rejects(
      async () => {
        await mergeWorkspace("task-D", { project_path: sandboxPath });
      },
      (err) => {
        assert.equal(err.code, "DEPENDENCY_NOT_MERGED");
        return true;
      }
    );

    // Process entire queue
    const processRes = await processQueue({ project_path: sandboxPath });
    assert.equal(processRes.processed.length, 4);
    assert.equal(processRes.merged.length, 4);
    assert.equal(processRes.failed.length, 0);

    // Verify all 4 files exist on main
    const aContent = await fs.readFile(path.join(sandboxPath, "src", "a.js"), "utf8");
    const bContent = await fs.readFile(path.join(sandboxPath, "src", "b.js"), "utf8");
    const cContent = await fs.readFile(path.join(sandboxPath, "src", "c.js"), "utf8");
    const dContent = await fs.readFile(path.join(sandboxPath, "src", "d.js"), "utf8");

    assert.ok(aContent.includes("task-A-payload"));
    assert.ok(bContent.includes("task-B-payload"));
    assert.ok(cContent.includes("task-C-payload"));
    assert.ok(dContent.includes("task-D-payload"));

    // Verify main commit count = initial (1) + 4 tasks = 5
    const { stdout: commitCount } = await execFileAsync("git", ["rev-list", "--count", "HEAD"], { cwd: sandboxPath });
    assert.equal(commitCount.trim(), "5");
  });

  await suite.test("1.2 Cyclic Dependency Prevention terminates safely without infinite loops", async () => {
    // Cycle: X -> Y -> Z -> X
    await spawnProcedureWorkspace({ procedure_type: "PLANNING", task_id: "task-X", project_path: sandboxPath });
    await spawnProcedureWorkspace({ procedure_type: "PLANNING", task_id: "task-Y", project_path: sandboxPath });
    await spawnProcedureWorkspace({ procedure_type: "PLANNING", task_id: "task-Z", project_path: sandboxPath });

    await enqueueWorkspace({ workspace_id: "task-X", dependencies: ["task-Z"], project_path: sandboxPath });
    await enqueueWorkspace({ workspace_id: "task-Y", dependencies: ["task-X"], project_path: sandboxPath });
    await enqueueWorkspace({ workspace_id: "task-Z", dependencies: ["task-Y"], project_path: sandboxPath });

    // processQueue must terminate immediately since no candidate has all dependencies satisfied
    const startTime = Date.now();
    const result = await processQueue({ project_path: sandboxPath });
    const duration = Date.now() - startTime;

    assert.ok(duration < 2000, `processQueue took ${duration}ms, expected < 2000ms`);
    assert.equal(result.processed.length, 0);
    assert.equal(result.merged.length, 0);
    assert.equal(result.pending.length, 3);

    // Direct merge attempt on cyclic task must throw DEPENDENCY_NOT_MERGED
    await assert.rejects(
      async () => {
        await mergeWorkspace("task-X", { project_path: sandboxPath });
      },
      (err) => {
        assert.equal(err.code, "DEPENDENCY_NOT_MERGED");
        return true;
      }
    );

    // Main HEAD remains untouched (1 commit)
    const { stdout: commitCount } = await execFileAsync("git", ["rev-list", "--count", "HEAD"], { cwd: sandboxPath });
    assert.equal(commitCount.trim(), "1");
  });

  await suite.test("1.3 Self-referential and Non-existent dependency rejection", async () => {
    await spawnProcedureWorkspace({ procedure_type: "PLANNING", task_id: "task-self", project_path: sandboxPath });
    await spawnProcedureWorkspace({ procedure_type: "PLANNING", task_id: "task-ghost-dep", project_path: sandboxPath });

    await enqueueWorkspace({ workspace_id: "task-self", dependencies: ["task-self"], project_path: sandboxPath });
    await enqueueWorkspace({ workspace_id: "task-ghost-dep", dependencies: ["non-existent-task-999"], project_path: sandboxPath });

    await assert.rejects(
      async () => {
        await mergeWorkspace("task-self", { project_path: sandboxPath });
      },
      (err) => {
        assert.equal(err.code, "DEPENDENCY_NOT_MERGED");
        return true;
      }
    );

    await assert.rejects(
      async () => {
        await mergeWorkspace("task-ghost-dep", { project_path: sandboxPath });
      },
      (err) => {
        assert.equal(err.code, "DEPENDENCY_NOT_MERGED");
        return true;
      }
    );
  });

  // =========================================================================
  // CATEGORY 2: CASCADING FAILURE & FAULT ISOLATION
  // =========================================================================

  await suite.test("2.1 Cascading failure: In diamond graph (A->B,C->D), when B fails, C still merges, B & D rejected with 0 trace", async () => {
    // task-A (pass)
    // task-B (FAILS verification)
    // task-C (pass, depends on A)
    // task-D (depends on B and C - blocked by B's failure)

    await spawnProcedureWorkspace({
      procedure_type: "INNER_LOOP_TDD",
      task_id: "task-root-A",
      target_test_file: "test/ra.test.js",
      owned_files: ["src/ra.js", "test/ra.test.js"],
      project_path: sandboxPath,
    });
    await spawnProcedureWorkspace({
      procedure_type: "INNER_LOOP_TDD",
      task_id: "task-broken-B",
      target_test_file: "test/rb.test.js",
      owned_files: ["src/rb.js", "test/rb.test.js"],
      project_path: sandboxPath,
    });
    await spawnProcedureWorkspace({
      procedure_type: "INNER_LOOP_TDD",
      task_id: "task-valid-C",
      target_test_file: "test/rc.test.js",
      owned_files: ["src/rc.js", "test/rc.test.js"],
      project_path: sandboxPath,
    });
    await spawnProcedureWorkspace({
      procedure_type: "RELEASE_GATE",
      task_id: "task-blocked-D",
      target_test_file: "test/rd.test.js",
      owned_files: ["src/rd.js", "test/rd.test.js"],
      project_path: sandboxPath,
    });

    // Populate task-root-A (pass)
    const wtA = path.join(sandboxPath, ".workspaces", "task-root-A");
    await fs.mkdir(path.join(wtA, "src"), { recursive: true });
    await fs.mkdir(path.join(wtA, "test"), { recursive: true });
    await fs.writeFile(path.join(wtA, "src", "ra.js"), "module.exports = 'ra';\n", "utf8");
    await fs.writeFile(path.join(wtA, "test", "ra.test.js"), "const test = require('node:test'); test('ra', () => {});\n", "utf8");
    await execFileAsync("git", ["add", "."], { cwd: wtA });
    await execFileAsync("git", ["commit", "-m", "ra commit"], { cwd: wtA });

    // Populate task-broken-B (failing test)
    const wtB = path.join(sandboxPath, ".workspaces", "task-broken-B");
    await fs.mkdir(path.join(wtB, "src"), { recursive: true });
    await fs.mkdir(path.join(wtB, "test"), { recursive: true });
    await fs.writeFile(path.join(wtB, "src", "rb.js"), "module.exports = 'rb_poison';\n", "utf8");
    await fs.writeFile(path.join(wtB, "test", "rb.test.js"), "const test = require('node:test'); const assert = require('node:assert'); test('rb fail', () => { assert.fail('broken implementation'); });\n", "utf8");
    await execFileAsync("git", ["add", "."], { cwd: wtB });
    await execFileAsync("git", ["commit", "-m", "rb broken commit"], { cwd: wtB });

    // Populate task-valid-C (pass)
    const wtC = path.join(sandboxPath, ".workspaces", "task-valid-C");
    await fs.mkdir(path.join(wtC, "src"), { recursive: true });
    await fs.mkdir(path.join(wtC, "test"), { recursive: true });
    await fs.writeFile(path.join(wtC, "src", "rc.js"), "module.exports = 'rc';\n", "utf8");
    await fs.writeFile(path.join(wtC, "test", "rc.test.js"), "const test = require('node:test'); test('rc', () => {});\n", "utf8");
    await execFileAsync("git", ["add", "."], { cwd: wtC });
    await execFileAsync("git", ["commit", "-m", "rc commit"], { cwd: wtC });

    // Populate task-blocked-D (pass)
    const wtD = path.join(sandboxPath, ".workspaces", "task-blocked-D");
    await fs.mkdir(path.join(wtD, "src"), { recursive: true });
    await fs.mkdir(path.join(wtD, "test"), { recursive: true });
    await fs.writeFile(path.join(wtD, "src", "rd.js"), "module.exports = 'rd';\n", "utf8");
    await fs.writeFile(path.join(wtD, "test", "rd.test.js"), "const test = require('node:test'); test('rd', () => {});\n", "utf8");
    await execFileAsync("git", ["add", "."], { cwd: wtD });
    await execFileAsync("git", ["commit", "-m", "rd commit"], { cwd: wtD });

    // Enqueue in order
    await enqueueWorkspace({ workspace_id: "task-root-A", dependencies: [], project_path: sandboxPath });
    await enqueueWorkspace({ workspace_id: "task-broken-B", dependencies: ["task-root-A"], project_path: sandboxPath });
    await enqueueWorkspace({ workspace_id: "task-valid-C", dependencies: ["task-root-A"], project_path: sandboxPath });
    await enqueueWorkspace({ workspace_id: "task-blocked-D", dependencies: ["task-broken-B", "task-valid-C"], project_path: sandboxPath });

    // Process queue
    const res = await processQueue({ project_path: sandboxPath });

    // Verification expectations:
    // - task-root-A merged
    // - task-broken-B rejected during merge and discarded
    // - task-valid-C merged
    // - task-blocked-D remained pending / not merged because B failed
    assert.equal(res.merged.length, 2);
    assert.ok(res.merged.some((m) => m.workspace_id === "task-root-A"));
    assert.ok(res.merged.some((m) => m.workspace_id === "task-valid-C"));

    // B should be in discarded
    assert.ok(res.discarded.some((d) => d.workspace_id === "task-broken-B"));

    // Check main branch filesystem
    const raExists = await fs.stat(path.join(sandboxPath, "src", "ra.js")).then(() => true).catch(() => false);
    const rcExists = await fs.stat(path.join(sandboxPath, "src", "rc.js")).then(() => true).catch(() => false);
    const rbExists = await fs.stat(path.join(sandboxPath, "src", "rb.js")).then(() => true).catch(() => false);
    const rdExists = await fs.stat(path.join(sandboxPath, "src", "rd.js")).then(() => true).catch(() => false);

    assert.equal(raExists, true, "ra.js must exist on main");
    assert.equal(rcExists, true, "rc.js must exist on main");
    assert.equal(rbExists, false, "rb.js must NEVER exist on main (poison averted)");
    assert.equal(rdExists, false, "rd.js must NEVER exist on main (blocked downstream)");

    // Worktree B folder must be completely removed
    const wtBExists = await fs.stat(wtB).then(() => true).catch(() => false);
    assert.equal(wtBExists, false, "Broken worktree directory must be pruned");

    // Total commits on main = initial (1) + A (1) + C (1) = 3
    const { stdout: commitCount } = await execFileAsync("git", ["rev-list", "--count", "HEAD"], { cwd: sandboxPath });
    assert.equal(commitCount.trim(), "3");
  });

  // =========================================================================
  // CATEGORY 3: ADVERSARIAL PRE-MERGE VERIFICATION GATES
  // =========================================================================

  await suite.test("3.1 Out-of-bounds globbing bypass attempt is caught and rejected", async () => {
    await spawnProcedureWorkspace({
      procedure_type: "INNER_LOOP_TDD",
      task_id: "task-scope-bypass",
      target_test_file: "test/scoped.test.js",
      owned_files: ["src/components/*.js", "test/scoped.test.js"],
      project_path: sandboxPath,
    });

    const wtPath = path.join(sandboxPath, ".workspaces", "task-scope-bypass");
    await fs.mkdir(path.join(wtPath, "src", "components"), { recursive: true });
    await fs.mkdir(path.join(wtPath, "test"), { recursive: true });

    // Valid owned files
    await fs.writeFile(path.join(wtPath, "src", "components", "button.js"), "module.exports = 'button';\n", "utf8");
    await fs.writeFile(path.join(wtPath, "test", "scoped.test.js"), "const test = require('node:test'); test('ok', () => {});\n", "utf8");

    // Out-of-bounds attempt: subfolder not matching *.js directly or unowned root file
    await fs.mkdir(path.join(wtPath, "src", "server"), { recursive: true });
    await fs.writeFile(path.join(wtPath, "src", "server", "admin.js"), "module.exports = 'hacked';\n", "utf8");

    await execFileAsync("git", ["add", "."], { cwd: wtPath });
    await execFileAsync("git", ["commit", "-m", "feat: bypass attempt"], { cwd: wtPath });

    await enqueueWorkspace({ workspace_id: "task-scope-bypass", dependencies: [], project_path: sandboxPath });

    await assert.rejects(
      async () => {
        await mergeWorkspace("task-scope-bypass", { project_path: sandboxPath });
      },
      (err) => {
        assert.equal(err.code, "VERIFICATION_FAILED");
        assert.ok(err.message.includes("src/server/admin.js"));
        return true;
      }
    );

    // Verify main branch is pristine and has no admin.js
    const adminExists = await fs.stat(path.join(sandboxPath, "src", "server", "admin.js")).then(() => true).catch(() => false);
    assert.equal(adminExists, false);
  });

  await suite.test("3.2 Secret token leak in committed file triggers verification rejection", async () => {
    await spawnProcedureWorkspace({
      procedure_type: "INNER_LOOP_TDD",
      task_id: "task-secret-leak",
      target_test_file: "test/secret.test.js",
      owned_files: ["src/config.js", "test/secret.test.js"],
      project_path: sandboxPath,
    });

    const wtPath = path.join(sandboxPath, ".workspaces", "task-secret-leak");
    await fs.mkdir(path.join(wtPath, "src"), { recursive: true });
    await fs.mkdir(path.join(wtPath, "test"), { recursive: true });

    // Committed AWS secret key pattern
    await fs.writeFile(
      path.join(wtPath, "src", "config.js"),
      "const AWS_KEY = 'AKIA1234567890ABCDEF';\nmodule.exports = { AWS_KEY };\n",
      "utf8"
    );
    await fs.writeFile(
      path.join(wtPath, "test", "secret.test.js"),
      "const test = require('node:test'); test('sec', () => {});\n",
      "utf8"
    );

    await execFileAsync("git", ["add", "."], { cwd: wtPath });
    await execFileAsync("git", ["commit", "-m", "feat: accidental key commit"], { cwd: wtPath });

    await enqueueWorkspace({ workspace_id: "task-secret-leak", dependencies: [], project_path: sandboxPath });

    await assert.rejects(
      async () => {
        await mergeWorkspace("task-secret-leak", { project_path: sandboxPath });
      },
      (err) => {
        assert.equal(err.code, "VERIFICATION_FAILED");
        assert.ok(err.message.includes("Potential credential/secret detected"));
        return true;
      }
    );
  });

  await suite.test("3.3 Planning procedure with prohibited action rejects production file changes", async () => {
    await spawnProcedureWorkspace({
      procedure_type: "PLANNING",
      task_id: "task-plan-violation",
      prohibited_actions: ["modify production code"],
      project_path: sandboxPath,
    });

    const wtPath = path.join(sandboxPath, ".workspaces", "task-plan-violation");
    await fs.mkdir(path.join(wtPath, "src"), { recursive: true });

    // Prohibited: planning workspace modifying production .js code
    await fs.writeFile(path.join(wtPath, "src", "unauthorized.js"), "console.log('bad');\n", "utf8");

    await execFileAsync("git", ["add", "."], { cwd: wtPath });
    await execFileAsync("git", ["commit", "-m", "docs: sneaky prod modification"], { cwd: wtPath });

    await enqueueWorkspace({ workspace_id: "task-plan-violation", dependencies: [], project_path: sandboxPath });

    await assert.rejects(
      async () => {
        await mergeWorkspace("task-plan-violation", { project_path: sandboxPath });
      },
      (err) => {
        assert.equal(err.code, "VERIFICATION_FAILED");
        assert.ok(err.message.includes("planning workspace modified production files"));
        return true;
      }
    );
  });

  // =========================================================================
  // CATEGORY 4: CONCURRENCY & RE-ENTRANCY MUTEX STRESS
  // =========================================================================

  await suite.test("4.1 Concurrent enqueue and processQueue operations maintain lock integrity", async () => {
    const merger = new SequentialMerger({ project_path: sandboxPath });

    // Spawn 5 independent planning tasks
    for (let i = 1; i <= 5; i++) {
      await spawnProcedureWorkspace({
        procedure_type: "PLANNING",
        task_id: `task-concurrent-${i}`,
        project_path: sandboxPath,
      });
      const wt = path.join(sandboxPath, ".workspaces", `task-concurrent-${i}`);
      await fs.writeFile(path.join(wt, `doc-${i}.md`), `# Doc ${i}\n`, "utf8");
      await execFileAsync("git", ["add", "."], { cwd: wt });
      await execFileAsync("git", ["commit", "-m", `docs: add doc ${i}`], { cwd: wt });
    }

    // Fire 5 enqueue operations concurrently in Promise.all
    await Promise.all([
      merger.enqueue("task-concurrent-1", { dependencies: [] }),
      merger.enqueue("task-concurrent-2", { dependencies: ["task-concurrent-1"] }),
      merger.enqueue("task-concurrent-3", { dependencies: ["task-concurrent-2"] }),
      merger.enqueue("task-concurrent-4", { dependencies: ["task-concurrent-3"] }),
      merger.enqueue("task-concurrent-5", { dependencies: ["task-concurrent-4"] }),
    ]);

    const queueStatus = await merger.getQueueStatus();
    assert.equal(queueStatus.queue.length, 5);

    // Fire 3 processQueue calls concurrently (simulating multiple runners / triggers)
    const [p1, p2, p3] = await Promise.all([
      merger.processQueue(),
      merger.processQueue(),
      merger.processQueue(),
    ]);

    const finalStatus = await merger.getQueueStatus();
    assert.equal(finalStatus.merged.length, 5);
    assert.equal(finalStatus.pending.length, 0);

    // Verify all 5 markdown docs exist on main
    for (let i = 1; i <= 5; i++) {
      const docExists = await fs.stat(path.join(sandboxPath, `doc-${i}.md`)).then(() => true).catch(() => false);
      assert.equal(docExists, true, `doc-${i}.md must exist on main`);
    }

    // Commit count = 1 + 5 = 6
    const { stdout: commitCount } = await execFileAsync("git", ["rev-list", "--count", "HEAD"], { cwd: sandboxPath });
    assert.equal(commitCount.trim(), "6");
  });

  // =========================================================================
  // CATEGORY 5: EDGE CASES & DEFENSIVE INTEGRITY
  // =========================================================================

  await suite.test("5.1 Missing target test file in workspace fails verification cleanly", async () => {
    await spawnProcedureWorkspace({
      procedure_type: "INNER_LOOP_TDD",
      task_id: "task-missing-test",
      target_test_file: "test/does-not-exist.test.js",
      owned_files: ["src/index.js", "test/does-not-exist.test.js"],
      project_path: sandboxPath,
    });

    const verifyRes = await verifyWorkspace("task-missing-test", { project_path: sandboxPath });
    assert.equal(verifyRes.verified, false);
    assert.equal(verifyRes.invariant_checks.target_test, false);
    assert.ok(verifyRes.issues.some((i) => i.includes("does not exist in worktree")));
  });

  await suite.test("5.2 mergeNext returns graceful response when queue is empty or blocked", async () => {
    const merger = new SequentialMerger({ project_path: sandboxPath });

    const emptyRes = await merger.mergeNext();
    assert.equal(emptyRes.merged, false);
    assert.equal(emptyRes.workspace_id, null);
    assert.ok(emptyRes.message.includes("No workspaces ready"));
  });

  await suite.test("5.3 Re-enqueuing an existing workspace updates metadata without duplicate entries", async () => {
    await spawnProcedureWorkspace({
      procedure_type: "PLANNING",
      task_id: "task-re-enqueue",
      project_path: sandboxPath,
    });

    const enq1 = await enqueueWorkspace({
      workspace_id: "task-re-enqueue",
      dependencies: ["dep-1"],
      project_path: sandboxPath,
    });
    assert.equal(enq1.position, 1);

    const enq2 = await enqueueWorkspace({
      workspace_id: "task-re-enqueue",
      dependencies: ["dep-1", "dep-2"],
      project_path: sandboxPath,
    });
    assert.equal(enq2.position, 1);

    const queue = await loadMergeQueue({ project_path: sandboxPath });
    assert.equal(queue.length, 1);
    assert.deepEqual(queue[0].dependencies, ["dep-1", "dep-2"]);
  });
});
