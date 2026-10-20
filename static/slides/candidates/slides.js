// The Lodge Show deck: one slide on show at a time (by #hash), sprites, QR codes, and the scaffold slide's rig.
// ?board=1: shown on the big screen's board, which drives it; no nav bar or pager of its own.
if (new URLSearchParams(location.search).has('board')) document.documentElement.classList.add('on-board');
const showCurrentScene = () => {
  const active = location.hash.slice(1) || document.querySelector('.candidate').id;
  document.querySelectorAll('.candidate').forEach(scene => { scene.hidden = scene.id !== active; });
};
showCurrentScene();
addEventListener('hashchange', showCurrentScene);

document.querySelectorAll('[data-wolt]').forEach(el => { el.innerHTML = woltSpriteAvatar(el.dataset.wolt, 112); });

// QR codes: data-qr="room" is the show's own page (the app root, three levels up from here), else a URL.
const ROOM = new URL('../../../', location.href);
document.querySelectorAll('.room-url').forEach(el => { el.textContent = (ROOM.host + ROOM.pathname).replace(/\/$/, ''); });
document.querySelectorAll('[data-qr]').forEach(el => {
  const url = el.dataset.qr === 'room' ? ROOM.href : el.dataset.qr;
  if (el.dataset.qr === 'room') el.href = url;
  if (window.QRCode) new QRCode(el.querySelector('.qr'), { text: url, width: 170, height: 170, correctLevel: QRCode.CorrectLevel.M });
});

