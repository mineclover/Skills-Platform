import type {
  ArtifactType,
  InvocationMode,
  UpstreamStatus,
  UpstreamProvider,
  UpstreamBinding,
  RegistrySkill,
  FeedbackSummary,
  SkillFeedback,
  FeedbackOutcome,
  EvidenceType,
  SkillNote,
  SkillProfile,
  SkillRecipe,
  RecipeSource,
  RecipeSkill,
  RecipePreset,
  RecipeProjectBinding,
  HookDefinition,
  HookManifest,
  HookHandler,
  StandardHookEvent,
  ProcedureType,
  ProcedureWorkspaceStatus,
  ResponsibilityInvariants,
  ProcedureWorkspace,
  CreateProcedureWorkspaceOptions,
  SkillAuthoringAnalysis,
  SkillAuthoringFinding,
  SkillAuthoringPlatform,
  SkillAuthoringPlatformResult,
  SkillAuthoringProviderSummary,
  SkillAuthoringRulesetDescriptor,
  SkillAuthoringVirtualValidationRequest,
  SkillAuthoringVirtualValidationResponse,
} from "@skills-platform/contracts";

export type {
  SkillAuthoringAnalysis,
  SkillAuthoringBasisKind,
  SkillAuthoringCategory,
  SkillAuthoringConfidence,
  SkillAuthoringFinding,
  SkillAuthoringFindingBasis,
  SkillAuthoringFindingLocation,
  SkillAuthoringPlatform,
  SkillAuthoringPlatformResult,
  SkillAuthoringProviderInspection,
  SkillAuthoringProviderSummary,
  SkillAuthoringRulesetDescriptor,
  SkillAuthoringRulesetRef,
  SkillAuthoringSeverity,
  SkillAuthoringVirtualFile,
  SkillAuthoringVirtualValidationRequest,
  SkillAuthoringVirtualValidationResponse,
} from "@skills-platform/contracts";

export type Scope =
  | "planning"
  | "implementation"
  | "review"
  | "curation"
  | "architecture"
  | "explore"
  | "specialist"
  | "toolchain"
  | "governance";

export type SkillRow = {
  name: string;
  source: string;
  defaultEnabled: boolean;
  overlayEnabled?: boolean;
  defaultReason: string;
  overlayReason?: string;
  artifact_type?: ArtifactType;
  invocation_mode?: InvocationMode;
};

export type DisplaySkill = {
  name: string;
  registry_skill_id?: string;
  lineage_id?: string;
  source: string;
  enabled: boolean;
  reason: string;
  override?: ProjectSkillOverride;
  artifact_type?: ArtifactType;
  invocation_mode?: InvocationMode;
};

export interface ProjectSkillOverride {
  lineage_id: string;
  registry_skill_id: string;
  desired_state: "enabled" | "disabled";
  updated_at: string;
}

export interface ProjectSkillOverrideResult {
  override: ProjectSkillOverride | null;
  cleared?: boolean;
  project_id?: string;
  lineage_id?: string;
}

export type Assignment = {
  preset_id: string;
  template_version: number;
  role: string;
  name?: string;
};

export type RemoteSet = {
  project: { id: string; name: string };
  assignments: Assignment[];
  skill_overrides?: ProjectSkillOverride[];
  skills: Array<{
    skill_name: string;
    registry_skill_id: string;
    lineage_id?: string;
    artifact_type?: ArtifactType;
    invocation_mode?: InvocationMode;
    desired_state: "enabled" | "disabled";
    reason: string;
    override?: ProjectSkillOverride;
    selected_by: { preset_id?: string } | null;
  }>;
};

export type RemoteProject = {
  id: string;
  name: string;
  provider_id?: string;
  delivery_root?: string;
  project_path?: string | null;
  scope?: string;
  default_preset_id?: string;
  default_preset_version?: number;
};
export type RemotePreset = {
  id: string;
  name: string;
  selected_version: number;
  registry_skill_ids: string[];
};

export type RemoteAssignment = {
  preset_id: string;
  template_version: number;
  role: string;
  priority: number;
  work_scope_tags: string[];
  enabled: boolean;
};

