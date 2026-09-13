const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const fsSync = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawn, execSync } = require("node:child_process");

const {
  DEFAULT_HOOKS,
  loadHookManifest,
  saveHookManifest,
  registerHook,
  listHooks,
  listHooksBySkill,
  discoverCompanionHooks,
  compileProviderConfigs,
} = require("../src/hooks-manager");
const { createProject, saveCatalog } = require("../src/catalog-state");
const { linkProjectSkill, unlinkProjectSkill, resolveSkillPackageSource } = require("../src/catalog-workflows");
const { applyRecipe, inspectRecipe } = require("../src/recipes");
const { digestDirectory } = require("@skills-platform/contracts");

const REPO_ROOT = path.resolve(__dirname, "../../..");
const SP_HOOKS_BIN = path.resolve(REPO_ROOT, "bin/sp-hooks");

async function createTempProject(context) {
  const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), "decoupled-hooks-test-"));
  context.after(() => fs.rm(projectPath, { recursive: true, force: true }));
  return projectPath;
}

test("AC1 Package Co-location & SSOT: scoped-tdd-executor defines test-storm-guard companion hook", async () => {
  const pkgPath = path.join(REPO_ROOT, "skills-packages", "platform-core", "scoped-tdd-executor");
  assert.ok(fsSync.existsSync(pkgPath), "scoped-tdd-executor package directory must exist");

  // Check hooks.json
  const hooksJsonPath = path.join(pkgPath, "hooks.json");
  assert.ok(fsSync.existsSync(hooksJsonPath), "hooks.json must exist in scoped-tdd-executor");
  const hooksData = JSON.parse(await fs.readFile(hooksJsonPath, "utf8"));
  assert.ok(Array.isArray(hooksData.hooks), "hooks.json must declare hooks array");
  const testStormHook = hooksData.hooks.find((h) => h.id === "test-storm-guard");
  assert.ok(testStormHook, "test-storm-guard must be defined in hooks.json");
  assert.equal(testStormHook.event, "on_test_run");
  assert.equal(testStormHook.metadata?.associated_skill, "scoped-tdd-executor");

  // Check handler script
  const scriptPath = path.join(pkgPath, "scripts", "test-storm-guard.js");
  assert.ok(fsSync.existsSync(scriptPath), "scripts/test-storm-guard.js must exist");
  const st = await fs.stat(scriptPath);
  if (process.platform !== "win32") {
    assert.ok((st.mode & 0o111) !== 0, "test-storm-guard.js must be executable");
  }

  // Check SKILL.md metadata
  const skillMdPath = path.join(pkgPath, "SKILL.md");
  assert.ok(fsSync.existsSync(skillMdPath), "SKILL.md must exist in scoped-tdd-executor");
  const skillMdContent = await fs.readFile(skillMdPath, "utf8");
  assert.match(skillMdContent, /name:\s*scoped-tdd-executor/);
  assert.match(skillMdContent, /test-storm-guard/);
});

test("AC1 Package Co-location & SSOT: vertical topic/context package defines scope-boundary-enforcer companion hook", async () => {
  const vSpecPkg = path.join(REPO_ROOT, "skills-packages", "platform-core", "vertical-spec-documenter");
  assert.ok(fsSync.existsSync(vSpecPkg), "vertical-spec-documenter package directory must exist");

  // Check hooks.json
  const vSpecHooksJson = path.join(vSpecPkg, "hooks.json");
  assert.ok(fsSync.existsSync(vSpecHooksJson), "hooks.json must exist in vertical-spec-documenter");
  const vSpecHooks = JSON.parse(await fs.readFile(vSpecHooksJson, "utf8"));
  const enforcerHook = vSpecHooks.hooks?.find((h) => h.id === "scope-boundary-enforcer");
  assert.ok(enforcerHook, "scope-boundary-enforcer must be defined in vertical-spec-documenter hooks.json");
  assert.equal(enforcerHook.event, "post_tool_use");

  // Check handler script
  const vSpecScript = path.join(vSpecPkg, "scripts", "scope-boundary-enforcer.js");
  assert.ok(fsSync.existsSync(vSpecScript), "scripts/scope-boundary-enforcer.js must exist");

  // Check vertical-context-extractor package
  const vContextPkg = path.join(REPO_ROOT, "skills-packages", "platform-core", "vertical-context-extractor");
  assert.ok(fsSync.existsSync(vContextPkg), "vertical-context-extractor package directory must exist");
  assert.ok(fsSync.existsSync(path.join(vContextPkg, "hooks.json")));
  assert.ok(fsSync.existsSync(path.join(vContextPkg, "scripts", "scope-boundary-enforcer.js")));
});

