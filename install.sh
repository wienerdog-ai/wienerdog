#!/usr/bin/env bash
# Wienerdog bootstrapper — https://github.com/wienerdog-ai/wienerdog
# Checks for a recent Node.js on PATH and, if found, hands off to the
# versioned `npx wienerdog@latest init`, which does the real install work.
# This script installs nothing itself: no sudo, no package managers, no disk writes.
set -euo pipefail

if [ "$EUID" -eq 0 ]; then
  echo "Wienerdog should not be run as root. Please re-run as your normal user." >&2
  exit 1
fi

os="$(uname -s)"
case "$os" in
  Darwin | Linux) ;;
  *)
    echo "Wienerdog's curl installer supports macOS and Linux only." >&2
    echo "Prefer npm? \`npx wienerdog@latest init\` does the same thing." >&2
    echo "Windows: use the npx command above (PowerShell installer coming)." >&2
    exit 1
    ;;
esac

# Prints per-OS guidance for a missing or too-old Node, then exits 1.
node_guidance() {
  case "$os" in
    Darwin)
      echo "Install Node LTS from https://nodejs.org or \`brew install node\` if you use Homebrew." >&2
      ;;
    Linux)
      echo "Install it with your distro's package manager (e.g. \`apt install nodejs\`) or from https://nodejs.org." >&2
      ;;
  esac
  echo "Then run this command again." >&2
  exit 1
}

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js was not found on your PATH." >&2
  node_guidance
fi

node_version="$(node -v)"
node_major="${node_version#v}"
node_major="${node_major%%.*}"

if [ "$node_major" -lt 18 ]; then
  echo "Found Node $node_version, but Wienerdog needs Node 18 or newer." >&2
  node_guidance
fi

echo "Found Node $node_version — handing over to the Wienerdog installer…" >&2
exec npx --yes wienerdog@latest init "$@"
