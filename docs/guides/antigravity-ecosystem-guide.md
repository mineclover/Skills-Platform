# Antigravity Ecosystem & Integration Guide

This guide documents the architecture, customization mechanisms, lifecycle hooks, runtime protocols, and integration surface of **Google Antigravity (AGY)**, grounded in the canonical Antigravity 2.0 and CLI (v1.2.2 / v1.1.27+) specifications.

---

## 1. Architectural Surfaces

Google Antigravity provides three primary execution surfaces operating on a shared configuration and transcript store under `~/.gemini/`:

```
                           Google Antigravity Platform
                     ┌──────────────────┴──────────────────┐
                     ▼                                     ▼
        Desktop / UI Surfaces                      Headless / CLI
    ┌─────────────────────────────┐        ┌─────────────────────────────┐
    │     Antigravity 2.0         │        │    Antigravity CLI (agy)    │
    │  - Electron desktop app     │        │  - v1.2.2 terminal binary   │
    │  - Chat Canvas & Artifacts  │        │  - Non-interactive --print  │
    │  - Auxiliary Pane & Crons   │        │  - stream-json pipelines    │
    ├─────────────────────────────┤        └─────────────────────────────┘
    │     Antigravity IDE         │
    │  - Standalone AI-first IDE  │
    │  - Inline code lenses       │
    │  - Sidebar chat panels      │
    └─────────────────────────────┘
                     │                                     │
                     └──────────────────┬──────────────────┘
                                        ▼
                         Customization & Storage Root
                        ~/.gemini/config/ & .agents/
```

### 1.1 Antigravity 2.0 (Desktop)
- **Chat Canvas**: Primary interaction surface supporting Markdown, Artifacts (code diffs, plans, walkthroughs), KaTeX math, and Mermaid diagrams.
- **Slash Commands**: Specialized agent workflows (e.g. `/goal`, `/schedule`, `/teamwork-preview`, `/boost`, `/learn`).
- **@ Mentions**: Context injection referencing files, folders, rules, terminals, and MCP tools.
- **Auxiliary Pane**: Displays live subagents, background tasks, generated artifacts, file diffs, and terminal sessions.
- **Scheduled Tasks**: Built-in cron scheduler and one-shot timers (`schedule` tool) persisted in background state.

### 1.2 Antigravity IDE
- AI-first IDE environment embedding agent panels directly alongside Monaco editor buffers.
- Inline code lenses for refactoring, diagnostics, and test generation.

### 1.3 Antigravity CLI (`agy`)
- Lightweight terminal interface located at `/Users/junwoobang/.local/bin/agy` (v1.2.2).
- **Interactive Mode**: `agy` launches full terminal TUI.
- **Print / Headless Mode**: `agy --print "prompt"` or `agy -p` runs single turns non-interactively.
- **Pipeline Integration**: `agy --input-format stream-json --output-format stream-json` consumes and emits NDJSON streams.
- **Subcommands**: `agent`/`agents`, `changelog`, `help`, `install`, `mcp`, `mic-serve`, `models`, `plugin`/`plugins`, `remote-control`, `update`.
- **Config**: Stored at `~/.gemini/antigravity-cli/settings.json`.

---

## 2. The 5 Customization Pillars

Antigravity structures agent behavior across 5 modular customization types:

| Customization | Location | Trigger Scope | Best For |
| :--- | :--- | :--- | :--- |
| **Rules** | `GEMINI.md`, `AGENTS.md` | Hierarchical / Directory | Strict invariants, coding standards, forbidden paths |
| **Skills** | `skills/<name>/SKILL.md` | On-Demand (Progressive) | Multi-step procedures, runbooks, tool recipes |
| **Hooks** | `.agents/hooks.json` | Lifecycle Events | Security gates, budget guards, linters, telemetry |
| **Plugins** | `plugins/<name>/plugin.json` | Packaged Bundle | Distributing related skills, rules, hooks, and MCP |
| **MCP Servers** | `mcp_config.json` | Tool Integration | Model Context Protocol external services |

