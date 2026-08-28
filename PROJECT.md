# Project: Flow Studio Visualization Canvas

## Architecture
Flow Studio is a comprehensive visualization workspace integrated into the Skills Platform Web UI (`apps/catalog-ui`). It provides real-time visual monitoring, interactive state machine inspection, relative fractal context drill-down, and hook interception pipeline simulation.

```
+----------------------------------------------------------------------------------------------------+
|                                    FLOW STUDIO ARCHITECTURE                                         |
+----------------------------------------------------------------------------------------------------+
|  [ SideNavigation.tsx ] ──► [ CatalogApp.tsx ] ──► [ FlowStudioCanvas.tsx ]                        |
|                                                          │                                         |
|         ┌──────────────────────┬─────────────────────────┼────────────────────────┐                |
|         ▼                      ▼                         ▼                        ▼                |
|  [ LifecycleFlow ]      [ HookPipeline ]         [ FractalContext ]       [ JunctionDelivery ]      |
|  Phase 1: Plan          PreToolUse Chain:        Level 0: System Horizon  Multi-Provider:          |
|  Phase 2: Inner Loop    (Pri 5, 10, 15, 25)      Level 1: Topic Plane     - .agents/skills/        |
|  [Test Storm Shield]    Red Halt Node (Branch)   Level 2: 80k Spec        - .claude/skills/        |
|  Phase 3: Release Gate  PostToolUse Chain        Roll-Up Patch Proposal   - skills/                |
|         │                      │                         │                        │                |
|         └──────────────────────┴─────────────────────────┴────────────────────────┘                |
|                                                          │                                         |
|         ┌────────────────────────────────────────────────┴────────────────────────┐                |
|         ▼                                                                         ▼                |
|  [ FlowPlaybackController.tsx ]                                    [ NodeDetailInspector.tsx ]     |
|  Timeline Controls & 1-Click Attacks (<200ms)                      Slide-Over Drawer:              |
|  - API Key Leak (Pri 5 Halt)                                       - Canonical Topic ID & Lineage  |
|  - Destructive Command (Pri 10 Halt)                               - Target Test & Commands        |
|  - Test Storm Suppress (Phase 2 Shield)                            - Diagnostics & Hints           |
|  - Clean Safe Invocation (Success Pulse)                           - Live Diffs & Latency Metrics  |
+----------------------------------------------------------------------------------------------------+
```

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Flow Studio Canvas Workspace | Top-level container in `apps/catalog-ui/src/components/flow/FlowStudioCanvas.tsx` supporting 4 interactive visualization mode tabs. | M2 | ORIGINAL_REQUEST §R1 |
| 2 | 3-Phase Lifecycle Flow Diagram | `LifecycleFlowDiagram.tsx` visualizes Phase 1 (Plan/PRD), Phase 2 (Inner Loop TDD), Phase 3 (Release Gate), animated pulse, status pills, and Test Storm Suppression Guard shield. | M2 | ORIGINAL_REQUEST §R1.1 |
| 3 | Hook Execution & Security Pipeline Graph | `HookPipelineGraph.tsx` visualizes PreToolUse priority chain (5 -> 10 -> 15 -> 25), short-circuit branching to Red Halt Node with self-correction hints, and PostToolUse chain. | M2 | ORIGINAL_REQUEST §R1.2 |
| 4 | Relative Fractal Context Hierarchy Tree | `FractalContextTree.tsx` visualizes Level 0 Horizon, Level 1 Topic Plane (owned vs out-of-bounds), Level 2 Pinpoint 80k Spec (1:1 Target Test), and Upward Roll-Up & Context Patch Proposal flow. | M2 | ORIGINAL_REQUEST §R1.3 |
| 5 | Symlink Junction & Delivery Map | `JunctionDeliveryMap.tsx` visualizes multi-provider paths (`.agents/skills/`, `.claude/skills/`, `skills/`) with live sync and drift detection indicators. | M2 | ORIGINAL_REQUEST §R1.4 |
| 6 | Interactive Node Detail Inspector Panel | `NodeDetailInspector.tsx` slide-over drawer showing Topic ID, lineage, lifecycle state, target test, allowed/prohibited commands, hook diagnostics, self-correction hints, live diffs, and execution metrics. | M3 | ORIGINAL_REQUEST §R2 |
| 7 | Flow Simulation & Playback Engine | `FlowPlaybackController.tsx` provides timeline controls (Play, Step, Reset, Scrubber) and 1-Click Simulation Attack Injections (API key leak, destructive rm -rf, test storm attempt, clean invocation) with packet flow animation < 200ms. | M1 | ORIGINAL_REQUEST §R3 |
| 8 | App Navigation & Theme Integration | `SideNavigation.tsx`, `CatalogApp.tsx`, `styles.css` integrate "Flow Studio" into navigation and routing with harmonized dark theme styling, glowing status badges, and SVG canvas styles. | M4 | ORIGINAL_REQUEST §R4 |
| 9 | Flow Studio Unit & Logic Test Suite | `apps/catalog-ui/test/flow-studio.test.js` comprehensive tests covering all 4 view modes, state transitions, inspector data extraction, and attack simulation timing. | E2E | Acceptance Criteria |
| 10 | E2E Integration Test Suite | `tests/e2e/tier1-features/f20-flow-studio-canvas.test.js` covering opaque-box feature behaviors, boundary conditions, pairwise combinations, and scenario flows. | E2E | Acceptance Criteria |
| 11 | Full Verification & Adversarial Hardening | Verification of `npm run check`, `npm test`, `node tests/e2e/run-all.js`, `npm run build`, and forensic integrity audit. | M5 | Acceptance Criteria |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| E2E | E2E Testing Track | Design & implement comprehensive E2E test suites (Tiers 1-4) in parallel -> publish `TEST_READY.md`. | none | DONE |
| M1 | Core Flow Data Types & Playback / Simulation Engine | Implement `flow-types.ts` and `FlowPlaybackController.tsx` with simulation attack injection engine (<200ms latency). | none | DONE |
| M2 | 4 Flow Visualization Canvas View Modes | Implement `FlowStudioCanvas.tsx`, `LifecycleFlowDiagram.tsx`, `HookPipelineGraph.tsx`, `FractalContextTree.tsx`, `JunctionDeliveryMap.tsx`. | M1 | DONE |
| M3 | Interactive Node Detail Inspector Drawer | Implement `NodeDetailInspector.tsx` with slide-over animation, diagnostics, live diffs, and metrics. | M2 | DONE |
| M4 | Navigation, App Routing & Theme Integration | Update `SideNavigation.tsx`, `CatalogApp.tsx`, and `styles.css` for clean integration. | M2, M3 | DONE |
| M5 | 100% E2E Pass, Adversarial Coverage Hardening (Tier 5) & Forensic Audit | Verify all E2E tiers, perform Tier 5 adversarial stress testing, run forensic audit, and confirm all build checks. | E2E, M4 | DONE |

