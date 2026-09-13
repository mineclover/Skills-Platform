# Codex skill authoring

Use this reference only when the target host is Codex or when comparing Codex with another host.

Official source: [OpenAI: Build skills](https://developers.openai.com/codex/skills)

## Required package contract

- The skill folder contains an exact-case `SKILL.md` file.
- `SKILL.md` frontmatter contains non-empty `name` and `description` strings.
- Keep the name short and portable using lowercase letters, digits, and hyphens.
- Keep the description concise, front-load the main use case, and state clear scope and boundaries.
  Codex uses it for implicit selection and may shorten descriptions when the initial skills list is
  large.

Codex documents `scripts/`, `references/`, `assets/`, and `agents/` as optional. Instruction-only
skills are valid; do not require an optional directory.

## Discovery roots

Repository discovery scans `.agents/skills` from the current working directory through parent
directories to the repository root. User skills live in `$HOME/.agents/skills`, admin skills in
`/etc/codex/skills`, and system skills may be bundled by OpenAI.

Codex supports symlinked skill folders. That does not make escaping resource links or unreviewed
external executable targets safe inside a package.

## Invocation and `agents/openai.yaml`

The frontmatter `description` is always required. Do not remove it to make a skill explicit-only,
and do not substitute an unsupported frontmatter flag for invocation policy.

Automatic selection is enabled by default. To keep a skill available only through explicit
`$skill-name` invocation, preserve its description and add:

```yaml
policy:
  allow_implicit_invocation: false
```

`agents/openai.yaml` is optional and may include:

- `interface`: `display_name`, `short_description`, icons, brand color, and a one-sentence
  `default_prompt` that explicitly mentions `$skill-name`.
- `policy.allow_implicit_invocation`: boolean, default `true`.
- `dependencies.tools`: declared MCP tool dependencies.

Keep UI metadata consistent with the skill. Validate icon paths inside the package and preserve
unrelated policy or dependency fields when editing the interface.

## Progressive disclosure and validation

- Keep shared purpose and essential constraints in `SKILL.md`.
- Put conditional procedures, schemas, and substantial examples in focused `references/` files.
- Link every needed reference and explain when it should be read.
- Prefer instructions over scripts unless deterministic execution or external tooling materially
  improves reliability.
- Write imperative steps with explicit inputs, outputs, and completion checks.
- Test realistic prompts against the description as well as structural validation.

When the bundled skill-creator tools are available, run `quick_validate.py` on the completed skill.
Also check every local link; structural validation alone does not prove good routing behavior.
