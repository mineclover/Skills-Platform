const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { spawn } = require("node:child_process");
const { run } = require("../src/cli");
const {
  loadHookManifest,
  saveHookManifest,
  registerHook,
  listHooks,
  listHooksBySkill,
  updateHooksBySkillStatus,
  updateAllHooksStatus,
  auditHooks,
  getHookDiagnostics,
  isSkillInstalledInProject,
  discoverCompanionHooks,
} = require("../src/hooks-manager");
const {
  createProject,
  setProjectSkillOverride,
  saveCatalog,
} = require("../src/catalog-state");
const { linkProjectSkill } = require("../src/catalog-workflows");

const REPO_ROOT = path.resolve(__dirname, "../../..");
const SP_HOOKS_BIN = path.resolve(REPO_ROOT, "bin/sp-hooks");

async function createTempProject(context) {
  const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), "skill-hook-test-"));
  context.after(() => fs.rm(projectPath, { recursive: true, force: true }));
  return projectPath;
}

test("R1 Metadata & Lineage: Hook definition binds to associated_skill and mirrors to metadata", async (context) => {
  const projectPath = await createTempProject(context);

  // 1. Register hook with top-level associated_skill
  const hook1 = registerHook({
    projectPath,
    hook: {
      id: "code-review-guard",
      name: "Code Review Guard",
      event: "pre_tool_use",
      associated_skill: "code-review",
      handler: { type: "command", command: "node -v" },
    },
    sync: false,
  });

  assert.equal(hook1.associated_skill, "code-review");
  assert.equal(hook1.metadata?.associated_skill, "code-review");

  // Verify persistence in manifest
  const manifest = loadHookManifest({ projectPath });
  const stored1 = manifest.hooks.find((h) => h.id === "code-review-guard");
  assert.ok(stored1);
  assert.equal(stored1.associated_skill, "code-review");
  assert.equal(stored1.metadata?.associated_skill, "code-review");

  // 2. Register hook with metadata.associated_skill
  const hook2 = registerHook({
    projectPath,
    hook: {
      id: "design-lint-guard",
      name: "Design Lint Guard",
      event: "post_tool_use",
      metadata: { associated_skill: "system-design" },
      handler: { type: "command", command: "node -v" },
    },
    sync: false,
  });

  assert.equal(hook2.associated_skill, "system-design");
  assert.equal(hook2.metadata?.associated_skill, "system-design");

  // 3. Diagnostics exposes associated_skill
  const diagnostics = getHookDiagnostics({ projectPath });
  const diag1 = diagnostics.hooks.find((h) => h.id === "code-review-guard");
  assert.ok(diag1);
  assert.equal(diag1.associated_skill, "code-review");

  const diag2 = diagnostics.hooks.find((h) => h.id === "design-lint-guard");
  assert.ok(diag2);
  assert.equal(diag2.associated_skill, "system-design");
});

test("R1 Orphan Audit: Detects hooks registered with non-existent or uninstalled skills", async (context) => {
  const projectPath = await createTempProject(context);

  // Register hook associated with non-existent skill
  registerHook({
    projectPath,
    hook: {
      id: "orphan-hook",
      name: "Orphan Hook",
      event: "pre_tool_use",
      associated_skill: "ghost-skill",
      handler: { type: "command", command: "node -v" },
    },
    sync: false,
  });

  // Audit should fail with orphan issue
  const audit1 = auditHooks({ projectPath });
  assert.equal(audit1.healthy, false);
  assert.ok(audit1.orphan_count > 0);
  const orphanResult = audit1.hooks.find((h) => h.id === "orphan-hook");
  assert.ok(orphanResult);
  assert.equal(orphanResult.orphan, true);
  assert.equal(orphanResult.associated_skill, "ghost-skill");
  assert.ok(orphanResult.issues.some((i) => i.includes("Orphan hook") && i.includes("ghost-skill")));

  // Now "install" the skill by creating its directory
  const installedSkillDir = path.join(projectPath, ".agents", "skills", "ghost-skill");
  await fs.mkdir(installedSkillDir, { recursive: true });
  await fs.writeFile(path.join(installedSkillDir, "SKILL.md"), "---\nname: ghost-skill\ndescription: now installed\n---\n# Ghost Skill", "utf8");

  // Verify isSkillInstalledInProject recognizes it
  assert.equal(isSkillInstalledInProject(projectPath, "ghost-skill"), true);

  // Re-audit: hook should now be healthy and no longer an orphan
  const audit2 = auditHooks({ projectPath });
  const curedHook = audit2.hooks.find((h) => h.id === "orphan-hook");
  assert.ok(curedHook);
  assert.equal(curedHook.orphan, false);
  assert.equal(curedHook.healthy, true);

  // Now "uninstall" the skill by removing the directory
  await fs.rm(installedSkillDir, { recursive: true, force: true });
  assert.equal(isSkillInstalledInProject(projectPath, "ghost-skill"), false);

  // Re-audit: hook becomes an orphan again
  const audit3 = auditHooks({ projectPath });
  assert.equal(audit3.healthy, false);
  const reOrphan = audit3.hooks.find((h) => h.id === "orphan-hook");
  assert.equal(reOrphan.orphan, true);
});

