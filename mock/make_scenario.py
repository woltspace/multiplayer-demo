"""Writes mock/scenario.json: a 2.5 minute show with the host (commie) + two players, timed in seconds.

The crowd and player pages read it through the app exactly like a real show, so mocks are screenshots of the real pages.
Run: uv run python mock/make_scenario.py
"""

import json
from pathlib import Path

CAST = [
    {"slot": "host", "player": "jerpint", "wolt": "commie", "creature": "raccoon", "harness": "Claude Code · Sonnet"},
    {"slot": "p1", "player": "Maya", "wolt": "flint", "creature": "otter", "harness": "Claude Code · Sonnet"},
    {"slot": "p2", "player": "Sam", "wolt": "bananawolt", "creature": "beaver", "harness": "Codex"},
]
SLOT = {c["wolt"]: c["slot"] for c in CAST}

E = []
T = {c["wolt"]: [] for c in CAST}


def ev(t, type, **kw):
    E.append({"t": t, "type": type, **kw})


def say(t, slot, player, wolt, text):
    ev(t, "say", slot=slot, **{"from": player}, to=wolt, text=text)
    T[wolt].append([t + 0.4, f'<span class=inmsg data-c="{slot}">&gt; <b>{player}:</b> {text}</span>'])


def iwcl(t, a, b, text):
    ev(t, "iwcl", **{"from": a}, to=b, text=text)
    T[a].append([t - 0.8, f'<span class=o>⏺ send {b} "{text[:58]}{"…" if len(text) > 58 else ""}"</span>'])
    T[b].append([t + 0.5, f'<span class=inmsg data-c="{SLOT[a]}">&gt; <b>{a}:</b> {text}</span>'])


def reply(t, wolt, player, text):
    ev(t, "reply", **{"from": wolt}, to=player, to_slot=SLOT[wolt], text=text)
    T[wolt].append([t - 0.5, f'<span class=d>⏺ show-reply → {player}</span>'])


def term(t, wolt, html):
    T[wolt].append([t, html])


W = '<span class=w>⏺</span> '
C = '<span class=w>•</span> '  # codex bullet

term(0, "commie", '<span class=d>commie · the lodge\'s comms raccoon · hosting tonight</span>')
term(0.5, "commie", W + 'Read(SHOW.md): host the lodge, 2 players joining')
ev(0, "host", slot="host", wolt="commie")
say(3, "host", "jerpint", "commie", "two players are joining. build ONE page together, each player owns half. ship it to the room in 3 minutes")
term(5, "commie", W + 'Plan: welcome each wolt · give each a half · merge into index.html')
reply(7, "commie", "jerpint", "on it 🦝 waiting for the players")

# player 1 creates flint
ev(12, "join", slot="p1", player="Maya", wolt="flint", creature="otter", harness="Claude Code · Sonnet")
term(13, "flint", '<span class=d>flint woke up · otter · Claude Code (Sonnet)</span>')
term(13.6, "flint", W + 'Read(CLAUDE.md, SHOW.md)')
ev(15, "add", **{"from": "commie"}, to="flint")
iwcl(17, "commie", "flint", "hi flint 👋 you own the TOP half. ask Maya what she wants, write it to part-a.html")
reply(21, "flint", "Maya", "hi Maya! I'm flint 🦦 commie gave us the top half of the page. what should we build?")
say(27, "p1", "Maya", "flint", "rank montreal bagels: st-viateur vs fairmount, with a big vote button")

# player 2 creates bananawolt
ev(24, "join", slot="p2", player="Sam", wolt="bananawolt", creature="beaver", harness="Codex")
term(25, "bananawolt", '<span class=d>&gt;_ OpenAI Codex · bananawolt · beaver</span>')
term(25.6, "bananawolt", C + 'read SHOW.md')
ev(28, "add", **{"from": "commie"}, to="bananawolt")
iwcl(30, "commie", "bananawolt", "hi bananawolt 👋 you own the BOTTOM half. ask Sam, write it to part-b.html")
reply(34, "bananawolt", "Sam", "yo Sam, bananawolt here 🦫 we have the bottom half. what do you want?")
say(39, "p2", "Sam", "bananawolt", "a tiny game: dodge potholes on a bike with the arrow keys")

term(30, "flint", W + 'Plan: 2 bagel cards + vote bar, cream + orange')
term(33, "flint", W + 'Write(part-a.html) <span class=d>· 64 lines</span>')
reply(36, "flint", "Maya", "building your bagel showdown now 🥯")
term(42, "bananawolt", C + 'planning canvas game: bike, potholes, arrow keys')
iwcl(47, "bananawolt", "flint", "@flint what colors + font are you using? I'll match")
iwcl(53, "flint", "bananawolt", "cream #fff8e6, orange #c4531e, DM Sans. thick black borders")
term(56, "bananawolt", C + 'write part-b.html <span class=d>· canvas 640×240, 60fps loop</span>')
term(61, "flint", W + 'Edit(part-a.html): vote counts + animation')
reply(66, "bananawolt", "Sam", "game loop running. adding the potholes 🕳️")
iwcl(72, "flint", "commie", "part-a.html done: bagel showdown + vote")
term(74, "commie", W + 'Read(part-a.html) <span class=g>✓</span>')
ev(76, "build", v=1)
say(80, "p1", "Maya", "flint", "make the vote button BIGGER and add a sesame emoji")
term(83, "flint", W + 'Edit(part-a.html): button 2x, 🥯 → sesame confetti')
term(90, "bananawolt", C + '<span class=u>potholes spawn too fast</span>, slowing to 1 per 1.2s')
iwcl(96, "flint", "commie", "button is huge now. pushed")
iwcl(104, "bananawolt", "commie", "part-b.html done: pothole dodger, high score saves")
term(107, "commie", W + 'Write(index.html): part-a on top, part-b below, one header')
term(112, "commie", W + 'Bash(check links + sizes) <span class=g>✓ 14 KB</span>')
ev(114, "build", v=2)
iwcl(118, "commie", "flint", "merged 🎉 shipping to the room")
iwcl(119, "commie", "bananawolt", "merged 🎉 shipping to the room")
ev(124, "ship", text="3 humans · 3 wolts · 0 copy-paste")
reply(126, "commie", "jerpint", "live on everyone's phones 🦝")
term(126, "commie", '<span class=g>⏺ Shipped.</span>')

E.sort(key=lambda e: e["t"])
for w in T:
    T[w].sort(key=lambda l: l[0])
Path(__file__).with_name("scenario.json").write_text(json.dumps({"cast": CAST, "events": E, "terms": T}, indent=1, ensure_ascii=False))
print(len(E), "events", {w: len(v) for w, v in T.items()})
