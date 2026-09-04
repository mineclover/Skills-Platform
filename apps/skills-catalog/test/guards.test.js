const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { pathToFileURL } = require("node:url");

// Import guard modules
const {
  evaluateSecretLeakGuard,
  SECRET_RULES,
} = require("../../../.skills-platform/hooks/guards/secret-leak-guard.js");

const {
  evaluateDestructiveCommandBlocker,
  DESTRUCTIVE_RULES,
} = require("../../../.skills-platform/hooks/guards/destructive-command-blocker.js");

const {
  evaluateContextBudgetGuard,
} = require("../../../.skills-platform/hooks/guards/context-budget-guard.js");

const {
  evaluateScopeBoundaryEnforcer,
  normalizePath,
  matchPattern,
} = require("../../../.skills-platform/hooks/guards/scope-boundary-enforcer.js");

const {
  evaluateSubagentRecursionLimiter,
} = require("../../../.skills-platform/hooks/guards/subagent-recursion-limiter.js");

const GUARDS_DIR = path.resolve(__dirname, "../../../.skills-platform/hooks/guards");

function runGuardSubprocess(scriptName, payload, extraEnv = {}) {
  const scriptPath = path.resolve(GUARDS_DIR, scriptName);
  const result = spawnSync(process.execPath, [scriptPath], {
    env: {
      ...process.env,
      HOOK_EVENT: "pre_tool_use",
      HOOK_PAYLOAD: JSON.stringify(payload),
      SKILLS_PLATFORM_DISABLE_TELEMETRY: "1",
      ...extraEnv,
    },
    encoding: "utf8",
  });

  assert.equal(result.status, 0, `Script ${scriptName} exited with error: ${result.stderr}`);
  const stdout = result.stdout.trim();
  return JSON.parse(stdout);
}

// ============================================================================
// 1. SECRET LEAK GUARD TESTS
// ============================================================================

test("Secret Leak Guard: detects and blocks AWS Access Key ID", () => {
  const payload = {
    CommandLine: "export AWS_KEY=AKIAIOSFODNN7EXAMPLE",
  };
  const result = evaluateSecretLeakGuard(payload);
  assert.equal(result.allow, false);
  assert.equal(result.violation_type, "secret_leak");
  assert.equal(result.matched_pattern, "AWS_ACCESS_KEY_ID");
  assert.ok(result.reason.includes("AWS Access Key ID"));
  assert.ok(result.self_correct_hint);
});

test("Secret Leak Guard: detects and blocks AWS Secret Access Key", () => {
  const payload = {
    CodeContent: 'const secret = { aws_secret_access_key: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY" };',
  };
  const result = evaluateSecretLeakGuard(payload);
  assert.equal(result.allow, false);
  assert.equal(result.violation_type, "secret_leak");
  assert.equal(result.matched_pattern, "AWS_SECRET_ACCESS_KEY");
});

test("Secret Leak Guard: detects and blocks OpenAI API Keys", () => {
  const standardKey = {
    content: "Authorization: Bearer sk-1234567890abcdefghijklmnopqrstuvwxyz",
  };
  const standardResult = evaluateSecretLeakGuard(standardKey);
  assert.equal(standardResult.allow, false);
  assert.equal(standardResult.violation_type, "secret_leak");

  const projectKey = {
    content: "sk-proj-abc12345678901234567890abcdef",
  };
  const projectResult = evaluateSecretLeakGuard(projectKey);
  assert.equal(projectResult.allow, false);
  assert.equal(projectResult.violation_type, "secret_leak");
  assert.equal(projectResult.matched_pattern, "OPENAI_API_KEY");
});

test("Secret Leak Guard: detects and blocks Anthropic API Keys", () => {
  const payload = {
    CommandLine: "curl -H 'x-api-key: sk-ant-api03-abcdef1234567890abcdef1234567890' https://api.anthropic.com",
  };
  const result = evaluateSecretLeakGuard(payload);
  assert.equal(result.allow, false);
  assert.equal(result.violation_type, "secret_leak");
  assert.equal(result.matched_pattern, "ANTHROPIC_API_KEY");
});

