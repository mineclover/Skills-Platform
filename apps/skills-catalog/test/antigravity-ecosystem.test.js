const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawnSync } = require("node:child_process");

const REPO_ROOT = path.resolve(__dirname, "../../..");
const GUARDS_DIR = path.resolve(REPO_ROOT, ".skills-platform/hooks/guards");
const AGY_BIN = "/Users/junwoobang/.local/bin/agy";

const {
  loadHookManifest,
  compileProviderConfigs,
  auditHooks,
} = require("../src/hooks-manager");

// Allowed top-level fields for Antigravity PreToolUse Protojson stdout
const PROTOJSON_ALLOWED_FIELDS = new Set([
  "decision",
  "reason",
  "overwrite",
  "permissionOverrides",
]);

const VALID_DECISIONS = new Set(["allow", "deny", "ask", "force_ask"]);

function executeGuardInAntigravityMode(scriptPath, payload) {
  const antPayload = {
    conversationId: "09cb8b30-8930-4cd3-b557-c59cd6ebc850",
    workspacePaths: [REPO_ROOT],
    transcriptPath: "/Users/junwoobang/.gemini/antigravity/transcript.jsonl",
    toolName: "run_command",
    modelName: "auto",
    stepIdx: 1,
    ...payload,
  };

  const payloadString = JSON.stringify(antPayload);

  const result = spawnSync(process.execPath, [scriptPath], {
    input: payloadString,
    env: {
      ...process.env,
      HOOK_EVENT: "pre_tool_use",
      HOOK_RUNTIME: "antigravity",
      HOOK_PAYLOAD: payloadString,
      SKILLS_PLATFORM_DISABLE_TELEMETRY: "1",
    },
    encoding: "utf8",
  });

  assert.equal(result.status, 0, `Guard execution failed: ${result.stderr}`);
  const stdout = result.stdout.trim();
  assert.ok(stdout.length > 0, "Guard must emit JSON output to stdout");

  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch (err) {
    assert.fail(`Guard output is not valid JSON: ${stdout}`);
  }
  return parsed;
}

function assertStrictProtojson(output) {
  assert.ok(typeof output === "object" && output !== null, "Output must be an object");
  assert.ok(output.decision, "Output must contain a 'decision' field");
  assert.ok(
    VALID_DECISIONS.has(output.decision),
    `Invalid decision: ${output.decision}. Must be one of: allow, deny, ask, force_ask`
  );

  // Assert NO forbidden keys exist (prevent C++ Protobuf unmarshaler fatal crash)
  for (const key of Object.keys(output)) {
    assert.ok(
      PROTOJSON_ALLOWED_FIELDS.has(key),
      `Forbidden protojson field "${key}" detected in Antigravity output! Allowed: ${[...PROTOJSON_ALLOWED_FIELDS].join(", ")}`
    );
  }

  // Explicit checks for known anti-patterns
  assert.equal(output.allow, undefined, "'allow' boolean field violates Protojson");
  assert.equal(output.status, undefined, "'status' field violates Protojson");
  assert.equal(output.violation_type, undefined, "'violation_type' field violates Protojson");
  assert.equal(output.self_correct_hint, undefined, "'self_correct_hint' field violates Protojson");
}

// ============================================================================
// 1. PROTOJSON STRICT PROTOCOL VERIFICATION ACROSS ALL GUARDS
// ============================================================================

test("Antigravity Ecosystem: secret-leak-guard emits strict Protojson on deny and allow", () => {
  const script = path.resolve(GUARDS_DIR, "secret-leak-guard.js");
  const fakeAwsKey = ["AKIA", "IOSFODNN7EXAMPLE"].join("");

  // Deny case
  const denied = executeGuardInAntigravityMode(script, {
    CommandLine: `export AWS_KEY=${fakeAwsKey}`,
  });
  assertStrictProtojson(denied);
  assert.equal(denied.decision, "deny");
  assert.ok(denied.reason.includes("AWS Access Key ID"));
  assert.ok(denied.reason.includes("Hint:")); // hint included in reason without polluting schema

  // Allow case
  const allowed = executeGuardInAntigravityMode(script, {
    CommandLine: "echo 'hello world'",
  });
  assertStrictProtojson(allowed);
  assert.equal(allowed.decision, "allow");
});

