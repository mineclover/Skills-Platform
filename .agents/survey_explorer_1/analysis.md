# Data Layer, Contracts, Schema & Business Logic Survey Report

**Date**: 2026-08-27  
**Explorer**: `survey_explorer_1`  
**Scope**: `packages/contracts`, `packages/skills-manager-adapter`, `apps/skills-catalog`, `apps/catalog-ui`

---

## 1. Executive Summary

This investigation analyzed the entire data layer, type contracts, schemas, and core business logic across the Skills Platform monorepo.

### Key Architectural Findings
1. **Strong Core Contracts**: `@skills-platform/contracts` provides robust TypeScript definitions and runtime validators for `ActivationPlan`, `SkillRecipe`, `InvocationMode`, `ArtifactType`, `UpstreamStatus`, and project/preset schemas.
2. **Backend Completeness for Recipes**: `apps/skills-catalog/src/recipes.js` and `apps/skills-catalog/src/server.js` already implement full export, inspection, and apply business logic and expose HTTP endpoints (`/api/recipes/export`, `/api/recipes/inspect`, `/api/recipes/apply`).
3. **Multi-Provider Path Routing**: Provider-aware delivery routing (`codex` -> `skills/`, `antigravity`/`agy`/`gemini` -> `.agents/skills/`, `claude` -> `.claude/skills/`) is fully implemented in `catalog-state.js` (`defaultDeliveryRoot`) and ADR 0003.
4. **Observed State & Drift Comparison**: `apps/skills-catalog/src/observed-state.js` has comprehensive drift detection comparing planned operations against live provider bindings (`matched`, `missing`, `disabled`, `still_enabled`, `conflict`, `provider_unavailable`).
5. **Frontend UI Gaps**:
   - `apps/catalog-ui` lacks a **Recipe Hub / Workspace** (`RecipeWorkspace.tsx`) in navigation, export download triggers, file upload/dropzone inspect panels, and one-click recipe apply modal flows (R1).
   - Navigation in `SideNavigation.tsx` lacks a Recipes tab; `SkillWorkspace` and `TemplateWorkspace` lack quick-filter toolbars for `InvocationMode` (🤖 Model / 👤 User / 🔀 Hybrid) (R2).
   - Visual badges for provider delivery paths (`.agents/skills/` vs `skills/` vs `.claude/skills/`), invocation mode tooltips, and pristine vs drift indicators need polish (R3).
   - The activation progress modal currently renders a linear percentage bar rather than a 5-step diagnostic pipeline (`Plan` → `Inspect` → `Preview` → `Materialize` → `Verify`), and lacks actionable reconciliation buttons on drift (R4).

---

## 2. Monorepo Structure & Package Inventory

| Path | Package / Role | Technologies | Test Suite |
|---|---|---|---|
| `packages/skill-contracts` | `@skills-platform/contracts` — Contract definitions, schemas, digests, validators | TypeScript, Node crypto | `node --test` (6 tests passing) |
| `packages/skills-manager-adapter` | `@skills-platform/skills-manager-adapter` — Local filesystem delivery adapter (symlinks/junctions) | TypeScript, Node fs/promises | `node --test` (5 tests passing) |
| `apps/skills-catalog` | `@skills-platform/catalog` — Control plane server, registry, workflows, recipes, state | Node.js, HTTP, TypeScript types | `node --test` (39 tests passing) |
| `apps/catalog-ui` | `@skills-platform/catalog-ui` — Single-page React control plane UI | React 18, Vite, Lucide icons, CSS | `tsc -b` check passing |

---

## 3. Data Contracts & Schema Deep Dive

### 3.1 Invocation Taxonomy & Artifact Types
Located in: `packages/skill-contracts/src/types.ts` (lines 1–19)

```ts
export type ArtifactType = "skill" | "rule" | "hook" | "plugin" | "mcp_server";
export const ARTIFACT_TYPES: ReadonlySet<ArtifactType> = new Set([
  "skill", "rule", "hook", "plugin", "mcp_server"
]);

export type InvocationMode = "model_invoked" | "user_invoked" | "hybrid" | "unspecified";
export const INVOCATION_MODES: ReadonlySet<InvocationMode> = new Set([
  "model_invoked", "user_invoked", "hybrid", "unspecified"
]);
```

- **Semantics**:
  - `model_invoked` (🤖 Agent Reflex): Autonomous routines triggered directly by LLMs (e.g., `readchk`, `modelchk`, `sip`, `feynman`).
  - `user_invoked` (👤 Explicit Command): High-impact/destructive steering tools requiring human invocation (e.g., `hate`, `macrothink`, `re0-release`).
  - `hybrid` (🔀 Both): Multi-purpose tools usable both autonomously and via user instruction.
  - `unspecified`: Default unclassified state.

