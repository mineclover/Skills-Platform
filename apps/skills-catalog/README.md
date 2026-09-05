# Skills Catalog

The catalog application will own source import, immutable revision storage,
contracts, evaluation, skill-set releases, project/work-scope assignment, and
activation-plan generation.

It does not write provider `skills/` paths. Delivery is delegated to the
Skills Manager adapter through the shared contracts package.

All commands below run from the repository root. Query live Catalog and
Registry state instead of relying on a checked-in inventory or fixed counts.

## Core CLI

Inspection, import, review, profile, recipe reconciliation, and plan-export
commands do not mutate agent paths. A skill-delivery mutation occurs only through an
explicitly confirmed adapter path such as `project apply --confirm`,
`recipe apply --confirm` with `--path`, or the confirmed production bridge.

```bash
# Inspect local SKILL.md directories without executing third-party installers or mutating the registry.
node apps/skills-catalog/src/cli.js source inspect ./some-skills

# Import inspected local SKILL.md directories into the local registry.
node apps/skills-catalog/src/cli.js import-local ./some-skills \
  --registry ./.skills-platform/registry

# Resolve a Git ref to its commit, inspect the checked-out content, and import
# only the immutable registry copy. No installer or repository script runs.
node apps/skills-catalog/src/cli.js import-git \
  https://github.com/example/skills.git --ref main \
  --registry ./.skills-platform/registry

# Discover a newer commit without importing or adopting it automatically.
node apps/skills-catalog/src/cli.js source updates \
  --registry ./.skills-platform/registry

# After explicitly importing a candidate, approve the exact immutable revision.
node apps/skills-catalog/src/cli.js source review approve revision_candidate \
  --catalog ./.skills-platform/catalog \
  --registry ./.skills-platform/registry --summary "Reviewed the prompt diff and source provenance."

# Query the current projects, presets, and managed skills.
node apps/skills-catalog/src/cli.js project list --catalog ./.skills-platform/catalog
node apps/skills-catalog/src/cli.js preset list --catalog ./.skills-platform/catalog
node apps/skills-catalog/src/cli.js skill list --catalog ./.skills-platform/catalog \
  --registry ./.skills-platform/registry

# Generate the link-first request for the delivery adapter
node apps/skills-catalog/src/cli.js plan --registry ./.skills-platform/registry \
  --skill skill_example --provider codex --project-id demo \
  --project-path /absolute/path/to/demo \
  --delivery-root /absolute/path/to/demo/.agents/skills

# Inspect the independently versioned provider authoring contracts.
node apps/skills-catalog/src/cli.js skill rulesets

# Create only the requested package resources, then validate each provider independently.
node apps/skills-catalog/src/cli.js skill init my-skill --provider portable \
  --out ./skills-packages/local \
  --resources scripts,references --interface default_prompt='Use $my-skill for this task.'
node apps/skills-catalog/src/cli.js skill validate \
  ./skills-packages/local/my-skill --provider codex
node apps/skills-catalog/src/cli.js skill validate \
  ./skills-packages/local/my-skill --provider antigravity

# On-demand partial update: validate, ingest immutable revision, and deliver to project in one touch
node apps/skills-catalog/src/cli.js sync \
  ./skills-packages/local/my-skill --project demo --confirm
```

## Two-Tier Delivery Model: Direct Reference vs. Governed Snapshot

Skills Platform supports two complementary delivery modes (see [Skill Reference and Delivery Guide](../../docs/guides/skill-reference-and-delivery-guide.md)):

1. **Tier 1: Direct Reference Mode (Inner Loop Prototyping)**:
   - Symlink `.agents/skills/<skill>` directly to `skills-packages/<group>/<skill>`.
   - **Zero Sync Overhead**: File saves immediately reflect in project workspaces with no background watch daemons or compile steps. Just re-read the file in the agent.
   - Protected by companion sidecars (`method: "direct_source_symlink"`).
2. **Tier 2: Governed Snapshot Mode (Partial Update & Freeze)**:
   - Use `skills-catalog sync <skill> --project <id> --confirm` to atomically validate, ingest an immutable SHA-256 revision snapshot into the registry, and pin the project symlink.
   - Ideal for milestone releases, audit trails, and multi-machine environments.

