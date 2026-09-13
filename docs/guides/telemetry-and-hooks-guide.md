# Universal Skill Telemetry Hooks & Lifecycle Loop Guide

This guide explains how to configure, customize, and operate the **Universal Skill Usage Telemetry Hook Engine**, **Standard Lifecycle Hook Manager**, **Companion Hook Architecture**, and the **3-Phase Autonomous Loop Runner** in Skills Platform.

> For the comprehensive technical specification, Protojson contracts, and schema invariants, see [hook-system-and-protojson-spec.md](hook-system-and-protojson-spec.md).

---

## 1. Lifecycle & Companion Hooks Architecture

Hooks in Skills Platform are divided into two distinct tiers:
1. **Universal Security Baseline**: Essential system guards (`secret-leak-guard`, `destructive-command-blocker`, `context-budget-guard`, `subagent-recursion-limiter`, `scope-boundary-enforcer`, and telemetry) defined in `.skills-platform/hooks/manifest.json`.
2. **Companion Hooks**: Domain-specific guards co-located inside skill packages (e.g. `test-storm-guard` inside `scoped-tdd-executor`) that automatically mount, rebase, and cascade enable/disable with their parent skills.

All hooks are automatically compiled into native agent configuration files:
- *Google Antigravity*: `.agents/hooks.json` (Strict Protojson contract)
- *OpenAI Codex*: `.codex/hooks.json` (Event dispatchers)
- *Anthropic Claude*: `.claude/hooks.json`

---

## 2. Hook Control CLI (`bin/sp-hooks`)

The `./bin/sp-hooks` CLI (or `node apps/skills-catalog/src/cli.js hook`) provides centralized control:

### 2.1 Inspection & Audit
```bash
# 1. Inspect hooks grouped by owning skill
./bin/sp-hooks list --by-skill

# 2. Filter hooks for a specific skill
./bin/sp-hooks list --skill scoped-tdd-executor

# 3. Formatted ASCII table view
./bin/sp-hooks list --table

# 4. Audit hook health, script permissions, and provider synchronization
./bin/sp-hooks audit
```

### 2.2 Toggling & Cascading
```bash
# Cascade enable / disable all companion hooks for a skill
./bin/sp-hooks enable --skill scoped-tdd-executor
./bin/sp-hooks disable --skill scoped-tdd-executor

# Safe-mode emergency toggle (all hooks)
./bin/sp-hooks disable --all
./bin/sp-hooks enable --all

# Single hook toggle
./bin/sp-hooks enable secret-leak-guard
./bin/sp-hooks disable secret-leak-guard
```

---

## 3. The 3-Phase Autonomous Lifecycle Loop (`skills-catalog loop run`)

When running large autonomous workflows (like Ralph-TUI iterative TDD loops), run the lifecycle loop command:

```bash
skills-catalog loop run --prd ./tasks/PRD.md --project ./my-project --provider antigravity
```

### Execution Phases:
1. **Phase 1 (Plan)**: Mounts `task-planning-recipe.json`, parses the PRD into atomic tasks, and extracts `prd.json`/`task-queue.json`.
2. **Phase 2 (Execute - Inner Loop)**: Hot-swaps to `scoped-inner-loop-recipe.json`. Executes pinpoint unit tests (e.g., `node --test foo.test.js`). **`test-storm-guard` strictly suppresses unauthorized full regression test runs during this phase.*
3. **Phase 3 (Gate - Release Governance)**: When all atomic tasks pass, hot-swaps to `release-governance-recipe.json`, executes a *single* full regression run, and compacts changes into `MASTER_BASELINE.md`.

---

## 4. Real-Time Web UI Telemetry & Evidence Analytics

Open the Catalog Web UI (`apps/catalog-ui`):
- **SkillWorkspace**: Browse Real-Time Telemetry Gauges (Invocation Count, Avg Latency, Success Rate, Active Providers).
- **Invocation Mode Ratio**: Visualizes proportions of Model-invoked (Reflex), User-invoked (Command), and Hybrid workloads.
- **ReviewQueue**: Automatically flags risk events, corrections, and latency spikes (>150ms) for human review.
- **LiveActivationDrawer**: Shows currently materialized symlink delivery junctions with live sync status.
