const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const {
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
} = require("../src/lifecycle-loop");
const { run } = require("../src/cli");

test("Lifecycle Loop: PRD Parsing & Task Decomposition", async (t) => {
  await t.test("parses Markdown PRD with checklist and scoped test annotations", () => {
    const mdPrd = [
      "# Universal Telemetry and Lifecycle Platform",
      "",
      "## Requirements",
      "- [ ] [task-1] Implement Telemetry Hook Engine (scoped_test: test/telemetry-hook.test.js)",
      "- [ ] [task-2] Implement Catalog Ingestion API (test: test/telemetry-api.test.js)",
      "- [x] [task-3] Implement Core Schema Contracts (test: test/contracts.test.js)",
      "- [ ] Task 4: Autonomous Lifecycle Loop (scoped_test: test/lifecycle-loop.test.js)",
    ].join("\n");

    const result = parsePrdDocument(mdPrd, "docs/PRD.md");
    assert.equal(result.format, "markdown");
    assert.equal(result.tasks.length, 4);

    assert.equal(result.tasks[0].id, "task-1");
    assert.equal(result.tasks[0].title, "Implement Telemetry Hook Engine");
    assert.equal(result.tasks[0].scoped_test, "test/telemetry-hook.test.js");
    assert.equal(result.tasks[0].status, "pending");

    assert.equal(result.tasks[1].id, "task-2");
    assert.equal(result.tasks[1].title, "Implement Catalog Ingestion API");
    assert.equal(result.tasks[1].scoped_test, "test/telemetry-api.test.js");
    assert.equal(result.tasks[1].status, "pending");

    assert.equal(result.tasks[2].id, "task-3");
    assert.equal(result.tasks[2].status, "passed");

    assert.equal(result.tasks[3].id, "task-4");
    assert.equal(result.tasks[3].title, "Task 4: Autonomous Lifecycle Loop");
    assert.equal(result.tasks[3].scoped_test, "test/lifecycle-loop.test.js");
  });

  await t.test("parses Markdown PRD with header-based structure", () => {
    const mdPrd = [
      "# Feature PRD: Telemetry Ingestion",
      "",
      "### Ingestion Endpoint",
      "Receives telemetry payloads and stores to NDJSON.",
      "Scoped Test: `apps/skills-catalog/test/telemetry-api.test.js`",
      "",
      "### Feedback Aggregator",
      "Calculates health metrics and mode breakdown.",
      "Test: `apps/skills-catalog/test/telemetry-summary.test.js`",
    ].join("\n");

    const result = parsePrdDocument(mdPrd, "ingestion-prd.md");
    assert.equal(result.tasks.length, 2);
    assert.equal(result.tasks[0].title, "Ingestion Endpoint");
    assert.equal(result.tasks[0].scoped_test, "apps/skills-catalog/test/telemetry-api.test.js");
    assert.equal(result.tasks[1].title, "Feedback Aggregator");
    assert.equal(result.tasks[1].scoped_test, "apps/skills-catalog/test/telemetry-summary.test.js");
  });

  await t.test("parses JSON PRD format with explicit tasks or requirements", () => {
    const jsonPrd = JSON.stringify({
      prd_id: "prd-telemetry-001",
      tasks: [
        {
          id: "task-01",
          title: "Hook Engine",
          scoped_test: "test/telemetry-hook.test.js",
          description: "Zero-dependency hook script",
        },
        {
          id: "task-02",
          title: "Lifecycle Orchestrator",
          scoped_test: "test/lifecycle-loop.test.js",
          status: "pending",
        },
      ],
    });

    const result = parsePrdDocument(jsonPrd, "prd.json");
    assert.equal(result.format, "json");
    assert.equal(result.prd_id, "prd-telemetry-001");
    assert.equal(result.tasks.length, 2);
    assert.equal(result.tasks[0].id, "task-01");
    assert.equal(result.tasks[0].scoped_test, "test/telemetry-hook.test.js");
    assert.equal(result.tasks[1].id, "task-02");
  });

  await t.test("rejects empty or invalid PRD documents", () => {
    assert.throws(() => parsePrdDocument(""), /PRD content must be a non-empty string|PRD document is empty/);
    assert.throws(() => parsePrdDocument("   \n\n  "), /PRD document is empty/);
    assert.throws(() => parsePrdDocument(null), /PRD content must be a non-empty string/);
  });
});

