import { useEffect, useState, useCallback } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Columns,
  FastForward,
  FolderGit2,
  GitBranch,
  GitMerge,
  Layers,
  LayoutGrid,
  ListOrdered,
  Plus,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Workflow,
  X,
} from "lucide-react";
import type {
  CreateProcedureWorkspaceOptions,
  MergeQueueStatus,
  ProcedureType,
  ProcedureWorkspace,
} from "../../types";
import type { FlowNodeDetail } from "./flow-types";
import {
  fetchMergeQueue,
  fetchProcedureWorkspaces,
  mergeProcedureWorkspaceApi,
  processMergeQueueApi,
  pruneProcedureWorkspaceApi,
  discardProcedureWorkspaceApi,
  spawnProcedureWorkspaceApi,
  verifyProcedureWorkspaceApi,
} from "../../api/catalog-api";
import { ProcedureWorkspaceVisualizer } from "./ProcedureWorkspaceVisualizer";
import { MergeQueueTimeline } from "./MergeQueueTimeline";

export interface ProcedureWorkspacesViewProps {
  projectPath?: string;
  selectedNodeId?: string | null;
  onSelectNode?: (node: FlowNodeDetail) => void;
}

export function ProcedureWorkspacesView({
  projectPath,
  selectedNodeId,
  onSelectNode,
}: ProcedureWorkspacesViewProps) {
  const [workspaces, setWorkspaces] = useState<ProcedureWorkspace[]>([]);
  const [queueStatus, setQueueStatus] = useState<MergeQueueStatus>({ queue: [] });
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(
    selectedNodeId ?? null,
  );
  const [subViewLayout, setSubViewLayout] = useState<"dual" | "worktrees" | "queue">("dual");
  const [isLoading, setIsLoading] = useState(false);
  const [notification, setNotification] = useState<{
    type: "success" | "error" | "info";
    message: string;
  } | null>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [wsList, qStatus] = await Promise.all([
        fetchProcedureWorkspaces(projectPath),
        fetchMergeQueue(projectPath),
      ]);
      setWorkspaces(wsList);
      setQueueStatus(qStatus);
    } catch (e: any) {
      setNotification({
        type: "error",
        message: `Failed to load workspaces: ${e.message || "Unknown error"}`,
      });
    } finally {
      setIsLoading(false);
    }
  }, [projectPath]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Convert ProcedureWorkspace to FlowNodeDetail for inspector drawer
  const handleSelectWorkspace = useCallback(
    (ws: ProcedureWorkspace) => {
      setSelectedWorkspaceId(ws.workspace_id);
      if (onSelectNode) {
        const nodeDetail: FlowNodeDetail = {
          id: ws.workspace_id,
          type: "task_card",
          name: ws.metadata?.task_id || ws.workspace_id,
          category: `Procedure: ${ws.procedure_type}`,
          status:
            ws.status === "verified" || ws.status === "merged"
              ? "passed"
              : ws.status === "failed" || ws.status === "discarded"
              ? "blocked"
              : "active",
          description:
            ws.metadata?.description ||
            `Isolated Git Worktree on ${ws.git_branch} with ${ws.procedure_type} active skill roster.`,
          lineage: {
            topicId: ws.workspace_id,
            canonicalName: ws.metadata?.task_id || ws.workspace_id,
            path: [ws.git_worktree_path, ws.git_branch],
            lifecycleState:
              ws.status === "merged"
                ? "CLOSED"
                : ws.status === "verified"
                ? "VERIFIED"
                : "IN_PROGRESS",
          },
          verification: {
            targetTestFile: ws.responsibility_invariants?.target_test_file || "N/A",
            allowedCommand: ws.responsibility_invariants?.target_test_file
              ? `node --test ${ws.responsibility_invariants.target_test_file}`
              : "run_scoped_test",
            prohibitedCommands: ws.responsibility_invariants?.prohibited_actions || [],
            invariants: {
              preConditions: [
                `Worktree branch ${ws.git_branch} isolated`,
                "Root main pinned and pristine",
              ],
              strictInvariants: ws.responsibility_invariants?.prohibited_actions || [
                "Zero physical link mutations on root main",
              ],
              postConditions: ws.responsibility_invariants?.acceptance_criteria || [
                "100% target test verified before merge",
              ],
            },
          },
          worktree: {
            workspaceId: ws.workspace_id,
            procedureType: ws.procedure_type,
            gitBranch: ws.git_branch,
            gitWorktreePath: ws.git_worktree_path,
            status: ws.status,
            invariants: ws.responsibility_invariants,
            activeSkills: ws.active_skills,
            activeGuards: ws.active_guards,
            createdAt: ws.created_at,
            completedAt: ws.completed_at,
            commitHash: ws.metadata?.commit_hash || null,
            metadata: ws.metadata,
          },
        };
        onSelectNode(nodeDetail);
      }
    },
    [onSelectNode],
  );

  const handleSpawn = async (options: CreateProcedureWorkspaceOptions) => {
    try {
      const created = await spawnProcedureWorkspaceApi({
        ...options,
        project_path: projectPath,
      });
      setNotification({
        type: "success",
        message: `Successfully spawned isolated worktree ${created.workspace_id} on ${created.git_branch}`,
      });
      await loadData();
    } catch (e: any) {
      setNotification({
        type: "error",
        message: `Spawn failed: ${e.message || "Unknown error"}`,
      });
    }
  };

  const handleVerify = async (workspaceId: string) => {
    try {
      const result = await verifyProcedureWorkspaceApi(workspaceId, projectPath);
      if (result.verified) {
        setNotification({
          type: "success",
          message: `Workspace ${workspaceId} target test passed 100%! All invariants verified.`,
        });
      } else {
        setNotification({
          type: "error",
          message: `Verification failed for ${workspaceId}: ${result.error || "Invariants not satisfied"}`,
        });
      }
      await loadData();
    } catch (e: any) {
      setNotification({
        type: "error",
        message: `Verification error: ${e.message || "Unknown error"}`,
      });
    }
  };

  const handleMerge = async (workspaceId: string) => {
    try {
      const result = await mergeProcedureWorkspaceApi(workspaceId, projectPath);
      if (result.merged) {
        setNotification({
          type: "success",
          message: `Atomic merge succeeded for ${workspaceId} into main [commit ${result.commit_hash}]`,
        });
      } else {
        setNotification({
          type: "error",
          message: `Merge failed for ${workspaceId}: ${result.error || "Dependency or verification issue"}`,
        });
      }
      await loadData();
    } catch (e: any) {
      setNotification({
        type: "error",
        message: `Merge error: ${e.message || "Unknown error"}`,
      });
    }
  };

  const handlePrune = async (workspaceId: string) => {
    try {
      const result = await pruneProcedureWorkspaceApi(workspaceId, projectPath);
      if (result.pruned) {
        setNotification({
          type: "info",
          message: `Pruned isolated worktree folder and Git metadata for ${workspaceId}`,
        });
      }
      await loadData();
    } catch (e: any) {
      setNotification({
        type: "error",
        message: `Prune error: ${e.message || "Unknown error"}`,
      });
    }
  };

  const handleDiscard = async (workspaceId: string, reason?: string) => {
    try {
      const result = await discardProcedureWorkspaceApi(workspaceId, reason, projectPath);
      if (result.discarded) {
        setNotification({
          type: "info",
          message: `Discarded branch for ${workspaceId} without polluting main`,
        });
      }
      await loadData();
    } catch (e: any) {
      setNotification({
        type: "error",
        message: `Discard error: ${e.message || "Unknown error"}`,
      });
    }
  };

  const handleProcessQueue = async () => {
    try {
      const result = await processMergeQueueApi(projectPath);
      const successful = result.processed.filter((p) => p.success).length;
      setNotification({
        type: "success",
        message: `Sequential merge queue processed: ${successful} branch(es) atomically fast-forwarded into main`,
      });
      await loadData();
    } catch (e: any) {
      setNotification({
        type: "error",
        message: `Process queue error: ${e.message || "Unknown error"}`,
      });
    }
  };

  // Metrics counters
  const totalWorkspacesCount = workspaces.length;
  const activeCount = workspaces.filter(
    (w) => w.status === "active" || w.status === "in_verification",
  ).length;
  const verifiedCount = workspaces.filter((w) => w.status === "verified").length;
  const mergedCount = workspaces.filter((w) => w.status === "merged").length;

  return (
    <div className="procedure-workspaces-view" aria-label="Procedure Workspaces & Merge Queue Workspace">
      {/* Top Banner KPI Metric Strip */}
      <div className="procedure-kpi-strip">
        <div className="kpi-metric-card">
          <div className="kpi-header">
            <FolderGit2 size={16} className="cyan" />
            <span>Total Worktrees</span>
          </div>
          <div className="kpi-value">{totalWorkspacesCount}</div>
          <small className="kpi-hint">Isolated Git branches</small>
        </div>

        <div className="kpi-metric-card">
          <div className="kpi-header">
            <RefreshCw size={16} className="mint" />
            <span>Active & In-Verif</span>
          </div>
          <div className="kpi-value">{activeCount}</div>
          <small className="kpi-hint">Workspaces in flight</small>
        </div>

        <div className="kpi-metric-card">
          <div className="kpi-header">
            <ShieldCheck size={16} className="emerald" />
            <span>100% Verified</span>
          </div>
          <div className="kpi-value">{verifiedCount}</div>
          <small className="kpi-hint">Ready for Fast-Forward</small>
        </div>

        <div className="kpi-metric-card">
          <div className="kpi-header">
            <GitMerge size={16} className="mint" />
            <span>Merged into Main</span>
          </div>
          <div className="kpi-value">{mergedCount}</div>
          <small className="kpi-hint">Atomic FF / rebase completed</small>
        </div>

        {/* Layout Switcher Buttons */}
        <div className="kpi-layout-switcher">
          <button
            type="button"
            className={`layout-switch-btn ${subViewLayout === "dual" ? "active" : ""}`}
            onClick={() => setSubViewLayout("dual")}
            title="Dual-Pane View (Worktrees + Sequential Queue Timeline)"
          >
            <Columns size={15} />
            <span>Dual View</span>
          </button>

          <button
            type="button"
            className={`layout-switch-btn ${subViewLayout === "worktrees" ? "active" : ""}`}
            onClick={() => setSubViewLayout("worktrees")}
            title="Worktrees Inventory Grid Only"
          >
            <LayoutGrid size={15} />
            <span>Worktrees</span>
          </button>

          <button
            type="button"
            className={`layout-switch-btn ${subViewLayout === "queue" ? "active" : ""}`}
            onClick={() => setSubViewLayout("queue")}
            title="Sequential Merge Queue Timeline Only"
          >
            <ListOrdered size={15} />
            <span>Merge Queue</span>
          </button>
        </div>
      </div>

      {/* Action Notification Banner */}
      {notification && (
        <div className={`workspace-action-notice ${notification.type}`}>
          {notification.type === "success" ? (
            <CheckCircle2 size={16} />
          ) : notification.type === "error" ? (
            <AlertCircle size={16} />
          ) : (
            <Workflow size={16} />
          )}
          <span>{notification.message}</span>
          <button
            type="button"
            className="close-notice-btn"
            onClick={() => setNotification(null)}
            aria-label="Dismiss notification"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Main Panes Container */}
      <div className={`procedure-panes-container ${subViewLayout}`}>
        {/* Worktrees Visualizer Pane */}
        {(subViewLayout === "dual" || subViewLayout === "worktrees") && (
          <section className="pane-section worktrees-pane">
            <div className="pane-title-bar">
              <div className="pane-title-group">
                <FolderGit2 size={17} className="cyan" />
                <h3>Isolated Git Worktree Inventory</h3>
              </div>
              <span className="pane-badge">{workspaces.length} branches</span>
            </div>

            <ProcedureWorkspaceVisualizer
              workspaces={workspaces}
              selectedWorkspaceId={selectedWorkspaceId}
              onSelectWorkspace={handleSelectWorkspace}
              onSpawnWorkspace={handleSpawn}
              onVerifyWorkspace={handleVerify}
              onMergeWorkspace={handleMerge}
              onPruneWorkspace={handlePrune}
              onDiscardWorkspace={handleDiscard}
              onRefresh={loadData}
              isLoading={isLoading}
            />
          </section>
        )}

        {/* Sequential Merge Queue Timeline Pane */}
        {(subViewLayout === "dual" || subViewLayout === "queue") && (
          <section className="pane-section queue-pane">
            <div className="pane-title-bar">
              <div className="pane-title-group">
                <GitMerge size={17} className="mint" />
                <h3>Sequential Merge Queue Timeline</h3>
              </div>
              <span className="pane-badge">{queueStatus.queue?.length || 0} queued</span>
            </div>

            <MergeQueueTimeline
              queueStatus={queueStatus}
              onProcessQueue={handleProcessQueue}
              onVerifyItem={handleVerify}
              onMergeItem={handleMerge}
              onDiscardItem={handleDiscard}
              onRefresh={loadData}
              isLoading={isLoading}
            />
          </section>
        )}
      </div>
    </div>
  );
}
