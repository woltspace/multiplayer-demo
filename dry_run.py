"""Dry run: a whole show with no humans, against the throwaway lodge. Real wolts, scripted test players.

Resets the show (host slot named after the scenario's tester, never jerpint), presses Start, drives the real phone
pages on the scenario's clock, and watches the live page. Writes runs/<time>-<name>/: crowd screenshots every 10 s,
the phones at the end, timeline.json and report.md (time to each box's first save, saves per box, ship time, replies).

  uv run --with playwright python dry_run.py scenarios/bagels.json
"""
import json, os, sys, time, urllib.parse, urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = os.environ.get("SHOW_URL", "http://127.0.0.1:4060")
EXE = os.environ.get("SHOW_CHROME")  # optional chromium binary; default: playwright's own
KEY = Path("data/admin.key").read_text().strip()
scn = json.loads(Path(sys.argv[1]).read_text())
if "jerpint" in scn["host"].lower():
    sys.exit("dry runs use a tester name for the host slot, never jerpint's")
out = Path("runs") / f"{time.strftime('%m%d-%H%M')}-{scn['name']}"
out.mkdir(parents=True, exist_ok=True)


def api(path, method="GET"):
    req = urllib.request.Request(BASE + path, method=method, headers={"X-Admin-Key": KEY})
    with urllib.request.urlopen(req, timeout=300) as r:
        return json.loads(r.read())


log, t0 = [], 0.0
def mark(what):
    log.append((round(time.time() - t0, 1), what)); print(log[-1], flush=True)


print("resetting the show…", flush=True)
api("/api/admin/reset-all?host_player=" + urllib.parse.quote(scn["host"]), "POST")
slots = json.loads(Path("data/slots.json").read_text())
api("/api/admin/phase/live", "POST")
t0 = time.time(); mark(f"live · host slot: {scn['host']}")

saves = {sid: [] for sid in ("host", "p1", "p2")}
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=EXE)
    crowd = b.new_context(viewport={"width": 1920, "height": 1080}).new_page()
    crowd.goto(f"{BASE}/crowd?k={KEY}")
    phones = {}
    for sid in ("host", "p1", "p2"):
        phones[sid] = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2).new_page()
        phones[sid].goto(f"{BASE}/p/{slots[sid]['token']}"); phones[sid].wait_for_timeout(500)

    def do(step):
        ph = phones[step["slot"]]
        try:
            if "create" in step:
                c = step["create"]
                ph.fill("#pn", c["player"]); ph.fill("#wn", c["wolt"]); ph.click(f".pick button[data-k={c['creature']}]"); ph.click("#go")
                ph.wait_for_selector(".me", timeout=90000); mark(f"{step['slot']} created {c['wolt']}")
            else:
                ph.fill("#say", step["say"]); ph.click("#send"); mark(f"{step['slot']} says: {step['say'][:60]}")
        except Exception as e:
            mark(f"{step['slot']} FAILED: {str(e).splitlines()[0][:120]}")

    steps, next_shot, last_v = sorted(scn["steps"], key=lambda s: s["t"]), 0, {}
    while time.time() - t0 < scn["duration"]:
        el = time.time() - t0
        while steps and el >= steps[0]["t"]:
            do(steps.pop(0))
        try:
            for sid, part in api("/api/parts")["parts"].items():
                if part["v"] and part["v"] != last_v.get(sid):
                    last_v[sid] = part["v"]; saves[sid].append(round(time.time() - t0, 1))
                    mark(f"{sid} saved {part['file']} ({len(part['html'])} bytes)")
        except Exception as e:
            mark(f"parts check failed: {e}")
        if el >= next_shot:
            crowd.screenshot(path=str(out / f"crowd-{int(el):03d}.png")); next_shot += 10
        time.sleep(1)
    for sid, ph in phones.items():
        ph.reload(); ph.wait_for_timeout(800); ph.screenshot(path=str(out / f"phone-{sid}.png"), full_page=True)
    crowd.screenshot(path=str(out / "crowd-end.png"))
    b.close()

events = [json.loads(l) for l in Path("data/events.jsonl").read_text().splitlines() if l.strip()]
room = api("/api/room")["events"]
ship = next((round(e["ts"] - t0, 1) for e in events if e["type"] == "ship"), None)
replies = [e for e in events if e["type"] == "reply"]
iwcl = [e for e in room if e["type"] == "iwcl"]
report = {"scenario": scn["name"], "host": scn["host"], "duration": scn["duration"], "saves": saves,
          "first_save": {k: (v[0] if v else None) for k, v in saves.items()}, "shipped_at": ship,
          "replies": len(replies), "iwcl": len(iwcl), "timeline": log}
(out / "timeline.json").write_text(json.dumps(report, indent=1))
lines = [f"# Dry run: {scn['name']}", "", f"Host slot: {scn['host']} · {scn['duration']} s · {time.strftime('%Y-%m-%d %H:%M')}", "",
         "| box | first save | saves |", "|---|---|---|"]
for sid, label in (("p1", "Player 1"), ("p2", "Player 2"), ("host", "header (ship)")):
    lines.append(f"| {label} | {report['first_save'][sid] if report['first_save'][sid] is not None else 'never'} s | {len(saves[sid])} |")
lines += ["", f"Shipped: {f'{ship} s' if ship is not None else 'no'} · replies to phones: {len(replies)} · wolt-to-wolt messages: {len(iwcl)}", "",
          "## Replies to phones", *[f"- {e['from']} → {e['to']}: {e['text'][:160]}" for e in replies], "",
          "## Wolt to wolt", *[f"- {e['from']} → {e['to']}: {e['text'][:160]}" for e in iwcl], "",
          "## Timeline", *[f"- {t} s · {w}" for t, w in log]]
(out / "report.md").write_text("\n".join(lines) + "\n")
# The raw steps: the show log this run wrote. render.py makes the video from it.
if Path("data/show.jsonl").exists():
    import shutil
    shutil.copy("data/show.jsonl", out / "show.jsonl")
print(f"\n{out}/report.md\nvideo: uv run --with playwright python render.py {out}/show.jsonl")
