---
name: lean-architecture
description: >-
  Apply 11 lean architecture principles, design deep modules, enforce hard compiler/linter boundaries, and eliminate architectural bloat across TypeScript, Go, Python, and Rust codebases. Use when establishing system boundaries, refactoring shallow abstractions, designing packaging layouts, auditing codebase friction, or routing to specialized modeling and pruning skills.
---

# Lean Architecture

Build software with **maximum behavioral leverage** behind **minimal interface surface**. Lean architecture rejects premature abstraction, shallow layers, and procedural bureaucracy in favor of deep modules, co-located invariants, and compiler- or linter-enforced boundaries.

When an architecture is lean:
- Callers and tests exercise rich behavior through simple, stable entry points (**high leverage**).
- A conceptual change requires modifying exactly one module or package (**locality of change**).
- Boundaries are guarded by compilers and automated tooling, not developer vigilance (**hard boundaries**).
- Codebases remain navigable, token-efficient, and easily parsed by both humans and AI agents (**context economy**).

---

## The 11 Core Lean Architecture Principles

Every architectural proposal, module layout, or refactoring candidate must satisfy these 11 principles. Each principle pairs a concrete failure mode with its value and a checkable action heuristic.

### 1. Leverage over Volume (High Behavior per Unit of Interface)
- **Problem**: Shallow modules and anemic services where callers must orchestrate multiple micro-methods, manage intermediate state, and understand internal sequencing.
- **Value**: Callers learn very little to accomplish a great deal. Deep modules absorb operational complexity, reducing cognitive load and call-site bugs.
- **Action Heuristic**: Apply the **Depth Ratio**: count exported types/methods against internal lines of business logic. If a module exposes 10 methods for 20 lines of logic, push complexity down and collapse the interface to 1–2 high-leverage entry points.

### 2. The Deletion Test (Zero Tolerance for Shallow Indirection)
- **Problem**: Layered indirection where wrappers, controllers, or proxies merely forward calls to another layer without transforming data, enforcing invariants, or handling errors.
- **Value**: Eliminates dead cognitive weight, reduces boilerplate code, and shortens stack traces.
- **Action Heuristic**: Ask: *"If I delete this module or wrapper, does complexity scatter across callers, or does it vanish/concentrate cleanly?"* If deleting it concentrates or clarifies the system, delete it immediately.

### 3. Locality of Change (Fix Once, Fixed Everywhere)
- **Problem**: Shotgun surgery — a single business rule change or bug fix requires touching 6 files across 4 directories (e.g. DTO, mapper, entity, service, interface, repository).
- **Value**: Maintenance is localized. Bugs are fixed in one place, tests run against one seam, and mental context stays bounded.
- **Action Heuristic**: Trace the diff of a single feature or fix. If >1 file changes for the same conceptual reason, the seam is misplaced. Co-locate the types, rules, and execution logic within the same cohesive module.

### 4. YAGNI & Pre-Effort Skepticism (Cheap Experiments First)
- **Problem**: Speculative generalization — building plugin architectures for a single plugin, multi-cloud abstractions for a single provider, or generic config engines for fixed workflows.
- **Value**: Zero bugs and zero maintenance in code that was never written. Preserves development velocity and AI context budget.
- **Action Heuristic**: Never design a seam for a hypothetical future caller. Follow the **Rule of Two**: *one adapter is a concrete implementation; two adapters prove a genuine seam*. Validate speculative requirements with cheap scripts or tracer bullets before building abstractions.

### 5. Hard Boundaries over Mental Discipline (Compiler/Linter Enforced)
- **Problem**: Architecture defined by wiki documentation, team memos, or code review vigilance. Under deadline pressure or during rapid AI code generation, mental rules inevitably decay.
- **Value**: Structural invariants are mechanically guaranteed; illegal couplings fail the build instantly.
- **Action Heuristic**: If a boundary is not enforced by a compiler (e.g. Go `internal/`, Rust `pub(crate)`) or an automated linter (e.g. `dependency-cruiser`, `import-linter`), treat it as nonexistent. Automate the guardrail in CI before merging.

### 6. SSOT & Detooling (Mechanism over Vendor Nouns)
- **Problem**: Duplicated state models, multiple synchronizing schemas, and wrapping simple language mechanisms with heavy third-party vendor frameworks or bloated libraries.
- **Value**: Single Source of Truth (SSOT) prevents drift bugs; detooling eliminates dependency lock-in, supply chain risks, and framework upgrade churn.
- **Action Heuristic**: Verify every domain concept has exactly one authoritative definition. Replace heavyweight vendor wrappers with standard language primitives, explicit types, and native protocols.

