# /// script
# requires-python = ">=3.11"
# dependencies = ["fastapi", "uvicorn"]
# ///
"""Lodge Show: multiplayer, multi-agent, live on stage (AI Tinkerers Montreal, 2026-10-22).

Room:     GET /            public: the chat and the build, for everyone in the room
Players:  GET /p/<token>     claim the slot, name + create your wolt, then type to it
Crowd:    GET /crowd?k=KEY   full screen: #lodge chat + every wolt's terminal, live
Admin:    GET /admin?k=KEY   the private QR per slot, reset a slot

The host wolt (curated hostie, scratch memory) already exists and runs the show; players create theirs live.
Everything that happens is one line in data/events.jsonl (append-only), so a show can be replayed.

SHOW_MODE=mock  replays mock/scenario.json on a clock (for mocks, no lodge needed)
SHOW_MODE=lodge drives a real lodge at SHOW_LODGE (create wolt, deliver messages, tmux capture)
Run: SHOW_ADMIN_KEY=... uv run app.py   (port SHOW_PORT, default 4060)
"""

import json
import os
import secrets
import subprocess
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path

import sys
sys.path.insert(0, str(Path(__file__).parent))

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

HERE = Path(__file__).parent
DATA = Path(os.environ.get("SHOW_DATA", HERE / "data"))
LIVE = Path(os.environ.get("SHOW_LIVE", HERE / "live"))
MODE = os.environ.get("SHOW_MODE", "mock")
LODGE = os.environ.get("SHOW_LODGE", "http://127.0.0.1:47990")
HARNESS = os.environ.get("SHOW_HARNESS", "claude")
MODEL = os.environ.get("SHOW_MODEL", "sonnet")


# The live page is a staged shell (static/stage.html) with one box per wolt. Each player's wolt owns one file in its
# own folder; the host owns the header. Writing the header is the ship moment.
PART_OF = {"p1": "part-a.html", "p2": "part-b.html", "host": "header.html"}
SIDE_OF = ({"p1": "middle", "p2": "bottom", "host": "top"} if os.environ.get("SHOW_WORLD", "1") == "1"  # one phone, stacked
           else {"p1": "left", "p2": "right", "host": "top"})
PART_MAX = 200_000


def engine_for(sid: str) -> tuple[str, str]:
    """Each player slot can race on its own harness: SHOW_HARNESS_P1=codex, SHOW_MODEL_P2=openrouter/z-ai/glm-5.2..."""
    k = sid.upper()
    harness = os.environ.get(f"SHOW_HARNESS_{k}", HARNESS)
    model = os.environ.get(f"SHOW_MODEL_{k}") or (MODEL if harness == HARNESS else "")
    return harness, model
HOST = os.environ.get("SHOW_HOST_WOLT", "hostie")
HOST_PLAYER_DEFAULT = os.environ.get("SHOW_HOST_PLAYER", "jerpint")
# Who plays the host slot. Dry runs reset the show with an honest tester name (never jerpint's); a plain Reset goes back
# to the default. Kept in data/ so an app restart doesn't rename the host mid-show.
_host_file = DATA / "host_player.txt"
HOST_PLAYER = _host_file.read_text().strip() if _host_file.exists() else HOST_PLAYER_DEFAULT
REPLY_CMD = os.environ.get("SHOW_REPLY_CMD", "show-reply")
SAY_MAX = 280
COOLDOWN = 3.0  # seconds between messages per player

DATA.mkdir(parents=True, exist_ok=True)
LIVE.mkdir(parents=True, exist_ok=True)
_key_file = DATA / "admin.key"
if not os.environ.get("SHOW_ADMIN_KEY") and not _key_file.exists():
    _key_file.write_text(secrets.token_urlsafe(12))
    _key_file.chmod(0o600)
ADMIN_KEY = os.environ.get("SHOW_ADMIN_KEY") or _key_file.read_text().strip()

_reply_file = DATA / "reply.key"  # read by bin/show-reply inside the lodge
if not _reply_file.exists():
    _reply_file.write_text(secrets.token_urlsafe(16))
    _reply_file.chmod(0o644)
REPLY_KEY = _reply_file.read_text().strip()

LOG = DATA / "events.jsonl"


def seeded(rel: str) -> str:
    """A seed file with this show's paths filled in."""
    return (HERE / "seed" / rel).read_text().replace("{LIVE}", str(LIVE)).replace("{REPLY}", REPLY_CMD).replace("{HOST_PLAYER}", HOST_PLAYER).replace("{WOLTS}", _wolts_dir)
SLOTS = DATA / "slots.json"
lock = threading.Lock()


def default_slots() -> dict:
    # Two volunteers + jerpint. jerpint's slot drives the host wolt, which already exists.
    return {
        "p1": {"label": "Player 1", "token": secrets.token_urlsafe(9), "claimed": None, "player": None, "wolt": None},
        "p2": {"label": "Player 2", "token": secrets.token_urlsafe(9), "claimed": None, "player": None, "wolt": None},
        "host": {"label": HOST_PLAYER, "token": secrets.token_urlsafe(9), "claimed": None, "player": HOST_PLAYER,
                 "wolt": {"name": HOST, "creature": "raccoon", "harness": HARNESS, "model": MODEL, "session": None}},
    }


slots = json.loads(SLOTS.read_text()) if SLOTS.exists() else default_slots()


# The show's phase: ready (after a reset) and paused both put the placeholder board on the big screen; live shows
# the show. Players can create their wolt in any phase but only send while live; the wolts keep running behind the
# board. The host slot can always type, to brief its wolt.
PHASE_FILE = DATA / "phase.txt"
PHASES = ("ready", "live", "paused")
phase = PHASE_FILE.read_text().strip() if PHASE_FILE.exists() else "ready"


# The show log: everything the room saw, in order, so a show can be replayed and its video rendered from it
# (SHOW_MODE=replay, render.py). App events, IWCL messages, every version of every box, terminal screens, phases.
SHOW_LOG = DATA / "show.jsonl"
_showlog_lock = threading.Lock()


def showlog(kind: str, **row) -> None:
    if MODE != "lodge":
        return
    with _showlog_lock, SHOW_LOG.open("a") as f:
        f.write(json.dumps({"ts": time.time(), "kind": kind, **row}) + "\n")


# The crowd vote: once the page ships, every phone in the room votes for its favourite of the two games (one vote per
# phone, changeable, kept by a random cookie). Cleared on Reset everything.
VOTES_FILE = DATA / "votes.json"
votes: dict[str, str] = json.loads(VOTES_FILE.read_text()) if VOTES_FILE.exists() else {}
vote_lock = threading.Lock()


