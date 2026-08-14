# ADR 0001: Use Skills Manager CLI as the delivery boundary

**Status:** Accepted  
**Date:** 2026-08-14

## Decision

Skills Platform integrates with the preserved upstream Skills Manager only
through its `skills-manager-inspect` CLI. Catalog does not import the upstream
application as a library, invoke Tauri commands, write Skills Manager config,
or write an agent provider's `skills/` path.

The CLI is used for both read operations (`projects`, `inspect`, `providers`,
`bindings`) and, once the mapping contract is implemented, delivery operations
(`skill preview`, `skill enable`, `skill disable`, and `batch`).

## Consequences

- Upstream can remain independently versioned and tested.
- CLI JSON output is the auditable observation/report format persisted by
  Catalog.
- Every Catalog project stores `upstream_project_id`; it defaults to the
  Catalog project ID but can point to a distinct Skills Manager project.
- A write adapter needs an explicit registry-revision →
  `skill_instance_id` mapping. It must preview, require confirmation where
  Skills Manager reports shared impact, apply, then re-inspect.
- Importing a Registry artifact into a Skills Manager hub is not an implicit
  side effect of applying a plan. It requires a separately reviewed adoption
  action.

## Non-goals

- Replacing Skills Manager's own preset, provider, or link implementation.
- Treating a provider folder as Catalog source-of-truth.
- Bypassing upstream safeguards by reimplementing file mutations in Catalog.
