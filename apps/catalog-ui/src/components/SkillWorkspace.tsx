import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart2,
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
  TrendingUp,
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
  createMockTelemetrySummary,
  fetchTelemetrySummary,
  formatDuration,
} from "../api/catalog-api";
import type {
  CatalogSkill,
  EvaluationSummary,
  FeedbackSummary,
  InvocationMode,
  InvocationModeDistribution,
  InvocationModeRatio,
  SkillFeedback,
  SkillNote,
  TelemetryEvent,
  TelemetrySummary,
} from "../types";

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

        {/* Usage Notes with Prompt Injection Toggles */}
        <section className="skill-notes">
          <div className="skill-feedback-heading">
            <div>
              <p className="section-label">Usage notes</p>
              <strong>{notes.length} active notes</strong>
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
