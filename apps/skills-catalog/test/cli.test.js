const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { run } = require("../src/cli");

test("CLI runs the import, project, preset, plan, and prompt MVP workflow", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "skills-catalog-cli-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const sourcePath = path.join(root, "source", "demo");
  const registryRoot = path.join(root, "registry");
  const catalogRoot = path.join(root, "catalog");
  await fs.mkdir(sourcePath, { recursive: true });
  await fs.writeFile(path.join(sourcePath, "SKILL.md"), "---\nname: demo-skill\ndescription: Demo workflow.\n---\n\n# Demo skill\n");

  const imported = await run(["import-local", path.join(root, "source"), "--registry", registryRoot]);
  const skillId = imported.skills[0].id;
  await run([
    "project", "add", "demo", "--catalog", catalogRoot, "--name", "Demo",
    "--path", path.join(root, "project"), "--provider", "codex",
    "--delivery-root", path.join(root, "project", ".agents", "skills"),
  ]);
  await run([
    "preset", "create", "demo-preset", "--catalog", catalogRoot, "--registry", registryRoot,
    "--name", "Demo preset", "--skill", skillId,
  ]);
  await run(["preset", "assign", "demo", "demo-preset", "--catalog", catalogRoot]);

  const plan = await run(["project-plan", "demo", "--catalog", catalogRoot, "--registry", registryRoot]);
  const directPlan = await run([
    "plan", "--registry", registryRoot, "--skill", skillId, "--provider", "codex",
    "--delivery-root", path.join(os.homedir(), ".agents", "skills"), "--global",
  ]);
  await run([
    "project", "skill", "demo", "disable", imported.skills[0].lineage_id,
    "--catalog", catalogRoot, "--registry", registryRoot, "--skill", skillId,
  ]);
  const disabled = await run(["project", "resolve", "demo", "--catalog", catalogRoot, "--registry", registryRoot]);
  await run([
    "project", "skill", "demo", "inherit", imported.skills[0].lineage_id,
    "--catalog", catalogRoot, "--registry", registryRoot,
  ]);
  const inherited = await run(["project", "resolve", "demo", "--catalog", catalogRoot, "--registry", registryRoot]);
  const prompt = await run(["system-prompt", "--catalog", catalogRoot, "--registry", registryRoot, "--preset", "demo-preset"]);

  assert.equal(plan.mode, "apply");
  assert.equal(plan.operations[0].desired_state, "enabled");
  assert.equal(directPlan.operations[0].registry_skill_id, skillId);
  assert.equal(disabled.skills[0].desired_state, "disabled");
  assert.equal(inherited.skills[0].desired_state, "enabled");
  assert.match(prompt.content, /# Demo skill/);
});

test("CLI manages a skill profile, scoped note, and metadata search", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "skills-catalog-cli-metadata-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const sourcePath = path.join(root, "source", "demo");
  const registryRoot = path.join(root, "registry");
  const catalogRoot = path.join(root, "catalog");
  await fs.mkdir(sourcePath, { recursive: true });
  await fs.writeFile(path.join(sourcePath, "SKILL.md"), "---\nname: demo-skill\ndescription: Demo workflow.\n---\n\n# Demo skill\n");
  const imported = await run(["import-local", path.join(root, "source"), "--registry", registryRoot]);
  const lineageId = imported.skills[0].lineage_id;
  const sourceRevisionId = imported.skills[0].source_revision_id;
  await run([
    "project", "add", "demo", "--catalog", catalogRoot, "--name", "Demo",
    "--path", path.join(root, "project"), "--provider", "codex",
    "--delivery-root", path.join(root, "project", ".agents", "skills"),
  ]);
  const profile = await run([
    "skill", "profile", "set", lineageId, "--catalog", catalogRoot, "--registry", registryRoot,
    "--purpose", "Review accessibility risks.", "--tag", "review", "--provider", "codex",
  ]);
  const note = await run([
    "skill", "note", "add", lineageId, "--catalog", catalogRoot, "--registry", registryRoot,
    "--scope", "project", "--project-id", "demo", "--body", "Check keyboard paths.",
  ]);
  const found = await run([
    "skill", "search", "keyboard", "--catalog", catalogRoot, "--registry", registryRoot, "--tag", "review",
  ]);
  const annotation = await run([
    "skill", "annotation", "add", lineageId, "--catalog", catalogRoot, "--registry", registryRoot,
    "--revision", sourceRevisionId, "--kind", "plain_language", "--locale", "ko-KR",
    "--body", "실행에 영향을 주지 않는 쉬운 설명입니다.",
  ]);
  const analysis = await run([
    "skill", "analysis", "run", lineageId, "--catalog", catalogRoot, "--registry", registryRoot,
    "--revision", sourceRevisionId,
  ]);

  assert.equal(profile.purpose, "Review accessibility risks.");
  assert.equal(note.project_id, "demo");
  assert.equal(found[0].lineage.id, lineageId);
  assert.equal(annotation.execution_effect, "none");
  assert.equal(analysis.execution_effect, "none");
});

