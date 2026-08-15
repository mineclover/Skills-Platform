# Skills Platform

Skills Platform is the monorepo for a registry-first skill-management system.
It separates policy and canonical content from agent-visible delivery paths.

## Layout

```text
apps/
  skills-catalog/    Registry, catalog, evaluation, project policy, and activation plans
  catalog-ui/        Skills, template, and project policy management UI
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
and activation milestones. Operators should follow the
[repository management guide](./docs/repository-management.md) and the
[skills usage guide](./docs/skills-usage.md). The executable core-flow evidence
is recorded in the [basic scenario proof](./docs/basic-scenario-proof.md). For
the implemented boundary, control surfaces, and verification scope, see the
[current status](./docs/current-status.md). The design principles for scoped
agent execution and future runtime integrations are in
[capability scoping and runtime integration principles](./docs/agent-execution-principles.md).
The external design rationale and Anthropic-Codex comparison are captured in
[agent design anti-patterns](./docs/agent-design-antipatterns.md).
Authors of new or revised skills should begin with the
[skill authoring reference catalog](./docs/skill-authoring-reference-catalog.md).

## Bootstrap

```bash
git clone --recurse-submodules <repository-url>
npm install
```

To initialize submodules after a normal clone:

```bash
git submodule update --init --recursive
```

## Catalog UI

The separate Catalog UI owns the management experience, while the preserved
Skills Manager submodule continues to own delivery/provider concerns.

```bash
cd apps/catalog-ui
npm install
npm run dev
```

The UI separates Skills, Templates, and Projects. It makes a pinned default
template, work-scope overlay, effective selected/disabled skills, Pristine
reset, prompt copy, plan preview/application progress, live upstream status,
and activation history visible. Connect it to the local Catalog bridge to
operate on registered projects.
