---
name: baseline-domain-router
description: Route a large project corpus to semantic domain reducers and specialist overlays before an 80,000-token canonical-baseline compilation. Use when plans or designs span product, architecture, data, interfaces, runtime, operations, testing, roadmap, UI editors, browser DevTools, AI agents, 3D graphics, or metadata publishing.
---

# Baseline Domain Router

Select the smallest set of domain skills that can preserve the source corpus without assigning the same fact to several owners.

The router is **multi-label**. It identifies semantic owners and specialist overlays; it does not split the final document into technology silos.

## Output

Create `DOMAIN_ROUTE.md` using `templates/DOMAIN_ROUTE.template.md`.

The route must contain:

- Active core domains
- Active specialist overlays
- Source/domain coverage
- Primary-owner rules
- Budget weights
- Cross-domain joins
- Excluded domains and reasons
- Ambiguities or routing conflicts

## Core domain owners

| Skill | Owns canonical facts about |
|---|---|
| `baseline-domain-product-requirements` | Outcomes, users, scope, business rules, user-visible behavior, functional acceptance |
| `baseline-domain-system-architecture` | Components, responsibility boundaries, source-of-truth and dependency direction |
| `baseline-domain-data-state` | Entities, identifiers, persistence, state transitions, schema semantics, invariants |
| `baseline-domain-interfaces` | APIs, events, messages, files, producer/consumer obligations, compatibility |
| `baseline-domain-runtime-workflows` | Triggers, ordered execution, concurrency, retries, recovery, completion |
| `baseline-domain-quality-operations` | Performance, security, reliability, observability, deployment and migration |
| `baseline-domain-testing-acceptance` | Verification strategy, evidence, coverage, release gates |
| `baseline-domain-delivery-roadmap` | Dependency-ordered stages, deliverables, exit criteria, blockers and deferred work |

A canonical fact has one core owner. Other core domains reference it through IDs.

## Specialist overlays

| Skill | Activate when sources contain |
|---|---|
| `baseline-domain-ui-editor` | Visual authoring, DOM/Canvas, coordinate systems, layout constraints, selection, history, publishing/runtime projection |
| `baseline-domain-browser-devtools` | Browser extension contexts, DevTools panels, Workspaces/Overrides, source maps, network-to-local mapping, hot reload |
| `baseline-domain-ai-agent-systems` | Agents, tools, prompts, skills, model/provider selection, memory/context, approval, evals |
| `baseline-domain-graphics-3d-motion` | Meshes, skeletons, rigs, animation, retargeting, coordinate frames, rendering/control outputs |
| `baseline-domain-knowledge-publishing` | Metadata, taxonomy, provenance, JSON-LD/RDF, publication lifecycle, canonical URLs and verification |

An overlay does not own a separate final section by default. It annotates facts owned by core domains and adds high-risk distinctions and audits.

## Routing procedure

### 1. Detect semantic questions, not keywords alone

For each source section ask:

- What behavior or outcome is required?
- Who owns the responsibility?
- What data or state exists?
- What crosses a boundary?
- In what order does execution occur?
- What quality or operational constraint applies?
- How is success proven?
- In what dependency order is work delivered?

Route by the answer, even when the source heading is misleading.

### 2. Select core domains

Activate a core domain when it owns at least one P0/P1 fact or a dependency needed to understand such a fact.

Do not activate a domain only because it has many P2 examples or research notes.

### 3. Select overlays

Activate an overlay when technology-specific distinctions can change correctness, compatibility, fidelity, security, or validation.

Overlay examples:

- A generic “position” fact becomes unsafe without world/document/viewport coordinate distinctions → UI editor overlay.
- A generic file-sync contract becomes incomplete without DevTools open/close lifecycle and network/local attribution → browser DevTools overlay.
- A generic workflow becomes incomplete without tool permission, model uncertainty, or human approval semantics → AI agent overlay.

### 4. Assign source coverage

Each source may map to several domains, but every extracted fact receives one primary core owner.

Record section-level coverage for mixed documents rather than assigning an entire file to one domain.

### 5. Assign weights

Weight factors:

- `1.4`: foundational, high-coupling, externally compatible, or dominant project concern
- `1.2`: several P0/P1 facts or critical lifecycle/contracts
- `1.0`: normal active domain
- `0.8`: narrow but required supporting domain
- `0.5`: sparse domain represented mostly by pointers

Weights allocate the active domain pool. They do not override a P0 minimum.

Overlays normally have `budget_weight: 0`; their content is charged to owning core domains. Give an overlay an explicit budget only when the technology is itself the principal system boundary.

### 6. Define joins

Record the IDs or semantic joins required across domains, for example:

```text
REQ-* → component owner → CTR-* → FLOW-* → AC-*
entity/state → CTR-* payload → FLOW-* transition → INV-* → AC-*
DEC-* → affected domains → TODO-* migration stage
```

### 7. Limit activation

Typical projects use four to seven core domains and zero to three overlays. Activating every skill usually indicates routing by vocabulary rather than semantic ownership.

Do not omit a necessary domain merely to meet this heuristic.

## Collision rules

Use these precedence rules when two domains claim the same passage:

- User-visible/business rule → product; architecture references it.
- Responsibility/source-of-truth → architecture; data records the owned object.
- Entity field/state/invariant → data; interface references the schema.
- Boundary payload/error/version → interface; runtime references the contract.
- Sequence/retry/recovery → runtime; operations owns SLOs and run controls.
- Acceptance condition → testing; product may own the behavior it proves.
- Implementation order → roadmap; architecture owns the target design.
- Technology-specific nuance → overlay tag on the core-owned fact.

If ownership remains ambiguous, record it as a routing conflict rather than duplicating the fact.

## Completion gate

Routing is complete when:

- Every source section with P0/P1 semantics has at least one active owner.
- Every active domain has an explicit reason and source coverage.
- Every overlay names the core domains it refines.
- No canonical fact type has two declared primary owners.
- Weights and P0 minimums fit the declared working target.
- Excluded domains are documented when their omission could be surprising.

## Related files

- `references/domain-ownership-matrix.md`
- `references/routing-signals.md`
- `references/overlay-composition.md`
- `templates/DOMAIN_ROUTE.template.md`

## v0.3 — 실행 방향 라우팅과의 결합

의미 도메인 라우팅 전에 `baseline-task-mode-router`의 결과를 읽는다. 두 라우팅은 독립 축이다.

```yaml
task_mode:
  task_intent: exploration | resolution
  context_orientation: horizontal | vertical
semantic_route:
  primary_domain: runtime-workflows
  overlays: [browser-devtools]
```

- 수평·수직을 제품군·제품 같은 고정 도메인으로 분류하지 않는다.
- Horizontal Context/Behavior와 Vertical Context/Behavior는 이 스킬이 작성하지 않는다.
- 이 스킬은 선택된 프레임 안에서 **어떤 의미 소유자가 사실을 보존할지**만 결정한다.
- 하나의 canonical fact에는 하나의 core semantic owner를 유지한다.
- 다음 메타 필드는 모든 도메인 사실에서 보존한다.

```json
{
  "topic_id": "TOPIC-...",
  "subject_refs": ["element-id"],
  "scope_orientation": "horizontal | vertical",
  "scope_path": [],
  "responsibility_mode": "managed | consumed | external",
  "context_role": "prior-context | behavior-result | evidence"
}
```

