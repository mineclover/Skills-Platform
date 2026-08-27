---
name: baseline-domain-product-requirements
description: Extract and compact product intent, scope, user-visible behavior, business rules, functional requirements, success conditions, and product acceptance for an implementation-grade baseline under 80,000 tokens. Use for PRDs, feature plans, user stories, stakeholder requirements, scope discussions, and product decision logs.
---

# Product Requirements Domain Reducer

## Role

This is a **core semantic owner** used by `bounded-baseline-condenser`. It extracts and compacts product outcomes, actors, scope, non-goals, business rules, user-visible behavior, and functional acceptance intent.

Primary final-baseline placement: **Executive contract; Scope and boundaries; Requirements and acceptance; Decisions, risks, and open issues**.

It does not produce a standalone authoritative specification. Add facts to the shared ledger, emit a domain capsule, and let the top-level condenser perform global reconciliation and prose compilation.

## Use when sources contain

- problem statements, target outcomes, personas or actor roles
- user stories, use cases, scenarios, and business rules
- in-scope/out-of-scope/deferred statements
- priority, success metric, acceptance, and stakeholder decisions

## Do not own

- component responsibility or deployment topology
- entity schema and state-machine detail
- API/event payload contracts
- execution ordering and retry mechanics
- test implementation or milestone ordering

Reference those domains through canonical IDs instead of restating their facts.


## Domain-capsule output

Update the shared `FACT_LEDGER.jsonl` and emit a compact domain capsule:

```markdown
---
domain_id: product-requirements
role: core
source_coverage: []
budget_weight: 1.0
---

# Domain Capsule — Product Requirements

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

- Problem and intended outcome, including who experiences the problem
- Primary actors and role distinctions that change behavior or permissions
- In-scope, out-of-scope, non-goal, forbidden, and deferred boundaries
- Each hard functional requirement with trigger, condition, required result, and exception
- Business rules, priority, status, ownership, and user-visible failure behavior
- Success conditions and acceptance intent linked to requirements
- Product decisions, unresolved trade-offs, blockers, and externally committed behavior

## High-risk distinctions

| A | B | Preservation rule |
|---|---|---|
| Goal | Requirement | A goal describes the outcome; a requirement states behavior or constraint needed to achieve it. |
| Non-goal | Forbidden behavior | A non-goal is not planned; forbidden behavior must not occur. |
| Success metric | Release gate | A metric measures outcome; a gate blocks release when unmet. |
| Persona narrative | Actor contract | Keep only role attributes that change behavior, access, or acceptance. |
| Requirement | Implementation suggestion | Preserve the required result; route the mechanism to architecture or roadmap. |
| Current behavior | Target behavior | Do not merge as-is observations into target requirements. |

## Compression operations

| Verbose source form | Canonical form | Loss guard |
|---|---|---|
| Repeated user stories | One requirement plus a scenario matrix | Keep materially different preconditions, outcomes, and exceptions. |
| Interview quotes and discovery narrative | One bounded rationale note | Do not lose an accepted constraint derived from evidence. |
| Long priority debates | Final priority/status plus unresolved conflict | Do not present historical preference as current authority. |
| Feature lists repeated across documents | Canonical requirement table | Union compatible conditions and acceptance criteria. |
| Personas with descriptive detail | Compact actor/permission table | Retain only implementation-relevant distinctions. |

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

- [ ] Every goal maps to at least one requirement or success condition.
- [ ] Every P0 requirement has scope, status, modality, and acceptance or verification.
- [ ] Non-goals, forbidden behavior, and deferred scope remain distinct.
- [ ] No implementation suggestion is presented as a product requirement without authority.
- [ ] User-visible failure and edge behavior survive scenario deduplication.
- [ ] Product facts reference architecture, contract, flow, and test IDs instead of restating them.

## Cross-domain handoff

- Architecture receives responsibility and boundary implications, not rewritten product prose.
- Data/state receives entity, identity, and lifecycle needs implied by product behavior.
- Interfaces receives boundary interactions and externally visible compatibility needs.
- Testing receives acceptance intent and representative equivalence classes.
- Roadmap receives priority, dependency, decision gate, and deferred scope.

## Example transformation

**Source pattern**

> Users should be able to save a style change immediately. Earlier notes suggest autosave, while the frozen decision requires an explicit save when the local file changed externally. Several user stories repeat the same behavior for CSS and HTML.

**Canonical fact pattern**

```text
REQ-SAVE-01 — P0, accepted: For a mapped resource, the user can persist an authored change to the canonical local file. When the local file has changed externally since the edit base, the system MUST require conflict resolution before overwrite. CSS and HTML are contract variants, not separate product requirements.
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

