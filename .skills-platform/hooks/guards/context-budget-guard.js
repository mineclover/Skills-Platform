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

  const thresholdKb = cliArgs.threshold ? parseInt(cliArgs.threshold, 10) : (process.env.CONTEXT_BUDGET_THRESHOLD_KB ? parseInt(process.env.CONTEXT_BUDGET_THRESHOLD_KB, 10) : DEFAULT_THRESHOLD_KB);
  const maxBytes = thresholdKb * 1024;
  const maxChars = thresholdKb * 1000;

  const result = evaluateContextBudgetGuard(payload, { thresholdKb, maxBytes, maxChars });
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
          reason: `Context budget guard internal failure: ${err?.message}`,
          self_correct_hint: "Verify payload size and format.",
          violation_type: "context_budget_error",
        },
        null,
        2
      ) + "\n"
    );
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
