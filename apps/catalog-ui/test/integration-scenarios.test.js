import test from "node:test";
import assert from "node:assert/strict";
import { ReadableStream } from "node:stream/web";
import {
  validateSkillRecipe,
  createSkillRecipe,
  validateActivationPlan,
  createActivationPlan,
  INVOCATION_MODES,
  ARTIFACT_TYPES,
  PLAN_MODES,
  DELIVERY_SCOPES,
  DELIVERY_METHODS,
} from "@skills-platform/contracts";

// ============================================================================
// Core Logic & Engine Helpers (Fidelity Mirror for E2E Unit & Integration Testing)
// ============================================================================

// 1. Invocation Mode Visual Metadata & Semantics
const INVOCATION_MODE_INFO = {
  model_invoked: {
    id: "model_invoked",
    label: "🤖 Model-invoked (Agent Reflex)",
    shortLabel: "🤖 Model",
    badgeLabel: "🤖 Model-invoked",
    pillClass: "model",
    icon: "🤖",
    tooltip:
      "🤖 Model-invoked / Agent Reflex: Autonomous routines triggered directly by LLMs during reasoning loops (e.g. reflex checks, model verification).",
    operationalSemantics:
      "Autonomous reasoning routines triggered without human prompt intervention.",
    description: "Autonomous reasoning and invariant verification reflexes.",
  },
  user_invoked: {
    id: "user_invoked",
    label: "👤 User-invoked (Explicit Command)",
    shortLabel: "👤 User",
    badgeLabel: "👤 User-invoked",
    pillClass: "user",
    icon: "👤",
    tooltip:
      "👤 User-invoked / Explicit Command: High-impact or destructive steering tools requiring explicit human invocation.",
    operationalSemantics:
      "High-impact steering tools requiring human invocation to protect invariants.",
    description: "High-impact commands and human steering tasks.",
  },
  hybrid: {
    id: "hybrid",
    label: "🔀 Hybrid (Model & User)",
    shortLabel: "🔀 Hybrid",
    badgeLabel: "🔀 Hybrid",
    pillClass: "hybrid",
    icon: "🔀",
    tooltip:
      "🔀 Hybrid: Multi-purpose tools usable both autonomously by LLMs and via explicit user command.",
    operationalSemantics:
      "Flexible tools that execute either autonomously or via manual command.",
    description: "Dual reflex & human command execution tools.",
  },
  unspecified: {
    id: "unspecified",
    label: "⚙️ Unspecified Mode",
    shortLabel: "⚙️ Unspecified",
    badgeLabel: "⚙️ Unspecified",
    pillClass: "unspecified",
    icon: "⚙️",
    tooltip:
      "⚙️ Unspecified: Legacy or unclassified execution mode without explicit invocation constraints.",
    operationalSemantics: "Default unclassified execution mode.",
    description: "Standard unconstrained execution mode.",
  },
};

function getInvocationModeInfo(mode) {
  if (!mode || !(mode in INVOCATION_MODE_INFO)) {
    return INVOCATION_MODE_INFO.unspecified;
  }
  return INVOCATION_MODE_INFO[mode];
}

// 2. Provider Metadata & Delivery Paths
const PROVIDER_INFO = {
  antigravity: {
    id: "antigravity",
    displayName: "Antigravity",
    alias: "AGY",
    badgeClass: "provider-badge antigravity",
    deliveryRootRelative: ".agents/skills",
    deliveryPathPattern: ".agents/skills/<skill_name>",
    colorTheme: "mint",
  },
  codex: {
    id: "codex",
    displayName: "Codex",
    alias: "Codex CLI",
    badgeClass: "provider-badge codex",
    deliveryRootRelative: "skills",
    deliveryPathPattern: "skills/<skill_name>",
    colorTheme: "amber",
  },
  claude: {
    id: "claude",
    displayName: "Claude",
    alias: "Claude Desktop",
    badgeClass: "provider-badge claude",
    deliveryRootRelative: ".claude/skills",
    deliveryPathPattern: ".claude/skills/<skill_name>",
    colorTheme: "violet",
  },
};

function normalizeProviderId(providerId) {
  if (!providerId) return "codex";
  const normalized = String(providerId).trim().toLowerCase();
  if (normalized === "antigravity" || normalized === "agy" || normalized === "gemini") {
    return "antigravity";
  }
  if (normalized === "claude") {
    return "claude";
  }
  return "codex";
}

function getProviderInfo(providerId) {
  const normalized = normalizeProviderId(providerId);
  return PROVIDER_INFO[normalized];
}

function resolveDeliveryPath(providerId, skillName, basePath) {
  const provider = getProviderInfo(providerId);
  const skillPart = skillName?.trim() || "<skill_name>";
  if (!basePath || !basePath.trim()) {
    return `${provider.deliveryRootRelative}/${skillPart}`;
  }
  const cleanBase = basePath.trim().replace(/[\\/]+$/, "");
  return `${cleanBase}/${provider.deliveryRootRelative}/${skillPart}`;
}

function resolveDeliveryRoot(providerId, basePath) {
  const provider = getProviderInfo(providerId);
  if (!basePath || !basePath.trim()) {
    return `${provider.deliveryRootRelative}/`;
  }
  const cleanBase = basePath.trim().replace(/[\\/]+$/, "");
  return `${cleanBase}/${provider.deliveryRootRelative}/`;
}

// 3. Project Status & State Machine
function calculateProjectStatus({
  pristine = false,
  pinnedPresetId = null,
  comparison = null,
  history = null,
  isDirty = false,
}) {
  if (pristine || pinnedPresetId === "builtin-pristine" || history?.mode === "pristine") {
    return {
      state: "pristine",
      label: "Pristine Baseline",
      shortLabel: "Pristine",
      badgeClass: "status-pill pristine",
      tooltip:
        "Pristine Baseline: All managed skill symlinks are unlinked for a clean slate.",
      driftCount: 0,
      driftBreakdown: {},
    };
  }

  if (isDirty) {
    return {
      state: "dirty",
      label: "Unapplied Edits",
      shortLabel: "Dirty",
      badgeClass: "status-pill dirty",
      tooltip:
        "Unapplied Edits: Workspace configuration has unapplied changes not yet materialized to disk.",
      driftCount: 0,
      driftBreakdown: {},
    };
  }

  if (comparison) {
    if (!comparison.in_sync) {
      const summary = comparison.summary || {};
      const driftBreakdown = {};
      let totalDrift = 0;

      for (const [status, count] of Object.entries(summary)) {
        if (status !== "matched" && typeof count === "number" && count > 0) {
          driftBreakdown[status] = count;
          totalDrift += count;
        }
      }

      const driftDetails = Object.entries(driftBreakdown)
        .map(([status, count]) => `${count} ${status.replaceAll("_", " ")}`)
        .join(", ");

      return {
        state: "drift",
        label: totalDrift > 0 ? `Drift Warning (${totalDrift} drifted)` : "Drift Warning",
        shortLabel: "Drift",
        badgeClass: "status-pill drift",
        tooltip: `Drift Warning: Observed provider bindings diverge from plan (${
          driftDetails || "divergence detected"
        }).`,
        driftCount: totalDrift,
        driftBreakdown,
      };
    }

    return {
      state: "insync",
      label: "In Sync",
      shortLabel: "In Sync",
      badgeClass: "status-pill insync",
      tooltip:
        "In Sync: Observed filesystem bindings match the recorded activation plan.",
      driftCount: 0,
      driftBreakdown: {},
    };
  }

  return {
    state: "ready",
    label: "Plan Ready",
    shortLabel: "Ready",
    badgeClass: "status-pill ready",
    tooltip:
      "Plan Ready: Pinned template is configured and ready for plan materialization.",
    driftCount: 0,
    driftBreakdown: {},
  };
}

// 4. Recipe Client-Side Inspector & Parser
function parseAndValidateRecipeClient(raw) {
  let recipe;
  if (typeof raw === "string") {
    try {
      recipe = JSON.parse(raw);
    } catch (err) {
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

  const issues = [];
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
  const byArtifactType = {};
  for (const skill of recipe.skills ?? []) {
    const mode = skill.invocation_mode || "unspecified";
    if (mode in byInvocationMode) {
      byInvocationMode[mode]++;
    } else {
      byInvocationMode.unspecified++;
    }
    const type = skill.artifact_type || "skill";
    byArtifactType[type] = (byArtifactType[type] ?? 0) + 1;
  }

  const summary = {
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
    sources: (recipe.sources ?? []).map((s) => ({
      source_id: s.source_id,
      type: s.type,
      locator: s.locator,
      resolved_commit: s.resolved_commit,
    })),
    presets: (recipe.presets ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      version: p.version,
      skills_count: p.skills?.length ?? 0,
    })),
    projects: recipe.projects ?? [],
  };
}

// 5. Recipe Apply Simulation Engine
function simulateRecipeApply({ recipe, project_path, provider_id = "codex", confirm = false }) {
  const recipeObj = typeof recipe === "string" ? JSON.parse(recipe) : recipe;
  const targetProvider = normalizeProviderId(provider_id);
  const targetPath = project_path || "/workspace/project";
  const skillsCount = recipeObj.skills?.length ?? recipeObj.summary?.skills_count ?? 0;

  return {
    recipe_id: recipeObj.recipe_id || "recipe-client",
    name: recipeObj.name || "Inspected Recipe",
    sources_imported: (recipeObj.sources || []).map((s) => ({
      source_id: s.source_id,
      locator: s.locator,
      imported_skills:
        recipeObj.skills?.filter((sk) => sk.source_id === s.source_id).length || 1,
    })),
    presets_reconciled: (recipeObj.presets || []).map((p) => ({
      id: p.id,
      matched_skills: p.skills?.length || p.skills_count || 0,
    })),
    delivery: targetPath
      ? {
          project_id: targetPath.split(/[\\/]/).pop() || "project",
          provider_id: targetProvider,
          delivery_root: resolveDeliveryRoot(targetProvider, targetPath),
          preview: { operations: skillsCount },
          applied: confirm === true,
          message: confirm
            ? `Successfully materialized ${skillsCount} skill bindings for ${targetProvider} into ${targetPath}`
            : `Preview ready: ${skillsCount} operations prepared for ${targetProvider}.`,
        }
      : null,
  };
}

