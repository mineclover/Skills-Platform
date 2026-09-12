const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createActivationPlan, digestDirectory } = require("@skills-platform/contracts");
const { applyActivationPlan, applyActivationPlanEvents } = require("../src");

async function fixture(context, names = ["demo"]) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "skills-adapter-policy-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const projectPath = path.join(root, "project");
  const codexConfigPath = path.join(root, "codex-home", "config.toml");
  const operations = [];
  for (const name of names) {
    const canonicalPath = path.join(root, "registry", "revisions", "revision_demo", "artifacts", name);
    await fs.mkdir(canonicalPath, { recursive: true });
    await fs.writeFile(path.join(canonicalPath, "SKILL.md"), `---\nname: ${name}\ndescription: Demo.\n---\n`);
    operations.push({
      registry_skill_id: `skill_${name}`,
      skill_name: name,
      source_revision_id: "revision_demo",
      content_digest: await digestDirectory(canonicalPath),
      canonical_path: canonicalPath,
      delivery_path: path.join(projectPath, ".agents", "skills", name),
      desired_state: "enabled",
    });
  }
  const plan = createActivationPlan({
    target: { provider_id: "codex", scope: "project", project_id: "demo", project_path: projectPath },
    distribution: { method: "symlink" },
    operations,
  });
  return { plan, codexConfigPath };
}

test("a policy rejection after preview returns a failed report without delivery or config writes", async (context) => {
  const { plan, codexConfigPath } = await fixture(context);
  let permitted = true;
  let checks = 0;
  const events = applyActivationPlanEvents(plan, {
    confirm: true,
    codexConfigPath,
    async beforeOperation(operation) {
      checks += 1;
      assert.equal(operation.registry_skill_id, "skill_demo");
      await Promise.resolve();
      if (!permitted) throw new Error("Review policy now blocks this skill");
    },
  });
  const preview = await events.next();
  assert.equal(preview.value.type, "preview");
  assert.equal(preview.value.preview.valid, true);
  assert.equal(checks, 0);
  permitted = false;

  let report;
  for await (const event of events) {
    if (event.type === "complete") report = event.report;
  }
  assert.equal(checks, 1);
  assert.equal(report.status, "failed");
  assert.equal(report.state_unchanged, true);
  assert.equal(report.summary.failed, 1);
  assert.equal(report.summary.applied, 0);
  assert.match(report.error, /Review policy now blocks/);
  await assert.rejects(() => fs.lstat(plan.operations[0].delivery_path), { code: "ENOENT" });
  await assert.rejects(() => fs.lstat(codexConfigPath), { code: "ENOENT" });
});

test("awaits beforeOperation before enabled, noop, and disabled operations", async (context) => {
  const { plan, codexConfigPath } = await fixture(context);
  const deliveryPath = plan.operations[0].delivery_path;
  const calls = [];
  const options = {
    confirm: true,
    codexConfigPath,
    async beforeOperation(operation) {
      const deliveryExists = await fs.lstat(deliveryPath).then(() => true, () => false);
      calls.push({ state: operation.desired_state, deliveryExists });
      if (calls.length === 1) await assert.rejects(() => fs.lstat(codexConfigPath), { code: "ENOENT" });
    },
  };
  assert.equal((await applyActivationPlan(plan, options)).status, "completed");
  assert.equal((await applyActivationPlan(plan, options)).summary.skipped, 1);
  const disabledPlan = createActivationPlan({
    mode: "pristine",
    target: plan.target,
    operations: [{ ...plan.operations[0], desired_state: "disabled" }],
  });
  assert.equal((await applyActivationPlan(disabledPlan, options)).status, "completed");
  assert.deepEqual(calls, [
    { state: "enabled", deliveryExists: false },
    { state: "enabled", deliveryExists: true },
    { state: "disabled", deliveryExists: true },
  ]);
  await assert.rejects(() => fs.lstat(deliveryPath), { code: "ENOENT" });
});

test("a later callback rejection rolls back prior writes and leaves pending operations unattempted", async (context) => {
  const { plan, codexConfigPath } = await fixture(context, ["first", "second", "third"]);
  const calls = [];
  const report = await applyActivationPlan(plan, {
    confirm: true,
    codexConfigPath,
    async beforeOperation(operation) {
      calls.push(operation.skill_name);
      if (operation.skill_name === "second") {
        assert.equal((await fs.lstat(plan.operations[0].delivery_path)).isSymbolicLink(), true);
        throw new Error("Review policy changed");
      }
    },
  });
  assert.deepEqual(calls, ["first", "second"]);
  assert.equal(report.status, "failed");
  assert.equal(report.rolled_back, true);
  assert.equal(report.state_unchanged, true);
  assert.equal(report.summary.rolled_back, 1);
  assert.equal(report.summary.failed, 1);
  assert.equal(report.summary.not_attempted, 1);
  for (const operation of plan.operations) {
    await assert.rejects(() => fs.lstat(operation.delivery_path), { code: "ENOENT" });
  }
  await assert.rejects(() => fs.lstat(codexConfigPath), { code: "ENOENT" });
});
