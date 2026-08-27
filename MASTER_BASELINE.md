# MASTER_BASELINE.md

> **Status**: Frozen Canonical Implementation Baseline  
> **Compiler**: `bounded-baseline-condenser` (Suite v0.3.1)  
> **Target Token Budget**: 72,000 working target (Hard cap: 80,000 tokens)  
> **Audience**: Implementation agents, maintainers, code reviewers, and multi-agent systems  
> **Authority**: High normative force — preserves user directives, architectural decisions (ADR 0001-0003), contracts, invariants, and multi-provider delivery specifications.

---

## 1. System Identity, Vision & Mission

### 1.1 Purpose
**Skills Platform** is a local-first, multi-provider control plane and catalog management system for AI agent skills, rules, hooks, plugins, and tool configurations. It bridges upstream developer-centric skill sources (Git repositories, local directories) with downstream AI assistant environments (**Google Antigravity**, **OpenAI Codex CLI**, and **Anthropic Claude Desktop**).

### 1.2 Core Value Proposition
- **Portability & Determinism**: Distributes immutable, version-pinned, SHA-256 digest-verified skill artifacts across different machines via portable `recipe.json` files.
- **Taxonomy of Invocation**: Enforces clear behavioral boundaries between autonomous agent reflexes (🤖 `model_invoked`) and explicit human commands (👤 `user_invoked`).
- **Pristine Reset & Zero Residue**: Guarantees atomic junction/symlink reconciliation, ensuring that removing a skill or resetting to Pristine leaves zero unmanaged debris or broken links.
- **Reactive Diagnostics**: Delivers real-time 5-stage activation telemetry (`Plan` -> `Inspect` -> `Preview` -> `Materialize` -> `Verify`) with NDJSON stream parsing and live drift detection.

---

## 2. Normative Architecture & Layering Rules

```
+----------------------------------------------------------------------------------------+
|                                   Apps & Interfaces                                    |
|  +----------------------------------------------+ +----------------------------------+ |
|  |   Catalog Web UI (@skills-platform/catalog-ui) | | Skills Catalog CLI & REST API   | |
|  |   * React 19 + TypeScript + Vite             | | (apps/skills-catalog)            | |
|  |   * FilterToolbar, Card/Table Grid Views     | | * CLI commands & Express/Koa API | |
|  |   * Recipe Hub (Export, Inspect, Apply)      | | * Fast Local SQLite/JSON Store   | |
|  |   * 5-Stage Stepper Modal & Diagnostic Drawer| | * SHA-256 Digest Reconciler      | |
|  +----------------------------------------------+ +----------------------------------+ |
+-------------------------------------------+--------------------------------------------+
                                            | depends on
+-------------------------------------------v--------------------------------------------+
|                             Contracts & Boundary Adapters                              |
|  +----------------------------------------------+ +----------------------------------+ |
|  |   @skills-platform/contracts                 | | @skills-platform/skills-manager-   | |
|  |   * Pure TypeScript schemas & domain types   | |   adapter                          | |
|  |   * Invariants & Recipe validation schemas   | | * Provider delivery roots        | |
|  |   * Zero runtime dependencies                | | * Atomic symlink/junction engine | |
|  +----------------------------------------------+ +----------------------------------+ |
+----------------------------------------------------------------------------------------+
```

### 2.1 Dependency Directions & Strict Boundaries (ADR 0002)
1. **Contracts Must Be Pure**: `@skills-platform/contracts` contains only pure domain definitions, schema versions (`RECIPE_SCHEMA_VERSION = 1`), and non-side-effecting validation functions. It **NEVER** imports file system APIs (`fs`), child process utilities, or networking libraries.
2. **Adapter Isolation**: `@skills-platform/skills-manager-adapter` encapsulates all OS-level symlink and NTFS junction operations. No business logic in the UI or Catalog directly calls `fs.symlink` or `fs.rmdir` on target project paths.
3. **Control Plane Decoupling**: The Web UI (`apps/catalog-ui`) is completely decoupled from local CLI processes, communicating exclusively via strongly typed REST API endpoints (`/api/*`) or standard browser File API downloads.

