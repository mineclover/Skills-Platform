# Skills Catalog

The catalog application will own source import, immutable revision storage,
contracts, evaluation, skill-set releases, project/work-scope assignment, and
activation-plan generation.

It does not write provider `skills/` paths. Delivery is delegated to the
Skills Manager adapter through the shared contracts package.

## Core CLI

The initial CLI works with local sources and produces immutable delivery plans;
it does not perform agent-path mutations.

```bash
# Inspect local SKILL.md directories without executing third-party installers or mutating the registry.
node src/cli.js source inspect ../some-skills

# Import inspected local SKILL.md directories into the local registry.
node src/cli.js import-local ../some-skills --registry ./.skills-platform/registry

# Resolve a Git ref to its commit, inspect the checked-out content, and import
# only the immutable registry copy. No installer or repository script runs.
node src/cli.js import-git https://github.com/example/skills.git --ref main \
  --registry ./.skills-platform/registry

# Discover a newer commit without importing or adopting it automatically.
node src/cli.js source updates --registry ./.skills-platform/registry

# After explicitly importing a candidate, approve the exact immutable revision.
node src/cli.js source review approve revision_candidate --catalog ./.skills-platform/catalog \
  --registry ./.skills-platform/registry --summary "Reviewed the prompt diff and source provenance."

# List registered artifacts and copy the emitted registry IDs
node src/cli.js list --registry ./.skills-platform/registry

# Generate the link-first request for the delivery adapter
node src/cli.js plan --registry ./.skills-platform/registry \
  --skill skill_example --provider codex --project-id demo \
  --project-path C:/work/demo --delivery-root C:/work/demo/.agents/skills
```

## Local Catalog bridge

The bridge gives the separate Catalog UI a local view of Catalog state. Its
single delivery write endpoint delegates only to the upstream Skills Manager
CLI; it never writes provider paths itself.

```bash
node src/cli.js serve --catalog ./.skills-platform/catalog \
  --registry ./.skills-platform/registry --port 4300
```

Available endpoints are `GET /api/projects`, `GET
/api/projects/:id/effective-set`, `GET /api/projects/:id/history`, and `POST
/api/projects/:id/activation-plan/preview`. `POST
/api/projects/:id/activation-plan` records a plan before sending it to an
adapter; `POST /api/activation-plans/:id/report` stores the report returned by
that adapter. `GET|POST /api/skills/:lineage/feedback` records or reads
structured evidence, and `GET /api/skills/:lineage/feedback-summary` provides
its aggregate health indicators. `GET|POST /api/evaluation-cases` and
`GET|POST /api/evaluation-cases/:id/runs` manage revision-pinned evaluation
evidence; `GET /api/skills/:lineage/evaluation-summary` and `GET
/api/review-queue` expose derived evaluation and review state. None of these policy and evidence
endpoints applies a delivery operation. `GET|POST
/api/projects/:id/observed-state` retains provider snapshots, while `GET
/api/activation-plans/:id/observed-state-comparison` compares a pinned plan
with the latest matching snapshot.

`POST /api/activation-plans/:id/apply` is the sole write endpoint. It requires
`{"confirmed":true}`, resolves each plan operation to an upstream instance with
the identical canonical digest, calls `skill preview`, runs the upstream CLI,
and stores its report with a post-apply provider/binding inspection. It rejects
missing or mismatched upstream skills instead of importing them implicitly.

`GET /api/skills` exposes the managed skill catalog (lineage, latest immutable
revision, profile, and active notes). `GET|POST /api/skills/:lineage/profile`
reads or updates Catalog-only profile metadata. These endpoints support the
Skills UI and mirror the `skill list`, `skill search`, and `skill profile`
CLI group; they never change template membership or provider delivery.

`POST /api/activation-plans/:id/apply/stream` is the streaming form of the
confirmed apply endpoint. It emits NDJSON `progress` records for inspection,
immutable revision resolution, preview, each apply operation, and verification,
then a final `result` (or `error`) record. It does not bypass the same digest,
confirmation, or reporting safeguards.

## MVP catalog flow

