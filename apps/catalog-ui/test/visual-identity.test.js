import test from "node:test";
import assert from "node:assert/strict";

// ============================================================================
// Core Logic Mirror (ESM Unit Test for Visual Identity & Multi-Provider System)
// ============================================================================

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
  },
};

function getInvocationModeInfo(mode) {
  if (!mode || !(mode in INVOCATION_MODE_INFO)) {
    return INVOCATION_MODE_INFO.unspecified;
  }
  return INVOCATION_MODE_INFO[mode];
}

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
    deliveryRootRelative: ".agents/skills",
    deliveryPathPattern: ".agents/skills/<skill_name>",
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

// ============================================================================
// TEST SUITE 1: Invocation Mode Visual Identity & Tooltip Semantics
// ============================================================================

test("Visual Identity: Invocation mode metadata provides distinct labels, icons, and tooltips", () => {
  const modelMeta = getInvocationModeInfo("model_invoked");
  assert.equal(modelMeta.id, "model_invoked");
  assert.equal(modelMeta.pillClass, "model");
  assert.equal(modelMeta.icon, "🤖");
  assert.ok(modelMeta.label.includes("Agent Reflex"));
  assert.ok(modelMeta.tooltip.includes("Autonomous routines"));
  assert.ok(modelMeta.operationalSemantics.includes("without human prompt intervention"));

  const userMeta = getInvocationModeInfo("user_invoked");
  assert.equal(userMeta.id, "user_invoked");
  assert.equal(userMeta.pillClass, "user");
  assert.equal(userMeta.icon, "👤");
  assert.ok(userMeta.label.includes("Explicit Command"));
  assert.ok(userMeta.tooltip.includes("High-impact or destructive steering"));
  assert.ok(userMeta.operationalSemantics.includes("human invocation"));

  const hybridMeta = getInvocationModeInfo("hybrid");
  assert.equal(hybridMeta.id, "hybrid");
  assert.equal(hybridMeta.pillClass, "hybrid");
  assert.equal(hybridMeta.icon, "🔀");
  assert.ok(hybridMeta.tooltip.includes("Multi-purpose tools"));

  const unspecifiedMeta = getInvocationModeInfo("unspecified");
  assert.equal(unspecifiedMeta.id, "unspecified");
  assert.equal(unspecifiedMeta.pillClass, "unspecified");
  assert.equal(unspecifiedMeta.icon, "⚙️");
  assert.ok(unspecifiedMeta.tooltip.includes("Legacy or unclassified"));
});

test("Visual Identity: Invocation mode resolution handles unknown, null, and empty inputs gracefully", () => {
  assert.equal(getInvocationModeInfo(null).id, "unspecified");
  assert.equal(getInvocationModeInfo(undefined).id, "unspecified");
  assert.equal(getInvocationModeInfo("").id, "unspecified");
  assert.equal(getInvocationModeInfo("invalid_unknown_mode").id, "unspecified");
});

// ============================================================================
// TEST SUITE 2: Assistant Provider Badges & Active Delivery Paths
// ============================================================================

test("Visual Identity: Provider normalization maps aliases accurately", () => {
  assert.equal(normalizeProviderId("antigravity"), "antigravity");
  assert.equal(normalizeProviderId("AGY"), "antigravity");
  assert.equal(normalizeProviderId("gemini"), "antigravity");
  assert.equal(normalizeProviderId("Antigravity"), "antigravity");

  assert.equal(normalizeProviderId("codex"), "codex");
  assert.equal(normalizeProviderId("Codex"), "codex");
  assert.equal(normalizeProviderId("CODEX"), "codex");

  assert.equal(normalizeProviderId("claude"), "claude");
  assert.equal(normalizeProviderId("Claude"), "claude");
  assert.equal(normalizeProviderId("CLAUDE"), "claude");

  // Fallbacks
  assert.equal(normalizeProviderId(""), "codex");
  assert.equal(normalizeProviderId(null), "codex");
  assert.equal(normalizeProviderId(undefined), "codex");
  assert.equal(normalizeProviderId("custom_unknown_provider"), "codex");
});

test("Visual Identity: Active filesystem delivery paths resolve accurately across providers", () => {
  // Relative paths without basePath
  assert.equal(
    resolveDeliveryPath("antigravity", "planning"),
    ".agents/skills/planning",
  );
  assert.equal(
    resolveDeliveryPath("codex", "testing"),
    ".agents/skills/testing",
  );
  assert.equal(
    resolveDeliveryPath("claude", "code-review"),
    ".claude/skills/code-review",
  );

  // Fallback when skill name is omitted
  assert.equal(
    resolveDeliveryPath("antigravity"),
    ".agents/skills/<skill_name>",
  );
  assert.equal(
    resolveDeliveryPath("codex"),
    ".agents/skills/<skill_name>",
  );
  assert.equal(
    resolveDeliveryPath("claude"),
    ".claude/skills/<skill_name>",
  );

  // Absolute/workspace paths with basePath
  const workspaceRoot = "/workspace/repo";
  assert.equal(
    resolveDeliveryPath("antigravity", "planning", workspaceRoot),
    "/workspace/repo/.agents/skills/planning",
  );
  assert.equal(
    resolveDeliveryPath("codex", "testing", workspaceRoot),
    "/workspace/repo/.agents/skills/testing",
  );
  assert.equal(
    resolveDeliveryPath("claude", "code-review", workspaceRoot),
    "/workspace/repo/.claude/skills/code-review",
  );

  // Trailing slashes on basePath are sanitized
  assert.equal(
    resolveDeliveryPath("antigravity", "planning", "/workspace/repo///"),
    "/workspace/repo/.agents/skills/planning",
  );
});

