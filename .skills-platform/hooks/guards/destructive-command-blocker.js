#!/usr/bin/env node
/**
 * Destructive Command Blocker (pre_tool_use, priority 10)
 * 
 * Intercepts run_command and shell executions to detect and block catastrophic actions:
 * - Recursive root/system deletion (rm -rf /, del /s /q, rmdir /s /q c:\)
 * - Catastrophic git state loss (git reset --hard, git clean -fd, git push --force)
 * - Database drop/truncate operations (DROP DATABASE, TRUNCATE TABLE)
 * - Drive formatting and raw block device overwrites (format c:, fdisk, dd if=...)
 * - Fork bombs and system shutdowns
 * 
 * Zero external dependencies.
 */

const DESTRUCTIVE_RULES = [
  {
    id: "ROOT_FILESYSTEM_DELETION",
    name: "Root / System Recursive Deletion",
    pattern: /(?:\brm\s+(?:-[a-zA-Z0-9_-]+\s+|--[a-zA-Z0-9_-]+\s+)*(?:-[a-zA-Z0-9]*[rR][a-zA-Z0-9]*|--recursive)(?:\s+-[a-zA-Z0-9_-]+|\s+--[a-zA-Z0-9_-]+)*\s+(?:\/|~|\*|\/\*|~\/|\.\.|\/etc|\/usr|\/bin|\/var|\/root)(?=[\s/;\\]|$)|\brm\s+(?:\/|~|\*|\/\*|~\/|\.\.|\/etc|\/usr|\/bin|\/var|\/root)(?=[\s/;\\]|$)(?:\s+-[a-zA-Z0-9_-]+|\s+--[a-zA-Z0-9_-]+)*\s+(?:-[a-zA-Z0-9]*[rR][a-zA-Z0-9]*|--recursive)\b(?:\s+-[a-zA-Z0-9_-]+|\s+--[a-zA-Z0-9_-]+)*|\bdel\s+(?:(?:\/[fFsSqQ]|\-[fFsSqQ])\s+)*(?:[cC]:\\?|\*|\.\.|\/|~)(?=[\s/;\\]|$)|\b(?:rmdir|rd)\s+(?:(?:(?:\/[sSqQ]|\-[sSqQ])\s+)+[cC]:\\?|[cC]:\\?(?:\s+(?:\/[sSqQ]|\-[sSqQ]))+)|\b(?:Remove-Item|ri)\s+(?:-[a-zA-Z0-9_-]+(?:\s+[^\s;&|]+)?\s+)*-(?:Recurse|r)\b(?:\s+-[a-zA-Z0-9_-]+(?:\s+[^\s;&|]+)?)*(?:\s+-[a-zA-Z0-9_-]+)?\s+(?:[cC]:\\?|\/|~|\*|\.\.)(?=[\s/;\\]|$)|\b(?:Remove-Item|ri)\s+(?:-[a-zA-Z0-9_-]+\s+)*(?:[cC]:\\?|\/|~|\*|\.\.)(?=[\s/;\\]|$)(?:\s+-[a-zA-Z0-9_-]+(?:\s+[^\s;&|]+)?)*\s+-(?:Recurse|r)\b)/i,
    description: "Root or system-wide recursive filesystem deletion",
  },
  {
    id: "GIT_RESET_HARD",
    name: "Git Reset Hard",
    pattern: /\bgit\s+reset\s+--hard\b/i,
    description: "Hard git reset destroys working tree and uncommitted changes",
  },
  {
    id: "GIT_CLEAN_FORCE",
    name: "Git Clean Force",
    pattern: /\bgit\s+clean\s+(?:-[a-zA-Z0-9_-]+\s+|--[a-zA-Z0-9_-]+\s+)*(?:-[a-zA-Z]*f[a-zA-Z]*|--force)\b/i,
    description: "Forced git clean unrecoverably wipes untracked files",
  },
  {
    id: "GIT_FORCE_PUSH",
    name: "Git Force Push",
    pattern: /\bgit\s+push\s+.*(?:\-\-force|-f|\+[a-zA-Z0-9_\-\/]+)\b/i,
    description: "Force-pushing may overwrite remote repository branch history",
  },
  {
    id: "GIT_BRANCH_FORCE_DELETE",
    name: "Git Protection Branch Deletion",
    pattern: /\bgit\s+branch\s+-[dD]\s+(?:main|master|prod|production|release)\b/i,
    description: "Forced deletion of primary production branches",
  },
  {
    id: "DB_DROP_OPERATION",
    name: "Database / Table Drop",
    pattern: /\bDROP\s+(?:DATABASE|SCHEMA|TABLE)\b/i,
    description: "Destructive database or table drop command",
  },
  {
    id: "DB_TRUNCATE_OPERATION",
    name: "Database Truncate",
    pattern: /\bTRUNCATE\s+(?:TABLE\s+)?[a-zA-Z0-9_\.\"]+\b/i,
    description: "Destructive database table truncate command",
  },
  {
    id: "DISK_FORMAT",
    name: "Disk Volume Formatting",
    pattern: /\bformat\s+[a-zA-Z]:/i,
    description: "Disk volume formatting command",
  },
  {
    id: "DISK_PARTITION_RAW",
    name: "Raw Partition / Filesystem Utility",
    pattern: /\b(?:mkfs(?:\.[a-z0-9]+)?|diskpart|fdisk)\b/i,
    description: "Raw partition table or disk filesystem formatting utility",
  },
  {
    id: "RAW_DEVICE_OVERWRITE",
    name: "Raw Device Overwrite (dd)",
    pattern: /\bdd\s+if=.*of=(?:\/dev\/[sh]d[a-z]|\/dev\/nvme|\/dev\/disk|\/dev\/null)/i,
    description: "Raw disk block overwrite using dd",
  },
  {
    id: "FORK_BOMB",
    name: "Shell Fork Bomb",
    pattern: /:(){ :|:& };:/,
    description: "Shell fork bomb process exhaustion attack",
  },
  {
    id: "SYSTEM_SHUTDOWN",
    name: "System Shutdown / Reboot",
    pattern: /\b(?:shutdown(?:\s+.*)?|init\s+0|halt(?:\s+-[a-zA-Z]+)?|reboot(?:\s+-[a-zA-Z]+)?)\b/i,
    description: "System shutdown, reboot, or halt command",
  },
];

/**
 * Extracts candidate command strings from tool payload.
 */
function extractCommandStrings(payload) {
  const commands = [];
  if (!payload) return commands;

  if (typeof payload === "string") {
    commands.push(payload);
    try {
      const parsed = JSON.parse(payload);
      commands.push(...extractCommandStrings(parsed));
    } catch {
      // plain text
    }
    return commands;
  }

  if (typeof payload === "object") {
    // Explicit known command keys
    if (typeof payload.CommandLine === "string") commands.push(payload.CommandLine);
    if (typeof payload.command === "string") commands.push(payload.command);
    if (typeof payload.cmd === "string") commands.push(payload.cmd);
    if (typeof payload.script === "string") commands.push(payload.script);
    if (typeof payload.query === "string") commands.push(payload.query);
    if (typeof payload.sql === "string") commands.push(payload.sql);

    // Also check raw string if payload was parsed from non-JSON stdin
    if (typeof payload.raw === "string") {
      commands.push(payload.raw);
      try {
        const parsed = JSON.parse(payload.raw);
        commands.push(...extractCommandStrings(parsed));
      } catch {
        // raw plain text
      }
    }

    // Also check parameters or nested objects
    for (const key of ["parameters", "arguments", "args", "tool_input", "toolInput", "input", "toolCall", "tool_call"]) {
      const val = payload[key];
      if (val && typeof val === "object") {
        commands.push(...extractCommandStrings(val));
      } else if (typeof val === "string") {
        try {
          const parsed = JSON.parse(val);
          if (parsed && typeof parsed === "object") {
            commands.push(...extractCommandStrings(parsed));
          }
        } catch {
          // not a json string
        }
      }
    }
  }

  return commands;
}

/**
 * Evaluates the payload for destructive command violations.
 * 
 * @param {object|string} payload - Tool call parameters or raw payload
 * @returns {{ allow: boolean, reason?: string, self_correct_hint?: string, violation_type?: string, matched_pattern?: string }}
 */
function evaluateDestructiveCommandBlocker(payload) {
  const commands = extractCommandStrings(payload);

  for (const cmd of commands) {
    if (!cmd || typeof cmd !== "string") continue;

    for (const rule of DESTRUCTIVE_RULES) {
      if (rule.pattern.test(cmd)) {
        return {
          allow: false,
          decision: "block",
          reason: `Destructive command blocked: attempted execution of prohibited catastrophic command matching rule '${rule.description}'`,
          self_correct_hint: "Catastrophic filesystem deletions, hard git resets, database drop/truncates, and disk formatting are strictly blocked. Target specific workspace files safely or use non-destructive alternatives.",
          violation_type: "destructive_command",
          matched_pattern: rule.id,
        };
      }
    }
  }

  return { allow: true, decision: "allow" };
}

/**
 * Parses CLI arguments into key-value map.
 */
function parseCliArgs(argv = process.argv.slice(2)) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      if (i + 1 < argv.length && !argv[i + 1].startsWith("--")) {
        args[key] = argv[++i];
      } else {
        args[key] = true;
      }
    }
  }
  return args;
}

