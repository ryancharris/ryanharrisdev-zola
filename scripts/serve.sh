#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

ZOLA_BIN="$(find .zola -type f -name zola -perm -111 2>/dev/null | head -n 1)"
if [ -z "${ZOLA_BIN}" ] || [ ! -x "${ZOLA_BIN}" ]; then
    echo "Zola 0.22.1 is not available. Run ./build.sh first." >&2
    exit 1
fi

exec "${ZOLA_BIN}" serve "$@"