### 2.1 Rules (`GEMINI.md` / `AGENTS.md`)
- **Hierarchical Discovery**: As files are accessed, Antigravity traverses upward from CWD to the git repository root, loading all discovered rule files.
- **Deduplication**: Rules are strictly deduplicated by resolved canonical filesystem path; a rule is never injected twice in one turn.
- **Scope**: Directives apply unconditionally to the directory and all subdirectories where the file resides.

### 2.2 Skills (`skills/<name>/SKILL.md`)
- **Directory Layout**:
  ```text
  skills/<skill_name>/
  ├── SKILL.md          # Required: YAML frontmatter (name, description) + instructions
  ├── scripts/          # Optional: Executable helpers and tools
  ├── examples/         # Optional: Code patterns and reference outputs
  ├── resources/        # Optional: Templates, assets, or data files
  └── references/       # Optional: In-depth documentation for progressive loading
  ```
- **Progressive Disclosure**: To optimize context tokens, Antigravity only injects the skill `name` and `description` into the agent's base system prompt. Full instructions in `SKILL.md` are only loaded when the agent explicitly activates the skill.

### 2.3 Lifecycle Hooks (`hooks.json`)
- Placed in `.agents/hooks.json` (workspace) or embedded within plugins.
- Executes synchronous command-line handlers (`type: "command"`) via `sh -c` (POSIX) or `cmd /c` (Windows).

### 2.4 Plugins (`plugins/<name>/`)
- Self-contained packages bundling skills, rules, hooks, and MCP servers.
- Declared via `plugin.json`. Toggled per-user in `~/.gemini/config/config.json`:
  ```json
  {
    "plugins": {
      "modern-web-guidance-plugin": { "enabled": true }
    }
  }
  ```

---

## 3. Lifecycle Hooks & Protojson Specification

Antigravity hooks communicate through a strict **C++ Protobuf / Protojson** interface over standard I/O.

### 3.1 Supported Event Types

| Event | Firing Trigger | Matcher Scope | Structure |
| :--- | :--- | :--- | :--- |
| `PreToolUse` | Before tool execution | Tool name (`run_command`, `*`) | Grouped (`matcher` + `hooks`) |
| `PostToolUse` | After tool completes | Tool name (`run_command`, `*`) | Grouped (`matcher` + `hooks`) |
| `PreInvocation` | Before model generation | N/A | Flat list of handlers |
| `PostInvocation`| After tool calls finish | N/A | Flat list of handlers |
| `Stop` | When agent loop halts | N/A | Flat list of handlers |

### 3.2 Common Input Metadata (stdin)
Every hook invocation receives system context as a camelCase JSON payload:
```json
{
  "conversationId": "09cb8b30-8930-4cd3-b557-c59cd6ebc850",
  "workspacePaths": ["/Users/junwoobang/workflow/Skills-Platform"],
  "transcriptPath": "/Users/junwoobang/.gemini/antigravity/transcript.jsonl",
  "artifactDirectoryPath": "/Users/junwoobang/.gemini/antigravity/artifacts",
  "modelName": "auto",
  "stepIdx": 19
}
```

### 3.3 `PreToolUse` Contract & Protobuf Validation

#### Input (stdin):
```json
{
  "toolCall": {
    "name": "run_command",
    "args": { "CommandLine": "rm -rf /tmp/data" }
  },
  "stepIdx": 19,
  ...commonFields
}
```

#### Output (stdout):
```json
{
  "decision": "allow",
  "reason": "Execution approved by security guard.",
  "overwrite": {
    "CommandLine": "rm -rf /tmp/data/subfolder"
  }
}
```

#### Critical Protocol Constraints:
1. **Valid Decision Values**:
   - `"allow"`: Permitted immediately without user prompt.
   - `"deny"`: Hard blocked immediately; tool execution is aborted.
   - `"ask"`: Prompts user for interactive confirmation.
   - `"force_ask"`: Always prompts user, bypassing cached grants.
