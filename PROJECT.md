# Project: Skills Platform UI & Recipe Hub Modernization

## Architecture
The Skills Platform web application (`apps/catalog-ui`) is a React 19 + Vite 7 SPA control plane for multi-provider skill management, versioned preset composition, portable skill recipe exchange, and real-time symlink/junction activation across assistant providers (`Antigravity`, `Codex`, `Claude`).

```
                              ┌──────────────────────────────────────────┐
                              │               CatalogApp                 │
                              │           (src/CatalogApp.tsx)           │
                              └────────────────────┬─────────────────────┘
                                                   │
                ┌──────────────────┬───────────────┴───────────────┬──────────────────┐
                ▼                  ▼                               ▼                  ▼
      ┌──────────────────┐ ┌──────────────────┐          ┌──────────────────┐ ┌──────────────────┐
      │  SideNavigation  │ │  ProjectWorkspace│          │  SkillWorkspace  │ │ TemplateWorkspace│
      │(Skills/Templates/│ │ (SkillTable/Grid,│          │(Profile/Notes/   │ │(Preset Composer, │
      │Projects/Recipes) │ │  TemplateInspect)│          │ Feedback/Filters)│ │ Export to Recipe)│
      └──────────────────┘ └─────────┬────────┘          └──────────────────┘ └──────────────────┘
                                     │
                ┌────────────────────┼─────────────────────────────┐
                ▼                    ▼                             ▼
      ┌──────────────────┐ ┌────────────────────────┐    ┌────────────────────────┐
      │ RecipeWorkspace  │ │ ActivationProgressModal│    │  LiveActivationDrawer  │
      │(Export, Dropzone,│ │  (5-Step Pipeline:     │    │(Provider Bindings,     │
      │ Inspect, Apply)  │ │   Plan->Inspect->      │    │ Drift Warning,         │
      │                  │ │   Preview->Mat->Verify)│    │ Reconcile Actions)     │
      └──────────────────┘ └────────────────────────┘    └────────────────────────┘
```

### Module Boundaries
- `apps/catalog-ui/src/api/catalog-api.ts`: HTTP and NDJSON stream communication with `@skills-platform/catalog` backend (`/api/recipes/*`, `/api/projects/*`, `/api/skills/*`, `/api/presets/*`, `/api/activation-plans/*`).
- `apps/catalog-ui/src/types.ts`: Re-exports and UI data models matching `@skills-platform/contracts`.
- `apps/catalog-ui/src/styles.css`: Dark-palette design system with CSS custom properties for invocation modes, provider themes, pristine/drift status, and responsive layouts.
- `apps/catalog-ui/src/components/*`: Component hierarchy for navigation, workspaces, inspection, modals, drawers, and filter toolbars.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| F1 | 1-Click Recipe Export | Browser download of valid `recipe.json` conforming to `@skills-platform/contracts` schema (project/template/catalog scopes) | M1 | ORIGINAL_REQUEST §R1 |
| F2 | Recipe Upload & Drag-and-Drop | File dropzone and JSON paste area for external `recipe.json` files | M1 | ORIGINAL_REQUEST §R1 |
| F3 | Recipe Inspector Panel | Parse recipe JSON and render metrics (sources count, skills breakdown by invocation mode, presets, validation issues) | M1 | ORIGINAL_REQUEST §R1 |
| F4 | Recipe Apply Workflow | Target project and assistant provider selection (`Codex`, `Antigravity`, `Claude`) with live preview and confirmed execution | M1 | ORIGINAL_REQUEST §R1 |
| F5 | Navigation Modernization | Updated `SideNavigation.tsx` with dedicated "Recipes" tab, smooth routing in `CatalogApp.tsx` | M2 | ORIGINAL_REQUEST §R2 |
| F6 | Quick-Filter Toolbars | Responsive filter toolbars across workspaces with invocation mode chips (🤖/👤/🔀/All), provider filters, keyword/tag search | M2 | ORIGINAL_REQUEST §R2 |
| F7 | Table vs Card Grid Views | Streamlined Table and Card view modes in `ProjectWorkspace` and `SkillWorkspace` | M2 | ORIGINAL_REQUEST §R2 |
| F8 | Inline Profile & Note Inspection | Streamlined inline editing for skill profiles, usage notes, and evaluation metadata | M2 | ORIGINAL_REQUEST §R2 |
| F9 | Multi-Provider Badges & Delivery Paths | Visual identity badges for `Codex`, `Antigravity`, `Claude` and active delivery paths (`.agents/skills/`, `skills/`, `.claude/skills/`) | M3 | ORIGINAL_REQUEST §R3 |
| F10 | Invocation Mode Visual Identity & Tooltips | Badges and informative tooltips for 🤖 Model-invoked / Reflex, 👤 User-invoked / Command, 🔀 Hybrid | M3 | ORIGINAL_REQUEST §R3 |
| F11 | Pristine, Dirty, and Drift State Indicators | Visual status pills for Pristine reset baseline, unapplied changes, and drift detection | M3 | ORIGINAL_REQUEST §R3 |
| F12 | 5-Step Activation Stepper Modal | Visual pipeline stepper: `Plan` → `Inspect` → `Preview` → `Materialize` → `Verify` in `ActivationProgressModal.tsx` | M4 | ORIGINAL_REQUEST §R4 |
| F13 | Live Activation Drawer & Drift Reconciliation | Slide-over drawer with provider binding inspector, drift alert banners, and 1-click reconciliation buttons | M4 | ORIGINAL_REQUEST §R4 |
| F14 | Comprehensive Quality Verification | 0 TypeScript errors (`npm run check`), clean production build (`npm run build`), 100% passing tests (`npm test`) | M5 | ORIGINAL_REQUEST §Quality Verification |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Recipe Hub & Transfer Workspace | Implement `RecipeWorkspace.tsx`, API client recipe methods, export triggers, inspect panel, and apply workflow | none | DONE |
| M2 | Workspace Layout & Navigation Modernization | Implement `FilterToolbar.tsx`, modernized `SideNavigation.tsx`, Table/Card views in `ProjectWorkspace` & `SkillWorkspace`, inline editors | M1 | DONE |
| M3 | Multi-Provider & Invocation Visual Identity | Implement provider badges, delivery path pills, invocation mode tooltips, pristine/drift indicators | M2 | DONE |
| M4 | Real-Time Activation Diagnostics & Progress | Implement `ActivationProgressModal.tsx` (5-step stepper), `LiveActivationDrawer.tsx`, and drift reconciliation | M3 | DONE |
| M5 | E2E Testing Suite & Quality Verification | Implement comprehensive test suite in `apps/catalog-ui/test/`, verify `npm run check`, `npm run build`, `npm test` 100% | M4 | DONE |

