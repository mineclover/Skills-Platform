# Browser DevTools Overlay Retention Profile

## Composition

Refines: `baseline-domain-system-architecture`, `baseline-domain-interfaces`, `baseline-domain-runtime-workflows`, `baseline-domain-quality-operations`, `baseline-domain-testing-acceptance`, `baseline-domain-delivery-roadmap`.

Overlay facts must attach to a core-owned fact through `domain_tags`, dependencies, or validation links. The overlay does not create a competing final section by default.

## Required overlay fields

| Atom | Specialist content | Required metadata |
|---|---|---|
| Overlay atom 1 | Execution contexts and which APIs each context can access | Core fact ID, source, affected domains, validation |
| Overlay atom 2 | DevTools open/closed lifecycle and what remains active outside DevTools | Core fact ID, source, affected domains, validation |
| Overlay atom 3 | Extension permissions, host permissions, user grants, trust/origin boundaries | Core fact ID, source, affected domains, validation |
| Overlay atom 4 | Page world versus isolated content-script world and message bridges | Core fact ID, source, affected domains, validation |
| Overlay atom 5 | Network resource, generated bundle, source map, original source, and local-file identity | Core fact ID, source, affected domains, validation |
| Overlay atom 6 | Workspace versus Overrides semantics and browser-specific capability differences | Core fact ID, source, affected domains, validation |
| Overlay atom 7 | Edit origin attribution: user DevTools edit, tool edit, local external edit, reload output | Core fact ID, source, affected domains, validation |
| Overlay atom 8 | Save cadence, debounce, conflict detection, version history, and hot-reload echo suppression | Core fact ID, source, affected domains, validation |
| Overlay atom 9 | Iframe/cross-origin/frame navigation behavior and unsupported cases | Core fact ID, source, affected domains, validation |
| Overlay atom 10 | Service-worker suspension/restart, reconnect, durable state, and host communication | Core fact ID, source, affected domains, validation |

## Promotion rule

Promote a specialist detail to P0/P1 only when omitting it could change correctness, compatibility, fidelity, security, lifecycle, or acceptance. Keep technology background and broad surveys at P2/P3.

## Merge rule

Merge repeated technology notes into one capability/constraint record. Preserve browser/provider/asset/version differences when they change behavior.

## Example

Source:

> Detect DevTools changes and save them to local files, even when DevTools is closed, while supporting React bundles and iframes.

Overlay-enriched form:

```text
Overlay split: DevTools-only edit observation operates only while its context exists; the general extension and local host maintain mapping/history outside the panel. Bundle edits require generated-resource → source-map → canonical-source mapping. Cross-origin frames and unsupported mappings are explicit degraded cases, never silent guesses.
```
