# Skills Usage Guide

Run every command in this guide from the repository root. For authoring rules,
start with the [skill authoring reference catalog](./skill-authoring-reference-catalog.md).

Skills Platform is the policy and evidence layer: it imports immutable source
revisions, records review, defines presets, resolves project intent, and creates
activation plans. A delivery adapter owns provider-path changes. A source,
registry entry, or preset is never active merely because it exists.

```text
source inspection -> immutable Registry revision -> review / analysis
                  -> versioned preset -> project selection
                  -> immutable ActivationPlan -> delivery adapter -> provider root
```

## 1. Query the live inventory

Do not rely on a checked-in list of preset names or skill counts. Catalog state
is local and evolves independently on each machine, while checked-in recipes
describe the portable desired package set. Query both before changing state:

```bash
node apps/skills-catalog/src/cli.js project list \
  --catalog ./.skills-platform/catalog
node apps/skills-catalog/src/cli.js preset list \
  --catalog ./.skills-platform/catalog
node apps/skills-catalog/src/cli.js skill list \
  --catalog ./.skills-platform/catalog \
  --registry ./.skills-platform/registry
node apps/skills-catalog/src/cli.js review queue \
  --catalog ./.skills-platform/catalog \
  --registry ./.skills-platform/registry
node apps/skills-catalog/src/cli.js recipe inspect \
  ./skills-platform-authoring-recipe.json
```

`skill search` provides a narrower live view without hard-coding registry IDs:

```bash
node apps/skills-catalog/src/cli.js skill search authoring \
  --catalog ./.skills-platform/catalog \
  --registry ./.skills-platform/registry --provider codex
```

## 2. Inspect, validate, and import a package

Inspection and provider conformance answer different questions:

```bash
node apps/skills-catalog/src/cli.js source inspect \
  ./skills-packages/platform-core/skill-authoring-standard
node apps/skills-catalog/src/cli.js skill validate \
  ./skills-packages/platform-core/skill-authoring-standard --provider codex
node apps/skills-catalog/src/cli.js skill validate \
  ./skills-packages/platform-core/skill-authoring-standard --provider antigravity
```

- `source inspect` sets `importable` from source discovery and manifest parsing.
  It means the source can be copied into the immutable Registry.
- Provider findings live under
  `skills[].authoring.results.codex` and
  `skills[].authoring.results.antigravity`. Their `summary.status` values report
  conformance to independently versioned authoring rulesets.
- Therefore, `importable: true` does **not** mean every provider result is
  conformant. A package may be safely importable yet nonconformant for Codex,
  Antigravity, or both.
- Importing never approves, selects, enables, or delivers a skill.

After reviewing the inspection, import the selected package and use the IDs in
the JSON result for review and analysis:

```bash
node apps/skills-catalog/src/cli.js import-local \
  ./skills-packages/platform-core/skill-authoring-standard \
  --registry ./.skills-platform/registry --skill skill-authoring-standard
node apps/skills-catalog/src/cli.js source review approve <source-revision-id> \
  --catalog ./.skills-platform/catalog \
  --registry ./.skills-platform/registry \
  --summary "Reviewed source, provider findings, and immutable digest."
node apps/skills-catalog/src/cli.js skill analysis run <lineage-id> \
  --catalog ./.skills-platform/catalog \
  --registry ./.skills-platform/registry --revision <source-revision-id>
```

## 3. Reconcile the checked-in authoring recipe

[`skills-platform-authoring-recipe.json`](../skills-platform-authoring-recipe.json)
is the portable project declaration for the maintained authoring packages. Its
relative local-source locators are resolved from the recipe directory, so it
continues to work after the repository is cloned elsewhere. It defines separate
Codex and Antigravity presets instead of treating their specifications as one
shared contract.

Inspect first, then reconcile Registry sources and presets without delivering:

```bash
node apps/skills-catalog/src/cli.js recipe inspect \
  ./skills-platform-authoring-recipe.json
node apps/skills-catalog/src/cli.js recipe apply \
  ./skills-platform-authoring-recipe.json \
  --catalog ./.skills-platform/catalog \
  --registry ./.skills-platform/registry
```

