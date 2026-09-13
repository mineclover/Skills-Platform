# Skills Platform Hook System & Antigravity Protojson Specification

## 1. Architectural Overview & System Topography

The Skills Platform hook architecture provides deterministic, multi-agent lifecycle interception and safety governance across Google Antigravity, OpenAI Codex, and Anthropic Claude Code.

```
                    ┌────────────────────────────────────────────────────────┐
                    │               Skills Platform Hook Engine              │
                    └───────────────────────────┬────────────────────────────┘
                                                │
                 ┌──────────────────────────────┴──────────────────────────────┐
                 ▼                                                             ▼
  ┌──────────────────────────────┐                              ┌──────────────────────────────┐
  │  Universal Security Baseline │                              │  Decoupled Companion Hooks   │
  │  (.skills-platform/manifest) │                              │  (skills-packages/*/hooks)   │
  ├──────────────────────────────┤                              ├──────────────────────────────┤
  │ • secret-leak-guard          │                              │ • test-storm-guard           │
  │ • destructive-command-block  │                              │   (scoped-tdd-executor)      │
  │ • context-budget-guard       │                              │ • scope-boundary-enforcer    │
  │ • subagent-recursion-limiter │                              │   (vertical-context skills)  │
  │ • scope-boundary-enforcer    │                              │ • custom domain guards       │
  │ • telemetry-collector        │                              │                              │
  └──────────────┬───────────────┘                              └──────────────┬───────────────┘
                 │                                                             │
                 └──────────────────────────────┬──────────────────────────────┘
                                                │
                    ┌───────────────────────────▼────────────────────────────┐
                    │       Native Provider Manifest Compilers               │
                    ├───────────────────────────┬────────────────────────────┤
                    │ Google Antigravity:       │ OpenAI Codex:              │
                    │   .agents/hooks.json      │   .codex/hooks.json        │
                    └───────────────────────────┴────────────────────────────┘
```

### 1.1 Dual-Tier Distribution Model
1. **Universal Security Baseline**:
   - Initialized by default in every managed workspace.
   - Restricts unsafe behaviors regardless of what skills are currently enabled.
   - Handlers live in `.skills-platform/hooks/guards/`.
2. **Companion Hooks**:
   - Co-located inside domain-specific skill packages (`skills-packages/*`).
   - Declared in a package-level `hooks.json` or `SKILL.md` frontmatter.
   - Automatically discovered, path-rebased, registered, and compiled upon `linkProjectSkill`.
   - Automatically disabled or unlinked upon `unlinkProjectSkill` or skill disabling.

---

## 2. Hook Event Taxonomy

| Event Name | Antigravity Native Event | Codex Native Event | Trigger Point | Execution Context |
| :--- | :--- | :--- | :--- | :--- |
| `pre_tool_use` | `PreToolUse` | `PreToolUse` | Right before agent invokes any tool | Tool interception & parameter filtering |
| `post_tool_use` | `PostToolUse` | `PostToolUse` | Right after tool execution finishes | Output observation, audit logging |
| `stop` | `Stop` | `SessionEnd` | When agent attempts to complete goal | Goal verification & completion gates |
| `on_test_run` | `PreToolUse` (`run_command`) | `PreToolUse` (`bash`) | Command execution targeting test runners | Test suppression & scoped TDD enforcement |
| `session_start` | — | `SessionStart` | Session initialization | Environment bootstrapping |
| `session_stop` | `Stop` | `SessionEnd` | Session shutdown | Metric flush & telemetry aggregation |

---

## 3. Antigravity Protojson Runtime Contract

Google Antigravity deserializes hook stdout using strict C++ Protobuf JSON unmarshaling (`google::protobuf::util::JsonStringToMessage`).
**CRITICAL RULE**: Any key not declared in the C++ Protobuf descriptor triggers an immediate fatal crash:
`unknown field "<key_name>"`

### 3.1 Allowed Keys by Event

#### `PreToolUse` Output
- **Allowed Top-Level Keys**: `decision`, `reason`, `overwrite`, `permissionOverrides`
- **Forbidden Keys**: `allow`, `status`, `self_correct_hint`, `violation_type`, `output`, `error`, `message`
- **Allowed `decision` Values**: `"allow"`, `"deny"`, `"ask"`, `"force_ask"`

```json
// Example: PreToolUse Deny
{
  "decision": "deny",
  "reason": "Destructive command blocked: 'rm -rf /' matches prohibited deletion pattern. Hint: Target specific directories inside your workspace."
}

// Example: PreToolUse Allow
{
  "decision": "allow"
}
```

#### `PostToolUse` Output
- **Allowed Top-Level Keys**: Strictly `{}` (empty JSON object).
- Any extra field triggers unmarshaling errors.

#### `Stop` Output
- **Allowed Top-Level Keys**: `decision`, `reason`
- **Allowed `decision` Values**: `"continue"` (to reject stop), or `{}` (to permit stop).

```json
// Example: Stop Rejection (Verification Gate)
{
  "decision": "continue",
  "reason": "Verification gate not satisfied: Full regression test suite must be run before completing task."
}
```

### 3.2 Canonical Output Formatting Function (`formatGuardStdout`)
All guard handlers MUST employ dual-mode formatting:

