const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawnSync } = require("node:child_process");

const {
  evaluateContextBudgetGuard,
  DEFAULT_MAX_CHARS,
  DEFAULT_MAX_BYTES,
  DEFAULT_THRESHOLD_KB,
} = require("../../../.skills-platform/hooks/guards/context-budget-guard.js");

const {
  evaluateScopeBoundaryEnforcer,
  normalizePath,
  matchPattern,
  extractTargetFiles,
} = require("../../../.skills-platform/hooks/guards/scope-boundary-enforcer.js");

const {
  evaluateSubagentRecursionLimiter,
  extractLineage,
  extractCurrentDepth,
  extractConcurrentCount,
  MAX_DEPTH,
  MAX_CONCURRENT,
} = require("../../../.skills-platform/hooks/guards/subagent-recursion-limiter.js");

const GUARDS_DIR = path.resolve(__dirname, "../../../.skills-platform/hooks/guards");

function runSubprocess(scriptName, payload, extraArgs = [], extraEnv = {}, input = null) {
  const scriptPath = path.resolve(GUARDS_DIR, scriptName);
  const args = [scriptPath, ...extraArgs];
  const env = {
    ...process.env,
    HOOK_EVENT: "pre_tool_use",
    SKILLS_PLATFORM_DISABLE_TELEMETRY: "1",
    ...extraEnv,
  };
  let inputStr = input;
  if (payload !== undefined && payload !== null) {
    if (typeof payload === "string" && payload.length > 4000) {
      inputStr = payload;
    } else if (typeof payload === "object" && JSON.stringify(payload).length > 4000) {
      inputStr = JSON.stringify(payload);
    } else if (typeof payload === "string") {
      args.push("--payload", payload);
    } else {
      args.push("--payload", JSON.stringify(payload));
    }
  }

  const result = spawnSync(process.execPath, args, {
    env,
    input: inputStr,
    encoding: "utf8",
    timeout: 10000,
  });

  assert.equal(result.status, 0, `Subprocess ${scriptName} failed: stderr=${result.stderr}`);
  return JSON.parse(result.stdout.trim());
}

// ============================================================================
// SECTION 1: CONTEXT BUDGET GUARD EMPIRICAL STRESS TESTS
// ============================================================================

test("Context Budget Guard Stress: Raw String Exact Character Boundary (320,000 vs 320,001 chars)", () => {
  // Raw string of exactly 320,000 chars -> PASS
  const raw320k = "a".repeat(320000);
  const passResult = evaluateContextBudgetGuard(raw320k);
  assert.equal(passResult.allow, true, "Raw string payload of exactly 320,000 characters must pass");

  // Raw string of 320,001 chars -> BLOCK
  const raw320kPlus1 = "a".repeat(320001);
  const blockResult = evaluateContextBudgetGuard(raw320kPlus1);
  assert.equal(blockResult.allow, false, "Raw string payload of 320,001 characters must be blocked");
  assert.equal(blockResult.violation_type, "context_budget_exceeded");
  assert.equal(blockResult.threshold_size_kb, 320);
  assert.ok(blockResult.payload_size_kb >= 313);
  assert.ok(blockResult.reason.includes("Context budget exceeded"));
  assert.ok(blockResult.self_correct_hint);
});

test("Context Budget Guard Stress: Raw Exact Byte Boundary (327,680 vs 327,681 bytes)", () => {
  // Isolate byte boundary by setting maxChars high
  const exact327680Bytes = "b".repeat(327680);
  const passBytes = evaluateContextBudgetGuard(exact327680Bytes, { maxChars: 500000 });
  assert.equal(passBytes.allow, true, "Raw payload of exactly 327,680 bytes must pass");

  const over327680Bytes = "b".repeat(327681);
  const blockBytes = evaluateContextBudgetGuard(over327680Bytes, { maxChars: 500000 });
  assert.equal(blockBytes.allow, false, "Raw payload of 327,681 bytes must be blocked");
  assert.equal(blockBytes.violation_type, "context_budget_exceeded");
});

test("Context Budget Guard Stress: Object Wrapping Overhead Measurement", () => {
  // In object payloads, JSON serialization overhead is factored in
  const payload320k = { CodeContent: "a".repeat(320000) };
  const res = evaluateContextBudgetGuard(payload320k);
  // Total JSON length is 320,017 chars -> exceeds 320,000 chars
  assert.equal(res.allow, false);
  assert.equal(res.violation_type, "context_budget_exceeded");

  // Payload adjusted for JSON wrapping: 319,900 chars in CodeContent -> fits within 320,000 chars
  const payloadAdjusted = { CodeContent: "a".repeat(319900) };
  const resAdjusted = evaluateContextBudgetGuard(payloadAdjusted);
  assert.equal(resAdjusted.allow, true);
});

