#!/usr/bin/env node
// Generate llms.txt and llms-full.txt from the Markdown sources.
// Run from the repository root (build.sh does this before `zola build`).

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const contentDir = path.join(root, 'content');
const staticDir = path.join(root, 'static');
const configText = fs.readFileSync(path.join(root, 'zola.toml'), 'utf8');

function configValue(key) {
  const match = configText.match(new RegExp(`^${key}\\s*=\\s*"([^"]*)"`, 'm'));
  return match ? match[1] : '';
}

const siteUrl = configValue('base_url').replace(/\/$/, '');
const siteTitle = configValue('title');
const siteDescription = configValue('description');
const author = configValue('author');
const email = configText.match(/^email\s*=\s*"([^"]*)"/m)?.[1] || '';
const github = configText.match(/^github\s*=\s*"([^"]*)"/m)?.[1] || '';
const linkedin = configText.match(/^linkedin\s*=\s*"([^"]*)"/m)?.[1] || '';

function unquote(value) {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }
  return trimmed;
}

function frontmatter(text) {
  const match = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) return { data: {}, body: text };
  const fm = match[1];
  const body = text.slice(match[0].length);
  const data = {};
  for (const key of ['title', 'date', 'updated', 'description', 'draft', 'include_in_feeds']) {
    const m = fm.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'));
    if (m) data[key] = unquote(m[1]);
  }
  const extra = fm.match(/^extra:\n((?:[ \t]+.*\n?)*)/m);
  if (extra) {
    const category = extra[1].match(/^  category:\s*(.+)$/m);
    const hidden = extra[1].match(/^  hidden:\s*(.+)$/m);
    if (category) data.category = unquote(category[1]);
    if (hidden) data.hidden = unquote(hidden[1]) === 'true';
  }
  const tags = fm.match(/^taxonomies:\n  tags:\n((?:    - .*\n)+)/m);
  if (tags) {
    data.tags = tags[1]
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => unquote(line.replace(/^- /, '')));
  }
  return { data, body };
}

function pageUrl(relativePath) {
  const normalized = relativePath.split(path.sep).join('/');
  const slug = normalized.endsWith('/index.md')
    ? normalized.slice(0, -'/index.md'.length)
    : normalized.replace(/\.md$/, '');
  return `${siteUrl}/${slug}/`;
}

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.isFile() && entry.name.endsWith('.md') && entry.name !== '_index.md') {
      const relative = path.relative(contentDir, full);
      const { data, body } = frontmatter(fs.readFileSync(full, 'utf8'));
      const cleanBody = body.trim().replace(/\{\{\s*img\(path="[^"]*",\s*alt="([^"]*)"\)\s*\}\}/g, '_[Image: $1]_');
      pages.push({ relative, url: pageUrl(relative), data, body: cleanBody });
    }
  }
}

const pages = [];
walk(contentDir);

const about = pages.find((page) => page.relative === 'about.md');
const posts = pages
  .filter((page) => page !== about)
  .sort((a, b) => String(b.data.date || '').localeCompare(String(a.data.date || '')));

const lines = [];
lines.push(`# ${siteTitle}`);
lines.push('');
lines.push(`> ${siteDescription}`);
lines.push('');
lines.push(`${author} is a software engineer who writes about code, tools, and the things he is figuring out. This is a static, server-rendered blog with stable URLs and an Atom feed.`);
lines.push('');
if (about) {
  lines.push('## About');
  lines.push('');
  lines.push(`- [about](${about.url}): ${about.data.description || ''}`);
  lines.push('');
}
lines.push('## Writing');
lines.push('');
for (const post of posts) {
  const date = post.data.date ? ` (${post.data.date})` : '';
  const description = post.data.description ? `: ${post.data.description}` : '';
  lines.push(`- [${post.data.title}](${post.url})${description}${date}`);
}
lines.push('');
lines.push('## Feeds');
lines.push('');
lines.push(`- [Atom feed](${siteUrl}/atom.xml)`);
lines.push('');
lines.push('## Contact');
lines.push('');
if (email) lines.push(`- Email: ${email}`);
if (github) lines.push(`- GitHub: ${github}`);
if (linkedin) lines.push(`- LinkedIn: ${linkedin}`);
lines.push('');
lines.push(`## Full text`);
lines.push('');
lines.push(`- [llms-full.txt](${siteUrl}/llms-full.txt)`);
lines.push('');

const full = [];
full.push(`# ${siteTitle} — full text`);
full.push('');
full.push(`> ${siteDescription}`);
full.push('');
full.push(`Source: ${github || siteUrl}`);
full.push('');
for (const page of [about, ...posts].filter(Boolean)) {
  full.push('---');
  full.push('');
  full.push(`# ${page.data.title}`);
  full.push('');
  full.push(`URL: ${page.url}`);
  if (page.data.date) full.push(`Published: ${page.data.date}`);
  if (page.data.updated) full.push(`Updated: ${page.data.updated}`);
  if (page.data.description) full.push(`Description: ${page.data.description}`);
  if (page.data.tags && page.data.tags.length) full.push(`Tags: ${page.data.tags.join(', ')}`);
  if (page.data.category) full.push(`Category: ${page.data.category}`);
  full.push('');
  full.push(page.body);
  full.push('');
}

fs.writeFileSync(path.join(staticDir, 'llms.txt'), lines.join('\n'));
fs.writeFileSync(path.join(staticDir, 'llms-full.txt'), full.join('\n'));
console.log(`Generated llms.txt (${posts.length} posts) and llms-full.txt`);
