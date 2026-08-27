# Delivery Roadmap Retention Profile

## Ownership

Primary owner for: dependency-ordered delivery stages, work packages, outcomes, deliverables, entry/exit criteria, owners, blockers, decision gates, rollout, migration, and deferred work.

Primary final sections: Implementation plan; Decisions, risks, and open issues; Compression limitations.

## Required atom fields

| Atom | Semantic content | Required metadata | Omission risk |
|---|---|---|---|
| Atom 1 | Dependency order that changes correctness or prevents rework | Status, authority, scope, source, dependencies | Omission changes implementation or verification |
| Atom 2 | Stage outcome, entry conditions, deliverables, and verifiable exit criteria | Status, authority, scope, source, dependencies | Omission changes implementation or verification |
| Atom 3 | Decision/research gates separated from implementation work | Status, authority, scope, source, dependencies | Omission changes implementation or verification |
| Atom 4 | Owners or responsible roles when needed for handoff | Status, authority, scope, source, dependencies | Omission changes implementation or verification |
| Atom 5 | Blockers, external dependencies, risks, and mitigation work | Status, authority, scope, source, dependencies | Omission changes implementation or verification |
| Atom 6 | Migration, compatibility, rollout, rollback, and operational-readiness stages | Status, authority, scope, source, dependencies | Omission changes implementation or verification |
| Atom 7 | Deferred scope with revisit trigger and prerequisites | Status, authority, scope, source, dependencies | Omission changes implementation or verification |
| Atom 8 | Definition of done distinguished from mere code completion | Status, authority, scope, source, dependencies | Omission changes implementation or verification |

## Merge key

Two source facts may merge only when subject, scope, modality, lifecycle/state, preconditions, outcome, exceptions, authority, and temporal status match. Union compatible conditions and acceptance links. Never merge current and target behavior without an explicit delta.

## Preferred compact representations

- Matrices for repeated dimensions and ownership
- Typed fact or contract blocks for normative rules
- State tables for lifecycle semantics
- ID references instead of prose repetition across domains
- One representative example per equivalence class

## Budget behavior

- P0/L5: exact semantics; no condition, exception, status, or obligation loss
- P1/L4: compact but complete operational meaning
- P2/L3: one bounded rationale/example when budget permits
- P3/L1: archive or omit

## Example

Source:

> First build the extension, then the host, then mapping, then history, then hot reload. Some tasks can happen together, and mapping uncertainty blocks save behavior.

Reduced canonical form:

```text
Stage 1 — Resolve resource identity/mapping contract and conflict semantics. Exit: approved CTR-MAP-* plus fixture corpus. Stage 2A — host persistence/versioning; Stage 2B — extension context bridge (parallel). Stage 3 — end-to-end attribution/save/reload suppression. Stage 4 — history UI and operational hardening. No save implementation may precede the mapping decision gate.
```
