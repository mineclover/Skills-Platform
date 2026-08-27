# Knowledge and Publishing Overlay Retention Profile

## Composition

Refines: `baseline-domain-product-requirements`, `baseline-domain-system-architecture`, `baseline-domain-data-state`, `baseline-domain-interfaces`, `baseline-domain-runtime-workflows`, `baseline-domain-quality-operations`, `baseline-domain-testing-acceptance`.

Overlay facts must attach to a core-owned fact through `domain_tags`, dependencies, or validation links. The overlay does not create a competing final section by default.

## Required overlay fields

| Atom | Specialist content | Required metadata |
|---|---|---|
| Overlay atom 1 | Work/content identity, version/revision/manifestation distinctions, and canonical identifier rules | Core fact ID, source, affected domains, validation |
| Overlay atom 2 | Authorship, provenance, source references, timestamps, license, and ownership | Core fact ID, source, affected domains, validation |
| Overlay atom 3 | Taxonomy/category hierarchy, address generation, alias and deprecation semantics | Core fact ID, source, affected domains, validation |
| Overlay atom 4 | Selected metadata vocabulary/profile and mapping to JSON-LD/RDF or other projections | Core fact ID, source, affected domains, validation |
| Overlay atom 5 | Publication states, transition authority, validation, verification, failure, and rollback | Core fact ID, source, affected domains, validation |
| Overlay atom 6 | Canonical URL versus identifier, redirect, relocation, and link-integrity rules | Core fact ID, source, affected domains, validation |
| Overlay atom 7 | Revision, replacement, deprecation, archive, and supersession behavior | Core fact ID, source, affected domains, validation |
| Overlay atom 8 | Machine-readable snippet/API contract, validation evidence, and publication completion semantics | Core fact ID, source, affected domains, validation |
| Overlay atom 9 | Access control, privacy, embargo, and integrity constraints | Core fact ID, source, affected domains, validation |

## Promotion rule

Promote a specialist detail to P0/P1 only when omitting it could change correctness, compatibility, fidelity, security, lifecycle, or acceptance. Keep technology background and broad surveys at P2/P3.

## Merge rule

Merge repeated technology notes into one capability/constraint record. Preserve browser/provider/asset/version differences when they change behavior.

## Example

Source:

> Generate RDF or JSON-LD, inject it into a page, publish the page, then optionally read the URL to consider publishing complete.

Overlay-enriched form:

```text
Overlay state model: draft metadata → validated canonical record → projection generated → publication requested → public artifact observed → verified. Whether “published” requires observation is an explicit decision; generation alone never proves external deployment. Canonical record owns identity and provenance; JSON-LD/RDF are projections.
```
