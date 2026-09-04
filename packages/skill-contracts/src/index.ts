import { randomUUID } from "node:crypto";
import path from "node:path";
import { digestDirectory, listFiles, DEFAULT_IGNORED_DIRECTORIES } from "./digest";
import {
  ARTIFACT_TYPES,
  DELIVERY_METHODS,
  DELIVERY_SCOPES,
  DESIRED_STATES,
  HOOK_FAILURE_POLICIES,
  HOOK_HANDLER_TYPES,
  HOOK_PROVIDERS,
  CODEX_HOOK_EVENTS,
  INVOCATION_MODES,
  PLAN_MODES,
  PROCEDURE_TYPES,
  PROCEDURE_WORKSPACE_STATUSES,
  SKILL_AUTHORING_BASIS_KINDS,
  SKILL_AUTHORING_CATEGORIES,
  SKILL_AUTHORING_CONFIDENCES,
  SKILL_AUTHORING_PLATFORMS,
  SKILL_AUTHORING_SEVERITIES,
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
  type CodexHooksConfig,
  type TopicLifecycleState,
  type LocalHorizontalScope,
  type ConcreteBehavioralInvariants,
  type TargetedVerificationMechanism,
  type VerticalTopicSpec,
  type ProcedureType,
  type ProcedureWorkspaceStatus,
  type ResponsibilityInvariants,
  type ProcedureWorkspace,
  type CreateProcedureWorkspaceOptions,
  type SkillAuthoringAnalysis,
  type SkillAuthoringFinding,
  type SkillAuthoringFindingLocation,
  type SkillAuthoringPlatform,
  type SkillAuthoringPlatformResult,
  type SkillAuthoringProviderInspection,
  type SkillAuthoringProviderSummary,
  type SkillAuthoringRulesetDescriptor,
  type SkillAuthoringRulesetRef,
  type SkillAuthoringVirtualFile,
  type SkillAuthoringVirtualValidationRequest,
  type SkillAuthoringVirtualValidationResponse,
} from "./types";

export * from "./types";
export * from "./digest";

export const ACTIVATION_PLAN_SCHEMA_VERSION = 1;

function requiredString(value: unknown, field: string, issues: ValidationIssue[]): void {
  if (typeof value !== "string" || value.trim() === "") {
    issues.push({ field, message: "must be a non-empty string" });
  }
}

const SKILL_AUTHORING_RULESET_VERSION = "1.0.0";

const SKILL_AUTHORING_RULESET_VALUES: SkillAuthoringRulesetDescriptor[] = [
  {
    platform: "codex",
    ruleset_id: "codex-official-skills",
    version: SKILL_AUTHORING_RULESET_VERSION,
    source_url: "https://developers.openai.com/codex/skills",
    project_discovery_roots: [
      "$CWD/.agents/skills",
      "$CWD/../.agents/skills",
      "$REPO_ROOT/.agents/skills",
    ],
    global_discovery_roots: ["$HOME/.agents/skills", "/etc/codex/skills"],
    required_frontmatter: ["name", "description"],
    optional_directories: ["scripts", "references", "assets", "agents"],
    provider_extensions: ["agents/openai.yaml"],
  },
  {
    platform: "antigravity",
    ruleset_id: "antigravity-official-skills",
    version: SKILL_AUTHORING_RULESET_VERSION,
    source_url: "https://antigravity.google/docs/skills",
    project_discovery_roots: [
      "$WORKSPACE_ROOT/.agents/skills",
      "$WORKSPACE_ROOT/.agent/skills",
    ],
    global_discovery_roots: ["$HOME/.gemini/config/skills"],
    required_frontmatter: ["description"],
    optional_directories: ["scripts", "examples", "resources"],
    provider_extensions: [],
  },
];

export const SKILL_AUTHORING_RULESETS: ReadonlyArray<SkillAuthoringRulesetDescriptor> =
  Object.freeze(SKILL_AUTHORING_RULESET_VALUES.map((ruleset) => Object.freeze(ruleset)));

function authoringRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cloneStringArray(values: string[]): string[] {
  return [...values];
}

function cloneSkillAuthoringRuleset(ruleset: SkillAuthoringRulesetDescriptor): SkillAuthoringRulesetDescriptor {
  return {
    ...ruleset,
    project_discovery_roots: cloneStringArray(ruleset.project_discovery_roots),
    global_discovery_roots: cloneStringArray(ruleset.global_discovery_roots),
    required_frontmatter: cloneStringArray(ruleset.required_frontmatter),
    optional_directories: cloneStringArray(ruleset.optional_directories),
    provider_extensions: cloneStringArray(ruleset.provider_extensions),
  };
}

function validateUniqueStringArray(
  value: unknown,
  field: string,
  issues: ValidationIssue[],
  { requireNonEmpty = false }: { requireNonEmpty?: boolean } = {},
): void {
  if (!Array.isArray(value)) {
    issues.push({ field, message: "must be an array" });
    return;
  }
  if (requireNonEmpty && value.length === 0) {
    issues.push({ field, message: "must contain at least one item" });
  }
  const seen = new Set<string>();
  value.forEach((item, index) => {
    if (typeof item !== "string" || item.trim() === "") {
      issues.push({ field: `${field}[${index}]`, message: "must be a non-empty string" });
      return;
    }
    if (seen.has(item)) issues.push({ field: `${field}[${index}]`, message: "must not be duplicated" });
    seen.add(item);
  });
}

