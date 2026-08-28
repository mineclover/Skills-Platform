# E2E Test Infra: Flow Studio Visualization Canvas

## Test Philosophy
- Opaque-box, requirement-driven testing. Derived directly from `ORIGINAL_REQUEST.md`.
- Methodology: Category-Partition + Boundary Value Analysis + Pairwise Combinations + Real-World Scenarios.
- Zero external runtime test dependencies (`node:test` + `node:assert/strict`).

## Feature Inventory
| # | Feature | Source (requirement) | Tier 1 | Tier 2 | Tier 3 |
|---|---------|---------------------|:------:|:------:|:------:|
| 1 | Flow Studio Canvas Workspace | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 2 | 3-Phase Lifecycle Flow Diagram | ORIGINAL_REQUEST §R1.1 | 5 | 5 | ✓ |
| 3 | Hook Execution & Pipeline Graph | ORIGINAL_REQUEST §R1.2 | 5 | 5 | ✓ |
| 4 | Relative Fractal Context Tree | ORIGINAL_REQUEST §R1.3 | 5 | 5 | ✓ |
| 5 | Symlink Junction & Delivery Map | ORIGINAL_REQUEST §R1.4 | 5 | 5 | ✓ |
| 6 | Interactive Node Detail Inspector | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ |
| 7 | Simulation & Playback Engine | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ |
| 8 | App Navigation & Theme Integration | ORIGINAL_REQUEST §R4 | 5 | 5 | ✓ |

## Test Architecture
- Unit Test Runner: `npm test --workspace apps/catalog-ui` (`apps/catalog-ui/test/flow-studio.test.js`)
- E2E Test Runner: `node tests/e2e/run-all.js` (`tests/e2e/tier1-features/f20-flow-studio-canvas.test.js`)
- Pass/Fail semantics: Exit code 0, 0 unhandled rejections, 100% assertions passed.

## Real-World Application Scenarios (Tier 4)
| # | Scenario | Features Exercised | Complexity |
|---|----------|--------------------|------------|
| 1 | Full Lifecycle: PRD ingest -> Inner loop TDD -> Release gate compaction | F1, F2, F6, F7, F8 | High |
| 2 | Security Pipeline: 4 Attack Injections -> Sub-200ms Short-Circuit Halt -> Self-Correct Remediation | F1, F3, F6, F7 | High |
| 3 | Relative Fractal Context Drill-Down & Upward Roll-Up Patch Proposal | F1, F4, F6 | Medium |
| 4 | Multi-Provider Symlink Delivery Junction & Live Drift Sync | F1, F5, F6, F8 | Medium |

## Coverage Thresholds
- Tier 1: ≥5 test cases per feature (40+ assertions)
- Tier 2: ≥5 boundary test cases per feature (40+ assertions)
- Tier 3: Pairwise interaction coverage across view modes, inspector drawer, and attack injections
- Tier 4: Realistic end-to-end user workflows
