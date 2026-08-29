---
name: teamwork-preview
description: Coordinate the official Antigravity Teamwork multi-agent swarm system. Use when tackling complex, multi-step engineering tasks that benefit from autonomous subagent teams (orchestrator, explorers, parallel workers, and 5-agent adversarial verification gates).
---

# Teamwork Multi-Agent System (`/teamwork-preview`)

Google Antigravity official autonomous multi-agent teamwork coordination framework.

## 🔄 Two-Phase Workflow

1. **Phase 1 (Prompt Crafting & Calibration)**: Interactively refine the project requirements, integrity mode, and objective verification mechanisms through Steps 1–9 using `prompt_draft.md`.
2. **Phase 2 (Autonomous Swarm Delegation)**: Once approved by the user, delegate to the `teamwork_preview` subagent swarm via `invoke_subagent`.

---

## 🏛️ 4 Core Architectural Principles

| # | Principle | Operational Invariant |
| :---: | :--- | :--- |
| **1** | **Specify What, Not How** | Define requirements and acceptance criteria. Avoid prescribing implementation details (file names, architecture, algorithms) unless explicitly requested. |
| **2** | **Objective Verification** | Every requirement must have a programmatic forcing function or explicit rubric independent of implementing agent self-assessment. |
| **3** | **Acceptance Criteria = Guardrails** | Use concrete, checkable conditions to prevent premature self-certification of half-baked work. |
| **4** | **Minimal Requirements** | Only specify what is strictly necessary. Let the teamwork swarm infer and optimize the rest. |

---

## 👥 Swarm Team Shapes

`teamwork_preview` automatically routes tasks to specialized team topologies based on the prompt:
- **`Full team` (Default)**: Builds, systems architecture, research, full E2E regression sweeps.
- **`Small, focused team` (Opt-in)**: Single self-contained bugfix or localized refactor (one worker + repeated adversarial reviews).
- **`Document review`**: Formal paper, RFC, or security audit document analysis.
- **`Proof pipeline`**: Mathematical problem solving and theorem verification.
- **`Proof, very large team` (Opt-in)**: Hard proofs requiring massive parallel search (100+ concurrent agents).

---

## 📚 References & Templates

- **9-Step Prompt Crafting Workflow**: [references/nine-step-workflow.md](./references/nine-step-workflow.md)
- **Swarm Team Shapes & Routing**: [references/team-shapes.md](./references/team-shapes.md)
- **Prompt Draft Scaffold Template**: [examples/prompt-draft-template.md](./examples/prompt-draft-template.md)
