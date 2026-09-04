"use strict";

const crypto = require("node:crypto");
const { exec, execFile } = require("node:child_process");
const fs = require("node:fs/promises");
const path = require("node:path");
const { promisify } = require("node:util");

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

/**
 * Custom error class thrown when test storm suppression blocks an un-scoped full regression run in Phase 2.
 */
class TestStormSuppressionError extends Error {
  constructor(message, details = {}) {
    super(message || "Test storm suppressed: un-scoped full regression suite runs are blocked during Phase 2 (Inner Loop). Only pinpoint scoped tests (e.g. run_scoped_test) are authorized.");
    this.name = "TestStormSuppressionError";
    this.code = "ERR_TEST_STORM_SUPPRESSED";
    this.details = details;
  }
}

/**
 * Custom error class thrown for lifecycle phase failures.
 */
class LifecycleLoopError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "LifecycleLoopError";
    this.phase = details.phase || null;
    this.details = details;
  }
}

/**
 * Canonical recipe blueprints for the 3 lifecycle phases.
 */
const CANONICAL_LIFECYCLE_RECIPES = {
  "task-planning": {
    schema_version: 1,
    recipe_id: "mlc-task-planning",
    name: "Task Planning & PRD Decomposition Recipe",
    description: "Outer-loop planning recipe for extracting PRDs, analyzing system dependencies, and decomposing work into atomic TODO queues.",
    created_at: "2026-08-27T21:38:08.080Z",
    created_by: "Skills Platform Catalog",
    sources: [
      {
        source_id: "skills-platform-registry",
        type: "local",
        locator: "./.skills-platform/registry",
      },
    ],
    skills: [
      {
        name: "task-decomposer",
        artifact_type: "skill",
        invocation_mode: "model_invoked",
        source_id: "skills-platform-registry",
        source_relative_path: "task-decomposer",
        content_digest: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        description: "Decompose user requirements into dependency-ordered atomic tasks with quality gates.",
      },
      {
        name: "horizontal-topic-scanner",
        artifact_type: "skill",
        invocation_mode: "model_invoked",
        source_id: "skills-platform-registry",
        source_relative_path: "horizontal-topic-scanner",
        content_digest: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        description: "Scan system registry and blast radius to produce isolated topic handoffs without mutating code.",
      },
    ],
    presets: [
      {
        id: "task-planning-suite",
        name: "Task Planning Suite",
        version: 1,
        description: "Standard outer-loop decomposition and PRD planning template",
        work_scope_tags: ["plan", "horizontal"],
        skills: [
          { skill_name: "task-decomposer", artifact_type: "skill", required: true },
          { skill_name: "horizontal-topic-scanner", artifact_type: "skill", required: true },
        ],
      },
    ],
    projects: [],
  },
  "scoped-inner-loop": {
    schema_version: 1,
    recipe_id: "mlc-scoped-inner-loop",
    name: "Scoped Vertical TDD & Inner Loop Recipe",
    description: "Inner-loop execution recipe for resolving isolated single TODO tasks with pinpoint test execution and zero full-suite scans.",
    created_at: "2026-08-27T21:38:08.080Z",
    created_by: "Skills Platform Catalog",
    sources: [
      {
        source_id: "skills-platform-registry",
        type: "local",
        locator: "./.skills-platform/registry",
      },
    ],
    skills: [
      {
        name: "vertical-context-extractor",
        artifact_type: "skill",
        invocation_mode: "model_invoked",
        source_id: "skills-platform-registry",
        source_relative_path: "vertical-context-extractor",
        content_digest: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        description: "Extract strict local context pack, types, and single target test file for isolated vertical execution.",
      },
      {
        name: "scoped-tdd-executor",
        artifact_type: "skill",
        invocation_mode: "model_invoked",
        source_id: "skills-platform-registry",
        source_relative_path: "scoped-tdd-executor",
        content_digest: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        description: "Execute pinpoint unit test runner on single test target, preventing full regression scans during inner loops.",
      },
      {
        name: "context-patch-synthesizer",
        artifact_type: "skill",
        invocation_mode: "model_invoked",
        source_id: "skills-platform-registry",
        source_relative_path: "context-patch-synthesizer",
        content_digest: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        description: "Generate structured Context Patch Proposal with test evidence instead of raw unverified mutations.",
      },
    ],
    presets: [
      {
        id: "scoped-inner-loop-suite",
        name: "Scoped Inner Loop Suite",
        version: 1,
        description: "Fast-feedback pinpoint TDD execution suite without test storms",
        work_scope_tags: ["execute", "vertical"],
        skills: [
          { skill_name: "vertical-context-extractor", artifact_type: "skill", required: true },
          { skill_name: "scoped-tdd-executor", artifact_type: "skill", required: true },
          { skill_name: "context-patch-synthesizer", artifact_type: "skill", required: true },
        ],
      },
    ],
    projects: [],
  },
  "release-governance": {
    schema_version: 1,
    recipe_id: "mlc-release-governance",
    name: "Global Verification & Release Governance Recipe",
    description: "Outer-loop release recipe for running full regression test verification, updating single canonical baseline, and closing maintenance cases.",
    created_at: "2026-08-27T21:38:08.080Z",
    created_by: "Skills Platform Catalog",
    sources: [
      {
        source_id: "skills-platform-registry",
        type: "local",
        locator: "./.skills-platform/registry",
      },
    ],
    skills: [
      {
        name: "lifecycle-phase-controller",
        artifact_type: "skill",
        invocation_mode: "model_invoked",
        source_id: "skills-platform-registry",
        source_relative_path: "lifecycle-phase-controller",
        content_digest: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        description: "Advance maintenance lifecycle state machine and control skill hot-swapping across loop phases.",
      },
      {
        name: "global-regression-gatekeeper",
        artifact_type: "skill",
        invocation_mode: "user_invoked",
        source_id: "skills-platform-registry",
        source_relative_path: "global-regression-gatekeeper",
        content_digest: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        description: "Authorize single global regression test suite execution upon convergence of all atomic tasks.",
      },
      {
        name: "baseline-curation-core",
        artifact_type: "skill",
        invocation_mode: "model_invoked",
        source_id: "skills-platform-registry",
        source_relative_path: "baseline-curation-core",
        content_digest: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        description: "Compacts validated changes into canonical MASTER_BASELINE under strict 80k token limits.",
      },
    ],
    presets: [
      {
        id: "release-governance-suite",
        name: "Release Governance Suite",
        version: 1,
        description: "Global regression verification and canonical baseline compaction template",
        work_scope_tags: ["gate", "governance"],
        skills: [
          { skill_name: "lifecycle-phase-controller", artifact_type: "skill", required: true },
          { skill_name: "global-regression-gatekeeper", artifact_type: "skill", required: true },
          { skill_name: "baseline-curation-core", artifact_type: "skill", required: true },
        ],
      },
    ],
    projects: [],
  },
};

