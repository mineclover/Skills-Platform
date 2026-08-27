import test from "node:test";
import assert from "node:assert/strict";

// ============================================================================
// 1. Invocation Mode Ratios & Breakdown Calculations
// ============================================================================

function calculateInvocationModeRatios(
  byMode = { model_invoked: 0, user_invoked: 0, hybrid: 0, unspecified: 0 },
) {
  const total =
    (byMode.model_invoked || 0) +
    (byMode.user_invoked || 0) +
    (byMode.hybrid || 0) +
    (byMode.unspecified || 0);
  const modes = ["model_invoked", "user_invoked", "hybrid", "unspecified"];
  if (total === 0) {
    return modes.map((mode) => ({ mode, count: 0, percentage: 0 }));
  }
  return modes.map((mode) => {
    const count = byMode[mode] || 0;
    const percentage = Math.round((count / total) * 1000) / 10;
    return { mode, count, percentage };
  });
}

function formatDuration(durationMs) {
  if (durationMs < 0 || !Number.isFinite(durationMs)) return "0ms";
  if (durationMs < 1) return "< 1ms";
  if (durationMs < 1000) return `${Math.round(durationMs)}ms`;
  const seconds = durationMs / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const remSeconds = Math.round(seconds % 60);
  return `${minutes}m ${remSeconds}s`;
}

