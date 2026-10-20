// Crowd screen: the lodge's #lodge chat on the left, every wolt's terminal on the right, all from real events.
const Q = new URLSearchParams(location.search);
const KEY = Q.get("k") || "", T = Q.get("t"); // t = mock clock (screenshots)
const SLOTS = ["host", "p1", "p2"];
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"}[c]));
const av = (c, s) => c === "human" ? `<span class=av style="font-size:${s * .8}px;line-height:1">👤</span>` : `<span class=av>${woltSpriteAvatar(c, s) || ""}</span>`;
const fit = () => document.getElementById("stage").style.setProperty("--s", Math.min(innerWidth / 1920, innerHeight / 1080));
addEventListener("resize", fit); fit();
document.getElementById("logo").innerHTML = woltSpriteAvatar("beaver", 52);
// The public room: the short link and its QR, for everyone in the audience.
const ROOM = new URL(".", location.href);
document.getElementById("jurl").textContent = (ROOM.host + ROOM.pathname).replace(/\/$/, "");
if (window.QRCode) new QRCode(document.getElementById("jqr"), {text: ROOM.href, width: 64, height: 64, correctLevel: QRCode.CorrectLevel.L});
document.getElementById("clogo").innerHTML = woltSpriteAvatar("beaver", 120);
document.getElementById("curl").textContent = document.getElementById("jurl").textContent;
if (window.QRCode) new QRCode(document.getElementById("cqr"), {text: ROOM.href, width: 300, height: 300, correctLevel: QRCode.CorrectLevel.M});

let state = null, seen = new Set(), buildOn = false, lastBuild = 0, forced = null;
const castBy = () => Object.fromEntries((state.cast || []).filter((c) => c.wolt).map((c) => [c.wolt.name || c.wolt, c]));
const slotOf = (name) => { const c = castBy()[name]; if (c) return c.slot; const p = (state.cast || []).find((c) => c.player === name); return p ? p.slot : "host"; };
const mention = (t) => esc(clip(t)).replace(/@([a-z0-9-]+)/gi, "<b>@$1</b>");

function bubble(e) {
  const fresh = !seen.has(e.seq); seen.add(e.seq);
  const anim = fresh ? "" : " style=\"animation:none\"";
  const cast = castBy();
  if (e.type === "host") return `<div class=sys${anim}><span>${av("raccoon", 28)} ${esc(e.wolt)}</span> is hosting tonight's lodge</div>`;
  if (e.type === "join") return `<div class=sys data-c=${e.slot}${anim}><span>👤 ${esc(e.player)}</span> created <span>${av(e.creature, 28)} ${esc(e.wolt)}</span></div>`;
  if (e.type === "add") return `<div class=sys${anim}><span>${av(cast[e.from]?.creature || "raccoon", 28)} ${esc(e.from)}</span> added <span>${av(cast[e.to]?.creature || "beaver", 28)} ${esc(e.to)}</span> to #lodge</div>`;
  if (e.type === "ship") return `<div class="sys ship"${anim}>✓ shipped · ${esc(e.text)}</div>`;
  if (e.type === "say") return `<div class="cm h" data-c=${e.slot}${anim}>${av("human", 40)}<div><div class=cn>${esc(e.from)} → <i>@${esc(e.to)}</i></div><div class=bb>${mention(e.text)}</div></div></div>`;
  if (e.type === "iwcl") { const c = cast[e.from] || {};
    return `<div class=cm data-c=${slotOf(e.from)}${anim}>${av(c.creature || "raccoon", 44)}<div><div class=cn>${esc(e.from)} → <i>@${esc(e.to)}</i></div><div class=bb>${mention(e.text)}</div><div class=dl>✓✓ delivered to ${esc(e.to)}</div></div></div>`; }
  if (e.type === "reply") { const c = cast[e.from] || {};
    return `<div class="cm r" data-c=${slotOf(e.from)}${anim}>${av(c.creature || "raccoon", 36)}<div><div class=cn>${esc(e.from)} → <i>${esc(e.to)}'s phone</i></div><div class=bb>${mention(e.text)}</div></div></div>`; }
  return "";
}

function typingBubble(who) {
  const c = castBy()[who], human = !c;
  const slot = human ? slotOf(who) : c.slot;
  return `<div class="cm${human ? " h" : ""}" data-c=${slot} style="animation:none">${av(human ? "human" : c.creature, human ? 40 : 44)}<div><div class=cn>${esc(who)} is typing</div><div class="bb ty"><i></i><i></i><i></i></div></div></div>`;
}

const engine = (h, m) => { const n = {claude: "Claude Code", codex: "Codex", opencode: "OpenCode"}[h]; if (!n) return h; const s = String(m || "").split("/").pop(); return s ? `${n} · ${s}` : n; };
const clip = (t, n = 200) => t.length > n ? t.slice(0, n - 1) + "…" : t;

function flame(lines) { // activity: how much each terminal moved lately
  const n = Math.min(10, lines.length); let h = "";
  for (let k = 0; k < 10; k++) { const on = k >= 10 - n && (k * 7 + lines.length) % 3 !== 0; h += `<i style="height:${on ? 6 + ((k * 5 + lines.length) % 20) : 3}px;opacity:${on ? 1 : .35}"></i>`; }
  return `<span class=flame>${h}</span>`;
}

