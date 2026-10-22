#!/bin/sh
# The app in lodge mode against the lodge it runs in (the show container: this app at <wolts>/apps/lodge-show,
# the lodge on :7777). The test setup on a Mac uses run-test.sh against the throwaway lodge instead.
cd "$(dirname "$0")"
[ -f .env ] && { set -a; . ./.env; set +a; }  # local settings, see README
W="${WOLTSPACE_WOLTS_DIR:-$(cd ../.. && pwd)}"
export SHOW_MODE=lodge SHOW_LODGE="${SHOW_LODGE:-http://127.0.0.1:7777}" WOLTSPACE_WOLTS_DIR="$W" \
  SHOW_LIVE="${SHOW_LIVE:-$W/${SHOW_HOST_WOLT:-hostie}/wolt/site/show}" SHOW_REPLY_CMD="$PWD/bin/show-reply" \
  SHOW_HOST_PLAYER="${SHOW_HOST_PLAYER:-jerpint}" SHOW_HARNESS="${SHOW_HARNESS:-claude}" SHOW_MODEL="${SHOW_MODEL:-sonnet}"
exec uv run app.py