export function validateSkillAuthoringRulesetDescriptor(value: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];
  if (!authoringRecord(value)) {
    return { valid: false, issues: [{ field: "ruleset", message: "must be an object" }] };
  }
  if (!SKILL_AUTHORING_PLATFORMS.has(value.platform)) {
    issues.push({ field: "platform", message: "must be codex or antigravity" });
  }
  requiredString(value.ruleset_id, "ruleset_id", issues);
  requiredString(value.version, "version", issues);
  requiredString(value.source_url, "source_url", issues);
  if (typeof value.source_url === "string" && !/^https:\/\//i.test(value.source_url)) {
    issues.push({ field: "source_url", message: "must use https" });
  }
  validateUniqueStringArray(value.project_discovery_roots, "project_discovery_roots", issues, { requireNonEmpty: true });
  validateUniqueStringArray(value.global_discovery_roots, "global_discovery_roots", issues, { requireNonEmpty: true });
  validateUniqueStringArray(value.required_frontmatter, "required_frontmatter", issues, { requireNonEmpty: true });
  validateUniqueStringArray(value.optional_directories, "optional_directories", issues);
  validateUniqueStringArray(value.provider_extensions, "provider_extensions", issues);
  return { valid: issues.length === 0, issues };
}

export function createSkillAuthoringRulesetDescriptor(
  ruleset: SkillAuthoringRulesetDescriptor,
): SkillAuthoringRulesetDescriptor {
  const validation = validateSkillAuthoringRulesetDescriptor(ruleset);
  if (!validation.valid) {
    const error: any = new Error("Skill authoring ruleset descriptor is invalid");
    error.issues = validation.issues;
    throw error;
  }
  return cloneSkillAuthoringRuleset(ruleset);
}

export function listSkillAuthoringRulesets(): SkillAuthoringRulesetDescriptor[] {
  return SKILL_AUTHORING_RULESET_VALUES.map(cloneSkillAuthoringRuleset);
}

export function getSkillAuthoringRuleset(platform: SkillAuthoringPlatform): SkillAuthoringRulesetDescriptor {
  if (!SKILL_AUTHORING_PLATFORMS.has(platform)) throw new Error(`Unsupported skill authoring platform: ${platform}`);
  const ruleset = SKILL_AUTHORING_RULESET_VALUES.find((candidate) => candidate.platform === platform);
  if (!ruleset) throw new Error(`Skill authoring ruleset not found: ${platform}`);
  return cloneSkillAuthoringRuleset(ruleset);
}

export function skillAuthoringRulesetRef(ruleset: SkillAuthoringRulesetDescriptor): SkillAuthoringRulesetRef {
  return { id: ruleset.ruleset_id, version: ruleset.version, source: ruleset.source_url };
}

function normalizeAuthoringRelativePath(value: string): string | null {
  if (typeof value !== "string" || value.trim() === "" || value.includes("\0")) return null;
  if (path.isAbsolute(value) || path.win32.isAbsolute(value)) return null;
  const normalized = path.posix.normalize(value.trim().replace(/\\/g, "/")).replace(/^\.\//, "");
  if (normalized === "." || normalized === ".." || normalized.startsWith("../")) return null;
  return normalized;
}

function validateSkillAuthoringFindingLocation(
  value: unknown,
  field: string,
  issues: ValidationIssue[],
): void {
  if (!authoringRecord(value)) {
    issues.push({ field, message: "must be an object" });
    return;
  }
  if (!normalizeAuthoringRelativePath(value.relative_path)) {
    issues.push({ field: `${field}.relative_path`, message: "must be a safe relative path" });
  }
  for (const lineField of ["start_line", "end_line"] as const) {
    if (value[lineField] !== undefined && value[lineField] !== null) {
      if (!Number.isSafeInteger(value[lineField]) || value[lineField] < 1) {
        issues.push({ field: `${field}.${lineField}`, message: "must be a positive integer or null" });
      }
    }
  }
  if (
    Number.isSafeInteger(value.start_line) &&
    Number.isSafeInteger(value.end_line) &&
    value.end_line < value.start_line
  ) {
    issues.push({ field: `${field}.end_line`, message: "must not precede start_line" });
  }
  if (value.yaml_path !== undefined && value.yaml_path !== null && typeof value.yaml_path !== "string") {
    issues.push({ field: `${field}.yaml_path`, message: "must be a string or null" });
  }
}

export function validateSkillAuthoringFinding(value: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];
  if (!authoringRecord(value)) {
    return { valid: false, issues: [{ field: "finding", message: "must be an object" }] };
  }
  requiredString(value.rule_id, "rule_id", issues);
  if (typeof value.rule_id === "string" && !/^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/.test(value.rule_id)) {
    issues.push({ field: "rule_id", message: "must be a stable lowercase rule identifier" });
  }
  if (!SKILL_AUTHORING_SEVERITIES.has(value.severity)) {
    issues.push({ field: "severity", message: "must be error, warning, or info" });
  }
  if (!SKILL_AUTHORING_CONFIDENCES.has(value.confidence)) {
    issues.push({ field: "confidence", message: "must be certain, likely, or heuristic" });
  }
  if (!SKILL_AUTHORING_CATEGORIES.has(value.category)) {
    issues.push({ field: "category", message: "is not a supported authoring category" });
  }
  if (!authoringRecord(value.basis)) {
    issues.push({ field: "basis", message: "must be an object" });
  } else {
    if (!SKILL_AUTHORING_BASIS_KINDS.has(value.basis.kind)) {
      issues.push({ field: "basis.kind", message: "is not a supported authoring basis" });
    }
    if (value.basis.source_url !== undefined && value.basis.source_url !== null && typeof value.basis.source_url !== "string") {
      issues.push({ field: "basis.source_url", message: "must be a string or null" });
    }
    if (value.basis.statement !== undefined && value.basis.statement !== null && typeof value.basis.statement !== "string") {
      issues.push({ field: "basis.statement", message: "must be a string or null" });
    }
  }
  requiredString(value.message, "message", issues);
  if (value.location !== undefined && value.location !== null) {
    validateSkillAuthoringFindingLocation(value.location, "location", issues);
  }
  if (value.evidence !== undefined && !authoringRecord(value.evidence)) {
    issues.push({ field: "evidence", message: "must be an object" });
  }
  if (value.recommendation !== undefined && value.recommendation !== null && typeof value.recommendation !== "string") {
    issues.push({ field: "recommendation", message: "must be a string or null" });
  }
  return { valid: issues.length === 0, issues };
}

