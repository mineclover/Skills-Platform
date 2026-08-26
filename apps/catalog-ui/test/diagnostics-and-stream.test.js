import test from "node:test";
import assert from "node:assert/strict";
import { ReadableStream } from "node:stream/web";

// ============================================================================
// Core Logic & Stepper Mapping Functions (Mirrored for Unit Testing)
// ============================================================================

const DIAGNOSTIC_STEPS = [
  { id: "plan", label: "Plan", stageBasePercent: 0, stageMaxPercent: 20 },
  { id: "inspect", label: "Inspect", stageBasePercent: 20, stageMaxPercent: 40 },
  { id: "preview", label: "Preview", stageBasePercent: 40, stageMaxPercent: 60 },
  { id: "materialize", label: "Materialize", stageBasePercent: 60, stageMaxPercent: 85 },
  { id: "verify", label: "Verify", stageBasePercent: 85, stageMaxPercent: 100 },
];

function mapStageToDiagnosticStep(rawStage) {
  if (!rawStage) return "plan";
  const stage = String(rawStage).trim().toLowerCase().replaceAll("-", "_");

  if (stage === "record" || stage === "plan" || stage === "planning" || stage === "init") {
    return "plan";
  }
  if (
    stage === "inspect" ||
    stage === "inspection" ||
    stage === "preflight" ||
    stage === "check"
  ) {
    return "inspect";
  }
  if (
    stage === "preview" ||
    stage === "previewing" ||
    stage === "resolve" ||
    stage === "resolving" ||
    stage === "validation"
  ) {
    return "preview";
  }
  if (
    stage === "apply" ||
    stage === "applying" ||
    stage === "materialize" ||
    stage === "materializing" ||
    stage === "link" ||
    stage === "linking"
  ) {
    return "materialize";
  }
  if (
    stage === "verify" ||
    stage === "verifying" ||
    stage === "verification" ||
    stage === "postflight" ||
    stage === "completed" ||
    stage === "finished" ||
    stage === "done"
  ) {
    return "verify";
  }

  return "plan";
}

function getDiagnosticStepIndex(stage) {
  switch (stage) {
    case "plan":
      return 0;
    case "inspect":
      return 1;
    case "preview":
      return 2;
    case "materialize":
      return 3;
    case "verify":
      return 4;
    default:
      return 0;
  }
}

function getStepNodeState(stepIndex, currentStage, isFailed = false, isCompleted = false) {
  if (isCompleted) {
    return "completed";
  }

  const activeStage = mapStageToDiagnosticStep(currentStage);
  const activeIndex = getDiagnosticStepIndex(activeStage);

  if (isFailed) {
    if (stepIndex < activeIndex) return "completed";
    if (stepIndex === activeIndex) return "failed";
    return "pending";
  }

  if (stepIndex < activeIndex) return "completed";
  if (stepIndex === activeIndex) return "active";
  return "pending";
}

function calculateStageProgressPercent(progress, isCompleted = false, isFailed = false) {
  if (isCompleted) return 100;
  if (!progress) return 0;

  const rawStage = progress.stage ? String(progress.stage).toLowerCase() : "";
  if (rawStage === "completed" || rawStage === "done") return 100;

  const diagStage = mapStageToDiagnosticStep(rawStage);
  const stepInfo = DIAGNOSTIC_STEPS.find((s) => s.id === diagStage) || DIAGNOSTIC_STEPS[0];

  const base = stepInfo.stageBasePercent;
  const range = stepInfo.stageMaxPercent - stepInfo.stageBasePercent;

  let intraRatio = 0;
  if (progress.total && progress.total > 0) {
    intraRatio = Math.min(1, Math.max(0, progress.completed / progress.total));
  } else if (progress.completed > 0) {
    intraRatio = 0.5;
  }

  if (isFailed) {
    return Math.min(100, Math.round(base + range * intraRatio));
  }

  return Math.min(98, Math.round(base + range * intraRatio));
}

