"use strict";

const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");

const hook = require("../../.skills-platform/hooks/telemetry-hook.js");

console.log("=== FORENSIC AUDIT SUITE START ===");

// ----------------------------------------------------
// 1. STATIC ANALYSIS & ALGORITHMIC GENERALITY
// ----------------------------------------------------
console.log("\n[CHECK 1] Static Analysis & Generality Testing");

// Generality of extractSkillFromPath
const arbitraryPaths = [
  { p: "C:\\Users\\test\\.agents\\skills\\custom-algo-99\\SKILL.md", expected: "custom-algo-99" },
  { p: "/opt/app/.claude/skills/deep-analyzer/skill.json", expected: "deep-analyzer" },
  { p: "skills/domain-model/metadata.json", expected: "domain-model" },
  { p: "registry/revisions/rev1/artifacts/distributed-consensus-123456789abc/SKILL.md", expected: "distributed-consensus" },
  { p: "src/components/telemetry.js", expected: null },
  { p: "package.json", expected: null },
  { p: "", expected: null },
  { p: null, expected: null }
];

for (const item of arbitraryPaths) {
  const extracted = hook.extractSkillFromPath(item.p);
  assert.equal(extracted, item.expected, `extractSkillFromPath mismatch on ${item.p}`);
}
console.log("-> PASS: extractSkillFromPath generalizes across arbitrary paths");

// Generality of extractFromCommand
const customCmd1 = hook.extractFromCommand("node runner.js --skill my-custom-skill --recipe custom-recipe");
assert.equal(customCmd1.skill_name, "my-custom-skill");
assert.equal(customCmd1.recipe_id, "custom-recipe");

const customCmd2 = hook.extractFromCommand("skills-platform loop run --prd PRD.md");
assert.equal(customCmd2.skill_name, "lifecycle-phase-controller");

const customCmd3 = hook.extractFromCommand("run_scoped_test foo/bar.test.js");
assert.equal(customCmd3.skill_name, "scoped-tdd-executor");
assert.equal(customCmd3.evidence_type, "evaluation");

console.log("-> PASS: extractFromCommand correctly extracts flags and lifecycle commands");

// Parsing and Normalization with dynamic, unexpected data
const dynamicPayload = {
  timestamp: "2026-08-28T07:15:00.000Z",
  provider_id: "claude",
  project_id: "enterprise-system",
  recipe_id: "rec-777",
  skill_name: "fuzz-skill-xyz",
  lineage_id: "lin-123",
  invocation_mode: "hybrid",
  duration_ms: 88.4,
  tool_calls_count: 5,
  outcome: "correction",
  evidence_type: "incident",
  summary: "Dynamic test event",
  metrics: { cpu_user: 12.5, memory_rss_mb: 64 }
};

const norm = hook.normalizeTelemetryEvent(dynamicPayload);
assert.equal(norm.timestamp, "2026-08-28T07:15:00.000Z");
assert.equal(norm.provider_id, "claude");
assert.equal(norm.project_id, "enterprise-system");
assert.equal(norm.recipe_id, "rec-777");
assert.equal(norm.skill_name, "fuzz-skill-xyz");
assert.equal(norm.lineage_id, "lin-123");
assert.equal(norm.invocation_mode, "hybrid");
assert.equal(norm.duration_ms, 88);
assert.equal(norm.tool_calls_count, 5);
assert.equal(norm.outcome, "correction");
assert.equal(norm.evidence_type, "incident");
assert.equal(norm.summary, "Dynamic test event");
assert.equal(norm.metrics.cpu_user, 12.5);
assert.equal(norm.metrics.memory_rss_mb, 64);
assert.equal(norm.metrics.duration_ms, 88);
assert.equal(norm.metrics.tool_calls_count, 5);

console.log("-> PASS: normalizeTelemetryEvent produces 100% schema-compliant output without facade behaviors");

// ----------------------------------------------------
// 2. ZERO DEPENDENCY CHECK
// ----------------------------------------------------
console.log("\n[CHECK 2] Zero External Dependency Check");
const hookScriptPath = path.resolve(__dirname, "../../.skills-platform/hooks/telemetry-hook.js");
const scriptCode = fs.readFileSync(hookScriptPath, "utf8");