export function summarizeSkillAuthoringFindings(findings: SkillAuthoringFinding[]): SkillAuthoringProviderSummary {
  const errorCount = findings.filter((finding) => finding.severity === "error").length;
  const warningCount = findings.filter((finding) => finding.severity === "warning").length;
  const infoCount = findings.filter((finding) => finding.severity === "info").length;
  return {
    compatible: errorCount === 0,
    status: errorCount > 0 ? "nonconformant" : warningCount > 0 ? "review_recommended" : "conformant",
    finding_count: findings.length,
    error_count: errorCount,
    warning_count: warningCount,
    info_count: infoCount,
  };
}

function defaultProviderInspection(): SkillAuthoringProviderInspection {
  return {
    manifest_path: null,
    manifest_exact_case: null,
    resolved_name: null,
    invocation_mode: "unspecified",
    frontmatter_fields: [],
    optional_directories_present: [],
    provider_extensions_present: [],
  };
}

function validateProviderInspection(value: unknown, field: string, issues: ValidationIssue[]): void {
  if (!authoringRecord(value)) {
    issues.push({ field, message: "must be an object" });
    return;
  }
  if (value.manifest_path !== null && typeof value.manifest_path !== "string") {
    issues.push({ field: `${field}.manifest_path`, message: "must be a string or null" });
  }
  if (value.manifest_exact_case !== null && typeof value.manifest_exact_case !== "boolean") {
    issues.push({ field: `${field}.manifest_exact_case`, message: "must be a boolean or null" });
  }
  if (value.resolved_name !== null && typeof value.resolved_name !== "string") {
    issues.push({ field: `${field}.resolved_name`, message: "must be a string or null" });
  }
  if (!["implicit_and_explicit", "explicit_only", "unspecified"].includes(value.invocation_mode)) {
    issues.push({
      field: `${field}.invocation_mode`,
      message: "must be implicit_and_explicit, explicit_only, or unspecified",
    });
  }
  validateUniqueStringArray(value.frontmatter_fields, `${field}.frontmatter_fields`, issues);
  validateUniqueStringArray(value.optional_directories_present, `${field}.optional_directories_present`, issues);
  validateUniqueStringArray(value.provider_extensions_present, `${field}.provider_extensions_present`, issues);
  if (value.discovery_root !== undefined && value.discovery_root !== null && typeof value.discovery_root !== "string") {
    issues.push({ field: `${field}.discovery_root`, message: "must be a string or null" });
  }
  if (value.openai !== undefined) {
    if (!authoringRecord(value.openai)) {
      issues.push({ field: `${field}.openai`, message: "must be an object" });
    } else {
      if (typeof value.openai.present !== "boolean") {
        issues.push({ field: `${field}.openai.present`, message: "must be a boolean" });
      }
      if (value.openai.interface !== undefined) {
        if (!authoringRecord(value.openai.interface)) {
          issues.push({ field: `${field}.openai.interface`, message: "must be an object" });
        } else {
          for (const key of ["display_name", "short_description", "icon_small", "icon_large", "brand_color", "default_prompt"]) {
            if (value.openai.interface[key] !== undefined && typeof value.openai.interface[key] !== "string") {
              issues.push({ field: `${field}.openai.interface.${key}`, message: "must be a string" });
            }
          }
        }
      }
      if (value.openai.policy !== undefined) {
        if (!authoringRecord(value.openai.policy)) {
          issues.push({ field: `${field}.openai.policy`, message: "must be an object" });
        } else if (
          value.openai.policy.allow_implicit_invocation !== undefined &&
          typeof value.openai.policy.allow_implicit_invocation !== "boolean"
        ) {
          issues.push({ field: `${field}.openai.policy.allow_implicit_invocation`, message: "must be a boolean" });
        }
      }
      if (value.openai.dependencies !== undefined) {
        if (!authoringRecord(value.openai.dependencies) || !Array.isArray(value.openai.dependencies.tools)) {
          issues.push({ field: `${field}.openai.dependencies.tools`, message: "must be an array" });
        } else {
          value.openai.dependencies.tools.forEach((tool: unknown, index: number) => {
            if (!authoringRecord(tool)) {
              issues.push({ field: `${field}.openai.dependencies.tools[${index}]`, message: "must be an object" });
              return;
            }
            requiredString(tool.type, `${field}.openai.dependencies.tools[${index}].type`, issues);
            requiredString(tool.value, `${field}.openai.dependencies.tools[${index}].value`, issues);
            for (const key of ["description", "transport", "url"]) {
              if (tool[key] !== undefined && typeof tool[key] !== "string") {
                issues.push({ field: `${field}.openai.dependencies.tools[${index}].${key}`, message: "must be a string" });
              }
            }
          });
        }
      }
    }
  }
  if (value.antigravity !== undefined) {
    if (!authoringRecord(value.antigravity)) {
      issues.push({ field: `${field}.antigravity`, message: "must be an object" });
    } else {
      if (typeof value.antigravity.name_defaulted !== "boolean") {
        issues.push({ field: `${field}.antigravity.name_defaulted`, message: "must be a boolean" });
      }
      validateUniqueStringArray(value.antigravity.examples, `${field}.antigravity.examples`, issues);
      validateUniqueStringArray(value.antigravity.resources, `${field}.antigravity.resources`, issues);
    }
  }
}

