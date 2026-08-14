# Skills Platform

Skills Platform is the monorepo for a registry-first skill-management system.
It separates policy and canonical content from agent-visible delivery paths.

## Layout

```text
apps/
  skills-catalog/    Registry, catalog, evaluation, project policy, and activation plans
  catalog-ui/        Project effective-set and activation-progress UI prototype
  skills-manager/    Pinned delivery adapter: provider discovery, links, copies, and verification
packages/
  skill-contracts/   Shared versioned contracts between the catalog and adapters
  skills-manager-adapter/ Reference preview/apply implementation of the delivery contract
docs/
  architecture.md    System boundaries and delivery protocol
  roadmap.md         Product roadmap for skill metadata, notes, templates, and activation
```

`apps/skills-manager` is a Git submodule pinned to the preserved Skills Manager
control-plane branch. It stays independently buildable and continues to track
its own upstream. The Catalog integrates with it only through its CLI, never
writes an agent's `skills/` directory directly, and keeps policy separate from
provider delivery.

See [the architecture](./docs/architecture.md) for responsibilities, [the MVP
definition](./docs/mvp.md) for the implemented core flow, and [the product
roadmap](./docs/roadmap.md) for skill management, metadata, notes, templates,
and activation milestones.

## Bootstrap

```bash
git clone --recurse-submodules <repository-url>
npm install
```

To initialize submodules after a normal clone:

```bash
git submodule update --init --recursive
```

## Catalog UI prototype

The separate Catalog UI owns the management experience, while the preserved
Skills Manager submodule continues to own delivery/provider concerns.

```bash
cd apps/catalog-ui
npm install
npm run dev
```

The current project screen makes a pinned default template, work-scope overlay,
effective selected/disabled skills, Pristine reset, plan preview state, and
activation history visible. Its sample data will be replaced by Catalog API
bindings as the delivery-adapter integration is completed.
