const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { digestDirectory } = require("@skills-platform/contracts");
const {
  buildSystemPrompt,
  createPlanFromRegistry,
  createPreset,
  importLocalSource,
} = require("../src");
const {
  analyzeSkillRevision,
  annotationFile,
  createSkillAnnotation,
  deleteSkillAnnotation,
  getSkillAnnotation,
  listSkillAnalyses,
  listSkillAnnotations,
  loadSkillAnnotationSidecar,
  restoreSkillAnnotation,
  updateSkillAnnotation,
} = require("../src/skill-annotations");

async function fixture(context, name = "guide") {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "skills-annotations-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const sourceRoot = path.join(root, "source");
  const skillRoot = path.join(sourceRoot, name);
  const registryRoot = path.join(root, "registry");
  const catalogRoot = path.join(root, "catalog");
  const deliveryRoot = path.join(root, "delivery");
  await fs.mkdir(path.join(skillRoot, "references"), { recursive: true });
  await fs.writeFile(
    path.join(skillRoot, "SKILL.md"),
    [
      "---",
      `name: ${name}`,
      "description: Explain a reviewed workflow without changing its behavior.",
      "---",
      "",
      `# ${name} 안내 🧭`,
      "",
      "1. Read the immutable source.",
      "2. Follow [the checklist](./references/checklist.md).",
      "",
      "```sh",
      "printf 'inspect only'",
      "```",
      "",
    ].join("\r\n"),
    "utf8",
  );
  await fs.writeFile(
    path.join(skillRoot, "references", "checklist.md"),
    "# Checklist\n\n- Keep explanatory data outside the delivered artifact.\n",
    "utf8",
  );
  const imported = await importLocalSource({ registryRoot, sourcePath: sourceRoot });
  const skill = imported.skills[0];
  await createPreset({
    catalogRoot,
    registryRoot,
    id: "reviewed-guide",
    name: "Reviewed guide",
    registrySkillIds: [skill.id],
  });
  return { catalogRoot, deliveryRoot, imported, registryRoot, root, skill, skillRoot, sourceRoot };
}

function operationSnapshot(plan) {
  return {
    mode: plan.mode,
    target: plan.target,
    distribution: plan.distribution,
    operations: plan.operations,
  };
}

test("sidecar annotations and analysis cannot alter canonical digest, activation operations, or prompt output", async (context) => {
  const { catalogRoot, deliveryRoot, registryRoot, skill } = await fixture(context);
  const beforeDigest = await digestDirectory(skill.canonical_path);
  const beforePlan = await createPlanFromRegistry({
    registryRoot,
    skillIds: [skill.id],
    target: { provider_id: "custom", scope: "global" },
    deliveryRoot,
    desiredState: "enabled",
    now: new Date("2026-09-04T00:00:00.000Z"),
  });
  const beforePrompt = await buildSystemPrompt({
    catalogRoot,
    registryRoot,
    presetId: "reviewed-guide",
    includeInjectedNotes: true,
  });

  const sentinel = "ANNOTATION_SENTINEL_MUST_NEVER_REACH_A_PROMPT";
  const annotation = await createSkillAnnotation({
    catalogRoot,
    registryRoot,
    lineageId: skill.lineage_id,
    sourceRevisionId: skill.source_revision_id,
    kind: "plain_language",
    title: "쉬운 설명",
    body: sentinel,
    locale: "ko-KR",
    anchor: {
      relative_manifest_path: "SKILL.md",
      start_line: 8,
      end_line: 9,
    },
    author: "tester",
    now: new Date("2026-09-04T01:00:00.000Z"),
  });
  const analysis = await analyzeSkillRevision({
    catalogRoot,
    registryRoot,
    lineageId: skill.lineage_id,
    sourceRevisionId: skill.source_revision_id,
    now: new Date("2026-09-04T01:05:00.000Z"),
  });

  const afterDigest = await digestDirectory(skill.canonical_path);
  const afterPlan = await createPlanFromRegistry({
    registryRoot,
    skillIds: [skill.id],
    target: { provider_id: "custom", scope: "global" },
    deliveryRoot,
    desiredState: "enabled",
    now: new Date("2026-09-04T00:00:00.000Z"),
  });
  const afterPrompt = await buildSystemPrompt({
    catalogRoot,
    registryRoot,
    presetId: "reviewed-guide",
    includeInjectedNotes: true,
  });

  assert.equal(annotation.execution_effect, "none");
  assert.equal(annotation.anchor.relative_manifest_path, "SKILL.md");
  assert.match(annotation.anchor.selected_text_sha256, /^[0-9a-f]{64}$/);
  assert.equal(analysis.execution_effect, "none");
  assert.equal(beforeDigest, skill.content_digest);
  assert.equal(afterDigest, beforeDigest);
  assert.deepEqual(operationSnapshot(afterPlan), operationSnapshot(beforePlan));
  assert.deepEqual(afterPrompt, beforePrompt);
  assert.doesNotMatch(afterPrompt.content, new RegExp(sentinel));
  assert.equal(path.dirname(annotationFile(catalogRoot, skill.lineage_id)), path.join(catalogRoot, "annotations", "v1"));
  assert.equal(path.relative(skill.canonical_path, annotationFile(catalogRoot, skill.lineage_id)).startsWith(".."), true);

  const raw = JSON.parse(await fs.readFile(annotationFile(catalogRoot, skill.lineage_id), "utf8"));
  assert.equal(raw.annotations[0].execution_effect, undefined);
  assert.equal(raw.analyses[0].execution_effect, undefined);
  assert.doesNotMatch(JSON.stringify(raw), /inject_into_prompt|desired_state|"enabled"|"priority"/);
});

