# Repository management guide

## Ownership and branch boundary

This repository is the Skills Platform control-plane monorepo. `main` contains
the Catalog, UI, shared contracts, documentation, and the pinned reference to
the upstream Skills Manager submodule. The submodule remains an independently
versioned application; do not make Platform changes inside it incidentally.

| Area | Change here when… | Do not change here for… |
| --- | --- | --- |
| `apps/skills-catalog` | Registry, policy, evaluation, plan, or bridge behavior changes | Provider filesystem or config mutation |
| `apps/catalog-ui` | Catalog management experience changes | Provider delivery logic |
| `packages/*` | A versioned boundary is shared by Platform components | An upstream-only concern |
| `apps/skills-manager` | A reviewed upstream delivery capability is required | Catalog policy or registry source-of-truth |

The only Platform-to-Skills-Manager integration is the documented CLI JSON
contract. Do not add a Tauri invocation, upstream library import, or direct
write to provider `skills/` paths.

## Start and verify work

```bash
git clone --recurse-submodules <repository-url>
cd Skills-Platform
npm install
npm run check
npm run test
```

For an existing checkout, initialize the pinned upstream source before working:

```bash
git submodule update --init --recursive
git submodule status
```

Use `git status --short` before and after work. Generated files such as
`*.tsbuildinfo`, build output, and local Catalog data must not be committed.

## Change and commit policy

1. Keep a change within its owning layer; update the shared contract first if a
   cross-layer payload changes.
2. Add or update tests in the owning package. CLI or bridge changes need a
   contract test; UI changes need a type check and, when behavior changes, a
   rendered interaction check.
3. Update the relevant usage or architecture document whenever a command,
   safety boundary, state model, or operator workflow changes.
4. Run `npm run check`, `npm run test`, and `git diff --check` before commit.
5. Use focused Conventional Commit-style messages, for example
   `feat(catalog): apply plans through Skills Manager CLI`.

Do not mix a submodule pointer update with unrelated Catalog work. It obscures
which upstream revision introduced a delivery behavior change.

## Updating the Skills Manager submodule

First inspect the upstream change; a newer upstream revision is a candidate,
not an automatic Platform update.

```bash
git -C apps/skills-manager fetch origin
git -C apps/skills-manager log --oneline HEAD..origin/preserve/skills-manager-control-plane
git -C apps/skills-manager diff --stat HEAD..origin/preserve/skills-manager-control-plane
```

After review and upstream tests, fast-forward only the preserved control-plane
branch, test the Platform integration, then commit the resulting gitlink in
this repository:

```bash
git -C apps/skills-manager merge --ff-only origin/preserve/skills-manager-control-plane
git -C apps/skills-manager status --short
npm run check
npm run test
git add apps/skills-manager
git commit -m "chore(skills-manager): update preserved upstream"
```

If an upstream patch is needed, make, test, commit, and push it in the
submodule repository first. Then update this monorepo's pointer in a separate
commit. Never edit `.gitmodules` merely to move the pinned revision.

## CLI compatibility review

Before merging a submodule update, verify the required CLI surface from
`apps/skills-manager`:

```bash
npm run inspect -- -- --help
npm run inspect -- providers -- --json
npm run inspect -- bindings -- --json
```

Catalog relies on `inspect`, `providers`, `bindings`, `skill preview`, and
`skill enable`/`skill disable` with JSON output. A command or payload change
requires an adapter update, contract tests, and documentation in the same
Platform change.
