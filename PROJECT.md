# Project: Skills-Platform Procedure-Responsible Workspaces & Git-Native Sequential Merge Engine

## Architecture

The Skills Platform is transitioning from legacy physical NTFS junction hot-swapping on the root workspace to an **Isolated Git Worktree & Sequential Merge Pipeline** architecture.

```
                                +-----------------------------------+
                                |    @skills-platform/contracts     |
                                |  - ProcedureWorkspace Interface   |
                                |  - ProcedureType & Invariants     |
                                |  - Validation Utilities (R1 / M1) |
                                +-----------------+-----------------+
                                                  |
                    ┌─────────────────────────────┴─────────────────────────────┐
                    ▼                                                           ▼
+---------------------------------------+                   +---------------------------------------+
|  apps/skills-catalog/                 |                   |  apps/skills-catalog/                 |
|  src/workspace-manager.js (R2 / M2)   |                   |  src/sequential-merger.js (R3 / M3)   |
|  -----------------------------------  |                   |  -----------------------------------  |
|  - spawnProcedureWorkspace()          | ── (Worktrees) ─► |  - Ordered Merge Queue                |
|  - .workspaces/<task_id>              |                   |  - 1:1 Target Test Verification Gate  |
|  - Isolated .agents/skills/ mounts    |                   |  - Responsibility Invariant Check     |
|  - Root main pinned & pristine        |                   |  - Atomic Fast-Forward / Rebase Merge |
|  - pruneProcedureWorkspace()          |                   |  - Fault Isolation & Clean Discard    |
+-------------------+-------------------+                   +-------------------+-------------------+
                    |                                                           |
                    └─────────────────────────────┬─────────────────────────────┘
                                                  ▼
                                +-----------------------------------+
                                |  apps/skills-catalog/             |
                                |  - src/cli.js (workspace cmds)    |
                                |  - src/server.js (/api/workspaces)|
                                |  - src/index.js (re-exports) (R4) |
                                +-----------------+-----------------+
                                                  |
                                                  ▼
                                +-----------------------------------+
                                |  apps/catalog-ui/ (R5 / M5)       |
                                |  - Procedure Workspaces Canvas    |
                                |  - Live Merge Queue Visualizer    |
                                +-----------------------------------+
```

### Key Principles:
1. **Root Main Workspace Isolation**: The root `main` workspace remains pinned, clean, and pristine. No junction swaps or symlink mutations occur on root `.agents/skills/`.
2. **Procedure Responsibility Invariants**: Each workspace has a designated `ProcedureType` (`PLANNING`, `INNER_LOOP_TDD`, `SECURITY_AUDIT`, `RELEASE_GATE`) with scoped active skills and guards mounted into `.workspaces/<task_id>/.agents/skills/`.
3. **Deterministic Sequential Merging**: Workspaces are queued and merged into `main` strictly in dependency order (`task-01` ➔ `task-02` ➔ `task-03`) via atomic fast-forward / rebase after 100% target test verification.
4. **Fault Isolation**: Failing or unverified task branches are rejected and cleanly discarded without polluting `main`.

---

## Feature Inventory

Every feature from the survey and requirements is assigned to a milestone:

| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | `ProcedureWorkspace` & `ProcedureType` contracts | Interface, type definitions, and status enums (`PLANNING`, `INNER_LOOP_TDD`, `SECURITY_AUDIT`, `RELEASE_GATE`) | M1 | ORIGINAL_REQUEST §R1 |
| 2 | `ResponsibilityInvariants` contract | Target test file, owned files, prohibited actions, acceptance criteria | M1 | ORIGINAL_REQUEST §R1 |
| 3 | `validateProcedureWorkspace` & `createProcedureWorkspace` | Runtime schema validation, UUID generation, ISO timestamps, default invariant initializers | M1 | ORIGINAL_REQUEST §R1 |
| 4 | Git Worktree Lifecycle Engine | `spawnProcedureWorkspace` creates `.workspaces/<task_id>` on `worktree/<task_id>` branch | M2 | ORIGINAL_REQUEST §R2 |
| 5 | Procedure Skill & Guard Mounting | Mounts active skills & hooks directly inside worktree without mutating root `main` | M2 | ORIGINAL_REQUEST §R2 |
| 6 | Worktree Pruning & Cleanup | `pruneProcedureWorkspace` removes worktree folder and prunes Git worktree metadata | M2 | ORIGINAL_REQUEST §R2 |
| 7 | Catalog Preset Baseline Fix | Reconcile `paperthin-reflexes` in `catalog.json` to ensure clean baseline test pass | M2 | Survey 2 & 3 |
| 8 | Ordered Merge Queue | Queue sorting workspaces by dependency lineage (`task-01` ➔ `task-02` ➔ `task-03`) | M3 | ORIGINAL_REQUEST §R3 |
| 9 | 1:1 Target Test Verification Gate | Execute `target_test_file` inside worktree with 100% pass requirement before merge | M3 | ORIGINAL_REQUEST §R3 |
| 10 | Responsibility Invariant Enforcement | Check `owned_files` boundaries, prohibited commands, and test storm suppression | M3 | ORIGINAL_REQUEST §R3 |
| 11 | Atomic Fast-Forward / Rebase Merge | `git merge --ff-only` or rebase into `main` after verification passes | M3 | ORIGINAL_REQUEST §R3 |
| 12 | Fault Isolation & Discard | Reject failed branches cleanly without leaving dangling Git worktrees or dirty commits | M3 | ORIGINAL_REQUEST §R3 |
| 13 | CLI Workspace Subcommands | `skills-platform workspace spawn|list|verify|merge|prune` in `src/cli.js` | M4 | ORIGINAL_REQUEST §R4 |
| 14 | REST API Workspace Endpoints | `GET /api/workspaces`, `POST /api/workspaces/spawn`, `verify`, `merge`, `prune` in `server.js` | M4 | ORIGINAL_REQUEST §R4 |
| 15 | Flow Studio Procedure Workspaces View | Interactive visual cards with procedure badges, target tests, active skill roster | M5 | ORIGINAL_REQUEST §R5 |
| 16 | Live Git Merge Queue Timeline | Visual timeline with pending, in-verification, merged stages and fast-forward animation | M5 | ORIGINAL_REQUEST §R5 |
| 17 | UI REST API Client & Inspector Integration | `catalog-api.ts` workspace methods and `NodeDetailInspector.tsx` workspace inspector | M5 | ORIGINAL_REQUEST §R5 |
| 18 | E2E Test Suite (Tiers 1–5) & Verification | Requirement-driven opaque-box E2E test cases, full checks across all workspaces | M6 | ORIGINAL_REQUEST §Acceptance Criteria |

---

## Milestones

| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Contracts & Data Model | `packages/skill-contracts/src/types.ts`, `src/index.ts`, `test/procedure-workspace.test.js` | none | DONE |
| M2 | Git-Native Worktree Manager | `apps/skills-catalog/src/workspace-manager.js`, `test/workspace-manager.test.js`, `catalog.json` fix | M1 | DONE |
| M3 | Sequential Merge Orchestrator | `apps/skills-catalog/src/sequential-merger.js`, `test/sequential-merger.test.js` | M1, M2 | DONE |
| M4 | CLI & REST API Integration | `apps/skills-catalog/src/cli.js`, `src/server.js`, `src/index.js`, `test/workspace-cli-server.test.js` | M1, M2, M3 | DONE |
| M5 | Flow Studio Visualizer | `apps/catalog-ui/src/components/flow/`, `src/api/catalog-api.ts`, `test/procedure-workspaces.test.js` | M1, M4 | PLANNED |
| M6 | E2E Testing & Full Verification | `tests/e2e/`, `npm run check`, `npm test`, `node tests/e2e/run-all.js`, `npm run build` | M1–M5 | PLANNED |

---

## Interface Contracts

### 1. `@skills-platform/contracts` ↔ Downstream Packages

#### `ProcedureType`
```typescript
export type ProcedureType =
  | "PLANNING"
  | "INNER_LOOP_TDD"
  | "SECURITY_AUDIT"
  | "RELEASE_GATE";
```

#### `ProcedureWorkspace`
```typescript
export interface ResponsibilityInvariants {
  target_test_file?: string;
  owned_files: string[];
  prohibited_actions: string[];
  acceptance_criteria: string[];
}

export type ProcedureWorkspaceStatus =
  | "pending"
  | "active"
  | "in_verification"
  | "verified"
  | "merged"
  | "failed"
  | "discarded"
  | "pruned";

export interface ProcedureWorkspace {
  schema_version: number;
  workspace_id: string;
  procedure_type: ProcedureType;
  git_branch: string;
  git_worktree_path: string;
  responsibility_invariants: ResponsibilityInvariants;
  active_skills: string[];
  active_guards: string[];
  status: ProcedureWorkspaceStatus;
  created_at: string;
  completed_at?: string | null;
  metadata?: Record<string, any>;
}
```

#### Validator & Factory
```typescript
export function validateProcedureWorkspace(workspace: unknown): ValidationResult;
export function createProcedureWorkspace(options: CreateProcedureWorkspaceOptions): ProcedureWorkspace;
```

---

### 2. `workspace-manager.js` Contract

