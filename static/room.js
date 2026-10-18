// Room: what everyone in the audience sees on their phone. The #lodge chat as it happens, then the page they built.
// Public: no keys here, and the server only sends the chat, the cast and the build version.
const T = new URLSearchParams(location.search).get("t"); // t = mock clock (screenshots)
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"}[c]));
const av = (c, s) => c === "human" ? `<span class=av style="font-size:${s * .8}px;line-height:1">👤</span>` : `<span class=av>${woltSpriteAvatar(c, s) || ""}</span>`;
const engine = (h, m) => { const n = {claude: "Claude Code", codex: "Codex", opencode: "OpenCode"}[h]; if (!n) return String(h || "").split(" · ")[0]; const s = String(m || "").split("/").pop(); return s ? `${n} · ${s}` : n; };
const mention = (t) => esc(t).replace(/@([a-z0-9-]+)/gi, "<b>@$1</b>");
document.getElementById("logo").innerHTML = woltSpriteAvatar("beaver", 34);

let state = null, seen = new Set(), tab = "chat", build = 0, shipped = false;
const by = () => Object.fromEntries((state.cast || []).map((c) => [c.wolt, c]));
const slotOf = (name) => { const c = by()[name]; if (c) return c.slot; const p = (state.cast || []).find((c) => c.player === name); return p ? p.slot : "host"; };
const creatureOf = (name) => (by()[name] || {}).creature || "raccoon";

function bubble(e) {
  const anim = seen.has(e.seq) ? ' style="animation:none"' : ""; seen.add(e.seq);
  if (e.type === "host") return `<div class=sys${anim}><span>${av("raccoon", 20)} ${esc(e.from || e.wolt || "commie")}</span> is hosting tonight's lodge</div>`;
  if (e.type === "join") return `<div class=sys data-c=${esc(e.slot)}${anim}><span>👤 ${esc(e.player)}</span> created <span>${av(e.creature, 20)} ${esc(e.wolt)}</span></div>`;
  if (e.type === "add") return `<div class=sys${anim}><span>${av(creatureOf(e.from), 20)} ${esc(e.from)}</span> added <span>${av(creatureOf(e.to), 20)} ${esc(e.to)}</span> to #lodge</div>`;
  if (e.type === "ship") return `<div class="sys ship"${anim}>✓ shipped · ${esc(e.text)}</div>`;
  if (e.type === "say") return `<div class="cm h" data-c=${esc(e.slot)}${anim}>${av("human", 28)}<div><div class=cn>${esc(e.from)} → <i>@${esc(e.to)}</i></div><div class=bb>${mention(e.text)}</div></div></div>`;
  if (e.type === "iwcl") return `<div class=cm data-c=${esc(slotOf(e.from))}${anim}>${av(creatureOf(e.from), 32)}<div><div class=cn>${esc(e.from)} → <i>@${esc(e.to)}</i></div><div class=bb>${mention(e.text)}</div></div></div>`;
  if (e.type === "reply") return `<div class="cm r" data-c=${esc(slotOf(e.from))}${anim}>${av(creatureOf(e.from), 28)}<div><div class=cn>${esc(e.from)} → <i>${esc(e.to)}'s phone</i></div><div class=bb>${mention(e.text)}</div></div></div>`;
  return "";
}

function cast() {
  const c = state.cast || [], names = {host: "host", p1: "Player 1", p2: "Player 2"};
  return ["host", "p1", "p2"].map((sid) => {
    const x = c.find((y) => y.slot === sid);
    if (!x) return `<div class="chip wait">${names[sid]}<br>waiting…</div>`;
    return `<div class=chip data-c=${sid}>${av(x.creature, 30)}<div><span class=nm>${esc(x.wolt)}</span><span class=hs>${esc(x.player)}</span><span class=hs>${esc(engine(x.harness, x.model))}</span></div></div>`;
  }).join("");
}

function show(which) {
  tab = which;
  document.getElementById("chat").hidden = which !== "chat";
  document.getElementById("build").hidden = which !== "build";
  document.getElementById("t-chat").classList.toggle("on", which === "chat");
  document.getElementById("t-build").classList.toggle("on", which === "build");
  if (which === "build") document.getElementById("toast").hidden = true;
}

function render() {
  const nearBottom = innerHeight + scrollY >= document.body.scrollHeight - 80;
  const evs = state.events;
  document.getElementById("rows").innerHTML = evs.length ? evs.map(bubble).join("")
    : `<div class=empty>${av("beaver", 48)}<br>The show starts in a moment…</div>`;
  document.getElementById("cast").innerHTML = cast();
  if (state.build && state.build !== build) {
    build = state.build;
    document.getElementById("frame").src = "live/?v=" + build;
    document.getElementById("full").href = "live/?v=" + build;
    const b = document.getElementById("t-build"); b.disabled = false;
    if (!shipped) { shipped = true; if (tab !== "build") { b.innerHTML = 'the build<span class=new>new</span>'; document.getElementById("toast").hidden = false; } }
  }
  if (tab === "chat" && nearBottom) scrollTo(0, document.body.scrollHeight);
}

document.getElementById("t-chat").onclick = () => show("chat");
document.getElementById("t-build").onclick = () => { document.getElementById("t-build").textContent = "the build"; show("build"); };
document.getElementById("toast").onclick = () => document.getElementById("t-build").click();

async function poll() {
  try {
    const r = await fetch(`api/room${T ? "?t=" + T : ""}`, {cache: "no-store"});
    if (r.ok) { state = await r.json(); render(); }
  } catch {}
}
poll(); if (!T) setInterval(poll, 1500);
