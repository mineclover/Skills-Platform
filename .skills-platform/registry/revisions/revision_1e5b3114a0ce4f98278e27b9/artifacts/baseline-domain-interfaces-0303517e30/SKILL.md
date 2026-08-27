---
name: baseline-domain-interfaces
description: Extract and compact API, event, message, file, adapter, plugin, and cross-module contracts—including producer/consumer obligations, payload semantics, errors, versioning, idempotency, ordering, authorization, and validation—into an 80,000-token canonical baseline.
---

# Interfaces and Contracts Domain Reducer

## Role

This is a **core semantic owner** used by `bounded-baseline-condenser`. It extracts and compacts cross-boundary producer/consumer obligations, inputs and outputs, preconditions and postconditions, errors, versioning, compatibility, idempotency, ordering, concurrency, authorization, and validation.

Primary final-baseline placement: **Interfaces and contracts; Critical flows and lifecycle; Quality, security, and operations**.

It does not produce a standalone authoritative specification. Add facts to the shared ledger, emit a domain capsule, and let the top-level condenser perform global reconciliation and prose compilation.

## Use when sources contain

- API, endpoint, RPC, command, query, event, webhook
- message, payload, schema, file format, import/export
- adapter, plugin, bridge, host protocol, WebSocket
- error code, retry, idempotency, ordering, version, compatibility

## Do not own

- business need for the interaction
- component ownership outside contract obligations
- canonical entity lifecycle beyond payload reference
- global workflow ordering beyond boundary behavior
- test suite implementation and milestone plan

Reference those domains through canonical IDs instead of restating their facts.


## Domain-capsule output

Update the shared `FACT_LEDGER.jsonl` and emit a compact domain capsule:

```markdown
---
domain_id: interfaces
role: core
source_coverage: []
budget_weight: 1.0
---

# Domain Capsule — Interfaces and Contracts

## Canonical terms
## Atomic P0/P1 facts
## Contracts, states, flows, or invariants owned/refined here
## Decisions, risks, and open issues
## Acceptance/evidence links
## Compression candidates
## Cross-domain handoff
```

The capsule is an intermediate representation. Do not polish it into an independent summary or repeat facts owned elsewhere.


## Preserve as P0/P1 when applicable

- Producer, consumer, call or delivery direction, and authority boundary
- Input/output types or preconditions/postconditions
- Semantic meaning of each operation, command, query, event, or file
- Failure classes, retryability, timeout, cancellation, and partial-success behavior
- Idempotency, ordering, duplication, concurrency, and replay rules when relevant
- Version negotiation, backward/forward compatibility, deprecation, migration
- Authentication, authorization, origin/trust, capability, and validation location
- Observability fields and correlation identifiers required across the boundary

## High-risk distinctions

| A | B | Preservation rule |
|---|---|---|
| Command | Event | A command requests work; an event reports that something occurred. |
| Query | Command | A query must not mutate unless explicitly specified. |
| Delivery success | Processing success | Transport acceptance does not prove durable application. |
| Schema | Semantic contract | A shape alone does not define authority, ordering, or failure behavior. |
| Optional | Conditionally required | Conditional presence needs an explicit predicate. |
| Retryable | Idempotent | Retry safety depends on idempotency and deduplication semantics. |
| Protocol version | Content revision | They evolve under different compatibility rules. |

## Compression operations

| Verbose source form | Canonical form | Loss guard |
|---|---|---|
| Endpoint-by-endpoint narrative | Contract catalog | Keep direction, types, semantics, failure, compatibility, validation. |
| Repeated payload fields | Reference canonical schema IDs | Do not redefine shared entities. |
| Several error examples | Failure taxonomy and matrix | Retain retry and user-visible consequences. |
| Transport background | One decision/rationale note | Archive generic protocol explanation. |
| Client/server retellings | One producer-consumer contract | Preserve asymmetric obligations. |

## Extraction procedure

1. Read `DOMAIN_ROUTE.md`, source inventory, authority ledger, and term registry.
2. Map only the source sections assigned to this domain; follow cross-domain references when needed for dependency closure.
3. Split passages into atomic facts with status, priority, authority, modality, dependencies, and source references.
4. Merge semantic duplicates inside the domain before prose is drafted.
5. Preserve one canonical definition; link other domains by ID.
6. Record unresolved equal-authority contradictions in the conflict register.
7. Emit compact candidate representations: matrices, contract blocks, schemas, state tables, or flow records as appropriate.
8. Mark P2 rationale/examples for bounded retention and P3 history for archive.
9. Run the domain audit below.
10. Hand the capsule and ledger changes to the top-level condenser.

## Domain audit

- [ ] Every critical cross-boundary interaction has a canonical contract ID.
- [ ] Producer and consumer obligations are both explicit.
- [ ] Failure, retry, idempotency, ordering, and compatibility are present where material.
- [ ] Authorization and validation occur at named trust boundaries.
- [ ] Contract payloads reference canonical entity/state definitions.
- [ ] Runtime flows reference contracts rather than restating them.
- [ ] No transport choice is treated as sufficient semantic specification.

## Cross-domain handoff

- Product supplies the behavior the contract enables.
- Architecture supplies boundary ownership and dependency direction.
- Data/state supplies canonical payload and state semantics.
- Runtime supplies orchestration, retries, and recovery across contracts.
- Quality supplies security, observability, performance, and reliability constraints.
- Testing receives contract-test and compatibility obligations.

## Example transformation

**Source pattern**

> The extension sends edits over WebSocket. Sometimes the host acknowledges before writing. Retries can duplicate saves, and several drafts use “saved” for both accepted and written.

**Canonical fact pattern**

```text
CTR-SAVE-02 | Extension → Local host. Command: PersistChange(change_id, resource_id, base_revision, patch). Acceptance response means queued, not durable. Durable completion emits Persisted(change_id, new_revision). Duplicate change_id MUST be idempotent. Revision mismatch is terminal until conflict resolution.
```

## Completion gate

Complete only when all assigned P0/P1 source semantics are represented, dependencies or handoffs are explicit, conflicts remain visible, and the capsule contains no duplicate canonical definitions owned by another domain.

## Reference

Read `references/retention-profile.md` for atom fields, merge keys, and compact representation patterns.

## v0.3 context metadata handoff

이 도메인 reducer는 수평·수직 행동을 직접 수행하지 않는다. 공유 Fact Ledger에 의미 사실을 추가할 때 다음 메타데이터를 보존하고, Context Builder와 Behavior가 ID로 소비하게 한다.

```text
topic_id · subject_refs · scope_orientation · scope_path
responsibility_mode · context_role · maintenance_case_refs
```

`context_role`이 `prior-context`인 규칙과 `behavior-result`인 관찰·변경 결과를 같은 정본 문장으로 병합하지 않는다. 비관리 요소의 내부 사실은 Public Projection 깊이로 제한한다.

