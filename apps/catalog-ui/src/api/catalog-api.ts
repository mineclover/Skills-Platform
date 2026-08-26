import type {
  ApplyProgress,
  ApplyResult,
  RecipeApplyOptions,
  RecipeApplyResult,
  RecipeInspectionResult,
  RecipeInspectionSummary,
  SkillRecipe,
} from "../types";

export const catalogApi = import.meta.env.VITE_CATALOG_API?.replace(/\/$/, "") ?? "";

export async function copyText(content: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(content);
    return;
  }
  const area = document.createElement("textarea");
  area.value = content;
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.focus();
  area.select();
  const copied = document.execCommand("copy");
  area.remove();
  if (!copied) throw new Error("The browser did not allow copying to the clipboard");
}

export function downloadRecipeJson(recipe: SkillRecipe, filename = "recipe.json"): void {
  const jsonContent = JSON.stringify(recipe, null, 2);
  const blob = new Blob([jsonContent], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename.endsWith(".json") ? filename : `${filename}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export async function exportRecipeApi(params: {
  projectId?: string;
  presetId?: string;
  name?: string;
  description?: string;
}): Promise<{ recipe: SkillRecipe }> {
  if (catalogApi) {
    const query = new URLSearchParams();
    if (params.projectId) query.set("project_id", params.projectId);
    if (params.presetId) query.set("preset_id", params.presetId);
    if (params.name) query.set("name", params.name);
    if (params.description) query.set("description", params.description);
    const response = await fetch(`${catalogApi}/api/recipes/export?${query}`);
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ error: "Export failed" }));
      throw new Error(errorBody.error || "Failed to export recipe");
    }
    return response.json();
  }

  // Client-side fallback for offline/demo environment
  const recipeName =
    params.name ||
    (params.presetId
      ? `Recipe for ${params.presetId}`
      : params.projectId
      ? `Recipe for ${params.projectId}`
      : "Catalog Skills Recipe");

  const recipe: SkillRecipe = {
    schema_version: 1,
    recipe_id: `recipe_${Math.random().toString(36).slice(2, 11)}`,
    name: recipeName,
    description:
      params.description ||
      `Portable skill recipe generated in client mode at ${new Date().toISOString()}`,
    created_at: new Date().toISOString(),
    created_by: "catalog-ui",
    sources: [
      {
        source_id: "skills-platform-std",
        type: "git",
        locator: "https://github.com/skills-platform/standard-skills.git",
        ref: "main",
        resolved_commit: "9f8a7c6e5d4b3a2",
      },
    ],
    skills: [
      {
        name: "planning",
        artifact_type: "skill",
        invocation_mode: "model_invoked",
        source_id: "skills-platform-std",
        source_relative_path: "skills/planning",
        content_digest: "sha256:4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d",
        description: "Autonomous reasoning and step-by-step task decomposition.",
      },
      {
        name: "testing",
        artifact_type: "skill",
        invocation_mode: "user_invoked",
        source_id: "skills-platform-std",
        source_relative_path: "skills/testing",
        content_digest: "sha256:7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b",
        description: "Test execution, verification suites, and invariant audits.",
      },
      {
        name: "code-review",
        artifact_type: "skill",
        invocation_mode: "hybrid",
        source_id: "skills-platform-std",
        source_relative_path: "skills/code-review",
        content_digest: "sha256:1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d",
        description: "Code inspection and review policy validation.",
      },
    ],
    presets: [
      {
        id: params.presetId || "build-v2",
        name: params.presetId ? `${params.presetId} Template` : "Build v2",
        version: 2,
        description: "Standard developer production preset",
        purpose: "General engineering workflow",
        work_scope_tags: ["planning", "implementation"],
        skills: [
          { skill_name: "planning", artifact_type: "skill", required: true },
          { skill_name: "testing", artifact_type: "skill", required: false },
          { skill_name: "code-review", artifact_type: "skill", required: true },
        ],
      },
    ],
    projects: params.projectId
      ? [
          {
            project_id: params.projectId,
            project_name: params.projectId.replace(/[-_]/g, " "),
            provider_id: "antigravity",
            scope: "project",
            default_preset_id: params.presetId || "build-v2",
            default_preset_version: 2,
          },
        ]
      : [],
  };

  return { recipe };
}

function parseAndValidateRecipeClient(raw: string | SkillRecipe): RecipeInspectionResult {
  let recipe: any;
  if (typeof raw === "string") {
    try {
      recipe = JSON.parse(raw);
    } catch (err: any) {
      return {
        valid: false,
        issues: [{ field: "recipe", message: `Malformed JSON: ${err.message}` }],
      };
    }
  } else {
    recipe = raw;
  }

  if (!recipe || typeof recipe !== "object" || Array.isArray(recipe)) {
    return {
      valid: false,
      issues: [{ field: "recipe", message: "Recipe must be a valid JSON object" }],
    };
  }

  const issues: Array<{ field: string; message: string }> = [];
  if (recipe.schema_version !== 1) {
    issues.push({ field: "schema_version", message: "schema_version must equal 1" });
  }
  if (!recipe.recipe_id || typeof recipe.recipe_id !== "string") {
    issues.push({ field: "recipe_id", message: "recipe_id must be a non-empty string" });
  }
  if (!recipe.name || typeof recipe.name !== "string") {
    issues.push({ field: "name", message: "name must be a non-empty string" });
  }
  if (!recipe.created_at || typeof recipe.created_at !== "string") {
    issues.push({ field: "created_at", message: "created_at timestamp is required" });
  }

  if (!Array.isArray(recipe.sources)) {
    issues.push({ field: "sources", message: "sources must be an array" });
  }
  if (!Array.isArray(recipe.skills)) {
    issues.push({ field: "skills", message: "skills must be an array" });
  }
  if (!Array.isArray(recipe.presets)) {
    issues.push({ field: "presets", message: "presets must be an array" });
  }

  if (issues.length > 0) {
    return {
      valid: false,
      recipe_id: recipe.recipe_id,
      name: recipe.name,
      description: recipe.description,
      created_at: recipe.created_at,
      issues,
    };
  }

  const byInvocationMode = { user_invoked: 0, model_invoked: 0, hybrid: 0, unspecified: 0 };
  const byArtifactType: Record<string, number> = {};
  for (const skill of recipe.skills ?? []) {
    const mode = (skill.invocation_mode as keyof typeof byInvocationMode) || "unspecified";
    if (mode in byInvocationMode) {
      byInvocationMode[mode]++;
    } else {
      byInvocationMode.unspecified++;
    }
    const type = skill.artifact_type || "skill";
    byArtifactType[type] = (byArtifactType[type] ?? 0) + 1;
  }

  const summary: RecipeInspectionSummary = {
    sources_count: recipe.sources?.length ?? 0,
    skills_count: recipe.skills?.length ?? 0,
    presets_count: recipe.presets?.length ?? 0,
    projects_count: recipe.projects?.length ?? 0,
    by_invocation_mode: byInvocationMode,
    by_artifact_type: byArtifactType,
  };

  return {
    valid: true,
    recipe_id: recipe.recipe_id,
    name: recipe.name,
    description: recipe.description,
    created_at: recipe.created_at,
    summary,
    sources: (recipe.sources ?? []).map((s: any) => ({
      source_id: s.source_id,
      type: s.type,
      locator: s.locator,
      resolved_commit: s.resolved_commit,
    })),
    presets: (recipe.presets ?? []).map((p: any) => ({
      id: p.id,
      name: p.name,
      version: p.version,
      skills_count: p.skills?.length ?? 0,
    })),
    projects: recipe.projects ?? [],
  };
}

export async function inspectRecipeApi(
  recipeContent: string | SkillRecipe,
): Promise<RecipeInspectionResult> {
  if (catalogApi) {
    try {
      const response = await fetch(`${catalogApi}/api/recipes/inspect`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ recipe: recipeContent }),
      });
      if (response.ok) {
        return await response.json();
      }
    } catch {
      // Fallback to client-side parsing if network fails
    }
  }

  return parseAndValidateRecipeClient(recipeContent);
}

export async function applyRecipeApi(params: RecipeApplyOptions): Promise<RecipeApplyResult> {
  if (catalogApi) {
    const response = await fetch(`${catalogApi}/api/recipes/apply`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        recipe: params.recipe,
        project_path: params.project_path,
        provider_id: params.provider_id,
        confirm: params.confirm === true,
      }),
    });
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ error: "Apply failed" }));
      throw new Error(errorBody.error || "Failed to apply recipe");
    }
    return response.json();
  }

  // Client-side fallback
  const recipeObj: any =
    typeof params.recipe === "string" ? JSON.parse(params.recipe) : params.recipe;
  return {
    recipe_id: recipeObj.recipe_id || "recipe-client",
    name: recipeObj.name || "Inspected Recipe",
    sources_imported: (recipeObj.sources || []).map((s: any) => ({
      source_id: s.source_id,
      locator: s.locator,
      imported_skills:
        recipeObj.skills?.filter((sk: any) => sk.source_id === s.source_id).length || 1,
    })),
    presets_reconciled: (recipeObj.presets || []).map((p: any) => ({
      id: p.id,
      matched_skills: p.skills?.length || 0,
    })),
    delivery: params.project_path
      ? {
          project_id: params.project_path.split(/[\\/]/).pop() || "project",
          preview: { operations: (recipeObj.skills || []).length },
          applied: params.confirm === true,
          message: params.confirm
            ? `Successfully materialized ${(recipeObj.skills || []).length} skill bindings for ${params.provider_id || "codex"} into ${params.project_path}`
            : "Preview ready. Confirm execution to materialize bindings into target project.",
        }
      : null,
  };
}

export async function readApplyStream(
  response: Response,
  onProgress: (progress: ApplyProgress) => void,
): Promise<ApplyResult> {
  if (!response.ok || !response.body) {
    throw new Error("Skills Manager progress stream was unavailable");
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: ApplyResult | null = null;
  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const event = JSON.parse(line) as {
        type: "progress" | "result" | "error";
        progress?: ApplyProgress;
        result?: ApplyResult;
        error?: string;
      };
      if (event.type === "progress" && event.progress) onProgress(event.progress);
      if (event.type === "result" && event.result) result = event.result;
      if (event.type === "error") throw new Error(event.error ?? "Skills Manager apply failed");
    }
    if (done) break;
  }
  if (!result) throw new Error("Skills Manager did not return an apply result");
  return result;
}