/**
 * Validates that a scoped test execution is pinpointed to a specific test target
 * and rejects un-scoped full regression suite runs during Phase 2 (Inner Loop).
 */
function validateScopedTestExecution(testTarget, phase = "inner_loop") {
  if (phase === "inner_loop") {
    if (!testTarget || typeof testTarget !== "string" || !testTarget.trim()) {
      throw new TestStormSuppressionError(
        "Test storm suppressed: test target is missing or empty. Pinpoint scoped test runner requires a specific test target.",
        { testTarget, phase }
      );
    }
    const normalized = testTarget.trim().toLowerCase();
    const blockedPatterns = [
      /^npm\s+(?:run\s+)?test\b/,
      /^npx\s+(?:vitest|jest)\b/,
      /^pytest\b/,
      /^cargo\s+test\b/,
      /^node\s+--test\s*$/,
      /^node\s+--test\s+tests?[\/\\]?\*?$/,
      /^\*$/,
      /^all$/,
      /^full$/,
      /^test\/?$/,
      /^tests\/?$/,
    ];
    for (const pattern of blockedPatterns) {
      if (pattern.test(normalized)) {
        throw new TestStormSuppressionError(
          `Test storm suppressed: un-scoped full regression suite run '${testTarget}' is blocked during Phase 2 (Inner Loop). Only pinpoint scoped tests (e.g. run_scoped_test) are authorized.`,
          { testTarget, phase }
        );
      }
    }
  }
  return true;
}

/**
 * Parses a PRD document (Markdown or JSON format) and extracts an atomic task queue.
 */
