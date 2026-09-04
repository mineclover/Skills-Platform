import React from "react";
import {
  AlertCircle,
  AlertTriangle,
  Bot,
  CheckCircle2,
  Clock,
  Cpu,
  RefreshCcw,
  Sparkles,
  Terminal,
  User,
  Zap,
} from "lucide-react";
import type {
  ArtifactType,
  InvocationMode,
  RemoteComparison,
  RemoteHistory,
} from "./types";

// ============================================================================
// 1. Invocation Mode Metadata & Semantics
// ============================================================================

export interface InvocationModeMeta {
  id: InvocationMode;
  label: string;
  shortLabel: string;
  badgeLabel: string;
  pillClass: "model" | "user" | "hybrid" | "unspecified";
  icon: string;
  tooltip: string;
  operationalSemantics: string;
  description: string;
}

export const INVOCATION_MODE_INFO: Record<InvocationMode, InvocationModeMeta> = {
  model_invoked: {
    id: "model_invoked",
    label: "🤖 Model-invoked (Agent Reflex)",
    shortLabel: "🤖 Model",
    badgeLabel: "🤖 Model-invoked",
    pillClass: "model",
    icon: "🤖",
    tooltip:
      "🤖 Model-invoked / Agent Reflex: Autonomous routines triggered directly by LLMs during reasoning loops (e.g. reflex checks, model verification).",
    operationalSemantics:
      "Autonomous reasoning routines triggered without human prompt intervention.",
    description: "Autonomous reasoning and invariant verification reflexes.",
  },
  user_invoked: {
    id: "user_invoked",
    label: "👤 User-invoked (Explicit Command)",
    shortLabel: "👤 User",
    badgeLabel: "👤 User-invoked",
    pillClass: "user",
    icon: "👤",
    tooltip:
      "👤 User-invoked / Explicit Command: High-impact or destructive steering tools requiring explicit human invocation.",
    operationalSemantics:
      "High-impact steering tools requiring human invocation to protect invariants.",
    description: "High-impact commands and human steering tasks.",
  },
  hybrid: {
    id: "hybrid",
    label: "🔀 Hybrid (Model & User)",
    shortLabel: "🔀 Hybrid",
    badgeLabel: "🔀 Hybrid",
    pillClass: "hybrid",
    icon: "🔀",
    tooltip:
      "🔀 Hybrid: Multi-purpose tools usable both autonomously by LLMs and via explicit user command.",
    operationalSemantics:
      "Flexible tools that execute either autonomously or via manual command.",
    description: "Dual reflex & human command execution tools.",
  },
  unspecified: {
    id: "unspecified",
    label: "⚙️ Unspecified Mode",
    shortLabel: "⚙️ Unspecified",
    badgeLabel: "⚙️ Unspecified",
    pillClass: "unspecified",
    icon: "⚙️",
    tooltip:
      "⚙️ Unspecified: Legacy or unclassified execution mode without explicit invocation constraints.",
    operationalSemantics: "Default unclassified execution mode.",
    description: "Standard unconstrained execution mode.",
  },
};

export function getInvocationModeInfo(mode?: InvocationMode | string | null): InvocationModeMeta {
  if (!mode || !(mode in INVOCATION_MODE_INFO)) {
    return INVOCATION_MODE_INFO.unspecified;
  }
  return INVOCATION_MODE_INFO[mode as InvocationMode];
}

// ============================================================================
// 2. Assistant Provider Metadata & Active Delivery Paths
// ============================================================================

export type ProviderId = "antigravity" | "codex" | "claude";

export interface ProviderMeta {
  id: ProviderId;
  displayName: string;
  alias: string;
  badgeClass: string;
  deliveryRootRelative: string;
  deliveryPathPattern: string;
  colorTheme: "mint" | "amber" | "violet";
  description: string;
}

