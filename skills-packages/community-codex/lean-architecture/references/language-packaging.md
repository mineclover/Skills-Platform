# Language-Specific Packaging & Boundary Enforcement Recipes

This reference provides concrete directory layouts, compiler invariants, and automated boundary enforcement configurations across the four major backend and systems languages: **TypeScript**, **Go**, **Python**, and **Rust**.

Use this guide when establishing new package boundaries, refactoring existing packages to hide internal implementation, or setting up automated CI guardrails.

---

## 1. TypeScript / JavaScript

In TypeScript, packages decay into shallow spaghetti when everything is exported through a sprawling `index.ts` barrel or when callers import arbitrary internal files deep in subdirectories. Lean architecture enforces **deep modules** with **discrete entry points** and **hidden subfolders**.

### Directory Structure

```
packages/<pkg-name>/
├── package.json            # Defines explicit subpath exports
├── index.ts                # Primary entry point (public facade)
├── client.ts               # Optional secondary entry point (public facade)
├── lib/                    # Private implementation: HIDDEN from outside
│   ├── engine.ts           # Internal logic
│   ├── parser.ts           # Internal logic
│   └── util.ts             # Internal helpers
└── tests/                  # Co-located tests (subfolder, so private)
    ├── fixtures.ts         # Test fixtures (private)
    └── unit.test.ts        # Imports ONLY root entry points, never lib/
```

### Architectural Invariants

1. **Root Files Are Public Entry Points**: Any file directly under `<pkg-name>/` (`index.ts`, `client.ts`, `server.ts`) is a public entry point.
2. **Subfolders Are Private**: Any file within a subfolder (`lib/`, `internal/`, `tests/`) is private to the package. External code must never import from a subfolder.
3. **Entry Points Over Barrels**: Avoid giant barrels that re-export every internal type or function. Entry points should expose only the minimal, high-leverage interface callers need.
4. **Tests Exercise Public Entry Points**: Test files under `tests/` must import through the root entry points (`../index.ts`) just like external callers. Tests must not bypass the interface to test `lib/` directly.

### Package.json Subpath Exports

Modern Node.js and TypeScript (`moduleResolution: "NodeNext"` or `"Bundler"`) enforce boundaries at the runtime and compiler levels using the `exports` field:

```json
{
  "name": "@my-org/billing",
  "version": "1.0.0",
  "type": "module",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    },
    "./client": {
      "types": "./dist/client.d.ts",
      "import": "./dist/client.js"
    }
  },
  "files": [
    "dist"
  ]
}
```

Any attempt to `import "@my-org/billing/lib/engine"` fails with `ERR_PACKAGE_PATH_NOT_EXPORTED`.

### Automated Boundary Enforcement: `dependency-cruiser` & `setup-ts-deep-modules`

Use `dependency-cruiser` with the canonical rules codified in the `$setup-ts-deep-modules` skill to mechanically enforce entry-point encapsulation across monorepos and multi-package TypeScript codebases.

Install `dependency-cruiser` as a devDependency (which provides the `depcruise` CLI):
```bash
npm install -D dependency-cruiser
# or: pnpm add -D dependency-cruiser
# or: yarn add -D dependency-cruiser
```
*(Notes: Always install the official package `dependency-cruiser`. Do not install `depcruise` directly from npm, as that name is a security placeholder. Ensure a compatible TypeScript compiler is installed as a devDependency: `dependency-cruiser` requires `typescript: >=2.0.0 <7.0.0` to parse TS ASTs without skipping sources).*

Create `.dependency-cruiser.cjs` in the repository root:

