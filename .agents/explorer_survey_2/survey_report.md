# Comprehensive Survey & Architectural Blueprint: R2 Telemetry Ingestion API & R3 CLI Lifecycle Loop Orchestrator

**Agent**: Survey Explorer 2 (`teamwork_preview_explorer`)  
**Working Directory**: `C:\Users\minec\Skills-Platform\.agents\explorer_survey_2`  
**Date**: 2026-08-28T07:00:00+09:00  
**Target Scope**: Requirements R2 (Catalog Telemetry Ingestion API & Feedback Bridge) and R3 (CLI Lifecycle Loop Orchestrator)

---

## 1. Executive Summary

This survey provides a comprehensive architectural analysis and implementation blueprint for Requirements R2 and R3:
- **Requirement R2 (Catalog Telemetry Ingestion API & Feedback Bridge)**: Extends `@skills-platform/catalog` backend server (`server.js`, `skill-management.js`, and a new `telemetry.js` module) with:
  1. `POST /api/telemetry/record`: Schema validation, appending raw events to `.skills-platform/telemetry/events.ndjson`, and bridging directly into `addSkillFeedback` / evaluation evidence store.
  2. `GET /api/telemetry/summary`: Aggregating real-time telemetry metrics (invocation counts by mode, provider distribution, average duration, success rate, health distribution, and recent event timeline).
- **Requirement R3 (CLI Lifecycle Loop Orchestrator)**: Implements an autonomous 3-phase lifecycle recipe runner in `apps/skills-catalog/src/cli.js` (and dedicated module `lifecycle-loop.js`) for `skills-platform loop run --prd <path> --project <project_path> --provider <provider_id>`:
  1. **Phase 1 (Plan)**: Mounts `task-planning-recipe.json`, parses PRD, extracts `prd.json` and atomic task queue.
  2. **Phase 2 (Inner Loop)**: Hot-swaps NTFS junction bindings to `scoped-inner-loop-recipe.json`, executes pinpoint `run_scoped_test` per atomic task while strictly suppressing full-suite test storms.
  3. **Phase 3 (Release Gate)**: Hot-swaps NTFS junction bindings to `release-governance-recipe.json`, authorizes a single global regression suite run, updates canonical `MASTER_BASELINE.md`, and finalizes the cycle.

---

## 2. Existing Codebase Investigation

### 2.1 Server Architecture (`apps/skills-catalog/src/server.js`)
- **Server Framework**: Pure Node.js `node:http` (no external framework overhead).
- **Routing Pattern**: Matches `request.method` and `url.pathname` or regex against path patterns (e.g. `/^\/api\/skills\/([^/]+)\/feedback$/`).
- **Body Parsing**: `parseJsonBody(request)` streams request chunks with a 64 KB safety threshold.
- **Response Format**: `json(response, status, value)` sets CORS headers and UTF-8 JSON.
- **Streaming Support**: `streamJson(response, value)` and NDJSON streaming endpoint (`/api/activation-plans/:id/apply/stream`) are already implemented.
- **Current API Routes**:
  - `/api/projects`, `/api/presets`, `/api/registry/skills`, `/api/skills`
  - `/api/skills/:lineage_id/profile`, `/api/skills/:lineage_id/notes`, `/api/skills/:lineage_id/feedback`, `/api/skills/:lineage_id/feedback-summary`
  - `/api/projects/:id/effective-set`, `/api/projects/:id/activation-plan/preview`, `/api/activation-plans/:id/apply`
  - `/api/recipes/export`, `/api/recipes/inspect`, `/api/recipes/apply`

### 2.2 Skill Feedback & Evaluation Store (`apps/skills-catalog/src/skill-management.js`)
- **Feedback Domain Model**:
  ```ts
  interface SkillFeedback {
    id: string;                      // `feedback_${uuid}`
    lineage_id: string;              // Lineage ID
    scope: "global" | "project" | "revision" | "preset" | "activation_run";
    outcome: "success" | "correction" | "scope_mismatch" | "freshness" | "risk" | "neutral";
    evidence_type: "manual" | "evaluation" | "activation_report" | "user_feedback" | "incident";
    summary: string;
    details?: string | null;
    author: string;
    project_id?: string | null;
    source_revision_id?: string | null;
    preset_id?: string | null;
    activation_plan_id?: string | null;
    redaction: "none" | "redacted" | "withheld";
    metrics: Record<string, number>; // { attempted, successful, corrections, scope_mismatches, freshness_issues, risk_events }
    created_at: string;              // ISO timestamp
  }
  ```