def tally() -> dict:
    with vote_lock:
        return {side: sum(1 for v in votes.values() if v == side) for side in ("p1", "p2")}


VOTING = os.environ.get("SHOW_VOTING") == "1"  # off for now: SHOW_VOTING=1 turns the vote on


def shipped(evs: list) -> bool:
    """Voting is open once the page ships (and only when the vote is switched on)."""
    return VOTING and any(e.get("type") == "ship" for e in evs)


# The game: players can create their wolts any time, but only type to them once the host starts the game (from the
# host phone, backstage, or Shift+G on the big screen). Starting it asks the host wolt to send the kickoff over IWCL.
GAME_FILE = DATA / "game.txt"
game_on = GAME_FILE.exists()
# The build clock: SHOW_GAME_SECONDS from the start (default 3 minutes), on the big screen. At zero the app tells the
# host it's time to ship. game_at is when the game started (epoch seconds), kept in game.txt across restarts.
GAME_SECONDS = int(os.environ.get("SHOW_GAME_SECONDS", "180"))
game_at = float(GAME_FILE.read_text().split("|")[-1]) if game_on and "|" in GAME_FILE.read_text() else None
_clock: dict = {"timer": None}


def times_up() -> None:
    """The build clock hit zero: ask the host to wrap up and ship (once, and only if the game is still on)."""
    host = slots["host"]["wolt"]
    if not game_on or any(e["type"] == "ship" for e in events):
        return
    record({"type": "timeup"})
    if MODE == "lodge" and host and host.get("session"):
        body = (f"[lodge-show app, automatic] Time's up ({GAME_SECONDS // 60}:{GAME_SECONDS % 60:02d} on the clock). "
                "Tell each player's wolt over IWCL to finish its last small save now, then ship (write the header).")
        threading.Thread(target=driver.deliver, args=(host["session"], body), daemon=True).start()


def set_phase(p: str) -> None:
    global phase
    phase = p
    PHASE_FILE.write_text(p)
    showlog("phase", phase=p)


def open_for(sid: str) -> None:
    """Players can send only while the show is live and the game has started. Creating a wolt is always open."""
    if sid != "host" and phase != "live":
        raise HTTPException(423, "the show continues in a moment")
    if sid != "host" and not game_on:
        raise HTTPException(423, "the game starts in a moment")
    if WORLD and sid != "host":
        t = turn_state()
        if t.get("turn_over"):
            raise HTTPException(423, "time's up: thanks for building!")
        if t["turn"] != sid:
            raise HTTPException(423, f"one at a time: it's {t['turn_player'] or 'someone else'}'s turn")
        if t["turn_busy"]:
            raise HTTPException(423, "your wolt is on it: wait for its post")


def start_game(by: str) -> bool:
    """Unlock the players and ask the host wolt for the kickoff. Once per show (Reset everything turns it off)."""
    global game_on, game_at
    with lock:
        if game_on:
            return False
        game_on, game_at = True, time.time()
        GAME_FILE.write_text(f"{by}|{game_at}")
        turn.update(sid="host", spoke_at=None, since=time.time())
        wolts = [x["wolt"]["name"] for k, x in slots.items() if k != "host" and x["wolt"]]
        host = slots["host"]["wolt"]
    record({"type": "game", "by": by})
    _room["body"] = None
    if MODE == "lodge" and host and host.get("session"):
        who = ", ".join(wolts) or "the players' wolts (none has joined yet: send it to each one as it joins)"
        if WORLD:
            at = " ".join("@" + w for w in wolts) or "everyone"
            body = (f"[lodge-show app, automatic] {HOST_PLAYER} just started the game: one turn at a time, {HOST_PLAYER} first. "
                    f"Post the kickoff now, one line, e.g. \"⚡ The game is on! {at}: one shared page, one turn at a time. "
                    f"{HOST_PLAYER} goes first.\"\n{post_how('host')}")
        else:
            body = (f"[lodge-show app, automatic] {HOST_PLAYER} just started the game. Send the kickoff now, over IWCL, to "
                    f"{who}: one short line each, e.g. \"⚡ The game is on! Ask your player what game to build, then build it "
                    f"in small saves.\" Their players can type from now on.")
        threading.Thread(target=driver.deliver, args=(host["session"], body), daemon=True).start()
    if GAME_SECONDS > 0:
        _clock["timer"] = threading.Timer(GAME_SECONDS, times_up)
        _clock["timer"].daemon = True
        _clock["timer"].start()
    return True


def clock() -> dict:
    """For the big screen: when the game started, how long it lasts, and the server's now (so screens don't drift)."""
    return {"game_at": game_at, "game_seconds": GAME_SECONDS, "now": time.time()}


# ---------------------------------------------------------------- the shared world
# SHOW_WORLD=1 (default): everyone builds ONE page together in ONE #lodge group chat. Every human message goes to all
# three wolts; every wolt post (show-post) goes to the other two, so wolt-to-wolt talk (@mentions) is implicit IWCL.
# One turn at a time once the game is on: host -> P1 -> P2 -> host ...; a turn passes when the speaker's own wolt has
# posted, or after SHOW_TURN_SECONDS. The host can always speak (to steer), but only takes a turn on their own turn.
WORLD = os.environ.get("SHOW_WORLD", "1") == "1"
POST_CMD = os.environ.get("SHOW_POST_CMD", str(HERE / "bin" / "show-post"))
TURN_ORDER = ("host", "p1", "p2")
TURN_MAX = int(os.environ.get("SHOW_TURN_SECONDS", "45"))
TURN_IDLE = int(os.environ.get("SHOW_TURN_IDLE", "0"))  # >0: a turn nobody takes passes on after this long. 0: it
# waits (the host skips it with ⏭ if someone froze)
turn = {"sid": "host", "spoke_at": None, "since": time.time()}


def seated() -> list[str]:
    return [k for k in TURN_ORDER if slots.get(k, {}).get("wolt")]


def turn_state() -> dict:
    """Whose turn it is; passes the turn on lazily (every screen asks once a second)."""
    if not (WORLD and game_on):
        return {"turn": None, "turn_player": None, "turn_busy": False}
    if any(e["type"] in ("timeup", "ship") for e in events[-200:]):  # the clock ran out or we shipped: no more turns
        return {"turn": None, "turn_player": None, "turn_busy": False, "turn_over": True}
    sid, at = turn["sid"], turn["spoke_at"]
    posted = at and any(e["type"] == "post" and e.get("slot") == sid and e["ts"] > at for e in events[-80:])
    if posted or (at and time.time() - at > TURN_MAX) or (not at and TURN_IDLE and time.time() - turn["since"] > TURN_IDLE):
        order = seated() or ["host"]
        prev_since = turn["since"]
        nxt = order[(order.index(sid) + 1) % len(order)] if sid in order else order[0]
        turn.update(sid=nxt, spoke_at=None, since=time.time())
        record({"type": "turn", "slot": nxt, "player": slots[nxt]["player"]})
        sid = nxt
        if nxt == "host":  # the host already spoke during the last turn (a twist, a steer): that was their go
            said = [e for e in events[-40:] if e["type"] == "say" and e.get("slot") == "host" and e["ts"] > prev_since]
            if said:
                turn["spoke_at"] = said[-1]["ts"]
    return {"turn": sid, "turn_player": slots[sid]["player"], "turn_busy": bool(turn["spoke_at"])}


