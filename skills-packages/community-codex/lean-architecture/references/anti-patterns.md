# Architectural Anti-Patterns & Bloat Symptoms

This guide catalogs the classic anti-patterns that create shallow modules, fragile boundaries, and cognitive debt. Use this checklist during code reviews, refactoring sessions, and design audits.

---

## 1. Pass-Through Wrappers (Indirection Without Abstraction)

### The Smell
A function, class, or service whose sole purpose is to forward arguments to another function or class with no transformation, validation, error handling, or state management. It adds an indirection layer that callers must read, navigate, and maintain, but provides zero behavior.

```
Caller ──> OrderService.createOrder() ──> OrderManager.createOrder() ──> OrderRepository.save()
```

### Before (Shallow Indirection)

```typescript
// services/OrderService.ts
export class OrderService {
  constructor(private orderManager: OrderManager) {}

  async createOrder(data: CreateOrderInput): Promise<Order> {
    // Pure pass-through: zero leverage, zero transformation
    return this.orderManager.createOrder(data);
  }

  async getOrder(id: string): Promise<Order> {
    // Another pass-through
    return this.orderManager.getOrder(id);
  }
}
```

### The Deletion Test
*If we delete `OrderService`, does complexity scatter or does it vanish?*
Deleting `OrderService` eliminates an entire class, a constructor, interface declarations, and unit tests that only tested mock forwarding. Complexity concentrates and the stack trace becomes one hop shorter.

### After (Lean Seam)

```typescript
// Delete OrderService entirely.
// Callers interact directly with the deep module at the domain seam.
export class OrderManager {
  async createOrder(data: CreateOrderInput): Promise<Order> {
    validateOrderInput(data);
    const order = calculatePricingAndDiscounts(data);
    await this.repo.save(order);
    await this.events.publish("order.created", { id: order.id });
    return order;
  }
}
```

---

## 2. 1:1 Dummy Interfaces (Mocking Fetishism)

### The Smell
Creating an interface for every single concrete class or struct when only one implementation ever exists in the entire lifetime of the system, solely to generate an auto-mock for unit tests.

### Before (Rote Interface Speculation)

```go
// producer package: user
type UserRepository interface {
    FindByID(id string) (*User, error)
    Save(u *User) error
}

// Exactly one implementation exists
type postgresUserRepository struct {
    db *sql.DB
}

func NewUserRepository(db *sql.DB) UserRepository {
    return &postgresUserRepository{db: db}
}
```

### Why It Hurts
1. Double maintenance: every new method or signature change must be updated in both the interface and the struct.
2. Code navigation breaks: jumping to definition lands on the interface rather than the implementation.
3. False abstraction: the interface usually leaks implementation-specific quirks (e.g., SQL error types or connection flags).
4. Tests test imaginary behavior: unit tests using mocks of 1:1 interfaces verify assumptions that drift from real database semantics.

### After (Concrete Struct + Consumer Interface / In-Memory Fake)

```go
// producer package: user
// Expose the concrete struct directly. No redundant 1:1 interface here.
type Repository struct {
    db *sql.DB
}

func NewRepository(db *sql.DB) *Repository {
    return &Repository{db: db}
}

func (r *Repository) FindByID(id string) (*User, error) { ... }
func (r *Repository) Save(u *User) error { ... }

// For fast testing: provide a real in-memory implementation in user/testutil
// OR let the consumer package define the minimal interface it actually needs.
```

---

## 3. Shotgun Surgery (Scattered Locality)

### The Smell
Making a single conceptual change (e.g., adding a new product tax rule or changing the authentication header) requires editing 8 different files across controllers, DTOs, mappers, domain entities, database models, and validator directories.

```
[Change: Add Discount Code]
  ├── edit controllers/order_controller.py
  ├── edit dtos/order_request.py
  ├── edit mappers/order_mapper.py
  ├── edit services/order_service.py
  ├── edit domain/order.py
  ├── edit entities/order_entity.py
  ├── edit repositories/order_repository.py
  └── edit validators/order_validator.py
```

