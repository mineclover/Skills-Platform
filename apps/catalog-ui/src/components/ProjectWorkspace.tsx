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
import type {
  ApplyProgress,
  DisplaySkill,
  RemoteComparison,
  RemoteHistory,
  RemotePreset,
  Scope,
} from "../types";

export function SkillTable({ skills }: { skills: DisplaySkill[] }) {
  return (
    <section className="skill-table" aria-labelledby="effective-set-title">
      <div className="table-head">
        <span>Skill</span>
        <span>Status</span>
        <span>Source</span>
        <span>Reason</span>
        <span aria-hidden="true" />
      </div>
      {skills.map((skill) => (
        <article className="skill-row" key={skill.name}>
          <div className="skill-name">
            <span className={skill.enabled ? "checkbox checked" : "checkbox"}>
              {skill.enabled ? <Check size={16} /> : null}
            </span>
            <div className="skill-name-cell">
              <strong>{skill.name}</strong>
              {skill.invocation_mode && skill.invocation_mode !== "unspecified" ? (
                <span className={`invocation-pill ${skill.invocation_mode === "user_invoked" ? "user" : skill.invocation_mode === "model_invoked" ? "model" : "hybrid"}`}>
                  {skill.invocation_mode === "user_invoked" ? "👤 User" : skill.invocation_mode === "model_invoked" ? "🤖 Model" : "🔀 Hybrid"}
                </span>
              ) : null}
            </div>
          </div>
          <span className={skill.enabled ? "status enabled" : "status"}>
            {skill.enabled ? "Selected" : "Disabled"}
          </span>
          <div className="source">
            <strong>{skill.source}</strong>
            <small>{skill.source === "Pristine" ? "Managed baseline" : "Pinned template"}</small>
          </div>
          <span className="reason">{skill.reason}</span>
          <ChevronDown size={20} className="row-chevron" aria-hidden="true" />
        </article>
      ))}
    </section>
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
  overlayTemplate,
  overlayPresetId,
  overlayActive,
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
}: {
  scope: Scope;
  pristine: boolean;
  defaultTemplate: string;
  defaultPresetId: string | null;
  presets: RemotePreset[];
  overlayTemplate: string;
  overlayPresetId: string | null;
  overlayActive: boolean;
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
}) {
  const overlayShown = overlayActive && !pristine;
  return (
    <aside className="inspector" aria-label="Project policy">
      <div className="inspector-section">
        <p className="section-label">Pinned default template</p>
        <div className="template-tile">
          <FileText size={30} strokeWidth={1.4} />
          <div>
            <strong>{pristine ? "Pristine" : defaultTemplate}</strong>
            <small>{pristine ? "Clean managed baseline" : "Default template · pinned"}</small>
          </div>
          <Check size={20} className="mint" />
        </div>
        {presets.length > 0 ? (
          <label className="template-picker">
            <span>Set as project default</span>
            <select
              value={defaultPresetId ?? ""}
              disabled={updatingDefault}
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
        <p className="section-label">Work-scope overlay</p>
        <div
          className={
            overlayShown && overlayTemplate !== "None"
              ? "template-tile overlay-tile"
              : "template-tile overlay-tile inactive"
          }
        >
          <Layers3 size={30} strokeWidth={1.4} />
          <div>
            <strong>{overlayTemplate}</strong>
            <small>
              {overlayShown && overlayTemplate !== "None"
                ? "Matches selected work scope"
                : "No matching overlay"}
            </small>
          </div>
          <Eye
            size={20}
            className={overlayShown && overlayTemplate !== "None" ? "mint" : "muted"}
          />
        </div>
        {presets.length > 0 ? (
          <label className="template-picker">
            <span>Set overlay for {scope}</span>
            <select
              value={overlayPresetId ?? ""}
              disabled={updatingOverlay}
              onChange={(event) => onOverlayTemplate(event.target.value)}
            >
              <option value="">No overlay</option>
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
        <p className="section-label">Resolution</p>
        <div>
          <span>Default source</span>
          <strong>{pristine ? "Pristine" : defaultTemplate}</strong>
        </div>
        <div>
          <span>Overlay source</span>
          <strong>{overlayShown ? overlayTemplate : "None"}</strong>
        </div>
      </div>
      <div className="inspector-actions">
        <button
          className="primary-action"
          type="button"
          onClick={onPreview}
          disabled={previewing}
        >
          {previewing ? <LoaderCircle size={21} className="spin" /> : <Eye size={21} />}{" "}
          {previewing ? "Resolving plan…" : "Preview activation plan"}
        </button>
        <button
          className="quiet-action apply-action"
          type="button"
          onClick={onApply}
          disabled={applying || previewing}
        >
          {applying ? <LoaderCircle size={17} className="spin" /> : <Check size={17} />}{" "}
          {applying ? "Applying through CLI…" : "Apply through Skills Manager CLI"}
        </button>
        <ApplyProgressView progress={applyProgress} />
        <button
          className="quiet-action prompt-copy"
          type="button"
          onClick={onCopyPrompt}
          disabled={copyingPrompt}
        >
          {copyingPrompt ? <LoaderCircle size={17} className="spin" /> : <Copy size={17} />}{" "}
          {copyingPrompt ? "Preparing prompt…" : "Copy system prompt"}
        </button>
        <button className="quiet-action" type="button" onClick={onPristine}>
          <RefreshCcw size={17} /> {pristine ? "Restore project template" : "Return to Pristine"}
        </button>
        <p>
          Apply records the immutable plan, previews every upstream binding, then runs the
          confirmed Skills Manager CLI command. Copy never changes a delivery path.
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
}: {
  scope: Scope;
  pristine: boolean;
  previewing: boolean;
  skills: DisplaySkill[];
  defaultTemplate: string;
  remote: boolean;
  history: RemoteHistory | null;
  comparison: RemoteComparison | null;
}) {
  const enabledCount = skills.filter((skill) => skill.enabled).length;
  const report = history?.reports.at(-1);
  const applied = report?.report.summary?.applied ?? enabledCount;
  const progress = previewing
    ? "2 / 3 resolving"
    : comparison
      ? comparison.in_sync
        ? "Observed in sync"
        : "Observed drift"
      : report
        ? `${applied} applied`
        : "3 / 3 resolved";
  const observationDetail = comparison
    ? comparison.in_sync
      ? `Provider ${comparison.provider_id} matches the pinned plan`
      : Object.entries(comparison.summary)
          .filter(([status]) => status !== "matched")
          .map(([status, count]) => `${count} ${status}`)
          .join(" · ")
    : null;
  return (
    <section className="history-strip" aria-labelledby="history-title">
      <div className="history-title">
        <h2 id="history-title">Recent activation plans</h2>
        <span>{remote ? "Catalog bridge connected" : "Demo data"}</span>
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
          <strong className={comparison && !comparison.in_sync ? "drift" : ""}>{progress}</strong>
          <small>
            {enabledCount} enabled · {skills.length - enabledCount} disabled
          </small>
        </div>
        <div className="progress-track" aria-label={progress}>
          <div
            className={comparison && !comparison.in_sync ? "progress-fill drift" : "progress-fill"}
            style={{
              width: previewing
                ? "54%"
                : comparison && !comparison.in_sync
                  ? "68%"
                  : "100%",
            }}
          />
        </div>
        <button className="details-button" type="button">
          View details
        </button>
        <ChevronDown size={20} className="row-chevron" aria-hidden="true" />
      </div>
    </section>
  );
}
