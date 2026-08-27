# System Architecture Retention Profile

## Ownership

Primary owner for: component responsibilities, non-responsibilities, system and ownership boundaries, source-of-truth, dependency direction, adapter boundaries, runtime topology, and architectural decisions.

Primary final sections: Scope and boundaries; Architecture and responsibility boundaries; Decisions, risks, and open issues.

## Required atom fields

| Atom | Semantic content | Required metadata | Omission risk |
|---|---|---|---|
| Atom 1 | System boundary and external-system ownership | Status, authority, scope, source, dependencies | Omission changes implementation or verification |
| Atom 2 | Component responsibility and explicit non-responsibility | Status, authority, scope, source, dependencies | Omission changes implementation or verification |
| Atom 3 | Canonical source-of-truth and authority direction | Status, authority, scope, source, dependencies | Omission changes implementation or verification |
| Atom 4 | Dependency direction, allowed references, and prohibited coupling | Status, authority, scope, source, dependencies | Omission changes implementation or verification |
| Atom 5 | Adapter, plugin, extension, and framework boundary contracts | Status, authority, scope, source, dependencies | Omission changes implementation or verification |
| Atom 6 | Runtime/deployment/process isolation when it affects behavior or failure | Status, authority, scope, source, dependencies | Omission changes implementation or verification |
| Atom 7 | Failure domains, degradation boundaries, migration architecture, and rollback constraints | Status, authority, scope, source, dependencies | Omission changes implementation or verification |
| Atom 8 | Accepted architectural decisions, supersession, rationale needed to prevent misuse | Status, authority, scope, source, dependencies | Omission changes implementation or verification |

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

> The editor, extension, DevTools panel, and local host all manage changes. Some drafts say the panel is the source of truth; later decisions say local files are canonical and the extension keeps history.

Reduced canonical form:

```text
DEC-ARCH-04 — Accepted: The local project file is canonical for persisted source. The DevTools panel is an authoring surface, the extension owns browser-context coordination and version-history metadata, and the local host owns filesystem access. No browser surface may become the canonical source merely because it observed the latest edit.
```
