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


function stripTags(value) {
  return value
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanMarkdown(body) {
  let text = body;
  text = text.replace(/<div class="embed-callout">[\s\S]*?<a\s+[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/div>/g,
    (_, url, label) => `[Interactive demo: ${stripTags(label)}](${url})`);
  text = text.replace(/<iframe\b[\s\S]*?<\/iframe>/g, (tag) => {
    const src = tag.match(/src="([^"]+)"/);
    const title = tag.match(/title="([^"]*)"/);
    if (!src) return tag;
    return `[Embedded video: ${title ? title[1] : src[1]}](${src[1]})`;
  });
  text = text.replace(/<a\s+[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g,
    (_, url, label) => (/<[^>]+>/.test(label) ? label : `[${label.trim()}](${url})`));
  text = text.replace(/\]\(\//g, `](${siteUrl}/`);
  text = text.replace(/href="\//g, `href="${siteUrl}/`);
  text = text.replace(/src="\//g, `src="${siteUrl}/`);
  return text;
}

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
      const cleanBody = cleanMarkdown(body.trim().replace(/\{\{\s*img\(path="[^"]*",\s*alt="([^"]*)"(?:,\s*caption="([^"]*)")?\)\s*\}\}/g, (_, alt, caption) => caption ? `_[Image: ${alt}]_\n\n_${caption}_` : `_[Image: ${alt}]_`));
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

const latest = posts[0]?.data.updated || posts[0]?.data.date || '';
const topicCounts = new Map();
for (const post of posts) {
  for (const tag of post.data.tags || []) topicCounts.set(tag, (topicCounts.get(tag) || 0) + 1);
}
const lines = [];
lines.push(`# ${siteTitle}`);
lines.push('');
lines.push(`> ${siteDescription}`);
lines.push('');
lines.push(`${author} is a software engineer who writes about code, tools, and the things he is figuring out. This is a static, server-rendered blog with stable URLs, Atom/RSS/JSON feeds, a sitemap, and per-page Markdown.`);
if (latest) lines.push(`Last updated: ${latest}`);
lines.push('');
if (about) {
  lines.push('## About');
  lines.push('');
  lines.push(`- [${about.data.title || 'About'}](${about.url}): ${about.data.description || ''}`);
  lines.push('');
}
lines.push('## Topics');
lines.push('');
for (const [tag, count] of [...topicCounts.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
  const slug = tag.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  lines.push(`- [${tag}](${siteUrl}/tags/${slug}/): ${count} ${count === 1 ? 'post' : 'posts'}`);
}
lines.push('');
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
lines.push(`- [RSS feed](${siteUrl}/rss.xml)`);
lines.push(`- [JSON Feed](${siteUrl}/feed.json)`);
lines.push('');
lines.push('## Contact');
lines.push('');
if (email) lines.push(`- [Email](mailto:${email})`);
if (github) lines.push(`- [GitHub](${github})`);
if (linkedin) lines.push(`- [LinkedIn](${linkedin})`);
lines.push('');
lines.push('## Machine-readable');
lines.push('');
lines.push(`- [Sitemap](${siteUrl}/sitemap.xml)`);
lines.push(`- [llms.txt](${siteUrl}/llms.txt)`);
lines.push(`- [llms-full.txt](${siteUrl}/llms-full.txt)`);
lines.push(`- [Markdown index](${siteUrl}/md/index.md)`);
lines.push(`- [About (Markdown)](${siteUrl}/md/about/index.md)`);
lines.push(`- [Tags (Markdown)](${siteUrl}/md/tags/index.md)`);
lines.push(`- [security.txt](${siteUrl}/.well-known/security.txt)`);
lines.push(`- [humans.txt](${siteUrl}/humans.txt)`);
lines.push('');
lines.push('Each HTML page also advertises its Markdown representation with `<link rel="alternate" type="text/markdown">`.');
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


// Per-page Markdown representations, served from /md/<path>/index.md.
const mdDir = path.join(staticDir, 'md');
fs.rmSync(mdDir, { recursive: true, force: true });

function slugFor(relativePath) {
  const normalized = relativePath.split(path.sep).join('/');
  return normalized.endsWith('/index.md')
    ? normalized.slice(0, -'/index.md'.length)
    : normalized.replace(/\.md$/, '');
}

function writeMarkdown(relativePath, content) {
  const target = path.join(mdDir, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content.endsWith('\n') ? content : content + '\n');
}

function yamlFrontmatter(fields) {
  const lines = ['---'];
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) lines.push(`${key}: ${JSON.stringify(value)}`);
    else if (typeof value === 'number' || typeof value === 'boolean') lines.push(`${key}: ${value}`);
    else lines.push(`${key}: ${JSON.stringify(value)}`);
  }
  lines.push('---', '');
  return lines.join('\n');
}

function postMarkdown(page) {
  const fm = yamlFrontmatter({
    title: page.data.title,
    description: page.data.description,
    date: page.data.date,
    updated: page.data.updated,
    tags: page.data.tags,
    category: page.data.category,
    canonical: page.url,
    html: page.url,
  });
  const lede = page.data.description ? `> ${page.data.description}\n\n` : '';
  return `${fm}# ${page.data.title}\n\n${lede}${page.body}\n`;
}

writeMarkdown('index.md', yamlFrontmatter({
  title: siteTitle,
  description: siteDescription,
  canonical: `${siteUrl}/`,
  html: `${siteUrl}/`,
  author,
  atom: `${siteUrl}/atom.xml`,
  rss: `${siteUrl}/rss.xml`,
  json_feed: `${siteUrl}/feed.json`,
  sitemap: `${siteUrl}/sitemap.xml`,
  llms: `${siteUrl}/llms.txt`,
  llms_full: `${siteUrl}/llms-full.txt`,
}) + [
  `# ${siteTitle}`,
  '',
  `> ${siteDescription}`,
  '',
  '## Writing',
  '',
  ...posts.map((post) => `- [${post.data.title}](${post.url})${post.data.description ? `: ${post.data.description}` : ''}${post.data.date ? ` (${post.data.date})` : ''}`),
  '',
].join('\n'));

for (const post of posts) {
  writeMarkdown(path.join(slugFor(post.relative), 'index.md'), postMarkdown(post));
}
if (about) {
  writeMarkdown(path.join(slugFor(about.relative), 'index.md'), postMarkdown(about));
}

const tagMap = new Map();
for (const post of posts) {
  for (const tag of post.data.tags || []) {
    const slug = tag.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (!tagMap.has(slug)) tagMap.set(slug, { name: tag, slug, posts: [] });
    tagMap.get(slug).posts.push(post);
  }
}
writeMarkdown('tags/index.md', yamlFrontmatter({
  title: 'Tags',
  canonical: `${siteUrl}/tags/`,
  html: `${siteUrl}/tags/`,
}) + [
  '# Tags',
  '',
  ...Array.from(tagMap.values())
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((tag) => `- [${tag.name}](${siteUrl}/tags/${tag.slug}/): ${tag.posts.length} ${tag.posts.length === 1 ? 'post' : 'posts'}`),
  '',
].join('\n'));
for (const tag of tagMap.values()) {
  writeMarkdown(path.join('tags', tag.slug, 'index.md'), yamlFrontmatter({
    title: `Posts tagged “${tag.name}”`,
    canonical: `${siteUrl}/tags/${tag.slug}/`,
    html: `${siteUrl}/tags/${tag.slug}/`,
  }) + [
    `# Posts tagged “${tag.name}”`,
    '',
    `Count: ${tag.posts.length}`,
    '',
    ...tag.posts.map((post) => `- [${post.data.title}](${post.url})${post.data.description ? `: ${post.data.description}` : ''}${post.data.date ? ` (${post.data.date})` : ''}`),
    '',
  ].join('\n'));
}

fs.writeFileSync(path.join(staticDir, 'llms.txt'), lines.join('\n'));

fs.writeFileSync(path.join(staticDir, 'llms-full.txt'), full.join('\n'));
console.log(`Generated llms.txt (${posts.length} posts) and llms-full.txt`);
