#!/usr/bin/env bash
# ==============================================================================
# chrome-reset-locks.sh - Clear Stale Chrome Singleton & DevTools Lockfiles
# ==============================================================================
set -eo pipefail

CHROME_USER_DATA="${HOME}/Library/Application Support/Google/Chrome"
CHROME_HEADLESS_DATA="${HOME}/Library/Application Support/Google/Chrome-headless"
FORCE=0

for arg in "$@"; do
  case "$arg" in
    --force) FORCE=1 ;;
    -h|--help)
      echo "Usage: $0 [--force]"
      echo "  --force : Remove lockfiles even if Chrome processes appear active"
      exit 0
      ;;
  esac
done

echo "================================================================="
echo "🔒 Chrome Profile Lockfile Reset Tool"
echo "================================================================="

# Safety Check: Is Chrome currently running?
CHROME_RUNNING=$(ps aux | grep -iE "[G]oogle Chrome" || true)
if [ -n "$CHROME_RUNNING" ] && [ $FORCE -eq 0 ]; then
  echo "⚠️ Active Chrome process(es) detected:"
  echo "$CHROME_RUNNING" | awk '{print "   - PID " $2 ": " $11}'
  echo ""
  echo "Refusing to delete lockfiles while Chrome is running to avoid profile corruption."
  echo "Hint: If Chrome is hung, first run './scripts/chrome-purge-headless.sh' (or pass --force)."
  exit 1
fi

REMOVED=0
for lockfile in "SingletonLock" "SingletonSocket" "SingletonCookie" "DevToolsActivePort"; do
  target="${CHROME_USER_DATA}/${lockfile}"
  if [ -e "$target" ] || [ -L "$target" ]; then
    rm -f "$target"
    echo "  - Removed stale: ${lockfile}"
    REMOVED=$((REMOVED + 1))
  fi
done

if [ -d "$CHROME_HEADLESS_DATA" ]; then
  echo "  - Found Chrome-headless data directory."
  for lockfile in "SingletonLock" "SingletonSocket" "SingletonCookie" "DevToolsActivePort"; do
    target="${CHROME_HEADLESS_DATA}/${lockfile}"
    if [ -e "$target" ] || [ -L "$target" ]; then
      rm -f "$target"
      echo "  - Removed stale (headless): ${lockfile}"
      REMOVED=$((REMOVED + 1))
    fi
  done
fi

echo "================================================================="
if [ $REMOVED -gt 0 ]; then
  echo "✅ Removed ${REMOVED} stale lockfile(s). Chrome profile lock state reset."
else
  echo "✅ No stale lockfiles found. Chrome profile is clean."
fi
