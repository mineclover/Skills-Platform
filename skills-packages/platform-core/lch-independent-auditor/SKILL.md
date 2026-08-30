---
name: lch-independent-auditor
description: >-
  Perform fresh-context, read-only audit and execute deterministic evaluators (L0 to L6).
  Issues pass, fail, or inconclusive verdicts without self-certification.
invocation_mode: hybrid
---

# LCH: Independent Auditor (`lch-independent-auditor`)

Phase 7 policy skill of the Logical Completion Harness. Independently validates candidate deliverables against contract acceptance checks.

---

## 🏛️ Invariants & Rules

1. **Fresh Context**: Stripped of executor rationalizations and long conversational debates.
2. **Read-Only Auditor**: Auditors CANNOT modify candidate code or alter test assertions.
3. **Deterministic Evaluator Primacy**: Process exit code `0` and AST/DOM contracts govern the verdict.
4. **Inconclusive is Not Pass**: Evaluator timeouts or unverified states are marked `inconclusive`.

---

## 📋 Standard Output: `verification_record.yaml`

```yaml
verification_record:
  id: VR-818
  obligation_id: O-17
  evaluator_ref: evaluator://auth-unit-tests
  result: pass # pass | fail | inconclusive
  assertions:
    - id: AC3
      result: pass
      evidence_refs: [evidence-auth-run-104]
  environment:
    candidate_version: git://candidate-018
    node_version: "22"
```
