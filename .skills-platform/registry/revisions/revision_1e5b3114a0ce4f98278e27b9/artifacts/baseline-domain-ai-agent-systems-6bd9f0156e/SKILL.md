---
name: baseline-domain-ai-agent-systems
description: Apply AI-agent-specific retention rules to facts involving agent roles, prompts, skills, tools, context boundaries, memory, model/provider choice, orchestration, human approval, uncertainty, evaluation, observability, safety, privacy, and cost. Use as a specialist overlay for agentic or model-driven systems.
---

# AI Agent Systems Overlay

## Role

This is a **specialist overlay**, not a core semantic owner. It refines facts owned by `baseline-domain-product-requirements`, `baseline-domain-system-architecture`, `baseline-domain-data-state`, `baseline-domain-interfaces`, `baseline-domain-runtime-workflows`, `baseline-domain-quality-operations`, `baseline-domain-testing-acceptance`, `baseline-domain-delivery-roadmap`.

Add `ai-agent-systems` to `domain_tags`, add missing technology-specific constraints and audits, and charge the final prose to the owning core domain. Create a dedicated final subsection only when this technology is itself the principal system boundary.

## Activate when sources contain

- agent, subagent, orchestrator, planner, executor, reviewer
- prompt, skill, tool, MCP, context boundary, memory
- model, provider, fallback, token budget, inference
- human approval, eval, hallucination, grounding, provenance


## Domain-capsule output

Update the shared `FACT_LEDGER.jsonl` and emit a compact domain capsule:

```markdown
---
domain_id: ai-agent-systems
role: overlay
source_coverage: []
budget_weight: 0.0
---

# Domain Capsule — AI Agent Systems Overlay

## Canonical terms
## Atomic P0/P1 facts
## Contracts, states, flows, or invariants owned/refined here
## Decisions, risks, and open issues
## Acceptance/evidence links
## Compression candidates
## Cross-domain handoff
```

The capsule is an intermediate representation. Do not polish it into an independent summary or repeat facts owned elsewhere.


## Overlay constraints to preserve

- Agent role, authority, allowed actions, prohibited actions, and handoff boundaries
- Prompt/skill/policy/tool distinction and which layer is authoritative
- Context assembly, source precedence, retrieval scope, and context-budget rules
- Memory/state/artifact persistence, ownership, revision, and privacy semantics
- Tool schemas, permissions, side-effect classification, confirmation, and idempotency
- Model/provider selection criteria, capability assumptions, fallback, and version pinning
- Planning/execution/review lifecycle, stop conditions, retries, escalation, and human approval
- Grounding, uncertainty, provenance, output validation, and deterministic checks
- Evaluation datasets, metrics, failure taxonomy, observability, cost/rate limits, and safety controls

## High-risk distinctions

| A | B | Preservation rule |
|---|---|---|
| Prompt | Policy | A prompt guides behavior; policy imposes non-negotiable constraints. |
| Skill | Tool | A skill describes procedure; a tool performs an external or computational action. |
| Memory | Current context | Persisted memory and per-run evidence have different authority and privacy. |
| Plan | Execution | A plausible plan is not proof an action occurred. |
| Model output | Verified fact | Generated content requires source or deterministic validation when factual. |
| Fallback | Silent degradation | Changing models or omitting tools must expose capability changes. |
| Autonomous action | Approval-gated action | Side effects and risk determine required confirmation. |

## Compression operations

| Verbose source form | Canonical form | Loss guard |
|---|---|---|
| Long agent persona prose | Role/authority/tool matrix | Keep responsibilities, limits, inputs, outputs, and escalation. |
| Prompt variants | Canonical instruction layers and precedence | Archive wording experiments unless behavior depends on them. |
| Model benchmark lists | Selection decision plus required capability/eval gap | Keep current pins and uncertainty. |
| Conversation examples | Failure/equivalence-class matrix | Retain only cases needed to define behavior or evaluation. |
| Orchestration narratives | State machine and handoff contracts | Preserve stop, retry, approval, and artifact semantics. |

## Application procedure

1. Read the routed core-domain capsules and shared fact ledger.
2. Locate facts whose correctness depends on this specialist domain.
3. Tag those facts; do not create duplicate canonical statements.
4. Add missing preconditions, state distinctions, failure semantics, compatibility rules, or acceptance obligations.
5. Promote priority/retention only when omission would change correctness, fidelity, safety, compatibility, or verification.
6. Convert technology research into compact capability, contract, state, or decision records.
7. Record unsupported or uncertain capabilities as explicit limitations or open decisions.
8. Run the overlay audit below and return ledger patches to the core owners/top-level condenser.

## Overlay audit

- [ ] Every agent action has authority, tool permission, side-effect class, and stop condition.
- [ ] Prompt, policy, skill, tool, memory, and source authority are not conflated.
- [ ] Claims requiring external truth are grounded or explicitly uncertain.
- [ ] Human approval gates and irreversible actions are explicit.
- [ ] Model/provider fallback preserves or discloses capability differences.
- [ ] Evaluation covers task success, factuality, tool correctness, safety, latency, and cost where relevant.
- [ ] Persistent memory and artifacts have provenance, privacy, and revision rules.

## Example transformation

**Source pattern**

> A planning agent delegates to implementation agents and can use tools, but should keep context under 80k and ask for approval only when needed.

**Overlay-enriched canonical pattern**

```text
Overlay contract: planner owns decomposition, not side effects; executors act only through declared tools; context is assembled from authority-ranked sources and domain capsules; irreversible/external writes require the configured approval class; every handoff carries artifact IDs, unresolved risks, evidence, and remaining budget.
```

## Completion gate

Complete only when technology-specific correctness constraints are attached to core-owned facts, unsupported cases are visible, and the overlay has not created a parallel technology-shaped specification.

## Reference

Read `references/retention-profile.md` for overlay atom fields, composition, and compact patterns.

## v0.3 recursive-context overlay rule

기술 특수성을 추가할 때 현재 `topic_id`, 수평·수직 frame, responsibility mode를 보존한다. Overlay는 탐색 결과를 해결 컨텍스트로 승격하거나 외부 요소의 내부 책임을 현재 시스템에 부여하지 않는다. 관리하지 않는 기술·플랫폼은 공개 계약, 관찰 증거, 경계 완화 조건만 보강한다.