```javascript
/**
 * Spawns an isolated Git worktree on a dedicated branch with procedure skills mounted.
 */
async function spawnProcedureWorkspace({
  procedure_type,
  task_id,
  recipe_id,
  preset_id,
  target_test_file,
  owned_files = [],
  prohibited_actions = [],
  acceptance_criteria = [],
  project_path = process.cwd(),
}) -> Promise<ProcedureWorkspace>;

/**
 * Prunes worktree directory and removes Git worktree reference.
 */
async function pruneProcedureWorkspace(workspace_id, { project_path = process.cwd() } = {}) -> Promise<{ pruned: boolean, workspace_id: string }>;

/**
 * Lists all active and historical procedure workspaces.
 */
async function listProcedureWorkspaces({ project_path = process.cwd(), status } = {}) -> Promise<ProcedureWorkspace[]>;

/**
 * Retrieves a single procedure workspace by ID or task ID.
 */
async function getProcedureWorkspace(workspace_id, { project_path = process.cwd() } = {}) -> Promise<ProcedureWorkspace | null>;
```

---

### 3. `sequential-merger.js` Contract

```javascript
/**
 * Enqueues a workspace or executes sequential dependency merge.
 */
class SequentialMerger {
  constructor({ project_path, workspace_manager }) { ... }
  
  enqueue(workspace_id, { dependencies = [] }) -> Promise<{ queue_position: number, status: string }>;
  
  verifyWorkspace(workspace_id) -> Promise<{ verified: boolean, test_output: string, invariant_checks: Record<string, boolean> }>;
  
  mergeNext() -> Promise<{ merged: boolean, workspace_id: string, commit_hash: string }>;
  
  mergeWorkspace(workspace_id) -> Promise<{ merged: boolean, workspace_id: string, commit_hash: string }>;
  
  discardWorkspace(workspace_id, reason) -> Promise<{ discarded: boolean, workspace_id: string }>;
  
  getQueueStatus() -> Promise<{ queue: Array<{ workspace_id: string, dependencies: string[], status: string }> }>;
}
```

---

### 4. REST API Contract (`apps/skills-catalog/src/server.js`)

- `GET /api/workspaces`: returns `{ workspaces: ProcedureWorkspace[], merge_queue: [...] }`
- `POST /api/workspaces/spawn`: payload `{ procedure_type, task_id, recipe_id, preset_id, target_test_file, owned_files }` ➔ `201 { workspace: ProcedureWorkspace }`
- `POST /api/workspaces/verify`: payload `{ task_id }` or `{ workspace_id }` ➔ `200 { verified: boolean, test_output, invariant_checks }`
- `POST /api/workspaces/merge`: payload `{ task_id }` or `{ workspace_id }` ➔ `200 { merged: boolean, commit_hash, status }`
- `POST /api/workspaces/prune`: payload `{ task_id }` or `{ workspace_id }` ➔ `200 { pruned: boolean, workspace_id }`

---

## Code Layout

```
Skills-Platform/
├── package.json
├── PROJECT.md
├── TEST_INFRA.md
├── packages/
│   ├── skill-contracts/
│   │   ├── src/
│   │   │   ├── types.ts              # ProcedureType, ProcedureWorkspace, ResponsibilityInvariants (M1)
│   │   │   └── index.ts              # validateProcedureWorkspace, createProcedureWorkspace (M1)
│   │   └── test/
│   │       └── procedure-workspace.test.js # Unit test suite for R1 (M1)
│   └── skills-manager-adapter/
├── apps/
│   ├── skills-catalog/
│   │   ├── src/
│   │   │   ├── workspace-manager.js  # Git worktree lifecycle engine (M2)
│   │   │   ├── sequential-merger.js  # Sequential merge queue & fast-forward engine (M3)
│   │   │   ├── cli.js                # CLI workspace commands (M4)
│   │   │   ├── server.js             # REST API /api/workspaces routes (M4)
│   │   │   └── index.js              # Module exports (M4)
│   │   └── test/
│   │       ├── workspace-manager.test.js
│   │       ├── sequential-merger.test.js
│   │       └── workspace-cli-server.test.js
│   └── catalog-ui/
│       ├── src/
│       │   ├── api/
│       │   │   └── catalog-api.ts    # Workspace REST API client methods (M5)
│       │   └── components/
│       │       └── flow/
│       │           ├── flow-types.ts # Procedure workspace UI types (M5)
│       │           ├── FlowStudioCanvas.tsx # View mode registration (M5)
│       │           ├── ProcedureWorkspacesView.tsx # Visual cards & live merge queue (M5)
│       │           └── NodeDetailInspector.tsx # Worktree inspector drawer (M5)
│       └── test/
│           └── procedure-workspaces.test.js # UI unit & visual logic tests (M5)
└── tests/
    └── e2e/                          # 5-Tier E2E verification suite (M6)
        ├── run-all.js
        └── tier1-features/
            ├── f21-workspace-isolation.test.js # R1 & R2 E2E
            └── f22-sequential-merge.test.js    # R3 & R4 E2E
```
