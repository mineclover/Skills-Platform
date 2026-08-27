/**
 * Adversarial Challenge & Stress-Test Harness for Milestone M1
 * Author: Challenger M1 (teamwork_preview_challenger)
 */

"use strict";

const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const net = require("node:net");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn, spawnSync } = require("node:child_process");
const { performance } = require("node:perf_hooks");

const HOOK_SCRIPT_PATH = path.resolve(__dirname, "../../.skills-platform/hooks/telemetry-hook.js");
const {
  normalizeTelemetryEvent,
  parseHookInput,
  recordTelemetryEvent,
  extractSkillFromPath,
  extractFromCommand,
  parseCliArgs,
  VALID_INVOCATION_MODES,
  VALID_OUTCOMES,
  VALID_EVIDENCE_TYPES,
  VALID_PROVIDERS
} = require(HOOK_SCRIPT_PATH);

function makeTempLogPath(name) {
  const dir = path.join(os.tmpdir(), "challenger-m1-stress", crypto.randomUUID());
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, `${name}.ndjson`);
}

const results = {
  passed: 0,
  failed: 0,
  tests: []
};

function recordTest(name, passed, details = {}) {
  if (passed) {
    results.passed++;
    console.log(`  [PASS] ${name}`);
  } else {
    results.failed++;
    console.error(`  [FAIL] ${name}`, details);
  }
  results.tests.push({ name, passed, ...details });
}

// -----------------------------------------------------------------------------
// TEST SUITE 1: Performance Under Load (100 Rapid Executions & Latency Benchmark)
// -----------------------------------------------------------------------------
async function runSuite1_Performance() {
  console.log("\n=== Suite 1: Performance Under Load ===");

  const logFile = makeTempLogPath("suite1-perf");
  const RUN_COUNT = 100;
  const latencies = [];

  console.log(`Running ${RUN_COUNT} rapid consecutive CLI executions...`);
  for (let i = 0; i < RUN_COUNT; i++) {
    const start = performance.now();
    const child = spawnSync(
      process.execPath,
      [
        HOOK_SCRIPT_PATH,
        "--platform", "antigravity",
        "--skill", `stress-skill-${i}`,
        "--duration", `${i}`,
        "--outcome", i % 2 === 0 ? "success" : "correction",
        "--log-file", logFile,
        "--no-http"
      ],
      { encoding: "utf8" }
    );
    const duration = performance.now() - start;
    latencies.push(duration);

    if (child.status !== 0) {
      recordTest(`CLI execution #${i} exited 0`, false, { status: child.status, stderr: child.stderr });
      return;
    }
  }

  latencies.sort((a, b) => a - b);
  const min = latencies[0];
  const max = latencies[latencies.length - 1];
  const sum = latencies.reduce((a, b) => a + b, 0);
  const avg = sum / latencies.length;
  const p50 = latencies[Math.floor(latencies.length * 0.50)];
  const p95 = latencies[Math.floor(latencies.length * 0.95)];
  const p99 = latencies[Math.floor(latencies.length * 0.99)];

  console.log(`  Performance stats (100 CLI runs):`);
  console.log(`    Min: ${min.toFixed(2)}ms, Max: ${max.toFixed(2)}ms`);
  console.log(`    Avg: ${avg.toFixed(2)}ms, P50: ${p50.toFixed(2)}ms, P95: ${p95.toFixed(2)}ms, P99: ${p99.toFixed(2)}ms`);

  const fileLines = fs.readFileSync(logFile, "utf8").trim().split("\n");
  recordTest("All 100 CLI runs logged events successfully", fileLines.length === RUN_COUNT, {
    expected: RUN_COUNT,
    actual: fileLines.length
  });

  // In-process hook pipeline latency benchmark
  const inProcessLatencies = [];
  const inProcessLog = makeTempLogPath("suite1-inprocess");
  for (let i = 0; i < 200; i++) {
    const start = performance.now();
    await recordTelemetryEvent(
      { skill_name: `bench-${i}`, duration_ms: i },
      { logFile: inProcessLog, disableHttp: true }
    );
    inProcessLatencies.push(performance.now() - start);
  }
  inProcessLatencies.sort((a, b) => a - b);
  const ipAvg = inProcessLatencies.reduce((a, b) => a + b, 0) / inProcessLatencies.length;
  const ipP95 = inProcessLatencies[Math.floor(inProcessLatencies.length * 0.95)];

  console.log(`  In-process stats (200 calls): Avg: ${ipAvg.toFixed(2)}ms, P95: ${ipP95.toFixed(2)}ms`);

  recordTest("In-process latency average < 5ms", ipAvg < 5, { avgMs: ipAvg });
  recordTest("In-process latency P95 < 15ms", ipP95 < 15, { p95Ms: ipP95 });
}

