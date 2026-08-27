---
name: bounded-baseline-condenser
description: Consolidate fragmented project plans, PRDs, architecture notes, ADRs, contracts, TODOs, and change history into one canonical implementation baseline under a strict token budget. Use when a user asks to reduce, merge, freeze, hand off, or keep an entire plan or design within a context limit without losing requirements, accepted decisions, interfaces, invariants, validation criteria, risks, open issues, and source traceability. Default target is 72,000 tokens with a hard cap of 80,000 tokens.
---

# Bounded Baseline Condenser

Produce a **single authoritative project baseline** that remains usable for implementation and review while fitting within a strict token budget.

This is not ordinary summarization. Treat the task as **semantic normalization + authority reconciliation + dependency-preserving compilation + token-budget enforcement**.

## Default contract

Unless the user overrides these values:

- Output: `MASTER_BASELINE.md`
- Hard limit: `80,000` tokens
- Working target: `72,000` tokens
- Warning threshold: `76,000` tokens
- Audience: implementation agents, maintainers, and reviewers
- Authority mode: preserve the user's latest explicit instruction and all accepted/frozen decisions
- Completeness goal: complete in requirements, decisions, contracts, invariants, validation, risks, and open issues; intentionally incomplete in narrative history and repeated explanation

Count **all text in the canonical file**, including headings, tables, code fences, front matter, and appendices. Do not hide required content in an uncounted appendix or companion file.

Supporting files may contain source locations, evidence, and discarded history, but the canonical baseline must remain understandable and actionable without them.

## Non-negotiable rules

1. **Never truncate by character or token boundary.** Reduce semantic redundancy instead.
2. **Never silently resolve a contradiction.** Apply explicit authority rules or record it as an open conflict.
3. **Never remove a prerequisite of a retained requirement, contract, decision, or acceptance criterion.**
4. **Never convert an accepted decision back into a suggestion.** Preserve normative force.
5. **Never claim exact token compliance without naming the tokenizer used.**
6. **Never concatenate independent chunk summaries.** Large inputs must be mapped into structured facts and globally reduced.
7. **Never move normative content outside the capped canonical document merely to pass the budget.**
8. **Never preserve obsolete prose merely because it is detailed.** Preserve current semantics, not document volume.
9. **Keep every unresolved decision, blocker, risk, and deferred scope item visible.**
10. **The hard cap always wins.** If complete semantic preservation is impossible, retain higher-authority and higher-impact content, disclose the loss, and do not mislabel the result as lossless.

## Trigger conditions

Use this skill when the request includes one or more of these intents:

- “전체 계획을 한 문서로 정리”
- “설계 정본 하나만 남기기”
- “80k 토큰 이내로 축약”
- “중복·레거시 흔적 제거”
- “에이전트에 넘길 컨텍스트 문서 만들기”
- “여러 버전의 PRD/ADR/스펙 병합”
- “구현 가능한 기준선으로 압축”
- “문서가 너무 커져 컨텍스트에 들어가지 않음”

Do not use this skill for a lightweight executive summary whose purpose is only communication. This skill preserves an implementation-grade baseline.

## Input classes

Accept any mixture of:

- Product requirements and project plans
- Architecture and system design documents
- ADRs and decision logs
- Data contracts, schemas, API specifications, and state models
- Implementation plans, milestones, and TODOs
- Test plans and acceptance criteria
- Change logs, meeting notes, chat transcripts, and exploratory research
- Existing canonical or frozen baselines
- Source code or runtime evidence when the requested document describes the implemented system

## Suite composition

When the companion skills are installed, use this skill as the **only final compiler**.
Companion skills do not produce competing baselines.

```text
source corpus
→ baseline-domain-router
→ baseline-reference-pack-builder
→ selected core domain reducers
→ optional specialist overlays
→ global reconciliation in this skill
→ MASTER_BASELINE.md
→ integrity and token audit
```

### Required companion roles