def skip_turn(by: str) -> dict:
    """The host passes the turn on (someone froze, a phone died): to the next seat, now."""
    if not (WORLD and game_on):
        raise HTTPException(409, "no game on")
    order = seated() or ["host"]
    sid = turn["sid"]
    nxt = order[(order.index(sid) + 1) % len(order)] if sid in order else order[0]
    turn.update(sid=nxt, spoke_at=None, since=time.time())
    record({"type": "turn", "slot": nxt, "player": slots[nxt]["player"], "skipped": sid, "by": by})
    _room["body"] = None
    return turn_state()


def post_how(k: str) -> str:
    d = f"SHOW_{secrets.token_hex(6).upper()}"
    return f"Post to #lodge (everyone sees it) by replacing YOUR_POST, then run it:\n{POST_CMD} {k} <<'{d}'\nYOUR_POST\n{d}"


def broadcast(from_sid: str, head: str, text: str, own_line: str, other_line: str, skip_self: bool) -> None:
    """Paste a #lodge message into every wolt's terminal (the author's own wolt too, unless skip_self)."""
    if MODE != "lodge":
        return
    for k in TURN_ORDER:
        w = (slots.get(k) or {}).get("wolt")
        if not w or not w.get("session") or (skip_self and k == from_sid):
            continue
        body = f"[#lodge] {head}\n{text}\n\n{own_line if k == from_sid else other_line}\n{post_how(k)}"
        threading.Thread(target=driver.deliver, args=(w["session"], body), daemon=True).start()


def save_slots() -> None:
    tmp = SLOTS.with_suffix(".tmp")
    tmp.write_text(json.dumps(slots, indent=2))
    tmp.replace(SLOTS)


save_slots()
events: list[dict] = [json.loads(l) for l in LOG.read_text().splitlines() if l.strip()] if LOG.exists() else []
last_say: dict[str, float] = {}


def record(event: dict) -> dict:
    event = {"ts": time.time(), "seq": len(events) + 1} | event
    with LOG.open("a") as f:
        f.write(json.dumps(event) + "\n")
    events.append(event)
    showlog("event", event=event)
    return event


# ---------------------------------------------------------------- drivers

class MockDriver:
    """Replays mock/scenario.json: events and terminal lines appear on a clock that starts on /api/mock/start."""

    def __init__(self):
        self.scn = json.loads((HERE / "mock" / "scenario.json").read_text())
        self.t0 = time.time()

    def now(self, t: float | None) -> float:
        return t if t is not None else time.time() - self.t0

    def events(self, t: float | None) -> list[dict]:
        now = self.now(t)
        return [dict(e, seq=i + 1) for i, e in enumerate(self.scn["events"]) if e["t"] <= now]

    def typing(self, t: float | None) -> list[str]:
        now = self.now(t)
        return sorted({e["from"] for e in self.scn["events"] if e["type"] in ("say", "iwcl", "reply") and e["t"] - 1.2 <= now < e["t"]})

    def terms(self, t: float | None) -> dict:
        now = self.now(t)
        return {w: [l[1] for l in lines if l[0] <= now] for w, lines in self.scn["terms"].items()}

    def build(self, t: float | None) -> int:
        now = self.now(t)
        b = [e["v"] for e in self.scn["events"] if e["type"] == "build" and e["t"] <= now]
        return b[-1] if b else 0


class ReplayDriver:
    """Plays a show log (data/show.jsonl from a real show) back on a clock, like MockDriver plays a script."""

    def __init__(self, path: Path):
        self.rows = [json.loads(l) for l in path.read_text().splitlines() if l.strip()]
        t0 = self.rows[0]["ts"] if self.rows else 0
        for r in self.rows:
            r["t"] = r["ts"] - t0
        self.length = self.rows[-1]["t"] if self.rows else 0
        self.t0 = time.time()

    def now(self, t: float | None) -> float:
        return t if t is not None else time.time() - self.t0

    def _upto(self, t, kind):
        now = self.now(t)
        return [r for r in self.rows if r["kind"] == kind and r["t"] <= now]

    def events(self, t: float | None) -> list[dict]:
        evs = [dict(r["event"], seq=f"a{i}") for i, r in enumerate(self._upto(t, "event"))]
        evs += [dict(r["row"], seq=f"f{i}") for i, r in enumerate(self._upto(t, "iwcl"))]
        return sorted(evs, key=lambda e: e["ts"])

    def terms(self, t: float | None) -> dict:
        return {r["wolt"]: r["lines"] for r in self._upto(t, "term")}

    def busy(self, t: float | None) -> list[str]:
        now = self.now(t)
        return sorted({r["wolt"] for r in self._upto(t, "term") if r["t"] > now - 2})

    def parts(self, t: float | None) -> dict:
        out = {sid: {"file": PART_OF[sid], "wolt": None, "html": "", "v": 0} for sid in ("host", "p1", "p2")}
        for r in self._upto(t, "part"):
            out[r["slot"]] = {k: v for k, v in r.items() if k not in ("ts", "t", "kind", "slot")} | {"v": int(r["t"] * 1000) + 1}
        return out

    def build(self, t: float | None) -> int:
        return max(p["v"] for p in self.parts(t).values())

    def cast(self, t: float | None) -> list[dict]:
        rows = self._upto(t, "cast")
        return rows[-1]["cast"] if rows else []

    def phase(self, t: float | None) -> str:
        rows = self._upto(t, "phase")
        return rows[-1]["phase"] if rows else "ready"


