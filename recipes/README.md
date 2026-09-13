# Skills Platform Recipes & Extensible Presets Guide

> **Welcome to the Skills Platform Open Composability Substrate!**  
> Presets and recipes in Skills Platform are not rigid corporate dogmas or monolithic enforcement planes. They are modular, loosely coupled, and community-driven building blocks designed to adapt to your project's unique philosophy, architecture, and toolchain needs.

---

## Table of Contents

1. [Core Philosophy: Open Composability Substrate](#1-core-philosophy-open-composability-substrate)
2. [Catalog Discovery Facets (Tiers 1–4)](#2-catalog-discovery-facets-tiers-14)
3. [Quick Start: Inspecting & Applying Recipes](#3-quick-start-inspecting--applying-recipes)
4. [Creating Custom Presets with the CLI](#4-creating-custom-presets-with-the-cli)
5. [Exporting Shareable Community Recipes](#5-exporting-shareable-community-recipes)
6. [Loose Coupling & Dynamic Overlays (`--work-scope`)](#6-loose-coupling--dynamic-overlays---work-scope)
7. [Priority Resolution & Collision Handling](#7-priority-resolution--collision-handling)
8. [Lean Recipe Design Patterns](#8-lean-recipe-design-patterns)
9. [Packaging, Distribution & Git Sources](#9-packaging-distribution--git-sources)
10. [Community Contribution & Review Checklist](#10-community-contribution--review-checklist)
11. [Cross-Documentation Reference](#11-cross-documentation-reference)

---

## 1. Core Philosophy: Open Composability Substrate

Skills Platform embraces a fundamental shift: **there is no single canonical answer or mandatory control plane for all agent workflows.**

- **Autonomous Composition**: Every engineering team, open-source project, or individual developer has different constraints. Some teams prefer strict, formal multi-phase governance; others want a lean, flat TDD setup with 2 core skills; others require specialized design, documentation, or debugging tools.
- **Optional Reference Templates**: Architectures such as Modular Lifecycle Context (MLC), 10-state case machines, or 3-phase lifecycle loops are provided as comprehensive, battle-tested **reference templates (Optional Reference Suites)**. They serve as valuable inspiration and modular building blocks, but adopting them is entirely opt-in.
- **Loose Coupling First**: Presets can be combined, stacked, overridden, or adopted standalone without taking on monolithic dependencies.

---

## 2. Catalog Discovery Facets (Tiers 1–4)

Rather than representing a hierarchical ladder of enforcement, the 4 tiers in `recipes/index.json` serve as **Discovery Facets (카탈로그 탐색 패싯)**—navigational lenses to help you find the right building blocks:

```text
[ Skills Platform Catalog Discovery Facets ]
  ├── Facet 1: Foundation & Platform Core (Tier 1)
  │     ↳ Foundational authoring guidelines, optional debugging recommendations, baseline setups.
  ├── Facet 2: Lifecycle Procedure Loops (Tier 2)
  │     ↳ Composable operational workflows (Plan, Inner-Loop TDD, Release Gate).
  ├── Facet 3: Modular Architecture & Context Engines (Tier 3)
  │     ↳ MLC reference components: 80k baseline condensation, recursive exploration, domain overlays.
  └── Facet 4: Multi-Provider & Community Ecosystems (Tier 4)
        ↳ Paperthin reflex bundles, Antigravity native worktrees, Codex & Community suites.
```

### Facet Matrix

| Facet | Directory | Nature | Recommended When |
|---|---|---|---|
| **Facet 1: Platform Core** | `recipes/tier1-platform-core/` | Foundational | Authoring new skills, configuring baseline projects, or diagnosing bugs. |
| **Facet 2: Procedure Loops** | `recipes/tier2-procedure-loops/` | Operational | Structuring work into explicit outer-loop PRD planning, inner-loop TDD, and release verification. |
| **Facet 3: MLC Architecture** | `recipes/tier3-mlc-architecture/` | Reference Architecture | Managing complex, long-running systems that benefit from 80k context condensation and structured case governance. |
| **Facet 4: Ecosystem & Community** | `recipes/tier4-ecosystem/` | Autonomous & Multi-Provider | Leveraging provider-native workflows (Antigravity worktrees), high-density coding reflexes (Paperthin), or community toolsets. |

---

## 3. Quick Start: Inspecting & Applying Recipes

The `skills-catalog` CLI provides built-in commands to validate and install any recipe file.

### 3.1 Inspecting a Recipe
Before applying a recipe, inspect its schema validity, skill counts, and safety telemetry:

```bash
node apps/skills-catalog/src/cli.js recipe inspect recipes/tier4-ecosystem/community-dev-recipe.json
```

Output highlights:
```json
{
  "valid": true,
  "recipe_id": "mlc-community-dev-suite",
  "name": "Community & Codex Full-Stack Development Suite",
  "summary": {
    "sources_count": 2,
    "skills_count": 6,
    "presets_count": 1,
    "hooks_count": 0
  }
}
```

### 3.2 Dry-Run Preview
Preview what symlinks, configs, or imports will be generated without modifying disk:

```bash
node apps/skills-catalog/src/cli.js recipe apply \
  recipes/tier4-ecosystem/community-dev-recipe.json \
  --path /path/to/my-project
```

### 3.3 Applying with Confirmation
Execute the recipe to download/verify sources, register presets into the catalog, and mount skills into the project:

```bash
node apps/skills-catalog/src/cli.js recipe apply \
  recipes/tier4-ecosystem/community-dev-recipe.json \
  --path /path/to/my-project \
  --confirm
```

---

## 4. Creating Custom Presets with the CLI

You can easily compose existing or newly imported skills into your own named preset.

### 4.1 Discover Available Skills
```bash
# List all registered skills in the catalog registry
node apps/skills-catalog/src/cli.js skill list

# Search skills by keyword and tag
node apps/skills-catalog/src/cli.js skill search "test" --tag "authoring"
```

### 4.2 Create a Custom Preset
Use `preset create` to register your custom preset:

```bash
node apps/skills-catalog/src/cli.js preset create my-team-starter \
  --name "My Team Starter Suite" \
  --description "Lean everyday coding and code review preset" \
  --purpose "Team baseline focusing on fast TDD cycles and collaborative review" \
  --work-scope coding \
  --work-scope review \
  --owner "Web Engineering Guild" \
  --lifecycle draft \
  --skill reg_scoped_tdd_executor \
  --skill reg_grill_me
```

### 4.3 Inspect and Annotate Presets
```bash
# List all catalog presets
node apps/skills-catalog/src/cli.js preset list

# Inspect detailed version snapshot
node apps/skills-catalog/src/cli.js preset show my-team-starter

# Add collaboration notes to the template
node apps/skills-catalog/src/cli.js preset note add my-team-starter \
  --author "Alice" \
  --body "Adopted scoped TDD executor for fast red-green-refactor feedback."
```

---

## 5. Exporting Shareable Community Recipes

When your preset is ready to be shared with other developers or published to the community repository, export it as a standalone, portable `SkillRecipe` JSON file:

```bash
node apps/skills-catalog/src/cli.js recipe export \
  --preset my-team-starter \
  --name "My Team Starter Recipe" \
  --description "Portable starter recipe exported for community distribution" \
  --out recipes/tier4-ecosystem/my-team-starter-recipe.json
```

The export engine automatically:
1. Resolves all skill lineages and pins exact source commits and SHA-256 content digests.
2. Sanitizes non-portable internal audit records, retaining only portable `RECIPE_PROFILE_FIELDS`.
3. Validates the resulting document against `@skills-platform/contracts`.

---

## 6. Loose Coupling & Dynamic Overlays (`--work-scope`)

Loading 40+ skills into an LLM session simultaneously bloats the context window, increases token consumption, and introduces tool hallucination risks. Skills Platform uses **Loose Coupling via Dynamic Overlays** to solve this.

### 6.1 The 3 Preset Assignment Roles

When configuring a project via `preset assign <project-id> <preset-id>`:

| Role | Activation Behavior | Purpose |
|---|---|---|
| **`default`** | Active by default in every session | Fundamental project baseline skills. Exactly 1 default per project. |
| **`recommended`** | **Non-activating (Advisory only)** | Records candidate presets in the catalog without loading them into the effective set. Teams choose when to adopt. |
| **`work_scope_overlay`** | **Dynamic contextual activation** | Dormant by default; activated **only** when matching `--work-scope <tag>` flags are passed to the CLI or orchestrator. |

### 6.2 Exact Subset Matching Semantics (`hasAllTags`)

The overlay resolver matches an overlay preset if and only if **all of its declared tags are present** in the requested `--work-scope` arguments:

$$\text{Active}(O) \iff O.\text{work\_scope\_tags} \subseteq \text{RequestedTags}$$

- **Single tag overlay** (`["debugging"]`):
  - Activated by `--work-scope debugging`.
- **Multi-tag overlay** (`["security", "audit"]`):
  - Activated by `--work-scope security --work-scope audit`.
  - Passing only `--work-scope security` will **not** activate it.
- **Empty tag overlay** (`[]`):
  - Always matches when requested.

### 6.3 Example Workflow

```bash
# 1. Set a clean, minimal coding baseline as default
node apps/skills-catalog/src/cli.js preset assign my-app clean-coding-baseline --role default

# 2. Add an optional debugging overlay
node apps/skills-catalog/src/cli.js preset assign my-app skills-platform-debugging-codex \
  --role work_scope_overlay \
  --work-scope debugging \
  --priority 10

# 3. Add an advanced security auditing overlay
node apps/skills-catalog/src/cli.js preset assign my-app security-audit-suite \
  --role work_scope_overlay \
  --work-scope security \
  --work-scope audit \
  --priority 20
```

#### Activation in Practice:
- Regular coding session:  
  `skills-catalog project apply my-app --confirm`  
  ➔ **Loads `clean-coding-baseline` only.**
- Bug-hunting session:  
  `skills-catalog project apply my-app --confirm --work-scope debugging`  
  ➔ **Dynamically merges `clean-coding-baseline` + `skills-platform-debugging-codex`.**
- Security review session:  
  `skills-catalog project apply my-app --confirm --work-scope security --work-scope audit`  
  ➔ **Dynamically merges `clean-coding-baseline` + `security-audit-suite`.**

---

## 7. Priority Resolution & Collision Handling

When multiple overlays are activated together:

1. **Ascending Priority Order**: Overlays are sorted in ascending order of numeric priority (`left.priority - right.priority`).
2. **Lineage Overriding (`selectedByLineage`)**: If a higher-priority overlay provides a skill with the same `lineage_id` as the baseline or a lower-priority overlay, the higher-priority skill cleanly replaces the earlier entry.
3. **Additive Non-Conflicting Skills**: Skills with distinct `lineage_id`s are seamlessly unioned into the project's active roster.
4. **Deterministic Tie-Breaking**: If two overlays declare the same priority, lexicographical tie-break by `preset_id` ensures deterministic resolution.

---

## 8. Lean Recipe Design Patterns

### 8.1 The Mega-Bundle Anti-Pattern
A common trap in agent development is bundling 30 to 50 skills into a single monolithic recipe under the belief that "more skills is always better." In reality:
- Massive skill sets consume precious token budget.
- Agents become distracted by redundant prompt steering instructions.
- Modifying or debugging any one skill risks breaking unrelated workflows.

### 8.2 The Micro-Preset Best Practice
Curate **micro-presets** containing 1 to 5 tightly focused skills targeting a single operational intent.

#### Verified Lean Examples in the Monorepo:

1. **Pure 1-Skill Debugging Overlay** (`recipes/tier1-platform-core/skills-platform-debugging-recipe.json`):
   - **Skills**: `diagnosing-bugs` (1 skill)
   - **Tags**: `["debugging"]`
   - **Dependencies**: Zero hooks, zero projects, completely isolated.
2. **Lean 6-Skill Community Dev Suite** (`recipes/tier4-ecosystem/community-dev-recipe.json`):
   - **Skills**: `diagnosing-bugs`, `synthesizing-specs`, `test-first-opt-in`, `resolving-conflicts`, `requesting-code-reviews`, `receiving-code-reviews` (6 skills)
   - **Tags**: `["community", "development", "fullstack"]`
   - **Use Case**: Lightweight end-to-end full-stack development without heavy governance engines.
3. **Recommended Community Templates**:
   - **`lean-frontend-ui`**: `modern-web-guidance` + `svg-authoring` (`["frontend", "ui"]`)
   - **`lean-tdd-quickstart`**: `test-first-opt-in` + `code-review` (`["tdd", "quality"]`)
   - **`lean-doc-grounding`**: `openwiki-grounding` + `writing-great-skills` (`["docs", "curation"]`)

---

## 9. Packaging, Distribution & Git Sources

### 9.1 Recipe Manifest Anatomy (`SkillRecipe` v1)

```json
{
  "schema_version": 1,
  "recipe_id": "recipe-community-web-tools",
  "name": "Community Web & Vector Design Tools",
  "description": "Standalone community recipe for modern frontend styling and vector graphic generation.",
  "created_at": "2026-09-13T12:00:00.000Z",
  "created_by": "community",
  "sources": [
    {
      "source_id": "src_community_repo",
      "type": "git",
      "locator": "https://github.com/my-community/agent-skills.git",
      "ref": "main",
      "resolved_commit": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    }
  ],
  "skills": [
    {
      "name": "modern-web-guidance",
      "artifact_type": "skill",
      "invocation_mode": "hybrid",
      "source_id": "src_community_repo",
      "source_relative_path": "skills/modern-web-guidance",
      "content_digest": "4a5e1e582e32be50f90b4597553098440499d65036a30ae5ebec6fac90f3d538",
      "description": "Search tool and guidance for modern HTML/CSS and clientside JS standards."
    }
  ],
  "presets": [
    {
      "id": "community-web-tools",
      "name": "Community Web Tools Preset",
      "version": 1,
      "owner": "Community Contributors",
      "lifecycle": "reviewed",
      "purpose": "Provides modern web layout and SVG generation skills.",
      "work_scope_tags": ["frontend", "ui"],
      "skills": [
        {
          "skill_name": "modern-web-guidance",
          "source_relative_path": "skills/modern-web-guidance",
          "artifact_type": "skill",
          "required": true
        }
      ]
    }
  ],
  "projects": []
}
```

### 9.2 Distribution Modes
1. **Public Git Source**: Point `sources[].locator` to a public GitHub/GitLab URL. Any developer running `skills-catalog recipe apply` will automatically clone and verify commit hashes.
2. **Local Repository / Monorepo**: Point `locator` to `./skills-packages/...` for private or offline deployments.
3. **Single File Gist / URL**: Since recipe JSON files contain full presets and cryptographic digests, distributing the single JSON file is sufficient to reproduce the environment.

---

## 10. Community Contribution & Review Checklist

When submitting a new recipe to `recipes/`:

- [ ] **Kebab-Case Identifier**: `recipe_id` uses standard kebab-case (`recipe-<domain>-<name>` or `<domain>-<name>`).
- [ ] **Cryptographic Verification**: Every skill entry includes a valid SHA-256 `content_digest`.
- [ ] **Purpose & Work-Scope Tags**: Presets declare a clear `purpose` and relevant `work_scope_tags` for dynamic overlays.
- [ ] **Lifecycle State**: Submissions start with `lifecycle: "draft"`, promoted to `"reviewed"` upon team/CI approval.
- [ ] **Recipe Inspection Pass**: Running `node apps/skills-catalog/src/cli.js recipe inspect <file>` returns `valid: true`.
- [ ] **Zero Regressions**: Passes all platform tests:
  ```bash
  npm run check
  npm test
  node tests/e2e/run-all.js
  ```

---

## 11. Cross-Documentation Reference

- 🛠️ **Skill Addition & Lifecycle Guide**: [docs/guides/skill-addition-guide.md](../docs/guides/skill-addition-guide.md)
- 📖 **Architecture & Deep Dive Guide**: [docs/guides/community-recipes-and-presets.md](../docs/guides/community-recipes-and-presets.md)
- 🎯 **Skill Selection & Evaluation Standards**: [docs/guides/recommended-skillsets-guide.md](../docs/guides/recommended-skillsets-guide.md)
- 🔄 **Lifecycle Loop Types & Preset Matrix**: [docs/guides/loop-types-and-skill-presets-matrix.md](../docs/guides/loop-types-and-skill-presets-matrix.md)
- 📋 **Catalog Discovery Index**: [recipes/index.json](./index.json)
- 🏛️ **Canonical Platform Invariants**: [MASTER_BASELINE.md](../MASTER_BASELINE.md)
