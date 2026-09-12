import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createElement, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

let vite;
let CatalogApp;
let TemplateInspector;
let SkillTable;
let createContextGate;
let useContextValue;
let sharedPreviewReview;
let canApplyProjectPreview;
let sharedImpactSignature;
let projectPreviewRequest;
let embeddedProjectSnapshot;
let resolveProjectSnapshot;

before(async () => {
  vite = await createServer({
    root: fileURLToPath(new URL("..", import.meta.url)),
    define: { "import.meta.env.VITE_CATALOG_API": JSON.stringify("http://catalog-test.invalid") },
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    appType: "custom",
  });
  ({ CatalogApp } = await vite.ssrLoadModule("/src/CatalogApp.tsx"));
  ({ TemplateInspector, SkillTable } = await vite.ssrLoadModule("/src/components/ProjectWorkspace.tsx"));
  ({ createContextGate, useContextValue } = await vite.ssrLoadModule("/src/context-state.ts"));
  ({ sharedPreviewReview, canApplyProjectPreview, sharedImpactSignature, projectPreviewRequest,
    embeddedProjectSnapshot, resolveProjectSnapshot } = await vite.ssrLoadModule("/src/project-resolution.ts"));
});
after(async () => { await vite?.close(); });

test("connected initial render shows pending resolution without demo skills or plans", () => {
  const html = renderToStaticMarkup(createElement(CatalogApp));
  assert.ok(html.includes("Loading Catalog projects"));
  assert.ok(html.includes("Waiting for this project&#x27;s effective skills and assignments."));
  assert.doesNotMatch(html, /Acme Web|Build v2|Verification v1|Demo data|3 \/ 3 resolved|Plan is ready for Skills Manager delivery/);
  assert.match(html, /<button[^>]*disabled=""[^>]*>[\s\S]*?Preview activation plan/);
});

test("effective-set snapshot uses its full project assignments without another policy read", async () => {
  const assignment = { preset_id: "scope-overlay", template_version: 1, role: "work_scope_overlay", priority: 10, work_scope_tags: ["review"], enabled: false };
  const body = { project: { id: "project", name: "Project", preset_assignments: [assignment] }, assignments: [], skills: [] };
  const snapshot = await resolveProjectSnapshot(body, () => { throw new Error("A second read could observe a different policy"); });
  assert.equal(snapshot.effectiveSet, body);
  assert.equal(snapshot.assignments, body.project.preset_assignments);
  assert.deepEqual(snapshot.assignments, [assignment], "use full configured assignments, including disabled overlays");
});

test("an explicit empty assignment snapshot does not invoke the legacy fallback", async () => {
  const body = { project: { id: "project", name: "Project", preset_assignments: [] }, assignments: [], skills: [] };
  const snapshot = await resolveProjectSnapshot(body, () => { throw new Error("Fallback must not run for an empty snapshot"); });
  assert.deepEqual(snapshot.assignments, []);
});

test("only older effective-set responses use the separate assignment query", async () => {
  const body = { project: { id: "legacy", name: "Legacy" }, assignments: [], skills: [] };
  const legacyAssignments = [{ preset_id: "core", enabled: true }];
  let calls = 0;
  const snapshot = await resolveProjectSnapshot(body, async () => { calls += 1; return legacyAssignments; });
  assert.equal(calls, 1);
  assert.equal(snapshot.effectiveSet, body);
  assert.equal(snapshot.assignments, legacyAssignments);
  assert.equal(body.project.preset_assignments, undefined, "do not rewrite the received server snapshot");
  await assert.rejects(resolveProjectSnapshot(body, async () => { throw new Error("Legacy assignment read failed"); }), /Legacy assignment read failed/);
});

test("preview snapshot refresh updates both values only when its embedded assignment list is present", () => {
  const effectiveSet = { project: { id: "project", name: "Project", preset_assignments: [] }, assignments: [], skills: [] };
  const snapshot = embeddedProjectSnapshot(effectiveSet);
  assert.equal(snapshot.effectiveSet, effectiveSet);
  assert.equal(snapshot.assignments, effectiveSet.project.preset_assignments);
  assert.equal(embeddedProjectSnapshot(), null);
  assert.equal(embeddedProjectSnapshot({ ...effectiveSet, project: { id: "legacy", name: "Legacy" } }), null);
});

