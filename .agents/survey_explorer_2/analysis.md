# UI Architecture Survey & Analysis Report

**Target Application**: `apps/catalog-ui`
**Author**: survey_explorer_2
**Date**: 2026-08-27
**Status**: Comprehensive Analysis Complete

---

## 1. Executive Summary

This report delivers a comprehensive architectural survey of `apps/catalog-ui` within the Skills Platform monorepo, analyzing existing workspaces, component hierarchies, state flows, styling systems, and technical gaps against the modernization requirements (R1–R4).

The catalog web application is built with **React 19**, **TypeScript 5.8**, **Vite 7**, and **lucide-react**, interfacing with `@skills-platform/contracts` and the `@skills-platform/catalog` backend server. While the existing UI provides functional implementations for project effective sets, skill metadata, template composition, and review queues, significant modernization is required to establish a dedicated **Recipe Hub (R1)**, responsive **Quick-Filter & Multi-View Layouts (R2)**, rich **Invocation & Multi-Provider Visual Identity (R3)**, and a **5-Step Real-time Activation Diagnostics Modal & Drawer (R4)**.

---

## 2. Current UI Architecture & Workspace Analysis

### 2.1 File Map & Responsibilities

| File Path | Primary Responsibility | Key Sub-components / Hooks |
|---|---|---|
| `apps/catalog-ui/src/main.tsx` | Application entry point | Mounts `<CatalogApp />` into `#root` |
| `apps/catalog-ui/src/CatalogApp.tsx` | Root container & state orchestrator | Manages `activePage`, project/preset selection, API synchronization, global banner notifications |
| `apps/catalog-ui/src/api/catalog-api.ts` | Backend integration & streaming client | `catalogApi` endpoint base, `readApplyStream` (NDJSON stream reader), `copyText` |
| `apps/catalog-ui/src/types.ts` | UI state types & contracts re-exports | `DisplaySkill`, `CatalogSkill`, `RemoteSet`, `ApplyProgress`, `ReviewItem`, `UpstreamStatus` |
| `apps/catalog-ui/src/styles.css` | Global styling & design system | Custom CSS variables, dark palette (`#0d1117`, `#63e5c0`, `#f1cf86`), responsive media queries |
| `apps/catalog-ui/src/components/SideNavigation.tsx` | App shell navigation rail | `SideNavigation`, `AppIcon` (`Skills`, `Templates`, `Projects`, `Settings`) |
| `apps/catalog-ui/src/components/ProjectWorkspace.tsx` | Project policy & effective set workspace | `SkillTable`, `TemplateInspector`, `ApplyProgressView`, `PlanHistory` |
| `apps/catalog-ui/src/components/SkillWorkspace.tsx` | Skill management & evidence workspace | Managed skill list, profile editor, feedback form, usage notes, evaluation summary |
| `apps/catalog-ui/src/components/TemplateWorkspace.tsx` | Versioned template composer | Template picker, template creator, skill membership checkboxes |
| `apps/catalog-ui/src/components/ReviewQueue.tsx` | Review signals & source revision adoption | `ReviewQueue`, `SourceChangeQueue` (candidate review & preset adoption) |
| `apps/catalog-ui/src/components/LiveActivationStatus.tsx` | Upstream provider & binding inspection | `LiveActivationStatus`, `LiveStatusCard` (global & project binding status) |

---

### 2.2 Existing Workspace Deep-Dive

#### A. ProjectWorkspace (`ProjectWorkspace.tsx`)
- **Structure**:
  - `SkillTable`: Renders table of effective skills with status (`Selected` / `Disabled`), source template, resolution reason, and basic invocation pills (`👤 User`, `🤖 Model`, `🔀 Hybrid`).
  - `TemplateInspector`: Right-side inspector controlling default template pinning, work-scope overlay assignment, plan preview (`previewPlan`), apply execution (`applyPlan`), prompt copying (`copySystemPrompt`), and pristine reset (`togglePristine`).
  - `ApplyProgressView`: Linear progress bar calculating percentages across stages (`inspect`, `resolve`, `preview`, `apply`, `verify`, `completed`, `failed`).
  - `PlanHistory`: Bottom strip displaying the most recent activation plan id, mode, summary, and comparison sync status (`in_sync` vs `drift`).
