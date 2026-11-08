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
  var schemeAccents = {
    'paper': '#2C5A4D',
    'gruvbox': '#B8BB26',
    'rose-pine': '#EBBCBA',
    'monokai': '#A6E22E',
    'catppuccin-mocha': '#94E2D5',
    'pencil-light': '#B8056A'
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

  function updateTriggerAccent(scheme) {
    if (themeMenu) themeMenu.style.setProperty('--trigger-accent', schemeAccents[scheme] || '');
  }

  function updateSyntaxLinks(scheme) {
    var theme = themeForScheme(scheme);
    var link = document.getElementById('syntax-active');
    var url = '/syntax/' + scheme + '-' + theme + '.css';
    if (!link) {
      link = document.createElement('link');
      link.id = 'syntax-active';
      link.rel = 'stylesheet';
      document.head.appendChild(link);
    }
    if (link.getAttribute('href') !== url) link.setAttribute('href', url);
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
    updateTriggerAccent(scheme);
    updateSyntaxLinks(scheme);
    updateUI(theme);
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

  // Scroll-spy: highlight the TOC link for the heading currently in the
  // reading band (top ~30% of the viewport).
  function initTocScrollSpy() {
    if (!('IntersectionObserver' in window)) return;
    var headings = document.querySelectorAll('.post-content h2[id], .post-content h3[id]');
    var linksById = {};
    var links = document.querySelectorAll('.toc a[href^="#"]');
    for (var i = 0; i < links.length; i += 1) {
      linksById[links[i].getAttribute('href').slice(1)] = links[i];
    }
    if (!headings.length || !links.length) return;

    var visible = {};
    var observer = new IntersectionObserver(function (entries) {
      for (var j = 0; j < entries.length; j += 1) {
        visible[entries[j].target.id] = entries[j].isIntersecting;
      }
      var activeId = null;
      for (var k = 0; k < headings.length; k += 1) {
        if (visible[headings[k].id]) {
          activeId = headings[k].id;
          break;
        }
      }
      for (var id in linksById) {
        linksById[id].classList.toggle('is-active', id === activeId);
      }
    }, { rootMargin: '0px 0px -65% 0px', threshold: 0 });

    for (var m = 0; m < headings.length; m += 1) observer.observe(headings[m]);
  }

  makeScrollableCodeFocusable();
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(makeScrollableCodeFocusable);
  }
  window.addEventListener('resize', makeScrollableCodeFocusable);
  initTocScrollSpy();
})();
