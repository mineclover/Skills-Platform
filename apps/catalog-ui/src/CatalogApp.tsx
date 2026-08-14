import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, ArrowLeft, Check, ChevronDown, CircleCheck, ClipboardCheck, Copy, Database,
  Eye, FileText, Layers3, LoaderCircle, RefreshCcw, Settings, ShieldCheck,
  Sparkles, X,
} from "lucide-react";

type Scope = "planning" | "implementation" | "review";

type SkillRow = {
  name: string;
  source: string;
  defaultEnabled: boolean;
  overlayEnabled?: boolean;
  defaultReason: string;
  overlayReason?: string;
};

type DisplaySkill = { name: string; source: string; enabled: boolean; reason: string };
type Assignment = { preset_id: string; template_version: number; role: string; name?: string };
type RemoteSet = {
  project: { id: string; name: string };
  assignments: Assignment[];
  skills: Array<{ skill_name: string; desired_state: "enabled" | "disabled"; reason: string; selected_by: { preset_id?: string } | null }>;
};
type RemoteProject = { id: string; name: string };
type RemotePreset = { id: string; name: string; selected_version: number; registry_skill_ids: string[] };
type RemoteAssignment = { preset_id: string; template_version: number; role: string; priority: number; work_scope_tags: string[]; enabled: boolean };
type RegistrySkill = { id: string; skill_name: string; description: string | null; source_revision_id: string };
type RemoteHistory = { plan_id: string; mode: string; recorded_at: string; reports: Array<{ status: string; report: { summary?: Record<string, number> } }> };
type RemoteComparison = { in_sync: boolean; summary: Record<string, number>; captured_at: string; provider_id: string };
type UpstreamProvider = { provider_id: string; display_name?: string; detected: boolean; reachable?: boolean | null; enabled_count?: number; disabled_count?: number; warning?: string | null };
type UpstreamBinding = { artifact_id?: string; skill_instance_id: string; provider_id: string; scope: "global" | "project" | "tool"; state: "enabled" | "disabled" | "missing" | "conflict" | "unavailable"; target_path?: string | null; reason?: string | null };
type UpstreamStatus = {
  source: "skills-manager-inspect";
  checked_at: string;
  scope: "global" | "project";
  manager_project_id: string | null;
  inventory: { providers: UpstreamProvider[] };
  bindings: UpstreamBinding[];
  summary: { total: number; enabled: number; disabled: number; missing: number; conflict: number; unavailable: number };
};
type ReviewReason = { code: string; severity: "critical" | "high" | "medium" | "low"; detail: string };
type ReviewItem = { lineage: { id: string; skill_name: string }; severity: "critical" | "high" | "medium" | "low"; reasons: ReviewReason[]; latest_source_revision_id: string | null };
type SourceReview = { id: string; decision: "approved" | "rejected"; summary: string; reviewer: string; reviewed_at: string };
type SourceAdoptionCandidate = {
  lineage_id: string;
  skill_name: string;
  registry_skill_id: string;
  source_revision_id: string;
  imported_at: string;
  review: SourceReview | null;
  compatible_presets: Array<{ id: string; name: string; selected_version: number; current_registry_skill_id: string; current_source_revision_id: string }>;
};
type CatalogSkill = {
  lineage: { id: string; skill_name: string };
  latest_skill: { id: string; source_revision_id: string; description: string | null } | null;
  profile: {
    title: string;
    summary: string | null;
    purpose: string | null;
    use_when: string[];
    tags: string[];
    review_state: "unreviewed" | "reviewed" | "deprecated";
    risk_level: string;
  };
  notes: Array<{ id: string }>;
};
type SkillFeedback = { id: string; outcome: string; evidence_type: string; summary: string; created_at: string };
type FeedbackSummary = {
  health: "unknown" | "healthy" | "needs_review";
  total_feedback: number;
  success_rate: number | null;
  by_outcome: Record<string, number>;
  latest_feedback_at: string | null;
};
type ApplyProgress = { stage: string; completed: number; total: number; message: string };
type ApplyResult = { status: string; report: { summary: { applied: number; skipped: number; failed: number } }; error?: string };

const catalogApi = import.meta.env.VITE_CATALOG_API?.replace(/\/$/, "") ?? "";

const navigation = [
  { label: "Skills", icon: Database },
  { label: "Templates", icon: FileText },
  { label: "Projects", icon: ClipboardCheck },
];

const skillRows: SkillRow[] = [
  { name: "Planning", source: "Build v2", defaultEnabled: true, defaultReason: "Default inclusion in Build v2" },
  { name: "Testing", source: "Verification v1", defaultEnabled: false, overlayEnabled: true, defaultReason: "Not included by Build v2", overlayReason: "Verification overlay includes Testing" },
  { name: "UI Design", source: "Build v2", defaultEnabled: false, defaultReason: "Not included by Build v2" },
];

const demoReviewQueue: ReviewItem[] = [
  { lineage: { id: "lineage_testing", skill_name: "Testing" }, severity: "medium", latest_source_revision_id: "revision_demo", reasons: [{ code: "unevaluated_current_revision", severity: "medium", detail: "The latest source revision has no recorded active-case evaluation." }] },
  { lineage: { id: "lineage_ui", skill_name: "UI Design" }, severity: "low", latest_source_revision_id: "revision_demo", reasons: [{ code: "unreviewed_profile", severity: "medium", detail: "The skill profile has not been reviewed." }] },
];

function statusFor(row: SkillRow, scope: Scope, pristine: boolean) {
  if (pristine) return { enabled: false, reason: "Pristine baseline disables managed skills", source: "Pristine" };
  const overlayActive = scope === "implementation" && row.overlayEnabled === true;
  if (overlayActive) return { enabled: true, reason: row.overlayReason!, source: "Verification v1" };
  return { enabled: row.defaultEnabled, reason: row.defaultReason, source: row.source };
}

function sampleSkills(scope: Scope, pristine: boolean): DisplaySkill[] {
  return skillRows.map((row) => {
    const status = statusFor(row, scope, pristine);
    return { name: row.name, source: status.source, enabled: status.enabled, reason: status.reason };
  });
}

function presetName(assignments: Assignment[], role: string, fallback: string) {
  return assignments.find((assignment) => assignment.role === role)?.name ?? fallback;
}

async function copyText(content: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(content);
    return;
  }
  const area = document.createElement("textarea");
  area.value = content;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.append(area);
  area.select();
  const copied = document.execCommand("copy");
  area.remove();
  if (!copied) throw new Error("The browser did not allow copying to the clipboard");
}

async function readApplyStream(response: Response, onProgress: (progress: ApplyProgress) => void) {
  if (!response.ok || !response.body) throw new Error("Skills Manager progress stream was unavailable");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: ApplyResult | null = null;
  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const event = JSON.parse(line) as { type: "progress" | "result" | "error"; progress?: ApplyProgress; result?: ApplyResult; error?: string };
      if (event.type === "progress" && event.progress) onProgress(event.progress);
      if (event.type === "result" && event.result) result = event.result;
      if (event.type === "error") throw new Error(event.error ?? "Skills Manager apply failed");
    }
    if (done) break;
  }
  if (!result) throw new Error("Skills Manager did not return an apply result");
  return result;
}

function AppIcon({ icon: Icon, active }: { icon: typeof Database; active?: boolean }) {
  return <Icon aria-hidden="true" size={21} strokeWidth={1.7} className={active ? "nav-icon active" : "nav-icon"} />;
}

