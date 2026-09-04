import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart2,
  BookOpen,
  Bot,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  Cpu,
  Edit3,
  FileCode,
  FileText,
  Gauge,
  Layers,
  LayoutGrid,
  List,
  LoaderCircle,
  MessageSquare,
  Radio,
  RefreshCw,
  Shield,
  Sparkles,
  Tag,
  Terminal,
  Trash2,
  TrendingUp,
  Undo2,
  User,
  XCircle,
  Zap,
} from "lucide-react";
import { FilterToolbar, type InvocationFilterMode, type ViewMode } from "./FilterToolbar";
import {
  DeliveryPathIndicator,
  InvocationBadge,
  ProviderBadge,
  getInvocationModeInfo,
  getProviderInfo,
  resolveDeliveryPath,
} from "../visual-identity";
import {
  calculateInvocationModeRatios,
  createSkillAnnotationApi,
  createMockTelemetrySummary,
  deleteSkillAnnotationApi,
  fetchSkillAnalysesApi,
  fetchSkillAnnotationsApi,
  fetchSkillAuthoringRulesetsApi,
  fetchTelemetrySummary,
  formatDuration,
  restoreSkillAnnotationApi,
  runSkillAnalysisApi,
  updateSkillAnnotationApi,
} from "../api/catalog-api";
import type {
  CatalogSkill,
  EvaluationSummary,
  FeedbackSummary,
  InvocationMode,
  InvocationModeDistribution,
  InvocationModeRatio,
  SkillFeedback,
  SkillAnnotation,
  SkillAnnotationKind,
  SkillAuthoringFinding,
  SkillAuthoringPlatform,
  SkillAuthoringPlatformResult,
  SkillAuthoringRulesetDescriptor,
  SkillAuthoringStatus,
  SkillNote,
  SkillStaticAnalysis,
  TelemetryEvent,
  TelemetrySummary,
} from "../types";

const AUTHORING_PLATFORMS: Array<{ id: SkillAuthoringPlatform; label: string }> = [
  { id: "codex", label: "Codex" },
  { id: "antigravity", label: "Antigravity" },
];

function resolvedAuthoringStatus(result?: SkillAuthoringPlatformResult): SkillAuthoringStatus | null {
  if (!result) return null;
  return result.summary.status;
}

function authoringStatusLabel(status: SkillAuthoringStatus | null): string {
  if (status === "conformant") return "Ready";
  if (status === "review_recommended") return "Warning";
  if (status === "nonconformant") return "Blocked";
  return "Not analyzed";
}

function authoringStatusClass(status: SkillAuthoringStatus | null): string {
  if (status === "conformant") return "ready";
  if (status === "review_recommended") return "warning";
  if (status === "nonconformant") return "blocked";
  return "unknown";
}

function findingIdentity(finding: SkillAuthoringFinding): string {
  const location = finding.location;
  return [
    finding.rule_id,
    location?.relative_path ?? "",
    location?.start_line ?? "",
    location?.yaml_path ?? "",
    finding.message,
  ].join("\u0000");
}

function findingRuleLabel(finding: SkillAuthoringFinding): string {
  return finding.rule_id;
}

function findingLocationLabel(finding: SkillAuthoringFinding): string | null {
  if (!finding.location) return null;
  const line = finding.location.start_line ? `:${finding.location.start_line}` : "";
  const field = finding.location.yaml_path ? ` · ${finding.location.yaml_path}` : "";
  return `${finding.location.relative_path}${line}${field}`;
}

function findingBasisLabel(finding: SkillAuthoringFinding): string {
  return [finding.basis.kind, finding.basis.statement, finding.basis.source_url]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join(" · ") || "Analyzer rule";
}