test("R2 Grouped & Filtered List: listHooksBySkill and list --by-skill table and JSON", async (context) => {
  const projectPath = await createTempProject(context);

  // Add 2 hooks associated with skill-alpha
  registerHook({
    projectPath,
    hook: {
      id: "alpha-pre-guard",
      name: "Alpha Pre Guard",
      event: "pre_tool_use",
      associated_skill: "skill-alpha",
      handler: { type: "command", command: "node -v" },
    },
    sync: false,
  });
  registerHook({
    projectPath,
    hook: {
      id: "alpha-post-guard",
      name: "Alpha Post Guard",
      event: "post_tool_use",
      associated_skill: "skill-alpha",
      handler: { type: "command", command: "node -v" },
    },
    sync: false,
  });

  // Add 1 hook associated with skill-beta
  registerHook({
    projectPath,
    hook: {
      id: "beta-guard",
      name: "Beta Guard",
      event: "pre_tool_use",
      associated_skill: "skill-beta",
      handler: { type: "command", command: "node -v" },
    },
    sync: false,
  });

  // Programmatic API check
  const grouped = listHooksBySkill({ projectPath });
  assert.ok(grouped.by_skill["skill-alpha"]);
  assert.equal(grouped.by_skill["skill-alpha"].length, 2);
  assert.ok(grouped.by_skill["skill-beta"]);
  assert.equal(grouped.by_skill["skill-beta"].length, 1);
  assert.ok(grouped.unassociated.length > 0); // system guards

  // CLI check: JSON format
  const jsonOutput = await run(["hook", "list", "--by-skill", "--project", projectPath]);
  assert.ok(jsonOutput.by_skill);
  assert.equal(jsonOutput.by_skill["skill-alpha"].length, 2);
  assert.equal(jsonOutput.by_skill["skill-beta"].length, 1);
  assert.ok(jsonOutput.unassociated.length >= 5);
  assert.ok(jsonOutput.total_hooks >= 8);

  // CLI check: Table format
  const tableOutput = await run(["hook", "list", "--by-skill", "--project", projectPath, "--table"]);
  assert.equal(typeof tableOutput, "string");
  assert.ok(tableOutput.includes("Owning Skill: skill-alpha (2 hooks)"));
  assert.ok(tableOutput.includes("alpha-pre-guard"));
  assert.ok(tableOutput.includes("alpha-post-guard"));
  assert.ok(tableOutput.includes("Owning Skill: skill-beta (1 hook)"));
  assert.ok(tableOutput.includes("beta-guard"));
  assert.ok(tableOutput.includes("Unassociated System Guards"));
  assert.ok(tableOutput.includes("secret-leak-guard"));

  // CLI check: Filter by single skill
  const alphaOnlyJson = await run(["hook", "list", "--skill", "skill-alpha", "--project", projectPath]);
  assert.equal(alphaOnlyJson.skill, "skill-alpha");
  assert.equal(alphaOnlyJson.hooks_count, 2);
  assert.ok(alphaOnlyJson.hooks.every((h) => h.associated_skill === "skill-alpha"));

  const alphaOnlyTable = await run(["hook", "list", "--skill", "skill-alpha", "--project", projectPath, "--table"]);
  assert.equal(typeof alphaOnlyTable, "string");
  assert.ok(alphaOnlyTable.includes("alpha-pre-guard"));
  assert.ok(alphaOnlyTable.includes("alpha-post-guard"));
  assert.ok(!alphaOnlyTable.includes("beta-guard"));
});

test("R2 Cascade Toggles: Atomically enable/disable all hooks for a skill", async (context) => {
  const projectPath = await createTempProject(context);

  // Register 3 hooks for skill-gamma
  registerHook({
    projectPath,
    hook: {
      id: "gamma-1",
      name: "Gamma 1",
      event: "pre_tool_use",
      associated_skill: "skill-gamma",
      enabled: true,
      handler: { type: "command", command: "node -v" },
    },
    sync: false,
  });
  registerHook({
    projectPath,
    hook: {
      id: "gamma-2",
      name: "Gamma 2",
      event: "post_tool_use",
      associated_skill: "skill-gamma",
      enabled: true,
      handler: { type: "command", command: "node -v" },
    },
    sync: false,
  });
  registerHook({
    projectPath,
    hook: {
      id: "gamma-3",
      name: "Gamma 3",
      event: "session_stop",
      associated_skill: "skill-gamma",
      enabled: true,
      handler: { type: "command", command: "node -v" },
    },
    sync: false,
  });

  // Programmatic API: Disable all gamma hooks atomically
  const disableRes = updateHooksBySkillStatus({
    projectPath,
    skillId: "skill-gamma",
    enabled: false,
    sync: false,
  });
  assert.equal(disableRes.ok, true);
  assert.equal(disableRes.skill, "skill-gamma");
  assert.equal(disableRes.total, 3);
  assert.equal(disableRes.changed, 3);
  assert.equal(disableRes.enabled, false);

  // Verify all gamma hooks are disabled in manifest
  let manifest = loadHookManifest({ projectPath });
  const gammaHooks = manifest.hooks.filter((h) => h.associated_skill === "skill-gamma");
  assert.ok(gammaHooks.every((h) => h.enabled === false));

  // Other hooks remain enabled
  const otherHooks = manifest.hooks.filter((h) => h.associated_skill !== "skill-gamma");
  assert.ok(otherHooks.some((h) => h.enabled === true));

  // CLI API: Enable all gamma hooks via --skill
  const enableRes = await run(["hook", "enable", "--skill", "skill-gamma", "--project", projectPath, "--no-sync"]);
  assert.equal(enableRes.ok, true);
  assert.equal(enableRes.total, 3);
  assert.equal(enableRes.enabled, true);

  manifest = loadHookManifest({ projectPath });
  const gammaAfterEnable = manifest.hooks.filter((h) => h.associated_skill === "skill-gamma");
  assert.ok(gammaAfterEnable.every((h) => h.enabled === true));

  // CLI API: Disable all gamma hooks via --skill
  const disableCliRes = await run(["hook", "disable", "--skill", "skill-gamma", "--project", projectPath, "--no-sync"]);
  assert.equal(disableCliRes.ok, true);
  assert.equal(disableCliRes.enabled, false);

  manifest = loadHookManifest({ projectPath });
  const gammaAfterDisable = manifest.hooks.filter((h) => h.associated_skill === "skill-gamma");
  assert.ok(gammaAfterDisable.every((h) => h.enabled === false));
});

test("R2 Catalog Lifecycle Reflection: Disabling skill in project cascades to associated hooks", async (context) => {
  const root = await createTempProject(context);
  const catalogRoot = path.join(root, "catalog");
  const registryRoot = path.join(root, "registry");
  const projectPath = path.join(root, "project");
  const sourceRoot = path.join(root, "source");
  const secAuditPath = path.join(sourceRoot, "sec-audit");

  await fs.mkdir(catalogRoot, { recursive: true });
  await fs.mkdir(registryRoot, { recursive: true });
  await fs.mkdir(projectPath, { recursive: true });
  await fs.mkdir(secAuditPath, { recursive: true });

  await fs.writeFile(
    path.join(secAuditPath, "SKILL.md"),
    "---\nname: sec-audit\ndescription: Security audit.\n---\n\n# Security audit\n",
    "utf8"
  );

  const { importLocalSource } = require("../src/registry");
  const imported = await importLocalSource({ registryRoot, sourcePath: sourceRoot });
  const secSkill = imported.skills.find((s) => s.skill_name === "sec-audit");
  assert.ok(secSkill);

  await createProject({
    catalogRoot,
    id: "proj-1",
    name: "Project 1",
    projectPath,
    providerId: "codex",
  });

  // Initialize project hooks with a hook associated with "sec-audit"
  registerHook({
    projectPath,
    hook: {
      id: "sec-audit-guard",
      name: "Security Audit Guard",
      event: "pre_tool_use",
      associated_skill: "sec-audit",
      enabled: true,
      handler: { type: "command", command: "node -v" },
    },
    sync: false,
  });

  // Verify hook is initially enabled
  let manifest = loadHookManifest({ projectPath });
  assert.equal(manifest.hooks.find((h) => h.id === "sec-audit-guard").enabled, true);

  // Simulate catalog command: setProjectSkillOverride to "disabled"
  await setProjectSkillOverride({
    catalogRoot,
    registryRoot,
    projectId: "proj-1",
    lineageId: secSkill.lineage_id,
    registrySkillId: secSkill.id,
    desiredState: "disabled",
  });

  // The hook should automatically cascade to disabled!
  manifest = loadHookManifest({ projectPath });
  const hookAfterDisable = manifest.hooks.find((h) => h.id === "sec-audit-guard");
  assert.equal(hookAfterDisable.enabled, false);

  // Now simulate catalog command: setProjectSkillOverride to "enabled"
  await setProjectSkillOverride({
    catalogRoot,
    registryRoot,
    projectId: "proj-1",
    lineageId: secSkill.lineage_id,
    registrySkillId: secSkill.id,
    desiredState: "enabled",
  });

  // The hook should automatically cascade to enabled!
  manifest = loadHookManifest({ projectPath });
  const hookAfterEnable = manifest.hooks.find((h) => h.id === "sec-audit-guard");
  assert.equal(hookAfterEnable.enabled, true);
});