## Portable recipes and project-local packages

A tracked recipe is the portable desired state; `.skills-platform/catalog`
remains machine-local state. Inspect and reconcile a recipe before registering
or delivering to a project:

```bash
node apps/skills-catalog/src/cli.js recipe inspect \
  ./skills-platform-authoring-recipe.json
node apps/skills-catalog/src/cli.js recipe apply \
  ./skills-platform-authoring-recipe.json \
  --catalog ./.skills-platform/catalog \
  --registry ./.skills-platform/registry
```

For a hook-free recipe such as this one, omitting `--path` imports pinned
sources and reconciles presets without creating provider bindings. Recipes that
declare hooks also reconcile those hooks. To let a recipe register and preview
a target, use the current `--path` flag:

```bash
node apps/skills-catalog/src/cli.js recipe apply ./recipe.json \
  --catalog ./.skills-platform/catalog \
  --registry ./.skills-platform/registry \
  --path /absolute/path/to/project --provider codex --enabled-only
```

If `recipe.projects` declares a matching provider, that path uses the declared
project identity and its provider-specific default preset. Recipes without a
project declaration retain the path-derived project/first-preset fallback.
The command uses the reference delivery adapter; omit `--confirm` for preview.
`--enabled-only` makes the operation additive; omit it for exact reconciliation
that explicitly disables every unselected managed Registry skill.
Register Codex and Antigravity as separate targets even if both use a project
`.agents/skills` root.

## Local Catalog bridge

The bridge gives the separate Catalog UI a local view of Catalog state. Its
single delivery write endpoint delegates only to the upstream Skills Manager
CLI; it never writes provider paths itself.

The bridge is bound to loopback by default and permits browser CORS only from
loopback origins. Hook endpoints are limited to the server workspace and
registered project roots. HTTP registration accepts existing script files
inside `.skills-platform/hooks`; trusted command, module, and webhook handlers
must be managed through the local CLI (or an explicit unsafe-handler server
opt-in), preventing arbitrary websites from turning the bridge into a shell.

```bash
node apps/skills-catalog/src/cli.js serve --catalog ./.skills-platform/catalog \
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

The production flow first calls `POST
/api/projects/:id/activation-plan/preview`, optionally with
`{"preflight":true}`. That endpoint records the immutable plan. The client then
passes the returned **same** `plan.plan_id` to `POST
/api/activation-plans/:id/apply` with `{"confirmed":true}` (or to its streaming
variant). Apply resolves each operation to an upstream instance with the
identical canonical digest, calls upstream `skill preview`, runs the upstream
CLI, and stores a post-apply provider/binding inspection. It rejects missing or
mismatched upstream skills instead of importing them implicitly.

This bridge path is distinct from `project apply`, which invokes the in-repo
reference adapter and can directly materialize guarded filesystem bindings for
development and contract tests. Production delivery uses the recorded-plan
upstream bridge so preview and confirmation cannot silently switch plans.

`GET /api/skills` exposes the managed skill catalog (lineage, latest immutable
revision, profile, and active notes). `GET|POST /api/skills/:lineage/profile`
reads or updates Catalog-only profile metadata. These endpoints support the
Skills UI and mirror the `skill list`, `skill search`, and `skill profile`
CLI group; they never change template membership or provider delivery.

`GET|POST /api/skills/:lineage/notes` lists or adds scoped usage notes. The
bridge validates the target scope and records whether a note may be injected
into a system prompt. This mirrors the `skill note` CLI group and leaves
template membership and provider delivery unchanged.

`GET|POST /api/skills/:lineage/annotations` and the annotation mutation
endpoints manage reader-only explanations. `POST
/api/skills/:lineage/analysis` creates a deterministic, revision-pinned static
analysis, and `GET /api/skills/:lineage/analyses` lists results with stale and
outdated status. These sidecars are structurally excluded from system prompts,
activation plans, recipes, and provider delivery.

`GET /api/skill-authoring/rulesets` exposes the official-source, independently
versioned Codex and Antigravity ruleset descriptors. `POST
/api/skill-authoring/validate` accepts only virtual package-relative file
content and returns execution-neutral provider findings; filesystem paths are
rejected. Revision analysis embeds the same two results, including exact
ruleset versions, without modifying canonical content or enablement.

`POST /api/projects/:id/skill-overrides/:lineage` sets an exact pinned desired
state or clears it with `desired_state: "inherit"`. Plan preview records the
immutable plan; clients must apply that same `plan_id` instead of generating a
new plan after confirmation.

`POST /api/activation-plans/:id/apply/stream` is the streaming form of the
confirmed apply endpoint. It emits NDJSON `progress` records for inspection,
immutable revision resolution, preview, each apply operation, and verification,
then a final `result` (or `error`) record. It does not bypass the same digest,
confirmation, or reporting safeguards.

## MVP catalog flow

```bash
# Register a project delivery target. It starts from Pristine.
node apps/skills-catalog/src/cli.js project add demo \
  --catalog ./.skills-platform/catalog \
  --name Demo --path /absolute/path/to/demo --provider codex \
  --delivery-root /absolute/path/to/demo/.agents/skills

