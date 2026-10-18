"""Render a show's video from its show log: the recording is made from the raw steps, never captured live.

  uv run --with playwright python render.py runs/<run>/show.jsonl            # -> runs/<run>/show.mp4 (big screen)
  uv run --with playwright python render.py <show.jsonl> --view stage        # the live page only
  uv run --with playwright python render.py <show.jsonl> --speed 2           # twice as fast

Starts a second copy of the app in replay mode on its own port and data folder, plays the log from the top on the
app's clock, takes frames of the big screen (or the stage) and stitches them with ffmpeg. Needs ffmpeg on PATH.
"""
import argparse, json, os, shutil, subprocess, sys, tempfile, time, urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

HERE = Path(__file__).parent
ap = argparse.ArgumentParser()
ap.add_argument("log")
ap.add_argument("--view", choices=["crowd", "stage"], default="crowd")
ap.add_argument("--out")
ap.add_argument("--port", type=int, default=4071)
ap.add_argument("--speed", type=float, default=1.0)
a = ap.parse_args()
log = Path(a.log).resolve()
rows = [json.loads(l) for l in log.read_text().splitlines() if l.strip()]
if not rows:
    sys.exit(f"{log} is empty")
length = rows[-1]["ts"] - rows[0]["ts"] + 4
out = Path(a.out or log.with_name(f"show-{a.view}.mp4")).resolve()

tmp = Path(tempfile.mkdtemp(prefix="show-render-"))
env = dict(os.environ, SHOW_MODE="replay", SHOW_REPLAY=str(log), SHOW_PORT=str(a.port), SHOW_DATA=str(tmp / "data"),
           SHOW_LIVE=str(tmp / "live"), SHOW_ADMIN_KEY="render")
app = subprocess.Popen(["uv", "run", str(HERE / "app.py")], cwd=HERE, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT)
base = f"http://127.0.0.1:{a.port}"
try:
    for _ in range(60):
        try:
            urllib.request.urlopen(base + "/api/room", timeout=1); break
        except Exception:
            time.sleep(0.5)
    frames = tmp / "frames"; frames.mkdir()
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=os.environ.get("SHOW_CHROME"))
        size = {"width": 1920, "height": 1080} if a.view == "crowd" else {"width": 1280, "height": 720}
        pg = b.new_context(viewport=size).new_page()
        pg.goto(f"{base}/crowd?k=render" if a.view == "crowd" else f"{base}/stage")
        urllib.request.urlopen(urllib.request.Request(base + "/api/mock/start", method="POST", headers={"X-Admin-Key": "render"}))
        t0, ts, i = time.time(), [], 0
        while time.time() - t0 < length:
            pg.screenshot(path=str(frames / f"f{i:05d}.jpg"), type="jpeg", quality=82)
            ts.append(time.time() - t0); i += 1
        b.close()
    with open(frames / "list.txt", "w") as f:
        for k in range(i):
            f.write(f"file 'f{k:05d}.jpg'\nduration {((ts[k + 1] - ts[k]) if k + 1 < i else 0.2) / a.speed:.4f}\n")
        f.write(f"file 'f{i - 1:05d}.jpg'\n")
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", str(frames / "list.txt"),
                    "-vf", "fps=25,format=yuv420p", "-c:v", "libx264", "-crf", "23", "-movflags", "+faststart", str(out)], check=True)
    print(f"{out} · {i} frames · {length:.0f} s of show")
finally:
    app.terminate()
    shutil.rmtree(tmp, ignore_errors=True)