```bash
# Register a project delivery target. It starts from Pristine.
node src/cli.js project add demo --catalog ./.skills-platform/catalog \
  --name Demo --path C:/work/demo --provider codex \
  --delivery-root C:/work/demo/.agents/skills

# Create a reusable set from registry IDs, then make it the project's default.
node src/cli.js preset create demo-build --catalog ./.skills-platform/catalog \
  --registry ./.skills-platform/registry --name "Demo build" --skill skill_example
node src/cli.js preset assign demo demo-build --catalog ./.skills-platform/catalog

# Adoption changes the preset only by creating a new version; existing project
# pins remain unchanged until explicitly reassigned.
node src/cli.js preset adopt demo-build --catalog ./.skills-platform/catalog \
  --registry ./.skills-platform/registry --skill skill_candidate

# Export a pinned plan for the Skills Manager delivery adapter; no provider path is changed.
node src/cli.js project-plan demo --catalog ./.skills-platform/catalog \
  --registry ./.skills-platform/registry --out ./demo-plan.json

# Emit the complete, provenance-marked SKILL.md prompt content for another system.
node src/cli.js system-prompt --catalog ./.skills-platform/catalog \
  --registry ./.skills-platform/registry --preset demo-build

# Add only explicitly prompt-enabled usage notes for a project context.
node src/cli.js system-prompt --catalog ./.skills-platform/catalog \
  --registry ./.skills-platform/registry --preset demo-build \
  --project-id demo --include-notes
```

## Skill profiles and usage notes

Registry skills have a stable `lineage_id`: source updates create new immutable
skill revisions while preserving the profile and its notes.

```bash
# Find the lineage ID and enrich the skill without changing its SKILL.md source.
node src/cli.js skill list --catalog ./.skills-platform/catalog \
  --registry ./.skills-platform/registry
node src/cli.js skill profile set lineage_example --catalog ./.skills-platform/catalog \
  --registry ./.skills-platform/registry --purpose "Review UI changes" \
  --use-when "Before frontend implementation" --tag design --tag review \
  --provider codex --review-state reviewed

# Keep a project-only caveat. It is excluded from prompts unless explicitly enabled.
node src/cli.js skill note add lineage_example --catalog ./.skills-platform/catalog \
  --registry ./.skills-platform/registry --scope project --project-id demo \
  --kind caveat --body "Check keyboard navigation on the demo surface."

# Search combines skill metadata and active notes.
node src/cli.js skill search keyboard --catalog ./.skills-platform/catalog \
  --registry ./.skills-platform/registry --tag design --provider codex

# Review a lineage's immutable revisions and its canonical SKILL.md delta.
node src/cli.js skill revisions lineage_example --registry ./.skills-platform/registry
node src/cli.js skill diff lineage_example revision_old revision_new \
  --registry ./.skills-platform/registry
```

## Structured feedback and health

Feedback is append-only evidence tied to a skill lineage and, where relevant,
to a project, immutable revision, template, or activation run. It does not
silently modify source content or selection policy.

```bash
# Record a reviewed evaluation with explicit counters.
node src/cli.js skill feedback add lineage_example \
  --catalog ./.skills-platform/catalog --registry ./.skills-platform/registry \
  --scope project --project-id demo --outcome success --evidence evaluation \
  --summary "The task completed with the expected checks." \
  --metrics '{"attempted":1,"successful":1}'

# See the outcome/evidence breakdown, supplied counters, success rate, and
# conservative healthy / needs_review / unknown state.
node src/cli.js skill feedback summary lineage_example \
  --catalog ./.skills-platform/catalog --registry ./.skills-platform/registry
```

## Evaluation cases and review queue

An evaluation case is a versioned contract for one skill lineage. A run must
name an immutable source revision and give one result for every criterion. If
the contract changes, its version advances and the prior pass does not cover
the new version.

```bash
# Define an active, explicit evaluation contract.
node src/cli.js evaluation case create review-contract \
  --catalog ./.skills-platform/catalog --registry ./.skills-platform/registry \
  --lineage lineage_example --name "Review contract" \
  --objective "Confirm a review is scoped and evidenced" \
  --criterion "Explains the expected scope" \
  --criterion "Records verifiable evidence" --lifecycle active

# Record a human or external evaluator result against a pinned source revision.
node src/cli.js evaluation run record review-contract \
  --catalog ./.skills-platform/catalog --registry ./.skills-platform/registry \
  --revision revision_example --outcome passed --summary "Both checks passed." \
  --criterion-results '[{"criterion":"Explains the expected scope","outcome":"passed"},{"criterion":"Records verifiable evidence","outcome":"passed"}]'

# List inferred review work; it never changes a template or delivery target.
node src/cli.js review queue --catalog ./.skills-platform/catalog \
  --registry ./.skills-platform/registry
```

