"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { execFile } = require("node:child_process");
const fs = require("node:fs/promises");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { promisify } = require("node:util");

const { createCatalogServer } = require("../src/server");
const { run } = require("../src/cli");
const {
  spawnProcedureWorkspace,
  pruneProcedureWorkspace,
  listProcedureWorkspaces,
  getProcedureWorkspace,
} = require("../src/workspace-manager");
const {
  enqueueWorkspace,
  verifyWorkspace,
  mergeWorkspace,
  discardWorkspace,
  getQueueStatus,
} = require("../src/sequential-merger");

const execFileAsync = promisify(execFile);

/**
 * Creates an isolated Git repository sandbox for each test.
 */
async function createSandboxGitRepo() {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "sp-m4-c2-sandbox-"));

  await execFileAsync("git", ["init", "-b", "main"], { cwd: tmpDir });
  await execFileAsync("git", ["config", "user.name", "Challenger2 Runner"], { cwd: tmpDir });
  await execFileAsync("git", ["config", "user.email", "challenger2@skills-platform.test"], { cwd: tmpDir });

  await fs.writeFile(
    path.join(tmpDir, ".gitignore"),
    ".agents/\n.claude/\n.workspaces/\n.skills-platform/\nnode_modules/\n",
    "utf8"
  );
  await fs.writeFile(path.join(tmpDir, "README.md"), "# Skills Platform Test Main\n", "utf8");
  await fs.writeFile(
    path.join(tmpDir, "package.json"),
    JSON.stringify({ name: "sandbox-repo", version: "1.0.0" }, null, 2),
    "utf8"
  );
  await execFileAsync("git", ["add", "."], { cwd: tmpDir });
  await execFileAsync("git", ["commit", "-m", "Initial commit on main"], { cwd: tmpDir });

  const registryRoot = path.join(tmpDir, ".skills-platform", "registry");
  const catalogRoot = path.join(tmpDir, ".skills-platform", "catalog");
  await fs.mkdir(registryRoot, { recursive: true });
  await fs.mkdir(catalogRoot, { recursive: true });

  return { sandboxPath: tmpDir, registryRoot, catalogRoot };
}

/**
 * Cleans up sandbox Git repo.
 */
async function cleanupSandboxGitRepo(tmpDir) {
  try {
    await execFileAsync("git", ["worktree", "prune"], { cwd: tmpDir }).catch(() => {});
    await fs.rm(tmpDir, { recursive: true, force: true });
  } catch {}
}

/**
 * Helper to start a local test catalog server on an ephemeral port.
 */
