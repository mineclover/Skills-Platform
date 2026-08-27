# Domain Ownership Matrix

| Semantic atom | Primary owner | Common references |
|---|---|---|
| Problem, outcome, user role | Product requirements | Roadmap, testing |
| Scope/non-goal | Product requirements | Architecture, roadmap |
| Component responsibility | System architecture | Interfaces, runtime |
| Source of truth/authority boundary | System architecture | Data/state, interfaces |
| Entity, identifier, relationship | Data/state | Interfaces, runtime |
| State and legal transition | Data/state | Runtime, testing |
| Producer/consumer contract | Interfaces | Architecture, runtime |
| Error/version/idempotency | Interfaces | Runtime, quality |
| Ordered execution and recovery | Runtime workflows | Interfaces, quality |
| SLO, security, observability | Quality/operations | Interfaces, testing |
| Acceptance and evidence | Testing/acceptance | All domains |
| Milestone, dependency, exit criteria | Delivery roadmap | All domains |

## Non-ownership rule

A domain can add a reference, dependency, validation, or overlay constraint without copying the canonical statement. Use IDs rather than prose repetition.