## Skills Manager observed state

The existing Skills Manager remains an independent upstream application. Its
`skills-manager-inspect` CLI can produce provider and binding snapshots without
changing delivery state; Catalog retains those snapshots and compares them with
an immutable recorded plan.

```bash
# Run these from the upstream Skills Manager checkout.
npm run inspect -- providers --project <manager-project-id> --json > providers.json
npm run inspect -- bindings --project <manager-project-id> --provider codex --json > bindings.json

# Record the observation against the Catalog project, then check for drift.
node src/cli.js observed-state record demo \
  --catalog ./.skills-platform/catalog --provider codex \
  --inventory ./providers.json --bindings ./bindings.json
node src/cli.js observed-state compare <catalog-plan-id> \
  --catalog ./.skills-platform/catalog
```

Comparison is observational: it reports `matched`, `missing`, `disabled`,
`still_enabled`, `conflict`, or `provider_unavailable`. It never changes the
upstream Skills Manager, the registry, or an agent delivery path.

When the Catalog bridge runs beside the `apps/skills-manager` submodule, its
`/api/upstream-status` and `/api/projects/:id/upstream-status` endpoints invoke
the same inspector directly. The first endpoint reports global bindings; the
second uses the Catalog project's `upstream_project_id` (defaulting to the
Catalog project ID) to report the corresponding project bindings. Set
`SKILLS_MANAGER_DIR` when the upstream checkout is elsewhere. Both endpoints
are read-only and power the live status cards in Catalog UI.
The bridge prefers an already built inspector binary and falls back to
`npm run inspect`; set `SKILLS_MANAGER_INSPECT_PATH` to select a different
binary explicitly.

## Versioned preset templates

Template edits create a new version. A project assignment pins the version it
was given, so an updated template is never adopted implicitly.

```bash
# Create a reviewed work template, inspect its immutable version, and annotate why it exists.
node src/cli.js preset create frontend-build --catalog ./.skills-platform/catalog \
  --registry ./.skills-platform/registry --name "Frontend build" \
  --purpose "Implement and verify interface changes" --work-scope ui \
  --owner frontend --lifecycle reviewed --skill skill_design --skill skill_test
node src/cli.js preset note add frontend-build --catalog ./.skills-platform/catalog \
  --body "Use only after discovery and planning are complete."
node src/cli.js preset show frontend-build --catalog ./.skills-platform/catalog --version 1

# Updating creates v2; compare, then explicitly pin a project to that version.
node src/cli.js preset update frontend-build --catalog ./.skills-platform/catalog \
  --registry ./.skills-platform/registry --purpose "Implement, review, and verify UI changes"
node src/cli.js preset compare frontend-build 1 2 --catalog ./.skills-platform/catalog
node src/cli.js preset assign demo frontend-build --catalog ./.skills-platform/catalog --version 2

# Inspect the exact pinned version and why each managed skill is selected or disabled.
node src/cli.js project resolve demo --catalog ./.skills-platform/catalog \
  --registry ./.skills-platform/registry

# Add verification skills only for implementation work. The base assignment remains pinned.
node src/cli.js preset assign demo verification --catalog ./.skills-platform/catalog \
  --version 1 --role work_scope_overlay --priority 10 --work-scope implementation
node src/cli.js project resolve demo --catalog ./.skills-platform/catalog \
  --registry ./.skills-platform/registry --work-scope implementation

# Preserve an immutable plan record, then attach a report returned by the delivery adapter.
node src/cli.js history record-plan demo --catalog ./.skills-platform/catalog \
  --registry ./.skills-platform/registry --work-scope implementation
node src/cli.js history record-report <plan-id> --catalog ./.skills-platform/catalog \
  --file ./activation-report.json
```