function SideNavigation({ activePage, onNavigate }: { activePage: string; onNavigate: (page: string) => void }) {
  return (
    <aside className="sidebar">
      <div className="brand-mark" aria-label="Skills Catalog"><Sparkles size={20} strokeWidth={2} /></div>
      <nav aria-label="Catalog navigation" className="navigation">
        {navigation.map(({ label, icon }) => {
          const active = label === activePage;
          return <button className={active ? "nav-item selected" : "nav-item"} key={label} type="button" onClick={() => onNavigate(label)}><AppIcon icon={icon} active={active} /><span>{label}</span></button>;
        })}
      </nav>
      <button className="nav-item settings" type="button"><AppIcon icon={Settings} /><span>Settings</span></button>
    </aside>
  );
}

function SkillWorkspace({ skills, selectedLineageId, onSelect, onSave, saving, feedback, feedbackSummary, loadingEvidence, recordingFeedback, onRecordFeedback }: {
  skills: CatalogSkill[];
  selectedLineageId: string | null;
  onSelect: (lineageId: string) => void;
  onSave: (lineageId: string, patch: { purpose: string | null; use_when: string[]; review_state: "unreviewed" | "reviewed" | "deprecated" }) => void;
  saving: boolean;
  feedback: SkillFeedback[];
  feedbackSummary: FeedbackSummary | null;
  loadingEvidence: boolean;
  recordingFeedback: boolean;
  onRecordFeedback: (lineageId: string, patch: { outcome: string; evidence_type: string; summary: string }) => void;
}) {
  const [query, setQuery] = useState("");
  const selected = skills.find((skill) => skill.lineage.id === selectedLineageId) ?? skills[0] ?? null;
  const [purpose, setPurpose] = useState("");
  const [useWhen, setUseWhen] = useState("");
  const [reviewState, setReviewState] = useState<"unreviewed" | "reviewed" | "deprecated">("unreviewed");
  const [feedbackOutcome, setFeedbackOutcome] = useState("success");
  const [feedbackEvidence, setFeedbackEvidence] = useState("manual");
  const [feedbackText, setFeedbackText] = useState("");
  useEffect(() => {
    setPurpose(selected?.profile.purpose ?? "");
    setUseWhen(selected?.profile.use_when.join(", ") ?? "");
    setReviewState(selected?.profile.review_state ?? "unreviewed");
  }, [selected?.lineage.id, selected?.profile.purpose, selected?.profile.review_state, selected?.profile.use_when]);
  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return skills;
    return skills.filter((skill) => [skill.lineage.skill_name, skill.profile.summary, skill.profile.purpose, ...skill.profile.tags].filter(Boolean).join(" ").toLocaleLowerCase().includes(needle));
  }, [query, skills]);
  return <section className="skills-workspace">
    <header className="template-header skills-header"><div><h1>Skills</h1><p>Manage immutable revisions, intended use, and review state. Templates only compose these managed skills.</p></div><label className="skill-search"><span className="sr-only">Search skills</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search skills" /></label></header>
    {skills.length === 0 ? <div className="review-empty"><AlertTriangle size={22} className="review-icon" /><span>No managed skill is registered yet.</span></div> : <div className="skills-manager-layout">
      <div className="managed-skill-list" aria-label="Managed skills">{visible.map((skill) => <button type="button" key={skill.lineage.id} className={skill.lineage.id === selected?.lineage.id ? "managed-skill selected" : "managed-skill"} onClick={() => onSelect(skill.lineage.id)}><span className={skill.profile.review_state === "reviewed" ? "skill-health reviewed" : "skill-health"} /><span><strong>{skill.profile.title || skill.lineage.skill_name}</strong><small>{skill.latest_skill?.description ?? "No current revision description"}</small></span><em>{skill.profile.review_state.replaceAll("_", " ")}</em></button>)}</div>
      {selected ? <div className="skill-detail-panel"><form className="skill-detail" onSubmit={(event) => { event.preventDefault(); onSave(selected.lineage.id, { purpose: purpose.trim() || null, use_when: useWhen.split(",").map((item) => item.trim()).filter(Boolean), review_state: reviewState }); }}>
        <div className="skill-detail-heading"><div><p className="section-label">Immutable skill</p><h2>{selected.profile.title || selected.lineage.skill_name}</h2><p>{selected.latest_skill?.description ?? "No description is available for the latest revision."}</p></div><span className={`review-decision ${reviewState}`}>{reviewState}</span></div>
        <dl className="skill-facts"><div><dt>Lineage</dt><dd>{selected.lineage.id}</dd></div><div><dt>Latest revision</dt><dd>{selected.latest_skill?.source_revision_id.slice(0, 12) ?? "Unavailable"}</dd></div><div><dt>Notes</dt><dd>{selected.notes.length}</dd></div><div><dt>Risk</dt><dd>{selected.profile.risk_level}</dd></div></dl>
        <label className="template-field">Purpose<textarea value={purpose} onChange={(event) => setPurpose(event.target.value)} placeholder="What this skill is intended to accomplish" /></label>
        <label className="template-field">Use when <input value={useWhen} onChange={(event) => setUseWhen(event.target.value)} placeholder="Before implementation, during review" /><small>Separate conditions with commas.</small></label>
        <label className="template-field">Review state<select value={reviewState} onChange={(event) => setReviewState(event.target.value as typeof reviewState)}><option value="unreviewed">Unreviewed</option><option value="reviewed">Reviewed</option><option value="deprecated">Deprecated</option></select></label>
        <button className="primary-action skill-save" type="submit" disabled={saving}>{saving ? <LoaderCircle size={20} className="spin" /> : <Check size={20} />}{saving ? "Saving skill…" : "Save skill profile"}</button>
      </form><section className="skill-feedback"><div className="skill-feedback-heading"><div><p className="section-label">Feedback health</p><strong>{loadingEvidence ? "Loading evidence…" : feedbackSummary?.health.replaceAll("_", " ") ?? "Unknown"}</strong><small>{feedbackSummary ? `${feedbackSummary.total_feedback} records${feedbackSummary.success_rate === null ? "" : ` · ${Math.round(feedbackSummary.success_rate * 100)}% success`}` : "No feedback recorded"}</small></div><span className={`review-decision ${feedbackSummary?.health ?? "unknown"}`}>{feedbackSummary?.health ?? "unknown"}</span></div><form className="feedback-form" onSubmit={(event) => { event.preventDefault(); if (!feedbackText.trim()) return; onRecordFeedback(selected.lineage.id, { outcome: feedbackOutcome, evidence_type: feedbackEvidence, summary: feedbackText.trim() }); setFeedbackText(""); }}><label className="template-field">Outcome<select value={feedbackOutcome} onChange={(event) => setFeedbackOutcome(event.target.value)}><option value="success">Success</option><option value="correction">Correction</option><option value="scope_mismatch">Scope mismatch</option><option value="freshness">Freshness</option><option value="risk">Risk</option><option value="neutral">Neutral</option></select></label><label className="template-field">Evidence<select value={feedbackEvidence} onChange={(event) => setFeedbackEvidence(event.target.value)}><option value="manual">Manual</option><option value="evaluation">Evaluation</option><option value="activation_report">Activation report</option><option value="user_feedback">User feedback</option><option value="incident">Incident</option></select></label><label className="template-field feedback-summary-field">Summary<input value={feedbackText} onChange={(event) => setFeedbackText(event.target.value)} placeholder="What happened and what should be retained" /></label><button className="quiet-action feedback-save" type="submit" disabled={recordingFeedback || !feedbackText.trim()}>{recordingFeedback ? <LoaderCircle size={16} className="spin" /> : <Check size={16} />}{recordingFeedback ? "Recording…" : "Record feedback"}</button></form>{feedback.length ? <div className="feedback-history">{feedback.slice(0, 3).map((item) => <div key={item.id}><span>{item.outcome.replaceAll("_", " ")}</span><p>{item.summary}</p><small>{item.evidence_type.replaceAll("_", " ")}</small></div>)}</div> : null}</section></div> : null}
    </div>}
  </section>;
}

