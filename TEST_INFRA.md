# E2E Test Infra: Skills-Platform

## Test Philosophy
- **Opaque-box & Requirement-driven**: Derived directly from `ORIGINAL_REQUEST.md` and user-facing specifications.
- **Root Protection Assertion**: The root `main` workspace must remain pristine and unpolluted. All work occurs in isolated Git worktrees (`.workspaces/<task_id>`).
- **Methodology**: Category-Partition + Boundary Value Analysis (BVA) + Pairwise Interaction Testing + Real-World Lifecycle Scenarios + Adversarial Stress Testing.
- **Zero Heavy Frameworks**: Pure native Node.js test runner (`node:test` + `node:assert/strict`) via `node tests/e2e/run-all.js`.

---

## Feature Inventory & Test Coverage Mapping

| # | Feature | Requirement | Tier 1 (Features) | Tier 2 (Boundaries) | Tier 3 (Pairwise) | Tier 4 (Scenarios) |
|---|---------|-------------|:-----------------:|:-------------------:|:-----------------:|:------------------:|
| 1 | Procedure Contracts & Validation | R1 | ≥5 cases | ≥5 cases | ✓ | ✓ |
| 2 | Isolated Git Worktree Creation | R2 | ≥5 cases | ≥5 cases | ✓ | ✓ |
| 3 | Procedure Skill & Guard Mounting | R2 | ≥5 cases | ≥5 cases | ✓ | ✓ |
| 4 | Worktree Pruning & Cleanup | R2 | ≥5 cases | ≥5 cases | ✓ | ✓ |
| 5 | Ordered Dependency Merge Queue | R3 | ≥5 cases | ≥5 cases | ✓ | ✓ |
| 6 | 1:1 Target Test Verification Gate | R3 | ≥5 cases | ≥5 cases | ✓ | ✓ |
| 7 | Responsibility Invariant Auditing | R3 | ≥5 cases | ≥5 cases | ✓ | ✓ |
| 8 | Atomic Fast-Forward / Rebase Merge | R3 | ≥5 cases | ≥5 cases | ✓ | ✓ |
| 9 | Fault Isolation & Discard | R3 | ≥5 cases | ≥5 cases | ✓ | ✓ |
| 10 | CLI Workspace Subcommands | R4 | ≥5 cases | ≥5 cases | ✓ | ✓ |
| 11 | REST API Workspace Endpoints | R4 | ≥5 cases | ≥5 cases | ✓ | ✓ |
| 12 | Flow Studio Procedure Visualizer | R5 | ≥5 cases | ≥5 cases | ✓ | ✓ |

---

## Test Architecture
- **Runner**: `node tests/e2e/run-all.js`
- **Output**: TAP / formatted summary with exit code 0 on all tests passing.
- **Fixtures**: `tests/e2e/helpers/fixtures.js` (sandboxes, Git repos, mock HTTP servers, assertion helpers).

---

## Real-World Application Scenarios (Tier 4)
| # | Scenario | Features Exercised | Complexity |
|---|----------|--------------------|------------|
| 1 | Concurrent Multi-Procedure Isolation | F1, F2, F3, F4 (Concurrent planning + inner loop + security audit) | High |
| 2 | Ordered Linear Dependency Merge Pipeline | F5, F6, F8 (`task-01` ➔ `task-02` ➔ `task-03` fast-forward into `main`) | High |
| 3 | Broken Target Test Rejection & Discard | F6, F7, F9 (Fault isolation without polluting `main`) | Medium |
| 4 | End-to-End CLI & REST API Control Plane | F10, F11 (CLI spawn ➔ server query ➔ verify ➔ merge) | Medium |
| 5 | Flow Studio Procedure Workspaces & Live Queue | F12 (Card rendering, inspector details, fast-forward animation) | Medium |

---

## Coverage Thresholds
- **Tier 1 (Feature Coverage)**: ≥5 test cases per feature covering happy paths and basic isolation.
- **Tier 2 (Boundary & Corner Cases)**: ≥5 test cases per feature (e.g. invalid enums, non-existent branches, locked files, missing tests, rebase conflicts).
- **Tier 3 (Cross-Feature Combinations)**: Pairwise integration across CLI, REST API, Worktree Manager, Sequential Merger, and Contracts.
- **Tier 4 (Real-World Application Scenarios)**: ≥5 comprehensive multi-step workflow scenarios.
- **Tier 5 (Adversarial Stress Testing)**: High concurrency, rapid spawns, dirty working tree simulations.