test("Visual Identity: Active delivery roots resolve accurately", () => {
  assert.equal(resolveDeliveryRoot("antigravity"), ".agents/skills/");
  assert.equal(resolveDeliveryRoot("codex"), ".agents/skills/");
  assert.equal(resolveDeliveryRoot("claude"), ".claude/skills/");

  assert.equal(resolveDeliveryRoot("antigravity", "C:/Users/app"), "C:/Users/app/.agents/skills/");
  assert.equal(resolveDeliveryRoot("codex", "C:/Users/app"), "C:/Users/app/.agents/skills/");
  assert.equal(resolveDeliveryRoot("claude", "C:/Users/app"), "C:/Users/app/.claude/skills/");
});

// ============================================================================
// TEST SUITE 3: Pristine, In-Sync, Drift & Dirty State Indicators
// ============================================================================

test("Visual Identity: Pristine Baseline state is accurately detected and formatted", () => {
  // Case 1: Explicit pristine flag
  const status1 = calculateProjectStatus({ pristine: true });
  assert.equal(status1.state, "pristine");
  assert.equal(status1.label, "Pristine Baseline");
  assert.equal(status1.badgeClass, "status-pill pristine");
  assert.ok(status1.tooltip.includes("Pristine Baseline"));

  // Case 2: Pinned preset is "builtin-pristine"
  const status2 = calculateProjectStatus({ pinnedPresetId: "builtin-pristine" });
  assert.equal(status2.state, "pristine");
  assert.equal(status2.label, "Pristine Baseline");

  // Case 3: History plan mode was "pristine"
  const status3 = calculateProjectStatus({ history: { mode: "pristine" } });
  assert.equal(status3.state, "pristine");
});

test("Visual Identity: In Sync state is accurately detected when comparison matches", () => {
  const comparison = {
    in_sync: true,
    provider_id: "antigravity",
    summary: { matched: 4 },
  };

  const status = calculateProjectStatus({ comparison });
  assert.equal(status.state, "insync");
  assert.equal(status.label, "In Sync");
  assert.equal(status.badgeClass, "status-pill insync");
  assert.equal(status.driftCount, 0);
  assert.ok(status.tooltip.includes("Observed filesystem bindings match"));
});

test("Visual Identity: Drift Warning accurately calculates drifted count and breakdown", () => {
  const comparison = {
    in_sync: false,
    provider_id: "antigravity",
    summary: {
      matched: 2,
      missing: 1,
      conflict: 1,
      disabled: 1,
    },
  };

  const status = calculateProjectStatus({ comparison });
  assert.equal(status.state, "drift");
  assert.equal(status.label, "Drift Warning (3 drifted)");
  assert.equal(status.driftCount, 3);
  assert.deepEqual(status.driftBreakdown, {
    missing: 1,
    conflict: 1,
    disabled: 1,
  });
  assert.ok(status.tooltip.includes("1 missing"));
  assert.ok(status.tooltip.includes("1 conflict"));
  assert.ok(status.tooltip.includes("1 disabled"));
});

test("Visual Identity: Unapplied Edits (Dirty) state is indicated when changes are pending", () => {
  const status = calculateProjectStatus({ isDirty: true });
  assert.equal(status.state, "dirty");
  assert.equal(status.label, "Unapplied Edits");
  assert.equal(status.badgeClass, "status-pill dirty");
  assert.ok(status.tooltip.includes("Unapplied Edits"));
});

test("Visual Identity: Ready state is returned when no plan or comparison is active", () => {
  const status = calculateProjectStatus({});
  assert.equal(status.state, "ready");
  assert.equal(status.label, "Plan Ready");
  assert.equal(status.badgeClass, "status-pill ready");
});

// ============================================================================
// TEST SUITE 4: Adversarial & Resilience Tests
// ============================================================================

test("Visual Identity: Multi-provider delivery paths with unusual filenames and special characters", () => {
  const strangeSkillNames = [
    "deep-think-v2.0",
    "k8s_operator",
    "prompt-eval@beta",
    "  spaced-skill  ",
  ];

  for (const name of strangeSkillNames) {
    const agyPath = resolveDeliveryPath("antigravity", name);
    const trimmed = name.trim();
    assert.equal(agyPath, `.agents/skills/${trimmed}`);
  }
});

test("Visual Identity: Pristine override precedence over dirty and drift states", () => {
  // If user switches to pristine mode, pristine baseline should take priority
  const status = calculateProjectStatus({
    pristine: true,
    isDirty: true,
    comparison: { in_sync: false, summary: { missing: 2 } },
  });

  assert.equal(status.state, "pristine");
  assert.equal(status.label, "Pristine Baseline");
});
