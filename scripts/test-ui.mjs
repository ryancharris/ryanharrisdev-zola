#!/usr/bin/env node
// Browser regression tests for the theme system and layout.
// Requires Playwright + axe: npm install && npx playwright install firefox
// Usage: npm run test:ui   (expects a built public/ directory)

import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(root, 'public');

let playwright;
let AxeBuilder;
try {
  playwright = await import('playwright');
  ({ AxeBuilder } = await import('@axe-core/playwright'));
} catch (error) {
  console.error('Playwright or @axe-core/playwright is not installed.');
  console.error('Run: npm install && npx playwright install firefox');
  process.exit(2);
}

if (!fs.existsSync(path.join(publicDir, 'index.html'))) {
  console.error('public/ is missing. Run ./build.sh first.');
  process.exit(2);
}

const SCHEMES = {
  paper: { mode: 'light', bg: 'rgb(247, 243, 234)', hex: '#F7F3EA' },
  gruvbox: { mode: 'dark', bg: 'rgb(40, 40, 40)', hex: '#282828' },
  'rose-pine': { mode: 'dark', bg: 'rgb(25, 23, 36)', hex: '#191724' },
  monokai: { mode: 'dark', bg: 'rgb(39, 40, 34)', hex: '#272822' },
  'catppuccin-mocha': { mode: 'dark', bg: 'rgb(30, 30, 46)', hex: '#1E1E2E' },
  'pencil-light': { mode: 'light', bg: 'rgb(240, 240, 240)', hex: '#F0F0F0' },
};
const SLUGS = Object.keys(SCHEMES);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
};

function startServer() {
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, 'http://localhost');
    let file = path.normalize(path.join(publicDir, decodeURIComponent(url.pathname)));
    if (!file.startsWith(publicDir)) {
      response.writeHead(403).end('forbidden');
      return;
    }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) {
      const notFound = path.join(publicDir, '404.html');
      response.writeHead(404, { 'content-type': MIME['.html'] });
      response.end(fs.existsSync(notFound) ? fs.readFileSync(notFound) : 'not found');
      return;
    }
    response.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
    response.end(fs.readFileSync(file));
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, base: `http://127.0.0.1:${server.address().port}` }));
  });
}

function walk(dir, predicate, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, predicate, out);
    else if (predicate(full)) out.push(full);
  }
  return out;
}

const pages = walk(publicDir, (file) => file.endsWith('.html'))
  .map((file) => `/${path.relative(publicDir, file).replace(/\\/g, '/').replace(/index\.html$/, '')}`);

const failures = [];
let passes = 0;

async function check(name, fn) {
  try {
    await fn();
    passes += 1;
    console.log(`✔ ${name}`);
  } catch (error) {
    failures.push({ name, error });
    console.error(`✖ ${name}`);
    console.error(`  ${String(error.message || error).split('\n').slice(0, 8).join('\n  ')}`);
  }
}

async function launchBrowser() {
  const errors = [];
  for (const type of [playwright.firefox, playwright.chromium]) {
    try {
      return await type.launch();
    } catch (error) {
      errors.push(String(error.message || error).split('\n')[0]);
    }
  }
  throw new Error(`No Playwright browser available. ${errors.join(' | ')}`);
}