test("Antigravity Ecosystem: destructive-command-blocker emits strict Protojson on deny and allow", () => {
  const script = path.resolve(GUARDS_DIR, "destructive-command-blocker.js");

  // Deny case
  const denied = executeGuardInAntigravityMode(script, {
    CommandLine: "rm -rf / --no-preserve-root",
  });
  assertStrictProtojson(denied);
  assert.equal(denied.decision, "deny");
  assert.ok(denied.reason.includes("Destructive"));

  // Allow case
  const allowed = executeGuardInAntigravityMode(script, {
    CommandLine: "npm test",
  });
  assertStrictProtojson(allowed);
  assert.equal(allowed.decision, "allow");
});

test("Antigravity Ecosystem: context-budget-guard emits strict Protojson on deny and allow", () => {
  const script = path.resolve(GUARDS_DIR, "context-budget-guard.js");

  // Deny case: oversized payload
  const denied = executeGuardInAntigravityMode(script, {
    CommandLine: "A".repeat(400 * 1024),
  });
  assertStrictProtojson(denied);
  assert.equal(denied.decision, "deny");
  assert.ok(denied.reason.includes("Context budget"));

  // Allow case: compact payload
  const allowed = executeGuardInAntigravityMode(script, {
    CommandLine: "git status",
  });
  assertStrictProtojson(allowed);
  assert.equal(allowed.decision, "allow");
});

test("Antigravity Ecosystem: subagent-recursion-limiter emits strict Protojson on deny and allow", () => {
  const script = path.resolve(GUARDS_DIR, "subagent-recursion-limiter.js");

  // Deny case: depth > 3
  const denied = executeGuardInAntigravityMode(script, {
    depth: 5,
    target_agent: "worker_excessive",
  });
  assertStrictProtojson(denied);
  assert.equal(denied.decision, "deny");
  assert.ok(denied.reason.includes("depth 5 exceeds"));

  // Allow case
  const allowed = executeGuardInAntigravityMode(script, {
    depth: 1,
    active_subagents: 1,
    call_chain: ["orchestrator"],
    target_agent: "worker_a",
  });
  assertStrictProtojson(allowed);
  assert.equal(allowed.decision, "allow");
});

test("Antigravity Ecosystem: scope-boundary-enforcer emits strict Protojson on deny and allow", () => {
  const script = path.resolve(GUARDS_DIR, "scope-boundary-enforcer.js");

  // Deny case: out of bounds modification matching spec
  const denied = executeGuardInAntigravityMode(script, {
    TargetFile: "secrets/credentials.key",
    spec: {
      local_horizontal_scope: {
        out_of_bounds: ["secrets/**"],
      },
    },
  });
  assertStrictProtojson(denied);
  assert.equal(denied.decision, "deny");
  assert.ok(denied.reason.includes("Scope boundary"));

  // Allow case: within allowed scope
  const allowed = executeGuardInAntigravityMode(script, {
    TargetFile: "src/safe.js",
    spec: {
      local_horizontal_scope: {
        owned_files: ["src/**"],
      },
    },
  });
  assertStrictProtojson(allowed);
  assert.equal(allowed.decision, "allow");
});

test("Antigravity Ecosystem: companion test-storm-guard emits strict Protojson on deny and allow", () => {
  const script = path.resolve(
    REPO_ROOT,
    "skills-packages/platform-core/scoped-tdd-executor/scripts/test-storm-guard.js"
  );

  // Deny case: unscoped test execution
  const denied = executeGuardInAntigravityMode(script, {
    CommandLine: "npm test",
  });
  assertStrictProtojson(denied);
  assert.equal(denied.decision, "deny");
  assert.ok(denied.reason.includes("Test storm suppressed"));

  // Allow case: scoped test
  const allowed = executeGuardInAntigravityMode(script, {
    CommandLine: "npm test -- apps/skills-catalog/test/guards.test.js",
  });
  assertStrictProtojson(allowed);
  assert.equal(allowed.decision, "allow");
  assert.equal(allowed.message, undefined, "message field must not pollute Protojson");
});

// ============================================================================
// 2. WORKSPACE COMPILATION FOR ANTIGRAVITY (.agents/hooks.json)
// ============================================================================

