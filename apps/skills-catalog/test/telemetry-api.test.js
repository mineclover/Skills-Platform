const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");

const {
  validateTelemetryEventPayload,
  normalizeValidatedEvent,
  resolveTelemetryPath,
  appendTelemetryEvent,
  readTelemetryEvents,
  recordTelemetry,
  getTelemetrySummary,
} = require("../src/telemetry");

const { createCatalogServer } = require("../src/server");
const { importLocalSource } = require("../src/registry");
const { createProject } = require("../src/catalog-state");
const { listSkillFeedback, getSkillFeedbackSummary } = require("../src/skill-management");

async function createTestFixture(context) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "telemetry-api-test-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));

  const registryRoot = path.join(root, "registry");
  const catalogRoot = path.join(root, "catalog");
  const telemetryPath = path.join(root, ".skills-platform", "telemetry", "events.ndjson");
  const sourceRoot = path.join(root, "source", "task-decomposer");

  await fs.mkdir(sourceRoot, { recursive: true });
  await fs.writeFile(
    path.join(sourceRoot, "SKILL.md"),
    "---\nname: task-decomposer\ndescription: Decomposes PRDs into atomic actionable tasks.\n---\n\n# Task Decomposer\n",
    "utf8"
  );

  const imported = await importLocalSource({ registryRoot, sourcePath: path.join(root, "source") });
  const lineageId = imported.skills[0].lineage_id;

  await createProject({
    catalogRoot,
    id: "demo-project",
    name: "Demo Project",
    projectPath: path.join(root, "demo-project"),
    providerId: "antigravity",
    deliveryRoot: path.join(root, "demo-project", ".agents", "skills"),
  });

  const server = createCatalogServer({ catalogRoot, registryRoot, telemetryPath });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  context.after(() => new Promise((resolve) => server.close(resolve)));

  return {
    root,
    registryRoot,
    catalogRoot,
    telemetryPath,
    lineageId,
    baseUrl,
    server,
  };
}

// ---------------------------------------------------------------------------
// Unit Tests: Schema Validation & Normalization
// ---------------------------------------------------------------------------

test("validateTelemetryEventPayload: accepts valid full event", () => {
  const fullEvent = {
    timestamp: "2026-08-28T07:00:00.000Z",
    provider_id: "antigravity",
    project_id: "skills-platform",
    recipe_id: "mlc-task-planning",
    skill_name: "task-decomposer",
    lineage_id: "lin-001",
    invocation_mode: "model_invoked",
    duration_ms: 45,
    tool_calls_count: 2,
    outcome: "success",
    evidence_type: "activation_report",
    summary: "Successfully executed task decomposition",
    details: "Parsed 4 requirements and created DAG",
    metrics: { cpu_usage_pct: 14.2, memory_mb: 64 },
  };

  const validation = validateTelemetryEventPayload(fullEvent);
  assert.equal(validation.valid, true);
  assert.equal(validation.issues.length, 0);

  const normalized = normalizeValidatedEvent(fullEvent);
  assert.equal(normalized.provider_id, "antigravity");
  assert.equal(normalized.duration_ms, 45);
  assert.equal(normalized.tool_calls_count, 2);
  assert.equal(normalized.recipe_id, "mlc-task-planning");
});

test("validateTelemetryEventPayload: accepts valid minimal event", () => {
  const minimalEvent = {
    timestamp: "2026-08-28T07:05:00.000Z",
    provider_id: "claude",
    project_id: "demo-proj",
    skill_name: "scoped-tdd-executor",
    invocation_mode: "user_invoked",
    duration_ms: 0,
    tool_calls_count: 0,
    outcome: "neutral",
    evidence_type: "manual",
    summary: "Manual trigger",
  };

  const validation = validateTelemetryEventPayload(minimalEvent);
  assert.equal(validation.valid, true);
});

