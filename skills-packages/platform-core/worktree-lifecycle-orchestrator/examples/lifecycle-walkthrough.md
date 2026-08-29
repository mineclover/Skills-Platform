# End-to-End Lifecycle Walkthrough Example

Example workflow fixing an authentication bug (`topic:auth/jwt_cache_drift`).

## Phase 1: Planning
```bash
# 1. Initialize Vertical Spec
skills-platform spec init --id topic:auth/jwt_cache_drift --name "JWT Cache Fix" --test packages/auth/test/jwt.test.js --out VERTICAL_SPEC.json
```

## Phase 2: Worktree Spawn & Scoped TDD
```bash
# 2. Spawn isolated worktree
skills-platform workspace spawn \
  --procedure INNER_LOOP_TDD \
  --task task-01-jwt-fix \
  --test packages/auth/test/jwt.test.js \
  --owned packages/auth/src/jwt.js

# 3. Inside .workspaces/task-01-jwt-fix/, edit code and run single test
node --test packages/auth/test/jwt.test.js

# 4. Commit as Done
git add . && git commit -m "feat(auth): fix JWT signature cache drift [task-01-jwt-fix]"
```

## Phase 3: Verify, Merge & Prune
```bash
# 5. Verify & Merge into main
skills-platform workspace verify --task task-01-jwt-fix
skills-platform workspace merge --task task-01-jwt-fix

# 6. Cleanup Worktree
skills-platform workspace prune --task task-01-jwt-fix
```