// -----------------------------------------------------------------------------
// TEST SUITE 2: HTTP Endpoint Resilience (Down, Socket Hang, Refused, Dropped)
// -----------------------------------------------------------------------------
async function runSuite2_HttpResilience() {
  console.log("\n=== Suite 2: HTTP Endpoint Resilience ===");

  const logFile = makeTempLogPath("suite2-http");

  // 1. Connection Refused (port closed)
  const deadPort = 49158;
  const startRefused = performance.now();
  const childRefused = spawnSync(
    process.execPath,
    [
      HOOK_SCRIPT_PATH,
      "--platform", "antigravity",
      "--skill", "resilience-refused-skill",
      "--endpoint", `http://127.0.0.1:${deadPort}/api/telemetry/record`,
      "--log-file", logFile
    ],
    { encoding: "utf8" }
  );
  const durRefused = performance.now() - startRefused;
  recordTest(
    "Resilience to Connection Refused (exits 0 in < 500ms without blocking)",
    childRefused.status === 0 && durRefused < 500,
    { status: childRefused.status, durationMs: durRefused }
  );

  // 2. Blackhole / Socket Hang (server accepts TCP connection but never replies)
  const blackholeServer = net.createServer((socket) => {
    // Intentionally never send data or close
  });
  await new Promise((res) => blackholeServer.listen(0, "127.0.0.1", res));
  const blackholePort = blackholeServer.address().port;

  const startHang = performance.now();
  const childHang = spawnSync(
    process.execPath,
    [
      HOOK_SCRIPT_PATH,
      "--platform", "antigravity",
      "--skill", "resilience-hang-skill",
      "--endpoint", `http://127.0.0.1:${blackholePort}/api/telemetry/record`,
      "--log-file", logFile
    ],
    { encoding: "utf8" }
  );
  const durHang = performance.now() - startHang;
  await new Promise((res) => blackholeServer.close(res));

  recordTest(
    "Resilience to Blackhole/Socket Hang (non-blocking, exits 0 promptly)",
    childHang.status === 0 && durHang < 500,
    { status: childHang.status, durationMs: durHang }
  );

  // 3. Abrupt TCP Reset / Connection Reset
  const rstServer = net.createServer((socket) => {
    socket.destroy(); // Immediate abort/reset
  });
  await new Promise((res) => rstServer.listen(0, "127.0.0.1", res));
  const rstPort = rstServer.address().port;

  const startRst = performance.now();
  const childRst = spawnSync(
    process.execPath,
    [
      HOOK_SCRIPT_PATH,
      "--platform", "claude",
      "--skill", "resilience-rst-skill",
      "--endpoint", `http://127.0.0.1:${rstPort}/api/telemetry/record`,
      "--log-file", logFile
    ],
    { encoding: "utf8" }
  );
  const durRst = performance.now() - startRst;
  await new Promise((res) => rstServer.close(res));

  recordTest(
    "Resilience to TCP Connection Reset (exits 0 without uncaught exception)",
    childRst.status === 0 && durRst < 500,
    { status: childRst.status, durationMs: durRst }
  );

  // 4. Garbage / Malformed HTTP Response
  const garbageServer = net.createServer((socket) => {
    socket.write("GARBAGE NOT HTTP AT ALL\r\n\r\n");
    socket.end();
  });
  await new Promise((res) => garbageServer.listen(0, "127.0.0.1", res));
  const garbagePort = garbageServer.address().port;

  const startGarbage = performance.now();
  const childGarbage = spawnSync(
    process.execPath,
    [
      HOOK_SCRIPT_PATH,
      "--platform", "codex",
      "--skill", "resilience-garbage-skill",
      "--endpoint", `http://127.0.0.1:${garbagePort}/api/telemetry/record`,
      "--log-file", logFile
    ],
    { encoding: "utf8" }
  );
  const durGarbage = performance.now() - startGarbage;
  await new Promise((res) => garbageServer.close(res));

  recordTest(
    "Resilience to Garbage HTTP Response (exits 0 cleanly)",
    childGarbage.status === 0 && durGarbage < 500,
    { status: childGarbage.status, durationMs: durGarbage }
  );

  // 5. Invalid URL
  const childBadUrl = spawnSync(
    process.execPath,
    [
      HOOK_SCRIPT_PATH,
      "--platform", "antigravity",
      "--skill", "bad-url-skill",
      "--endpoint", "http:///bad\\url:::9999",
      "--log-file", logFile
    ],
    { encoding: "utf8" }
  );
  recordTest("Resilience to Invalid URL string (exits 0 cleanly)", childBadUrl.status === 0);

  // Check log entries were written despite HTTP failures
  const loggedLines = fs.readFileSync(logFile, "utf8").trim().split("\n");
  recordTest("All resilient events persisted to local log despite HTTP failures", loggedLines.length >= 4, {
    loggedCount: loggedLines.length
  });
}

