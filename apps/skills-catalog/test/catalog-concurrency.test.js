const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const test = require("node:test");
const api = require("../src");

async function fixture(context) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "catalog-concurrency-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const catalogRoot = path.join(root, "catalog");
  const registryRoot = path.join(root, "registry");
  const sourcePath = path.join(root, "source");
  for (let index = 0; index < 6; index += 1) {
    const skillRoot = path.join(sourcePath, `skill-${index}`);
    await fs.mkdir(skillRoot, { recursive: true });
    await fs.writeFile(path.join(skillRoot, "SKILL.md"), `---\nname: skill-${index}\ndescription: Concurrent Catalog fixture.\n---\n# Skill\n`);
  }
  const imported = await api.importLocalSource({ registryRoot, sourcePath });
  const project = await api.createProject({ catalogRoot, id: "demo", name: "Demo", projectPath: path.join(root, "project"), providerId: "codex" });
  await api.createPreset({ catalogRoot, registryRoot, id: "base", name: "Base", registrySkillIds: [imported.skills[0].id] });
  await api.assignPreset({ catalogRoot, projectId: project.id, presetId: "base" });
  return { root, catalogRoot, registryRoot, project, skills: imported.skills, skill: imported.skills[0] };
}

test("concurrent public writers preserve policy, reviews, profile patches and evidence", async (context) => {
  const f = await fixture(context);
  const args = { catalogRoot: f.catalogRoot, registryRoot: f.registryRoot, lineageId: f.skill.lineage_id };
  await api.recordSourceReview({ ...args, sourceRevisionId: f.skill.source_revision_id, decision: "approved", summary: "Initial approval" });
  await Promise.all([
    ...Array.from({ length: 12 }, (_, index) => api.recordSourceReview({ ...args, sourceRevisionId: f.skill.source_revision_id, decision: "rejected", summary: `Revocation ${index}` })),
    api.setProjectReviewPolicy({ ...args, projectId: f.project.id, reviewPolicy: "require_approved" }),
    api.updateSkillProfile({ ...args, patch: { purpose: "Keep concurrent purpose" } }),
    api.updateSkillProfile({ ...args, patch: { summary: "Keep concurrent summary" } }),
    api.addSkillNote({ ...args, body: "Concurrent note" }),
    api.addSkillFeedback({ ...args, summary: "Concurrent feedback" }),
    api.createEvaluationCase({ ...args, id: "case", name: "Case", objective: "Keep evidence", criteria: ["Persist the evaluation"] }),
    api.recordObservedState({ ...args, projectId: f.project.id, providerId: "codex", inventory: { providers: [] }, bindings: [] }),
  ]);
  const catalog = await api.loadCatalog(f.catalogRoot);
  assert.equal(catalog.projects[0].review_policy, "require_approved");
  assert.equal(catalog.source_reviews.length, 13);
  assert.equal((await api.latestSourceReview({ ...args, sourceRevisionId: f.skill.source_revision_id })).decision, "rejected");
  assert.equal(catalog.skill_profiles[0].purpose, "Keep concurrent purpose");
  assert.equal(catalog.skill_profiles[0].summary, "Keep concurrent summary");
  for (const collection of ["skill_notes", "skill_feedback", "evaluation_cases", "observed_states"]) assert.equal(catalog[collection].length, 1, collection);
});

test("concurrent template edits retain both immutable versions and assignment additions", async (context) => {
  const f = await fixture(context);
  await Promise.all([
    api.updatePresetTemplate({ ...f, presetId: "base", patch: { purpose: "New purpose" } }),
    api.addPresetTemplateNote({ catalogRoot: f.catalogRoot, presetId: "base", body: "New note" }),
    ...f.skills.slice(1).map((skill, index) => api.createPreset({ ...f, id: `extra-${index}`, name: `Extra ${index}`, registrySkillIds: [skill.id] })),
  ]);
  await Promise.all(f.skills.slice(1).map((_, index) => api.assignPreset({ catalogRoot: f.catalogRoot, projectId: f.project.id, presetId: `extra-${index}`, role: "recommended", priority: index })));
  const preset = await api.getPreset(f.catalogRoot, "base");
  assert.equal(preset.versions.length, 3);
  assert.equal(preset.purpose, "New purpose");
  assert.equal(preset.template_notes.length, 1);
  assert.equal((await api.getProject(f.catalogRoot, f.project.id)).preset_assignments.length, 6);
});

