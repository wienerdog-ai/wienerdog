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

# --- macOS install actions (each is an EXEC_FN for consent_run) ------------
# Every function below is invoked ONLY through consent_run (per-hop consent +
# print-fallback). The command each runs is byte-identical to the DISPLAY_CMD
# its caller passes to consent_run — ADR-0011 rule 1: displayed == executed.

# Triggers the Xcode Command Line Tools GUI install (which provides git) and
# polls for completion with a hard timeout. `xcode-select --install` returns
# immediately and installs asynchronously, so its exit status does NOT mean
# "done"; we poll `xcode-select -p` + `command -v git` until both succeed or the
# timeout elapses. Returns 0 iff git resolves in time, 1 otherwise. Bounded and
# synchronous — no background job, no `&`, no watcher (ADR-0004).
# WIENERDOG_CLT_TIMEOUT / WIENERDOG_CLT_POLL are test-only seams (seconds) — a
# real user never sets them; tests set the poll tiny so the loop finishes fast.
install_git_macos() {
  xcode-select --install >/dev/null 2>&1 || true # GUI trigger; async; ignore status
  local waited=0 max="${WIENERDOG_CLT_TIMEOUT:-600}" poll="${WIENERDOG_CLT_POLL:-10}"
  while [ "$waited" -lt "$max" ]; do
    if xcode-select -p >/dev/null 2>&1 && command -v git >/dev/null 2>&1; then
      return 0
    fi
    echo "Waiting for the Command Line Tools install to finish…" >&2
    sleep "$poll"
    waited=$((waited + poll))
  done
  return 1
}

# `brew install node` — used ONLY when brew is already on PATH. Wienerdog never
# bootstraps Homebrew (ADR-0011 rule 4). Returns brew's exit status.
install_node_brew() {
  brew install node
}

# Downloads the latest official signed nodejs.org .pkg and installs it with
# sudo (the .pkg installs into /usr/local and always needs root; there is no
# non-sudo variant). Returns 0 on success, non-0 on any download/install
# failure. The DISPLAY_CMD the caller shows names both https://nodejs.org and
# the `sudo installer -pkg … -target /` step, matching what this runs.
install_node_pkg() {
  local dir file url pkg
  dir="$(mktemp -d)"
  file="$(curl -fsSL https://nodejs.org/dist/latest/ | grep -o 'node-v[0-9][0-9.]*\.pkg' | head -1)"
  [ -n "$file" ] || return 1
  url="https://nodejs.org/dist/latest/$file"
  pkg="$dir/$file"
  curl -fSL "$url" -o "$pkg" || return 1
  sudo installer -pkg "$pkg" -target / || return 1
  rm -f "$pkg"
  rmdir "$dir" 2>/dev/null || true
  return 0
}

# --- Linux install actions (each EXEC_FN is invoked ONLY via consent_run) ---
# The command each function runs is byte-identical to the DISPLAY_CMD its caller
# builds via pm_install_display / nodesource_display — ADR-0011 rule 1
# (displayed == executed). $SUDO ("sudo" for non-root; we refuse EUID 0) and $PM
# are set by the caller (ensure_node/ensure_git) and are visible here through
# bash's dynamic scope.

# Echoes the Node package list for the detected PM (npm is bundled with the
# nodejs package on dnf/yum/zypper, separate on apt/pacman/apk). Kept in one
# place so the DISPLAY_CMD and the actual install use the identical list.
node_pkg_list() {
  case "$PM" in
  apt-get | pacman | apk) echo "nodejs npm" ;;
  *) echo "nodejs" ;;
  esac
}

# Echoes the exact command install_pkg_linux runs for the given packages, so it
# can be shown as the consent DISPLAY_CMD (displayed == executed). $SUDO expands
# to the same literal the executor uses.
pm_install_display() {
  case "$PM" in
  apt-get) echo "$SUDO apt-get update && $SUDO DEBIAN_FRONTEND=noninteractive apt-get install -y $*" ;;
  dnf) echo "$SUDO dnf install -y $*" ;;
  yum) echo "$SUDO yum install -y $*" ;;
  pacman) echo "$SUDO pacman -Sy --noconfirm $*" ;;
  zypper) echo "$SUDO zypper --non-interactive install $*" ;;
  apk) echo "$SUDO apk add --no-cache $*" ;;
  esac
}

# Installs one or more packages with the detected PM, prefixed with $SUDO.
# Returns the PM's exit status. Byte-identical to `pm_install_display "$@"`.
install_pkg_linux() {
  case "$PM" in
  apt-get)
    "$SUDO" apt-get update &&
      "$SUDO" DEBIAN_FRONTEND=noninteractive apt-get install -y "$@"
    ;;
  dnf) "$SUDO" dnf install -y "$@" ;;
  yum) "$SUDO" yum install -y "$@" ;;
  pacman) "$SUDO" pacman -Sy --noconfirm "$@" ;;
  zypper) "$SUDO" zypper --non-interactive install "$@" ;;
  apk) "$SUDO" apk add --no-cache "$@" ;;
  *) return 1 ;;
  esac
}

