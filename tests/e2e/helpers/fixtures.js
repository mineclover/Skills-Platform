const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

/**
 * Valid sample telemetry events conforming to PROJECT.md / ORIGINAL_REQUEST.md
 */
const VALID_TELEMETRY_EVENTS = {
  antigravitySkillLoad: {
    timestamp: "2026-08-28T07:00:00.000Z",
    provider_id: "antigravity",
    project_id: "skills-platform-core",
    recipe_id: "mlc-task-planning",
    skill_name: "task-decomposer",
    lineage_id: "lin-001",
    invocation_mode: "model_invoked",
    duration_ms: 32,
    tool_calls_count: 1,
    outcome: "success",
    evidence_type: "activation_report",
    summary: "Successfully loaded task-decomposer for PRD analysis.",
    metrics: { cpu_usage_pct: 12.5, memory_mb: 48 },
  },
  claudeToolExecution: {
    timestamp: "2026-08-28T07:05:12.345Z",
    provider_id: "claude",
    project_id: "skills-platform-core",
    recipe_id: "mlc-scoped-inner-loop",
    skill_name: "scoped-tdd-executor",
    lineage_id: "lin-002",
    invocation_mode: "user_invoked",
    duration_ms: 45,
    tool_calls_count: 3,
    outcome: "correction",
    evidence_type: "evaluation",
    summary: "Executed scoped TDD run with single assertion fix.",
    metrics: { assertions_passed: 12, retries: 1 },
  },
  codexRalphStream: {
    timestamp: "2026-08-28T07:10:00.000Z",
    provider_id: "codex",
    project_id: "demo-project",
    skill_name: "horizontal-topic-scanner",
    invocation_mode: "hybrid",
    duration_ms: 18,
    tool_calls_count: 2,
    outcome: "neutral",
    evidence_type: "manual",
    summary: "Scanned horizontal registry topics.",
  },
  releaseGovernanceGate: {
    timestamp: "2026-08-28T07:15:30.000Z",
    provider_id: "ralph-tui",
    project_id: "skills-platform-core",
    recipe_id: "mlc-release-governance",
    skill_name: "global-regression-gatekeeper",
    lineage_id: "lin-003",
    invocation_mode: "user_invoked",
    duration_ms: 49,
    tool_calls_count: 5,
    outcome: "risk",
    evidence_type: "incident",
    summary: "Global regression flagged boundary regression in downstream module.",
    metrics: { failed_suites: 1, total_suites: 8 },
  },
  minimalEvent: {
    timestamp: "2026-08-28T07:20:00.000Z",
    provider_id: "antigravity",
    project_id: "minimal-proj",
    skill_name: "baseline-convention-registry",
    invocation_mode: "unspecified",
    duration_ms: 10,
    tool_calls_count: 0,
    outcome: "success",
    evidence_type: "user_feedback",
    summary: "Minimal event with only mandatory fields.",
  },
};

/**
 * Malformed or invalid events for boundary testing
 */
const INVALID_TELEMETRY_EVENTS = {
  missingTimestamp: {
    provider_id: "antigravity",
    project_id: "proj-1",
    skill_name: "task-decomposer",
    invocation_mode: "model_invoked",
    duration_ms: 20,
    tool_calls_count: 1,
    outcome: "success",
    evidence_type: "manual",
    summary: "Missing timestamp",
  },
  invalidProviderId: {
    timestamp: "2026-08-28T07:00:00.000Z",
    provider_id: "unsupported-provider-xyz",
    project_id: "proj-1",
    skill_name: "task-decomposer",
    invocation_mode: "model_invoked",
    duration_ms: 20,
    tool_calls_count: 1,
    outcome: "success",
    evidence_type: "manual",
    summary: "Invalid provider",
  },
  invalidInvocationMode: {
    timestamp: "2026-08-28T07:00:00.000Z",
    provider_id: "antigravity",
    project_id: "proj-1",
    skill_name: "task-decomposer",
    invocation_mode: "magic_mode",
    duration_ms: 20,
    tool_calls_count: 1,
    outcome: "success",
    evidence_type: "manual",
    summary: "Invalid invocation mode",
  },
  invalidOutcome: {
    timestamp: "2026-08-28T07:00:00.000Z",
    provider_id: "antigravity",
    project_id: "proj-1",
    skill_name: "task-decomposer",
    invocation_mode: "model_invoked",
    duration_ms: 20,
    tool_calls_count: 1,
    outcome: "super_success",
    evidence_type: "manual",
    summary: "Invalid outcome",
  },
  invalidEvidenceType: {
    timestamp: "2026-08-28T07:00:00.000Z",
    provider_id: "antigravity",
    project_id: "proj-1",
    skill_name: "task-decomposer",
    invocation_mode: "model_invoked",
    duration_ms: 20,
    tool_calls_count: 1,
    outcome: "success",
    evidence_type: "arbitrary_string",
    summary: "Invalid evidence type",
  },
  negativeDuration: {
    timestamp: "2026-08-28T07:00:00.000Z",
    provider_id: "antigravity",
    project_id: "proj-1",
    skill_name: "task-decomposer",
    invocation_mode: "model_invoked",
    duration_ms: -50,
    tool_calls_count: 1,
    outcome: "success",
    evidence_type: "manual",
    summary: "Negative duration",
  },
};