test("annotation CRUD uses optimistic versions, soft deletion, restoration, and atomic concurrent writes", async (context) => {
  const { catalogRoot, registryRoot, skill } = await fixture(context, "crud-guide");
  await assert.rejects(
    () => createSkillAnnotation({
      catalogRoot,
      registryRoot,
      lineageId: skill.lineage_id,
      body: "Unsafe field",
      inject_into_prompt: false,
    }),
    /execution control field/,
  );
  await assert.rejects(
    () => createSkillAnnotation({
      catalogRoot,
      registryRoot,
      lineageId: skill.lineage_id,
      body: "Unsafe field",
      enabled: false,
    }),
    /execution control field/,
  );
  await assert.rejects(
    () => createSkillAnnotation({
      catalogRoot,
      registryRoot,
      lineageId: skill.lineage_id,
      body: "Unsafe field",
      desired_state: "disabled",
    }),
    /execution control field/,
  );
  await assert.rejects(
    () => createSkillAnnotation({
      catalogRoot,
      registryRoot,
      lineageId: skill.lineage_id,
      body: "Unsafe field",
      priority: 0,
    }),
    /execution control field/,
  );

  const created = await createSkillAnnotation({
    catalogRoot,
    registryRoot,
    lineageId: skill.lineage_id,
    sourceRevisionId: skill.source_revision_id,
    body: "Initial explanation",
    now: new Date("2026-09-04T02:00:00.000Z"),
  });
  await assert.rejects(
    () => updateSkillAnnotation({
      catalogRoot,
      lineageId: skill.lineage_id,
      annotationId: created.id,
      expectedVersion: 99,
      patch: { body: "Stale edit" },
    }),
    (error) => error.code === "ANNOTATION_VERSION_CONFLICT" && error.statusCode === 409,
  );
  await assert.rejects(
    () => updateSkillAnnotation({
      catalogRoot,
      lineageId: skill.lineage_id,
      annotationId: created.id,
      expectedVersion: 1,
      patch: { desired_state: "disabled" },
    }),
    /execution control field/,
  );

  const updated = await updateSkillAnnotation({
    catalogRoot,
    lineageId: skill.lineage_id,
    annotationId: created.id,
    expectedVersion: 1,
    patch: { kind: "example", body: "Updated explanation", locale: "en" },
    author: "editor",
    now: new Date("2026-09-04T02:05:00.000Z"),
  });
  assert.equal(updated.version, 2);
  assert.equal(updated.history.length, 1);
  assert.equal(updated.history[0].change, "update");

  const deleted = await deleteSkillAnnotation({
    catalogRoot,
    lineageId: skill.lineage_id,
    annotationId: created.id,
    expectedVersion: 2,
    author: "editor",
    now: new Date("2026-09-04T02:10:00.000Z"),
  });
  assert.equal(deleted.version, 3);
  assert.ok(deleted.deleted_at);
  await assert.rejects(
    () => getSkillAnnotation({ catalogRoot, lineageId: skill.lineage_id, annotationId: created.id }),
    (error) => error.code === "ANNOTATION_NOT_FOUND",
  );
  assert.equal((await listSkillAnnotations({ catalogRoot, lineageId: skill.lineage_id })).length, 0);
  assert.equal((await listSkillAnnotations({ catalogRoot, lineageId: skill.lineage_id, includeDeleted: true })).length, 1);

  await assert.rejects(
    () => restoreSkillAnnotation({
      catalogRoot,
      lineageId: skill.lineage_id,
      annotationId: created.id,
      expectedVersion: 2,
    }),
    (error) => error.code === "ANNOTATION_VERSION_CONFLICT",
  );
  const restored = await restoreSkillAnnotation({
    catalogRoot,
    lineageId: skill.lineage_id,
    annotationId: created.id,
    expectedVersion: 3,
    author: "editor",
    now: new Date("2026-09-04T02:15:00.000Z"),
  });
  assert.equal(restored.version, 4);
  assert.equal(restored.deleted_at, null);
  assert.equal(restored.history.at(-1).change, "restore");

  await Promise.all(Array.from({ length: 12 }, (_, index) => createSkillAnnotation({
    catalogRoot,
    registryRoot,
    lineageId: skill.lineage_id,
    body: `Concurrent annotation ${index}`,
    now: new Date(`2026-09-04T03:${String(index).padStart(2, "0")}:00.000Z`),
  })));
  const annotations = await listSkillAnnotations({ catalogRoot, lineageId: skill.lineage_id });
  const sidecar = await loadSkillAnnotationSidecar({ catalogRoot, lineageId: skill.lineage_id });
  const directoryEntries = await fs.readdir(path.dirname(annotationFile(catalogRoot, skill.lineage_id)));
  assert.equal(annotations.length, 13);
  assert.equal(sidecar.annotations.length, 13);
  assert.equal(sidecar.store_version, 16);
  assert.equal(directoryEntries.some((entry) => entry.endsWith(".tmp")), false);
});

