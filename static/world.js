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
  new QRCode(document.getElementById("jqr"), {text: ROOM.href, width: 138, height: 138, correctLevel: QRCode.CorrectLevel.M});
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
  if (e.type === "pause") return `<div class=sys>⏸ paused</div>`;
  if (e.type === "resume") return `<div class="sys go">▶ back on</div>`;
  if (e.type === "ship") return `<div class="sys go">✓ shipped</div>`;
  return "";
}

function turns() {
  if (state.turn_over) return `<span class="turn now" data-c=host>⏱ time's up · no more turns</span>`;
  if (!state.turn) return "";
  const order = SLOTS.filter(joined);
  return `turn ▸ ` + order.map((sid) => { const c = bySlot(sid), now = sid === state.turn;
    return `<span class="turn${now ? " now" : ""}${now && state.turn_busy ? " busy" : ""}" data-c=${sid}>👤 ${esc(c.player)}${now ? (state.turn_busy ? " · wolts working" : " · your turn") : ""}</span>`; })
    .join(`<span class=arrow>→</span>`) + (state.paused ? "" : `<button class=skip id=skip title="Skip this turn">⏭ skip</button>`);
}

const raw0 = (name) => chromeless(state.terms[name] || [], true);
let typingIn = null; const local = {}, errs = {};
function term(sid) {
  const c = bySlot(sid);
  if (!joined(sid)) {
    const n = sid === "p1" ? "Player 1" : "Player 2";
    return `<section class="box term empty" data-c=${sid}><div class=big>${claimed(sid) ? n : "waiting for<br>" + n}</div><span>${claimed(sid) ? "📱 is creating their wolt…" : "scan your QR to join"}</span></section>`;
  }
  const name = wname(c), busy = (state.busy || state.typing || []).includes(name);
  // The prompt's horizontal rules are as wide as the wolt's terminal, wider than this box: they'd wrap and leave a
  // stray "─" on the next line. Rule lines are clipped to the box instead (rl), everything else wraps.
  const rule = (l) => /─{8,}/.test(l.replace(/<[^>]*>/g, "")) && !/[A-Za-z]{3}/.test(l.replace(/<[^>]*>/g, "").replace(/\S*-\S*-\S*/g, ""));
  const shown = (state.mode === "mock" ? raw0(name) : raw0(name).map(ansi)).slice(-40);
  // Typing (click a terminal on the big screen, or a phone's draft): a line right under the terminal, as the player.
  const mine = typingIn === sid, d = mine ? local[sid] || "" : (state.drafts || {})[sid] || "", at = -1;
  const err = errs[sid] ? `<span class=terr>✗ ${esc(errs[sid])}</span>` : "";
  if (at >= 0) shown[at] = `<span class=pline>❯ ${esc(d)}${mine ? "<i class=caret></i>" : ""}</span>${err}`;
  const lines = shown.map((l) => rule(l) ? `<span class=rl>${l}</span>` : l + "\n").join("").replace(/\n$/, "");
  const typing = at < 0 && (d || mine) ? `\n<span class=draft>› <b>${esc(c.player)}:</b> ${esc(d)}<i class=caret></i></span>${err}` : at < 0 ? err : "";
  // Whose turn it is: a flashing arrow beside that terminal, and its frame glows.
  const now = state.turn === sid && state.game_at;
  return `<section class="box term${mine ? " typing" : ""}${now ? " now" : ""}" data-c=${sid}>${now ? "<i class=turnarrow>▶</i>" : ""}<div class=bh>${av(creature(c), 24)}<b>${esc(name)}</b> · ${esc(c.player || "the host")}'s wolt · ${esc(engine(c.harness || (c.wolt && c.wolt.harness), c.model || (c.wolt && c.wolt.model)))}<span class=r><i class="dot${busy ? " busy" : ""}"></i></span></div><div class=tb><pre>${lines}${typing}</pre></div></section>`;
}