function formatStageMetric(stage, completed, total, message) {
  const diagStage = mapStageToDiagnosticStep(stage);
  const stepInfo = DIAGNOSTIC_STEPS.find((s) => s.id === diagStage) || DIAGNOSTIC_STEPS[0];

  if (total > 0) {
    const unit =
      diagStage === "materialize"
        ? "symlinks"
        : diagStage === "inspect"
        ? "bindings"
        : diagStage === "preview"
        ? "operations"
        : diagStage === "verify"
        ? "invariants"
        : "steps";

    const percent = Math.round((completed / total) * 100);
    return `${stepInfo.label}: ${completed} of ${total} ${unit} processed (${percent}%)`;
  }

  if (message && String(message).trim()) {
    return `${stepInfo.label}: ${message}`;
  }

  return `${stepInfo.label}: Executing stage diagnostics...`;
}

// ============================================================================
// NDJSON Stream Reader (Async Stream Processor)
// ============================================================================

async function readApplyStream(response, onProgress) {
  if (!response.ok || !response.body) {
    throw new Error("Skills Manager progress stream was unavailable");
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result = null;

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) continue;
      const event = JSON.parse(line);
      if (event.type === "progress" && event.progress) onProgress(event.progress);
      if (event.type === "result" && event.result) result = event.result;
      if (event.type === "error") throw new Error(event.error ?? "Skills Manager apply failed");
    }
    if (done) break;
  }

  if (!result) throw new Error("Skills Manager did not return an apply result");
  return result;
}

// ============================================================================
// Drift Detection & Binding Filtering Functions
// ============================================================================

function calculateDriftSummary(comparison, status) {
  const providerId = comparison?.provider_id || status?.inventory?.providers?.[0]?.provider_id || "antigravity";

  if (comparison) {
    if (!comparison.in_sync) {
      const summary = comparison.summary || {};
      const driftBreakdown = {};
      let totalDrift = 0;
      let matchedCount = summary.matched ?? 0;

      for (const [key, count] of Object.entries(summary)) {
        if (key !== "matched" && typeof count === "number" && count > 0) {
          driftBreakdown[key] = count;
          totalDrift += count;
        }
      }

      const driftDetails = Object.entries(driftBreakdown)
        .map(([k, count]) => `${count} ${k.replaceAll("_", " ")}`)
        .join(", ");

      return {
        hasDrift: true,
        totalDriftCount: totalDrift,
        driftBreakdown,
        matchedCount,
        providerId,
        message: driftDetails ? `Observed drift: ${driftDetails}` : "Observed filesystem drift from pinned plan.",
      };
    }

    return {
      hasDrift: false,
      totalDriftCount: 0,
      driftBreakdown: {},
      matchedCount: comparison.summary?.matched ?? 0,
      providerId,
      message: `Filesystem bindings match pinned activation plan for provider ${providerId}.`,
    };
  }

  if (status?.summary) {
    const s = status.summary;
    const attention = (s.missing ?? 0) + (s.conflict ?? 0) + (s.unavailable ?? 0);
    if (attention > 0) {
      const driftBreakdown = {};
      if (s.missing) driftBreakdown.missing = s.missing;
      if (s.conflict) driftBreakdown.conflict = s.conflict;
      if (s.unavailable) driftBreakdown.unavailable = s.unavailable;

      return {
        hasDrift: true,
        totalDriftCount: attention,
        driftBreakdown,
        matchedCount: s.enabled ?? 0,
        providerId,
        message: `${attention} bindings require attention (${s.missing || 0} missing, ${
          s.conflict || 0
        } conflict, ${s.unavailable || 0} unavailable).`,
      };
    }
  }

  return {
    hasDrift: false,
    totalDriftCount: 0,
    driftBreakdown: {},
    matchedCount: status?.summary?.enabled ?? 0,
    providerId,
    message: "No drift detected. Upstream manager is ready.",
  };
}

function filterBindings(bindings = [], statusFilter = "all", searchQuery = "") {
  const needle = searchQuery.trim().toLowerCase();

  return bindings.filter((binding) => {
    const state = (binding.state || "").toLowerCase();
    if (statusFilter === "enabled" && state !== "enabled") return false;
    if (statusFilter === "disabled" && state !== "disabled") return false;
    if (statusFilter === "missing" && state !== "missing") return false;
    if (statusFilter === "conflict" && state !== "conflict") return false;
    if (statusFilter === "unavailable" && state !== "unavailable") return false;
    if (
      statusFilter === "attention" &&
      state !== "missing" &&
      state !== "conflict" &&
      state !== "unavailable" &&
      state !== "drift"
    ) {
      return false;
    }

    if (!needle) return true;

    const skillId = (binding.skill_instance_id || "").toLowerCase();
    const providerId = (binding.provider_id || "").toLowerCase();
    const scope = (binding.scope || "").toLowerCase();
    const targetPath = (binding.target_path || "").toLowerCase();

    return (
      skillId.includes(needle) ||
      providerId.includes(needle) ||
      scope.includes(needle) ||
      targetPath.includes(needle) ||
      state.includes(needle)
    );
  });
}

