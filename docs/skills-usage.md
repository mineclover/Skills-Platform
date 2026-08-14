# Skills usage guide

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

## 1. Import and review a skill revision

Inspect before importing; import preserves a canonical immutable copy. A newer
source revision is a review candidate until an operator approves it.

```bash
node apps/skills-catalog/src/cli.js source inspect <source-directory>
node apps/skills-catalog/src/cli.js import-local <source-directory> \
  --registry ./.skills-platform/registry
node apps/skills-catalog/src/cli.js source review approve <revision-id> \
  --catalog ./.skills-platform/catalog --registry ./.skills-platform/registry \
  --summary "Reviewed provenance, instructions, and intended use."
```

Use a skill profile and notes to describe when it should be used without
altering its canonical `SKILL.md`:

```bash
node apps/skills-catalog/src/cli.js skill profile set <lineage-id> \
  --catalog ./.skills-platform/catalog --registry ./.skills-platform/registry \
  --purpose "Review UI implementation" --use-when "Before merge" \
  --tag ui --tag review --provider codex --review-state reviewed
```

## 2. Compose project skill sets

Create a versioned preset from registry IDs and explicitly assign it to a
project. The `Pristine` preset is the baseline with no managed skills; use it
to define or return to a clean policy state.

```bash
node apps/skills-catalog/src/cli.js project add demo \
  --catalog ./.skills-platform/catalog --name Demo --path C:/work/demo \
  --provider codex --delivery-root C:/work/demo/.codex/skills \
  --upstream-project-id <skills-manager-project-id>
node apps/skills-catalog/src/cli.js preset create demo-review \
  --catalog ./.skills-platform/catalog --registry ./.skills-platform/registry \
  --name "Demo review" --skill <registry-skill-id>
node apps/skills-catalog/src/cli.js preset assign demo demo-review \
  --catalog ./.skills-platform/catalog
```

Use a work-scope overlay for a temporary or task-specific addition. An overlay
does not rewrite the pinned default preset.

```bash
node apps/skills-catalog/src/cli.js preset assign demo <overlay-preset-id> \
  --catalog ./.skills-platform/catalog --role work_scope_overlay \
  --work-scope implementation --priority 10
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
