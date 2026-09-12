import { useMemo, useState } from "react";
import {
  Check,
  ChevronDown,
  CircleCheck,
  Copy,
  Eye,
  FileText,
  Layers3,
  LoaderCircle,
  RefreshCcw,
} from "lucide-react";
import { FilterToolbar, type InvocationFilterMode, type ViewMode } from "./FilterToolbar";
import {
  DeliveryPathIndicator,
  InvocationBadge,
  ProjectStatusPill,
  ProviderBadge,
  calculateProjectStatus,
  getProviderInfo,
  resolveDeliveryPath,
} from "../visual-identity";
import type {
  ApplyProgress,
  Assignment,
  DisplaySkill,
  RemoteComparison,
  RemoteHistory,
  RemotePreset,
  Scope,
} from "../types";
import type { SharedBindingImpact } from "../project-resolution";

export function ProjectSkillGrid({
  skills,
  providerId = "antigravity",
  onSkillStateChange,
  updatingSkillId,
  disabled = false,
}: {
  skills: DisplaySkill[];
  providerId?: string;
  onSkillStateChange?: (skill: DisplaySkill, state: "enabled" | "disabled" | "inherit") => void;
  updatingSkillId?: string | null;
  disabled?: boolean;
}) {
  if (skills.length === 0) {
    return (
      <div className="review-empty">
        <span>No effective skills match the filter criteria.</span>
      </div>
    );
  }

  return (
    <div
      className="project-skill-grid skill-card-grid"
      role="list"
      aria-label="Effective skills card grid"
    >
      {skills.map((skill) => {
        const invMode = skill.invocation_mode ?? "unspecified";
        return (
          <div
            key={skill.registry_skill_id ?? skill.name}
            className={`skill-card project-skill-card ${skill.enabled ? "enabled" : "disabled"}`}
          >
            <div className="skill-card-header">
              <div className="skill-card-title-group">
                <span className={skill.enabled ? "checkbox checked" : "checkbox"}>
                  {skill.enabled ? <Check size={14} /> : null}
                </span>
                <h3 className="skill-card-title">{skill.name}</h3>
              </div>
              <span className={skill.enabled ? "status enabled" : "status"}>
                {skill.enabled ? "Selected" : "Disabled"}
              </span>
            </div>

            <div className="skill-card-meta">
              <InvocationBadge mode={invMode} showTooltip={true} />
              <ProviderBadge providerId={providerId} showDeliveryPath={false} showTooltip={true} />
              <span className="source-badge">{skill.source}</span>
            </div>

            <div className="skill-card-path-row">
              <span className="path-label">Desired binding path:</span>
              <DeliveryPathIndicator providerId={providerId} skillName={skill.name} showTooltip={true} />
            </div>

            <p className="project-skill-reason">{skill.reason}</p>

            <div className="skill-card-footer">
              <span className="source-detail">
                {skill.override ? "Explicit project override" : skill.source === "Pristine" ? "Managed baseline" : "Pinned template"}
              </span>
              {onSkillStateChange && skill.lineage_id && skill.registry_skill_id ? (
                <div className="skill-state-actions">
                  <button
                    type="button"
                    className="quiet-action"
                    disabled={disabled || updatingSkillId === skill.registry_skill_id}
                    onClick={() => onSkillStateChange(skill, skill.enabled ? "disabled" : "enabled")}
                  >
                    {skill.enabled ? "Disable" : "Enable"}
                  </button>
                  {skill.override ? (
                    <button
                      type="button"
                      className="quiet-action"
                      disabled={disabled || updatingSkillId === skill.registry_skill_id}
                      onClick={() => onSkillStateChange(skill, "inherit")}
                    >
                      Use template
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function SkillTable({
  skills,
  providerId = "antigravity",
  onSkillStateChange,
  updatingSkillId,
  disabled = false,
}: {
  skills: DisplaySkill[];
  providerId?: string;
  onSkillStateChange?: (skill: DisplaySkill, state: "enabled" | "disabled" | "inherit") => void;
  updatingSkillId?: string | null;
  disabled?: boolean;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [invocationFilter, setInvocationFilter] = useState<InvocationFilterMode>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("table");

  const filteredSkills = useMemo(() => {
    return skills.filter((skill) => {
      // 1. Invocation mode filter
      if (invocationFilter !== "all") {
        const mode = skill.invocation_mode ?? "unspecified";
        if (mode !== invocationFilter) return false;
      }

      // 2. Keyword search
      const needle = searchQuery.trim().toLowerCase();
      if (!needle) return true;

      const bindingPath = resolveDeliveryPath(providerId, skill.name).toLowerCase();

      return (
        skill.name.toLowerCase().includes(needle) ||
        skill.source.toLowerCase().includes(needle) ||
        skill.reason.toLowerCase().includes(needle) ||
        bindingPath.includes(needle)
      );
    });
  }, [skills, invocationFilter, searchQuery, providerId]);

  return (
    <div className="effective-skills-container">
      <FilterToolbar
        invocationMode={invocationFilter}
        onInvocationModeChange={setInvocationFilter}
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        totalCount={skills.length}
        filteredCount={filteredSkills.length}
        entityName="effective skills"
        showInvocationChips={true}
        showProviderFilter={false}
        showViewToggle={true}
        searchPlaceholder="Filter effective skills or delivery paths..."
      />

      {viewMode === "grid" ? (
        <ProjectSkillGrid
          skills={filteredSkills}
          providerId={providerId}
          onSkillStateChange={onSkillStateChange}
          updatingSkillId={updatingSkillId}
          disabled={disabled}
        />
      ) : (
        <section className="skill-table" aria-labelledby="effective-set-title">
          <div className="table-head">
            <span>Skill</span>
            <span>Status</span>
            <span>Delivery Path</span>
            <span>Source</span>
            <span>Reason</span>
            <span aria-hidden="true" />
          </div>
          {filteredSkills.length === 0 ? (
            <div className="review-empty">
              <span>No effective skills match the filter criteria.</span>
            </div>
          ) : (
            filteredSkills.map((skill) => (
              <article className="skill-row" key={skill.registry_skill_id ?? skill.name}>
                <div className="skill-name">
                  <span className={skill.enabled ? "checkbox checked" : "checkbox"}>
                    {skill.enabled ? <Check size={16} /> : null}
                  </span>
                  <div className="skill-name-cell">
                    <strong>{skill.name}</strong>
                    <InvocationBadge mode={skill.invocation_mode} showTooltip={true} />
                  </div>
                </div>
                <span className={skill.enabled ? "status enabled" : "status"}>
                  {skill.enabled ? "Selected" : "Disabled"}
                </span>
                <div className="delivery-cell">
                  <DeliveryPathIndicator providerId={providerId} skillName={skill.name} showTooltip={true} />
                </div>
                <div className="source">
                  <strong>{skill.source}</strong>
                  <small>
                    {skill.override ? "Explicit project override" : skill.source === "Pristine" ? "Managed baseline" : "Pinned template"}
                  </small>
                </div>
                <span className="reason">{skill.reason}</span>
                {onSkillStateChange && skill.lineage_id && skill.registry_skill_id ? (
                  <div className="skill-state-actions">
                    <button
                      type="button"
                      className="quiet-action"
                      disabled={disabled || updatingSkillId === skill.registry_skill_id}
                      onClick={() => onSkillStateChange(skill, skill.enabled ? "disabled" : "enabled")}
                    >
                      {skill.enabled ? "Disable" : "Enable"}
                    </button>
                    {skill.override ? (
                      <button
                        type="button"
                        className="quiet-action"
                        disabled={disabled || updatingSkillId === skill.registry_skill_id}
                        onClick={() => onSkillStateChange(skill, "inherit")}
                      >
                        Inherit
                      </button>
                    ) : null}
                  </div>
                ) : <ChevronDown size={20} className="row-chevron" aria-hidden="true" />}
              </article>
            ))
          )}
        </section>
      )}
    </div>
  );
}

export function ApplyProgressView({ progress }: { progress: ApplyProgress | null }) {
  if (!progress) return null;
  const stageBase: Record<string, number> = {
    inspect: 5,
    resolve: 18,
    preview: 42,
    apply: 62,
    verify: 92,
    completed: 100,
    failed: 100,
  };
  const base = stageBase[progress.stage] ?? 0;
  const percent =
    progress.stage === "completed" || progress.stage === "failed"
      ? 100
      : Math.min(
          98,
          Math.round(base + (progress.total ? (progress.completed / progress.total) * 18 : 0)),
        );
  return (
    <div className="apply-progress" role="status" aria-live="polite">
      <div>
        <span>{progress.stage.replaceAll("_", " ")}</span>
        <strong>{percent}%</strong>
      </div>
      <p>{progress.message}</p>
      <div className="progress-track">
        <span
          className={progress.stage === "failed" ? "progress-fill drift" : "progress-fill"}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

export function TemplateInspector({
  scope,
  pristine,
  defaultTemplate,
  defaultPresetId,
  presets,
  appliedOverlays,
  overlayPresetId,
  providerId = "antigravity",
  onPristine,
  onDefaultTemplate,
  onOverlayTemplate,
  onPreview,
  onApply,
  onCopyPrompt,
  previewing,
  applying,
  applyProgress,
  copyingPrompt,
  updatingDefault,
  updatingOverlay,
  planReady,
  pending = false,
  controlsDisabled = false,
  sharedImpacts = [],
  requiresSharedConfirmation = false,
  sharedConsent = false,
  onSharedConsentChange,
}: {
  scope: Scope;
  pristine: boolean;
  defaultTemplate: string;
  defaultPresetId: string | null;
  presets: RemotePreset[];
  appliedOverlays: Assignment[];
  overlayPresetId: string | null;
  providerId?: string;
  onPristine: () => void;
  onDefaultTemplate: (presetId: string) => void;
  onOverlayTemplate: (presetId: string) => void;
  onPreview: () => void;
  onApply: () => void;
  onCopyPrompt: () => void;
  previewing: boolean;
  applying: boolean;
  applyProgress: ApplyProgress | null;
  copyingPrompt: boolean;
  updatingDefault: boolean;
  updatingOverlay: boolean;
  planReady: boolean;
  pending?: boolean;
  controlsDisabled?: boolean;
  sharedImpacts?: SharedBindingImpact[];
  requiresSharedConfirmation?: boolean;
  sharedConsent?: boolean;
  onSharedConsentChange?: (consent: boolean) => void;
}) {
  const overlays = pristine ? [] : appliedOverlays;
  const providerMeta = getProviderInfo(providerId);

  return (
    <aside className="inspector" aria-label="Project policy">
      <div className="inspector-section">
        <div className="section-label-row">
          <p className="section-label">Pinned default template</p>
          <ProviderBadge providerId={providerId} showDeliveryPath={false} showTooltip={true} />
        </div>
        <div className="template-tile">
          <FileText size={30} strokeWidth={1.4} />
          <div>
            <strong>{pending ? "Resolving project policy…" : pristine ? "Pristine" : defaultTemplate}</strong>
            <small>{pending ? "Waiting for the selected project and scope" : pristine ? "Clean managed baseline" : "Default template · pinned"}</small>
          </div>
          <Check size={20} className="mint" />
        </div>
        {presets.length > 0 ? (
          <label className="template-picker">
            <span>Set as project default</span>
            <select
              value={defaultPresetId ?? ""}
              disabled={pending || controlsDisabled || updatingDefault}
              onChange={(event) => onDefaultTemplate(event.target.value)}
            >
              {presets.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.name} · v{preset.selected_version}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
      <div className="inspector-section overlay-section">
        <p className="section-label">Matching work-scope overlays ({overlays.length})</p>
        {overlays.length > 0 ? (
          <div role="list" aria-label="Applied work-scope overlays">
            {overlays.map((overlay, index) => (
              <div className="template-tile overlay-tile" role="listitem" key={`${overlay.preset_id}:${overlay.template_version}:${index}`}>
                <Layers3 size={30} strokeWidth={1.4} />
                <div>
                  <strong>{overlay.name ?? overlay.preset_id} · v{overlay.template_version}</strong>
                  <small>Priority {overlay.priority ?? 0} · {overlay.work_scope_tags?.join(", ") || "All scopes"}</small>
                </div>
                <Eye size={20} className="mint" />
              </div>
            ))}
            <p className="project-skill-reason">Applied in shown order. Higher priority selects the revision when overlays include the same skill. Each skill shows its final selection source.</p>
          </div>
        ) : (
          <div className="template-tile overlay-tile inactive">
            <Layers3 size={30} strokeWidth={1.4} />
            <div><strong>{pending ? "Loading…" : "None"}</strong><small>{pending ? "Waiting for resolved overlays" : "No matching overlay"}</small></div>
          </div>
        )}
        {presets.length > 0 ? (
          <label className="template-picker">
            <span>Replace overlays tagged only {scope}</span>
            <select
              value={overlayPresetId ?? ""}
              disabled={pending || controlsDisabled || updatingOverlay}
              onChange={(event) => onOverlayTemplate(event.target.value)}
            >
              <option value="">No scope-only overlay</option>
              {presets
                .filter((preset) => preset.id !== "builtin-pristine")
                .map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.name} · v{preset.selected_version}
                  </option>
                ))}
            </select>
          </label>
        ) : null}
      </div>
      <div className="provenance">
        <p className="section-label">Resolution & Delivery Target</p>
        <div>
          <span>Provider</span>
          <strong>{providerMeta.displayName} ({providerMeta.alias})</strong>
        </div>
        <div>
          <span>Delivery root</span>
          <code className="delivery-root-code">{providerMeta.deliveryRootRelative}/</code>
        </div>
        <div>
          <span>Default source</span>
          <strong>{pristine ? "Pristine" : defaultTemplate}</strong>
        </div>
        <div>
          <span>Overlay sources</span>
          <strong>{overlays.length > 0 ? overlays.map((overlay) => `${overlay.name ?? overlay.preset_id} (P${overlay.priority ?? 0})`).join(", ") : "None"}</strong>
        </div>
      </div>
      <div className="inspector-actions">
        {(requiresSharedConfirmation || sharedImpacts.length > 0) && (
          <section aria-label="Shared delivery impact review">
            <p className="section-label">Delivery impacts</p>
            <ul>
              {sharedImpacts.map((impact) => (
                <li key={JSON.stringify([impact.provider_id, impact.root_path ?? null])}>
                  <strong>{impact.display_name} ({impact.provider_id})</strong>
                  {impact.root_path ? <div><code>{impact.root_path}</code></div> : null}
                  <small>{impact.shared ? "Shared binding" : "Provider binding"}{impact.reason ? ` · ${impact.reason}` : ""}</small>
                </li>
              ))}
            </ul>
            {requiresSharedConfirmation && (
              <>
                <label>
                  <input type="checkbox" checked={sharedConsent}
                    disabled={pending || controlsDisabled || previewing || sharedImpacts.length === 0}
                    onChange={(event) => onSharedConsentChange?.(event.target.checked)} />
                  I reviewed these shared effects and consent to a new preview with shared-root confirmation.
                </label>
                <p>{sharedImpacts.length === 0
                  ? "Impact details are unavailable. Create a new preview to inspect them before confirming."
                  : !planReady
                    ? "Create a new preview after confirming. The existing immutable plan remains unchanged."
                    : "The previewed plan records this shared-root confirmation."}</p>
              </>
            )}
          </section>
        )}
        <button
          className="primary-action"
          type="button"
          onClick={onPreview}
          disabled={pending || controlsDisabled || previewing}
        >
          {previewing ? <LoaderCircle size={21} className="spin" /> : <Eye size={21} />}{" "}
          {previewing ? "Resolving plan…" : sharedConsent ? "Preview with shared confirmation" : "Preview activation plan"}
        </button>
        <button
          className="quiet-action apply-action"
          type="button"
          onClick={onApply}
          disabled={pending || controlsDisabled || applying || previewing || !planReady || (requiresSharedConfirmation && !sharedConsent)}
        >
          {applying ? <LoaderCircle size={17} className="spin" /> : <Check size={17} />}{" "}
          {applying ? "Applying through CLI…" : planReady ? "Apply previewed plan" : "Preview required before apply"}
        </button>
        <ApplyProgressView progress={applyProgress} />
        <button
          className="quiet-action prompt-copy"
          type="button"
          onClick={onCopyPrompt}
          disabled={pending || controlsDisabled || copyingPrompt}
        >
          {copyingPrompt ? <LoaderCircle size={17} className="spin" /> : <Copy size={17} />}{" "}
          {copyingPrompt ? "Preparing prompt…" : "Copy system prompt"}
        </button>
        <button className="quiet-action" type="button" onClick={onPristine} disabled={pending || controlsDisabled}>
          <RefreshCcw size={17} /> {pristine ? "Restore project template" : "Return to Pristine"}
        </button>
        <p>
          Preview records one immutable plan and checks every upstream binding. Apply can run
          only that exact plan. Copy never changes a delivery path.
        </p>
      </div>
    </aside>
  );
}

export function PlanHistory({
  scope,
  pristine,
  previewing,
  skills,
  defaultTemplate,
  remote,
  history,
  comparison,
  providerId = "antigravity",
  onViewDetails,
}: {
  scope: Scope;
  pristine: boolean;
  previewing: boolean;
  skills: DisplaySkill[];
  defaultTemplate: string;
  remote: boolean;
  history: RemoteHistory | null;
  comparison: RemoteComparison | null;
  providerId?: string;
  onViewDetails?: () => void;
}) {
  const enabledCount = skills.filter((skill) => skill.enabled).length;
  const report = history?.reports.at(-1);
  const applied = report?.report.summary?.applied ?? enabledCount;

  const statusState = calculateProjectStatus({
    pristine,
    pinnedPresetId: pristine ? "builtin-pristine" : undefined,
    comparison,
    history,
  });

  const progress = previewing
    ? "2 / 3 resolving"
    : statusState.state === "drift"
      ? `Observed drift (${statusState.driftCount})`
      : statusState.state === "insync"
        ? "Observed in sync"
        : statusState.state === "pristine"
          ? "Pristine baseline"
          : report
            ? `${applied} applied`
            : "3 / 3 resolved";

  const observationDetail = comparison
    ? comparison.in_sync
      ? `Provider ${comparison.provider_id || providerId} matches the pinned plan`
      : Object.entries(comparison.summary)
          .filter(([status]) => status !== "matched")
          .map(([status, count]) => `${count} ${status}`)
          .join(" · ")
    : null;

  return (
    <section className="history-strip" aria-labelledby="history-title">
      <div className="history-title">
        <h2 id="history-title">Recent activation plans</h2>
        <div className="history-badges-group">
          <ProviderBadge providerId={providerId} showDeliveryPath={false} showTooltip={true} />
          <ProjectStatusPill status={statusState} showTooltip={true} />
          <span>{remote ? "Catalog bridge connected" : "Demo data"}</span>
        </div>
      </div>
      <div className="history-row">
        <CircleCheck size={30} className="mint" />
        <div className="history-name">
          <strong>
            {history
              ? `${history.mode} · ${history.plan_id.slice(0, 8)}`
              : pristine
                ? "Pristine baseline"
                : `${scope} · ${defaultTemplate}`}
          </strong>
          <small>
            {observationDetail ??
              (report
                ? `Adapter report: ${report.status}`
                : "Plan is ready for Skills Manager delivery")}
          </small>
        </div>
        <div className="history-progress">
          <strong className={statusState.state === "drift" ? "drift" : ""}>{progress}</strong>
          <small>
            {enabledCount} enabled · {skills.length - enabledCount} disabled
          </small>
        </div>
        <div className="progress-track" aria-label={progress}>
          <div
            className={statusState.state === "drift" ? "progress-fill drift" : "progress-fill"}
            style={{
              width: previewing
                ? "54%"
                : statusState.state === "drift"
                  ? "68%"
                  : "100%",
            }}
          />
        </div>
        <button
          className="details-button"
          type="button"
          onClick={onViewDetails}
          aria-label="View plan details and diagnostics"
        >
          View details
        </button>
        <ChevronDown size={20} className="row-chevron" aria-hidden="true" />
      </div>
    </section>
  );
}