function TemplateWorkspace({ presets, skills, selectedTemplateId, onSelectTemplate, onSave, onCreate, saving }: {
  presets: RemotePreset[];
  skills: RegistrySkill[];
  selectedTemplateId: string | null;
  onSelectTemplate: (id: string) => void;
  onSave: (presetId: string, skillIds: string[]) => void;
  onCreate: (id: string, name: string, skillIds: string[]) => Promise<boolean>;
  saving: boolean;
}) {
  const template = presets.find((item) => item.id === selectedTemplateId) ?? presets.find((item) => item.id !== "builtin-pristine") ?? null;
  const [selectedSkillIds, setSelectedSkillIds] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [newTemplateId, setNewTemplateId] = useState("");
  const [newTemplateName, setNewTemplateName] = useState("");
  useEffect(() => { if (!creating) setSelectedSkillIds(template?.registry_skill_ids ?? []); }, [creating, template?.id, template?.selected_version]);
  const toggleSkill = useCallback((skillId: string) => setSelectedSkillIds((current) => current.includes(skillId) ? current.filter((id) => id !== skillId) : [...current, skillId]), []);
  const editable = creating || (template !== null && template.id !== "builtin-pristine");
  const beginCreate = () => { setCreating(true); setNewTemplateId(""); setNewTemplateName(""); setSelectedSkillIds([]); };
  const cancelCreate = () => { setCreating(false); setSelectedSkillIds(template?.registry_skill_ids ?? []); };
  return <section className="template-workspace">
    <header className="template-header"><div><h1>Templates</h1><p>Versioned skill membership. Saving creates a new template version; project pins stay unchanged.</p></div>{creating ? <button className="quiet-action template-new" type="button" onClick={cancelCreate}>Cancel</button> : <div className="template-header-actions"><label className="template-picker"><span>Template</span><select value={template?.id ?? ""} onChange={(event) => onSelectTemplate(event.target.value)}>{presets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name} · v{preset.selected_version}</option>)}</select></label><button className="quiet-action template-new" type="button" onClick={beginCreate}>New template</button></div>}</header>
    {!template && !creating ? <div className="review-empty"><AlertTriangle size={22} className="review-icon" /><span>No editable template is registered.</span></div> : <div className="template-editor"><div className="template-editor-summary"><FileText size={25} className="mint" /><div>{creating ? <><label className="template-field">Template ID<input value={newTemplateId} onChange={(event) => setNewTemplateId(event.target.value)} placeholder="frontend-review" /></label><label className="template-field">Template name<input value={newTemplateName} onChange={(event) => setNewTemplateName(event.target.value)} placeholder="Frontend review" /></label></> : <><strong>{template!.name}</strong><small>{editable ? `${selectedSkillIds.length} selected skill${selectedSkillIds.length === 1 ? "" : "s"} · next save creates v${template!.selected_version + 1}` : "Pristine intentionally contains no managed skills"}</small></>}</div></div><div className="template-skill-list">{skills.map((skill) => { const selected = selectedSkillIds.includes(skill.id); return <label className={selected ? "template-skill selected" : "template-skill"} key={skill.id}><input type="checkbox" checked={selected} disabled={!editable || saving} onChange={() => toggleSkill(skill.id)} /><div><strong>{skill.skill_name}</strong><small>{skill.description ?? `Revision ${skill.source_revision_id.slice(0, 12)}`}</small></div><span>{selected ? "Included" : "Available"}</span></label>; })}</div>{editable ? <button className="primary-action template-save" type="button" disabled={saving || selectedSkillIds.length === 0 || (creating && (!newTemplateId.trim() || !newTemplateName.trim()))} onClick={() => { if (creating) onCreate(newTemplateId, newTemplateName, selectedSkillIds).then((created) => { if (created) setCreating(false); }); else onSave(template!.id, selectedSkillIds); }}>{saving ? <LoaderCircle size={20} className="spin" /> : <Check size={20} />} {saving ? "Saving template…" : creating ? "Create template v1" : `Save template v${template!.selected_version + 1}`}</button> : null}</div>}
  </section>;
}

function SkillTable({ skills }: { skills: DisplaySkill[] }) {
  return (
    <section className="skill-table" aria-labelledby="effective-set-title">
      <div className="table-head"><span>Skill</span><span>Status</span><span>Source</span><span>Reason</span><span aria-hidden="true" /></div>
      {skills.map((skill) => {
        return (
          <article className="skill-row" key={skill.name}>
            <div className="skill-name"><span className={skill.enabled ? "checkbox checked" : "checkbox"}>{skill.enabled ? <Check size={16} /> : null}</span><strong>{skill.name}</strong></div>
            <span className={skill.enabled ? "status enabled" : "status"}>{skill.enabled ? "Selected" : "Disabled"}</span>
            <div className="source"><strong>{skill.source}</strong><small>{skill.source === "Pristine" ? "Managed baseline" : "Pinned template"}</small></div>
            <span className="reason">{skill.reason}</span>
            <ChevronDown size={20} className="row-chevron" aria-hidden="true" />
          </article>
        );
      })}
    </section>
  );
}

function ApplyProgressView({ progress }: { progress: ApplyProgress | null }) {
  if (!progress) return null;
  const stageBase: Record<string, number> = { inspect: 5, resolve: 18, preview: 42, apply: 62, verify: 92, completed: 100, failed: 100 };
  const base = stageBase[progress.stage] ?? 0;
  const percent = progress.stage === "completed" || progress.stage === "failed" ? 100 : Math.min(98, Math.round(base + (progress.total ? (progress.completed / progress.total) * 18 : 0)));
  return <div className="apply-progress" role="status" aria-live="polite"><div><span>{progress.stage.replaceAll("_", " ")}</span><strong>{percent}%</strong></div><p>{progress.message}</p><div className="progress-track"><span className={progress.stage === "failed" ? "progress-fill drift" : "progress-fill"} style={{ width: `${percent}%` }} /></div></div>;
}

