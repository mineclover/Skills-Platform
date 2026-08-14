const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  createEvaluationCase,
  getSkillEvaluationSummary,
  importLocalSource,
  listReviewQueue,
  recordEvaluationRun,
  updateEvaluationCase,
  updateSkillProfile,
} = require("../src");

test("versioned evaluation cases record revision outcomes and drive an evidence-only review queue", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "skills-evaluation-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const sourceRoot = path.join(root, "source", "review");
  const registryRoot = path.join(root, "registry");
  const catalogRoot = path.join(root, "catalog");
  await fs.mkdir(sourceRoot, { recursive: true });
  await fs.writeFile(path.join(sourceRoot, "SKILL.md"), "---\nname: review\ndescription: Review safely.\n---\n\n# Review\n", "utf8");
  const imported = await importLocalSource({ registryRoot, sourcePath: path.join(root, "source") });
  const skill = imported.skills[0];
  await updateSkillProfile({ catalogRoot, registryRoot, lineageId: skill.lineage_id, patch: { review_state: "reviewed", risk_level: "low" } });

  const evaluationCase = await createEvaluationCase({
    catalogRoot,
    registryRoot,
    id: "review-contract",
    lineageId: skill.lineage_id,
    name: "Review contract",
    objective: "Check the expected review behavior.",
    criteria: ["Explains the expected scope", "Records verifiable evidence"],
    lifecycle: "active",
  });
  const passed = await recordEvaluationRun({
    catalogRoot,
    registryRoot,
    caseId: evaluationCase.id,
    sourceRevisionId: skill.source_revision_id,
    outcome: "passed",
    summary: "The expected review behavior was covered.",
    criterionResults: [
      { criterion: "Explains the expected scope", outcome: "passed" },
      { criterion: "Records verifiable evidence", outcome: "passed" },
    ],
  });
  const summary = await getSkillEvaluationSummary({ catalogRoot, registryRoot, lineageId: skill.lineage_id, sourceRevisionId: skill.source_revision_id });
  assert.equal(passed.case_version, 1);
  assert.equal(summary.pass_rate, 1);
  assert.equal(summary.evaluated_active_case_count, 1);
  assert.deepEqual(await listReviewQueue({ catalogRoot, registryRoot }), []);

  const updated = await updateEvaluationCase({
    catalogRoot,
    caseId: evaluationCase.id,
    objective: "Check the expected review behavior and its evidence boundary.",
  });
  const pending = await listReviewQueue({ catalogRoot, registryRoot });
  assert.equal(updated.selected_version, 2);
  assert.ok(pending[0].reasons.some((reason) => reason.code === "unevaluated_current_revision"));

  await recordEvaluationRun({
    catalogRoot,
    registryRoot,
    caseId: evaluationCase.id,
    sourceRevisionId: skill.source_revision_id,
    outcome: "failed",
    summary: "The updated boundary was not met.",
    criterionResults: [
      { criterion: "Explains the expected scope", outcome: "passed" },
      { criterion: "Records verifiable evidence", outcome: "failed" },
    ],
  });
  const failed = await listReviewQueue({ catalogRoot, registryRoot });
  assert.ok(failed[0].reasons.some((reason) => reason.code === "evaluation_outcome"));
  assert.match(await fs.readFile(path.join(sourceRoot, "SKILL.md"), "utf8"), /Review safely/);
});
