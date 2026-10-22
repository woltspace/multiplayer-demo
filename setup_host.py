"""Create the curated host wolt in a lodge: pre-baked folder first, then its first session.

SHOW_LIVE=... SHOW_REPLY_CMD=... SHOW_HOST_PLAYER=... uv run python setup_host.py --lodge http://127.0.0.1:47996 --wolts lodge/wolts
"""
import argparse, json, os, time, urllib.request
from pathlib import Path
from show_scaffold import scaffold, slug

ap = argparse.ArgumentParser()
ap.add_argument("--lodge", required=True)
ap.add_argument("--wolts", required=True)
ap.add_argument("--name", default="hostie")
ap.add_argument("--model", default="sonnet")
a = ap.parse_args()
wolts = Path(a.wolts).resolve()
host_player = os.environ.get("SHOW_HOST_PLAYER", "jerpint")
folder = scaffold(wolts, a.name, "raccoon", "claude", a.model, "host", {
    "PLAYER": host_player, "HOST_PLAYER": host_player, "WOLTS": str(wolts),
    "LIVE": os.environ.get("SHOW_LIVE", str(wolts / slug(a.name) / "wolt" / "site" / "show")),
    "REPLY": os.environ.get("SHOW_REPLY_CMD", "show-reply"),
    "POST": os.environ.get("SHOW_POST_CMD", str(Path(__file__).resolve().parent / "bin" / "show-post")), "SLOT": "host",
    "HOST": a.name, "TITLE": os.environ.get("SHOW_TITLE", "Dam Builders")})
t0 = time.time()
req = urllib.request.Request(a.lodge + "/sessions/new/lodge", json.dumps({"wolt": slug(a.name), "creature": "raccoon"}).encode(),
                             {"content-type": "application/json"})
res = json.loads(urllib.request.urlopen(req, timeout=120).read())
print(f"host {a.name}: {folder} · session {res.get('name')} in {time.time() - t0:.1f}s")
