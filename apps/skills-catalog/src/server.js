const http = require("node:http");
const { URL } = require("node:url");
const { assignPreset, createPreset, getProject, listActivationHistory, listPresets, listProjectPresetAssignments, listProjects, recordActivationPlan, recordActivationReport, replaceWorkScopeOverlay, updatePresetTemplate } = require("./catalog-state");
const { buildProjectSystemPrompt, createProjectPlan, resolveProjectEffectiveSet, resolveProjectSelection } = require("./catalog-workflows");
const { addSkillFeedback, addSkillNote, getSkillFeedbackSummary, getSkillProfile, listSkillFeedback, listSkillNotes, searchSkills, updateSkillProfile } = require("./skill-management");
const { createEvaluationCase, getSkillEvaluationSummary, listEvaluationCases, listEvaluationRuns, listReviewQueue, recordEvaluationRun } = require("./evaluation");
const { compareRecordedPlanWithObservedState, listObservedStates, recordObservedState } = require("./observed-state");
const { adoptApprovedRevisionIntoPreset, latestSourceReview, listSourceAdoptionCandidates, recordSourceReview } = require("./source-review");
const { latestSkillsByArtifact, listRegistrySkills } = require("./registry");
const { createSkillsManagerInspector } = require("./upstream-inspector");
const { applyRecordedActivationPlan } = require("./upstream-apply");
const { applyRecipe, exportRecipe, inspectRecipe } = require("./recipes");
const { getTelemetrySummary, recordTelemetry } = require("./telemetry");
const {
  listHooks,
  registerHook,
  removeHook,
  updateHookStatus,
  compileProviderConfigs,
  triggerHookEvent,
} = require("./hooks-manager");
const {
  spawnProcedureWorkspace,
  pruneProcedureWorkspace,
  listProcedureWorkspaces,
  getProcedureWorkspace,
} = require("./workspace-manager");
const {
  enqueueWorkspace,
  verifyWorkspace,
  discardWorkspace,
  mergeWorkspace,
  getQueueStatus,
  processQueue,
} = require("./sequential-merger");
const {
  checkSkillUpdates,
  applySkillUpdates,
  rollbackSkillUpdate,
  listBackupSnapshots,
} = require("./skills-updater");
const {
  createPlan,
  getPlan,
  listPlans,
  deletePlan,
  transitionObligation,
  recordPlanVerification,
  issuePlanCertificate,
  calculatePlanGap,
  getReadyObligations,
  getEventHistory,
} = require("./ledger-store");

function json(response, status, value) {
  response.writeHead(status, {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "content-type": "application/json; charset=utf-8",
  });
  response.end(`${JSON.stringify(value, null, 2)}\n`);
}

function streamJson(response, value) {
  response.write(`${JSON.stringify(value)}\n`);
}

function parseJsonBody(request) {
  return new Promise((resolve, reject) => {
    const parts = [];
    let size = 0;
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > 64 * 1024) {
        reject(new Error("Request body is too large"));
        request.destroy();
        return;
      }
      parts.push(chunk);
    });
    request.on("end", () => {
      if (parts.length === 0) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(parts).toString("utf8")));
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    request.on("error", reject);
  });
}

function workScopeTags(url, body = {}) {
  if (Array.isArray(body.work_scope_tags)) return body.work_scope_tags;
  return url.searchParams.getAll("work_scope");
}

