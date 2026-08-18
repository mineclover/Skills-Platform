import type { LucideIcon } from "lucide-react";
import { Database, FileText, ClipboardCheck, Settings, Sparkles } from "lucide-react";

export const navigation: Array<{ label: string; icon: LucideIcon }> = [
  { label: "Skills", icon: Database },
  { label: "Templates", icon: FileText },
  { label: "Projects", icon: ClipboardCheck },
];

export function AppIcon({ icon: Icon, active }: { icon: LucideIcon; active?: boolean }) {
  return (
    <Icon
      aria-hidden="true"
      size={21}
      strokeWidth={1.7}
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
    <aside className="sidebar">
      <div className="brand-mark" aria-label="Skills Catalog">
        <Sparkles size={20} strokeWidth={2} />
      </div>
      <nav aria-label="Catalog navigation" className="navigation">
        {navigation.map(({ label, icon }) => {
          const active = label === activePage;
          return (
            <button
              className={active ? "nav-item selected" : "nav-item"}
              key={label}
              type="button"
              onClick={() => onNavigate(label)}
            >
              <AppIcon icon={icon} active={active} />
              <span>{label}</span>
            </button>
          );
        })}
      </nav>
      <button className="nav-item settings" type="button">
        <AppIcon icon={Settings} />
        <span>Settings</span>
      </button>
    </aside>
  );
}
