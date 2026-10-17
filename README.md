# Lodge Show

A multiplayer, multi-agent demo for a live audience. Two volunteers scan private QR codes, name and create
their own wolt from their phone, and tell it what to build by typing. A host wolt welcomes them over IWCL,
gives each one half of a page, merges the halves and ships it. A crowd screen on the projector shows the
lodge's #lodge chat and every wolt's terminal, live.

Nothing on the crowd screen is staged: chat bubbles come from the app's event log and the lodge's IWCL log,
terminals are `tmux capture-pane` of each wolt's session.

## Screens

| URL | Who | What |
|---|---|---|
| `/p/<token>` | each player (QR) | claim the seat, name + create your wolt, then type to it. First phone wins, others see "Spot taken" |
| `/crowd?k=KEY` | projector | #lodge chat on the left, three terminals on the right; the built page takes over when it ships (`B` toggles, `Esc` releases) |
| `/admin?k=KEY` | backstage | the QR per seat (printable), who claimed what, reset a seat |
| `/live/` | everyone | the page the wolts built |

The admin key is generated in `data/admin.key` on first start (or set `SHOW_ADMIN_KEY`).

## Modes

```sh
SHOW_MODE=mock uv run app.py      # replays mock/scenario.json on a clock, no lodge needed (?t=SECONDS freezes it)
./run-test.sh                     # lodge mode against the throwaway lodge on :47996
```

In lodge mode the app talks to a woltspace lodge over its HTTP API: it writes a curated wolt folder from
`seed/` (identity, show brief, the line that says who the player is), then starts its session, delivers each
player message into that session, and reads the IWCL log and tmux panes for the crowd screen. Wolts answer a
player's phone with `bin/show-reply`, which only works from the same machine (reply key + local only).

## Seeds

- `seed/template/`: a clean wolt folder; `CLAUDE.md` ends with the show section.
- `seed/host/`: the curated host (no keys, no projects) and its `SHOW.md` run sheet.
- `seed/player/`: what every player's wolt knows: who its player is, its part, the look, the rules.

Every wolt writes only in its own folder. Players' wolts write `wolt/site/part-a.html` / `part-b.html`;
the host reads both and writes the merged `index.html` into `SHOW_LIVE`, which the app serves at `/live/`.

## Testing without a real audience

```sh
WOLTSPACE_BIN=/path/to/woltspace lodge/start.sh   # throwaway lodge, clean env, no tunnel, no bots
./reset-test.sh                                    # wipe it, recreate the host
./run-test.sh                                      # the app in lodge mode
uv run --with playwright python test_run.py shots-real 240   # two test players, crowd screenshots every 10 s
```

The throwaway lodge must start from a clean environment (`lodge/start.sh` does it): a lodge started from a
wolt's environment would pick up that lodge's tunnel and chat bot tokens. `reset-test.sh` only wipes a
folder marked by `lodge/start.sh`.

## Settings

| Env | Default | |
|---|---|---|
| `SHOW_MODE` | `mock` | `mock` or `lodge` |
| `SHOW_PORT` | `4060` | binds 127.0.0.1 only; put a tunnel in front for phones |
| `SHOW_LODGE` | `http://127.0.0.1:47990` | the lodge's API |
| `SHOW_HARNESS` / `SHOW_MODEL` | `claude` / `sonnet` | for players' wolts |
| `SHOW_HOST_WOLT` / `SHOW_HOST_PLAYER` | `commie` / `jerpint` | the host wolt and the person who briefs it |
| `SHOW_LIVE` | `./live` | where the merged page is written and served from |
| `SHOW_REPLY_CMD` | `show-reply` | the reply command as wolts should type it |
| `WOLTSPACE_WOLTS_DIR` | | the lodge's wolts folder (seeds are written there) |
| `SHOW_CHROME` | | optional chromium binary for the playwright scripts |

## Still to do

- A room page so the build lands on everyone's phone.
- Run the whole thing inside a throwaway container (app + lodge + wolts), only the app exposed.
