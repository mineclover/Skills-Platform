---
name: worktree-lifecycle-orchestrator
description: Coordinate the procedure-responsible Git worktree lifecycle (Plan ➔ Spawn ➔ Scoped TDD ➔ Commit-as-Done ➔ Verify ➔ Sequential Fast-Forward Merge ➔ Prune) for Antigravity agents. Use when spawning isolated task worktrees, enforcing scoped TDD, managing merge queues, or preventing main branch pollution.
---

# Worktree Lifecycle Orchestrator (Antigravity Native)

Autonomous procedure-responsible workflow driver for zero-collision task isolation and ordered Git merging.

## 🔄 Canonical 6-Step Lifecycle Machine

```text
[ 1. Plan ] ──➔ [ 2. Spawn Worktree ] ──➔ [ 3. Scoped TDD ] ──➔ [ 4. Commit as Done ] ──➔ [ 5. Verify & Merge ] ──➔ [ 6. Prune ]
(task-queue)    (.workspaces/<task_id>)   (1:1 Target Test Only) (feat(...): ... [id])    (Fast-Forward Merge)      (Zero-Disk Cleanup)
```

## 🛠️ Step-by-Step Runbook

### Step 1: Spawn Isolated Procedure Workspace
Spawn a dedicated Git worktree on an isolated branch with procedure-specific active skills:
```bash
skills-platform workspace spawn \
  --procedure INNER_LOOP_TDD \
  --task <task_id> \
  --test <path_to_single_test_file> \
  --owned <owned_directory_or_file>
```
*Note: Leaves root `main` 100% pinned and pristine. Work occurs only in `.workspaces/<task_id>`.*

### Step 2: Perform Scoped Inner-Loop TDD
Inside the worktree (`.workspaces/<task_id>`), iterate exclusively on the pinned target test:
- Run only the assigned target test: `node --test <path_to_single_test_file>`
- **STRICT PROHIBITION**: Full regression sweeps (`npm test`, `pytest`) are intercepted and blocked by `test-storm-guard`.
- Mutate only files within the declared `--owned` scope.

### Step 3: Atomic Commit as "Definition of Done"
When all assertions pass 100%, create an atomic Git commit inside the worktree:
```bash
git add . && git commit -m "feat(<scope>): <summary> [<task_id>]"
```
*The creation of this commit officially transitions the workspace status to ready-for-verification.*

### Step 4: Verify Responsibility Invariants
Validate that the commit adheres to all boundaries and passes target tests:
```bash
skills-platform workspace verify --task <task_id>
```

### Step 5: Sequential Dependency Merge
Enqueue and merge the verified branch into `main` in strict dependency order:
```bash
skills-platform workspace merge --task <task_id>
```

### Step 6: Prune Worktree & Resource Cleanup
Cleanly remove the temporary worktree and prune Git metadata:
```bash
skills-platform workspace prune --task <task_id>
```

---

## 📚 Deep Documentation & Sub-references

For detailed CLI flags, invariant audits, and full end-to-end walkthroughs, read the sub-references:
- **CLI Commands & REST APIs**: [references/workspace-commands.md](./references/workspace-commands.md)
- **Responsibility Invariants & Gates**: [references/lifecycle-invariants.md](./references/lifecycle-invariants.md)
- **Concrete Lifecycle Walkthrough**: [examples/lifecycle-walkthrough.md](./examples/lifecycle-walkthrough.md)
