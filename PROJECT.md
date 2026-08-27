# Project: Skills Platform Universal Telemetry & Autonomous Lifecycle Loop

## Architecture
The Skills Platform is an open architecture for multi-agent skill distribution, activation, telemetry observation, and autonomous lifecycle orchestration.

### Subsystems & Module Boundaries
1. **Universal Telemetry Hook Engine (`.skills-platform/hooks/`)**:
   - Zero-dependency Node.js script (`telemetry-hook.js`) executing in < 50ms (in-process < 2ms).
   - Platform hooks: Google Antigravity (`.agents/hooks.json`), Anthropic Claude (`.claude/hooks.json`), and Codex CLI / Ralph-TUI NDJSON stream interception.
   - Append-only local logging (`.skills-platform/telemetry/events.ndjson`) and async unref'd HTTP ingestion.
2. **Catalog Ingestion API & Feedback Bridge (`@skills-platform/catalog`)**:
   - REST endpoints in `apps/skills-catalog/src/server.js`: `POST /api/telemetry/record` and `GET /api/telemetry/summary`.
   - Core telemetry module in `apps/skills-catalog/src/telemetry.js`.
   - Seamless bridge into `addSkillFeedback` and evaluation evidence store in `apps/skills-catalog/src/skill-management.js`.
3. **CLI Lifecycle Loop Orchestrator (`skills-platform loop`)**:
   - Loop runner in `apps/skills-catalog/src/lifecycle-loop.js` and CLI entrypoint in `apps/skills-catalog/src/cli.js`.
   - Coordinates Phase 1 (Plan), Phase 2 (Inner Loop), and Phase 3 (Release Gate).
   - Dynamic NTFS junction swapping via `@skills-platform/skills-manager-adapter`.
   - Enforces pinpoint scoped test execution and strictly suppresses test storms during inner loop.
   - Authorizes single full regression pass in Phase 3 and updates `MASTER_BASELINE.md`.
4. **Catalog Web UI Telemetry & Analytics (`apps/catalog-ui`)**:
   - React 19 + TypeScript + Vite 7 UI in `apps/catalog-ui`.
   - Real-time polling/streaming in `src/api/catalog-api.ts`.
   - Telemetry analytics, invocation mode ratios, and health indicators in `SkillWorkspace.tsx`, `ReviewQueue.tsx`, and `LiveActivationDrawer.tsx`.
5. **E2E Verification & Hardening Suite**:
   - Standalone multi-tier test runner (`tests/e2e/run-all.js`) verifying 184/184 tests across Tiers 1-5.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Telemetry Hook Engine Script | Zero-dependency `< 50ms` `telemetry-hook.js` capturing structured telemetry events | M1 | R1 |
