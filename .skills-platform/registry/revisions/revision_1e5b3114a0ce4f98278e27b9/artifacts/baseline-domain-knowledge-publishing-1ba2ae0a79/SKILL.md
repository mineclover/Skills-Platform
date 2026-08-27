---
name: baseline-domain-knowledge-publishing
description: Apply metadata, provenance, taxonomy, identifier, JSON-LD/RDF, publication lifecycle, canonical URL, validation, revision, deprecation, and verification-specific retention rules to canonical baseline facts. Use as a specialist overlay for content catalogs, knowledge systems, publishing workflows, and metadata services.
---

# Knowledge and Publishing Overlay

## Role

This is a **specialist overlay**, not a core semantic owner. It refines facts owned by `baseline-domain-product-requirements`, `baseline-domain-system-architecture`, `baseline-domain-data-state`, `baseline-domain-interfaces`, `baseline-domain-runtime-workflows`, `baseline-domain-quality-operations`, `baseline-domain-testing-acceptance`.

Add `knowledge-publishing` to `domain_tags`, add missing technology-specific constraints and audits, and charge the final prose to the owning core domain. Create a dedicated final subsection only when this technology is itself the principal system boundary.

## Activate when sources contain

- metadata, author, created/modified time, provenance, license
- taxonomy, category, hierarchy, canonical ID, URI, URL
- JSON-LD, RDF, schema.org, vocabulary, mapping
- draft, publish, verify, revise, deprecate, archive, canonical page


## Domain-capsule output

Update the shared `FACT_LEDGER.jsonl` and emit a compact domain capsule:

```markdown
---
domain_id: knowledge-publishing
role: overlay
source_coverage: []
budget_weight: 0.0
---

# Domain Capsule — Knowledge and Publishing Overlay

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

- Work/content identity, version/revision/manifestation distinctions, and canonical identifier rules
- Authorship, provenance, source references, timestamps, license, and ownership
- Taxonomy/category hierarchy, address generation, alias and deprecation semantics
- Selected metadata vocabulary/profile and mapping to JSON-LD/RDF or other projections
- Publication states, transition authority, validation, verification, failure, and rollback
- Canonical URL versus identifier, redirect, relocation, and link-integrity rules
- Revision, replacement, deprecation, archive, and supersession behavior
- Machine-readable snippet/API contract, validation evidence, and publication completion semantics
- Access control, privacy, embargo, and integrity constraints

## High-risk distinctions

| A | B | Preservation rule |
|---|---|---|
| Work | Version/manifestation | An intellectual work, its revision, and its published representation may need separate IDs. |
| Identifier | URL | A URL is a locator unless explicitly canonical identity. |
| Taxonomy | Folder | Classification and storage hierarchy are not automatically the same. |
| Publish requested | Published | A request or generated snippet is not proof the public representation is valid. |
| Published | Verified | Verification may be a separate state with evidence. |
| Source metadata | Generated projection | JSON-LD/RDF can be derived from a canonical record. |
| Deprecated | Deleted | Deprecation preserves identity and replacement information. |

## Compression operations

| Verbose source form | Canonical form | Loss guard |
|---|---|---|
| Standards research | Chosen profile and explicit mapping | Keep alternatives only when compatibility remains open. |
| Repeated metadata field prose | Canonical property matrix | Retain cardinality, authority, validation, privacy, and derivation. |
| Publication walkthroughs | State/transition and verification contract | Archive UI tutorial detail. |
| Taxonomy examples | Hierarchy rules plus representative path | Keep alias and relocation behavior. |
| Several snippets | One normative template and validation rules | Do not let examples become competing schemas. |

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

- [ ] Identity, URL, version, revision, and manifestation semantics are explicit.
- [ ] Every generated metadata projection maps to one canonical source record.
- [ ] Publication and verification are distinct when evidence can fail after generation.
- [ ] Taxonomy changes preserve aliases, redirects, or migration behavior as required.
- [ ] Provenance, authorship, license, and timestamps have authority and update rules.
- [ ] Validation covers syntax, semantics, resolvability, and required public evidence.
- [ ] Deprecation and replacement do not silently destroy traceability.

## Example transformation

**Source pattern**

> Generate RDF or JSON-LD, inject it into a page, publish the page, then optionally read the URL to consider publishing complete.

**Overlay-enriched canonical pattern**

```text
Overlay state model: draft metadata → validated canonical record → projection generated → publication requested → public artifact observed → verified. Whether “published” requires observation is an explicit decision; generation alone never proves external deployment. Canonical record owns identity and provenance; JSON-LD/RDF are projections.
```

## Completion gate

Complete only when technology-specific correctness constraints are attached to core-owned facts, unsupported cases are visible, and the overlay has not created a parallel technology-shaped specification.

## Reference

Read `references/retention-profile.md` for overlay atom fields, composition, and compact patterns.

## v0.3 recursive-context overlay rule

기술 특수성을 추가할 때 현재 `topic_id`, 수평·수직 frame, responsibility mode를 보존한다. Overlay는 탐색 결과를 해결 컨텍스트로 승격하거나 외부 요소의 내부 책임을 현재 시스템에 부여하지 않는다. 관리하지 않는 기술·플랫폼은 공개 계약, 관찰 증거, 경계 완화 조건만 보강한다.