export function createSkillAuthoringPlatformResult({
  platform,
  ruleset = skillAuthoringRulesetRef(getSkillAuthoringRuleset(platform)),
  findings = [],
  observations = {},
  provider_metadata = defaultProviderInspection(),
}: {
  platform: SkillAuthoringPlatform;
  ruleset?: SkillAuthoringRulesetRef;
  findings?: SkillAuthoringFinding[];
  observations?: Record<string, unknown>;
  provider_metadata?: SkillAuthoringProviderInspection;
}): SkillAuthoringPlatformResult {
  if (!SKILL_AUTHORING_PLATFORMS.has(platform)) throw new Error(`Unsupported skill authoring platform: ${platform}`);
  findings.forEach((finding, index) => {
    const validation = validateSkillAuthoringFinding(finding);
    if (!validation.valid) {
      const error: any = new Error(`Skill authoring finding ${index} is invalid`);
      error.issues = validation.issues;
      throw error;
    }
  });
  if (!authoringRecord(observations)) throw new Error("Skill authoring observations must be an object");
  const metadataIssues: ValidationIssue[] = [];
  validateProviderInspection(provider_metadata, "provider_metadata", metadataIssues);
  if (metadataIssues.length > 0) {
    const error: any = new Error("Skill authoring provider metadata is invalid");
    error.issues = metadataIssues;
    throw error;
  }
  requiredString(ruleset.id, "ruleset.id", metadataIssues);
  requiredString(ruleset.version, "ruleset.version", metadataIssues);
  requiredString(ruleset.source, "ruleset.source", metadataIssues);
  if (metadataIssues.length > 0) {
    const error: any = new Error("Skill authoring ruleset reference is invalid");
    error.issues = metadataIssues;
    throw error;
  }
  return {
    platform,
    ruleset: { ...ruleset },
    summary: summarizeSkillAuthoringFindings(findings),
    findings: findings.map((finding) => ({ ...finding })),
    observations: { ...observations },
    provider_metadata: {
      ...provider_metadata,
      frontmatter_fields: [...provider_metadata.frontmatter_fields],
      optional_directories_present: [...provider_metadata.optional_directories_present],
      provider_extensions_present: [...provider_metadata.provider_extensions_present],
      ...(provider_metadata.openai ? {
        openai: {
          ...provider_metadata.openai,
          ...(provider_metadata.openai.interface ? { interface: { ...provider_metadata.openai.interface } } : {}),
          ...(provider_metadata.openai.policy ? { policy: { ...provider_metadata.openai.policy } } : {}),
          ...(provider_metadata.openai.dependencies ? {
            dependencies: {
              tools: provider_metadata.openai.dependencies.tools.map((tool) => ({ ...tool })),
            },
          } : {}),
        },
      } : {}),
      ...(provider_metadata.antigravity ? {
        antigravity: {
          ...provider_metadata.antigravity,
          examples: [...provider_metadata.antigravity.examples],
          resources: [...provider_metadata.antigravity.resources],
        },
      } : {}),
    },
  };
}

export function validateSkillAuthoringAnalysis(value: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];
  if (!authoringRecord(value)) {
    return { valid: false, issues: [{ field: "authoring", message: "must be an object" }] };
  }
  if (value.execution_effect !== "none") {
    issues.push({ field: "execution_effect", message: "must equal none" });
  }
  if (!authoringRecord(value.results)) {
    issues.push({ field: "results", message: "must be an object" });
    return { valid: issues.length === 0, issues };
  }
  for (const [platform, result] of Object.entries(value.results)) {
    if (!SKILL_AUTHORING_PLATFORMS.has(platform as SkillAuthoringPlatform)) {
      issues.push({ field: `results.${platform}`, message: "uses an unsupported platform" });
      continue;
    }
    if (!authoringRecord(result)) {
      issues.push({ field: `results.${platform}`, message: "must be an object" });
      continue;
    }
    if (result.platform !== platform) {
      issues.push({ field: `results.${platform}.platform`, message: "must match its result key" });
    }
    if (!authoringRecord(result.ruleset)) {
      issues.push({ field: `results.${platform}.ruleset`, message: "must be an object" });
    } else {
      requiredString(result.ruleset.id, `results.${platform}.ruleset.id`, issues);
      requiredString(result.ruleset.version, `results.${platform}.ruleset.version`, issues);
      requiredString(result.ruleset.source, `results.${platform}.ruleset.source`, issues);
    }
    if (!Array.isArray(result.findings)) {
      issues.push({ field: `results.${platform}.findings`, message: "must be an array" });
    } else {
      result.findings.forEach((finding: unknown, index: number) => {
        const validation = validateSkillAuthoringFinding(finding);
        validation.issues.forEach((issue) => {
          issues.push({ field: `results.${platform}.findings[${index}].${issue.field}`, message: issue.message });
        });
      });
      if (authoringRecord(result.summary)) {
        const expected = summarizeSkillAuthoringFindings(result.findings as SkillAuthoringFinding[]);
        for (const key of ["compatible", "status", "finding_count", "error_count", "warning_count", "info_count"] as const) {
          if (result.summary[key] !== expected[key]) {
            issues.push({ field: `results.${platform}.summary.${key}`, message: "must match findings" });
          }
        }
      } else {
        issues.push({ field: `results.${platform}.summary`, message: "must be an object" });
      }
    }
    if (!authoringRecord(result.observations)) {
      issues.push({ field: `results.${platform}.observations`, message: "must be an object" });
    }
    validateProviderInspection(result.provider_metadata, `results.${platform}.provider_metadata`, issues);
  }
  return { valid: issues.length === 0, issues };
}

export function createSkillAuthoringAnalysis(
  results: Partial<Record<SkillAuthoringPlatform, SkillAuthoringPlatformResult>> = {},
): SkillAuthoringAnalysis {
  const analysis: SkillAuthoringAnalysis = { results: { ...results }, execution_effect: "none" };
  const validation = validateSkillAuthoringAnalysis(analysis);
  if (!validation.valid) {
    const error: any = new Error("Skill authoring analysis is invalid");
    error.issues = validation.issues;
    throw error;
  }
  return analysis;
}

