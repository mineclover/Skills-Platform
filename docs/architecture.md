# Skills Platform Architecture

## Product boundary

Skills Platform is the **registry and activation-catalog control plane**. It
owns imported source provenance, immutable revisions, review status, skill
contracts, evaluation evidence, skill-set releases, project policy, presets,
and the decision of what should be active for a work scope.

The existing Skills Manager is the **delivery adapter**. It owns provider
discovery, agent-path compatibility, symbolic-link/copy materialization,
filesystem/config reconciliation, shared-root impact warnings, progress, and
post-delivery verification. It does not decide catalog membership or replace
registry provenance.

Agent-readable `skills/` folders are delivery endpoints. They are never a
canonical registry or an authority for policy.

```text
source -> inspect -> registry revision -> review / release / project policy
                                      |
                              ActivationPlan (immutable)
                                      |
           Skills Manager delivery adapter: preview -> link/copy -> verify
                                      |
                        provider-specific skills/ delivery path
```

## Workspace ownership

| Path | Owner | Responsibility |
| --- | --- | --- |
| `apps/skills-catalog` | Skills Platform | Registry, catalog, evaluation, release, project assignments, activation plans. |
| `apps/skills-manager` | Existing Skills Manager repository | Upstream compatibility and safe provider delivery operations. |
| `packages/skill-contracts` | Skills Platform | Versioned cross-process/domain contracts. |

## Initial adapter contract

The catalog issues an `ActivationPlan` containing only immutable identities and
requested delivery intent:

- `plan_id`, `schema_version`, `created_at`, and caller context;
- registry skill revision ID, source digest, and canonical artifact path;
- target project/worktree, provider, scope, and link-or-copy preference;
- desired enabled state and expected delivery path;
- collision strategy and required shared-root confirmation.

The adapter returns an `ActivationReport` containing each examined operation,
its observed pre/post state, actual materialization method, errors, and drift.
It must reject a plan whose schema, revision digest, target scope, or shared
root confirmation is invalid.

## Distribution rules

1. Symbolic links are the default materialization method.
2. Copies are explicit fallbacks and retain their source revision/digest.
3. Disable/remove only changes a delivery binding; it never destroys a registry revision.
4. Upstream updates create reviewable candidate revisions; they do not change a binding automatically.
5. The catalog can request delivery, but only the adapter may mutate provider roots or configuration.