test("R3 Companion Hook Discovery: Discovers embedded hooks in package structure and links them", async (context) => {
  const root = await createTempProject(context);
  const packagesRoot = path.join(root, "skills-packages");
  const catalogRoot = path.join(root, ".skills-platform");
  const projectPath = path.join(root, "project");

  await fs.mkdir(packagesRoot, { recursive: true });
  await fs.mkdir(catalogRoot, { recursive: true });
  await fs.mkdir(projectPath, { recursive: true });

  // 1. Create a skill package declaring companion hooks in hooks.json
  const skillDir = path.join(packagesRoot, "companion-suite");
  await fs.mkdir(path.join(skillDir, "scripts"), { recursive: true });
  await fs.writeFile(
    path.join(skillDir, "SKILL.md"),
    "---\nname: companion-suite\ndescription: Suite with companion hooks\n---\n# Companion Suite\n",
    "utf8"
  );
  await fs.writeFile(
    path.join(skillDir, "scripts", "guard.js"),
    "console.log(JSON.stringify({ allow: true, decision: 'allow' }));\n",
    "utf8"
  );
  await fs.writeFile(
    path.join(skillDir, "hooks.json"),
    JSON.stringify({
      hooks: [
        {
          id: "companion-suite-guard",
          name: "Companion Suite Guard",
          event: "pre_tool_use",
          handler: {
            type: "script",
            target: "scripts/guard.js",
          },
        },
      ],
    }, null, 2),
    "utf8"
  );

  // Test standalone discoverCompanionHooks function
  const discovered = discoverCompanionHooks({
    skillPath: skillDir,
    skillName: "companion-suite",
    projectPath,
    deliveryPath: path.join(projectPath, ".agents", "skills", "companion-suite"),
  });
  assert.equal(discovered.length, 1);
  assert.equal(discovered[0].id, "companion-suite-guard");
  assert.equal(discovered[0].associated_skill, "companion-suite");
  assert.equal(discovered[0].metadata?.associated_skill, "companion-suite");
  assert.equal(discovered[0].metadata?.companion, true);
  assert.equal(discovered[0].handler.target, ".agents/skills/companion-suite/scripts/guard.js");

  // 2. Link skill into project via linkProjectSkill
  const catalog = {
    schema_version: 1,
    projects: [
      {
        id: "proj-link-test",
        name: "Link Project",
        provider_id: "codex",
        scope: "project",
        project_path: projectPath,
        delivery_root: path.join(projectPath, ".agents", "skills"),
        skill_overrides: [],
      },
    ],
    presets: [],
    sources: [],
    source_revisions: [],
    skills: [],
    activation_plans: [],
    activation_reports: [],
  };
  await saveCatalog(catalogRoot, catalog);

  const linkResult = await linkProjectSkill({
    catalogRoot,
    projectId: "proj-link-test",
    skillName: "companion-suite",
    packagesRoot,
  });

  assert.equal(linkResult.linked, true);
  assert.ok(Array.isArray(linkResult.companion_hooks));
  assert.equal(linkResult.companion_hooks.length, 1);
  assert.equal(linkResult.companion_hooks[0].id, "companion-suite-guard");

  // Verify the hook was registered and compiled in project
  const projectManifest = loadHookManifest({ projectPath });
  const registeredCompanion = projectManifest.hooks.find((h) => h.id === "companion-suite-guard");
  assert.ok(registeredCompanion);
  assert.equal(registeredCompanion.associated_skill, "companion-suite");

  // Audit should report the companion hook as healthy (not orphan because skill is linked)
  const audit = auditHooks({ projectPath });
  const companionAudit = audit.hooks.find((h) => h.id === "companion-suite-guard");
  assert.ok(companionAudit);
  assert.equal(companionAudit.orphan, false);
  assert.equal(companionAudit.healthy, true);
});

test("R3 Companion Hook Discovery: Discovers hooks declared in SKILL.md frontmatter", async (context) => {
  const root = await createTempProject(context);
  const skillDir = path.join(root, "frontmatter-skill");
  await fs.mkdir(path.join(skillDir, "scripts"), { recursive: true });
  await fs.writeFile(
    path.join(skillDir, "scripts", "post.js"),
    "console.log('ok');\n",
    "utf8"
  );
  await fs.writeFile(
    path.join(skillDir, "SKILL.md"),
    `---
name: frontmatter-skill
description: Skill with frontmatter hooks
hooks:
  - id: fm-post-hook
    name: Frontmatter Post Hook
    event: post_tool_use
    handler:
      type: script
      target: scripts/post.js
---
# Frontmatter Skill
`,
    "utf8"
  );

  const discovered = discoverCompanionHooks({
    skillPath: skillDir,
    skillName: "frontmatter-skill",
    projectPath: root,
    deliveryPath: path.join(root, ".agents", "skills", "frontmatter-skill"),
  });

  assert.equal(discovered.length, 1);
  assert.equal(discovered[0].id, "fm-post-hook");
  assert.equal(discovered[0].event, "post_tool_use");
  assert.equal(discovered[0].associated_skill, "frontmatter-skill");
});

