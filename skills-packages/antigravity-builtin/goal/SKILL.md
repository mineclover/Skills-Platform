---
name: goal
description: >-
  Execute long-running, autonomous, overnight-capable tasks with exhaustive verification and self-healing.
  Use when the user wants the agent to run unattended until a complex, multi-step goal is 100% achieved,
  persisting through failures and iteratively debugging until all acceptance tests pass.
---

# Goal-Driven Autonomous Execution (`/goal`)

The `/goal` protocol enables long-running, self-directed execution where the agent operates with maximum persistence, systematically resolving build failures, test breakages, and edge cases until the mission is accomplished.

```mermaid
graph TD
    A[Deconstruct Goal into Milestones] --> B[Establish Mechanically Checkable Metrics]
    B --> C[Execute Milestone Implementation]
    C --> D[Run Milestone Test Gate]
    D -->|Fail: Non-zero| E[Diagnose, Diff & Self-Heal]
    E --> C
    D -->|Pass| F{All Milestones Complete?}
    F -->|No| C
    F -->|Yes| G[Run End-to-End Regression Suite]
    G -->|Clean Pass| H[Produce Walkthrough & Completion Report]
```

---

## 🛡️ Core Operating Rules for `/goal`

1. **Relentless Persistence**: Never surrender or prematurely stop upon encountering unexpected runtime exceptions, flaky network calls, or syntax errors. Systematically debug the root cause.
2. **Objective Verification Gate**: Every milestone MUST have a deterministic programmatic check (e.g. `npm test`, custom validation script, integration benchmark).
3. **Artifact-Driven State Machine**: Maintain a live status dashboard in `implementation_plan.md` checking off milestones in sequence (`[ ]` ➔ `[x]`).
4. **Subagent Delegation for Deep Dives**: When encountering complex isolated sub-problems, invoke `research` or specialized subagents to investigate in parallel while keeping the main loop focused.
5. **No Hallucinated Success**: Completion is only declared when the end-to-end regression test suite passes with exit code `0`.