test("context-bound hook hides snapshots before effects and rejects setters from earlier visits", () => {
  const observed = [];
  let oldSetter;
  function Probe() {
    const [phase, setPhase] = useState(0);
    const key = phase < 2 ? "project-a" : phase < 4 ? "project-b" : "project-a";
    const [value, setValue] = useContextValue(key, null);
    observed.push({ phase, key, value });
    if (phase === 0) { oldSetter = setValue; setValue("A data"); }
    if (phase === 2) { oldSetter("late A data"); setValue("B data"); }
    if (phase === 4) oldSetter("late first-visit A data");
    if (phase < 5) setPhase(phase + 1);
    return createElement("p", null, value ?? "pending");
  }
  const html = renderToStaticMarkup(createElement(Probe));
  assert.deepEqual(observed, [
    { phase: 0, key: "project-a", value: null },
    { phase: 1, key: "project-a", value: "A data" },
    { phase: 2, key: "project-b", value: null },
    { phase: 3, key: "project-b", value: "B data" },
    { phase: 4, key: "project-a", value: null },
    { phase: 5, key: "project-a", value: null },
  ]);
  assert.equal(html, "<p>pending</p>");
});

test("changing consent invalidates a plan immediately and changing project clears both values", () => {
  const observed = [];
  let oldPlanSetter;
  function Probe() {
    const [phase, setPhase] = useState(0);
    const project = phase < 4 ? "project-a" : "project-b";
    const [consent, setConsent] = useContextValue(project, false);
    const [plan, setPlan] = useContextValue(JSON.stringify([project, consent]), null);
    observed.push({ phase, consent, plan });
    if (phase === 0) { oldPlanSetter = setPlan; setPlan("initial-plan"); }
    if (phase === 1) setConsent(true);
    if (phase === 2) { oldPlanSetter("late initial plan"); setPlan("new-confirmed-plan"); }
    if (phase === 4) oldPlanSetter("late previous project plan");
    if (phase < 5) setPhase(phase + 1);
    return null;
  }
  renderToStaticMarkup(createElement(Probe));
  assert.deepEqual(observed, [
    { phase: 0, consent: false, plan: null },
    { phase: 1, consent: false, plan: "initial-plan" },
    { phase: 2, consent: true, plan: null },
    { phase: 3, consent: true, plan: "new-confirmed-plan" },
    { phase: 4, consent: false, plan: null },
    { phase: 5, consent: false, plan: null },
  ]);
});

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

for (const resource of ["live status", "skill evidence", "immutable preview plan"]) {
  test(`late ${resource} responses cannot replace a newer context or clear its loading state`, async () => {
    const gate = createContextGate();
    let value = null;
    let loading = false;
    const publish = (token, pending) => {
      const current = gate.start(token);
      loading = true;
      return pending.promise.then((response) => { if (current()) value = response; })
        .catch((error) => { if (current()) value = error.message; })
        .finally(() => { if (current()) loading = false; });
    };
    const old = deferred();
    const current = deferred();
    const oldToken = gate.enter("project-a/implementation/policy-1");
    const oldRequest = publish(oldToken, old);
    const newToken = gate.enter("project-b/review/policy-2");
    const newRequest = publish(newToken, current);
    old.reject(new Error("Old project unavailable"));
    await oldRequest;
    assert.equal(value, null);
    assert.equal(loading, true);
    current.resolve("current result");
    await newRequest;
    assert.equal(value, "current result");
    assert.equal(loading, false);
    assert.equal(gate.start(oldToken)(), false, "an old callback cannot begin a fresh request");
  });
}

test("overlapping refreshes accept only the newest request in the same context", async () => {
  const gate = createContextGate();
  const token = gate.enter("same-project");
  const first = deferred();
  const second = deferred();
  const firstCurrent = gate.start(token);
  const secondCurrent = gate.start(token);
  const published = [];
  const requests = [
    first.promise.then((value) => { if (firstCurrent()) published.push(value); }),
    second.promise.then((value) => { if (secondCurrent()) published.push(value); }),
  ];
  second.resolve("newest");
  first.resolve("stale");
  await Promise.all(requests);
  assert.deepEqual(published, ["newest"]);
});

const impacts = [
  { provider_id: "codex", display_name: "Codex", root_path: "/workspace/.agents/skills", shared: true },
  { provider_id: "antigravity", display_name: "Antigravity", root_path: "/workspace/.agents/skills", shared: true },
];
function preview(confirmed = false) {
  return {
    plan: { plan_id: confirmed ? "new-confirmed-plan" : "initial-plan", operations: [], distribution: { shared_root_confirmation: confirmed } },
    preflight: { status: "confirmation_required", requires_shared_confirmation: true,
      mappings: [{ preview: { requires_confirmation: true, impacts } }, { preview: { requires_confirmation: true, impacts } }] },
  };
}

