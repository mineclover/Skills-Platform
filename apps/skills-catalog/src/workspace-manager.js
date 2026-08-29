"use strict";

const { execFile } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const { promisify } = require("node:util");

const {
  createProcedureWorkspace,
  validateProcedureWorkspace,
  PROCEDURE_TYPES,
  PROCEDURE_WORKSPACE_STATUSES,
} = require("@skills-platform/contracts");

const execFileAsync = promisify(execFile);

const WORKSPACES_DIR_NAME = ".workspaces";
const WORKSPACES_STORAGE_RELATIVE = path.join(".skills-platform", "workspaces", "workspaces.json");

/**
 * Standard defaults for the 4 core procedure types.
 */
const PROCEDURE_DEFAULTS = {
  PLANNING: {
    recipe_id: "mlc-task-planning",
    preset_id: "task-planning-suite",
    active_skills: ["task-decomposer", "horizontal-topic-scanner"],
    active_guards: ["subagent-recursion-limiter", "context-budget-guard"],
    prohibited_actions: ["npm test", "full_regression", "modify production code"],
    acceptance_criteria: [
      "Requirements decomposed into dependency-ordered atomic tasks",
      "Zero unverified code mutations",
    ],
  },
  INNER_LOOP_TDD: {
    recipe_id: "mlc-scoped-inner-loop",
    preset_id: "scoped-inner-loop-suite",
    active_skills: ["vertical-context-extractor", "scoped-tdd-executor", "context-patch-synthesizer"],
    active_guards: ["secret-leak-guard", "scope-boundary-enforcer"],
    prohibited_actions: ["npm test", "full_regression", "modify out of bounds"],
    acceptance_criteria: [
      "Target scoped test passes cleanly with 0 failures",
      "All modified files match owned_files scope",
    ],
  },
  SECURITY_AUDIT: {
    recipe_id: "mlc-security-audit",
    preset_id: "security-audit-suite",
    active_skills: ["secret-leak-guard", "scope-boundary-enforcer", "destructive-command-blocker"],
    active_guards: ["secret-leak-guard", "destructive-command-blocker", "scope-boundary-enforcer"],
    prohibited_actions: [
      "bypass security guards",
      "leak credentials",
      "execute destructive shell commands",
    ],
    acceptance_criteria: [
      "Zero security guard violations",
      "Credentials and sensitive tokens unexposed",
    ],
  },
  RELEASE_GATE: {
    recipe_id: "mlc-release-governance",
    preset_id: "release-governance-suite",
    active_skills: ["lifecycle-phase-controller", "global-regression-gatekeeper", "baseline-curation-core"],
    active_guards: ["destructive-command-blocker", "secret-leak-guard", "scope-boundary-enforcer"],
    prohibited_actions: [
      "skip regression gate",
      "bypass verification",
      "modify files outside baseline",
    ],
    acceptance_criteria: [
      "Full regression test suite passes with 0 failures",
      "MASTER_BASELINE updated and compacted under 80k tokens",
    ],
  },
};

/**
 * In-process mutex queue per project path to prevent concurrency collisions during Git worktree ops.
 */
const projectLocks = new Map();

async function withProjectLock(projectPath, fn) {
  const key = path.resolve(projectPath);
  const prevLock = projectLocks.get(key) || Promise.resolve();
  let release;
  const currentLock = new Promise((resolve) => {
    release = resolve;
  });
  projectLocks.set(key, currentLock);
  try {
    await prevLock;
    return await fn();
  } finally {
    release();
    if (projectLocks.get(key) === currentLock) {
      projectLocks.delete(key);
    }
  }
}

/**
 * Execute Git command in target directory.
 */
async function runGit(args, cwd, { ignoreError = false } = {}) {
  try {
    const { stdout, stderr } = await execFileAsync("git", args, {
      cwd,
      windowsHide: true,
      maxBuffer: 10 * 1024 * 1024,
    });
    return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode: 0 };
  } catch (error) {
    if (ignoreError) {
      return {
        stdout: (error.stdout || "").trim(),
        stderr: (error.stderr || "").trim(),
        exitCode: error.code || 1,
        error,
      };
    }
    const msg = `Git execution failed (git ${args.join(" ")} in ${cwd}): ${error.message} \nStderr: ${error.stderr || ""}`;
    const gitErr = new Error(msg);
    gitErr.gitArgs = args;
    gitErr.cwd = cwd;
    gitErr.stderr = error.stderr;
    gitErr.stdout = error.stdout;
    gitErr.exitCode = error.code;
    throw gitErr;
  }
}