test("Lifecycle Loop: Test Storm Suppression (Phase 2 Inner Loop Invariant)", async (t) => {
  await t.test("strictly blocks un-scoped full regression suite runs during Phase 2", () => {
    const blockedCommands = [
      "npm test",
      "npm run test",
      "npm run test:all",
      "node --test",
      "node --test test",
      "node --test test/",
      "*",
      "all",
      "full",
    ];

    for (const cmd of blockedCommands) {
      assert.throws(
        () => validateScopedTestExecution(cmd, "inner_loop"),
        (err) => {
          assert.equal(err.name, "TestStormSuppressionError");
          assert.equal(err.code, "ERR_TEST_STORM_SUPPRESSED");
          assert.match(err.message, /Test storm suppressed/);
          return true;
        },
        `Expected command '${cmd}' to be blocked in Phase 2`
      );
    }
  });

  await t.test("allows pinpoint scoped test files in Phase 2", () => {
    const validTargets = [
      "apps/skills-catalog/test/telemetry.test.js",
      "test/lifecycle-loop.test.js",
      "apps/skills-catalog/test/telemetry-hook.test.js",
      "packages/skills-manager-adapter/test/adapter.test.js",
    ];

    for (const target of validTargets) {
      assert.equal(validateScopedTestExecution(target, "inner_loop"), true);
    }
  });

  await t.test("allows full regression execution in Phase 3 (Release Gate)", () => {
    assert.equal(validateScopedTestExecution("npm test", "release_gate"), true);
  });
});

test("Lifecycle Loop: NTFS Junction Swapping Across Lifecycle Phases", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "lifecycle-junction-test-"));
  const projectPath = path.join(root, "project");
  const catalogRoot = path.join(root, "catalog");
  const registryRoot = path.join(root, "registry");
  await fs.mkdir(projectPath, { recursive: true });

  await t.test("Phase 1: Mounts task-planning-suite junction bindings", async () => {
    const mount = await mountLifecycleRecipe("task-planning", {
      projectPath,
      providerId: "codex",
      catalogRoot,
      registryRoot,
      confirm: true,
    });

    assert.equal(mount.recipe_id, "mlc-task-planning");
    assert.equal(mount.preset_id, "task-planning-suite");
    assert.equal(mount.applied, true);

    const deliveryRoot = path.join(projectPath, "skills");
    const skillA = path.join(deliveryRoot, "task-decomposer", "SKILL.md");
    const skillB = path.join(deliveryRoot, "horizontal-topic-scanner", "SKILL.md");

    const contentA = await fs.readFile(skillA, "utf8");
    const contentB = await fs.readFile(skillB, "utf8");
    assert.match(contentA, /task-decomposer/);
    assert.match(contentB, /horizontal-topic-scanner/);
  });

  await t.test("Phase 2: Hot-swaps junction bindings to scoped-inner-loop-suite", async () => {
    const mount = await mountLifecycleRecipe("scoped-inner-loop", {
      projectPath,
      providerId: "codex",
      catalogRoot,
      registryRoot,
      confirm: true,
    });

    assert.equal(mount.recipe_id, "mlc-scoped-inner-loop");
    assert.equal(mount.preset_id, "scoped-inner-loop-suite");
    assert.equal(mount.applied, true);

    const deliveryRoot = path.join(projectPath, "skills");

    // Phase 1 skills should be removed/unlinked
    await assert.rejects(() => fs.lstat(path.join(deliveryRoot, "task-decomposer")));

    // Phase 2 skills should be materialized
    const skillA = path.join(deliveryRoot, "vertical-context-extractor", "SKILL.md");
    const skillB = path.join(deliveryRoot, "scoped-tdd-executor", "SKILL.md");
    const skillC = path.join(deliveryRoot, "context-patch-synthesizer", "SKILL.md");

    const contentA = await fs.readFile(skillA, "utf8");
    assert.match(contentA, /vertical-context-extractor/);
    const contentB = await fs.readFile(skillB, "utf8");
    assert.match(contentB, /scoped-tdd-executor/);
    const contentC = await fs.readFile(skillC, "utf8");
    assert.match(contentC, /context-patch-synthesizer/);
  });

  await t.test("Phase 3: Hot-swaps junction bindings to release-governance-suite", async () => {
    const mount = await mountLifecycleRecipe("release-governance", {
      projectPath,
      providerId: "codex",
      catalogRoot,
      registryRoot,
      confirm: true,
    });

    assert.equal(mount.recipe_id, "mlc-release-governance");
    assert.equal(mount.preset_id, "release-governance-suite");
    assert.equal(mount.applied, true);

    const deliveryRoot = path.join(projectPath, "skills");

    // Phase 2 skills should be removed
    await assert.rejects(() => fs.lstat(path.join(deliveryRoot, "vertical-context-extractor")));

    // Phase 3 skills should be materialized
    const skillA = path.join(deliveryRoot, "lifecycle-phase-controller", "SKILL.md");
    const skillB = path.join(deliveryRoot, "global-regression-gatekeeper", "SKILL.md");
    const skillC = path.join(deliveryRoot, "baseline-curation-core", "SKILL.md");

    const contentA = await fs.readFile(skillA, "utf8");
    assert.match(contentA, /lifecycle-phase-controller/);
    const contentB = await fs.readFile(skillB, "utf8");
    assert.match(contentB, /global-regression-gatekeeper/);
    const contentC = await fs.readFile(skillC, "utf8");
    assert.match(contentC, /baseline-curation-core/);
  });

  await fs.rm(root, { recursive: true, force: true });
});

