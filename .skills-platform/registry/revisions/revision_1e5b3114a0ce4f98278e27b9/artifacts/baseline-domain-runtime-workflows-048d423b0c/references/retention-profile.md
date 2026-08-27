# Runtime Workflows Retention Profile

## Ownership

Primary owner for: end-to-end execution order, triggers and preconditions, state mutations, checkpoints, asynchronous coordination, retries, cancellation, rollback, recovery, emitted outputs, and completion conditions.

Primary final sections: Critical flows and lifecycle; Interfaces and contracts; Quality, security, and operations.

## Required atom fields

| Atom | Semantic content | Required metadata | Omission risk |
|---|---|---|---|
| Atom 1 | Trigger, actor, preconditions, and authoritative starting state | Status, authority, scope, source, dependencies | Omission changes implementation or verification |
| Atom 2 | Ordered stages and responsible component/contract at each boundary | Status, authority, scope, source, dependencies | Omission changes implementation or verification |
| Atom 3 | Canonical state mutations, checkpoints, and emitted events | Status, authority, scope, source, dependencies | Omission changes implementation or verification |
| Atom 4 | Synchronous/asynchronous boundaries, concurrency and ordering constraints | Status, authority, scope, source, dependencies | Omission changes implementation or verification |
| Atom 5 | Retry policy, idempotency dependency, timeout, cancellation, and backpressure | Status, authority, scope, source, dependencies | Omission changes implementation or verification |
| Atom 6 | Failure classification, rollback, recovery, degradation, and user-visible consequence | Status, authority, scope, source, dependencies | Omission changes implementation or verification |
| Atom 7 | Completion, durable success, cleanup, and exactly-once/at-least-once assumptions | Status, authority, scope, source, dependencies | Omission changes implementation or verification |
| Atom 8 | Loop, echo, reentrancy, and stale-update prevention where relevant | Status, authority, scope, source, dependencies | Omission changes implementation or verification |

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

> DevTools edits are observed, saved to disk, and the dev server reloads. The reload produces another network change that can be interpreted as a new user edit.

Reduced canonical form:

```text
FLOW-SYNC-01: User edit → attribute origin/edit_id → map resource/base revision → persist idempotently → record durable revision → suppress or classify the corresponding reload echo → reconcile runtime state. Failure branches: mapping ambiguity, revision conflict, host unavailable, reload without matching edit_id.
```
