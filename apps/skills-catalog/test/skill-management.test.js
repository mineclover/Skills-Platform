const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  addSkillNote,
  buildSystemPrompt,
  createPreset,
  createProject,
  deleteSkillNote,
  editSkillNote,
  getSkillProfile,
  importLocalSource,
  listSkillNotes,
  searchSkills,
  restoreSkillNote,
  updateSkillProfile,
} = require("../src");

async function fixture(context) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "skills-management-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const sourceRoot = path.join(root, "source", "design");
  const registryRoot = path.join(root, "registry");
  const catalogRoot = path.join(root, "catalog");
  await fs.mkdir(sourceRoot, { recursive: true });
  await fs.writeFile(path.join(sourceRoot, "SKILL.md"), "---\nname: design-review\ndescription: Review interface designs.\n---\n\n# Design review\n");
  const imported = await importLocalSource({ registryRoot, sourcePath: path.join(root, "source") });
  await createProject({
    catalogRoot,
    id: "website",
    name: "Website",
    projectPath: path.join(root, "website"),
    providerId: "codex",
    deliveryRoot: path.join(root, "website", ".agents", "skills"),
  });
  return { catalogRoot, imported, registryRoot, root, sourceRoot };
}

test("skill profile persists purpose, constraints, and review metadata by stable lineage", async (context) => {
  const { catalogRoot, imported, registryRoot, sourceRoot } = await fixture(context);
  const lineageId = imported.skills[0].lineage_id;
  const profile = await updateSkillProfile({
    catalogRoot,
    registryRoot,
    lineageId,
    patch: {
      title: "Design review",
      purpose: "Catch interface regressions before implementation.",
      use_when: ["Reviewing a product surface", "Before implementation"],
      avoid_when: ["Generating production code"],
      tags: ["design", "review"],
      domains: ["frontend"],
      work_scope_tags: ["ui"],
      owner: "design-systems",
      maintainers: ["alex", "sam"],
      provider_constraints: ["codex"],
      runtime_requirements: ["figma access"],
      risk_level: "medium",
      review_state: "reviewed",
      visibility: "team",
    },
  });

  assert.equal(profile.lineage_id, lineageId);
  assert.equal(profile.review_state, "reviewed");
  assert.ok(profile.reviewed_at);
  assert.deepEqual(profile.tags, ["design", "review"]);

  await fs.appendFile(path.join(sourceRoot, "SKILL.md"), "\nUpdated source instructions.\n");
  const second = await importLocalSource({ registryRoot, sourcePath: path.join(path.dirname(sourceRoot)) });
  assert.notEqual(second.skills[0].id, imported.skills[0].id);
  assert.equal(second.skills[0].lineage_id, lineageId);
  assert.equal((await getSkillProfile({ catalogRoot, registryRoot, lineageId })).purpose, profile.purpose);
});

test("scoped notes require their target, retain history, and can be queried", async (context) => {
  const { catalogRoot, imported, registryRoot } = await fixture(context);
  const lineageId = imported.skills[0].lineage_id;
  await assert.rejects(
    () => addSkillNote({ catalogRoot, registryRoot, lineageId, scope: "project", body: "Missing target" }),
    /project_id is required/,
  );

  const note = await addSkillNote({
    catalogRoot,
    registryRoot,
    lineageId,
    scope: "project",
    projectId: "website",
    kind: "caveat",
    author: "mina",
    body: "Check the mobile breakpoint before accepting a review.",
    visibility: "team",
  });
  const edited = await editSkillNote({
    catalogRoot,
    noteId: note.id,
    body: "Check the mobile breakpoint and keyboard navigation before accepting a review.",
    injectIntoPrompt: true,
  });

  assert.equal(edited.version, 2);
  assert.equal(edited.history.length, 1);
  assert.equal((await listSkillNotes({ catalogRoot, lineageId, projectId: "website" })).length, 1);
  await deleteSkillNote({ catalogRoot, noteId: note.id, author: "mina" });
  assert.equal((await listSkillNotes({ catalogRoot, lineageId })).length, 0);
  assert.equal((await listSkillNotes({ catalogRoot, lineageId, includeDeleted: true }))[0].deleted_by, "mina");
  await restoreSkillNote({ catalogRoot, noteId: note.id });
  assert.equal((await listSkillNotes({ catalogRoot, lineageId })).length, 1);
});

test("search combines profile metadata and scoped note content without touching skill source", async (context) => {
  const { catalogRoot, imported, registryRoot } = await fixture(context);
  const lineageId = imported.skills[0].lineage_id;
  await updateSkillProfile({ catalogRoot, registryRoot, lineageId, patch: { tags: ["design"], domains: ["frontend"], provider_constraints: ["codex"] } });
  await addSkillNote({ catalogRoot, registryRoot, lineageId, kind: "usage", body: "Useful during accessibility sign-off." });

  const byTag = await searchSkills({ catalogRoot, registryRoot, tags: ["design"], providerId: "codex" });
  const byNote = await searchSkills({ catalogRoot, registryRoot, query: "accessibility sign-off" });

  assert.equal(byTag.length, 1);
  assert.equal(byNote[0].lineage.id, lineageId);
});

test("prompt export includes only explicitly enabled notes for the requested context", async (context) => {
  const { catalogRoot, imported, registryRoot } = await fixture(context);
  const skill = imported.skills[0];
  await createPreset({ catalogRoot, registryRoot, id: "review", name: "Review", registrySkillIds: [skill.id] });
  await addSkillNote({
    catalogRoot, registryRoot, lineageId: skill.lineage_id, scope: "project", projectId: "website",
    body: "Apply the website keyboard checklist.", injectIntoPrompt: true,
  });
  await addSkillNote({
    catalogRoot, registryRoot, lineageId: skill.lineage_id, scope: "global",
    body: "Internal discussion only.", injectIntoPrompt: false,
  });

  const withoutNotes = await buildSystemPrompt({ catalogRoot, registryRoot, presetId: "review" });
  const withNotes = await buildSystemPrompt({
    catalogRoot, registryRoot, presetId: "review", projectId: "website", includeInjectedNotes: true,
  });

  assert.doesNotMatch(withoutNotes.content, /keyboard checklist/);
  assert.match(withNotes.content, /keyboard checklist/);
  assert.doesNotMatch(withNotes.content, /Internal discussion/);
});
