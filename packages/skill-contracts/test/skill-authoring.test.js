const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createSkillAuthoringAnalysis,
  createSkillAuthoringPlatformResult,
  createSkillAuthoringRulesetDescriptor,
  createSkillAuthoringVirtualValidationRequest,
  createSkillAuthoringVirtualValidationResponse,
  getSkillAuthoringRuleset,
  listSkillAuthoringRulesets,
  validateSkillAuthoringAnalysis,
  validateSkillAuthoringFinding,
  validateSkillAuthoringRulesetDescriptor,
  validateSkillAuthoringVirtualValidationRequest,
} = require("../src");

function warningFinding() {
  return {
    rule_id: "skill.trigger.scope-boundaries",
    severity: "warning",
    confidence: "heuristic",
    category: "trigger",
    basis: {
      kind: "official",
      source_url: "https://developers.openai.com/codex/skills",
      statement: "Descriptions should state a clear scope and boundary.",
    },
    message: "The trigger description is broader than the workflow body.",
    location: {
      relative_path: "SKILL.md",
      start_line: 3,
      end_line: 3,
      yaml_path: "description",
    },
    evidence: { description_length: 480 },
    recommendation: "Front-load the main use case and remove unrelated triggers.",
  };
}

test("skill authoring rulesets expose provider-specific official discovery and package contracts", () => {
  const rulesets = listSkillAuthoringRulesets();
  assert.deepEqual(rulesets.map((ruleset) => ruleset.platform), ["codex", "antigravity"]);

  const codex = getSkillAuthoringRuleset("codex");
  assert.deepEqual(codex.required_frontmatter, ["name", "description"]);
  assert.ok(codex.project_discovery_roots.includes("$REPO_ROOT/.agents/skills"));
  assert.ok(codex.global_discovery_roots.includes("$HOME/.agents/skills"));
  assert.deepEqual(codex.optional_directories, ["scripts", "references", "assets", "agents"]);
  assert.deepEqual(codex.provider_extensions, ["agents/openai.yaml"]);

  const antigravity = getSkillAuthoringRuleset("antigravity");
  assert.deepEqual(antigravity.required_frontmatter, ["description"]);
  assert.ok(antigravity.project_discovery_roots.includes("$WORKSPACE_ROOT/.agent/skills"));
  assert.deepEqual(antigravity.global_discovery_roots, ["$HOME/.gemini/config/skills"]);
  assert.deepEqual(antigravity.optional_directories, ["scripts", "examples", "resources"]);
  assert.deepEqual(antigravity.provider_extensions, []);

  codex.required_frontmatter.push("mutated-locally");
  assert.deepEqual(getSkillAuthoringRuleset("codex").required_frontmatter, ["name", "description"]);
});

test("skill authoring ruleset descriptors validate and clone portable shared metadata", () => {
  const descriptor = createSkillAuthoringRulesetDescriptor({
    platform: "codex",
    ruleset_id: "custom-codex",
    version: "1",
    source_url: "https://developers.openai.com/codex/skills",
    project_discovery_roots: ["$PROJECT/.agents/skills"],
    global_discovery_roots: ["$HOME/.agents/skills"],
    required_frontmatter: ["name", "description"],
    optional_directories: ["references"],
    provider_extensions: ["agents/openai.yaml"],
  });
  assert.equal(validateSkillAuthoringRulesetDescriptor(descriptor).valid, true);
  descriptor.optional_directories.push("scripts");

  const invalid = validateSkillAuthoringRulesetDescriptor({
    ...descriptor,
    source_url: "http://example.test/rules",
    required_frontmatter: ["description", "description"],
  });
  assert.equal(invalid.valid, false);
  assert.ok(invalid.issues.some((issue) => issue.field === "source_url"));
  assert.ok(invalid.issues.some((issue) => issue.field === "required_frontmatter[1]"));
});