export const PROVIDER_INFO: Record<ProviderId, ProviderMeta> = {
  antigravity: {
    id: "antigravity",
    displayName: "Antigravity",
    alias: "AGY",
    badgeClass: "provider-badge antigravity",
    deliveryRootRelative: ".agents/skills",
    deliveryPathPattern: ".agents/skills/<skill_name>",
    colorTheme: "mint",
    description: "Google Antigravity autonomous agent reflex environment.",
  },
  codex: {
    id: "codex",
    displayName: "Codex",
    alias: "Codex CLI",
    badgeClass: "provider-badge codex",
    deliveryRootRelative: ".agents/skills",
    deliveryPathPattern: ".agents/skills/<skill_name>",
    colorTheme: "amber",
    description: "Codex repository skill discovery root.",
  },
  claude: {
    id: "claude",
    displayName: "Claude",
    alias: "Claude Desktop",
    badgeClass: "provider-badge claude",
    deliveryRootRelative: ".claude/skills",
    deliveryPathPattern: ".claude/skills/<skill_name>",
    colorTheme: "violet",
    description: "Claude Desktop filesystem extension directory.",
  },
};

export function normalizeProviderId(providerId?: string | null): ProviderId {
  if (!providerId) return "codex";
  const normalized = providerId.trim().toLowerCase();
  if (normalized === "antigravity" || normalized === "agy" || normalized === "gemini") {
    return "antigravity";
  }
  if (normalized === "claude") {
    return "claude";
  }
  return "codex";
}

export function getProviderInfo(providerId?: string | null): ProviderMeta {
  const normalized = normalizeProviderId(providerId);
  return PROVIDER_INFO[normalized];
}

export function resolveDeliveryPath(
  providerId?: string | null,
  skillName?: string | null,
  basePath?: string | null,
): string {
  const provider = getProviderInfo(providerId);
  const skillPart = skillName?.trim() || "<skill_name>";

  if (!basePath || !basePath.trim()) {
    return `${provider.deliveryRootRelative}/${skillPart}`;
  }

  const cleanBase = basePath.trim().replace(/[\\/]+$/, "");
  return `${cleanBase}/${provider.deliveryRootRelative}/${skillPart}`;
}

export function resolveDeliveryRoot(
  providerId?: string | null,
  basePath?: string | null,
): string {
  const provider = getProviderInfo(providerId);
  if (!basePath || !basePath.trim()) {
    return `${provider.deliveryRootRelative}/`;
  }
  const cleanBase = basePath.trim().replace(/[\\/]+$/, "");
  return `${cleanBase}/${provider.deliveryRootRelative}/`;
}

// ============================================================================
// 3. Pristine, In-Sync, Drift & Dirty State Indicators
// ============================================================================

export type ProjectStateKind = "pristine" | "insync" | "drift" | "dirty" | "ready";

export interface ProjectStatusState {
  state: ProjectStateKind;
  label: string;
  shortLabel: string;
  badgeClass: string;
  tooltip: string;
  driftCount: number;
  driftBreakdown: Record<string, number>;
  details: string;
}

