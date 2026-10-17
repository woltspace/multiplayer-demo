"""Mock screenshots of every screen at chosen moments of the mock show. Run with the app in SHOW_MODE=mock on :4060."""
import json, os, sys
from pathlib import Path
from playwright.sync_api import sync_playwright
BASE = "http://127.0.0.1:4060"
KEY = Path("data/admin.key").read_text().strip()
slots = {s["slot"]: s for s in json.loads(Path("data/slots.json").read_text()).values()} if False else json.loads(Path("data/slots.json").read_text())
EXE = os.environ.get("SHOW_CHROME")  # optional chromium binary; default: playwright's own
out = Path(sys.argv[1] if len(sys.argv) > 1 else "shots")
errs = []
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=EXE)
    def page(vp, scale):
        pg = b.new_context(viewport=vp, device_scale_factor=scale).new_page()
        pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
        pg.on("pageerror", lambda e: errs.append(str(e)))
        return pg
    c = page({"width": 1920, "height": 1080}, 1)
    for t in (5, 20, 60, 100, 130):
        c.goto(f"{BASE}/crowd?k={KEY}&t={t}"); c.wait_for_timeout(1200)
        c.screenshot(path=str(out / f"crowd-{t:03d}.png"))
    for sid, ts in (("p1", (5, 45)), ("p2", (70,)), ("host", (10,))):
        ph = page({"width": 390, "height": 844}, 2)
        for t in ts:
            ph.goto(f"{BASE}/p/{slots[sid]['token']}?t={t}"); ph.wait_for_timeout(900)
            if sid == "p1" and t == 5:
                ph.fill("#pn", "Maya"); ph.fill("#wn", "flint"); ph.click(".pick button[data-k=otter]")
            ph.screenshot(path=str(out / f"player-{sid}-{t:03d}.png"))
    other = page({"width": 390, "height": 844}, 2)
    other.goto(f"{BASE}/p/{slots['p1']['token']}"); other.wait_for_timeout(900)
    other.screenshot(path=str(out / "player-taken.png"))
    a = page({"width": 1280, "height": 900}, 1)
    a.goto(f"{BASE}/admin?k={KEY}"); a.wait_for_timeout(1500)
    a.screenshot(path=str(out / "admin.png"), full_page=True)
    b.close()
print("errors:", errs)
