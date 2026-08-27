import React, { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  BarChart2,
  Check,
  CheckCircle2,
  Clock,
  Cpu,
  Eye,
  FileCode,
  Filter,
  Layers3,
  LoaderCircle,
  Radio,
  RefreshCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Terminal,
  TrendingUp,
  Wrench,
  X,
  Zap,
} from "lucide-react";
import type {
  DriftSummary,
  RemoteComparison,
  RemoteHistory,
  TelemetryEvent,
  TelemetrySummary,
  UpstreamBinding,
  UpstreamStatus,
} from "../types";
import {
  DeliveryPathIndicator,
  InvocationBadge,
  ProviderBadge,
  calculateProjectStatus,
  getProviderInfo,
  resolveDeliveryPath,
} from "../visual-identity";
import {
  createMockTelemetrySummary,
  fetchTelemetrySummary,
  formatDuration,
} from "../api/catalog-api";

// ============================================================================
// 1. Helper Functions & Filtering Logic
// ============================================================================

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

export function getBindingTelemetry(
  skillId: string,
  providerId: string,
  events: TelemetryEvent[] = [],
) {
  const cleanId = (skillId || "").trim().toLowerCase();
  const cleanProv = (providerId || "").trim().toLowerCase();

  const matching = events.filter((e) => {
    const evSkill = (e.skill_name || "").toLowerCase();
    const evLineage = (e.lineage_id || "").toLowerCase();
    const evProv = (e.provider_id || "").toLowerCase();

    const matchesSkill = evSkill === cleanId || evLineage === cleanId || cleanId.includes(evSkill);
    const matchesProv = !cleanProv || evProv === cleanProv;
    return matchesSkill && matchesProv;
  });

  const totalRuns = matching.length;
  const latest = matching[0] || null;
  const avgDuration =
    totalRuns > 0
      ? Math.round(matching.reduce((acc, m) => acc + (m.duration_ms || 0), 0) / totalRuns)
      : 0;

  return {
    totalRuns,
    lastInvokedAt: latest?.timestamp || null,
    latestOutcome: latest?.outcome || null,
    latestInvocationMode: latest?.invocation_mode || null,
    avgDuration,
    hasActivity: totalRuns > 0,
  };
}

export type BindingFilterStatus =
  | "all"
  | "enabled"
  | "disabled"
  | "missing"
  | "conflict"
  | "unavailable"
  | "attention";

export function filterBindings(
  bindings: UpstreamBinding[] = [],
  statusFilter: BindingFilterStatus = "all",
  searchQuery = "",
): UpstreamBinding[] {
  const needle = searchQuery.trim().toLowerCase();

  return bindings.filter((binding) => {
    // 1. Status Chip Filter
    const state = (binding.state || "").toLowerCase();
    if (statusFilter === "enabled" && state !== "enabled") return false;
    if (statusFilter === "disabled" && state !== "disabled") return false;
    if (statusFilter === "missing" && state !== "missing") return false;
    if (statusFilter === "conflict" && state !== "conflict") return false;
    if (statusFilter === "unavailable" && state !== "unavailable") return false;
    if (
      statusFilter === "attention" &&
      state !== "missing" &&
      state !== "conflict" &&
      state !== "unavailable" &&
      state !== "drift"
    ) {
      return false;
    }

    // 2. Search query match
    if (!needle) return true;

    const skillId = (binding.skill_instance_id || "").toLowerCase();
    const providerId = (binding.provider_id || "").toLowerCase();
    const scope = (binding.scope || "").toLowerCase();
    const targetPath = (binding.target_path || "").toLowerCase();

    return (
      skillId.includes(needle) ||
      providerId.includes(needle) ||
      scope.includes(needle) ||
      targetPath.includes(needle) ||
      state.includes(needle)
    );
  });
}

