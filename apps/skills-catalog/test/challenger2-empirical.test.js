"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { execFile } = require("node:child_process");
const fs = require("node:fs/promises");
const fsSync = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { promisify } = require("node:util");

const {
  spawnProcedureWorkspace,
  pruneProcedureWorkspace,
  listProcedureWorkspaces,
  getProcedureWorkspace,
  loadWorkspaces,
  saveWorkspaces,
  PROCEDURE_DEFAULTS,
} = require("../src/workspace-manager");

const { validateProcedureWorkspace } = require("@skills-platform/contracts");

const execFileAsync = promisify(execFile);

/**
 * Normalizes string line endings to LF.
 */
function normalizeLineEndings(str) {
  return typeof str === "string" ? str.replace(/\r\n/g, "\n") : str;
}

/**
 * Creates an isolated temporary Git sandbox repository.
 */
async function createSandboxRepo() {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "sp-adv-sandbox-"));
  await execFileAsync("git", ["init", "-b", "main"], { cwd: tmpDir });
  await execFileAsync("git", ["config", "user.name", "Challenger Agent"], { cwd: tmpDir });
  await execFileAsync("git", ["config", "user.email", "challenger@skills-platform.test"], { cwd: tmpDir });
  
  await fs.writeFile(path.join(tmpDir, "README.md"), "# Root Baseline\n", "utf8");
  await execFileAsync("git", ["add", "."], { cwd: tmpDir });
  await execFileAsync("git", ["commit", "-m", "Root initial commit"], { cwd: tmpDir });
  return tmpDir;
}

/**
 * Cleans up sandbox repository.
 */
async function cleanupSandboxRepo(tmpDir) {
  try {
    await execFileAsync("git", ["worktree", "prune"], { cwd: tmpDir }).catch(() => {});
    await fs.rm(tmpDir, { recursive: true, force: true });
  } catch {}
}