test("Secret Leak Guard: detects and blocks GitHub Tokens", () => {
  const ghpPayload = {
    token: "ghp_123456789012345678901234567890123456",
  };
  const ghpResult = evaluateSecretLeakGuard(ghpPayload);
  assert.equal(ghpResult.allow, false);
  assert.equal(ghpResult.matched_pattern, "GITHUB_TOKEN");

  const patPayload = {
    token: "github_pat_11ABCD1234_abcdefghijklmnopqrstuvwxyz",
  };
  const patResult = evaluateSecretLeakGuard(patPayload);
  assert.equal(patResult.allow, false);
  assert.equal(patResult.matched_pattern, "GITHUB_TOKEN");
});

test("Secret Leak Guard: detects and blocks Google / Gemini API Keys (38-45 chars)", () => {
  const key38 = {
    apiKey: "AIzaSyD-1234567890abcdefghijklmnopqrstu",
  };
  const res38 = evaluateSecretLeakGuard(key38);
  assert.equal(res38.allow, false);
  assert.equal(res38.violation_type, "secret_leak");
  assert.equal(res38.matched_pattern, "GOOGLE_API_KEY");

  const key39 = {
    url: "https://api.example.com/v1?key=AIzaSyD12345678901234567890123456789012",
  };
  const res39 = evaluateSecretLeakGuard(key39);
  assert.equal(res39.allow, false);
  assert.equal(res39.matched_pattern, "GOOGLE_API_KEY");
});

test("Secret Leak Guard: detects and blocks Private Cryptographic Keys", () => {
  const payload = {
    cert: "-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA0...\n-----END RSA PRIVATE KEY-----",
  };
  const result = evaluateSecretLeakGuard(payload);
  assert.equal(result.allow, false);
  assert.equal(result.violation_type, "secret_leak");
  assert.equal(result.matched_pattern, "PRIVATE_KEY");
});

test("Secret Leak Guard: detects and blocks Bearer Headers", () => {
  const payload = {
    headers: {
      Authorization: "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.sig1234567890",
    },
  };
  const result = evaluateSecretLeakGuard(payload);
  assert.equal(result.allow, false);
  assert.equal(result.violation_type, "secret_leak");
  assert.equal(result.matched_pattern, "BEARER_AUTH_HEADER");
});

test("Secret Leak Guard: detects and blocks .env file dump commands", () => {
  const catEnv = { CommandLine: "cat .env" };
  assert.equal(evaluateSecretLeakGuard(catEnv).allow, false);

  const typeEnv = { CommandLine: "type ./.env" };
  assert.equal(evaluateSecretLeakGuard(typeEnv).allow, false);

  const printEnv = { CommandLine: "printenv" };
  assert.equal(evaluateSecretLeakGuard(printEnv).allow, false);

  const exportP = { CommandLine: "export -p" };
  assert.equal(evaluateSecretLeakGuard(exportP).allow, false);
});

test("Secret Leak Guard: allows clean payloads and benign code writes containing printenv / env text", () => {
  const cleanPayload = {
    CommandLine: "git status",
    CodeContent: "const apiKey = process.env.OPENAI_API_KEY;\nconsole.log('Safe');",
    TargetFile: "src/index.js",
  };
  const result = evaluateSecretLeakGuard(cleanPayload);
  assert.equal(result.allow, true);

  const docWrite = {
    TargetFile: "docs/environment.md",
    CodeContent: "# Environment Setup\nRun `printenv` or `cat .env` to inspect variables.",
  };
  const docResult = evaluateSecretLeakGuard(docWrite);
  assert.equal(docResult.allow, true);
});