# Returns 0 iff `node` resolves and its major version is >= 18. Never assumes the
# distro repo satisfied the bar — call after resolve_bin so a just-installed
# binary is seen this run.
node_is_recent() {
  command -v node >/dev/null 2>&1 || return 1
  local v
  v="$(node -v 2>/dev/null)"
  v="${v#v}"
  v="${v%%.*}"
  [ -n "$v" ] && [ "$v" -ge 18 ] 2>/dev/null
}

# Echoes the exact command install_node_nodesource runs (apt/dnf-family only),
# with the PINNED major and full URL, for the consent DISPLAY_CMD.
nodesource_display() {
  case "$PM" in
  apt-get) echo "curl -fsSL https://deb.nodesource.com/setup_20.x | $SUDO -E bash -  &&  $SUDO apt-get install -y nodejs" ;;
  dnf | yum) echo "curl -fsSL https://rpm.nodesource.com/setup_20.x | $SUDO -E bash -  &&  $SUDO $PM install -y nodejs" ;;
  esac
}

# apt/dnf-family only. Runs NodeSource's setup script (PINNED major 20) then
# installs nodejs via the PM. This is a SECOND nested curl|bash — invoked ONLY
# through its own consent_run hop (frozen fallback trigger (e)); never
# auto-chained after the distro-repo attempt. Byte-identical to
# nodesource_display. Returns 0 on success.
install_node_nodesource() {
  case "$PM" in
  apt-get)
    curl -fsSL https://deb.nodesource.com/setup_20.x | "$SUDO" -E bash - || return 1
    "$SUDO" apt-get install -y nodejs
    ;;
  dnf | yum)
    curl -fsSL https://rpm.nodesource.com/setup_20.x | "$SUDO" -E bash - || return 1
    "$SUDO" "$PM" install -y nodejs
    ;;
  *) return 1 ;;
  esac
}

# --- Dependency gates ------------------------------------------------------

# HARD GATE. Returns 0 if a Node ≥ 18 is already on PATH. Otherwise, on macOS,
# offers a consented install (brew-if-present, else the official signed
# nodejs.org .pkg) and, on success, re-resolves node for the rest of this run;
# on decline / failure / no-tty it prints the exact command + nodejs.org pointer
# and exits 1. (Linux keeps WP-031's print-only fallback — WP-033 wires it.)
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

  if [ "$os" = "Darwin" ]; then
    if command -v brew >/dev/null 2>&1; then
      # brew already present → use it; never bootstrap Homebrew (ADR-0011 #4).
      if consent_run "Install Node 18+ with Homebrew now?" \
        "brew install node" install_node_brew; then
        if resolve_bin node /opt/homebrew/bin /usr/local/bin >/dev/null; then
          echo "Node installed. If a later step can't find it, run \`eval \"\$(/opt/homebrew/bin/brew shellenv)\"\` or open a new terminal." >&2
          return 0
        fi
        print_fallback "brew install node" # installed but unresolved: show the command
      fi
      # consent_run already printed the fallback on decline/failure/no-tty; add
      # the nodejs.org pointer so the Node fallback always names it.
      echo "Or install Node LTS from https://nodejs.org." >&2
      exit 1
    fi
    # No brew → official signed nodejs.org .pkg (needs sudo). This DISPLAY_CMD
    # names the source and the sudo step, matching what install_node_pkg runs.
    local pkg_cmd="sudo installer -pkg <official nodejs.org .pkg> -target /   (downloaded from https://nodejs.org)"
    if consent_run "Install Node 18+ from the official nodejs.org installer (needs your password)?" \
      "$pkg_cmd" install_node_pkg; then
      if resolve_bin node /opt/homebrew/bin /usr/local/bin >/dev/null; then
        echo "Node installed. If a later step can't find it, open a new terminal so /usr/local/bin is on your PATH." >&2
        return 0
      fi
      print_fallback "$pkg_cmd" # installed but unresolved: show the command
    fi
    exit 1
  fi

  # --- Linux -----------------------------------------------------------------
  detect_pm
  detect_sudo_mode
  # shellcheck disable=SC2034  # $SUDO is consumed by install_pkg_linux/nodesource via dynamic scope.
  local SUDO="sudo" # non-root (EUID 0 refused earlier); PM installs elevate per-action.

  # CAN_INSTALL = a supported package manager AND a way to elevate. Frozen case
  # (d): no PM, or sudo unavailable & not root → print-only fallback, no prompt.
  if [ -z "$PM" ] || [ "$SUDO_MODE" = "none" ]; then
    print_fallback "$(node_install_cmd)"
    echo "Or install Node LTS from https://nodejs.org." >&2
    exit 1
  fi

  # 1. Distro-repo Node via the PM (consented). DISPLAY == what install_pkg_linux runs.
  local pkgs display
  pkgs="$(node_pkg_list)"
  display="$(pm_install_display "$pkgs")"
  # shellcheck disable=SC2086  # intentional split: install one or two packages.
  if ! consent_run "Install Node with $PM now?" "$display" install_pkg_linux $pkgs; then
    # Declined / failed / no-tty: consent_run already printed the fallback.
    echo "Or install Node LTS from https://nodejs.org." >&2
    exit 1
  fi

  # 2. VERIFY the actually-installed major is >= 18 — never assume the repo is.
  resolve_bin node /usr/bin /usr/local/bin >/dev/null || true
  if node_is_recent; then
    return 0
  fi

  # 3. Repo Node is too old / still missing. Offer NodeSource (apt/dnf-family
  #    only) as a SEPARATE consent hop — never auto-chained after step 1.
  case "$PM" in
  apt-get | dnf | yum)
    local ns_domain ns_display
    if [ "$PM" = "apt-get" ]; then ns_domain="deb.nodesource.com"; else ns_domain="rpm.nodesource.com"; fi
    ns_display="$(nodesource_display)"
    if consent_run \
      "Node from your distro is older than 18. Install Node 20 from NodeSource (runs a script from ${ns_domain})? [this is a second download]" \
      "$ns_display" install_node_nodesource; then
      resolve_bin node /usr/bin /usr/local/bin >/dev/null || true
      if node_is_recent; then
        return 0
      fi
      print_fallback "$ns_display" # installed but still not >= 18
    fi
    echo "Or install Node LTS from https://nodejs.org." >&2
    exit 1
    ;;
  *)
    # pacman/zypper/apk: no NodeSource family → print fallback (no nvm in v1).
    print_fallback "$(node_install_cmd)"
    echo "Or install Node LTS from https://nodejs.org." >&2
    exit 1
    ;;
  esac
}

