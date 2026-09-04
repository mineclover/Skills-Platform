const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  getSkillAuthoringRuleset,
  listSkillAuthoringRulesets: listContractRulesets,
  validateSkillAuthoringAnalysis,
  validateSkillAuthoringVirtualValidationRequest,
} = require("@skills-platform/contracts");
const {
  initializeSkillPackage,
  inspectSkillPackage,
  inspectSkillVirtualFiles,
  listSkillAuthoringRulesets,
  rulesetFingerprint,
} = require("../src/skill-authoring");
const { importLocalSource, inspectLocalSource } = require("../src/registry");
const { startCatalogServer } = require("../src/server");

const VALID_OPENAI_YAML = [
  "interface:",
  '  display_name: "Folded Demo"',
  '  short_description: "Validate folded skill metadata"',
  '  default_prompt: "Use $folded-demo to validate this skill."',
  "policy:",
  "  allow_implicit_invocation: false",
  "dependencies:",
  "  tools:",
  "    - type: mcp",
  "      value: openaiDeveloperDocs",
  "",
].join("\n");

function virtualSkill({ name = "folded-demo", description = "Use when validating folded YAML descriptions." } = {}) {
  return [
    { relative_path: "SKILL.md", content: `---\nname: ${name}\ndescription: >-\n  ${description}\n---\n\n# Folded demo\n` },
    { relative_path: "agents/openai.yaml", content: VALID_OPENAI_YAML },
  ];
}

test("catalog authoring rulesets are the shared independently versioned descriptors", () => {
  assert.deepEqual(listSkillAuthoringRulesets(), listContractRulesets());
  assert.match(rulesetFingerprint(), /antigravity-official-skills@1\.0\.0/);
  assert.match(rulesetFingerprint(), /codex-official-skills@1\.0\.0/);
  assert.deepEqual(getSkillAuthoringRuleset("codex").required_frontmatter, ["name", "description"]);
  assert.deepEqual(getSkillAuthoringRuleset("antigravity").required_frontmatter, ["description"]);
});

test("virtual inspection parses real YAML and satisfies the shared response contract", () => {
  const request = { platforms: ["codex", "antigravity"], files: virtualSkill() };
  assert.equal(validateSkillAuthoringVirtualValidationRequest(request).valid, true);
  const inspection = inspectSkillVirtualFiles(request);
  assert.equal(validateSkillAuthoringAnalysis(inspection.authoring).valid, true);
  assert.equal(inspection.valid, true);
  assert.equal(inspection.results.codex.provider_metadata.resolved_name, "folded-demo");
  assert.equal(inspection.results.codex.provider_metadata.invocation_mode, "explicit_only");
  assert.equal(inspection.results.codex.provider_metadata.openai.dependencies.tools[0].type, "mcp");
  assert.equal(inspection.results.antigravity.provider_metadata.antigravity.name_defaulted, false);
  assert.ok(inspection.results.antigravity.findings.some((item) => item.rule_id === "antigravity_openai_yaml_ignored"));
});

test("literal YAML descriptions retain their resolved multiline value through registry import", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "skill-authoring-literal-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const source = path.join(root, "source", "literal-demo");
  await fs.mkdir(source, { recursive: true });
  await fs.writeFile(path.join(source, "SKILL.md"), [
    "---",
    "name: literal-demo",
    "description: |-",
    "  First trigger line.",
    "  Second trigger line.",
    "---",
    "",
  ].join("\n"));
  const imported = await importLocalSource({ registryRoot: path.join(root, "registry"), sourcePath: path.dirname(source) });
  assert.equal(imported.skills[0].description, "First trigger line.\nSecond trigger line.");
});

test("both-platform analysis without agents/openai.yaml still satisfies the shared contract", () => {
  const inspection = inspectSkillVirtualFiles({
    platforms: ["codex", "antigravity"],
    files: [{
      relative_path: "SKILL.md",
      content: "---\nname: plain-skill\ndescription: Use when validating a plain portable skill.\n---\n\n# Plain skill\n",
    }],
  });
  assert.equal(validateSkillAuthoringAnalysis(inspection.authoring).valid, true);
  assert.deepEqual(inspection.results.codex.provider_metadata.openai, {
    present: false,
    policy: { allow_implicit_invocation: true },
    dependencies: { tools: [] },
  });
});