test("skill authoring platform results derive stable summaries and remain execution-neutral", () => {
  const finding = warningFinding();
  assert.equal(validateSkillAuthoringFinding(finding).valid, true);
  const codex = createSkillAuthoringPlatformResult({
    platform: "codex",
    findings: [finding],
    observations: { line_count: 90, linked_references: ["references/format.md"] },
    provider_metadata: {
      manifest_path: "SKILL.md",
      manifest_exact_case: true,
      resolved_name: "demo-skill",
      invocation_mode: "explicit_only",
      frontmatter_fields: ["description", "name"],
      optional_directories_present: ["references"],
      provider_extensions_present: ["agents/openai.yaml"],
      discovery_root: "$REPO_ROOT/.agents/skills",
      openai: {
        present: true,
        interface: {
          display_name: "Demo Skill",
          short_description: "A focused demo authoring workflow",
          default_prompt: "Use $demo-skill to validate this package.",
        },
        policy: { allow_implicit_invocation: false },
        dependencies: {
          tools: [{ type: "mcp", value: "docs", transport: "streamable_http" }],
        },
      },
    },
  });
  assert.deepEqual(codex.summary, {
    compatible: true,
    status: "review_recommended",
    finding_count: 1,
    error_count: 0,
    warning_count: 1,
    info_count: 0,
  });
  assert.deepEqual(codex.ruleset, {
    id: "codex-official-skills",
    version: "1.0.0",
    source: "https://developers.openai.com/codex/skills",
  });

  const authoring = createSkillAuthoringAnalysis({ codex });
  const response = createSkillAuthoringVirtualValidationResponse(authoring);
  assert.equal(response.authoring.execution_effect, "none");
  assert.equal(validateSkillAuthoringAnalysis(response.authoring).valid, true);
  assert.equal(response.authoring.results.codex.provider_metadata.openai.policy.allow_implicit_invocation, false);

  const tampered = structuredClone(response.authoring);
  tampered.results.codex.summary.warning_count = 0;
  assert.equal(validateSkillAuthoringAnalysis(tampered).valid, false);

  const antigravity = createSkillAuthoringPlatformResult({
    platform: "antigravity",
    provider_metadata: {
      manifest_path: "SKILL.md",
      manifest_exact_case: true,
      resolved_name: "folder-default-name",
      invocation_mode: "implicit_and_explicit",
      frontmatter_fields: ["description"],
      optional_directories_present: ["examples", "resources"],
      provider_extensions_present: [],
      antigravity: {
        name_defaulted: true,
        examples: ["examples/request.md"],
        resources: ["resources/template.html"],
      },
    },
  });
  assert.equal(antigravity.provider_metadata.antigravity.name_defaulted, true);
});

test("virtual authoring validation requests normalize safe paths and reject ambiguous input", () => {
  const request = createSkillAuthoringVirtualValidationRequest({
    files: [
      { relative_path: ".\\SKILL.md", content: "---\nname: demo\ndescription: Demo.\n---\n" },
      { relative_path: "agents/openai.yaml", content: "interface:\n  display_name: Demo\n" },
    ],
  });
  assert.deepEqual(request.platforms, ["codex", "antigravity"]);
  assert.equal(request.files[0].relative_path, "SKILL.md");
  assert.equal(validateSkillAuthoringVirtualValidationRequest(request).valid, true);

  for (const invalid of [
    { platforms: ["codex", "codex"], files: request.files },
    { platforms: ["unknown"], files: request.files },
    { platforms: ["codex"], files: [{ relative_path: "../outside.md", content: "x" }] },
    { platforms: ["codex"], files: [{ relative_path: "SKILL.md", content: "x" }, { relative_path: "./SKILL.md", content: "y" }] },
  ]) {
    assert.equal(validateSkillAuthoringVirtualValidationRequest(invalid).valid, false);
  }
});

test("finding validation rejects unsafe locations and execution-like enum drift", () => {
  const invalid = validateSkillAuthoringFinding({
    ...warningFinding(),
    severity: "block",
    location: { relative_path: "../../outside", start_line: 3, end_line: 2 },
  });
  assert.equal(invalid.valid, false);
  assert.ok(invalid.issues.some((issue) => issue.field === "severity"));
  assert.ok(invalid.issues.some((issue) => issue.field === "location.relative_path"));
  assert.ok(invalid.issues.some((issue) => issue.field === "location.end_line"));
});
