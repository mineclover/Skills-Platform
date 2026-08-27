# Original User Request

## 2026-08-27T21:57:20Z

Build and integrate the Universal Skill Usage Telemetry Hook Engine, Catalog Ingestion API, and Autonomous Lifecycle Recipe Loop Runner for Skills Platform.

Working directory: C:\Users\minec\Skills-Platform
Integrity mode: development

## Requirements

### R1. Universal Skill Usage Telemetry Hook Engine (`.skills-platform/hooks/`)
Implement a zero-dependency, high-performance telemetry hook script (`telemetry-hook.js`) compatible with multi-agent platforms:
- **Google Antigravity**: Intercepts `PostToolUse` on `view_file` (skill loading) and `run_command` via `.agents/hooks.json`.
- **Anthropic Claude Code / Desktop**: Intercepts tool execution and stdio events via `.claude/hooks.json`.
- **Codex CLI / Ralph-TUI**: Captures subprocess execution and NDJSON event streams.
- Records structured telemetry events (`timestamp`, `provider_id`, `project_id`, `recipe_id`, `skill_name`, `lineage_id`, `invocation_mode`, `duration_ms`, `tool_calls_count`, `outcome`, `evidence_type`, `summary`) and flushes to local append-only NDJSON log (`.skills-platform/telemetry/events.ndjson`) and local HTTP ingestion endpoint.

### R2. Catalog Telemetry Ingestion API & Feedback Bridge (`@skills-platform/catalog`)
Extend `@skills-platform/catalog` backend server (`apps/skills-catalog/src/server.js`, `apps/skills-catalog/src/skill-management.js`):
- `POST /api/telemetry/record`: Ingests telemetry event payloads, validates schema, and bridges directly into `addSkillFeedback` / evaluation evidence store.
- `GET /api/telemetry/summary`: Returns aggregated real-time metrics (invocation counts by mode, average duration, success rate, health distribution, recent event timeline).

### R3. CLI Lifecycle Loop Orchestrator (`skills-platform loop`)
Implement an autonomous lifecycle recipe cycle runner in `apps/skills-catalog/src/cli.js`:
- Supports `skills-platform loop run --prd <path> --project <project_path> --provider <provider_id>`
- Coordinates the 3 standard lifecycle phases automatically:
  1. **Phase 1 (Plan)**: Mounts `task-planning-recipe.json`, extracts `prd.json` and atomic task queue.
  2. **Phase 2 (Inner Loop)**: Hot-swaps to `scoped-inner-loop-recipe.json`, resolves tasks one by one with pinpoint `run_scoped_test` while strictly suppressing full-suite test storms.
  3. **Phase 3 (Release Gate)**: Hot-swaps to `release-governance-recipe.json`, authorizes single full regression suite run and updates canonical `MASTER_BASELINE.md`.

### R4. Real-time Telemetry & Health Analytics in Catalog Web UI (`apps/catalog-ui`)
Enhance `apps/catalog-ui` components (`SkillWorkspace.tsx`, `ReviewQueue.tsx`, `LiveActivationDrawer.tsx`):
- Connect real-time telemetry stream/polling from `/api/telemetry/summary`.
- Render live telemetry activity feeds, invocation mode ratios, and health status indicators.

## Acceptance Criteria

### Telemetry & Ingestion
- [ ] `telemetry-hook.js` executes in < 50ms without hanging or blocking agent commands.
- [ ] `POST /api/telemetry/record` records events into `.skills-platform/telemetry/events.ndjson` and converts them into queryable `SkillFeedback` records.
- [ ] `GET /api/telemetry/summary` correctly calculates invocation counts, duration averages, and success ratios.

### Lifecycle Loop Orchestration
- [ ] `skills-platform loop` switches NTFS junction/symlink bindings dynamically between `task-planning`, `scoped-inner-loop`, and `release-governance` presets based on cycle phase.
- [ ] Inner-loop execution strictly enforces scoped test running and blocks un-scoped full regression suite runs until Phase 3.

### Quality Verification
- [ ] `npm run check` passes with 0 TypeScript/compilation errors across all workspaces.
- [ ] `npm test` passes all unit and integration test suites with 100% success.
- [ ] `npm run build` cleanly generates production bundle in `apps/catalog-ui/dist`.
