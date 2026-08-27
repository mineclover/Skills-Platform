# Minimal Workflow

## Request

> Merge all project plans and architecture documents into one implementation-grade baseline under 80,000 tokens. Remove duplicated and superseded material, preserve open conflicts, and state the tokenizer used.

## Execution

1. Inventory all sources and mark authority/status.
2. Extract atomic P0–P3 fact records by semantic domain.
3. Merge aliases and semantic duplicates.
4. Resolve explicit supersession and retain unresolved equal-authority conflicts.
5. Compile `MASTER_BASELINE.md` using the canonical schema.
6. Count tokens with the intended consumer tokenizer.
7. Apply semantic, structural, example, and rationale reduction until at or below 72,000 tokens where feasible.
8. Run integrity and structural audits.
9. Deliver the canonical baseline plus an optional compression report.

## Token commands

```bash
# Exact when tiktoken is installed and the encoding exists.
python scripts/count_tokens.py MASTER_BASELINE.md \
  --encoding o200k_base \
  --hard-limit 80000 \
  --json > token-report.json

python scripts/validate_baseline.py MASTER_BASELINE.md \
  --token-report token-report.json \
  --json > validation-report.json
```

Install optional exact-count dependency when appropriate:

```bash
python -m pip install tiktoken
```

## Expected result metadata

```yaml
tokenizer: o200k_base
count_status: exact
token_count: 71342
working_target: 72000
hard_limit: 80000
compression_status: lossless-semantic
```
