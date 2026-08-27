# Testing and Acceptance Retention Profile

## Ownership

Primary owner for: verification strategy, acceptance criteria, test evidence, fixtures and environments, oracles, coverage obligations, release gates, and validation ownership.

Primary final sections: Requirements and acceptance; Quality, security, and operations; Traceability; Decisions, risks, and open issues.

## Required atom fields

| Atom | Semantic content | Required metadata | Omission risk |
|---|---|---|---|
| Atom 1 | Acceptance criterion or verification method for every hard requirement | Status, authority, scope, source, dependencies | Omission changes implementation or verification |
| Atom 2 | Test level appropriate to the boundary and failure risk | Status, authority, scope, source, dependencies | Omission changes implementation or verification |
| Atom 3 | Canonical fixtures, environments, versions, and external dependencies needed for reproducibility | Status, authority, scope, source, dependencies | Omission changes implementation or verification |
| Atom 4 | Oracle and evidence that distinguish pass, fail, warning, and degraded behavior | Status, authority, scope, source, dependencies | Omission changes implementation or verification |
| Atom 5 | Contract, compatibility, migration, race, recovery, and failure-path coverage | Status, authority, scope, source, dependencies | Omission changes implementation or verification |
| Atom 6 | Non-functional measurement method, threshold, and release action | Status, authority, scope, source, dependencies | Omission changes implementation or verification |
| Atom 7 | Regression ownership, release gates, known untestable areas, and waived risks | Status, authority, scope, source, dependencies | Omission changes implementation or verification |
| Atom 8 | Traceability from requirement/contract/invariant/flow to evidence | Status, authority, scope, source, dependencies | Omission changes implementation or verification |

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

> Test that saving works in normal cases, iframes, reloads, and conflicts. There are dozens of browser-specific cases and screenshots.

Reduced canonical form:

```text
AC-SAVE-01: For each supported browser/context class, verify edit attribution → mapping → durable persistence → reload-echo suppression. Parameterize same-origin/cross-origin iframe, DevTools open/closed transition, revision conflict, host restart, and unsupported mapping. Evidence: final file revision, event trace, and explicit user-visible outcome.
```
