const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const test = require("node:test");
const api = require("../src");

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function fixture(context) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "activation-concurrency-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const sourcePath = path.join(root, "source");
  await fs.mkdir(sourcePath);
  await fs.writeFile(path.join(sourcePath, "SKILL.md"), "---\nname: sample\ndescription: Serialized delivery fixture.\n---\n# Sample\n");
  const args = { catalogRoot: path.join(root, "catalog"), registryRoot: path.join(root, "registry"), projectId: "demo" };
  const { skills } = await api.importLocalSource({ registryRoot: args.registryRoot, sourcePath });
  const project = await api.createProject({ ...args, id: args.projectId, name: "Demo", projectPath: path.join(root, "project"), providerId: "codex" });
  await api.createPreset({ ...args, id: "base", name: "Base", registrySkillIds: [skills[0].id] });
  await api.assignPreset({ ...args, presetId: "base" });
  const plans = [await api.createProjectPlan(args), await api.createProjectPlan(args)];
  for (const plan of plans) await api.recordActivationPlan({ ...args, plan });
  return { root, args, plans, project, skill: skills[0] };
}

function report(plan) {
  return { plan_id: plan.plan_id, status: "completed", operations: plan.operations.map((operation) => ({ operation, applied: true })), summary: { requested: plan.operations.length, applied: plan.operations.length, skipped: 0, failed: 0 } };
}

function upstream(operation, write, projectId = "demo") {
  return { execute: async (args) => {
    if (args[0] === "inspect") return { skills: [{ name: operation.skill_name, instance_id: "sample-instance", project_id: projectId, scope: "project", path: operation.canonical_path }] };
    if (args[1] === "preview") return { requires_confirmation: false, impacts: [] };
    if (args[1] === "enable") { await write(); return { applied_count: 1, skipped_count: 0, failed_count: 0 }; }
    if (args[0] === "providers") return { providers: [] };
    if (args[0] === "bindings") return [{ skill_instance_id: "sample-instance", provider_id: "codex", state: "enabled", target_path: operation.delivery_path, content_digest: operation.content_digest, source_revision_id: operation.source_revision_id }];
    throw new Error(`Unexpected command: ${args.join(" ")}`);
  } };
}

function writeCounter() {
  let active = 0;
  let peak = 0;
  let count = 0;
  return {
    write: async () => { active += 1; count += 1; peak = Math.max(peak, active); await delay(30); active -= 1; },
    result: () => ({ peak, count }),
  };
}

test("different recorded plans for one project serialize bridge delivery and retain both reports", async (context) => {
  const f = await fixture(context);
  const counter = writeCounter();
  const upstreamCli = upstream(f.plans[0].operations[0], counter.write);
  const results = await Promise.all(f.plans.map((plan) => api.applyRecordedActivationPlan({ ...f.args, planId: plan.plan_id, confirmed: true, upstreamCli })));
  assert.ok(results.every((result) => result.status === "completed"));
  assert.deepEqual(counter.result(), { peak: 1, count: 2 });
  assert.equal((await api.listActivationHistory(f.args)).reduce((count, item) => count + item.reports.length, 0), 2);
});

test("reference and bridge transports share their delivery lock and release it on failure", async (context) => {
  const f = await fixture(context);
  const counter = writeCounter();
  const adapter = { applyActivationPlan: async (plan, options) => {
    await options.beforeOperation(plan.operations[0]);
    await counter.write();
    return report(plan);
  } };
  const results = await Promise.all([
    api.applyRecordedCatalogPlan({ ...f.args, planId: f.plans[0].plan_id, confirmed: true, adapter }),
    api.applyRecordedActivationPlan({ ...f.args, planId: f.plans[1].plan_id, confirmed: true, upstreamCli: upstream(f.plans[1].operations[0], counter.write) }),
  ]);
  assert.ok(results.every((result) => result.status === "completed"));
  assert.deepEqual(counter.result(), { peak: 1, count: 2 });
  await assert.rejects(api.applyCatalogActivationPlan({ ...f.args, plan: f.plans[0], adapter: { applyActivationPlan: async () => { throw new Error("Transport stopped"); } } }), /Transport stopped/);
  const retry = await api.applyRecordedActivationPlan({ ...f.args, planId: f.plans[1].plan_id, confirmed: true, upstreamCli: upstream(f.plans[1].operations[0], counter.write) });
  assert.equal(retry.status, "completed");
});

