const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createActivationPlan, digestDirectory } = require("../../skill-contracts/src");
const { applyActivationPlan, applyActivationPlanEvents, previewActivationPlan } = require("../src");

async function fixture(context, desiredState = "enabled") {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "skills-manager-adapter-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const canonicalPath = path.join(root, "registry", "revisions", "revision_demo", "artifacts", "demo");
  const deliveryPath = path.join(root, "project", ".agents", "skills", "demo");
  await fs.mkdir(canonicalPath, { recursive: true });
  await fs.writeFile(path.join(canonicalPath, "SKILL.md"), "---\nname: demo\ndescription: Demo.\n---\n");
  const plan = createActivationPlan({
    mode: desiredState === "disabled" ? "pristine" : "apply",
    target: { provider_id: "codex", scope: "global" },
    operations: [{
      registry_skill_id: "skill_demo",
      source_revision_id: "revision_demo",
      content_digest: await digestDirectory(canonicalPath),
      canonical_path: canonicalPath,
      delivery_path: deliveryPath,
      desired_state: desiredState,
    }],
  });
  return { canonicalPath, deliveryPath, plan };
}

test("previews and materializes a verified symbolic link only after confirmation", async (context) => {
  const { canonicalPath, deliveryPath, plan } = await fixture(context);
  const preview = await previewActivationPlan(plan);
  assert.equal(preview.valid, true);
  assert.equal(preview.operations[0].status, "create");
  await assert.rejects(() => applyActivationPlan(plan), /Explicit confirmation/);

  const report = await applyActivationPlan(plan, { confirm: true });
  assert.equal(report.summary.applied, 1);
  assert.equal((await fs.lstat(deliveryPath)).isSymbolicLink(), true);
  assert.equal(path.resolve(await fs.realpath(deliveryPath)), path.resolve(canonicalPath));
  assert.equal((await previewActivationPlan(plan)).operations[0].status, "noop");
});

test("removes only a managed delivery link for the pristine plan", async (context) => {
  const enabled = await fixture(context);
  await applyActivationPlan(enabled.plan, { confirm: true });
  const disabledPlan = createActivationPlan({
    mode: "pristine",
    target: enabled.plan.target,
    operations: [{ ...enabled.plan.operations[0], desired_state: "disabled" }],
  });

  const preview = await previewActivationPlan(disabledPlan);
  assert.equal(preview.operations[0].status, "remove");
  await applyActivationPlan(disabledPlan, { confirm: true });
  await assert.rejects(() => fs.lstat(enabled.deliveryPath), { code: "ENOENT" });
});

test("never overwrites an unmanaged directory at a delivery path", async (context) => {
  const { deliveryPath, plan } = await fixture(context);
  await fs.mkdir(deliveryPath, { recursive: true });
  const preview = await previewActivationPlan(plan);
  assert.equal(preview.valid, false);
  assert.equal(preview.operations[0].status, "conflict");
  await assert.rejects(() => applyActivationPlan(plan, { confirm: true }), /cannot be applied/);
});

test("streams preview, per-operation progress, and the persisted final report", async (context) => {
  const { plan } = await fixture(context);
  const events = [];
  for await (const event of applyActivationPlanEvents(plan, { confirm: true })) events.push(event);

  assert.deepEqual(events.map((event) => event.type), ["preview", "operation", "complete"]);
  assert.equal(events[1].processed_count, 1);
  assert.equal(events[1].total_count, 1);
  assert.equal(events[2].report.summary.applied, 1);
});