test("policy-only agents/openai.yaml omits absent optional interface metadata", () => {
  const inspection = inspectSkillVirtualFiles({
    platforms: ["codex"],
    files: [
      { relative_path: "SKILL.md", content: "---\nname: policy-only\ndescription: Use when testing explicit invocation policy.\n---\n" },
      { relative_path: "agents/openai.yaml", content: "policy:\n  allow_implicit_invocation: false\n" },
    ],
  });
  assert.equal(validateSkillAuthoringAnalysis(inspection.authoring).valid, true);
  assert.equal(Object.hasOwn(inspection.results.codex.provider_metadata.openai, "interface"), false);
  assert.equal(inspection.results.codex.provider_metadata.invocation_mode, "explicit_only");
});

test("illustrative Markdown links inside fenced code are not treated as package dependencies", () => {
  const inspection = inspectSkillVirtualFiles({
    platforms: ["codex"],
    files: [{
      relative_path: "SKILL.md",
      content: [
        "---",
        "name: fenced-links",
        "description: Use when demonstrating authoring syntax.",
        "---",
        "",
        "```markdown",
        "Read [an example](./references/not-a-real-dependency.md).",
        "```",
        "",
      ].join("\n"),
    }],
  });
  assert.equal(inspection.results.codex.summary.status, "conformant");
  assert.equal(inspection.results.codex.findings.some((item) => item.rule_id === "resource_link_missing"), false);
});

test("provider compatibility keeps optional Antigravity name separate from Codex requirements", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "skill-authoring-provider-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const source = path.join(root, "source", "folder-default");
  await fs.mkdir(source, { recursive: true });
  await fs.writeFile(path.join(source, "SKILL.md"), "---\ndescription: Uses the folder name in Antigravity.\n---\n\n# Default name\n");

  const inspected = await inspectLocalSource({ sourcePath: path.dirname(source) });
  assert.equal(inspected.importable, true);
  assert.equal(inspected.skills[0].name, "folder-default");
  assert.equal(inspected.skills[0].provider_compatibility.codex, false);
  assert.equal(inspected.skills[0].provider_compatibility.antigravity, true);

  const imported = await importLocalSource({ registryRoot: path.join(root, "registry"), sourcePath: path.dirname(source) });
  assert.equal(imported.skills[0].skill_name, "folder-default");
  assert.deepEqual(imported.skills[0].provider_compatibility, { codex: false, antigravity: true });
});

test("Codex explicit-only policy does not overwrite provider-neutral Catalog invocation mode", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "skill-authoring-invocation-policy-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const source = path.join(root, "source", "policy-split");
  await fs.mkdir(path.join(source, "agents"), { recursive: true });
  await fs.writeFile(
    path.join(source, "SKILL.md"),
    "---\nname: policy-split\ndescription: Use when checking provider policy separation.\n---\n",
    "utf8",
  );
  await fs.writeFile(
    path.join(source, "agents", "openai.yaml"),
    "policy:\n  allow_implicit_invocation: false\n",
    "utf8",
  );

  const inspected = await inspectLocalSource({ sourcePath: path.dirname(source) });
  assert.equal(inspected.skills[0].invocation_mode, "unspecified");
  assert.equal(
    inspected.skills[0].authoring.results.codex.provider_metadata.invocation_mode,
    "explicit_only",
  );
  assert.equal(
    inspected.skills[0].authoring.results.antigravity.provider_metadata.invocation_mode,
    "implicit_and_explicit",
  );

  const imported = await importLocalSource({
    registryRoot: path.join(root, "registry"),
    sourcePath: path.dirname(source),
  });
  assert.equal(imported.skills[0].invocation_mode, "unspecified");
});