export type RemoteHistory = {
  plan_id: string;
  mode: string;
  recorded_at: string;
  reports: Array<{ status: string; report: { summary?: Record<string, number> } }>;
};

export type RemoteComparison = {
  in_sync: boolean;
  summary: Record<string, number>;
  captured_at: string;
  provider_id: string;
};

export type ReviewReason = {
  code: string;
  severity: "critical" | "high" | "medium" | "low";
  detail: string;
};

export type ReviewItem = {
  lineage: { id: string; skill_name: string };
  severity: "critical" | "high" | "medium" | "low";
  reasons: ReviewReason[];
  latest_source_revision_id: string | null;
};

export type SourceReview = {
  id: string;
  decision: "approved" | "rejected";
  summary: string;
  reviewer: string;
  reviewed_at: string;
};

export type SourceAdoptionCandidate = {
  lineage_id: string;
  skill_name: string;
  registry_skill_id: string;
  source_revision_id: string;
  imported_at: string;
  review: SourceReview | null;
  compatible_presets: Array<{
    id: string;
    name: string;
    selected_version: number;
    current_registry_skill_id: string;
    current_source_revision_id: string;
  }>;
};

export type CatalogSkill = {
  lineage: { id: string; skill_name: string; artifact_type?: ArtifactType; invocation_mode?: InvocationMode };
  latest_skill: {
    id: string;
    source_revision_id: string;
    description: string | null;
    artifact_type?: ArtifactType;
    invocation_mode?: InvocationMode;
  } | null;
  profile: SkillProfile;
  notes: Array<{ id: string }>;
};

export type EvaluationSummary = {
  active_case_count: number;
  evaluated_active_case_count: number;
  total_runs: number;
  pass_rate: number | null;
  latest_outcome: string | null;
};

export type SkillAnnotationKind =
  | "plain_language"
  | "rationale"
  | "example"
  | "warning"
  | "glossary";

export interface SkillAnnotationAnchor {
  relative_manifest_path: string;
  start_line: number;
  end_line: number;
  selected_text_sha256: string;
}

export interface SkillAnnotationHistoryEntry {
  version: number;
  changed_at?: string;
  changed_by?: string;
  patch?: Record<string, unknown>;
  [key: string]: unknown;
}

/** Reader-facing metadata only. It is never injected into execution prompts. */
export interface SkillAnnotation {
  id: string;
  lineage_id: string;
  source_revision_id: string | null;
  kind: SkillAnnotationKind;
  title: string | null;
  body: string;
  locale: string;
  anchor: SkillAnnotationAnchor | null;
  author: string;
  origin: "user" | "generated";
  version: number;
  history: SkillAnnotationHistoryEntry[];
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  deleted_by: string | null;
  execution_effect: "none";
}

export interface CreateSkillAnnotationInput {
  source_revision_id?: string;
  kind?: SkillAnnotationKind;
  title?: string | null;
  body: string;
  locale?: string;
  anchor?: SkillAnnotationAnchor | null;
  author?: string;
  origin?: "user" | "generated";
}

export interface UpdateSkillAnnotationInput {
  lineage_id: string;
  expected_version: number;
  patch: Partial<
    Pick<SkillAnnotation, "kind" | "title" | "body" | "locale" | "anchor">
  >;
  author?: string;
}

export type SkillAuthoringStatus = SkillAuthoringProviderSummary["status"];

export interface SkillAuthoringRulesetsResponse {
  rulesets: SkillAuthoringRulesetDescriptor[];
  /** False means the Catalog could not inspect its live analyzer/ruleset registry. */
  available?: boolean;
  message?: string | null;
}

export type ValidateSkillDraftInput = SkillAuthoringVirtualValidationRequest;
export type ValidateSkillDraftResult = SkillAuthoringVirtualValidationResponse;