test("AC1 Package Co-location & SSOT: Global DEFAULT_HOOKS no longer contains hard-coded test suppression guards", () => {
  const testStormFound = DEFAULT_HOOKS.find((h) => h.id === "test-storm-guard");
  assert.equal(testStormFound, undefined, "DEFAULT_HOOKS must not contain hard-coded test-storm-guard");

  // Verify baseline retains universal security baselines
  const expectedUniversalIds = [
    "secret-leak-guard",
    "destructive-command-blocker",
    "context-budget-guard",
    "subagent-recursion-limiter",
    "telemetry-collector",
    "session-stop-flush",
  ];
  for (const expId of expectedUniversalIds) {
    assert.ok(DEFAULT_HOOKS.some((h) => h.id === expId), `Universal guard ${expId} must remain in DEFAULT_HOOKS`);
  }
});

test("AC2 Dynamic Activation: Freshly initialized project starts with lean universal baseline", async (context) => {
  const projectPath = await createTempProject(context);

  // Initialize fresh project manifest
  const manifest = loadHookManifest({ projectPath });
  assert.ok(manifest.hooks.length > 0);
  assert.equal(
    manifest.hooks.some((h) => h.id === "test-storm-guard"),
    false,
    "Freshly initialized project must NOT contain test-storm-guard"
  );
});

