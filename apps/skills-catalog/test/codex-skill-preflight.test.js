const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { importLocalSource } = require("../src/registry");
const { createPlanFromRegistry } = require("../src/activation-plans");

async function fixture(context, manifestName = "SKILL.md", description = "Codex-ready skill.") {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "codex-skill-preflight-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const sourcePath = path.join(root, "source", "demo");
  const registryRoot = path.join(root, "registry");
  const projectPath = path.join(root, "project");
  await fs.mkdir(sourcePath, { recursive: true });
  const descriptionLine = description === null ? "" : `description: ${description}\n`;
  await fs.writeFile(
    path.join(sourcePath, manifestName),
    `---\nname: demo\n${descriptionLine}---\n\n# Demo\n`,
    "utf8",
  );
  const imported = await importLocalSource({ registryRoot, sourcePath: path.dirname(sourcePath) });
  return { imported, projectPath, registryRoot, root };
}

function planOptions(item, overrides = {}) {
  return {
    registryRoot: item.registryRoot,
    skillIds: [item.imported.skills[0].id],
    target: {
      provider_id: "codex",
      scope: "project",
      project_id: "demo",
      project_path: item.projectPath,
    },
    deliveryRoot: path.join(item.projectPath, ".agents", "skills"),
    ...overrides,
  };
}

test("Codex skill preflight accepts the official repository root and exact SKILL.md", async (context) => {
  const item = await fixture(context);
  const plan = await createPlanFromRegistry(planOptions(item));
  assert.equal(plan.operations.length, 1);
  assert.equal(
    plan.operations[0].delivery_path,
    path.join(item.projectPath, ".agents", "skills", "demo"),
  );
});

test("Codex skill preflight rejects a non-discovery delivery root", async (context) => {
  const item = await fixture(context);
  await assert.rejects(
    () => createPlanFromRegistry(planOptions(item, {
      deliveryRoot: path.join(item.projectPath, "skills"),
    })),
    /Codex delivery root must be/,
  );
});

test("Codex skill preflight rejects wrong-case manifest and missing description", async (context) => {
  const wrongCase = await fixture(context, "skill.md");
  assert.equal(wrongCase.imported.skills[0].provider_compatibility.codex, false);
  assert.equal(wrongCase.imported.skills[0].provider_compatibility.antigravity, false);
  await assert.rejects(
    () => createPlanFromRegistry(planOptions(wrongCase)),
    /exact-case SKILL\.md/,
  );

  const missingDescription = await fixture(context, "SKILL.md", null);
  assert.equal(missingDescription.imported.skills[0].provider_compatibility.codex, false);
  assert.equal(missingDescription.imported.skills[0].provider_compatibility.antigravity, false);
  await assert.rejects(
    () => createPlanFromRegistry(planOptions(missingDescription)),
    /non-empty frontmatter description/,
  );
});

test("Codex skill preflight rejects non-skill artifacts from the skills discovery root", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "codex-non-skill-preflight-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const sourcePath = path.join(root, "source", "guard");
  const registryRoot = path.join(root, "registry");
  const projectPath = path.join(root, "project");
  await fs.mkdir(sourcePath, { recursive: true });
  await fs.writeFile(
    path.join(sourcePath, "HOOK.md"),
    "---\nname: guard\ndescription: Guard hook.\nartifact_type: hook\n---\n",
    "utf8",
  );
  const imported = await importLocalSource({ registryRoot, sourcePath: path.dirname(sourcePath) });
  await assert.rejects(
    () => createPlanFromRegistry({
      registryRoot,
      skillIds: [imported.skills[0].id],
      target: {
        provider_id: "codex",
        scope: "project",
        project_id: "demo",
        project_path: projectPath,
      },
      deliveryRoot: path.join(projectPath, ".agents", "skills"),
    }),
    /accepts only skill artifacts/,
  );
});
