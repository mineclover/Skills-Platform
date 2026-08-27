---
name: baseline-domain-delivery-roadmap
description: Extract and compact dependency-ordered implementation stages, outcomes, deliverables, entry and exit criteria, decision gates, owners, blockers, risks, migration work, and deferred scope for a canonical baseline under 80,000 tokens. Use for roadmaps, TODOs, implementation plans, milestones, handoff plans, and release sequencing.
---

# Delivery Roadmap Domain Reducer

## Role

This is a **core semantic owner** used by `bounded-baseline-condenser`. It extracts and compacts dependency-ordered delivery stages, work packages, outcomes, deliverables, entry/exit criteria, owners, blockers, decision gates, rollout, migration, and deferred work.

Primary final-baseline placement: **Implementation plan; Decisions, risks, and open issues; Compression limitations**.

It does not produce a standalone authoritative specification. Add facts to the shared ledger, emit a domain capsule, and let the top-level condenser perform global reconciliation and prose compilation.

## Use when sources contain

- roadmap, milestone, stage, phase, workstream, TODO
- dependency, blocker, owner, deliverable, exit criteria
- research spike, decision gate, migration, rollout, release
- deferred, later, out of scope, follow-up

## Do not own

- target product behavior
- canonical architecture, data, interface, or runtime semantics
- quality requirement itself
- test semantics beyond stage exit evidence

Reference those domains through canonical IDs instead of restating their facts.


## Domain-capsule output

Update the shared `FACT_LEDGER.jsonl` and emit a compact domain capsule:

```markdown
---
domain_id: delivery-roadmap
role: core
source_coverage: []
budget_weight: 1.0
---

# Domain Capsule — Delivery Roadmap

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

- Dependency order that changes correctness or prevents rework
- Stage outcome, entry conditions, deliverables, and verifiable exit criteria
- Decision/research gates separated from implementation work
- Owners or responsible roles when needed for handoff
- Blockers, external dependencies, risks, and mitigation work
- Migration, compatibility, rollout, rollback, and operational-readiness stages
- Deferred scope with revisit trigger and prerequisites
- Definition of done distinguished from mere code completion

## High-risk distinctions

| A | B | Preservation rule |
|---|---|---|
| Milestone | Task | A milestone is an outcome/gate; tasks are actions contributing to it. |
| Research | Implementation | Research resolves uncertainty; it must have a decision output. |
| Blocked | Parallelizable | A dependency edge must be semantic, not chronological preference. |
| Implemented | Validated | Code completion does not satisfy acceptance or operational gates. |
| Deferred | Rejected | Deferred work retains a revisit condition; rejected work does not. |
| Release | Rollout | Release makes an artifact available; rollout changes exposure/state. |
| Owner | Contributor | Accountability differs from assistance. |

## Compression operations

| Verbose source form | Canonical form | Loss guard |
|---|---|---|
| Long chronological TODO list | Dependency-ordered work packages | Merge tasks with one outcome and exit gate. |
| Repeated status updates | Current status and evidence only | Archive acknowledgements and stale percentages. |
| Research notes | Decision gate with question, options, evidence, due output | Do not preserve exploration as implementation. |
| Component-by-component plans | Vertical slices when dependencies permit | Retain boundary contracts and integration gates. |
| Deferred wish list | Deferred-scope table | Keep only rationale, trigger, and prerequisites. |

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

- [ ] Every stage produces an outcome, deliverable, and verifiable exit criterion.
- [ ] Dependencies derive from target contracts and flows, not arbitrary chronology.
- [ ] Open decisions are scheduled before work that depends on them.
- [ ] Implementation, integration, validation, migration, and operational readiness are distinct gates.
- [ ] Deferred scope has a reason and revisit trigger.
- [ ] No roadmap item silently changes the canonical design.
- [ ] Risks and blockers link to affected stages and owners.

## Cross-domain handoff

- All domains supply dependency-critical artifacts and exit evidence.
- Testing supplies validation and release gates.
- Quality supplies migration, rollout, rollback, and readiness requirements.
- Product supplies priority and committed scope.

## Example transformation

**Source pattern**

> First build the extension, then the host, then mapping, then history, then hot reload. Some tasks can happen together, and mapping uncertainty blocks save behavior.

**Canonical fact pattern**

```text
Stage 1 — Resolve resource identity/mapping contract and conflict semantics. Exit: approved CTR-MAP-* plus fixture corpus. Stage 2A — host persistence/versioning; Stage 2B — extension context bridge (parallel). Stage 3 — end-to-end attribution/save/reload suppression. Stage 4 — history UI and operational hardening. No save implementation may precede the mapping decision gate.
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

