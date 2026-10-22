// The Lodge Show deck: one slide on show at a time (by #hash), sprites, QR codes, and the scaffold slide's rig.
// ?board=1: shown on the big screen's board, which drives it; no nav bar or pager of its own.
if (new URLSearchParams(location.search).has('board')) document.documentElement.classList.add('on-board');
const showCurrentScene = () => {
  const active = location.hash.slice(1) || document.querySelector('.candidate').id;
  document.querySelectorAll('.candidate').forEach(scene => { scene.hidden = scene.id !== active; });
};
// Each slide's 1600×1000 canvas, scaled to fit its box and centred (one column on phones: no scaling).
const fitCanvas = () => document.querySelectorAll('.candidate:not([hidden]) .cv').forEach(cv => {
  const box = cv.parentElement, w = box.clientWidth, h = box.clientHeight;
  if (innerWidth <= 760) { cv.style.transform = ''; return; }
  const k = Math.min(w / 1600, h / 1000);
  cv.style.transform = `translate(${(w - 1600 * k) / 2}px, ${(h - 1000 * k) / 2}px) scale(${k})`;
});
showCurrentScene(); fitCanvas();
addEventListener('hashchange', () => { showCurrentScene(); fitCanvas(); });
addEventListener('resize', fitCanvas);
if (window.ResizeObserver) document.querySelectorAll('.candidate').forEach(c => new ResizeObserver(fitCanvas).observe(c));

document.querySelectorAll('[data-wolt]').forEach(el => { el.innerHTML = woltSpriteAvatar(el.dataset.wolt, 112); });
// Provider badges (IWCL slide): the model's mark over each wolt.
// Each provider's own colours, the same badges as on the scaffold slide.
const BRANDS = {
  claude:      { bg: '#fff3dc', fg: '#d97757', c: '#d97757' },
  openai:      { bg: '#ffffff', fg: '#000000', c: '#ffffff' },
  deepseek:    { bg: '#ffffff', fg: '#4d6bfe', c: '#4d6bfe' },
  huggingface: { bg: '#111111', fg: '#ffd21e', c: '#ffd21e' },
};
document.querySelectorAll('[data-logo]').forEach(el => {
  const k = el.dataset.logo, b = BRANDS[k];
  el.innerHTML = `<svg viewBox="0 0 24 24"><path d="${LOGOS[k]}"/></svg>`;
  if (b) el.setAttribute('style', `--bg-b:${b.bg};--fg:${b.fg};--c:${b.c}`);
});
// The lodge, in pixels: a log cabin with a chimney (the IWCL slide's middle).
document.querySelectorAll('.lodge-px').forEach(el => {
  const px = [];
  const R = (x, y, w, h, c) => px.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${c}"/>`);
  R(21, 2, 3, 6, '#7a3010'); R(20, 1, 5, 1, '#5a2008');                                  // chimney
  for (let i = 0; i < 8; i++) R(15 - i * 2, 2 + i, 2 + i * 4, 1, i % 2 ? '#c4531e' : '#e9824b'); // roof, stepped
  R(1, 10, 30, 1, '#6a2a0e');
  for (let y = 11; y < 24; y += 2) { R(2, y, 28, 1, '#8b4a22'); R(2, y + 1, 28, 1, '#a35d2c'); }  // logs
  R(13, 16, 6, 8, '#3a1a0a'); R(17, 20, 1, 1, '#ffca4e');                                // door + knob
  R(5, 14, 5, 4, '#ffca4e'); R(22, 14, 5, 4, '#ffca4e'); R(7, 14, 1, 4, '#6a2a0e'); R(24, 14, 1, 4, '#6a2a0e'); // lit windows
  R(0, 24, 32, 2, '#3c6b2f');                                                             // grass
  el.innerHTML = `<svg viewBox="0 0 32 26" shape-rendering="crispEdges">${px.join('')}</svg>`;
});

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

// IWCL slide: wolts message each other both ways, at random, sped up, sometimes at once. Each message
// lights its line, flashes arrows towards the one it's for, and pops a small @ box by them.
(function iwcl() {
  const tri = document.querySelector('#iwcl .tri'), pings = tri.querySelector('.pings');
  const P = { top: [50, 18], left: [16, 80], right: [84, 80] }; // card centres, % of the triangle box
  const AT = { top: '@raccoona', left: '@justinbeaver', right: '@lottery' };
  const EDGE = { 'top|left': 0, 'left|right': 1, 'right|top': 2 };
  const edgeOf = (a, b) => EDGE[`${a}|${b}`] ?? EDGE[`${b}|${a}`];
  const busy = new Set();
  function send() {
    if (document.getElementById('iwcl').hidden) return;
    const names = Object.keys(P), from = names[Math.floor(Math.random() * 3)];
    const to = names.filter(n => n !== from)[Math.floor(Math.random() * 2)], e = edgeOf(from, to);
    if (busy.has(e)) return; // one message per line at a time
    busy.add(e);
    const w = tri.clientWidth, h = tri.clientHeight, path = tri.querySelector(`svg path[data-e="${e}"]`);
    path.classList.add('on');
    const [x0, y0] = P[from].map((v, i) => v / 100 * (i ? h : w)), [x1, y1] = P[to].map((v, i) => v / 100 * (i ? h : w));
    const deg = Math.atan2(y1 - y0, x1 - x0) * 180 / Math.PI;
    let html = '';
    [0.3, 0.42, 0.54].forEach((f, i) => { html += `<i class="arrow" style="left:${x0 + (x1 - x0) * f}px;top:${y0 + (y1 - y0) * f}px;rotate:${deg}deg;animation-delay:${i * .1}s"></i>`; });
    // The @ box sits near the one it's for, pushed off the line, away from the triangle's middle.
    const len = Math.hypot(x1 - x0, y1 - y0), nx = -(y1 - y0) / len, ny = (x1 - x0) / len;
    const mx = x0 + (x1 - x0) * 0.68, my = y0 + (y1 - y0) * 0.68, cx = w * .5, cy = h * .59;
    const out = Math.abs(deg) < 10 || Math.abs(deg) > 170 ? (ny > 0 ? -1 : 1) : (mx - cx) * nx + (my - cy) * ny > 0 ? 1 : -1; // the bottom line: above it
    html += `<div class="ping" style="left:${mx + nx * out * 58}px;top:${my + ny * out * 58}px"><b>@</b>${AT[to].slice(1)}</div>`;
    const msg = document.createElement('div'); msg.innerHTML = html; pings.appendChild(msg);
    setTimeout(() => { msg.remove(); busy.delete(e); if (!busy.has(e)) path.classList.remove('on'); }, 900 + Math.random() * 500);
  }
  (function loop() { send(); setTimeout(loop, 250 + Math.random() * 450); })();
})();