### 7. AI-Navigability & Context Economy (Shallow File Count, Deep Context)
- **Problem**: File proliferation — fracturing a 100-line capability into 10 separate micro-files across deeply nested folders. This blows LLM token windows, triggers hallucinated paths, and disorients human reviewers.
- **Value**: High information density per file. An agent or developer can load 1–3 files and hold the complete behavioral slice in working memory.
- **Action Heuristic**: Favor fewer, deeper files over many anemic files. Co-locate tightly coupled private helper functions in the same file as their public consumer rather than creating dedicated single-function files.

### 8. Test the Seam, Not the Internals (Public Interface Testing)
- **Problem**: Unit tests that mock internal helpers, spy on private methods, or assert against unexported intermediate structures. Tests break upon every internal refactor even when behavior is unchanged.
- **Value**: Frictionless refactoring. Tests serve as durable behavioral specifications that verify inputs and outputs at the public seam.
- **Action Heuristic**: Write black-box tests that import only root entry points (`package foo_test` in Go, `tests/` in TS/Python/Rust). If changing an internal helper breaks a test without altering public behavior, delete or rewrite the test.

### 9. Two-Way Doors vs One-Way Doors (Fast Decisions on Reversible Items)
- **Problem**: Analysis paralysis on cheap, easily reversible decisions (internal variable names, private file structure) while treating irreversible decisions (public wire contracts, DB primary keys) with casual haste.
- **Value**: Rapid iteration speed on low-risk decisions combined with rigorous scrutiny on irreversible commitments.
- **Action Heuristic**: Categorize decisions:
  - *Two-Way Door*: Can be reversed in under an hour. Decide in minutes with a bias for action.
  - *One-Way Door*: Breaking API change, permanent data storage format, cross-system protocol. Require an ADR, stress-test with `$grill-me`, and build a proof-of-concept.

### 10. Negative Scope & Out-of-Bounds (Explicit Non-Goals)
- **Problem**: Scope creep and architectural mission bloat, where a module gradually accumulates responsibilities outside its core competency.
- **Value**: Crisp system boundaries, smaller attack surface, and clear module ownership.
- **Action Heuristic**: Every architectural specification, RFC, or module documentation must include an explicit **"Out of Bounds / Non-Goals"** section. If a requested feature lands in negative scope, reject it or route it to a distinct module.

### 11. Debuggability over Cleverness (Boring Architecture, Linear Traces)
- **Problem**: "Clever" designs — metaprogramming, dynamic monkey-patching, deep inheritance hierarchies, and tangled asynchronous event chains where stack traces are inscrutable.
- **Value**: Transparent execution flow. Any engineer or agent can diagnose an issue in production within minutes by stepping linearly through code.
- **Action Heuristic**: Optimize for reading and debugging over concise authoring. A developer must be able to trace a request end-to-end via standard "Go to Definition" in 3 hops or fewer, without traversing dynamic registries or reflection layers.

---

## Multi-Phase Architecture Workflow

When designing a new subsystem or restructuring an existing codebase, follow this sequential 4-phase discipline:

```
┌─────────────────┐     ┌─────────────────────┐     ┌─────────────────────┐     ┌───────────────────┐
│ Phase 1:        │     │ Phase 2:            │     │ Phase 3:            │     │ Phase 4:          │
│ Skepticism &    │ ──> │ Deep Modeling &     │ ──> │ Hard Boundaries &   │ ──> │ Debt Pruning &    │
│ Framing         │     │ Seams               │     │ Packaging           │     │ Detooling         │
└─────────────────┘     └─────────────────────┘     └─────────────────────┘     └───────────────────┘
```

### Phase 1: Skepticism & Framing
1. **Kill Before Building**: Challenge why this capability needs new code. Can it be solved with existing tools, configuration, or by eliminating the requirement? (Route: `$hate`).
2. **First-Principles Audit**: Explain the core mechanic in simple language. Strip vendor jargon and buzzwords (Route: `$feynman`).
3. **Stress-Test Assumptions**: Socratic interview to probe failure modes, concurrency, and trade-offs (Route: `$grill-me`).
4. **Classify Decisions**: Tag decisions as Two-Way or One-Way doors. Record One-Way doors in `docs/adr/`.
5. **Define Negative Scope**: Document at least 3 explicit non-goals before designing interfaces.

