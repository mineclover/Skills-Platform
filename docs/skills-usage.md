# Skills usage guide

For guidance on authoring or revising a skill, start with the
[skill authoring reference catalog](./skill-authoring-reference-catalog.md).
This guide covers the separate task of importing, reviewing, selecting, and
delivering a skill through Skills Platform.

## Two complementary layers

Skills Platform manages **intent**: which immutable skill revisions are
approved, selected for a project, and relevant to a work scope. Skills Manager
manages **delivery**: which matching upstream skill instance is enabled for a
provider and where the provider receives it.

```text
source review -> Catalog registry -> preset / project / work scope
                                      -> immutable activation plan
                                      -> Skills Manager CLI -> provider binding
```

An agent-visible `skills/` directory is a delivery endpoint, not a registry.
Do not edit it as a way to change Catalog policy.

## Control surfaces

The Catalog and the preserved Skills Manager deliberately expose parallel
operator surfaces: each has a scriptable CLI and a UI, but they own different
state. Use one source of truth for each action.

| Area | Catalog CLI / UI owns | Skills Manager CLI / UI owns |
| --- | --- | --- |
| Skills | Immutable revision, profile, intended use, review state, notes, feedback | Upstream skill instance and provider availability |
| Templates | Versioned membership of Catalog skills | Upstream presets, if independently needed for delivery |
| Projects | Default template, work-scope overlays, pinned activation plan, policy history | Project discovery and provider binding scope |
| Apply | Records and verifies a reviewed plan | Previews and changes the actual provider binding |

In the Catalog UI, use the **Skills** page for skill metadata and review work,
**Templates** only to compose skill membership, and **Projects** to select and
apply a set. History is shown with its project; review and source-adoption work
is shown with its skill. This removes duplicate navigation without merging
Catalog policy into upstream delivery.

The matching Catalog CLI group is `skill`:

```bash
node apps/skills-catalog/src/cli.js skill list \
  --catalog ./.skills-platform/catalog --registry ./.skills-platform/registry
node apps/skills-catalog/src/cli.js skill search review \
  --catalog ./.skills-platform/catalog --registry ./.skills-platform/registry
node apps/skills-catalog/src/cli.js skill profile set <lineage-id> \
  --catalog ./.skills-platform/catalog --registry ./.skills-platform/registry \
  --purpose "Review UI implementation" --use-when "Before merge" \
  --review-state reviewed
```

The Skills UI exposes the same profile scope and also records global feedback
with its outcome and evidence type. It shows the derived `unknown`, `healthy`,
or `needs_review` health state, the evidence count, and recent entries. This
evidence updates Catalog review work only; it does not activate or deactivate
a provider skill.

Skills also manages global usage notes. A note has an explicit kind and is
included in a copied system prompt only when its prompt-injection flag is set.
The UI displays the latest immutable revision's evaluation coverage and pass
rate; defining evaluation cases and recording detailed criteria remains
available through the `evaluation` CLI group.

## 1. Import and review a skill revision

