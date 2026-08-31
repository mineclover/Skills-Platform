---
name: lch-closure-gate
description: >-
  Evaluate contract closure criteria and issue signed Completion Certificate. Enforces zero gap (Gap = empty)
  and blocks premature termination.
invocation_mode: hybrid
---

# LCH: Closure Gate (`lch-closure-gate`)

Phase 9 policy skill of the Logical Completion Harness. Evaluates full contract fulfillment and issues the signed **Completion Certificate**.

---

## 🏛️ Invariants & Rules

1. **Zero Gap Termination**:
   $$
   \text{Gap}_t = A_{\text{required}} - V_t = \varnothing
   $$
2. **All Obligations Verified**: Every required obligation must have status `verified`.
3. **No Critical Regressions**: Zero regressions on existing test suites.
4. **Certificate Issuance**: Emits `completion_certificate.yaml` with verifiable run traces.

---

## 📋 Standard Output: `completion_certificate.yaml`

```yaml
completion_certificate:
  run_id: run-22
  contract_id: contract-001
  result: completed # completed | partially_completed | blocked | aborted
  baseline_ref: git://commit/final123
  verified_obligations: [O-17, O-18]
  acceptance_results:
    - check_id: AC3
      result: pass
  cost:
    tokens: 41800
    tool_calls: 28
  issued_at: "2026-08-31T11:00:00Z"
```
