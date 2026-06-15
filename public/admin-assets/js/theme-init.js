/**
 * Applies the saved colour mode to <html> before the body renders, so a
 * dark-mode user doesn't see a flash of the default light theme (FOUC).
 * Loaded synchronously in <head>; mirrors the logic in theme.bundle.js.
 */
(function () {
  'use strict';
  var storedTheme = localStorage.getItem('theme');
  var theme = storedTheme
    ? storedTheme
    : window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  if (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    theme = 'dark';
  }
  document.documentElement.setAttribute('data-bs-theme', theme);
})();
