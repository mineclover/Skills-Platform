"use strict";

const { execFile } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const { promisify } = require("node:util");

const {
  getProcedureWorkspace,
  pruneProcedureWorkspace,
  loadWorkspaces,
  saveWorkspaces,
  WORKSPACES_DIR_NAME,
} = require("./workspace-manager");

const {
  validateProcedureWorkspace,
  PROCEDURE_WORKSPACE_STATUSES,
} = require("@skills-platform/contracts");

const execFileAsync = promisify(execFile);

const MERGE_QUEUE_STORAGE_RELATIVE = path.join(".skills-platform", "workspaces", "merge-queue.json");

/**
 * In-process mutex per project path to serialize sequential merge operations.
 */
const mergerLocks = new Map();

async function withMergerLock(projectPath, fn) {
  const key = path.resolve(projectPath);
  const prevLock = mergerLocks.get(key) || Promise.resolve();
  let release;
  const currentLock = new Promise((resolve) => {
    release = resolve;
  });
  mergerLocks.set(key, currentLock);
  try {
    await prevLock;
    return await fn();
  } finally {
    release();
    if (mergerLocks.get(key) === currentLock) {
      mergerLocks.delete(key);
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
 * Storage helpers for merge-queue.json
 */
function getMergeQueueStoragePath(projectPath) {
  return path.join(path.resolve(projectPath), MERGE_QUEUE_STORAGE_RELATIVE);
}

async function loadMergeQueue({ project_path = process.cwd() } = {}) {
  const filePath = getMergeQueueStoragePath(project_path);
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    if (parsed && Array.isArray(parsed.queue)) {
      return parsed.queue;
    }
    return [];
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }
    return [];
  }
}

async function saveMergeQueue({ project_path = process.cwd(), queue = [] } = {}) {
  const filePath = getMergeQueueStoragePath(project_path);
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });

  const payload = {
    schema_version: 1,
    updated_at: new Date().toISOString(),
    queue,
  };

  const tempPath = `${filePath}.${crypto.randomUUID().slice(0, 8)}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(payload, null, 2) + "\n", "utf8");
  await fs.rename(tempPath, filePath);
}

/**
 * Normalizes a workspace identifier from string or options object.
 */
function resolveWorkspaceId(workspaceIdOrOptions) {
  if (!workspaceIdOrOptions) return null;
  if (typeof workspaceIdOrOptions === "string") return workspaceIdOrOptions.trim();
  if (typeof workspaceIdOrOptions === "object") {
    return (
      workspaceIdOrOptions.workspace_id ||
      workspaceIdOrOptions.workspaceId ||
      workspaceIdOrOptions.task_id ||
      workspaceIdOrOptions.taskId ||
      null
    );
  }
  return String(workspaceIdOrOptions).trim();
}

/**
 * Inspects all modified and created files in a worktree relative to base ref.
 */
async function getModifiedFilesInWorktree(worktreePath, projectPath, baseRef = "main") {
  const modified = new Set();

  // 1. Check uncommitted and untracked changes in worktree
  const statusRes = await runGit(["status", "--porcelain"], worktreePath, { ignoreError: true });
  if (statusRes.stdout) {
    const lines = statusRes.stdout.split("\n").map((l) => l.trim()).filter(Boolean);
    for (const line of lines) {
      let filePath = line.replace(/^[A-Z?!\s]+\s+/, "").trim();
      if (filePath.includes("->")) {
        filePath = filePath.split("->").pop().trim();
      }
      filePath = filePath.replace(/^"|"$/g, "");
      if (filePath) {
        modified.add(filePath.replace(/\\/g, "/"));
      }
    }
  }

  // 2. Resolve base reference to compare against
  let targetRef = baseRef && baseRef !== "HEAD" ? baseRef : "main";
  if (projectPath && (!baseRef || baseRef === "HEAD")) {
    const rootBranchRes = await runGit(["rev-parse", "--abbrev-ref", "HEAD"], projectPath, { ignoreError: true });
    if (rootBranchRes.stdout && rootBranchRes.stdout !== "HEAD") {
      targetRef = rootBranchRes.stdout;
    }
  }

  let mergeBase = null;

  // Try git merge-base <targetRef> HEAD in worktree
  const mbRes = await runGit(["merge-base", targetRef, "HEAD"], worktreePath, { ignoreError: true });
  if (mbRes.exitCode === 0 && mbRes.stdout) {
    mergeBase = mbRes.stdout.split("\n")[0].trim();
  }

  // Fallback 1: if projectPath is provided, try root HEAD commit
  if (!mergeBase && projectPath) {
    const rootHeadRes = await runGit(["rev-parse", "HEAD"], projectPath, { ignoreError: true });
    if (rootHeadRes.exitCode === 0 && rootHeadRes.stdout) {
      const rootHead = rootHeadRes.stdout.trim();
      const mbRootRes = await runGit(["merge-base", rootHead, "HEAD"], worktreePath, { ignoreError: true });
      if (mbRootRes.exitCode === 0 && mbRootRes.stdout) {
        mergeBase = mbRootRes.stdout.split("\n")[0].trim();
      } else {
        mergeBase = rootHead;
      }
    }
  }

  // Fallback 2: try targetRef directly or initial commit in worktree
  if (!mergeBase) {
    const initCommitRes = await runGit(["rev-list", "--max-parents=0", "HEAD"], worktreePath, { ignoreError: true });
    if (initCommitRes.exitCode === 0 && initCommitRes.stdout) {
      mergeBase = initCommitRes.stdout.split("\n")[0].trim();
    } else {
      mergeBase = targetRef;
    }
  }

  // 3. Execute diff against mergeBase
  const diffRes = await runGit(["diff", "--name-only", mergeBase, "HEAD"], worktreePath, { ignoreError: true });
  if (diffRes.stdout) {
    const lines = diffRes.stdout.split("\n").map((l) => l.trim()).filter(Boolean);
    for (const line of lines) {
      const cleanLine = line.replace(/^"|"$/g, "").trim();
      if (cleanLine) {
        modified.add(cleanLine.replace(/\\/g, "/"));
      }
    }
  } else {
    // 3-dot diff fallback
    const dotDiffRes = await runGit(["diff", "--name-only", `${mergeBase}...HEAD`], worktreePath, { ignoreError: true });
    if (dotDiffRes.stdout) {
      const lines = dotDiffRes.stdout.split("\n").map((l) => l.trim()).filter(Boolean);
      for (const line of lines) {
        const cleanLine = line.replace(/^"|"$/g, "").trim();
        if (cleanLine) {
          modified.add(cleanLine.replace(/\\/g, "/"));
        }
      }
    }
  }

  // Filter out mounted skills and worktree metadata paths
  const userModified = [];
  for (const file of modified) {
    const normalized = file.replace(/\\/g, "/").replace(/^\.\//, "");
    if (
      normalized.startsWith(".agents/skills") ||
      normalized.startsWith(".claude/skills") ||
      normalized.startsWith(".skills-platform") ||
      normalized.startsWith(".workspaces") ||
      normalized === ".git" ||
      normalized.startsWith(".git/")
    ) {
      continue;
    }
    userModified.push(normalized);
  }

  return userModified;
}

/**
 * Checks if a file path is permitted by the owned_files invariant list.
 */
function isFileOwned(filePath, ownedFiles) {
  if (!Array.isArray(ownedFiles) || ownedFiles.length === 0) {
    return true;
  }
  const normFile = filePath.replace(/\\/g, "/").replace(/^\.\//, "").toLowerCase();

  for (const owned of ownedFiles) {
    const normOwned = owned.replace(/\\/g, "/").replace(/^\.\//, "").toLowerCase();
    if (normFile === normOwned) {
      return true;
    }
    const dirPrefix = normOwned.endsWith("/") ? normOwned : normOwned + "/";
    if (normFile.startsWith(dirPrefix)) {
      return true;
    }
    if (normOwned.includes("*")) {
      const regexPattern =
        "^" +
        normOwned
          .split("*")
          .map((s) => s.replace(/[.+^${}()|[\]\\]/g, "\\$&"))
          .join(".*") +
        "$";
      if (new RegExp(regexPattern).test(normFile)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Internal enqueue logic.
 */
async function _enqueueWorkspaceInternal(workspaceId, options, projectPath) {
  const dependencies = Array.isArray(options.dependencies)
    ? [...new Set(options.dependencies.map(String))]
    : [];

  const queue = await loadMergeQueue({ project_path: projectPath });
  const existingIndex = queue.findIndex((item) => item.workspace_id === workspaceId);

  const now = new Date().toISOString();
  let position;
  let entry;

  if (existingIndex >= 0) {
    position = existingIndex + 1;
    queue[existingIndex] = {
      ...queue[existingIndex],
      dependencies: dependencies.length > 0 ? dependencies : queue[existingIndex].dependencies || [],
      status: queue[existingIndex].status || "pending",
      position,
      updated_at: now,
    };
    entry = queue[existingIndex];
  } else {
    position = queue.length + 1;
    entry = {
      workspace_id: workspaceId,
      task_id: options.task_id || options.taskId || workspaceId,
      dependencies,
      status: "pending",
      position,
      enqueued_at: now,
      verified_at: null,
      merged_at: null,
      discarded_at: null,
      commit_hash: null,
      reason: null,
    };
    queue.push(entry);
  }

  await saveMergeQueue({ project_path: projectPath, queue });

  // Update metadata in workspaces.json if workspace exists
  const workspaces = await loadWorkspaces({ project_path: projectPath });
  const wsIndex = workspaces.findIndex(
    (w) => w.workspace_id === workspaceId || w.metadata?.task_id === workspaceId
  );
  if (wsIndex >= 0) {
    workspaces[wsIndex] = {
      ...workspaces[wsIndex],
      metadata: {
        ...(workspaces[wsIndex].metadata || {}),
        dependencies,
        merge_queue_position: position,
      },
    };
    await saveWorkspaces({ project_path: projectPath, workspaces });
  }

  return {
    enqueued: true,
    workspace_id: workspaceId,
    position,
    queue_position: position,
    status: entry.status,
  };
}

/**
 * Adds a workspace to the sequential merge queue with dependency lineage.
 */
async function enqueueWorkspace(workspaceIdOrOptions, maybeOptions = {}) {
  let options = {};
  let workspaceId;

  if (typeof workspaceIdOrOptions === "object" && workspaceIdOrOptions !== null) {
    options = workspaceIdOrOptions;
    workspaceId = resolveWorkspaceId(options);
  } else {
    workspaceId = resolveWorkspaceId(workspaceIdOrOptions);
    options = maybeOptions;
  }

  if (!workspaceId) {
    throw new Error("workspace_id is required to enqueue workspace");
  }

  const projectPath = path.resolve(options.project_path || options.projectPath || process.cwd());

  return await withMergerLock(projectPath, async () => {
    return await _enqueueWorkspaceInternal(workspaceId, options, projectPath);
  });
}

/**
 * Internal verification logic without acquiring mutex lock.
 */
async function _verifyWorkspaceInternal(workspaceId, options, projectPath) {
  const ws = await getProcedureWorkspace(workspaceId, { project_path: projectPath });
  if (!ws) {
    throw new Error(`Procedure workspace "${workspaceId}" not found`);
  }

  const relativeWorktreePath = ws.git_worktree_path || path.join(WORKSPACES_DIR_NAME, ws.workspace_id);
  const absoluteWorktreePath = path.resolve(projectPath, relativeWorktreePath);

  // Verify worktree exists
  try {
    const stat = await fs.stat(absoluteWorktreePath);
    if (!stat.isDirectory()) {
      throw new Error("Not a directory");
    }
  } catch {
    const issue = `Worktree directory "${absoluteWorktreePath}" does not exist`;
    return {
      verified: false,
      workspace_id: ws.workspace_id,
      test_output: "",
      invariant_checks: {
        target_test: false,
        owned_files: false,
        prohibited_actions: false,
      },
      issues: [issue],
    };
  }

  const invariants = ws.responsibility_invariants || {
    owned_files: [],
    prohibited_actions: [],
    acceptance_criteria: [],
  };

  const targetTestFile = invariants.target_test_file;
  const ownedFiles = invariants.owned_files || [];
  const prohibitedActions = invariants.prohibited_actions || [];

  const invariantChecks = {
    target_test: true,
    owned_files: true,
    prohibited_actions: true,
  };
  const issues = [];
  let testOutput = "";

  // 1. Target Test Verification Gate
  if (targetTestFile && typeof targetTestFile === "string" && targetTestFile.trim() !== "") {
    const normalizedTestFile = path.normalize(targetTestFile.trim());
    const resolvedTestFile = path.resolve(absoluteWorktreePath, normalizedTestFile);
    let fileExists = false;
    try {
      await fs.stat(resolvedTestFile);
      fileExists = true;
    } catch {
      fileExists = false;
    }

    if (!fileExists) {
      invariantChecks.target_test = false;
      issues.push(`Target test file "${targetTestFile}" does not exist in worktree`);
    } else {
      try {
        const testEnv = {};
        for (const [key, value] of Object.entries(process.env)) {
          if (!key.startsWith("NODE_TEST_")) {
            testEnv[key] = value;
          }
        }

        const { stdout, stderr } = await execFileAsync(
          process.execPath,
          ["--test", resolvedTestFile],
          {
            cwd: absoluteWorktreePath,
            env: testEnv,
            windowsHide: true,
            maxBuffer: 10 * 1024 * 1024,
            timeout: 45000,
          }
        );
        testOutput = (stdout + (stderr ? "\n" + stderr : "")).trim();

        // Inspect test output: if stdout/stderr contains test failure indicators
        const hasFailure =
          /not ok\s+\d+/i.test(testOutput) ||
          /#\s*fail\s+[1-9]\d*/i.test(testOutput) ||
          /failureType/i.test(testOutput) ||
          /AssertionError/i.test(testOutput) ||
          /Error:/i.test(testOutput);

        if (hasFailure) {
          invariantChecks.target_test = false;
          issues.push(`Target test reported failures in output: ${targetTestFile}`);
        } else {
          invariantChecks.target_test = true;
        }
      } catch (testError) {
        invariantChecks.target_test = false;
        testOutput = (
          (testError.stdout || "") +
          "\n" +
          (testError.stderr || "") +
          "\n" +
          testError.message
        ).trim();
        issues.push(`Target test execution failed for "${targetTestFile}"`);
      }
    }
  }

  // 2. Responsibility Invariant: owned_files Check
  const baseRef = (ws.metadata?.base_ref && ws.metadata.base_ref !== "HEAD") ? ws.metadata.base_ref : "main";
  const modifiedFiles = await getModifiedFilesInWorktree(absoluteWorktreePath, projectPath, baseRef);

  if (ownedFiles.length > 0) {
    const unowned = modifiedFiles.filter((f) => !isFileOwned(f, ownedFiles));
    if (unowned.length > 0) {
      invariantChecks.owned_files = false;
      for (const file of unowned) {
        issues.push(
          `Modified file "${file}" violates responsibility invariant owned_files scope: [${ownedFiles.join(", ")}]`
        );
      }
    }
  }

  // 3. Responsibility Invariant: prohibited_actions & test storm checks
  for (const action of prohibitedActions) {
    const actLower = String(action).toLowerCase().trim();
    if (actLower.includes("modify production code") && ws.procedure_type === "PLANNING") {
      const prodMods = modifiedFiles.filter(
        (f) => !f.endsWith(".md") && !f.startsWith(".agents/")
      );
      if (prodMods.length > 0) {
        invariantChecks.prohibited_actions = false;
        issues.push(
          `Prohibited action "${action}" violated: planning workspace modified production files: [${prodMods.join(", ")}]`
        );
      }
    } else if (actLower.includes("modify out of bounds")) {
      if (!invariantChecks.owned_files) {
        invariantChecks.prohibited_actions = false;
        issues.push(`Prohibited action "${action}" violated: out-of-bounds files were modified`);
      }
    }
  }

  // Check potential secret leaks in modified text files
  for (const relFile of modifiedFiles) {
    try {
      const fullPath = path.resolve(absoluteWorktreePath, relFile);
      const st = await fs.stat(fullPath);
      if (st.isFile() && st.size < 512 * 1024) {
        const content = await fs.readFile(fullPath, "utf8");
        const secretPatterns = [
          /AKIA[0-9A-Z]{16}/,
          /-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/,
          /(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{36}/,
        ];
        for (const pattern of secretPatterns) {
          if (pattern.test(content)) {
            invariantChecks.prohibited_actions = false;
            issues.push(`Potential credential/secret detected in modified file "${relFile}"`);
            break;
          }
        }
      }
    } catch {}
  }

  const verified =
    invariantChecks.target_test &&
    invariantChecks.owned_files &&
    invariantChecks.prohibited_actions &&
    issues.length === 0;

  const newStatus = verified ? "verified" : "failed";
  const now = new Date().toISOString();

  // Update workspaces.json
  const existingWorkspaces = await loadWorkspaces({ project_path: projectPath });
  const updatedWorkspaces = existingWorkspaces.map((w) => {
    if (w.workspace_id === ws.workspace_id || w.metadata?.task_id === ws.workspace_id) {
      return {
        ...w,
        status: newStatus,
        metadata: {
          ...(w.metadata || {}),
          last_verified_at: now,
          verification_issues: issues,
          invariant_checks: invariantChecks,
        },
      };
    }
    return w;
  });
  await saveWorkspaces({ project_path: projectPath, workspaces: updatedWorkspaces });

  // Update merge-queue.json
  const queue = await loadMergeQueue({ project_path: projectPath });
  const updatedQueue = queue.map((q) => {
    if (q.workspace_id === ws.workspace_id || q.task_id === ws.workspace_id) {
      return {
        ...q,
        status: newStatus,
        verified_at: verified ? now : null,
        reason: verified ? null : issues.join("; "),
      };
    }
    return q;
  });
  await saveMergeQueue({ project_path: projectPath, queue: updatedQueue });

  return {
    verified,
    workspace_id: ws.workspace_id,
    test_output: testOutput,
    invariant_checks: invariantChecks,
    issues,
  };
}

/**
 * Verifies 1:1 target test and responsibility invariants inside isolated worktree.
 */
async function verifyWorkspace(workspaceIdOrOptions, maybeOptions = {}) {
  let options = {};
  let workspaceId;

  if (typeof workspaceIdOrOptions === "object" && workspaceIdOrOptions !== null) {
    options = workspaceIdOrOptions;
    workspaceId = resolveWorkspaceId(options);
  } else {
    workspaceId = resolveWorkspaceId(workspaceIdOrOptions);
    options = maybeOptions;
  }

  if (!workspaceId) {
    throw new Error("workspace_id is required to verify workspace");
  }

  const projectPath = path.resolve(options.project_path || options.projectPath || process.cwd());

  return await withMergerLock(projectPath, async () => {
    return await _verifyWorkspaceInternal(workspaceId, options, projectPath);
  });
}

/**
 * Internal discard logic without acquiring mutex lock.
 */
async function _discardWorkspaceInternal(workspaceId, options, projectPath) {
  const reason = options.reason || "Verification failure";
  const now = new Date().toISOString();

  // 1. Update stored workspaces.json to discarded
  const existingWorkspaces = await loadWorkspaces({ project_path: projectPath });
  const updatedWorkspaces = existingWorkspaces.map((w) => {
    if (w.workspace_id === workspaceId || w.metadata?.task_id === workspaceId) {
      return {
        ...w,
        status: "discarded",
        completed_at: now,
        metadata: {
          ...(w.metadata || {}),
          discard_reason: reason,
        },
      };
    }
    return w;
  });
  await saveWorkspaces({ project_path: projectPath, workspaces: updatedWorkspaces });

  // 2. Update merge-queue.json
  const queue = await loadMergeQueue({ project_path: projectPath });
  const updatedQueue = queue.map((q) => {
    if (q.workspace_id === workspaceId || q.task_id === workspaceId) {
      return {
        ...q,
        status: "discarded",
        discarded_at: now,
        reason,
      };
    }
    return q;
  });
  await saveMergeQueue({ project_path: projectPath, queue: updatedQueue });

  // 3. Remove Git worktree and delete branch safely without touching root main
  await pruneProcedureWorkspace(workspaceId, {
    project_path: projectPath,
    delete_branch: true,
  });

  // 4. Ensure status in workspaces.json is "discarded"
  const workspacesAfterPrune = await loadWorkspaces({ project_path: projectPath });
  const finalWorkspaces = workspacesAfterPrune.map((w) => {
    if (w.workspace_id === workspaceId || w.metadata?.task_id === workspaceId) {
      return {
        ...w,
        status: "discarded",
        completed_at: now,
        metadata: {
          ...(w.metadata || {}),
          discard_reason: reason,
        },
      };
    }
    return w;
  });
  await saveWorkspaces({ project_path: projectPath, workspaces: finalWorkspaces });

  return {
    discarded: true,
    workspace_id: workspaceId,
    reason,
  };
}

/**
 * Discards a failed or rejected procedure workspace branch cleanly.
 */
async function discardWorkspace(workspaceIdOrOptions, maybeOptions = {}) {
  let options = {};
  let workspaceId;

  if (typeof workspaceIdOrOptions === "object" && workspaceIdOrOptions !== null) {
    options = workspaceIdOrOptions;
    workspaceId = resolveWorkspaceId(options);
  } else {
    workspaceId = resolveWorkspaceId(workspaceIdOrOptions);
    options = maybeOptions;
  }

  if (!workspaceId) {
    throw new Error("workspace_id is required to discard workspace");
  }

  const projectPath = path.resolve(options.project_path || options.projectPath || process.cwd());

  return await withMergerLock(projectPath, async () => {
    return await _discardWorkspaceInternal(workspaceId, options, projectPath);
  });
}

/**
 * Internal merge logic.
 */
async function _mergeWorkspaceInternal(workspaceId, options, projectPath) {
  const force = options.force === true;
  const ws = await getProcedureWorkspace(workspaceId, { project_path: projectPath });
  if (!ws) {
    throw new Error(`Procedure workspace "${workspaceId}" not found`);
  }

  // 1. Check dependency lineage
  const queue = await loadMergeQueue({ project_path: projectPath });
  const queueEntry = queue.find(
    (q) => q.workspace_id === ws.workspace_id || q.task_id === ws.workspace_id
  );

  const declaredDependencies = queueEntry?.dependencies || ws.metadata?.dependencies || [];
  if (declaredDependencies.length > 0) {
    const allWorkspaces = await loadWorkspaces({ project_path: projectPath });
    for (const depId of declaredDependencies) {
      const depWs = allWorkspaces.find(
        (w) => w.workspace_id === depId || w.metadata?.task_id === depId
      );
      const depQueue = queue.find((q) => q.workspace_id === depId || q.task_id === depId);
      const depStatus = depWs?.status || depQueue?.status;

      if (depStatus !== "merged") {
        const err = new Error(
          `Cannot merge workspace "${ws.workspace_id}": dependency "${depId}" is not merged yet (current status: "${depStatus || "unknown"}")`
        );
        err.code = "DEPENDENCY_NOT_MERGED";
        err.dependency = depId;
        err.dependencyStatus = depStatus;
        throw err;
      }
    }
  }

  // 2. Verification Gate
  if (ws.status !== "verified" && !force) {
    const verification = await _verifyWorkspaceInternal(ws.workspace_id, options, projectPath);
    if (!verification.verified) {
      // Discard failed branch and reject merge
      await _discardWorkspaceInternal(
        ws.workspace_id,
        {
          reason: `Verification failed before merge: ${verification.issues.join("; ")}`,
        },
        projectPath
      );

      const mergeErr = new Error(
        `Merge rejected: workspace "${ws.workspace_id}" failed verification: ${verification.issues.join(", ")}`
      );
      mergeErr.code = "VERIFICATION_FAILED";
      mergeErr.verificationResult = verification;
      throw mergeErr;
    }
  }

  // 3. Atomic Fast-forward or Rebase Merge into main
  const branchName = ws.git_branch || `worktree/${ws.workspace_id}`;
  const relativeWorktreePath = ws.git_worktree_path || path.join(WORKSPACES_DIR_NAME, ws.workspace_id);
  const absoluteWorktreePath = path.resolve(projectPath, relativeWorktreePath);

  // Get current root branch name
  const currentBranchRes = await runGit(["rev-parse", "--abbrev-ref", "HEAD"], projectPath);
  const mainBranch = currentBranchRes.stdout || "main";

  try {
    await runGit(["merge", "--ff-only", branchName], projectPath);
  } catch (ffErr) {
    // If direct ff-only fails because worktree branch base is behind main HEAD, rebase branch onto main
    try {
      await runGit(["rebase", mainBranch], absoluteWorktreePath);
      await runGit(["merge", "--ff-only", branchName], projectPath);
    } catch (rebaseErr) {
      // Check if rebase conflicts are solely in mounted metadata / skills directories
      const unmergedRes = await runGit(["diff", "--name-only", "--diff-filter=U"], absoluteWorktreePath, { ignoreError: true });
      const unmergedFiles = (unmergedRes.stdout || "")
        .split("\n")
        .map((l) => l.trim().replace(/\\/g, "/"))
        .filter(Boolean);

      const isOnlyMetadataConflict =
        unmergedFiles.length > 0 &&
        unmergedFiles.every(
          (f) =>
            f.startsWith(".agents/skills") ||
            f.startsWith(".claude/skills") ||
            f.startsWith(".skills-platform") ||
            f.startsWith(".workspaces")
        );

      if (isOnlyMetadataConflict) {
        try {
          for (const f of unmergedFiles) {
            await runGit(["checkout", "--theirs", f], absoluteWorktreePath, { ignoreError: true });
            await runGit(["add", f], absoluteWorktreePath, { ignoreError: true });
          }
          await runGit(["-c", "core.editor=true", "rebase", "--continue"], absoluteWorktreePath);
          await runGit(["merge", "--ff-only", branchName], projectPath);
        } catch (continueErr) {
          await runGit(["rebase", "--abort"], absoluteWorktreePath, { ignoreError: true });
          const msg = `Fast-forward / rebase merge failed for branch "${branchName}" into "${mainBranch}": ${continueErr.message}`;
          const err = new Error(msg);
          err.code = "MERGE_FAILED";
          err.cause = continueErr;
          throw err;
        }
      } else {
        await runGit(["rebase", "--abort"], absoluteWorktreePath, { ignoreError: true });
        const msg = `Fast-forward / rebase merge failed for branch "${branchName}" into "${mainBranch}": ${rebaseErr.message}`;
        const err = new Error(msg);
        err.code = "MERGE_FAILED";
        err.cause = rebaseErr;
        throw err;
      }
    }
  }

  // 4. Fetch HEAD commit hash
  const headHashRes = await runGit(["rev-parse", "HEAD"], projectPath);
  const commitHash = headHashRes.stdout;
  const completedAt = new Date().toISOString();

  // 5. Update workspace status to merged in workspaces.json
  const existingWorkspaces = await loadWorkspaces({ project_path: projectPath });
  const updatedWorkspaces = existingWorkspaces.map((w) => {
    if (w.workspace_id === ws.workspace_id || w.metadata?.task_id === ws.workspace_id) {
      return {
        ...w,
        status: "merged",
        completed_at: completedAt,
        metadata: {
          ...(w.metadata || {}),
          commit_hash: commitHash,
        },
      };
    }
    return w;
  });
  await saveWorkspaces({ project_path: projectPath, workspaces: updatedWorkspaces });

  // 6. Update merge-queue.json
  const currentQueue = await loadMergeQueue({ project_path: projectPath });
  const updatedQueue = currentQueue.map((q) => {
    if (q.workspace_id === ws.workspace_id || q.task_id === ws.workspace_id) {
      return {
        ...q,
        status: "merged",
        merged_at: completedAt,
        commit_hash: commitHash,
      };
    }
    return q;
  });
  await saveMergeQueue({ project_path: projectPath, queue: updatedQueue });

  // 7. Prune worktree directory while retaining branch history
  await pruneProcedureWorkspace(ws.workspace_id, {
    project_path: projectPath,
    delete_branch: false,
  });

  // 8. Ensure status in workspaces.json is "merged"
  const workspacesAfterPrune = await loadWorkspaces({ project_path: projectPath });
  const finalWorkspaces = workspacesAfterPrune.map((w) => {
    if (w.workspace_id === ws.workspace_id || w.metadata?.task_id === ws.workspace_id) {
      return {
        ...w,
        status: "merged",
        completed_at: completedAt,
        metadata: {
          ...(w.metadata || {}),
          commit_hash: commitHash,
        },
      };
    }
    return w;
  });
  await saveWorkspaces({ project_path: projectPath, workspaces: finalWorkspaces });

  return {
    merged: true,
    workspace_id: ws.workspace_id,
    commit_hash: commitHash,
    status: "merged",
  };
}

/**
 * Merges a verified procedure workspace into main via atomic fast-forward.
 */
async function mergeWorkspace(workspaceIdOrOptions, maybeOptions = {}) {
  let options = {};
  let workspaceId;

  if (typeof workspaceIdOrOptions === "object" && workspaceIdOrOptions !== null) {
    options = workspaceIdOrOptions;
    workspaceId = resolveWorkspaceId(options);
  } else {
    workspaceId = resolveWorkspaceId(workspaceIdOrOptions);
    options = maybeOptions;
  }

  if (!workspaceId) {
    throw new Error("workspace_id is required to merge workspace");
  }

  const projectPath = path.resolve(options.project_path || options.projectPath || process.cwd());

  return await withMergerLock(projectPath, async () => {
    return await _mergeWorkspaceInternal(workspaceId, options, projectPath);
  });
}

/**
 * Returns full merge queue status, current item, and grouped lists.
 */
async function getQueueStatus(options = {}) {
  const projectPath = path.resolve(options.project_path || options.projectPath || process.cwd());
  const queue = await loadMergeQueue({ project_path: projectPath });
  const workspaces = await loadWorkspaces({ project_path: projectPath });

  const enrichedQueue = queue.map((entry, index) => {
    const ws = workspaces.find(
      (w) => w.workspace_id === entry.workspace_id || w.metadata?.task_id === entry.workspace_id
    );
    const status = entry.status || ws?.status || "pending";
    return {
      workspace_id: entry.workspace_id,
      task_id: entry.task_id || ws?.metadata?.task_id || entry.workspace_id,
      dependencies: entry.dependencies || ws?.metadata?.dependencies || [],
      status,
      position: entry.position ?? index + 1,
      enqueued_at: entry.enqueued_at,
      verified_at: entry.verified_at || ws?.metadata?.last_verified_at || null,
      merged_at: entry.merged_at || ws?.completed_at || null,
      discarded_at: entry.discarded_at || null,
      commit_hash: entry.commit_hash || ws?.metadata?.commit_hash || null,
      reason: entry.reason || ws?.metadata?.discard_reason || null,
      procedure_type: ws?.procedure_type || null,
    };
  });

  const pending = enrichedQueue.filter((i) => i.status === "pending");
  const in_verification = enrichedQueue.filter((i) => i.status === "in_verification");
  const verified = enrichedQueue.filter((i) => i.status === "verified");
  const merged = enrichedQueue.filter((i) => i.status === "merged");
  const failed = enrichedQueue.filter((i) => i.status === "failed");
  const discarded = enrichedQueue.filter((i) => i.status === "discarded");

  const mergedIds = new Set(merged.map((m) => m.workspace_id));
  let current = in_verification[0] || null;
  if (!current) {
    current =
      pending
        .concat(verified)
        .find((item) => item.dependencies.every((d) => mergedIds.has(d))) || null;
  }

  return {
    queue: enrichedQueue,
    current,
    pending,
    in_verification,
    verified,
    merged,
    failed,
    discarded,
  };
}

/**
 * Iterates through queue in topological dependency order, verifying and merging ready workspaces.
 */
async function processQueue(options = {}) {
  const projectPath = path.resolve(options.project_path || options.projectPath || process.cwd());
  const processed = [];
  const failedIds = new Set();

  return await withMergerLock(projectPath, async () => {
    while (true) {
      const status = await getQueueStatus({ project_path: projectPath });
      const mergedIds = new Set(status.merged.map((m) => m.workspace_id));
      const failedOrDiscardedIds = new Set([
        ...status.failed.map((f) => f.workspace_id),
        ...status.discarded.map((d) => d.workspace_id),
        ...failedIds,
      ]);

      const candidate = status.queue.find((item) => {
        if (failedIds.has(item.workspace_id)) {
          return false;
        }
        if (item.status !== "pending" && item.status !== "verified") {
          return false;
        }
        const blockedByFailed = item.dependencies.some((d) => failedOrDiscardedIds.has(d));
        if (blockedByFailed) {
          return false;
        }
        return item.dependencies.every((d) => mergedIds.has(d));
      });

      if (!candidate) {
        break;
      }

      try {
        const mergeRes = await _mergeWorkspaceInternal(candidate.workspace_id, options, projectPath);
        processed.push({
          workspace_id: candidate.workspace_id,
          success: true,
          merged: true,
          commit_hash: mergeRes.commit_hash,
        });
      } catch (err) {
        failedIds.add(candidate.workspace_id);
        processed.push({
          workspace_id: candidate.workspace_id,
          success: false,
          merged: false,
          error: err.message,
        });
      }
    }

    const finalStatus = await getQueueStatus({ project_path: projectPath });
    return {
      processed,
      queue: finalStatus.queue,
      merged: finalStatus.merged,
      failed: finalStatus.failed,
      discarded: finalStatus.discarded,
      pending: finalStatus.pending,
    };
  });
}

/**
 * SequentialMerger Class wrapper around the functional engine.
 */
class SequentialMerger {
  constructor(options = {}) {
    this.project_path = path.resolve(
      options.project_path || options.projectPath || process.cwd()
    );
    this.workspace_manager = options.workspace_manager || options.workspaceManager || null;
  }

  async enqueue(workspaceIdOrOptions, maybeOptions = {}) {
    return await enqueueWorkspace(workspaceIdOrOptions, {
      ...maybeOptions,
      project_path: this.project_path,
    });
  }

  async enqueueWorkspace(options = {}) {
    return await enqueueWorkspace({
      ...options,
      project_path: options.project_path || this.project_path,
    });
  }

  async verifyWorkspace(workspaceIdOrOptions, options = {}) {
    return await verifyWorkspace(workspaceIdOrOptions, {
      ...options,
      project_path: options.project_path || this.project_path,
    });
  }

  async mergeWorkspace(workspaceIdOrOptions, options = {}) {
    return await mergeWorkspace(workspaceIdOrOptions, {
      ...options,
      project_path: options.project_path || this.project_path,
    });
  }

  async mergeNext(options = {}) {
    const status = await getQueueStatus({ project_path: this.project_path });
    const mergedIds = new Set(status.merged.map((m) => m.workspace_id));
    const failedOrDiscardedIds = new Set([
      ...status.failed.map((f) => f.workspace_id),
      ...status.discarded.map((d) => d.workspace_id),
    ]);

    const candidate = status.queue.find((item) => {
      if (item.status !== "pending" && item.status !== "verified") {
        return false;
      }
      const blockedByFailed = item.dependencies.some((d) => failedOrDiscardedIds.has(d));
      if (blockedByFailed) {
        return false;
      }
      return item.dependencies.every((d) => mergedIds.has(d));
    });

    if (!candidate) {
      return {
        merged: false,
        workspace_id: null,
        message: "No workspaces ready to merge",
      };
    }

    return await this.mergeWorkspace(candidate.workspace_id, options);
  }

  async discardWorkspace(workspaceIdOrOptions, reasonOrOptions = {}) {
    let reason = "Verification failure";
    let opts = {};
    if (typeof reasonOrOptions === "string") {
      reason = reasonOrOptions;
    } else if (typeof reasonOrOptions === "object" && reasonOrOptions !== null) {
      reason = reasonOrOptions.reason || reason;
      opts = reasonOrOptions;
    }
    return await discardWorkspace(workspaceIdOrOptions, {
      ...opts,
      reason,
      project_path: opts.project_path || this.project_path,
    });
  }

  async getQueueStatus(options = {}) {
    return await getQueueStatus({
      ...options,
      project_path: options.project_path || this.project_path,
    });
  }

  async processQueue(options = {}) {
    return await processQueue({
      ...options,
      project_path: options.project_path || this.project_path,
    });
  }
}

module.exports = {
  MERGE_QUEUE_STORAGE_RELATIVE,
  loadMergeQueue,
  saveMergeQueue,
  enqueueWorkspace,
  verifyWorkspace,
  discardWorkspace,
  mergeWorkspace,
  getQueueStatus,
  processQueue,
  SequentialMerger,
};
