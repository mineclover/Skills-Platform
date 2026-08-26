# Detailed Survey & Quality Verification Analysis

**Author:** survey_explorer_3  
**Date:** 2026-08-27  
**Scope:** Repository build system, workspace configurations, test setup, quality verification, and testing roadmap for R1–R4.

---

## Executive Summary

The `skills-platform` repository is an npm monorepo configured with four active workspace packages:
1. `apps/catalog-ui` — React 19 + Vite 7 SPA control plane.
2. `apps/skills-catalog` — Node.js skills registry, activation catalog, policy engine, and HTTP server.
3. `packages/skill-contracts` — Shared TypeScript data models, schemas, and validators (`ActivationPlan`, `SkillRecipe`, digests).
4. `packages/skills-manager-adapter` — Reference delivery execution adapter (symlink/copy, inspection, verification).

All existing automated tests leverage Node's built-in `node:test` and `node:assert/strict` framework (50 total unit/integration tests, 100% passing). Currently, `apps/catalog-ui` lacks automated tests and a `test` script in its `package.json`. All root quality scripts (`npm run check`, `npm run build`, `npm test`) currently pass with 0 errors.

---

## 1. Monorepo & Build Configuration Investigation

### 1.1 Root Configuration
- **File:** `package.json`
- **Workspaces:**
  ```json
  "workspaces": [
    "apps/skills-catalog",
    "apps/catalog-ui",
    "packages/*"
  ]
  ```
  *(Note: `apps/skills-manager` exists as a local submodule/reference but is intentionally not in root npm workspaces).*
- **Root Scripts:**
  - `"build": "npm run --workspaces --if-present build"`
  - `"check": "npm run --workspaces --if-present check"`
  - `"test": "npm run --workspaces --if-present test"`
- **Root DevDependencies:** `@types/node` (^26.2.0), `typescript` (^7.0.2).
- **Base TypeScript Config:** `tsconfig.base.json`
  - `target`: `ES2022`
  - `module`: `NodeNext`
  - `moduleResolution`: `NodeNext`
  - `strict`: `true`, `declaration`: `true`, `sourceMap`: `true`, `esModuleInterop`: `true`

---

### 1.2 Workspace Package Matrix

| Workspace | Type | Key Scripts | TypeScript Config | Dependencies |
|---|---|---|---|---|
| `packages/skill-contracts` | Library (TS/CJS/ESM) | `build: tsc`<br>`check: tsc --noEmit`<br>`test: node --test` | Extends `tsconfig.base.json`<br>`outDir: ./dist`, `rootDir: ./src` | Zero external deps |
| `packages/skills-manager-adapter` | Library + CLI | `build: tsc`<br>`check: tsc --noEmit`<br>`test: node --test` | Extends `tsconfig.base.json`<br>`outDir: ./dist`, `rootDir: ./src` | `@skills-platform/contracts` |
| `apps/skills-catalog` | Service + CLI | `check: tsc --noEmit && node --check src/index.js`<br>`test: node --test` | Extends `tsconfig.base.json`<br>`allowJs: true`, `noEmit: true` | `@skills-platform/contracts` |
| `apps/catalog-ui` | React Web UI (Vite) | `dev: vite`<br>`build: tsc -b && vite build`<br>`check: tsc -b --pretty false` | Independent `tsconfig.json`<br>`moduleResolution: Bundler`, `jsx: react-jsx` | `react` 19.1.0, `react-dom` 19.1.0, `lucide-react` 0.563.0, `vite` 7.0.4, `@skills-platform/contracts` |

---

## 2. Test Setup & Framework Analysis

### 2.1 Testing Framework
- **Test Runner:** Native Node.js test runner (`node:test`, TAP-compliant).
- **Assertions:** Native strict assertions (`node:assert/strict`).
- **Runtime Environment:** Node.js v22.21.1 with npm 11.13.0.
- **Execution Speed:** Fast and lightweight (~3.2 seconds for entire suite across 3 packages).

### 2.2 Test Patterns & Utilities
1. **Filesystem Isolation:**
   - Tests allocate isolated temporary directories using `fs.mkdtemp(path.join(os.tmpdir(), "..."))`.
   - Cleanup is guaranteed via test context lifecycle hook `context.after(() => fs.rm(root, { recursive: true, force: true }))`.
2. **Server / API Integration Testing:**
   - `apps/skills-catalog/test/server.test.js` launches ephemeral `http.Server` instances using port `0` (OS dynamic port assignment) and makes native `fetch` requests.
3. **Mocking & Inspectors:**
   - Dynamic mock objects for `upstreamInspector` providing simulated `UpstreamStatus` objects (providers, inventory, bindings).
   - Mock streams for SSE / line-delimited JSON apply progress streams.

### 2.3 Existing Test Inventory (50 Tests Total)

#### `packages/skill-contracts` (`test/activation-plan.test.js` — 6 tests)
1. Default symlink activation plan generation and schema validation.
2. Project plan rejection when missing target project.
3. Pristine plan reconciliation with empty operations.
4. Duplicate delivery path collision rejection.
5. Artifact type validation (`skill`, `rule`, `hook`, `plugin`, `mcp_server`).
6. Invocation mode validation (`model_invoked`, `user_invoked`, `hybrid`, `unspecified`).