**Completion Criterion**: One-page problem definition with non-goals, verified requirement necessity, and identified one-way doors.

### Phase 2: Deep Modeling & Seam Identification
1. **Locate Natural Seams**: Identify where operational stability separates from volatile business rules. Place interfaces at these seams.
2. **Maximize Depth**: Draft interfaces with minimal surface area (fewest methods, simplest primitive or value-object arguments) backed by substantial implementation (Route: `$codebase-design`).
3. **Establish Ubiquitous Language**: Standardize naming across types, methods, and ADRs (Route: `$domain-modeling`).
4. **Apply Deletion Test**: Check every proposed intermediate class or wrapper. If deleting it improves clarity, eliminate it.

**Completion Criterion**: Interface signatures designed with high depth ratio; zero pass-through abstractions.

### Phase 3: Hard Boundaries & Packaging
1. **Select Language Layout**: Apply the language-specific packaging layout (TypeScript, Go, Python, or Rust).
2. **Hide Internal Details**: Move internal logic into subfolders (`lib/`, `internal/`, `_internal/`, or `pub(crate)`).
3. **Expose Discrete Entry Points**: Provide 1–2 root facade entry points. Ban wildcard barrels.
4. **Wire Automated Boundary Linters**: Add compiler rules or linter checks (`dependency-cruiser`, `import-linter`, `cargo-modules`) into CI (Route: `$setup-ts-deep-modules`).

**Completion Criterion**: CI fails on any illegal subfolder import or circular dependency; zero reliance on developer discipline.

### Phase 4: Debt Pruning & Detooling
1. **Audit for Shallowness**: Scan existing codebase for shallow wrappers, shotgun surgery, and hot spots (Route: `$improve-codebase-architecture`).
2. **Unify State (SSOT)**: Collapse redundant models and divergent specs into a canonical source of truth (Route: `$ssotize`).
3. **Detool Vendor Overhead**: Strip unused or oversized external packages; replace with native idioms (Route: `$detool`).
4. **Debloat**: Delete dead branches, orphaned helpers, and unused tests (Route: `$debloat`).

**Completion Criterion**: Reduced total file and line count; verified tests passing through public seams.

---

## Language Packaging & Boundary Enforcement

Lean architecture requires concrete packaging rules tailored to each language ecosystem. See [references/language-packaging.md](references/language-packaging.md) for full config files and recipes.

### TypeScript / JavaScript
- **Directory Layout**:
  ```
  packages/<pkg>/
  ├── package.json        # Explicit subpath exports
  ├── index.ts            # Public entry point
  ├── client.ts           # Secondary public entry point
  ├── lib/                # Private implementation: HIDDEN
  └── tests/              # Private tests: imports ONLY root entry points
  ```
- **Rules**:
  - **Entry Points Over Barrels**: Root files (`index.ts`, `client.ts`) are the only public surface. Do not export private subfolder trees through massive barrels.
  - **Subfolder Hiding**: External code must never import from `lib/`. Enforced via `package.json` `"exports"` and canonical `dependency-cruiser` rules (`$setup-ts-deep-modules`) blocking root-app and cross-package subfolder reach.
  - **Tests as External Consumers**: Files in `tests/` import through `../index.ts`, never `../lib/`. Test fixtures in `tests/` are private to test suites.

### Go
- **Directory Layout**:
  ```
  billing/
  ├── go.mod
  ├── api.go              # Public exported types and constructors
  ├── service.go          # Concrete implementation struct
  ├── internal/           # Go compiler-enforced boundary: private to billing/
  │   ├── payment/        # Internal subpackage
  │   └── store/          # Internal persistence
  └── api_test.go         # Black-box tests: package billing_test
  ```
- **Rules**:
  - **Compiler-Enforced `internal/`**: The Go compiler forbids any package outside the parent directory tree from importing packages under `internal/`. Zero runtime overhead.
  - **Accept Interfaces, Return Structs**: Producers return concrete structs. Consumers define their own minimal interfaces at the point of use.
  - **Avoid 1:1 Dummy Interfaces**: Never create an interface alongside a single struct solely to satisfy mocking frameworks. Use real structs or in-memory fakes.

### Python
- **Directory Layout**:
  ```
  src/
  └── billing/
      ├── __init__.py     # Public facade with explicit __all__
      ├── client.py       # Public client entry point
      ├── service.py      # Domain service coordinating engines
      └── _internal/      # Private implementation package
          ├── engine.py
          ├── models.py
          └── parsers.py
  ```