test("AC2 Dynamic Activation: Linking scoped-tdd-executor automatically registers and compiles test-storm-guard", async (context) => {
  const projectPath = await createTempProject(context);
  const catalogRoot = path.join(projectPath, ".skills-platform", "catalog");
  await fs.mkdir(catalogRoot, { recursive: true });

  const catalog = {
    schema_version: 1,
    projects: [
      {
        id: "test-tdd-proj",
        name: "Test TDD Project",
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
    projectId: "test-tdd-proj",
    skillName: "scoped-tdd-executor",
  });

  assert.equal(linkResult.linked, true);
  assert.ok(Array.isArray(linkResult.companion_hooks));
  const companion = linkResult.companion_hooks.find((h) => h.id === "test-storm-guard");
  assert.ok(companion, "linkResult must include test-storm-guard companion hook");
  assert.equal(companion.associated_skill, "scoped-tdd-executor");

  // Verify hook is registered in project manifest
  const manifest = loadHookManifest({ projectPath });
  const registered = manifest.hooks.find((h) => h.id === "test-storm-guard");
  assert.ok(registered, "test-storm-guard must be stored in project manifest");
  assert.equal(registered.associated_skill, "scoped-tdd-executor");
  assert.equal(registered.metadata?.companion, true);

  // Verify compiled provider config includes it
  const agentsHooksPath = path.join(projectPath, ".agents", "hooks.json");
  assert.ok(fsSync.existsSync(agentsHooksPath), ".agents/hooks.json must be compiled");
  const agentsConfig = JSON.parse(await fs.readFile(agentsHooksPath, "utf8"));
  assert.ok(agentsConfig["test-storm-guard"], "Compiled config must include test-storm-guard");
});

test("AC2 Dynamic Activation: Applying scoped-inner-loop-recipe.json activates all required guards", async (context) => {
  const projectPath = await createTempProject(context);
  const catalogRoot = path.join(projectPath, ".skills-platform", "catalog");
  const registryRoot = path.join(projectPath, ".skills-platform", "registry");
  await fs.mkdir(catalogRoot, { recursive: true });
  await fs.mkdir(registryRoot, { recursive: true });

  const { mountLifecycleRecipe } = require("../src/lifecycle-loop");
  const mount = await mountLifecycleRecipe("scoped-inner-loop", {
    projectPath,
    providerId: "codex",
    catalogRoot,
    registryRoot,
    confirm: true,
  });

  assert.equal(mount.recipe_id, "mlc-scoped-inner-loop");

  // Manifest in project should have received hooks
  const manifest = loadHookManifest({ projectPath });
  const hookIds = manifest.hooks.map((h) => h.id);

  assert.ok(hookIds.includes("secret-leak-guard"), "secret-leak-guard must be active");
  assert.ok(hookIds.includes("scope-boundary-enforcer"), "scope-boundary-enforcer must be active");
  assert.ok(hookIds.includes("test-storm-guard"), "test-storm-guard companion hook must be active");

  const testStormHook = manifest.hooks.find((h) => h.id === "test-storm-guard");
  assert.equal(testStormHook.associated_skill, "scoped-tdd-executor");
});

test("AC2 Dynamic Activation: sp-hooks list --by-skill categorizes migrated hooks under owning skill headers", async (context) => {
  const projectPath = await createTempProject(context);

  // Register companion hooks
  registerHook({
    projectPath,
    hook: {
      id: "test-storm-guard",
      name: "Test Storm Suppression Guard",
      event: "on_test_run",
      associated_skill: "scoped-tdd-executor",
      handler: { type: "command", command: "echo test" },
    },
    sync: false,
  });

  registerHook({
    projectPath,
    hook: {
      id: "scope-boundary-enforcer",
      name: "Scope Boundary Enforcer",
      event: "post_tool_use",
      associated_skill: "vertical-spec-documenter",
      handler: { type: "command", command: "echo scope" },
    },
    sync: false,
  });

  const grouped = listHooksBySkill({ projectPath });
  assert.ok(grouped.by_skill["scoped-tdd-executor"]);
  assert.equal(grouped.by_skill["scoped-tdd-executor"][0].id, "test-storm-guard");

  assert.ok(grouped.by_skill["vertical-spec-documenter"]);
  assert.equal(grouped.by_skill["vertical-spec-documenter"][0].id, "scope-boundary-enforcer");

  // Run subprocess CLI: bin/sp-hooks list --by-skill --json
  const stdout = execSync(
    `node "${SP_HOOKS_BIN}" list --by-skill --json --project "${projectPath}"`,
    { encoding: "utf8" }
  );
  const parsed = JSON.parse(stdout.trim());
  assert.ok(parsed.by_skill["scoped-tdd-executor"]);
  assert.equal(parsed.by_skill["scoped-tdd-executor"][0].id, "test-storm-guard");
  assert.ok(parsed.by_skill["vertical-spec-documenter"]);
  assert.equal(parsed.by_skill["vertical-spec-documenter"][0].id, "scope-boundary-enforcer");
});

test("Handler Functionality: test-storm-guard script blocks un-scoped full regression suite runs", () => {
  const guardPath = path.join(
    REPO_ROOT,
    "skills-packages",
    "platform-core",
    "scoped-tdd-executor",
    "scripts",
    "test-storm-guard.js"
  );

  // Test 1: Un-scoped npm test is blocked
  const blockedPayload = JSON.stringify({ CommandLine: "npm test" });
  const stdoutBlocked = execSync(`node "${guardPath}"`, {
    input: blockedPayload,
    encoding: "utf8",
    env: { ...process.env, HOOK_EVENT: "on_test_run" },
  });
  const parsedBlocked = JSON.parse(stdoutBlocked.trim());
  assert.equal(parsedBlocked.allow, false);
  assert.match(parsedBlocked.reason, /Test storm suppressed/i);
  assert.equal(parsedBlocked.violation_type, "test_storm_suppression");

  // Test 2: Un-scoped pytest is blocked
  const pytestPayload = JSON.stringify({ command: "pytest" });
  const stdoutPytest = execSync(`node "${guardPath}"`, {
    input: pytestPayload,
    encoding: "utf8",
    env: { ...process.env, HOOK_EVENT: "on_test_run" },
  });
  const parsedPytest = JSON.parse(stdoutPytest.trim());
  assert.equal(parsedPytest.allow, false);

  // Test 3: Pinpoint scoped test is allowed
  const allowedPayload = JSON.stringify({ command: "node --test apps/skills-catalog/test/guards.test.js" });
  const stdoutAllowed = execSync(`node "${guardPath}"`, {
    input: allowedPayload,
    encoding: "utf8",
    env: { ...process.env, HOOK_EVENT: "on_test_run" },
  });
  const parsedAllowed = JSON.parse(stdoutAllowed.trim());
  assert.equal(parsedAllowed.allow, true);
  assert.match(parsedAllowed.message, /Scoped test execution verified/);
});

test("AC2 Dynamic Activation: Applying paperthin-reflexes-recipe.json activates all required guards", async (context) => {
  const projectPath = await createTempProject(context);
  const catalogRoot = path.join(projectPath, ".skills-platform", "catalog");
  const registryRoot = path.join(projectPath, ".skills-platform", "registry");
  await fs.mkdir(catalogRoot, { recursive: true });
  await fs.mkdir(registryRoot, { recursive: true });

  const paperthinPath = path.join(REPO_ROOT, "paperthin-reflexes-recipe.json");
  const inspection = await inspectRecipe({ recipePath: paperthinPath });
  assert.equal(inspection.valid, true, "paperthin-reflexes-recipe.json must pass inspection");

  const applyResult = await applyRecipe({
    catalogRoot,
    registryRoot,
    recipePath: paperthinPath,
    projectPath,
    providerId: "codex",
    confirm: true,
  });

  assert.ok(applyResult);
  assert.ok(applyResult.hooks_applied.length > 0);

  const manifest = loadHookManifest({ projectPath });
  const hookIds = manifest.hooks.map((h) => h.id);
  assert.ok(hookIds.includes("secret-leak-guard"), "secret-leak-guard must be active");
  assert.ok(hookIds.includes("scope-boundary-enforcer"), "scope-boundary-enforcer companion hook must be active");

  const enforcerHook = manifest.hooks.find((h) => h.id === "scope-boundary-enforcer");
  assert.equal(enforcerHook.associated_skill, "vertical-spec-documenter");
});

test("Edge Case: Dynamic recipe activation with non-standard delivery roots rebases hook targets correctly", async (context) => {
  const projectPath = await createTempProject(context);
  const catalogRoot = path.join(projectPath, ".skills-platform", "catalog");
  const registryRoot = path.join(projectPath, ".skills-platform", "registry");
  await fs.mkdir(catalogRoot, { recursive: true });
  await fs.mkdir(registryRoot, { recursive: true });

  const customDeliveryRelative = ".agent/skills";
  const customDeliveryRoot = path.join(projectPath, customDeliveryRelative);

  const customRecipe = {
    schema_version: 1,
    recipe_id: "custom-delivery-root-recipe",
    name: "Custom Delivery Root Recipe",
    description: "Recipe with custom delivery root",
    created_at: new Date().toISOString(),
    sources: [
      {
        source_id: "src-local",
        type: "local",
        locator: path.join(REPO_ROOT, "skills-packages"),
      },
    ],
    skills: [
      {
        name: "scoped-tdd-executor",
        artifact_type: "skill",
        invocation_mode: "model_invoked",
        source_id: "src-local",
        source_relative_path: "platform-core/scoped-tdd-executor",
        content_digest: await digestDirectory(path.join(REPO_ROOT, "skills-packages", "platform-core", "scoped-tdd-executor")),
      },
    ],
    presets: [
      {
        id: "custom-preset",
        name: "Custom Preset",
        version: 1,
        skills: [{ skill_name: "scoped-tdd-executor" }],
      },
    ],
    projects: [
      {
        project_id: "custom-proj",
        project_name: "Custom Project",
        provider_id: "antigravity",
        scope: "project",
        default_preset_id: "custom-preset",
        delivery_root_relative: customDeliveryRelative,
      },
    ],
  };

  const applyResult = await applyRecipe({
    catalogRoot,
    registryRoot,
    recipeContent: JSON.stringify(customRecipe),
    projectPath,
    providerId: "antigravity",
    confirm: true,
  });

  assert.ok(applyResult);

  const manifest = loadHookManifest({ projectPath });
  const testStormHook = manifest.hooks.find((h) => h.id === "test-storm-guard");
  assert.ok(testStormHook, "test-storm-guard must be registered in manifest");
  assert.equal(testStormHook.associated_skill, "scoped-tdd-executor");
  assert.ok(
    testStormHook.handler.target.startsWith(".agent/skills/scoped-tdd-executor"),
    `Handler target must point inside custom delivery root, got: ${testStormHook.handler.target}`
  );
});

test("Edge Case: unlinkProjectSkill cascades to disabling companion hooks and updating provider configs", async (context) => {
  const projectPath = await createTempProject(context);
  const catalogRoot = path.join(projectPath, ".skills-platform", "catalog");
  await fs.mkdir(catalogRoot, { recursive: true });

  const catalog = {
    schema_version: 1,
    projects: [
      {
        id: "unlink-test-proj",
        name: "Unlink Test Project",
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

  // Link skill
  const linkResult = await linkProjectSkill({
    catalogRoot,
    projectId: "unlink-test-proj",
    skillName: "scoped-tdd-executor",
  });
  assert.equal(linkResult.linked, true);

  let manifest = loadHookManifest({ projectPath });
  let hook = manifest.hooks.find((h) => h.id === "test-storm-guard");
  assert.ok(hook);
  assert.equal(hook.enabled, true);

  // Unlink skill
  const unlinkResult = await unlinkProjectSkill({
    catalogRoot,
    projectId: "unlink-test-proj",
    skillName: "scoped-tdd-executor",
  });
  assert.equal(unlinkResult.unlinked, true);
  assert.ok(unlinkResult.hooks_disabled > 0);

  manifest = loadHookManifest({ projectPath });
  hook = manifest.hooks.find((h) => h.id === "test-storm-guard");
  assert.ok(hook);
  assert.equal(hook.enabled, false, "Companion hook must be disabled when skill is unlinked");

  const agentsHooksPath = path.join(projectPath, ".agents", "hooks.json");
  const agentsConfig = JSON.parse(await fs.readFile(agentsHooksPath, "utf8"));
  assert.equal(agentsConfig["test-storm-guard"], undefined, "Disabled companion hook must not be in compiled provider config");
});

test("Handler Robustness: test-storm-guard script blocks runner flags without targets while permitting scoped runs", () => {
  const guardPath = path.join(
    REPO_ROOT,
    "skills-packages",
    "platform-core",
    "scoped-tdd-executor",
    "scripts",
    "test-storm-guard.js"
  );

  const blockedCommands = [
    "pytest -v",
    "pytest -s",
    "pytest tests/",
    "cargo test --all",
    "cargo test --workspace -- --nocapture",
    "node --test --test-reporter=tap",
    "node --import tsx --test",
    "node -r tsx/register --test",
    "node --loader ts-node/esm --test",
    "python -m unittest",
    "python -m unittest discover",
    "python3 -m unittest",
    "python3 -m unittest discover",
    "python3.11 -m unittest",
    "python3 -m pytest",
    "py -m unittest",
    "go test ./...",
    "go test .",
    "npm run test:unit",
    "npm test --workspace @skills-platform/contracts",
    "npm test && true",
    "git status && npm test",
    "npm run build && npm test",
    "npm test; echo done",
    "npm test || true",
    "npm test | cat",
    "npm test -- .",
    "npm test -- test/",
    "npm test -- tests/",
    "npm test -- test",
    "npm test -- tests",
    "npm test -- *",
    "pnpm test -- .",
    "yarn test -- test/",
    "bun test -- tests/",
    "sh -c \"npm test\"",
    "bash -c \"npm test\"",
    "deno test",
    "deno test --allow-all",
    "deno test .",
    "CI=1 npm test",
    "NODE_ENV=test npm test",
    "npx vitest run",
    "jest --watchAll=false",
  ];

  for (const cmd of blockedCommands) {
    const stdout = execSync(`node "${guardPath}"`, {
      input: JSON.stringify({ command: cmd }),
      encoding: "utf8",
      env: { ...process.env, HOOK_EVENT: "on_test_run" },
    });
    const parsed = JSON.parse(stdout.trim());
    assert.equal(parsed.allow, false, `Command '${cmd}' must be blocked as un-scoped test storm`);
  }

  // Verify array-shaped command arguments in tool inputs are blocked
  const arrayPayloads = [
    { args: ["npm", "test"] },
    { tool_input: { args: ["npm", "test"] } },
    { toolInput: { command: ["pytest"] } },
    { input: { args: ["node", "--test"] } },
  ];
  for (const payload of arrayPayloads) {
    const stdout = execSync(`node "${guardPath}"`, {
      input: JSON.stringify(payload),
      encoding: "utf8",
      env: { ...process.env, HOOK_EVENT: "on_test_run" },
    });
    const parsed = JSON.parse(stdout.trim());
    assert.equal(parsed.allow, false, `Array payload ${JSON.stringify(payload)} must be blocked`);
  }

  const allowedCommands = [
    "pytest tests/test_login.py",
    "pytest tests/test_auth.py::test_login",
    "python3 -m pytest tests/test_login.py",
    "cargo test test_auth",
    "node --test tests/e2e/test_example.test.js",
    "node --import tsx --test src/Button.test.ts",
    "python -m unittest tests/test_login.py",
    "python3 -m unittest tests/test_login.py",
    "go test -run TestAuth",
    "npx vitest run src/components/Button.test.tsx",
    "npm test -- test/guards.test.js",
    "npm run test:unit -- test/guards.test.js",
    "npm test --workspace @skills-platform/contracts -- test/foo.test.js",
    "sh -c \"npm test -- test/guards.test.js\"",
    "CI=1 npm test -- test/guards.test.js",
    "deno test tests/auth_test.ts",
    "deno test --filter auth",
  ];

  for (const cmd of allowedCommands) {
    const stdout = execSync(`node "${guardPath}"`, {
      input: JSON.stringify({ command: cmd }),
      encoding: "utf8",
      env: { ...process.env, HOOK_EVENT: "on_test_run" },
    });
    const parsed = JSON.parse(stdout.trim());
    assert.equal(parsed.allow, true, `Command '${cmd}' must be allowed as pinpoint scoped test`);
  }
});
