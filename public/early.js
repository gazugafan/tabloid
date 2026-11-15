/* Runs before the page paints (a plain script, so it blocks rendering for a moment). It applies just enough
   of the saved look, the theme and page color, that opening a tab never flashes the wrong color. The full
   appearance is applied later by the app itself. Must stay in sync with utils/appearance.ts. */
(function () {
  try {
    var saved = JSON.parse(localStorage.getItem('tabloid:appearance-cache') || 'null');
    if (!saved) return;
    var root = document.documentElement;
    if (saved.mode === 'light' || saved.mode === 'dark') root.setAttribute('data-theme', saved.mode);
    if (/^#[0-9a-f]{6}$/i.test(saved.background)) root.style.setProperty('--bg', saved.background);
  } catch (e) {
    /* No saved look yet, or storage is unavailable: the defaults in early.css apply. */
  }
})();
