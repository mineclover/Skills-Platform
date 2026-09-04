import React, { useMemo } from "react";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  Cpu,
  Eye,
  FileCode2,
  FileText,
  Layers3,
  LoaderCircle,
  RefreshCcw,
  ShieldCheck,
  Sparkles,
  Terminal,
  X,
  Zap,
} from "lucide-react";
import type {
  ApplyProgress,
  ApplyResult,
  DiagnosticStage,
  DiagnosticStepInfo,
  StepStatus,
} from "../types";
import { getProviderInfo } from "../visual-identity";

// ============================================================================
// 1. Diagnostic Step Definitions & Stage Mapping
// ============================================================================

export const DIAGNOSTIC_STEPS: DiagnosticStepInfo[] = [
  {
    id: "plan",
    label: "Plan",
    shortLabel: "1. Plan",
    description: "Record immutable plan",
    stageBasePercent: 0,
    stageMaxPercent: 20,
  },
  {
    id: "inspect",
    label: "Inspect",
    shortLabel: "2. Inspect",
    description: "Preflight provider bindings",
    stageBasePercent: 20,
    stageMaxPercent: 40,
  },
  {
    id: "preview",
    label: "Preview",
    shortLabel: "3. Preview",
    description: "Validate symlink operations",
    stageBasePercent: 40,
    stageMaxPercent: 60,
  },
  {
    id: "materialize",
    label: "Materialize",
    shortLabel: "4. Materialize",
    description: "Link filesystem bindings",
    stageBasePercent: 60,
    stageMaxPercent: 85,
  },
  {
    id: "verify",
    label: "Verify",
    shortLabel: "5. Verify",
    description: "Validate state invariants",
    stageBasePercent: 85,
    stageMaxPercent: 100,
  },
];

export function mapStageToDiagnosticStep(rawStage?: string | null): DiagnosticStage {
  if (!rawStage) return "plan";
  const stage = rawStage.trim().toLowerCase().replaceAll("-", "_");

  if (stage === "record" || stage === "plan" || stage === "planning" || stage === "init") {
    return "plan";
  }
  if (
    stage === "inspect" ||
    stage === "inspection" ||
    stage === "preflight" ||
    stage === "check"
  ) {
    return "inspect";
  }
  if (
    stage === "preview" ||
    stage === "previewing" ||
    stage === "resolve" ||
    stage === "resolving" ||
    stage === "validation"
  ) {
    return "preview";
  }
  if (
    stage === "apply" ||
    stage === "applying" ||
    stage === "materialize" ||
    stage === "materializing" ||
    stage === "link" ||
    stage === "linking"
  ) {
    return "materialize";
  }
  if (
    stage === "verify" ||
    stage === "verifying" ||
    stage === "verification" ||
    stage === "postflight" ||
    stage === "completed" ||
    stage === "finished" ||
    stage === "done"
  ) {
    return "verify";
  }

  return "plan";
}

export function getDiagnosticStepIndex(stage: DiagnosticStage): number {
  switch (stage) {
    case "plan":
      return 0;
    case "inspect":
      return 1;
    case "preview":
      return 2;
    case "materialize":
      return 3;
    case "verify":
      return 4;
    default:
      return 0;
  }
}

export function getStepNodeState(
  stepIndex: number,
  currentStage: string,
  isFailed = false,
  isCompleted = false,
): StepStatus {
  if (isCompleted) {
    return "completed";
  }

  const activeStage = mapStageToDiagnosticStep(currentStage);
  const activeIndex = getDiagnosticStepIndex(activeStage);

  if (isFailed) {
    if (stepIndex < activeIndex) return "completed";
    if (stepIndex === activeIndex) return "failed";
    return "pending";
  }

  if (stepIndex < activeIndex) return "completed";
  if (stepIndex === activeIndex) return "active";
  return "pending";
}