export function validateSkillAuthoringVirtualValidationRequest(value: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];
  if (!authoringRecord(value)) {
    return { valid: false, issues: [{ field: "request", message: "must be an object" }] };
  }
  if (!Array.isArray(value.platforms) || value.platforms.length === 0) {
    issues.push({ field: "platforms", message: "must be a non-empty array" });
  } else {
    const seenPlatforms = new Set<string>();
    value.platforms.forEach((platform: unknown, index: number) => {
      if (!SKILL_AUTHORING_PLATFORMS.has(platform as SkillAuthoringPlatform)) {
        issues.push({ field: `platforms[${index}]`, message: "must be codex or antigravity" });
      } else if (seenPlatforms.has(String(platform))) {
        issues.push({ field: `platforms[${index}]`, message: "must not be duplicated" });
      }
      seenPlatforms.add(String(platform));
    });
  }
  if (!Array.isArray(value.files) || value.files.length === 0) {
    issues.push({ field: "files", message: "must be a non-empty array" });
  } else {
    const seenPaths = new Set<string>();
    value.files.forEach((file: unknown, index: number) => {
      if (!authoringRecord(file)) {
        issues.push({ field: `files[${index}]`, message: "must be an object" });
        return;
      }
      const normalized = normalizeAuthoringRelativePath(file.relative_path);
      if (!normalized) {
        issues.push({ field: `files[${index}].relative_path`, message: "must be a safe relative path" });
      } else if (seenPaths.has(normalized)) {
        issues.push({ field: `files[${index}].relative_path`, message: "must not be duplicated" });
      }
      if (normalized) seenPaths.add(normalized);
      if (typeof file.content !== "string") {
        issues.push({ field: `files[${index}].content`, message: "must be a string" });
      }
    });
  }
  return { valid: issues.length === 0, issues };
}

export function createSkillAuthoringVirtualValidationRequest({
  platforms = [...SKILL_AUTHORING_PLATFORMS],
  files,
}: {
  platforms?: SkillAuthoringPlatform[];
  files: SkillAuthoringVirtualFile[];
}): SkillAuthoringVirtualValidationRequest {
  const request: SkillAuthoringVirtualValidationRequest = {
    platforms: [...platforms],
    files: (files ?? []).map((file) => ({
      relative_path: normalizeAuthoringRelativePath(file.relative_path) ?? file.relative_path,
      content: file.content,
    })),
  };
  const validation = validateSkillAuthoringVirtualValidationRequest(request);
  if (!validation.valid) {
    const error: any = new Error("Skill authoring virtual validation request is invalid");
    error.issues = validation.issues;
    throw error;
  }
  return request;
}

