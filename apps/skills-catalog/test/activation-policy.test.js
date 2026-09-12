const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const adapter = require("@skills-platform/skills-manager-adapter");
const { run } = require("../src/cli");
const {
  applyRecordedCatalogPlan, applyRecordedActivationPlan, assignPreset, createPreset,
  createCatalogServer, createProject, createProjectPlan, importLocalSource, listActivationHistory,
  loadCatalog, saveCatalog, recordActivationPlan, recordSourceReview, setProjectReviewPolicy,
  updatePresetTemplate, updateSkillProfile,
} = require("../src");

async function fixture(context, reviewPolicy = "require_approved") {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "catalog-review-policy-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const catalogRoot = path.join(root, "catalog");
  const registryRoot = path.join(root, "registry");
  const sourcePath = path.join(root, "source", "demo");
  await fs.mkdir(sourcePath, { recursive: true });
  await fs.writeFile(path.join(sourcePath, "SKILL.md"), "---\nname: demo\ndescription: Review fixture.\n---\n# Demo\n");
  const imported = await importLocalSource({ registryRoot, sourcePath: path.dirname(sourcePath) });
  const skill = imported.skills[0];
  const project = await createProject({ catalogRoot, id: "demo", name: "Demo", projectPath: path.join(root, "project"), providerId: "codex", reviewPolicy });
  await createPreset({ catalogRoot, registryRoot, id: "preset", name: "Preset", registrySkillIds: [skill.id] });
  await assignPreset({ catalogRoot, projectId: project.id, presetId: "preset" });
  const args = { catalogRoot, registryRoot, projectId: project.id };
  const review = (decision) => recordSourceReview({ catalogRoot, registryRoot, sourceRevisionId: skill.source_revision_id, decision, summary: `Fixture ${decision}` });
  return { root, project, skill, args, review, cli: ["--catalog", catalogRoot, "--registry", registryRoot] };
}

test("legacy projects remain advisory and strict plans require source approval, independently of profile labels", async (context) => {
  const f = await fixture(context, "advisory");
  const catalog = await loadCatalog(f.args.catalogRoot);
  delete catalog.projects[0].review_policy;
  await saveCatalog(f.args.catalogRoot, catalog);
  assert.equal((await createProjectPlan(f.args)).operations[0].desired_state, "enabled");
  assert.equal((await loadCatalog(f.args.catalogRoot)).projects[0].review_policy, "advisory");
  await setProjectReviewPolicy({ ...f.args, reviewPolicy: "require_approved" });
  await updateSkillProfile({ ...f.args, lineageId: f.skill.lineage_id, patch: { review_state: "reviewed" } });
  await assert.rejects(createProjectPlan(f.args), /approved source review.*unreviewed/);
  await f.review("rejected");
  await assert.rejects(createProjectPlan(f.args), /approved source review.*rejected/);
  await f.review("approved");
  assert.equal((await createProjectPlan(f.args)).operations[0].registry_skill_id, f.skill.id);
});

test("strict CLI gates raw plans and direct links, persists policy, and preserves project settings when binding the manager", async (context) => {
  const f = await fixture(context, "advisory");
  const configured = await run(["project", "set-policy", "demo", "--review-policy", "require_approved", ...f.cli]);
  assert.equal(configured.review_policy, "require_approved");
  const bound = await run(["project", "bind-manager", "demo", "--upstream-project-id", "workspace-opaque-id", ...f.cli]);
  assert.equal(bound.upstream_project_id, "workspace-opaque-id");
  assert.deepEqual(bound.preset_assignments, configured.preset_assignments);
  assert.equal(bound.delivery_root, configured.delivery_root);
  await assert.rejects(run(["project", "bind-manager", "demo", ...f.cli]), /project id is required/i);
  await assert.rejects(run(["project", "set-policy", "demo", "--review-policy", "unknown", ...f.cli]), /advisory or require_approved/);
  await assert.rejects(run(["project", "link", "demo", "demo", ...f.cli]), /Strict projects cannot use direct project link/);
  const raw = ["plan", "--project-id", "demo", "--project-path", f.project.project_path, "--provider", "codex", "--delivery-root", f.project.delivery_root, "--skill", f.skill.id, ...f.cli];
  await assert.rejects(run(raw), /approved source review/);
  await f.review("approved");
  assert.equal((await run(raw)).operations[0].registry_skill_id, f.skill.id);
});