test("Secret Leak Guard: executes via subprocess CLI", () => {
  const violationOutput = runGuardSubprocess("secret-leak-guard.js", {
    CommandLine: "export TOKEN=AKIA1234567890ABCDEF",
  });
  assert.equal(violationOutput.allow, false);
  assert.equal(violationOutput.violation_type, "secret_leak");

  const cleanOutput = runGuardSubprocess("secret-leak-guard.js", {
    CommandLine: "npm test",
  });
  assert.equal(cleanOutput.allow, true);
});

// ============================================================================
// 2. DESTRUCTIVE COMMAND BLOCKER TESTS
// ============================================================================

test("Destructive Command Blocker: blocks recursive root & system deletions", () => {
  const rmRoot = { CommandLine: "rm -rf /" };
  assert.equal(evaluateDestructiveCommandBlocker(rmRoot).allow, false);
  assert.equal(evaluateDestructiveCommandBlocker(rmRoot).violation_type, "destructive_command");
  assert.equal(evaluateDestructiveCommandBlocker(rmRoot).matched_pattern, "ROOT_FILESYSTEM_DELETION");

  // Split flags and long options
  const splitFlags = [
    "rm -r -f /",
    "rm -f -r /",
    "rm -r /",
    "rm -R /",
    "rm --recursive /",
    "rm --recursive --force /",
    "rm -rf --no-preserve-root /",
    "rm / -rf",
  ];
  for (const cmd of splitFlags) {
    assert.equal(evaluateDestructiveCommandBlocker({ CommandLine: cmd }).allow, false, `Failed to block: ${cmd}`);
  }

  const rmHome = { CommandLine: "rm -rf ~" };
  assert.equal(evaluateDestructiveCommandBlocker(rmHome).allow, false);

  const rmWildcard = { CommandLine: "rm -fr *" };
  assert.equal(evaluateDestructiveCommandBlocker(rmWildcard).allow, false);

  const delWin = { CommandLine: "del /s /q c:\\" };
  assert.equal(evaluateDestructiveCommandBlocker(delWin).allow, false);

  const delWild = { CommandLine: "del /f /s /q *" };
  assert.equal(evaluateDestructiveCommandBlocker(delWild).allow, false);

  const rmdirWin = { CommandLine: "rmdir /s /q c:\\" };
  assert.equal(evaluateDestructiveCommandBlocker(rmdirWin).allow, false);

  const rdWin = { CommandLine: "rd /s /q c:\\" };
  assert.equal(evaluateDestructiveCommandBlocker(rdWin).allow, false);

  // PowerShell Remove-Item and ri with flexible parameter ordering
  const psCases = [
    "Remove-Item -Recurse C:\\",
    "Remove-Item / -Recurse -Force",
    "Remove-Item -Recurse -Path C:\\ -Force",
    "Remove-Item -Path C:\\ -Recurse",
    "Remove-Item C:\\ -Recurse",
    "ri / -Recurse",
    "ri C:\\ -Recurse",
    "ri -Recurse C:\\",
  ];
  for (const cmd of psCases) {
    assert.equal(evaluateDestructiveCommandBlocker({ CommandLine: cmd }).allow, false, `Failed to block PowerShell: ${cmd}`);
  }
});

test("Destructive Command Blocker: blocks catastrophic git operations", () => {
  const gitHard = { CommandLine: "git reset --hard HEAD~1" };
  const resGitHard = evaluateDestructiveCommandBlocker(gitHard);
  assert.equal(resGitHard.allow, false);
  assert.equal(resGitHard.matched_pattern, "GIT_RESET_HARD");

  const gitCleanFd = { CommandLine: "git clean -fd" };
  assert.equal(evaluateDestructiveCommandBlocker(gitCleanFd).allow, false);

  const gitCleanForce = { CommandLine: "git clean --force" };
  assert.equal(evaluateDestructiveCommandBlocker(gitCleanForce).allow, false);

  const gitCleanSplit = { CommandLine: "git clean -f -d" };
  assert.equal(evaluateDestructiveCommandBlocker(gitCleanSplit).allow, false);

  const gitForcePush = { CommandLine: "git push origin main --force" };
  assert.equal(evaluateDestructiveCommandBlocker(gitForcePush).allow, false);

  const gitBranchDel = { CommandLine: "git branch -D main" };
  assert.equal(evaluateDestructiveCommandBlocker(gitBranchDel).allow, false);
});