## Interface Contracts

### 1. Recipe Export & Inspect Contract (`@skills-platform/contracts` & `catalogApi`)
- `exportRecipeApi(params: { projectId?: string; presetId?: string; name?: string; description?: string }): Promise<{ recipe: SkillRecipe }>`
- `inspectRecipeApi(recipe: string | SkillRecipe): Promise<RecipeInspectionResult>`
- `applyRecipeApi(params: { recipe: string | SkillRecipe; projectPath?: string; providerId?: string; confirm?: boolean }): Promise<RecipeApplyResult>`

### 2. Invocation Mode Taxonomy
- `model_invoked`: 🤖 Agent Reflex (Autonomous reasoning routines) — Accent Mint `#63e5c0`
- `user_invoked`: 👤 Explicit Command (Human steering / destructive operations) — Amber `#f1cf86`
- `hybrid`: 🔀 Hybrid (Autonomous + User command) — Violet `#c4a1ff`
- `unspecified`: Default — Gray `#8b949e`

### 3. Provider Delivery Paths
- `antigravity` / `agy` / `gemini` $\rightarrow$ `<project_path>/.agents/skills/`
- `codex` $\rightarrow$ `<project_path>/skills/`
- `claude` $\rightarrow$ `<project_path>/.claude/skills/`

### 4. 5-Stage Activation Progress Pipeline
- Stages: `Plan` (0-20%) $\rightarrow$ `Inspect` (20-40%) $\rightarrow$ `Preview` (40-60%) $\rightarrow$ `Materialize` (60-85%) $\rightarrow$ `Verify` (85-100%) $\rightarrow$ `Completed` (100%).

## Code Layout
```
apps/catalog-ui/
├── package.json                          # Scripts: dev, build, check, test
├── tsconfig.json                         # TypeScript bundler configuration
├── src/
│   ├── main.tsx                          # App root mounting
│   ├── CatalogApp.tsx                    # Top-level state & workspace switching
│   ├── types.ts                          # Re-exports and UI data models
│   ├── styles.css                        # Design system & responsive layout styles
│   ├── api/
│   │   └── catalog-api.ts                # REST endpoints and NDJSON stream reader
│   └── components/
│       ├── SideNavigation.tsx            # Navigation rail (Skills, Templates, Projects, Recipes)
│       ├── FilterToolbar.tsx             # Shared invocation chips, provider filter, search, view toggle
│       ├── RecipeWorkspace.tsx           # Recipe Hub: Export, Upload/Inspect, Apply flow
│       ├── ProjectWorkspace.tsx          # Project policy, table/card views, delivery paths
│       ├── SkillWorkspace.tsx            # Skill profiles, feedback, notes, table/card views
│       ├── TemplateWorkspace.tsx         # Template composition, invocation filters, recipe export
│       ├── ReviewQueue.tsx               # Review alerts & source adoption queue
│       ├── LiveActivationStatus.tsx      # Provider & project binding status cards
│       ├── LiveActivationDrawer.tsx      # Slide-over binding inspector & drift reconciliation
│       └── ActivationProgressModal.tsx   # 5-step visual activation progress stepper
└── test/
    ├── recipes.test.js                   # R1: Recipe export/inspect/apply tests
    ├── navigation-and-filters.test.js    # R2: Layout, navigation, filter chips tests
    ├── visual-identity.test.js           # R3: Invocation badges, delivery paths, drift badges tests
    └── diagnostics-and-stream.test.js    # R4: 5-step progress, stream reader, drift reconciliation tests
```
