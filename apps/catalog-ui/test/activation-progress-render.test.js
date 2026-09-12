import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

let vite;
let ActivationProgressModal;

before(async () => {
  vite = await createServer({
    root: fileURLToPath(new URL("..", import.meta.url)),
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    appType: "custom",
  });
  ({ ActivationProgressModal } = await vite.ssrLoadModule("/src/components/ActivationProgressModal.tsx"));
});

after(async () => {
  await vite?.close();
});

function renderProgress(props = {}) {
  const html = renderToStaticMarkup(createElement(ActivationProgressModal, {
    isOpen: true,
    onClose() {},
    onRetry() {},
    progress: null,
    result: null,
    ...props,
  }));
  const steps = Object.fromEntries([...html.matchAll(
    /data-step-id="([^"]+)" data-step-status="([^"]+)"/g,
  )].map(([, id, status]) => [id, status]));
  return { html, steps };
}

test("preflighted preview completes only planning stages without an applied report", () => {
  const { html, steps } = renderProgress({
    mode: "preview",
    previewResult: { planned: 81, preflighted: true },
    progress: { stage: "preview", completed: 81, total: 81, message: "Immutable plan is ready for delivery." },
  });
  assert.ok(html.includes("Preview Complete: 81 planned · preflighted"));
  assert.deepEqual(steps, { plan: "completed", inspect: "completed", preview: "completed" });
  assert.ok(html.includes('aria-label="Progress 100%"'));
  assert.ok(html.includes("Apply the previewed plan to change provider bindings."));
  assert.doesNotMatch(html, /Activation Complete|Execution Report Metrics|Symlinks created|All provider symlinks and delivery paths verified|filesystem symlink materialization/);
});

test("empty preview is complete without representing zero operations as an activation", () => {
  const { html } = renderProgress({ mode: "preview", previewResult: { planned: 0, preflighted: true } });
  assert.ok(html.includes("Preview Complete: 0 planned · preflighted"));
  assert.doesNotMatch(html, /Activation Complete|Execution Report Metrics/);
});

test("offline preview reports that preflight was not run and ignores stale apply results", () => {
  const { html } = renderProgress({
    mode: "preview",
    previewResult: { planned: 3, preflighted: false },
    result: { status: "succeeded", report: { summary: { applied: 81, skipped: 0, failed: 0 } } },
  });
  assert.ok(html.includes("Preview Complete: 3 planned · preflight not run"));
  assert.doesNotMatch(html, /81 applied|Activation Complete|Execution Report Metrics/);
});

test("preview in progress uses preview language and preserves the active step", () => {
  const { html, steps } = renderProgress({
    mode: "preview",
    isStreaming: true,
    progress: { stage: "inspect", completed: 1, total: 3, message: "Inspecting provider bindings" },
  });
  assert.deepEqual(steps, { plan: "completed", inspect: "active", preview: "pending" });
  assert.ok(html.includes("Previewing"));
  assert.ok(html.includes("Recording and preflighting the activation plan..."));
  assert.doesNotMatch(html, /Materializing Live|Preview Complete|NDJSON|Activation Complete/);
});

test("failed preview remains failed and offers preview retry", () => {
  const { html, steps } = renderProgress({
    mode: "preview",
    error: "Target binding failed preflight",
    progress: { stage: "inspect", completed: 1, total: 3, message: "Target binding failed preflight" },
  });
  assert.deepEqual(steps, { plan: "completed", inspect: "failed", preview: "pending" });
  assert.ok(html.includes("Preview Halted: Target binding failed preflight"));
  assert.ok(html.includes("Retry Preview"));
  assert.doesNotMatch(html, /Preview Complete|Activation Complete|Retry Activation/);
});

for (const status of ["succeeded", "applied"]) {
  test(`actual ${status} apply report retains operation counts and all five completed stages`, () => {
    const { html, steps } = renderProgress({
      result: { status, report: { summary: { applied: 3, skipped: 78, failed: 0 } } },
    });
    assert.ok(html.includes("Activation Complete: 3 applied · 78 skipped · 0 failed"));
    assert.ok(html.includes("Execution Report Metrics"));
    assert.deepEqual(steps, { plan: "completed", inspect: "completed", preview: "completed", materialize: "completed", verify: "completed" });
    assert.ok(html.includes('aria-label="Progress 100%"'));
  });
}

test("completed stream event alone waits for an apply report before claiming success", () => {
  const { html, steps } = renderProgress({
    isStreaming: true,
    progress: { stage: "completed", completed: 81, total: 81, message: "Awaiting final report" },
  });
  assert.equal(steps.verify, "active");
  assert.ok(html.includes('aria-label="Progress 98%"'));
  assert.doesNotMatch(html, /Activation Complete|Execution Report Metrics|Succeeded|All provider symlinks and delivery paths verified/);
});

test("failed application preserves partial operation report and retry", () => {
  const { html, steps } = renderProgress({
    error: "Binding write failed",
    progress: { stage: "materialize", completed: 4, total: 5, message: "Binding write failed" },
    result: { status: "failed", report: { summary: { applied: 2, skipped: 1, failed: 1 } } },
  });
  assert.equal(steps.materialize, "failed");
  assert.equal(steps.verify, "pending");
  assert.ok(html.includes("Activation Halted: Binding write failed"));
  assert.ok(html.includes("Execution Report Metrics"));
  assert.ok(html.includes("Retry Activation"));
  assert.doesNotMatch(html, /Activation Complete|Succeeded/);
});

test("restart-required notice remains tied to a completed Codex apply report", () => {
  const { html } = renderProgress({
    providerId: "codex",
    result: {
      status: "succeeded",
      report: { summary: { applied: 1, skipped: 0, failed: 0 }, operations: [{ restart_required: true }] },
    },
  });
  assert.ok(html.includes("Restart Codex to apply the skill state change"));
});