- `baseline-domain-router`: selects semantic owners and specialist overlays; emits `DOMAIN_ROUTE.md`.
- `baseline-reference-pack-builder`: creates the source, authority, fact, conflict, dependency, and budget ledgers used during reduction.
- Core domain reducers: emit domain capsules containing atomic facts, contracts, states, flows, decisions, risks, and acceptance evidence.
- Specialist overlays: add technology-specific distinctions and validation checks to existing facts. They do not own separate final sections by default.

### Domain ownership rule

Assign each canonical fact one primary semantic owner:

| Fact concern | Primary owner |
|---|---|
| Product outcome, user-visible behavior, scope | product requirements |
| Component responsibility and system boundary | system architecture |
| Entity, identifier, persistence, state, invariant | data and state |
| Producer/consumer protocol and compatibility | interfaces |
| Ordered execution, retry, recovery, completion | runtime workflows |
| Performance, security, reliability, operations | quality and operations |
| Verification evidence and release gates | testing and acceptance |
| Dependency-ordered implementation work | delivery roadmap |

Other domains may reference or annotate the fact but must not redefine it. Merge all domain capsules into one global fact ledger before writing prose.

### Activation thresholds

- One short, coherent source: route directly; the reference pack may remain minimal.
- Multiple sources, competing versions, or more than roughly 20k input tokens: build the full reference pack.
- More than roughly 120k input tokens: map by semantic domain and source authority; never summarize arbitrary chunks.
- Specialist technology present: activate the matching overlay in addition to its core semantic owners.

### Working-target allocation

The 72k working target is allocated dynamically, not equally:

```text
control, scope, vocabulary                8–12%
active core-domain payload               62–72%
decisions, risks, delivery, traceability 14–20%
internal rewrite buffer                   4–8%
```

An overlay receives no independent section budget unless the technology itself is a primary project boundary. Its facts are charged to the owning core domain.

## Core model: compile facts, not prose

Before drafting the output, normalize source material into fact records. Use this logical shape even if no file is emitted:

```json
{
  "id": "REQ-001",
  "kind": "goal | non_goal | requirement | decision | contract | invariant | flow | acceptance | risk | open_issue | todo | evidence",
  "statement": "One atomic, testable or reviewable statement",
  "status": "accepted | implemented | proposed | open | deferred | superseded | rejected",
  "priority": "P0 | P1 | P2 | P3",
  "authority": "current_user | frozen_baseline | approved_decision | verified_runtime | current_proposal | historical_note",
  "scope": ["component-or-domain"],
  "depends_on": ["ID"],
  "supersedes": ["ID"],
  "source_refs": ["file-or-section-reference"],
  "notes": "Only information needed for reconciliation"
}
```

Atomic facts make semantic duplication, conflict, dependency, and omission detectable. Do not treat paragraphs as indivisible units.

## Authority order

Apply this order unless the user explicitly defines another authority model:

1. Current explicit user instruction for this task
2. Explicitly accepted, frozen, or canonical baseline
3. Approved ADR, contract, or signed-off requirement
4. Verified current implementation or runtime behavior, when documenting the system as it exists
5. Current proposal or active draft
6. Historical draft, meeting note, chat exploration, or unverified idea

Additional rules:

- An explicit `supersedes`, `replaces`, `deprecated`, or equivalent statement wins over chronology.
- A later date alone does not prove authority.
- Runtime evidence does not override an intended target-state requirement unless the document is explicitly an as-is baseline.
- When two items of equal authority conflict, retain the conflict under `Open decisions and conflicts`.
- Preserve rejected alternatives only when their rejection constrains future work or prevents repeated reconsideration.

## Retention levels

Assign every fact a retention level before compression.

### L5 — semantic preservation required

Preserve exact meaning and normative force:

- Goals, non-goals, and system boundaries
- Hard requirements and user-visible behavior
- Accepted decisions and supersession relations
- External and cross-module contracts
- Data shapes, identifiers, state transitions, and compatibility rules
- Invariants, constraints, security/safety/compliance conditions
- Acceptance criteria and release gates
- Unresolved blockers and high-impact risks

L5 prose may be rewritten, but no condition, exception, status, or obligation may disappear.

### L4 — compact but complete

