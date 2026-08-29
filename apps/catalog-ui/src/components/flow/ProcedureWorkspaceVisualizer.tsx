import { useState, useMemo, type FormEvent } from "react";
import {
  AlertCircle,
  Award,
  CheckCircle2,
  Clock,
  Code2,
  Compass,
  Copy,
  ExternalLink,
  FileCode,
  FileText,
  Filter,
  FolderGit2,
  GitBranch,
  GitMerge,
  GitPullRequest,
  Layers,
  Plus,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Slash,
  Sparkles,
  Terminal,
  Trash2,
  X,
  XCircle,
} from "lucide-react";
import type {
  CreateProcedureWorkspaceOptions,
  ProcedureType,
  ProcedureWorkspace,
  ProcedureWorkspaceStatus,
} from "../../types";
import { copyText } from "../../api/catalog-api";

export interface ProcedureWorkspaceVisualizerProps {
  workspaces: ProcedureWorkspace[];
  selectedWorkspaceId?: string | null;
  onSelectWorkspace?: (workspace: ProcedureWorkspace) => void;
  onSpawnWorkspace?: (options: CreateProcedureWorkspaceOptions) => Promise<void> | void;
  onVerifyWorkspace?: (workspaceId: string) => Promise<void> | void;
  onMergeWorkspace?: (workspaceId: string) => Promise<void> | void;
  onPruneWorkspace?: (workspaceId: string) => Promise<void> | void;
  onDiscardWorkspace?: (workspaceId: string, reason?: string) => Promise<void> | void;
  onRefresh?: () => void;
  isLoading?: boolean;
}

export function getProcedureBadgeColor(type: ProcedureType): {
  badgeClass: string;
  label: string;
  accentColor: string;
} {
  switch (type) {
    case "PLANNING":
      return {
        badgeClass: "badge-planning",
        label: "PLANNING",
        accentColor: "#a78bfa", // Indigo / Purple
      };
    case "INNER_LOOP_TDD":
      return {
        badgeClass: "badge-tdd",
        label: "INNER_LOOP_TDD",
        accentColor: "#34d399", // Emerald / Green
      };
    case "SECURITY_AUDIT":
      return {
        badgeClass: "badge-security",
        label: "SECURITY_AUDIT",
        accentColor: "#fbbf24", // Amber / Orange
      };
    case "RELEASE_GATE":
      return {
        badgeClass: "badge-release",
        label: "RELEASE_GATE",
        accentColor: "#fb7185", // Rose / Red
      };
    default:
      return {
        badgeClass: "badge-default",
        label: String(type),
        accentColor: "#60a5fa",
      };
  }
}

export function getStatusPill(status: ProcedureWorkspaceStatus): {
  pillClass: string;
  icon: typeof CheckCircle2;
  label: string;
} {
  switch (status) {
    case "active":
      return { pillClass: "status-active", icon: RefreshCw, label: "Active" };
    case "in_verification":
      return { pillClass: "status-in-verification", icon: Clock, label: "In Verification" };
    case "verified":
      return { pillClass: "status-verified", icon: CheckCircle2, label: "Verified" };
    case "merged":
      return { pillClass: "status-merged", icon: GitMerge, label: "Merged" };
    case "failed":
      return { pillClass: "status-failed", icon: AlertCircle, label: "Failed" };
    case "discarded":
      return { pillClass: "status-discarded", icon: XCircle, label: "Discarded" };
    case "pruned":
      return { pillClass: "status-pruned", icon: Trash2, label: "Pruned" };
    case "pending":
    default:
      return { pillClass: "status-pending", icon: Clock, label: "Pending" };
  }
}

