#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

ZOLA_BIN="${ZOLA_BIN:-}"
if [ -z "${ZOLA_BIN}" ]; then
    if command -v zola >/dev/null 2>&1 && zola --version 2>/dev/null | grep -q "zola 0.22.1"; then
        ZOLA_BIN="zola"
    else
        ZOLA_BIN="$(find .zola -type f -name zola -perm -111 2>/dev/null | head -n 1)"
    fi
fi

if [ -z "${ZOLA_BIN}" ] || [ ! -x "${ZOLA_BIN}" ]; then
    echo "Zola 0.22.1 is not available. Run ./build.sh first." >&2
    exit 1
fi

"${ZOLA_BIN}" check --skip-external-links
if command -v node >/dev/null 2>&1; then
    node scripts/gen-llms.mjs
    ZOLA_BIN="${ZOLA_BIN}" node scripts/gen-syntax-css.mjs
fi
rm -f static/giallo-light.css static/giallo-dark.css
"${ZOLA_BIN}" build
node scripts/gen-machine.mjs
node scripts/check-links.mjs

if command -v xmllint >/dev/null 2>&1; then
    xmllint --noout public/atom.xml public/rss.xml public/sitemap.xml
fi
find public -name 'feed.json' -print0 | while IFS= read -r -d '' file; do
    node -e 'JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"))' "$file"
done
if [ "$(grep -c '<url>' public/sitemap.xml)" != "$(grep -c '<lastmod>' public/sitemap.xml)" ]; then
    echo "Sitemap entries are missing lastmod." >&2
    exit 1
fi
test -f public/_headers && test -f public/_redirects