# Create a reusable set from registry IDs, then make it the project's default.
node apps/skills-catalog/src/cli.js preset create demo-build \
  --catalog ./.skills-platform/catalog \
  --registry ./.skills-platform/registry --name "Demo build" --skill skill_example
node apps/skills-catalog/src/cli.js preset assign demo demo-build \
  --catalog ./.skills-platform/catalog

# Adoption changes the preset only by creating a new version; existing project
# pins remain unchanged until explicitly reassigned.
node apps/skills-catalog/src/cli.js preset adopt demo-build \
  --catalog ./.skills-platform/catalog \
  --registry ./.skills-platform/registry --skill skill_candidate

# Export a pinned plan; no provider path is changed.
node apps/skills-catalog/src/cli.js project-plan demo \
  --catalog ./.skills-platform/catalog \
  --registry ./.skills-platform/registry --enabled-only --out ./demo-plan.json

# Emit the complete, provenance-marked SKILL.md prompt content for another system.
node apps/skills-catalog/src/cli.js system-prompt \
  --catalog ./.skills-platform/catalog \
  --registry ./.skills-platform/registry --preset demo-build

# Add only explicitly prompt-enabled usage notes for a project context.
node apps/skills-catalog/src/cli.js system-prompt \
  --catalog ./.skills-platform/catalog \
  --registry ./.skills-platform/registry --preset demo-build \
  --project-id demo --include-notes
```

Codex project delivery is fixed to `<project>/.agents/skills`. Antigravity
defaults to the same project root and also permits legacy `.agent/skills`;
their global roots and package metadata rules differ, as described below.

## Reference-adapter verification

The in-repo adapter is a filesystem implementation for local development and
contract verification. Preview and apply the exact same exported plan file:

```bash
node packages/skills-manager-adapter/src/cli.js preview ./demo-plan.json
node packages/skills-manager-adapter/src/cli.js apply ./demo-plan.json --confirm
```

`node apps/skills-catalog/src/cli.js project apply demo` is a convenience
preview through that same reference adapter; adding `--confirm` performs its
direct apply. Neither command replaces the production bridge's recorded-plan,
upstream Skills Manager flow described above.

Pass `--enabled-only` to `project-plan` or `project apply` for additive
bootstrap: only selected enabled revisions are emitted, so unrelated bindings
and Codex config entries are left alone. Omit it for exact reconciliation,
which deliberately emits disabled operations for all unselected managed
Registry skills. Pristine is an exact-disable operation and rejects
`--enabled-only`.

## Provider authoring and activation semantics

Codex and Antigravity share the exact-case `SKILL.md` package root, but their
specifications remain independently versioned:

| Concern | Codex | Antigravity |
| --- | --- | --- |
| Project discovery | `<project>/.agents/skills` | `<project>/.agents/skills`; legacy `.agent/skills` is accepted |
| Global discovery | `$HOME/.agents/skills` | `$HOME/.gemini/config/skills` |
| Required frontmatter | `name`, `description` | `description`; `name` may default from the folder |
| Optional directories | `scripts`, `references`, `assets`, `agents` | `scripts`, `examples`, `resources` |
| Provider metadata | Optional `agents/openai.yaml` | No `openai.yaml` runtime contract |
| Root symlink | Documented and accepted | Undocumented; authoring validation warns |

Codex `agents/openai.yaml` can set
`policy.allow_implicit_invocation: false`. The authoring result is then
`explicit_only`: the delivered, enabled skill is still available through an
explicit `$skill-name` request, but Codex should not select it implicitly.
This is not the same as project/preset `disabled`, which emits
`desired_state: "disabled"`, removes the managed binding, and reconciles an
existing matching Codex `[[skills.config]]` entry to `enabled = false`.
Codex config changes report `restart_required: true`.

The Catalog profile taxonomy (`model_invoked`, `user_invoked`, `hybrid`, and
`unspecified`) is management metadata for search, recipes, and telemetry. It
does not itself enable or disable a provider binding.

## Skill profiles and usage notes

Registry skills have a stable `lineage_id`: source updates create new immutable
skill revisions while preserving the profile and its notes.

```bash
# Find the lineage ID and enrich the skill without changing its SKILL.md source.
node apps/skills-catalog/src/cli.js skill list \
  --catalog ./.skills-platform/catalog \
  --registry ./.skills-platform/registry
