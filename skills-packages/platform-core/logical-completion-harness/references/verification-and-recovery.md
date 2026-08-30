# 🔍 Verification Hierarchy & Recovery Controller

## 1. 7-Level Verification Hierarchy

Every obligation proof must be mapped to one or more verification tiers:

* **`L0` Structural Verification**: Schema validity, JSON/YAML parsing, file existence.
* **`L1` Static Verification**: Type checking (`tsc`), AST linting, dead code analysis.
* **`L2` Unit Verification**: Isolated function and component test suites.
* **`L3` Integration Verification**: Inter-module API communication and database contracts.
* **`L4` Behavioral Verification**: End-to-end user workflows and CLI end-to-end runs.
* **`L5` Side-Effect Verification**: Re-observing external systems to ensure no unintended mutations.
* **`L6` Regression Verification**: Full test suite pass ensuring existing baseline functionality is intact.

---

## 2. Recovery Controller Playbook

When an auditor reports `fail` or `inconclusive`, the Recovery Controller executes a specialized action based on the failure taxonomy:

| Failure Mode | Recovery Action | Precondition for Retry |
| :--- | :--- | :--- |
| **Stale Belief** | Execute `track` and refresh Context Pack | New observed belief timestamp |
| **Wrong Topic** | Reframe topic via Horizontal Explorer | Updated topic dependency DAG |
| **Tool Execution Error** | Fallback to alternate tool capability | Validated alternate binding |
| **Implementation Error** | Surgical contiguous patch repair | Different hypothesis / prompt |
| **Regression Detected** | Rollback candidate worktree | Baseline commit restored |
| **Repeated Failures (&ge; 2)** | Execute `recall` for past failure modes | Distinct algorithmic strategy |
| **Authority Scope Exceeded** | Abort work unit & escalate to Manager | Validated scope boundary |
| **Stagnation / Plateau** | Supervisor intervenes or escalates to human | Supervisor diagnostic state |