test("validateTelemetryEventPayload: rejects missing mandatory fields", () => {
  const mandatoryFields = [
    "timestamp",
    "provider_id",
    "project_id",
    "skill_name",
    "invocation_mode",
    "duration_ms",
    "tool_calls_count",
    "outcome",
    "evidence_type",
    "summary",
  ];

  const baseEvent = {
    timestamp: "2026-08-28T07:00:00.000Z",
    provider_id: "antigravity",
    project_id: "proj-1",
    skill_name: "task-decomposer",
    invocation_mode: "model_invoked",
    duration_ms: 25,
    tool_calls_count: 1,
    outcome: "success",
    evidence_type: "manual",
    summary: "Sample",
  };

  for (const field of mandatoryFields) {
    const clone = { ...baseEvent };
    delete clone[field];
    const validation = validateTelemetryEventPayload(clone);
    assert.equal(validation.valid, false, `Field '${field}' should be mandatory`);
    assert.ok(validation.issues.length > 0);
  }
});

test("validateTelemetryEventPayload: rejects invalid enum and boundary values", () => {
  const validBase = {
    timestamp: "2026-08-28T07:00:00.000Z",
    provider_id: "antigravity",
    project_id: "proj-1",
    skill_name: "task-decomposer",
    invocation_mode: "model_invoked",
    duration_ms: 20,
    tool_calls_count: 1,
    outcome: "success",
    evidence_type: "manual",
    summary: "Test",
  };

  // Invalid provider
  assert.equal(validateTelemetryEventPayload({ ...validBase, provider_id: "unsupported-provider" }).valid, false);

  // Invalid invocation_mode
  assert.equal(validateTelemetryEventPayload({ ...validBase, invocation_mode: "magic_auto" }).valid, false);

  // Invalid outcome
  assert.equal(validateTelemetryEventPayload({ ...validBase, outcome: "fatal_crash" }).valid, false);

  // Invalid evidence_type
  assert.equal(validateTelemetryEventPayload({ ...validBase, evidence_type: "random_string" }).valid, false);

  // Negative duration
  assert.equal(validateTelemetryEventPayload({ ...validBase, duration_ms: -5 }).valid, false);

  // NaN duration
  assert.equal(validateTelemetryEventPayload({ ...validBase, duration_ms: NaN }).valid, false);

  // Infinity duration
  assert.equal(validateTelemetryEventPayload({ ...validBase, duration_ms: Infinity }).valid, false);

  // Negative tool calls count
  assert.equal(validateTelemetryEventPayload({ ...validBase, tool_calls_count: -1 }).valid, false);

  // Floating point tool calls count
  assert.equal(validateTelemetryEventPayload({ ...validBase, tool_calls_count: 2.5 }).valid, false);

  // Invalid timestamp
  assert.equal(validateTelemetryEventPayload({ ...validBase, timestamp: "not-a-date" }).valid, false);

  // Invalid metrics
  assert.equal(validateTelemetryEventPayload({ ...validBase, metrics: { error_count: -1 } }).valid, false);
  assert.equal(validateTelemetryEventPayload({ ...validBase, metrics: "not-an-object" }).valid, false);
});

// ---------------------------------------------------------------------------
// Unit Tests: NDJSON Log Operations
// ---------------------------------------------------------------------------

