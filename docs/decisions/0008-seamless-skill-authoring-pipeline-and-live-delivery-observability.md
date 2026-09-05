# ADR 0008: Two-Tier Skill Delivery Architecture (Direct Reference Link & On-Demand Partial Snapshot)

## Status
Accepted (2026-09-06)

## Context
Through real-world end-to-end authoring and delivery of specialized skills (e.g., `svg-authoring` grounded in W3C standards across multi-agent runtimes and project workspaces), a fundamental operational insight was established:

1. **Inner-Loop Friction from Artificial Snapshot Isolation**:
   In initial designs, project symlinks exclusively targeted immutable registry snapshot directories (`.skills-platform/registry/revisions/...`). While ideal for frozen releases, forcing this model during local active authoring introduced unnecessary friction: editing the source required running a multi-step pipeline just to preview changes, prompting consideration of complex watch daemons.

2. **The Essence of a Skill Manager**:
   A skill management system should not artificially force synchronization pipelines when a simpler, native mechanism exists. Instead, the manager's true responsibility is:
   - Providing direct reference links during development so saving files immediately reflects in the workspace ("Just Refresh").
   - Enforcing deterministic ownership sidecars (`*.skills-platform-link-ownership.json`) to prevent collisions and unmanaged clutter.
   - Supplying an on-demand, single-skill **Partial Update** pipeline whenever a cryptographic snapshot is explicitly desired.

---

## Decisions

### 1. Tier 1: Direct Reference Mode as the Default Authoring Model ("Just Refresh")
For active skill authoring and project-local iteration:
- The project's `.agents/skills/<skill>` directory symlink points directly to the canonical source package under `skills-packages/<group>/<skill>`.
- **Zero Synchronization Needed**: Edits to `SKILL.md`, references, or scripts are instantly live. Autonomous agents and IDEs simply re-read files (or reload) with zero intermediate commands.
- **Bidirectional Editing**: Edits performed from within project links directly modify canonical sources, preventing fork-drift.
- **Ownership Marker**: The accompanying sidecar records `"method": "direct_source_symlink"`, establishing platform ownership without mutating source contents.

### 2. Tier 2: On-Demand Partial Update Pipeline (`skills-catalog sync`)
When an author reaches a milestone and wishes to freeze an immutable snapshot or update catalog registrations:
```bash
skills-catalog sync <skill-source-or-name> --project <project-id> [--confirm]
```
- **Targeted Scope (Partial Update)**: Operates strictly on the requested skill rather than forcing a heavy full-catalog reconciliation.
- **Automated Pipeline**:
  1. **Pre-flight Lint**: Runs `inspectSkillPackage` against provider rulesets (halts on errors).
  2. **Snapshot Ingestion**: Invokes `importLocalSource`, writing an immutable SHA-256 revision.
  3. **Project Binding Pin**: Updates the project's lineage override to the newly minted `registry_skill_id`.
  4. **Ephemeral Plan Synthesis**: Generates an in-memory `ActivationPlan`.
  5. **Adapter Materialization**: Dispatches to `skills-manager-adapter`, updating the symlink to the immutable snapshot (`status: replace` / `noop`).
- **Preview Safety**: Omitting `--confirm` outputs a dry-run preview of the resulting plan.

### 3. Live Delivery & Sidecar Observability in Catalog UI (`apps/catalog-ui`)
Extend the Catalog UI to clearly distinguish and observe both delivery tiers:
- **Badge Indicators**:
  - 🔵 **Direct Dev Link**: Points to canonical `skills-packages/` (live editing active).
  - 🟢 **Conformant Snapshot**: Points to the latest reviewed immutable registry revision.
  - 🟡 **Outdated Snapshot**: A newer revision exists in the registry.
  - 🔴 **Unmanaged / Collision**: Directory missing ownership sidecar.
- **One-Click Actions**: Single-click buttons to toggle between Direct Reference Mode and Snapshot Freeze.

---

## Consequences

- **Radically Simplified Inner Loop**: Day-to-day skill editing requires zero background sync daemons, zero build steps, and zero pipeline commands—just edit, save, and refresh.
- **Clean Separation of Concerns**: Day-to-day iteration uses Tier 1 (Direct Reference); official versioning and cross-team sharing use Tier 2 (Partial Snapshot).
- **Preserved Safety & Auditability (ADR 0001)**: Both modes continue to be tracked by ownership sidecars, preventing collisions with untracked directories.
