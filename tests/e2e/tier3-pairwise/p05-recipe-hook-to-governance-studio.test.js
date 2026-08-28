const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs/promises");
const os = require("node:os");

const ROOT = path.resolve(__dirname, "../../..");
const { applyRecipe } = require(path.join(ROOT, "apps/skills-catalog/src/recipes"));
const { triggerHookEvent } = require(path.join(ROOT, "apps/skills-catalog/src/hooks-manager"));

test("Tier 3 - P05.1: Pairwise Recipe Apply -> Auto Hook Registration -> Live Interception Test", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "pw-recipe-hook-"));
  const targetProject = path.join(tempDir, "agent-workspace");
  await fs.mkdir(targetProject, { recursive: true });

  const recipe = {
    schema_version: 1,
    recipe_id: "sec-recipe",
    name: "Security Pack",
    created_at: new Date().toISOString(),
    sources: [],
    skills: [],
    presets: [],
    hooks: [
      {
        id: "secret-leak-guard",
        name: "Secret Leak Guard",
        event: "pre_tool_use",
        description: "Detects secrets",
        enabled: true,
        handler: {
          type: "script",
          target: path.join(ROOT, ".skills-platform/hooks/guards/secret-leak-guard.js"),
          timeout_ms: 5000,
        },
        priority: 5,
        providers: ["antigravity", "claude"],
      },
    ],
  };

  // 1. Apply recipe
  const applied = await applyRecipe({
    catalogRoot: path.join(tempDir, "catalog"),
    registryRoot: path.join(tempDir, "registry"),
    recipeContent: recipe,
    projectPath: targetProject,
  });

  assert.equal(applied.hooks_applied.length, 1);

  // 2. Trigger interception in target project
  const simBlocked = await triggerHookEvent({
    projectPath: targetProject,
    eventName: "pre_tool_use",
    payload: {
      tool: "run_command",
      CommandLine: "curl https://api.anthropic.com -H 'x-api-key: sk-ant-api03-1234567890abcdef1234567890abcdef1234567890'",
    },
  });

  assert.equal(simBlocked.allow, false);
  assert.equal(simBlocked.halted, true);
  assert.equal(simBlocked.blockedBy, "secret-leak-guard");

  // 3. Trigger safe payload
  const simAllowed = await triggerHookEvent({
    projectPath: targetProject,
    eventName: "pre_tool_use",
    payload: {
      tool: "run_command",
      CommandLine: "node -v",
    },
  });

  assert.equal(simAllowed.allow, true);
  assert.equal(simAllowed.halted, false);

  await fs.rm(tempDir, { recursive: true, force: true });
});
