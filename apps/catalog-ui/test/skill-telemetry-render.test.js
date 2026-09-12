import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

let vite;
let SkillWorkspace;

before(async () => {
  vite = await createServer({
    root: fileURLToPath(new URL("..", import.meta.url)),
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    appType: "custom",
  });
  ({ SkillWorkspace } = await vite.ssrLoadModule("/src/components/SkillWorkspace.tsx"));
});

after(async () => {
  await vite?.close();
});

function renderTelemetry(outcomes, { averageDuration = 38, recentEventLimit = 20 } = {}) {
  const total = outcomes.length;
  const successes = outcomes.filter((outcome) => outcome === "success").length;
  const skill = {
    lineage: { id: "lineage_testing", skill_name: "testing" },
    profile: { title: "testing", review_state: "unreviewed", tags: [], use_when: [] },
    latest_skill: null,
  };
  const html = renderToStaticMarkup(createElement(SkillWorkspace, {
    skills: [skill],
    selectedLineageId: skill.lineage.id,
    onSelect() {},
    onSave() {},
    onRecordFeedback() {},
    onAddNote() {},
    saving: false,
    feedback: [],
    feedbackSummary: null,
    notes: [],
    evaluationSummary: null,
    loadingEvidence: false,
    recordingFeedback: false,
    recordingNote: false,
    telemetrySummary: {
      total_invocations: total,
      average_duration_ms: total ? averageDuration : 0,
      // The current API uses 1 as the empty aggregate value. The UI must still
      // distinguish no observations from an observed 100% success rate.
      success_rate: total ? successes / total : 1,
      by_mode: { model_invoked: total, user_invoked: 0, hybrid: 0, unspecified: 0 },
      by_provider: total ? { codex: total } : {},
      by_health: { healthy: successes, needs_review: total - successes, unknown: 0 },
      recent_events: outcomes.slice(0, recentEventLimit).map((outcome, index) => ({
        id: `event_${index}`,
        timestamp: "2026-09-08T00:00:00Z",
        provider_id: "codex",
        skill_name: "testing",
        invocation_mode: "model_invoked",
        outcome,
        duration_ms: averageDuration,
        tool_calls_count: 1,
        summary: `Observed ${outcome}`,
      })),
    },
  }));
  const telemetry = html.match(/<section[^>]*aria-label="Real-time skill telemetry"[^>]*>([\s\S]*?)<\/section>/)?.[1];
  assert.ok(telemetry, "the selected skill must render its telemetry section");
  const metrics = Object.fromEntries([...telemetry.matchAll(
    /<span class="metric-box-label">([^<]+)<\/span><strong[^>]*>([^<]*)<\/strong>/g,
  )].map(([, label, value]) => [label, value]));
  return { telemetry, metrics };
}

test("zero invocations render missing rates and latency with zero active providers", () => {
  const { telemetry, metrics } = renderTelemetry([]);
  assert.deepEqual(metrics, {
    Invocations: "0",
    "Avg Latency": "—",
    "Success Rate": "—",
    "Active Providers": "0",
  });
  assert.match(telemetry, /No data for success rate or average latency/);
  assert.match(telemetry, /No live telemetry recorded/);
  assert.doesNotMatch(telemetry, /100% success rate|&lt; 1ms|&lt; 50ms invariant/);
});

for (const { outcomes, expected } of [
  { outcomes: ["success"], expected: "100%" },
  { outcomes: ["risk"], expected: "0%" },
  { outcomes: ["success", "risk", "success"], expected: "67%" },
]) {
  test(`observed outcomes ${outcomes.join(", ")} retain the ${expected} success rate`, () => {
    const { telemetry, metrics } = renderTelemetry(outcomes);
    assert.equal(metrics.Invocations, String(outcomes.length));
    assert.equal(metrics["Success Rate"], expected);
    assert.equal(metrics["Avg Latency"], "38ms");
    assert.equal(metrics["Active Providers"], "1");
    assert.ok(telemetry.includes(`${expected} success rate across active multi-agent hooks`));
    assert.doesNotMatch(telemetry, /No data/);
  });
}

test("aggregate samples remain valid when recent events are omitted and latency is zero", () => {
  const { metrics } = renderTelemetry(["success"], { averageDuration: 0, recentEventLimit: 0 });
  assert.equal(metrics["Success Rate"], "100%");
  assert.equal(metrics["Avg Latency"], "&lt; 1ms");
  assert.equal(metrics["Active Providers"], "1");
});
