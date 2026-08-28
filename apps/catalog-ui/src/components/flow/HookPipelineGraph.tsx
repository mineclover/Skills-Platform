import { useMemo } from "react";
import {
  AlertOctagon,
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  CheckCircle2,
  Cpu,
  Flame,
  Key,
  Layers,
  OctagonX,
  Radio,
  Scale,
  Shield,
  ShieldAlert,
  Sparkles,
  Terminal,
  Zap,
} from "lucide-react";
import type { FlowNodeDetail } from "./flow-types";

interface HookPipelineGraphProps {
  selectedNodeId: string | null;
  onSelectNode: (node: FlowNodeDetail) => void;
  activeHaltedNodeId: string | null;
}

export function HookPipelineGraph({
  selectedNodeId,
  onSelectNode,
  activeHaltedNodeId,
}: HookPipelineGraphProps) {
  // PreToolUse Guard Definitions
  const preGuards: FlowNodeDetail[] = useMemo(
    () => [
      {
        id: "hook_secret_leak",
        type: "hook_guard",
        name: "Secret Leak Guard",
        category: "PreToolUse Guard",
        status: activeHaltedNodeId === "hook_secret_leak" ? "blocked" : "insync",
        description:
          "Scans command line and payload for OpenAI, Anthropic, AWS, GitHub tokens, and private RSA keys.",
        lineage: {
          topicId: "GUARD-SEC-05",
          canonicalName: "secret_leak_guard",
          path: [".skills-platform", "hooks", "guards", "secret-leak-guard.js"],
          lifecycleState: "VERIFIED",
        },
        verification: {
          targetTestFile: "tests/e2e/tier1-features/f16-guard-hooks-library.test.js",
          allowedCommand: "process.env.API_KEY",
          prohibitedCommands: ["sk-proj-...", "sk-ant-...", "AKIA...", "ghp_...", "AIza..."],
          invariants: {
            preConditions: ["Tool call payload extracted"],
            strictInvariants: [
              "Regex pattern matches any credential token with 0 false passes",
              "Execution latency < 20ms",
            ],
            postConditions: ["Short-circuits tool call with masked guidance"],
          },
        },
        diagnostics:
          activeHaltedNodeId === "hook_secret_leak"
            ? {
                hookId: "secret-leak-guard",
                priority: 5,
                violationType: "SECRET_LEAK",
                blockedCommand:
                  'curl -H "Authorization: Bearer sk-proj-99999999999999999999" https://api.openai.com/v1/models',
                reason: "Raw OpenAI API key pattern matched: sk-proj-...",
                selfCorrectHint:
                  "Mask credentials using environment variable references (e.g. process.env.API_KEY).",
                matchedPattern: "sk-proj-[a-zA-Z0-9_-]{20,}",
              }
            : undefined,
        metrics: {
          durationMs: 3.2,
          latencyMs: 3.2,
          tokensDensityKb: 0.5,
        },
      },
      {
        id: "hook_destructive_blocker",
        type: "hook_guard",
        name: "Destructive Command Blocker",
        category: "PreToolUse Guard",
        status: activeHaltedNodeId === "hook_destructive_blocker" ? "blocked" : "insync",
        description:
          "Blocks catastrophic disk wipe commands (rm -rf /, git reset --hard, del /s /q, format, DROP DATABASE).",
        lineage: {
          topicId: "GUARD-DEST-10",
          canonicalName: "destructive_command_blocker",
          path: [".skills-platform", "hooks", "guards", "destructive-command-blocker.js"],
          lifecycleState: "VERIFIED",
        },
        verification: {
          targetTestFile: "tests/e2e/tier1-features/f16-guard-hooks-library.test.js",
          allowedCommand: "rm file.txt / git stash / soft delete",
          prohibitedCommands: ["rm -rf /", "rm -rf /*", "del /s /q", "git reset --hard HEAD~10"],
          invariants: {
            preConditions: ["PreToolUse command inspection enabled"],
            strictInvariants: [
              "Halt destructive commands immediately with allow=false",
              "Latency < 15ms",
            ],
            postConditions: ["Diverts to Red Halt Node"],
          },
        },
        diagnostics:
          activeHaltedNodeId === "hook_destructive_blocker"
            ? {
                hookId: "destructive-command-blocker",
                priority: 10,
                violationType: "DESTRUCTIVE_COMMAND",
                blockedCommand: "rm -rf / --no-preserve-root",
                reason: "Forbidden recursive root wipe command: rm -rf /",
                selfCorrectHint:
                  "Use safe target paths or soft delete primitives instead of recursive forced wipes.",
                matchedPattern: "^\\s*rm\\s+(?:-[a-zA-Z]*r[a-zA-Z]*f|-[a-zA-Z]*f[a-zA-Z]*r)\\b",
              }
            : undefined,
        metrics: {
          durationMs: 2.8,
          latencyMs: 2.8,
          tokensDensityKb: 0.6,
        },
      },
      {
        id: "hook_context_budget",
        type: "hook_guard",
        name: "Context Budget Guard",
        category: "PreToolUse Guard",
        status: "insync",
        description:
          "Enforces 80,000 token density threshold (~320KB file payload ceiling) to prevent context explosion.",
        lineage: {
          topicId: "GUARD-BUDGET-15",
          canonicalName: "context_budget_guard",
          path: [".skills-platform", "hooks", "guards", "context-budget-guard.js"],
          lifecycleState: "VERIFIED",
        },
        verification: {
          targetTestFile: "tests/e2e/tier1-features/f16-guard-hooks-library.test.js",
          allowedCommand: "view_file / read_payload (< 320KB)",
          prohibitedCommands: ["Read raw dumps > 80k tokens"],
          invariants: {
            preConditions: ["Token calculation heuristics loaded"],
            strictInvariants: ["Payload size <= 320KB (80,000 tokens)"],
            postConditions: ["Truncate or paginate content exceeding limits"],
          },
        },
        metrics: {
          durationMs: 4.1,
          latencyMs: 4.1,
          tokensDensityKb: 0.9,
        },
      },
      {
        id: "hook_subagent_limiter",
        type: "hook_guard",
        name: "Subagent Recursion Limiter",
        category: "PreToolUse Guard",
        status: "insync",
        description:
          "Restricts recursive subagent delegation depth to max 3 levels and max 4 concurrent agents.",
        lineage: {
          topicId: "GUARD-SUBAGENT-25",
          canonicalName: "subagent_recursion_limiter",
          path: [".skills-platform", "hooks", "guards", "subagent-recursion-limiter.js"],
          lifecycleState: "VERIFIED",
        },
        verification: {
          targetTestFile: "tests/e2e/tier1-features/f16-guard-hooks-library.test.js",
          allowedCommand: "spawn_subagent(depth <= 3)",
          prohibitedCommands: ["spawn_subagent(depth > 3)", "circular delegation loops"],
          invariants: {
            preConditions: ["Subagent tracking tree registered"],
            strictInvariants: ["Max depth: 3, Max concurrent: 4"],
            postConditions: ["Circular calls blocked with recursive loop error"],
          },
        },
        metrics: {
          durationMs: 1.9,
          latencyMs: 1.9,
          tokensDensityKb: 0.4,
        },
      },
    ],
    [activeHaltedNodeId],
  );

  // Red Halt Short-Circuit Node
  const redHaltNode: FlowNodeDetail = useMemo(
    () => ({
      id: "halt_node_short_circuit",
      type: "halt_node",
      name: "Red Halt Short-Circuit Node",
      category: "Security Interception Terminal",
      status: activeHaltedNodeId ? "blocked" : "idle",
      description:
        "Immediate short-circuit deflection point when any PreToolUse guard evaluates allow=false. Halts downstream execution and provides self-correction hints.",
      lineage: {
        topicId: "HALT-TERMINAL-01",
        canonicalName: "short_circuit_halt_terminal",
        path: ["hooks", "short-circuit", "red-halt-node"],
        lifecycleState: "OPEN",
      },
      verification: {
        targetTestFile: "tests/e2e/tier1-features/f17-hook-short-circuit-engine.test.js",
        allowedCommand: "self_correct_and_retry()",
        prohibitedCommands: ["bypass_guard", "ignore_interception"],
        invariants: {
          preConditions: ["Guard interception triggered"],
          strictInvariants: [
            "Downstream tool execution aborted immediately",
            "Latency < 200ms",
            "Self-correction guidance emitted in diagnostics",
          ],
          postConditions: ["Security audit log written to events.ndjson"],
        },
      },
      diagnostics: activeHaltedNodeId
        ? {
            hookId: activeHaltedNodeId,
            priority: 5,
            violationType: "SECURITY_INTERCEPTION",
            reason: `Execution diverted to Red Halt Terminal by ${activeHaltedNodeId}.`,
            selfCorrectHint:
              "Follow recommended remediation: adjust command syntax or use environment variable indirection.",
          }
        : undefined,
      metrics: {
        durationMs: 8,
        latencyMs: 8,
        tokensDensityKb: 1.1,
      },
    }),
    [activeHaltedNodeId],
  );

  // Tool Execution Node
  const toolExecNode: FlowNodeDetail = useMemo(
    () => ({
      id: "tool_execution_node",
      type: "topic_node",
      name: "Tool Execution Runtime",
      category: "Runtime Execution",
      status: "insync",
      description:
        "Authorized runtime environment executing safe tool calls after traversing PreToolUse verification.",
      lineage: {
        topicId: "RUNTIME-TOOL-EXEC",
        canonicalName: "tool_execution_runtime",
        path: ["runtime", "tool-dispatcher"],
        lifecycleState: "VERIFIED",
      },
      metrics: {
        durationMs: 54,
        latencyMs: 12,
        tokensDensityKb: 16.5,
      },
    }),
    [],
  );

  // PostToolUse Chains
  const postGuards: FlowNodeDetail[] = useMemo(
    () => [
      {
        id: "hook_telemetry_collector",
        type: "hook_guard",
        name: "Universal Telemetry Collector",
        category: "PostToolUse Guard",
        status: "insync",
        description:
          "Records execution duration, status, memory metrics, and NDJSON log records to events.ndjson.",
        lineage: {
          topicId: "HOOK-TELEM-10",
          canonicalName: "telemetry_collector",
          path: [".skills-platform", "hooks", "guards", "telemetry-collector.js"],
          lifecycleState: "VERIFIED",
        },
        verification: {
          targetTestFile: "tests/e2e/tier1-features/f01-telemetry-hook.test.js",
          allowedCommand: "append_ndjson(event)",
          prohibitedCommands: [],
          invariants: {
            preConditions: ["Tool execution completed"],
            strictInvariants: ["Append event atomically in < 5ms"],
            postConditions: ["Event visible in Live Security Feed"],
          },
        },
        metrics: {
          durationMs: 1.8,
          latencyMs: 1.8,
          tokensDensityKb: 0.7,
        },
      },
      {
        id: "hook_scope_boundary",
        type: "hook_guard",
        name: "Scope Boundary Enforcer",
        category: "PostToolUse Guard",
        status: "insync",
        description:
          "Audits mutated file paths against VerticalTopicSpec.local_horizontal_scope.owned_files.",
        lineage: {
          topicId: "HOOK-SCOPE-20",
          canonicalName: "scope_boundary_enforcer",
          path: [".skills-platform", "hooks", "guards", "scope-boundary-enforcer.js"],
          lifecycleState: "VERIFIED",
        },
        verification: {
          targetTestFile: "tests/e2e/tier1-features/f16-guard-hooks-library.test.js",
          allowedCommand: "edit_file(owned_files)",
          prohibitedCommands: ["edit_file(out_of_bounds)"],
          invariants: {
            preConditions: ["Horizontal scope definition active"],
            strictInvariants: ["Reject mutations outside owned_files boundaries"],
            postConditions: ["Scope compliance verified"],
          },
        },
        metrics: {
          durationMs: 3.5,
          latencyMs: 3.5,
          tokensDensityKb: 1.2,
        },
      },
    ],
    [],
  );

  return (
    <div className="hook-pipeline-graph" aria-label="Hook Pipeline & Security Canvas">
      {/* Header */}
      <div className="flow-canvas-header">
        <div className="canvas-title-group">
          <Zap size={20} className="header-icon cyan" />
          <div>
            <h3>Hook Execution & Security Pipeline Graph</h3>
            <p>
              PreToolUse Priority Chain (Pri 5 ➔ 10 ➔ 15 ➔ 25) with Short-Circuit Red Halt Node &
              PostToolUse Chain
            </p>
          </div>
        </div>
        <div className="canvas-legend">
          <span className="legend-item">
            <span className="legend-dot active" /> PreToolUse Guard
          </span>
          <span className="legend-item">
            <span className="legend-dot passed" /> PostToolUse Enforcer
          </span>
          <span className="legend-item">
            <span className="legend-dot blocked" /> Red Halt Node
          </span>
        </div>
      </div>

      {/* Main Pipeline Layout */}
      <div className="hook-pipeline-container">
        {/* Stage 1: Inbound Tool Call */}
        <div className="pipeline-inbound-card">
          <div className="inbound-badge">
            <Terminal size={14} />
            <span>Inbound Tool Call</span>
          </div>
          <code>execute_command(payload)</code>
        </div>

        <div className="pipe-arrow-down">
          <ArrowDown size={18} className="cyan" />
        </div>

        {/* Stage 2: PreToolUse Priority Chain */}
        <div className="pretool-chain-section">
          <div className="chain-header">
            <Shield size={16} className="cyan" />
            <span>PreToolUse Priority Chain (Sequential Evaluation)</span>
          </div>

          <div className="guards-grid">
            {preGuards.map((guard, idx) => {
              const priority = (idx === 0 ? 5 : idx === 1 ? 10 : idx === 2 ? 15 : 25);
              const isSelected = selectedNodeId === guard.id;
              const isHalted = activeHaltedNodeId === guard.id;

              return (
                <div
                  key={guard.id}
                  className={`guard-card ${guard.status} ${isSelected ? "selected" : ""} ${isHalted ? "halted-glow" : ""}`}
                  onClick={() => onSelectNode(guard)}
                  role="button"
                  tabIndex={0}
                  aria-label={`Guard: ${guard.name}`}
                  onKeyDown={(e) => e.key === "Enter" && onSelectNode(guard)}
                >
                  <div className="guard-header">
                    <div className="pri-badge">Priority {priority}</div>
                    <span className={`status-pill ${guard.status}`}>
                      {guard.status === "blocked" ? (
                        <OctagonX size={11} />
                      ) : (
                        <CheckCircle2 size={11} />
                      )}
                      {guard.status === "blocked" ? "HALTED" : "IN-SYNC"}
                    </span>
                  </div>
                  <h4 className="guard-name">{guard.name}</h4>
                  <p className="guard-desc">{guard.description}</p>
                  <div className="guard-footer">
                    <span className="guard-metric">{guard.metrics?.durationMs}ms</span>
                    <span className="guard-type">PreToolUse</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Short-Circuit Red Halt Node Branch */}
        <div className="short-circuit-branch-zone">
          <div className="deflection-label">
            <AlertOctagon size={14} className="danger" />
            <span>Short-Circuit Deflection Branch (allow=false)</span>
          </div>

          <div
            className={`red-halt-node-card ${selectedNodeId === redHaltNode.id ? "selected" : ""} ${activeHaltedNodeId ? "active-glow" : ""}`}
            onClick={() => onSelectNode(redHaltNode)}
            role="button"
            tabIndex={0}
            aria-label="Red Halt Short-Circuit Node"
            onKeyDown={(e) => e.key === "Enter" && onSelectNode(redHaltNode)}
          >
            <div className="halt-header">
              <div className="halt-icon-group">
                <OctagonX size={20} className="halt-octa" />
                <div>
                  <h4>RED HALT SHORT-CIRCUIT NODE</h4>
                  <p>Downstream Execution Terminated &bull; Latency &lt; 200ms</p>
                </div>
              </div>
              <span className={`status-pill ${activeHaltedNodeId ? "blocked" : "idle"}`}>
                {activeHaltedNodeId ? "HALTED" : "STANDBY"}
              </span>
            </div>

            {activeHaltedNodeId ? (
              <div className="halt-live-diagnostic">
                <div className="diagnostic-line">
                  <strong>Triggering Guard:</strong> <code>{activeHaltedNodeId}</code>
                </div>
                <div className="diagnostic-line">
                  <strong>Self-Correction Guidance:</strong>
                  <span>Mask secrets with environment variables or use scoped test commands.</span>
                </div>
              </div>
            ) : (
              <div className="halt-standby-hint">
                Awaiting guard interception trigger or 1-Click attack simulation injection.
              </div>
            )}
          </div>
        </div>

        <div className="pipe-arrow-down">
          <ArrowDown size={18} className="cyan" />
        </div>

        {/* Stage 3: Tool Execution */}
        <div
          className={`pipeline-tool-exec ${selectedNodeId === toolExecNode.id ? "selected" : ""}`}
          onClick={() => onSelectNode(toolExecNode)}
          role="button"
          tabIndex={0}
          aria-label="Tool Execution Runtime"
          onKeyDown={(e) => e.key === "Enter" && onSelectNode(toolExecNode)}
        >
          <Cpu size={18} className="cyan" />
          <div className="exec-info">
            <strong>Tool Execution Runtime</strong>
            <span>Authorized execution on host/sandbox container</span>
          </div>
          <span className="status-pill passed">
            <CheckCircle2 size={11} />
            Authorized
          </span>
        </div>

        <div className="pipe-arrow-down">
          <ArrowDown size={18} className="mint" />
        </div>

        {/* Stage 4: PostToolUse Chain */}
        <div className="posttool-chain-section">
          <div className="chain-header">
            <Sparkles size={16} className="mint" />
            <span>PostToolUse Chain (Audit, Ingestion & Scope Verification)</span>
          </div>

          <div className="guards-grid post-grid">
            {postGuards.map((guard, idx) => {
              const priority = idx === 0 ? 10 : 20;
              const isSelected = selectedNodeId === guard.id;

              return (
                <div
                  key={guard.id}
                  className={`guard-card post-card ${guard.status} ${isSelected ? "selected" : ""}`}
                  onClick={() => onSelectNode(guard)}
                  role="button"
                  tabIndex={0}
                  aria-label={`Post Guard: ${guard.name}`}
                  onKeyDown={(e) => e.key === "Enter" && onSelectNode(guard)}
                >
                  <div className="guard-header">
                    <div className="pri-badge post">Priority {priority}</div>
                    <span className="status-pill passed">
                      <CheckCircle2 size={11} />
                      ACTIVE
                    </span>
                  </div>
                  <h4 className="guard-name">{guard.name}</h4>
                  <p className="guard-desc">{guard.description}</p>
                  <div className="guard-footer">
                    <span className="guard-metric">{guard.metrics?.durationMs}ms</span>
                    <span className="guard-type">PostToolUse</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
