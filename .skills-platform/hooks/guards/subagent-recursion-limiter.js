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
 * Extracts candidate source objects from payload and nested toolCall structures.
 */
function candidateSources(payload) {
  if (!payload || typeof payload !== "object") return [];
  const sources = [payload];
  if (payload.toolCall && typeof payload.toolCall === "object") {
    sources.push(payload.toolCall);
    if (payload.toolCall.args && typeof payload.toolCall.args === "object") {
      sources.push(payload.toolCall.args);
    } else if (typeof payload.toolCall.args === "string") {
      try {
        const parsed = JSON.parse(payload.toolCall.args);
        if (parsed && typeof parsed === "object") sources.push(parsed);
      } catch {}
    }
  }
  if (payload.tool_call && typeof payload.tool_call === "object") {
    sources.push(payload.tool_call);
    if (payload.tool_call.args && typeof payload.tool_call.args === "object") {
      sources.push(payload.tool_call.args);
    } else if (typeof payload.tool_call.args === "string") {
      try {
        const parsed = JSON.parse(payload.tool_call.args);
        if (parsed && typeof parsed === "object") sources.push(parsed);
      } catch {}
    }
  }
  for (const k of ["args", "parameters", "arguments", "tool_input", "toolInput", "input"]) {
    if (payload[k] && typeof payload[k] === "object") {
      sources.push(payload[k]);
    } else if (typeof payload[k] === "string") {
      try {
        const parsed = JSON.parse(payload[k]);
        if (parsed && typeof parsed === "object") sources.push(parsed);
      } catch {}
    }
  }
  return sources;
}

/**
 * Extracts invocation lineage / call chain from payload and environment.
 */
function extractLineage(payload = {}, env = process.env) {
  const sources = candidateSources(payload);
  for (const src of sources) {
    if (Array.isArray(src.call_chain)) return [...src.call_chain];
    if (Array.isArray(src.callChain)) return [...src.callChain];
    if (Array.isArray(src.lineage)) return [...src.lineage];
    if (Array.isArray(src.agent_hierarchy)) return [...src.agent_hierarchy];
    if (Array.isArray(src.ancestors)) return [...src.ancestors];

    if (typeof src.call_chain === "string") {
      return src.call_chain.split(/->|,/).map((s) => s.trim()).filter(Boolean);
    }
    if (typeof src.lineage === "string") {
      return src.lineage.split(/->|,/).map((s) => s.trim()).filter(Boolean);
    }
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
  const sources = candidateSources(payload);
  for (const src of sources) {
    if (typeof src.current_depth === "number") return src.current_depth;
    if (typeof src.currentDepth === "number") return src.currentDepth;
    if (typeof src.depth === "number") return src.depth;
    if (typeof src.subagent_depth === "number") return src.subagent_depth;

    if (typeof src.current_depth === "string" && !isNaN(Number(src.current_depth))) {
      return parseInt(src.current_depth, 10);
    }
    if (typeof src.depth === "string" && !isNaN(Number(src.depth))) {
      return parseInt(src.depth, 10);
    }
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
  const sources = candidateSources(payload);
  for (const src of sources) {
    if (typeof src.concurrent_count === "number") return src.concurrent_count;
    if (typeof src.concurrentCount === "number") return src.concurrentCount;
    if (typeof src.active_subagents === "number") return src.active_subagents;
    if (typeof src.activeSubagents === "number") return src.activeSubagents;

    if (typeof src.concurrent_count === "string" && !isNaN(Number(src.concurrent_count))) {
      return parseInt(src.concurrent_count, 10);
    }
    if (typeof src.active_subagents === "string" && !isNaN(Number(src.active_subagents))) {
      return parseInt(src.active_subagents, 10);
    }
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
        result.reason || "Subagent recursion/concurrency limit exceeded",
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

  const maxDepth = currentCliArgs["max-depth"] ? parseInt(currentCliArgs["max-depth"], 10) : MAX_DEPTH;
  const maxConcurrent = currentCliArgs["max-concurrent"] ? parseInt(currentCliArgs["max-concurrent"], 10) : MAX_CONCURRENT;

  const result = evaluateSubagentRecursionLimiter(currentPayload, { maxDepth, maxConcurrent });
  const output = formatGuardStdout(result, currentPayload, process.env, currentCliArgs, currentStdin);
  process.stdout.write(JSON.stringify(output, null, 2) + "\n");
  process.exit(0);
}

if (require.main === module) {
  main().catch((err) => {
    const errorResult = {
      allow: false,
      decision: "deny",
      reason: `Subagent recursion limiter internal failure: ${err?.message}`,
      self_correct_hint: "Verify subagent call parameters.",
      violation_type: "subagent_limiter_error",
    };
    const output = formatGuardStdout(errorResult, currentPayload, process.env, currentCliArgs, currentStdin);
    process.stdout.write(JSON.stringify(output, null, 2) + "\n");
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
