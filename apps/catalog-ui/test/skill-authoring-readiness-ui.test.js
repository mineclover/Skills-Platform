import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [typesSource, contractsSource, apiSource, workspaceSource, stylesSource] = await Promise.all([
  readFile(new URL("../src/types.ts", import.meta.url), "utf8"),
  readFile(new URL("../../../packages/skill-contracts/src/types.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/api/catalog-api.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/components/SkillWorkspace.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/styles.css", import.meta.url), "utf8"),
]);

function exportedFunctionSource(name) {
  const start = apiSource.indexOf(`export async function ${name}`);
  assert.notEqual(start, -1, `${name} must be exported`);
  const next = apiSource.indexOf("\nexport ", start + 1);
  return apiSource.slice(start, next === -1 ? apiSource.length : next);
}

test("authoring analysis preserves independent Codex and Antigravity results", () => {
  assert.match(typesSource, /from "@skills-platform\/contracts"/);
  assert.match(contractsSource, /SkillAuthoringPlatform\s*=\s*"codex"\s*\|\s*"antigravity"/);
  assert.match(
    contractsSource,
    /status:\s*"conformant"\s*\|\s*"review_recommended"\s*\|\s*"nonconformant"/,
  );
  assert.match(contractsSource, /results:\s*Partial<Record<SkillAuthoringPlatform, SkillAuthoringPlatformResult>>/);
  assert.match(typesSource, /authoring\?:\s*SkillAuthoringAnalysis/);
  assert.match(typesSource, /execution_effect:\s*"none"/);
  assert.match(workspaceSource, /AUTHORING_PLATFORMS/);
  assert.match(workspaceSource, /authoringResults\[platform\.id\]/);
  assert.match(workspaceSource, /role="tablist"/);
  assert.match(workspaceSource, /aria-selected=\{authoringPlatform === platform\.id\}/);
});

test("authoring readiness remains separate from activation and review state", () => {
  assert.match(workspaceSource, /Readiness is independent from\s*review state, activation, and provider enablement/);
  assert.match(workspaceSource, /A blocked authoring result is a validation finding, not a disabled skill/);
  assert.match(workspaceSource, /execution effect = none/);
  assert.match(workspaceSource, /No source,\s*prompt, activation setting, or review decision is changed here/);
  assert.doesNotMatch(workspaceSource, /setReviewState\([^)]*resolvedAuthoringStatus/);
});

test("provider metadata explains Codex policy and Antigravity package differences", () => {
  assert.match(workspaceSource, /Manifest and frontmatter/);
  assert.match(workspaceSource, /metadata\.frontmatter_fields/);
  assert.match(workspaceSource, /Codex interface metadata/);
  assert.match(workspaceSource, /agents\/openai\.yaml/);
  assert.match(workspaceSource, /Explicit only — \$skill remains available/);
  assert.match(workspaceSource, /Implicit and explicit invocation/);
  assert.match(workspaceSource, /Antigravity package resources/);
  assert.match(workspaceSource, /resources\//);
  assert.match(workspaceSource, /examples\//);
  assert.match(workspaceSource, /evaluated independently from Codex assets/);
  assert.match(workspaceSource, /Ruleset discovery and package conventions/);
  assert.match(workspaceSource, /activeRuleset\.optional_directories/);
  assert.match(workspaceSource, /activeRuleset\.global_discovery_roots/);
  assert.match(workspaceSource, /Official specification/);
  assert.doesNotMatch(workspaceSource, /implicit\s*===\s*false[^\n]*disabled/i);
});

test("findings expose common and platform-specific evidence", () => {
  assert.match(contractsSource, /confidence:\s*SkillAuthoringConfidence/);
  assert.match(contractsSource, /basis:\s*SkillAuthoringFindingBasis/);
  assert.match(contractsSource, /location\?:\s*SkillAuthoringFindingLocation \| null/);
  assert.match(contractsSource, /recommendation\?:\s*string \| null/);
  assert.match(workspaceSource, /Common findings/);
  assert.match(workspaceSource, /-specific findings/);
  assert.match(workspaceSource, /findingLocationLabel/);
  assert.match(workspaceSource, /findingBasisLabel/);
  assert.match(workspaceSource, /Recommendation/);
  assert.match(stylesSource, /\.authoring-finding\.error/);
  assert.match(stylesSource, /\.authoring-finding\.warning/);
  assert.match(stylesSource, /\.authoring-finding\.info/);
});

test("API boundary normalizes older analyzer aliases into the shared contract", () => {
  assert.match(apiSource, /value === "high"\) return "certain"/);
  assert.match(apiSource, /value === "medium"\) return "likely"/);
  assert.match(apiSource, /value === "manifest"\) return "structure"/);
  assert.match(apiSource, /rawLocation\.path/);
  assert.match(apiSource, /rawLocation\.line/);
  assert.match(apiSource, /rawLocation\.field/);
  assert.match(apiSource, /status: errors > 0 \? "nonconformant"/);
  assert.match(apiSource, /normalizeSkillStaticAnalysis/);
  assert.match(apiSource, /body\.analyses\.map\(normalizeSkillStaticAnalysis\)/);
});

test("ruleset discovery is explicit and demo mode never claims readiness", () => {
  const source = exportedFunctionSource("fetchSkillAuthoringRulesetsApi");
  assert.match(source, /\/api\/skill-authoring\/rulesets/);
  assert.match(source, /available:\s*false/);
  assert.match(source, /rulesets:\s*\[\]/);
  assert.match(source, /were not inspected/);
  assert.match(workspaceSource, /Ruleset/);
  assert.match(workspaceSource, /activeRulesetIdentity\?\.version/);
  assert.match(workspaceSource, /activeRulesetIdentity\?\.source/);
  assert.match(workspaceSource, /No platform is reported as ready from demo data/);
});

test("virtual draft validation has a non-mutating client contract and no demo success", () => {
  assert.match(typesSource, /ValidateSkillDraftInput = SkillAuthoringVirtualValidationRequest/);
  assert.match(contractsSource, /interface SkillAuthoringVirtualFile/);
  assert.match(contractsSource, /relative_path:\s*string/);
  assert.match(contractsSource, /files:\s*SkillAuthoringVirtualFile\[\]/);
  assert.match(typesSource, /ValidateSkillDraftResult = SkillAuthoringVirtualValidationResponse/);
  const source = exportedFunctionSource("validateSkillDraftApi");
  assert.match(source, /\/api\/skill-authoring\/validate/);
  assert.match(source, /method:\s*"POST"/);
  assert.match(source, /Virtual skill draft validation is unavailable in demo mode/);
  assert.match(source, /throwCatalogApiError/);
  assert.doesNotMatch(source, /valid:\s*true/);
  assert.doesNotMatch(workspaceSource, /Apply source|Write source|Save frontmatter|Create new revision/);
});
