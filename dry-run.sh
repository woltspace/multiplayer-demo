#!/bin/sh
# A whole show with no humans: ./dry-run.sh [scenarios/bagels.json]. Resets the show first (throwaway lodge only).
cd "$(dirname "$0")"
exec uv run --with playwright python dry_run.py "${1:-scenarios/bagels.json}"
