---
name: lch-evidence-collector
description: >-
  Capture raw execution logs, stdout/stderr, git diffs, and side-effects. Enforces zero secret leakage in evidence stores.
invocation_mode: hybrid
---

# LCH: Evidence Collector (`lch-evidence-collector`)

Phase 6 policy skill of the Logical Completion Harness. Captures immutable evidence traces from executor actions and tool runs.

---

## 🏛️ Invariants & Rules

1. **Secret Leak Guard**: Automatically redacts environment variables, tokens, and credentials.
2. **Immutable Proof**: Captures raw CLI output, return codes, and git diff snapshots.
3. **No Evidence, No State Change**: Unverifiable claims lacking an Evidence Reference are discarded.

---

## 📋 Standard Output: `evidence_record.yaml`

```yaml
evidence_record:
  id: evidence-auth-run-104
  work_unit_id: WU-104
  captured_at: "2026-08-31T09:15:00Z"
  exit_code: 0
  stdout_ref: logs://stdout-104.log
  diff_ref: diff://candidate-018.patch
  sanitized: true
```