function getBindingStateBadgeClass(state) {
  const s = (state || "").toLowerCase();
  switch (s) {
    case "enabled":
      return "binding-state enabled";
    case "disabled":
      return "binding-state disabled";
    case "missing":
      return "binding-state missing problem";
    case "conflict":
      return "binding-state conflict problem";
    case "unavailable":
      return "binding-state unavailable problem";
    case "drift":
      return "binding-state drift warning";
    default:
      return "binding-state";
  }
}

// ============================================================================
// TEST SUITE 1: 5-Stage Visual Stepper & Progress Calculations
// ============================================================================

test("Stepper Diagnostics: Stage normalization maps all stage variants to 5 canonical stages", () => {
  // 1. Plan Stage
  assert.equal(mapStageToDiagnosticStep("record"), "plan");
  assert.equal(mapStageToDiagnosticStep("plan"), "plan");
  assert.equal(mapStageToDiagnosticStep("planning"), "plan");
  assert.equal(mapStageToDiagnosticStep("init"), "plan");

  // 2. Inspect Stage
  assert.equal(mapStageToDiagnosticStep("inspect"), "inspect");
  assert.equal(mapStageToDiagnosticStep("inspection"), "inspect");
  assert.equal(mapStageToDiagnosticStep("preflight"), "inspect");
  assert.equal(mapStageToDiagnosticStep("check"), "inspect");

  // 3. Preview Stage
  assert.equal(mapStageToDiagnosticStep("preview"), "preview");
  assert.equal(mapStageToDiagnosticStep("previewing"), "preview");
  assert.equal(mapStageToDiagnosticStep("resolve"), "preview");
  assert.equal(mapStageToDiagnosticStep("validation"), "preview");

  // 4. Materialize Stage
  assert.equal(mapStageToDiagnosticStep("materialize"), "materialize");
  assert.equal(mapStageToDiagnosticStep("materializing"), "materialize");
  assert.equal(mapStageToDiagnosticStep("apply"), "materialize");
  assert.equal(mapStageToDiagnosticStep("link"), "materialize");

  // 5. Verify Stage
  assert.equal(mapStageToDiagnosticStep("verify"), "verify");
  assert.equal(mapStageToDiagnosticStep("verifying"), "verify");
  assert.equal(mapStageToDiagnosticStep("verification"), "verify");
  assert.equal(mapStageToDiagnosticStep("completed"), "verify");
  assert.equal(mapStageToDiagnosticStep("done"), "verify");

  // Fallbacks
  assert.equal(mapStageToDiagnosticStep(null), "plan");
  assert.equal(mapStageToDiagnosticStep(undefined), "plan");
  assert.equal(mapStageToDiagnosticStep(""), "plan");
  assert.equal(mapStageToDiagnosticStep("unknown_custom_step"), "plan");
});

test("Stepper Diagnostics: Step node state transitions correctly across stages", () => {
  // When at 'inspect' (step index 1): step 0 is completed, step 1 is active, steps 2-4 pending
  assert.equal(getStepNodeState(0, "inspect"), "completed");
  assert.equal(getStepNodeState(1, "inspect"), "active");
  assert.equal(getStepNodeState(2, "inspect"), "pending");
  assert.equal(getStepNodeState(3, "inspect"), "pending");
  assert.equal(getStepNodeState(4, "inspect"), "pending");

  // When at 'materialize' (step index 3): steps 0, 1, 2 are completed, step 3 is active, step 4 pending
  assert.equal(getStepNodeState(0, "materialize"), "completed");
  assert.equal(getStepNodeState(1, "materialize"), "completed");
  assert.equal(getStepNodeState(2, "materialize"), "completed");
  assert.equal(getStepNodeState(3, "materialize"), "active");
  assert.equal(getStepNodeState(4, "materialize"), "pending");

  // When completed is true: all 5 steps are completed
  for (let i = 0; i < 5; i++) {
    assert.equal(getStepNodeState(i, "materialize", false, true), "completed");
  }

  // When failed at 'materialize': steps 0, 1, 2 are completed, step 3 is failed, step 4 is pending
  assert.equal(getStepNodeState(0, "materialize", true, false), "completed");
  assert.equal(getStepNodeState(1, "materialize", true, false), "completed");
  assert.equal(getStepNodeState(2, "materialize", true, false), "completed");
  assert.equal(getStepNodeState(3, "materialize", true, false), "failed");
  assert.equal(getStepNodeState(4, "materialize", true, false), "pending");
});