test("Empirical Challenger 2: Adversarial Stress & Failure Recovery Suite", async (t) => {
  let sandbox;

  t.beforeEach(async () => {
    sandbox = await createSandboxRepo();
  });

  t.afterEach(async () => {
    if (sandbox) {
      await cleanupSandboxRepo(sandbox);
    }
  });

  // =========================================================================
  // SCENARIO 1: Non-Existent Branches and Bad Refs
  // =========================================================================
  await t.test("Scenario 1: Non-existent base_ref failure isolation and clean rollback", async () => {
    const invalidRef = "refs/heads/non_existent_branch_99999";

    // Expect spawn to fail
    await assert.rejects(
      async () => {
        await spawnProcedureWorkspace({
          procedure_type: "PLANNING",
          task_id: "task-fail-ref",
          base_ref: invalidRef,
          project_path: sandbox,
        });
      },
      (err) => {
        assert.ok(err.message.includes("Git execution failed") || err.message.includes("fatal:"));
        return true;
      }
    );

    // Verify metadata was NOT saved in workspaces.json
    const stored = await loadWorkspaces({ project_path: sandbox });
    const match = stored.find((w) => w.workspace_id === "task-fail-ref");
    assert.equal(match, undefined, "Failed workspace must not be recorded in workspaces.json");

    // Verify git worktree list does NOT contain the failed worktree
    const { stdout: wtList } = await execFileAsync("git", ["worktree", "list"], { cwd: sandbox });
    assert.ok(!wtList.includes("task-fail-ref"), "Failed worktree must not exist in git worktree list");

    // Verify no partial files exist in .workspaces/task-fail-ref
    const wtDir = path.join(sandbox, ".workspaces", "task-fail-ref");
    let exists = false;
    try {
      await fs.stat(wtDir);
      exists = true;
    } catch {}
    assert.equal(exists, false, "Partial worktree directory should not remain on disk");

    // Verify that a subsequent valid spawn works without lingering state issues
    const validWs = await spawnProcedureWorkspace({
      procedure_type: "PLANNING",
      task_id: "task-fail-ref", // Re-using same task_id
      base_ref: "main",
      project_path: sandbox,
    });
    assert.equal(validWs.workspace_id, "task-fail-ref");
    assert.equal(validWs.status, "active");
  });

  // =========================================================================
  // SCENARIO 2: Invalid Procedure Types & Type Fuzzing
  // =========================================================================
  await t.test("Scenario 2: Invalid procedure types and malformed inputs fuzzing", async () => {
    const invalidTypes = [
      "INVALID_TYPE",
      "hacker_root",
      "random_string_123",
      "DEPLOYMENT",
      "BUILD_AND_TEST",
    ];

    for (const badType of invalidTypes) {
      await assert.rejects(
        async () => {
          await spawnProcedureWorkspace({
            procedure_type: badType,
            task_id: `task-bad-type-${Math.random().toString(36).slice(2, 7)}`,
            project_path: sandbox,
          });
        },
        /Invalid procedure_type/
      );
    }

    // Verify non-string types throw
    await assert.rejects(
      async () => {
        await spawnProcedureWorkspace({
          procedure_type: 12345,
          task_id: "task-num-type",
          project_path: sandbox,
        });
      }
    );

    // Verify omitted / null defaults to INNER_LOOP_TDD
    const wsDefault = await spawnProcedureWorkspace({
      task_id: "task-default-proc",
      project_path: sandbox,
    });
    assert.equal(wsDefault.procedure_type, "INNER_LOOP_TDD");
    assert.equal(wsDefault.status, "active");
  });

  // =========================================================================
  // SCENARIO 3: Dirty Pre-Existing Worktrees & Dirty Root Isolation
  // =========================================================================
  await t.test("Scenario 3: Dirty pre-existing worktrees and root isolation", async () => {
    // 1. Spawn initial workspace
    const ws1 = await spawnProcedureWorkspace({
      procedure_type: "INNER_LOOP_TDD",
      task_id: "task-dirty-recovery",
      project_path: sandbox,
    });
    assert.equal(ws1.workspace_id, "task-dirty-recovery");

    const wtPath = path.join(sandbox, ".workspaces", "task-dirty-recovery");

    // 2. Pollute the worktree with dirty uncommitted files and modified files
    await fs.writeFile(path.join(wtPath, "uncommitted.js"), "console.log('dirty uncommitted code');", "utf8");
    await fs.writeFile(path.join(wtPath, "README.md"), "# Modified in worktree\n", "utf8");
    await execFileAsync("git", ["add", "uncommitted.js"], { cwd: wtPath });

    // 3. Pollute root main workspace with uncommitted changes
    const rootDirtyFile = path.join(sandbox, "root-dirty.txt");
    await fs.writeFile(rootDirtyFile, "dirty root changes", "utf8");
    await fs.writeFile(path.join(sandbox, "README.md"), "# Dirty root readme\n", "utf8");

    // 4. Re-spawn the same workspace task_id without prior clean prune
    const ws2 = await spawnProcedureWorkspace({
      procedure_type: "PLANNING",
      task_id: "task-dirty-recovery",
      project_path: sandbox,
    });
    assert.equal(ws2.procedure_type, "PLANNING");
    assert.equal(ws2.status, "active");

    // 5. Verify the re-spawned worktree is clean from baseRef ('main')
    const reReadme = await fs.readFile(path.join(wtPath, "README.md"), "utf8");
    assert.equal(normalizeLineEndings(reReadme), "# Root Baseline\n", "Worktree should reset to clean base commit");

    let uncommittedExists = false;
    try {
      await fs.stat(path.join(wtPath, "uncommitted.js"));
      uncommittedExists = true;
    } catch {}
    assert.equal(uncommittedExists, false, "Dirty uncommitted file should be eradicated");

    // 6. Verify ROOT main was NOT affected or wiped
    const rootDirtyContent = await fs.readFile(rootDirtyFile, "utf8");
    assert.equal(normalizeLineEndings(rootDirtyContent), "dirty root changes", "Root uncommitted file must stay untouched");
    const rootReadme = await fs.readFile(path.join(sandbox, "README.md"), "utf8");
    assert.equal(normalizeLineEndings(rootReadme), "# Dirty root readme\n", "Root README must remain untouched");

    // 7. Verify Root has no .agents/skills
    let rootSkillsExists = false;
    try {
      await fs.stat(path.join(sandbox, ".agents", "skills"));
      rootSkillsExists = true;
    } catch {}
    assert.equal(rootSkillsExists, false, "Root must never receive mounted skills");
  });

  // =========================================================================
  // SCENARIO 4: Worktree Index and Branch Divergence Isolation
  // =========================================================================
  await t.test("Scenario 4: Worktree Git index and branch independence", async () => {
    // Spawn two concurrent workspaces
    const wsA = await spawnProcedureWorkspace({
      procedure_type: "INNER_LOOP_TDD",
      task_id: "task-iso-a",
      project_path: sandbox,
    });
    const wsB = await spawnProcedureWorkspace({
      procedure_type: "INNER_LOOP_TDD",
      task_id: "task-iso-b",
      project_path: sandbox,
    });

    const pathA = path.join(sandbox, ".workspaces", "task-iso-a");
    const pathB = path.join(sandbox, ".workspaces", "task-iso-b");

    // Commit file in workspace A
    await fs.writeFile(path.join(pathA, "featureA.js"), "module.exports = 'A';", "utf8");
    await execFileAsync("git", ["add", "featureA.js"], { cwd: pathA });
    await execFileAsync("git", ["commit", "-m", "Add feature A"], { cwd: pathA });

    // Commit file in workspace B
    await fs.writeFile(path.join(pathB, "featureB.js"), "module.exports = 'B';", "utf8");
    await execFileAsync("git", ["add", "featureB.js"], { cwd: pathB });
    await execFileAsync("git", ["commit", "-m", "Add feature B"], { cwd: pathB });

    // Check workspace B does NOT have featureA.js
    let bHasA = false;
    try {
      await fs.stat(path.join(pathB, "featureA.js"));
      bHasA = true;
    } catch {}
    assert.equal(bHasA, false, "Workspace B must not contain Workspace A commits");

    // Check workspace A does NOT have featureB.js
    let aHasB = false;
    try {
      await fs.stat(path.join(pathA, "featureB.js"));
      aHasB = true;
    } catch {}
    assert.equal(aHasB, false, "Workspace A must not contain Workspace B commits");

    // Check root main repo does NOT have featureA.js or featureB.js
    let rootHasA = false;
    let rootHasB = false;
    try {
      await fs.stat(path.join(sandbox, "featureA.js"));
      rootHasA = true;
    } catch {}
    try {
      await fs.stat(path.join(sandbox, "featureB.js"));
      rootHasB = true;
    } catch {}
    assert.equal(rootHasA, false, "Root must not contain featureA.js");
    assert.equal(rootHasB, false, "Root must not contain featureB.js");
  });

  // =========================================================================
  // SCENARIO 5: Corrupt workspaces.json and Recovery Handling
  // =========================================================================
  await t.test("Scenario 5: Corrupt workspaces.json gracefully handles errors and self-heals", async () => {
    const storagePath = path.join(sandbox, ".skills-platform", "workspaces", "workspaces.json");
    await fs.mkdir(path.dirname(storagePath), { recursive: true });

    // Case 5A: Malformed JSON syntax
    await fs.writeFile(storagePath, "{ invalid json corrupt content !!! @@#$%", "utf8");

    const loaded1 = await loadWorkspaces({ project_path: sandbox });
    assert.deepEqual(loaded1, [], "Corrupted JSON should safely fallback to empty array");

    // Spawning a new workspace heals workspaces.json
    const ws1 = await spawnProcedureWorkspace({
      procedure_type: "PLANNING",
      task_id: "task-heal-01",
      project_path: sandbox,
    });
    assert.equal(ws1.workspace_id, "task-heal-01");

    // Verify workspaces.json is now valid JSON
    const rawSaved = await fs.readFile(storagePath, "utf8");
    const parsed = JSON.parse(rawSaved);
    assert.equal(parsed.schema_version, 1);
    assert.equal(parsed.workspaces.length, 1);
    assert.equal(parsed.workspaces[0].workspace_id, "task-heal-01");

    // Case 5B: JSON is valid but not expected schema (e.g. a string or number)
    await fs.writeFile(storagePath, JSON.stringify("unexpected string primitive"), "utf8");
    const loaded2 = await loadWorkspaces({ project_path: sandbox });
    assert.deepEqual(loaded2, [], "Non-array/non-object JSON should fallback to empty array");

    // Case 5C: JSON is an object without workspaces array
    await fs.writeFile(storagePath, JSON.stringify({ random_key: 1234 }), "utf8");
    const loaded3 = await loadWorkspaces({ project_path: sandbox });
    assert.deepEqual(loaded3, []);
  });

  // =========================================================================
  // SCENARIO 6: Concurrency Hammering & Metadata Atomicity
  // =========================================================================
  await t.test("Scenario 6: High-concurrency spawn, prune, and list hammering", async () => {
    const totalOps = 16;
    const taskIds = Array.from({ length: totalOps }, (_, i) => `task-hammer-${String(i).padStart(2, "0")}`);

    // Fire 16 concurrent spawn operations simultaneously
    const spawnResults = await Promise.all(
      taskIds.map((taskId, i) =>
        spawnProcedureWorkspace({
          procedure_type: i % 4 === 0 ? "PLANNING" : i % 4 === 1 ? "INNER_LOOP_TDD" : i % 4 === 2 ? "SECURITY_AUDIT" : "RELEASE_GATE",
          task_id: taskId,
          project_path: sandbox,
        })
      )
    );

    assert.equal(spawnResults.length, totalOps);
    for (const ws of spawnResults) {
      assert.equal(ws.status, "active");
      const validation = validateProcedureWorkspace(ws);
      assert.equal(validation.valid, true);
    }

    // Verify all 16 recorded properly in workspaces.json
    const allWorkspaces = await loadWorkspaces({ project_path: sandbox });
    assert.equal(allWorkspaces.length, totalOps, `Expected ${totalOps} workspaces, got ${allWorkspaces.length}`);

    // Interleave concurrent pruning on half of them while listing
    const pruneTargets = taskIds.slice(0, 8);
    const [pruneResults, listResult] = await Promise.all([
      Promise.all(pruneTargets.map((id) => pruneProcedureWorkspace(id, { project_path: sandbox }))),
      listProcedureWorkspaces({ project_path: sandbox }),
    ]);

    assert.equal(pruneResults.length, 8);
    for (const res of pruneResults) {
      assert.equal(res.pruned, true);
    }

    const finalActive = await listProcedureWorkspaces({ project_path: sandbox, status: "active" });
    const finalPruned = await listProcedureWorkspaces({ project_path: sandbox, status: "pruned" });

    assert.equal(finalActive.length, 8);
    assert.equal(finalPruned.length, 8);
  });

  // =========================================================================
  // SCENARIO 7: Prune Idempotency and Robustness
  // =========================================================================
  await t.test("Scenario 7: Prune idempotency on missing, already pruned, or non-string IDs", async () => {
    // 1. Spawning and pruning
    await spawnProcedureWorkspace({
      procedure_type: "PLANNING",
      task_id: "task-idem",
      project_path: sandbox,
    });

    const firstPrune = await pruneProcedureWorkspace("task-idem", { project_path: sandbox });
    assert.equal(firstPrune.pruned, true);

    // 2. Second prune call on already pruned workspace should not crash
    const secondPrune = await pruneProcedureWorkspace("task-idem", { project_path: sandbox });
    assert.equal(secondPrune.pruned, true);

    // 3. Prune on a non-existent ID should succeed without error
    const nonExistentPrune = await pruneProcedureWorkspace("task-never-existed", { project_path: sandbox });
    assert.equal(nonExistentPrune.pruned, true);

    // 4. Prune with missing workspace_id throws descriptive error
    await assert.rejects(
      async () => {
        await pruneProcedureWorkspace(null, { project_path: sandbox });
      },
      /workspace_id is required/
    );

    await assert.rejects(
      async () => {
        await pruneProcedureWorkspace({}, { project_path: sandbox });
      },
      /workspace_id is required/
    );
  });

  // =========================================================================
  // SCENARIO 8: Locked File Cleanup Resilience (Transient OS Locks)
  // =========================================================================
  await t.test("Scenario 8: Locked file transient recovery during spawn and prune", async () => {
    // Spawn workspace
    const ws = await spawnProcedureWorkspace({
      procedure_type: "INNER_LOOP_TDD",
      task_id: "task-lock-test",
      project_path: sandbox,
    });

    const targetFile = path.join(sandbox, ".workspaces", "task-lock-test", "locked-file.txt");
    await fs.writeFile(targetFile, "locked content", "utf8");

    // Open file handle with exclusive lock
    let fd;
    try {
      fd = fsSync.openSync(targetFile, "r");
    } catch {}

    // Unlock after 120ms (simulating transient lock release by IDE/scanner)
    setTimeout(() => {
      if (fd !== undefined) {
        try {
          fsSync.closeSync(fd);
        } catch {}
      }
    }, 120);

    // Pruning should succeed because retryAsync or graceful fs.rm handles transient locks
    const pruneRes = await pruneProcedureWorkspace("task-lock-test", { project_path: sandbox });
    assert.equal(pruneRes.pruned, true);
  });

  // =========================================================================
  // SCENARIO 9: Provider Isolation & Custom Registry Mounting
  // =========================================================================
  await t.test("Scenario 9: Provider ID claude mounts .claude/skills in worktree", async () => {
    const ws = await spawnProcedureWorkspace({
      procedure_type: "SECURITY_AUDIT",
      task_id: "task-claude-provider",
      provider_id: "claude",
      project_path: sandbox,
    });

    const wtDir = path.join(sandbox, ".workspaces", "task-claude-provider");
    const agentsSkillsDir = path.join(wtDir, ".agents", "skills");
    const claudeSkillsDir = path.join(wtDir, ".claude", "skills");

    const agentsList = await fs.readdir(agentsSkillsDir);
    const claudeList = await fs.readdir(claudeSkillsDir);

    assert.deepEqual(agentsList.sort(), claudeList.sort());
    assert.ok(claudeList.includes("destructive-command-blocker"));
    assert.ok(claudeList.includes("secret-leak-guard"));
  });
});