test("CLI records structured feedback and reads its health summary", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "skills-catalog-cli-feedback-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const sourcePath = path.join(root, "source", "demo");
  const registryRoot = path.join(root, "registry");
  const catalogRoot = path.join(root, "catalog");
  await fs.mkdir(sourcePath, { recursive: true });
  await fs.writeFile(path.join(sourcePath, "SKILL.md"), "---\nname: demo-skill\ndescription: Demo workflow.\n---\n\n# Demo skill\n");
  const imported = await run(["import-local", path.join(root, "source"), "--registry", registryRoot]);
  const lineageId = imported.skills[0].lineage_id;

  const feedback = await run([
    "skill", "feedback", "add", lineageId, "--catalog", catalogRoot, "--registry", registryRoot,
    "--outcome", "success", "--evidence", "evaluation", "--summary", "Expected checks passed.",
    "--metrics", '{"attempted":1,"successful":1}',
  ]);
  const summary = await run(["skill", "feedback", "summary", lineageId, "--catalog", catalogRoot, "--registry", registryRoot]);

  assert.equal(feedback.evidence_type, "evaluation");
  assert.equal(summary.health, "healthy");
  assert.equal(summary.reported_metrics.attempted, 1);
});

test("CLI records a revision-pinned evaluation case result and derives review work", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "skills-catalog-cli-evaluation-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const sourcePath = path.join(root, "source", "demo");
  const registryRoot = path.join(root, "registry");
  const catalogRoot = path.join(root, "catalog");
  await fs.mkdir(sourcePath, { recursive: true });
  await fs.writeFile(path.join(sourcePath, "SKILL.md"), "---\nname: demo-skill\ndescription: Demo workflow.\n---\n\n# Demo skill\n");
  const imported = await run(["import-local", path.join(root, "source"), "--registry", registryRoot]);
  const skill = imported.skills[0];
  const evaluationCase = await run([
    "evaluation", "case", "create", "demo-contract", "--catalog", catalogRoot, "--registry", registryRoot,
    "--lineage", skill.lineage_id, "--name", "Demo contract", "--objective", "Check demo output.",
    "--criterion", "Explains intent", "--lifecycle", "active",
  ]);
  const runResult = await run([
    "evaluation", "run", "record", "demo-contract", "--catalog", catalogRoot, "--registry", registryRoot,
    "--revision", skill.source_revision_id, "--outcome", "passed", "--summary", "Intent was clear.",
    "--criterion-results", '[{"criterion":"Explains intent","outcome":"passed"}]',
  ]);
  const summary = await run(["evaluation", "summary", skill.lineage_id, "--catalog", catalogRoot, "--registry", registryRoot, "--revision", skill.source_revision_id]);
  const queue = await run(["review", "queue", "--catalog", catalogRoot, "--registry", registryRoot]);

  assert.equal(evaluationCase.selected_version, 1);
  assert.equal(runResult.outcome, "passed");
  assert.equal(summary.evaluated_active_case_count, 1);
  assert.equal(queue[0].reasons[0].code, "unreviewed_profile");
});

