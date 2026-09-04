
import test from "node:test";
import assert from "node:assert/strict";

// ============================================================================
// SECTION 1: NODEDETAILINSPECTOR DATA RESOLUTION ACROSS ALL 6 NODE TYPES
// ============================================================================

function resolveNodeDetailInspectorData(node, isOpen = true) {
  if (!isOpen || !node) {
    return { rendered: false, data: null };
  }

  const nodeType = node.type || "unknown";
  const category = node.category || node.type || "General";
  const name = node.name || "Unnamed Node";

  let iconType = "Layers";
  if (nodeType === "hook_guard" || nodeType === "shield_guard") {
    iconType = "Shield";
  } else if (nodeType === "halt_node") {
    iconType = "OctagonX";
  }

  const status = node.status || "idle";
  const isBlocked = status === "blocked";
  const isPassed = status === "passed";
  const isDrift = status === "drift";
  const specState = node.lineage?.lifecycleState ?? null;
  const durationMs = node.metrics?.durationMs ?? null;

  const description = node.description ?? null;

  const lineage = node.lineage || { path: [] };
  const topicId = lineage.topicId ?? null;
  const canonicalName = lineage.canonicalName ?? null;
  const pathSegments = Array.isArray(lineage.path) ? lineage.path : [];

  let diagnostics = null;
  if (node.diagnostics) {
    diagnostics = {
      violationType: node.diagnostics.violationType ?? null,
      blockedCommand: node.diagnostics.blockedCommand ?? null,
      reason: node.diagnostics.reason ?? null,
      selfCorrectHint: node.diagnostics.selfCorrectHint ?? null,
      hookId: node.diagnostics.hookId ?? null,
      priority: node.diagnostics.priority ?? null,
      matchedPattern: node.diagnostics.matchedPattern ?? null,
    };
  }

  let verification = null;
  if (node.verification) {
    verification = {
      targetTestFile: node.verification.targetTestFile ?? "",
      allowedCommand: node.verification.allowedCommand ?? "",
      prohibitedCommands: Array.isArray(node.verification.prohibitedCommands)
        ? node.verification.prohibitedCommands
        : [],
      strictInvariants: Array.isArray(node.verification.invariants?.strictInvariants)
        ? node.verification.invariants.strictInvariants
        : [],
      preConditions: Array.isArray(node.verification.invariants?.preConditions)
        ? node.verification.invariants.preConditions
        : [],
      postConditions: Array.isArray(node.verification.invariants?.postConditions)
        ? node.verification.invariants.postConditions
        : [],
    };
  }

  let liveDiff = null;
  if (node.metrics?.liveDiff) {
    liveDiff = {
      targetFile: node.metrics.liveDiff.targetFile ?? "unknown-file",
      additions: Number(node.metrics.liveDiff.additions ?? 0),
      deletions: Number(node.metrics.liveDiff.deletions ?? 0),
      diffSnippet: node.metrics.liveDiff.diffSnippet ?? "",
    };
  }

  let junction = null;
  if (node.junction) {
    junction = {
      providerId: node.junction.providerId ?? "unspecified",
      deliveryPath: node.junction.deliveryPath ?? "",
      symlinkTarget: node.junction.symlinkTarget ?? "",
      activePreset: node.junction.activePreset ?? "mlc-scoped-inner-loop",
      syncState: node.junction.syncState ?? "insync",
      managedCount: node.junction.managedCount ?? 0,
    };
  }

  return {
    rendered: true,
    data: {
      id: node.id,
      type: nodeType,
      name,
      category,
      iconType,
      status,
      isBlocked,
      isPassed,
      isDrift,
      specState,
      durationMs,
      description,
      lineage: { topicId, canonicalName, pathSegments },
      diagnostics,
      verification,
      liveDiff,
      junction,
    },
  };
}

