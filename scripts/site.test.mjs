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

test('OS-dark fallback only applies before a scheme is chosen', () => {
  assert.match(
    css,
    /@media \(prefers-color-scheme: dark\) \{\s*:root:not\(\[data-scheme\]\) \{/,
    'missing :root:not([data-scheme]) OS fallback',
  );
  assert.doesNotMatch(
    css,
    /:root:not\(\[data-theme="light"\]\)\s*\{[^}]*--bg:/,
    'a theme-based fallback would override fixed schemes on dark-OS systems',
  );
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

test('h1 marker hangs snugly and hides on narrow screens', () => {
  assert.match(css, /h1 \{[^}]*position: relative;/, 'h1 must anchor its marker');
  assert.match(css, /h1::before \{[^}]*right: 100%;/, 'h1 marker must hang from the text edge');
  assert.match(css, /h1::before \{[^}]*margin-right: 0\.2em;/, 'h1 marker gap changed');
  assert.doesNotMatch(css, /h1::before \{[^}]*left: -1\.5ch;/, 'old wide h1 offset is back');
  assert.match(css, /@media \(max-width: 767px\) \{\s*h1::before \{\s*content: none;/, 'marker must hide on mobile');
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
