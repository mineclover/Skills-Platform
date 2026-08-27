"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const { listSkillLineages, listRegistrySkills } = require("./registry");
const { loadCatalog } = require("./catalog-state");
const { addSkillFeedback } = require("./skill-management");

const VALID_INVOCATION_MODES = new Set(["model_invoked", "user_invoked", "hybrid", "unspecified"]);
const VALID_OUTCOMES = new Set(["success", "correction", "scope_mismatch", "freshness", "risk", "neutral"]);
const VALID_EVIDENCE_TYPES = new Set(["manual", "evaluation", "activation_report", "user_feedback", "incident"]);
const VALID_PROVIDERS = new Set(["antigravity", "claude", "codex", "ralph-tui"]);

/**
 * Validates a TelemetryEvent payload against the strict interface contract.
 */
function validateTelemetryEventPayload(event) {
  const issues = [];
  if (!event || typeof event !== "object" || Array.isArray(event)) {
    return { valid: false, issues: ["Event must be a non-null object"] };
  }

  // 1. timestamp: required ISO-8601 string
  if (typeof event.timestamp !== "string" || !event.timestamp.trim() || Number.isNaN(Date.parse(event.timestamp))) {
    issues.push("Invalid or missing timestamp (ISO 8601 string required)");
  }

  // 2. provider_id: required, one of VALID_PROVIDERS
  if (typeof event.provider_id !== "string" || !VALID_PROVIDERS.has(event.provider_id.trim().toLowerCase())) {
    issues.push(`Invalid provider_id: ${event.provider_id}. Allowed: ${[...VALID_PROVIDERS].join(", ")}`);
  }

  // 3. project_id: required non-empty string
  if (typeof event.project_id !== "string" || !event.project_id.trim()) {
    issues.push("Missing or invalid project_id string");
  }

  // 4. recipe_id: optional string
  if (event.recipe_id !== undefined && event.recipe_id !== null && typeof event.recipe_id !== "string") {
    issues.push("recipe_id must be a string if specified");
  }

  // 5. skill_name: required non-empty string
  if (typeof event.skill_name !== "string" || !event.skill_name.trim()) {
    issues.push("Missing or invalid skill_name string");
  }

  // 6. lineage_id: optional string
  if (event.lineage_id !== undefined && event.lineage_id !== null && typeof event.lineage_id !== "string") {
    issues.push("lineage_id must be a string if specified");
  }

  // 7. invocation_mode: required, one of VALID_INVOCATION_MODES
  if (typeof event.invocation_mode !== "string" || !VALID_INVOCATION_MODES.has(event.invocation_mode.trim())) {
    issues.push(`Invalid invocation_mode: ${event.invocation_mode}. Allowed: ${[...VALID_INVOCATION_MODES].join(", ")}`);
  }

  // 8. duration_ms: required finite non-negative number
  if (typeof event.duration_ms !== "number" || !Number.isFinite(event.duration_ms) || Number.isNaN(event.duration_ms) || event.duration_ms < 0) {
    issues.push("duration_ms must be a finite non-negative number");
  }

  // 9. tool_calls_count: required finite non-negative integer
  if (typeof event.tool_calls_count !== "number" || !Number.isInteger(event.tool_calls_count) || event.tool_calls_count < 0) {
    issues.push("tool_calls_count must be a finite non-negative integer");
  }

  // 10. outcome: required, one of VALID_OUTCOMES
  if (typeof event.outcome !== "string" || !VALID_OUTCOMES.has(event.outcome.trim())) {
    issues.push(`Invalid outcome: ${event.outcome}. Allowed: ${[...VALID_OUTCOMES].join(", ")}`);
  }

  // 11. evidence_type: required, one of VALID_EVIDENCE_TYPES
  if (typeof event.evidence_type !== "string" || !VALID_EVIDENCE_TYPES.has(event.evidence_type.trim())) {
    issues.push(`Invalid evidence_type: ${event.evidence_type}. Allowed: ${[...VALID_EVIDENCE_TYPES].join(", ")}`);
  }

  // 12. summary: required non-empty string
  if (typeof event.summary !== "string" || !event.summary.trim()) {
    issues.push("summary must be a non-empty string");
  }

  // 13. details: optional string or null
  if (event.details !== undefined && event.details !== null && typeof event.details !== "string") {
    issues.push("details must be a string if specified");
  }

  // 14. metrics: optional object with non-negative numbers
  if (event.metrics !== undefined && event.metrics !== null) {
    if (typeof event.metrics !== "object" || Array.isArray(event.metrics)) {
      issues.push("metrics must be an object if specified");
    } else {
      for (const [key, val] of Object.entries(event.metrics)) {
        if (typeof val !== "number" || !Number.isFinite(val) || Number.isNaN(val) || val < 0) {
          issues.push(`metric ${key} must be a finite non-negative number`);
        }
      }
    }
  }

  return { valid: issues.length === 0, issues };
}

