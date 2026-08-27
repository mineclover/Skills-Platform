---
name: baseline-domain-testing-acceptance
description: Extract and compact acceptance criteria, verification methods, test levels, contract tests, fixtures, oracles, failure and edge coverage, non-functional evidence, and release gates for a canonical project baseline under 80,000 tokens.
---

# Testing and Acceptance Domain Reducer

## Role

This is a **core semantic owner** used by `bounded-baseline-condenser`. It extracts and compacts verification strategy, acceptance criteria, test evidence, fixtures and environments, oracles, coverage obligations, release gates, and validation ownership.

Primary final-baseline placement: **Requirements and acceptance; Quality, security, and operations; Traceability; Decisions, risks, and open issues**.

It does not produce a standalone authoritative specification. Add facts to the shared ledger, emit a domain capsule, and let the top-level condenser perform global reconciliation and prose compilation.

## Use when sources contain

- acceptance criterion, verification, validation, test plan
- unit, integration, contract, end-to-end, property, fuzz
- fixture, test data, environment, oracle, evidence
- coverage, regression, release gate, pass/fail

## Do not own

- the underlying product requirement
- system responsibility or protocol definition
- entity or state truth
- runtime behavior itself
- implementation milestone ordering except test gates

Reference those domains through canonical IDs instead of restating their facts.


## Domain-capsule output

Update the shared `FACT_LEDGER.jsonl` and emit a compact domain capsule:

```markdown
---
domain_id: testing-acceptance
role: core
source_coverage: []
budget_weight: 1.0
---

# Domain Capsule — Testing and Acceptance

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

- Acceptance criterion or verification method for every hard requirement
- Test level appropriate to the boundary and failure risk
- Canonical fixtures, environments, versions, and external dependencies needed for reproducibility
- Oracle and evidence that distinguish pass, fail, warning, and degraded behavior
- Contract, compatibility, migration, race, recovery, and failure-path coverage
- Non-functional measurement method, threshold, and release action
- Regression ownership, release gates, known untestable areas, and waived risks
- Traceability from requirement/contract/invariant/flow to evidence

## High-risk distinctions

| A | B | Preservation rule |
|---|---|---|
| Verification | Validation | Verification checks conformance; validation checks that the result solves the intended need. |
| Acceptance criterion | Test case | A criterion is normative; several cases may prove it. |
| Unit test | Contract test | A unit test isolates code; a contract test proves boundary obligations. |
| Mock | Faithful simulator | A mock may not reproduce lifecycle, timing, or protocol semantics. |
| Coverage metric | Risk coverage | Line coverage does not prove critical branches or contracts. |
| Expected failure | Flaky test | A modeled failure is deterministic evidence; flakiness is uncontrolled uncertainty. |
| Pass | Degraded | Degraded behavior must have explicit acceptance semantics. |

## Compression operations

| Verbose source form | Canonical form | Loss guard |
|---|---|---|
| Many repetitive test cases | Parameterized equivalence-class matrix | Keep distinct preconditions, failures, and environments. |
| Test implementation walkthrough | Criterion, oracle, fixture, evidence | Archive mechanics unless required for reproducibility. |
| Repeated acceptance prose | Traceability matrix | Do not weaken modality or threshold. |
| Tool comparisons | Selected harness plus capability gap | Preserve gaps that limit confidence. |
| Logs/screenshots embedded as narrative | Evidence pointer and expected signature | Do not treat anecdote as normative proof. |

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

- [ ] Every P0 requirement, contract, invariant, and critical flow has a verification path.
- [ ] Acceptance criteria are observable and not circular restatements.
- [ ] Boundary semantics are covered by contract or integration tests, not only mocks.
- [ ] Failure, retry, restart, race, migration, and rollback paths are represented where relevant.
- [ ] Non-functional gates name measurement environment and threshold.
- [ ] Known test gaps and waivers remain visible.
- [ ] Traceability does not duplicate full requirements.

## Cross-domain handoff

- All domains supply normative facts and risk classes to verify.
- Quality supplies thresholds and operational evidence requirements.
- Roadmap receives test harness, migration, and release-gate dependencies.
- Product receives validation outcomes when requirements are ambiguous.

## Example transformation

**Source pattern**

> Test that saving works in normal cases, iframes, reloads, and conflicts. There are dozens of browser-specific cases and screenshots.

**Canonical fact pattern**

```text
AC-SAVE-01: For each supported browser/context class, verify edit attribution → mapping → durable persistence → reload-echo suppression. Parameterize same-origin/cross-origin iframe, DevTools open/closed transition, revision conflict, host restart, and unsupported mapping. Evidence: final file revision, event trace, and explicit user-visible outcome.
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