test("R3 Companion Hook Discovery: Discovers hooks declared in package.json", async (context) => {
  const root = await createTempProject(context);
  const skillDir = path.join(root, "pkg-skill");
  await fs.mkdir(skillDir, { recursive: true });
  await fs.writeFile(
    path.join(skillDir, "package.json"),
    JSON.stringify({
      name: "pkg-skill",
      hooks: [
        {
          id: "pkg-hook-1",
          event: "pre_tool_use",
          handler: { type: "command", command: "echo pre" },
        },
      ],
    }),
    "utf8"
  );

  const discovered = discoverCompanionHooks({
    skillPath: skillDir,
    skillName: "pkg-skill",
    projectPath: root,
  });

  assert.equal(discovered.length, 1);
  assert.equal(discovered[0].id, "pkg-hook-1");
  assert.equal(discovered[0].associated_skill, "pkg-skill");
});

test("Subprocess CLI: bin/sp-hooks list --by-skill, enable/disable --skill", async (context) => {
  const projectPath = await createTempProject(context);

  // Add test hooks via CLI run
  await run([
    "hook", "add",
    "--id", "sub-hook-1",
    "--name", "Sub Hook 1",
    "--event", "pre_tool_use",
    "--command", "node -v",
    "--skill", "sub-skill",
    "--project", projectPath,
    "--no-sync",
  ]);

  // Execute subprocess bin/sp-hooks list --by-skill --json
  const child = spawn(process.execPath, [
    SP_HOOKS_BIN, "list", "--by-skill", "--json", "--project", projectPath,
  ], { cwd: REPO_ROOT });

  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });

  const exitCode = await new Promise((resolve) => child.on("close", resolve));
  assert.equal(exitCode, 0, `sp-hooks failed: ${stderr}`);

  const parsed = JSON.parse(stdout);
  assert.ok(parsed.by_skill);
  assert.ok(parsed.by_skill["sub-skill"]);
  assert.equal(parsed.by_skill["sub-skill"][0].id, "sub-hook-1");

  // Execute subprocess bin/sp-hooks disable --skill sub-skill
  const childDisable = spawn(process.execPath, [
    SP_HOOKS_BIN, "disable", "--skill", "sub-skill", "--json", "--project", projectPath,
  ], { cwd: REPO_ROOT });

  let disableStdout = "";
  childDisable.stdout.on("data", (chunk) => { disableStdout += chunk; });
  const disableCode = await new Promise((resolve) => childDisable.on("close", resolve));
  assert.equal(disableCode, 0);
  const parsedDisable = JSON.parse(disableStdout);
  assert.equal(parsedDisable.ok, true);
  assert.equal(parsedDisable.enabled, false);

  // Verify disabled
  const manifest = loadHookManifest({ projectPath });
  assert.equal(manifest.hooks.find((h) => h.id === "sub-hook-1").enabled, false);
});

test("Edge Cases: updateHooksBySkillStatus input validations and non-matching skills", async (context) => {
  const projectPath = await createTempProject(context);

  assert.throws(
    () => updateHooksBySkillStatus({ projectPath, skillId: "", enabled: true }),
    /Skill id must be a non-empty string/
  );
  assert.throws(
    () => updateHooksBySkillStatus({ projectPath, skillId: "   ", enabled: true }),
    /Skill id must be a non-empty string/
  );
  assert.throws(
    () => updateHooksBySkillStatus({ projectPath, skillId: "valid-skill", enabled: "not-a-bool" }),
    /Hook enabled state must be a boolean/
  );

  // Non-matching skill returns 0 total and 0 changed
  const res = updateHooksBySkillStatus({ projectPath, skillId: "non-existent-skill", enabled: true, sync: false });
  assert.equal(res.ok, true);
  assert.equal(res.total, 0);
  assert.equal(res.changed, 0);
  assert.equal(res.hooks.length, 0);
});

test("Edge Cases: discoverCompanionHooks from scripts/ directory inference", async (context) => {
  const root = await createTempProject(context);
  const skillDir = path.join(root, "script-based-skill");
  const scriptsDir = path.join(skillDir, "scripts");
  await fs.mkdir(scriptsDir, { recursive: true });

  await fs.writeFile(path.join(scriptsDir, "pre_tool_use.js"), "console.log('pre');\n", "utf8");
  await fs.writeFile(path.join(scriptsDir, "custom-guard.js"), "console.log('guard');\n", "utf8");
  await fs.writeFile(path.join(scriptsDir, "telemetry-collector.js"), "console.log('tel');\n", "utf8");

  const discovered = discoverCompanionHooks({
    skillPath: skillDir,
    skillName: "script-based-skill",
    projectPath: root,
    deliveryPath: path.join(root, ".agents", "skills", "script-based-skill"),
  });

  assert.equal(discovered.length, 3);
  assert.ok(discovered.every((h) => h.associated_skill === "script-based-skill"));

  const preHook = discovered.find((h) => h.id.includes("pre_tool_use"));
  assert.ok(preHook);
  assert.equal(preHook.event, "pre_tool_use");

  const telHook = discovered.find((h) => h.id.includes("telemetry-collector"));
  assert.ok(telHook);
  assert.equal(telHook.event, "post_tool_use");

  // Non-existent skillPath returns empty array
  assert.deepEqual(discoverCompanionHooks({ skillPath: path.join(root, "non-existent") }), []);
});

test("Edge Cases: CLI enable/disable validation and formatting", async (context) => {
  const projectPath = await createTempProject(context);

  await assert.rejects(
    () => run(["hook", "enable", "--project", projectPath]),
    /hook enable requires <id>, --skill <id>, or --all/
  );
  await assert.rejects(
    () => run(["hook", "disable", "--project", projectPath]),
    /hook disable requires <id>, --skill <id>, or --all/
  );

  // Enable/disable with --table on non-matching skill
  const enableTable = await run(["hook", "enable", "--skill", "none", "--table", "--project", projectPath, "--no-sync"]);
  assert.ok(enableTable.includes("No hooks found for skill 'none'"));

  const disableTable = await run(["hook", "disable", "--skill", "none", "--table", "--project", projectPath, "--no-sync"]);
  assert.ok(disableTable.includes("No hooks found for skill 'none'"));
});

test("Reviewer Audit 1: getHookDiagnostics detects orphan hooks and computes orphan_count", async (context) => {
  const projectPath = await createTempProject(context);

  registerHook({
    projectPath,
    hook: {
      id: "diag-orphan",
      name: "Diag Orphan",
      event: "pre_tool_use",
      associated_skill: "missing-skill",
      handler: { type: "command", command: "node -v" },
    },
    sync: false,
  });

  const diagnostics = getHookDiagnostics({ projectPath });
  assert.equal(diagnostics.healthy, false);
  assert.equal(diagnostics.summary.orphanHooks, 1);
  assert.equal(diagnostics.summary.orphan_count, 1);

  const diagItem = diagnostics.hooks.find((h) => h.id === "diag-orphan");
  assert.ok(diagItem);
  assert.equal(diagItem.orphan, true);
  assert.equal(diagItem.runtimeReady, false);
  assert.ok(diagItem.issues.some((i) => i.includes("missing-skill") && i.includes("not installed")));
});

