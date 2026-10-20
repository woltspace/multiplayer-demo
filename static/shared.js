// window.shared: the room's one game state. Every copy of the page (the big screen's woltPhone, every phone in the
// room) reads and writes the same small state through the show app, so a tap on one phone shows up everywhere.
//
//   shared.add("logs")            // +1 for everyone (shared.add("score", 5) for +5)
//   shared.set("phase", "won")    // numbers, true/false, short strings
//   shared.get("logs", 0)         // current value, or the default
//   shared.on("partA", (s) => { render(s.logs || 0) })   // called now and on every change; one listener per name
//
// Writes show up locally at once and on every other screen within about half a second.
(() => {
  const API = "api/shared";
  let state = {}, v = -1;
  const subs = new Map();
  const emit = () => subs.forEach((f) => { try { f(state); } catch (e) { console.error(e); } });
  const take = (d) => { if (d && typeof d.v === "number" && d.v >= v) { const changed = d.v !== v; v = d.v; state = d.state || {}; if (changed) emit(); } };
  async function pull() { try { const r = await fetch(API, {cache: "no-store"}); if (r.ok) take(await r.json()); } catch {} }
  async function push(op) {
    try {
      const r = await fetch(API, {method: "POST", headers: {"content-type": "text/plain"}, body: JSON.stringify(op)});
      if (r.ok) take(await r.json());
    } catch {}
  }
  window.shared = {
    get: (k, d) => (k in state ? state[k] : d),
    all: () => ({...state}),
    add(k, n = 1) { state = {...state, [k]: (typeof state[k] === "number" ? state[k] : 0) + n}; emit(); push({op: "add", key: k, value: n}); },
    set(k, val) { state = {...state, [k]: val}; emit(); push({op: "set", key: k, value: val}); },
    on(name, f) { subs.set(String(name), f); try { f(state); } catch (e) { console.error(e); } },
  };
  pull(); setInterval(pull, 500);
})();