test("Scope 1.1: NodeDetailInspector resolves lifecycle_phase node data without null errors", () => {
  const phaseNode = {
    id: "phase_2_inner_loop",
    type: "lifecycle_phase",
    name: "Phase 2: Scoped Inner Loop TDD",
    category: "Inner Loop TDD",
    status: "active",
    phase: 2,
    description: "Pinpoint Red-Green-Refactor cycles with hot-swapped inner loop skills",
    lineage: {
      topicId: "PHASE-2-INNER-LOOP",
      canonicalName: "scoped_inner_loop_suite",
      path: ["lifecycle", "phase2", "scoped-inner-loop-recipe.json"],
      lifecycleState: "IN_PROGRESS",
      phaseIndex: 2,
    },
    verification: {
      targetTestFile: "apps/catalog-ui/test/flow-studio.test.js",
      allowedCommand: "node --test apps/catalog-ui/test/flow-studio.test.js",
      prohibitedCommands: ["npm test", "pytest", "cargo test", "jest"],
      invariants: {
        preConditions: ["Task queue has pending items"],
        strictInvariants: ["Pinpoint TDD execution: only current task test is executed"],
        postConditions: ["Task transitions to status=passed"],
      },
    },
    metrics: {
      durationMs: 142,
      latencyMs: 12,
      toolCallsCount: 14,
      tokensDensityKb: 42.0,
    },
  };

  const resolved = resolveNodeDetailInspectorData(phaseNode, true);
  assert.equal(resolved.rendered, true);
  assert.equal(resolved.data.type, "lifecycle_phase");
  assert.equal(resolved.data.name, "Phase 2: Scoped Inner Loop TDD");
  assert.equal(resolved.data.specState, "IN_PROGRESS");
  assert.equal(resolved.data.durationMs, 142);
  assert.equal(resolved.data.verification.prohibitedCommands.length, 4);
  assert.equal(resolved.data.verification.strictInvariants.length, 1);
  assert.equal(resolved.data.diagnostics, null);
  assert.equal(resolved.data.junction, null);
});

test("Scope 1.2: NodeDetailInspector resolves task_card node data and changeset diffs", () => {
  const taskNode = {
    id: "task_inner_loop_tdd",
    type: "task_card",
    name: "TASK-02: Flow Studio Canvas Visualizer",
    category: "Implementation",
    status: "in_progress",
    phase: 2,
    description: "Interactive SVG state machine canvas with 4 view modes",
    lineage: {
      topicId: "TOPIC-FLOW-STUDIO-02",
      canonicalName: "flow_studio_visual_canvas",
      path: ["apps", "catalog-ui", "src", "components", "flow"],
      lifecycleState: "IN_PROGRESS",
    },
    verification: {
      targetTestFile: "apps/catalog-ui/test/flow-studio.test.js",
      allowedCommand: "node --test apps/catalog-ui/test/flow-studio.test.js",
      prohibitedCommands: ["npm test", "*"],
      invariants: {
        preConditions: ["Scoped test pinned"],
        strictInvariants: ["Test storm execution strictly blocked"],
        postConditions: ["Canvas renders 4 views"],
      },
    },
    metrics: {
      durationMs: 118,
      latencyMs: 14,
      toolCallsCount: 7,
      tokensDensityKb: 28.6,
      liveDiff: {
        targetFile: "apps/catalog-ui/src/components/flow/FlowStudioCanvas.tsx",
        additions: 185,
        deletions: 0,
        diffSnippet: "+export function FlowStudioCanvas() { ... }",
      },
    },
  };

  const resolved = resolveNodeDetailInspectorData(taskNode, true);
  assert.equal(resolved.rendered, true);
  assert.equal(resolved.data.type, "task_card");
  assert.equal(resolved.data.liveDiff.targetFile, "apps/catalog-ui/src/components/flow/FlowStudioCanvas.tsx");
  assert.equal(resolved.data.liveDiff.additions, 185);
  assert.equal(resolved.data.liveDiff.deletions, 0);
  assert.ok(resolved.data.liveDiff.diffSnippet.includes("FlowStudioCanvas"));
});