test("Context Budget Guard Stress: UTF-8 Multi-Byte Character Expansion", () => {
  // 170,000 2-byte characters (e.g. 'é') = 170,000 chars (< 320,000 chars) but 340,000 bytes (> 327,680 bytes)
  const multiByteStr = "é".repeat(170000);
  assert.equal(multiByteStr.length, 170000);
  assert.equal(Buffer.byteLength(multiByteStr, "utf8"), 340000);

  const result = evaluateContextBudgetGuard({ ReplacementContent: multiByteStr });
  assert.equal(result.allow, false, "170k 2-byte chars (340KB) must be blocked due to byte limit");
  assert.equal(result.violation_type, "context_budget_exceeded");
  assert.equal(result.payload_size_kb, 333);

  // 4-byte emojis: 90,000 emojis = 180,000 code units (JS length) but 360,000 bytes
  const emojiStr = "🚀".repeat(90000);
  assert.equal(Buffer.byteLength(emojiStr, "utf8"), 360000);
  const emojiResult = evaluateContextBudgetGuard({ Message: emojiStr });
  assert.equal(emojiResult.allow, false, "90k 4-byte emojis (360KB) must be blocked");
});

test("Context Budget Guard Stress: Multi-Megabyte High Volume Payloads (2MB, 5MB, 10MB)", () => {
  const sizes = [2 * 1024 * 1024, 5 * 1024 * 1024, 10 * 1024 * 1024];

  for (const size of sizes) {
    const hugeStr = "Z".repeat(size);
    const start = performance.now();
    const result = evaluateContextBudgetGuard({ CodeContent: hugeStr });
    const duration = performance.now() - start;

    assert.equal(result.allow, false);
    assert.equal(result.violation_type, "context_budget_exceeded");
    assert.ok(result.payload_size_kb >= size / 1024);
    assert.ok(duration < 50, `Evaluating ${size / (1024 * 1024)}MB took ${duration}ms, expected < 50ms`);
  }
});

test("Context Budget Guard Stress: Aggregate Payload Serialization Limit", () => {
  // An object with 40 fields of 10KB each (total 400KB), but each field < 320KB
  const payload = {};
  for (let i = 0; i < 40; i++) {
    payload[`field_${i}`] = "x".repeat(10240);
  }
  const result = evaluateContextBudgetGuard(payload);
  assert.equal(result.allow, false, "Aggregate payload of 400KB must be blocked even if single fields are 10KB");
  assert.equal(result.violation_type, "context_budget_exceeded");
});

test("Context Budget Guard Stress: Nested Candidate Property Coverage", () => {
  const fields = [
    "CodeContent",
    "ReplacementContent",
    "TargetContent",
    "CommandLine",
    "command",
    "content",
    "text",
    "data",
    "raw",
    "Message",
    "message",
  ];

  for (const field of fields) {
    const payload = { [field]: "M".repeat(330000) };
    const result = evaluateContextBudgetGuard(payload);
    assert.equal(result.allow, false, `Field ${field} must trigger budget violation`);
    assert.equal(result.violation_type, "context_budget_exceeded");
  }
});

test("Context Budget Guard Stress: Edge Case Types (null, undefined, non-objects, empty)", () => {
  assert.equal(evaluateContextBudgetGuard(null).allow, true);
  assert.equal(evaluateContextBudgetGuard(undefined).allow, true);
  assert.equal(evaluateContextBudgetGuard("").allow, true);
  assert.equal(evaluateContextBudgetGuard({}).allow, true);
  assert.equal(evaluateContextBudgetGuard(12345).allow, true);
  assert.equal(evaluateContextBudgetGuard(false).allow, true);
});

test("Context Budget Guard Stress: CLI execution with custom --threshold flag and env var", () => {
  const payload55k = { CodeContent: "q".repeat(55 * 1024) };

  // Test --threshold 50 flag (50 KB threshold) via stdin/pipe
  const resThresholdFlag = runSubprocess("context-budget-guard.js", payload55k, ["--threshold", "50"]);
  assert.equal(resThresholdFlag.allow, false);
  assert.equal(resThresholdFlag.threshold_size_kb, 50);

  // Test CONTEXT_BUDGET_THRESHOLD_KB env var via stdin/pipe
  const resEnvVar = runSubprocess("context-budget-guard.js", payload55k, [], {
    CONTEXT_BUDGET_THRESHOLD_KB: "50",
  });
  assert.equal(resEnvVar.allow, false);
  assert.equal(resEnvVar.threshold_size_kb, 50);
});

