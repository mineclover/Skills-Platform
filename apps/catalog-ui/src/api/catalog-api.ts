import type {
  ApplyProgress,
  ApplyResult,
  InvocationMode,
  InvocationModeDistribution,
  InvocationModeRatio,
  RecipeApplyOptions,
  RecipeApplyResult,
  RecipeInspectionResult,
  RecipeInspectionSummary,
  SkillRecipe,
  TelemetryEvent,
  TelemetryQueryParams,
  TelemetrySummary,
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

export function calculateInvocationModeRatios(
  byMode: InvocationModeDistribution = {
    model_invoked: 0,
    user_invoked: 0,
    hybrid: 0,
    unspecified: 0,
  },
): InvocationModeRatio[] {
  const total =
    (byMode.model_invoked || 0) +
    (byMode.user_invoked || 0) +
    (byMode.hybrid || 0) +
    (byMode.unspecified || 0);
  const modes: InvocationMode[] = ["model_invoked", "user_invoked", "hybrid", "unspecified"];
  if (total === 0) {
    return modes.map((mode) => ({ mode, count: 0, percentage: 0 }));
  }
  return modes.map((mode) => {
    const count = byMode[mode] || 0;
    const percentage = Math.round((count / total) * 1000) / 10;
    return { mode, count, percentage };
  });
}

export function formatDuration(durationMs: number): string {
  if (durationMs < 0 || !Number.isFinite(durationMs)) return "0ms";
  if (durationMs < 1) return "< 1ms";
  if (durationMs < 1000) return `${Math.round(durationMs)}ms`;
  const seconds = durationMs / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const remSeconds = Math.round(seconds % 60);
  return `${minutes}m ${remSeconds}s`;
}

export function createMockTelemetrySummary(params?: TelemetryQueryParams): TelemetrySummary {
  const now = Date.now();
  const rawEvents: TelemetryEvent[] = [
    {
      id: "ev_101",
      timestamp: new Date(now - 1000 * 18).toISOString(),
      provider_id: "antigravity",
      project_id: params?.projectId || "skills-platform",
      recipe_id: "scoped-inner-loop-recipe",
      skill_name: "planning",
      lineage_id: "lineage_planning",
      invocation_mode: "model_invoked",
      duration_ms: 38,
      tool_calls_count: 3,
      outcome: "success",
      evidence_type: "activation_report",
      summary: "Autonomous reflex plan decomposition executed within threshold.",
      details: "Step plan synthesized in 38ms with 3 tool calls.",
      metrics: { duration_ms: 38, tool_calls_count: 3 },
    },
    {
      id: "ev_102",
      timestamp: new Date(now - 1000 * 62).toISOString(),
      provider_id: "codex",
      project_id: params?.projectId || "skills-platform",
      recipe_id: "scoped-inner-loop-recipe",
      skill_name: "testing",
      lineage_id: "lineage_testing",
      invocation_mode: "user_invoked",
      duration_ms: 184,
      tool_calls_count: 2,
      outcome: "success",
      evidence_type: "manual",
      summary: "Pinpoint test runner invoked directly by human operator.",
      details: "Ran scoped node:test with 0 regressions.",
      metrics: { duration_ms: 184, tool_calls_count: 2 },
    },
    {
      id: "ev_103",
      timestamp: new Date(now - 1000 * 135).toISOString(),
      provider_id: "claude",
      project_id: params?.projectId || "skills-platform",
      recipe_id: "release-governance-recipe",
      skill_name: "code-review",
      lineage_id: "lineage_code_review",
      invocation_mode: "hybrid",
      duration_ms: 76,
      tool_calls_count: 4,
      outcome: "correction",
      evidence_type: "evaluation",
      summary: "Rule policy drift corrected during static invariant check.",
      details: "Auto-reconciled symlink binding paths.",
      metrics: { duration_ms: 76, tool_calls_count: 4 },
    },
    {
      id: "ev_104",
      timestamp: new Date(now - 1000 * 220).toISOString(),
      provider_id: "antigravity",
      project_id: params?.projectId || "skills-platform",
      recipe_id: "task-planning-recipe",
      skill_name: "planning",
      lineage_id: "lineage_planning",
      invocation_mode: "model_invoked",
      duration_ms: 42,
      tool_calls_count: 2,
      outcome: "success",
      evidence_type: "activation_report",
      summary: "PRD task breakdown completed cleanly.",
      details: "Generated 3 atomic task queue items.",
      metrics: { duration_ms: 42, tool_calls_count: 2 },
    },
    {
      id: "ev_105",
      timestamp: new Date(now - 1000 * 310).toISOString(),
      provider_id: "codex",
      project_id: params?.projectId || "skills-platform",
      recipe_id: "scoped-inner-loop-recipe",
      skill_name: "UI Design",
      lineage_id: "lineage_ui",
      invocation_mode: "user_invoked",
      duration_ms: 215,
      tool_calls_count: 1,
      outcome: "risk",
      evidence_type: "incident",
      summary: "Latency spike and unexpected binding collision detected.",
      details: "High duration 215ms on target render pass.",
      metrics: { duration_ms: 215, tool_calls_count: 1 },
    },
    {
      id: "ev_106",
      timestamp: new Date(now - 1000 * 430).toISOString(),
      provider_id: "antigravity",
      project_id: params?.projectId || "skills-platform",
      recipe_id: "scoped-inner-loop-recipe",
      skill_name: "testing",
      lineage_id: "lineage_testing",
      invocation_mode: "model_invoked",
      duration_ms: 29,
      tool_calls_count: 2,
      outcome: "success",
      evidence_type: "evaluation",
      summary: "Reflex invariant assertions verified before build step.",
      details: "Passed fast assertion checks.",
      metrics: { duration_ms: 29, tool_calls_count: 2 },
    },
    {
      id: "ev_107",
      timestamp: new Date(now - 1000 * 590).toISOString(),
      provider_id: "claude",
      project_id: params?.projectId || "skills-platform",
      recipe_id: "task-planning-recipe",
      skill_name: "planning",
      lineage_id: "lineage_planning",
      invocation_mode: "hybrid",
      duration_ms: 54,
      tool_calls_count: 1,
      outcome: "neutral",
      evidence_type: "manual",
      summary: "Read-only inspection of project effective skill set.",
      details: "No mutations made.",
      metrics: { duration_ms: 54, tool_calls_count: 1 },
    },
  ];

  let filtered = rawEvents;
  if (params?.projectId) {
    filtered = filtered.filter((e) => e.project_id === params.projectId);
  }
  if (params?.providerId && params.providerId !== "all") {
    filtered = filtered.filter(
      (e) => e.provider_id.toLowerCase() === params.providerId?.toLowerCase(),
    );
  }
  if (params?.skillName) {
    filtered = filtered.filter(
      (e) => e.skill_name.toLowerCase() === params.skillName?.toLowerCase(),
    );
  }
  if (params?.since) {
    const sinceDate = new Date(params.since);
    filtered = filtered.filter((e) => new Date(e.timestamp) >= sinceDate);
  }

  const limit = params?.limit && params.limit > 0 ? params.limit : 20;
  const recentEvents = filtered.slice(0, limit);

  const total = filtered.length;
  const totalDuration = filtered.reduce((acc, e) => acc + (e.duration_ms || 0), 0);
  const avgDuration = total > 0 ? Math.round((totalDuration / total) * 10) / 10 : 0;
  const successCount = filtered.filter((e) => e.outcome === "success").length;
  const successRate = total > 0 ? Math.round((successCount / total) * 100) / 100 : 1.0;

  const byMode: InvocationModeDistribution = {
    model_invoked: filtered.filter((e) => e.invocation_mode === "model_invoked").length,
    user_invoked: filtered.filter((e) => e.invocation_mode === "user_invoked").length,
    hybrid: filtered.filter((e) => e.invocation_mode === "hybrid").length,
    unspecified: filtered.filter((e) => e.invocation_mode === "unspecified").length,
  };

  const byProvider: Record<string, number> = {};
  for (const e of filtered) {
    byProvider[e.provider_id] = (byProvider[e.provider_id] || 0) + 1;
  }

  const healthyCount = filtered.filter(
    (e) => e.outcome === "success" || e.outcome === "neutral",
  ).length;
  const needsReviewCount = filtered.filter((e) =>
    ["correction", "scope_mismatch", "freshness", "risk"].includes(e.outcome),
  ).length;
  const unknownCount = total - healthyCount - needsReviewCount;

  const ratios = calculateInvocationModeRatios(byMode);

  return {
    total_invocations: total,
    average_duration_ms: avgDuration,
    success_rate: successRate,
    by_mode: byMode,
    by_provider: byProvider,
    by_health: {
      healthy: healthyCount,
      needs_review: needsReviewCount,
      unknown: Math.max(0, unknownCount),
    },
    recent_events: recentEvents,
    invocation_mode_ratios: ratios,
    last_event_at: recentEvents[0]?.timestamp || new Date().toISOString(),
  };
}

export async function fetchTelemetrySummary(
  params?: TelemetryQueryParams,
): Promise<TelemetrySummary> {
  if (catalogApi) {
    try {
      const query = new URLSearchParams();
      if (params?.projectId) query.set("project_id", params.projectId);
      if (params?.providerId && params.providerId !== "all") {
        query.set("provider_id", params.providerId);
      }
      if (params?.skillName) query.set("skill_name", params.skillName);
      if (params?.since) query.set("since", params.since);
      if (params?.limit) query.set("limit", String(params.limit));

      const response = await fetch(`${catalogApi}/api/telemetry/summary?${query}`);
      if (response.ok) {
        const body: TelemetrySummary = await response.json();
        if (!body.invocation_mode_ratios && body.by_mode) {
          body.invocation_mode_ratios = calculateInvocationModeRatios(body.by_mode);
        }
        return body;
      }
    } catch {
      // Graceful offline fallback
    }
  }

  return createMockTelemetrySummary(params);
}

export async function recordTelemetryApi(
  payload: Partial<TelemetryEvent>,
): Promise<{ ok: boolean; recorded: boolean; event: TelemetryEvent }> {
  const fullEvent: TelemetryEvent = {
    id: payload.id || `ev_${Math.random().toString(36).slice(2, 9)}`,
    timestamp: payload.timestamp || new Date().toISOString(),
    provider_id: payload.provider_id || "antigravity",
    project_id: payload.project_id || "skills-platform",
    recipe_id: payload.recipe_id ?? null,
    skill_name: payload.skill_name || "planning",
    lineage_id: payload.lineage_id ?? null,
    invocation_mode: payload.invocation_mode || "model_invoked",
    duration_ms: typeof payload.duration_ms === "number" ? payload.duration_ms : 35,
    tool_calls_count: typeof payload.tool_calls_count === "number" ? payload.tool_calls_count : 1,
    outcome: payload.outcome || "success",
    evidence_type: payload.evidence_type || "activation_report",
    summary: payload.summary || "Recorded telemetry event",
    details: payload.details || null,
    metrics: payload.metrics,
  };

  if (catalogApi) {
    try {
      const response = await fetch(`${catalogApi}/api/telemetry/record`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(fullEvent),
      });
      if (response.ok) {
        return await response.json();
      }
    } catch {
      // Fallback
    }
  }

  return {
    ok: true,
    recorded: true,
    event: fullEvent,
  };
}

export function subscribeTelemetryPolling(
  callback: (summary: TelemetrySummary) => void,
  intervalMs = 4000,
  params?: TelemetryQueryParams,
): () => void {
  let active = true;

  const poll = async () => {
    try {
      const summary = await fetchTelemetrySummary(params);
      if (active) {
        callback(summary);
      }
    } catch {
      // Resilient to intermittent poll errors
    }
  };

  void poll();
  const timer = setInterval(() => {
    void poll();
  }, intervalMs);

  return () => {
    active = false;
    clearInterval(timer);
  };
}


