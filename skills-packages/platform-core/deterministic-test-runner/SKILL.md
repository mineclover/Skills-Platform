---
name: deterministic-test-runner
description: >-
  Execute unit and integration test runners with guaranteed termination and active handle teardown.
  Use when running node --test, server/API tests, socket tests, or diagnosing hanging test processes
  and orphaned background tasks.
hooks:
  - id: deterministic-test-guard
    name: Deterministic Test Execution Guard
    event: on_test_run
    description: Ensures test runner commands include deterministic exit signals, force-exit flags, or preload teardown hooks to prevent dangling background processes.
    enabled: true
    matcher: "test|run_command"
    handler:
      type: script
      target: scripts/test-execution-guard.js
      timeout_ms: 2000
    priority: 40
    providers:
      - antigravity
      - claude
      - codex
    failure_policy: open
---

# Deterministic Test Runner & Lifecycle Guard

Guarantees clean, zero-latency process termination for Node.js unit and integration tests, preventing unclosed network sockets (HTTP/TCP), active timers, or open servers from hanging the test runner into background zombie tasks.

---

## 1. Safe Test Execution Directives

When invoking test suites, always use deterministic termination mechanisms:

### 1.1 Node.js Native Test Runner (`node:test`)
Never run raw `node --test <file>` without forced teardown or lifecycle hooks.

- **Option A (Recommended for Node 22+)**: Append `--test-force-exit`
  ```bash
  node --test --test-force-exit path/to/file.test.mjs
  ```
- **Option B (Preload Lifecycle Teardown Hook)**: Preload the platform's teardown hook
  ```bash
  node --import ./scripts/node-teardown-hook.mjs --test path/to/file.test.mjs
  ```
- **Option C (Hard Timeout Wrapper)**:
  ```bash
  timeout 30s node --test --test-force-exit path/to/file.test.mjs
  ```

### 1.2 Jest & Vitest
- **Jest**: Always append `--forceExit --detectOpenHandles`:
  ```bash
  npx jest --forceExit --detectOpenHandles path/to/file.test.js
  ```
- **Vitest**: Use `--teardownTimeout 5000`:
  ```bash
  npx vitest run --teardownTimeout 5000 path/to/file.test.js
  ```

---

## 2. Diagnosing & Recovering from Hanging Background Tasks

If a test was executed without force-exit flags and transitioned into a background task (`task-XXX`):

1. **Inspect Task Log**:
   ```bash
   # Check if assertions finished
   manage_task status <task-id>
   ```
   If the log shows test assertions have passed (e.g., `✔ pass 1`, `ℹ tests 1`), but the task remains in `RUNNING` status, the test logic is complete and libuv handles are keeping the event loop alive.

2. **Terminate the Lingering Task**:
   Immediately cancel the background task:
   ```bash
   manage_task kill <task-id>
   ```

3. **Verify Port Clearance**:
   If the test bound to a port (e.g. Generator `49494` or HTTP `3000`), ensure the port was released:
   ```bash
   lsof -ti :49494
   # If PID is returned, clean it:
   kill -9 $(lsof -ti :49494)
   ```

---

## 3. Companion Hook: `deterministic-test-guard`

This skill bundles an Antigravity Protojson-compliant `PreToolUse` companion hook:
- **Interception**: Triggers on `on_test_run` / `run_command`.
- **Enforcement**: If a command invokes `node --test` without `--test-force-exit`, a preload teardown hook, or a timeout wrapper, the guard emits a self-correcting denial (`decision: "deny"`) to prompt the agent to append the required flag.
- **Specification Details**: See [references/node-test-lifecycle.md](references/node-test-lifecycle.md).

---

## 4. Teardown Best Practices in Test Code

To fix hanging tests at the source rather than relying solely on process termination, see [references/teardown-patterns.md](references/teardown-patterns.md) for patterns including `server.closeAllConnections()`, `socket.destroy()`, and `timer.unref()`.