// ============================================================================
// SECTION 2: SCOPE BOUNDARY ENFORCER EMPIRICAL STRESS TESTS
// ============================================================================

test("Scope Boundary Enforcer Stress: Strict Out-of-Bounds Enforcement & Telemetry Emission", () => {
  const tmpTelemetryDir = fs.mkdtempSync(path.join(os.tmpdir(), "scope-telemetry-test-"));
  const spec = {
    topic_id: "topic:payments-api",
    local_horizontal_scope: {
      owned_files: ["src/payments/charge.js", "src/payments/refund.js"],
      out_of_bounds: ["src/auth/keys.env", "packages/core/db/*"],
    },
  };

  try {
    const violation = evaluateScopeBoundaryEnforcer(
      { TargetFile: "src/auth/keys.env" },
      { spec, projectRoot: tmpTelemetryDir, recordTelemetry: true }
    );

    assert.equal(violation.allow, false);
    assert.equal(violation.violation_type, "scope_out_of_bounds");
    assert.equal(violation.topic_id, "topic:payments-api");
    assert.equal(violation.mutated_file, "src/auth/keys.env");
    assert.ok(violation.reason.includes("prohibited out_of_bounds list"));
    assert.ok(violation.self_correct_hint);

    // Verify telemetry event written
    const telemetryFile = path.join(tmpTelemetryDir, ".skills-platform", "telemetry", "events.ndjson");
    assert.ok(fs.existsSync(telemetryFile), "Telemetry file must be created on scope breach");
    const rawLine = fs.readFileSync(telemetryFile, "utf8").trim();
    const event = JSON.parse(rawLine);
    assert.equal(event.outcome, "scope_mismatch");
    assert.equal(event.evidence_type, "incident");
    assert.equal(event.topic_id, "topic:payments-api");
    assert.equal(event.mutated_file, "src/auth/keys.env");
  } finally {
    fs.rmSync(tmpTelemetryDir, { recursive: true, force: true });
  }
});

test("Scope Boundary Enforcer Bug Reproduction: Globstar (**) Replacement Overwrite Flaw", () => {
  const pattern = "packages/core/db/**";
  const target = "packages/core/db/migrations/001.sql";
  const isMatched = matchPattern(target, pattern);
  assert.equal(isMatched, true, "Fixed: matchPattern returns true on recursive subpaths for globstar pattern");
});

test("Scope Boundary Enforcer Bug Reproduction: Root-anchored Extension Glob Bypass", () => {
  assert.equal(matchPattern(".env", "*.env"), true);
  assert.equal(matchPattern("src/secrets.env", "*.env"), true, "Fixed: *.env matches nested subdirectory files");
});

test("Scope Boundary Enforcer Stress: Path Normalization Across URI schemes & Backslashes", () => {
  const root = "C:/Users/minec/Skills-Platform";

  // Windows absolute backslash path
  assert.equal(normalizePath("C:\\Users\\minec\\Skills-Platform\\src\\index.js", root), "src/index.js");

  // file:/// URI scheme
  assert.equal(normalizePath("file:///C:/Users/minec/Skills-Platform/src/auth.js", root), "src/auth.js");
  assert.equal(normalizePath("file://C:/Users/minec/Skills-Platform/src/auth.js", root), "src/auth.js");

  // Leading dot-slash
  assert.equal(normalizePath("./src/components/Button.tsx", root), "src/components/Button.tsx");

  // Redundant slashes
  assert.equal(normalizePath("src///components//Button.tsx", root), "src/components/Button.tsx");
});

test("Scope Boundary Enforcer Stress: Multiple Target Files in Array (Batch Mutations)", () => {
  const spec = {
    topic_id: "topic:orders",
    local_horizontal_scope: {
      owned_files: ["src/orders/*"],
      out_of_bounds: ["src/secrets/*"],
    },
  };

  // Mixed batch: one owned, one out of bounds
  const payload = {
    files: ["src/orders/list.js", "src/secrets/jwt.key"],
  };

  const result = evaluateScopeBoundaryEnforcer(payload, { spec });
  assert.equal(result.allow, false);
  assert.equal(result.violation_type, "scope_out_of_bounds");
  assert.equal(result.mutated_file, "src/secrets/jwt.key");
});