test("NDJSON operations: atomic append, read, filter, and error resilience", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ndjson-test-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));

  const logFile = path.join(root, "events.ndjson");

  // Reading non-existent file returns empty array
  const emptyEvents = await readTelemetryEvents({ telemetryPath: logFile });
  assert.deepEqual(emptyEvents, []);

  const event1 = {
    timestamp: "2026-08-28T07:00:00.000Z",
    provider_id: "antigravity",
    project_id: "proj-a",
    skill_name: "task-decomposer",
    invocation_mode: "model_invoked",
    duration_ms: 10,
    tool_calls_count: 1,
    outcome: "success",
    evidence_type: "manual",
    summary: "Event 1",
  };

  const event2 = {
    timestamp: "2026-08-28T07:10:00.000Z",
    provider_id: "claude",
    project_id: "proj-b",
    skill_name: "scoped-tdd-executor",
    invocation_mode: "user_invoked",
    duration_ms: 20,
    tool_calls_count: 2,
    outcome: "correction",
    evidence_type: "evaluation",
    summary: "Event 2",
  };

  await appendTelemetryEvent(event1, logFile);
  await appendTelemetryEvent(event2, logFile);

  // Read all
  const allEvents = await readTelemetryEvents({ telemetryPath: logFile });
  assert.equal(allEvents.length, 2);

  // Filter by provider
  const claudeEvents = await readTelemetryEvents({ telemetryPath: logFile, providerId: "claude" });
  assert.equal(claudeEvents.length, 1);
  assert.equal(claudeEvents[0].summary, "Event 2");

  // Filter by project
  const projAEvents = await readTelemetryEvents({ telemetryPath: logFile, projectId: "proj-a" });
  assert.equal(projAEvents.length, 1);
  assert.equal(projAEvents[0].summary, "Event 1");

  // Corrupted line resilience
  await fs.appendFile(logFile, "CORRUPTED_JSON_LINE\n", "utf8");
  const resilientEvents = await readTelemetryEvents({ telemetryPath: logFile });
  assert.equal(resilientEvents.length, 2);
});

// ---------------------------------------------------------------------------
// Integration Tests: REST API Endpoints & Feedback Bridge
// ---------------------------------------------------------------------------

test("POST /api/telemetry/record: ingests event, writes NDJSON, and bridges to SkillFeedback", async (context) => {
  const { baseUrl, catalogRoot, registryRoot, lineageId, telemetryPath } = await createTestFixture(context);

  const payload = {
    timestamp: "2026-08-28T07:00:00.000Z",
    provider_id: "antigravity",
    project_id: "demo-project",
    recipe_id: "mlc-task-planning",
    skill_name: "task-decomposer",
    lineage_id: lineageId,
    invocation_mode: "model_invoked",
    duration_ms: 35,
    tool_calls_count: 2,
    outcome: "success",
    evidence_type: "activation_report",
    summary: "Decomposed PRD into 4 tasks",
    details: "Plan generated cleanly",
    metrics: { cpu_usage_pct: 10.5 },
  };

  const response = await fetch(`${baseUrl}/api/telemetry/record`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  assert.equal(response.status, 201);
  const data = await response.json();
  assert.equal(data.ok, true);
  assert.equal(data.recorded, true);
  assert.ok(data.event);
  assert.equal(data.event.skill_name, "task-decomposer");
  assert.ok(data.feedback);
  assert.equal(data.feedback.lineage_id, lineageId);
  assert.equal(data.feedback.author, "telemetry:antigravity");
  assert.equal(data.feedback.scope, "project");
  assert.equal(data.feedback.metrics.duration_ms, 35);
  assert.equal(data.feedback.metrics.tool_calls_count, 2);

  // Check persisted in NDJSON
  const savedEvents = await readTelemetryEvents({ telemetryPath });
  assert.equal(savedEvents.length, 1);
  assert.equal(savedEvents[0].skill_name, "task-decomposer");

  // Check queryable via skill feedback store
  const feedbackList = await listSkillFeedback({ catalogRoot, lineageId });
  assert.equal(feedbackList.length, 1);
  assert.equal(feedbackList[0].id, data.feedback.id);

  // Check health summary reflects telemetry outcome
  const healthSummary = await getSkillFeedbackSummary({ catalogRoot, registryRoot, lineageId });
  assert.equal(healthSummary.total_feedback, 1);
  assert.equal(healthSummary.by_outcome.success, 1);
  assert.equal(healthSummary.health, "healthy");
});

test("POST /api/telemetry/record: rejects malformed payload and returns 400 Bad Request with issues", async (context) => {
  const { baseUrl } = await createTestFixture(context);

  const invalidPayload = {
    provider_id: "unknown_bot",
    duration_ms: -10,
  };

  const response = await fetch(`${baseUrl}/api/telemetry/record`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(invalidPayload),
  });

  assert.equal(response.status, 400);
  const errorData = await response.json();
  assert.ok(errorData.error);
  assert.ok(Array.isArray(errorData.issues));
  assert.ok(errorData.issues.length > 0);
});

