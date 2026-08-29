"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { execFile } = require("node:child_process");
const fs = require("node:fs/promises");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { promisify } = require("node:util");

const catalogIndex = require("../src/index");
const { run, usage } = require("../src/cli");
const { createCatalogServer } = require("../src/server");
const { validateProcedureWorkspace } = require("@skills-platform/contracts");

const execFileAsync = promisify(execFile);

/**
 * Creates an isolated Git sandbox repository for tests.
 */
async function createSandboxGitRepo() {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "sp-cli-server-sandbox-"));

  await execFileAsync("git", ["init", "-b", "main"], { cwd: tmpDir });
  await execFileAsync("git", ["config", "user.name", "Test Runner"], { cwd: tmpDir });
  await execFileAsync("git", ["config", "user.email", "runner@skills-platform.test"], { cwd: tmpDir });

  // Initial commit so HEAD exists
  await fs.writeFile(path.join(tmpDir, "README.md"), "# Skills Platform Test Repo\n", "utf8");
  await fs.writeFile(path.join(tmpDir, "package.json"), JSON.stringify({ name: "sandbox", version: "1.0.0" }, null, 2), "utf8");
  await execFileAsync("git", ["add", "."], { cwd: tmpDir });
  await execFileAsync("git", ["commit", "-m", "Initial commit"], { cwd: tmpDir });

  const registryRoot = path.join(tmpDir, ".skills-platform", "registry");
  const catalogRoot = path.join(tmpDir, ".skills-platform", "catalog");
  await fs.mkdir(registryRoot, { recursive: true });
  await fs.mkdir(catalogRoot, { recursive: true });

  return { sandboxPath: tmpDir, registryRoot, catalogRoot };
}

/**
 * Cleans up a sandbox Git repository.
 */
async function cleanupSandboxGitRepo(tmpDir) {
  try {
    await execFileAsync("git", ["worktree", "prune"], { cwd: tmpDir }).catch(() => {});
    await fs.rm(tmpDir, { recursive: true, force: true });
  } catch {}
}