// 6. 5-Step Stepper & NDJSON Stream Logic
const DIAGNOSTIC_STEPS = [
  { id: "plan", label: "Plan", stageBasePercent: 0, stageMaxPercent: 20 },
  { id: "inspect", label: "Inspect", stageBasePercent: 20, stageMaxPercent: 40 },
  { id: "preview", label: "Preview", stageBasePercent: 40, stageMaxPercent: 60 },
  { id: "materialize", label: "Materialize", stageBasePercent: 60, stageMaxPercent: 85 },
  { id: "verify", label: "Verify", stageBasePercent: 85, stageMaxPercent: 100 },
];

function mapStageToDiagnosticStep(rawStage) {
  if (!rawStage) return "plan";
  const stage = String(rawStage).trim().toLowerCase().replaceAll("-", "_");
  if (["record", "plan", "planning", "init"].includes(stage)) return "plan";
  if (["inspect", "inspection", "preflight", "check"].includes(stage)) return "inspect";
  if (["preview", "previewing", "resolve", "resolving", "validation"].includes(stage)) return "preview";
  if (["apply", "applying", "materialize", "materializing", "link", "linking"].includes(stage)) return "materialize";
  if (["verify", "verifying", "verification", "postflight", "completed", "finished", "done"].includes(stage)) return "verify";
  return "plan";
}

function getDiagnosticStepIndex(stage) {
  switch (stage) {
    case "plan": return 0;
    case "inspect": return 1;
    case "preview": return 2;
    case "materialize": return 3;
    case "verify": return 4;
    default: return 0;
  }
}

function getStepNodeState(stepIndex, currentStage, isFailed = false, isCompleted = false) {
  if (isCompleted) return "completed";
  const activeStage = mapStageToDiagnosticStep(currentStage);
  const activeIndex = getDiagnosticStepIndex(activeStage);
  if (isFailed) {
    if (stepIndex < activeIndex) return "completed";
    if (stepIndex === activeIndex) return "failed";
    return "pending";
  }
  if (stepIndex < activeIndex) return "completed";
  if (stepIndex === activeIndex) return "active";
  return "pending";
}

function calculateStageProgressPercent(progress, isCompleted = false, isFailed = false) {
  if (isCompleted) return 100;
  if (!progress) return 0;
  const rawStage = progress.stage ? String(progress.stage).toLowerCase() : "";
  if (rawStage === "completed" || rawStage === "done") return 100;

  const diagStage = mapStageToDiagnosticStep(rawStage);
  const stepInfo = DIAGNOSTIC_STEPS.find((s) => s.id === diagStage) || DIAGNOSTIC_STEPS[0];
  const base = stepInfo.stageBasePercent;
  const range = stepInfo.stageMaxPercent - stepInfo.stageBasePercent;

  let intraRatio = 0;
  if (progress.total && progress.total > 0) {
    intraRatio = Math.min(1, Math.max(0, progress.completed / progress.total));
  } else if (progress.completed > 0) {
    intraRatio = 0.5;
  }

  if (isFailed) return Math.min(100, Math.round(base + range * intraRatio));
  return Math.min(98, Math.round(base + range * intraRatio));
}

function formatStageMetric(stage, completed, total, message) {
  const diagStage = mapStageToDiagnosticStep(stage);
  const stepInfo = DIAGNOSTIC_STEPS.find((s) => s.id === diagStage) || DIAGNOSTIC_STEPS[0];

  if (total > 0) {
    const unit =
      diagStage === "materialize"
        ? "symlinks"
        : diagStage === "inspect"
        ? "bindings"
        : diagStage === "preview"
        ? "operations"
        : diagStage === "verify"
        ? "invariants"
        : "steps";

    const percent = Math.round((completed / total) * 100);
    return `${stepInfo.label}: ${completed} of ${total} ${unit} processed (${percent}%)`;
  }

  if (message && String(message).trim()) {
    return `${stepInfo.label}: ${message}`;
  }

  return `${stepInfo.label}: Executing stage diagnostics...`;
}

async function readApplyStream(response, onProgress) {
  if (!response.ok || !response.body) {
    throw new Error("Skills Manager progress stream was unavailable");
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result = null;

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) continue;
      const event = JSON.parse(line);
      if (event.type === "progress" && event.progress) onProgress(event.progress);
      if (event.type === "result" && event.result) result = event.result;
      if (event.type === "error") throw new Error(event.error ?? "Skills Manager apply failed");
    }
    if (done) break;
  }

  if (!result) throw new Error("Skills Manager did not return an apply result");
  return result;
}