- **Feedback Aggregation (`getSkillFeedbackSummary`)**:
  - Aggregates outcomes into `by_outcome`, evidence types into `by_evidence_type`, and metrics into `reported_metrics`.
  - Calculates `success_rate = Number((byOutcome.success / signalCount).toFixed(3))`.
  - Computes `health`: `"needs_review"` if `risk > 0` or negative signals outweigh success; otherwise `"healthy"` (or `"unknown"` if empty).

### 2.3 CLI Command Architecture (`apps/skills-catalog/src/cli.js`)
- **Argument Parser (`parseArguments`)**:
  - Extracts positional arguments and `--flag value` or `--boolean-flag`.
  - `MULTI_VALUE_FLAGS`: `["skill", "use-when", "avoid-when", "tag", "domain", "work-scope", "maintainer", "provider", "runtime", "criterion"]`.
- **Command Dispatcher**:
  - Handles `import-local`, `import-git`, `source`, `list`, `serve`, `project`, `preset`, `project-plan`, `history`, `system-prompt`, `skill`, `evaluation`, `observed-state`, `recipe`.
  - Can be extended cleanly with `loop run ...` and `telemetry ...`.

### 2.4 Recipe & Activation Engine (`apps/skills-catalog/src/recipes.js`, `packages/skills-manager-adapter`)
- **Recipe Format**: Standardized `SkillRecipe` schema version 1 (sources, skills, presets, projects).
- **Materialization (`packages/skills-manager-adapter/src/index.ts`)**:
  - Windows junction creation: `await fs.symlink(path.resolve(operation.canonical_path), deliveryPath, "junction")`.
  - Idempotent cleanup: removes existing links before materializing updated pinned links.
  - Delivery path resolution per provider:
    - `antigravity`: `<project>/.agents/skills/`
    - `codex`: `<project>/skills/`
    - `claude`: `<project>/.claude/skills/`

### 2.5 Monorepo Test Baseline & Invariants
- Total tests: **228 tests across 4 workspaces** (50 catalog, 167 UI, 6 contracts, 5 adapter).
- Test execution time: ~3.0 - 4.0s total via native Node.js `node:test`.
- Quality invariant: 0 errors in `npm run check`, 100% pass in `npm test`, clean bundle in `npm run build`.

---

## 3. Requirement R2: Telemetry Ingestion API & Feedback Bridge

### 3.1 Telemetry Event Schema Specification
Every telemetry event payload must conform to the following schema:

```json
{
  "timestamp": "2026-08-28T07:00:00.000Z",
  "provider_id": "antigravity",
  "project_id": "my-project",
  "recipe_id": "mlc-task-planning",
  "skill_name": "task-decomposer",
  "lineage_id": "lineage_task_decomposer",
  "invocation_mode": "model_invoked",
  "duration_ms": 128,
  "tool_calls_count": 3,
  "outcome": "success",
  "evidence_type": "activation_report",
  "summary": "Decomposed PRD into 4 atomic TODO tasks",
  "details": "Parsed requirements, identified test targets, generated dependency DAG",
  "metrics": {
    "attempted": 1,
    "successful": 1
  }
}
```

#### Validation & Normalization Rules:
1. `timestamp`: Valid ISO-8601 string; if omitted, defaults to `new Date().toISOString()`.
2. `provider_id`: String (e.g. `antigravity`, `claude`, `codex`, `ralph-tui`); defaults to `"unspecified"`.
3. `skill_name`: Required non-empty string.
4. `lineage_id`: String; if omitted, resolved from `skill_name` against the registry and catalog.
5. `invocation_mode`: One of `["model_invoked", "user_invoked", "hybrid", "unspecified"]`.
6. `duration_ms`: Non-negative number (ms).
7. `tool_calls_count`: Non-negative integer.
8. `outcome`: Normalized to `["success", "correction", "scope_mismatch", "freshness", "risk", "neutral"]`. Mappings for external runners:
   - `"passed"`, `"ok"`, `"complete"` $\rightarrow$ `"success"`
   - `"failed"`, `"error"`, `"exception"` $\rightarrow$ `"risk"`
   - `"retry"`, `"mismatch"` $\rightarrow$ `"correction"`
