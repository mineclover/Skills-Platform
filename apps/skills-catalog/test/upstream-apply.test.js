const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  applyRecordedActivationPlan,
  assignPreset,
  createPreset,
  createProject,
  createProjectPlan,
  importLocalSource,
  listActivationHistory,
  recordActivationPlan,
} = require("../src");

test("CLI apply resolves immutable upstream instances, previews, confirms, applies, and records verification", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "skills-cli-apply-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const source = path.join(root, "source", "planning");
  await fs.mkdir(source, { recursive: true });
  await fs.writeFile(path.join(source, "SKILL.md"), "---\nname: planning\ndescription: Plan.\n---\n\n# Planning\n", "utf8");
  const registryRoot = path.join(root, "registry");
  const catalogRoot = path.join(root, "catalog");
  const imported = await importLocalSource({ registryRoot, sourcePath: path.join(root, "source") });
  await createProject({ catalogRoot, id: "demo", name: "Demo", projectPath: path.join(root, "project"), providerId: "codex", deliveryRoot: path.join(root, "project", ".codex", "skills"), upstreamProjectId: "manager-demo" });
  await createPreset({ catalogRoot, registryRoot, id: "planning", name: "Planning", registrySkillIds: [imported.skills[0].id] });
  await assignPreset({ catalogRoot, projectId: "demo", presetId: "planning" });
  const plan = await createProjectPlan({ catalogRoot, registryRoot, projectId: "demo" });
  await recordActivationPlan({ catalogRoot, plan, projectId: "demo" });
  const calls = [];
  const upstreamCli = {
    execute: async (args) => {
      calls.push(args);
      if (args[0] === "inspect") return { skills: [{ name: "planning", instance_id: "project:manager-demo:planning", project_id: "manager-demo", scope: "project", path: plan.operations[0].canonical_path }] };
      if (args[0] === "skill" && args[1] === "preview") return { requires_confirmation: false, impacts: [] };
      if (args[0] === "skill" && args[1] === "enable") return { applied_count: 1, skipped_count: 0, failed_count: 0 };
      if (args[0] === "providers") return { providers: [] };
      if (args[0] === "bindings") return [];
      throw new Error(`Unexpected CLI command: ${args.join(" ")}`);
    },
  };

  const pending = await applyRecordedActivationPlan({ catalogRoot, planId: plan.plan_id, upstreamCli });
  assert.equal(pending.status, "confirmation_required");
  assert.equal(calls.some((args) => args[0] === "skill" && args[1] === "enable"), false);

  const progress = [];
  const completed = await applyRecordedActivationPlan({ catalogRoot, planId: plan.plan_id, confirmed: true, upstreamCli, onProgress: (event) => progress.push(event) });
  assert.equal(completed.status, "completed");
  assert.equal(completed.report.transport, "skills-manager-cli");
  assert.equal(completed.report.summary.applied, 1);
  assert.ok(progress.some((event) => event.stage === "resolve"));
  assert.ok(progress.some((event) => event.stage === "preview"));
  assert.equal(progress.at(-1).stage, "completed");
  assert.deepEqual(calls.find((args) => args[0] === "skill" && args[1] === "enable"), ["skill", "enable", "--id", "project:manager-demo:planning", "--tool", "codex", "--project", "manager-demo"]);
  assert.equal((await listActivationHistory({ catalogRoot, projectId: "demo" }))[0].reports.length, 1);

  const failed = await applyRecordedActivationPlan({
    catalogRoot,
    planId: plan.plan_id,
    confirmed: true,
    upstreamCli: {
      execute: async (args) => {
        if (args[0] === "inspect") return { skills: [{ name: "planning", instance_id: "project:manager-demo:planning", project_id: "manager-demo", scope: "project", path: plan.operations[0].canonical_path }] };
        if (args[0] === "skill" && args[1] === "preview") return { requires_confirmation: false, impacts: [] };
        if (args[0] === "skill" && args[1] === "enable") throw new Error("upstream write failed");
        if (args[0] === "providers") return { providers: [] };
        if (args[0] === "bindings") return [];
        throw new Error(`Unexpected CLI command: ${args.join(" ")}`);
      },
    },
  });
  assert.equal(failed.status, "failed");
  assert.equal(failed.report.status, "failed");
  assert.equal(failed.report.summary.failed, 1);
  assert.match(failed.error, /upstream write failed/);
  assert.equal((await listActivationHistory({ catalogRoot, projectId: "demo" }))[0].reports.length, 2);
});
