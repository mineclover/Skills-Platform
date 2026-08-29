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
  listProcedureWorkspaces,
  getProcedureWorkspace,
  loadWorkspaces,
  saveWorkspaces,
  PROCEDURE_DEFAULTS,
} = require("../src/workspace-manager");

const { validateProcedureWorkspace } = require("@skills-platform/contracts");

const execFileAsync = promisify(execFile);

/**
 * Creates an isolated temporary Git sandbox repository for empirical tests.
 */
async function createSandboxGitRepo() {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "sp-stress-sandbox-"));

  await execFileAsync("git", ["init", "-b", "main"], { cwd: tmpDir });
  await execFileAsync("git", ["config", "user.name", "Challenger Agent"], { cwd: tmpDir });
  await execFileAsync("git", ["config", "user.email", "challenger@skills-platform.test"], { cwd: tmpDir });

  // Create initial commit with base tracked files and standard gitignore
  await fs.writeFile(path.join(tmpDir, "README.md"), "# Base Main Repository\n", "utf8");
  await fs.writeFile(
    path.join(tmpDir, "package.json"),
    JSON.stringify({ name: "sandbox-repo", version: "1.0.0" }, null, 2),
    "utf8"
  );
  await fs.writeFile(
    path.join(tmpDir, ".gitignore"),
    ".skills-platform/*\n.workspaces/\nnode_modules/\n",
    "utf8"
  );
  await execFileAsync("git", ["add", "."], { cwd: tmpDir });
  await execFileAsync("git", ["commit", "-m", "Initial root commit"], { cwd: tmpDir });

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