- **Limitations**:
  - Fixed table-only view; no card grid view.
  - No provider-level delivery path indicators (e.g. `.agents/skills/` vs `skills/`).
  - No interactive filter toolbar to filter by invocation mode or provider.
  - Progress view is cramped inside the inspector sidebar rather than a rich modal/drawer.

#### B. SkillWorkspace (`SkillWorkspace.tsx`)
- **Structure**:
  - Split 2-column layout: Left column lists managed skills; Right column displays the selected skill's profile editor, feedback health history, revision evaluation stats, and usage notes with system prompt injection toggles.
  - Simple keyword search input (`query`) searching skill names, summaries, purpose, and tags.
- **Limitations**:
  - Lacks structured invocation mode filter chips (`🤖 Model`, `👤 User`, `🔀 Hybrid`) and provider filters.
  - Fixed list layout without a card grid view.
  - Profile editing requires scrolling down multiple stacked forms without quick modal/drawer tabs.

#### C. TemplateWorkspace (`TemplateWorkspace.tsx`)
- **Structure**:
  - Template dropdown selector and "New template" workflow.
  - Checkbox list of all registry skills to include/exclude.
  - Automatic version incrementing (`v+1`) upon saving.
- **Limitations**:
  - No quick filters (by invocation mode, provider, or category).
  - No 1-click export of a template directly as a reusable recipe.

#### D. ReviewQueue & SourceChangeQueue (`ReviewQueue.tsx`)
- **Structure**:
  - `ReviewQueue`: Lists policy review warnings with severity indicators (`critical`, `high`, `medium`, `low`).
  - `SourceChangeQueue`: Surfaces imported Git revisions, allowing decision logging (`approved` / `rejected`) and adoption into presets.
- **Limitations**:
  - Rendered inline below other workspaces rather than having dedicated visual cues and badges.

#### E. LiveActivationStatus (`LiveActivationStatus.tsx`)
- **Structure**:
  - Dual status cards for **Global activation** and **Selected project activation**.
  - Displays detected providers, counts (enabled, disabled, attention), and binding lists with state pills (`enabled`, `disabled`, `missing`, `conflict`, `unavailable`).
- **Limitations**:
  - Static inline layout; lacks an interactive slide-over drawer with full search, binding filtering, and one-click reconciliation actions.

---

### 2.3 State Management & Data Flow

- **Current Mechanism**:
  - Direct state lifting in `CatalogApp.tsx` using standard React hooks (`useState`, `useEffect`, `useCallback`, `useMemo`).
  - REST requests via `fetch` against `catalogApi` (`http://127.0.0.1:4300` or configured base URL).
  - Streaming updates for apply execution via `readApplyStream` parsing NDJSON events (`type: "progress" | "result" | "error"`).
- **Evaluation**:
  - State management is lightweight, clean, and avoids third-party dependencies (Zustand/Redux not needed; React 19 built-in hooks and Contexts are ideal).
  - For complex modals, drawers, and recipe management, introducing modular sub-components and custom hooks keeps components clean and testable.

---

### 2.4 Styling & Design System (`styles.css`)

- **Palette & Tokens**:
  - Canvas / Background: `#0d1117` with radial gradient `#12212a`.
  - Panels / Cards: `#0a1016`, `#101920`, `#17252e`.
  - Accent Mint (Primary / Success / Model): `#63e5c0`, border `#2e7d69`, bg `rgb(99 229 192 / 0.12)`.
  - Amber (User / Warning / Drift): `#f1cf86`, border `#705c32`, bg `rgb(241 207 134 / 0.12)`.
  - Violet (Hybrid): `#c4a1ff`, border `rgb(196 161 255 / 0.35)`, bg `rgb(196 161 255 / 0.12)`.
  - Coral / Red (Critical / Problem): `#f18787`, border `#7f4242`.
  - Typography: System sans-serif / Inter with responsive sizing and clean letter spacing.
