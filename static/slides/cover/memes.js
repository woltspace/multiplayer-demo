// Cover terminal: jerpint's memes rotate, a braille spinner keeps it alive (same as new wolt sites).
(function () {
  const line = document.querySelector('.meme-line');
  const spin = document.querySelector('.meme-spin');
  if (!line) return;
  const memes = ["there's no place like localhost", 'building at the speed of thought', 'it works on my machine', 'how much wolt could a wolt chuck chuck', 'beavers love to give a dam'];
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  // One meme at a time: type it, hold, erase, then the next. No two lines on screen at once.
  let meme = 0;
  let frame = 0;
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  (async () => {
    for (;;) {
      await wait(2600);
      for (let n = line.textContent.length; n >= 0; n--) { line.textContent = line.textContent.slice(0, n); await wait(18); }
      meme = (meme + 1) % memes.length;
      await wait(250);
      for (let n = 1; n <= memes[meme].length; n++) { line.textContent = memes[meme].slice(0, n); await wait(38); }
    }
  })();
  setInterval(() => { frame = (frame + 1) % frames.length; spin.textContent = frames[frame]; }, 90);
})();