export function calculateDriftSummary(
  comparison: RemoteComparison | null,
  status: UpstreamStatus | null,
): DriftSummary {
  const providerId = comparison?.provider_id || status?.inventory?.providers?.[0]?.provider_id || "antigravity";

  // Check comparison object from backend
  if (comparison) {
    if (!comparison.in_sync) {
      const summary = comparison.summary || {};
      const driftBreakdown: Record<string, number> = {};
      let totalDrift = 0;
      let matchedCount = summary.matched ?? 0;

      for (const [key, count] of Object.entries(summary)) {
        if (key !== "matched" && typeof count === "number" && count > 0) {
          driftBreakdown[key] = count;
          totalDrift += count;
        }
      }

      const driftDetails = Object.entries(driftBreakdown)
        .map(([k, count]) => `${count} ${k.replaceAll("_", " ")}`)
        .join(", ");

      return {
        hasDrift: true,
        totalDriftCount: totalDrift,
        driftBreakdown,
        matchedCount,
        providerId,
        message: driftDetails ? `Observed drift: ${driftDetails}` : "Observed filesystem drift from pinned plan.",
      };
    }

    return {
      hasDrift: false,
      totalDriftCount: 0,
      driftBreakdown: {},
      matchedCount: comparison.summary?.matched ?? 0,
      providerId,
      message: `Filesystem bindings match pinned activation plan for provider ${providerId}.`,
    };
  }

  // Fallback: check status summary attention items
  if (status?.summary) {
    const s = status.summary;
    const attention = (s.missing ?? 0) + (s.conflict ?? 0) + (s.unavailable ?? 0);
    if (attention > 0) {
      const driftBreakdown: Record<string, number> = {};
      if (s.missing) driftBreakdown.missing = s.missing;
      if (s.conflict) driftBreakdown.conflict = s.conflict;
      if (s.unavailable) driftBreakdown.unavailable = s.unavailable;

      return {
        hasDrift: true,
        totalDriftCount: attention,
        driftBreakdown,
        matchedCount: s.enabled ?? 0,
        providerId,
        message: `${attention} bindings require attention (${s.missing || 0} missing, ${
          s.conflict || 0
        } conflict, ${s.unavailable || 0} unavailable).`,
      };
    }
  }

  return {
    hasDrift: false,
    totalDriftCount: 0,
    driftBreakdown: {},
    matchedCount: status?.summary?.enabled ?? 0,
    providerId,
    message: "No drift detected. Upstream manager is ready.",
  };
}

export function getBindingStateBadgeClass(state?: string | null): string {
  const s = (state || "").toLowerCase();
  switch (s) {
    case "enabled":
      return "binding-state enabled";
    case "disabled":
      return "binding-state disabled";
    case "missing":
      return "binding-state missing problem";
    case "conflict":
      return "binding-state conflict problem";
    case "unavailable":
      return "binding-state unavailable problem";
    case "drift":
      return "binding-state drift warning";
    default:
      return "binding-state";
  }
}

// ============================================================================
// 2. Main LiveActivationDrawer Component
// ============================================================================

export interface LiveActivationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  globalStatus: UpstreamStatus | null;
  projectStatus: UpstreamStatus | null;
  comparison: RemoteComparison | null;
  history: RemoteHistory | null;
  loading: boolean;
  error: string | null;
  selectedProjectId?: string | null;
  providerId?: string;
  onRefresh: () => void;
  onReconcileDrift?: () => void;
  onReapplyPlan?: () => void;
  telemetrySummary?: TelemetrySummary | null;
}