export function calculateProjectStatus({
  pristine = false,
  pinnedPresetId = null,
  comparison = null,
  history = null,
  isDirty = false,
}: {
  pristine?: boolean;
  pinnedPresetId?: string | null;
  comparison?: RemoteComparison | null;
  history?: RemoteHistory | null;
  isDirty?: boolean;
}): ProjectStatusState {
  // 1. Pristine Baseline
  if (pristine || pinnedPresetId === "builtin-pristine" || history?.mode === "pristine") {
    return {
      state: "pristine",
      label: "Pristine Baseline",
      shortLabel: "Pristine",
      badgeClass: "status-pill pristine",
      tooltip:
        "Pristine Baseline: All managed skill symlinks are unlinked for a clean slate.",
      driftCount: 0,
      driftBreakdown: {},
      details: "Clean managed baseline (all skills disabled).",
    };
  }

  // 2. Unapplied Edits / Dirty State
  if (isDirty) {
    return {
      state: "dirty",
      label: "Unapplied Edits",
      shortLabel: "Dirty",
      badgeClass: "status-pill dirty",
      tooltip:
        "Unapplied Edits: Workspace configuration has unapplied changes not yet materialized to disk.",
      driftCount: 0,
      driftBreakdown: {},
      details: "Configuration modified since last materialization.",
    };
  }

  // 3. Drift vs In Sync based on comparison
  if (comparison) {
    if (!comparison.in_sync) {
      const summary = comparison.summary || {};
      const driftBreakdown: Record<string, number> = {};
      let totalDrift = 0;

      for (const [status, count] of Object.entries(summary)) {
        if (status !== "matched" && typeof count === "number" && count > 0) {
          driftBreakdown[status] = count;
          totalDrift += count;
        }
      }

      const driftDetails = Object.entries(driftBreakdown)
        .map(([status, count]) => `${count} ${status.replaceAll("_", " ")}`)
        .join(", ");

      return {
        state: "drift",
        label: totalDrift > 0 ? `Drift Warning (${totalDrift} drifted)` : "Drift Warning",
        shortLabel: "Drift",
        badgeClass: "status-pill drift",
        tooltip: `Drift Warning: Observed provider bindings diverge from plan (${
          driftDetails || "divergence detected"
        }).`,
        driftCount: totalDrift,
        driftBreakdown,
        details: driftDetails || "Divergence from plan detected.",
      };
    }

    return {
      state: "insync",
      label: "In Sync",
      shortLabel: "In Sync",
      badgeClass: "status-pill insync",
      tooltip:
        "In Sync: Observed filesystem bindings match the recorded activation plan.",
      driftCount: 0,
      driftBreakdown: {},
      details: `Provider bindings match pinned plan (${comparison.provider_id || "provider"}).`,
    };
  }

  // 4. Default Ready State
  return {
    state: "ready",
    label: "Plan Ready",
    shortLabel: "Ready",
    badgeClass: "status-pill ready",
    tooltip:
      "Plan Ready: Pinned template is configured and ready for plan materialization.",
    driftCount: 0,
    driftBreakdown: {},
    details: "Plan is ready for Skills Manager delivery.",
  };
}

// ============================================================================
// 4. React Components for Visual Identity
// ============================================================================

export interface TooltipProps {
  content: string;
  children: React.ReactNode;
  className?: string;
  position?: "top" | "bottom" | "left" | "right";
}

export function Tooltip({
  content,
  children,
  className = "",
  position = "top",
}: TooltipProps) {
  if (!content) return <>{children}</>;

  return (
    <span
      className={`tooltip-container ${position} ${className}`.trim()}
      tabIndex={0}
      role="tooltip"
      aria-label={content}
    >
      {children}
      <span className="tooltip-bubble" role="status">
        {content}
      </span>
    </span>
  );
}

export interface InvocationBadgeProps {
  mode?: InvocationMode | string | null;
  showTooltip?: boolean;
  size?: "sm" | "md";
  className?: string;
}

export function InvocationBadge({
  mode,
  showTooltip = true,
  size = "md",
  className = "",
}: InvocationBadgeProps) {
  const meta = getInvocationModeInfo(mode as InvocationMode);
  const badgeEl = (
    <span
      className={`invocation-pill ${meta.pillClass} ${size === "sm" ? "pill-sm" : ""} ${
        showTooltip ? "has-tooltip" : ""
      } ${className}`.trim()}
      data-invocation-mode={meta.id}
      title={showTooltip ? meta.tooltip : undefined}
    >
      <span className="pill-icon" aria-hidden="true">
        {meta.icon}
      </span>
      <span className="pill-text">{size === "sm" ? meta.shortLabel : meta.badgeLabel}</span>
    </span>
  );

  if (!showTooltip) return badgeEl;

  return (
    <Tooltip content={meta.tooltip} position="top">
      {badgeEl}
    </Tooltip>
  );
}

export interface ProviderBadgeProps {
  providerId?: string | null;
  showDeliveryPath?: boolean;
  skillName?: string | null;
  basePath?: string | null;
  showTooltip?: boolean;
  className?: string;
}

