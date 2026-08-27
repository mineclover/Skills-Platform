# Overlay Composition

## Purpose

Specialist overlays preserve technology-specific correctness while avoiding technology-shaped final documents.

## Composition rules

1. Extract the underlying fact with a core owner.
2. Add the overlay tag.
3. Apply overlay distinctions, fields, and validation checks.
4. Charge final prose to the core owner section.
5. Create a technology-specific subsection only when several facts require one shared contract or invariant.

## Example

Source intent:

> Save a CSS change made in DevTools to the matching local source and avoid reload loops.

Canonical ownership:

- Product: user-visible save behavior.
- Architecture: extension/host responsibility boundary.
- Interface: change event and save protocol.
- Runtime: attribution, debounce, save, reload suppression flow.
- Quality: conflict and data-loss controls.
- Testing: end-to-end verification.
- Browser DevTools overlay: Workspaces/Overrides distinction, DevTools lifecycle, source-map and network/local mapping rules.

Do not create six paraphrases. Create linked facts and one canonical flow.
