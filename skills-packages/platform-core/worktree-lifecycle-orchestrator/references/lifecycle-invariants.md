# Responsibility Invariants & Verification Gates

Rules and invariants governing the procedure-responsible workspace model.

## 1. The 4 Procedure Types

| Procedure Type | Responsibility | Active Skills Loaded | Strict Guards |
| :--- | :--- | :--- | :--- |
| **`PLANNING`** | PRD Analysis & Task Queue Extraction | `vertical-spec-documenter`, `task-decomposer` | Blocks source code modifications |
| **`INNER_LOOP_TDD`** | 1:1 Pinpoint Bugfix / Feature Implementation | `skills-manager-testing`, `vertical-tdd-fixer` | `test-storm-guard` blocks `npm test` |
| **`SECURITY_AUDIT`** | Secret Leaks, Static Analysis & Invariant Audits | `vulnerability-scanner`, `hook-validator` | `secret-leak-guard`, `destructive-blocker` |
| **`RELEASE_GATE`** | 1-Sweep Full Regression & Baseline Compaction | `release-gatekeeper`, `baseline-curator` | Authorizes single regression sweep |

## 2. Definition of Done (Commit Invariant)

A task is officially complete ONLY when:
1. All assertions in `target_test_file` pass 100%.
2. `git diff <base_sha>..HEAD` contains 0 modifications to out-of-bounds files.
3. An atomic Git commit matching `<type>(<scope>): <summary> [<task_id>]` is recorded on the branch.