export interface SkillStaticAnalysis {
  id: string;
  lineage_id: string;
  source_revision_id: string;
  input_content_digest: string;
  analysis_digest: string;
  analyzer: { id: string; version: string };
  manifest_path: string;
  identity: {
    name: string;
    description: string | null;
    frontmatter_fields: string[];
  };
  readability: {
    line_count: number;
    non_empty_line_count: number;
    section_count: number;
    instruction_line_count: number;
    fenced_code_block_count: number;
  };
  sections: Array<{ level: number; title: string; line: number }>;
  references: {
    markdown_link_count: number;
    relative: string[];
    external: string[];
  };
  support_files: { total: number; executable_like: string[] };
  warnings: string[];
  /** Additive provider-aware authoring analysis of the same immutable revision. */
  authoring?: SkillAuthoringAnalysis;
  generated_at: string;
  stale: boolean;
  is_latest_revision?: boolean;
  outdated?: boolean;
  execution_effect: "none";
}

export type DiagnosticStage =
  | "plan"
  | "inspect"
  | "preview"
  | "materialize"
  | "verify";

export type StepStatus = "pending" | "active" | "completed" | "failed";

export interface DiagnosticStepInfo {
  id: DiagnosticStage;
  label: string;
  shortLabel: string;
  description: string;
  stageBasePercent: number;
  stageMaxPercent: number;
}

export interface DriftSummary {
  hasDrift: boolean;
  totalDriftCount: number;
  driftBreakdown: Record<string, number>;
  matchedCount: number;
  providerId: string;
  message: string;
}

export type ApplyProgress = {
  stage: string;
  completed: number;
  total: number;
  message: string;
};

export type ApplyResult = {
  status: string;
  report: {
    summary: {
      applied: number;
      skipped: number;
      failed: number;
    };
    operations?: Array<{
      restart_required?: boolean;
      codex_config?: {
        changed?: boolean;
        enabled?: boolean;
        config_path?: string | null;
      };
    }>;
  };
  error?: string;
};

export interface RecipeInspectionSummary {
  sources_count: number;
  skills_count: number;
  presets_count: number;
  projects_count: number;
  by_invocation_mode: {
    model_invoked: number;
    user_invoked: number;
    hybrid: number;
    unspecified: number;
  };
  by_artifact_type: Record<string, number>;
}

export interface RecipeInspectionResult {
  valid: boolean;
  recipe_id?: string;
  name?: string;
  description?: string | null;
  created_at?: string;
  issues?: Array<{ field: string; message: string }>;
  summary?: RecipeInspectionSummary;
  sources?: Array<{
    source_id: string;
    type: "git" | "local";
    locator: string;
    resolved_commit?: string;
  }>;
  presets?: Array<{
    id: string;
    name: string;
    version: number;
    skills_count: number;
  }>;
  projects?: RecipeProjectBinding[];
}

export interface RecipeApplyOptions {
  recipe: SkillRecipe | string;
  project_path?: string;
  provider_id?: "codex" | "antigravity" | "claude" | string;
  confirm?: boolean;
}

export interface RecipeApplyResult {
  recipe_id: string;
  name: string;
  sources_imported: Array<{ source_id: string; locator: string; imported_skills: number }>;
  presets_reconciled: Array<{ id: string; matched_skills: number }>;
  delivery?: {
    project_id: string;
    preview?: any;
    report?: any;
    applied: boolean;
    message?: string;
  } | null;
}

export type TelemetryOutcome = FeedbackOutcome;
export type TelemetryEvidenceType = EvidenceType;

export interface TelemetryEvent {
  id?: string;
  timestamp: string;          // ISO 8601 UTC timestamp
  provider_id: string;        // "antigravity" | "claude" | "codex" | "ralph-tui" | string
  project_id: string;
  recipe_id?: string | null;
  skill_name: string;
  lineage_id?: string | null;
  invocation_mode: InvocationMode;
  duration_ms: number;
  tool_calls_count: number;
  outcome: FeedbackOutcome;
  evidence_type: EvidenceType;
  summary: string;
  details?: string | null;
  metrics?: Record<string, number>;
}

export interface InvocationModeDistribution {
  model_invoked: number;
  user_invoked: number;
  hybrid: number;
  unspecified: number;
}

export interface InvocationModeRatio {
  mode: InvocationMode;
  count: number;
  percentage: number;
}

export interface TelemetryHealthDistribution {
  healthy: number;
  needs_review: number;
  unknown: number;
}

