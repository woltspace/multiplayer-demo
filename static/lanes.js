// Big screen, two lanes: each player's chat with their wolt and its live terminal, next to their game. The host's
// latest line (warm-up, twists over IWCL, the ship) runs across the top. Before any player joins, the host gets the
// whole screen so the warm-up is visible. Same data as the crowd screen (/api/crowd), all from real events.
const Q = new URLSearchParams(location.search);
const KEY = Q.get("k") || "", T = Q.get("t"); // t = mock clock (screenshots)
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"}[c]));
const av = (c, s) => c === "human" ? `<span class=av style="font-size:${s * .8}px;line-height:1">👤</span>` : `<span class=av>${woltSpriteAvatar(c, s) || ""}</span>`;
const engine = (h, m) => { const n = {claude: "Claude Code", codex: "Codex", opencode: "OpenCode"}[h]; if (!n) return h || ""; const s = String(m || "").split("/").pop(); return s && h !== "claude" ? `${n} · ${s}` : n; };
const clip = (t, n = 220) => (t = String(t || "")).length > n ? t.slice(0, n - 1) + "…" : t;
const fit = () => document.getElementById("stage").style.setProperty("--s", Math.min(innerWidth / 1920, innerHeight / 1080));
addEventListener("resize", fit); fit();

// The public room: short link + QR, top right and on the board.
const ROOM = new URL(".", location.href), SHORT = (ROOM.host + ROOM.pathname).replace(/\/$/, "");
document.getElementById("jurl").textContent = SHORT; document.getElementById("curl").textContent = SHORT;
if (window.QRCode) {
  new QRCode(document.getElementById("jqr"), {text: ROOM.href, width: 64, height: 64, correctLevel: QRCode.CorrectLevel.L});
  new QRCode(document.getElementById("cqr"), {text: ROOM.href, width: 300, height: 300, correctLevel: QRCode.CorrectLevel.M});
}
document.getElementById("clogo").innerHTML = woltSpriteAvatar("beaver", 120);

let state = null;
const put = (el, html) => { if (el && el._html !== html) { el._html = html; el.innerHTML = html; } };
const wname = (c) => c && c.wolt ? (c.wolt.name || c.wolt) : "";
const cast = () => state.cast || [];
const bySlot = (sid) => cast().find((c) => c.slot === sid);
const hostName = () => wname(bySlot("host")) || "commie";
const slotOf = (name) => { const c = cast().find((x) => wname(x) === name || x.player === name); return c ? c.slot : "host"; };
const creatureOf = (name) => { const c = cast().find((x) => wname(x) === name); return (c && (c.creature || (c.wolt && c.wolt.creature))) || "raccoon"; };
const joined = (sid) => { const c = bySlot(sid);
  return !!(c && c.wolt) && (state.mode !== "mock" || state.events.some((e) => (e.type === "join" && e.slot === sid) || (e.type === "host" && sid === "host"))); };

// A seat someone has scanned but not finished (name, wolt, creature): the last claim/reset event for it is a claim.
const claimed = (sid) => { const r = state.events.filter((e) => (e.type === "claim" || e.type === "reset") && e.slot === sid).pop(); return !!r && r.type === "claim"; };

// Which lane a chat event belongs to, and how it looks there.
function route(e) {
  const host = hostName();
  if (e.type === "say") return {lane: e.slot, cls: "h", icon: av("human", 24), who: e.from, text: e.text};
  if (e.type === "reply") return {lane: e.to_slot || slotOf(e.to), cls: "r", icon: av(creatureOf(e.from), 26), who: e.from, text: e.text};
  // Kickoffs and twists (they start with ⚡) glow; the host's other IWCL (welcomes, nudges) reads as a plain message.
  if (e.type === "iwcl" && e.from === host) return {lane: slotOf(e.to), cls: /^\s*⚡/.test(e.text) ? "tw" : "r", icon: av("raccoon", 26), who: host, text: e.text};
  if (e.type === "iwcl") return {lane: slotOf(e.from), cls: "out", icon: av(creatureOf(e.from), 26), who: e.from, text: `→ ${e.to}: ${e.text}`};
  return null;
}

function chat(sid) {
  const rows = state.events.map(route).filter((r) => r && r.lane === sid).slice(-6);
  return rows.map((r) => `<div class="cm ${r.cls}"><span class=ic>${r.icon}</span><span class=who>${esc(r.who)}</span><div class=bb>${esc(clip(r.text))}</div></div>`).join("");
}

function term(name) {
  const raw = chromeless(state.terms[name] || [], true);
  return (state.mode === "mock" ? raw : raw.map(ansi)).slice(-60).join("\n");
}

// The top strip: the host's latest moment. Twists sent to several wolts at once read as one line.
function hostStrip() {
  const host = hostName(), evs = state.events, ship = evs.find((e) => e.type === "ship");
  return (ship ? `<span class="tag ship">✓ shipped</span>` : "") + hostLine(host, evs);
}
function hostLine(host, evs) {
  for (let i = evs.length - 1; i >= 0; i--) {
    const e = evs[i];
    if (e.type === "iwcl" && e.from === host) {
      const to = evs.filter((x) => x.type === "iwcl" && x.from === host && x.text === e.text).map((x) => x.to);
      return `${av("raccoon", 30)}<b>${esc(host)} · host</b><span class=tag>⚡ IWCL → ${esc([...new Set(to)].join(", "))}</span><span class=msg>${esc(clip(e.text, 160))}</span>`;
    }
    if (e.type === "reply" && e.from === host) return `${av("raccoon", 30)}<b>${esc(host)} · host</b><span class=msg>${esc(clip(e.text, 200))}</span>`;
    if (e.type === "say" && e.slot === "host") return `${av("human", 26)}<b>${esc(e.from)}</b><span class=msg>${esc(clip(e.text, 200))}</span>`;
  }
  return `${av("raccoon", 30)}<b>${esc(host)} · host</b><span class=msg>is hosting tonight's lodge</span>`;
}