test("deprecated presets and profiles block enabled strict plans while disabled remediation remains possible", async (context) => {
  const f = await fixture(context);
  await f.review("approved");
  await updatePresetTemplate({ ...f.args, presetId: "preset", patch: { lifecycle: "deprecated" } });
  await assert.rejects(createProjectPlan(f.args), /deprecated preset/);
  const removal = await createProjectPlan({ ...f.args, presetId: "builtin-pristine" });
  assert.equal(removal.operations[0].desired_state, "disabled");
  await updatePresetTemplate({ ...f.args, presetId: "preset", patch: { lifecycle: "reviewed" } });
  await updateSkillProfile({ ...f.args, lineageId: f.skill.lineage_id, patch: { review_state: "deprecated" } });
  await assert.rejects(createProjectPlan(f.args), /deprecated skill/);
  await f.review("rejected");
  const record = await recordActivationPlan({ ...f.args, plan: removal });
  const applied = await applyRecordedCatalogPlan({ ...f.args, planId: record.plan_id, confirmed: true });
  assert.equal(applied.report.status, "completed");
});

test("history records and exports the same enabled-only plan, then rechecks approval before applying it", async (context) => {
  const f = await fixture(context);
  await f.review("approved");
  const unrelatedSource = path.join(f.root, "unrelated");
  await fs.mkdir(unrelatedSource);
  await fs.writeFile(path.join(unrelatedSource, "SKILL.md"), "---\nname: unrelated\ndescription: Not selected.\n---\n");
  await importLocalSource({ registryRoot: f.args.registryRoot, sourcePath: unrelatedSource });
  assert.equal((await createProjectPlan(f.args)).operations.length, 2);
  const output = path.join(f.root, "recorded.json");
  const record = await run(["history", "record-plan", "demo", "--enabled-only", "--out", output, ...f.cli]);
  assert.deepEqual(JSON.parse(await fs.readFile(output, "utf8")), record.plan);
  assert.equal(record.plan.operations.length, 1);
  assert.ok(record.plan.operations.every((operation) => operation.desired_state === "enabled"));
  const preview = await run(["history", "apply", record.plan_id, ...f.cli]);
  assert.deepEqual(preview.plan, record.plan);
  await f.review("rejected");
  await assert.rejects(run(["history", "apply", record.plan_id, "--confirm", ...f.cli]), /approved source review.*rejected/);
  await assert.rejects(fs.lstat(record.plan.operations[0].delivery_path), { code: "ENOENT" });
  await f.review("approved");
  const applied = await run(["history", "apply", record.plan_id, "--confirm", ...f.cli]);
  assert.equal(applied.status, "completed");
  assert.equal(applied.plan.plan_id, record.plan_id);
  assert.equal((await listActivationHistory(f.args))[0].reports.length, 1);
});

test("approval revoked during adapter preview is checked again before delivery and records a failed report", async (context) => {
  const f = await fixture(context);
  await f.review("approved");
  const plan = await createProjectPlan(f.args);
  await recordActivationPlan({ ...f.args, plan });
  const result = await applyRecordedCatalogPlan({ ...f.args, planId: plan.plan_id, confirmed: true, adapter: {
    applyActivationPlan: (candidate, options) => adapter.applyActivationPlan(candidate, {
      ...options,
      beforeOperation: async (operation) => { await f.review("rejected"); await options.beforeOperation(operation); },
    }),
  } });
  assert.equal(result.status, "failed");
  assert.match(result.report.error, /approved source review/);
  await assert.rejects(fs.lstat(plan.operations[0].delivery_path), { code: "ENOENT" });
  assert.equal((await listActivationHistory(f.args))[0].reports[0].status, "failed");
});

