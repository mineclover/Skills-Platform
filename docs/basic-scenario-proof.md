# Basic scenario proof

This document maps the primary operator journey to executable evidence. It is
not a claim that a local provider was mutated during a documentation build: the
test substitutes the Skills Manager CLI boundary and verifies its exact JSON
commands. The separate live CLI check remains read-only.

## Executable proof

Run the complete proof with:

```bash
npm run test --workspace @skills-platform/catalog
```

The end-to-end bridge scenario is
`apps/skills-catalog/test/basic-scenarios.test.js`. It creates all state in a
temporary directory and removes it after completion.

| Operator scenario | Evidence asserted by the test |
| --- | --- |
| Select a reviewed skill set | A local `SKILL.md` is imported immutably, added to a versioned `Planning` preset, and assigned to project `demo`. The resolved system prompt contains its canonical content. |
| Preview before mutation | A recorded activation plan returns `409 confirmation_required`; no `skill enable` command has been sent to the upstream CLI adapter. |
| Apply a confirmed plan | The bridge resolves the upstream instance by project scope and canonical digest, sends `skill enable --id project:manager-demo:planning --tool codex --project manager-demo`, and stores a report. |
| Return to Pristine | Assigning `builtin-pristine` produces a disabling plan and sends the corresponding `skill disable` command; no registry revision is removed. |
| Reject a missing or unadopted upstream instance | When upstream inspection does not contain the matching instance, the bridge returns HTTP `400` before any enable/disable command. It does not import the registry artifact implicitly. |

The test also proves post-apply history retention: an activation report is
available from the project history after a successful confirmed apply.

## Live boundary smoke check

This is safe to run against the configured upstream checkout because it only
reads project metadata:

```bash
node -e "const { createSkillsManagerCli } = require('./apps/skills-catalog/src'); createSkillsManagerCli().execute(['projects']).then(console.log)"
```

Before a real apply, use the Catalog UI's plan preview and confirmation. A real
write is intentionally not part of automated proof because it changes the
operator's Skills Manager state.

## Scope and remaining proof

The proof establishes the Catalog-to-CLI contract, policy transitions, and
safe refusal behavior. It does not replace provider-specific integration tests
inside the upstream Skills Manager repository. Changes to provider discovery,
links, shared roots, or CLI payloads must be verified there and then against
the contract tests in this repository.