test("Milestone M4: CLI & REST API Integration", async (t) => {
  let sandbox;

  t.beforeEach(async () => {
    sandbox = await createSandboxGitRepo();
  });

  t.afterEach(async () => {
    if (sandbox?.sandboxPath) {
      await cleanupSandboxGitRepo(sandbox.sandboxPath);
    }
  });

  await t.test("1. Module Re-exports in index.js", async () => {
    // Check workspace-manager exports
    assert.equal(typeof catalogIndex.spawnProcedureWorkspace, "function");
    assert.equal(typeof catalogIndex.pruneProcedureWorkspace, "function");
    assert.equal(typeof catalogIndex.listProcedureWorkspaces, "function");
    assert.equal(typeof catalogIndex.getProcedureWorkspace, "function");
    assert.equal(typeof catalogIndex.loadWorkspaces, "function");
    assert.equal(typeof catalogIndex.saveWorkspaces, "function");
    assert.ok(catalogIndex.PROCEDURE_DEFAULTS);
    assert.equal(typeof catalogIndex.WORKSPACES_DIR_NAME, "string");
    assert.equal(typeof catalogIndex.WORKSPACES_STORAGE_RELATIVE, "string");

    // Check sequential-merger exports
    assert.equal(typeof catalogIndex.enqueueWorkspace, "function");
    assert.equal(typeof catalogIndex.verifyWorkspace, "function");
    assert.equal(typeof catalogIndex.discardWorkspace, "function");
    assert.equal(typeof catalogIndex.mergeWorkspace, "function");
    assert.equal(typeof catalogIndex.getQueueStatus, "function");
    assert.equal(typeof catalogIndex.processQueue, "function");
    assert.equal(typeof catalogIndex.SequentialMerger, "function");
    assert.equal(typeof catalogIndex.loadMergeQueue, "function");
    assert.equal(typeof catalogIndex.saveMergeQueue, "function");
  });

  await t.test("2. CLI Workspace Usage documentation", async () => {
    const helpText = usage();
    assert.match(helpText, /workspace spawn/);
    assert.match(helpText, /workspace list/);
    assert.match(helpText, /workspace verify/);
    assert.match(helpText, /workspace merge/);
    assert.match(helpText, /workspace prune/);
  });

  await t.test("3. CLI Workspace Subcommands: spawn, list, verify, merge, prune", async () => {
    const { sandboxPath } = sandbox;

    // 3.1. CLI workspace spawn (PLANNING)
    const planWs = await run([
      "workspace", "spawn",
      "--procedure", "PLANNING",
      "--task", "task-cli-plan",
      "--recipe", "mlc-task-planning",
      "--project", sandboxPath,
    ]);

    assert.equal(planWs.workspace_id, "task-cli-plan");
    assert.equal(planWs.procedure_type, "PLANNING");
    assert.equal(planWs.status, "active");
    assert.deepEqual(planWs.active_skills, ["task-decomposer", "horizontal-topic-scanner"]);

    // Verify worktree isolated mount
    const planWorktree = path.join(sandboxPath, ".workspaces", "task-cli-plan");
    const planSkills = await fs.readdir(path.join(planWorktree, ".agents", "skills"));
    assert.deepEqual(planSkills.sort(), ["horizontal-topic-scanner", "task-decomposer"]);

    // 3.2. CLI workspace spawn (INNER_LOOP_TDD with multi-value flags)
    const tddWs = await run([
      "workspace", "spawn",
      "--procedure", "INNER_LOOP_TDD",
      "--task", "task-cli-tdd",
      "--test", "test/calc.test.js",
      "--owned", "src/calc.js",
      "--owned", "test/calc.test.js",
      "--prohibited", "npm test",
      "--prohibited", "full_regression",
      "--acceptance", "Target scoped test passes with 0 failures",
      "--project", sandboxPath,
    ]);

    assert.equal(tddWs.workspace_id, "task-cli-tdd");
    assert.equal(tddWs.procedure_type, "INNER_LOOP_TDD");
    assert.equal(tddWs.responsibility_invariants.target_test_file, "test/calc.test.js");
    assert.deepEqual(tddWs.responsibility_invariants.owned_files, ["src/calc.js", "test/calc.test.js"]);
    assert.deepEqual(tddWs.responsibility_invariants.prohibited_actions, ["npm test", "full_regression"]);

    // 3.3. CLI workspace list
    const allList = await run(["workspace", "list", "--project", sandboxPath]);
    assert.equal(allList.length, 2);

    const activeList = await run(["workspace", "list", "--status", "active", "--project", sandboxPath]);
    assert.equal(activeList.length, 2);

    // 3.4. Create implementation and passing test inside worktree
    const tddWorktree = path.join(sandboxPath, ".workspaces", "task-cli-tdd");
    await fs.mkdir(path.join(tddWorktree, "src"), { recursive: true });
    await fs.mkdir(path.join(tddWorktree, "test"), { recursive: true });

    await fs.writeFile(
      path.join(tddWorktree, "src", "calc.js"),
      "function add(a, b) { return a + b; }\nmodule.exports = { add };\n",
      "utf8"
    );

    await fs.writeFile(
      path.join(tddWorktree, "test", "calc.test.js"),
      `const test = require("node:test");\nconst assert = require("node:assert/strict");\nconst { add } = require("../src/calc");\ntest("adds numbers", () => { assert.equal(add(2, 3), 5); });\n`,
      "utf8"
    );

    // Commit changes in worktree branch
    await execFileAsync("git", ["add", "."], { cwd: tddWorktree });
    await execFileAsync("git", ["commit", "-m", "Implement add and tests"], { cwd: tddWorktree });

    // 3.5. CLI workspace verify (passing)
    const verifyResult = await run(["workspace", "verify", "--task", "task-cli-tdd", "--project", sandboxPath]);
    assert.equal(verifyResult.verified, true);
    assert.equal(verifyResult.workspace_id, "task-cli-tdd");
    assert.equal(verifyResult.invariant_checks.target_test, true);
    assert.equal(verifyResult.invariant_checks.owned_files, true);

    // 3.6. CLI workspace merge
    const mergeResult = await run(["workspace", "merge", "--task", "task-cli-tdd", "--project", sandboxPath]);
    assert.equal(mergeResult.merged, true);
    assert.equal(mergeResult.workspace_id, "task-cli-tdd");
    assert.ok(mergeResult.commit_hash);

    // Verify main branch now has src/calc.js
    const rootCalc = await fs.readFile(path.join(sandboxPath, "src", "calc.js"), "utf8");
    assert.ok(rootCalc.includes("function add"));

    // 3.7. CLI workspace prune
    const pruneResult = await run(["workspace", "prune", "--task", "task-cli-plan", "--project", sandboxPath]);
    assert.equal(pruneResult.pruned, true);
    assert.equal(pruneResult.workspace_id, "task-cli-plan");

    // Verify worktree folder is gone
    let planDirExists = false;
    try {
      await fs.stat(planWorktree);
      planDirExists = true;
    } catch {}
    assert.equal(planDirExists, false);

    // 3.8. CLI workspace enqueue and queue status
    const enqWs = await run([
      "workspace", "spawn",
      "--procedure", "PLANNING",
      "--task", "task-cli-queue-1",
      "--project", sandboxPath,
    ]);
    assert.equal(enqWs.workspace_id, "task-cli-queue-1");

    const enqResult = await run([
      "workspace", "enqueue",
      "--task", "task-cli-queue-1",
      "--dependency", "task-cli-tdd",
      "--project", sandboxPath,
    ]);
    assert.equal(enqResult.enqueued, true);

    const queueStatus = await run(["workspace", "queue", "--project", sandboxPath]);
    assert.ok(Array.isArray(queueStatus.queue));
    assert.ok(queueStatus.queue.some((q) => q.workspace_id === "task-cli-queue-1"));

    // 3.9. CLI workspace discard
    const discardResult = await run([
      "workspace", "discard",
      "--task", "task-cli-queue-1",
      "--reason", "Discarded from test",
      "--project", sandboxPath,
    ]);
    assert.equal(discardResult.discarded, true);
    assert.equal(discardResult.workspace_id, "task-cli-queue-1");
  });

  await t.test("4. CLI Error Handling for workspace commands", async () => {
    const { sandboxPath } = sandbox;

    // Missing task on spawn
    await assert.rejects(
      async () => {
        await run(["workspace", "spawn", "--procedure", "PLANNING", "--project", sandboxPath]);
      },
      /workspace spawn requires --task <id>/
    );

    // Missing task on verify
    await assert.rejects(
      async () => {
        await run(["workspace", "verify", "--project", sandboxPath]);
      },
      /workspace verify requires --task <id>/
    );

    // Missing task on merge
    await assert.rejects(
      async () => {
        await run(["workspace", "merge", "--project", sandboxPath]);
      },
      /workspace merge requires --task <id>/
    );

    // Missing task on prune
    await assert.rejects(
      async () => {
        await run(["workspace", "prune", "--project", sandboxPath]);
      },
      /workspace prune requires --task <id>/
    );

    // Unknown action
    await assert.rejects(
      async () => {
        await run(["workspace", "unknown-action", "--project", sandboxPath]);
      },
      /Unknown workspace action/
    );
  });

  await t.test("5. REST API: GET /api/workspaces and /api/workspaces/queue", async () => {
    const { sandboxPath, catalogRoot, registryRoot } = sandbox;
    const server = createCatalogServer({ catalogRoot, registryRoot });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address();
    const base = `http://127.0.0.1:${port}/api`;

    try {
      // Spawn two workspaces via CLI or functional
      await catalogIndex.spawnProcedureWorkspace({
        procedure_type: "PLANNING",
        task_id: "task-rest-01",
        project_path: sandboxPath,
      });

      await catalogIndex.spawnProcedureWorkspace({
        procedure_type: "INNER_LOOP_TDD",
        task_id: "task-rest-02",
        project_path: sandboxPath,
      });

      // GET /api/workspaces
      const res = await fetch(`${base}/workspaces?project_path=${encodeURIComponent(sandboxPath)}`);
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.ok(Array.isArray(data.workspaces));
      assert.equal(data.workspaces.length, 2);
      assert.ok(Array.isArray(data.merge_queue));

      // GET /api/workspaces?status=active
      const activeRes = await fetch(`${base}/workspaces?status=active&project_path=${encodeURIComponent(sandboxPath)}`);
      assert.equal(activeRes.status, 200);
      const activeData = await activeRes.json();
      assert.equal(activeData.workspaces.length, 2);

      // GET /api/workspaces/queue
      const queueRes = await fetch(`${base}/workspaces/queue?project_path=${encodeURIComponent(sandboxPath)}`);
      assert.equal(queueRes.status, 200);
      const queueData = await queueRes.json();
      assert.ok(Array.isArray(queueData.queue));
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  await t.test("6. REST API: POST /api/workspaces/spawn", async () => {
    const { sandboxPath, catalogRoot, registryRoot } = sandbox;
    const server = createCatalogServer({ catalogRoot, registryRoot });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address();
    const base = `http://127.0.0.1:${port}/api`;

    try {
      // Valid spawn
      const spawnRes = await fetch(`${base}/workspaces/spawn`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          procedure_type: "INNER_LOOP_TDD",
          task_id: "task-rest-spawn",
          recipe_id: "mlc-scoped-inner-loop",
          target_test_file: "test/unit.test.js",
          owned_files: ["src/unit.js"],
          prohibited_actions: ["npm test"],
          acceptance_criteria: ["Clean test pass"],
          project_path: sandboxPath,
        }),
      });

      assert.equal(spawnRes.status, 201);
      const spawnData = await spawnRes.json();
      assert.ok(spawnData.workspace);
      assert.equal(spawnData.workspace.workspace_id, "task-rest-spawn");
      assert.equal(spawnData.workspace.procedure_type, "INNER_LOOP_TDD");
      assert.equal(spawnData.workspace.status, "active");

      const validation = validateProcedureWorkspace(spawnData.workspace);
      assert.equal(validation.valid, true);

      // Invalid procedure_type ➔ 400
      const invalidRes = await fetch(`${base}/workspaces/spawn`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          procedure_type: "INVALID_TYPE",
          task_id: "task-rest-invalid",
          project_path: sandboxPath,
        }),
      });
      assert.equal(invalidRes.status, 400);
      const invalidData = await invalidRes.json();
      assert.ok(invalidData.error);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  await t.test("7. REST API: POST /api/workspaces/verify, merge, prune, enqueue, discard", async () => {
    const { sandboxPath, catalogRoot, registryRoot } = sandbox;
    const server = createCatalogServer({ catalogRoot, registryRoot });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address();
    const base = `http://127.0.0.1:${port}/api`;

    try {
      // 7.1. Spawn task-01
      const spawnRes1 = await fetch(`${base}/workspaces/spawn`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          procedure_type: "INNER_LOOP_TDD",
          task_id: "task-rest-01",
          target_test_file: "test/mod.test.js",
          owned_files: ["src/mod.js", "test/mod.test.js"],
          project_path: sandboxPath,
        }),
      });
      assert.equal(spawnRes1.status, 201);

      // 7.2. Spawn task-02 with dependency on task-01
      const spawnRes2 = await fetch(`${base}/workspaces/spawn`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          procedure_type: "INNER_LOOP_TDD",
          task_id: "task-rest-02",
          target_test_file: "test/dep.test.js",
          owned_files: ["src/dep.js", "test/dep.test.js"],
          project_path: sandboxPath,
        }),
      });
      assert.equal(spawnRes2.status, 201);

      // Enqueue task-02 with dependency on task-01
      const enqRes = await fetch(`${base}/workspaces/enqueue`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          task_id: "task-rest-02",
          dependencies: ["task-rest-01"],
          project_path: sandboxPath,
        }),
      });
      assert.equal(enqRes.status, 201);

      // 7.3. Attempt to merge task-02 before task-01 is merged ➔ 409
      const prematureMergeRes = await fetch(`${base}/workspaces/merge`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          task_id: "task-rest-02",
          project_path: sandboxPath,
        }),
      });
      assert.equal(prematureMergeRes.status, 409);
      const prematureData = await prematureMergeRes.json();
      assert.equal(prematureData.code, "DEPENDENCY_NOT_MERGED");

      // 7.4. Implement code in task-01 worktree
      const wt1 = path.join(sandboxPath, ".workspaces", "task-rest-01");
      await fs.mkdir(path.join(wt1, "src"), { recursive: true });
      await fs.mkdir(path.join(wt1, "test"), { recursive: true });
      await fs.writeFile(path.join(wt1, "src", "mod.js"), "module.exports = { value: 42 };\n", "utf8");
      await fs.writeFile(
        path.join(wt1, "test", "mod.test.js"),
        `const test = require("node:test");\nconst assert = require("node:assert/strict");\nconst { value } = require("../src/mod");\ntest("mod value", () => { assert.equal(value, 42); });\n`,
        "utf8"
      );
      await execFileAsync("git", ["add", "."], { cwd: wt1 });
      await execFileAsync("git", ["commit", "-m", "Implement mod.js"], { cwd: wt1 });

      // 7.5. POST /api/workspaces/verify for task-01
      const verifyRes1 = await fetch(`${base}/workspaces/verify`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          task_id: "task-rest-01",
          project_path: sandboxPath,
        }),
      });
      assert.equal(verifyRes1.status, 200);
      const verifyData1 = await verifyRes1.json();
      assert.equal(verifyData1.verified, true);
      assert.equal(verifyData1.workspace_id, "task-rest-01");
      assert.equal(verifyData1.invariant_checks.target_test, true);

      // 7.6. POST /api/workspaces/merge for task-01
      const mergeRes1 = await fetch(`${base}/workspaces/merge`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          task_id: "task-rest-01",
          project_path: sandboxPath,
        }),
      });
      assert.equal(mergeRes1.status, 200);
      const mergeData1 = await mergeRes1.json();
      assert.equal(mergeData1.merged, true);
      assert.equal(mergeData1.status, "merged");
      assert.ok(mergeData1.commit_hash);

      // 7.7. Verify missing task_id errors
      const missingVerify = await fetch(`${base}/workspaces/verify`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      assert.equal(missingVerify.status, 400);

      const missingMerge = await fetch(`${base}/workspaces/merge`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      assert.equal(missingMerge.status, 400);

      const missingPrune = await fetch(`${base}/workspaces/prune`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      assert.equal(missingPrune.status, 400);

      // 7.8. POST /api/workspaces/prune
      const pruneRes = await fetch(`${base}/workspaces/prune`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          task_id: "task-rest-02",
          project_path: sandboxPath,
        }),
      });
      assert.equal(pruneRes.status, 200);
      const pruneData = await pruneRes.json();
      assert.equal(pruneData.pruned, true);
      assert.equal(pruneData.workspace_id, "task-rest-02");
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  await t.test("8. REST API: Verification failure before merge rejects merge with 409", async () => {
    const { sandboxPath, catalogRoot, registryRoot } = sandbox;
    const server = createCatalogServer({ catalogRoot, registryRoot });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address();
    const base = `http://127.0.0.1:${port}/api`;

    try {
      // Spawn workspace with failing target test
      await fetch(`${base}/workspaces/spawn`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          procedure_type: "INNER_LOOP_TDD",
          task_id: "task-failing",
          target_test_file: "test/broken.test.js",
          owned_files: ["src/broken.js", "test/broken.test.js"],
          project_path: sandboxPath,
        }),
      });

      const wt = path.join(sandboxPath, ".workspaces", "task-failing");
      await fs.mkdir(path.join(wt, "test"), { recursive: true });
      await fs.writeFile(
        path.join(wt, "test", "broken.test.js"),
        `const test = require("node:test");\nconst assert = require("node:assert/strict");\ntest("fails", () => { assert.equal(1, 2); });\n`,
        "utf8"
      );
      await execFileAsync("git", ["add", "."], { cwd: wt });
      await execFileAsync("git", ["commit", "-m", "Failing test commit"], { cwd: wt });

      // Attempt merge ➔ should fail verification and return 409
      const mergeRes = await fetch(`${base}/workspaces/merge`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          task_id: "task-failing",
          project_path: sandboxPath,
        }),
      });

      assert.equal(mergeRes.status, 409);
      const mergeData = await mergeRes.json();
      assert.equal(mergeData.code, "VERIFICATION_FAILED");
      assert.ok(mergeData.verification_result);
      assert.equal(mergeData.verification_result.verified, false);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
