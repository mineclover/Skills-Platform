---
name: baseline-domain-ui-editor
description: Apply UI-editor-specific retention and compression rules to canonical baseline facts involving DOM or Canvas authoring, coordinate systems, layout constraints, selection, overlays, interaction state, history, serialization, publishing, accessibility, and runtime projection. Use as a specialist overlay, not as an independent final-document owner.
---

# UI Editor Overlay

## Role

This is a **specialist overlay**, not a core semantic owner. It refines facts owned by `baseline-domain-system-architecture`, `baseline-domain-data-state`, `baseline-domain-interfaces`, `baseline-domain-runtime-workflows`, `baseline-domain-quality-operations`, `baseline-domain-testing-acceptance`.

Add `ui-editor` to `domain_tags`, add missing technology-specific constraints and audits, and charge the final prose to the owning core domain. Create a dedicated final subsection only when this technology is itself the principal system boundary.

## Activate when sources contain

- visual editor, authoring surface, stage, canvas, DOM, iframe, shadow DOM
- selection, resize, rotate, ruler, snap, measurement, overlay
- world/document/viewport/screen coordinate, zoom, pan, transform
- layout constraints, style cascade, undo/redo, serialization, publishing


## Domain-capsule output

Update the shared `FACT_LEDGER.jsonl` and emit a compact domain capsule:

```markdown
---
domain_id: ui-editor
role: overlay
source_coverage: []
budget_weight: 0.0
---

# Domain Capsule — UI Editor Overlay

## Canonical terms
## Atomic P0/P1 facts
## Contracts, states, flows, or invariants owned/refined here
## Decisions, risks, and open issues
## Acceptance/evidence links
## Compression candidates
## Cross-domain handoff
```

The capsule is an intermediate representation. Do not polish it into an independent summary or repeat facts owned elsewhere.


## Overlay constraints to preserve

- Canonical document model versus transient editor/view state
- Object identity, authored/computed values, and persistence boundary
- World, document, viewport, screen, local, and visual-bound coordinate spaces
- Transform composition, zoom/pan, hit testing, measurement, snapping, and tolerance semantics
- Selection, focus, pointer/keyboard routing, handles, overlays, and interaction-state transitions
- DOM/Canvas/iframe/shadow boundaries and DOM continuity requirements
- Layout intent, constraints, intrinsic measurement, style layers, overrides, and computed output
- Undo/redo/history transaction boundaries and deterministic serialization
- Preview, runtime projection, publishing, accessibility, and unsupported visual transforms

## High-risk distinctions

| A | B | Preservation rule |
|---|---|---|
| Document state | View state | Selection, hover, guides, and viewport are usually transient unless explicitly persisted. |
| Authored geometry | Computed geometry | Persist intent; derive layout and projections unless the contract says otherwise. |
| World/document | Viewport/screen | Pan, zoom, device scale, and iframe offsets must not contaminate canonical coordinates. |
| Visual bounds | Hit bounds | Effects and handles can change visible extents without changing authored geometry. |
| Scale | Resize | Scale transforms appearance; resize may change layout and intrinsic measurement. |
| DOM continuity | Visual equivalence | Rebuilding an equivalent screenshot may still break focus, state, accessibility, or animation continuity. |
| Overlay | Document object | Transient feedback must not enter canonical stacking/order accidentally. |

## Compression operations

| Verbose source form | Canonical form | Loss guard |
|---|---|---|
| Many interaction examples | State/command/effect matrix | Keep modality, focus, cancellation, and persistence boundaries. |
| Screenshots and visual narratives | Behavioral contract plus coordinate diagram pointer | Do not infer semantics only from pixels. |
| Repeated geometry formulas | One transform/coordinate contract | Retain unit, origin, order, rounding, and tolerance. |
| Tool-specific panel descriptions | Capability and responsibility matrix | Preserve user-visible behavior and extension points. |
| Style examples | Cascade/layer contract | Keep precedence, scope, reset, and serialization rules. |

## Application procedure

1. Read the routed core-domain capsules and shared fact ledger.
2. Locate facts whose correctness depends on this specialist domain.
3. Tag those facts; do not create duplicate canonical statements.
4. Add missing preconditions, state distinctions, failure semantics, compatibility rules, or acceptance obligations.
5. Promote priority/retention only when omission would change correctness, fidelity, safety, compatibility, or verification.
6. Convert technology research into compact capability, contract, state, or decision records.
7. Record unsupported or uncertain capabilities as explicit limitations or open decisions.
8. Run the overlay audit below and return ledger patches to the core owners/top-level condenser.

## Overlay audit

- [ ] Every geometry value names its coordinate space, unit, origin, and transform owner.
- [ ] Persistent document state and transient editor state are separated.
- [ ] Selection/focus/input behavior survives DOM, iframe, and shadow boundaries.
- [ ] Undo/redo groups user intent atomically and excludes derived noise.
- [ ] Layout/style overrides have deterministic precedence and serialization.
- [ ] Preview/published/runtime projections preserve declared DOM continuity and accessibility.
- [ ] Unsupported transforms and measurement limits are explicit.

## Example transformation

**Source pattern**

> The canvas should place a 100×100 button over the same landmark in a 1920×1080 reference, allow zooming, snapping, and DOM animation.

**Overlay-enriched canonical pattern**

```text
Overlay constraints: authored landmark anchors live in document space; viewport zoom/pan is a derived matrix; alignment uses explicit anchor pairs and tolerance; snap feedback is transient; DOM projection must preserve node identity across animation/state transitions; resize and scale remain distinct commands.
```

## Completion gate

Complete only when technology-specific correctness constraints are attached to core-owned facts, unsupported cases are visible, and the overlay has not created a parallel technology-shaped specification.

## Reference

Read `references/retention-profile.md` for overlay atom fields, composition, and compact patterns.

## v0.3 recursive-context overlay rule

기술 특수성을 추가할 때 현재 `topic_id`, 수평·수직 frame, responsibility mode를 보존한다. Overlay는 탐색 결과를 해결 컨텍스트로 승격하거나 외부 요소의 내부 책임을 현재 시스템에 부여하지 않는다. 관리하지 않는 기술·플랫폼은 공개 계약, 관찰 증거, 경계 완화 조건만 보강한다.