test("Lifecycle Loop: Release Gate & MASTER_BASELINE.md Updates", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "lifecycle-baseline-test-"));
  const projectPath = path.join(root, "project");
  await fs.mkdir(projectPath, { recursive: true });

  await t.test("authorizes full regression run and updates MASTER_BASELINE.md", async () => {
    const tasks = [
      { id: "task-1", title: "Telemetry Hook", scoped_test: "test/hook.test.js", status: "passed" },
      { id: "task-2", title: "Ingestion API", scoped_test: "test/api.test.js", status: "passed" },
    ];

    const regressionResult = await runFullRegressionSuite({
      projectPath,
      runner: async () => ({ success: true, duration_ms: 120, output: "All 15 suites passed (100%)" }),
      authorizedBy: "global-regression-gatekeeper",
    });

    assert.equal(regressionResult.success, true);
    assert.equal(regressionResult.authorized_by, "global-regression-gatekeeper");

    const baselineResult = await updateMasterBaseline({
      projectPath,
      prdId: "prd-telemetry-v1",
      prdPath: "docs/PRD.md",
      tasks,
      regressionResult,
    });

    assert.equal(baselineResult.verified_tasks, 2);
    assert.equal(baselineResult.total_tasks, 2);

    const baselineContent = await fs.readFile(path.join(projectPath, "MASTER_BASELINE.md"), "utf8");
    assert.match(baselineContent, /# Master Baseline/);
    assert.match(baselineContent, /## Release Baseline/);
    assert.match(baselineContent, /prd-telemetry-v1/);
    assert.match(baselineContent, /VERIFIED \(100% Pass\)/);
    assert.match(baselineContent, /global-regression-gatekeeper/);
    assert.match(baselineContent, /task-1.*PASSED/);
    assert.match(baselineContent, /task-2.*PASSED/);
  });

  await t.test("rejects unauthorized regression suite runs", async () => {
    await assert.rejects(
      () => runFullRegressionSuite({ projectPath, authorizedBy: "unauthorized-agent" }),
      (err) => {
        assert.equal(err.name, "LifecycleLoopError");
        assert.match(err.message, /Unauthorized regression suite execution/);
        return true;
      }
    );
  });

  await fs.rm(root, { recursive: true, force: true });
});

