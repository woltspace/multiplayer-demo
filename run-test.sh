#!/bin/sh
# The show app in lodge mode against the throwaway lodge (lodge/start.sh). Mock mode instead: SHOW_MODE=mock uv run app.py
# SHOW_TEST_LODGE: the throwaway lodge folder (default ./lodge), SHOW_TEST_PORT: its port (default 47996).
cd "$(dirname "$0")"
[ -f .env ] && { set -a; . ./.env; set +a; }  # local settings, see README
L="${SHOW_TEST_LODGE:-$PWD/lodge}"
export SHOW_MODE=lodge SHOW_LODGE="http://127.0.0.1:${SHOW_TEST_PORT:-47996}" WOLTSPACE_WOLTS_DIR="$L/wolts" \
  SHOW_LIVE="$L/wolts/commie/wolt/site/show" SHOW_REPLY_CMD="$PWD/bin/show-reply" SHOW_HOST_PLAYER="${SHOW_HOST_PLAYER:-tester (commie)}" SHOW_HARNESS=claude SHOW_MODEL=sonnet
exec uv run app.py
