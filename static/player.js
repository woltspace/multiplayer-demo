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
  // Before Start and while paused, players wait (the host can always brief its wolt).
  const wait = st.slot !== "host" && st.phase && st.phase !== "live";
  const note = wait ? `<div class=paused>${st.phase === "paused" ? "⏸ The show is paused. Back in a moment." : "The show starts in a moment. You can pick your names now."}</div>` : "";
  if (!st.wolt) {
    $("bar").hidden = true;
    if (drawn === "form" + wait) { const g = $("go"); if (g && !g.dataset.busy) g.disabled = wait; const n = $("pnote"); if (n) n.innerHTML = note; return; }
    drawn = "form" + wait;
    app.innerHTML = `<div id=pnote>${note}</div><span class=tag>${esc(st.label)}</span><h1>You're on stage 🎤</h1>
      <p class=sub>Name your wolt and it wakes up in tonight's lodge. Then tell it what to build. The whole room watches.</p>
      <form id=cf class=card autocomplete=off>
        <label for=pn>Your name</label><input id=pn maxlength=24 required placeholder="Maya">
        <label for=wn>Name your wolt</label><input id=wn maxlength=24 required placeholder="flint">
        <label>Pick a creature</label>
        <div class=pick>${["beaver", "otter", "raccoon"].map((c) => `<button type=button data-k=${c} class="${c === creature ? "on" : ""}">${av(c, 56)}${c}</button>`).join("")}</div>
        <div class=err id=err role=status></div>
        <button id=go${wait ? " disabled" : ""}>Create my wolt</button>
      </form>`;
    app.querySelectorAll(".pick button").forEach((b) => b.onclick = () => { creature = b.dataset.k; app.querySelectorAll(".pick button").forEach((x) => x.classList.toggle("on", x === b)); });
    $("cf").onsubmit = create;
    return;
  }
  $("bar").hidden = false; $("send").disabled = wait;
  const msgs = st.messages.map((m) => {
    const mine = m.type === "say";
    return `<div class="m${mine ? " mine" : ""}"><div class=who>${mine ? "you" : esc(m.from)}</div><div class=bb>${esc(m.text)}</div></div>`;
  }).join("");
  const key = st.wolt.name + "|" + st.messages.length + "|" + wait;
  if (drawn === key) return; drawn = key;
  app.innerHTML = `${note}<span class=tag>${st.slot === "host" ? "you · the host" : esc(st.label) + " · " + esc(st.player || "")}</span>
    <div class="card me">${av(st.wolt.creature, 54)}<div><div class=nm>${esc(st.wolt.name)}</div><div class=hs>your wolt · ${esc(st.wolt.harness || "")}</div></div><span class=live>in the lodge</span></div>
    <div class=msgs>${msgs || `<div class=waking>${av(st.wolt.creature, 64)}<br>${esc(st.wolt.name)} is waking up…<br>say hi, or tell it what to build</div>`}</div>
    <p class=hint>everything you type shows up on the big screen</p>`;
  scrollTo(0, document.body.scrollHeight);
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
$("say").addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("sayf").requestSubmit(); } });
load(); if (!T) setInterval(load, 1500);