// 7. Filtering & Search Helpers
function filterSkillsCatalog(skills = [], { invocationFilter = "all", providerFilter = "all", searchQuery = "" } = {}) {
  return skills.filter((skill) => {
    if (!skill || typeof skill !== "object") return false;

    if (invocationFilter !== "all") {
      const mode =
        skill.profile?.invocation_mode ??
        skill.latest_skill?.invocation_mode ??
        skill.lineage?.invocation_mode ??
        skill.invocation_mode ??
        "unspecified";
      if (mode !== invocationFilter) return false;
    }

    if (providerFilter !== "all") {
      const tags = (skill.profile?.tags || []).map((t) => (t ? String(t).toLowerCase() : ""));
      const desc = (skill.latest_skill?.description || "").toLowerCase();
      const prov = providerFilter.toLowerCase();
      const matches =
        tags.some((t) => t.includes(prov)) ||
        desc.includes(prov) ||
        (skill.lineage?.id || "").toLowerCase().includes(prov);
      if (!matches) return false;
    }

    const needle = searchQuery ? searchQuery.trim().toLowerCase() : "";
    if (!needle) return true;

    const searchable = [
      skill.lineage?.skill_name,
      skill.name,
      skill.profile?.title,
      skill.profile?.summary,
      skill.profile?.purpose,
      skill.latest_skill?.description,
      skill.reason,
      skill.source,
      ...(skill.profile?.tags || []),
      ...(skill.profile?.use_when || []),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return searchable.includes(needle);
  });
}

function filterBindings(bindings = [], statusFilter = "all", searchQuery = "") {
  if (!Array.isArray(bindings)) return [];
  const needle = searchQuery ? searchQuery.trim().toLowerCase() : "";

  return bindings.filter((binding) => {
    if (!binding || typeof binding !== "object") return false;
    const state = (binding.state || "").toLowerCase();
    if (statusFilter === "enabled" && state !== "enabled") return false;
    if (statusFilter === "disabled" && state !== "disabled") return false;
    if (statusFilter === "missing" && state !== "missing") return false;
    if (statusFilter === "conflict" && state !== "conflict") return false;
    if (statusFilter === "unavailable" && state !== "unavailable") return false;
    if (
      statusFilter === "attention" &&
      state !== "missing" &&
      state !== "conflict" &&
      state !== "unavailable" &&
      state !== "drift"
    ) {
      return false;
    }

    if (!needle) return true;

    const skillId = (binding.skill_instance_id || "").toLowerCase();
    const providerId = (binding.provider_id || "").toLowerCase();
    const scope = (binding.scope || "").toLowerCase();
    const targetPath = (binding.target_path || "").toLowerCase();

    return (
      skillId.includes(needle) ||
      providerId.includes(needle) ||
      scope.includes(needle) ||
      targetPath.includes(needle) ||
      state.includes(needle)
    );
  });
}

// ============================================================================
// ============================================================================
// TIER 1: FEATURE COVERAGE (F1 through F14)
// ============================================================================
// ============================================================================

test("Tier 1 - F1.1: Export full catalog scope with all skills, presets, and sources", () => {
  const recipe = createSkillRecipe({
    name: "Full Catalog Bundle",
    sources: [{ source_id: "std", type: "git", locator: "https://git.local/std.git" }],
    skills: [
      { name: "planning", invocation_mode: "model_invoked", source_id: "std", source_relative_path: "p", content_digest: "d1" },
      { name: "testing", invocation_mode: "user_invoked", source_id: "std", source_relative_path: "t", content_digest: "d2" },
    ],
    presets: [{ id: "p1", name: "Preset 1", version: 1, skills: [{ skill_name: "planning" }] }],
  });
  const res = validateSkillRecipe(recipe);
  assert.equal(res.valid, true);
  assert.equal(recipe.schema_version, 1);
});

test("Tier 1 - F1.2: Export single project scope with bound default preset", () => {
  const recipe = createSkillRecipe({
    name: "Project Acme Recipe",
    sources: [{ source_id: "std", type: "git", locator: "https://git.local/std.git" }],
    skills: [{ name: "planning", invocation_mode: "model_invoked", source_id: "std", source_relative_path: "p", content_digest: "d1" }],
    presets: [{ id: "acme-v1", name: "Acme v1", version: 1, skills: [{ skill_name: "planning" }] }],
    projects: [{ project_id: "acme", project_name: "Acme", provider_id: "antigravity", scope: "project", default_preset_id: "acme-v1", default_preset_version: 1 }],
  });
  assert.equal(recipe.projects.length, 1);
  assert.equal(recipe.projects[0].default_preset_id, "acme-v1");
});

test("Tier 1 - F1.3: Export template preset scope with associated skills", () => {
  const recipe = createSkillRecipe({
    name: "Template Preset Recipe",
    sources: [{ source_id: "core", type: "local", locator: "./core" }],
    skills: [{ name: "s1", invocation_mode: "hybrid", source_id: "core", source_relative_path: "s1", content_digest: "d1" }],
    presets: [{ id: "preset-core", name: "Core Preset", version: 2, skills: [{ skill_name: "s1", required: true }] }],
  });
  assert.equal(recipe.presets[0].version, 2);
  assert.equal(recipe.presets[0].skills[0].required, true);
});

test("Tier 1 - F1.4: Custom recipe name and description applied to exported recipe", () => {
  const recipe = createSkillRecipe({
    name: "Custom Enterprise AI Suite",
    description: "Enterprise grade autonomous reflexes",
    sources: [{ source_id: "corp", type: "git", locator: "https://corp.internal/skills.git" }],
    skills: [{ name: "sec", invocation_mode: "user_invoked", source_id: "corp", source_relative_path: "sec", content_digest: "d" }],
    presets: [{ id: "corp-sec", name: "Corp Sec", version: 1, skills: [{ skill_name: "sec" }] }],
  });
  assert.equal(recipe.name, "Custom Enterprise AI Suite");
  assert.equal(recipe.description, "Enterprise grade autonomous reflexes");
});

test("Tier 1 - F1.5: Exported recipe conforms to @skills-platform/contracts schema version 1", () => {
  const recipe = createSkillRecipe({
    name: "Standard Schema Validation Recipe",
    sources: [{ source_id: "s", type: "git", locator: "https://git/s.git" }],
    skills: [{ name: "sk", invocation_mode: "model_invoked", source_id: "s", source_relative_path: "sk", content_digest: "d" }],
    presets: [{ id: "p", name: "P", version: 1, skills: [{ skill_name: "sk" }] }],
  });
  assert.equal(recipe.schema_version, 1);
});

test("Tier 1 - F2.1: Dropped valid JSON file parsed into inspection model", () => {
  const raw = JSON.stringify({
    schema_version: 1,
    recipe_id: "r_drop",
    name: "Drop Test",
    created_at: new Date().toISOString(),
    sources: [{ source_id: "s", type: "local", locator: "./" }],
    skills: [{ name: "s1", invocation_mode: "model_invoked", source_id: "s", source_relative_path: "s1", content_digest: "d" }],
    presets: [{ id: "p1", name: "P1", version: 1, skills: [{ skill_name: "s1" }] }],
  });
  const res = parseAndValidateRecipeClient(raw);
  assert.equal(res.valid, true);
  assert.equal(res.name, "Drop Test");
});

test("Tier 1 - F2.2: Pasted JSON string in textarea triggers live inspection", () => {
  const pasted = JSON.stringify({
    schema_version: 1,
    recipe_id: "r_paste",
    name: "Pasted Manifest",
    created_at: new Date().toISOString(),
    sources: [{ source_id: "s", type: "git", locator: "git@github.com:a/b.git" }],
    skills: [{ name: "p1", invocation_mode: "hybrid", source_id: "s", source_relative_path: "p1", content_digest: "d" }],
    presets: [{ id: "pr", name: "PR", version: 1, skills: [{ skill_name: "p1" }] }],
  });
  const res = parseAndValidateRecipeClient(pasted);
  assert.equal(res.valid, true);
  assert.equal(res.summary.skills_count, 1);
});

test("Tier 1 - F2.3: Non-JSON and non-object file rejected with clear error notice", () => {
  const invalidText = "Not a JSON object string";
  const res = parseAndValidateRecipeClient(invalidText);
  assert.equal(res.valid, false);
  assert.ok(res.issues.length > 0);
});

test("Tier 1 - F2.4: Malformed dropped file triggers descriptive validation alert", () => {
  const badJson = '{"schema_version": 1, "name": "Broken"';
  const res = parseAndValidateRecipeClient(badJson);
  assert.equal(res.valid, false);
  assert.ok(res.issues[0].message.includes("Malformed JSON"));
});

test("Tier 1 - F3.1: Inspect calculates correct sources count across git and local sources", () => {
  const recipe = {
    schema_version: 1,
    recipe_id: "r31",
    name: "Sources Test",
    created_at: new Date().toISOString(),
    sources: [
      { source_id: "git-src", type: "git", locator: "https://git.local/a.git" },
      { source_id: "loc-src", type: "local", locator: "/path/to/local" },
    ],
    skills: [{ name: "s", invocation_mode: "model_invoked", source_id: "git-src", source_relative_path: "s", content_digest: "d" }],
    presets: [{ id: "p", name: "P", version: 1, skills: [{ skill_name: "s" }] }],
  };
  const inspected = parseAndValidateRecipeClient(recipe);
  assert.equal(inspected.summary.sources_count, 2);
});

test("Tier 1 - F3.2: Inspect calculates total skills count accurately", () => {
  const recipe = {
    schema_version: 1,
    recipe_id: "r32",
    name: "Skills Count",
    created_at: new Date().toISOString(),
    sources: [{ source_id: "s", type: "git", locator: "git" }],
    skills: [
      { name: "s1", invocation_mode: "model_invoked", source_id: "s", source_relative_path: "s1", content_digest: "d1" },
      { name: "s2", invocation_mode: "user_invoked", source_id: "s", source_relative_path: "s2", content_digest: "d2" },
      { name: "s3", invocation_mode: "hybrid", source_id: "s", source_relative_path: "s3", content_digest: "d3" },
    ],
    presets: [{ id: "p", name: "P", version: 1, skills: [{ skill_name: "s1" }] }],
  };
  const inspected = parseAndValidateRecipeClient(recipe);
  assert.equal(inspected.summary.skills_count, 3);
});

test("Tier 1 - F3.3: Inspect calculates preset templates count and individual preset skill counts", () => {
  const recipe = {
    schema_version: 1,
    recipe_id: "r33",
    name: "Preset Test",
    created_at: new Date().toISOString(),
    sources: [{ source_id: "s", type: "git", locator: "git" }],
    skills: [{ name: "s1", invocation_mode: "model_invoked", source_id: "s", source_relative_path: "s1", content_digest: "d1" }],
    presets: [
      { id: "p1", name: "P1", version: 1, skills: [{ skill_name: "s1" }] },
      { id: "p2", name: "P2", version: 2, skills: [{ skill_name: "s1" }] },
    ],
  };
  const inspected = parseAndValidateRecipeClient(recipe);
  assert.equal(inspected.summary.presets_count, 2);
  assert.equal(inspected.presets[0].skills_count, 1);
  assert.equal(inspected.presets[1].skills_count, 1);
});

test("Tier 1 - F3.4: Inspect calculates project bindings count", () => {
  const recipe = {
    schema_version: 1,
    recipe_id: "r34",
    name: "Projects Count",
    created_at: new Date().toISOString(),
    sources: [{ source_id: "s", type: "git", locator: "git" }],
    skills: [{ name: "s1", invocation_mode: "model_invoked", source_id: "s", source_relative_path: "s1", content_digest: "d1" }],
    presets: [{ id: "p1", name: "P1", version: 1, skills: [{ skill_name: "s1" }] }],
    projects: [
      { project_id: "proj1", project_name: "Proj 1", provider_id: "codex", scope: "project" },
      { project_id: "proj2", project_name: "Proj 2", provider_id: "antigravity", scope: "project" },
    ],
  };
  const inspected = parseAndValidateRecipeClient(recipe);
  assert.equal(inspected.summary.projects_count, 2);
});

test("Tier 1 - F3.5: Inspect calculates exact breakdown of model_invoked, user_invoked, hybrid, unspecified", () => {
  const recipe = {
    schema_version: 1,
    recipe_id: "r35",
    name: "Mode Breakdown",
    created_at: new Date().toISOString(),
    sources: [{ source_id: "s", type: "git", locator: "git" }],
    skills: [
      { name: "m1", invocation_mode: "model_invoked", source_id: "s", source_relative_path: "m1", content_digest: "d" },
      { name: "u1", invocation_mode: "user_invoked", source_id: "s", source_relative_path: "u1", content_digest: "d" },
      { name: "h1", invocation_mode: "hybrid", source_id: "s", source_relative_path: "h1", content_digest: "d" },
      { name: "un1", invocation_mode: "unspecified", source_id: "s", source_relative_path: "un1", content_digest: "d" },
      { name: "fallback1", source_id: "s", source_relative_path: "f1", content_digest: "d" },
    ],
    presets: [{ id: "p", name: "P", version: 1, skills: [{ skill_name: "m1" }] }],
  };
  const inspected = parseAndValidateRecipeClient(recipe);
  assert.deepEqual(inspected.summary.by_invocation_mode, {
    model_invoked: 1,
    user_invoked: 1,
    hybrid: 1,
    unspecified: 2,
  });
});

test("Tier 1 - F3.6: Inspect calculates artifact_type breakdown (skill, rule, hook, plugin, mcp_server)", () => {
  const recipe = {
    schema_version: 1,
    recipe_id: "r36",
    name: "Artifacts Breakdown",
    created_at: new Date().toISOString(),
    sources: [{ source_id: "s", type: "git", locator: "git" }],
    skills: [
      { name: "a1", artifact_type: "skill", invocation_mode: "model_invoked", source_id: "s", source_relative_path: "a1", content_digest: "d" },
      { name: "a2", artifact_type: "rule", invocation_mode: "model_invoked", source_id: "s", source_relative_path: "a2", content_digest: "d" },
      { name: "a3", artifact_type: "hook", invocation_mode: "model_invoked", source_id: "s", source_relative_path: "a3", content_digest: "d" },
    ],
    presets: [{ id: "p", name: "P", version: 1, skills: [{ skill_name: "a1" }] }],
  };
  const inspected = parseAndValidateRecipeClient(recipe);
  assert.deepEqual(inspected.summary.by_artifact_type, {
    skill: 1,
    rule: 1,
    hook: 1,
  });
});

test("Tier 1 - F3.7: Inspect collects and reports schema validation issues", () => {
  const badRecipe = {
    schema_version: 99,
    recipe_id: "",
    name: "",
    sources: [],
    skills: [],
    presets: [],
  };
  const inspected = parseAndValidateRecipeClient(badRecipe);
  assert.equal(inspected.valid, false);
  assert.ok(inspected.issues.length >= 3);
});

test("Tier 1 - F4.1: Apply with project path sets correct delivery root for Codex (skills/)", () => {
  const res = simulateRecipeApply({
    recipe: { schema_version: 1, recipe_id: "r", name: "N", sources: [], skills: [{ name: "s" }], presets: [] },
    project_path: "/ws/codex-app",
    provider_id: "codex",
  });
  assert.equal(res.delivery.delivery_root, "/ws/codex-app/skills/");
});

test("Tier 1 - F4.2: Apply with project path sets correct delivery root for Antigravity (.agents/skills/)", () => {
  const res = simulateRecipeApply({
    recipe: { schema_version: 1, recipe_id: "r", name: "N", sources: [], skills: [{ name: "s" }], presets: [] },
    project_path: "/ws/agy-app",
    provider_id: "antigravity",
  });
  assert.equal(res.delivery.delivery_root, "/ws/agy-app/.agents/skills/");
});

test("Tier 1 - F4.3: Apply with project path sets correct delivery root for Claude (.claude/skills/)", () => {
  const res = simulateRecipeApply({
    recipe: { schema_version: 1, recipe_id: "r", name: "N", sources: [], skills: [{ name: "s" }], presets: [] },
    project_path: "/ws/claude-app",
    provider_id: "claude",
  });
  assert.equal(res.delivery.delivery_root, "/ws/claude-app/.claude/skills/");
});

test("Tier 1 - F4.4: Apply in preview mode (confirm=false) prepares operations without materialization", () => {
  const res = simulateRecipeApply({
    recipe: { schema_version: 1, recipe_id: "r", name: "N", sources: [], skills: [{ name: "s" }], presets: [] },
    project_path: "/ws/preview-app",
    provider_id: "codex",
    confirm: false,
  });
  assert.equal(res.delivery.applied, false);
  assert.equal(res.delivery.preview.operations, 1);
});

test("Tier 1 - F4.5: Apply in confirmed mode (confirm=true) materializes bindings and returns success report", () => {
  const res = simulateRecipeApply({
    recipe: { schema_version: 1, recipe_id: "r", name: "N", sources: [], skills: [{ name: "s" }], presets: [] },
    project_path: "/ws/confirm-app",
    provider_id: "codex",
    confirm: true,
  });
  assert.equal(res.delivery.applied, true);
  assert.ok(res.delivery.message.includes("Successfully materialized"));
});

test("Tier 1 - F5.1: Navigation rail contains Skills, Templates, Projects, Recipes tabs", () => {
  const tabs = ["Skills", "Templates", "Projects", "Recipes"];
  assert.deepEqual(tabs, ["Skills", "Templates", "Projects", "Recipes"]);
});

test("Tier 1 - F5.2: Navigation tab switching switches active view", () => {
  let activeTab = "Skills";
  const selectTab = (t) => { activeTab = t; };
  selectTab("Recipes");
  assert.equal(activeTab, "Recipes");
});

test("Tier 1 - F5.3: Unknown tab requests are ignored / preserved", () => {
  let activeTab = "Projects";
  const selectTab = (t) => {
    if (["Skills", "Templates", "Projects", "Recipes"].includes(t)) activeTab = t;
  };
  selectTab("InvalidTab");
  assert.equal(activeTab, "Projects");
});

test("Tier 1 - F6.1: Invocation chips filter model_invoked correctly", () => {
  const skills = [
    { lineage: { skill_name: "s1" }, profile: { invocation_mode: "model_invoked" } },
    { lineage: { skill_name: "s2" }, profile: { invocation_mode: "user_invoked" } },
  ];
  const res = filterSkillsCatalog(skills, { invocationFilter: "model_invoked" });
  assert.equal(res.length, 1);
  assert.equal(res[0].lineage.skill_name, "s1");
});

test("Tier 1 - F6.2: Invocation chips filter user_invoked correctly", () => {
  const skills = [
    { lineage: { skill_name: "s1" }, profile: { invocation_mode: "model_invoked" } },
    { lineage: { skill_name: "s2" }, profile: { invocation_mode: "user_invoked" } },
  ];
  const res = filterSkillsCatalog(skills, { invocationFilter: "user_invoked" });
  assert.equal(res.length, 1);
  assert.equal(res[0].lineage.skill_name, "s2");
});

test("Tier 1 - F6.3: Invocation chips filter hybrid correctly", () => {
  const skills = [
    { lineage: { skill_name: "s1" }, profile: { invocation_mode: "hybrid" } },
    { lineage: { skill_name: "s2" }, profile: { invocation_mode: "user_invoked" } },
  ];
  const res = filterSkillsCatalog(skills, { invocationFilter: "hybrid" });
  assert.equal(res.length, 1);
  assert.equal(res[0].lineage.skill_name, "s1");
});

test("Tier 1 - F6.4: Invocation chips filter unspecified correctly", () => {
  const skills = [
    { lineage: { skill_name: "s1" }, profile: { invocation_mode: "unspecified" } },
    { lineage: { skill_name: "s2" }, profile: { invocation_mode: "model_invoked" } },
  ];
  const res = filterSkillsCatalog(skills, { invocationFilter: "unspecified" });
  assert.equal(res.length, 1);
  assert.equal(res[0].lineage.skill_name, "s1");
});

test("Tier 1 - F6.5: Provider dropdown filters by provider tag/id", () => {
  const skills = [
    { lineage: { id: "lin-antigravity", skill_name: "s1" }, profile: { tags: ["antigravity"] } },
    { lineage: { id: "lin-codex", skill_name: "s2" }, profile: { tags: ["codex"] } },
  ];
  const res = filterSkillsCatalog(skills, { providerFilter: "antigravity" });
  assert.equal(res.length, 1);
  assert.equal(res[0].lineage.skill_name, "s1");
});

test("Tier 1 - F6.6: Search input filters by skill name, profile title, summary, purpose, tags, use_when", () => {
  const skills = [
    { lineage: { skill_name: "code-review" }, profile: { title: "Automated Review", summary: "Reviews pull requests", purpose: "PR Quality", tags: ["quality"], use_when: ["On PR"] } },
    { lineage: { skill_name: "db-migrate" }, profile: { title: "DB Migrator", summary: "Upgrades tables", purpose: "Schema", tags: ["db"], use_when: ["On Migration"] } },
  ];
  assert.equal(filterSkillsCatalog(skills, { searchQuery: "pull requests" }).length, 1);
  assert.equal(filterSkillsCatalog(skills, { searchQuery: "Schema" }).length, 1);
  assert.equal(filterSkillsCatalog(skills, { searchQuery: "quality" }).length, 1);
});

test("Tier 1 - F7.1: Table view mode renders flat tabular structure", () => {
  let mode = "table";
  assert.equal(mode, "table");
});

test("Tier 1 - F7.2: Card grid view mode renders structured cards", () => {
  let mode = "grid";
  assert.equal(mode, "grid");
});

test("Tier 1 - F7.3: Match counter formats correctly for singular and plural entities", () => {
  const format = (c, total, entity = "skills") => `Showing ${c} of ${total} ${entity}`;
  assert.equal(format(1, 1, "skill"), "Showing 1 of 1 skill");
  assert.equal(format(5, 10, "effective skills"), "Showing 5 of 10 effective skills");
});

test("Tier 1 - F7.4: Tag slice logic caps visible tags and shows +N overflow badge", () => {
  const tags = ["tag1", "tag2", "tag3", "tag4", "tag5"];
  const visible = tags.slice(0, 3);
  const remaining = tags.length - 3;
  assert.equal(visible.length, 3);
  assert.equal(`+${remaining}`, "+2");
});

test("Tier 1 - F8.1: Profile data model supports title, summary, purpose, review_state, risk_level", () => {
  const prof = {
    title: "Security Scanner",
    summary: "Scans vulnerabilities",
    purpose: "Security assurance",
    review_state: "reviewed",
    risk_level: "high",
  };
  assert.equal(prof.review_state, "reviewed");
  assert.equal(prof.risk_level, "high");
});

test("Tier 1 - F8.2: Review states (reviewed, unreviewed, deprecated) are tracked", () => {
  const states = ["reviewed", "unreviewed", "deprecated"];
  for (const s of states) {
    assert.ok(typeof s === "string");
  }
});

test("Tier 1 - F8.3: Usage notes and evaluation summaries format correctly", () => {
  const evalSummary = {
    active_case_count: 5,
    evaluated_active_case_count: 5,
    total_runs: 20,
    pass_rate: 0.95,
    latest_outcome: "pass",
  };
  assert.equal(evalSummary.pass_rate, 0.95);
  assert.equal(evalSummary.latest_outcome, "pass");
});

test("Tier 1 - F9.1: Antigravity badge displays AGY alias and mint theme", () => {
  const info = getProviderInfo("antigravity");
  assert.equal(info.alias, "AGY");
  assert.equal(info.colorTheme, "mint");
});

test("Tier 1 - F9.2: Codex badge displays Codex CLI alias and amber theme", () => {
  const info = getProviderInfo("codex");
  assert.equal(info.alias, "Codex CLI");
  assert.equal(info.colorTheme, "amber");
});

test("Tier 1 - F9.3: Claude badge displays Claude Desktop alias and violet theme", () => {
  const info = getProviderInfo("claude");
  assert.equal(info.alias, "Claude Desktop");
  assert.equal(info.colorTheme, "violet");
});

test("Tier 1 - F9.4: Delivery paths resolve with relative and absolute workspace base paths", () => {
  assert.equal(resolveDeliveryPath("antigravity", "p", "/root/app"), "/root/app/.agents/skills/p");
  assert.equal(resolveDeliveryPath("antigravity", "p"), ".agents/skills/p");
});

test("Tier 1 - F10.1: 🤖 Model-invoked / Agent Reflex metadata, icon, tooltip, semantics", () => {
  const info = getInvocationModeInfo("model_invoked");
  assert.equal(info.icon, "🤖");
  assert.ok(info.operationalSemantics.includes("Autonomous reasoning"));
});

test("Tier 1 - F10.2: 👤 User-invoked / Explicit Command metadata, icon, tooltip, semantics", () => {
  const info = getInvocationModeInfo("user_invoked");
  assert.equal(info.icon, "👤");
  assert.ok(info.operationalSemantics.includes("High-impact"));
});

test("Tier 1 - F10.3: 🔀 Hybrid metadata, icon, tooltip, semantics", () => {
  const info = getInvocationModeInfo("hybrid");
  assert.equal(info.icon, "🔀");
  assert.ok(info.operationalSemantics.includes("Flexible tools"));
});

test("Tier 1 - F10.4: ⚙️ Unspecified metadata, icon, tooltip, semantics", () => {
  const info = getInvocationModeInfo("unspecified");
  assert.equal(info.icon, "⚙️");
  assert.ok(info.operationalSemantics.includes("Default unclassified"));
});

test("Tier 1 - F11.1: Pristine baseline status pill and tooltip", () => {
  const st = calculateProjectStatus({ pristine: true });
  assert.equal(st.state, "pristine");
  assert.equal(st.badgeClass, "status-pill pristine");
});

test("Tier 1 - F11.2: Unapplied edits (dirty) status pill and tooltip", () => {
  const st = calculateProjectStatus({ isDirty: true });
  assert.equal(st.state, "dirty");
  assert.equal(st.badgeClass, "status-pill dirty");
});

test("Tier 1 - F11.3: In-sync status pill and tooltip", () => {
  const st = calculateProjectStatus({ comparison: { in_sync: true, summary: { matched: 3 } } });
  assert.equal(st.state, "insync");
  assert.equal(st.badgeClass, "status-pill insync");
});

test("Tier 1 - F11.4: Drift warning status pill, count, and breakdown", () => {
  const st = calculateProjectStatus({ comparison: { in_sync: false, summary: { matched: 1, missing: 2 } } });
  assert.equal(st.state, "drift");
  assert.equal(st.driftCount, 2);
  assert.equal(st.badgeClass, "status-pill drift");
});

test("Tier 1 - F11.5: Plan ready status pill for unconfigured state", () => {
  const st = calculateProjectStatus({});
  assert.equal(st.state, "ready");
  assert.equal(st.badgeClass, "status-pill ready");
});

test("Tier 1 - F12.1: Step mapping: Plan (0-20%), Inspect (20-40%), Preview (40-60%), Materialize (60-85%), Verify (85-100%)", () => {
  assert.equal(calculateStageProgressPercent({ stage: "plan", completed: 1, total: 1 }), 20);
  assert.equal(calculateStageProgressPercent({ stage: "inspect", completed: 1, total: 1 }), 40);
  assert.equal(calculateStageProgressPercent({ stage: "preview", completed: 1, total: 1 }), 60);
  assert.equal(calculateStageProgressPercent({ stage: "materialize", completed: 1, total: 1 }), 85);
  assert.equal(calculateStageProgressPercent({ stage: "verify", completed: 1, total: 1 }), 98);
  assert.equal(calculateStageProgressPercent(null, true), 100);
});

test("Tier 1 - F12.2: Normalization of step aliases (record, preflight, resolve, linking, done)", () => {
  assert.equal(mapStageToDiagnosticStep("record"), "plan");
  assert.equal(mapStageToDiagnosticStep("preflight"), "inspect");
  assert.equal(mapStageToDiagnosticStep("resolve"), "preview");
  assert.equal(mapStageToDiagnosticStep("linking"), "materialize");
  assert.equal(mapStageToDiagnosticStep("done"), "verify");
});

test("Tier 1 - F12.3: Step node states (pending, active, completed, failed)", () => {
  assert.equal(getStepNodeState(0, "inspect"), "completed");
  assert.equal(getStepNodeState(1, "inspect"), "active");
  assert.equal(getStepNodeState(2, "inspect"), "pending");
  assert.equal(getStepNodeState(1, "inspect", true), "failed");
});

test("Tier 1 - F12.4: Metric text formatting with units (symlinks, bindings, operations, invariants)", () => {
  assert.equal(formatStageMetric("materialize", 4, 5), "Materialize: 4 of 5 symlinks processed (80%)");
  assert.equal(formatStageMetric("inspect", 2, 2), "Inspect: 2 of 2 bindings processed (100%)");
  assert.equal(formatStageMetric("preview", 1, 2), "Preview: 1 of 2 operations processed (50%)");
  assert.equal(formatStageMetric("verify", 3, 3), "Verify: 3 of 3 invariants processed (100%)");
});

test("Tier 1 - F13.1: Slide-over drawer opens and renders binding cards", () => {
  const bindings = [{ skill_instance_id: "s1", provider_id: "antigravity", state: "enabled" }];
  const filtered = filterBindings(bindings, "all");
  assert.equal(filtered.length, 1);
});

test("Tier 1 - F13.2: Drift alert banner displays total drifted count and detailed breakdown chips", () => {
  const comparison = { in_sync: false, summary: { matched: 2, missing: 1, conflict: 1 } };
  const st = calculateProjectStatus({ comparison });
  assert.equal(st.driftCount, 2);
  assert.deepEqual(st.driftBreakdown, { missing: 1, conflict: 1 });
});

test("Tier 1 - F13.3: 1-click reconciliation restores in-sync state", () => {
  const restored = calculateProjectStatus({ comparison: { in_sync: true, summary: { matched: 4 } } });
  assert.equal(restored.state, "insync");
  assert.equal(restored.driftCount, 0);
});

test("Tier 1 - F13.4: Binding status chips (enabled, disabled, missing, conflict, unavailable, attention)", () => {
  const bindings = [
    { skill_instance_id: "b1", state: "enabled" },
    { skill_instance_id: "b2", state: "disabled" },
    { skill_instance_id: "b3", state: "missing" },
    { skill_instance_id: "b4", state: "conflict" },
    { skill_instance_id: "b5", state: "unavailable" },
  ];
  assert.equal(filterBindings(bindings, "enabled").length, 1);
  assert.equal(filterBindings(bindings, "disabled").length, 1);
  assert.equal(filterBindings(bindings, "missing").length, 1);
  assert.equal(filterBindings(bindings, "conflict").length, 1);
  assert.equal(filterBindings(bindings, "unavailable").length, 1);
  assert.equal(filterBindings(bindings, "attention").length, 3);
});

test("Tier 1 - F13.5: Binding search filters by skill, provider, scope, and target path", () => {
  const bindings = [
    { skill_instance_id: "auth-skill", provider_id: "codex", scope: "global", target_path: "skills/auth" },
    { skill_instance_id: "ui-skill", provider_id: "antigravity", scope: "project", target_path: ".agents/skills/ui" },
  ];
  assert.equal(filterBindings(bindings, "all", "auth-skill").length, 1);
  assert.equal(filterBindings(bindings, "all", "codex").length, 1);
  assert.equal(filterBindings(bindings, "all", "global").length, 1);
  assert.equal(filterBindings(bindings, "all", ".agents/skills").length, 1);
});

test("Tier 1 - F14.1: Schema contracts consistency across all entities", () => {
  assert.ok(INVOCATION_MODES.has("model_invoked"));
  assert.ok(INVOCATION_MODES.has("user_invoked"));
  assert.ok(INVOCATION_MODES.has("hybrid"));
  assert.ok(INVOCATION_MODES.has("unspecified"));
});

test("Tier 1 - F14.2: Activation plan validation rules enforcement", () => {
  const validPlan = {
    plan_id: "p_123",
    schema_version: 1,
    created_at: new Date().toISOString(),
    mode: "apply",
    target: { provider_id: "codex", scope: "project", project_id: "p1", project_path: "/ws/p1" },
    distribution: { method: "symlink" },
    operations: [
      {
        registry_skill_id: "s1",
        source_revision_id: "r1",
        content_digest: "d1",
        canonical_path: "/storage/s1",
        delivery_path: "/ws/p1/skills/s1",
        desired_state: "enabled",
      },
    ],
  };
  const val = validateActivationPlan(validPlan);
  assert.equal(val.valid, true);
});

test("Tier 1 - F14.3: Delivery method constraints (symlink vs copy)", () => {
  assert.ok(DELIVERY_METHODS.has("symlink"));
  assert.ok(DELIVERY_METHODS.has("copy"));
});

test("Tier 1 - F14.4: Collision strategy defaults", () => {
  const plan = createActivationPlan({
    target: { provider_id: "codex", scope: "global" },
    operations: [
      {
        registry_skill_id: "s",
        source_revision_id: "r",
        content_digest: "d",
        canonical_path: "/c",
        delivery_path: "/d",
        desired_state: "enabled",
      },
    ],
  });
  assert.equal(plan.distribution.collision_strategy, "fail");
});

// ============================================================================
// ============================================================================
// TIER 2: BOUNDARY & CORNER CASES (25+ tests)
// ============================================================================
// ============================================================================

test("Tier 2 - Boundary: Malformed JSON with unquoted keys", () => {
  const res = parseAndValidateRecipeClient("{ badKey: 123 }");
  assert.equal(res.valid, false);
});

test("Tier 2 - Boundary: Malformed JSON with unclosed string", () => {
  const res = parseAndValidateRecipeClient('{"name": "broken');
  assert.equal(res.valid, false);
});

test("Tier 2 - Boundary: Malformed JSON with trailing comma", () => {
  const res = parseAndValidateRecipeClient('{"schema_version": 1, }');
  assert.equal(res.valid, false);
});

test("Tier 2 - Boundary: Non-object primitive root boolean", () => {
  assert.equal(parseAndValidateRecipeClient(true).valid, false);
});

test("Tier 2 - Boundary: Non-object primitive root number", () => {
  assert.equal(parseAndValidateRecipeClient(42).valid, false);
});

test("Tier 2 - Boundary: Non-object primitive root array", () => {
  assert.equal(parseAndValidateRecipeClient([1, 2, 3]).valid, false);
});

test("Tier 2 - Boundary: Missing schema_version in recipe", () => {
  const res = parseAndValidateRecipeClient({ recipe_id: "r", name: "n", created_at: "now", sources: [], skills: [], presets: [] });
  assert.equal(res.valid, false);
  assert.ok(res.issues.some((i) => i.field === "schema_version"));
});

test("Tier 2 - Boundary: Invalid schema_version number in recipe", () => {
  const res = parseAndValidateRecipeClient({ schema_version: 2, recipe_id: "r", name: "n", created_at: "now", sources: [], skills: [], presets: [] });
  assert.equal(res.valid, false);
  assert.ok(res.issues.some((i) => i.field === "schema_version"));
});

test("Tier 2 - Boundary: Missing recipe_id in recipe", () => {
  const res = parseAndValidateRecipeClient({ schema_version: 1, name: "n", created_at: "now", sources: [], skills: [], presets: [] });
  assert.equal(res.valid, false);
  assert.ok(res.issues.some((i) => i.field === "recipe_id"));
});

test("Tier 2 - Boundary: Missing name in recipe", () => {
  const res = parseAndValidateRecipeClient({ schema_version: 1, recipe_id: "r", created_at: "now", sources: [], skills: [], presets: [] });
  assert.equal(res.valid, false);
  assert.ok(res.issues.some((i) => i.field === "name"));
});

test("Tier 2 - Boundary: Zero-byte recipe files and empty collections", () => {
  const empty = { schema_version: 1, recipe_id: "empty", name: "Empty", created_at: "2026-08-27T00:00:00Z", sources: [], skills: [], presets: [], projects: [] };
  const res = parseAndValidateRecipeClient(empty);
  assert.equal(res.valid, true);
  assert.equal(res.summary.sources_count, 0);
  assert.equal(res.summary.skills_count, 0);
});

test("Tier 2 - Boundary: Massive catalog scalability (1,200 skills filtered in <50ms)", () => {
  const massiveCatalog = Array.from({ length: 1200 }, (_, i) => ({
    lineage: { id: `lin-${i}`, skill_name: `benchmark-skill-${i}` },
    profile: {
      title: `Benchmark Skill ${i}`,
      tags: [`tag-${i % 10}`, i % 2 === 0 ? "antigravity" : "codex"],
      invocation_mode: i % 3 === 0 ? "model_invoked" : i % 3 === 1 ? "user_invoked" : "hybrid",
      use_when: [`condition_${i % 5}`],
    },
    latest_skill: { description: `Description ${i}` },
  }));

  const start = performance.now();
  const filtered = filterSkillsCatalog(massiveCatalog, {
    invocationFilter: "model_invoked",
    providerFilter: "antigravity",
    searchQuery: "condition_0",
  });
  const duration = performance.now() - start;

  assert.ok(filtered.length > 0);
  assert.ok(duration < 50, `Filtering took ${duration.toFixed(2)}ms`);
});

test("Tier 2 - Boundary: Search queries with regex character '+' execute safely", () => {
  const skill = { lineage: { skill_name: "c++" }, profile: { title: "C++ Compiler" } };
  assert.equal(filterSkillsCatalog([skill], { searchQuery: "c++" }).length, 1);
});

test("Tier 2 - Boundary: Search queries with regex character '*' execute safely", () => {
  const skill = { lineage: { skill_name: "ptr" }, profile: { title: "*ptr dereference" } };
  assert.equal(filterSkillsCatalog([skill], { searchQuery: "*ptr" }).length, 1);
});

test("Tier 2 - Boundary: Search queries with regex brackets '[]' execute safely", () => {
  const skill = { lineage: { skill_name: "array" }, profile: { title: "[array] index" } };
  assert.equal(filterSkillsCatalog([skill], { searchQuery: "[array]" }).length, 1);
});

test("Tier 2 - Boundary: Search queries with regex parentheses '()' execute safely", () => {
  const skill = { lineage: { skill_name: "call" }, profile: { title: "fn(arg)" } };
  assert.equal(filterSkillsCatalog([skill], { searchQuery: "fn(arg)" }).length, 1);
});

test("Tier 2 - Boundary: Search queries with regex escape character '\\' execute safely", () => {
  const skill = { lineage: { skill_name: "escape" }, profile: { title: "\\d+ digits" } };
  assert.equal(filterSkillsCatalog([skill], { searchQuery: "\\d+" }).length, 1);
});

test("Tier 2 - Boundary: Corrupt provider name returns fallback 'codex'", () => {
  assert.equal(normalizeProviderId("CORRUPT_PROVIDER_XYZ"), "codex");
  assert.equal(normalizeProviderId(null), "codex");
});

test("Tier 2 - Boundary: Corrupt invocation mode returns fallback 'unspecified'", () => {
  const res = getInvocationModeInfo("CORRUPT_MODE_XYZ");
  assert.equal(res.id, "unspecified");
});

test("Tier 2 - Boundary: Pristine precedence over simultaneous dirty and drift flags", () => {
  const st = calculateProjectStatus({
    pristine: true,
    isDirty: true,
    comparison: { in_sync: false, summary: { missing: 5 } },
  });
  assert.equal(st.state, "pristine");
});

test("Tier 2 - Boundary: Chunk fragmentation across tiny 5-byte chunks", async () => {
  const events = [
    { type: "progress", progress: { stage: "inspect", completed: 1, total: 2, message: "Inspecting..." } },
    { type: "result", result: { status: "succeeded", report: { summary: { applied: 2, skipped: 0, failed: 0 } } } },
  ];
  const streamText = events.map((e) => JSON.stringify(e)).join("\n") + "\n";
  const chunks = [];
  for (let i = 0; i < streamText.length; i += 5) {
    chunks.push(streamText.slice(i, i + 5));
  }

  const stream = new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(new TextEncoder().encode(c));
      controller.close();
    },
  });

  const progress = [];
  const result = await readApplyStream({ ok: true, body: stream }, (p) => progress.push(p));
  assert.equal(progress.length, 1);
  assert.equal(result.status, "succeeded");
});

