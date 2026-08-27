# Bounded Baseline Condenser

> Suite note: In `bounded-baseline-condenser-suite`, this skill is the sole final compiler. Use the sibling router, reference-pack builder, and selected domain reducers before compilation.


`bounded-baseline-condenser` converts a fragmented project plan/design corpus into one canonical implementation baseline under a strict token budget.

## Design thesis

The correct unit of compression is not a paragraph. It is an atomic requirement, decision, contract, invariant, flow, acceptance criterion, risk, or open issue.

The skill therefore uses this pipeline:

```text
sources
→ authority-aware fact ledger
→ vocabulary/identity normalization
→ duplicate and conflict reconciliation
→ dependency closure
→ canonical baseline compilation
→ token-budget reduction
→ integrity audit
```

This avoids the common failure mode of independently summarizing chunks and concatenating them, which preserves duplication while losing cross-document contradictions and prerequisites.

## Default budget

- Working target: 72,000 tokens
- Warning threshold: 76,000 tokens
- Hard cap: 80,000 tokens

The 8,000-token reserve leaves room for later edits and embedding the baseline inside a larger agent context. The hard cap applies to the entire canonical Markdown file.

## Package variants

- `SKILL.md`: progressive-discovery package entrypoint
- `single-file/bounded-baseline-condenser.single.md`: standalone copy suitable for environments that accept only one skill file

## Utilities

- `scripts/count_tokens.py`: exact count with optional `tiktoken`; explicitly non-certifying estimated fallback
- `scripts/validate_baseline.py`: lightweight structure, metadata, role, and ID checks

The scripts support the skill but do not replace semantic review. Exact token compliance depends on using the tokenizer of the model/runtime that will consume the document.
