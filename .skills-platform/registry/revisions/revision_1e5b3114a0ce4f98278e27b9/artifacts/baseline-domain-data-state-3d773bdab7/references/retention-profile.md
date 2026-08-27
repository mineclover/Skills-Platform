# Data and State Retention Profile

## Ownership

Primary owner for: entities, identifiers, relationships, schema semantics, data ownership, persistence, derived projections, legal states and transitions, invariants, versioning, and migration semantics.

Primary final sections: Canonical vocabulary and identity; Domain, data, and state model; Interfaces and contracts; Quality, security, and operations.

## Required atom fields

| Atom | Semantic content | Required metadata | Omission risk |
|---|---|---|---|
| Atom 1 | Core entities and relationships with cardinality where correctness depends on it | Status, authority, scope, source, dependencies | Omission changes implementation or verification |
| Atom 2 | Canonical identifiers, business keys, address schemes, and identity stability | Status, authority, scope, source, dependencies | Omission changes implementation or verification |
| Atom 3 | Field semantics only when they affect behavior, compatibility, validation, or ownership | Status, authority, scope, source, dependencies | Omission changes implementation or verification |
| Atom 4 | Canonical ownership, persistence, retention, derivation, cache/projection rules | Status, authority, scope, source, dependencies | Omission changes implementation or verification |
| Atom 5 | State names, legal transitions, transition owner, preconditions, and terminal states | Status, authority, scope, source, dependencies | Omission changes implementation or verification |
| Atom 6 | Invariants and where they are enforced or validated | Status, authority, scope, source, dependencies | Omission changes implementation or verification |
| Atom 7 | Versioning, backward/forward compatibility, migration, and data-loss constraints | Status, authority, scope, source, dependencies | Omission changes implementation or verification |
| Atom 8 | Null/absent/default semantics and immutable/mutable distinctions when material | Status, authority, scope, source, dependencies | Omission changes implementation or verification |

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

> A selected object has world x/y, screen x/y, CSS left/top, and a transformed bounding box. Several documents call all of these position.

Reduced canonical form:

```text
TERM-POS — Canonical distinction: authored document position, computed world transform, viewport projection, screen coordinates, and visual bounds are separate values. INV-POS-01: Persist only authored document-space geometry; viewport and screen values are derived projections.
```