export function createSkillAuthoringVirtualValidationResponse(
  authoring: SkillAuthoringAnalysis,
): SkillAuthoringVirtualValidationResponse {
  const validation = validateSkillAuthoringAnalysis(authoring);
  if (!validation.valid) {
    const error: any = new Error("Skill authoring virtual validation response is invalid");
    error.issues = validation.issues;
    throw error;
  }
  return { authoring };
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
      if (preset.owner !== undefined && preset.owner !== null
        && (typeof preset.owner !== "string" || preset.owner.trim() === "")) {
        issues.push({ field: `${prefix}.owner`, message: "must be a non-empty string or null" });
      }
      if (preset.lifecycle !== undefined && !["draft", "reviewed", "deprecated"].includes(preset.lifecycle)) {
        issues.push({ field: `${prefix}.lifecycle`, message: "must be draft, reviewed, or deprecated" });
      }
      if (!Array.isArray(preset.skills)) {
        issues.push({ field: `${prefix}.skills`, message: "must be an array" });
      }
    });
  }

  if (r.projects !== undefined) {
    if (!Array.isArray(r.projects)) {
      issues.push({ field: "projects", message: "must be an array" });
    } else {
      const declaredPresetIds = new Set(
        Array.isArray(r.presets)
          ? r.presets.filter((preset: any) => typeof preset?.id === "string").map((preset: any) => preset.id)
          : [],
      );
      const seenProjectIds = new Set<string>();
      r.projects.forEach((project: any, index: number) => {
        const prefix = `projects[${index}]`;
        if (!project || typeof project !== "object" || Array.isArray(project)) {
          issues.push({ field: prefix, message: "must be an object" });
          return;
        }
        requiredString(project.project_id, `${prefix}.project_id`, issues);
        requiredString(project.project_name, `${prefix}.project_name`, issues);
        requiredString(project.provider_id, `${prefix}.provider_id`, issues);
        requiredString(project.default_preset_id, `${prefix}.default_preset_id`, issues);
        if (typeof project.project_id === "string") {
          if (seenProjectIds.has(project.project_id)) {
            issues.push({ field: `${prefix}.project_id`, message: "must be unique within the recipe" });
          }
          seenProjectIds.add(project.project_id);
        }
        if (!["project", "global"].includes(project.scope)) {
          issues.push({ field: `${prefix}.scope`, message: "must be project or global" });
        }
        if (project.default_preset_version !== undefined
          && (!Number.isSafeInteger(project.default_preset_version) || project.default_preset_version < 1)) {
          issues.push({ field: `${prefix}.default_preset_version`, message: "must be a positive integer" });
        }
        if (typeof project.default_preset_id === "string"
          && project.default_preset_id.trim()
          && !declaredPresetIds.has(project.default_preset_id)) {
          issues.push({ field: `${prefix}.default_preset_id`, message: "must reference a declared preset" });
        }
        if (project.delivery_root_relative !== undefined) {
          requiredString(project.delivery_root_relative, `${prefix}.delivery_root_relative`, issues);
          if (typeof project.delivery_root_relative === "string" && project.delivery_root_relative.trim()) {
            const deliveryRoot = project.delivery_root_relative.trim();
            const normalized = deliveryRoot.replaceAll("\\", "/");
            if (path.isAbsolute(deliveryRoot) || path.win32.isAbsolute(deliveryRoot)
              || normalized === ".." || normalized.startsWith("../")) {
              issues.push({ field: `${prefix}.delivery_root_relative`, message: "must remain relative to the project path" });
            }
          }
        }
      });
    }
  }

  if (r.hooks !== undefined) {
    if (!Array.isArray(r.hooks)) {
      issues.push({ field: "hooks", message: "must be an array" });
    } else {
      r.hooks.forEach((hook: any, index: number) => {
        const hookValidation = validateHookDefinition(hook);
        if (!hookValidation.valid) {
          hookValidation.issues.forEach((issue) => {
            issues.push({ field: `hooks[${index}].${issue.field}`, message: issue.message });
          });
        }
      });
    }
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
    hooks: recipe.hooks,
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
  if (typeof h.id === "string") {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(h.id)) {
      issues.push({ field: "id", message: "must be 1-128 characters using letters, numbers, '.', '_', or '-'" });
    }
    if (["__proto__", "prototype", "constructor"].includes(h.id.toLowerCase())) {
      issues.push({ field: "id", message: "uses a reserved object key" });
    }
  }
  requiredString(h.name, "name", issues);
  requiredString(h.event, "event", issues);
  if (typeof h.event === "string" && h.event.length > 128) {
    issues.push({ field: "event", message: "must be at most 128 characters" });
  }
  if (typeof h.enabled !== "boolean") {
    issues.push({ field: "enabled", message: "must be a boolean" });
  }

  if (h.description !== undefined && h.description !== null && typeof h.description !== "string") {
    issues.push({ field: "description", message: "must be a string or null" });
  }
  if (h.matcher !== undefined && h.matcher !== null) {
    if (typeof h.matcher !== "string" || h.matcher.trim() === "") {
      issues.push({ field: "matcher", message: "must be a non-empty regular-expression string or null" });
    } else if (h.matcher !== "*") {
      try {
        new RegExp(h.matcher);
      } catch {
        issues.push({ field: "matcher", message: "must be a valid regular expression" });
      }
    }
  }

  if (h.priority !== undefined && (!Number.isSafeInteger(h.priority) || h.priority < 0 || h.priority > 1_000_000)) {
    issues.push({ field: "priority", message: "must be an integer between 0 and 1000000" });
  }

  if (h.failure_policy !== undefined && !HOOK_FAILURE_POLICIES.has(h.failure_policy)) {
    issues.push({ field: "failure_policy", message: "must be open or closed" });
  }

  if (h.providers !== undefined) {
    if (!Array.isArray(h.providers) || h.providers.length === 0) {
      issues.push({ field: "providers", message: "must be a non-empty array" });
    } else {
      const seenProviders = new Set<string>();
      h.providers.forEach((provider: unknown, index: number) => {
        if (typeof provider !== "string" || !HOOK_PROVIDERS.has(provider as any)) {
          issues.push({
            field: `providers[${index}]`,
            message: `must be one of ${[...HOOK_PROVIDERS].join(", ")}`,
          });
        } else if (seenProviders.has(provider)) {
          issues.push({ field: `providers[${index}]`, message: "must not contain duplicates" });
        } else {
          seenProviders.add(provider);
        }
      });
    }
  }

  if (h.metadata !== undefined && (!h.metadata || typeof h.metadata !== "object" || Array.isArray(h.metadata))) {
    issues.push({ field: "metadata", message: "must be an object" });
  }

  const handler = h.handler;
  if (!handler || typeof handler !== "object" || Array.isArray(handler)) {
    issues.push({ field: "handler", message: "must be an object" });
  } else {
    requiredString(handler.type, "handler.type", issues);
    if (!HOOK_HANDLER_TYPES.has(handler.type)) {
      issues.push({
        field: "handler.type",
        message: "must be command, script, webhook, or module",
      });
    }
    if (handler.type === "command") requiredString(handler.command, "handler.command", issues);
    if (handler.type === "script" || handler.type === "module") {
      requiredString(handler.target, "handler.target", issues);
    }
    if (handler.type === "webhook") {
      requiredString(handler.url, "handler.url", issues);
      if (typeof handler.url === "string" && handler.url.trim()) {
        try {
          const parsed = new URL(handler.url);
          if (!["http:", "https:"].includes(parsed.protocol)) {
            issues.push({ field: "handler.url", message: "must use http or https" });
          }
        } catch {
          issues.push({ field: "handler.url", message: "must be a valid URL" });
        }
      }
    }
    if (
      handler.timeout_ms !== undefined &&
      (!Number.isSafeInteger(handler.timeout_ms) || handler.timeout_ms < 1 || handler.timeout_ms > 600_000)
    ) {
      issues.push({ field: "handler.timeout_ms", message: "must be an integer between 1 and 600000" });
    }
    if (handler.env !== undefined) {
      if (!handler.env || typeof handler.env !== "object" || Array.isArray(handler.env)) {
        issues.push({ field: "handler.env", message: "must be an object of string values" });
      } else {
        for (const [key, value] of Object.entries(handler.env)) {
          if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
            issues.push({ field: `handler.env.${key}`, message: "must be a portable environment variable name" });
          }
          if (typeof value !== "string") {
            issues.push({ field: `handler.env.${key}`, message: "must be a string" });
          }
        }
      }
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
  if (typeof m.updated_at === "string" && Number.isNaN(Date.parse(m.updated_at))) {
    issues.push({ field: "updated_at", message: "must be an ISO-8601 timestamp" });
  }

  if (!Array.isArray(m.hooks)) {
    issues.push({ field: "hooks", message: "must be an array" });
  } else {
    const seenHookIds = new Set<string>();
    m.hooks.forEach((hook: any, index: number) => {
      const hookValidation = validateHookDefinition(hook);
      if (!hookValidation.valid) {
        hookValidation.issues.forEach((issue) => {
          issues.push({ field: `hooks[${index}].${issue.field}`, message: issue.message });
        });
      }
      if (hook && typeof hook.id === "string") {
        if (seenHookIds.has(hook.id)) {
          issues.push({ field: `hooks[${index}].id`, message: "must be unique within the manifest" });
        }
        seenHookIds.add(hook.id);
      }
    });
  }

  return { valid: issues.length === 0, issues };
}