#### `packages/skills-manager-adapter` (2 test files — 5 tests)
- `test/adapter.test.js` (3 tests):
  1. Preview and verified symbolic link materialization after explicit confirmation.
  2. Managed delivery link removal on pristine plan.
  3. Unmanaged directory preservation at delivery paths.
- `test/catalog-integration.test.js` (2 tests):
  1. Event streaming (preview, per-operation progress, final report).
  2. End-to-end plan crossing adapter boundary and materializing pinned skill.

#### `apps/skills-catalog` (13 test files — 39 tests)
- `test/recipes.test.js`: Export, inspect, and apply recipe onto fresh registry/catalog.
- `test/server.test.js`: Catalog bridge HTTP endpoints (projects, effective sets, history, preview, recipe export/inspect/apply).
- `test/catalog-workflows.test.js`: Pinned link-first plans, pristine baselines, scope overlays, prompt exports.
- `test/source-review.test.js`: Source reviews, adoption candidates, template adoption version bumping.
- `test/observed-state.test.js`: Upstream observation recording and plan comparison (in-sync vs drifted).
- `test/evaluation.test.js`: Versioned evaluation cases and evidence-based review queue.
- `test/preset-templates.test.js`: Template membership versioning and immutability.
- `test/skill-management.test.js`: Lineage profiles, scoped notes, hybrid search, health summaries.
- `test/registry.test.js`: Immutable canonical storage, duplicate deduplication, git sources, multi-artifact types.
- `test/cli.test.js`: CLI apply, preview, confirm, report logging.
- `test/upstream-inspector.test.js`: Skills Manager inspector CLI flag preservation and preamble parsing.
- `test/upstream-apply.test.js`: Recorded activation plan application and verification recording.
- `test/basic-scenarios.test.js`: Baseline end-to-end workflow sanity tests.

---

## 3. Current Build, Check, and Test Execution Status

### 3.1 `npm run check`
- **Command:** `npm run check`
- **Output & Status:** **PASSED (Exit code 0)**
  - `@skills-platform/catalog`: `tsc --noEmit && node --check src/index.js` — PASSED
  - `@skills-platform/catalog-ui`: `tsc -b --pretty false` — PASSED
  - `@skills-platform/contracts`: `tsc --noEmit` — PASSED
  - `@skills-platform/skills-manager-adapter`: `tsc --noEmit` — PASSED
- **Type Errors:** **0 errors**.

### 3.2 `npm run build`
- **Command:** `npm run build`
- **Output & Status:** **PASSED (Exit code 0)**
  - `@skills-platform/catalog-ui`: `tsc -b && vite build` — PASSED (1714 modules transformed, built in 2.80s). Output artifacts created in `apps/catalog-ui/dist/` (`index.html` 0.45 kB, `index-*.css` 22.69 kB, `index-*.js` 232.39 kB).
  - `@skills-platform/contracts`: `tsc` — PASSED.
  - `@skills-platform/skills-manager-adapter`: `tsc` — PASSED.

### 3.3 `npm test`
- **Command:** `npm test`
- **Output & Status:** **PASSED (Exit code 0)**
  - 50 passed, 0 failed, 0 skipped.
  - Total duration: ~3.2 seconds.

---

## 4. Test Suite Requirements for R1, R2, R3, R4

To ensure rigorous quality verification without introducing heavy runtime dependencies, `apps/catalog-ui` tests and additional contract/catalog tests should be structured using Node's native `node:test` runner.

### 4.1 R1: Recipe Hub & Transfer Workspace Test Suite

#### Contract & Backend Level (`packages/skill-contracts`, `apps/skills-catalog`)
1. **Schema & Validation Tests:**
   - Test `validateSkillRecipe` against invalid recipes (missing required fields, unknown source types, invalid artifact types, negative preset versions).
   - Test `createSkillRecipe` default ID generation and timestamp stamping.
2. **Export Recipe Tests:**
   - Export for specific project (includes only assigned presets and skills).
   - Export for specific preset (includes selected version and dependency skills).
   - Export full catalog.
   - Verification that generated JSON matches `@skills-platform/contracts` `SkillRecipe` schema.
3. **Inspect Recipe Tests:**
   - Accurate metrics calculation: total sources, total skills, breakdown by invocation mode (`model_invoked`, `user_invoked`, `hybrid`, `unspecified`), preset count.
   - Malformed JSON error reporting.
4. **Apply Recipe Tests:**
   - Application to target project with provider selection (`codex`, `antigravity`, `claude`).
   - Dry-run preview vs confirmed execution.
   - Verified creation of delivery paths and catalog preset reconciliations.

#### UI Logic Level (`apps/catalog-ui/test/recipes.test.js`)
1. **Recipe File Parsing & Drag-and-Drop:**
   - Handling file reader text inputs and JSON parsing.
   - Error handling for corrupt/incomplete JSON.
