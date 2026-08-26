import type {
  ArtifactType,
  InvocationMode,
  UpstreamStatus,
  UpstreamProvider,
  UpstreamBinding,
  RegistrySkill,
  FeedbackSummary,
  SkillFeedback,
  SkillNote,
  SkillProfile,
} from "@skills-platform/contracts";

export type Scope = "planning" | "implementation" | "review";

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

export type RemoteProject = { id: string; name: string };
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

export type {
  ArtifactType,
  InvocationMode,
  UpstreamStatus,
  UpstreamProvider,
  UpstreamBinding,
  RegistrySkill,
  FeedbackSummary,
  SkillFeedback,
  SkillNote,
  SkillProfile,
};

