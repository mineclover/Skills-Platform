const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  assignPreset,
  createCatalogServer,
  createPreset,
  createProject,
  importLocalSource,
} = require("../src");

async function setup(context) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "skills-catalog-server-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const sourcePath = path.join(root, "source", "planning");
  await fs.mkdir(sourcePath, { recursive: true });
  await fs.writeFile(path.join(sourcePath, "SKILL.md"), "---\nname: planning\ndescription: Plan safely.\n---\n\n# Planning\n", "utf8");
  const registryRoot = path.join(root, "registry");
  const catalogRoot = path.join(root, "catalog");
  const imported = await importLocalSource({ registryRoot, sourcePath: path.join(root, "source") });
  const project = await createProject({
    catalogRoot,
    id: "demo",
    name: "Demo",
    projectPath: path.join(root, "project"),
    providerId: "codex",
    deliveryRoot: path.join(root, "project", ".agents", "skills"),
  });
  const preset = await createPreset({
    catalogRoot,
    registryRoot,
    id: "planning",
    name: "Planning",
    registrySkillIds: [imported.skills[0].id],
  });
  await assignPreset({ catalogRoot, projectId: project.id, presetId: preset.id });
  return { catalogRoot, registryRoot, imported, sourcePath };
}

test("catalog bridge exposes projects, effective set, history, and read-only plan preview", async (context) => {
  const { catalogRoot, registryRoot, imported, sourcePath } = await setup(context);
  const inspectedProjectIds = [];
  const server = createCatalogServer({
    catalogRoot,
    registryRoot,
    upstreamInspector: {
      inspect: async ({ projectId } = {}) => {
        inspectedProjectIds.push(projectId ?? null);
        return {
          source: "skills-manager-inspect",
          checked_at: "2026-08-14T00:00:00.000Z",
          scope: projectId ? "project" : "global",
          manager_project_id: projectId ?? null,
          inventory: { providers: [{ provider_id: "codex", detected: true, reachable: true, enabled_count: 1, disabled_count: 1 }] },
          bindings: [{ skill_instance_id: "planning", provider_id: "codex", state: projectId ? "enabled" : "disabled", scope: projectId ? "project" : "global" }],
          summary: { total: 1, enabled: projectId ? 1 : 0, disabled: projectId ? 0 : 1, missing: 0, conflict: 0, unavailable: 0 },
        };
      },
    },
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => server.close());
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}/api`;

  const projects = await (await fetch(`${base}/projects`)).json();
  const presets = await (await fetch(`${base}/presets`)).json();
  const registrySkills = await (await fetch(`${base}/registry/skills`)).json();
  const effective = await (await fetch(`${base}/projects/demo/effective-set`)).json();
  const preview = await (await fetch(`${base}/projects/demo/activation-plan/preview`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ work_scope_tags: ["implementation"] }),
  })).json();
  const history = await (await fetch(`${base}/projects/demo/history`)).json();
  const systemPrompt = await (await fetch(`${base}/projects/demo/system-prompt?include_notes=true`)).json();
  const globalUpstreamStatus = await (await fetch(`${base}/upstream-status`)).json();
  const projectUpstreamStatus = await (await fetch(`${base}/projects/demo/upstream-status`)).json();

  assert.equal(projects.projects[0].id, "demo");
  assert.ok(presets.presets.some((preset) => preset.id === "builtin-pristine"));
  assert.equal(registrySkills.skills[0].id, imported.skills[0].id);
  assert.equal(effective.skills[0].skill_name, "planning");
  assert.equal(preview.plan.operations[0].registry_skill_id, imported.skills[0].id);
  assert.equal(preview.plan.operations[0].skill_name, "planning");
  assert.deepEqual(history.history, []);
  assert.equal(systemPrompt.project_id, "demo");
  assert.match(systemPrompt.content, /# Planning/);
  assert.equal(globalUpstreamStatus.status.scope, "global");
  assert.equal(globalUpstreamStatus.status.summary.disabled, 1);
  assert.equal(projectUpstreamStatus.status.scope, "project");
  assert.equal(projectUpstreamStatus.status.manager_project_id, "demo");
  assert.equal(projectUpstreamStatus.status.summary.enabled, 1);
  assert.deepEqual(inspectedProjectIds, [null, "demo"]);

  const updatedPreset = await (await fetch(`${base}/presets/planning/update`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ purpose: "Plan with a verified scope." }),
  })).json();
  assert.ok(updatedPreset.preset.selected_version > 1);
  const createdPreset = await (await fetch(`${base}/presets`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: "planning-copy", name: "Planning copy", registry_skill_ids: [imported.skills[0].id] }),
  })).json();
  assert.equal(createdPreset.preset.active_version, 1);
  assert.equal(createdPreset.preset.registry_skill_ids[0], imported.skills[0].id);

  const pristineAssignment = await (await fetch(`${base}/projects/demo/default-preset`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ preset_id: "builtin-pristine" }),
  })).json();
  const pristineEffective = await (await fetch(`${base}/projects/demo/effective-set`)).json();
  assert.equal(pristineAssignment.assignment.preset_id, "builtin-pristine");
  assert.equal(pristineEffective.mode, "pristine");
  await fetch(`${base}/projects/demo/default-preset`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ preset_id: "planning" }),
  });
  const overlay = await (await fetch(`${base}/projects/demo/work-scope-overlay`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ preset_id: "planning", work_scope_tags: ["review"] }),
  })).json();
  const assignments = await (await fetch(`${base}/projects/demo/preset-assignments`)).json();
  assert.equal(overlay.assignments[0].work_scope_tags[0], "review");
  assert.ok(assignments.assignments.some((item) => item.role === "work_scope_overlay"));
  await fetch(`${base}/projects/demo/work-scope-overlay`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ work_scope_tags: ["review"] }),
  });

  await fs.appendFile(path.join(sourcePath, "SKILL.md"), "\nUpdated planning instruction.\n", "utf8");
  const importedCandidate = await importLocalSource({ registryRoot, sourcePath: path.dirname(sourcePath) });
  const sourceCandidates = await (await fetch(`${base}/source-adoption-candidates`)).json();
  assert.equal(sourceCandidates.candidates.length, 1);
  assert.equal(sourceCandidates.candidates[0].registry_skill_id, importedCandidate.skills[0].id);

  const candidateReview = await (await fetch(`${base}/source-revisions/${importedCandidate.source_revision_id}/review`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ decision: "approved", summary: "Candidate diff reviewed." }),
  })).json();
  const adopted = await (await fetch(`${base}/presets/planning/adopt`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ registry_skill_id: importedCandidate.skills[0].id }),
  })).json();
  assert.equal(candidateReview.review.decision, "approved");
  assert.equal(adopted.adoption.selected_version, updatedPreset.preset.selected_version + 1);
  const remainingCandidates = (await (await fetch(`${base}/source-adoption-candidates`)).json()).candidates;
  assert.equal(remainingCandidates.length, 1);
  assert.equal(remainingCandidates[0].compatible_presets[0].id, "planning-copy");

  const createdFeedback = await (await fetch(`${base}/skills/${imported.skills[0].lineage_id}/feedback`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      scope: "project",
      project_id: "demo",
      outcome: "success",
      evidence_type: "evaluation",
      summary: "Planning output covered the expected constraints.",
      metrics: { attempted: 1, successful: 1 },
    }),
  })).json();
  const feedbackSummary = await (await fetch(`${base}/skills/${imported.skills[0].lineage_id}/feedback-summary`)).json();
  assert.equal(createdFeedback.feedback.outcome, "success");
  assert.equal(feedbackSummary.reported_metrics.successful, 1);

  const sourceReview = await (await fetch(`${base}/source-revisions/${imported.source_revision_id}/review`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ decision: "approved", summary: "Initial revision reviewed." }),
  })).json();
  const loadedReview = await (await fetch(`${base}/source-revisions/${imported.source_revision_id}/review`)).json();
  assert.equal(sourceReview.review.decision, "approved");
  assert.equal(loadedReview.review.id, sourceReview.review.id);

  const createdCase = await (await fetch(`${base}/evaluation-cases`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      id: "planning-contract",
      lineage_id: imported.skills[0].lineage_id,
      name: "Planning contract",
      objective: "Check planning output.",
      criteria: ["Captures constraints"],
      lifecycle: "active",
    }),
  })).json();
  const createdRun = await (await fetch(`${base}/evaluation-cases/planning-contract/runs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      source_revision_id: imported.skills[0].source_revision_id,
      outcome: "passed",
      summary: "Constraint coverage passed.",
      criterion_results: [{ criterion: "Captures constraints", outcome: "passed" }],
    }),
  })).json();
  const evaluationSummary = await (await fetch(`${base}/skills/${imported.skills[0].lineage_id}/evaluation-summary?source_revision_id=${imported.skills[0].source_revision_id}`)).json();
  const reviewQueue = await (await fetch(`${base}/review-queue`)).json();
  assert.equal(createdCase.evaluation_case.selected_version, 1);
  assert.equal(createdRun.run.outcome, "passed");
  assert.equal(evaluationSummary.evaluated_active_case_count, 1);
  assert.ok(reviewQueue.items.length >= 1);

  const recorded = await (await fetch(`${base}/projects/demo/activation-plan`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  })).json();
  const report = await (await fetch(`${base}/activation-plans/${recorded.plan.plan_id}/report`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      plan_id: recorded.plan.plan_id,
      completed_at: "2026-08-14T00:00:00.000Z",
      operations: [],
      summary: { applied: 1 },
    }),
  })).json();
  const updatedHistory = await (await fetch(`${base}/projects/demo/history`)).json();
  assert.equal(report.report.plan_id, recorded.plan.plan_id);
  assert.equal(updatedHistory.history[0].reports.length, 1);

  const observed = await (await fetch(`${base}/projects/demo/observed-state`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      provider_id: "codex",
      inventory: { checked_at: 1, providers: [{ provider_id: "codex", detected: true, reachable: true }], orca: {} },
      bindings: [{ provider_id: "codex", state: "enabled", target_path: recorded.plan.operations[0].delivery_path }],
    }),
  })).json();
  const observedComparison = await (await fetch(`${base}/activation-plans/${recorded.plan.plan_id}/observed-state-comparison`)).json();
  assert.equal(observed.observed_state.project_id, "demo");
  assert.equal(observedComparison.in_sync, true);
});