test("Antigravity Ecosystem: compiles valid .agents/hooks.json conforming to schema", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "antigravity-compile-"));
  try {
    const sync = compileProviderConfigs({ projectPath: tmpDir });
    const agentsHooksPath = path.join(tmpDir, ".agents", "hooks.json");

    assert.ok(fs.existsSync(agentsHooksPath), ".agents/hooks.json must be created");
    const manifest = JSON.parse(fs.readFileSync(agentsHooksPath, "utf8"));

    // Antigravity groups hooks under hook-id entries with lifecycle events
    assert.ok(manifest["secret-leak-guard"]);
    assert.ok(manifest["secret-leak-guard"].PreToolUse);
    assert.ok(Array.isArray(manifest["secret-leak-guard"].PreToolUse));

    for (const group of manifest["secret-leak-guard"].PreToolUse) {
      assert.ok(group.matcher !== undefined, "PreToolUse group must specify matcher");
      assert.ok(Array.isArray(group.hooks), "PreToolUse group must specify hooks array");
      for (const hook of group.hooks) {
        assert.equal(hook.type, "command", "Antigravity hook type must be 'command'");
        assert.ok(typeof hook.command === "string", "Hook command must be a string");
      }
    }

    assert.ok(manifest["destructive-command-blocker"]);
    assert.ok(manifest["destructive-command-blocker"].PreToolUse);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ============================================================================
// 3. CLI INTEGRATION & REPO AUDIT (EMPIRICAL SYSTEM VERIFICATION)
// ============================================================================

test("Antigravity Ecosystem: agy CLI binary responds with valid version", () => {
  const result = spawnSync(AGY_BIN, ["--version"], { encoding: "utf8" });
  assert.equal(result.status, 0, `agy --version failed: ${result.stderr}`);
  const version = result.stdout.trim();
  assert.match(version, /^\d+\.\d+\.\d+/, `Unexpected agy version format: ${version}`);
});

test("Antigravity Ecosystem: agy plugins list executes cleanly", () => {
  const result = spawnSync(AGY_BIN, ["plugins", "list"], { encoding: "utf8" });
  assert.equal(result.status, 0, `agy plugins list failed: ${result.stderr}`);
});

test("Antigravity Ecosystem: audit confirms all repo hooks are healthy and Protojson compliant", () => {
  const audit = auditHooks({ projectPath: REPO_ROOT });
  assert.equal(audit.orphan_count, 0, `Detected orphan hooks: ${JSON.stringify(audit.hooks.filter((h) => h.orphan))}`);
  assert.ok(audit.hooks.length >= 7, "Must contain all universal security guards");
  assert.equal(audit.healthy, true, `Audit should be healthy: ${JSON.stringify(audit.issues)}`);
  assert.equal(audit.provider_sync.antigravity, "synced");
  assert.equal(audit.provider_sync.codex, "synced");

  for (const hook of audit.hooks) {
    assert.equal(hook.orphan, false, `Hook ${hook.id} must not be an orphan`);
    assert.equal(hook.protojson_compliant, true, `Hook ${hook.id} must be protojson compliant`);
    assert.equal(hook.healthy, true, `Hook ${hook.id} must be healthy: ${JSON.stringify(hook.issues)}`);
  }
});

// ============================================================================
// 4. EDGE PAYLOADS & MALFORMED INPUT RESILIENCE UNDER ANTIGRAVITY MODE
// ============================================================================

test("Antigravity Ecosystem: all guards handle empty payloads and edge inputs with strict Protojson", () => {
  const guards = [
    path.resolve(GUARDS_DIR, "secret-leak-guard.js"),
    path.resolve(GUARDS_DIR, "destructive-command-blocker.js"),
    path.resolve(GUARDS_DIR, "context-budget-guard.js"),
    path.resolve(GUARDS_DIR, "subagent-recursion-limiter.js"),
    path.resolve(GUARDS_DIR, "scope-boundary-enforcer.js"),
    path.resolve(REPO_ROOT, "skills-packages/platform-core/scoped-tdd-executor/scripts/test-storm-guard.js"),
    path.resolve(REPO_ROOT, "skills-packages/community-codex/tdd/scripts/test-storm-guard.js"),
    path.resolve(REPO_ROOT, "skills-packages/platform-core/vertical-context-extractor/scripts/scope-boundary-enforcer.js"),
    path.resolve(REPO_ROOT, "skills-packages/platform-core/vertical-spec-documenter/scripts/scope-boundary-enforcer.js"),
  ];

  for (const guardScript of guards) {
    // 1. Empty payload
    const emptyOutput = executeGuardInAntigravityMode(guardScript, {});
    assertStrictProtojson(emptyOutput);

    // 2. Edge payload with unicode and null values
    const edgeOutput = executeGuardInAntigravityMode(guardScript, {
      CommandLine: null,
      command: undefined,
      TargetFile: "",
      parameters: { key: "안녕하세요 🚀", nested: null },
    });
    assertStrictProtojson(edgeOutput);
  }
});

test("Antigravity Ecosystem: guards handle raw and invalid input gracefully with strict Protojson", () => {
  const guards = [
    path.resolve(GUARDS_DIR, "secret-leak-guard.js"),
    path.resolve(GUARDS_DIR, "destructive-command-blocker.js"),
    path.resolve(GUARDS_DIR, "context-budget-guard.js"),
    path.resolve(GUARDS_DIR, "subagent-recursion-limiter.js"),
    path.resolve(GUARDS_DIR, "scope-boundary-enforcer.js"),
    path.resolve(REPO_ROOT, "skills-packages/platform-core/scoped-tdd-executor/scripts/test-storm-guard.js"),
    path.resolve(REPO_ROOT, "skills-packages/community-codex/tdd/scripts/test-storm-guard.js"),
    path.resolve(REPO_ROOT, "skills-packages/platform-core/vertical-context-extractor/scripts/scope-boundary-enforcer.js"),
    path.resolve(REPO_ROOT, "skills-packages/platform-core/vertical-spec-documenter/scripts/scope-boundary-enforcer.js"),
  ];

  for (const script of guards) {
    const result = spawnSync(process.execPath, [script], {
      input: "invalid-raw-non-json-string-payload",
      env: {
        ...process.env,
        HOOK_EVENT: "pre_tool_use",
        HOOK_RUNTIME: "antigravity",
        SKILLS_PLATFORM_DISABLE_TELEMETRY: "1",
      },
      encoding: "utf8",
    });
    assert.equal(result.status, 0, `Failed on ${script}: ${result.stderr}`);
    const parsed = JSON.parse(result.stdout.trim());
    assertStrictProtojson(parsed);
  }

  // Specifically verify destructive-command-blocker blocks raw shell command "rm -rf /"
  const destructiveScript = path.resolve(GUARDS_DIR, "destructive-command-blocker.js");
  const blockedResult = spawnSync(process.execPath, [destructiveScript], {
    input: "rm -rf /",
    env: {
      ...process.env,
      HOOK_EVENT: "pre_tool_use",
      HOOK_RUNTIME: "antigravity",
      SKILLS_PLATFORM_DISABLE_TELEMETRY: "1",
    },
    encoding: "utf8",
  });
  assert.equal(blockedResult.status, 0);
  const blockedParsed = JSON.parse(blockedResult.stdout.trim());
  assertStrictProtojson(blockedParsed);
  assert.equal(blockedParsed.decision, "deny");
  assert.ok(blockedParsed.reason.includes("Destructive"));

  // Specifically verify test-storm-guard blocks raw "npm test"
  const stormScript = path.resolve(REPO_ROOT, "skills-packages/platform-core/scoped-tdd-executor/scripts/test-storm-guard.js");
  const stormResult = spawnSync(process.execPath, [stormScript], {
    input: "npm test",
    env: {
      ...process.env,
      HOOK_EVENT: "pre_tool_use",
      HOOK_RUNTIME: "antigravity",
      SKILLS_PLATFORM_DISABLE_TELEMETRY: "1",
    },
    encoding: "utf8",
  });
  assert.equal(stormResult.status, 0);
  const stormParsed = JSON.parse(stormResult.stdout.trim());
  assertStrictProtojson(stormParsed);
  assert.equal(stormParsed.decision, "deny");
  assert.ok(stormParsed.reason.includes("Test storm"));
});

// ============================================================================
// 5. CANONICAL ANTIGRAVITY TOOLCALL SHAPE & COMPILATION INTEGRITY
// ============================================================================

test("Antigravity Ecosystem: all guards intercept canonical Antigravity toolCall structures without HOOK_RUNTIME env", () => {
  // 1. Destructive command blocker denies rm -rf / inside toolCall.args
  const destructiveScript = path.resolve(GUARDS_DIR, "destructive-command-blocker.js");
  const destructivePayload = JSON.stringify({
    toolCall: {
      name: "run_command",
      args: { CommandLine: "rm -rf /" },
    },
  });
  const dRes = spawnSync(process.execPath, [destructiveScript], {
    input: destructivePayload,
    encoding: "utf8",
  });
  assert.equal(dRes.status, 0);
  const dOut = JSON.parse(dRes.stdout.trim());
  assertStrictProtojson(dOut);
  assert.equal(dOut.decision, "deny");

  // 2. test-storm-guard denies npm test inside toolCall.args (both instances)
  const stormScripts = [
    path.resolve(REPO_ROOT, "skills-packages/platform-core/scoped-tdd-executor/scripts/test-storm-guard.js"),
    path.resolve(REPO_ROOT, "skills-packages/community-codex/tdd/scripts/test-storm-guard.js"),
  ];
  for (const sScript of stormScripts) {
    const stormPayload = JSON.stringify({
      toolCall: {
        name: "run_command",
        args: { CommandLine: "npm test" },
      },
    });
    const sRes = spawnSync(process.execPath, [sScript], {
      input: stormPayload,
      encoding: "utf8",
    });
    assert.equal(sRes.status, 0);
    const sOut = JSON.parse(sRes.stdout.trim());
    assertStrictProtojson(sOut);
    assert.equal(sOut.decision, "deny");
  }

  // 3. subagent-recursion-limiter denies depth > 3 inside toolCall.args
  const subagentScript = path.resolve(GUARDS_DIR, "subagent-recursion-limiter.js");
  const subagentPayload = JSON.stringify({
    toolCall: {
      name: "invoke_subagent",
      args: { depth: 5, target_agent: "worker_nested" },
    },
  });
  const subRes = spawnSync(process.execPath, [subagentScript], {
    input: subagentPayload,
    encoding: "utf8",
  });
  assert.equal(subRes.status, 0);
  const subOut = JSON.parse(subRes.stdout.trim());
  assertStrictProtojson(subOut);
  assert.equal(subOut.decision, "deny");

  // 4. scope-boundary-enforcer denies out-of-bounds mutation inside toolCall.args (all 3 instances)
  const scopeScripts = [
    path.resolve(GUARDS_DIR, "scope-boundary-enforcer.js"),
    path.resolve(REPO_ROOT, "skills-packages/platform-core/vertical-context-extractor/scripts/scope-boundary-enforcer.js"),
    path.resolve(REPO_ROOT, "skills-packages/platform-core/vertical-spec-documenter/scripts/scope-boundary-enforcer.js"),
  ];
  for (const scScript of scopeScripts) {
    const scopePayload = JSON.stringify({
      toolCall: {
        name: "write_to_file",
        args: {
          TargetFile: "secrets/credentials.key",
          spec: {
            local_horizontal_scope: {
              out_of_bounds: ["secrets/**"],
            },
          },
        },
      },
    });
    const scRes = spawnSync(process.execPath, [scScript], {
      input: scopePayload,
      encoding: "utf8",
    });
    assert.equal(scRes.status, 0);
    const scOut = JSON.parse(scRes.stdout.trim());
    assertStrictProtojson(scOut);
    assert.equal(scOut.decision, "deny");
  }
});

test("Antigravity Ecosystem: compiles on_test_run event to PreToolUse in Antigravity provider manifest", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "antigravity-test-run-compile-"));
  try {
    const { registerHook, compileProviderConfigs } = require("../src/hooks-manager");
    registerHook({
      projectPath: tmpDir,
      hook: {
        id: "test-storm-guard",
        name: "Test Storm Guard",
        event: "on_test_run",
        matcher: "test|run_command",
        handler: {
          type: "script",
          target: ".skills-platform/hooks/guards/destructive-command-blocker.js",
          timeout_ms: 2000,
        },
        providers: ["antigravity"],
      },
      sync: true,
    });

    const agentsHooksPath = path.join(tmpDir, ".agents", "hooks.json");
    assert.ok(fs.existsSync(agentsHooksPath));
    const agentsConfig = JSON.parse(fs.readFileSync(agentsHooksPath, "utf8"));
    assert.ok(agentsConfig["test-storm-guard"], "Must include test-storm-guard");
    assert.ok(agentsConfig["test-storm-guard"].PreToolUse, "on_test_run must compile into PreToolUse for Antigravity");
    assert.equal(agentsConfig["test-storm-guard"].PostToolUse, undefined, "on_test_run must NOT compile into PostToolUse");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("Antigravity Ecosystem: inspects stringified toolCall args across all guards with strict Protojson", () => {
  // 1. destructive-command-blocker with stringified toolCall.args
  const dcbRes = spawnSync(process.execPath, [path.resolve(GUARDS_DIR, "destructive-command-blocker.js")], {
    input: JSON.stringify({
      toolCall: {
        name: "run_command",
        args: JSON.stringify({ CommandLine: "rm -rf / --no-preserve-root" }),
      },
    }),
    encoding: "utf8",
  });
  assert.equal(dcbRes.status, 0);
  const dcbOut = JSON.parse(dcbRes.stdout.trim());
  assertStrictProtojson(dcbOut);
  assert.equal(dcbOut.decision, "deny");

  // 2. test-storm-guard with stringified toolCall.args
  const tsgRes = spawnSync(process.execPath, [
    path.resolve(REPO_ROOT, "skills-packages/platform-core/scoped-tdd-executor/scripts/test-storm-guard.js"),
  ], {
    input: JSON.stringify({
      toolCall: {
        name: "run_command",
        args: JSON.stringify({ CommandLine: "npm test" }),
      },
    }),
    encoding: "utf8",
  });
  assert.equal(tsgRes.status, 0);
  const tsgOut = JSON.parse(tsgRes.stdout.trim());
  assertStrictProtojson(tsgOut);
  assert.equal(tsgOut.decision, "deny");

  // 3. scope-boundary-enforcer with stringified toolCall.args
  const sbeRes = spawnSync(process.execPath, [path.resolve(GUARDS_DIR, "scope-boundary-enforcer.js")], {
    input: JSON.stringify({
      toolCall: {
        name: "write_to_file",
        args: JSON.stringify({
          TargetFile: "secrets/credentials.key",
          spec: { local_horizontal_scope: { out_of_bounds: ["secrets/**"] } },
        }),
      },
    }),
    encoding: "utf8",
  });
  assert.equal(sbeRes.status, 0);
  const sbeOut = JSON.parse(sbeRes.stdout.trim());
  assertStrictProtojson(sbeOut);
  assert.equal(sbeOut.decision, "deny");

  // 4. subagent-recursion-limiter with stringified toolCall.args
  const srlRes = spawnSync(process.execPath, [path.resolve(GUARDS_DIR, "subagent-recursion-limiter.js")], {
    input: JSON.stringify({
      toolCall: {
        name: "invoke_subagent",
        args: JSON.stringify({ current_depth: 5 }),
      },
    }),
    encoding: "utf8",
  });
  assert.equal(srlRes.status, 0);
  const srlOut = JSON.parse(srlRes.stdout.trim());
  assertStrictProtojson(srlOut);
  assert.equal(srlOut.decision, "deny");
});

test("Antigravity Ecosystem: identifies Antigravity protocol via snake_case metadata without HOOK_RUNTIME env", () => {
  const dcbRes = spawnSync(process.execPath, [path.resolve(GUARDS_DIR, "destructive-command-blocker.js")], {
    input: JSON.stringify({
      conversation_id: "agy-snake-conv-1",
      step_idx: 12,
      CommandLine: "rm -rf /",
    }),
    encoding: "utf8",
  });
  assert.equal(dcbRes.status, 0);
  const dcbOut = JSON.parse(dcbRes.stdout.trim());
  assertStrictProtojson(dcbOut);
  assert.equal(dcbOut.decision, "deny");
});

test("Antigravity Ecosystem: stdin streaming delay (>50ms) does not prematurely timeout", async () => {
  const { spawn } = require("node:child_process");
  const child = spawn(process.execPath, [path.resolve(GUARDS_DIR, "destructive-command-blocker.js")]);
  let stdout = "";
  child.stdout.on("data", (c) => { stdout += c; });
  const exitPromise = new Promise((resolve) => child.on("close", resolve));

  // Delay piping data by 60ms (well beyond previous 15ms premature timeout)
  setTimeout(() => {
    child.stdin.write(JSON.stringify({
      toolCall: {
        name: "run_command",
        args: { CommandLine: "rm -rf /" },
      },
    }));
    child.stdin.end();
  }, 60);

  const code = await exitPromise;
  assert.equal(code, 0);
  const out = JSON.parse(stdout.trim());
  assertStrictProtojson(out);
  assert.equal(out.decision, "deny");
});

test("Antigravity Ecosystem: malformed JSON stream with Antigravity marker outputs strict Protojson without schema pollution", () => {
  const dcbRes = spawnSync(process.execPath, [path.resolve(GUARDS_DIR, "destructive-command-blocker.js")], {
    input: "{\"toolCall\": { invalid json string",
    encoding: "utf8",
  });
  assert.equal(dcbRes.status, 0);
  const dcbOut = JSON.parse(dcbRes.stdout.trim());
  assertStrictProtojson(dcbOut);
  assert.equal(dcbOut.decision, "allow"); // open policy allows fallback on raw text non-match without crashing
});