function terminals() {
  const cast = state.cast || [];
  const isIn = (sid) => { const c = cast.find((x) => x.slot === sid);
    return c && c.wolt && (state.mode !== "mock" || state.events.some((e) => (e.type === "join" && e.slot === sid) || (e.type === "host" && sid === "host"))); };
  const nIn = SLOTS.filter(isIn).length; // host first: an empty player slot is a slim "insert coin" strip, a joined one grows
  return SLOTS.map((sid) => {
    const c = cast.find((x) => x.slot === sid);
    const joined = isIn(sid);
    if (!joined) return `<div class="tw empty"><span class=big>${sid === "p1" ? "Player 1" : sid === "p2" ? "Player 2" : "host"}</span>waiting… scan your QR</div>`;
    const name = c.wolt.name || c.wolt, creature = c.creature || c.wolt.creature;
    const raw = chromeless(state.terms[name] || []);
    const lines = state.mode === "mock" ? raw : raw.map(ansi);
    const busy = (state.busy || state.typing).includes(name);
    return `<div class=tw data-c=${sid}><div class=tt><span class=avw>${av(creature, 44)}<i class="dot${busy ? " busy" : ""}"></i></span>
      <div><span class=nm>${esc(name)}</span><span class=who>${esc(c.player)}'s wolt${sid === "host" ? " · host" : ""}</span></div>
      <span class=rl>${esc(engine(c.harness || c.wolt.harness || "", c.model || c.wolt.model))}</span>${flame(raw)}</div>
      <div class=tb><pre>${lines.slice(nIn <= 1 ? -34 : nIn === 2 ? -22 : -14).join("\n")}</pre></div></div>`;
  }).join("");
}

// Only touch the DOM when something changed: rebuilding it every poll made the screen flash.
const put = (id, html) => { const el = document.getElementById(id); if (el._html !== html) { el._html = html; el.innerHTML = html; } };

function render() {
  const evs = state.events, ph = state.phase || "live";
  document.getElementById("curtain").hidden = ph === "live";
  put("rows", evs.filter((e) => e.type !== "build" && e.type !== "claim" && e.type !== "reset").slice(-11).map(bubble).join("") + state.typing.map(typingBubble).join(""));
  put("terms", terminals());
  document.getElementById("nh").textContent = new Set(evs.filter((e) => e.type === "join").map((e) => e.player)).size + (evs.some((e) => e.type === "host") ? 1 : 0);
  document.getElementById("nw").textContent = evs.filter((e) => e.type === "join" || e.type === "host").length;
  document.getElementById("ch").textContent = evs.filter((e) => e.type === "say").length;
  document.getElementById("cw").textContent = evs.filter((e) => e.type === "iwcl").length;
  const shipped = evs.some((e) => e.type === "ship");
  // The page is live from the first save: the stage polls its parts itself, so it loads once.
  if (state.build && !lastBuild) { lastBuild = state.build; document.getElementById("frame").src = state.mode === "mock" ? "live/?v=" + state.build : "stage"; }
  else if (state.mode === "mock" && state.build && state.build !== lastBuild) { lastBuild = state.build; document.getElementById("frame").src = "live/?v=" + state.build; }
  buildOn = forced !== null ? forced : (state.mode === "mock" ? shipped : !!state.build);
  document.getElementById("build").classList.toggle("on", buildOn);
  document.getElementById("terms").style.visibility = buildOn ? "hidden" : "visible";
  tally();
}

// The crowd vote: a live tally under the two games once they ship. Bars grow with the votes.
function tally() {
  const el = document.getElementById("tally"); el.hidden = !state.voting;
  if (!state.voting) return;
  const c = Object.fromEntries((state.cast || []).map((x) => [x.slot, x])), v = state.votes || {}, a = v.p1 || 0, b = v.p2 || 0;
  const name = (side, dflt) => esc((c[side] && (c[side].wolt && (c[side].wolt.name || c[side].wolt))) || dflt);
  put("tally", `<span class=q>vote on your phone</span><div class=bars><i style="flex-grow:${a + 1}">${name("p1", "left")} · ${a}</i><i style="flex-grow:${b + 1}">${b} · ${name("p2", "right")}</i></div>`);
}

async function poll() {
  try {
    const r = await fetch(`api/crowd${T ? "?t=" + T : ""}`, {headers: {"X-Admin-Key": KEY}, cache: "no-store"});
    if (r.ok) { state = await r.json(); render(); }
  } catch {}
}
addEventListener("keydown", (e) => { if (e.key === "b" || e.key === "B") { forced = !buildOn; render(); } if (e.key === "Escape") { forced = null; render(); } });
poll(); if (!T) setInterval(poll, 700);

// The placeholder board rotates its cards (static/board.js) with a soft fade, only while it's up.
let boardAt = 0;
function boardCard(i) { const c = BOARD[i % BOARD.length]; document.getElementById("ctitle").textContent = c.title; document.getElementById("ctext").textContent = c.line; }
boardCard(0);
setInterval(() => {
  if (BOARD.length < 2 || document.getElementById("curtain").hidden) return;
  const card = document.getElementById("ccard"); card.classList.add("out");
  setTimeout(() => { boardCard(++boardAt); card.classList.remove("out"); }, 800);
}, BOARD_SECONDS * 1000);
