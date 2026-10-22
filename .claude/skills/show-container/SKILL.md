---
name: show-container
description: Bring up (or rebuild from scratch) the Lodge Show in a fresh woltspace container, check it works, and tear it down. Use when asked to set up, rebuild, reset or tear down the show container, or to get the demo running from a clone of this repo.
---

# The show container

Everything lives in two scripts at the repo root; run them, don't redo their steps by hand.

## Bring it up
1. Check the prerequisites: `docker info` works, `uv` is installed, and the token file exists
   (`SHOW_TOKEN_FILE`, default `~/.woltspace/.env.docker`) with a `CLAUDE_CODE_OAUTH_TOKEN=` line.
   Check presence only (`grep -c '^CLAUDE_CODE_OAUTH_TOKEN=.' FILE`); never print, copy or move the token.
   If it's missing, the human makes it: `claude setup-token`, then pastes it into that file and `chmod 600`s it.
2. Make sure what should be in the show is committed: the container gets a clone of the current branch.
3. Run `container/up.sh`. A first build takes a few minutes; then the lodge, the app and hostie come up.

## Check it
- The script prints the backstage, big screen (`/world`) and room links: open the big screen.
- hostie is running: `docker exec -u node $SHOW_NAME tmux ls` shows a `hostie-…` session, and its screen
  (`tmux capture-pane -p -t <session>`) shows it introduced itself, not a login, theme or bypass-warning screen.
- Optional full rehearsal: `SHOW_URL=http://lodge-show.localhost:<port> uv run --with playwright python dry_run.py
  scenarios/dam-world.json`, run from the container's app copy (`$SHOW_DATA/wolts/apps/lodge-show`).

## Tear it down
`container/down.sh` removes the container and keeps the data folder; `container/down.sh --wipe` deletes the data
folder too. Ask the human before wiping: it holds the show logs.

## Never
- Make anything public (tunnel, public app) without the human: the room and seat links go public only on their word.
- Print or move the token. Reset a lodge that isn't the show container's (the app refuses without its marker).
