#!/usr/bin/env bash
# Wienerdog bootstrapper — https://github.com/wienerdog-ai/wienerdog
# Checks for a recent Node.js on PATH and, if found, hands off to the
# versioned `npx wienerdog@latest init`, which does the real install work.
# It installs missing dependencies (Node, git) only with explicit per-hop
# consent and always with a print-the-command fallback (ADR-0011).

# --- Detection -------------------------------------------------------------

# Sets global `os` to the uname value; exits 1 (with the npx note) on
# unsupported OS.
detect_os() {
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
}

# Linux only: sets global `PM` to the first available manager, or "" if none.
# Cascade order matters (matches the researched trust order).
detect_pm() {
  if command -v apt-get >/dev/null 2>&1; then
    PM=apt-get
  elif command -v dnf >/dev/null 2>&1; then
    PM=dnf
  elif command -v yum >/dev/null 2>&1; then
    PM=yum
  elif command -v pacman >/dev/null 2>&1; then
    PM=pacman
  elif command -v zypper >/dev/null 2>&1; then
    PM=zypper
  elif command -v apk >/dev/null 2>&1; then
    PM=apk
  else
    PM=""
  fi
}

# Sets global SUDO_MODE to one of: none | passwordless | needs-password.
#   none            -> `sudo` is not on PATH
#   passwordless    -> `sudo -n true` succeeds (no password needed)
#   needs-password  -> sudo present but a password would be required
# Uses `sudo -n true` (non-interactive probe: never prompts, returns at once).
# Never pipes a password to sudo's stdin (we never capture one). Safe on macOS.
detect_sudo_mode() {
  # SUDO_MODE is consumed by the unit tests (sourcing seam) and by WP-032/033's
  # install actions, not yet within this script — hence the disable.
  # shellcheck disable=SC2034
  if ! command -v sudo >/dev/null 2>&1; then
    SUDO_MODE=none
  elif sudo -n true 2>/dev/null; then
    SUDO_MODE=passwordless
  else
    SUDO_MODE=needs-password
  fi
}

# True (returns 0) iff the controlling terminal can be opened for reading.
# Do NOT use `[ -t 0 ]` — under curl|bash stdin is the piped script, so `[ -t 0 ]`
# is always false even when a real terminal is attached. The operative signal is
# whether opening the terminal device succeeds.
# WIENERDOG_TTY is a test-only seam — a real user never sets it (defaults to
# /dev/tty).
tty_reachable() {
  local tty="${WIENERDOG_TTY:-/dev/tty}"
  [ -e "$tty" ] || return 1
  { exec 3<"$tty"; } 2>/dev/null || return 1
  exec 3<&-
  return 0
}

# --- Per-OS install command strings ---------------------------------------
# These echo the exact command as a STRING (never run it). WP-032/033 reuse
# them as the DISPLAY_CMD passed to consent_run and in the git note; sudo/apt/
# brew appearing inside these strings is fine — they are printed, not invoked.

# Echoes the exact per-OS command to install Node ≥ 18.
node_install_cmd() {
  case "$os" in
  Darwin)
    if command -v brew >/dev/null 2>&1; then
      echo "brew install node"
    else
      echo "download the Node LTS .pkg from https://nodejs.org and run it"
    fi
    ;;
  Linux)
    case "${PM:-}" in
    apt-get) echo "sudo apt-get install -y nodejs npm" ;;
    dnf) echo "sudo dnf install -y nodejs" ;;
    yum) echo "sudo yum install -y nodejs" ;;
    pacman) echo "sudo pacman -Sy --noconfirm nodejs npm" ;;
    zypper) echo "sudo zypper --non-interactive install nodejs" ;;
    apk) echo "sudo apk add --no-cache nodejs npm" ;;
    *) echo "your distro's package manager (e.g. sudo apt-get install -y nodejs npm)" ;;
    esac
    ;;
  esac
}

# Echoes the exact per-OS command to install git.
git_install_cmd() {
  case "$os" in
  Darwin) echo "xcode-select --install" ;;
  Linux)
    case "${PM:-}" in
    apt-get) echo "sudo apt-get install -y git" ;;
    dnf) echo "sudo dnf install -y git" ;;
    yum) echo "sudo yum install -y git" ;;
    pacman) echo "sudo pacman -Sy --noconfirm git" ;;
    zypper) echo "sudo zypper --non-interactive install git" ;;
    apk) echo "sudo apk add --no-cache git" ;;
    *) echo "your distro's package manager (e.g. sudo apt-get install -y git)" ;;
    esac
    ;;
  esac
}

# --- Consent + print-fallback harness (the core deliverable) ---------------

