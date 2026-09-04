const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { inspectRecipe } = require("../src");
const { validateSkillRecipe } = require("../../../packages/skill-contracts/src");

const MODULAR_RECIPES = [
  ["condensation-recipe.json", "condensation-core", 3],
  ["baseline-curation-recipe.json", "baseline-curation-core", 11],
  ["mlc-recursive-context-recipe.json", "mlc-recursive-context", 13],
  ["mlc-specialist-domains-recipe.json", "mlc-specialist-domains", 5],
  ["mlc-toolchain-recipe.json", "mlc-toolchain-plane", 6],
  ["mlc-governance-recipe.json", "mlc-lifecycle-governance", 8],
  ["mlc-full-suite-recipe.json", "baseline-full-suite", 43],
];

test("MLC modular recipe fixtures are self-contained and deterministic", async (t) => {
  const repoRoot = path.resolve(__dirname, "../../..");

  await t.test("all seven checked-in modules retain their expected preset membership", () => {
    for (const [fileName, presetId, expectedCount] of MODULAR_RECIPES) {
      const recipe = require(path.join(repoRoot, fileName));
      const preset = recipe.presets.find((item) => item.id === presetId);
      assert.ok(preset, `${fileName} must contain preset ${presetId}`);
      assert.equal(preset.skills.length, expectedCount, `${presetId} membership changed unexpectedly`);
    }
  });

  await t.test("every modular recipe passes the executable shared contract", async () => {
    for (const [fileName] of MODULAR_RECIPES) {
      const recipe = require(path.join(repoRoot, fileName));
      const validation = validateSkillRecipe(recipe);
      assert.equal(validation.valid, true, `${fileName}: ${JSON.stringify(validation.issues)}`);
      const inspected = await inspectRecipe({ recipeContent: recipe });
      assert.equal(inspected.valid, true);
      assert.equal(inspected.summary.skills_count, recipe.skills.length);
      assert.equal(inspected.summary.presets_count, 1);
    }
  });

  await t.test("preset entries resolve to one declared immutable skill identity", () => {
    for (const [fileName] of MODULAR_RECIPES) {
      const recipe = require(path.join(repoRoot, fileName));
      const declaredByName = new Map(recipe.skills.map((skill) => [skill.name, skill]));
      assert.equal(declaredByName.size, recipe.skills.length, `${fileName} contains duplicate skill names`);
      for (const entry of recipe.presets[0].skills) {
        const declared = declaredByName.get(entry.skill_name);
        assert.ok(declared, `${fileName} preset references undeclared skill ${entry.skill_name}`);
        assert.match(declared.content_digest, /^[0-9a-f]{64}$/);
        assert.equal(declared.source_relative_path, entry.source_relative_path);
      }
    }
  });
});