# NON-BLOCKING. If git is missing, on macOS offers a consented CLT install
# (which provides git) and re-resolves git on success; on decline / CLT timeout
# / no-tty it prints a one-line note (what git is for + the exact command) and
# returns 0 so the handoff still proceeds. A missing git NEVER causes exit 1 —
# Node is the only hard gate. (Linux keeps WP-031's print-only note; WP-033
# wires consent there.)
ensure_git() {
  if command -v git >/dev/null 2>&1; then
    return 0
  fi

  if [ "$os" = "Darwin" ]; then
    if consent_run "Install the Xcode Command Line Tools (provides git) now?" \
      "$(git_install_cmd)" install_git_macos; then
      resolve_bin git /usr/bin /usr/local/bin /opt/homebrew/bin >/dev/null || true
      return 0
    fi
    printf '%s\n' \
      "git isn't installed — Wienerdog needs it once you create or adopt a vault. Install it with \`$(git_install_cmd)\` before running /wienerdog-setup." >&2
    return 0
  fi

  # --- Linux -----------------------------------------------------------------
  detect_pm
  detect_sudo_mode
  # shellcheck disable=SC2034  # $SUDO is consumed by install_pkg_linux via dynamic scope.
  local SUDO="sudo"
  # NON-BLOCKING. If we can install (PM present AND can elevate), offer it; on
  # success re-resolve git and proceed. Frozen case (d) or any decline/failure
  # /no-tty → print the note and PROCEED (exit 0); git alone never exits 1.
  if [ -n "$PM" ] && [ "$SUDO_MODE" != "none" ]; then
    if consent_run "Install git with $PM now?" "$(pm_install_display git)" install_pkg_linux git; then
      resolve_bin git /usr/bin /usr/local/bin >/dev/null || true
      return 0
    fi
  fi
  printf '%s\n' \
    "git isn't installed — Wienerdog needs it once you create or adopt a vault. Install it with \`$(git_install_cmd)\` before running /wienerdog-setup." >&2
}

# --- npm-less tarball fallback (ADR-0016) -----------------------------------

# Prints the copy-paste fallback for when the tarball path can't/won't run:
# the npx command plus how to get npm. To stderr.
tarball_fallback_note() {
  printf '%s\n    %s\n%s\n' \
    "To install Wienerdog yourself, add npm and run:" \
    "npx wienerdog@latest init" \
    "npm ships with Node.js — reinstall Node from https://nodejs.org to get it." >&2
}