9. `evidence_type`: Normalized to `["manual", "evaluation", "activation_report", "user_feedback", "incident"]`. (Defaults to `"activation_report"` or `"user_feedback"` if unspecified).
10. `summary`: Non-empty string describing the invocation result.

### 3.2 Append-Only NDJSON Storage (`.skills-platform/telemetry/events.ndjson`)
- **Storage Location**: Path resolved relative to project root or catalog root: `path.join(root, ".skills-platform", "telemetry", "events.ndjson")`.
- **Directory Creation**: `await fs.mkdir(path.dirname(ndjsonPath), { recursive: true })`.
- **Append Operation**: `await fs.appendFile(ndjsonPath, `${JSON.stringify(normalizedEvent)}\n`, "utf8")`.
- **Concurrency & Resilience**:
  - Uses native file append (`flags: 'a'`) which is atomic for writes under OS pipe buffer limits.
  - Reader splits on `\n`, filters empty lines, and wraps `JSON.parse` in try/catch to safely skip corrupt lines without failing the entire stream.

### 3.3 Feedback Bridge Integration
When `POST /api/telemetry/record` is invoked:
1. Validates and normalizes the incoming telemetry event.
2. Appends the event to `.skills-platform/telemetry/events.ndjson`.
3. Looks up `lineage_id` from `skill_name` if not directly provided (by querying catalog lineages/skills).
4. If `lineage_id` exists:
   - Constructs `SkillFeedback` input:
     ```js
     await addSkillFeedback({
       catalogRoot,
       registryRoot,
       lineageId,
       scope: event.project_id ? "project" : "global",
       outcome: normalizedOutcome,
       evidenceType: normalizedEvidenceType,
       summary: event.summary || `Telemetry recorded by ${event.provider_id} for ${event.skill_name}`,
       details: typeof event.details === "string" ? event.details : JSON.stringify(event.details ?? {}),
       author: event.provider_id || "telemetry-hook",
       projectId: event.project_id || null,
       metrics: {
         attempted: 1,
         successful: normalizedOutcome === "success" ? 1 : 0,
         duration_ms: event.duration_ms || 0,
         tool_calls_count: event.tool_calls_count || 0,
         ...(event.metrics || {}),
       },
     });
     ```
5. Returns status `201 Created` with payload:
   ```json
   {
     "recorded": true,
     "event": { ... },
     "feedback": { ... }
   }
   ```

### 3.4 Telemetry Aggregation Engine (`GET /api/telemetry/summary`)
Reads `.skills-platform/telemetry/events.ndjson` (with support for query filters: `project_id`, `provider_id`, `skill_name`, `since`) and computes:
- `total_events`: Count of all events.
- `invocation_counts_by_mode`: `{ model_invoked: N, user_invoked: N, hybrid: N, unspecified: N }`.
- `by_provider`: `{ antigravity: N, claude: N, codex: N, ... }`.
- `by_outcome`: `{ success: N, correction: N, scope_mismatch: N, freshness: N, risk: N, neutral: N }`.
- `avg_duration_ms`: Total duration divided by total events (rounded to 1 decimal place).
- `success_rate`: Ratio of successful events to total signal events (`0.0` to `1.0`).
- `health_distribution`: Aggregated health distribution across skills (`healthy`, `needs_review`, `unknown`).
- `recent_events`: Top 20 most recent events sorted descending by timestamp.

---

## 4. Requirement R3: CLI Lifecycle Loop Orchestrator

### 4.1 CLI Command Syntax
```bash
skills-platform loop run --prd <path> --project <project_path> --provider <provider_id>
# Or via skills-catalog CLI
skills-catalog loop run --prd docs/PRD.md --project . --provider antigravity [--confirm] [--dry-run]
```

### 4.2 Lifecycle Recipe Inventory
The repository provides 3 pre-defined canonical lifecycle recipes at workspace root:
1. `task-planning-recipe.json` (`mlc-task-planning` / `task-planning-suite`):
   - Skills: `task-decomposer`, `horizontal-topic-scanner`.
   - Work scope tags: `["plan", "horizontal"]`.
2. `scoped-inner-loop-recipe.json` (`mlc-scoped-inner-loop` / `scoped-inner-loop-suite`):
   - Skills: `vertical-context-extractor`, `scoped-tdd-executor`, `context-patch-synthesizer`.
   - Work scope tags: `["execute", "vertical"]`.
