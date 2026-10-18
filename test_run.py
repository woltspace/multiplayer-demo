"""End to end show test against the throwaway lodge: host brief, 2 test players create wolts and type, crowd screenshots every 10 s.
Names are honest test names (never jerpint's). Usage: uv run --with playwright python test_run.py shots-real 240"""
import json, os, sys, time
from pathlib import Path
from playwright.sync_api import sync_playwright
BASE = "http://127.0.0.1:4060"; KEY = Path("data/admin.key").read_text().strip()
slots = json.loads(Path("data/slots.json").read_text())
out = Path(sys.argv[1]); dur = int(sys.argv[2])
EXE = os.environ.get("SHOW_CHROME")  # optional chromium binary; default: playwright's own
log = []; t0 = time.time()
def mark(what): log.append((round(time.time() - t0, 1), what)); print(log[-1], flush=True)
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=EXE)
    crowd = b.new_context(viewport={"width": 1920, "height": 1080}).new_page()
    crowd.goto(f"{BASE}/crowd?k={KEY}")
    phones = {}
    for sid in ("host", "p1", "p2"):
        phones[sid] = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2).new_page()
        phones[sid].goto(f"{BASE}/p/{slots[sid]['token']}"); phones[sid].wait_for_timeout(600)
    def say(sid, text):
        ph = phones[sid]; ph.fill("#say", text); ph.click("#send"); mark(f"{sid} says: {text[:50]}")
    def create(sid, player, wolt, creature):
        ph = phones[sid]; ph.fill("#pn", player); ph.fill("#wn", wolt); ph.click(f".pick button[data-k={creature}]"); ph.click("#go")
        ph.wait_for_selector(".me", timeout=90000); mark(f"{sid} created {wolt}")
    # The host slot is a real person's during rehearsals: a script never types under jerpint's name.
    if slots["host"].get("player") != "jerpint":
        say("host", "test run: two players are joining. build ONE page together, each player owns half. ship it in 3 minutes")
    else:
        mark("host slot is jerpint's: no host message from the script")
    script = [(8, lambda: create("p1", "Tester A", "pebble", "otter")),
              (18, lambda: create("p2", "Tester B", "bolt", "beaver")),
              (30, lambda: say("p1", "rank montreal bagels: st-viateur vs fairmount, with a big vote button")),
              (40, lambda: say("p2", "a tiny game: dodge potholes on a bike with the arrow keys"))]
    next_shot = 0
    while time.time() - t0 < dur:
        el = time.time() - t0
        while script and el >= script[0][0]:
            script.pop(0)[1]()
        if el >= next_shot:
            crowd.screenshot(path=str(out / f"crowd-{int(el):03d}.png")); next_shot += 10
        time.sleep(0.5)
    for sid, ph in phones.items():
        ph.reload(); ph.wait_for_timeout(800); ph.screenshot(path=str(out / f"phone-{sid}.png"), full_page=True)
    crowd.screenshot(path=str(out / "crowd-end.png"))
    b.close()
Path(out / "timeline.json").write_text(json.dumps(log, indent=1))
