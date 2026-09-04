const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../..");
const {
  validateSkillAuthoringAnalysis,
} = require(path.join(ROOT, "packages/skill-contracts/src"));
const {
  analyzeSkillRevision,
  createPlanFromRegistry,
  importLocalSource,
  listSkillAuthoringRulesets,
} = require(path.join(ROOT, "apps/skills-catalog/src"));

test("Tier 1 - F22.1: one immutable skill is assessed independently by Codex and Antigravity rulesets", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "provider-authoring-e2e-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const sourceRoot = path.join(root, "source", "portable-review");
  const registryRoot = path.join(root, "registry");
  const catalogRoot = path.join(root, "catalog");
  const projectPath = path.join(root, "project");
  await fs.mkdir(path.join(sourceRoot, "agents"), { recursive: true });
  await fs.mkdir(path.join(sourceRoot, "examples"), { recursive: true });
  await fs.mkdir(path.join(sourceRoot, "resources"), { recursive: true });
  await fs.writeFile(path.join(sourceRoot, "SKILL.md"), [
    "---",
    "name: portable-review",
    "description: >-",
    "  Review a provider-portable skill package. Use when checking Codex and Antigravity conventions independently.",
    "---",
    "",
    "# Portable review",
    "",
    "For Antigravity examples, read [the scenario](./examples/scenario.md).",
    "For supporting data, read [the resource](./resources/data.md).",
    "",
  ].join("\n"), "utf8");
  await fs.writeFile(path.join(sourceRoot, "agents", "openai.yaml"), [
    "interface:",
    '  display_name: "Portable Review"',
    '  short_description: "Review provider-specific skill conventions"',
    '  default_prompt: "Use $portable-review to assess this package."',
    "policy:",
    "  allow_implicit_invocation: false",
    "",
  ].join("\n"), "utf8");
  await fs.writeFile(path.join(sourceRoot, "examples", "scenario.md"), "# Scenario\n", "utf8");
  await fs.writeFile(path.join(sourceRoot, "resources", "data.md"), "# Data\n", "utf8");

  const imported = await importLocalSource({
    registryRoot,
    sourcePath: path.dirname(sourceRoot),
  });
  const [skill] = imported.skills;
  assert.deepEqual(skill.provider_compatibility, { codex: true, antigravity: true });
  assert.match(skill.description, /Review a provider-portable skill package/);

  const codexPlanBefore = await createPlanFromRegistry({
    registryRoot,
    skillIds: [skill.id],
    target: {
      provider_id: "codex",
      scope: "project",
      project_id: "codex-project",
      project_path: projectPath,
    },
    deliveryRoot: path.join(projectPath, ".agents", "skills"),
  });
  const analysis = await analyzeSkillRevision({
    catalogRoot,
    registryRoot,
    lineageId: skill.lineage_id,
    sourceRevisionId: skill.source_revision_id,
    now: new Date("2026-09-04T00:00:00.000Z"),
  });
  const codexPlanAfter = await createPlanFromRegistry({
    registryRoot,
    skillIds: [skill.id],
    target: codexPlanBefore.target,
    deliveryRoot: path.join(projectPath, ".agents", "skills"),
  });

  assert.equal(validateSkillAuthoringAnalysis(analysis.authoring).valid, true);
  assert.deepEqual(
    listSkillAuthoringRulesets().map((ruleset) => `${ruleset.platform}:${ruleset.ruleset_id}@${ruleset.version}`),
    [
      "codex:codex-official-skills@1.0.0",
      "antigravity:antigravity-official-skills@1.0.0",
    ],
  );
  assert.equal(analysis.identity.description, skill.description);
  assert.equal(analysis.authoring.execution_effect, "none");
  assert.equal(analysis.authoring.results.codex.provider_metadata.invocation_mode, "explicit_only");
  assert.equal(analysis.authoring.results.codex.provider_metadata.openai.interface.display_name, "Portable Review");
  assert.equal(analysis.authoring.results.antigravity.provider_metadata.antigravity.name_defaulted, false);
  assert.ok(
    analysis.authoring.results.antigravity.findings
      .some((finding) => finding.rule_id === "antigravity_openai_yaml_ignored"),
  );
  assert.deepEqual(codexPlanAfter.operations, codexPlanBefore.operations);
});
