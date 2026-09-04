import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const apiSource = await readFile(new URL("../src/api/catalog-api.ts", import.meta.url), "utf8");
const skillWorkspaceSource = await readFile(
  new URL("../src/components/SkillWorkspace.tsx", import.meta.url),
  "utf8",
);
const hookWorkspaceSource = await readFile(
  new URL("../src/components/HookWorkspace.tsx", import.meta.url),
  "utf8",
);
const activationProgressSource = await readFile(
  new URL("../src/components/ActivationProgressModal.tsx", import.meta.url),
  "utf8",
);
const typesSource = await readFile(new URL("../src/types.ts", import.meta.url), "utf8");

function exportedFunctionSource(name) {
  const start = apiSource.indexOf(`export async function ${name}`);
  assert.notEqual(start, -1, `${name} must be exported`);
  const next = apiSource.indexOf("\nexport ", start + 1);
  return apiSource.slice(start, next === -1 ? apiSource.length : next);
}

test("reader annotations and static analyses use dedicated non-executing endpoints", () => {
  assert.match(apiSource, /\/api\/skills\/\$\{encodeURIComponent\(lineageId\)\}\/annotations/);
  assert.match(apiSource, /\/api\/annotations\/\$\{encodeURIComponent\(annotationId\)\}\/delete/);
  assert.match(apiSource, /\/api\/annotations\/\$\{encodeURIComponent\(annotationId\)\}\/restore/);
  assert.match(apiSource, /\/api\/skills\/\$\{encodeURIComponent\(lineageId\)\}\/analyses/);
  assert.match(apiSource, /\/api\/skills\/\$\{encodeURIComponent\(lineageId\)\}\/analysis/);
  assert.match(typesSource, /execution_effect:\s*"none"/);
  assert.match(skillWorkspaceSource, /Reader annotations/);
  assert.match(skillWorkspaceSource, /execution_effect = none/);
  assert.match(skillWorkspaceSource, /Execution-aware usage notes/);
  assert.match(skillWorkspaceSource, /Never injected into prompts/);
});

test("configured hook mutations propagate HTTP and network failures instead of demo success", () => {
  for (const name of [
    "toggleHookApi",
    "registerHookApi",
    "removeHookApi",
    "syncHooksApi",
    "triggerHookSimulationApi",
  ]) {
    const source = exportedFunctionSource(name);
    assert.match(source, /if \(catalogApi\)/, `${name} must distinguish configured API mode`);
    assert.match(source, /throwCatalogApiError/, `${name} must reject non-2xx responses`);
    assert.doesNotMatch(
      source,
      /catch\s*\{/,
      `${name} must not catch configured API failures and fall back locally`,
    );
  }
});

test("Hook Workspace derives runtime claims from diagnostics", () => {
  assert.match(apiSource, /\/api\/hooks\/diagnostics/);
  assert.match(hookWorkspaceSource, /Configured/);
  assert.match(hookWorkspaceSource, /Synced/);
  assert.match(hookWorkspaceSource, /Drift/);
  assert.match(hookWorkspaceSource, /Unsupported/);
  assert.match(hookWorkspaceSource, /RUNTIME UNKNOWN/);
  assert.match(hookWorkspaceSource, /RUNTIME READY/);
  assert.match(hookWorkspaceSource, /TRUST REVIEW REQUIRED/);
  assert.match(hookWorkspaceSource, /CONFIG \{provider\.status\.replaceAll/);
  assert.match(hookWorkspaceSource, /Runtime trust:/);
  assert.match(hookWorkspaceSource, /Open \/hooks in Codex to review and trust this project's hooks/);
  assert.match(hookWorkspaceSource, /Native events:/);
  assert.match(hookWorkspaceSource, /supportedEvents/);
  assert.match(hookWorkspaceSource, /excludedEvents/);
  assert.match(hookWorkspaceSource, /Strict config probe:/);
  assert.match(hookWorkspaceSource, /MCP tool hooks:/);
  assert.doesNotMatch(hookWorkspaceSource, /RUNTIME GUARD ACTIVE/);
});

test("Codex hook diagnostics distinguish integration support from observed runtime readiness", () => {
  assert.match(typesSource, /interface CodexHookCapabilityDiagnostic/);
  assert.match(typesSource, /minimumVersion:\s*string/);
  assert.match(typesSource, /supportedEvents:\s*string\[\]/);
  assert.match(typesSource, /excludedEvents:\s*string\[\]/);
  assert.match(typesSource, /asyncSupported:\s*boolean/);
  assert.match(typesSource, /mcpToolSupported:\s*boolean/);
  assert.match(typesSource, /parsed:\s*boolean \| null/);
  assert.match(typesSource, /status:\s*"unsupported" \| "valid" \| "invalid"/);
  assert.match(typesSource, /interface HookRuntimeTrustDiagnostic/);
  assert.match(typesSource, /status:\s*"trusted" \| "untrusted" \| "unknown"/);
  assert.match(typesSource, /feature\?: CodexHookFeatureDiagnostic/);
  assert.match(typesSource, /runtimeReady:\s*boolean/);

  const diagnosticsSource = exportedFunctionSource("fetchHookDiagnosticsApi");
  assert.match(diagnosticsSource, /codex:\s*demoProvider\("codex", true\)/);
  assert.match(diagnosticsSource, /claude:\s*demoProvider\("claude", false\)/);
  assert.match(diagnosticsSource, /trust:\s*provider === "codex" \? \{ observed: false, status: "unknown" \}/);
  assert.match(diagnosticsSource, /runtimeReady:\s*false/);
  assert.match(diagnosticsSource, /Catalog API is not configured; Codex features cannot be inspected/);
});

test("Codex activation reports surface restart-required skill config changes", () => {
  assert.match(typesSource, /restart_required\?:\s*boolean/);
  assert.match(activationProgressSource, /requiresCodexRestart/);
  assert.match(activationProgressSource, /Restart Codex to apply the skill state change/);
  assert.match(activationProgressSource, /operation\.restart_required === true/);
});

test("hook sync response and notices expose Codex counts and partial-provider state", () => {
  assert.match(typesSource, /interface HookSyncResult/);
  for (const field of [
    "antigravityHooks",
    "claudeHooks",
    "codexHooks",
    "providers",
    "unsupportedProviders",
    "fullySynced",
    "ok",
    "issues",
    "syncedAt",
  ]) {
    assert.match(typesSource, new RegExp(`${field}:`), `${field} must be typed`);
  }

  const syncSource = exportedFunctionSource("syncHooksApi");
  assert.match(syncSource, /Promise<HookSyncResult>/);
  assert.match(syncSource, /codexHooks:\s*enabled\.length/);
  assert.match(syncSource, /unsupportedProviders:\s*\["claude"\]/);
  assert.match(syncSource, /fullySynced:\s*false/);
  assert.match(hookWorkspaceSource, /\$\{res\.codexHooks\} Codex/);
  assert.match(hookWorkspaceSource, /Partial sync/);
  assert.match(hookWorkspaceSource, /unsupportedProviders\.join/);
  assert.match(hookWorkspaceSource, /open \/hooks in Codex to review and trust the project hooks/);
});

test("individual skill override client is explicit when the Catalog API is unavailable", () => {
  const source = exportedFunctionSource("setProjectSkillOverrideApi");
  assert.match(source, /desiredState:\s*"enabled" \| "disabled" \| "inherit"/);
  assert.match(source, /\/api\/projects\/\$\{encodeURIComponent\(params\.projectId\)\}\/skill-overrides/);
  assert.match(source, /unavailable in demo mode/);
  assert.match(source, /throwCatalogApiError/);
});
