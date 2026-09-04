const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "../..");
const {
  compileProviderConfigs,
  saveHookManifest,
} = require(path.join(ROOT, "apps/skills-catalog/src/hooks-manager"));

function runProcess(command, args, { cwd, env, timeoutMs = 180_000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout = [];
    const stderr = [];
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, timeoutMs);
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      resolve({
        code,
        signal,
        timedOut,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
      });
    });
  });
}

async function provisionLiveAuth(temporaryCodexHome) {
  if (process.env.OPENAI_API_KEY || process.env.CODEX_API_KEY) return { source: "environment" };

  const sourceAuthPath = process.env.CODEX_LIVE_AUTH_FILE
    || path.join(process.env.CODEX_HOME || path.join(os.homedir(), ".codex"), "auth.json");
  try {
    await fs.copyFile(sourceAuthPath, path.join(temporaryCodexHome, "auth.json"));
    await fs.chmod(path.join(temporaryCodexHome, "auth.json"), 0o600);
    return { source: "temporary-copy" };
  } catch {
    return null;
  }
}

function captureHook(id, event, captureLog) {
  return {
    id,
    name: id,
    event,
    enabled: true,
    matcher: null,
    handler: {
      type: "script",
      target: ".skills-platform/hooks/live-capture.js",
      timeout_ms: 5_000,
      env: { LIVE_CAPTURE_LOG: captureLog },
    },
    priority: 10,
    providers: ["codex"],
    failure_policy: "closed",
    metadata: { live_fixture: true },
  };
}

test("Codex live hooks: real UserPromptSubmit and Stop lifecycle uses an isolated CODEX_HOME", {
  skip: process.env.RUN_CODEX_LIVE !== "1"
    ? "Set RUN_CODEX_LIVE=1 to run the authenticated Codex hook lifecycle fixture"
    : false,
  timeout: 240_000,
}, async (t) => {
  const probe = spawnSync("codex", ["--version"], { encoding: "utf8" });
  if (probe.error?.code === "ENOENT" || probe.status !== 0) {
    t.skip("Codex CLI is not installed on this host");
    return;
  }

  const fixturePath = await fs.mkdtemp(path.join(os.tmpdir(), "codex-live-fixture 한글 'quote' "));
  const temporaryCodexHome = await fs.mkdtemp(path.join(os.tmpdir(), "codex-live-home-"));
  t.after(() => fs.rm(fixturePath, { recursive: true, force: true }));
  t.after(() => fs.rm(temporaryCodexHome, { recursive: true, force: true }));

  const auth = await provisionLiveAuth(temporaryCodexHome);
  if (!auth) {
    t.skip("No OPENAI_API_KEY/CODEX_API_KEY or readable Codex auth.json is available for the opt-in live run");
    return;
  }

  await fs.cp(path.join(ROOT, ".skills-platform"), path.join(fixturePath, ".skills-platform"), {
    recursive: true,
  });
  const captureLog = path.join(fixturePath, ".skills-platform", "codex-live-events.ndjson");
  const captureScript = path.join(fixturePath, ".skills-platform", "hooks", "live-capture.js");
  await fs.writeFile(captureScript, `
const fs = require("node:fs");
const input = JSON.parse(process.env.HOOK_PAYLOAD || "{}");
fs.appendFileSync(process.env.LIVE_CAPTURE_LOG, JSON.stringify({
  platform_event: process.env.HOOK_EVENT,
  provider_id: input.provider_id,
  native_event: input.codex && input.codex.hook_event_name,
  prompt: input.codex && input.codex.prompt,
  stop_hook_active: input.codex && input.codex.stop_hook_active,
}) + "\\n", "utf8");
`, "utf8");

  saveHookManifest({
    projectPath: fixturePath,
    manifest: {
      hooks: [
        captureHook("live-user-prompt-capture", "pre_invocation", captureLog),
        captureHook("live-stop-capture", "post_invocation", captureLog),
      ],
    },
  });
  const sync = compileProviderConfigs({ projectPath: fixturePath });
  assert.equal(sync.providers.codex.status, "synced");

  await fs.copyFile(
    path.join(fixturePath, ".codex", "hooks.json"),
    path.join(temporaryCodexHome, "hooks.json")
  );
  // Keep only the isolated user-layer copy so Codex cannot load the same dispatcher twice.
  await fs.rm(path.join(fixturePath, ".codex", "hooks.json"));
  await fs.writeFile(
    path.join(temporaryCodexHome, "config.toml"),
    "[features]\nhooks = true\n",
    "utf8"
  );

  const prompt = "Reply with exactly LIVE_HOOK_OK and do not call tools.";
  const live = await runProcess("codex", [
    "exec",
    "--dangerously-bypass-hook-trust",
    "--json",
    "--color", "never",
    "--ephemeral",
    "--skip-git-repo-check",
    "--sandbox", "read-only",
    "--ask-for-approval", "never",
    "-C", fixturePath,
    ...(process.env.CODEX_LIVE_MODEL ? ["--model", process.env.CODEX_LIVE_MODEL] : []),
    prompt,
  ], {
    cwd: fixturePath,
    env: { CODEX_HOME: temporaryCodexHome },
  });

  assert.equal(live.timedOut, false, `Codex live fixture timed out:\n${live.stderr}`);
  assert.equal(
    live.code,
    0,
    `Codex ${probe.stdout.trim()} live fixture failed using isolated auth (${auth.source}):\n${live.stderr || live.stdout}`
  );
  for (const line of live.stdout.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean)) {
    assert.doesNotThrow(() => JSON.parse(line), `--json emitted a non-JSON line: ${line}`);
  }

  const captured = (await fs.readFile(captureLog, "utf8"))
    .trim().split("\n").map((line) => JSON.parse(line));
  const promptEvent = captured.find((event) => event.native_event === "UserPromptSubmit");
  const stopEvent = captured.find((event) => event.native_event === "Stop");
  assert.ok(promptEvent, `Expected UserPromptSubmit capture, received: ${JSON.stringify(captured)}`);
  assert.equal(promptEvent.platform_event, "pre_invocation");
  assert.equal(promptEvent.provider_id, "codex");
  assert.equal(promptEvent.prompt, prompt);
  assert.ok(stopEvent, `Expected Stop capture, received: ${JSON.stringify(captured)}`);
  assert.equal(stopEvent.platform_event, "post_invocation");
  assert.equal(stopEvent.provider_id, "codex");
  assert.equal(stopEvent.stop_hook_active, false);
});