function TemplateInspector({ scope, pristine, defaultTemplate, defaultPresetId, presets, overlayTemplate, overlayPresetId, overlayActive, onPristine, onDefaultTemplate, onOverlayTemplate, onPreview, onApply, onCopyPrompt, previewing, applying, applyProgress, copyingPrompt, updatingDefault, updatingOverlay }: {
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
        <div className="template-tile"><FileText size={30} strokeWidth={1.4} /><div><strong>{pristine ? "Pristine" : defaultTemplate}</strong><small>{pristine ? "Clean managed baseline" : "Default template · pinned"}</small></div><Check size={20} className="mint" /></div>
        {presets.length > 0 ? <label className="template-picker"><span>Set as project default</span><select value={defaultPresetId ?? ""} disabled={updatingDefault} onChange={(event) => onDefaultTemplate(event.target.value)}>{presets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name} · v{preset.selected_version}</option>)}</select></label> : null}
      </div>
      <div className="inspector-section overlay-section">
        <p className="section-label">Work-scope overlay</p>
        <div className={overlayShown && overlayTemplate !== "None" ? "template-tile overlay-tile" : "template-tile overlay-tile inactive"}><Layers3 size={30} strokeWidth={1.4} /><div><strong>{overlayTemplate}</strong><small>{overlayShown && overlayTemplate !== "None" ? "Matches selected work scope" : "No matching overlay"}</small></div><Eye size={20} className={overlayShown && overlayTemplate !== "None" ? "mint" : "muted"} /></div>
        {presets.length > 0 ? <label className="template-picker"><span>Set overlay for {scope}</span><select value={overlayPresetId ?? ""} disabled={updatingOverlay} onChange={(event) => onOverlayTemplate(event.target.value)}><option value="">No overlay</option>{presets.filter((preset) => preset.id !== "builtin-pristine").map((preset) => <option key={preset.id} value={preset.id}>{preset.name} · v{preset.selected_version}</option>)}</select></label> : null}
      </div>
      <div className="provenance">
        <p className="section-label">Resolution</p>
        <div><span>Default source</span><strong>{pristine ? "Pristine" : defaultTemplate}</strong></div>
        <div><span>Overlay source</span><strong>{overlayShown ? overlayTemplate : "None"}</strong></div>
      </div>
      <div className="inspector-actions">
        <button className="primary-action" type="button" onClick={onPreview} disabled={previewing}>
          {previewing ? <LoaderCircle size={21} className="spin" /> : <Eye size={21} />} {previewing ? "Resolving plan…" : "Preview activation plan"}
        </button>
        <button className="quiet-action apply-action" type="button" onClick={onApply} disabled={applying || previewing}>
          {applying ? <LoaderCircle size={17} className="spin" /> : <Check size={17} />} {applying ? "Applying through CLI…" : "Apply through Skills Manager CLI"}
        </button>
        <ApplyProgressView progress={applyProgress} />
        <button className="quiet-action prompt-copy" type="button" onClick={onCopyPrompt} disabled={copyingPrompt}>
          {copyingPrompt ? <LoaderCircle size={17} className="spin" /> : <Copy size={17} />} {copyingPrompt ? "Preparing prompt…" : "Copy system prompt"}
        </button>
        <button className="quiet-action" type="button" onClick={onPristine}><RefreshCcw size={17} /> {pristine ? "Restore project template" : "Return to Pristine"}</button>
        <p>Apply records the immutable plan, previews every upstream binding, then runs the confirmed Skills Manager CLI command. Copy never changes a delivery path.</p>
      </div>
    </aside>
  );
}

function PlanHistory({ scope, pristine, previewing, skills, defaultTemplate, remote, history, comparison }: { scope: Scope; pristine: boolean; previewing: boolean; skills: DisplaySkill[]; defaultTemplate: string; remote: boolean; history: RemoteHistory | null; comparison: RemoteComparison | null }) {
  const enabledCount = skills.filter((skill) => skill.enabled).length;
  const report = history?.reports.at(-1);
  const applied = report?.report.summary?.applied ?? enabledCount;
  const progress = previewing ? "2 / 3 resolving" : comparison ? (comparison.in_sync ? "Observed in sync" : "Observed drift") : report ? `${applied} applied` : "3 / 3 resolved";
  const observationDetail = comparison ? (comparison.in_sync ? `Provider ${comparison.provider_id} matches the pinned plan` : Object.entries(comparison.summary).filter(([status]) => status !== "matched").map(([status, count]) => `${count} ${status}`).join(" · ")) : null;
  return (
    <section className="history-strip" aria-labelledby="history-title">
      <div className="history-title"><h2 id="history-title">Recent activation plans</h2><span>{remote ? "Catalog bridge connected" : "Demo data"}</span></div>
      <div className="history-row">
        <CircleCheck size={30} className="mint" /><div className="history-name"><strong>{history ? `${history.mode} · ${history.plan_id.slice(0, 8)}` : pristine ? "Pristine baseline" : `${scope} · ${defaultTemplate}`}</strong><small>{observationDetail ?? (report ? `Adapter report: ${report.status}` : "Plan is ready for Skills Manager delivery")}</small></div>
        <div className="history-progress"><strong className={comparison && !comparison.in_sync ? "drift" : ""}>{progress}</strong><small>{enabledCount} enabled · {skills.length - enabledCount} disabled</small></div>
        <div className="progress-track" aria-label={progress}><div className={comparison && !comparison.in_sync ? "progress-fill drift" : "progress-fill"} style={{ width: previewing ? "54%" : comparison && !comparison.in_sync ? "68%" : "100%" }} /></div>
        <button className="details-button" type="button">View details</button><ChevronDown size={20} className="row-chevron" aria-hidden="true" />
      </div>
    </section>
  );
}

function statusCopy(status: UpstreamStatus | null, loading: boolean, error: string | null) {
  if (loading) return "Refreshing Skills Manager…";
  if (error) return "Skills Manager unavailable";
  if (!status) return "Not inspected yet";
  return `${status.summary.enabled} enabled · ${status.summary.total} bindings`;
}

function LiveStatusCard({ label, status, loading, error }: { label: string; status: UpstreamStatus | null; loading: boolean; error: string | null }) {
  const detectedProviders = status?.inventory.providers.filter((provider) => provider.detected) ?? [];
  return <article className="live-status-card">
    <div className="live-status-heading"><div><strong>{label}</strong><small>{statusCopy(status, loading, error)}</small></div><span className={error ? "live-chip problem" : status?.summary.enabled ? "live-chip active" : "live-chip"}>{error ? "Unavailable" : loading ? "Checking" : status?.summary.enabled ? "Active" : "No active skills"}</span></div>
    {error ? <p className="live-status-error">{error}</p> : status ? <>
      <div className="live-status-summary"><span><strong>{status.summary.enabled}</strong> enabled</span><span><strong>{status.summary.disabled}</strong> disabled</span><span><strong>{status.summary.missing + status.summary.conflict + status.summary.unavailable}</strong> attention</span></div>
      <p className="live-provider-line">{detectedProviders.length ? `Providers: ${detectedProviders.map((provider) => `${provider.display_name ?? provider.provider_id} (${provider.enabled_count ?? 0} enabled)`).join(" · ")}` : "No detected provider"}</p>
      <div className="live-binding-list" aria-label={`${label} bindings`}>
        {status.bindings.length === 0 ? <span className="live-empty">No managed bindings reported.</span> : status.bindings.map((binding) => <div className="live-binding" key={`${binding.provider_id}:${binding.scope}:${binding.skill_instance_id}:${binding.target_path ?? ""}`}><div><strong>{binding.skill_instance_id}</strong><small>{binding.provider_id} · {binding.scope}</small></div><span className={`binding-state ${binding.state}`}>{binding.state}</span></div>)}
      </div>
      <small className="live-checked">Read-only check · {new Date(status.checked_at).toLocaleString()}</small>
    </> : <p className="live-empty">Connect the Catalog bridge to inspect the current Skills Manager state.</p>}
  </article>;
}