```javascript
// @ts-check
/** Where packages live. One immediate child dir per package (flat, no nesting). */
const PACKAGES_ROOT = "packages";

const R = PACKAGES_ROOT;
/**
 * A package's private internals: anything nested inside a package subfolder (e.g. lib/, tests/).
 * The package's root files (index.ts, client.ts) are its entry points and stay importable from outside.
 */
const PACKAGE_INTERNALS = `^${R}/[^/]+/[^/]+/`;

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "entrypoint-boundary-from-app",
      comment:
        "App/root code may import a package's entry points (its root files), but nothing inside its subfolders.",
      severity: "error",
      from: { pathNot: `^${R}/` }, // Importer is NOT inside any package
      to: { path: PACKAGE_INTERNALS },
    },
    {
      name: "entrypoint-boundary-across-packages",
      comment:
        "A package's own files import each other freely, but may reach OTHER packages only through their entry points — never their internals.",
      severity: "error",
      from: { path: `^${R}/([^/]+)/`, pathNot: `^${R}/[^/]+/tests/` },
      to: {
        path: PACKAGE_INTERNALS,
        pathNot: `^${R}/$1/`, // Same package → intra-package internal imports allowed
      },
    },
    {
      name: "tests-through-entrypoints",
      comment:
        "A package's tests exercise it through its entry points like external consumers: they may import any package's entry points and their own tests/ fixtures, but never any package's internals — not even their own.",
      severity: "error",
      from: { path: `^${R}/([^/]+)/tests/` }, // Test file in package $1
      to: {
        path: PACKAGE_INTERNALS,
        pathNot: `^${R}/$1/tests/`, // Own tests/ fixtures allowed
      },
    },
    {
      name: "tests-folder-is-private",
      comment:
        "A package's tests/ folder is reachable only from tests — nothing else may import fixtures.",
      severity: "error",
      from: { pathNot: `^${R}/[^/]+/tests/` }, // Importer is not itself a test
      to: { path: `^${R}/[^/]+/tests/` },
    },
    {
      name: "no-circular",
      comment: "No cyclic dependencies between files or packages.",
      severity: "error",
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsConfig: { fileName: "./tsconfig.json" },
    enhancedResolveOptions: {
      extensions: [".ts", ".tsx", ".js", ".jsx", ".json"],
    },
  },
};
```

Add to `package.json` scripts:
```json
"scripts": {
  "check:boundaries": "depcruise --config .dependency-cruiser.cjs packages"
}
```

To run ad-hoc via `npx` directly without an npm script:
```bash
npx dependency-cruiser --config .dependency-cruiser.cjs packages
```

---

## 2. Go

Go was designed around modular boundaries. It provides compiler-enforced privacy through the `internal/` package convention and promotes consumer-driven interfaces.

### Directory Structure

```
billing/
├── go.mod
├── api.go                  # Public exported types, constants, error values
├── service.go              # Public constructors and core implementation struct
├── internal/               # Go compiler-enforced boundary: private to billing/
│   ├── payment/            # Internal subpackage
│   │   ├── stripe.go
│   │   └── processor.go
│   └── store/              # Internal persistence
│       └── store.go
└── api_test.go             # Black-box tests: 'package billing_test'
```

### Architectural Invariants

1. **Compiler-Enforced `internal/` Boundary**: Any package located under a directory named `internal` can only be imported by packages within the directory tree rooted at the parent of `internal`.
   - `billing/internal/payment` can be imported by `billing/service.go`.
   - `order/order.go` CANNOT import `billing/internal/payment` (compile error: `use of internal package billing/internal/payment not allowed`).
2. **Accept Interfaces, Return Structs**: Producer packages should return concrete structs, not interfaces. Do not declare interfaces in the producer package unless multiple concrete implementations exist in that package.
3. **Consumer-Driven Interfaces**: The package *consuming* a dependency declares the interface with only the methods it needs. This decouples packages and eliminates giant shared interface definitions.
4. **Avoid 1:1 Dummy Interfaces**: Never create `type BillingService interface` when only `type billingServiceImpl struct` exists, solely for mock injection. Test concrete structs directly or use lightweight in-memory fakes.
5. **Black-Box Testing (`package <name>_test`)**: Place public test files in `package <name>_test` so tests cannot access unexported fields or functions, proving that the module is fully testable through its public seam.

### Code Example: Consumer-Defined Interface Pattern

