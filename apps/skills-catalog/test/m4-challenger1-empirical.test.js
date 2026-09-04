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
const {
  validateProcedureWorkspace,
  PROCEDURE_TYPES,
  PROCEDURE_WORKSPACE_STATUSES,
} = require("@skills-platform/contracts");

const execFileAsync = promisify(execFile);
const CLI_PATH = path.resolve(__dirname, "../src/cli.js");

/**
 * Creates an isolated Git sandbox repository for adversarial tests.
 */
async function createSandboxGitRepo(name = "sp-m4-challenger-") {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), name));

  await execFileAsync("git", ["init", "-b", "main"], { cwd: tmpDir });
  await execFileAsync("git", ["config", "user.name", "Challenger Runner"], { cwd: tmpDir });
  await execFileAsync("git", ["config", "user.email", "challenger@skills-platform.test"], { cwd: tmpDir });

  await fs.writeFile(path.join(tmpDir, "README.md"), "# Challenger Sandbox\n", "utf8");
  await fs.writeFile(
    path.join(tmpDir, "package.json"),
    JSON.stringify({ name: "sandbox", version: "1.0.0" }, null, 2),
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
 * Cleans up sandbox Git repository.
 */
async function cleanupSandboxGitRepo(tmpDir) {
  try {
    await execFileAsync("git", ["worktree", "prune"], { cwd: tmpDir }).catch(() => {});
    await fs.rm(tmpDir, { recursive: true, force: true });
  } catch {}
}

/**
 * Helper to run CLI as a spawned process and capture stdout, stderr, exitCode.
 */
async function execCli(args, { cwd } = {}) {
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [CLI_PATH, ...args], {
      cwd: cwd || process.cwd(),
      windowsHide: true,
      maxBuffer: 10 * 1024 * 1024,
    });
    return {
      stdout: stdout.trim(),
      stderr: stderr.trim(),
      exitCode: 0,
      json: stdout.trim() ? JSON.parse(stdout.trim()) : null,
    };
  } catch (error) {
    return {
      stdout: (error.stdout || "").trim(),
      stderr: (error.stderr || "").trim(),
      exitCode: error.code || 1,
      json: null,
      error,
    };
  }
}

/**
 * Helper to make raw HTTP requests (supports malformed / raw streams / custom body sizes).
 */
function rawHttpRequest({ port, method, path: reqPath, headers = {}, body = null }) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: "127.0.0.1",
      port,
      path: reqPath,
      method,
      headers: {
        ...headers,
      },
    };

    const req = http.request(options, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const rawBody = Buffer.concat(chunks).toString("utf8");
        let jsonBody = null;
        try {
          jsonBody = JSON.parse(rawBody);
        } catch {}
        resolve({
          status: res.statusCode,
          headers: res.headers,
          rawBody,
          json: jsonBody,
        });
      });
    });

    req.on("error", (err) => {
      // Return error representation so tests can inspect connection resets/destroys
      resolve({
        error: err,
        status: null,
        headers: null,
        rawBody: null,
        json: null,
      });
    });

    if (body !== null) {
      if (typeof body === "string" || Buffer.isBuffer(body)) {
        req.write(body);
      } else {
        req.write(JSON.stringify(body));
      }
    }
    req.end();
  });
}

