const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { PassThrough, Readable } = require("node:stream");
const { saveHookManifest } = require("../src/hooks-manager");
const {
  MAX_STDIN_BYTES,
  extractPatchFiles,
  main,
  normalizeCodexPayload,
  readAllStdin,
  runCodexHookEvent,
} = require("../src/codex-hook-runner");

const REPOSITORY_ROOT = path.resolve(__dirname, "../../..");
const RUNNER_PATH = path.join(__dirname, "..", "src", "codex-hook-runner.js");
const SCOPE_GUARD_PATH = path.join(
  REPOSITORY_ROOT,
  ".skills-platform",
  "hooks",
  "guards",
  "scope-boundary-enforcer.js",
);

function createProject(t, prefix = "codex-hook-runner-") {
  const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  saveHookManifest({ projectPath, manifest: { hooks: [] } });
  t.after(() => fs.rmSync(projectPath, { recursive: true, force: true }));
  return projectPath;
}

function saveHooks(projectPath, hooks) {
  saveHookManifest({ projectPath, manifest: { hooks } });
}

function writeHookScript(projectPath, relativePath, source) {
  const target = path.join(projectPath, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, source, "utf8");
  return target;
}

function hook({
  id,
  event,
  target,
  matcher = null,
  priority = 100,
  failurePolicy = "open",
  env,
}) {
  return {
    id,
    name: id,
    event,
    enabled: true,
    matcher,
    priority,
    providers: ["codex"],
    failure_policy: failurePolicy,
    handler: {
      type: "script",
      target,
      timeout_ms: 3000,
      ...(env ? { env } : {}),
    },
  };
}

function codexToolEvent(projectPath, {
  eventName = "PreToolUse",
  toolName = "Bash",
  toolInput = { command: "echo ok" },
  toolResponse,
} = {}) {
  return {
    session_id: "thr_contract_test",
    transcript_path: null,
    cwd: projectPath,
    hook_event_name: eventName,
    model: "gpt-5.6-sol",
    permission_mode: "default",
    turn_id: "turn_contract_test",
    tool_name: toolName,
    tool_use_id: "call_contract_test",
    tool_input: toolInput,
    ...(toolResponse === undefined ? {} : { tool_response: toolResponse }),
  };
}

function captureSink() {
  const chunks = [];
  return {
    stream: {
      write(chunk) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
        return true;
      },
    },
    text() {
      return Buffer.concat(chunks).toString("utf8");
    },
  };
}

async function invokeMain(projectPath, input, argv = []) {
  const stdout = captureSink();
  const stderr = captureSink();
  const outcome = await main(
    ["--project", projectPath, ...argv],
    {
      stdin: Readable.from([Buffer.from(JSON.stringify(input), "utf8")]),
      stdout: stdout.stream,
      stderr: stderr.stream,
    },
  );
  return { outcome, stdout: stdout.text(), stderr: stderr.text() };
}

function blockingScript(reason) {
  return `process.stdout.write(JSON.stringify({ allow: false, reason: ${JSON.stringify(reason)} }));\n`;
}

test("Codex runner: PreToolUse Bash denial uses the 0.144.4 hook-specific output contract", async (t) => {
  const projectPath = createProject(t);
  const target = writeHookScript(projectPath, ".test-hooks/deny-bash.js", blockingScript("rm is blocked"));
  saveHooks(projectPath, [hook({
    id: "deny-bash",
    event: "pre_tool_use",
    matcher: "run_command",
    priority: 1,
    target,
  })]);

  const execution = await invokeMain(projectPath, codexToolEvent(projectPath, {
    toolName: "Bash",
    toolInput: { command: "rm -rf build" },
  }));

  assert.equal(execution.outcome.blocked, true);
  assert.deepEqual(JSON.parse(execution.stdout), {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: "rm is blocked",
    },
  });
  assert.equal(execution.outcome.results[0].hookId, "deny-bash");
});

test("Codex runner: successful hooks exit with no stdout", async (t) => {
  const projectPath = createProject(t);
  const target = writeHookScript(projectPath, ".test-hooks/success.js", "process.exitCode = 0;\n");
  saveHooks(projectPath, [hook({
    id: "successful-hook",
    event: "pre_tool_use",
    matcher: "run_command",
    target,
  })]);

  const execution = await invokeMain(projectPath, codexToolEvent(projectPath));

  assert.equal(execution.outcome.blocked, false);
  assert.equal(execution.outcome.output, null);
  assert.equal(execution.outcome.results[0].status, "success");
  assert.equal(execution.stdout, "");
  assert.equal(execution.stderr, "");
});

