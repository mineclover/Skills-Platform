# E2E Test Infra: Skills Platform Telemetry & Lifecycle Loop

## Test Philosophy
- Opaque-box, requirement-driven verification derived strictly from `ORIGINAL_REQUEST.md`.
- No internal module assumptions; test via public entry points (CLI, HTTP REST, Hook execution, File system assertions).
- Methodology: Category-Partition + Boundary Value Analysis + Pairwise Interaction + Real-World Workload Testing.

## Feature Inventory Mapping
| # | Feature | Source | Tier 1 | Tier 2 | Tier 3 | Tier 4 |
|---|---------|--------|:------:|:------:|:------:|:------:|
| 1 | Telemetry Hook Script Execution | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ | ✓ |
| 2 | Multi-Agent Hook Configs (Antigravity/Claude) | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ | ✓ |
| 3 | Local NDJSON Log Appending | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ | ✓ |
| 4 | Hook Execution Speed (<50ms Benchmark) | Acceptance Criteria | 5 | 5 | ✓ | ✓ |
| 5 | Telemetry Ingestion API (`POST /api/telemetry/record`) | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ | ✓ |
| 6 | Feedback Bridge to `SkillFeedback` Store | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ | ✓ |
| 7 | Telemetry Summary API (`GET /api/telemetry/summary`) | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ | ✓ |
| 8 | CLI `loop run` Command & Argument Parsing | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ | ✓ |
| 9 | Phase 1 (Plan) & PRD Task Extraction | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ | ✓ |
| 10 | Phase 2 (Inner Loop) Junction Swapping | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ | ✓ |
| 11 | Test Storm Suppression & Pinpoint Scoped Tests | Acceptance Criteria | 5 | 5 | ✓ | ✓ |
| 12 | Phase 3 (Release Gate) & `MASTER_BASELINE.md` | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ | ✓ |
| 13 | UI Telemetry API Polling & Fallbacks | ORIGINAL_REQUEST §R4 | 5 | 5 | ✓ | ✓ |
| 14 | UI Invocation Mode Visualizer & Metrics | ORIGINAL_REQUEST §R4 | 5 | 5 | ✓ | ✓ |
| 15 | UI Telemetry Activity & Risk Feeds | ORIGINAL_REQUEST §R4 | 5 | 5 | ✓ | ✓ |

## Test Architecture
- Test Runner: Node.js standard test runner (`node --test tests/e2e/**/*.test.js`)
- Test Directory: `tests/e2e/`
  - `tests/e2e/tier1-features/`
  - `tests/e2e/tier2-boundaries/`
  - `tests/e2e/tier3-pairwise/`
  - `tests/e2e/tier4-scenarios/`
  - `tests/e2e/tier5-adversarial/`
- Test Runner script: `node tests/e2e/run-all.js`

## Coverage Thresholds
- Tier 1: ≥5 per feature (Total: 75+ tests)
- Tier 2: ≥5 per feature boundary (Total: 75+ tests)
- Tier 3: Pairwise combinations across platform hooks, telemetry bridge, and loop phases (Total: 15+ tests)
- Tier 4: Realistic end-to-end multi-agent workflows (Total: 8+ scenarios)
- **Minimum Total Test Count**: ~170+ E2E test assertions
