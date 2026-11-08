# ryanharris.dev

Personal blog built with [Zola](https://www.getzola.org/) and deployed to Cloudflare Workers.

## Requirements

- Git (the theme is a submodule)
- Node.js 20+ (generates `llms.txt` and `llms-full.txt`)
- Zola 0.22.1 — `build.sh` downloads the pinned, checksum-verified release automatically

> Zola 0.23+ is not supported yet. It changes Tera and removes the shortcode API used by the image helper, so use the pinned 0.22.1 binary.

## Development

```sh
./build.sh        # pinned Zola build + LLM text files
./scripts/serve.sh # live-reloading server using the pinned binary
```

The pinned binary is cached in `.zola/` after the first `./build.sh`.

## Validation

```sh
./scripts/validate.sh
```

This runs Zola's internal link checker, rebuilds the site, and checks the generated
HTML for broken internal links, missing image attributes, duplicate IDs, and invalid
JSON-LD.

## Writing

Posts live in `content/` as Markdown with YAML front matter. Most posts are a single
`.md` file; image-heavy posts are page bundles (`content/<slug>/index.md`).

```yaml
---
title: "Post title"
date: "2020-01-01"
description: "One-sentence summary used for search, social cards, feeds, and llms.txt."
taxonomies:
  tags:
    - "react"
extra:
  category: "react"
---
```

### Images

Source images live in `assets/images/<slug>/`, outside `content/`, so the large
originals are not deployed. Use the `img` shortcode instead of Markdown images:

```md
{{ img(path="assets/images/<slug>/screenshot.png", alt="Descriptive alt text") }}
```

Zola generates responsive 800px/1600px WebP variants into `static/processed_images/`
(gitignored) and emits `srcset`, `width`, `height`, `loading="lazy"`, and
`decoding="async"`.

### LLM files

`scripts/gen-llms.mjs` writes `static/llms.txt` and `static/llms-full.txt` from the
Markdown sources. `build.sh` runs it automatically before every build. Run it manually
after adding posts:

```sh
node scripts/gen-llms.mjs
```

## Deployment

`wrangler.toml` builds with `bash ./build.sh` and serves `./public` with
`not_found_handling = "404-page"`. Do not commit `public/`.

Two settings live in the Cloudflare dashboard rather than this repo:

- Redirect `www.ryanharris.dev` to `https://ryanharris.dev` (301) and force HTTPS.
- Review AI Crawl Control / managed `robots.txt` if you want to change the current
  `ai-train=no` policy for LLM crawlers.
