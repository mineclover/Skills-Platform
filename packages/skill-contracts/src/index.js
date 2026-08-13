const { randomUUID } = require("node:crypto");
const path = require("node:path");
const { digestDirectory, listFiles } = require("./digest");

const ACTIVATION_PLAN_SCHEMA_VERSION = 1;
const DELIVERY_METHODS = new Set(["symlink", "copy"]);
const DELIVERY_SCOPES = new Set(["project", "global"]);
const DESIRED_STATES = new Set(["enabled", "disabled"]);
const PLAN_MODES = new Set(["apply", "pristine"]);

function requiredString(value, field, issues) {
  if (typeof value !== "string" || value.trim() === "") {
    issues.push({ field, message: "must be a non-empty string" });
  }
}

function validateActivationPlan(plan) {
  const issues = [];
  if (!plan || typeof plan !== "object" || Array.isArray(plan)) {
    return { valid: false, issues: [{ field: "plan", message: "must be an object" }] };
  }

  requiredString(plan.plan_id, "plan_id", issues);
  if (plan.schema_version !== ACTIVATION_PLAN_SCHEMA_VERSION) {
    issues.push({ field: "schema_version", message: `must equal ${ACTIVATION_PLAN_SCHEMA_VERSION}` });
  }
  requiredString(plan.created_at, "created_at", issues);
  if (!PLAN_MODES.has(plan.mode)) {
    issues.push({ field: "mode", message: "must be apply or pristine" });
  }

  const target = plan.target;
  if (!target || typeof target !== "object") {
    issues.push({ field: "target", message: "is required" });
  } else {
    requiredString(target.provider_id, "target.provider_id", issues);
    requiredString(target.scope, "target.scope", issues);
    if (!DELIVERY_SCOPES.has(target.scope)) {
      issues.push({ field: "target.scope", message: "must be project or global" });
    }
    if (target.scope === "project") {
      requiredString(target.project_id, "target.project_id", issues);
      requiredString(target.project_path, "target.project_path", issues);
    }
  }

  const distribution = plan.distribution;
  if (!distribution || typeof distribution !== "object") {
    issues.push({ field: "distribution", message: "is required" });
  } else if (!DELIVERY_METHODS.has(distribution.method)) {
    issues.push({ field: "distribution.method", message: "must be symlink or copy" });
  }

  if (!Array.isArray(plan.operations)) {
    issues.push({ field: "operations", message: "must be an array" });
  } else if (plan.mode === "apply" && plan.operations.length === 0) {
    issues.push({ field: "operations", message: "must contain at least one operation for apply mode" });
  } else {
    const deliveryPaths = new Set();
    plan.operations.forEach((operation, index) => {
      const prefix = `operations[${index}]`;
      requiredString(operation.registry_skill_id, `${prefix}.registry_skill_id`, issues);
      requiredString(operation.source_revision_id, `${prefix}.source_revision_id`, issues);
      requiredString(operation.content_digest, `${prefix}.content_digest`, issues);
      requiredString(operation.canonical_path, `${prefix}.canonical_path`, issues);
      requiredString(operation.delivery_path, `${prefix}.delivery_path`, issues);
      if (!DESIRED_STATES.has(operation.desired_state)) {
        issues.push({ field: `${prefix}.desired_state`, message: "must be enabled or disabled" });
      }
      if (typeof operation.delivery_path === "string" && operation.delivery_path.trim() !== "") {
        const normalizedPath = path.normalize(operation.delivery_path).toLowerCase();
        if (deliveryPaths.has(normalizedPath)) {
          issues.push({ field: `${prefix}.delivery_path`, message: "must not duplicate another delivery path" });
        }
        deliveryPaths.add(normalizedPath);
      }
      if (plan.mode === "pristine" && operation.desired_state !== "disabled") {
        issues.push({ field: `${prefix}.desired_state`, message: "must be disabled for a pristine plan" });
      }
    });
  }

  return { valid: issues.length === 0, issues };
}

function createActivationPlan({ target, distribution = {}, operations, mode = "apply", now = new Date() }) {
  const plan = {
    plan_id: randomUUID(),
    schema_version: ACTIVATION_PLAN_SCHEMA_VERSION,
    created_at: now.toISOString(),
    mode,
    target,
    distribution: {
      method: distribution.method ?? "symlink",
      collision_strategy: distribution.collision_strategy ?? "fail",
      shared_root_confirmation: distribution.shared_root_confirmation === true,
    },
    operations,
  };
  const validation = validateActivationPlan(plan);
  if (!validation.valid) {
    const error = new Error("Activation plan is invalid");
    error.issues = validation.issues;
    throw error;
  }
  return plan;
}

module.exports = {
  ACTIVATION_PLAN_SCHEMA_VERSION,
  createActivationPlan,
  digestDirectory,
  listFiles,
  validateActivationPlan,
};