function formatTimeAgo(timestamp, now = Date.now()) {
  const diff = now - new Date(timestamp).getTime();
  if (Number.isNaN(diff) || diff < 0) return "just now";
  const seconds = Math.floor(diff / 1000);
  if (seconds < 30) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function getBindingTelemetry(skillId, providerId, events = []) {
  const cleanId = (skillId || "").trim().toLowerCase();
  const cleanProv = (providerId || "").trim().toLowerCase();

  const matching = events.filter((e) => {
    const evSkill = (e.skill_name || "").toLowerCase();
    const evLineage = (e.lineage_id || "").toLowerCase();
    const evProv = (e.provider_id || "").toLowerCase();

    const matchesSkill = evSkill === cleanId || evLineage === cleanId || cleanId.includes(evSkill);
    const matchesProv = !cleanProv || evProv === cleanProv;
    return matchesSkill && matchesProv;
  });

  const totalRuns = matching.length;
  const latest = matching[0] || null;
  const avgDuration =
    totalRuns > 0
      ? Math.round(matching.reduce((acc, m) => acc + (m.duration_ms || 0), 0) / totalRuns)
      : 0;

  return {
    totalRuns,
    lastInvokedAt: latest?.timestamp || null,
    latestOutcome: latest?.outcome || null,
    latestInvocationMode: latest?.invocation_mode || null,
    avgDuration,
    hasActivity: totalRuns > 0,
  };
}

function createMockTelemetrySummary(params) {
  const now = Date.now();
  const rawEvents = [
    {
      id: "ev_101",
      timestamp: new Date(now - 1000 * 18).toISOString(),
      provider_id: "antigravity",
      project_id: params?.projectId || "skills-platform",
      recipe_id: "scoped-inner-loop-recipe",
      skill_name: "planning",
      lineage_id: "lineage_planning",
      invocation_mode: "model_invoked",
      duration_ms: 38,
      tool_calls_count: 3,
      outcome: "success",
      evidence_type: "activation_report",
      summary: "Autonomous reflex plan decomposition executed within threshold.",
      details: "Step plan synthesized in 38ms with 3 tool calls.",
      metrics: { duration_ms: 38, tool_calls_count: 3 },
    },
    {
      id: "ev_102",
      timestamp: new Date(now - 1000 * 62).toISOString(),
      provider_id: "codex",
      project_id: params?.projectId || "skills-platform",
      recipe_id: "scoped-inner-loop-recipe",
      skill_name: "testing",
      lineage_id: "lineage_testing",
      invocation_mode: "user_invoked",
      duration_ms: 184,
      tool_calls_count: 2,
      outcome: "success",
      evidence_type: "manual",
      summary: "Pinpoint test runner invoked directly by human operator.",
      details: "Ran scoped node:test with 0 regressions.",
      metrics: { duration_ms: 184, tool_calls_count: 2 },
    },
    {
      id: "ev_103",
      timestamp: new Date(now - 1000 * 135).toISOString(),
      provider_id: "claude",
      project_id: params?.projectId || "skills-platform",
      recipe_id: "release-governance-recipe",
      skill_name: "code-review",
      lineage_id: "lineage_code_review",
      invocation_mode: "hybrid",
      duration_ms: 76,
      tool_calls_count: 4,
      outcome: "correction",
      evidence_type: "evaluation",
      summary: "Rule policy drift corrected during static invariant check.",
      details: "Auto-reconciled symlink binding paths.",
      metrics: { duration_ms: 76, tool_calls_count: 4 },
    },
    {
      id: "ev_104",
      timestamp: new Date(now - 1000 * 220).toISOString(),
      provider_id: "antigravity",
      project_id: params?.projectId || "skills-platform",
      recipe_id: "task-planning-recipe",
      skill_name: "planning",
      lineage_id: "lineage_planning",
      invocation_mode: "model_invoked",
      duration_ms: 42,
      tool_calls_count: 2,
      outcome: "success",
      evidence_type: "activation_report",
      summary: "PRD task breakdown completed cleanly.",
      details: "Generated 3 atomic task queue items.",
      metrics: { duration_ms: 42, tool_calls_count: 2 },
    },
    {
      id: "ev_105",
      timestamp: new Date(now - 1000 * 310).toISOString(),
      provider_id: "codex",
      project_id: params?.projectId || "skills-platform",
      recipe_id: "scoped-inner-loop-recipe",
      skill_name: "UI Design",
      lineage_id: "lineage_ui",
      invocation_mode: "user_invoked",
      duration_ms: 215,
      tool_calls_count: 1,
      outcome: "risk",
      evidence_type: "incident",
      summary: "Latency spike and unexpected binding collision detected.",
      details: "High duration 215ms on target render pass.",
      metrics: { duration_ms: 215, tool_calls_count: 1 },
    },
    {
      id: "ev_106",
      timestamp: new Date(now - 1000 * 430).toISOString(),
      provider_id: "antigravity",
      project_id: params?.projectId || "skills-platform",
      recipe_id: "scoped-inner-loop-recipe",
      skill_name: "testing",
      lineage_id: "lineage_testing",
      invocation_mode: "model_invoked",
      duration_ms: 29,
      tool_calls_count: 2,
      outcome: "success",
      evidence_type: "evaluation",
      summary: "Reflex invariant assertions verified before build step.",
      details: "Passed fast assertion checks.",
      metrics: { duration_ms: 29, tool_calls_count: 2 },
    },
    {
      id: "ev_107",
      timestamp: new Date(now - 1000 * 590).toISOString(),
      provider_id: "claude",
      project_id: params?.projectId || "skills-platform",
      recipe_id: "task-planning-recipe",
      skill_name: "planning",
      lineage_id: "lineage_planning",
      invocation_mode: "hybrid",
      duration_ms: 54,
      tool_calls_count: 1,
      outcome: "neutral",
      evidence_type: "manual",
      summary: "Read-only inspection of project effective skill set.",
      details: "No mutations made.",
      metrics: { duration_ms: 54, tool_calls_count: 1 },
    },
  ];

  let filtered = rawEvents;
  if (params?.projectId) {
    filtered = filtered.filter((e) => e.project_id === params.projectId);
  }
  if (params?.providerId && params.providerId !== "all") {
    filtered = filtered.filter(
      (e) => e.provider_id.toLowerCase() === params.providerId?.toLowerCase(),
    );
  }
  if (params?.skillName) {
    filtered = filtered.filter(
      (e) => e.skill_name.toLowerCase() === params.skillName?.toLowerCase(),
    );
  }
  if (params?.since) {
    const sinceDate = new Date(params.since);
    filtered = filtered.filter((e) => new Date(e.timestamp) >= sinceDate);
  }

  const limit = params?.limit && params.limit > 0 ? params.limit : 20;
  const recentEvents = filtered.slice(0, limit);

  const total = filtered.length;
  const totalDuration = filtered.reduce((acc, e) => acc + (e.duration_ms || 0), 0);
  const avgDuration = total > 0 ? Math.round((totalDuration / total) * 10) / 10 : 0;
  const successCount = filtered.filter((e) => e.outcome === "success").length;
  const successRate = total > 0 ? Math.round((successCount / total) * 100) / 100 : 1.0;

  const byMode = {
    model_invoked: filtered.filter((e) => e.invocation_mode === "model_invoked").length,
    user_invoked: filtered.filter((e) => e.invocation_mode === "user_invoked").length,
    hybrid: filtered.filter((e) => e.invocation_mode === "hybrid").length,
    unspecified: filtered.filter((e) => e.invocation_mode === "unspecified").length,
  };

  const byProvider = {};
  for (const e of filtered) {
    byProvider[e.provider_id] = (byProvider[e.provider_id] || 0) + 1;
  }

  const healthyCount = filtered.filter(
    (e) => e.outcome === "success" || e.outcome === "neutral",
  ).length;
  const needsReviewCount = filtered.filter((e) =>
    ["correction", "scope_mismatch", "freshness", "risk"].includes(e.outcome),
  ).length;
  const unknownCount = total - healthyCount - needsReviewCount;

  const ratios = calculateInvocationModeRatios(byMode);

  return {
    total_invocations: total,
    average_duration_ms: avgDuration,
    success_rate: successRate,
    by_mode: byMode,
    by_provider: byProvider,
    by_health: {
      healthy: healthyCount,
      needs_review: needsReviewCount,
      unknown: Math.max(0, unknownCount),
    },
    recent_events: recentEvents,
    invocation_mode_ratios: ratios,
    last_event_at: recentEvents[0]?.timestamp || new Date().toISOString(),
  };
}

// ============================================================================
// Test Suites
// ============================================================================

test("Telemetry Ratios: 0 invocations returns 0% for all modes without NaN", () => {
  const ratios = calculateInvocationModeRatios({
    model_invoked: 0,
    user_invoked: 0,
    hybrid: 0,
    unspecified: 0,
  });

  assert.equal(ratios.length, 4);
  for (const r of ratios) {
    assert.equal(r.count, 0);
    assert.equal(r.percentage, 0);
    assert.ok(!Number.isNaN(r.percentage));
  }
});

test("Telemetry Ratios: Single-mode 100% distribution", () => {
  const ratios = calculateInvocationModeRatios({
    model_invoked: 42,
    user_invoked: 0,
    hybrid: 0,
    unspecified: 0,
  });

  const modelRatio = ratios.find((r) => r.mode === "model_invoked");
  const userRatio = ratios.find((r) => r.mode === "user_invoked");

  assert.ok(modelRatio);
  assert.equal(modelRatio.count, 42);
  assert.equal(modelRatio.percentage, 100);

  assert.ok(userRatio);
  assert.equal(userRatio.count, 0);
  assert.equal(userRatio.percentage, 0);
});

test("Telemetry Ratios: Multi-mode proportional breakdown calculates accurately", () => {
  const ratios = calculateInvocationModeRatios({
    model_invoked: 50,
    user_invoked: 30,
    hybrid: 20,
    unspecified: 0,
  });

  const modelRatio = ratios.find((r) => r.mode === "model_invoked");
  const userRatio = ratios.find((r) => r.mode === "user_invoked");
  const hybridRatio = ratios.find((r) => r.mode === "hybrid");
  const unspecifiedRatio = ratios.find((r) => r.mode === "unspecified");

  assert.equal(modelRatio.count, 50);
  assert.equal(modelRatio.percentage, 50);

  assert.equal(userRatio.count, 30);
  assert.equal(userRatio.percentage, 30);

  assert.equal(hybridRatio.count, 20);
  assert.equal(hybridRatio.percentage, 20);

  assert.equal(unspecifiedRatio.count, 0);
  assert.equal(unspecifiedRatio.percentage, 0);

  const totalPercentage = ratios.reduce((sum, r) => sum + r.percentage, 0);
  assert.equal(totalPercentage, 100);
});

test("Telemetry Duration Formatting: Handles < 1ms, ms, seconds, minutes, and invalid guards", () => {
  assert.equal(formatDuration(0.4), "< 1ms");
  assert.equal(formatDuration(38), "38ms");
  assert.equal(formatDuration(999), "999ms");
  assert.equal(formatDuration(1500), "1.5s");
  assert.equal(formatDuration(42800), "42.8s");
  assert.equal(formatDuration(135000), "2m 15s");
  assert.equal(formatDuration(-10), "0ms");
  assert.equal(formatDuration(NaN), "0ms");
  assert.equal(formatDuration(Infinity), "0ms");
});

test("Telemetry TimeAgo: Returns human-readable relative time strings", () => {
  const now = 1700000000000;
  assert.equal(formatTimeAgo(new Date(now - 1000 * 5).toISOString(), now), "just now");
  assert.equal(formatTimeAgo(new Date(now - 1000 * 45).toISOString(), now), "45s ago");
  assert.equal(formatTimeAgo(new Date(now - 1000 * 180).toISOString(), now), "3m ago");
  assert.equal(formatTimeAgo(new Date(now - 1000 * 7200).toISOString(), now), "2h ago");
  assert.equal(formatTimeAgo(new Date(now - 1000 * 172800).toISOString(), now), "2d ago");
});

test("Telemetry Fallback Summary: Generates compliant multi-agent summary dataset", () => {
  const summary = createMockTelemetrySummary();

  assert.equal(summary.total_invocations, 7);
  assert.ok(summary.average_duration_ms > 0);
  assert.ok(summary.success_rate > 0 && summary.success_rate <= 1);
  assert.equal(summary.recent_events.length, 7);

  // Check invocation modes distribution
  assert.equal(summary.by_mode.model_invoked, 3);
  assert.equal(summary.by_mode.user_invoked, 2);
  assert.equal(summary.by_mode.hybrid, 2);
  assert.equal(summary.by_mode.unspecified, 0);

  // Check providers
  assert.equal(summary.by_provider.antigravity, 3);
  assert.equal(summary.by_provider.codex, 2);
  assert.equal(summary.by_provider.claude, 2);

  // Check health breakdown
  assert.equal(summary.by_health.healthy, 5); // 4 success + 1 neutral
  assert.equal(summary.by_health.needs_review, 2); // 1 correction + 1 risk
  assert.equal(summary.by_health.unknown, 0);
});

test("Telemetry Fallback Query: Filtering by skill name isolates target telemetry", () => {
  const planningSummary = createMockTelemetrySummary({ skillName: "planning" });

  assert.equal(planningSummary.total_invocations, 3);
  for (const ev of planningSummary.recent_events) {
    assert.equal(ev.skill_name.toLowerCase(), "planning");
  }

  const testingSummary = createMockTelemetrySummary({ skillName: "testing" });
  assert.equal(testingSummary.total_invocations, 2);
  for (const ev of testingSummary.recent_events) {
    assert.equal(ev.skill_name.toLowerCase(), "testing");
  }
});

test("Telemetry Fallback Query: Filtering by provider isolates target agent platform", () => {
  const agySummary = createMockTelemetrySummary({ providerId: "antigravity" });
  assert.equal(agySummary.total_invocations, 3);
  for (const ev of agySummary.recent_events) {
    assert.equal(ev.provider_id, "antigravity");
  }

  const codexSummary = createMockTelemetrySummary({ providerId: "codex" });
  assert.equal(codexSummary.total_invocations, 2);
  for (const ev of codexSummary.recent_events) {
    assert.equal(ev.provider_id, "codex");
  }
});

test("LiveActivationDrawer Junction Telemetry: Accurately associates bindings with execution events", () => {
  const summary = createMockTelemetrySummary();

  const planningTelemetry = getBindingTelemetry("planning", "antigravity", summary.recent_events);
  assert.ok(planningTelemetry.hasActivity);
  assert.equal(planningTelemetry.totalRuns, 2);
  assert.equal(planningTelemetry.latestOutcome, "success");
  assert.equal(planningTelemetry.latestInvocationMode, "model_invoked");

  const idleTelemetry = getBindingTelemetry("unregistered-skill", "antigravity", summary.recent_events);
  assert.equal(idleTelemetry.hasActivity, false);
  assert.equal(idleTelemetry.totalRuns, 0);
  assert.equal(idleTelemetry.lastInvokedAt, null);
  assert.equal(idleTelemetry.latestOutcome, null);
});

test("ReviewQueue Risk Signals: Detects risks, corrections, and high latency anomalies", () => {
  const summary = createMockTelemetrySummary();
  const events = summary.recent_events;

  const riskEvents = events.filter((e) =>
    ["risk", "correction", "scope_mismatch", "freshness"].includes(e.outcome),
  );
  assert.equal(riskEvents.length, 2); // 1 correction (code-review) + 1 risk (UI Design)

  const latencySpikes = events.filter((e) => e.duration_ms > 150);
  assert.equal(latencySpikes.length, 2); // ev_102 (184ms) and ev_105 (215ms)

  const anomalies = events.filter(
    (e) => e.outcome === "risk" || e.outcome === "correction" || e.duration_ms > 150,
  );
  assert.ok(anomalies.length >= 3);
});
