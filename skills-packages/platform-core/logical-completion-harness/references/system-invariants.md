# 🛡️ LCH: The 29 Canonical System Invariants

The following 29 rules are immutable laws enforced by the Logical Completion Harness kernel:

1. **No Contract, No Execution**: Never execute tasks or mutate workspaces before compiling $C$.
2. **Single Active Vertical Topic**: Exactly one active topic per execution lane ($1 \text{ lane} = 1 \text{ active topic} = 1 \text{ primary obligation}$).
3. **Execution Subordination**: Every execution step must belong to an explicit, compiled Work Unit ($WU$).
4. **Outputs are Proposals**: Model outputs are proposals, never direct ledger state mutations.
5. **No Self-Certification**: Executors cannot mark an obligation as `verified`.
6. **Auditor Immutability**: Auditors cannot edit candidate source files or modify test baselines.
7. **Observation Priority**: Direct environment observations always override historical Experience ($E$).
8. **Note Buffering**: `note` writes to a temporary buffer; direct permanent memory insertion is forbidden.
9. **No Evidence, No State Change**: Completion claims without verifiable evidence links are discarded.
10. **Inconclusive is Not Pass**: Unrun evaluators or ambiguous outputs must be recorded as `inconclusive`.
11. **Authority Enforcement**: Modifications outside `allowed_change_scope` are rejected by the Tool Gateway.
12. **Pre-Promotion Isolation**: Baselines are never mutated before a Candidate passes the Promotion Gate.
13. **No Identical Retries**: Never execute the identical action on the identical state after a failure.
14. **Valid Cost Comparison**: Cost comparisons are meaningful only between successfully verified runs.
15. **Contract vs. Evolution Separation**: Minimal contract satisfaction is distinct from quality optimization.
16. **Append-Only Event Store**: Historical event logs are immutable; semantic state evolves through versioning.
17. **Completion Certificate Required**: Runs terminate only when a signed Completion Certificate is emitted.
18. **Explicit Non-Goals**: Out-of-scope boundaries must be declared in $C$ to prevent scope bleed.
19. **Fresh Auditor Context**: Auditors must evaluate with fresh context, stripped of executor rationalizations.
20. **Deterministic Evaluator Primacy**: Code tests and linters take precedence over subjective model reviews.
21. **No Silent Waiver**: Obligations can only be waived by Manager authority with recorded rationale.
22. **Sub-Agent Recursion Limit**: Sub-agent invocation tree depth cannot exceed $\text{depth} \le 3$.
23. **Test Storm Shield**: Inner-loop workers cannot run whole-suite test storms; target tests only.
24. **Decoupled Candidate Workspaces**: Candidates run in isolated Git worktrees (`.workspaces/`).
25. **Atomic Promotion**: Candidate merging into baseline occurs as a single atomic transaction.
26. **Stagnation Circuit Breaking**: 5 consecutive failed iterations halt automated loops for supervisor review.
27. **Secret Leak Guard**: Environment variables and keys must never be captured into Evidence stores.
28. **Deterministic State Reducer**: State snapshots must be 100% reproducible from the event stream.
29. **Non-Empty Gap Termination Prohibition**: A run cannot terminate with $\text{Gap}_t \neq \varnothing$.
