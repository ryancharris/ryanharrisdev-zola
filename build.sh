#!/usr/bin/env bash
set -euo pipefail

ZOLA_VERSION="0.22.1"

download_zola() {
    local target="$1"
    local sha="$2"
    local name="zola-v${ZOLA_VERSION}-${target}"
    local archive=".zola/${name}.tar.gz"
    local dir=".zola/${name}"

    if [ -x "${dir}/zola" ] && "${dir}/zola" --version 2>/dev/null | grep -q "zola ${ZOLA_VERSION}"; then
        ZOLA="${dir}/zola"
        return
    fi

    mkdir -p .zola
    curl --fail --location --retry 3 --retry-delay 2 --silent --show-error \
        "https://github.com/getzola/zola/releases/download/v${ZOLA_VERSION}/${name}.tar.gz" \
        --output "${archive}"

    if command -v sha256sum >/dev/null 2>&1; then
        actual="$(sha256sum "${archive}" | awk '{print $1}')"
    elif command -v shasum >/dev/null 2>&1; then
        actual="$(shasum -a 256 "${archive}" | awk '{print $1}')"
    else
        echo "No sha256 tool found; refusing to run an unverified Zola binary." >&2
        exit 1
    fi

    if [ "${actual}" != "${sha}" ]; then
        echo "Checksum mismatch for ${archive}." >&2
        echo "expected: ${sha}" >&2
        echo "actual:   ${actual}" >&2
        exit 1
    fi

    rm -rf "${dir}"
    mkdir -p "${dir}"
    tar --extract --gzip --file "${archive}" --directory "${dir}"
    chmod +x "${dir}/zola"
    ZOLA="${dir}/zola"
}

main() {
    local os arch target sha
    os="$(uname -s)"
    arch="$(uname -m)"

    case "${os}/${arch}" in
        Linux/x86_64)
            target="x86_64-unknown-linux-gnu"
            sha="0ca09aa40376aaa9ddfb512ff9ad963262ef95edb0d0f2d5ec6961b6f5cf22ef"
            ;;
        Linux/aarch64|Linux/arm64)
            target="aarch64-unknown-linux-gnu"
            sha="8af437ec6352f33ccd24d7a1cfcb54a3db95d3ce376dc69525b4ef3fb6b8c1d1"
            ;;
        Darwin/arm64)
            target="aarch64-apple-darwin"
            sha="46ac45a9e7628dba8593b124ee8794f4f9aa1c6b569918ecd4bbc5d0be190515"
            ;;
        Darwin/x86_64)
            target="x86_64-apple-darwin"
            sha="3898709e154ae0593933264a540c869348bdb10d7f1b03a42dfb78d63703b3b5"
            ;;
        *)
            echo "Unsupported platform: ${os}/${arch}" >&2
            exit 1
            ;;
    esac

    if command -v zola >/dev/null 2>&1 && zola --version 2>/dev/null | grep -q "zola ${ZOLA_VERSION}"; then
        ZOLA="zola"
    else
        download_zola "${target}" "${sha}"
    fi

    git submodule update --init --recursive

    if ! command -v node >/dev/null 2>&1; then
        echo "Node.js is required to generate Markdown/LLM representations." >&2
        exit 1
    fi
    node scripts/gen-llms.mjs
    ZOLA_BIN="${ZOLA}" node scripts/gen-syntax-css.mjs

    rm -f static/giallo-light.css static/giallo-dark.css
    "${ZOLA}" build
    node scripts/gen-machine.mjs
}

main "$@"
