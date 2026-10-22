# Show day: lodges off, show on

Why: anything in the show container can reach this Mac's localhost. With no lodge answering there, a player who
talks a show wolt into misbehaving can't reach your real wolts (they run as you, with your files).

Once per machine: `container/up.sh` (makes the container), `container/public.py setup` (Cloudflare), and
`container/.env` with `SHOW_DATA=<the show data folder>`.

## Before the show (also right after a reboot)

1. Stop every lodge on this Mac: yours with `woltspace stop`, and the woltspace user's (port 7778).
2. `container/show-on.sh`: Docker, the container, the app, the public/private switch, the tunnel alone. It warns
   if a lodge still answers on 7777 or 7778, and prints the links.
3. Backstage: ↺ Reset everything (fresh wolts with the house rules), then 🌍 Make public when the room is ready.

## The show

Big screen https://multiplayer.woltspace.app/world · game https://multiplayer.woltspace.app/ ·
backstage https://multiplayer.woltspace.app/admin

Emergency, in this order: 🔒 Make private (or `uv run --no-project python container/public.py off`),
`docker stop show-lodge`, then revoke the Claude token if anything looked wrong.

## After the show

1. `container/show-off.sh`: private, container stopped, switch stopped.
2. Start your lodges again (`woltspace start`), then `container/tunnel-alone.sh stop`.
3. Rotate the show's admin key before the next public run.
