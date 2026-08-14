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

# List registered artifacts and copy the emitted registry IDs
node src/cli.js list --registry ./.skills-platform/registry

# Generate the link-first request for the delivery adapter
node src/cli.js plan --registry ./.skills-platform/registry \
  --skill skill_example --provider codex --project-id demo \
  --project-path C:/work/demo --delivery-root C:/work/demo/.agents/skills
```

## Local Catalog bridge

The bridge gives the separate Catalog UI a local, read-only view of Catalog
state. It has no endpoint that applies a plan or writes provider paths.

```bash
node src/cli.js serve --catalog ./.skills-platform/catalog \
  --registry ./.skills-platform/registry --port 4300
```

Available endpoints are `GET /api/projects`, `GET
/api/projects/:id/effective-set`, `GET /api/projects/:id/history`, and `POST
/api/projects/:id/activation-plan/preview`.

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
