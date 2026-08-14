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
  const prompt = await run(["system-prompt", "--catalog", catalogRoot, "--registry", registryRoot, "--preset", "demo-preset"]);

  assert.equal(plan.mode, "apply");
  assert.equal(plan.operations[0].desired_state, "enabled");
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

  assert.equal(profile.purpose, "Review accessibility risks.");
  assert.equal(note.project_id, "demo");
  assert.equal(found[0].lineage.id, lineageId);
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
