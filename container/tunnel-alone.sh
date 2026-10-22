#!/bin/sh
# Show day: run the lodge's Cloudflare tunnel by itself, so the main lodge (and every other lodge on this Mac) can be
# stopped for the show. A program in the show container can reach anything on this Mac's localhost; with no lodge
# answering there, it can't reach your real wolts.
#
#   container/tunnel-alone.sh start    # before stopping the lodges (two connectors for a moment is fine)
#   container/tunnel-alone.sh status
#   container/tunnel-alone.sh stop     # after the lodges are back (the lodge brings its own tunnel)
#
# The token comes from SHOW_TUNNEL_ENV (default ~/.woltspace/wolts/.env, CLOUDFLARE_TUNNEL_TOKEN=...). It goes to
# cloudflared through a 0600 temp file, never on the command line (ps shows command lines to every user).
set -eu
ENV_FILE="${SHOW_TUNNEL_ENV:-$HOME/.woltspace/wolts/.env}"
RUN="${SHOW_TUNNEL_DIR:-$HOME/.woltspace/show-tunnel}"
PID="$RUN/cloudflared.pid"; LOG="$RUN/cloudflared.log"
alive() { [ -f "$PID" ] && kill -0 "$(cat "$PID")" 2>/dev/null; }

case "${1:-}" in
start)
  if alive; then echo "already running (pid $(cat "$PID"))"; exit 0; fi
  command -v cloudflared >/dev/null || { echo "cloudflared is not installed (brew install cloudflared)" >&2; exit 1; }
  mkdir -p "$RUN"; chmod 700 "$RUN"
  umask 077
  sed -n 's/^CLOUDFLARE_TUNNEL_TOKEN=//p' "$ENV_FILE" | tr -d '"\r\n' > "$RUN/token"
  [ -s "$RUN/token" ] || { rm -f "$RUN/token"; echo "no CLOUDFLARE_TUNNEL_TOKEN in $ENV_FILE" >&2; exit 1; }
  nohup cloudflared tunnel --no-autoupdate run --token-file "$RUN/token" > "$LOG" 2>&1 &
  echo $! > "$PID"
  i=0; until grep -q "Registered tunnel connection" "$LOG" 2>/dev/null; do
    i=$((i+1)); alive || { echo "cloudflared exited, see $LOG" >&2; exit 1; }
    [ $i -lt 30 ] || { echo "no tunnel connection after 30 s, see $LOG" >&2; exit 1; }; sleep 1; done
  echo "tunnel running alone (pid $(cat "$PID")), log $LOG";;
stop)
  if alive; then kill "$(cat "$PID")"; echo "stopped (pid $(cat "$PID"))"; else echo "not running"; fi
  rm -f "$PID" "$RUN/token";;
status)
  if alive; then echo "running (pid $(cat "$PID")), $(grep -c 'Registered tunnel connection' "$LOG") connections registered"; else echo "not running"; fi;;
*) sed -n '2,10p' "$0"; exit 1;;
esac
