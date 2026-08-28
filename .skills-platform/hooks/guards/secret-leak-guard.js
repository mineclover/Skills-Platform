#!/usr/bin/env node
/**
 * Secret Leak Guard (pre_tool_use, priority 5)
 * 
 * Intercepts tool payloads and commands to detect and block API keys, private certificates,
 * auth headers, and environment variable dumps before execution.
 * 
 * Zero external dependencies.
 */

const fs = require("node:fs");
const path = require("node:path");

/**
 * High-precision secret detection patterns
 */
const SECRET_RULES = [
  {
    id: "AWS_ACCESS_KEY_ID",
    name: "AWS Access Key ID",
    pattern: /\b(AKIA[0-9A-Z]{16})\b/,
    description: "AWS Access Key ID (AKIA...)",
  },
  {
    id: "AWS_SECRET_ACCESS_KEY",
    name: "AWS Secret Access Key",
    pattern: /(?:aws_secret_access_key|aws_secret_key|secret_key|AWS_SECRET_ACCESS_KEY)\s*[:=]\s*["']?([A-Za-z0-9/+=]{40})["']?/i,
    description: "AWS Secret Access Key (40 characters base64)",
  },
  {
    id: "ANTHROPIC_API_KEY",
    name: "Anthropic API Key",
    pattern: /\b(sk-ant-[A-Za-z0-9_-]{20,})\b/,
    description: "Anthropic Claude API Key (sk-ant-...)",
  },
  {
    id: "OPENAI_API_KEY",
    name: "OpenAI API Key",
    pattern: /\b(sk-(?!ant-)(?:proj-)?[A-Za-z0-9_-]{20,})\b/,
    description: "OpenAI API Key (sk-..., sk-proj-...)",
  },
  {
    id: "GITHUB_TOKEN",
    name: "GitHub Token",
    pattern: /\b(gh[pousr]_[A-Za-z0-9_]{36,}|github_pat_[A-Za-z0-9_]{22,})\b/,
    description: "GitHub Personal Access / OAuth Token (ghp_..., github_pat_...)",
  },
  {
    id: "GOOGLE_API_KEY",
    name: "Google / Gemini API Key",
    pattern: /\b(AIza[0-9A-Za-z-_]{30,45})\b/,
    description: "Google / Gemini API Key (AIza...)",
  },
  {
    id: "PRIVATE_KEY",
    name: "Private Cryptographic Key",
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----/i,
    description: "Private RSA/EC/SSH cryptographic key certificate",
  },
  {
    id: "BEARER_AUTH_HEADER",
    name: "Authorization Bearer Header",
    pattern: /(?:Authorization:\s*Bearer\s+|Bearer\s+)[a-zA-Z0-9_\-\.]{20,}/i,
    description: "HTTP Authorization Bearer token header",
  },
  {
    id: "ENV_FILE_DUMP",
    name: "Environment Secret Dump",
    pattern: /(?:cat|type|more|less|tail|head|Get-Content)\s+(?:\.\/)?\.env\b|\bprintenv\b|\bexport\s+-p\b/i,
    description: "Command dumping .env file or system environment variables",
  },
];

const COMMAND_KEYS = new Set(["CommandLine", "command", "cmd", "script", "shell", "query", "exec"]);

/**
 * Recursively extracts all string values with command context metadata.
 */
function collectStringsWithContext(value, collected = [], inheritedCommand = false) {
  if (value === null || value === undefined) {
    return collected;
  }
  if (typeof value === "string") {
    collected.push({ text: value, isCommand: inheritedCommand });
  } else if (Array.isArray(value)) {
    for (const item of value) {
      collectStringsWithContext(item, collected, inheritedCommand);
    }
  } else if (typeof value === "object") {
    const isCommandTool = value.toolName === "run_command" ||
      (typeof value.toolAction === "string" && /command/i.test(value.toolAction));

    for (const key of Object.keys(value)) {
      const isCmdKey = COMMAND_KEYS.has(key) || (inheritedCommand && key !== "TargetFile");
      collectStringsWithContext(value[key], collected, isCmdKey || isCommandTool);
    }
  }
  return collected;
}

/**
 * Recursively extracts all string values from a payload (flat array).
 */
function collectAllStrings(value, collected = []) {
  if (value === null || value === undefined) {
    return collected;
  }
  if (typeof value === "string") {
    collected.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) {
      collectAllStrings(item, collected);
    }
  } else if (typeof value === "object") {
    for (const key of Object.keys(value)) {
      collectAllStrings(value[key], collected);
    }
  }
  return collected;
}

/**
 * Evaluates the payload for secret leaks.
 * 
 * @param {object|string} payload - Tool call parameters or raw payload
 * @returns {{ allow: boolean, reason?: string, self_correct_hint?: string, violation_type?: string, matched_pattern?: string }}
 */
function evaluateSecretLeakGuard(payload) {
  const items = [];

  if (typeof payload === "string") {
    try {
      const parsed = JSON.parse(payload);
      collectStringsWithContext(parsed, items, false);
    } catch {
      items.push({ text: payload, isCommand: true });
    }
  } else if (typeof payload === "object" && payload !== null) {
    collectStringsWithContext(payload, items, false);
  }

  for (const item of items) {
    if (!item.text || typeof item.text !== "string") continue;

    for (const rule of SECRET_RULES) {
      // ENV_FILE_DUMP is a command execution attack, do not false-positive on source code/docs
      if (rule.id === "ENV_FILE_DUMP" && !item.isCommand) {
        continue;
      }

      const match = rule.pattern.exec(item.text);
      if (match) {
        return {
          allow: false,
          decision: "block",
          reason: `Secret leak prevented: payload contains sensitive credential matching pattern '${rule.description}'`,
          self_correct_hint: "Never hardcode private API keys, tokens, or private certificates in commands or files. Use environment variables (e.g. process.env.KEY_NAME) or a secret manager instead.",
          violation_type: "secret_leak",
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
function readAllStdin(timeoutMs = 15) {
  return new Promise((resolve) => {
    if (process.stdin.isTTY || process.stdin.readableEnded || !process.stdin.readable) {
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
 * CLI Main execution
 */
async function main(argv = process.argv.slice(2)) {
  const cliArgs = parseCliArgs(argv);
  const stdinData = await readAllStdin();
  const payload = resolvePayload(cliArgs, process.env, stdinData);

  const result = evaluateSecretLeakGuard(payload);
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  process.exit(0);
}

if (require.main === module) {
  main().catch((err) => {
    process.stdout.write(
      JSON.stringify(
        {
          allow: false,
          decision: "block",
          reason: `Secret leak guard internal failure: ${err?.message}`,
          self_correct_hint: "Verify tool payload format.",
          violation_type: "secret_leak_error",
        },
        null,
        2
      ) + "\n"
    );
    process.exit(0);
  });
}

module.exports = {
  SECRET_RULES,
  COMMAND_KEYS,
  collectAllStrings,
  collectStringsWithContext,
  evaluateSecretLeakGuard,
  parseCliArgs,
  resolvePayload,
  main,
};
