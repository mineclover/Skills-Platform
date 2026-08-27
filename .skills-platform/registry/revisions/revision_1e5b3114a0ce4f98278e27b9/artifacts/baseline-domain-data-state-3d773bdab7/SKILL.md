---
name: baseline-domain-data-state
description: Extract and compact domain entities, identifiers, relationships, schemas, persistence, derived projections, state machines, invariants, versioning, and migration semantics for a canonical baseline under 80,000 tokens. Use for data models, JSON schemas, database plans, state diagrams, document models, and lifecycle specifications.
---

# Data and State Domain Reducer

## Role

This is a **core semantic owner** used by `bounded-baseline-condenser`. It extracts and compacts entities, identifiers, relationships, schema semantics, data ownership, persistence, derived projections, legal states and transitions, invariants, versioning, and migration semantics.

Primary final-baseline placement: **Canonical vocabulary and identity; Domain, data, and state model; Interfaces and contracts; Quality, security, and operations**.

It does not produce a standalone authoritative specification. Add facts to the shared ledger, emit a domain capsule, and let the top-level condenser perform global reconciliation and prose compilation.

## Use when sources contain

- entity, record, document, node, asset, identifier, key
- schema, field, relationship, cardinality, ownership
- state, transition, lifecycle, event-sourced or snapshot data
- persistence, cache, projection, version, migration, compatibility

## Do not own

- product priority and user-story phrasing
- component responsibility beyond data ownership
- transport-level interface behavior
- ordered workflow beyond state-transition semantics
- test execution and roadmap ordering

Reference those domains through canonical IDs instead of restating their facts.


## Domain-capsule output

Update the shared `FACT_LEDGER.jsonl` and emit a compact domain capsule:

```markdown
---
domain_id: data-state
role: core
source_coverage: []
budget_weight: 1.0
---

# Domain Capsule — Data and State

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

- Core entities and relationships with cardinality where correctness depends on it
- Canonical identifiers, business keys, address schemes, and identity stability
- Field semantics only when they affect behavior, compatibility, validation, or ownership
- Canonical ownership, persistence, retention, derivation, cache/projection rules
- State names, legal transitions, transition owner, preconditions, and terminal states
- Invariants and where they are enforced or validated
- Versioning, backward/forward compatibility, migration, and data-loss constraints
- Null/absent/default semantics and immutable/mutable distinctions when material

## High-risk distinctions

| A | B | Preservation rule |
|---|---|---|
| Source of truth | Projection/cache | Derived data must not silently gain authority. |
| State | Event | A state is durable condition; an event records occurrence. |
| Identifier | Locator/URL | Identity must remain stable when location changes unless specified otherwise. |
| Null | Absent | They may encode different lifecycle or compatibility meaning. |
| Logical model | Physical schema | Keep implementation-independent semantics separate from storage optimization. |
| Authored value | Computed value | Computed values require derivation and invalidation rules. |
| Version | Revision | Schema/protocol compatibility may differ from content history. |

## Compression operations

| Verbose source form | Canonical form | Loss guard |
|---|---|---|
| Field descriptions scattered across prose | Canonical schema table | Retain constraints, defaults, ownership, and compatibility semantics. |
| Repeated lifecycle narratives | State-transition matrix | Keep trigger, guard, owner, effect, and illegal transitions. |
| Many sample records | One representative instance plus edge cases | Examples cannot replace normative schema. |
| Database-specific details | Logical contract plus necessary physical constraints | Archive tuning unless it affects correctness or migration. |
| Duplicated identifiers | Identity codec/table | Do not merge IDs with different stability or authority. |

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

- [ ] Every entity and state referenced by P0/P1 facts is defined.
- [ ] Canonical IDs and location/address values are not conflated.
- [ ] Every legal transition has trigger/guard/owner/effect or an explicit governing rule.
- [ ] Every invariant has an enforcement or validation location.
- [ ] Persistence, projection, and cache authority are explicit.
- [ ] Compatibility and migration rules survive schema compaction.
- [ ] Interface payloads reference canonical data definitions rather than redefining them.

## Cross-domain handoff

- Architecture receives data ownership and source-of-truth constraints.
- Interfaces receive canonical payload types and compatibility rules.
- Runtime receives legal transitions and mutation ownership.
- Quality receives retention, privacy, durability, backup, and migration requirements.
- Testing receives invariant, migration, and transition verification obligations.

## Example transformation

**Source pattern**

> A selected object has world x/y, screen x/y, CSS left/top, and a transformed bounding box. Several documents call all of these position.

**Canonical fact pattern**

```text
TERM-POS — Canonical distinction: authored document position, computed world transform, viewport projection, screen coordinates, and visual bounds are separate values. INV-POS-01: Persist only authored document-space geometry; viewport and screen values are derived projections.
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

