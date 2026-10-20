"""Pre-baked wolts for the show: the folder exists, curated, BEFORE the session boots, so the very first thing a wolt
reads is who its human is tonight and the show rules (jerpint's call, 2026-10-17). Used by app.py (players) and setup_host.py (host)."""
import json
import os
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


def container_claude_config(folder: Path) -> None:
    """In the woltspace container each wolt's HOME is its own folder, so Claude reads <wolt>/.claude.json. A wolt the
    lodge creates gets one from setup_wolt_claude_config (woltspace _bundle/container/lib/wolts.py); our pre-baked
    folders skip that step, so Claude would open on its first-run screens. Same file, same keys, written the same
    way: a copy of the global ~/.claude.json plus folder trust and the headless flags. Container only (native
    lodges use the owner's own Claude config)."""
    if os.environ.get("WOLTSPACE_ISOLATION", "external") == "host" or not str(folder.resolve()).startswith("/workspace/wolts/"):
        return
    cfg = folder / ".claude.json"
    if cfg.exists():
        return
    glob = Path.home() / ".claude.json"
    data = json.loads(glob.read_text()) if glob.exists() else {}
    trust = {"hasTrustDialogAccepted": True, "hasCompletedProjectOnboarding": True}
    projects = data.get("projects", {})
    projects[str(folder)] = trust
    projects[str(folder / "wolt")] = trust
    data.update(projects=projects, autoUpdates=False, hasCompletedOnboarding=True, bypassPermissionsAccepted=True)
    cfg.write_text(json.dumps(data, indent=2) + "\n")


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
    # SHOW_WORLD=1 (default): the shared-world show (one page, one #lodge chat, turns); 0: the side-by-side boxes.
    brief = SEED / role / ("SHOW-world.md" if os.environ.get("SHOW_WORLD", "1") == "1" else "SHOW.md")
    (folder / "SHOW.md").write_text(fill(brief.read_text()))
    if role == "host":
        shutil.copy(SEED / "host" / "TMUX-POST.md", folder / "TMUX-POST.md")
    (folder / "wolt" / "site").mkdir(parents=True, exist_ok=True)
    container_claude_config(folder)
    if role == "player":  # players race on low effort (SHOW_EFFORT): quick small saves beat long thinking on stage
        effort = os.environ.get("SHOW_EFFORT", "low")
        (folder / ".claude").mkdir(exist_ok=True)
        cs = folder / ".claude" / "settings.json"
        cfg = json.loads(cs.read_text()) if cs.exists() else {}
        cs.write_text(json.dumps({**cfg, "effortLevel": effort}, indent=2) + "\n")
        (folder / ".codex").mkdir(exist_ok=True)
        cx = folder / ".codex" / "config.toml"  # a top-level key, above any [table] the lodge adds later
        rest = [l for l in (cx.read_text().splitlines() if cx.exists() else []) if not l.startswith("model_reasoning_effort")]
        cx.write_text("\n".join([f'model_reasoning_effort = "{effort}"', *rest]) + "\n")
    return folder