- **Responsive Behavior**:
  - Breakpoint at `1040px` collapsing sidebar into compact mode.
  - Container layouts must be refined to guarantee zero layout shifts, proper horizontal overflow prevention (`overflow-x: hidden`), and clean flex-wrap behavior on all standard resolutions (1080p, 1440p, laptop screens).

---

## 3. Gap Analysis against Requirements (R1 – R4)

### Requirement R1: Recipe Hub & Transfer Workspace
| Capability | Current Status | Required Enhancement |
|---|---|---|
| **Recipe Navigation** | Missing in `SideNavigation` | Add `Recipes` item with `BookOpen` / `FileCode` icon in `SideNavigation.tsx` |
| **Recipe Export** | No UI export flow | Add 1-click "Export Recipe" button triggering browser JSON download conforming to `@skills-platform/contracts` `SkillRecipe` schema (with scope selection: Project, Template, or All) |
| **Recipe Upload & Dropzone** | No upload UI | Implement drag-and-drop zone, file selector, and JSON text paste area |
| **Recipe Inspector** | No inspector panel | Build Inspector panel parsing `recipe.json`, displaying summary metrics (sources count, skills breakdown by invocation mode 🤖/👤/🔀, presets breakdown, project bindings, validation issues) |
| **Recipe Apply Flow** | No apply UI | Implement project target selector, assistant provider selector (`Codex`, `Antigravity`, `Claude`), live preview modal, and confirmed apply execution invoking `/api/recipes/apply` |

### Requirement R2: Workspace Layout & Navigation Modernization
| Capability | Current Status | Required Enhancement |
|---|---|---|
| **Quick-Filter Toolbars** | Basic text search only | Add responsive filter toolbars in `SkillWorkspace`, `TemplateWorkspace`, and `ProjectWorkspace` with invocation mode chips (🤖 Model / 👤 User / 🔀 Hybrid / All), provider filters, and tag search |
| **Table vs Card Views** | Fixed list/table only | Add view mode toggle (`Table` vs `Card Grid`) with smooth transition in `SkillWorkspace` and `ProjectWorkspace` |
| **Inline Profile & Note Editing** | Full page scroll only | Streamline inline profile editor, note inspector, and quick actions |
| **Layout & Screen Scaling** | Minor overflow on narrow screens | Responsive grid layouts with container queries and fluid sizing |

### Requirement R3: Multi-Provider & Invocation Visual Identity
| Capability | Current Status | Required Enhancement |
|---|---|---|
| **Invocation Badges & Tooltips** | Basic pill text only | Rich badges with icons (🤖 Model / Reflex, 👤 User / Command, 🔀 Hybrid) and tooltips explaining activation mechanism |
| **Assistant Provider Badges** | Missing | Explicit badges for `Codex`, `Antigravity`, and `Claude` |
| **Active Delivery Paths** | Missing | Explicit path pills (e.g. `.agents/skills/<name>` for Antigravity vs `skills/<name>` for Codex) |
| **Pristine & Drift State Indicators** | Partial text in history | Prominent status badges (`Pristine Baseline`, `In Sync`, `Drift Warning`) with detailed hover tooltips |

### Requirement R4: Real-time Activation Diagnostics & Progress
| Capability | Current Status | Required Enhancement |
|---|---|---|
| **5-Step Visual Stepper** | Basic percentage track | Clean visual 5-step stepper: `Plan` → `Inspect` → `Preview` → `Materialize` → `Verify` with active, completed, and error states |
| **Activation Drawer & Modal** | Fixed sidebar widget | Full interactive Activation Drawer and Progress Modal with step-by-step operation logs |
| **Drift Warnings & Reconciliation** | Read-only card only | Drift alert banner with actionable buttons ("Reconcile Drift", "Re-apply Baseline", "View Drift Details") |

---

## 4. Proposed Technical Architecture & Design

