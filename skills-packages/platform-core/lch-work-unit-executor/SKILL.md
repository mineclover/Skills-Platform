---
name: lch-work-unit-executor
description: >-
  Assemble atomic Context Pack and execute Work Unit (WU) via Tool Gateway. Produces surgical candidate patches
  without injecting unbounded conversation history.
invocation_mode: hybrid
---

# LCH: Work Unit Executor (`lch-work-unit-executor`)

Phases 4 & 5 policy skill of the Logical Completion Harness. Executes targeted code modifications bounded strictly by the Work Unit contract and Context Pack.

---

## 🏛️ Invariants & Rules

1. **Context Pack Isolation**: Receives only relevant beliefs, scope, and obligation; raw conversation history is excluded.
2. **Tool Gateway Effect Enforcement**: Modifies only files in candidate worktrees (`reversible-write`).
3. **Proposal Output**: The executor produces candidate patches and claims `proposed_done`. It cannot declare verification.

---

## 📋 Standard Output: `work_unit_result.yaml`

```yaml
work_unit_result:
  work_unit_id: WU-104
  obligation_id: O-17
  candidate_ref: git://candidate-018
  status: proposed_done
  changed_files:
    - src/auth/callback.ts
    - tests/auth/callback.test.ts
  patch_summary: "Persist refresh token into encrypted session store"
```
