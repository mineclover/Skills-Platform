#!/usr/bin/env bash
# ==============================================================================
# chrome-doctor.sh - Chrome Process & Headless State Diagnostic Inspector
# ==============================================================================
set -eo pipefail

CHROME_USER_DATA="${HOME}/Library/Application Support/Google/Chrome"
CHROME_HEADLESS_DATA="${HOME}/Library/Application Support/Google/Chrome-headless"

echo "================================================================="
echo "🔍 Chrome Instance & Environment Doctor"
echo "================================================================="

# 1. Inspect Main Chrome Processes
GUI_PIDS=()
HEADLESS_PIDS=()
HELPER_COUNT=0

while IFS= read -r line; do
  [ -z "$line" ] && continue
  pid=$(echo "$line" | awk '{print $2}')
  cmd=$(echo "$line" | awk '{$1=$2=$3=$4=$5=$6=$7=$8=$9=$10=""; print $0}' | sed 's/^[ \t]*//')

  # Check if it's main Chrome (not a helper or crashpad)
  if [[ "$cmd" == *"/Google Chrome.app/Contents/MacOS/Google Chrome"* ]]; then
    if [[ "$cmd" == *"--headless"* ]]; then
      HEADLESS_PIDS+=("$pid")
    else
      GUI_PIDS+=("$pid")
    fi
  elif [[ "$cmd" == *"Google Chrome Helper"* ]]; then
    HELPER_COUNT=$((HELPER_COUNT + 1))
  fi
done < <(ps aux | grep -iE "[G]oogle Chrome" || true)

echo "1. Process Inventory:"
echo "   - Normal GUI Chrome PIDs : ${GUI_PIDS[*]:-(None)}"
echo "   - Headless Chrome PIDs   : ${HEADLESS_PIDS[*]:-(None)}"
echo "   - Chrome Helper Processes: ${HELPER_COUNT}"

# 2. Inspect DevTools / Debugging Ports (9222, 9229, etc.)
DEBUG_PIDS=()
if command -v lsof >/dev/null 2>&1; then
  while IFS= read -r port_line; do
    [ -z "$port_line" ] && continue
    pid=$(echo "$port_line" | awk '{print $2}')
    [[ "$pid" =~ ^[0-9]+$ ]] || continue
    name=$(echo "$port_line" | awk '{print $1}')
    port=$(echo "$port_line" | awk '{print $9}')
    DEBUG_PIDS+=("${name}(PID:${pid}, ${port})")
  done < <(lsof -nP -iTCP:9222 -sTCP:LISTEN 2>/dev/null || true)
fi

echo "2. Remote Debugging Port (9222):"
if [ ${#DEBUG_PIDS[@]} -gt 0 ]; then
  echo "   ⚠️ Port 9222 is in use: ${DEBUG_PIDS[*]}"
else
  echo "   ✅ Port 9222 is free."
fi

# 3. Inspect Stale Profile Locks
echo "3. Profile Lockfiles Status:"
LOCKS_FOUND=0
for lockfile in "SingletonLock" "SingletonSocket" "SingletonCookie" "DevToolsActivePort"; do
  if [ -e "${CHROME_USER_DATA}/${lockfile}" ]; then
    LOCKS_FOUND=$((LOCKS_FOUND + 1))
    echo "   - Found ${lockfile} in Default profile"
  fi
done
if [ -d "${CHROME_HEADLESS_DATA}" ]; then
  echo "   - Found Chrome-headless profile directory at: ${CHROME_HEADLESS_DATA}"
fi
if [ $LOCKS_FOUND -eq 0 ]; then
  echo "   ✅ No lock files in default profile."
fi

# 4. Inspect Launchd Agents & Persistence
echo "4. Persistence & Daemon Check:"
LAUNCHD_CHROME=$(launchctl list 2>/dev/null | grep -iE "google.*chrome|chromium" || true)
if [ -n "${LAUNCHD_CHROME}" ]; then
  echo "   ⚠️ Launchd agents detected:"
  echo "${LAUNCHD_CHROME}" | awk '{print "     - " $0}'
else
  echo "   ✅ No persistent Chrome launchd jobs detected."
fi

# 5. Summary & Health Status
echo "================================================================="
if [ ${#HEADLESS_PIDS[@]} -gt 0 ]; then
  echo "🚨 STATUS: HEADLESS_TRAPPED"
  echo "   Warning: Headless Chrome instance (${HEADLESS_PIDS[*]}) is running in background!"
  echo "   On macOS, this prevents normal GUI Chrome from opening windows."
  echo "   Action: Run './scripts/chrome-purge-headless.sh' to release the GUI lock."
  exit 2
elif [ ${#GUI_PIDS[@]} -eq 0 ] && [ $HELPER_COUNT -gt 0 ]; then
  echo "⚠️ STATUS: ZOMBIE_HELPERS"
  echo "   Warning: ${HELPER_COUNT} Chrome Helper processes are running without a main browser."
  echo "   Action: Run './scripts/chrome-purge-headless.sh' to terminate orphaned helpers."
  exit 1
elif [ ${#GUI_PIDS[@]} -gt 0 ]; then
  echo "✅ STATUS: HEALTHY_GUI"
  echo "   Main GUI Chrome is running normally (PID: ${GUI_PIDS[*]})."
  exit 0
else
  echo "💤 STATUS: CLEAN_INACTIVE"
  echo "   No Chrome instances are running. System is clean."
  exit 0
fi
