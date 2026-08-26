import { randomUUID } from "node:crypto";
import path from "node:path";
import { digestDirectory, listFiles, DEFAULT_IGNORED_DIRECTORIES } from "./digest";
import {
  ARTIFACT_TYPES,
  DELIVERY_METHODS,
  DELIVERY_SCOPES,
  DESIRED_STATES,
  INVOCATION_MODES,
  PLAN_MODES,
  type ActivationOperation,
  type ActivationPlan,
  type ActivationPlanDistribution,
  type ActivationPlanTarget,
  type ArtifactType,
  type DeliveryMethod,
  type DeliveryScope,
  type DesiredState,
  type InvocationMode,
  type PlanMode,
  type ValidationIssue,
  type ValidationResult,
  type RecipeSource,
  type RecipeSkill,
  type RecipePreset,
  type RecipeProjectBinding,
  type SkillRecipe,
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
      if (operation.invocation_mode !== undefined && !INVOCATION_MODES.has(operation.invocation_mode)) {
        issues.push({
          field: `${prefix}.invocation_mode`,
          message: `must be one of ${[...INVOCATION_MODES].join(", ")}`,
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

export function validateSkillRecipe(recipe: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];
  if (!recipe || typeof recipe !== "object" || Array.isArray(recipe)) {
    return { valid: false, issues: [{ field: "recipe", message: "must be an object" }] };
  }

  const r = recipe as Record<string, any>;
  if (r.schema_version !== 1) {
    issues.push({ field: "schema_version", message: "must equal 1" });
  }
  requiredString(r.recipe_id, "recipe_id", issues);
  requiredString(r.name, "name", issues);
  requiredString(r.created_at, "created_at", issues);

  if (!Array.isArray(r.sources)) {
    issues.push({ field: "sources", message: "must be an array" });
  } else {
    r.sources.forEach((src: any, index: number) => {
      const prefix = `sources[${index}]`;
      requiredString(src.source_id, `${prefix}.source_id`, issues);
      requiredString(src.locator, `${prefix}.locator`, issues);
      if (!["git", "local"].includes(src.type)) {
        issues.push({ field: `${prefix}.type`, message: "must be git or local" });
      }
    });
  }

  if (!Array.isArray(r.skills)) {
    issues.push({ field: "skills", message: "must be an array" });
  } else {
    r.skills.forEach((skill: any, index: number) => {
      const prefix = `skills[${index}]`;
      requiredString(skill.name, `${prefix}.name`, issues);
      requiredString(skill.source_id, `${prefix}.source_id`, issues);
      requiredString(skill.source_relative_path, `${prefix}.source_relative_path`, issues);
      requiredString(skill.content_digest, `${prefix}.content_digest`, issues);
      if (skill.artifact_type && !ARTIFACT_TYPES.has(skill.artifact_type)) {
        issues.push({ field: `${prefix}.artifact_type`, message: `must be one of ${[...ARTIFACT_TYPES].join(", ")}` });
      }
      if (skill.invocation_mode && !INVOCATION_MODES.has(skill.invocation_mode)) {
        issues.push({ field: `${prefix}.invocation_mode`, message: `must be one of ${[...INVOCATION_MODES].join(", ")}` });
      }
    });
  }

  if (!Array.isArray(r.presets)) {
    issues.push({ field: "presets", message: "must be an array" });
  } else {
    r.presets.forEach((preset: any, index: number) => {
      const prefix = `presets[${index}]`;
      requiredString(preset.id, `${prefix}.id`, issues);
      requiredString(preset.name, `${prefix}.name`, issues);
      if (typeof preset.version !== "number" || preset.version < 1) {
        issues.push({ field: `${prefix}.version`, message: "must be a positive integer" });
      }
      if (!Array.isArray(preset.skills)) {
        issues.push({ field: `${prefix}.skills`, message: "must be an array" });
      }
    });
  }

  return { valid: issues.length === 0, issues };
}

export function createSkillRecipe(recipe: Partial<SkillRecipe> & { name: string; sources: RecipeSource[]; skills: RecipeSkill[]; presets: RecipePreset[] }): SkillRecipe {
  const result: SkillRecipe = {
    schema_version: 1,
    recipe_id: recipe.recipe_id ?? `recipe_${randomUUID().slice(0, 12)}`,
    name: recipe.name,
    description: recipe.description ?? null,
    created_at: recipe.created_at ?? new Date().toISOString(),
    created_by: recipe.created_by ?? "local",
    sources: recipe.sources ?? [],
    skills: recipe.skills ?? [],
    presets: recipe.presets ?? [],
    projects: recipe.projects ?? [],
  };
  const validation = validateSkillRecipe(result);
  if (!validation.valid) {
    const error: any = new Error("Skill recipe is invalid");
    error.issues = validation.issues;
    throw error;
  }
  return result;
}