test("Codex runner: PermissionRequest denial uses behavior=deny and message", async (t) => {
  const projectPath = createProject(t);
  const target = writeHookScript(projectPath, ".test-hooks/deny-permission.js", blockingScript("approval denied"));
  saveHooks(projectPath, [hook({
    id: "deny-permission",
    event: "permission_request",
    matcher: "run_command",
    target,
  })]);

  const input = codexToolEvent(projectPath, {
    eventName: "PermissionRequest",
    toolInput: {
      command: "curl https://example.test",
      description: "Request managed network access",
    },
  });
  delete input.tool_use_id;
  const execution = await invokeMain(projectPath, input);

  assert.deepEqual(JSON.parse(execution.stdout), {
    hookSpecificOutput: {
      hookEventName: "PermissionRequest",
      decision: { behavior: "deny", message: "approval denied" },
    },
  });
});

test("Codex runner: PostToolUse blocking result becomes model feedback", async (t) => {
  const projectPath = createProject(t);
  const target = writeHookScript(projectPath, ".test-hooks/review-output.js", blockingScript("review generated output"));
  saveHooks(projectPath, [hook({
    id: "post-review",
    event: "post_tool_use",
    matcher: "run_command",
    target,
  })]);

  const execution = await invokeMain(projectPath, codexToolEvent(projectPath, {
    eventName: "PostToolUse",
    toolInput: { command: "npm run generate" },
    toolResponse: { output: "generated files", exit_code: 0 },
  }));

  assert.deepEqual(JSON.parse(execution.stdout), {
    decision: "block",
    reason: "review generated output",
  });
});

test("Codex runner: apply_patch extracts normalized unique source and destination files", () => {
  const command = [
    "*** Begin Patch",
    "*** Update File: ./src/allowed.js",
    "*** Move to: src\\renamed.js",
    "*** Add File: src/한글 파일.js",
    "*** Delete File: src/old.js",
    "*** End Patch",
    "--- a/src/allowed.js\t2026-09-04",
    "+++ b/src/allowed.js\t2026-09-04",
    "--- /dev/null",
    "+++ b/src/한글 파일.js",
  ].join("\n");

  assert.deepEqual(extractPatchFiles(command), [
    "src/allowed.js",
    "src/renamed.js",
    "src/한글 파일.js",
    "src/old.js",
  ]);

  const input = { tool_name: "apply_patch", tool_input: { command } };
  const normalized = normalizeCodexPayload(input);
  assert.equal(normalized.tool, "replace_file_content");
  assert.equal(normalized.TargetFile, "src/allowed.js");
  assert.deepEqual(normalized.files, [
    "src/allowed.js",
    "src/renamed.js",
    "src/한글 파일.js",
    "src/old.js",
  ]);
  assert.deepEqual(normalized.parameters.files, normalized.files);
  assert.equal(normalized.CodeContent, command);
});

test("Codex runner: normalized apply_patch files drive the real scope guard", async (t) => {
  const projectPath = createProject(t);
  const specsDir = path.join(projectPath, ".skills-platform", "specs");
  fs.mkdirSync(specsDir, { recursive: true });
  fs.writeFileSync(path.join(specsDir, "current_topic.json"), JSON.stringify({
    topic_id: "codex-patch-scope",
    local_horizontal_scope: {
      owned_files: ["src/allowed.js"],
      out_of_bounds: ["src/blocked.js"],
    },
  }), "utf8");
  saveHooks(projectPath, [hook({
    id: "scope-boundary",
    event: "post_tool_use",
    matcher: "replace_file_content",
    target: SCOPE_GUARD_PATH,
    env: { SKILLS_PLATFORM_DISABLE_TELEMETRY: "1" },
  })]);

  const patch = [
    "*** Begin Patch",
    "*** Update File: ./src/allowed.js",
    "@@",
    "-old",
    "+new",
    "*** Update File: src\\blocked.js",
    "@@",
    "-old",
    "+new",
    "*** End Patch",
  ].join("\n");
  const execution = await invokeMain(projectPath, codexToolEvent(projectPath, {
    eventName: "PostToolUse",
    toolName: "apply_patch",
    toolInput: { command: patch },
    toolResponse: { output: "Done!" },
  }));

  assert.equal(execution.outcome.blocked, true);
  const output = JSON.parse(execution.stdout);
  assert.equal(output.decision, "block");
  assert.match(output.reason, /src\/blocked\.js/);
  assert.match(output.reason, /out_of_bounds/);
});

