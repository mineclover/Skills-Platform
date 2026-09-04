# Skills Platform Architecture

## 1. Product Boundary & Maintenance Control Plane (MLC)

Skills Platform is the **registry, activation catalog, and Maintenance Control Plane (MLC)** for AI agent customizations. It manages the continuous closed control loop across:

```text
Prior Context -> Behavior (Skills) -> Evidence -> Context Patch Proposal -> Validated Baseline
```

The platform strictly separates the **Target System** (applications, codebases, microservices) from the **Maintenance Control Plane** (Skills Platform).

```text
Maintenance Control Plane (Skills Platform)
├── Registry Layer     : Element, Topic, Responsibility, Convention, Method, Tool Capability
├── Context Layer      : Horizontal Context (Exploration) vs Vertical Context (Single Resolution)
├── Behavior Layer     : Horizontal Exploration vs Vertical Resolution vs Validation
├── Tool & Guard Layer : Context -> Method -> Skill -> Capability -> Tool Binding -> Invocation Guard
├── Evidence Layer     : Signal, Observation, Test Evidence, Change Evidence, Runtime Evidence
└── Governance Layer   : 10-Stage Case Machine, Responsibility Gate, Release Stabilization, Drift Detector
```

## 2. Core Operational Principles (MLC Invariants)

1. **Context is a Precondition of Behavior**: Skills execute only with explicit published context snapshots.
2. **Behaviors Never Mutate Published Contexts Directly**: Skills produce patch proposals; only the Governance layer validates and publishes baselines.
3. **Tools Are Execution Mechanisms, Not Behaviors**: Tools provide atomic capabilities; methods define procedures; skills orchestrate behaviors.
4. **Horizontal vs Vertical Separation**:
   - **Horizontal Exploration**: Analyzes signals, discovers candidates, and outputs `Topic Handoff` (no direct code mutations).
   - **Vertical Resolution**: Focuses on a single `topic_id` to diagnose, change, and validate.
5. **Responsibility Gate**: Problem origin != resolution location (`OWNED_RESOLUTION`, `BOUNDARY_MITIGATION`, `HANDOFF_REQUIRED`).

## 3. Workspace Ownership

| Path | Owner | Responsibility |
| --- | --- | --- |
| `apps/skills-catalog` | Skills Platform | Registry, catalog, evaluation, release, project assignments, REST API, CLI. |
| `apps/catalog-ui` | Skills Platform | Web UI (React 19, TypeScript, Vite) with Recipe Hub, FilterToolbar, 5-stage progress stepper, and live diagnostic drawer. |
| `packages/skill-contracts` | Skills Platform | Versioned TypeScript contracts, schemas, recipe specifications (`RECIPE_SCHEMA_VERSION = 1`), and artifact/invocation taxonomy. |
| `packages/skills-manager-adapter` | Skills Platform | Reference delivery adapter providing atomic preview, Windows junctions, macOS/Linux directory symlinks, owned copies, safe unlinking, and rollback. |

## 4. Multi-Provider Delivery Directory Matrix

| Assistant Target | Canonical Provider ID | Project Delivery Path | Delivery Mechanism |
|---|---|---|---|
| **Google Antigravity** | `antigravity` / `agy` | `<project_root>/.agents/skills/<skill-name>` | NTFS Junction / Symlink |
| **OpenAI Codex CLI** | `codex` | `<project_root>/.agents/skills/<skill-name>` | NTFS Junction / Symlink |
| **Anthropic Claude Desktop** | `claude` | `<project_root>/.claude/skills/<skill-name>` | NTFS Junction / Symlink |

## 5. Invocation Taxonomy (`InvocationMode`)

- **`model_invoked`** (Reflexes): Autonomous cognitive reflexes (e.g. `debloat`, `factchk`, `mandela`, `baseline-domain-router`).
- **`user_invoked`** (Commands): Explicitly executed by humans for high-impact or destructive operations (e.g. `bounded-baseline-condenser`, `hate`, `macrothink`, `re0-release`).
- **`hybrid`**: Dual-purpose skills usable both as autonomous background checks and direct user commands.
- **`unspecified`**: Unclassified legacy baseline.

## 5.1 Provider-specific skill authoring rulesets

Skill package analysis uses one execution-neutral common layer and two
independently versioned provider rulesets. A finding never changes source,
review state, activation, or invocation policy.

| Concern | Codex ruleset | Antigravity ruleset |
| --- | --- | --- |
| Official source | `developers.openai.com/codex/skills` | `antigravity.google/docs/skills` |
| Project discovery | `.agents/skills` from CWD to repository root | workspace `.agents/skills`; `.agent/skills` remains a legacy location |
| Global discovery | `$HOME/.agents/skills`, `/etc/codex/skills` | `$HOME/.gemini/config/skills` |
| Required frontmatter | `name`, `description` | `description`; `name` defaults to the folder |
| Optional package directories | `scripts`, `references`, `assets`, `agents` | `scripts`, `examples`, `resources` |
| Provider metadata | `agents/openai.yaml` interface, invocation policy, and MCP dependencies | no `openai.yaml` runtime contract |

Ruleset descriptors, analysis results, API payloads, and UI rendering share
the versioned contracts in `packages/skill-contracts`. Static analysis records
the exact ruleset ID and version used for each immutable source revision.

## 6. Distribution & Safety Rules

1. Symbolic links and NTFS junctions are the default materialization method.
2. Copies are explicit fallbacks and retain their source revision/digest.
3. Unlinking/pristine only changes delivery bindings; it never destroys registry revisions or unmanaged files.
4. Codex delivery uses the official `.agents/skills` discovery root and
   reconciles per-skill `[[skills.config]]` state atomically; a config change is
   reported as restart-required.
5. Upstream updates create reviewable candidate revisions without modifying active project delivery paths automatically.
6. Mutating tools (`mutate`) must pass the Responsibility Gate before execution.
7. Reader annotations and static analyses are Catalog sidecars. They are not
   activation inputs and cannot carry `enabled`, `desired_state`, `priority`,
   or prompt-injection controls.
8. Desired skill state, the last applied report, and observed provider state
   are separate facts. A UI must not label desired state as a live binding.