export function LiveActivationDrawer({
  isOpen,
  onClose,
  globalStatus,
  projectStatus,
  comparison,
  history,
  loading,
  error,
  selectedProjectId,
  providerId = "antigravity",
  onRefresh,
  onReconcileDrift,
  onReapplyPlan,
  telemetrySummary: propTelemetrySummary,
}: LiveActivationDrawerProps) {
  const [targetScope, setTargetScope] = useState<"project" | "global">("project");
  const [statusFilter, setStatusFilter] = useState<BindingFilterStatus>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [internalTelemetry, setInternalTelemetry] = useState<TelemetrySummary | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    const poll = async () => {
      try {
        const summary = await fetchTelemetrySummary({
          projectId: selectedProjectId ?? undefined,
        });
        if (active) setInternalTelemetry(summary);
      } catch {
        // Resilient fallback
      }
    };

    void poll();
    const timer = setInterval(() => {
      void poll();
    }, 4000);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [isOpen, selectedProjectId]);

  const telemetrySummary =
    propTelemetrySummary ??
    internalTelemetry ??
    createMockTelemetrySummary({ projectId: selectedProjectId ?? undefined });

  const activeStatus = targetScope === "project" ? projectStatus : globalStatus;
  const driftSummary = useMemo(
    () => calculateDriftSummary(comparison, activeStatus),
    [comparison, activeStatus],
  );

  const allBindings = activeStatus?.bindings || [];
  const filteredBindings = useMemo(
    () => filterBindings(allBindings, statusFilter, searchQuery),
    [allBindings, statusFilter, searchQuery],
  );

  const detectedProviders =
    activeStatus?.inventory?.providers?.filter((p) => p.detected) || [];
  const providerMeta = getProviderInfo(providerId);

  if (!isOpen) return null;

  return (
    <div
      className="drawer-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="drawer-title"
    >
      <div className="drawer-backdrop" onClick={onClose} aria-hidden="true" />
      <div className="drawer-container">
        {/* Drawer Header */}
        <div className="drawer-header">
          <div className="drawer-header-left">
            <div className="drawer-badge-row">
              <span className="drawer-badge">
                <Sparkles size={13} className="mint" /> Real-Time Diagnostics
              </span>
              <ProviderBadge providerId={providerId} showDeliveryPath={false} showTooltip={true} />
              {selectedProjectId && (
                <span className="project-context-tag">Project: {selectedProjectId}</span>
              )}
            </div>
            <h2 id="drawer-title">Live Activation Diagnostics</h2>
            <p className="drawer-subtitle">
              Inspect upstream provider bindings, detect symlink drift, and perform 1-click reconciliation.
            </p>
          </div>

          <button
            className="drawer-close-btn"
            type="button"
            onClick={onClose}
            aria-label="Close activation diagnostics drawer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Scope Switcher Tabs */}
        <div className="drawer-scope-tabs">
          <button
            type="button"
            className={`drawer-tab-btn ${targetScope === "project" ? "active" : ""}`}
            onClick={() => setTargetScope("project")}
          >
            <Layers3 size={15} />
            <span>Selected Project ({selectedProjectId || "Local"})</span>
            {projectStatus?.summary && (
              <span className="tab-count">{projectStatus.summary.total}</span>
            )}
          </button>
          <button
            type="button"
            className={`drawer-tab-btn ${targetScope === "global" ? "active" : ""}`}
            onClick={() => setTargetScope("global")}
          >
            <Cpu size={15} />
            <span>Global Provider Activation</span>
            {globalStatus?.summary && (
              <span className="tab-count">{globalStatus.summary.total}</span>
            )}
          </button>
        </div>

        {/* High-Visibility Drift Alert Banner or In-Sync Banner */}
        {driftSummary.hasDrift ? (
          <div className="drift-alert-banner" role="alert">
            <div className="drift-alert-icon-col">
              <AlertTriangle size={24} className="amber drift-pulse-icon" />
            </div>
            <div className="drift-alert-content">
              <div className="drift-alert-title-row">
                <strong className="drift-title">
                  Drift Warning: {driftSummary.totalDriftCount} Divergent Binding
                  {driftSummary.totalDriftCount === 1 ? "" : "s"} Detected
                </strong>
                <span className="drift-count-pill">
                  {driftSummary.totalDriftCount} drifted
                </span>
              </div>
              <p className="drift-detail-text">{driftSummary.message}</p>
              {Object.keys(driftSummary.driftBreakdown).length > 0 && (
                <div className="drift-chips-row">
                  {Object.entries(driftSummary.driftBreakdown).map(([status, count]) => (
                    <span key={status} className={`drift-breakdown-chip ${status}`}>
                      <strong>{count}</strong> {status}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="sync-banner" role="status">
            <CheckCircle2 size={20} className="mint" />
            <div className="sync-banner-content">
              <strong>All Provider Bindings In Sync</strong>
              <small>{driftSummary.message}</small>
            </div>
          </div>
        )}

        {/* Actionable Reconciliation Toolbar */}
        <div className="reconciliation-toolbar">
          <div className="toolbar-left-actions">
            {driftSummary.hasDrift && onReconcileDrift && (
              <button
                className="reconcile-action-btn primary"
                type="button"
                onClick={onReconcileDrift}
                disabled={loading}
              >
                <Wrench size={16} /> Reconcile Drift
              </button>
            )}

            {onReapplyPlan && (
              <button
                className="reconcile-action-btn secondary"
                type="button"
                onClick={onReapplyPlan}
                disabled={loading}
              >
                <Check size={16} /> Re-apply Active Plan
              </button>
            )}

            <button
              className="reconcile-action-btn refresh"
              type="button"
              onClick={onRefresh}
              disabled={loading}
            >
              {loading ? (
                <LoaderCircle size={16} className="spin" />
              ) : (
                <RefreshCcw size={16} />
              )}
              {loading ? "Inspecting…" : "Refresh Inspection"}
            </button>
          </div>

          <div className="toolbar-stats-summary">
            {activeStatus?.summary && (
              <div className="status-stat-chips">
                <span className="stat-chip enabled">
                  <strong>{activeStatus.summary.enabled}</strong> enabled
                </span>
                <span className="stat-chip disabled">
                  <strong>{activeStatus.summary.disabled}</strong> disabled
                </span>
                <span className="stat-chip attention">
                  <strong>
                    {activeStatus.summary.missing +
                      activeStatus.summary.conflict +
                      activeStatus.summary.unavailable}
                  </strong>{" "}
                  attention
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Provider Inventory Overview Strip */}
        <div className="drawer-provider-strip">
          <span className="strip-title">Detected Upstream Providers:</span>
          {detectedProviders.length > 0 ? (
            <div className="provider-chips-list">
              {detectedProviders.map((p) => (
                <span key={p.provider_id} className={`provider-inv-chip ${p.provider_id}`}>
                  <strong>{p.display_name || p.provider_id}</strong>
                  <small>({p.enabled_count ?? 0} enabled)</small>
                </span>
              ))}
            </div>
          ) : (
            <span className="no-providers-text">No active providers reported</span>
          )}
        </div>

        {/* Provider-level Execution Counters & Live Telemetry Metrics */}
        <div className="drawer-telemetry-counters-strip" aria-label="Provider telemetry counters">
          <div className="telemetry-strip-header">
            <Radio size={14} className="mint live-pulse-icon" />
            <span className="telemetry-strip-title">Provider Execution Counters & Telemetry</span>
            <span className="telemetry-strip-total">
              {telemetrySummary.total_invocations} runs ·{" "}
              {formatDuration(telemetrySummary.average_duration_ms)} avg latency
            </span>
          </div>

          <div className="provider-counters-grid">
            {(["antigravity", "codex", "claude"] as const).map((provId) => {
              const count = telemetrySummary.by_provider[provId] || 0;
              const meta = getProviderInfo(provId);
              const provEvents = telemetrySummary.recent_events.filter(
                (e) => e.provider_id.toLowerCase() === provId.toLowerCase(),
              );
              const provAvgMs =
                provEvents.length > 0
                  ? Math.round(
                      provEvents.reduce((sum, e) => sum + (e.duration_ms || 0), 0) /
                        provEvents.length,
                    )
                  : 0;

              return (
                <div key={provId} className={`provider-counter-card ${provId}`}>
                  <div className="provider-counter-top">
                    <ProviderBadge
                      providerId={provId}
                      showDeliveryPath={false}
                      showTooltip={false}
                    />
                    <span className="counter-invocations-pill">
                      <strong>{count}</strong> runs
                    </span>
                  </div>
                  <div className="provider-counter-meta">
                    <span className="counter-latency-tag">
                      <Zap size={11} /> {provAvgMs > 0 ? formatDuration(provAvgMs) : "0ms"} avg
                    </span>
                    <span className="counter-status-tag active">Active Junction</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Bindings Filter & Search Controls */}
        <div className="drawer-filter-bar">
          <div className="binding-search-wrapper">
            <Search size={15} className="search-icon" />
            <input
              type="search"
              className="binding-search-input"
              placeholder="Search bindings by name, path, provider, or state..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                className="clear-search-btn"
                type="button"
                onClick={() => setSearchQuery("")}
                aria-label="Clear search query"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div className="binding-filter-chips" role="group" aria-label="Filter bindings by state">
            {(
              [
                { id: "all", label: "All", count: allBindings.length },
                {
                  id: "enabled",
                  label: "Enabled",
                  count: allBindings.filter((b) => b.state === "enabled").length,
                },
                {
                  id: "disabled",
                  label: "Disabled",
                  count: allBindings.filter((b) => b.state === "disabled").length,
                },
                {
                  id: "missing",
                  label: "Missing",
                  count: allBindings.filter((b) => b.state === "missing").length,
                },
                {
                  id: "conflict",
                  label: "Conflict",
                  count: allBindings.filter((b) => b.state === "conflict").length,
                },
                {
                  id: "unavailable",
                  label: "Unavailable",
                  count: allBindings.filter((b) => b.state === "unavailable").length,
                },
                {
                  id: "attention",
                  label: "Attention",
                  count: allBindings.filter(
                    (b) =>
                      b.state === "missing" ||
                      b.state === "conflict" ||
                      b.state === "unavailable",
                  ).length,
                },
              ] as const
            ).map((chip) => (
              <button
                key={chip.id}
                type="button"
                className={`binding-chip ${chip.id} ${statusFilter === chip.id ? "active" : ""}`}
                onClick={() => setStatusFilter(chip.id)}
              >
                <span>{chip.label}</span>
                <span className="chip-count">{chip.count}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Bindings List Section */}
        <div className="drawer-bindings-scroll" tabIndex={0} aria-label="Bindings inspection list">
          {error ? (
            <div className="drawer-error-panel">
              <AlertCircle size={20} className="coral" />
              <div>
                <strong>Skills Manager Error</strong>
                <p>{error}</p>
              </div>
            </div>
          ) : filteredBindings.length === 0 ? (
            <div className="drawer-empty-panel">
              <Layers3 size={32} className="muted" />
              <strong>No bindings match the active filter</strong>
              <p>Try clearing your search query or selecting "All" to inspect all bindings.</p>
              {(statusFilter !== "all" || searchQuery) && (
                <button
                  type="button"
                  className="quiet-action reset-filters-btn"
                  onClick={() => {
                    setStatusFilter("all");
                    setSearchQuery("");
                  }}
                >
                  <RefreshCcw size={14} /> Reset Filters
                </button>
              )}
            </div>
          ) : (
            <div className="drawer-bindings-list">
              {filteredBindings.map((binding) => {
                const bProvider = binding.provider_id || providerId;
                const path =
                  binding.target_path || resolveDeliveryPath(bProvider, binding.skill_instance_id);
                const telemetry = getBindingTelemetry(
                  binding.skill_instance_id,
                  binding.provider_id,
                  telemetrySummary.recent_events,
                );

                return (
                  <article
                    key={`${binding.provider_id}:${binding.scope}:${binding.skill_instance_id}:${
                      binding.target_path || ""
                    }`}
                    className={`drawer-binding-card ${binding.state}`}
                  >
                    <div className="binding-card-main">
                      <div className="binding-title-row">
                        <strong className="binding-skill-name">{binding.skill_instance_id}</strong>
                        <span className={getBindingStateBadgeClass(binding.state)}>
                          {binding.state}
                        </span>
                      </div>

                      <div className="binding-meta-row">
                        <ProviderBadge
                          providerId={binding.provider_id}
                          showDeliveryPath={false}
                          showTooltip={true}
                        />
                        <span className="binding-scope-tag">Scope: {binding.scope}</span>
                        {binding.reason && (
                          <span className="binding-desired-tag">
                            Reason: {binding.reason}
                          </span>
                        )}
                      </div>

                      <div className="binding-path-row">
                        <span className="path-prefix">Target Delivery Path:</span>
                        <code className="binding-path-code">{path}</code>
                      </div>

                      {/* Active Junction Telemetry Indicators */}
                      <div className="binding-telemetry-row">
                        <span className="junction-telemetry-badge">
                          <Zap size={11} className="mint" /> {telemetry.totalRuns} runs
                        </span>
                        {telemetry.hasActivity ? (
                          <>
                            <span className="junction-time-tag">
                              <Clock size={11} /> {formatTimeAgo(telemetry.lastInvokedAt!)}
                            </span>
                            {telemetry.latestOutcome && (
                              <span className={`junction-outcome-pill ${telemetry.latestOutcome}`}>
                                {telemetry.latestOutcome.replaceAll("_", " ")}
                              </span>
                            )}
                            {telemetry.latestInvocationMode && (
                              <InvocationBadge
                                mode={telemetry.latestInvocationMode}
                                size="sm"
                                showTooltip={false}
                              />
                            )}
                          </>
                        ) : (
                          <span className="junction-idle-tag">idle junction</span>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>

        {/* Drawer Footer */}
        <div className="drawer-footer">
          <div className="drawer-footer-timestamp">
            <Clock size={13} />
            <small>
              Last checked:{" "}
              {activeStatus?.checked_at
                ? new Date(activeStatus.checked_at).toLocaleString()
                : "Not inspected"}
            </small>
          </div>
          <button className="primary-action-btn drawer-dismiss-btn" type="button" onClick={onClose}>
            Close Diagnostics
          </button>
        </div>
      </div>
    </div>
  );
}
