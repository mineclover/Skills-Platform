---
name: baseline-domain-browser-devtools
description: Apply browser-extension and DevTools-specific retention rules to facts involving extension contexts, DevTools panels, content scripts, service workers, browser pages, Workspaces/Overrides, source maps, resource mapping, save attribution, hot reload, iframe/origin constraints, and version history. Use as a specialist overlay.
---

# Browser DevTools Overlay

## Role

This is a **specialist overlay**, not a core semantic owner. It refines facts owned by `baseline-domain-system-architecture`, `baseline-domain-interfaces`, `baseline-domain-runtime-workflows`, `baseline-domain-quality-operations`, `baseline-domain-testing-acceptance`, `baseline-domain-delivery-roadmap`.

Add `browser-devtools` to `domain_tags`, add missing technology-specific constraints and audits, and charge the final prose to the owning core domain. Create a dedicated final subsection only when this technology is itself the principal system boundary.

## Activate when sources contain

- Chrome/Firefox extension, Manifest V3, service worker, content script
- DevTools page, panel, inspectedWindow, debugger/protocol
- Workspace, Overrides, Sources editing, source maps
- network resource, local file, hot reload, iframe, origin, permission


## Domain-capsule output

Update the shared `FACT_LEDGER.jsonl` and emit a compact domain capsule:

```markdown
---
domain_id: browser-devtools
role: overlay
source_coverage: []
budget_weight: 0.0
---

# Domain Capsule — Browser DevTools Overlay

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

- Execution contexts and which APIs each context can access
- DevTools open/closed lifecycle and what remains active outside DevTools
- Extension permissions, host permissions, user grants, trust/origin boundaries
- Page world versus isolated content-script world and message bridges
- Network resource, generated bundle, source map, original source, and local-file identity
- Workspace versus Overrides semantics and browser-specific capability differences
- Edit origin attribution: user DevTools edit, tool edit, local external edit, reload output
- Save cadence, debounce, conflict detection, version history, and hot-reload echo suppression
- Iframe/cross-origin/frame navigation behavior and unsupported cases
- Service-worker suspension/restart, reconnect, durable state, and host communication

## High-risk distinctions

| A | B | Preservation rule |
|---|---|---|
| DevTools Workspace | Local Overrides | Workspace maps editable sources to local files; Overrides replaces served resources. They solve different problems. |
| DevTools open | Extension active | A background/service-worker path may live without the panel, but DevTools-only APIs do not. |
| Network resource | Original source | Bundled/generated content requires source-map and build-pipeline attribution. |
| Content script | Page world | They have different JS realms and trust exposure. |
| User edit | Reload echo | Origin and revision evidence must distinguish intent from consequence. |
| Permission | Capability | An API may exist but be unavailable without context, grant, browser support, or user action. |
| Frame URL | Top-level URL | Resource and DOM identity must include frame/origin context. |

## Compression operations

| Verbose source form | Canonical form | Loss guard |
|---|---|---|
| Browser API research logs | Capability/context matrix | Keep support status, permission, lifecycle, and fallback. |
| Repeated console traces | Canonical failure/attribution scenario | Archive incidental logs after deriving evidence. |
| Browser-specific narratives | Compatibility matrix | Retain semantic differences and unsupported cases. |
| Several save-loop descriptions | One origin/revision state machine | Keep conflict and echo-suppression rules. |
| Permission explanations | Least-privilege manifest/runtime grant contract | Do not keep generic extension tutorials. |

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

- [ ] Every operation names the extension/DevTools/page/host context that can perform it.
- [ ] DevTools closure and service-worker suspension have defined state and reconnect behavior.
- [ ] Workspace, Overrides, source maps, network resources, and local files are not conflated.
- [ ] Every persisted edit carries origin, resource identity, and base revision.
- [ ] Reload/hot-reload output cannot be mistaken for a fresh user edit.
- [ ] Iframe, origin, permission, and browser-compatibility limitations are testable.
- [ ] Sensitive source access and debugger-like capabilities follow least privilege.

## Example transformation

**Source pattern**

> Detect DevTools changes and save them to local files, even when DevTools is closed, while supporting React bundles and iframes.

**Overlay-enriched canonical pattern**

```text
Overlay split: DevTools-only edit observation operates only while its context exists; the general extension and local host maintain mapping/history outside the panel. Bundle edits require generated-resource → source-map → canonical-source mapping. Cross-origin frames and unsupported mappings are explicit degraded cases, never silent guesses.
```

## Completion gate

Complete only when technology-specific correctness constraints are attached to core-owned facts, unsupported cases are visible, and the overlay has not created a parallel technology-shaped specification.

## Reference

Read `references/retention-profile.md` for overlay atom fields, composition, and compact patterns.

## v0.3 recursive-context overlay rule

기술 특수성을 추가할 때 현재 `topic_id`, 수평·수직 frame, responsibility mode를 보존한다. Overlay는 탐색 결과를 해결 컨텍스트로 승격하거나 외부 요소의 내부 책임을 현재 시스템에 부여하지 않는다. 관리하지 않는 기술·플랫폼은 공개 계약, 관찰 증거, 경계 완화 조건만 보강한다.