test("shared impact review deduplicates roots per provider without dropping other providers", () => {
  const review = sharedPreviewReview(preview());
  assert.equal(review.requiresConfirmation, true);
  assert.deepEqual(review.impacts, impacts);
  assert.equal(sharedImpactSignature(review.impacts), sharedImpactSignature([...impacts].reverse()));
});

test("checkbox consent never authorizes an unchanged immutable plan", () => {
  const original = preview(false);
  const copy = structuredClone(original);
  assert.equal(canApplyProjectPreview(original, false), false);
  assert.equal(canApplyProjectPreview(original, true), false);
  assert.deepEqual(original, copy);
  assert.equal(canApplyProjectPreview(preview(true), true), true);
  assert.equal(canApplyProjectPreview(preview(true), false), false);
  const missingImpacts = preview(true);
  missingImpacts.preflight.mappings = [];
  assert.equal(canApplyProjectPreview(missingImpacts, true), false);
  const failedPreflight = preview(true);
  failedPreflight.preflight.status = "failed";
  assert.equal(canApplyProjectPreview(failedPreflight, true), false);
});

test("preview request records explicit shared consent only in a newly constructed request", () => {
  const initial = projectPreviewRequest("implementation", false);
  assert.equal(initial.distribution.shared_root_confirmation, false);
  const confirmed = projectPreviewRequest("implementation", false, true);
  assert.equal(confirmed.distribution.shared_root_confirmation, true);
  assert.equal(initial.distribution.shared_root_confirmation, false);
  assert.deepEqual(confirmed.work_scope_tags, ["implementation"]);
  assert.equal(confirmed.preflight, true);
  assert.equal(projectPreviewRequest("review", true).preset_id, "builtin-pristine");
});

test("shared consent and pending plans reset with scope, policy and project transitions", () => {
  for (const changed of ["project-b/scope-a/policy-1", "project-a/scope-b/policy-1", "project-a/scope-a/policy-2"]) {
    const gate = createContextGate();
    const token = gate.enter("project-a/scope-a/policy-1/consent-false");
    const latePlan = gate.start(token);
    gate.enter(changed + "/consent-false");
    assert.equal(latePlan(), false);
  }
  const gate = createContextGate();
  const original = gate.enter("project-a/consent-false");
  const latePlan = gate.start(original);
  gate.enter("project-a/consent-true");
  assert.equal(latePlan(), false);
});

function renderInspector(overrides = {}) {
  return renderToStaticMarkup(createElement(TemplateInspector, {
    scope: "implementation", pristine: false, defaultTemplate: "Core", defaultPresetId: "core",
    presets: [{ id: "core", name: "Core", selected_version: 1 }], appliedOverlays: [], overlayPresetId: null,
    providerId: "codex", applyProgress: null, sharedImpacts: impacts, requiresSharedConfirmation: true,
    ...overrides,
  }));
}

test("shared confirmation is explicit and keeps apply disabled until a new plan is ready", () => {
  const initial = renderInspector({ sharedConsent: false, planReady: false });
  assert.ok(initial.includes("Codex (codex)"));
  assert.ok(initial.includes("Antigravity (antigravity)"));
  assert.ok(initial.includes("/workspace/.agents/skills"));
  assert.match(initial, /<input type="checkbox"\/>/);
  const accepted = renderInspector({ sharedConsent: true, planReady: false });
  assert.match(accepted, /<input type="checkbox" checked=""\/>/);
  assert.ok(accepted.includes("Preview with shared confirmation"));
  assert.match(accepted, /class="quiet-action apply-action"[^>]*disabled=""/);
  assert.ok(accepted.includes("existing immutable plan remains unchanged"));
  const ready = renderInspector({ sharedConsent: true, planReady: true });
  assert.doesNotMatch(ready, /class="quiet-action apply-action"[^>]*disabled=/);
});

test("pending resolution disables policy assignment, preview, apply, prompt and skill overrides", () => {
  const html = renderInspector({ pending: true, planReady: true });
  for (const tag of html.matchAll(/<(button|select|input)\b[^>]*>/g)) {
    assert.ok(tag[0].includes("disabled="), `${tag[0]} must be disabled`);
  }
  const table = renderToStaticMarkup(createElement(SkillTable, {
    disabled: true, onSkillStateChange() {}, skills: [{
      registry_skill_id: "skill", lineage_id: "lineage", name: "Skill", enabled: true,
      reason: "Default", source: "Core", override: { desired_state: "enabled" },
    }],
  }));
  assert.match(table, /class="quiet-action" disabled="">Disable<\/button>/);
  assert.match(table, /class="quiet-action" disabled="">Inherit<\/button>/);
});
