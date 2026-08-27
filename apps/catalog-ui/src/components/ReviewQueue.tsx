import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
  CircleCheck,
  Clock,
  Database,
  Filter,
  Flame,
  Radio,
  RefreshCw,
  Shield,
  Sparkles,
  TrendingUp,
  Zap,
} from "lucide-react";
import { InvocationBadge, ProviderBadge } from "../visual-identity";
import {
  createMockTelemetrySummary,
  fetchTelemetrySummary,
  formatDuration,
} from "../api/catalog-api";
import type {
  ReviewItem,
  SourceAdoptionCandidate,
  TelemetryEvent,
  TelemetrySummary,
} from "../types";

export const demoReviewQueue: ReviewItem[] = [
  {
    lineage: { id: "lineage_testing", skill_name: "Testing" },
    severity: "medium",
    latest_source_revision_id: "revision_demo",
    reasons: [
      {
        code: "unevaluated_current_revision",
        severity: "medium",
        detail: "The latest source revision has no recorded active-case evaluation.",
      },
    ],
  },
  {
    lineage: { id: "lineage_ui", skill_name: "UI Design" },
    severity: "low",
    latest_source_revision_id: "revision_demo",
    reasons: [
      {
        code: "unreviewed_profile",
        severity: "medium",
        detail: "The skill profile has not been reviewed.",
      },
    ],
  },
];

