# Project skill package management

This guide defines how this repository owns, reviews, and materializes its
skill-authoring packages without committing machine-specific state.

The [official Codex skills documentation](https://developers.openai.com/codex/skills)
documents repository discovery through `.agents/skills`, support for symlinked
skill directories, and a bundled system `skill-creator`. Skills Platform adds
immutable registry, recipe, review, preset, plan, and ownership layers around
that provider behavior.

## Authority and reconstruction boundary

The portable project source of truth is:

1. `skills-platform-authoring-recipe.json` for declared sources, immutable
   digests, invocation profiles, provider presets, and the Codex project
   declaration with project-relative `.agents/skills` delivery;
2. the editable canonical packages under `skills-packages/`;
3. the dedicated frozen instance snapshots under `skills-instances/`;
4. `.skills-platform/registry/registry.json` and its `revisions/` directories
   for immutable imported artifacts.

The following paths are ignored, local to one checkout, and reconstructible:

- `.skills-platform/catalog/` contains project registration, preset
  assignments, profiles, source reviews, analyses, plans, and reports;
- `.agents/skills/` contains adapter-owned discovery links;
- `~/.codex/config.toml` contains this machine's Codex enablement state.

Do not hand-edit a materialized link to change desired state. Change the
recipe, preset, or project override, generate a plan, and let the adapter
verify ownership before replacing or removing the binding.

## Package roles and provider split

| Package | Managed source role | Codex preset | Antigravity preset |
| --- | --- | --- | --- |
| `skill-authoring-standard` | Routes shared authoring work into the selected provider ruleset | Enabled | Enabled |
| `writing-great-skills` | Explicit-only Codex review of discovery, steering, disclosure, and pruning | Enabled | Excluded |
| `skill-creator` | Repository-pinned comparison and update-review source | Excluded | Excluded |

The repository copy of `skill-creator` remains importable, revisioned,
profiled, and analyzable. It is intentionally not delivered. Codex's bundled
system skill has the same `name`; Codex does not merge same-named skills and
may show both in selectors. The bundled system copy therefore remains the
active `$skill-creator` while the repository copy serves as governed evidence.

The active project in this repository is Codex. The recipe also carries the
`skills-platform-authoring-antigravity` preset so Antigravity requirements can
be reviewed without importing Codex-only invocation policy into that preset.
Antigravity activation requires a separate project registration and binding
review. A full reconciliation for one provider must not be pointed at another
provider project's independently managed root.

## Current local snapshot

Snapshot inspected at **2026-09-04 13:39 KST**:

- the three package sources have immutable registry revisions;
- the local Catalog contains `skills-platform-codex` and both provider
  presets; both presets are owned by Skills Platform and marked `reviewed`;
- `.agents/skills/skill-authoring-standard` and
  `.agents/skills/writing-great-skills` are managed links into immutable
  registry artifacts;
- `.agents/skills/skill-creator` is absent by design;
- no Antigravity project or binding is materialized.

This snapshot is not a Git-clean or test-pass claim. Re-run the inspection and
verification commands for the checkout being operated.

## Lifecycle

Run commands from the repository root. The examples make the local catalog and
registry explicit so a different working directory cannot select another
state store.

```bash
REPO_ROOT="$(git rev-parse --show-toplevel)"
CATALOG_ROOT="$REPO_ROOT/.skills-platform/catalog"
REGISTRY_ROOT="$REPO_ROOT/.skills-platform/registry"
RECIPE_PATH="$REPO_ROOT/skills-platform-authoring-recipe.json"
cd "$REPO_ROOT"
```

### 1. Inspect and validate the source packages

Validate each package against the provider contract it claims. The portable
router must pass both provider rulesets; the two community packages are
reviewed as Codex packages.

```bash
node apps/skills-catalog/src/cli.js skill validate \
  skills-packages/platform-core/skill-authoring-standard --provider codex
node apps/skills-catalog/src/cli.js skill validate \
  skills-packages/platform-core/skill-authoring-standard --provider antigravity
node apps/skills-catalog/src/cli.js skill validate \
  skills-packages/community-codex/writing-great-skills --provider codex
node apps/skills-catalog/src/cli.js skill validate \
  skills-packages/community-codex/skill-creator --provider codex
node apps/skills-catalog/src/cli.js recipe inspect "$RECIPE_PATH"
```

### 2. Import and reconcile declared metadata

Use the recipe rather than a separate `import-local` command for these three
packages. The recipe resolves its relative local locators from the recipe
directory, imports immutable revisions under stable locator identities,
verifies every declared content digest, updates profiles, reconciles the two
presets, and reconstructs the declared Codex project.
The project declaration resolves `delivery_root_relative: .agents/skills`
against the selected checkout instead of persisting a machine-specific prefix.

Without `--confirm`, this command still updates the local registry and Catalog;
only provider binding materialization remains a preview.

```bash
node apps/skills-catalog/src/cli.js recipe apply "$RECIPE_PATH" \
  --catalog "$CATALOG_ROOT" \
  --registry "$REGISTRY_ROOT" \
  --path "$REPO_ROOT" \
  --provider codex \
  --enabled-only
```

If a source changed without a matching recipe digest update, immutable
resolution fails. Inspect the change, update the recipe intentionally, and run
the command again; do not weaken digest matching.

### 3. Record source review

Import creates evidence; it is not approval. Review the immutable revision and
record a decision in the local Catalog:

```bash
node apps/skills-catalog/src/cli.js source review approve \
  SOURCE_REVISION_ID \
  --catalog "$CATALOG_ROOT" \
  --registry "$REGISTRY_ROOT" \
  --summary "Reviewed provider contract, package resources, and pinned digest."
```

Use `reject` instead of `approve` when the snapshot must not progress. Keep the
revision immutable; fix the source and import a new revision.

### 4. Verify profiles, presets, and project selection

```bash
node apps/skills-catalog/src/cli.js skill profile show LINEAGE_ID \
  --catalog "$CATALOG_ROOT" --registry "$REGISTRY_ROOT"
node apps/skills-catalog/src/cli.js preset show \
  skills-platform-authoring-codex \
  --catalog "$CATALOG_ROOT" --registry "$REGISTRY_ROOT"
node apps/skills-catalog/src/cli.js preset show \
  skills-platform-authoring-antigravity \
  --catalog "$CATALOG_ROOT" --registry "$REGISTRY_ROOT"
node apps/skills-catalog/src/cli.js project resolve \
  skills-platform-codex \
  --catalog "$CATALOG_ROOT" --registry "$REGISTRY_ROOT"
```

Confirm that the Codex effective set enables only
`skill-authoring-standard` and `writing-great-skills`. `skill-creator` should
remain represented in registry/profile views but disabled in the project plan.
Also confirm that both authoring presets report owner `Skills Platform` and
lifecycle `reviewed`, and that the project resolves its delivery root below the
current checkout rather than to a stale machine path.

### 5. Run revision-pinned analysis

Analysis is advisory and does not alter activation:

```bash
node apps/skills-catalog/src/cli.js skill analysis run LINEAGE_ID \
  --revision SOURCE_REVISION_ID \
  --catalog "$CATALOG_ROOT" --registry "$REGISTRY_ROOT"
node apps/skills-catalog/src/cli.js skill analysis list LINEAGE_ID \
  --catalog "$CATALOG_ROOT" --registry "$REGISTRY_ROOT"
```

Run it for every new or changed revision. A later source revision makes the old
result historical; it must not be silently treated as analysis of new content.

### 6. Generate and review an additive bootstrap plan

`--enabled-only` creates operations only for selected enabled skills. Use it
for first installation or recovery when unrelated bindings must remain
untouched.

```bash
node apps/skills-catalog/src/cli.js project-plan \
  skills-platform-codex --enabled-only \
  --catalog "$CATALOG_ROOT" --registry "$REGISTRY_ROOT"
node apps/skills-catalog/src/cli.js project apply \
  skills-platform-codex --enabled-only \
  --catalog "$CATALOG_ROOT" --registry "$REGISTRY_ROOT"
```

The first command exposes the immutable plan. The second is also preview-only
without `--confirm`. Review target paths, desired states, source revisions, and
content digests before applying:

```bash
node apps/skills-catalog/src/cli.js project apply \
  skills-platform-codex --enabled-only --confirm \
  --catalog "$CATALOG_ROOT" --registry "$REGISTRY_ROOT"
```

Additive bootstrap does not prove that stale managed bindings are absent.

### 7. Use full apply for exact reconciliation

A full plan represents the complete effective desired set. It includes
disabled operations for registry skills not selected by the project preset,
so it can remove stale adapter-owned bindings. It does not remove an unrelated
path that fails ownership verification.

```bash
# Preview exact reconciliation.
node apps/skills-catalog/src/cli.js project apply \
  skills-platform-codex \
  --catalog "$CATALOG_ROOT" --registry "$REGISTRY_ROOT"

# Apply only after the full preview is accepted.
node apps/skills-catalog/src/cli.js project apply \
  skills-platform-codex --confirm \
  --catalog "$CATALOG_ROOT" --registry "$REGISTRY_ROOT"
```

Use this mode for ongoing convergence, not as an unreviewed first bootstrap.

### 8. Verify applied state

Review the adapter report returned by apply, then resolve desired state and
repeat a preview. The selected bindings must resolve to the planned registry
revision and digest, and a repeated preview should report them as already
matching rather than propose replacement.

```bash
node apps/skills-catalog/src/cli.js project resolve \
  skills-platform-codex \
  --catalog "$CATALOG_ROOT" --registry "$REGISTRY_ROOT"
node apps/skills-catalog/src/cli.js history list \
  --project-id skills-platform-codex \
  --catalog "$CATALOG_ROOT" --registry "$REGISTRY_ROOT"
node apps/skills-catalog/src/cli.js project apply \
  skills-platform-codex --enabled-only \
  --catalog "$CATALOG_ROOT" --registry "$REGISTRY_ROOT"
```

On macOS, `ls -l .agents/skills` may be used as a supplemental check that the
two active links point below `.skills-platform/registry/revisions/`; the
adapter identity report, not the link text alone, is the verification record.

## Updating a managed package

1. Edit the source below `skills-packages/`.
2. Run the applicable Codex and/or Antigravity validation.
3. Inspect the source and update its pinned `content_digest` in
   `skills-platform-authoring-recipe.json`.
4. Apply the recipe without confirmation to import and resolve the new
   immutable revision.
5. Review the new source revision, verify its profile and preset version, and
   run revision-pinned analysis.
6. Preview an additive or exact project plan according to the intended
   operation, then confirm it.
7. Verify the adapter report and repeat the preview.

Never edit an artifact inside `.skills-platform/registry/revisions/`; a change
there breaks immutability rather than creating an update.

## Locator identity and cross-machine use

The current recipe uses local locators such as
`./skills-packages/platform-core/skill-authoring-standard`. They are resolved
relative to the recipe file, which makes this repository layout portable. The
locator string is also part of source identity. Preserve its spelling and do
not replace it with a Mac or Windows absolute path unless an intentional
lineage migration is being performed.

For a package that must move independently of this monorepo, use a Git source
and pin an immutable commit in the recipe. A Git locator plus resolved commit
is more stable across machines than a local path and makes the fetched source
identity independently reproducible. Mutable branch names are suitable for
checking update availability, not for a reviewed activation pin.

## Reconstructing a clone

If `.skills-platform/catalog/` or `.agents/skills/` is absent after cloning:

1. verify that the recipe, source packages, registry file, and referenced
   revision directories are present;
2. inspect and apply the recipe without `--confirm` to reconstruct local
   profiles, presets, and the Codex project;
3. use `project apply --enabled-only` to bootstrap the two selected links;
4. inspect the resulting state and use a full apply only when exact
   reconciliation is intended;
5. restart Codex if the adapter reports that Codex enablement changed.

Do not revive `scratch/sync-essential-skills.js` as a bootstrap mechanism. It
is retired because a hard-coded link sweep cannot preserve Catalog ownership,
provider separation, or immutable revision identity.
