const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { importLocalSource } = require("../src/registry");
const { createPlanFromRegistry } = require("../src/activation-plans");

async function fixture(context, { name = "name: demo\n", description = "Antigravity-ready skill." } = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "antigravity-skill-preflight-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const sourcePath = path.join(root, "source", "demo");
  const registryRoot = path.join(root, "registry");
  const projectPath = path.join(root, "project");
  await fs.mkdir(sourcePath, { recursive: true });
  const descriptionLine = description === null ? "" : `description: ${description}\n`;
  await fs.writeFile(
    path.join(sourcePath, "SKILL.md"),
    `---\n${name}${descriptionLine}---\n\n# Demo\n`,
    "utf8",
  );
  const imported = await importLocalSource({ registryRoot, sourcePath: path.dirname(sourcePath) });
  return { imported, projectPath, registryRoot };
}

function projectPlan(item, deliveryRoot, providerId = "antigravity") {
  return createPlanFromRegistry({
    registryRoot: item.registryRoot,
    skillIds: [item.imported.skills[0].id],
    target: {
      provider_id: providerId,
      scope: "project",
      project_id: "demo",
      project_path: item.projectPath,
    },
    deliveryRoot,
  });
}

test("Antigravity preflight accepts preferred and legacy workspace roots", async (context) => {
  const item = await fixture(context);
  for (const [providerId, rootName] of [["antigravity", ".agents"], ["agy", ".agent"]]) {
    const plan = await projectPlan(
      item,
      path.join(item.projectPath, rootName, "skills"),
      providerId,
    );
    assert.equal(plan.operations.length, 1);
  }
});

test("Antigravity preflight accepts a missing name but requires description and official root", async (context) => {
  const nameOptional = await fixture(context, { name: "" });
  const plan = await projectPlan(nameOptional, path.join(nameOptional.projectPath, ".agents", "skills"));
  assert.equal(plan.operations[0].skill_name, "demo");

  const missingDescription = await fixture(context, { description: null });
  await assert.rejects(
    () => projectPlan(missingDescription, path.join(missingDescription.projectPath, ".agents", "skills")),
    /non-empty frontmatter description/,
  );

  await assert.rejects(
    () => projectPlan(nameOptional, path.join(nameOptional.projectPath, "skills")),
    /Antigravity delivery root must be/,
  );
});

test("Antigravity global preflight uses the provider-specific Gemini config root", async (context) => {
  const item = await fixture(context);
  const plan = await createPlanFromRegistry({
    registryRoot: item.registryRoot,
    skillIds: [item.imported.skills[0].id],
    target: { provider_id: "antigravity", scope: "global" },
    deliveryRoot: path.join(os.homedir(), ".gemini", "config", "skills"),
  });
  assert.equal(plan.operations.length, 1);
  await assert.rejects(
    () => createPlanFromRegistry({
      registryRoot: item.registryRoot,
      skillIds: [item.imported.skills[0].id],
      target: { provider_id: "antigravity", scope: "global" },
      deliveryRoot: path.join(os.homedir(), ".agents", "skills"),
    }),
    /Antigravity delivery root must be/,
  );
});