// -----------------------------------------------------------------------------
// TEST SUITE 3: Resilience to Corrupt / Malformed STDIN & Hostile CLI Inputs
// -----------------------------------------------------------------------------
async function runSuite3_CorruptInputs() {
  console.log("\n=== Suite 3: Malformed & Hostile Inputs ===");

  const logFile = makeTempLogPath("suite3-malformed");

  // 1. Broken JSON syntax on STDIN
  const brokenJsonChild = spawnSync(
    process.execPath,
    [HOOK_SCRIPT_PATH, "--log-file", logFile, "--no-http"],
    { input: "{ \"event\": \"PostToolUse\", unquoted_key: 123... ", encoding: "utf8" }
  );
  recordTest("Broken JSON syntax on STDIN exits 0", brokenJsonChild.status === 0);

  // 2. Binary / NUL bytes on STDIN
  const binaryNoise = Buffer.from([0x00, 0xff, 0xfe, 0x01, 0x02, 0x7f, 0x80, 0x81]);
  const binaryChild = spawnSync(
    process.execPath,
    [HOOK_SCRIPT_PATH, "--log-file", logFile, "--no-http"],
    { input: binaryNoise }
  );
  recordTest("Binary / NUL noise on STDIN exits 0", binaryChild.status === 0);

  // 3. Huge STDIN Payload (2 MB string)
  const hugePayload = JSON.stringify({
    event: "PostToolUse",
    skill_name: "huge-payload-skill",
    large_data: "X".repeat(2 * 1024 * 1024)
  });
  const hugeChild = spawnSync(
    process.execPath,
    [HOOK_SCRIPT_PATH, "--log-file", logFile, "--no-http"],
    { input: hugePayload, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 }
  );
  recordTest("2MB Large STDIN payload handled without crash", hugeChild.status === 0);

  // 4. Empty / Whitespace-only STDIN
  const whitespaceChild = spawnSync(
    process.execPath,
    [HOOK_SCRIPT_PATH, "--log-file", logFile, "--no-http"],
    { input: "   \n\t  \r\n  ", encoding: "utf8" }
  );
  recordTest("Whitespace-only STDIN exits 0", whitespaceChild.status === 0);

  // 5. Hostile CLI flags (string non-numbers, shell characters, prototype pollution keys)
  const hostileChild = spawnSync(
    process.execPath,
    [
      HOOK_SCRIPT_PATH,
      "--platform", "antigravity; rm -rf /",
      "--skill", "<script>alert(1)</script>",
      "--duration", "not-a-number",
      "--duration-ms", "-999",
      "--tool-calls", "NaN",
      "--mode", "malicious_mode",
      "--outcome", "invalid_outcome_123",
      "--evidence", "fake_evidence_type",
      "--summary", "Line1\nLine2\r\nLine3",
      "--log-file", logFile,
      "--no-http"
    ],
    { encoding: "utf8" }
  );
  recordTest("Hostile CLI flags parsed safely and exits 0", hostileChild.status === 0);

  // Verify NDJSON formatting is strictly intact (no raw unescaped newlines breaking single-line integrity)
  const content = fs.readFileSync(logFile, "utf8");
  const rawLines = content.split("\n").filter((l) => l.length > 0);
  let allLinesValidJson = true;
  for (const l of rawLines) {
    try {
      const obj = JSON.parse(l);
      if (!obj.timestamp || !obj.provider_id || !obj.skill_name) {
        allLinesValidJson = false;
      }
    } catch {
      allLinesValidJson = false;
    }
  }
  recordTest("All logged lines under hostile inputs are strictly valid single-line JSON", allLinesValidJson, {
    totalLines: rawLines.length
  });
}

