---
name: skill-authoring-standard
description: >-
  Route skill authoring, review, and static validation through the official conventions for Codex
  or Google Antigravity. Use when creating or revising a skill, checking SKILL.md metadata and
  progressive disclosure, or explaining provider-specific discovery and package structure.
---

# Provider-aware skill authoring

Apply shared authoring principles first, then load only the reference for the target host. Do not
turn one provider's optional folders, metadata extensions, tools, or workflow examples into
requirements for another provider.

## Select the target platform

1. Use the platform named by the user or the delivery target.
2. If the target is Codex, read [references/codex.md](references/codex.md).
3. If the target is Google Antigravity, read
   [references/antigravity.md](references/antigravity.md).
4. If the user requests portability across both, read both references and report each provider's
   result independently. Do not collapse differences into a stricter fictional common schema.
5. If no target is known and a provider difference changes the result, ask for the target or return
   separate Codex and Antigravity findings.

For a side-by-side schema or directory audit, use the
[frontmatter matrix](references/frontmatter-schema.md) and
[directory matrix](references/directory-layout.md) after selecting the relevant provider scope.

## Shared authoring principles

- Keep each skill focused on one job and preserve the user's intended scope.
- Keep `description` concise and specific about what the skill does and when it applies. Provider
  rules decide whether `name` is required; do not assume they are identical.
- Keep the entrypoint procedural and high-signal. Move substantial conditional detail into a
  directly linked supporting file and state when to read it.
- Add scripts only for repeated or deterministic work. Treat them as executable dependencies that
  require inspection and focused validation.
- Use host permissions, sandboxing, and validation for risky actions. Text instructions are not an
  enforcement boundary.
- Preserve provider-specific metadata already present unless the requested change requires it.
- Validate observable structure and broken links without executing support scripts or changing the
  skill's activation behavior.

## Review output

When reviewing a package, separate findings by provider and distinguish:

- **Error**: an explicit provider requirement is missing or malformed.
- **Warning**: a supported package has a scope, disclosure, portability, or safety risk.
- **Info**: optional metadata or resource inventory that is not a defect.

Static analysis is advisory. It must not edit canonical skill content, change enablement, inject
findings into prompts, or alter activation plans.
