const assert = require("node:assert/strict");
const test = require("node:test");
const { createSkillsManagerInspector, stateSummary } = require("../src");

test("Skills Manager inspector preserves inspector flags through npm and parses npm's preamble", async () => {
  const calls = [];
  const inspector = createSkillsManagerInspector({
    managerRoot: "C:/upstream-skills-manager",
    fileExists: () => false,
    execute: async (command, args, options) => {
      calls.push({ command, args, options });
      const payload = args.includes("providers")
        ? { checked_at: 1, providers: [{ provider_id: "codex", detected: true }] }
        : [{ skill_instance_id: "planning", provider_id: "codex", scope: "project", state: "enabled" }];
      return { stdout: `\n> Skills Manager inspect\n${JSON.stringify(payload)}` };
    },
  });

  const status = await inspector.inspect({ projectId: "manager-project" });

  assert.equal(status.scope, "project");
  assert.equal(status.manager_project_id, "manager-project");
  assert.deepEqual(status.summary, { total: 1, enabled: 1, disabled: 0, missing: 0, conflict: 0, unavailable: 0 });
  assert.deepEqual(calls.map(({ args }) => args), [
    ["run", "inspect", "--", "providers", "--project", "manager-project", "--json"],
    ["run", "inspect", "--", "bindings", "--project", "manager-project", "--json"],
  ]);
  assert.equal(calls[0].options.cwd, "C:/upstream-skills-manager");
});

test("Skills Manager inspector uses a ready inspector binary before npm", async () => {
  const calls = [];
  const inspector = createSkillsManagerInspector({
    managerRoot: "C:/upstream-skills-manager",
    binaryPath: "C:/upstream-skills-manager/skills-manager-inspect.exe",
    fileExists: () => true,
    execute: async (command, args, options) => {
      calls.push({ command, args, options });
      return { stdout: JSON.stringify(args[0] === "providers" ? { providers: [] } : []) };
    },
  });

  await inspector.inspect();

  assert.deepEqual(calls.map(({ command, args, options }) => ({ command, args, shell: options.shell })), [
    { command: "C:/upstream-skills-manager/skills-manager-inspect.exe", args: ["providers", "--json"], shell: false },
    { command: "C:/upstream-skills-manager/skills-manager-inspect.exe", args: ["bindings", "--json"], shell: false },
  ]);
});

test("binding state summary retains attention states", () => {
  assert.deepEqual(stateSummary([
    { state: "enabled" }, { state: "missing" }, { state: "conflict" }, { state: "unavailable" }, { state: "unknown" },
  ]), { total: 5, enabled: 1, disabled: 0, missing: 1, conflict: 1, unavailable: 1 });
});
