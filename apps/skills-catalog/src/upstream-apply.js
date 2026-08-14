const { digestDirectory } = require("../../../packages/skill-contracts/src");
const { getProject, loadCatalog, recordActivationReport } = require("./catalog-state");

function upstreamProjectId(project) {
  return project.scope === "project" ? project.upstream_project_id : null;
}

function scopeArgs(project) {
  const id = upstreamProjectId(project);
  return id ? ["--project", id] : [];
}

async function resolveOperation(operation, upstreamSkills, project) {
  const expectedScope = project.scope;
  const candidates = upstreamSkills.filter((skill) => skill.name === operation.skill_name
    && skill.scope === expectedScope
    && (expectedScope !== "project" || skill.project_id === project.upstream_project_id));
  for (const skill of candidates) {
    try {
      if (await digestDirectory(skill.path) === operation.content_digest) {
        return { operation, upstream_skill_instance_id: skill.instance_id, upstream_skill_path: skill.path };
      }
    } catch {
      // A candidate that cannot be read cannot prove immutable revision identity.
    }
  }
  throw new Error(`No upstream Skills Manager instance matches ${operation.skill_name} (${operation.content_digest.slice(0, 12)}). Adopt the reviewed revision into Skills Manager before applying.`);
}

function previewArgs(mapping, project) {
  return ["skill", "preview", "--id", mapping.upstream_skill_instance_id, "--tool", project.provider_id, ...scopeArgs(project), mapping.operation.desired_state === "enabled" ? "--enable" : "--disable"];
}

function applyArgs(mapping, project, allowShared) {
  const action = mapping.operation.desired_state === "enabled" ? "enable" : "disable";
  return ["skill", action, "--id", mapping.upstream_skill_instance_id, "--tool", project.provider_id, ...scopeArgs(project), ...(allowShared ? ["--confirm-shared"] : [])];
}

function summarize(results) {
  return results.reduce((summary, result) => ({
    requested: summary.requested + 1,
    applied: summary.applied + (result.result?.applied_count ?? 0),
    skipped: summary.skipped + (result.result?.skipped_count ?? 0),
    failed: summary.failed + (result.result?.failed_count ?? 0),
  }), { requested: 0, applied: 0, skipped: 0, failed: 0 });
}

async function applyRecordedActivationPlan({ catalogRoot, planId, confirmed = false, upstreamCli, onProgress }) {
  if (!upstreamCli?.execute) throw new Error("A Skills Manager CLI adapter is required");
  const progress = (stage, completed, total, message) => onProgress?.({ stage, completed, total, message, at: new Date().toISOString() });
  const catalog = await loadCatalog(catalogRoot);
  const record = catalog.activation_plans.find((item) => item.plan_id === planId);
  if (!record) throw new Error(`Activation plan not found: ${planId}`);
  const project = await getProject(catalogRoot, record.project_id);
  const total = record.plan.operations.length;
  progress("inspect", 0, total, "Inspecting the target Skills Manager project");
  const inspect = await upstreamCli.execute(["inspect", ...scopeArgs(project)]);
  const mappings = [];
  for (const operation of record.plan.operations) {
    mappings.push(await resolveOperation(operation, inspect.skills ?? [], project));
    progress("resolve", mappings.length, total, `Matched immutable revision for ${operation.skill_name}`);
  }
  const previews = [];
  for (const mapping of mappings) {
    previews.push({ ...mapping, preview: await upstreamCli.execute(previewArgs(mapping, project)) });
    progress("preview", previews.length, total, `Previewed ${mapping.operation.skill_name}`);
  }
  const requiresSharedConfirmation = previews.some((item) => item.preview.requires_confirmation === true);
  if (!confirmed) {
    progress("confirmation_required", total, total, "Preview is complete and requires explicit confirmation");
    return { plan_id: planId, status: "confirmation_required", mappings: previews, requires_shared_confirmation: requiresSharedConfirmation };
  }
  if (requiresSharedConfirmation && record.plan.distribution.shared_root_confirmation !== true) {
    throw new Error("The plan requires shared-root confirmation; create a plan with shared_root_confirmation before applying.");
  }
  const operations = [];
  let failure = null;
  for (const previewed of previews) {
    progress("apply", operations.length, total, `Applying ${previewed.operation.skill_name}`);
    try {
      const result = await upstreamCli.execute(applyArgs(previewed, project, requiresSharedConfirmation));
      operations.push({ ...previewed, result });
      progress("apply", operations.length, total, `Applied ${previewed.operation.skill_name}`);
    } catch (error) {
      failure = error;
      operations.push({
        ...previewed,
        result: { applied_count: 0, skipped_count: 0, failed_count: 1, error: error.message },
      });
      progress("apply", operations.length, total, `Failed to apply ${previewed.operation.skill_name}`);
      break;
    }
  }
  progress("verify", operations.length, total, "Re-inspecting provider bindings");
  const [inventory, bindings] = await Promise.all([
    upstreamCli.execute(["providers", ...scopeArgs(project)]),
    upstreamCli.execute(["bindings", ...scopeArgs(project)]),
  ]);
  const summary = summarize(operations);
  const report = {
    plan_id: planId,
    completed_at: new Date().toISOString(),
    status: failure ? "failed" : "completed",
    transport: "skills-manager-cli",
    project_id: project.id,
    upstream_project_id: upstreamProjectId(project),
    provider_id: project.provider_id,
    operations,
    summary,
    post_apply: { inventory, bindings },
  };
  const stored = await recordActivationReport({ catalogRoot, planId, report });
  progress(failure ? "failed" : "completed", operations.length, total, failure ? "Apply completed with failures" : "Apply and verification completed");
  return {
    status: failure ? "failed" : "completed",
    report: stored.report,
    stored_report_id: stored.report_id,
    error: failure?.message,
  };
}

module.exports = { applyRecordedActivationPlan, resolveOperation };
