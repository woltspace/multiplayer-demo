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
  // Slack-thread style: avatar left, a name line (name · HUMAN/WOLT · time), the message under it. Seat colors.
  const tm = e.ts ? new Date(e.ts * 1000).toLocaleTimeString([], {hour: "numeric", minute: "2-digit"}) : "";
  const row = (kind, sid, icon, from, body, mention) => `<div class="cm ${kind}${mention ? " at" : ""}" data-c=${sid}><span class=ic>${icon}</span>` +
    `<div class=hd><span class=who>${esc(from)}</span><span class=tag>${kind === "h" ? "human" : "wolt"}</span><span class=tm>${tm}</span></div><div class=bb>${body}</div></div>`;
  const wolt = (sid, from, body, mention) => row("w", sid, av(creature(bySlot(sid)), 30), from, body, mention);
  if (e.type === "say") return row("h", e.slot, av("human", 28), e.from, at(e.text), false);
  if (e.type === "post" || e.type === "reply") return wolt(e.slot || slotOfWolt(e.from), e.from, at(e.text), /@[a-z0-9]/i.test(e.text));
  if (e.type === "iwcl") return wolt(slotOfWolt(e.from), e.from, `<b>@${esc(e.to)}</b> ${at(e.text)}`, true);
  // Turns, pause and resume stay out of #lodge (the turn bar and the clock show them).
  if (e.type === "join") return `<div class=sys>👤 ${esc(e.player)} joined with ${esc(e.wolt)}</div>`;
  if (e.type === "game") return `<div class="sys go">⚡ the game is on · one turn at a time</div>`;
  if (e.type === "timeup") return `<div class="sys go">⏱ time's up</div>`;
  if (e.type === "open") return `<div class=sys>▶ the lodge is open</div>`;
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
    return claimed(sid) ? `<section class="box term empty" data-c=${sid}><div class=big>${n}</div><span>waking up their wolt…</span></section>`
      : `<section class="box term empty" data-c=${sid}><div class=big>waiting for<br>${n}</div><button class=mk type=button data-c=${sid}>＋ create ${n}'s wolt</button></section>`;
  }
  const name = wname(c), busy = (state.busy || state.typing || []).includes(name);
  // The prompt's horizontal rules are as wide as the wolt's terminal, wider than this box: they'd wrap and leave a
  // stray "─" on the next line. Rule lines are clipped to the box instead (rl), everything else wraps.
  const rule = (l) => /─{8,}/.test(l.replace(/<[^>]*>/g, "")) && !/[A-Za-z]{3}/.test(l.replace(/<[^>]*>/g, "").replace(/\S*-\S*-\S*/g, ""));
  const shown = (state.mode === "mock" ? raw0(name) : raw0(name).map(ansi)).slice(-40);
  // Typing (click a terminal on the big screen, or a phone's draft): a line right under the terminal, as the player.
  // Your own seat always shows your own box; a player's seat shows their phone (or your takeover while you're in it).
  const mine = typingIn === sid, d = mine || sid === "host" ? local[sid] || "" : (state.drafts || {})[sid] || "", at = -1;
  const err = errs[sid] ? `<span class=terr>✗ ${esc(errs[sid])}</span>` : "";
  if (at >= 0) shown[at] = `<span class=pline>❯ ${esc(d)}${mine ? "<i class=caret></i>" : ""}</span>${err}`;
  const lines = shown.map((l) => rule(l) ? `<span class=rl>${l}</span>` : l + "\n").join("").replace(/\n$/, "");
  // The player's input line is always there under the terminal: dim when empty, live as they (or you) type.
  const typing = `\n<span class="draft${d || mine ? "" : " idle"}">› <b>${esc(c.player)}:</b> ${esc(d)}${d || mine ? "<i class=caret></i>" : ""}</span>${err}`;
  // Whose turn it is: a flashing arrow beside that terminal, and its frame glows.
  const now = state.turn === sid && state.game_at;
  return `<section class="box term${mine ? " typing" : ""}${now ? " now" : ""}" data-c=${sid}>${now ? "<i class=turnarrow><b>TURN</b>▶</i>" : ""}<div class=bh>${av(creature(c), 24)}<b>${esc(name)}</b> · ${esc(c.player || "the host")}'s wolt · ${esc(engine(c.harness || (c.wolt && c.wolt.harness), c.model || (c.wolt && c.wolt.model)))}<span class=r><i class="dot${busy ? " busy" : ""}"></i></span></div><div class=tb><pre>${lines}${typing}</pre></div></section>`;
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
  // The same ⚡ start the game, big, on the woltPhone (the big screen only: the room's phones never see it).
  document.getElementById("pstart").hidden = !(on && !state.game_at && state.phase === "live");
  document.getElementById("replay").hidden = !state.game_at;
  if (state.phase === "paused" && !state.paused) pb.disabled = true;
  pb.classList.toggle("on", !!state.paused);
  put(document.getElementById("turns"), turns());
  const humans = SLOTS.filter(joined).length;
  put(document.getElementById("who"), `· ${humans} human${humans === 1 ? "" : "s"} · ${humans} wolt${humans === 1 ? "" : "s"}`);
  // #lodge scrolls: it follows new messages while you're at the bottom; scroll up to read back, it stays put.
  const ch = document.getElementById("chat"), atEnd = ch.scrollHeight - ch.scrollTop - ch.clientHeight < 60;
  put(ch, state.events.map(line).filter(Boolean).slice(-300).join(""));
  if (atEnd) ch.scrollTop = ch.scrollHeight;
  // Terminals: a seat's terminal box is replaced only when it changes, never the woltPhone.
  const tw = document.getElementById("terms");
  SLOTS.forEach((sid, i) => {
    let el = tw.children[i];
    if (!el) { el = document.createElement("div"); el.style.display = "contents"; el.innerHTML = `<div style="display:contents"></div>`; el.append(sayBox(sid)); tw.append(el); }
    const f = el.lastChild, c = bySlot(sid); if (f._sync) f._sync();  // the player's newest text first
    put(el.firstChild, term(sid));
    f.hidden = !joined(sid) || !state.game_at;  // no typing before ⚡ start the game
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
  const post = (path, text) => fetch(path, {method: "POST", headers: {"X-Admin-Key": KEY, "content-type": "application/json"}, body: JSON.stringify({text})});
  // One draft per seat, the one on screen (the phone's or yours): clicking in picks it up as it is, typing updates it
  // for everyone at once, leaving keeps it there. Nothing appears or disappears on its own.
  let mineLast = null, mineAt = 0;  // the last text this screen shared for the seat, and when
  const share = (text) => { mineLast = text; mineAt = Date.now(); if (state) state.drafts = {...(state.drafts || {}), [sid]: text}; clearTimeout(tmo); tmo = 0;
    return post(`api/admin/draft/${sid}`, text).catch(() => null); };
  // The player always wins: you're the backup. While you're in their terminal, anything new from their phone (more
  // text, a clear, a send) replaces what you have.
  f._sync = () => {
    // Your own seat is a plain text box: nothing but your keyboard ever changes it (no phone, no other tab).
    if (sid === "host") return;
    // A refresh that left before your last keystroke still carries the old text: not the phone. Wait for a fresh one.
    if (typingIn !== sid || tmo || Date.now() - mineAt < 2000) return;
    if ((state.draft_src || {})[sid] !== "phone") return;  // only the player's phone wins, never another screen
    const theirs = (state.drafts || {})[sid] || "";
    if (mineLast !== null && theirs !== mineLast && theirs !== i.value) { i.value = theirs; local[sid] = theirs; mineLast = theirs; }
  };
  i.addEventListener("focus", () => {
    // A player's seat: pick up what their phone has typed. Your own seat: keep exactly what you had.
    if (sid !== "host") { i.value = (state && state.drafts || {})[sid] || ""; }
    local[sid] = i.value; mineLast = i.value; typingIn = sid; redraw(); });
  i.addEventListener("blur", () => { if (typingIn === sid) typingIn = null; share(i.value); redraw(); });
  i.addEventListener("keydown", (e) => { if (e.key === "Escape") i.blur(); });
  i.addEventListener("input", () => { local[sid] = i.value; mineAt = Date.now(); redraw(); clearTimeout(tmo); tmo = setTimeout(() => share(i.value), 120); });
  f.addEventListener("submit", async (e) => {
    e.preventDefault(); const text = i.value.trim(); if (!text) return;
    const r = await post(`api/admin/say/${sid}`, text).catch(() => null);
    if (r && r.ok) { i.value = ""; local[sid] = ""; if (state && state.drafts) delete state.drafts[sid]; delete errs[sid]; redraw(); poll(); }
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
  if (!GAME_KEYS.has(e.key) || e.shiftKey && e.key === "G" || e.target.closest && e.target.closest("input,textarea,dialog")) return;
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

// ↺ Reset everything, also from here (same as backstage): a fresh show and new wolts; the seat QRs stay.
document.getElementById("resetall").addEventListener("click", async (e) => {
  if (!confirm("Reset everything?\n\nStops every session, deletes the players' wolts, clears the chat and the page and starts a fresh hostie. The players' QR codes stay the same.")) return;
  if (!confirm("Sure? The game and the players' wolts are gone for good.")) return;
  const b = e.currentTarget; b.disabled = true; b.textContent = "…";
  await fetch("api/admin/reset-all", {method: "POST", headers: {"X-Admin-Key": KEY}}).catch(() => null);
  b.disabled = false; b.textContent = "↺"; poll();
});

// Click a terminal to type into it. Taken on press (pointerdown), before the browser moves focus: a click that
// first blurs the box redraws the terminal, and the click itself would then land on nothing (the 2nd-click bug).
document.getElementById("terms").addEventListener("pointerdown", (e) => {
  const t = e.target.closest("section.term"); if (!t || e.target.closest("form.say")) return;
  const f = document.querySelector(`form.say[data-c="${t.dataset.c}"]`);
  if (!f || f.hidden) return;
  e.preventDefault();  // keep focus where we put it
  const i = f.querySelector("input"); if (document.activeElement !== i) i.focus();
  i.setSelectionRange(i.value.length, i.value.length);  // the cursor at the end, like any text box
});

// ⏪ Instant replay: the woltPhone rebuilds the game save by save (about 10 s), then goes back to live.
document.getElementById("replay").addEventListener("click", async (e) => {
  // Its own screen by default (a new tab; pressing it again replays in that same tab); Shift+click replays on the woltPhone here.
  if (!e.shiftKey) { window.open("replay", "lodge-replay"); return; }
  const b = e.currentTarget; b.disabled = true;
  const r = await fetch("api/admin/replay", {headers: {"X-Admin-Key": KEY}, cache: "no-store"}).catch(() => null);
  const d = r && r.ok ? await r.json() : {frames: []};
  const ms = Math.max(350, Math.min(900, Math.round(10000 / Math.max(1, d.frames.length))));
  document.querySelector(".phone iframe").contentWindow.postMessage({type: "lodge-replay", frames: d.frames, ms}, "*");
  setTimeout(() => { b.disabled = false; }, d.frames.length * ms + 3000);
});

// Seats are set up from here (jerpint, 2026-10-22): "＋ create Player N's wolt" opens the same form the phones had
// (their name, their wolt's name, a creature). The player's QR is only their chat.
const mkd = document.createElement("dialog"); mkd.className = "mkd"; document.body.append(mkd);
let mkCreature = "beaver";
document.getElementById("terms").addEventListener("click", (e) => {
  const b = e.target.closest("button.mk"); if (!b) return;
  const sid = b.dataset.c, n = sid === "p1" ? "Player 1" : "Player 2";
  mkd.style.setProperty("--m", `var(--${sid})`);
  mkd.innerHTML = `<form method=dialog autocomplete=off><h2>＋ ${n}'s wolt</h2>
    <label for=mkp>Their name</label><input id=mkp maxlength=24 required placeholder="Maya">
    <label for=mkw>Their wolt's name</label><input id=mkw maxlength=24 required placeholder="flint">
    <label>Creature</label><div class=pick>${["otter", "beaver", "raccoon"].map((c) => `<button type=button data-k=${c} class="${c === mkCreature ? "on" : ""}">${av(c, 48)}${c}</button>`).join("")}</div>
    <div class=row><span class=err id=mke role=status></span><button type=button class=no>cancel</button><button class=go>Create</button></div></form>`;
  mkd.querySelectorAll(".pick button").forEach((x) => x.onclick = () => { mkCreature = x.dataset.k; mkd.querySelectorAll(".pick button").forEach((y) => y.classList.toggle("on", y === x)); });
  mkd.querySelector(".no").onclick = () => mkd.close();
  mkd.querySelector("form").onsubmit = async (ev) => {
    ev.preventDefault();
    const go = mkd.querySelector(".go"), err = document.getElementById("mke");
    go.disabled = true; err.style.color = "var(--tan)"; err.textContent = "waking it up…";
    const r = await fetch(`api/admin/create/${sid}`, {method: "POST", headers: {"content-type": "application/json", "X-Admin-Key": KEY},
      body: JSON.stringify({player: document.getElementById("mkp").value, wolt: document.getElementById("mkw").value, creature: mkCreature})}).catch(() => null);
    if (r && r.ok) { mkd.close(); return; }
    const d = r ? await r.json().catch(() => ({})) : {};
    err.style.color = ""; err.textContent = d.detail || "that didn't work, try again"; go.disabled = false;
  };
  mkd.showModal(); document.getElementById("mkp").focus();
});

document.getElementById("pstart").addEventListener("click", async (e) => {
  e.currentTarget.hidden = true;
  await fetch("api/admin/game/start", {method: "POST", headers: {"X-Admin-Key": KEY}}).catch(() => null);
  poll();
});
