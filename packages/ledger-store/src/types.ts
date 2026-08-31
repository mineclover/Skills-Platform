export type ObligationStatus =
  | "pending"
  | "ready"
  | "active"
  | "proposed_done"
  | "verified"
  | "failed"
  | "blocked";

export interface PlanManifest {
  plan_id: string;
  title: string;
  current_phase: string;
  status: "active" | "completed" | "failed" | "aborted";
  is_complete: boolean;
  created_at: string;
  updated_at: string;
}

export interface Deliverable {
  id: string;
  path?: string;
  description?: string;
}

export interface AcceptanceCheck {
  id: string;
  statement: string;
  required?: boolean;
  evaluator_ref?: string;
}

export interface CompletionContract {
  contract_id: string;
  version: number;
  goal: { statement: string };
  deliverables: Deliverable[];
  acceptance_checks: AcceptanceCheck[];
  non_goals: string[];
  stop_conditions?: string[];
}

export interface Obligation {
  id: string;
  topic_id?: string;
  statement: string;
  criticality?: "required" | "optional";
  status: ObligationStatus;
  depends_on?: string[];
  owner_role?: string;
  acceptance_check_refs?: string[];
  attempt_count?: number;
  updated_at?: string;
}

export interface VerificationRecord {
  id: string;
  obligation_id?: string;
  evaluator_ref?: string;
  result: "pass" | "fail" | "inconclusive";
  assertions?: Array<{ id: string; result: "pass" | "fail" }>;
  verified_at?: string;
  environment?: Record<string, any>;
}

export interface CompletionCertificate {
  certificate_id: string;
  plan_id: string;
  contract_id?: string;
  result: "completed" | "partially_completed" | "blocked" | "aborted";
  baseline_ref?: string;
  verified_obligations?: string[];
  cost?: Record<string, any>;
  issued_at?: string;
}

export interface PlanState {
  manifest: PlanManifest;
  contract: CompletionContract | null;
  context: any | null;
  ledger: Obligation[];
  binding: any | null;
  verifications: VerificationRecord[];
  certificate: CompletionCertificate | null;
}

export interface LedgerEvent {
  event_id: string;
  plan_id: string;
  timestamp: string;
  phase: string;
  actor: string;
  action: string;
  payload: Record<string, any>;
  checksum: string;
}

export interface GapAnalysisResult {
  plan_id: string;
  is_complete: boolean;
  completion_ratio: number;
  required_checks_count: number;
  passed_checks_count: number;
  missing_checks: AcceptanceCheck[];
  obligations_summary: {
    total: number;
    verified: number;
    active: number;
    pending: number;
    failed: number;
  };
}
