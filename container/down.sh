#!/bin/sh
# Tear down the show container. Its data folder stays (wolts, show logs, the app copy) unless you pass --wipe.
#   container/down.sh            # remove the container
#   container/down.sh --wipe     # also delete the data folder (SHOW_DATA, default ./show-data)
set -eu
cd "$(dirname "$0")/.."
[ -f container/.env ] && { set -a; . container/.env; set +a; }
NAME="${SHOW_NAME:-show-lodge}"
DATA="${SHOW_DATA:-$PWD/show-data}"
docker rm -f "$NAME" >/dev/null 2>&1 && echo "removed container $NAME" || echo "no container named $NAME"
if [ "${1:-}" = "--wipe" ]; then
  [ -d "$DATA/wolts" ] || { echo "$DATA doesn't look like a show data folder, not deleting" >&2; exit 1; }
  rm -rf "$DATA" && echo "deleted $DATA"
fi
