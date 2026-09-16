#!/usr/bin/env bash
# ==============================================================================
# chrome-purge-headless.sh - Surgically Purge Stuck Headless Chrome & Port 9222
# ==============================================================================
set -eo pipefail

DRY_RUN=0
KILL_ALL=0

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --all) KILL_ALL=1 ;;
    -h|--help)
      echo "Usage: $0 [--dry-run] [--all]"
      echo "  --dry-run : Print target processes without terminating them"
      echo "  --all     : Terminate ALL Chrome instances (including normal GUI Chrome)"
      exit 0
      ;;
  esac
done

echo "================================================================="
echo "🧹 Chrome Instance Purge & Release Tool"
[ $DRY_RUN -eq 1 ] && echo "   Mode: DRY RUN (No processes will be killed)"
[ $KILL_ALL -eq 1 ] && echo "   Mode: FULL PURGE (All Chrome instances will be killed)"
echo "================================================================="

TARGET_PIDS=()
REASONS=()

# 1. Identify Headless Chrome Main Processes
while IFS= read -r line; do
  [ -z "$line" ] && continue
  pid=$(echo "$line" | awk '{print $2}')
  cmd=$(echo "$line" | awk '{$1=$2=$3=$4=$5=$6=$7=$8=$9=$10=""; print $0}' | sed 's/^[ \t]*//')

  if [[ "$cmd" == *"/Google Chrome.app/Contents/MacOS/Google Chrome"* ]]; then
    if [[ "$cmd" == *"--headless"* ]] || [ $KILL_ALL -eq 1 ]; then
      TARGET_PIDS+=("$pid")
      if [[ "$cmd" == *"--headless"* ]]; then
        REASONS+=("Headless Chrome Main Process")
      else
        REASONS+=("GUI Chrome Main Process (--all flag)")
      fi
    fi
  fi
done < <(ps aux | grep -iE "[G]oogle Chrome" || true)

# 2. Check Port 9222 Contention
if command -v lsof >/dev/null 2>&1; then
  while IFS= read -r port_line; do
    [ -z "$port_line" ] && continue
    pid=$(echo "$port_line" | awk '{print $2}')
    [[ "$pid" =~ ^[0-9]+$ ]] || continue
    if [[ ! " ${TARGET_PIDS[*]} " =~ " ${pid} " ]]; then
      TARGET_PIDS+=("$pid")
      REASONS+=("Holding Port 9222")
    fi
  done < <(lsof -nP -iTCP:9222 -sTCP:LISTEN 2>/dev/null || true)
fi

# 3. Check for Orphaned Helpers (if no GUI Chrome is running or KILL_ALL=1)
GUI_EXISTS=$(ps aux | grep -iE "[G]oogle Chrome.app/Contents/MacOS/Google Chrome" | grep -v "grep" | grep -v "\-\-headless" || true)
if [ -z "$GUI_EXISTS" ] || [ $KILL_ALL -eq 1 ]; then
  while IFS= read -r helper_line; do
    [ -z "$helper_line" ] && continue
    pid=$(echo "$helper_line" | awk '{print $2}')
    if [[ ! " ${TARGET_PIDS[*]} " =~ " ${pid} " ]]; then
      TARGET_PIDS+=("$pid")
      REASONS+=("Orphaned Chrome Helper")
    fi
  done < <(ps aux | grep -iE "[G]oogle Chrome Helper" | grep -v "grep" || true)
fi

# 4. Execute Termination
if [ ${#TARGET_PIDS[@]} -eq 0 ]; then
  echo "✅ No target headless or conflicting Chrome processes found. Nothing to do."
  exit 0
fi

echo "Identified ${#TARGET_PIDS[@]} target process(es):"
for i in "${!TARGET_PIDS[@]}"; do
  echo "  - PID ${TARGET_PIDS[$i]}: ${REASONS[$i]}"
done

if [ $DRY_RUN -eq 1 ]; then
  echo "Dry run complete. No processes were modified."
  exit 0
fi

echo ""
echo "Terminating target processes (SIGTERM)..."
for pid in "${TARGET_PIDS[@]}"; do
  if kill -0 "$pid" 2>/dev/null; then
    kill "$pid" 2>/dev/null || true
  fi
done

# Wait up to 3 seconds for graceful exit
sleep 1
STILL_RUNNING=()
for pid in "${TARGET_PIDS[@]}"; do
  if kill -0 "$pid" 2>/dev/null; then
    STILL_RUNNING+=("$pid")
  fi
done

if [ ${#STILL_RUNNING[@]} -gt 0 ]; then
  echo "Forcefully terminating unresponsive processes (SIGKILL)..."
  for pid in "${STILL_RUNNING[@]}"; do
    kill -9 "$pid" 2>/dev/null || true
  done
  sleep 0.5
fi

# 5. Verification
REMAINING_HEADLESS=$(ps aux | grep -iE "[G]oogle Chrome.*--headless" | grep -v "grep" || true)
PORT_REMAINING=$(lsof -nP -iTCP:9222 -sTCP:LISTEN 2>/dev/null || true)

echo "================================================================="
if [ -z "$REMAINING_HEADLESS" ] && [ -z "$PORT_REMAINING" ]; then
  echo "🎉 Headless Chrome processes successfully purged!"
  echo "   - Port 9222 is free."
  echo "   - Normal GUI Chrome can now be launched freely: open -a \"Google Chrome\""
  exit 0
else
  echo "⚠️ Warning: Some processes or ports may still be held:"
  [ -n "$REMAINING_HEADLESS" ] && echo "  - Headless processes: $REMAINING_HEADLESS"
  [ -n "$PORT_REMAINING" ] && echo "  - Port 9222: $PORT_REMAINING"
  exit 1
fi
