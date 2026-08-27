# Retention and Compaction Rubric

Use this rubric to decide whether a fact remains direct, becomes compact, is reduced to a pointer, or is omitted.

## 1. Retention score

Score each fact across five positive and three negative dimensions.

### Positive dimensions

| Dimension | 0 | 1 | 2 | 3 |
|---|---:|---:|---:|---:|
| Authority | incidental | proposal | approved | current explicit/frozen |
| Implementation impact | cosmetic | local | cross-module | correctness/safety |
| Coupling | isolated | one dependency | several dependencies | foundational |
| Irreversibility | easy to change | moderate | migration required | external compatibility/data loss |
| Verification value | none | explanatory | test-guiding | release/acceptance gate |

### Negative dimensions

| Dimension | 0 | 1 | 2 | 3 |
|---|---:|---:|---:|---:|
| Duplication | unique | partly repeated | mostly repeated | exact semantic duplicate |
| Obsolescence | current | uncertain | likely superseded | explicitly superseded |
| Verbosity | already compact | moderate | verbose | mostly narrative/example |

Suggested score:

```text
retention_score = authority + impact + coupling + irreversibility + verification
                  - duplication - obsolescence - verbosity
```

The score is a decision aid, not an authority override. Explicitly accepted P0 content remains L5 even when verbose.

## 2. Retention action

| Condition | Action |
|---|---|
| P0 or L5 | Keep exact semantics; rewrite only for compactness |
| P1 or L4 | Keep complete operational meaning; consolidate aggressively |
| P2 or L3 | Summarize; retain one example/rationale |
| L2 | Keep pointer or one-line implication |
| P3/L1 | Omit or archive |
| Explicitly superseded | Remove from main baseline; retain supersession fact if relevant |
| Equal-authority conflict | Keep compact conflict record |
| Missing dependency | Restore dependency or remove/reframe dependent claim |

## 3. Semantic equivalence test

Two passages are duplicates only when all of these match:

- Subject and scope
- Normative force
- Lifecycle/state
- Preconditions
- Result or obligation
- Failure/exception behavior
- Temporal status
- Authority

If one passage adds a condition, exception, state, or compatibility rule, merge rather than discard it.

## 4. Information that usually survives

- Why the system exists and what outcome defines success
- What is explicitly out of scope
- Canonical entities, identifiers, and ownership
- Input/output/state contracts
- Accepted architecture decisions
- Critical failure and recovery behavior
- Compatibility and migration rules
- Acceptance and validation criteria
- Risks, blockers, and unresolved decisions
- Implementation ordering when it affects correctness

## 5. Information that usually compresses well

- Long narrative rationale → one decision + one reason + rejected constraint
- Repeated component descriptions → responsibility matrix
- Multiple flow descriptions → one lifecycle/state table
- Repeated API prose → one contract table
- Repeated milestones → one dependency-ordered implementation plan
- Meeting chronology → decision/status ledger
- Many examples → one representative example + general rule
- Version history → current baseline metadata + supersedes list

## 6. Information that usually leaves the canonical document

- Raw research notes after conclusions are accepted
- Full transcripts and status updates
- Obsolete file trees and previous naming proposals
- Detailed tutorials
- Full implementation code not serving as a contract
- Repeated introductions and summaries
- Duplicated diagrams that encode the same relationship

## 7. Bounded-loss order

When the budget cannot preserve everything, remove or compact in this order:

1. Cosmetic prose and narration
2. Exact duplicates
3. Superseded detail
4. Extra examples
5. Historical chronology
6. Non-binding rationale
7. Local implementation suggestions
8. Secondary alternatives
9. Low-impact operational detail
10. P2 requirements with explicit omission disclosure

Do not remove P0 semantics before all lower-priority opportunities are exhausted.