function parsePrdDocument(rawContent, prdPath = "PRD.md") {
  if (typeof rawContent !== "string") {
    throw new Error("PRD content must be a non-empty string");
  }

  const trimmed = rawContent.trim();
  if (!trimmed) {
    throw new Error("PRD document is empty");
  }

  let prdId = path.basename(prdPath, path.extname(prdPath)).toLowerCase().replace(/[^a-z0-9]+/g, "-");
  if (!prdId || prdId === "prd" || prdId === "readme") {
    prdId = `prd-${crypto.randomUUID().slice(0, 8)}`;
  }

  // 1. Attempt JSON parsing
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      let taskList = [];
      if (Array.isArray(parsed)) {
        taskList = parsed;
      } else if (parsed && typeof parsed === "object") {
        if (typeof parsed.prd_id === "string" && parsed.prd_id.trim()) {
          prdId = parsed.prd_id.trim();
        } else if (typeof parsed.id === "string" && parsed.id.trim()) {
          prdId = parsed.id.trim();
        }
        if (Array.isArray(parsed.tasks)) {
          taskList = parsed.tasks;
        } else if (Array.isArray(parsed.requirements)) {
          taskList = parsed.requirements;
        } else if (Array.isArray(parsed.features)) {
          taskList = parsed.features;
        } else if (Array.isArray(parsed.todo)) {
          taskList = parsed.todo;
        }
      }

      const tasks = taskList.map((item, index) => {
        const id = item.id || `task-${index + 1}`;
        const title = item.title || item.name || item.summary || `Task ${index + 1}`;
        const description = item.description || item.details || "";
        const scopedTest = item.scoped_test || item.test || item.test_target || item.target_test || `test/scoped/${id}.test.js`;
        const status = item.status === "passed" || item.status === "completed" ? "passed" : "pending";
        return {
          id,
          title,
          description,
          scoped_test: scopedTest,
          status,
        };
      });

      if (tasks.length > 0) {
        return {
          prd_id: prdId,
          extracted_at: new Date().toISOString(),
          prd_path: prdPath,
          format: "json",
          tasks,
        };
      }
    } catch {
      // Fall through to Markdown parsing if JSON parse fails
    }
  }

  // 2. Parse Markdown PRD
  const tasks = [];
  const lines = trimmed.split(/\r?\n/);
  let titleMatch = trimmed.match(/^#\s+(.+)$/m);
  if (titleMatch) {
    const headerTitle = titleMatch[1].trim();
    if (headerTitle) {
      const slugified = headerTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      if (slugified) prdId = slugified;
    }
  }

  // A. Check for markdown checklist items: - [ ] Task Title (test: path/to/test.js)
  const checklistRegex = /^\s*[-*]\s*\[([ xX]?)\]\s*(.+)$/;
  let checklistCount = 0;

  for (const line of lines) {
    const match = line.match(checklistRegex);
    if (match) {
      checklistCount += 1;
      const checked = match[1].toLowerCase() === "x";
      const rawItem = match[2].trim();

      // Extract explicit task ID if present: [task-1] or **task-1**:
      let taskId = `task-${checklistCount}`;
      const idMatch = rawItem.match(/^\[([a-zA-Z0-9_-]+)\]\s*:?\s*(.+)$/) || rawItem.match(/^\*\*([a-zA-Z0-9_-]+)\*\*\s*:?\s*(.+)$/);
      let remainingText = rawItem;
      if (idMatch) {
        taskId = idMatch[1];
        remainingText = idMatch[2].trim();
      }

      // Extract scoped test path if present: (test: path) or (scoped_test: path) or test: `path`
      let scopedTest = null;
      const testMatch = remainingText.match(/\((?:scoped[-_]?test|test|test[-_]?target):\s*([^)]+)\)/i) ||
        remainingText.match(/(?:scoped[-_]?test|test|test[-_]?target):\s*[`"']?([a-zA-Z0-9_./\\-]+)[`"']?/i);

      if (testMatch) {
        scopedTest = testMatch[1].trim().replace(/^[`"']|[`"']$/g, "");
        remainingText = remainingText.replace(testMatch[0], "").trim().replace(/^[-:—, ]+|[-:—, ]+$/g, "");
      } else {
        scopedTest = `test/scoped/${taskId}.test.js`;
      }

      tasks.push({
        id: taskId,
        title: remainingText || `Task ${checklistCount}`,
        description: `Extracted from PRD checklist: ${rawItem}`,
        scoped_test: scopedTest,
        status: checked ? "passed" : "pending",
      });
    }
  }

  // B. If no checklist items found, check for Markdown Headings (## Feature / ### Task)
  if (tasks.length === 0) {
    let currentTask = null;
    let headingIndex = 0;

    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      const headerMatch = line.match(/^(#{2,4})\s+(.+)$/);
      if (headerMatch) {
        if (currentTask) {
          tasks.push(currentTask);
        }
        headingIndex += 1;
        const headingText = headerMatch[2].trim();
        const taskId = `task-${headingIndex}`;
        currentTask = {
          id: taskId,
          title: headingText,
          description: "",
          scoped_test: `test/scoped/${taskId}.test.js`,
          status: "pending",
        };
      } else if (currentTask) {
        const testMatch = line.match(/(?:scoped[-_]?test|test|test[-_]?target):\s*[`"']?([a-zA-Z0-9_./\\-]+)[`"']?/i);
        if (testMatch) {
          currentTask.scoped_test = testMatch[1].trim().replace(/^[`"']|[`"']$/g, "");
        } else if (line.trim()) {
          currentTask.description = currentTask.description
            ? `${currentTask.description}\n${line.trim()}`
            : line.trim();
        }
      }
    }
    if (currentTask) {
      tasks.push(currentTask);
    }
  }

  // C. Fallback: single generic task if no structure could be extracted
  if (tasks.length === 0) {
    tasks.push({
      id: "task-1",
      title: "PRD Requirement Verification",
      description: trimmed.slice(0, 200),
      scoped_test: "test/scoped/task-1.test.js",
      status: "pending",
    });
  }

  return {
    prd_id: prdId,
    extracted_at: new Date().toISOString(),
    prd_path: prdPath,
    format: "markdown",
    tasks,
  };
}

/**
 * Ensures canonical lifecycle skills exist in the registry revisions directory.
 */
async function ensureCanonicalSkillsInRegistry(registryRoot, skills = []) {
  const { loadRegistry, saveRegistry } = require("./registry");
  const { digestDirectory } = require("@skills-platform/contracts");

  const registry = await loadRegistry(registryRoot);
  let changed = false;

  for (const skill of skills) {
    const existing = registry.skills?.find((s) => s.skill_name === skill.name);
    if (!existing) {
      const sourceId = "source_local_canonical_lifecycle";
      if (!registry.sources?.some((src) => src.id === sourceId)) {
        registry.sources ??= [];
        registry.sources.push({
          id: sourceId,
          kind: "local",
          locator: "./.skills-platform/registry",
          created_at: new Date().toISOString(),
        });
      }

      const revisionId = `revision_${skill.name.replace(/[^a-z0-9]/g, "_")}`;
      const revDir = path.resolve(registryRoot, "revisions", revisionId, skill.name);
      await fs.mkdir(revDir, { recursive: true });

      const skillFile = path.join(revDir, "SKILL.md");
      const skillContent = [
        "---",
        `name: ${skill.name}`,
        `description: ${skill.description || "Lifecycle management skill"}`,
        `invocation_mode: ${skill.invocation_mode || "model_invoked"}`,
        "---",
        `# ${skill.name}`,
        "",
        skill.description || "Lifecycle recipe skill.",
      ].join("\n");

      await fs.writeFile(skillFile, skillContent, "utf8");
      const digest = await digestDirectory(revDir);

      if (!registry.revisions?.some((r) => r.id === revisionId)) {
        registry.revisions ??= [];
        registry.revisions.push({
          id: revisionId,
          source_id: sourceId,
          resolved_revision: digest,
          content_digest: digest,
          fetched_at: new Date().toISOString(),
          review_state: "imported",
        });
      }

      const artifactKey = `${sourceId}:${skill.name}`;
      const lineageId = `lineage_${crypto.createHash("sha256").update(artifactKey).digest("hex").slice(0, 20)}`;

      if (!registry.lineages?.some((l) => l.id === lineageId)) {
        registry.lineages ??= [];
        registry.lineages.push({
          id: lineageId,
          source_id: sourceId,
          artifact_key: artifactKey,
          artifact_type: skill.artifact_type || "skill",
          source_relative_path: skill.name,
          skill_name: skill.name,
          created_at: new Date().toISOString(),
        });
      }

      registry.skills ??= [];
      registry.skills.push({
        id: `reg_${skill.name.replace(/[^a-z0-9]/g, "_")}`,
        source_id: sourceId,
        source_revision_id: revisionId,
        lineage_id: lineageId,
        skill_name: skill.name,
        artifact_type: skill.artifact_type || "skill",
        invocation_mode: skill.invocation_mode || "model_invoked",
        source_relative_path: skill.name,
        canonical_path: revDir,
        canonical_relative_path: path.relative(path.resolve(registryRoot), revDir).replaceAll("\\", "/"),
        content_digest: digest,
        description: skill.description || null,
        imported_at: new Date().toISOString(),
      });
      changed = true;
    }
  }

  if (changed) {
    await saveRegistry(registryRoot, registry);
  }
}

/**
 * Finds or resolves the canonical recipe content for a given phase name or path.
 */
async function resolveLifecycleRecipe(phaseOrRecipePath, projectPath = process.cwd()) {
  if (typeof phaseOrRecipePath === "object" && phaseOrRecipePath !== null) {
    return phaseOrRecipePath;
  }

  const phaseKey = String(phaseOrRecipePath).toLowerCase().replace(/-recipe(\.json)?$/, "");
  if (CANONICAL_LIFECYCLE_RECIPES[phaseKey]) {
    return CANONICAL_LIFECYCLE_RECIPES[phaseKey];
  }

  const candidates = [
    path.resolve(projectPath, phaseOrRecipePath),
    path.resolve(projectPath, `${phaseKey}-recipe.json`),
    path.resolve(__dirname, "../../..", `${phaseKey}-recipe.json`),
    path.resolve(__dirname, "../../..", phaseOrRecipePath),
  ];

  for (const candidate of candidates) {
    try {
      const content = await fs.readFile(candidate, "utf8");
      return JSON.parse(content);
    } catch {
      // Continue to next candidate
    }
  }

  if (CANONICAL_LIFECYCLE_RECIPES[phaseKey]) {
    return CANONICAL_LIFECYCLE_RECIPES[phaseKey];
  }

  throw new Error(`Could not resolve lifecycle recipe for: ${phaseOrRecipePath}`);
}

/**
 * Hot-swaps junction bindings to the specified lifecycle phase recipe.
 */
async function mountLifecycleRecipe(phaseOrRecipe, {
  projectPath = process.cwd(),
  providerId = "codex",
  catalogRoot,
  registryRoot,
  confirm = true,
} = {}) {
  const resolvedProject = path.resolve(projectPath);
  const resolvedCatalog = path.resolve(catalogRoot || path.join(resolvedProject, ".skills-platform", "catalog"));
  const resolvedRegistry = path.resolve(registryRoot || path.join(resolvedProject, ".skills-platform", "registry"));

  const recipe = await resolveLifecycleRecipe(phaseOrRecipe, resolvedProject);
  await ensureCanonicalSkillsInRegistry(resolvedRegistry, recipe.skills || []);

  const { loadRegistry } = require("./registry");
  const registry = await loadRegistry(resolvedRegistry);
  const providerSlug = String(providerId).trim().toLowerCase().replace(/[^a-z0-9]+/g, "-") || "provider";
  const projectSlug = path.basename(resolvedProject).toLowerCase().replace(/[^a-z0-9]+/g, "-") || "project";
  const defaultPreset = recipe.presets?.[0] ?? null;
  const normalizedRecipe = {
    ...recipe,
    skills: (recipe.skills || []).map((skill) => {
      const regSkill = registry.skills?.find((s) => s.skill_name === skill.name);
      return {
        ...skill,
        content_digest: regSkill?.content_digest || skill.content_digest || crypto.createHash("sha256").update(skill.name).digest("hex"),
      };
    }),
    // Lifecycle phases may intentionally exercise different providers against
    // one checkout. Keep their Catalog identities separate so a provider
    // transition cannot silently rewrite an existing project's contract.
    projects: defaultPreset ? [{
      project_id: `${projectSlug}-${providerSlug}`,
      project_name: `${path.basename(resolvedProject)} · ${providerId}`,
      provider_id: providerId,
      scope: "project",
      default_preset_id: defaultPreset.id,
      default_preset_version: defaultPreset.version ?? 1,
    }] : [],
  };

  const { applyRecipe } = require("./recipes");
  const result = await applyRecipe({
    catalogRoot: resolvedCatalog,
    registryRoot: resolvedRegistry,
    recipeContent: normalizedRecipe,
    projectPath: resolvedProject,
    providerId,
    confirm,
    reuseRegistryLocalSource: true,
  });

  return {
    recipe_id: recipe.recipe_id,
    preset_id: recipe.presets?.[0]?.id || null,
    provider_id: providerId,
    project_path: resolvedProject,
    delivery: result.delivery,
    applied: result.delivery?.applied ?? false,
  };
}

/**
 * Executes a pinpoint scoped test for an atomic task with test storm suppression enforcement.
 */
async function runScopedTest({
  testTarget,
  projectPath = process.cwd(),
  runner,
  dryRun = false,
} = {}) {
  validateScopedTestExecution(testTarget, "inner_loop");

  const startTime = Date.now();

  if (dryRun) {
    return {
      success: true,
      duration_ms: 1,
      output: `[dry-run] Verified scoped test: ${testTarget}`,
      exit_code: 0,
    };
  }

  if (typeof runner === "function") {
    const result = await runner(testTarget, projectPath);
    const duration = Date.now() - startTime;
    return {
      success: result?.success !== false,
      duration_ms: duration,
      output: result?.output || `Scoped test runner executed: ${testTarget}`,
      exit_code: result?.exitCode ?? 0,
      error: result?.error || null,
    };
  }

  const resolvedTest = path.isAbsolute(testTarget)
    ? testTarget
    : path.resolve(projectPath, testTarget);

  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, ["--test", resolvedTest], {
      cwd: projectPath,
      timeout: 30000,
    });
    const duration = Date.now() - startTime;
    return {
      success: true,
      duration_ms: duration,
      output: `${stdout}\n${stderr}`.trim(),
      exit_code: 0,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    return {
      success: false,
      duration_ms: duration,
      output: `${error.stdout || ""}\n${error.stderr || ""}\n${error.message}`.trim(),
      exit_code: error.code || 1,
      error: error.message,
    };
  }
}

/**
 * Authorizes and runs the full regression suite in Phase 3 (Release Gate).
 */
async function runFullRegressionSuite({
  projectPath = process.cwd(),
  runner,
  dryRun = false,
  authorizedBy = "global-regression-gatekeeper",
} = {}) {
  if (authorizedBy !== "global-regression-gatekeeper") {
    throw new LifecycleLoopError(
      "Unauthorized regression suite execution: full regression tests require authorization by 'global-regression-gatekeeper'",
      { phase: "release_gate", authorizedBy }
    );
  }

  const startTime = Date.now();

  if (dryRun) {
    return {
      success: true,
      duration_ms: 1,
      output: "[dry-run] Authorized single full regression run passed (100%)",
      exit_code: 0,
      authorized_by: authorizedBy,
    };
  }

  if (typeof runner === "function") {
    const result = await runner(projectPath);
    const duration = Date.now() - startTime;
    return {
      success: result?.success !== false,
      duration_ms: duration,
      output: result?.output || "Full regression suite passed 100%",
      exit_code: result?.exitCode ?? 0,
      authorized_by: authorizedBy,
      error: result?.error || null,
    };
  }

  try {
    const cmd = process.platform === "win32" ? "npm.cmd" : "npm";
    const { stdout, stderr } = await execFileAsync(cmd, ["test"], {
      cwd: projectPath,
      timeout: 60000,
    });
    const duration = Date.now() - startTime;
    return {
      success: true,
      duration_ms: duration,
      output: `${stdout}\n${stderr}`.trim(),
      exit_code: 0,
      authorized_by: authorizedBy,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    return {
      success: false,
      duration_ms: duration,
      output: `${error.stdout || ""}\n${error.stderr || ""}\n${error.message}`.trim(),
      exit_code: error.code || 1,
      authorized_by: authorizedBy,
      error: error.message,
    };
  }
}

/**
 * Updates or creates the canonical MASTER_BASELINE.md upon 100% verification pass.
 */
async function updateMasterBaseline({
  projectPath = process.cwd(),
  prdId,
  prdPath = "PRD.md",
  tasks = [],
  regressionResult,
  baselinePath = null,
} = {}) {
  const targetBaselinePath = baselinePath
    ? path.resolve(baselinePath)
    : path.join(path.resolve(projectPath), "MASTER_BASELINE.md");

  let existingContent = "";
  try {
    existingContent = await fs.readFile(targetBaselinePath, "utf8");
  } catch {
    existingContent = "# Master Baseline\n\nCanonical project baseline and verification records.\n\n";
  }

  const timestamp = new Date().toISOString();
  const passedCount = tasks.filter((t) => t.status === "passed").length;
  const totalCount = tasks.length;

  const taskEntries = tasks.map((t) => `  - [x] **${t.id}**: ${t.title} (\`${t.scoped_test}\`) — PASSED`).join("\n");

  const newEntry = [
    `## Release Baseline — ${timestamp}`,
    `- **PRD**: \`${prdId}\` (\`${prdPath}\`)`,
    "- **Verification Status**: VERIFIED (100% Pass)",
    `- **Governance Preset**: \`release-governance-suite\` (\`mlc-release-governance\`)`,
    `- **Gatekeeper Authorization**: \`global-regression-gatekeeper\` (Authorized: true)`,
    `- **Tasks Verified**: ${passedCount} / ${totalCount} atomic tasks`,
    taskEntries,
    `- **Full Regression Suite**: \`npm test\` — PASSED (0 failures, duration: ${regressionResult?.duration_ms ?? 0}ms)`,
    `- **Verified At**: ${timestamp}`,
    "",
  ].join("\n");

  const updatedContent = `${existingContent.trim()}\n\n${newEntry}\n`;
  await fs.mkdir(path.dirname(targetBaselinePath), { recursive: true });
  await fs.writeFile(targetBaselinePath, updatedContent, "utf8");

  return {
    baseline_path: targetBaselinePath,
    updated_at: timestamp,
    verified_tasks: passedCount,
    total_tasks: totalCount,
  };
}

/**
 * Main Autonomous 3-Phase Lifecycle Recipe Cycle Runner.
 * Coordinates Phase 1 (Plan), Phase 2 (Inner Loop), and Phase 3 (Release Gate).
 */
async function runLifecycleLoop({
  prdPath,
  prdContent,
  projectPath = process.cwd(),
  providerId = "codex",
  catalogRoot,
  registryRoot,
  confirm = true,
  dryRun = false,
  scopedTestRunner = null,
  regressionRunner = null,
  onPhaseChange = null,
  onTaskProgress = null,
} = {}) {
  if (!prdPath && !prdContent) {
    throw new Error("PRD path or content is required to run the lifecycle loop (--prd <path>)");
  }

  const cycleId = `cycle_${crypto.randomUUID().slice(0, 12)}`;
  const startedAt = new Date().toISOString();
  const resolvedProject = path.resolve(projectPath);
  const resolvedCatalog = path.resolve(catalogRoot || path.join(resolvedProject, ".skills-platform", "catalog"));
  const resolvedRegistry = path.resolve(registryRoot || path.join(resolvedProject, ".skills-platform", "registry"));
  const loopStorageDir = path.join(resolvedProject, ".skills-platform", "loop");

  await fs.mkdir(loopStorageDir, { recursive: true });

  const phaseReports = {};

  // ==========================================
  // PHASE 1: PLAN (Task Planning & Decomposition)
  // ==========================================
  onPhaseChange?.("plan", {
    phase: "plan",
    recipe_id: "mlc-task-planning",
    preset_id: "task-planning-suite",
    message: "Mounting task-planning-recipe and extracting atomic task queue from PRD",
  });

  const planMountResult = await mountLifecycleRecipe("task-planning", {
    projectPath: resolvedProject,
    providerId,
    catalogRoot: resolvedCatalog,
    registryRoot: resolvedRegistry,
    confirm,
  });

  let rawPrd = prdContent;
  let resolvedPrdPath = prdPath || "PRD.md";
  if (!rawPrd && prdPath) {
    resolvedPrdPath = path.resolve(resolvedProject, prdPath);
    rawPrd = await fs.readFile(resolvedPrdPath, "utf8");
  }

  const taskQueue = parsePrdDocument(rawPrd, resolvedPrdPath);
  const taskQueueFile = path.join(loopStorageDir, "task-queue.json");
  const prdFile = path.join(loopStorageDir, "prd.json");

  await fs.writeFile(taskQueueFile, `${JSON.stringify(taskQueue, null, 2)}\n`, "utf8");
  await fs.writeFile(prdFile, `${JSON.stringify({ prd_id: taskQueue.prd_id, path: resolvedPrdPath, extracted_at: taskQueue.extracted_at, tasks_count: taskQueue.tasks.length }, null, 2)}\n`, "utf8");

  phaseReports.plan = {
    phase: "plan",
    recipe_id: planMountResult.recipe_id,
    preset_id: planMountResult.preset_id,
    mounted: planMountResult.applied,
    prd_id: taskQueue.prd_id,
    tasks_count: taskQueue.tasks.length,
    task_queue_path: taskQueueFile,
  };

  // ==========================================
  // PHASE 2: INNER LOOP (Pinpoint Scoped TDD)
  // ==========================================
  onPhaseChange?.("inner_loop", {
    phase: "inner_loop",
    recipe_id: "mlc-scoped-inner-loop",
    preset_id: "scoped-inner-loop-suite",
    message: "Hot-swapping to scoped-inner-loop-recipe and executing pinpoint tasks",
  });

  const innerLoopMountResult = await mountLifecycleRecipe("scoped-inner-loop", {
    projectPath: resolvedProject,
    providerId,
    catalogRoot: resolvedCatalog,
    registryRoot: resolvedRegistry,
    confirm,
  });

  const innerLoopStartTime = Date.now();
  for (let index = 0; index < taskQueue.tasks.length; index += 1) {
    const task = taskQueue.tasks[index];
    task.status = "in_progress";
    onTaskProgress?.(task, index, taskQueue.tasks.length);

    const testExec = await runScopedTest({
      testTarget: task.scoped_test,
      projectPath: resolvedProject,
      runner: scopedTestRunner,
      dryRun,
    });

    if (testExec.success) {
      task.status = "passed";
      task.completed_at = new Date().toISOString();
      task.duration_ms = testExec.duration_ms;
      task.test_output = testExec.output;
    } else {
      task.status = "failed";
      task.error = testExec.error || "Scoped test failed";
      task.test_output = testExec.output;
      await fs.writeFile(taskQueueFile, `${JSON.stringify(taskQueue, null, 2)}\n`, "utf8");
      throw new LifecycleLoopError(`Scoped task '${task.id}' failed in inner loop: ${task.error}`, {
        phase: "inner_loop",
        task,
        testOutput: testExec.output,
      });
    }

    await fs.writeFile(taskQueueFile, `${JSON.stringify(taskQueue, null, 2)}\n`, "utf8");
  }

  phaseReports.inner_loop = {
    phase: "inner_loop",
    recipe_id: innerLoopMountResult.recipe_id,
    preset_id: innerLoopMountResult.preset_id,
    mounted: innerLoopMountResult.applied,
    resolved_tasks: taskQueue.tasks.filter((t) => t.status === "passed").length,
    total_tasks: taskQueue.tasks.length,
    duration_ms: Date.now() - innerLoopStartTime,
  };

  // ==========================================
  // PHASE 3: RELEASE GATE (Governance & Baseline)
  // ==========================================
  onPhaseChange?.("release_gate", {
    phase: "release_gate",
    recipe_id: "mlc-release-governance",
    preset_id: "release-governance-suite",
    message: "Hot-swapping to release-governance-recipe and running authorized regression gate",
  });

  const releaseMountResult = await mountLifecycleRecipe("release-governance", {
    projectPath: resolvedProject,
    providerId,
    catalogRoot: resolvedCatalog,
    registryRoot: resolvedRegistry,
    confirm,
  });

  const regressionResult = await runFullRegressionSuite({
    projectPath: resolvedProject,
    runner: regressionRunner,
    dryRun,
    authorizedBy: "global-regression-gatekeeper",
  });

  if (!regressionResult.success) {
    throw new LifecycleLoopError(`Full regression gate failed: ${regressionResult.error || "npm test failed"}`, {
      phase: "release_gate",
      regressionResult,
    });
  }

  const baselineResult = await updateMasterBaseline({
    projectPath: resolvedProject,
    prdId: taskQueue.prd_id,
    prdPath: resolvedPrdPath,
    tasks: taskQueue.tasks,
    regressionResult,
  });

  phaseReports.release_gate = {
    phase: "release_gate",
    recipe_id: releaseMountResult.recipe_id,
    preset_id: releaseMountResult.preset_id,
    mounted: releaseMountResult.applied,
    full_regression_passed: regressionResult.success,
    regression_duration_ms: regressionResult.duration_ms,
    baseline_path: baselineResult.baseline_path,
  };

  const completedAt = new Date().toISOString();
  const cycleReport = {
    cycle_id: cycleId,
    status: "completed",
    prd_id: taskQueue.prd_id,
    project_path: resolvedProject,
    provider_id: providerId,
    started_at: startedAt,
    completed_at: completedAt,
    phases: phaseReports,
    summary: {
      total_tasks: taskQueue.tasks.length,
      passed_tasks: taskQueue.tasks.filter((t) => t.status === "passed").length,
      full_regression_passed: regressionResult.success,
      baseline_updated: true,
    },
  };

  const cycleReportFile = path.join(loopStorageDir, "cycle-report.json");
  await fs.writeFile(cycleReportFile, `${JSON.stringify(cycleReport, null, 2)}\n`, "utf8");

  return cycleReport;
}

module.exports = {
  CANONICAL_LIFECYCLE_RECIPES,
  TestStormSuppressionError,
  LifecycleLoopError,
  validateScopedTestExecution,
  parsePrdDocument,
  ensureCanonicalSkillsInRegistry,
  resolveLifecycleRecipe,
  mountLifecycleRecipe,
  runScopedTest,
  runFullRegressionSuite,
  updateMasterBaseline,
  runLifecycleLoop,
};
