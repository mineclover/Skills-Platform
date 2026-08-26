# Current implementation status

> Verified: 2026-08-27

Skills Platform is a full-featured, registry-first artifact and skill-set control plane. It supports multi-provider delivery (Codex, Antigravity/AGY, Claude), multi-artifact type isolation (Skills, Rules, Hooks, Plugins, MCP Servers), and explicit invocation taxonomy (Model-invoked Reflexes vs User-invoked Commands).

## Operational model

```text
immutable registry revision -> template / project policy -> ActivationPlan
                                                    -> delivery adapter (symlink / junction)
                                                    -> provider delivery path (Codex: skills/, AGY: .agents/skills/)
```

| Surface | Available now | Does not do |
| --- | --- | --- |
| Catalog CLI | Multi-source import (Local/Git), artifact inspection, review queue, profiles, scoped notes, feedback, evaluation cases, presets, project assignment, prompt export, plan generation, and history tracking | Write a provider delivery path directly without an activation plan |
| Catalog UI | Modular workspaces (Projects, Managed Skills, Templates, Review Queue, Live Status), visual invocation badges (`👤 User-invoked`, `🤖 Model-invoked / Reflex`, `🔀 Hybrid`), template composition, Pristine baseline toggle, and profile editing | Alter provider state without plan confirmation |
| Delivery Adapter | Atomic preview, link/copy reconciliation, verified symbolic link / Windows junction creation, safe unlinking, and post-delivery digest inspection | Decide Catalog membership, revisions, or preset policy |

## Supported Providers and Delivery Targets

- **Codex**: Delivered to `<project_root>/skills/` via symbolic links / junctions.
- **Antigravity (AGY)**: Delivered to `<project_root>/.agents/skills/` via symbolic links / junctions.
- **Custom / Universal**: Arbitrary configured delivery root paths with strict safety verification against unmanaged file mutation.

## Active Integrations

- **`LilMGenius/paperthin` Suite**:
  - 29 artifacts (1 plugin + 28 skills) imported into immutable registry revision (`revision_6439e15ac9fa62471748d3cb`).
  - Active in **Codex** (`skills/`) and **Antigravity** (`.agents/skills/`).
  - Invocation modes automatically inferred and classified:
    - **User-invoked**: `hate`, `macrothink`, `re0-git`, `re0-loop`, `re0-merge`, `re0-plan`, `re0-release`, `shower`, `sip`, `prism`
    - **Model-invoked (Reflexes)**: `aim`, `autobahn`, `catchup`, `debloat`, `dedash`, `detool`, `factchk`, `feynman`, `mandela`, `modelchk`, `nba`, `re0`, `re0-upgrade`, `re0-work`, `readchk`, `reorder`, `ssotize`

## Safety invariants

1. **Immutable Revisions**: Registry revisions are content-addressed and matched to upstream instances by SHA-256 digest before delivery.
2. **Deterministic Activation**: Every provider mutation has a recorded plan, a per-binding preview, and explicit confirmation.
3. **Collision Safety**: A missing or digest-mismatched artifact fails safely; delivery never overwrites unmanaged directories or files.
4. **Pristine Mode**: Disables managed delivery bindings cleanly without deleting registry content or history.
5. **Progressive Disclosure & Prompt Injection**: Prompts export only canonical content and explicitly flagged notes.

## Test & Verification Status

- `npm run check`: 100% typecheck passing across `@skills-platform/contracts`, `@skills-platform/skills-manager-adapter`, `@skills-platform/catalog-ui`, and `@skills-platform/catalog`.
- `npm test`: 49 passing unit tests covering contract validations, adapter links, Git revision tracking, and profile/search workflows.
- `npm run build`: Clean production bundle for UI and TypeScript packages.
