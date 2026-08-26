# Skills Platform Architecture

## Product boundary

Skills Platform is the **registry and activation-catalog control plane**. It
owns imported source provenance, immutable revisions, review status, skill
contracts, evaluation evidence, skill-set releases, project policy, presets,
and the decision of what should be active for a work scope.

The existing Skills Manager is the **delivery adapter**. Its
`skills-manager-inspect` CLI is the sole integration boundary used by Skills
Platform. It owns provider discovery, agent-path compatibility,
symbolic-link/copy materialization, filesystem/config reconciliation,
shared-root impact warnings, progress, and post-delivery verification. It does
not decide catalog membership or replace registry provenance.

Agent-readable `skills/` folders are delivery endpoints. They are never a
canonical registry or an authority for policy.

```text
source -> inspect -> registry revision -> review / release / project policy
                                      |
                              ActivationPlan (immutable)
                                      |
        Skills Manager CLI adapter: inspect -> preview -> apply -> verify
                                      |
                        provider-specific skills/ delivery path
```

## Workspace ownership

| Path | Owner | Responsibility |
| --- | --- | --- |
| `apps/skills-catalog` | Skills Platform | Registry, catalog, evaluation, release, project assignments, REST API, CLI. |
| `apps/catalog-ui` | Skills Platform | Web UI (React 19, TypeScript, Vite) with modular workspaces (`ProjectWorkspace`, `SkillWorkspace`, `TemplateWorkspace`, `ReviewQueue`, `LiveActivationStatus`). |
| `packages/skill-contracts` | Skills Platform | Versioned TypeScript contracts, schemas, artifact taxonomy (`ArtifactType`, `InvocationMode`), and directory digests. |
| `packages/skills-manager-adapter` | Skills Platform | Reference delivery adapter (TypeScript) providing atomic preview, verified Windows junctions / symlinks, safe unlinking, and rollback. |

## Supported Artifact Types & Invocation Taxonomy

### 1. Platform Artifact Types (`ArtifactType`)
- **`skill`**: Standard procedural runbooks and progressive disclosure agent skills (`SKILL.md`).
- **`rule`**: Contextual guidelines and coding standards (`GEMINI.md`, `AGENTS.md`, `*.rule.md`).
- **`hook`**: Event lifecycle triggers (`hook.md`, `*.hook.sh`, `*.hook.js`).
- **`plugin`**: Composite bundles containing skills, rules, and configurations (`plugin.json`, `plugin.md`).
- **`mcp_server`**: Model Context Protocol integration declarations (`mcp.json`, `mcp.md`).

### 2. Invocation Taxonomy (`InvocationMode`)
- **`model_invoked`** (Reflexes): Autonomous engineering reflexes reached for by the agent during coding, refactoring, verification, or design.
- **`user_invoked`** (Commands): Explicitly executed by humans for high-impact or destructive operations to avoid agent bias (e.g. `hate`, `macrothink`, `re0-release`).
- **`hybrid`**: Can be used both as an autonomous reflex and an explicit human command.
- **`unspecified`**: Unclassified baseline.

## CLI adapter contract

The catalog issues an `ActivationPlan` containing only immutable identities and
requested delivery intent:

- `plan_id`, `schema_version`, `created_at`, and caller context;
- registry skill revision ID, source digest, and canonical artifact path;
- target project/worktree, provider, scope, and link-or-copy preference;
- desired enabled state and expected delivery path;
- collision strategy and required shared-root confirmation.

The Catalog calls the upstream CLI rather than importing Skills Manager source,
calling its Tauri commands, editing its configuration, or modifying a provider
root itself. The CLI returns an `ActivationReport` containing each examined
operation, its observed pre/post state, actual materialization method, errors,
and drift. It must reject a plan whose schema, revision digest, target scope,
or shared-root confirmation is invalid.

### Command routing

| Catalog intent | Skills Manager CLI boundary | Mutation |
| --- | --- | --- |
| Discover target and state | `projects`, `inspect`, `providers`, `bindings` | No |
| Check a planned binding | `skill preview` | No |
| Change one binding | `skill enable` / `skill disable` | Yes, explicit confirmation |
| Change a resolved set | `batch enable` / `batch disable` | Yes, explicit confirmation |
| Verify outcome | `providers`, `bindings` | No |

The bridge implements discovery, verification, and the confirmed per-skill CLI
write path. Before a write it resolves an immutable Catalog registry revision
to a Skills Manager `skill_instance_id`, and retains the following mapping as
plan evidence:
registry skill/revision/digest, manager instance ID, manager project ID,
provider/tool ID, inspected source path, and observation time. It must call
`skill preview` before every mutating command and record the upstream JSON
result before re-inspecting the target. Registry import into a Skills Manager
hub is a separate, explicit adoption action; applying a Catalog plan must never
silently import arbitrary source content.

## Distribution rules

1. Symbolic links are the default materialization method.
2. Copies are explicit fallbacks and retain their source revision/digest.
3. Disable/remove only changes a delivery binding; it never destroys a registry revision.
4. Upstream updates create reviewable candidate revisions; they do not change a binding automatically.
5. The catalog can request delivery, but only the adapter may mutate provider roots or configuration.
6. The CLI is the only supported Catalog-to-Skills-Manager control channel.

## Capability scoping and future runtime integration

The Platform minimizes capability and context at the policy boundary: project
presets and work-scope overlays select only the reviewed skills needed for a
task. It persists evidence and bounded reports, not agent reasoning traces or
unbounded tool logs. Any future runtime or CI integration needs a separately
versioned, reviewable execution contract; it must not weaken the current
preview, confirmation, or verification safeguards. See
[capability scoping and runtime integration principles](./agent-execution-principles.md)
for the design guidance and its current-contract boundary.
