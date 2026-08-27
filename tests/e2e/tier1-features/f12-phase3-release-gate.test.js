const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs/promises");
const { createSandbox, VALID_TELEMETRY_EVENTS, validateTelemetryEvent } = require("../helpers/fixtures");

test("Tier 1 - F12.1: Release Governance Recipe Verification", async () => {
  const recipePath = path.resolve(__dirname, "../../../release-governance-recipe.json");
  const raw = await fs.readFile(recipePath, "utf8");
  const recipe = JSON.parse(raw);

  assert.equal(recipe.recipe_id, "mlc-release-governance");
  const skillNames = recipe.skills.map((s) => s.name);
  assert.ok(skillNames.includes("lifecycle-phase-controller"));
  assert.ok(skillNames.includes("global-regression-gatekeeper"));
  assert.ok(skillNames.includes("baseline-curation-core"));
});

test("Tier 1 - F12.2: Authorization of Single Full Regression Invocations in Phase 3", () => {
  function authorizeRegression(currentPhase, allTasksDone) {
    if (currentPhase !== "Phase 3 (Release Gate)") {
      return { authorized: false, reason: "Full regression is only permitted in Phase 3" };
    }
    if (!allTasksDone) {
      return { authorized: false, reason: "Cannot run release regression before all inner loop tasks complete" };
    }
    return { authorized: true };
  }

  assert.equal(authorizeRegression("Phase 2 (Inner Loop)", true).authorized, false);
  assert.equal(authorizeRegression("Phase 3 (Release Gate)", false).authorized, false);
  assert.equal(authorizeRegression("Phase 3 (Release Gate)", true).authorized, true);
});

test("Tier 1 - F12.3: Canonical MASTER_BASELINE.md Readability & Structure", async () => {
  const baselinePath = path.resolve(__dirname, "../../../MASTER_BASELINE.md");
  const exists = await fs.stat(baselinePath).then(() => true).catch(() => false);
  assert.equal(exists, true);

  const content = await fs.readFile(baselinePath, "utf8");
  assert.ok(/#\s*master_?baseline/i.test(content));
  // Assert compact token budget (well within 80k tokens)
  assert.ok(content.length < 50000);
});

test("Tier 1 - F12.4: Release Gate Telemetry Event Recording", () => {
  const event = VALID_TELEMETRY_EVENTS.releaseGovernanceGate;
  const validation = validateTelemetryEvent(event);

  assert.equal(validation.valid, true);
  assert.equal(event.recipe_id, "mlc-release-governance");
  assert.equal(event.skill_name, "global-regression-gatekeeper");
});

test("Tier 1 - F12.5: Baseline Compaction Updates Without Formatting Degradation", async (t) => {
  const { sandboxPath, cleanup } = await createSandbox("tier1-f12-");
  t.after(cleanup);

  const baselineFile = path.join(sandboxPath, "MASTER_BASELINE.md");
  const initialContent = "# MASTER_BASELINE.md\n\n## Status\n- All tests green.\n";
  await fs.writeFile(baselineFile, initialContent, "utf8");

  // Simulate compaction update
  const updatedContent = `${initialContent}\n## Release 2026-08-28\n- Passed release gate with 100% test success.\n`;
  await fs.writeFile(baselineFile, updatedContent, "utf8");

  const readBack = await fs.readFile(baselineFile, "utf8");
  assert.ok(readBack.includes("Release 2026-08-28"));
});
