# Skills Platform

Skills Platform is the monorepo for a registry-first skill-management system.
It separates policy and canonical content from agent-visible delivery paths.

## Layout

```text
apps/
  skills-catalog/    Registry, catalog, evaluation, project policy, and activation plans
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
its own upstream. The catalog never writes an agent's `skills/` directory
directly; it sends a reviewed activation plan to the delivery adapter.

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