# print_fallback DISPLAY_CMD
#   Prints, to stderr, the exact command the user should run themselves.
#   Generic — knows nothing about node/git. Callers add any extra pointer lines.
print_fallback() {
  printf '%s\n    %s\n' "To do this yourself, run:" "$1" >&2
}

# consent_run PROMPT DISPLAY_CMD EXEC_FN [EXEC_ARGS...]
#   Shows DISPLAY_CMD, prompts once on the tty ([Y/n], default yes; empty = yes),
#   runs EXEC_FN on yes, and prints DISPLAY_CMD as the copy-paste fallback in
#   every non-success case (single source of truth: displayed == executed ==
#   fallback). Returns 0 IFF the dependency was actually installed; returns 1
#   in every fallback case, having ALREADY printed DISPLAY_CMD.
consent_run() {
  local prompt="$1" display="$2" exec_fn="$3"
  shift 3
  local tty="${WIENERDOG_TTY:-/dev/tty}"
  if ! tty_reachable; then
    print_fallback "$display"
    return 1
  fi
  printf '%s\n    %s\n%s [Y/n] ' \
    "About to run:" "$display" "$prompt" >&2
  local reply=""
  read -r reply <"$tty" || reply=""
  case "$reply" in
  [nN]*)
    print_fallback "$display"
    return 1
    ;;
  esac
  if "$exec_fn" "$@"; then
    return 0
  fi
  print_fallback "$display"
  return 1
}

# --- PATH-after-install resolution -----------------------------------------

# resolve_bin NAME DIR...
#   After an install, make a freshly-installed binary usable for the rest of
#   THIS script run: `hash -r`, prepend any DIR containing an executable NAME to
#   PATH, then print `command -v NAME` on success, return 1 if still not found.
#   Never mutates the parent shell and never re-execs.
resolve_bin() {
  hash -r 2>/dev/null || true
  local name="$1"
  shift
  local d
  for d in "$@"; do
    if [ -x "$d/$name" ]; then
      PATH="$d:$PATH"
      export PATH
    fi
  done
  command -v "$name"
}

# --- Dependency gates ------------------------------------------------------

# HARD GATE. Returns 0 if a Node ≥ 18 is already on PATH. Otherwise, since this
# WP installs nothing, prints the exact per-OS command + the nodejs.org pointer
# and exits 1. (WP-032/033 replace the print with consent_run + real actions.)
ensure_node() {
  local node_version node_major
  if command -v node >/dev/null 2>&1; then
    node_version="$(node -v)"
    node_major="${node_version#v}"
    node_major="${node_major%%.*}"
    if [ "$node_major" -ge 18 ]; then
      return 0
    fi
    echo "Found Node $node_version, but Wienerdog needs Node 18 or newer." >&2
  else
    echo "Node.js was not found on your PATH." >&2
  fi
  # Detect the install environment only now that Node actually needs providing
  # (keeps the happy path side-effect-free). detect_pm is required to build the
  # exact per-OS command string below.
  if [ "$os" = "Linux" ]; then
    detect_pm
  fi
  print_fallback "$(node_install_cmd)"
  echo "Or install Node LTS from https://nodejs.org." >&2
  exit 1
}

# NON-BLOCKING. If git is missing, prints a one-line note (what git is for + the
# exact install command) and returns 0 so the handoff still proceeds. A missing
# git never causes exit 1. (WP-032/033 replace the note with consent_run + real
# actions, still warn-and-proceed on decline/failure/no-tty.)
ensure_git() {
  if command -v git >/dev/null 2>&1; then
    return 0
  fi
  if [ "$os" = "Linux" ]; then
    detect_pm
  fi
  printf '%s\n' \
    "git isn't installed — Wienerdog needs it once you create or adopt a vault. Install it with \`$(git_install_cmd)\` before running /wienerdog-setup." >&2
}

# --- Main dispatcher -------------------------------------------------------

main() {
  set -euo pipefail

  if [ "$EUID" -eq 0 ]; then
    echo "Wienerdog should not be run as root. Please re-run as your normal user." >&2
    exit 1
  fi

  detect_os
  ensure_node # hard gate: exits 1 if Node is missing/too-old
  ensure_git  # non-blocking: prints a note if git is missing, then proceeds

  local node_version
  node_version="$(node -v)"
  echo "Found Node $node_version — handing over to the Wienerdog installer…" >&2
  exec npx --yes wienerdog@latest init "$@"
}

# --- test seam: allow `source install.sh` to load functions without running
#     main. A real user never sets WIENERDOG_INSTALL_LIB; curl|bash leaves it
#     unset → main runs.
if [ "${WIENERDOG_INSTALL_LIB:-}" != "1" ]; then
  main "$@"
fi
