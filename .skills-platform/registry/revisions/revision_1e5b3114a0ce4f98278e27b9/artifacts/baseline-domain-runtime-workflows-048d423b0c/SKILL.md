---
name: baseline-domain-runtime-workflows
description: Extract and compact triggers, ordered stages, state mutations, asynchronous coordination, retries, timeouts, cancellation, rollback, recovery, and completion conditions into canonical runtime flows under an 80,000-token baseline. Use for pipelines, lifecycle descriptions, sequence diagrams, jobs, synchronization loops, and event-driven orchestration.
---

# Runtime Workflows Domain Reducer

## Role

This is a **core semantic owner** used by `bounded-baseline-condenser`. It extracts and compacts end-to-end execution order, triggers and preconditions, state mutations, checkpoints, asynchronous coordination, retries, cancellation, rollback, recovery, emitted outputs, and completion conditions.

Primary final-baseline placement: **Critical flows and lifecycle; Interfaces and contracts; Quality, security, and operations**.

It does not produce a standalone authoritative specification. Add facts to the shared ledger, emit a domain capsule, and let the top-level condenser perform global reconciliation and prose compilation.

## Use when sources contain

- sequence, pipeline, lifecycle, execution path, orchestration
- trigger, stage, step, checkpoint, event, callback
- retry, debounce, timeout, cancel, rollback, recovery
- concurrency, ordering, race, loop prevention, completion

## Do not own

- business justification
- component responsibility or source-of-truth definition
- entity schema and legal-state definitions beyond references
- protocol contract semantics owned by interfaces
- test execution and project milestones

Reference those domains through canonical IDs instead of restating their facts.


## Domain-capsule output

Update the shared `FACT_LEDGER.jsonl` and emit a compact domain capsule:

```markdown
---
domain_id: runtime-workflows
role: core
source_coverage: []
budget_weight: 1.0
---

# Domain Capsule — Runtime Workflows

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

- Trigger, actor, preconditions, and authoritative starting state
- Ordered stages and responsible component/contract at each boundary
- Canonical state mutations, checkpoints, and emitted events
- Synchronous/asynchronous boundaries, concurrency and ordering constraints
- Retry policy, idempotency dependency, timeout, cancellation, and backpressure
- Failure classification, rollback, recovery, degradation, and user-visible consequence
- Completion, durable success, cleanup, and exactly-once/at-least-once assumptions
- Loop, echo, reentrancy, and stale-update prevention where relevant

## High-risk distinctions

| A | B | Preservation rule |
|---|---|---|
| Trigger | Cause | The observed trigger may not be the authoritative cause of a state change. |
| Accepted | Completed | Queued or acknowledged work is not necessarily durable success. |
| Retry | Recovery | Retry repeats an operation; recovery restores a valid state. |
| Rollback | Compensation | Rollback reverses local state; compensation applies a new corrective action. |
| Transient state | Persistent state | Only persistent checkpoints survive restart. |
| Orchestration | Choreography | Central sequencing and event reactions imply different ownership. |
| Debounce | Deduplication | Time grouping does not replace identity-based duplicate suppression. |

## Compression operations

| Verbose source form | Canonical form | Loss guard |
|---|---|---|
| The same sequence described per component | One canonical end-to-end flow | Reference component and contract IDs at stages. |
| Many happy-path examples | Canonical flow plus branch table | Retain materially distinct failure and recovery branches. |
| Logs and debugging chronology | Failure condition and diagnostic evidence | Archive incidental timestamps. |
| Repeated retry prose | Retry/cancel/backoff matrix | Preserve idempotency and completion semantics. |
| Several lifecycle diagrams | One state-linked flow | Keep differences only when triggers or ownership differ. |

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

- [ ] Every P0 flow has trigger, precondition, ordered stages, state effects, failure/recovery, and completion.
- [ ] Async acceptance is not mislabeled as durable completion.
- [ ] Retries have idempotency or duplicate-handling semantics.
- [ ] Cancellation, timeout, and restart behavior are explicit when work can outlive a call.
- [ ] Loop and race prevention are represented for bidirectional synchronization.
- [ ] Flows reference canonical contracts and states instead of redefining them.
- [ ] Observability can identify a flow instance across boundaries.

## Cross-domain handoff

- Architecture supplies responsible components and boundaries.
- Data/state supplies legal states and mutation invariants.
- Interfaces supplies operations/events and boundary failures.
- Quality supplies timing, reliability, observability, and recovery objectives.
- Testing receives branch, race, restart, and completion verification obligations.
- Roadmap receives dependency-critical flow slices.

## Example transformation

**Source pattern**

> DevTools edits are observed, saved to disk, and the dev server reloads. The reload produces another network change that can be interpreted as a new user edit.

**Canonical fact pattern**

```text
FLOW-SYNC-01: User edit → attribute origin/edit_id → map resource/base revision → persist idempotently → record durable revision → suppress or classify the corresponding reload echo → reconcile runtime state. Failure branches: mapping ambiguity, revision conflict, host unavailable, reload without matching edit_id.
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