function LiveActivationStatus({ globalStatus, projectStatus, loading, error, onRefresh }: { globalStatus: UpstreamStatus | null; projectStatus: UpstreamStatus | null; loading: boolean; error: string | null; onRefresh: () => void }) {
  const projectLabel = projectStatus?.manager_project_id ? `Selected project · ${projectStatus.manager_project_id}` : "Selected project";
  return <section className="live-status" aria-labelledby="live-status-title">
    <div className="live-status-title"><div><h2 id="live-status-title">Live Skills Manager status</h2><p>Read-only provider and binding inspection. Catalog policy is not changed.</p></div><button className="live-refresh" type="button" onClick={onRefresh} disabled={loading}>{loading ? <LoaderCircle size={16} className="spin" /> : <RefreshCcw size={16} />} {loading ? "Checking…" : "Refresh"}</button></div>
    <div className="live-status-grid"><LiveStatusCard label="Global activation" status={globalStatus} loading={loading} error={error} /><LiveStatusCard label={projectLabel} status={projectStatus} loading={loading} error={error} /></div>
  </section>;
}

function ReviewQueue({ items, remote }: { items: ReviewItem[]; remote: boolean }) {
  const queue = remote ? items : demoReviewQueue;
  return (
    <section className="review-queue" aria-labelledby="review-queue-title">
      <div className="review-title"><div><h2 id="review-queue-title">Review queue</h2><p>Evidence that needs a human decision. No policy is changed automatically.</p></div><span>{queue.length} open</span></div>
      {queue.length === 0 ? <div className="review-empty"><CircleCheck size={22} className="mint" /><span>No current review signals.</span></div> : <div className="review-list">{queue.map((item) => <article className="review-row" key={item.lineage.id}><AlertTriangle size={21} className={`review-icon ${item.severity}`} /><div className="review-skill"><strong>{item.lineage.skill_name}</strong><small>{item.latest_source_revision_id ? `Pinned revision · ${item.latest_source_revision_id.slice(0, 12)}` : "No source revision recorded"}</small></div><div className="review-reasons">{item.reasons.map((reason) => <span key={reason.code} title={reason.detail}>{reason.code.replaceAll("_", " ")}</span>)}</div><span className={`severity ${item.severity}`}>{item.severity}</span><ChevronDown size={20} className="row-chevron" aria-hidden="true" /></article>)}</div>}
    </section>
  );
}

function SourceChangeQueue({ candidates, summaries, actionId, onSummaryChange, onReview, onAdopt }: {
  candidates: SourceAdoptionCandidate[];
  summaries: Record<string, string>;
  actionId: string | null;
  onSummaryChange: (sourceRevisionId: string, summary: string) => void;
  onReview: (candidate: SourceAdoptionCandidate, decision: "approved" | "rejected") => void;
  onAdopt: (candidate: SourceAdoptionCandidate, presetId: string) => void;
}) {
  return (
    <section className="source-changes" aria-labelledby="source-changes-title">
      <div className="review-title"><div><h2 id="source-changes-title">Source change decisions</h2><p>Imported revisions stay isolated until reviewed, then create a new template version only when adopted.</p></div><span>{candidates.length} candidate{candidates.length === 1 ? "" : "s"}</span></div>
      {candidates.length === 0 ? <div className="review-empty"><CircleCheck size={22} className="mint" /><span>No imported revision is waiting to replace a pinned template skill.</span></div> : <div className="source-change-list">{candidates.map((candidate) => {
        const busy = actionId === candidate.source_revision_id || actionId?.startsWith(`${candidate.registry_skill_id}:`) === true;
        const approved = candidate.review?.decision === "approved";
        return <article className="source-change" key={candidate.registry_skill_id}>
          <div className="source-change-heading"><Database size={21} className="mint" /><div><strong>{candidate.skill_name}</strong><small>Candidate {candidate.source_revision_id.slice(0, 12)} · imported {new Date(candidate.imported_at).toLocaleDateString()}</small></div><span className={candidate.review ? `review-decision ${candidate.review.decision}` : "review-decision pending"}>{candidate.review?.decision ?? "needs review"}</span></div>
          {candidate.review ? <p className="review-summary">{candidate.review.summary}</p> : <label className="review-summary-input"><span>Decision note</span><input value={summaries[candidate.source_revision_id] ?? ""} onChange={(event) => onSummaryChange(candidate.source_revision_id, event.target.value)} placeholder="What changed and why this decision is safe" /></label>}
          {!candidate.review ? <div className="source-actions"><button className="source-button approve" type="button" disabled={busy} onClick={() => onReview(candidate, "approved")}>{busy ? "Saving…" : "Approve revision"}</button><button className="source-button reject" type="button" disabled={busy} onClick={() => onReview(candidate, "rejected")}>Reject</button></div> : null}
          <div className="compatible-presets"><span>Can replace</span>{candidate.compatible_presets.map((preset) => <div key={preset.id} className="compatible-preset"><div><strong>{preset.name}</strong><small>Current template v{preset.selected_version} · pinned revision {preset.current_source_revision_id.slice(0, 10)}</small></div>{approved ? <button className="adopt-button" type="button" disabled={busy} onClick={() => onAdopt(candidate, preset.id)}>{busy ? "Adopting…" : "Adopt as new version"}</button> : <small className="adopt-hint">Approve before adoption</small>}</div>)}</div>
        </article>;
      })}</div>}
    </section>
  );
}