/**
 * Retry helper for transient OS file locks.
 */
async function retryAsync(fn, retries = 3, delayMs = 80) {
  let lastError;
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (i < retries - 1) {
        await new Promise((res) => setTimeout(res, delayMs * (i + 1)));
      }
    }
  }
  throw lastError;
}

/**
 * Storage helpers for workspaces.json metadata tracking.
 */
function getWorkspacesStoragePath(projectPath) {
  return path.join(path.resolve(projectPath), WORKSPACES_STORAGE_RELATIVE);
}

async function loadWorkspaces({ project_path = process.cwd() } = {}) {
  const filePath = getWorkspacesStoragePath(project_path);
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    if (parsed && Array.isArray(parsed.workspaces)) {
      return parsed.workspaces;
    }
    return [];
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }
    return [];
  }
}

async function saveWorkspaces({ project_path = process.cwd(), workspaces = [] } = {}) {
  const filePath = getWorkspacesStoragePath(project_path);
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });

  const payload = {
    schema_version: 1,
    updated_at: new Date().toISOString(),
    workspaces,
  };

  const tempPath = `${filePath}.${crypto.randomUUID().slice(0, 8)}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(payload, null, 2) + "\n", "utf8");
  await fs.rename(tempPath, filePath);
}

/**
 * Resolve registry skill directories from .skills-platform/registry or local sources.
 */
async function findSkillSourceDirectory(projectPath, skillName) {
  const registryRoot = path.join(projectPath, ".skills-platform", "registry");
  const registryJsonPath = path.join(registryRoot, "registry.json");

  try {
    const raw = await fs.readFile(registryJsonPath, "utf8");
    const reg = JSON.parse(raw);
    if (Array.isArray(reg.skills)) {
      const match = reg.skills.find(
        (s) => s.skill_name === skillName || s.id === skillName
      );
      if (match) {
        if (match.canonical_path) {
          const cand = path.resolve(registryRoot, match.canonical_path);
          try {
            const st = await fs.stat(cand);
            if (st.isDirectory()) return cand;
          } catch {}
        }
        if (match.source_revision_id) {
          const revArtifactsDir = path.join(
            registryRoot,
            "revisions",
            match.source_revision_id,
            "artifacts"
          );
          try {
            const list = await fs.readdir(revArtifactsDir);
            const prefixMatch = list.find((item) =>
              item.startsWith(`${match.skill_name}-`) || item === match.skill_name
            );
            if (prefixMatch) {
              return path.join(revArtifactsDir, prefixMatch);
            }
          } catch {}
        }
      }
    }
  } catch {}

  // Check local skill paths
  const localCandidates = [
    path.join(projectPath, "skills", skillName),
    path.join(projectPath, ".agents", "skills", skillName),
    path.join(projectPath, ".skills-platform", "skills", skillName),
  ];

  for (const cand of localCandidates) {
    try {
      const st = await fs.stat(cand);
      if (st.isDirectory()) return cand;
    } catch {}
  }

  return null;
}

/**
 * Mount isolated active skills directly into worktree directory.
 * Root main workspace is never mutated.
 */
async function mountActiveSkillsIntoWorktree({
  worktreePath,
  projectPath,
  activeSkills,
  procedureType,
  workspaceId,
  providerId = "antigravity",
}) {
  const deliveryDirs = [
    path.join(worktreePath, ".agents", "skills"),
  ];

  if (providerId === "claude") {
    deliveryDirs.push(path.join(worktreePath, ".claude", "skills"));
  }

  for (const deliveryDir of deliveryDirs) {
    await fs.mkdir(deliveryDir, { recursive: true });
  }

  for (const skillName of activeSkills) {
    const sourceDir = await findSkillSourceDirectory(projectPath, skillName);

    for (const deliveryDir of deliveryDirs) {
      const targetDir = path.join(deliveryDir, skillName);
      await fs.mkdir(targetDir, { recursive: true });

      if (sourceDir) {
        await fs.cp(sourceDir, targetDir, { recursive: true });
      } else {
        // Create canonical SKILL.md descriptor if source is not in registry
        const skillDescriptor = [
          "---",
          `name: ${skillName}`,
          `procedure_type: ${procedureType}`,
          `workspace_id: ${workspaceId}`,
          "mounted_at: " + new Date().toISOString(),
          "---",
          `# ${skillName}`,
          "",
          `Active procedure skill mounted for ${procedureType} workspace \`${workspaceId}\`.`,
          "",
        ].join("\n");
        await fs.writeFile(path.join(targetDir, "SKILL.md"), skillDescriptor, "utf8");
      }
    }
  }
}