class LodgeDriver:
    """Drives the real lodge (inside the throwaway container). Players' words go in as plain pastes."""

    def post(self, path: str, body: dict) -> dict:
        req = urllib.request.Request(LODGE + path, json.dumps(body).encode(), {"content-type": "application/json"})
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read() or b"{}")

    def create(self, name: str, creature: str, player: str, harness: str, model: str, sid: str) -> dict:
        """Pre-baked: write the curated wolt folder first, then boot its first session on it."""
        from show_scaffold import scaffold, slug
        scaffold(Path(_wolts_dir), name, creature, harness, model, "player",
                 {"PLAYER": player, "HOST_PLAYER": HOST_PLAYER, "LIVE": str(LIVE), "REPLY": REPLY_CMD, "WOLTS": _wolts_dir,
                  "PART": PART_OF[sid], "SIDE": SIDE_OF[sid], "BOX": PART_OF[sid].removesuffix(".html"),
                  "BOXJS": "partA" if sid == "p1" else "partB", "POST": POST_CMD, "SLOT": sid, "HOST": HOST})
        if harness == "codex" and is_throwaway():
            self.auto_grant(slug(name))
        return self.post("/sessions/new/lodge", {"wolt": slug(name), "creature": creature})

    def auto_grant(self, wolt: str) -> None:
        """jerpint's call (2026-10-19): Codex players run in Auto, in the throwaway lodge only. Revoked at reset-all.
        Without it Codex stops on an approval prompt for the show-reply call. The lodge wants the exact folder confirmed."""
        try:
            self.post("/auto-grants/grant", {"wolt": wolt})
        except urllib.error.HTTPError as e:
            canonical = json.loads(e.read() or b"{}").get("canonical_workdir")
            if not canonical:
                raise
            self.post("/auto-grants/grant", {"wolt": wolt, "confirm": canonical})
        record({"type": "auto_grant", "wolt": wolt})

    def deliver(self, session: str, text: str) -> dict:
        return self.post(f"/sessions/{session}/message", {"text": text})

    def running_session(self, wolt: str) -> str | None:
        with urllib.request.urlopen(LODGE + "/sessions", timeout=10) as r:
            rows = json.loads(r.read())
        live = [x for x in rows if x.get("wolt") == wolt and x.get("status") == "running"]
        return live[0]["name"] if live else None

    def capture(self, session: str, lines: int = 60) -> str:
        out = subprocess.run(["tmux", "capture-pane", "-p", "-e", "-J", "-S", f"-{lines}", "-t", session],
                             capture_output=True, text=True, timeout=5)
        return out.stdout if out.returncode == 0 else ""


driver = MockDriver() if MODE == "mock" else ReplayDriver(Path(os.environ["SHOW_REPLAY"])) if MODE == "replay" else LodgeDriver()

# The lodge's IWCL log (woltspace 0.5.20+): one line per wolt-to-wolt message or spawn.
_wolts_dir = os.environ.get("WOLTSPACE_WOLTS_DIR") or str(Path.home() / ".woltspace" / "wolts")


def is_throwaway() -> bool:
    wolts = Path(_wolts_dir).resolve()
    return (wolts.parent / ".lodge-show-throwaway").exists() and wolts != (Path.home() / ".woltspace" / "wolts").resolve()
IWCL_LOG = Path(os.environ.get("SHOW_IWCL_LOG") or Path(_wolts_dir) / ".space" / "logs" / "iwcl.jsonl")


def short(text: str) -> str:
    """The room only needs the words: drop the header and the reply heredoc the lodge adds."""
    import re
    text = re.sub(r"\n?Reply by replacing YOUR_REPLY[\s\S]*$", "", text)
    text = re.sub(r"^\[(message from|spawned by)[^\]]*\]:?\s*", "", text)
    return text.strip()[:600]


class Feed:
    """Follows the IWCL log from the show's start: complete lines only, survives rotation."""

    def __init__(self, path: Path):
        self.path, self.inode, self.offset, self.rows = path, None, 0, []
        self.lock = threading.Lock()
        # Only what happens during the show belongs on the screen: from the show's first event on, even after an app restart.
        self.since = events[0]["ts"] if events else time.time()

    def poll(self) -> list[dict]:
        with self.lock:
            try:
                st = self.path.stat()
            except FileNotFoundError:
                return self.rows
            if st.st_ino != self.inode or st.st_size < self.offset:
                self.inode, self.offset = st.st_ino, 0
            if st.st_size > self.offset:
                with self.path.open("rb") as f:
                    f.seek(self.offset)
                    chunk = f.read(st.st_size - self.offset)
                end = chunk.rfind(b"\n") + 1
                self.offset += end
                for line in chunk[:end].splitlines():
                    try:
                        row = json.loads(line)
                    except ValueError:
                        continue
                    if row.get("v") != 1 or not row.get("from_wolt") or (row.get("ts") or 0) < self.since:
                        continue  # players' words come from the app itself, not from the log
                    kind = "add" if row.get("event") == "spawn" else "iwcl"
                    self.rows.append({"seq": f"f{len(self.rows) + 1}", "ts": row.get("ts") or time.time(), "type": kind,
                                      "from": row["from_wolt"], "to": row.get("to_wolt") or "", "text": short(row.get("text") or ""),
                                      "status": row.get("status")})
            return self.rows


feed = Feed(IWCL_LOG) if MODE == "lodge" else None
_screens: dict[str, tuple[str, float]] = {}  # wolt -> (last capture, when it last changed)


def busy(name: str, screen: str) -> bool:
    old = _screens.get(name)
    if not old or old[0] != screen:
        _screens[name] = (screen, time.time())
        return bool(old)
    return time.time() - old[1] < 2.0

if MODE == "lodge":
    host = slots["host"]["wolt"]
    try:
        host["session"] = driver.running_session(host["name"]) or host.get("session")
    except Exception as e:
        print(f"host session lookup failed: {e}")
    save_slots()
    if not any(e["type"] == "host" for e in events):
        record({"type": "host", "slot": "host", "wolt": host["name"]})

# ---------------------------------------------------------------- app

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)


@app.middleware("http")
async def headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "no-referrer"
    if request.url.path.startswith("/static/"):  # the stage runs in a sandboxed iframe (no origin): fonts need this
        response.headers["Access-Control-Allow-Origin"] = "*"
    return response


def admin(request: Request) -> None:
    key = request.headers.get("x-admin-key") or request.query_params.get("k") or ""
    if not secrets.compare_digest(key, ADMIN_KEY):
        raise HTTPException(403, "admin only")


def slot_for(token: str) -> tuple[str, dict]:
    for sid, s in slots.items():
        if secrets.compare_digest(s["token"], token):
            return sid, s
    raise HTTPException(404, "unknown player link")


def owner(request: Request, token: str) -> tuple[str, dict]:
    """The first phone that opens a player link owns it; every other phone gets 'taken'."""
    sid, s = slot_for(token)
    if s["claimed"] and request.cookies.get(f"seat_{sid}") != s["claimed"]:
        raise HTTPException(409, "this player spot is already taken")
    return sid, s


def mock_t(request: Request) -> float | None:
    t = request.query_params.get("t")
    return float(t) if t and MODE in ("mock", "replay") else None