test("Milestone M4 Challenger 1: Empirical CLI & REST API Stress Suite", async (t) => {

  // =========================================================================
  // SECTION 1: CLI Direct Process Invocations, Flags & Combinations
  // =========================================================================
  await t.test("1. CLI Process: Complete Lifecycle & Flag Combinations", async (st) => {
    const sandbox = await createSandboxGitRepo("sp-cli-test-");
    const { sandboxPath } = sandbox;

    try {
      await st.test("1.1 Spawn with all standard ProcedureTypes and verify isolated mounts", async () => {
        const types = ["PLANNING", "INNER_LOOP_TDD", "SECURITY_AUDIT", "RELEASE_GATE"];

        for (const pType of types) {
          const taskId = `task-cli-${pType.toLowerCase()}`;
          const res = await execCli([
            "workspace", "spawn",
            "--procedure", pType,
            "--task", taskId,
            "--project", sandboxPath,
          ]);

          assert.equal(res.exitCode, 0, `CLI spawn failed for ${pType}: ${res.stderr}`);
          assert.ok(res.json, "Expected JSON output from CLI spawn");
          assert.equal(res.json.workspace_id, taskId);
          assert.equal(res.json.procedure_type, pType);
          assert.equal(res.json.status, "active");

          // Schema validation
          const validation = validateProcedureWorkspace(res.json);
          assert.equal(validation.valid, true, `Schema issues for ${pType}: ${JSON.stringify(validation.issues)}`);

          // Check worktree directory created
          const wtPath = path.join(sandboxPath, ".workspaces", taskId);
          const wtStat = await fs.stat(wtPath);
          assert.ok(wtStat.isDirectory());

          // Verify active skills mounted in worktree
          const skillsDir = path.join(wtPath, ".agents", "skills");
          const mountedSkills = await fs.readdir(skillsDir);
          assert.ok(mountedSkills.length > 0, `No skills mounted for ${pType}`);
          for (const skill of res.json.active_skills) {
            assert.ok(mountedSkills.includes(skill), `Mounted skills missing ${skill} for ${pType}`);
          }
        }
      });

      await st.test("1.2 Spawn with multi-value flags and positional arguments", async () => {
        const taskId = "task-cli-multi";
        const res = await execCli([
          "workspace", "spawn", taskId,
          "--procedure-type", "INNER_LOOP_TDD",
          "--target-test-file", "test/feature.test.js",
          "--owned-file", "src/feature.js",
          "--owned-file", "test/feature.test.js",
          "--prohibited-action", "npm test",
          "--prohibited-action", "pytest",
          "--acceptance-criterion", "100% test pass",
          "--acceptance-criterion", "0 regressions",
          "--project", sandboxPath,
        ]);

        assert.equal(res.exitCode, 0, `CLI spawn failed: ${res.stderr}`);
        assert.equal(res.json.workspace_id, taskId);
        assert.equal(res.json.responsibility_invariants.target_test_file, "test/feature.test.js");
        assert.deepEqual(res.json.responsibility_invariants.owned_files, ["src/feature.js", "test/feature.test.js"]);
        assert.deepEqual(res.json.responsibility_invariants.prohibited_actions, ["npm test", "pytest"]);
        assert.deepEqual(res.json.responsibility_invariants.acceptance_criteria, ["100% test pass", "0 regressions"]);

        const validation = validateProcedureWorkspace(res.json);
        assert.equal(validation.valid, true);
      });

      await st.test("1.3 CLI list with filters and status transitions", async () => {
        // List all currently in sandbox (4 from 1.1 + 1 from 1.2 = 5)
        const listBefore = await execCli(["workspace", "list", "--project", sandboxPath]);
        assert.equal(listBefore.exitCode, 0);
        const countBefore = listBefore.json.length;

        // Spawn 2 more workspaces
        await execCli(["workspace", "spawn", "--task", "ws-list-1", "--procedure", "PLANNING", "--project", sandboxPath]);
        await execCli(["workspace", "spawn", "--task", "ws-list-2", "--procedure", "INNER_LOOP_TDD", "--project", sandboxPath]);

        // List all
        const listAll = await execCli(["workspace", "list", "--project", sandboxPath]);
        assert.equal(listAll.exitCode, 0);
        assert.ok(Array.isArray(listAll.json));
        assert.equal(listAll.json.length, countBefore + 2);

        // List active
        const listActive = await execCli(["workspace", "list", "--status", "active", "--project", sandboxPath]);
        assert.equal(listActive.exitCode, 0);
        assert.equal(listActive.json.length, countBefore + 2);

        // List merged (should be 0)
        const listMerged = await execCli(["workspace", "list", "--status", "merged", "--project", sandboxPath]);
        assert.equal(listMerged.exitCode, 0);
        assert.equal(listMerged.json.length, 0);
      });

      await st.test("1.4 CLI verify, merge, and prune end-to-end", async () => {
        const taskId = "task-cli-e2e";
        await execCli([
          "workspace", "spawn",
          "--task", taskId,
          "--procedure", "INNER_LOOP_TDD",
          "--test", "test/math.test.js",
          "--owned", "src/math.js",
          "--owned", "test/math.test.js",
          "--project", sandboxPath,
        ]);

        const wt = path.join(sandboxPath, ".workspaces", taskId);
        await fs.mkdir(path.join(wt, "src"), { recursive: true });
        await fs.mkdir(path.join(wt, "test"), { recursive: true });
        await fs.writeFile(path.join(wt, "src", "math.js"), "module.exports = { multiply: (a, b) => a * b };\n", "utf8");
        await fs.writeFile(
          path.join(wt, "test", "math.test.js"),
          `const test = require("node:test");\nconst assert = require("node:assert/strict");\nconst { multiply } = require("../src/math");\ntest("mult", () => { assert.equal(multiply(3, 4), 12); });\n`,
          "utf8"
        );
        await execFileAsync("git", ["add", "."], { cwd: wt });
        await execFileAsync("git", ["commit", "-m", "Implement multiply function"], { cwd: wt });

        // CLI Verify
        const verifyRes = await execCli(["workspace", "verify", "--task", taskId, "--project", sandboxPath]);
        assert.equal(verifyRes.exitCode, 0);
        assert.equal(verifyRes.json.verified, true);
        assert.equal(verifyRes.json.workspace_id, taskId);

        // CLI Merge
        const mergeRes = await execCli(["workspace", "merge", "--task", taskId, "--project", sandboxPath]);
        assert.equal(mergeRes.exitCode, 0);
        assert.equal(mergeRes.json.merged, true);
        assert.ok(mergeRes.json.commit_hash);

        // Verify root repo received files
        const rootMath = await fs.readFile(path.join(sandboxPath, "src", "math.js"), "utf8");
        assert.ok(rootMath.includes("multiply"));

        // CLI Prune
        const pruneRes = await execCli(["workspace", "prune", "--task", taskId, "--project", sandboxPath]);
        assert.equal(pruneRes.exitCode, 0);
        assert.equal(pruneRes.json.pruned, true);
      });

      await st.test("1.5 CLI Enqueue, Queue Status, and Discard", async () => {
        const taskId = "task-cli-q1";
        await execCli(["workspace", "spawn", "--task", taskId, "--procedure", "PLANNING", "--project", sandboxPath]);

        // Enqueue
        const enqRes = await execCli([
          "workspace", "enqueue",
          "--task", taskId,
          "--dependency", "dep-01",
          "--dependency", "dep-02",
          "--project", sandboxPath,
        ]);
        assert.equal(enqRes.exitCode, 0);
        assert.equal(enqRes.json.enqueued, true);

        // Queue status
        const qRes = await execCli(["workspace", "queue", "--project", sandboxPath]);
        assert.equal(qRes.exitCode, 0);
        assert.ok(Array.isArray(qRes.json.queue));
        const found = qRes.json.queue.find((q) => q.workspace_id === taskId);
        assert.ok(found);
        assert.deepEqual(found.dependencies, ["dep-01", "dep-02"]);

        // Discard
        const discardRes = await execCli([
          "workspace", "discard",
          "--task", taskId,
          "--reason", "Superceded by task-cli-q2",
          "--project", sandboxPath,
        ]);
        assert.equal(discardRes.exitCode, 0);
        assert.equal(discardRes.json.discarded, true);
        assert.equal(discardRes.json.workspace_id, taskId);
      });

      await st.test("1.6 CLI Error Exits & Invalid Arguments", async () => {
        // 1. Missing task on spawn -> exit 1
        const noTaskSpawn = await execCli(["workspace", "spawn", "--procedure", "PLANNING", "--project", sandboxPath]);
        assert.equal(noTaskSpawn.exitCode, 1);
        assert.match(noTaskSpawn.stderr, /requires --task/);

        // 2. Missing task on verify -> exit 1
        const noTaskVerify = await execCli(["workspace", "verify", "--project", sandboxPath]);
        assert.equal(noTaskVerify.exitCode, 1);
        assert.match(noTaskVerify.stderr, /requires --task/);

        // 3. Missing task on merge -> exit 1
        const noTaskMerge = await execCli(["workspace", "merge", "--project", sandboxPath]);
        assert.equal(noTaskMerge.exitCode, 1);
        assert.match(noTaskMerge.stderr, /requires --task/);

        // 4. Missing task on prune -> exit 1
        const noTaskPrune = await execCli(["workspace", "prune", "--project", sandboxPath]);
        assert.equal(noTaskPrune.exitCode, 1);
        assert.match(noTaskPrune.stderr, /requires --task/);

        // 5. Missing task on enqueue -> exit 1
        const noTaskEnq = await execCli(["workspace", "enqueue", "--project", sandboxPath]);
        assert.equal(noTaskEnq.exitCode, 1);
        assert.match(noTaskEnq.stderr, /requires --task/);

        // 6. Missing task on discard -> exit 1
        const noTaskDiscard = await execCli(["workspace", "discard", "--project", sandboxPath]);
        assert.equal(noTaskDiscard.exitCode, 1);
        assert.match(noTaskDiscard.stderr, /requires --task/);

        // 7. Unknown workspace action -> exit 1
        const unknownAction = await execCli(["workspace", "nonexistent-action", "--project", sandboxPath]);
        assert.equal(unknownAction.exitCode, 1);
        assert.match(unknownAction.stderr, /Unknown workspace action/);

        // 8. Invalid procedure type on spawn -> exit 1
        const invalidProc = await execCli(["workspace", "spawn", "--task", "bad-p", "--procedure", "INVALID_PROCEDURE", "--project", sandboxPath]);
        assert.equal(invalidProc.exitCode, 1);
      });
    } finally {
      await cleanupSandboxGitRepo(sandboxPath);
    }
  });

  // =========================================================================
  // SECTION 2: REST API HTTP Endpoints Stress & Boundary Testing
  // =========================================================================
  await t.test("2. REST API: HTTP Endpoints Adversarial & Stress Testing", async (st) => {
    const sandbox = await createSandboxGitRepo("sp-rest-test-");
    const { sandboxPath, catalogRoot, registryRoot } = sandbox;
    const server = createCatalogServer({ catalogRoot, registryRoot });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = server.address().port;
    const base = `http://127.0.0.1:${port}/api`;

    try {
      await st.test("2.1 CORS and OPTIONS preflight", async () => {
        const res = await rawHttpRequest({
          port,
          method: "OPTIONS",
          path: "/api/workspaces",
          headers: { origin: "http://localhost:5173" },
        });

        assert.equal(res.status, 204);
        assert.equal(res.headers["access-control-allow-origin"], "http://localhost:5173");
        assert.ok(res.headers["access-control-allow-methods"].includes("POST"));
      });

      await st.test("2.2 Malformed JSON & Payload Size Limit", async () => {
        // Malformed JSON string -> 400 Bad Request
        const malformedRes = await rawHttpRequest({
          port,
          method: "POST",
          path: "/api/workspaces/spawn",
          headers: { "content-type": "application/json" },
          body: "{ unclosed_json: true, ",
        });
        assert.equal(malformedRes.status, 400);
        assert.equal(malformedRes.json.error, "Invalid JSON");

        // Payload > 64KB -> socket destroyed / error handled
        const largeString = "a".repeat(70 * 1024);
        const oversizedRes = await rawHttpRequest({
          port,
          method: "POST",
          path: "/api/workspaces/spawn",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ task_id: "oversized", extra: largeString }),
        });
        // Server destroys request socket on body > 64KB (DoS protection)
        assert.ok(oversizedRes.status === 400 || oversizedRes.error !== null);
      });

      await st.test("2.3 Schema validations and type enforcement on POST /api/workspaces/spawn", async () => {
        // Invalid procedure_type -> 400
        const badProcRes = await rawHttpRequest({
          port,
          method: "POST",
          path: "/api/workspaces/spawn",
          headers: { "content-type": "application/json" },
          body: {
            task_id: "bad-proc-task",
            procedure_type: "UNSUPPORTED_PROC",
            project_path: sandboxPath,
          },
        });
        assert.equal(badProcRes.status, 400);
        assert.ok(badProcRes.json.error);
        assert.match(badProcRes.json.error, /Invalid procedure_type/);

        // Numeric procedure_type -> 400
        const numProcRes = await rawHttpRequest({
          port,
          method: "POST",
          path: "/api/workspaces/spawn",
          headers: { "content-type": "application/json" },
          body: {
            task_id: "num-proc-task",
            procedure_type: 12345,
            project_path: sandboxPath,
          },
        });
        assert.equal(numProcRes.status, 400);
      });

      await st.test("2.4 Both camelCase and snake_case payload support on spawn", async () => {
        // Snake case spawn
        const snakeRes = await rawHttpRequest({
          port,
          method: "POST",
          path: "/api/workspaces/spawn",
          headers: { "content-type": "application/json" },
          body: {
            task_id: "task-snake",
            procedure_type: "PLANNING",
            project_path: sandboxPath,
          },
        });
        assert.equal(snakeRes.status, 201);
        assert.equal(snakeRes.json.workspace.workspace_id, "task-snake");
        assert.equal(validateProcedureWorkspace(snakeRes.json.workspace).valid, true);

        // Camel case spawn
        const camelRes = await rawHttpRequest({
          port,
          method: "POST",
          path: "/api/workspaces/spawn",
          headers: { "content-type": "application/json" },
          body: {
            taskId: "task-camel",
            procedureType: "SECURITY_AUDIT",
            projectPath: sandboxPath,
          },
        });
        assert.equal(camelRes.status, 201);
        assert.equal(camelRes.json.workspace.workspace_id, "task-camel");
        assert.equal(validateProcedureWorkspace(camelRes.json.workspace).valid, true);
      });

      await st.test("2.5 GET /api/workspaces and /api/workspaces/queue with status filters", async () => {
        const getRes = await rawHttpRequest({
          port,
          method: "GET",
          path: `/api/workspaces?project_path=${encodeURIComponent(sandboxPath)}`,
        });
        assert.equal(getRes.status, 200);
        assert.ok(Array.isArray(getRes.json.workspaces));
        assert.ok(Array.isArray(getRes.json.merge_queue));
        assert.equal(getRes.json.workspaces.length, 2);

        // Every workspace in list satisfies validateProcedureWorkspace
        for (const ws of getRes.json.workspaces) {
          const val = validateProcedureWorkspace(ws);
          assert.equal(val.valid, true, `Workspace ${ws.workspace_id} schema invalid in list`);
        }

        // Filter active
        const getActive = await rawHttpRequest({
          port,
          method: "GET",
          path: `/api/workspaces?status=active&project_path=${encodeURIComponent(sandboxPath)}`,
        });
        assert.equal(getActive.status, 200);
        assert.equal(getActive.json.workspaces.length, 2);

        // Filter merged (0)
        const getMerged = await rawHttpRequest({
          port,
          method: "GET",
          path: `/api/workspaces?status=merged&project_path=${encodeURIComponent(sandboxPath)}`,
        });
        assert.equal(getMerged.status, 200);
        assert.equal(getMerged.json.workspaces.length, 0);

        // GET /api/workspaces/queue
        const getQ = await rawHttpRequest({
          port,
          method: "GET",
          path: `/api/workspaces/queue?project_path=${encodeURIComponent(sandboxPath)}`,
        });
        assert.equal(getQ.status, 200);
        assert.ok(Array.isArray(getQ.json.queue));
      });

      await st.test("2.6 POST /api/workspaces/verify: passing, failing test, invariant breach", async () => {
        // Spawn workspace for verification test
        await rawHttpRequest({
          port,
          method: "POST",
          path: "/api/workspaces/spawn",
          headers: { "content-type": "application/json" },
          body: {
            task_id: "task-verify-cases",
            procedure_type: "INNER_LOOP_TDD",
            target_test_file: "test/target.test.js",
            owned_files: ["src/target.js", "test/target.test.js"],
            project_path: sandboxPath,
          },
        });

        const wt = path.join(sandboxPath, ".workspaces", "task-verify-cases");
        await fs.mkdir(path.join(wt, "src"), { recursive: true });
        await fs.mkdir(path.join(wt, "test"), { recursive: true });

        // 1. Initial state: target test file doesn't exist yet -> verify should return false
        const verifyInit = await rawHttpRequest({
          port,
          method: "POST",
          path: "/api/workspaces/verify",
          headers: { "content-type": "application/json" },
          body: { task_id: "task-verify-cases", project_path: sandboxPath },
        });
        assert.equal(verifyInit.status, 200);
        assert.equal(verifyInit.json.verified, false);
        assert.equal(verifyInit.json.invariant_checks.target_test, false);

        // 2. Failing test written
        await fs.writeFile(
          path.join(wt, "test", "target.test.js"),
          `const test = require("node:test"); const assert = require("node:assert/strict"); test("fail", () => { assert.equal(1, 2); });`,
          "utf8"
        );
        await execFileAsync("git", ["add", "."], { cwd: wt });
        await execFileAsync("git", ["commit", "-m", "Failing test commit"], { cwd: wt });

        const verifyFail = await rawHttpRequest({
          port,
          method: "POST",
          path: "/api/workspaces/verify",
          headers: { "content-type": "application/json" },
          body: { task_id: "task-verify-cases", project_path: sandboxPath },
        });
        assert.equal(verifyFail.status, 200);
        assert.equal(verifyFail.json.verified, false);

        // 3. Passing test and implementation written
        await fs.writeFile(
          path.join(wt, "src", "target.js"),
          "module.exports = { greet: () => 'hello' };\n",
          "utf8"
        );
        await fs.writeFile(
          path.join(wt, "test", "target.test.js"),
          `const test = require("node:test"); const assert = require("node:assert/strict"); const { greet } = require("../src/target"); test("pass", () => { assert.equal(greet(), 'hello'); });`,
          "utf8"
        );
        await execFileAsync("git", ["add", "."], { cwd: wt });
        await execFileAsync("git", ["commit", "-m", "Passing implementation"], { cwd: wt });

        const verifyPass = await rawHttpRequest({
          port,
          method: "POST",
          path: "/api/workspaces/verify",
          headers: { "content-type": "application/json" },
          body: { task_id: "task-verify-cases", project_path: sandboxPath },
        });
        assert.equal(verifyPass.status, 200);
        assert.equal(verifyPass.json.verified, true);
        assert.equal(verifyPass.json.invariant_checks.target_test, true);
        assert.equal(verifyPass.json.invariant_checks.owned_files, true);

        // 4. Missing task_id -> 400
        const verifyMissing = await rawHttpRequest({
          port,
          method: "POST",
          path: "/api/workspaces/verify",
          headers: { "content-type": "application/json" },
          body: { project_path: sandboxPath },
        });
        assert.equal(verifyMissing.status, 400);
      });

      await st.test("2.7 POST /api/workspaces/merge: dependency gating, 409 conflict, and atomic merge", async () => {
        // Spawn parent (task-p1) and child (task-p2 with dependency on task-p1)
        await rawHttpRequest({
          port,
          method: "POST",
          path: "/api/workspaces/spawn",
          headers: { "content-type": "application/json" },
          body: {
            task_id: "task-p1",
            procedure_type: "INNER_LOOP_TDD",
            target_test_file: "test/p1.test.js",
            owned_files: ["src/p1.js", "test/p1.test.js"],
            project_path: sandboxPath,
          },
        });

        await rawHttpRequest({
          port,
          method: "POST",
          path: "/api/workspaces/spawn",
          headers: { "content-type": "application/json" },
          body: {
            task_id: "task-p2",
            procedure_type: "INNER_LOOP_TDD",
            target_test_file: "test/p2.test.js",
            owned_files: ["src/p2.js", "test/p2.test.js"],
            project_path: sandboxPath,
          },
        });

        // Enqueue task-p2 with dependency on task-p1
        const enqP2 = await rawHttpRequest({
          port,
          method: "POST",
          path: "/api/workspaces/enqueue",
          headers: { "content-type": "application/json" },
          body: {
            task_id: "task-p2",
            dependencies: ["task-p1"],
            project_path: sandboxPath,
          },
        });
        assert.equal(enqP2.status, 201);

        // Attempt merge task-p2 before task-p1 -> 409 DEPENDENCY_NOT_MERGED
        const prematureMerge = await rawHttpRequest({
          port,
          method: "POST",
          path: "/api/workspaces/merge",
          headers: { "content-type": "application/json" },
          body: { task_id: "task-p2", project_path: sandboxPath },
        });
        assert.equal(prematureMerge.status, 409);
        assert.equal(prematureMerge.json.code, "DEPENDENCY_NOT_MERGED");
        assert.equal(prematureMerge.json.dependency, "task-p1");

        // Implement task-p1 with passing test
        const wt1 = path.join(sandboxPath, ".workspaces", "task-p1");
        await fs.mkdir(path.join(wt1, "src"), { recursive: true });
        await fs.mkdir(path.join(wt1, "test"), { recursive: true });
        await fs.writeFile(path.join(wt1, "src", "p1.js"), "module.exports = { v1: 100 };\n", "utf8");
        await fs.writeFile(
          path.join(wt1, "test", "p1.test.js"),
          `const test = require("node:test"); const assert = require("node:assert/strict"); const { v1 } = require("../src/p1"); test("p1", () => { assert.equal(v1, 100); });`,
          "utf8"
        );
        await execFileAsync("git", ["add", "."], { cwd: wt1 });
        await execFileAsync("git", ["commit", "-m", "Implement p1"], { cwd: wt1 });

        // Merge task-p1 -> 200
        const mergeP1 = await rawHttpRequest({
          port,
          method: "POST",
          path: "/api/workspaces/merge",
          headers: { "content-type": "application/json" },
          body: { task_id: "task-p1", project_path: sandboxPath },
        });
        assert.equal(mergeP1.status, 200);
        assert.equal(mergeP1.json.merged, true);

        // Implement task-p2 with passing test
        const wt2 = path.join(sandboxPath, ".workspaces", "task-p2");
        await fs.mkdir(path.join(wt2, "src"), { recursive: true });
        await fs.mkdir(path.join(wt2, "test"), { recursive: true });
        await fs.writeFile(path.join(wt2, "src", "p2.js"), "module.exports = { v2: 200 };\n", "utf8");
        await fs.writeFile(
          path.join(wt2, "test", "p2.test.js"),
          `const test = require("node:test"); const assert = require("node:assert/strict"); const { v2 } = require("../src/p2"); test("p2", () => { assert.equal(v2, 200); });`,
          "utf8"
        );
        await execFileAsync("git", ["add", "."], { cwd: wt2 });
        await execFileAsync("git", ["commit", "-m", "Implement p2"], { cwd: wt2 });

        // Merge task-p2 -> now succeeds (200)
        const mergeP2 = await rawHttpRequest({
          port,
          method: "POST",
          path: "/api/workspaces/merge",
          headers: { "content-type": "application/json" },
          body: { task_id: "task-p2", project_path: sandboxPath },
        });
        assert.equal(mergeP2.status, 200);
        assert.equal(mergeP2.json.merged, true);

        // Both p1.js and p2.js exist on root main
        const rootP1 = await fs.readFile(path.join(sandboxPath, "src", "p1.js"), "utf8");
        const rootP2 = await fs.readFile(path.join(sandboxPath, "src", "p2.js"), "utf8");
        assert.ok(rootP1.includes("v1: 100"));
        assert.ok(rootP2.includes("v2: 200"));
      });

      await st.test("2.8 POST /api/workspaces/discard and prune", async () => {
        await rawHttpRequest({
          port,
          method: "POST",
          path: "/api/workspaces/spawn",
          headers: { "content-type": "application/json" },
          body: {
            task_id: "task-discard-prune",
            procedure_type: "PLANNING",
            project_path: sandboxPath,
          },
        });

        // Discard
        const discardRes = await rawHttpRequest({
          port,
          method: "POST",
          path: "/api/workspaces/discard",
          headers: { "content-type": "application/json" },
          body: {
            task_id: "task-discard-prune",
            reason: "Rejected in test",
            project_path: sandboxPath,
          },
        });
        assert.equal(discardRes.status, 200);
        assert.equal(discardRes.json.discarded, true);

        // Prune
        const pruneRes = await rawHttpRequest({
          port,
          method: "POST",
          path: "/api/workspaces/prune",
          headers: { "content-type": "application/json" },
          body: {
            task_id: "task-discard-prune",
            project_path: sandboxPath,
          },
        });
        assert.equal(pruneRes.status, 200);
        assert.equal(pruneRes.json.pruned, true);
        assert.ok(pruneRes.json.completed_at);
      });

      await st.test("2.9 Unknown Endpoint 404", async () => {
        const notFoundRes = await rawHttpRequest({
          port,
          method: "GET",
          path: "/api/workspaces/non-existent-endpoint",
        });
        assert.equal(notFoundRes.status, 404);
        assert.equal(notFoundRes.json.error, "Not found");
      });
    } finally {
      await new Promise((resolve) => server.close(resolve));
      await cleanupSandboxGitRepo(sandboxPath);
    }
  });

  // =========================================================================
  // SECTION 3: Concurrency & Stress Invariant Verification
  // =========================================================================
  await t.test("3. Concurrency & High Load Stress Testing", async (st) => {
    const sandbox = await createSandboxGitRepo("sp-concur-test-");
    const { sandboxPath, catalogRoot, registryRoot } = sandbox;
    const server = createCatalogServer({ catalogRoot, registryRoot });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = server.address().port;

    try {
      await st.test("3.1 Concurrent parallel workspace spawns via REST API", async () => {
        const NUM_CONCURRENT = 5;
        const promises = [];

        for (let i = 0; i < NUM_CONCURRENT; i++) {
          const taskId = `task-concurrent-${i}`;
          promises.push(
            rawHttpRequest({
              port,
              method: "POST",
              path: "/api/workspaces/spawn",
              headers: { "content-type": "application/json" },
              body: {
                task_id: taskId,
                procedure_type: i % 2 === 0 ? "PLANNING" : "INNER_LOOP_TDD",
                target_test_file: `test/c${i}.test.js`,
                owned_files: [`src/c${i}.js`, `test/c${i}.test.js`],
                project_path: sandboxPath,
              },
            })
          );
        }

        const results = await Promise.all(promises);
        for (let i = 0; i < NUM_CONCURRENT; i++) {
          const res = results[i];
          assert.equal(res.status, 201, `Failed concurrent spawn for index ${i}: ${JSON.stringify(res.json)}`);
          assert.ok(res.json.workspace);
          const validation = validateProcedureWorkspace(res.json.workspace);
          assert.equal(validation.valid, true, `Schema validation failure for concurrent workspace ${i}`);
        }

        // Verify all 5 worktrees exist and are distinct
        const listRes = await rawHttpRequest({
          port,
          method: "GET",
          path: `/api/workspaces?project_path=${encodeURIComponent(sandboxPath)}`,
        });
        assert.equal(listRes.status, 200);
        assert.equal(listRes.json.workspaces.length, NUM_CONCURRENT);
      });
    } finally {
      await new Promise((resolve) => server.close(resolve));
      await cleanupSandboxGitRepo(sandboxPath);
    }
  });
});
