# ADR 0008: Seamless Skill Authoring Golden Path (Quick-Sync Pipeline & Live Delivery Observability)

## Status
Proposed (2026-09-06)

## Context
Through real-world end-to-end authoring and delivery of specialized skills (e.g., `svg-authoring` grounded in W3C standards across multi-agent runtimes and project workspaces), a clear operational challenge was identified:

1. **5-Step Golden Path Friction**:
   Updating an authored skill from canonical source (`skills-packages/`) to an active project symlink requires orchestrating 5 sequential operations across two distinct packages:
   - `skills-catalog skill validate <path> --provider <id>` (static ruleset lint)
   - `skills-catalog import-local <path>` (immutable SHA-256 revision snapshot)
   - `skills-catalog project skill <project-id> enable <lineage> --skill <new-id>` (catalog binding state)
   - `skills-catalog project-plan <project-id> --enabled-only --out <plan.json>` (activation plan synthesis)
   - `skills-manager-adapter apply <plan.json> --confirm` (atomic symlink delivery with sidecar)
   While each step strictly preserves cryptographic immutability, auditability, and delivery safety, manually coordinating them during active iteration creates cognitive overhead and slows inner-loop feedback.

2. **Delivery State Observability**:
   Developers and autonomous agents need instantaneous visibility into whether a project's `.agents/skills/` link is healthy, pointing to the latest approved revision, or drifting from canonical source.

---

## Decisions

### 1. One-Touch Golden Path Command (`skills-catalog sync`)
Provide an integrated, atomic macro command in the `skills-catalog` CLI:
```bash
skills-catalog sync <skill-source-or-name> --project <project-id> [--confirm] [--watch]
```
- **Automated Pipeline Execution**:
  1. **Pre-flight Lint**: Runs `skill validate` against the provider contract. If any error finding occurs, the pipeline halts with exit code 1 before touching the registry or filesystem.
  2. **Revision Ingestion**: Atomically invokes `importLocalSource()`, generating a new content-addressed SHA-256 revision under `.skills-platform/registry/revisions/`.
  3. **Project Binding Pin**: Updates the project's lineage override to the newly minted `registry_skill_id`.
  4. **In-Memory Plan Synthesis**: Generates an ephemeral `ActivationPlan` without polluting `/tmp` with unmanaged JSON files.
  5. **Adapter Materialization**: Dispatches the plan directly to `skills-manager-adapter`, verifying ownership guards and atomically swapping the target symlink (`status: replace`).
- **Atomic Rollback**: If any stage fails, the project binding reverts to its prior revision, and no dangling sidecars are left behind.

### 2. Optional Development Watch Mode (`--watch`)
For intensive local skill iteration:
- Attaches an `fs.watch` daemon to `skills-packages/<package>/<skill>/`.
- Debounces file saves (300ms) and automatically triggers the `sync` pipeline.
- Project symlinks remain hot-reloaded to the latest immutable snapshot without manual developer intervention.

### 3. Direct Source Development Mode (`--dev-link` / Prototyping Mode)
For rapid inner-loop prototyping before formal release:
- Permits an explicit `--dev-link` flag that binds `.agents/skills/<skill>` directly to `skills-packages/...` (recorded in the sidecar as `"method": "dev_symlink"`).
- Introduces `skills-catalog freeze <skill>` to seal the working source into an immutable revision once development stabilizes.

### 4. Live Delivery & Sidecar Observability in Catalog UI (`apps/catalog-ui`)
Extend the Catalog UI (`SkillWorkspace.tsx` & `ProjectDetail.tsx`):
- **Live Sidecar Inspector**: Visually badges whether each materialized skill is:
  - 🟢 **Conformant & In-Sync** (symlink matches latest registry revision digest).
  - 🟡 **Revision Outdated** (newer revision available in registry).
  - 🔴 **Unmanaged / Collision** (directory missing platform ownership marker).
- **One-Click "Sync & Promote"**: A single button in the web dashboard that executes the `sync` pipeline and refreshes live bindings.

---

## Consequences

- **10x Faster Skill Iteration**: Reduces skill update time from ~1 minute of manual CLI coordination to under 2 seconds.
- **Zero Drift Risk**: Automation eliminates manual copy-paste errors of revision IDs and content digests.
- **Preserved Boundary (ADR 0001)**: Catalog continues to delegate physical mutations exclusively to `skills-manager-adapter` via schema-validated plans, keeping core architectural boundaries intact.