test("Reviewer Audit 2: updateAllHooksStatus and sp-hooks enable --all --table populate full columns", async (context) => {
  const projectPath = await createTempProject(context);

  const allRes = updateAllHooksStatus({ projectPath, enabled: true, sync: false });
  assert.ok(allRes.hooks.length > 0);
  const sample = allRes.hooks[0];
  assert.ok(sample.event);
  assert.ok(sample.failure_policy);
  assert.ok(typeof sample.priority === "number");

  const tableOutput = await run(["hook", "enable", "--all", "--project", projectPath, "--table", "--no-sync"]);
  assert.ok(tableOutput.includes("secret-leak-guard"));
  assert.ok(tableOutput.includes("pre_tool_use"));
  assert.ok(tableOutput.includes("open"));
});

test("Reviewer Audit 3: discoverCompanionHooks parses object dictionary hooks without crashing", async (context) => {
  const root = await createTempProject(context);
  const skillDir = path.join(root, "dict-hook-skill");
  await fs.mkdir(path.join(skillDir, "scripts"), { recursive: true });
  await fs.writeFile(path.join(skillDir, "scripts", "guard.js"), "console.log('ok');", "utf8");

  await fs.writeFile(
    path.join(skillDir, "package.json"),
    JSON.stringify({
      name: "dict-hook-skill",
      hooks: {
        pre_tool_use: "scripts/guard.js",
        custom_hook: {
          event: "post_tool_use",
          handler: { type: "command", command: "node -v" },
        },
      },
    }),
    "utf8"
  );

  const discovered = discoverCompanionHooks({
    skillPath: skillDir,
    skillName: "dict-hook-skill",
    projectPath: root,
  });

  assert.equal(discovered.length, 2);
  const preHook = discovered.find((h) => h.event === "pre_tool_use");
  assert.ok(preHook);
  assert.equal(preHook.associated_skill, "dict-hook-skill");

  const postHook = discovered.find((h) => h.event === "post_tool_use");
  assert.ok(postHook);
  assert.equal(postHook.associated_skill, "dict-hook-skill");
});

test("Reviewer Audit 4: URI encoded skill IDs in filter and cascade toggles", async (context) => {
  const projectPath = await createTempProject(context);

  registerHook({
    projectPath,
    hook: {
      id: "scoped-guard",
      name: "Scoped Guard",
      event: "pre_tool_use",
      associated_skill: "@scope/special-skill",
      handler: { type: "command", command: "node -v" },
    },
    sync: false,
  });

  // Query with encoded ID
  const listEncoded = listHooks({ projectPath, skillId: "%40scope%2Fspecial-skill" });
  assert.equal(listEncoded.length, 1);
  assert.equal(listEncoded[0].id, "scoped-guard");

  // Disable with encoded ID
  const disableRes = updateHooksBySkillStatus({
    projectPath,
    skillId: "%40scope%2Fspecial-skill",
    enabled: false,
    sync: false,
  });
  assert.equal(disableRes.changed, 1);

  const manifest = loadHookManifest({ projectPath });
  assert.equal(manifest.hooks.find((h) => h.id === "scoped-guard").enabled, false);
});

test("Reviewer Audit 5: clearProjectSkillOverride re-enables associated hooks in project", async (context) => {
  const root = await createTempProject(context);
  const catalogRoot = path.join(root, "catalog");
  const registryRoot = path.join(root, "registry");
  const projectPath = path.join(root, "project");
  const sourceRoot = path.join(root, "source");
  const auditSkillPath = path.join(sourceRoot, "clear-test-skill");

  await fs.mkdir(catalogRoot, { recursive: true });
  await fs.mkdir(registryRoot, { recursive: true });
  await fs.mkdir(projectPath, { recursive: true });
  await fs.mkdir(auditSkillPath, { recursive: true });

  await fs.writeFile(
    path.join(auditSkillPath, "SKILL.md"),
    "---\nname: clear-test-skill\ndescription: Clear test.\n---\n# Clear Test\n",
    "utf8"
  );

  const { importLocalSource } = require("../src/registry");
  const imported = await importLocalSource({ registryRoot, sourcePath: sourceRoot });
  const clearSkill = imported.skills.find((s) => s.skill_name === "clear-test-skill");
  assert.ok(clearSkill);

  await createProject({
    catalogRoot,
    id: "proj-clear-test",
    name: "Project Clear Test",
    projectPath,
    providerId: "codex",
  });

  registerHook({
    projectPath,
    hook: {
      id: "clear-test-guard",
      name: "Clear Test Guard",
      event: "pre_tool_use",
      associated_skill: "clear-test-skill",
      enabled: true,
      handler: { type: "command", command: "node -v" },
    },
    sync: false,
  });

  // Override to disabled
  await setProjectSkillOverride({
    catalogRoot,
    registryRoot,
    projectId: "proj-clear-test",
    lineageId: clearSkill.lineage_id,
    registrySkillId: clearSkill.id,
    desiredState: "disabled",
  });

  let manifest = loadHookManifest({ projectPath });
  assert.equal(manifest.hooks.find((h) => h.id === "clear-test-guard").enabled, false);

  // Clear override
  const { clearProjectSkillOverride } = require("../src/catalog-state");
  await clearProjectSkillOverride({
    catalogRoot,
    registryRoot,
    projectId: "proj-clear-test",
    lineageId: clearSkill.lineage_id,
  });

  // Hook should be re-enabled
  manifest = loadHookManifest({ projectPath });
  assert.equal(manifest.hooks.find((h) => h.id === "clear-test-guard").enabled, true);
});

test("Reviewer Audit 6: bin/sp-hooks help and --help output usage with exit code 0", async () => {
  for (const flag of ["--help", "help"]) {
    const child = spawn(process.execPath, [SP_HOOKS_BIN, flag], { cwd: REPO_ROOT });
    let stdout = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    const code = await new Promise((resolve) => child.on("close", resolve));
    assert.equal(code, 0);
    assert.ok(stdout.includes("Usage:"));
    assert.ok(stdout.includes("skills-catalog hook"));
  }
});

