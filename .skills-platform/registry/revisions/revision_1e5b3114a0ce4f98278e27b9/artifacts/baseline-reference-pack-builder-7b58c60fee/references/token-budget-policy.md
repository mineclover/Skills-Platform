# Token Budget Policy

## Default envelope

```text
hard limit        80,000
working target    72,000
warning threshold 76,000
reserve            8,000
```

When exact tokenization is unavailable, target at most 60,000 estimated tokens.

## Allocation model

Allocate the working target in this order:

1. Fixed control pool: document control, scope, vocabulary, limitations.
2. P0 floor: minimum tokens required to represent every P0 fact and dependency.
3. P1 domain pool: weighted by authority, coupling, irreversibility, and verification impact.
4. Decisions, risks, delivery, and traceability pool.
5. P2 rationale/examples only from remaining budget.

Specialist overlays are charged to the owning core domain.

## Suggested initial split

| Pool | Share of 72k |
|---|---:|
| Control/scope/vocabulary | 7,000 |
| Active core domains | 50,000 |
| Decisions/risks/delivery/traceability | 11,000 |
| Rewrite buffer | 4,000 |

This is a starting point, not a fixed section quota.

## Reduction order

1. Exact semantic duplicates
2. Superseded detail without residual constraints
3. Repeated structure and definitions
4. Excess examples
5. Nonessential rationale
6. Repeated prose converted to matrices/contracts/state tables
7. Lexical shortening
8. P2/P3 archival

Never reduce P0 by shortening away conditions, exceptions, modality, or failure semantics.