function render() {
  // Three states, no curtain: ready (after a reset) = the start screen; live and paused = the game, as it is.
  document.getElementById("curtain").hidden = state.phase !== "ready";
  drawBoard(state.events.some((e) => e.type === "ship"));
  const sb = document.getElementById("bstart"); if (sb.textContent !== "starting…") sb.disabled = false;
  if (state.phase === "ready") sb.textContent = "▶ START";
  // Next to the clock: ⚡ start the game (the clock and the turns start), then ⏸ pause / ▶ resume. After the kill
  // switch the game is frozen and stays that way.
  const pb = document.getElementById("pause"), on = state.phase !== "ready" && !state.turn_over;
  pb.hidden = !on; pb.disabled = false;
  pb.textContent = !state.game_at ? "⚡ start the game" : state.paused ? "▶ resume" : state.phase === "paused" ? "⛔ stopped" : "⏸ pause";
  pb.classList.toggle("go", !state.game_at);
  if (state.phase === "paused" && !state.paused) pb.disabled = true;
  pb.classList.toggle("on", !!state.paused);
  put(document.getElementById("turns"), turns());
  const humans = SLOTS.filter(joined).length;
  put(document.getElementById("who"), `· ${humans} human${humans === 1 ? "" : "s"} · ${humans} wolt${humans === 1 ? "" : "s"}`);
  put(document.getElementById("chat"), state.events.map(line).filter(Boolean).slice(-14).join(""));
  // Terminals: a seat's terminal box is replaced only when it changes, never the woltPhone.
  const tw = document.getElementById("terms");
  SLOTS.forEach((sid, i) => {
    let el = tw.children[i];
    if (!el) { el = document.createElement("div"); el.style.display = "contents"; el.innerHTML = `<div style="display:contents"></div>`; el.append(sayBox(sid)); tw.append(el); }
    put(el.firstChild, term(sid));
    const f = el.lastChild, c = bySlot(sid); f.hidden = !joined(sid);
    if (c) f.querySelector("input").placeholder = `type as ${c.player || "the host"} → ${wname(c)}…`;
  });
}

// Type into any seat from here (a phone died, a player can't log in): as that player, same turn rules as the phone.
// Each box sits under its terminal and is never re-rendered, so typing isn't interrupted.
function sayBox(sid) {
  const f = document.createElement("form"); f.className = "say"; f.dataset.c = sid; f.hidden = true;
  f.innerHTML = `<span>›</span><input autocomplete=off spellcheck=false maxlength=2000><em></em>`;
  const i = f.querySelector("input"), note = f.querySelector("em"); let tmo = 0;
  const redraw = () => { const el = document.getElementById("terms").children[SLOTS.indexOf(sid)]; if (el && state) put(el.firstChild, term(sid)); };
  i.addEventListener("focus", () => { typingIn = sid; redraw(); });
  i.addEventListener("blur", () => { if (typingIn === sid) typingIn = null; redraw(); });
  i.addEventListener("keydown", (e) => { if (e.key === "Escape") i.blur(); });
  const post = (path, text) => fetch(path, {method: "POST", headers: {"X-Admin-Key": KEY, "content-type": "application/json"}, body: JSON.stringify({text})});
  i.addEventListener("input", () => { local[sid] = i.value; redraw(); clearTimeout(tmo); tmo = setTimeout(() => post(`api/admin/draft/${sid}`, i.value).catch(() => null), 150); });
  f.addEventListener("submit", async (e) => {
    e.preventDefault(); const text = i.value.trim(); if (!text) return;
    const r = await post(`api/admin/say/${sid}`, text).catch(() => null);
    if (r && r.ok) { i.value = ""; local[sid] = ""; delete errs[sid]; redraw(); poll(); }
    else { const d = r ? await r.json().catch(() => ({})) : {}; errs[sid] = d.detail || "didn't send"; redraw(); setTimeout(() => { delete errs[sid]; redraw(); }, 4000); }
  });
  return f;
}