test("recording and replay reject another project's target and mismatched immutable registry identity", async (context) => {
  const f = await fixture(context);
  await f.review("approved");
  const plan = await createProjectPlan(f.args);
  await createProject({ catalogRoot: f.args.catalogRoot, id: "other", name: "Other", projectPath: path.join(f.root, "other"), providerId: "codex" });
  await assert.rejects(recordActivationPlan({ ...f.args, projectId: "other", plan }), /target does not match registered project/);
  await recordActivationPlan({ ...f.args, plan });
  const catalog = await loadCatalog(f.args.catalogRoot);
  catalog.activation_plans[0].project_id = "other";
  await saveCatalog(f.args.catalogRoot, catalog);
  await assert.rejects(applyRecordedCatalogPlan({ ...f.args, planId: plan.plan_id, confirmed: true }), /target does not match registered project/);
  const tampered = structuredClone(plan);
  tampered.operations[0].source_revision_id = "unreviewed-forged-revision";
  await assert.rejects(recordActivationPlan({ ...f.args, plan: tampered }), /could not verify registry identity/);
});

test("upstream apply checks review changes after its preview and never enables a revoked revision", async (context) => {
  const f = await fixture(context);
  await f.review("approved");
  const plan = await createProjectPlan(f.args);
  await recordActivationPlan({ ...f.args, plan });
  let enableCalled = false;
  const upstreamCli = { execute: async (args) => {
    if (args[0] === "inspect") return { skills: [{ name: "demo", instance_id: "project:demo:demo", project_id: "demo", scope: "project", path: f.skill.canonical_path }] };
    if (args[1] === "preview") { await f.review("rejected"); return { requires_confirmation: false }; }
    if (args[1] === "enable") { enableCalled = true; return { applied_count: 1 }; }
    if (args[0] === "providers") return { providers: [] };
    if (args[0] === "bindings") return [];
    throw new Error(`Unexpected ${args}`);
  } };
  const result = await applyRecordedActivationPlan({ ...f.args, planId: plan.plan_id, confirmed: true, upstreamCli });
  assert.equal(result.status, "failed");
  assert.match(result.error, /approved source review/);
  assert.equal(enableCalled, false);
});

