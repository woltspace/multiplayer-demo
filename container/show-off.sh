#!/bin/sh
# After the show: private again, container stopped, switch and tunnel off. Then start your lodges again.
#   container/show-off.sh
set -u
cd "$(dirname "$0")/.."
[ -f container/.env ] && { set -a; . container/.env; set +a; }
NAME="${SHOW_NAME:-show-lodge}"
say() { printf '🦝 %s\n' "$*"; }
say "making it private"; uv run --no-project python container/public.py off || say "⚠️  couldn't confirm private: run container/public.py status"
say "stopping container $NAME"; docker stop "$NAME" >/dev/null 2>&1 || true
pid=$(lsof -ti tcp:"${SHOW_SWITCH_PORT:-47993}" -sTCP:LISTEN 2>/dev/null || true)
[ -n "$pid" ] && { kill $pid; say "switch stopped"; }
say "start your lodges again (yours: woltspace start), THEN:"
say "  container/tunnel-alone.sh stop   (the lodge brings its own tunnel back)"
