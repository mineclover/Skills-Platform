const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { adoptApprovedRevisionIntoPreset, createPreset, getPreset, importLocalSource, latestSourceReview, listSourceAdoptionCandidates, loadCatalog, loadRegistry, recordSourceReview, saveCatalog, saveRegistry } = require("../src");

async function revisionHistory(context, count = 4) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "skills-source-history-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const registryRoot = path.join(root, "registry");
  const catalogRoot = path.join(root, "catalog");
  const sourceRoot = path.join(root, "source");
  const sourcePath = path.join(sourceRoot, "planning");
  await fs.mkdir(sourcePath, { recursive: true });
  const revisions = [];
  for (let version = 1; version <= count; version += 1) {
    await fs.writeFile(path.join(sourcePath, "SKILL.md"), `---\nname: planning\ndescription: Planning version ${version}.\n---\n\n# Planning\nVersion ${version}.\n`);
    revisions.push(await importLocalSource({ registryRoot, sourcePath: sourceRoot }));
  }
  const registry = await loadRegistry(registryRoot);
  registry.skills.forEach((skill, index) => { skill.imported_at = `2026-09-0${index + 1}T00:00:00.000Z`; });
  await saveRegistry(registryRoot, registry);
  return { catalogRoot, registryRoot, revisions };
}

async function approveRevision(fixture, index) {
  return recordSourceReview({
    catalogRoot: fixture.catalogRoot,
    registryRoot: fixture.registryRoot,
    sourceRevisionId: fixture.revisions[index].source_revision_id,
    decision: "approved",
    summary: "Reviewed complete revision.",
  });
}

test("only an explicitly approved imported revision can create a new preset version", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "skills-source-review-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const source = path.join(root, "source", "review");
  const registryRoot = path.join(root, "registry");
  const catalogRoot = path.join(root, "catalog");
  await fs.mkdir(source, { recursive: true });
  await fs.writeFile(path.join(source, "SKILL.md"), "---\nname: review\ndescription: Review.\n---\n\n# Review\n");
  const first = await importLocalSource({ registryRoot, sourcePath: path.join(root, "source") });
  await createPreset({ catalogRoot, registryRoot, id: "review", name: "Review", registrySkillIds: [first.skills[0].id] });
  await fs.appendFile(path.join(source, "SKILL.md"), "\nUpdated instruction.\n");
  const second = await importLocalSource({ registryRoot, sourcePath: path.join(root, "source") });
  await assert.rejects(() => adoptApprovedRevisionIntoPreset({ catalogRoot, registryRoot, presetId: "review", registrySkillId: second.skills[0].id }), /not approved/);
  await recordSourceReview({ catalogRoot, registryRoot, sourceRevisionId: second.source_revision_id, decision: "approved", summary: "Diff reviewed." });
  const adopted = await adoptApprovedRevisionIntoPreset({ catalogRoot, registryRoot, presetId: "review", registrySkillId: second.skills[0].id });
  assert.equal(adopted.selected_version, 2);
  assert.equal((await getPreset(catalogRoot, "review")).entries[0].registry_skill_id, second.skills[0].id);
  assert.equal((await getPreset(catalogRoot, "review", 1)).entries[0].registry_skill_id, first.skills[0].id);
});

test("lists the newest imported revision as an explicit adoption candidate", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "skills-source-review-candidates-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const registryRoot = path.join(root, "registry");
  const catalogRoot = path.join(root, "catalog");
  const sourcePath = path.join(root, "source", "planning");
  await fs.mkdir(sourcePath, { recursive: true });
  await fs.writeFile(path.join(sourcePath, "SKILL.md"), "---\nname: planning\ndescription: Initial.\n---\n\n# Planning\n", "utf8");
  const first = await importLocalSource({ registryRoot, sourcePath: path.join(root, "source") });
  await createPreset({ catalogRoot, registryRoot, id: "review", name: "Review", registrySkillIds: [first.skills[0].id] });
  await fs.writeFile(path.join(sourcePath, "SKILL.md"), "---\nname: planning\ndescription: Updated.\n---\n\n# Planning\nNew guidance.\n", "utf8");
  const second = await importLocalSource({ registryRoot, sourcePath: path.join(root, "source") });

  const candidates = await listSourceAdoptionCandidates({ catalogRoot, registryRoot });
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].registry_skill_id, second.skills[0].id);
  assert.equal(candidates[0].compatible_presets[0].id, "review");
  assert.equal(candidates[0].review, null);
  assert.equal(candidates[0].candidate_kind, "latest_import");
  assert.equal(candidates[0].latest_import.registry_skill_id, second.skills[0].id);
  assert.equal(candidates[0].latest_approved, null);
});

