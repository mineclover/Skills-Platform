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
  PROCEDURE_DEFAULTS,
} = require("../src/workspace-manager");

const { validateProcedureWorkspace } = require("@skills-platform/contracts");

const execFileAsync = promisify(execFile);

/**
 * Creates an isolated temporary Git sandbox repository for tests.
 */
async function createSandboxGitRepo() {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "sp-wt-sandbox-"));
  
  await execFileAsync("git", ["init", "-b", "main"], { cwd: tmpDir });
  await execFileAsync("git", ["config", "user.name", "Test Agent"], { cwd: tmpDir });
  await execFileAsync("git", ["config", "user.email", "agent@skills-platform.test"], { cwd: tmpDir });
  
  // Initial commit so HEAD exists
  await fs.writeFile(path.join(tmpDir, "README.md"), "# Skills Platform Sandbox Repo\n", "utf8");
  await execFileAsync("git", ["add", "."], { cwd: tmpDir });
  await execFileAsync("git", ["commit", "-m", "Initial commit"], { cwd: tmpDir });
  
  return tmpDir;
}

/**
 * Cleans up a temporary sandbox Git repository.
 */
async function cleanupSandboxGitRepo(tmpDir) {
  try {
    // Prune any dangling worktrees before removing
    await execFileAsync("git", ["worktree", "prune"], { cwd: tmpDir }).catch(() => {});
    await fs.rm(tmpDir, { recursive: true, force: true });
  } catch {}
}

