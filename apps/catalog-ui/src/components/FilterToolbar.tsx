import React from "react";
import { LayoutGrid, List, Search, SlidersHorizontal, X } from "lucide-react";
import { INVOCATION_MODE_INFO, Tooltip } from "../visual-identity";

export type InvocationFilterMode = "all" | "model_invoked" | "user_invoked" | "hybrid";
export type ProviderFilterOption = "all" | "codex" | "antigravity" | "claude";
export type ViewMode = "table" | "grid";

export interface FilterToolbarProps {
  invocationMode?: InvocationFilterMode;
  onInvocationModeChange?: (mode: InvocationFilterMode) => void;
  providerFilter?: string;
  onProviderFilterChange?: (provider: string) => void;
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  viewMode?: ViewMode;
  onViewModeChange?: (mode: ViewMode) => void;
  totalCount: number;
  filteredCount: number;
  entityName?: string;
  showInvocationChips?: boolean;
  showProviderFilter?: boolean;
  showViewToggle?: boolean;
  searchPlaceholder?: string;
  extraActions?: React.ReactNode;
}

const INVOCATION_CHIPS: Array<{
  id: InvocationFilterMode;
  label: string;
  pillClass: string;
  tooltip: string;
}> = [
  {
    id: "all",
    label: "All",
    pillClass: "",
    tooltip: "Show all skills across all invocation modes",
  },
  {
    id: "model_invoked",
    label: "🤖 Model-invoked (Reflex)",
    pillClass: "model",
    tooltip: INVOCATION_MODE_INFO.model_invoked.tooltip,
  },
  {
    id: "user_invoked",
    label: "👤 User-invoked (Command)",
    pillClass: "user",
    tooltip: INVOCATION_MODE_INFO.user_invoked.tooltip,
  },
  {
    id: "hybrid",
    label: "🔀 Hybrid",
    pillClass: "hybrid",
    tooltip: INVOCATION_MODE_INFO.hybrid.tooltip,
  },
];

const PROVIDER_OPTIONS: Array<{ id: string; label: string; tooltip: string }> = [
  { id: "all", label: "All Providers", tooltip: "Show skills for all assistant platforms" },
  { id: "codex", label: "Codex", tooltip: "Codex CLI (delivery root: .agents/skills/)" },
  { id: "antigravity", label: "Antigravity", tooltip: "Antigravity (delivery root: .agents/skills/)" },
  { id: "claude", label: "Claude", tooltip: "Claude Desktop (delivery root: .claude/skills/)" },
];

export function FilterToolbar({
  invocationMode = "all",
  onInvocationModeChange,
  providerFilter = "all",
  onProviderFilterChange,
  searchQuery,
  onSearchQueryChange,
  viewMode = "table",
  onViewModeChange,
  totalCount,
  filteredCount,
  entityName = "skills",
  showInvocationChips = true,
  showProviderFilter = false,
  showViewToggle = false,
  searchPlaceholder = "Search by keyword, name, tags...",
  extraActions,
}: FilterToolbarProps) {
  return (
    <div className="filter-toolbar" role="toolbar" aria-label="Filters and view controls">
      <div className="filter-toolbar-left">
        {/* Search Bar with Clear Button */}
        <div className="filter-search-box">
          <Search size={16} className="search-icon" aria-hidden="true" />
          <input
            type="text"
            className="filter-search-input"
            value={searchQuery}
            onChange={(e) => onSearchQueryChange(e.target.value)}
            placeholder={searchPlaceholder}
            aria-label="Filter search query"
          />
          {searchQuery ? (
            <button
              type="button"
              className="clear-search-btn"
              onClick={() => onSearchQueryChange("")}
              aria-label="Clear search"
              title="Clear search"
            >
              <X size={14} />
            </button>
          ) : null}
        </div>

        {/* Invocation Mode Filter Chips */}
        {showInvocationChips && onInvocationModeChange ? (
          <div className="filter-chip-group" role="group" aria-label="Invocation mode filter">
            {INVOCATION_CHIPS.map((chip) => {
              const active = invocationMode === chip.id;
              return (
                <Tooltip key={chip.id} content={chip.tooltip}>
                  <button
                    type="button"
                    className={`filter-chip ${chip.pillClass} ${active ? "active" : ""}`}
                    onClick={() => onInvocationModeChange(chip.id)}
                    aria-pressed={active}
                    title={chip.tooltip}
                  >
                    <span>{chip.label}</span>
                  </button>
                </Tooltip>
              );
            })}
          </div>
        ) : null}

        {/* Provider Filter Dropdown */}
        {showProviderFilter && onProviderFilterChange ? (
          <div className="provider-filter-wrapper">
            <SlidersHorizontal size={14} className="provider-filter-icon" aria-hidden="true" />
            <select
              className="provider-filter-select"
              value={providerFilter}
              onChange={(e) => onProviderFilterChange(e.target.value)}
              aria-label="Provider filter"
            >
              {PROVIDER_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id} title={opt.tooltip}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>

      <div className="filter-toolbar-right">
        {/* Match Counter */}
        <span className="match-counter" aria-live="polite">
          Showing <strong>{filteredCount}</strong> of <strong>{totalCount}</strong> {entityName}
        </span>

        {/* View Mode Toggle */}
        {showViewToggle && onViewModeChange ? (
          <div className="view-toggle" role="group" aria-label="View mode">
            <button
              type="button"
              className={`view-toggle-btn ${viewMode === "table" ? "active" : ""}`}
              onClick={() => onViewModeChange("table")}
              title="Table view"
              aria-label="Table view"
              aria-pressed={viewMode === "table"}
            >
              <List size={16} />
              <span>Table</span>
            </button>
            <button
              type="button"
              className={`view-toggle-btn ${viewMode === "grid" ? "active" : ""}`}
              onClick={() => onViewModeChange("grid")}
              title="Card Grid view"
              aria-label="Card Grid view"
              aria-pressed={viewMode === "grid"}
            >
              <LayoutGrid size={16} />
              <span>Cards</span>
            </button>
          </div>
        ) : null}

        {extraActions}
      </div>
    </div>
  );
}
