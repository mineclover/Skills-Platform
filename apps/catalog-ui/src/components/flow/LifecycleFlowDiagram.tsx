import { useMemo } from "react";
import {
  AlertOctagon,
  ArrowRight,
  CheckCircle2,
  Clock,
  Flame,
  Layers,
  PlayCircle,
  RefreshCw,
  Shield,
  ShieldAlert,
  Sparkles,
  Zap,
} from "lucide-react";
import type { FlowNodeDetail } from "./flow-types";

interface LifecycleFlowDiagramProps {
  tasks: FlowNodeDetail[];
  selectedNodeId: string | null;
  onSelectNode: (node: FlowNodeDetail) => void;
  activeHaltedNodeId: string | null;
}

export function LifecycleFlowDiagram({
  tasks,
  selectedNodeId,
  onSelectNode,
  activeHaltedNodeId,
}: LifecycleFlowDiagramProps) {
  // Phase 1 Definition
  const phase1Node: FlowNodeDetail = useMemo(
    () => ({
      id: "phase_1_plan",
      type: "lifecycle_phase",
      name: "Phase 1: Plan & PRD Ingestion",
      category: "Planning & Decomposition",
      status: "passed",
      phase: 1,
      description: "Read-only exploration of PRD.md into atomic, dependency-ordered task-queue.json",
      lineage: {
        topicId: "PHASE-1-PLANNING",
        canonicalName: "task_planning_suite",
        path: ["lifecycle", "phase1", "task-planning-recipe.json"],
        lifecycleState: "VERIFIED",
        phaseIndex: 1,
      },
      verification: {
        targetTestFile: "apps/skills-catalog/test/lifecycle-loop.test.js",
        allowedCommand: "node --test apps/skills-catalog/test/lifecycle-loop.test.js",
        prohibitedCommands: ["npm test", "git commit", "npm run build"],
        invariants: {
          preConditions: ["PRD.md specification is accessible", "Zero dirty changes in working tree"],
          strictInvariants: [
            "Strict read-only invariant: Source code modification is prohibited",
            "Context density <= 80k token budget",
          ],
          postConditions: ["task-queue.json emitted with status=pending for all tasks"],
        },
      },
      metrics: {
        durationMs: 45,
        latencyMs: 6,
        toolCallsCount: 4,
        tokensDensityKb: 18.4,
        liveDiff: {
          targetFile: "task-queue.json",
          additions: 32,
          deletions: 0,
          diffSnippet: `+  {\n+    "task_id": "TASK-01",\n+    "target_test": "test/scoped.test.js"\n+  }`,
        },
      },
    }),
    [],
  );

  // Phase 2 Definition
  const phase2Node: FlowNodeDetail = useMemo(
    () => ({
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
        prohibitedCommands: ["npm test", "pytest", "cargo test", "jest", "node --test"],
        invariants: {
          preConditions: ["Task queue has pending items", "Junction hot-swap active"],
          strictInvariants: [
            "Pinpoint TDD execution: only the current task test is executed",
            "Unscoped full test executions are intercepted by Test Storm Shield",
          ],
          postConditions: ["Task transitions to status=passed upon verified test"],
        },
      },
      metrics: {
        durationMs: 142,
        latencyMs: 12,
        toolCallsCount: 14,
        tokensDensityKb: 42.0,
      },
    }),
    [],
  );

  // Test Storm Suppression Shield Node
  const testStormShieldNode: FlowNodeDetail = useMemo(
    () => ({
      id: "shield_test_storm",
      type: "shield_guard",
      name: "Test Storm Suppression Guard Shield",
      category: "Lifecycle Protection Guard",
      status: activeHaltedNodeId === "shield_test_storm" ? "blocked" : "insync",
      phase: 2,
      description:
        "High-velocity barrier blocking unscoped tests (npm test, jest, pytest, *) during Phase 2 Inner Loop to prevent context/CPU exhaustion.",
      lineage: {
        topicId: "SHIELD-TEST-STORM-01",
        canonicalName: "test_storm_suppression_guard",
        path: ["lifecycle", "guards", "test-storm-suppression.js"],
        lifecycleState: "VERIFIED",
        phaseIndex: 2,
      },
      verification: {
        targetTestFile: "tests/e2e/tier1-features/f11-test-storm-suppression.test.js",
        allowedCommand: "run_scoped_test(target_test_file)",
        prohibitedCommands: ["npm test", "pytest", "jest", "cargo test", "*", "all", "full"],
        invariants: {
          preConditions: ["Phase === 2 (Scoped Inner Loop)"],
          strictInvariants: [
            "Intercept and halt any non-scoped test command in <200ms",
            "Throw TestStormSuppressionError with self-correction hint",
          ],
          postConditions: ["Shield barrier remains intact; CPU quota protected"],
        },
      },
      diagnostics:
        activeHaltedNodeId === "shield_test_storm"
          ? {
              hookId: "test-storm-suppression-guard",
              priority: 12,
              violationType: "TEST_STORM_ATTEMPT",
              blockedCommand: "npm test",
              reason:
                "Unscoped test command 'npm test' blocked inside Phase 2 Inner Loop. Only pinpoint scoped test execution is permitted.",
              selfCorrectHint:
                "Target only the current test file using pinpoint command: `node --test apps/catalog-ui/test/flow-studio.test.js`.",
              matchedPattern: "^npm\\s+(?:run\\s+)?test\\b",
            }
          : undefined,
      metrics: {
        durationMs: 4,
        latencyMs: 2,
        tokensDensityKb: 0.8,
      },
    }),
    [activeHaltedNodeId],
  );

  // Phase 3 Definition
  const phase3Node: FlowNodeDetail = useMemo(
    () => ({
      id: "phase_3_gate",
      type: "lifecycle_phase",
      name: "Phase 3: Release Gate & Compaction",
      category: "Release Governance",
      status: activeHaltedNodeId === "phase_3_gate" ? "passed" : "idle",
      phase: 3,
      description:
        "Authorizes exactly 1 single full regression sweep and compacts verified changes into MASTER_BASELINE.md under 80k token budget.",
      lineage: {
        topicId: "PHASE-3-RELEASE-GATE",
        canonicalName: "release_governance_suite",
        path: ["lifecycle", "phase3", "release-governance-recipe.json"],
        lifecycleState: "OPEN",
        phaseIndex: 3,
      },
      verification: {
        targetTestFile: "tests/e2e/tier1-features/f12-phase3-release-gate.test.js",
        allowedCommand: "node tests/e2e/run-all.js",
        prohibitedCommands: [],
        invariants: {
          preConditions: ["All Phase 2 tasks are in status=passed"],
          strictInvariants: [
            "Exactly 1 single regression sweep authorized",
            "Token density compacted to strict 80k token bounds",
          ],
          postConditions: ["MASTER_BASELINE.md updated and archived"],
        },
      },
      metrics: {
        durationMs: 0,
        tokensDensityKb: 64.2,
      },
    }),
    [activeHaltedNodeId],
  );

  return (
    <div className="lifecycle-flow-diagram" aria-label="3-Phase Lifecycle Flow Canvas">
      {/* Canvas Header & Legend */}
      <div className="flow-canvas-header">
        <div className="canvas-title-group">
          <RefreshCw size={20} className="header-icon rotate-slow" />
          <div>
            <h3>3-Phase Lifecycle State Machine</h3>
            <p>
              Phase 1 (Plan & PRD Ingestion) ➔ Phase 2 (Scoped Inner Loop TDD) ➔ Phase 3 (Release
              Gate & Compaction)
            </p>
          </div>
        </div>
        <div className="canvas-legend">
          <span className="legend-item">
            <span className="legend-dot passed" /> Passed
          </span>
          <span className="legend-item">
            <span className="legend-dot active" /> In-Progress
          </span>
          <span className="legend-item">
            <span className="legend-dot pending" /> Pending
          </span>
          <span className="legend-item">
            <span className="legend-dot blocked" /> Blocked / Intercepted
          </span>
        </div>
      </div>

      {/* 3-Phase Columns Container */}
      <div className="phases-grid">
        {/* Phase 1: Plan */}
        <section
          className={`phase-card ${selectedNodeId === phase1Node.id ? "selected" : ""}`}
          onClick={() => onSelectNode(phase1Node)}
          role="button"
          tabIndex={0}
          aria-label="Select Phase 1 Plan"
          onKeyDown={(e) => e.key === "Enter" && onSelectNode(phase1Node)}
        >
          <div className="phase-card-header">
            <div className="phase-badge phase-1">Phase 1</div>
            <span className="status-pill passed">
              <CheckCircle2 size={12} />
              Passed
            </span>
          </div>
          <h4 className="phase-title">Plan & PRD Decompose</h4>
          <p className="phase-desc">
            Mounts <code>task-planning-recipe.json</code>. Decomposes PRD into structured task queue.
          </p>
          <div className="phase-meta-box">
            <span className="meta-tag">Read-Only Enforced</span>
            <span className="meta-tag">task-queue.json</span>
          </div>
        </section>

        {/* Phase Transition Connector 1 -> 2 */}
        <div className="phase-connector">
          <svg className="connector-svg" width="60" height="40" viewBox="0 0 60 40">
            <defs>
              <linearGradient id="phaseGrad1" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#2e7d69" />
                <stop offset="100%" stopColor="#38bdf8" />
              </linearGradient>
            </defs>
            <path
              d="M 5 20 L 50 20"
              stroke="url(#phaseGrad1)"
              strokeWidth="2.5"
              strokeDasharray="4 2"
              fill="none"
            />
            <polygon points="50,15 58,20 50,25" fill="#38bdf8" />
            <circle cx="28" cy="20" r="3.5" fill="#63e5c0" className="pulse-circle" />
          </svg>
        </div>

        {/* Phase 2: Scoped Inner Loop (Central Workspace) */}
        <section
          className={`phase-card inner-loop-phase ${selectedNodeId === phase2Node.id ? "selected" : ""}`}
          onClick={() => onSelectNode(phase2Node)}
          role="button"
          tabIndex={0}
          aria-label="Select Phase 2 Inner Loop"
          onKeyDown={(e) => e.key === "Enter" && onSelectNode(phase2Node)}
        >
          <div className="phase-card-header">
            <div className="phase-badge phase-2">Phase 2</div>
            <span className="status-pill in_progress">
              <span className="pulse-dot" />
              In-Progress
            </span>
          </div>

          <div className="phase-title-row">
            <h4 className="phase-title">Scoped Inner Loop TDD</h4>
            <span className="hot-swap-pill">Hot-Swapped Symlinks</span>
          </div>

          {/* Test Storm Suppression Guard Shield Component */}
          <div
            className={`test-storm-shield-card ${activeHaltedNodeId === "shield_test_storm" ? "intercepting" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              onSelectNode(testStormShieldNode);
            }}
            role="button"
            tabIndex={0}
            aria-label="Test Storm Suppression Guard Shield"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.stopPropagation();
                onSelectNode(testStormShieldNode);
              }
            }}
          >
            <div className="shield-header">
              <div className="shield-title">
                {activeHaltedNodeId === "shield_test_storm" ? (
                  <ShieldAlert size={16} className="shield-alert-icon" />
                ) : (
                  <Shield size={16} className="shield-icon" />
                )}
                <strong>Test Storm Suppression Shield</strong>
              </div>
              <span
                className={`shield-state-pill ${activeHaltedNodeId === "shield_test_storm" ? "blocked" : "active"}`}
              >
                {activeHaltedNodeId === "shield_test_storm" ? "INTERCEPTING" : "ACTIVE GUARD"}
              </span>
            </div>
            <p className="shield-desc">
              Intercepts broad test commands (<code>npm test</code>, <code>pytest</code>, <code>*</code>) and enforces pinpoint <code>runScopedTest</code>.
            </p>
          </div>

          {/* Atomic Task Cards List */}
          <div className="task-cards-list">
            <div className="task-list-heading">
              <span>Task Queue Progression</span>
              <span className="task-count">{tasks.length} Atomic Tasks</span>
            </div>
            {tasks.map((task) => {
              const isSelected = selectedNodeId === task.id;
              return (
                <div
                  key={task.id}
                  className={`task-card-item ${task.status} ${isSelected ? "selected" : ""}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectNode(task);
                  }}
                  role="button"
                  tabIndex={0}
                  aria-label={`Task: ${task.name}`}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.stopPropagation();
                      onSelectNode(task);
                    }
                  }}
                >
                  <div className="task-header">
                    <span className="task-name">{task.name}</span>
                    <span className={`status-pill ${task.status}`}>
                      {task.status === "passed" ? (
                        <CheckCircle2 size={11} />
                      ) : task.status === "in_progress" || task.status === "active" ? (
                        <span className="pulse-dot" />
                      ) : (
                        <Clock size={11} />
                      )}
                      {task.status}
                    </span>
                  </div>

                  {task.verification?.targetTestFile ? (
                    <div className="task-target-test">
                      <code title={task.verification.targetTestFile}>
                        {task.verification.targetTestFile}
                      </code>
                    </div>
                  ) : null}

                  {task.metrics?.durationMs ? (
                    <div className="task-footer">
                      <span className="task-metric">{task.metrics.durationMs}ms</span>
                      {task.metrics.liveDiff ? (
                        <span className="task-diff-tag">
                          +{task.metrics.liveDiff.additions} -{task.metrics.liveDiff.deletions}
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>

        {/* Phase Transition Connector 2 -> 3 */}
        <div className="phase-connector">
          <svg className="connector-svg" width="60" height="40" viewBox="0 0 60 40">
            <defs>
              <linearGradient id="phaseGrad2" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#38bdf8" />
                <stop offset="100%" stopColor="#c4a1ff" />
              </linearGradient>
            </defs>
            <path
              d="M 5 20 L 50 20"
              stroke="url(#phaseGrad2)"
              strokeWidth="2.5"
              strokeDasharray="4 2"
              fill="none"
            />
            <polygon points="50,15 58,20 50,25" fill="#c4a1ff" />
            <circle cx="28" cy="20" r="3.5" fill="#38bdf8" className="pulse-circle" />
          </svg>
        </div>

        {/* Phase 3: Release Gate */}
        <section
          className={`phase-card ${selectedNodeId === phase3Node.id ? "selected" : ""}`}
          onClick={() => onSelectNode(phase3Node)}
          role="button"
          tabIndex={0}
          aria-label="Select Phase 3 Release Gate"
          onKeyDown={(e) => e.key === "Enter" && onSelectNode(phase3Node)}
        >
          <div className="phase-card-header">
            <div className="phase-badge phase-3">Phase 3</div>
            <span
              className={`status-pill ${activeHaltedNodeId === "phase_3_gate" ? "passed" : "pending"}`}
            >
              {activeHaltedNodeId === "phase_3_gate" ? (
                <>
                  <Sparkles size={12} />
                  Authorized
                </>
              ) : (
                <>
                  <Clock size={12} />
                  Pending Gate
                </>
              )}
            </span>
          </div>
          <h4 className="phase-title">Release Gate & Compaction</h4>
          <p className="phase-desc">
            Mounts <code>release-governance-recipe.json</code>. Authorizes 1 full regression sweep &
            compacts into <code>MASTER_BASELINE.md</code>.
          </p>
          <div className="phase-meta-box">
            <span className="meta-tag">1x Full Regression Suite</span>
            <span className="meta-tag">80k Token Baseline</span>
          </div>
        </section>
      </div>
    </div>
  );
}
