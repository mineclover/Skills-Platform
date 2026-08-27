const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const {
  listPresets,
  getPreset,
  resolveProjectSelection,
  exportRecipe,
  inspectRecipe
} = require("../src");
const { validateSkillRecipe } = require("../../../packages/skill-contracts/src");

test("MLC Modular Presets & Work-Scope Decompositions", async (t) => {
  const repoRoot = path.resolve(__dirname, "../../..");
  const catalogRoot = path.join(repoRoot, ".skills-platform/catalog");
  const registryRoot = path.join(repoRoot, ".skills-platform/registry");

  await t.test("All 7 MLC modular presets exist with exact expected skill counts", async () => {
    const expected = {
      "condensation-core": 3,
      "baseline-curation-core": 11,
      "mlc-recursive-context": 13,
      "mlc-specialist-domains": 5,
      "mlc-toolchain-plane": 6,
      "mlc-lifecycle-governance": 8,
      "baseline-full-suite": 43,
      "paperthin-reflexes": 28,
      "builtin-pristine": 0,
    };

    for (const [id, count] of Object.entries(expected)) {
      const preset = await getPreset(catalogRoot, id);
      assert.ok(preset, `Preset ${id} should exist`);
      if (id !== "builtin-pristine") {
        assert.equal(
          preset.registry_skill_ids.length,
          count,
          `Preset ${id} should have exactly ${count} skills`
        );
      }
    }
  });

  await t.test("Dynamic work-scope overlays resolve exact composite counts on Antigravity", async () => {
    const scopeExpected = {
      curation: 31,      // 28 + 3
      architecture: 39,  // 28 + 11
      explore: 41,       // 28 + 13
      specialist: 33,    // 28 + 5
      toolchain: 34,     // 28 + 6
      governance: 36,    // 28 + 8
      planning: 28,      // default 28
      implementation: 28,// default 28
      review: 28         // default 28
    };

    for (const [scope, count] of Object.entries(scopeExpected)) {
      const res = await resolveProjectSelection({
        catalogRoot,
        projectId: "skills-platform-antigravity",
        workScopeTags: [scope]
      });
      assert.equal(
        res.selected.length,
        count,
        `Scope ${scope} should resolve exactly ${count} skills`
      );
    }
  });

  await t.test("Modular recipes export valid JSON schemas that pass validation", async () => {
    const modularPresetIds = [
      "condensation-core",
      "baseline-curation-core",
      "mlc-recursive-context",
      "mlc-specialist-domains",
      "mlc-toolchain-plane",
      "mlc-lifecycle-governance",
      "baseline-full-suite"
    ];

    for (const presetId of modularPresetIds) {
      const recipe = await exportRecipe({
        catalogRoot,
        registryRoot,
        presetId,
        name: `Test Recipe for ${presetId}`,
        description: `Automated test recipe export for ${presetId}`
      });

      const validation = validateSkillRecipe(recipe);
      assert.equal(validation.valid, true, `Exported recipe for ${presetId} should be valid`);
      assert.ok(recipe.skills.length > 0, `Recipe for ${presetId} should contain skills`);
      assert.ok(recipe.presets.length > 0, `Recipe for ${presetId} should contain presets`);
    }
  });
});