### 3.2 Skill Recipe & Portability Contract
Located in: `packages/skill-contracts/src/types.ts` (lines 425–484) and `packages/skill-contracts/src/index.ts` (lines 163–247)

```ts
export const RECIPE_SCHEMA_VERSION = 1;

export interface RecipeSource {
  source_id: string;
  type: "git" | "local";
  locator: string;
  ref?: string;
  resolved_commit?: string;
}

export interface RecipeSkill {
  name: string;
  artifact_type: ArtifactType;
  invocation_mode: InvocationMode;
  source_id: string;
  source_relative_path: string;
  content_digest: string;
  description?: string | null;
}

export interface RecipePresetEntry {
  skill_name: string;
  source_relative_path?: string;
  artifact_type?: ArtifactType;
  required?: boolean;
}

export interface RecipePreset {
  id: string;
  name: string;
  version: number;
  description?: string | null;
  purpose?: string | null;
  work_scope_tags?: string[];
  skills: RecipePresetEntry[];
}

export interface RecipeProjectBinding {
  project_id: string;
  project_name: string;
  provider_id: string;
  scope: "project" | "global";
  default_preset_id: string;
  default_preset_version?: number;
  delivery_root_relative?: string;
}

export interface SkillRecipe {
  schema_version: number;
  recipe_id: string;
  name: string;
  description?: string | null;
  created_at: string;
  created_by?: string;
  sources: RecipeSource[];
  skills: RecipeSkill[];
  presets: RecipePreset[];
  projects?: RecipeProjectBinding[];
}
```

- **Validation Function**: `validateSkillRecipe(recipe: unknown): ValidationResult` enforces `schema_version === 1`, non-empty strings, valid `sources`, valid `skills` with recognized `artifact_type` and `invocation_mode`, and preset integrity.
- **Factory Function**: `createSkillRecipe(...)` generates a normalized, validated `SkillRecipe` object.

### 3.3 Project Profiles, Presets & Multi-Provider Delivery
Located in: `packages/skill-contracts/src/types.ts` (lines 285–379) and `apps/skills-catalog/src/catalog-state.js` (lines 180–191)

- **Provider Path Convention (`defaultDeliveryRoot`)**:
  - `antigravity` / `agy` / `gemini` $\rightarrow$ `<project_path>/.agents/skills`
  - `claude` $\rightarrow$ `<project_path>/.claude/skills`
  - `codex` / default $\rightarrow$ `<project_path>/skills`
- **Project Profile Contract**:
```ts
export interface ProjectProfile {
  id: string;
  name: string;
  upstream_project_id: string;
  project_path: string | null;
  provider_id: string;
  delivery_root: string;
  scope: DeliveryScope;
  default_preset_id: string;
  default_preset_version: number;
  preset_assignments: ProjectPresetAssignment[];
  created_at: string;
  updated_at?: string;
}
```
- **Pristine State Representation**:
  - Pinned preset ID: `"builtin-pristine"`
  - Mode: `"pristine"`
  - Desired operation state: `"disabled"` for all catalog skills.
  - Operation: unlinks all managed symlinks in delivery root without deleting project code.

### 3.4 Activation Plan & Execution Reports
Located in: `packages/skill-contracts/src/types.ts` (lines 32–104) and `packages/skills-manager-adapter/src/index.ts`

- **Activation Plan Structure**:
```ts
export interface ActivationPlan {
  plan_id: string;
  schema_version: number; // 1
  created_at: string;
  mode: "apply" | "pristine";
  target: {
    provider_id: string;
    scope: "project" | "global";
    project_id?: string;
    project_path?: string;
  };
  distribution: {
    method: "symlink" | "copy";
    collision_strategy: string;
    shared_root_confirmation: boolean;
  };
  operations: ActivationOperation[];
}
```
- **Lifecycle & Stream Stages**:
  1. `inspect`: Checks project directory and canonical artifact availability.
  2. `resolve`: Matches immutable revision hashes and identifies target instances.
  3. `preview`: Inspects delivery paths for conflicts, replacements, noops, or invalid symlinks.
  4. `apply` / `materialize`: Confirmed atomic symlink/junction creation or removal.
  5. `verify`: Re-scans upstream bindings and generates `ActivationReport`.

### 3.5 Observed State & Drift Diagnostics
Located in: `apps/skills-catalog/src/observed-state.js`

- **Drift Comparison Output**:
```ts
export interface ObservedStateComparison {
  plan_id: string;
  project_id: string;
  provider_id: string;
  observed_state_id: string;
  captured_at: string;
  provider: UpstreamProvider | null;
  in_sync: boolean;
  summary: Record<string, number>; // matched, missing, disabled, still_enabled, conflict, provider_unavailable
  operations: Array<{
    operation: ActivationOperation;
    binding: UpstreamBinding | null;
    status: "matched" | "missing" | "disabled" | "still_enabled" | "conflict" | "provider_unavailable";
    reason: string;
  }>;
}
```