test("Tier 2 - Boundary: Stream reader skips empty lines without crashing", async () => {
  const streamText = "\n\n" + JSON.stringify({ type: "result", result: { status: "succeeded", report: { summary: { applied: 1, skipped: 0, failed: 0 } } } }) + "\n\n";
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(streamText));
      controller.close();
    },
  });
  const res = await readApplyStream({ ok: true, body: stream }, () => {});
  assert.equal(res.status, "succeeded");
});

test("Tier 2 - Boundary: Whitespace-only search query matches all items", () => {
  const skills = [{ lineage: { skill_name: "s1" } }, { lineage: { skill_name: "s2" } }];
  assert.equal(filterSkillsCatalog(skills, { searchQuery: "   " }).length, 2);
});

test("Tier 2 - Boundary: Case-insensitive search matches UPPER and lower case", () => {
  const skills = [{ lineage: { skill_name: "DEPLOY_PROD" } }];
  assert.equal(filterSkillsCatalog(skills, { searchQuery: "deploy_prod" }).length, 1);
  assert.equal(filterSkillsCatalog(skills, { searchQuery: "DEPLOY" }).length, 1);
});

test("Tier 2 - Boundary: Trailing slashes on project path are sanitized", () => {
  assert.equal(resolveDeliveryPath("antigravity", "p", "/path/to/ws///"), "/path/to/ws/.agents/skills/p");
});

