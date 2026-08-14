const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  createPlanFromRegistry,
  diffSkillRevisions,
  importGitSource,
  importLocalSource,
  inspectLocalSource,
  listRegistrySkills,
  listSourceUpdateCandidates,
  listSkillRevisions,
} = require("../src");

async function writeSkill(root, directory, name, description) {
  const skillRoot = path.join(root, directory);
  await fs.mkdir(path.join(skillRoot, "references"), { recursive: true });
  await fs.writeFile(path.join(skillRoot, "SKILL.md"), `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n`, "utf8");
  await fs.writeFile(path.join(skillRoot, "references", "guide.md"), `Guide for ${name}\n`, "utf8");
}

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "skills-platform-"));
  const sourcePath = path.join(root, "source");
  const registryRoot = path.join(root, "registry");
  await writeSkill(sourcePath, "frontend", "frontend-design", "Build intentional user interfaces.");
  await writeSkill(sourcePath, "testing", "test-first", "Test behaviour before implementation.");
  return { root, sourcePath, registryRoot };
}

test("imports selected local skills into immutable canonical storage", async (context) => {
  const { root, sourcePath, registryRoot } = await fixture();
  context.after(() => fs.rm(root, { recursive: true, force: true }));

  const result = await importLocalSource({
    registryRoot,
    sourcePath,
    selectedSkillNames: ["frontend-design"],
  });

  assert.equal(result.skills.length, 1);
  const [skill] = result.skills;
  assert.equal(skill.skill_name, "frontend-design");
  assert.ok(await fs.stat(path.join(skill.canonical_path, "SKILL.md")));

  await fs.writeFile(path.join(sourcePath, "frontend", "SKILL.md"), "changed upstream source", "utf8");
  assert.match(await fs.readFile(path.join(skill.canonical_path, "SKILL.md"), "utf8"), /frontend-design/);
});

test("re-importing an unchanged source reuses the source revision", async (context) => {
  const { root, sourcePath, registryRoot } = await fixture();
  context.after(() => fs.rm(root, { recursive: true, force: true }));

  const first = await importLocalSource({ registryRoot, sourcePath });
  const second = await importLocalSource({ registryRoot, sourcePath });
  const skills = await listRegistrySkills(registryRoot);

  assert.equal(first.source_revision_id, second.source_revision_id);
  assert.equal(skills.length, 2);
});

test("a changed source creates a new immutable revision and skill identity", async (context) => {
  const { root, sourcePath, registryRoot } = await fixture();
  context.after(() => fs.rm(root, { recursive: true, force: true }));

  const first = await importLocalSource({
    registryRoot,
    sourcePath,
    selectedSkillNames: ["frontend-design"],
  });
  await fs.appendFile(path.join(sourcePath, "frontend", "SKILL.md"), "\nNew reviewed content.\n", "utf8");
  const second = await importLocalSource({
    registryRoot,
    sourcePath,
    selectedSkillNames: ["frontend-design"],
  });

  assert.notEqual(first.source_revision_id, second.source_revision_id);
  assert.notEqual(first.skills[0].id, second.skills[0].id);
  assert.ok(await fs.stat(path.join(first.skills[0].canonical_path, "SKILL.md")));
});

test("inspects local sources before import and reports invalid artifacts without mutation", async (context) => {
  const { root, sourcePath } = await fixture();
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(sourcePath, "broken"), { recursive: true });
  await fs.writeFile(path.join(sourcePath, "broken", "SKILL.md"), "# Missing frontmatter\n", "utf8");

  const inspection = await inspectLocalSource({ sourcePath });

  assert.equal(inspection.importable, false);
  assert.equal(inspection.skill_count, 2);
  assert.equal(inspection.issues.length, 1);
  assert.match(inspection.issues[0].message, /Missing YAML frontmatter/);
});