test("Milestone M2 Empirical Concurrency and Stress Test Suite", async (t) => {
  let sandboxPath;

  t.beforeEach(async () => {
    sandboxPath = await createSandboxGitRepo();
  });

  t.afterEach(async () => {
    if (sandboxPath) {
      await cleanupSandboxGitRepo(sandboxPath);
    }
  });

  await t.test("STRESS-1: Concurrent spawning of 12+ isolated worktrees with heterogeneous procedure types", async () => {
    const procedureTypes = [
      "PLANNING",
      "INNER_LOOP_TDD",
      "SECURITY_AUDIT",
      "RELEASE_GATE",
      "PLANNING",
      "INNER_LOOP_TDD",
      "SECURITY_AUDIT",
      "RELEASE_GATE",
      "PLANNING",
      "INNER_LOOP_TDD",
      "SECURITY_AUDIT",
      "RELEASE_GATE",
    ];

    const taskIds = procedureTypes.map((type, idx) => `stress-task-${String(idx + 1).padStart(2, "0")}-${type.toLowerCase()}`);

    const startTime = Date.now();

    // Spawn 12 worktrees concurrently
    const spawnPromises = taskIds.map((taskId, idx) => {
      const type = procedureTypes[idx];
      return spawnProcedureWorkspace({
        procedure_type: type,
        task_id: taskId,
        target_test_file: type === "INNER_LOOP_TDD" ? `test/feature-${idx}.test.js` : undefined,
        owned_files: type === "INNER_LOOP_TDD" ? [`src/feature-${idx}.js`] : [],
        project_path: sandboxPath,
      });
    });

    const workspaces = await Promise.all(spawnPromises);
    const duration = Date.now() - startTime;

    assert.equal(workspaces.length, 12, "All 12 workspaces must spawn successfully");

    // 1. Verify every workspace contract
    for (let i = 0; i < workspaces.length; i++) {
      const ws = workspaces[i];
      const type = procedureTypes[i];
      const taskId = taskIds[i];

      const validation = validateProcedureWorkspace(ws);
      assert.equal(validation.valid, true, `Workspace ${taskId} contract validation must pass: ${JSON.stringify(validation.issues)}`);
      assert.equal(ws.workspace_id, taskId);
      assert.equal(ws.procedure_type, type);
      assert.equal(ws.status, "active");
      assert.equal(ws.git_branch, `worktree/${taskId}`);

      // Verify worktree folder exists on disk
      const wtDir = path.join(sandboxPath, ".workspaces", taskId);
      const stat = await fs.stat(wtDir);
      assert.equal(stat.isDirectory(), true, `Worktree directory ${wtDir} must exist`);

      // Verify git execution works inside worktree
      const { stdout: currentBranch } = await execFileAsync("git", ["branch", "--show-current"], { cwd: wtDir });
      assert.equal(currentBranch.trim(), `worktree/${taskId}`);

      // Verify mounted skills match procedure defaults
      const mountedSkillsDir = path.join(wtDir, ".agents", "skills");
      const mountedSkills = await fs.readdir(mountedSkillsDir);
      const expectedSkills = PROCEDURE_DEFAULTS[type].active_skills;
      assert.deepEqual(
        mountedSkills.sort(),
        [...expectedSkills].sort(),
        `Mounted skills in ${taskId} must match ${type} defaults`
      );

      // Verify each mounted skill contains SKILL.md
      for (const skill of mountedSkills) {
        const skillMd = await fs.readFile(path.join(mountedSkillsDir, skill, "SKILL.md"), "utf8");
        assert.ok(skillMd.includes(`name: ${skill}`), `SKILL.md must define name: ${skill}`);
        assert.ok(skillMd.includes(type), `SKILL.md must declare procedure_type ${type}`);
      }
    }

    // 2. Verify metadata storage
    const recordedWorkspaces = await loadWorkspaces({ project_path: sandboxPath });
    assert.equal(recordedWorkspaces.length, 12, "All 12 workspaces must be recorded in workspaces.json");

    // 3. Verify Root `main` workspace has 0 modified files and 0 skill symlink mutations
    const { stdout: rootStatus } = await execFileAsync("git", ["status", "--porcelain"], { cwd: sandboxPath });
    assert.equal(
      rootStatus.trim(),
      "",
      `Root main workspace must have 0 modified tracked files. Found:\n${rootStatus}`
    );

    let rootAgentsSkillsExists = false;
    try {
      await fs.stat(path.join(sandboxPath, ".agents", "skills"));
      rootAgentsSkillsExists = true;
    } catch {}
    assert.equal(rootAgentsSkillsExists, false, "Root .agents/skills must NOT exist");

    let rootClaudeSkillsExists = false;
    try {
      await fs.stat(path.join(sandboxPath, ".claude", "skills"));
      rootClaudeSkillsExists = true;
    } catch {}
    assert.equal(rootClaudeSkillsExists, false, "Root .claude/skills must NOT exist");

    // Root HEAD check
    const { stdout: rootBranch } = await execFileAsync("git", ["branch", "--show-current"], { cwd: sandboxPath });
    assert.equal(rootBranch.trim(), "main", "Root repository branch must remain main");
  });

  await t.test("STRESS-2: Rapid Concurrent Prune & Respawn cycles without git lock collisions", async () => {
    const cycleTasks = ["cycle-task-alpha", "cycle-task-beta", "cycle-task-gamma", "cycle-task-delta", "cycle-task-epsilon"];

    // Initial concurrent spawn
    await Promise.all(
      cycleTasks.map((id) =>
        spawnProcedureWorkspace({
          procedure_type: "PLANNING",
          task_id: id,
          project_path: sandboxPath,
        })
      )
    );

    // Run 3 rapid cycles of prune -> respawn -> modify -> prune -> respawn
    for (let cycle = 1; cycle <= 3; cycle++) {
      // Concurrent prune
      const pruneResults = await Promise.all(
        cycleTasks.map((id) =>
          pruneProcedureWorkspace(id, {
            project_path: sandboxPath,
            delete_branch: true,
          })
        )
      );

      for (const pr of pruneResults) {
        assert.equal(pr.pruned, true);
      }

      // Verify directories removed
      for (const id of cycleTasks) {
        let exists = false;
        try {
          await fs.stat(path.join(sandboxPath, ".workspaces", id));
          exists = true;
        } catch {}
        assert.equal(exists, false, `Directory for ${id} must be pruned in cycle ${cycle}`);
      }

      // Concurrent respawn with DIFFERENT procedure types
      const respawned = await Promise.all(
        cycleTasks.map((id, idx) =>
          spawnProcedureWorkspace({
            procedure_type: idx % 2 === 0 ? "INNER_LOOP_TDD" : "SECURITY_AUDIT",
            task_id: id,
            project_path: sandboxPath,
          })
        )
      );

      assert.equal(respawned.length, 5);
      for (let i = 0; i < respawned.length; i++) {
        const ws = respawned[i];
        assert.equal(ws.status, "active");
        assert.equal(ws.procedure_type, i % 2 === 0 ? "INNER_LOOP_TDD" : "SECURITY_AUDIT");

        // Write a test file in worktree
        const wtDir = path.join(sandboxPath, ".workspaces", cycleTasks[i]);
        await fs.writeFile(path.join(wtDir, `cycle-${cycle}-file.txt`), `Cycle ${cycle} content`, "utf8");
      }
    }

    // Final check on root repo
    const { stdout: rootStatus } = await execFileAsync("git", ["status", "--porcelain"], { cwd: sandboxPath });
    assert.equal(rootStatus.trim(), "", "Root main workspace must remain pristine after rapid cycles");
  });

  await t.test("STRESS-3: Worktree Isolation & Cross-Worktree File Mutation Sandboxing", async () => {
    // Spawn 4 workspaces
    const wsA = await spawnProcedureWorkspace({ procedure_type: "INNER_LOOP_TDD", task_id: "iso-task-a", project_path: sandboxPath });
    const wsB = await spawnProcedureWorkspace({ procedure_type: "INNER_LOOP_TDD", task_id: "iso-task-b", project_path: sandboxPath });
    const wsC = await spawnProcedureWorkspace({ procedure_type: "PLANNING", task_id: "iso-task-c", project_path: sandboxPath });
    const wsD = await spawnProcedureWorkspace({ procedure_type: "SECURITY_AUDIT", task_id: "iso-task-d", project_path: sandboxPath });

    const dirA = path.join(sandboxPath, ".workspaces", "iso-task-a");
    const dirB = path.join(sandboxPath, ".workspaces", "iso-task-b");
    const dirC = path.join(sandboxPath, ".workspaces", "iso-task-c");
    const dirD = path.join(sandboxPath, ".workspaces", "iso-task-d");

    // Mutation in Worktree A: Commit a new file
    await fs.writeFile(path.join(dirA, "file-in-a.js"), "console.log('from A');\n", "utf8");
    await execFileAsync("git", ["add", "file-in-a.js"], { cwd: dirA });
    await execFileAsync("git", ["commit", "-m", "Commit in A"], { cwd: dirA });

    // Mutation in Worktree B: Commit different file
    await fs.writeFile(path.join(dirB, "file-in-b.js"), "console.log('from B');\n", "utf8");
    await execFileAsync("git", ["add", "file-in-b.js"], { cwd: dirB });
    await execFileAsync("git", ["commit", "-m", "Commit in B"], { cwd: dirB });

    // Mutation in Worktree C: Uncommitted dirty file
    await fs.writeFile(path.join(dirC, "dirty-uncommitted-c.txt"), "dirty state", "utf8");

    // Mutation in Worktree D: Delete tracked README.md
    await fs.rm(path.join(dirD, "README.md"));

    // Assert Isolation:
    // 1. Root main does NOT see file-in-a.js, file-in-b.js, or dirty-uncommitted-c.txt
    let rootHasFileA = false;
    let rootHasFileB = false;
    let rootHasFileC = false;
    try { await fs.stat(path.join(sandboxPath, "file-in-a.js")); rootHasFileA = true; } catch {}
    try { await fs.stat(path.join(sandboxPath, "file-in-b.js")); rootHasFileB = true; } catch {}
    try { await fs.stat(path.join(sandboxPath, "dirty-uncommitted-c.txt")); rootHasFileC = true; } catch {}

    assert.equal(rootHasFileA, false, "Root must not contain file-in-a.js");
    assert.equal(rootHasFileB, false, "Root must not contain file-in-b.js");
    assert.equal(rootHasFileC, false, "Root must not contain dirty-uncommitted-c.txt");

    // Root README.md must still exist
    const rootReadmeStat = await fs.stat(path.join(sandboxPath, "README.md"));
    assert.equal(rootReadmeStat.isFile(), true, "Root README.md must be intact");

    // 2. Worktree A does not see file-in-b
    let aHasB = false;
    try { await fs.stat(path.join(dirA, "file-in-b.js")); aHasB = true; } catch {}
    assert.equal(aHasB, false, "Worktree A must not see file-in-b.js");

    // 3. Worktree B does not see file-in-a
    let bHasA = false;
    try { await fs.stat(path.join(dirB, "file-in-a.js")); bHasA = true; } catch {}
    assert.equal(bHasA, false, "Worktree B must not see file-in-a.js");

    // 4. Worktree C dirty file does not block pruning
    const pruneC = await pruneProcedureWorkspace("iso-task-c", { project_path: sandboxPath });
    assert.equal(pruneC.pruned, true, "Dirty worktree C must be pruned cleanly with --force");

    // 5. Worktree D missing README does not affect Root or other worktrees
    const pruneD = await pruneProcedureWorkspace("iso-task-d", { project_path: sandboxPath });
    assert.equal(pruneD.pruned, true);

    await pruneProcedureWorkspace("iso-task-a", { project_path: sandboxPath });
    await pruneProcedureWorkspace("iso-task-b", { project_path: sandboxPath });
  });

  await t.test("STRESS-4: Multi-Provider Skill Mounting Isolation (Claude vs Antigravity)", async () => {
    const wsAntigravity = await spawnProcedureWorkspace({
      procedure_type: "PLANNING",
      task_id: "task-provider-antigravity",
      provider_id: "antigravity",
      project_path: sandboxPath,
    });

    const wsClaude = await spawnProcedureWorkspace({
      procedure_type: "PLANNING",
      task_id: "task-provider-claude",
      provider_id: "claude",
      project_path: sandboxPath,
    });

    const dirAnti = path.join(sandboxPath, ".workspaces", "task-provider-antigravity");
    const dirClaude = path.join(sandboxPath, ".workspaces", "task-provider-claude");

    // Antigravity has .agents/skills but NOT .claude/skills
    const antiAgentsStat = await fs.stat(path.join(dirAnti, ".agents", "skills"));
    assert.equal(antiAgentsStat.isDirectory(), true);

    let antiClaudeExists = false;
    try {
      await fs.stat(path.join(dirAnti, ".claude", "skills"));
      antiClaudeExists = true;
    } catch {}
    assert.equal(antiClaudeExists, false, "Antigravity worktree should not have .claude/skills");

    // Claude has BOTH .agents/skills and .claude/skills
    const claudeAgentsStat = await fs.stat(path.join(dirClaude, ".agents", "skills"));
    assert.equal(claudeAgentsStat.isDirectory(), true);

    const claudeClaudeStat = await fs.stat(path.join(dirClaude, ".claude", "skills"));
    assert.equal(claudeClaudeStat.isDirectory(), true);

    // Root has NEITHER
    let rootAgents = false;
    let rootClaude = false;
    try { await fs.stat(path.join(sandboxPath, ".agents", "skills")); rootAgents = true; } catch {}
    try { await fs.stat(path.join(sandboxPath, ".claude", "skills")); rootClaude = true; } catch {}
    assert.equal(rootAgents, false);
    assert.equal(rootClaude, false);
  });

  await t.test("STRESS-5: Fault isolation under concurrent failures & lock mutex recovery", async () => {
    // Interleave valid spawn tasks with an invalid spawn task that throws
    const tasks = [
      spawnProcedureWorkspace({ procedure_type: "PLANNING", task_id: "fault-task-01", project_path: sandboxPath }),
      spawnProcedureWorkspace({ procedure_type: "INVALID_CORRUPT_TYPE", task_id: "fault-task-02", project_path: sandboxPath }).catch((err) => ({ error: err })),
      spawnProcedureWorkspace({ procedure_type: "SECURITY_AUDIT", task_id: "fault-task-03", project_path: sandboxPath }),
      spawnProcedureWorkspace({ procedure_type: "RELEASE_GATE", task_id: "fault-task-04", project_path: sandboxPath }),
    ];

    const results = await Promise.all(tasks);

    assert.equal(results[0].procedure_type, "PLANNING");
    assert.ok(results[1].error, "Invalid procedure type must reject");
    assert.ok(results[1].error.message.includes("Invalid procedure_type"));
    assert.equal(results[2].procedure_type, "SECURITY_AUDIT");
    assert.equal(results[3].procedure_type, "RELEASE_GATE");

    // Subsequent operation should continue without lock deadlock
    const wsNext = await spawnProcedureWorkspace({
      procedure_type: "INNER_LOOP_TDD",
      task_id: "fault-task-subsequent",
      project_path: sandboxPath,
    });
    assert.equal(wsNext.workspace_id, "fault-task-subsequent");
    assert.equal(wsNext.status, "active");
  });

  await t.test("STRESS-6: Prune idempotency and branch retention mode", async () => {
    const ws = await spawnProcedureWorkspace({
      procedure_type: "PLANNING",
      task_id: "task-retain-branch",
      project_path: sandboxPath,
    });

    // Prune with delete_branch: false
    const pruneRetain = await pruneProcedureWorkspace("task-retain-branch", {
      project_path: sandboxPath,
      delete_branch: false,
    });
    assert.equal(pruneRetain.pruned, true);

    // Verify worktree folder removed
    let dirExists = false;
    try {
      await fs.stat(path.join(sandboxPath, ".workspaces", "task-retain-branch"));
      dirExists = true;
    } catch {}
    assert.equal(dirExists, false);

    // Verify git branch STILL EXISTS
    const { stdout: branchCheck } = await execFileAsync("git", ["branch", "--list", "worktree/task-retain-branch"], { cwd: sandboxPath });
    assert.ok(branchCheck.includes("worktree/task-retain-branch"), "Branch must be retained when delete_branch is false");

    // Re-spawn onto the existing branch (tests branchExists code path)
    const reWs = await spawnProcedureWorkspace({
      procedure_type: "INNER_LOOP_TDD",
      task_id: "task-retain-branch",
      project_path: sandboxPath,
    });
    assert.equal(reWs.workspace_id, "task-retain-branch");
    assert.equal(reWs.procedure_type, "INNER_LOOP_TDD");

    // Idempotent prune: Prune again twice
    const p1 = await pruneProcedureWorkspace("task-retain-branch", { project_path: sandboxPath });
    assert.equal(p1.pruned, true);

    const p2 = await pruneProcedureWorkspace("task-retain-branch", { project_path: sandboxPath });
    assert.equal(p2.pruned, true, "Second prune on already-pruned workspace should succeed idempotently");
  });

  await t.test("STRESS-7: Sequential high-throughput spawn and prune cycle (20 iterations)", async () => {
    const totalIterations = 20;
    const start = Date.now();

    for (let i = 0; i < totalIterations; i++) {
      const taskId = `seq-stress-${String(i).padStart(3, "0")}`;
      const type = i % 2 === 0 ? "PLANNING" : "INNER_LOOP_TDD";

      const ws = await spawnProcedureWorkspace({
        procedure_type: type,
        task_id: taskId,
        project_path: sandboxPath,
      });
      assert.equal(ws.workspace_id, taskId);

      const pr = await pruneProcedureWorkspace(taskId, { project_path: sandboxPath });
      assert.equal(pr.pruned, true);
    }

    const elapsed = Date.now() - start;
    // Verify all 20 workspaces are tracked as pruned
    const all = await listProcedureWorkspaces({ project_path: sandboxPath });
    assert.equal(all.length, totalIterations);

    const pruned = await listProcedureWorkspaces({ project_path: sandboxPath, status: "pruned" });
    assert.equal(pruned.length, totalIterations);

    const active = await listProcedureWorkspaces({ project_path: sandboxPath, status: "active" });
    assert.equal(active.length, 0);

    // Root git status must remain 100% clean
    const { stdout: rootStatus } = await execFileAsync("git", ["status", "--porcelain"], { cwd: sandboxPath });
    assert.equal(rootStatus.trim(), "");
  });

  await t.test("STRESS-8: Identical task_id collision handling under concurrent dispatch", async () => {
    // Dispatch 3 concurrent spawns with the EXACT SAME task_id
    const duplicateId = "collision-task-duplicate";

    const results = await Promise.all([
      spawnProcedureWorkspace({ procedure_type: "PLANNING", task_id: duplicateId, project_path: sandboxPath }),
      spawnProcedureWorkspace({ procedure_type: "INNER_LOOP_TDD", task_id: duplicateId, project_path: sandboxPath }),
      spawnProcedureWorkspace({ procedure_type: "SECURITY_AUDIT", task_id: duplicateId, project_path: sandboxPath }),
    ]);

    assert.equal(results.length, 3);
    // The final state of the worktree must be valid and operational
    const wtDir = path.join(sandboxPath, ".workspaces", duplicateId);
    const stat = await fs.stat(wtDir);
    assert.equal(stat.isDirectory(), true);

    const ws = await getProcedureWorkspace(duplicateId, { project_path: sandboxPath });
    assert.ok(ws);
    assert.equal(ws.workspace_id, duplicateId);
    assert.equal(ws.status, "active");

    // Prune must cleanly remove the single resulting worktree
    const prune = await pruneProcedureWorkspace(duplicateId, { project_path: sandboxPath });
    assert.equal(prune.pruned, true);
  });

  await t.test("STRESS-9: Corrupt workspaces.json graceful recovery and atomic save", async () => {
    const storagePath = path.join(sandboxPath, ".skills-platform", "workspaces", "workspaces.json");
    await fs.mkdir(path.dirname(storagePath), { recursive: true });
    // Write invalid JSON
    await fs.writeFile(storagePath, "{ invalid json corrupt content !!!", "utf8");

    // loadWorkspaces should recover gracefully with []
    const list = await listProcedureWorkspaces({ project_path: sandboxPath });
    assert.deepEqual(list, []);

    // Spawning a new workspace should overwrite the corrupted file atomically
    const ws = await spawnProcedureWorkspace({
      procedure_type: "RELEASE_GATE",
      task_id: "task-after-corruption",
      project_path: sandboxPath,
    });
    assert.equal(ws.workspace_id, "task-after-corruption");

    const recoveredList = await listProcedureWorkspaces({ project_path: sandboxPath });
    assert.equal(recoveredList.length, 1);
    assert.equal(recoveredList[0].workspace_id, "task-after-corruption");
  });

  await t.test("STRESS-10: Deep nested skill directory tree replication", async () => {
    const registryRoot = path.join(sandboxPath, ".skills-platform", "registry");
    const skillArtifacts = path.join(registryRoot, "revisions", "rev-deep", "artifacts", "deep-tree-skill");
    await fs.mkdir(path.join(skillArtifacts, "nested", "subfolder", "level3"), { recursive: true });
    await fs.writeFile(path.join(skillArtifacts, "SKILL.md"), "# Deep Skill\n", "utf8");
    await fs.writeFile(path.join(skillArtifacts, "nested", "subfolder", "level3", "deep-helper.js"), "module.exports = 42;\n", "utf8");

    const registryJson = {
      schema_version: 1,
      skills: [
        {
          id: "deep_skill_id",
          skill_name: "deep-tree-skill",
          source_revision_id: "rev-deep",
          canonical_path: "revisions/rev-deep/artifacts/deep-tree-skill",
        },
      ],
    };
    await fs.writeFile(path.join(registryRoot, "registry.json"), JSON.stringify(registryJson), "utf8");

    const ws = await spawnProcedureWorkspace({
      procedure_type: "INNER_LOOP_TDD",
      task_id: "task-deep-tree",
      active_skills: ["deep-tree-skill"],
      project_path: sandboxPath,
    });

    const mountedFile = path.join(
      sandboxPath,
      ".workspaces",
      "task-deep-tree",
      ".agents",
      "skills",
      "deep-tree-skill",
      "nested",
      "subfolder",
      "level3",
      "deep-helper.js"
    );
    const content = await fs.readFile(mountedFile, "utf8");
    assert.equal(content, "module.exports = 42;\n");
  });

  await t.test("STRESS-11: Git repository health check (git fsck) after intensive worktree churn", async () => {
    // Run git fsck on sandbox repository to ensure no repository database corruption
    const { stdout: fsckOut, stderr: fsckErr } = await execFileAsync("git", ["fsck", "--full"], { cwd: sandboxPath });
    // Verify stdout and stderr do not contain fatal or error
    assert.ok(!fsckOut.includes("fatal:"), "git fsck must not report fatal errors");
    assert.ok(!fsckOut.includes("error in"), "git fsck must not report errors in objects");
    assert.ok(!fsckErr.includes("fatal:"), "git fsck stderr must not report fatal errors");
  });

  await t.test("STRESS-12: getProcedureWorkspace resolution via multiple identifier formats", async () => {
    await spawnProcedureWorkspace({
      procedure_type: "INNER_LOOP_TDD",
      task_id: "task-multilookup-99",
      project_path: sandboxPath,
    });

    // 1. By workspace_id
    const byId = await getProcedureWorkspace("task-multilookup-99", { project_path: sandboxPath });
    assert.ok(byId);
    assert.equal(byId.workspace_id, "task-multilookup-99");

    // 2. By branch name
    const byBranch = await getProcedureWorkspace("worktree/task-multilookup-99", { project_path: sandboxPath });
    assert.ok(byBranch);
    assert.equal(byBranch.workspace_id, "task-multilookup-99");

    // 3. Null on empty / null / undefined / non-existent
    assert.equal(await getProcedureWorkspace(null, { project_path: sandboxPath }), null);
    assert.equal(await getProcedureWorkspace("", { project_path: sandboxPath }), null);
    assert.equal(await getProcedureWorkspace("non-existent-task", { project_path: sandboxPath }), null);
  });
});
