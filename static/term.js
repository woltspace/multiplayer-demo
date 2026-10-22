// Terminal rendering shared by the big screens: tmux capture-pane -e lines to coloured HTML, minus the harness chrome.
// Needs a global esc().
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
    if (i % 2 === 0) { if (parts[i]) out += esc(parts[i].replace(/\x1b\[[0-9;?]*[A-Za-z]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, "")); continue; }
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
// keepInput: keep the harness's input box (the lanes show it, so the room sees the prompt like a real terminal).
function chromeless(lines, keepInput = false) {
  const plain = lines.map((l) => l.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, ""));
  for (let i = plain.length - 1; i > 0 && !keepInput; i--) {
    if (/^\s*[─━-]{20,}/.test(plain[i]) && /^\s*[❯›>]/.test(plain[i + 1] || "")) { lines = lines.slice(0, i); break; }
  }
  return lines.filter((l, i) => !/Update available!|^\s*$/.test(l.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "")) || false);
}
