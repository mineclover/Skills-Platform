---
name: baseline-domain-graphics-3d-motion
description: Apply graphics, 3D, rigging, animation, pose, retargeting, rendering, coordinate-frame, asset, fidelity, and export-specific retention rules to canonical baseline facts. Use as a specialist overlay for Blender, ControlNet guides, motion capture, rigs, meshes, rendering, or spatial simulation systems.
---

# Graphics, 3D, and Motion Overlay

## Role

This is a **specialist overlay**, not a core semantic owner. It refines facts owned by `baseline-domain-system-architecture`, `baseline-domain-data-state`, `baseline-domain-interfaces`, `baseline-domain-runtime-workflows`, `baseline-domain-quality-operations`, `baseline-domain-testing-acceptance`, `baseline-domain-delivery-roadmap`.

Add `graphics-3d-motion` to `domain_tags`, add missing technology-specific constraints and audits, and charge the final prose to the owning core domain. Create a dedicated final subsection only when this technology is itself the principal system boundary.

## Activate when sources contain

- mesh, topology, skeleton, bone, rig, control rig, deformation
- pose, animation, retarget, motion capture, constraint
- coordinate frame, unit, axis, transform, bind/rest pose
- render, shadow, normal, depth, ControlNet, export, asset license


## Domain-capsule output

Update the shared `FACT_LEDGER.jsonl` and emit a compact domain capsule:

```markdown
---
domain_id: graphics-3d-motion
role: overlay
source_coverage: []
budget_weight: 0.0
---

# Domain Capsule — Graphics, 3D, and Motion Overlay

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

- Coordinate systems, handedness, units, axis conventions, transform order, and conversion ownership
- Asset provenance, license, version, canonical source, and allowed modification/export
- Mesh topology and skeleton/rig identity required for compatibility
- Rest pose, bind transforms, control rig versus deformation rig, and helper-bone semantics
- Pose, animation, retargeting, constraints, limits, contact, and impossible-pose handling
- Captured, normalized, corrected, retargeted, baked, and rendered motion stages
- Non-destructive modification, proxy, adapter, render proxy, and output-generation boundaries
- Output formats and fidelity targets for pose, depth, normals, segmentation, shading, shadow, or control images
- Tolerance, calibration, regression fixtures, and visual/kinematic acceptance

## High-risk distinctions

| A | B | Preservation rule |
|---|---|---|
| Bone | Controller | A control manipulates a rig; a deformation bone drives the mesh. |
| Rest pose | Pose frame | Bind/rest transforms are not animation values. |
| Local | World | Parent transforms and coordinate conversion must be explicit. |
| Source skeleton | Canonical skeleton | Retargeting requires a normalized intermediate or explicit mapping. |
| Visual proxy | Canonical asset | A proxy can optimize output without replacing authoritative geometry. |
| Captured motion | Corrected motion | Filtering and constraint correction change provenance and must be traceable. |
| Render fidelity | Anatomical/kinematic validity | A visually plausible image may still violate joint or contact constraints. |

## Compression operations

| Verbose source form | Canonical form | Loss guard |
|---|---|---|
| Asset/model surveys | Selected baseline plus license/compatibility constraints | Keep rejected reasons that block reuse. |
| Per-bone prose | Rig/retarget mapping table | Retain axis, parent, rest pose, limits, and special handling. |
| Many pose examples | Pose equivalence classes and boundary cases | Keep contact, occlusion, twist, and impossible-pose cases. |
| Pipeline retellings | Canonical stage graph | Preserve coordinate conversions and bake points. |
| Visual comparisons | Metric/tolerance plus representative fixtures | Do not rely only on subjective screenshots. |

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

- [ ] Every transform names source/target frame, units, axes, and conversion order.
- [ ] Canonical asset, proxy, rig, and rendered outputs have distinct authority.
- [ ] Retarget mappings preserve rest pose and joint orientation semantics.
- [ ] Non-destructive modifications and bake boundaries are explicit.
- [ ] Impossible poses, contact, jitter, occlusion, and missing joints have defined behavior.
- [ ] License and commercial-use constraints are represented.
- [ ] Acceptance includes kinematic and output-image fidelity evidence.

## Example transformation

**Source pattern**

> Use a Mixamo Y Bot, pose it directly, later add hands and face, output shaded ControlNet images, and improve muscle response without replacing the base rig.

**Overlay-enriched canonical pattern**

```text
Overlay contract: Mixamo asset/rig remains the compatibility baseline; enhancements are non-destructive helper controls, deformation corrections, or render proxies. Canonical humanoid motion precedes character retargeting. Hands/face are deferred extension profiles. Control outputs have explicit camera, lighting, shadow, depth/normal, and joint-fidelity fixtures.
```

## Completion gate

Complete only when technology-specific correctness constraints are attached to core-owned facts, unsupported cases are visible, and the overlay has not created a parallel technology-shaped specification.

## Reference

Read `references/retention-profile.md` for overlay atom fields, composition, and compact patterns.

## v0.3 recursive-context overlay rule

기술 특수성을 추가할 때 현재 `topic_id`, 수평·수직 frame, responsibility mode를 보존한다. Overlay는 탐색 결과를 해결 컨텍스트로 승격하거나 외부 요소의 내부 책임을 현재 시스템에 부여하지 않는다. 관리하지 않는 기술·플랫폼은 공개 계약, 관찰 증거, 경계 완화 조건만 보강한다.

