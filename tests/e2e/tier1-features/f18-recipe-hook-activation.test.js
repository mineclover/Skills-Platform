const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs/promises");
const os = require("node:os");

const ROOT = path.resolve(__dirname, "../../..");
const { applyRecipe, inspectRecipe } = require(path.join(
  ROOT,
  "apps/skills-catalog/src/recipes"
));

test("Tier 1 - F18.1: applyRecipe registers embedded hooks and synchronizes multi-provider configs", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "recipe-act-e2e-"));
  const targetProject = path.join(tempDir, "proj");
  await fs.mkdir(targetProject, { recursive: true });

  const recipe = {
    schema_version: 1,
    recipe_id: "e2e-recipe",
    name: "E2E Activation Recipe",
    created_at: new Date().toISOString(),
    sources: [],
    skills: [],
    presets: [],
    hooks: [
      {
        id: "destructive-command-blocker",
        name: "Destructive Command Blocker",
        event: "pre_tool_use",
        description: "Blocks destructive commands",
        enabled: true,
        matcher: "run_command",
        handler: {
          type: "script",
          target: ".skills-platform/hooks/guards/destructive-command-blocker.js",
          timeout_ms: 5000,
        },
        priority: 10,
        providers: ["antigravity", "claude"],
      },
    ],
  };

  const applied = await applyRecipe({
    catalogRoot: path.join(tempDir, "cat"),
    registryRoot: path.join(tempDir, "reg"),
    recipeContent: recipe,
    projectPath: targetProject,
  });

  assert.equal(applied.name, "E2E Activation Recipe");
  assert.equal(applied.hooks_applied.length, 1);
  assert.ok(applied.hooks_synced.antigravityHooks > 0);
  assert.ok(applied.hooks_synced.claudeHooks > 0);

  // Check generated provider files
  const agyFile = path.join(targetProject, ".agents/hooks.json");
  const claudeFile = path.join(targetProject, ".claude/hooks.json");

  const agyContent = JSON.parse(await fs.readFile(agyFile, "utf8"));
  assert.ok(agyContent["destructive-command-blocker"]);

  const claudeContent = JSON.parse(await fs.readFile(claudeFile, "utf8"));
  assert.ok(claudeContent.hooks.some((h) => h.id === "destructive-command-blocker"));

  await fs.rm(tempDir, { recursive: true, force: true });
});