def public_slots() -> list[dict]:
    return [{"slot": sid, "label": s["label"], "player": s["player"], "wolt": s["wolt"] and s["wolt"]["name"],
             "creature": s["wolt"] and s["wolt"]["creature"], "harness": s["wolt"] and s["wolt"]["harness"], "model": s["wolt"] and s["wolt"].get("model", "")}
            for sid, s in slots.items()]


@app.get("/p/{token}")
def player_page(token: str, request: Request):
    sid, s = slot_for(token)
    response = FileResponse(HERE / "static" / "player.html")
    if not s["claimed"]:
        seat = secrets.token_urlsafe(12)
        with lock:
            s["claimed"] = seat
            save_slots()
        record({"type": "claim", "slot": sid})
        response.set_cookie(f"seat_{sid}", seat, max_age=2 * 86400, httponly=True, samesite="lax")
    return response


@app.get("/api/p/{token}")
def player_state(token: str, request: Request):
    sid, s = owner(request, token)
    if MODE == "mock":
        mine = [e for e in driver.events(mock_t(request)) if e.get("slot") == sid or e.get("to_slot") == sid]
        joined = [e for e in mine if e["type"] == "join"]
        j = joined[0] if joined else None
        wolt = s["wolt"] or (j and {"name": j["wolt"], "creature": j["creature"], "harness": j["harness"]}) or None
        if sid == "host" and MODE == "mock":
            wolt = {"name": HOST, "creature": "raccoon", "harness": "Claude Code · Sonnet"}
        player = s["player"] or (joined and joined[0]["player"]) or None
        return {"slot": sid, "label": s["label"], "player": player, "wolt": wolt, "phase": phase, "game": game_on, "messages": [e for e in mine if e["type"] in ("say", "reply")]}
    if WORLD:  # the phone shows the whole #lodge chat
        msgs = [e for e in events if e["type"] in ("say", "post", "join", "game", "turn", "timeup", "ship")][-50:]
        cast = [{k: c[k] for k in ("slot", "player", "wolt", "creature")} for c in public_slots() if c["wolt"]]
        return {"slot": sid, "label": s["label"], "player": s["player"], "wolt": s["wolt"], "phase": phase, "game": game_on,
                "world": True, **turn_state(), "messages": msgs, "cast": cast}
    mine = [e for e in events if e.get("slot") == sid or e.get("to_slot") == sid]
    return {"slot": sid, "label": s["label"], "player": s["player"], "wolt": s["wolt"], "phase": phase, "game": game_on, "messages": [e for e in mine if e["type"] in ("say", "reply")]}


class Create(BaseModel):
    player: str = Field(min_length=1, max_length=40)
    wolt: str = Field(min_length=1, max_length=40)
    creature: str


@app.post("/api/p/{token}/create")
def create_wolt(token: str, c: Create, request: Request):
    sid, s = owner(request, token)
    if s["wolt"]:
        raise HTTPException(409, "you already have a wolt")
    if c.creature not in ("beaver", "otter", "raccoon"):
        raise HTTPException(400, "pick a beaver, an otter or a raccoon")
    player, name = " ".join(c.player.split())[:24], " ".join(c.wolt.split())[:24]
    taken = {x["wolt"]["name"].lower() for x in slots.values() if x["wolt"]}
    if name.lower() in taken:
        raise HTTPException(409, "that name is taken, pick another")
    harness, model = engine_for(sid)
    if MODE == "lodge":
        try:
            res = driver.create(name, c.creature, player, harness, model, sid)
        except FileExistsError as e:
            raise HTTPException(409, str(e))
        except Exception as e:  # the lodge says why (engine missing...)
            raise HTTPException(502, f"the lodge said no: {e}")
        session = res.get("name")
    else:
        session = f"{name}-mock"
    with lock:
        s["player"], s["wolt"] = player, {"name": name, "creature": c.creature, "harness": harness, "model": model, "session": session}
        save_slots()
    record({"type": "join", "slot": sid, "player": player, "wolt": name, "creature": c.creature, "harness": harness})
    host = slots["host"]["wolt"]
    if MODE == "lodge" and host.get("session"):
        # An automatic note from the show app (not a human): the host welcomes the new wolt itself.
        note = (f"[lodge-show app, automatic] {player} just created {name} ({c.creature}, {harness}, session {session}). "
                f"It owns {PART_OF[sid]}, the {SIDE_OF[sid]} section of the page (it already knows). "
                + (f"Welcome @{name} in #lodge in one line (see SHOW.md).\n{post_how('host')}" if WORLD else "Welcome it over IWCL (see SHOW.md)."))
        threading.Thread(target=driver.deliver, args=(host["session"], note), daemon=True).start()
    return {"ok": True}


# Live typing: what each person is typing right now (from their phone, every ~0.3 s), shown at the bottom of their
# wolt's terminal on the big screen. Never sent to a wolt: only the finished message is. Drafts vanish after 6 s.
drafts: dict[str, tuple[str, float]] = {}


class Draft(BaseModel):
    text: str = Field(max_length=280)


@app.post("/api/p/{token}/draft")
def draft(token: str, d: Draft, request: Request):
    sid, s = owner(request, token)
    if not s["wolt"]:
        return {"ok": True}
    drafts[sid] = (" ".join(d.text.split()), time.time())
    return {"ok": True}


def live_drafts() -> dict:
    now = time.time()
    return {k: t for k, (t, at) in drafts.items() if t and now - at < 6}


class Say(BaseModel):
    text: str = Field(min_length=1, max_length=2000)


@app.post("/api/p/{token}/say")
def say(token: str, m: Say, request: Request):
    sid, s = owner(request, token)
    open_for(sid)
    if not s["wolt"]:
        raise HTTPException(400, "create your wolt first")
    text = " ".join(m.text.split())[:SAY_MAX]
    wait = COOLDOWN - (time.time() - last_say.get(sid, 0))
    if wait > 0:
        raise HTTPException(429, f"wait {int(wait) + 1}s")
    last_say[sid] = time.time()
    drafts.pop(sid, None)
    ev = record({"type": "say", "slot": sid, "from": s["player"], "to": s["wolt"]["name"], "text": text})
    if WORLD:
        if game_on and turn["sid"] == sid and not turn["spoke_at"]:
            turn["spoke_at"] = ev["ts"]
        role = "the host, on stage" if sid == "host" else f"player of {s['wolt']['name']}"
        broadcast(sid, f"{s['player']} ({role}) says:", text,
                  "This is YOUR human. Act on it in your part of the page, then post one short line to #lodge.",
                  "Not your human: read it. Act only if it touches your part or @mentions you, otherwise don't post.",
                  skip_self=False)
    elif MODE == "lodge" and s["wolt"]["session"]:
        # Shown on the crowd screen first, then pasted into the wolt's terminal.
        d = f"SHOW_{secrets.token_hex(6).upper()}"
        body = (f"[message from {s['player']}, your player on stage]\n{text}\n"
                f"Reply to {s['player']} on their phone by replacing YOUR_REPLY, then run it:\n{REPLY_CMD} {sid} <<'{d}'\nYOUR_REPLY\n{d}")
        threading.Thread(target=driver.deliver, args=(s["wolt"]["session"], body), daemon=True).start()
    return {"ok": True, "seq": ev["seq"]}


