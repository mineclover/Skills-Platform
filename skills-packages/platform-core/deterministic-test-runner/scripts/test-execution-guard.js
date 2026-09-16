#!/usr/bin/env node
/**
 * Deterministic Test Execution Guard (on_test_run / pre_tool_use, priority 40)
 *
 * Companion guard co-located with deterministic-test-runner.
 * Intercepts test runner commands (node --test, npm test, etc.) and ensures they
 * include deterministic teardown mechanisms (--test-force-exit, preload teardown
 * hook, or timeout wrapper). Prevents dangling servers and open sockets from
 * hanging tests into indefinite background zombie tasks.
 *
 * Zero external dependencies. Fully compliant with Antigravity C++ Protojson.
 */

const fs = require("node:fs");
const path = require("node:path");

const COMMAND_KEYS = [
  "command",
  "CommandLine",
  "cmd",
  "testTarget",
  "target",
  "args",
];

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
  const subshellMatch = trimmed.match(
    /^(?:(?:(?:sudo|env)\s+)*(?:(?:bash|sh|zsh|dash)\s+(?:-[a-zA-Z]*c\s+|--\s+)?|eval\s+))(['"])([\s\S]*)\1$/i
  );
  if (subshellMatch && subshellMatch[2]) {
    return subshellMatch[2];
  }
  const evalMatch = trimmed.match(/^eval\s+([^'"].*)$/i);
  if (evalMatch && evalMatch[1]) {
    return evalMatch[1];
  }
  return null;
}

function inspectTestCommandSafety(cmdStr) {
  if (typeof cmdStr !== "string") return { isTest: false, safe: true };
  const trimmed = cmdStr.trim();
  if (!trimmed) return { isTest: false, safe: true };

  // Check if timeout wrapper is already present
  const hasTimeoutWrapper = /^(?:timeout|gtimeout)\s+/i.test(trimmed);

  const tokens = trimmed.split(/\s+/).filter((t) => t.length > 0);
  while (tokens.length > 0 && /^[a-zA-Z_][a-zA-Z0-9_]*=/.test(tokens[0])) {
    tokens.shift();
  }
  if (tokens.length === 0) return { isTest: false, safe: true };

  const binary = path.basename(tokens[0] || "");

  // 1. Node --test runner
  if (binary === "node" && tokens.includes("--test")) {
    const hasForceExit = tokens.includes("--test-force-exit");
    const hasTeardownImport = tokens.some(
      (t, idx) =>
        (t === "--import" || t === "-r" || t === "--require") &&
        tokens[idx + 1] &&
        /(?:teardown|hook|exit|guard)/i.test(tokens[idx + 1])
    );
    const isSafe = hasForceExit || hasTeardownImport || hasTimeoutWrapper;
    return {
      isTest: true,
      safe: isSafe,
      runner: "node:test",
      recommendation:
        "Append '--test-force-exit' or '--import <path>/node-teardown-hook.mjs' to ensure deterministic teardown.",
    };
  }

  // 2. Jest runner
  const isJest =
    binary === "jest" ||
    (binary === "npx" && tokens[1] === "jest") ||
    ((binary === "pnpm" || binary === "yarn") && tokens[1] === "jest");
  if (isJest) {
    const hasForceExit = tokens.includes("--forceExit");
    const isSafe = hasForceExit || hasTimeoutWrapper;
    return {
      isTest: true,
      safe: isSafe,
      runner: "jest",
      recommendation:
        "Append '--forceExit --detectOpenHandles' to prevent Jest from hanging on unclosed handles.",
    };
  }

  return { isTest: false, safe: true };
}

function evaluateDeterministicTestGuard(payload = {}) {
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
    for (const key of [
      "tool_input",
      "toolInput",
      "input",
      "toolCall",
      "tool_call",
      "args",
      "arguments",
      "parameters",
    ]) {
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

  for (const rawCmd of candidates) {
    const parts = splitCompoundCommands(rawCmd);
    for (const part of parts) {
      const unwrapped = unwrapSubshellCommand(part);
      const targetCmd = unwrapped || part;
      const check = inspectTestCommandSafety(targetCmd);
      if (check.isTest && !check.safe) {
        return {
          allow: false,
          decision: "deny",
          violation_type: "dangling_test_execution_risk",
          reason: `Deterministic Test Guard: Test command '${targetCmd}' lacks an explicit exit signal or force-teardown flag. Tests involving network servers, sockets, or timers risk hanging indefinitely in background tasks.`,
          self_correct_hint: check.recommendation,
        };
      }
    }
  }

  return {
    allow: true,
    decision: "allow",
    message: "[Guard] Deterministic test execution flags verified.",
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
    if (
      /(?:"conversation_id"|"conversationId"|"toolCall"|"tool_call"|"workspacePaths"|"workspace_paths"|"stepIdx"|"step_idx")/.test(
        rawStdin
      )
    ) {
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
        result.reason || "Deterministic Test Guard: Action denied",
        result.self_correct_hint ? `Hint: ${result.self_correct_hint}` : null,
      ]
        .filter(Boolean)
        .join(" ");
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

function readAllStdin(timeoutMs = 500) {
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
  currentPayload = {};

  if (process.env.HOOK_PAYLOAD) {
    try {
      currentPayload = JSON.parse(process.env.HOOK_PAYLOAD);
    } catch {
      currentPayload = { command: process.env.HOOK_PAYLOAD };
    }
  } else if (currentCliArgs.command || currentCliArgs.cmd || currentCliArgs.CommandLine) {
    currentPayload = currentCliArgs;
  } else if (currentCliArgs._first) {
    currentPayload = { command: currentCliArgs._first };
  } else {
    // Only read stdin if no CLI arguments or env payloads are present
    currentStdin = await readAllStdin(500);
    if (currentStdin) {
      try {
        currentPayload = JSON.parse(currentStdin);
      } catch {
        currentPayload = { command: currentStdin };
      }
    }
  }

  const isAntigravity = isAntigravityMode(currentPayload, process.env, currentCliArgs, currentStdin);
  const result = evaluateDeterministicTestGuard(currentPayload);
  const output = formatGuardStdout(result, currentPayload, process.env, currentCliArgs, currentStdin);
  if (result.allow) {
    if (!isAntigravity) {
      output.message = "[Guard] Deterministic test execution flags verified.";
    }
    console.error("[Guard] Deterministic test execution flags verified.");
  }
  process.stdout.write(JSON.stringify(output, null, 2) + "\n");
  process.exit(0);
}

if (require.main === module) {
  main().catch((err) => {
    const errorResult = {
      allow: false,
      decision: "deny",
      reason: `Deterministic test guard internal error: ${err?.message}`,
      violation_type: "deterministic_test_guard_error",
    };
    const output = formatGuardStdout(errorResult, currentPayload, process.env, currentCliArgs, currentStdin);
    process.stdout.write(JSON.stringify(output, null, 2) + "\n");
    process.exit(0);
  });
}

module.exports = {
  inspectTestCommandSafety,
  evaluateDeterministicTestGuard,
  formatGuardStdout,
  main,
};
