# Skills Catalog MVP

> Status: implemented. Catalog has both CLI and local UI control surfaces. A
> confirmed plan is resolved, previewed, applied, progress-streamed, and
> verified through the upstream Skills Manager CLI.

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

## Current limits

- Catalog persistence is local JSON (`registry.json` and `catalog.json`); team
  sync, access control, and hosted storage are future work.
- Git sources resolve to an exact commit and are imported without executing
  installers. GitHub shorthand, archives, and skills.sh pack parsing remain
  future source adapters.
- Applies are intentionally per-skill upstream CLI operations. This keeps the
  preview, digest match, shared-root confirmation, and per-operation report
  explicit; upstream batch optimization is not yet used.
- Automated evaluators and provider-specific integration tests remain owned by
  their respective delivery/evaluation environments.