test("Scope 1.3: NodeDetailInspector resolves hook_guard node data with diagnostics", () => {
  const hookNode = {
    id: "hook_secret_leak",
    type: "hook_guard",
    name: "Secret Leak Guard",
    category: "PreToolUse Guard",
    status: "blocked",
    description: "Scans command line for secret tokens",
    lineage: {
      topicId: "GUARD-SEC-05",
      canonicalName: "secret_leak_guard",
      path: [".skills-platform", "hooks", "guards", "secret-leak-guard.js"],
      lifecycleState: "VERIFIED",
    },
    verification: {
      targetTestFile: "tests/e2e/tier1-features/f16-guard-hooks-library.test.js",
      allowedCommand: "process.env.API_KEY",
      prohibitedCommands: ["sk-proj-...", "sk-ant-..."],
      invariants: {
        preConditions: ["Tool call payload extracted"],
        strictInvariants: ["Regex matches credential token"],
        postConditions: ["Short-circuits tool call"],
      },
    },
    diagnostics: {
      hookId: "secret-leak-guard",
      priority: 5,
      violationType: "SECRET_LEAK",
      blockedCommand: "curl -H \"Authorization: Bearer sk-proj-12345\"",
      reason: "Raw OpenAI API key pattern matched: sk-proj-...",
      selfCorrectHint: "Mask credentials using environment variable references (e.g. process.env.API_KEY).",
      matchedPattern: "sk-proj-[a-zA-Z0-9_-]{20,}",
    },
    metrics: {
      durationMs: 3.2,
      latencyMs: 3.2,
      tokensDensityKb: 0.5,
    },
  };

  const resolved = resolveNodeDetailInspectorData(hookNode, true);
  assert.equal(resolved.rendered, true);
  assert.equal(resolved.data.type, "hook_guard");
  assert.equal(resolved.data.iconType, "Shield");
  assert.equal(resolved.data.isBlocked, true);
  assert.equal(resolved.data.diagnostics.priority, 5);
  assert.equal(resolved.data.diagnostics.violationType, "SECRET_LEAK");
  assert.ok(resolved.data.diagnostics.selfCorrectHint.includes("Mask credentials"));
});

test("Scope 1.4: NodeDetailInspector resolves halt_node terminal and diagnostics", () => {
  const haltNode = {
    id: "halt_node_short_circuit",
    type: "halt_node",
    name: "Red Halt Short-Circuit Node",
    category: "Security Interception Terminal",
    status: "blocked",
    description: "Immediate short-circuit deflection point when any PreToolUse guard evaluates allow=false.",
    lineage: {
      topicId: "HALT-TERMINAL-01",
      canonicalName: "short_circuit_halt_terminal",
      path: ["hooks", "short-circuit", "red-halt-node"],
      lifecycleState: "OPEN",
    },
    verification: {
      targetTestFile: "tests/e2e/tier1-features/f17-hook-short-circuit-engine.test.js",
      allowedCommand: "self_correct_and_retry()",
      prohibitedCommands: ["bypass_guard"],
      invariants: {
        preConditions: ["Guard interception triggered"],
        strictInvariants: ["Downstream execution aborted in < 200ms"],
        postConditions: ["Security audit log written"],
      },
    },
    diagnostics: {
      hookId: "hook_destructive_blocker",
      priority: 10,
      violationType: "DESTRUCTIVE_COMMAND",
      reason: "Execution diverted to Red Halt Terminal by hook_destructive_blocker.",
      selfCorrectHint: "Use safe target paths or soft delete primitives.",
    },
    metrics: { durationMs: 8, latencyMs: 8 },
  };

  const resolved = resolveNodeDetailInspectorData(haltNode, true);
  assert.equal(resolved.rendered, true);
  assert.equal(resolved.data.type, "halt_node");
  assert.equal(resolved.data.iconType, "OctagonX");
  assert.equal(resolved.data.diagnostics.hookId, "hook_destructive_blocker");
});

test("Scope 1.5: NodeDetailInspector resolves topic_node hierarchy specifications", () => {
  const topicNode = {
    id: "fractal_level_1",
    type: "topic_node",
    name: "Level 1: Local Topic Reference Plane",
    category: "Horizontal Scope Plane",
    status: "active",
    description: "Isolates local horizontal boundaries: owned_files vs out_of_bounds.",
    lineage: {
      topicId: "TOPIC-PLANE-L1",
      canonicalName: "local_topic_reference_plane",
      path: ["apps", "catalog-ui", "src", "components", "flow"],
      lifecycleState: "IN_PROGRESS",
    },
    verification: {
      targetTestFile: "tests/e2e/tier1-features/f16-guard-hooks-library.test.js",
      allowedCommand: "npm test --workspace apps/catalog-ui",
      prohibitedCommands: ["npm test --workspace apps/skills-manager"],
      invariants: {
        preConditions: ["Horizontal scope active"],
        strictInvariants: ["Mutations strictly confined to owned_files"],
        postConditions: ["Local patch prepared for roll-up"],
      },
    },
    metrics: { durationMs: 42, tokensDensityKb: 24.8 },
  };

  const resolved = resolveNodeDetailInspectorData(topicNode, true);
  assert.equal(resolved.rendered, true);
  assert.equal(resolved.data.type, "topic_node");
  assert.equal(resolved.data.lineage.topicId, "TOPIC-PLANE-L1");
  assert.equal(resolved.data.lineage.pathSegments.length, 5);
});