export function calculateStageProgressPercent(
  progress: ApplyProgress | null,
  isCompleted = false,
  isFailed = false,
): number {
  if (isCompleted) return 100;
  if (!progress) return 0;

  const rawStage = progress.stage?.toLowerCase() || "";
  if (rawStage === "completed" || rawStage === "done") return 100;

  const diagStage = mapStageToDiagnosticStep(rawStage);
  const stepInfo = DIAGNOSTIC_STEPS.find((s) => s.id === diagStage) || DIAGNOSTIC_STEPS[0];

  const base = stepInfo.stageBasePercent;
  const range = stepInfo.stageMaxPercent - stepInfo.stageBasePercent;

  let intraRatio = 0;
  if (progress.total && progress.total > 0) {
    intraRatio = Math.min(1, Math.max(0, progress.completed / progress.total));
  } else if (progress.completed > 0) {
    intraRatio = 0.5;
  }

  if (isFailed) {
    return Math.min(100, Math.round(base + range * intraRatio));
  }

  return Math.min(98, Math.round(base + range * intraRatio));
}

export function formatStageMetric(
  stage: string,
  completed: number,
  total: number,
  message?: string,
): string {
  const diagStage = mapStageToDiagnosticStep(stage);
  const stepInfo = DIAGNOSTIC_STEPS.find((s) => s.id === diagStage) || DIAGNOSTIC_STEPS[0];

  if (total > 0) {
    const unit =
      diagStage === "materialize"
        ? "symlinks"
        : diagStage === "inspect"
        ? "bindings"
        : diagStage === "preview"
        ? "operations"
        : diagStage === "verify"
        ? "invariants"
        : "steps";

    const percent = Math.round((completed / total) * 100);
    return `${stepInfo.label}: ${completed} of ${total} ${unit} processed (${percent}%)`;
  }

  if (message && message.trim()) {
    return `${stepInfo.label}: ${message}`;
  }

  return `${stepInfo.label}: Executing stage diagnostics...`;
}

// ============================================================================
// 2. Visual Stepper Component
// ============================================================================

export interface ActivationStepperProps {
  currentStage: string;
  isFailed?: boolean;
  isCompleted?: boolean;
  className?: string;
}

