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
  type HookDefinition,
  type HookHandler,
  type HookManifest,
  type TopicLifecycleState,
  type LocalHorizontalScope,
  type ConcreteBehavioralInvariants,
  type TargetedVerificationMechanism,
  type VerticalTopicSpec,
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

export function validateHookDefinition(hook: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];
  if (!hook || typeof hook !== "object" || Array.isArray(hook)) {
    return { valid: false, issues: [{ field: "hook", message: "must be an object" }] };
  }

  const h = hook as Record<string, any>;
  requiredString(h.id, "id", issues);
  requiredString(h.name, "name", issues);
  requiredString(h.event, "event", issues);
  if (typeof h.enabled !== "boolean") {
    issues.push({ field: "enabled", message: "must be a boolean" });
  }

  const handler = h.handler;
  if (!handler || typeof handler !== "object" || Array.isArray(handler)) {
    issues.push({ field: "handler", message: "must be an object" });
  } else {
    requiredString(handler.type, "handler.type", issues);
    if (!["command", "script", "webhook", "module"].includes(handler.type)) {
      issues.push({
        field: "handler.type",
        message: "must be command, script, webhook, or module",
      });
    }
  }

  return { valid: issues.length === 0, issues };
}

export function validateHookManifest(manifest: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    return { valid: false, issues: [{ field: "manifest", message: "must be an object" }] };
  }

  const m = manifest as Record<string, any>;
  if (m.schema_version !== 1) {
    issues.push({ field: "schema_version", message: "must equal 1" });
  }
  requiredString(m.updated_at, "updated_at", issues);

  if (!Array.isArray(m.hooks)) {
    issues.push({ field: "hooks", message: "must be an array" });
  } else {
    m.hooks.forEach((hook: any, index: number) => {
      const hookValidation = validateHookDefinition(hook);
      if (!hookValidation.valid) {
        hookValidation.issues.forEach((issue) => {
          issues.push({ field: `hooks[${index}].${issue.field}`, message: issue.message });
        });
      }
    });
  }

  return { valid: issues.length === 0, issues };
}

export function createHookDefinition(hook: Partial<HookDefinition> & { id: string; name: string; event: string; handler: HookHandler }): HookDefinition {
  const result: HookDefinition = {
    id: hook.id,
    name: hook.name,
    event: hook.event,
    description: hook.description ?? null,
    enabled: hook.enabled !== false,
    matcher: hook.matcher ?? null,
    handler: hook.handler,
    priority: hook.priority ?? 100,
    providers: hook.providers ?? ["antigravity", "claude", "codex"],
    metadata: hook.metadata ?? {},
  };
  const validation = validateHookDefinition(result);
  if (!validation.valid) {
    const error: any = new Error("Hook definition is invalid");
    error.issues = validation.issues;
    throw error;
  }
  return result;
}

export function createHookManifest(hooks: HookDefinition[] = []): HookManifest {
  const manifest: HookManifest = {
    schema_version: 1,
    updated_at: new Date().toISOString(),
    hooks,
  };
  const validation = validateHookManifest(manifest);
  if (!validation.valid) {
    const error: any = new Error("Hook manifest is invalid");
    error.issues = validation.issues;
    throw error;
  }
  return manifest;
}

export const TOPIC_LIFECYCLE_STATES: ReadonlySet<TopicLifecycleState> = new Set([
  "OPEN",
  "IN_PROGRESS",
  "VERIFIED",
  "REOPENED",
  "CLOSED",
]);

export function validateVerticalTopicSpec(spec: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];
  if (!spec || typeof spec !== "object" || Array.isArray(spec)) {
    return { valid: false, issues: [{ field: "spec", message: "must be an object" }] };
  }

  const s = spec as Record<string, any>;
  if (s.schema_version !== 1) {
    issues.push({ field: "schema_version", message: "must equal 1" });
  }
  requiredString(s.topic_id, "topic_id", issues);
  requiredString(s.canonical_name, "canonical_name", issues);
  requiredString(s.created_at, "created_at", issues);
  requiredString(s.updated_at, "updated_at", issues);

  if (!Array.isArray(s.lineage_path) || s.lineage_path.length === 0) {
    issues.push({ field: "lineage_path", message: "must be a non-empty array of topic identifiers" });
  }

  if (!s.lifecycle_state || !TOPIC_LIFECYCLE_STATES.has(s.lifecycle_state)) {
    issues.push({ field: "lifecycle_state", message: `must be one of ${[...TOPIC_LIFECYCLE_STATES].join(", ")}` });
  }

  if (!s.local_horizontal_scope || typeof s.local_horizontal_scope !== "object") {
    issues.push({ field: "local_horizontal_scope", message: "must be an object" });
  } else {
    if (!Array.isArray(s.local_horizontal_scope.owned_files)) {
      issues.push({ field: "local_horizontal_scope.owned_files", message: "must be an array" });
    }
    if (!Array.isArray(s.local_horizontal_scope.read_only_interfaces)) {
      issues.push({ field: "local_horizontal_scope.read_only_interfaces", message: "must be an array" });
    }
    if (!Array.isArray(s.local_horizontal_scope.out_of_bounds)) {
      issues.push({ field: "local_horizontal_scope.out_of_bounds", message: "must be an array" });
    }
  }

  if (!s.invariants || typeof s.invariants !== "object") {
    issues.push({ field: "invariants", message: "must be an object" });
  } else {
    if (!Array.isArray(s.invariants.pre_conditions)) {
      issues.push({ field: "invariants.pre_conditions", message: "must be an array" });
    }
    if (!Array.isArray(s.invariants.post_conditions)) {
      issues.push({ field: "invariants.post_conditions", message: "must be an array" });
    }
    if (!Array.isArray(s.invariants.strict_invariants)) {
      issues.push({ field: "invariants.strict_invariants", message: "must be an array" });
    }
  }

  if (!s.verification || typeof s.verification !== "object") {
    issues.push({ field: "verification", message: "must be an object" });
  } else {
    requiredString(s.verification.target_test_file, "verification.target_test_file", issues);
    requiredString(s.verification.allowed_command, "verification.allowed_command", issues);
    if (!Array.isArray(s.verification.prohibited_commands)) {
      issues.push({ field: "verification.prohibited_commands", message: "must be an array" });
    }
  }

  if (!Array.isArray(s.acceptance_criteria) || s.acceptance_criteria.length === 0) {
    issues.push({ field: "acceptance_criteria", message: "must be a non-empty array of criteria strings" });
  }

  return { valid: issues.length === 0, issues };
}