test("progressive disclosure and security checks never fetch URLs or follow symlinks", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "skill-authoring-security-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const skillRoot = path.join(root, "safe-skill");
  const outside = path.join(root, "outside-secret.txt");
  await fs.mkdir(path.join(skillRoot, "references"), { recursive: true });
  await fs.writeFile(outside, "SECRET_MUST_NOT_BE_READ");
  await fs.symlink(outside, path.join(skillRoot, "references", "linked.md"));
  await fs.writeFile(path.join(skillRoot, "SKILL.md"), [
    "---",
    "name: safe-skill",
    "description: Inspect package-local resources without external reads.",
    "---",
    "",
    "Read [linked](./references/linked.md), [missing](./references/missing.md),",
    "[escaping](../outside-secret.txt), and [remote](https://example.invalid/never-fetch).",
    "",
  ].join("\n"));

  const inspection = await inspectSkillPackage({ skillPath: skillRoot, provider: "portable" });
  const serialized = JSON.stringify(inspection);
  assert.doesNotMatch(serialized, /SECRET_MUST_NOT_BE_READ/);
  assert.match(serialized, /https:\/\/example\.invalid\/never-fetch/);
  const rules = inspection.results.codex.findings.map((item) => item.rule_id);
  assert.ok(rules.includes("symlink_not_followed"));
  assert.ok(rules.includes("resource_link_missing"));
  assert.ok(rules.includes("resource_link_escapes_package"));
  assert.equal(inspection.results.codex.summary.status, "nonconformant");
});

test("root skill symlinks follow Codex's documented support without weakening internal link safety", {
  skip: process.platform === "win32" ? "Directory symlink creation may require Windows developer mode" : false,
}, async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "skill-authoring-root-symlink-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const target = path.join(root, "target");
  const linked = path.join(root, "linked-skill");
  await fs.mkdir(target, { recursive: true });
  await fs.writeFile(
    path.join(target, "SKILL.md"),
    "---\nname: linked-skill\ndescription: Use when validating a symlink-delivered Codex skill.\n---\n",
    "utf8",
  );
  await fs.symlink(target, linked, "dir");

  const inspection = await inspectSkillPackage({ skillPath: linked, provider: "portable" });
  assert.equal(inspection.results.codex.summary.status, "conformant");
  assert.ok(
    inspection.results.codex.findings
      .some((finding) => finding.rule_id === "codex_root_symlink_supported"),
  );
  assert.equal(inspection.results.antigravity.summary.status, "review_recommended");
  assert.ok(
    inspection.results.antigravity.findings
      .some((finding) => finding.rule_id === "antigravity_root_symlink_undocumented"),
  );
  assert.equal(inspection.results.codex.observations.root_symlink, true);
});

test("OpenAI metadata validation rejects aliases, unsafe icons, bad policy, and unsupported dependencies", () => {
  const inspection = inspectSkillVirtualFiles({
    platforms: ["codex"],
    files: [
      { relative_path: "SKILL.md", content: "---\nname: metadata-demo\ndescription: Validate Codex metadata.\n---\n" },
      {
        relative_path: "agents/openai.yaml",
        content: [
          "interface:",
          '  display_name: &label "Metadata Demo"',
          "  short_description: *label",
          '  icon_small: "../outside.svg"',
          "policy:",
          '  allow_implicit_invocation: "false"',
          "dependencies:",
          "  tools:",
          "    - type: shell",
          "      value: unsafe",
        ].join("\n"),
      },
    ],
  });
  assert.equal(inspection.valid, false);
  const rules = inspection.results.codex.findings.map((item) => item.rule_id);
  assert.ok(rules.includes("openai_yaml_invalid") || rules.includes("openai_icon_path_unsafe"));
});