test("Reviewer Audit 7: isSkillInstalledInProject polymorphic calling conventions and provider sidecars", async (context) => {
  const projectPath = await createTempProject(context);

  // 1. Installed via .claude/skills sidecar
  const claudeDir = path.join(projectPath, ".claude", "skills");
  await fs.mkdir(claudeDir, { recursive: true });
  await fs.writeFile(path.join(claudeDir, "claude-skill.skills-platform-link-ownership.json"), "{}", "utf8");

  // Call with (projectPath, skillId)
  assert.equal(isSkillInstalledInProject(projectPath, "claude-skill"), true);

  // Call with (skillId, projectPath)
  assert.equal(isSkillInstalledInProject("claude-skill", projectPath), true);

  // Call with options object
  assert.equal(isSkillInstalledInProject({ projectPath, skillId: "claude-skill" }), true);

  // Uninstalled skill returns false
  assert.equal(isSkillInstalledInProject(projectPath, "uninstalled-skill"), false);
});

test("Reviewer Audit 8: isSkillInstalledInProject does not invert arguments when cwd contains matching skill name", async (context) => {
  const projectPath = await createTempProject(context);
  const installedSkillDir = path.join(projectPath, ".agents", "skills", "collision-skill");
  await fs.mkdir(installedSkillDir, { recursive: true });
  await fs.writeFile(path.join(installedSkillDir, "SKILL.md"), "---\nname: collision-skill\n---\n", "utf8");

  // Create a local directory in cwd with the same name as skill
  const nodeFs = require("node:fs");
  const localCollidingDir = path.resolve("collision-skill");
  let createdLocal = false;
  if (!nodeFs.existsSync(localCollidingDir)) {
    await fs.mkdir(localCollidingDir, { recursive: true });
    createdLocal = true;
  }
  try {
    // Calling with (skillId, projectPath) where projectPath is absolute
    const result = isSkillInstalledInProject("collision-skill", projectPath);
    assert.equal(result, true, "isSkillInstalledInProject must not invert arguments when skillId exists in cwd");
  } finally {
    if (createdLocal) {
      await fs.rm(localCollidingDir, { recursive: true, force: true });
    }
  }
});

test("Reviewer Audit 9: isSkillInstalledInProject decodes URL-encoded skill identities", async (context) => {
  const projectPath = await createTempProject(context);
  const scopedSkillDir = path.join(projectPath, ".agents", "skills", "@org", "my-package");
  await fs.mkdir(scopedSkillDir, { recursive: true });
  await fs.writeFile(path.join(scopedSkillDir, "SKILL.md"), "---\nname: @org/my-package\n---\n", "utf8");

  // Query using URL encoded identifier
  assert.equal(isSkillInstalledInProject(projectPath, "%40org%2Fmy-package"), true);
  assert.equal(isSkillInstalledInProject(projectPath, "@org/my-package"), true);
});

test("Reviewer Audit 10: discoverCompanionHooks parses dictionary map in hooks.json and hooks.yaml", async (context) => {
  const root = await createTempProject(context);

  // Test hooks.json with dictionary map inside hooks field
  const skillA = path.join(root, "dict-json-skill");
  await fs.mkdir(path.join(skillA, "scripts"), { recursive: true });
  await fs.writeFile(path.join(skillA, "scripts", "guard.js"), "console.log('ok');\n", "utf8");
  await fs.writeFile(
    path.join(skillA, "hooks.json"),
    JSON.stringify({
      hooks: {
        pre_tool_use: "scripts/guard.js",
      },
    }),
    "utf8"
  );

  const discoveredA = discoverCompanionHooks({ skillPath: skillA, skillName: "dict-json-skill", projectPath: root });
  assert.equal(discoveredA.length, 1);
  assert.equal(discoveredA[0].id, "dict-json-skill-pre_tool_use");
  assert.equal(discoveredA[0].associated_skill, "dict-json-skill");

  // Test root object map in hooks.json
  const skillB = path.join(root, "root-map-skill");
  await fs.mkdir(path.join(skillB, "scripts"), { recursive: true });
  await fs.writeFile(path.join(skillB, "scripts", "audit.js"), "console.log('audit');\n", "utf8");
  await fs.writeFile(
    path.join(skillB, "hooks.json"),
    JSON.stringify({
      post_tool_use: {
        target: "scripts/audit.js",
        failure_policy: "closed",
      },
    }),
    "utf8"
  );

  const discoveredB = discoverCompanionHooks({ skillPath: skillB, skillName: "root-map-skill", projectPath: root });
  assert.equal(discoveredB.length, 1);
  assert.equal(discoveredB[0].event, "post_tool_use");
  assert.equal(discoveredB[0].failure_policy, "closed");
});

test("Reviewer Audit 11: discoverCompanionHooks sets executable permissions (+x) on discovered scripts", async (context) => {
  if (process.platform === "win32") return;
  const root = await createTempProject(context);
  const skillDir = path.join(root, "non-exec-skill");
  const scriptPath = path.join(skillDir, "scripts", "guard.js");
  await fs.mkdir(path.join(skillDir, "scripts"), { recursive: true });
  await fs.writeFile(scriptPath, "console.log('guard');\n", { mode: 0o644 });

  // Verify initially not executable
  const initialMode = (await fs.stat(scriptPath)).mode;
  assert.equal(initialMode & 0o111, 0);

  discoverCompanionHooks({
    skillPath: skillDir,
    skillName: "non-exec-skill",
    projectPath: root,
  });

  // Verify now executable
  const updatedMode = (await fs.stat(scriptPath)).mode;
  assert.notEqual(updatedMode & 0o111, 0, "Discovered script should have executable bit set");
});

test("Reviewer Audit 12: CLI parseArguments parses --flag=value GNU syntax", async (context) => {
  const projectPath = await createTempProject(context);

  registerHook({
    projectPath,
    hook: {
      id: "filter-guard-1",
      name: "Filter Guard 1",
      event: "pre_tool_use",
      associated_skill: "target-skill-1",
      handler: { type: "command", command: "node -v" },
    },
    sync: false,
  });
  registerHook({
    projectPath,
    hook: {
      id: "filter-guard-2",
      name: "Filter Guard 2",
      event: "pre_tool_use",
      associated_skill: "target-skill-2",
      handler: { type: "command", command: "node -v" },
    },
    sync: false,
  });

  // Run with --skill=target-skill-1
  const output = await run(["hook", "list", "--skill=target-skill-1", "--project", projectPath]);
  assert.equal(output.skill, "target-skill-1");
  assert.equal(output.hooks_count, 1);
  assert.equal(output.hooks[0].id, "filter-guard-1");
});