test("Codex runner: spawn_agent and Agent aliases normalize for the platform subagent guard", () => {
  for (const toolName of ["spawn_agent", "Agent"]) {
    const input = {
      hook_event_name: "PreToolUse",
      tool_name: toolName,
      tool_input: {
        task_name: "contract_audit",
        agent_type: "explorer",
        message: "Inspect only",
      },
    };
    const normalized = normalizeCodexPayload(input);
    assert.equal(normalized.tool, "invoke_subagent");
    assert.equal(normalized.action, "invoke_subagent");
    assert.equal(normalized.parameters.task_name, "contract_audit");
    assert.equal(normalized.arguments.agent_type, "explorer");
    assert.equal(normalized.codex, input);
  }
});

test("Codex runner: priority order is deterministic and denial short-circuits later hooks", async (t) => {
  const projectPath = createProject(t);
  const orderFile = path.join(projectPath, "hook-order.txt");
  const target = writeHookScript(projectPath, ".test-hooks/ordered.js", [
    'const fs = require("node:fs");',
    'fs.appendFileSync(process.env.ORDER_FILE, `${process.env.LABEL}\\n`);',
    'if (process.env.DENY === "1") {',
    '  process.stdout.write(JSON.stringify({ allow: false, reason: `blocked:${process.env.LABEL}` }));',
    '}',
    "",
  ].join("\n"));
  const orderedHook = (id, priority, deny = false) => hook({
    id,
    event: "pre_tool_use",
    matcher: "run_command",
    priority,
    target,
    env: {
      ORDER_FILE: orderFile,
      LABEL: id,
      DENY: deny ? "1" : "0",
    },
  });
  saveHooks(projectPath, [
    orderedHook("z-late", 30),
    orderedHook("a-first", 5),
    orderedHook("m-blocker", 10, true),
  ]);

  const outcome = await runCodexHookEvent({
    projectPath,
    eventName: "PreToolUse",
    input: codexToolEvent(projectPath),
  });

  assert.equal(outcome.blocked, true);
  assert.deepEqual(outcome.results.map((result) => result.hookId), ["a-first", "m-blocker"]);
  assert.deepEqual(fs.readFileSync(orderFile, "utf8").trim().split(/\r?\n/), ["a-first", "m-blocker"]);
  assert.match(outcome.output.hookSpecificOutput.permissionDecisionReason, /blocked:m-blocker/);
});

test("Codex runner: open failures continue, closed failures deny, and later hooks do not run", async (t) => {
  const projectPath = createProject(t);
  const lateMarker = path.join(projectPath, "late-hook-ran.txt");
  const lateTarget = writeHookScript(
    projectPath,
    ".test-hooks/late.js",
    `require("node:fs").writeFileSync(${JSON.stringify(lateMarker)}, "ran");\n`,
  );
  saveHooks(projectPath, [
    hook({
      id: "open-missing",
      event: "pre_tool_use",
      matcher: "run_command",
      priority: 1,
      target: path.join(projectPath, "missing-open.js"),
      failurePolicy: "open",
    }),
    hook({
      id: "closed-missing",
      event: "pre_tool_use",
      matcher: "run_command",
      priority: 2,
      target: path.join(projectPath, "missing-closed.js"),
      failurePolicy: "closed",
    }),
    hook({
      id: "late-hook",
      event: "pre_tool_use",
      matcher: "run_command",
      priority: 3,
      target: lateTarget,
    }),
  ]);

  const outcome = await runCodexHookEvent({
    projectPath,
    eventName: "PreToolUse",
    input: codexToolEvent(projectPath),
  });

  assert.equal(outcome.blocked, true);
  assert.deepEqual(outcome.results.map(({ hookId, status, allow }) => ({ hookId, status, allow })), [
    { hookId: "open-missing", status: "failed", allow: true },
    { hookId: "closed-missing", status: "failed", allow: false },
  ]);
  assert.match(outcome.output.hookSpecificOutput.permissionDecisionReason, /missing-closed\.js/);
  assert.equal(fs.existsSync(lateMarker), false);
});