test("lists immutable lineage revisions and diffs SKILL.md changes", async (context) => {
  const { root, sourcePath, registryRoot } = await fixture();
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const first = await importLocalSource({ registryRoot, sourcePath, selectedSkillNames: ["frontend-design"] });
  await fs.appendFile(path.join(sourcePath, "frontend", "SKILL.md"), "\nNew reviewed instruction.\n", "utf8");
  const second = await importLocalSource({ registryRoot, sourcePath, selectedSkillNames: ["frontend-design"] });

  const revisions = await listSkillRevisions({ registryRoot, lineageId: first.skills[0].lineage_id });
  const diff = await diffSkillRevisions({
    registryRoot,
    lineageId: first.skills[0].lineage_id,
    leftRevisionId: first.source_revision_id,
    rightRevisionId: second.source_revision_id,
  });

  assert.equal(revisions.length, 2);
  assert.equal(diff.changed, true);
  assert.ok(diff.skill_markdown.added.some((line) => line.content === "New reviewed instruction."));
});

test("imports a Git source from a resolved commit without retaining the checkout", async (context) => {
  const { root, sourcePath, registryRoot } = await fixture();
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  await new Promise((resolve, reject) => {
    require("node:child_process").execFile("git", ["init", sourcePath], (error) => error ? reject(error) : resolve());
  });
  await new Promise((resolve, reject) => {
    require("node:child_process").execFile("git", ["-C", sourcePath, "add", "."], (error) => error ? reject(error) : resolve());
  });
  await new Promise((resolve, reject) => {
    require("node:child_process").execFile("git", ["-C", sourcePath, "-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "Initial"], (error) => error ? reject(error) : resolve());
  });

  const result = await importGitSource({ registryRoot, repository: sourcePath, ref: "HEAD", selectedSkillNames: ["frontend-design"] });
  const revision = (await require("../src").getSourceRevision(registryRoot, result.source_revision_id));

  assert.equal(result.skills.length, 1);
  assert.match(revision.resolved_revision, /^[0-9a-f]{40}$/);
  assert.equal((await require("../src").listRegistrySkills(registryRoot)).length, 1);
});

test("reports newer Git commits as reviewable candidates without changing imported revisions", async (context) => {
  const { root, sourcePath, registryRoot } = await fixture();
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const runGit = (argumentsList) => new Promise((resolve, reject) => {
    require("node:child_process").execFile("git", argumentsList, (error) => error ? reject(error) : resolve());
  });
  await runGit(["init", sourcePath]);
  await runGit(["-C", sourcePath, "add", "."]);
  await runGit(["-C", sourcePath, "-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "Initial"]);
  const imported = await importGitSource({ registryRoot, repository: sourcePath });
  await fs.appendFile(path.join(sourcePath, "frontend", "SKILL.md"), "\nCandidate change.\n", "utf8");
  await runGit(["-C", sourcePath, "add", "."]);
  await runGit(["-C", sourcePath, "-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "Candidate"]);

  const candidates = await listSourceUpdateCandidates(registryRoot);

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].update_available, true);
  assert.notEqual(candidates[0].current_resolved_revision, candidates[0].candidate_resolved_revision);
  assert.equal((await require("../src").getSourceRevision(registryRoot, imported.source_revision_id)).resolved_revision, candidates[0].current_resolved_revision);
});

test("creates a link-first activation plan from pinned registry skills", async (context) => {
  const { root, sourcePath, registryRoot } = await fixture();
  context.after(() => fs.rm(root, { recursive: true, force: true }));

  const imported = await importLocalSource({ registryRoot, sourcePath });
  const plan = await createPlanFromRegistry({
    registryRoot,
    skillIds: imported.skills.map((skill) => skill.id),
    target: {
      project_id: "project_catalog",
      project_path: "C:/workspace/catalog",
      provider_id: "codex",
      scope: "project",
    },
    deliveryRoot: "C:/workspace/catalog/.agents/skills",
  });

  assert.equal(plan.distribution.method, "symlink");
  assert.equal(plan.operations.length, 2);
  assert.equal(plan.operations[0].desired_state, "enabled");
  assert.ok(plan.operations.every((operation) => operation.source_revision_id === imported.source_revision_id));
});