| 2 | Multi-Agent Platform Hook Configurations | `.agents/hooks.json` (Antigravity) and `.claude/hooks.json` (Claude) definitions | M1 | R1 |
| 3 | Local NDJSON Log Appending | Atomic append to `.skills-platform/telemetry/events.ndjson` | M1 | R1 |
| 4 | Non-Blocking HTTP Ingestion Hook Dispatch | Async HTTP POST to catalog server with fail-safe error handling | M1 | R1 |
| 5 | Telemetry Ingestion API Endpoint | `POST /api/telemetry/record` with schema validation and NDJSON persistence | M2 | R2 |
| 6 | Telemetry Feedback Bridge | Automatic conversion of telemetry events into queryable `SkillFeedback` records | M2 | R2 |
| 7 | Telemetry Aggregation & Summary API | `GET /api/telemetry/summary` calculating mode counts, avg duration, success rates, health, timeline | M2 | R2 |
| 8 | CLI Loop Runner Subcommand | `skills-platform loop run --prd <path> --project <path> --provider <id>` in `cli.js` | M3 | R3 |
| 9 | Lifecycle Phase 1 (Plan) Orchestration | Mount `task-planning-recipe.json`, parse PRD, generate atomic task queue | M3 | R3 |
| 10 | Lifecycle Phase 2 (Inner Loop) Orchestration | Swap to `scoped-inner-loop-recipe.json`, run scoped tests, suppress test storms | M3 | R3 |
| 11 | Lifecycle Phase 3 (Release Gate) Orchestration | Swap to `release-governance-recipe.json`, run single full regression, update `MASTER_BASELINE.md` | M3 | R3 |
| 12 | Catalog UI Telemetry API Client | Data fetching and offline mock fallbacks in `apps/catalog-ui/src/api/catalog-api.ts` | M4 | R4 |
| 13 | SkillWorkspace Telemetry Analytics | Real-time health metrics, invocation mode ratios, and recent event feeds in `SkillWorkspace.tsx` | M4 | R4 |
| 14 | ReviewQueue Telemetry Activity Feed | Live telemetry risk signals and execution stream in `ReviewQueue.tsx` | M4 | R4 |
| 15 | LiveActivationDrawer Telemetry Indicators | Provider-level invocation counts and execution telemetry in `LiveActivationDrawer.tsx` | M4 | R4 |
| 16 | E2E Testing Suite (Tiers 1-4) | Comprehensive opaque-box test suite covering all features, boundaries, and scenarios | E2E | All |
| 17 | Final Verification & Adversarial Hardening (Tier 5) | 100% E2E test pass, white-box coverage hardening, forensic audit, build/check pass | M5 | Acceptance |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| E2E | E2E Testing Track | Requirement-driven multi-tier test harness & test cases (Tiers 1-4) | none | DONE |
| M1 | Telemetry Hook Engine | `.skills-platform/hooks/telemetry-hook.js`, `.agents/hooks.json`, `.claude/hooks.json` | none | DONE |
| M2 | Catalog Telemetry Ingestion & Bridge | `apps/skills-catalog/src/telemetry.js`, `server.js`, `skill-management.js` | M1 | DONE |
| M3 | CLI Lifecycle Loop Orchestrator | `apps/skills-catalog/src/lifecycle-loop.js`, `apps/skills-catalog/src/cli.js` | M2 | DONE |
| M4 | Catalog Web UI Telemetry & Analytics | `apps/catalog-ui/src/api/catalog-api.ts`, `types.ts`, `SkillWorkspace.tsx`, `ReviewQueue.tsx`, `LiveActivationDrawer.tsx` | M2 | DONE |
| M5 | Final Milestone & Hardening | 100% E2E pass, Tier 5 hardening, Forensic Audit, `npm run check`, `npm test`, `npm run build` | E2E, M1, M2, M3, M4 | DONE |

## Interface Contracts
### Telemetry Event Payload (`TelemetryEvent`)
```typescript
interface TelemetryEvent {
  timestamp: string;          // ISO 8601
  provider_id: string;       // "antigravity" | "claude" | "codex" | "ralph-tui"
  project_id: string;
  recipe_id?: string;
  skill_name: string;
  lineage_id?: string;
  invocation_mode: "model_invoked" | "user_invoked" | "hybrid" | "unspecified";
  duration_ms: number;
  tool_calls_count: number;
  outcome: "success" | "correction" | "scope_mismatch" | "freshness" | "risk" | "neutral";
  evidence_type: "manual" | "evaluation" | "activation_report" | "user_feedback" | "incident";
  summary: string;
  metrics?: Record<string, number>;
}
```

### Telemetry Summary Payload (`TelemetrySummary`)
```typescript
interface TelemetrySummary {
  total_invocations: number;
  average_duration_ms: number;
  success_rate: number;
  by_mode: {
    model_invoked: number;
    user_invoked: number;
    hybrid: number;
    unspecified: number;
  };
  by_provider: Record<string, number>;
  by_health: {
    healthy: number;
    needs_review: number;
    unknown: number;
  };
  recent_events: TelemetryEvent[];
}
```

### CLI Loop Interface
```bash
skills-platform loop run --prd <path> --project <project_path> --provider <provider_id>
```

## Code Layout
- `.skills-platform/hooks/telemetry-hook.js` - Telemetry hook engine
- `.agents/hooks.json` - Google Antigravity hook config
- `.claude/hooks.json` - Claude Code hook config
- `apps/skills-catalog/src/telemetry.js` - Telemetry ingestion & aggregation core
- `apps/skills-catalog/src/lifecycle-loop.js` - Autonomous lifecycle loop runner
- `apps/skills-catalog/src/server.js` - HTTP server with telemetry routes
- `apps/skills-catalog/src/cli.js` - CLI with `loop` command
- `apps/catalog-ui/src/api/catalog-api.ts` - UI API client & telemetry polling
- `apps/catalog-ui/src/types.ts` - UI type definitions
- `apps/catalog-ui/src/components/SkillWorkspace.tsx` - Skill telemetry & mode visualizer
- `apps/catalog-ui/src/components/ReviewQueue.tsx` - Telemetry risk activity feed
- `apps/catalog-ui/src/components/LiveActivationDrawer.tsx` - Provider telemetry indicators
- `tests/e2e/` - Comprehensive E2E test suite (Tiers 1-5, 39 files, 184 tests)
