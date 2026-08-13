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
# Inspect/import local SKILL.md directories into the local registry
node src/cli.js import-local ../some-skills --registry ./.skills-platform/registry

# List registered artifacts and copy the emitted registry IDs
node src/cli.js list --registry ./.skills-platform/registry

# Generate the link-first request for the delivery adapter
node src/cli.js plan --registry ./.skills-platform/registry \
  --skill skill_example --provider codex --project-id demo \
  --project-path C:/work/demo --delivery-root C:/work/demo/.agents/skills
```

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
```
