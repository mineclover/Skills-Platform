import { useEffect, useState } from "react";
import {
  AlertOctagon,
  AlertTriangle,
  Check,
  CheckCircle2,
  Clock,
  Code2,
  Copy,
  Cpu,
  FileCode,
  FolderTree,
  GitBranch,
  Layers,
  OctagonX,
  Shield,
  ShieldAlert,
  Sparkles,
  Terminal,
  X,
  Zap,
} from "lucide-react";
import { copyText } from "../../api/catalog-api";
import type { FlowNodeDetail } from "./flow-types";

interface NodeDetailInspectorProps {
  node: FlowNodeDetail | null;
  isOpen: boolean;
  onClose: () => void;
}

export function NodeDetailInspector({ node, isOpen, onClose }: NodeDetailInspectorProps) {
  const [copiedTarget, setCopiedTarget] = useState<string | null>(null);

  // Close on escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !node) {
    return null;
  }

  const handleCopy = async (text: string, label: string) => {
    await copyText(text);
    setCopiedTarget(label);
    setTimeout(() => setCopiedTarget(null), 2000);
  };

  const isBlocked = node.status === "blocked";
  const isPassed = node.status === "passed";
  const isDrift = node.status === "drift";

  return (
    <div className="inspector-drawer-overlay" onClick={onClose} role="presentation">
      <div
        className="inspector-drawer-panel"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={`Node Detail Inspector: ${node.name}`}
        aria-modal="true"
      >
        {/* Drawer Header */}
        <header className="inspector-header">
          <div className="inspector-title-group">
            <div className="node-type-badge">
              {node.type === "hook_guard" || node.type === "shield_guard" ? (
                <Shield size={16} className="cyan" />
              ) : node.type === "halt_node" ? (
                <OctagonX size={16} className="danger" />
              ) : (
                <Layers size={16} className="mint" />
              )}
              <span>{node.category || node.type}</span>
            </div>
            <h2 className="node-display-name">{node.name}</h2>
          </div>

          <button
            type="button"
            className="inspector-close-btn"
            onClick={onClose}
            aria-label="Close Inspector Drawer"
          >
            <X size={20} />
          </button>
        </header>

        {/* Status Bar */}
        <div className="inspector-status-bar">
          <div className="status-item">
            <span className="status-label">Lifecycle Status</span>
            <span className={`status-pill ${node.status}`}>
              {isPassed ? (
                <CheckCircle2 size={12} />
              ) : isBlocked ? (
                <AlertOctagon size={12} />
              ) : isDrift ? (
                <AlertTriangle size={12} />
              ) : (
                <Clock size={12} />
              )}
              {node.status.toUpperCase()}
            </span>
          </div>

          {node.lineage.lifecycleState ? (
            <div className="status-item">
              <span className="status-label">Spec State</span>
              <span className="state-badge">{node.lineage.lifecycleState}</span>
            </div>
          ) : null}

          {node.metrics?.durationMs !== undefined ? (
            <div className="status-item">
              <span className="status-label">Execution Duration</span>
              <span className="metric-badge">{node.metrics.durationMs} ms</span>
            </div>
          ) : null}
        </div>

        {/* Scrollable Body */}
        <div className="inspector-body">
          {/* Description */}
          {node.description ? (
            <section className="inspector-section">
              <h3 className="section-heading">Description</h3>
              <p className="node-description-text">{node.description}</p>
            </section>
          ) : null}

          {/* Canonical Lineage & Hierarchy */}
          <section className="inspector-section">
            <div className="section-heading-row">
              <FolderTree size={16} className="cyan" />
              <h3 className="section-heading">Canonical Lineage & Hierarchy</h3>
            </div>
            <div className="lineage-box">
              {node.lineage.topicId ? (
                <div className="lineage-row">
                  <span className="lineage-k">Topic ID:</span>
                  <code className="lineage-v">{node.lineage.topicId}</code>
                  <button
                    type="button"
                    className="copy-chip-btn"
                    onClick={() => handleCopy(node.lineage.topicId!, "topicId")}
                    title="Copy Topic ID"
                  >
                    {copiedTarget === "topicId" ? <Check size={12} /> : <Copy size={12} />}
                  </button>
                </div>
              ) : null}

              {node.lineage.canonicalName ? (
                <div className="lineage-row">
                  <span className="lineage-k">Canonical Name:</span>
                  <span className="lineage-v">{node.lineage.canonicalName}</span>
                </div>
              ) : null}

              <div className="lineage-row">
                <span className="lineage-k">Lineage Path:</span>
                <span className="lineage-path-chips">
                  {node.lineage.path.map((segment, idx) => (
                    <span key={idx} className="path-chip">
                      {segment}
                    </span>
                  ))}
                </span>
              </div>
            </div>
          </section>

          {/* Hook Interception Diagnostics (If Blocked / Diagnostics Present) */}
          {node.diagnostics ? (
            <section className="inspector-section diagnostics-section">
              <div className="section-heading-row">
                <ShieldAlert size={16} className="danger" />
                <h3 className="section-heading danger">Hook Interception Diagnostics</h3>
              </div>

              <div className="diagnostics-card">
                {node.diagnostics.violationType ? (
                  <div className="diagnostic-item">
                    <span className="diag-k">Violation Type:</span>
                    <span className="diag-v-badge danger">{node.diagnostics.violationType}</span>
                  </div>
                ) : null}

                {node.diagnostics.blockedCommand ? (
                  <div className="diagnostic-item">
                    <span className="diag-k">Blocked Command:</span>
                    <code className="diag-command-box">{node.diagnostics.blockedCommand}</code>
                    <button
                      type="button"
                      className="copy-chip-btn"
                      onClick={() =>
                        handleCopy(node.diagnostics!.blockedCommand!, "blockedCommand")
                      }
                      title="Copy Blocked Command"
                    >
                      {copiedTarget === "blockedCommand" ? <Check size={12} /> : <Copy size={12} />}
                    </button>
                  </div>
                ) : null}

                {node.diagnostics.reason ? (
                  <div className="diagnostic-item">
                    <span className="diag-k">Interception Reason:</span>
                    <p className="diag-reason-text">{node.diagnostics.reason}</p>
                  </div>
                ) : null}

                {node.diagnostics.selfCorrectHint ? (
                  <div className="self-correct-box">
                    <div className="hint-header">
                      <Sparkles size={14} className="mint" />
                      <strong>Actionable Self-Correction Guidance:</strong>
                    </div>
                    <p className="hint-text">{node.diagnostics.selfCorrectHint}</p>
                    <button
                      type="button"
                      className="copy-hint-btn"
                      onClick={() => handleCopy(node.diagnostics!.selfCorrectHint!, "selfCorrect")}
                    >
                      {copiedTarget === "selfCorrect" ? (
                        <>
                          <Check size={13} /> Copied Guidance
                        </>
                      ) : (
                        <>
                          <Copy size={13} /> Copy Self-Correction Guidance
                        </>
                      )}
                    </button>
                  </div>
                ) : null}
              </div>
            </section>
          ) : null}

          {/* Verification & Invariant Invariants */}
          {node.verification ? (
            <section className="inspector-section">
              <div className="section-heading-row">
                <FileCode size={16} className="cyan" />
                <h3 className="section-heading">Target Verification & Behavioral Invariants</h3>
              </div>

              <div className="verification-card">
                <div className="verif-row">
                  <span className="verif-k">Pinned Target Test:</span>
                  <code className="verif-v">{node.verification.targetTestFile}</code>
                  <button
                    type="button"
                    className="copy-chip-btn"
                    onClick={() => handleCopy(node.verification!.targetTestFile, "targetTest")}
                    title="Copy Pinned Test File"
                  >
                    {copiedTarget === "targetTest" ? <Check size={12} /> : <Copy size={12} />}
                  </button>
                </div>

                <div className="verif-row">
                  <span className="verif-k">Allowed Command:</span>
                  <code className="verif-v">{node.verification.allowedCommand}</code>
                </div>

                {node.verification.prohibitedCommands.length > 0 ? (
                  <div className="verif-row">
                    <span className="verif-k">Prohibited Rules:</span>
                    <div className="prohibited-list">
                      {node.verification.prohibitedCommands.map((cmd, idx) => (
                        <span key={idx} className="prohibited-chip">
                          {cmd}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}

                {/* Invariant Lists */}
                {node.verification.invariants ? (
                  <div className="invariants-block">
                    {node.verification.invariants.strictInvariants.length > 0 ? (
                      <div className="invariant-subgroup">
                        <strong className="subgroup-title">Strict Behavioral Invariants:</strong>
                        <ul className="invariants-ul">
                          {node.verification.invariants.strictInvariants.map((inv, idx) => (
                            <li key={idx}>{inv}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    {node.verification.invariants.preConditions.length > 0 ? (
                      <div className="invariant-subgroup">
                        <strong className="subgroup-title">Pre-Conditions:</strong>
                        <ul className="invariants-ul">
                          {node.verification.invariants.preConditions.map((pre, idx) => (
                            <li key={idx}>{pre}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </section>
          ) : null}

          {/* Changeset & Live Diff Metrics */}
          {node.metrics?.liveDiff ? (
            <section className="inspector-section">
              <div className="section-heading-row">
                <Code2 size={16} className="cyan" />
                <h3 className="section-heading">Changeset & Live Diff Snippet</h3>
              </div>

              <div className="diff-card">
                <div className="diff-header">
                  <span className="diff-filename">{node.metrics.liveDiff.targetFile}</span>
                  <div className="diff-stats">
                    <span className="diff-add">+{node.metrics.liveDiff.additions}</span>
                    <span className="diff-del">-{node.metrics.liveDiff.deletions}</span>
                  </div>
                </div>
                <pre className="diff-snippet-box">
                  <code>{node.metrics.liveDiff.diffSnippet}</code>
                </pre>
              </div>
            </section>
          ) : null}

          {/* Symlink Junction Details (If Junction Node) */}
          {node.junction ? (
            <section className="inspector-section">
              <div className="section-heading-row">
                <GitBranch size={16} className="cyan" />
                <h3 className="section-heading">Multi-Provider Junction Specs</h3>
              </div>

              <div className="junction-spec-card">
                <div className="junction-spec-row">
                  <span>Provider ID:</span>
                  <strong>{node.junction.providerId}</strong>
                </div>
                <div className="junction-spec-row">
                  <span>Delivery Path:</span>
                  <code>{node.junction.deliveryPath}</code>
                </div>
                <div className="junction-spec-row">
                  <span>Symlink Target:</span>
                  <code>{node.junction.symlinkTarget}</code>
                </div>
                <div className="junction-spec-row">
                  <span>Active Recipe:</span>
                  <span>{node.junction.activePreset ?? "mlc-scoped-inner-loop"}</span>
                </div>
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