node apps/skills-catalog/src/cli.js skill profile set lineage_example \
  --catalog ./.skills-platform/catalog \
  --registry ./.skills-platform/registry --purpose "Review UI changes" \
  --use-when "Before frontend implementation" --tag design --tag review \
  --provider codex --review-state reviewed

# Keep a project-only caveat. It is excluded from prompts unless explicitly enabled.
node apps/skills-catalog/src/cli.js skill note add lineage_example \
  --catalog ./.skills-platform/catalog \
  --registry ./.skills-platform/registry --scope project --project-id demo \
  --kind caveat --body "Check keyboard navigation on the demo surface."

# Search combines skill metadata and active notes.
node apps/skills-catalog/src/cli.js skill search keyboard \
  --catalog ./.skills-platform/catalog \
  --registry ./.skills-platform/registry --tag design --provider codex

# Review a lineage's immutable revisions and its canonical SKILL.md delta.
node apps/skills-catalog/src/cli.js skill revisions lineage_example \
  --registry ./.skills-platform/registry
node apps/skills-catalog/src/cli.js skill diff \
  lineage_example revision_old revision_new \
  --registry ./.skills-platform/registry
```

## Per-project state overrides

An override pins an exact registry revision and changes desired state only.
It does not touch a provider until that exact previewed plan is confirmed.

```bash
node apps/skills-catalog/src/cli.js project skill demo enable lineage_example \
  --catalog ./.skills-platform/catalog --registry ./.skills-platform/registry \
  --skill skill_exact_revision
node apps/skills-catalog/src/cli.js project skill demo disable lineage_example \
  --catalog ./.skills-platform/catalog --registry ./.skills-platform/registry \
  --skill skill_exact_revision
node apps/skills-catalog/src/cli.js project skill demo inherit lineage_example \
  --catalog ./.skills-platform/catalog --registry ./.skills-platform/registry
```

## Reader-only annotations and static analysis

Reader annotations differ from usage notes: they have no prompt-injection or
activation controls and always report `execution_effect: "none"`. They are
stored outside immutable registry artifacts.

```bash
node apps/skills-catalog/src/cli.js skill annotation add lineage_example \
  --catalog ./.skills-platform/catalog --registry ./.skills-platform/registry \
  --revision revision_example --kind plain_language --locale ko-KR \
  --body "스킬의 목적과 사용 시점을 쉽게 설명합니다."
node apps/skills-catalog/src/cli.js skill analysis run lineage_example \
  --catalog ./.skills-platform/catalog --registry ./.skills-platform/registry \
  --revision revision_example
```

## Structured feedback and health

Feedback is append-only evidence tied to a skill lineage and, where relevant,
to a project, immutable revision, template, or activation run. It does not
silently modify source content or selection policy.

```bash
# Record a reviewed evaluation with explicit counters.
node apps/skills-catalog/src/cli.js skill feedback add lineage_example \
  --catalog ./.skills-platform/catalog --registry ./.skills-platform/registry \
  --scope project --project-id demo --outcome success --evidence evaluation \
  --summary "The task completed with the expected checks." \
  --metrics '{"attempted":1,"successful":1}'