// The scaffold slide: Donkey Kong girders (woltspace) and ladders; each wolt walks and climbs with its model's
// badge overhead (the harness). Drawn in a 1150×800 box, scaled to fit.
(function rig() {
  const box = document.querySelector('#scaffold .rig-box'), scene = box.querySelector('.rig');
  const BRAND = {
    claude:      { bg: '#fff3dc', fg: '#d97757', c: '#d97757' },
    openai:      { bg: '#ffffff', fg: '#000000', c: '#ffffff' },
    deepseek:    { bg: '#ffffff', fg: '#4d6bfe', c: '#4d6bfe' },
    huggingface: { bg: '#111111', fg: '#ffd21e', c: '#ffd21e' },
  };
  const mark = k => `<svg viewBox="0 0 24 24"><path d="${LOGOS[k]}"/></svg>`;
  const vars = k => `--bg-b:${BRAND[k].bg};--fg:${BRAND[k].fg};--c:${BRAND[k].c}`;
  document.querySelector('#scaffold .marks').innerHTML = Object.keys(BRAND).map(k => `<i style="${vars(k)}">${mark(k)}</i>`).join('');

  const G = [ // the girders: x0, y0 (top surface at the left end), x1, y1, and the sign under it
    { x0: 30,  y0: 760, x1: 1120, y1: 730, t: 'tmux · a terminal each' },
    { x0: 30,  y0: 570, x1: 1040, y1: 600, t: 'IWCL · wolts talk to wolts' },
    { x0: 110, y0: 440, x1: 1120, y1: 410, t: 'memory · identity · site' },
    { x0: 30,  y0: 250, x1: 760,  y1: 270, t: 'the lodge' },
  ];
  const L = [{ g: 0, x: 960 }, { g: 1, x: 180 }, { g: 2, x: 640 }]; // a ladder from girder g up to g+1, at x
  const SEG = 30, H = 22;
  const yAt = (g, x) => { const s = Math.floor((x - g.x0) / SEG), n = Math.ceil((g.x1 - g.x0) / SEG);
    return g.y0 + (g.y1 - g.y0) * Math.max(0, Math.min(1, s / (n - 1))); };
  let svg = `<defs><pattern id="truss" width="${SEG}" height="${H}" patternUnits="userSpaceOnUse">
    <rect width="${SEG}" height="${H}" fill="#c4531e"/><rect width="${SEG}" height="4" fill="#e9824b"/><rect y="${H - 4}" width="${SEG}" height="4" fill="#7a3010"/>
    <path d="M0 4 L${SEG / 2} ${H - 4} L${SEG} 4" stroke="#6a2a0e" stroke-width="4" fill="none"/></pattern></defs>`;
  for (const l of L) { // ladders first, so the girders sit on their ends
    const yb = yAt(G[l.g], l.x), yt = yAt(G[l.g + 1], l.x) + H;
    svg += `<rect x="${l.x}" y="${yt}" width="6" height="${yb - yt}" fill="#ffca4e"/><rect x="${l.x + 34}" y="${yt}" width="6" height="${yb - yt}" fill="#ffca4e"/>`;
    for (let y = yt + 12; y < yb - 4; y += 18) svg += `<rect x="${l.x}" y="${y}" width="40" height="5" fill="#ffca4e"/>`;
  }
  G.forEach(g => { for (let x = g.x0; x < g.x1; x += SEG) svg += `<rect x="${x}" y="${yAt(g, x)}" width="${SEG}" height="${H}" fill="url(#truss)"/>`; });
  svg += `<text x="${G[3].x0 + 40}" y="${G[3].y0 - 14}" font-size="76">🪵</text><text x="${G[3].x0 + 130}" y="${G[3].y0 - 14}" font-size="76">🏠</text>`;
  scene.querySelector('.girders').innerHTML = svg;
  // Signs hang under each girder, in front of the wolts (they walk behind them).
  scene.querySelector('.signs').innerHTML = G.map(g => {
    const mx = (g.x0 + g.x1) / 2, w = g.t.length * 13 + 36, y = yAt(g, mx) + H + 8;
    return `<rect x="${mx - w / 2}" y="${y}" width="${w}" height="34" fill="#fff8e6" stroke="#18100a" stroke-width="4"/>
      <text x="${mx}" y="${y + 23}" text-anchor="middle" class="sign">${g.t}</text>`;
  }).join('');

  const W = 72, lx = i => L[i].x + 20, on = (g, x) => ({ x, y: yAt(G[g], x) });
  const CAST = [
    { kind: 'raccoon', brand: 'claude',      speed: 120, path: [on(0, 90), on(0, lx(0)), on(1, lx(0)), on(1, 420)] },
    { kind: 'beaver',  brand: 'openai',      speed: 100, path: [on(1, 980), on(1, lx(1)), on(2, lx(1)), on(2, 520)] },
    { kind: 'raccoon', brand: 'deepseek',    speed: 110, path: [on(2, 1060), on(2, lx(2)), on(3, lx(2)), on(3, 300)] },
    { kind: 'beaver',  brand: 'huggingface', speed: 90,  path: [on(0, 1080), on(0, 560)] },
  ];
  const actors = CAST.map((a, i) => {
    const el = document.createElement('div'); el.className = 'rig-wolt';
    el.innerHTML = `<div class="badge" style="${vars(a.brand)}">${mark(a.brand)}</div><div class="body">${woltSpriteAvatar(a.kind, W)}</div>`;
    scene.appendChild(el);
    const seg = []; let total = 0; // walked forward, then back
    for (let k = 1; k < a.path.length; k++) { const p = a.path[k - 1], q = a.path[k], d = Math.hypot(q.x - p.x, q.y - p.y); seg.push({ p, q, d, at: total }); total += d; }
    return { ...a, el, body: el.querySelector('.body'), seg, total, offset: i * 1.7 };
  });
  function frame(ms) {
    const t = ms / 1000;
    if (!document.getElementById('scaffold').hidden) for (const a of actors) {
      const span = a.total / a.speed, u = ((t + a.offset) % (2 * span)) / span, fwd = u < 1, dist = (fwd ? u : 2 - u) * a.total;
      const s = a.seg.find(s => dist <= s.at + s.d) || a.seg[a.seg.length - 1], f = s.d ? (dist - s.at) / s.d : 0;
      const x = s.p.x + (s.q.x - s.p.x) * f, climbing = Math.abs(s.q.x - s.p.x) < 1;
      const g = G.findIndex(g => Math.abs(yAt(g, s.p.x) - s.p.y) < 1 && Math.abs(yAt(g, s.q.x) - s.q.y) < 1);
      const y = climbing || g < 0 ? s.p.y + (s.q.y - s.p.y) * f : yAt(G[g], x);
      const dir = climbing ? 1 : (s.q.x > s.p.x) === fwd ? 1 : -1, step = Math.floor(t * 8) % 2;
      a.el.style.transform = `translate(${x - W / 2}px, ${y - W - step * 3}px)`;
      a.body.style.transform = climbing ? `rotate(${step ? -6 : 6}deg)` : `scaleX(${dir})`;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  const fit = () => { scene.style.transform = `scale(${box.clientWidth / 1150})`; };
  addEventListener('resize', fit); addEventListener('hashchange', fit); fit();
})();