test("virtual requests reject duplicate paths, traversal, and bounded package overflow", () => {
  assert.throws(
    () => inspectSkillVirtualFiles({
      platforms: ["codex"],
      files: [
        { relative_path: "SKILL.md", content: "---\nname: demo\ndescription: Demo.\n---\n" },
        { relative_path: "./SKILL.md", content: "duplicate" },
      ],
    }),
    /invalid|duplicated|Duplicate/i,
  );
  assert.throws(
    () => inspectSkillVirtualFiles({
      platforms: ["codex"],
      files: [{ relative_path: "../SKILL.md", content: "escape" }],
    }),
    /invalid|relative path|inside/i,
  );
  assert.throws(
    () => inspectSkillVirtualFiles({
      platforms: ["codex"],
      files: [{ relative_path: "SKILL.md", content: "x".repeat(2 * 1024 * 1024 + 1) }],
    }),
    /exceeds/,
  );
});

test("initializer is contained, non-overwriting, resource-opt-in, and validates interface fields", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "skill-authoring-init-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const created = await initializeSkillPackage({
    skillName: "My Safe Skill",
    outputDirectory: root,
    provider: "portable",
    resources: ["scripts", "references"],
    interfaceValues: { default_prompt: "Use $my-safe-skill for this focused task." },
  });
  assert.equal(created.skill_name, "my-safe-skill");
  assert.ok(await fs.stat(path.join(created.path, "SKILL.md")));
  assert.ok(await fs.stat(path.join(created.path, "agents", "openai.yaml")));
  assert.ok(await fs.stat(path.join(created.path, "scripts")));
  assert.equal(await fs.access(path.join(created.path, "examples")).then(() => true).catch(() => false), false);
  await assert.rejects(
    () => initializeSkillPackage({ skillName: "My Safe Skill", outputDirectory: root, provider: "portable" }),
    /already exists/,
  );
  await assert.rejects(
    () => initializeSkillPackage({ skillName: "Other", outputDirectory: root, provider: "codex", interfaceValues: { "bad\nkey": "value" } }),
    /Unsupported OpenAI interface field/,
  );
  await assert.rejects(
    () => initializeSkillPackage({ skillName: "Other", outputDirectory: root, provider: "codex", interfaceValues: { default_prompt: "No invocation here" } }),
    /must mention \$other/,
  );
});

test("CLI validate exits nonzero for nonconformant skills", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "skill-authoring-cli-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(path.join(root, "SKILL.md"), "---\ndescription: Missing Codex name.\n---\n");
  const result = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.resolve(__dirname, "../src/cli.js"), "skill", "validate", root, "--provider", "codex"], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", (code) => resolve({ code, stdout, stderr }));
  });
  assert.equal(result.code, 1);
  assert.equal(JSON.parse(result.stdout).valid, false);
  assert.equal(result.stderr, "");
});

test("server exposes canonical rulesets and content-only virtual validation", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "skill-authoring-server-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const server = await startCatalogServer({
    catalogRoot: path.join(root, "catalog"),
    registryRoot: path.join(root, "registry"),
    host: "127.0.0.1",
    port: 0,
  });
  context.after(() => new Promise((resolve) => server.close(resolve)));
  const address = server.address();
  const base = `http://127.0.0.1:${address.port}/api`;

  const rulesets = await (await fetch(`${base}/skill-authoring/rulesets`)).json();
  assert.deepEqual(rulesets.rulesets, listContractRulesets());

  const response = await fetch(`${base}/skill-authoring/validate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ platforms: ["codex", "antigravity"], files: virtualSkill() }),
  });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(validateSkillAuthoringAnalysis(body.authoring).valid, true);

  const denied = await fetch(`${base}/skill-authoring/validate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ skill_path: "/etc", platforms: ["codex"], files: virtualSkill() }),
  });
  assert.equal(denied.status, 403);

  const missingPlatforms = await fetch(`${base}/skill-authoring/validate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ files: virtualSkill() }),
  });
  const invalidBody = await missingPlatforms.json();
  assert.equal(missingPlatforms.status, 400);
  assert.equal(invalidBody.code, "SKILL_AUTHORING_REQUEST_INVALID");
  assert.ok(invalidBody.issues.some((issue) => issue.field === "platforms"));
});