@app.post("/api/p/{token}/start")
def host_start(token: str, request: Request):
    """The host's phone: ▶ Start the game."""
    sid, s = owner(request, token)
    if sid != "host":
        raise HTTPException(403, "only the host starts the game")
    return {"ok": True, "started": start_game("host phone"), "game": game_on}


@app.post("/api/p/{token}/skip")
def host_skip(token: str, request: Request):
    """The host's phone: ⏭ skip whoever's turn it is."""
    sid, s = owner(request, token)
    if sid != "host":
        raise HTTPException(403, "only the host skips")
    return skip_turn("host phone")


@app.post("/api/admin/turn/skip")
def admin_skip(request: Request):
    admin(request)
    return skip_turn("backstage")


@app.post("/api/admin/game/start")
def admin_start(request: Request):
    """Backstage, or Shift+G on the big screen."""
    admin(request)
    return {"ok": True, "started": start_game("backstage"), "game": game_on}


class Reply(BaseModel):
    slot: str
    text: str = Field(min_length=1, max_length=4000)


@app.post("/api/reply")
def reply(r: Reply, request: Request):
    # Called from inside the lodge only (show-reply CLI), never from phones. The tunnel also arrives on
    # 127.0.0.1, so a loopback address alone proves nothing: no Cloudflare header + the reply key.
    key = request.headers.get("x-reply-key") or ""
    if request.headers.get("cf-connecting-ip") or not secrets.compare_digest(key, REPLY_KEY):
        raise HTTPException(403, "lodge only")
    s = slots.get(r.slot)
    if not s or not s["wolt"]:
        raise HTTPException(404, "no such player")
    record({"type": "reply", "from": s["wolt"]["name"], "to": s["player"], "to_slot": r.slot, "text": r.text[:600]})
    return {"ok": True}


class Post(BaseModel):
    slot: str
    text: str = Field(min_length=1, max_length=1200)


@app.post("/api/post")
def post(r: Post, request: Request):
    """A wolt posts to #lodge (show-post CLI, lodge only like show-reply). Everyone sees it; the other wolts get it."""
    key = request.headers.get("x-reply-key") or ""
    if request.headers.get("cf-connecting-ip") or not secrets.compare_digest(key, REPLY_KEY):
        raise HTTPException(403, "lodge only")
    s = slots.get(r.slot)
    if not s or not s["wolt"]:
        raise HTTPException(404, "no such wolt")
    text = r.text.strip()[:600]
    ev = record({"type": "post", "slot": r.slot, "from": s["wolt"]["name"], "text": text})
    if r.slot == "host" and "✓ shipped" in text and not any(e["type"] == "ship" for e in events):
        humans = 1 + sum(1 for k, x in slots.items() if k != "host" and x["wolt"])
        record({"type": "ship", "text": f"{humans} humans · {humans} wolts · one page"})
    _room["body"] = None
    broadcast(r.slot, f"{s['wolt']['name']} (wolt of {s['player']}) posted:", text, "",
              "If it @mentions you, act and answer with a post. Otherwise just read it: no reply, no ack.", skip_self=True)
    return {"ok": True, "seq": ev["seq"]}


def part_path(sid: str) -> Path | None:
    s = slots.get(sid)
    if sid == "host":
        return LIVE / PART_OF["host"]
    if not s or not s["wolt"]:
        return None
    from show_scaffold import slug
    return Path(_wolts_dir) / slug(s["wolt"]["name"]) / "wolt" / "site" / PART_OF[sid]


def read_parts() -> dict:
    """Each box of the live page: who owns it, its HTML and its version (the file's mtime, 0 = not written yet)."""
    out = {}
    for sid in ("host", "p1", "p2"):
        s, path, html, v = slots.get(sid) or {}, part_path(sid), "", 0
        if path and path.is_file():
            try:
                st = path.stat()
                v = st.st_mtime_ns // 1_000_000
                html = path.read_bytes()[:PART_MAX].decode("utf-8", "replace")
            except OSError:
                pass
        w = (s or {}).get("wolt") or {}
        out[sid] = {"file": PART_OF[sid], "wolt": w.get("name"), "creature": w.get("creature"), "harness": w.get("harness"),
                    "model": w.get("model", ""), "player": (s or {}).get("player"), "html": html, "v": v}
    return out


ship_lock = threading.Lock()


def check_ship(parts: dict | None = None) -> int:
    """The build's version (0: nothing written yet). The host writing the header is the ship moment."""
    if MODE != "lodge":
        return 0
    parts = parts or read_parts()
    build = max(p["v"] for p in parts.values())
    if WORLD:  # the shared world: the header is written early (the plan); the host's "✓ shipped" post is the ship
        return build
    with ship_lock:  # the crowd screen and the room both ask: one ship event only
        if not parts["host"]["v"] or any(e["type"] == "ship" for e in events):
            return build
        humans = 1 + sum(1 for x in slots.values() if x["wolt"] and x is not slots["host"])
        record({"type": "ship", "text": f"{humans} humans · {humans} wolts · 0 copy-paste"})
    return build


def recorder() -> None:
    """Once a second: new IWCL rows, changed boxes, changed terminal screens and the cast go into the show log."""
    seen_iwcl, seen_v, seen_term, seen_cast = 0, {}, {}, None
    while True:
        if _recorder["reset"]:  # a reset started a new show log
            _recorder["reset"] = False
            seen_iwcl, seen_v, seen_term, seen_cast = 0, {}, {}, None
        try:
            rows = feed.poll() if feed else []
            if len(rows) < seen_iwcl:
                seen_iwcl = 0  # a reset started a new feed
            for r in rows[seen_iwcl:]:
                showlog("iwcl", row=r)
            seen_iwcl = len(rows)
            for sid, part in read_parts().items():
                if part["v"] and part["v"] != seen_v.get(sid):
                    seen_v[sid] = part["v"]
                    showlog("part", slot=sid, **{k: v for k, v in part.items() if k != "v"})
            for x in list(slots.values()):
                w = x.get("wolt") or {}
                if w.get("session"):
                    screen = driver.capture(w["session"])
                    if screen != seen_term.get(w["name"]):
                        seen_term[w["name"]] = screen
                        showlog("term", wolt=w["name"], lines=screen.rstrip("\n").splitlines()[-40:])
            cast = [c for c in public_slots() if c["wolt"]]
            if cast != seen_cast:
                seen_cast = cast
                showlog("cast", cast=cast)
        except Exception as e:
            print(f"recorder: {e}")
        time.sleep(1)