- Architecture and responsibility boundaries
- Critical flows and lifecycle behavior
- Failure, recovery, rollback, and migration behavior
- Dependency and ownership information
- Test strategy and observability requirements
- Implementation ordering where ordering changes correctness

### L3 — summarize aggressively

- Rationale that is useful but not binding
- Considered alternatives
- Local implementation suggestions
- Representative examples
- Research conclusions already converted into decisions

### L2 — retain by pointer or one-line note

- Detailed research evidence
- Full meeting chronology
- Long examples and tutorials
- Exhaustive option lists
- Detailed implementation walkthroughs already represented by a contract

### L1 — omit from the canonical baseline

- Exact duplicates and paraphrases
- Superseded drafts with no remaining constraint
- Status chatter, acknowledgements, and process narration
- Empty placeholders and resolved questions
- Copied source material whose conclusion is already captured
- Decorative prose and repeated introductions

## Priority classification

Use impact, not prose length:

- `P0`: omission makes implementation incorrect, unsafe, incompatible, or impossible to validate
- `P1`: omission causes significant architectural drift, operational failure, or cross-module misunderstanding
- `P2`: useful rationale, local guidance, examples, and secondary alternatives
- `P3`: historical, duplicated, exploratory, or cosmetic detail

Retention expectations:

- P0: 100% represented in the canonical document
- P1: represented directly or by a complete compact contract
- P2: summarized only when budget permits
- P3: normally omitted or archived

## Workflow

### Phase 1 — establish the budget

Record:

- `hard_limit`
- `working_target`
- `warning_threshold`
- `tokenizer`
- `count_status = exact | estimated`
- `audience`
- `document_mode = target_state | as_is | mixed`

Defaults:

```text
hard_limit       = 80,000
working_target   = 72,000
warning_threshold= 76,000
reserve          = 8,000
```

Use the tokenizer of the model or runtime that will consume the document. If that tokenizer is unavailable:

- Mark the count as estimated.
- Use a conservative working target of `60,000` estimated tokens.
- Do not state that the 80,000-token hard cap is exactly verified.

### Phase 2 — inventory sources

Build a source inventory with:

- Source identity and version/date
- Document role
- Authority/status
- Covered domains
- Whether it is current, supplemental, or superseded
- Known conflicts or gaps

Prefer explicit metadata over inference. Do not assume the newest filename is canonical.

### Phase 3 — map sources into fact records

For large input sets, process by semantic domain or responsibility boundary, not arbitrary fixed-size chunks.

Each map pass must emit atomic facts with IDs, status, authority, dependencies, and source references. It must not emit polished summary prose.

Recommended domains:

- Product intent and scope
- User behavior and requirements
- Domain/data/state model
- Architecture and ownership
- Interfaces and contracts
- Runtime flows
- Quality, security, and operations
- Testing and acceptance
- Decisions, risks, and implementation plan

### Phase 4 — normalize vocabulary and identity

Create one canonical term per concept.

- Merge aliases and spelling variants.
- Preserve externally visible names when compatibility depends on them.
- Assign stable IDs to goals, requirements, decisions, contracts, invariants, risks, and open issues.
- Replace repeated full definitions with references to the canonical ID.
- Record terms that look similar but must remain distinct.

A glossary is not a dumping ground. Include only terms whose ambiguity affects implementation.

### Phase 5 — reconcile duplicates and conflicts

For semantically equivalent facts:

- Merge sources into one canonical fact.
- Preserve the strongest normative wording supported by the highest-authority source.
- Union compatible conditions, exceptions, dependencies, and acceptance criteria.
- Do not merge items that only look similar but differ in lifecycle, authority, scope, or failure behavior.

For conflicts:

1. Apply explicit supersession.
2. Apply authority order.
3. Check target-state versus as-is intent.
4. If still unresolved, keep both statements in a compact conflict record with the required decision.

### Phase 6 — close dependencies

For every retained P0/P1 fact, verify that the document also contains:

- Definitions required to understand it
- Upstream and downstream contract assumptions
- State and lifecycle context
- Error and recovery behavior when relevant
- Validation or acceptance evidence

