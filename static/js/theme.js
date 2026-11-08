(function () {
  'use strict';

  var root = document.documentElement;
  var toggle = document.getElementById('theme-toggle');
  var icon = document.getElementById('theme-icon');
  var transitionTimer = null;

  function storedTheme() {
    try {
      var stored = localStorage.getItem('theme');
      return stored === 'light' || stored === 'dark' ? stored : null;
    } catch (error) {
      return null;
    }
  }

  function systemTheme() {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  }

  function currentTheme() {
    var stored = storedTheme();
    if (stored) return stored;
    var attribute = root.getAttribute('data-theme');
    if (attribute === 'light' || attribute === 'dark') return attribute;
    return systemTheme();
  }

  function updateMetaTheme(theme) {
    var color = theme === 'dark' ? '#1E1E2E' : '#EFF1F5';
    var metas = document.querySelectorAll('meta[name="theme-color"]');
    for (var i = 0; i < metas.length; i += 1) metas[i].setAttribute('content', color);
  }

  function updateUI(theme) {
    updateMetaTheme(theme);
    if (!toggle) return;
    var isDark = theme === 'dark';
    toggle.setAttribute('aria-pressed', isDark ? 'true' : 'false');
    if (icon) {
      var base = toggle.getAttribute('data-icon-base') || '';
      var symbol = isDark ? toggle.getAttribute('data-icon-light') : toggle.getAttribute('data-icon-dark');
      if (symbol) icon.setAttribute('href', base + symbol);
    }
  }

  function updateCodeTheme(theme) {
    var light = document.getElementById('giallo-light');
    var dark = document.getElementById('giallo-dark');
    if (light) light.media = theme === 'light' ? 'all' : 'not all';
    if (dark) dark.media = theme === 'dark' ? 'all' : 'not all';
  }

  function setTheme(theme, persist) {
    root.setAttribute('data-theme', theme);
    updateUI(theme);
    updateCodeTheme(theme);
    if (persist) {
      try {
        localStorage.setItem('theme', theme);
      } catch (error) {}
    }
  }

  function prefersReducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function toggleTheme() {
    var next = currentTheme() === 'dark' ? 'light' : 'dark';
    if (!prefersReducedMotion()) {
      if (transitionTimer) window.clearTimeout(transitionTimer);
      document.body.classList.add('theme-transition');
      transitionTimer = window.setTimeout(function () {
        document.body.classList.remove('theme-transition');
        transitionTimer = null;
      }, 300);
    }
    setTheme(next, true);
  }

  if (toggle) {
    toggle.addEventListener('click', toggleTheme);
    var initialTheme = currentTheme();
    updateUI(initialTheme);
    if (storedTheme() || root.getAttribute('data-theme')) updateCodeTheme(initialTheme);

    if (window.matchMedia) {
      var media = window.matchMedia('(prefers-color-scheme: dark)');
      var onSystemChange = function () {
        if (!storedTheme()) updateUI(systemTheme());
      };
      if (media.addEventListener) media.addEventListener('change', onSystemChange);
      else if (media.addListener) media.addListener(onSystemChange);
    }

    window.addEventListener('storage', function (event) {
      if (event.key !== 'theme') return;
      var stored = storedTheme();
      if (stored) {
        root.setAttribute('data-theme', stored);
        updateUI(stored);
      } else {
        root.removeAttribute('data-theme');
        updateUI(systemTheme());
      }
    });
  }

  function makeScrollableCodeFocusable() {
    var blocks = document.querySelectorAll('.post-content pre');
    for (var i = 0; i < blocks.length; i += 1) {
      var block = blocks[i];
      if (block.scrollWidth > block.clientWidth) {
        block.setAttribute('tabindex', '0');
        block.setAttribute('role', 'group');
        block.setAttribute('aria-label', 'Scrollable code sample');
        block.classList.add('is-scrollable');
      } else {
        block.removeAttribute('tabindex');
        block.removeAttribute('role');
        block.removeAttribute('aria-label');
        block.classList.remove('is-scrollable');
      }
    }
  }

  makeScrollableCodeFocusable();
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(makeScrollableCodeFocusable);
  }
  window.addEventListener('resize', makeScrollableCodeFocusable);
})();
