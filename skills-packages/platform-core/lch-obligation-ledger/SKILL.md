---
name: lch-obligation-ledger
description: >-
  Manage Progress ledger (Pt) state machine. Decomposes contract into explicit obligations,
  tracks dependencies, and prevents tasks from closing with unresolved obligations.
invocation_mode: hybrid
---

# LCH: Obligation Ledger (`lch-obligation-ledger`)

Phase 2.5 policy skill of the Logical Completion Harness. Manages the state machine of all completion obligations.

---

## 🏛️ Invariants & State Machine

```text
pending ➔ ready ➔ active ➔ proposed_done ➔ verified | failed | blocked
```

1. **Obligations $\neq$ To-Do Lists**: Every obligation must bind to a contract requirement, owner, and acceptance check.
2. **Kernel State Authority**: Models propose transitions; only the kernel/auditor updates state to `verified`.
3. **No Silent Drops**: Blocked obligations must be formally resolved or waived with rationale.

---

## 📋 Standard Output: `obligation_ledger.yaml`

```yaml
obligation:
  id: O-17
  topic_id: topic.auth.callback
  statement: "Callback handler must persist session token"
  type: implementation
  criticality: required
  status: pending
  depends_on: [O-12]
  owner_ref: role://frontend-worker
  acceptance_check_refs: [AC3]
  evidence_refs: []
  attempt_count: 0
```