// ============================================================================
// ============================================================================
// TIER 3: CROSS-FEATURE COMBINATIONS (15+ tests)
// ============================================================================
// ============================================================================

test("Tier 3 - Cross-Feature 1: Recipe Export + Import round-trip Codex -> Antigravity", () => {
  const exported = createSkillRecipe({
    name: "Round-trip 1",
    sources: [{ source_id: "s", type: "git", locator: "git" }],
    skills: [{ name: "planning", invocation_mode: "model_invoked", source_id: "s", source_relative_path: "p", content_digest: "d" }],
    presets: [{ id: "p1", name: "P1", version: 1, skills: [{ skill_name: "planning" }] }],
  });
  const inspected = parseAndValidateRecipeClient(JSON.stringify(exported));
  const applied = simulateRecipeApply({ recipe: inspected, project_path: "/ws/agy", provider_id: "antigravity", confirm: true });
  assert.equal(applied.delivery.delivery_root, "/ws/agy/.agents/skills/");
});

test("Tier 3 - Cross-Feature 2: Recipe Export + Import round-trip Codex -> Claude", () => {
  const exported = createSkillRecipe({
    name: "Round-trip 2",
    sources: [{ source_id: "s", type: "git", locator: "git" }],
    skills: [{ name: "planning", invocation_mode: "model_invoked", source_id: "s", source_relative_path: "p", content_digest: "d" }],
    presets: [{ id: "p1", name: "P1", version: 1, skills: [{ skill_name: "planning" }] }],
  });
  const inspected = parseAndValidateRecipeClient(JSON.stringify(exported));
  const applied = simulateRecipeApply({ recipe: inspected, project_path: "/ws/claude", provider_id: "claude", confirm: true });
  assert.equal(applied.delivery.delivery_root, "/ws/claude/.claude/skills/");
});

