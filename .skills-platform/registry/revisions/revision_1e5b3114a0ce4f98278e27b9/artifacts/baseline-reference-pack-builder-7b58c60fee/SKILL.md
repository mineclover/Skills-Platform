---
name: baseline-reference-pack-builder
description: Build the auxiliary source, authority, vocabulary, fact, conflict, dependency, archive, and token-budget documents used to safely condense a large project corpus into one canonical baseline under 80,000 tokens. Use for multi-source plans, versioned designs, long chat histories, conflicting PRDs or ADRs, and any condensation task where traceability and semantic-loss control matter.
---

# Baseline Reference Pack Builder

Create a **working reference pack** before the final baseline is written. The pack makes global deduplication, authority reconciliation, dependency closure, and token allocation inspectable.

This skill does not write a competing project specification. `bounded-baseline-condenser` remains the final compiler and `MASTER_BASELINE.md` remains the sole authoritative deliverable.

## Use when

Use the full pack when any condition applies:

- More than one source can define current behavior or intent.
- Sources contain versions, supersession, accepted/rejected proposals, or as-is/target-state differences.
- The input is roughly above 20,000 tokens.
- Several domain reducers will run.
- Missing one condition, interface rule, state, or release gate would materially affect implementation.
- The user requests source traceability, loss reporting, legacy removal, or a frozen baseline.

For one short coherent source, create only the minimum ledgers needed to prove coverage.

## Output location

Use a temporary or project-local work area such as:

```text
.baseline-work/
├── 00_DOMAIN_ROUTE.md
├── 01_SOURCE_INVENTORY.md
├── 02_AUTHORITY_LEDGER.md
├── 03_TERM_REGISTRY.md
├── 04_FACT_LEDGER.jsonl
├── 05_CONFLICT_REGISTER.md
├── 06_DEPENDENCY_MAP.md
├── 07_TOKEN_BUDGET.md
├── 08_ARCHIVE_INDEX.md
└── 09_COMPRESSION_REPORT.md
```

Only expose these files as user-facing artifacts when requested or when a disclosed limitation requires evidence. They are working documents, not an excuse to remove required semantics from the canonical baseline.

## Reference-document contract

### 00 — Domain route

Produced by `baseline-domain-router`. Records active core owners, overlays, weights, source coverage, and collision rules.

### 01 — Source inventory

One row per source or independently authoritative source section:

| Field | Required meaning |
|---|---|
| `source_id` | Stable local identifier |
| `location` | File, URL, attachment, section, or conversation range |
| `version_or_date` | Explicit value or `unknown` |
| `role` | PRD, architecture, contract, ADR, notes, runtime evidence, etc. |
| `authority` | Current instruction, frozen baseline, approved decision, implementation evidence, proposal, history |
| `state` | Current, supplemental, superseded, partial, inaccessible |
| `domains` | Routed semantic domains |
| `coverage_notes` | Gaps, parsing limits, or special handling |

Do not infer authority from filename recency alone.

### 02 — Authority ledger

Record rules and exceptions that determine which fact wins:

- Explicit user instructions and freezes
- Canonical/frozen document declarations
- Approved ADRs and contracts
- Explicit `supersedes`, `replaces`, `deprecated`, and rejection relations
- As-is versus target-state precedence
- Equal-authority conflicts requiring a decision

The ledger records precedence; it does not silently invent resolutions.

### 03 — Term registry

One canonical term per implementation-relevant concept. Record aliases only when ambiguity or compatibility matters.

| Canonical term | Definition | Alias/deprecated name | Distinct from | Owner/source of truth |
|---|---|---|---|---|

Do not turn the registry into a general glossary.

### 04 — Fact ledger

Use JSON Lines: one atomic fact per line. Required shape:

```json
{"id":"REQ-001","kind":"requirement","statement":"...","status":"accepted","priority":"P0","retention":"L5","authority":"frozen_baseline","primary_domain":"product-requirements","domain_tags":["ui-editor"],"depends_on":[],"supersedes":[],"source_refs":["SRC-001#scope"],"disposition":"retained"}
```

Rules:

- Split paragraphs containing multiple obligations, states, exceptions, or decisions.
- Give each canonical fact one primary domain owner.
- Specialist overlays add `domain_tags` and constraints; they do not duplicate the fact.
- Preserve modality and status.
- Use `merged_into`, `superseded`, `archived`, or `omitted_disclosed` dispositions where relevant.

### 05 — Conflict register