test("Stepper Diagnostics: Stage progress percentage smoothly scales within stage boundaries", () => {
  // Plan Stage: 0% to 20%
  const planProg = { stage: "plan", completed: 1, total: 2, message: "Recording plan" };
  const planPercent = calculateStageProgressPercent(planProg);
  assert.ok(planPercent >= 0 && planPercent <= 20, `Expected 0-20, got ${planPercent}`);
  assert.equal(planPercent, 10);

  // Inspect Stage: 20% to 40%
  const inspectProg = { stage: "inspect", completed: 2, total: 4, message: "Preflight" };
  const inspectPercent = calculateStageProgressPercent(inspectProg);
  assert.ok(inspectPercent >= 20 && inspectPercent <= 40, `Expected 20-40, got ${inspectPercent}`);
  assert.equal(inspectPercent, 30);

  // Materialize Stage: 60% to 85%
  const matProg = { stage: "materialize", completed: 8, total: 10, message: "Linking symlinks" };
  const matPercent = calculateStageProgressPercent(matProg);
  assert.ok(matPercent >= 60 && matPercent <= 85, `Expected 60-85, got ${matPercent}`);
  assert.equal(matPercent, 80); // 60 + 25 * 0.8 = 80

  // Completed State
  assert.equal(calculateStageProgressPercent(null, true), 100);
  assert.equal(calculateStageProgressPercent({ stage: "completed", completed: 10, total: 10 }), 100);

  // Missing or zero totals handled without NaN
  assert.equal(calculateStageProgressPercent({ stage: "inspect", completed: 0, total: 0 }), 20);
});

test("Stepper Diagnostics: Stage metric formatting generates clear, contextual messages", () => {
  // Materialize symlinks
  const matMetric = formatStageMetric("materialize", 8, 10);
  assert.equal(matMetric, "Materialize: 8 of 10 symlinks processed (80%)");

  // Inspect bindings
  const inspectMetric = formatStageMetric("inspect", 3, 4);
  assert.equal(inspectMetric, "Inspect: 3 of 4 bindings processed (75%)");

  // Preview operations
  const prevMetric = formatStageMetric("preview", 2, 2);
  assert.equal(prevMetric, "Preview: 2 of 2 operations processed (100%)");

  // Verify invariants
  const verifyMetric = formatStageMetric("verify", 5, 5);
  assert.equal(verifyMetric, "Verify: 5 of 5 invariants processed (100%)");

  // Fallback to custom message when total is 0
  const msgMetric = formatStageMetric("plan", 0, 0, "Resolving graph dependencies");
  assert.equal(msgMetric, "Plan: Resolving graph dependencies");
});

// ============================================================================
// TEST SUITE 2: NDJSON Live Stream Reader Parsing & Event Handling
// ============================================================================

test("Stream Reader: Consumes NDJSON chunks and dispatches progress and result events", async () => {
  const events = [
    JSON.stringify({
      type: "progress",
      progress: { stage: "inspect", completed: 1, total: 4, message: "Inspecting Codex" },
    }),
    JSON.stringify({
      type: "progress",
      progress: { stage: "materialize", completed: 3, total: 4, message: "Creating symlink" },
    }),
    JSON.stringify({
      type: "result",
      result: {
        status: "succeeded",
        report: { summary: { applied: 4, skipped: 0, failed: 0 } },
      },
    }),
  ];

  const streamBody = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      // Split stream into multi-line chunk
      controller.enqueue(encoder.encode(`${events[0]}\n${events[1]}\n`));
      controller.enqueue(encoder.encode(`${events[2]}\n`));
      controller.close();
    },
  });

  const mockResponse = {
    ok: true,
    body: streamBody,
  };

  const receivedProgress = [];
  const result = await readApplyStream(mockResponse, (p) => receivedProgress.push(p));

  assert.equal(receivedProgress.length, 2);
  assert.equal(receivedProgress[0].stage, "inspect");
  assert.equal(receivedProgress[1].stage, "materialize");
  assert.equal(receivedProgress[1].completed, 3);
  assert.equal(result.status, "succeeded");
  assert.equal(result.report.summary.applied, 4);
});

