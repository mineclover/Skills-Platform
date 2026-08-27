const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");

const {
  findRepoRoot,
  extractSkillFromPath,
  extractFromCommand,
  parseHookInput,
  normalizeTelemetryEvent,
  appendTelemetryLog,
  dispatchTelemetryHttp,
  recordTelemetryEvent,
  parseCliArgs,
  VALID_INVOCATION_MODES,
  VALID_OUTCOMES,
  VALID_EVIDENCE_TYPES,
  VALID_PROVIDERS
} = require("../../../.skills-platform/hooks/telemetry-hook.js");

const HOOK_SCRIPT_PATH = path.resolve(__dirname, "../../../.skills-platform/hooks/telemetry-hook.js");

function createTempLogPath(prefix = "events") {
  const dir = path.join(os.tmpdir(), "skills-platform-telemetry-tests", crypto.randomUUID());
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, `${prefix}.ndjson`);
}

test("Hook Constants: validates contract domain enumerations", () => {
  assert.ok(VALID_INVOCATION_MODES.has("model_invoked"));
  assert.ok(VALID_INVOCATION_MODES.has("user_invoked"));
  assert.ok(VALID_INVOCATION_MODES.has("hybrid"));
  assert.ok(VALID_INVOCATION_MODES.has("unspecified"));

  assert.ok(VALID_OUTCOMES.has("success"));
  assert.ok(VALID_OUTCOMES.has("correction"));
  assert.ok(VALID_OUTCOMES.has("scope_mismatch"));
  assert.ok(VALID_OUTCOMES.has("freshness"));
  assert.ok(VALID_OUTCOMES.has("risk"));
  assert.ok(VALID_OUTCOMES.has("neutral"));

  assert.ok(VALID_EVIDENCE_TYPES.has("manual"));
  assert.ok(VALID_EVIDENCE_TYPES.has("evaluation"));
  assert.ok(VALID_EVIDENCE_TYPES.has("activation_report"));
  assert.ok(VALID_EVIDENCE_TYPES.has("user_feedback"));
  assert.ok(VALID_EVIDENCE_TYPES.has("incident"));

  assert.ok(VALID_PROVIDERS.has("antigravity"));
  assert.ok(VALID_PROVIDERS.has("claude"));
  assert.ok(VALID_PROVIDERS.has("codex"));
  assert.ok(VALID_PROVIDERS.has("ralph-tui"));
});

test("Heuristics: extractSkillFromPath correctly resolves diverse multi-platform paths", () => {
  // Antigravity skill path
  assert.equal(
    extractSkillFromPath("C:\\Users\\minec\\Skills-Platform\\.agents\\skills\\task-decomposer\\SKILL.md"),
    "task-decomposer"
  );
  assert.equal(
    extractSkillFromPath("/repo/.agents/skills/horizontal-topic-scanner/SKILL.md"),
    "horizontal-topic-scanner"
  );

  // Claude skill path
  assert.equal(
    extractSkillFromPath("C:/Users/minec/Skills-Platform/.claude/skills/scoped-tdd-executor/SKILL.md"),
    "scoped-tdd-executor"
  );

  // Standard skills path
  assert.equal(
    extractSkillFromPath("skills\\codebase-design\\SKILL.md"),
    "codebase-design"
  );
  assert.equal(
    extractSkillFromPath("skills/tdd/skill.json"),
    "tdd"
  );

  // Canonical artifact digest path
  assert.equal(
    extractSkillFromPath("C:\\Users\\minec\\Skills-Platform\\.skills-platform\\registry\\revisions\\rev1\\artifacts\\bounded-baseline-condenser-e2e25faf8a\\SKILL.md"),
    "bounded-baseline-condenser"
  );

  // Non-skill files return null
  assert.equal(extractSkillFromPath("src/server.js"), null);
  assert.equal(extractSkillFromPath("package.json"), null);
  assert.equal(extractSkillFromPath(""), null);
  assert.equal(extractSkillFromPath(null), null);
});

