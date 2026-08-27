# UI Editor Overlay Retention Profile

## Composition

Refines: `baseline-domain-system-architecture`, `baseline-domain-data-state`, `baseline-domain-interfaces`, `baseline-domain-runtime-workflows`, `baseline-domain-quality-operations`, `baseline-domain-testing-acceptance`.

Overlay facts must attach to a core-owned fact through `domain_tags`, dependencies, or validation links. The overlay does not create a competing final section by default.

## Required overlay fields

| Atom | Specialist content | Required metadata |
|---|---|---|
| Overlay atom 1 | Canonical document model versus transient editor/view state | Core fact ID, source, affected domains, validation |
| Overlay atom 2 | Object identity, authored/computed values, and persistence boundary | Core fact ID, source, affected domains, validation |
| Overlay atom 3 | World, document, viewport, screen, local, and visual-bound coordinate spaces | Core fact ID, source, affected domains, validation |
| Overlay atom 4 | Transform composition, zoom/pan, hit testing, measurement, snapping, and tolerance semantics | Core fact ID, source, affected domains, validation |
| Overlay atom 5 | Selection, focus, pointer/keyboard routing, handles, overlays, and interaction-state transitions | Core fact ID, source, affected domains, validation |
| Overlay atom 6 | DOM/Canvas/iframe/shadow boundaries and DOM continuity requirements | Core fact ID, source, affected domains, validation |
| Overlay atom 7 | Layout intent, constraints, intrinsic measurement, style layers, overrides, and computed output | Core fact ID, source, affected domains, validation |
| Overlay atom 8 | Undo/redo/history transaction boundaries and deterministic serialization | Core fact ID, source, affected domains, validation |
| Overlay atom 9 | Preview, runtime projection, publishing, accessibility, and unsupported visual transforms | Core fact ID, source, affected domains, validation |

## Promotion rule

Promote a specialist detail to P0/P1 only when omitting it could change correctness, compatibility, fidelity, security, lifecycle, or acceptance. Keep technology background and broad surveys at P2/P3.

## Merge rule

Merge repeated technology notes into one capability/constraint record. Preserve browser/provider/asset/version differences when they change behavior.

## Example

Source:

> The canvas should place a 100×100 button over the same landmark in a 1920×1080 reference, allow zooming, snapping, and DOM animation.

Overlay-enriched form:

```text
Overlay constraints: authored landmark anchors live in document space; viewport zoom/pan is a derived matrix; alignment uses explicit anchor pairs and tolerance; snap feedback is transient; DOM projection must preserve node identity across animation/state transitions; resize and scale remain distinct commands.
```