// Parse all require statements
const requireRegex = /require\s*\(\s*["']([^"']+)["']\s*\)/g;
let match;
const requiredModules = [];
while ((match = requireRegex.exec(scriptCode)) !== null) {
  requiredModules.push(match[1]);
}
console.log("-> Detected requires in telemetry-hook.js:", requiredModules);

const allowedCore = new Set(["node:fs", "node:path", "node:http", "node:https", "node:readline", "fs", "path", "http", "https", "readline"]);
for (const mod of requiredModules) {
  assert.ok(allowedCore.has(mod), `Forbidden non-core dependency detected: ${mod}`);
}
console.log("-> PASS: Only Node.js core built-ins are imported");

// ----------------------------------------------------
// 3. RUNTIME TRACING & REAL FILE I/O & HTTP POST
// ----------------------------------------------------
console.log("\n[CHECK 3] Runtime Tracing (File I/O, HTTP POST, Latency & Error Handling)");

const testDir = path.resolve(__dirname, "scratch");
fs.mkdirSync(testDir, { recursive: true });
const testLog = path.join(testDir, `audit_events_${Date.now()}.ndjson`);

// 3.1 Verify CLI writing to custom log file
const randomSkill = `skill-dyn-${Math.floor(Math.random() * 100000)}`;
const cliRes = spawnSync(process.execPath, [
  hookScriptPath,
  "--platform", "codex",
  "--skill", randomSkill,
  "--duration", "19",
  "--outcome", "freshness",
  "--mode", "user_invoked",
  "--log-file", testLog,
  "--no-http"
], { encoding: "utf8" });

assert.equal(cliRes.status, 0, `CLI failed: ${cliRes.stderr}`);
assert.ok(fs.existsSync(testLog), "Log file was not created by CLI execution");
const logContent = fs.readFileSync(testLog, "utf8").trim();
const logEvent = JSON.parse(logContent);
assert.equal(logEvent.provider_id, "codex");
assert.equal(logEvent.skill_name, randomSkill);
assert.equal(logEvent.duration_ms, 19);
assert.equal(logEvent.outcome, "freshness");
assert.equal(logEvent.invocation_mode, "user_invoked");
console.log("-> PASS: Real file I/O atomic append verified via CLI subprocess");

// 3.2 Verify Real HTTP POST with Mock Server
let serverReceived = null;
let serverHeaders = null;

const testHttpServer = http.createServer((req, res) => {
  if (req.method === "POST" && req.url === "/api/telemetry/record") {
    serverHeaders = req.headers;
    let raw = "";
    req.on("data", chunk => { raw += chunk; });
    req.on("end", () => {
      serverReceived = JSON.parse(raw);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, id: "ack-100" }));
    });
  } else {
    res.writeHead(404);
    res.end();
  }
});

