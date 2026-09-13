const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { spawn } = require("node:child_process");
const { run, main } = require("../src/cli");
const {
  loadHookManifest,
  updateAllHooksStatus,
  auditHooks,
  registerHook,
} = require("../src/hooks-manager");

const REPO_ROOT = path.resolve(__dirname, "../../..");
const SP_HOOKS_BIN = path.resolve(REPO_ROOT, "bin/sp-hooks");

test("Hook CLI: Toggle single hook enable/disable via CLI run", async (context) => {
  const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), "skills-hook-toggle-"));
  context.after(() => fs.rm(projectPath, { recursive: true, force: true }));

  const initial = await run(["hook", "list", "--project", projectPath]);
  assert.ok(initial.hooks.length > 0);
  const targetHookId = initial.hooks[0].id;

  // Disable single hook
  await run(["hook", "disable", targetHookId, "--project", projectPath, "--no-sync"]);
  const afterDisable = await run(["hook", "list", "--project", projectPath]);
  assert.equal(afterDisable.hooks.find((h) => h.id === targetHookId).enabled, false);

  // Enable single hook
  await run(["hook", "enable", targetHookId, "--project", projectPath, "--no-sync"]);
  const afterEnable = await run(["hook", "list", "--project", projectPath]);
  assert.equal(afterEnable.hooks.find((h) => h.id === targetHookId).enabled, true);
});

test("Hook CLI: --all flag toggles all hooks simultaneously", async (context) => {
  const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), "skills-hook-all-"));
  context.after(() => fs.rm(projectPath, { recursive: true, force: true }));

  const initial = await run(["hook", "list", "--project", projectPath]);
  assert.ok(initial.hooks.length > 0);
  const initialTotal = initial.hooks.length;

  // Disable all hooks via --all
  const disableResult = await run(["hook", "disable", "--all", "--project", projectPath, "--no-sync"]);
  assert.equal(disableResult.ok, true);
  assert.equal(disableResult.total, initialTotal);
  assert.equal(disableResult.enabled, false);

  const afterDisableAll = await run(["hook", "list", "--project", projectPath]);
  assert.ok(afterDisableAll.hooks.every((h) => h.enabled === false));

  // Enable all hooks via positional "all"
  const enableResult = await run(["hook", "enable", "all", "--project", projectPath, "--no-sync"]);
  assert.equal(enableResult.ok, true);
  assert.equal(enableResult.total, initialTotal);
  assert.equal(enableResult.enabled, true);

  const afterEnableAll = await run(["hook", "list", "--project", projectPath]);
  assert.ok(afterEnableAll.hooks.every((h) => h.enabled === true));
});

test("Hook CLI: audit sub-command identifies valid hooks and detects defects", async (context) => {
  const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), "skills-hook-audit-"));
  context.after(() => fs.rm(projectPath, { recursive: true, force: true }));

  // Run audit on freshly initialized project
  const audit = await run(["hook", "audit", "--project", projectPath]);
  assert.ok(typeof audit.healthy === "boolean");
  assert.ok(audit.total_hooks > 0);
  assert.equal(audit.total_hooks, audit.enabled_count);
  assert.equal(audit.disabled_count, 0);
  assert.ok(Array.isArray(audit.hooks));
  assert.ok(audit.provider_sync);

  // Invalidate one hook by pointing to non-existent script
  await registerHook({
    projectPath,
    hook: {
      id: "broken-guard",
      name: "Broken Guard",
      event: "pre_tool_use",
      handler: { type: "script", target: "non/existent/script.js" },
    },
    sync: false,
  });

  const brokenAudit = await run(["hook", "audit", "--project", projectPath]);
  assert.equal(brokenAudit.healthy, false);
  const brokenHook = brokenAudit.hooks.find((h) => h.id === "broken-guard");
  assert.ok(brokenHook);
  assert.equal(brokenHook.exists, false);
  assert.ok(brokenHook.issues.some((i) => i.includes("does not exist")));
});

test("Hook CLI: --table flag outputs formatted ASCII/Unicode table", async (context) => {
  const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), "skills-hook-table-"));
  context.after(() => fs.rm(projectPath, { recursive: true, force: true }));

  const tableOutput = await run(["hook", "list", "--project", projectPath, "--table"]);
  assert.equal(typeof tableOutput, "string");
  assert.ok(tableOutput.includes("┌─"));
  assert.ok(tableOutput.includes("Hook ID") || tableOutput.includes("ID"));
  assert.ok(tableOutput.includes("Event"));
  assert.ok(tableOutput.includes("State"));
  assert.ok(tableOutput.includes("└─"));

  // Audit with table
  const auditTable = await run(["hook", "audit", "--project", projectPath, "--table"]);
  assert.equal(typeof auditTable, "string");
  assert.ok(auditTable.includes("Audit Status:"));
  assert.ok(auditTable.includes("Providers   :"));
  assert.ok(auditTable.includes("┌─"));
});

test("Hook Manager: updateAllHooksStatus programmatic API", async (context) => {
  const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), "skills-mgr-all-"));
  context.after(() => fs.rm(projectPath, { recursive: true, force: true }));

  const res = updateAllHooksStatus({ projectPath, enabled: false, sync: false });
  assert.equal(res.ok, true);
  assert.equal(res.enabled, false);

  const manifest = loadHookManifest({ projectPath });
  assert.ok(manifest.hooks.every((h) => h.enabled === false));

  const reEnable = updateAllHooksStatus({ projectPath, enabled: true, sync: false });
  assert.equal(reEnable.ok, true);
  assert.equal(reEnable.enabled, true);

  const manifest2 = loadHookManifest({ projectPath });
  assert.ok(manifest2.hooks.every((h) => h.enabled === true));

  assert.throws(
    () => updateAllHooksStatus({ projectPath, enabled: "invalid" }),
    /must be a boolean/
  );
});

test("Hook CLI Executable: bin/sp-hooks executes subprocess successfully", async () => {
  const child = spawn(process.execPath, [SP_HOOKS_BIN, "list", "--json"], {
    cwd: REPO_ROOT,
  });

  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });

  const exitCode = await new Promise((resolve) => {
    child.on("close", resolve);
  });

  assert.equal(exitCode, 0, `sp-hooks failed with stderr: ${stderr}`);
  const parsed = JSON.parse(stdout);
  assert.ok(parsed.hooks_count > 0);
  assert.ok(Array.isArray(parsed.hooks));
});

test("Hook CLI: --skill flag requires value on list, enable, and disable", async (context) => {
  const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), "skills-hook-skill-err-"));
  context.after(() => fs.rm(projectPath, { recursive: true, force: true }));

  await assert.rejects(
    () => run(["hook", "list", "--project", projectPath, "--skill"]),
    /hook list requires --skill <id>/
  );

  await assert.rejects(
    () => run(["hook", "enable", "--project", projectPath, "--skill"]),
    /hook enable requires --skill <id>/
  );

  await assert.rejects(
    () => run(["hook", "disable", "--project", projectPath, "--skill"]),
    /hook disable requires --skill <id>/
  );
});