### 4.1 Component Architecture Hierarchy

```
CatalogApp (src/CatalogApp.tsx)
├── SideNavigation (src/components/SideNavigation.tsx) [Skills | Templates | Projects | Recipes]
├── Topbar (Header, Project Selector, Scope Selector, Global Status Pills)
├── Workspace Switcher:
│   ├── RecipeWorkspace (src/components/RecipeWorkspace.tsx) [NEW]
│   │   ├── RecipeHeader & TabBar (Hub / Inspector / Export / Apply)
│   │   ├── RecipeDropzone & PasteArea
│   │   ├── RecipeInspectorPanel (Summary metrics, Invocation breakdown, Presets, Sources)
│   │   ├── RecipeExportModal (Scope selector, Metadata inputs, Live JSON preview, Download button)
│   │   └── RecipeApplyModal (Project target, Provider selector, Live preview, Confirmed execute)
│   ├── ProjectWorkspace (src/components/ProjectWorkspace.tsx) [MODERNIZED]
│   │   ├── FilterToolbar (Invocation chips 🤖/👤/🔀, Provider select, Search, Table/Card toggle)
│   │   ├── SkillTable (Table view with Delivery path pills, Invocation badges)
│   │   ├── SkillCardGrid (Card view with rich metadata, delivery paths, status)
│   │   ├── TemplateInspector (Pinned default, Work-scope overlay, Provenance)
│   │   ├── PlanHistory (Comparison sync/drift badges, recent runs)
│   │   └── LiveActivationStatus (Global & Project cards, Binding drift warnings)
│   ├── SkillWorkspace (src/components/SkillWorkspace.tsx) [MODERNIZED]
│   │   ├── FilterToolbar (Invocation chips, Review state, Search, Table/Card toggle)
│   │   ├── ManagedSkillList / ManagedSkillGrid
│   │   └── SkillDetailPanel (Profile editor, Feedback health, Evaluation stats, Scoped notes)
│   ├── TemplateWorkspace (src/components/TemplateWorkspace.tsx) [MODERNIZED]
│   │   ├── TemplateHeader & Actions (New template, Export as recipe)
│   │   ├── FilterToolbar (Invocation chips, Search)
│   │   └── TemplateSkillList (Skill membership selection with Invocation/Provider badges)
│   └── ReviewQueue & SourceChangeQueue (src/components/ReviewQueue.tsx)
└── Modals & Drawers:
    ├── ActivationProgressModal (src/components/ActivationProgressModal.tsx) [NEW: 5-step stepper]
    └── LiveActivationDrawer (src/components/LiveActivationDrawer.tsx) [NEW: Detailed binding inspector & drift reconciliation]
```

---

### 4.2 API Integration Extensions (`src/api/catalog-api.ts`)

Add dedicated recipe client methods:
```ts
export async function exportRecipeApi(params: {
  projectId?: string;
  presetId?: string;
  name?: string;
  description?: string;
}): Promise<{ recipe: SkillRecipe }> {
  const query = new URLSearchParams();
  if (params.projectId) query.set("project_id", params.projectId);
  if (params.presetId) query.set("preset_id", params.presetId);
  if (params.name) query.set("name", params.name);
  if (params.description) query.set("description", params.description);
  const response = await fetch(`${catalogApi}/api/recipes/export?${query}`);
  if (!response.ok) throw new Error("Failed to export recipe");
  return response.json();
}

export async function inspectRecipeApi(recipeContent: string | SkillRecipe): Promise<RecipeInspectionResult> {
  const response = await fetch(`${catalogApi}/api/recipes/inspect`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ recipe: recipeContent }),
  });
  if (!response.ok) throw new Error("Failed to inspect recipe");
  return response.json();
}

export async function applyRecipeApi(params: {
  recipe: string | SkillRecipe;
  projectPath?: string;
  providerId?: string;
  confirm?: boolean;
}): Promise<RecipeApplyResult> {
  const response = await fetch(`${catalogApi}/api/recipes/apply`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      recipe: params.recipe,
      project_path: params.projectPath,
      provider_id: params.providerId,
      confirm: params.confirm === true,
    }),
  });
  if (!response.ok) throw new Error("Failed to apply recipe");
  return response.json();
}
```

