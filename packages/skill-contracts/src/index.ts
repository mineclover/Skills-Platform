import { randomUUID } from "node:crypto";
import path from "node:path";
import { digestDirectory, listFiles, DEFAULT_IGNORED_DIRECTORIES } from "./digest";
import {
  ARTIFACT_TYPES,
  DELIVERY_METHODS,
  DELIVERY_SCOPES,
  DESIRED_STATES,
  PLAN_MODES,
  type ActivationOperation,
  type ActivationPlan,
  type ActivationPlanDistribution,
  type ActivationPlanTarget,
  type ArtifactType,
  type DeliveryMethod,
  type DeliveryScope,
  type DesiredState,
  type PlanMode,
  type ValidationIssue,
  type ValidationResult,
} from "./types";

export * from "./types";
export * from "./digest";

export const ACTIVATION_PLAN_SCHEMA_VERSION = 1;

function requiredString(value: unknown, field: string, issues: ValidationIssue[]): void {
  if (typeof value !== "string" || value.trim() === "") {
    issues.push({ field, message: "must be a non-empty string" });
  }
}

export function validateActivationPlan(plan: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];
  if (!plan || typeof plan !== "object" || Array.isArray(plan)) {
    return { valid: false, issues: [{ field: "plan", message: "must be an object" }] };
  }

  const p = plan as Record<string, any>;
  requiredString(p.plan_id, "plan_id", issues);
  if (p.schema_version !== ACTIVATION_PLAN_SCHEMA_VERSION) {
    issues.push({ field: "schema_version", message: `must equal ${ACTIVATION_PLAN_SCHEMA_VERSION}` });
  }
  requiredString(p.created_at, "created_at", issues);
  if (!PLAN_MODES.has(p.mode)) {
    issues.push({ field: "mode", message: "must be apply or pristine" });
  }

  const target = p.target;
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

  const distribution = p.distribution;
  if (!distribution || typeof distribution !== "object") {
    issues.push({ field: "distribution", message: "is required" });
  } else if (!DELIVERY_METHODS.has(distribution.method)) {
    issues.push({ field: "distribution.method", message: "must be symlink or copy" });
  }

  if (!Array.isArray(p.operations)) {
    issues.push({ field: "operations", message: "must be an array" });
  } else if (p.mode === "apply" && p.operations.length === 0) {
    issues.push({ field: "operations", message: "must contain at least one operation for apply mode" });
  } else {
    const deliveryPaths = new Set<string>();
    p.operations.forEach((operation: any, index: number) => {
      const prefix = `operations[${index}]`;
      requiredString(operation.registry_skill_id, `${prefix}.registry_skill_id`, issues);
      requiredString(operation.source_revision_id, `${prefix}.source_revision_id`, issues);
      requiredString(operation.content_digest, `${prefix}.content_digest`, issues);
      requiredString(operation.canonical_path, `${prefix}.canonical_path`, issues);
      requiredString(operation.delivery_path, `${prefix}.delivery_path`, issues);
      if (operation.artifact_type !== undefined && !ARTIFACT_TYPES.has(operation.artifact_type)) {
        issues.push({
          field: `${prefix}.artifact_type`,
          message: `must be one of ${[...ARTIFACT_TYPES].join(", ")}`,
        });
      }
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
      if (p.mode === "pristine" && operation.desired_state !== "disabled") {
        issues.push({ field: `${prefix}.desired_state`, message: "must be disabled for a pristine plan" });
      }
    });
  }

  return { valid: issues.length === 0, issues };
}

export interface CreateActivationPlanOptions {
  target: ActivationPlanTarget;
  distribution?: Partial<ActivationPlanDistribution>;
  operations: ActivationOperation[];
  mode?: PlanMode;
  now?: Date;
}

export function createActivationPlan({
  target,
  distribution = {},
  operations,
  mode = "apply",
  now = new Date(),
}: CreateActivationPlanOptions): ActivationPlan {
  const plan: ActivationPlan = {
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
    operations: (operations ?? []).map((op) => ({
      ...op,
      artifact_type: (op.artifact_type as ArtifactType) ?? "skill",
    })),
  };
  const validation = validateActivationPlan(plan);
  if (!validation.valid) {
    const error: any = new Error("Activation plan is invalid");
    error.issues = validation.issues;
    throw error;
  }
  return plan;
}