test("Stream Reader: Handles chunk fragmentation where JSON events span across chunk boundaries", async () => {
  const event1 = JSON.stringify({
    type: "progress",
    progress: { stage: "materialize", completed: 1, total: 2, message: "Linking partial chunk" },
  });
  const event2 = JSON.stringify({
    type: "result",
    result: {
      status: "applied",
      report: { summary: { applied: 2, skipped: 1, failed: 0 } },
    },
  });

  const fullText = `${event1}\n${event2}\n`;
  // Split awkwardly right in the middle of event1
  const splitIndex = 35;
  const chunk1 = fullText.slice(0, splitIndex);
  const chunk2 = fullText.slice(splitIndex);

  const streamBody = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      controller.enqueue(encoder.encode(chunk1));
      controller.enqueue(encoder.encode(chunk2));
      controller.close();
    },
  });

  const mockResponse = { ok: true, body: streamBody };
  const receivedProgress = [];
  const result = await readApplyStream(mockResponse, (p) => receivedProgress.push(p));

  assert.equal(receivedProgress.length, 1);
  assert.equal(receivedProgress[0].message, "Linking partial chunk");
  assert.equal(result.status, "applied");
  assert.equal(result.report.summary.applied, 2);
});

test("Stream Reader: Throws error on server error event or non-ok response", async () => {
  // Case 1: Error event inside stream
  const errorStream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      controller.enqueue(
        encoder.encode(JSON.stringify({ type: "error", error: "Symlink creation permission denied" }) + "\n"),
      );
      controller.close();
    },
  });

  await assert.rejects(
    () => readApplyStream({ ok: true, body: errorStream }, () => {}),
    /Symlink creation permission denied/,
  );

  // Case 2: Non-ok response
  await assert.rejects(
    () => readApplyStream({ ok: false, body: null }, () => {}),
    /Skills Manager progress stream was unavailable/,
  );
});

// ============================================================================
// TEST SUITE 3: Drift Detection & Binding Diagnostic Inspector
// ============================================================================

test("Drift Diagnostics: In-sync comparison returns hasDrift false and zero drift count", () => {
  const comparison = {
    in_sync: true,
    provider_id: "antigravity",
    summary: { matched: 5 },
    captured_at: new Date().toISOString(),
  };

  const driftSummary = calculateDriftSummary(comparison, null);
  assert.equal(driftSummary.hasDrift, false);
  assert.equal(driftSummary.totalDriftCount, 0);
  assert.equal(driftSummary.matchedCount, 5);
  assert.equal(driftSummary.providerId, "antigravity");
  assert.ok(driftSummary.message.includes("match pinned activation plan"));
});

test("Drift Diagnostics: Out-of-sync comparison calculates drift counts and reasons", () => {
  const comparison = {
    in_sync: false,
    provider_id: "antigravity",
    summary: {
      matched: 3,
      missing: 2,
      conflict: 1,
      disabled: 1,
    },
    captured_at: new Date().toISOString(),
  };

  const driftSummary = calculateDriftSummary(comparison, null);
  assert.equal(driftSummary.hasDrift, true);
  assert.equal(driftSummary.totalDriftCount, 4); // 2 missing + 1 conflict + 1 disabled
  assert.deepEqual(driftSummary.driftBreakdown, {
    missing: 2,
    conflict: 1,
    disabled: 1,
  });
  assert.ok(driftSummary.message.includes("2 missing"));
  assert.ok(driftSummary.message.includes("1 conflict"));
});