export function createVerticalTopicSpec(spec: Partial<VerticalTopicSpec> & { topic_id: string; canonical_name: string; verification: TargetedVerificationMechanism }): VerticalTopicSpec {
  const now = new Date().toISOString();
  const result: VerticalTopicSpec = {
    schema_version: 1,
    topic_id: spec.topic_id,
    canonical_name: spec.canonical_name,
    lineage_path: spec.lineage_path ?? ["root", spec.topic_id],
    lifecycle_state: spec.lifecycle_state ?? "IN_PROGRESS",
    local_horizontal_scope: spec.local_horizontal_scope ?? {
      owned_files: [],
      read_only_interfaces: [],
      out_of_bounds: [],
    },
    invariants: spec.invariants ?? {
      pre_conditions: [],
      post_conditions: [],
      strict_invariants: [],
    },
    verification: spec.verification,
    acceptance_criteria: spec.acceptance_criteria ?? ["Target scoped test passes cleanly with 0 failures"],
    created_at: spec.created_at ?? now,
    updated_at: spec.updated_at ?? now,
  };
  const validation = validateVerticalTopicSpec(result);
  if (!validation.valid) {
    const error: any = new Error("Vertical topic spec is invalid");
    error.issues = validation.issues;
    throw error;
  }
  return result;
}

export function renderVerticalTopicMarkdown(spec: VerticalTopicSpec): string {
  const lineage = spec.lineage_path.join(" -> ");
  const owned = spec.local_horizontal_scope.owned_files.map((f: string) => `- \`${f}\``).join("\n") || "- (None specified)";
  const readOnly = spec.local_horizontal_scope.read_only_interfaces.map((f: string) => `- \`${f}\``).join("\n") || "- (None specified)";
  const outBounds = spec.local_horizontal_scope.out_of_bounds.map((f: string) => `- \`${f}\``).join("\n") || "- (None specified)";

  const pre = spec.invariants.pre_conditions.map((c: string) => `- ${c}`).join("\n") || "- (None specified)";
  const post = spec.invariants.post_conditions.map((c: string) => `- ${c}`).join("\n") || "- (None specified)";
  const strict = spec.invariants.strict_invariants.map((c: string) => `- ${c}`).join("\n") || "- (None specified)";

  const prohibited = spec.verification.prohibited_commands.map((c: string) => `\`${c}\``).join(", ") || "(None)";
  const criteria = spec.acceptance_criteria.map((c: string) => `- [ ] ${c}`).join("\n");

  return `# 🎯 VERTICAL SPECIFICATION: ${spec.topic_id}

> **Topic Name**: ${spec.canonical_name}  
> **Lifecycle State**: \`${spec.lifecycle_state}\`  
> **Lineage Path**: \`${lineage}\`  
> **Schema Version**: 1 (Updated: ${spec.updated_at})

---

## 1. 해당 토픽의 로컬 수평 경계 (Local Horizontal Scope)
*상위 레벨의 수직 토픽은 현재 실행 에이전트의 로컬 수평 기준면이 됩니다.*

### 소유 및 변경 대상 파일 (Owned Target Files)
${owned}

### 참조 전용 인터페이스 (Read-Only Interfaces)
${readOnly}

### 🚫 절대 수정 금지 영역 (Out of Bounds)
${outBounds}

---

## 2. 구체적 불변식 및 행위 정의 (Concrete Behavioral Invariants)

### 사전 조건 (Pre-conditions)
${pre}

### 사후 조건 (Post-conditions)
${post}

### 엄격한 불변식 (Strict Invariants)
${strict}

---

## 3. 국소 검증 메커니즘 (Targeted Verification Mechanism)
- **단일 타겟 테스트 파일**: \`${spec.verification.target_test_file}\`
- **허용 실행 명령어**: \`${spec.verification.allowed_command}\`
- **🚫 차단 명령어 (Test Storm Guard)**: ${prohibited}

---

## 4. 완료 및 상위 승격 조건 (Acceptance & Roll-up Gate)
${criteria}
`;
}