export interface TelemetrySummary {
  total_invocations: number;
  average_duration_ms: number;
  success_rate: number;
  by_mode: InvocationModeDistribution;
  by_provider: Record<string, number>;
  by_health: TelemetryHealthDistribution;
  recent_events: TelemetryEvent[];
  invocation_mode_ratios?: InvocationModeRatio[];
  last_event_at?: string | null;
}

export interface TelemetryQueryParams {
  projectId?: string;
  providerId?: string;
  skillName?: string;
  since?: string;
  limit?: number;
}

export interface HookInterceptionResult {
  allow: boolean;
  reason?: string;
  self_correct_hint?: string;
  violation_type?: string;
  matched_pattern?: string;
  details?: Record<string, any>;
}

export interface HookExecutionResult {
  hookId: string;
  event: string;
  status: "success" | "failed" | "timed_out" | "skipped" | "blocked";
  allow?: boolean;
  durationMs: number;
  stdout?: string;
  stderr?: string | null;
  error?: string | null;
  interception?: HookInterceptionResult | null;
}

export interface HookSimulationResult {
  eventName: string;
  allow: boolean;
  halted: boolean;
  blockedBy?: string;
  reason?: string;
  self_correct_hint?: string;
  interception?: HookInterceptionResult | null;
  triggeredAt: string;
  totalHooks: number;
  executedCount: number;
  results: HookExecutionResult[];
}

export interface SecurityFeedEvent {
  id: string;
  timestamp: string;
  type: "block" | "warn" | "allow" | "sync" | "error";
  category: "secret_leak" | "destructive_command" | "context_budget" | "scope_boundary" | "recursion_limit" | "test_storm" | "general";
  hook_id: string;
  hook_name: string;
  tool_name?: string;
  details: string;
  reason?: string;
  self_correct_hint?: string;
  latency_ms?: number;
}

export type HookProviderStatus =
  | "synced"
  | "drift"
  | "not_configured"
  | "unsupported"
  | "invalid";

export interface HookConfigParseDiagnostic {
  exists: boolean;
  jsonParsed: boolean;
  strictValid: boolean;
  issues: Array<string | { field?: string; message: string }>;
}

export interface CodexHookFeatureDiagnostic {
  found: boolean;
  stage: string | null;
  enabled: boolean | null;
}

export interface CodexHookCapabilityDiagnostic {
  command?: string;
  installed: boolean;
  version: string | null;
  versionSupported: boolean;
  minimumVersion: string;
  strictConfig: {
    supported: boolean;
    parsed: boolean | null;
    status: "unsupported" | "valid" | "invalid";
    error: string | null;
  };
  featuresList: {
    available: boolean;
    error: string | null;
  };
  hooksFeature: CodexHookFeatureDiagnostic;
  supportedEvents: string[];
  excludedEvents: string[];
  asyncSupported: boolean;
  mcpToolSupported: boolean;
}

export interface HookRuntimeTrustDiagnostic {
  observed: boolean;
  status: "trusted" | "untrusted" | "unknown";
}

export interface HookProviderDiagnostic {
  provider: string;
  supported: boolean;
  unsupported: boolean;
  configured: boolean;
  synced: boolean;
  drift: boolean;
  status: HookProviderStatus;
  configPath: string | null;
  configParse?: HookConfigParseDiagnostic;
  expectedHookIds: string[];
  actualHookIds: string[];
  missingHookIds: string[];
  unexpectedHookIds: string[];
  unmanagedHookIds?: string[];
  expectedDigest?: string | null;
  actualDigest?: string | null;
  capability?: CodexHookCapabilityDiagnostic;
  /** Compatibility alias for capability.hooksFeature. */
  feature?: CodexHookFeatureDiagnostic;
  trust?: HookRuntimeTrustDiagnostic;
  runtimeReady: boolean;
  runtimeBlockers?: string[];
  error: string | null;
}

export interface HookEntryProviderDiagnostic {
  requested: boolean;
  supported: boolean;
  unsupported: boolean;
  configured: boolean;
  present: boolean;
  synced: boolean;
  status: HookProviderStatus | "not_requested" | "disabled";
  runtimeReady: boolean;
}

