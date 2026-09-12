const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { run } = require("../src/cli");
const { applyRecordedActivationPlan } = require("../src/upstream-apply");

test("shared-root acknowledgement creates a new immutable plan and is forwarded only after review", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "shared-root-plan-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const source = path.join(root, "source");
  await fs.mkdir(source);
  await fs.writeFile(path.join(source, "SKILL.md"), "---\nname: shared-guide\ndescription: Shared project guide.\n---\n# Guide\n");
  const catalogRoot = path.join(root, "catalog");
  const registryRoot = path.join(root, "registry");
  const common = ["--catalog", catalogRoot, "--registry", registryRoot];
  const imported = await run(["import-local", source, ...common]);
  await run(["project", "add", "demo", "--name", "Demo", "--path", path.join(root, "project"), "--provider", "codex", ...common]);
  await run(["preset", "create", "base", "--name", "Base", "--skill", imported.skills[0].id, ...common]);
  await run(["preset", "assign", "demo", "base", ...common]);
  const original = await run(["history", "record-plan", "demo", "--enabled-only", ...common]);
  assert.equal(original.plan.distribution.shared_root_confirmation, false);
  await assert.rejects(run(["history", "apply", original.plan_id, "--confirm-shared-root", ...common]), /new plan/);
  const acknowledged = await run(["history", "record-plan", "demo", "--enabled-only", "--confirm-shared-root", ...common]);
  assert.notEqual(acknowledged.plan_id, original.plan_id);
  assert.equal(acknowledged.plan.distribution.shared_root_confirmation, true);
  assert.deepEqual(acknowledged.plan.operations, original.plan.operations);
  const operation = original.plan.operations[0];
  const calls = [];
  const upstreamCli = { execute: async (args) => {
    calls.push(args);
    if (args[0] === "inspect") return { skills: [{ name: operation.skill_name, instance_id: "project:demo:guide", scope: "project", project_id: "demo", path: operation.canonical_path }] };
    if (args[0] === "skill" && args[1] === "preview") return {
      requires_confirmation: true,
      target_root: path.dirname(operation.delivery_path),
      impacts: [
        ...["codex", "vercel-skills"].map(provider_id => ({ provider_id, root_path: path.dirname(operation.delivery_path), shared: true })),
        { provider_id: "codex", root_path: path.join(root, "dependent-project", ".agents", "skills"), shared: true, reason: "Indirect source dependency" },
      ],
    };
    if (args[0] === "skill" && args[1] === "enable") return { applied_count: 1, skipped_count: 0, failed_count: 0 };
    if (args[0] === "providers") return { providers: [] };
    if (args[0] === "bindings") return [{ skill_instance_id: "project:demo:guide", provider_id: "codex", state: "enabled", target_path: operation.delivery_path }];
    throw new Error(`Unexpected command ${args.join(" ")}`);
  } };
  const options = { catalogRoot, registryRoot, upstreamCli };
  const preview = await applyRecordedActivationPlan({ ...options, planId: original.plan_id });
  assert.equal(preview.requires_shared_confirmation, true);
  await assert.rejects(applyRecordedActivationPlan({ ...options, planId: original.plan_id, confirmed: true }), /shared-root confirmation/);
  assert.equal(calls.some(args => args[1] === "enable"), false);
  const report = await applyRecordedActivationPlan({ ...options, planId: acknowledged.plan_id, confirmed: true });
  assert.equal(report.status, "completed");
  assert.ok(calls.find(args => args[1] === "enable").includes("--confirm-shared"));
  const stored = await run(["history", "list", "--plan-id", original.plan_id, ...common]);
  assert.equal(stored[0].plan.distribution.shared_root_confirmation, false);
});