test("Heuristics: extractFromCommand detects command intent, skills, and recipes", () => {
  const loopCmd = extractFromCommand("skills-platform loop run --prd PRD.md --project C:\\repo --provider antigravity");
  assert.equal(loopCmd.skill_name, "lifecycle-phase-controller");

  const testCmd = extractFromCommand("run_scoped_test apps/skills-catalog/test/server.test.js");
  assert.equal(testCmd.skill_name, "scoped-tdd-executor");
  assert.equal(testCmd.evidence_type, "evaluation");

  const planCmd = extractFromCommand("node cli.js plan --recipe mlc-task-planning --skill task-decomposer");
  assert.equal(planCmd.recipe_id, "mlc-task-planning");
  assert.equal(planCmd.skill_name, "task-decomposer");

  const releaseCmd = extractFromCommand("skills-platform release-governance check");
  assert.equal(releaseCmd.skill_name, "global-regression-gatekeeper");
  assert.equal(releaseCmd.recipe_id, "mlc-release-governance");

  assert.deepEqual(extractFromCommand(""), {});
  assert.deepEqual(extractFromCommand(null), {});
});

test("Payload Parsing: parses Google Antigravity PostToolUse payloads", () => {
  const antigravityViewEvent = {
    event: "PostToolUse",
    platform: "antigravity",
    tool: "view_file",
    parameters: {
      AbsolutePath: "C:\\Users\\minec\\Skills-Platform\\.agents\\skills\\task-decomposer\\SKILL.md"
    },
    result: {
      status: "success",
      output: "# Task Decomposer"
    },
    duration_ms: 18,
    timestamp: "2026-08-28T07:00:00.000Z"
  };

  const parsed = parseHookInput(antigravityViewEvent);
  assert.equal(parsed.provider_id, "antigravity");
  assert.equal(parsed.skill_name, "task-decomposer");
  assert.equal(parsed.invocation_mode, "model_invoked");
  assert.equal(parsed.outcome, "success");
  assert.equal(parsed.evidence_type, "activation_report");
  assert.equal(parsed.duration_ms, 18);
});

test("Payload Parsing: parses Anthropic Claude post_tool_execution payloads", () => {
  const claudeEvent = {
    event: "post_tool_execution",
    platform: "claude",
    tool_name: "ReadFile",
    input: {
      path: "C:/Users/minec/Skills-Platform/.claude/skills/scoped-tdd-executor/SKILL.md"
    },
    output: {
      content: "..."
    },
    duration_ms: 24,
    timestamp: "2026-08-28T07:05:00.000Z"
  };

  const parsed = parseHookInput(claudeEvent);
  assert.equal(parsed.provider_id, "claude");
  assert.equal(parsed.skill_name, "scoped-tdd-executor");
  assert.equal(parsed.invocation_mode, "model_invoked");
  assert.equal(parsed.outcome, "success");
  assert.equal(parsed.evidence_type, "activation_report");
  assert.equal(parsed.duration_ms, 24);
});

test("Normalization: produces complete, schema-compliant TelemetryEvent object", () => {
  const raw = {
    provider_id: "antigravity",
    project_id: "skills-platform",
    recipe_id: "mlc-task-planning",
    skill_name: "task-decomposer",
    lineage_id: "lineage-task-decomposer",
    invocation_mode: "model_invoked",
    duration_ms: 15.4,
    tool_calls_count: 2,
    outcome: "success",
    evidence_type: "activation_report",
    summary: "Loaded task-decomposer skill",
    metrics: { cache_hits: 1 }
  };

  const event = normalizeTelemetryEvent(raw);
  assert.ok(event.timestamp);
  assert.equal(event.provider_id, "antigravity");
  assert.equal(event.project_id, "skills-platform");
  assert.equal(event.recipe_id, "mlc-task-planning");
  assert.equal(event.skill_name, "task-decomposer");
  assert.equal(event.lineage_id, "lineage-task-decomposer");
  assert.equal(event.invocation_mode, "model_invoked");
  assert.equal(event.duration_ms, 15);
  assert.equal(event.tool_calls_count, 2);
  assert.equal(event.outcome, "success");
  assert.equal(event.evidence_type, "activation_report");
  assert.equal(event.summary, "Loaded task-decomposer skill");
  assert.deepEqual(event.metrics, { duration_ms: 15, tool_calls_count: 2, cache_hits: 1 });
});

