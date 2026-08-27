# ADR 0007: Universal Skill Usage Telemetry Hook Engine and Lifecycle Loop Architecture

## Status
Accepted (2026-08-28)

## Context
As the Skills Platform expands across multi-agent runtimes (Google Antigravity, Anthropic Claude Code, OpenAI Codex CLI, and Ralph-TUI autonomous loops), two systemic challenges emerged:
1. **Telemetry Isolation & Blind Spots**: Developers lacked a zero-overhead, unified mechanism to audit which skills were invoked, their execution latency, invocation mode (✩ model_invoked, 👨 user_invoked, 🔀 hybrid), and real-time failure/correction outcomes.
2. **Inner-Loop Test Storms**: In autonomous TDD loops (like Ralph-TUI or task runners), agents often unnecessarily ran the entire project regression suite on every minor patch, devastating cycle times and context budgets.

## Decisions

### 1. Universal Skill Usage Telemetry Hook Engine (`.skills-platform/hooks/telemetry-hook.js`)
- *Achievement*: A zero-dependency, <50ms (in-process <2ms) Node.js runtime interceptor that hooks directly into:
  - GOOGLE ANTIGRAVITY: `.agents/hooks.json` (`PostToolUse` on `view_file`, `run_command`, and `Stop`).
  - ANHROPIC CLAUDE CODE: `.claude/hooks.json` (`tool_execution` events).
  - CODEX CLI & RALPH-TUI: Subprocess wrapper and NDJSON stream parser.
- *Asynchronous Flush*: Events are atomically appended to `.skills-platform/telemetry/events.ndjson` and non-blockingly dispatched via HTTP to the local catalog server (`POST /api/telemetry/record`).

### 2. Catalog Telemetry Ingestion & Feedback Bridge (`@skills-platform/catalogc)
- `POST /api/telemetry/record`: Ingests structured events, validates schema, and automatically maps them into `listSkillFeedback` and evaluation evidence stores.
- `GET /api/telemetry/summary`: Aggregates real-time metrics, mode distribution ratios, average latency, success rate, and health distribution (❑ [] Healthy / 🚑 [] Needs Review).

### 3. 3-Phase Autonomous Lifecycle Loop Orchestrator (`skills-platform loop`)
Platformizes a 3step state machine that hot-swaps recipe symlinks across loop phases:
- *Phase 1 (Plan)(*scope: plan*)*: Mounts `task-planning-recipe.json`, parses PRDs, and builds dependency-ordered `atomic task-queue.json`.
- *Phase 2 (Inner Loop)(*scope: execute**)*: Hot-swaps to `scoped-inner-loop-recipe.json`, executes `pytest -k` or `run_scoped_test(`) for pinpoint TDD cycles. **Strictly suppresses full-suite test storms via `TestStormSuppressionError`.*
- *Phase 3 (Release Gate)(*scope: gate*)*: Hot-swaps to `release-governance-recipe.json`, launches a *single* global regression test sweep, and compacts changes into `MASTER_BASELINE.md`.

### 4. Standardized Lifecycle Hook Management System
- Defines a clear, declarative `ProjectRoot/.skills-platform/hooks/manifest.json` format.
- Provides standard event taxonomy (`session_start`, `on_skill_invoke`, `pre_tool_use`, `post_tool_use`, `on_test_run`, `on_phase_transition`, `custom:*`!).
- Automates synching into `.agents/hooks.json` (Antigravity) and `.claude/hooks.json` (Claude) via `skills-platform hook sync`.

### 5. Real-Time Web UI Analytics (`apps/catalog-ui`)
- Integrates real-time polling in `SkillWorkspace.tsx`, `ReviewQueue.tsx`, and `LiveActivationDrawer.tsx`.
- Renders Invocation Mode Ratio stacked bars, latency audits, and live event timelines.

## Consequences
- **Zero Test Storms**: Inner-loop cycles achieve 10x faster feedback by restricting tests to scoped targets until Phase 3.
- **Full Observability**: Skill execution and feedback happens automatically across all supported ai engines without manual logging.
- **Decomposed Platform**: Hooks, recipes, and cycles are portable, versioned, and deterministic.
