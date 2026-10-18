"""Pre-baked wolts for the show: the folder exists, curated, BEFORE the session boots, so the very first thing a wolt
reads is who its human is tonight and the show rules (jerpint's call, 2026-10-17). Used by app.py (players) and setup_host.py (host)."""
import json
import re
import shutil
from pathlib import Path

SEED = Path(__file__).parent / "seed"
LINES = {
    "player": "Messages marked `[message from {PLAYER}, your player on stage]` are from {PLAYER}, your human for tonight "
              "(the lodge-show app types them in for them). Act on them for the page.",
    "host": "Messages marked `[message from {HOST_PLAYER}, your player on stage]` are from {HOST_PLAYER}, your human for tonight "
            "(the lodge-show app types them in for them). `[lodge-show app, automatic]` notes are the app, not a human.",
}


def slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:24]


def scaffold(wolts: Path, name: str, creature: str, harness: str, model: str, role: str, values: dict) -> Path:
    folder = Path(wolts) / slug(name)
    if folder.exists():
        raise FileExistsError(f"a wolt named {slug(name)} already exists")
    v = {"NAME": slug(name), "CREATURE": creature, "HARNESS": harness, "MODEL": model, **values}
    v["HUMAN_LINE"] = LINES[role]

    def fill(text: str) -> str:
        for _ in range(2):  # HUMAN_LINE itself holds placeholders
            for k, val in v.items():
                text = text.replace("{" + k + "}", str(val))
        return text

    shutil.copytree(SEED / "template", folder, symlinks=True)
    (folder / "CLAUDE.md").write_text(fill((folder / "CLAUDE.md").read_text()))
    tmpl = folder / "wolt" / "wolt.json.tmpl"
    data = json.loads(fill(tmpl.read_text()))
    tmpl.unlink()
    if not data.get("model"):  # no model: the harness's own default
        data.pop("model", None)
    (folder / "wolt" / "wolt.json").write_text(json.dumps(data, indent=2) + "\n")
    mem = folder / "wolt" / "memory"
    mem.mkdir(parents=True, exist_ok=True)
    for f in ("identity.md", "context.md", "learnings.md"):
        (mem / f).write_text(fill((SEED / role / f).read_text()))
    (folder / "SHOW.md").write_text(fill((SEED / role / "SHOW.md").read_text()))
    if role == "host":
        shutil.copy(SEED / "host" / "TMUX-POST.md", folder / "TMUX-POST.md")
    (folder / "wolt" / "site").mkdir(parents=True, exist_ok=True)
    return folder
