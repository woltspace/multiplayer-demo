// Big screen, the shared world: the #lodge group chat (every human and wolt, @mentions lit), the woltPhone (the one
// page everyone builds, Docs-style outlines per wolt), the three live terminals, whose turn it is, and the build clock.
// Same data as the other big screens (/api/crowd), all from real events.
const Q = new URLSearchParams(location.search);
const KEY = Q.get("k") || "", T = Q.get("t"); // t = mock clock (screenshots)
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"}[c]));
const av = (c, s) => c === "human" ? `<span class=av style="font-size:${s * .8}px;line-height:1">👤</span>` : `<span class=av>${woltSpriteAvatar(c, s) || ""}</span>`;
const engine = (h, m) => { const n = {claude: "Claude Code", codex: "Codex", opencode: "OpenCode"}[h]; if (!n) return h || ""; const s = String(m || "").split("/").pop(); return s && h !== "claude" ? `${n} · ${s}` : n; };
const clip = (t, n = 260) => (t = String(t || "")).length > n ? t.slice(0, n - 1) + "…" : t;
const at = (t) => esc(clip(t)).replace(/@([a-z0-9_-]+)/gi, "<b>@$1</b>");
const SLOTS = ["host", "p1", "p2"];
const fit = () => document.getElementById("stage").style.setProperty("--s", Math.min(innerWidth / 1920, innerHeight / 1080));
addEventListener("resize", fit); fit();

const ROOM = new URL("./", location.href), SHORT = (ROOM.host + ROOM.pathname).replace(/\/$/, "");
document.getElementById("jurl").textContent = SHORT;
if (window.QRCode) {
  new QRCode(document.getElementById("jqr"), {text: ROOM.href, width: 64, height: 64, correctLevel: QRCode.CorrectLevel.L});
}
document.getElementById("wbv").innerHTML = woltSpriteAvatar("beaver", 26);

let state = null;
const put = (el, html) => { if (el && el._html !== html) { el._html = html; el.innerHTML = html; } };
const wname = (c) => c && c.wolt ? (c.wolt.name || c.wolt) : "";
const cast = () => state.cast || [];
const bySlot = (sid) => cast().find((c) => c.slot === sid);
const creature = (c) => (c && (c.creature || (c.wolt && c.wolt.creature))) || "raccoon";
const slotOfWolt = (name) => { const c = cast().find((x) => wname(x) === name); return c ? c.slot : "host"; };
const joined = (sid) => { const c = bySlot(sid);
  return !!(c && c.wolt) && (state.mode !== "mock" || state.events.some((e) => (e.type === "join" && e.slot === sid) || (e.type === "host" && sid === "host"))); };
const claimed = (sid) => { const r = state.events.filter((e) => (e.type === "claim" || e.type === "reset") && e.slot === sid).pop(); return !!r && r.type === "claim"; };

// #lodge: humans (say), wolts (post; wolt-to-wolt posts carry @mentions = the implicit IWCL), and the show's moments.
function line(e) {
  if (e.type === "say") return `<div class="cm h" data-c=${e.slot}><span class=ic>${av("human", 24)}</span><span class=who>${esc(e.from)}</span><div class=bb>${at(e.text)}</div></div>`;
  if (e.type === "post" || e.type === "reply") { const sid = e.slot || slotOfWolt(e.from), c = bySlot(sid);
    return `<div class="cm${/@[a-z0-9]/i.test(e.text) ? " at" : ""}" data-c=${sid}><span class=ic>${av(creature(c), 26)}</span><span class=who>${esc(e.from)}</span><div class=bb>${at(e.text)}</div></div>`; }
  if (e.type === "iwcl") { const sid = slotOfWolt(e.from), c = bySlot(sid);
    return `<div class="cm at" data-c=${sid}><span class=ic>${av(creature(c), 26)}</span><span class=who>${esc(e.from)}</span><div class=bb><b>@${esc(e.to)}</b> ${at(e.text)}</div></div>`; }
  if (e.type === "join") return `<div class=sys>👤 ${esc(e.player)} joined with ${esc(e.wolt)}</div>`;
  if (e.type === "game") return `<div class="sys go">⚡ the game is on · one turn at a time</div>`;
  if (e.type === "turn") return `<div class=sys>▸ ${esc(e.player || e.slot)}'s turn</div>`;
  if (e.type === "timeup") return `<div class="sys go">⏱ time's up</div>`;
  if (e.type === "ship") return `<div class="sys go">✓ shipped</div>`;
  return "";
}

function turns() {
  if (state.turn_over) return `<span class="turn now" data-c=host>⏱ time's up · no more turns</span>`;
  if (!state.turn) return "";
  const order = SLOTS.filter(joined);
  return `turn ▸ ` + order.map((sid) => { const c = bySlot(sid), now = sid === state.turn;
    return `<span class="turn${now ? " now" : ""}${now && state.turn_busy ? " busy" : ""}" data-c=${sid}>👤 ${esc(c.player)}${now ? (state.turn_busy ? " · wolts working" : " · your turn") : ""}</span>`; })
    .join(`<span class=arrow>→</span>`);
}

