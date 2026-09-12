import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

let vite;
let TemplateInspector;
let displayEffectiveSkill;

before(async () => {
  vite = await createServer({
    root: fileURLToPath(new URL("..", import.meta.url)),
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    appType: "custom",
  });
  ({ TemplateInspector } = await vite.ssrLoadModule("/src/components/ProjectWorkspace.tsx"));
  ({ displayEffectiveSkill } = await vite.ssrLoadModule("/src/project-resolution.ts"));
});

after(async () => { await vite?.close(); });

const overlays = [
  { preset_id: "low", name: "General testing", template_version: 1, role: "work_scope_overlay", priority: 5, work_scope_tags: ["implementation"] },
  { preset_id: "high", name: "Project testing", template_version: 2, role: "work_scope_overlay", priority: 20, work_scope_tags: ["implementation", "typescript"] },
];

function renderInspector(pristine = false) {
  return renderToStaticMarkup(createElement(TemplateInspector, {
    scope: "implementation", pristine, defaultTemplate: "Build", defaultPresetId: "build",
    presets: [], appliedOverlays: overlays, overlayPresetId: "low", applyProgress: null,
  }));
}

test("inspector lists every applied overlay with priority and scope in resolution order", () => {
  const html = renderInspector();
  assert.match(html, /Matching work-scope overlays \(2\)/);
  assert.match(html, /General testing · v1/);
  assert.match(html, /Project testing · v2/);
  assert.match(html, /Priority 5 · implementation/);
  assert.match(html, /Priority 20 · implementation, typescript/);
  assert.ok(html.indexOf("General testing · v1") < html.indexOf("Project testing · v2"));
  assert.match(html, /Higher priority selects the revision when overlays include the same skill/);
  assert.match(html, /General testing \(P5\), Project testing \(P20\)/);
});

test("pristine preview does not claim overlays are applied", () => {
  const html = renderInspector(true);
  assert.match(html, /Matching work-scope overlays \(0\)/);
  assert.match(html, /No matching overlay/);
  assert.doesNotMatch(html, /Project testing · v2|General testing · v1/);
});

test("effective skill shows its selected high-priority revision instead of the first overlay", () => {
  const skill = displayEffectiveSkill({
    skill_name: "testing", registry_skill_id: "testing-v2", desired_state: "enabled",
    reason: "enable_missing_binding",
    selected_by: { preset_id: "high", template_version: 2, priority: 20, reason: "selected_by_work_scope_overlay" },
  }, overlays);
  assert.equal(skill.source, "Project testing · v2 · P20");
  assert.equal(skill.reason, "selected by work scope overlay; priority 20; matching scope: implementation, typescript");
});

test("same preset assigned as default and overlay retains the winning role and revision", () => {
  const skill = displayEffectiveSkill({
    skill_name: "testing", registry_skill_id: "testing-v2", desired_state: "enabled", reason: "enable_missing_binding",
    selected_by: { preset_id: "high", template_version: 2, priority: 20, reason: "selected_by_work_scope_overlay" },
  }, [{ ...overlays[1], template_version: 1, role: "default", priority: 0 }, ...overlays]);
  assert.equal(skill.source, "Project testing · v2 · P20");
  assert.match(skill.reason, /selected by work scope overlay; priority 20/);
});

test("explicit project override retains its own source and reason", () => {
  const skill = displayEffectiveSkill({
    skill_name: "testing", registry_skill_id: "testing-v2", desired_state: "disabled",
    reason: "disabled_by_project_override", selected_by: null,
    override: { desired_state: "disabled" },
  }, overlays);
  assert.equal(skill.source, "Project override");
  assert.equal(skill.reason, "disabled by project override");
});
