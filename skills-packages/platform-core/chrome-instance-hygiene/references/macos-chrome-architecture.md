# macOS Google Chrome Architecture & The Headless Trap

## 1. Single-Instance Process Architecture on macOS

On macOS, Google Chrome enforces a strict **single-instance per user-data-directory** model:

```text
[ User clicks Chrome Dock icon / open -a "Google Chrome" ]
                         │
                         ▼
             [ Launch New Executable ]
                         │
                         ▼
        [ Check SingletonLock & Mach IPC ]
                         │
          ┌──────────────┴──────────────┐
          ▼                             ▼
   [ No Instance Active ]      [ Existing Instance Found ]
   • Acquire SingletonLock     • Forward command line via Mach IPC
   • Spawn GUI Window          • New process exits immediately (PID dies)
                               • Existing instance handles request
```

If an existing instance is found, the newly launched Chrome command simply sends an IPC message to the running instance and terminates itself immediately.

---

## 2. The "Headless Trap" Failure Mode

When an automated test runner, script, or crawler executes:
```bash
/Applications/Google Chrome.app/Contents/MacOS/Google Chrome \
  --headless=new \
  --remote-debugging-port=9222 \
  --disable-gpu \
  examples/consumer-app/index.html
```

Without an explicit, isolated `--user-data-dir`, the following happens:
1. **Default Profile Capture**: The headless process locks `~/Library/Application Support/Google/Chrome/SingletonLock`.
2. **Mach Rendezvous Registration**: The headless process becomes the primary recipient for all Chrome OS launch events.
3. **Headless Window Suppression**: Because the process was initialized in headless mode, it suppresses all graphical window creation.
4. **GUI Lockout**: When the user clicks the Chrome icon in the Dock or runs `open -a "Google Chrome"`, the launch request is routed to the background headless process, which acknowledges the request but renders nothing on screen. To the user, Chrome appears completely broken and unopenable.
5. **Port Contention**: The orphaned headless process holds `--remote-debugging-port=9222`, causing subsequent test suites to crash with `EADDRINUSE`.

---

## 3. Profile Lock & Socket Files

Under `~/Library/Application Support/Google/Chrome/`:
- **`SingletonLock`**: Symlink pointing to `<hostname>-<PID>`. Used to detect running instances.
- **`SingletonSocket`**: Domain socket used for inter-process communication between Chrome invocations.
- **`SingletonCookie`**: Cryptographic cookie verifying communication with the primary instance.
- **`DevToolsActivePort`**: Contains the active DevTools port and browser target WebSocket UUID.

If the process crashes abruptly (e.g. SIGKILL without teardown), these files can remain stale on disk, causing startup warnings.

---

## 4. Prevention: Safe Automation Rules

To prevent headless instances from capturing the user's GUI session during development or automated tests:

1. **Always Use Isolated User Data Directories**:
   ```bash
   CHROME_TEMP_DIR=$(mktemp -d -t chrome-test-XXXXXX)
   google-chrome --headless=new --user-data-dir="${CHROME_TEMP_DIR}" ...
   ```
2. **Always Register Teardown Handlers**:
   Ensure test frameworks (Node `--test`, Vitest, Jest, Playwright) kill the spawned browser child process tree in `after()` or `process.on('exit')`.
3. **Use Ephemeral Remote Debugging Ports**:
   Specify `--remote-debugging-port=0` to let Chrome allocate a free dynamic port, or query `DevToolsActivePort` to discover the assigned port.
