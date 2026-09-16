# Antigravity Multi-Agent Personas & Subagent Routing

In Google Antigravity (AGY), complex multi-faceted engineering tasks are executed
not by overloading a single monolithic context window, but by orchestrating
specialized **Subagents** acting as **Cognitive Personas**.

This architecture cleanly decouples domain-specific deep knowledge from cross-functional
engineering hygiene, preventing context saturation, hallucination, and prompt interference.

---

## 1. Antigravity Subagent Orchestration Architecture

Antigravity provides native subagent leasing and lifecycle control:

```
                          ┌────────────────────────┐
                          │   Main Orchestrator    │
                          │      Parent Agent      │
                          └───────────┬────────────┘
                                      │
              ┌───────────────────────┼───────────────────────┐
              │ invoke_subagent       │ invoke_subagent       │ invoke_subagent
              ▼                       ▼                       ▼
    ┌───────────────────┐   ┌───────────────────┐   ┌───────────────────┐
    │  Subagent Alpha   │   │   Subagent Beta   │   │  Subagent Gamma   │
    │  (Role: Chrome)   │   │ (Role: Debugging) │   │   (Role: QA)      │
    │  Specialized CDP  │   │  libuv & Teardown │   │  1:1 TDD Isolation│
    └─────────┬─────────┘   └─────────┬─────────┘   └─────────┬─────────┘
              │                       │                       │
              └───────────────────────┼───────────────────────┘
                                      │ Reactive Wakeup (send_message)
                                      ▼
                          ┌────────────────────────┐
                          │    Parent Synthesis    │
                          └────────────────────────┘
```

### 1.1 Native Orchestration Tools
- `invoke_subagent`: Dispatches one or more subagents in parallel with explicit `Role`, `Prompt`, and `Model` (`inherit`, `flash`, `pro`).
- `send_message`: Sends bidirectional messages between parent and subagents using their unique `conversationId`.
- `manage_subagents`: Inspects live subagent state (`list`) or gracefully cancels running trees (`kill`, `kill_all`).
- `define_subagent`: Programmatically registers custom subagent types with specialized system prompts and tool access permissions.

### 1.2 Reactive Wakeup Model
Antigravity subagents operate under a non-polling reactive model:
- Subagents execute asynchronously in the background.
- The parent agent stops calling tools to end its turn.
- When any subagent completes or sends a message, the platform automatically resumes the parent agent's execution.

---

## 2. The 7 Expert Personas & Two-Tier Knowledge Split

To prevent context bloat, engineering knowledge is partitioned into two distinct tiers:
1. 🔒 **직무 고유 지식 (Specialized Knowledge)**: Deep internal runbooks, socket protocols, binary specs, and closed DSLs that must only be loaded when delegated to the corresponding persona.
2. 🌐 **범용 공유 지식 (Cross-Functional Knowledge)**: Common safety invariants, process hygiene, test runner teardown, and authoring standards shared across all personas.

### 2.1 Persona Specifications

| Persona | English Role | 🔒 Specialized Knowledge (Domain Deep) | 🌐 Cross-Functional Knowledge (Shared) |
| :--- | :--- | :--- | :--- |
| **디버깅 전문가** | `Debugging Specialist`<br>(Runtime & Memory) | `deterministic-test-runner` (libuv handle leaks)<br>`lch-failure-recovery` (rollback states)<br>`workflow-feedback-optimizer` | `scoped-tdd-executor`<br>`skill-authoring-standard` |
| **크롬 자동화 전문가** | `Chrome Automation Specialist`<br>(CDP & Headless) | `chrome-instance-hygiene` (headless trap & port 9222)<br>`chrome-extensions` (MV3 service workers) | `modern-web-guidance`<br>`deterministic-test-runner` |
| **포토샵 작업 전문가** | `Photoshop Specialist`<br>(Photoshop & Generator) | `photoshop-toolchain-workflow` (Generator TCP 49494, Action Manager JSX, TypeSpec master schemas) | `svg-authoring`<br>`scoped-tdd-executor` |
| **웹 프로그래밍 전문가** | `Web Frontend Specialist`<br>(Web Platform & AST) | `modern-web-guidance` (Container Queries, View Transitions)<br>`lch-contract-compiler` (TS AST synchronizer) | `deterministic-test-runner`<br>`generative_ui` |
| **디자인 전문가** | `Design & Visual Specialist`<br>(Vector & UI Systems) | `svg-authoring` (W3C cubic Bezier, polar arc geometry)<br>`generative_ui` (Glassmorphism & interactive widgets) | `modern-web-guidance`<br>`scene-content-authoring` |
| **스토리텔러** | `Interactive Storyteller`<br>(Narrative & Scene) | `scene-content-authoring` (view(state), 3-lane scheduler)<br>`openwiki-grounding` (OKF v0.2 claim grounding)<br>`openwiki-cli` | `svg-authoring`<br>`generative_ui` |
| **QA 전문가** | `Deterministic QA Specialist`<br>(QA & Governance) | `deterministic-test-runner` (deterministic teardown)<br>`scoped-tdd-executor` (Test Storm Guard)<br>`lch-independent-auditor` | `chrome-instance-hygiene`<br>`skill-authoring-standard` |

---

## 3. Subagent Delegation Contract (`Role` Convention)

When invoking subagents for specialized tasks, always specify the canonical `Role` attribute corresponding to the target Persona:

```json
{
  "Subagents": [
    {
      "TypeName": "self",
      "Role": "Chrome Automation Specialist",
      "Prompt": "Diagnose locked port 9222 and purge orphaned headless Chrome instances without terminating user GUI Chrome (PID 80136). Apply chrome-instance-hygiene and verify via chrome-doctor.sh."
    },
    {
      "TypeName": "self",
      "Role": "Debugging Specialist",
      "Prompt": "Investigate test process hang in packages/schema-bridge/test/psd-sync-server-api.test.mjs. Enforce node-teardown-hook.mjs to verify libuv active handle cleanup."
    }
  ]
}
```

### 3.1 Persona Collaboration Dynamics
Personas frequently collaborate in cross-functional pairs:
- **Debugging Specialist ↔ Chrome Specialist**: When browser automation tests hang due to orphaned socket handles or headless traps.
- **Web Frontend Specialist ↔ Design Specialist**: When implementing mathematical SVG graphics or responsive Glassmorphism design tokens.
- **QA Specialist ↔ Debugging Specialist**: When isolating test regressions and applying 1:1 pinpoint TDD constraints.

---

## 4. Skills Platform Control Plane Interlocking

Antigravity subagents operate within the guardrails established by the Skills Platform:

1. **PreToolUse Protojson Guard Enforcement**:
   All subagents share the workspace's `.agents/hooks.json`. Calls to `run_command` are intercepted by compiled platform guards (`test-execution-guard.js`, `test-storm-guard.js`) ensuring strict protojson compatibility (`decision: "allow" | "deny"`).
2. **Deterministic Process Teardown**:
   When subagents execute `node --test`, the preload hook (`scripts/node-teardown-hook.mjs`) guarantees 0ms process exit upon completion, preventing orphaned background tasks from piling up.
3. **Non-Collapsing Principle (Persona ≠ Preset)**:
   A persona represents the cognitive actor, while presets represent static configuration catalogs. A single persona flexibly adopts different presets and `--work-scope` overlays across task phases without binding 1:1.
