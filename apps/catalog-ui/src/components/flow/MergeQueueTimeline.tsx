import { useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  Award,
  CheckCircle2,
  Clock,
  Code2,
  Compass,
  CornerDownRight,
  FastForward,
  GitBranch,
  GitCommit,
  GitMerge,
  Layers,
  Play,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Workflow,
  XCircle,
} from "lucide-react";
import type {
  MergeQueueItem,
  MergeQueueStatus,
  ProcedureType,
} from "../../types";
import { getProcedureBadgeColor } from "./ProcedureWorkspaceVisualizer";

export interface MergeQueueTimelineProps {
  queueStatus: MergeQueueStatus;
  onProcessQueue?: () => Promise<void> | void;
  onVerifyItem?: (workspaceId: string) => Promise<void> | void;
  onMergeItem?: (workspaceId: string) => Promise<void> | void;
  onDiscardItem?: (workspaceId: string, reason?: string) => Promise<void> | void;
  onRefresh?: () => void;
  isLoading?: boolean;
}

export function MergeQueueTimeline({
  queueStatus,
  onProcessQueue,
  onVerifyItem,
  onMergeItem,
  onDiscardItem,
  onRefresh,
  isLoading = false,
}: MergeQueueTimelineProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [actionItemLoading, setActionItemLoading] = useState<string | null>(null);

  const queue = queueStatus.queue || [];
  const mergedCount = queueStatus.merged?.length || queue.filter((i) => i.status === "merged").length;
  const verifiedCount = queueStatus.verified?.length || queue.filter((i) => i.status === "verified").length;
  const inVerifCount =
    queueStatus.in_verification?.length || queue.filter((i) => i.status === "in_verification").length;
  const pendingCount = queueStatus.pending?.length || queue.filter((i) => i.status === "pending").length;
  const failedCount = queueStatus.failed?.length || queue.filter((i) => i.status === "failed").length;

  const totalCount = queue.length;
  const progressPercent = totalCount > 0 ? Math.round((mergedCount / totalCount) * 100) : 0;

  const handleProcessQueue = async () => {
    if (!onProcessQueue) return;
    setIsProcessing(true);
    try {
      await onProcessQueue();
    } finally {
      setIsProcessing(false);
    }
  };

  const handleItemAction = async (
    workspaceId: string,
    action: "verify" | "merge" | "discard",
  ) => {
    setActionItemLoading(`${workspaceId}-${action}`);
    try {
      if (action === "verify" && onVerifyItem) {
        await onVerifyItem(workspaceId);
      } else if (action === "merge" && onMergeItem) {
        await onMergeItem(workspaceId);
      } else if (action === "discard" && onDiscardItem) {
        await onDiscardItem(workspaceId, "Discarded from Queue Timeline");
      }
    } finally {
      setActionItemLoading(null);
    }
  };

  return (
    <div className="merge-queue-timeline-view" aria-label="Sequential Git Merge Queue Timeline">
      {/* Queue Header & Fast-Forward Progress Summary */}
      <div className="queue-summary-banner">
        <div className="queue-summary-left">
          <div className="queue-brand-heading">
            <GitMerge size={22} className="queue-icon" />
            <div>
              <h3>Sequential Merge Pipeline</h3>
              <p>Atomic Fast-Forward / Rebase Engine &bull; Strict Dependency Ordering &bull; 100% Target Test Gate</p>
            </div>
          </div>

          {/* Fast-Forward Visual Progress Bar */}
          <div className="queue-progress-container">
            <div className="progress-metrics-row">
              <span className="progress-label">
                <FastForward size={14} className="ff-icon" />
                <span>Fast-Forward Progress: <strong>{progressPercent}%</strong></span>
              </span>
              <span className="progress-stats">
                {mergedCount} of {totalCount} merged &bull; {verifiedCount + inVerifCount + pendingCount} remaining
              </span>
            </div>

            <div className="queue-progress-track">
              <div
                className="queue-progress-fill"
                style={{ width: `${progressPercent}%` }}
                role="progressbar"
                aria-valuenow={progressPercent}
                aria-valuemin={0}
                aria-valuemax={100}
              />
              <div className="progress-animated-glow" />
            </div>
          </div>
        </div>

        {/* Action Controls: Process Queue & Refresh */}
        <div className="queue-summary-actions">
          {onRefresh && (
            <button
              type="button"
              className="action-btn secondary-btn"
              onClick={onRefresh}
              disabled={isLoading || isProcessing}
              title="Refresh queue state"
              aria-label="Refresh merge queue"
            >
              <RefreshCw size={15} className={isLoading ? "spin" : ""} />
              <span>Refresh Queue</span>
            </button>
          )}

          <button
            type="button"
            className="action-btn primary-btn process-queue-btn"
            onClick={handleProcessQueue}
            disabled={isProcessing || isLoading || pendingCount + verifiedCount === 0}
            aria-label="Process Sequential Merge Queue"
          >
            <Play size={16} className={isProcessing ? "spin" : ""} />
            <span>{isProcessing ? "Processing Queue..." : "Process Queue"}</span>
          </button>
        </div>
      </div>

      {/* Stage Breakdown Metric Pills */}
      <div className="queue-stage-pills-row">
        <div className="stage-metric-pill merged">
          <GitMerge size={14} />
          <span>Merged: <strong>{mergedCount}</strong></span>
        </div>
        <div className="stage-metric-pill verified">
          <CheckCircle2 size={14} />
          <span>Verified: <strong>{verifiedCount}</strong></span>
        </div>
        <div className="stage-metric-pill in-verification">
          <Clock size={14} className="spin" />
          <span>In Verification: <strong>{inVerifCount}</strong></span>
        </div>
        <div className="stage-metric-pill pending">
          <Clock size={14} />
          <span>Pending: <strong>{pendingCount}</strong></span>
        </div>
        {failedCount > 0 && (
          <div className="stage-metric-pill failed">
            <AlertCircle size={14} />
            <span>Failed / Rejected: <strong>{failedCount}</strong></span>
          </div>
        )}
      </div>

      {/* Sequential Timeline Node Flow */}
      <div className="timeline-flow-container">
        {queue.length === 0 ? (
          <div className="empty-queue-message">
            <GitMerge size={32} />
            <h4>Merge Queue is Empty</h4>
            <p>Spawn procedure workspaces to automatically enqueue branches in dependency lineage order.</p>
          </div>
        ) : (
          <div className="timeline-nodes-list" role="list">
            {queue.map((item, index) => {
              const position = item.position ?? index + 1;
              const isFirst = index === 0;
              const isLast = index === queue.length - 1;
              const isCurrent = queueStatus.current?.workspace_id === item.workspace_id;
              const procedureType = item.procedure_type || ("INNER_LOOP_TDD" as ProcedureType);
              const badge = getProcedureBadgeColor(procedureType);

              const isItemVerifying = actionItemLoading === `${item.workspace_id}-verify`;
              const isItemMerging = actionItemLoading === `${item.workspace_id}-merge`;
              const isItemDiscarding = actionItemLoading === `${item.workspace_id}-discard`;

              const isMerged = item.status === "merged";
              const isVerified = item.status === "verified";
              const isInVerification = item.status === "in_verification";
              const isPending = item.status === "pending";
              const isFailed = item.status === "failed";
              const isDiscarded = item.status === "discarded";

              return (
                <div key={item.workspace_id} className="timeline-node-wrapper" role="listitem">
                  {/* Sequence Lineage Connector Arrow */}
                  {!isFirst && (
                    <div className="timeline-connector-track">
                      <div className={`connector-line ${isMerged ? "merged" : "active"}`} />
                      <div className="connector-arrow">
                        <ArrowRight size={14} className={isMerged ? "mint" : "muted"} />
                      </div>
                    </div>
                  )}

                  {/* Timeline Stage Node Card */}
                  <div
                    className={`timeline-stage-card ${item.status} ${isCurrent ? "current-head" : ""}`}
                  >
                    {/* Position Badge & Current Pointer */}
                    <div className="timeline-card-header">
                      <div className="position-indicator-group">
                        <span className={`position-badge ${isMerged ? "merged" : isVerified ? "verified" : ""}`}>
                          #{position}
                        </span>
                        {isCurrent && (
                          <span className="current-pointer-pill">
                            <span className="pulse-dot" />
                            <span>Current Head</span>
                          </span>
                        )}
                      </div>

                      {/* Stage Status Indicator */}
                      <span className={`stage-status-indicator ${item.status}`}>
                        {isMerged ? (
                          <>
                            <GitMerge size={12} />
                            <span>Merged</span>
                          </>
                        ) : isVerified ? (
                          <>
                            <CheckCircle2 size={12} />
                            <span>Verified</span>
                          </>
                        ) : isInVerification ? (
                          <>
                            <Clock size={12} className="spin" />
                            <span>In Verification</span>
                          </>
                        ) : isFailed ? (
                          <>
                            <AlertCircle size={12} />
                            <span>Failed</span>
                          </>
                        ) : isDiscarded ? (
                          <>
                            <XCircle size={12} />
                            <span>Discarded</span>
                          </>
                        ) : (
                          <>
                            <Clock size={12} />
                            <span>Pending</span>
                          </>
                        )}
                      </span>
                    </div>

                    {/* Task Title & Procedure Badge */}
                    <div className="timeline-card-body">
                      <div className="task-heading-row">
                        <span className={`procedure-mini-badge ${badge.badgeClass}`}>
                          {item.procedure_type === "PLANNING" ? (
                            <Compass size={11} />
                          ) : item.procedure_type === "INNER_LOOP_TDD" ? (
                            <Code2 size={11} />
                          ) : item.procedure_type === "SECURITY_AUDIT" ? (
                            <ShieldAlert size={11} />
                          ) : (
                            <Award size={11} />
                          )}
                          <span>{procedureType}</span>
                        </span>
                        <h4 className="timeline-task-id" title={item.task_id || item.workspace_id}>
                          {item.task_id || item.workspace_id}
                        </h4>
                      </div>

                      {/* Dependency Lineage Requirement Links */}
                      {item.dependencies && item.dependencies.length > 0 ? (
                        <div className="dependencies-lineage-row">
                          <CornerDownRight size={12} className="dep-icon" />
                          <span className="dep-label">Depends on:</span>
                          <div className="dep-chips">
                            {item.dependencies.map((dep) => {
                              const isDepMerged = queue.some(
                                (q) => (q.workspace_id === dep || q.task_id === dep) && q.status === "merged",
                              );
                              return (
                                <span
                                  key={dep}
                                  className={`dep-chip ${isDepMerged ? "satisfied" : "unmet"}`}
                                  title={isDepMerged ? "Dependency merged into main" : "Dependency not yet merged"}
                                >
                                  {isDepMerged ? "✔ " : "⏳ "}
                                  {dep}
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      ) : (
                        <div className="root-lineage-row">
                          <span className="root-label">Root Task (Zero Dependencies)</span>
                        </div>
                      )}

                      {/* Commit Hash Pill if Merged */}
                      {item.commit_hash && (
                        <div className="merged-commit-row">
                          <GitCommit size={13} className="mint" />
                          <span className="commit-label">Commit Hash:</span>
                          <code className="commit-code">{item.commit_hash}</code>
                        </div>
                      )}
                    </div>

                    {/* Stage Timeline Action Controls */}
                    <div className="timeline-card-actions">
                      {isPending && onVerifyItem && (
                        <button
                          type="button"
                          className="queue-btn verify-btn"
                          onClick={() => handleItemAction(item.workspace_id, "verify")}
                          disabled={isItemVerifying}
                        >
                          <ShieldCheck size={12} className={isItemVerifying ? "spin" : ""} />
                          <span>{isItemVerifying ? "Verifying..." : "Verify Gate"}</span>
                        </button>
                      )}

                      {isVerified && onMergeItem && (
                        <button
                          type="button"
                          className="queue-btn merge-btn"
                          onClick={() => handleItemAction(item.workspace_id, "merge")}
                          disabled={isItemMerging}
                        >
                          <GitMerge size={12} className={isItemMerging ? "spin" : ""} />
                          <span>{isItemMerging ? "Fast-Forward..." : "Merge FF"}</span>
                        </button>
                      )}

                      {!isMerged && !isDiscarded && onDiscardItem && (
                        <button
                          type="button"
                          className="queue-btn discard-btn"
                          onClick={() => handleItemAction(item.workspace_id, "discard")}
                          disabled={isItemDiscarding}
                          title="Reject and isolate branch"
                        >
                          <XCircle size={12} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