Do not retain a requirement whose subject, state, interface, or success condition has been removed.

### Phase 7 — compile the canonical document

Use the schema in `references/canonical-schema.md`. Adapt section names to the domain, but preserve the semantic roles.

Write for direct implementation:

- Put the decision or rule before its rationale.
- Use `MUST`, `SHOULD`, and `MAY`, or the Korean equivalents `필수`, `권고`, and `선택`, consistently.
- Use tables for repeated dimensions and comparisons.
- Use prose for causal logic, exceptions, and flows that tables would obscure.
- Keep code only when a signature, schema, state machine, or algorithm is itself the contract.
- Prefer one representative example per concept.
- Replace narrative history with status and supersession metadata.

### Phase 8 — enforce the token budget

Count tokens after every material rewrite pass.

Apply reduction in this order:

1. **Semantic deduplication** — merge repeated facts and definitions
2. **Authority pruning** — remove superseded and rejected detail that has no remaining constraint
3. **Structural compression** — consolidate scattered sections, normalize tables, remove repeated headings
4. **Example reduction** — keep one representative example or a compact pattern
5. **Rationale reduction** — retain only rationale needed to understand a decision or avoid misuse
6. **Contract normalization** — convert repeated prose into typed fields, matrices, signatures, or state tables
7. **Lexical compression** — shorten sentences without removing conditions or modality
8. **Secondary-scope reduction** — summarize P2 detail and archive P3 material

Never begin with lexical compression. Most savings must come from semantic and structural consolidation.

Budget gates:

- `<= working_target`: proceed to integrity audit
- `working_target < count <= warning_threshold`: run one more P2/P3 compression pass
- `warning_threshold < count <= hard_limit`: run structural and rationale compression again; ship only if integrity remains intact
- `> hard_limit`: do not ship; continue reduction

If P0/P1 content alone cannot fit:

- Preserve P0 first, then P1 by authority and dependency impact.
- Convert detailed contracts into the most compact loss-minimizing representation available.
- Emit a visible `Compression limitations` section.
- List omitted semantic groups and their source locations.
- Mark the result `bounded-loss`, not `lossless`.
- Remain under the hard cap.

### Phase 9 — run integrity audits

Run all checks in `references/compression-audit.md`.

At minimum verify:

- Every goal has at least one requirement or success condition.
- Every P0 requirement has an acceptance criterion or explicit verification method.
- Every accepted decision is represented with status and scope.
- Every contract defines inputs/outputs or producer/consumer obligations.
- Every stateful behavior has legal transitions or lifecycle rules.
- Every invariant has an enforcement or validation location.
- Every open conflict remains visible.
- No retained section depends on an omitted definition.
- No duplicate or contradictory canonical IDs exist.
- The token count is under the hard cap.

### Phase 10 — deliver

Primary output:

- `MASTER_BASELINE.md` — the sole authoritative implementation baseline, under the hard cap

Optional supporting outputs:

- `COMPRESSION_REPORT.md` — token count, ratio, retention statistics, conflicts, and limitations
- `SOURCE_LEDGER.json` — source-to-fact traceability
- `ARCHIVE_INDEX.md` — locations of omitted history/evidence

Supporting outputs must not contain normative requirements that are absent from `MASTER_BASELINE.md`.

## Canonical writing rules

### Preserve semantics through IDs

Use compact stable IDs:

- `G-*` goal
- `NG-*` non-goal
- `REQ-*` requirement
- `DEC-*` accepted or proposed decision
- `CTR-*` interface/data contract
- `INV-*` invariant
- `FLOW-*` critical flow
- `AC-*` acceptance criterion
- `RISK-*` risk
- `OPEN-*` unresolved decision/conflict
- `TODO-*` implementation item

Do not create an ID for every sentence. Assign IDs only where cross-reference, status, validation, or traceability matters.

### Preserve modality

These are not equivalent:

- “can” versus “must”
- “currently does” versus “will do”
- “preferred” versus “required”
- “not planned” versus “forbidden”
- “deferred” versus “rejected”

Keep the original force and temporal status.

### Prefer compact contracts

Good compact form:

