const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { adoptApprovedRevisionIntoPreset, createPreset, getPreset, importLocalSource, listSourceAdoptionCandidates, recordSourceReview } = require("../src");

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
});