// -----------------------------------------------------------------------------
// TEST SUITE 4: Multiprocess High-Concurrency Append Safety
// -----------------------------------------------------------------------------
async function runSuite4_ConcurrentWrites() {
  console.log("\n=== Suite 4: Concurrent Writes to events.ndjson ===");

  const logFile = makeTempLogPath("suite4-concurrent");
  const CONCURRENT_PROCESSES = 60;
  console.log(`Spawning ${CONCURRENT_PROCESSES} simultaneous processes appending to single log file...`);

  const spawnPromises = [];

  for (let i = 0; i < CONCURRENT_PROCESSES; i++) {
    const p = new Promise((resolve) => {
      const child = spawn(
        process.execPath,
        [
          HOOK_SCRIPT_PATH,
          "--platform", i % 2 === 0 ? "antigravity" : "claude",
          "--skill", `concurrent-worker-${i}`,
          "--duration", `${i * 3}`,
          "--outcome", "success",
          "--log-file", logFile,
          "--no-http"
        ],
        { stdio: "ignore" }
      );

      child.on("exit", (code) => {
        resolve({ index: i, code });
      });
      child.on("error", (err) => {
        resolve({ index: i, code: -1, error: err.message });
      });
    });
    spawnPromises.push(p);
  }

  const results = await Promise.all(spawnPromises);
  const allExited0 = results.every((r) => r.code === 0);
  recordTest(`All ${CONCURRENT_PROCESSES} concurrent processes exited code 0`, allExited0);

  const fileContent = fs.readFileSync(logFile, "utf8");
  const lines = fileContent.trim().split("\n").filter(Boolean);

  recordTest(`Exactly ${CONCURRENT_PROCESSES} lines recorded without loss`, lines.length === CONCURRENT_PROCESSES, {
    expected: CONCURRENT_PROCESSES,
    actual: lines.length
  });

  let corrupted = 0;
  const recordedSkills = new Set();
  for (let i = 0; i < lines.length; i++) {
    try {
      const parsed = JSON.parse(lines[i]);
      if (parsed.skill_name) {
        recordedSkills.add(parsed.skill_name);
      }
    } catch {
      corrupted++;
    }
  }

  recordTest("Zero corrupted/interleaved lines in concurrent log", corrupted === 0, { corruptedLines: corrupted });
  recordTest("All unique worker skills captured", recordedSkills.size === CONCURRENT_PROCESSES, {
    uniqueSkills: recordedSkills.size
  });
}