_recorder = {"reset": False}
if MODE == "lodge":
    threading.Thread(target=recorder, daemon=True).start()


_parts = {"at": 0.0, "body": None}


@app.get("/api/parts")
def parts_api():
    """Public, like the page itself: the stage polls it. Read from disk at most once a second for everyone."""
    if MODE == "replay":
        return JSONResponse({"parts": driver.parts(None), "phase": driver.phase(None)},
                            headers={"Cache-Control": "no-store", "Access-Control-Allow-Origin": "*"})
    if _parts["body"] is None or time.time() - _parts["at"] >= 1.0:
        parts = read_parts()
        check_ship(parts)
        _parts.update(at=time.time(), body={"parts": parts, "phase": phase})
    return JSONResponse(_parts["body"], headers={"Cache-Control": "no-store", "Access-Control-Allow-Origin": "*"})


@app.get("/stage")
def stage_page():
    return FileResponse(HERE / "static" / "stage.html")


@app.get("/api/crowd")
def crowd(request: Request, after: int = 0):
    admin(request)
    if MODE == "replay":
        t = mock_t(request)
        return JSONResponse({"events": driver.events(t), "terms": driver.terms(t), "typing": [], "busy": driver.busy(t),
                             "build": driver.build(t), "cast": driver.cast(t), "mode": MODE, "phase": driver.phase(t)},
                            headers={"Cache-Control": "no-store"})
    if MODE == "mock":
        t = mock_t(request)
        evs = driver.events(t)
        terms = driver.terms(t)
        typing = driver.typing(t)
        build = driver.build(t)
        cast = driver.scn["cast"]
    else:
        build = check_ship()
        evs = sorted([dict(e, seq=f"a{e['seq']}") for e in events] + feed.poll(), key=lambda e: e["ts"])
        terms, typing = {}, []
        for s in slots.values():
            if s["wolt"] and s["wolt"].get("session"):
                screen = driver.capture(s["wolt"]["session"])
                terms[s["wolt"]["name"]] = screen.rstrip("\n").splitlines()
                if busy(s["wolt"]["name"], screen):
                    typing.append(s["wolt"]["name"])
        cast = public_slots()
        return JSONResponse({"events": evs, "terms": terms, "typing": [], "busy": typing,
                             "build": build, "cast": cast, "mode": MODE, "phase": phase,
                             "voting": shipped(evs), "votes": tally(), **clock(), **turn_state(), "world": WORLD, "drafts": live_drafts()}, headers={"Cache-Control": "no-store"})
    return JSONResponse({"events": [e for e in evs if e["seq"] > after], "terms": terms, "typing": typing,
                         "build": build, "cast": cast, "mode": MODE, "phase": phase,
                         "voting": shipped(evs), "votes": tally(), **clock(), **turn_state(), "world": WORLD, "drafts": live_drafts()}, headers={"Cache-Control": "no-store"})


# The room: the public page everyone in the audience opens (short link on the big screen). The chat and
# the build only: no terminals, no tokens, no keys. One answer per second, shared by every phone.
ROOM_TYPES = {"host", "join", "add", "say", "iwcl", "reply", "ship", "post", "turn", "game"}
_room = {"at": 0.0, "body": None}


@app.get("/api/room")
def room(request: Request):
    t = mock_t(request)
    if t is None and _room["body"] is not None and time.time() - _room["at"] < 1.0:
        return JSONResponse(_room["body"], headers={"Cache-Control": "no-store"})
    if MODE == "mock":
        evs, build, cast, typing = driver.events(t), driver.build(t), driver.scn["cast"], driver.typing(t)
        joined = {e["slot"] for e in evs if e["type"] == "join"} | ({"host"} if any(e["type"] == "host" for e in evs) else set())
        cast = [{"slot": c["slot"], "player": c["player"], "wolt": c["wolt"]["name"] if isinstance(c["wolt"], dict) else c["wolt"],
                 "creature": c.get("creature") or c["wolt"].get("creature"), "harness": c.get("harness") or c["wolt"].get("harness")}
                for c in cast if c.get("wolt") and c["slot"] in joined]
        busy_now = typing
    elif MODE == "replay":
        evs, build, cast, busy_now = driver.events(t), driver.build(t), driver.cast(t), driver.busy(t)
    else:
        build = check_ship()
        with lock:
            evs = sorted([dict(e, seq=f"a{e['seq']}") for e in events] + feed.poll(), key=lambda e: e["ts"])
        cast = [c for c in public_slots() if c["wolt"]]
        busy_now = []
    body = {"events": [{k: e.get(k) for k in ("seq", "type", "slot", "from", "to", "player", "wolt", "creature", "text")}
                       for e in evs if e.get("type") in ROOM_TYPES][-80:],
            "cast": cast, "busy": busy_now, "build": build, "mode": MODE, "phase": driver.phase(t) if MODE == "replay" else phase,
            "voting": shipped(evs) and MODE != "replay", "votes": tally()}
    if t is None:
        _room.update(at=time.time(), body=body)
    return JSONResponse(body, headers={"Cache-Control": "no-store"})


class Vote(BaseModel):
    side: str = Field(pattern="^p[12]$")


@app.post("/api/vote")
def vote(v: Vote, request: Request):
    """One vote per phone (a random cookie), changeable until the end. Open once the page has shipped."""
    if MODE == "replay":
        raise HTTPException(403, "voting is closed")
    with lock:
        evs = list(events) if MODE == "lodge" else driver.events(None)
    if not shipped(evs):
        raise HTTPException(423, "voting opens when both games ship")
    voter = request.cookies.get("voter") or secrets.token_urlsafe(12)
    with vote_lock:
        votes[voter[:40]] = v.side
        VOTES_FILE.write_text(json.dumps(votes))
    _room["body"] = None
    res = JSONResponse({"ok": True, "side": v.side, "votes": tally()})
    res.set_cookie("voter", voter[:40], max_age=86400, httponly=True, samesite="lax")
    return res


@app.get("/")
def room_page():
    return FileResponse(HERE / "static" / "room.html")


