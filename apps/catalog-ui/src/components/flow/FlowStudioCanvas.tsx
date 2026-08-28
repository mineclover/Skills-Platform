import { useCallback, useState } from "react";
import {
  Activity,
  Dna,
  GitBranch,
  Layers,
  Link2,
  Maximize2,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Workflow,
  Zap,
} from "lucide-react";
import { FlowPlaybackController } from "./FlowPlaybackController";
import { FractalContextTree } from "./FractalContextTree";
import { HookPipelineGraph } from "./HookPipelineGraph";
import { JunctionDeliveryMap } from "./JunctionDeliveryMap";
import { LifecycleFlowDiagram } from "./LifecycleFlowDiagram";
import { NodeDetailInspector } from "./NodeDetailInspector";
import {
  INITIAL_LIFECYCLE_TASKS,
  VIEW_MODE_DEFS,
  type FlowNodeDetail,
  type FlowViewMode,
  type SimulationAttack,
  type SimulationPlaybackState,
} from "./flow-types";

interface FlowStudioCanvasProps {
  providerId?: string;
  projectPath?: string;
}

export function FlowStudioCanvas({
  providerId = "antigravity",
  projectPath,
}: FlowStudioCanvasProps) {
  const [activeViewMode, setActiveViewMode] = useState<FlowViewMode>("lifecycle");
  const [selectedNode, setSelectedNode] = useState<FlowNodeDetail | null>(null);
  const [isInspectorOpen, setIsInspectorOpen] = useState(false);
  const [tasks, setTasks] = useState<FlowNodeDetail[]>(INITIAL_LIFECYCLE_TASKS);
  const [activeHaltedNodeId, setActiveHaltedNodeId] = useState<string | null>(null);

  // Select node handler
  const handleSelectNode = useCallback((node: FlowNodeDetail) => {
    setSelectedNode(node);
    setIsInspectorOpen(true);
  }, []);

  // Attack trigger handler from Playback Controller
  const handleAttackTrigger = useCallback(
    (attack: SimulationAttack, resultNode: FlowNodeDetail) => {
      setActiveHaltedNodeId(resultNode.id);
      setSelectedNode(resultNode);
      setIsInspectorOpen(true);

      // If attack is test storm, update Phase 2 tasks visual state
      if (attack.id === "attack_test_storm") {
        setTasks((prev) =>
          prev.map((t) =>
            t.phase === 2
              ? { ...t, status: t.id === "task_inner_loop_tdd" ? "blocked" : t.status }
              : t,
          ),
        );
      } else if (attack.id === "attack_clean_invocation") {
        setTasks((prev) =>
          prev.map((t) => ({
            ...t,
            status: "passed",
          })),
        );
      }
    },
    [],
  );

  // Reset handler
  const handleReset = useCallback(() => {
    setActiveHaltedNodeId(null);
    setSelectedNode(null);
    setIsInspectorOpen(false);
    setTasks(INITIAL_LIFECYCLE_TASKS);
  }, []);

  return (
    <div className="flow-studio-workspace" aria-label="Flow Studio Workspace">
      {/* Top Workspace Header & Mode Switcher */}
      <header className="flow-studio-header">
        <div className="flow-header-left">
          <div className="flow-badge-title">
            <Workflow size={24} className="flow-brand-icon" />
            <div>
              <h1>Flow Studio Visual Canvas</h1>
              <p>
                Interactive State Machine Inspection &bull; Pre/Post Hook Security &bull; Relative Fractal Context Hierarchy &bull; Multi-Provider Junction Map
              </p>
            </div>
          </div>
        </div>

        <div className="flow-header-right">
          <div className="canvas-provider-pill">
            <span className="pill-dot" />
            <span>Active Provider: <strong>{providerId}</strong></span>
          </div>
        </div>
      </header>

      {/* 4-Tab View Mode Switcher */}
      <nav className="flow-mode-nav-tabs" aria-label="Flow Studio View Modes">
        {VIEW_MODE_DEFS.map((mode) => {
          const isActive = activeViewMode === mode.id;
          return (
            <button
              key={mode.id}
              type="button"
              className={`mode-tab-btn ${isActive ? "active" : ""}`}
              onClick={() => setActiveViewMode(mode.id)}
              title={mode.description}
              aria-selected={isActive}
              role="tab"
            >
              {mode.id === "lifecycle" ? (
                <RefreshCw size={16} />
              ) : mode.id === "hook_pipeline" ? (
                <Zap size={16} />
              ) : mode.id === "fractal_tree" ? (
                <Dna size={16} />
              ) : (
                <Link2 size={16} />
              )}
              <span className="mode-tab-label">{mode.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Main Interactive Canvas Surface */}
      <div className="flow-canvas-viewport">
        {activeViewMode === "lifecycle" ? (
          <LifecycleFlowDiagram
            tasks={tasks}
            selectedNodeId={selectedNode?.id ?? null}
            onSelectNode={handleSelectNode}
            activeHaltedNodeId={activeHaltedNodeId}
          />
        ) : activeViewMode === "hook_pipeline" ? (
          <HookPipelineGraph
            selectedNodeId={selectedNode?.id ?? null}
            onSelectNode={handleSelectNode}
            activeHaltedNodeId={activeHaltedNodeId}
          />
        ) : activeViewMode === "fractal_tree" ? (
          <FractalContextTree
            selectedNodeId={selectedNode?.id ?? null}
            onSelectNode={handleSelectNode}
          />
        ) : (
          <JunctionDeliveryMap
            selectedNodeId={selectedNode?.id ?? null}
            onSelectNode={handleSelectNode}
          />
        )}
      </div>

      {/* Bottom Docked Simulation Playback Controller */}
      <FlowPlaybackController
        onAttackTrigger={handleAttackTrigger}
        onReset={handleReset}
        activeHaltedNodeId={activeHaltedNodeId}
      />

      {/* Slide-Over Node Detail Inspector Drawer */}
      <NodeDetailInspector
        node={selectedNode}
        isOpen={isInspectorOpen}
        onClose={() => setIsInspectorOpen(false)}
      />
    </div>
  );
}