test("Destructive Command Blocker: blocks database drop and truncate", () => {
  const dropDb = { CommandLine: "psql -c 'DROP DATABASE production;'" };
  assert.equal(evaluateDestructiveCommandBlocker(dropDb).allow, false);
  assert.equal(evaluateDestructiveCommandBlocker(dropDb).matched_pattern, "DB_DROP_OPERATION");

  const truncateTable = { command: "TRUNCATE TABLE users" };
  assert.equal(evaluateDestructiveCommandBlocker(truncateTable).allow, false);
  assert.equal(evaluateDestructiveCommandBlocker(truncateTable).matched_pattern, "DB_TRUNCATE_OPERATION");
});

test("Destructive Command Blocker: blocks disk format and raw device overwrites", () => {
  const formatCmd = { CommandLine: "format c: /fs:NTFS" };
  assert.equal(evaluateDestructiveCommandBlocker(formatCmd).allow, false);
  assert.equal(evaluateDestructiveCommandBlocker(formatCmd).matched_pattern, "DISK_FORMAT");

  const fdiskCmd = { CommandLine: "fdisk /dev/sda" };
  assert.equal(evaluateDestructiveCommandBlocker(fdiskCmd).allow, false);

  const ddCmd = { CommandLine: "dd if=/dev/zero of=/dev/sda bs=1M" };
  assert.equal(evaluateDestructiveCommandBlocker(ddCmd).allow, false);
  assert.equal(evaluateDestructiveCommandBlocker(ddCmd).matched_pattern, "RAW_DEVICE_OVERWRITE");
});

test("Destructive Command Blocker: blocks fork bombs and shutdowns", () => {
  const forkBomb = { CommandLine: ":(){ :|:& };:" };
  assert.equal(evaluateDestructiveCommandBlocker(forkBomb).allow, false);

  const shutdownCmd = { CommandLine: "shutdown -h now" };
  assert.equal(evaluateDestructiveCommandBlocker(shutdownCmd).allow, false);
});

test("Destructive Command Blocker: allows safe workspace commands", () => {
  const safeCommands = [
    { CommandLine: "npm test" },
    { CommandLine: "git commit -m 'feat: add guard'" },
    { CommandLine: "git checkout -b feature/test" },
    { CommandLine: "node src/server.js" },
    { CommandLine: "rmdir temp_dir" },
  ];

  for (const cmd of safeCommands) {
    const result = evaluateDestructiveCommandBlocker(cmd);
    assert.equal(result.allow, true, `Command was unexpectedly blocked: ${cmd.CommandLine}`);
  }
});

test("Destructive Command Blocker: executes via subprocess CLI", () => {
  const violation = runGuardSubprocess("destructive-command-blocker.js", {
    CommandLine: "git reset --hard",
  });
  assert.equal(violation.allow, false);
  assert.equal(violation.violation_type, "destructive_command");

  const pass = runGuardSubprocess("destructive-command-blocker.js", {
    CommandLine: "git status",
  });
  assert.equal(pass.allow, true);
});

// ============================================================================
// 3. CONTEXT BUDGET GUARD TESTS
// ============================================================================

test("Context Budget Guard: blocks oversized payloads (> 320 KB / 320k chars)", () => {
  const oversizedText = "x".repeat(330000); // 330 KB
  const payload = {
    TargetFile: "large.js",
    CodeContent: oversizedText,
  };

  const result = evaluateContextBudgetGuard(payload);
  assert.equal(result.allow, false);
  assert.equal(result.violation_type, "context_budget_exceeded");
  assert.ok(result.payload_size_kb >= 320);
  assert.equal(result.threshold_size_kb, 320);
  assert.ok(result.reason.includes("Context budget exceeded"));
  assert.ok(result.self_correct_hint);
});

