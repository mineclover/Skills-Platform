---
name: lch-experience-consolidator
description: >-
  Consolidate staging note buffer into permanent Experience Store (Et). Prunes duplicates, enforces applicability conditions,
  and updates LFU usage metrics.
invocation_mode: hybrid
---

# LCH: Experience Consolidator (`lch-experience-consolidator`)

Phase 10 policy skill of the Logical Completion Harness. Manages post-run memory consolidation and LFU cache lifecycle.

---

## 🏛️ Invariants & Rules

1. **Staging Buffer Gate**: `note` candidates are never written directly into long-term memory during execution.
2. **Consolidation Filter**:
   `Note Candidate` ➔ Duplicate Check ➔ Applicability & Counterexamples ➔ Evidence Check ➔ Promote / Update / Retire.
3. **Observation Priority**: Consolidated experience remains a hypothesis; environment observation always overrides experience.

---

## 📋 Standard Output: `experience_entry.yaml`

```yaml
experience_entry:
  id: exp-024
  category: mistake
  pattern: "OAuth redirect verification without checking token store leads to silent persistence failures"
  applicability:
    - domain: authentication
      condition: "redirect and session persistence are decoupled"
  counterexamples: ["stateless JWT flow"]
  evidence_refs: [evidence-auth-run-104]
  status: active
```