# Download the verified tarball for $1=url with sha512 SRI $2=integrity and
# unpack it into $3=dest (the app/<version> dir). Verifies the checksum with the
# already-present `node` BEFORE unpacking; a mismatch aborts and unpacks nothing.
# Atomic-ish: extract into a staging dir, then mv onto dest. Returns 0 on success.
do_tarball_install() {
  local url="$1" integrity="$2" dest="$3"
  local tmp staging calc
  tmp="$(mktemp -d)" || return 1
  if ! curl -fSL "$url" -o "$tmp/wd.tgz"; then
    rm -rf "$tmp"
    return 1
  fi
  # sha512 base64 via node (Node >= 18 is guaranteed by ensure_node). Same digest
  # the Node verifier (WP-053) computes — no openssl dependency.
  calc="$(node -e 'const c=require("crypto"),f=require("fs");process.stdout.write("sha512-"+c.createHash("sha512").update(f.readFileSync(process.argv[1])).digest("base64"))' "$tmp/wd.tgz" 2>/dev/null)" || calc=""
  if [ -z "$calc" ] || [ "$calc" != "$integrity" ]; then
    echo "Checksum mismatch — refusing to install the download." >&2
    rm -rf "$tmp"
    return 1
  fi
  staging="${dest}.staging.$$"
  rm -rf "$staging"
  mkdir -p "$staging" || {
    rm -rf "$tmp"
    return 1
  }
  # npm tarballs wrap everything under package/ — strip it so bin/ src/ … land at dest.
  if ! tar -xzf "$tmp/wd.tgz" --strip-components=1 -C "$staging"; then
    rm -rf "$tmp" "$staging"
    return 1
  fi
  mkdir -p "$(dirname "$dest")"
  rm -rf "$dest"
  if ! mv "$staging" "$dest"; then
    rm -rf "$tmp" "$staging"
    return 1
  fi
  rm -rf "$tmp"
  return 0
}

# The npm-less install path: fetch the registry manifest, validate it, get
# per-hop consent (showing exactly what/where), download+verify+unpack, then
# exec `node <dest>/bin/wienerdog.js init`. Exits non-zero (after the fallback
# note) on any failure/decline/no-tty. "$@" are forwarded to init.
install_via_tarball() {
  local core dest ver integrity meta url tty reply
  core="${WIENERDOG_HOME:-$HOME/.wienerdog}"

  meta="$(curl -fsSL "https://registry.npmjs.org/wienerdog/latest" 2>/dev/null)" || meta=""
  # `|| true`: a non-matching grep under `set -o pipefail` would otherwise abort.
  ver="$(printf '%s' "$meta" | grep -oE '"version"[[:space:]]*:[[:space:]]*"[^"]+"' | head -1 | sed -E 's/.*"([^"]+)"$/\1/')" || true
  integrity="$(printf '%s' "$meta" | grep -oE '"integrity"[[:space:]]*:[[:space:]]*"sha512-[^"]+"' | head -1 | sed -E 's/.*"(sha512-[^"]+)"$/\1/')" || true

  if ! printf '%s' "$ver" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+([-+][0-9A-Za-z.-]+)?$' || [ -z "$integrity" ]; then
    echo "Couldn't read Wienerdog's release info from the npm registry." >&2
    tarball_fallback_note
    exit 1
  fi
  url="https://registry.npmjs.org/wienerdog/-/wienerdog-${ver}.tgz"
  dest="$core/app/$ver"

  # Idempotent: this version is already unpacked → straight to init.
  if [ -f "$dest/bin/wienerdog.js" ]; then
    exec node "$dest/bin/wienerdog.js" init "$@"
  fi

  # Consent — show exactly what will be downloaded and where it lands.
  printf '%s\n    from: %s\n    to:   %s\n' \
    "Wienerdog will download and unpack the app (no npm needed):" "$url" "$dest" >&2
  tty="${WIENERDOG_TTY:-/dev/tty}"
  if ! tty_reachable; then
    echo "No terminal available to confirm — not downloading." >&2
    tarball_fallback_note
    exit 1
  fi
  printf 'Download and install Wienerdog now? [Y/n] ' >&2
  reply=""
  read -r reply <"$tty" || reply=""
  case "$reply" in
  [nN]*)
    tarball_fallback_note
    exit 1
    ;;
  esac

  if do_tarball_install "$url" "$integrity" "$dest"; then
    exec node "$dest/bin/wienerdog.js" init "$@"
  fi
  tarball_fallback_note
  exit 1
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
  if command -v npx >/dev/null 2>&1; then
    exec npx --yes wienerdog@latest init "$@"
  fi
  echo "npm/npx isn't available — installing Wienerdog directly from the npm registry…" >&2
  install_via_tarball "$@"
}

# --- test seam: allow `source install.sh` to load functions without running
#     main. A real user never sets WIENERDOG_INSTALL_LIB; curl|bash leaves it
#     unset → main runs.
if [ "${WIENERDOG_INSTALL_LIB:-}" != "1" ]; then
  main "$@"
fi