// -----------------------------------------------------------------------------
// TEST SUITE 5: Multi-Agent Extraction Accuracy & CLI Flag Handling
// -----------------------------------------------------------------------------
async function runSuite5_MultiAgentAccuracy() {
  console.log("\n=== Suite 5: Multi-Agent Extraction Accuracy & CLI Flag Handling ===");

  // 1. Antigravity view_file on Windows backslash path
  const agWinPayload = {
    event: "PostToolUse",
    platform: "antigravity",
    tool: "view_file",
    parameters: {
      AbsolutePath: "C:\\Users\\minec\\Skills-Platform\\.agents\\skills\\task-decomposer\\SKILL.md"
    },
    result: { status: "success" },
    duration_ms: 19
  };
  const parsedAgWin = normalizeTelemetryEvent(agWinPayload);
  recordTest("Antigravity Windows path extracts task-decomposer", parsedAgWin.skill_name === "task-decomposer" && parsedAgWin.provider_id === "antigravity");
  recordTest("Antigravity sets model_invoked and activation_report", parsedAgWin.invocation_mode === "model_invoked" && parsedAgWin.evidence_type === "activation_report");

  // 2. Antigravity run_command with scoped test command
  const agCmdPayload = {
    event: "PostToolUse",
    tool: "run_command",
    parameters: {
      CommandLine: "run_scoped_test apps/skills-catalog/test/server.test.js"
    },
    result: { status: "success" }
  };
  const parsedAgCmd = normalizeTelemetryEvent(agCmdPayload);
  recordTest("Antigravity run_command extracts scoped-tdd-executor", parsedAgCmd.skill_name === "scoped-tdd-executor");
  recordTest("Antigravity scoped test sets evaluation evidence_type", parsedAgCmd.evidence_type === "evaluation");

  // 3. Antigravity run_command with lifecycle loop command
  const agLoopPayload = {
    event: "PostToolUse",
    tool: "run_command",
    parameters: {
      CommandLine: "skills-platform loop run --prd PRD.md --project . --provider antigravity"
    }
  };
  const parsedAgLoop = normalizeTelemetryEvent(agLoopPayload);
  recordTest("Antigravity loop command extracts lifecycle-phase-controller", parsedAgLoop.skill_name === "lifecycle-phase-controller");

  // 4. Claude post_tool_execution on ReadFile without explicit platform field (BUG 1)
  const claudeReadPayload = {
    event: "post_tool_execution",
    tool_name: "ReadFile",
    input: {
      path: "/home/runner/work/repo/.claude/skills/horizontal-topic-scanner/SKILL.md"
    },
    output: { content: "# Scanner" },
    duration_ms: 28
  };
  const parsedClaudeRead = normalizeTelemetryEvent(claudeReadPayload);
  recordTest(
    "Claude post_tool_execution infers provider_id: 'claude' without explicit platform flag",
    parsedClaudeRead.provider_id === "claude",
    { expected: "claude", actual: parsedClaudeRead.provider_id }
  );
  recordTest(
    "Claude post_tool_execution extracts skill_name: 'horizontal-topic-scanner'",
    parsedClaudeRead.skill_name === "horizontal-topic-scanner",
    { actual: parsedClaudeRead.skill_name }
  );

  // 5. Claude tool error -> outcome 'risk'
  const claudeErrorPayload = {
    event: "post_tool_execution",
    tool_name: "Bash",
    input: { command: "node invalid-script.js" },
    is_error: true,
    output: { error: "Command failed with exit code 1" }
  };
  const parsedClaudeError = normalizeTelemetryEvent(claudeErrorPayload);
  recordTest("Claude tool error mapped to outcome 'risk'", parsedClaudeError.outcome === "risk");

  // 6. Kebab-case CLI arguments handling (BUG 2)
  const kebabCliArgs = parseCliArgs([
    "--skill-name", "task-decomposer",
    "--recipe-id", "mlc-task-planning",
    "--lineage-id", "lineage-task-decomposer",
    "--project-id", "skills-platform",
    "--evidence-type", "evaluation",
    "--invocation-mode", "user_invoked"
  ]);
  const parsedKebabEvent = normalizeTelemetryEvent({}, { cliArgs: kebabCliArgs });
  recordTest(
    "Kebab-case CLI arguments (--skill-name, --recipe-id, etc.) parsed into telemetry event",
    parsedKebabEvent.skill_name === "task-decomposer" &&
    parsedKebabEvent.recipe_id === "mlc-task-planning" &&
    parsedKebabEvent.lineage_id === "lineage-task-decomposer" &&
    parsedKebabEvent.evidence_type === "evaluation" &&
    parsedKebabEvent.invocation_mode === "user_invoked",
    {
      expectedSkill: "task-decomposer",
      actualSkill: parsedKebabEvent.skill_name,
      expectedRecipe: "mlc-task-planning",
      actualRecipe: parsedKebabEvent.recipe_id,
      expectedMode: "user_invoked",
      actualMode: parsedKebabEvent.invocation_mode
    }
  );

  // 7. Command flag extraction with '=' equals sign (BUG 3)
  const equalsCmd = extractFromCommand("node runner.js --recipe=custom-recipe --skill=custom-skill");
  recordTest(
    "extractFromCommand matches flags formatted with '=' equals sign",
    equalsCmd.skill_name === "custom-skill" && equalsCmd.recipe_id === "custom-recipe",
    { actual: equalsCmd }
  );

  // 8. Artifact digest path parsing
  const artifactPath = "C:\\repo\\.skills-platform\\registry\\revisions\\rev-3\\artifacts\\codebase-design-39ad48bc\\SKILL.md";
  const extractedArtifact = extractSkillFromPath(artifactPath);
  recordTest("Artifact digest path extracts codebase-design", extractedArtifact === "codebase-design");

  // 9. Stream mode verification
  const streamLog = makeTempLogPath("suite5-stream");
  const streamLines = [
    JSON.stringify({ skill_name: "stream-skill-1", duration_ms: 12 }),
    JSON.stringify({ skill_name: "stream-skill-2", duration_ms: 24 }),
    JSON.stringify({ skill_name: "stream-skill-3", duration_ms: 36 })
  ].join("\n") + "\n";

  const streamChild = spawnSync(
    process.execPath,
    [HOOK_SCRIPT_PATH, "--stream", "--log-file", streamLog, "--no-http"],
    { input: streamLines, encoding: "utf8" }
  );
  recordTest("Stream mode processes multi-line NDJSON stream", streamChild.status === 0);

  const streamContent = fs.readFileSync(streamLog, "utf8").trim().split("\n");
  recordTest("Stream mode logged all 3 stream events", streamContent.length === 3);
}

