# Skill Authoring Reference Catalog

> Status: maintained reference index for authors of new or revised skills.
> Read the smallest set of sources that resolves the work; do not paste this
> catalog or every referenced document into a skill.

## How to use this catalog

1. Select the target provider. Use the
   [provider-aware authoring router](../skills-packages/platform-core/skill-authoring-standard/SKILL.md)
   and load only its Codex or Antigravity reference.
2. Start with **Skill anatomy and progressive disclosure** for that provider.
3. Add only the domain, runtime, safety, or delivery references required for
   the proposed skill.
4. Keep `SKILL.md` procedural and concise. Put detailed schemas, policies,
   and variants in directly linked `references/` files.
5. Validate the skill against a realistic task before it is marked reviewed.

## Provider contracts

Do not merge provider conventions into a stricter fictional common format.
When portability is requested, inspect each provider independently and report
separate findings.

| Contract | Codex | Google Antigravity |
| --- | --- | --- |
| Official source | [Build skills](https://developers.openai.com/codex/skills) | [Agent Skills](https://antigravity.google/docs/skills) |
| Required frontmatter | `name`, `description` | `description`; `name` is optional and defaults to the folder name |
| Project discovery | `.agents/skills` from CWD through repository root | `<workspace-root>/.agents/skills`; legacy `.agent/skills` is supported |
| Global discovery | `$HOME/.agents/skills`; admin `/etc/codex/skills` | `~/.gemini/config/skills` |
| Documented optional directories | `scripts/`, `references/`, `assets/`, `agents/` | `scripts/`, `examples/`, `resources/` |
| Provider extension | Optional `agents/openai.yaml` for interface, invocation policy, and tool dependencies | No `agents/openai.yaml` extension is documented |

For Codex, `description` remains required for explicit-only skills. Configure
explicit-only invocation with `agents/openai.yaml`:

```yaml
policy:
  allow_implicit_invocation: false
```

The existing Ralph loop, teamwork, scheduling, and Generative UI references in
`skill-authoring-standard` are Antigravity workflow guidance. Load them only
after selecting Antigravity and only when that workflow is relevant.

## Authoring foundations

| Reference | Read when | Summary |
| --- | --- | --- |
| [OpenAI: Build skills for ChatGPT and Codex](https://developers.openai.com/codex/skills) | Creating or revising any Codex skill. | Defines `SKILL.md`, clear trigger descriptions, progressive disclosure, and repository/user/admin skill locations. |
| [Google Antigravity: Agent Skills](https://antigravity.google/docs/skills) | Creating or revising an Antigravity skill. | Defines optional `name`, required `description`, workspace/global discovery roots, and the `scripts`/`examples`/`resources` package shape. |
| [Open Agent Skills specification](https://agentskills.io/specification) | Checking portable skill structure or interoperability. | Defines the open skill package format shared across compatible agent hosts. |
| [Skills usage guide](./skills-usage.md) | Importing, reviewing, selecting, or delivering a skill through this Platform. | Separates Catalog policy and immutable revisions from Skills Manager delivery. |
| [Skills Platform roadmap](./roadmap.md) | Deciding where profiles, notes, evaluations, presets, and source provenance belong. | Explains the intended lifecycle and the management data that must not overwrite canonical `SKILL.md` content. |

## Design and scope

| Reference | Read when | Summary |
| --- | --- | --- |
| [Capability scoping and runtime integration principles](./agent-execution-principles.md) | Designing skill boundaries, prompt material, or runtime handoffs. | Choose the minimum capability set; retain evidence references and bounded summaries rather than raw reasoning or logs. |
| [Agent design anti-patterns: Anthropic and Codex](./agent-design-antipatterns.md) | Choosing tools, context, subagents, permissions, or evaluation criteria. | Avoid fixed tool-count rules; scope by task and validate with accuracy, error, latency, and cost evidence. |
| [OpenAI: Codex subagents](https://developers.openai.com/codex/subagents) | Adding delegated or parallel work to a workflow. | Use subagents for bounded, independent, read-heavy work; return summaries, budget for tokens, and avoid conflicting parallel writes. |
| [Anthropic: Writing effective tools for AI agents](https://www.anthropic.com/engineering/writing-tools-for-agents) | Defining tool interfaces or MCP-facing workflows. | Prefer a few clear, workflow-oriented tools, high-signal outputs, and evaluation-driven iteration over API-shaped tool sprawl. |

## Safety, lifecycle, and delivery

| Reference | Read when | Summary |
| --- | --- | --- |
| [Architecture](./architecture.md) | Changing Catalog, activation, or provider integration behavior. | Catalog owns intent and provenance; Skills Manager alone performs provider delivery through its CLI boundary. |
| [ADR 0001: Skills Manager CLI boundary](./decisions/0001-skills-manager-cli-boundary.md) | Adding or modifying a delivery operation. | Requires inspect, preview, explicit confirmation, apply, and verify; never write provider skill paths directly. |
| [Current status](./current-status.md) | Confirming what is implemented versus planned. | Provides the current supported operational boundary and known gaps. |
| [OpenAI: Codex approvals and security](https://learn.chatgpt.com/codex/agent-approvals-security) | A skill requests filesystem, shell, network, or connector access. | Treat instructions as guidance and use the host's sandbox, approval, and permission mechanisms as enforceable controls. |

## Domain references to bundle with a skill

Do not copy general reference material into `SKILL.md`. Use the selected
provider's documented directory names rather than presenting one host's names
as universal:

| Need | Codex package | Antigravity package |
| --- | --- | --- |
| Durable procedure | Concise instructions in `SKILL.md` | Concise instructions in `SKILL.md` |
| Large or conditional knowledge | `references/<topic>.md` | `resources/<topic>.md` |
| Reference implementation | A focused linked reference or asset when genuinely needed | `examples/<scenario>.*` |
| Fragile or repeated transformation | `scripts/` | `scripts/` |
| Output material | `assets/` | `resources/` |

For a portable package, keep the shared entrypoint small and report each
provider's directory compatibility independently; do not silently duplicate
the same content across both directory trees.

## Minimum review checklist

- Is the trigger description specific enough to select the skill, without
  claiming unrelated tasks?
- Does `SKILL.md` contain only non-obvious workflow guidance?
- Are detailed references directly linked from `SKILL.md` and loaded only when
  relevant?
- Are risky actions protected by host permissions or validation, not just a
  textual reminder?
- Is the expected result testable with a realistic example or evaluation?
- Has the source, review state, and intended work scope been recorded in the
  Catalog before delivery?
- If more than one provider is targeted, were differences reported separately
  instead of treating provider-specific metadata as universal?
- Did static analysis remain advisory, with no change to canonical content,
  prompt injection, enablement, or activation plans?

## Maintenance rule

Update this catalog when a new authoritative internal policy, provider
integration, or recurring authoring pattern is adopted. Keep each entry to a
single operational summary and remove superseded references rather than growing
an uncurated link list.
