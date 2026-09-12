import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

let vite;
let recipeApplyNotice;
let recipeDeliveryRoot;
let RecipeApplyResultCard;
let applyRecipeApi;

before(async () => {
  vite = await createServer({
    root: fileURLToPath(new URL("..", import.meta.url)),
    define: { "import.meta.env.VITE_CATALOG_API": JSON.stringify("") },
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    appType: "custom",
  });
  ({ recipeApplyNotice, recipeDeliveryRoot, RecipeApplyResultCard } = await vite.ssrLoadModule("/src/components/RecipeWorkspace.tsx"));
  const api = await vite.ssrLoadModule("/src/api/catalog-api.ts");
  assert.equal(api.catalogApi, "", "offline API tests must not contact the Catalog");
  applyRecipeApi = api.applyRecipeApi;
});

after(async () => { await vite?.close(); });

function applyResult(delivery) {
  return {
    recipe_id: "recipe-test",
    name: "Core skills",
    sources_imported: [{ source_id: "core", locator: "./core", imported_skills: 3 }],
    presets_reconciled: [{ id: "core", matched_skills: 3 }],
    delivery,
  };
}

function renderResult(result) {
  return renderToStaticMarkup(createElement(RecipeApplyResultCard, { result, providerId: "codex" }));
}

test("failed delivery surfaces its error and preserves the complete report", () => {
  const result = applyResult({
    project_id: "test",
    applied: false,
    report: {
      status: "failed", error: "Source approval was revoked", rolled_back: true,
      operations: [{ skill_name: "planning", applied: false, failed: true }],
      summary: { applied: 0, skipped: 0, failed: 1 },
    },
  });
  const original = structuredClone(result);
  const notice = recipeApplyNotice(result, "codex");
  assert.equal(notice.type, "error");
  assert.ok(notice.message.includes("Source approval was revoked"));
  const html = renderResult(result);
  assert.ok(html.includes("Recipe Delivery Failed"));
  assert.ok(html.includes("Source approval was revoked"));
  assert.ok(html.includes("Delivery report"));
  assert.ok(html.includes("rolled_back"));
  assert.ok(html.includes("planning"));
  assert.doesNotMatch(html, /Successfully Applied|Successfully applied|bindings materialized/);
  assert.deepEqual(result, original);
});

test("failed report overrides a contradictory legacy applied flag", () => {
  const result = applyResult({ project_id: "test", applied: true, report: { status: "failed", error: "Delivery blocked" } });
  assert.equal(recipeApplyNotice(result, "codex").type, "error");
  assert.doesNotMatch(renderResult(result), /Successfully Applied|Successfully applied/);
});

test("completed delivery with an applied flag produces consistent success notice and card", () => {
  const result = applyResult({
    project_id: "test", applied: true,
    report: { status: "completed", summary: { applied: 3, skipped: 0, failed: 0 } },
  });
  const notice = recipeApplyNotice(result, "codex");
  assert.equal(notice.type, "success");
  assert.ok(notice.message.includes("codex delivery bindings"));
  const html = renderResult(result);
  assert.ok(html.includes("Successfully Applied"));
  assert.ok(html.includes("Delivery report"));
});

for (const [label, delivery] of [
  ["preview", { project_id: "test", applied: false, preview: { valid: true, operations: [] }, message: "Preview ready." }],
  ["import only", null],
  ["unverified legacy result", { project_id: "test", applied: true }],
  ["unapplied completed report", { project_id: "test", applied: false, report: { status: "completed" } }],
]) {
  test(`${label} remains informational without claiming materialization`, () => {
    const result = applyResult(delivery);
    assert.equal(recipeApplyNotice(result, "codex").type, "info");
    const html = renderResult(result);
    assert.ok(html.includes("Recipe Result"));
    assert.doesNotMatch(html, /Successfully Applied|Successfully applied|bindings materialized/);
  });
}

test("offline confirmation never produces an applied result or a success card", async () => {
  const result = await applyRecipeApi({
    recipe: { recipe_id: "demo", name: "Demo skills", sources: [], skills: [], presets: [] },
    project_path: "./demo-project",
    provider_id: "codex",
    confirm: true,
  });
  assert.equal(result.delivery.applied, false);
  assert.equal(result.delivery.report, undefined);
  assert.ok(result.delivery.message.includes("Demo preview only"));
  assert.equal(recipeApplyNotice(result, "codex").type, "info");
  assert.doesNotMatch(renderResult(result), /Successfully Applied|Successfully applied|Successfully materialized/);
});

test("provider delivery roots follow the Codex contract while preserving other-provider fallback", () => {
  assert.equal(recipeDeliveryRoot("codex"), ".agents/skills");
  assert.equal(recipeDeliveryRoot("antigravity"), ".agents/skills");
  assert.equal(recipeDeliveryRoot("claude"), ".claude/skills");
  assert.equal(recipeDeliveryRoot("other"), "skills");
});
