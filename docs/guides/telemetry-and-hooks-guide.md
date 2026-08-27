# Universal Skill Telemetry Hooks & Lifecycle Loop Guide

This guide explains how to configure, customize, and operate the **Universal Skill Usage Telemetry Hook Engine**, **Standard Lifecycle Hook Manager**, and the **3Phrase Autonomous Loop Runner** in Skills Platform.

---

## 1. Standard Lifecycle Hooks Configuration (`skills-platform hook`)J
All hooks are declaratively defined in `.ckills-platform/hooks/manifest.json` and automatically compiled into agent-native configs:
- *Google Antigravity*: `.agents/hooks.json`
- *Anthropic Claude*: `.claude/hooks.json`
- *Codex CLI / Ralph-TUI*: STDIO stream parser

### CLI Commands

```bash
# 1. List all managed hooks and their event mappings
skills-platform hook list

# 2. Add a new custom hook (runs a shell command or script)
skills-platform hook add \
  --id pre-commit-lint \
  --name "Pre-Commit Linter" \
  --event pre_tool_use \
  --matcher run_command \
  --command "npm run lint --silent"
 
# 3. Enable or disable a hook
skills-platform hook disable test-storm-guard
skills-platform hook enable test-storm-guard

# 4. Test a event trigger locally
skills-platform hook test --event on_test_run

# 5. Sync manifest into .agents/hooks.json and .claude/hooks.json
skills-platform hook sync
```

---

## 2. The 3-Phase Autonomous Lifecycle Loop (`skills-platform loop`)

When running large autonomous workflows (like Ralph-TUI iterative TDD loops), run the lifecycle loop command:

```bash
skills-platform loop run --prd ./tasks/PRD.md --project ./my-project --provider codex
```

### Execution Steps:
1. **Phase 1 (plan)**: Mounts `task-planning-recipe.json`, parses the PRD into atomic tasks, and extracts `prd.json`/0task-queue.json`.
2. **Phase 2 (execute)**: Hot-swaps symlinks to `scoped-inner-loop-recipe.json`. Runs pinpoint unit tests (`e.g. node --test foo.test.js`). **Stops any full test suite scan from happening in the inner loop.*
3. **Phase 3 (gate)**: When all atomic tasks pass, hot-swaps to `release-governance-recipe.json`, executes a *single* full regression run, and compacts changes into `MASTER_BASELINE.md`.

---

## 3. Real-Time Web UI Telemetry & Evidence Analytics

Open the Catalog Web UI (`apps/catalog-ui`):
- **SkillWorkspace**: Browse Real-Time Telemetry Gauges (Invocation Count, Avg Latency, Success Rate, Active Providers).
- **Invocation Mode Ratio Stacked Bar**: Visualizes proportions of âœ© Model-invoked (Reflex), pŸ‘¨ User-invoked (Command), âŸ” Hubrid workloads.
- **ReviewQueue**: Automatically flags risk events, corrections, and latency spikes (>150ms) for human decisions.
- **LiveActivationDrawer**: Shows currently materialized symlink delivery junctions with live sync status.