2. **Metrics Computation:**
   - Computing summary cards (sources count, skills breakdown, preset list).
3. **Export Triggering:**
   - Formatting JSON with 2-space indentation and creating Blob download payload.
4. **Recipe Apply Flow State:**
   - Multi-step modal state transitions: Inspect → Target Selection → Live Preview → Execution Confirmation → Result Summary.

---

### 4.2 R2: Workspace Layout & Navigation Modernization Test Suite

#### UI & Routing Level (`apps/catalog-ui/test/navigation-and-filters.test.js`)
1. **Navigation State:**
   - Tab switching across `Skills`, `Templates`, `Projects`, and new `Recipes` workspace.
   - Preserving active project and scope selection when switching tabs.
2. **Quick-Filter Toolbars:**
   - Filtering skills in `SkillWorkspace` by invocation mode chips:
     - 🤖 Model-invoked / Reflex
     - 👤 User-invoked / Command
     - 🔀 Hybrid
     - All
   - Filtering skills in `TemplateWorkspace` by invocation mode and search query.
   - Filtering by assistant provider (`codex`, `antigravity`, `claude`).
   - Filtering by review state (`unreviewed`, `reviewed`, `deprecated`).
   - Text search filtering across `skill_name`, `summary`, `purpose`, `tags`.
3. **Responsive Grid & Layout Assertions:**
   - Verifying clean layout state mappings and CSS class applications.

---

### 4.3 R3: Multi-Provider & Invocation Visual Identity Test Suite

#### Contract & UI Level (`apps/catalog-ui/test/visual-identity.test.js` & `packages/skill-contracts/test/providers.test.js`)
1. **Invocation Mode Indicators:**
   - Correct badge icon, label, and CSS class mapping (`.invocation-pill.model`, `.invocation-pill.user`, `.invocation-pill.hybrid`).
   - Unspecified mode fallback handling.
2. **Provider Delivery Paths:**
   - Correct resolution of active delivery roots by provider:
     - `codex` -> `<project>/skills/<skill_name>/`
     - `antigravity` -> `<project>/.agents/skills/<skill_name>/`
     - `claude` -> `<project>/.claude/skills/<skill_name>/`
3. **Pristine & Drift State Indicators:**
   - Visual chip status: `Active`, `Pristine baseline`, `Unavailable`, `Attention (drift)`.
   - Drift categorization: missing symlinks, broken targets, conflict states.

---

### 4.4 R4: Real-time Activation Diagnostics & Progress Test Suite

#### UI & Diagnostics Level (`apps/catalog-ui/test/diagnostics-and-stream.test.js`)
1. **5-Stage Stepper Progress:**
   - Progress bar calculation across stages: `Plan` → `Inspect` → `Preview` → `Materialize` → `Verify` → `Completed`/`Failed`.
   - Percentage interpolation based on `completed / total` within each stage.
2. **Stream Decoder (`readApplyStream`):**
   - Handling chunked line-delimited JSON streams.
   - Emitting `progress` events.
   - Resolving final `result` object.
   - Throwing on `error` events or network failure.
3. **Drift Warning & Reconciliation:**
   - Identifying binding drift count (`missing + conflict + unavailable`).
   - Reconcile action button triggering live refresh and plan re-application.

---

## 5. Summary Matrix of Test Suite Roadmap

| Requirement Area | Target File(s) | Test Scope | Verification Method |
|---|---|---|---|
| **R1: Recipe Hub** | `apps/catalog-ui/test/recipes.test.js`<br>`apps/skills-catalog/test/recipes.test.js`<br>`packages/skill-contracts/test/recipes.test.js` | Export schema validation, file drop parsing, summary metrics breakdown, provider apply flow | `npm test` |
| **R2: Layout & Filters** | `apps/catalog-ui/test/navigation-and-filters.test.js` | SideNavigation switching, invocation mode filter chips, provider filter, keyword search, table/card views | `npm test` |
| **R3: Visual Identity** | `apps/catalog-ui/test/visual-identity.test.js` | Invocation mode pills, active provider delivery path indicators, pristine/drift badge mappings | `npm test` |
| **R4: Diagnostics** | `apps/catalog-ui/test/diagnostics-and-stream.test.js` | 5-stage progress calculation, stream reader parsing, drift warnings and reconciliation triggers | `npm test` |

---

## 6. Recommendations for Implementation Phase

1. **Add Test Script to `apps/catalog-ui/package.json`:**
   ```json
   "scripts": {
     "dev": "vite",
     "build": "tsc -b && vite build",
     "check": "tsc -b --pretty false",
     "test": "node --test test/**/*.test.js"
   }
   ```
2. **Zero-Dependency Native Tests:**
   Use Node.js 22's built-in `node:test` and `node:assert/strict` across all test files to maintain lightning-fast execution and zero installation overhead.
3. **Type Safety & Build Integration:**
   Keep `apps/catalog-ui/src/` fully typed and verify with `npm run check` (`tsc -b`). Any test helper modules or shared schemas should reference `@skills-platform/contracts`.
