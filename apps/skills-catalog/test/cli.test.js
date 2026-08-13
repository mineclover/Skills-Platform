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