// -----------------------------------------------------------------------------
// MAIN RUNNER
// -----------------------------------------------------------------------------
async function runAll() {
  console.log("=================================================================");
  console.log("STARTING ADVERSARIAL CHALLENGE & STRESS-TEST HARNESS (M1)");
  console.log("=================================================================");

  const startTime = performance.now();

  await runSuite1_Performance();
  await runSuite2_HttpResilience();
  await runSuite3_CorruptInputs();
  await runSuite4_ConcurrentWrites();
  await runSuite5_MultiAgentAccuracy();

  const totalTime = performance.now() - startTime;

  console.log("\n=================================================================");
  console.log(`STRESS-TEST SUMMARY:`);
  console.log(`  Passed: ${results.passed}`);
  console.log(`  Failed: ${results.failed}`);
  console.log(`  Total:  ${results.tests.length}`);
  console.log(`  Duration: ${(totalTime / 1000).toFixed(2)}s`);
  console.log("=================================================================");

  // Output test result manifest as JSON for inclusion in handoff
  const reportPath = path.resolve(__dirname, "stress-results.json");
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2), "utf8");
  console.log(`Saved detailed test results to: ${reportPath}`);

  if (results.failed > 0) {
    process.exit(1);
  }
}

runAll().catch((err) => {
  console.error("Adversarial harness crashed:", err);
  process.exit(1);
});