test("Reviewer Audit 13: CLI enable and disable toggle multiple --skill flags cleanly", async (context) => {
  const projectPath = await createTempProject(context);

  registerHook({
    projectPath,
    hook: {
      id: "multi-a",
      name: "Multi A",
      event: "pre_tool_use",
      associated_skill: "skill-A",
      enabled: true,
      handler: { type: "command", command: "node -v" },
    },
    sync: false,
  });
  registerHook({
    projectPath,
    hook: {
      id: "multi-b",
      name: "Multi B",
      event: "pre_tool_use",
      associated_skill: "skill-B",
      enabled: true,
      handler: { type: "command", command: "node -v" },
    },
    sync: false,
  });

  // Disable both skills via multiple --skill flags
  const disableRes = await run([
    "hook", "disable",
    "--skill", "skill-A",
    "--skill", "skill-B",
    "--project", projectPath,
    "--no-sync",
  ]);
  assert.equal(disableRes.ok, true);
  assert.equal(disableRes.total, 2);
  assert.equal(disableRes.changed, 2);

  let manifest = loadHookManifest({ projectPath });
  assert.equal(manifest.hooks.find((h) => h.id === "multi-a").enabled, false);
  assert.equal(manifest.hooks.find((h) => h.id === "multi-b").enabled, false);

  // Enable both skills via multiple --skill flags
  const enableRes = await run([
    "hook", "enable",
    "--skill", "skill-A",
    "--skill", "skill-B",
    "--project", projectPath,
    "--no-sync",
  ]);
  assert.equal(enableRes.ok, true);
  assert.equal(enableRes.total, 2);
  assert.equal(enableRes.changed, 2);

  manifest = loadHookManifest({ projectPath });
  assert.equal(manifest.hooks.find((h) => h.id === "multi-a").enabled, true);
  assert.equal(manifest.hooks.find((h) => h.id === "multi-b").enabled, true);
});

test("Reviewer Audit 14: formatHooksTable renders webhook url and formatHooksBySkillTable has clean column headers", async (context) => {
  const projectPath = await createTempProject(context);

  registerHook({
    projectPath,
    hook: {
      id: "webhook-hook",
      name: "Webhook Hook",
      event: "pre_tool_use",
      associated_skill: "api-skill",
      handler: { type: "webhook", url: "https://api.example.test/guard" },
    },
    sync: false,
  });

  const table = await run(["hook", "list", "--skill", "api-skill", "--project", projectPath, "--table"]);
  assert.ok(table.includes("https://api.example.test/guard"));

  // Check by-skill table layout does not duplicate Skill column inside owning skill section
  const bySkillTable = await run(["hook", "list", "--by-skill", "--project", projectPath, "--table"]);
  assert.ok(bySkillTable.includes("Owning Skill: api-skill (1 hook)"));
  assert.ok(bySkillTable.includes("webhook-hook"));
});

test("Reviewer Audit 15: sp-hooks list --format=json outputs JSON without falling back to table", async (context) => {
  const projectPath = await createTempProject(context);

  const child = spawn(process.execPath, [
    SP_HOOKS_BIN, "list", "--format=json", "--project", projectPath,
  ], { cwd: REPO_ROOT });

  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const code = await new Promise((resolve) => child.on("close", resolve));

  assert.equal(code, 0, stderr);
  const parsed = JSON.parse(stdout);
  assert.ok(Array.isArray(parsed.hooks));
  assert.ok(!stdout.includes("┌─"));
});

test("Reviewer Audit 16: CLI parseArguments parses boolean flag values correctly (--table=true, --by-skill=false)", async (context) => {
  const projectPath = await createTempProject(context);

  // --table=true produces a formatted table
  const tableOutput = await run(["hook", "list", "--table=true", "--project", projectPath]);
  assert.equal(typeof tableOutput, "string");
  assert.ok(tableOutput.includes("┌─"));

  // --by-skill=false should NOT group by skill
  const nonGrouped = await run(["hook", "list", "--by-skill=false", "--project", projectPath]);
  assert.equal(typeof nonGrouped, "object");
  assert.ok(nonGrouped.hooks && !nonGrouped.by_skill);
});

test("Reviewer Audit 17: sp-hooks list --by-skill --skill <id> filters grouped output", async (context) => {
  const projectPath = await createTempProject(context);

  registerHook({
    projectPath,
    hook: {
      id: "filtered-1",
      name: "Filtered 1",
      event: "pre_tool_use",
      associated_skill: "target-skill",
      handler: { type: "command", command: "node -v" },
    },
    sync: false,
  });
  registerHook({
    projectPath,
    hook: {
      id: "filtered-2",
      name: "Filtered 2",
      event: "pre_tool_use",
      associated_skill: "other-skill",
      handler: { type: "command", command: "node -v" },
    },
    sync: false,
  });

  const grouped = await run(["hook", "list", "--by-skill", "--skill", "target-skill", "--project", projectPath]);
  assert.ok(grouped.by_skill["target-skill"]);
  assert.equal(grouped.by_skill["target-skill"].length, 1);
  assert.equal(grouped.by_skill["other-skill"], undefined);
});

test("Reviewer Audit 18: discoverCompanionHooks preserves target shorthand from object dictionary without defaulting to node -v", async (context) => {
  const root = await createTempProject(context);
  const skillDir = path.join(root, "shorthand-skill");
  await fs.mkdir(path.join(skillDir, "scripts"), { recursive: true });
  await fs.writeFile(path.join(skillDir, "scripts", "audit.js"), "console.log('audit');\n", "utf8");

  await fs.writeFile(
    path.join(skillDir, "hooks.json"),
    JSON.stringify({
      post_tool_use: {
        target: "scripts/audit.js",
        failure_policy: "closed",
      },
    }),
    "utf8"
  );

  const discovered = discoverCompanionHooks({
    skillPath: skillDir,
    skillName: "shorthand-skill",
    projectPath: root,
    deliveryPath: path.join(root, ".agents", "skills", "shorthand-skill"),
  });

  assert.equal(discovered.length, 1);
  assert.equal(discovered[0].handler.type, "script");
  assert.equal(discovered[0].handler.target, ".agents/skills/shorthand-skill/scripts/audit.js");
  assert.notEqual(discovered[0].handler.command, "node -v");
});