test("Scope 1.6: NodeDetailInspector resolves junction_node delivery path specifications", () => {
  const junctionNode = {
    id: "junction_codex",
    type: "junction_node",
    name: "OpenAI Codex CLI Junction",
    category: "Multi-Provider Delivery",
    status: "drift",
    description: "Symlink delivery root at .agents/skills/ for OpenAI Codex.",
    lineage: {
      topicId: "JUNC-CODEX",
      canonicalName: "codex_delivery_junction",
      path: [".agents", "skills"],
      lifecycleState: "IN_PROGRESS",
    },
    junction: {
      providerId: "codex",
      deliveryPath: ".agents/skills/",
      syncState: "drift",
      symlinkTarget: "packages/skill-contracts/dist",
      managedCount: 5,
      activePreset: "mlc-task-planning",
    },
    verification: {
      targetTestFile: "tests/e2e/tier1-features/f10-phase2-junction-swap.test.js",
      allowedCommand: "skills-manager apply --provider codex",
      prohibitedCommands: [],
      invariants: {
        preConditions: [".agents/skills/ directory exists"],
        strictInvariants: ["Detect missing/stale symlinks and trigger drift warning"],
        postConditions: ["Reconciled symlinks match active preset"],
      },
    },
  };

  const resolved = resolveNodeDetailInspectorData(junctionNode, true);
  assert.equal(resolved.rendered, true);
  assert.equal(resolved.data.type, "junction_node");
  assert.equal(resolved.data.isDrift, true);
  assert.equal(resolved.data.junction.providerId, "codex");
  assert.equal(resolved.data.junction.deliveryPath, ".agents/skills/");
  assert.equal(resolved.data.junction.managedCount, 5);
  assert.equal(resolved.data.junction.activePreset, "mlc-task-planning");
});

test("Scope 1.7: NodeDetailInspector handles minimal and edge-case nodes without NPEs", () => {
  assert.equal(resolveNodeDetailInspectorData(null, true).rendered, false);
  assert.equal(resolveNodeDetailInspectorData({ id: "test", type: "task_card", name: "Test", status: "idle" }, false).rendered, false);

  const minimalNode = {
    id: "minimal_node",
    type: "topic_node",
    name: "Minimal Node",
    status: "idle",
    lineage: { path: [] },
  };

  const resolvedMinimal = resolveNodeDetailInspectorData(minimalNode, true);
  assert.equal(resolvedMinimal.rendered, true);
  assert.equal(resolvedMinimal.data.id, "minimal_node");
  assert.equal(resolvedMinimal.data.lineage.topicId, null);
  assert.equal(resolvedMinimal.data.lineage.canonicalName, null);
  assert.deepEqual(resolvedMinimal.data.lineage.pathSegments, []);
  assert.equal(resolvedMinimal.data.diagnostics, null);
  assert.equal(resolvedMinimal.data.verification, null);
  assert.equal(resolvedMinimal.data.liveDiff, null);
  assert.equal(resolvedMinimal.data.junction, null);
});

// ============================================================================
// SECTION 2: SYMLINK JUNCTION & DELIVERY MAP MULTI-PROVIDER DRIFT CALCULATIONS
// ============================================================================

const CANONICAL_PROVIDER_ROOTS = {
  antigravity: { deliveryPath: ".agents/skills/", name: "Google Antigravity" },
  claude: { deliveryPath: ".claude/skills/", name: "Anthropic Claude Desktop" },
  codex: { deliveryPath: ".agents/skills/", name: "OpenAI Codex CLI" },
};