test("HTTP policy and manager binding preserve project selection and gate plan preview and recorded apply", async (context) => {
  const f = await fixture(context, "advisory");
  const calls = [];
  const server = createCatalogServer({ ...f.args, upstreamCli: { execute: async (args) => {
    calls.push(args);
    if (args[0] === "inspect") return { skills: [{ name: "demo", instance_id: "project:manager-demo:demo", project_id: "manager-demo", scope: "project", path: f.skill.canonical_path }] };
    if (args[1] === "preview") return { requires_confirmation: false };
    throw new Error(`Unexpected ${args}`);
  } } });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const post = (route, body) => fetch(`${base}${route}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const policy = await (await post("/projects/demo/review-policy", { review_policy: "require_approved" })).json();
  assert.equal(policy.project.review_policy, "require_approved");
  const bound = await (await post("/projects/demo/upstream-binding", { upstream_project_id: "manager-demo" })).json();
  assert.deepEqual(bound.project.preset_assignments, policy.project.preset_assignments);
  const denied = await post("/projects/demo/activation-plan/preview", {});
  assert.equal(denied.status, 400);
  assert.match((await denied.json()).error, /approved source review/);
  assert.equal(calls.length, 0);
  await f.review("approved");
  const previewResponse = await post("/projects/demo/activation-plan/preview", { preflight: true });
  const preview = await previewResponse.json();
  assert.equal(previewResponse.status, 200, JSON.stringify(preview));
  assert.equal(preview.preflight.status, "confirmation_required");
  const previousCalls = calls.length;
  await f.review("rejected");
  const deniedApply = await post(`/activation-plans/${preview.plan.plan_id}/apply`, { confirmed: true });
  assert.equal(deniedApply.status, 400);
  assert.match((await deniedApply.json()).error, /approved source review/);
  assert.equal(calls.length, previousCalls);
});

test("a shared delivery root cannot bypass strict policy through an advisory project alias or its saved plan", async (context) => {
  const f = await fixture(context, "advisory");
  const alias = await createProject({ catalogRoot: f.args.catalogRoot, id: "alias", name: "Alias", projectPath: f.project.project_path, providerId: f.project.provider_id });
  await assignPreset({ catalogRoot: f.args.catalogRoot, projectId: alias.id, presetId: "preset" });
  const aliasArgs = { ...f.args, projectId: alias.id };
  const oldPlan = await createProjectPlan(aliasArgs);
  await recordActivationPlan({ ...aliasArgs, plan: oldPlan });
  await setProjectReviewPolicy({ ...f.args, reviewPolicy: "require_approved" });
  await assert.rejects(createProjectPlan(aliasArgs), /overlaps strict project demo/);
  await assert.rejects(applyRecordedCatalogPlan({ ...aliasArgs, planId: oldPlan.plan_id, confirmed: true }), /overlaps strict project demo/);
  await assert.rejects(run(["project", "link", alias.id, "demo", ...f.cli]), /overlaps strict project demo/);
  await assert.rejects(run(["plan", "--project-id", alias.id, "--project-path", alias.project_path, "--provider", alias.provider_id,
    "--delivery-root", alias.delivery_root, "--skill", f.skill.id, ...f.cli]), /overlaps strict project demo/);
  await fs.mkdir(f.project.project_path, { recursive: true });
  const symlinkProjectPath = path.join(f.root, "project-symlink");
  await fs.symlink(f.project.project_path, symlinkProjectPath, process.platform === "win32" ? "junction" : "dir");
  const symlinkAlias = await createProject({ catalogRoot: f.args.catalogRoot, id: "symlink-alias", name: "Symlink alias", projectPath: symlinkProjectPath, providerId: f.project.provider_id });
  await assignPreset({ catalogRoot: f.args.catalogRoot, projectId: symlinkAlias.id, presetId: "preset" });
  await assert.rejects(createProjectPlan({ ...f.args, projectId: symlinkAlias.id }), /overlaps strict project demo/);
  await f.review("approved");
  assert.equal((await createProjectPlan(f.args)).operations[0].desired_state, "enabled");
  await assert.rejects(fs.lstat(oldPlan.operations[0].delivery_path), { code: "ENOENT" });
});

test("raw global plans without project identity cannot bypass a strict registered delivery root", async (context) => {
  const f = await fixture(context);
  const globalProject = await createProject({ catalogRoot: f.args.catalogRoot, id: "strict-global", name: "Strict global", scope: "global",
    providerId: "claude", deliveryRoot: path.join(f.root, "global-skills"), reviewPolicy: "require_approved" });
  const raw = ["plan", "--global", "--provider", "claude", "--delivery-root", globalProject.delivery_root, "--skill", f.skill.id, ...f.cli];
  await assert.rejects(run(raw), /overlaps strict project strict-global/);
  await assert.rejects(run([...raw, "--project-id", globalProject.id]), /approved source review/);
  await f.review("approved");
  await assert.rejects(run(raw), /overlaps strict project strict-global/);
  assert.equal((await run([...raw, "--project-id", globalProject.id])).operations[0].registry_skill_id, f.skill.id);
  const unrelated = await run(["plan", "--global", "--provider", "claude", "--delivery-root", path.join(f.root, "unrelated-skills"), "--skill", f.skill.id, ...f.cli]);
  assert.equal(unrelated.operations.length, 1);
  await assert.rejects(fs.lstat(globalProject.delivery_root), { code: "ENOENT" });
});
