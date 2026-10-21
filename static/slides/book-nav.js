(async function () {
  if (document.querySelector('.book-nav')) return;

  // Inside the one-page Book (book.html), slide turns ask the shell to switch
  // frames instead of loading a new page.
  const shell = (() => { try { return window.parent !== window ? window.parent.bookShell : null; } catch (_error) { return null; } })();
  const go = url => (shell ? shell.go(new URL(url, location.href).href) : (location.href = url));
  window.bookGo = go;
  if (shell) document.documentElement.classList.add('in-book');
  if (shell) document.addEventListener('click', event => {
    const link = event.target.closest && event.target.closest('a[href]');
    if (!link || link.target === '_blank' || event.defaultPrevented) return;
    const url = new URL(link.href, location.href);
    if (url.origin !== location.origin || (url.pathname === location.pathname && url.search === location.search)) return;
    if (!/(\.html|\/)$/.test(url.pathname)) return;
    event.preventDefault();
    go(url.href);
  }, true);

  const inCandidates = location.pathname.includes('/candidates/');
  const prefix = inCandidates ? '../' : '';
  const path = location.pathname;
  const currentChapter = () => {
    if (path.endsWith('/terminal.html')) return 'workshop';
    if (path.endsWith('/text.html')) return 'text';
    // Lodge Show deck: every slide is a #hash in candidates/, listed in release-manifest.json.
    if (inCandidates) return (chapters.find(chapter => chapter.url.endsWith(location.hash)) || chapters[0]).id;
    if (document.body.classList.contains('solo-cover')) return 'cover';
    if (document.body.classList.contains('solo-lodge')) return 'lodge';
    return document.body.classList.contains('cover-active') ? 'cover' : 'lodge';
  };

  const fallback = [{ id: 'cover', number: 1, title: 'jerpint', url: 'candidates/index.html#cover' }];
  let chapters = fallback;
  try {
    const response = await fetch(`${prefix}release-manifest.json`, { cache: 'no-store' });
    if (response.ok) chapters = (await response.json()).chapters;
  } catch (_error) {
    // The embedded fallback keeps navigation functional in offline previews.
  }

  const hrefFor = chapter => `${prefix}${chapter.url}`;
  const active = currentChapter();
  document.head.insertAdjacentHTML('beforeend', `<link rel="stylesheet" href="${prefix}book-nav.css?v=20261001-01">`);
  document.body.insertAdjacentHTML('afterbegin', `<nav class="book-nav" aria-label="Book chapters"><a class="book-brand" href="${hrefFor(chapters[0])}" aria-label="Multiplayer multi-agent, first slide"><span>MULTIPLAYER MULTI-AGENT</span><small class="book-progress"></small></a><div class="book-chapters">${chapters.map(chapter => `<a data-chapter="${chapter.id}" title="${chapter.title}" class="${active === chapter.id ? 'active' : ''}" href="${hrefFor(chapter)}" ${active === chapter.id ? 'aria-current="page"' : ''}><i>${chapter.number}</i>${chapter.title}</a>`).join('')}</div><button class="book-fullscreen" type="button" aria-label="Enter fullscreen presentation" title="Fullscreen">⛶</button></nav>`);
  document.body.insertAdjacentHTML('beforeend', '<nav class="mobile-pager" aria-label="Story navigation"><button type="button" data-direction="previous" aria-label="Go back"><span>←</span></button><button type="button" data-direction="next" aria-label="Go forward"><span>→</span></button></nav>');

  const setActive = chapterId => {
    document.querySelectorAll('.book-chapters a').forEach(link => {
      const selected = link.dataset.chapter === chapterId;
      link.classList.toggle('active', selected);
      selected ? link.setAttribute('aria-current', 'page') : link.removeAttribute('aria-current');
    });
    const index = chapters.findIndex(chapter => chapter.id === chapterId);
    const offset = chapters[0].id === 'cover' ? 0 : 1;
    document.querySelector('.book-progress').textContent = chapterId === 'text' ? 'TEXT EDITION' : chapterId === 'cover' ? 'COVER' : `${String(index + offset).padStart(2, '0')} / ${String(chapters.length - 1 + offset).padStart(2, '0')}`;
  };
  setActive(active);
  // The cover turns inside the lodge page: keep the nav (and the one-page Book's link) in step.
  addEventListener('book:turned', () => {
    const chapterId = currentChapter();
    setActive(chapterId);
  });

  const fullscreen = document.querySelector('.book-fullscreen');
  if (!(shell ? window.parent.document : document).documentElement.requestFullscreen) fullscreen.hidden = true;
  fullscreen.addEventListener('click', async () => {
    if (shell) return shell.fullscreen();
    document.fullscreenElement ? await document.exitFullscreen() : await document.documentElement.requestFullscreen();
  });
  (shell ? window.parent.document : document).addEventListener('fullscreenchange', () => {
    const isFullscreen = Boolean((shell ? window.parent.document : document).fullscreenElement);
    fullscreen.textContent = isFullscreen ? '×' : '⛶';
    fullscreen.setAttribute('aria-label', isFullscreen ? 'Exit fullscreen presentation' : 'Enter fullscreen presentation');
  });
  if (inCandidates) addEventListener('hashchange', () => setActive(currentChapter()));

  const navigate = direction => {
    const event = new CustomEvent('book:navigate', { detail: { direction }, cancelable: true });
    if (!window.dispatchEvent(event)) return;
    const chapterId = currentChapter();
    const index = chapters.findIndex(chapter => chapter.id === chapterId);
    const target = direction === 'next' ? chapters[index + 1] : chapters[index - 1];
    if (target) go(hrefFor(target));
    // The last slide is the end: no wrapping back to the cover (jerpint 2026-10-07).
  };
  // Desktop: a click on the slide itself goes forward, like a clicker (jerpint 2026-10-07).
  // Links, buttons, the video, the terminal and the cover keep their own clicks.
  document.addEventListener('click', event => {
    if (innerWidth < 761 || event.defaultPrevented || event.button !== 0) return;
    if (event.target.closest && event.target.closest('a, button, video, input, textarea, select, label, summary, .terminal, #cover-page, .question, .book-nav, .mobile-pager')) return;
    if (getSelection && String(getSelection()).length) return;
    navigate('next');
  });
  document.querySelectorAll('.mobile-pager button').forEach(button => button.addEventListener('click', event => {
    const ripple = document.createElement('i');
    ripple.className = 'tap-ripple';
    ripple.style.left = `${event.clientX}px`;
    ripple.style.top = `${event.clientY}px`;
    document.body.appendChild(ripple);
    ripple.addEventListener('animationend', () => ripple.remove(), { once: true });
    navigate(button.dataset.direction);
  }));
  window.bookNavigate = navigate; // the big screen's board drives the deck from outside the frame
})();