/**
 * Normalizes a validated telemetry event.
 */
function normalizeValidatedEvent(event) {
  const normalized = {
    timestamp: event.timestamp.trim(),
    provider_id: event.provider_id.trim().toLowerCase(),
    project_id: event.project_id.trim(),
    skill_name: event.skill_name.trim(),
    invocation_mode: event.invocation_mode.trim(),
    duration_ms: event.duration_ms,
    tool_calls_count: event.tool_calls_count,
    outcome: event.outcome.trim(),
    evidence_type: event.evidence_type.trim(),
    summary: event.summary.trim(),
  };

  if (typeof event.recipe_id === "string" && event.recipe_id.trim()) {
    normalized.recipe_id = event.recipe_id.trim();
  }
  if (typeof event.lineage_id === "string" && event.lineage_id.trim()) {
    normalized.lineage_id = event.lineage_id.trim();
  }
  if (typeof event.details === "string") {
    normalized.details = event.details;
  }
  if (event.metrics && typeof event.metrics === "object" && !Array.isArray(event.metrics)) {
    normalized.metrics = { ...event.metrics };
  }

  return normalized;
}

/**
 * Resolves the destination NDJSON file path.
 */
function resolveTelemetryPath(catalogRoot = null, explicitPath = null) {
  if (explicitPath) return path.resolve(explicitPath);
  if (process.env.SKILLS_TELEMETRY_LOG) return path.resolve(process.env.SKILLS_TELEMETRY_LOG);
  if (catalogRoot) {
    const parent = path.dirname(path.resolve(catalogRoot));
    return path.join(parent, ".skills-platform", "telemetry", "events.ndjson");
  }
  return path.resolve(".skills-platform", "telemetry", "events.ndjson");
}

/**
 * Appends a telemetry event to the NDJSON log file.
 */
async function appendTelemetryEvent(event, telemetryPath) {
  const resolvedPath = path.resolve(telemetryPath);
  await fs.mkdir(path.dirname(resolvedPath), { recursive: true });
  const line = `${JSON.stringify(event)}\n`;
  await fs.appendFile(resolvedPath, line, "utf8");
}

/**
 * Reads and filters telemetry events from the NDJSON log file.
 */
async function readTelemetryEvents({ telemetryPath, projectId, providerId, skillName, since } = {}) {
  const resolvedPath = path.resolve(telemetryPath);
  try {
    const content = await fs.readFile(resolvedPath, "utf8");
    const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
    const events = [];
    for (const line of lines) {
      try {
        const item = JSON.parse(line);
        if (projectId && item.project_id !== projectId) continue;
        if (providerId && item.provider_id !== providerId) continue;
        if (skillName && item.skill_name !== skillName) continue;
        if (since && new Date(item.timestamp) < new Date(since)) continue;
        events.push(item);
      } catch {
        // Safely skip malformed/corrupted lines
      }
    }
    return events;
  } catch (err) {
    if (err.code === "ENOENT") return [];
    throw err;
  }
}

/**
 * Records a telemetry event: validates schema, writes to NDJSON, and bridges to feedback store.
 */
