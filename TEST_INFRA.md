# E2E Test Infra: Skills Platform UI & Recipe Hub

## Test Philosophy
- **Requirement-Driven & Opaque-Box**: Tests verify user-visible capabilities derived from `ORIGINAL_REQUEST.md`, contracts, and backend APIs without tight coupling to internal React component implementation details.
- **Methodology**: 5-tier testing architecture (Category-Partition, Boundary Value Analysis, Pairwise Combinations, Real-World Workloads, and White-Box Adversarial Hardening).

## Feature Inventory & Test Mapping
| # | Feature | Requirement | Tier 1 (Feature) | Tier 2 (Boundary) | Tier 3 (Cross-Feature) | Tier 4 (E2E Scenario) |
|---|---------|-------------|:----------------:|:-----------------:|:----------------------:|:---------------------:|
| F1 | 1-Click Recipe Export | ORIGINAL_REQUEST §R1 | ≥5 | ≥5 | ✓ | ✓ |
| F2 | Recipe Upload & Drag-Drop | ORIGINAL_REQUEST §R1 | ≥5 | ≥5 | ✓ | ✓ |
| F3 | Recipe Inspector Panel | ORIGINAL_REQUEST §R1 | ≥5 | ≥5 | ✓ | ✓ |
| F4 | Recipe Apply Workflow | ORIGINAL_REQUEST §R1 | ≥5 | ≥5 | ✓ | ✓ |
| F5 | Navigation Modernization | ORIGINAL_REQUEST §R2 | ≥5 | ≥5 | ✓ | ✓ |
| F6 | Quick-Filter Toolbars | ORIGINAL_REQUEST §R2 | ≥5 | ≥5 | ✓ | ✓ |
| F7 | Table vs Card Grid Views | ORIGINAL_REQUEST §R2 | ≥5 | ≥5 | ✓ | ✓ |
| F8 | Inline Profile & Note Inspection | ORIGINAL_REQUEST §R2 | ≥5 | ≥5 | ✓ | ✓ |
| F9 | Multi-Provider & Delivery Paths | ORIGINAL_REQUEST §R3 | ≥5 | ≥5 | ✓ | ✓ |
| F10 | Invocation Mode Visual Badges | ORIGINAL_REQUEST §R3 | ≥5 | ≥5 | ✓ | ✓ |
| F11 | Pristine & Drift Indicators | ORIGINAL_REQUEST §R3 | ≥5 | ≥5 | ✓ | ✓ |
| F12 | 5-Step Activation Stepper | ORIGINAL_REQUEST §R4 | ≥5 | ≥5 | ✓ | ✓ |
| F13 | Live Activation Drawer & Drift Reconcile | ORIGINAL_REQUEST §R4 | ≥5 | ≥5 | ✓ | ✓ |
| F14 | Monorepo Quality Verification | ORIGINAL_REQUEST §Quality | ≥5 | ≥5 | ✓ | ✓ |

## Test Architecture
- **Runner**: Node.js native `node:test` + `node:assert/strict`.
- **Test Locations**:
  - `apps/catalog-ui/test/recipes.test.js` (F1, F2, F3, F4)
  - `apps/catalog-ui/test/navigation-and-filters.test.js` (F5, F6, F7, F8)
  - `apps/catalog-ui/test/visual-identity.test.js` (F9, F10, F11)
  - `apps/catalog-ui/test/diagnostics-and-stream.test.js` (F12, F13)
  - `apps/catalog-ui/test/integration-scenarios.test.js` (Tier 4 & Tier 5)
- **Execution Command**: `npm test` at monorepo root or within `apps/catalog-ui`.
- **Pass Semantics**: All test files must pass with exit code `0` and 0 assertions failed.

## Real-World Application Scenarios (Tier 4)
| # | Scenario | Features Exercised | Expected Outcome |
|---|----------|--------------------|------------------|
| S1 | Multi-Machine Recipe Export and Re-Import | F1, F2, F3, F4 | Export catalog from source project, upload recipe in fresh instance, inspect metrics, apply to new project with Codex provider |
| S2 | Invocation Mode Reflex vs Command Filtering | F5, F6, F7, F10 | Filter skills across 🤖 Model, 👤 User, and 🔀 Hybrid, toggle Table/Card views, verify correct count and badges |
| S3 | Multi-Provider Switching and Delivery Path Verification | F4, F9, F11 | Assign Antigravity provider (`.agents/skills/`), verify delivery path, switch to Claude (`.claude/skills/`), verify path updates and pristine reset |
| S4 | 5-Step Live Activation and Streaming Diagnostics | F12, F13 | Trigger project activation, observe sequential step events (`Plan` → `Inspect` → `Preview` → `Materialize` → `Verify`), confirm completion |
| S5 | Drift Detection and 1-Click Reconciliation | F11, F13 | Simulate missing provider symlinks, surface drift warning banner in Live Activation drawer, trigger 1-click reconciliation, verify sync restoration |
| S6 | Template Customization and Recipe Sharing | F1, F3, F8 | Compose custom preset with mixed invocation skills, export as recipe, inspect JSON schema validity |
| S7 | Full Project Lifecycle Quality Gate | F14, all | Execute full clean build, TypeScript check across all packages, and execute 100% of test suites |

## Coverage Thresholds
- **Tier 1 (Feature Coverage)**: ≥70 test cases across all features
- **Tier 2 (Boundary & Corner Cases)**: ≥70 test cases (empty files, invalid JSON, missing providers, corrupt state)
- **Tier 3 (Cross-Feature Combinations)**: ≥15 interaction tests
- **Tier 4 (Real-World Application Scenarios)**: ≥7 complete lifecycle scenarios
- **Total Minimum Target**: ≥160 automated tests across monorepo test suites
