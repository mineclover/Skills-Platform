const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  assignPreset,
  createCatalogServer,
  createPreset,
  createProject,
  importLocalSource,
} = require("../src");

async function setup(context) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "skills-catalog-server-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const sourcePath = path.join(root, "source", "planning");
  await fs.mkdir(sourcePath, { recursive: true });
  await fs.writeFile(path.join(sourcePath, "SKILL.md"), "---\nname: planning\ndescription: Plan safely.\n---\n\n# Planning\n", "utf8");
  const registryRoot = path.join(root, "registry");
  const catalogRoot = path.join(root, "catalog");
  const imported = await importLocalSource({ registryRoot, sourcePath: path.join(root, "source") });
  const project = await createProject({
    catalogRoot,
    id: "demo",
    name: "Demo",
    projectPath: path.join(root, "project"),
    providerId: "codex",
    deliveryRoot: path.join(root, "project", ".agents", "skills"),
  });
  const preset = await createPreset({
    catalogRoot,
    registryRoot,
    id: "planning",
    name: "Planning",
    registrySkillIds: [imported.skills[0].id],
  });
  await assignPreset({ catalogRoot, projectId: project.id, presetId: preset.id });
  return { catalogRoot, registryRoot, imported };
}

test("catalog bridge exposes projects, effective set, history, and read-only plan preview", async (context) => {
  const { catalogRoot, registryRoot, imported } = await setup(context);
  const server = createCatalogServer({ catalogRoot, registryRoot });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => server.close());
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}/api`;

  const projects = await (await fetch(`${base}/projects`)).json();
  const effective = await (await fetch(`${base}/projects/demo/effective-set`)).json();
  const preview = await (await fetch(`${base}/projects/demo/activation-plan/preview`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ work_scope_tags: ["implementation"] }),
  })).json();
  const history = await (await fetch(`${base}/projects/demo/history`)).json();

  assert.equal(projects.projects[0].id, "demo");
  assert.equal(effective.skills[0].skill_name, "planning");
  assert.equal(preview.plan.operations[0].registry_skill_id, imported.skills[0].id);
  assert.equal(preview.plan.operations[0].skill_name, "planning");
  assert.deepEqual(history.history, []);

  const createdFeedback = await (await fetch(`${base}/skills/${imported.skills[0].lineage_id}/feedback`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      scope: "project",
      project_id: "demo",
      outcome: "success",
      evidence_type: "evaluation",
      summary: "Planning output covered the expected constraints.",
      metrics: { attempted: 1, successful: 1 },
    }),
  })).json();
  const feedbackSummary = await (await fetch(`${base}/skills/${imported.skills[0].lineage_id}/feedback-summary`)).json();
  assert.equal(createdFeedback.feedback.outcome, "success");
  assert.equal(feedbackSummary.reported_metrics.successful, 1);

  const recorded = await (await fetch(`${base}/projects/demo/activation-plan`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  })).json();
  const report = await (await fetch(`${base}/activation-plans/${recorded.plan.plan_id}/report`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      plan_id: recorded.plan.plan_id,
      completed_at: "2026-08-14T00:00:00.000Z",
      operations: [],
      summary: { applied: 1 },
    }),
  })).json();
  const updatedHistory = await (await fetch(`${base}/projects/demo/history`)).json();
  assert.equal(report.report.plan_id, recorded.plan.plan_id);
  assert.equal(updatedHistory.history[0].reports.length, 1);
});