test("POST /api/telemetry/record: rejects invalid non-JSON body with 400 Bad Request", async (context) => {
  const { baseUrl } = await createTestFixture(context);

  const response = await fetch(`${baseUrl}/api/telemetry/record`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "NOT_VALID_JSON{[[[",
  });

  assert.equal(response.status, 400);
  const errorData = await response.json();
  assert.ok(errorData.error);
});

test("GET /api/telemetry/summary: returns valid default structure when empty", async (context) => {
  const { baseUrl } = await createTestFixture(context);

  const response = await fetch(`${baseUrl}/api/telemetry/summary`);
  assert.equal(response.status, 200);

  const summary = await response.json();
  assert.equal(summary.total_invocations, 0);
  assert.equal(summary.average_duration_ms, 0);
  assert.equal(summary.success_rate, 1.0);
  assert.deepEqual(summary.by_mode, {
    model_invoked: 0,
    user_invoked: 0,
    hybrid: 0,
    unspecified: 0,
  });
  assert.deepEqual(summary.by_provider, {});
  assert.deepEqual(summary.by_health, {
    healthy: 0,
    needs_review: 0,
    unknown: 0,
  });
  assert.deepEqual(summary.recent_events, []);
});

test("GET /api/telemetry/summary: accurately calculates multi-provider real-time metrics", async (context) => {
  const { baseUrl } = await createTestFixture(context);

  const events = [
    {
      timestamp: "2026-08-28T07:00:00.000Z",
      provider_id: "antigravity",
      project_id: "proj-1",
      skill_name: "task-decomposer",
      invocation_mode: "model_invoked",
      duration_ms: 30,
      tool_calls_count: 1,
      outcome: "success",
      evidence_type: "activation_report",
      summary: "Event 1",
    },
    {
      timestamp: "2026-08-28T07:05:00.000Z",
      provider_id: "antigravity",
      project_id: "proj-1",
      skill_name: "task-decomposer",
      invocation_mode: "model_invoked",
      duration_ms: 50,
      tool_calls_count: 2,
      outcome: "success",
      evidence_type: "activation_report",
      summary: "Event 2",
    },
    {
      timestamp: "2026-08-28T07:10:00.000Z",
      provider_id: "claude",
      project_id: "proj-2",
      skill_name: "scoped-tdd-executor",
      invocation_mode: "user_invoked",
      duration_ms: 40,
      tool_calls_count: 1,
      outcome: "correction",
      evidence_type: "evaluation",
      summary: "Event 3",
    },
    {
      timestamp: "2026-08-28T07:15:00.000Z",
      provider_id: "codex",
      project_id: "proj-1",
      skill_name: "horizontal-topic-scanner",
      invocation_mode: "hybrid",
      duration_ms: 20,
      tool_calls_count: 1,
      outcome: "neutral",
      evidence_type: "manual",
      summary: "Event 4",
    },
    {
      timestamp: "2026-08-28T07:20:00.000Z",
      provider_id: "ralph-tui",
      project_id: "proj-1",
      skill_name: "global-regression-gatekeeper",
      invocation_mode: "unspecified",
      duration_ms: 60,
      tool_calls_count: 3,
      outcome: "risk",
      evidence_type: "incident",
      summary: "Event 5",
    },
  ];

  for (const e of events) {
    const res = await fetch(`${baseUrl}/api/telemetry/record`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(e),
    });
    assert.equal(res.status, 201);
  }

  // Query overall summary
  const summaryRes = await fetch(`${baseUrl}/api/telemetry/summary`);
  assert.equal(summaryRes.status, 200);
  const summary = await summaryRes.json();

  assert.equal(summary.total_invocations, 5);
  // Avg duration: (30 + 50 + 40 + 20 + 60) / 5 = 200 / 5 = 40
  assert.equal(summary.average_duration_ms, 40);
  // Success rate: 2 successes / 5 = 0.4
  assert.equal(summary.success_rate, 0.4);

  // Invocation modes
  assert.equal(summary.by_mode.model_invoked, 2);
  assert.equal(summary.by_mode.user_invoked, 1);
  assert.equal(summary.by_mode.hybrid, 1);
  assert.equal(summary.by_mode.unspecified, 1);

  // Provider distribution
  assert.equal(summary.by_provider.antigravity, 2);
  assert.equal(summary.by_provider.claude, 1);
  assert.equal(summary.by_provider.codex, 1);
  assert.equal(summary.by_provider["ralph-tui"], 1);

  // Health distribution: healthy: success (2) + neutral (1) = 3; needs_review: correction (1) + risk (1) = 2
  assert.equal(summary.by_health.healthy, 3);
  assert.equal(summary.by_health.needs_review, 2);
  assert.equal(summary.by_health.unknown, 0);

  // Recent events reverse chronological
  assert.equal(summary.recent_events.length, 5);
  assert.equal(summary.recent_events[0].summary, "Event 5");
  assert.equal(summary.recent_events[4].summary, "Event 1");
});

