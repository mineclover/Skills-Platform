const test = require("node:test");
const assert = require("node:assert/strict");
const {
  CODEX_HOOK_EVENTS,
  createCodexHooksConfig,
  validateCodexHooksConfig,
} = require("../dist/index.js");

test("Codex hook contract accepts the current native command schema", () => {
  const config = {
    description: "Project hooks",
    hooks: {
      PreToolUse: [{
        matcher: "^(Bash|apply_patch)$",
        hooks: [{
          type: "command",
          command: "node dispatcher.js",
          commandWindows: "node dispatcher.js",
          timeout: 5,
          statusMessage: "Running project guards",
          async: true,
          additionalContextLimit: 5000,
        }],
      }],
      Stop: [{ matcher: "", hooks: [{ type: "mcp_tool", server: "scanner", tool: "scan", input: { path: "${cwd}" } }] }],
    },
  };

  assert.equal(validateCodexHooksConfig(config).valid, true);
  assert.equal(createCodexHooksConfig(config), config);
  assert.ok(CODEX_HOOK_EVENTS.has("PreToolUse"));
  assert.ok(CODEX_HOOK_EVENTS.has("Interrupt"));
});

test("Codex hook contract rejects malformed and unsupported native fields", () => {
  const invalid = {
    description: 42,
    extra: true,
    hooks: {
      FutureEvent: [],
      PreToolUse: [{
        unexpected: true,
        matcher: "",
        hooks: [{
          type: "script",
          command: "",
          unknown: true,
          timeout: 0,
          statusMessage: "",
        }],
      }],
    },
  };

  const validation = validateCodexHooksConfig(invalid);
  assert.equal(validation.valid, false);
  assert.ok(validation.issues.some((issue) => issue.field === "description"));
  assert.ok(validation.issues.some((issue) => issue.field === "extra"));
  assert.ok(validation.issues.some((issue) => issue.field === "hooks.FutureEvent"));
  assert.ok(validation.issues.some((issue) => issue.field.endsWith(".unknown")));
  assert.ok(validation.issues.some((issue) => issue.field.endsWith(".timeout")));
});