/**
 * Spawns an isolated Git worktree procedure workspace.
 *
 * @param {Object} options
 * @param {string} options.procedure_type - PLANNING | INNER_LOOP_TDD | SECURITY_AUDIT | RELEASE_GATE
 * @param {string} [options.task_id] - Unique task identifier (e.g. task-01)
 * @param {string} [options.recipe_id] - Optional recipe ID to load active skills & guards
 * @param {string} [options.preset_id] - Optional preset ID
 * @param {string} [options.target_test_file] - Single scoped test target for inner loop
 * @param {string[]} [options.owned_files] - Target files permitted for modification
 * @param {string[]} [options.prohibited_actions] - Forbidden actions
 * @param {string[]} [options.acceptance_criteria] - Gate pass criteria
 * @param {string} [options.project_path=process.cwd()] - Repository root path
 * @param {string} [options.base_ref="HEAD"] - Git ref base for the worktree branch
 * @param {string[]} [options.active_skills] - Explicit skills override
 * @param {string[]} [options.active_guards] - Explicit guards override
 * @param {Object} [options.metadata] - Extra custom metadata
 * @returns {Promise<import("@skills-platform/contracts").ProcedureWorkspace>}
 */
async function spawnProcedureWorkspace(options = {}) {
  const procedureType = (
    options.procedure_type ||
    options.procedureType ||
    "INNER_LOOP_TDD"
  ).toUpperCase();

  if (!PROCEDURE_TYPES.has(procedureType)) {
    throw new Error(
      `Invalid procedure_type: "${procedureType}". Must be one of: ${[...PROCEDURE_TYPES].join(", ")}`
    );
  }

  const projectPath = path.resolve(options.project_path || options.projectPath || process.cwd());
  const taskId = (
    options.task_id ||
    options.taskId ||
    options.workspace_id ||
    options.workspaceId ||
    `task-${crypto.randomUUID().slice(0, 8)}`
  ).trim();

  const baseRef = options.base_ref || options.baseRef || "HEAD";
  const branchName = `worktree/${taskId}`;
  const relativeWorktreePath = path.join(WORKSPACES_DIR_NAME, taskId).replace(/\\/g, "/");
  const absoluteWorktreePath = path.join(projectPath, WORKSPACES_DIR_NAME, taskId);

  const defaults = PROCEDURE_DEFAULTS[procedureType] || PROCEDURE_DEFAULTS.INNER_LOOP_TDD;

  const resolvedSkills = Array.isArray(options.active_skills || options.activeSkills)
    ? [...new Set(options.active_skills || options.activeSkills)]
    : [...defaults.active_skills];

  const resolvedGuards = Array.isArray(options.active_guards || options.activeGuards)
    ? [...new Set(options.active_guards || options.activeGuards)]
    : [...defaults.active_guards];

  const prohibitedActions = Array.isArray(options.prohibited_actions || options.prohibitedActions)
    ? [...(options.prohibited_actions || options.prohibitedActions)]
    : [...defaults.prohibited_actions];

  const acceptanceCriteria = Array.isArray(options.acceptance_criteria || options.acceptanceCriteria)
    ? [...(options.acceptance_criteria || options.acceptanceCriteria)]
    : [...defaults.acceptance_criteria];

  const ownedFiles = Array.isArray(options.owned_files || options.ownedFiles)
    ? [...(options.owned_files || options.ownedFiles)]
    : [];

  const targetTestFile = options.target_test_file || options.targetTestFile;

  return await withProjectLock(projectPath, async () => {
    // 1. Verify Git repository
    await runGit(["rev-parse", "--is-inside-work-tree"], projectPath);

    // 2. Ensure parent .workspaces directory exists
    const workspacesDir = path.join(projectPath, WORKSPACES_DIR_NAME);
    await fs.mkdir(workspacesDir, { recursive: true });

    // 3. Prune stale worktrees
    await runGit(["worktree", "prune"], projectPath, { ignoreError: true });

    // 4. Check branch existence
    const branchCheck = await runGit(["branch", "--list", branchName], projectPath, { ignoreError: true });
    const branchExists = branchCheck.stdout.length > 0;

    // 5. Clean existing worktree directory if present from prior failed run
    try {
      const stat = await fs.stat(absoluteWorktreePath);
      if (stat.isDirectory()) {
        await runGit(["worktree", "remove", "--force", absoluteWorktreePath], projectPath, { ignoreError: true });
        await fs.rm(absoluteWorktreePath, { recursive: true, force: true });
      }
    } catch {}

    // 6. Create Git worktree
    await retryAsync(async () => {
      if (branchExists) {
        await runGit(["worktree", "add", "-B", branchName, absoluteWorktreePath, baseRef], projectPath);
      } else {
        await runGit(["worktree", "add", "-b", branchName, absoluteWorktreePath, baseRef], projectPath);
      }
    }, 3, 100);

    // 7. Mount isolated active skills into worktree (zero modifications to root main)
    await mountActiveSkillsIntoWorktree({
      worktreePath: absoluteWorktreePath,
      projectPath,
      activeSkills: resolvedSkills,
      procedureType,
      workspaceId: taskId,
      providerId: options.provider_id || options.providerId || "antigravity",
    });

    // 8. Construct validated ProcedureWorkspace contract
    const workspace = createProcedureWorkspace({
      workspace_id: taskId,
      procedure_type: procedureType,
      git_branch: branchName,
      git_worktree_path: relativeWorktreePath,
      responsibility_invariants: {
        target_test_file: targetTestFile,
        owned_files: ownedFiles,
        prohibited_actions: prohibitedActions,
        acceptance_criteria: acceptanceCriteria,
      },
      active_skills: resolvedSkills,
      active_guards: resolvedGuards,
      status: "active",
      created_at: options.created_at || (options.now instanceof Date ? options.now.toISOString() : new Date().toISOString()),
      metadata: {
        ...(options.metadata || {}),
        task_id: taskId,
        recipe_id: options.recipe_id || options.recipeId || defaults.recipe_id,
        preset_id: options.preset_id || options.presetId || defaults.preset_id,
        base_ref: baseRef,
        git_worktree_abs_path: absoluteWorktreePath,
      },
    });

    // 9. Persist in workspaces.json
    const existingWorkspaces = await loadWorkspaces({ project_path: projectPath });
    const updatedWorkspaces = existingWorkspaces.filter(
      (w) => w.workspace_id !== taskId && w.workspace_id !== workspace.workspace_id
    );
    updatedWorkspaces.push(workspace);
    await saveWorkspaces({ project_path: projectPath, workspaces: updatedWorkspaces });

    return workspace;
  });
}