const CODEX_CONFIG_KEYS = new Set(["description", "hooks"]);
const CODEX_GROUP_KEYS = new Set(["matcher", "hooks"]);
const CODEX_COMMAND_HOOK_KEYS = new Set([
  "type",
  "command",
  "commandWindows",
  "timeout",
  "statusMessage",
  "async",
  "additionalContextLimit",
]);
const CODEX_MCP_TOOL_HOOK_KEYS = new Set([
  "type",
  "server",
  "tool",
  "input",
  "timeout",
  "statusMessage",
]);

/**
 * Strictly validates the current project-level Codex native hooks JSON shape.
 * Unknown keys are rejected deliberately so callers can fail closed instead of
 * rewriting a config whose semantics they do not understand.
 */
export function validateCodexHooksConfig(config: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return { valid: false, issues: [{ field: "config", message: "must be an object" }] };
  }

  const root = config as Record<string, any>;
  for (const key of Object.keys(root)) {
    if (!CODEX_CONFIG_KEYS.has(key)) issues.push({ field: key, message: "is not supported by the strict Codex hooks schema" });
  }
  if (root.description !== undefined && typeof root.description !== "string") {
    issues.push({ field: "description", message: "must be a string" });
  }
  if (!root.hooks || typeof root.hooks !== "object" || Array.isArray(root.hooks)) {
    issues.push({ field: "hooks", message: "must be an object" });
    return { valid: issues.length === 0, issues };
  }

  for (const [eventName, groups] of Object.entries(root.hooks)) {
    if (!CODEX_HOOK_EVENTS.has(eventName as any)) {
      issues.push({ field: `hooks.${eventName}`, message: "is not a supported Codex hook event" });
      continue;
    }
    if (!Array.isArray(groups)) {
      issues.push({ field: `hooks.${eventName}`, message: "must be an array" });
      continue;
    }
    groups.forEach((group: any, groupIndex: number) => {
      const groupField = `hooks.${eventName}[${groupIndex}]`;
      if (!group || typeof group !== "object" || Array.isArray(group)) {
        issues.push({ field: groupField, message: "must be an object" });
        return;
      }
      for (const key of Object.keys(group)) {
        if (!CODEX_GROUP_KEYS.has(key)) issues.push({ field: `${groupField}.${key}`, message: "is not supported by the strict Codex hooks schema" });
      }
      if (group.matcher !== undefined && typeof group.matcher !== "string") {
        issues.push({ field: `${groupField}.matcher`, message: "must be a string" });
      }
      if (!Array.isArray(group.hooks)) {
        issues.push({ field: `${groupField}.hooks`, message: "must be an array" });
        return;
      }
      group.hooks.forEach((hook: any, hookIndex: number) => {
        const hookField = `${groupField}.hooks[${hookIndex}]`;
        if (!hook || typeof hook !== "object" || Array.isArray(hook)) {
          issues.push({ field: hookField, message: "must be an object" });
          return;
        }
        const allowedKeys = hook.type === "mcp_tool" ? CODEX_MCP_TOOL_HOOK_KEYS : CODEX_COMMAND_HOOK_KEYS;
        for (const key of Object.keys(hook)) {
          if (!allowedKeys.has(key)) issues.push({ field: `${hookField}.${key}`, message: "is not supported by the strict Codex hooks schema" });
        }
        if (hook.type === "command") {
          requiredString(hook.command, `${hookField}.command`, issues);
          if (hook.commandWindows !== undefined) requiredString(hook.commandWindows, `${hookField}.commandWindows`, issues);
          if (hook.async !== undefined && typeof hook.async !== "boolean") {
            issues.push({ field: `${hookField}.async`, message: "must be a boolean" });
          }
          if (hook.additionalContextLimit !== undefined && (!Number.isSafeInteger(hook.additionalContextLimit) || hook.additionalContextLimit < 0)) {
            issues.push({ field: `${hookField}.additionalContextLimit`, message: "must be a non-negative integer" });
          }
        } else if (hook.type === "mcp_tool") {
          requiredString(hook.server, `${hookField}.server`, issues);
          requiredString(hook.tool, `${hookField}.tool`, issues);
          if (hook.input !== undefined && (!hook.input || typeof hook.input !== "object" || Array.isArray(hook.input))) {
            issues.push({ field: `${hookField}.input`, message: "must be an object" });
          }
          if (eventName === "SessionEnd") {
            issues.push({ field: `${hookField}.type`, message: "SessionEnd does not support mcp_tool handlers" });
          }
        } else {
          issues.push({ field: `${hookField}.type`, message: "must equal command or mcp_tool" });
        }
        if (hook.timeout !== undefined && (!Number.isSafeInteger(hook.timeout) || hook.timeout < 1 || hook.timeout > 600)) {
          issues.push({ field: `${hookField}.timeout`, message: "must be an integer between 1 and 600" });
        }
        if (["SessionEnd", "Interrupt"].includes(eventName) && hook.timeout !== undefined && hook.timeout > 3) {
          issues.push({ field: `${hookField}.timeout`, message: `${eventName} timeout must be at most 3 seconds` });
        }
        if (hook.statusMessage !== undefined) requiredString(hook.statusMessage, `${hookField}.statusMessage`, issues);
      });
    });
  }
  return { valid: issues.length === 0, issues };
}

