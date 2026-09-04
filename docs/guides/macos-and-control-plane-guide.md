# macOS and control-plane operations

This guide covers the state boundaries that matter when a Skills Platform
checkout moves between Windows and macOS.

## Bootstrap on macOS

Use Node.js 20.19 or newer and initialize the pinned Skills Manager submodule.

```bash
git submodule update --init --recursive
npm ci
npm run build:packages
npm run check
npm test
```

The root lockfile includes native packages for Apple Silicon and Intel macOS.
If installation resolves an esbuild binary from a parent directory, remove the
incomplete local `node_modules` directory and run `npm ci` again; do not point
`ESBUILD_BINARY_PATH` at a different version.

The pinned Skills Manager revision is the current reachable commit on the
configured `preserve/skills-manager-control-plane` branch. Its macOS Rust tests
compare canonical workspace paths; run them with a canonical `TMPDIR` because
macOS aliases `/var` to `/private/var`:

```bash
cd apps/skills-manager
export TMPDIR="$(realpath "$TMPDIR")"
npm ci
npm test
npm run build
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo test --manifest-path src-tauri/Cargo.toml -- --test-threads=1
```

## Portable registry paths

Registry files store a `canonical_relative_path` below the registry root. At
runtime, the Catalog hydrates `canonical_path` to an absolute path in the
current checkout. Legacy `C:\...\revisions\...` records are safely rebased only
when the matching immutable artifact exists below the active registry root.
Paths that escape that root are ignored.

Source locators preserve provenance and may still describe the original
Windows import location. They are not used as a delivery path. Re-import a
local source on the new machine only when creating a genuinely new revision.

For repository-owned packages, keep the locator in the checked-in recipe
relative to the recipe file and preserve its exact spelling. The locator is
part of source identity; changing an equivalent-looking locator can create a
new source and lineage. A relative locator is portable while the recipe and
package retain the same repository layout. For a package shared independently
across machines or repositories, prefer a Git locator pinned to an immutable
commit instead of a machine-local absolute path.

## Project-managed authoring packages

The project authoring control plane is defined by
`skills-platform-authoring-recipe.json` plus the immutable snapshots under
`.skills-platform/registry/`. These files are the portable repository state.
The recipe records the Codex delivery root as project-relative
`.agents/skills`, so reconstructing the project does not retain a Windows or
macOS checkout prefix. Its Codex and Antigravity presets are owned by Skills
Platform and marked `reviewed`.
The following are reconstructible machine state and remain ignored:

- `.skills-platform/catalog/` for project registrations, profiles, preset
  assignments, analyses, and activation history;
- `.agents/skills/` for materialized project bindings;
- the user's `~/.codex/config.toml` enablement entries.

Inspect and reconcile the recipe before creating bindings:

```bash
node apps/skills-catalog/src/cli.js recipe inspect \
  skills-platform-authoring-recipe.json

# Reconcile sources, profiles, presets, and the declared Codex project, then
# return a delivery preview. Omitting --confirm does not create bindings.
node apps/skills-catalog/src/cli.js recipe apply \
  skills-platform-authoring-recipe.json \
  --catalog ./.skills-platform/catalog \
  --registry ./.skills-platform/registry \
  --path "$(pwd)" --provider codex --enabled-only

# Bootstrap only the selected enabled skills. Preview first, then repeat with
# --confirm after reviewing the operations.
node apps/skills-catalog/src/cli.js project apply skills-platform-codex \
  --catalog ./.skills-platform/catalog \
  --registry ./.skills-platform/registry \
  --enabled-only
node apps/skills-catalog/src/cli.js project apply skills-platform-codex \
  --catalog ./.skills-platform/catalog \
  --registry ./.skills-platform/registry \
  --enabled-only --confirm
```

`--enabled-only` is additive: it emits operations only for selected enabled
skills and leaves unrelated bindings alone. A full `project apply` is exact
reconciliation: it also emits disabled operations for registry skills outside
the effective preset. Use the full form only after reviewing its preview;
ownership checks still prevent removal of an unrelated unmanaged path.

This checkout activates the Codex authoring preset. The Antigravity preset and
ruleset are maintained separately but are not materialized here. Create a
separate Antigravity project and binding decision before rollout; do not aim
two independently reconciled provider projects at the same delivery root.
The complete lifecycle, package roles, and recovery procedure are in [Project
skill package management](./project-skill-package-management.md).

## Exact skill state

Skill state has three independent layers:

1. **Desired** — the pinned template, work-scope overlay, and optional
   project-level skill override.
2. **Applied** — the immutable activation plan and its adapter report.
3. **Observed** — a fresh provider binding snapshot.

Changing desired state does not mutate a provider. Preview first; the preview
is recorded with a digest and the same `plan_id` must be supplied to apply.
After apply, a binding is considered verified only when state and any supplied
registry/revision/digest identity claims match the plan.

