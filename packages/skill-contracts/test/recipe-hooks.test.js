const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createHookDefinition,
  validateHookDefinition,
  validateHookManifest,
  createSkillRecipe,
  validateSkillRecipe,
} = require("../src");

test("creates and validates a skill recipe with embedded hooks", () => {
  const recipe = createSkillRecipe({
    name: "Recipe with Guards",
    sources: [
      {
        source_id: "src-1",
        type: "local",
        locator: "./registry",
      },
    ],
    skills: [
      {
        name: "test-skill",
        artifact_type: "skill",
        invocation_mode: "model_invoked",
        source_id: "src-1",
        source_relative_path: "test-skill",
        content_digest: "a".repeat(64),
      },
    ],
    presets: [
      {
        id: "preset-1",
        name: "Preset 1",
        version: 1,
        owner: "Platform Team",
        lifecycle: "reviewed",
        skills: [{ skill_name: "test-skill", required: true }],
      },
    ],
    hooks: [
      {
        id: "secret-leak-guard",
        name: "Secret Leak Guard",
        event: "pre_tool_use",
        description: "Detects and blocks API keys",
        enabled: true,
        handler: {
          type: "script",
          target: ".skills-platform/hooks/guards/secret-leak-guard.js",
          timeout_ms: 5000,
        },
        priority: 5,
      },
    ],
  });

  assert.equal(recipe.hooks?.length, 1);
  assert.equal(recipe.presets[0].lifecycle, "reviewed");
  assert.equal(recipe.hooks[0].id, "secret-leak-guard");
  const validation = validateSkillRecipe(recipe);
  assert.equal(validation.valid, true);
});

test("rejects invalid recipe preset governance metadata", () => {
  const recipe = createSkillRecipe({
    name: "Governed recipe",
    sources: [],
    skills: [],
    presets: [],
  });
  recipe.presets = [{
    id: "bad-governance",
    name: "Bad governance",
    version: 1,
    owner: "",
    lifecycle: "active",
    skills: [],
  }];
  const validation = validateSkillRecipe(recipe);
  assert.equal(validation.valid, false);
  assert.ok(validation.issues.some((issue) => issue.field === "presets[0].owner"));
  assert.ok(validation.issues.some((issue) => issue.field === "presets[0].lifecycle"));
});

test("validates portable recipe project declarations and preset references", () => {
  const recipe = createSkillRecipe({
    name: "Project recipe",
    sources: [],
    skills: [],
    presets: [{ id: "default", name: "Default", version: 1, skills: [] }],
    projects: [{
      project_id: "demo",
      project_name: "Demo",
      provider_id: "codex",
      scope: "project",
      default_preset_id: "default",
      default_preset_version: 1,
      delivery_root_relative: ".agents/skills",
    }],
  });
  assert.equal(validateSkillRecipe(recipe).valid, true);

  recipe.projects = [{
    ...recipe.projects[0],
    default_preset_id: "missing",
    delivery_root_relative: "../outside",
  }];
  const validation = validateSkillRecipe(recipe);
  assert.equal(validation.valid, false);
  assert.ok(validation.issues.some((issue) => issue.field === "projects[0].default_preset_id"));
  assert.ok(validation.issues.some((issue) => issue.field === "projects[0].delivery_root_relative"));
});

test("rejects a skill recipe with invalid hook definition", () => {
  const invalidRecipe = {
    schema_version: 1,
    recipe_id: "rec-invalid",
    name: "Invalid Hook Recipe",
    created_at: new Date().toISOString(),
    sources: [],
    skills: [],
    presets: [],
    hooks: [
      {
        id: "bad-hook",
        // missing name, event, enabled, handler
      },
    ],
  };

  const validation = validateSkillRecipe(invalidRecipe);
  assert.equal(validation.valid, false);
  assert.ok(validation.issues.some((i) => i.field.startsWith("hooks[0]")));
});

