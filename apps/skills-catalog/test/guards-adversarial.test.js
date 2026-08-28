const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const {
  evaluateSecretLeakGuard,
  SECRET_RULES,
  resolvePayload: resolveSecretPayload,
} = require("../../../.skills-platform/hooks/guards/secret-leak-guard.js");

const {
  evaluateDestructiveCommandBlocker,
  DESTRUCTIVE_RULES,
  extractCommandStrings,
  resolvePayload: resolveDestructivePayload,
} = require("../../../.skills-platform/hooks/guards/destructive-command-blocker.js");

const GUARDS_DIR = path.resolve(__dirname, "../../../.skills-platform/hooks/guards");

function runSubprocess(scriptName, payload, extraEnv = {}) {
  const scriptPath = path.resolve(GUARDS_DIR, scriptName);
  const result = spawnSync(process.execPath, [scriptPath], {
    env: {
      ...process.env,
      HOOK_EVENT: "pre_tool_use",
      HOOK_PAYLOAD: JSON.stringify(payload),
      ...extraEnv,
    },
    encoding: "utf8",
  });

  assert.equal(result.status, 0, `Script ${scriptName} exited with code ${result.status}: ${result.stderr}`);
  return JSON.parse(result.stdout.trim());
}

// ============================================================================
// 1. SECRET LEAK GUARD TESTS
// ============================================================================

test("Secret Leak Guard: detects nested secrets in deep payloads", () => {
  const deepPayload = {
    level1: {
      level2: [
        { level3: { key: "AKIA1234567890ABCDEF" } }
      ]
    }
  };
  const res = evaluateSecretLeakGuard(deepPayload);
  assert.equal(res.allow, false);
  assert.equal(res.matched_pattern, "AWS_ACCESS_KEY_ID");
});

test("Secret Leak Guard: detects 39-char Google API Keys in URL params", () => {
  const urlPayload = {
    url: "https://api.example.com/v1/auth?api_key=AIzaSyD12345678901234567890123456789012&format=json"
  };
  const res = evaluateSecretLeakGuard(urlPayload);
  assert.equal(res.allow, false);
  assert.equal(res.matched_pattern, "GOOGLE_API_KEY");
});

test("Secret Leak Guard: detects all GitHub token prefixes", () => {
  const tokens = [
    "ghp_123456789012345678901234567890123456",
    "gho_123456789012345678901234567890123456",
    "ghu_123456789012345678901234567890123456",
    "ghs_123456789012345678901234567890123456",
    "ghr_123456789012345678901234567890123456",
    "github_pat_11ABCD1234_123456789012345678901234567890"
  ];

  for (const token of tokens) {
    const res = evaluateSecretLeakGuard({ token });
    assert.equal(res.allow, false, `Failed to block token: ${token}`);
    assert.equal(res.matched_pattern, "GITHUB_TOKEN");
  }
});

test("Secret Leak Guard: detects distinct types of private key headers", () => {
  const keys = [
    "-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASC...\n-----END PRIVATE KEY-----",
    "-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA0...\n-----END RSA PRIVATE KEY-----",
    "-----BEGIN EC PRIVATE KEY-----\nMHcCAQEEII...\n-----END EC PRIVATE KEY-----",
    "-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEAAAA...\n-----END OPENSSH PRIVATE KEY-----",
    "-----BEGIN DSA PRIVATE KEY-----\nMIIBugIBAAKCAQE...\n-----END DSA PRIVATE KEY-----",
    "-----BEGIN ENCRYPTED PRIVATE KEY-----\nMIIFDjBABgkqhkiG9w0BBQ0w...\n-----END ENCRYPTED PRIVATE KEY-----"
  ];

  for (const key of keys) {
    const res = evaluateSecretLeakGuard({ key });
    assert.equal(res.allow, false, `Failed to block private key certificate`);
    assert.equal(res.matched_pattern, "PRIVATE_KEY");
  }
});

