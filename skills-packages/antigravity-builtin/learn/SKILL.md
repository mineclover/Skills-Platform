---
name: learn
description: >-
  Extract, generalize, and persist user corrections, codebase heuristics, and operational patterns into permanent rules and skills.
  Use when the user corrects an agent behavior, solves a complex workspace-specific setup, or instructs the agent to remember a policy for future sessions.
---

# Learn: Knowledge & Rule Synthesis Protocol (`/learn`)

The `/learn` protocol captures transient lessons, debugging breakthroughs, and operator corrections, transforming them into permanent, version-controlled rules (`GEMINI.md`, `AGENTS.md`) or modular workspace skills (`.agents/skills/`).

```mermaid
graph TD
    A[Operator Correction or Solved Obstacle] --> B[Root-Cause Analysis & Generalization]
    B --> C[Determine Target Customization Layer]
    C -->|Always-On Constraint| D[Append Rule to GEMINI.md / AGENTS.md]
    C -->|On-Demand Procedural Workflow| E[Generate New SKILL.md in .agents/skills/]
    C -->|Global Machine Policy| F[Persist to ~/.gemini/config/]
    D --> G[Verify Non-Duplication & Minimal Footprint]
    E --> G
    F --> G
    G --> H[Confirm Persistence to Operator]
```

---

## 🏛️ Rule Selection Hierarchy

| Target | File Location | When to Choose |
| :--- | :--- | :--- |
| **Workspace Rule** | `.agents/rules/*.md` or `GEMINI.md` | Universal constraints, coding standards, prohibited commands, path invariants. |
| **Workspace Skill** | `.agents/skills/<name>/SKILL.md` | Multi-step runbooks, deployment guides, complex setup scripts. |
| **Global Config** | `~/.gemini/config/GEMINI.md` | User-wide preferences applicable across all repositories. |

---

## 📝 Synthesis Rules

1. **High Signal-to-Noise**: Never record overly verbose logs or conversation transcripts. Distill down to crisp, actionable rules.
2. **Prevent Rule Bloat**: Check if existing rules already cover the concept; merge and refine rather than creating redundant entries.
3. **Format**: Follow the official YAML frontmatter convention for skills, or clean markdown alerts for rules.
