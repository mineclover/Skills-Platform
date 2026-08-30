---
name: lch-contract-compiler
description: >-
  Compile immutable Completion Contract (C) before executing any task. Defines end goals, deliverables,
  deterministic acceptance checks, non-goals, and stop conditions.
invocation_mode: hybrid
---

# LCH: Contract Compiler (`lch-contract-compiler`)

Phase 1 policy skill of the Logical Completion Harness. Compiles unstructured user requests into an immutable, versioned **Completion Contract ($C$)**.

---

## 🏛️ Invariants & Rules

1. **No Action Without Contract**: Never edit source code or dispatch workers prior to compiling $C$.
2. **Explicit Non-Goals**: Must declare what will NOT be solved to prevent scope creep.
3. **Deterministic Evaluator Binding**: Every acceptance check must point to an objective verifier (`evaluator://`).
4. **Contract Immutability**: Contract cannot be edited mid-execution without explicit versioning.

---

## 📋 Standard Output: `completion_contract.yaml`

```yaml
completion_contract:
  id: contract-001
  version: 1
  goal:
    statement: "Clear statement of required end state"
  deliverables:
    - id: D1
      description: "Required artifact to be generated"
  acceptance_checks:
    - id: AC1
      statement: "Objective checkable condition"
      required: true
      evaluator_ref: evaluator://npm-test
      target_ref: artifact://candidate/current
  constraints:
    allowed_change_scope: ["src/**", "test/**"]
    prohibited_change_scope: [".env*", "production/**"]
  non_goals: ["Out of scope items"]
  stop_conditions: [authority_missing, evaluator_unavailable, budget_exhausted]
```