Because the tracked recipe declares no hooks, omitting `--path` imports the
pinned sources and reconciles its presets without provider delivery. Recipes
that declare hooks also reconcile those hooks. Catalog JSON remains
machine-local; the tracked recipe is the portable desired state. The repository
copy of `skill-creator` is retained for immutable review and comparison but is
intentionally absent from the Codex delivery preset, because Codex already
provides the bundled system skill with that name.

On a fresh Catalog, the tracked recipe can register its declared Codex project,
select the provider-matching default preset, and produce a non-mutating
reference-adapter preview in one command:

```bash
node apps/skills-catalog/src/cli.js recipe apply \
  ./skills-platform-authoring-recipe.json \
  --catalog ./.skills-platform/catalog \
  --registry ./.skills-platform/registry \
  --path . --provider codex --enabled-only
```

The equivalent explicit registration sequence is:

```bash
node apps/skills-catalog/src/cli.js project add skills-platform-codex \
  --catalog ./.skills-platform/catalog --name "Skills Platform · Codex" \
  --path . --provider codex
node apps/skills-catalog/src/cli.js preset assign \
  skills-platform-codex skills-platform-authoring-codex \
  --catalog ./.skills-platform/catalog --role default
node apps/skills-catalog/src/cli.js project resolve skills-platform-codex \
  --catalog ./.skills-platform/catalog \
  --registry ./.skills-platform/registry
```

When `recipe.projects` is present, `--provider` must match exactly one declared
project (provider aliases such as `agy` and `gemini` belong to the Antigravity
family). The CLI uses that project's ID, name, scope, delivery root, and default
preset. Recipes without project declarations retain the legacy fallback of a
path-derived project ID and first preset. The project-location flag is `--path`
(not `--project-path`):

```bash
node apps/skills-catalog/src/cli.js recipe apply ./recipe.json \
  --catalog ./.skills-platform/catalog \
  --registry ./.skills-platform/registry \
  --path /absolute/path/to/project --provider codex
```

This is a reference-adapter preview unless `--confirm` is supplied.
`--enabled-only` limits both preview and confirm to the selected enabled
revisions; omit it only when exact reconciliation should emit explicit disables
for every unselected Registry skill. Keep Codex
and Antigravity as separate project declarations and bindings even when both
use `.agents/skills`; the tracked recipe currently declares only the active
Codex project and retains the Antigravity preset for a separately registered
Antigravity target.

## 4. Codex and Antigravity contracts

Both providers require an exact-case `SKILL.md`, but their authoring and
discovery contracts differ:

| Concern | Codex | Antigravity |
| --- | --- | --- |
| Project discovery root | `<project>/.agents/skills` | `<project>/.agents/skills`; legacy `<project>/.agent/skills` is accepted by the platform |
| Global discovery root | `$HOME/.agents/skills` | `$HOME/.gemini/config/skills` |
| Required frontmatter | `name` and `description` | `description`; `name` may default from the folder |
| Optional resource directories | `scripts/`, `references/`, `assets/`, `agents/` | `scripts/`, `examples/`, `resources/` |
| Provider extension | Optional `agents/openai.yaml` for UI, invocation policy, and MCP dependencies | No `agents/openai.yaml` runtime contract; the file is ignored |
| Root symlink status | Documented and accepted | Not documented; validation emits a portability warning |

Codex projects must use `.agents/skills`; the CLI rejects another delivery
root. Antigravity projects default to `.agents/skills`, while the legacy
`.agent/skills` project root remains an explicit compatibility option.

Inspect the exact ruleset IDs, versions, and official sources at runtime:

```bash
node apps/skills-catalog/src/cli.js skill rulesets
```

## 5. Explicit-only is not disabled

There are three distinct pieces of state:

1. Catalog profile `invocation_mode` (`model_invoked`, `user_invoked`,
   `hybrid`, or `unspecified`) is management metadata used for search, recipes,
   and telemetry. It does not create or remove a provider binding.
2. In Codex `agents/openai.yaml`,
   `policy.allow_implicit_invocation: false` produces the authoring result
   `explicit_only`. The delivered and enabled skill remains available through
   an explicit `$skill-name` request; Codex should not select it implicitly.