test("rejects non-array hooks field in skill recipe", () => {
  const invalidRecipe = {
    schema_version: 1,
    recipe_id: "rec-invalid-type",
    name: "Invalid Hooks Type Recipe",
    created_at: new Date().toISOString(),
    sources: [],
    skills: [],
    presets: [],
    hooks: "not-an-array",
  };

  const validation = validateSkillRecipe(invalidRecipe);
  assert.equal(validation.valid, false);
  assert.ok(validation.issues.some((i) => i.field === "hooks"));
});

function validHook(overrides = {}) {
  return {
    id: "validated-hook",
    name: "Validated Hook",
    event: "pre_tool_use",
    enabled: true,
    matcher: "run_command|view_file",
    handler: { type: "command", command: "node -v", timeout_ms: 5000 },
    priority: 10,
    providers: ["antigravity", "claude", "codex"],
    failure_policy: "open",
    ...overrides,
  };
}

test("validates handler-specific required fields and webhook URLs", () => {
  const invalidHandlers = [
    [{ type: "command" }, "handler.command"],
    [{ type: "script" }, "handler.target"],
    [{ type: "module" }, "handler.target"],
    [{ type: "webhook", url: "file:///tmp/hook" }, "handler.url"],
  ];

  for (const [handler, expectedField] of invalidHandlers) {
    const validation = validateHookDefinition(validHook({ handler }));
    assert.equal(validation.valid, false);
    assert.ok(validation.issues.some((issue) => issue.field === expectedField));
  }

  assert.equal(
    validateHookDefinition(validHook({ handler: { type: "webhook", url: "https://example.test/hook" } })).valid,
    true,
  );
});

test("rejects unsafe hook ids and invalid priority, timeout, providers, matcher, and failure policy", () => {
  const invalidCases = [
    [validHook({ id: "bad hook" }), "id"],
    [validHook({ priority: -1 }), "priority"],
    [validHook({ handler: { type: "command", command: "node -v", timeout_ms: 0 } }), "handler.timeout_ms"],
    [validHook({ providers: ["unknown"] }), "providers[0]"],
    [validHook({ providers: ["codex", "codex"] }), "providers[1]"],
    [validHook({ matcher: "[" }), "matcher"],
    [validHook({ failure_policy: "sometimes" }), "failure_policy"],
    [validHook({ handler: { type: "command", command: "node -v", env: { "BAD-KEY": "value" } } }), "handler.env.BAD-KEY"],
  ];

  for (const [hook, expectedField] of invalidCases) {
    const validation = validateHookDefinition(hook);
    assert.equal(validation.valid, false, `Expected ${expectedField} to be rejected`);
    assert.ok(validation.issues.some((issue) => issue.field === expectedField));
  }
});

test("normalizes backwards-compatible hook defaults and rejects duplicate manifest ids", () => {
  const normalized = createHookDefinition({
    id: "defaulted-hook",
    name: "Defaulted Hook",
    event: "post_tool_use",
    handler: { type: "script", target: "hook.js" },
  });
  assert.equal(normalized.enabled, true);
  assert.equal(normalized.priority, 100);
  assert.equal(normalized.handler.timeout_ms, 5000);
  assert.equal(normalized.failure_policy, "open");
  assert.deepEqual(normalized.providers, ["antigravity", "claude", "codex"]);

  const duplicate = validHook();
  const validation = validateHookManifest({
    schema_version: 1,
    updated_at: new Date().toISOString(),
    hooks: [duplicate, { ...duplicate }],
  });
  assert.equal(validation.valid, false);
  assert.ok(validation.issues.some((issue) => issue.field === "hooks[1].id"));
});

test("hook factory does not coerce invalid desired-state values into enabled hooks", () => {
  assert.throws(
    () => createHookDefinition({
      id: "invalid-enabled",
      name: "Invalid Enabled",
      event: "pre_tool_use",
      enabled: "false",
      handler: { type: "command", command: "node -v" },
    }),
    (error) => error.issues.some((issue) => issue.field === "enabled"),
  );
});
