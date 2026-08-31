---
name: lch-evolution-supervisor
description: >-
  Manage Candidate Lineage, Pareto Promotion Gate, and Stagnation Detection. Halts automated search loops
  when fitness plateaus or identical failure signatures repeat.
invocation_mode: hybrid
---

# LCH: Evolution Supervisor (`lch-evolution-supervisor`)

Phase 11 policy skill of the Logical Completion Harness (Evolution Plane). Controls candidate exploration ($X_t = (L, H, F, G, Q)$) and halts stagnation.

---

## 🏛️ Invariants & Rules

1. **Separation of Concerns**: Contract satisfaction (Completion) is evaluated before Pareto optimization (Evolution).
2. **Pareto Promotion Gate**:
   $$
   \text{Promote}(x') = \text{Correct}(x') \land \text{ContractSatisfied}(x') \land \text{NoCriticalRegression}(x') \land \text{Better}(x', x^*)
   $$
3. **Stagnation Circuit Breaker**:
   * Consecutive non-promotions $\ge 5$ ➔ halt loop.
   * Score delta $\Delta F < 0.001$ ➔ trigger plateau intervention.
   * Same failure signature $\ge 2$ ➔ escalate to human supervisor.

---

## 📋 Standard Output: `promotion_decision.yaml`

```yaml
promotion_decision:
  candidate_id: candidate-018
  parent_baseline_id: baseline-017
  verdict: promoted # promoted | rejected | plateau_halt
  metrics:
    correctness: pass
    latency_delta_pct: -14.2
    cost_delta_pct: -8.5
  tie_breaker_applied: "smaller_change_scope"
```