Inspect before importing; import preserves a canonical immutable copy. You can import from a local folder or directly from a Git repository (such as [Paperthin](https://github.com/LilMGenius/paperthin)).

```bash
# Local directory import
node apps/skills-catalog/src/cli.js source inspect <source-directory>
node apps/skills-catalog/src/cli.js import-local <source-directory> \
  --registry ./.skills-platform/registry

# Remote Git repository import
node apps/skills-catalog/src/cli.js import-git https://github.com/LilMGenius/paperthin \
  --registry ./.skills-platform/registry

# Approve an imported revision
node apps/skills-catalog/src/cli.js source review approve <revision-id> \
  --catalog ./.skills-platform/catalog --registry ./.skills-platform/registry \
  --summary "Reviewed provenance, instructions, and intended use."
```

Use a skill profile and notes to describe when it should be used and whether it is a model reflex or user command, without altering its canonical `SKILL.md`:

```bash
node apps/skills-catalog/src/cli.js skill profile set <lineage-id> \
  --catalog ./.skills-platform/catalog --registry ./.skills-platform/registry \
  --purpose "Review UI implementation" --use-when "Before merge" \
  --invoker user_invoked --tag ui --tag review --provider codex --review-state reviewed

# Search skills by invocation mode
node apps/skills-catalog/src/cli.js skill search --invoker user_invoked
node apps/skills-catalog/src/cli.js skill search --invoker model_invoked
```

## 2. Compose and activate project skill sets (Multi-Provider)

Register project targets for different assistant providers (**Codex**, **Antigravity / AGY**, **Claude**), assign templates, and activate them:

```bash
# Register a Codex project (defaults delivery-root to <path>/skills)
node apps/skills-catalog/src/cli.js project add my-project \
  --name "My Project" --path C:/work/my-project --provider codex

# Register an Antigravity project (defaults delivery-root to <path>/.agents/skills)
node apps/skills-catalog/src/cli.js project add my-project-agy \
  --name "My Project AGY" --path C:/work/my-project --provider antigravity

# Assign a template (e.g. paperthin-reflexes)
node apps/skills-catalog/src/cli.js preset assign my-project-agy paperthin-reflexes --version 2

# Preview and apply in one step
node apps/skills-catalog/src/cli.js project apply my-project-agy              # Preview
node apps/skills-catalog/src/cli.js project apply my-project-agy --confirm    # Confirmed apply
```

Use a work-scope overlay for a temporary or task-specific addition. An overlay
does not rewrite the pinned default preset:

```bash
node apps/skills-catalog/src/cli.js preset assign my-project <overlay-preset-id> \
  --catalog ./.skills-platform/catalog --role work_scope_overlay \
  --work-scope review --priority 10
```

## 3. Inspect the upstream delivery state

Run these commands from `apps/skills-manager`. They are read-only and reveal
the project ID, provider availability, and current bindings.

```bash
npm run inspect -- project list -- --json
npm run inspect -- providers -- --project <project-id> --json
npm run inspect -- bindings -- --project <project-id> --json
```

The Catalog project's `upstream_project_id` must identify the Skills Manager
project that owns the target provider binding. The UI can show this state via
the local Catalog bridge; set `SKILLS_MANAGER_DIR` only when the upstream
checkout is outside `apps/skills-manager`.

## 4. Preview and apply a selected set

Create a pinned plan first. In the Catalog UI, use **Preview activation plan**
to inspect the resolved set, then **Apply through Skills Manager CLI** and
confirm the browser prompt.

The bridge follows this safety sequence:

1. Records the immutable Catalog plan.
2. Inspects Skills Manager and matches every operation by name, scope, project,
   and canonical content digest.
3. Calls `skill preview` for each binding.
4. Calls `skill enable` or `skill disable` only after confirmation, adding
   `--confirm-shared` only when the reviewed plan authorizes shared-root impact.
5. Re-inspects providers and bindings, then stores an activation report.

While an apply is running, `POST /api/activation-plans/:id/apply/stream`
returns newline-delimited JSON progress events for `inspect`, immutable
revision `resolve`, `preview`, each `apply`, and `verify`. The Catalog UI uses
these events to show the live stage and progress bar; the final stream record
contains the same stored activation report as the non-streaming endpoint.

A missing or digest-mismatched upstream skill is rejected. Catalog never
imports it into Skills Manager automatically. Create or import that upstream
instance through the Skills Manager workflow, review it, and retry the plan.

## 5. Monitor, evaluate, and improve

Record feedback and revision-pinned evaluation outcomes against the stable
lineage. These records inform review queues; they do not silently change a
preset or an active provider binding.

```bash
node apps/skills-catalog/src/cli.js skill feedback add <lineage-id> \
  --catalog ./.skills-platform/catalog --registry ./.skills-platform/registry \
  --scope project --project-id demo --outcome success --evidence evaluation \
  --summary "Task and validation completed."
node apps/skills-catalog/src/cli.js review queue \
  --catalog ./.skills-platform/catalog --registry ./.skills-platform/registry
```

Copying the system prompt is independent of delivery. It emits the pinned
`SKILL.md` content and eligible notes for use in another system, but it does
not enable a provider binding.
