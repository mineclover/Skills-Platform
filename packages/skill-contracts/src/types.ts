export type ArtifactType = "skill" | "rule" | "hook" | "plugin" | "mcp_server";

export const ARTIFACT_TYPES: ReadonlySet<ArtifactType> = new Set([
  "skill",
  "rule",
  "hook",
  "plugin",
  "mcp_server",
]);

export type InvocationMode = "model_invoked" | "user_invoked" | "hybrid" | "unspecified";

export const INVOCATION_MODES: ReadonlySet<InvocationMode> = new Set([
  "model_invoked",
  "user_invoked",
  "hybrid",
  "unspecified",
]);

export type DeliveryMethod = "symlink" | "copy";
export const DELIVERY_METHODS: ReadonlySet<DeliveryMethod> = new Set(["symlink", "copy"]);

export type DeliveryScope = "project" | "global";
export const DELIVERY_SCOPES: ReadonlySet<DeliveryScope> = new Set(["project", "global"]);

export type DesiredState = "enabled" | "disabled";
export const DESIRED_STATES: ReadonlySet<DesiredState> = new Set(["enabled", "disabled"]);

export type PlanMode = "apply" | "pristine";
export const PLAN_MODES: ReadonlySet<PlanMode> = new Set(["apply", "pristine"]);

export interface ActivationPlanTarget {
  provider_id: string;
  scope: DeliveryScope;
  project_id?: string;
  project_path?: string;
}

export interface ActivationPlanDistribution {
  method: DeliveryMethod;
  collision_strategy?: "fail" | "overwrite";
  shared_root_confirmation?: boolean;
}

export interface ActivationOperation {
  registry_skill_id: string;
  skill_name: string;
  artifact_type?: ArtifactType;
  invocation_mode?: InvocationMode;
  source_revision_id: string;
  content_digest: string;
  canonical_path: string;
  delivery_path: string;
  desired_state: DesiredState;
}

export interface ActivationPlan {
  plan_id: string;
  schema_version: number;
  created_at: string;
  mode: PlanMode;
  target: ActivationPlanTarget;
  distribution: {
    method: DeliveryMethod;
    collision_strategy: string;
    shared_root_confirmation: boolean;
  };
  operations: ActivationOperation[];
}

