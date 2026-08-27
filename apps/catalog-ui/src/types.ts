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
  source: string;
  enabled: boolean;
  reason: string;
  artifact_type?: ArtifactType;
  invocation_mode?: InvocationMode;
};

export type Assignment = {
  preset_id: string;
  template_version: number;
  role: string;
  name?: string;
};

export type RemoteSet = {
  project: { id: string; name: string };
  assignments: Assignment[];
  skills: Array<{
    skill_name: string;
    artifact_type?: ArtifactType;
    invocation_mode?: InvocationMode;
    desired_state: "enabled" | "disabled";
    reason: string;
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
};


