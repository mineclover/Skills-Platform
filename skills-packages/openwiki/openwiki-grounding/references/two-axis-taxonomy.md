# Two-Axis Documentation Taxonomy Guide

OpenWiki organizes codebase documentation along two complementary axes to balance structural modularity with end-to-end operational clarity.

---

## 🧭 Axis 1: System & Package Boundaries (Structural Axis)

Focuses on modular components, package roles, API boundaries, and local invariants:

- `openwiki/packages/<package-name>.md`:
  - Package purpose, responsibilities, and ownership boundaries.
  - Public interface exports, main classes, functions, and types.
  - Local configuration and environment contracts.
- `openwiki/api/` or `openwiki/cli/`:
  - Concrete endpoint specifications, request/response shapes, and CLI commands.

---

## 🔄 Axis 2: Cross-System Workflows & Domain (Operational Axis)

Focuses on end-to-end flows spanning multiple modules, data pipelines, and domain rules:

- `openwiki/workflows/<workflow-name>.md`:
  - Runtime request lifecycle (e.g. Auth PKCE flow, Ingestion pipeline).
  - Inter-service communication, event buses, and asynchronous messaging.
- `openwiki/domain/<domain-concept>.md`:
  - Core domain models, state machines, lifecycle transitions, and ER diagrams.
- `openwiki/operations/<operation-topic>.md`:
  - Deployment configurations, health probes, backup procedures, and cron scheduling.
- `openwiki/architecture/<architecture-topic>.md`:
  - High-level system architecture, dependency graphs, and cross-cutting concerns.
