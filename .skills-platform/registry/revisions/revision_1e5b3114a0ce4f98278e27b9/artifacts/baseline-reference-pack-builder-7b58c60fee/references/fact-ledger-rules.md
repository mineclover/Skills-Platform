# Fact Ledger Rules

## Atomicity test

A fact is atomic when one disposition, status, authority result, and primary owner can apply to the entire statement. Split when a passage contains:

- More than one obligation
- A rule and an exception
- Current behavior and target behavior
- A decision and its rationale
- An interface contract and an implementation suggestion
- Several states or transitions with different owners

## Duplicate test

Facts are duplicates only when subject, scope, modality, lifecycle, preconditions, outcome, exceptions, status, and authority match. When one fact adds a condition or exception, merge the information rather than dropping it.

## Ownership test

Assign the owner according to the question the fact answers:

- What user/business behavior is required? → product
- Which subsystem owns it? → architecture
- What entity/state/invariant exists? → data/state
- What crosses a boundary? → interface
- In what order does execution occur? → runtime
- What quality/control must hold? → quality/operations
- How is it proved? → testing/acceptance
- In what dependency order is it delivered? → roadmap

## Overlay rule

Technology overlays may:

- Add domain-specific distinctions
- Raise priority or retention risk
- Add validation checks
- Add tags and source references
- Propose compact representations

They may not create a second canonical statement for a fact already owned by a core domain.

## Coverage rule

A source passage is covered only when every P0/P1 semantic atom maps to a retained or explicitly disclosed fact. A citation to a section does not prove coverage by itself.