3. `release-governance-recipe.json` (`mlc-release-governance` / `release-governance-suite`):
   - Skills: `lifecycle-phase-controller`, `global-regression-gatekeeper`, `baseline-curation-core`.
   - Work scope tags: `["gate", "governance"]`.

### 4.3 Phase 1: Planning Phase Execution
1. **Recipe Mount**: Applies `task-planning-recipe.json` onto `<project_path>` for `<provider_id>`. Delivery directory links are hot-swapped to `task-decomposer` and `horizontal-topic-scanner`.
2. **PRD Parsing & Task Extraction**:
   - Reads PRD file from `--prd <path>`.
   - Extracts structured requirements, functional specifications, and target verification commands.
   - Decomposes work into an atomic task queue:
     ```json
     {
       "prd_id": "prd-001",
       "extracted_at": "2026-08-28T07:00:00Z",
       "tasks": [
         {
           "id": "task-1",
           "title": "Telemetry Record API endpoint and NDJSON append",
           "scoped_test": "apps/skills-catalog/test/telemetry.test.js",
           "status": "pending"
         },
         {
           "id": "task-2",
           "title": "Telemetry Summary aggregation endpoint",
           "scoped_test": "apps/skills-catalog/test/telemetry-summary.test.js",
           "status": "pending"
         },
         {
           "id": "task-3",
           "title": "Lifecycle Loop CLI orchestrator and phase hot-swapping",
           "scoped_test": "apps/skills-catalog/test/lifecycle-loop.test.js",
           "status": "pending"
         }
       ]
     }
     ```
3. **Artifacts Emitted**: Emits `.skills-platform/loop/prd.json` and `.skills-platform/loop/task-queue.json`.

### 4.4 Phase 2: Scoped Inner Loop Execution
1. **Recipe Hot-Swap**: Swaps junction bindings to `scoped-inner-loop-recipe.json` (`vertical-context-extractor`, `scoped-tdd-executor`, `context-patch-synthesizer`).
2. **Iterative Task Resolution**:
   - For each atomic task in `task-queue.json`:
     - Extracts vertical context (targeted files and single test target).
     - **Test Storm Suppression Gate**:
       - Rejects/blocks full-suite regression runs (such as indiscriminate `npm test` or global directory scans).
       - Authorizes only pinpoint `run_scoped_test(task.scoped_test)`.
     - Executes pinpoint scoped test runner (e.g. `node --test <task.scoped_test>`).
     - Synthesizes Context Patch Proposal with test evidence.
     - Updates task status to `"passed"` and records execution duration and evidence.
3. **Loop Convergence**: Continues until all tasks in the queue are in `"passed"` state.

### 4.5 Phase 3: Release Gate Execution
1. **Recipe Hot-Swap**: Swaps junction bindings to `release-governance-recipe.json` (`lifecycle-phase-controller`, `global-regression-gatekeeper`, `baseline-curation-core`).
2. **Authorized Single Full Regression Suite Run**:
   - `global-regression-gatekeeper` authorizes a single execution of the full regression test suite (`npm test`).
   - Verifies 100% test pass rate across all workspace packages.
3. **Canonical Baseline Update (`MASTER_BASELINE.md`)**:
   - Appends/updates the verified release section in `MASTER_BASELINE.md`:
     - Records cycle timestamp, PRD reference, total tasks completed, regression suite result, and verified status.
4. **Finalization**: Emits `.skills-platform/loop/cycle-report.json` and returns exit code 0 with clean summary.

---

## 5. Architectural Diagram: Telemetry & Lifecycle Loop Flow

