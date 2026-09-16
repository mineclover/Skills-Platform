/**
 * Node.js Test Lifecycle Teardown Hook (ESM Preload Module)
 *
 * Hooked via: node --import <path>/node-teardown-hook.mjs --test <file>
 *
 * Intercepts the completion of all node:test suites, forcefully closes
 * lingering network sockets (HTTP/TCP), cleans dangling timers, emits
 * optional IPC completion signals, and exits cleanly within 50ms.
 */

import { after } from 'node:test';

after(() => {
  // 1. Gather all active handles from libuv event loop
  const handles = (typeof process._getActiveHandles === 'function')
    ? process._getActiveHandles()
    : [];

  for (const handle of handles) {
    if (!handle) continue;

    // HTTP / TCP server instances
    if (typeof handle.closeAllConnections === 'function') {
      try { handle.closeAllConnections(); } catch {}
    }
    if (typeof handle.close === 'function') {
      try { handle.close(); } catch {}
    }

    // TCP Sockets, Streams, Child Processes
    if (typeof handle.destroy === 'function') {
      try { handle.destroy(); } catch {}
    }

    // Timers & Intervals
    if (typeof handle.unref === 'function') {
      try { handle.unref(); } catch {}
    }
  }

  // 2. Emit IPC lifecycle completion signal to parent runner if IPC channel is open
  if (typeof process.send === 'function') {
    try {
      process.send({
        type: 'TEST_LIFECYCLE_COMPLETED',
        exitCode: process.exitCode || 0,
        activeHandlesCleaned: handles.length,
      });
    } catch {}
  }

  // 3. Deterministic failsafe self-termination
  // Allows pending stdout/stderr flushes to drain, then cleanly exits
  const timer = setTimeout(() => {
    process.exit(process.exitCode || 0);
  }, 30);
  if (timer.unref) timer.unref();
});