test("nested Catalog mutations read their own changes and roll back failed callbacks", async (context) => {
  const f = await fixture(context);
  await assert.rejects(api.mutateCatalog(f.catalogRoot, async () => {
    await api.setProjectReviewPolicy({ catalogRoot: f.catalogRoot, projectId: f.project.id, reviewPolicy: "require_approved" });
    assert.equal((await api.getProject(f.catalogRoot, f.project.id)).review_policy, "require_approved");
    throw new Error("Cancel the transaction");
  }), /Cancel the transaction/);
  assert.equal((await api.getProject(f.catalogRoot, f.project.id)).review_policy, "advisory");
  await assert.rejects(api.mutateCatalog(f.catalogRoot, async () => {
    await api.setProjectReviewPolicy({ catalogRoot: f.catalogRoot, projectId: f.project.id, reviewPolicy: "require_approved" });
    await assert.rejects(api.mutateCatalog(f.catalogRoot, (catalog) => {
      catalog.projects[0].name = "Rolled back";
      throw new Error("Cancel nested mutation");
    }), /Cancel nested mutation/);
  }), /Cancel nested mutation/);
  assert.equal((await api.getProject(f.catalogRoot, f.project.id)).review_policy, "advisory");
  assert.equal((await api.getProject(f.catalogRoot, f.project.id)).name, "Demo");
  await api.mutateCatalog(f.catalogRoot, async () => {
    await api.setProjectReviewPolicy({ catalogRoot: f.catalogRoot, projectId: f.project.id, reviewPolicy: "require_approved" });
    assert.equal((await api.getProject(f.catalogRoot, f.project.id)).review_policy, "require_approved");
  });
  assert.equal((await api.getProject(f.catalogRoot, f.project.id)).review_policy, "require_approved");
});

test("an explicit stale snapshot is rejected instead of overwriting a successful mutation", async (context) => {
  const f = await fixture(context);
  const stale = await api.loadCatalog(f.catalogRoot);
  await api.setProjectReviewPolicy({ catalogRoot: f.catalogRoot, projectId: f.project.id, reviewPolicy: "require_approved" });
  stale.projects[0].name = "Stale name";
  await assert.rejects(api.saveCatalog(f.catalogRoot, stale), { code: "CATALOG_WRITE_CONFLICT" });
  const project = await api.getProject(f.catalogRoot, f.project.id);
  assert.equal(project.review_policy, "require_approved");
  assert.equal(project.name, "Demo");
});

test("a detached child cannot report a successful mutation after commit serialization starts", async (context) => {
  const f = await fixture(context);
  const originalOpen = fs.open;
  let releaseChild;
  const gate = new Promise((resolve) => { releaseChild = resolve; });
  let child;
  let intercepted = false;
  fs.open = async (filename, ...args) => {
    if (!intercepted && String(filename).startsWith(path.join(f.catalogRoot, "catalog.json."))) {
      intercepted = true;
      releaseChild();
      await child.catch(() => {});
    }
    return originalOpen(filename, ...args);
  };
  try {
    await api.mutateCatalog(f.catalogRoot, (catalog) => {
      catalog.projects[0].name = "Committed name";
      child = gate.then(() => api.mutateCatalog(f.catalogRoot, (nested) => { nested.projects[0].name = "Lost child name"; }));
      child.catch(() => {});
    });
    await assert.rejects(child, { code: "CATALOG_TRANSACTION_CLOSED" });
  } finally {
    fs.open = originalOpen;
  }
  assert.equal((await api.getProject(f.catalogRoot, f.project.id)).name, "Committed name");
});

test("recipe preset reconciliation cannot erase concurrent reviews or be erased by them", async (context) => {
  const f = await fixture(context);
  const recipe = await api.exportRecipe({ ...f, presetId: "base" });
  recipe.presets = Array.from({ length: 20 }, (_, index) => ({ ...recipe.presets[0], id: `recipe-${index}`, name: `Recipe ${index}` }));
  await Promise.all([
    api.applyRecipe({ ...f, recipeContent: recipe }),
    (async () => {
      for (let index = 0; index < 20; index += 1) await api.recordSourceReview({ ...f, sourceRevisionId: f.skill.source_revision_id, decision: "rejected", summary: `Sequential review ${index}` });
    })(),
  ]);
  const catalog = await api.loadCatalog(f.catalogRoot);
  assert.equal(catalog.presets.filter((preset) => preset.id.startsWith("recipe-")).length, 20);
  assert.equal(catalog.source_reviews.length, 20);
});

test("independent Node processes preserve every project override", { timeout: 20000 }, async (context) => {
  const f = await fixture(context);
  const modulePath = path.resolve(__dirname, "../src");
  const code = `const api = require(${JSON.stringify(modulePath)}); process.send({ ready: true }); process.on('message', async (args) => { try { await api.setProjectSkillOverride(args); process.send({ done: true }); } catch (error) { process.send({ error: error.message }); } process.disconnect(); });`;
  const children = f.skills.map((skill) => {
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
    return { child, skill, ready, done };
  });
  await Promise.all(children.map((child) => child.ready));
  for (const { child, skill } of children) child.send({ catalogRoot: f.catalogRoot, registryRoot: f.registryRoot, projectId: f.project.id, lineageId: skill.lineage_id, registrySkillId: skill.id, desiredState: "enabled" });
  await Promise.all(children.map((child) => child.done));
  const overrides = (await api.getProject(f.catalogRoot, f.project.id)).skill_overrides;
  assert.deepEqual(overrides.map((override) => override.lineage_id).sort(), f.skills.map((skill) => skill.lineage_id).sort());
});
