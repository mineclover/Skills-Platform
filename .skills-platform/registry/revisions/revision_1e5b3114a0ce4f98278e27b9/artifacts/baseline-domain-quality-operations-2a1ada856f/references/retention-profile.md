# Quality, Security, and Operations Retention Profile

## Ownership

Primary owner for: non-functional requirements, trust and access controls, reliability and degradation, observability, configuration and secrets, deployment, backup and recovery, compatibility migration, rollback, and operating cost constraints.

Primary final sections: Quality, security, and operations; Requirements and acceptance; Decisions, risks, and open issues.

## Required atom fields

| Atom | Semantic content | Required metadata | Omission risk |
|---|---|---|---|
| Atom 1 | Quantified performance, capacity, resource, and cost limits when committed | Status, authority, scope, source, dependencies | Omission changes implementation or verification |
| Atom 2 | Trust boundaries, authentication, authorization, capability, origin, and least-privilege rules | Status, authority, scope, source, dependencies | Omission changes implementation or verification |
| Atom 3 | Data privacy, retention, redaction, audit, and secret-handling constraints | Status, authority, scope, source, dependencies | Omission changes implementation or verification |
| Atom 4 | Availability, durability, consistency, degradation, fallback, and recovery objectives | Status, authority, scope, source, dependencies | Omission changes implementation or verification |
| Atom 5 | Required logs, metrics, traces, correlation, audit events, and diagnostic surfaces | Status, authority, scope, source, dependencies | Omission changes implementation or verification |
| Atom 6 | Configuration authority, environment separation, deployment, upgrade, and rollback rules | Status, authority, scope, source, dependencies | Omission changes implementation or verification |
| Atom 7 | Backup, restore, migration, compatibility windows, and irreversible-change controls | Status, authority, scope, source, dependencies | Omission changes implementation or verification |
| Atom 8 | Operational ownership, alerts, run gates, and release-blocking non-functional failures | Status, authority, scope, source, dependencies | Omission changes implementation or verification |

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

> The tool should be fast and secure, keep history, and not lose edits. Logs are useful, but source contents may be sensitive.

Reduced canonical form:

```text
REQ-NFR-01: Persist operations MUST be crash-safe and revisioned; no acknowledged durable save may be lost. INV-SEC-02: Source contents and patches are redacted from default logs; correlation uses resource_id, revision, edit_id, and outcome. AC-OPS-03: recovery and redaction tests block release.
```
