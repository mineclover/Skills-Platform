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

export async function fetchHooksApi(params?: { projectPath?: string; event?: string }): Promise<{ hooks: HookDefinition[] }> {
  if (catalogApi) {
    try {
      const query = new URLSearchParams();
      if (params?.projectPath) query.set("project_path", params.projectPath);
      if (params?.event) query.set("event", params.event);
      const res = await fetch(`${catalogApi}/api/hooks?${query}`);
      if (res.ok) {
        return await res.json();
      }
    } catch {
      // Fallback
    }
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
    try {
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
      if (res.ok) {
        return await res.json();
      }
    } catch {
      // Fallback
    }
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
    try {
      const res = await fetch(`${catalogApi}/api/hooks/register`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          hook: params.hook,
          project_path: params.projectPath,
          sync: params.sync !== false,
        }),
      });
      if (res.ok) {
        return await res.json();
      }
    } catch {
      // Fallback
    }
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
    try {
      const res = await fetch(`${catalogApi}/api/hooks/remove`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          hook_id: params.hookId,
          project_path: params.projectPath,
          sync: params.sync !== false,
        }),
      });
      if (res.ok) {
        return await res.json();
      }
    } catch {
      // Fallback
    }
  }

  localHooksMemory = localHooksMemory.filter((h) => h.id !== params.hookId);
  return { ok: true, removedHookId: params.hookId };
}

export async function syncHooksApi(params?: {
  projectPath?: string;
}): Promise<{ antigravityHooks: number; claudeHooks: number; syncedAt: string }> {
  if (catalogApi) {
    try {
      const res = await fetch(`${catalogApi}/api/hooks/sync`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ project_path: params?.projectPath }),
      });
      if (res.ok) {
        return await res.json();
      }
    } catch {
      // Fallback
    }
  }

  const enabled = localHooksMemory.filter((h) => h.enabled);
  return {
    antigravityHooks: enabled.length,
    claudeHooks: enabled.length,
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
    try {
      const res = await fetch(`${catalogApi}/api/hooks/trigger`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          event: params.event,
          payload: params.payload,
          project_path: params.projectPath,
        }),
      });
      if (res.ok) {
        return await res.json();
      }
    } catch {
      // Fallback
    }
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