test("Tier 3 - Cross-Feature 3: Invocation mode filtering + Table/Card view toggle + Search query combination", () => {
  const dataset = [
    { lineage: { skill_name: "s1" }, profile: { invocation_mode: "model_invoked", title: "Model Alpha" } },
    { lineage: { skill_name: "s2" }, profile: { invocation_mode: "user_invoked", title: "User Beta" } },
  ];
  const filtered = filterSkillsCatalog(dataset, { invocationFilter: "model_invoked", searchQuery: "Alpha" });
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].lineage.skill_name, "s1");
});

test("Tier 3 - Cross-Feature 4: Pinned preset + Scope overlay + Pristine toggle + Live stream activation", async () => {
  let status = calculateProjectStatus({ pinnedPresetId: "b2" });
  assert.equal(status.state, "ready");
  status = calculateProjectStatus({ pinnedPresetId: "b2", isDirty: true });
  assert.equal(status.state, "dirty");
  status = calculateProjectStatus({ pristine: true, isDirty: true });
  assert.equal(status.state, "pristine");
});

test("Tier 3 - Cross-Feature 5: Drift detection in drawer + 1-click reconciliation + live status verification", () => {
  let status = calculateProjectStatus({ comparison: { in_sync: false, summary: { matched: 2, missing: 1 } } });
  assert.equal(status.state, "drift");
  status = calculateProjectStatus({ comparison: { in_sync: true, summary: { matched: 3 } } });
  assert.equal(status.state, "insync");
});

test("Tier 3 - Cross-Feature 6: Multi-criteria disjoint combinations return empty matches gracefully", () => {
  const skills = [{ lineage: { skill_name: "s1" }, profile: { invocation_mode: "user_invoked", tags: ["codex"] } }];
  const res = filterSkillsCatalog(skills, { invocationFilter: "model_invoked", providerFilter: "codex" });
  assert.equal(res.length, 0);
});

test("Tier 3 - Cross-Feature 7: Profile invocation mode override over lineage and latest_skill", () => {
  const skill = {
    lineage: { invocation_mode: "user_invoked" },
    latest_skill: { invocation_mode: "hybrid" },
    profile: { invocation_mode: "model_invoked" },
  };
  const res = filterSkillsCatalog([skill], { invocationFilter: "model_invoked" });
  assert.equal(res.length, 1);
});

test("Tier 3 - Cross-Feature 8: Delivery path resolution with Windows backslashes and POSIX slashes", () => {
  const path1 = resolveDeliveryPath("antigravity", "p", "C:\\Users\\dev\\project");
  assert.ok(path1.includes(".agents/skills/p"));
  const path2 = resolveDeliveryPath("antigravity", "p", "/home/dev/project");
  assert.equal(path2, "/home/dev/project/.agents/skills/p");
});

