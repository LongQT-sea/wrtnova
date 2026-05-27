// Dark/light mode toggle.
// The anti-FOUC snippet in <head> applies the initial class before first paint.
// This module wires the toggle button and keeps Sun/Moon icons in sync.
(function () {
  'use strict';

  var html = document.documentElement;

  function syncIcons() {
    var dark = html.classList.contains('dark');
    var btn  = document.getElementById('theme-toggle');
    if (!btn) return;
    var sun  = btn.querySelector('.icon-sun');
    var moon = btn.querySelector('.icon-moon');
    if (sun)  sun.classList.toggle('hidden', !dark);
    if (moon) moon.classList.toggle('hidden',  dark);
  }

  function init() {
    var btn = document.getElementById('theme-toggle');
    if (!btn) return;
    btn.addEventListener('click', function () {
      var wasDark = html.classList.contains('dark');
      html.classList.toggle('dark', !wasDark);
      localStorage.setItem('theme', wasDark ? 'light' : 'dark');
      syncIcons();
    });
    syncIcons();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
