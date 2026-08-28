const test = require("node:test");
const assert = require("node:assert/strict");
const { createSkillRecipe, validateSkillRecipe } = require("../src");

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
  assert.equal(recipe.hooks[0].id, "secret-leak-guard");
  const validation = validateSkillRecipe(recipe);
  assert.equal(validation.valid, true);
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