test("Reviewer Audit 19: discoverCompanionHooks rebases absolute script targets pointing inside skillPath correctly", async (context) => {
  const root = await createTempProject(context);
  const skillDir = path.join(root, "abs-skill");
  const scriptAbsPath = path.join(skillDir, "scripts", "guard.js");
  await fs.mkdir(path.join(skillDir, "scripts"), { recursive: true });
  await fs.writeFile(scriptAbsPath, "console.log('guard');\n", "utf8");

  await fs.writeFile(
    path.join(skillDir, "hooks.json"),
    JSON.stringify({
      hooks: [
        {
          id: "abs-guard",
          event: "pre_tool_use",
          handler: {
            type: "script",
            target: scriptAbsPath,
          },
        },
      ],
    }),
    "utf8"
  );

  const discovered = discoverCompanionHooks({
    skillPath: skillDir,
    skillName: "abs-skill",
    projectPath: root,
    deliveryPath: path.join(root, ".agents", "skills", "abs-skill"),
  });

  assert.equal(discovered.length, 1);
  assert.equal(discovered[0].handler.target, ".agents/skills/abs-skill/scripts/guard.js");
  assert.ok(!discovered[0].handler.target.includes(root));
});

test("Reviewer Audit 20: isSkillInstalledInProject detects nested package directories (skills-packages/*/<skillName>)", async () => {
  // Built-in skills in repository root
  assert.equal(isSkillInstalledInProject(REPO_ROOT, "lean-architecture"), true);
  assert.equal(isSkillInstalledInProject(REPO_ROOT, "skill-authoring-standard"), true);
  assert.equal(isSkillInstalledInProject(REPO_ROOT, "non-existent-wildcard-skill"), false);
});

test("Reviewer Audit 21: auditHooks validates webhook URL and exposes webhook target and handler in hookResults", async (context) => {
  const projectPath = await createTempProject(context);

  registerHook({
    projectPath,
    hook: {
      id: "valid-webhook",
      name: "Valid Webhook",
      event: "pre_tool_use",
      handler: { type: "webhook", url: "https://example.test/webhook" },
    },
    sync: false,
  });

  const audit1 = auditHooks({ projectPath });
  const validItem = audit1.hooks.find((h) => h.id === "valid-webhook");
  assert.ok(validItem);
  assert.equal(validItem.target, "https://example.test/webhook");
  assert.ok(validItem.handler);
  assert.equal(validItem.healthy, true);
  assert.equal(validItem.issues.length, 0);

  // Inject a malformed webhook directly to disk to test audit error detection without throwing
  const manifest = loadHookManifest({ projectPath });
  manifest.hooks.push({
    id: "bad-webhook",
    name: "Bad Webhook",
    event: "pre_tool_use",
    enabled: true,
    handler: { type: "webhook", url: "not-a-valid-url" },
  });
  const nodeFs = require("node:fs");
  const manifestPath = path.join(projectPath, ".skills-platform", "hooks", "manifest.json");
  nodeFs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");

  const audit2 = auditHooks({ projectPath });
  assert.equal(audit2.healthy, false);
  assert.ok(audit2.issues.some((i) => i.includes("must be a valid URL") || i.includes("Webhook handler URL is invalid")));
});

test("Reviewer Audit 22: CLI enable and disable with duplicate --skill flags deduplicate cleanly", async (context) => {
  const projectPath = await createTempProject(context);

  registerHook({
    projectPath,
    hook: {
      id: "dup-hook",
      name: "Dup Hook",
      event: "pre_tool_use",
      associated_skill: "dup-skill",
      enabled: true,
      handler: { type: "command", command: "node -v" },
    },
    sync: false,
  });

  const disableRes = await run([
    "hook", "disable",
    "--skill", "dup-skill",
    "--skill", "dup-skill",
    "--project", projectPath,
    "--no-sync",
  ]);

  assert.equal(disableRes.total, 1);
  assert.equal(disableRes.changed, 1);
  assert.equal(disableRes.hooks.length, 1);
});

test("Reviewer Audit 23: applyCatalogActivationPlan automatically discovers and registers companion hooks during plan execution", async (context) => {
  const root = await createTempProject(context);
  const catalogRoot = path.join(root, "catalog");
  const registryRoot = path.join(root, "registry");
  const projectPath = path.join(root, "project");
  const sourceRoot = path.join(root, "source");
  const skillDir = path.join(sourceRoot, "plan-companion-skill");

  await fs.mkdir(catalogRoot, { recursive: true });
  await fs.mkdir(registryRoot, { recursive: true });
  await fs.mkdir(projectPath, { recursive: true });
  await fs.mkdir(path.join(skillDir, "scripts"), { recursive: true });

  await fs.writeFile(
    path.join(skillDir, "SKILL.md"),
    "---\nname: plan-companion-skill\ndescription: Companion for activation plan.\n---\n# Skill\n",
    "utf8"
  );
  await fs.writeFile(
    path.join(skillDir, "scripts", "guard.js"),
    "console.log('ok');\n",
    "utf8"
  );
  await fs.writeFile(
    path.join(skillDir, "hooks.json"),
    JSON.stringify({
      hooks: [
        {
          id: "plan-guard",
          name: "Plan Guard",
          event: "pre_tool_use",
          handler: { type: "script", target: "scripts/guard.js" },
        },
      ],
    }),
    "utf8"
  );

  const { importLocalSource } = require("../src/registry");
  const imported = await importLocalSource({ registryRoot, sourcePath: sourceRoot });
  const targetSkill = imported.skills.find((s) => s.skill_name === "plan-companion-skill");
  assert.ok(targetSkill);

  await createProject({
    catalogRoot,
    id: "proj-activation-test",
    name: "Project Activation Test",
    projectPath,
    providerId: "codex",
  });

  const { createProjectPlan } = require("../src/catalog-workflows");
  const { applyCatalogActivationPlan } = require("../src/activation-policy");
  const { assignPreset, createPreset } = require("../src/catalog-state");

  await createPreset({
    catalogRoot,
    registryRoot,
    id: "preset-companion",
    name: "Preset Companion",
    registrySkillIds: [targetSkill.id],
  });

  await assignPreset({
    catalogRoot,
    projectId: "proj-activation-test",
    presetId: "preset-companion",
    version: 1,
  });

  const plan = await createProjectPlan({
    catalogRoot,
    registryRoot,
    projectId: "proj-activation-test",
    distribution: { method: "symlink" },
  });

  const adapter = require("@skills-platform/skills-manager-adapter");
  const report = await applyCatalogActivationPlan({
    catalogRoot,
    registryRoot,
    projectId: "proj-activation-test",
    plan,
    adapter,
  });

  assert.equal(report.status, "completed");

  // Companion hook should now be discovered and registered!
  const manifest = loadHookManifest({ projectPath });
  const companionHook = manifest.hooks.find((h) => h.id === "plan-guard");
  assert.ok(companionHook, "Companion hook should be automatically registered via activation plan");
  assert.equal(companionHook.associated_skill, "plan-companion-skill");
});