test("CLI exposes hook descriptions, failure policy, exact toggles, and runtime diagnostics", async (context) => {
  const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), "skills-catalog-cli-hooks-"));
  context.after(() => fs.rm(projectPath, { recursive: true, force: true }));
  const initial = await run(["hook", "list", "--project", projectPath]);
  assert.ok(initial.hooks[0].description);
  assert.equal(initial.hooks[0].failure_policy, "open");
  assert.equal(typeof initial.hooks[0].priority, "number");

  await run(["hook", "disable", initial.hooks[0].id, "--project", projectPath, "--no-sync"]);
  const disabled = await run(["hook", "list", "--project", projectPath]);
  assert.equal(disabled.hooks.find((hook) => hook.id === initial.hooks[0].id).enabled, false);
  const diagnostics = await run(["hook", "diagnostics", "--project", projectPath]);
  assert.equal(diagnostics.providers.codex.status, "not_configured");
  assert.equal(diagnostics.providers.codex.supported, true);
  assert.equal(diagnostics.providers.codex.runtimeReady, false);
});

test("CLI versions and annotates preset templates", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "skills-catalog-cli-template-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const sourcePath = path.join(root, "source", "demo");
  const registryRoot = path.join(root, "registry");
  const catalogRoot = path.join(root, "catalog");
  await fs.mkdir(sourcePath, { recursive: true });
  await fs.writeFile(path.join(sourcePath, "SKILL.md"), "---\nname: demo-skill\ndescription: Demo workflow.\n---\n\n# Demo skill\n");
  const imported = await run(["import-local", path.join(root, "source"), "--registry", registryRoot]);
  const skillId = imported.skills[0].id;
  await run([
    "preset", "create", "demo", "--catalog", catalogRoot, "--registry", registryRoot,
    "--name", "Demo", "--purpose", "Initial purpose", "--skill", skillId,
  ]);
  const updated = await run([
    "preset", "update", "demo", "--catalog", catalogRoot, "--registry", registryRoot,
    "--purpose", "Updated purpose",
  ]);
  const initial = await run(["preset", "show", "demo", "--catalog", catalogRoot, "--version", "1"]);
  const note = await run(["preset", "note", "add", "demo", "--catalog", catalogRoot, "--body", "Use after discovery."]);
  const compared = await run(["preset", "compare", "demo", "1", "2", "--catalog", catalogRoot]);

  assert.equal(updated.selected_version, 2);
  assert.equal(initial.purpose, "Initial purpose");
  assert.equal(note.template_version, 3);
  assert.deepEqual(compared.added_registry_skill_ids, []);
});

test("CLI sync runs preflight validation, registry import, project binding, and adapter delivery", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "skills-catalog-cli-sync-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const sourcePath = path.join(root, "source", "test-skill");
  const registryRoot = path.join(root, "registry");
  const catalogRoot = path.join(root, "catalog");
  const projectPath = path.join(root, "project");
  const deliveryRoot = path.join(projectPath, ".agents", "skills");

  await fs.mkdir(sourcePath, { recursive: true });
  await fs.writeFile(
    path.join(sourcePath, "SKILL.md"),
    "---\nname: test-skill\ndescription: Test sync command workflow.\n---\n\n# Test skill\n"
  );

  await run([
    "project", "add", "test-project", "--catalog", catalogRoot, "--name", "Test Project",
    "--path", projectPath, "--provider", "antigravity",
    "--delivery-root", deliveryRoot,
  ]);

  // Preview sync (without --confirm)
  const previewResult = await run([
    "sync", sourcePath, "--project", "test-project",
    "--catalog", catalogRoot, "--registry", registryRoot,
  ]);
  assert.equal(previewResult.status, "preview");
  assert.equal(previewResult.skill.skill_name, "test-skill");

  // Confirmed sync (with --confirm)
  const syncResult = await run([
    "sync", sourcePath, "--project", "test-project", "--confirm",
    "--catalog", catalogRoot, "--registry", registryRoot,
  ]);
  assert.equal(syncResult.status, "applied");
  assert.equal(syncResult.report.status, "completed");

  const linkTarget = await fs.readlink(path.join(deliveryRoot, "test-skill"));
  assert.ok(linkTarget.includes("test-skill"));
});