test("Context Budget Guard: allows payloads within the 80k token density budget", () => {
  const normalText = "function test() { return 42; }\n".repeat(200); // ~6 KB
  const payload = {
    TargetFile: "src/test.js",
    CodeContent: normalText,
  };

  const result = evaluateContextBudgetGuard(payload);
  assert.equal(result.allow, true);
});

test("Context Budget Guard: supports custom thresholds", () => {
  const customPayload = {
    CodeContent: "y".repeat(15000), // ~15 KB
  };

  // Default allows 15 KB
  assert.equal(evaluateContextBudgetGuard(customPayload).allow, true);

  // Custom 10 KB threshold blocks 15 KB
  const customResult = evaluateContextBudgetGuard(customPayload, {
    thresholdKb: 10,
    maxBytes: 10240,
    maxChars: 10000,
  });
  assert.equal(customResult.allow, false);
  assert.equal(customResult.threshold_size_kb, 10);
});

test("Context Budget Guard: executes via subprocess CLI", () => {
  const hugePayload = {
    CodeContent: "A".repeat(350000),
  };
  const violation = runGuardSubprocess("context-budget-guard.js", hugePayload);
  assert.equal(violation.allow, false);
  assert.equal(violation.violation_type, "context_budget_exceeded");

  const normalPayload = {
    CodeContent: "console.log('small payload');",
  };
  const pass = runGuardSubprocess("context-budget-guard.js", normalPayload);
  assert.equal(pass.allow, true);
});

// ============================================================================
// 4. SCOPE BOUNDARY ENFORCER TESTS
// ============================================================================

test("Scope Boundary Enforcer: passes when no topic spec is configured", () => {
  const payload = {
    TargetFile: "src/random/file.js",
  };
  const result = evaluateScopeBoundaryEnforcer(payload, { spec: null });
  assert.equal(result.allow, true);
});

test("Scope Boundary Enforcer: blocks mutations to explicit out_of_bounds files", () => {
  const spec = {
    topic_id: "topic:order-fulfillment",
    local_horizontal_scope: {
      owned_files: ["src/orders/fulfillment.js"],
      out_of_bounds: ["src/auth/secrets.js", "packages/billing/*"],
    },
  };

  const payload = {
    TargetFile: "src/auth/secrets.js",
  };

  const result = evaluateScopeBoundaryEnforcer(payload, { spec });
  assert.equal(result.allow, false);
  assert.equal(result.violation_type, "scope_out_of_bounds");
  assert.equal(result.topic_id, "topic:order-fulfillment");
  assert.equal(result.mutated_file, "src/auth/secrets.js");
  assert.ok(result.reason.includes("prohibited out_of_bounds list"));
});

test("Scope Boundary Enforcer: blocks mutations to unowned files when owned_files is restricted", () => {
  const spec = {
    topic_id: "topic:order-fulfillment",
    local_horizontal_scope: {
      owned_files: ["src/orders/fulfillment.js"],
      out_of_bounds: ["src/auth/secrets.js"],
    },
  };

  const payload = {
    TargetFile: "src/inventory/stock.js",
  };

  const result = evaluateScopeBoundaryEnforcer(payload, { spec });
  assert.equal(result.allow, false);
  assert.equal(result.violation_type, "scope_unowned_file");
  assert.equal(result.topic_id, "topic:order-fulfillment");
  assert.equal(result.mutated_file, "src/inventory/stock.js");
});

test("Scope Boundary Enforcer: allows mutations to owned files", () => {
  const spec = {
    topic_id: "topic:order-fulfillment",
    local_horizontal_scope: {
      owned_files: ["src/orders/fulfillment.js"],
      out_of_bounds: ["src/auth/secrets.js"],
    },
  };

  const payload = {
    TargetFile: "src/orders/fulfillment.js",
  };

  const result = evaluateScopeBoundaryEnforcer(payload, { spec });
  assert.equal(result.allow, true);
});