test("Lifecycle Loop: Full 3-Phase Autonomous Orchestration (`runLifecycleLoop`)", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "lifecycle-loop-full-"));
  const projectPath = path.join(root, "project");
  const catalogRoot = path.join(root, "catalog");
  const registryRoot = path.join(root, "registry");
  await fs.mkdir(projectPath, { recursive: true });

  const prdFile = path.join(projectPath, "PRD.md");
  const prdContent = [
    "# Universal Skills Telemetry & Lifecycle Loop PRD",
    "",
    "## Functional Requirements",
    "- [ ] [task-1] Build zero-dependency telemetry hook engine (scoped_test: test/hook.test.js)",
    "- [ ] [task-2] Build telemetry ingestion REST API (scoped_test: test/api.test.js)",
    "- [ ] [task-3] Build autonomous 3-phase lifecycle loop (scoped_test: test/loop.test.js)",
  ].join("\n");

  await fs.writeFile(prdFile, prdContent, "utf8");

  const phasesObserved = [];
  const tasksExecuted = [];

  const cycleReport = await runLifecycleLoop({
    prdPath: prdFile,
    projectPath,
    providerId: "antigravity",
    catalogRoot,
    registryRoot,
    confirm: true,
    scopedTestRunner: async (testTarget) => {
      tasksExecuted.push(testTarget);
      return { success: true, duration_ms: 15, output: `Passed ${testTarget}` };
    },
    regressionRunner: async () => {
      return { success: true, duration_ms: 250, output: "100% full regression pass" };
    },
    onPhaseChange: (phase, details) => {
      phasesObserved.push({ phase, details });
    },
  });

  assert.equal(cycleReport.status, "completed");
  assert.equal(cycleReport.prd_id, "universal-skills-telemetry-lifecycle-loop-prd");
  assert.equal(cycleReport.summary.total_tasks, 3);
  assert.equal(cycleReport.summary.passed_tasks, 3);
  assert.equal(cycleReport.summary.full_regression_passed, true);
  assert.equal(cycleReport.summary.baseline_updated, true);

  // Verify phase progression
  assert.equal(phasesObserved.length, 3);
  assert.equal(phasesObserved[0].phase, "plan");
  assert.equal(phasesObserved[1].phase, "inner_loop");
  assert.equal(phasesObserved[2].phase, "release_gate");

  // Verify atomic tasks were executed
  assert.deepEqual(tasksExecuted, [
    "test/hook.test.js",
    "test/api.test.js",
    "test/loop.test.js",
  ]);

  // Verify loop artifacts emitted
  const loopDir = path.join(projectPath, ".skills-platform", "loop");
  const taskQueueSaved = JSON.parse(await fs.readFile(path.join(loopDir, "task-queue.json"), "utf8"));
  assert.equal(taskQueueSaved.tasks.length, 3);
  assert.ok(taskQueueSaved.tasks.every((t) => t.status === "passed"));

  const prdSaved = JSON.parse(await fs.readFile(path.join(loopDir, "prd.json"), "utf8"));
  assert.equal(prdSaved.tasks_count, 3);

  const cycleReportSaved = JSON.parse(await fs.readFile(path.join(loopDir, "cycle-report.json"), "utf8"));
  assert.equal(cycleReportSaved.cycle_id, cycleReport.cycle_id);

  // Verify MASTER_BASELINE.md created
  const masterBaseline = await fs.readFile(path.join(projectPath, "MASTER_BASELINE.md"), "utf8");
  assert.match(masterBaseline, /## Release Baseline/);
  assert.match(masterBaseline, /task-1.*PASSED/);
  assert.match(masterBaseline, /task-2.*PASSED/);
  assert.match(masterBaseline, /task-3.*PASSED/);

  await fs.rm(root, { recursive: true, force: true });
});

test("Lifecycle Loop: CLI Integration (`skills-catalog loop run`)", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "lifecycle-cli-test-"));
  const projectPath = path.join(root, "project");
  const catalogRoot = path.join(root, "catalog");
  const registryRoot = path.join(root, "registry");
  await fs.mkdir(projectPath, { recursive: true });

  const prdFile = path.join(projectPath, "PRD.md");
  const prdContent = [
    "# CLI Subcommand Test PRD",
    "- [ ] [task-1] Feature A (scoped_test: test/a.test.js)",
    "- [ ] [task-2] Feature B (scoped_test: test/b.test.js)",
  ].join("\n");
  await fs.writeFile(prdFile, prdContent, "utf8");

  await t.test("runs loop run command via CLI runner with dry-run mode", async () => {
    const result = await run([
      "loop", "run",
      "--prd", prdFile,
      "--project", projectPath,
      "--provider", "codex",
      "--catalog", catalogRoot,
      "--registry", registryRoot,
      "--dry-run",
    ]);

    assert.equal(result.status, "completed");
    assert.equal(result.summary.total_tasks, 2);
    assert.equal(result.summary.passed_tasks, 2);
    assert.equal(result.summary.full_regression_passed, true);
  });

  await t.test("CLI loop run errors when --prd is omitted", async () => {
    await assert.rejects(
      () => run(["loop", "run", "--project", projectPath]),
      /loop run requires --prd <path>/
    );
  });

  await fs.rm(root, { recursive: true, force: true });
});