test("Secret Leak Guard: allows benign code and public certificates", () => {
  const safeItems = [
    { CommandLine: "git status" },
    { CommandLine: "npm test -- --coverage" },
    { CommandLine: "cat package.json" },
    { CodeContent: "const apiKey = process.env.ANTHROPIC_API_KEY;" },
    { CodeContent: "const key = process.env.AWS_ACCESS_KEY_ID || 'local';" },
    { CodeContent: "import { getGitHubToken } from './auth.js';" },
    { CodeContent: "-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA0...\n-----END PUBLIC KEY-----" },
  ];

  for (const item of safeItems) {
    const res = evaluateSecretLeakGuard(item);
    assert.equal(res.allow, true, `Benign input unexpectedly blocked: ${JSON.stringify(item)}`);
  }
});

// ============================================================================
// 2. DESTRUCTIVE COMMAND BLOCKER TESTS
// ============================================================================

test("Destructive Command Blocker: blocks standard root deletions", () => {
  const standardBlocked = [
    "rm -rf /",
    "rm -rf /*",
    "rm -rf ~",
    "rm -rf ~/",
    "rm -rf *",
    "rm -rf ..",
    "rm -rf /etc",
    "rm -rf /usr",
    "rm -rf /bin",
    "rm -rf /var",
    "rm -rf /root",
    "rm -fr /",
    "rm -rf / ; echo done",
    "echo start && rm -rf /",
    "del /s /q c:\\",
    "del /f /s /q c:\\",
    "del /s /q *",
    "del /s /q ..",
    "rmdir /s /q c:\\",
    "rmdir /s /q C:",
    "Remove-Item -Recurse C:\\",
    "Remove-Item -Force -Recurse /",
    "Remove-Item -Recurse *",
    "Remove-Item -r ~",
  ];

  for (const cmd of standardBlocked) {
    const res = evaluateDestructiveCommandBlocker({ CommandLine: cmd });
    assert.equal(res.allow, false, `Dangerous deletion NOT blocked: ${cmd}`);
    assert.equal(res.violation_type, "destructive_command");
  }
});

test("Destructive Command Blocker: blocks catastrophic git operations", () => {
  const dangerousGit = [
    "git reset --hard",
    "git reset --hard HEAD~1",
    "git reset --hard origin/main",
    "git clean -f",
    "git clean -fd",
    "git clean -fx",
    "git clean -fdx",
    "git push origin main --force",
    "git push origin master -f",
    "git push origin +main",
    "git branch -D main",
    "git branch -D master",
    "git branch -D prod",
    "git branch -D production",
    "git branch -D release",
    "git branch -d main",
    "git branch -d master",
  ];

  for (const cmd of dangerousGit) {
    const res = evaluateDestructiveCommandBlocker({ CommandLine: cmd });
    assert.equal(res.allow, false, `Dangerous git command NOT blocked: ${cmd}`);
    assert.equal(res.violation_type, "destructive_command");
  }
});

test("Destructive Command Blocker: blocks database drop and truncate", () => {
  const dangerousDb = [
    "DROP DATABASE production;",
    "DROP SCHEMA public CASCADE;",
    "DROP TABLE users;",
    "DROP TABLE `accounts`;",
    "TRUNCATE TABLE logs;",
    "TRUNCATE TABLE `audit_trail`;",
    "TRUNCATE users",
  ];

  for (const cmd of dangerousDb) {
    const res = evaluateDestructiveCommandBlocker({ CommandLine: cmd });
    assert.equal(res.allow, false, `Dangerous DB command NOT blocked: ${cmd}`);
    assert.equal(res.violation_type, "destructive_command");
  }
});

test("Destructive Command Blocker: blocks raw disk writes and shutdowns", () => {
  const catastrophic = [
    "format c:",
    "format c: /fs:NTFS /q",
    "format D: /fs:exFAT",
    "diskpart /s wipe.txt",
    "fdisk /dev/sda",
    "mkfs.ext4 /dev/nvme0n1p1",
    "mkfs /dev/sda1",
    "dd if=/dev/zero of=/dev/sda bs=1M",
    "dd if=/dev/urandom of=/dev/nvme0n1",
    ":(){ :|:& };:",
    "shutdown -h now",
    "shutdown /s /t 0",
    "shutdown -r now",
    "init 0",
    "halt",
    "reboot",
  ];

  for (const cmd of catastrophic) {
    const res = evaluateDestructiveCommandBlocker({ CommandLine: cmd });
    assert.equal(res.allow, false, `Catastrophic command NOT blocked: ${cmd}`);
    assert.equal(res.violation_type, "destructive_command");
  }
});

