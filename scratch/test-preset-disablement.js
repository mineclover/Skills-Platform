const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const {
  PRISTINE_PRESET_ID,
  assignPreset,
  createPreset,
  createProject,
  createProjectPlan,
  importLocalSource,
  replaceWorkScopeOverlay,
  buildProjectSystemPrompt,
  resolveProjectSelection,
} = require(path.resolve(__dirname, "../apps/skills-catalog/src"));

async function testPresetDisablement() {
  console.log("===============================================================");
  console.log("🧪 SKILLS PRESET DISABLEMENT & RECOGNITION TEST");
  console.log("===============================================================\n");

  const root = await fs.mkdtemp(path.join(os.tmpdir(), "preset-disable-test-"));
  
  try {
    // 1. Setup Source Skills
    const sourceWriter = path.join(root, "source", "writer");
    const sourceReview = path.join(root, "source", "review");
    const sourceLCH = path.join(root, "source", "lch");
    await fs.mkdir(sourceWriter, { recursive: true });
    await fs.mkdir(sourceReview, { recursive: true });
    await fs.mkdir(sourceLCH, { recursive: true });

    await fs.writeFile(path.join(sourceWriter, "SKILL.md"), "---\nname: writer-skill\ndescription: Writing.\n---\n# Writer\n");
    await fs.writeFile(path.join(sourceReview, "SKILL.md"), "---\nname: reviewer-skill\ndescription: Reviewing.\n---\n# Reviewer\n");
    await fs.writeFile(path.join(sourceLCH, "SKILL.md"), "---\nname: lch-skill\ndescription: LCH Runner.\n---\n# LCH\n");

    const registryRoot = path.join(root, "registry");
    const catalogRoot = path.join(root, "catalog");
    const projectDelivery = path.join(root, "project", ".agents", "skills");

    const imported = await importLocalSource({ registryRoot, sourcePath: path.join(root, "source") });
    console.log(`[Step 1] Imported ${imported.skills.length} skills into registry: ${imported.skills.map(s => s.skill_name).join(", ")}`);

    const writerSkill = imported.skills.find(s => s.skill_name === "writer-skill");
    const reviewerSkill = imported.skills.find(s => s.skill_name === "reviewer-skill");
    const lchSkill = imported.skills.find(s => s.skill_name === "lch-skill");

    // 2. Create Project
    const project = await createProject({
      catalogRoot,
      id: "platform-project",
      name: "Platform Project",
      projectPath: path.join(root, "project"),
      providerId: "codex",
      deliveryRoot: projectDelivery,
    });
    console.log(`[Step 2] Created Project: ${project.id}`);

    // 3. Create Presets
    const defaultPreset = await createPreset({
      catalogRoot,
      registryRoot,
      id: "preset-core",
      name: "Core Preset",
      registrySkillIds: [writerSkill.id, lchSkill.id],
    });

    const overlayPreset = await createPreset({
      catalogRoot,
      registryRoot,
      id: "preset-review",
      name: "Review Overlay Preset",
      registrySkillIds: [reviewerSkill.id],
    });
    console.log(`[Step 3] Created Presets: ${defaultPreset.id} (2 skills), ${overlayPreset.id} (1 skill)`);

    // 4. Assign Default + Overlay (Both Active)
    await assignPreset({ catalogRoot, projectId: project.id, presetId: defaultPreset.id });
    await replaceWorkScopeOverlay({ catalogRoot, projectId: project.id, presetId: overlayPreset.id, workScopeTags: ["qa"] });

    let selection = await resolveProjectSelection({ catalogRoot, projectId: project.id, workScopeTags: ["qa"] });
    let plan = await createProjectPlan({ catalogRoot, registryRoot, projectId: project.id, workScopeTags: ["qa"] });
    let prompt = await buildProjectSystemPrompt({ catalogRoot, registryRoot, projectId: project.id, workScopeTags: ["qa"] });

    console.log("\n--- [Active State] Default + Overlay Enabled ---");
    console.log(`• Mode: ${plan.mode}`);
    console.log(`• Selected Skills Count: ${selection.selected.length} (${selection.selected.map(s => s.registry_skill_id).join(", ")})`);
    console.log(`• Enabled Operations: ${plan.operations.filter(o => o.desired_state === "enabled").length}`);
    console.log(`• Prompt Included Skills: ${prompt.included_skill_ids.length}`);
    assert.equal(selection.selected.length, 3);
    assert.equal(plan.operations.filter(o => o.desired_state === "enabled").length, 3);

    // 5. TEST 1: Disable Overlay Preset (replace with null)
    console.log("\n--- [Test 1] Disabling Review Overlay Preset ---");
    await replaceWorkScopeOverlay({ catalogRoot, projectId: project.id, presetId: null, workScopeTags: ["qa"] });

    selection = await resolveProjectSelection({ catalogRoot, projectId: project.id, workScopeTags: ["qa"] });
    plan = await createProjectPlan({ catalogRoot, registryRoot, projectId: project.id, workScopeTags: ["qa"] });
    prompt = await buildProjectSystemPrompt({ catalogRoot, registryRoot, projectId: project.id, workScopeTags: ["qa"] });

    console.log(`• Overlay Removed.`);
    console.log(`• Active Selected Skills Count: ${selection.selected.length}`);
    console.log(`• Enabled Operations: ${plan.operations.filter(o => o.desired_state === "enabled").length}`);
    console.log(`• Disabled Operations: ${plan.operations.filter(o => o.desired_state === "disabled").length} (Reviewer skill marked disabled)`);
    console.log(`• Prompt Excludes Reviewer: ${!prompt.included_skill_ids.includes(reviewerSkill.id)}`);

    assert.equal(selection.selected.length, 2);
    assert.equal(plan.operations.filter(o => o.desired_state === "enabled").length, 2);
    const disabledOp = plan.operations.find(o => o.registry_skill_id === reviewerSkill.id);
    assert.equal(disabledOp.desired_state, "disabled");
    assert.equal(prompt.included_skill_ids.includes(reviewerSkill.id), false);
    console.log("✅ Test 1 Passed: Overlay preset disablement recognized accurately!");

    // 6. TEST 2: Disable Entire Preset Baseline (Assign Pristine Preset)
    console.log("\n--- [Test 2] Disabling Entire Preset Baseline (Switching to Pristine Baseline) ---");
    await assignPreset({ catalogRoot, projectId: project.id, presetId: PRISTINE_PRESET_ID });

    selection = await resolveProjectSelection({ catalogRoot, projectId: project.id });
    plan = await createProjectPlan({ catalogRoot, registryRoot, projectId: project.id });
    prompt = await buildProjectSystemPrompt({ catalogRoot, registryRoot, projectId: project.id });

    console.log(`• Mode: ${plan.mode}`);
    console.log(`• Active Selected Skills Count: ${selection.selected.length}`);
    console.log(`• Total Operations: ${plan.operations.length}`);
    console.log(`• Disabled Operations Count: ${plan.operations.filter(o => o.desired_state === "disabled").length} (All 3 skills marked disabled)`);
    console.log(`• Prompt Included Skills Count: ${prompt.included_skill_ids.length} (Empty prompt)`);

    assert.equal(plan.mode, "pristine");
    assert.equal(selection.selected.length, 0);
    assert.ok(plan.operations.every(o => o.desired_state === "disabled"));
    assert.equal(prompt.included_skill_ids.length, 0);
    console.log("✅ Test 2 Passed: Pristine full baseline disablement recognized accurately!");

    console.log("\n===============================================================");
    console.log("🎉 ALL PRESET DISABLEMENT & RECOGNITION TESTS PASSED (100%)!");
    console.log("===============================================================");
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

testPresetDisablement().catch(err => {
  console.error("❌ Test Failed:", err);
  process.exit(1);
});
