import { useMemo } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Database,
  ExternalLink,
  FolderSync,
  Layers,
  Link2,
  RefreshCw,
  Server,
  Shield,
  Sparkles,
} from "lucide-react";
import type { FlowNodeDetail } from "./flow-types";

interface JunctionDeliveryMapProps {
  selectedNodeId: string | null;
  onSelectNode: (node: FlowNodeDetail) => void;
}

export function JunctionDeliveryMap({ selectedNodeId, onSelectNode }: JunctionDeliveryMapProps) {
  // Provider Junction Definitions
  const junctions: FlowNodeDetail[] = useMemo(
    () => [
      {
        id: "junction_antigravity",
        type: "junction_node",
        name: "Google Antigravity Junction",
        category: "Multi-Provider Delivery",
        status: "insync",
        description:
          "Symlink delivery root at .agents/skills/ and hook configuration at .agents/hooks.json for Antigravity agents.",
        lineage: {
          topicId: "JUNC-ANTIGRAVITY",
          canonicalName: "antigravity_delivery_junction",
          path: [".agents", "skills"],
          lifecycleState: "VERIFIED",
        },
        junction: {
          providerId: "antigravity",
          deliveryPath: ".agents/skills/",
          syncState: "insync",
          symlinkTarget: "packages/skill-contracts/dist",
          managedCount: 7,
          activePreset: "mlc-scoped-inner-loop",
        },
        verification: {
          targetTestFile: "tests/e2e/tier1-features/f02-agent-configs.test.js",
          allowedCommand: "skills-manager apply --provider antigravity",
          prohibitedCommands: [],
          invariants: {
            preConditions: [".agents/skills/ directory exists"],
            strictInvariants: [
              "Symlink destinations match active recipe bindings",
              "Drift detected if filesystem deviates from plan",
            ],
            postConditions: ["Hook handlers registered in .agents/hooks.json"],
          },
        },
        metrics: {
          durationMs: 24,
          latencyMs: 3,
          tokensDensityKb: 8.2,
        },
      },
      {
        id: "junction_claude",
        type: "junction_node",
        name: "Claude Desktop Junction",
        category: "Multi-Provider Delivery",
        status: "insync",
        description:
          "Symlink delivery root at .claude/skills/ and hook configuration at .claude/hooks.json for Anthropic Claude Desktop.",
        lineage: {
          topicId: "JUNC-CLAUDE",
          canonicalName: "claude_delivery_junction",
          path: [".claude", "skills"],
          lifecycleState: "VERIFIED",
        },
        junction: {
          providerId: "claude",
          deliveryPath: ".claude/skills/",
          syncState: "insync",
          symlinkTarget: "packages/skill-contracts/dist",
          managedCount: 7,
          activePreset: "mlc-scoped-inner-loop",
        },
        verification: {
          targetTestFile: "tests/e2e/tier1-features/f02-agent-configs.test.js",
          allowedCommand: "skills-manager apply --provider claude",
          prohibitedCommands: [],
          invariants: {
            preConditions: [".claude/skills/ directory exists"],
            strictInvariants: [
              "Symlink destinations match active recipe bindings",
              "Hook handlers registered in .claude/hooks.json",
            ],
            postConditions: ["Claude Desktop reads managed skill manifest"],
          },
        },
        metrics: {
          durationMs: 22,
          latencyMs: 4,
          tokensDensityKb: 7.9,
        },
      },
      {
        id: "junction_codex",
        type: "junction_node",
        name: "OpenAI Codex CLI Junction",
        category: "Multi-Provider Delivery",
        status: "drift",
        description:
          "Symlink delivery root at skills/ for OpenAI Codex and command-line execution tools.",
        lineage: {
          topicId: "JUNC-CODEX",
          canonicalName: "codex_delivery_junction",
          path: ["skills"],
          lifecycleState: "IN_PROGRESS",
        },
        junction: {
          providerId: "codex",
          deliveryPath: "skills/",
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
            preConditions: ["skills/ directory exists"],
            strictInvariants: [
              "Detect missing/stale symlinks and trigger drift warning",
              "Offer 1-click reconcile drift action in Live Activation Drawer",
            ],
            postConditions: ["Reconciled symlinks match active preset"],
          },
        },
        metrics: {
          durationMs: 38,
          latencyMs: 8,
          tokensDensityKb: 6.4,
        },
      },
    ],
    [],
  );

  // Active Preset Definition
  const activePresetNode: FlowNodeDetail = useMemo(
    () => ({
      id: "active_preset_inner_loop",
      type: "topic_node",
      name: "Active Recipe: Scoped Inner Loop (v2.1.0)",
      category: "Lifecycle Recipe Binding",
      status: "insync",
      description:
        "Declared preset providing pinpoint TDD executor, vertical context extractor, and context patch synthesizer.",
      lineage: {
        topicId: "PRESET-INNER-LOOP-V2",
        canonicalName: "scoped_inner_loop_recipe",
        path: ["recipes", "scoped-inner-loop-recipe.json"],
        lifecycleState: "VERIFIED",
      },
      verification: {
        targetTestFile: "packages/skill-contracts/test/contracts.test.js",
        allowedCommand: "validateSkillRecipe(recipe)",
        prohibitedCommands: [],
        invariants: {
          preConditions: ["JSON schema matches SkillRecipe specification"],
          strictInvariants: ["Hook bindings point to existing guard scripts"],
          postConditions: ["Hot-swaps delivery links without restart"],
        },
      },
      metrics: {
        durationMs: 12,
        tokensDensityKb: 3.8,
      },
    }),
    [],
  );

  return (
    <div className="junction-delivery-map" aria-label="Symlink Junction & Delivery Map">
      {/* Header */}
      <div className="flow-canvas-header">
        <div className="canvas-title-group">
          <Link2 size={20} className="header-icon cyan" />
          <div>
            <h3>Symlink Junction & Multi-Provider Delivery Map</h3>
            <p>
              Active presets mapped across multi-provider delivery roots (<code>.agents/skills/</code>, <code>.claude/skills/</code>, <code>skills/</code>) with Live Sync & Drift Watcher
            </p>
          </div>
        </div>
        <div className="canvas-legend">
          <span className="legend-item">
            <span className="legend-dot passed" /> In Sync
          </span>
          <span className="legend-item">
            <span className="legend-dot drift-dot" /> Drift Warning
          </span>
          <span className="legend-item">
            <span className="legend-dot pending" /> Pristine Baseline
          </span>
        </div>
      </div>

      {/* Main Delivery Layout */}
      <div className="junction-map-container">
        {/* Active Recipe Header Card */}
        <section
          className={`active-recipe-hub ${selectedNodeId === activePresetNode.id ? "selected" : ""}`}
          onClick={() => onSelectNode(activePresetNode)}
          role="button"
          tabIndex={0}
          aria-label="Active Recipe Hub"
          onKeyDown={(e) => e.key === "Enter" && onSelectNode(activePresetNode)}
        >
          <div className="recipe-hub-top">
            <div className="recipe-badge-title">
              <Layers size={18} className="mint" />
              <h4>Active Preset: Scoped Inner Loop (mlc-scoped-inner-loop)</h4>
            </div>
            <span className="status-pill passed">
              <CheckCircle2 size={11} />
              HOT-SWAPPED ACTIVE
            </span>
          </div>
          <p className="recipe-hub-desc">
            Controls dynamic symlink distribution across all 3 AI agent platform delivery paths.
          </p>
        </section>

        {/* Multi-Provider Junction Grid */}
        <div className="junction-cards-grid">
          {junctions.map((junc) => {
            const isSelected = selectedNodeId === junc.id;
            const isDrift = junc.status === "drift";

            return (
              <section
                key={junc.id}
                className={`junction-card ${junc.status} ${isSelected ? "selected" : ""}`}
                onClick={() => onSelectNode(junc)}
                role="button"
                tabIndex={0}
                aria-label={`Junction: ${junc.name}`}
                onKeyDown={(e) => e.key === "Enter" && onSelectNode(junc)}
              >
                <div className="junction-card-header">
                  <div className="provider-name-badge">
                    <Server size={15} />
                    <strong>{junc.name}</strong>
                  </div>
                  <span className={`status-pill ${isDrift ? "drift" : "passed"}`}>
                    {isDrift ? (
                      <>
                        <AlertTriangle size={11} />
                        DRIFT WARNING
                      </>
                    ) : (
                      <>
                        <CheckCircle2 size={11} />
                        IN SYNC
                      </>
                    )}
                  </span>
                </div>

                <p className="junction-desc">{junc.description}</p>

                <div className="junction-details-box">
                  <div className="detail-row">
                    <span className="detail-k">Delivery Path:</span>
                    <code className="detail-v">{junc.junction?.deliveryPath}</code>
                  </div>
                  <div className="detail-row">
                    <span className="detail-k">Target:</span>
                    <code className="detail-v">{junc.junction?.symlinkTarget}</code>
                  </div>
                  <div className="detail-row">
                    <span className="detail-k">Managed Skills:</span>
                    <span className="detail-v">{junc.junction?.managedCount} active links</span>
                  </div>
                </div>

                <div className="junction-card-footer">
                  <span className="sync-indicator">
                    {isDrift
                      ? "1 link divergent from recipe"
                      : "Filesystem matches declared recipe exactly"}
                  </span>
                  <span className="inspect-link">Click to Inspect &bull;</span>
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