**Producer Package (`billing`):**
```go
package billing

import "myorg/billing/internal/payment"

// Internal consumer interface: billing defines the minimal contract it needs from payment
type paymentProcessor interface {
    ExecuteCharge(customerID string, amountCents int64) (string, error)
    ExecuteRefund(chargeID string) error
}

// Service is a concrete struct — no redundant 1:1 interface exported
type Service struct {
    processor paymentProcessor
}

func NewService(apiKey string) *Service {
    return &Service{
        // payment.NewStripeProcessor returns a concrete *payment.StripeProcessor
        processor: payment.NewStripeProcessor(apiKey),
    }
}

func (s *Service) Charge(customerID string, amountCents int64) (string, error) {
    return s.processor.ExecuteCharge(customerID, amountCents)
}

func (s *Service) Refund(chargeID string) error {
    return s.processor.ExecuteRefund(chargeID)
}
```

**Consumer Package (`order`):**
```go
package order

// Order declares ONLY what it needs from Billing
type Charger interface {
    Charge(customerID string, amountCents int64) (string, error)
}

type Service struct {
    charger Charger
}

func NewService(charger Charger) *Service {
    return &Service{charger: charger}
}

func (s *Service) CompleteOrder(orderID string, custID string, amount int64) error {
    chargeID, err := s.charger.Charge(custID, amount)
    if err != nil {
        return err
    }
    // ... order completion logic
    return nil
}
```

---

## 3. Python

Python has no native compile-time access controls. Lean architecture in Python relies on the standard `src/` layout, explicit `__all__` whitelists, `_internal` naming conventions, and static enforcement via `import-linter`.

### Directory Structure

```
my_project/
├── pyproject.toml
├── .importlinter           # Boundary contracts
├── src/
│   └── billing/
│       ├── __init__.py     # Public facade with explicit __all__
│       ├── client.py       # Public client entry point
│       ├── service.py      # Domain service coordinating engines
│       └── _internal/      # Explicitly marked private submodule
│           ├── __init__.py
│           ├── engine.py   # Internal engine
│           ├── models.py   # Internal data models and schemas
│           └── parsers.py  # Internal helpers
└── tests/
    └── test_billing.py     # Black-box tests: imports ONLY from billing, never _internal
```

### Architectural Invariants

1. **`src/` Layout**: Packaging code under `src/` prevents the current working directory from being accidentally imported during testing, guaranteeing that imports resolve against the installed package structure.
2. **Explicit `__all__` in `__init__.py`**: Every public module or package facade must explicitly define `__all__`. Linters (such as Ruff, Flake8, and IDEs) warn callers when importing symbols not in `__all__`.
3. **`_internal` Prefix for Private Modules**: Submodules that belong strictly to the package's internal implementation should be housed in a directory or file prefixed with `_` (e.g. `_internal/` or `_engine.py`).
4. **Zero Deep Imports**: Callers must never import `billing._internal.engine`. All interactions go through `billing.BillingClient` or `billing.create_client()`.

### Code Example: Explicit Facade in `__init__.py`

```python
"""Billing package public interface."""

from billing.client import BillingClient
from billing._internal.models import Invoice, ChargeResult

__all__ = [
    "BillingClient",
    "Invoice",
    "ChargeResult",
]
```

### Automated Boundary Enforcement: `import-linter`

Install `import-linter` (`pip install import-linter` or `uv add --dev import-linter`).

In Python with a `src/` layout, `src/` is the directory containing installable packages on `sys.path`. Modules import as `billing` and `orders`, NOT `src.billing`. Configure `.importlinter` with `root_packages` corresponding to the top-level packages:

Create `.importlinter` in the repository root:

```ini
[importlinter]
root_packages =
    billing
    orders
    users
    catalog

[importlinter:contract:billing-internal-encapsulation]
name = Enforce billing internal privacy
type = forbidden
source_modules =
    orders
    users
    catalog
forbidden_modules =
    billing._internal

[importlinter:contract:package-independence]
name = Enforce bounded context isolation
type = independence
modules =
    billing
    orders
    users
    catalog

[importlinter:contract:billing-layers]
name = Layered architecture within billing
type = layers
layers =
    billing.client
    billing.service
    billing._internal
```

