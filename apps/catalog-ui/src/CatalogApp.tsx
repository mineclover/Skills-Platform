import { useCallback, useMemo, useState } from "react";
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

function SkillTable({ scope, pristine }: { scope: Scope; pristine: boolean }) {
  return (
    <section className="skill-table" aria-labelledby="effective-set-title">
      <div className="table-head"><span>Skill</span><span>Status</span><span>Source</span><span>Reason</span><span aria-hidden="true" /></div>
      {skillRows.map((row) => {
        const status = statusFor(row, scope, pristine);
        return (
          <article className="skill-row" key={row.name}>
            <div className="skill-name"><span className={status.enabled ? "checkbox checked" : "checkbox"}>{status.enabled ? <Check size={16} /> : null}</span><strong>{row.name}</strong></div>
            <span className={status.enabled ? "status enabled" : "status"}>{status.enabled ? "Selected" : "Disabled"}</span>
            <div className="source"><strong>{status.source}</strong><small>{status.source === "Verification v1" ? "Work-scope overlay" : "Pinned template"}</small></div>
            <span className="reason">{status.reason}</span>
            <ChevronDown size={20} className="row-chevron" aria-hidden="true" />
          </article>
        );
      })}
    </section>
  );
}

function TemplateInspector({ scope, pristine, onPristine, onPreview, previewing }: {
  scope: Scope;
  pristine: boolean;
  onPristine: () => void;
  onPreview: () => void;
  previewing: boolean;
}) {
  const overlayShown = scope === "implementation" && !pristine;
  return (
    <aside className="inspector" aria-label="Project policy">
      <div className="inspector-section">
        <p className="section-label">Pinned default template</p>
        <div className="template-tile"><FileText size={30} strokeWidth={1.4} /><div><strong>{pristine ? "Pristine" : "Build v2"}</strong><small>{pristine ? "Clean managed baseline" : "Default template · pinned"}</small></div><Check size={20} className="mint" /></div>
      </div>
      <div className="inspector-section overlay-section">
        <p className="section-label">Work-scope overlay</p>
        <div className={overlayShown ? "template-tile overlay-tile" : "template-tile overlay-tile inactive"}><Layers3 size={30} strokeWidth={1.4} /><div><strong>Verification v1</strong><small>{overlayShown ? "Matches implementation scope" : "Available for implementation"}</small></div><Eye size={20} className={overlayShown ? "mint" : "muted"} /></div>
      </div>
      <div className="provenance">
        <p className="section-label">Resolution</p>
        <div><span>Default source</span><strong>{pristine ? "Pristine" : "Build v2"}</strong></div>
        <div><span>Overlay source</span><strong>{overlayShown ? "Verification v1" : "None"}</strong></div>
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

function PlanHistory({ scope, pristine, previewing }: { scope: Scope; pristine: boolean; previewing: boolean }) {
  const enabledCount = skillRows.filter((row) => statusFor(row, scope, pristine).enabled).length;
  const progress = previewing ? "2 / 3 resolving" : "3 / 3 resolved";
  return (
    <section className="history-strip" aria-labelledby="history-title">
      <div className="history-title"><h2 id="history-title">Recent activation plans</h2><span>Recorded locally</span></div>
      <div className="history-row">
        <CircleCheck size={30} className="mint" /><div className="history-name"><strong>{pristine ? "Pristine baseline" : `${scope} · Build v2`}</strong><small>Plan is ready for Skills Manager delivery</small></div>
        <div className="history-progress"><strong>{progress}</strong><small>{enabledCount} enabled · {3 - enabledCount} disabled</small></div>
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
  const enabledCount = useMemo(() => skillRows.filter((row) => statusFor(row, scope, pristine).enabled).length, [scope, pristine]);

  const togglePristine = useCallback(() => {
    setPristine((current) => !current);
    setNotice(null);
  }, []);
  const previewPlan = useCallback(() => {
    setPreviewing(true);
    setNotice(null);
    window.setTimeout(() => {
      setPreviewing(false);
      setNotice(`${enabledCount} enabled and ${3 - enabledCount} disabled operations are ready for preview.`);
    }, 620);
  }, [enabledCount]);

  return (
    <main className="app-shell">
      <SideNavigation />
      <div className="workspace">
        <header className="topbar"><button className="back-button" type="button" aria-label="Back to projects"><ArrowLeft size={25} /></button><h1>Acme Web</h1><label className="scope-select">Work scope<select value={scope} onChange={(event) => { setScope(event.target.value as Scope); setPristine(false); setNotice(null); }}><option value="planning">planning</option><option value="implementation">implementation</option><option value="review">review</option></select><ChevronDown size={18} aria-hidden="true" /></label></header>
        <div className="project-layout">
          <section className="main-panel"><div className="panel-title"><div><h2 id="effective-set-title">Effective skill set</h2><p>Resolved from pinned templates and the selected work scope.</p></div><button className="pristine-button" onClick={togglePristine} type="button"><RefreshCcw size={18} /> {pristine ? "Restore" : "Pristine"}</button></div><SkillTable scope={scope} pristine={pristine} />{notice ? <div className="plan-notice"><Check size={18} /> <span>{notice}</span><button type="button" onClick={() => setNotice(null)} aria-label="Dismiss"><X size={16} /></button></div> : null}</section>
          <TemplateInspector scope={scope} pristine={pristine} onPristine={togglePristine} onPreview={previewPlan} previewing={previewing} />
        </div>
        <PlanHistory scope={scope} pristine={pristine} previewing={previewing} />
      </div>
    </main>
  );
}
