---
name: lch-responsibility-router
description: >-
  Bind single vertical topic to execution lane and enforce file modification scope boundaries (allowed_change_scope).
  Prevents side effects and multi-topic attention split.
invocation_mode: hybrid
---

# LCH: Responsibility Router (`lch-responsibility-router`)

Phase 3 policy skill of the Logical Completion Harness. Binds a single active topic and enforces strict authority and file scope boundaries.

---

## 🏛️ Invariants & Rules

1. **Single Active Topic Invariant**: Exactly one active vertical topic per lane ($1 \text{ lane} = 1 \text{ active topic} = 1 \text{ primary obligation}$).
2. **Strict Scope Whitelisting**: Declares `allowed_change_scope`. Any tool write outside this pattern is aborted.
3. **Capability Binding**: Maps required tools and verifies execution permissions.

---

## 📋 Standard Output: `responsibility_binding.yaml`

```yaml
responsibility_binding:
  topic_id: topic.auth.callback
  primary_obligation_id: O-17
  assigned_role: role://auth-engineer
  allowed_change_scope:
    - src/auth/**
    - tests/auth/**
  prohibited_scope:
    - src/billing/**
    - production/**
  allowed_capabilities:
    - capability.file.patch
    - capability.test.run
```
