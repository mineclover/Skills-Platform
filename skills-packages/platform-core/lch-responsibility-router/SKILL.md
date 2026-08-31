---
name: lch-responsibility-router
description: >-
  Bind single vertical topic to execution lane, enforce topology-aware file modification scope boundaries (allowed_change_scope),
  and assemble distilled Context Packs for workers. Prevents side effects and multi-topic attention split.
invocation_mode: hybrid
---

# LCH: Responsibility Router (`lch-responsibility-router`)

Phase 4 policy skill of the Logical Completion Harness. Binds a single active topic, enforces strict topology-aware change boundaries, and assembles the distilled Context Pack.

---

## 🏛️ Invariants & Rules

1. **Single Active Topic Invariant**: Exactly one active vertical topic per lane ($1 \text{ lane} = 1 \text{ active topic} = 1 \text{ primary obligation}$).
2. **Topology-Aware Scope Whitelisting**:
   * Derive `allowed_change_scope` following the detected project topology (`feature-first`, `layer-first`, `framework-idiomatic`).
   * Never create alien or non-conforming folders; respect existing directory conventions.
3. **Context Pack Assembly**: Distill exploration facts ($B_t$) and target acceptance criteria into an isolated, lightweight packet for the worker (Zero Transcript Leakage).
4. **Capability Binding**: Maps required tools (`capability.file.patch`, `capability.test.run_targeted`) and blocks unauthorized access.

---

## 📋 Standard Output: `responsibility_binding.yaml`

```yaml
responsibility_binding:
  topic_id: topic.auth.callback
  primary_obligation_id: O-17
  assigned_role: role://auth-engineer
  detected_topology: "feature-first"
  allowed_change_scope:
    - src/features/auth/user.viewmodel.ts
    - tests/features/auth/user.viewmodel.test.ts
  prohibited_scope:
    - src/features/billing/**
    - src/config/production.*
    - ".env*"
  allowed_capabilities:
    - capability.file.patch
    - capability.test.run_targeted
  injected_context_pack:
    target_statement: "Implement OAuth refresh token session renewal"
    relevant_facts:
      - "ioredis@5.4.0 installed"
      - "SessionStore implements ISessionStore interface"
    target_acceptance_check: "AC1: sessionStore.refresh() roundtrip pass"
```
