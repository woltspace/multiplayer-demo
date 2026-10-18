#!/bin/sh
# Fresh show test: stop the app + every session in the throwaway lodge, wipe its wolts and the app data, recreate the host.
# Only wipes a folder that lodge/start.sh marked as throwaway.
cd "$(dirname "$0")"
L="${SHOW_TEST_LODGE:-$PWD/lodge}"; LODGE="http://127.0.0.1:${SHOW_TEST_PORT:-47996}"
[ -f "$L/.lodge-show-throwaway" ] || { echo "$L is not a throwaway lodge (no .lodge-show-throwaway), stopping" >&2; exit 1; }
lsof -ti :"${SHOW_PORT:-4060}" | xargs kill 2>/dev/null
for s in $(curl -s "$LODGE/sessions" | python3 -c "import json,sys;[print(x['name']) for x in json.load(sys.stdin) if x.get('status')=='running']"); do
  curl -s -X POST "$LODGE/sessions/$s/stop" >/dev/null && echo "stopped $s"
done
find "$L/wolts" -mindepth 1 -maxdepth 1 ! -name .space -exec rm -rf {} +
rm -f "$L/wolts/.space/logs/iwcl.jsonl"
rm -rf data && mkdir data
export SHOW_LIVE="$L/wolts/commie/wolt/site/show" SHOW_REPLY_CMD="$PWD/bin/show-reply" SHOW_HOST_PLAYER="${SHOW_HOST_PLAYER:-tester (commie)}"
uv run python setup_host.py --lodge "$LODGE" --wolts "$L/wolts"
mkdir -p "$SHOW_LIVE"