export function createCodexHooksConfig(config: CodexHooksConfig): CodexHooksConfig {
  const validation = validateCodexHooksConfig(config);
  if (!validation.valid) {
    const error: any = new Error("Codex hooks config is invalid");
    error.issues = validation.issues;
    throw error;
  }
  return config;
}

export function createHookDefinition(hook: Partial<HookDefinition> & { id: string; name: string; event: string; handler: HookHandler }): HookDefinition {
  const result: HookDefinition = {
    id: hook.id,
    name: hook.name,
    event: hook.event,
    description: hook.description === undefined ? null : hook.description,
    enabled: hook.enabled === undefined ? true : hook.enabled,
    matcher: hook.matcher === undefined ? null : hook.matcher,
    handler: {
      ...hook.handler,
      env: hook.handler.env === undefined ? undefined : hook.handler.env,
      timeout_ms: hook.handler.timeout_ms === undefined ? 5000 : hook.handler.timeout_ms,
    },
    priority: hook.priority === undefined ? 100 : hook.priority,
    providers: hook.providers === undefined ? ["antigravity", "claude", "codex"] : hook.providers,
    failure_policy: hook.failure_policy === undefined ? "open" : hook.failure_policy,
    metadata: hook.metadata === undefined ? {} : hook.metadata,
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
    hooks: hooks.map((hook) => createHookDefinition(hook)),
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

export const PROCEDURE_WORKSPACE_SCHEMA_VERSION = 1;

export function validateProcedureWorkspace(workspace: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];
  if (!workspace || typeof workspace !== "object" || Array.isArray(workspace)) {
    return { valid: false, issues: [{ field: "workspace", message: "must be an object" }] };
  }

  const w = workspace as Record<string, any>;
  if (w.schema_version !== PROCEDURE_WORKSPACE_SCHEMA_VERSION) {
    issues.push({ field: "schema_version", message: `must equal ${PROCEDURE_WORKSPACE_SCHEMA_VERSION}` });
  }

  requiredString(w.workspace_id, "workspace_id", issues);

  if (!w.procedure_type || !PROCEDURE_TYPES.has(w.procedure_type)) {
    issues.push({
      field: "procedure_type",
      message: `must be one of ${[...PROCEDURE_TYPES].join(", ")}`,
    });
  }

  requiredString(w.git_branch, "git_branch", issues);
  requiredString(w.git_worktree_path, "git_worktree_path", issues);

  if (!w.status || !PROCEDURE_WORKSPACE_STATUSES.has(w.status)) {
    issues.push({
      field: "status",
      message: `must be one of ${[...PROCEDURE_WORKSPACE_STATUSES].join(", ")}`,
    });
  }

  requiredString(w.created_at, "created_at", issues);

  if (w.completed_at !== undefined && w.completed_at !== null) {
    if (typeof w.completed_at !== "string" || w.completed_at.trim() === "") {
      issues.push({ field: "completed_at", message: "must be a non-empty string or null" });
    }
  }

  if (!w.responsibility_invariants || typeof w.responsibility_invariants !== "object" || Array.isArray(w.responsibility_invariants)) {
    issues.push({ field: "responsibility_invariants", message: "must be an object" });
  } else {
    const inv = w.responsibility_invariants;
    if (inv.target_test_file !== undefined && inv.target_test_file !== null) {
      if (typeof inv.target_test_file !== "string" || inv.target_test_file.trim() === "") {
        issues.push({ field: "responsibility_invariants.target_test_file", message: "must be a non-empty string" });
      }
    }
    if (!Array.isArray(inv.owned_files)) {
      issues.push({ field: "responsibility_invariants.owned_files", message: "must be an array" });
    }
    if (!Array.isArray(inv.prohibited_actions)) {
      issues.push({ field: "responsibility_invariants.prohibited_actions", message: "must be an array" });
    }
    if (!Array.isArray(inv.acceptance_criteria)) {
      issues.push({ field: "responsibility_invariants.acceptance_criteria", message: "must be an array" });
    }
  }

  if (!Array.isArray(w.active_skills)) {
    issues.push({ field: "active_skills", message: "must be an array" });
  }

  if (!Array.isArray(w.active_guards)) {
    issues.push({ field: "active_guards", message: "must be an array" });
  }

  if (w.metadata !== undefined && w.metadata !== null) {
    if (typeof w.metadata !== "object" || Array.isArray(w.metadata)) {
      issues.push({ field: "metadata", message: "must be an object" });
    }
  }

  return { valid: issues.length === 0, issues };
}

export function createProcedureWorkspace(options: CreateProcedureWorkspaceOptions): ProcedureWorkspace {
  const workspaceId = options.workspace_id ?? `ws_${randomUUID()}`;
  const nowStr = options.created_at ?? (options.now ? options.now.toISOString() : new Date().toISOString());

  const workspace: ProcedureWorkspace = {
    schema_version: PROCEDURE_WORKSPACE_SCHEMA_VERSION,
    workspace_id: workspaceId,
    procedure_type: options.procedure_type,
    git_branch: options.git_branch ?? `worktree/${workspaceId}`,
    git_worktree_path: options.git_worktree_path ?? `.workspaces/${workspaceId}`,
    responsibility_invariants: {
      target_test_file: options.responsibility_invariants?.target_test_file,
      owned_files: options.responsibility_invariants?.owned_files ?? [],
      prohibited_actions: options.responsibility_invariants?.prohibited_actions ?? [],
      acceptance_criteria: options.responsibility_invariants?.acceptance_criteria ?? [],
    },
    active_skills: options.active_skills ?? [],
    active_guards: options.active_guards ?? [],
    status: options.status ?? "pending",
    created_at: nowStr,
    completed_at: options.completed_at ?? null,
    metadata: options.metadata ?? {},
  };

  const validation = validateProcedureWorkspace(workspace);
  if (!validation.valid) {
    const error: any = new Error("Procedure workspace is invalid");
    error.issues = validation.issues;
    throw error;
  }

  return workspace;
}