test("a newer unreviewed or rejected import does not hide the latest approved update", async (context) => {
  const fixture = await revisionHistory(context);
  const { catalogRoot, registryRoot, revisions } = fixture;
  for (let index = 0; index < revisions.length; index += 1) {
    await createPreset({ catalogRoot, registryRoot, id: `pinned-${index + 1}`, name: `Pinned ${index + 1}`, registrySkillIds: [revisions[index].skills[0].id] });
  }
  await approveRevision(fixture, 1);
  // An older revision reviewed more recently must not replace the newer
  // approved import as the update candidate.
  await approveRevision(fixture, 0);

  let candidates = await listSourceAdoptionCandidates({ catalogRoot, registryRoot });
  assert.deepEqual(candidates.map((candidate) => candidate.registry_skill_id), [revisions[3].skills[0].id, revisions[1].skills[0].id]);
  assert.deepEqual(candidates.map((candidate) => candidate.candidate_kind), ["latest_import", "latest_approved"]);
  assert.deepEqual(candidates[0].compatible_presets.map((preset) => preset.id), ["pinned-1", "pinned-2", "pinned-3"]);
  assert.deepEqual(candidates[1].compatible_presets.map((preset) => preset.id), ["pinned-1"]);
  assert.equal(candidates[0].review, null);
  assert.equal(candidates[1].review.decision, "approved");
  assert.equal(candidates[0].latest_approved.registry_skill_id, revisions[1].skills[0].id);
  assert.equal(candidates[1].latest_import.registry_skill_id, revisions[3].skills[0].id);

  await recordSourceReview({ catalogRoot, registryRoot, sourceRevisionId: revisions[3].source_revision_id, decision: "rejected", summary: "Newest revision fails review." });
  candidates = await listSourceAdoptionCandidates({ catalogRoot, registryRoot });
  assert.equal(candidates.length, 2);
  assert.equal(candidates[0].review.decision, "rejected");
  assert.equal(candidates[1].latest_import.review.decision, "rejected");
  assert.equal(candidates[1].registry_skill_id, revisions[1].skills[0].id);
});

test("the newest approved import produces one row and never offers an older revision as an update", async (context) => {
  const fixture = await revisionHistory(context, 3);
  const { catalogRoot, registryRoot, revisions } = fixture;
  await createPreset({ catalogRoot, registryRoot, id: "older", name: "Older", registrySkillIds: [revisions[0].skills[0].id] });
  await createPreset({ catalogRoot, registryRoot, id: "current", name: "Current", registrySkillIds: [revisions[2].skills[0].id] });
  await approveRevision(fixture, 2);
  await approveRevision(fixture, 1);
  const candidates = await listSourceAdoptionCandidates({ catalogRoot, registryRoot });
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].candidate_kind, "latest_approved");
  assert.deepEqual(candidates[0].latest_import, candidates[0].latest_approved);
  assert.deepEqual(candidates[0].compatible_presets.map((preset) => preset.id), ["older"]);
  await adoptApprovedRevisionIntoPreset({ catalogRoot, registryRoot, presetId: "older", registrySkillId: revisions[2].skills[0].id });
  assert.deepEqual(await listSourceAdoptionCandidates({ catalogRoot, registryRoot }), []);
});

test("equal import timestamps use registry history order for latest and pinned comparisons", async (context) => {
  const fixture = await revisionHistory(context, 3);
  const { catalogRoot, registryRoot, revisions } = fixture;
  const registry = await loadRegistry(registryRoot);
  for (const skill of registry.skills) skill.imported_at = "2026-09-08T00:00:00.000Z";
  // Names do not define import chronology, even if a skill was renamed.
  registry.skills[1].skill_name = "zebra";
  registry.skills[2].skill_name = "alpha";
  await saveRegistry(registryRoot, registry);
  await createPreset({ catalogRoot, registryRoot, id: "older", name: "Older", registrySkillIds: [revisions[0].skills[0].id] });
  await createPreset({ catalogRoot, registryRoot, id: "middle", name: "Middle", registrySkillIds: [revisions[1].skills[0].id] });
  await approveRevision(fixture, 1);
  const candidates = await listSourceAdoptionCandidates({ catalogRoot, registryRoot });
  assert.deepEqual(candidates.map((candidate) => candidate.registry_skill_id), [revisions[2].skills[0].id, revisions[1].skills[0].id]);
  assert.deepEqual(candidates[1].compatible_presets.map((preset) => preset.id), ["older"]);
});

test("a later rejection at the same timestamp revokes candidate approval and adoption", async (context) => {
  const fixture = await revisionHistory(context, 2);
  const { catalogRoot, registryRoot, revisions } = fixture;
  await createPreset({ catalogRoot, registryRoot, id: "older", name: "Older", registrySkillIds: [revisions[0].skills[0].id] });
  await approveRevision(fixture, 1);
  const rejection = await recordSourceReview({ catalogRoot, registryRoot, sourceRevisionId: revisions[1].source_revision_id, decision: "rejected", summary: "Approval withdrawn." });
  const catalog = await loadCatalog(catalogRoot);
  for (const review of catalog.source_reviews) review.reviewed_at = "2026-09-08T00:00:00.000Z";
  await saveCatalog(catalogRoot, catalog);

  assert.equal((await latestSourceReview({ catalogRoot, sourceRevisionId: revisions[1].source_revision_id })).id, rejection.id);
  const candidates = await listSourceAdoptionCandidates({ catalogRoot, registryRoot });
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].review.decision, "rejected");
  assert.equal(candidates[0].latest_approved, null);
  await assert.rejects(() => adoptApprovedRevisionIntoPreset({ catalogRoot, registryRoot, presetId: "older", registrySkillId: revisions[1].skills[0].id }), /not approved/);
});
