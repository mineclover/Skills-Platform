---
name: bounded-baseline-condenser
description: Consolidate fragmented plans, PRDs, architecture notes, ADRs, contracts, TODOs, and change history into one canonical implementation baseline under a strict token budget. Default target is 72,000 tokens with a hard cap of 80,000 tokens. Preserve requirements, accepted decisions, interfaces, invariants, acceptance criteria, risks, open issues, and traceability while removing duplicate, superseded, historical, and verbose material.
---

# Bounded Baseline Condenser — Single-File Skill

> This is the base condenser only. For the router, reference pack, and compact domain profiles in one file, use the suite-level `single-file/bounded-baseline-suite.single.md`.

## Mission

Convert a large and fragmented project corpus into one authoritative, implementation-grade baseline that fits within a hard token cap.

Treat this as **semantic normalization, authority reconciliation, dependency-preserving compilation, and budget enforcement**. Do not treat it as generic summarization.

## Defaults

```text
output             = MASTER_BASELINE.md
hard_limit         = 80,000 tokens
working_target     = 72,000 tokens
warning_threshold  = 76,000 tokens
audience           = implementation agents, maintainers, reviewers
mode               = target_state unless sources or user specify otherwise
```

Count the entire canonical file: front matter, headings, tables, code fences, and appendices. Supporting files may hold evidence/history but may not hold normative content missing from the canonical baseline.

## Non-negotiable rules

1. Never truncate by raw character/token boundary.
2. Never silently resolve conflicts.
3. Never delete prerequisites of retained requirements, contracts, decisions, invariants, or acceptance criteria.
4. Never weaken accepted normative language.
5. Never claim an exact count without naming the tokenizer.
6. Never concatenate independently written chunk summaries.
7. Never hide required content in an uncounted appendix or companion file.
8. Never preserve obsolete detail merely because it is extensive.
9. Keep all unresolved decisions, blockers, risks, and deferred scope visible.
10. Never exceed the hard cap. If irreducible high-priority content cannot fit, disclose bounded loss.

## When to use

Use for requests such as:

- 전체 계획/설계를 한 문서로 병합
- 80k 토큰 이내의 구현 기준선 생성
- 정본 하나만 남기고 레거시·중복 제거
- 여러 PRD/ADR/스펙 버전 병합
- 에이전트 핸드오프용 컨텍스트 압축
- 큰 프로젝트 문서를 컨텍스트 한도에 맞게 재구성

Do not use when the user only wants a short executive summary.

## Fact-first representation

Before drafting prose, normalize sources into atomic facts:

```json
{
  "id": "REQ-001",
  "kind": "goal | non_goal | requirement | decision | contract | invariant | flow | acceptance | risk | open_issue | todo | evidence",
  "statement": "one atomic statement",
  "status": "accepted | implemented | proposed | open | deferred | superseded | rejected",
  "priority": "P0 | P1 | P2 | P3",
  "authority": "current_user | frozen_baseline | approved_decision | verified_runtime | current_proposal | historical_note",
  "scope": [],
  "depends_on": [],
  "supersedes": [],
  "source_refs": []
}
```

Paragraphs are not atomic. Split passages when they contain several obligations, exceptions, states, or decisions.

## Authority order

Unless overridden:

1. Current explicit user instruction
2. Accepted/frozen/canonical baseline
3. Approved ADR, contract, or signed-off requirement
4. Verified implementation/runtime evidence for an as-is baseline
5. Current proposal or active draft
6. Historical draft, meeting note, exploration, or unverified idea

Rules:

- Explicit `supersedes/replaces/deprecated` beats chronology.
- A later date alone does not prove authority.
- Runtime does not override intended target state unless the document is as-is.
- Equal-authority conflicts remain explicit open conflicts.
- Rejected options survive only when their rejection constrains future work.

## Retention model

### L5 / P0 — preserve exact semantics

- Goals, non-goals, system/ownership boundaries
- Hard requirements and user-visible behavior
- Accepted decisions and supersession
- External/cross-module contracts
- Data shapes, identifiers, state transitions, compatibility
- Invariants, constraints, security/safety/compliance
- Acceptance criteria and release gates
- High-impact risks, blockers, unresolved conflicts

Rewriting is allowed; removing conditions, exceptions, modality, status, or scope is not.

### L4 / P1 — compact but complete

- Architecture and responsibility boundaries
- Critical flows and lifecycle
- Failure, recovery, rollback, migration
- Dependency/ownership information
- Test strategy and observability
- Implementation ordering that affects correctness

### L3 / P2 — summarize aggressively

- Non-binding rationale
- Alternatives
- Local implementation suggestions
- Representative examples
- Research conclusions already reflected in decisions

### L2 — pointer or one line