2. **Arguments Overwriting**: `overwrite` allows hooks to safely mutate tool arguments before execution.
3. **Strict Protobuf Schema (The Protojson Rule)**:
   Antigravity's C++ Protobuf unmarshaler parses stdout with strict protojson validation. **Any unknown JSON field (such as `"allow": true` or `"status": "ok"`) causes a fatal unmarshaling crash** (`unknown field "allow"`), completely locking tool execution.

### 3.4 `PostToolUse` Contract
- **Input**: `{ "stepIdx": 5, "error": "exit status 1", ...commonFields }`
- **Output**: Must be an empty JSON object: `{}`.

### 3.5 `Stop` Contract (Loop Control)
- Used to enforce goal completion and prevent premature agent exit.
- **Output**: `{ "decision": "continue", "reason": "Background tests are still pending." }`

---

## 4. Discovery Hierarchy & Loading Priority

Antigravity resolves customizations following strict precedence (highest to lowest):

1. **Workspace Project Root**: Traversed upward from CWD (`.agents/`, `.agent/`, `_agents/`).
2. **Declared Project Configs**: Explicitly declared in `.agents/skills.json` or `.agents/plugins.json`.
3. **Global Machine Discovery**: `~/.gemini/config/` (`skills/`, `plugins/`, `rules/`).
4. **Built-in Application Skills**: Bundled inside `~/.gemini/antigravity/builtin/skills/`.
5. **Global Declared Configs**: Declared in `~/.gemini/config/skills.json`.

---

## 5. Skills Platform Bridge & Architecture

Skills Platform functions as a high-level compiler and policy control plane that bridges portable definitions into Antigravity native files:

```
[Skills Platform SSOT]
.skills-platform/hooks/manifest.json
         │
         ▼
[hooks-manager.js Compiler]
  - Resolves Antigravity capabilities
  - Preserves user unmanaged hooks in .agents/hooks.json
  - Re-bases script paths to project root
  - Emits native .agents/hooks.json
         │
         ▼
[Antigravity Native Runtime]
.agents/hooks.json  ──►  .skills-platform/hooks/guards/*.js
                            │
                            ▼
                     formatGuardStdout()
                     (Dual-Mode Protojson)
```

### 5.1 Dual-Mode Guard Output (`formatGuardStdout`)
To satisfy both Antigravity's strict protojson unmarshaler and legacy node unit tests, all platform guards use runtime detection:

```javascript
function formatGuardStdout(result, payload = {}, env = process.env) {
  const isAntigravity = Boolean(
    env.HOOK_RUNTIME === "antigravity" ||
    payload?.conversationId ||
    payload?.workspacePaths ||
    payload?.transcriptPath ||
    payload?.toolName ||
    payload?.modelName
  );

  if (isAntigravity) {
    const output = { decision: result.decision || (result.allow ? "allow" : "deny") };
    if (result.reason) output.reason = result.reason;
    if (result.permissionOverrides) output.permissionOverrides = result.permissionOverrides;
    if (result.overwrite) output.overwrite = result.overwrite;
    return output; // Strict protojson: zero unknown fields
  }

  return result; // Backward-compatible test shape
}
```

---

## 6. Empirical Verification Guide

Run the following commands to verify the Antigravity integration on macOS:

```bash
# 1. Verify Antigravity CLI binary
agy --version
# Output: 1.1.27

# 2. Verify global configuration
cat ~/.gemini/config/config.json

# 3. Inspect platform hooks compiled for Antigravity
./bin/sp-hooks list --by-skill

# 4. Audit Antigravity hook protojson compliance
./bin/sp-hooks audit

# 5. Execute live Antigravity ecosystem test suite
node --test apps/skills-catalog/test/antigravity-ecosystem.test.js
```