export function TelemetryRiskActivityFeed({
  events,
  title = "Live Telemetry Risk & Execution Signals",
}: {
  events: TelemetryEvent[];
  title?: string;
}) {
  const [filterMode, setFilterMode] = useState<"all" | "risk" | "correction" | "success">("all");
  const [providerFilter, setProviderFilter] = useState("all");

  const riskEvents = useMemo(
    () =>
      events.filter((e) =>
        ["risk", "correction", "scope_mismatch", "freshness"].includes(e.outcome),
      ),
    [events],
  );

  const anomalyEvents = useMemo(
    () =>
      events.filter(
        (e) =>
          e.outcome === "risk" ||
          e.outcome === "correction" ||
          e.duration_ms > 150,
      ),
    [events],
  );

  const filteredEvents = useMemo(() => {
    return events.filter((ev) => {
      // 1. Outcome filter
      if (filterMode === "risk") {
        if (!["risk", "scope_mismatch", "freshness"].includes(ev.outcome)) return false;
      } else if (filterMode === "correction") {
        if (ev.outcome !== "correction") return false;
      } else if (filterMode === "success") {
        if (ev.outcome !== "success" && ev.outcome !== "neutral") return false;
      }

      // 2. Provider filter
      if (providerFilter !== "all") {
        if (ev.provider_id.toLowerCase() !== providerFilter.toLowerCase()) return false;
      }

      return true;
    });
  }, [events, filterMode, providerFilter]);

  return (
    <div className="telemetry-risk-feed-section" aria-label="Telemetry risk signals">
      <div className="review-title">
        <div>
          <div className="telemetry-feed-heading-row">
            <Radio size={16} className="mint live-pulse-icon" />
            <h3 id="telemetry-feed-title">{title}</h3>
          </div>
          <p>
            Real-time execution telemetry streamed from agent tool hooks. Risk signals and latency
            anomalies trigger operator review.
          </p>
        </div>
        <div className="telemetry-risk-badge-group">
          {anomalyEvents.length > 0 && (
            <span className="anomaly-alert-pill" title="Anomalous execution runs detected">
              <Flame size={12} className="coral" /> {anomalyEvents.length} Anomal
              {anomalyEvents.length === 1 ? "y" : "ies"}
            </span>
          )}
          <span className="telemetry-total-pill">{events.length} total events</span>
        </div>
      </div>

      {/* Anomaly & Risk Summary Banner */}
      {riskEvents.length > 0 && (
        <div className="telemetry-risk-alert-card" role="alert">
          <AlertTriangle size={18} className="amber" />
          <div className="alert-content">
            <strong>
              Attention: {riskEvents.length} Risk & Correction Signal
              {riskEvents.length === 1 ? "" : "s"} Intercepted
            </strong>
            <small>
              Hooks flagged invariant deviations, policy adjustments, or execution corrections
              requiring human awareness.
            </small>
          </div>
          <button
            type="button"
            className="filter-risk-shortcut-btn"
            onClick={() => setFilterMode("risk")}
          >
            Inspect Risks <ArrowUpRight size={13} />
          </button>
        </div>
      )}

      {/* Filter Toolbar for Telemetry Feed */}
      <div className="telemetry-feed-toolbar">
        <div className="filter-chips-row" role="group" aria-label="Filter telemetry feed">
          <button
            type="button"
            className={`feed-filter-chip ${filterMode === "all" ? "active" : ""}`}
            onClick={() => setFilterMode("all")}
          >
            All ({events.length})
          </button>
          <button
            type="button"
            className={`feed-filter-chip risk ${filterMode === "risk" ? "active" : ""}`}
            onClick={() => setFilterMode("risk")}
          >
            🚨 Risks (
            {events.filter((e) => ["risk", "scope_mismatch", "freshness"].includes(e.outcome)).length})
          </button>
          <button
            type="button"
            className={`feed-filter-chip correction ${filterMode === "correction" ? "active" : ""}`}
            onClick={() => setFilterMode("correction")}
          >
            🔄 Corrections ({events.filter((e) => e.outcome === "correction").length})
          </button>
          <button
            type="button"
            className={`feed-filter-chip success ${filterMode === "success" ? "active" : ""}`}
            onClick={() => setFilterMode("success")}
          >
            ✅ Successes (
            {events.filter((e) => e.outcome === "success" || e.outcome === "neutral").length})
          </button>
        </div>

        <div className="provider-filter-select-wrapper">
          <label className="provider-filter-label">
            <span>Provider:</span>
            <select
              value={providerFilter}
              onChange={(e) => setProviderFilter(e.target.value)}
              className="feed-provider-select"
            >
              <option value="all">All Providers</option>
              <option value="antigravity">Antigravity</option>
              <option value="codex">Codex</option>
              <option value="claude">Claude</option>
            </select>
          </label>
        </div>
      </div>

      {/* Live Event Stream Rows */}
      {filteredEvents.length === 0 ? (
        <div className="review-empty">
          <CircleCheck size={20} className="mint" />
          <span>No telemetry events match the active filter.</span>
        </div>
      ) : (
        <div className="telemetry-feed-list">
          {filteredEvents.map((ev, index) => {
            const isHighLatency = ev.duration_ms > 150;
            const isRisk = ["risk", "scope_mismatch", "freshness"].includes(ev.outcome);
            const isCorrection = ev.outcome === "correction";

            return (
              <article
                key={ev.id || `${ev.timestamp}-${index}`}
                className={`telemetry-review-row ${ev.outcome} ${isHighLatency ? "latency-spike" : ""}`}
              >
                <div className="telemetry-row-icon-col">
                  {isRisk ? (
                    <AlertTriangle size={18} className="coral" />
                  ) : isCorrection ? (
                    <TrendingUp size={18} className="amber" />
                  ) : (
                    <CheckCircle2 size={18} className="mint" />
                  )}
                </div>

                <div className="telemetry-row-main">
                  <div className="telemetry-row-header">
                    <strong className="skill-name-tag">{ev.skill_name}</strong>
                    <span className={`outcome-badge ${ev.outcome}`}>
                      {ev.outcome.replaceAll("_", " ")}
                    </span>
                    <InvocationBadge mode={ev.invocation_mode} size="sm" showTooltip={true} />
                    <ProviderBadge
                      providerId={ev.provider_id}
                      showDeliveryPath={false}
                      showTooltip={false}
                    />

                    {isHighLatency && (
                      <span className="anomaly-tag latency" title="Execution latency exceeded 150ms">
                        ⏱️ High Latency
                      </span>
                    )}
                  </div>

                  <p className="telemetry-row-summary">{ev.summary}</p>
                </div>

                <div className="telemetry-row-meta-col">
                  <span className="meta-duration">
                    <Zap size={11} /> {formatDuration(ev.duration_ms)}
                  </span>
                  <small className="meta-time">
                    {new Date(ev.timestamp).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}
                  </small>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function ReviewQueue({
  items,
  remote,
  telemetrySummary: propTelemetrySummary,
}: {
  items: ReviewItem[];
  remote: boolean;
  telemetrySummary?: TelemetrySummary | null;
}) {
  const queue = remote ? items : demoReviewQueue;
  const [internalTelemetry, setInternalTelemetry] = useState<TelemetrySummary | null>(null);

  useEffect(() => {
    let active = true;
    const fetchSummary = async () => {
      try {
        const summary = await fetchTelemetrySummary();
        if (active) setInternalTelemetry(summary);
      } catch {
        // Resilient fallback
      }
    };

    void fetchSummary();
    const timer = setInterval(() => {
      void fetchSummary();
    }, 4000);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  const telemetrySummary =
    propTelemetrySummary ?? internalTelemetry ?? createMockTelemetrySummary();

  return (
    <section className="review-queue-workspace" aria-labelledby="review-queue-title">
      <div className="review-queue" aria-labelledby="review-queue-title">
        <div className="review-title">
          <div>
            <h2 id="review-queue-title">Review queue</h2>
            <p>Evidence that needs a human decision. No policy is changed automatically.</p>
          </div>
          <span>{queue.length} open</span>
        </div>
        {queue.length === 0 ? (
          <div className="review-empty">
            <CircleCheck size={22} className="mint" />
            <span>No current review signals.</span>
          </div>
        ) : (
          <div className="review-list">
            {queue.map((item) => (
              <article className="review-row" key={item.lineage.id}>
                <AlertTriangle size={21} className={`review-icon ${item.severity}`} />
                <div className="review-skill">
                  <strong>{item.lineage.skill_name}</strong>
                  <small>
                    {item.latest_source_revision_id
                      ? `Pinned revision · ${item.latest_source_revision_id.slice(0, 12)}`
                      : "No source revision recorded"}
                  </small>
                </div>
                <div className="review-reasons">
                  {item.reasons.map((reason) => (
                    <span key={reason.code} title={reason.detail}>
                      {reason.code.replaceAll("_", " ")}
                    </span>
                  ))}
                </div>
                <span className={`severity ${item.severity}`}>{item.severity}</span>
                <ChevronDown size={20} className="row-chevron" aria-hidden="true" />
              </article>
            ))}
          </div>
        )}
      </div>

      {/* Live Telemetry Activity Feed & Risk Signals */}
      <TelemetryRiskActivityFeed events={telemetrySummary.recent_events} />
    </section>
  );
}

export function SourceChangeQueue({
  candidates,
  summaries,
  actionId,
  onSummaryChange,
  onReview,
  onAdopt,
}: {
  candidates: SourceAdoptionCandidate[];
  summaries: Record<string, string>;
  actionId: string | null;
  onSummaryChange: (sourceRevisionId: string, summary: string) => void;
  onReview: (candidate: SourceAdoptionCandidate, decision: "approved" | "rejected") => void;
  onAdopt: (candidate: SourceAdoptionCandidate, presetId: string) => void;
}) {
  return (
    <section className="source-changes" aria-labelledby="source-changes-title">
      <div className="review-title">
        <div>
          <h2 id="source-changes-title">Source change decisions</h2>
          <p>
            Imported revisions stay isolated until reviewed, then create a new template version only
            when adopted.
          </p>
        </div>
        <span>
          {candidates.length} candidate{candidates.length === 1 ? "" : "s"}
        </span>
      </div>
      {candidates.length === 0 ? (
        <div className="review-empty">
          <CircleCheck size={22} className="mint" />
          <span>No imported revision is waiting to replace a pinned template skill.</span>
        </div>
      ) : (
        <div className="source-change-list">
          {candidates.map((candidate) => {
            const busy =
              actionId === candidate.source_revision_id ||
              actionId?.startsWith(`${candidate.registry_skill_id}:`) === true;
            const approved = candidate.review?.decision === "approved";
            return (
              <article className="source-change" key={candidate.registry_skill_id}>
                <div className="source-change-heading">
                  <Database size={21} className="mint" />
                  <div>
                    <strong>{candidate.skill_name}</strong>
                    <small>
                      Candidate {candidate.source_revision_id.slice(0, 12)} · imported{" "}
                      {new Date(candidate.imported_at).toLocaleDateString()}
                    </small>
                  </div>
                  <span
                    className={
                      candidate.review
                        ? `review-decision ${candidate.review.decision}`
                        : "review-decision pending"
                    }
                  >
                    {candidate.review?.decision ?? "needs review"}
                  </span>
                </div>
                {candidate.review ? (
                  <p className="review-summary">{candidate.review.summary}</p>
                ) : (
                  <label className="review-summary-input">
                    <span>Decision note</span>
                    <input
                      value={summaries[candidate.source_revision_id] ?? ""}
                      onChange={(event) =>
                        onSummaryChange(candidate.source_revision_id, event.target.value)
                      }
                      placeholder="What changed and why this decision is safe"
                    />
                  </label>
                )}
                {!candidate.review ? (
                  <div className="source-actions">
                    <button
                      className="source-button approve"
                      type="button"
                      disabled={busy}
                      onClick={() => onReview(candidate, "approved")}
                    >
                      {busy ? "Saving…" : "Approve revision"}
                    </button>
                    <button
                      className="source-button reject"
                      type="button"
                      disabled={busy}
                      onClick={() => onReview(candidate, "rejected")}
                    >
                      Reject
                    </button>
                  </div>
                ) : null}
                <div className="compatible-presets">
                  <span>Can replace</span>
                  {candidate.compatible_presets.map((preset) => (
                    <div key={preset.id} className="compatible-preset">
                      <div>
                        <strong>{preset.name}</strong>
                        <small>
                          Current template v{preset.selected_version} · pinned revision{" "}
                          {preset.current_source_revision_id.slice(0, 10)}
                        </small>
                      </div>
                      {approved ? (
                        <button
                          className="adopt-button"
                          type="button"
                          disabled={busy}
                          onClick={() => onAdopt(candidate, preset.id)}
                        >
                          {busy ? "Adopting…" : "Adopt as new version"}
                        </button>
                      ) : (
                        <small className="adopt-hint">Approve before adoption</small>
                      )}
                    </div>
                  ))}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
