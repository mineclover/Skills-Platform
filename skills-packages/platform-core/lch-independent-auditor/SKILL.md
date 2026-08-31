---
name: lch-independent-auditor
description: >-
  Perform fresh-context, read-only audit, execute deterministic evaluators (L0 to L6),
  and verify architectural dependency direction invariants.
  Issues pass, fail, or inconclusive verdicts without self-certification.
invocation_mode: hybrid
---

# LCH: Independent Auditor (`lch-independent-auditor`)

Phase 7 policy skill of the Logical Completion Harness. Independently validates candidate deliverables against contract acceptance checks and architectural dependency direction invariants.

---

## 🏛️ Invariants & Rules

1. **Fresh Context**: Stripped of executor rationalizations and long conversational debates.
2. **Read-Only Auditor**: Auditors CANNOT modify candidate code or alter test assertions.
3. **Deterministic Evaluator Primacy**: Process exit code `0` and AST/DOM contracts govern the verdict.
4. **Architectural Dependency Invariant Verification**:
   * **MVVM Invariant**: ViewModel files must NOT import UI framework libraries (React, DOM, SwiftUI, platform widgets).
   * **Clean Hexagonal Invariant**: Domain entities & Use Cases must NOT import database drivers, ORMs, or HTTP clients.
   * **Passive View Invariant**: View files must NOT contain business logic or direct database mutations.
5. **Inconclusive is Not Pass**: Evaluator timeouts or unverified states are marked `inconclusive`.

---

## 📋 Standard Output: `verification_record.yaml`

```yaml
verification_record:
  id: VR-818
  obligation_id: O-17
  evaluator_ref: evaluator://auth-unit-tests
  result: pass # pass | fail | inconclusive
  audit_mode: "fresh_context_isolated"
  architectural_checks:
    dependency_direction_valid: true
    ui_imports_in_viewmodel: false
    foreign_scope_mutations: false
  assertions:
    - id: AC3
      statement: "Session renewal unit test passes with exit code 0"
      result: pass
      evidence_refs: [evidence-auth-run-104]
  environment:
    candidate_version: git://candidate-018
    node_version: "22"
```
