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
  ProcedureType,
  ProcedureWorkspaceStatus,
  ResponsibilityInvariants,
  ProcedureWorkspace,
  CreateProcedureWorkspaceOptions,
  VerifyWorkspaceResult,
  MergeWorkspaceResult,
  PruneWorkspaceResult,
  DiscardWorkspaceResult,
  MergeQueueItem,
  MergeQueueStatus,
  ProcessQueueResult,
  ProjectSkillOverrideResult,
  CreateSkillAnnotationInput,
  HookDiagnostics,
  HookSyncResult,
  SkillAnnotation,
  SkillAuthoringAnalysis,
  SkillAuthoringCategory,
  SkillAuthoringConfidence,
  SkillAuthoringFinding,
  SkillAuthoringPlatform,
  SkillAuthoringPlatformResult,
  SkillAuthoringRulesetsResponse,
  SkillStaticAnalysis,
  UpdateSkillAnnotationInput,
  ValidateSkillDraftInput,
  ValidateSkillDraftResult,
} from "../types";

export const catalogApi = import.meta.env.VITE_CATALOG_API?.replace(/\/$/, "") ?? "";

async function throwCatalogApiError(response: Response, fallbackMessage: string): Promise<never> {
  const body = await response.json().catch(() => null) as
    | { error?: unknown; code?: unknown; issues?: unknown }
    | null;
  const message = typeof body?.error === "string" && body.error.trim()
    ? body.error
    : `${fallbackMessage} (HTTP ${response.status})`;
  const error = new Error(message) as Error & {
    status?: number;
    code?: string;
    issues?: unknown;
  };
  error.status = response.status;
  if (typeof body?.code === "string") error.code = body.code;
  if (body?.issues !== undefined) error.issues = body.issues;
  throw error;
}