- Detailed research evidence
- Meeting chronology
- Tutorials and long examples
- Exhaustive option lists
- Walkthroughs already represented by a contract

### L1 / P3 — omit or archive

- Exact duplicates/paraphrases
- Superseded drafts without residual constraints
- Status chatter and acknowledgements
- Resolved placeholders/questions
- Copied material whose conclusion is already captured
- Decorative prose and repeated introductions

Priority meaning:

- P0: omission makes implementation incorrect, unsafe, incompatible, or unverifiable
- P1: omission causes architectural drift, operational failure, or cross-module misunderstanding
- P2: useful rationale/local guidance/examples
- P3: historical, duplicated, exploratory, cosmetic

P0 must be represented 100%. P1 must be direct or encoded in a complete compact contract.

## Semantic duplicate test

Two passages are duplicates only when these match:

- Subject/scope
- Normative force
- Lifecycle/state
- Preconditions
- Result/obligation
- Failure/exception behavior
- Temporal status
- Authority

If one adds a condition, exception, compatibility rule, or state, merge the information; do not discard it.

## Workflow

### 1. Establish budget and mode

Record:

- Hard limit, target, warning threshold
- Tokenizer and `exact|estimated`
- Audience
- `target_state|as_is|mixed`

Use the consumer model/runtime tokenizer. If unavailable, mark estimated, target at most 60,000 estimated tokens, and never claim exact compliance.

### 2. Inventory sources

For each source record identity/version, role, authority, status, domains, and whether current/supplemental/superseded. Do not infer canonical status from filename recency alone.

### 3. Map to facts

For large corpora, segment by semantic domain or responsibility boundary, not arbitrary chunks. Each map pass emits atomic facts with IDs, authority, status, dependencies, and source refs. It does not emit polished prose.

Suggested domains:

- Product intent/scope
- User behavior/requirements
- Domain/data/state
- Architecture/ownership
- Interfaces/contracts
- Runtime flows
- Quality/security/operations
- Testing/acceptance
- Decisions/risks/implementation

### 4. Normalize vocabulary and identity

- One canonical term per concept
- Merge aliases/spelling variants
- Preserve externally visible names needed for compatibility
- Assign IDs only where traceability/status/cross-reference matters
- Keep similar but distinct concepts separate

Recommended IDs:

```text
G-* goal       NG-* non-goal    REQ-* requirement
DEC-* decision CTR-* contract   INV-* invariant
FLOW-* flow    AC-* acceptance  RISK-* risk
OPEN-* open    TODO-* work item
```

### 5. Reconcile duplicates and conflicts

For equivalent facts:

- Merge sources into one fact
- Preserve strongest supported normative wording from highest authority
- Union compatible conditions/exceptions/dependencies/acceptance criteria

For conflicts:

1. Apply explicit supersession.
2. Apply authority order.
3. Separate as-is and target state.
4. If unresolved, emit a compact conflict record and required decision.

### 6. Close dependencies

For each P0/P1 item, ensure the baseline also contains needed definitions, upstream/downstream assumptions, state/lifecycle context, failure/recovery, and verification.

Never leave a requirement without its subject, state, interface, or success condition.

### 7. Compile the canonical document

Write rules before rationale. Preserve `MUST/SHOULD/MAY` or `필수/권고/선택` consistently.

Use tables for repeated dimensions and prose for causal logic/exceptions. Keep code only where a signature, schema, state machine, or algorithm is the contract. Keep one representative example per concept. Convert history into status/supersession metadata.

### 8. Enforce budget

Count after each material pass. Reduce in this order:

1. Semantic duplicates
2. Superseded/rejected detail without residual constraints
3. Scattered/repeated structure
4. Extra examples
5. Non-essential rationale
6. Repeated prose converted to contract tables/signatures/state matrices
7. Lexical shortening
8. P2/P3 reduction

Never start with lexical shortening; most savings must come from semantic and structural consolidation.

Budget gates:

```text
<= 72k             integrity audit
72k–76k            one more P2/P3 pass
76k–80k            repeat structural/rationale compression; ship cautiously
> 80k              do not ship; continue reducing
```

If P0/P1 alone cannot fit:

- Preserve P0 first, then P1 by authority/dependency impact.
- Use the most compact loss-minimizing contract representation.
- Add `Compression limitations`.
- List omitted semantic groups and source locations.
- Mark `bounded-loss`.
- Remain under 80k.

### 9. Audit integrity

Verify all of the following:

#### Authority/status
- Current instructions represented
- Accepted/frozen decisions not weakened
- Superseded items not current
- Implemented/proposed/deferred/rejected states distinct
- Equal-authority conflicts explicit

