# Workspace CLI & REST API Reference

Comprehensive manual for `skills-platform workspace` subcommands and backend endpoints.

## 1. CLI Commands

### 1.1 `workspace spawn`
Creates an isolated Git worktree at `.workspaces/<task_id>` on branch `worktree/<task_id>`:
```bash
skills-platform workspace spawn \
  --procedure <PLANNING|INNER_LOOP_TDD|SECURITY_AUDIT|RELEASE_GATE> \
  --task <task_id> \
  --recipe <recipe_path_or_id> \
  --test <target_test_file> \
  --owned <file_or_dir>... \
  --prohibited <action>... \
  --acceptance <criterion>...
```

### 1.2 `workspace list`
Lists all active or historical procedure workspaces:
```bash
skills-platform workspace list [--status <pending|active|verified|merged|pruned>]
```

### 1.3 `workspace verify`
Executes target test and validates that `git diff <base_ref>..HEAD` touches only `--owned` files:
```bash
skills-platform workspace verify --task <task_id>
```

### 1.4 `workspace merge`
Fast-forwards or rebases the verified branch into `main` if all parent dependencies are merged:
```bash
skills-platform workspace merge --task <task_id> [--force]
```

### 1.5 `workspace prune`
Safely removes the worktree folder and deletes the local branch:
```bash
skills-platform workspace prune --task <task_id>
```

---

## 2. REST API Endpoints

- `GET /api/workspaces?project_path=<path>&status=<status>`
- `GET /api/workspaces/queue?project_path=<path>`
- `POST /api/workspaces/spawn` (JSON body matching `CreateProcedureWorkspaceOptions`)
- `POST /api/workspaces/verify` (`{ "task_id": "...", "project_path": "..." }`)
- `POST /api/workspaces/merge` (`{ "task_id": "...", "project_path": "..." }`)
- `POST /api/workspaces/prune` (`{ "task_id": "...", "project_path": "..." }`)
- `POST /api/workspaces/discard` (`{ "task_id": "...", "reason": "..." }`)