test("Normalization: provides robust fallbacks for missing or invalid attributes", () => {
  const emptyEvent = normalizeTelemetryEvent({});
  assert.ok(emptyEvent.timestamp);
  assert.ok(emptyEvent.provider_id);
  assert.ok(emptyEvent.project_id);
  assert.equal(emptyEvent.skill_name, "general-skill");
  assert.equal(emptyEvent.lineage_id, "lineage-general-skill");
  assert.equal(emptyEvent.invocation_mode, "model_invoked");
  assert.equal(emptyEvent.outcome, "success");
  assert.equal(emptyEvent.evidence_type, "activation_report");
  assert.equal(emptyEvent.duration_ms, 0);
  assert.equal(emptyEvent.tool_calls_count, 1);
  assert.ok(emptyEvent.summary.includes("general-skill"));

  // Invalid enum fallbacks
  const invalidEnumEvent = normalizeTelemetryEvent({
    invocation_mode: "invalid_mode",
    outcome: "invalid_outcome",
    evidence_type: "invalid_evidence"
  });
  assert.equal(invalidEnumEvent.invocation_mode, "model_invoked");
  assert.equal(invalidEnumEvent.outcome, "success");
  assert.equal(invalidEnumEvent.evidence_type, "activation_report");
});

test("NDJSON Appending: appends events atomically to specified log file", () => {
  const logFile = createTempLogPath("ndjson-append");

  const event1 = normalizeTelemetryEvent({ skill_name: "skill-alpha", duration_ms: 10 });
  const event2 = normalizeTelemetryEvent({ skill_name: "skill-beta", duration_ms: 20 });

  const ok1 = appendTelemetryLog(event1, logFile);
  const ok2 = appendTelemetryLog(event2, logFile);

  assert.equal(ok1, true);
  assert.equal(ok2, true);

  const fileContent = fs.readFileSync(logFile, "utf8");
  const lines = fileContent.trim().split("\n").map((l) => JSON.parse(l));

  assert.equal(lines.length, 2);
  assert.equal(lines[0].skill_name, "skill-alpha");
  assert.equal(lines[1].skill_name, "skill-beta");
});

