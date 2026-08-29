# Frontmatter Schema & Trigger Phrasing Guide

Detailed rules for authoring high-precision skill frontmatter.

## 1. Schema Fields

| Field | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `name` | `string` | **Yes** | Unique lowercase identifier with hyphens (regex: `^[a-z0-9-]+$`). |
| `description` | `string` | **Yes** | 3rd-person description of capabilities and exact activation triggers. |
| `invocation_mode` | `string` | Optional | `"model_invoked" \| "user_invoked" \| "hybrid"` (defaults to hybrid). |

## 2. Trigger Phrasing Best Practices

The agent routes and selects skills based almost entirely on the `description` string.

### ✅ Good Examples:
- `"Coordinate the procedure-responsible Git worktree lifecycle for Antigravity agents. Use when spawning isolated task worktrees, enforcing scoped TDD, or managing merge queues."`
- `"Build, compile, and validate bounded Vertical Topic Specification documents. Use when defining 80k topic scopes, invariant matrices, or targeted verification mechanisms."`

### ❌ Anti-Patterns:
- First-person phrases: `"I will help you write code"` (Avoid `I`, `You`).
- Overly generic descriptions: `"Useful for coding"` (Agent will over-trigger or get confused).
- Missing trigger conditions: `"Handles database connections"` (Fails to state *when* to use it).
