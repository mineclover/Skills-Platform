# Skills Usage Guide

For guidance on authoring or revising a skill, start with the
[skill authoring reference catalog](./skill-authoring-reference-catalog.md).
This guide covers importing, reviewing, selecting, and delivering skills through Skills Platform as a **Maintenance Control Plane (MLC)**.

---

## 1. Core Layering & Principles

Skills Platform manages **intent & governance**: which immutable skill revisions are approved, selected for a project, and active for a given work scope. The adapter manages **delivery**: atomic materialization of symlinks/junctions into target assistant paths (**Antigravity**, **Codex**, **Claude**).

```text
Source Review -> Catalog Registry -> Preset / Project Policy -> Dynamic Work-Scope Overlay
                                      -> Immutable Activation Plan
                                      -> CLI / Adapter -> Verified Junctions at Provider Roots
```

---

## 2. Active Presets & Curated Tooling Inventory

| Preset ID | Category | Skills Count | Primary Purpose |
|---|---|:---:|---|
| **`paperthin-reflexes`** | Core Coding Baseline | 28 | Daily coding, refactoring, safety checks, and autonomous agent reflexes. |
| **`condensation-core`** | Context Compiler | 3 | Ultra-lightweight 80k canonical baseline compilation (bounded-baseline-condenser, domain-router, reference-pack-builder). |
| **`baseline-curation-core`** | Deep Architecture | 11 | Full 8-domain architectural reduction and spec reconciliation. |
| **`mlc-toolchain-plane`** | Tool & Capability Layer | 6 | Method registry, toolchain planner, invocation guard, and result normalizer. |
| **`mlc-lifecycle-governance`** | Lifecycle & Governance | 8 | 10-state Maintenance Case machine, signal intake, and responsibility gates. |
| **`baseline-full-suite`** | Full Control Plane | 43 | Complete recursive H/V context exploration, element registries, and maintenance lifecycle. |
| **`builtin-pristine`** | Clean Slate Baseline | 0 | Unlinks all managed skills, returning the project to a pristine zero-skill state. |

---

## 3. Dynamic Work-Scope Overlays (On-Demand Activation)

Instead of modifying the project default pinned preset, apply transient work-scope overlays:

```bash
# 1. Activate Curation overlay (paperthin-reflexes 28 + condensation-core 3 = 31 skills)
node apps/skills-catalog/src/cli.js project apply skills-platform-antigravity --work-scope curation --confirm

# 2. Activate Architecture overlay (paperthin-reflexes 28 + baseline-curation-core 11 = 39 skills)
node apps/skills-catalog/src/cli.js project apply skills-platform-antigravity --work-scope architecture --confirm

# 3. Return to standard development baseline (28 skills)
node apps/skills-catalog/src/cli.js project apply skills-platform-antigravity --confirm

# 4. Clean Slate Reset (0 skills, leaves unmanaged directories intact)
node apps/skills-catalog/src/cli.js project apply skills-platform-antigravity --preset builtin-pristine --confirm
```

---

## 4. Portable Skill Recipes (`recipe.json`)

Distribute reproducible skill environments across different machines using single-file declarative recipes:

```bash
# Export a preset to a portable recipe JSON
node apps/skills-catalog/src/cli.js recipe export --preset condensation-core --out condensation-recipe.json

# Inspect a downloaded recipe
node apps/skills-catalog/src/cli.js recipe inspect condensation-recipe.json

# Apply recipe on a new machine / project with 1 command
node apps/skills-catalog/src/cli.js recipe apply condensation-recipe.json --project-path . --provider antigravity --confirm
```

---

## 5. Web UI Workspaces (`apps/catalog-ui`)

Run the development UI to manage skills visually:

```bash
# Start catalog API server
node apps/skills-catalog/src/cli.js serve

# Start Web UI (http://localhost:5173)
npm run --workspace @skills-platform/catalog-ui dev
```

- **Skills Workspace**: Inspect immutable profiles, toggle model reflex vs user command modes, view usage notes and feedback health.
- **Templates Workspace**: Edit preset skill memberships with bulk select/deselect, export 1-click recipes.
- **Projects Workspace**: Select projects, switch work scopes (curation, architecture, planning, implementation, review), preview effective sets, and trigger 5-stage activation streams.
- **Recipes Hub**: 1-click download, drag-and-drop recipe inspector, and multi-provider target installer.
- **Live Activation Drawer**: Inspect real-time binding drift and trigger 1-click reconciliation.
