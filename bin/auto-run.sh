#!/bin/bash
set -euo pipefail

# Generate the daily report and push a short Feishu notification.
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

export PATH="/c/tools/node-v18.20.8-win-x64:$PATH"
export TZ="${TZ:-Asia/Shanghai}"

if [ -f "$PROJECT_ROOT/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$PROJECT_ROOT/.env"
  set +a
fi

export DAILY_SITE_URL="${DAILY_SITE_URL:-http://117.72.58.55/daily/}"

cd "$PROJECT_ROOT/backend"

echo "=== $(date) start daily report ==="
node ../bin/daily-auto-generate.js
GEN_RESULT=$?

if [ "$GEN_RESULT" -eq 0 ]; then
  HOUR=$(date +%H)
  if [ "$HOUR" -ge 9 ] && [ "$HOUR" -lt 10 ]; then
    REPORT_TYPE="morning"
  elif [ "$HOUR" -ge 11 ] && [ "$HOUR" -lt 14 ]; then
    REPORT_TYPE="noon"
  else
    REPORT_TYPE="evening"
  fi

  echo "=== push to Feishu [$REPORT_TYPE] ==="
  node feishu_push.js "$REPORT_TYPE"
else
  echo "=== daily report generation failed, skip push ==="
fi

echo "=== $(date) done ==="
