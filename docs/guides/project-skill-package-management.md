# Project skill package management

This guide defines how this repository owns, reviews, and materializes its
usage and skill-authoring packages without committing machine-specific state.
For direct installation with Vercel Skills CLI and the choice of management
method, start with the [official platform installation guide](./skills-installation-guide.md).
The procedure below applies to Catalog-managed packages.

The [official Codex skills documentation](https://developers.openai.com/codex/skills)
documents repository discovery through `.agents/skills`, support for symlinked
skill directories, and a bundled system `skill-creator`. Skills Platform adds
immutable registry, recipe, review, preset, plan, and ownership layers around
that provider behavior.

## Authority and reconstruction boundary

The portable project source of truth is:

1. `skills-platform-authoring-recipe.json` for declared sources, immutable
   digests, invocation metadata, provider preset versions, and the Codex project
   declaration with project-relative `.agents/skills` delivery;
2. `skills-platform-project-recipe.json` for an exported project selection,
   portable profiles, pinned assignments, and its review policy;
3. the editable canonical packages under `skills-packages/`;
4. the dedicated frozen instance snapshots under `skills-instances/`;
5. `.skills-platform/registry/registry.json` and its `revisions/` directories
   for immutable imported artifacts.

The following paths are ignored, local to one checkout, and reconstructible:

- `.skills-platform/catalog/` contains project registration, preset
  assignments, profiles, source reviews, analyses, plans, and reports;
- Skills Manager's local configuration contains its project registrations;
  the Catalog stores the corresponding `upstream_project_id` mapping;
- `.agents/skills/` contains adapter-owned discovery links;
- `~/.codex/config.toml` contains this machine's Codex enablement state.

Do not hand-edit a materialized link to change desired state. Change the
recipe, preset, or project override, generate a plan, and let the adapter
verify ownership before replacing or removing the binding.

### Portable recipe metadata and local evidence

Recipe schema **1** supports optional metadata additions. `skills[].profile`
exports the allowlisted classification fields: artifact/invocation type,
title, summary, purpose, use/avoid conditions, tags, domains, work scopes,
owner, maintainers, visibility, provider/runtime requirements, risk level,
and `review_state`. Presets carry owner, lifecycle, purpose, description,
work scopes, and the exact version snapshots needed by project assignments.

`projects[].preset_assignments` preserves `preset_id`, `template_version`,
`role`, `priority`, `work_scope_tags`, and `enabled`, including recommendations
and disabled overlays. The roles are `default`, `recommended`, and
`work_scope_overlay`; an explicit list must contain exactly one default that
matches `default_preset_id` and any declared `default_preset_version`. Each
assignment must refer to a preset ID and version declared in the recipe.
Exporting a project includes those pinned snapshots even if the Catalog's
active preset version has since changed. A recommendation remains a
recommendation after import; it does not join the default effective set.

On a fresh Catalog, declared preset versions are retained. Where a local
version number already represents different content, import preserves the
existing snapshot and maps the declaration to a matching or new local
version. Inspect the returned `recipe_version` → `template_version` mapping
and resolved assignments. Do not infer content identity from a version number
alone. Reapplying unchanged declarations should reuse the same local version.

Omitted optional profile/preset fields preserve existing local values; declared
top-level skill `artifact_type`, `invocation_mode`, and `description` still
update their corresponding classification or summary values. Legacy
recipes without `preset_assignments` reconcile the default assignment while
preserving additional local assignments; an explicit list declares the full
assignment set. A recipe may strengthen an existing project's review policy
to `require_approved`, but omission or `advisory` does not downgrade it.

Source-review decisions, evaluation evidence, local review timestamps, plans,
reports, Manager IDs, and absolute project paths are not exported as portable
approval. Profile `review_state: reviewed` and preset `lifecycle: reviewed`
are classification labels; the target Catalog must approve each source
revision independently. The recipe is not a complete backup of every Catalog
field, including project skill overrides. Contract and behavior are defined in
[recipe types](../../packages/skill-contracts/src/types.ts),
[validation](../../packages/skill-contracts/src/index.ts), and
[recipe import/export](../../apps/skills-catalog/src/recipes.js).

### Work scope matching

Catalog overlays match when **all** assignment tags are present in the
requested work scopes. For CLI planning, repeat `--work-scope` for each tag;
for example, `--work-scope integration --work-scope audit`. Store these
conditions as an array in recipes rather than joining them into a string.

Skills Manager's skill-set store **v3** supports an optional
`work_scope_tags` array. This is a Manager storage version; portable recipe
schema remains **1**. When the array is present it is authoritative, while
`work_scope` remains a display label. Manager normalizes surrounding
whitespace and duplicate tags while preserving case.

| Manager assignment input | Overlay match |
| --- | --- |
| `work_scope_tags: ["integration", "audit"]` | Both tags must be requested; additional requested tags are allowed |
| `work_scope_tags: []` | Matches every scope, including an empty requested tag set |
| No array, `work_scope: "integration"` | Legacy singleton tag `integration` |
| No array, `work_scope: "integration,audit"` | One literal tag containing a comma; never split as CSV |
| No array, blank `work_scope` | Invalid legacy overlay; does not become an all-scope match |

Default assignments remain unconditional and recommendations remain
candidates rather than automatically selected overlays. Existing empty
legacy overlays must be reassigned with an explicit array to declare their
intent. Use the current Manager model/service contract when creating those
assignments; the inspector CLI's skill commands do not introduce a generic
`--work-scope-tags` option. See [Manager model](../../apps/skills-manager/src-tauri/src/models/skill_set.rs)
and [matching and migration](../../apps/skills-manager/src-tauri/src/services/skill_sets.rs).

### Concurrent state changes

Catalog read-modify-write operations use `mutateCatalog`: acquire the
process-shared file lock for the physical Catalog file, read its latest
snapshot, and atomically commit once after the callback and nested changes
succeed. A failed nested change prevents the Catalog transaction from
committing. Registry imports similarly lock index loading, immutable artifact
registration, duplicate resolution, and index publication; source inspection
and fetch may happen before acquiring that Registry lock.

Low-level saves of the same stale object returned by `loadCatalog` or
`loadRegistry` fail with `CATALOG_WRITE_CONFLICT` or `REGISTRY_WRITE_CONFLICT`.
Reload and rebuild the intended change. Use the mutation APIs for normal
operations; explicit replacement objects in low-level administrative saves
are not automatically protected by that loaded-object comparison.

Reference adapter and Manager bridge calls through Catalog share a delivery
file lock keyed by each operation's physical parent directory. The same
physical root is serialized across project IDs, Catalog locations, symlink
aliases, and cooperating Node processes. This is separate from Catalog's
metadata lock, so provider I/O does not hold one Catalog-wide transaction.
Only callers sharing the local user/host lock storage and lock implementation
participate. Arbitrary parent/child roots, external tools, and manual edits
are outside that coordination. JSON commits, Registry artifacts, and complete
provider delivery do not form one atomic transaction or guarantee exactly-once
execution. On `FILE_LOCK_TIMEOUT`, inspect the active operation and current
state before retrying; do not remove a live process's lock.

Implementation: [Catalog transactions](../../apps/skills-catalog/src/catalog-state.js),
[Registry import](../../apps/skills-catalog/src/registry.js),
[physical delivery locks](../../apps/skills-catalog/src/activation-locks.js), and
[file-lock lifecycle](../../apps/skills-catalog/src/file-locks.js).

## Package roles and provider split

| Package | Managed source role | Codex preset | Antigravity preset |
| --- | --- | --- | --- |
| `skills-platform-guide` | Onboarding, installation route selection, usage verification, and maintenance | Enabled | Enabled |
| `skill-authoring-standard` | Routes shared authoring work into the selected provider ruleset | Enabled | Enabled |
| `writing-great-skills` | Explicit-only Codex review of discovery, steering, disclosure, and pruning | Enabled | Excluded |
| `skill-creator` | Repository-pinned comparison and update-review source | Excluded | Excluded |

The repository copy of `skill-creator` remains importable, revisioned,
profiled, and analyzable. It is intentionally not delivered. Codex's bundled
system skill has the same `name`; Codex does not merge same-named skills and
may show both in selectors. The bundled system copy therefore remains the
active `$skill-creator` while the repository copy serves as governed evidence.

The recipe's declared project is Codex. The recipe also carries the
`skills-platform-authoring-antigravity` preset so Antigravity requirements can
be reviewed without importing Codex-only invocation policy into that preset.
Antigravity activation requires a separate project registration and binding
review. A full reconciliation for one provider must not be pointed at another
provider project's independently managed root.

## Current declaration and historical local snapshot

As of **2026-09-08**, `skills-platform-authoring-recipe.json` declares four
sources and two provider presets. Its Codex
preset selects `skills-platform-guide`, `skill-authoring-standard`, and
`writing-great-skills`; its Antigravity preset selects the first two. Read the
current recipe for its declared versions. Reconciliation of an existing Catalog may map declared versions
to local snapshots, so query the resolved version instead of assuming a fixed
local version number.
Editing this declaration does not update existing host bindings.

The separate `skills-platform-project-recipe.json` captures the project's
three default skills and optional debugging recommendation, with portable
profiles, pinned assignments, strict policy, and a relative delivery root.
It serves project reconstruction. It does not replace the core authoring
recipe, which also retains the reference-only `skill-creator` package and the
Antigravity preset that a Codex project export does not select.

The current local `skills-platform-codex` project uses
`review_policy: require_approved`. Its Skills Manager mapping is
`workspace-4844cf93282d94de`, and inspector configuration is initialized.
That mapping is local operational state, not a portable recipe value. The
initial application and verification measurements remain dated evidence in
the [recommended skillsets guide](./recommended-skillsets-guide.md); they do
not establish that later source edits are already delivered.

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

This lifecycle maintains the core packages and both provider presets. To
reconstruct the exported Codex selection including its debugging recommendation,
set `RECIPE_PATH="$REPO_ROOT/skills-platform-project-recipe.json"` and follow
the same import → local source review → project reconciliation → saved-plan
delivery sequence. Inspect that recipe's profiles and assignments as well as
the effective default set. Core-package maintenance still uses the authoring
recipe above.

### 1. Inspect and validate the source packages

Validate each package against the provider contract it claims. The portable
router must pass both provider rulesets; the two community packages are
reviewed as Codex packages.

```bash
node apps/skills-catalog/src/cli.js skill validate \
  skills-packages/platform-core/skills-platform-guide --provider portable
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

### 2. Import and reconcile package metadata

Use the recipe rather than a separate `import-local` command for these four
packages. The recipe resolves its relative local locators from the recipe
directory, imports immutable revisions under stable locator identities,
verifies every declared content digest, updates profiles, reconciles the two
provider presets and any other declared presets. First omit `--path` so a new
source can be reviewed before a strict project's activation plan is requested.

This command updates the local Registry and Catalog. With no `--path`, it
does not reconstruct or deliver the declared project. The platform recipe
has no hooks; in general, a recipe containing hooks can also register hooks
and synchronize provider configuration without `--confirm`.

```bash
node apps/skills-catalog/src/cli.js recipe apply "$RECIPE_PATH" \
  --catalog "$CATALOG_ROOT" \
  --registry "$REGISTRY_ROOT"
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

Approve each enabled revision after reviewing its content. Approval belongs
to the exact immutable source revision, and a later rejection replaces its
earlier approval for activation purposes. A profile label or preset lifecycle
does not approve the source.

### 4. Reconstruct the project and verify selection

After source review, apply the same recipe with the target project path.
The project declaration resolves `delivery_root_relative: .agents/skills`
against this checkout. This still changes Registry/Catalog metadata, while
skill binding delivery remains a preview without `--confirm`.

```bash
node apps/skills-catalog/src/cli.js recipe apply "$RECIPE_PATH" \
  --catalog "$CATALOG_ROOT" --registry "$REGISTRY_ROOT" \
  --path "$REPO_ROOT" --provider codex --enabled-only
node apps/skills-catalog/src/cli.js project set-policy \
  skills-platform-codex --review-policy require_approved \
  --catalog "$CATALOG_ROOT" --registry "$REGISTRY_ROOT"
```

The policy command also covers older recipes that omit `review_policy`.
General and legacy projects otherwise default to `advisory`. In strict mode,
plan creation and apply require the latest source review for every enabled
revision to be `approved`; a deprecated profile or selected preset blocks
activation. Plans containing only disabled operations remain available for
removal. Strict projects reject direct `project link` delivery.

Running a strict recipe with `--path` before approval may import revisions and
save metadata, then stop at plan generation. Inspect those recorded revisions,
review them, and resume this step; the failure is not an all-or-nothing rollback.

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

Confirm that the Codex effective set enables
`skills-platform-guide`, `skill-authoring-standard`, and `writing-great-skills`. `skill-creator` should
remain represented in registry/profile views but disabled in the project plan.
Also confirm that both authoring presets report owner `Skills Platform` and
lifecycle `reviewed`, and that the project resolves its delivery root below the
current checkout rather than to a stale machine path.

For the UI's Skills Manager path, initialize/register the project with
`skills-manager-inspect project add --path ...` and connect its returned ID
using `project bind-manager`. Reuse an existing Manager registration when it
already matches the checkout. For example, after obtaining its actual ID:

```bash
node apps/skills-catalog/src/cli.js project bind-manager \
  skills-platform-codex --upstream-project-id MANAGER_PROJECT_ID \
  --catalog "$CATALOG_ROOT" --registry "$REGISTRY_ROOT"
```

This updates only the mapping, preserving policy, assignments, and delivery
root. It neither registers a Manager project nor installs a skill. Inspector
queries do not initialize missing configuration. Build and setup commands are
in the [installation guide](./skills-installation-guide.md#ui와-skills-manager-inspector-준비).

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

### 6. Record and review an additive bootstrap plan

`--enabled-only` creates operations only for selected enabled skills. Use it
for first installation or recovery when unrelated bindings must remain
untouched.

```bash
PLAN_DIR="$(mktemp -d "${TMPDIR:-/tmp}/skills-platform-plan.XXXXXX")"
node apps/skills-catalog/src/cli.js history record-plan \
  skills-platform-codex --enabled-only \
  --catalog "$CATALOG_ROOT" --registry "$REGISTRY_ROOT" \
  --out "$PLAN_DIR/bootstrap-plan.json"
# Replace PLAN_ID with the plan_id returned above.
node apps/skills-catalog/src/cli.js history apply PLAN_ID \
  --catalog "$CATALOG_ROOT" --registry "$REGISTRY_ROOT"
```

The first command stores the plan and selected assignments in Catalog and
exports that exact plan. The second previews the stored plan without
`--confirm`. Review target paths, desired states, source revisions, and content
digests, then apply the same ID:

```bash
node apps/skills-catalog/src/cli.js history apply PLAN_ID --confirm \
  --catalog "$CATALOG_ROOT" --registry "$REGISTRY_ROOT"
```

Specify `--copy` when recording the plan if copy delivery is needed; later
preview and apply consume that recorded distribution method. Apply verifies
the stored plan digest, current registered target, and current Catalog policy,
including another policy check immediately before each adapter operation.
It uses the recorded selection instead of recalculating it. If the intended
selection changes, record a new plan. Additive bootstrap does not prove that
stale managed bindings are absent.

### Shared delivery effects

Manager preview includes the directly changed provider root and known
indirect symlink consumers, including registered consumers in other projects.
Each impact retains its own provider, root, and reason. The optional
`target_root` identifies the direct mutation root; it is not interchangeable
with every root in `impacts`. This reports the Manager's known dependencies,
not a complete filesystem dependency scan. Shared confirmation is required
only when a shared binding will actually change; an unchanged repeat does not
need that extra confirmation.

In Catalog UI, inspect **Delivery impacts**, select the shared-effects
checkbox, then use **Preview with shared confirmation**. This creates a new
plan containing `distribution.shared_root_confirmation: true`. Changing the
checkbox, project, scope, or policy invalidates the pending plan; changed
impacts must also be reviewed in a fresh preview.

For CLI planning after reviewing the shared effects, preserve the original
selection flags and record a new plan with `--confirm-shared-root`:

```bash
node apps/skills-catalog/src/cli.js history record-plan \
  skills-platform-codex --enabled-only --confirm-shared-root \
  --catalog "$CATALOG_ROOT" --registry "$REGISTRY_ROOT" \
  --out "$PLAN_DIR/shared-plan.json"
node apps/skills-catalog/src/cli.js history apply SHARED_PLAN_ID \
  --catalog "$CATALOG_ROOT" --registry "$REGISTRY_ROOT"
node apps/skills-catalog/src/cli.js history apply SHARED_PLAN_ID --confirm \
  --catalog "$CATALOG_ROOT" --registry "$REGISTRY_ROOT"
```

Use the new `plan_id` for `SHARED_PLAN_ID`; the example is additive, so omit
`--enabled-only` when the intended operation includes disable actions.
`history apply ... --confirm-shared-root` is rejected because saved plans
are immutable. Keep shared acknowledgement in plan creation and execution
confirmation in apply. The reference CLI preview remains separate from the
UI's Manager preflight; the bridge checks the saved acknowledgement and
current impacts before forwarding Manager's `--confirm-shared` where needed.
See the [installation procedure](./skills-installation-guide.md#공유-경로의-영향-확인)
and [bridge implementation](../../apps/skills-catalog/src/upstream-apply.js).

### 7. Use full apply for exact reconciliation

A full plan represents the complete effective desired set. It includes
disabled operations for registry skills not selected by the project preset,
so it can remove stale adapter-owned bindings. It does not remove an unrelated
path that fails ownership verification.

```bash
# Record and preview exact reconciliation, including disabled operations.
node apps/skills-catalog/src/cli.js history record-plan \
  skills-platform-codex \
  --catalog "$CATALOG_ROOT" --registry "$REGISTRY_ROOT" \
  --out "$PLAN_DIR/reconcile-plan.json"
node apps/skills-catalog/src/cli.js history apply FULL_PLAN_ID \
  --catalog "$CATALOG_ROOT" --registry "$REGISTRY_ROOT"

# Use the plan_id from this full plan after reviewing its preview.
node apps/skills-catalog/src/cli.js history apply FULL_PLAN_ID --confirm \
  --catalog "$CATALOG_ROOT" --registry "$REGISTRY_ROOT"
```

Use this mode for ongoing convergence, not as an unreviewed first bootstrap.

`project apply` remains a convenience command that generates a new plan on
every invocation. Separate preview and confirmed invocations do not guarantee
the same selection snapshot. Direct standalone adapter JSON validation,
preview, and apply verify mechanical delivery properties such as digest and
ownership; they have no Catalog review-policy context. Use the Catalog history
path for approval-controlled application and the shared physical-root lock.
The [concurrent-state boundary](#concurrent-state-changes) describes what is
serialized and which external changes remain outside that coordination.

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
node apps/skills-catalog/src/cli.js history apply APPLIED_PLAN_ID \
  --catalog "$CATALOG_ROOT" --registry "$REGISTRY_ROOT"
```

Use the actual applied bootstrap or full `plan_id` for `APPLIED_PLAN_ID`.
On macOS, `ls -l .agents/skills` may be used as a supplemental check that the
three selected links point below `.skills-platform/registry/revisions/`; the
adapter identity report, not the link text alone, is the verification record.

## Updating a managed package

1. Edit the source below `skills-packages/`.
2. Run the applicable Codex and/or Antigravity validation.
3. Inspect the source and update its pinned `content_digest` in
   `skills-platform-authoring-recipe.json`.
4. Apply the recipe without `--path` to import and resolve the new immutable
   revision before requesting strict activation.
5. Review the new source revision, verify its profile and preset version, and
   run revision-pinned analysis.
6. Reconcile the recipe's project declaration, record an additive or exact
   project plan, and preview and apply that same plan ID.
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

To refresh the project selection recipe after reviewing the local Catalog:

```bash
node apps/skills-catalog/src/cli.js recipe export \
  --project skills-platform-codex \
  --catalog "$CATALOG_ROOT" --registry "$REGISTRY_ROOT" \
  --out "$REPO_ROOT/skills-platform-project-recipe.json"
node apps/skills-catalog/src/cli.js recipe inspect \
  "$REPO_ROOT/skills-platform-project-recipe.json"
```

Review the generated diff before sharing it. Export preserves source locators;
it does not turn arbitrary absolute local locators into portable sources.
Keep relative locators resolvable from the recipe's directory, and keep the
core recipe's independent package/provider coverage. A target Catalog must
still review imported source revisions before strict activation.

## Reconstructing a clone

If `.skills-platform/catalog/` or `.agents/skills/` is absent after cloning:

1. verify that the recipe, source packages, registry file, and referenced
   revision directories are present;
2. inspect and apply the recipe without `--path` to import profiles and
   preset snapshots; review and approve the enabled source revisions in this
   target Catalog;
3. reapply with `--path` and `--provider codex`, verify the declared project
   assignments, and ensure its policy is `require_approved`;
4. record a plan with `history record-plan --enabled-only`, preview it with
   `history apply PLAN_ID`, and apply the same ID with `--confirm` to bootstrap
   the three selected links;
5. initialize and bind the local Manager project if using the UI delivery path;
6. inspect the resulting state and use a separately recorded full plan only
   when exact reconciliation is intended;
7. restart Codex if the adapter reports that Codex enablement changed, then
   verify discovery and a representative task separately from file delivery.

Do not revive `scratch/sync-essential-skills.js` as a bootstrap mechanism. It
is retired because a hard-coded link sweep cannot preserve Catalog ownership,
provider separation, or immutable revision identity.