let clockAt = 0;
function tick() {
  const el = document.getElementById("clock");
  if (!state || !state.game_seconds || state.phase === "ready") { el.hidden = true; return; }
  if (!state.game_at) {  // the world is up, the game isn't started yet: the full clock, waiting
    const g = state.game_seconds; el.hidden = false; el.classList.remove("late", "held");
    put(el, `<small>build time</small><b>${Math.floor(g / 60)}:${String(g % 60).padStart(2, "0")}</b>`); return;
  }
  // Paused: the clock holds (the server already moved game_at by the time spent paused).
  const left = Math.ceil(state.game_seconds - (state.now - state.game_at) - (state.paused ? 0 : (Date.now() - clockAt) / 1000));
  const shipped = state.events.some((e) => e.type === "ship");
  el.hidden = false; el.classList.toggle("late", left <= 30 && !shipped); el.classList.toggle("held", !!state.paused);
  put(el, `<small>${state.paused ? "⏸ paused" : "build time"}</small><b>${shipped ? "✓ done" : left <= 0 ? "TIME!" : `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`}</b>`);
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
  if (!GAME_KEYS.has(e.key) || e.shiftKey && e.key === "G" || e.target.closest && e.target.closest("input,textarea")) return;
  e.preventDefault();
  document.querySelector(".phone iframe").contentWindow.postMessage({type: "lodge-key", key: e.key, code: e.code, up: kind === "keyup"}, "*");
});
// The game's controls (inner game) live here, owner-only: ▶ START on the start screen (the world comes up, players
// join; no clock yet), then next to the clock ⚡ start the game (clock + turns), ⏸ pause / ▶ resume, and ⏭ skip in
// the turn bar. Outer game (reset, public/private, seats, kill switch) is in backstage.
document.getElementById("bstart").addEventListener("click", async (e) => {
  const b = e.currentTarget; b.disabled = true; b.textContent = "starting…";
  await fetch("api/admin/phase/live", {method: "POST", headers: {"X-Admin-Key": KEY}}).catch(() => null);
  b.textContent = "▶ START"; poll();
});
document.getElementById("pause").addEventListener("click", async (e) => {
  const b = e.currentTarget; b.disabled = true;
  const path = !state.game_at ? "api/admin/game/start" : state.paused ? "api/admin/resume" : "api/admin/pause";
  await fetch(path, {method: "POST", headers: {"X-Admin-Key": KEY}}).catch(() => null);
  poll();
});
document.getElementById("turns").addEventListener("click", async (e) => {
  const b = e.target.closest("#skip"); if (!b) return;
  b.disabled = true; b.textContent = "skipping…";
  await fetch("api/admin/turn/skip", {method: "POST", headers: {"X-Admin-Key": KEY}}).catch(() => null);
});

// The board (while the show isn't live): the game's start screen, PRESS START style. The slides are their own
// deck at /slides, in their own window.
document.getElementById("burl").textContent = SHORT;
if (window.QRCode) new QRCode(document.getElementById("bqr"), {text: ROOM.href, width: 240, height: 240, correctLevel: QRCode.CorrectLevel.M});
function drawBoard(shipped) {
  document.getElementById("bsub").textContent = shipped ? "built live by 3 humans · 3 wolts" : "3 humans · 3 wolts · 1 game";
}

// ↺ Reset everything, also from here (same as backstage): a fresh show, new wolts, new seat QRs.
document.getElementById("resetall").addEventListener("click", async (e) => {
  if (!confirm("Reset everything?\n\nStops every session, deletes the players' wolts, clears the chat and the page, makes new QR codes for all 3 seats and starts a fresh hostie.")) return;
  if (!confirm("Sure? The seat QR codes stop working.")) return;
  const b = e.currentTarget; b.disabled = true; b.textContent = "…";
  await fetch("api/admin/reset-all", {method: "POST", headers: {"X-Admin-Key": KEY}}).catch(() => null);
  b.disabled = false; b.textContent = "↺"; poll();
});

// Click a terminal to type into it: focuses that seat's box (the draft shows on the terminal's prompt as you type).
document.getElementById("terms").addEventListener("click", (e) => {
  const t = e.target.closest("section.term"); if (!t || e.target.closest("form.say")) return;
  const f = document.querySelector(`form.say[data-c="${t.dataset.c}"]`);
  if (f && !f.hidden) f.querySelector("input").focus();
});