test("static analysis is deterministic, revision-pinned, and never reattaches an old result", async (context) => {
  const { catalogRoot, registryRoot, skill, skillRoot, sourceRoot } = await fixture(context, "analysis-guide");
  const first = await analyzeSkillRevision({
    catalogRoot,
    registryRoot,
    lineageId: skill.lineage_id,
    sourceRevisionId: skill.source_revision_id,
    now: new Date("2026-09-04T04:00:00.000Z"),
  });
  const repeated = await analyzeSkillRevision({
    catalogRoot,
    registryRoot,
    lineageId: skill.lineage_id,
    sourceRevisionId: skill.source_revision_id,
    now: new Date("2030-01-01T00:00:00.000Z"),
  });
  assert.deepEqual(repeated, first);
  assert.equal(first.identity.name, "analysis-guide");
  assert.match(first.identity.description, /without changing its behavior/);
  assert.equal(first.analyzer.version, "3");
  assert.match(first.analyzer.ruleset_fingerprint, /codex-official-skills@1\.0\.0/);
  assert.equal(first.authoring.execution_effect, "none");
  assert.equal(first.authoring.results.codex.ruleset.id, "codex-official-skills");
  assert.equal(first.authoring.results.antigravity.ruleset.id, "antigravity-official-skills");
  assert.equal(first.readability.section_count, 1);
  assert.equal(first.readability.instruction_line_count, 2);
  assert.equal(first.readability.fenced_code_block_count, 1);
  assert.deepEqual(first.references.relative, ["./references/checklist.md"]);
  assert.equal(first.input_content_digest, skill.content_digest);
  assert.match(first.analysis_digest, /^[0-9a-f]{64}$/);

  await fs.appendFile(path.join(skillRoot, "SKILL.md"), "\n## New revision\n\n3. Re-check the digest.\n", "utf8");
  const importedAgain = await importLocalSource({ registryRoot, sourcePath: sourceRoot });
  const nextSkill = importedAgain.skills[0];
  assert.equal(nextSkill.lineage_id, skill.lineage_id);
  assert.notEqual(nextSkill.source_revision_id, skill.source_revision_id);

  const oldOnly = await listSkillAnalyses({ catalogRoot, registryRoot, lineageId: skill.lineage_id });
  assert.equal(oldOnly.length, 1);
  assert.equal(oldOnly[0].source_revision_id, skill.source_revision_id);
  assert.equal(oldOnly[0].stale, false);
  assert.equal(oldOnly[0].outdated, true);
  assert.equal(oldOnly[0].is_latest_revision, false);

  const next = await analyzeSkillRevision({
    catalogRoot,
    registryRoot,
    lineageId: skill.lineage_id,
    sourceRevisionId: nextSkill.source_revision_id,
    now: new Date("2026-09-04T04:30:00.000Z"),
  });
  assert.notEqual(next.id, first.id);
  assert.notEqual(next.input_content_digest, first.input_content_digest);
  const analyses = await listSkillAnalyses({ catalogRoot, registryRoot, lineageId: skill.lineage_id });
  assert.equal(analyses.length, 2);
  assert.equal(analyses.find((item) => item.id === first.id).outdated, true);
  assert.equal(analyses.find((item) => item.id === next.id).is_latest_revision, true);
});

