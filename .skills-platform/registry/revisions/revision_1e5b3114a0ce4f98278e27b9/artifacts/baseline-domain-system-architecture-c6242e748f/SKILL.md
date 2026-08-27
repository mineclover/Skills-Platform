---
name: baseline-domain-system-architecture
description: Extract and compact components, responsibility boundaries, source-of-truth rules, dependency direction, adapters, runtime and deployment boundaries, failure domains, and architectural decisions for an 80,000-token canonical baseline. Use for architecture documents, module plans, ADRs, platform designs, and integration-boundary discussions.
---

# System Architecture Domain Reducer

## Role

This is a **core semantic owner** used by `bounded-baseline-condenser`. It extracts and compacts component responsibilities, non-responsibilities, system and ownership boundaries, source-of-truth, dependency direction, adapter boundaries, runtime topology, and architectural decisions.

Primary final-baseline placement: **Scope and boundaries; Architecture and responsibility boundaries; Decisions, risks, and open issues**.

It does not produce a standalone authoritative specification. Add facts to the shared ledger, emit a domain capsule, and let the top-level condenser perform global reconciliation and prose compilation.

## Use when sources contain

- components, services, modules, packages, layers, adapters
- source of truth, authority, ownership, canonical model
- runtime process, deployment unit, browser/server/worker boundary
- dependency direction, plugin interface, failure domain, ADR

## Do not own

- business outcome and user-facing requirement wording
- field-level schema or legal state transitions
- message payload semantics and error codes
- detailed execution sequence
- test cases and task schedules

Reference those domains through canonical IDs instead of restating their facts.


## Domain-capsule output

Update the shared `FACT_LEDGER.jsonl` and emit a compact domain capsule:

```markdown
---
domain_id: system-architecture
role: core
source_coverage: []
budget_weight: 1.0
---

# Domain Capsule — System Architecture

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

- System boundary and external-system ownership
- Component responsibility and explicit non-responsibility
- Canonical source-of-truth and authority direction
- Dependency direction, allowed references, and prohibited coupling
- Adapter, plugin, extension, and framework boundary contracts
- Runtime/deployment/process isolation when it affects behavior or failure
- Failure domains, degradation boundaries, migration architecture, and rollback constraints
- Accepted architectural decisions, supersession, rationale needed to prevent misuse

## High-risk distinctions

| A | B | Preservation rule |
|---|---|---|
| Logical component | Deployment unit | A logical responsibility may share or span processes; do not infer topology. |
| Ownership | Access | A component may read data without owning its truth or lifecycle. |
| Canonical model | Projection/cache | A projection is derived and replaceable unless explicitly promoted. |
| Boundary | Layer | A boundary assigns authority/contract; a layer only suggests organization. |
| Target architecture | Current implementation | Keep the delta and migration path explicit. |
| Adapter | Core domain | Framework/provider behavior must not become the source of truth by accident. |

## Compression operations

| Verbose source form | Canonical form | Loss guard |
|---|---|---|
| Repeated component descriptions | Responsibility matrix | Keep owns, must-not-own, inputs, outputs, dependencies, and failure boundary. |
| Several diagrams retold in prose | One canonical topology plus delta notes | Retain semantics not visible in the diagram. |
| Technology surveys | Accepted/rejected decision records | Keep rejected constraints only when they prevent reconsideration. |
| Layer-by-layer introductions | Dependency and authority rules | Do not preserve marketing-style descriptions. |
| As-is and target documents | Target matrix plus migration delta | Never silently present current limitations as intended design. |

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

- [ ] Every critical responsibility has exactly one owner or an explicit shared-ownership contract.
- [ ] Every component lists what it must not own when boundary drift is likely.
- [ ] Source-of-truth and projection/cache distinctions are explicit.
- [ ] Dependency direction is acyclic or intentionally mediated.
- [ ] Runtime/deployment differences that affect lifecycle or failure are represented.
- [ ] Accepted ADRs retain status, scope, and supersession links.
- [ ] Architecture references product, data, interface, flow, and test facts by ID.

## Cross-domain handoff

- Product supplies required outcomes and externally visible behavior.
- Data/state supplies entities, state, persistence, and invariants owned by components.
- Interfaces supplies cross-boundary protocols.
- Runtime supplies ordered lifecycle and recovery behavior.
- Quality supplies security, SLO, observability, and deployment controls.
- Roadmap owns implementation order and migration work packages.

## Example transformation

**Source pattern**

> The editor, extension, DevTools panel, and local host all manage changes. Some drafts say the panel is the source of truth; later decisions say local files are canonical and the extension keeps history.

**Canonical fact pattern**

```text
DEC-ARCH-04 — Accepted: The local project file is canonical for persisted source. The DevTools panel is an authoring surface, the extension owns browser-context coordination and version-history metadata, and the local host owns filesystem access. No browser surface may become the canonical source merely because it observed the latest edit.
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