test("GET /api/telemetry/summary: supports query parameters filtering", async (context) => {
  const { baseUrl } = await createTestFixture(context);

  await fetch(`${baseUrl}/api/telemetry/record`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      timestamp: "2026-08-28T07:00:00.000Z",
      provider_id: "antigravity",
      project_id: "proj-alpha",
      skill_name: "task-decomposer",
      invocation_mode: "model_invoked",
      duration_ms: 10,
      tool_calls_count: 1,
      outcome: "success",
      evidence_type: "manual",
      summary: "Alpha event",
    }),
  });

  await fetch(`${baseUrl}/api/telemetry/record`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      timestamp: "2026-08-28T07:10:00.000Z",
      provider_id: "claude",
      project_id: "proj-beta",
      skill_name: "scoped-tdd-executor",
      invocation_mode: "user_invoked",
      duration_ms: 20,
      tool_calls_count: 1,
      outcome: "success",
      evidence_type: "manual",
      summary: "Beta event",
    }),
  });

  // Filter by provider_id
  const claudeRes = await fetch(`${baseUrl}/api/telemetry/summary?provider_id=claude`);
  const claudeSummary = await claudeRes.json();
  assert.equal(claudeSummary.total_invocations, 1);
  assert.equal(claudeSummary.by_provider.claude, 1);
  assert.equal(claudeSummary.by_provider.antigravity, undefined);

  // Filter by project_id
  const alphaRes = await fetch(`${baseUrl}/api/telemetry/summary?project_id=proj-alpha`);
  const alphaSummary = await alphaRes.json();
  assert.equal(alphaSummary.total_invocations, 1);
  assert.equal(alphaSummary.recent_events[0].summary, "Alpha event");
});

test("GET /api/telemetry/summary: caps recent_events to 20 elements", async (context) => {
  const { baseUrl } = await createTestFixture(context);

  for (let i = 0; i < 25; i++) {
    await fetch(`${baseUrl}/api/telemetry/record`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        timestamp: new Date(Date.now() + i * 1000).toISOString(),
        provider_id: "antigravity",
        project_id: "bulk-proj",
        skill_name: "task-decomposer",
        invocation_mode: "model_invoked",
        duration_ms: 10,
        tool_calls_count: 1,
        outcome: "success",
        evidence_type: "activation_report",
        summary: `Burst Event #${i}`,
      }),
    });
  }

  const res = await fetch(`${baseUrl}/api/telemetry/summary`);
  const summary = await res.json();
  assert.equal(summary.total_invocations, 25);
  assert.equal(summary.recent_events.length, 20);
  assert.equal(summary.recent_events[0].summary, "Burst Event #24");
});