```
                                 [ PRD Document ]
                                        │
                                        ▼
                   ┌──────────────────────────────────────────┐
                   │  skills-platform loop run                │
                   │  --prd <path> --project <dir> --provider │
                   └────────────────────┬─────────────────────┘
                                        │
             ┌──────────────────────────┼──────────────────────────┐
             ▼                          ▼                          ▼
 ┌───────────────────────┐  ┌───────────────────────┐  ┌───────────────────────┐
 │   PHASE 1: PLAN       │  │ PHASE 2: INNER LOOP   │  │ PHASE 3: RELEASE GATE │
 │ (task-planning-recipe)│  │ (scoped-inner-loop)   │  │ (release-governance)  │
 ├───────────────────────┤  ├───────────────────────┤  ├───────────────────────┤
 │ • Mount planning suite│  │ • Hot-swap to scoped  │  │ • Hot-swap to release │
 │ • Parse PRD document  │  │ • Process tasks 1-by-1│  │ • Authorize 1x full   │
 │ • Extract atomic tasks│  │ • Pinpoint scoped test│  │   regression suite    │
 │ • Write task-queue    │  │ • Suppress test storms│  │ • Update canonical    │
 └───────────┬───────────┘  └───────────┬───────────┘  │   MASTER_BASELINE.md  │
             │                          │              └───────────┬───────────┘
             └──────────────────────────┼──────────────────────────┘
                                        │
                                        ▼
                     ┌──────────────────────────────────────┐
                     │ Telemetry Hook Engine / Subprocesses │
                     └──────────────────┬───────────────────┘
                                        │
             ┌──────────────────────────┴──────────────────────────┐
             ▼                                                     ▼
┌───────────────────────────────┐               ┌─────────────────────────────────────┐
│ POST /api/telemetry/record    │               │ Local Append-only File              │
│ • Schema validation           │               │ .skills-platform/telemetry/         │
│ • Bridge to addSkillFeedback  │──────────────▶│ events.ndjson                       │
│ • Evidence store insertion    │               └──────────────────┬──────────────────┘
└───────────────────────────────┘                                  │
                                                                   ▼
                                                ┌─────────────────────────────────────┐
                                                │ GET /api/telemetry/summary          │
                                                │ • Invocation counts by mode         │
                                                │ • Success rate & avg duration       │
                                                │ • Health distribution & timeline    │
                                                └──────────────────┬──────────────────┘
                                                                   │
                                                                   ▼
                                                ┌─────────────────────────────────────┐
                                                │ Catalog Web UI (apps/catalog-ui)    │
                                                │ SkillWorkspace & Live Drawer Feeds  │
                                                └─────────────────────────────────────┘
```

---

## 6. Implementation Task Breakdown & File Inventory

### Proposed Module Changes:
| Path | Operation | Description |
|------|-----------|-------------|
| `apps/skills-catalog/src/telemetry.js` | Create | Dedicated telemetry engine (`recordTelemetryEvent`, `getTelemetrySummary`, `readTelemetryEvents`, schema validation, NDJSON logger) |
| `apps/skills-catalog/src/lifecycle-loop.js` | Create | Dedicated lifecycle loop runner (`runLifecycleLoop`, 3-phase state machine, PRD task extractor, scoped test runner, storm suppressor, baseline updater) |
| `apps/skills-catalog/src/server.js` | Modify | Add `POST /api/telemetry/record` and `GET /api/telemetry/summary` endpoints |
| `apps/skills-catalog/src/cli.js` | Modify | Add `loop run` command and `telemetry` subcommands |
| `apps/skills-catalog/src/index.js` | Modify | Export telemetry and lifecycle loop functions |
| `apps/skills-catalog/test/telemetry.test.js` | Create | Comprehensive unit and integration test suite for Telemetry Ingestion API & Feedback Bridge |
| `apps/skills-catalog/test/lifecycle-loop.test.js` | Create | Comprehensive test suite for CLI Lifecycle Loop (3 phases, junction hot-swapping, test storm suppression, baseline updates) |

---

## 7. Testing & Verification Methodology

1. **Unit & Boundary Tests**:
   - Validating malformed JSON, missing fields, negative durations, and invalid outcome enums for `POST /api/telemetry/record`.
   - Testing summary calculations with empty log file, single event, and multi-provider mixed streams for `GET /api/telemetry/summary`.
2. **Integration & Feedback Bridge Tests**:
   - Verifying that recorded telemetry automatically creates `SkillFeedback` entries in catalog state.
   - Verifying that `getSkillFeedbackSummary` accurately reflects telemetry outcomes in skill health status.
3. **Lifecycle Loop & Junction Hot-Swapping Tests**:
   - Simulating Phase 1 PRD extraction into atomic tasks.
   - Simulating Phase 2 inner loop with pinpoint test executions, asserting that full-suite test runs are blocked/suppressed.
   - Simulating Phase 3 release gate, executing authorized full regression and asserting that `MASTER_BASELINE.md` is updated.
4. **Monorepo Quality Gate**:
   - `npm run check` (TypeScript type check across all workspaces $\rightarrow$ 0 errors).
   - `npm test` (All existing 228 tests + new test suites $\rightarrow$ 100% pass).
   - `npm run build` (Clean production Vite build in `apps/catalog-ui/dist`).