test("CLI manages version freezing to skills-instances, version-pinned linking, and floating-latest project status", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "skills-catalog-cli-versions-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const packagesRoot = path.join(root, "skills-packages");
  const instancesRoot = path.join(root, "skills-instances");
  const coreGroup = path.join(packagesRoot, "core");
  const skillSource = path.join(coreGroup, "my-skill");
  const catalogRoot = path.join(root, "catalog");
  const projectPath = path.join(root, "project");
  const deliveryRoot = path.join(projectPath, ".agents", "skills");

  await fs.mkdir(skillSource, { recursive: true });
  await fs.writeFile(
    path.join(skillSource, "SKILL.md"),
    "---\nname: my-skill\ndescription: Core authoring skill.\n---\n\n# My Skill\n"
  );

  await run([
    "project", "add", "my-app", "--catalog", catalogRoot, "--name", "My App",
    "--path", projectPath, "--provider", "antigravity",
    "--delivery-root", deliveryRoot,
  ]);

  // 1. Freeze v1.0.0 into skills-instances/core/my-skill@1.0.0
  const freezeResult = await run([
    "skill", "freeze", "my-skill", "--version", "1.0.0",
    "--packages-root", packagesRoot, "--instances-root", instancesRoot,
  ]);
  assert.equal(freezeResult.frozen, true);
  assert.equal(freezeResult.version, "1.0.0");
  assert.ok(freezeResult.target_path.includes("skills-instances"));
  assert.ok(freezeResult.target_path.endsWith(path.join("core", "my-skill@1.0.0")));

  // Verify skills-packages/ remains pristine (no @ version folders created inside packages)
  const packagesEntries = await fs.readdir(coreGroup);
  assert.deepEqual(packagesEntries, ["my-skill"]);

  // 2. Link with version_pinned
  const pinResult = await run([
    "project", "link", "my-app", "my-skill", "--version", "1.0.0",
    "--catalog", catalogRoot, "--packages-root", packagesRoot, "--instances-root", instancesRoot,
  ]);
  assert.equal(pinResult.linked, true);
  assert.equal(pinResult.binding_policy, "version_pinned");
  assert.equal(pinResult.pinned_version, "1.0.0");
  assert.ok(pinResult.canonical_path.includes("skills-instances"));

  let statusResult = await run(["project", "status", "my-app", "--catalog", catalogRoot]);
  assert.equal(statusResult.skills[0].binding_policy, "version_pinned");
  assert.equal(statusResult.skills[0].pinned_version, "1.0.0");
  assert.ok(statusResult.skills[0].link_target.endsWith("my-skill@1.0.0"));

  // 3. Switch to floating_latest
  const latestResult = await run([
    "project", "link", "my-app", "my-skill", "--latest",
    "--catalog", catalogRoot, "--packages-root", packagesRoot, "--instances-root", instancesRoot,
  ]);
  assert.equal(latestResult.linked, true);
  assert.equal(latestResult.binding_policy, "floating_latest");
  assert.ok(latestResult.canonical_path.includes("skills-packages"));

  statusResult = await run(["project", "status", "my-app", "--catalog", catalogRoot]);
  assert.equal(statusResult.skills[0].binding_policy, "floating_latest");
  assert.equal(statusResult.skills[0].pinned_version, null);
  assert.ok(statusResult.skills[0].link_target.endsWith("my-skill"));
});
