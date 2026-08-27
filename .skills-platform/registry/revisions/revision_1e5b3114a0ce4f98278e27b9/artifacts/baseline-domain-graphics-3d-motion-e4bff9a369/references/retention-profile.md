# Graphics, 3D, and Motion Overlay Retention Profile

## Composition

Refines: `baseline-domain-system-architecture`, `baseline-domain-data-state`, `baseline-domain-interfaces`, `baseline-domain-runtime-workflows`, `baseline-domain-quality-operations`, `baseline-domain-testing-acceptance`, `baseline-domain-delivery-roadmap`.

Overlay facts must attach to a core-owned fact through `domain_tags`, dependencies, or validation links. The overlay does not create a competing final section by default.

## Required overlay fields

| Atom | Specialist content | Required metadata |
|---|---|---|
| Overlay atom 1 | Coordinate systems, handedness, units, axis conventions, transform order, and conversion ownership | Core fact ID, source, affected domains, validation |
| Overlay atom 2 | Asset provenance, license, version, canonical source, and allowed modification/export | Core fact ID, source, affected domains, validation |
| Overlay atom 3 | Mesh topology and skeleton/rig identity required for compatibility | Core fact ID, source, affected domains, validation |
| Overlay atom 4 | Rest pose, bind transforms, control rig versus deformation rig, and helper-bone semantics | Core fact ID, source, affected domains, validation |
| Overlay atom 5 | Pose, animation, retargeting, constraints, limits, contact, and impossible-pose handling | Core fact ID, source, affected domains, validation |
| Overlay atom 6 | Captured, normalized, corrected, retargeted, baked, and rendered motion stages | Core fact ID, source, affected domains, validation |
| Overlay atom 7 | Non-destructive modification, proxy, adapter, render proxy, and output-generation boundaries | Core fact ID, source, affected domains, validation |
| Overlay atom 8 | Output formats and fidelity targets for pose, depth, normals, segmentation, shading, shadow, or control images | Core fact ID, source, affected domains, validation |
| Overlay atom 9 | Tolerance, calibration, regression fixtures, and visual/kinematic acceptance | Core fact ID, source, affected domains, validation |

## Promotion rule

Promote a specialist detail to P0/P1 only when omitting it could change correctness, compatibility, fidelity, security, lifecycle, or acceptance. Keep technology background and broad surveys at P2/P3.

## Merge rule

Merge repeated technology notes into one capability/constraint record. Preserve browser/provider/asset/version differences when they change behavior.

## Example

Source:

> Use a Mixamo Y Bot, pose it directly, later add hands and face, output shaded ControlNet images, and improve muscle response without replacing the base rig.

Overlay-enriched form:

```text
Overlay contract: Mixamo asset/rig remains the compatibility baseline; enhancements are non-destructive helper controls, deformation corrections, or render proxies. Canonical humanoid motion precedes character retargeting. Hands/face are deferred extension profiles. Control outputs have explicit camera, lighting, shadow, depth/normal, and joint-fidelity fixtures.
```