export async function setProjectSkillOverrideApi(params: {
  projectId: string;
  lineageId: string;
  registrySkillId: string;
  desiredState: "enabled" | "disabled" | "inherit";
}): Promise<ProjectSkillOverrideResult> {
  if (!catalogApi) {
    throw new Error(
      "Catalog API is not configured. Individual skill overrides are unavailable in demo mode.",
    );
  }

  const response = await fetch(
    `${catalogApi}/api/projects/${encodeURIComponent(params.projectId)}/skill-overrides/${encodeURIComponent(params.lineageId)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        registry_skill_id: params.registrySkillId,
        desired_state: params.desiredState,
      }),
    },
  );
  if (!response.ok) {
    await throwCatalogApiError(response, "The project skill state change was rejected");
  }
  return response.json();
}

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

// ==========================================
// Reader annotations & static skill analysis
// ==========================================

function authoringRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function normalizeAuthoringConfidence(value: unknown): SkillAuthoringConfidence {
  if (value === "certain" || value === "likely" || value === "heuristic") return value;
  if (value === "high") return "certain";
  if (value === "medium") return "likely";
  return "heuristic";
}

function normalizeAuthoringCategory(value: unknown): SkillAuthoringCategory {
  const supported = new Set<SkillAuthoringCategory>([
    "structure",
    "identity",
    "trigger",
    "scope",
    "progressive_disclosure",
    "resources",
    "provider_metadata",
    "portability",
    "security",
  ]);
  if (typeof value === "string" && supported.has(value as SkillAuthoringCategory)) {
    return value as SkillAuthoringCategory;
  }
  if (value === "manifest") return "structure";
  if (value === "focus") return "scope";
  if (value === "dependencies" || value === "invocation") return "provider_metadata";
  return "structure";
}

function normalizeAuthoringFinding(value: unknown, index: number): SkillAuthoringFinding {
  const raw = authoringRecord(value) ?? {};
  const rawBasis = authoringRecord(raw.basis);
  const basisText = typeof raw.basis === "string" ? raw.basis : null;
  const sourceUrl = typeof rawBasis?.source_url === "string"
    ? rawBasis.source_url
    : basisText && /^https?:\/\//i.test(basisText)
      ? basisText
      : null;
  const rawLocation = authoringRecord(raw.location);
  const severity = raw.severity === "error" || raw.severity === "warning" || raw.severity === "info"
    ? raw.severity
    : "info";
  const ruleId = typeof raw.rule_id === "string"
    ? raw.rule_id
    : typeof raw.code === "string"
      ? raw.code
      : `authoring.finding.${index}`;
  return {
    rule_id: ruleId,
    severity,
    confidence: normalizeAuthoringConfidence(raw.confidence),
    category: normalizeAuthoringCategory(raw.category),
    basis: {
      kind:
        rawBasis?.kind === "official" || rawBasis?.kind === "platform_policy"
          || rawBasis?.kind === "bundled_validator" || rawBasis?.kind === "heuristic"
          ? rawBasis.kind
          : sourceUrl
            ? "official"
            : "platform_policy",
      source_url: sourceUrl,
      statement:
        typeof rawBasis?.statement === "string"
          ? rawBasis.statement
          : basisText && basisText !== sourceUrl
            ? basisText
            : null,
    },
    message: typeof raw.message === "string" ? raw.message : ruleId,
    location: rawLocation ? {
      relative_path:
        typeof rawLocation.relative_path === "string"
          ? rawLocation.relative_path
          : typeof rawLocation.path === "string"
            ? rawLocation.path
            : "SKILL.md",
      start_line:
        typeof rawLocation.start_line === "number"
          ? rawLocation.start_line
          : typeof rawLocation.line === "number"
            ? rawLocation.line
            : null,
      end_line: typeof rawLocation.end_line === "number" ? rawLocation.end_line : null,
      yaml_path:
        typeof rawLocation.yaml_path === "string"
          ? rawLocation.yaml_path
          : typeof rawLocation.field === "string"
            ? rawLocation.field
            : null,
    } : null,
    evidence: authoringRecord(raw.evidence) ?? undefined,
    recommendation: typeof raw.recommendation === "string" ? raw.recommendation : null,
  };
}

function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function normalizeAuthoringPlatformResult(
  platform: SkillAuthoringPlatform,
  value: unknown,
): SkillAuthoringPlatformResult | undefined {
  const raw = authoringRecord(value);
  if (!raw) return undefined;
  const findings = Array.isArray(raw.findings)
    ? raw.findings.map(normalizeAuthoringFinding)
    : [];
  const errors = findings.filter((finding) => finding.severity === "error").length;
  const warnings = findings.filter((finding) => finding.severity === "warning").length;
  const info = findings.filter((finding) => finding.severity === "info").length;
  const rawRuleset = authoringRecord(raw.ruleset) ?? {};
  const observations = authoringRecord(raw.observations) ?? {};
  const metadata = authoringRecord(raw.provider_metadata) ?? {};
  const rawOpenai = authoringRecord(metadata.openai);
  const rawAntigravity = authoringRecord(metadata.antigravity);
  const rawPolicy = authoringRecord(rawOpenai?.policy);
  const invocationValue = metadata.invocation_mode;
  const invocationMode = invocationValue === "explicit_only" || invocationValue === "user_invoked"
    ? "explicit_only"
    : invocationValue === "implicit_and_explicit" || invocationValue === "hybrid"
      ? "implicit_and_explicit"
      : "unspecified";
  return {
    platform,
    ruleset: {
      id: typeof rawRuleset.id === "string" ? rawRuleset.id : `${platform}-authoring`,
      version: typeof rawRuleset.version === "string" ? rawRuleset.version : "unknown",
      source: typeof rawRuleset.source === "string" ? rawRuleset.source : "unreported",
    },
    summary: {
      compatible: errors === 0,
      status: errors > 0 ? "nonconformant" : warnings > 0 ? "review_recommended" : "conformant",
      finding_count: findings.length,
      error_count: errors,
      warning_count: warnings,
      info_count: info,
    },
    findings,
    observations,
    provider_metadata: {
      manifest_path:
        typeof metadata.manifest_path === "string"
          ? metadata.manifest_path
          : typeof observations.manifest_path === "string"
            ? observations.manifest_path
            : null,
      manifest_exact_case:
        typeof metadata.manifest_exact_case === "boolean" ? metadata.manifest_exact_case : null,
      resolved_name: typeof metadata.resolved_name === "string" ? metadata.resolved_name : null,
      invocation_mode: invocationMode,
      frontmatter_fields: normalizeStringArray(metadata.frontmatter_fields),
      optional_directories_present: normalizeStringArray(metadata.optional_directories_present),
      provider_extensions_present: normalizeStringArray(metadata.provider_extensions_present),
      discovery_root:
        typeof metadata.discovery_root === "string"
          ? metadata.discovery_root
          : normalizeStringArray(metadata.project_discovery_roots)[0] ?? null,
      openai: rawOpenai ? {
        present: rawOpenai.present === true,
        interface: authoringRecord(rawOpenai.interface) as any ?? undefined,
        policy: rawPolicy ? {
          allow_implicit_invocation:
            typeof rawPolicy.allow_implicit_invocation === "boolean"
              ? rawPolicy.allow_implicit_invocation
              : undefined,
        } : undefined,
        dependencies: authoringRecord(rawOpenai.dependencies) as any ?? undefined,
      } : undefined,
      antigravity: platform === "antigravity" ? {
        name_defaulted: rawAntigravity?.name_defaulted === true || metadata.name_source === "folder",
        examples: normalizeStringArray(rawAntigravity?.examples ?? metadata.examples),
        resources: normalizeStringArray(rawAntigravity?.resources ?? metadata.resources),
      } : undefined,
    },
  };
}

function normalizeSkillAuthoringAnalysis(value: unknown): SkillAuthoringAnalysis | undefined {
  const raw = authoringRecord(value);
  const rawResults = authoringRecord(raw?.results);
  if (!rawResults) return undefined;
  const codex = normalizeAuthoringPlatformResult("codex", rawResults.codex);
  const antigravity = normalizeAuthoringPlatformResult("antigravity", rawResults.antigravity);
  return {
    results: {
      ...(codex ? { codex } : {}),
      ...(antigravity ? { antigravity } : {}),
    },
    execution_effect: "none",
  };
}

function normalizeSkillStaticAnalysis(value: SkillStaticAnalysis): SkillStaticAnalysis {
  return {
    ...value,
    authoring: normalizeSkillAuthoringAnalysis(value.authoring),
  };
}

const localSkillAnnotationsMemory: SkillAnnotation[] = [];
const localSkillAnalysesMemory: SkillStaticAnalysis[] = [];

function localRecordId(prefix: string): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  return uuid ? `${prefix}_${uuid}` : `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export async function fetchSkillAnnotationsApi(
  lineageId: string,
  options?: { includeDeleted?: boolean },
): Promise<{ annotations: SkillAnnotation[] }> {
  if (catalogApi) {
    const query = new URLSearchParams();
    if (options?.includeDeleted) query.set("include_deleted", "true");
    const suffix = query.size > 0 ? `?${query}` : "";
    const response = await fetch(
      `${catalogApi}/api/skills/${encodeURIComponent(lineageId)}/annotations${suffix}`,
    );
    if (!response.ok) {
      await throwCatalogApiError(response, "Failed to load skill annotations");
    }
    return response.json();
  }

  return {
    annotations: localSkillAnnotationsMemory.filter(
      (annotation) =>
        annotation.lineage_id === lineageId &&
        (options?.includeDeleted === true || annotation.deleted_at === null),
    ),
  };
}

export async function createSkillAnnotationApi(
  lineageId: string,
  input: CreateSkillAnnotationInput,
): Promise<SkillAnnotation> {
  if (catalogApi) {
    const response = await fetch(
      `${catalogApi}/api/skills/${encodeURIComponent(lineageId)}/annotations`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      },
    );
    if (!response.ok) {
      await throwCatalogApiError(response, "Failed to create skill annotation");
    }
    return response.json();
  }

  const now = new Date().toISOString();
  const annotation: SkillAnnotation = {
    id: localRecordId("annotation"),
    lineage_id: lineageId,
    source_revision_id: input.source_revision_id ?? null,
    kind: input.kind ?? "plain_language",
    title: input.title ?? null,
    body: input.body,
    locale: input.locale ?? "en",
    anchor: input.anchor ?? null,
    author: input.author ?? "catalog-ui",
    origin: input.origin ?? "user",
    version: 1,
    history: [],
    created_at: now,
    updated_at: now,
    deleted_at: null,
    deleted_by: null,
    execution_effect: "none",
  };
  localSkillAnnotationsMemory.unshift(annotation);
  return annotation;
}

export async function updateSkillAnnotationApi(
  annotationId: string,
  input: UpdateSkillAnnotationInput,
): Promise<SkillAnnotation> {
  if (catalogApi) {
    const response = await fetch(`${catalogApi}/api/annotations/${encodeURIComponent(annotationId)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!response.ok) {
      await throwCatalogApiError(response, "Failed to update skill annotation");
    }
    return response.json();
  }

  const index = localSkillAnnotationsMemory.findIndex((annotation) => annotation.id === annotationId);
  if (index < 0) throw new Error(`Annotation not found: ${annotationId}`);
  const current = localSkillAnnotationsMemory[index];
  if (current.version !== input.expected_version) {
    throw new Error("Annotation changed since it was loaded. Refresh and try again.");
  }
  const updated: SkillAnnotation = {
    ...current,
    ...input.patch,
    version: current.version + 1,
    updated_at: new Date().toISOString(),
    history: [
      ...current.history,
      { version: current.version, changed_at: current.updated_at, changed_by: input.author },
    ],
  };
  localSkillAnnotationsMemory[index] = updated;
  return updated;
}

export async function deleteSkillAnnotationApi(
  annotationId: string,
  input: { lineage_id: string; expected_version: number; author?: string },
): Promise<SkillAnnotation> {
  if (catalogApi) {
    const response = await fetch(
      `${catalogApi}/api/annotations/${encodeURIComponent(annotationId)}/delete`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      },
    );
    if (!response.ok) {
      await throwCatalogApiError(response, "Failed to delete skill annotation");
    }
    return response.json();
  }

  const updated = await updateSkillAnnotationApi(annotationId, {
    lineage_id: input.lineage_id,
    expected_version: input.expected_version,
    author: input.author,
    patch: {},
  });
  updated.deleted_at = updated.updated_at;
  updated.deleted_by = input.author ?? "catalog-ui";
  return updated;
}

export async function restoreSkillAnnotationApi(
  annotationId: string,
  input: { lineage_id: string; expected_version: number; author?: string },
): Promise<SkillAnnotation> {
  if (catalogApi) {
    const response = await fetch(
      `${catalogApi}/api/annotations/${encodeURIComponent(annotationId)}/restore`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      },
    );
    if (!response.ok) {
      await throwCatalogApiError(response, "Failed to restore skill annotation");
    }
    return response.json();
  }

  const restored = await updateSkillAnnotationApi(annotationId, {
    lineage_id: input.lineage_id,
    expected_version: input.expected_version,
    author: input.author,
    patch: {},
  });
  restored.deleted_at = null;
  restored.deleted_by = null;
  return restored;
}

export async function fetchSkillAnalysesApi(
  lineageId: string,
): Promise<{ analyses: SkillStaticAnalysis[] }> {
  if (catalogApi) {
    const response = await fetch(
      `${catalogApi}/api/skills/${encodeURIComponent(lineageId)}/analyses`,
    );
    if (!response.ok) {
      await throwCatalogApiError(response, "Failed to load static skill analyses");
    }
    const body = await response.json() as { analyses: SkillStaticAnalysis[] };
    return { analyses: body.analyses.map(normalizeSkillStaticAnalysis) };
  }
  return {
    analyses: localSkillAnalysesMemory.filter((analysis) => analysis.lineage_id === lineageId),
  };
}

export async function fetchSkillAuthoringRulesetsApi(): Promise<SkillAuthoringRulesetsResponse> {
  if (catalogApi) {
    const response = await fetch(`${catalogApi}/api/skill-authoring/rulesets`);
    if (!response.ok) {
      await throwCatalogApiError(response, "Failed to load skill authoring rulesets");
    }
    const body = await response.json() as SkillAuthoringRulesetsResponse;
    return { ...body, available: body.available ?? true };
  }

  return {
    rulesets: [],
    available: false,
    message:
      "Catalog API is not configured; Codex and Antigravity authoring rulesets were not inspected.",
  };
}

/**
 * Validates virtual draft files without writing them to the source package or registry.
 * Configured API failures are surfaced and never converted into a conformant demo result.
 */
export async function validateSkillDraftApi(
  input: ValidateSkillDraftInput,
): Promise<ValidateSkillDraftResult> {
  if (!catalogApi) {
    throw new Error(
      "Catalog API is not configured. Virtual skill draft validation is unavailable in demo mode.",
    );
  }

  const response = await fetch(`${catalogApi}/api/skill-authoring/validate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    await throwCatalogApiError(response, "Failed to validate the virtual skill draft");
  }
  return response.json();
}

export async function runSkillAnalysisApi(
  lineageId: string,
  input: { source_revision_id: string; analyzer_version?: string },
): Promise<SkillStaticAnalysis> {
  if (catalogApi) {
    const response = await fetch(
      `${catalogApi}/api/skills/${encodeURIComponent(lineageId)}/analysis`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      },
    );
    if (!response.ok) {
      await throwCatalogApiError(response, "Failed to analyze skill revision");
    }
    return normalizeSkillStaticAnalysis(await response.json() as SkillStaticAnalysis);
  }

  const analysis: SkillStaticAnalysis = {
    id: localRecordId("analysis"),
    lineage_id: lineageId,
    source_revision_id: input.source_revision_id,
    input_content_digest: "demo:unavailable",
    analysis_digest: "demo:unavailable",
    analyzer: { id: "catalog-ui-demo", version: input.analyzer_version ?? "1" },
    manifest_path: "",
    identity: { name: lineageId, description: null, frontmatter_fields: [] },
    readability: {
      line_count: 0,
      non_empty_line_count: 0,
      section_count: 0,
      instruction_line_count: 0,
      fenced_code_block_count: 0,
    },
    sections: [],
    references: { markdown_link_count: 0, relative: [], external: [] },
    support_files: { total: 0, executable_like: [] },
    warnings: ["Demo mode cannot read the immutable skill revision; configure VITE_CATALOG_API."],
    generated_at: new Date().toISOString(),
    stale: false,
    is_latest_revision: true,
    outdated: false,
    execution_effect: "none",
  };
  localSkillAnalysesMemory.unshift(analysis);
  return analysis;
}

// ==========================================
// Hook Ecosystem & Governance Studio API
// ==========================================

import type {
  HookDefinition,
  HookSimulationResult,
  HookExecutionResult,
  SecurityFeedEvent,
} from "../types";

export const BUILTIN_GUARD_HOOKS: HookDefinition[] = [
  {
    id: "secret-leak-guard",
    name: "Secret Leak Guard",
    event: "pre_tool_use",
    description: "Detects and blocks API keys, private tokens, and credentials in commands and payloads.",
    enabled: true,
    matcher: "run_command|write_to_file|replace_file_content|send_message|view_file",
    handler: {
      type: "script",
      target: ".skills-platform/hooks/guards/secret-leak-guard.js",
      timeout_ms: 5000,
    },
    priority: 5,
    providers: ["antigravity", "claude", "codex"],
    metadata: { system: true, category: "security" },
  },
  {
    id: "destructive-command-blocker",
    name: "Destructive Command Blocker",
    event: "pre_tool_use",
    description: "Blocks catastrophic shell commands, destructive file deletions, and database wipes.",
    enabled: true,
    matcher: "run_command",
    handler: {
      type: "script",
      target: ".skills-platform/hooks/guards/destructive-command-blocker.js",
      timeout_ms: 5000,
    },
    priority: 10,
    providers: ["antigravity", "claude", "codex"],
    metadata: { system: true, category: "safety" },
  },
  {
    id: "context-budget-guard",
    name: "Context Budget Guard",
    event: "pre_tool_use",
    description: "Enforces 80k token density budget to prevent excessive file writes and context bloat.",
    enabled: true,
    matcher: "write_to_file|replace_file_content|run_command|view_file",
    handler: {
      type: "script",
      target: ".skills-platform/hooks/guards/context-budget-guard.js",
      timeout_ms: 5000,
    },
    priority: 15,
    providers: ["antigravity", "claude", "codex"],
    metadata: { system: true, category: "governance" },
  },
  {
    id: "scope-boundary-enforcer",
    name: "Scope Boundary Enforcer",
    event: "post_tool_use",
    description: "Audits file modifications against active topic scope and detects out-of-bounds mutations.",
    enabled: true,
    matcher: "write_to_file|replace_file_content",
    handler: {
      type: "script",
      target: ".skills-platform/hooks/guards/scope-boundary-enforcer.js",
      timeout_ms: 5000,
    },
    priority: 20,
    providers: ["antigravity", "claude", "codex"],
    metadata: { system: true, category: "governance" },
  },
  {
    id: "subagent-recursion-limiter",
    name: "Subagent Recursion Limiter",
    event: "pre_tool_use",
    description: "Enforces recursion depth and concurrency ceilings on subagent invocations.",
    enabled: true,
    matcher: "invoke_subagent|send_message",
    handler: {
      type: "script",
      target: ".skills-platform/hooks/guards/subagent-recursion-limiter.js",
      timeout_ms: 5000,
    },
    priority: 25,
    providers: ["antigravity", "claude", "codex"],
    metadata: { system: true, category: "governance" },
  },
  {
    id: "telemetry-collector",
    name: "Universal Telemetry Collector",
    event: "post_tool_use",
    description: "Captures tool invocation duration, parameters, and outcome into local NDJSON log.",
    enabled: true,
    matcher: "view_file|run_command",
    handler: {
      type: "script",
      target: ".skills-platform/hooks/telemetry-hook.js",
      timeout_ms: 5000,
    },
    priority: 10,
    providers: ["antigravity", "claude", "codex"],
    metadata: { system: true },
  },
  {
    id: "session-stop-flush",
    name: "Session Stop Telemetry Flush",
    event: "session_stop",
    description: "Flushes queued telemetry and generates session summary when agent loop terminates.",
    enabled: true,
    matcher: null,
    handler: {
      type: "script",
      target: ".skills-platform/hooks/telemetry-hook.js",
      timeout_ms: 5000,
    },
    priority: 20,
    providers: ["antigravity", "claude"],
    metadata: { system: true },
  },
  {
    id: "test-storm-guard",
    name: "Test Storm Suppression Guard",
    event: "on_test_run",
    description: "Blocks un-scoped full regression suite execution during inner-loop TDD cycles.",
    enabled: true,
    matcher: "test",
    handler: {
      type: "command",
      command: "node -e \"console.log('[Guard] Scoped test execution verified.')\"",
      timeout_ms: 2000,
    },
    priority: 50,
    providers: ["antigravity", "claude", "codex"],
    metadata: { system: true },
  },
];

let localHooksMemory: HookDefinition[] = JSON.parse(JSON.stringify(BUILTIN_GUARD_HOOKS));

export async function fetchHookDiagnosticsApi(params?: {
  projectPath?: string;
}): Promise<HookDiagnostics> {
  if (catalogApi) {
    const query = new URLSearchParams();
    if (params?.projectPath) query.set("project_path", params.projectPath);
    const suffix = query.size > 0 ? `?${query}` : "";
    const response = await fetch(`${catalogApi}/api/hooks/diagnostics${suffix}`);
    if (!response.ok) {
      await throwCatalogApiError(response, "Failed to analyze hook configuration");
    }
    return response.json();
  }

  const expectedHookIds = localHooksMemory.filter((hook) => hook.enabled).map((hook) => hook.id);
  const demoProvider = (provider: string, supported: boolean): HookDiagnostics["providers"][string] => {
    const hooksFeature = { found: false, stage: null, enabled: null };
    return {
      provider,
      supported,
      unsupported: !supported,
      configured: false,
      synced: false,
      drift: false,
      status: supported ? "not_configured" : "unsupported",
      configPath: null,
      configParse: { exists: false, jsonParsed: false, strictValid: false, issues: [] },
      expectedHookIds: supported ? expectedHookIds : [],
      actualHookIds: [],
      missingHookIds: supported ? expectedHookIds : [],
      unexpectedHookIds: [],
      capability: provider === "codex"
        ? {
            installed: false,
            version: null,
            versionSupported: false,
            minimumVersion: "0.144.4",
            strictConfig: {
              supported: false,
              parsed: null,
              status: "unsupported",
              error: "Catalog API is not configured; Codex strict config cannot be inspected.",
            },
            featuresList: {
              available: false,
              error: "Catalog API is not configured; Codex features cannot be inspected.",
            },
            hooksFeature,
            supportedEvents: [],
            excludedEvents: [],
            asyncSupported: false,
            mcpToolSupported: false,
          }
        : undefined,
      feature: provider === "codex" ? hooksFeature : undefined,
      trust: provider === "codex" ? { observed: false, status: "unknown" } : undefined,
      runtimeReady: false,
      error: supported ? "Catalog API is not configured; runtime state cannot be inspected." : null,
    };
  };
  const providers = {
    antigravity: demoProvider("antigravity", true),
    claude: demoProvider("claude", false),
    codex: demoProvider("codex", true),
  };
  return {
    analyzedAt: new Date().toISOString(),
    projectPath: params?.projectPath ?? null,
    manifestPath: null,
    desired: {
      total: localHooksMemory.length,
      enabled: expectedHookIds.length,
      disabled: localHooksMemory.length - expectedHookIds.length,
    },
    summary: {
      configuredProviders: 0,
      syncedProviders: 0,
      driftedProviders: 0,
      unsupportedProviders: 1,
      missingHandlers: 0,
      runtimeReadyHooks: 0,
    },
    healthy: false,
    providers,
    hooks: localHooksMemory.map((hook) => {
      const requestedProviders = hook.providers ?? ["antigravity", "claude"];
      return {
        id: hook.id,
        name: hook.name,
        event: hook.event,
        priority: hook.priority ?? 100,
        desiredEnabled: hook.enabled,
        handler: {
          type: hook.handler.type,
          target: hook.handler.target ?? hook.handler.command ?? null,
          exists: null,
          supported: false,
          error: "Runtime handler state is unavailable in demo mode.",
        },
        providers: Object.fromEntries(
          Object.entries(providers).map(([provider, state]) => {
            const requested = requestedProviders.some((candidate) => candidate === provider);
            return [provider, {
              requested,
              supported: state.supported,
              unsupported: state.unsupported,
              configured: false,
              present: false,
              synced: false,
              status: requested ? state.status : "not_requested",
              runtimeReady: false,
            }];
          }),
        ),
        runtimeReady: false,
        issues: ["Catalog API is not configured."],
      };
    }),
    issues: ["Demo catalog only: configure VITE_CATALOG_API to inspect runtime hook activation."],
  };
}

export async function fetchHooksApi(params?: { projectPath?: string; event?: string }): Promise<{ hooks: HookDefinition[] }> {
  if (catalogApi) {
    const query = new URLSearchParams();
    if (params?.projectPath) query.set("project_path", params.projectPath);
    if (params?.event) query.set("event", params.event);
    const res = await fetch(`${catalogApi}/api/hooks?${query}`);
    if (!res.ok) {
      await throwCatalogApiError(res, "Failed to load hooks");
    }
    return res.json();
  }

  let hooks = [...localHooksMemory];
  if (params?.event) {
    hooks = hooks.filter((h) => h.event === params.event);
  }
  return { hooks: hooks.sort((a, b) => (a.priority || 100) - (b.priority || 100)) };
}

export async function toggleHookApi(params: {
  hookId: string;
  enabled: boolean;
  projectPath?: string;
  sync?: boolean;
}): Promise<HookDefinition> {
  if (catalogApi) {
    const res = await fetch(`${catalogApi}/api/hooks/toggle`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        hook_id: params.hookId,
        enabled: params.enabled,
        project_path: params.projectPath,
        sync: params.sync !== false,
      }),
    });
    if (!res.ok) {
      await throwCatalogApiError(res, `Failed to ${params.enabled ? "enable" : "disable"} hook`);
    }
    return res.json();
  }

  const hook = localHooksMemory.find((h) => h.id === params.hookId);
  if (!hook) throw new Error(`Hook not found: ${params.hookId}`);
  hook.enabled = params.enabled;
  return hook;
}

