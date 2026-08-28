#!/usr/bin/env node
/**
 * Subagent Recursion Limiter (pre_tool_use, priority 25)
 * 
 * Enforces safety ceilings on subagent invocations:
 * - Maximum invocation recursion depth (ceiling: 3)
 * - Maximum active concurrent subagents (ceiling: 4)
 * - Circular delegation prevention (Agent A -> Agent B -> Agent A loop detection)
 * 
 * Zero external dependencies.
 */

const fs = require("node:fs");
const path = require("node:path");

const MAX_DEPTH = 3;
const MAX_CONCURRENT = 4;

/**
 * Extracts invocation lineage / call chain from payload and environment.
 */
function extractLineage(payload = {}, env = process.env) {
  if (Array.isArray(payload.call_chain)) return [...payload.call_chain];
  if (Array.isArray(payload.callChain)) return [...payload.callChain];
  if (Array.isArray(payload.lineage)) return [...payload.lineage];
  if (Array.isArray(payload.agent_hierarchy)) return [...payload.agent_hierarchy];
  if (Array.isArray(payload.ancestors)) return [...payload.ancestors];

  if (typeof payload.call_chain === "string") {
    return payload.call_chain.split(/->|,/).map((s) => s.trim()).filter(Boolean);
  }
  if (typeof payload.lineage === "string") {
    return payload.lineage.split(/->|,/).map((s) => s.trim()).filter(Boolean);
  }

  if (env.SUBAGENT_LINEAGE) {
    return env.SUBAGENT_LINEAGE.split(/->|,/).map((s) => s.trim()).filter(Boolean);
  }

  return [];
}

/**
 * Extracts current invocation depth from payload or lineage.
 */
function extractCurrentDepth(payload = {}, lineage = [], env = process.env) {
  if (typeof payload.current_depth === "number") return payload.current_depth;
  if (typeof payload.currentDepth === "number") return payload.currentDepth;
  if (typeof payload.depth === "number") return payload.depth;
  if (typeof payload.subagent_depth === "number") return payload.subagent_depth;

  if (typeof payload.current_depth === "string" && !isNaN(Number(payload.current_depth))) {
    return parseInt(payload.current_depth, 10);
  }
  if (typeof payload.depth === "string" && !isNaN(Number(payload.depth))) {
    return parseInt(payload.depth, 10);
  }

  if (lineage.length > 0) {
    return lineage.length;
  }

  if (env.SUBAGENT_DEPTH && !isNaN(Number(env.SUBAGENT_DEPTH))) {
    return parseInt(env.SUBAGENT_DEPTH, 10);
  }

  return 1;
}

/**
 * Extracts concurrent subagent count from payload and environment.
 */
function extractConcurrentCount(payload = {}, env = process.env) {
  if (typeof payload.concurrent_count === "number") return payload.concurrent_count;
  if (typeof payload.concurrentCount === "number") return payload.concurrentCount;
  if (typeof payload.active_subagents === "number") return payload.active_subagents;
  if (typeof payload.activeSubagents === "number") return payload.activeSubagents;

  if (typeof payload.concurrent_count === "string" && !isNaN(Number(payload.concurrent_count))) {
    return parseInt(payload.concurrent_count, 10);
  }
  if (typeof payload.active_subagents === "string" && !isNaN(Number(payload.active_subagents))) {
    return parseInt(payload.active_subagents, 10);
  }

  if (env.ACTIVE_SUBAGENT_COUNT && !isNaN(Number(env.ACTIVE_SUBAGENT_COUNT))) {
    return parseInt(env.ACTIVE_SUBAGENT_COUNT, 10);
  }

  return 1;
}

/**
 * Evaluates the payload for subagent recursion, concurrency, or loop violations.
 * 
 * @param {object|string} payload 
 * @param {object} [options]
 * @returns {{ allow: boolean, reason?: string, self_correct_hint?: string, violation_type?: string, current_depth?: number, max_depth?: number, active_subagents?: number, max_concurrent?: number, call_chain?: string[] }}
 */
function evaluateSubagentRecursionLimiter(payload, options = {}) {
  const maxDepth = options.maxDepth || MAX_DEPTH;
  const maxConcurrent = options.maxConcurrent || MAX_CONCURRENT;

  let parsedPayload = payload;
  if (typeof payload === "string") {
    try {
      parsedPayload = JSON.parse(payload);
    } catch {
      parsedPayload = { raw: payload };
    }
  } else if (!payload || typeof payload !== "object") {
    parsedPayload = {};
  }

  const lineage = extractLineage(parsedPayload, process.env);
  const currentDepth = extractCurrentDepth(parsedPayload, lineage, process.env);
  const concurrentCount = extractConcurrentCount(parsedPayload, process.env);

  // 1. Recursion Depth Ceiling Check
  if (currentDepth > maxDepth) {
    return {
      allow: false,
      decision: "block",
      reason: `Subagent recursion limit reached: invocation depth ${currentDepth} exceeds maximum ceiling of ${maxDepth}`,
      self_correct_hint: "Flatten the agent hierarchy. Synthesize findings within the current agent scope and return answers directly to parent instead of spawning nested subagents.",
      violation_type: "subagent_recursion_limit",
      current_depth: currentDepth,
      max_depth: maxDepth,
    };
  }

  // 2. Concurrency Ceiling Check
  if (concurrentCount > maxConcurrent) {
    return {
      allow: false,
      decision: "block",
      reason: `Subagent concurrency limit reached: active concurrent subagents (${concurrentCount}) exceeds maximum concurrency ceiling of ${maxConcurrent}`,
      self_correct_hint: "Execute subagent tasks sequentially or batch tasks to keep concurrent subagent count within 4.",
      violation_type: "subagent_concurrency_limit",
      active_subagents: concurrentCount,
      max_concurrent: maxConcurrent,
    };
  }

  // 3. Circular Delegation Check
  const targetAgent = parsedPayload.target_agent || parsedPayload.targetAgent || parsedPayload.Recipient || parsedPayload.recipient || parsedPayload.agent_id;
  if (targetAgent && lineage.length > 0) {
    const normTarget = String(targetAgent).toLowerCase();
    const isLoop = lineage.some((ancestor) => String(ancestor).toLowerCase() === normTarget);
    if (isLoop) {
      const loopChain = [...lineage, targetAgent];
      return {
        allow: false,
        decision: "block",
        reason: `Circular subagent delegation detected: call chain contains loop [${loopChain.join(" -> ")}]`,
        self_correct_hint: "Avoid delegating tasks back to an ancestor agent in the active lineage.",
        violation_type: "circular_delegation",
        call_chain: loopChain,
      };
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

  const maxDepth = cliArgs["max-depth"] ? parseInt(cliArgs["max-depth"], 10) : MAX_DEPTH;
  const maxConcurrent = cliArgs["max-concurrent"] ? parseInt(cliArgs["max-concurrent"], 10) : MAX_CONCURRENT;

  const result = evaluateSubagentRecursionLimiter(payload, { maxDepth, maxConcurrent });
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
          reason: `Subagent recursion limiter internal failure: ${err?.message}`,
          self_correct_hint: "Verify subagent call parameters.",
          violation_type: "subagent_limiter_error",
        },
        null,
        2
      ) + "\n"
    );
    process.exit(0);
  });
}

module.exports = {
  MAX_DEPTH,
  MAX_CONCURRENT,
  extractLineage,
  extractCurrentDepth,
  extractConcurrentCount,
  evaluateSubagentRecursionLimiter,
  parseCliArgs,
  resolvePayload,
  main,
};