/**
 * Sample PRD for Phase 1 decomposition
 */
const SAMPLE_PRD = {
  version: 1,
  id: "PRD-2026-08-TELEMETRY",
  title: "Telemetry & Autonomous Loop Subsystem",
  goals: [
    "Capture zero-dependency multi-agent telemetry in <50ms",
    "Expose catalog ingestion and summary REST endpoints",
    "Orchestrate 3-phase autonomous lifecycle loop with test storm suppression",
  ],
  tasks: [
    {
      id: "TASK-001",
      title: "Hook Engine Implementation",
      description: "Implement telemetry-hook.js with NDJSON logging",
      scope: "vertical",
      target_test: "tests/unit/hook.test.js",
      dependencies: [],
    },
    {
      id: "TASK-002",
      title: "Catalog Ingestion API",
      description: "Implement POST /api/telemetry/record and GET /api/telemetry/summary",
      scope: "vertical",
      target_test: "tests/unit/telemetry-api.test.js",
      dependencies: ["TASK-001"],
    },
    {
      id: "TASK-003",
      title: "CLI Lifecycle Loop",
      description: "Implement skills-platform loop run with junction swapping",
      scope: "vertical",
      target_test: "tests/unit/lifecycle-loop.test.js",
      dependencies: ["TASK-002"],
    },
  ],
};

/**
 * Validate TelemetryEvent against schema contract
 */
function validateTelemetryEvent(event) {
  const issues = [];
  if (!event || typeof event !== "object") {
    return { valid: false, issues: ["Event must be a non-null object"] };
  }
  if (!event.timestamp || typeof event.timestamp !== "string" || isNaN(Date.parse(event.timestamp))) {
    issues.push("Invalid or missing timestamp (ISO 8601 string required)");
  }
  const validProviders = new Set(["antigravity", "claude", "codex", "ralph-tui"]);
  if (!event.provider_id || !validProviders.has(event.provider_id)) {
    issues.push(`Invalid provider_id: ${event.provider_id}. Allowed: ${[...validProviders].join(", ")}`);
  }
  if (!event.project_id || typeof event.project_id !== "string") {
    issues.push("Missing or invalid project_id string");
  }
  if (!event.skill_name || typeof event.skill_name !== "string") {
    issues.push("Missing or invalid skill_name string");
  }
  const validModes = new Set(["model_invoked", "user_invoked", "hybrid", "unspecified"]);
  if (!event.invocation_mode || !validModes.has(event.invocation_mode)) {
    issues.push(`Invalid invocation_mode: ${event.invocation_mode}`);
  }
  if (typeof event.duration_ms !== "number" || !Number.isFinite(event.duration_ms) || event.duration_ms < 0) {
    issues.push("duration_ms must be a finite non-negative number");
  }
  if (typeof event.tool_calls_count !== "number" || !Number.isFinite(event.tool_calls_count) || event.tool_calls_count < 0) {
    issues.push("tool_calls_count must be a finite non-negative integer");
  }
  const validOutcomes = new Set(["success", "correction", "scope_mismatch", "freshness", "risk", "neutral"]);
  if (!event.outcome || !validOutcomes.has(event.outcome)) {
    issues.push(`Invalid outcome: ${event.outcome}`);
  }
  const validEvidenceTypes = new Set(["manual", "evaluation", "activation_report", "user_feedback", "incident"]);
  if (!event.evidence_type || !validEvidenceTypes.has(event.evidence_type)) {
    issues.push(`Invalid evidence_type: ${event.evidence_type}`);
  }
  if (typeof event.summary !== "string") {
    issues.push("summary must be a string");
  }
  return { valid: issues.length === 0, issues };
}

/**
 * Validate TelemetrySummary against schema contract
 */
function validateTelemetrySummary(summary) {
  const issues = [];
  if (!summary || typeof summary !== "object") {
    return { valid: false, issues: ["Summary must be a non-null object"] };
  }
  if (typeof summary.total_invocations !== "number" || summary.total_invocations < 0) {
    issues.push("total_invocations must be a non-negative number");
  }
  if (typeof summary.average_duration_ms !== "number" || summary.average_duration_ms < 0) {
    issues.push("average_duration_ms must be a non-negative number");
  }
  if (typeof summary.success_rate !== "number" || summary.success_rate < 0 || summary.success_rate > 100) {
    issues.push("success_rate must be a valid number between 0 and 1 (or 0-100%)");
  }
  if (!summary.by_mode || typeof summary.by_mode !== "object") {
    issues.push("by_mode breakdown object is required");
  } else {
    for (const mode of ["model_invoked", "user_invoked", "hybrid", "unspecified"]) {
      if (typeof summary.by_mode[mode] !== "number") {
        issues.push(`by_mode.${mode} must be a number`);
      }
    }
  }
  if (!summary.by_provider || typeof summary.by_provider !== "object") {
    issues.push("by_provider object is required");
  }
  if (!summary.by_health || typeof summary.by_health !== "object") {
    issues.push("by_health breakdown object is required");
  } else {
    for (const health of ["healthy", "needs_review", "unknown"]) {
      if (typeof summary.by_health[health] !== "number") {
        issues.push(`by_health.${health} must be a number`);
      }
    }
  }
  if (!Array.isArray(summary.recent_events)) {
    issues.push("recent_events must be an array");
  }
  return { valid: issues.length === 0, issues };
}