### Why It Hurts
- High probability of missing one file, causing runtime bugs or data corruption.
- Immense cognitive load: developers must keep the mental map of 8 files in mind simultaneously.
- Destroys AI context efficiency: an LLM or subagent must load and edit multiple files across disparate folders for a trivial change.

### The Lean Fix: Vertical Co-location & Depth
Group code by **domain seam** rather than **technical tier**. Place the request validation, domain rule, and persistence query together inside the cohesive deep module.

```python
# src/orders/discounts.py
# Everything about discount rules, validation, and persistence calculation lives HERE.
class DiscountEngine:
    def validate_and_apply(self, order: Order, code: str) -> DiscountResult:
        # 1. Validation logic
        # 2. Calculation logic
        # 3. Invariant check
        ...
```

One conceptual change = one file edited. Fix once, fixed everywhere.

---

## 4. Deep / Leaky Imports (Breaching Encapsulation)

### The Smell
External modules bypass the public entry point of a package and directly import private files deep in its folder structure.

```typescript
// Leaky import in an external package
import { formatStripeDate } from "@my-org/billing/lib/utils/date-formatters";
import { internalStripeClient } from "@my-org/billing/lib/clients/stripe";
```

### Why It Hurts
- The internal structure of `@my-org/billing` is now frozen; refactoring `lib/` breaks unknown callers across the repository.
- The module is no longer "deep": its entire implementation surface has been exposed to the world.
- Tests cannot guarantee behavior because callers bypass the module's validation seams and invariant checks.

### The Lean Fix: Hard Enforced Boundary

1. Restrict public surface to package root (`index.ts`, `client.ts`).
2. Move internal helpers into `lib/` and enforce with compiler/linter (`dependency-cruiser` or `import-linter`).
3. External packages may only import root exports:
```typescript
import { BillingClient, Invoice } from "@my-org/billing";
```

If `@my-org/orders` genuinely needs `formatStripeDate`, ask:
- Is this a domain concept belonging to Billing? If so, expose it deliberately through `billing/client.ts`.
- Is this a generic date utility? If so, move it to a shared utility module or inline the 2 lines of logic.

---

## 5. Barrel File Sprawl (Monster Index Files)

### The Smell
An `index.ts` file at the root of every directory re-exporting `*` from every file in that directory and all nested subdirectories.

```typescript
// components/index.ts
export * from "./Button";
export * from "./Modal";
export * from "./Table";
export * from "./HeavyChart";
// ... 80 more re-exports
```

### Why It Hurts
1. **Destroys Tree-Shaking & Cold Starts**: Importing `import { Button } from "@/components"` loads every module in the subtree, including heavy charting libraries and network clients.
2. **Creates Hidden Cyclic Dependencies**: Bundlers struggle to resolve execution order, leading to `undefined` runtime import bugs.
3. **Pollutes AI Context**: An agent reading `index.ts` sees hundreds of symbols with no indication of which ones are entry points versus implementation details.

### The Lean Fix: Targeted Entry Points
Only create entry points for actual architectural boundaries (e.g. package roots). Inside a package, let internal files import each other directly by relative path (`./button.js`), rather than routing through an internal barrel.

---

## 6. Speculative Generalization (Premature Multi-Tenancy / YAGNI)

### The Smell
Building dynamic plugin architectures, reflection-based hook engines, multi-driver storage registries, or abstract query builders for a feature with exactly one known client and one known database.

### The Test
- How many callers currently exist? If **1**, build a direct concrete implementation.
- How many databases will you support this quarter? If **1**, write standard, optimized queries for that database without an abstract ORM dialect layer.
- Michael Feathers Rule: *One adapter = hypothetical seam; two adapters = real seam.*

Do not design the seam until the second real requirement arrives.