test("different Catalogs and project symlink aliases use the same physical delivery lock", async (context) => {
  const f = await fixture(context);
  await fs.mkdir(f.project.project_path, { recursive: true });
  const aliasPath = path.join(f.root, "alias");
  await fs.symlink(f.project.project_path, aliasPath, process.platform === "win32" ? "junction" : "dir");
  const aliasArgs = { ...f.args, catalogRoot: path.join(f.root, "alias-catalog"), projectId: "alias" };
  await api.createProject({ ...aliasArgs, id: "alias", name: "Alias", projectPath: aliasPath, providerId: "codex" });
  await api.createPreset({ ...aliasArgs, id: "base", name: "Base", registrySkillIds: [f.skill.id] });
  await api.assignPreset({ ...aliasArgs, presetId: "base" });
  const aliasPlan = await api.createProjectPlan(aliasArgs);
  const counter = writeCounter();
  const adapter = { applyActivationPlan: async (plan) => { await counter.write(); return report(plan); } };
  await Promise.all([
    api.applyCatalogActivationPlan({ ...f.args, plan: f.plans[0], adapter }),
    api.applyCatalogActivationPlan({ ...aliasArgs, plan: aliasPlan, adapter }),
  ]);
  assert.deepEqual(counter.result(), { peak: 1, count: 2 });
});

test("separate Node processes serialize repeated recorded applies and retain every report", { timeout: 20000 }, async (context) => {
  const f = await fixture(context);
  const modulePath = path.resolve(__dirname, "../src");
  const marker = path.join(f.root, "exclusive-write");
  const code = `
    const fs = require('node:fs/promises');
    const api = require(${JSON.stringify(modulePath)});
    process.send({ ready: true });
    process.on('message', async (args) => {
      try {
        const adapter = { applyActivationPlan: async (plan, options) => {
          await options.beforeOperation(plan.operations[0]);
          const handle = await fs.open(args.marker, 'wx');
          try { await new Promise(resolve => setTimeout(resolve, 20)); }
          finally { await handle.close(); await fs.unlink(args.marker); }
          return { plan_id: plan.plan_id, status: 'completed', operations: [], summary: { requested: 1, applied: 1, skipped: 0, failed: 0 } };
        } };
        const result = await api.applyRecordedCatalogPlan({ ...args, confirmed: true, adapter });
        process.send({ status: result.status });
      } catch (error) { process.send({ error: error.message }); }
      process.disconnect();
    });`;
  const children = Array.from({ length: 4 }, () => {
    const child = spawn(process.execPath, ["-e", code], { stdio: ["ignore", "ignore", "pipe", "ipc"] });
    context.after(() => { if (child.exitCode === null) child.kill(); });
    let readyResolve;
    let doneResolve;
    let reject;
    const ready = new Promise((resolve) => { readyResolve = resolve; });
    const done = new Promise((resolve, fail) => { doneResolve = resolve; reject = fail; });
    child.on("error", reject);
    child.on("message", (message) => {
      if (message.ready) readyResolve();
      else if (message.error) reject(new Error(message.error));
      else doneResolve(message);
    });
    return { child, ready, done };
  });
  await Promise.all(children.map((item) => item.ready));
  for (const { child } of children) child.send({ ...f.args, planId: f.plans[0].plan_id, marker });
  const results = await Promise.all(children.map((item) => item.done));
  assert.ok(results.every((result) => result.status === "completed"));
  const record = (await api.listActivationHistory({ ...f.args, planId: f.plans[0].plan_id }))[0];
  assert.equal(record.reports.length, 4);
  await assert.rejects(fs.access(marker), { code: "ENOENT" });
});
