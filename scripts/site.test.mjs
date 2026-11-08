#!/usr/bin/env node
// Static regression tests for the generated site. No browser required.
// Run after `./build.sh`: node --test scripts/site.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const exists = (file) => fs.existsSync(path.join(root, file));

const SCHEMES = [
  { slug: 'paper', mode: 'light', bg: '#F7F3EA' },
  { slug: 'gruvbox', mode: 'dark', bg: '#282828' },
  { slug: 'rose-pine', mode: 'dark', bg: '#191724' },
  { slug: 'monokai', mode: 'dark', bg: '#272822' },
  { slug: 'catppuccin-mocha', mode: 'dark', bg: '#1E1E2E' },
  { slug: 'pencil-light', mode: 'light', bg: '#F0F0F0' },
];

const css = read('static/css/custom.css');
const themeJs = read('static/js/theme.js');
const baseHtml = read('templates/base.html');

function walk(dir, predicate, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, predicate, out);
    else if (predicate(full)) out.push(full);
  }
  return out;
}

function cssBlock(source, selector) {
  const start = source.indexOf(`${selector} {`);
  if (start === -1) return null;
  const open = source.indexOf('{', start);
  const close = source.indexOf('}', open);
  return source.slice(open + 1, close);
}

function cssVar(block, name) {
  const match = block && block.match(new RegExp(`--${name}\\s*:\\s*(#[0-9A-Fa-f]{6})`));
  return match ? match[1].toUpperCase() : null;
}

