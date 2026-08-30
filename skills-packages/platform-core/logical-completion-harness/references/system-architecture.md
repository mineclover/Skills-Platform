# 🏛️ LCH Architecture: The 3 Planes & Kernel Boundary

## 1. The 3 Planes Architecture

Logical Completion Harness divides system responsibilities across three decoupled execution planes:

```text
┌──────────────────────────────────────────────────────────────────┐
│ 1. Completion Plane                                              │
│    Intake → Contract C → Horizontal Explore → Topic Router →     │
│    Work Unit Compiler → Executor → Tool Gateway → Evidence       │
├──────────────────────────────────────────────────────────────────┤
│ 2. Verification Plane                                            │
│    Fresh Context Pack → Read-Only Auditor → Evaluator Registry → │
│    Verification Record → Closure Gate → Completion Certificate   │
├──────────────────────────────────────────────────────────────────┤
│ 3. Evolution Plane (Optional)                                    │
│    Candidate Manager → Pareto Comparison → Promotion Gate →      │
│    Stagnation Supervisor → Baseline Lineage                      │
└──────────────────────────────────────────────────────────────────┘
```

---

## 2. Event Sourcing State Engine

All runtime modifications in LCH follow the Append-Only Event Sourcing model:

```text
Append-Only Event Store (SQLite / NDJSON)
           │
           ▼
Deterministic State Reducer (Pure Functions)
           │
           ▼
Current System Snapshot S_t = (C, B_t, P_t, E_t, V_t, R_t, A_t)
```

### Core Event Types:
* `ContractCompiled`, `ContractVersioned`
* `TopicDiscovered`, `TopicSelected`
* `ObligationCreated`, `ObligationActivated`, `ObligationProposedDone`, `ObligationVerified`
* `BeliefObserved`, `BeliefInvalidated`
* `ExperienceRecalled`, `NoteStaged`, `ExperienceConsolidated`
* `WorkUnitCompiled`, `ActionAuthorized`, `ActionExecuted`, `EvidenceCaptured`
* `VerificationPassed`, `VerificationFailed`, `VerificationInconclusive`
* `CandidateCreated`, `CandidateRejected`, `CandidatePromoted`
* `RunCompleted`, `CompletionCertificateIssued`