test("Destructive Command Blocker: allows safe workspace operations without false positives", () => {
  const safeCommands = [
    { CommandLine: "rm -rf dist" },
    { CommandLine: "rm -rf build" },
    { CommandLine: "rm -rf node_modules" },
    { CommandLine: "rm -rf .turbo" },
    { CommandLine: "rm -rf coverage" },
    { CommandLine: "rm -rf tmp/scratch" },
    { CommandLine: "del package-lock.json" },
    { CommandLine: "rmdir temp_dir" },
    { CommandLine: "Remove-Item -Path ./dist -Recurse" },
    { CommandLine: "Remove-Item ./test.tmp" },
    { CommandLine: "git status" },
    { CommandLine: "git log -n 5" },
    { CommandLine: "git diff HEAD~1" },
    { CommandLine: "git reset HEAD file.js" },
    { CommandLine: "git reset --soft HEAD~1" },
    { CommandLine: "git reset --mixed HEAD~1" },
    { CommandLine: "git clean -n" },
    { CommandLine: "git push origin feature/my-branch" },
    { CommandLine: "git branch -d feature/experiment" },
    { CommandLine: "git branch -D feature/scratch" },
    { CommandLine: "npm run format" },
    { CommandLine: "npm test" },
    { CommandLine: "SELECT * FROM users WHERE status = 'active'" },
  ];

  for (const item of safeCommands) {
    const res = evaluateDestructiveCommandBlocker(item);
    assert.equal(res.allow, true, `Safe command was falsely rejected: ${item.CommandLine}`);
  }
});

// ============================================================================
// 3. EMPIRICAL CHALLENGE FINDING DEMONSTRATIONS (EVASIONS & FALSE POSITIVES)
// ============================================================================

test("Empirical Gap Finding 1: rm flag-splitting / long-flag bypasses in destructive blocker", () => {
  const flagSplitCases = [
    "rm -r -f /",
    "rm -f -r /",
    "rm -r /",
    "rm -R /",
    "rm --recursive /",
    "rm --recursive --force /",
  ];

  const bypasses = flagSplitCases.filter(cmd => evaluateDestructiveCommandBlocker({ CommandLine: cmd }).allow === true);
  assert.equal(bypasses.length, 0, `All flag-splitting deletions must be blocked, bypasses found: ${bypasses.join(", ")}`);
});

test("Empirical Gap Finding 2: PowerShell Remove-Item path-first syntax bypass", () => {
  const pathFirstCases = [
    "Remove-Item / -Recurse -Force",
    "Remove-Item C:\\ -Recurse",
  ];

  const bypasses = pathFirstCases.filter(cmd => evaluateDestructiveCommandBlocker({ CommandLine: cmd }).allow === true);
  assert.equal(bypasses.length, 0, `All Remove-Item path-first deletions must be blocked, bypasses found: ${bypasses.join(", ")}`);
});

test("Empirical Gap Finding 3: ENV_FILE_DUMP false positive on benign documentation / code writes", () => {
  const benignCode = {
    TargetFile: "src/utils/env-logger.ts",
    CodeContent: "// Run printenv in your shell to see all active environment variables\nexport const log = () => {};",
  };

  const res = evaluateSecretLeakGuard(benignCode);
  assert.equal(res.allow, true, "Benign code containing printenv must be allowed");
});

test("Performance & Protocol Compliance: subprocess execution & response schema", () => {
  const res = runSubprocess("destructive-command-blocker.js", {
    CommandLine: "git reset --hard",
  });

  assert.equal(res.allow, false);
  assert.equal(typeof res.reason, "string");
  assert.equal(typeof res.self_correct_hint, "string");
  assert.equal(res.violation_type, "destructive_command");
  assert.equal(res.matched_pattern, "GIT_RESET_HARD");
});
