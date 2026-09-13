# Project: Skills-Platform Open Composability Substrate & Community Recipes

> This is the Open Composability Substrate feature specification, architecture, and milestone record.  
> For the platform's user entry point, read [README](./README.md), the [usage guide](./docs/skills-usage.md), the [installation guidebook](./docs/guides/skills-installation-guide.md), and the [community recipes guide](./recipes/README.md).

---

## Architecture

The Skills Platform is transitioning from an initial framing that emphasized a single prescriptive maintenance architecture into an **Open Composability Substrate (개방형 조합 프레임워크)**. Rather than treating specific suites (such as Modular Lifecycle Context - MLC or 10-state case governance) as monolithic mandatory control planes, the platform treats all presets and recipes as **modular, loosely coupled, and community-extensible building blocks**.

```text
                               +-----------------------------------+
                               |    @skills-platform/contracts     |
                               |  - SkillRecipe & Preset Interface |
                               |  - Discovery Facets Taxonomy      |
                               |  - ProcedureWorkspace Contracts   |
                               +-----------------+-----------------+
                                                 |
                   ┌─────────────────────────────┴─────────────────────────────┐
                   ▼                                                           ▼
+---------------------------------------+                   +---------------------------------------+
|  apps/skills-catalog/                 |                   |  recipes/                             |
|  - Preset & Catalog Engine            |                   |  - index.json (Catalog Manifest)      |
|  - Dynamic Overlays (--work-scope)    | ◄─ (Composability)─|  - README.md (Authoring Guide)        |
|  - Priority Resolution (selectedByLineage)               |  - Tier 1: Platform Core (Facet 1)    |
|  - Portable Recipe Export / Inspect   |                   |  - Tier 2: Procedure Loops (Facet 2)  |
|  - Procedure Workspace Lifecycle      |                   |  - Tier 3: MLC Reference (Facet 3)    |
|  - Sequential Merge Queue             |                   |  - Tier 4: Ecosystem & Community (4)  |
+-------------------+-------------------+                   +-------------------+-------------------+
                    |                                                           |
                    └─────────────────────────────┬─────────────────────────────┘
                                                  ▼
                                +-----------------------------------+
                                |  Target Multi-Provider Deliveries |
                                |  - Google Antigravity (.agents/)  |
                                |  - OpenAI Codex (.agents/skills)  |
                                |  - Anthropic Claude (.claude/)    |
                                +-----------------------------------+
```

### Key Principles:
1. **Autonomous Project Composition**: Projects freely choose their default baseline preset and combine specialized skills according to their unique development philosophy and toolchain.
2. **Optional Reference Templates**: Architectures such as Modular Lifecycle Context (MLC) and 3-phase lifecycle loops are provided as modular, battle-tested reference suites; adopting them is 100% opt-in.
3. **Discovery Facets (Tiers 1–4)**: Tier 1–4 in `recipes/index.json` represent multi-dimensional taxonomy lenses for discovering recipes by concern, not a rigid enforcement hierarchy.
4. **Loose Coupling & Dynamic Overlays**:
   - `role: "default"`: Exactly one baseline preset per project.
   - `role: "recommended"`: Advisory record only, zero auto-activation.
   - `role: "work_scope_overlay"`: Dynamic injection activated only when explicit matching `--work-scope <tag>` flags are requested.
5. **Deterministic Priority Resolution**: Overlays merge with numeric priority ordering, cleanly replacing conflicting skills by `lineage_id` while performing additive non-conflicting union.

---

## Feature Inventory

Every feature from the survey and requirements is assigned to a milestone:

| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Preset Descriptions & Manifest Reframing | Reframe rigid control-plane wording into Optional Reference Templates and Discovery Facets in `recipes/index.json`, `catalog.json`, and `MASTER_BASELINE.md` | M1 | ORIGINAL_REQUEST §R1 |
| 2 | Community Recipes & Extensible Presets Guide | Comprehensive authoring guide in `recipes/README.md` and `docs/guides/community-recipes-and-presets.md` | M2 | ORIGINAL_REQUEST §R2 |
| 3 | Metadata & Loose Coupling Alignment | Clarify `recommended` and `work_scope_overlay` roles and priority semantics across catalog and docs | M3 | ORIGINAL_REQUEST §R3 |
| 4 | Verification & Zero Regression Gate | Full validation across `preset list`, `npm run check`, `npm test`, and `node tests/e2e/run-all.js` | M4 | ORIGINAL_REQUEST §R4 |
| 5 | Procedure Workspaces Contracts | `ProcedureWorkspace`, `ProcedureType`, and `ResponsibilityInvariants` interface definitions | Core | Workspace Feature |
| 6 | Git Worktree Lifecycle Engine | `spawnProcedureWorkspace` creates `.workspaces/<task_id>` on isolated `worktree/<task_id>` branch | Core | Workspace Feature |
| 7 | Sequential Merge Orchestrator | Dependency-ordered queue with 1:1 target test verification gate and atomic fast-forward merge | Core | Workspace Feature |

---

## Milestones

| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Manifest & Documentation Diversity Reframing | `recipes/index.json`, `catalog.json`, `MASTER_BASELINE.md`, `docs/architecture.md`, `docs/guides/control-plane-and-flow-studio-guide.md` | Baseline | DONE |
| M2 | Community Recipes Guide Authoring | `recipes/README.md`, `docs/guides/community-recipes-and-presets.md` | Baseline | DONE |
| M3 | Metadata & Loose Coupling Alignment | `recipes/index.json`, `catalog.json` role descriptions | M1 | DONE |
| M4 | Complete Verification & Zero Regression Gate | `preset list`, `npm run check`, `npm test`, `tests/e2e/run-all.js` | M1, M2, M3 | IN_PROGRESS |

---

## Interface Contracts

### 1. Preset Listing Invariant
`node apps/skills-catalog/src/cli.js preset list` returns a valid JSON array containing all 18 registered presets.

### 2. Root Symlink Invariant
All 16 root symlinks (`*-recipe.json`) remain intact and resolve to their respective targets in `recipes/tier*/`.

### 3. Recipe Schema Invariant
All recipes satisfy `validateSkillRecipe` from `@skills-platform/contracts` with `RECIPE_SCHEMA_VERSION = 1`.

### 4. Master Baseline Invariant
`MASTER_BASELINE.md` heading matches `/#\s*master_?baseline/i` on Line 1, and total character length remains strictly under 50,000 characters.

### 5. Test Suite Invariant
Zero regressions across the entire test suite: 0 errors on `npm run check`, 100% pass on all unit tests (`npm test`), and 100% pass on all 50 E2E test suites (`node tests/e2e/run-all.js`).

---

## Code Layout

```
Skills-Platform/
├── package.json
├── PROJECT.md                                # Project architecture & milestones
├── MASTER_BASELINE.md                        # Platform baseline & reference model
├── recipes/
│   ├── index.json                            # Machine-readable catalog index manifest (4 Facets)
│   ├── README.md                             # Community recipes & extensible presets guide
│   ├── tier1-platform-core/                  # Discovery Facet 1: Platform Core
│   ├── tier2-procedure-loops/                # Discovery Facet 2: Procedure Loops
│   ├── tier3-mlc-architecture/               # Discovery Facet 3: MLC Reference Architecture
│   └── tier4-ecosystem/                      # Discovery Facet 4: Ecosystem & Community
├── docs/
│   ├── architecture.md                       # Substrate architecture overview
│   └── guides/
│       ├── community-recipes-and-presets.md  # Deep dive community presets guide
│       ├── control-plane-and-flow-studio-guide.md
│       ├── loop-types-and-skill-presets-matrix.md
│       └── recommended-skillsets-guide.md
├── packages/
│   ├── skill-contracts/                      # Recipe, preset, and workspace contracts
│   └── skills-manager-adapter/               # Delivery symlink/copy adapter
├── apps/
│   ├── skills-catalog/                       # CLI, REST API, recipe & preset engine
│   └── catalog-ui/                           # React Flow Studio & visual inspector
└── tests/
    └── e2e/                                  # 5-Tier E2E test suite (50 test files)
```