---

## 4. Backend Endpoints Inventory

The Catalog control plane server (`apps/skills-catalog/src/server.js`) exposes the following endpoints:

| Method | Path | Description | Supporting Logic File |
|---|---|---|---|
| `GET` | `/api/projects` | List registered project profiles | `catalog-state.js` |
| `GET` | `/api/projects/:id/effective-set` | Resolve effective skill set for project & work-scope | `catalog-workflows.js` |
| `POST` | `/api/projects/:id/default-preset` | Pin project default preset | `catalog-state.js` |
| `POST` | `/api/projects/:id/work-scope-overlay` | Set/replace work-scope overlay preset | `catalog-state.js` |
| `GET` | `/api/projects/:id/history` | List recorded activation plans & reports | `catalog-state.js` |
| `GET` | `/api/projects/:id/system-prompt` | Generate rendered system prompt markdown with notes | `catalog-workflows.js` |
| `GET` | `/api/projects/:id/upstream-status` | Inspect live bindings for project | `upstream-inspector.js` |
| `GET` | `/api/upstream-status` | Inspect global live bindings | `upstream-inspector.js` |
| `GET` | `/api/presets` | List versioned templates (includes Pristine) | `catalog-state.js` |
| `POST` | `/api/presets` | Create new preset template | `catalog-state.js` |
| `POST` | `/api/presets/:id/update` | Update template membership (creates new version) | `catalog-state.js` |
| `POST` | `/api/presets/:id/adopt` | Adopt approved source revision into template | `source-review.js` |
| `GET` | `/api/skills` | Search/list skills with profiles and invocation modes | `skill-management.js` |
| `GET` | `/api/registry/skills` | List latest registry skills | `registry.js` |
| `POST` | `/api/skills/:lineageId/profile` | Update skill profile (title, purpose, review, invoker) | `skill-management.js` |
| `GET` | `/api/skills/:lineageId/notes` | Get scoped notes | `skill-management.js` |
| `POST` | `/api/skills/:lineageId/notes` | Add scoped note | `skill-management.js` |
| `GET` | `/api/skills/:lineageId/feedback` | Get skill feedback | `skill-management.js` |
| `POST` | `/api/skills/:lineageId/feedback` | Record structured feedback | `skill-management.js` |
| `POST` | `/api/projects/:id/activation-plan/preview` | Preview activation operations | `catalog-workflows.js` |
| `POST` | `/api/projects/:id/activation-plan` | Record immutable activation plan | `catalog-state.js` |
| `POST` | `/api/activation-plans/:id/apply` | Apply recorded plan | `upstream-apply.js` |
| `POST` | `/api/activation-plans/:id/apply/stream` | Stream NDJSON execution progress | `upstream-apply.js` |
| `GET` | `/api/activation-plans/:id/observed-state-comparison` | Compare plan against observed disk bindings | `observed-state.js` |
| **`GET`** | **`/api/recipes/export`** | Export template/project as `SkillRecipe` JSON | `recipes.js` |
| **`POST`** | **`/api/recipes/inspect`** | Inspect & validate recipe JSON | `recipes.js` |
| **`POST`** | **`/api/recipes/apply`** | Apply recipe to project target | `recipes.js` |

---

## 5. Frontend Gap Analysis & Requirements Mapping

### 5.1 R1: Recipe Hub & Transfer Workspace Gaps
- **Missing Navigation**: `SideNavigation.tsx` only contains `["Skills", "Templates", "Projects"]`. Needs a 4th tab: `Recipes` (or `Recipe Hub`) with icon (e.g. `Package` or `ChefHat` / `Layers`).
- **Missing Workspace**: `apps/catalog-ui/src/components/RecipeWorkspace.tsx` does not exist.
- **Missing Export Triggers**:
  - Export from Recipe Workspace: Download full catalog or selected template/project recipe.
  - 1-click Export button in `TemplateWorkspace.tsx` (export template to `recipe.json`).
  - 1-click Export button in `ProjectWorkspace.tsx` (export project config to `recipe.json`).
- **Missing Inspect UI**:
  - Drag-and-drop / file upload for `.json` recipe files + raw JSON text paste area.
  - Inspection summary cards: Sources count, total skills count, breakdown by `invocation_mode` (Model-invoked, User-invoked, Hybrid), presets list, target projects.
- **Missing Apply Flow**:
  - Target project selection (existing project or new project path).
  - Assistant provider selection (`Codex` $\rightarrow$ `skills/`, `Antigravity` $\rightarrow$ `.agents/skills/`, `Claude` $\rightarrow$ `.claude/skills/`).
  - Plan preview and single-click apply with confirmation and feedback status.

