# Specialized Skills Routing Matrix & Decision Engine

`lean-architecture` serves as the foundational umbrella skill for system design and boundary integrity. For specialized execution tasks, developers and agents should route to domain-specific companion skills in the Skills Platform repository.

Use this routing matrix to select the exact skill needed for your current architectural phase.

---

## The 4-Phase Architecture Pipeline

```
┌────────────────────────────────────────────────────────┐
│  Phase 1: Pre-Effort Skepticism & Framing              │
│  Skills: $hate, $feynman, $grill-me                    │
│  Goal: Kill or simplify the concept BEFORE building    │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│  Phase 2: Deep Modeling & Seam Identification          │
│  Skills: $codebase-design, $domain-modeling            │
│  Goal: Maximize behavior per interface, place seams    │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│  Phase 3: Hard Boundaries & Packaging                  │
│  Skills: $setup-ts-deep-modules,                       │
│          $vertical-spec-documenter                     │
│  Goal: Compiler/linter enforcement, zero leakage       │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│  Phase 4: Friction Diagnosis & Debt Pruning            │
│  Skills: $improve-codebase-architecture,               │
│          $ssotize, $detool, $debloat                   │
│  Goal: Eliminate shallow wrappers, unify state, prune  │
└────────────────────────────────────────────────────────┘
```

---

## Detailed Skill Routing Matrix

| Phase | Scenario / Trigger | Recommended Skill | Package Location | Input Context Needed | Handoff Output / Artifact |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Phase 1: Skepticism** | New feature/system proposal feels over-engineered, buzzword-heavy, or speculative | **`$hate`** | `paperthin/hate` | PRD, issue description, or draft RFC | Brutal teardown report; eliminated non-goals |
| **Phase 1: Skepticism** | Design contains vague abstractions or unproven mental models | **`$feynman`** | `paperthin/feynman` | Architecture proposal or complex concept | Simple, grounded explanation; exposed gaps |
| **Phase 1: Skepticism** | Author wants interactive interrogation of architectural assumptions before coding | **`$grill-me`** | `community-codex/grill-me` | Technical plan or system specification | Hardened plan with defended trade-offs |
| **Phase 2: Modeling** | Designing module interfaces, determining depth, or deciding where seams go | **`$codebase-design`** | `community-codex/codebase-design` | Proposed module signatures, caller call sites | Deep module interface spec (small surface, deep impl) |
| **Phase 2: Modeling** | Defining ubiquitous language, bounded contexts, domain invariants, or ADRs | **`$domain-modeling`** | `community-codex/domain-modeling` | Domain requirements, entity lifecycles | `CONTEXT.md` glossary, `docs/adr/ADR-xxxx.md` |
| **Phase 3: Boundaries** | Enforcing TypeScript package encapsulation and banning subfolder imports in CI | **`$setup-ts-deep-modules`** | `community-codex/setup-ts-deep-modules` | TypeScript monorepo / package layout | `.dependency-cruiser.cjs` with deep-module rules |
| **Phase 3: Boundaries** | Formulating vertical slice specifications and end-to-end interface contracts | **`$vertical-spec-documenter`** | `platform-core/vertical-spec-documenter` | Multi-tier feature or distributed subsystem | Formal vertical spec with invariant matrix |
| **Phase 4: Diagnosis** | Identifying architectural rot, shallowness, and hot spots in an existing codebase | **`$improve-codebase-architecture`** | `community-codex/improve-codebase-architecture` | Git history hot spots, pain points | Interactive HTML before/after refactoring report |
| **Phase 4: Pruning** | System has fragmented state, out-of-sync specs, or duplicate data sources | **`$ssotize`** | `paperthin/ssotize` | Dispersed state models, dual schemas | Unified Single Source of Truth architecture |
| **Phase 4: Pruning** | Heavyweight vendor dependencies or third-party frameworks create lock-in | **`$detool`** | `paperthin/detool` | Bloated `package.json`, heavy SDK wrappers | Detooling plan replacing libraries with idioms |
| **Phase 4: Pruning** | Accumulation of dead code, pass-through layers, and unused boilerplate | **`$debloat`** | `paperthin/debloat` | Codebase scan, unused functions, wrappers | Cleaned codebase with reduced line count |

---

## Cross-Skill Workflows

### 1. New Feature / Greenfield Subsystem Workflow
1. Run `$grill-me` to stress-test requirements and validate whether the problem actually needs solving.
2. Run `$domain-modeling` to establish bounded context terms and write an ADR for one-way doors.
3. Run `$codebase-design` to craft a deep module interface with high leverage.
4. Run `$setup-ts-deep-modules` (if TypeScript) or apply Go/Python/Rust boundary recipes to lock down the package.

### 2. Brownfield Codebase Refactoring Workflow
1. Run `$improve-codebase-architecture` to scan hot spots and generate visual before/after refactor cards.
2. For modules identified as pass-through or shallow, run `$ssotize` to unify split state representations.
3. Run `$detool` and `$debloat` to strip redundant wrappers and vendor abstractions.
4. Add automated boundary linters (`dependency-cruiser` / `import-linter`) so the refactored boundaries stay intact.