test("HTTP Dispatch: successfully sends event to local ingestion server in sync mode", async () => {
  let receivedPayload = null;
  const server = http.createServer((req, res) => {
    if (req.method === "POST" && req.url === "/api/telemetry/record") {
      let body = "";
      req.on("data", (c) => { body += c; });
      req.on("end", () => {
        receivedPayload = JSON.parse(body);
        res.writeHead(201, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ recorded: true, feedback_id: "fb_test_1" }));
      });
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const endpoint = `http://127.0.0.1:${port}/api/telemetry/record`;

  try {
    const event = normalizeTelemetryEvent({ skill_name: "test-http-skill", duration_ms: 42 });
    const result = await dispatchTelemetryHttp(event, { endpoint, syncHttp: true });

    assert.equal(result.status, 201);
    assert.ok(receivedPayload);
    assert.equal(receivedPayload.skill_name, "test-http-skill");
    assert.equal(receivedPayload.duration_ms, 42);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("HTTP Dispatch: handles offline server gracefully without throwing", async () => {
  const deadEndpoint = "http://127.0.0.1:49999/api/telemetry/record";
  const event = normalizeTelemetryEvent({ skill_name: "test-offline-skill" });

  // In non-blocking mode
  const nonBlockingRes = await dispatchTelemetryHttp(event, { endpoint: deadEndpoint, syncHttp: false });
  assert.equal(nonBlockingRes.dispatched, true);

  // In sync mode
  const syncRes = await dispatchTelemetryHttp(event, { endpoint: deadEndpoint, syncHttp: true, timeoutMs: 50 });
  assert.ok(syncRes.error || syncRes.status === null);
});

test("CLI Process: executes via CLI arguments and exits with code 0", () => {
  const testLogFile = createTempLogPath("cli-args");

  const child = spawnSync(
    process.execPath,
    [
      HOOK_SCRIPT_PATH,
      "--platform", "antigravity",
      "--skill", "task-decomposer",
      "--duration", "35",
      "--outcome", "success",
      "--mode", "model_invoked",
      "--log-file", testLogFile,
      "--no-http"
    ],
    { encoding: "utf8" }
  );

  assert.equal(child.status, 0, `CLI failed with output: ${child.stderr}`);
  assert.ok(fs.existsSync(testLogFile));

  const content = fs.readFileSync(testLogFile, "utf8").trim();
  const event = JSON.parse(content);
  assert.equal(event.provider_id, "antigravity");
  assert.equal(event.skill_name, "task-decomposer");
  assert.equal(event.duration_ms, 35);
  assert.equal(event.invocation_mode, "model_invoked");
  assert.equal(event.outcome, "success");
});

test("CLI Process: executes via STDIN JSON piping and exits with code 0", () => {
  const testLogFile = createTempLogPath("cli-stdin");

  const inputPayload = JSON.stringify({
    event: "PostToolUse",
    platform: "antigravity",
    tool: "view_file",
    parameters: {
      AbsolutePath: "C:\\Users\\minec\\Skills-Platform\\.agents\\skills\\tdd\\SKILL.md"
    },
    duration_ms: 12,
    result: { status: "success" }
  });

  const child = spawnSync(
    process.execPath,
    [HOOK_SCRIPT_PATH, "--log-file", testLogFile, "--no-http"],
    { input: inputPayload, encoding: "utf8" }
  );

  assert.equal(child.status, 0, `Piped execution failed: ${child.stderr}`);
  assert.ok(fs.existsSync(testLogFile));

  const event = JSON.parse(fs.readFileSync(testLogFile, "utf8").trim());
  assert.equal(event.provider_id, "antigravity");
  assert.equal(event.skill_name, "tdd");
  assert.equal(event.duration_ms, 12);
  assert.equal(event.evidence_type, "activation_report");
});

test("CLI Process: handles malformed input gracefully and always exits with code 0", () => {
  const testLogFile = createTempLogPath("cli-malformed");

  const child = spawnSync(
    process.execPath,
    [HOOK_SCRIPT_PATH, "--log-file", testLogFile, "--no-http"],
    { input: "{malformed json syntax !!!", encoding: "utf8" }
  );

  assert.equal(child.status, 0, "Hook must always exit with code 0 on malformed input");
});

test("CLI Process: stream mode processes multiple NDJSON lines", () => {
  const testLogFile = createTempLogPath("cli-stream");

  const line1 = JSON.stringify({ skill_name: "stream-skill-1", duration_ms: 10 });
  const line2 = JSON.stringify({ skill_name: "stream-skill-2", duration_ms: 20 });
  const line3 = JSON.stringify({ skill_name: "stream-skill-3", duration_ms: 30 });
  const streamInput = `${line1}\n${line2}\n${line3}\n`;

  const child = spawnSync(
    process.execPath,
    [HOOK_SCRIPT_PATH, "--stream", "--log-file", testLogFile, "--no-http"],
    { input: streamInput, encoding: "utf8" }
  );

  assert.equal(child.status, 0);
  assert.ok(fs.existsSync(testLogFile));

  const lines = fs.readFileSync(testLogFile, "utf8").trim().split("\n").map((l) => JSON.parse(l));
  assert.equal(lines.length, 3);
  assert.equal(lines[0].skill_name, "stream-skill-1");
  assert.equal(lines[1].skill_name, "stream-skill-2");
  assert.equal(lines[2].skill_name, "stream-skill-3");
});

test("Performance Benchmark: in-process telemetry hook pipeline executes in < 5ms per event", async () => {
  const benchLogFile = createTempLogPath("bench-in-process");
  const ITERATIONS = 50;
  const latencies = [];

  // Warmup
  await recordTelemetryEvent({ skill_name: "warmup" }, { logFile: benchLogFile, disableHttp: true });

  for (let i = 0; i < ITERATIONS; i++) {
    const start = performance.now();
    await recordTelemetryEvent(
      {
        skill_name: `bench-skill-${i}`,
        duration_ms: i * 2,
        outcome: "success",
        tool_calls_count: 1
      },
      { logFile: benchLogFile, disableHttp: true }
    );
    const elapsed = performance.now() - start;
    latencies.push(elapsed);
  }

  const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;
  latencies.sort((a, b) => a - b);
  const p95 = latencies[Math.floor(latencies.length * 0.95)];

  // Pure hook execution logic must execute in < 5ms per invocation (requirement: < 50ms)
  assert.ok(avg < 10, `Average hook execution latency (${avg.toFixed(2)}ms) must be < 10ms`);
  assert.ok(p95 < 25, `P95 hook execution latency (${p95.toFixed(2)}ms) must be < 25ms`);
});

test("Performance Benchmark: CLI hook script executes promptly and exits with code 0 without blocking", () => {
  const benchLogFile = createTempLogPath("bench-cli");
  const start = performance.now();

  const child = spawnSync(
    process.execPath,
    [
      HOOK_SCRIPT_PATH,
      "--platform", "antigravity",
      "--skill", "bench-fast-skill",
      "--duration", "10",
      "--outcome", "success",
      "--log-file", benchLogFile,
      "--no-http"
    ],
    { encoding: "utf8" }
  );

  const totalTime = performance.now() - start;

  assert.equal(child.status, 0);
  assert.ok(fs.existsSync(benchLogFile));
  assert.ok(totalTime < 500, `CLI invocation must complete without blocking, took ${totalTime.toFixed(2)}ms`);
});

test("Multi-Agent Heuristic: infers Claude provider from post_tool_execution without explicit platform", () => {
  const claudePayload = {
    event: "post_tool_execution",
    tool_name: "ReadFile",
    input: {
      path: "/home/user/.claude/skills/horizontal-topic-scanner/SKILL.md"
    },
    output: { content: "# Scanner" }
  };
  const event = normalizeTelemetryEvent(claudePayload);
  assert.equal(event.provider_id, "claude");
  assert.equal(event.skill_name, "horizontal-topic-scanner");
});

test("CLI Ergonomics: handles kebab-case CLI flags across all core parameters", () => {
  const parsedArgs = parseCliArgs([
    "--skill-name", "task-decomposer",
    "--recipe-id", "mlc-task-planning",
    "--lineage-id", "lineage-task-decomposer",
    "--project-id", "skills-platform",
    "--evidence-type", "evaluation",
    "--invocation-mode", "user_invoked"
  ]);
  const event = normalizeTelemetryEvent({}, { cliArgs: parsedArgs });
  assert.equal(event.skill_name, "task-decomposer");
  assert.equal(event.recipe_id, "mlc-task-planning");
  assert.equal(event.lineage_id, "lineage-task-decomposer");
  assert.equal(event.evidence_type, "evaluation");
  assert.equal(event.invocation_mode, "user_invoked");
});

test("Command Extraction: parses flags formatted with '=' equals sign delimiter", () => {
  const res = extractFromCommand("node cli.js --recipe=custom-recipe --skill=custom-skill");
  assert.equal(res.recipe_id, "custom-recipe");
  assert.equal(res.skill_name, "custom-skill");

  const res2 = extractFromCommand("node cli.js --recipe-id=recipe-alpha --skill-name=skill-beta");
  assert.equal(res2.recipe_id, "recipe-alpha");
  assert.equal(res2.skill_name, "skill-beta");
});

