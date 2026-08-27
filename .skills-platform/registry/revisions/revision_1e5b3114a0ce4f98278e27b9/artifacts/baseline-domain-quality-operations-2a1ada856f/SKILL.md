---
name: baseline-domain-quality-operations
description: Extract and compact performance, capacity, security, privacy, reliability, degradation, observability, deployment, configuration, backup, recovery, migration, rollback, and cost constraints for an implementation-grade baseline under 80,000 tokens.
---

# Quality, Security, and Operations Domain Reducer

## Role

This is a **core semantic owner** used by `bounded-baseline-condenser`. It extracts and compacts non-functional requirements, trust and access controls, reliability and degradation, observability, configuration and secrets, deployment, backup and recovery, compatibility migration, rollback, and operating cost constraints.

Primary final-baseline placement: **Quality, security, and operations; Requirements and acceptance; Decisions, risks, and open issues**.

It does not produce a standalone authoritative specification. Add facts to the shared ledger, emit a domain capsule, and let the top-level condenser perform global reconciliation and prose compilation.

## Use when sources contain

- latency, throughput, capacity, memory, cost, SLO
- authentication, authorization, permission, origin, privacy, secret
- availability, durability, degradation, recovery, backup
- logging, metrics, tracing, audit, diagnostics
- deploy, configuration, migration, rollback, compatibility

## Do not own

- core user behavior
- component responsibilities except operational ownership
- business entity schema
- protocol semantics except quality constraints
- test implementation details and project sequencing

Reference those domains through canonical IDs instead of restating their facts.


## Domain-capsule output

Update the shared `FACT_LEDGER.jsonl` and emit a compact domain capsule:

```markdown
---
domain_id: quality-operations
role: core
source_coverage: []
budget_weight: 1.0
---

# Domain Capsule — Quality, Security, and Operations

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

- Quantified performance, capacity, resource, and cost limits when committed
- Trust boundaries, authentication, authorization, capability, origin, and least-privilege rules
- Data privacy, retention, redaction, audit, and secret-handling constraints
- Availability, durability, consistency, degradation, fallback, and recovery objectives
- Required logs, metrics, traces, correlation, audit events, and diagnostic surfaces
- Configuration authority, environment separation, deployment, upgrade, and rollback rules
- Backup, restore, migration, compatibility windows, and irreversible-change controls
- Operational ownership, alerts, run gates, and release-blocking non-functional failures

## High-risk distinctions

| A | B | Preservation rule |
|---|---|---|
| Target | Gate | A desired target does not block release unless designated as a gate. |
| Threat | Control | A threat describes risk; a control is enforceable mitigation. |
| Availability | Durability | A service can be reachable while losing data, or durable while unavailable. |
| Recovery | Rollback | Recovery restores service/state; rollback reverts a release or change. |
| Monitoring | Observability | Monitoring checks known conditions; observability supports diagnosing unknowns. |
| Fallback | Silent coercion | Fallback must preserve declared semantics or expose degradation. |
| Privacy | Security | Privacy controls data use; security controls unauthorized access and integrity. |

## Compression operations

| Verbose source form | Canonical form | Loss guard |
|---|---|---|
| Long operational prose | Constraint and control matrices | Keep thresholds, owners, enforcement, and failure action. |
| Generic security guidance | Project-specific threat/control pairs | Archive boilerplate. |
| Detailed runbook steps | Gate plus pointer | Retain steps only when required for correctness or recovery. |
| Repeated logging requests | Canonical telemetry contract | Keep required fields, correlation, retention, and redaction. |
| Migration discussion history | Migration/rollback contract | Preserve irreversibility and compatibility window. |

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

- [ ] Every committed SLO or limit names measurement and failure action.
- [ ] Trust boundaries and permissions are explicit for each external context.
- [ ] Sensitive data and secrets have storage, transport, logging, and retention rules.
- [ ] Degradation never silently violates a P0 contract.
- [ ] Critical flows have correlation and diagnostic evidence.
- [ ] Migration and rollback are present for compatibility or persistent-state changes.
- [ ] Operational gates map to testing evidence and owners.

## Cross-domain handoff

- Architecture supplies trust, deployment, and failure boundaries.
- Data/state supplies sensitivity, retention, durability, and migration surfaces.
- Interfaces supplies authentication, validation, correlation, and rate constraints.
- Runtime supplies failure/recovery points and timing behavior.
- Testing owns verification and release evidence.
- Roadmap owns rollout, migration, and operational-readiness work.

## Example transformation

**Source pattern**

> The tool should be fast and secure, keep history, and not lose edits. Logs are useful, but source contents may be sensitive.

**Canonical fact pattern**

```text
REQ-NFR-01: Persist operations MUST be crash-safe and revisioned; no acknowledged durable save may be lost. INV-SEC-02: Source contents and patches are redacted from default logs; correlation uses resource_id, revision, edit_id, and outcome. AC-OPS-03: recovery and redaction tests block release.
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

