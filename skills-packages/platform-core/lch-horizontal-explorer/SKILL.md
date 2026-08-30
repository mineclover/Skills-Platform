---
name: lch-horizontal-explorer
description: >-
  Perform read-only horizontal discovery to map system facts, unknowns, risks, and candidate topic DAGs.
  Enforces zero code mutation during horizontal exploration.
invocation_mode: hybrid
---

# LCH: Horizontal Explorer (`lch-horizontal-explorer`)

Phase 2 policy skill of the Logical Completion Harness. Explores the system landscape to discover and prioritize topic candidates without modifying code.

---

## 🏛️ Invariants & Rules

1. **Pure Read-Only**: Absolutely no file patching or state-mutating commands during horizontal exploration.
2. **Epistemic Classification**: Separate observed facts ($B_t$) from assumptions (`assumed`).
3. **Topic Scoring Formula**:
   $$
   \text{Score}(\text{topic}) = \frac{\text{Impact} \times \text{Blocking} \times \text{InformationGain}}{\text{Cost} + \text{Risk} + \text{Uncertainty}}
   $$

---

## 📋 Standard Output: `horizontal_context.yaml`

```yaml
horizontal_context:
  discovery_scope: [source-code, documentation, runtime-state, existing-tests]
  known_facts: []
  unknowns: []
  risks: []
  dependencies: []
  topic_candidates:
    - topic_id: topic.auth.callback
      statement: "OAuth callback refresh token persistence issue"
      expected_value: 0.9
      information_gain: 0.8
      risk: 0.3
      dependencies: []
```
