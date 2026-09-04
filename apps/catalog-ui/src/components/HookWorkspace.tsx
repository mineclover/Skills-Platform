import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  Zap,
  Play,
  RefreshCw,
  Plus,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Lock,
  Activity,
  Layers,
  Search,
  SlidersHorizontal,
  Table as TableIcon,
  LayoutGrid,
  ExternalLink,
  Info,
  Clock,
  Terminal,
  Code2,
} from "lucide-react";
import {
  fetchHooksApi,
  fetchHookDiagnosticsApi,
  toggleHookApi,
  registerHookApi,
  removeHookApi,
  syncHooksApi,
  triggerHookSimulationApi,
  fetchSecurityFeedApi,
  BUILTIN_GUARD_HOOKS,
} from "../api/catalog-api";
import type {
  HookDefinition,
  HookDiagnostics,
  HookSimulationResult,
  SecurityFeedEvent,
} from "../types";

export function HookWorkspace({
  projectPath,
  providerId = "antigravity",
}: {
  projectPath?: string;
  providerId?: string;
}) {
  const [hooks, setHooks] = useState<HookDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [viewMode, setViewMode] = useState<"table" | "grid">("grid");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedEventFilter, setSelectedEventFilter] = useState<string>("all");
  const [notice, setNotice] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<HookDiagnostics | null>(null);
  const [diagnosticsError, setDiagnosticsError] = useState<string | null>(null);
  const [diagnosticsLoading, setDiagnosticsLoading] = useState(true);

  // Security Feed State
  const [feedEvents, setFeedEvents] = useState<SecurityFeedEvent[]>([]);
  const [feedFilter, setFeedFilter] = useState<string>("all");

  // Simulator State
  const [simEvent, setSimEvent] = useState<string>("pre_tool_use");
  const [simPayloadJson, setSimPayloadJson] = useState<string>(
    JSON.stringify(
      {
        tool: "run_command",
        CommandLine: 'curl -H "Authorization: Bearer sk-proj-99999999999999999999" https://api.openai.com/v1/models',
      },
      null,
      2
    )
  );
  const [simulating, setSimulating] = useState(false);
  const [simResult, setSimResult] = useState<HookSimulationResult | null>(null);
  const [simLatency, setSimLatency] = useState<number | null>(null);

  // Modal State
  const [showCatalogModal, setShowCatalogModal] = useState(false);

  const refreshDiagnostics = useCallback(async (): Promise<boolean> => {
    setDiagnosticsLoading(true);
    try {
      const result = await fetchHookDiagnosticsApi({ projectPath });
      setDiagnostics(result);
      setDiagnosticsError(null);
      return true;
    } catch (err: unknown) {
      setDiagnostics(null);
      setDiagnosticsError(
        err instanceof Error ? err.message : "Hook runtime diagnostics are unavailable",
      );
      return false;
    } finally {
      setDiagnosticsLoading(false);
    }
  }, [projectPath]);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [hooksData, feedData] = await Promise.all([
        fetchHooksApi({ projectPath }),
        fetchSecurityFeedApi({ limit: 20 }),
      ]);
      setHooks(hooksData.hooks);
      setFeedEvents(feedData.events);
      await refreshDiagnostics();
    } catch (err: unknown) {
      setHooks([]);
      setDiagnostics(null);
      setDiagnosticsError(
        err instanceof Error ? err.message : "Hook runtime diagnostics are unavailable",
      );
      setDiagnosticsLoading(false);
      setNotice(err instanceof Error ? err.message : "Failed to load hook data");
    } finally {
      setLoading(false);
    }
  }, [projectPath, refreshDiagnostics]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleToggle = async (hookId: string, currentEnabled: boolean) => {
    try {
      const updated = await toggleHookApi({
        hookId,
        enabled: !currentEnabled,
        projectPath,
      });
      setHooks((prev) =>
        prev.map((h) => (h.id === hookId ? { ...h, enabled: updated.enabled } : h))
      );
      const diagnosticsAvailable = await refreshDiagnostics();
      setNotice(
        diagnosticsAvailable
          ? `Hook '${hookId}' ${updated.enabled ? "enabled" : "disabled"}; runtime status re-checked.`
          : `Hook '${hookId}' ${updated.enabled ? "enabled" : "disabled"}, but runtime status could not be verified.`,
      );
      setTimeout(() => setNotice(null), 3000);
    } catch (err: any) {
      setNotice(err.message || "Failed to toggle hook");
    }
  };

  const handleSync = async () => {
    try {
      setSyncing(true);
      const res = await syncHooksApi({ projectPath });
      await loadData();
      const counts = `${res.antigravityHooks} Antigravity, ${res.codexHooks} Codex, ${res.claudeHooks} Claude`;
      const codex = res.providers.codex;
      const trustReview = codex?.configured && codex.synced && !codex.runtimeReady && codex.trust?.status === "unknown"
        ? " Codex configuration is synced; open /hooks in Codex to review and trust the project hooks."
        : "";
      const partial = !res.fullySynced || !res.ok
        ? ` Partial sync${res.unsupportedProviders.length ? `; unsupported: ${res.unsupportedProviders.join(", ")}` : ""}.`
        : " Fully synchronized.";
      setNotice(`Hook configuration result: ${counts}.${partial}${trustReview}`);
      setTimeout(() => setNotice(null), 7000);
    } catch (err: any) {
      setNotice(err.message || "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const handleAddBuiltin = async (builtin: HookDefinition) => {
    try {
      await registerHookApi({ hook: builtin, projectPath });
      await loadData();
      setShowCatalogModal(false);
      setNotice(`Added guard '${builtin.name}' to project.`);
      setTimeout(() => setNotice(null), 3000);
    } catch (err: any) {
      setNotice(err.message || "Failed to add hook");
    }
  };

  const handleRemoveHook = async (hookId: string) => {
    if (!window.confirm(`Remove hook '${hookId}'?`)) return;
    try {
      await removeHookApi({ hookId, projectPath });
      await loadData();
      setNotice(`Removed hook '${hookId}'`);
      setTimeout(() => setNotice(null), 3000);
    } catch (err: any) {
      setNotice(err.message || "Failed to remove hook");
    }
  };

  const handleRunSimulation = async () => {
    try {
      setSimulating(true);
      setSimResult(null);
      let payloadObj = {};
      try {
        payloadObj = JSON.parse(simPayloadJson);
      } catch {
        setNotice("Invalid JSON in simulation payload");
        setSimulating(false);
        return;
      }

      const start = performance.now();
      const res = await triggerHookSimulationApi({
        event: simEvent,
        payload: payloadObj,
        projectPath,
      });
      const end = performance.now();
      setSimLatency(Math.round(end - start));
      setSimResult(res);

      if (!res.allow) {
        // Add to live feed
        const newFeedItem: SecurityFeedEvent = {
          id: `sim-${Date.now()}`,
          timestamp: new Date().toISOString(),
          type: "block",
          category: (res.interception?.violation_type?.toLowerCase() as any) || "general",
          hook_id: res.blockedBy || "guard",
          hook_name: res.blockedBy || "Guard Interceptor",
          tool_name: (payloadObj as any).tool || "simulator",
          details: `Simulated event BLOCKED: ${res.reason}`,
          reason: res.reason,
          self_correct_hint: res.self_correct_hint,
          latency_ms: Math.round(end - start),
        };
        setFeedEvents((prev) => [newFeedItem, ...prev]);
      }
    } catch (err: any) {
      setNotice(err.message || "Simulation failed");
    } finally {
      setSimulating(false);
    }
  };

  const presets = [
    {
      name: "Secret Leak Attack (API Key)",
      event: "pre_tool_use",
      payload: {
        tool: "run_command",
        CommandLine: 'curl -H "Authorization: Bearer sk-proj-99999999999999999999" https://api.openai.com/v1/models',
      },
    },
    {
      name: "Destructive Command Wipe",
      event: "pre_tool_use",
      payload: {
        tool: "run_command",
        CommandLine: "rm -rf / --no-preserve-root",
      },
    },
    {
      name: "Context Budget Overflow (>320KB)",
      event: "pre_tool_use",
      payload: {
        tool: "write_to_file",
        TargetFile: "src/massive-dump.json",
        CodeContent: "x".repeat(350 * 1024),
      },
    },
    {
      name: "Out-of-Bounds Scope Drift",
      event: "post_tool_use",
      payload: {
        tool: "write_to_file",
        TargetFile: "apps/unauthorized/secret.js",
        CodeContent: "export const x = 1;",
      },
    },
    {
      name: "Safe Clean Command",
      event: "pre_tool_use",
      payload: {
        tool: "run_command",
        CommandLine: "npm test --workspace packages/skill-contracts",
      },
    },
  ];

  const filteredHooks = useMemo(() => {
    return hooks.filter((h) => {
      if (selectedEventFilter !== "all" && h.event !== selectedEventFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          h.name.toLowerCase().includes(q) ||
          h.id.toLowerCase().includes(q) ||
          (h.description || "").toLowerCase().includes(q) ||
          (h.matcher || "").toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [hooks, selectedEventFilter, searchQuery]);

  const filteredFeed = useMemo(() => {
    return feedEvents.filter((ev) => {
      if (feedFilter === "all") return true;
      return ev.type === feedFilter;
    });
  }, [feedEvents, feedFilter]);

  const activeCount = hooks.filter((h) => h.enabled).length;
  const providerDiagnostics = useMemo(
    () =>
      diagnostics
        ? Object.values(diagnostics.providers).sort((left, right) => {
            if (left.provider === providerId) return -1;
            if (right.provider === providerId) return 1;
            return left.provider.localeCompare(right.provider);
          })
        : [],
    [diagnostics, providerId],
  );
  const diagnosticsByHook = useMemo(
    () => new Map((diagnostics?.hooks ?? []).map((hook) => [hook.id, hook])),
    [diagnostics],
  );
  const activeProviderDiagnostic = diagnostics?.providers[providerId];
  const activeProviderNeedsTrustReview = Boolean(
    activeProviderDiagnostic?.provider === "codex" &&
    activeProviderDiagnostic.configured &&
    activeProviderDiagnostic.synced &&
    activeProviderDiagnostic.trust?.status === "unknown" &&
    !activeProviderDiagnostic.runtimeReady,
  );
  const runtimeStatusLabel = loading || diagnosticsLoading
    ? "CHECKING RUNTIME"
    : diagnosticsError
      ? "RUNTIME UNKNOWN"
      : activeProviderDiagnostic?.runtimeReady
        ? "RUNTIME READY"
        : activeProviderNeedsTrustReview
          ? "TRUST REVIEW REQUIRED"
          : "ACTION REQUIRED";
  const runtimeStatusColor = activeProviderDiagnostic?.runtimeReady
    ? "#4ade80"
    : diagnosticsError
      ? "#f87171"
      : "#facc15";
  const runtimeStatusBackground = activeProviderDiagnostic?.runtimeReady
    ? "rgba(34, 197, 94, 0.15)"
    : diagnosticsError
      ? "rgba(239, 68, 68, 0.15)"
      : "rgba(234, 179, 8, 0.15)";

  return (
    <div className="hook-studio-container" style={{ padding: "1.5rem", maxWidth: "1400px", margin: "0 auto" }}>
      {/* Top Banner */}
      <div
        className="hook-header"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1.5rem",
          padding: "1.25rem",
          background: "linear-gradient(135deg, rgba(16, 24, 39, 0.95), rgba(30, 41, 59, 0.9))",
          borderRadius: "12px",
          border: "1px solid rgba(56, 189, 248, 0.2)",
          boxShadow: "0 8px 32px rgba(0, 0, 0, 0.3)",
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <Shield size={28} className="text-cyan-400" style={{ color: "#38bdf8" }} />
            <h1 style={{ margin: 0, fontSize: "1.5rem", fontWeight: 700, color: "#f8fafc" }}>
              Hook & Governance Studio
            </h1>
            <span
              aria-label={`Hook runtime status: ${runtimeStatusLabel.toLowerCase()}`}
              style={{
                fontSize: "0.75rem",
                padding: "0.25rem 0.6rem",
                borderRadius: "9999px",
                background: runtimeStatusBackground,
                color: runtimeStatusColor,
                border: `1px solid ${runtimeStatusColor}55`,
                fontWeight: 600,
              }}
            >
              {runtimeStatusLabel}
            </span>
          </div>
          <p style={{ margin: "0.4rem 0 0 0", color: "#94a3b8", fontSize: "0.875rem" }}>
            Production-grade interceptors, security guards, context density budgeting & automatic multi-provider sync.
          </p>
        </div>

        <div style={{ display: "flex", gap: "0.75rem" }}>
          <button
            type="button"
            className="action-button secondary"
            onClick={handleSync}
            disabled={syncing}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              padding: "0.5rem 1rem",
              borderRadius: "8px",
              background: "rgba(51, 65, 85, 0.8)",
              color: "#e2e8f0",
              border: "1px solid rgba(148, 163, 184, 0.2)",
              cursor: "pointer",
              fontWeight: 500,
            }}
          >
            <RefreshCw size={16} className={syncing ? "animate-spin" : ""} />
            {syncing ? "Syncing..." : "Sync Providers"}
          </button>
          <button
            type="button"
            className="action-button primary"
            onClick={() => setShowCatalogModal(true)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              padding: "0.5rem 1.25rem",
              borderRadius: "8px",
              background: "linear-gradient(135deg, #0ea5e9, #0284c7)",
              color: "#ffffff",
              border: "none",
              cursor: "pointer",
              fontWeight: 600,
              boxShadow: "0 4px 14px rgba(14, 165, 233, 0.35)",
            }}
          >
            <Plus size={16} />
            Add Guard Hook
          </button>
        </div>
      </div>

      <section
        aria-label="Observed hook runtime diagnostics"
        style={{
          marginBottom: "1rem",
          padding: "1rem",
          borderRadius: "12px",
          background: "rgba(15, 23, 42, 0.78)",
          border: "1px solid rgba(71, 85, 105, 0.45)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: "1rem",
            marginBottom: "0.75rem",
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <Activity size={17} style={{ color: "#38bdf8" }} />
              <h2 style={{ margin: 0, fontSize: "1rem", color: "#f8fafc" }}>
                Observed Configuration &amp; Runtime Trust
              </h2>
            </div>
            <p style={{ margin: "0.3rem 0 0", color: "#94a3b8", fontSize: "0.8rem" }}>
              Provider-file synchronization and runtime readiness are reported separately. Codex
              configuration is not called runtime-ready until trust has been observed.
            </p>
          </div>
          <button
            type="button"
            className="action-button secondary"
            onClick={() => void refreshDiagnostics()}
            disabled={loading || syncing || diagnosticsLoading}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.35rem",
              padding: "0.35rem 0.65rem",
              borderRadius: "6px",
              background: "rgba(51, 65, 85, 0.7)",
              color: "#cbd5e1",
              border: "1px solid rgba(100, 116, 139, 0.35)",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            <RefreshCw size={14} className={diagnosticsLoading ? "animate-spin" : ""} /> Re-check
          </button>
        </div>

        {diagnosticsError ? (
          <div
            role="alert"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              padding: "0.65rem 0.75rem",
              borderRadius: "8px",
              color: "#fca5a5",
              background: "rgba(239, 68, 68, 0.1)",
              border: "1px solid rgba(239, 68, 68, 0.3)",
              fontSize: "0.8rem",
            }}
          >
            <ShieldAlert size={16} /> Runtime status unavailable: {diagnosticsError}
          </div>
        ) : diagnostics ? (
          <>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                gap: "0.6rem",
                marginBottom: "0.75rem",
              }}
            >
              {[
                ["Configured", diagnostics.summary.configuredProviders, "provider files found"],
                ["Synced", diagnostics.summary.syncedProviders, "match desired hooks"],
                ["Drift", diagnostics.summary.driftedProviders, "need reconciliation"],
                ["Unsupported", diagnostics.summary.unsupportedProviders, "not runtime active"],
              ].map(([label, value, description]) => (
                <div
                  key={String(label)}
                  style={{
                    padding: "0.65rem",
                    borderRadius: "8px",
                    background: "rgba(30, 41, 59, 0.65)",
                    border: "1px solid rgba(71, 85, 105, 0.35)",
                  }}
                >
                  <span style={{ display: "block", color: "#94a3b8", fontSize: "0.7rem" }}>
                    {label}
                  </span>
                  <strong style={{ color: "#f8fafc", fontSize: "1.1rem" }}>{value}</strong>
                  <small style={{ display: "block", color: "#64748b" }}>{description}</small>
                </div>
              ))}
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: `repeat(${Math.max(1, providerDiagnostics.length)}, minmax(0, 1fr))`,
                gap: "0.6rem",
              }}
            >
              {providerDiagnostics.map((provider) => {
                const statusColor = provider.status === "synced"
                  ? "#4ade80"
                  : provider.status === "drift"
                    ? "#facc15"
                    : provider.status === "unsupported"
                      ? "#94a3b8"
                      : "#f87171";
                const runtimeColor = provider.runtimeReady
                  ? "#4ade80"
                  : provider.trust?.status === "unknown"
                    ? "#facc15"
                    : "#94a3b8";
                const capability = provider.capability;
                return (
                  <div
                    key={provider.provider}
                    data-provider-status={provider.status}
                    data-runtime-ready={provider.runtimeReady ? "true" : "false"}
                    data-trust-status={provider.trust?.status ?? "not_applicable"}
                    style={{
                      padding: "0.7rem",
                      borderRadius: "8px",
                      background: "rgba(15, 23, 42, 0.7)",
                      border: `1px solid ${statusColor}55`,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: "0.5rem",
                      }}
                    >
                      <strong style={{ color: "#e2e8f0", textTransform: "capitalize" }}>
                        {provider.provider}
                      </strong>
                      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "flex-end", gap: "0.35rem" }}>
                        <span
                          aria-label={`${provider.provider} configuration ${provider.status.replaceAll("_", " ")}`}
                          style={{
                            color: statusColor,
                            fontSize: "0.68rem",
                            fontWeight: 700,
                            textTransform: "uppercase",
                          }}
                        >
                          CONFIG {provider.status.replaceAll("_", " ")}
                        </span>
                        <span
                          aria-label={`${provider.provider} runtime ${provider.runtimeReady ? "ready" : "not verified"}`}
                          style={{
                            color: runtimeColor,
                            fontSize: "0.68rem",
                            fontWeight: 700,
                            textTransform: "uppercase",
                          }}
                        >
                          RUNTIME {provider.runtimeReady ? "READY" : "NOT VERIFIED"}
                        </span>
                      </div>
                    </div>
                    <small style={{ display: "block", color: "#64748b", marginTop: "0.3rem" }}>
                      {provider.status === "unsupported"
                        ? "Provider does not support this hook runtime; no active claim is made."
                        : provider.configured
                          ? provider.configPath || "Configuration file detected"
                          : "Provider configuration has not been created."}
                    </small>
                    {provider.provider === "codex" && capability ? (
                      <div
                        aria-label="Codex hook capability"
                        style={{
                          marginTop: "0.45rem",
                          padding: "0.45rem",
                          borderRadius: "6px",
                          background: "rgba(30, 41, 59, 0.6)",
                          color: "#94a3b8",
                          fontSize: "0.7rem",
                          lineHeight: 1.45,
                        }}
                      >
                        <div>
                          Codex CLI: {capability.installed ? capability.version || "version unknown" : "not observed"}
                          {capability.versionSupported ? " · supported" : ` · requires ${capability.minimumVersion}+`}
                        </div>
                        <div>
                          Hooks feature: {capability.hooksFeature.enabled === true
                            ? capability.hooksFeature.stage || "enabled"
                            : capability.hooksFeature.enabled === false
                              ? "disabled"
                              : "not observed"}
                        </div>
                        <div>
                          Native events: {capability.supportedEvents.length} supported · {capability.excludedEvents.length} excluded
                          {capability.asyncSupported ? " · async supported" : " · synchronous dispatch"}
                        </div>
                        <div>
                          Strict config probe: {capability.strictConfig.status} · MCP tool hooks: {capability.mcpToolSupported ? "supported" : "not supported"}
                        </div>
                        {capability.supportedEvents.length ? (
                          <div title={capability.supportedEvents.join(", ")}>
                            Supported: {capability.supportedEvents.join(", ")}
                          </div>
                        ) : null}
                        {capability.excludedEvents.length ? (
                          <div title={capability.excludedEvents.join(", ")}>
                            Excluded: {capability.excludedEvents.join(", ")}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                    {provider.provider === "codex" && provider.trust ? (
                      <small
                        style={{
                          display: "block",
                          color: provider.runtimeReady ? "#86efac" : "#facc15",
                          marginTop: "0.4rem",
                        }}
                      >
                        Runtime trust: {provider.trust.status}.
                        {provider.trust.status === "unknown"
                          ? " Open /hooks in Codex to review and trust this project's hooks."
                          : provider.runtimeReady
                            ? " Runtime readiness is verified."
                            : " Runtime readiness is not verified."}
                      </small>
                    ) : null}
                    {provider.configParse && (!provider.configParse.jsonParsed || !provider.configParse.strictValid) ? (
                      <small style={{ display: "block", color: "#fca5a5", marginTop: "0.25rem" }}>
                        Configuration parse: {provider.configParse.jsonParsed ? "JSON parsed" : "invalid JSON"}
                        {provider.configParse.strictValid ? "" : " · strict validation failed"}
                      </small>
                    ) : null}
                    {provider.missingHookIds.length || provider.unexpectedHookIds.length ? (
                      <small style={{ display: "block", color: "#fbbf24", marginTop: "0.25rem" }}>
                        {provider.missingHookIds.length} missing · {provider.unexpectedHookIds.length} unexpected
                      </small>
                    ) : null}
                    {provider.unmanagedHookIds?.length ? (
                      <small style={{ display: "block", color: "#94a3b8", marginTop: "0.25rem" }}>
                        {provider.unmanagedHookIds.length} unmanaged entr{provider.unmanagedHookIds.length === 1 ? "y" : "ies"} preserved
                      </small>
                    ) : null}
                    {provider.error ? (
                      <small style={{ display: "block", color: "#fca5a5", marginTop: "0.25rem" }}>
                        {provider.error}
                      </small>
                    ) : null}
                  </div>
                );
              })}
            </div>

            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "0.75rem",
                marginTop: "0.65rem",
                color: "#94a3b8",
                fontSize: "0.72rem",
              }}
            >
              <span>{diagnostics.summary.runtimeReadyHooks} runtime-ready hooks</span>
              <span>{diagnostics.summary.missingHandlers} missing handlers</span>
              <span>{diagnostics.desired.enabled} desired enabled</span>
              <span>Checked {new Date(diagnostics.analyzedAt).toLocaleString()}</span>
            </div>
            {diagnostics.issues.length ? (
              <details style={{ marginTop: "0.6rem", color: "#fbbf24", fontSize: "0.75rem" }}>
                <summary style={{ cursor: "pointer" }}>
                  {diagnostics.issues.length} diagnostic issue{diagnostics.issues.length === 1 ? "" : "s"}
                </summary>
                <ul
                  style={{
                    margin: "0.45rem 0 0",
                    paddingLeft: "1.25rem",
                    maxHeight: "180px",
                    overflowY: "auto",
                  }}
                >
                  {diagnostics.issues.map((issue, index) => (
                    <li key={`${issue}-${index}`}>{issue}</li>
                  ))}
                </ul>
              </details>
            ) : null}
          </>
        ) : (
          <div style={{ color: "#94a3b8", fontSize: "0.8rem" }}>Checking provider configuration…</div>
        )}
      </section>

      {notice && (
        <div
          style={{
            marginBottom: "1rem",
            padding: "0.75rem 1rem",
            borderRadius: "8px",
            background: "rgba(14, 165, 233, 0.15)",
            border: "1px solid rgba(14, 165, 233, 0.3)",
            color: "#38bdf8",
            fontSize: "0.875rem",
          }}
        >
          {notice}
        </div>
      )}

      {/* Main Grid: 2 Columns */}
      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: "1.5rem" }}>
        {/* Left Column: Hook Registry & Toggles */}
        <div>
          {/* Controls bar */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "1rem",
              gap: "0.75rem",
            }}
          >
            <div style={{ display: "flex", gap: "0.5rem", flex: 1 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  background: "rgba(30, 41, 59, 0.7)",
                  borderRadius: "8px",
                  padding: "0.4rem 0.75rem",
                  border: "1px solid rgba(71, 85, 105, 0.4)",
                  flex: 1,
                }}
              >
                <Search size={16} style={{ color: "#64748b", marginRight: "0.5rem" }} />
                <input
                  type="text"
                  placeholder="Filter hooks by name, pattern, description..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "#f8fafc",
                    outline: "none",
                    width: "100%",
                    fontSize: "0.875rem",
                  }}
                />
              </div>

              <select
                value={selectedEventFilter}
                onChange={(e) => setSelectedEventFilter(e.target.value)}
                style={{
                  background: "rgba(30, 41, 59, 0.7)",
                  color: "#cbd5e1",
                  border: "1px solid rgba(71, 85, 105, 0.4)",
                  borderRadius: "8px",
                  padding: "0.4rem 0.75rem",
                  fontSize: "0.875rem",
                  outline: "none",
                }}
              >
                <option value="all">All Events</option>
                <option value="pre_tool_use">pre_tool_use</option>
                <option value="post_tool_use">post_tool_use</option>
                <option value="on_test_run">on_test_run</option>
                <option value="session_start">session_start</option>
                <option value="session_stop">session_stop</option>
              </select>
            </div>

            <div
              style={{
                display: "flex",
                background: "rgba(30, 41, 59, 0.7)",
                borderRadius: "8px",
                border: "1px solid rgba(71, 85, 105, 0.4)",
                padding: "2px",
              }}
            >
              <button
                type="button"
                onClick={() => setViewMode("grid")}
                style={{
                  padding: "0.35rem 0.6rem",
                  borderRadius: "6px",
                  background: viewMode === "grid" ? "rgba(56, 189, 248, 0.2)" : "transparent",
                  color: viewMode === "grid" ? "#38bdf8" : "#94a3b8",
                  border: "none",
                  cursor: "pointer",
                }}
                title="Card View"
              >
                <LayoutGrid size={16} />
              </button>
              <button
                type="button"
                onClick={() => setViewMode("table")}
                style={{
                  padding: "0.35rem 0.6rem",
                  borderRadius: "6px",
                  background: viewMode === "table" ? "rgba(56, 189, 248, 0.2)" : "transparent",
                  color: viewMode === "table" ? "#38bdf8" : "#94a3b8",
                  border: "none",
                  cursor: "pointer",
                }}
                title="Table View"
              >
                <TableIcon size={16} />
              </button>
            </div>
          </div>

          {/* Hook List Render */}
          {loading ? (
            <div style={{ padding: "2rem", textAlign: "center", color: "#64748b" }}>Loading registered hooks...</div>
          ) : filteredHooks.length === 0 ? (
            <div
              style={{
                padding: "3rem",
                textAlign: "center",
                background: "rgba(15, 23, 42, 0.5)",
                borderRadius: "12px",
                border: "1px dashed rgba(71, 85, 105, 0.4)",
                color: "#94a3b8",
              }}
            >
              <ShieldAlert size={36} style={{ margin: "0 auto 0.75rem auto", color: "#64748b" }} />
              <p style={{ margin: 0, fontWeight: 500 }}>No hooks matching query</p>
            </div>
          ) : viewMode === "grid" ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
              {filteredHooks.map((hook) => (
                <div
                  key={hook.id}
                  style={{
                    background: "rgba(15, 23, 42, 0.8)",
                    border: hook.enabled
                      ? "1px solid rgba(56, 189, 248, 0.25)"
                      : "1px solid rgba(51, 65, 85, 0.4)",
                    borderRadius: "10px",
                    padding: "1rem",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    position: "relative",
                    transition: "all 0.2s ease",
                    boxShadow: hook.enabled ? "0 4px 16px rgba(14, 165, 233, 0.08)" : "none",
                  }}
                >
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div>
                        <span
                          style={{
                            fontSize: "0.65rem",
                            textTransform: "uppercase",
                            padding: "0.15rem 0.4rem",
                            borderRadius: "4px",
                            background:
                              hook.event === "pre_tool_use"
                                ? "rgba(239, 68, 68, 0.15)"
                                : hook.event === "post_tool_use"
                                ? "rgba(168, 85, 247, 0.15)"
                                : "rgba(14, 165, 233, 0.15)",
                            color:
                              hook.event === "pre_tool_use"
                                ? "#f87171"
                                : hook.event === "post_tool_use"
                                ? "#c084fc"
                                : "#38bdf8",
                            fontWeight: 600,
                            letterSpacing: "0.05em",
                          }}
                        >
                          {hook.event}
                        </span>
                        <h3
                          style={{
                            margin: "0.4rem 0 0.2rem 0",
                            fontSize: "1rem",
                            fontWeight: 600,
                            color: hook.enabled ? "#f1f5f9" : "#64748b",
                          }}
                        >
                          {hook.name}
                        </h3>
                        <span style={{ fontSize: "0.75rem", color: "#64748b", fontFamily: "monospace" }}>
                          #{hook.id} • Pri: {hook.priority ?? 100}
                        </span>
                      </div>

                      {/* Real-time Toggle */}
                      <label
                        style={{
                          position: "relative",
                          display: "inline-block",
                          width: "40px",
                          height: "22px",
                          cursor: "pointer",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={hook.enabled}
                          onChange={() => handleToggle(hook.id, hook.enabled)}
                          style={{ opacity: 0, width: 0, height: 0 }}
                        />
                        <span
                          style={{
                            position: "absolute",
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            backgroundColor: hook.enabled ? "#0ea5e9" : "#334155",
                            borderRadius: "22px",
                            transition: "0.2s",
                          }}
                        >
                          <span
                            style={{
                              position: "absolute",
                              content: "",
                              height: "16px",
                              width: "16px",
                              left: hook.enabled ? "20px" : "3px",
                              bottom: "3px",
                              backgroundColor: "white",
                              borderRadius: "50%",
                              transition: "0.2s",
                            }}
                          />
                        </span>
                      </label>
                    </div>

                    <p
                      style={{
                        margin: "0.6rem 0",
                        fontSize: "0.8rem",
                        color: "#94a3b8",
                        lineHeight: 1.4,
                      }}
                    >
                      {hook.description || "No description provided."}
                    </p>

                    {diagnosticsByHook.get(hook.id) ? (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.35rem",
                          marginBottom: "0.5rem",
                          color: diagnosticsByHook.get(hook.id)?.runtimeReady
                            ? "#4ade80"
                            : hook.enabled
                              ? "#fbbf24"
                              : "#94a3b8",
                          fontSize: "0.72rem",
                          fontWeight: 600,
                        }}
                        title={diagnosticsByHook.get(hook.id)?.issues.join(" · ") || undefined}
                      >
                        {diagnosticsByHook.get(hook.id)?.runtimeReady ? (
                          <ShieldCheck size={13} />
                        ) : (
                          <AlertTriangle size={13} />
                        )}
                        {diagnosticsByHook.get(hook.id)?.runtimeReady
                          ? "Runtime ready"
                          : hook.enabled
                            ? "Desired enabled · runtime not verified"
                            : "Desired disabled"}
                      </div>
                    ) : null}

                    {hook.matcher && (
                      <div
                        style={{
                          fontSize: "0.75rem",
                          background: "rgba(15, 23, 42, 0.6)",
                          padding: "0.25rem 0.5rem",
                          borderRadius: "4px",
                          color: "#cbd5e1",
                          fontFamily: "monospace",
                          marginBottom: "0.5rem",
                          wordBreak: "break-all",
                        }}
                      >
                        Matcher: {hook.matcher}
                      </div>
                    )}
                  </div>

                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      borderTop: "1px solid rgba(51, 65, 85, 0.4)",
                      paddingTop: "0.5rem",
                      marginTop: "0.5rem",
                    }}
                  >
                    <span style={{ fontSize: "0.7rem", color: "#64748b" }}>
                      Target: {hook.handler.target || hook.handler.command || "script"}
                    </span>
                    {!hook.metadata?.system && (
                      <button
                        type="button"
                        onClick={() => handleRemoveHook(hook.id)}
                        style={{
                          background: "transparent",
                          border: "none",
                          color: "#ef4444",
                          cursor: "pointer",
                          padding: "0.2rem",
                        }}
                        title="Remove Hook"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div
              style={{
                background: "rgba(15, 23, 42, 0.8)",
                borderRadius: "10px",
                border: "1px solid rgba(51, 65, 85, 0.4)",
                overflow: "hidden",
              }}
            >
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                <thead>
                  <tr style={{ background: "rgba(30, 41, 59, 0.6)", borderBottom: "1px solid rgba(51, 65, 85, 0.6)", textAlign: "left", color: "#94a3b8" }}>
                    <th style={{ padding: "0.75rem" }}>Hook / Name</th>
                    <th style={{ padding: "0.75rem" }}>Event</th>
                    <th style={{ padding: "0.75rem" }}>Priority</th>
                    <th style={{ padding: "0.75rem" }}>Matcher</th>
                    <th style={{ padding: "0.75rem" }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredHooks.map((hook) => (
                    <tr key={hook.id} style={{ borderBottom: "1px solid rgba(51, 65, 85, 0.3)" }}>
                      <td style={{ padding: "0.75rem" }}>
                        <div style={{ fontWeight: 600, color: "#f8fafc" }}>{hook.name}</div>
                        <div style={{ fontSize: "0.75rem", color: "#64748b", fontFamily: "monospace" }}>{hook.id}</div>
                      </td>
                      <td style={{ padding: "0.75rem", color: "#38bdf8", fontFamily: "monospace" }}>{hook.event}</td>
                      <td style={{ padding: "0.75rem", color: "#cbd5e1" }}>{hook.priority ?? 100}</td>
                      <td style={{ padding: "0.75rem", color: "#94a3b8", fontFamily: "monospace", fontSize: "0.75rem" }}>
                        {hook.matcher || "*"}
                      </td>
                      <td style={{ padding: "0.75rem" }}>
                        <label style={{ position: "relative", display: "inline-block", width: "36px", height: "20px", cursor: "pointer" }}>
                          <input
                            type="checkbox"
                            checked={hook.enabled}
                            onChange={() => handleToggle(hook.id, hook.enabled)}
                            style={{ opacity: 0, width: 0, height: 0 }}
                          />
                          <span
                            style={{
                              position: "absolute",
                              top: 0,
                              left: 0,
                              right: 0,
                              bottom: 0,
                              backgroundColor: hook.enabled ? "#0ea5e9" : "#334155",
                              borderRadius: "20px",
                              transition: "0.2s",
                            }}
                          >
                            <span
                              style={{
                                position: "absolute",
                                height: "14px",
                                width: "14px",
                                left: hook.enabled ? "19px" : "3px",
                                bottom: "3px",
                                backgroundColor: "white",
                                borderRadius: "50%",
                                transition: "0.2s",
                              }}
                            />
                          </span>
                        </label>
                        {diagnosticsByHook.get(hook.id) ? (
                          <small
                            style={{
                              display: "block",
                              marginTop: "0.25rem",
                              color: diagnosticsByHook.get(hook.id)?.runtimeReady
                                ? "#4ade80"
                                : hook.enabled
                                  ? "#fbbf24"
                                  : "#64748b",
                            }}
                          >
                            {diagnosticsByHook.get(hook.id)?.runtimeReady
                              ? "runtime ready"
                              : hook.enabled
                                ? "not verified"
                                : "desired off"}
                          </small>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right Column: Simulator & Live Security Feed */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          {/* 1-Click Event Simulator Card */}
          <div
            style={{
              background: "linear-gradient(145deg, rgba(15, 23, 42, 0.9), rgba(30, 41, 59, 0.8))",
              borderRadius: "12px",
              border: "1px solid rgba(56, 189, 248, 0.25)",
              padding: "1.25rem",
              boxShadow: "0 8px 24px rgba(0, 0, 0, 0.25)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <Zap size={20} style={{ color: "#38bdf8" }} />
                <h2 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 600, color: "#f8fafc" }}>
                  1-Click Hook Event Simulator
                </h2>
              </div>
              {simLatency !== null && (
                <span
                  style={{
                    fontSize: "0.75rem",
                    padding: "0.2rem 0.5rem",
                    borderRadius: "4px",
                    background: simLatency < 200 ? "rgba(34, 197, 94, 0.15)" : "rgba(234, 179, 8, 0.15)",
                    color: simLatency < 200 ? "#4ade80" : "#facc15",
                    fontWeight: 600,
                  }}
                >
                  <Clock size={12} style={{ display: "inline", marginRight: "3px" }} />
                  {simLatency}ms
                </span>
              )}
            </div>

            {/* Presets Bar */}
            <div style={{ marginBottom: "0.75rem" }}>
              <span style={{ fontSize: "0.75rem", color: "#94a3b8", display: "block", marginBottom: "0.4rem" }}>
                Attack & Test Presets:
              </span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
                {presets.map((preset) => (
                  <button
                    key={preset.name}
                    type="button"
                    onClick={() => {
                      setSimEvent(preset.event);
                      setSimPayloadJson(JSON.stringify(preset.payload, null, 2));
                    }}
                    style={{
                      fontSize: "0.72rem",
                      padding: "0.25rem 0.5rem",
                      borderRadius: "6px",
                      background: "rgba(51, 65, 85, 0.6)",
                      color: "#cbd5e1",
                      border: "1px solid rgba(100, 116, 139, 0.3)",
                      cursor: "pointer",
                    }}
                  >
                    {preset.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Event & Payload input */}
            <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem" }}>
              <select
                value={simEvent}
                onChange={(e) => setSimEvent(e.target.value)}
                style={{
                  background: "rgba(15, 23, 42, 0.8)",
                  color: "#38bdf8",
                  border: "1px solid rgba(71, 85, 105, 0.4)",
                  borderRadius: "6px",
                  padding: "0.35rem 0.6rem",
                  fontSize: "0.8rem",
                  fontFamily: "monospace",
                }}
              >
                <option value="pre_tool_use">pre_tool_use</option>
                <option value="post_tool_use">post_tool_use</option>
                <option value="on_test_run">on_test_run</option>
                <option value="session_stop">session_stop</option>
              </select>

              <button
                type="button"
                onClick={handleRunSimulation}
                disabled={simulating}
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "0.4rem",
                  background: "linear-gradient(135deg, #0284c7, #0369a1)",
                  color: "white",
                  border: "none",
                  borderRadius: "6px",
                  fontWeight: 600,
                  fontSize: "0.85rem",
                  cursor: "pointer",
                }}
              >
                <Play size={14} />
                {simulating ? "Simulating..." : "Trigger Simulation"}
              </button>
            </div>

            <textarea
              value={simPayloadJson}
              onChange={(e) => setSimPayloadJson(e.target.value)}
              rows={4}
              style={{
                width: "100%",
                background: "rgba(10, 15, 30, 0.9)",
                color: "#e2e8f0",
                fontFamily: "monospace",
                fontSize: "0.75rem",
                borderRadius: "6px",
                border: "1px solid rgba(71, 85, 105, 0.4)",
                padding: "0.5rem",
                boxSizing: "border-box",
                outline: "none",
              }}
            />

            {/* Simulation Result Output */}
            {simResult && (
              <div
                style={{
                  marginTop: "0.75rem",
                  padding: "0.75rem",
                  borderRadius: "8px",
                  background: simResult.allow ? "rgba(34, 197, 94, 0.1)" : "rgba(239, 68, 68, 0.15)",
                  border: simResult.allow ? "1px solid rgba(34, 197, 94, 0.3)" : "1px solid rgba(239, 68, 68, 0.4)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.4rem" }}>
                  {simResult.allow ? (
                    <>
                      <CheckCircle2 size={18} style={{ color: "#4ade80" }} />
                      <span style={{ fontWeight: 700, color: "#4ade80", fontSize: "0.9rem" }}>
                        ALLOWED • Execution Pipeline Continues
                      </span>
                    </>
                  ) : (
                    <>
                      <ShieldAlert size={18} style={{ color: "#f87171" }} />
                      <span style={{ fontWeight: 700, color: "#f87171", fontSize: "0.9rem" }}>
                        HALTED & BLOCKED BY {simResult.blockedBy}
                      </span>
                    </>
                  )}
                </div>

                {!simResult.allow && (
                  <div style={{ fontSize: "0.8rem", color: "#cbd5e1" }}>
                    <p style={{ margin: "0.2rem 0", color: "#fca5a5" }}>
                      <strong>Reason:</strong> {simResult.reason}
                    </p>
                    {simResult.self_correct_hint && (
                      <p style={{ margin: "0.2rem 0", color: "#93c5fd" }}>
                        <strong>Self-Correct Hint:</strong> {simResult.self_correct_hint}
                      </p>
                    )}
                  </div>
                )}

                <div style={{ marginTop: "0.5rem", fontSize: "0.72rem", color: "#64748b" }}>
                  Executed {simResult.executedCount} of {simResult.totalHooks} hooks in pipeline.
                </div>
              </div>
            )}
          </div>

          {/* Live Security & Governance Feed */}
          <div
            style={{
              background: "rgba(15, 23, 42, 0.85)",
              borderRadius: "12px",
              border: "1px solid rgba(51, 65, 85, 0.5)",
              padding: "1.25rem",
              boxShadow: "0 8px 24px rgba(0, 0, 0, 0.2)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <Activity size={18} style={{ color: "#38bdf8" }} />
                <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 600, color: "#f8fafc" }}>
                  Live Security & Governance Feed
                </h3>
              </div>

              <div style={{ display: "flex", gap: "0.25rem" }}>
                {["all", "block", "warn", "sync"].map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setFeedFilter(cat)}
                    style={{
                      fontSize: "0.7rem",
                      padding: "0.15rem 0.4rem",
                      borderRadius: "4px",
                      background: feedFilter === cat ? "rgba(56, 189, 248, 0.2)" : "transparent",
                      color: feedFilter === cat ? "#38bdf8" : "#64748b",
                      border: "none",
                      cursor: "pointer",
                      textTransform: "capitalize",
                    }}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", maxHeight: "360px", overflowY: "auto" }}>
              {filteredFeed.length === 0 ? (
                <div style={{ textAlign: "center", padding: "1.5rem", color: "#64748b", fontSize: "0.8rem" }}>
                  No security events recorded.
                </div>
              ) : (
                filteredFeed.map((ev) => (
                  <div
                    key={ev.id}
                    style={{
                      padding: "0.6rem 0.75rem",
                      borderRadius: "8px",
                      background:
                        ev.type === "block"
                          ? "rgba(239, 68, 68, 0.08)"
                          : ev.type === "warn"
                          ? "rgba(234, 179, 8, 0.08)"
                          : "rgba(51, 65, 85, 0.4)",
                      borderLeft:
                        ev.type === "block"
                          ? "3px solid #ef4444"
                          : ev.type === "warn"
                          ? "3px solid #eab308"
                          : "3px solid #38bdf8",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontWeight: 600, fontSize: "0.8rem", color: ev.type === "block" ? "#f87171" : "#f1f5f9" }}>
                        {ev.hook_name}
                      </span>
                      <span style={{ fontSize: "0.7rem", color: "#64748b" }}>
                        {new Date(ev.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <p style={{ margin: "0.2rem 0", fontSize: "0.75rem", color: "#94a3b8" }}>{ev.details}</p>
                    {ev.reason && (
                      <span style={{ display: "block", fontSize: "0.7rem", color: "#fca5a5" }}>
                        Violation: {ev.reason}
                      </span>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Built-in Hook Catalog Modal */}
      {showCatalogModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0, 0, 0, 0.75)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={() => setShowCatalogModal(false)}
        >
          <div
            style={{
              background: "rgb(15, 23, 42)",
              border: "1px solid rgba(56, 189, 248, 0.3)",
              borderRadius: "12px",
              padding: "1.5rem",
              width: "600px",
              maxWidth: "90vw",
              maxHeight: "80vh",
              overflowY: "auto",
              boxShadow: "0 16px 40px rgba(0, 0, 0, 0.6)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <ShieldCheck size={24} style={{ color: "#38bdf8" }} />
                <h3 style={{ margin: 0, fontSize: "1.2rem", color: "#f8fafc" }}>
                  Built-in Guard Hook Catalog
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowCatalogModal(false)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#94a3b8",
                  cursor: "pointer",
                  fontSize: "1.2rem",
                }}
              >
                ✕
              </button>
            </div>

            <p style={{ margin: "0 0 1rem 0", color: "#94a3b8", fontSize: "0.85rem" }}>
              Add pre-configured zero-dependency guard interceptors to enforce safety, security, and context density budgets.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {BUILTIN_GUARD_HOOKS.map((guard) => {
                const installed = hooks.some((h) => h.id === guard.id);
                return (
                  <div
                    key={guard.id}
                    style={{
                      padding: "0.75rem",
                      borderRadius: "8px",
                      background: "rgba(30, 41, 59, 0.6)",
                      border: "1px solid rgba(71, 85, 105, 0.4)",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, color: "#f1f5f9", fontSize: "0.9rem" }}>
                        {guard.name}
                      </div>
                      <p style={{ margin: "0.2rem 0", fontSize: "0.78rem", color: "#94a3b8" }}>
                        {guard.description}
                      </p>
                      <span style={{ fontSize: "0.7rem", color: "#38bdf8", fontFamily: "monospace" }}>
                        {guard.event} • priority {guard.priority}
                      </span>
                    </div>

                    <button
                      type="button"
                      disabled={installed}
                      onClick={() => handleAddBuiltin(guard)}
                      style={{
                        padding: "0.4rem 0.8rem",
                        borderRadius: "6px",
                        background: installed ? "rgba(51, 65, 85, 0.4)" : "linear-gradient(135deg, #0ea5e9, #0284c7)",
                        color: installed ? "#64748b" : "white",
                        border: "none",
                        fontSize: "0.8rem",
                        fontWeight: 600,
                        cursor: installed ? "default" : "pointer",
                      }}
                    >
                      {installed ? "Installed" : "Add Guard"}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
