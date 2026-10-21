#!/bin/sh
# The whole show in a fresh woltspace container, from a clone of this repo. One command:
#
#   container/up.sh
#
# Needs: Docker, uv, and a Claude token file (default ~/.woltspace/.env.docker) holding one line
#   CLAUDE_CODE_OAUTH_TOKEN=...      (make it with: claude setup-token; then chmod 600 the file)
#
# What it does: builds the image from woltspace's own Dockerfile at a pinned PyPI version, makes the data folder,
# puts this app inside it (a clone of the current branch: commit your changes first), starts the container with the
# token, marks the lodge throwaway, starts the app, resets the show (hostie wakes up) and prints the links.
# Settings (environment): SHOW_WOLTSPACE_VERSION (0.5.21), SHOW_NAME (show-lodge), SHOW_LODGE_PORT (47991),
# SHOW_DATA (./show-data), SHOW_TOKEN_FILE (~/.woltspace/.env.docker), SHOW_HOST_PLAYER (jerpint),
# SHOW_APP_PORT (47992: the app alone on the host's loopback, for a tunnel; the lodge stays private).
# Tear down: container/down.sh (data kept) or container/down.sh --wipe.
set -eu
cd "$(dirname "$0")/.."
REPO="$PWD"
V="${SHOW_WOLTSPACE_VERSION:-0.5.21}"
NAME="${SHOW_NAME:-show-lodge}"
PORT="${SHOW_LODGE_PORT:-47991}"
APP_PORT="${SHOW_APP_PORT:-47992}"
DATA="${SHOW_DATA:-$REPO/show-data}"
TOKEN_FILE="${SHOW_TOKEN_FILE:-$HOME/.woltspace/.env.docker}"
IMAGE="woltspace-show:$V"
say() { printf '\n🦝 %s\n' "$*"; }

command -v docker >/dev/null || { echo "Docker is not installed" >&2; exit 1; }
command -v uv >/dev/null || { echo "uv is not installed (https://docs.astral.sh/uv/)" >&2; exit 1; }
grep -Eq '^CLAUDE_CODE_OAUTH_TOKEN=.+' "$TOKEN_FILE" 2>/dev/null || {
  echo "No Claude token in $TOKEN_FILE. Run 'claude setup-token', put CLAUDE_CODE_OAUTH_TOKEN=<token> in that file, chmod 600 it." >&2; exit 1; }
if docker ps -a --format '{{.Names}}' | grep -qx "$NAME"; then
  echo "A container named $NAME already exists. Tear it down first: container/down.sh" >&2; exit 1
fi

if ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
  say "building $IMAGE from woltspace $V's own Dockerfile (PyPI), takes a few minutes"
  DF=$(uv run --no-project --quiet --with "woltspace==$V" python -c \
    'import pathlib, woltspace; print(pathlib.Path(woltspace.__file__).parent / "_bundle/container/Dockerfile")')
  CTX=$(mktemp -d); cp "$DF" "$CTX/Dockerfile"
  docker build -q -t "$IMAGE" --build-arg "WOLTSPACE_PYPI_VERSION=$V" "$CTX"; rm -rf "$CTX"
fi

say "data folder: $DATA"
mkdir -p "$DATA/wolts/apps"
if [ ! -d "$DATA/wolts/apps/lodge-show/.git" ]; then
  git clone -q --branch "$(git branch --show-current)" "$REPO" "$DATA/wolts/apps/lodge-show"
else
  git -C "$DATA/wolts/apps/lodge-show" pull -q --ff-only
fi
printf 'SHOW_HOST_PLAYER=%s\nSHOW_BIND=0.0.0.0\n' "${SHOW_HOST_PLAYER:-jerpint}" > "$DATA/wolts/apps/lodge-show/.env"
[ -f "$DATA/wolts/woltspace.json" ] || printf '{\n  "claude": {"default_wolt": "hostie"}\n}\n' > "$DATA/wolts/woltspace.json"

say "starting container $NAME (woltspace $V, lodge on 127.0.0.1:$PORT, app alone on 127.0.0.1:$APP_PORT, no public tunnel)"
docker run -d --name "$NAME" --env-file "$TOKEN_FILE" -e HOST_UID="$(id -u)" -e HOST_GID="$(id -g)" \
  -e WOLTSPACE_PUBLIC_TUNNEL=false -v "$DATA/wolts:/workspace/wolts" -p "127.0.0.1:$PORT:7777" -p "127.0.0.1:$APP_PORT:4060" "$IMAGE" >/dev/null
i=0; until curl -sf -o /dev/null "http://127.0.0.1:$PORT/"; do i=$((i+1)); [ $i -lt 90 ] || { echo "the lodge didn't come up" >&2; exit 1; }; sleep 1; done
docker exec "$NAME" touch /workspace/.lodge-show-throwaway  # the show may reset this lodge (never a real one)

say "starting the show app inside"
curl -sf -X POST "http://127.0.0.1:$PORT/apps/lodge-show/start" >/dev/null
APP="http://lodge-show.localhost:$PORT"
i=0; until [ -s "$DATA/wolts/apps/lodge-show/data/admin.key" ] && curl -sf -o /dev/null "$APP/"; do
  i=$((i+1)); [ $i -lt 120 ] || { echo "the app didn't come up (see: docker logs $NAME)" >&2; exit 1; }; sleep 1; done
KEY=$(cat "$DATA/wolts/apps/lodge-show/data/admin.key")

say "resetting the show (hostie wakes up, about 30 s)"
curl -sf -m 240 -X POST "$APP/api/admin/reset-all?k=$KEY" >/dev/null

say "ready ✓
  backstage   $APP/admin?k=$KEY
  big screen  $APP/world?k=$KEY
  room        $APP/play
  app alone   http://127.0.0.1:$APP_PORT/ (point a tunnel here, see container/public.py)
  lodge       http://127.0.0.1:$PORT/"
