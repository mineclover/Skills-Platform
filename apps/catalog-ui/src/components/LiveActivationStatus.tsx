import { LoaderCircle, RefreshCcw } from "lucide-react";
import type { UpstreamStatus } from "../types";

function statusCopy(status: UpstreamStatus | null, loading: boolean, error: string | null) {
  if (loading) return "Refreshing Skills Manager…";
  if (error) return "Skills Manager unavailable";
  if (!status) return "Not inspected yet";
  return `${status.summary.enabled} enabled · ${status.summary.total} bindings`;
}

export function LiveStatusCard({
  label,
  status,
  loading,
  error,
}: {
  label: string;
  status: UpstreamStatus | null;
  loading: boolean;
  error: string | null;
}) {
  const detectedProviders =
    status?.inventory.providers.filter((provider) => provider.detected) ?? [];
  return (
    <article className="live-status-card">
      <div className="live-status-heading">
        <div>
          <strong>{label}</strong>
          <small>{statusCopy(status, loading, error)}</small>
        </div>
        <span
          className={
            error
              ? "live-chip problem"
              : status?.summary.enabled
                ? "live-chip active"
                : "live-chip"
          }
        >
          {error
            ? "Unavailable"
            : loading
              ? "Checking"
              : status?.summary.enabled
                ? "Active"
                : "No active skills"}
        </span>
      </div>
      {error ? (
        <p className="live-status-error">{error}</p>
      ) : status ? (
        <>
          <div className="live-status-summary">
            <span>
              <strong>{status.summary.enabled}</strong> enabled
            </span>
            <span>
              <strong>{status.summary.disabled}</strong> disabled
            </span>
            <span>
              <strong>
                {status.summary.missing + status.summary.conflict + status.summary.unavailable}
              </strong>{" "}
              attention
            </span>
          </div>
          <p className="live-provider-line">
            {detectedProviders.length
              ? `Providers: ${detectedProviders
                  .map(
                    (provider) =>
                      `${provider.display_name ?? provider.provider_id} (${
                        provider.enabled_count ?? 0
                      } enabled)`,
                  )
                  .join(" · ")}`
              : "No detected provider"}
          </p>
          <div className="live-binding-list" aria-label={`${label} bindings`}>
            {status.bindings.length === 0 ? (
              <span className="live-empty">No managed bindings reported.</span>
            ) : (
              status.bindings.map((binding) => (
                <div
                  className="live-binding"
                  key={`${binding.provider_id}:${binding.scope}:${binding.skill_instance_id}:${
                    binding.target_path ?? ""
                  }`}
                >
                  <div>
                    <strong>{binding.skill_instance_id}</strong>
                    <small>
                      {binding.provider_id} · {binding.scope}
                    </small>
                  </div>
                  <span className={`binding-state ${binding.state}`}>{binding.state}</span>
                </div>
              ))
            )}
          </div>
          <small className="live-checked">
            Read-only check · {new Date(status.checked_at).toLocaleString()}
          </small>
        </>
      ) : (
        <p className="live-empty">
          Connect the Catalog bridge to inspect the current Skills Manager state.
        </p>
      )}
    </article>
  );
}

export function LiveActivationStatus({
  globalStatus,
  projectStatus,
  loading,
  error,
  onRefresh,
}: {
  globalStatus: UpstreamStatus | null;
  projectStatus: UpstreamStatus | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}) {
  const projectLabel = projectStatus?.manager_project_id
    ? `Selected project · ${projectStatus.manager_project_id}`
    : "Selected project";
  return (
    <section className="live-status" aria-labelledby="live-status-title">
      <div className="live-status-title">
        <div>
          <h2 id="live-status-title">Live Skills Manager status</h2>
          <p>Read-only provider and binding inspection. Catalog policy is not changed.</p>
        </div>
        <button className="live-refresh" type="button" onClick={onRefresh} disabled={loading}>
          {loading ? <LoaderCircle size={16} className="spin" /> : <RefreshCcw size={16} />}{" "}
          {loading ? "Checking…" : "Refresh"}
        </button>
      </div>
      <div className="live-status-grid">
        <LiveStatusCard label="Global activation" status={globalStatus} loading={loading} error={error} />
        <LiveStatusCard label={projectLabel} status={projectStatus} loading={loading} error={error} />
      </div>
    </section>
  );
}
