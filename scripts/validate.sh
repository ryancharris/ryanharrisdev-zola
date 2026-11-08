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
rm -f static/giallo-light.css static/giallo-dark.css
"${ZOLA_BIN}" build
node scripts/check-links.mjs
