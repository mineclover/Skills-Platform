# Skills Catalog UI

This app is the management surface for Skills Platform. It never writes a
provider `skills/` directory. It resolves and previews Catalog policy, then
hands a validated `ActivationPlan` to Skills Manager for materialization.

The navigation has three non-overlapping areas: **Skills** manages immutable
registry revisions, profile metadata, and review work; **Templates** composes
those skills into versioned membership; **Projects** assigns a template,
resolves a work scope, and applies a recorded plan. Project history remains in
Projects, while the review/source-adoption queues are part of Skills.

## Local prototype

```bash
npm install
npm run dev
```

Without configuration, the project screen is an interactive visual prototype.

## Connect a local Catalog

Start the local Catalog bridge in another terminal. The UI reads project
policy, effective skill sets, history, plan previews, and the evidence-derived
review queue. It can also record an explicit source review and create a new
template version from an approved revision; it does not apply a plan or mutate
a provider delivery path.

```bash
cd ../skills-catalog
node src/cli.js serve --catalog ../example/.skills-platform/catalog \
  --registry ../example/.skills-platform/registry --port 4300
```

Then launch the UI with the bridge URL:

```bash
$env:VITE_CATALOG_API = "http://127.0.0.1:4300"
npm run dev
```

The UI displays the first registered project, its pinned template and matching
overlays, every selected/disabled skill reason, and the adapter-ready preview.
It also calls the upstream Skills Manager inspector through the bridge and
shows separate live cards for global activation and the selected project's
current bindings. Refreshing those cards is read-only; configure
`SKILLS_MANAGER_DIR` for the bridge when the upstream submodule is not at
`apps/skills-manager`.
It also shows why any skill needs review—unreviewed metadata, declared risk,
feedback signals, missing current-revision evaluations, or failed/blocked
evaluation results. Imported source revisions that could replace a pinned
template skill appear in a separate decision queue. A reviewer must add a
decision note before approving or rejecting; approval only unlocks an explicit
new-version adoption and never repins an existing project.

The project inspector can also copy the resolved system prompt. Its content is
assembled from the project's pinned default/overlay templates for the selected
work scope, plus eligible injected notes. Copying is read-only and includes the
immutable registry revision and digest markers for each skill.

The inspector's **Apply through Skills Manager CLI** action records the exact
plan, asks for browser confirmation, then requests the bridge to resolve the
same revision in Skills Manager, preview every binding, apply through the
upstream CLI, and re-inspect the result. It never imports a missing Registry
skill into Skills Manager automatically; a matching upstream instance and
digest are required.

The **Skills** screen is backed by `GET /api/skills` and
`GET|POST /api/skills/:lineage/profile`. Saving a profile updates only Catalog
metadata such as purpose, use conditions, and review state; it does not create
a template revision or change a provider binding.

When connected to the local bridge, the same inspector can pin any registered
template—including `Pristine`—as that project's default. This changes only the
Catalog project-policy record; it does not apply a delivery plan or repin any
other project.

For each active work scope, the inspector can also select or clear one overlay
template. Replacing an overlay affects only that exact scope tag and preserves
the project's default template and other scope assignments.

The Templates navigation exposes the immutable membership editor: it lists the
latest Registry artifact for each skill, lets an operator select membership,
and saves a new template version. `Pristine` remains read-only by definition.
The same screen can create a new v1 template after the operator supplies an
identifier, a name, and at least one selected Registry skill.
