# Google Antigravity skill authoring

Use this reference only when the target host is Google Antigravity or when comparing Antigravity
with another host.

Official source: [Google Antigravity: Agent Skills](https://antigravity.google/docs/skills)

## Required package contract

- The skill folder contains `SKILL.md` with YAML frontmatter.
- `description` is required and explains what the skill does and when it is useful.
- `name` is optional. When omitted, Antigravity uses the folder name. When present, use a unique
  lowercase identifier with hyphens.

Antigravity documents `scripts/`, `examples/`, and `resources/` as optional. Do not replace those
names with Codex's optional directory contract when reporting Antigravity conformance.

## Discovery roots

- Workspace skills: `<workspace-root>/.agents/skills/<skill-folder>/`.
- Legacy workspace root: `<workspace-root>/.agent/skills/<skill-folder>/` remains supported.
- Global skills: `~/.gemini/config/skills/<skill-folder>/`.

## Progressive disclosure and validation

Antigravity discovers a skill from its name and description, loads `SKILL.md` when relevant, and
then follows its instructions. Keep each skill focused and make the description specific enough to
route correctly.

When a skill contains scripts, tell the agent to inspect `--help` before reading full source where
that interface exists. For a genuinely complex workflow, include a decision tree that selects the
appropriate route without loading irrelevant detail.

Check local links and validate the package with a realistic task. Do not treat `agents/openai.yaml`
as an Antigravity requirement; it is a Codex-specific extension.

## Optional Antigravity workflow references

The following documents are examples and runtime guidance for Antigravity, not universal skill
authoring requirements:

- For Ralph loops, teamwork elicitation, background scheduling, or Antigravity artifact flows, read
  [workflow-archetypes.md](workflow-archetypes.md).
- For an Antigravity Generative UI artifact, read
  [generative-ui-guide.md](generative-ui-guide.md).
- To inspect a complete Antigravity lifecycle example, read
  [../examples/sample-skill-structure.md](../examples/sample-skill-structure.md).

Load only the reference needed by the requested workflow.