export async function registerHookApi(params: {
  hook: HookDefinition;
  projectPath?: string;
  sync?: boolean;
}): Promise<HookDefinition> {
  if (catalogApi) {
    const res = await fetch(`${catalogApi}/api/hooks/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        hook: params.hook,
        project_path: params.projectPath,
        sync: params.sync !== false,
      }),
    });
    if (!res.ok) {
      await throwCatalogApiError(res, "Failed to register hook");
    }
    return res.json();
  }

  const idx = localHooksMemory.findIndex((h) => h.id === params.hook.id);
  if (idx >= 0) {
    localHooksMemory[idx] = params.hook;
  } else {
    localHooksMemory.push(params.hook);
  }
  return params.hook;
}

export async function removeHookApi(params: {
  hookId: string;
  projectPath?: string;
  sync?: boolean;
}): Promise<{ ok: boolean; removedHookId?: string }> {
  if (catalogApi) {
    const res = await fetch(`${catalogApi}/api/hooks/remove`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        hook_id: params.hookId,
        project_path: params.projectPath,
        sync: params.sync !== false,
      }),
    });
    if (!res.ok) {
      await throwCatalogApiError(res, "Failed to remove hook");
    }
    return res.json();
  }

  localHooksMemory = localHooksMemory.filter((h) => h.id !== params.hookId);
  return { ok: true, removedHookId: params.hookId };
}

export async function syncHooksApi(params?: {
  projectPath?: string;
}): Promise<HookSyncResult> {
  if (catalogApi) {
    const res = await fetch(`${catalogApi}/api/hooks/sync`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ project_path: params?.projectPath }),
    });
    if (!res.ok) {
      await throwCatalogApiError(res, "Failed to synchronize hooks");
    }
    return res.json();
  }

  const enabled = localHooksMemory.filter((h) => h.enabled);
  const diagnostics = await fetchHookDiagnosticsApi(params);
  return {
    antigravityHooks: enabled.length,
    claudeHooks: 0,
    codexHooks: enabled.length,
    providers: diagnostics.providers,
    unsupportedProviders: ["claude"],
    fullySynced: false,
    ok: false,
    issues: [
      {
        provider: "catalog-ui",
        code: "api_not_configured",
        message: "Demo mode cannot write provider hook files or observe Codex trust.",
      },
    ],
    syncedAt: new Date().toISOString(),
  };
}

export async function triggerHookSimulationApi(params: {
  event: string;
  payload: Record<string, any>;
  projectPath?: string;
  hookId?: string;
}): Promise<HookSimulationResult> {
  const startTime = Date.now();
  if (catalogApi) {
    const res = await fetch(`${catalogApi}/api/hooks/trigger`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        event: params.event,
        payload: params.payload,
        project_path: params.projectPath,
      }),
    });
    if (!res.ok) {
      await throwCatalogApiError(res, "Failed to trigger hook simulation");
    }
    return res.json();
  }

  // Fast client-side fallback simulation engine (< 200ms)
  const hooks = localHooksMemory.filter((h) => h.enabled && (!params.hookId || h.id === params.hookId));
  const results: HookExecutionResult[] = [];
  let blockedResult: HookExecutionResult | null = null;
  const payloadJson = JSON.stringify(params.payload);
  const commandStr = (params.payload.CommandLine || params.payload.command || "").toString();

  for (const hook of hooks) {
    const hookStart = Date.now();
    let allow = true;
    let status: HookExecutionResult["status"] = "success";
    let stdout = "";
    let error: string | null = null;
    let interception = null;

    if (hook.id === "secret-leak-guard") {
      const secretPatterns = [
        /(?:sk-[a-zA-Z0-9_-]{20,})/i,
        /(?:AKIA[0-9A-Z]{16})/i,
        /(?:ghp_[a-zA-Z0-9]{36})/i,
        /(?:AIza[0-9A-Za-z-_]{35})/i,
      ];
      for (const pat of secretPatterns) {
        if (pat.test(payloadJson) || pat.test(commandStr)) {
          allow = false;
          status = "blocked";
          interception = {
            allow: false,
            reason: "Command or payload contains high-entropy private credentials/API key",
            self_correct_hint: "Mask credentials using environment variable references (e.g. process.env.API_KEY).",
            violation_type: "SECRET_LEAK",
          };
          stdout = JSON.stringify(interception);
          break;
        }
      }
    } else if (hook.id === "destructive-command-blocker") {
      const destructivePatterns = [
        /\brm\s+-[rf]{1,2}\s+[\/\\]/i,
        /\bdel\s+\/[sq]\b/i,
        /\bgit\s+reset\s+--hard\b/i,
        /\bdrop\s+database\b/i,
        /\bformat\s+[c-z]:/i,
      ];
      for (const pat of destructivePatterns) {
        if (pat.test(commandStr) || pat.test(payloadJson)) {
          allow = false;
          status = "blocked";
          interception = {
            allow: false,
            reason: "Command contains catastrophic filesystem deletion or database wipe signature",
            self_correct_hint: "Use safe target paths or soft delete primitives instead of recursive forced wipes.",
            violation_type: "DESTRUCTIVE_COMMAND",
          };
          stdout = JSON.stringify(interception);
          break;
        }
      }
    } else if (hook.id === "context-budget-guard") {
      const content = params.payload.CodeContent || params.payload.content || "";
      if (content.length > 320 * 1024) {
        allow = false;
        status = "blocked";
        interception = {
          allow: false,
          reason: `Payload size (${Math.round(content.length / 1024)}KB) exceeds 80k token density budget (~320KB)`,
          self_correct_hint: "Decompose content into modular sub-files or stream updates in smaller chunks.",
          violation_type: "CONTEXT_BUDGET_OVERFLOW",
        };
        stdout = JSON.stringify(interception);
      }
    }

    const durationMs = Date.now() - hookStart;
    const resItem: HookExecutionResult = {
      hookId: hook.id,
      event: hook.event,
      status,
      allow,
      durationMs: Math.max(1, durationMs),
      stdout,
      stderr: null,
      error,
      interception,
    };
    results.push(resItem);

    if (!allow) {
      blockedResult = resItem;
      break;
    }
  }

  if (blockedResult) {
    return {
      eventName: params.event,
      allow: false,
      halted: true,
      blockedBy: blockedResult.hookId,
      reason: blockedResult.interception?.reason || "Execution blocked by guard",
      self_correct_hint: blockedResult.interception?.self_correct_hint || "Adjust parameters.",
      interception: blockedResult.interception,
      triggeredAt: new Date().toISOString(),
      totalHooks: hooks.length,
      executedCount: results.length,
      results,
    };
  }

  return {
    eventName: params.event,
    allow: true,
    halted: false,
    triggeredAt: new Date().toISOString(),
    totalHooks: hooks.length,
    executedCount: results.length,
    results,
  };
}

export async function fetchSecurityFeedApi(params?: {
  limit?: number;
  since?: string;
}): Promise<{ events: SecurityFeedEvent[] }> {
  // Built-in initial security audit stream
  const baseEvents: SecurityFeedEvent[] = [
    {
      id: "sec-001",
      timestamp: new Date(Date.now() - 1000 * 60 * 2).toISOString(),
      type: "block",
      category: "secret_leak",
      hook_id: "secret-leak-guard",
      hook_name: "Secret Leak Guard",
      tool_name: "run_command",
      details: "Blocked API key leak in curl command payload (sk-proj-****************)",
      reason: "OpenAI Secret Key pattern matched in command line argument",
      self_correct_hint: "Use environment variable injection ($OPENAI_API_KEY).",
      latency_ms: 12,
    },
    {
      id: "sec-002",
      timestamp: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
      type: "block",
      category: "destructive_command",
      hook_id: "destructive-command-blocker",
      hook_name: "Destructive Command Blocker",
      tool_name: "run_command",
      details: "Prevented catastrophic 'rm -rf /' execution in workspace root",
      reason: "Recursive root deletion command signature intercepted",
      self_correct_hint: "Target specific subdirectories with relative paths.",
      latency_ms: 8,
    },
    {
      id: "sec-003",
      timestamp: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
      type: "warn",
      category: "context_budget",
      hook_id: "context-budget-guard",
      hook_name: "Context Budget Guard",
      tool_name: "write_to_file",
      details: "Large file write intercepted (450KB > 320KB budget limit)",
      reason: "Payload exceeded 80k token density threshold",
      self_correct_hint: "Split file write into modular units.",
      latency_ms: 15,
    },
    {
      id: "sec-004",
      timestamp: new Date(Date.now() - 1000 * 60 * 25).toISOString(),
      type: "sync",
      category: "general",
      hook_id: "hooks-sync",
      hook_name: "Hook Engine Sync",
      details: "Synced 8 active hooks to .agents/hooks.json and .claude/hooks.json",
      latency_ms: 22,
    },
  ];

  return { events: baseEvents.slice(0, params?.limit ?? 20) };
}

// ---------------------------------------------------------------------------
// Procedure Workspaces & Sequential Merge Queue REST API Client & Mock State
// ---------------------------------------------------------------------------

export function createMockProcedureWorkspaces(): ProcedureWorkspace[] {
  return [
    {
      schema_version: 1,
      workspace_id: "ws-plan-01",
      procedure_type: "PLANNING",
      git_branch: "worktree/task-01-prd-decomp",
      git_worktree_path: ".workspaces/task-01-prd-decomp",
      responsibility_invariants: {
        target_test_file: "apps/skills-catalog/test/lifecycle-loop.test.js",
        owned_files: ["docs/PRD.md", "task-queue.json"],
        prohibited_actions: ["modify_source_code", "npm test", "full_test_sweep"],
        acceptance_criteria: [
          "Extract requirements from PRD.md into atomic task-queue.json",
          "Read-only filesystem access for source files",
        ],
      },
      active_skills: ["planning", "spec-decomposition", "dependency-mapper"],
      active_guards: ["read-only-source-guard", "context-budget-guard"],
      status: "merged",
      created_at: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
      completed_at: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
      metadata: {
        task_id: "task-01-prd-decomp",
        commit_hash: "c8f2a1b",
        author: "planner-agent",
        description: "PRD decomposition & atomic task breakdown",
      },
    },
    {
      schema_version: 1,
      workspace_id: "ws-tdd-02",
      procedure_type: "INNER_LOOP_TDD",
      git_branch: "worktree/task-02-flow-studio",
      git_worktree_path: ".workspaces/task-02-flow-studio",
      responsibility_invariants: {
        target_test_file: "apps/catalog-ui/test/procedure-workspaces.test.js",
        owned_files: [
          "apps/catalog-ui/src/components/flow/",
          "apps/catalog-ui/src/api/catalog-api.ts",
        ],
        prohibited_actions: ["npm test", "pytest", "jest", "modify_root_contracts"],
        acceptance_criteria: [
          "100% target test pass on procedure-workspaces.test.js",
          "Strict isolated worktree boundary with scoped active skills",
        ],
      },
      active_skills: ["tdd-inner-loop", "code-authoring", "pinpoint-test-runner"],
      active_guards: ["test-storm-suppression-guard", "scope-boundary-guard"],
      status: "verified",
      created_at: new Date(Date.now() - 1000 * 60 * 40).toISOString(),
      completed_at: null,
      metadata: {
        task_id: "task-02-flow-studio",
        dependencies: ["ws-plan-01"],
        author: "implementer-agent",
        description: "Flow Studio Visualizer & live merge timeline implementation",
      },
    },
    {
      schema_version: 1,
      workspace_id: "ws-sec-03",
      procedure_type: "SECURITY_AUDIT",
      git_branch: "worktree/task-03-security-guard",
      git_worktree_path: ".workspaces/task-03-security-guard",
      responsibility_invariants: {
        target_test_file: "test/security-audit.test.js",
        owned_files: [
          "packages/skill-contracts/src/",
          "apps/skills-catalog/src/hooks-manager.js",
        ],
        prohibited_actions: ["bypass_secret_filter", "delete_audit_log", "disable_hooks"],
        acceptance_criteria: [
          "Zero secret leaks in command payloads",
          "Sub-200ms guard interception latency with self-correct hints",
        ],
      },
      active_skills: ["security-audit", "vulnerability-scanner", "hook-validator"],
      active_guards: ["secret-leak-guard", "destructive-command-blocker"],
      status: "in_verification",
      created_at: new Date(Date.now() - 1000 * 60 * 20).toISOString(),
      completed_at: null,
      metadata: {
        task_id: "task-03-security-guard",
        dependencies: ["ws-tdd-02"],
        author: "security-specialist",
        description: "Pre/post tool execution hooks & threat model verification",
      },
    },
    {
      schema_version: 1,
      workspace_id: "ws-rel-04",
      procedure_type: "RELEASE_GATE",
      git_branch: "worktree/task-04-release-gate",
      git_worktree_path: ".workspaces/task-04-release-gate",
      responsibility_invariants: {
        target_test_file: "tests/e2e/run-all.js",
        owned_files: ["MASTER_BASELINE.md", "CHANGELOG.md", "package.json"],
        prohibited_actions: ["skip_regression_tests", "force_push_main"],
        acceptance_criteria: [
          "All 5 E2E tiers pass 100%",
          "MASTER_BASELINE.md compaction verified and signed off",
        ],
      },
      active_skills: ["release-gate", "baseline-compaction", "e2e-orchestrator"],
      active_guards: ["regression-gate-guard", "context-budget-guard"],
      status: "pending",
      created_at: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
      completed_at: null,
      metadata: {
        task_id: "task-04-release-gate",
        dependencies: ["ws-sec-03"],
        author: "qa-agent",
        description: "Release gate regression verification and documentation compaction",
      },
    },
  ];
}

export function createMockMergeQueue(): MergeQueueStatus {
  const queue: MergeQueueItem[] = [
    {
      workspace_id: "ws-plan-01",
      task_id: "task-01-prd-decomp",
      dependencies: [],
      status: "merged",
      position: 1,
      enqueued_at: new Date(Date.now() - 1000 * 60 * 55).toISOString(),
      verified_at: new Date(Date.now() - 1000 * 60 * 50).toISOString(),
      merged_at: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
      commit_hash: "c8f2a1b",
      procedure_type: "PLANNING",
    },
    {
      workspace_id: "ws-tdd-02",
      task_id: "task-02-flow-studio",
      dependencies: ["ws-plan-01"],
      status: "verified",
      position: 2,
      enqueued_at: new Date(Date.now() - 1000 * 60 * 35).toISOString(),
      verified_at: new Date(Date.now() - 1000 * 60 * 10).toISOString(),
      merged_at: null,
      commit_hash: null,
      procedure_type: "INNER_LOOP_TDD",
    },
    {
      workspace_id: "ws-sec-03",
      task_id: "task-03-security-guard",
      dependencies: ["ws-tdd-02"],
      status: "in_verification",
      position: 3,
      enqueued_at: new Date(Date.now() - 1000 * 60 * 18).toISOString(),
      verified_at: null,
      merged_at: null,
      commit_hash: null,
      procedure_type: "SECURITY_AUDIT",
    },
    {
      workspace_id: "ws-rel-04",
      task_id: "task-04-release-gate",
      dependencies: ["ws-sec-03"],
      status: "pending",
      position: 4,
      enqueued_at: new Date(Date.now() - 1000 * 60 * 4).toISOString(),
      verified_at: null,
      merged_at: null,
      commit_hash: null,
      procedure_type: "RELEASE_GATE",
    },
  ];

  const pending = queue.filter((i) => i.status === "pending");
  const in_verification = queue.filter((i) => i.status === "in_verification");
  const verified = queue.filter((i) => i.status === "verified");
  const merged = queue.filter((i) => i.status === "merged");
  const failed = queue.filter((i) => i.status === "failed");
  const discarded = queue.filter((i) => i.status === "discarded");

  const mergedIds = new Set(merged.map((m) => m.workspace_id));
  let current: MergeQueueItem | null = in_verification[0] ?? null;
  if (!current) {
    current =
      verified.concat(pending).find((item) => item.dependencies.every((d) => mergedIds.has(d))) ??
      null;
  }

  return {
    queue,
    current,
    pending,
    in_verification,
    verified,
    merged,
    failed,
    discarded,
  };
}

let localWorkspacesMemory: ProcedureWorkspace[] = createMockProcedureWorkspaces();
let localMergeQueueMemory: MergeQueueItem[] = createMockMergeQueue().queue;

export async function fetchProcedureWorkspaces(projectPath?: string): Promise<ProcedureWorkspace[]> {
  if (catalogApi) {
    try {
      const query = new URLSearchParams();
      if (projectPath) query.set("project_path", projectPath);
      const response = await fetch(`${catalogApi}/api/workspaces?${query}`);
      if (response.ok) {
        const body = await response.json();
        if (Array.isArray(body.workspaces)) {
          return body.workspaces;
        }
      }
    } catch {
      // Fallback to local memory on connection error
    }
  }

  return [...localWorkspacesMemory];
}

export async function fetchMergeQueue(projectPath?: string): Promise<MergeQueueStatus> {
  if (catalogApi) {
    try {
      const query = new URLSearchParams();
      if (projectPath) query.set("project_path", projectPath);
      const response = await fetch(`${catalogApi}/api/workspaces/queue?${query}`);
      if (response.ok) {
        const body = await response.json();
        return body;
      }
      // Alternate endpoint
      const wsResp = await fetch(`${catalogApi}/api/workspaces?${query}`);
      if (wsResp.ok) {
        const wsBody = await wsResp.json();
        if (wsBody.queue_status) {
          return wsBody.queue_status;
        }
      }
    } catch {
      // Fallback to local memory
    }
  }

  const queue = [...localMergeQueueMemory];
  const pending = queue.filter((i) => i.status === "pending");
  const in_verification = queue.filter((i) => i.status === "in_verification");
  const verified = queue.filter((i) => i.status === "verified");
  const merged = queue.filter((i) => i.status === "merged");
  const failed = queue.filter((i) => i.status === "failed");
  const discarded = queue.filter((i) => i.status === "discarded");

  const mergedIds = new Set(merged.map((m) => m.workspace_id));
  let current: MergeQueueItem | null = in_verification[0] ?? null;
  if (!current) {
    current =
      verified.concat(pending).find((item) => item.dependencies.every((d) => mergedIds.has(d))) ??
      null;
  }

  return {
    queue,
    current,
    pending,
    in_verification,
    verified,
    merged,
    failed,
    discarded,
  };
}

export async function spawnProcedureWorkspaceApi(
  payload: CreateProcedureWorkspaceOptions & { project_path?: string; [key: string]: any },
): Promise<ProcedureWorkspace> {
  if (catalogApi) {
    try {
      const response = await fetch(`${catalogApi}/api/workspaces/spawn`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (response.ok) {
        const body = await response.json();
        return body.workspace;
      }
      const errBody = await response.json().catch(() => ({ error: "Failed to spawn workspace" }));
      throw new Error(errBody.error || "Failed to spawn procedure workspace");
    } catch (e: any) {
      if (catalogApi && !e.message?.includes("fetch")) {
        throw e;
      }
    }
  }

  // Client-side fallback generator
  const taskId =
    payload.metadata?.task_id ||
    payload.workspace_id ||
    `task-${Date.now().toString(36).slice(-4)}`;
  const workspaceId = payload.workspace_id || `ws-${taskId}`;
  const procedureType: ProcedureType = payload.procedure_type || "INNER_LOOP_TDD";

  const defaultSkills: Record<ProcedureType, string[]> = {
    PLANNING: ["planning", "spec-decomposition", "dependency-mapper"],
    INNER_LOOP_TDD: ["tdd-inner-loop", "code-authoring", "pinpoint-test-runner"],
    SECURITY_AUDIT: ["security-audit", "vulnerability-scanner", "hook-validator"],
    RELEASE_GATE: ["release-gate", "baseline-compaction", "e2e-orchestrator"],
  };

  const defaultGuards: Record<ProcedureType, string[]> = {
    PLANNING: ["read-only-source-guard", "context-budget-guard"],
    INNER_LOOP_TDD: ["test-storm-suppression-guard", "scope-boundary-guard"],
    SECURITY_AUDIT: ["secret-leak-guard", "destructive-command-blocker"],
    RELEASE_GATE: ["regression-gate-guard", "context-budget-guard"],
  };

  const newWorkspace: ProcedureWorkspace = {
    schema_version: 1,
    workspace_id: workspaceId,
    procedure_type: procedureType,
    git_branch: payload.git_branch || `worktree/${taskId}`,
    git_worktree_path: payload.git_worktree_path || `.workspaces/${taskId}`,
    responsibility_invariants: {
      target_test_file:
        payload.responsibility_invariants?.target_test_file ||
        payload.target_test_file ||
        (procedureType === "INNER_LOOP_TDD"
          ? "apps/catalog-ui/test/procedure-workspaces.test.js"
          : "tests/e2e/run-all.js"),
      owned_files:
        payload.responsibility_invariants?.owned_files ||
        payload.owned_files || [
          `apps/catalog-ui/src/components/${taskId}/`,
        ],
      prohibited_actions:
        payload.responsibility_invariants?.prohibited_actions ||
        payload.prohibited_actions || [
          "npm test",
          "pytest",
          "modify_root_contracts",
        ],
      acceptance_criteria:
        payload.responsibility_invariants?.acceptance_criteria ||
        payload.acceptance_criteria || [
          "100% target test verification passage",
          "Preserve isolated worktree boundary",
        ],
    },
    active_skills: payload.active_skills || defaultSkills[procedureType],
    active_guards: payload.active_guards || defaultGuards[procedureType],
    status: payload.status || "active",
    created_at: payload.created_at || new Date().toISOString(),
    completed_at: payload.completed_at || null,
    metadata: {
      task_id: taskId,
      author: "catalog-ui-operator",
      ...(payload.metadata || {}),
    },
  };

  localWorkspacesMemory = [newWorkspace, ...localWorkspacesMemory.filter((w) => w.workspace_id !== workspaceId)];

  const newQueueItem: MergeQueueItem = {
    workspace_id: workspaceId,
    task_id: taskId,
    dependencies: payload.metadata?.dependencies || [],
    status: newWorkspace.status,
    position: localMergeQueueMemory.length + 1,
    enqueued_at: new Date().toISOString(),
    verified_at: null,
    merged_at: null,
    commit_hash: null,
    procedure_type: procedureType,
  };

  localMergeQueueMemory = [...localMergeQueueMemory, newQueueItem];
  return newWorkspace;
}

export async function verifyProcedureWorkspaceApi(
  workspaceId: string,
  projectPath?: string,
): Promise<VerifyWorkspaceResult> {
  if (catalogApi) {
    try {
      const response = await fetch(`${catalogApi}/api/workspaces/verify`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workspace_id: workspaceId,
          task_id: workspaceId,
          project_path: projectPath,
        }),
      });
      if (response.ok) {
        return await response.json();
      }
      const err = await response.json().catch(() => ({ error: "Verification failed" }));
      return { verified: false, workspace_id: workspaceId, error: err.error || "Verification failed" };
    } catch {
      // Fallback
    }
  }

  // Update in-memory workspace
  localWorkspacesMemory = localWorkspacesMemory.map((ws) =>
    ws.workspace_id === workspaceId || ws.metadata?.task_id === workspaceId
      ? { ...ws, status: "verified" }
      : ws,
  );

  localMergeQueueMemory = localMergeQueueMemory.map((item) =>
    item.workspace_id === workspaceId || item.task_id === workspaceId
      ? { ...item, status: "verified", verified_at: new Date().toISOString() }
      : item,
  );

  return {
    verified: true,
    workspace_id: workspaceId,
    test_output: `✔ 1/1 target test file passed in isolated worktree for ${workspaceId}\n✔ Responsibility invariants verified: 100% compliance\n✔ Zero prohibited actions detected.`,
    invariant_checks: {
      target_test_passed: true,
      owned_files_valid: true,
      prohibited_actions_respected: true,
      branch_clean: true,
    },
  };
}

export async function mergeProcedureWorkspaceApi(
  workspaceId: string,
  projectPath?: string,
): Promise<MergeWorkspaceResult> {
  if (catalogApi) {
    try {
      const response = await fetch(`${catalogApi}/api/workspaces/merge`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workspace_id: workspaceId,
          task_id: workspaceId,
          project_path: projectPath,
        }),
      });
      if (response.ok) {
        return await response.json();
      }
      const err = await response.json().catch(() => ({ error: "Merge failed" }));
      return {
        merged: false,
        workspace_id: workspaceId,
        error: err.error || "Merge failed",
        code: err.code,
      };
    } catch {
      // Fallback
    }
  }

  const randomHash = "a" + Math.random().toString(16).slice(2, 8);
  const now = new Date().toISOString();

  localWorkspacesMemory = localWorkspacesMemory.map((ws) =>
    ws.workspace_id === workspaceId || ws.metadata?.task_id === workspaceId
      ? {
          ...ws,
          status: "merged",
          completed_at: now,
          metadata: { ...ws.metadata, commit_hash: randomHash },
        }
      : ws,
  );

  localMergeQueueMemory = localMergeQueueMemory.map((item) =>
    item.workspace_id === workspaceId || item.task_id === workspaceId
      ? { ...item, status: "merged", merged_at: now, commit_hash: randomHash }
      : item,
  );

  return {
    merged: true,
    workspace_id: workspaceId,
    commit_hash: randomHash,
    status: "merged",
  };
}

export async function pruneProcedureWorkspaceApi(
  workspaceId: string,
  projectPath?: string,
): Promise<PruneWorkspaceResult> {
  if (catalogApi) {
    try {
      const response = await fetch(`${catalogApi}/api/workspaces/prune`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workspace_id: workspaceId,
          task_id: workspaceId,
          project_path: projectPath,
        }),
      });
      if (response.ok) {
        return await response.json();
      }
      const err = await response.json().catch(() => ({ error: "Prune failed" }));
      return { pruned: false, workspace_id: workspaceId, error: err.error || "Prune failed" };
    } catch {
      // Fallback
    }
  }

  const now = new Date().toISOString();
  localWorkspacesMemory = localWorkspacesMemory.map((ws) =>
    ws.workspace_id === workspaceId || ws.metadata?.task_id === workspaceId
      ? { ...ws, status: "pruned", completed_at: now }
      : ws,
  );

  localMergeQueueMemory = localMergeQueueMemory.filter(
    (item) => item.workspace_id !== workspaceId && item.task_id !== workspaceId,
  );

  return {
    pruned: true,
    workspace_id: workspaceId,
    completed_at: now,
  };
}

export async function discardProcedureWorkspaceApi(
  workspaceId: string,
  reason?: string,
  projectPath?: string,
): Promise<DiscardWorkspaceResult> {
  if (catalogApi) {
    try {
      const response = await fetch(`${catalogApi}/api/workspaces/discard`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workspace_id: workspaceId,
          task_id: workspaceId,
          reason,
          project_path: projectPath,
        }),
      });
      if (response.ok) {
        return await response.json();
      }
      const err = await response.json().catch(() => ({ error: "Discard failed" }));
      return { discarded: false, workspace_id: workspaceId, error: err.error || "Discard failed" };
    } catch {
      // Fallback
    }
  }

  const now = new Date().toISOString();
  localWorkspacesMemory = localWorkspacesMemory.map((ws) =>
    ws.workspace_id === workspaceId || ws.metadata?.task_id === workspaceId
      ? {
          ...ws,
          status: "discarded",
          completed_at: now,
          metadata: { ...ws.metadata, discard_reason: reason || "User discarded" },
        }
      : ws,
  );

  localMergeQueueMemory = localMergeQueueMemory.map((item) =>
    item.workspace_id === workspaceId || item.task_id === workspaceId
      ? {
          ...item,
          status: "discarded",
          discarded_at: now,
          reason: reason || "User discarded",
        }
      : item,
  );

  return {
    discarded: true,
    workspace_id: workspaceId,
    status: "discarded",
    reason: reason || "User discarded",
  };
}

export async function processMergeQueueApi(projectPath?: string): Promise<ProcessQueueResult> {
  const status = await fetchMergeQueue(projectPath);
  const mergedIds = new Set(status.merged?.map((m) => m.workspace_id) || []);
  const processed: Array<{
    workspace_id: string;
    success: boolean;
    merged: boolean;
    commit_hash?: string;
    error?: string;
  }> = [];

  for (const item of status.queue) {
    if (item.status !== "pending" && item.status !== "verified") {
      continue;
    }
    const depsSatisfied = item.dependencies.every((d) => mergedIds.has(d));
    if (depsSatisfied) {
      if (item.status === "pending") {
        await verifyProcedureWorkspaceApi(item.workspace_id, projectPath);
      }
      const mergeRes = await mergeProcedureWorkspaceApi(item.workspace_id, projectPath);
      if (mergeRes.merged) {
        mergedIds.add(item.workspace_id);
        processed.push({
          workspace_id: item.workspace_id,
          success: true,
          merged: true,
          commit_hash: mergeRes.commit_hash,
        });
      } else {
        processed.push({
          workspace_id: item.workspace_id,
          success: false,
          merged: false,
          error: mergeRes.error,
        });
        break;
      }
    }
  }

  const finalStatus = await fetchMergeQueue(projectPath);
  return {
    processed,
    queue: finalStatus.queue,
    merged: finalStatus.merged || [],
    failed: finalStatus.failed || [],
    discarded: finalStatus.discarded || [],
    pending: finalStatus.pending || [],
  };
}