test("Drift Diagnostics: Fallback to status attention counts when comparison is null", () => {
  const status = {
    summary: {
      total: 6,
      enabled: 3,
      disabled: 1,
      missing: 1,
      conflict: 1,
      unavailable: 0,
    },
    inventory: { providers: [{ provider_id: "codex", detected: true }] },
  };

  const driftSummary = calculateDriftSummary(null, status);
  assert.equal(driftSummary.hasDrift, true);
  assert.equal(driftSummary.totalDriftCount, 2);
  assert.equal(driftSummary.driftBreakdown.missing, 1);
  assert.equal(driftSummary.driftBreakdown.conflict, 1);
  assert.equal(driftSummary.providerId, "codex");
});

// ============================================================================
// TEST SUITE 4: Binding Search & Status Chip Filtering
// ============================================================================

test("Binding Inspector: Status chip filtering filters bindings accurately", () => {
  const sampleBindings = [
    { skill_instance_id: "planning", provider_id: "antigravity", scope: "project", state: "enabled" },
    { skill_instance_id: "testing", provider_id: "antigravity", scope: "project", state: "disabled" },
    { skill_instance_id: "code-review", provider_id: "antigravity", scope: "project", state: "missing" },
    { skill_instance_id: "debugging", provider_id: "codex", scope: "global", state: "conflict" },
    { skill_instance_id: "linting", provider_id: "claude", scope: "project", state: "unavailable" },
  ];

  // All
  assert.equal(filterBindings(sampleBindings, "all").length, 5);

  // Enabled only
  const enabled = filterBindings(sampleBindings, "enabled");
  assert.equal(enabled.length, 1);
  assert.equal(enabled[0].skill_instance_id, "planning");

  // Disabled only
  const disabled = filterBindings(sampleBindings, "disabled");
  assert.equal(disabled.length, 1);
  assert.equal(disabled[0].skill_instance_id, "testing");

  // Missing only
  const missing = filterBindings(sampleBindings, "missing");
  assert.equal(missing.length, 1);
  assert.equal(missing[0].skill_instance_id, "code-review");

  // Attention (missing + conflict + unavailable)
  const attention = filterBindings(sampleBindings, "attention");
  assert.equal(attention.length, 3);
  const attentionIds = attention.map((b) => b.skill_instance_id).sort();
  assert.deepEqual(attentionIds, ["code-review", "debugging", "linting"]);
});

test("Binding Inspector: Search query filters across skill names, providers, scopes, and target paths", () => {
  const sampleBindings = [
    {
      skill_instance_id: "planning",
      provider_id: "antigravity",
      scope: "project",
      state: "enabled",
      target_path: ".agents/skills/planning",
    },
    {
      skill_instance_id: "testing",
      provider_id: "codex",
      scope: "global",
      state: "enabled",
      target_path: "skills/testing",
    },
    {
      skill_instance_id: "deploy-k8s",
      provider_id: "claude",
      scope: "project",
      state: "missing",
      target_path: ".claude/skills/deploy-k8s",
    },
  ];

  // Search by skill name
  assert.equal(filterBindings(sampleBindings, "all", "planning").length, 1);

  // Search by provider
  assert.equal(filterBindings(sampleBindings, "all", "codex").length, 1);

  // Search by scope
  assert.equal(filterBindings(sampleBindings, "all", "global").length, 1);

  // Search by delivery path substring
  assert.equal(filterBindings(sampleBindings, "all", ".claude").length, 1);

  // Combined status chip + search query
  assert.equal(filterBindings(sampleBindings, "enabled", "claude").length, 0);
  assert.equal(filterBindings(sampleBindings, "missing", "deploy").length, 1);
});

test("Binding Inspector: Binding badge classes map correctly to CSS state classes", () => {
  assert.equal(getBindingStateBadgeClass("enabled"), "binding-state enabled");
  assert.equal(getBindingStateBadgeClass("disabled"), "binding-state disabled");
  assert.equal(getBindingStateBadgeClass("missing"), "binding-state missing problem");
  assert.equal(getBindingStateBadgeClass("conflict"), "binding-state conflict problem");
  assert.equal(getBindingStateBadgeClass("unavailable"), "binding-state unavailable problem");
  assert.equal(getBindingStateBadgeClass("drift"), "binding-state drift warning");
  assert.equal(getBindingStateBadgeClass("unknown"), "binding-state");
});