export function ActivationStepper({
  currentStage,
  isFailed = false,
  isCompleted = false,
  className = "",
}: ActivationStepperProps) {
  const activeStage = mapStageToDiagnosticStep(currentStage);
  const activeIndex = getDiagnosticStepIndex(activeStage);

  return (
    <div
      className={`activation-stepper ${className}`.trim()}
      role="progressbar"
      aria-label="Activation progress stepper"
      aria-valuenow={activeIndex + 1}
      aria-valuemin={1}
      aria-valuemax={5}
    >
      {DIAGNOSTIC_STEPS.map((step, index) => {
        const status = getStepNodeState(index, currentStage, isFailed, isCompleted);
        const isLast = index === DIAGNOSTIC_STEPS.length - 1;

        return (
          <React.Fragment key={step.id}>
            <div className={`step-node-wrapper ${status}`}>
              <div
                className={`step-node ${status}`}
                data-step-id={step.id}
                data-step-status={status}
                title={`${step.label}: ${step.description}`}
              >
                {status === "completed" ? (
                  <Check size={16} strokeWidth={2.6} className="step-check" />
                ) : status === "active" ? (
                  <LoaderCircle size={17} className="spin step-spinner" />
                ) : status === "failed" ? (
                  <AlertCircle size={16} strokeWidth={2.4} className="step-error" />
                ) : (
                  <span className="step-number">{index + 1}</span>
                )}
              </div>
              <div className="step-text-group">
                <span className={`step-label ${status}`}>{step.label}</span>
                <small className="step-desc">{step.description}</small>
              </div>
            </div>

            {!isLast && (
              <div
                className={`step-connector ${
                  index < activeIndex || isCompleted ? "completed" : index === activeIndex && !isFailed ? "active" : ""
                }`}
                aria-hidden="true"
              >
                <div className="connector-fill" />
              </div>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ============================================================================
// 3. Main ActivationProgressModal Component
// ============================================================================

export interface ActivationProgressModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  progress: ApplyProgress | null;
  result: ApplyResult | null;
  error?: string | null;
  isStreaming?: boolean;
  planId?: string | null;
  providerId?: string;
  onRetry?: () => void;
}

export function ActivationProgressModal({
  isOpen,
  onClose,
  title = "Real-Time Activation Diagnostics",
  subtitle = "Executing multi-provider activation pipeline and filesystem symlink materialization",
  progress,
  result,
  error = null,
  isStreaming = false,
  planId,
  providerId = "antigravity",
  onRetry,
}: ActivationProgressModalProps) {
  if (!isOpen) return null;

  const isFailed = Boolean(error || result?.status === "failed" || progress?.stage === "failed");
  const isCompleted = Boolean(
    !isFailed && (result?.status === "succeeded" || result?.status === "applied" || progress?.stage === "completed"),
  );

  const percent = calculateStageProgressPercent(progress, isCompleted, isFailed);
  const currentStage = progress?.stage || (isCompleted ? "completed" : isFailed ? "failed" : "plan");
  const providerMeta = getProviderInfo(providerId);
  const requiresCodexRestart = providerMeta.id === "codex" && Boolean(
    result?.report?.operations?.some((operation) => operation.restart_required === true),
  );

  const metricText = useMemo(() => {
    if (isCompleted && result?.report?.summary) {
      const s = result.report.summary;
      return `Activation Complete: ${s.applied} applied · ${s.skipped} skipped · ${s.failed} failed`;
    }
    if (isFailed) {
      return `Activation Halted: ${error || progress?.message || "Operation encountered an error"}`;
    }
    if (progress) {
      return formatStageMetric(progress.stage, progress.completed, progress.total, progress.message);
    }
    return "Initializing activation pipeline...";
  }, [isCompleted, isFailed, result, error, progress]);

  return (
    <div
      className="modal-backdrop activation-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="activation-modal-title"
    >
      <div className="activation-modal modal-content">
        {/* Modal Header */}
        <div className="modal-header activation-modal-header">
          <div className="modal-title-group">
            <div className="modal-badge-row">
              <span className={`activation-status-pill ${isCompleted ? "completed" : isFailed ? "failed" : "running"}`}>
                {isCompleted ? (
                  <>
                    <CheckCircle2 size={13} /> Succeeded
                  </>
                ) : isFailed ? (
                  <>
                    <AlertTriangle size={13} /> Failed
                  </>
                ) : (
                  <>
                    <LoaderCircle size={13} className="spin" /> Materializing Live
                  </>
                )}
              </span>
              {providerMeta && (
                <span className={`provider-mini-badge ${providerMeta.id}`}>
                  {providerMeta.displayName} ({providerMeta.deliveryRootRelative}/)
                </span>
              )}
              {planId && <span className="plan-id-tag">Plan: {planId.slice(0, 8)}</span>}
            </div>
            <h2 id="activation-modal-title">{title}</h2>
            <p className="modal-subtitle">{subtitle}</p>
          </div>

          <button
            className="modal-close-btn"
            type="button"
            onClick={onClose}
            aria-label="Close activation diagnostics modal"
            disabled={isStreaming && !isCompleted && !isFailed}
          >
            <X size={18} />
          </button>
        </div>

        {/* 5-Step Stepper Bar */}
        <div className="stepper-container">
          <ActivationStepper
            currentStage={currentStage}
            isFailed={isFailed}
            isCompleted={isCompleted}
          />
        </div>

        {/* Live Progress Metrics Card */}
        <div className="activation-live-card">
          <div className="live-metric-row">
            <div className="live-metric-left">
              <span className="live-stage-indicator">
                {isStreaming ? (
                  <LoaderCircle size={15} className="spin mint" />
                ) : isCompleted ? (
                  <CheckCircle2 size={15} className="mint" />
                ) : isFailed ? (
                  <AlertCircle size={15} className="coral" />
                ) : (
                  <Zap size={15} className="muted" />
                )}
                <strong>{mapStageToDiagnosticStep(currentStage).toUpperCase()}</strong>
              </span>
              <span className="live-metric-text">{metricText}</span>
            </div>
            <span className={`live-percent-badge ${isFailed ? "failed" : isCompleted ? "completed" : ""}`}>
              {percent}%
            </span>
          </div>

          <div className="progress-track activation-track" aria-label={`Progress ${percent}%`}>
            <div
              className={`progress-fill ${isFailed ? "drift" : isCompleted ? "completed" : ""}`}
              style={{ width: `${percent}%` }}
            />
          </div>

          {progress?.message && (
            <p className="live-stream-message">
              <Terminal size={13} className="stream-icon" />
              <span>{progress.message}</span>
            </p>
          )}
        </div>

        {/* Execution Summary Report (Shown upon completion or failure) */}
        {(isCompleted || isFailed) && result?.report?.summary && (
          <div className="execution-summary-section">
            <h3 className="summary-title">
              <ShieldCheck size={16} className="mint" /> Execution Report Metrics
            </h3>
            <div className="summary-metrics-grid">
              <div className="summary-metric-card applied">
                <span className="metric-label">Applied</span>
                <strong className="metric-val">{result.report.summary.applied}</strong>
                <small>Symlinks created</small>
              </div>
              <div className="summary-metric-card skipped">
                <span className="metric-label">Skipped</span>
                <strong className="metric-val">{result.report.summary.skipped}</strong>
                <small>Unmodified bindings</small>
              </div>
              <div className="summary-metric-card failed">
                <span className="metric-label">Failed</span>
                <strong className="metric-val">{result.report.summary.failed}</strong>
                <small>Errors encountered</small>
              </div>
              <div className="summary-metric-card total">
                <span className="metric-label">Total Ops</span>
                <strong className="metric-val">
                  {result.report.summary.applied +
                    result.report.summary.skipped +
                    result.report.summary.failed}
                </strong>
                <small>Pipeline operations</small>
              </div>
            </div>
          </div>
        )}

        {isCompleted && requiresCodexRestart && (
          <div
            role="status"
            aria-label="Codex restart required"
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "0.65rem",
              marginTop: "0.9rem",
              padding: "0.8rem 0.9rem",
              borderRadius: "8px",
              border: "1px solid rgba(250, 204, 21, 0.4)",
              background: "rgba(234, 179, 8, 0.1)",
              color: "#fde68a",
            }}
          >
            <AlertTriangle size={18} />
            <div>
              <strong>Restart Codex to apply the skill state change</strong>
              <p style={{ margin: "0.2rem 0 0", color: "#fef3c7", fontSize: "0.8rem" }}>
                The filesystem binding and Codex skills configuration are synchronized, but Codex reads the updated enablement on restart.
              </p>
            </div>
          </div>
        )}

        {/* Error Detail Banner */}
        {isFailed && (
          <div className="activation-error-banner" role="alert">
            <AlertCircle size={18} className="error-icon" />
            <div className="error-content">
              <strong>Activation Error Encountered</strong>
              <p>{error || progress?.message || "An unexpected error occurred during execution."}</p>
            </div>
          </div>
        )}

        {/* Modal Footer Actions */}
        <div className="modal-footer activation-modal-footer">
          <div className="footer-left-info">
            <small>
              {isStreaming
                ? "Streaming live NDJSON events from Skills Manager bridge..."
                : isCompleted
                ? "All provider symlinks and delivery paths verified."
                : isFailed
                ? "Review diagnostics and retry or inspect bindings in drawer."
                : "Ready to execute activation plan."}
            </small>
          </div>
          <div className="footer-actions">
            {isFailed && onRetry && (
              <button className="retry-action-btn" type="button" onClick={onRetry}>
                <RefreshCcw size={15} /> Retry Activation
              </button>
            )}
            <button
              className="primary-action-btn dismiss-btn"
              type="button"
              onClick={onClose}
            >
              {isCompleted ? "Done & Close" : isFailed ? "Dismiss" : "Cancel"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