test("Git-Native Isolated Worktree Manager", async (t) => {
  let sandboxPath;

  t.beforeEach(async () => {
    sandboxPath = await createSandboxGitRepo();
  });

  t.afterEach(async () => {
    if (sandboxPath) {
      await cleanupSandboxGitRepo(sandboxPath);
    }
  });

  await t.test("Spawns PLANNING procedure workspace with isolated worktree and active planning skills", async () => {
    const ws = await spawnProcedureWorkspace({
      procedure_type: "PLANNING",
      task_id: "task-01-plan",
      project_path: sandboxPath,
    });

    // Contract validation
    const validation = validateProcedureWorkspace(ws);
    assert.equal(validation.valid, true, `Validation issues: ${JSON.stringify(validation.issues)}`);
    assert.equal(ws.procedure_type, "PLANNING");
    assert.equal(ws.workspace_id, "task-01-plan");
    assert.equal(ws.git_branch, "worktree/task-01-plan");
    assert.equal(ws.status, "active");
    assert.deepEqual(ws.active_skills, ["task-decomposer", "horizontal-topic-scanner"]);
    assert.deepEqual(ws.active_guards, ["subagent-recursion-limiter", "context-budget-guard"]);

    // Verify worktree folder exists on disk
    const worktreeAbsPath = path.join(sandboxPath, ".workspaces", "task-01-plan");
    const stat = await fs.stat(worktreeAbsPath);
    assert.equal(stat.isDirectory(), true);

    // Verify isolated .agents/skills/ contains ONLY planning skills
    const mountedSkillsDir = path.join(worktreeAbsPath, ".agents", "skills");
    const mountedSkills = await fs.readdir(mountedSkillsDir);
    assert.deepEqual(mountedSkills.sort(), ["horizontal-topic-scanner", "task-decomposer"]);

    // Verify SKILL.md descriptor in each mounted skill
    for (const skill of mountedSkills) {
      const skillMd = await fs.readFile(path.join(mountedSkillsDir, skill, "SKILL.md"), "utf8");
      assert.ok(skillMd.includes(`name: ${skill}`));
      assert.ok(skillMd.includes("PLANNING"));
    }

    // Verify root main workspace is completely untouched (no .agents/skills in root)
    let rootSkillsExists = false;
    try {
      await fs.stat(path.join(sandboxPath, ".agents", "skills"));
      rootSkillsExists = true;
    } catch {}
    assert.equal(rootSkillsExists, false, "Root workspace .agents/skills must NOT be created or mutated");

    // Verify git branch exists
    const { stdout: branchList } = await execFileAsync("git", ["branch", "--list", "worktree/task-01-plan"], { cwd: sandboxPath });
    assert.ok(branchList.includes("worktree/task-01-plan"));
  });

  await t.test("Spawns INNER_LOOP_TDD procedure workspace with scoped invariants, target test, and TDD skills", async () => {
    const ws = await spawnProcedureWorkspace({
      procedure_type: "INNER_LOOP_TDD",
      task_id: "task-02-auth-tdd",
      target_test_file: "test/scoped/auth.test.js",
      owned_files: ["src/auth.js", "test/scoped/auth.test.js"],
      prohibited_actions: ["npm test", "full_regression"],
      acceptance_criteria: ["Target scoped test passes cleanly with 0 failures"],
      project_path: sandboxPath,
    });

    const validation = validateProcedureWorkspace(ws);
    assert.equal(validation.valid, true);
    assert.equal(ws.procedure_type, "INNER_LOOP_TDD");
    assert.equal(ws.workspace_id, "task-02-auth-tdd");
    assert.equal(ws.responsibility_invariants.target_test_file, "test/scoped/auth.test.js");
    assert.deepEqual(ws.responsibility_invariants.owned_files, ["src/auth.js", "test/scoped/auth.test.js"]);
    assert.deepEqual(ws.responsibility_invariants.prohibited_actions, ["npm test", "full_regression"]);
    assert.deepEqual(ws.active_skills, [
      "vertical-context-extractor",
      "scoped-tdd-executor",
      "context-patch-synthesizer",
    ]);
    assert.deepEqual(ws.active_guards, ["secret-leak-guard", "scope-boundary-enforcer"]);

    // Verify worktree active skills
    const worktreeAbsPath = path.join(sandboxPath, ".workspaces", "task-02-auth-tdd");
    const mountedSkills = await fs.readdir(path.join(worktreeAbsPath, ".agents", "skills"));
    assert.deepEqual(
      mountedSkills.sort(),
      ["context-patch-synthesizer", "scoped-tdd-executor", "vertical-context-extractor"].sort()
    );

    // Root workspace remains untouched
    let rootSkillsExists = false;
    try {
      await fs.stat(path.join(sandboxPath, ".agents", "skills"));
      rootSkillsExists = true;
    } catch {}
    assert.equal(rootSkillsExists, false);
  });

  await t.test("Spawns SECURITY_AUDIT and RELEASE_GATE workspaces with correct procedure invariants", async () => {
    // SECURITY_AUDIT
    const secWs = await spawnProcedureWorkspace({
      procedure_type: "SECURITY_AUDIT",
      task_id: "task-03-security",
      project_path: sandboxPath,
    });
    assert.equal(secWs.procedure_type, "SECURITY_AUDIT");
    assert.deepEqual(secWs.active_guards, ["secret-leak-guard", "destructive-command-blocker", "scope-boundary-enforcer"]);

    // RELEASE_GATE
    const relWs = await spawnProcedureWorkspace({
      procedure_type: "RELEASE_GATE",
      task_id: "task-04-release",
      project_path: sandboxPath,
    });
    assert.equal(relWs.procedure_type, "RELEASE_GATE");
    assert.deepEqual(relWs.active_skills, [
      "lifecycle-phase-controller",
      "global-regression-gatekeeper",
      "baseline-curation-core",
    ]);

    const worktreeAbsPath = path.join(sandboxPath, ".workspaces", "task-04-release");
    const mountedSkills = await fs.readdir(path.join(worktreeAbsPath, ".agents", "skills"));
    assert.deepEqual(
      mountedSkills.sort(),
      ["baseline-curation-core", "global-regression-gatekeeper", "lifecycle-phase-controller"].sort()
    );
  });

  await t.test("Mounts skills from actual .skills-platform/registry if available", async () => {
    // Set up a mock registry in sandbox
    const registryRoot = path.join(sandboxPath, ".skills-platform", "registry");
    const revArtifactDir = path.join(registryRoot, "revisions", "rev-001", "artifacts", "custom-skill-12345");
    await fs.mkdir(revArtifactDir, { recursive: true });
    await fs.writeFile(path.join(revArtifactDir, "SKILL.md"), "# Custom Skill from Registry\n", "utf8");
    await fs.writeFile(path.join(revArtifactDir, "index.js"), "module.exports = {};\n", "utf8");

    const registryJson = {
      schema_version: 1,
      skills: [
        {
          id: "skill_custom_01",
          skill_name: "custom-skill",
          source_revision_id: "rev-001",
          canonical_path: "revisions/rev-001/artifacts/custom-skill-12345",
        },
      ],
    };
    await fs.writeFile(path.join(registryRoot, "registry.json"), JSON.stringify(registryJson), "utf8");

    const ws = await spawnProcedureWorkspace({
      procedure_type: "INNER_LOOP_TDD",
      task_id: "task-custom-registry",
      active_skills: ["custom-skill"],
      project_path: sandboxPath,
    });

    const mountedSkillPath = path.join(sandboxPath, ".workspaces", "task-custom-registry", ".agents", "skills", "custom-skill");
    const skillContent = await fs.readFile(path.join(mountedSkillPath, "SKILL.md"), "utf8");
    assert.equal(skillContent, "# Custom Skill from Registry\n");
    const codeContent = await fs.readFile(path.join(mountedSkillPath, "index.js"), "utf8");
    assert.equal(codeContent, "module.exports = {};\n");
  });

  await t.test("Spawns concurrent workspaces simultaneously without lock collisions", async () => {
    const tasks = ["task-conc-1", "task-conc-2", "task-conc-3", "task-conc-4"];

    const workspaces = await Promise.all(
      tasks.map((taskId, index) =>
        spawnProcedureWorkspace({
          procedure_type: index % 2 === 0 ? "PLANNING" : "INNER_LOOP_TDD",
          task_id: taskId,
          project_path: sandboxPath,
        })
      )
    );

    assert.equal(workspaces.length, 4);

    for (let i = 0; i < tasks.length; i++) {
      const ws = workspaces[i];
      assert.equal(ws.workspace_id, tasks[i]);
      assert.equal(ws.status, "active");
      const wtDir = path.join(sandboxPath, ".workspaces", tasks[i]);
      const stat = await fs.stat(wtDir);
      assert.equal(stat.isDirectory(), true);
    }

    const recorded = await loadWorkspaces({ project_path: sandboxPath });
    assert.equal(recorded.length, 4);
  });

  await t.test("listProcedureWorkspaces and getProcedureWorkspace retrieve stored workspaces and filter by status", async () => {
    await spawnProcedureWorkspace({
      procedure_type: "PLANNING",
      task_id: "task-list-01",
      project_path: sandboxPath,
    });

    await spawnProcedureWorkspace({
      procedure_type: "INNER_LOOP_TDD",
      task_id: "task-list-02",
      project_path: sandboxPath,
    });

    // List all
    const all = await listProcedureWorkspaces({ project_path: sandboxPath });
    assert.equal(all.length, 2);

    // List by status
    const active = await listProcedureWorkspaces({ project_path: sandboxPath, status: "active" });
    assert.equal(active.length, 2);

    const merged = await listProcedureWorkspaces({ project_path: sandboxPath, status: "merged" });
    assert.equal(merged.length, 0);

    // Get by ID
    const ws1 = await getProcedureWorkspace("task-list-01", { project_path: sandboxPath });
    assert.ok(ws1);
    assert.equal(ws1.workspace_id, "task-list-01");
    assert.equal(ws1.procedure_type, "PLANNING");

    const ws2 = await getProcedureWorkspace("task-list-02", { project_path: sandboxPath });
    assert.ok(ws2);
    assert.equal(ws2.workspace_id, "task-list-02");

    const nonExistent = await getProcedureWorkspace("task-missing", { project_path: sandboxPath });
    assert.equal(nonExistent, null);
  });

  await t.test("pruneProcedureWorkspace removes worktree, deletes branch, and marks workspace status as pruned", async () => {
    const ws = await spawnProcedureWorkspace({
      procedure_type: "INNER_LOOP_TDD",
      task_id: "task-prune-me",
      project_path: sandboxPath,
    });

    const worktreeAbsPath = path.join(sandboxPath, ".workspaces", "task-prune-me");
    const statBefore = await fs.stat(worktreeAbsPath);
    assert.equal(statBefore.isDirectory(), true);

    // Prune workspace
    const pruneResult = await pruneProcedureWorkspace("task-prune-me", {
      project_path: sandboxPath,
      delete_branch: true,
    });

    assert.equal(pruneResult.pruned, true);
    assert.equal(pruneResult.workspace_id, "task-prune-me");
    assert.ok(pruneResult.completed_at);

    // Verify directory is deleted
    let dirExists = false;
    try {
      await fs.stat(worktreeAbsPath);
      dirExists = true;
    } catch {}
    assert.equal(dirExists, false, "Worktree directory should be deleted after prune");

    // Verify branch is deleted
    const { stdout: branchCheck } = await execFileAsync("git", ["branch", "--list", "worktree/task-prune-me"], { cwd: sandboxPath });
    assert.equal(branchCheck.trim(), "", "Branch worktree/task-prune-me should be deleted");

    // Verify metadata updated to status: pruned
    const updatedWs = await getProcedureWorkspace("task-prune-me", { project_path: sandboxPath });
    assert.ok(updatedWs);
    assert.equal(updatedWs.status, "pruned");
    assert.ok(updatedWs.completed_at);

    // Filter by status: pruned
    const prunedList = await listProcedureWorkspaces({ project_path: sandboxPath, status: "pruned" });
    assert.equal(prunedList.length, 1);
    assert.equal(prunedList[0].workspace_id, "task-prune-me");
  });

  await t.test("Re-spawning workspace after pruning recreates worktree cleanly", async () => {
    await spawnProcedureWorkspace({
      procedure_type: "PLANNING",
      task_id: "task-reuse-id",
      project_path: sandboxPath,
    });

    await pruneProcedureWorkspace("task-reuse-id", { project_path: sandboxPath });

    const ws2 = await spawnProcedureWorkspace({
      procedure_type: "INNER_LOOP_TDD",
      task_id: "task-reuse-id",
      project_path: sandboxPath,
    });

    assert.equal(ws2.workspace_id, "task-reuse-id");
    assert.equal(ws2.procedure_type, "INNER_LOOP_TDD");
    assert.equal(ws2.status, "active");

    const worktreeAbsPath = path.join(sandboxPath, ".workspaces", "task-reuse-id");
    const stat = await fs.stat(worktreeAbsPath);
    assert.equal(stat.isDirectory(), true);
  });

  await t.test("Rejects invalid procedure types and non-git directories", async () => {
    await assert.rejects(
      async () => {
        await spawnProcedureWorkspace({
          procedure_type: "INVALID_PROCEDURE",
          task_id: "task-err-01",
          project_path: sandboxPath,
        });
      },
      /Invalid procedure_type/
    );

    const nonGitDir = await fs.mkdtemp(path.join(os.tmpdir(), "non-git-"));
    try {
      await assert.rejects(
        async () => {
          await spawnProcedureWorkspace({
            procedure_type: "PLANNING",
            task_id: "task-err-02",
            project_path: nonGitDir,
          });
        },
        /Git execution failed/
      );
    } finally {
      await fs.rm(nonGitDir, { recursive: true, force: true });
    }
  });
});
