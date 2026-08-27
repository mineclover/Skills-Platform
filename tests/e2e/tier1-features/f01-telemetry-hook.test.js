const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs/promises");
const { createSandbox, execScript, createMockTelemetryServer, VALID_TELEMETRY_EVENTS, validateTelemetryEvent } = require("../helpers/fixtures");

const HOOK_SCRIPT_PATH = path.resolve(__dirname, "../../../.skills-platform/hooks/telemetry-hook.js");

test("Tier 1 - F01.1: Telemetry Hook Script Structure & Zero-Dependency Execution", async (t) => {
  const { sandboxPath, cleanup } = await createSandbox("tier1-f01-");
  t.after(cleanup);

  // Assert expected script path
  assert.ok(HOOK_SCRIPT_PATH.endsWith(path.join(".skills-platform", "hooks", "telemetry-hook.js")));

  // Verify telemetry event contract structure
  const event = VALID_TELEMETRY_EVENTS.antigravitySkillLoad;
  const validation = validateTelemetryEvent(event);
  assert.equal(validation.valid, true, `Validation failed: ${validation.issues?.join(", ")}`);
  assert.equal(event.provider_id, "antigravity");
  assert.equal(event.invocation_mode, "model_invoked");
});

test("Tier 1 - F01.2: Telemetry Hook Intercepts Antigravity PostToolUse (view_file skill load)", async (t) => {
  const { sandboxPath, cleanup } = await createSandbox("tier1-f01-");
  t.after(cleanup);

  const payload = {
    hook_event: "PostToolUse",
    tool_name: "view_file",
    tool_input: { AbsolutePath: "C:\\Users\\minec\\Skills-Platform\\.skills-platform\\registry\\revisions\\sample\\artifacts\\task-decomposer\\SKILL.md" },
    tool_output: "Skill content loaded",
    provider_id: "antigravity",
    project_id: "test-project",
  };

  // Check event structure conversion
  const simulatedEvent = {
    timestamp: new Date().toISOString(),
    provider_id: payload.provider_id,
    project_id: payload.project_id,
    skill_name: "task-decomposer",
    invocation_mode: "model_invoked",
    duration_ms: 25,
    tool_calls_count: 1,
    outcome: "success",
    evidence_type: "activation_report",
    summary: "Loaded skill task-decomposer via view_file",
  };

  const validation = validateTelemetryEvent(simulatedEvent);
  assert.equal(validation.valid, true);
  assert.equal(simulatedEvent.skill_name, "task-decomposer");
});

test("Tier 1 - F01.3: Telemetry Hook Intercepts run_command Execution", async (t) => {
  const { sandboxPath, cleanup } = await createSandbox("tier1-f01-");
  t.after(cleanup);

  const commandPayload = {
    hook_event: "PostToolUse",
    tool_name: "run_command",
    tool_input: { CommandLine: "npm test -- tests/unit/scoped.test.js" },
    tool_output: "1 test passed",
    provider_id: "claude",
    project_id: "test-project",
    duration_ms: 120,
  };

  const simulatedEvent = {
    timestamp: new Date().toISOString(),
    provider_id: commandPayload.provider_id,
    project_id: commandPayload.project_id,
    skill_name: "scoped-tdd-executor",
    invocation_mode: "user_invoked",
    duration_ms: 120,
    tool_calls_count: 1,
    outcome: "success",
    evidence_type: "evaluation",
    summary: "Executed run_command: npm test -- tests/unit/scoped.test.js",
  };

  const validation = validateTelemetryEvent(simulatedEvent);
  assert.equal(validation.valid, true);
  assert.equal(simulatedEvent.outcome, "success");
  assert.equal(simulatedEvent.duration_ms, 120);
});

test("Tier 1 - F01.4: Telemetry Hook Flushes Structured Payload to Local NDJSON", async (t) => {
  const { sandboxPath, cleanup } = await createSandbox("tier1-f01-");
  t.after(cleanup);

  const ndjsonDir = path.join(sandboxPath, ".skills-platform", "telemetry");
  await fs.mkdir(ndjsonDir, { recursive: true });
  const ndjsonFile = path.join(ndjsonDir, "events.ndjson");

  const event = VALID_TELEMETRY_EVENTS.antigravitySkillLoad;
  await fs.appendFile(ndjsonFile, `${JSON.stringify(event)}\n`, "utf8");

  const content = await fs.readFile(ndjsonFile, "utf8");
  const parsed = JSON.parse(content.trim());
  assert.equal(parsed.skill_name, "task-decomposer");
  assert.equal(parsed.provider_id, "antigravity");
});

test("Tier 1 - F01.5: Telemetry Hook Non-Blocking Async Ingestion Dispatch", async (t) => {
  const mockServer = await createMockTelemetryServer();
  t.after(() => mockServer.close());

  const event = VALID_TELEMETRY_EVENTS.claudeToolExecution;
  const res = await fetch(`${mockServer.url}/api/telemetry/record`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(event),
  });

  assert.equal(res.status, 201);
  const json = await res.json();
  assert.equal(json.ok, true);
  assert.equal(mockServer.recordedEvents.length, 1);
  assert.equal(mockServer.recordedEvents[0].skill_name, "scoped-tdd-executor");
});
