import { useMemo } from "react";
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Database,
  Dna,
  FileCode,
  FolderTree,
  GitBranch,
  Layers,
  Network,
  Shield,
  Sparkles,
  Target,
} from "lucide-react";
import type { FlowNodeDetail } from "./flow-types";

interface FractalContextTreeProps {
  selectedNodeId: string | null;
  onSelectNode: (node: FlowNodeDetail) => void;
}

export function FractalContextTree({ selectedNodeId, onSelectNode }: FractalContextTreeProps) {
  // Level 0 Definition
  const level0Node: FlowNodeDetail = useMemo(
    () => ({
      id: "fractal_level_0",
      type: "topic_node",
      name: "Level 0: System Horizon (Global Plane)",
      category: "Architectural Horizon",
      status: "insync",
      description:
        "Global Element Registry & Topology Map (~320KB). Coordinates multi-agent responsibilities, shared contracts, and platform baseline.",
      lineage: {
        topicId: "HORIZON-GLOBAL-L0",
        canonicalName: "system_horizon_plane",
        path: ["architecture", "global-topology", "MASTER_BASELINE.md"],
        lifecycleState: "VERIFIED",
      },
      verification: {
        targetTestFile: "tests/e2e/tier1-features/f12-phase3-release-gate.test.js",
        allowedCommand: "node tests/e2e/run-all.js",
        prohibitedCommands: [],
        invariants: {
          preConditions: ["All subsystem topic patches validated"],
          strictInvariants: [
            "Compacted token density <= 80,000 tokens",
            "Zero circular dependency cycles across workspaces",
          ],
          postConditions: ["MASTER_BASELINE.md synced with verified platform state"],
        },
      },
      metrics: {
        durationMs: 85,
        latencyMs: 14,
        tokensDensityKb: 78.4,
      },
    }),
    [],
  );

  // Level 1 Definition
  const level1Node: FlowNodeDetail = useMemo(
    () => ({
      id: "fractal_level_1",
      type: "topic_node",
      name: "Level 1: Local Topic Reference Plane",
      category: "Horizontal Scope Plane",
      status: "active",
      description:
        "Isolates local horizontal boundaries: owned_files, read_only_interfaces, and out_of_bounds prohibitions.",
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
          preConditions: ["Horizontal scope definition active"],
          strictInvariants: [
            "Mutations strictly confined to owned_files",
            "Access to out_of_bounds files blocked by Scope Boundary Enforcer",
          ],
          postConditions: ["Local patch prepared for upward roll-up"],
        },
      },
      metrics: {
        durationMs: 42,
        tokensDensityKb: 24.8,
        liveDiff: {
          targetFile: "apps/catalog-ui/src/components/flow/FractalContextTree.tsx",
          additions: 120,
          deletions: 0,
          diffSnippet: `+  "owned_files": ["apps/catalog-ui/src/components/flow/*"],\n+  "out_of_bounds": ["apps/skills-manager/*", ".env*"]`,
        },
      },
    }),
    [],
  );

  // Level 2 Definition
  const level2Node: FlowNodeDetail = useMemo(
    () => ({
      id: "fractal_level_2",
      type: "topic_node",
      name: "Level 2: Pinpoint 80k Bounded Spec",
      category: "Vertical Topic Resolution Plane",
      status: "active",
      description:
        "Canonical VerticalTopicSpec containing concrete behavioral invariants (pre, strict, post) and 1:1 pinned target test file.",
      lineage: {
        topicId: "TOPIC-FLOW-STUDIO-V01",
        canonicalName: "topic_flow_canvas_visualizer",
        path: ["packages", "skill-contracts", "src", "types.ts#VerticalTopicSpec"],
        lifecycleState: "IN_PROGRESS",
      },
      verification: {
        targetTestFile: "apps/catalog-ui/test/flow-studio.test.js",
        allowedCommand: "node --test apps/catalog-ui/test/flow-studio.test.js",
        prohibitedCommands: ["npm test", "pytest", "jest", "cargo test", "*"],
        invariants: {
          preConditions: [
            "Pinpoint scoped target test pinned",
            "Token budget <= 80k tokens density",
          ],
          strictInvariants: [
            "1:1 TDD verification loop",
            "Test storm attempts suppressed by guard shield",
          ],
          postConditions: [
            "Task status transitions to VERIFIED",
            "Context Patch Proposal rolls up to Level 1",
          ],
        },
      },
      metrics: {
        durationMs: 18,
        tokensDensityKb: 12.2,
      },
    }),
    [],
  );

  // Roll-Up Proposal Node
  const rollupProposalNode: FlowNodeDetail = useMemo(
    () => ({
      id: "rollup_context_patch",
      type: "topic_node",
      name: "Upward Roll-Up & Context Patch Proposal",
      category: "Context Synthesis & Roll-Up",
      status: "passed",
      description:
        "Structured patch bundle synthesizing Level 2 TDD proof, invariant satisfaction, and changeset diff into Level 1 & Level 0.",
      lineage: {
        topicId: "PATCH-ROLLUP-01",
        canonicalName: "context_patch_proposal",
        path: ["synthesis", "context-patch-synthesizer.js"],
        lifecycleState: "VERIFIED",
      },
      verification: {
        targetTestFile: "packages/skill-contracts/test/contracts.test.js",
        allowedCommand: "validate_patch_proposal(patch)",
        prohibitedCommands: [],
        invariants: {
          preConditions: ["Target test 100% passing", "All invariants validated"],
          strictInvariants: ["Compact changeset diff into master baseline"],
          postConditions: ["Level 0 Horizon updated without context overflow"],
        },
      },
      metrics: {
        durationMs: 9,
        tokensDensityKb: 4.5,
        liveDiff: {
          targetFile: "MASTER_BASELINE.md",
          additions: 15,
          deletions: 2,
          diffSnippet: `+ ## Topic: Flow Studio Visual Canvas\n+ - Status: VERIFIED\n+ - Target Test: apps/catalog-ui/test/flow-studio.test.js (100% Pass)`,
        },
      },
    }),
    [],
  );

  return (
    <div className="fractal-context-tree" aria-label="Relative Fractal Context Tree">
      {/* Header */}
      <div className="flow-canvas-header">
        <div className="canvas-title-group">
          <Dna size={20} className="header-icon purple" />
          <div>
            <h3>Relative Fractal Context Hierarchy Tree</h3>
            <p>
              Level 0 (System Horizon) ➔ Level 1 (Local Topic Plane) ➔ Level 2 (Pinpoint 80k Spec) &
              Upward Roll-Up Flow
            </p>
          </div>
        </div>
        <div className="canvas-legend">
          <span className="legend-item">
            <span className="legend-dot purple-dot" /> Architectural Horizon
          </span>
          <span className="legend-item">
            <span className="legend-dot active" /> Horizontal Scope
          </span>
          <span className="legend-item">
            <span className="legend-dot passed" /> Verified Spec & Roll-Up
          </span>
        </div>
      </div>

      {/* Fractal Planes Visualizer Layout */}
      <div className="fractal-tree-container">
        {/* Level 0: System Horizon */}
        <section
          className={`fractal-plane-card level-0 ${selectedNodeId === level0Node.id ? "selected" : ""}`}
          onClick={() => onSelectNode(level0Node)}
          role="button"
          tabIndex={0}
          aria-label="Level 0 System Horizon"
          onKeyDown={(e) => e.key === "Enter" && onSelectNode(level0Node)}
        >
          <div className="plane-header">
            <div className="plane-badge l0">Level 0 Horizon</div>
            <span className="status-pill passed">
              <CheckCircle2 size={11} />
              SYSTEM HORIZON
            </span>
          </div>
          <h4 className="plane-title">System Horizon & Global Topology Plane</h4>
          <p className="plane-desc">{level0Node.description}</p>
          <div className="plane-tags-row">
            <span className="plane-tag">Global Element Registry</span>
            <span className="plane-tag">Multi-Agent Responsibility Map</span>
            <span className="plane-tag">~320KB Budget Ceiling</span>
          </div>
        </section>

        {/* Downward Spec Drill-Down & Upward Roll-Up Connectors */}
        <div className="fractal-flow-channels">
          <div className="drilldown-channel">
            <span className="channel-label">1. Context Narrowing (Vertical Drill-Down)</span>
            <ArrowDown size={18} className="cyan" />
          </div>
          <div className="rollup-channel">
            <ArrowUp size={18} className="mint" />
            <span className="channel-label mint">3. Upward Roll-Up & Baseline Compaction</span>
          </div>
        </div>

        {/* Level 1: Local Topic Reference Plane */}
        <section
          className={`fractal-plane-card level-1 ${selectedNodeId === level1Node.id ? "selected" : ""}`}
          onClick={() => onSelectNode(level1Node)}
          role="button"
          tabIndex={0}
          aria-label="Level 1 Local Topic Plane"
          onKeyDown={(e) => e.key === "Enter" && onSelectNode(level1Node)}
        >
          <div className="plane-header">
            <div className="plane-badge l1">Level 1 Topic Plane</div>
            <span className="status-pill in_progress">
              <span className="pulse-dot" />
              HORIZONTAL SCOPE
            </span>
          </div>
          <h4 className="plane-title">Local Topic Reference Plane</h4>
          <p className="plane-desc">{level1Node.description}</p>

          <div className="scope-boundaries-grid">
            <div className="scope-box owned">
              <strong>Owned Files (Authorized):</strong>
              <code>apps/catalog-ui/src/components/flow/*</code>
              <code>apps/catalog-ui/src/types.ts</code>
            </div>
            <div className="scope-box readonly">
              <strong>Read-Only Interfaces:</strong>
              <code>packages/skill-contracts/src/types.ts</code>
            </div>
            <div className="scope-box outofbounds">
              <strong>Out-of-Bounds Prohibitions:</strong>
              <code>apps/skills-manager/*</code>
              <code>.env*</code>
            </div>
          </div>
        </section>

        {/* Downward Spec Drill-Down & Upward Roll-Up Connectors */}
        <div className="fractal-flow-channels">
          <div className="drilldown-channel">
            <span className="channel-label">2. Pinpoint TDD Contract Formulation</span>
            <ArrowDown size={18} className="cyan" />
          </div>
          <div className="rollup-channel">
            <ArrowUp size={18} className="mint" />
            <span className="channel-label mint">
              Context Patch Proposal (Diff & Invariant Proof)
            </span>
          </div>
        </div>

        {/* Level 2: Pinpoint 80k Bounded Spec & Roll-Up Card */}
        <div className="level-2-split-container">
          <section
            className={`fractal-plane-card level-2 ${selectedNodeId === level2Node.id ? "selected" : ""}`}
            onClick={() => onSelectNode(level2Node)}
            role="button"
            tabIndex={0}
            aria-label="Level 2 Pinpoint 80k Bounded Spec"
            onKeyDown={(e) => e.key === "Enter" && onSelectNode(level2Node)}
          >
            <div className="plane-header">
              <div className="plane-badge l2">Level 2 Spec</div>
              <span className="status-pill in_progress">
                <Target size={11} />
                PINPOINT SPEC
              </span>
            </div>
            <h4 className="plane-title">Pinpoint 80k Bounded Spec</h4>
            <div className="spec-meta-list">
              <div className="spec-meta-item">
                <span className="meta-k">Topic ID:</span>
                <code>topic_flow_canvas_visualizer</code>
              </div>
              <div className="spec-meta-item">
                <span className="meta-k">Pinned Test:</span>
                <code>apps/catalog-ui/test/flow-studio.test.js</code>
              </div>
              <div className="spec-meta-item">
                <span className="meta-k">Allowed Command:</span>
                <code>node --test apps/catalog-ui/test/flow-studio.test.js</code>
              </div>
            </div>
          </section>

          {/* Upward Roll-Up Proposal Terminal */}
          <section
            className={`fractal-plane-card rollup-card ${selectedNodeId === rollupProposalNode.id ? "selected" : ""}`}
            onClick={() => onSelectNode(rollupProposalNode)}
            role="button"
            tabIndex={0}
            aria-label="Context Patch Proposal"
            onKeyDown={(e) => e.key === "Enter" && onSelectNode(rollupProposalNode)}
          >
            <div className="plane-header">
              <div className="plane-badge rollup">Roll-Up Proposal</div>
              <span className="status-pill passed">
                <Sparkles size={11} />
                SYNTHESIZED
              </span>
            </div>
            <h4 className="plane-title">Context Patch Synthesis</h4>
            <p className="plane-desc">{rollupProposalNode.description}</p>
            <div className="rollup-proof-box">
              <CheckCircle2 size={14} className="mint" />
              <span>100% Invariants & Pinned Test Proof Verified</span>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