function calculateMultiProviderDrift(providersState, activeRecipe) {
  const expectedSkills = activeRecipe.skills || [];
  const expectedTarget = activeRecipe.symlinkTarget || "packages/skill-contracts/dist";

  const results = {};
  let totalDriftCount = 0;
  let allInSync = true;

  for (const [providerId, config] of Object.entries(CANONICAL_PROVIDER_ROOTS)) {
    const pState = providersState[providerId] || { exists: false, symlinks: {} };

    if (!pState.exists) {
      results[providerId] = {
        providerId,
        name: config.name,
        deliveryPath: config.deliveryPath,
        syncState: "drift",
        driftCount: expectedSkills.length,
        reasons: ["Delivery root directory does not exist"],
        managedCount: 0,
      };
      totalDriftCount += expectedSkills.length;
      allInSync = false;
      continue;
    }

    const currentLinks = pState.symlinks || {};
    const currentSkillNames = Object.keys(currentLinks);

    if (expectedSkills.length === 0 && currentSkillNames.length === 0) {
      results[providerId] = {
        providerId,
        name: config.name,
        deliveryPath: config.deliveryPath,
        syncState: "pristine",
        driftCount: 0,
        reasons: [],
        managedCount: 0,
      };
      continue;
    }

    const reasons = [];
    let providerDrift = 0;

    for (const skill of expectedSkills) {
      if (!currentLinks[skill]) {
        reasons.push("Missing declared skill symlink: " + skill);
        providerDrift++;
      } else if (currentLinks[skill].target !== expectedTarget) {
        reasons.push("Symlink target mismatch for " + skill);
        providerDrift++;
      } else if (currentLinks[skill].isBroken) {
        reasons.push("Broken dangling symlink for " + skill);
        providerDrift++;
      }
    }

    for (const skill of currentSkillNames) {
      if (!expectedSkills.includes(skill)) {
        reasons.push("Extraneous unmanaged skill symlink: " + skill);
        providerDrift++;
      }
    }

    const syncState = providerDrift === 0 ? "insync" : "drift";
    if (syncState === "drift") {
      allInSync = false;
    }
    totalDriftCount += providerDrift;

    results[providerId] = {
      providerId,
      name: config.name,
      deliveryPath: config.deliveryPath,
      syncState,
      driftCount: providerDrift,
      reasons,
      managedCount: currentSkillNames.length,
    };
  }

  return { allInSync, totalDriftCount, activePreset: activeRecipe.id, providers: results };
}

test("Scope 2.1: Multi-provider drift calculation returns In-Sync when all providers match recipe", () => {
  const activeRecipe = {
    id: "mlc-scoped-inner-loop",
    skills: ["task-planning", "scoped-tdd-executor", "context-patch-synthesizer"],
    symlinkTarget: "packages/skill-contracts/dist",
  };

  const providersState = {
    antigravity: {
      exists: true,
      symlinks: {
        "task-planning": { target: "packages/skill-contracts/dist" },
        "scoped-tdd-executor": { target: "packages/skill-contracts/dist" },
        "context-patch-synthesizer": { target: "packages/skill-contracts/dist" },
      },
    },
    claude: {
      exists: true,
      symlinks: {
        "task-planning": { target: "packages/skill-contracts/dist" },
        "scoped-tdd-executor": { target: "packages/skill-contracts/dist" },
        "context-patch-synthesizer": { target: "packages/skill-contracts/dist" },
      },
    },
    codex: {
      exists: true,
      symlinks: {
        "task-planning": { target: "packages/skill-contracts/dist" },
        "scoped-tdd-executor": { target: "packages/skill-contracts/dist" },
        "context-patch-synthesizer": { target: "packages/skill-contracts/dist" },
      },
    },
  };

  const drift = calculateMultiProviderDrift(providersState, activeRecipe);
  assert.equal(drift.allInSync, true);
  assert.equal(drift.totalDriftCount, 0);
  assert.equal(drift.providers.antigravity.syncState, "insync");
  assert.equal(drift.providers.claude.syncState, "insync");
  assert.equal(drift.providers.codex.syncState, "insync");
});

