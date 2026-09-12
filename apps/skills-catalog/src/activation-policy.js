const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const { loadCatalog, recordActivationReport } = require("./catalog-state");
const { getRegistrySkills } = require("./registry");
const { latestSourceReview } = require("./source-review");
const { withActivationDeliveryLock } = require("./activation-locks");

function normalizedPath(value) {
  return process.platform === "win32" ? path.resolve(value).toLowerCase() : path.resolve(value);
}

function samePath(left, right) {
  if (!left || !right) return false;
  return normalizedPath(left) === normalizedPath(right);
}

function pathsOverlap(left, right) {
  const within = (parent, child) => {
    const relative = path.relative(normalizedPath(parent), normalizedPath(child));
    return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
  };
  return within(left, right) || within(right, left);
}

async function physicalPath(value) {
  const absolute = path.resolve(value);
  try {
    return await fs.realpath(absolute);
  } catch (error) {
    // New delivery directories need the identity of their nearest existing
    // ancestor, so a symlinked project path cannot hide a protected root.
    if (error.code !== "ENOENT") throw error;
    const parent = path.dirname(absolute);
    if (parent === absolute) throw error;
    return path.join(await physicalPath(parent), path.basename(absolute));
  }
}

async function assertProjectDeliveryBoundary({ catalogRoot, project, deliveryPaths, catalog }) {
  const state = catalog ?? await loadCatalog(catalogRoot);
  if (project?.review_policy === "require_approved" || deliveryPaths.length === 0) return;
  const strictProjects = state.projects.filter((candidate) => candidate.review_policy === "require_approved");
  if (strictProjects.length === 0) return;
  const physicalRoots = await Promise.all(deliveryPaths.map((deliveryPath) => physicalPath(path.dirname(deliveryPath))));
  for (const candidate of strictProjects) {
    const protectedRoot = await physicalPath(candidate.delivery_root);
    if (deliveryPaths.some((deliveryPath, index) => pathsOverlap(path.dirname(deliveryPath), candidate.delivery_root)
      || pathsOverlap(physicalRoots[index], protectedRoot))) {
      throw new Error(`Activation delivery overlaps strict project ${candidate.id}; use a registered strict project plan instead of an advisory alias or an unregistered target`);
    }
  }
}

function assertPlanProject(plan, project) {
  const target = plan.target ?? {};
  if ((target.project_id && target.project_id !== project.id)
    || (project.scope === "project" && target.project_id !== project.id)
    || (plan.catalog_selection?.project_id && plan.catalog_selection.project_id !== project.id)
    || target.scope !== project.scope
    || target.provider_id?.toLowerCase() !== project.provider_id.toLowerCase()
    || (project.scope === "project" && !samePath(target.project_path, project.project_path))
    || plan.operations.some((operation) => !samePath(path.dirname(operation.delivery_path), project.delivery_root))) {
    throw new Error(`Activation plan target does not match registered project: ${project.id}`);
  }
}

// A source review approves an immutable revision. Profile labels and template
// lifecycle cannot substitute for that review; deprecated selections are blocked.
async function assertActivationPolicy({ catalogRoot, registryRoot, projectId, plan, assignments = [] }) {
  const effectiveProjectId = projectId ?? plan.catalog_selection?.project_id ?? plan.target?.project_id;
  if (!catalogRoot) return null;
  const catalog = await loadCatalog(catalogRoot);
  const project = effectiveProjectId ? catalog.projects.find((item) => item.id === effectiveProjectId) : null;
  if (effectiveProjectId && !project) throw new Error(`Project not found: ${effectiveProjectId}`);
  if (project) assertPlanProject(plan, project);
  await assertProjectDeliveryBoundary({ catalogRoot, catalog, project, deliveryPaths: plan.operations.map((operation) => operation.delivery_path) });
  if (!project) return null;
  if (project.review_policy !== "require_approved") return project;
  const enabled = plan.operations.filter((operation) => operation.desired_state === "enabled");
  if (enabled.length === 0) return project;
  if (!registryRoot) throw new Error("Strict activation policy requires registryRoot to verify immutable skill identities");
  const skills = await getRegistrySkills(registryRoot, enabled.map((operation) => operation.registry_skill_id));
  const selectedAssignments = [...(plan.catalog_selection?.assignments ?? []), ...assignments];
  for (const assignment of selectedAssignments) {
    const preset = catalog.presets.find((item) => item.id === assignment.preset_id);
    if (preset?.lifecycle === "deprecated") throw new Error(`Activation policy blocks deprecated preset: ${preset.id}`);
  }
  const skillsById = new Map(skills.map((skill) => [skill.id, skill]));
  for (const operation of enabled) {
    const skill = skillsById.get(operation.registry_skill_id);
    if (!skill || skill.source_revision_id !== operation.source_revision_id
      || skill.content_digest !== operation.content_digest
      || !samePath(skill.canonical_path, operation.canonical_path)) {
      throw new Error(`Activation policy could not verify registry identity: ${operation.registry_skill_id}`);
    }
    if (catalog.skill_profiles.some((profile) => profile.lineage_id === skill.lineage_id && profile.review_state === "deprecated")) {
      throw new Error(`Activation policy blocks deprecated skill: ${skill.skill_name}`);
    }
    const review = await latestSourceReview({ catalogRoot, sourceRevisionId: skill.source_revision_id });
    if (review?.decision !== "approved") {
      throw new Error(`Activation policy requires an approved source review: ${skill.source_revision_id} (${review?.decision ?? "unreviewed"}); import and review the revision before creating or applying a plan`);
    }
  }
  return project;
}

async function applyCatalogActivationPlan({ catalogRoot, registryRoot, projectId, plan, assignments = [], adapter, onProgress }) {
  return withActivationDeliveryLock(plan, async () => {
    const policy = { catalogRoot, registryRoot, projectId, plan, assignments };
    await assertActivationPolicy(policy);
    const deliveryAdapter = adapter ?? require("@skills-platform/skills-manager-adapter");
    return deliveryAdapter.applyActivationPlan(plan, {
      confirm: true,
      onProgress,
      // Re-read after the adapter's own preview and before every operation.
      beforeOperation: () => assertActivationPolicy(policy),
    });
  });
}

async function applyRecordedCatalogPlan({ catalogRoot, registryRoot, planId, confirmed = false, adapter }) {
  const catalog = await loadCatalog(catalogRoot);
  const record = catalog.activation_plans.find((item) => item.plan_id === planId);
  if (!record) throw new Error(`Activation plan not found: ${planId}`);
  if (crypto.createHash("sha256").update(JSON.stringify(record.plan)).digest("hex") !== record.digest) {
    throw new Error(`Activation plan integrity check failed: ${planId}`);
  }
  return withActivationDeliveryLock(record.plan, async () => {
    const policy = { catalogRoot, registryRoot, projectId: record.project_id, plan: record.plan, assignments: record.assignments };
    await assertActivationPolicy(policy);
    const deliveryAdapter = adapter ?? require("@skills-platform/skills-manager-adapter");
    if (!confirmed) return { status: "preview", plan: record.plan, preview: await deliveryAdapter.previewActivationPlan(record.plan) };
    const report = await applyCatalogActivationPlan({ ...policy, adapter: deliveryAdapter });
    const stored = await recordActivationReport({ catalogRoot, planId, report });
    return { status: report.status, plan: record.plan, report: stored.report, stored_report_id: stored.report_id };
  });
}

module.exports = { applyCatalogActivationPlan, applyRecordedCatalogPlan, assertActivationPolicy, assertPlanProject, assertProjectDeliveryBoundary };