/**
 * Prunes an isolated Git worktree procedure workspace.
 *
 * @param {string|Object} workspaceIdOrOptions - Workspace ID or options object
 * @param {Object} [maybeOptions] - Options when workspaceId is string
 * @param {string} [maybeOptions.project_path=process.cwd()]
 * @param {boolean} [maybeOptions.delete_branch=true]
 * @returns {Promise<{ pruned: boolean, workspace_id: string, completed_at: string }>}
 */
async function pruneProcedureWorkspace(workspaceIdOrOptions, maybeOptions = {}) {
  let workspaceId;
  let options;

  if (typeof workspaceIdOrOptions === "object" && workspaceIdOrOptions !== null) {
    options = workspaceIdOrOptions;
    workspaceId = options.workspace_id || options.workspaceId || options.task_id || options.taskId;
  } else {
    workspaceId = workspaceIdOrOptions;
    options = maybeOptions;
  }

  if (!workspaceId || typeof workspaceId !== "string") {
    throw new Error("workspace_id is required to prune a procedure workspace");
  }

  const projectPath = path.resolve(options.project_path || options.projectPath || process.cwd());
  const deleteBranch = options.delete_branch !== false && options.deleteBranch !== false;

  return await withProjectLock(projectPath, async () => {
    const existingWorkspaces = await loadWorkspaces({ project_path: projectPath });
    const targetWs = existingWorkspaces.find(
      (w) => w.workspace_id === workspaceId || w.metadata?.task_id === workspaceId
    );

    const relativeWorktreePath = targetWs?.git_worktree_path || path.join(WORKSPACES_DIR_NAME, workspaceId);
    const absoluteWorktreePath = path.resolve(projectPath, relativeWorktreePath);
    const branchName = targetWs?.git_branch || `worktree/${workspaceId}`;
    const completedAt = new Date().toISOString();

    // 1. Remove Git worktree
    await runGit(["worktree", "remove", "--force", absoluteWorktreePath], projectPath, { ignoreError: true });
    await runGit(["worktree", "prune"], projectPath, { ignoreError: true });

    // 2. Ensure directory is removed from filesystem
    try {
      await fs.rm(absoluteWorktreePath, { recursive: true, force: true });
    } catch {}

    // 3. Delete branch if requested
    if (deleteBranch) {
      await runGit(["branch", "-D", branchName], projectPath, { ignoreError: true });
    }

    // 4. Update stored workspace status to pruned
    const updatedWorkspaces = existingWorkspaces.map((w) => {
      if (w.workspace_id === workspaceId || w.metadata?.task_id === workspaceId) {
        return {
          ...w,
          status: "pruned",
          completed_at: completedAt,
        };
      }
      return w;
    });

    await saveWorkspaces({ project_path: projectPath, workspaces: updatedWorkspaces });

    return {
      pruned: true,
      workspace_id: workspaceId,
      completed_at: completedAt,
    };
  });
}

