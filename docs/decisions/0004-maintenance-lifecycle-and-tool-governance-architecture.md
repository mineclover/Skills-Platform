# ADR 0004: Maintenance Lifecycle, Tool Capability Taxonomy, and Closed-Loop Control Plane

## Status
Accepted (2026-08-27)

## Context
As agentic platforms scale, viewing maintenance as a simplistic "find bug -> patch code" script fails to preserve system integrity across long-running autonomous sessions. Maintenance is inherently a **continuous closed-loop control plane** that orchestrates four circulating assets:

```text
Prior Context -> Behavior -> Evidence -> Patch Proposal -> Validated Context Baseline
```

Treating skill suites (like Bounded Baseline Condenser Suite v0.3.1) merely as text compressors under an 80k token budget obscures the true operational paradigm. The core necessity is establishing strict boundaries between **Context**, **Method**, **Behavior/Skill**, **Capability**, and **Tool Binding**, while separating **Horizontal Exploration** from **Vertical Resolution**.

## Decisions

### 1. The Three Core Invariants
1. **Context is a Precondition of Behavior**: Behaviors execute only under explicitly published context snapshots.
2. **Behaviors Never Mutate Published Contexts Directly**: Behaviors consume context and output patch proposals; only the Governance layer validates and publishes new baselines.
3. **Tools Are Execution Mechanisms, Not Behaviors**: Tools provide atomic capabilities; methods define abstract procedures; skills orchestrate behaviors.

### 2. Five-Layer Maintenance Control Plane Architecture
1. **Registry Layer**: Independent Element, Topic, Responsibility, Convention, Method, and Tool Capability registries.
2. **Context Layer**: Horizontal Context (broad exploration prior) vs Vertical Context (single-topic resolution prior).
3. **Behavior Layer**: Horizontal Exploration (topic handoff compiler) vs Vertical Resolution (diagnosis, change, verification).
4. **Tool & Guard Layer**: `Context -> Method -> Skill -> Capability -> Tool Binding -> Invocation Guard`.
5. **Governance & Evidence Layer**: 10-state Maintenance Case state machine, Responsibility Gate, and Release Stabilization.

### 3. Responsibility Routing Gate
- Principle: **Problem Origin != Resolution Target**.
- Routing outcomes: `OWNED_RESOLUTION` (modify internal element), `DELEGATED_RESOLUTION` (within delegated scope), `BOUNDARY_MITIGATION` (mitigate at boundary/adapter), `HANDOFF_REQUIRED` (transfer to external owner), `OBSERVE_ONLY`, `OUT_OF_SCOPE`.

### 4. Semantic Presets & Dynamic Work-Scope Overlays
- **Base Pinned Presets**: `paperthin-reflexes` (28 skills).
- **Dynamic Work-Scope Overlays**:
  - `curation`: Overlays `condensation-core` (3 skills) for rapid baseline compression.
  - `architecture`: Overlays `baseline-curation-core` (11 skills) for 8-domain architectural reduction.
  - `toolchain`: Overlays `mlc-toolchain-plane` (6 skills) for method, capability, and invocation guard orchestration.
  - `governance`: Overlays `mlc-lifecycle-governance` (8 skills) for case state machine and responsibility gates.

## Consequences
- **Architectural Clarity**: Skills Platform transitions from a passive link distributor into an active, robust Maintenance Control Plane.
- **Context Integrity**: Autonomous models are prevented from runaway investigative rabbit holes via horizontal/vertical separation and recursive child-task branching.
- **Zero Token Waste**: Special-purpose maintenance and governance capabilities are loaded only on-demand through work-scope overlays.
