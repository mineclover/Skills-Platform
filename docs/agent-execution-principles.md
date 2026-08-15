# Capability Scoping and Runtime Integration Principles

> Status: design guidance. This document does not change the current
> `ActivationPlan`, `ActivationReport`, or provider-delivery contracts.

## Purpose and boundary

Skills Platform governs skill provenance, review, project policy, and delivery
intent. It is not an agent runtime: it does not execute model tool calls or
store an agent's private reasoning. Its job is to narrow the runtime's decision
surface by selecting the smallest reviewed capability set for a work scope and
recording the evidence for that selection.

The guiding principle is **less, but explicit**: fewer active skills, less
prompt material, smaller handoffs, and a bounded activation lifecycle.

## What exists today

| Design principle | Current Platform mechanism | Boundary preserved |
| --- | --- | --- |
| Minimum capability set | Default preset plus deterministic `work_scope_overlay` selection | A project need not receive every Catalog skill. |
| Scoped instructions | Immutable `SKILL.md`, profile metadata, scoped notes, project assignments, and overlays | Metadata or a temporary overlay never rewrites canonical skill content. |
| Bounded prompt context | Prompt export contains canonical skill content and only notes explicitly opted into prompt injection | The Catalog does not export all operational history by default. |
| Explicit lifecycle | `inspect → resolve → preview → confirm → apply → verify → report` | The Catalog plans intent; Skills Manager alone mutates provider delivery. |
| Evidence over transcripts | Immutable revisions and digests, plan history, reports, feedback, and revision-pinned evaluation results | The Catalog is not a repository for unbounded tool logs or reasoning traces. |

## Policy and context layering

```text
global catalog policy
  └─ project default preset
       └─ work-scope overlay
            └─ immutable skill revision
                 └─ provider delivery binding
```

Each layer answers a distinct question: policy defines what is eligible;
presets and overlays select the needed capability set; a revision defines
canonical content; and a provider binding defines where the approved revision
is delivered. Do not merge these layers into one editable instruction file.

## Activation lifecycle

The activation flow is intentionally stateful and observable, rather than a
single opaque agent action:

1. **Inspect** the target provider and bindings.
2. **Resolve** approved immutable revisions and their expected delivery paths.
3. **Preview** every prospective binding and reject collisions, drift, or digest mismatches.
4. **Confirm** the reviewed mutations, including any shared-root impact.
5. **Apply** only through the Skills Manager CLI adapter.
6. **Verify** provider and binding state after the operation.
7. **Report** pre/post state, materialization method, errors, and drift.

`ActivationPlan` captures requested, immutable intent; `ActivationReport`
captures observed delivery results. They remain the authoritative current
contracts.

## Future runtime integration

If an external agent runtime later reports task outcomes to the Platform, it
should return a compact, versioned envelope rather than full working context:

```json
{
  "claims": ["verified outcome"],
  "evidence_refs": ["revision ID, digest, report ID, or source location"],
  "decisions": ["policy or delivery decision"],
  "unresolved_items": ["items requiring review"],
  "next_actions": ["safe follow-up action"]
}
```

This is a proposed integration shape, not a persisted schema. Introduce it
only through a separately versioned contract and keep detailed tool logs in
the runtime's bounded diagnostics.

A future non-interactive CI integration must add an auditable authorization
mechanism to the approved plan contract—target scope, allowed operations,
completion condition, timeout, and machine-readable errors. It must not bypass
the current confirmation requirement implicitly.

## Design consequences

- Prefer a narrow work-scope overlay to a broad always-on template.
- Keep feedback and evaluation tied to a skill lineage and source revision so
  evidence prompts review without silently changing active policy.
- Pass evidence references and unresolved items between components; avoid
  handing off an agent's full intermediate context.
- Preserve per-operation preview and verification if a future batch operation
  is introduced.

## Background reading

- [5 Agent Anti-patterns from Anthropic’s First Official Exam](https://www.youtube.com/watch?v=FWddN9xLv54)
- [Claude Certified Architect 시험을 에이전틱 엔지니어링의 실전 지침서로 읽기](https://wikidocs.net/blog/%40jaehong/28145/)

These sources motivate the design direction. The normative Platform boundary
remains [the architecture](./architecture.md), the shared contracts, and the
implemented delivery adapter.