test("Scope Boundary Enforcer Stress: Nested Parameter Extraction", () => {
  const spec = {
    topic_id: "topic:billing",
    local_horizontal_scope: {
      owned_files: ["src/billing/*"],
      out_of_bounds: ["src/config/*"],
    },
  };

  const nestedPayload = {
    action: "edit_file",
    parameters: {
      TargetFile: "src/config/keys.json",
    },
  };

  const result = evaluateScopeBoundaryEnforcer(nestedPayload, { spec });
  assert.equal(result.allow, false);
  assert.equal(result.violation_type, "scope_out_of_bounds");
  assert.equal(result.mutated_file, "src/config/keys.json");
});

test("Scope Boundary Enforcer Stress: Open Fallback when No Spec Configured", () => {
  assert.equal(evaluateScopeBoundaryEnforcer({ TargetFile: "any/file.js" }, { spec: null }).allow, true);
  assert.equal(evaluateScopeBoundaryEnforcer({ TargetFile: "any/file.js" }, { spec: {} }).allow, true);
  assert.equal(evaluateScopeBoundaryEnforcer({ TargetFile: "any/file.js" }, { spec: { local_horizontal_scope: null } }).allow, true);
});

// ============================================================================
// SECTION 3: SUBAGENT RECURSION LIMITER EMPIRICAL STRESS TESTS
// ============================================================================

test("Subagent Recursion Limiter Stress: Depth Boundary (<=3 PASS vs >3 BLOCK)", () => {
  // Depth 0, 1, 2, 3 -> ALL PASS
  for (let d = 0; d <= 3; d++) {
    const result = evaluateSubagentRecursionLimiter({ depth: d });
    assert.equal(result.allow, true, `Depth ${d} must pass`);
  }

  // Depth 4, 5, 10, 100 -> ALL BLOCK
  for (const d of [4, 5, 10, 100]) {
    const result = evaluateSubagentRecursionLimiter({ depth: d });
    assert.equal(result.allow, false, `Depth ${d} must be blocked`);
    assert.equal(result.violation_type, "subagent_recursion_limit");
    assert.equal(result.current_depth, d);
    assert.equal(result.max_depth, 3);
    assert.ok(result.reason.includes(`invocation depth ${d} exceeds maximum ceiling of 3`));
    assert.ok(result.self_correct_hint);
  }
});

test("Subagent Recursion Limiter Stress: String Depth Coercion & Lineage Inferred Depth", () => {
  // String depth parsing
  assert.equal(evaluateSubagentRecursionLimiter({ depth: "3" }).allow, true);
  assert.equal(evaluateSubagentRecursionLimiter({ depth: "4" }).allow, false);

  // Depth inferred from lineage array length
  const lineage3 = ["orchestrator", "worker_1", "worker_sub_2"];
  assert.equal(evaluateSubagentRecursionLimiter({ lineage: lineage3 }).allow, true);

  const lineage4 = ["orchestrator", "worker_1", "worker_sub_2", "worker_sub_3"];
  const res4 = evaluateSubagentRecursionLimiter({ lineage: lineage4 });
  assert.equal(res4.allow, false);
  assert.equal(res4.violation_type, "subagent_recursion_limit");
  assert.equal(res4.current_depth, 4);
});

test("Subagent Recursion Limiter Stress: Concurrency Ceiling (<=4 PASS vs >4 BLOCK)", () => {
  // Concurrency 0, 1, 2, 3, 4 -> ALL PASS
  for (let c = 0; c <= 4; c++) {
    const result = evaluateSubagentRecursionLimiter({ active_subagents: c });
    assert.equal(result.allow, true, `Concurrency ${c} must pass`);
  }

  // Concurrency 5, 6, 20 -> ALL BLOCK
  for (const c of [5, 6, 20]) {
    const result = evaluateSubagentRecursionLimiter({ active_subagents: c });
    assert.equal(result.allow, false, `Concurrency ${c} must be blocked`);
    assert.equal(result.violation_type, "subagent_concurrency_limit");
    assert.equal(result.active_subagents, c);
    assert.equal(result.max_concurrent, 4);
    assert.ok(result.reason.includes(`active concurrent subagents (${c}) exceeds maximum concurrency ceiling of 4`));
    assert.ok(result.self_correct_hint);
  }
});