## Interface Contracts
### FlowNodeDetail & Canvas Interaction
```typescript
export type FlowViewMode = "lifecycle" | "hook_pipeline" | "fractal_tree" | "junction_map";

export interface FlowNodeDetail {
  id: string;
  type: "lifecycle_phase" | "task_card" | "hook_guard" | "halt_node" | "topic_node" | "junction_node" | "shield_guard";
  name: string;
  category?: string;
  status: "idle" | "active" | "passed" | "blocked" | "drift" | "insync" | "pending" | "in_progress";
  lineage: {
    topicId?: string;
    canonicalName?: string;
    path: string[];
    lifecycleState?: "OPEN" | "IN_PROGRESS" | "VERIFIED" | "REOPENED" | "CLOSED";
  };
  verification?: {
    targetTestFile: string;
    allowedCommand: string;
    prohibitedCommands: string[];
    invariants: {
      preConditions: string[];
      strictInvariants: string[];
      postConditions: string[];
    };
  };
  diagnostics?: {
    hookId?: string;
    priority?: number;
    violationType?: string;
    blockedCommand?: string;
    reason?: string;
    selfCorrectHint?: string;
    matchedPattern?: string;
  };
  metrics?: {
    durationMs: number;
    latencyMs?: number;
    toolCallsCount?: number;
    tokensDensityKb?: number;
    liveDiff?: {
      targetFile: string;
      additions: number;
      deletions: number;
      diffSnippet: string;
    };
  };
  junction?: {
    providerId: "antigravity" | "codex" | "claude";
    deliveryPath: string;
    syncState: "insync" | "drift" | "pristine";
    symlinkTarget: string;
  };
}
```

### Simulation Attack Payloads
```typescript
export interface SimulationAttack {
  id: "attack_secret_leak" | "attack_destructive_command" | "attack_test_storm" | "attack_clean_invocation";
  title: string;
  description: string;
  command: string;
  expectedHaltNode: string;
  expectedLatencyMaxMs: number; // 200ms
  expectedHint: string;
}
```

## Code Layout
- `apps/catalog-ui/src/components/flow/`:
  - `flow-types.ts`
  - `FlowStudioCanvas.tsx`
  - `LifecycleFlowDiagram.tsx`
  - `HookPipelineGraph.tsx`
  - `FractalContextTree.tsx`
  - `JunctionDeliveryMap.tsx`
  - `NodeDetailInspector.tsx`
  - `FlowPlaybackController.tsx`
- `apps/catalog-ui/src/components/SideNavigation.tsx`
- `apps/catalog-ui/src/CatalogApp.tsx`
- `apps/catalog-ui/src/styles.css`
- `apps/catalog-ui/test/flow-studio.test.js`
- `tests/e2e/tier1-features/f20-flow-studio-canvas.test.js`
- `tests/e2e/tier5-adversarial/challenger-flow-studio.test.js`
- `apps/catalog-ui/test/challenger2-empirical.test.js`