async function recordTelemetry({ catalogRoot, registryRoot, telemetryPath, payload }) {
  const validation = validateTelemetryEventPayload(payload);
  if (!validation.valid) {
    const error = new Error(`Invalid telemetry event: ${validation.issues.join("; ")}`);
    error.issues = validation.issues;
    throw error;
  }

  const event = normalizeValidatedEvent(payload);
  const targetPath = resolveTelemetryPath(catalogRoot, telemetryPath);
  await appendTelemetryEvent(event, targetPath);

  let feedbackRecord = null;
  if (catalogRoot && registryRoot) {
    try {
      let lineageId = event.lineage_id || null;
      if (!lineageId) {
        // Attempt lookup by skill_name
        const [lineages, registrySkills] = await Promise.all([
          listSkillLineages(registryRoot).catch(() => []),
          listRegistrySkills(registryRoot).catch(() => []),
        ]);
        const matchedLineage = lineages.find((l) => l.skill_name === event.skill_name || l.id === event.skill_name);
        if (matchedLineage) {
          lineageId = matchedLineage.id;
        } else {
          const matchedSkill = registrySkills.find((s) => s.skill_name === event.skill_name);
          if (matchedSkill) lineageId = matchedSkill.lineage_id;
        }
      }

      if (lineageId) {
        const catalog = await loadCatalog(catalogRoot).catch(() => null);
        const projectExists = catalog?.projects?.some((p) => p.id === event.project_id);
        const scope = projectExists ? "project" : "global";
        const author = event.provider_id ? `telemetry:${event.provider_id}` : "telemetry";

        feedbackRecord = await addSkillFeedback({
          catalogRoot,
          registryRoot,
          lineageId,
          scope,
          outcome: event.outcome,
          evidenceType: event.evidence_type,
          summary: event.summary,
          details: event.details || null,
          author,
          projectId: event.project_id || null,
          metrics: {
            duration_ms: event.duration_ms,
            tool_calls_count: event.tool_calls_count,
            ...(event.metrics || {}),
          },
        });
      }
    } catch {
      // Feedback bridging failure (e.g. unregistered lineage in standalone tests) does not fail ingestion
      feedbackRecord = null;
    }
  }

  return {
    ok: true,
    recorded: true,
    event,
    feedback: feedbackRecord,
  };
}

/**
 * Calculates aggregated real-time metrics across recorded telemetry events.
 */
async function getTelemetrySummary({ catalogRoot, registryRoot, telemetryPath, projectId, providerId, skillName, since, limit = 20 } = {}) {
  const targetPath = resolveTelemetryPath(catalogRoot, telemetryPath);
  const events = await readTelemetryEvents({ telemetryPath: targetPath, projectId, providerId, skillName, since });

  const total = events.length;
  if (total === 0) {
    return {
      total_invocations: 0,
      average_duration_ms: 0,
      success_rate: 1.0,
      by_mode: {
        model_invoked: 0,
        user_invoked: 0,
        hybrid: 0,
        unspecified: 0,
      },
      by_provider: {},
      by_health: {
        healthy: 0,
        needs_review: 0,
        unknown: 0,
      },
      recent_events: [],
    };
  }

  const totalDuration = events.reduce((sum, e) => sum + (typeof e.duration_ms === "number" ? e.duration_ms : 0), 0);
  const avgDuration = Math.round((totalDuration / total) * 100) / 100;

  const successCount = events.filter((e) => e.outcome === "success").length;
  const successRate = Math.round((successCount / total) * 100) / 100;

  const byMode = {
    model_invoked: events.filter((e) => e.invocation_mode === "model_invoked").length,
    user_invoked: events.filter((e) => e.invocation_mode === "user_invoked").length,
    hybrid: events.filter((e) => e.invocation_mode === "hybrid").length,
    unspecified: events.filter((e) => e.invocation_mode === "unspecified").length,
  };

  const byProvider = {};
  for (const e of events) {
    if (e.provider_id) {
      byProvider[e.provider_id] = (byProvider[e.provider_id] || 0) + 1;
    }
  }

  const healthyCount = events.filter((e) => ["success", "neutral"].includes(e.outcome)).length;
  const needsReviewCount = events.filter((e) => ["correction", "scope_mismatch", "freshness", "risk"].includes(e.outcome)).length;
  const unknownCount = events.filter((e) => !["success", "neutral", "correction", "scope_mismatch", "freshness", "risk"].includes(e.outcome)).length;

  const byHealth = {
    healthy: healthyCount,
    needs_review: needsReviewCount,
    unknown: unknownCount,
  };

  const recentLimit = typeof limit === "number" && limit > 0 ? limit : 20;
  const recentEvents = events.slice(-recentLimit).reverse();

  return {
    total_invocations: total,
    average_duration_ms: avgDuration,
    success_rate: successRate,
    by_mode: byMode,
    by_provider: byProvider,
    by_health: byHealth,
    recent_events: recentEvents,
  };
}

module.exports = {
  VALID_INVOCATION_MODES,
  VALID_OUTCOMES,
  VALID_EVIDENCE_TYPES,
  VALID_PROVIDERS,
  validateTelemetryEventPayload,
  normalizeValidatedEvent,
  resolveTelemetryPath,
  appendTelemetryEvent,
  readTelemetryEvents,
  recordTelemetry,
  getTelemetrySummary,
};
