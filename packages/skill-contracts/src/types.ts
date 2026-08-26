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
  content_digest: string;
  canonical_path: string;
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
