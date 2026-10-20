"""The show's public address on Cloudflare, gated by default, public only while you say so.

    uv run container/public.py setup    # once: owner-only Access apps first, then DNS + the tunnel route
    uv run container/public.py on       # open the room, the seats and the slides to everyone (Access bypass)
    uv run container/public.py off      # back to owner-only (deletes that one bypass policy)
    uv run container/public.py status
    uv run container/public.py down     # remove the route, the DNS record and the Access apps

The host's own tunnel (cloudflared on this Mac) points at the app alone on 127.0.0.1:47992 (container/up.sh
publishes it), never at the lodge. Backstage, the big screen and their APIs keep their own owner-only Access app,
so they stay gated even when the rest is public. Reads CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID from the
lodge's .env (never printed). Settings: SHOW_PUBLIC_HOST (multiplayer.woltspace.app), SHOW_APP_PORT (47992),
SHOW_TUNNEL (woltspace-lodge), SHOW_OWNER_EMAIL (the owner's Access email, required), WOLTSPACE_ENV (~/.woltspace/wolts/.env).
"""
import json
import os
import sys
import time
import urllib.request
from pathlib import Path

HOST = os.environ.get("SHOW_PUBLIC_HOST", "multiplayer.woltspace.app")
APP_PORT = os.environ.get("SHOW_APP_PORT", "47992")
TUNNEL = os.environ.get("SHOW_TUNNEL", "woltspace-lodge")
OWNER = os.environ.get("SHOW_OWNER_EMAIL", "")
ENV = Path(os.environ.get("WOLTSPACE_ENV", Path.home() / ".woltspace/wolts/.env"))
BACKUPS = Path(__file__).parent / ".cf-backups"
ROOT_APP, BACKSTAGE_APP, PUBLIC_POLICY = f"lodge-show {HOST}", f"lodge-show {HOST} backstage", "public-now"
# Owner-only always: backstage, the big screen and what they read or change.
BACKSTAGE = ["admin", "world", "crowd", "lanes", "api/admin", "api/crowd", "api/mock"]