/**
 * Lists recorded procedure workspaces with optional status filter.
 *
 * @param {Object} [options]
 * @param {string} [options.project_path=process.cwd()]
 * @param {string} [options.status]
 * @returns {Promise<import("@skills-platform/contracts").ProcedureWorkspace[]>}
 */
async function listProcedureWorkspaces(options = {}) {
  const projectPath = path.resolve(options.project_path || options.projectPath || process.cwd());
  const filterStatus = options.status ? String(options.status).toLowerCase().trim() : null;

  const workspaces = await loadWorkspaces({ project_path: projectPath });

  if (!filterStatus) {
    return workspaces;
  }

  return workspaces.filter((w) => String(w.status).toLowerCase() === filterStatus);
}

/**
 * Gets a single procedure workspace by workspace_id or task_id.
 *
 * @param {string} workspaceId
 * @param {Object} [options]
 * @param {string} [options.project_path=process.cwd()]
 * @returns {Promise<import("@skills-platform/contracts").ProcedureWorkspace|null>}
 */
async function getProcedureWorkspace(workspaceId, options = {}) {
  if (!workspaceId) return null;
  const projectPath = path.resolve(options.project_path || options.projectPath || process.cwd());
  const workspaces = await loadWorkspaces({ project_path: projectPath });
  const idStr = String(workspaceId).trim();

  return (
    workspaces.find(
      (w) =>
        w.workspace_id === idStr ||
        w.metadata?.task_id === idStr ||
        w.git_branch === `worktree/${idStr}` ||
        w.git_branch === idStr
    ) || null
  );
}

module.exports = {
  PROCEDURE_DEFAULTS,
  WORKSPACES_DIR_NAME,
  WORKSPACES_STORAGE_RELATIVE,
  spawnProcedureWorkspace,
  pruneProcedureWorkspace,
  listProcedureWorkspaces,
  getProcedureWorkspace,
  loadWorkspaces,
  saveWorkspaces,
};
