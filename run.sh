#!/bin/sh
# Start the show app: against the throwaway test lodge (./lodge, see lodge/start.sh) when it's here, otherwise
# against the lodge this app runs in (the show container).
cd "$(dirname "$0")"
[ -d lodge/wolts ] && exec ./run-test.sh
exec ./run-lodge.sh
