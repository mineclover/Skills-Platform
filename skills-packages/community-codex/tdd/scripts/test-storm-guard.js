#!/usr/bin/env node
/**
 * Test Storm Suppression Guard (on_test_run / pre_tool_use, priority 50)
 * 
 * Companion guard co-located with scoped-tdd-executor.
 * Intercepts test commands and payloads to block un-scoped full regression suite
 * sweeps (npm test, pytest, etc.) during inner-loop TDD cycles, ensuring 1:1 pinpoint
 * test execution.
 * 
 * Zero external dependencies.
 */

const fs = require("node:fs");
const path = require("node:path");

const BLOCKED_UNSCOPED_TEST_PATTERNS = [
  /^(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?test(?:\s+--)?$/i,
  /^(?:npm|pnpm|yarn|bun)\s+t$/i,
  /^pytest\s*$/i,
  /^cargo\s+test\s*$/i,
  /^node\s+--test\s*$/i,
  /^node\s+--test\s+(?:\.|\*|tests?[\/\\]?\*?)$/i,
  /^npx\s+(?:vitest|jest)\s*$/i,
  /^jest\s*$/i,
  /^vitest\s*$/i,
  /^deno\s+test\s*$/i,
];

const COMMAND_KEYS = [
  "command",
  "CommandLine",
  "cmd",
  "testTarget",
  "target",
  "args",
];

const BROAD_DIRS = new Set([
  "*",
  ".",
  "tests",
  "test",
  "tests/",
  "test/",
  "tests/*",
  "test/*",
  "tests/**",
  "test/**",
]);

function splitCompoundCommands(cmdStr) {
  if (typeof cmdStr !== "string") return [];
  const parts = [];
  let current = "";
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let escape = false;

  for (let i = 0; i < cmdStr.length; i++) {
    const ch = cmdStr[i];
    if (escape) {
      current += ch;
      escape = false;
      continue;
    }
    if (ch === "\\") {
      escape = true;
      current += ch;
      continue;
    }
    if (ch === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      current += ch;
      continue;
    }
    if (ch === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      current += ch;
      continue;
    }
    if (!inSingleQuote && !inDoubleQuote) {
      if (ch === "\n" || ch === ";") {
        if (current.trim()) parts.push(current.trim());
        current = "";
        continue;
      }
      if ((ch === "&" && cmdStr[i + 1] === "&") || (ch === "|" && cmdStr[i + 1] === "|")) {
        if (current.trim()) parts.push(current.trim());
        current = "";
        i++;
        continue;
      }
      if (ch === "|" && cmdStr[i + 1] !== "|") {
        if (current.trim()) parts.push(current.trim());
        current = "";
        continue;
      }
      if (ch === "&" && cmdStr[i + 1] !== "&") {
        if (current.trim()) parts.push(current.trim());
        current = "";
        continue;
      }
    }
    current += ch;
  }
  if (current.trim()) parts.push(current.trim());
  return parts.length > 0 ? parts : [cmdStr];
}

function unwrapSubshellCommand(cmdStr) {
  const trimmed = cmdStr.trim();
  const subshellMatch = trimmed.match(/^(?:(?:(?:sudo|env)\s+)*(?:(?:bash|sh|zsh|dash)\s+(?:-[a-zA-Z]*c\s+|--\s+)?|eval\s+))(['"])([\s\S]*)\1$/i);
  if (subshellMatch && subshellMatch[2]) {
    return subshellMatch[2];
  }
  const evalMatch = trimmed.match(/^eval\s+([^'"].*)$/i);
  if (evalMatch && evalMatch[1]) {
    return evalMatch[1];
  }
  return null;
}

function isSingleUnscopedTestCommand(cmdStr) {
  if (typeof cmdStr !== "string") return false;
  const trimmed = cmdStr.trim();
  if (!trimmed) return false;

  for (const pattern of BLOCKED_UNSCOPED_TEST_PATTERNS) {
    if (pattern.test(trimmed)) return true;
  }

  const tokens = trimmed.split(/\s+/).filter((t) => t.length > 0);
  while (tokens.length > 0 && /^[a-zA-Z_][a-zA-Z0-9_]*=/.test(tokens[0])) {
    tokens.shift();
  }
  if (tokens.length === 0) return false;

  const binary = path.basename(tokens[0] || "");
  const isPython = /^(?:python(?:\d+(?:\.\d+)?)?|py)$/i.test(binary);

  // 1. Pytest
  if (binary === "pytest" || (isPython && tokens[1] === "-m" && tokens[2] === "pytest")) {
    const args = binary === "pytest" ? tokens.slice(1) : tokens.slice(3);
    const nonFlagArgs = args.filter((a) => !a.startsWith("-"));
    const hasSpecificFile = nonFlagArgs.some((a) => /\.(?:py|pyc)$/i.test(a) || a.includes("::"));
    const hasPinpointFilter = args.some((a) => a === "-k" || a.startsWith("-k=") || a === "-m" || a.startsWith("-m="));
    if (!hasSpecificFile && !hasPinpointFilter) return true;
  }

  // 2. Python unittest
  if (isPython && tokens[1] === "-m" && (tokens[2] === "unittest" || tokens[2] === "trial")) {
    const args = tokens.slice(3);
    const meaningfulArgs = args.filter((a) => a !== "discover" && !a.startsWith("-") && !BROAD_DIRS.has(a));
    if (meaningfulArgs.length === 0) return true;
  }

  // 3. Go test
  if (binary === "go" && tokens[1] === "test") {
    const args = tokens.slice(2);
    const hasPinpointFlag = args.some((a) => a === "-run" || a.startsWith("-run=") || a === "-bench" || a.startsWith("-bench="));
    const targetArgs = args.filter((a) => !a.startsWith("-") && a !== "./..." && a !== "." && a !== "...");
    if (!hasPinpointFlag && targetArgs.length === 0) return true;
  }

  // 4. Cargo test
  if (binary === "cargo" && tokens[1] === "test") {
    const args = tokens.slice(2);
    const flagsIgnoringTarget = new Set(["--all", "--workspace", "--lib", "--tests", "--bins", "--examples", "--benches", "--all-targets", "-q", "--quiet", "-v", "--verbose", "--no-fail-fast", "--"]);
    const meaningfulArgs = args.filter((a) => !flagsIgnoringTarget.has(a) && !a.startsWith("--color") && !a.startsWith("--manifest-path"));
    const hasPinpointTarget = meaningfulArgs.some((a) => a === "--test" || a === "--bin" || a === "--example" || a === "-p" || a === "--package" || !a.startsWith("-"));
    if (!hasPinpointTarget) return true;
  }

  // 5. Node --test
  if (binary === "node" && tokens.includes("--test")) {
    const nodeValOptions = new Set([
      "--import",
      "-r",
      "--require",
      "--loader",
      "--test-reporter",
      "--test-reporter-destination",
      "--test-name-pattern",
      "-C",
      "--conditions",
      "-e",
      "--eval",
    ]);
    const afterNode = tokens.slice(1);
    const testFileArgs = [];
    for (let i = 0; i < afterNode.length; i++) {
      const arg = afterNode[i];
      if (nodeValOptions.has(arg)) {
        i++; // skip option value
        continue;
      }
      if (arg === "--test" || arg.startsWith("-")) continue;
      if (BROAD_DIRS.has(arg)) continue;
      testFileArgs.push(arg);
    }
    if (testFileArgs.length === 0) return true;
  }

  // 6. Vitest / Jest
  const isVitestOrJest = (binary === "npx" && (tokens[1] === "vitest" || tokens[1] === "jest"))
    || ((binary === "pnpm" || binary === "yarn" || binary === "bunx") && (tokens[1] === "dlx" || tokens[1] === "exec") && (tokens[2] === "vitest" || tokens[2] === "jest"))
    || binary === "vitest" || binary === "jest";
  if (isVitestOrJest) {
    const offset = (binary === "npx" ? 2 : (tokens[1] === "dlx" || tokens[1] === "exec") ? 3 : 1);
    const subArgs = tokens.slice(offset)
      .filter((a) => a !== "run" && a !== "watch" && !a.startsWith("-"));
    const hasTestFile = subArgs.some((a) => /\.(?:[jt]sx?|m[jt]s|c[jt]s)$/i.test(a) && !BROAD_DIRS.has(a));
    if (!hasTestFile) return true;
  }

  // 7. npm / pnpm / yarn / bun test
  const isPackageManager = ["npm", "pnpm", "yarn", "bun"].includes(binary);
  const isTestScript = (
    tokens[1] === "test" ||
    tokens[1] === "t" ||
    /^test(?::\w+)?$/i.test(tokens[1] || "") ||
    ((tokens[1] === "run" || tokens[1] === "run-script") && /^test(?::\w+)?$/i.test(tokens[2] || ""))
  );
  if (isPackageManager && isTestScript) {
    const startIndex = (tokens[1] === "run" || tokens[1] === "run-script") ? 3 : 2;
    const pmValOptions = new Set([
      "--workspace",
      "-w",
      "--prefix",
      "--filter",
      "--project",
      "-C",
    ]);
    const rest = tokens.slice(startIndex);
    const testArgs = [];
    for (let i = 0; i < rest.length; i++) {
      const arg = rest[i];
      if (pmValOptions.has(arg)) {
        i++; // skip workspace/prefix value
        continue;
      }
      if (arg === "--" || arg.startsWith("-")) continue;
      if (BROAD_DIRS.has(arg)) continue;
      testArgs.push(arg);
    }
    if (testArgs.length === 0) return true;
  }

  // 8. Deno test
  if (binary === "deno" && tokens[1] === "test") {
    const args = tokens.slice(2);
    const hasFilter = args.some((a) => a === "--filter" || a.startsWith("--filter="));
    const targetFiles = args.filter((a) => !a.startsWith("-") && !BROAD_DIRS.has(a));
    if (!hasFilter && targetFiles.length === 0) return true;
  }

  return false;
}

function isUnscopedTestCommand(cmdStr) {
  if (typeof cmdStr !== "string") return false;
  const trimmed = cmdStr.trim();
  if (!trimmed) return false;

  const parts = splitCompoundCommands(trimmed);
  for (const part of parts) {
    const unwrapped = unwrapSubshellCommand(part);
    if (unwrapped && isUnscopedTestCommand(unwrapped)) {
      return true;
    }
    if (isSingleUnscopedTestCommand(part)) {
      return true;
    }
  }
  return false;
}

function evaluateTestStormGuard(payload = {}) {
  // Extract commands from various standard payload shapes
  const candidates = [];
  const inspectKey = (val) => {
    if (typeof val === "string") {
      candidates.push(val);
    } else if (Array.isArray(val) && val.length > 0 && val.every((v) => typeof v === "string")) {
      candidates.push(val.join(" "));
    }
  };

  const inspectObject = (obj) => {
    if (!obj || typeof obj !== "object") return;
    for (const key of COMMAND_KEYS) {
      inspectKey(obj[key]);
    }
    if (typeof obj.raw === "string") {
      inspectKey(obj.raw);
      try {
        inspectObject(JSON.parse(obj.raw));
      } catch {}
    }
    for (const key of ["tool_input", "toolInput", "input", "toolCall", "tool_call", "args", "arguments", "parameters"]) {
      const val = obj[key];
      if (val && typeof val === "object") {
        inspectObject(val);
      } else if (typeof val === "string") {
        try {
          const parsed = JSON.parse(val);
          if (parsed && typeof parsed === "object") inspectObject(parsed);
        } catch {}
      }
    }
  };

  if (typeof payload === "string") {
    candidates.push(payload);
  } else if (payload && typeof payload === "object") {
    inspectObject(payload);
  }

  for (const cmd of candidates) {
    if (isUnscopedTestCommand(cmd)) {
      return {
        allow: false,
        decision: "deny",
        violation_type: "test_storm_suppression",
        reason: `Test storm suppressed: un-scoped full regression suite execution '${cmd}' is blocked during inner-loop TDD cycles. Pinpoint scoped test runner requires a specific test target.`,
        self_correct_hint: "Execute pinpoint unit test runner on single test target (e.g. node --test path/to/file.test.js) instead of running the entire test suite.",
      };
    }
  }

  return {
    allow: true,
    decision: "allow",
    message: "[Guard] Scoped test execution verified.",
  };
}

function isAntigravityMode(payload = {}, env = process.env, cliArgs = {}, rawStdin = "") {
  if (env.HOOK_RUNTIME === "antigravity" || cliArgs.runtime === "antigravity") {
    return true;
  }
  const p = payload || {};
  if (
    p.conversationId ||
    p.conversation_id ||
    p.workspacePaths ||
    p.workspace_paths ||
    p.transcriptPath ||
    p.transcript_path ||
    p.artifactDirectoryPath ||
    p.artifact_directory_path ||
    p.toolName ||
    p.tool_name ||
    p.modelName ||
    p.model_name ||
    p.stepIdx !== undefined ||
    p.step_idx !== undefined ||
    p.toolCall ||
    p.tool_call ||
    p.permissionOverrides ||
    p.permission_overrides
  ) {
    return true;
  }
  if (typeof rawStdin === "string" && rawStdin) {
    if (/(?:"conversation_id"|"conversationId"|"toolCall"|"tool_call"|"workspacePaths"|"workspace_paths"|"stepIdx"|"step_idx")/.test(rawStdin)) {
      return true;
    }
  }
  return false;
}

function formatGuardStdout(result, payload = {}, env = process.env, cliArgs = {}, rawStdin = "") {
  let effectivePayload = payload;
  if (!effectivePayload || Object.keys(effectivePayload).length === 0) {
    if (env.HOOK_PAYLOAD) {
      try {
        effectivePayload = JSON.parse(env.HOOK_PAYLOAD);
      } catch {}
    }
  }
  const isAntigravity = isAntigravityMode(effectivePayload, env, cliArgs, rawStdin);
  if (isAntigravity) {
    const isBlocked = result.allow === false || result.decision === "block" || result.decision === "deny";
    if (isBlocked) {
      const reason = [
        result.reason || "Test storm suppressed",
        result.self_correct_hint ? `Hint: ${result.self_correct_hint}` : null,
      ].filter(Boolean).join(" ");
      return { decision: "deny", reason };
    }
    return { decision: "allow" };
  }
  return result;
}

function parseCliArgs(argv = []) {
  const parsed = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const eqIdx = arg.indexOf("=");
      if (eqIdx > 2) {
        parsed[arg.slice(2, eqIdx)] = arg.slice(eqIdx + 1);
      } else {
        const next = argv[i + 1];
        if (next && !next.startsWith("--")) {
          parsed[arg.slice(2)] = next;
          i++;
        } else {
          parsed[arg.slice(2)] = true;
        }
      }
    } else if (!parsed._first) {
      parsed._first = arg;
    }
  }
  return parsed;
}

function readAllStdin(timeoutMs = 3000) {
  return new Promise((resolve) => {
    if (process.stdin.isTTY || process.stdin.readableEnded) {
      resolve("");
      return;
    }
    let data = "";
    let completed = false;
    function finish() {
      if (!completed) {
        completed = true;
        resolve(data.trim());
      }
    }
    const timer = setTimeout(finish, timeoutMs);
    if (timer.unref) timer.unref();
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => {
      clearTimeout(timer);
      finish();
    });
    process.stdin.on("error", () => {
      clearTimeout(timer);
      finish();
    });
  });
}

let currentPayload = {};
let currentStdin = "";
let currentCliArgs = {};

async function main(argv = process.argv.slice(2)) {
  currentCliArgs = parseCliArgs(argv);
  currentStdin = await readAllStdin();
  currentPayload = {};

  if (process.env.HOOK_PAYLOAD) {
    try {
      currentPayload = JSON.parse(process.env.HOOK_PAYLOAD);
    } catch {
      currentPayload = { command: process.env.HOOK_PAYLOAD };
    }
  } else if (currentStdin) {
    try {
      currentPayload = JSON.parse(currentStdin);
    } catch {
      currentPayload = { command: currentStdin };
    }
  } else if (currentCliArgs.command || currentCliArgs.cmd || currentCliArgs.CommandLine) {
    currentPayload = currentCliArgs;
  } else if (currentCliArgs._first) {
    currentPayload = { command: currentCliArgs._first };
  }

  const isAntigravity = isAntigravityMode(currentPayload, process.env, currentCliArgs, currentStdin);
  const result = evaluateTestStormGuard(currentPayload);
  const output = formatGuardStdout(result, currentPayload, process.env, currentCliArgs, currentStdin);
  if (result.allow) {
    if (!isAntigravity) {
      output.message = "[Guard] Scoped test execution verified.";
    }
    console.error("[Guard] Scoped test execution verified.");
  }
  process.stdout.write(JSON.stringify(output, null, 2) + "\n");
  process.exit(0);
}

if (require.main === module) {
  main().catch((err) => {
    const errorResult = {
      allow: false,
      decision: "deny",
      reason: `Test storm guard internal error: ${err?.message}`,
      violation_type: "test_storm_guard_error",
    };
    const output = formatGuardStdout(errorResult, currentPayload, process.env, currentCliArgs, currentStdin);
    process.stdout.write(JSON.stringify(output, null, 2) + "\n");
    process.exit(0);
  });
}

module.exports = {
  BLOCKED_UNSCOPED_TEST_PATTERNS,
  isUnscopedTestCommand,
  evaluateTestStormGuard,
  main,
};