export interface HookRuntimeDiagnostic {
  id: string;
  name?: string;
  event: string;
  priority: number;
  desiredEnabled: boolean;
  failurePolicy?: string;
  handler: {
    type: string;
    target: string | null;
    resolvedTarget?: string | null;
    exists: boolean | null;
    supported: boolean;
    error: string | null;
  };
  providers: Record<string, HookEntryProviderDiagnostic>;
  runtimeReady: boolean;
  issues: string[];
}

export interface HookSyncIssue {
  provider?: string;
  code?: string;
  message: string;
  [key: string]: unknown;
}

export interface HookSyncResult {
  antigravityHooks: number;
  claudeHooks: number;
  codexHooks: number;
  providers: Record<string, HookProviderDiagnostic>;
  unsupportedProviders: string[];
  fullySynced: boolean;
  ok: boolean;
  issues: HookSyncIssue[];
  syncedAt: string;
}

export interface HookDiagnostics {
  analyzedAt: string;
  projectPath: string | null;
  manifestPath: string | null;
  manifestUpdatedAt?: string;
  desired: { total: number; enabled: number; disabled: number };
  summary: {
    configuredProviders: number;
    syncedProviders: number;
    driftedProviders: number;
    unsupportedProviders: number;
    missingHandlers: number;
    runtimeReadyHooks: number;
  };
  healthy: boolean;
  providers: Record<string, HookProviderDiagnostic>;
  hooks: HookRuntimeDiagnostic[];
  issues: string[];
}

export interface VerifyWorkspaceResult {
  verified: boolean;
  workspace_id?: string;
  test_output?: string;
  invariant_checks?: Record<string, boolean>;
  issues?: Array<{ field: string; message: string }>;
  error?: string;
}

export interface MergeWorkspaceResult {
  merged: boolean;
  workspace_id?: string;
  commit_hash?: string;
  status?: string;
  error?: string;
  code?: string;
}

export interface PruneWorkspaceResult {
  pruned: boolean;
  workspace_id?: string;
  completed_at?: string;
  error?: string;
}

export interface DiscardWorkspaceResult {
  discarded: boolean;
  workspace_id?: string;
  status?: string;
  reason?: string;
  error?: string;
}

export interface MergeQueueItem {
  workspace_id: string;
  task_id?: string;
  dependencies: string[];
  status: ProcedureWorkspaceStatus | "pending" | "in_verification" | "verified" | "merged" | "failed" | "discarded" | string;
  position?: number;
  enqueued_at?: string;
  verified_at?: string | null;
  merged_at?: string | null;
  discarded_at?: string | null;
  commit_hash?: string | null;
  reason?: string | null;
  procedure_type?: ProcedureType | null;
}

export interface MergeQueueStatus {
  queue: MergeQueueItem[];
  current?: MergeQueueItem | null;
  pending?: MergeQueueItem[];
  in_verification?: MergeQueueItem[];
  verified?: MergeQueueItem[];
  merged?: MergeQueueItem[];
  failed?: MergeQueueItem[];
  discarded?: MergeQueueItem[];
}

export interface ProcessQueueResult {
  processed: Array<{
    workspace_id: string;
    success: boolean;
    merged: boolean;
    commit_hash?: string;
    error?: string;
  }>;
  queue: MergeQueueItem[];
  merged: MergeQueueItem[];
  failed: MergeQueueItem[];
  discarded: MergeQueueItem[];
  pending: MergeQueueItem[];
}

export type {
  ArtifactType,
  InvocationMode,
  UpstreamStatus,
  UpstreamProvider,
  UpstreamBinding,
  RegistrySkill,
  FeedbackSummary,
  SkillFeedback,
  FeedbackOutcome,
  EvidenceType,
  SkillNote,
  SkillProfile,
  SkillRecipe,
  RecipeSource,
  RecipeSkill,
  RecipePreset,
  RecipeProjectBinding,
  HookDefinition,
  HookManifest,
  HookHandler,
  StandardHookEvent,
  ProcedureType,
  ProcedureWorkspaceStatus,
  ResponsibilityInvariants,
  ProcedureWorkspace,
  CreateProcedureWorkspaceOptions,
};