function luminance(hex) {
  const value = hex.replace('#', '');
  const channels = [0, 2, 4].map((index) => parseInt(value.slice(index, index + 2), 16) / 255);
  const linear = channels.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrast(a, b) {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

const pages = walk(path.join(root, 'public'), (file) => file.endsWith('.html'));

test('public/ is built', () => {
  assert.ok(pages.length > 0, 'run ./build.sh before the tests');
  assert.ok(exists('public/index.html'));
});

test('every page exposes the six-scheme theme menu', () => {
  for (const file of pages) {
    const relative = path.relative(root, file);
    const html = fs.readFileSync(file, 'utf8');

    assert.match(html, /<details class="theme-menu" id="theme-menu">/, `${relative}: missing theme menu`);
    assert.match(html, /class="theme-trigger"/, `${relative}: missing trigger`);
    assert.doesNotMatch(html, /<select[\s>]/i, `${relative}: native select is not allowed`);
    assert.doesNotMatch(html, /name="mode"/, `${relative}: light/dark mode control must not exist`);
    assert.doesNotMatch(html, /class="[^"]*theme-toggle/, `${relative}: legacy toggle must not exist`);

    const values = [...html.matchAll(/name="scheme" value="([^"]+)"/g)].map((match) => match[1]);
    assert.deepEqual(values, SCHEMES.map((scheme) => scheme.slug), `${relative}: scheme radios changed`);

    for (const scheme of SCHEMES) {
      assert.match(
        html,
        new RegExp(`data-theme-option="${scheme.slug}"`),
        `${relative}: missing option ${scheme.slug}`,
      );
    }
  }
});

test('scheme options show a swatch and a visible name', () => {
  assert.match(baseHtml, /<span class="scheme-swatch" aria-hidden="true">/);
  assert.match(baseHtml, /<span class="scheme-name">Paper &amp; Ink<\/span>/);
  assert.match(baseHtml, /<legend class="visually-hidden">Color theme<\/legend>/);
});

test('theme.js only knows fixed-mode schemes', () => {
  for (const scheme of SCHEMES) {
    assert.match(
      themeJs,
      new RegExp(`'${scheme.slug}': '${scheme.mode}'`),
      `theme.js is missing ${scheme.slug} -> ${scheme.mode}`,
    );
  }
  assert.doesNotMatch(themeJs, /modeInputs|setMode|syncModeInputs/);
  assert.doesNotMatch(themeJs, /localStorage\.setItem\('theme'/);
});

test('each scheme has one fixed palette with the documented mode', () => {
  for (const scheme of SCHEMES) {
    const block = cssBlock(css, `[data-scheme="${scheme.slug}"]`);
    assert.ok(block, `missing [data-scheme="${scheme.slug}"] block`);
    assert.match(
      block,
      new RegExp(`color-scheme:\\s*${scheme.mode}`),
      `${scheme.slug}: color-scheme must be ${scheme.mode}`,
    );
    assert.equal(cssVar(block, 'bg'), scheme.bg, `${scheme.slug}: unexpected --bg`);
  }
  assert.doesNotMatch(css, /\[data-scheme="[^"]+"\]:not\(\[data-theme="light"\]\)/);
});

test('scheme text, secondary text, links, and accents meet WCAG AA', () => {
  for (const scheme of SCHEMES) {
    const block = cssBlock(css, `[data-scheme="${scheme.slug}"]`);
    const bg = cssVar(block, 'bg');
    for (const token of ['text', 'text-light', 'link', 'accent']) {
      const color = cssVar(block, token);
      assert.ok(color, `${scheme.slug}: missing --${token}`);
      const ratio = contrast(color, bg);
      assert.ok(
        ratio >= 4.5,
        `${scheme.slug}: --${token} ${color} on ${bg} is ${ratio.toFixed(2)}:1 (need 4.5)`,
      );
    }
    const codeBg = cssVar(block, 'code-bg');
    assert.ok(codeBg, `${scheme.slug}: missing --code-bg`);
    assert.ok(
      contrast(cssVar(block, 'text'), codeBg) >= 4.5,
      `${scheme.slug}: code text on --code-bg is below AA`,
    );
  }
});

test('theme default is consistent with or without JS', () => {
  assert.doesNotMatch(
    css,
    /@media \(prefers-color-scheme: dark\) \{\s*:root/,
    'an OS-dark :root fallback would make no-JS and JS-on disagree',
  );
  assert.match(
    baseHtml,
    /<meta name="color-scheme" content="light">/,
    'no-JS default must declare the light color scheme',
  );
  assert.doesNotMatch(baseHtml, /<link[^>]*id="syntax-light"/, 'static syntax-light link fetches the wrong file for stored schemes');
  assert.match(baseHtml, /addLink\('syntax-active'/, 'pre-paint script must create the syntax link');
});

test('wordmark keeps its own color and fetches one icon', () => {
  assert.match(css, /\.site-wordmark:link,\s*\.site-wordmark:visited \{[^}]*color: var\(--text\);/, 'wordmark must pin link/visited color');
  assert.match(css, /\.site-wordmark::before \{[^}]*url\("\.\.\/favicon-light\.svg"\)/, 'wordmark icon must be a CSS background');
  assert.match(css, /\[data-theme="dark"\] \.site-wordmark::before \{[^}]*url\("\.\.\/favicon-dark\.svg"\)/, 'dark wordmark icon override missing');
  assert.doesNotMatch(baseHtml, /<img class="wordmark-icon/, 'dual <img> wordmark fetches both SVGs');
  const wordmarkBlocks = (baseHtml.match(/class="site-wordmark"/g) || []).length;
  assert.equal(wordmarkBlocks, 2, 'home + non-home wordmark branches changed');
  assert.match(baseHtml, /<a class="site-wordmark" href="\/" rel="home" aria-label="[^"]* — home">[\s\S]*?<span>/, 'non-home wordmark must carry an accessible name');
});

test('hover states never leak the suCSS link background', () => {
  for (const selector of ['.post-byline a', '.permalink', '.footer-row p a']) {
    const block = css.match(new RegExp(`^\\*?\\s*${selector.replace('.', '\\.').replace(' ', '\\s+')}:hover,\\s*${selector.replace('.', '\\.').replace(' ', '\\s+')}:focus-visible \\{[^}]*\\}`, 'm'));
    assert.ok(block, `${selector} hover rule missing`);
    assert.match(block[0], /background: transparent;/, `${selector} hover must kill the suCSS background`);
  }
});

test('content links intensify on hover instead of flipping to the accent', () => {
  assert.match(css, /\.post-content a:hover,[\s\S]*?color: var\(--link-hover\);/, 'content link hover must use --link-hover');
});

test('gruvbox is anchored on authentic orange links', () => {
  const block = cssBlock(css, '[data-scheme="gruvbox"]');
  assert.equal(cssVar(block, 'link'), '#FE8019');
  assert.equal(cssVar(block, 'link-hover'), '#F9AA4C');
});

test('paper syntax CSS is retinted onto the paper palette', () => {
  const light = read('static/syntax/paper-light.css');
  const dark = read('static/syntax/paper-dark.css');
  assert.match(light, /\.z-keyword \{ color: #8A2E22; \}/);
  assert.match(light, /\.z-string \{ color: #2C5A4D; \}/);
  assert.doesNotMatch(light, /#032563|#A0111F|#023B95/, 'raw GitHub colors leaked into paper-light');
  assert.match(dark, /\.z-keyword \{ color: #EDAA80; \}/);
  assert.match(dark, /\.z-string \{ color: #93D2B7; \}/);
  for (const file of ['static/syntax/rose-pine-light.css', 'static/syntax/rose-pine-dark.css']) {
    assert.doesNotMatch(read(file), /\.z-variable \{[^}]*font-style: italic/, `${file}: rose-pine italic variables are back`);
  }
});

test('round-4 polish rules exist', () => {
  const checks = [
    [/\.post-content kbd,[\s\S]*?border-bottom-width: 2px;/, 'kbd key style missing'],
    [/\.post-content hr,[\s\S]*?border-top: 1px dashed var\(--border\);/, 'in-content hr must use the border color'],
    [/\.post-year \{[\s\S]*?letter-spacing: 0\.08em;/, 'year label tracking must match the other micro-labels'],
    [/\.scheme-option \{[\s\S]*?min-height: 2\.75rem;/, 'scheme options must be 44px tap targets'],
    [/\.error-page a\.button \{[\s\S]*?border-radius: 4px;/, '404 button must use the site radius'],
    [/\.error-page a:not\(\.button\) \{[\s\S]*?text-decoration: underline;/, '404 secondary link must be underlined'],
    [/\[data-theme="dark"\] \.post-content img,[\s\S]*?box-shadow: 0 2px 14px/, 'dark figure frames missing'],
    [/\.toc a\.is-active \{/, 'TOC scroll-spy active style missing'],
    [/\.toc summary:hover,[\s\S]*?color: var\(--accent\);/, 'TOC summary hover missing'],
    [/\.theme-trigger \.icon \.on \{[\s\S]*?fill: var\(--trigger-accent, currentColor\);/, 'trigger scheme accent missing'],
    [/\.embed-callout-note \{/, 'callout availability note style missing'],
    [/content: "#";\s*content: "#" \/ ""/, 'tag # prefix needs a plain fallback'],
    [/content: "·";\s*content: "·" \/ ""/, 'post-meta separator needs a plain fallback'],
  ];
  for (const [pattern, message] of checks) assert.match(css, pattern, message);
});

test('TOC threshold and post-nav skip dateless pages', () => {
  const page = read('templates/page.html');
  assert.match(page, /page\.toc \| length >= 2/, 'TOC threshold must count short-structured posts');
  assert.match(page, /page\.higher and page\.higher\.date/, 'post-nav must skip dateless pages (e.g. about)');
  assert.match(page, /page\.lower and page\.lower\.date/, 'post-nav must skip dateless pages (e.g. about)');
  const tags = read('templates/tags/single.html');
  assert.match(tags, /date\(format="%b %-d, %Y"\)/, 'tag listing dates must include the day');
});

test('dead demos are annotated', () => {
  for (const file of ['content/hooks-useref.md', 'content/hooks-usestate.md', 'content/redoing-search/index.md', 'content/hooks-usecontext/index.md']) {
    const md = read(file);
    assert.match(md, /unavailable/, `${file}: CodeSandbox availability note missing`);
  }
});

test('syntax stylesheets exist for every scheme and mode', () => {
  for (const scheme of SCHEMES) {
    for (const mode of ['light', 'dark']) {
      const file = `static/syntax/${scheme.slug}-${mode}.css`;
      assert.ok(exists(file), `missing ${file}`);
      assert.ok(fs.statSync(path.join(root, file)).size > 0, `${file} is empty`);
    }
  }
});

test('favicon and wordmark assets have no tile or border', () => {
  for (const file of ['static/favicon.svg', 'static/favicon-dark.svg', 'static/favicon-light.svg']) {
    const svg = read(file);
    assert.doesNotMatch(svg, /<rect width="32" height="32"/, `${file}: background tile is back`);
    assert.doesNotMatch(svg, /\bstroke=/, `${file}: border stroke is back`);
  }
  for (const file of [
    'static/favicon-16x16.png',
    'static/favicon-32x32.png',
    'static/favicon-light-16x16.png',
    'static/favicon-light-32x32.png',
    'static/icon-64.png',
    'static/icon-192.png',
    'static/icon-512.png',
    'static/apple-touch-icon.png',
  ]) {
    assert.ok(exists(file), `missing ${file}`);
    assert.ok(fs.statSync(path.join(root, file)).size > 0, `${file} is empty`);
  }
});

test('spacing regressions stay fixed', () => {
  const checks = [
    [/\.theme-menu \{[^}]*padding: 0;/, 'theme menu must not inherit details padding'],
    [/\.theme-menu \{[^}]*background: transparent;/, 'theme menu must not inherit a details background'],
    [/\.theme-menu\[open\] > \.theme-trigger \{[^}]*margin-bottom: 0;/, 'open menu must not shift the nav'],
    [/\.post-content pre \{[^}]*max-height: none;/, 'code blocks must not be clipped'],
    [/details\.toc\[open\] > summary \+ ol \{/, 'TOC link gap override missing'],
    [/\.post-content li,[\s\S]*?overflow-wrap: anywhere;/, 'long URLs must wrap in list items'],
  ];
  for (const [pattern, message] of checks) assert.match(css, pattern, message);
});

test('h1 title has no decorative marker', () => {
  const block = cssBlock(css, 'h1::before');
  assert.ok(block, 'missing h1::before rule');
  assert.match(block, /content:\s*none;/, 'h1 marker must be removed');
  assert.doesNotMatch(block, /position:\s*absolute|left:|right:|margin-right:/, 'h1 marker offset is back');
});

test('mobile header stays one row', () => {
  assert.match(css, /@media only screen and \(max-width: 420px\) \{[\s\S]*?\.site-wordmark span \{\s*display: none;/);
  assert.match(css, /@media only screen and \(max-width: 480px\) \{[\s\S]*?\.nav-actions \{\s*width: auto;/);
});

test('feeds, headers, redirects, and machine files are generated', () => {
  for (const file of [
    'public/atom.xml',
    'public/rss.xml',
    'public/feed.json',
    'public/sitemap.xml',
    'public/llms.txt',
    'public/llms-full.txt',
    'public/_headers',
    'public/_redirects',
    'public/robots.txt',
    'public/.well-known/security.txt',
    'public/humans.txt',
  ]) {
    assert.ok(exists(file), `missing ${file}`);
  }
});
