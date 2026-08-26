import type { LucideIcon } from "lucide-react";
import {
  ClipboardCheck,
  Database,
  FileText,
  Layers,
  Settings,
  Sparkles,
} from "lucide-react";

export interface NavItemDef {
  label: string;
  icon: LucideIcon;
  badge?: string;
  tooltip?: string;
}

export const navigation: NavItemDef[] = [
  {
    label: "Skills",
    icon: Database,
    tooltip: "Managed skills, immutable profiles & notes",
  },
  {
    label: "Templates",
    icon: FileText,
    tooltip: "Versioned skill membership & recipe export",
  },
  {
    label: "Projects",
    icon: ClipboardCheck,
    tooltip: "Project policy, effective skills & activation",
  },
  {
    label: "Recipes",
    icon: Layers,
    tooltip: "Recipe hub, export/import & multi-provider apply",
  },
];

export function AppIcon({ icon: Icon, active }: { icon: LucideIcon; active?: boolean }) {
  return (
    <Icon
      aria-hidden="true"
      size={20}
      strokeWidth={active ? 2.2 : 1.7}
      className={active ? "nav-icon active" : "nav-icon"}
    />
  );
}

export function SideNavigation({
  activePage,
  onNavigate,
}: {
  activePage: string;
  onNavigate: (page: string) => void;
}) {
  return (
    <aside className="sidebar" aria-label="Main Navigation">
      <div className="brand-mark" aria-label="Skills Platform Control Plane" title="Skills Platform Control Plane">
        <Sparkles size={20} strokeWidth={2} className="brand-icon" />
      </div>

      <nav aria-label="Catalog navigation" className="navigation">
        {navigation.map(({ label, icon, badge, tooltip }) => {
          const active = label === activePage;
          return (
            <button
              className={`nav-item ${active ? "selected" : ""}`}
              key={label}
              type="button"
              onClick={() => onNavigate(label)}
              title={tooltip || label}
              aria-label={label}
              aria-current={active ? "page" : undefined}
            >
              <AppIcon icon={icon} active={active} />
              <span className="nav-label">{label}</span>
              {badge ? <span className="nav-badge">{badge}</span> : null}
            </button>
          );
        })}
      </nav>

      <button
        className="nav-item settings"
        type="button"
        title="Settings & System Diagnostics"
        aria-label="Settings"
      >
        <AppIcon icon={Settings} />
        <span className="nav-label">Settings</span>
      </button>
    </aside>
  );
}
