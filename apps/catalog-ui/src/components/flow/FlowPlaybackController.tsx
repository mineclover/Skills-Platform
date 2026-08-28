import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  FastForward,
  Flame,
  Pause,
  Play,
  RotateCcw,
  Shield,
  ShieldAlert,
  SkipForward,
  Sparkles,
  Terminal,
  Zap,
} from "lucide-react";
import {
  SIMULATION_ATTACKS,
  type FlowNodeDetail,
  type SimulationAttack,
  type SimulationPlaybackState,
} from "./flow-types";

interface FlowPlaybackControllerProps {
  onAttackTrigger: (attack: SimulationAttack, resultNode: FlowNodeDetail) => void;
  onStateChange?: (state: SimulationPlaybackState) => void;
  onReset: () => void;
  activeHaltedNodeId: string | null;
}

export function FlowPlaybackController({
  onAttackTrigger,
  onStateChange,
  onReset,
  activeHaltedNodeId,
}: FlowPlaybackControllerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [speed, setSpeed] = useState<number>(1);
  const [activeAttackId, setActiveAttackId] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState<number>(0);
  const [haltedNodeId, setHaltedNodeId] = useState<string | null>(activeHaltedNodeId);
  const [haltedReason, setHaltedReason] = useState<string | null>(null);
  const [haltedHint, setHaltedHint] = useState<string | null>(null);
  const [logs, setLogs] = useState<
    Array<{ timestamp: number; type: "info" | "warning" | "error" | "success"; text: string }>
  >([
    {
      timestamp: Date.now(),
      type: "info",
      text: "Simulation engine initialized. Ready for live stream or 1-Click attack injection.",
    },
  ]);

  const totalSteps = 6;
  const intervalRef = useRef<number | null>(null);

  const addLog = useCallback(
    (type: "info" | "warning" | "error" | "success", text: string) => {
      setLogs((prev) => [
        { timestamp: Date.now(), type, text },
        ...prev.slice(0, 19), // Keep latest 20 logs
      ]);
    },
    [],
  );

  // Sync internal halted node state with prop
  useEffect(() => {
    setHaltedNodeId(activeHaltedNodeId);
  }, [activeHaltedNodeId]);

  // Execute 1-Click Simulation Attack
  const handleTriggerAttack = useCallback(
    (attack: SimulationAttack) => {
      const startTime = performance.now();
      setActiveAttackId(attack.id);
      setIsPlaying(false);
      setCurrentStep(1);

      addLog("info", `Injecting attack payload: [${attack.title}] -> "${attack.command}"`);

      // Evaluate attack in sub-200ms client-side logic engine
      let haltNodeId = attack.expectedHaltNode;
      let reason = "";
      let violationType = "";
      let status: "blocked" | "passed" = "blocked";

      if (attack.id === "attack_secret_leak") {
        violationType = "SECRET_LEAK";
        reason = "Raw OpenAI API key pattern matched: sk-proj-...";
        haltNodeId = "hook_secret_leak";
      } else if (attack.id === "attack_destructive_command") {
        violationType = "DESTRUCTIVE_COMMAND";
        reason = "Forbidden recursive destructive command: rm -rf /";
        haltNodeId = "hook_destructive_blocker";
      } else if (attack.id === "attack_test_storm") {
        violationType = "TEST_STORM_ATTEMPT";
        reason = "Un-scoped full test suite invocation suppressed during Phase 2 Inner Loop";
        haltNodeId = "shield_test_storm";
      } else if (attack.id === "attack_clean_invocation") {
        violationType = "CLEAN_INVOCATION";
        status = "passed";
        reason = "Pinpoint target test verified. All invariants satisfied.";
        haltNodeId = "phase_3_gate";
      }

      const executionDuration = Math.round(performance.now() - startTime + Math.random() * 8 + 4);
      setElapsedMs(executionDuration);

      const targetDetail: FlowNodeDetail = {
        id: haltNodeId,
        type:
          haltNodeId === "shield_test_storm"
            ? "shield_guard"
            : status === "passed"
              ? "lifecycle_phase"
              : "halt_node",
        name:
          status === "passed"
            ? "Phase 3 Release Gate (Authorized)"
            : `Halt: ${attack.title} Intercepted`,
        category: "Security & Guard Studio",
        status: status === "passed" ? "passed" : "blocked",
        description: reason,
        lineage: {
          topicId: `SIM-${attack.id.toUpperCase()}`,
          canonicalName: attack.id,
          path: ["simulation", "guards", attack.id],
          lifecycleState: status === "passed" ? "VERIFIED" : "OPEN",
        },
        verification: {
          targetTestFile: "apps/catalog-ui/test/flow-studio.test.js",
          allowedCommand: attack.command,
          prohibitedCommands: ["npm test", "rm -rf /", "sk-proj-..."],
          invariants: {
            preConditions: ["Hook priority chains mounted", "Token density budget valid"],
            strictInvariants: [
              "Halt execution immediately upon guard violation",
              "Execution latency < 200ms",
            ],
            postConditions: [
              status === "passed"
                ? "Full pipeline green pulse verified"
                : "Self-correction guidance emitted",
            ],
          },
        },
        diagnostics:
          status === "blocked"
            ? {
                hookId: attack.guardId ?? "guard-hook",
                priority: attack.priority ?? 5,
                violationType,
                blockedCommand: attack.command,
                reason,
                selfCorrectHint: attack.expectedHint,
                matchedPattern: attack.command,
              }
            : undefined,
        metrics: {
          durationMs: executionDuration,
          latencyMs: executionDuration,
          toolCallsCount: 1,
          tokensDensityKb: 1.2,
          liveDiff: {
            targetFile: "interception-event.ndjson",
            additions: 1,
            deletions: 0,
            diffSnippet: `+ {"event":"guard_interception","attack":"${attack.id}","halted_at":"${haltNodeId}","latency_ms":${executionDuration},"reason":"${reason}"}`,
          },
        },
      };

      setHaltedNodeId(haltNodeId);
      setHaltedReason(reason);
      setHaltedHint(attack.expectedHint);

      if (status === "blocked") {
        addLog(
          "error",
          `HALTED at [${haltNodeId}] (Pri ${attack.priority ?? "Guard"}) in ${executionDuration}ms: ${reason}`,
        );
        addLog("warning", `Self-Correction Hint: ${attack.expectedHint}`);
      } else {
        addLog(
          "success",
          `SUCCESS: Clean packet traversed entire pipeline in ${executionDuration}ms without violations.`,
        );
      }

      onAttackTrigger(attack, targetDetail);

      if (onStateChange) {
        onStateChange({
          isPlaying: false,
          currentStep: totalSteps,
          totalSteps,
          speed,
          activeAttackId: attack.id,
          activePacket: {
            fromNodeId: "inbound_tool_call",
            toNodeId: haltNodeId,
            progress: 1,
            status: status === "passed" ? "success" : "blocked",
          },
          haltedNodeId: haltNodeId,
          haltedReason: reason,
          haltedHint: attack.expectedHint,
          elapsedMs: executionDuration,
          logMessages: logs,
        });
      }
    },
    [addLog, logs, onAttackTrigger, onStateChange, speed, totalSteps],
  );

  // Step Forward
  const handleStepForward = useCallback(() => {
    setCurrentStep((prev) => {
      const next = prev >= totalSteps ? 0 : prev + 1;
      addLog("info", `Stepped timeline forward -> Step ${next}/${totalSteps}`);
      return next;
    });
  }, [addLog, totalSteps]);

  // Step Backward
  const handleStepBackward = useCallback(() => {
    setCurrentStep((prev) => {
      const next = prev <= 0 ? totalSteps : prev - 1;
      addLog("info", `Stepped timeline backward -> Step ${next}/${totalSteps}`);
      return next;
    });
  }, [addLog, totalSteps]);

  // Toggle Live Playback Stream
  const handleTogglePlay = useCallback(() => {
    setIsPlaying((prev) => {
      const next = !prev;
      addLog(next ? "info" : "warning", next ? "Started Live Stream playback." : "Paused playback.");
      return next;
    });
  }, [addLog]);

  // Playback timer loop
  useEffect(() => {
    if (isPlaying) {
      const stepDuration = Math.max(250, 1000 / speed);
      intervalRef.current = window.setInterval(() => {
        setCurrentStep((prev) => {
          if (prev >= totalSteps) {
            return 0;
          }
          return prev + 1;
        });
      }, stepDuration);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isPlaying, speed, totalSteps]);

  // Reset Simulation
  const handleReset = useCallback(() => {
    setIsPlaying(false);
    setCurrentStep(0);
    setActiveAttackId(null);
    setHaltedNodeId(null);
    setHaltedReason(null);
    setHaltedHint(null);
    setElapsedMs(0);
    addLog("info", "Reset timeline and cleared active simulation state.");
    onReset();
  }, [addLog, onReset]);

  return (
    <section className="flow-playback-controller" aria-label="Simulation Playback Controller">
      {/* 1-Click Simulation Attack Header */}
      <div className="playback-attacks-bar">
        <div className="attacks-label">
          <Zap size={16} className="zap-icon" />
          <span>1-Click Simulation Attacks (&lt;200ms Halt):</span>
        </div>
        <div className="attack-buttons-grid">
          {SIMULATION_ATTACKS.map((attack) => {
            const isSelected = activeAttackId === attack.id;
            const isClean = attack.id === "attack_clean_invocation";
            return (
              <button
                key={attack.id}
                type="button"
                className={`attack-pill-btn ${isSelected ? "selected" : ""} ${isClean ? "clean" : "danger"}`}
                onClick={() => handleTriggerAttack(attack)}
                title={`${attack.description} (Expected Latency: <${attack.expectedLatencyMaxMs}ms)`}
                aria-label={`Trigger simulation attack: ${attack.title}`}
              >
                {isClean ? <Sparkles size={14} /> : <Flame size={14} />}
                <span className="attack-btn-title">{attack.title}</span>
                <span className="attack-btn-latency">&lt;200ms</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Playback Bar: Timeline & Controls */}
      <div className="playback-toolbar">
        <div className="playback-controls-group">
          <button
            type="button"
            className="ctrl-btn reset"
            onClick={handleReset}
            title="Reset Simulation (Clear State)"
            aria-label="Reset simulation"
          >
            <RotateCcw size={15} />
            <span>Reset</span>
          </button>

          <button
            type="button"
            className={`ctrl-btn play-toggle ${isPlaying ? "playing" : ""}`}
            onClick={handleTogglePlay}
            title={isPlaying ? "Pause Live Stream" : "Play Live Stream"}
            aria-label={isPlaying ? "Pause playback" : "Play live stream"}
          >
            {isPlaying ? <Pause size={15} /> : <Play size={15} />}
            <span>{isPlaying ? "Pause" : "Play Live"}</span>
          </button>

          <button
            type="button"
            className="ctrl-btn step"
            onClick={handleStepBackward}
            title="Step Backward"
            aria-label="Step backward"
          >
            <SkipForward size={15} style={{ transform: "rotate(180deg)" }} />
          </button>

          <button
            type="button"
            className="ctrl-btn step"
            onClick={handleStepForward}
            title="Step Forward"
            aria-label="Step forward"
          >
            <SkipForward size={15} />
          </button>

          <div className="speed-selector">
            <span className="speed-label">Speed:</span>
            {[1, 2, 5].map((s) => (
              <button
                key={s}
                type="button"
                className={`speed-chip ${speed === s ? "active" : ""}`}
                onClick={() => setSpeed(s)}
                aria-label={`Set playback speed to ${s}x`}
              >
                {s}x
              </button>
            ))}
          </div>
        </div>

        {/* Timeline Scrubber */}
        <div className="timeline-scrubber-group">
          <span className="scrubber-label">
            Step {currentStep} / {totalSteps}
          </span>
          <input
            type="range"
            min="0"
            max={totalSteps}
            value={currentStep}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10);
              setCurrentStep(val);
              setIsPlaying(false);
            }}
            className="timeline-slider"
            aria-label="Simulation timeline scrubber"
          />
          <span className="scrubber-pct">
            {Math.round((currentStep / totalSteps) * 100)}%
          </span>
        </div>

        {/* Real-Time Metrics Pill */}
        {elapsedMs > 0 ? (
          <div className="playback-metric-pill" title="Execution Traversal Latency">
            <CheckCircle2 size={14} className="metric-icon" />
            <span>{elapsedMs}ms Latency</span>
          </div>
        ) : null}
      </div>

      {/* Active Interception / Halt Notice Banner */}
      {haltedNodeId && haltedReason ? (
        <div className={`simulation-alert-banner ${activeAttackId === "attack_clean_invocation" ? "success" : "blocked"}`}>
          <div className="alert-badge">
            {activeAttackId === "attack_clean_invocation" ? (
              <CheckCircle2 size={16} />
            ) : (
              <ShieldAlert size={16} />
            )}
            <strong>
              {activeAttackId === "attack_clean_invocation"
                ? "Full Green Pulse Traversal"
                : `Short-Circuit Halt: ${haltedNodeId}`}
            </strong>
          </div>
          <p className="alert-reason">{haltedReason}</p>
          {haltedHint ? (
            <div className="alert-hint">
              <span className="hint-tag">Self-Correction Guidance:</span>
              <span>{haltedHint}</span>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