# See the outcome/evidence breakdown, supplied counters, success rate, and
# conservative healthy / needs_review / unknown state.
node apps/skills-catalog/src/cli.js skill feedback summary lineage_example \
  --catalog ./.skills-platform/catalog --registry ./.skills-platform/registry
```

## Evaluation cases and review queue

An evaluation case is a versioned contract for one skill lineage. A run must
name an immutable source revision and give one result for every criterion. If
the contract changes, its version advances and the prior pass does not cover
the new version.

```bash
# Define an active, explicit evaluation contract.
node apps/skills-catalog/src/cli.js evaluation case create review-contract \
  --catalog ./.skills-platform/catalog --registry ./.skills-platform/registry \
  --lineage lineage_example --name "Review contract" \
  --objective "Confirm a review is scoped and evidenced" \
  --criterion "Explains the expected scope" \
  --criterion "Records verifiable evidence" --lifecycle active

# Record a human or external evaluator result against a pinned source revision.
node apps/skills-catalog/src/cli.js evaluation run record review-contract \
  --catalog ./.skills-platform/catalog --registry ./.skills-platform/registry \
  --revision revision_example --outcome passed --summary "Both checks passed." \
  --criterion-results '[{"criterion":"Explains the expected scope","outcome":"passed"},{"criterion":"Records verifiable evidence","outcome":"passed"}]'

# List inferred review work; it never changes a template or delivery target.
node apps/skills-catalog/src/cli.js review queue \
  --catalog ./.skills-platform/catalog \
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
node apps/skills-catalog/src/cli.js observed-state record demo \
  --catalog ./.skills-platform/catalog --provider codex \
  --inventory ./providers.json --bindings ./bindings.json
node apps/skills-catalog/src/cli.js observed-state compare <catalog-plan-id> \
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
node apps/skills-catalog/src/cli.js preset create frontend-build \
  --catalog ./.skills-platform/catalog \
  --registry ./.skills-platform/registry --name "Frontend build" \
  --purpose "Implement and verify interface changes" --work-scope ui \
  --owner frontend --lifecycle reviewed --skill skill_design --skill skill_test
node apps/skills-catalog/src/cli.js preset note add frontend-build \
  --catalog ./.skills-platform/catalog \
  --body "Use only after discovery and planning are complete."
node apps/skills-catalog/src/cli.js preset show frontend-build \
  --catalog ./.skills-platform/catalog --version 1

# Updating creates v2; compare, then explicitly pin a project to that version.
node apps/skills-catalog/src/cli.js preset update frontend-build \
  --catalog ./.skills-platform/catalog \
  --registry ./.skills-platform/registry --purpose "Implement, review, and verify UI changes"
node apps/skills-catalog/src/cli.js preset compare frontend-build 1 2 \
  --catalog ./.skills-platform/catalog
node apps/skills-catalog/src/cli.js preset assign demo frontend-build \
  --catalog ./.skills-platform/catalog --version 2

# Inspect the exact pinned version and why each managed skill is selected or disabled.
node apps/skills-catalog/src/cli.js project resolve demo \
  --catalog ./.skills-platform/catalog \
  --registry ./.skills-platform/registry

# Add verification skills only for implementation work. The base assignment remains pinned.
node apps/skills-catalog/src/cli.js preset assign demo verification \
  --catalog ./.skills-platform/catalog \
  --version 1 --role work_scope_overlay --priority 10 --work-scope implementation
node apps/skills-catalog/src/cli.js project resolve demo \
  --catalog ./.skills-platform/catalog \
  --registry ./.skills-platform/registry --work-scope implementation

# Preserve an immutable plan record, then attach a report returned by the delivery adapter.
node apps/skills-catalog/src/cli.js history record-plan demo \
  --catalog ./.skills-platform/catalog \
  --registry ./.skills-platform/registry --work-scope implementation
node apps/skills-catalog/src/cli.js history record-report <plan-id> \
  --catalog ./.skills-platform/catalog \
  --file ./activation-report.json
```