test("Subagent Recursion Limiter Stress: Circular Delegation Loop Topologies", () => {
  // 1-hop self-delegation: [A] -> A
  const selfLoop = evaluateSubagentRecursionLimiter({
    call_chain: ["worker_architect"],
    target_agent: "worker_architect",
  });
  assert.equal(selfLoop.allow, false);
  assert.equal(selfLoop.violation_type, "circular_delegation");
  assert.deepEqual(selfLoop.call_chain, ["worker_architect", "worker_architect"]);

  // 2-hop loop: [A, B] -> A
  const twoHopLoop = evaluateSubagentRecursionLimiter({
    call_chain: ["agent_alpha", "agent_beta"],
    target_agent: "agent_alpha",
  });
  assert.equal(twoHopLoop.allow, false);
  assert.equal(twoHopLoop.violation_type, "circular_delegation");
  assert.deepEqual(twoHopLoop.call_chain, ["agent_alpha", "agent_beta", "agent_alpha"]);

  // Case-insensitive loop: [Agent_Alpha, Agent_Beta] -> AGENT_ALPHA
  const caseLoop = evaluateSubagentRecursionLimiter({
    call_chain: ["Agent_Alpha", "Agent_Beta"],
    target_agent: "agent_alpha",
  });
  assert.equal(caseLoop.allow, false);
  assert.equal(caseLoop.violation_type, "circular_delegation");

  // Alternate parameter names: Recipient, agent_id, callChain
  const recLoop = evaluateSubagentRecursionLimiter({
    callChain: ["root", "node1", "node2"],
    Recipient: "node1",
  });
  assert.equal(recLoop.allow, false);
  assert.equal(recLoop.violation_type, "circular_delegation");

  // String lineage formatted: "root -> worker_a -> worker_b" -> target: "worker_a"
  const strChainLoop = evaluateSubagentRecursionLimiter({
    call_chain: "root -> worker_a -> worker_b",
    target_agent: "worker_a",
  });
  assert.equal(strChainLoop.allow, false);
  assert.equal(strChainLoop.violation_type, "circular_delegation");

  // Clean delegation without loop: [A, B] -> C
  const safeDelegation = evaluateSubagentRecursionLimiter({
    call_chain: ["agent_alpha", "agent_beta"],
    target_agent: "agent_gamma",
  });
  assert.equal(safeDelegation.allow, true);
});

test("Subagent Recursion Limiter Stress: CLI argument overrides (--max-depth, --max-concurrent)", () => {
  // Test --max-depth 2 override
  const resDepthCli = runSubprocess("subagent-recursion-limiter.js", { depth: 3 }, ["--max-depth", "2"]);
  assert.equal(resDepthCli.allow, false);
  assert.equal(resDepthCli.max_depth, 2);

  // Test --max-concurrent 2 override
  const resConcCli = runSubprocess("subagent-recursion-limiter.js", { active_subagents: 3 }, ["--max-concurrent", "2"]);
  assert.equal(resConcCli.allow, false);
  assert.equal(resConcCli.max_concurrent, 2);
});

// ============================================================================
// SECTION 4: LATENCY & COLD-START BENCHMARK TESTS
// ============================================================================

test("Latency Benchmark: In-Memory Guard Evaluations (< 1ms avg)", () => {
  const iterations = 1000;

  // Context budget guard benchmark
  const cbStart = performance.now();
  for (let i = 0; i < iterations; i++) {
    evaluateContextBudgetGuard({ CodeContent: "const x = 1;\n".repeat(100) });
  }
  const cbAvgMs = (performance.now() - cbStart) / iterations;
  assert.ok(cbAvgMs < 1.0, `Context budget avg latency: ${cbAvgMs.toFixed(4)}ms (expected < 1ms)`);

  // Scope boundary enforcer benchmark
  const scopeStart = performance.now();
  const spec = { local_horizontal_scope: { owned_files: ["src/*"], out_of_bounds: ["etc/*"] } };
  for (let i = 0; i < iterations; i++) {
    evaluateScopeBoundaryEnforcer({ TargetFile: "src/index.js" }, { spec });
  }
  const scopeAvgMs = (performance.now() - scopeStart) / iterations;
  assert.ok(scopeAvgMs < 1.0, `Scope enforcer avg latency: ${scopeAvgMs.toFixed(4)}ms (expected < 1ms)`);

  // Subagent recursion limiter benchmark
  const subagentStart = performance.now();
  for (let i = 0; i < iterations; i++) {
    evaluateSubagentRecursionLimiter({ depth: 2, active_subagents: 3, call_chain: ["a", "b"], target_agent: "c" });
  }
  const subagentAvgMs = (performance.now() - subagentStart) / iterations;
  assert.ok(subagentAvgMs < 1.0, `Subagent limiter avg latency: ${subagentAvgMs.toFixed(4)}ms (expected < 1ms)`);
});
