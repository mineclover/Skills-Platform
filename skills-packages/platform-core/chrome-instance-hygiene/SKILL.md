---
name: chrome-instance-hygiene
description: >-
  Diagnose, recover, and clean up Google Chrome process state on macOS. Use when Chrome
  is trapped in headless mode, GUI windows fail to open, port 9222 is locked, or
  orphaned Chrome Helper processes linger after test runs.
---

# Chrome Instance & Process Hygiene

Diagnose and remediate Chrome headless state traps, locked remote debugging ports (9222), orphaned helper processes, and corrupted profile lockfiles on macOS.

---

## 1. Quick Triage & Recovery Sequence

When a user reports that Chrome fails to open a GUI window or automated tests fail with port 9222 contention, follow this 3-step sequence:

### Step 1: Run Environment Doctor
Inspect active Chrome instances, port 9222, and lockfiles:
```bash
./scripts/chrome-doctor.sh
```
- **`STATUS: HEADLESS_TRAPPED`**: A background headless Chrome instance has captured the default profile. Proceed to Step 2.
- **`STATUS: HEALTHY_GUI`**: Normal GUI Chrome is active. Do not terminate unless requested.
- **`STATUS: ZOMBIE_HELPERS`**: Orphaned helper processes are running without a main browser. Proceed to Step 2.

### Step 2: Surgically Purge Headless Instances
Terminate only the headless Chrome instances and release port 9222, leaving active GUI Chrome untouched:
```bash
./scripts/chrome-purge-headless.sh
```
To preview actions before killing:
```bash
./scripts/chrome-purge-headless.sh --dry-run
```
To force a complete reset of all Chrome processes (including GUI):
```bash
./scripts/chrome-purge-headless.sh --all
```

### Step 3: Reset Profile Locks (If Corrupted)
If Chrome still reports "Profile in use by another process":
```bash
./scripts/chrome-reset-locks.sh
```

### Step 4: Verify GUI Restoration
Launch normal GUI Chrome:
```bash
open -a "Google Chrome"
```

---

## 2. Common Scenarios & Decision Trees

For detailed step-by-step diagnostic workflows by scenario:
- **Chrome Dock icon clicked, but no window appears**: See [references/recovery-workflows.md](references/recovery-workflows.md#scenario-1-chrome-dock-icon-clicked-but-no-window-appears).
- **Port 9222 EADDRINUSE during Playwright/Puppeteer/Lighthouse tests**: See [references/recovery-workflows.md](references/recovery-workflows.md#scenario-2-remote-debugging-port-9222-eaddrinuse).
- **High CPU from orphaned Chrome Helper processes**: See [references/recovery-workflows.md](references/recovery-workflows.md#scenario-3-high-cpu-from-orphaned-google-chrome-helpers).
- **Profile lock corruption**: See [references/recovery-workflows.md](references/recovery-workflows.md#scenario-4-corrupted-profile-lock-state).

---

## 3. Architecture & Prevention

To understand how macOS single-instance delegation causes the headless trap and how to prevent it in automated tests using isolated user-data directories, read [references/macos-chrome-architecture.md](references/macos-chrome-architecture.md).
