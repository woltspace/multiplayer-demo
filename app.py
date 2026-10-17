# /// script
# requires-python = ">=3.11"
# dependencies = ["fastapi", "uvicorn"]
# ///
"""Lodge Show: multiplayer, multi-agent, live on stage (AI Tinkerers Montreal, 2026-10-22).

Players:  GET /p/<token>     claim the slot, name + create your wolt, then type to it
Crowd:    GET /crowd?k=KEY   full screen: #lodge chat + every wolt's terminal, live
Admin:    GET /admin?k=KEY   the private QR per slot, reset a slot

The host wolt (curated commie) already exists and runs the show; players create theirs live.
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
HOST = os.environ.get("SHOW_HOST_WOLT", "commie")
HOST_PLAYER = os.environ.get("SHOW_HOST_PLAYER", "jerpint")  # tests use an honest tester name, never jerpint's
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
                 "wolt": {"name": HOST, "creature": "raccoon", "harness": HARNESS, "session": None}},
    }


slots = json.loads(SLOTS.read_text()) if SLOTS.exists() else default_slots()


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


class LodgeDriver:
    """Drives the real lodge (inside the throwaway container). Players' words go in as plain pastes."""

    def post(self, path: str, body: dict) -> dict:
        req = urllib.request.Request(LODGE + path, json.dumps(body).encode(), {"content-type": "application/json"})
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read() or b"{}")

    def create(self, name: str, creature: str, player: str) -> dict:
        """Pre-baked: write the curated wolt folder first, then boot its first session on it."""
        from show_scaffold import scaffold, slug
        scaffold(Path(_wolts_dir), name, creature, HARNESS, MODEL, "player",
                 {"PLAYER": player, "HOST_PLAYER": HOST_PLAYER, "LIVE": str(LIVE), "REPLY": REPLY_CMD, "WOLTS": _wolts_dir})
        return self.post("/sessions/new/lodge", {"wolt": slug(name), "creature": creature})

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


driver = MockDriver() if MODE == "mock" else LodgeDriver()

# The lodge's IWCL log (woltspace 0.5.20+): one line per wolt-to-wolt message or spawn.
_wolts_dir = os.environ.get("WOLTSPACE_WOLTS_DIR") or str(Path.home() / ".woltspace" / "wolts")
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
    return float(t) if t and MODE == "mock" else None


def public_slots() -> list[dict]:
    return [{"slot": sid, "label": s["label"], "player": s["player"], "wolt": s["wolt"] and s["wolt"]["name"],
             "creature": s["wolt"] and s["wolt"]["creature"], "harness": s["wolt"] and s["wolt"]["harness"]}
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
        return {"slot": sid, "label": s["label"], "player": player, "wolt": wolt, "messages": [e for e in mine if e["type"] in ("say", "reply")]}
    mine = [e for e in events if e.get("slot") == sid or e.get("to_slot") == sid]
    return {"slot": sid, "label": s["label"], "player": s["player"], "wolt": s["wolt"], "messages": [e for e in mine if e["type"] in ("say", "reply")]}


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
    if MODE == "lodge":
        try:
            res = driver.create(name, c.creature, player)
        except FileExistsError as e:
            raise HTTPException(409, str(e))
        except Exception as e:  # the lodge says why (engine missing...)
            raise HTTPException(502, f"the lodge said no: {e}")
        session = res.get("name")
    else:
        session = f"{name}-mock"
    with lock:
        s["player"], s["wolt"] = player, {"name": name, "creature": c.creature, "harness": HARNESS, "session": session}
        save_slots()
    record({"type": "join", "slot": sid, "player": player, "wolt": name, "creature": c.creature, "harness": HARNESS})
    host = slots["host"]["wolt"]
    if MODE == "lodge" and host.get("session"):
        # An automatic note from the show app (not a human): the host welcomes the new wolt itself.
        note = (f"[lodge-show app, automatic] {player} just created {name} ({c.creature}, session {session}). "
                f"Welcome it over IWCL and give it its part (see SHOW.md).")
        threading.Thread(target=driver.deliver, args=(host["session"], note), daemon=True).start()
    return {"ok": True}


class Say(BaseModel):
    text: str = Field(min_length=1, max_length=2000)


@app.post("/api/p/{token}/say")
def say(token: str, m: Say, request: Request):
    sid, s = owner(request, token)
    if not s["wolt"]:
        raise HTTPException(400, "create your wolt first")
    text = " ".join(m.text.split())[:SAY_MAX]
    wait = COOLDOWN - (time.time() - last_say.get(sid, 0))
    if wait > 0:
        raise HTTPException(429, f"wait {int(wait) + 1}s")
    last_say[sid] = time.time()
    ev = record({"type": "say", "slot": sid, "from": s["player"], "to": s["wolt"]["name"], "text": text})
    if MODE == "lodge" and s["wolt"]["session"]:
        # Shown on the crowd screen first, then pasted into the wolt's terminal.
        d = f"SHOW_{secrets.token_hex(6).upper()}"
        body = (f"[message from {s['player']}, your player on stage]\n{text}\n"
                f"Reply to {s['player']} on their phone by replacing YOUR_REPLY, then run it:\n{REPLY_CMD} {sid} <<'{d}'\nYOUR_REPLY\n{d}")
        threading.Thread(target=driver.deliver, args=(s["wolt"]["session"], body), daemon=True).start()
    return {"ok": True, "seq": ev["seq"]}


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


@app.get("/api/crowd")
def crowd(request: Request, after: int = 0):
    admin(request)
    if MODE == "mock":
        t = mock_t(request)
        evs = driver.events(t)
        terms = driver.terms(t)
        typing = driver.typing(t)
        build = driver.build(t)
        cast = driver.scn["cast"]
    else:
        build = (LIVE / "index.html").stat().st_mtime_ns // 1_000_000 if (LIVE / "index.html").exists() else 0
        if build and not any(e["type"] == "ship" for e in events):  # the host wrote the page: that's the ship moment
            humans = 1 + sum(1 for x in slots.values() if x["wolt"] and x is not slots["host"])
            record({"type": "ship", "text": f"{humans} humans · {humans} wolts · 0 copy-paste"})
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
                             "build": build, "cast": cast, "mode": MODE}, headers={"Cache-Control": "no-store"})
    return JSONResponse({"events": [e for e in evs if e["seq"] > after], "terms": terms, "typing": typing,
                         "build": build, "cast": cast, "mode": MODE}, headers={"Cache-Control": "no-store"})


@app.get("/api/admin")
def admin_state(request: Request):
    admin(request)
    return {"slots": [{"slot": sid, "label": s["label"], "token": s["token"], "claimed": bool(s["claimed"]),
                       "player": s["player"], "wolt": s["wolt"] and s["wolt"]["name"]} for sid, s in slots.items()],
            "mode": MODE}


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


@app.post("/api/mock/start")
def mock_start(request: Request):
    admin(request)
    if MODE != "mock":
        raise HTTPException(400, "not in mock mode")
    driver.t0 = time.time()
    return {"ok": True}


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
