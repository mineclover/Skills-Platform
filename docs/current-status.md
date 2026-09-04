# Skills Platform: Current Status

> Local state snapshot: 2026-09-04 13:39 KST. This section describes the
> inspected checkout and does not assert that the worktree is clean or that a
> later test run has passed.

## Control-plane capabilities

- **Portable immutable registry**: canonical artifacts are stored below
  `.skills-platform/registry/revisions/` and referenced with registry-relative
  paths so a checkout can move between Windows and macOS.
- **Project package SSOT**: `skills-platform-authoring-recipe.json`, the source
  packages under `skills-packages/`, and their immutable registry snapshots are
  repository-owned state. The local Catalog database and delivered skill links
  are reconstructible machine state.
- **Provider-aware authoring**: common structural checks feed independently
  versioned Codex and Antigravity rulesets. Static analysis and reader
  annotations remain execution-neutral.
- **Exact activation**: desired, applied, and observed state are separate.
  Preview and apply use immutable revision and content identities; managed
  links or copies are replaced only after ownership verification.
- **Native hook control**: Codex and Antigravity provider files preserve
  entries the platform does not own. Codex configuration synchronization and
  `/hooks` trust are reported separately.
- **Cross-platform delivery**: project-local Codex skills use
  `.agents/skills`; the adapter uses directory symlinks on macOS/Linux and
  junctions on Windows.

## Project-managed authoring packages

The checked-in `skills-platform-authoring-recipe.json` declares three source
packages and separates their source-management role from runtime activation:

| Package | Repository role | Codex project | Antigravity |
| --- | --- | --- | --- |
| `skill-authoring-standard` | Provider router and shared authoring contract | Active | Present in the Antigravity preset |
| `writing-great-skills` | Explicit Codex instruction-quality review | Active | Not included in the Antigravity preset |
| `skill-creator` | Pinned source for validation, comparison, and update review | Intentionally not activated | Not included |

The repository copy of `skill-creator` is retained in the registry but is not
materialized into `.agents/skills`. Codex already bundles a system skill with
that name, and the [official Codex skills documentation](https://developers.openai.com/codex/skills)
states that same-named skills are not merged and may both appear in selectors.
Keeping the repository copy inactive avoids an ambiguous `$skill-creator`
choice while preserving a reviewable source snapshot.

At the timestamp above, the local Catalog contains the
`skills-platform-codex` project and the `skills-platform-authoring-codex` and
`skills-platform-authoring-antigravity` presets. Both presets are owned by
Skills Platform and have the `reviewed` lifecycle. The recipe declares the
Codex delivery root as the portable project-relative `.agents/skills`, and the
Codex project has managed links for `skill-authoring-standard` and
`writing-great-skills`. The
Antigravity preset and ruleset are ready, but no Antigravity project or binding
is materialized in this checkout; that rollout must use a separate provider
project and an explicitly reviewed binding target.

## State ownership

| State | Version-controlled authority | Machine-local reconstruction |
| --- | --- | --- |
| Package intent and provider split | `skills-platform-authoring-recipe.json` | Recipe inspection result |
| Editable source | `skills-packages/...` | None |
| Immutable revision | `.skills-platform/registry/registry.json` and `revisions/` | Hydrated absolute canonical path |
| Projects, profiles, preset assignments, analysis records | Recreated from the recipe and subsequent governance operations | `.skills-platform/catalog/` |
| Provider discovery binding | Activation plan and adapter ownership contract | `.agents/skills/` |
| Codex enablement | Desired state plus adapter result | `~/.codex/config.toml` |

`.skills-platform/catalog/` and `.agents/` are intentionally ignored. Do not
treat their absence after a clone as lost package state; reconstruct them from
the checked-in recipe and registry. See [Project skill package
management](./guides/project-skill-package-management.md) for the lifecycle and
recovery commands.

## Verification contract

This status page deliberately carries no evergreen test totals or Git
synchronization claim. Verify the checkout that will be shipped:

```bash
npm run check
npm run build
npm test
node apps/skills-catalog/src/cli.js recipe inspect \
  skills-platform-authoring-recipe.json
node apps/skills-catalog/src/cli.js project resolve skills-platform-codex \
  --catalog ./.skills-platform/catalog \
  --registry ./.skills-platform/registry
```

Use `project apply --enabled-only` for a non-destructive first bootstrap. Use a
previewed full `project apply` only when the Catalog should reconcile the
complete managed desired set, including explicit disables.
