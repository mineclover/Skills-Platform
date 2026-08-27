# Product Requirements Retention Profile

## Ownership

Primary owner for: product outcomes, actors, scope, non-goals, business rules, user-visible behavior, and functional acceptance intent.

Primary final sections: Executive contract; Scope and boundaries; Requirements and acceptance; Decisions, risks, and open issues.

## Required atom fields

| Atom | Semantic content | Required metadata | Omission risk |
|---|---|---|---|
| Atom 1 | Problem and intended outcome, including who experiences the problem | Status, authority, scope, source, dependencies | Omission changes implementation or verification |
| Atom 2 | Primary actors and role distinctions that change behavior or permissions | Status, authority, scope, source, dependencies | Omission changes implementation or verification |
| Atom 3 | In-scope, out-of-scope, non-goal, forbidden, and deferred boundaries | Status, authority, scope, source, dependencies | Omission changes implementation or verification |
| Atom 4 | Each hard functional requirement with trigger, condition, required result, and exception | Status, authority, scope, source, dependencies | Omission changes implementation or verification |
| Atom 5 | Business rules, priority, status, ownership, and user-visible failure behavior | Status, authority, scope, source, dependencies | Omission changes implementation or verification |
| Atom 6 | Success conditions and acceptance intent linked to requirements | Status, authority, scope, source, dependencies | Omission changes implementation or verification |
| Atom 7 | Product decisions, unresolved trade-offs, blockers, and externally committed behavior | Status, authority, scope, source, dependencies | Omission changes implementation or verification |

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

> Users should be able to save a style change immediately. Earlier notes suggest autosave, while the frozen decision requires an explicit save when the local file changed externally. Several user stories repeat the same behavior for CSS and HTML.

Reduced canonical form:

```text
REQ-SAVE-01 — P0, accepted: For a mapped resource, the user can persist an authored change to the canonical local file. When the local file has changed externally since the edit base, the system MUST require conflict resolution before overwrite. CSS and HTML are contract variants, not separate product requirements.
```