```bash
# Pin an exact registry revision as enabled for one project.
node apps/skills-catalog/src/cli.js project skill demo enable LINEAGE_ID \
  --catalog ./.skills-platform/catalog \
  --registry ./.skills-platform/registry \
  --skill REGISTRY_SKILL_ID

# Explicitly disable that lineage, or return to template inheritance.
node apps/skills-catalog/src/cli.js project skill demo disable LINEAGE_ID \
  --catalog ./.skills-platform/catalog \
  --registry ./.skills-platform/registry \
  --skill REGISTRY_SKILL_ID
node apps/skills-catalog/src/cli.js project skill demo inherit LINEAGE_ID \
  --catalog ./.skills-platform/catalog \
  --registry ./.skills-platform/registry
```

On macOS/Linux the adapter creates directory symlinks; on Windows it creates
junctions. Copy mode writes `.skills-platform-ownership.json` inside the
delivered copy. Only a binding that passes ownership and content verification
can be replaced or removed. Multi-operation failures trigger rollback.

### Codex skill discovery and activation

Following the official [Codex skills
reference](https://developers.openai.com/codex/skills), project skills are delivered only to
`<project>/.agents/skills/<name>/SKILL.md`; global skills use
`$HOME/.agents/skills/<name>/SKILL.md`. A Codex activation preview rejects a
different delivery root, a wrong-case `skill.md`, a missing frontmatter
`description`, or a non-skill artifact before materialization.

Filesystem presence and Codex enablement are reconciled together. The adapter
reads the matching absolute `SKILL.md` entry in `~/.codex/config.toml`:

- an enabled skill with no entry uses Codex's enabled-by-default behavior;
- an existing `enabled = false` entry is changed to `true` when re-enabled;
- disabling retains the platform's managed-unlink semantics and records
  `enabled = false`, so a later rematerialization cannot silently reactivate it.

Config edits use a bounded cross-process lock and atomic replacement,
de-duplicate only the matching `[[skills.config]]` entry, preserve unrelated
TOML and comments, participate in plan rollback, and set `restart_required` in
the adapter result. The UI shows the restart requirement after a successful
Codex apply. Tests inject a temporary Codex home and never write the
developer's real config.

## Hook control and diagnostics

A hook's manifest `enabled` value is desired state, not proof that an agent has
loaded it. Diagnostics report these states separately:

- `not_configured`: the provider file is absent;
- `synced`: generated and on-disk configuration digests match;
- `drift`: the provider file differs from the manifest;
- `invalid`: the provider file or handler is invalid;
- `unsupported`: the platform does not have a verified compiler for that
  provider or the installed provider version lacks the requested event.

Codex is compiled to the native project `.codex/hooks.json` format. The
compiler detects the installed Codex version and emits only supported events;
its one-dispatcher-per-event layout preserves platform priority and
short-circuiting. Claude remains unsupported instead of being presented as
synced. Antigravity and Codex sync preserve provider entries they do not own
and remove only entries recorded in the hook ownership sidecar. Codex trust is
reviewed separately with `/hooks`; a synchronized file alone is not reported
as durable trust. See [Codex hook
operations](./codex-hooks-guide.md) for the native mapping and validation
workflow.

Each hook declares a `failure_policy`:

- `open` allows the triggering operation when the hook fails or times out;
- `closed` blocks it and reports the execution failure.

Script handlers use the current Node executable rather than relying on the
GUI application's shell `PATH`. Matcher evaluation and priority ordering are
the same in simulation and execution. A corrupt manifest is never replaced by
an enabled default set; fix or restore the file explicitly.

```bash
node apps/skills-catalog/src/cli.js hook list --project .
node apps/skills-catalog/src/cli.js hook disable secret-leak-guard --project .
node apps/skills-catalog/src/cli.js hook enable secret-leak-guard --project .
node apps/skills-catalog/src/cli.js hook sync --project .
node apps/skills-catalog/src/cli.js hook test --event pre_tool_use --project .
```

## Reader annotations and analysis

Reader annotations are stored under
`<catalog>/annotations/v1/<lineage>.json`, outside every canonical artifact.
They cannot contain activation or prompt controls and are not read by plan,
recipe, provider, or system-prompt builders.

```bash
node apps/skills-catalog/src/cli.js skill annotation add LINEAGE_ID \
  --catalog ./.skills-platform/catalog \
  --registry ./.skills-platform/registry \
  --revision SOURCE_REVISION_ID \
  --kind plain_language --locale ko-KR \
  --body "이 스킬의 목적과 사용 시점을 쉽게 설명합니다."

node apps/skills-catalog/src/cli.js skill analysis run LINEAGE_ID \
  --catalog ./.skills-platform/catalog \
  --registry ./.skills-platform/registry \
  --revision SOURCE_REVISION_ID
```

Static analysis is deterministic and revision-pinned. It reports headings,
instruction density, references, support files, and structural warnings. An
older result is marked outdated when a newer revision appears; it is never
silently reattached to that revision.