Record only unresolved or materially informative conflicts:

| ID | Facts/sources | Conflict type | Competing constraints | Authority result | Required decision | Blocks |
|---|---|---|---|---|---|---|

Conflict types include terminology, scope, state, contract, implementation, authority, and as-is/target-state mismatch.

### 06 — Dependency map

Record P0/P1 dependency closure:

- Goal → requirement
- Requirement → component/data/contract/flow
- Contract → entity/state/validation
- Flow → failure/recovery/observability
- Requirement → acceptance evidence
- Open decision/risk → blocked work

A compact edge list is sufficient. Do not duplicate full statements.

### 07 — Token budget

Track the target before drafting:

| Section/domain | Weight | Minimum | Target | Current | Compression action | Risk if reduced |
|---|---:|---:|---:|---:|---|---|

The domain pool is allocated by semantic density, authority, coupling, and irreversibility—not source length.

### 08 — Archive index

Point to removed history, evidence, tutorials, and superseded detail. Record why it is outside the master baseline and whether it still constrains future work.

### 09 — Compression report

Record tokenizer, exact/estimated count, source/output counts, fact disposition, P0/P1 coverage, conflicts, audit status, and known loss.

Never claim 100% coverage without ledger-derived counts.

## Workflow

1. Read or receive `DOMAIN_ROUTE.md`.
2. Inventory sources and mark accessibility and authority.
3. Extract explicit authority and supersession relations before fact mapping.
4. Normalize only implementation-relevant vocabulary.
5. Have each selected domain skill emit atomic facts into the shared ledger.
6. Reconcile duplicate facts globally, then record unresolved conflicts.
7. Close dependencies for P0/P1 facts.
8. Allocate section/domain budgets before canonical prose is drafted.
9. Update dispositions as the baseline is compiled.
10. Produce the compression report after the final integrity audit.

## Minimal-pack mode

For a small source set, the minimum acceptable pack is:

```text
SOURCE_INVENTORY.md
FACT_LEDGER.jsonl
TOKEN_BUDGET.md
COMPRESSION_REPORT.md
```

Add authority, conflict, term, dependency, or archive documents whenever their omission would hide a decision or make coverage unverifiable.

## Prohibited behavior

- Do not write independent chunk summaries and treat them as facts.
- Do not let each domain assign different IDs to the same semantic fact.
- Do not hide normative requirements only in the reference pack.
- Do not mark a source superseded solely because it is older.
- Do not treat inaccessible source content as empty.
- Do not drop an unresolved conflict to make the final document cleaner.
- Do not use source token volume as a proxy for importance.

## Completion gate

The pack is ready for compilation when:

- Every accessible source has inventory metadata.
- Every retained P0/P1 fact has source references and a primary domain.
- Explicit supersession and equal-authority conflicts are represented.
- P0/P1 dependencies are closed or flagged.
- Active domain budgets sum to the declared working target.
- The reference pack contains no normative requirement absent from the planned canonical baseline.

## Related files

- `references/reference-pack-schema.md`
- `references/fact-ledger-rules.md`
- `references/token-budget-policy.md`
- `templates/`

## v0.3 — 재귀 컨텍스트·유지보수 보조 원장

수평·수직 실행 또는 유지보수 케이스까지 압축 범위에 포함되는 경우 다음 파일을 선택적으로 추가한다.

```text
10_ELEMENT_REGISTRY.jsonl
11_TOPIC_REGISTRY.jsonl
12_CONTEXT_INDEX.md
13_RESPONSIBILITY_LEDGER.md
14_METHOD_CAPABILITY_MAP.md
15_MAINTENANCE_CASE_INDEX.md
16_CONTEXT_PATCH_REGISTER.md
```

이 파일들은 각각 독립 요소, 토픽, 컨텍스트 스냅샷, 관리 책임, Method–Capability–Tool 관계, 케이스 상태, 컨텍스트 변경 제안을 추적한다.

Fact Ledger에는 필요 시 다음 필드를 추가한다.

```json
{
  "topic_id": "TOPIC-001",
  "subject_refs": ["element.core"],
  "scope_orientation": "vertical",
  "scope_path": [],
  "responsibility_mode": "managed",
  "context_role": "prior-context",
  "maintenance_case_refs": ["CASE-001"]
}
```

보조 원장은 규범을 숨기는 장소가 아니다. 구현에 필요한 현재 규칙은 여전히 `MASTER_BASELINE.md` 또는 해당 published Context Snapshot에 포함해야 한다.