// Lanes keep their elements between polls (the game iframe must not reload); only their insides change.
function laneEl(sid, mode) {
  const box = document.getElementById("lanes"), id = "lane-" + sid;
  let el = document.getElementById(id);
  if (el && el.dataset.mode === mode) return el;
  const fresh = document.createElement("section"); fresh.id = id; fresh.dataset.mode = mode; fresh.dataset.c = sid;
  if (mode === "empty" || mode === "signing") {
    const n = sid === "p1" ? "Player 1" : "Player 2";
    fresh.className = "lane empty" + (mode === "signing" ? " signing" : "");
    fresh.innerHTML = mode === "empty" ? `<div class=big>waiting for<br>${n}</div><span>scan your QR to join</span>`
      : `<div class=big>${n}</div><span>📱 is creating their wolt…</span>`;
  } else {
    fresh.className = "lane";
    fresh.innerHTML = `<div class=lh></div><div class=body><div class=left><div class=bar>chat · ${sid === "host" ? "host" : "player"} ↔ wolt</div><div class=chat></div>
      <div class="bar tb"><span class=dots><i></i><i></i><i></i></span>terminal · live</div><div class=term><pre></pre></div></div>
      ${sid === "host" ? "" : `<div class=game><div class=phone><div class=screen><iframe sandbox="allow-scripts" title="${sid} game" src="stage?only=${sid}"></iframe></div><div class=brand><span class=bv>${woltSpriteAvatar("beaver", 26)}</span><span><b>w</b>Phone</span></div></div></div>`}</div>`;
  }
  if (el) el.replaceWith(fresh); else box.append(fresh);
  return fresh;
}

function lane(sid) {
  const c = bySlot(sid);
  if (sid !== "host" && !joined(sid)) { laneEl(sid, claimed(sid) ? "signing" : "empty"); return; }
  const el = laneEl(sid, "on"), name = wname(c), busy = (state.busy || state.typing || []).includes(name);
  put(el.querySelector(".lh"), `${av(c.creature || (c.wolt && c.wolt.creature) || "raccoon", 34)}<span class=w>${esc(name)}</span><span class=p>${esc(c.player)}'s wolt${sid === "host" ? " · host" : ""}</span>
    <span class=h><i class="dot${busy ? " busy" : ""}"></i> ${esc(engine(c.harness || (c.wolt && c.wolt.harness), c.model || (c.wolt && c.wolt.model)))}</span>`);
  put(el.querySelector(".chat"), chat(sid));
  put(el.querySelector(".term pre"), term(name));
}

function render() {
  const ph = state.phase || "live";
  document.getElementById("curtain").hidden = ph === "live";
  put(document.getElementById("host"), hostStrip());
  // The lanes split as soon as a player scans their QR (their lane shows them signing up); until then, the host.
  const players = ["p1", "p2"].some((sid) => joined(sid) || claimed(sid)), box = document.getElementById("lanes");
  box.classList.toggle("solo", !players);
  const want = players ? ["p1", "p2"] : ["host"];
  [...box.children].forEach((ch) => { if (!want.includes(ch.dataset.c)) ch.remove(); });
  want.forEach(lane);
  // Keep p1 left of p2, but only move a lane when the order is wrong: moving an iframe reloads the game.
  const order = [...box.children].map((ch) => ch.dataset.c).join();
  if (order !== want.join()) want.forEach((sid) => box.append(document.getElementById("lane-" + sid)));
}

// The build clock: counts down locally between polls, anchored on the server's clock (screens don't drift).
let clockAt = 0;
function tick() {
  const el = document.getElementById("clock");
  if (!state || !state.game_at || !state.game_seconds) { el.hidden = true; return; }
  const left = Math.ceil(state.game_seconds - (state.now - state.game_at) - (Date.now() - clockAt) / 1000);
  const shipped = state.events.some((e) => e.type === "ship");
  el.hidden = false; el.classList.toggle("late", left <= 30 && !shipped);
  const txt = shipped ? "✓ done" : left <= 0 ? "TIME!" : `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
  put(el, `<small>build time</small><b>${txt}</b>`);
}
setInterval(tick, 250);

async function poll() {
  try {
    const r = await fetch(`api/crowd${T ? "?t=" + T : ""}`, {headers: {"X-Admin-Key": KEY}, cache: "no-store"});
    if (r.ok) { state = await r.json(); clockAt = Date.now(); render(); tick(); }
  } catch {}
}
poll(); if (!T) setInterval(poll, 700);
// Shift+G starts the game from the big screen itself (for a mirrored display, when backstage can't be on screen).
addEventListener("keydown", async (e) => {
  if (!(e.key === "G" && e.shiftKey)) return;
  await fetch("api/admin/game/start", {method: "POST", headers: {"X-Admin-Key": KEY}}).catch(() => null);
});

// The placeholder board rotates its cards (static/board.js) with a soft fade, only while it's up.
let boardAt = 0;
function boardCard(i) { const c = BOARD[i % BOARD.length]; document.getElementById("ctitle").textContent = c.title; document.getElementById("ctext").textContent = c.line; }
boardCard(0);
setInterval(() => {
  if (BOARD.length < 2 || document.getElementById("curtain").hidden) return;
  const card = document.getElementById("ccard"); card.classList.add("out");
  setTimeout(() => { boardCard(++boardAt); card.classList.remove("out"); }, 800);
}, BOARD_SECONDS * 1000);
