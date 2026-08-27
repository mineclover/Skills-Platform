# Compression Integrity Audit

Run these checks after the document is below the working target and again after the final edit.

## A. Authority and status

- [ ] Current user instructions are represented.
- [ ] Frozen/accepted decisions are not weakened or omitted.
- [ ] Superseded content is not presented as current.
- [ ] Proposed, deferred, rejected, and implemented states remain distinct.
- [ ] Equal-authority contradictions are listed as open conflicts.

## B. Goal and requirement closure

- [ ] Every goal maps to at least one requirement or success condition.
- [ ] Every P0 requirement is represented.
- [ ] Every requirement has scope and status.
- [ ] Every hard requirement has an acceptance criterion or explicit verification method.
- [ ] Non-goals and forbidden scope remain visible.

## C. Contract completeness

- [ ] Every cross-boundary interaction has a contract.
- [ ] Producer and consumer responsibilities are explicit.
- [ ] Inputs/outputs or preconditions/postconditions are explicit.
- [ ] Failure and compatibility behavior are included where relevant.
- [ ] No contract references an undefined entity, state, or identifier.

## D. State and lifecycle integrity

- [ ] Canonical states are defined.
- [ ] Legal transitions and transition owners are represented.
- [ ] Critical flows include failure/recovery behavior.
- [ ] As-is and target-state behavior are not accidentally merged.

## E. Invariants and validation

- [ ] Every invariant has an enforcement or validation location.
- [ ] Every release gate is still present.
- [ ] Test/observability requirements needed to prove acceptance remain.
- [ ] Migration/rollback rules remain when state or compatibility changes.

## F. Dependency closure

- [ ] Every retained P0/P1 item has required definitions and prerequisites.
- [ ] No orphan IDs exist.
- [ ] No circular reference is introduced by compression.
- [ ] Implementation stages respect required dependency ordering.

## G. Redundancy and coherence

- [ ] Each concept has one canonical definition.
- [ ] Repeated component and flow descriptions are consolidated.
- [ ] Rationale does not restate the decision in several sections.
- [ ] Glossary entries are necessary and used.
- [ ] There are no competing names for the same canonical concept without alias metadata.

## H. Budget and disclosure

- [ ] Tokenizer is named.
- [ ] Count status is exact or estimated.
- [ ] Full canonical file is counted.
- [ ] Count is at or below the hard limit.
- [ ] If bounded-loss occurred, omissions and affected semantic groups are disclosed.
- [ ] Supporting files contain no normative content absent from the canonical document.

## Audit result

Use one of:

- `PASS` — all required checks pass and count is exact
- `PASS_WITH_ESTIMATED_COUNT` — semantic checks pass; tokenizer count is estimated
- `PASS_WITH_DISCLOSED_LOSS` — under cap; bounded-loss omissions are explicit
- `FAIL` — over cap, authority conflict hidden, P0 omission undisclosed, or dependency closure broken