def env(name):
    for line in ENV.read_text().splitlines():
        if line.startswith(name + "="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    sys.exit(f"{name} is not in {ENV}")


TOKEN, ACCOUNT = env("CLOUDFLARE_API_TOKEN"), env("CLOUDFLARE_ACCOUNT_ID")
API = "https://api.cloudflare.com/client/v4"


def cf(method, path, body=None):
    req = urllib.request.Request(API + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req) as r:
            d = json.load(r)
    except urllib.error.HTTPError as e:
        d = json.load(e)
    if not d.get("success"):
        sys.exit(f"Cloudflare said no: {method} {path.split('?')[0]}: {d.get('errors')}")
    return d["result"]


def acct(path):
    return f"/accounts/{ACCOUNT}{path}"


def access_apps():
    return {a["name"]: a for a in cf("GET", acct("/access/apps?per_page=200"))}


def tunnel_id():
    t = cf("GET", acct(f"/cfd_tunnel?name={TUNNEL}&is_deleted=false"))
    if not t:
        sys.exit(f"No tunnel named {TUNNEL}")
    return t[0]["id"]


def zone_id():
    zone = ".".join(HOST.split(".")[-2:])
    z = cf("GET", f"/zones?name={zone}")
    if not z:
        sys.exit(f"No zone {zone}")
    return z[0]["id"]


def owner_policy(app_id):
    cf("POST", acct(f"/access/apps/{app_id}/policies"),
       {"name": "owner", "decision": "allow", "include": [{"email": {"email": OWNER}}], "precedence": 1})


def ensure_app(name, domains):
    apps = access_apps()
    if name in apps:
        return apps[name]
    a = cf("POST", acct("/access/apps"), {"name": name, "type": "self_hosted", "domain": domains[0],
                                          "self_hosted_domains": domains, "session_duration": "24h",
                                          "app_launcher_visible": False})
    owner_policy(a["id"])
    print(f"  Access app '{name}': owner only ({len(domains)} path{'s' * (len(domains) > 1)})")
    return a


def get_ingress(tid):
    return cf("GET", acct(f"/cfd_tunnel/{tid}/configurations"))["config"]


def put_ingress(tid, config, why):
    BACKUPS.mkdir(exist_ok=True)
    before = get_ingress(tid)
    (BACKUPS / f"{time.strftime('%Y%m%d-%H%M%S')}-before-{why}.json").write_text(json.dumps(before, indent=1))
    cf("PUT", acct(f"/cfd_tunnel/{tid}/configurations"), {"config": config})
    after = get_ingress(tid)
    others = lambda c: [r for r in c["ingress"] if r.get("hostname") != HOST]  # noqa: E731
    if others(after) != others(before) or {k: v for k, v in after.items() if k != "ingress"} != \
            {k: v for k, v in before.items() if k != "ingress"}:
        sys.exit("The other routes changed: restore the backup in container/.cf-backups/ now")
    return after


def setup():
    tid = tunnel_id()
    # The lock first: nothing is reachable before both Access apps stand.
    ensure_app(ROOT_APP, [HOST])
    ensure_app(BACKSTAGE_APP, [f"{HOST}/{p}" for p in BACKSTAGE])
    apps = access_apps()
    assert ROOT_APP in apps and BACKSTAGE_APP in apps
    zid = zone_id()
    if not cf("GET", f"/zones/{zid}/dns_records?name={HOST}"):
        cf("POST", f"/zones/{zid}/dns_records", {"type": "CNAME", "name": HOST, "content": f"{tid}.cfargotunnel.com",
                                                 "proxied": True, "comment": "lodge-show (container/public.py)"})
        print(f"  DNS: {HOST} -> tunnel {TUNNEL}")
    config = get_ingress(tid)
    if not any(r.get("hostname") == HOST for r in config["ingress"]):
        rule = {"hostname": HOST, "service": f"http://127.0.0.1:{APP_PORT}", "originRequest": {}}
        config["ingress"].insert(len(config["ingress"]) - 1, rule)  # before the catch-all (first match wins)
        put_ingress(tid, config, "setup")
        print(f"  tunnel route: {HOST} -> 127.0.0.1:{APP_PORT} (other routes unchanged)")
    status()


def on():
    a = access_apps().get(ROOT_APP) or sys.exit("Run setup first")
    if not any(p["name"] == PUBLIC_POLICY for p in a.get("policies", [])):
        cf("POST", acct(f"/access/apps/{a['id']}/policies"),
           {"name": PUBLIC_POLICY, "decision": "bypass", "include": [{"everyone": {}}], "precedence": 2})
    status()


def off():
    a = access_apps().get(ROOT_APP) or sys.exit("Run setup first")
    for p in a.get("policies", []):
        if p["name"] == PUBLIC_POLICY:
            cf("DELETE", acct(f"/access/apps/{a['id']}/policies/{p['id']}"))
    status()


def status():
    apps = access_apps()
    root, back = apps.get(ROOT_APP), apps.get(BACKSTAGE_APP)
    tid = tunnel_id()
    routed = any(r.get("hostname") == HOST for r in get_ingress(tid)["ingress"])
    public = bool(root) and any(p["name"] == PUBLIC_POLICY for p in root.get("policies", []))
    print(f"{HOST}: route {'yes' if routed else 'no'} · Access {'yes' if root else 'NO'} · backstage gated "
          f"{'yes' if back else 'NO'} · {'PUBLIC (room, seats, slides)' if public else 'owner only'}")


def down():
    tid = tunnel_id()
    config = get_ingress(tid)
    if any(r.get("hostname") == HOST for r in config["ingress"]):
        config["ingress"] = [r for r in config["ingress"] if r.get("hostname") != HOST]
        put_ingress(tid, config, "down")
    zid = zone_id()
    for r in cf("GET", f"/zones/{zid}/dns_records?name={HOST}"):
        cf("DELETE", f"/zones/{zid}/dns_records/{r['id']}")
    apps = access_apps()  # the address goes first, the lock last
    for name in (ROOT_APP, BACKSTAGE_APP):
        if name in apps:
            cf("DELETE", acct(f"/access/apps/{apps[name]['id']}"))
    status()


if __name__ == "__main__":
    cmds = {"setup": setup, "on": on, "off": off, "status": status, "down": down}
    (cmds.get(sys.argv[1] if len(sys.argv) > 1 else "") or (lambda: sys.exit(__doc__)))()
