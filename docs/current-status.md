# Current implementation status

> Verified: 2026-08-15

Skills Platform is ready for local, registry-first skill-set management. It
does not replace the existing Skills Manager: the Platform decides approved
skill policy, and Skills Manager performs provider-specific delivery through
its CLI.

## Operational model

```text
immutable registry revision -> template / project policy -> ActivationPlan
                                                    -> Skills Manager CLI
                                                    -> provider skills/ path
```

| Surface | Available now | Does not do |
| --- | --- | --- |
| Catalog CLI | Import, review, profile, notes, feedback, evaluation, presets, project assignment, prompt export, plan/history | Write a provider `skills/` path directly |
| Catalog UI | Skills metadata/review, template composition, project assignment, Pristine reset, prompt copy, confirmed apply progress | Alter upstream provider state without confirmation |
| Skills Manager CLI | Discovery, binding preview, enable/disable, link/copy reconciliation, post-apply inspection | Decide Catalog membership, revisions, or preset policy |

## Safety invariants

1. Registry revisions are immutable and are matched to upstream instances by
   canonical content digest before delivery.
2. Every provider mutation has a recorded plan, a per-binding preview, and an
   explicit confirmation.
3. A missing or digest-mismatched upstream instance fails safely; Catalog does
   not silently import it into Skills Manager.
4. `Pristine` disables managed bindings without deleting Registry content.
5. Prompt export is read-only and contains only canonical skill content plus
   notes explicitly marked for prompt injection.

## Evidence

`npm run check` verifies the JavaScript and TypeScript packages. `npm run test`
currently runs 46 tests, including the basic operator flow: reviewed selection,
unconfirmed apply refusal, confirmed CLI apply, return to Pristine, and safe
rejection of an unadopted upstream skill.

The real upstream smoke check is read-only:

```bash
node -e "const { createSkillsManagerCli } = require('./apps/skills-catalog/src'); createSkillsManagerCli().execute(['projects']).then(console.log)"
```

Do not use this proof as an instruction to modify a live binding. For an actual
delivery change, preview the project plan in Catalog, inspect its scope, and
explicitly confirm the apply action. See [basic scenario proof](./basic-scenario-proof.md)
and [skills usage guide](./skills-usage.md) for the detailed procedure.

## Deliberate follow-up scope

- Hosted/team persistence, access control, and portable policy sharing.
- GitHub shorthand, archive, and skills.sh source adapters without installer
  execution.
- Upstream batch execution only if its evidence and confirmation semantics
  remain as strict as the current per-binding flow.
- Automated evaluator execution and richer source/revision comparison UI.
