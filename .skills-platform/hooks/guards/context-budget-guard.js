#!/usr/bin/env node
/**
 * Context Budget Guard (pre_tool_use, priority 15)
 * 
 * Enforces the 80k token density budget (~320KB threshold), blocking excessive
 * multi-megabyte file writes, uncontrolled command dumps, or memory bloat.
 * 
 * Zero external dependencies.
 */

const DEFAULT_MAX_CHARS = 320000;
const DEFAULT_MAX_BYTES = 327680; // 320 * 1024 bytes (320 KB)
const DEFAULT_THRESHOLD_KB = 320;

/**
 * Calculates byte size and character length of a value.
 */
function measureContent(value) {
  if (typeof value === "string") {
    return {
      chars: value.length,
      bytes: Buffer.byteLength(value, "utf8"),
    };
  }
  if (Buffer.isBuffer(value)) {
    return {
      chars: value.length,
      bytes: value.length,
    };
  }
  if (typeof value === "object" && value !== null) {
    try {
      const jsonStr = JSON.stringify(value);
      return {
        chars: jsonStr.length,
        bytes: Buffer.byteLength(jsonStr, "utf8"),
      };
    } catch {
      return { chars: 0, bytes: 0 };
    }
  }
  return { chars: 0, bytes: 0 };
}

/**
 * Inspects payload and evaluates if context budget is exceeded.
 * 
 * @param {object|string} payload 
 * @param {object} [options]
 * @returns {{ allow: boolean, reason?: string, self_correct_hint?: string, violation_type?: string, payload_size_kb?: number, threshold_size_kb?: number }}
 */
function evaluateContextBudgetGuard(payload, options = {}) {
  const maxChars = options.maxChars || DEFAULT_MAX_CHARS;
  const maxBytes = options.maxBytes || DEFAULT_MAX_BYTES;
  const thresholdKb = options.thresholdKb || DEFAULT_THRESHOLD_KB;

  if (!payload) {
    return { allow: true, decision: "allow" };
  }

  let totalBytes = 0;
  let maxSingleBytes = 0;
  let maxSingleChars = 0;

  if (typeof payload === "string") {
    const measurement = measureContent(payload);
    maxSingleChars = measurement.chars;
    maxSingleBytes = measurement.bytes;
    totalBytes = measurement.bytes;
  } else if (typeof payload === "object") {
    // Check specific high-volume fields
    const candidates = [
      payload.CodeContent,
      payload.ReplacementContent,
      payload.TargetContent,
      payload.CommandLine,
      payload.command,
      payload.content,
      payload.text,
      payload.data,
      payload.raw,
      payload.Message,
      payload.message,
    ];

    const inspectNested = (nested) => {
      if (!nested || typeof nested !== "object") return;
      candidates.push(
        nested.CodeContent,
        nested.ReplacementContent,
        nested.TargetContent,
        nested.CommandLine,
        nested.command,
        nested.content,
        nested.text,
        nested.data,
        nested.raw,
        nested.Message,
        nested.message
      );
      if (nested.toolCall && typeof nested.toolCall === "object") inspectNested(nested.toolCall);
      if (nested.tool_call && typeof nested.tool_call === "object") inspectNested(nested.tool_call);
      for (const k of ["args", "parameters", "arguments", "tool_input", "toolInput", "input"]) {
        if (nested[k] && typeof nested[k] === "object") {
          inspectNested(nested[k]);
        } else if (typeof nested[k] === "string") {
          try {
            const parsed = JSON.parse(nested[k]);
            if (parsed && typeof parsed === "object") inspectNested(parsed);
          } catch {}
        }
      }
    };
    inspectNested(payload);

    for (const item of candidates) {
      if (typeof item === "string") {
        const m = measureContent(item);
        if (m.bytes > maxSingleBytes) maxSingleBytes = m.bytes;
        if (m.chars > maxSingleChars) maxSingleChars = m.chars;
      }
    }

    // Also measure total payload serialized size
    const totalMeasurement = measureContent(payload);
    totalBytes = totalMeasurement.bytes;
    if (totalBytes > maxSingleBytes) {
      maxSingleBytes = totalBytes;
    }
    if (totalMeasurement.chars > maxSingleChars) {
      maxSingleChars = totalMeasurement.chars;
    }
  }

  const effectiveBytes = Math.max(maxSingleBytes, totalBytes);
  const sizeKb = Math.ceil(effectiveBytes / 1024);

  if (maxSingleChars > maxChars || effectiveBytes > maxBytes) {
    return {
      allow: false,
      decision: "block",
      reason: `Context budget exceeded: payload size of ${sizeKb} KB exceeds the 80k token density budget threshold (~${thresholdKb} KB limit)`,
      self_correct_hint: "Split large file modifications into smaller modular files or use incremental 'replace_file_content' to update only target sections instead of rewriting massive files.",
      violation_type: "context_budget_exceeded",
      payload_size_kb: sizeKb,
      threshold_size_kb: thresholdKb,
    };
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
        result.reason || "Context budget limit exceeded",
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

  const thresholdKb = currentCliArgs.threshold ? parseInt(currentCliArgs.threshold, 10) : (process.env.CONTEXT_BUDGET_THRESHOLD_KB ? parseInt(process.env.CONTEXT_BUDGET_THRESHOLD_KB, 10) : DEFAULT_THRESHOLD_KB);
  const maxBytes = thresholdKb * 1024;
  const maxChars = thresholdKb * 1000;

  const result = evaluateContextBudgetGuard(currentPayload, { thresholdKb, maxBytes, maxChars });
  const output = formatGuardStdout(result, currentPayload, process.env, currentCliArgs, currentStdin);
  process.stdout.write(JSON.stringify(output, null, 2) + "\n");
  process.exit(0);
}

if (require.main === module) {
  main().catch((err) => {
    const errorResult = {
      allow: false,
      decision: "deny",
      reason: `Context budget guard internal failure: ${err?.message}`,
      self_correct_hint: "Verify file and command contents.",
      violation_type: "context_budget_error",
    };
    const output = formatGuardStdout(errorResult, currentPayload, process.env, currentCliArgs, currentStdin);
    process.stdout.write(JSON.stringify(output, null, 2) + "\n");
    process.exit(0);
  });
}

module.exports = {
  DEFAULT_MAX_CHARS,
  DEFAULT_MAX_BYTES,
  DEFAULT_THRESHOLD_KB,
  measureContent,
  evaluateContextBudgetGuard,
  parseCliArgs,
  resolvePayload,
  main,
};