---

### 4.3 Design System & Theme Enhancements (`src/styles.css`)

1. **Quick-Filter Chips & Toolbar**:
   - Filter chips `.filter-chip` with hover, active, and focus states.
   - Distinctive colors for Invocation modes: 🤖 Mint (`#63e5c0`), 👤 Amber (`#f1cf86`), 🔀 Purple (`#c4a1ff`).
   - View mode toggle `.view-toggle` (Table vs Grid icons).
2. **Provider & Delivery Path Badges**:
   - `.provider-badge` with provider branding:
     - Antigravity: `.badge-antigravity` + delivery path `.delivery-path` (`.agents/skills/...`).
     - Codex: `.badge-codex` + delivery path `skills/...`.
     - Claude: `.badge-claude` + delivery path `.claude/...`.
3. **Pristine, Dirty, and Drift Indicators**:
   - `.badge-pristine`, `.badge-insync` (green/mint).
   - `.badge-drift` (amber warning with pulse dot).
   - `.badge-dirty` (blue / unapplied change).
4. **5-Step Activation Stepper**:
   - `.activation-stepper` with 5 circular nodes connected by progress tracks:
     `Plan (Record)` → `Inspect (Preflight)` → `Preview` → `Materialize (Apply)` → `Verify`.
   - Active spinning indicator, completed checkmark, failed exclamation.
5. **Modal & Drawer Overlays**:
   - `.modal-backdrop`, `.modal-content` with smooth entrance fade/scale.
   - `.drawer-overlay`, `.drawer-content` sliding from right with clean backdrop blur.

---

## 5. Implementation Roadmap & Verification Plan

### Phase 1: Contracts & API Client Layer
- Re-export recipe contracts in `src/types.ts`.
- Add `exportRecipeApi`, `inspectRecipeApi`, and `applyRecipeApi` to `src/api/catalog-api.ts`.
- Verify client-side fallback handling when `catalogApi` is running in demo/offline mode.

### Phase 2: Recipe Hub & Transfer Workspace (R1)
- Create `src/components/RecipeWorkspace.tsx` with:
  - Export Recipe panel with scope selection and instant `.json` download.
  - Dropzone, file picker, and JSON paste inspector.
  - Metrics overview (sources, skills by invocation mode, presets, projects).
  - Apply workflow with project target selection, provider choice (`Codex`, `Antigravity`, `Claude`), live preview, and confirmed execution.
- Add `Recipes` navigation item in `SideNavigation.tsx`.

### Phase 3: Layout, Navigation & Filter Modernization (R2)
- Implement `FilterToolbar` component with invocation chips (🤖/👤/🔀), provider selector, search bar, and Table/Card toggle.
- Integrate `FilterToolbar` into `ProjectWorkspace`, `SkillWorkspace`, and `TemplateWorkspace`.
- Implement `SkillCardGrid` card view for `ProjectWorkspace` and `SkillWorkspace`.
- Streamline inline profile and note editing.

### Phase 4: Visual Badges, Delivery Paths & Drift Diagnostics (R3 & R4)
- Add delivery path badges (`.agents/skills/` vs `skills/`) in skill rows and cards.
- Add pristine/dirty/drift visual pills with hover tooltips.
- Create `src/components/ActivationProgressModal.tsx` with 5-step stepper (`Plan` → `Inspect` → `Preview` → `Materialize` → `Verify`).
- Create `src/components/LiveActivationDrawer.tsx` with full provider binding inspection, drift alerts, and one-click reconciliation buttons.

### Phase 5: Verification & Quality Assurance
- Run `npm run check` across all workspaces to guarantee 0 TypeScript errors.
- Run `npm run build` to ensure clean production bundle in `apps/catalog-ui/dist`.
- Run `npm test` across all workspaces to guarantee 100% test pass rate.