function term(sid) {
  const c = bySlot(sid);
  if (!joined(sid)) {
    const n = sid === "p1" ? "Player 1" : "Player 2";
    return `<section class="box term empty" data-c=${sid}><div class=big>${claimed(sid) ? n : "waiting for<br>" + n}</div><span>${claimed(sid) ? "📱 is creating their wolt…" : "scan your QR to join"}</span></section>`;
  }
  const name = wname(c), busy = (state.busy || state.typing || []).includes(name);
  const raw = chromeless(state.terms[name] || [], true), lines = (state.mode === "mock" ? raw : raw.map(ansi)).slice(-40).join("\n");
  // Live typing: the human's draft, as they type it on their phone, on this wolt's prompt line.
  const d = (state.drafts || {})[sid], typing = d ? `\n<span class=draft>› <b>${esc(c.player)}:</b> ${esc(d)}<i class=caret></i></span>` : "";
  return `<section class="box term" data-c=${sid}><div class=bh>${av(creature(c), 24)}<b>${esc(name)}</b> · ${sid === "host" ? "host" : esc(c.player) + "'s wolt"} · ${esc(engine(c.harness || (c.wolt && c.wolt.harness), c.model || (c.wolt && c.wolt.model)))}<span class=r><i class="dot${busy ? " busy" : ""}"></i></span></div><div class=tb><pre>${lines}${typing}</pre></div></section>`;
}

function render() {
  document.getElementById("curtain").hidden = (state.phase || "live") === "live";
  drawBoard(state.events.some((e) => e.type === "ship"));
  put(document.getElementById("turns"), turns());
  const humans = SLOTS.filter(joined).length;
  put(document.getElementById("who"), `· ${humans} human${humans === 1 ? "" : "s"} · ${humans} wolt${humans === 1 ? "" : "s"}`);
  put(document.getElementById("chat"), state.events.map(line).filter(Boolean).slice(-14).join(""));
  // Terminals: a seat's terminal box is replaced only when it changes, never the woltPhone.
  const tw = document.getElementById("terms");
  SLOTS.forEach((sid, i) => { let el = tw.children[i]; if (!el) { el = document.createElement("div"); el.style.display = "contents"; tw.append(el); } put(el, term(sid)); });
}

let clockAt = 0;
function tick() {
  const el = document.getElementById("clock");
  if (!state || !state.game_at || !state.game_seconds) { el.hidden = true; return; }
  const left = Math.ceil(state.game_seconds - (state.now - state.game_at) - (Date.now() - clockAt) / 1000);
  const shipped = state.events.some((e) => e.type === "ship");
  el.hidden = false; el.classList.toggle("late", left <= 30 && !shipped);
  put(el, `<small>build time</small><b>${shipped ? "✓ done" : left <= 0 ? "TIME!" : `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`}</b>`);
}
setInterval(tick, 250);

async function poll() {
  try {
    const r = await fetch(`api/crowd${T ? "?t=" + T : ""}`, {headers: {"X-Admin-Key": KEY}, cache: "no-store"});
    if (r.ok) { state = await r.json(); clockAt = Date.now(); render(); tick(); }
  } catch {}
}
poll(); if (!T) setInterval(poll, 700);
// Game keys go to the woltPhone (the page inside listens for them), so the big screen plays from the keyboard.
const GAME_KEYS = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " ", "Enter", "w", "a", "s", "d", "W", "A", "S", "D"]);
for (const kind of ["keydown", "keyup"]) addEventListener(kind, (e) => {
  if (!GAME_KEYS.has(e.key) || e.shiftKey && e.key === "G") return;
  e.preventDefault();
  document.querySelector(".phone iframe").contentWindow.postMessage({type: "lodge-key", key: e.key, code: e.code, up: kind === "keyup"}, "*");
});
// No controls here: the big screen is a display. Every host control is in backstage (/admin).

// The board (while the show isn't live): the game's start screen, a big QR to /play. The slides are their own
// deck at /slides, in their own window.
document.getElementById("burl").textContent = SHORT;
if (window.QRCode) new QRCode(document.getElementById("bqr"), {text: ROOM.href, width: 260, height: 260, correctLevel: QRCode.CorrectLevel.M});
function drawBoard(shipped) {
  document.getElementById("bgo").textContent = shipped ? "▶ PLAY IT NOW" : "SCAN TO PLAY";
  document.getElementById("bsub").textContent = shipped ? "built live by 3 humans · 3 wolts" : "3 humans · 3 wolts · 1 game";
}
