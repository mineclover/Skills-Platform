# Skills Catalog MVP

> Status: core CLI MVP implemented. Catalog now delegates confirmed plan
> application to the upstream Skills Manager CLI and retains its verification report.

The first MVP is complete only when this repeatable, non-destructive flow works:

1. Import one or more local `SKILL.md` directories into immutable registry revisions.
2. Register a project, target provider, and agent-readable delivery root.
3. Create a named skill preset or select the immutable `Pristine` baseline.
4. Assign that preset to a project and generate a schema-validated, pinned
   `ActivationPlan` for the Skills Manager delivery adapter.
5. Export the selected canonical `SKILL.md` content, including provenance, as a
   system-prompt payload.
6. Preview and explicitly confirm the plan through Skills Manager, which
   verifies the matching immutable revision, changes only its managed binding,
   and returns a post-apply report.

The catalog does not create links, copies, or provider configuration changes.
Those mutations stay in the Skills Manager delivery role. The reference adapter
package continues to validate the protocol independently; production delivery
uses the existing Skills Manager application's CLI boundary.

## Explicit MVP limits

- Import supports local directories first; Git/skills.sh source resolution is
  the next increment.
- Catalog applies one reviewed plan operation at a time through the upstream
  CLI. Batch optimization and streamed progress remain follow-up work.
- Catalog state is local JSON (`registry.json` and `catalog.json`) so the
  semantics are validated before adding a database or UI.
