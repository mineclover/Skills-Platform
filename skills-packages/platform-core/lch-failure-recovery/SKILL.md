---
name: lch-failure-recovery
description: >-
  Classify failure modes and execute targeted recovery actions (reobserve, repair, reframe, reroute, rollback).
  Enforces no identical retries on identical states.
invocation_mode: hybrid
---

# LCH: Failure Recovery Controller (`lch-failure-recovery`)

Phase 7.5 policy skill of the Logical Completion Harness. Routes failed verification records to appropriate recovery actions based on failure taxonomy.

---

## 🏛️ Invariants & Recovery Matrix

1. **No Identical Retries**: Before retrying, at least one dimension (Belief, Method, Scope, Tool Binding, or Hypothesis) MUST change.
2. **Failure Taxonomy**:
   * *Stale Belief* ➔ `track` and refresh context.
   * *Wrong Topic* ➔ `reframe` via Horizontal Explorer.
   * *Tool Failure* ➔ fallback tool capability binding.
   * *Regression* ➔ `rollback` candidate worktree.
   * *Repeated Failure (&ge; 2)* ➔ `recall` past experiences & change algorithmic strategy.

---

## 📋 Standard Output: `recovery_plan.yaml`

```yaml
recovery_plan:
  failed_obligation_id: O-17
  failure_mode: implementation_bug
  chosen_action: repair
  modified_dimensions:
    - prompt_hypothesis
    - target_test_fixture
  new_work_unit_id: WU-105
```
