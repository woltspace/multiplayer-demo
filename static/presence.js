// Presence: "multiplayer Google Docs" for the page the wolts build. Each wolt owns one part file; on every save the
// shell swaps in the new part and outlines exactly what changed, in that wolt's color, with its name and a cursor.
// The agents do nothing special: this only compares the HTML they wrote before and after.
const Presence = (() => {
  const same = (a, b) => a.nodeType === b.nodeType && (a.nodeType !== 1 || a.tagName === b.tagName);

  // Walk old and new side by side. Keep what's identical, recurse into what has the same shape, replace the rest.
  // Returns the elements that changed (deepest first), so the outline lands on the actual edit, not the whole part.
  function patch(oldEl, newEl, changed, root = false) {
    const a = [...oldEl.childNodes], b = [...newEl.childNodes];
    if (!root) for (const at of newEl.attributes || []) if (oldEl.getAttribute(at.name) !== at.value) { oldEl.setAttribute(at.name, at.value); changed.add(oldEl); }
    if (!root) for (const at of [...(oldEl.attributes || [])]) if (!newEl.hasAttribute(at.name)) { oldEl.removeAttribute(at.name); changed.add(oldEl); }
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      const o = a[i], n = b[i];
      if (!n) { o.remove(); changed.add(oldEl); continue; }
      if (!o) { const c = n.cloneNode(true); oldEl.append(c); changed.add(c.nodeType === 1 ? c : oldEl); continue; }
      if (o.isEqualNode(n)) continue;
      if (same(o, n) && o.nodeType === 1 && o.tagName !== "SCRIPT") { patch(o, n, changed); continue; }
      const c = n.cloneNode(true); o.replaceWith(c); changed.add(c.nodeType === 1 ? c : oldEl);
    }
  }

  function mark(el, who) {
    const r = el.getBoundingClientRect(), host = el.closest("[data-part]");
    if (!r.width || !host) return;
    const box = host.getBoundingClientRect();
    const tag = document.createElement("div");
    tag.className = "presence"; tag.dataset.c = who.slot;
    tag.style.cssText = `left:${r.left - box.left - 4}px;top:${r.top - box.top - 4}px;width:${r.width + 8}px;height:${r.height + 8}px`;
    tag.innerHTML = `<span class=who></span><i class=caret></i>`;
    tag.querySelector(".who").textContent = `${who.name} ✎`;
    host.append(tag);
    setTimeout(() => tag.classList.add("out"), 1600);
    setTimeout(() => tag.remove(), 2400);
  }

  // Swap a part in. Scripts in the part run again when they change (a game restarts on its own edit).
  function apply(partEl, html, who) {
    const next = document.createElement("div"); next.innerHTML = html;
    const body = partEl.querySelector(".part-body");
    const changed = new Set(); patch(body, next, changed, true);
    for (const s of body.querySelectorAll("script")) if (changed.has(s) || !s.dataset.ran) {
      const run = document.createElement("script"); run.textContent = s.textContent; run.dataset.ran = 1; s.replaceWith(run);
    }
    // Outline at most 4 edits, the smallest ones, and never the whole part when only a word moved.
    const list = [...changed].filter((e) => e.nodeType === 1 && e !== body && ![...changed].some((d) => d !== e && e.contains(d)));
    (list.length ? list : [body]).slice(0, 4).forEach((e) => mark(e, who));
    partEl.dataset.editing = who.name;
  }
  return {apply};
})();
