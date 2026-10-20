// Player phone: claim the spot, name + create your wolt, then type to it. Polls the app, no websockets.
const TOKEN = location.pathname.split("/").pop();
const T = new URLSearchParams(location.search).get("t"); // mock clock (screenshots)
const API = `../api/p/${TOKEN}`;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"}[c]));
const av = (c, s) => `<span class=av>${woltSpriteAvatar(c, s) || ""}</span>`;
let st = null, creature = "beaver", drawn = "";

function view() {
  const app = $("app");
  document.body.dataset.c = st.slot;
  // Creating a wolt is always open. Players type once the host starts the game (and not while the board is up).
  // The host can always type, and gets the ▶ Start the game button until the game is on.
  const held = st.slot !== "host" && st.phase && st.phase !== "live";
  // Shared world: one turn at a time. A player types on their turn, until their wolt has posted.
  const myTurn = !st.world || !st.game || st.slot === "host" || (!st.turn_over && st.turn === st.slot && !st.turn_busy);
  const wait = held || (st.slot !== "host" && st.game === false) || !myTurn;
  const note = held ? `<div class=paused>The show continues in a moment. You can already create your wolt.</div>`
    : st.slot !== "host" && st.game === false ? `<div class=paused>⏳ The game starts in a moment. Get your idea ready!</div>`
    : st.turn_over && st.slot !== "host" ? `<div class=paused>⏱ Time's up! Thanks for building. Play the game on the big screen.</div>`
    : !myTurn ? `<div class=paused>${st.turn === st.slot ? "🛠 The wolts are on it…" : `⏳ ${esc(st.turn_player || "someone")}'s turn. You're next soon!`}</div>`
    : st.world && st.game && st.slot !== "host" ? `<div class="paused go">▸ Your turn! Tell the wolts what to add.</div>`
    : st.world && st.game && st.slot === "host" && st.turn && st.turn !== "host" && !st.turn_over ? `<button class=skipb id=skipb>⏭ Skip ${esc(st.turn_player || "this turn")}</button>`
    : st.slot === "host" && st.game === false ? `<button class=startg id=startg>▶ Start the game</button>` : "";
  if (!st.wolt) {
    $("bar").hidden = true;
    if (drawn === "form" + wait) { const g = $("go"); if (g && !g.dataset.busy) g.disabled = false; const n = $("pnote"); if (n) n.innerHTML = note; return; }
    drawn = "form" + wait;
    app.innerHTML = `<div id=pnote>${note}</div><span class=tag>${esc(st.label)}</span><h1>You're on stage 🎤</h1>
      <p class=sub>Name your wolt and it wakes up in tonight's lodge. Then tell it what to build. The whole room watches.</p>
      <form id=cf class=card autocomplete=off>
        <label for=pn>Your name</label><input id=pn maxlength=24 required placeholder="Maya">
        <label for=wn>Name your wolt</label><input id=wn maxlength=24 required placeholder="flint">
        <label>Pick a creature</label>
        <div class=pick>${["otter", "beaver", "raccoon"].map((c) => `<button type=button data-k=${c} class="${c === creature ? "on" : ""}">${av(c, 56)}${c}</button>`).join("")}</div>
        <div class=err id=err role=status></div>
        <button id=go>Create my wolt</button>
      </form>`;
    app.querySelectorAll(".pick button").forEach((b) => b.onclick = () => { creature = b.dataset.k; app.querySelectorAll(".pick button").forEach((x) => x.classList.toggle("on", x === b)); });
    $("cf").onsubmit = create;
    return;
  }
  $("bar").hidden = false; $("send").disabled = wait;
  // Shared world: the phone shows the whole #lodge group chat. @mentions are lit; ones for your wolt stand out,
  // your wolt's posts say so, and everything else reads as the group talking.
  const me = st.wolt.name.toLowerCase();
  const lit = (t) => esc(t).replace(/@([a-z0-9_-]+)/gi, (x, n) => `<b class="${n.toLowerCase() === me ? "atme" : "at"}">@${n}</b>`);
  const msgs = st.messages.map((m) => {
    const mine = m.type === "say" && (!st.world || m.slot === st.slot);
    const mywolt = st.world && m.type === "post" && m.from === st.wolt.name;
    const forme = st.world && new RegExp("@" + me + "\\b", "i").test(m.text || "");
    const who = mine ? "you" : mywolt ? `${esc(m.from)} · your wolt` : esc(m.from);
    return `<div class="m${mine ? " mine" : ""}${mywolt ? " mywolt" : ""}${forme ? " forme" : ""}"><div class=who>${who}</div><div class=bb>${lit(m.text)}</div></div>`;
  }).join("");
  const key = st.wolt.name + "|" + st.messages.length + "|" + wait + "|" + st.game + "|" + st.turn + "|" + st.turn_busy + "|" + st.turn_over;
  if (drawn === key) return; drawn = key;
  app.innerHTML = `${note}<span class=tag>${st.slot === "host" ? "you · the host" : esc(st.label) + " · " + esc(st.player || "")}</span>
    <div class="card me">${av(st.wolt.creature, 54)}<div><div class=nm>${esc(st.wolt.name)}</div><div class=hs>your wolt · ${esc(st.wolt.harness || "")}</div></div><span class=live>in the lodge</span></div>
    ${st.world ? `<div class=grp># lodge · group chat · everyone sees this</div>` : ""}
    <div class=msgs>${msgs || `<div class=waking>${av(st.wolt.creature, 64)}<br>${esc(st.wolt.name)} is waking up…<br>say hi, or tell it what to build</div>`}</div>
    <p class=hint>everything you type shows up on the big screen</p>`;
  const sg = $("startg"); if (sg) sg.onclick = startGame;
  const sk = $("skipb"); if (sk) sk.onclick = async () => { sk.disabled = true; await fetch(API + "/skip", {method: "POST"}).catch(() => null); load(); };
  scrollTo(0, document.body.scrollHeight);
}

async function startGame() {
  const b = $("startg"); b.disabled = true; b.textContent = "starting…";
  const r = await fetch(API + "/start", {method: "POST"}).catch(() => null);
  if (!r || !r.ok) { b.disabled = false; b.textContent = "▶ Start the game (try again)"; return; }
  load();
}

async function load() {
  try {
    const r = await fetch(API + (T ? "?t=" + T : ""), {cache: "no-store"});
    if (r.status === 409) { $("app").innerHTML = `<div class="card taken"><h1>Spot taken</h1><p class=sub>Someone already scanned this player QR. Enjoy the show on the big screen!</p></div>`; return; }
    if (!r.ok) return;
    st = await r.json(); view();
  } catch {}
}

async function create(e) {
  e.preventDefault(); $("go").disabled = true; $("go").dataset.busy = 1; $("err").textContent = "waking it up…";
  const r = await fetch(API + "/create", {method: "POST", headers: {"content-type": "application/json"},
    body: JSON.stringify({player: $("pn").value, wolt: $("wn").value, creature})});
  if (!r.ok) { const d = await r.json().catch(() => ({})); $("err").textContent = d.detail || "that didn't work, try again"; $("go").disabled = false; delete $("go").dataset.busy; return; }
  drawn = ""; load();
}

$("sayf").onsubmit = async (e) => {
  e.preventDefault(); const text = $("say").value.trim(); if (!text) return;
  $("send").disabled = true;
  const r = await fetch(API + "/say", {method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify({text})});
  $("send").disabled = false;
  if (r.ok) { $("say").value = ""; load(); } else { const d = await r.json().catch(() => ({})); $("say").placeholder = d.detail || "try again"; }
};
// Live typing: send the draft (throttled) so the big screen can show it in this wolt's terminal as it's typed.
let draftT = null, draftSent = "";
$("say").addEventListener("input", () => {
  if (draftT) return;
  draftT = setTimeout(async () => {
    draftT = null; const text = $("say").value;
    if (text === draftSent) return; draftSent = text;
    fetch(API + "/draft", {method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify({text: text.slice(0, 280)})}).catch(() => {});
  }, 300);
});
$("say").addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("sayf").requestSubmit(); } });
load(); if (!T) setInterval(load, 1500);
