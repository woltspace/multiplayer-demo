// Presenter keys (commie, 2026-10-03): a clicker or keyboard can walk the whole
// book. Next: → ↓ Page Down Space. Previous: ← ↑ Page Up. Each key goes through
// the same path as the on-screen pager, so pages keep their own steps (the
// cover turns first, Workshop plays its lines). Arrows a page already handles
// itself are left to it.
(function () {
  const NEXT = ['ArrowRight', 'ArrowDown', 'PageDown', ' '];
  const PREVIOUS = ['ArrowLeft', 'ArrowUp', 'PageUp'];
  // Capture phase: read the page state before the page's own key handlers change it.
  document.addEventListener('keydown', (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.repeat) return;
    if (event.target.closest && event.target.closest('input, textarea, select, [contenteditable]')) return;
    const direction = NEXT.includes(event.key) ? 'next' : PREVIOUS.includes(event.key) ? 'previous' : null;
    if (!direction) return;
    const onTerminal = location.pathname.endsWith('/terminal.html');
    const onCoverPage = Boolean(document.getElementById('book'));
    const coverClosed = document.body.classList.contains('cover-active');
    if (onTerminal && (event.key === 'ArrowRight' || event.key === 'ArrowLeft')) return;
    if (onCoverPage && (event.key === 'ArrowLeft' || (event.key === 'ArrowRight' && coverClosed))) return;
    event.preventDefault();
    if (onCoverPage && coverClosed) {
      if (direction === 'next') document.getElementById('cover-page').click();
      return;
    }
    const button = document.querySelector(`.mobile-pager [data-direction="${direction}"]`);
    if (button) button.click();
  }, true);
})();