async function settle(page) {
  await page.evaluate(async () => {
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}

function rects(page) {
  return page.evaluate(() => {
    const box = (element) => {
      const rect = element.getBoundingClientRect();
      return {
        x: Math.round(rect.x * 100) / 100,
        y: Math.round(rect.y * 100) / 100,
        width: Math.round(rect.width * 100) / 100,
        height: Math.round(rect.height * 100) / 100,
      };
    };
    return {
      nav: box(document.querySelector('#nav-bar')),
      links: [...document.querySelectorAll('.nav-actions > a')].map(box),
      trigger: box(document.querySelector('.theme-trigger')),
    };
  });
}

const browser = await launchBrowser();
const { server, base } = await startServer();

try {
  for (const os of ['light', 'dark']) {
    for (const slug of SLUGS) {
      await check(`render ${slug} on ${os} OS`, async () => {
        const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: os });
        const page = await context.newPage();
        await page.addInitScript((scheme) => localStorage.setItem('scheme', scheme), slug);
        await page.goto(`${base}/hooks-useref/`, { waitUntil: 'load' });
        await settle(page);

        const state = await page.evaluate(() => ({
          scheme: document.documentElement.getAttribute('data-scheme'),
          theme: document.documentElement.getAttribute('data-theme'),
          bg: getComputedStyle(document.body).backgroundColor,
          checked: document.querySelector('input[name="scheme"]:checked')?.value,
          modeInputs: document.querySelectorAll('input[name="mode"]').length,
          toggles: document.querySelectorAll('.theme-toggle').length,
          syntaxHref: document.getElementById('syntax-active')?.getAttribute('href') ?? null,
          favicon: document.getElementById('favicon-svg')?.getAttribute('href') ?? null,
          meta: [...document.querySelectorAll('meta[name="theme-color"]')].map((meta) => meta.content),
          saved: localStorage.getItem('scheme'),
        }));

        assert.equal(state.scheme, slug);
        assert.equal(state.theme, SCHEMES[slug].mode);
        assert.equal(state.bg, SCHEMES[slug].bg);
        assert.equal(state.checked, slug);
        assert.equal(state.modeInputs, 0);
        assert.equal(state.toggles, 0);
        assert.equal(state.syntaxHref, `/syntax/${slug}-${SCHEMES[slug].mode}.css`);
        assert.equal(state.favicon, SCHEMES[slug].mode === 'dark' ? '/favicon-dark.svg' : '/favicon-light.svg');
        assert.deepEqual(state.meta, [SCHEMES[slug].hex]);
        assert.equal(state.saved, slug);

        await context.close();
      });
    }
  }

  for (const width of [320, 390, 768, 1280]) {
    await check(`menu does not shift the nav at ${width}px`, async () => {
      const context = await browser.newContext({ viewport: { width, height: 844 }, colorScheme: 'dark' });
      const page = await context.newPage();
      await page.addInitScript(() => localStorage.setItem('scheme', 'gruvbox'));
      await page.goto(`${base}/hooks-useref/`, { waitUntil: 'load' });
      await settle(page);

      const closed = await rects(page);
      await page.locator('.theme-trigger').click();
      await page.waitForTimeout(120);
      const open = await rects(page);
      assert.deepEqual(open.nav, closed.nav, 'nav height/position changed');
      assert.deepEqual(open.links, closed.links, 'nav links moved when the menu opened');
      assert.deepEqual(open.trigger, closed.trigger, 'trigger moved when the menu opened');

      const panel = await page.evaluate(() => {
        const rect = document.querySelector('.theme-panel').getBoundingClientRect();
        return {
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          top: Math.round(rect.top),
          bottom: Math.round(rect.bottom),
          visible: getComputedStyle(document.querySelector('.theme-panel')).visibility,
        };
      });
      assert.ok(panel.left >= 0, `panel starts off-screen (${panel.left})`);
      assert.ok(panel.right <= width, `panel overflows the viewport (${panel.right} > ${width})`);
      assert.equal(panel.visible, 'visible');

      await page.keyboard.press('Escape');
      const closedAgain = await page.evaluate(() => ({
        open: document.getElementById('theme-menu').open,
        focus: document.activeElement.className,
      }));
      assert.equal(closedAgain.open, false);
      assert.match(closedAgain.focus, /theme-trigger/);

      await context.close();
    });
  }

  await check('keyboard opens, changes, and closes the menu', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: 'light' });
    const page = await context.newPage();
    await page.addInitScript(() => localStorage.setItem('scheme', 'paper'));
    await page.goto(`${base}/`, { waitUntil: 'load' });
    await settle(page);

    await page.locator('.theme-trigger').focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => document.getElementById('theme-menu').open), true);

    await page.keyboard.press('Tab');
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(120);
    const state = await page.evaluate(() => ({
      scheme: document.documentElement.getAttribute('data-scheme'),
      checked: document.querySelector('input[name="scheme"]:checked')?.value,
      focus: document.activeElement.value,
      saved: localStorage.getItem('scheme'),
    }));
    assert.equal(state.scheme, 'gruvbox');
    assert.equal(state.checked, 'gruvbox');
    assert.equal(state.focus, 'gruvbox');
    assert.equal(state.saved, 'gruvbox');

    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => document.getElementById('theme-menu').open), false);
    assert.match(await page.evaluate(() => document.activeElement.className), /theme-trigger/);
    await context.close();
  });

  await check('scheme choice persists across reloads', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    await page.goto(`${base}/`, { waitUntil: 'load' });
    await settle(page);
    await page.locator('.theme-trigger').click();
    await page.locator('label[data-theme-option="pencil-light"]').click();
    await page.waitForTimeout(250);
    await page.reload({ waitUntil: 'load' });
    await settle(page);
    const state = await page.evaluate(() => ({
      scheme: document.documentElement.getAttribute('data-scheme'),
      theme: document.documentElement.getAttribute('data-theme'),
      bg: getComputedStyle(document.body).backgroundColor,
      checked: document.querySelector('input[name="scheme"]:checked')?.value,
      saved: localStorage.getItem('scheme'),
    }));
    assert.equal(state.scheme, 'pencil-light');
    assert.equal(state.theme, 'light');
    assert.equal(state.bg, SCHEMES['pencil-light'].bg);
    assert.equal(state.checked, 'pencil-light');
    assert.equal(state.saved, 'pencil-light');
    await context.close();
  });

  await check('h1 has no offset marker and the byline sits on the body axis', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: 'dark' });
    const page = await context.newPage();
    await page.addInitScript(() => localStorage.setItem('scheme', 'gruvbox'));
    await page.goto(`${base}/`, { waitUntil: 'load' });
    await settle(page);
    const state = await page.evaluate(() => {
      const heading = document.querySelector('h1');
      const avatar = document.querySelector('.home-avatar');
      const description = document.querySelector('.site-description');
      return {
        marker: getComputedStyle(heading, '::before').content,
        avatarLeft: Math.round(avatar.getBoundingClientRect().left),
        headingLeft: Math.round(heading.getBoundingClientRect().left),
        descriptionLeft: Math.round(description.getBoundingClientRect().left),
      };
    });
    assert.equal(state.marker, 'none');
    assert.equal(state.avatarLeft, state.descriptionLeft);
    assert.ok(state.headingLeft > state.avatarLeft, 'heading text follows the avatar');
    await context.close();
  });

  for (const os of ['light', 'dark']) {
    await check(`no-JS default matches JS-on first paint on ${os} OS (paper) with menu hidden`, async () => {
      const context = await browser.newContext({
        viewport: { width: 1280, height: 900 },
        colorScheme: os,
        javaScriptEnabled: false,
      });
      const page = await context.newPage();
      await page.goto(`${base}/`, { waitUntil: 'load' });
      const state = await page.locator('body').evaluate((body) => ({
        bg: getComputedStyle(body).backgroundColor,
        menu: getComputedStyle(document.querySelector('.theme-menu')).display,
      }));
      // No-JS always renders the Paper & Ink light default, matching what JS-on
      // shows for a first-time visitor (schemes are fixed-mode; OS pref is dead).
      assert.equal(state.bg, 'rgb(247, 243, 234)');
      assert.equal(state.menu, 'none');
      await context.close();
    });
  }

  for (const width of [1280, 390]) {
    for (const slug of SLUGS) {
      await check(`axe ${slug} at ${width}px`, async () => {
        const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: 'light' });
        const page = await context.newPage();
        await page.addInitScript((scheme) => localStorage.setItem('scheme', scheme), slug);
        await page.goto(`${base}/hooks-useref/`, { waitUntil: 'load' });
        await settle(page);
        await page.locator('.theme-trigger').click();
        await page.waitForTimeout(120);
        const results = await new AxeBuilder({ page })
          .withTags(['wcag2aa', 'wcag21aa', 'wcag22aa'])
          .analyze();
        assert.equal(
          results.violations.length,
          0,
          results.violations
            .map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target).join(' ')}`)
            .join('; '),
        );
        await context.close();
      });
    }
  }

  for (const width of [1280, 390]) {
    await check(`all ${pages.length} pages fit ${width}px and keep the theme menu`, async () => {
      const context = await browser.newContext({ viewport: { width, height: 844 } });
      const page = await context.newPage();
      const broken = [];
      for (const url of pages) {
        const localFailures = [];
        const onFailure = (request) => {
          const target = new URL(request.url());
          // Firefox cancels favicon/apple-touch requests during navigation; those
          // are covered by check-links.mjs, where missing files actually fail.
          const ignored = /\/(favicon[^/]*|apple-touch-icon[^/]*)\.(svg|png|ico)$/;
          if (target.origin === base && !ignored.test(target.pathname)) {
            localFailures.push(request.url());
          }
        };
        page.on('requestfailed', onFailure);
        await page.goto(`${base}${url}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await settle(page);
        const state = await page.evaluate(() => ({
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          schemes: document.querySelectorAll('input[name="scheme"]').length,
          modes: document.querySelectorAll('input[name="mode"]').length,
          menu: Boolean(document.getElementById('theme-menu')),
          navHeight: Math.round(document.querySelector('#nav-bar').getBoundingClientRect().height),
        }));
        page.off('requestfailed', onFailure);
        if (
          state.overflow > 1 ||
          state.schemes !== 6 ||
          state.modes !== 0 ||
          !state.menu ||
          state.navHeight !== 60 ||
          localFailures.length
        ) {
          broken.push(`${url} ${JSON.stringify(state)} ${localFailures.slice(0, 2).join(' ')}`);
        }
      }
      assert.deepEqual(broken, []);
      await context.close();
    });
  }

  await check('wordmark never takes the link color (visited state)', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    await page.goto(`${base}/`, { waitUntil: 'load' });
    await settle(page);
    await page.goto(`${base}/about/`, { waitUntil: 'load' });
    await settle(page);
    const state = await page.evaluate(() => {
      const wordmark = document.querySelector('.site-wordmark');
      return {
        wordmark: getComputedStyle(wordmark).color,
        body: getComputedStyle(document.body).color,
      };
    });
    assert.equal(state.wordmark, state.body, `wordmark ${state.wordmark} != text ${state.body}`);
    await context.close();
  });

  await check('structured posts get a TOC (2 top-level headings is enough)', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    for (const url of ['/mastering-emacs/', '/planning-my-digital-garden/', '/hooks-useref/']) {
      await page.goto(`${base}${url}`, { waitUntil: 'load' });
      await settle(page);
      assert.ok(await page.locator('.toc').count(), `missing TOC on ${url}`);
    }
    await context.close();
  });

  await check('post navigation skips dateless pages like /about/', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    await page.goto(`${base}/planning-my-digital-garden/`, { waitUntil: 'load' });
    await settle(page);
    const next = await page.evaluate(() => document.querySelector('.post-nav-next')?.getAttribute('href') || null);
    assert.notEqual(next, '/about/', 'about leaked into post-nav');
    await context.close();
  });

  await check('gruvbox titles use the authentic orange', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    await page.addInitScript(() => localStorage.setItem('scheme', 'gruvbox'));
    await page.goto(`${base}/`, { waitUntil: 'load' });
    await settle(page);
    const color = await page.evaluate(() => getComputedStyle(document.querySelector('.post-item-title a')).color);
    assert.equal(color, 'rgb(254, 128, 25)', color);
    await context.close();
  });

  await check('meta link hovers keep AA contrast', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    await page.goto(`${base}/hooks-useref/`, { waitUntil: 'load' });
    await settle(page);
    const byline = page.locator('.post-byline a').first();
    await byline.hover();
    const state = await page.evaluate(() => {
      const a = document.querySelector('.post-byline a');
      const cs = getComputedStyle(a);
      return { bg: cs.backgroundColor, color: cs.color };
    });
    assert.ok(state.bg === 'rgba(0, 0, 0, 0)' || state.bg === 'transparent', `byline hover bg ${state.bg}`);
    await context.close();
  });

  await check('tag pages are not marked as the writing section', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    await page.goto(`${base}/tags/react/`, { waitUntil: 'load' });
    await settle(page);
    const current = await page.evaluate(() => [...document.querySelectorAll('.nav-actions a[aria-current]')].map((a) => a.textContent.trim()));
    assert.deepEqual(current, [], JSON.stringify(current));
    await context.close();
  });

  await check('mobile wordmark has an accessible name', async () => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await page.goto(`${base}/about/`, { waitUntil: 'load' });
    await settle(page);
    const label = await page.evaluate(() => document.querySelector('.site-wordmark').getAttribute('aria-label'));
    assert.ok(label && label.length > 3, String(label));
    await context.close();
  });
} finally {
  await browser.close();
  server.close();
}

console.log(`\n${passes} passed, ${failures.length} failed`);
if (failures.length) process.exitCode = 1;
