# Teardown Patterns for Node.js Network & Server Tests

To prevent active handles from keeping the event loop alive, use the following teardown patterns in integration tests.

---

## 1. HTTP / Express / Fastify Servers

### Problem
Calling `server.close()` only stops accepting new connections; existing keep-alive connections will keep the server alive indefinitely.

### Solution: `server.closeAllConnections()` (Node.js 18.2+)
```javascript
import { test, after } from 'node:test';
import http from 'node:http';

const server = http.createServer((req, res) => res.end('ok')).listen(0);

after(async () => {
  if (typeof server.closeAllConnections === 'function') {
    server.closeAllConnections();
  }
  await new Promise((resolve) => server.close(resolve));
});
```

---

## 2. TCP & Generator Sockets (Port 49494)

### Problem
Photoshop Generator TCP sockets or local proxy sockets remain connected after the test finishes.

### Solution: Forceful `socket.destroy()`
```javascript
import { after } from 'node:test';

after(() => {
  if (socket && !socket.destroyed) {
    socket.destroy();
  }
  if (server) {
    server.close();
  }
});
```

---

## 3. WebSocket Servers (`ws`)

### Problem
Open WebSocket connections do not close automatically when the server calls `.close()`.

### Solution: Terminate Client Connections
```javascript
import { after } from 'node:test';

after(() => {
  for (const client of wss.clients) {
    client.terminate();
  }
  wss.close();
});
```

---

## 4. Polling Timers (`setInterval` / `setTimeout`)

### Problem
Background heartbeat or pollers hold the event loop open.

### Solution: `.unref()`
```javascript
const heartbeat = setInterval(() => {
  ping();
}, 1000);

// Allow Node.js process to exit naturally even if this timer is active
heartbeat.unref();
```
