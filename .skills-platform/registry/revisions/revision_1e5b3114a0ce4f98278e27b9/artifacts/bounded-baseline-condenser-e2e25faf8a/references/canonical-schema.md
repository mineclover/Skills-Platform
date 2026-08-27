# Canonical Baseline Schema

The final document should use these semantic sections. Exact titles may change, and irrelevant sections may be omitted, but required roles must remain represented.

## 0. Document control

Include:

- Baseline ID/version/status
- Target state, as-is state, or mixed mode
- Scope and audience
- Tokenizer and token count
- Hard limit and working target
- Source coverage
- Supersedes/superseded-by relation
- Compression status: `lossless-semantic`, `bounded-loss`, or `estimated-count`

## 1. Executive contract

In a compact block state:

- Problem
- Intended outcome
- Primary users/stakeholders
- Success conditions
- Core design thesis
- Most important non-goals

This section is an index to the baseline, not a second summary of every later section.

## 2. Scope and boundaries

Define:

- In scope
- Out of scope
- System boundary
- External systems and ownership boundary
- Assumptions
- Deferred scope

## 3. Canonical vocabulary and identity

Include only terms and identifiers whose ambiguity affects implementation:

- Canonical term
- Meaning
- Aliases/deprecated names
- Identity/key rules
- Ownership/source of truth

## 4. Requirements and acceptance

Prefer a matrix:

| ID | Requirement | Priority | Status | Acceptance/verification | Dependencies |
|---|---|---|---|---|---|

Keep user-visible behavior, hard constraints, and release gates explicit.

## 5. Domain, data, and state model

Represent:

- Core entities and relationships
- Canonical identifiers
- Data ownership and source of truth
- State model and legal transitions
- Versioning/compatibility
- Persistence and derived projections
- Invariants

Use concise schemas or state tables when they are more precise than prose.

## 6. Architecture and responsibility boundaries

Represent:

- Components/subsystems
- Responsibility and non-responsibility
- Inputs/outputs
- Dependencies
- Authority boundaries
- Runtime/deployment boundary if relevant

Avoid component marketing descriptions. State what each component owns and must not own.

## 7. Interfaces and contracts

For every critical contract, include:

- Producer/consumer
- Input/output shape
- Preconditions/postconditions
- Errors and failure semantics
- Version/compatibility
- Idempotency/order/concurrency when relevant
- Validation location

## 8. Critical flows and lifecycle

Keep only flows needed to implement or validate behavior:

- Trigger/precondition
- Ordered stages
- State mutations
- Emitted events/output
- Failure/recovery/rollback
- Completion condition

Prefer one canonical flow over repeated component-local retellings.

## 9. Quality, security, and operations

As relevant:

- Performance and scalability constraints
- Security/privacy/access control
- Reliability and degradation behavior
- Observability and diagnostics
- Backup/recovery
- Compatibility and migration
- Accessibility/localization

## 10. Implementation plan

Use dependency order rather than arbitrary chronology:

- Stage/milestone
- Outcome
- Required inputs
- Deliverables
- Exit criteria
- Risks/blockers

Separate confirmed implementation work from research or decisions still needed.

## 11. Decisions, risks, and open issues

### Accepted decisions

| ID | Decision | Status | Scope | Reason | Supersedes |
|---|---|---|---|---|---|

### Risks

| ID | Risk | Trigger/impact | Mitigation | Owner/status |
|---|---|---|---|---|

### Open decisions and conflicts

| ID | Question/conflict | Competing constraints | Required decision | Blocks |
|---|---|---|---|---|

## 12. Traceability

Keep this compact. At minimum allow reviewers to trace:

- Goal → requirement
- Requirement → contract/component/flow
- Requirement → acceptance criterion
- Decision → affected scope
- Risk/open issue → blocked item

A compact matrix or per-ID `source:` metadata is sufficient. Do not repeat full source passages.

## 13. Compression limitations

Include only when needed:

- Count is estimated rather than exact
- Source gaps or inaccessible material
- Bounded-loss omissions
- Unresolved authority conflicts
- Areas where implementation evidence and intended design differ