### 5.2 R2: Workspace Layout & Navigation Modernization Gaps
- **Quick-Filter Toolbars**:
  - `SkillWorkspace.tsx` currently only has text search (`query`). Needs filter chips for `InvocationMode` (`All`, `🤖 Model-invoked / Reflex`, `👤 User-invoked / Command`, `🔀 Hybrid`), review state (`Reviewed`, `Unreviewed`), and provider tags.
  - `TemplateWorkspace.tsx` needs invocation mode filtering and skill counter tags.
- **Layout & Responsiveness**:
  - Consistent modern container sizing, non-wrapping toolbar controls, and clean card/table layouts.

### 5.3 R3: Multi-Provider & Invocation Visual Identity Gaps
- **Provider Badges & Active Delivery Paths**:
  - In `ProjectWorkspace.tsx`, display an active provider pill with delivery path badge: e.g., `Antigravity (.agents/skills/)`, `Codex (skills/)`, `Claude (.claude/skills/)`.
- **Invocation Mode Pills & Tooltips**:
  - Enhance `.invocation-pill` styling with tooltips explaining operational meaning:
    - 🤖 **Model-invoked (Reflex)**: Reached autonomously by agent during reasoning loops.
    - 👤 **User-invoked (Command)**: Reached only on explicit human command (e.g. destructive or adversarial steering).
    - 🔀 **Hybrid**: Autonomous and manual execution permitted.
- **Pristine & Drift State Indicators**:
  - Dedicated badge in header showing project status (`Pristine`, `In Sync`, `Drift Detected`, `Unapplied Edits`).

### 5.4 R4: Real-Time Activation Diagnostics & Progress Gaps
- **5-Step Pipeline Indicator**:
  - Replace simple percentage bar with clear diagnostic step chain:  
    `[ Plan ]` $\rightarrow$ `[ Inspect ]` $\rightarrow$ `[ Preview ]` $\rightarrow$ `[ Materialize ]` $\rightarrow$ `[ Verify ]`  
    showing active spinner on running step, green check on completed steps, red on failure.
- **Actionable Drift Reconciliation**:
  - When `LiveActivationStatus` or `PlanHistory` detects drift (`comparison.in_sync === false`), show a high-visibility warning banner with an actionable `[ Reconcile Drift ]` or `[ Re-apply Plan ]` button.

---

## 6. Recommended Types & Interface Additions for `apps/catalog-ui`

To support R1, R2, R3, and R4, the following types should be added to `apps/catalog-ui/src/types.ts`:

```ts
import type {
  SkillRecipe,
  RecipeSource,
  RecipeSkill,
  RecipePreset,
  RecipeProjectBinding,
} from "@skills-platform/contracts";

export interface RecipeInspectionSummary {
  sources_count: number;
  skills_count: number;
  presets_count: number;
  projects_count: number;
  by_invocation_mode: {
    model_invoked: number;
    user_invoked: number;
    hybrid: number;
    unspecified: number;
  };
  by_artifact_type: Record<string, number>;
}

export interface RecipeInspectionResult {
  valid: boolean;
  recipe_id?: string;
  name?: string;
  description?: string | null;
  created_at?: string;
  issues?: Array<{ field: string; message: string }>;
  summary?: RecipeInspectionSummary;
  sources?: Array<{
    source_id: string;
    type: "git" | "local";
    locator: string;
    resolved_commit?: string;
  }>;
  presets?: Array<{
    id: string;
    name: string;
    version: number;
    skills_count: number;
  }>;
  projects?: RecipeProjectBinding[];
}

export interface RecipeApplyOptions {
  recipe: SkillRecipe | string;
  project_path?: string;
  provider_id?: "codex" | "antigravity" | "claude" | string;
  confirm?: boolean;
}

export interface RecipeApplyResult {
  recipe_id: string;
  name: string;
  sources_imported: Array<{ source_id: string; locator: string; imported_skills: number }>;
  presets_reconciled: Array<{ id: string; matched_skills: number }>;
  delivery?: {
    project_id: string;
    preview?: any;
    report?: any;
    applied: boolean;
    message?: string;
  } | null;
}
```

---

## 7. Verification Results

All packages and workspaces have been verified via direct tool invocations:
- `npm test`: 50 total unit tests passing across all 3 workspaces (`@skills-platform/catalog`: 39 tests, `@skills-platform/contracts`: 6 tests, `@skills-platform/skills-manager-adapter`: 5 tests).
- `npm run check`: TypeScript compiler passes cleanly (`0` errors) across all 4 workspaces (`@skills-platform/catalog`, `@skills-platform/catalog-ui`, `@skills-platform/contracts`, `@skills-platform/skills-manager-adapter`).