/**
 * Reads all data from stdin with short timeout.
 */
function readAllStdin(timeoutMs = 3000) {
  return new Promise((resolve) => {
    if (process.stdin.isTTY || process.stdin.readableEnded) {
      return resolve("");
    }
    let data = "";
    let completed = false;

    function finish() {
      if (!completed) {
        completed = true;
        resolve(data);
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

/**
 * Resolves payload from environment variables, CLI arguments, or stdin.
 */
function resolvePayload(cliArgs = {}, env = process.env, stdinData = "") {
  if (env.HOOK_PAYLOAD) {
    try {
      return JSON.parse(env.HOOK_PAYLOAD);
    } catch {
      return { raw: env.HOOK_PAYLOAD };
    }
  }
  if (cliArgs.payload || cliArgs["event-json"] || cliArgs.event_json) {
    const raw = cliArgs.payload || cliArgs["event-json"] || cliArgs.event_json;
    try {
      return JSON.parse(raw);
    } catch {
      return { raw };
    }
  }
  if (stdinData && stdinData.trim()) {
    try {
      return JSON.parse(stdinData.trim());
    } catch {
      return { raw: stdinData.trim() };
    }
  }
  return cliArgs;
}

/**
 * Checks if current execution is in Antigravity mode.
 */
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

/**
 * CLI Main execution
 */
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
        result.reason || "Destructive command blocked by safety policy",
        result.self_correct_hint ? `Hint: ${result.self_correct_hint}` : null,
      ].filter(Boolean).join(" ");
      return { decision: "deny", reason };
    }
    return { decision: "allow" };
  }
  return result;
}

let currentPayload = {};
let currentStdin = "";
let currentCliArgs = {};

async function main(argv = process.argv.slice(2)) {
  currentCliArgs = parseCliArgs(argv);
  currentStdin = await readAllStdin();
  currentPayload = resolvePayload(currentCliArgs, process.env, currentStdin);

  const result = evaluateDestructiveCommandBlocker(currentPayload);
  const output = formatGuardStdout(result, currentPayload, process.env, currentCliArgs, currentStdin);
  process.stdout.write(JSON.stringify(output, null, 2) + "\n");
  process.exit(0);
}

if (require.main === module) {
  main().catch((err) => {
    const errorResult = {
      allow: false,
      decision: "deny",
      reason: `Destructive command blocker internal failure: ${err?.message}`,
      self_correct_hint: "Verify command payload syntax.",
      violation_type: "destructive_command_error",
    };
    const output = formatGuardStdout(errorResult, currentPayload, process.env, currentCliArgs, currentStdin);
    process.stdout.write(JSON.stringify(output, null, 2) + "\n");
    process.exit(0);
  });
}

module.exports = {
  DESTRUCTIVE_RULES,
  extractCommandStrings,
  evaluateDestructiveCommandBlocker,
  parseCliArgs,
  resolvePayload,
  main,
};
