#!/usr/bin/env node
// Validate generated HTML: internal links, fragments, image attributes,
// duplicate IDs, and JSON-LD parsing. Run after `zola build`.

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const publicDir = path.join(root, 'public');

function walk(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(full));
    else if (entry.name.endsWith('.html')) files.push(full);
  }
  return files;
}

function decode(value) {
  return value
    .replace(/&#x2F;/gi, '/')
    .replace(/&#x27;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&');
}

function isExternal(url) {
  return /^(https?:)?\/\//i.test(url) || /^(mailto|tel|data|javascript):/i.test(url);
}

function targetFor(sourceFile, url) {
  const clean = decode(url).split('#')[0].split('?')[0];
  if (!clean) return null;
  let target;
  if (clean.startsWith('/')) target = path.join(publicDir, clean);
  else target = path.resolve(path.dirname(sourceFile), clean);
  if (clean.endsWith('/')) target = path.join(target, 'index.html');
  return target;
}

function exists(target) {
  if (!target) return true;
  if (fs.existsSync(target) && fs.statSync(target).isFile()) return true;
  if (fs.existsSync(target + '.html')) return true;
  if (fs.existsSync(path.join(target, 'index.html'))) return true;
  return false;
}

const files = walk(publicDir);
const broken = [];
const missingAlt = [];
const missingDimensions = [];
const missingLoading = [];
const duplicateIds = [];
const invalidJsonLd = [];
let linkCount = 0;

for (const file of files) {
  const html = fs.readFileSync(file, 'utf8');
  const relative = path.relative(publicDir, file);

  const attributes = [...html.matchAll(/\b(?:href|src)="([^"]+)"/g)];
  const srcsets = [...html.matchAll(/\bsrcset="([^"]+)"/g)];
  const urls = attributes.map((match) => match[1]);
  for (const srcset of srcsets) {
    for (const candidate of decode(srcset[1]).split(',')) {
      const url = candidate.trim().split(/\s+/)[0];
      if (url) urls.push(url);
    }
  }

  for (const url of urls) {
    if (!url || isExternal(url) || url.startsWith('#')) continue;
    linkCount += 1;
    const target = targetFor(file, url);
    if (!exists(target)) {
      broken.push({ page: relative, url: decode(url) });
      continue;
    }
    const hash = decode(url).split('#')[1];
    if (hash) {
      let targetFile = target;
      if (!fs.statSync(targetFile).isFile()) {
        if (fs.existsSync(targetFile + '.html')) targetFile += '.html';
        else targetFile = path.join(targetFile, 'index.html');
      }
      const targetHtml = fs.readFileSync(targetFile, 'utf8');
      const idPattern = new RegExp(`(?:id|name)="${hash.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`);
      if (!idPattern.test(targetHtml)) {
        broken.push({ page: relative, url: decode(url), reason: `missing fragment #${hash}` });
      }
    }
  }

  for (const match of html.matchAll(/<img\b[^>]*>/g)) {
    const tag = match[0];
    if (!/\balt="/.test(tag)) missingAlt.push(relative);
    if (!/\bwidth="/.test(tag) || !/\bheight="/.test(tag)) missingDimensions.push(relative);
    if (!/\bloading="/.test(tag)) missingLoading.push(relative);
  }

  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  const seen = new Set();
  const dupes = new Set();
  for (const id of ids) {
    if (seen.has(id)) dupes.add(id);
    seen.add(id);
  }
  if (dupes.size) duplicateIds.push({ page: relative, ids: [...dupes] });

  for (const match of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try {
      JSON.parse(match[1]);
    } catch (error) {
      invalidJsonLd.push({ page: relative, error: error.message });
    }
  }
}

function report(name, items, format) {
  if (!items.length) return;
  console.error(`\n${name} (${items.length}):`);
  for (const item of items) console.error(`  ${format(item)}`);
}

console.log(`Checked ${linkCount} internal links across ${files.length} HTML pages.`);
report('Broken internal links', broken, (item) => `${item.page}: ${item.url}${item.reason ? ` (${item.reason})` : ''}`);
report('Images without alt', missingAlt, (item) => item);
report('Images without width/height', missingDimensions, (item) => item);
report('Images without loading', missingLoading, (item) => item);
report('Duplicate IDs', duplicateIds, (item) => `${item.page}: ${item.ids.join(', ')}`);
report('Invalid JSON-LD', invalidJsonLd, (item) => `${item.page}: ${item.error}`);

const failures = broken.length + missingAlt.length + missingDimensions.length + duplicateIds.length + invalidJsonLd.length;
if (failures) {
  console.error(`\n${failures} validation problem(s) found.`);
  process.exit(1);
}
console.log('All checks passed.');