function observationLabel(value: unknown): string {
  if (value === null || value === undefined) return "Not reported";
  if (Array.isArray(value)) return value.length ? value.map(String).join(", ") : "None";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function AuthoringFindingList({
  title,
  findings,
}: {
  title: string;
  findings: SkillAuthoringFinding[];
}) {
  if (findings.length === 0) return null;
  return (
    <div className="authoring-finding-group">
      <div className="authoring-subheading">
        <strong>{title}</strong>
        <span>{findings.length}</span>
      </div>
      <div className="authoring-finding-list">
        {findings.map((finding, index) => {
          const location = findingLocationLabel(finding);
          return (
            <article
              className={`authoring-finding ${finding.severity}`}
              key={`${findingIdentity(finding)}-${index}`}
            >
              <div className="authoring-finding-heading">
                <span className={`authoring-severity ${finding.severity}`}>
                  {finding.severity === "error" ? <XCircle size={13} /> : null}
                  {finding.severity === "warning" ? <AlertTriangle size={13} /> : null}
                  {finding.severity === "info" ? <BookOpen size={13} /> : null}
                  {finding.severity}
                </span>
                <code>{findingRuleLabel(finding)}</code>
                <span className="authoring-confidence">{finding.confidence} confidence</span>
              </div>
              <p>{finding.message}</p>
              <dl className="authoring-finding-details">
                {location ? (
                  <div>
                    <dt>Location</dt>
                    <dd><code>{location}</code></dd>
                  </div>
                ) : null}
                <div>
                  <dt>Basis</dt>
                  <dd>{findingBasisLabel(finding)}</dd>
                </div>
                <div>
                  <dt>Recommendation</dt>
                  <dd>{finding.recommendation || "Review the cited rule and update the source when appropriate."}</dd>
                </div>
              </dl>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function ProviderAuthoringMetadata({ result }: { result: SkillAuthoringPlatformResult }) {
  const metadata = result.provider_metadata ?? {};
  const packageMetadata = (
    <>
      <div className="authoring-subheading">
        <strong>Manifest and frontmatter</strong>
        <span>{metadata.manifest_exact_case === false ? "Case mismatch" : "Revision observation"}</span>
      </div>
      <dl className="authoring-metadata-grid">
        <div><dt>Manifest</dt><dd>{metadata.manifest_path || "Not observed"}</dd></div>
        <div><dt>Resolved name</dt><dd>{metadata.resolved_name || "Not observed"}</dd></div>
        <div>
          <dt>Frontmatter fields</dt>
          <dd>{metadata.frontmatter_fields.length ? metadata.frontmatter_fields.join(", ") : "None"}</dd>
        </div>
        <div><dt>Discovery root</dt><dd>{metadata.discovery_root || "Not reported"}</dd></div>
      </dl>
    </>
  );
  if (result.platform === "codex") {
    const openaiMetadata = metadata.openai;
    const interfaceMetadata = openaiMetadata?.interface;
    const implicit = openaiMetadata?.policy?.allow_implicit_invocation;
    const invocationMode = metadata.invocation_mode;
    return (
      <div className="authoring-provider-metadata" aria-label="Codex provider metadata">
        {packageMetadata}
        <div className="authoring-subheading">
          <strong>Codex interface metadata</strong>
          <span>{openaiMetadata?.present ? "agents/openai.yaml" : "Optional file absent"}</span>
        </div>
        {interfaceMetadata ? (
          <dl className="authoring-metadata-grid">
            <div><dt>Display name</dt><dd>{interfaceMetadata.display_name || "Not set"}</dd></div>
            <div><dt>Short description</dt><dd>{interfaceMetadata.short_description || "Not set"}</dd></div>
            <div><dt>Brand color</dt><dd>{interfaceMetadata.brand_color || "Not set"}</dd></div>
            <div><dt>Default prompt</dt><dd>{interfaceMetadata.default_prompt || "Not set"}</dd></div>
            <div><dt>Small icon</dt><dd>{interfaceMetadata.icon_small || "Not set"}</dd></div>
            <div><dt>Large icon</dt><dd>{interfaceMetadata.icon_large || "Not set"}</dd></div>
          </dl>
        ) : (
          <p className="authoring-empty-copy">
            Codex UI metadata is optional. Its absence does not block the skill.
          </p>
        )}
        <div className="authoring-policy-row">
          <span>Invocation policy</span>
          <strong
            className={
              implicit === false || invocationMode === "explicit_only"
                ? "explicit-only"
                : "implicit-allowed"
            }
          >
            {implicit === false || invocationMode === "explicit_only"
              ? "Explicit only — $skill remains available"
              : implicit === true || invocationMode === "implicit_and_explicit"
                ? "Implicit and explicit invocation"
                : "Default policy (implicit allowed unless configured otherwise)"}
          </strong>
        </div>
      </div>
    );
  }

  const resources = metadata.antigravity?.resources ?? [];
  const examples = metadata.antigravity?.examples ?? [];
  return (
    <div className="authoring-provider-metadata" aria-label="Antigravity provider metadata">
      {packageMetadata}
      <div className="authoring-subheading">
        <strong>Antigravity package resources</strong>
        <span>Provider-specific layout</span>
      </div>
      <dl className="authoring-metadata-grid">
        <div>
          <dt>resources/</dt>
          <dd>{resources.length ? resources.join(", ") : "None observed"}</dd>
        </div>
        <div>
          <dt>examples/</dt>
          <dd>{examples.length ? examples.join(", ") : "None observed"}</dd>
        </div>
      </dl>
      <p className="authoring-empty-copy">
        These Antigravity conventions are evaluated independently from Codex assets and
        agents/openai.yaml metadata.
      </p>
    </div>
  );
}

export function formatTimeAgo(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime();
  if (Number.isNaN(diff) || diff < 0) return "just now";
  const seconds = Math.floor(diff / 1000);
  if (seconds < 30) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function InvocationModeRatioVisualizer({
  ratios,
  byMode,
}: {
  ratios?: InvocationModeRatio[];
  byMode?: InvocationModeDistribution;
}) {
  const computedRatios = useMemo(() => {
    if (ratios && ratios.length > 0) return ratios;
    if (byMode) return calculateInvocationModeRatios(byMode);
    return calculateInvocationModeRatios();
  }, [ratios, byMode]);

  const totalCount = computedRatios.reduce((acc, r) => acc + r.count, 0);

  return (
    <div className="invocation-ratio-visualizer" aria-label="Invocation mode ratio breakdown">
      <div className="ratio-header-row">
        <div className="ratio-title-group">
          <BarChart2 size={15} className="mint" />
          <span className="ratio-title">Invocation Mode Breakdown</span>
        </div>
        <span className="ratio-total-tag">{totalCount} total runs</span>
      </div>

      {/* Stacked Proportional Bar */}
      <div
        className="ratio-bar-track"
        role="progressbar"
        aria-valuenow={100}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        {computedRatios.map((ratio) => {
          if (ratio.percentage <= 0 && totalCount > 0) return null;
          const meta = getInvocationModeInfo(ratio.mode);
          const widthPercent = totalCount === 0 ? 25 : Math.max(ratio.percentage, 4);
          return (
            <div
              key={ratio.mode}
              className={`ratio-bar-segment ${meta.pillClass}`}
              style={{ width: `${widthPercent}%` }}
              title={`${meta.label}: ${ratio.count} invocations (${ratio.percentage}%)`}
            >
              {ratio.percentage >= 12 ? (
                <span className="segment-label">
                  {meta.icon} {ratio.percentage}%
                </span>
              ) : null}
            </div>
          );
        })}
      </div>

      {/* Legend & Breakdown Chips */}
      <div className="ratio-legend-grid">
        {computedRatios.map((ratio) => {
          const meta = getInvocationModeInfo(ratio.mode);
          return (
            <div key={ratio.mode} className={`ratio-legend-item ${meta.pillClass}`}>
              <span className="legend-dot" aria-hidden="true" />
              <span className="legend-mode-name">{meta.shortLabel}</span>
              <span className="legend-count">{ratio.count}</span>
              <span className="legend-percent">({ratio.percentage}%)</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function TelemetryActivityTimeline({
  events,
  skillName,
}: {
  events: TelemetryEvent[];
  skillName?: string;
}) {
  const filteredEvents = useMemo(() => {
    if (!skillName) return events;
    const directMatches = events.filter(
      (e) => e.skill_name.toLowerCase() === skillName.toLowerCase(),
    );
    return directMatches.length > 0 ? directMatches : events;
  }, [events, skillName]);

  return (
    <div className="telemetry-timeline-container" aria-label="Recent telemetry timeline">
      <div className="timeline-header">
        <Clock size={15} className="mint" />
        <span className="section-label">Real-Time Invocation Feed</span>
        <span className="timeline-count-pill">{filteredEvents.length} events</span>
      </div>

      {filteredEvents.length === 0 ? (
        <div className="telemetry-feed-empty">
          <Activity size={18} className="muted" />
          <span>No live telemetry recorded for this skill yet.</span>
        </div>
      ) : (
        <div className="telemetry-event-list">
          {filteredEvents.slice(0, 5).map((ev, index) => {
            const timeAgo = formatTimeAgo(ev.timestamp);
            return (
              <div
                key={ev.id || `${ev.timestamp}-${index}`}
                className={`telemetry-event-card ${ev.outcome}`}
              >
                <div className="event-top-row">
                  <div className="event-identity-cluster">
                    <span className={`event-outcome-badge ${ev.outcome}`}>
                      {ev.outcome === "success" && <CheckCircle2 size={12} />}
                      {ev.outcome === "risk" && <AlertTriangle size={12} />}
                      {ev.outcome === "correction" && <TrendingUp size={12} />}
                      {ev.outcome === "scope_mismatch" && <AlertTriangle size={12} />}
                      {ev.outcome === "neutral" && <Shield size={12} />}
                      <span>{ev.outcome.replaceAll("_", " ")}</span>
                    </span>
                    <InvocationBadge mode={ev.invocation_mode} size="sm" showTooltip={true} />
                    <ProviderBadge
                      providerId={ev.provider_id}
                      showDeliveryPath={false}
                      showTooltip={false}
                    />
                  </div>
                  <div className="event-metrics-cluster">
                    <span className="event-duration-tag">
                      <Zap size={11} /> {formatDuration(ev.duration_ms)}
                    </span>
                    <span className="event-tools-tag">{ev.tool_calls_count} tools</span>
                    <span className="event-timestamp">{timeAgo}</span>
                  </div>
                </div>
                <p className="event-summary-text">{ev.summary}</p>
                {ev.recipe_id && (
                  <div className="event-footer-row">
                    <span className="recipe-tag">Recipe: {ev.recipe_id}</span>
                    <span className="evidence-type-tag">Evidence: {ev.evidence_type}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function SkillCardGrid({
  skills,
  selectedLineageId,
  onSelect,
  providerId = "antigravity",
}: {
  skills: CatalogSkill[];
  selectedLineageId: string | null;
  onSelect: (lineageId: string) => void;
  providerId?: string;
}) {
  return (
    <div className="skill-card-grid" role="list" aria-label="Skills card grid">
      {skills.map((skill) => {
        const isSelected = skill.lineage.id === selectedLineageId;
        const invMode =
          skill.profile.invocation_mode ??
          skill.latest_skill?.invocation_mode ??
          skill.lineage.invocation_mode ??
          "unspecified";
        const reviewState = skill.profile.review_state ?? "unreviewed";
        const skillName = skill.profile.title || skill.lineage.skill_name;

        return (
          <div
            key={skill.lineage.id}
            className={`skill-card ${isSelected ? "selected" : ""} ${reviewState}`}
            onClick={() => onSelect(skill.lineage.id)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect(skill.lineage.id);
              }
            }}
          >
            <div className="skill-card-header">
              <div className="skill-card-title-group">
                <span className={`skill-status-dot ${reviewState}`} />
                <h3 className="skill-card-title">{skillName}</h3>
              </div>
              <span className={`review-state-pill ${reviewState}`}>
                {reviewState.replaceAll("_", " ")}
              </span>
            </div>

            <p className="skill-card-desc">
              {skill.profile.summary ||
                skill.latest_skill?.description ||
                "No description available for this skill."}
            </p>

            <div className="skill-card-meta">
              <InvocationBadge mode={invMode} showTooltip={true} />
              <ProviderBadge providerId={providerId} showDeliveryPath={false} showTooltip={true} />

              {skill.profile.risk_level ? (
                <span className={`risk-badge risk-${skill.profile.risk_level}`}>
                  Risk: {skill.profile.risk_level}
                </span>
              ) : null}
            </div>

            <div className="skill-card-path-row">
              <span className="path-label">Binding Path:</span>
              <DeliveryPathIndicator
                providerId={providerId}
                skillName={skill.lineage.skill_name}
                showTooltip={true}
              />
            </div>

            {skill.profile.use_when && skill.profile.use_when.length > 0 ? (
              <div className="skill-card-tags">
                {skill.profile.use_when.slice(0, 3).map((tag, idx) => (
                  <span key={idx} className="skill-tag">
                    {tag}
                  </span>
                ))}
                {skill.profile.use_when.length > 3 ? (
                  <span className="skill-tag-more">+{skill.profile.use_when.length - 3}</span>
                ) : null}
              </div>
            ) : null}

            <div className="skill-card-footer">
              <span className="skill-lineage-id">
                {skill.latest_skill?.source_revision_id
                  ? `rev: ${skill.latest_skill.source_revision_id.slice(0, 8)}`
                  : skill.lineage.id}
              </span>
              <button
                type="button"
                className="skill-card-action"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(skill.lineage.id);
                }}
              >
                {isSelected ? "Editing" : "Configure"}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function SkillWorkspace({
  skills,
  selectedLineageId,
  onSelect,
  onSave,
  saving,
  feedback,
  feedbackSummary,
  notes,
  evaluationSummary,
  loadingEvidence,
  recordingFeedback,
  recordingNote,
  onRecordFeedback,
  onAddNote,
  providerId = "antigravity",
  telemetrySummary: propTelemetrySummary,
}: {
  skills: CatalogSkill[];
  selectedLineageId: string | null;
  onSelect: (lineageId: string) => void;
  onSave: (
    lineageId: string,
    patch: {
      purpose: string | null;
      use_when: string[];
      review_state: "unreviewed" | "reviewed" | "deprecated";
      invocation_mode?: InvocationMode;
    },
  ) => void;
  saving: boolean;
  feedback: SkillFeedback[];
  feedbackSummary: FeedbackSummary | null;
  notes: SkillNote[];
  evaluationSummary: EvaluationSummary | null;
  loadingEvidence: boolean;
  recordingFeedback: boolean;
  recordingNote: boolean;
  onRecordFeedback: (
    lineageId: string,
    patch: { outcome: string; evidence_type: string; summary: string },
  ) => void;
  onAddNote: (
    lineageId: string,
    patch: { kind: string; body: string; inject_into_prompt: boolean },
  ) => void;
  providerId?: string;
  telemetrySummary?: TelemetrySummary | null;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [invocationFilter, setInvocationFilter] = useState<InvocationFilterMode>("all");
  const [providerFilter, setProviderFilter] = useState("all");
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [internalTelemetry, setInternalTelemetry] = useState<TelemetrySummary | null>(null);

  const [purpose, setPurpose] = useState("");
  const [useWhen, setUseWhen] = useState("");
  const [reviewState, setReviewState] = useState<"unreviewed" | "reviewed" | "deprecated">(
    "unreviewed",
  );
  const [invocationMode, setInvocationMode] = useState<InvocationMode>("unspecified");
  const [feedbackOutcome, setFeedbackOutcome] = useState("success");
  const [feedbackEvidence, setFeedbackEvidence] = useState("manual");
  const [feedbackText, setFeedbackText] = useState("");
  const [noteKind, setNoteKind] = useState("usage");
  const [noteText, setNoteText] = useState("");
  const [injectNote, setInjectNote] = useState(false);
  const [annotations, setAnnotations] = useState<SkillAnnotation[]>([]);
  const [analyses, setAnalyses] = useState<SkillStaticAnalysis[]>([]);
  const [authoringPlatform, setAuthoringPlatform] = useState<SkillAuthoringPlatform>("codex");
  const [authoringRulesets, setAuthoringRulesets] = useState<SkillAuthoringRulesetDescriptor[]>([]);
  const [rulesetsAvailable, setRulesetsAvailable] = useState<boolean | null>(null);
  const [rulesetsMessage, setRulesetsMessage] = useState<string | null>(null);
  const [loadingInterpretation, setLoadingInterpretation] = useState(false);
  const [interpretationError, setInterpretationError] = useState<string | null>(null);
  const [annotationBusy, setAnnotationBusy] = useState<string | null>(null);
  const [analysisRunning, setAnalysisRunning] = useState(false);
  const [annotationKind, setAnnotationKind] = useState<SkillAnnotationKind>("plain_language");
  const [annotationTitle, setAnnotationTitle] = useState("");
  const [annotationBody, setAnnotationBody] = useState("");
  const [annotationLocale, setAnnotationLocale] = useState(() =>
    typeof navigator === "undefined" ? "en" : navigator.language || "en",
  );
  const [editingAnnotation, setEditingAnnotation] = useState<{
    id: string;
    kind: SkillAnnotationKind;
    title: string;
    body: string;
    locale: string;
  } | null>(null);

  useEffect(() => {
    let active = true;
    void fetchSkillAuthoringRulesetsApi()
      .then((result) => {
        if (!active) return;
        setAuthoringRulesets(result.rulesets);
        setRulesetsAvailable(result.available ?? true);
        setRulesetsMessage(result.message ?? null);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setAuthoringRulesets([]);
        setRulesetsAvailable(false);
        setRulesetsMessage(
          error instanceof Error ? error.message : "Failed to load authoring rulesets",
        );
      });
    return () => {
      active = false;
    };
  }, []);

  // Filter skills
  const visible = useMemo(() => {
    return skills.filter((skill) => {
      // 1. Invocation mode filter
      if (invocationFilter !== "all") {
        const mode =
          skill.profile.invocation_mode ??
          skill.latest_skill?.invocation_mode ??
          skill.lineage.invocation_mode ??
          "unspecified";
        if (mode !== invocationFilter) return false;
      }

      // 2. Provider filter
      if (providerFilter !== "all") {
        const tags = (skill.profile.tags || []).map((t) => t.toLowerCase());
        const desc = (skill.latest_skill?.description || "").toLowerCase();
        const prov = providerFilter.toLowerCase();
        const matchesProvider =
          tags.some((t) => t.includes(prov)) || desc.includes(prov) || skill.lineage.id.includes(prov);
        if (!matchesProvider) return false;
      }

      // 3. Keyword / tag search
      const needle = searchQuery.trim().toLowerCase();
      if (!needle) return true;

      const searchable = [
        skill.lineage.skill_name,
        skill.profile.title,
        skill.profile.summary,
        skill.profile.purpose,
        skill.latest_skill?.description,
        resolveDeliveryPath(providerId, skill.lineage.skill_name),
        ...(skill.profile.tags || []),
        ...(skill.profile.use_when || []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchable.includes(needle);
    });
  }, [skills, invocationFilter, providerFilter, searchQuery, providerId]);

  const selected =
    visible.find((skill) => skill.lineage.id === selectedLineageId) ??
    skills.find((skill) => skill.lineage.id === selectedLineageId) ??
    visible[0] ??
    skills[0] ??
    null;

  useEffect(() => {
    setPurpose(selected?.profile.purpose ?? "");
    setUseWhen(selected?.profile.use_when.join(", ") ?? "");
    setReviewState(selected?.profile.review_state ?? "unreviewed");
    setInvocationMode(
      selected?.profile.invocation_mode ??
        selected?.latest_skill?.invocation_mode ??
        selected?.lineage.invocation_mode ??
        "unspecified",
    );
  }, [
    selected?.lineage.id,
    selected?.profile.purpose,
    selected?.profile.review_state,
    selected?.profile.use_when,
    selected?.profile.invocation_mode,
    selected?.latest_skill?.invocation_mode,
    selected?.lineage.invocation_mode,
  ]);

  useEffect(() => {
    let active = true;
    const lineageId = selected?.lineage.id;
    setEditingAnnotation(null);
    setInterpretationError(null);
    if (!lineageId) {
      setAnnotations([]);
      setAnalyses([]);
      setLoadingInterpretation(false);
      return () => {
        active = false;
      };
    }

    setLoadingInterpretation(true);
    void Promise.all([
      fetchSkillAnnotationsApi(lineageId, { includeDeleted: true }),
      fetchSkillAnalysesApi(lineageId),
    ])
      .then(([annotationResult, analysisResult]) => {
        if (!active) return;
        setAnnotations(annotationResult.annotations);
        setAnalyses(analysisResult.analyses);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setAnnotations([]);
        setAnalyses([]);
        setInterpretationError(
          error instanceof Error ? error.message : "Failed to load reader metadata",
        );
      })
      .finally(() => {
        if (active) setLoadingInterpretation(false);
      });

    return () => {
      active = false;
    };
  }, [selected?.lineage.id]);

  useEffect(() => {
    let active = true;
    const fetchSummary = async () => {
      try {
        const skillName = selected?.profile.title || selected?.lineage.skill_name;
        const summary = await fetchTelemetrySummary({ skillName });
        if (active) setInternalTelemetry(summary);
      } catch {
        // Resilient to intermittent poll errors
      }
    };

    void fetchSummary();
    const interval = setInterval(() => {
      void fetchSummary();
    }, 4000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [selected?.lineage.id, selected?.lineage.skill_name, selected?.profile.title]);

  const telemetrySummary =
    propTelemetrySummary ?? internalTelemetry ?? createMockTelemetrySummary();

  const activeAnnotations = annotations.filter((annotation) => annotation.deleted_at === null);
  const deletedAnnotations = annotations.filter((annotation) => annotation.deleted_at !== null);
  const latestAnalysis = [...analyses].sort(
    (left, right) => new Date(right.generated_at).getTime() - new Date(left.generated_at).getTime(),
  )[0] ?? null;
  const authoringResults = latestAnalysis?.authoring?.results ?? {};
  const activeAuthoringResult = authoringResults[authoringPlatform];
  const activeRuleset = authoringRulesets.find(
    (ruleset) => ruleset.platform === authoringPlatform,
  ) ?? null;
  const activeRulesetIdentity = activeAuthoringResult?.ruleset ?? (activeRuleset ? {
    id: activeRuleset.ruleset_id,
    version: activeRuleset.version,
    source: activeRuleset.source_url,
  } : null);
  const commonAuthoringFindings = useMemo(() => {
    const codex = latestAnalysis?.authoring?.results.codex?.findings ?? [];
    const antigravity = latestAnalysis?.authoring?.results.antigravity?.findings ?? [];
    const antigravityKeys = new Set(antigravity.map(findingIdentity));
    return codex.filter((finding) => antigravityKeys.has(findingIdentity(finding)));
  }, [latestAnalysis]);
  const commonFindingKeys = new Set(commonAuthoringFindings.map(findingIdentity));
  const platformAuthoringFindings = (activeAuthoringResult?.findings ?? []).filter(
    (finding) => !commonFindingKeys.has(findingIdentity(finding)),
  );

  const replaceAnnotation = (updated: SkillAnnotation) => {
    setAnnotations((current) => {
      const exists = current.some((annotation) => annotation.id === updated.id);
      return exists
        ? current.map((annotation) => (annotation.id === updated.id ? updated : annotation))
        : [updated, ...current];
    });
  };

  const handleCreateAnnotation = async () => {
    if (!selected || !annotationBody.trim()) return;
    setAnnotationBusy("create");
    setInterpretationError(null);
    try {
      const created = await createSkillAnnotationApi(selected.lineage.id, {
        source_revision_id: selected.latest_skill?.source_revision_id,
        kind: annotationKind,
        title: annotationTitle.trim() || null,
        body: annotationBody.trim(),
        locale: annotationLocale.trim() || "en",
        author: "catalog-ui",
        origin: "user",
      });
      replaceAnnotation(created);
      setAnnotationTitle("");
      setAnnotationBody("");
    } catch (error: unknown) {
      setInterpretationError(
        error instanceof Error ? error.message : "Failed to create reader annotation",
      );
    } finally {
      setAnnotationBusy(null);
    }
  };

  const handleUpdateAnnotation = async (annotation: SkillAnnotation) => {
    if (!editingAnnotation || !editingAnnotation.body.trim()) return;
    setAnnotationBusy(annotation.id);
    setInterpretationError(null);
    try {
      const updated = await updateSkillAnnotationApi(annotation.id, {
        lineage_id: annotation.lineage_id,
        expected_version: annotation.version,
        author: "catalog-ui",
        patch: {
          kind: editingAnnotation.kind,
          title: editingAnnotation.title.trim() || null,
          body: editingAnnotation.body.trim(),
          locale: editingAnnotation.locale.trim() || "en",
        },
      });
      replaceAnnotation(updated);
      setEditingAnnotation(null);
    } catch (error: unknown) {
      setInterpretationError(
        error instanceof Error ? error.message : "Failed to update reader annotation",
      );
    } finally {
      setAnnotationBusy(null);
    }
  };

  const handleDeleteAnnotation = async (annotation: SkillAnnotation) => {
    if (!window.confirm(`Move annotation '${annotation.title || annotation.kind}' to deleted items?`)) {
      return;
    }
    setAnnotationBusy(annotation.id);
    setInterpretationError(null);
    try {
      const deleted = await deleteSkillAnnotationApi(annotation.id, {
        lineage_id: annotation.lineage_id,
        expected_version: annotation.version,
        author: "catalog-ui",
      });
      replaceAnnotation(deleted);
      if (editingAnnotation?.id === annotation.id) setEditingAnnotation(null);
    } catch (error: unknown) {
      setInterpretationError(
        error instanceof Error ? error.message : "Failed to delete reader annotation",
      );
    } finally {
      setAnnotationBusy(null);
    }
  };

  const handleRestoreAnnotation = async (annotation: SkillAnnotation) => {
    setAnnotationBusy(annotation.id);
    setInterpretationError(null);
    try {
      const restored = await restoreSkillAnnotationApi(annotation.id, {
        lineage_id: annotation.lineage_id,
        expected_version: annotation.version,
        author: "catalog-ui",
      });
      replaceAnnotation(restored);
    } catch (error: unknown) {
      setInterpretationError(
        error instanceof Error ? error.message : "Failed to restore reader annotation",
      );
    } finally {
      setAnnotationBusy(null);
    }
  };

  const handleRunAnalysis = async () => {
    const revisionId = selected?.latest_skill?.source_revision_id;
    if (!selected || !revisionId) return;
    setAnalysisRunning(true);
    setInterpretationError(null);
    try {
      const analysis = await runSkillAnalysisApi(selected.lineage.id, {
        source_revision_id: revisionId,
      });
      setAnalyses((current) => [analysis, ...current.filter((item) => item.id !== analysis.id)]);
    } catch (error: unknown) {
      setInterpretationError(
        error instanceof Error ? error.message : "Failed to run static skill analysis",
      );
    } finally {
      setAnalysisRunning(false);
    }
  };

  const renderDetailPanel = () => {
    if (!selected) return null;
    return (
      <div className="skill-detail-panel">
        <form
          className="skill-detail inline-profile-form"
          onSubmit={(event) => {
            event.preventDefault();
            onSave(selected.lineage.id, {
              purpose: purpose.trim() || null,
              use_when: useWhen
                .split(",")
                .map((item) => item.trim())
                .filter(Boolean),
              review_state: reviewState,
              invocation_mode: invocationMode,
            });
          }}
        >
          <div className="skill-detail-heading">
            <div>
              <p className="section-label">Immutable skill</p>
              <div className="skill-heading-row">
                <h2>{selected.profile.title || selected.lineage.skill_name}</h2>
                <InvocationBadge mode={selected.profile.invocation_mode} showTooltip={true} />
                <ProviderBadge providerId={providerId} showDeliveryPath={false} showTooltip={true} />
              </div>
              <p>
                {selected.latest_skill?.description ??
                  "No description is available for the latest revision."}
              </p>
            </div>
            <span className={`review-decision ${reviewState}`}>{reviewState}</span>
          </div>

          <dl className="skill-facts">
            <div>
              <dt>Lineage</dt>
              <dd>{selected.lineage.id}</dd>
            </div>
            <div>
              <dt>Latest revision</dt>
              <dd>{selected.latest_skill?.source_revision_id.slice(0, 12) ?? "Unavailable"}</dd>
            </div>
            <div>
              <dt>Invoker</dt>
              <dd>{invocationMode.replaceAll("_", " ")}</dd>
            </div>
            <div>
              <dt>Risk</dt>
              <dd>{selected.profile.risk_level || "low"}</dd>
            </div>
            <div className="skill-fact-full">
              <dt>Active Delivery Binding</dt>
              <dd>
                <DeliveryPathIndicator
                  providerId={providerId}
                  skillName={selected.lineage.skill_name}
                  showTooltip={true}
                />
              </dd>
            </div>
          </dl>

          <label className="template-field">
            Purpose
            <textarea
              value={purpose}
              onChange={(event) => setPurpose(event.target.value)}
              placeholder="What this skill is intended to accomplish"
            />
          </label>

          <label className="template-field">
            Use when
            <input
              value={useWhen}
              onChange={(event) => setUseWhen(event.target.value)}
              placeholder="Before implementation, during review"
            />
            <small>Separate conditions with commas.</small>
          </label>

          <div className="form-row-dual">
            <label className="template-field">
              Invocation mode
              <select
                value={invocationMode}
                onChange={(event) => setInvocationMode(event.target.value as typeof invocationMode)}
              >
                <option value="model_invoked">🤖 Model-invoked (Agent Reflex - Autonomous)</option>
                <option value="user_invoked">👤 User-invoked (Explicit Command - Human Steered)</option>
                <option value="hybrid">🔀 Hybrid (Both Model Reflex & User Command)</option>
                <option value="unspecified">⚙️ Unspecified (Legacy Classification)</option>
              </select>
            </label>

            <label className="template-field">
              Review state
              <select
                value={reviewState}
                onChange={(event) => setReviewState(event.target.value as typeof reviewState)}
              >
                <option value="unreviewed">Unreviewed</option>
                <option value="reviewed">Reviewed</option>
                <option value="deprecated">Deprecated</option>
              </select>
            </label>
          </div>

          <button className="primary-action skill-save" type="submit" disabled={saving}>
            {saving ? <LoaderCircle size={20} className="spin" /> : <Check size={20} />}
            {saving ? "Saving skill…" : "Save skill profile"}
          </button>
        </form>

        {/* Real-time Telemetry & Invocation Mode Ratio Visualizer */}
        <section className="skill-telemetry-analytics" aria-label="Real-time skill telemetry">
          <div className="skill-feedback-heading">
            <div>
              <div className="feedback-title-row">
                <Activity size={16} className="mint live-pulse-icon" />
                <p className="section-label">Real-Time Telemetry & Health Analytics</p>
              </div>
              <strong>
                {telemetrySummary.total_invocations} Invocations ·{" "}
                {formatDuration(telemetrySummary.average_duration_ms)} avg latency
              </strong>
              <small>
                {Math.round(telemetrySummary.success_rate * 100)}% success rate across active
                multi-agent hooks
              </small>
            </div>
            <div className="telemetry-health-pills">
              <span className="health-pill healthy" title="Healthy invocations">
                🟢 {telemetrySummary.by_health.healthy} healthy
              </span>
              {telemetrySummary.by_health.needs_review > 0 && (
                <span className="health-pill needs-review" title="Invocations needing review">
                  🟡 {telemetrySummary.by_health.needs_review} review
                </span>
              )}
            </div>
          </div>

          {/* Key Metric Gauges Strip */}
          <div className="telemetry-metrics-strip">
            <div className="telemetry-metric-box">
              <span className="metric-box-label">Invocations</span>
              <strong className="metric-box-val">{telemetrySummary.total_invocations}</strong>
              <small className="metric-box-sub">Agent tool runs</small>
            </div>
            <div className="telemetry-metric-box">
              <span className="metric-box-label">Avg Latency</span>
              <strong className="metric-box-val mint">
                {formatDuration(telemetrySummary.average_duration_ms)}
              </strong>
              <small className="metric-box-sub">&lt; 50ms invariant</small>
            </div>
            <div className="telemetry-metric-box">
              <span className="metric-box-label">Success Rate</span>
              <strong className="metric-box-val">
                {Math.round(telemetrySummary.success_rate * 100)}%
              </strong>
              <small className="metric-box-sub">Pass ratio</small>
            </div>
            <div className="telemetry-metric-box">
              <span className="metric-box-label">Active Providers</span>
              <strong className="metric-box-val">
                {Object.keys(telemetrySummary.by_provider).length || 1}
              </strong>
              <small className="metric-box-sub">Multi-agent</small>
            </div>
          </div>

          {/* Invocation Mode Ratio Visualizer */}
          <InvocationModeRatioVisualizer
            ratios={telemetrySummary.invocation_mode_ratios}
            byMode={telemetrySummary.by_mode}
          />

          {/* Recent Activity Timeline */}
          <TelemetryActivityTimeline
            events={telemetrySummary.recent_events}
            skillName={selected.profile.title || selected.lineage.skill_name}
          />
        </section>

        {/* Feedback Health History & Evidence Analytics */}
        <section className="skill-feedback">
          <div className="skill-feedback-heading">
            <div>
              <div className="feedback-title-row">
                <Activity size={16} className="mint" />
                <p className="section-label">Feedback Health & Evidence</p>
              </div>
              <strong>
                {loadingEvidence
                  ? "Loading evidence…"
                  : feedbackSummary?.health.replaceAll("_", " ") ?? "Unknown"}
              </strong>
              <small>
                {feedbackSummary
                  ? `${feedbackSummary.total_feedback} records${
                      feedbackSummary.success_rate === null
                        ? ""
                        : ` · ${Math.round(feedbackSummary.success_rate * 100)}% success rate`
                    }`
                  : "No feedback recorded"}
              </small>
            </div>
            <span className={`review-decision ${feedbackSummary?.health ?? "unknown"}`}>
              {feedbackSummary?.health ?? "unknown"}
            </span>
          </div>

          {/* Success Rate Progress Bar */}
          {feedbackSummary && feedbackSummary.success_rate !== null && (
            <div className="feedback-success-bar-container">
              <div className="feedback-bar-track">
                <div
                  className="feedback-bar-fill"
                  style={{ width: `${Math.round(feedbackSummary.success_rate * 100)}%` }}
                />
              </div>
            </div>
          )}

          <form
            className="feedback-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (!feedbackText.trim()) return;
              onRecordFeedback(selected.lineage.id, {
                outcome: feedbackOutcome,
                evidence_type: feedbackEvidence,
                summary: feedbackText.trim(),
              });
              setFeedbackText("");
            }}
          >
            <label className="template-field">
              Outcome
              <select
                value={feedbackOutcome}
                onChange={(event) => setFeedbackOutcome(event.target.value)}
              >
                <option value="success">✅ Success</option>
                <option value="correction">🔄 Correction</option>
                <option value="scope_mismatch">⚠️ Scope mismatch</option>
                <option value="freshness">⏳ Freshness issue</option>
                <option value="risk">🚨 Risk event</option>
                <option value="neutral">⚖️ Neutral</option>
              </select>
            </label>
            <label className="template-field">
              Evidence
              <select
                value={feedbackEvidence}
                onChange={(event) => setFeedbackEvidence(event.target.value)}
              >
                <option value="manual">Manual audit</option>
                <option value="evaluation">Evaluation suite</option>
                <option value="activation_report">Activation report</option>
                <option value="user_feedback">User feedback</option>
                <option value="incident">Incident log</option>
              </select>
            </label>
            <label className="template-field feedback-summary-field">
              Summary
              <input
                value={feedbackText}
                onChange={(event) => setFeedbackText(event.target.value)}
                placeholder="Observed behavior or invariant violation to retain..."
              />
            </label>
            <button
              className="quiet-action feedback-save"
              type="submit"
              disabled={recordingFeedback || !feedbackText.trim()}
            >
              {recordingFeedback ? (
                <LoaderCircle size={16} className="spin" />
              ) : (
                <Check size={16} />
              )}
              {recordingFeedback ? "Recording…" : "Record feedback"}
            </button>
          </form>

          {feedback.length ? (
            <div className="feedback-history">
              {feedback.slice(0, 4).map((item) => (
                <div key={item.id} className={`feedback-item-card ${item.outcome}`}>
                  <div className="feedback-item-header">
                    <span className={`outcome-pill ${item.outcome}`}>
                      {item.outcome === "success" && <CheckCircle2 size={12} />}
                      {item.outcome === "risk" && <AlertTriangle size={12} />}
                      {item.outcome === "correction" && <TrendingUp size={12} />}
                      {item.outcome === "scope_mismatch" && <AlertTriangle size={12} />}
                      {item.outcome.replaceAll("_", " ")}
                    </span>
                    <small className="evidence-type-tag">
                      {item.evidence_type.replaceAll("_", " ")}
                    </small>
                  </div>
                  <p className="feedback-item-summary">{item.summary}</p>
                </div>
              ))}
            </div>
          ) : null}
        </section>

        {/* Evaluation Stats */}
        <section className="skill-evaluation">
          <div className="evaluation-heading-row">
            <TrendingUp size={16} className="mint" />
            <p className="section-label">Latest Revision Evaluation</p>
          </div>
          <strong>
            {loadingEvidence
              ? "Loading evaluation…"
              : evaluationSummary
                ? `${evaluationSummary.evaluated_active_case_count}/${evaluationSummary.active_case_count} active cases evaluated`
                : "No evaluation suite data"}
          </strong>
          <div className="evaluation-status-row">
            <small>
              {evaluationSummary?.pass_rate === null || evaluationSummary?.pass_rate === undefined
                ? "No completed run"
                : `${Math.round(evaluationSummary.pass_rate * 100)}% pass rate`}
            </small>
            {evaluationSummary?.latest_outcome && (
              <span className={`evaluation-outcome-badge ${evaluationSummary.latest_outcome}`}>
                {evaluationSummary.latest_outcome === "passed" ? (
                  <CheckCircle2 size={12} />
                ) : (
                  <XCircle size={12} />
                )}
                {evaluationSummary.latest_outcome}
              </span>
            )}
          </div>
        </section>

        {/* Reader-only annotations: isolated from prompts and runtime skill behavior. */}
        <section className="skill-notes reader-annotations" aria-label="Non-executing skill explanations">
          <div className="skill-feedback-heading">
            <div>
              <div className="feedback-title-row">
                <BookOpen size={16} className="mint" />
                <p className="section-label">Reader annotations</p>
              </div>
              <strong>{activeAnnotations.length} plain-language explanations</strong>
              <small>
                Stored separately for human understanding. Never injected into prompts, activation,
                priority, or skill files.
              </small>
            </div>
            <span
              className="review-decision reviewed"
              title="This metadata cannot affect skill execution"
              data-execution-effect="none"
            >
              execution_effect = none
            </span>
          </div>

          {interpretationError ? (
            <div className="review-empty" role="alert" style={{ marginBottom: "0.75rem" }}>
              <AlertTriangle size={18} className="review-icon" />
              <span>{interpretationError}</span>
            </div>
          ) : null}

          <form
            className="note-form reader-annotation-form"
            style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}
            onSubmit={(event) => {
              event.preventDefault();
              void handleCreateAnnotation();
            }}
          >
            <label className="template-field">
              Explanation type
              <select
                value={annotationKind}
                onChange={(event) => setAnnotationKind(event.target.value as SkillAnnotationKind)}
              >
                <option value="plain_language">Plain language</option>
                <option value="rationale">Rationale</option>
                <option value="example">Example</option>
                <option value="warning">Reader warning</option>
                <option value="glossary">Glossary</option>
              </select>
            </label>
            <label className="template-field">
              Title
              <input
                value={annotationTitle}
                onChange={(event) => setAnnotationTitle(event.target.value)}
                placeholder="What this explanation covers"
              />
            </label>
            <label className="template-field note-body-field" style={{ gridColumn: "1 / -1" }}>
              Reader explanation
              <textarea
                value={annotationBody}
                onChange={(event) => setAnnotationBody(event.target.value)}
                placeholder="Explain the skill in language that is easier for people to understand..."
                rows={3}
                style={{
                  width: "100%",
                  minWidth: 0,
                  minHeight: "82px",
                  padding: "9px",
                  boxSizing: "border-box",
                  color: "#f4f7fb",
                  background: "#101920",
                  border: "1px solid #40505e",
                  font: "inherit",
                  resize: "vertical",
                }}
              />
            </label>
            <label className="template-field">
              Locale
              <input
                value={annotationLocale}
                onChange={(event) => setAnnotationLocale(event.target.value)}
                placeholder="ko-KR"
              />
            </label>
            <button
              className="quiet-action feedback-save"
              type="submit"
              style={{ gridColumn: "1 / -1" }}
              disabled={annotationBusy === "create" || !annotationBody.trim()}
            >
              {annotationBusy === "create" ? (
                <LoaderCircle size={16} className="spin" />
              ) : (
                <BookOpen size={16} />
              )}
              {annotationBusy === "create" ? "Saving…" : "Add reader annotation"}
            </button>
          </form>

          {loadingInterpretation ? (
            <div className="review-empty">
              <LoaderCircle size={18} className="spin" />
              <span>Loading annotations and static analysis…</span>
            </div>
          ) : activeAnnotations.length ? (
            <div className="feedback-history note-history">
              {activeAnnotations.map((annotation) => (
                <div
                  key={annotation.id}
                  className="feedback-item-card"
                  data-execution-effect={annotation.execution_effect}
                >
                  {editingAnnotation?.id === annotation.id ? (
                    <form
                      className="note-form"
                      style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}
                      onSubmit={(event) => {
                        event.preventDefault();
                        void handleUpdateAnnotation(annotation);
                      }}
                    >
                      <div className="form-row-dual" style={{ gridColumn: "1 / -1" }}>
                        <label className="template-field">
                          Type
                          <select
                            value={editingAnnotation.kind}
                            onChange={(event) =>
                              setEditingAnnotation({
                                ...editingAnnotation,
                                kind: event.target.value as SkillAnnotationKind,
                              })
                            }
                          >
                            <option value="plain_language">Plain language</option>
                            <option value="rationale">Rationale</option>
                            <option value="example">Example</option>
                            <option value="warning">Reader warning</option>
                            <option value="glossary">Glossary</option>
                          </select>
                        </label>
                        <label className="template-field">
                          Locale
                          <input
                            value={editingAnnotation.locale}
                            onChange={(event) =>
                              setEditingAnnotation({ ...editingAnnotation, locale: event.target.value })
                            }
                          />
                        </label>
                      </div>
                      <label className="template-field" style={{ gridColumn: "1 / -1" }}>
                        Title
                        <input
                          value={editingAnnotation.title}
                          onChange={(event) =>
                            setEditingAnnotation({ ...editingAnnotation, title: event.target.value })
                          }
                        />
                      </label>
                      <label className="template-field" style={{ gridColumn: "1 / -1" }}>
                        Explanation
                        <textarea
                          rows={4}
                          value={editingAnnotation.body}
                          onChange={(event) =>
                            setEditingAnnotation({ ...editingAnnotation, body: event.target.value })
                          }
                          style={{
                            width: "100%",
                            minHeight: "96px",
                            padding: "9px",
                            boxSizing: "border-box",
                            color: "#f4f7fb",
                            background: "#101920",
                            border: "1px solid #40505e",
                            font: "inherit",
                            resize: "vertical",
                          }}
                        />
                      </label>
                      <div
                        style={{
                          display: "flex",
                          gap: "0.5rem",
                          marginTop: "0.5rem",
                          gridColumn: "1 / -1",
                        }}
                      >
                        <button
                          className="quiet-action"
                          type="submit"
                          disabled={annotationBusy === annotation.id || !editingAnnotation.body.trim()}
                        >
                          {annotationBusy === annotation.id ? (
                            <LoaderCircle size={14} className="spin" />
                          ) : (
                            <Check size={14} />
                          )}
                          Save explanation
                        </button>
                        <button
                          className="quiet-action"
                          type="button"
                          onClick={() => setEditingAnnotation(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  ) : (
                    <>
                      <div className="feedback-item-header">
                        <span>{annotation.kind.replaceAll("_", " ")}</span>
                        <small>
                          {annotation.locale} · v{annotation.version} · execution effect none
                        </small>
                      </div>
                      {annotation.title ? <strong>{annotation.title}</strong> : null}
                      <p>{annotation.body}</p>
                      {annotation.anchor ? (
                        <small>
                          {annotation.anchor.relative_manifest_path}:{annotation.anchor.start_line}-
                          {annotation.anchor.end_line}
                        </small>
                      ) : null}
                      <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
                        <button
                          className="quiet-action"
                          type="button"
                          onClick={() =>
                            setEditingAnnotation({
                              id: annotation.id,
                              kind: annotation.kind,
                              title: annotation.title ?? "",
                              body: annotation.body,
                              locale: annotation.locale,
                            })
                          }
                        >
                          <Edit3 size={13} /> Edit
                        </button>
                        <button
                          className="quiet-action"
                          type="button"
                          disabled={annotationBusy === annotation.id}
                          onClick={() => void handleDeleteAnnotation(annotation)}
                        >
                          <Trash2 size={13} /> Delete
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="review-empty">
              <BookOpen size={18} className="review-icon" />
              <span>No reader annotations yet. They remain separate from execution-aware notes.</span>
            </div>
          )}

          {deletedAnnotations.length ? (
            <details style={{ marginTop: "0.75rem" }}>
              <summary>Deleted annotations ({deletedAnnotations.length})</summary>
              <div className="feedback-history note-history">
                {deletedAnnotations.map((annotation) => (
                  <div key={annotation.id} className="feedback-item-card" data-execution-effect="none">
                    <span>{annotation.title || annotation.kind.replaceAll("_", " ")}</span>
                    <p>{annotation.body}</p>
                    <button
                      className="quiet-action"
                      type="button"
                      disabled={annotationBusy === annotation.id}
                      onClick={() => void handleRestoreAnnotation(annotation)}
                    >
                      <Undo2 size={13} /> Restore
                    </button>
                  </div>
                ))}
              </div>
            </details>
          ) : null}
        </section>

        <section
          className="skill-evaluation static-skill-analysis authoring-readiness"
          aria-label="Skill authoring readiness"
        >
          <div className="skill-feedback-heading">
            <div>
              <div className="feedback-title-row">
                <BarChart2 size={16} className="mint" />
                <p className="section-label">Authoring readiness</p>
              </div>
              <strong>
                {latestAnalysis
                  ? `${latestAnalysis.readability.line_count} lines · ${latestAnalysis.readability.section_count} sections`
                  : "No immutable revision analysis yet"}
              </strong>
              <small>
                Revision-pinned guidance for writing and packaging. Readiness is independent from
                review state, activation, and provider enablement.
              </small>
            </div>
            <div className="authoring-heading-actions">
              <span className="execution-effect-badge" data-execution-effect="none">
                execution effect = none
              </span>
              <button
                className="quiet-action"
                type="button"
                onClick={() => void handleRunAnalysis()}
                disabled={analysisRunning || !selected.latest_skill?.source_revision_id}
                title={
                  selected.latest_skill?.source_revision_id
                    ? "Analyze the current immutable revision without modifying it"
                    : "A source revision is required"
                }
              >
                {analysisRunning ? (
                  <LoaderCircle size={15} className="spin" />
                ) : (
                  <RefreshCw size={15} />
                )}
                {analysisRunning ? "Analyzing…" : "Analyze readiness"}
              </button>
            </div>
          </div>

          <div className="authoring-separation-note">
            <Shield size={15} />
            <span>
              A blocked authoring result is a validation finding, not a disabled skill. No source,
              prompt, activation setting, or review decision is changed here.
            </span>
          </div>

          <div className="authoring-platform-grid" role="tablist" aria-label="Authoring platform">
            {AUTHORING_PLATFORMS.map((platform) => {
              const result = authoringResults[platform.id];
              const status = resolvedAuthoringStatus(result);
              const stale = Boolean(latestAnalysis?.stale || latestAnalysis?.outdated);
              return (
                <button
                  type="button"
                  role="tab"
                  aria-selected={authoringPlatform === platform.id}
                  className={`authoring-platform-card ${authoringPlatform === platform.id ? "selected" : ""}`}
                  key={platform.id}
                  onClick={() => setAuthoringPlatform(platform.id)}
                >
                  <span className="authoring-platform-name">
                    {platform.id === "codex" ? <Bot size={15} /> : <Layers size={15} />}
                    {platform.label}
                  </span>
                  <strong className={`authoring-status ${stale ? "unknown" : authoringStatusClass(status)}`}>
                    {stale && status ? "Outdated" : authoringStatusLabel(status)}
                  </strong>
                  <small>
                    {result
                      ? `${result.summary.error_count} errors · ${result.summary.warning_count} warnings`
                      : "No provider result"}
                  </small>
                </button>
              );
            })}
          </div>

          <div className="authoring-ruleset-strip">
            <div>
              <span>Selected platform</span>
              <strong>{authoringPlatform === "codex" ? "Codex" : "Antigravity"}</strong>
            </div>
            <div>
              <span>Ruleset</span>
              <strong>{activeRulesetIdentity?.id ?? "Not inspected"}</strong>
            </div>
            <div>
              <span>Version</span>
              <strong>{activeRulesetIdentity?.version ?? "Unknown"}</strong>
            </div>
            <div className="authoring-ruleset-source">
              <span>Source</span>
              {activeRulesetIdentity?.source?.startsWith("https://") ? (
                <a
                  href={activeRulesetIdentity.source}
                  target="_blank"
                  rel="noreferrer"
                  title={activeRulesetIdentity.source}
                >
                  Official specification ↗
                </a>
              ) : (
                <strong>Unavailable</strong>
              )}
            </div>
          </div>

          {activeRuleset ? (
            <details className="authoring-ruleset-contract">
              <summary>Ruleset discovery and package conventions</summary>
              <dl className="authoring-metadata-grid">
                <div>
                  <dt>Required frontmatter</dt>
                  <dd>{activeRuleset.required_frontmatter.join(", ") || "None"}</dd>
                </div>
                <div>
                  <dt>Optional directories</dt>
                  <dd>{activeRuleset.optional_directories.join(", ") || "None"}</dd>
                </div>
                <div>
                  <dt>Project discovery roots</dt>
                  <dd>{activeRuleset.project_discovery_roots.join(", ") || "None"}</dd>
                </div>
                <div>
                  <dt>Global discovery roots</dt>
                  <dd>{activeRuleset.global_discovery_roots.join(", ") || "None"}</dd>
                </div>
                <div>
                  <dt>Provider extensions</dt>
                  <dd>{activeRuleset.provider_extensions.join(", ") || "None"}</dd>
                </div>
              </dl>
            </details>
          ) : null}

          {rulesetsAvailable === false && rulesetsMessage ? (
            <div className="authoring-unavailable" role="status">
              <AlertTriangle size={14} />
              <span>{rulesetsMessage} No platform is reported as ready from demo data.</span>
            </div>
          ) : null}

          {latestAnalysis ? (
            <div data-execution-effect={latestAnalysis.execution_effect}>
              <div className="telemetry-metrics-strip">
                <div className="telemetry-metric-box">
                  <span className="metric-box-label">Instructions</span>
                  <strong className="metric-box-val">
                    {latestAnalysis.readability.instruction_line_count}
                  </strong>
                  <small className="metric-box-sub">instruction lines</small>
                </div>
                <div className="telemetry-metric-box">
                  <span className="metric-box-label">Code blocks</span>
                  <strong className="metric-box-val">
                    {latestAnalysis.readability.fenced_code_block_count}
                  </strong>
                  <small className="metric-box-sub">fenced examples</small>
                </div>
                <div className="telemetry-metric-box">
                  <span className="metric-box-label">References</span>
                  <strong className="metric-box-val">
                    {latestAnalysis.references.markdown_link_count}
                  </strong>
                  <small className="metric-box-sub">Markdown links</small>
                </div>
                <div className="telemetry-metric-box">
                  <span className="metric-box-label">Support files</span>
                  <strong className="metric-box-val">{latestAnalysis.support_files.total}</strong>
                  <small className="metric-box-sub">
                    {latestAnalysis.support_files.executable_like.length} executable-like
                  </small>
                </div>
              </div>
              <div className="evaluation-status-row">
                <small>
                  Revision {latestAnalysis.source_revision_id.slice(0, 12)} · structure analyzer {latestAnalysis.analyzer.id} {latestAnalysis.analyzer.version}
                </small>
                <span
                  className={`evaluation-outcome-badge ${latestAnalysis.stale || latestAnalysis.outdated ? "failed" : "passed"}`}
                >
                  {latestAnalysis.stale || latestAnalysis.outdated ? "outdated" : "current"} · no execution effect
                </span>
              </div>

              {commonAuthoringFindings.length ? (
                <AuthoringFindingList title="Common findings" findings={commonAuthoringFindings} />
              ) : null}

              {activeAuthoringResult ? (
                <>
                  <AuthoringFindingList
                    title={`${activeAuthoringResult.platform === "codex" ? "Codex" : "Antigravity"}-specific findings`}
                    findings={platformAuthoringFindings}
                  />
                  {commonAuthoringFindings.length === 0 && platformAuthoringFindings.length === 0 ? (
                    <div className="authoring-empty-state">
                      <CheckCircle2 size={16} />
                      <span>No authoring findings were reported for this platform.</span>
                    </div>
                  ) : null}
                  <ProviderAuthoringMetadata result={activeAuthoringResult} />
                  {Object.keys(activeAuthoringResult.observations).length ? (
                    <details className="authoring-observations">
                      <summary>Analyzer observations ({Object.keys(activeAuthoringResult.observations).length})</summary>
                      <dl className="authoring-metadata-grid">
                        {Object.entries(activeAuthoringResult.observations).map(([key, value]) => (
                          <div key={key}>
                            <dt>{key.replaceAll("_", " ")}</dt>
                            <dd>{observationLabel(value)}</dd>
                          </div>
                        ))}
                      </dl>
                    </details>
                  ) : null}
                </>
              ) : (
                <div className="authoring-empty-state unknown">
                  <AlertTriangle size={16} />
                  <span>
                    No {authoringPlatform === "codex" ? "Codex" : "Antigravity"} result is attached
                    to this immutable analysis. Run readiness analysis with a configured Catalog API.
                  </span>
                </div>
              )}

              {latestAnalysis.warnings.length ? (
                <details className="legacy-analysis-warnings">
                  <summary>Legacy structure warnings ({latestAnalysis.warnings.length})</summary>
                  <div className="feedback-history">
                    {latestAnalysis.warnings.map((warning, index) => (
                      <div key={`${latestAnalysis.id}-warning-${index}`} className="feedback-item-card risk">
                        <div className="feedback-item-header">
                          <span className="outcome-pill risk">
                            <AlertTriangle size={12} /> Structure warning
                          </span>
                        </div>
                        <p className="feedback-item-summary">{warning}</p>
                      </div>
                    ))}
                  </div>
                </details>
              ) : null}
              {latestAnalysis.sections.length ? (
                <details className="authoring-observations">
                  <summary>Detected section outline ({latestAnalysis.sections.length})</summary>
                  <ol>
                    {latestAnalysis.sections.map((section, index) => (
                      <li key={`${section.line}-${index}`}>
                        line {section.line}: {section.title}
                      </li>
                    ))}
                  </ol>
                </details>
              ) : null}
            </div>
          ) : (
            <div className="authoring-empty-state unknown">
              <AlertTriangle size={16} />
              <span>Analyze the latest immutable revision to inspect provider-specific authoring readiness.</span>
            </div>
          )}
        </section>

        {/* Execution-aware Usage Notes with Prompt Injection Toggles */}
        <section className="skill-notes">
          <div className="skill-feedback-heading">
            <div>
              <p className="section-label">Execution-aware usage notes</p>
              <strong>{notes.length} active notes</strong>
              <small>
                Separate from reader annotations. Notes marked below may be included in the system
                prompt and can influence runtime guidance.
              </small>
            </div>
          </div>
          <form
            className="note-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (!noteText.trim()) return;
              onAddNote(selected.lineage.id, {
                kind: noteKind,
                body: noteText.trim(),
                inject_into_prompt: injectNote,
              });
              setNoteText("");
              setInjectNote(false);
            }}
          >
            <label className="template-field">
              Kind
              <select value={noteKind} onChange={(event) => setNoteKind(event.target.value)}>
                <option value="usage">Usage</option>
                <option value="caveat">Caveat</option>
                <option value="dependency">Dependency</option>
                <option value="migration">Migration</option>
                <option value="review">Review</option>
              </select>
            </label>
            <label className="template-field note-body-field">
              Note
              <input
                value={noteText}
                onChange={(event) => setNoteText(event.target.value)}
                placeholder="Guidance that should accompany this skill"
              />
            </label>
            <label className="note-inject">
              <input
                type="checkbox"
                checked={injectNote}
                onChange={(event) => setInjectNote(event.target.checked)}
              />{" "}
              Include in system prompt
            </label>
            <button
              className="quiet-action feedback-save"
              type="submit"
              disabled={recordingNote || !noteText.trim()}
            >
              {recordingNote ? <LoaderCircle size={16} className="spin" /> : <Check size={16} />}
              {recordingNote ? "Saving…" : "Add note"}
            </button>
          </form>
          {notes.length ? (
            <div className="feedback-history note-history">
              {notes.slice(0, 3).map((note) => (
                <div key={note.id}>
                  <span>{note.kind}</span>
                  <p>{note.body}</p>
                  <small>{note.inject_into_prompt ? "Prompt enabled" : "Catalog only"}</small>
                </div>
              ))}
            </div>
          ) : null}
        </section>
      </div>
    );
  };

  return (
    <section className="skills-workspace">
      <header className="template-header skills-header">
        <div>
          <h1>Skills</h1>
          <p>
            Manage immutable revisions, intended use, and review state. Templates only compose these
            managed skills.
          </p>
        </div>
        <div className="skills-header-badges">
          <ProviderBadge providerId={providerId} showDeliveryPath={true} showTooltip={true} />
        </div>
      </header>

      {/* Modern FilterToolbar */}
      <FilterToolbar
        invocationMode={invocationFilter}
        onInvocationModeChange={setInvocationFilter}
        providerFilter={providerFilter}
        onProviderFilterChange={setProviderFilter}
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        totalCount={skills.length}
        filteredCount={visible.length}
        entityName="skills"
        showInvocationChips={true}
        showProviderFilter={true}
        showViewToggle={true}
        searchPlaceholder="Search skills by name, tags, description, or delivery path..."
      />

      {skills.length === 0 ? (
        <div className="review-empty">
          <AlertTriangle size={22} className="review-icon" />
          <span>No managed skill is registered yet.</span>
        </div>
      ) : visible.length === 0 ? (
        <div className="review-empty">
          <AlertTriangle size={22} className="review-icon" />
          <span>No skills match the selected filters. Try clearing search or filter chips.</span>
        </div>
      ) : viewMode === "grid" ? (
        <div className="skills-grid-view-layout">
          <SkillCardGrid
            skills={visible}
            selectedLineageId={selected?.lineage.id ?? null}
            onSelect={onSelect}
            providerId={providerId}
          />
          {selected ? (
            <div className="skill-grid-detail-container">
              <div className="grid-detail-header">
                <Edit3 size={18} className="mint" />
                <h3>Configuring Skill: {selected.profile.title || selected.lineage.skill_name}</h3>
              </div>
              {renderDetailPanel()}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="skills-manager-layout">
          <div className="managed-skill-list" aria-label="Managed skills">
            {visible.map((skill) => {
              const mode =
                skill.profile.invocation_mode ??
                skill.latest_skill?.invocation_mode ??
                skill.lineage.invocation_mode;
              return (
                <button
                  type="button"
                  key={skill.lineage.id}
                  className={
                    skill.lineage.id === selected?.lineage.id
                      ? "managed-skill selected"
                      : "managed-skill"
                  }
                  onClick={() => onSelect(skill.lineage.id)}
                >
                  <span
                    className={
                      skill.profile.review_state === "reviewed"
                        ? "skill-health reviewed"
                        : "skill-health"
                    }
                  />
                  <span>
                    <span className="managed-skill-title-row">
                      <strong>{skill.profile.title || skill.lineage.skill_name}</strong>
                      <InvocationBadge mode={mode} showTooltip={true} size="sm" />
                    </span>
                    <small>
                      {skill.latest_skill?.description ?? "No current revision description"}
                    </small>
                  </span>
                  <em>{skill.profile.review_state.replaceAll("_", " ")}</em>
                </button>
              );
            })}
          </div>
          {renderDetailPanel()}
        </div>
      )}
    </section>
  );
}
