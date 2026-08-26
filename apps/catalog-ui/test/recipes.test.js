import test from "node:test";
import assert from "node:assert/strict";
import { validateSkillRecipe } from "@skills-platform/contracts";

test("Recipe Schema: validateSkillRecipe verifies valid portable recipe", () => {
  const validRecipe = {
    schema_version: 1,
    recipe_id: "recipe_test_123",
    name: "AI Engineer Toolchain",
    description: "Standard developer bundle",
    created_at: new Date().toISOString(),
    created_by: "catalog-test",
    sources: [
      {
        source_id: "std-skills",
        type: "git",
        locator: "https://github.com/skills-platform/std.git",
        ref: "main",
      },
    ],
    skills: [
      {
        name: "planning",
        artifact_type: "skill",
        invocation_mode: "model_invoked",
        source_id: "std-skills",
        source_relative_path: "skills/planning",
        content_digest: "sha256:4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b",
        description: "Autonomous reasoning routine",
      },
      {
        name: "testing",
        artifact_type: "skill",
        invocation_mode: "user_invoked",
        source_id: "std-skills",
        source_relative_path: "skills/testing",
        content_digest: "sha256:5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c",
        description: "Human command testing",
      },
      {
        name: "code-review",
        artifact_type: "skill",
        invocation_mode: "hybrid",
        source_id: "std-skills",
        source_relative_path: "skills/code-review",
        content_digest: "sha256:6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d",
        description: "Autonomous and interactive review",
      },
    ],
    presets: [
      {
        id: "build-v2",
        name: "Build v2",
        version: 2,
        skills: [
          { skill_name: "planning", artifact_type: "skill", required: true },
          { skill_name: "testing", artifact_type: "skill", required: false },
          { skill_name: "code-review", artifact_type: "skill", required: true },
        ],
      },
    ],
    projects: [
      {
        project_id: "acme-web",
        project_name: "Acme Web",
        provider_id: "antigravity",
        scope: "project",
        default_preset_id: "build-v2",
        default_preset_version: 2,
      },
    ],
  };

  const result = validateSkillRecipe(validRecipe);
  assert.equal(result.valid, true);
  assert.equal(result.issues.length, 0);
});

test("Recipe Schema: validateSkillRecipe rejects recipe with missing required fields or invalid types", () => {
  const invalidRecipe = {
    schema_version: 2, // invalid version
    recipe_id: "",
    name: "",
    sources: "not an array",
    skills: [
      {
        name: "invalid_invoker_skill",
        source_id: "src",
        source_relative_path: "path",
        content_digest: "digest",
        invocation_mode: "unknown_mode",
      },
    ],
    presets: [],
  };

  const result = validateSkillRecipe(invalidRecipe);
  assert.equal(result.valid, false);
  assert.ok(result.issues.some((i) => i.field === "schema_version"));
  assert.ok(result.issues.some((i) => i.field === "recipe_id"));
  assert.ok(result.issues.some((i) => i.field === "name"));
  assert.ok(result.issues.some((i) => i.field === "sources"));
  assert.ok(result.issues.some((i) => i.field === "skills[0].invocation_mode"));
});

test("Recipe Telemetry: Invocation mode breakdown calculations match expected counts", () => {
  const skills = [
    { name: "s1", invocation_mode: "model_invoked" },
    { name: "s2", invocation_mode: "model_invoked" },
    { name: "s3", invocation_mode: "user_invoked" },
    { name: "s4", invocation_mode: "hybrid" },
    { name: "s5", invocation_mode: "unspecified" },
    { name: "s6" }, // missing mode fallback
  ];

  const byInvocationMode = { user_invoked: 0, model_invoked: 0, hybrid: 0, unspecified: 0 };
  for (const skill of skills) {
    const mode = skill.invocation_mode || "unspecified";
    if (mode in byInvocationMode) {
      byInvocationMode[mode]++;
    } else {
      byInvocationMode.unspecified++;
    }
  }

  assert.equal(byInvocationMode.model_invoked, 2);
  assert.equal(byInvocationMode.user_invoked, 1);
  assert.equal(byInvocationMode.hybrid, 1);
  assert.equal(byInvocationMode.unspecified, 2);
});

test("Recipe Transfer: Provider delivery roots map accurately to specifications", () => {
  const projectPath = "/workspace/demo-app";

  const getDeliveryRoot = (provider, root) => {
    switch (provider) {
      case "antigravity":
      case "agy":
      case "gemini":
        return `${root}/.agents/skills/`;
      case "claude":
        return `${root}/.claude/skills/`;
      case "codex":
      default:
        return `${root}/skills/`;
    }
  };

  assert.equal(getDeliveryRoot("antigravity", projectPath), "/workspace/demo-app/.agents/skills/");
  assert.equal(getDeliveryRoot("codex", projectPath), "/workspace/demo-app/skills/");
  assert.equal(getDeliveryRoot("claude", projectPath), "/workspace/demo-app/.claude/skills/");
});
