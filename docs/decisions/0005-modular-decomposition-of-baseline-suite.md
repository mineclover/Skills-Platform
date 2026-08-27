# ADR 0005: Modular Decomposition of Baseline Full Suite into Composable Sub-Packages

## Status
Accepted (2026-08-28)

## Context
While `baseline-full-suite` contained all 43 skills from the Bounded Baseline Condenser Suite v0.3.1, delivering it as a single monolithic block introduced severe operational drawbacks:
1. **Context Dilution & Token Overhead**: Loading 43 skill definitions simultaneously consumed massive context budget and created noise.
2. **Domain Interference**: Specialized technical heuristic skills (e.g. `graphics-3d-motion`, `browser-devtools`) interfered with standard web/backend tasks.
3. **Inaccessibility of the H/V Context Engine**: The 13-skill recursive exploration and context building engine was trapped inside the 43-skill monolith, preventing independent on-demand activation.

## Decisions

### 1. Granular Preset Decomposition
Decompose the 43-skill suite into distinct, single-responsibility presets:
- **`condensation-core` (3 skills)**: Ultra-lightweight 80k baseline compiler and reference pack builder.
- **`baseline-curation-core` (11 skills)**: Compiler + 8 core architectural domain reducers.
- **`mlc-recursive-context` (13 skills)**: 4 Base Registries (Element, Topic, Convention, Responsibility) + 9 H/V Exploration and Context Engine skills (Task Router, H-Context, V-Context, Handoff, Separation Validator).
- **`mlc-specialist-domains` (5 skills)**: AI Agent Systems, Browser DevTools, UI Editor, 3D Graphics, Knowledge Publishing.
- **`mlc-toolchain-plane` (6 skills)**: Method Registry, Tool Registry, Toolchain Planner, Invocation Guard, Result Normalizer, Effectiveness Reviewer.
- **`mlc-lifecycle-governance` (8 skills)**: 10-state Case machine, Signal Intake, Validation Gate, Release Stabilization, Closure Learning, Drift Detector, Responsibility Gate, Problem Router.
- **`baseline-full-suite` (43 skills)**: Retained as master bundle for environments requiring full suite access.

### 2. Multi-Scope Dynamic Overlays
Extend project work-scope tags to support fine-grained runtime overlay composition:
- `scope: explore` -> Overlays `mlc-recursive-context` (28 + 13 = 41 skills)
- `scope: specialist` -> Overlays `mlc-specialist-domains` (28 + 5 = 33 skills)
- `scope: curation` -> Overlays `condensation-core` (28 + 3 = 31 skills)
- `scope: architecture` -> Overlays `baseline-curation-core` (28 + 11 = 39 skills)
- `scope: toolchain` -> Overlays `mlc-toolchain-plane` (28 + 6 = 34 skills)
- `scope: governance` -> Overlays `mlc-lifecycle-governance` (28 + 8 = 36 skills)

### 3. Dedicated Portable Recipe Bundles
Generate dedicated single-file JSON recipes for each sub-package (`mlc-recursive-context-recipe.json`, `mlc-specialist-domains-recipe.json`, `mlc-toolchain-recipe.json`, `mlc-governance-recipe.json`, `mlc-full-suite-recipe.json`).

## Consequences
- **Maximum Ergonomics**: Operators and autonomous agents load only the exact skills required for their current phase.
- **Zero Prompt Contamination**: Domain-specific heuristics remain isolated until explicitly engaged.
- **Deterministic Recombination**: Any combination of layers can be composed without collision or drift.