/**
 * Create a temporary sandbox directory for test isolation
 */
async function createSandbox(prefix = "e2e-sandbox-") {
  const sandboxPath = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  const cleanup = async () => {
    try {
      await fs.rm(sandboxPath, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  };
  return { sandboxPath, cleanup };
}

/**
 * Setup a minimal local registry and catalog fixture with an imported skill
 */
async function setupTestCatalogWithSkill({ sandboxPath, skillName = "task-decomposer" }) {
  const root = sandboxPath;
  const sourcePath = path.join(root, "source", skillName);
  const registryRoot = path.join(root, "registry");
  const catalogRoot = path.join(root, "catalog");
  await fs.mkdir(sourcePath, { recursive: true });
  await fs.writeFile(
    path.join(sourcePath, "SKILL.md"),
    `---\nname: ${skillName}\ndescription: Test skill for ${skillName}\n---\n\n# ${skillName}\n`,
    "utf8"
  );
  const { importLocalSource } = require("../../../apps/skills-catalog/src");
  const imported = await importLocalSource({ registryRoot, sourcePath: path.join(root, "source") });
  const lineageId = imported.skills[0].lineage_id;
  return { catalogRoot, registryRoot, imported, lineageId, skillName, sourcePath };
}

/**
 * Execute a Node.js script asynchronously and capture stdout, stderr, exit code, and execution duration
 */
function execScript(scriptPath, args = [], options = {}) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const child = spawn(process.execPath, [scriptPath, ...args], {
      cwd: options.cwd || process.cwd(),
      env: { ...process.env, ...options.env },
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    if (options.stdin) {
      child.stdin.write(options.stdin);
      child.stdin.end();
    }

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
    }, options.timeout || 10000);

    child.on("close", (code) => {
      clearTimeout(timer);
      const durationMs = Date.now() - startTime;
      resolve({
        code,
        stdout,
        stderr,
        durationMs,
      });
    });
  });
}

/**
 * Start a lightweight mock telemetry HTTP server
 */
function createMockTelemetryServer(port = 0) {
  const recordedEvents = [];
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${server.address()?.port || port}`);
    if (req.method === "POST" && url.pathname === "/api/telemetry/record") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        try {
          const event = JSON.parse(body);
          const validation = validateTelemetryEvent(event);
          if (!validation.valid) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Invalid event", issues: validation.issues }));
            return;
          }
          recordedEvents.push(event);
          res.writeHead(201, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true, id: `rec-${recordedEvents.length}` }));
        } catch {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Invalid JSON" }));
        }
      });
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/telemetry/summary") {
      const total = recordedEvents.length;
      const avgDuration = total > 0 ? recordedEvents.reduce((s, e) => s + e.duration_ms, 0) / total : 0;
      const successCount = recordedEvents.filter((e) => e.outcome === "success").length;
      const summary = {
        total_invocations: total,
        average_duration_ms: Math.round(avgDuration * 100) / 100,
        success_rate: total > 0 ? Math.round((successCount / total) * 100) / 100 : 1.0,
        by_mode: {
          model_invoked: recordedEvents.filter((e) => e.invocation_mode === "model_invoked").length,
          user_invoked: recordedEvents.filter((e) => e.invocation_mode === "user_invoked").length,
          hybrid: recordedEvents.filter((e) => e.invocation_mode === "hybrid").length,
          unspecified: recordedEvents.filter((e) => e.invocation_mode === "unspecified").length,
        },
        by_provider: recordedEvents.reduce((acc, e) => {
          acc[e.provider_id] = (acc[e.provider_id] || 0) + 1;
          return acc;
        }, {}),
        by_health: {
          healthy: recordedEvents.filter((e) => ["success", "neutral"].includes(e.outcome)).length,
          needs_review: recordedEvents.filter((e) => ["correction", "scope_mismatch", "freshness", "risk"].includes(e.outcome)).length,
          unknown: 0,
        },
        recent_events: recordedEvents.slice(-20).reverse(),
      };
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(summary));
      return;
    }
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  });

  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () => {
      const assignedPort = server.address().port;
      resolve({
        server,
        port: assignedPort,
        url: `http://127.0.0.1:${assignedPort}`,
        recordedEvents,
        close: () => new Promise((cb) => server.close(cb)),
      });
    });
  });
}

module.exports = {
  VALID_TELEMETRY_EVENTS,
  INVALID_TELEMETRY_EVENTS,
  SAMPLE_PRD,
  validateTelemetryEvent,
  validateTelemetrySummary,
  createSandbox,
  setupTestCatalogWithSkill,
  execScript,
  createMockTelemetryServer,
};