test("Codex runner: malformed stdin fails open by default and exits 2 with --fail-closed", (t) => {
  const projectPath = createProject(t);
  const common = [RUNNER_PATH, "--project", projectPath];

  const failOpen = spawnSync(process.execPath, common, {
    input: '{"not":"finished"',
    encoding: "utf8",
  });
  assert.equal(failOpen.status, 0);
  assert.equal(failOpen.stderr, "");
  assert.match(JSON.parse(failOpen.stdout).systemMessage, /failed open.*one JSON object/i);

  const failClosed = spawnSync(process.execPath, [...common, "--fail-closed"], {
    input: '{"not":"finished"',
    encoding: "utf8",
  });
  assert.equal(failClosed.status, 2);
  assert.equal(failClosed.stdout, "");
  assert.match(failClosed.stderr, /one JSON object/);
});

test("Codex runner: stdin byte limit rejects oversized payloads and fails open at the CLI boundary", async () => {
  const stdin = new PassThrough();
  const reading = readAllStdin(stdin);
  stdin.end(Buffer.alloc(MAX_STDIN_BYTES + 1, 0x61));
  await assert.rejects(reading, new RegExp(`exceeds ${MAX_STDIN_BYTES} bytes`));

  const child = spawnSync(process.execPath, [RUNNER_PATH], {
    input: Buffer.alloc(MAX_STDIN_BYTES + 1, 0x61),
    encoding: "utf8",
  });
  assert.equal(child.status, 0);
  assert.equal(child.stderr, "");
  assert.match(JSON.parse(child.stdout).systemMessage, new RegExp(`exceeds ${MAX_STDIN_BYTES} bytes`));
});

test("Codex runner: byte-chunked UTF-8 stdin preserves Korean fields", async (t) => {
  const projectPath = createProject(t, "codex utf8 한글 ");
  const capturePath = path.join(projectPath, "정규화 payload.json");
  const target = writeHookScript(projectPath, ".test-hooks/capture-한글.js", [
    'const fs = require("node:fs");',
    "fs.writeFileSync(process.env.CAPTURE_PATH, process.env.HOOK_PAYLOAD, \"utf8\");",
    "",
  ].join("\n"));
  saveHooks(projectPath, [hook({
    id: "capture-unicode",
    event: "pre_tool_use",
    matcher: "run_command",
    target,
    env: { CAPTURE_PATH: capturePath },
  })]);
  const input = codexToolEvent(projectPath, {
    toolInput: { command: "printf '한글 경로/파일.txt'" },
  });
  const bytes = Buffer.from(JSON.stringify(input), "utf8");
  const stdin = new PassThrough();
  const stdout = captureSink();
  const running = main(["--project", projectPath], { stdin, stdout: stdout.stream });
  for (let index = 0; index < bytes.length; index += 1) {
    stdin.write(bytes.subarray(index, index + 1));
  }
  stdin.end();

  const outcome = await running;
  assert.equal(outcome.blocked, false);
  assert.equal(stdout.text(), "");
  const captured = JSON.parse(fs.readFileSync(capturePath, "utf8"));
  assert.equal(captured.CommandLine, "printf '한글 경로/파일.txt'");
  assert.equal(captured.codex.tool_input.command, "printf '한글 경로/파일.txt'");
});

test("Codex runner: CLI subprocess handles project and script paths containing spaces and Korean", (t) => {
  const projectPath = createProject(t, "Codex 훅 프로젝트 공백 ");
  const target = writeHookScript(
    projectPath,
    ".test hooks/한글 차단 훅.js",
    blockingScript("경로 계약 차단"),
  );
  saveHooks(projectPath, [hook({
    id: "unicode-path-hook",
    event: "pre_tool_use",
    matcher: "run_command",
    target,
  })]);
  const input = codexToolEvent(projectPath, {
    toolInput: { command: "echo 한글" },
  });

  const child = spawnSync(
    process.execPath,
    [RUNNER_PATH, "--project", projectPath, "--event", "PreToolUse"],
    { input: JSON.stringify(input), encoding: "utf8" },
  );

  assert.equal(child.status, 0, child.stderr);
  assert.equal(child.stderr, "");
  assert.deepEqual(JSON.parse(child.stdout), {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: "경로 계약 차단",
    },
  });
});
