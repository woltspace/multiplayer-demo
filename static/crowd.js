// Crowd screen: the lodge's #lodge chat on the left, every wolt's terminal on the right, all from real events.
const Q = new URLSearchParams(location.search);
const KEY = Q.get("k") || "", T = Q.get("t"); // t = mock clock (screenshots)
const SLOTS = ["host", "p1", "p2"];
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"}[c]));
const av = (c, s) => c === "human" ? `<span class=av style="font-size:${s * .8}px;line-height:1">👤</span>` : `<span class=av>${woltSpriteAvatar(c, s) || ""}</span>`;
const fit = () => document.getElementById("stage").style.setProperty("--s", Math.min(innerWidth / 1920, innerHeight / 1080));
addEventListener("resize", fit); fit();
document.getElementById("logo").innerHTML = woltSpriteAvatar("beaver", 52);

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

// tmux capture-pane -e: SGR colors only (16, 256, truecolor, bold, dim, reverse). Everything else is text.
const BASE16 = ["#1a120c","#ff7b6b","#6fd47f","#ffc23d","#7fb6f0","#d68fd6","#6fd4d4","#e8dfd0","#8b7d6b","#ff9b8b","#8fe49f","#ffd36d","#9fc6ff","#e6a8e6","#8fe4e4","#ffffff"];
function c256(n) {
  if (n < 16) return BASE16[n];
  if (n >= 232) { const g = 8 + (n - 232) * 10; return `rgb(${g},${g},${g})`; }
  n -= 16; const k = [0, 95, 135, 175, 215, 255]; return `rgb(${k[Math.floor(n / 36)]},${k[Math.floor(n / 6) % 6]},${k[n % 6]})`;
}
function ansi(line) {
  let out = "", fg = null, bg = null, bold = false, dim = false, open = false;
  const parts = line.split(/\x1b\[([0-9;]*)m/);
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 0) { if (parts[i]) out += esc(parts[i].replace(/\x1b\[[0-9;?]*[A-Za-z]|\x1b\][^\x07]*\x07/g, "")); continue; }
    const c = (parts[i] || "0").split(";").map(Number);
    for (let j = 0; j < c.length; j++) {
      const v = c[j];
      if (v === 0) { fg = bg = null; bold = dim = false; }
      else if (v === 1) bold = true; else if (v === 2) dim = true; else if (v === 22) bold = dim = false;
      else if (v >= 30 && v <= 37) fg = BASE16[v - 30]; else if (v >= 90 && v <= 97) fg = BASE16[v - 82]; else if (v === 39) fg = null;
      else if (v >= 40 && v <= 47) bg = BASE16[v - 40]; else if (v >= 100 && v <= 107) bg = BASE16[v - 92]; else if (v === 49) bg = null;
      else if ((v === 38 || v === 48) && c[j + 1] === 5) { const col = c256(c[j + 2]); v === 38 ? fg = col : bg = col; j += 2; }
      else if ((v === 38 || v === 48) && c[j + 1] === 2) { const col = `rgb(${c[j + 2]},${c[j + 3]},${c[j + 4]})`; v === 38 ? fg = col : bg = col; j += 4; }
    }
    if (open) out += "</span>";
    const css = (fg ? `color:${fg};` : "") + (bg ? `background:${bg};` : "") + (bold ? "font-weight:700;" : "") + (dim ? "opacity:.6;" : "");
    open = !!css; if (css) out += `<span style="${css}">`;
  }
  return out + (open ? "</span>" : "");
}

// Drop the harness's own footer (input box, status bar, update notice): the room wants the work, not the chrome.
function chromeless(lines) {
  const plain = lines.map((l) => l.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, ""));
  for (let i = plain.length - 1; i > 0; i--) {
    if (/^\s*[─━-]{20,}/.test(plain[i]) && /^\s*[❯›>]/.test(plain[i + 1] || "")) { lines = lines.slice(0, i); break; }
  }
  return lines.filter((l, i) => !/Update available!|^\s*$/.test(l.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "")) || false);
}
const engine = (h) => ({claude: "Claude Code · Sonnet", codex: "Codex", opencode: "opencode"}[h] || h);
const clip = (t, n = 200) => t.length > n ? t.slice(0, n - 1) + "…" : t;

function flame(lines) { // activity: how much each terminal moved lately
  const n = Math.min(10, lines.length); let h = "";
  for (let k = 0; k < 10; k++) { const on = k >= 10 - n && (k * 7 + lines.length) % 3 !== 0; h += `<i style="height:${on ? 6 + ((k * 5 + lines.length) % 20) : 3}px;opacity:${on ? 1 : .35}"></i>`; }
  return `<span class=flame>${h}</span>`;
}

function terminals() {
  const cast = state.cast || [];
  return SLOTS.map((sid) => {
    const c = cast.find((x) => x.slot === sid);
    const joined = c && c.wolt && (state.mode !== "mock" || state.events.some((e) => (e.type === "join" && e.slot === sid) || (e.type === "host" && sid === "host")));
    if (!joined) return `<div class="tw empty"><span class=big>${sid === "p1" ? "Player 1" : sid === "p2" ? "Player 2" : "host"}</span>waiting… scan your QR</div>`;
    const name = c.wolt.name || c.wolt, creature = c.creature || c.wolt.creature;
    const raw = chromeless(state.terms[name] || []);
    const lines = state.mode === "mock" ? raw : raw.map(ansi);
    const busy = (state.busy || state.typing).includes(name);
    return `<div class=tw data-c=${sid}><div class=tt><span class=avw>${av(creature, 44)}<i class="dot${busy ? " busy" : ""}"></i></span>
      <div><span class=nm>${esc(name)}</span><span class=who>${esc(c.player)}'s wolt${sid === "host" ? " · host" : ""}</span></div>
      <span class=rl>${esc(engine(c.harness || c.wolt.harness || ""))}</span>${flame(raw)}</div>
      <div class=tb><pre>${lines.slice(-14).join("\n")}</pre></div></div>`;
  }).join("");
}

function render() {
  const evs = state.events;
  document.getElementById("rows").innerHTML = evs.filter((e) => e.type !== "build" && e.type !== "claim" && e.type !== "reset").slice(-11).map(bubble).join("") + state.typing.map(typingBubble).join("");
  document.getElementById("terms").innerHTML = terminals();
  document.getElementById("nh").textContent = new Set(evs.filter((e) => e.type === "join").map((e) => e.player)).size + (evs.some((e) => e.type === "host") ? 1 : 0);
  document.getElementById("nw").textContent = evs.filter((e) => e.type === "join" || e.type === "host").length;
  document.getElementById("ch").textContent = evs.filter((e) => e.type === "say").length;
  document.getElementById("cw").textContent = evs.filter((e) => e.type === "iwcl").length;
  const shipped = evs.some((e) => e.type === "ship");
  if (state.build && state.build !== lastBuild) { lastBuild = state.build; document.getElementById("frame").src = "live/?v=" + state.build; }
  buildOn = forced !== null ? forced : shipped;
  document.getElementById("build").classList.toggle("on", buildOn);
  document.getElementById("terms").style.visibility = buildOn ? "hidden" : "visible";
}

async function poll() {
  try {
    const r = await fetch(`api/crowd${T ? "?t=" + T : ""}`, {headers: {"X-Admin-Key": KEY}, cache: "no-store"});
    if (r.ok) { state = await r.json(); render(); }
  } catch {}
}
addEventListener("keydown", (e) => { if (e.key === "b" || e.key === "B") { forced = !buildOn; render(); } if (e.key === "Escape") { forced = null; render(); } });
poll(); if (!T) setInterval(poll, 700);
