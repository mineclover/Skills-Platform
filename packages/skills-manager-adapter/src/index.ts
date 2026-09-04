import type {
  ActivationOperation,
  ActivationPlan,
  ActivationReport,
  DeliveryMethod,
  ValidationIssue,
} from "@skills-platform/contracts";

export interface PreviewOperation {
  operation: ActivationOperation;
  delivery_method: DeliveryMethod;
  status: "create" | "replace" | "remove" | "noop" | "conflict" | "invalid";
  reason?: string;
  applied?: boolean;
  failed?: boolean;
  rolled_back?: boolean;
  not_attempted?: boolean;
  error?: string;
  delivery_guard?: {
    target: ActivationPlan["target"];
    delivery_root: string;
  };
  codex_config?: CodexSkillConfigState;
  restart_required?: boolean;
}

export interface CodexSkillConfigState {
  managed: boolean;
  config_path: string | null;
  skill_path: string;
  enabled: boolean | null;
  entry_count?: number;
  entry_count_before?: number;
  deterministic?: boolean;
  desired_enabled?: boolean;
  action?: "noop" | "enable" | "disable" | "skipped";
  changed?: boolean;
  restart_required: boolean;
  reason?: string;
}

export interface PreviewActivationPlanResult {
  valid: boolean;
  validation_issues: ValidationIssue[];
  operations: PreviewOperation[];
  summary: Record<string, number>;
}

export interface AdapterActivationReport extends ActivationReport {
  rolled_back: boolean;
  rollback_errors?: string[];
  cleanup_errors?: string[];
  error?: string;
  state_unchanged?: boolean;
  operations: PreviewOperation[];
}

export type AdapterEvent =
  | { type: "preview"; plan_id: string; preview: PreviewActivationPlanResult }
  | {
      type: "operation";
      plan_id: string;
      processed_count: number;
      total_count: number;
      operation: PreviewOperation;
    }
  | { type: "complete"; plan_id: string; report: AdapterActivationReport };

export interface CodexAdapterOptions {
  /** Trusted test/host override; never read from an activation plan payload. */
  codexConfigPath?: string;
  /** Trusted Codex home override; resolves to `<codexHome>/config.toml`. */
  codexHome?: string;
}

export interface ApplyActivationPlanOptions extends CodexAdapterOptions {
  confirm?: boolean;
  onProgress?: (progress: {
    processed_count: number;
    total_count: number;
    operation: PreviewOperation;
  }) => void;
}

interface RuntimeAdapter {
  COPY_OWNERSHIP_FILE: string;
  inspectOperation(
    operation: ActivationOperation,
    options?: { method?: DeliveryMethod },
  ): Promise<PreviewOperation>;
  previewActivationPlan(
    plan: ActivationPlan,
    options?: CodexAdapterOptions,
  ): Promise<PreviewActivationPlanResult>;
  materialize(
    previewOperation: PreviewOperation,
    options?: CodexAdapterOptions & { method?: DeliveryMethod },
  ): Promise<PreviewOperation>;
  applyActivationPlan(
    plan: ActivationPlan,
    options?: ApplyActivationPlanOptions,
  ): Promise<AdapterActivationReport | null>;
  applyActivationPlanEvents(
    plan: ActivationPlan,
    options?: ApplyActivationPlanOptions,
  ): AsyncGenerator<AdapterEvent, AdapterActivationReport, void>;
}

// Keep one executable implementation. CommonJS consumers load src/index.js
// directly, while the TypeScript build emits this typed facade in dist/.
// Both paths therefore execute the same adapter logic instead of maintaining
// two hand-copied implementations that can drift.
const runtime = require("../src/index.js") as RuntimeAdapter;

export const COPY_OWNERSHIP_FILE = runtime.COPY_OWNERSHIP_FILE;
export const inspectOperation = runtime.inspectOperation;
export const previewActivationPlan = runtime.previewActivationPlan;
export const materialize = runtime.materialize;
export const applyActivationPlan = runtime.applyActivationPlan;
export const applyActivationPlanEvents = runtime.applyActivationPlanEvents;
