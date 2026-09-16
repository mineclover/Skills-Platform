# Chrome Process Recovery Workflows

Decision trees and step-by-step triage sequences for developers and agents.

---

## Scenario 1: Chrome Dock Icon Clicked, But No Window Appears

### Symptoms
- Chrome is marked as "running" in macOS Dock (dot indicator is present).
- Clicking the Dock icon or running `open -a "Google Chrome"` does nothing.
- No browser window or menu bar appears.

### Cause
A headless Chrome instance (`--headless` or `--headless=new`) is running in the background using the default user profile, intercepting all GUI launch events.

### Step-by-Step Triage
1. **Diagnose**:
   ```bash
   ./scripts/chrome-doctor.sh
   ```
   Confirm `STATUS: HEADLESS_TRAPPED` is reported.
2. **Surgically Purge Headless Instances**:
   ```bash
   ./scripts/chrome-purge-headless.sh
   ```
3. **Re-launch GUI Chrome**:
   ```bash
   open -a "Google Chrome"
   ```
4. **Confirm Normal Operation**:
   Verify the browser window displays on screen.

---

## Scenario 2: Remote Debugging Port 9222 EADDRINUSE

### Symptoms
- Automated tests (Playwright, Puppeteer, Lighthouse, Chrome DevTools Protocol) fail with:
  `Error: listen EADDRINUSE: address already in use :::9222`

### Cause
A previous test run terminated abnormally without tearing down its Chrome child process, leaving port `9222` bound.

### Step-by-Step Triage
1. **Identify the Culprit**:
   ```bash
   lsof -nP -iTCP:9222 -sTCP:LISTEN
   ```
2. **Release the Port**:
   ```bash
   ./scripts/chrome-purge-headless.sh
   ```
   *Note*: This automatically releases port 9222 while preserving any active GUI Chrome sessions.
3. **Re-run Automated Tests**:
   Ensure test suites use `--test-force-exit` or `node-teardown-hook.mjs` (from `deterministic-test-runner`) so future runs cleanly teardown.

---

## Scenario 3: High CPU from Orphaned Google Chrome Helpers

### Symptoms
- macOS Activity Monitor reports `Google Chrome Helper (Renderer)` or `(GPU)` consuming CPU/memory even when no browser tabs are open.

### Cause
Crash or abnormal termination of the Chrome browser process left child helper processes disconnected from their parent PID (`ppid=1`).

### Step-by-Step Triage
1. **Inspect Helpers**:
   ```bash
   ./scripts/chrome-doctor.sh
   ```
   Check if `STATUS: ZOMBIE_HELPERS` is reported.
2. **Purge Orphaned Helpers**:
   ```bash
   ./scripts/chrome-purge-headless.sh
   ```
3. **Verify CPU Stabilization**:
   Confirm Chrome Helper processes have terminated.

---

## Scenario 4: Corrupted Profile Lock State

### Symptoms
- Chrome displays a dialog saying "Your profile is in use by another process" or refuses to start even after all Chrome processes have been closed.

### Step-by-Step Triage
1. **Ensure No Active Chrome Instances Exist**:
   ```bash
   ./scripts/chrome-purge-headless.sh --all
   ```
2. **Clear Stale Lockfiles**:
   ```bash
   ./scripts/chrome-reset-locks.sh
   ```
3. **Launch Chrome**:
   ```bash
   open -a "Google Chrome"
   ```