test("static analyzer v3 reports the resolved folded YAML description", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "skills-analysis-folded-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const sourceRoot = path.join(root, "source");
  const skillRoot = path.join(sourceRoot, "folded-analysis");
  const registryRoot = path.join(root, "registry");
  const catalogRoot = path.join(root, "catalog");
  await fs.mkdir(skillRoot, { recursive: true });
  await fs.writeFile(path.join(skillRoot, "SKILL.md"), [
    "---",
    "name: folded-analysis",
    "description: >-",
    "  Use when the analyzer must resolve folded YAML exactly.",
    "---",
    "",
    "# Folded analysis",
    "",
  ].join("\n"));
  const imported = await importLocalSource({ registryRoot, sourcePath: sourceRoot });
  const skill = imported.skills[0];
  const analysis = await analyzeSkillRevision({
    catalogRoot,
    registryRoot,
    lineageId: skill.lineage_id,
    sourceRevisionId: skill.source_revision_id,
  });
  assert.equal(
    Object.values(analysis.authoring.results).some((result) => (
      result.findings.some((finding) => finding.rule_id === "manifest_name_folder_mismatch")
    )),
    false,
    "immutable registry storage suffixes must not be mistaken for package folder-name drift",
  );
  assert.equal(analysis.analyzer.version, "3");
  assert.equal(analysis.identity.description, "Use when the analyzer must resolve folded YAML exactly.");
  assert.equal(analysis.authoring.results.codex.provider_metadata.resolved_name, "folded-analysis");
});

test("a corrupt annotation sidecar degrades annotation reads only and cannot block planning or prompt export", async (context) => {
  const { catalogRoot, deliveryRoot, registryRoot, skill } = await fixture(context, "isolation-guide");
  await createSkillAnnotation({
    catalogRoot,
    registryRoot,
    lineageId: skill.lineage_id,
    body: "This record will be corrupted deliberately.",
  });
  await fs.writeFile(annotationFile(catalogRoot, skill.lineage_id), "{not-json", "utf8");

  await assert.rejects(
    () => listSkillAnnotations({ catalogRoot, lineageId: skill.lineage_id }),
    /Unexpected token|JSON/,
  );
  const plan = await createPlanFromRegistry({
    registryRoot,
    skillIds: [skill.id],
    target: { provider_id: "custom", scope: "global" },
    deliveryRoot,
  });
  const prompt = await buildSystemPrompt({
    catalogRoot,
    registryRoot,
    presetId: "reviewed-guide",
    includeInjectedNotes: true,
  });
  assert.equal(plan.operations.length, 1);
  assert.equal(plan.operations[0].content_digest, skill.content_digest);
  assert.match(prompt.content, /Read the immutable source/);
});