@app.get("/api/admin")
def admin_state(request: Request):
    admin(request)
    return {"slots": [{"slot": sid, "label": s["label"], "token": s["token"], "claimed": bool(s["claimed"]),
                       "player": s["player"], "wolt": s["wolt"] and s["wolt"]["name"]} for sid, s in slots.items()],
            "mode": MODE, "phase": phase, "game": game_on}


@app.post("/api/admin/reset/{sid}")
def reset_slot(sid: str, request: Request):
    """New token for a slot (a photographed QR stops working). Keeps an existing wolt unless the slot is a player's."""
    admin(request)
    if sid not in slots:
        raise HTTPException(404, "no such slot")
    with lock:
        s = slots[sid]
        s["token"], s["claimed"] = secrets.token_urlsafe(9), None
        if sid != "host":
            s["player"], s["wolt"] = None, None
        save_slots()
    record({"type": "reset", "slot": sid})
    return {"ok": True}


@app.post("/api/admin/phase/{p}")
def change_phase(p: str, request: Request):
    """Start (live) and Stop (paused) from backstage."""
    admin(request)
    if p not in ("live", "paused"):
        raise HTTPException(400, "live or paused")
    if MODE == "mock" and p == "live" and phase == "ready":
        driver.t0 = time.time()  # the recorded show starts from the top
    set_phase(p)
    _room["body"] = None
    return {"ok": True, "phase": phase}


@app.post("/api/admin/reset-all")
def reset_all(request: Request, host_player: str = ""):
    """Reset the whole show: every session stopped, the players' wolts deleted, the chat and the page cleared, new
    QR codes, a fresh host. Only on a throwaway lodge (lodge/start.sh marks it), never on a real one.
    ?host_player=... names the host slot for a dry run (a tester, never jerpint); without it, the default."""
    global feed, HOST_PLAYER, game_on, game_at
    admin(request)
    host_player = " ".join(host_player.split())[:40]
    if host_player.lower() == "jerpint":
        raise HTTPException(400, "dry runs use a tester name, never jerpint's")
    wolts = Path(_wolts_dir).resolve()
    if MODE == "lodge":
        if not (wolts.parent / ".lodge-show-throwaway").exists() or wolts == (Path.home() / ".woltspace" / "wolts").resolve():
            raise HTTPException(409, f"{wolts} is not a throwaway lodge, reset refused")
        with urllib.request.urlopen(LODGE + "/sessions", timeout=10) as r:
            running = [x["name"] for x in json.loads(r.read()) if x.get("status") == "running"]
        for name in running:
            try:
                driver.post(f"/sessions/{name}/stop", {})
            except Exception as e:
                print(f"stop {name}: {e}")
        import shutil
        # Only wolt folders go (a folder with wolt/ inside). Never apps/ (this app runs from there in the show
        # container), dot-folders (.space, .state, .codex), .env or the lodge's own settings.
        wolt_dirs = [c for c in wolts.iterdir() if c.is_dir() and not c.is_symlink() and not c.name.startswith(".")
                     and c.name != "apps" and (c / "wolt").is_dir()]
        for child in wolt_dirs:
            try:
                driver.post("/auto-grants/revoke", {"wolt": child.name})
            except Exception as e:
                print(f"revoke {child.name}: {e}")
        for child in wolt_dirs:
            shutil.rmtree(child)
        IWCL_LOG.unlink(missing_ok=True)
    if SHOW_LOG.exists():  # keep the last show's log for replays: data/shows/<time>.jsonl
        (DATA / "shows").mkdir(exist_ok=True)
        SHOW_LOG.rename(DATA / "shows" / time.strftime("%m%d-%H%M%S.jsonl"))
    _recorder["reset"] = True
    HOST_PLAYER = host_player or HOST_PLAYER_DEFAULT
    _host_file.write_text(HOST_PLAYER)
    with lock:
        LOG.write_text("")
        events.clear()
        last_say.clear()
        with vote_lock:
            votes.clear()
            VOTES_FILE.unlink(missing_ok=True)
        game_on, game_at = False, None
        GAME_FILE.unlink(missing_ok=True)
        turn.update(sid="host", spoke_at=None, since=time.time())
        if _clock["timer"]:
            _clock["timer"].cancel()
        _screens.clear()
        slots.clear()
        slots.update(default_slots())
        save_slots()
    _room["body"] = None
    if LIVE.exists() and MODE == "lodge":
        import shutil
        shutil.rmtree(LIVE, ignore_errors=True)
    set_phase("ready")
    if MODE == "lodge":
        feed = Feed(IWCL_LOG)
        feed.since = time.time()
        env = dict(os.environ, SHOW_LIVE=str(LIVE), SHOW_REPLY_CMD=REPLY_CMD, SHOW_HOST_PLAYER=HOST_PLAYER)
        out = subprocess.run([sys.executable, str(HERE / "setup_host.py"), "--lodge", LODGE, "--wolts", str(wolts),
                              "--name", HOST, "--model", MODEL], env=env, capture_output=True, text=True, timeout=180)
        if out.returncode != 0:
            raise HTTPException(502, f"the host didn't start: {(out.stderr or out.stdout).strip()[-300:]}")
        LIVE.mkdir(parents=True, exist_ok=True)
        host = slots["host"]["wolt"]
        host["session"] = driver.running_session(HOST)
        save_slots()
        record({"type": "host", "slot": "host", "wolt": HOST})
    else:
        driver.t0 = time.time()
    return {"ok": True}


@app.post("/api/mock/start")
def mock_start(request: Request):
    admin(request)
    if MODE not in ("mock", "replay"):
        raise HTTPException(400, "not in mock or replay mode")
    driver.t0 = time.time()
    return {"ok": True}


@app.get("/world")
def world_page(request: Request):
    """The big screen for the shared world: #lodge chat, the woltPhone, three terminals, turns, the clock."""
    admin(request)
    return FileResponse(HERE / "static" / "world.html")


@app.get("/lanes")
def lanes_page(request: Request):
    """The big screen as two lanes (one per player: chat, terminal, game). /crowd is the earlier single-chat screen."""
    admin(request)
    return FileResponse(HERE / "static" / "lanes.html")


@app.get("/crowd")
def crowd_page(request: Request):
    admin(request)
    return FileResponse(HERE / "static" / "crowd.html")


@app.get("/admin")
def admin_page(request: Request):
    admin(request)
    return FileResponse(HERE / "static" / "admin.html")

app.mount("/static", StaticFiles(directory=HERE / "static"), name="static")
app.mount("/live", StaticFiles(directory=LIVE, html=True), name="live")

if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("SHOW_PORT", 4060))
    print(f"mode {MODE} · admin key in {_key_file}" if "SHOW_ADMIN_KEY" not in os.environ else f"mode {MODE}")
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="warning", proxy_headers=True)