function createCatalogServer({ catalogRoot, registryRoot, telemetryPath, upstreamInspector = createSkillsManagerInspector(), upstreamCli = upstreamInspector }) {
  if (!catalogRoot || !registryRoot) throw new Error("catalogRoot and registryRoot are required");
  return http.createServer(async (request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    if (request.method === "OPTIONS") return json(response, 204, {});
    try {
      if (request.method === "GET" && url.pathname === "/api/projects") {
        return json(response, 200, { projects: await listProjects(catalogRoot) });
      }
      if (request.method === "GET" && url.pathname === "/api/upstream-status") {
        return json(response, 200, { status: await upstreamInspector.inspect() });
      }
      if (request.method === "GET" && url.pathname === "/api/presets") {
        return json(response, 200, { presets: await listPresets(catalogRoot) });
      }
      if (request.method === "POST" && url.pathname === "/api/presets") {
        const body = await parseJsonBody(request);
        return json(response, 201, { preset: await createPreset({
          catalogRoot,
          registryRoot,
          id: body.id,
          name: body.name,
          description: body.description,
          purpose: body.purpose,
          workScopeTags: body.work_scope_tags,
          owner: body.owner,
          lifecycle: body.lifecycle,
          registrySkillIds: body.registry_skill_ids,
        }) });
      }
      if (request.method === "GET" && url.pathname === "/api/registry/skills") {
        return json(response, 200, { skills: latestSkillsByArtifact(await listRegistrySkills(registryRoot)) });
      }
      if (request.method === "GET" && url.pathname === "/api/skills") {
        return json(response, 200, { skills: await searchSkills({
          catalogRoot,
          registryRoot,
          query: url.searchParams.get("query") ?? "",
          tags: url.searchParams.getAll("tag"),
          domains: url.searchParams.getAll("domain"),
          providerId: url.searchParams.get("provider") ?? undefined,
          reviewState: url.searchParams.get("review_state") ?? undefined,
          artifactType: url.searchParams.get("artifact_type") ?? url.searchParams.get("type") ?? undefined,
          invocationMode: url.searchParams.get("invocation_mode") ?? url.searchParams.get("invoker") ?? undefined,
        }) });
      }
      const presetUpdate = url.pathname.match(/^\/api\/presets\/([^/]+)\/update$/);
      if (presetUpdate && request.method === "POST") {
        const body = await parseJsonBody(request);
        return json(response, 201, { preset: await updatePresetTemplate({
          catalogRoot,
          registryRoot,
          presetId: decodeURIComponent(presetUpdate[1]),
          patch: {
            name: body.name,
            description: body.description,
            purpose: body.purpose,
            workScopeTags: body.work_scope_tags,
            owner: body.owner,
            lifecycle: body.lifecycle,
            registrySkillIds: body.registry_skill_ids,
          },
        }) });
      }
      const defaultAssignment = url.pathname.match(/^\/api\/projects\/([^/]+)\/default-preset$/);
      if (defaultAssignment && request.method === "POST") {
        const body = await parseJsonBody(request);
        const project = await assignPreset({
          catalogRoot,
          projectId: decodeURIComponent(defaultAssignment[1]),
          presetId: body.preset_id,
          version: body.template_version,
          role: "default",
        });
        return json(response, 201, {
          project,
          assignment: project.preset_assignments.find((item) => item.role === "default") ?? null,
        });
      }
      const projectAssignments = url.pathname.match(/^\/api\/projects\/([^/]+)\/preset-assignments$/);
      if (projectAssignments && request.method === "GET") {
        return json(response, 200, { assignments: await listProjectPresetAssignments(catalogRoot, decodeURIComponent(projectAssignments[1])) });
      }
      const workScopeOverlay = url.pathname.match(/^\/api\/projects\/([^/]+)\/work-scope-overlay$/);
      if (workScopeOverlay && request.method === "POST") {
        const body = await parseJsonBody(request);
        const project = await replaceWorkScopeOverlay({
          catalogRoot,
          projectId: decodeURIComponent(workScopeOverlay[1]),
          presetId: body.preset_id || null,
          version: body.template_version,
          workScopeTags: body.work_scope_tags,
          priority: body.priority,
        });
        return json(response, 201, { project, assignments: project.preset_assignments.filter((item) => item.role === "work_scope_overlay") });
      }
      if (request.method === "GET" && url.pathname === "/api/source-adoption-candidates") {
        return json(response, 200, { candidates: await listSourceAdoptionCandidates({ catalogRoot, registryRoot }) });
      }
      const sourceReview = url.pathname.match(/^\/api\/source-revisions\/([^/]+)\/review$/);
      if (sourceReview && request.method === "GET") {
        return json(response, 200, { review: await latestSourceReview({ catalogRoot, sourceRevisionId: decodeURIComponent(sourceReview[1]) }) });
      }
      if (sourceReview && request.method === "POST") {
        const body = await parseJsonBody(request);
        return json(response, 201, { review: await recordSourceReview({
          catalogRoot, registryRoot, sourceRevisionId: decodeURIComponent(sourceReview[1]), decision: body.decision,
          summary: body.summary, reviewer: body.reviewer,
        }) });
      }
      const presetAdoption = url.pathname.match(/^\/api\/presets\/([^/]+)\/adopt$/);
      if (presetAdoption && request.method === "POST") {
        const body = await parseJsonBody(request);
        return json(response, 201, { adoption: await adoptApprovedRevisionIntoPreset({
          catalogRoot, registryRoot, presetId: decodeURIComponent(presetAdoption[1]), registrySkillId: body.registry_skill_id,
        }) });
      }
      if (request.method === "GET" && url.pathname === "/api/review-queue") {
        return json(response, 200, { items: await listReviewQueue({ catalogRoot, registryRoot }) });
      }
      if (request.method === "GET" && url.pathname === "/api/evaluation-cases") {
        return json(response, 200, { cases: await listEvaluationCases({
          catalogRoot,
          lineageId: url.searchParams.get("lineage_id") ?? undefined,
          lifecycle: url.searchParams.get("lifecycle") ?? undefined,
          includeRetired: url.searchParams.get("include_retired") === "true",
        }) });
      }
      if (request.method === "POST" && url.pathname === "/api/evaluation-cases") {
        const body = await parseJsonBody(request);
        return json(response, 201, { evaluation_case: await createEvaluationCase({
          catalogRoot,
          registryRoot,
          id: body.id,
          lineageId: body.lineage_id,
          name: body.name,
          objective: body.objective,
          criteria: body.criteria,
          owner: body.owner,
          lifecycle: body.lifecycle,
        }) });
      }
      const evaluationRuns = url.pathname.match(/^\/api\/evaluation-cases\/([^/]+)\/runs$/);
      if (evaluationRuns && request.method === "GET") {
        return json(response, 200, { runs: await listEvaluationRuns({
          catalogRoot,
          caseId: decodeURIComponent(evaluationRuns[1]),
          sourceRevisionId: url.searchParams.get("source_revision_id") ?? undefined,
          outcome: url.searchParams.get("outcome") ?? undefined,
        }) });
      }
      if (evaluationRuns && request.method === "POST") {
        const body = await parseJsonBody(request);
        return json(response, 201, { run: await recordEvaluationRun({
          catalogRoot,
          registryRoot,
          caseId: decodeURIComponent(evaluationRuns[1]),
          version: body.case_version,
          sourceRevisionId: body.source_revision_id,
          outcome: body.outcome,
          summary: body.summary,
          details: body.details,
          author: body.author,
          criterionResults: body.criterion_results,
        }) });
      }
      const evaluationSummary = url.pathname.match(/^\/api\/skills\/([^/]+)\/evaluation-summary$/);
      if (evaluationSummary && request.method === "GET") {
        return json(response, 200, await getSkillEvaluationSummary({
          catalogRoot,
          registryRoot,
          lineageId: decodeURIComponent(evaluationSummary[1]),
          sourceRevisionId: url.searchParams.get("source_revision_id") ?? undefined,
        }));
      }
      const feedback = url.pathname.match(/^\/api\/skills\/([^/]+)\/feedback$/);
      if (feedback && request.method === "GET") {
        return json(response, 200, { feedback: await listSkillFeedback({
          catalogRoot,
          lineageId: decodeURIComponent(feedback[1]),
          scope: url.searchParams.get("scope") ?? undefined,
          outcome: url.searchParams.get("outcome") ?? undefined,
          evidenceType: url.searchParams.get("evidence_type") ?? undefined,
          projectId: url.searchParams.get("project_id") ?? undefined,
          sourceRevisionId: url.searchParams.get("source_revision_id") ?? undefined,
        }) });
      }
      if (feedback && request.method === "POST") {
        const body = await parseJsonBody(request);
        return json(response, 201, { feedback: await addSkillFeedback({
          catalogRoot,
          registryRoot,
          lineageId: decodeURIComponent(feedback[1]),
          scope: body.scope,
          outcome: body.outcome,
          evidenceType: body.evidence_type,
          summary: body.summary,
          details: body.details,
          author: body.author,
          projectId: body.project_id,
          sourceRevisionId: body.source_revision_id,
          presetId: body.preset_id,
          activationPlanId: body.activation_plan_id,
          redaction: body.redaction,
          metrics: body.metrics,
        }) });
      }
      const notes = url.pathname.match(/^\/api\/skills\/([^/]+)\/notes$/);
      if (notes && request.method === "GET") {
        return json(response, 200, { notes: await listSkillNotes({
          catalogRoot,
          lineageId: decodeURIComponent(notes[1]),
          scope: url.searchParams.get("scope") ?? undefined,
          projectId: url.searchParams.get("project_id") ?? undefined,
          presetId: url.searchParams.get("preset_id") ?? undefined,
          sourceRevisionId: url.searchParams.get("source_revision_id") ?? undefined,
        }) });
      }
      if (notes && request.method === "POST") {
        const body = await parseJsonBody(request);
        return json(response, 201, { note: await addSkillNote({
          catalogRoot,
          registryRoot,
          lineageId: decodeURIComponent(notes[1]),
          scope: body.scope,
          kind: body.kind,
          body: body.body,
          author: body.author,
          projectId: body.project_id,
          sourceRevisionId: body.source_revision_id,
          presetId: body.preset_id,
          activationPlanId: body.activation_plan_id,
          visibility: body.visibility,
          injectIntoPrompt: body.inject_into_prompt === true,
        }) });
      }
      const skillProfile = url.pathname.match(/^\/api\/skills\/([^/]+)\/profile$/);
      if (skillProfile && request.method === "GET") {
        return json(response, 200, { profile: await getSkillProfile({
          catalogRoot,
          registryRoot,
          lineageId: decodeURIComponent(skillProfile[1]),
        }) });
      }
      if (skillProfile && request.method === "POST") {
        const body = await parseJsonBody(request);
        return json(response, 201, { profile: await updateSkillProfile({
          catalogRoot,
          registryRoot,
          lineageId: decodeURIComponent(skillProfile[1]),
          patch: body,
        }) });
      }
      const feedbackSummary = url.pathname.match(/^\/api\/skills\/([^/]+)\/feedback-summary$/);
      if (feedbackSummary && request.method === "GET") {
        return json(response, 200, await getSkillFeedbackSummary({
          catalogRoot,
          registryRoot,
          lineageId: decodeURIComponent(feedbackSummary[1]),
          projectId: url.searchParams.get("project_id") ?? undefined,
          sourceRevisionId: url.searchParams.get("source_revision_id") ?? undefined,
        }));
      }
      const effective = url.pathname.match(/^\/api\/projects\/([^/]+)\/effective-set$/);
      if (request.method === "GET" && effective) {
        return json(response, 200, await resolveProjectEffectiveSet({
          catalogRoot,
          registryRoot,
          projectId: decodeURIComponent(effective[1]),
          presetId: url.searchParams.get("preset") ?? undefined,
          workScopeTags: workScopeTags(url),
        }));
      }
      const upstreamStatus = url.pathname.match(/^\/api\/projects\/([^/]+)\/upstream-status$/);
      if (request.method === "GET" && upstreamStatus) {
        const project = await getProject(catalogRoot, decodeURIComponent(upstreamStatus[1]));
        return json(response, 200, { status: await upstreamInspector.inspect({ projectId: project.upstream_project_id }) });
      }
      const systemPrompt = url.pathname.match(/^\/api\/projects\/([^/]+)\/system-prompt$/);
      if (request.method === "GET" && systemPrompt) {
        return json(response, 200, await buildProjectSystemPrompt({
          catalogRoot,
          registryRoot,
          projectId: decodeURIComponent(systemPrompt[1]),
          presetId: url.searchParams.get("preset") ?? undefined,
          workScopeTags: workScopeTags(url),
          includeInjectedNotes: url.searchParams.get("include_notes") === "true",
        }));
      }
      const history = url.pathname.match(/^\/api\/projects\/([^/]+)\/history$/);
      if (request.method === "GET" && history) {
        return json(response, 200, { history: await listActivationHistory({
          catalogRoot,
          projectId: decodeURIComponent(history[1]),
        }) });
      }
      const observedState = url.pathname.match(/^\/api\/projects\/([^/]+)\/observed-state$/);
      if (observedState && request.method === "GET") {
        return json(response, 200, { observed_states: await listObservedStates({
          catalogRoot,
          projectId: decodeURIComponent(observedState[1]),
          providerId: url.searchParams.get("provider_id") ?? undefined,
        }) });
      }
      if (observedState && request.method === "POST") {
        const body = await parseJsonBody(request);
        return json(response, 201, { observed_state: await recordObservedState({
          catalogRoot,
          projectId: decodeURIComponent(observedState[1]),
          providerId: body.provider_id,
          inventory: body.inventory,
          bindings: body.bindings,
          capturedAt: body.captured_at,
          source: body.source,
        }) });
      }
      const preview = url.pathname.match(/^\/api\/projects\/([^/]+)\/activation-plan\/preview$/);
      if (request.method === "POST" && preview) {
        const body = await parseJsonBody(request);
        const projectId = decodeURIComponent(preview[1]);
        const tags = workScopeTags(url, body);
        const [effectiveSet, plan] = await Promise.all([
          resolveProjectEffectiveSet({ catalogRoot, registryRoot, projectId, presetId: body.preset_id, workScopeTags: tags }),
          createProjectPlan({ catalogRoot, registryRoot, projectId, presetId: body.preset_id, workScopeTags: tags, distribution: body.distribution }),
        ]);
        return json(response, 200, { effective_set: effectiveSet, plan });
      }
      const recordPlan = url.pathname.match(/^\/api\/projects\/([^/]+)\/activation-plan$/);
      if (request.method === "POST" && recordPlan) {
        const body = await parseJsonBody(request);
        const projectId = decodeURIComponent(recordPlan[1]);
        const tags = workScopeTags(url, body);
        const [selection, plan] = await Promise.all([
          resolveProjectSelection({ catalogRoot, projectId, presetId: body.preset_id, workScopeTags: tags }),
          createProjectPlan({ catalogRoot, registryRoot, projectId, presetId: body.preset_id, workScopeTags: tags, distribution: body.distribution }),
        ]);
        return json(response, 201, { record: await recordActivationPlan({
          catalogRoot,
          plan,
          projectId,
          assignments: selection.assignments,
        }), plan });
      }
      const report = url.pathname.match(/^\/api\/activation-plans\/([^/]+)\/report$/);
      if (request.method === "POST" && report) {
        const body = await parseJsonBody(request);
        return json(response, 201, { report: await recordActivationReport({
          catalogRoot,
          planId: decodeURIComponent(report[1]),
          report: body,
        }) });
      }
      const apply = url.pathname.match(/^\/api\/activation-plans\/([^/]+)\/apply$/);
      if (request.method === "POST" && apply) {
        const body = await parseJsonBody(request);
        const result = await applyRecordedActivationPlan({
          catalogRoot,
          planId: decodeURIComponent(apply[1]),
          confirmed: body.confirmed === true,
          upstreamCli,
        });
        return json(response, result.status === "confirmation_required" ? 409 : 201, result);
      }
      const applyStream = url.pathname.match(/^\/api\/activation-plans\/([^/]+)\/apply\/stream$/);
      if (request.method === "POST" && applyStream) {
        const body = await parseJsonBody(request);
        response.writeHead(200, {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "GET, POST, OPTIONS",
          "access-control-allow-headers": "content-type",
          "content-type": "application/x-ndjson; charset=utf-8",
          "cache-control": "no-cache",
        });
        try {
          const result = await applyRecordedActivationPlan({
            catalogRoot,
            planId: decodeURIComponent(applyStream[1]),
            confirmed: body.confirmed === true,
            upstreamCli,
            onProgress: (progress) => streamJson(response, { type: "progress", progress }),
          });
          streamJson(response, { type: "result", result });
        } catch (error) {
          streamJson(response, { type: "error", error: error.message });
        }
        response.end();
        return;
      }
      const observedComparison = url.pathname.match(/^\/api\/activation-plans\/([^/]+)\/observed-state-comparison$/);
      if (observedComparison && request.method === "GET") {
        return json(response, 200, await compareRecordedPlanWithObservedState({
          catalogRoot,
          planId: decodeURIComponent(observedComparison[1]),
          observedStateId: url.searchParams.get("observed_state_id") ?? undefined,
        }));
      }
      if (url.pathname === "/api/recipes/export" && request.method === "GET") {
        return json(response, 200, {
          recipe: await exportRecipe({
            catalogRoot,
            registryRoot,
            projectId: url.searchParams.get("project_id") ?? undefined,
            presetId: url.searchParams.get("preset_id") ?? undefined,
            name: url.searchParams.get("name") ?? undefined,
            description: url.searchParams.get("description") ?? undefined,
          }),
        });
      }
      if (url.pathname === "/api/recipes/inspect" && request.method === "POST") {
        const body = await parseJsonBody(request);
        return json(response, 200, await inspectRecipe({ recipeContent: body.recipe }));
      }
      if (url.pathname === "/api/recipes/apply" && request.method === "POST") {
        const body = await parseJsonBody(request);
        return json(response, 200, await applyRecipe({
          catalogRoot,
          registryRoot,
          recipeContent: body.recipe,
          projectPath: body.project_path,
          providerId: body.provider_id,
          confirm: body.confirm === true,
        }));
      }
      if (url.pathname === "/api/telemetry/record" && request.method === "POST") {
        const body = await parseJsonBody(request);
        return json(response, 201, await recordTelemetry({
          catalogRoot,
          registryRoot,
          telemetryPath,
          payload: body,
        }));
      }
      if (url.pathname === "/api/telemetry/summary" && request.method === "GET") {
        return json(response, 200, await getTelemetrySummary({
          catalogRoot,
          registryRoot,
          telemetryPath,
          projectId: url.searchParams.get("project_id") ?? undefined,
          providerId: url.searchParams.get("provider_id") ?? undefined,
          skillName: url.searchParams.get("skill_name") ?? undefined,
          since: url.searchParams.get("since") ?? undefined,
          limit: url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : 20,
        }));
      }
      if (url.pathname === "/api/hooks" && request.method === "GET") {
        const projectPath = url.searchParams.get("project_path") ?? process.cwd();
        const eventName = url.searchParams.get("event") ?? undefined;
        return json(response, 200, {
          hooks: listHooks({ projectPath, eventName }),
        });
      }
      if (url.pathname === "/api/hooks/register" && request.method === "POST") {
        const body = await parseJsonBody(request);
        const projectPath = body.project_path ?? process.cwd();
        return json(response, 201, registerHook({
          projectPath,
          hook: body.hook,
          sync: body.sync !== false,
        }));
      }
      if (url.pathname === "/api/hooks/toggle" && request.method === "POST") {
        const body = await parseJsonBody(request);
        const projectPath = body.project_path ?? process.cwd();
        return json(response, 200, updateHookStatus({
          projectPath,
          hookId: body.hook_id,
          enabled: body.enabled,
          sync: body.sync !== false,
        }));
      }
      if (url.pathname === "/api/hooks/remove" && request.method === "POST") {
        const body = await parseJsonBody(request);
        const projectPath = body.project_path ?? process.cwd();
        return json(response, 200, removeHook({
          projectPath,
          hookId: body.hook_id,
          sync: body.sync !== false,
        }));
      }
      if (url.pathname === "/api/hooks/sync" && request.method === "POST") {
        const body = await parseJsonBody(request);
        const projectPath = body.project_path ?? process.cwd();
        return json(response, 200, compileProviderConfigs({ projectPath }));
      }
      if (url.pathname === "/api/hooks/trigger" && request.method === "POST") {
        const body = await parseJsonBody(request);
        const projectPath = body.project_path ?? process.cwd();
        return json(response, 200, await triggerHookEvent({
          projectPath,
          eventName: body.event ?? "post_tool_use",
          payload: body.payload ?? {},
        }));
      }
      if (request.method === "GET" && url.pathname === "/api/workspaces") {
        const projectPath = url.searchParams.get("project_path") ?? process.cwd();
        const status = url.searchParams.get("status") ?? undefined;
        const [workspaces, queueStatus] = await Promise.all([
          listProcedureWorkspaces({ project_path: projectPath, status }),
          getQueueStatus({ project_path: projectPath }),
        ]);
        return json(response, 200, {
          workspaces,
          merge_queue: queueStatus.queue,
          queue_status: queueStatus,
        });
      }
      if (request.method === "GET" && url.pathname === "/api/workspaces/queue") {
        const projectPath = url.searchParams.get("project_path") ?? process.cwd();
        const queueStatus = await getQueueStatus({ project_path: projectPath });
        return json(response, 200, queueStatus);
      }
      if (request.method === "POST" && url.pathname === "/api/workspaces/spawn") {
        const body = await parseJsonBody(request);
        const projectPath = body.project_path ?? body.projectPath ?? url.searchParams.get("project_path") ?? process.cwd();
        const workspace = await spawnProcedureWorkspace({
          procedure_type: body.procedure_type ?? body.procedureType,
          task_id: body.task_id ?? body.taskId ?? body.workspace_id ?? body.workspaceId,
          recipe_id: body.recipe_id ?? body.recipeId,
          preset_id: body.preset_id ?? body.presetId,
          target_test_file: body.target_test_file ?? body.targetTestFile,
          owned_files: body.owned_files ?? body.ownedFiles,
          prohibited_actions: body.prohibited_actions ?? body.prohibitedActions,
          acceptance_criteria: body.acceptance_criteria ?? body.acceptanceCriteria,
          project_path: projectPath,
          base_ref: body.base_ref ?? body.baseRef,
          active_skills: body.active_skills ?? body.activeSkills,
          active_guards: body.active_guards ?? body.activeGuards,
          metadata: body.metadata,
        });
        return json(response, 201, { workspace });
      }
      if (request.method === "POST" && url.pathname === "/api/workspaces/verify") {
        const body = await parseJsonBody(request);
        const workspaceId = body.task_id ?? body.taskId ?? body.workspace_id ?? body.workspaceId;
        if (!workspaceId) {
          return json(response, 400, { error: "task_id or workspace_id is required" });
        }
        const projectPath = body.project_path ?? body.projectPath ?? url.searchParams.get("project_path") ?? process.cwd();
        const result = await verifyWorkspace(workspaceId, { project_path: projectPath });
        return json(response, 200, {
          verified: result.verified,
          workspace_id: result.workspace_id,
          test_output: result.test_output,
          invariant_checks: result.invariant_checks,
          issues: result.issues,
        });
      }
      if (request.method === "POST" && url.pathname === "/api/workspaces/merge") {
        const body = await parseJsonBody(request);
        const workspaceId = body.task_id ?? body.taskId ?? body.workspace_id ?? body.workspaceId;
        if (!workspaceId) {
          return json(response, 400, { error: "task_id or workspace_id is required" });
        }
        const projectPath = body.project_path ?? body.projectPath ?? url.searchParams.get("project_path") ?? process.cwd();
        try {
          const result = await mergeWorkspace(workspaceId, {
            project_path: projectPath,
            force: body.force === true,
          });
          return json(response, 200, {
            merged: result.merged,
            workspace_id: result.workspace_id,
            commit_hash: result.commit_hash,
            status: result.status,
          });
        } catch (mergeErr) {
          const status = mergeErr.code === "DEPENDENCY_NOT_MERGED" || mergeErr.code === "VERIFICATION_FAILED" ? 409 : 400;
          return json(response, status, {
            error: mergeErr.message,
            code: mergeErr.code,
            dependency: mergeErr.dependency,
            verification_result: mergeErr.verificationResult,
          });
        }
      }
      if (request.method === "POST" && url.pathname === "/api/workspaces/prune") {
        const body = await parseJsonBody(request);
        const workspaceId = body.task_id ?? body.taskId ?? body.workspace_id ?? body.workspaceId;
        if (!workspaceId) {
          return json(response, 400, { error: "task_id or workspace_id is required" });
        }
        const projectPath = body.project_path ?? body.projectPath ?? url.searchParams.get("project_path") ?? process.cwd();
        const result = await pruneProcedureWorkspace(workspaceId, {
          project_path: projectPath,
          delete_branch: body.delete_branch !== false && body.deleteBranch !== false,
        });
        return json(response, 200, {
          pruned: result.pruned,
          workspace_id: result.workspace_id,
          completed_at: result.completed_at,
        });
      }
      if (request.method === "POST" && url.pathname === "/api/workspaces/enqueue") {
        const body = await parseJsonBody(request);
        const workspaceId = body.task_id ?? body.taskId ?? body.workspace_id ?? body.workspaceId;
        if (!workspaceId) {
          return json(response, 400, { error: "task_id or workspace_id is required" });
        }
        const projectPath = body.project_path ?? body.projectPath ?? url.searchParams.get("project_path") ?? process.cwd();
        const result = await enqueueWorkspace(workspaceId, {
          project_path: projectPath,
          dependencies: body.dependencies ?? [],
          task_id: body.task_id ?? body.taskId,
        });
        return json(response, 201, result);
      }
      if (request.method === "POST" && url.pathname === "/api/workspaces/discard") {
        const body = await parseJsonBody(request);
        const workspaceId = body.task_id ?? body.taskId ?? body.workspace_id ?? body.workspaceId;
        if (!workspaceId) {
          return json(response, 400, { error: "task_id or workspace_id is required" });
        }
        const projectPath = body.project_path ?? body.projectPath ?? url.searchParams.get("project_path") ?? process.cwd();
        const result = await discardWorkspace(workspaceId, {
          project_path: projectPath,
          reason: body.reason,
        });
        return json(response, 200, result);
      }
      if (request.method === "GET" && (url.pathname === "/api/skills/updates" || url.pathname === "/api/updates")) {
        const result = await checkSkillUpdates({ registryRoot });
        return json(response, 200, result);
      }
      if (request.method === "POST" && (url.pathname === "/api/skills/updates/apply" || url.pathname === "/api/updates/apply")) {
        const body = await parseJsonBody(request).catch(() => ({}));
        const result = await applySkillUpdates({
          registryRoot,
          sourceIds: body.source_ids ?? body.sourceIds ?? [],
          dryRun: Boolean(body.dry_run ?? body.dryRun),
          createBackup: body.create_backup !== false && body.createBackup !== false,
          runVerification: body.run_verification !== false && body.runVerification !== false,
        });
        return json(response, 200, result);
      }
      if (request.method === "POST" && (url.pathname === "/api/skills/updates/rollback" || url.pathname === "/api/updates/rollback")) {
        const body = await parseJsonBody(request).catch(() => ({}));
        const result = await rollbackSkillUpdate({ backupId: body.backup_id ?? body.backupId });
        return json(response, 200, result);
      }
      if (request.method === "GET" && (url.pathname === "/api/skills/updates/backups" || url.pathname === "/api/updates/backups")) {
        const result = await listBackupSnapshots();
        return json(response, 200, { backups: result });
      }
      if (request.method === "GET" && url.pathname === "/api/ledgers") {
        const result = await listPlans({
          filter: {
            status: url.searchParams.get("status") || undefined,
            phase: url.searchParams.get("phase") || undefined,
          },
        });
        return json(response, 200, { plans: result });
      }
      if (request.method === "POST" && url.pathname === "/api/ledgers") {
        const body = await parseJsonBody(request).catch(() => ({}));
        const result = await createPlan({
          planId: body.plan_id ?? body.planId,
          title: body.title,
          contract: body.contract,
          actor: body.actor || "api_client",
        });
        return json(response, 201, result);
      }
      if (request.method === "GET" && url.pathname.startsWith("/api/ledgers/")) {
        const parts = url.pathname.slice("/api/ledgers/".length).split("/");
        const planId = decodeURIComponent(parts[0]);
        const subAction = parts[1];

        if (!subAction) {
          const result = await getPlan(planId);
          return json(response, 200, result);
        }
        if (subAction === "gap") {
          const result = await calculatePlanGap(planId);
          return json(response, 200, result);
        }
        if (subAction === "ready") {
          const result = await getReadyObligations(planId);
          return json(response, 200, { ready_obligations: result });
        }
        if (subAction === "events" || subAction === "history") {
          const result = await getEventHistory(planId);
          return json(response, 200, { events: result });
        }
      }
      if (request.method === "POST" && url.pathname.startsWith("/api/ledgers/")) {
        const parts = url.pathname.slice("/api/ledgers/".length).split("/");
        const planId = decodeURIComponent(parts[0]);
        const subAction = parts[1];
        const body = await parseJsonBody(request).catch(() => ({}));

        if (subAction === "transition") {
          const result = await transitionObligation(
            planId,
            body.obligation_id ?? body.obligationId,
            body.status,
            { actor: body.actor || "api_client", reason: body.reason }
          );
          return json(response, 200, result);
        }
        if (subAction === "verify") {
          const result = await recordPlanVerification(planId, body, {
            actor: body.actor || "independent_auditor",
          });
          return json(response, 200, result);
        }
        if (subAction === "certificate") {
          const result = await issuePlanCertificate(planId, body, {
            actor: body.actor || "gatekeeper",
          });
          return json(response, 200, result);
        }
      }
      if (request.method === "DELETE" && url.pathname.startsWith("/api/ledgers/")) {
        const planId = decodeURIComponent(url.pathname.slice("/api/ledgers/".length));
        const result = await deletePlan(planId);
        return json(response, 200, result);
      }
      return json(response, 404, { error: "Not found" });
    } catch (error) {
      return json(response, 400, { error: error.message, issues: error.issues ?? [] });
    }
  });
}

async function startCatalogServer({ catalogRoot, registryRoot, telemetryPath, host = "127.0.0.1", port = 4300 }) {
  const server = createCatalogServer({ catalogRoot, registryRoot, telemetryPath });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });
  return server;
}

module.exports = { createCatalogServer, startCatalogServer };