test("Scope Boundary Enforcer: handles cross-platform path normalization, globstars, and extension wildcards", () => {
  assert.equal(normalizePath("C:\\repo\\src\\file.js", "C:\\repo"), "src/file.js");
  assert.equal(normalizePath("file:///C:/repo/src/file.js", "C:/repo"), "src/file.js");
  assert.equal(normalizePath("./src/file.js"), "src/file.js");
  assert.ok(matchPattern("src/auth/key.js", "src/auth/*"));

  // Globstar deep nested matching
  assert.ok(matchPattern("packages/core/db/migrations/001.sql", "packages/core/db/**"));
  assert.ok(matchPattern("src/a/b/c/d/Button.tsx", "src/**/*.tsx"));

  // Extension wildcards across subdirectories
  assert.ok(matchPattern(".env", "*.env"));
  assert.ok(matchPattern("src/secrets.env", "*.env"));
  assert.ok(matchPattern("config/certs/tls.key", "*.key"));
  assert.ok(!matchPattern("src/env.js", "*.env"));
});

test("Scope Boundary Enforcer: blocks POSIX absolute and file URL paths outside the project", { skip: process.platform === "win32" }, () => {
  const projectRoot = path.join(os.tmpdir(), "scope-project-root");
  const spec = {
    topic_id: "topic:path-boundary",
    local_horizontal_scope: { owned_files: ["src/allowed.js"], out_of_bounds: [] },
  };
  const externalPath = path.join(path.parse(projectRoot).root, "src", "allowed.js");

  for (const target of [externalPath, pathToFileURL(externalPath).href]) {
    const result = evaluateScopeBoundaryEnforcer({ TargetFile: target }, { projectRoot, spec });
    assert.equal(result.allow, false);
    assert.equal(result.violation_type, "scope_path_escape");
  }
});

test("Scope Boundary Enforcer: blocks relative traversal outside the project", () => {
  const projectRoot = path.join(os.tmpdir(), "scope-project-root");
  const spec = {
    topic_id: "topic:path-boundary",
    local_horizontal_scope: { owned_files: ["src/**"], out_of_bounds: [] },
  };
  const result = evaluateScopeBoundaryEnforcer(
    { TargetFile: "../scope-project-root-escape/src/file.js" },
    { projectRoot, spec },
  );
  assert.equal(result.allow, false);
  assert.equal(result.violation_type, "scope_path_escape");
});

test("Scope Boundary Enforcer: blocks a path that escapes through a project symlink", { skip: process.platform === "win32" }, (context) => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "scope-symlink-"));
  context.after(() => fs.rmSync(sandbox, { recursive: true, force: true }));
  const projectRoot = path.join(sandbox, "project");
  const externalRoot = path.join(sandbox, "external");
  fs.mkdirSync(projectRoot, { recursive: true });
  fs.mkdirSync(externalRoot, { recursive: true });
  fs.symlinkSync(externalRoot, path.join(projectRoot, "linked"), "dir");
  const spec = {
    topic_id: "topic:path-boundary",
    local_horizontal_scope: { owned_files: ["linked/**"], out_of_bounds: [] },
  };

  const result = evaluateScopeBoundaryEnforcer(
    { TargetFile: "linked/not-created-yet.js" },
    { projectRoot, spec },
  );
  assert.equal(result.allow, false);
  assert.equal(result.violation_type, "scope_path_escape");
});

test("Scope Boundary Enforcer: keeps project-relative and percent-encoded in-project URLs usable", (context) => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "scope-in-project-"));
  context.after(() => fs.rmSync(projectRoot, { recursive: true, force: true }));
  const targetPath = path.join(projectRoot, "src", "space name.js");
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  const spec = {
    topic_id: "topic:path-boundary",
    local_horizontal_scope: { owned_files: ["src/space name.js"], out_of_bounds: [] },
  };

  assert.equal(evaluateScopeBoundaryEnforcer(
    { TargetFile: "src/space name.js" },
    { projectRoot, spec },
  ).allow, true);
  assert.equal(evaluateScopeBoundaryEnforcer(
    { TargetFile: pathToFileURL(targetPath).href },
    { projectRoot, spec },
  ).allow, true);
});