export function CatalogApp() {
  const [scope, setScope] = useState<Scope>("implementation");
  const [pristine, setPristine] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [copyingPrompt, setCopyingPrompt] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [remoteSet, setRemoteSet] = useState<RemoteSet | null>(null);
  const [remoteError, setRemoteError] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [projects, setProjects] = useState<RemoteProject[]>([]);
  const [presets, setPresets] = useState<RemotePreset[]>([]);
  const [registrySkills, setRegistrySkills] = useState<RegistrySkill[]>([]);
  const [catalogSkills, setCatalogSkills] = useState<CatalogSkill[]>([]);
  const [selectedSkillLineageId, setSelectedSkillLineageId] = useState<string | null>(null);
  const [savingSkillProfile, setSavingSkillProfile] = useState(false);
  const [skillFeedback, setSkillFeedback] = useState<SkillFeedback[]>([]);
  const [feedbackSummary, setFeedbackSummary] = useState<FeedbackSummary | null>(null);
  const [loadingSkillEvidence, setLoadingSkillEvidence] = useState(false);
  const [recordingFeedback, setRecordingFeedback] = useState(false);
  const [projectAssignments, setProjectAssignments] = useState<RemoteAssignment[]>([]);
  const [history, setHistory] = useState<RemoteHistory | null>(null);
  const [comparison, setComparison] = useState<RemoteComparison | null>(null);
  const [reviewItems, setReviewItems] = useState<ReviewItem[]>([]);
  const [sourceCandidates, setSourceCandidates] = useState<SourceAdoptionCandidate[]>([]);
  const [sourceReviewSummaries, setSourceReviewSummaries] = useState<Record<string, string>>({});
  const [sourceActionId, setSourceActionId] = useState<string | null>(null);
  const [updatingDefault, setUpdatingDefault] = useState(false);
  const [updatingOverlay, setUpdatingOverlay] = useState(false);
  const [policyVersion, setPolicyVersion] = useState(0);
  const [activePage, setActivePage] = useState("Projects");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [globalStatus, setGlobalStatus] = useState<UpstreamStatus | null>(null);
  const [projectStatus, setProjectStatus] = useState<UpstreamStatus | null>(null);
  const [loadingLiveStatus, setLoadingLiveStatus] = useState(false);
  const [liveStatusError, setLiveStatusError] = useState<string | null>(null);
  const [applyingPlan, setApplyingPlan] = useState(false);
  const [applyProgress, setApplyProgress] = useState<ApplyProgress | null>(null);

  const refreshSourceCandidates = useCallback(() => {
    if (!catalogApi) return Promise.resolve();
    return fetch(`${catalogApi}/api/source-adoption-candidates`)
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Could not load imported source changes")))
      .then((body: { candidates: SourceAdoptionCandidate[] }) => setSourceCandidates(body.candidates));
  }, []);

  useEffect(() => {
    if (!catalogApi) return;
    let active = true;
    fetch(`${catalogApi}/api/projects`)
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Catalog bridge is unavailable")))
      .then((body: { projects: RemoteProject[] }) => {
        if (!active) return;
        setProjects(body.projects);
        setSelectedProjectId(body.projects[0]?.id ?? null);
        setRemoteError(body.projects.length === 0 ? "No catalog projects are registered." : null);
      })
      .catch((error: Error) => active && setRemoteError(error.message));
    return () => { active = false; };
  }, []);

  const refreshCatalogSkills = useCallback(() => {
    if (!catalogApi) return Promise.resolve();
    return fetch(`${catalogApi}/api/skills`)
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Could not load managed skills")))
      .then((body: { skills: CatalogSkill[] }) => setCatalogSkills(body.skills));
  }, []);

  useEffect(() => { void refreshCatalogSkills().catch(() => setCatalogSkills([])); }, [refreshCatalogSkills]);

  useEffect(() => {
    if (selectedSkillLineageId || catalogSkills.length === 0) return;
    setSelectedSkillLineageId(catalogSkills[0].lineage.id);
  }, [catalogSkills, selectedSkillLineageId]);

  const refreshSkillEvidence = useCallback(() => {
    if (!catalogApi || !selectedSkillLineageId) {
      setSkillFeedback([]);
      setFeedbackSummary(null);
      return Promise.resolve();
    }
    setLoadingSkillEvidence(true);
    return Promise.all([
      fetch(`${catalogApi}/api/skills/${encodeURIComponent(selectedSkillLineageId)}/feedback`).then((response) => response.ok ? response.json() : Promise.reject(new Error("Could not load skill feedback"))),
      fetch(`${catalogApi}/api/skills/${encodeURIComponent(selectedSkillLineageId)}/feedback-summary`).then((response) => response.ok ? response.json() : Promise.reject(new Error("Could not load skill health"))),
    ])
      .then(([feedbackBody, summaryBody]: [{ feedback: SkillFeedback[] }, FeedbackSummary]) => {
        setSkillFeedback(feedbackBody.feedback);
        setFeedbackSummary(summaryBody);
      })
      .catch(() => {
        setSkillFeedback([]);
        setFeedbackSummary(null);
      })
      .finally(() => setLoadingSkillEvidence(false));
  }, [selectedSkillLineageId]);

  useEffect(() => { void refreshSkillEvidence(); }, [refreshSkillEvidence]);

  useEffect(() => {
    if (!catalogApi) return;
    let active = true;
    fetch(`${catalogApi}/api/presets`)
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Could not load catalog templates")))
      .then((body: { presets: RemotePreset[] }) => active && setPresets(body.presets))
      .catch(() => active && setPresets([]));
    return () => { active = false; };
  }, [policyVersion]);

  useEffect(() => {
    if (!catalogApi) return;
    let active = true;
    fetch(`${catalogApi}/api/registry/skills`)
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Could not load registry skills")))
      .then((body: { skills: RegistrySkill[] }) => active && setRegistrySkills(body.skills))
      .catch(() => active && setRegistrySkills([]));
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (selectedTemplateId || presets.length === 0) return;
    setSelectedTemplateId(presets.find((preset) => preset.id !== "builtin-pristine")?.id ?? presets[0].id);
  }, [presets, selectedTemplateId]);

  useEffect(() => {
    if (!catalogApi || !selectedProjectId) return;
    let active = true;
    fetch(`${catalogApi}/api/projects/${encodeURIComponent(selectedProjectId)}/preset-assignments`)
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Could not load project template assignments")))
      .then((body: { assignments: RemoteAssignment[] }) => active && setProjectAssignments(body.assignments))
      .catch(() => active && setProjectAssignments([]));
    return () => { active = false; };
  }, [policyVersion, selectedProjectId]);

  useEffect(() => {
    refreshSourceCandidates().catch(() => setSourceCandidates([]));
  }, [refreshSourceCandidates]);

  useEffect(() => {
    if (!catalogApi) return;
    let active = true;
    fetch(`${catalogApi}/api/review-queue`)
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Could not load review queue")))
      .then((body: { items: ReviewItem[] }) => active && setReviewItems(body.items))
      .catch(() => active && setReviewItems([]));
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!catalogApi || !selectedProjectId) return;
    let active = true;
    const params = new URLSearchParams({ work_scope: scope });
    if (pristine) params.set("preset", "builtin-pristine");
    fetch(`${catalogApi}/api/projects/${encodeURIComponent(selectedProjectId)}/effective-set?${params}`)
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Could not resolve the selected project")))
      .then((body: RemoteSet) => { if (active) { setRemoteSet(body); setRemoteError(null); } })
      .catch((error: Error) => active && setRemoteError(error.message));
    return () => { active = false; };
  }, [scope, pristine, selectedProjectId, policyVersion]);

  useEffect(() => {
    if (!catalogApi || !selectedProjectId) return;
    let active = true;
    fetch(`${catalogApi}/api/projects/${encodeURIComponent(selectedProjectId)}/history`)
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Could not load project history")))
      .then((body: { history: RemoteHistory[] }) => active && setHistory(body.history[0] ?? null))
      .catch(() => active && setHistory(null));
    return () => { active = false; };
  }, [selectedProjectId, notice]);

  useEffect(() => {
    if (!catalogApi || !history?.plan_id) { setComparison(null); return; }
    let active = true;
    fetch(`${catalogApi}/api/activation-plans/${encodeURIComponent(history.plan_id)}/observed-state-comparison`)
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("No observed state is available")))
      .then((body: RemoteComparison) => active && setComparison(body))
      .catch(() => active && setComparison(null));
    return () => { active = false; };
  }, [history?.plan_id]);

  const refreshLiveStatus = useCallback(() => {
    if (!catalogApi) {
      setGlobalStatus(null);
      setProjectStatus(null);
      setLiveStatusError(null);
      return Promise.resolve();
    }
    setLoadingLiveStatus(true);
    setLiveStatusError(null);
    const global = fetch(`${catalogApi}/api/upstream-status`).then((response) => response.ok ? response.json() : Promise.reject(new Error("Could not inspect global Skills Manager activation")));
    const project = selectedProjectId
      ? fetch(`${catalogApi}/api/projects/${encodeURIComponent(selectedProjectId)}/upstream-status`).then((response) => response.ok ? response.json() : Promise.reject(new Error("Could not inspect this project in Skills Manager")))
      : Promise.resolve(null);
    return Promise.all([global, project])
      .then(([globalBody, projectBody]: [{ status: UpstreamStatus }, { status: UpstreamStatus } | null]) => {
        setGlobalStatus(globalBody.status);
        setProjectStatus(projectBody?.status ?? null);
      })
      .catch((error: Error) => setLiveStatusError(error.message))
      .finally(() => setLoadingLiveStatus(false));
  }, [selectedProjectId]);

  useEffect(() => { void refreshLiveStatus(); }, [refreshLiveStatus]);

  const skills = useMemo<DisplaySkill[]>(() => remoteSet
    ? remoteSet.skills.map((skill) => {
      const assignment = remoteSet.assignments.find((item) => item.preset_id === skill.selected_by?.preset_id);
      return { name: skill.skill_name, source: assignment?.name ?? (pristine ? "Pristine" : "Catalog"), enabled: skill.desired_state === "enabled", reason: skill.reason.replaceAll("_", " ") };
    })
    : sampleSkills(scope, pristine), [remoteSet, scope, pristine]);
  const enabledCount = useMemo(() => skills.filter((skill) => skill.enabled).length, [skills]);
  const defaultTemplate = remoteSet ? presetName(remoteSet.assignments, "default", "Pristine") : "Build v2";
  const defaultPresetId = remoteSet?.assignments.find((assignment) => assignment.role === "default")?.preset_id ?? null;
  const overlayTemplate = remoteSet ? presetName(remoteSet.assignments, "work_scope_overlay", "None") : "Verification v1";
  const configuredOverlay = projectAssignments.find((assignment) => assignment.role === "work_scope_overlay" && assignment.enabled && assignment.work_scope_tags.length === 1 && assignment.work_scope_tags[0] === scope) ?? null;
  const overlayPresetId = configuredOverlay?.preset_id ?? null;
  const overlayActive = remoteSet ? overlayTemplate !== "None" : scope === "implementation";

  const togglePristine = useCallback(() => {
    setPristine((current) => !current);
    setNotice(null);
  }, []);
  const updateDefaultTemplate = useCallback((presetId: string) => {
    if (!catalogApi || !selectedProjectId || !presetId) return;
    setUpdatingDefault(true);
    setNotice(null);
    fetch(`${catalogApi}/api/projects/${encodeURIComponent(selectedProjectId)}/default-preset`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ preset_id: presetId }),
    })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Project default template was rejected")))
      .then(() => {
        setPristine(false);
        setPolicyVersion((current) => current + 1);
        const preset = presets.find((item) => item.id === presetId);
        setNotice(`${preset?.name ?? presetId} is now pinned as this project's default template.`);
      })
      .catch((error: Error) => setNotice(error.message))
      .finally(() => setUpdatingDefault(false));
  }, [presets, selectedProjectId]);
  const updateWorkScopeOverlay = useCallback((presetId: string) => {
    if (!catalogApi || !selectedProjectId) return;
    setUpdatingOverlay(true);
    setNotice(null);
    fetch(`${catalogApi}/api/projects/${encodeURIComponent(selectedProjectId)}/work-scope-overlay`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ preset_id: presetId || null, work_scope_tags: [scope] }),
    })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Work-scope overlay was rejected")))
      .then(() => {
        setPolicyVersion((current) => current + 1);
        const preset = presets.find((item) => item.id === presetId);
        setNotice(preset ? `${preset.name} now applies during ${scope}.` : `No template applies during ${scope}.`);
      })
      .catch((error: Error) => setNotice(error.message))
      .finally(() => setUpdatingOverlay(false));
  }, [presets, scope, selectedProjectId]);
  const saveTemplateMembership = useCallback((presetId: string, registrySkillIds: string[]) => {
    if (!catalogApi) return;
    setSavingTemplate(true);
    fetch(`${catalogApi}/api/presets/${encodeURIComponent(presetId)}/update`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ registry_skill_ids: registrySkillIds }),
    })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Template membership was rejected")))
      .then((body: { preset: RemotePreset }) => {
        setPresets((current) => current.map((preset) => preset.id === body.preset.id ? body.preset : preset));
        setSelectedTemplateId(body.preset.id);
        setNotice(`${body.preset.name} v${body.preset.selected_version} saved. Existing project pins were preserved.`);
      })
      .catch((error: Error) => setNotice(error.message))
      .finally(() => setSavingTemplate(false));
  }, []);
  const createTemplate = useCallback((id: string, name: string, registrySkillIds: string[]) => {
    if (!catalogApi) return Promise.resolve(false);
    setSavingTemplate(true);
    return fetch(`${catalogApi}/api/presets`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, name, registry_skill_ids: registrySkillIds }) })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Template creation was rejected")))
      .then((body: { preset: RemotePreset }) => { setPresets((current) => [...current, body.preset]); setSelectedTemplateId(body.preset.id); setNotice(`${body.preset.name} v1 created.`); return true; })
      .catch((error: Error) => { setNotice(error.message); return false; })
      .finally(() => setSavingTemplate(false));
  }, []);
  const saveSkillProfile = useCallback((lineageId: string, patch: { purpose: string | null; use_when: string[]; review_state: "unreviewed" | "reviewed" | "deprecated" }) => {
    if (!catalogApi) return;
    setSavingSkillProfile(true);
    setNotice(null);
    fetch(`${catalogApi}/api/skills/${encodeURIComponent(lineageId)}/profile`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(patch),
    })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Skill profile was rejected")))
      .then(() => refreshCatalogSkills())
      .then(() => setNotice("Skill profile saved. Template membership and provider delivery were not changed."))
      .catch((error: Error) => setNotice(error.message))
      .finally(() => setSavingSkillProfile(false));
  }, [refreshCatalogSkills]);
  const recordSkillFeedback = useCallback((lineageId: string, patch: { outcome: string; evidence_type: string; summary: string }) => {
    if (!catalogApi) return;
    setRecordingFeedback(true);
    fetch(`${catalogApi}/api/skills/${encodeURIComponent(lineageId)}/feedback`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scope: "global", ...patch }),
    })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Feedback was rejected")))
      .then(() => refreshSkillEvidence())
      .then(() => setNotice("Feedback recorded for this skill. Templates and provider bindings were not changed."))
      .catch((error: Error) => setNotice(error.message))
      .finally(() => setRecordingFeedback(false));
  }, [refreshSkillEvidence]);
  const previewPlan = useCallback(() => {
    setPreviewing(true);
    setNotice(null);
    if (catalogApi && selectedProjectId) {
      fetch(`${catalogApi}/api/projects/${encodeURIComponent(selectedProjectId)}/activation-plan/preview`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ work_scope_tags: [scope], preset_id: pristine ? "builtin-pristine" : undefined }),
      })
        .then((response) => response.ok ? response.json() : Promise.reject(new Error("Preview request was rejected")))
        .then((body: { plan: { operations: unknown[] } }) => setNotice(`${body.plan.operations.length} operations were validated. Ready for Skills Manager delivery.`))
        .catch((error: Error) => setNotice(error.message))
        .finally(() => setPreviewing(false));
      return;
    }
    window.setTimeout(() => {
      setPreviewing(false);
      setNotice(`${enabledCount} enabled and ${3 - enabledCount} disabled operations are ready for preview.`);
    }, 620);
  }, [enabledCount, pristine, scope, selectedProjectId]);
  const applyPlan = useCallback(() => {
    if (!catalogApi || !selectedProjectId) {
      setNotice("Connect the local Catalog bridge before applying through Skills Manager CLI.");
      return;
    }
    if (!window.confirm("Apply this immutable plan through Skills Manager CLI? The upstream manager may change provider bindings.")) return;
    setApplyingPlan(true);
    setNotice(null);
    setApplyProgress({ stage: "record", completed: 0, total: 1, message: "Recording the immutable activation plan" });
    fetch(`${catalogApi}/api/projects/${encodeURIComponent(selectedProjectId)}/activation-plan`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ work_scope_tags: [scope], preset_id: pristine ? "builtin-pristine" : undefined }),
    })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Activation plan could not be recorded")))
      .then(async (body: { plan: { plan_id: string; operations: unknown[] } }) => {
        setApplyProgress({ stage: "inspect", completed: 0, total: body.plan.operations.length, message: "Starting Skills Manager preflight" });
        const response = await fetch(`${catalogApi}/api/activation-plans/${encodeURIComponent(body.plan.plan_id)}/apply/stream`, {
          method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ confirmed: true }),
        });
        return readApplyStream(response, setApplyProgress);
      })
      .then((body) => {
        const summary = body.report.summary;
        setNotice(`Skills Manager CLI ${body.status}: ${summary.applied} applied · ${summary.skipped} skipped · ${summary.failed} failed.`);
        void refreshLiveStatus();
      })
      .catch((error: Error) => {
        setApplyProgress({ stage: "failed", completed: 0, total: 0, message: error.message });
        setNotice(error.message);
      })
      .finally(() => setApplyingPlan(false));
  }, [pristine, refreshLiveStatus, scope, selectedProjectId]);
  const copySystemPrompt = useCallback(() => {
    if (!catalogApi || !selectedProjectId) {
      setNotice("Connect the local Catalog bridge before copying a resolved system prompt.");
      return;
    }
    setCopyingPrompt(true);
    setNotice(null);
    const params = new URLSearchParams({ work_scope: scope, include_notes: "true" });
    if (pristine) params.set("preset", "builtin-pristine");
    fetch(`${catalogApi}/api/projects/${encodeURIComponent(selectedProjectId)}/system-prompt?${params}`)
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Could not prepare the system prompt")))
      .then((body: { content: string; included_skill_ids: string[]; skipped_skill_ids: string[] }) => copyText(body.content).then(() => body))
      .then((body) => setNotice(`Copied ${body.included_skill_ids.length} pinned skill prompt${body.included_skill_ids.length === 1 ? "" : "s"}${body.skipped_skill_ids.length ? `; ${body.skipped_skill_ids.length} skipped` : ""}.`))
      .catch((error: Error) => setNotice(error.message))
      .finally(() => setCopyingPrompt(false));
  }, [pristine, scope, selectedProjectId]);
  const updateSourceSummary = useCallback((sourceRevisionId: string, summary: string) => {
    setSourceReviewSummaries((current) => ({ ...current, [sourceRevisionId]: summary }));
  }, []);
  const reviewSourceCandidate = useCallback((candidate: SourceAdoptionCandidate, decision: "approved" | "rejected") => {
    const summary = sourceReviewSummaries[candidate.source_revision_id]?.trim();
    if (!summary) {
      setNotice("Add a decision note before approving or rejecting an imported revision.");
      return;
    }
    setSourceActionId(candidate.source_revision_id);
    fetch(`${catalogApi}/api/source-revisions/${encodeURIComponent(candidate.source_revision_id)}/review`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ decision, summary }),
    })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Source review was rejected")))
      .then(() => refreshSourceCandidates())
      .then(() => setNotice(`Revision ${decision}. It remains isolated until a template adoption is chosen.`))
      .catch((error: Error) => setNotice(error.message))
      .finally(() => setSourceActionId(null));
  }, [refreshSourceCandidates, sourceReviewSummaries]);
  const adoptSourceCandidate = useCallback((candidate: SourceAdoptionCandidate, presetId: string) => {
    setSourceActionId(`${candidate.registry_skill_id}:${presetId}`);
    fetch(`${catalogApi}/api/presets/${encodeURIComponent(presetId)}/adopt`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ registry_skill_id: candidate.registry_skill_id }),
    })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Template adoption was rejected")))
      .then((body: { adoption: { selected_version: number } }) => refreshSourceCandidates().then(() => body.adoption))
      .then((adoption) => setNotice(`Created template version ${adoption.selected_version}. Existing project pins were not changed.`))
      .catch((error: Error) => setNotice(error.message))
      .finally(() => setSourceActionId(null));
  }, [refreshSourceCandidates]);

  return (
    <main className="app-shell">
      <SideNavigation activePage={activePage} onNavigate={setActivePage} />
      <div className="workspace">
        {activePage === "Skills" ? <><SkillWorkspace skills={catalogSkills} selectedLineageId={selectedSkillLineageId} onSelect={setSelectedSkillLineageId} onSave={saveSkillProfile} saving={savingSkillProfile} feedback={skillFeedback} feedbackSummary={feedbackSummary} loadingEvidence={loadingSkillEvidence} recordingFeedback={recordingFeedback} onRecordFeedback={recordSkillFeedback} /><ReviewQueue items={reviewItems} remote={catalogApi !== ""} />{catalogApi ? <SourceChangeQueue candidates={sourceCandidates} summaries={sourceReviewSummaries} actionId={sourceActionId} onSummaryChange={updateSourceSummary} onReview={reviewSourceCandidate} onAdopt={adoptSourceCandidate} /> : null}</> : activePage === "Templates" ? <TemplateWorkspace presets={presets} skills={registrySkills} selectedTemplateId={selectedTemplateId} onSelectTemplate={setSelectedTemplateId} onSave={saveTemplateMembership} onCreate={createTemplate} saving={savingTemplate} /> : <><header className="topbar"><button className="back-button" type="button" aria-label="Back to projects"><ArrowLeft size={25} /></button>{catalogApi && projects.length > 0 ? <label className="project-select"><span className="sr-only">Project</span><select value={selectedProjectId ?? ""} onChange={(event) => { setSelectedProjectId(event.target.value); setPristine(false); setNotice(null); }}>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select><ChevronDown size={18} aria-hidden="true" /></label> : <h1>Acme Web</h1>}<label className="scope-select">Work scope<select value={scope} onChange={(event) => { setScope(event.target.value as Scope); setPristine(false); setNotice(null); }}><option value="planning">planning</option><option value="implementation">implementation</option><option value="review">review</option></select><ChevronDown size={18} aria-hidden="true" /></label></header>
        <div className="project-layout">
           <section className="main-panel"><div className="panel-title"><div><h2 id="effective-set-title">Effective skill set</h2><p>Resolved from pinned templates and the selected work scope.</p></div><button className="pristine-button" onClick={togglePristine} type="button"><RefreshCcw size={18} /> {pristine ? "Restore" : "Pristine"}</button></div><SkillTable skills={skills} /><LiveActivationStatus globalStatus={globalStatus} projectStatus={projectStatus} loading={loadingLiveStatus} error={liveStatusError} onRefresh={() => void refreshLiveStatus()} />{remoteError ? <div className="plan-notice error"><X size={18} /> <span>{remoteError}</span></div> : null}{notice ? <div className="plan-notice"><Check size={18} /> <span>{notice}</span><button type="button" onClick={() => setNotice(null)} aria-label="Dismiss"><X size={16} /></button></div> : null}</section>
           <TemplateInspector scope={scope} pristine={pristine} defaultTemplate={defaultTemplate} defaultPresetId={defaultPresetId} presets={presets} overlayTemplate={overlayTemplate} overlayPresetId={overlayPresetId} overlayActive={overlayActive} onPristine={togglePristine} onDefaultTemplate={updateDefaultTemplate} onOverlayTemplate={updateWorkScopeOverlay} onPreview={previewPlan} onApply={applyPlan} onCopyPrompt={copySystemPrompt} previewing={previewing} applying={applyingPlan} applyProgress={applyProgress} copyingPrompt={copyingPrompt} updatingDefault={updatingDefault} updatingOverlay={updatingOverlay} />
        </div>
        <PlanHistory scope={scope} pristine={pristine} previewing={previewing} skills={skills} defaultTemplate={defaultTemplate} remote={remoteSet !== null} history={history} comparison={comparison} />
        </>}
      </div>
    </main>
  );
}