async function startTestServer({ catalogRoot, registryRoot }) {
  const server = createCatalogServer({ catalogRoot, registryRoot });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}/api`;
  return {
    server,
    base,
    port,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

/**
 * Low-level HTTP helper to test raw socket/malformed requests without fetch sanitization.
 */
function rawHttpRequest({ host = "127.0.0.1", port, method, path, headers = {}, body = "" }) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host,
        port,
        method,
        path,
        headers,
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8");
          let parsed;
          try {
            parsed = JSON.parse(raw);
          } catch {
            parsed = raw;
          }
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: parsed,
            raw,
          });
        });
      }
    );
    req.on("error", reject);
    if (body) {
      req.write(body);
    }
    req.end();
  });
}

test("Milestone M4 Challenger 2: Adversarial Fuzzing, Concurrency & HTTP Invariants Suite", async (suite) => {

  // =========================================================================
  // SCENARIO 1: RAPID CONCURRENT WORKSPACE ENDPOINT REQUESTS & STRESS
  // =========================================================================

  await suite.test("1.1 Rapid concurrent POST /api/workspaces/spawn with 10 parallel workspaces", async () => {
    const { sandboxPath, catalogRoot, registryRoot } = await createSandboxGitRepo();
    const serverInstance = await startTestServer({ catalogRoot, registryRoot });
    const { base } = serverInstance;

    try {
      const concurrencyCount = 10;
      const spawnPromises = [];

      for (let i = 0; i < concurrencyCount; i++) {
        const taskId = `task-rapid-spawn-${i}`;
        const body = {
          procedure_type: i % 2 === 0 ? "PLANNING" : "INNER_LOOP_TDD",
          task_id: taskId,
          target_test_file: `test/rapid-${i}.test.js`,
          owned_files: [`src/rapid-${i}.js`, `test/rapid-${i}.test.js`],
          project_path: sandboxPath,
        };

        spawnPromises.push(
          fetch(`${base}/workspaces/spawn`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          }).then(async (res) => {
            const data = await res.json();
            return { status: res.status, data, taskId };
          })
        );
      }

      const results = await Promise.all(spawnPromises);

      // Verify every single spawn succeeded with 201 Created
      for (const res of results) {
        assert.equal(res.status, 201, `Failed to spawn ${res.taskId}: ${JSON.stringify(res.data)}`);
        assert.ok(res.data.workspace);
        assert.equal(res.data.workspace.workspace_id, res.taskId);
        assert.equal(res.data.workspace.status, "active");
      }

      // Query GET /api/workspaces and verify all 10 exist
      const listRes = await fetch(`${base}/workspaces?project_path=${encodeURIComponent(sandboxPath)}`);
      assert.equal(listRes.status, 200);
      const listData = await listRes.json();
      assert.equal(listData.workspaces.length, concurrencyCount);

      // Verify worktrees and skill directories on disk
      for (let i = 0; i < concurrencyCount; i++) {
        const wtDir = path.join(sandboxPath, ".workspaces", `task-rapid-spawn-${i}`);
        const stat = await fs.stat(wtDir);
        assert.ok(stat.isDirectory());
      }
    } finally {
      await serverInstance.close();
      await cleanupSandboxGitRepo(sandboxPath);
    }
  });

  await suite.test("1.2 Rapid concurrent POST /api/workspaces/verify on multiple active workspaces", async () => {
    const { sandboxPath, catalogRoot, registryRoot } = await createSandboxGitRepo();
    const serverInstance = await startTestServer({ catalogRoot, registryRoot });
    const { base } = serverInstance;

    try {
      const count = 5;
      for (let i = 0; i < count; i++) {
        const taskId = `task-verify-conc-${i}`;
        await spawnProcedureWorkspace({
          procedure_type: "INNER_LOOP_TDD",
          task_id: taskId,
          target_test_file: `test/conc-${i}.test.js`,
          owned_files: [`src/conc-${i}.js`, `test/conc-${i}.test.js`],
          project_path: sandboxPath,
        });

        const wt = path.join(sandboxPath, ".workspaces", taskId);
        await fs.mkdir(path.join(wt, "src"), { recursive: true });
        await fs.mkdir(path.join(wt, "test"), { recursive: true });
        await fs.writeFile(path.join(wt, "src", `conc-${i}.js`), `module.exports = ${i};\n`, "utf8");
        await fs.writeFile(
          path.join(wt, "test", `conc-${i}.test.js`),
          `const test = require("node:test");\nconst assert = require("node:assert/strict");\ntest("test ${i}", () => { assert.equal(1, 1); });\n`,
          "utf8"
        );
        await execFileAsync("git", ["add", "."], { cwd: wt });
        await execFileAsync("git", ["commit", "-m", `feat: task ${i}`], { cwd: wt });
      }

      // Fire 5 concurrent verify HTTP requests
      const verifyPromises = [];
      for (let i = 0; i < count; i++) {
        const taskId = `task-verify-conc-${i}`;
        verifyPromises.push(
          fetch(`${base}/workspaces/verify`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ task_id: taskId, project_path: sandboxPath }),
          }).then(async (res) => ({ status: res.status, data: await res.json(), taskId }))
        );
      }

      const results = await Promise.all(verifyPromises);
      for (const res of results) {
        assert.equal(res.status, 200, `Verification failed for ${res.taskId}: ${JSON.stringify(res.data)}`);
        assert.equal(res.data.verified, true);
        assert.equal(res.data.workspace_id, res.taskId);
        assert.equal(res.data.invariant_checks.target_test, true);
        assert.equal(res.data.invariant_checks.owned_files, true);
      }
    } finally {
      await serverInstance.close();
      await cleanupSandboxGitRepo(sandboxPath);
    }
  });

  await suite.test("1.3 Rapid concurrent POST /api/workspaces/merge on independent workspaces", async () => {
    const { sandboxPath, catalogRoot, registryRoot } = await createSandboxGitRepo();
    const serverInstance = await startTestServer({ catalogRoot, registryRoot });
    const { base } = serverInstance;

    try {
      const count = 4;
      for (let i = 0; i < count; i++) {
        const taskId = `task-indep-merge-${i}`;
        await spawnProcedureWorkspace({
          procedure_type: "INNER_LOOP_TDD",
          task_id: taskId,
          target_test_file: `test/indep-${i}.test.js`,
          owned_files: [`src/indep-${i}.js`, `test/indep-${i}.test.js`],
          project_path: sandboxPath,
        });

        const wt = path.join(sandboxPath, ".workspaces", taskId);
        await fs.mkdir(path.join(wt, "src"), { recursive: true });
        await fs.mkdir(path.join(wt, "test"), { recursive: true });
        await fs.writeFile(path.join(wt, "src", `indep-${i}.js`), `module.exports = { idx: ${i} };\n`, "utf8");
        await fs.writeFile(
          path.join(wt, "test", `indep-${i}.test.js`),
          `const test = require("node:test");\nconst assert = require("node:assert/strict");\nconst { idx } = require("../src/indep-${i}");\ntest("test ${i}", () => { assert.equal(idx, ${i}); });\n`,
          "utf8"
        );
        await execFileAsync("git", ["add", "."], { cwd: wt });
        await execFileAsync("git", ["commit", "-m", `feat: independent task ${i}`], { cwd: wt });
      }

      // Fire 4 concurrent merge requests
      const mergePromises = [];
      for (let i = 0; i < count; i++) {
        const taskId = `task-indep-merge-${i}`;
        mergePromises.push(
          fetch(`${base}/workspaces/merge`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ task_id: taskId, project_path: sandboxPath }),
          }).then(async (res) => ({ status: res.status, data: await res.json(), taskId }))
        );
      }

      const results = await Promise.all(mergePromises);
      for (const res of results) {
        assert.equal(res.status, 200, `Merge failed for ${res.taskId}: ${JSON.stringify(res.data)}`);
        assert.equal(res.data.merged, true);
        assert.ok(res.data.commit_hash);
      }

      // Verify all 4 files exist in main branch
      for (let i = 0; i < count; i++) {
        const fileContent = await fs.readFile(path.join(sandboxPath, "src", `indep-${i}.js`), "utf8");
        assert.ok(fileContent.includes(`idx: ${i}`));
      }
    } finally {
      await serverInstance.close();
      await cleanupSandboxGitRepo(sandboxPath);
    }
  });

  await suite.test("1.4 Rapid concurrent reads to /api/workspaces and /api/workspaces/queue under heavy load", async () => {
    const { sandboxPath, catalogRoot, registryRoot } = await createSandboxGitRepo();
    const serverInstance = await startTestServer({ catalogRoot, registryRoot });
    const { base } = serverInstance;

    try {
      // Spawn 3 workspaces
      for (let i = 0; i < 3; i++) {
        await spawnProcedureWorkspace({
          procedure_type: "PLANNING",
          task_id: `task-load-${i}`,
          project_path: sandboxPath,
        });
      }

      // Fire 30 rapid parallel GET requests to /workspaces and /workspaces/queue
      const readPromises = [];
      for (let i = 0; i < 30; i++) {
        const endpoint = i % 2 === 0 ? "workspaces" : "workspaces/queue";
        readPromises.push(
          fetch(`${base}/${endpoint}?project_path=${encodeURIComponent(sandboxPath)}`)
            .then(async (res) => ({ status: res.status, data: await res.json(), endpoint }))
        );
      }

      const results = await Promise.all(readPromises);
      for (const res of results) {
        assert.equal(res.status, 200);
        if (res.endpoint === "workspaces") {
          assert.ok(Array.isArray(res.data.workspaces));
          assert.equal(res.data.workspaces.length, 3);
        } else {
          assert.ok(Array.isArray(res.data.queue));
        }
      }
    } finally {
      await serverInstance.close();
      await cleanupSandboxGitRepo(sandboxPath);
    }
  });

  await suite.test("1.5 Rapid concurrent enqueue operations for dependent task pipeline (01 -> 02 -> 03)", async () => {
    const { sandboxPath, catalogRoot, registryRoot } = await createSandboxGitRepo();
    const serverInstance = await startTestServer({ catalogRoot, registryRoot });
    const { base } = serverInstance;

    try {
      // Spawn 3 workspaces
      for (let i = 1; i <= 3; i++) {
        await spawnProcedureWorkspace({
          procedure_type: "INNER_LOOP_TDD",
          task_id: `task-pipeline-${i}`,
          project_path: sandboxPath,
        });
      }

      // Enqueue concurrently with dependencies
      const enqPromises = [
        fetch(`${base}/workspaces/enqueue`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ task_id: "task-pipeline-1", dependencies: [], project_path: sandboxPath }),
        }).then((r) => r.json()),
        fetch(`${base}/workspaces/enqueue`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ task_id: "task-pipeline-2", dependencies: ["task-pipeline-1"], project_path: sandboxPath }),
        }).then((r) => r.json()),
        fetch(`${base}/workspaces/enqueue`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ task_id: "task-pipeline-3", dependencies: ["task-pipeline-2"], project_path: sandboxPath }),
        }).then((r) => r.json()),
      ];

      const enqResults = await Promise.all(enqPromises);
      for (const res of enqResults) {
        assert.equal(res.enqueued, true);
      }

      const queueRes = await fetch(`${base}/workspaces/queue?project_path=${encodeURIComponent(sandboxPath)}`);
      const queueData = await queueRes.json();
      assert.equal(queueData.queue.length, 3);
    } finally {
      await serverInstance.close();
      await cleanupSandboxGitRepo(sandboxPath);
    }
  });

  // =========================================================================
  // SCENARIO 2: HTTP 409 CONFLICT INVARIANTS ON MERGE
  // =========================================================================

  await suite.test("2.1 POST /api/workspaces/merge returns 409 Conflict when target test fails", async () => {
    const { sandboxPath, catalogRoot, registryRoot } = await createSandboxGitRepo();
    const serverInstance = await startTestServer({ catalogRoot, registryRoot });
    const { base } = serverInstance;

    try {
      await spawnProcedureWorkspace({
        procedure_type: "INNER_LOOP_TDD",
        task_id: "task-failing-test",
        target_test_file: "test/fail.test.js",
        owned_files: ["src/fail.js", "test/fail.test.js"],
        project_path: sandboxPath,
      });

      const wt = path.join(sandboxPath, ".workspaces", "task-failing-test");
      await fs.mkdir(path.join(wt, "test"), { recursive: true });
      await fs.writeFile(
        path.join(wt, "test", "fail.test.js"),
        `const test = require("node:test");\nconst assert = require("node:assert/strict");\ntest("intentionally failing", () => { assert.equal(1, 2); });\n`,
        "utf8"
      );
      await execFileAsync("git", ["add", "."], { cwd: wt });
      await execFileAsync("git", ["commit", "-m", "Failing test"], { cwd: wt });

      const res = await fetch(`${base}/workspaces/merge`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ task_id: "task-failing-test", project_path: sandboxPath }),
      });

      assert.equal(res.status, 409);
      const data = await res.json();
      assert.equal(data.code, "VERIFICATION_FAILED");
      assert.ok(data.verification_result);
      assert.equal(data.verification_result.verified, false);
      assert.equal(data.verification_result.invariant_checks.target_test, false);
    } finally {
      await serverInstance.close();
      await cleanupSandboxGitRepo(sandboxPath);
    }
  });

  await suite.test("2.2 POST /api/workspaces/merge returns 409 Conflict when owned_files boundary is violated", async () => {
    const { sandboxPath, catalogRoot, registryRoot } = await createSandboxGitRepo();
    const serverInstance = await startTestServer({ catalogRoot, registryRoot });
    const { base } = serverInstance;

    try {
      await spawnProcedureWorkspace({
        procedure_type: "INNER_LOOP_TDD",
        task_id: "task-scope-violation",
        target_test_file: "test/scoped.test.js",
        owned_files: ["src/scoped.js", "test/scoped.test.js"],
        project_path: sandboxPath,
      });

      const wt = path.join(sandboxPath, ".workspaces", "task-scope-violation");
      await fs.mkdir(path.join(wt, "src"), { recursive: true });
      await fs.mkdir(path.join(wt, "test"), { recursive: true });
      await fs.writeFile(path.join(wt, "src", "scoped.js"), "module.exports = 1;\n", "utf8");
      await fs.writeFile(
        path.join(wt, "test", "scoped.test.js"),
        `const test = require("node:test");\ntest("scoped pass", () => {});\n`,
        "utf8"
      );
      // Violate boundary: create unowned file in root / forbidden dir
      await fs.writeFile(path.join(wt, "UNOWNED_FILE.txt"), "forbidden modification\n", "utf8");
      await execFileAsync("git", ["add", "."], { cwd: wt });
      await execFileAsync("git", ["commit", "-m", "Scope boundary violation commit"], { cwd: wt });

      const res = await fetch(`${base}/workspaces/merge`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ task_id: "task-scope-violation", project_path: sandboxPath }),
      });

      assert.equal(res.status, 409);
      const data = await res.json();
      assert.equal(data.code, "VERIFICATION_FAILED");
      assert.ok(data.verification_result);
      assert.equal(data.verification_result.verified, false);
      assert.equal(data.verification_result.invariant_checks.owned_files, false);
    } finally {
      await serverInstance.close();
      await cleanupSandboxGitRepo(sandboxPath);
    }
  });

  await suite.test("2.3 POST /api/workspaces/merge returns 409 Conflict when unmerged dependency exists in merge queue", async () => {
    const { sandboxPath, catalogRoot, registryRoot } = await createSandboxGitRepo();
    const serverInstance = await startTestServer({ catalogRoot, registryRoot });
    const { base } = serverInstance;

    try {
      // Spawn parent (task-parent) and child (task-child)
      await spawnProcedureWorkspace({
        procedure_type: "INNER_LOOP_TDD",
        task_id: "task-dep-parent",
        target_test_file: "test/parent.test.js",
        owned_files: ["src/parent.js", "test/parent.test.js"],
        project_path: sandboxPath,
      });

      await spawnProcedureWorkspace({
        procedure_type: "INNER_LOOP_TDD",
        task_id: "task-dep-child",
        target_test_file: "test/child.test.js",
        owned_files: ["src/child.js", "test/child.test.js"],
        project_path: sandboxPath,
      });

      // Prepare passing commits in both
      for (const id of ["task-dep-parent", "task-dep-child"]) {
        const wt = path.join(sandboxPath, ".workspaces", id);
        const name = id.replace("task-dep-", "");
        await fs.mkdir(path.join(wt, "src"), { recursive: true });
        await fs.mkdir(path.join(wt, "test"), { recursive: true });
        await fs.writeFile(path.join(wt, "src", `${name}.js`), `module.exports = '${name}';\n`, "utf8");
        await fs.writeFile(
          path.join(wt, "test", `${name}.test.js`),
          `const test = require("node:test");\ntest("${name}", () => {});\n`,
          "utf8"
        );
        await execFileAsync("git", ["add", "."], { cwd: wt });
        await execFileAsync("git", ["commit", "-m", `feat: ${name}`], { cwd: wt });
      }

      // Enqueue child with dependency on parent
      const enqRes = await fetch(`${base}/workspaces/enqueue`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          task_id: "task-dep-child",
          dependencies: ["task-dep-parent"],
          project_path: sandboxPath,
        }),
      });
      assert.equal(enqRes.status, 201);

      // Attempt to merge child first -> MUST return 409 DEPENDENCY_NOT_MERGED
      const mergeChildRes = await fetch(`${base}/workspaces/merge`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ task_id: "task-dep-child", project_path: sandboxPath }),
      });

      assert.equal(mergeChildRes.status, 409);
      const childData = await mergeChildRes.json();
      assert.equal(childData.code, "DEPENDENCY_NOT_MERGED");
      assert.equal(childData.dependency, "task-dep-parent");

      // Now merge parent -> succeeds 200
      const mergeParentRes = await fetch(`${base}/workspaces/merge`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ task_id: "task-dep-parent", project_path: sandboxPath }),
      });
      assert.equal(mergeParentRes.status, 200);

      // Now child merge succeeds 200
      const mergeChildAfterRes = await fetch(`${base}/workspaces/merge`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ task_id: "task-dep-child", project_path: sandboxPath }),
      });
      assert.equal(mergeChildAfterRes.status, 200);
      const childMergedData = await mergeChildAfterRes.json();
      assert.equal(childMergedData.merged, true);
    } finally {
      await serverInstance.close();
      await cleanupSandboxGitRepo(sandboxPath);
    }
  });

  await suite.test("2.4 POST /api/workspaces/merge returns 409 Conflict when workspace is unverified and target test file is missing", async () => {
    const { sandboxPath, catalogRoot, registryRoot } = await createSandboxGitRepo();
    const serverInstance = await startTestServer({ catalogRoot, registryRoot });
    const { base } = serverInstance;

    try {
      await spawnProcedureWorkspace({
        procedure_type: "INNER_LOOP_TDD",
        task_id: "task-missing-test",
        target_test_file: "test/nonexistent.test.js",
        owned_files: ["src/file.js"],
        project_path: sandboxPath,
      });

      const res = await fetch(`${base}/workspaces/merge`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ task_id: "task-missing-test", project_path: sandboxPath }),
      });

      assert.equal(res.status, 409);
      const data = await res.json();
      assert.equal(data.code, "VERIFICATION_FAILED");
      assert.ok(data.verification_result);
      assert.equal(data.verification_result.verified, false);
      assert.equal(data.verification_result.invariant_checks.target_test, false);
    } finally {
      await serverInstance.close();
      await cleanupSandboxGitRepo(sandboxPath);
    }
  });

  // =========================================================================
  // SCENARIO 3: HTTP 400 BAD REQUEST & ADVERSARIAL FUZZING
  // =========================================================================

  await suite.test("3.1 Malformed JSON bodies return HTTP 400 with Invalid JSON error across all endpoints", async () => {
    const { sandboxPath, catalogRoot, registryRoot } = await createSandboxGitRepo();
    const serverInstance = await startTestServer({ catalogRoot, registryRoot });
    const { port } = serverInstance;

    try {
      const endpoints = [
        "/api/workspaces/spawn",
        "/api/workspaces/verify",
        "/api/workspaces/merge",
        "/api/workspaces/prune",
        "/api/workspaces/enqueue",
        "/api/workspaces/discard",
      ];

      const malformedPayloads = [
        "{ invalid json",
        '{"procedure_type": "PLANNING", unquoted: 123}',
        "{",
        "undefined",
        "NaN",
        '{"task_id": "test",,}',
      ];

      for (const endpoint of endpoints) {
        for (const malformed of malformedPayloads) {
          const res = await rawHttpRequest({
            port,
            method: "POST",
            path: endpoint,
            headers: {
              "content-type": "application/json",
              "content-length": Buffer.byteLength(malformed),
            },
            body: malformed,
          });

          assert.equal(res.status, 400, `Expected 400 for ${endpoint} with payload ${malformed}, got ${res.status}`);
          assert.equal(res.body.error, "Invalid JSON");
        }
      }
    } finally {
      await serverInstance.close();
      await cleanupSandboxGitRepo(sandboxPath);
    }
  });

  await suite.test("3.2 Missing required task_id parameter on operation endpoints strictly returns HTTP 400", async () => {
    const { sandboxPath, catalogRoot, registryRoot } = await createSandboxGitRepo();
    const serverInstance = await startTestServer({ catalogRoot, registryRoot });
    const { base } = serverInstance;

    try {
      const operationEndpoints = [
        "verify",
        "merge",
        "prune",
        "enqueue",
        "discard",
      ];

      for (const ep of operationEndpoints) {
        const res = await fetch(`${base}/workspaces/${ep}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ project_path: sandboxPath }),
        });

        assert.equal(res.status, 400, `Expected 400 for /${ep} without task_id, got ${res.status}`);
        const data = await res.json();
        assert.equal(data.error, "task_id or workspace_id is required");
      }
    } finally {
      await serverInstance.close();
      await cleanupSandboxGitRepo(sandboxPath);
    }
  });

  await suite.test("3.3 Invalid procedure_type on POST /api/workspaces/spawn returns HTTP 400", async () => {
    const { sandboxPath, catalogRoot, registryRoot } = await createSandboxGitRepo();
    const serverInstance = await startTestServer({ catalogRoot, registryRoot });
    const { base } = serverInstance;

    try {
      const invalidTypes = [
        "INVALID_PROCEDURE",
        "HACKING_MODE",
        "FAST_TRACK",
        "12345",
        "__proto__",
      ];

      for (const invalidType of invalidTypes) {
        const res = await fetch(`${base}/workspaces/spawn`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            procedure_type: invalidType,
            task_id: "task-bad-type",
            project_path: sandboxPath,
          }),
        });

        assert.equal(res.status, 400, `Expected 400 for invalid procedure_type "${invalidType}", got ${res.status}`);
        const data = await res.json();
        assert.ok(data.error);
        assert.match(data.error, /Invalid procedure_type/);
      }
    } finally {
      await serverInstance.close();
      await cleanupSandboxGitRepo(sandboxPath);
    }
  });

  await suite.test("3.4 Operations on non-existent workspaces return HTTP 400 with descriptive error", async () => {
    const { sandboxPath, catalogRoot, registryRoot } = await createSandboxGitRepo();
    const serverInstance = await startTestServer({ catalogRoot, registryRoot });
    const { base } = serverInstance;

    try {
      const nonExistentId = "task-ghost-nonexistent-404";

      // 1. Verify non-existent -> 400
      const verifyRes = await fetch(`${base}/workspaces/verify`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ task_id: nonExistentId, project_path: sandboxPath }),
      });
      assert.equal(verifyRes.status, 400);
      const verifyData = await verifyRes.json();
      assert.match(verifyData.error, /not found/);

      // 2. Merge non-existent -> 400
      const mergeRes = await fetch(`${base}/workspaces/merge`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ task_id: nonExistentId, project_path: sandboxPath }),
      });
      assert.equal(mergeRes.status, 400);
      const mergeData = await mergeRes.json();
      assert.match(mergeData.error, /not found/);
    } finally {
      await serverInstance.close();
      await cleanupSandboxGitRepo(sandboxPath);
    }
  });

  await suite.test("3.5 Invalid Git project path returns HTTP 400", async () => {
    const { catalogRoot, registryRoot } = await createSandboxGitRepo();
    const nonGitDir = await fs.mkdtemp(path.join(os.tmpdir(), "sp-non-git-"));
    const serverInstance = await startTestServer({ catalogRoot, registryRoot });
    const { base } = serverInstance;

    try {
      const res = await fetch(`${base}/workspaces/spawn`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          procedure_type: "PLANNING",
          task_id: "task-non-git",
          project_path: nonGitDir,
        }),
      });

      assert.equal(res.status, 400);
      const data = await res.json();
      assert.ok(data.error);
    } finally {
      await serverInstance.close();
      await fs.rm(nonGitDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  // =========================================================================
  // SCENARIO 4: FULL LIFECYCLE INTEROPERABILITY & CLI/REST PARITY
  // =========================================================================

  await suite.test("4.1 Full cross-layer lifecycle: CLI Spawn -> HTTP Verify -> HTTP Enqueue -> HTTP Merge -> HTTP Prune", async () => {
    const { sandboxPath, catalogRoot, registryRoot } = await createSandboxGitRepo();
    const serverInstance = await startTestServer({ catalogRoot, registryRoot });
    const { base } = serverInstance;

    try {
      const taskId = "task-e2e-interop";

      // 1. Spawn via CLI
      const cliSpawnResult = await run([
        "workspace", "spawn",
        "--procedure", "INNER_LOOP_TDD",
        "--task", taskId,
        "--test", "test/interop.test.js",
        "--owned", "src/interop.js",
        "--owned", "test/interop.test.js",
        "--project", sandboxPath,
      ]);
      assert.equal(cliSpawnResult.workspace_id, taskId);

      // 2. Implement passing code in worktree
      const wt = path.join(sandboxPath, ".workspaces", taskId);
      await fs.mkdir(path.join(wt, "src"), { recursive: true });
      await fs.mkdir(path.join(wt, "test"), { recursive: true });
      await fs.writeFile(path.join(wt, "src", "interop.js"), "module.exports = { ready: true };\n", "utf8");
      await fs.writeFile(
        path.join(wt, "test", "interop.test.js"),
        `const test = require("node:test");\nconst assert = require("node:assert/strict");\nconst { ready } = require("../src/interop");\ntest("interop", () => { assert.equal(ready, true); });\n`,
        "utf8"
      );
      await execFileAsync("git", ["add", "."], { cwd: wt });
      await execFileAsync("git", ["commit", "-m", "Implement interop feature"], { cwd: wt });

      // 3. Verify via HTTP POST /api/workspaces/verify
      const httpVerifyRes = await fetch(`${base}/workspaces/verify`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ task_id: taskId, project_path: sandboxPath }),
      });
      assert.equal(httpVerifyRes.status, 200);
      const httpVerifyData = await httpVerifyRes.json();
      assert.equal(httpVerifyData.verified, true);

      // 4. Enqueue via HTTP POST /api/workspaces/enqueue
      const httpEnqRes = await fetch(`${base}/workspaces/enqueue`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ task_id: taskId, project_path: sandboxPath }),
      });
      assert.equal(httpEnqRes.status, 201);

      // 5. Merge via HTTP POST /api/workspaces/merge
      const httpMergeRes = await fetch(`${base}/workspaces/merge`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ task_id: taskId, project_path: sandboxPath }),
      });
      assert.equal(httpMergeRes.status, 200);
      const httpMergeData = await httpMergeRes.json();
      assert.equal(httpMergeData.merged, true);

      // 6. Verify main branch contains the committed file
      const mainInterop = await fs.readFile(path.join(sandboxPath, "src", "interop.js"), "utf8");
      assert.ok(mainInterop.includes("ready: true"));

      // 7. Prune via HTTP POST /api/workspaces/prune
      const httpPruneRes = await fetch(`${base}/workspaces/prune`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ task_id: taskId, project_path: sandboxPath }),
      });
      assert.equal(httpPruneRes.status, 200);
      const httpPruneData = await httpPruneRes.json();
      assert.equal(httpPruneData.pruned, true);

      // Verify worktree folder is gone
      let exists = false;
      try {
        await fs.stat(wt);
        exists = true;
      } catch {}
      assert.equal(exists, false);
    } finally {
      await serverInstance.close();
      await cleanupSandboxGitRepo(sandboxPath);
    }
  });

  await suite.test("4.2 REST POST /api/workspaces/discard cleans up queue status and marks discarded", async () => {
    const { sandboxPath, catalogRoot, registryRoot } = await createSandboxGitRepo();
    const serverInstance = await startTestServer({ catalogRoot, registryRoot });
    const { base } = serverInstance;

    try {
      const taskId = "task-to-discard";

      await spawnProcedureWorkspace({
        procedure_type: "PLANNING",
        task_id: taskId,
        project_path: sandboxPath,
      });

      await fetch(`${base}/workspaces/enqueue`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ task_id: taskId, project_path: sandboxPath }),
      });

      const discardRes = await fetch(`${base}/workspaces/discard`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ task_id: taskId, reason: "Discarded test task", project_path: sandboxPath }),
      });

      assert.equal(discardRes.status, 200);
      const discardData = await discardRes.json();
      assert.equal(discardData.discarded, true);
      assert.equal(discardData.workspace_id, taskId);

      // Verify queue status reflects discarded
      const queueRes = await fetch(`${base}/workspaces/queue?project_path=${encodeURIComponent(sandboxPath)}`);
      const queueData = await queueRes.json();
      const item = queueData.queue.find((q) => q.workspace_id === taskId);
      assert.equal(item.status, "discarded");
    } finally {
      await serverInstance.close();
      await cleanupSandboxGitRepo(sandboxPath);
    }
  });
});
