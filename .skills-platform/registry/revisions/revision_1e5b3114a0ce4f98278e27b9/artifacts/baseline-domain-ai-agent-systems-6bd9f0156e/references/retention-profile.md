# AI Agent Systems Overlay Retention Profile

## Composition

Refines: `baseline-domain-product-requirements`, `baseline-domain-system-architecture`, `baseline-domain-data-state`, `baseline-domain-interfaces`, `baseline-domain-runtime-workflows`, `baseline-domain-quality-operations`, `baseline-domain-testing-acceptance`, `baseline-domain-delivery-roadmap`.

Overlay facts must attach to a core-owned fact through `domain_tags`, dependencies, or validation links. The overlay does not create a competing final section by default.

## Required overlay fields

| Atom | Specialist content | Required metadata |
|---|---|---|
| Overlay atom 1 | Agent role, authority, allowed actions, prohibited actions, and handoff boundaries | Core fact ID, source, affected domains, validation |
| Overlay atom 2 | Prompt/skill/policy/tool distinction and which layer is authoritative | Core fact ID, source, affected domains, validation |
| Overlay atom 3 | Context assembly, source precedence, retrieval scope, and context-budget rules | Core fact ID, source, affected domains, validation |
| Overlay atom 4 | Memory/state/artifact persistence, ownership, revision, and privacy semantics | Core fact ID, source, affected domains, validation |
| Overlay atom 5 | Tool schemas, permissions, side-effect classification, confirmation, and idempotency | Core fact ID, source, affected domains, validation |
| Overlay atom 6 | Model/provider selection criteria, capability assumptions, fallback, and version pinning | Core fact ID, source, affected domains, validation |
| Overlay atom 7 | Planning/execution/review lifecycle, stop conditions, retries, escalation, and human approval | Core fact ID, source, affected domains, validation |
| Overlay atom 8 | Grounding, uncertainty, provenance, output validation, and deterministic checks | Core fact ID, source, affected domains, validation |
| Overlay atom 9 | Evaluation datasets, metrics, failure taxonomy, observability, cost/rate limits, and safety controls | Core fact ID, source, affected domains, validation |

## Promotion rule

Promote a specialist detail to P0/P1 only when omitting it could change correctness, compatibility, fidelity, security, lifecycle, or acceptance. Keep technology background and broad surveys at P2/P3.

## Merge rule

Merge repeated technology notes into one capability/constraint record. Preserve browser/provider/asset/version differences when they change behavior.

## Example

Source:

> A planning agent delegates to implementation agents and can use tools, but should keep context under 80k and ask for approval only when needed.

Overlay-enriched form:

```text
Overlay contract: planner owns decomposition, not side effects; executors act only through declared tools; context is assembled from authority-ranked sources and domain capsules; irreversible/external writes require the configured approval class; every handoff carries artifact IDs, unresolved risks, evidence, and remaining budget.
```