3. Project/preset state `disabled` produces an activation-plan operation with
   `desired_state: "disabled"`. Delivery removes the managed binding and the
   Codex adapter reconciles the matching `[[skills.config]]` entry to
   `enabled = false` when an entry is present. This is an availability change,
   not an invocation-style preference.

After a Codex `skills.config` change, the adapter reports
`restart_required: true`; restart Codex before judging runtime discovery.

## 6. Preview and apply without crossing delivery boundaries

Two delivery paths exist for different purposes. Do not treat them as
interchangeable.

### Reference adapter: local development and contract verification

Generate one plan file, preview that file, and apply that same file:

```bash
node apps/skills-catalog/src/cli.js project-plan skills-platform-codex \
  --catalog ./.skills-platform/catalog \
  --registry ./.skills-platform/registry \
  --enabled-only \
  --out ./.skills-platform/skills-platform-codex-plan.json
node packages/skills-manager-adapter/src/cli.js preview \
  ./.skills-platform/skills-platform-codex-plan.json
node packages/skills-manager-adapter/src/cli.js apply \
  ./.skills-platform/skills-platform-codex-plan.json --confirm
```

This package materializes guarded symlinks/junctions or owned copies directly
and exists as a reference implementation and test harness. The convenience
command `project apply <id> [--confirm]` also uses this reference adapter; it is
not the production upstream Skills Manager bridge.

`--enabled-only` is an additive bootstrap mode: it includes only the selected
enabled revisions and leaves unrelated bindings and Codex config entries
untouched. Omit it for exact reconciliation, where the plan intentionally emits
disable operations for every unselected managed Registry skill. Pristine cannot
be combined with `--enabled-only` because Pristine is defined by those explicit
disable operations.

### Production bridge: recorded-plan, upstream Skills Manager flow

Start the loopback bridge from the repository root:

```bash
node apps/skills-catalog/src/cli.js serve \
  --catalog ./.skills-platform/catalog \
  --registry ./.skills-platform/registry --port 4300
```

The UI and HTTP clients use this sequence:

1. `POST /api/projects/<project-id>/activation-plan/preview` with
   `{"preflight":true}`. The bridge records the immutable plan and asks the
   upstream Skills Manager CLI to inspect, digest-match, and preview it.
2. Read `plan.plan_id` from that response.
3. `POST /api/activation-plans/<same-plan-id>/apply` with
   `{"confirmed":true}`, or use the corresponding `/apply/stream` endpoint.

The second call loads the stored plan rather than generating a replacement.
The bridge rejects an upstream instance whose digest does not match, never
imports it implicitly, applies through the upstream CLI, re-inspects bindings,
and stores the report. This same-plan flow is the production boundary.

## 7. Project overrides and reader-only explanations

An override pins an exact registry revision and changes desired state only. It
does not touch provider state until a previewed plan is confirmed:

```bash
node apps/skills-catalog/src/cli.js project skill skills-platform-codex \
  enable <lineage-id> --skill <registry-skill-id> \
  --catalog ./.skills-platform/catalog \
  --registry ./.skills-platform/registry
node apps/skills-catalog/src/cli.js project skill skills-platform-codex \
  inherit <lineage-id> --catalog ./.skills-platform/catalog \
  --registry ./.skills-platform/registry
```

Annotations and static analyses are reader sidecars. They never change source,
prompts, preset membership, invocation policy, or delivery:

```bash
node apps/skills-catalog/src/cli.js skill annotation add <lineage-id> \
  --catalog ./.skills-platform/catalog \
  --registry ./.skills-platform/registry \
  --revision <source-revision-id> --kind plain_language --locale ko-KR \
  --body "스킬의 목적과 사용 시점을 쉽게 설명합니다."
node apps/skills-catalog/src/cli.js skill analysis list <lineage-id> \
  --catalog ./.skills-platform/catalog \
  --registry ./.skills-platform/registry
```

## 8. Web workspaces

```bash
node apps/skills-catalog/src/cli.js serve
npm run --workspace @skills-platform/catalog-ui dev
```

The Skills workspace exposes immutable revisions, provider authoring results,
profiles, notes, annotations, analyses, and evidence. Templates and Projects
show versioned selection intent and effective-set reasons. Live provider state
comes from upstream inspection; desired state alone must not be presented as a
verified binding.
