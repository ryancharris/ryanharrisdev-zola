(function () {
  'use strict';

  var root = document.documentElement;
  var themeMenu = document.getElementById('theme-menu');
  var schemeInputs = document.querySelectorAll('input[name="scheme"]');
  var transitionTimer = null;
  var schemes = ['paper', 'gruvbox', 'rose-pine', 'monokai', 'catppuccin-mocha', 'pencil-light'];
  var schemeModes = {
    'paper': 'light',
    'gruvbox': 'dark',
    'rose-pine': 'dark',
    'monokai': 'dark',
    'catppuccin-mocha': 'dark',
    'pencil-light': 'light'
  };

  function storedScheme() {
    try {
      var stored = localStorage.getItem('scheme');
      return schemes.indexOf(stored) !== -1 ? stored : null;
    } catch (error) {
      return null;
    }
  }

  function currentScheme() {
    return storedScheme() || root.getAttribute('data-scheme') || 'paper';
  }

  function themeForScheme(scheme) {
    return schemeModes[scheme] || 'light';
  }

  function updateMetaTheme(theme) {
    var color = getComputedStyle(root).getPropertyValue('--bg').trim();
    if (!color) color = theme === 'dark' ? '#1C1814' : '#F7F3EA';
    var metas = document.querySelectorAll('meta[name="theme-color"]');
    for (var i = 0; i < metas.length; i += 1) metas[i].setAttribute('content', color);
  }

  function updateFavicon(theme) {
    var map = theme === 'dark'
      ? { svg: '/favicon-dark.svg', png16: '/favicon-16x16.png', png32: '/favicon-32x32.png' }
      : { svg: '/favicon-light.svg', png16: '/favicon-light-16x16.png', png32: '/favicon-light-32x32.png' };
    var svg = document.getElementById('favicon-svg');
    var png16 = document.getElementById('favicon-16');
    var png32 = document.getElementById('favicon-32');
    if (svg) svg.setAttribute('href', map.svg);
    if (png16) png16.setAttribute('href', map.png16);
    if (png32) png32.setAttribute('href', map.png32);
  }

  function syncSchemeInputs(scheme) {
    for (var i = 0; i < schemeInputs.length; i += 1) {
      schemeInputs[i].checked = schemeInputs[i].value === scheme;
    }
  }

  function updateUI(theme) {
    updateMetaTheme(theme);
    updateFavicon(theme);
  }

  function updateSyntaxLinks(scheme) {
    var light = document.getElementById('syntax-light');
    var dark = document.getElementById('syntax-dark');
    if (light) light.setAttribute('href', '/syntax/' + scheme + '-light.css');
    if (dark) dark.setAttribute('href', '/syntax/' + scheme + '-dark.css');
  }

  function updateCodeTheme(theme) {
    var light = document.getElementById('syntax-light');
    var dark = document.getElementById('syntax-dark');
    if (light) light.media = theme === 'light' ? 'all' : 'not all';
    if (dark) dark.media = theme === 'dark' ? 'all' : 'not all';
  }

  function prefersReducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function setScheme(scheme, persist) {
    if (schemes.indexOf(scheme) === -1) scheme = 'paper';
    var theme = themeForScheme(scheme);
    if (persist && !prefersReducedMotion()) {
      if (transitionTimer) window.clearTimeout(transitionTimer);
      document.body.classList.add('theme-transition');
      transitionTimer = window.setTimeout(function () {
        document.body.classList.remove('theme-transition');
        transitionTimer = null;
      }, 300);
    }
    root.setAttribute('data-scheme', scheme);
    root.setAttribute('data-theme', theme);
    syncSchemeInputs(scheme);
    updateSyntaxLinks(scheme);
    updateUI(theme);
    updateCodeTheme(theme);
    if (persist) {
      try {
        localStorage.setItem('scheme', scheme);
      } catch (error) {}
    }
  }

  var initialScheme = currentScheme();
  setScheme(initialScheme, false);

  for (var i = 0; i < schemeInputs.length; i += 1) {
    schemeInputs[i].addEventListener('change', function (event) {
      if (event.target.checked) setScheme(event.target.value, true);
    });
  }

  window.addEventListener('storage', function (event) {
    if (event.key !== 'scheme') return;
    setScheme(schemes.indexOf(event.newValue) !== -1 ? event.newValue : 'paper', false);
  });

  if (themeMenu) {
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && themeMenu.open) {
        themeMenu.open = false;
        var summary = themeMenu.querySelector('summary');
        if (summary) summary.focus();
      }
    });
    document.addEventListener('click', function (event) {
      if (themeMenu.open && !themeMenu.contains(event.target)) themeMenu.open = false;
    });
  }

  function makeScrollableCodeFocusable() {
    var blocks = document.querySelectorAll('.post-content pre');
    for (var k = 0; k < blocks.length; k += 1) {
      var block = blocks[k];
      if (block.scrollWidth > block.clientWidth + 1 || block.scrollHeight > block.clientHeight + 2) {
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