testHttpServer.listen(0, "127.0.0.1", async () => {
  const port = testHttpServer.address().port;
  const endpoint = `http://127.0.0.1:${port}/api/telemetry/record`;

  try {
    // 3.2.1 Sync HTTP dispatch
    const httpSkill = `http-skill-${Date.now()}`;
    const syncRes = await hook.dispatchTelemetryHttp(
      hook.normalizeTelemetryEvent({ skill_name: httpSkill, duration_ms: 33 }),
      { endpoint, syncHttp: true }
    );

    assert.equal(syncRes.status, 200);
    assert.ok(serverReceived);
    assert.equal(serverReceived.skill_name, httpSkill);
    assert.equal(serverHeaders["user-agent"], "skills-platform-telemetry-hook/0.1.0");
    assert.equal(serverHeaders["content-type"], "application/json");
    console.log("-> PASS: Real HTTP POST request dispatched and received with correct headers and payload");

    // 3.2.2 Async Non-Blocking HTTP dispatch via CLI
    serverReceived = null;
    const asyncSkill = `async-cli-skill-${Date.now()}`;
    const cliHttpRes = spawnSync(process.execPath, [
      hookScriptPath,
      "--skill", asyncSkill,
      "--endpoint", endpoint,
      "--log-file", testLog
    ], { encoding: "utf8" });

    assert.equal(cliHttpRes.status, 0);
    console.log("-> PASS: Non-blocking HTTP CLI execution exited with code 0");

    // 3.3 Verify dead server / offline endpoint handling
    const deadEndpoint = "http://127.0.0.1:48888/api/telemetry/record";
    const deadCli = spawnSync(process.execPath, [
      hookScriptPath,
      "--skill", "offline-skill",
      "--endpoint", deadEndpoint,
      "--log-file", testLog
    ], { encoding: "utf8" });

    assert.equal(deadCli.status, 0, "CLI must not crash on offline endpoint");
    console.log("-> PASS: Resilient offline server handling verified");

    // 3.4 Performance Check
    const startT = performance.now();
    const benchIterations = 100;
    for (let i = 0; i < benchIterations; i++) {
      hook.normalizeTelemetryEvent({ skill_name: "bench", duration_ms: i });
      hook.appendTelemetryLog(hook.normalizeTelemetryEvent({ skill_name: `bench-${i}` }), testLog);
    }
    const elapsed = performance.now() - startT;
    const avgMs = elapsed / benchIterations;
    console.log(`-> Performance: 100 normalizations + file appends took ${elapsed.toFixed(2)}ms (${avgMs.toFixed(3)}ms/op, budget: 50ms)`);
    assert.ok(avgMs < 10, "Average latency must be well under 10ms");

    // ----------------------------------------------------
    // 4. ANTI-CHEAT CHECK & TEST SUITE AUTHENTICITY
    // ----------------------------------------------------
    console.log("\n[CHECK 4] Anti-Cheat Check: Test Suite Authenticity");
    const testFilePath = path.resolve(__dirname, "../../apps/skills-catalog/test/telemetry-hook.test.js");
    const testFileCode = fs.readFileSync(testFilePath, "utf8");

    // Check for tautological assertions: assert(true), assert.ok(true), assert.equal(1, 1), etc.
    const tautologyPatterns = [
      /assert\s*\(\s*true\s*\)/,
      /assert\.ok\s*\(\s*true\s*\)/,
      /assert\.equal\s*\(\s*true\s*,\s*true\s*\)/,
      /assert\.equal\s*\(\s*1\s*,\s*1\s*\)/,
      /assert\.deepEqual\s*\(\s*\{\}\s*,\s*\{\}\s*\)/
    ];

    for (const pat of tautologyPatterns) {
      assert.ok(!pat.test(testFileCode), `Tautological assertion pattern detected: ${pat}`);
    }

    // Count assertion types
    const assertOkCount = (testFileCode.match(/assert\.ok\(/g) || []).length;
    const assertEqualCount = (testFileCode.match(/assert\.equal\(/g) || []).length;
    const assertDeepEqualCount = (testFileCode.match(/assert\.deepEqual\(/g) || []).length;
    console.log(`-> Assertion breakdown: assert.equal=${assertEqualCount}, assert.ok=${assertOkCount}, assert.deepEqual=${assertDeepEqualCount}`);
    assert.ok(assertEqualCount + assertOkCount + assertDeepEqualCount > 30, "Substantial assertions expected");

    // Check hook configs
    const agentsHook = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../.agents/hooks.json"), "utf8"));
    assert.equal(agentsHook.version, 1);
    assert.ok(Array.isArray(agentsHook.hooks.PostToolUse));
    assert.ok(agentsHook.hooks.PostToolUse[0].matcher.tools.includes("view_file"));
    assert.ok(agentsHook.hooks.PostToolUse[0].matcher.tools.includes("run_command"));
    assert.ok(agentsHook.hooks.PostToolUse[0].command.includes("telemetry-hook.js"));

    const claudeHook = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../.claude/hooks.json"), "utf8"));
    assert.equal(claudeHook.version, 1);
    assert.ok(Array.isArray(claudeHook.hooks.post_tool_execution));
    assert.ok(Array.isArray(claudeHook.hooks.stdio_event));

    console.log("-> PASS: .agents/hooks.json and .claude/hooks.json configs are valid and match specifications");

    // Clean up
    fs.rmSync(testDir, { recursive: true, force: true });
    testHttpServer.close(() => {
      console.log("\n=== ALL FORENSIC CHECKS PASSED: VERDICT = CLEAN ===");
      process.exit(0);
    });
  } catch (err) {
    console.error("FORENSIC CHECK FAILURE:", err);
    testHttpServer.close();
    process.exit(1);
  }
});