```text
CTR-API-03 | Producer: Editor | Consumer: Runtime
Input: SceneDocument v2
Output: deterministic RuntimeSnapshot
Failure: reject unknown node kinds; never coerce silently
Compatibility: reader supports current and previous minor version
Validation: schema + invariant checks before publish
```

Avoid repeating these obligations across architecture, flow, implementation, and test sections.

### Keep rationale adjacent but bounded

For a consequential decision, retain:

```text
DEC-07 — Accepted: Use a canonical intermediate representation before adapters.
Reason: prevents framework-specific behavior from becoming the source of truth.
Rejected: direct React/DOM mutation as the canonical model.
```

Do not retain the full discussion unless the reasoning contains unresolved constraints.

## Compression report requirements

When a report is requested, include:

- Tokenizer and exact/estimated status
- Source token count, output token count, and compression ratio
- P0/P1/P2/P3 fact counts
- Retained, merged, superseded, archived, and omitted counts
- Unresolved conflict count
- P0 coverage and P1 coverage
- Structural audit result
- Known compression limitations

Do not report 100% coverage unless it is derived from a fact/source ledger.

## Completion criteria

The skill is complete only when:

- The canonical document is under the hard token cap.
- The tokenizer and count status are stated.
- All P0 facts are represented or explicitly disclosed as omitted due to a bounded-loss condition.
- Accepted decisions, contracts, invariants, acceptance criteria, risks, and open conflicts survive compression.
- Superseded and duplicated prose no longer competes with the canonical baseline.
- The document can be handed to an implementation agent without requiring the original narrative to understand the intended system.
- Integrity validation passes or every failed check is disclosed.

## Related files

- `references/retention-rubric.md` — detailed keep/merge/archive rules
- `references/canonical-schema.md` — output section contract
- `references/compression-audit.md` — loss and consistency checks
- `templates/MASTER_BASELINE.template.md` — canonical document template
- `templates/COMPRESSION_REPORT.template.md` — report template
- `templates/SOURCE_LEDGER.template.json` — fact ledger template
- `scripts/count_tokens.py` — token counter with exact and estimated modes
- `scripts/validate_baseline.py` — structural and ID validation
- `single-file/bounded-baseline-condenser.single.md` — standalone version containing the base operational rules
- Sibling skill `baseline-domain-router` — domain ownership and overlay selection
- Sibling skill `baseline-reference-pack-builder` — working reference documents and ledgers
- Sibling `baseline-domain-*` skills — core reducers and specialist overlays

## v0.3 — 컨텍스트·행동·유지보수 모델 보존

대상 프로젝트가 재귀적 수평·수직 실행이나 유지보수 제어 플레인을 사용한다면 다음 의미 구분을 P0/P1로 보존한다.

```text
Element / Topic          독립적인 정체성
Context Snapshot         행동 전 선언적 입력
Behavior Run             실제 탐색·해결 실행
Responsibility Envelope  변경 가능 범위
Method / Capability      도구 독립 절차와 원자 능력
Tool Binding             실제 실행 수단
Maintenance Case         신호부터 폐쇄까지 상태 추적
```

압축 중 다음을 병합하지 않는다.

- Horizontal Context와 Horizontal Result
- Vertical Context와 Vertical Result
- Topic ID와 Context ID
- Problem Location과 Resolution Ownership
- Method와 Tool 이름
- Test PASS와 Production Stabilization
- Context Patch Proposal과 Published Context

Fact record 확장 권장형:

```json
{
  "id": "REQ-001",
  "kind": "requirement",
  "statement": "...",
  "topic_id": "TOPIC-001",
  "subject_refs": ["element.core"],
  "scope_orientation": "vertical",
  "scope_path": [],
  "responsibility_mode": "managed",
  "context_role": "prior-context",
  "maintenance_case_refs": [],
  "primary_domain": "runtime-workflows"
}
```

80k 조립 시 관리 대상은 상세하게, 소비·관찰·외부 대상은 Public Projection만 포함한다. 재귀 프레임 전체를 복사하지 않고 현재 focus path와 직접 의존만 유지한다.