---

## 3. Decisions & Authority Ledger (ADRs)

| ADR ID | Title | Status | Normative Impact |
|---|---|:---:|---|
| **ADR-0001** | Two-Tier Local Storage Architecture | **Accepted** | Separates immutable global registry (`.skills-platform/registry/revisions/`) from mutable catalog state (`.skills-platform/catalog/catalog.json`). |
| **ADR-0002** | TypeScript Contracts & Adapter Layering | **Accepted** | Enforces unidirectional dependency flow: UI/Catalog -> Adapter -> Contracts. |
| **ADR-0003** | Invocation Taxonomy & Multi-Provider Delivery | **Accepted** | Establishes `invocation_mode` (`model_invoked`, `user_invoked`, `hybrid`, `unspecified`) and canonical provider delivery paths. |

---

## 4. Multi-Provider Delivery Directory Matrix

| Assistant Target | Canonical Provider ID | Project Delivery Path | Delivery Mechanism |
|---|---|---|---|
| **Google Antigravity** | `antigravity` (or `agy`) | `<project_root>/.agents/skills/<skill-name>` | NTFS Junction / Symbolic Link |
| **OpenAI Codex CLI** | `codex` | `<project_root>/skills/<skill-name>` | NTFS Junction / Symbolic Link |
| **Anthropic Claude Desktop** | `claude` | `<project_root>/.claude/skills/<skill-name>` | NTFS Junction / Symbolic Link |

### 4.1 Collision & Path Mutex Rules
- Two operations within the same activation plan **MUST NOT** target the same delivery path.
- The adapter will **NEVER** overwrite an existing non-symlink/non-junction directory at a delivery path unless explicitly confirmed and managed.
- Pristine execution guarantees the removal of all tracked junctions while leaving unmanaged user files untouched.

---

## 5. Invocation Mode Taxonomy & Behavioral Semantics

1. **`model_invoked` (Agent Reflex)**:
   - Evaluated autonomously by the LLM during cognitive loops (e.g., `debloat`, `factchk`, `mandela`, `baseline-domain-router`).
   - Triggered based on natural context match; should have concise instructions and low prompt weight.
2. **`user_invoked` (Explicit Command)**:
   - Triggered exclusively upon explicit human directive (e.g., `bounded-baseline-condenser`, `re0-release`, `sip`).
   - Models must not execute these unilaterally without operator prompt cues.
3. **`hybrid`**:
   - Dual-purpose skills usable both as autonomous background checks and direct user commands.
4. **`unspecified`**:
   - Backward-compatibility fallback for unclassified legacy skills.

---

## 6. Active Presets & Curated Tooling Inventory

| Preset ID | Category | Skills Count | Primary Purpose |
|---|---|:---:|---|
| **`paperthin-reflexes`** (v2) | Core Coding Baseline | 28 | Daily coding, refactoring, safety checks, and concise agent reflex loops (Paperthin suite). |
| **`condensation-core`** (v1) | On-Demand Curation | 3 | Ultra-lightweight 80k canonical baseline compilation (`bounded-baseline-condenser`, `domain-router`, `reference-pack-builder`). |
| **`baseline-curation-core`** (v1) | Deep Architecture | 11 | Full 8-domain architectural reduction and spec reconciliation. |
| **`baseline-full-suite`** (v1) | Full Suite | 43 | Complete recursive H/V context exploration, element registries, and maintenance lifecycle. |
| **`builtin-pristine`** (v1) | Clean Slate | 0 | Unlinks all managed skills, returning the workspace to a pristine zero-skill state. |

---

## 7. Verification & Quality Acceptance Gates

1. **TypeScript Typecheck**: `npm run check` -> **0 errors** across all workspaces.
2. **Automated Unit & Scenario Tests**: `npm test` -> **100% Pass Rate** across 178 tests.
3. **Production Web Asset Build**: `npm run build` -> Clean bundles in `apps/catalog-ui/dist`.

---
*Compiled and verified by `bounded-baseline-condenser` — Skills Platform Control Plane.*
