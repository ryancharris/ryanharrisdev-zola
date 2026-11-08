#!/usr/bin/env node
// Post-build machine-readability pass.
// - Enriches /md/*.md with absolute image URLs from the rendered HTML.
// - Adds language-* classes to highlighted code blocks.
// - Rebuilds llms-full.txt from the enriched Markdown mirrors.
// - Adds lastmod dates to the home and taxonomy sitemap entries.

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const publicDir = path.join(root, 'public');
const mdDir = path.join(publicDir, 'md');
const config = fs.readFileSync(path.join(root, 'zola.toml'), 'utf8');
const baseUrl = (config.match(/^base_url\s*=\s*"([^"]*)"/m)?.[1] || '').replace(/\/$/, '');
const siteTitle = config.match(/^title\s*=\s*"([^"]*)"/m)?.[1] || '';
const siteDescription = config.match(/^description\s*=\s*"([^"]*)"/m)?.[1] || '';
const github = config.match(/^github\s*=\s*"([^"]*)"/m)?.[1] || '';

function walk(dir, extension) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(full, extension));
    else if (entry.name.endsWith(extension)) files.push(full);
  }
  return files;
}


function splitFrontmatter(markdown) {
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) return { front: '', body: markdown };
  return { front: match[1], body: markdown.slice(match[0].length) };
}

function frontValue(front, key) {
  const match = front.match(new RegExp(`^${key}: (.*)$`, 'm'));
  if (!match) return '';
  const value = match[1].trim();
  try {
    return JSON.parse(value);
  } catch (error) {
    return value;
  }
}

function fullTextSection(relative) {
  const markdown = readMarkdown(relative);
  if (!markdown) return '';
  const { front, body } = splitFrontmatter(markdown);
  const title = frontValue(front, 'title');
  const lines = [];
  if (title) lines.push(`# ${title}`, '');
  for (const key of ['canonical', 'date', 'updated', 'description']) {
    const value = frontValue(front, key);
    if (value) lines.push(`${key.charAt(0).toUpperCase() + key.slice(1)}: ${value}`);
  }
  const tags = frontValue(front, 'tags');
  if (Array.isArray(tags) && tags.length) lines.push(`Tags: ${tags.join(', ')}`);
  const category = frontValue(front, 'category');
  if (category) lines.push(`Category: ${category}`);
  lines.push('', body.trim(), '');
  return lines.join('\n');
}

function absolute(url) {
  if (!url) return url;
  return url.startsWith('/') ? baseUrl + url : url;
}

function htmlForMarkdown(file) {
  const relative = path.relative(mdDir, file).split(path.sep).join('/');
  if (relative === 'index.md') return path.join(publicDir, 'index.html');
  const slug = relative.replace(/\/index\.md$/, '');
  return path.join(publicDir, slug, 'index.html');
}

function enrichMarkdown(file) {
  let markdown = fs.readFileSync(file, 'utf8');
  const htmlFile = htmlForMarkdown(file);
  let images = [];
  if (fs.existsSync(htmlFile)) {
    const html = fs.readFileSync(htmlFile, 'utf8');
    images = [...html.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/g)].map((match) => absolute(match[1].replace(/&#x2F;/g, '/')));
  }

  let index = 0;
  markdown = markdown.replace(/_\[Image: ([^\]]*)\]_/g, (placeholder, alt) => {
    const src = images[index];
    index += 1;
    return src ? `![${alt}](${src})` : placeholder;
  });
  markdown = markdown.replace(/\]\(\//g, `](${baseUrl}/`);
  markdown = markdown.replace(/href="\//g, `href="${baseUrl}/`);
  markdown = markdown.replace(/src="\//g, `src="${baseUrl}/`);
  fs.writeFileSync(file, markdown);
}

if (fs.existsSync(mdDir)) {
  for (const file of walk(mdDir, '.md')) enrichMarkdown(file);
}

// Add standard language-* classes for syntax-highlighted code.
const languageMap = {
  shellscript: 'bash',
  'emacs-lisp': 'elisp',
};

for (const file of walk(publicDir, '.html')) {
  let html = fs.readFileSync(file, 'utf8');
  html = html.replace(/<pre class="([^"]*)"><code data-lang="([^"]+)">/g, (match, preClass, language) => {
    const normalized = languageMap[language] || language;
    return `<pre class="${preClass} language-${normalized}"><code class="language-${normalized}" data-lang="${language}">`;
  });
  fs.writeFileSync(file, html);
}

// Rebuild llms-full.txt from the enriched Markdown mirrors.
function readMarkdown(relative) {
  const file = path.join(mdDir, relative);
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
}

function postSlugs() {
  const index = readMarkdown('index.md');
  const urls = [...index.matchAll(/\]\((https:\/\/[^)]+)\)/g)]
    .map((match) => match[1])
    .filter((url) => url.startsWith(`${baseUrl}/`) && !url.includes('/tags/') && !url.endsWith('/about/'));
  return urls
    .map((url) => url.slice(baseUrl.length + 1).replace(/\/$/, ''))
    .filter(Boolean);
}

const full = [
  `# ${siteTitle} — full text`,
  '',
  `> ${siteDescription}`,
  '',
  `Canonical: ${baseUrl}/`,
  `Source: ${github}/ryanharrisdev-zola`,
  '',
  readMarkdown('index.md').slice(readMarkdown('index.md').indexOf('## Writing')).trim(),
  '',
  '---',
  '',
  fullTextSection('about/index.md'),
  '',
];

for (const slug of postSlugs()) {
  full.push('---', '', fullTextSection(`${slug}/index.md`), '');
}
fs.writeFileSync(path.join(publicDir, 'llms-full.txt'), full.join('\n'));

// Add lastmod to home and taxonomy sitemap URLs when absent.
const sitemapPath = path.join(publicDir, 'sitemap.xml');
if (fs.existsSync(sitemapPath)) {
  const index = readMarkdown('index.md');
  const allDates = [...index.matchAll(/\((\d{4}-\d{2}-\d{2})\)/g)].map((match) => match[1]).sort();
  const latest = allDates.length ? allDates[allDates.length - 1] : '';
  let sitemap = fs.readFileSync(sitemapPath, 'utf8');

  sitemap = sitemap.replace(/<url>\s*<loc>([^<]+)<\/loc>\s*<\/url>/g, (block, loc) => {
    if (!latest) return block;
    let lastmod = latest;
    const tagMatch = loc.match(/\/tags\/([^/]+)\/$/);
    if (tagMatch) {
      const tagMd = readMarkdown(`tags/${tagMatch[1]}/index.md`);
      const dates = [...tagMd.matchAll(/\((\d{4}-\d{2}-\d{2})\)/g)].map((match) => match[1]).sort();
      lastmod = dates.length ? dates[dates.length - 1] : latest;
    }
    return `<url>\n    <loc>${loc}</loc>\n    <lastmod>${lastmod}</lastmod>\n  </url>`;
  });
  fs.writeFileSync(sitemapPath, sitemap);
}

console.log(`Enriched Markdown, added code language classes, rebuilt llms-full.txt (${postSlugs().length} posts).`);
