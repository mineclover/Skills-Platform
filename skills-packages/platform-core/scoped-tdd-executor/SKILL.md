---
name: scoped-tdd-executor
description: Execute pinpoint unit test runner on single test target, preventing full regression scans during inner loops.
hooks:
  - id: test-storm-guard
    name: Test Storm Suppression Guard
    event: on_test_run
    description: Blocks un-scoped full regression suite execution during inner-loop TDD cycles.
    enabled: true
    matcher: "test|run_command"
    handler:
      type: script
      target: scripts/test-storm-guard.js
      timeout_ms: 2000
    priority: 50
    providers:
      - antigravity
      - claude
      - codex
    failure_policy: open
---

# Scoped TDD Executor

Execute pinpoint unit test runner on single test target, preventing full regression scans during inner loops.

## Core Directives

1. **Pinpoint Test Runner**: Always run tests against a single isolated test target (e.g. `node --test apps/foo/test/bar.test.js`).
2. **Test Storm Suppression**: Full repository or package regression sweeps (`npm test`, `pytest`, `cargo test`) are strictly prohibited during inner-loop TDD cycles.
3. **Companion Hooks**:
   - `test-storm-guard`: Automatically intercepts and suppresses un-scoped test commands.
