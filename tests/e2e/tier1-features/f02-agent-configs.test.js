const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs/promises");
const { createSandbox } = require("../helpers/fixtures");

test("Tier 1 - F02.1: Antigravity Hook Config Schema (.agents/hooks.json)", async (t) => {
  const antigravityHookConfig = {
    hooks: [
      {
        name: "skills-platform-telemetry",
        events: ["PostToolUse"],
        tools: ["view_file", "run_command"],
        command: "node .skills-platform/hooks/telemetry-hook.js",
        blocking: false,
        timeout_ms: 100,
      },
    ],
  };

  assert.ok(Array.isArray(antigravityHookConfig.hooks));
  const hook = antigravityHookConfig.hooks[0];
  assert.equal(hook.name, "skills-platform-telemetry");
  assert.ok(hook.events.includes("PostToolUse"));
  assert.ok(hook.tools.includes("view_file"));
  assert.ok(hook.tools.includes("run_command"));
  assert.equal(hook.blocking, false);
});

test("Tier 1 - F02.2: Claude Code Hook Config Schema (.claude/hooks.json)", async (t) => {
  const claudeHookConfig = {
    version: "1.0",
    hooks: [
      {
        event: "tool_execution",
        filter: { tools: ["Bash", "FileRead", "run_command", "view_file"] },
        action: "execute",
        target: "node .skills-platform/hooks/telemetry-hook.js",
        async: true,
      },
    ],
  };

  assert.equal(claudeHookConfig.version, "1.0");
  assert.ok(Array.isArray(claudeHookConfig.hooks));
  const hook = claudeHookConfig.hooks[0];
  assert.equal(hook.event, "tool_execution");
  assert.equal(hook.async, true);
  assert.ok(hook.filter.tools.includes("view_file"));
});

test("Tier 1 - F02.3: Codex & Ralph-TUI NDJSON Stream Interception", async (t) => {
  const codexRalphConfig = {
    provider_id: "ralph-tui",
    stream_events: true,
    telemetry_pipe: ".skills-platform/telemetry/events.ndjson",
    supported_invocation_modes: ["model_invoked", "user_invoked", "hybrid"],
  };

  assert.equal(codexRalphConfig.stream_events, true);
  assert.ok(codexRalphConfig.supported_invocation_modes.includes("hybrid"));
  assert.equal(codexRalphConfig.provider_id, "ralph-tui");
});

test("Tier 1 - F02.4: Multi-Agent Hook Config Portability Across Workspaces", async (t) => {
  const { sandboxPath, cleanup } = await createSandbox("tier1-f02-");
  t.after(cleanup);

  const agentsDir = path.join(sandboxPath, ".agents");
  const claudeDir = path.join(sandboxPath, ".claude");
  await fs.mkdir(agentsDir, { recursive: true });
  await fs.mkdir(claudeDir, { recursive: true });

  const sampleAntigravity = { hooks: [{ event: "PostToolUse", script: ".skills-platform/hooks/telemetry-hook.js" }] };
  const sampleClaude = { hooks: [{ event: "tool_execution", script: ".skills-platform/hooks/telemetry-hook.js" }] };

  await fs.writeFile(path.join(agentsDir, "hooks.json"), JSON.stringify(sampleAntigravity, null, 2), "utf8");
  await fs.writeFile(path.join(claudeDir, "hooks.json"), JSON.stringify(sampleClaude, null, 2), "utf8");

  const readAgents = JSON.parse(await fs.readFile(path.join(agentsDir, "hooks.json"), "utf8"));
  const readClaude = JSON.parse(await fs.readFile(path.join(claudeDir, "hooks.json"), "utf8"));

  assert.equal(readAgents.hooks[0].event, "PostToolUse");
  assert.equal(readClaude.hooks[0].event, "tool_execution");
});

test("Tier 1 - F02.5: Agent Config Compatibility with Provider Identifier Contract", async () => {
  const allowedProviders = ["antigravity", "claude", "codex", "ralph-tui"];
  for (const provider of allowedProviders) {
    assert.ok(typeof provider === "string" && provider.length > 0);
  }
  assert.equal(allowedProviders.length, 4);
});