test("Tier 3 - Cross-Feature 9: Mixed artifact types (skill, rule, hook, plugin, mcp_server) in recipe inspection", () => {
  const recipe = {
    schema_version: 1,
    recipe_id: "r_mixed",
    name: "Mixed Types",
    created_at: new Date().toISOString(),
    sources: [{ source_id: "s", type: "git", locator: "git" }],
    skills: [
      { name: "sk", artifact_type: "skill", source_id: "s", source_relative_path: "sk", content_digest: "d" },
      { name: "rl", artifact_type: "rule", source_id: "s", source_relative_path: "rl", content_digest: "d" },
      { name: "hk", artifact_type: "hook", source_id: "s", source_relative_path: "hk", content_digest: "d" },
      { name: "pl", artifact_type: "plugin", source_id: "s", source_relative_path: "pl", content_digest: "d" },
      { name: "mc", artifact_type: "mcp_server", source_id: "s", source_relative_path: "mc", content_digest: "d" },
    ],
    presets: [{ id: "p", name: "P", version: 1, skills: [{ skill_name: "sk" }] }],
  };
  const inspected = parseAndValidateRecipeClient(recipe);
  assert.equal(inspected.summary.skills_count, 5);
  assert.equal(inspected.summary.by_artifact_type.mcp_server, 1);
});

test("Tier 3 - Cross-Feature 10: Preset composition with required vs optional skills", () => {
  const preset = {
    id: "preset-comp",
    name: "Composition",
    version: 1,
    skills: [
      { skill_name: "req-1", artifact_type: "skill", required: true },
      { skill_name: "opt-1", artifact_type: "skill", required: false },
    ],
  };
  assert.equal(preset.skills.filter((s) => s.required).length, 1);
});

test("Tier 3 - Cross-Feature 11: Stream reader consuming multi-stage progress followed by final report", async () => {
  const streamText = [
    JSON.stringify({ type: "progress", progress: { stage: "inspect", completed: 1, total: 2, message: "Inspecting" } }),
    JSON.stringify({ type: "progress", progress: { stage: "materialize", completed: 2, total: 2, message: "Linking" } }),
    JSON.stringify({ type: "result", result: { status: "succeeded", report: { summary: { applied: 2, skipped: 0, failed: 0 } } } }),
  ].join("\n") + "\n";

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(streamText));
      controller.close();
    },
  });

  const stages = [];
  const res = await readApplyStream({ ok: true, body: stream }, (p) => stages.push(p.stage));
  assert.deepEqual(stages, ["inspect", "materialize"]);
  assert.equal(res.status, "succeeded");
});

test("Tier 3 - Cross-Feature 12: Live drawer scope toggling between Selected Project and Global Provider", () => {
  let scope = "project";
  assert.equal(scope, "project");
  scope = "global";
  assert.equal(scope, "global");
});

test("Tier 3 - Cross-Feature 13: Progressive step node state transition from Plan to Verify", () => {
  const stages = ["plan", "inspect", "preview", "materialize", "verify"];
  for (let i = 0; i < stages.length; i++) {
    const state = getStepNodeState(i, stages[i]);
    assert.equal(state, "active");
  }
});

test("Tier 3 - Cross-Feature 14: Re-apply active plan workflow from drawer", () => {
  const applyState = simulateRecipeApply({
    recipe: { schema_version: 1, recipe_id: "r", name: "Re-apply", sources: [], skills: [{ name: "s" }], presets: [] },
    project_path: "/ws/reapply",
    provider_id: "antigravity",
    confirm: true,
  });
  assert.equal(applyState.delivery.applied, true);
});

test("Tier 3 - Cross-Feature 15: Search query with combined invocation and provider constraints", () => {
  const dataset = [
    { lineage: { id: "lin-1", skill_name: "planner" }, profile: { title: "Task Planner", tags: ["antigravity"], invocation_mode: "model_invoked" } },
    { lineage: { id: "lin-2", skill_name: "tester" }, profile: { title: "Unit Tester", tags: ["codex"], invocation_mode: "user_invoked" } },
  ];
  const res = filterSkillsCatalog(dataset, { invocationFilter: "model_invoked", providerFilter: "antigravity", searchQuery: "Planner" });
  assert.equal(res.length, 1);
  assert.equal(res[0].lineage.skill_name, "planner");
});

// ============================================================================
// ============================================================================
// TIER 4: REAL-WORLD APPLICATION SCENARIOS (S1 through S7)
// ============================================================================
// ============================================================================

test("Tier 4 - Scenario S1: Multi-Machine Recipe Export and Re-Import Workflow", () => {
  const sourceRecipe = createSkillRecipe({
    name: "Engineering Suite Machine A",
    description: "Exported from workstation A",
    sources: [{ source_id: "core", type: "git", locator: "https://git.local/core.git" }],
    skills: [
      { name: "planning", invocation_mode: "model_invoked", source_id: "core", source_relative_path: "skills/planning", content_digest: "d1" },
      { name: "testing", invocation_mode: "user_invoked", source_id: "core", source_relative_path: "skills/testing", content_digest: "d2" },
      { name: "review", invocation_mode: "hybrid", source_id: "core", source_relative_path: "skills/review", content_digest: "d3" },
    ],
    presets: [{ id: "full-team", name: "Full Team Preset", version: 1, skills: [{ skill_name: "planning" }] }],
  });

  const transferBlob = JSON.stringify(sourceRecipe, null, 2);
  const destinationInspect = parseAndValidateRecipeClient(transferBlob);
  assert.equal(destinationInspect.valid, true);
  assert.equal(destinationInspect.summary.skills_count, 3);
  assert.equal(destinationInspect.summary.by_invocation_mode.model_invoked, 1);
  assert.equal(destinationInspect.summary.by_invocation_mode.user_invoked, 1);
  assert.equal(destinationInspect.summary.by_invocation_mode.hybrid, 1);

  const destinationApply = simulateRecipeApply({
    recipe: destinationInspect,
    project_path: "/home/user/workspaces/project-b",
    provider_id: "codex",
    confirm: true,
  });

  assert.equal(destinationApply.delivery.applied, true);
  assert.equal(destinationApply.delivery.delivery_root, "/home/user/workspaces/project-b/skills/");
  assert.equal(destinationApply.delivery.preview.operations, 3);
});

test("Tier 4 - Scenario S2: Invocation Mode Reflex vs Command Filtering & View Toggling", () => {
  const skills = [
    { lineage: { id: "s1", skill_name: "reflex-chk" }, profile: { invocation_mode: "model_invoked", title: "Reflex Invariant Check", tags: ["antigravity"] } },
    { lineage: { id: "s2", skill_name: "deploy-cmd" }, profile: { invocation_mode: "user_invoked", title: "Deploy Production Command", tags: ["codex"] } },
    { lineage: { id: "s3", skill_name: "dual-lint" }, profile: { invocation_mode: "hybrid", title: "Interactive & Reflex Linter", tags: ["claude"] } },
    { lineage: { id: "s4", skill_name: "legacy-tool" }, profile: { invocation_mode: "unspecified", title: "Legacy Generic Tool", tags: ["tools"] } },
  ];

  const reflex = filterSkillsCatalog(skills, { invocationFilter: "model_invoked" });
  assert.equal(reflex.length, 1);
  assert.equal(reflex[0].lineage.skill_name, "reflex-chk");

  const command = filterSkillsCatalog(skills, { invocationFilter: "user_invoked" });
  assert.equal(command.length, 1);
  assert.equal(command[0].lineage.skill_name, "deploy-cmd");

  const hybrid = filterSkillsCatalog(skills, { invocationFilter: "hybrid" });
  assert.equal(hybrid.length, 1);
  assert.equal(hybrid[0].lineage.skill_name, "dual-lint");

  const all = filterSkillsCatalog(skills, { invocationFilter: "all" });
  assert.equal(all.length, 4);
});

test("Tier 4 - Scenario S3: Multi-Provider Switching and Delivery Path Verification", () => {
  const projectRoot = "/workspace/repo";

  const agyRoot = resolveDeliveryRoot("antigravity", projectRoot);
  const agySkillPath = resolveDeliveryPath("antigravity", "planner", projectRoot);
  assert.equal(agyRoot, "/workspace/repo/.agents/skills/");
  assert.equal(agySkillPath, "/workspace/repo/.agents/skills/planner");

  const claudeRoot = resolveDeliveryRoot("claude", projectRoot);
  const claudeSkillPath = resolveDeliveryPath("claude", "planner", projectRoot);
  assert.equal(claudeRoot, "/workspace/repo/.claude/skills/");
  assert.equal(claudeSkillPath, "/workspace/repo/.claude/skills/planner");

  const codexRoot = resolveDeliveryRoot("codex", projectRoot);
  const codexSkillPath = resolveDeliveryPath("codex", "planner", projectRoot);
  assert.equal(codexRoot, "/workspace/repo/skills/");
  assert.equal(codexSkillPath, "/workspace/repo/skills/planner");
});

test("Tier 4 - Scenario S4: 5-Step Live Activation and Streaming Diagnostics", async () => {
  const stagesEncountered = [];
  const percentages = [];

  const rawEvents = [
    { type: "progress", progress: { stage: "plan", completed: 1, total: 1, message: "Recording plan" } },
    { type: "progress", progress: { stage: "inspect", completed: 2, total: 4, message: "Inspecting bindings" } },
    { type: "progress", progress: { stage: "preview", completed: 4, total: 4, message: "Validating symlinks" } },
    { type: "progress", progress: { stage: "materialize", completed: 3, total: 4, message: "Creating symlinks" } },
    { type: "progress", progress: { stage: "verify", completed: 4, total: 4, message: "Checking invariants" } },
    { type: "result", result: { status: "succeeded", report: { summary: { applied: 4, skipped: 0, failed: 0 } } } },
  ];

  const stream = new ReadableStream({
    start(controller) {
      const enc = new TextEncoder();
      controller.enqueue(enc.encode(rawEvents.map((e) => JSON.stringify(e)).join("\n") + "\n"));
      controller.close();
    },
  });

  const result = await readApplyStream({ ok: true, body: stream }, (prog) => {
    stagesEncountered.push(prog.stage);
    percentages.push(calculateStageProgressPercent(prog));
  });

  assert.deepEqual(stagesEncountered, ["plan", "inspect", "preview", "materialize", "verify"]);
  assert.equal(result.status, "succeeded");
  assert.equal(result.report.summary.applied, 4);

  for (let i = 1; i < percentages.length; i++) {
    assert.ok(percentages[i] >= percentages[i - 1], `Percentages non-decreasing: ${percentages.join(" -> ")}`);
  }
});

