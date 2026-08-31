# `@skills-platform/ledger-store`

Standalone monorepo package for the **Deterministic Ledger Storage & Real-Time Gap Analysis Engine** in Skills Platform.

---

## 🏛️ Features
* **Dual-Layer Persistence**: Append-only event sourcing (`events.ndjson`) + $O(1)$ materialized snapshots (`contract.json`, `ledger.json`, `state.json`).
* **Real-time Gap Calculation**: $\text{Gap}_t = A_{\text{required}} - V_t = \varnothing$.
* **DAG Dependency Resolution**: Automatic derivation of `ready` obligations from dependency chains.
* **Atomic State Transitions**: Thread-safe, non-destructive file updates.

---

## 📦 Usage

```javascript
const { createPlan, updatePlanContract, transitionObligation, calculatePlanGap } = require("@skills-platform/ledger-store");

const plan = await createPlan({ title: "OAuth Redis Session" });
const gap = await calculatePlanGap(plan.manifest.plan_id);
```