export interface ValidationIssue {
  field: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

// Shared, provider-aware skill authoring inspection contracts. These describe
// advisory static analysis only; they are intentionally separate from
// activation-plan validation and never carry an execution control.
export type SkillAuthoringPlatform = "codex" | "antigravity";
export const SKILL_AUTHORING_PLATFORMS: ReadonlySet<SkillAuthoringPlatform> = new Set([
  "codex",
  "antigravity",
]);

export type SkillAuthoringSeverity = "error" | "warning" | "info";
export const SKILL_AUTHORING_SEVERITIES: ReadonlySet<SkillAuthoringSeverity> = new Set([
  "error",
  "warning",
  "info",
]);

export type SkillAuthoringConfidence = "certain" | "likely" | "heuristic";
export const SKILL_AUTHORING_CONFIDENCES: ReadonlySet<SkillAuthoringConfidence> = new Set([
  "certain",
  "likely",
  "heuristic",
]);

export type SkillAuthoringBasisKind =
  | "official"
  | "platform_policy"
  | "bundled_validator"
  | "heuristic";
export const SKILL_AUTHORING_BASIS_KINDS: ReadonlySet<SkillAuthoringBasisKind> = new Set([
  "official",
  "platform_policy",
  "bundled_validator",
  "heuristic",
]);

export type SkillAuthoringCategory =
  | "structure"
  | "identity"
  | "trigger"
  | "scope"
  | "progressive_disclosure"
  | "resources"
  | "provider_metadata"
  | "portability"
  | "security";
export const SKILL_AUTHORING_CATEGORIES: ReadonlySet<SkillAuthoringCategory> = new Set([
  "structure",
  "identity",
  "trigger",
  "scope",
  "progressive_disclosure",
  "resources",
  "provider_metadata",
  "portability",
  "security",
]);

export interface SkillAuthoringFindingBasis {
  kind: SkillAuthoringBasisKind;
  source_url?: string | null;
  statement?: string | null;
}

export interface SkillAuthoringFindingLocation {
  relative_path: string;
  start_line?: number | null;
  end_line?: number | null;
  yaml_path?: string | null;
}

export interface SkillAuthoringFinding {
  rule_id: string;
  severity: SkillAuthoringSeverity;
  confidence: SkillAuthoringConfidence;
  category: SkillAuthoringCategory;
  basis: SkillAuthoringFindingBasis;
  message: string;
  location?: SkillAuthoringFindingLocation | null;
  evidence?: Record<string, unknown>;
  recommendation?: string | null;
}

export interface SkillAuthoringProviderSummary {
  compatible: boolean;
  status: "conformant" | "review_recommended" | "nonconformant";
  finding_count: number;
  error_count: number;
  warning_count: number;
  info_count: number;
}

export type SkillAuthoringInvocationMode =
  | "implicit_and_explicit"
  | "explicit_only"
  | "unspecified";

export interface SkillAuthoringOpenAIInterfaceMetadata {
  display_name?: string;
  short_description?: string;
  icon_small?: string;
  icon_large?: string;
  brand_color?: string;
  default_prompt?: string;
}

export interface SkillAuthoringOpenAIPolicyMetadata {
  allow_implicit_invocation?: boolean;
}

export interface SkillAuthoringOpenAIToolDependency {
  type: string;
  value: string;
  description?: string;
  transport?: string;
  url?: string;
}

export interface SkillAuthoringOpenAIDependenciesMetadata {
  tools: SkillAuthoringOpenAIToolDependency[];
}

export interface SkillAuthoringOpenAIMetadataInspection {
  present: boolean;
  interface?: SkillAuthoringOpenAIInterfaceMetadata;
  policy?: SkillAuthoringOpenAIPolicyMetadata;
  dependencies?: SkillAuthoringOpenAIDependenciesMetadata;
}

export interface SkillAuthoringAntigravityMetadataInspection {
  name_defaulted: boolean;
  examples: string[];
  resources: string[];
}

export interface SkillAuthoringProviderInspection {
  manifest_path: string | null;
  manifest_exact_case: boolean | null;
  resolved_name: string | null;
  invocation_mode: SkillAuthoringInvocationMode;
  frontmatter_fields: string[];
  optional_directories_present: string[];
  provider_extensions_present: string[];
  discovery_root?: string | null;
  openai?: SkillAuthoringOpenAIMetadataInspection;
  antigravity?: SkillAuthoringAntigravityMetadataInspection;
}

export interface SkillAuthoringRulesetRef {
  id: string;
  version: string;
  source: string;
}

export interface SkillAuthoringRulesetDescriptor {
  platform: SkillAuthoringPlatform;
  ruleset_id: string;
  version: string;
  source_url: string;
  project_discovery_roots: string[];
  global_discovery_roots: string[];
  required_frontmatter: string[];
  optional_directories: string[];
  provider_extensions: string[];
}

export interface SkillAuthoringPlatformResult {
  platform: SkillAuthoringPlatform;
  ruleset: SkillAuthoringRulesetRef;
  summary: SkillAuthoringProviderSummary;
  findings: SkillAuthoringFinding[];
  observations: Record<string, unknown>;
  provider_metadata: SkillAuthoringProviderInspection;
}

export interface SkillAuthoringAnalysis {
  results: Partial<Record<SkillAuthoringPlatform, SkillAuthoringPlatformResult>>;
  execution_effect: "none";
}

export interface SkillAuthoringVirtualFile {
  relative_path: string;
  content: string;
}

export interface SkillAuthoringVirtualValidationRequest {
  platforms: SkillAuthoringPlatform[];
  files: SkillAuthoringVirtualFile[];
}

export interface SkillAuthoringVirtualValidationResponse {
  authoring: SkillAuthoringAnalysis;
}

export interface ActivationReportSummary {
  applied?: number;
  skipped?: number;
  failed?: number;
  requested?: number;
  [key: string]: number | undefined;
}

export interface ActivationReport {
  plan_id: string;
  completed_at: string;
  status: "completed" | "failed" | "reported";
  transport?: string;
  project_id?: string;
  upstream_project_id?: string | null;
  provider_id?: string;
  operations: any[];
  summary: ActivationReportSummary;
  post_apply?: {
    inventory: any;
    bindings: any;
  };
}

// Registry & Source Types
export interface SkillSource {
  id: string;
  kind: "local" | "git";
  locator: string;
  requested_ref?: string | null;
  created_at: string;
}

export interface SourceRevision {
  id: string;
  source_id: string;
  resolved_revision: string;
  content_digest: string;
  fetched_at: string;
  review_state: "imported" | "reviewed" | "rejected";
}

export interface SkillLineage {
  id: string;
  source_id: string;
  artifact_key: string;
  artifact_type?: ArtifactType;
  invocation_mode?: InvocationMode;
  source_relative_path: string;
  skill_name: string;
  created_at: string;
}

/**
 * Minimal canonical manifest snapshot retained by the registry. Resolved name
 * and description already live on RegistrySkill, while the body and complete
 * frontmatter remain in the immutable canonical artifact.
 */
export interface RegistrySkillManifestSnapshot {
  declared_name: string | null;
  license: string | null;
  allowed_tools: unknown | null;
  metadata: Record<string, unknown> | null;
}

export interface SkillAuthoringProviderCompatibility {
  codex: boolean;
  antigravity: boolean;
}

export interface RegistrySkill {
  id: string;
  source_id: string;
  source_revision_id: string;
  skill_name: string;
  artifact_type?: ArtifactType;
  invocation_mode?: InvocationMode;
  source_relative_path: string;
  artifact_key?: string;
  lineage_id: string;
  description: string | null;
  manifest?: RegistrySkillManifestSnapshot | null;
  provider_compatibility?: SkillAuthoringProviderCompatibility | null;
  authoring_ruleset_fingerprint?: string | null;
  content_digest: string;
  canonical_path: string;
  canonical_relative_path?: string;
  imported_at: string;
  review_state: "imported" | "reviewed" | "rejected";
}

// Profile, Notes & Evidence Types
export type Visibility = "private" | "team";
export type RiskLevel = "unknown" | "low" | "medium" | "high" | "critical";
export type ReviewState = "unreviewed" | "reviewed" | "deprecated";

export interface SkillProfile {
  lineage_id: string;
  artifact_type?: ArtifactType;
  invocation_mode?: InvocationMode;
  title: string;
  summary: string | null;
  purpose: string | null;
  use_when: string[];
  avoid_when: string[];
  tags: string[];
  domains: string[];
  work_scope_tags: string[];
  owner: string | null;
  maintainers: string[];
  visibility: Visibility;
  provider_constraints: string[];
  runtime_requirements: string[];
  risk_level: RiskLevel;
  review_state: ReviewState;
  reviewed_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export type NoteScope = "global" | "project" | "revision" | "preset" | "activation_run";
export type NoteKind = "usage" | "caveat" | "decision" | "dependency" | "migration" | "review";

export interface SkillNote {
  id: string;
  lineage_id: string;
  scope: NoteScope;
  kind: NoteKind;
  body: string;
  author: string;
  project_id?: string | null;
  source_revision_id?: string | null;
  preset_id?: string | null;
  activation_plan_id?: string | null;
  visibility: Visibility;
  inject_into_prompt: boolean;
  version: number;
  history: Array<{
    version: number;
    body: string;
    kind: string;
    visibility: string;
    inject_into_prompt: boolean;
    changed_at: string;
  }>;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
  deleted_by?: string | null;
}

export type FeedbackOutcome = "success" | "correction" | "scope_mismatch" | "freshness" | "risk" | "neutral";
export type EvidenceType = "manual" | "evaluation" | "activation_report" | "user_feedback" | "incident";
export type RedactionState = "none" | "redacted" | "withheld";

export interface SkillFeedback {
  id: string;
  lineage_id: string;
  scope: NoteScope;
  outcome: FeedbackOutcome;
  evidence_type: EvidenceType;
  summary: string;
  details?: string | null;
  author: string;
  project_id?: string | null;
  source_revision_id?: string | null;
  preset_id?: string | null;
  activation_plan_id?: string | null;
  redaction: RedactionState;
  metrics: Record<string, number>;
  created_at: string;
}

export interface FeedbackSummary {
  lineage_id: string;
  project_id: string | null;
  source_revision_id: string | null;
  total_feedback: number;
  by_outcome: Record<string, number>;
  by_evidence_type: Record<string, number>;
  reported_metrics: Record<string, number>;
  success_rate: number | null;
  health: "unknown" | "healthy" | "needs_review";
  latest_feedback_at: string | null;
}

export interface EvaluationCase {
  id: string;
  lineage_id: string;
  name: string;
  owner: string;
  lifecycle: "draft" | "active" | "retired";
  objective: string;
  criteria: string[];
  active_version: number;
  selected_version?: number;
  versions: Array<{
    version: number;
    objective: string;
    criteria: string[];
    created_at: string;
  }>;
  created_at: string;
  updated_at: string;
}

export interface EvaluationRun {
  id: string;
  case_id: string;
  case_version: number;
  lineage_id: string;
  source_revision_id: string;
  outcome: "passed" | "failed" | "blocked";
  summary: string;
  details?: string | null;
  author: string;
  criterion_results: Array<{
    criterion: string;
    outcome: "passed" | "failed" | "skipped";
    notes?: string | null;
  }>;
  created_at: string;
}

// Preset & Project Types
export interface PresetEntry {
  lineage_id: string;
  source_revision_id: string;
  registry_skill_id: string;
  revision_policy: "pinned" | "latest_reviewed";
  required: boolean;
  enabled_by_default: boolean;
}

export interface PresetTemplateSnapshot {
  version: number;
  registry_skill_ids: string[];
  entries: PresetEntry[];
  description: string | null;
  purpose: string | null;
  work_scope_tags: string[];
  template_notes: Array<{
    id: string;
    body: string;
    author: string;
    created_at: string;
  }>;
  created_at?: string | null;
}

export interface PresetTemplate {
  id: string;
  name: string;
  description: string | null;
  kind: "builtin" | "custom";
  registry_skill_ids: string[];
  entries: PresetEntry[];
  purpose: string | null;
  work_scope_tags: string[];
  owner: string | null;
  lifecycle: "draft" | "reviewed" | "deprecated";
  active_version: number;
  selected_version?: number;
  template_notes: Array<{
    id: string;
    body: string;
    author: string;
    created_at: string;
  }>;
  versions: PresetTemplateSnapshot[];
  created_at?: string | null;
  updated_at?: string | null;
}

export interface ProjectPresetAssignment {
  preset_id: string;
  template_version: number;
  role: "default" | "recommended" | "work_scope_overlay" | "explicit";
  priority: number;
  work_scope_tags: string[];
  enabled: boolean;
  created_at?: string;
  updated_at?: string;
  name?: string;
  purpose?: string | null;
}

export interface ProjectProfile {
  id: string;
  name: string;
  upstream_project_id: string;
  project_path: string | null;
  provider_id: string;
  delivery_root: string;
  scope: DeliveryScope;
  default_preset_id: string;
  default_preset_version: number;
  preset_assignments: ProjectPresetAssignment[];
  created_at: string;
  updated_at?: string;
}

export interface EffectiveSkillMember {
  registry_skill_id: string;
  skill_name: string;
  artifact_type?: ArtifactType;
  source_revision_id: string;
  desired_state: DesiredState;
  reason: string;
  selected_by?: { preset_id?: string; [key: string]: any } | null;
}

export interface EffectiveSkillSet {
  project: { id: string; name: string };
  requested_work_scope_tags: string[];
  assignments: ProjectPresetAssignment[];
  mode: PlanMode;
  skills: EffectiveSkillMember[];
}

// Upstream Inspector & Provider Types
export interface UpstreamProvider {
  provider_id: string;
  display_name?: string;
  detected: boolean;
  reachable?: boolean | null;
  enabled_count?: number;
  disabled_count?: number;
  warning?: string | null;
}

export interface UpstreamBinding {
  artifact_id?: string;
  skill_instance_id: string;
  provider_id: string;
  scope: "global" | "project" | "tool";
  state: "enabled" | "disabled" | "missing" | "conflict" | "unavailable";
  target_path?: string | null;
  reason?: string | null;
  source_path?: string;
  last_checked_at?: number;
}

export interface UpstreamStatusSummary {
  total: number;
  enabled: number;
  disabled: number;
  missing: number;
  conflict: number;
  unavailable: number;
}

export interface UpstreamStatus {
  source: "skills-manager-inspect";
  checked_at: string;
  scope: "global" | "project";
  manager_project_id: string | null;
  inventory: {
    providers: UpstreamProvider[];
  };
  bindings: UpstreamBinding[];
  summary: UpstreamStatusSummary;
}

// Skill Recipe & Export / Import Lockfile Types
export const RECIPE_SCHEMA_VERSION = 1;

export interface RecipeSource {
  source_id: string;
  type: "git" | "local";
  locator: string;
  ref?: string;
  resolved_commit?: string;
}

export interface RecipeSkill {
  name: string;
  artifact_type: ArtifactType;
  invocation_mode: InvocationMode;
  source_id: string;
  source_relative_path: string;
  content_digest: string;
  description?: string | null;
}

export interface RecipePresetEntry {
  skill_name: string;
  source_relative_path?: string;
  artifact_type?: ArtifactType;
  required?: boolean;
}

export interface RecipePreset {
  id: string;
  name: string;
  version: number;
  owner?: string | null;
  lifecycle?: "draft" | "reviewed" | "deprecated";
  description?: string | null;
  purpose?: string | null;
  work_scope_tags?: string[];
  skills: RecipePresetEntry[];
}

export interface RecipeProjectBinding {
  project_id: string;
  project_name: string;
  provider_id: string;
  scope: "project" | "global";
  default_preset_id: string;
  default_preset_version?: number;
  delivery_root_relative?: string;
}

export interface SkillRecipe {
  schema_version: number;
  recipe_id: string;
  name: string;
  description?: string | null;
  created_at: string;
  created_by?: string;
  sources: RecipeSource[];
  skills: RecipeSkill[];
  presets: RecipePreset[];
  projects?: RecipeProjectBinding[];
  hooks?: HookDefinition[];
}

// Standard Hook Event Taxonomy & Contract Types
export type StandardHookEvent =
  | "session_start"
  | "session_stop"
  | "pre_invocation"
  | "post_invocation"
  | "on_skill_invoke"
  | "pre_tool_use"
  | "post_tool_use"
  | "on_test_run"
  | "on_phase_transition"
  | "on_recipe_apply"
  | "on_drift_detected"
  | "on_anomaly_detected";

export const STANDARD_HOOK_EVENTS: ReadonlySet<StandardHookEvent> = new Set([
  "session_start",
  "session_stop",
  "pre_invocation",
  "post_invocation",
  "on_skill_invoke",
  "pre_tool_use",
  "post_tool_use",
  "on_test_run",
  "on_phase_transition",
  "on_recipe_apply",
  "on_drift_detected",
  "on_anomaly_detected",
]);

export type HookHandlerType = "command" | "script" | "webhook" | "module";
export const HOOK_HANDLER_TYPES: ReadonlySet<HookHandlerType> = new Set([
  "command",
  "script",
  "webhook",
  "module",
]);

export type HookFailurePolicy = "open" | "closed";
export const HOOK_FAILURE_POLICIES: ReadonlySet<HookFailurePolicy> = new Set([
  "open",
  "closed",
]);

export type HookProvider = "antigravity" | "claude" | "codex";
export const HOOK_PROVIDERS: ReadonlySet<HookProvider> = new Set([
  "antigravity",
  "claude",
  "codex",
]);

export type CodexHookEvent =
  | "SessionStart"
  | "SessionEnd"
  | "PreToolUse"
  | "PermissionRequest"
  | "PostToolUse"
  | "PreCompact"
  | "PostCompact"
  | "UserPromptSubmit"
  | "SubagentStart"
  | "SubagentStop"
  | "Stop"
  | "Interrupt";

export const CODEX_HOOK_EVENTS: ReadonlySet<CodexHookEvent> = new Set([
  "SessionStart",
  "SessionEnd",
  "PreToolUse",
  "PermissionRequest",
  "PostToolUse",
  "PreCompact",
  "PostCompact",
  "UserPromptSubmit",
  "SubagentStart",
  "SubagentStop",
  "Stop",
  "Interrupt",
]);

/** Native command hook accepted by `<repo>/.codex/hooks.json`. */
export interface CodexCommandHook {
  type: "command";
  command: string;
  commandWindows?: string;
  timeout?: number;
  statusMessage?: string;
  async?: boolean;
  additionalContextLimit?: number;
}

export interface CodexMcpToolHook {
  type: "mcp_tool";
  server: string;
  tool: string;
  input?: Record<string, any>;
  timeout?: number;
  statusMessage?: string;
}

export type CodexNativeHookHandler = CodexCommandHook | CodexMcpToolHook;

export interface CodexHookGroup {
  matcher?: string;
  hooks: CodexNativeHookHandler[];
}

export interface CodexHooksConfig {
  description?: string;
  hooks: Partial<Record<CodexHookEvent, CodexHookGroup[]>>;
}

export interface HookHandler {
  type: HookHandlerType;
  command?: string;
  target?: string;
  url?: string;
  timeout_ms?: number;
  env?: Record<string, string>;
}

export interface HookDefinition {
  id: string;
  name: string;
  event: StandardHookEvent | string;
  description?: string | null;
  enabled: boolean;
  matcher?: string | null;
  handler: HookHandler;
  priority?: number;
  providers?: HookProvider[];
  /**
   * Controls what happens when the handler cannot run or times out. Existing
   * manifests default to `open` for backwards compatibility.
   */
  failure_policy?: HookFailurePolicy;
  metadata?: Record<string, any>;
}

export interface HookManifest {
  schema_version: number;
  updated_at: string;
  hooks: HookDefinition[];
}

// Vertical Topic Specification & Relative Context Hierarchy Types
export type TopicLifecycleState = "OPEN" | "IN_PROGRESS" | "VERIFIED" | "REOPENED" | "CLOSED";

export interface LocalHorizontalScope {
  owned_files: string[];
  read_only_interfaces: string[];
  out_of_bounds: string[];
}

export interface ConcreteBehavioralInvariants {
  pre_conditions: string[];
  post_conditions: string[];
  strict_invariants: string[];
}

export interface TargetedVerificationMechanism {
  target_test_file: string;
  allowed_command: string;
  prohibited_commands: string[];
}

export interface VerticalTopicSpec {
  schema_version: number;
  topic_id: string;
  canonical_name: string;
  lineage_path: string[];
  lifecycle_state: TopicLifecycleState;
  local_horizontal_scope: LocalHorizontalScope;
  invariants: ConcreteBehavioralInvariants;
  verification: TargetedVerificationMechanism;
  acceptance_criteria: string[];
  created_at: string;
  updated_at: string;
}

// Procedure-Responsible Workspace & Sequential Merge Pipeline Contracts
export type ProcedureType =
  | "PLANNING"
  | "INNER_LOOP_TDD"
  | "SECURITY_AUDIT"
  | "RELEASE_GATE";

export const PROCEDURE_TYPES: ReadonlySet<ProcedureType> = new Set([
  "PLANNING",
  "INNER_LOOP_TDD",
  "SECURITY_AUDIT",
  "RELEASE_GATE",
]);

export type ProcedureWorkspaceStatus =
  | "pending"
  | "active"
  | "in_verification"
  | "verified"
  | "merged"
  | "failed"
  | "discarded"
  | "pruned";

export const PROCEDURE_WORKSPACE_STATUSES: ReadonlySet<ProcedureWorkspaceStatus> = new Set([
  "pending",
  "active",
  "in_verification",
  "verified",
  "merged",
  "failed",
  "discarded",
  "pruned",
]);

export interface ResponsibilityInvariants {
  target_test_file?: string;
  owned_files: string[];
  prohibited_actions: string[];
  acceptance_criteria: string[];
}

export interface ProcedureWorkspace {
  schema_version: number;
  workspace_id: string;
  procedure_type: ProcedureType;
  git_branch: string;
  git_worktree_path: string;
  responsibility_invariants: ResponsibilityInvariants;
  active_skills: string[];
  active_guards: string[];
  status: ProcedureWorkspaceStatus;
  created_at: string;
  completed_at?: string | null;
  metadata?: Record<string, any>;
}

export interface CreateProcedureWorkspaceOptions {
  workspace_id?: string;
  procedure_type: ProcedureType;
  git_branch?: string;
  git_worktree_path?: string;
  responsibility_invariants?: Partial<ResponsibilityInvariants>;
  active_skills?: string[];
  active_guards?: string[];
  status?: ProcedureWorkspaceStatus;
  created_at?: string;
  completed_at?: string | null;
  metadata?: Record<string, any>;
  now?: Date;
}
