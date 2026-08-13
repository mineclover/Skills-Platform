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
