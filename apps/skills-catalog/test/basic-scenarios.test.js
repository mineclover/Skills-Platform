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

async function request(base, pathname, body) {
  const response = await fetch(`${base}${pathname}`, body === undefined ? undefined : {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { response, body: await response.json() };
}

test("basic scenario: select, confirm, apply, return to Pristine, and reject an unadopted upstream skill", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "skills-basic-scenario-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const sourcePath = path.join(root, "source", "planning");
  await fs.mkdir(sourcePath, { recursive: true });
  await fs.writeFile(path.join(sourcePath, "SKILL.md"), "---\nname: planning\ndescription: Plan with constraints.\n---\n\n# Planning\n", "utf8");
  const catalogRoot = path.join(root, "catalog");
  const registryRoot = path.join(root, "registry");
  const imported = await importLocalSource({ registryRoot, sourcePath: path.dirname(sourcePath) });
  await createProject({
    catalogRoot,
    id: "demo",
    name: "Demo",
    projectPath: path.join(root, "project"),
    providerId: "codex",
    deliveryRoot: path.join(root, "project", ".agents", "skills"),
    upstreamProjectId: "manager-demo",
  });
  const preset = await createPreset({
    catalogRoot,
    registryRoot,
    id: "planning",
    name: "Planning",
    registrySkillIds: [imported.skills[0].id],
  });
  await assignPreset({ catalogRoot, projectId: "demo", presetId: preset.id });

  const calls = [];
  let canonicalPath = null;
  let upstreamSkillAvailable = true;
  let upstreamEnabled = false;
  const upstreamCli = {
    execute: async (args) => {
      calls.push(args);
      if (args[0] === "inspect") {
        return { skills: upstreamSkillAvailable ? [{
          name: "planning",
          instance_id: "project:manager-demo:planning",
          project_id: "manager-demo",
          scope: "project",
          path: canonicalPath,
        }] : [] };
      }
      if (args[0] === "skill" && args[1] === "preview") return { requires_confirmation: false, impacts: [] };
      if (args[0] === "skill" && (args[1] === "enable" || args[1] === "disable")) {
        upstreamEnabled = args[1] === "enable";
        return { applied_count: 1, skipped_count: 0, failed_count: 0 };
      }
      if (args[0] === "providers") return { providers: [{ provider_id: "codex", detected: true, reachable: true }] };
      if (args[0] === "bindings") return upstreamSkillAvailable ? [{
        skill_instance_id: "project:manager-demo:planning",
        provider_id: "codex",
        state: upstreamEnabled ? "enabled" : "disabled",
      }] : [];
      throw new Error(`Unexpected CLI command: ${args.join(" ")}`);
    },
  };
  const server = createCatalogServer({ catalogRoot, registryRoot, upstreamCli });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}/api`;

  const prompt = await request(base, "/projects/demo/system-prompt?include_notes=true");
  assert.match(prompt.body.content, /# Planning/);

  canonicalPath = imported.skills[0].canonical_path;
  const recorded = await request(base, "/projects/demo/activation-plan/preview", { preflight: true });
  assert.equal(recorded.body.preflight.status, "confirmation_required");
  assert.equal(recorded.body.preflight.plan_id, recorded.body.plan.plan_id);
  canonicalPath = recorded.body.plan.operations[0].canonical_path;
  const pending = await request(base, `/activation-plans/${recorded.body.plan.plan_id}/apply`, {});
  assert.equal(pending.response.status, 409);
  assert.equal(pending.body.status, "confirmation_required");
  assert.equal(calls.some((args) => args[0] === "skill" && args[1] === "enable"), false);

  const streamResponse = await fetch(`${base}/activation-plans/${recorded.body.plan.plan_id}/apply/stream`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ confirmed: true }),
  });
  const stream = (await streamResponse.text()).trim().split("\n").map((line) => JSON.parse(line));
  const applied = stream.find((event) => event.type === "result").result;
  assert.equal(streamResponse.status, 200);
  assert.ok(stream.some((event) => event.type === "progress" && event.progress.stage === "preview"));
  assert.ok(stream.some((event) => event.type === "progress" && event.progress.stage === "verify"));
  assert.equal(applied.status, "completed");
  assert.equal(applied.report.summary.applied, 1);
  assert.deepEqual(calls.find((args) => args[0] === "skill" && args[1] === "enable"), ["skill", "enable", "--id", "project:manager-demo:planning", "--tool", "codex", "--project", "manager-demo"]);
  const history = await request(base, "/projects/demo/history");
  assert.equal(history.body.history[0].reports.length, 1);

  const pristine = await request(base, "/projects/demo/default-preset", { preset_id: "builtin-pristine" });
  assert.equal(pristine.body.assignment.preset_id, "builtin-pristine");
  calls.length = 0;
  const pristinePlan = await request(base, "/projects/demo/activation-plan", {});
  canonicalPath = pristinePlan.body.plan.operations[0].canonical_path;
  const disabled = await request(base, `/activation-plans/${pristinePlan.body.plan.plan_id}/apply`, { confirmed: true });
  assert.equal(disabled.body.status, "completed");
  assert.deepEqual(calls.find((args) => args[0] === "skill" && args[1] === "disable"), ["skill", "disable", "--id", "project:manager-demo:planning", "--tool", "codex", "--project", "manager-demo"]);

  await request(base, "/projects/demo/default-preset", { preset_id: "planning" });
  calls.length = 0;
  const unavailablePlan = await request(base, "/projects/demo/activation-plan", {});
  canonicalPath = unavailablePlan.body.plan.operations[0].canonical_path;
  upstreamSkillAvailable = false;
  const rejected = await request(base, `/activation-plans/${unavailablePlan.body.plan.plan_id}/apply`, { confirmed: true });
  assert.equal(rejected.response.status, 400);
  assert.match(rejected.body.error, /No upstream Skills Manager instance matches/);
  assert.equal(calls.some((args) => args[0] === "skill" && (args[1] === "enable" || args[1] === "disable")), false);
});
