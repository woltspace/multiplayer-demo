# Show day: lodges off, show on

Why: anything in the show container can reach this Mac's localhost. With no lodge answering there, a player who
talks a show wolt into misbehaving can't reach your real wolts (they run as you, with your files).

## Before the show (about 15 minutes ahead)

1. `container/tunnel-alone.sh start` (from this folder): the Cloudflare tunnel, without the lodge.
2. Stop every lodge on this Mac:
   - yours: `woltspace stop`
   - the woltspace user's (port 7778), however you normally stop it
3. Check nothing answers: `lsof -nP -iTCP:7777 -iTCP:7778 -sTCP:LISTEN` prints nothing, and
   https://multiplayer.woltspace.app/admin still opens after your Cloudflare login.
4. Backstage: ↺ Reset everything (fresh wolts with the house rules), then 🌍 Make public when the room is ready.

## The show

Big screen https://multiplayer.woltspace.app/world · game https://multiplayer.woltspace.app/ ·
backstage https://multiplayer.woltspace.app/admin

Emergency, in this order: 🔒 Make private (or `uv run --no-project python container/public.py off`),
`docker stop show-lodge`, then revoke the Claude token if anything looked wrong.

## After the show

1. 🔒 Make private.
2. `docker stop show-lodge`
3. Start the lodges again: `woltspace start` (yours), then the woltspace user's.
4. `container/tunnel-alone.sh stop` (the lodge runs its own tunnel again).
5. Rotate the show's admin key before the next public run.
