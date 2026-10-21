#!/bin/sh
# Show day, one command (also after a reboot): the show container, its app, the public/private switch and the tunnel
# alone, then a check that no lodge is answering on this Mac, then the links. Undo: container/show-off.sh.
#
#   container/show-on.sh
#
# Settings: container/.env (gitignored), e.g. SHOW_DATA=/path/to/show-data (the folder up.sh made), or the
# environment. Same names as up.sh: SHOW_NAME, SHOW_LODGE_PORT, SHOW_APP_PORT, SHOW_DATA, SHOW_PUBLIC_HOST.
set -eu
cd "$(dirname "$0")/.."
REPO="$PWD"
[ -f container/.env ] && { set -a; . container/.env; set +a; }
NAME="${SHOW_NAME:-show-lodge}"; PORT="${SHOW_LODGE_PORT:-47991}"; APP_PORT="${SHOW_APP_PORT:-47992}"
DATA="${SHOW_DATA:-$REPO/show-data}"; HOST="${SHOW_PUBLIC_HOST:-multiplayer.woltspace.app}"
LOGS="$DATA/logs"; mkdir -p "$LOGS"
say() { printf '🦝 %s\n' "$*"; }
listening() { nc -z -G 2 127.0.0.1 "$1" >/dev/null 2>&1; }  # a probe, not lsof: lsof misses other users' lodges

# 1. Docker, then the container (it has no auto-restart on purpose: the show only runs when you say so)
if ! docker info >/dev/null 2>&1; then
  say "starting Docker"; open -a Docker
  i=0; until docker info >/dev/null 2>&1; do i=$((i+1)); [ $i -lt 120 ] || { echo "Docker didn't start" >&2; exit 1; }; sleep 1; done
fi
docker ps -a --format '{{.Names}}' | grep -qx "$NAME" || { echo "No container $NAME: make it once with container/up.sh" >&2; exit 1; }
[ "$(docker inspect -f '{{.State.Running}}' "$NAME")" = true ] || { say "starting container $NAME"; docker start "$NAME" >/dev/null; }
i=0; until curl -sf -o /dev/null "http://127.0.0.1:$PORT/"; do i=$((i+1)); [ $i -lt 90 ] || { echo "the show lodge didn't come up" >&2; exit 1; }; sleep 1; done

# 2. The app inside
if ! curl -sf -o /dev/null "http://127.0.0.1:$APP_PORT/"; then
  say "starting the show app"; curl -sf -X POST "http://127.0.0.1:$PORT/apps/lodge-show/start" >/dev/null
  i=0; until curl -sf -o /dev/null "http://127.0.0.1:$APP_PORT/"; do i=$((i+1)); [ $i -lt 90 ] || { echo "the app didn't come up (docker logs $NAME)" >&2; exit 1; }; sleep 1; done
fi

# 3. The public/private switch (backstage's button), on the Mac
if ! listening "${SHOW_SWITCH_PORT:-47993}"; then
  say "starting the public/private switch"
  SHOW_DATA="$DATA" nohup uv run --no-project python container/public.py serve >> "$LOGS/switch.log" 2>&1 &
  i=0; until listening "${SHOW_SWITCH_PORT:-47993}"; do i=$((i+1)); [ $i -lt 30 ] || { echo "the switch didn't start, see $LOGS/switch.log" >&2; exit 1; }; sleep 1; done
fi

# 4. The tunnel, without the lodge
container/tunnel-alone.sh start

# 5. No lodge on this Mac while the show runs (anything in the container can reach this Mac's localhost)
for p in 7777 7778; do
  if listening $p; then say "⚠️  a lodge is answering on port $p: stop it before the show (yours: woltspace stop)"; fi
done
code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "https://$HOST/" || true)
say "https://$HOST/ answers $code (302 = private, your login; 200 = public)"
say "ready ✓
  big screen  https://$HOST/world
  backstage   https://$HOST/admin   (↺ Reset everything, then 🌍 Make public when the room is ready)
  game        https://$HOST/"
