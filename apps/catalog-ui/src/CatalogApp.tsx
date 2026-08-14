import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft, Check, ChevronDown, CircleCheck, ClipboardCheck, Database,
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
type RemoteHistory = { plan_id: string; mode: string; recorded_at: string; reports: Array<{ status: string; report: { summary?: Record<string, number> } }> };

const catalogApi = import.meta.env.VITE_CATALOG_API?.replace(/\/$/, "") ?? "";

const navigation = [
  { label: "Registry", icon: Database },
  { label: "Templates", icon: FileText },
  { label: "Projects", icon: ClipboardCheck },
  { label: "History", icon: RefreshCcw },
  { label: "Review", icon: ShieldCheck },
];

const skillRows: SkillRow[] = [
  { name: "Planning", source: "Build v2", defaultEnabled: true, defaultReason: "Default inclusion in Build v2" },
  { name: "Testing", source: "Verification v1", defaultEnabled: false, overlayEnabled: true, defaultReason: "Not included by Build v2", overlayReason: "Verification overlay includes Testing" },
  { name: "UI Design", source: "Build v2", defaultEnabled: false, defaultReason: "Not included by Build v2" },
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

function AppIcon({ icon: Icon, active }: { icon: typeof Database; active?: boolean }) {
  return <Icon aria-hidden="true" size={21} strokeWidth={1.7} className={active ? "nav-icon active" : "nav-icon"} />;
}

function SideNavigation() {
  return (
    <aside className="sidebar">
      <div className="brand-mark" aria-label="Skills Catalog"><Sparkles size={20} strokeWidth={2} /></div>
      <nav aria-label="Catalog navigation" className="navigation">
        {navigation.map(({ label, icon }) => {
          const active = label === "Projects";
          return <button className={active ? "nav-item selected" : "nav-item"} key={label} type="button"><AppIcon icon={icon} active={active} /><span>{label}</span></button>;
        })}
      </nav>
      <button className="nav-item settings" type="button"><AppIcon icon={Settings} /><span>Settings</span></button>
    </aside>
  );
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

function TemplateInspector({ scope, pristine, defaultTemplate, overlayTemplate, onPristine, onPreview, previewing }: {
  scope: Scope;
  pristine: boolean;
  defaultTemplate: string;
  overlayTemplate: string;
  onPristine: () => void;
  onPreview: () => void;
  previewing: boolean;
}) {
  const overlayShown = scope === "implementation" && !pristine;
  return (
    <aside className="inspector" aria-label="Project policy">
      <div className="inspector-section">
        <p className="section-label">Pinned default template</p>
        <div className="template-tile"><FileText size={30} strokeWidth={1.4} /><div><strong>{pristine ? "Pristine" : defaultTemplate}</strong><small>{pristine ? "Clean managed baseline" : "Default template · pinned"}</small></div><Check size={20} className="mint" /></div>
      </div>
      <div className="inspector-section overlay-section">
        <p className="section-label">Work-scope overlay</p>
        <div className={overlayShown && overlayTemplate !== "None" ? "template-tile overlay-tile" : "template-tile overlay-tile inactive"}><Layers3 size={30} strokeWidth={1.4} /><div><strong>{overlayTemplate}</strong><small>{overlayShown && overlayTemplate !== "None" ? "Matches selected work scope" : "No matching overlay"}</small></div><Eye size={20} className={overlayShown && overlayTemplate !== "None" ? "mint" : "muted"} /></div>
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
        <button className="quiet-action" type="button" onClick={onPristine}><RefreshCcw size={17} /> {pristine ? "Restore project template" : "Return to Pristine"}</button>
        <p>Preview validates the pinned plan before any delivery path changes.</p>
      </div>
    </aside>
  );
}

function PlanHistory({ scope, pristine, previewing, skills, defaultTemplate, remote, history }: { scope: Scope; pristine: boolean; previewing: boolean; skills: DisplaySkill[]; defaultTemplate: string; remote: boolean; history: RemoteHistory | null }) {
  const enabledCount = skills.filter((skill) => skill.enabled).length;
  const report = history?.reports.at(-1);
  const applied = report?.report.summary?.applied ?? enabledCount;
  const progress = previewing ? "2 / 3 resolving" : report ? `${applied} applied` : "3 / 3 resolved";
  return (
    <section className="history-strip" aria-labelledby="history-title">
      <div className="history-title"><h2 id="history-title">Recent activation plans</h2><span>{remote ? "Catalog bridge connected" : "Demo data"}</span></div>
      <div className="history-row">
        <CircleCheck size={30} className="mint" /><div className="history-name"><strong>{history ? `${history.mode} · ${history.plan_id.slice(0, 8)}` : pristine ? "Pristine baseline" : `${scope} · ${defaultTemplate}`}</strong><small>{report ? `Adapter report: ${report.status}` : "Plan is ready for Skills Manager delivery"}</small></div>
        <div className="history-progress"><strong>{progress}</strong><small>{enabledCount} enabled · {skills.length - enabledCount} disabled</small></div>
        <div className="progress-track" aria-label={progress}><div className="progress-fill" style={{ width: previewing ? "54%" : "100%" }} /></div>
        <button className="details-button" type="button">View details</button><ChevronDown size={20} className="row-chevron" aria-hidden="true" />
      </div>
    </section>
  );
}

export function CatalogApp() {
  const [scope, setScope] = useState<Scope>("implementation");
  const [pristine, setPristine] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [remoteSet, setRemoteSet] = useState<RemoteSet | null>(null);
  const [remoteError, setRemoteError] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [projects, setProjects] = useState<RemoteProject[]>([]);
  const [history, setHistory] = useState<RemoteHistory | null>(null);

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
  }, [scope, pristine, selectedProjectId]);

  useEffect(() => {
    if (!catalogApi || !selectedProjectId) return;
    let active = true;
    fetch(`${catalogApi}/api/projects/${encodeURIComponent(selectedProjectId)}/history`)
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Could not load project history")))
      .then((body: { history: RemoteHistory[] }) => active && setHistory(body.history[0] ?? null))
      .catch(() => active && setHistory(null));
    return () => { active = false; };
  }, [selectedProjectId, notice]);

  const skills = useMemo<DisplaySkill[]>(() => remoteSet
    ? remoteSet.skills.map((skill) => {
      const assignment = remoteSet.assignments.find((item) => item.preset_id === skill.selected_by?.preset_id);
      return { name: skill.skill_name, source: assignment?.name ?? (pristine ? "Pristine" : "Catalog"), enabled: skill.desired_state === "enabled", reason: skill.reason.replaceAll("_", " ") };
    })
    : sampleSkills(scope, pristine), [remoteSet, scope, pristine]);
  const enabledCount = useMemo(() => skills.filter((skill) => skill.enabled).length, [skills]);
  const defaultTemplate = remoteSet ? presetName(remoteSet.assignments, "default", "Pristine") : "Build v2";
  const overlayTemplate = remoteSet ? presetName(remoteSet.assignments, "work_scope_overlay", "None") : "Verification v1";

  const togglePristine = useCallback(() => {
    setPristine((current) => !current);
    setNotice(null);
  }, []);
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

  return (
    <main className="app-shell">
      <SideNavigation />
      <div className="workspace">
        <header className="topbar"><button className="back-button" type="button" aria-label="Back to projects"><ArrowLeft size={25} /></button>{catalogApi && projects.length > 0 ? <label className="project-select"><span className="sr-only">Project</span><select value={selectedProjectId ?? ""} onChange={(event) => { setSelectedProjectId(event.target.value); setPristine(false); setNotice(null); }}>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select><ChevronDown size={18} aria-hidden="true" /></label> : <h1>Acme Web</h1>}<label className="scope-select">Work scope<select value={scope} onChange={(event) => { setScope(event.target.value as Scope); setPristine(false); setNotice(null); }}><option value="planning">planning</option><option value="implementation">implementation</option><option value="review">review</option></select><ChevronDown size={18} aria-hidden="true" /></label></header>
        <div className="project-layout">
          <section className="main-panel"><div className="panel-title"><div><h2 id="effective-set-title">Effective skill set</h2><p>Resolved from pinned templates and the selected work scope.</p></div><button className="pristine-button" onClick={togglePristine} type="button"><RefreshCcw size={18} /> {pristine ? "Restore" : "Pristine"}</button></div><SkillTable skills={skills} />{remoteError ? <div className="plan-notice error"><X size={18} /> <span>{remoteError}</span></div> : null}{notice ? <div className="plan-notice"><Check size={18} /> <span>{notice}</span><button type="button" onClick={() => setNotice(null)} aria-label="Dismiss"><X size={16} /></button></div> : null}</section>
          <TemplateInspector scope={scope} pristine={pristine} defaultTemplate={defaultTemplate} overlayTemplate={overlayTemplate} onPristine={togglePristine} onPreview={previewPlan} previewing={previewing} />
        </div>
        <PlanHistory scope={scope} pristine={pristine} previewing={previewing} skills={skills} defaultTemplate={defaultTemplate} remote={remoteSet !== null} history={history} />
      </div>
    </main>
  );
}
