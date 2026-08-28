const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { execSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "../../..");
const GUARDS_DIR = path.resolve(ROOT, ".skills-platform/hooks/guards");

test("Tier 1 - F16.1: secret-leak-guard intercepts and blocks OpenAI / AWS / GitHub tokens", () => {
  const guardPath = path.join(GUARDS_DIR, "secret-leak-guard.js");
  const payload = JSON.stringify({
    tool: "run_command",
    CommandLine: "curl -H 'Authorization: Bearer sk-proj-1234567890abcdef1234567890' https://api.openai.com",
  });

  const stdout = execSync(`node "${guardPath}"`, {
    input: payload,
    encoding: "utf8",
    env: { ...process.env, HOOK_EVENT: "pre_tool_use" },
  });

  const parsed = JSON.parse(stdout.trim());
  assert.equal(parsed.allow, false);
  assert.match(parsed.reason, /credential|secret|API key/i);
  assert.ok(parsed.self_correct_hint);
});

test("Tier 1 - F16.2: destructive-command-blocker blocks catastrophic rm -rf and database drops", () => {
  const guardPath = path.join(GUARDS_DIR, "destructive-command-blocker.js");
  const payload = JSON.stringify({
    tool: "run_command",
    CommandLine: "rm -rf / --no-preserve-root",
  });

  const stdout = execSync(`node "${guardPath}"`, {
    input: payload,
    encoding: "utf8",
    env: { ...process.env, HOOK_EVENT: "pre_tool_use" },
  });

  const parsed = JSON.parse(stdout.trim());
  assert.equal(parsed.allow, false);
  assert.match(parsed.reason, /destructive|deletion|wipe/i);
});

test("Tier 1 - F16.3: context-budget-guard halts file writes exceeding 80k token density (~320KB)", () => {
  const guardPath = path.join(GUARDS_DIR, "context-budget-guard.js");
  const payload = JSON.stringify({
    tool: "write_to_file",
    TargetFile: "src/massive.txt",
    CodeContent: "A".repeat(350 * 1024),
  });

  const stdout = execSync(`node "${guardPath}"`, {
    input: payload,
    encoding: "utf8",
    env: { ...process.env, HOOK_EVENT: "pre_tool_use" },
  });

  const parsed = JSON.parse(stdout.trim());
  assert.equal(parsed.allow, false);
  assert.match(parsed.reason, /80k token|budget/i);
});

test("Tier 1 - F16.4: scope-boundary-enforcer audits file mutations and records drift telemetry", () => {
  const guardPath = path.join(GUARDS_DIR, "scope-boundary-enforcer.js");
  const payload = JSON.stringify({
    tool: "write_to_file",
    TargetFile: "unauthorized/file.js",
    spec: {
      local_horizontal_scope: {
        owned_files: ["src/file.js"],
        read_only_interfaces: [],
        out_of_bounds: ["unauthorized/*"],
      },
    },
  });

  const stdout = execSync(`node "${guardPath}"`, {
    input: payload,
    encoding: "utf8",
    env: { ...process.env, HOOK_EVENT: "post_tool_use" },
  });

  assert.ok(stdout.length > 0);
  const parsed = JSON.parse(stdout.trim());
  assert.equal(parsed.allow, false);
  assert.match(parsed.violation_type, /^scope_/);
  assert.match(parsed.reason, /scope boundary violation/i);
});

test("Tier 1 - F16.5: subagent-recursion-limiter blocks calls exceeding max depth 3 or concurrency 4", () => {
  const guardPath = path.join(GUARDS_DIR, "subagent-recursion-limiter.js");
  const payload = JSON.stringify({
    tool: "invoke_subagent",
    depth: 4,
    active_children_count: 2,
  });

  const stdout = execSync(`node "${guardPath}"`, {
    input: payload,
    encoding: "utf8",
    env: { ...process.env, HOOK_EVENT: "pre_tool_use" },
  });

  const parsed = JSON.parse(stdout.trim());
  assert.equal(parsed.allow, false);
  assert.match(parsed.reason, /recursion depth|ceiling/i);
});