Run in CI (or local terminal):
```bash
# Option A: Explicitly provide src/ on the Python module search path
PYTHONPATH=src lint-imports

# Option B: Install package in editable development mode first
pip install -e .
lint-imports
```

---

## 4. Rust

Rust provides fine-grained visibility modifiers (`pub`, `pub(crate)`, `pub(super)`, `pub(in crate::subpath)`). Lean architecture in Rust relies on conservative default visibility, the crate root facade pattern, and `cargo-modules` auditing.

### Directory Structure

```
crates/
└── billing/
    ├── Cargo.toml
    ├── src/
    │   ├── lib.rs          # Crate root facade: selective 'pub use'
    │   ├── engine.rs       # Module entry point (or engine/mod.rs)
    │   ├── engine/         # Private sub-module items
    │   │   └── worker.rs   # pub(crate) internal logic
    │   └── storage.rs      # Private persistence module
    └── tests/
        └── integration.rs  # Black-box integration tests targeting public lib.rs
```

### Architectural Invariants

1. **Default to `pub(crate)` over `pub`**: When writing functions, structs, or traits, make them visible within the crate only (`pub(crate)`) by default. Elevate to `pub` only when intentionally designing a public interface for external callers.
2. **Crate Root Facade Pattern**: The crate root (`src/lib.rs`) declares internal modules (`mod engine;`, `mod storage;`) as private or `pub(crate)`. It selectively exposes public API items using `pub use`:
   ```rust
   // src/lib.rs
   mod engine;
   mod storage;

   // Expose curated public interface at crate root
   pub use engine::BillingEngine;
   pub use engine::Invoice;
   pub use engine::ChargeError;
   ```
3. **No Wildcard Re-Exports**: Never write `pub use engine::*;`. Wildcard re-exports leak internal implementation details into the public API, break semantic versioning stability, and bloat docs.
4. **Integration Tests as Public Consumer (Compiler-Enforced Seam)**: Each file in `tests/*.rs` compiles as an independent external crate linking against `billing`. If code in `tests/integration.rs` attempts to access `pub(crate)` or unexported items, `rustc` halts the build with `error[E0603]: module 'engine' is private` or `error[E0603]: struct 'Worker' is private`.
5. **Private-in-Public Compiler Guarantees**: If a public function or method in `lib.rs` leaks a `pub(crate)` or private type in its public signature, `rustc` issues the `private_interfaces` diagnostic (turn into a hard build failure with `#![deny(private_interfaces)]` or `RUSTFLAGS="-D private_interfaces"`) and halts with `error[E0446]: private type in public interface` when leaked into public associated types. Re-exporting an unexported module halts with `error[E0365]`. The compiler mechanically prevents leaky abstractions without external linters.

### Code Example: Public Seam Integration Test

```rust
// tests/integration.rs
// Black-box integration tests compile as an external consumer crate
use billing::{BillingEngine, Invoice};

#[test]
fn test_billing_public_seam() {
    let engine = BillingEngine::new();
    let invoice = engine.create_invoice(100);
    assert_eq!(invoice.amount, 100);
}

// COMPILER-ENFORCED INVARIANT:
// Any attempt to import or reference internal crate items fails at compile time:
// use billing::engine::worker::Worker;
// -> error[E0603]: module `engine` is private
```

### Automated Boundary Auditing: `cargo-modules`

Use `cargo-modules` in CI to visualize and verify visibility and module boundaries.

Install:
```bash
cargo install cargo-modules
```

Audit module tree and public items:
```bash
# Print the module structure with visibility markers (pub, pub(crate), private)
cargo modules structure --package billing

# Verify dependency graph between modules and detect forbidden cross-subsystem links
cargo modules dependencies --package billing --focus-on "billing::engine"
```

Add a boundary check to your CI pipeline:
```bash
# 1. Verify integration tests compile against public seams only
cargo test --test integration

# 2. Halt if private/pub(crate) types leak into public interfaces
RUSTFLAGS="-D private_interfaces" cargo check

# 3. Fail if internal types leak into public documentation
cargo doc --no-deps --package billing

# 4. Fail if cyclic dependencies exist between internal modules
cargo modules dependencies --package billing --acyclic
```
