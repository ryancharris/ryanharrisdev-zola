#!/usr/bin/env node
// Generate one Giallo CSS pair per color scheme by building a tiny throwaway
// Zola site for each theme pair. The main site then switches these files at runtime.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const zolaInput = process.env.ZOLA_BIN || 'zola';
const zola = zolaInput.includes('/') ? path.resolve(zolaInput) : zolaInput;
const work = path.join(root, '.zola', 'syntax-build');
const output = path.join(root, 'static', 'syntax');


const codeBackgrounds = {
  'paper-light': '#FCFAF4',
  'paper-dark': '#120F0C',
  'gruvbox-light': '#FBF1C7',
  'gruvbox-dark': '#1D2021',
  'rose-pine-light': '#FAF4ED',
  'rose-pine-dark': '#191724',
  'monokai-light': '#272822',
  'monokai-dark': '#272822',
  'catppuccin-mocha-light': '#181825',
  'catppuccin-mocha-dark': '#181825',
  'pencil-light-light': '#FFFFFF',
  'pencil-light-dark': '#FFFFFF',
};

function hexToRgb(hex) {
  const value = hex.replace('#', '');
  return [parseInt(value.slice(0, 2), 16), parseInt(value.slice(2, 4), 16), parseInt(value.slice(4, 6), 16)];
}

function rgbToHex(rgb) {
  return '#' + rgb.map((value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0')).join('');
}

function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map((value) => {
    const channel = value / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
  const l1 = luminance(a);
  const l2 = luminance(b);
  const [light, dark] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (light + 0.05) / (dark + 0.05);
}

function rgbToHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h / 6, s, l];
}

function hslToRgb([h, s, l]) {
  if (s === 0) return [l * 255, l * 255, l * 255];
  const hue = (p, q, t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [hue(p, q, h + 1 / 3) * 255, hue(p, q, h) * 255, hue(p, q, h - 1 / 3) * 255];
}

function accessibleColor(hex, background) {
  if (contrast(hex, background) >= 4.6) return hex;
  const darkBackground = luminance(background) < 0.5;
  const [h, s, l] = rgbToHsl(hexToRgb(hex));
  let lightness = l;
  for (let i = 0; i < 40; i += 1) {
    lightness += darkBackground ? 0.025 : -0.025;
    if (lightness <= 0 || lightness >= 1) break;
    const candidate = rgbToHex(hslToRgb([h, s, lightness]));
    if (contrast(candidate, background) >= 4.6) return candidate;
  }
  return darkBackground ? '#F8F8F2' : '#272822';
}

function adjustTokenContrast(css, background) {
  return css.replace(/([^{}]+)\{([^{}]*)\}/g, (rule, selector, body) => {
    if (!/\bcolor\s*:/.test(body) || /\bbackground(?:-color)?\s*:/.test(body)) return rule;
    const adjusted = body.replace(/color:\s*(#[0-9a-fA-F]{6})/g, (match, color) => {
      return `color: ${accessibleColor(color, background)}`;
    });
    return `${selector}{${adjusted}}`;
  });
}

// Per-scheme post-processing: retint GitHub's generic high-contrast palettes
// onto the scheme's own colors (applied before the final contrast check).
const retints = {
  'paper-light': {
    '#0E1116': '#211E19', // base text
    '#66707B': '#756957', // comments / line numbers
    '#68727E': '#756957',
    '#032563': '#2C5A4D', // strings
    '#023B95': '#575043', // constants / entities / support
    '#702C00': '#6B4A2F', // variables / entity names
    '#A0111F': '#8A2E22', // keywords / storage / invalid
    '#6E011A': '#8A2E22',
    '#024C1A': '#2C5A4D', // markup quote
    '#FFFFFF': '#FCFAF4', // code background
    '#E7ECF0': '#EDE7DA', // highlight background
  },
  'paper-dark': {
    '#F0F3F6': '#EDE4D3', // base text
    '#BDC4CC': '#8A7E6A', // comments
    '#9EA7B3': '#756957', // line numbers
    '#ADDCFF': '#93D2B7', // strings
    '#72F088': '#93D2B7', // markup quote / inserted
    '#91CBFF': '#BBAE98', // constants / entities / support
    '#FF9492': '#EDAA80', // keywords / storage
    '#FFB757': '#E0C08F', // variables / entity names / changed
    '#FFB1AF': '#EDAA80', // invalid / deleted
    '#0A0C10': '#120F0C', // code background
  },
};

function retint(css, map) {
  return css.replace(/#[0-9A-Fa-f]{6}\b/g, (hex) => map[hex.toUpperCase()] || hex);
}

// Rosé Pine italicizes every plain variable, which no other scheme does.
function normalizeTokenStyle(slug, css) {
  if (slug === 'rose-pine') {
    css = css.replace(/\.z-variable \{ (color: #[0-9a-fA-F]{6};) font-style: italic; \}/g, '.z-variable { $1 }');
  }
  return css;
}

const schemes = [
  { slug: 'paper', light: 'github-light-high-contrast', dark: 'github-dark-high-contrast' },
  { slug: 'gruvbox', light: 'gruvbox-light-hard', dark: 'gruvbox-dark-hard' },
  { slug: 'rose-pine', light: 'rose-pine-dawn', dark: 'rose-pine' },
  { slug: 'monokai', light: 'monokai', dark: 'monokai' },
  { slug: 'catppuccin-mocha', light: 'catppuccin-latte', dark: 'catppuccin-mocha' },
  { slug: 'pencil-light', light: 'github-light-high-contrast', dark: 'github-dark-high-contrast' },
];

fs.rmSync(work, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });

for (const scheme of schemes) {
  const dir = path.join(work, scheme.slug);
  fs.mkdirSync(path.join(dir, 'content'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'zola.toml'),
    `base_url = "https://example.com"\ntitle = "syntax"\n\n[markdown.highlighting]\nlight_theme = "${scheme.light}"\ndark_theme = "${scheme.dark}"\nstyle = "class"\n`,
  );
  fs.writeFileSync(path.join(dir, 'content', '_index.md'), '+++\ntitle = "syntax"\n+++\n');
  fs.writeFileSync(
    path.join(dir, 'content', 'code.md'),
    '+++\ntitle = "code"\n+++\n\n```javascript\nconst message = "hello"; // comment\nfunction greet(name) { return message + name; }\n```\n',
  );

  execFileSync(zola, ['build'], { cwd: dir, stdio: 'pipe' });
  for (const mode of ['light', 'dark']) {
    const source = path.join(dir, 'public', `giallo-${mode}.css`);
    if (!fs.existsSync(source)) {
      throw new Error(`Missing ${source}`);
    }
    const target = path.join(output, `${scheme.slug}-${mode}.css`);
    const background = codeBackgrounds[`${scheme.slug}-${mode}`];
    let css = fs.readFileSync(source, 'utf8');
    const retintMap = retints[`${scheme.slug}-${mode}`];
    if (retintMap) css = retint(css, retintMap);
    css = normalizeTokenStyle(scheme.slug, css);
    fs.writeFileSync(target, adjustTokenContrast(css, background));
  }
  console.log(`Generated syntax CSS for ${scheme.slug}`);
}

fs.rmSync(work, { recursive: true, force: true });
