# Companion Hook Authoring Standard

Use this reference when authoring, auditing, or packaging companion hooks inside a skill.

---

## 1. Purpose & Taxonomy Distinction

- **Skill vs Hook vs Guard**:
  - **Skill (`SKILL.md`)**: Prompt-level cognitive guidance for the LLM. Soft enforcement (instructions can be overlooked by the model).
  - **Hook (`hooks.json`)**: Runtime lifecycle interception pipeline (Antigravity `.agents/hooks.json`, Codex `.codex/hooks.json`). Hard interceptor (triggers automatically on tool calls).
  - **Guard (`scripts/*.js`)**: Deterministic executable script executed by the hook that returns `{ decision: "allow" | "deny" }`. Hard enforcement (physically blocks execution on denial).
- **Why Companion Hooks Exist**:
  Natural language instructions in `SKILL.md` alone cannot guarantee safety when an agent hallucinates or takes destructive shortcuts. Companion hooks bundle deterministic guards directly into a skill package to mechanically guarantee that critical workflows (such as scoped TDD execution) are obeyed.
- **Cross-Platform Scope**:
  Companion hooks operate across both Google Antigravity and OpenAI Codex. The strict Protojson requirements apply because Antigravity uses a strict C++ Protobuf JSON parser, but the architectural pattern is universal across all supported runtimes.

---

## 2. Directory Structure

A skill with companion hooks declares them at the skill root alongside its executable handlers:

```
skills-packages/<category>/<skill-name>/
├── SKILL.md
├── hooks.json                # Declares companion hooks for this skill
├── scripts/
│   └── <guard-name>.js       # Executable handler script (chmod 0755 required)
└── references/
```

---

## 3. `hooks.json` Specification

Declare companion hooks using the following standard format:

```json
{
  "hooks": [
    {
      "id": "my-companion-guard",
      "name": "My Companion Guard",
      "description": "Domain-specific safeguard attached to this skill",
      "event": "pre_tool_use",
      "associated_skill": "my-skill-name",
      "failure_policy": "closed",
      "handler": {
        "type": "command",
        "command": "node ./scripts/my-companion-guard.js"
      },
      "matcher": "run_command",
      "priority": 20,
      "enabled": true
    }
  ]
}
```

### Essential Attributes
- **`id`**: Unique kebab-case identifier (e.g. `test-storm-guard`).
- **`associated_skill`**: Must match the skill's canonical name.
- **`event`**: Valid event lifecycle identifier (`pre_tool_use`, `post_tool_use`, `on_test_run`, `stop`).
- **`failure_policy`**: `"closed"` for security/destructive guards; `"open"` for telemetry/advisory guards.
- **`handler.command`**: Relative path from the skill root (`./scripts/<script>.js`). The catalog automatically rebases this path during skill linking.

---

## 4. Google Antigravity Strict Protojson Runtime Contract

Google Antigravity validates `PreToolUse` hook responses against strict C++ Protobuf JSON descriptors.
**Any undeclared top-level field triggers a fatal unmarshaling crash (`unknown field`).**

### Allowed vs Forbidden Keys (`PreToolUse`)
- **Allowed**: `decision`, `reason`, `overwrite`, `permissionOverrides`
- **Forbidden**: `allow`, `status`, `self_correct_hint`, `violation_type`, `output`, `message`

### Output Formatting Heuristic
Always use the canonical `formatGuardStdout` pattern:

```javascript
function formatGuardStdout(result) {
  const isAntigravity =
    process.env.HOOK_RUNTIME === "antigravity" ||
    process.env.GEMINI_CONFIG_DIR ||
    process.env.ANTIGRAVITY_WORKSPACE ||
    !process.env.HOOK_RUNTIME;

  if (isAntigravity) {
    if (!result.allow) {
      // Merge hints and violation details directly into reason
      const reason = [result.reason, result.self_correct_hint]
        .filter(Boolean)
        .join(" ");
      return JSON.stringify({
        decision: "deny",
        reason: reason || "Action blocked by policy.",
      });
    }
    return JSON.stringify({ decision: "allow" });
  }

  // Subprocess test / legacy runner fallback
  return JSON.stringify({
    allow: result.allow,
    decision: result.allow ? "allow" : "deny",
    reason: result.reason,
    violation_type: result.violation_type || null,
    self_correct_hint: result.self_correct_hint || null,
  });
}
```

### Error Catch Block Contract
When an unexpected exception occurs inside the handler:
```javascript
try {
  // Guard evaluation logic
} catch (err) {
  // Never leak raw error objects or unhandled rejections
  const isAntigravity = ...;
  if (isAntigravity) {
    console.log(JSON.stringify({
      decision: "deny",
      reason: `Guard internal error: ${err.message}`,
    }));
    process.exit(0);
  }
}
```

---

## 5. Input Stdin Resilience

Handlers must handle delayed streaming and polymorphic payload shapes:
1. **Delay Buffer**: Buffer incoming chunks for up to 3000ms before concluding EOF.
2. **Polymorphic Payloads**:
   - Direct: `{ tool: "run_command", args: { command: "..." } }`
   - Nested: `{ toolCall: { name: "run_command", args: { command: "..." } } }`
   - Stringified: `toolCall.args` received as a JSON string (must safely `JSON.parse`).
   - Snake-case: `{ tool_call: { name: "...", args: { ... } } }`.

---

## 6. POSIX Permissions & Static Conformance

- All script files in `scripts/` MUST have executable permissions (`chmod 0755` / `chmod +x`).
- Verify conformance by running:
  ```bash
  ./bin/sp-hooks audit
  node apps/skills-catalog/src/cli.js skill validate <skill-path>
  ```