test("Scope Boundary Enforcer: blocks extension wildcard out_of_bounds in subdirectories", () => {
  const spec = {
    topic_id: "topic:auth",
    local_horizontal_scope: {
      owned_files: ["src/**"],
      out_of_bounds: ["*.env", "*.pem"],
    },
  };

  const res = evaluateScopeBoundaryEnforcer({ TargetFile: "src/config/secrets.env" }, { spec });
  assert.equal(res.allow, false);
  assert.equal(res.violation_type, "scope_out_of_bounds");
});

test("Scope Boundary Enforcer: executes via subprocess CLI with spec in payload", () => {
  const spec = {
    topic_id: "topic:auth",
    local_horizontal_scope: {
      owned_files: ["src/auth/login.js"],
      out_of_bounds: ["src/secrets.env"],
    },
  };

  const violation = runGuardSubprocess("scope-boundary-enforcer.js", {
    spec,
    TargetFile: "src/secrets.env",
  });
  assert.equal(violation.allow, false);
  assert.equal(violation.violation_type, "scope_out_of_bounds");

  const pass = runGuardSubprocess("scope-boundary-enforcer.js", {
    spec,
    TargetFile: "src/auth/login.js",
  });
  assert.equal(pass.allow, true);
});

// ============================================================================
// 5. SUBAGENT RECURSION LIMITER TESTS
// ============================================================================

test("Subagent Recursion Limiter: blocks recursion depth exceeding maximum ceiling (depth > 3)", () => {
  const payload = {
    depth: 4,
    target_agent: "worker_sub_analyst_4",
  };

  const result = evaluateSubagentRecursionLimiter(payload);
  assert.equal(result.allow, false);
  assert.equal(result.violation_type, "subagent_recursion_limit");
  assert.equal(result.current_depth, 4);
  assert.equal(result.max_depth, 3);
  assert.ok(result.reason.includes("invocation depth 4 exceeds maximum ceiling of 3"));
  assert.ok(result.self_correct_hint);
});

test("Subagent Recursion Limiter: blocks active concurrency exceeding ceiling (concurrency > 4)", () => {
  const payload = {
    depth: 2,
    active_subagents: 5,
    target_agent: "worker_new",
  };

  const result = evaluateSubagentRecursionLimiter(payload);
  assert.equal(result.allow, false);
  assert.equal(result.violation_type, "subagent_concurrency_limit");
  assert.equal(result.active_subagents, 5);
  assert.equal(result.max_concurrent, 4);
});

test("Subagent Recursion Limiter: detects and blocks circular delegation", () => {
  const payload = {
    call_chain: ["orchestrator", "worker_a", "worker_b"],
    target_agent: "worker_a",
  };

  const result = evaluateSubagentRecursionLimiter(payload);
  assert.equal(result.allow, false);
  assert.equal(result.violation_type, "circular_delegation");
  assert.deepEqual(result.call_chain, ["orchestrator", "worker_a", "worker_b", "worker_a"]);
  assert.ok(result.reason.includes("Circular subagent delegation detected"));
});

test("Subagent Recursion Limiter: allows safe subagent invocations within ceilings", () => {
  const payload = {
    depth: 2,
    active_subagents: 3,
    call_chain: ["orchestrator", "worker_a"],
    target_agent: "worker_b",
  };

  const result = evaluateSubagentRecursionLimiter(payload);
  assert.equal(result.allow, true);
});

test("Subagent Recursion Limiter: executes via subprocess CLI", () => {
  const violation = runGuardSubprocess("subagent-recursion-limiter.js", {
    depth: 5,
  });
  assert.equal(violation.allow, false);
  assert.equal(violation.violation_type, "subagent_recursion_limit");

  const pass = runGuardSubprocess("subagent-recursion-limiter.js", {
    depth: 1,
    active_subagents: 2,
  });
  assert.equal(pass.allow, true);
});
