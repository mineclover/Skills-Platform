# Platform package maintenance

This is a Skills Platform repository convention, not a Codex, Antigravity, or Vercel Skills
requirement. Apply it to packages maintained under `skills-packages/`. A directly installed
third-party skill does not acquire Catalog ownership or review status by containing this text.

## Canonical source and portable packages

Give maintainers the repository-relative canonical source path and a short update route. Avoid
personal paths such as `~/workflow/Skills-Platform` and links outside the package that will break
when a single skill is copied or installed. Detailed operational manuals belong in the repository
guides; bundle only references needed for the skill's actual work.

Do not require every skill to carry a numbered governance section, optional scripts, all provider
metadata, or a copy of this document. Preserve applicable ownership information already present.

## Choose the update route

| Delivery | Update behavior |
| --- | --- |
| Catalog revision and project plan | Import a new immutable revision; review, select and preview it before adapter apply |
| Explicit development `project link --latest` | Points to the editable source; changes are immediately visible through the link |
| `project link --version VERSION` | Points to a frozen instance under `skills-instances/`; choose a new instance to update |
| Vercel Skills CLI direct install | Use that CLI's recorded source and scope; it has no Catalog review or plan history |

An installation symlink is not automatically a live link to `skills-packages/`. Resolve the actual
target and determine the owner before choosing how to update. Never edit files under immutable
Registry revisions or frozen instances as a substitute for creating a new version.

## Catalog lifecycle

Run these examples from the actual Skills Platform checkout; replace `SKILL_DIRECTORY` and other
uppercase placeholders with inspected values.

1. Edit the canonical package and inspect its supporting scripts or resources as appropriate.
2. Validate each claimed provider independently:

   ```bash
   node apps/skills-catalog/src/cli.js skill validate SKILL_DIRECTORY --provider codex
   node apps/skills-catalog/src/cli.js skill validate SKILL_DIRECTORY --provider antigravity
   ```

   These checks are static. Add a realistic behavior check when routing or operational choices
   changed, and execute only the support scripts relevant to that check.
3. If a recipe pins the package, update its digest using the platform's `digestDirectory` helper
   after reviewing the source diff. `recipe inspect` checks structure, not content equivalence.
   `recipe apply` without `--confirm` imports and changes Registry/Catalog state while previewing
   provider delivery. For a package outside a recipe, use an explicit `import-local`/`import-git`.
4. Review the new source revision and desired project selection. Preview `project apply` with
   actual `--catalog`/`--registry` paths; add `--enabled-only` for additive bootstrap. Use
   `--confirm` to execute the requested, inspected delivery. A full apply can disable stale managed
   bindings, so select the mode based on the user's requested scope.
5. Check the adapter report and repeat preview, then verify host discovery and a relevant use.

Existing authorization for the scoped operation remains valid. CLI `--confirm` is an execution
flag; it does not itself require another conversational approval.

## Development link limits

`project link` changes bindings immediately without a preview or confirmation flag. Its current
implementation can replace an existing symlink without the activation adapter's ownership
validation. Use it only for an intentionally selected development binding after inspecting the
destination. Do not use it as a generic repair for an ownership conflict.

The companion `*.skills-platform-link-ownership.json` describes a binding; it does not prevent
another installer from overwriting it. Direct links use `method: direct_source_symlink`, while
plan-based adapter delivery has its own metadata. Do not manufacture or rewrite sidecars to claim
an unmanaged path. `project status` observes links and sidecars; it does not validate content
digests or prove a skill was invoked.

For the full procedure in a platform checkout, read `docs/guides/project-skill-package-management.md`
and `docs/guides/skills-installation-guide.md`. Keep the maintenance note understandable when those
repository documents are not bundled with an installed skill.