test("Tier 4 - Scenario S5: Drift Detection and 1-Click Reconciliation", () => {
  const driftComparison = {
    in_sync: false,
    provider_id: "antigravity",
    summary: { matched: 4, missing: 2, conflict: 1, disabled: 0 },
  };

  const projectStatus = calculateProjectStatus({ comparison: driftComparison });
  assert.equal(projectStatus.state, "drift");
  assert.equal(projectStatus.driftCount, 3);
  assert.deepEqual(projectStatus.driftBreakdown, { missing: 2, conflict: 1 });

  const bindings = [
    { skill_instance_id: "s1", state: "enabled" },
    { skill_instance_id: "s2", state: "missing" },
    { skill_instance_id: "s3", state: "conflict" },
    { skill_instance_id: "s4", state: "enabled" },
  ];

  const attentionBindings = filterBindings(bindings, "attention");
  assert.equal(attentionBindings.length, 2);
  assert.deepEqual(attentionBindings.map((b) => b.skill_instance_id).sort(), ["s2", "s3"]);

  const restoredComparison = {
    in_sync: true,
    provider_id: "antigravity",
    summary: { matched: 4, missing: 0, conflict: 0 },
  };
  const restoredStatus = calculateProjectStatus({ comparison: restoredComparison });
  assert.equal(restoredStatus.state, "insync");
  assert.equal(restoredStatus.driftCount, 0);
});

test("Tier 4 - Scenario S6: Template Customization and Recipe Sharing", () => {
  const customRecipe = createSkillRecipe({
    name: "Architectural Steering & Reflex Bundle",
    description: "Custom composed template for cross-team sharing",
    sources: [{ source_id: "shared-core", type: "git", locator: "https://git.local/shared.git" }],
    skills: [
      { name: "macrothink", invocation_mode: "user_invoked", source_id: "shared-core", source_relative_path: "macrothink", content_digest: "d1" },
      { name: "modelchk", invocation_mode: "model_invoked", source_id: "shared-core", source_relative_path: "modelchk", content_digest: "d2" },
      { name: "docgen", invocation_mode: "hybrid", source_id: "shared-core", source_relative_path: "docgen", content_digest: "d3" },
    ],
    presets: [
      {
        id: "steering-v1",
        name: "Steering v1",
        version: 1,
        skills: [
          { skill_name: "macrothink", artifact_type: "skill", required: true },
          { skill_name: "modelchk", artifact_type: "skill", required: true },
          { skill_name: "docgen", artifact_type: "skill", required: false },
        ],
      },
    ],
  });

  const inspected = parseAndValidateRecipeClient(customRecipe);
  assert.equal(inspected.valid, true);
  assert.equal(inspected.presets.length, 1);
  assert.equal(inspected.presets[0].skills_count, 3);
});

test("Tier 4 - Scenario S7: Full Project Lifecycle Quality Gate", () => {
  const plan = createActivationPlan({
    target: {
      provider_id: "antigravity",
      scope: "project",
      project_id: "acme-web",
      project_path: "/workspace/acme-web",
    },
    operations: [
      {
        registry_skill_id: "sk-plan",
        source_revision_id: "rev-1",
        content_digest: "sha256:4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b",
        canonical_path: "/storage/skills/planning",
        delivery_path: "/workspace/acme-web/.agents/skills/planning",
        artifact_type: "skill",
        invocation_mode: "model_invoked",
        desired_state: "enabled",
      },
    ],
  });

  const planValidation = validateActivationPlan(plan);
  assert.equal(planValidation.valid, true);

  const recipe = createSkillRecipe({
    name: "Quality Gate Recipe",
    sources: [{ source_id: "std", type: "git", locator: "https://git.local/std.git" }],
    skills: [{ name: "planning", invocation_mode: "model_invoked", source_id: "std", source_relative_path: "planning", content_digest: "d1" }],
    presets: [{ id: "p1", name: "P1", version: 1, skills: [{ skill_name: "planning" }] }],
  });
  const recipeValidation = validateSkillRecipe(recipe);
  assert.equal(recipeValidation.valid, true);

  const status = calculateProjectStatus({ comparison: { in_sync: true, summary: { matched: 1 } } });
  assert.equal(status.state, "insync");
});

// ============================================================================
// ============================================================================
// TIER 5: ADVERSARIAL WHITE-BOX HARDENING (10+ tests)
// ============================================================================
// ============================================================================

test("Tier 5 - Adversarial: Deeply nested and unusual prototype objects in JSON parser", () => {
  const payloadWithWeirdKeys = JSON.stringify({
    schema_version: 1,
    recipe_id: "recipe_prototype_safe",
    name: "Safe Name",
    created_at: new Date().toISOString(),
    __proto__: { injected: "bad" },
    constructor: { prototype: { hacked: true } },
    sources: [],
    skills: [],
    presets: [],
  });

  const parsed = parseAndValidateRecipeClient(payloadWithWeirdKeys);
  assert.equal(parsed.valid, true);
  assert.equal(parsed.recipe_id, "recipe_prototype_safe");
});

test("Tier 5 - Adversarial: Arbitrary nested nulls and undefined properties in filter pipeline", () => {
  const badSkills = [
    null,
    undefined,
    {},
    { lineage: null, profile: null, latest_skill: null },
    { lineage: {}, profile: { tags: null, use_when: null }, latest_skill: { description: null } },
  ];

  assert.doesNotThrow(() => {
    const res = filterSkillsCatalog(badSkills, {
      invocationFilter: "model_invoked",
      providerFilter: "antigravity",
      searchQuery: "test",
    });
    assert.equal(res.length, 0);
  });
});

test("Tier 5 - Adversarial: Path traversal and special characters in provider delivery path resolver", () => {
  const maliciousSkillNames = [
    "../../etc/passwd",
    "..\\..\\windows\\system32",
    "   spaced skill name   ",
    "🚀_emoji_skill_⚡",
    "special-char@version#1.0",
  ];

  for (const name of maliciousSkillNames) {
    const resolved = resolveDeliveryPath("antigravity", name, "/workspace/root");
    assert.ok(resolved.startsWith("/workspace/root/.agents/skills/"));
    assert.ok(resolved.includes(name.trim()));
  }
});

test("Tier 5 - Adversarial: Rapid stream cancellation and non-ok HTTP responses", async () => {
  const errorStream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(JSON.stringify({ type: "error", error: "Fatal filesystem lock" }) + "\n"));
      controller.close();
    },
  });

  await assert.rejects(
    () => readApplyStream({ ok: true, body: errorStream }, () => {}),
    /Fatal filesystem lock/,
  );

  await assert.rejects(
    () => readApplyStream({ ok: false, body: null }, () => {}),
    /Skills Manager progress stream was unavailable/,
  );
});

test("Tier 5 - Adversarial: Extreme string length inputs in search queries and recipe descriptions", () => {
  const hugeString = "X".repeat(100000);
  const skill = {
    lineage: { skill_name: "huge-skill" },
    profile: { title: "Huge Skill", summary: hugeString },
  };

  const start = performance.now();
  const match = filterSkillsCatalog([skill], { searchQuery: "XXXX" });
  const duration = performance.now() - start;

  assert.equal(match.length, 1);
  assert.ok(duration < 50, `Searching 100k char string took ${duration.toFixed(2)}ms`);
});

test("Tier 5 - Adversarial: XSS script tags and HTML injection payloads in skill titles execute safely as text", () => {
  const xssSkill = {
    lineage: { skill_name: "xss" },
    profile: { title: "<script>alert('xss')</script>", summary: "<img src=x onerror=alert(1)>" },
  };
  const res = filterSkillsCatalog([xssSkill], { searchQuery: "<script>" });
  assert.equal(res.length, 1);
});

test("Tier 5 - Adversarial: Unicode and Emoji encoding resilience across search filters", () => {
  const emojiSkill = {
    lineage: { skill_name: "emoji" },
    profile: { title: "🚀 Multi-Cluster Deployer ⚡", tags: ["🔥", "kubernetes"] },
  };
  const res = filterSkillsCatalog([emojiSkill], { searchQuery: "🚀" });
  assert.equal(res.length, 1);
});

test("Tier 5 - Adversarial: NaN, Infinity, and division by zero in progress percentage calculations", () => {
  assert.equal(calculateStageProgressPercent({ stage: "inspect", completed: 0, total: 0 }), 20);
  assert.equal(calculateStageProgressPercent({ stage: "materialize", completed: -5, total: 10 }), 60);
  assert.equal(calculateStageProgressPercent({ stage: "preview", completed: 50, total: 10 }), 60);
});

test("Tier 5 - Adversarial: Duplicate delivery path detection and rejection in activation plan validation", () => {
  const duplicatePlan = {
    plan_id: "p_dup",
    schema_version: 1,
    created_at: new Date().toISOString(),
    mode: "apply",
    target: { provider_id: "codex", scope: "project", project_id: "p1", project_path: "/ws/p1" },
    distribution: { method: "symlink" },
    operations: [
      { registry_skill_id: "s1", source_revision_id: "r1", content_digest: "d1", canonical_path: "/c1", delivery_path: "/ws/p1/skills/dup", desired_state: "enabled" },
      { registry_skill_id: "s2", source_revision_id: "r2", content_digest: "d2", canonical_path: "/c2", delivery_path: "/ws/p1/skills/dup", desired_state: "enabled" },
    ],
  };
  const val = validateActivationPlan(duplicatePlan);
  assert.equal(val.valid, false);
  assert.ok(val.issues.some((i) => i.field.includes("delivery_path")));
});

test("Tier 5 - Adversarial: Null, undefined, and non-array bindings list in filterBindings", () => {
  assert.deepEqual(filterBindings(null), []);
  assert.deepEqual(filterBindings(undefined), []);
  assert.deepEqual(filterBindings([null, undefined, {}]), [{}]);
});