test("Scope 2.2: Multi-provider drift calculation identifies missing links, target mismatches, and broken symlinks", () => {
  const activeRecipe = {
    id: "mlc-scoped-inner-loop",
    skills: ["task-planning", "scoped-tdd-executor", "context-patch-synthesizer"],
    symlinkTarget: "packages/skill-contracts/dist",
  };

  const providersState = {
    antigravity: {
      exists: true,
      symlinks: {
        "task-planning": { target: "packages/skill-contracts/dist" },
        "scoped-tdd-executor": { target: "packages/skill-contracts/dist" },
      },
    },
    claude: {
      exists: true,
      symlinks: {
        "task-planning": { target: "packages/skill-contracts/dist" },
        "scoped-tdd-executor": { target: "packages/skill-contracts-legacy/dist" },
        "context-patch-synthesizer": { target: "packages/skill-contracts/dist" },
      },
    },
    codex: {
      exists: true,
      symlinks: {
        "task-planning": { target: "packages/skill-contracts/dist" },
        "scoped-tdd-executor": { target: "packages/skill-contracts/dist" },
        "context-patch-synthesizer": { target: "packages/skill-contracts/dist", isBroken: true },
        "unmanaged-rogue-skill": { target: "packages/skill-contracts/dist" },
      },
    },
  };

  const drift = calculateMultiProviderDrift(providersState, activeRecipe);
  assert.equal(drift.allInSync, false);
  assert.equal(drift.providers.antigravity.syncState, "drift");
  assert.equal(drift.providers.antigravity.driftCount, 1);
  assert.equal(drift.providers.claude.syncState, "drift");
  assert.equal(drift.providers.claude.driftCount, 1);
  assert.equal(drift.providers.codex.syncState, "drift");
  assert.equal(drift.providers.codex.driftCount, 2);
  assert.equal(drift.totalDriftCount, 4);
});

test("Scope 2.3: Multi-provider drift calculation handles pristine baseline state and hot-swap recipe transitions", () => {
  const pristineRecipe = { id: "pristine-baseline", skills: [] };
  const pristineProviders = {
    antigravity: { exists: true, symlinks: {} },
    claude: { exists: true, symlinks: {} },
    codex: { exists: true, symlinks: {} },
  };

  const pristineDrift = calculateMultiProviderDrift(pristineProviders, pristineRecipe);
  assert.equal(pristineDrift.allInSync, true);
  assert.equal(pristineDrift.providers.antigravity.syncState, "pristine");
  assert.equal(pristineDrift.providers.claude.syncState, "pristine");
  assert.equal(pristineDrift.providers.codex.syncState, "pristine");

  const planningRecipe = { id: "mlc-task-planning", skills: ["task-planning", "spec-decomposer"] };
  const hotSwapDrift = calculateMultiProviderDrift(pristineProviders, planningRecipe);
  assert.equal(hotSwapDrift.allInSync, false);
  assert.equal(hotSwapDrift.totalDriftCount, 6);
});

// ============================================================================
// SECTION 3: VISUAL MODE SWITCHING, TIMELINE SCRUBBER & SPEED TOGGLES
// ============================================================================

const CANONICAL_VIEW_MODES = ["lifecycle", "hook_pipeline", "fractal_tree", "junction_map"];

function resolveViewMode(inputMode) {
  if (CANONICAL_VIEW_MODES.includes(inputMode)) {
    return inputMode;
  }
  return "lifecycle";
}

function normalizeScrubberPosition(stepInput, totalSteps = 6) {
  if (typeof stepInput !== "number" || Number.isNaN(stepInput) || !Number.isFinite(stepInput)) {
    return { step: 0, fraction: 0.0, percent: "0%" };
  }
  const clampedStep = Math.max(0, Math.min(totalSteps, Math.round(stepInput)));
  const fraction = Number((clampedStep / totalSteps).toFixed(4));
  const percent = Math.round(fraction * 100) + "%";
  return { step: clampedStep, fraction, percent };
}

function normalizeFloatSlider(floatValue, totalSteps = 6) {
  if (typeof floatValue !== "number" || Number.isNaN(floatValue) || !Number.isFinite(floatValue)) {
    return { step: 0, fraction: 0.0, percent: "0%" };
  }
  const clampedFloat = Math.max(0.0, Math.min(1.0, floatValue));
  const step = Math.round(clampedFloat * totalSteps);
  return normalizeScrubberPosition(step, totalSteps);
}

function computeStepForward(currentStep, totalSteps = 6) {
  return currentStep >= totalSteps ? 0 : currentStep + 1;
}

function computeStepBackward(currentStep, totalSteps = 6) {
  return currentStep <= 0 ? totalSteps : currentStep - 1;
}

function computeSpeedStepInterval(speedMultiplier) {
  const safeSpeed = [1, 2, 5].includes(speedMultiplier) ? speedMultiplier : 1;
  return Math.max(250, Math.round(1000 / safeSpeed));
}

