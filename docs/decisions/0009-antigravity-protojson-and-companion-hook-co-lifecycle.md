# ADR 0009: Decoupled Companion Hooks, Antigravity Protojson Runtime Contract, and Provider Co-Lifecycle Synchronization

## Status
Accepted (2026-09-13)

## Context
Following the stabilization of multi-runtime agent platforms (Google Antigravity, OpenAI Codex CLI, Anthropic Claude Code), two systemic architectural challenges were identified:

1. **Antigravity C++ Protobuf Unmarshaling Strictness (Protojson Schema Fragility)**:
   Google Antigravity uses strict C++ Protobuf JSON unmarshaling (`google::protobuf::util::JsonStringToMessage`) on `PreToolUse` hook responses.
   - Allowed fields are strictly limited to `decision`, `reason`, `overwrite`, and `permissionOverrides`.
   - Any auxiliary or legacy keys (e.g. `allow: true/false`, `status`, `self_correct_hint`, `violation_type`, `output.message`) trigger an immediate fatal C++ unmarshaling rejection (`unknown field "allow"`), halting tool execution entirely.
   - Input payloads across Antigravity CLI and IDE arrive with varying envelope structures: raw stdin, nested `toolCall.args` (both parsed JSON objects and stringified JSON blobs), snake_case protocol markers (`tool_call`), and variable stdin stream delays.

2. **Monolithic Guard Bloat & Skill-Hook Decoupling Deficit**:
   Historically, domain-specific guards (e.g., `test-storm-guard` for TDD or `scope-boundary-enforcer` for vertical context) were baked into the platform's monolithic global manifest (`DEFAULT_HOOKS`).
   - Fresh projects inherited irrelevant domain restrictions, creating noise and friction.
   - Hooks had no formal metadata binding them to the skills that required them, risking orphan scripts, untracked modifications, and inability to toggle lifecycle states atomically when a skill was enabled, disabled, or uninstalled.

## Decisions

### 1. Dual-Tier Hooks Architecture: Universal Baseline vs Decoupled Companion Hooks
- **Universal Security Baseline (`DEFAULT_HOOKS`)**:
  Restricted to essential system security guards required across all projects:
  1. `secret-leak-guard`: Intercepts API keys, tokens, and credentials in tool arguments.
  2. `destructive-command-blocker`: Rejects catastrophic shell commands (`rm -rf /`, raw disk wipes).
  3. `context-budget-guard`: Guards token budget density on massive read operations.
  4. `subagent-recursion-limiter`: Enforces recursion depth and concurrency ceilings on agent spawning.
  5. `scope-boundary-enforcer`: Prevents file modifications outside declared project scopes.
  6. `telemetry-collector` & `session-stop-flush`: Captures usage telemetry and flushes session summaries.
- **Companion Hooks Co-located with Skill Packages**:
  Domain-specific guards are packaged directly inside their owning skills (e.g., `test-storm-guard` inside `scoped-tdd-executor`):
  - Declared in a package-level `hooks.json` or `SKILL.md` frontmatter metadata.
  - Bound via `associated_skill` (and mirrored in `metadata.associated_skill`).
  - Co-located executable handlers stored under `<skill-folder>/scripts/`.

### 2. Skill-Companion Hook Co-Lifecycle Automation
- **Atomic Linking (`linkProjectSkill`)**:
  Linking a skill into a project automatically discovers companion hooks declared in the package, rebases relative script paths to absolute project paths, and registers them into the project manifest and native provider configs.
- **Atomic Unlinking & Disabling (`unlinkProjectSkill`, `updateHooksBySkillStatus`)**:
  Unlinking or disabling a skill automatically cascades to all associated companion hooks, preventing orphan execution.
- **Skill-Grouped CLI Control (`bin/sp-hooks`)**:
  - `sp-hooks list --by-skill`: Groups active hooks under their owning skill headers or "Unassociated System Guards".
  - `sp-hooks enable/disable --skill <id>`: Atomically toggles all companion hooks belonging to the designated skill.
  - `sp-hooks audit`: Verifies script existence, POSIX 0755 execution permissions, and flags any orphaned hooks whose parent skills are uninstalled or missing.

### 3. Strict Antigravity Protojson Runtime Contract
All guards (universal security and companion) adhere to the C++ Protobuf unmarshaling contract:
- **`PreToolUse` Output**:
  - Allowed keys: `['decision', 'reason', 'overwrite', 'permissionOverrides']`.
  - Allowed `decision` values: `"allow" | "deny" | "ask" | "force_ask"`.
  - Zero schema pollution: Auxiliary properties (e.g., `self_correct_hint`, `violation_type`) MUST be formatted into the `reason` string (e.g. `[reason, hint].filter(Boolean).join(" ")`).
  - Error catch blocks emit strictly `{ decision: "deny", reason: "..." }` (or `"allow"` for fail-open configurations) without leaking raw error objects.
- **`PostToolUse` Output**: Strictly `{}` (empty JSON object).
- **`Stop` Output**: Strictly `{ decision: "continue", reason: "..." }` or `{}`.
- **Universal Input Payload Resilience**:
  Guards handle:
  - Standard Antigravity `toolCall: { name, args }` envelopes.
  - Stringified JSON argument blobs (`typeof args === "string"` parsed safely).
  - Snake-case protocol markers (`tool_call`, `pre_tool_use`).
  - Raw stdin streams with up to 3000ms delay without premature timeouts.

### 4. Multi-Provider Synchronization & Drift Diagnostics
- `hooks-manager.js` maintains synchronous compilation for native provider targets:
  - Google Antigravity: `<delivery-root>/.agents/hooks.json`
  - OpenAI Codex: `<delivery-root>/.codex/hooks.json`
- `auditHooks` and `getHookDiagnostics` evaluate workspace state against provider configs and report deterministic states: `[synced]`, `[drift]`, `[unsupported]`, and `[missing_handler]`.

## Consequences

### Positive
- **Zero Antigravity Crashes**: Protobuf unmarshaling failures (`unknown field "allow"`) are completely eliminated across all 8 guards.
- **Lean Project Baselines**: Newly initialized projects start with minimal, non-intrusive security baselines without test suppression noise.
- **Automated Lifecycle Integrity**: Companion hooks exist only when their owning skills are active; manual hook configuration is eliminated.
- **Unified Observability**: Complete visibility of hook health and provider synchronization across Antigravity and Codex through `./bin/sp-hooks audit`.

### Negative & Operational Considerations
- Companion hook handlers in skill packages must maintain executable permissions (`chmod 0755`) on POSIX filesystems.
- Developers authoring new guards must adhere strictly to `formatGuardStdout` to avoid re-introducing schema pollution.
