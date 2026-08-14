const http = require("node:http");
const { URL } = require("node:url");
const { listActivationHistory, listProjects, recordActivationPlan, recordActivationReport } = require("./catalog-state");
const { createProjectPlan, resolveProjectEffectiveSet, resolveProjectSelection } = require("./catalog-workflows");
const { addSkillFeedback, getSkillFeedbackSummary, listSkillFeedback } = require("./skill-management");

function json(response, status, value) {
  response.writeHead(status, {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "content-type": "application/json; charset=utf-8",
  });
  response.end(`${JSON.stringify(value, null, 2)}\n`);
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
        reject(new Error("Request body must be valid JSON"));
      }
    });
    request.on("error", reject);
  });
}

function workScopeTags(url, body = {}) {
  if (Array.isArray(body.work_scope_tags)) return body.work_scope_tags;
  return url.searchParams.getAll("work_scope");
}

function createCatalogServer({ catalogRoot, registryRoot }) {
  if (!catalogRoot || !registryRoot) throw new Error("catalogRoot and registryRoot are required");
  return http.createServer(async (request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    if (request.method === "OPTIONS") return json(response, 204, {});
    try {
      if (request.method === "GET" && url.pathname === "/api/projects") {
        return json(response, 200, { projects: await listProjects(catalogRoot) });
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
      const history = url.pathname.match(/^\/api\/projects\/([^/]+)\/history$/);
      if (request.method === "GET" && history) {
        return json(response, 200, { history: await listActivationHistory({
          catalogRoot,
          projectId: decodeURIComponent(history[1]),
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
      return json(response, 404, { error: "Not found" });
    } catch (error) {
      return json(response, 400, { error: error.message, issues: error.issues ?? [] });
    }
  });
}

async function startCatalogServer({ catalogRoot, registryRoot, host = "127.0.0.1", port = 4300 }) {
  const server = createCatalogServer({ catalogRoot, registryRoot });
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
