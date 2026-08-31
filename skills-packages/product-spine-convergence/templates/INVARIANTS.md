# INVARIANTS

Last updated: YYYY-MM-DD
Status: active

## Canonical Decisions

- Product model:
- Editor host:
- Runtime:
- Persistence:
- Acceptance surface:

## Layer Ownership

| Layer / Package | Owns | Must Not Own |
|---|---|---|

## Dependency Direction

```text
[allowed dependency graph]
```

## Blocking Rules

1.
2.
3.

## Package Creation Gate

- [ ] Two or more real consumers
- [ ] Proven repeated implementation
- [ ] Stable public API
- [ ] Independent lifecycle required
- [ ] Reduces total integration surfaces

## Contract Creation Gate

- [ ] Existing canonical model cannot express the behavior
- [ ] Real producer and consumer exist
- [ ] Round trip preserves meaning
- [ ] Version and migration owner defined

## Experiment Policy

- Location:
- Build isolation:
- Import restrictions:
- Promotion criteria:

## Legacy Policy

- Compatibility duration:
- Writer restrictions:
- Removal gate:

## Required Checks

```bash
# dependency check
# typecheck
# tests
# canonical browser E2E
# save/reload or export round trip
```

## PR Blockers

- Parallel authoritative state
- New speculative package or runtime
- Forbidden dependency
- Canonical round-trip regression
- Experiment dependency in product path