- **Rules**:
  - **`src/` Layout**: Guarantees imports test against the installed package, preventing cwd path leakage.
  - **Explicit `__all__`**: Public modules explicitly list allowed exports in `__init__.py`.
  - **Private `_internal` Submodules**: Internal code lives under `_internal/` and is strictly forbidden to external callers.
  - **Linter Enforcement**: Enforce layer and forbidden boundaries using `import-linter` (`lint-imports`) with explicit `root_packages` contracts.

### Rust
- **Directory Layout**:
  ```
  crates/my_crate/
  ├── Cargo.toml
  ├── src/
  │   ├── lib.rs          # Crate root facade: selective pub use
  │   ├── engine.rs       # Private sub-module entry point
  │   ├── engine/         # pub(crate) items
  │   │   └── worker.rs
  │   └── storage.rs
  └── tests/
      └── integration.rs  # Black-box integration tests
  ```
- **Rules**:
  - **Default to `pub(crate)`**: Items are visible within the crate only. Promote to `pub` only for deliberate public API.
  - **Crate Root Facade**: `lib.rs` selectively re-exports public types (`pub use engine::Engine;`). No wildcard re-exports (`pub use engine::*;`).
  - **Compiler-Enforced Seams**: Tests in `tests/` compile as separate external crates, enabling `rustc` to halt builds on any illegal internal access (`error[E0603]`).
  - **`cargo-modules` Verification**: Run `cargo modules structure` and `cargo modules dependencies` in CI to audit visibility.

---

## Architecture Anti-Pattern Checklist

Use this checklist during architecture reviews and code audits. See [references/anti-patterns.md](references/anti-patterns.md) for before/after refactoring examples.

- [ ] **Pass-Through Wrappers**: Classes or functions that only forward arguments without adding logic or transforming state. *Fix: Delete the wrapper and call the deep module directly.*
- [ ] **1:1 Dummy Interfaces**: Interfaces created with exactly one implementing struct for the sole purpose of unit test mocking. *Fix: Return concrete structs; let consumers define minimal interfaces if needed, or use in-memory fakes.*
- [ ] **Shotgun Surgery**: A single conceptual change touches multiple files across disparate layers. *Fix: Re-seam the code into a cohesive deep module where rules, types, and persistence are co-located.*
- [ ] **Deep / Leaky Imports**: External code importing internal files past the package entry point (e.g. `import from "pkg/lib/internals"`). *Fix: Encapsulate internals in subfolders and enforce with compiler/linter rules.*
- [ ] **Barrel File Sprawl**: Giant `index.ts` files that re-export entire directory trees, ruining tree-shaking and AI context windows. *Fix: Expose discrete, targeted root entry points.*
- [ ] **Speculative Generalization**: Designing abstract plugin engines or multi-driver layers before having two real, distinct requirements. *Fix: Build the simplest concrete implementation; defer abstraction until the second consumer arrives.*

---

## Specialized Skills Decision Tree & Routing Engine

When executing specific phases of architectural work, route to these specialized companion skills in the Skills Platform repository:

```
Is the challenge...
├── 1. Pre-effort validation or requirement skepticism?
│   ├── Want to brutally challenge necessity and cut scope? ──> $hate (paperthin)
│   ├── Want to expose fuzzy thinking from first principles? ──> $feynman (paperthin)
│   └── Want an interactive Socratic grill on your plan? ──> $grill-me (community-codex)
│
├── 2. Designing interfaces and domain seams?
│   ├── Need deep module vocabulary, leverage & seams? ──> $codebase-design (community-codex)
│   └── Defining ubiquitous language, aggregates & ADRs? ──> $domain-modeling (community-codex)
│
├── 3. Enforcing hard boundaries and contracts?
│   ├── Setting up TypeScript dependency-cruiser rules? ──> $setup-ts-deep-modules (community-codex)
│   └── Documenting vertical specs and contract boundaries? ──> $vertical-spec-documenter (platform-core)
│
├── 4. Diagnosing friction in existing code?
│   └── Need an automated scan & visual refactor report? ──> $improve-codebase-architecture (community-codex)
│
└── 5. Pruning technical debt and bloat?
    ├── Dispersed state models needing a single source of truth? ──> $ssotize (paperthin)
    ├── Heavy vendor libraries needing replacement with idioms? ──> $detool (paperthin)
    └── Accumulation of dead code, wrappers, and boilerplate? ──> $debloat (paperthin)
```

For complete trigger conditions, inputs, and outputs of each specialized skill, consult [references/routing-matrix.md](references/routing-matrix.md).
