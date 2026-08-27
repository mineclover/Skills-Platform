const test = require("node:test");
const assert = require("node:assert/strict");
const { createSandbox, setupTestCatalogWithSkill } = require("../helpers/fixtures");
const { addSkillFeedback, listSkillFeedback, getSkillFeedbackSummary } = require("../../../apps/skills-catalog/src/skill-management");

test("Tier 2 - B06.1: Skill Lineage Feedback Ingestion and Listing", async (t) => {
  const { sandboxPath, cleanup } = await createSandbox("tier2-b06-");
  t.after(cleanup);

  const { catalogRoot, registryRoot, lineageId } = await setupTestCatalogWithSkill({
    sandboxPath,
    skillName: "special-skill-v2",
  });

  await addSkillFeedback({
    catalogRoot,
    registryRoot,
    lineageId,
    outcome: "success",
    summary: "Scoped skill lineage test",
    author: "telemetry:antigravity",
  });

  const list = await listSkillFeedback({ catalogRoot, lineageId });
  assert.equal(list.length, 1);
  assert.equal(list[0].lineage_id, lineageId);
});

test("Tier 2 - B06.2: Rejects Empty Summary in Feedback with Clear Validation Error", async (t) => {
  const { sandboxPath, cleanup } = await createSandbox("tier2-b06-");
  t.after(cleanup);

  const { catalogRoot, registryRoot, lineageId } = await setupTestCatalogWithSkill({
    sandboxPath,
    skillName: "task-decomposer",
  });

  await assert.rejects(
    () =>
      addSkillFeedback({
        catalogRoot,
        registryRoot,
        lineageId,
        outcome: "success",
        summary: "   ",
        author: "telemetry:claude",
      }),
    /Feedback summary is required/
  );
});

test("Tier 2 - B06.3: Boundary Outcome Transitions in Feedback", async (t) => {
  const { sandboxPath, cleanup } = await createSandbox("tier2-b06-");
  t.after(cleanup);

  const { catalogRoot, registryRoot, lineageId } = await setupTestCatalogWithSkill({
    sandboxPath,
    skillName: "duration-boundary-skill",
  });

  await addSkillFeedback({
    catalogRoot,
    registryRoot,
    lineageId,
    outcome: "success",
    summary: "Success run",
    author: "telemetry:antigravity",
  });
  await addSkillFeedback({
    catalogRoot,
    registryRoot,
    lineageId,
    outcome: "risk",
    summary: "Risk run",
    author: "telemetry:antigravity",
  });

  const list = await listSkillFeedback({ catalogRoot, lineageId });
  assert.equal(list.length, 2);
  assert.equal(list[0].outcome, "risk");
  assert.equal(list[1].outcome, "success");
});

test("Tier 2 - B06.4: Bridging Supported Metrics Key-Value Maps", async (t) => {
  const { sandboxPath, cleanup } = await createSandbox("tier2-b06-");
  t.after(cleanup);

  const { catalogRoot, registryRoot, lineageId } = await setupTestCatalogWithSkill({
    sandboxPath,
    skillName: "metrics-test-skill",
  });

  const metrics = {
    attempted: 10,
    successful: 8,
    corrections: 1,
    risk_events: 1,
  };

  await addSkillFeedback({
    catalogRoot,
    registryRoot,
    lineageId,
    outcome: "success",
    summary: "Metrics test",
    author: "telemetry:codex",
    metrics,
  });

  const list = await listSkillFeedback({ catalogRoot, lineageId });
  assert.equal(list.length, 1);
  assert.equal(list[0].metrics.attempted, 10);
  assert.equal(list[0].metrics.successful, 8);
});

test("Tier 2 - B06.5: Summary Calculation with Zero Recorded Feedback", async (t) => {
  const { sandboxPath, cleanup } = await createSandbox("tier2-b06-");
  t.after(cleanup);

  const { catalogRoot, registryRoot, lineageId } = await setupTestCatalogWithSkill({
    sandboxPath,
    skillName: "zero-feedback-skill",
  });

  const summary = await getSkillFeedbackSummary({ catalogRoot, registryRoot, lineageId });

  assert.equal(summary.total_feedback, 0);
  assert.equal(summary.by_outcome.success, 0);
  assert.equal(summary.by_outcome.risk, 0);
});