#### Goal/requirements
- Every goal has requirement/success condition
- Every P0 requirement represented
- Every requirement has scope/status
- Every hard requirement has acceptance/verification
- Non-goals remain visible

#### Contracts/state
- Every boundary interaction has a contract
- Producer/consumer and input/output or pre/postconditions explicit
- Failure/compatibility included where relevant
- States and legal transitions represented
- As-is and target state not accidentally merged

#### Invariants/validation
- Every invariant has enforcement/validation location
- Release gates remain
- Required tests/observability remain
- Migration/rollback remains when compatibility/state changes

#### Dependency/coherence
- P0/P1 dependencies included
- No undefined entities or orphan IDs
- No circular reference introduced by compression
- One canonical definition per concept
- No unmarked competing names

#### Budget/disclosure
- Tokenizer named
- Count exact or estimated
- Entire canonical file counted
- Count under hard cap
- Bounded loss disclosed
- Supporting files contain no absent normative requirements

Audit result:

- `PASS`
- `PASS_WITH_ESTIMATED_COUNT`
- `PASS_WITH_DISCLOSED_LOSS`
- `FAIL`

### 10. Deliver

Required:

- `MASTER_BASELINE.md` — sole authoritative baseline under hard cap

Optional:

- `COMPRESSION_REPORT.md` — count, ratio, retention, conflicts, limitations
- `SOURCE_LEDGER.json` — source/fact/output traceability
- `ARCHIVE_INDEX.md` — locations of omitted evidence/history

Optional files may not contain normative requirements absent from the master baseline.

## Canonical document schema

```markdown
---
baseline_id: PROJECT-BASELINE-vX.Y
status: draft | review | frozen
mode: target_state | as_is | mixed
tokenizer: TOKENIZER_ID
count_status: exact | estimated
token_count: 0
working_target: 72000
hard_limit: 80000
compression_status: lossless-semantic | bounded-loss | estimated-count
supersedes: []
source_set: []
---

# [Project] — Canonical Baseline

## 0. Document control
- Authority, scope, audience, source coverage, limitations

## 1. Executive contract
- Problem, outcome, users, success, core thesis, key non-goals

## 2. Scope and boundaries
- In/out, system/ownership boundary, assumptions, deferred scope

## 3. Canonical vocabulary and identity
- Terms, aliases, IDs, source of truth

## 4. Requirements and acceptance
| ID | Requirement | Priority | Status | Acceptance | Dependencies |

## 5. Domain, data, and state model
- Entities, identifiers, ownership, states/transitions, compatibility, invariants

## 6. Architecture and responsibility boundaries
| Component | Owns | Must not own | Inputs | Outputs | Dependencies |

## 7. Interfaces and contracts
| ID | Producer → Consumer | Input/output | Failure | Compatibility | Validation |

## 8. Critical flows and lifecycle
- Trigger, ordered stages, state changes, outputs, failure/recovery, completion

## 9. Quality, security, and operations
- Performance, reliability, security/privacy, observability, migration/rollback

## 10. Implementation plan
| Stage | Outcome | Dependencies | Deliverables | Exit criteria | Risks |

## 11. Decisions, risks, and open issues
- Accepted decisions, risks, unresolved decisions/conflicts

## 12. Traceability
- Goal → requirement → component/contract/flow → acceptance → source

## 13. Compression limitations
- Only when estimated, source gaps, bounded loss, or authority conflicts exist
```

## Compact contract pattern

```text
CTR-API-03 | Producer: Editor | Consumer: Runtime
Input: SceneDocument v2
Output: deterministic RuntimeSnapshot
Failure: reject unknown node kinds; never coerce silently
Compatibility: current and previous minor version
Validation: schema + invariants before publish
```

Do not repeat the same contract across architecture, flow, implementation, and testing sections.

## Compact decision pattern

```text
DEC-07 — Accepted: Use a canonical intermediate representation before adapters.
Reason: framework-specific behavior must not become the source of truth.
Rejected: direct React/DOM mutation as the canonical model.
```

## Compression report minimum

- Tokenizer and exact/estimated status
- Source/output counts and ratio
- P0/P1/P2/P3 source fact counts
- Retained/merged/superseded/archived/omitted counts
- Unresolved conflicts
- P0/P1 coverage
- Audit result
- Compression limitations

Do not claim 100% coverage without a source/fact ledger.

## Completion gate

Complete only when:

- Canonical file is under 80,000 tokens.
- Tokenizer and count status are stated.
- P0 facts are represented or omission is explicitly disclosed under bounded loss.
- Accepted decisions, contracts, invariants, acceptance, risks, and open conflicts survive.
- Duplicate/superseded prose no longer competes with the baseline.
- An implementation agent can act without reading the original narrative.
- Integrity audit passes or every failure is disclosed.
