# Interfaces and Contracts Retention Profile

## Ownership

Primary owner for: cross-boundary producer/consumer obligations, inputs and outputs, preconditions and postconditions, errors, versioning, compatibility, idempotency, ordering, concurrency, authorization, and validation.

Primary final sections: Interfaces and contracts; Critical flows and lifecycle; Quality, security, and operations.

## Required atom fields

| Atom | Semantic content | Required metadata | Omission risk |
|---|---|---|---|
| Atom 1 | Producer, consumer, call or delivery direction, and authority boundary | Status, authority, scope, source, dependencies | Omission changes implementation or verification |
| Atom 2 | Input/output types or preconditions/postconditions | Status, authority, scope, source, dependencies | Omission changes implementation or verification |
| Atom 3 | Semantic meaning of each operation, command, query, event, or file | Status, authority, scope, source, dependencies | Omission changes implementation or verification |
| Atom 4 | Failure classes, retryability, timeout, cancellation, and partial-success behavior | Status, authority, scope, source, dependencies | Omission changes implementation or verification |
| Atom 5 | Idempotency, ordering, duplication, concurrency, and replay rules when relevant | Status, authority, scope, source, dependencies | Omission changes implementation or verification |
| Atom 6 | Version negotiation, backward/forward compatibility, deprecation, migration | Status, authority, scope, source, dependencies | Omission changes implementation or verification |
| Atom 7 | Authentication, authorization, origin/trust, capability, and validation location | Status, authority, scope, source, dependencies | Omission changes implementation or verification |
| Atom 8 | Observability fields and correlation identifiers required across the boundary | Status, authority, scope, source, dependencies | Omission changes implementation or verification |

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

> The extension sends edits over WebSocket. Sometimes the host acknowledges before writing. Retries can duplicate saves, and several drafts use “saved” for both accepted and written.

Reduced canonical form:

```text
CTR-SAVE-02 | Extension → Local host. Command: PersistChange(change_id, resource_id, base_revision, patch). Acceptance response means queued, not durable. Durable completion emits Persisted(change_id, new_revision). Duplicate change_id MUST be idempotent. Revision mismatch is terminal until conflict resolution.
```