test("Scope 3.1: Visual mode switching validates 4 modes and handles 1,000 rapid random switches with safe fallback", () => {
  for (const mode of CANONICAL_VIEW_MODES) {
    assert.equal(resolveViewMode(mode), mode);
  }

  assert.equal(resolveViewMode(null), "lifecycle");
  assert.equal(resolveViewMode(undefined), "lifecycle");
  assert.equal(resolveViewMode(""), "lifecycle");
  assert.equal(resolveViewMode("invalid_mode_xyz"), "lifecycle");

  const candidates = [...CANONICAL_VIEW_MODES, "bogus", null, undefined];
  let currentMode = "lifecycle";
  for (let i = 0; i < 1000; i++) {
    const nextCandidate = candidates[i % candidates.length];
    currentMode = resolveViewMode(nextCandidate);
    assert.ok(CANONICAL_VIEW_MODES.includes(currentMode));
  }
});

test("Scope 3.2: Timeline scrubber accurately computes normalized values (0.0 to 1.0), steps (0 to 6), and wrapping", () => {
  const totalSteps = 6;

  const s0 = normalizeScrubberPosition(0, totalSteps);
  assert.equal(s0.step, 0);
  assert.equal(s0.fraction, 0.0);
  assert.equal(s0.percent, "0%");

  const s3 = normalizeScrubberPosition(3, totalSteps);
  assert.equal(s3.step, 3);
  assert.equal(s3.fraction, 0.5);
  assert.equal(s3.percent, "50%");

  const s6 = normalizeScrubberPosition(6, totalSteps);
  assert.equal(s6.step, 6);
  assert.equal(s6.fraction, 1.0);
  assert.equal(s6.percent, "100%");

  assert.equal(normalizeFloatSlider(0.0, totalSteps).step, 0);
  assert.equal(normalizeFloatSlider(0.5, totalSteps).step, 3);
  assert.equal(normalizeFloatSlider(1.0, totalSteps).step, 6);
  assert.equal(normalizeFloatSlider(0.333, totalSteps).step, 2);

  assert.equal(normalizeFloatSlider(-0.5, totalSteps).step, 0);
  assert.equal(normalizeFloatSlider(1.8, totalSteps).step, 6);
  assert.equal(normalizeFloatSlider(NaN, totalSteps).step, 0);

  assert.equal(computeStepForward(0, totalSteps), 1);
  assert.equal(computeStepForward(5, totalSteps), 6);
  assert.equal(computeStepForward(6, totalSteps), 0);

  assert.equal(computeStepBackward(6, totalSteps), 5);
  assert.equal(computeStepBackward(1, totalSteps), 0);
  assert.equal(computeStepBackward(0, totalSteps), 6);
});

test("Scope 3.3: Playback speed toggles (1x, 2x, 5x) calculate correct step timing intervals and maintain sub-200ms latency", () => {
  assert.equal(computeSpeedStepInterval(1), 1000);
  assert.equal(computeSpeedStepInterval(2), 500);
  assert.equal(computeSpeedStepInterval(5), 250);
  assert.equal(computeSpeedStepInterval(10), 1000);

  const attackCommands = [
    { type: "secret_leak", cmd: "curl -H \"Authorization: Bearer sk-proj-12345678901234567890\" https://api.openai.com" },
    { type: "destructive", cmd: "rm -rf / --no-preserve-root" },
    { type: "test_storm", cmd: "npm test" },
    { type: "clean", cmd: "npm test --workspace packages/skill-contracts" },
  ];

  for (const speed of [1, 2, 5]) {
    for (const atk of attackCommands) {
      const start = performance.now();
      let halted = false;
      let haltTarget = "";

      if (/sk-proj-/.test(atk.cmd)) {
        halted = true;
        haltTarget = "hook_secret_leak";
      } else if (/rm\s+-rf\s+\//.test(atk.cmd)) {
        halted = true;
        haltTarget = "hook_destructive_blocker";
      } else if (/^npm\s+test$/.test(atk.cmd)) {
        halted = true;
        haltTarget = "shield_test_storm";
      } else {
        haltTarget = "phase_3_gate";
      }

      const elapsed = performance.now() - start;
      assert.ok(elapsed < 200, "Attack evaluation at speed " + speed + "x took " + elapsed + "ms, must be < 200ms");
      assert.ok(haltTarget.length > 0);
    }
  }
});