export function ProviderBadge({
  providerId,
  showDeliveryPath = false,
  skillName,
  basePath,
  showTooltip = true,
  className = "",
}: ProviderBadgeProps) {
  const meta = getProviderInfo(providerId);
  const deliveryPath = resolveDeliveryPath(providerId, skillName, basePath);

  const getProviderIcon = () => {
    switch (meta.id) {
      case "antigravity":
        return <Sparkles size={14} className="provider-icon mint" aria-hidden="true" />;
      case "claude":
        return <Cpu size={14} className="provider-icon violet" aria-hidden="true" />;
      case "codex":
      default:
        return <Terminal size={14} className="provider-icon amber" aria-hidden="true" />;
    }
  };

  const badgeContent = (
    <span
      className={`${meta.badgeClass} ${showTooltip ? "has-tooltip" : ""} ${className}`.trim()}
      data-provider-id={meta.id}
      title={
        showTooltip
          ? `${meta.displayName} (${meta.alias}) · Active root: ${meta.deliveryRootRelative}/`
          : undefined
      }
    >
      {getProviderIcon()}
      <span className="provider-name">{meta.displayName}</span>
      {showDeliveryPath && (
        <code className="delivery-path-indicator" title={`Delivery binding path: ${deliveryPath}`}>
          {deliveryPath}
        </code>
      )}
    </span>
  );

  if (!showTooltip) return badgeContent;

  const tooltipText = `${meta.displayName} Provider: Active delivery binding path is "${deliveryPath}". ${meta.description}`;

  return (
    <Tooltip content={tooltipText} position="top">
      {badgeContent}
    </Tooltip>
  );
}

export interface DeliveryPathIndicatorProps {
  providerId?: string | null;
  skillName?: string | null;
  basePath?: string | null;
  showTooltip?: boolean;
  className?: string;
}

export function DeliveryPathIndicator({
  providerId,
  skillName,
  basePath,
  showTooltip = true,
  className = "",
}: DeliveryPathIndicatorProps) {
  const provider = getProviderInfo(providerId);
  const path = resolveDeliveryPath(providerId, skillName, basePath);
  const tooltipText = `Active delivery binding path for ${provider.displayName}: ${path}`;

  const el = (
    <code
      className={`delivery-path-indicator ${provider.colorTheme} ${
        showTooltip ? "has-tooltip" : ""
      } ${className}`.trim()}
      data-provider-id={provider.id}
      title={showTooltip ? tooltipText : undefined}
    >
      {path}
    </code>
  );

  if (!showTooltip) return el;

  return (
    <Tooltip content={tooltipText} position="top">
      {el}
    </Tooltip>
  );
}

export interface ProjectStatusPillProps {
  status: ProjectStatusState;
  showTooltip?: boolean;
  className?: string;
}

export function ProjectStatusPill({
  status,
  showTooltip = true,
  className = "",
}: ProjectStatusPillProps) {
  const getStatusIcon = () => {
    switch (status.state) {
      case "pristine":
        return <RefreshCcw size={13} className="mint" aria-hidden="true" />;
      case "insync":
        return <CheckCircle2 size={13} className="mint" aria-hidden="true" />;
      case "drift":
        return <AlertTriangle size={13} className="amber" aria-hidden="true" />;
      case "dirty":
        return <Clock size={13} className="blue" aria-hidden="true" />;
      case "ready":
      default:
        return <Zap size={13} className="muted" aria-hidden="true" />;
    }
  };

  const pillEl = (
    <span
      className={`${status.badgeClass} ${showTooltip ? "has-tooltip" : ""} ${className}`.trim()}
      data-status-state={status.state}
      title={showTooltip ? status.tooltip : undefined}
    >
      {status.state === "drift" && <span className="drift-pulse-dot" aria-hidden="true" />}
      {getStatusIcon()}
      <span className="status-label">{status.label}</span>
    </span>
  );

  if (!showTooltip) return pillEl;

  return (
    <Tooltip content={status.tooltip} position="top">
      {pillEl}
    </Tooltip>
  );
}