export function ProcedureWorkspaceVisualizer({
  workspaces,
  selectedWorkspaceId,
  onSelectWorkspace,
  onSpawnWorkspace,
  onVerifyWorkspace,
  onMergeWorkspace,
  onPruneWorkspace,
  onDiscardWorkspace,
  onRefresh,
  isLoading = false,
}: ProcedureWorkspaceVisualizerProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>("ALL");
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>("ALL");
  const [isSpawnModalOpen, setIsSpawnModalOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // Spawn Form State
  const [spawnProcedureType, setSpawnProcedureType] = useState<ProcedureType>("INNER_LOOP_TDD");
  const [spawnTaskId, setSpawnTaskId] = useState("");
  const [spawnTargetTestFile, setSpawnTargetTestFile] = useState("");
  const [spawnOwnedFiles, setSpawnOwnedFiles] = useState("");
  const [spawnProhibitedActions, setSpawnProhibitedActions] = useState("");
  const [spawnActiveSkills, setSpawnActiveSkills] = useState("");
  const [spawnSubmitting, setSpawnSubmitting] = useState(false);

  const handleCopy = async (text: string, label: string) => {
    await copyText(text);
    setCopiedId(label);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleAction = async (
    workspaceId: string,
    action: "verify" | "merge" | "prune" | "discard",
  ) => {
    setActionLoadingId(`${workspaceId}-${action}`);
    try {
      if (action === "verify" && onVerifyWorkspace) {
        await onVerifyWorkspace(workspaceId);
      } else if (action === "merge" && onMergeWorkspace) {
        await onMergeWorkspace(workspaceId);
      } else if (action === "prune" && onPruneWorkspace) {
        await onPruneWorkspace(workspaceId);
      } else if (action === "discard" && onDiscardWorkspace) {
        await onDiscardWorkspace(workspaceId, "Manually discarded from Visualizer");
      }
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleSpawnSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!spawnTaskId.trim()) return;

    setSpawnSubmitting(true);
    try {
      const taskId = spawnTaskId.trim();
      const ownedFiles = spawnOwnedFiles
        .split(/[\n,]/)
        .map((s) => s.trim())
        .filter(Boolean);
      const prohibitedActions = spawnProhibitedActions
        .split(/[\n,]/)
        .map((s) => s.trim())
        .filter(Boolean);
      const activeSkills = spawnActiveSkills
        .split(/[\n,]/)
        .map((s) => s.trim())
        .filter(Boolean);

      if (onSpawnWorkspace) {
        await onSpawnWorkspace({
          workspace_id: `ws-${taskId}`,
          procedure_type: spawnProcedureType,
          git_branch: `worktree/${taskId}`,
          git_worktree_path: `.workspaces/${taskId}`,
          responsibility_invariants: {
            target_test_file: spawnTargetTestFile.trim() || undefined,
            owned_files: ownedFiles.length ? ownedFiles : [`apps/catalog-ui/src/${taskId}/`],
            prohibited_actions: prohibitedActions.length
              ? prohibitedActions
              : ["npm test", "pytest", "modify_root_contracts"],
            acceptance_criteria: ["100% target test verified", "Preserve worktree isolation"],
          },
          active_skills: activeSkills.length ? activeSkills : undefined,
          metadata: {
            task_id: taskId,
          },
        });
      }

      setIsSpawnModalOpen(false);
      setSpawnTaskId("");
      setSpawnTargetTestFile("");
      setSpawnOwnedFiles("");
      setSpawnProhibitedActions("");
      setSpawnActiveSkills("");
    } finally {
      setSpawnSubmitting(false);
    }
  };

  const filteredWorkspaces = useMemo(() => {
    return workspaces.filter((ws) => {
      // Type filter
      if (selectedTypeFilter !== "ALL" && ws.procedure_type !== selectedTypeFilter) {
        return false;
      }
      // Status filter
      if (selectedStatusFilter !== "ALL" && ws.status !== selectedStatusFilter) {
        return false;
      }
      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesId = ws.workspace_id.toLowerCase().includes(q);
        const matchesBranch = ws.git_branch.toLowerCase().includes(q);
        const matchesPath = ws.git_worktree_path.toLowerCase().includes(q);
        const matchesTask = ws.metadata?.task_id?.toLowerCase()?.includes(q) ?? false;
        const matchesTest =
          ws.responsibility_invariants?.target_test_file?.toLowerCase()?.includes(q) ?? false;
        const matchesSkills = ws.active_skills?.some((s) => s.toLowerCase().includes(q)) ?? false;
        if (!matchesId && !matchesBranch && !matchesPath && !matchesTask && !matchesTest && !matchesSkills) {
          return false;
        }
      }
      return true;
    });
  }, [workspaces, selectedTypeFilter, selectedStatusFilter, searchQuery]);

  return (
    <div className="procedure-workspace-visualizer" aria-label="Procedure Workspaces Visualizer">
      {/* Visualizer Control Header */}
      <div className="workspace-visualizer-toolbar">
        <div className="toolbar-search-group">
          <Search size={16} className="search-icon" />
          <input
            type="text"
            className="search-input"
            placeholder="Search worktrees, branches, target test files, active skills..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Filter workspaces"
          />
          {searchQuery && (
            <button
              type="button"
              className="clear-search-btn"
              onClick={() => setSearchQuery("")}
              aria-label="Clear search query"
            >
              <X size={14} />
            </button>
          )}
        </div>

        <div className="toolbar-filter-group">
          <div className="filter-chip-select">
            <span className="filter-label">Procedure:</span>
            {(["ALL", "PLANNING", "INNER_LOOP_TDD", "SECURITY_AUDIT", "RELEASE_GATE"] as const).map(
              (type) => {
                const isActive = selectedTypeFilter === type;
                return (
                  <button
                    key={type}
                    type="button"
                    className={`filter-chip ${isActive ? "active" : ""}`}
                    onClick={() => setSelectedTypeFilter(type)}
                  >
                    {type === "ALL" ? "All Procedures" : type.replace(/_/g, " ")}
                  </button>
                );
              },
            )}
          </div>

          <div className="filter-chip-select">
            <span className="filter-label">Status:</span>
            {(["ALL", "active", "in_verification", "verified", "merged", "failed", "discarded"] as const).map(
              (status) => {
                const isActive = selectedStatusFilter === status;
                return (
                  <button
                    key={status}
                    type="button"
                    className={`filter-chip status-chip ${isActive ? "active" : ""}`}
                    onClick={() => setSelectedStatusFilter(status)}
                  >
                    {status === "ALL" ? "All Statuses" : status.replace(/_/g, " ")}
                  </button>
                );
              },
            )}
          </div>
        </div>

        <div className="toolbar-actions">
          {onRefresh && (
            <button
              type="button"
              className="action-btn secondary-btn"
              onClick={onRefresh}
              disabled={isLoading}
              title="Refresh procedure workspaces"
              aria-label="Refresh workspaces"
            >
              <RefreshCw size={15} className={isLoading ? "spin" : ""} />
              <span>Refresh</span>
            </button>
          )}

          <button
            type="button"
            className="action-btn primary-btn spawn-btn"
            onClick={() => setIsSpawnModalOpen(true)}
            aria-label="Spawn Procedure Workspace"
          >
            <Plus size={16} />
            <span>Spawn Workspace</span>
          </button>
        </div>
      </div>

      {/* Worktrees Card Grid */}
      <div className="worktrees-card-grid" role="region" aria-label="Active Git Worktree Cards">
        {filteredWorkspaces.length === 0 ? (
          <div className="empty-workspaces-card">
            <FolderGit2 size={36} className="empty-icon" />
            <h3>No Procedure Workspaces Found</h3>
            <p>
              {searchQuery || selectedTypeFilter !== "ALL" || selectedStatusFilter !== "ALL"
                ? "No workspaces match the active filters. Try clearing your search parameters."
                : "No isolated Git worktrees have been spawned yet. Click 'Spawn Workspace' to create an isolated procedure workspace."}
            </p>
            <button
              type="button"
              className="action-btn primary-btn"
              onClick={() => setIsSpawnModalOpen(true)}
            >
              <Plus size={16} />
              <span>Spawn New Workspace</span>
            </button>
          </div>
        ) : (
          filteredWorkspaces.map((ws) => {
            const isSelected = selectedWorkspaceId === ws.workspace_id;
            const badge = getProcedureBadgeColor(ws.procedure_type);
            const statusInfo = getStatusPill(ws.status);
            const StatusIcon = statusInfo.icon;
            const invariants = ws.responsibility_invariants || {
              owned_files: [],
              prohibited_actions: [],
              acceptance_criteria: [],
            };

            const isVerifying = actionLoadingId === `${ws.workspace_id}-verify`;
            const isMerging = actionLoadingId === `${ws.workspace_id}-merge`;
            const isPruning = actionLoadingId === `${ws.workspace_id}-prune`;
            const isDiscarding = actionLoadingId === `${ws.workspace_id}-discard`;

            return (
              <div
                key={ws.workspace_id}
                className={`worktree-card ${isSelected ? "selected" : ""} ${badge.badgeClass}`}
                onClick={() => onSelectWorkspace?.(ws)}
                role="article"
                aria-label={`Procedure Workspace: ${ws.workspace_id}`}
                tabIndex={0}
              >
                {/* Card Header: Procedure Badge & Live Status Pill */}
                <div className="worktree-card-header">
                  <div className="procedure-badge-group">
                    <span className={`procedure-badge ${badge.badgeClass}`}>
                      {ws.procedure_type === "PLANNING" ? (
                        <Compass size={13} />
                      ) : ws.procedure_type === "INNER_LOOP_TDD" ? (
                        <Code2 size={13} />
                      ) : ws.procedure_type === "SECURITY_AUDIT" ? (
                        <ShieldAlert size={13} />
                      ) : (
                        <Award size={13} />
                      )}
                      <span>{badge.label}</span>
                    </span>

                    {ws.metadata?.task_id && (
                      <span className="task-id-badge">{ws.metadata.task_id}</span>
                    )}
                  </div>

                  <span className={`status-pill ${statusInfo.pillClass}`}>
                    <StatusIcon size={12} className={ws.status === "active" ? "spin" : ""} />
                    <span>{statusInfo.label}</span>
                  </span>
                </div>

                {/* Card Title & Branch / Path Links */}
                <div className="worktree-meta-body">
                  <div className="meta-row branch-row">
                    <GitBranch size={15} className="meta-icon" />
                    <span className="branch-name" title={ws.git_branch}>
                      {ws.git_branch}
                    </span>
                    <button
                      type="button"
                      className="copy-mini-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleCopy(ws.git_branch, `branch-${ws.workspace_id}`);
                      }}
                      title="Copy branch name"
                      aria-label="Copy branch name"
                    >
                      <Copy size={12} />
                      {copiedId === `branch-${ws.workspace_id}` ? (
                        <span className="copied-hint">Copied!</span>
                      ) : null}
                    </button>
                  </div>

                  <div className="meta-row path-row">
                    <FolderGit2 size={14} className="meta-icon" />
                    <span className="worktree-path" title={ws.git_worktree_path}>
                      {ws.git_worktree_path}
                    </span>
                    <button
                      type="button"
                      className="copy-mini-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleCopy(ws.git_worktree_path, `path-${ws.workspace_id}`);
                      }}
                      title="Copy worktree path"
                      aria-label="Copy worktree path"
                    >
                      <Copy size={12} />
                      {copiedId === `path-${ws.workspace_id}` ? (
                        <span className="copied-hint">Copied!</span>
                      ) : null}
                    </button>
                  </div>
                </div>

                {/* Responsibility Invariants Section */}
                <div className="worktree-invariants-section">
                  {/* Target Test File Binding */}
                  {invariants.target_test_file ? (
                    <div className="invariant-item test-binding">
                      <div className="invariant-item-title">
                        <FileCode size={13} className="cyan" />
                        <span>Target Test File Binding:</span>
                      </div>
                      <code className="test-file-code" title={invariants.target_test_file}>
                        {invariants.target_test_file}
                      </code>
                    </div>
                  ) : null}

                  {/* Owned Files Boundary */}
                  {invariants.owned_files?.length ? (
                    <div className="invariant-item owned-files">
                      <div className="invariant-item-title">
                        <Layers size={13} className="mint" />
                        <span>Owned Files Boundary ({invariants.owned_files.length}):</span>
                      </div>
                      <div className="files-chip-list">
                        {invariants.owned_files.slice(0, 3).map((f) => (
                          <span key={f} className="file-chip" title={f}>
                            {f}
                          </span>
                        ))}
                        {invariants.owned_files.length > 3 && (
                          <span className="file-chip-more">
                            +{invariants.owned_files.length - 3} more
                          </span>
                        )}
                      </div>
                    </div>
                  ) : null}

                  {/* Prohibited Actions Guard */}
                  {invariants.prohibited_actions?.length ? (
                    <div className="invariant-item prohibited-actions">
                      <div className="invariant-item-title">
                        <Slash size={13} className="danger" />
                        <span>Prohibited Actions:</span>
                      </div>
                      <div className="prohibited-chip-list">
                        {invariants.prohibited_actions.map((act) => (
                          <span key={act} className="prohibited-chip" title={act}>
                            {act}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {/* Active Skill & Guard Rosters */}
                  <div className="rosters-split-grid">
                    <div className="roster-col">
                      <span className="roster-label">
                        <Sparkles size={11} className="mint" />
                        <span>Active Skills:</span>
                      </span>
                      <div className="roster-chips">
                        {ws.active_skills?.map((s) => (
                          <span key={s} className="skill-roster-pill">
                            {s}
                          </span>
                        )) || <span className="empty-roster">None</span>}
                      </div>
                    </div>

                    <div className="roster-col">
                      <span className="roster-label">
                        <Shield size={11} className="cyan" />
                        <span>Active Guards:</span>
                      </span>
                      <div className="roster-chips">
                        {ws.active_guards?.map((g) => (
                          <span key={g} className="guard-roster-pill">
                            {g}
                          </span>
                        )) || <span className="empty-roster">None</span>}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Timestamps & Commit Hash metadata */}
                <div className="worktree-card-footer">
                  <div className="timestamps-group">
                    <span className="timestamp-item" title={ws.created_at}>
                      Created: {new Date(ws.created_at).toLocaleTimeString()}
                    </span>
                    {ws.metadata?.commit_hash && (
                      <span className="commit-hash-pill" title={`Merged Commit: ${ws.metadata.commit_hash}`}>
                        <GitMerge size={11} />
                        <code>{ws.metadata.commit_hash}</code>
                      </span>
                    )}
                  </div>

                  {/* Interactive Action Buttons */}
                  <div className="card-action-btn-row">
                    {ws.status !== "merged" && ws.status !== "pruned" && (
                      <button
                        type="button"
                        className="card-btn verify-action-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleAction(ws.workspace_id, "verify");
                        }}
                        disabled={isVerifying || isMerging}
                        title="Run 1:1 Target Test Verification Gate"
                      >
                        <ShieldCheck size={13} className={isVerifying ? "spin" : ""} />
                        <span>{isVerifying ? "Verifying..." : "Verify Workspace"}</span>
                      </button>
                    )}

                    {ws.status === "verified" && (
                      <button
                        type="button"
                        className="card-btn merge-action-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleAction(ws.workspace_id, "merge");
                        }}
                        disabled={isMerging}
                        title="Atomic Fast-Forward / Rebase Merge into Main"
                      >
                        <GitMerge size={13} className={isMerging ? "spin" : ""} />
                        <span>{isMerging ? "Merging..." : "Merge into Main"}</span>
                      </button>
                    )}

                    {ws.status === "merged" && (
                      <button
                        type="button"
                        className="card-btn prune-action-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleAction(ws.workspace_id, "prune");
                        }}
                        disabled={isPruning}
                        title="Safely prune worktree folder and Git metadata"
                      >
                        <Trash2 size={13} className={isPruning ? "spin" : ""} />
                        <span>{isPruning ? "Pruning..." : "Prune Worktree"}</span>
                      </button>
                    )}

                    {ws.status !== "merged" && ws.status !== "pruned" && ws.status !== "discarded" && (
                      <button
                        type="button"
                        className="card-btn discard-action-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleAction(ws.workspace_id, "discard");
                        }}
                        disabled={isDiscarding}
                        title="Discard branch without polluting main"
                      >
                        <XCircle size={13} className={isDiscarding ? "spin" : ""} />
                        <span>{isDiscarding ? "Discarding..." : "Discard"}</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Spawn Procedure Workspace Modal */}
      {isSpawnModalOpen && (
        <div className="modal-backdrop" onClick={() => setIsSpawnModalOpen(false)}>
          <div
            className="modal-panel spawn-workspace-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Spawn Procedure Workspace"
          >
            <div className="modal-header">
              <div className="modal-title-group">
                <FolderGit2 size={20} className="modal-brand-icon" />
                <div>
                  <h2>Spawn Procedure Workspace</h2>
                  <p>Creates an isolated Git worktree on a dedicated branch with procedure skills mounted</p>
                </div>
              </div>

              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setIsSpawnModalOpen(false)}
                aria-label="Close modal"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSpawnSubmit} className="spawn-form">
              <div className="form-group">
                <label htmlFor="procedure-type-select">
                  <span>Procedure Responsibility Type *</span>
                </label>
                <select
                  id="procedure-type-select"
                  value={spawnProcedureType}
                  onChange={(e) => setSpawnProcedureType(e.target.value as ProcedureType)}
                  required
                >
                  <option value="PLANNING">PLANNING — Specification & Task Decomposition</option>
                  <option value="INNER_LOOP_TDD">INNER_LOOP_TDD — Pinpoint Test-Driven Development</option>
                  <option value="SECURITY_AUDIT">SECURITY_AUDIT — Hook Interceptors & Guard Verification</option>
                  <option value="RELEASE_GATE">RELEASE_GATE — Single Regression Sweep & Compaction</option>
                </select>
                <small className="form-hint">
                  Determines the active skill bindings and safety guard hooks mounted into .workspaces/&lt;task_id&gt;
                </small>
              </div>

              <div className="form-group">
                <label htmlFor="spawn-task-id">
                  <span>Task Identifier / Slug *</span>
                </label>
                <input
                  id="spawn-task-id"
                  type="text"
                  placeholder="e.g. task-05-auth-middleware"
                  value={spawnTaskId}
                  onChange={(e) => setSpawnTaskId(e.target.value)}
                  required
                />
                <small className="form-hint">
                  Creates branch <code>worktree/{spawnTaskId || "&lt;task_id&gt;"}</code> at <code>.workspaces/{spawnTaskId || "&lt;task_id&gt;"}</code>
                </small>
              </div>

              <div className="form-group">
                <label htmlFor="spawn-target-test">
                  <span>Target Test File Binding (1:1 Gate)</span>
                </label>
                <input
                  id="spawn-target-test"
                  type="text"
                  placeholder="e.g. apps/catalog-ui/test/procedure-workspaces.test.js"
                  value={spawnTargetTestFile}
                  onChange={(e) => setSpawnTargetTestFile(e.target.value)}
                />
                <small className="form-hint">
                  The pinpoint test file required to achieve 100% pass rate before merge gate unlocks
                </small>
              </div>

              <div className="form-group">
                <label htmlFor="spawn-owned-files">
                  <span>Owned Files Boundary (comma-separated)</span>
                </label>
                <textarea
                  id="spawn-owned-files"
                  rows={2}
                  placeholder="apps/catalog-ui/src/components/flow/, apps/catalog-ui/src/api/"
                  value={spawnOwnedFiles}
                  onChange={(e) => setSpawnOwnedFiles(e.target.value)}
                />
                <small className="form-hint">
                  Files that this workspace is authorized to mutate without scope collision
                </small>
              </div>

              <div className="form-group">
                <label htmlFor="spawn-prohibited-actions">
                  <span>Prohibited Actions (comma-separated)</span>
                </label>
                <input
                  id="spawn-prohibited-actions"
                  type="text"
                  placeholder="npm test, pytest, modify_root_contracts, full_test_sweep"
                  value={spawnProhibitedActions}
                  onChange={(e) => setSpawnProhibitedActions(e.target.value)}
                />
                <small className="form-hint">
                  Commands blocked by test storm suppression and invariant guards
                </small>
              </div>

              <div className="form-group">
                <label htmlFor="spawn-active-skills">
                  <span>Active Skill Overrides (comma-separated, optional)</span>
                </label>
                <input
                  id="spawn-active-skills"
                  type="text"
                  placeholder="Leave empty for procedure defaults"
                  value={spawnActiveSkills}
                  onChange={(e) => setSpawnActiveSkills(e.target.value)}
                />
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="action-btn secondary-btn"
                  onClick={() => setIsSpawnModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="action-btn primary-btn"
                  disabled={spawnSubmitting || !spawnTaskId.trim()}
                >
                  <Plus size={15} className={spawnSubmitting ? "spin" : ""} />
                  <span>{spawnSubmitting ? "Spawning..." : "Spawn Isolated Worktree"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
