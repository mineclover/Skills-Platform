# Skills Manager Control Plane & Runtime Tools Bundle

> **Upstream Origin**: Skills Manager Desktop Platform Core  
> **Maintainer**: Skills Manager Core Team  
> **License**: Apache-2.0  
> **Package ID**: `skills-manager`  

---

## 📦 Bundle Overview

This bundle contains the official control plane, architecture standards, testing conventions, and runtime bridges for the **Skills Manager** platform and its **Orca Runtime Bridge**.

---

## 🛠️ Included Skills Directory

### 1. `skills-manager-orca` (Orca Bridge & Topic Inspector)
- **Role**: Health checks (`orca status --json`), bundled topic inspection (`orca skills list --json`), and bridging shared agent skills (`~/.agents/skills`) without mutating runtime internals.
- **Trigger**: "inspect Orca", "Orca provider", "skills manager orca".

### 2. `skills-manager-testing` (Scoped TDD & Quality Gates)
- **Role**: Enforces isolated target test execution, prevents test storms, and manages unit/integration/E2E test suites.
- **Trigger**: "run scoped tests", "test conventions", "quality gates".

### 3. `skills-manager-architecture` (Subsystem Boundaries & Invariants)
- **Role**: Definitive architectural reference, closed-loop maintenance principles (MLC-01 ~ MLC-14), and state machine boundaries.
- **Trigger**: "system architecture", "control plane invariants".

### 4. `skills-manager-tauri` (Desktop Application Backend & IPC)
- **Role**: Tauri backend patterns, Rust-to-TypeScript IPC bridges, and local filesystem sandboxing.

### 5. `skills-manager-ui` (Design System & Visualization Canvas)
- **Role**: React/Tailwind UI kit, Flow Studio lifecycle diagrams, and Live Merge Queue visualizers.