```javascript
function formatGuardStdout(result) {
  const isAntigravity =
    process.env.HOOK_RUNTIME === "antigravity" ||
    process.env.GEMINI_CONFIG_DIR ||
    process.env.ANTIGRAVITY_WORKSPACE ||
    !process.env.HOOK_RUNTIME; // Default to Antigravity compatibility

  if (isAntigravity) {
    if (!result.allow) {
      const reason = [result.reason, result.self_correct_hint]
        .filter(Boolean)
        .join(" ");
      return JSON.stringify({
        decision: "deny",
        reason: reason || "Action blocked by safety policy.",
      });
    }
    return JSON.stringify({ decision: "allow" });
  }

  // Legacy / Subprocess test fallback
  return JSON.stringify({
    allow: result.allow,
    decision: result.allow ? "allow" : "deny",
    reason: result.reason || (result.allow ? "Action permitted" : "Blocked"),
    violation_type: result.violation_type || null,
    self_correct_hint: result.self_correct_hint || null,
  });
}
```

### 3.3 Universal Input Payload Parsing
Guards must handle heterogeneous invocation payloads:
1. **Direct Tool Invocation**: `{ tool: "run_command", args: { command: "..." } }`
2. **Nested Antigravity Envelope**: `{ toolCall: { name: "run_command", args: { command: "..." } } }`
3. **Stringified JSON Arguments**: `{ toolCall: { name: "write_to_file", args: "{\"TargetFile\": \"...\"}" } }`
4. **Protobuf Snake Case**: `{ tool_call: { name: "...", args: { ... } } }`
5. **Delayed Stdin Streaming**: Buffer stdin for at least 3000ms before evaluating EOF.

---

## 4. Companion Hook Packaging Standard

### 4.1 Skill Package Layout
When a skill requires companion hooks, place them directly inside the skill directory:

```
skills-packages/<category>/<skill-name>/
├── SKILL.md
├── hooks.json                # Declares companion hooks for this skill
├── scripts/
│   └── <guard-name>.js       # Executable handler script (0755)
└── references/
```

### 4.2 `hooks.json` Specification

```json
{
  "hooks": [
    {
      "id": "test-storm-guard",
      "name": "Test Storm Suppression Guard",
      "description": "Suppresses unauthorized full-suite test executions during inner TDD loops",
      "event": "on_test_run",
      "associated_skill": "scoped-tdd-executor",
      "failure_policy": "closed",
      "handler": {
        "type": "command",
        "command": "node ./scripts/test-storm-guard.js"
      },
      "matcher": "run_command",
      "priority": 15,
      "enabled": true
    }
  ]
}
```

### 4.3 Automatic Discovery & Path Rebasing
When `skills-catalog sync` or `linkProjectSkill` executes:
1. Looks for `hooks.json` in the target skill source directory.
2. If found, reads all hook definitions.
3. Automatically sets `associated_skill` and mirrors into `metadata.associated_skill`.
4. Rebases relative handler paths (`./scripts/...`) to absolute paths targeting the skill's delivery location.
5. Registers the hook into the project manifest (`.skills-platform/hooks/manifest.json`).
6. Triggers compilation into `.agents/hooks.json` and `.codex/hooks.json`.

---

## 5. Multi-Provider Synchronization & Diagnostics

### 5.1 Compilation Rules
- **Google Antigravity (`.agents/hooks.json`)**:
  ```json
  {
    "hooks": {
      "PreToolUse": [
        {
          "matcher": "run_command",
          "hooks": [
            {
              "type": "command",
              "command": "node /path/to/guard.js"
            }
          ]
        }
      ]
    }
  }
  ```
- **OpenAI Codex (`.codex/hooks.json`)**:
  Uses single absolute dispatcher invocation per native event (`PreToolUse`, `PostToolUse`, `SessionEnd`).

### 5.2 Diagnostics States
- `[synced]`: Desired hooks in manifest match the compiled provider manifest exactly.
- `[drift]`: Discrepancy between desired manifest and compiled provider file.
- `[missing_handler]`: Hook script file does not exist on disk or lacks POSIX execution permissions.
- `[unsupported]`: Provider does not support the requested hook event mapping.

---

## 6. CLI Control Plane (`bin/sp-hooks`)

### 6.1 Inspection
```bash
# List all hooks grouped by owning skill
./bin/sp-hooks list --by-skill

# Filter hooks for a specific skill
./bin/sp-hooks list --skill scoped-tdd-executor

# Output formatted ASCII/Unicode table
./bin/sp-hooks list --table

# Output raw JSON for automation
./bin/sp-hooks list --json
```

### 6.2 Cascade Toggles
```bash
# Enable / disable all hooks attached to a skill atomically
./bin/sp-hooks enable --skill scoped-tdd-executor
./bin/sp-hooks disable --skill scoped-tdd-executor

# Safe-mode toggle (all hooks in project)
./bin/sp-hooks disable --all
./bin/sp-hooks enable --all

# Toggle single hook
./bin/sp-hooks enable secret-leak-guard
./bin/sp-hooks disable secret-leak-guard
```

### 6.3 Auditing
```bash
# Run comprehensive audit across handlers, permissions, and provider sync
./bin/sp-hooks audit

# Audit in JSON mode
./bin/sp-hooks audit --json
```

---

## 7. Testing & Verification Recipes

### 7.1 Running the Protojson Ecosystem Test Suite
```bash
node --test apps/skills-catalog/test/antigravity-ecosystem.test.js
```

### 7.2 Running the Skill-Hook Co-Lifecycle Test Suite
```bash
node --test apps/skills-catalog/test/skill-hook-co-lifecycle.test.js
```

### 7.3 Testing Guard CLI Handlers Locally
To test a guard handler against strict Protojson parsing manually:
```bash
# Allow case test
echo '{"toolCall":{"name":"run_command","args":{"command":"ls -la"}}}' | node .skills-platform/hooks/guards/destructive-command-blocker.js

# Deny case test (must output strict {"decision":"deny","reason":"..."} without extra keys)
echo '{"toolCall":{"name":"run_command","args":{"command":"rm -rf /"}}}' | node .skills-platform/hooks/guards/destructive-command-blocker.js
```
