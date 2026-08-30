# 📊 State Model & Work Unit Compiler

## 1. 7-State Component Definitions

$$
S_t = (C,\ B_t,\ P_t,\ E_t,\ V_t,\ R_t,\ A_t)
$$

* **$C$ (Contract)**: Immutable contract compiled before execution starts.
* **$B_t$ (Belief)**: Explicit epistemic facts. Status: `observed`, `inferred`, `assumed`, `contradicted`, `stale`, `invalidated`.
* **$P_t$ (Progress)**: Obligation ledger state machine:
  `pending` ➔ `ready` ➔ `active` ➔ `proposed_done` ➔ `verified` (or `failed` / `blocked`).
* **$E_t$ (Experience)**: Reusable patterns with applicability criteria and counterexamples.
* **$V_t$ (Verification)**: Independent evaluator records ($L0-L6$).
* **$R_t$ (Responsibility)**: Ownership of files (`allowed_change_scope`) and tool authorizations.
* **$A_t$ (Artifact)**: Baseline commit and candidate workspace references.

---

## 2. Work Unit & Context Pack Assembly

To prevent context window bloat and catastrophic forgetting, executors receive only a compiled **Context Pack**:

```text
Context Pack Composition:
├─ Contract Digest (Goals & Acceptance Criteria)
├─ Active Topic & Primary Obligation
├─ Relevant Belief Items (Observed facts only)
├─ Relevant Evidence Links
├─ Selected Experience Entries (Matching domain conditions)
├─ Allowed Scope & Tool Capabilities
└─ Failure History Digest (If recovering from a prior attempt)
```

Raw conversation turns remain in Event Store logs and are NEVER injected into the active prompt context.
