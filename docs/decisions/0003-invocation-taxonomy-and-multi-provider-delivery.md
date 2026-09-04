# ADR 0003: Invocation Taxonomy and Multi-Provider Delivery

## Status
Accepted (2026-08-27)

## Context
When managing agent skills from modern agentic libraries (e.g. Paperthin), skills fall into distinct operational categories that cannot be captured solely by static tags or simple descriptions:
1. **Reflexes (`model_invoked`)**: Autonomous procedures designed to be reached for automatically by the AI agent during ordinary execution (e.g. `readchk`, `modelchk`, `sip`, `feynman`, `debloat`).
2. **Commands (`user_invoked`)**: High-impact, destructive, or steering procedures that must only be executed upon explicit human instruction (e.g. `hate`, `macrothink`, `re0-release`, `re0-plan`, `shower`). Letting an agent reach for a destructive adversarial review tool on its own could introduce severe demolition bias into normal development loops.

Furthermore, different AI assistant environments use distinct project and filesystem conventions for discovering skills and customizations:
- **Codex**: `<project_root>/.agents/skills/`
- **Antigravity (AGY)**: `<project_root>/.agents/skills/`
- **Claude**: `<project_root>/.claude/skills/`

Codex and Antigravity share the preferred project root but not the same global
root, required frontmatter, optional package directories, or invocation-policy
extension. Their authoring contracts therefore cannot be represented by one
undifferentiated provider schema.

## Decisions

### 1. First-class `InvocationMode` Contract
- Add `InvocationMode` (`"model_invoked" | "user_invoked" | "hybrid" | "unspecified"`) to `@skills-platform/contracts`.
- Propagate `invocation_mode` across `RegistrySkill`, `SkillLineage`, `SkillProfile`, `ActivationOperation`, and UI models.

### 2. Automatic Semantic and Frontmatter Inference
- During `parseArtifactManifest`:
  - First prioritize explicit frontmatter / manifest fields: `invocation_mode`, `invoker`, `invoked_by`.
  - If omitted, analyze `description` and manifest text using regular expressions (`\b(?:user[- ]invoked|human[- ]invoked)\b` vs `\b(?:model[- ]invoked|reflexes?)\b`).
  - Fall back to `unspecified` if undetermined, allowing operators to override via profile edit in UI or CLI.
- Keep Catalog `invocation_mode` separate from provider runtime policy.
  `agents/openai.yaml` `allow_implicit_invocation: false` describes Codex only
  and must not relabel the same package as user-invoked in Antigravity.

### 3. Provider-Aware Delivery Routing
- `defaultDeliveryRoot(providerId, projectPath)` automatically derives default delivery destinations:
  - `antigravity` / `agy` / `gemini` -> `<project_path>/.agents/skills`
  - `claude` -> `<project_path>/.claude/skills`
  - `codex` / default -> `<project_path>/.agents/skills`
- Global roots remain provider-specific: Codex uses `$HOME/.agents/skills` and
  Antigravity uses `$HOME/.gemini/config/skills`.
- The delivery adapter maintains strict safety: only managed symlinks and junctions are modified, and unmanaged files are never overwritten.

### 3.1 Independently Versioned Authoring Rulesets

- Maintain a common execution-neutral analysis layer plus separate Codex and
  Antigravity rulesets with official source URLs and independent versions.
- Record the exact ruleset fingerprint with each revision-pinned analysis.
- Report provider findings separately; portability does not mean applying the
  union of both providers' requirements as one stricter fictional schema.

### 4. Simplified Single-Step CLI Apply
- Add `skills-catalog project apply <project-id> [--confirm]` to generate the effective set plan and apply it through the adapter in a single deterministic command.

## Consequences
- **Safety**: Humans retain explicit control over high-impact tools, while models safely retain reflexes for autonomous problem-solving.
- **Interoperability**: A single catalog template (e.g. `paperthin-reflexes`) can be deployed to Codex, Antigravity, or other providers without manual path editing or duplicate configuration.
