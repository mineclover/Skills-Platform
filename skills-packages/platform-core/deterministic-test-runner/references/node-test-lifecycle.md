# Node.js Test Lifecycle & Active Handle Diagnostics

## 1. The Hanging Event Loop Problem

Node.js does not exit while there are active event loop handles registered with libuv. In tests that spin up mock servers, socket connections, or timers, the runner will wait indefinitely if any of these resources remain open, even after all test assertions have passed.

```text
[ Test Assertions Pass ] ──➔ [ All Tests Reported OK ]
                                       │
                                       ▼
                     [ Active Libuv Handles Remain? ]
                                ├── YES ──➔ Event loop stays alive (Process Hangs)
                                └── NO  ──➔ Clean exit (0ms)
```

Common culprits in integration and API tests (e.g. `psd-sync-server-api.test.mjs`):
1. **Unclosed Servers**: `http.createServer().listen(...)` or `net.createServer().listen(...)` without `server.close()`.
2. **Lingering Keep-Alive Sockets**: Even after `server.close()`, open client HTTP/TCP connections prevent socket teardown unless `server.closeAllConnections()` or `socket.destroy()` is called.
3. **Active Timers**: `setInterval(...)` or `setTimeout(...)` without `clearInterval()` or `.unref()`.
4. **Generator TCP Connections**: Photoshop Generator socket connections (`port 49494`) remaining in an open state.

---

## 2. Deterministic Teardown Mechanisms

### 2.1 Native Engine Flag: `--test-force-exit` (Node 22+)
Forces the Node.js test runner process to exit immediately once all subtests and root suites complete, terminating the event loop regardless of dangling handles:
```bash
node --test --test-force-exit path/to/file.test.mjs
```

### 2.2 Preload Lifecycle Hook: `node-teardown-hook.mjs`
For maximum portability and active resource cleanup, the preload hook registers a global `after()` teardown handler using `node:test`:
```bash
node --import /path/to/node-teardown-hook.mjs --test path/to/file.test.mjs
```

How `node-teardown-hook.mjs` works:
```javascript
import { after } from 'node:test';

after(() => {
  // 1. Inspect all libuv active handles
  const handles = process._getActiveHandles?.() || [];
  for (const h of handles) {
    if (typeof h.closeAllConnections === 'function') h.closeAllConnections();
    if (typeof h.close === 'function') h.close();
    if (typeof h.destroy === 'function') h.destroy();
    if (typeof h.unref === 'function') h.unref();
  }

  // 2. Emit IPC signal if supervised
  if (process.send) {
    process.send({ type: 'TEST_LIFECYCLE_COMPLETED', exitCode: process.exitCode || 0 });
  }

  // 3. Failsafe zero-latency exit
  setTimeout(() => process.exit(process.exitCode || 0), 30).unref();
});
```

---

## 3. Detecting & Resolving Hanging Processes in Agent Sessions

If an agent or command previously launched a test without force-exit flags:
1. **Inspect Background Tasks**:
   ```bash
   # Check if a background command is running
   manage_task status <task-id>
   ```
2. **Check Port Bindings**:
   ```bash
   lsof -ti :49494 -ti :3000
   ```
3. **Kill Orphan Task**:
   ```bash
   manage_task kill <task-id>
   # or via PID:
   kill -9 $(lsof -ti :<port>)
   ```
