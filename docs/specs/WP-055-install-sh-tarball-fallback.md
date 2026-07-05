---
id: WP-055
title: install.sh npm-less tarball fallback (consented curl+verify+tar → node init)
status: Ready
model: opus
size: M
depends_on: [WP-054]
adrs: [ADR-0016, ADR-0011, ADR-0013, ADR-0004]
branch: wp/055-install-sh-tarball-fallback
---

# WP-055: install.sh npm-less tarball fallback

## Context (read this, nothing else)

`install.sh` is Wienerdog's default one-line bootstrapper
(`curl -fsSL <url>/install.sh | bash`). Today it detects Node ≥ 18 (a **hard
gate**, offering a consented Node install per ADR-0011), offers a consented git
install (non-blocking), then **execs `npx --yes wienerdog@latest init`** to do the
real install. **IRON RULE (ADR-0004): Wienerdog is just files** — the script
installs nothing that outlives its job; it runs synchronous installers and exits.

Live testing found users with **Node ≥ 18 but no `npx`/`npm`**. For them the final
`exec npx …` fails. The owner has decided (ADR-0016): when Node is present but
`npx` is not, `install.sh` installs Wienerdog **directly from the npm registry
tarball** — because Wienerdog has zero runtime deps, the published tarball IS the
whole app, and ADR-0013's vendored layout (`~/.wienerdog/app/<version>/` behind
`app/current`) is exactly "unpack a tarball here." **npx-present machines are
unchanged (npm stays the happy path).**

The npm-less path, under the ADR-0011 posture (per-hop consent + fail-to-print):

1. Node ≥ 18 is already guaranteed (we passed `ensure_node`). If `npx` resolves →
   the existing `exec npx …` handoff, untouched.
2. Else: GET `https://registry.npmjs.org/wienerdog/latest` (JSON) → parse
   `version` + `dist.integrity` (an SRI `sha512-<base64>`). Validate: version is
   semver-shaped, integrity begins `sha512-`. **Construct** the tarball URL locally
   as `https://registry.npmjs.org/wienerdog/-/wienerdog-<version>.tgz` (never trust
   the JSON's `tarball` string).
3. Show **exactly** what will be downloaded and where it will land; prompt on
   `/dev/tty` ([Y/n], default yes). No tty / declined → print the `npx` fallback +
   "install npm" note and exit non-zero (never download without consent).
4. On yes: `curl` the tarball to a temp file; compute its **sha512** with the
   guaranteed-present **`node`** and compare to the integrity — **mismatch aborts,
   nothing is unpacked**; extract with `tar --strip-components=1` into a staging
   dir; `mv` it onto `~/.wienerdog/app/<version>/`; then
   `exec node ~/.wienerdog/app/<version>/bin/wienerdog.js init "$@"`.

**Why extract straight into the final version dir (no double copy):** the
extracted tree at `app/<version>/` IS the vendored version dir. When the execed
`init` → `sync` runs `vendorSelf`, it computes `target = app/<version>` (from the
running package.json), sees it already exists, and therefore does **not** re-copy —
it only repoints `current` and refreshes. (ADR-0016; `vendorSelf` guards prod copy
with `if (!fs.existsSync(target))`.) So install.sh extracting into the real version
dir is correct and idempotent.

## Current state

### `install.sh` — the pieces you reuse and the tail you change

Reusable helpers already in the script (do not rewrite them):
- `tty_reachable` — returns 0 iff the controlling terminal (`${WIENERDOG_TTY:-/dev/tty}`)
  can be opened. Test seam `WIENERDOG_TTY`.
- `print_fallback DISPLAY_CMD` — prints `To do this yourself, run:\n    <cmd>` to stderr.
- `detect_os` sets global `os`.

The `main` tail you will change (verbatim):

```sh
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
```

Note `main` sets `set -euo pipefail`, so **pipelines and command substitutions in
your new functions run under `errexit` + `pipefail`** — guard non-fatal
`grep`/`curl` (see traps below).

### `tests/unit/install-sh.test.js` — harness conventions to reuse

- `mkStub(prefix)` → `{root, stubBin}`; `writeShim(dir,name,body)` /
  `writeShimAbs(dir,name,body)` (absolute-shebang variant that runs with no bash on
  PATH); `writeFakeTty(dir, answer)` → a regular file whose first line is the
  injected tty answer; `hermeticBinDir([names])` → a temp dir with ONLY the named
  system binaries symlinked in (usr-merge-safe; never `/bin` or `/usr/bin`).
- `BASH` = absolute path to bash. Full-script runs use `spawnSync(BASH,
  [scriptPath], {env:{PATH:…, WIENERDOG_TTY:…}})`.
- Existing passing test **"recent Node hands off to npx"** proves the npx-present
  path (`--yes wienerdog@latest init`); keep it green (do not regress it).

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file (status flip),
     docs/specs/ROADMAP.md, package-lock.json. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | install.sh | add tarball fallback fns; branch the `main` tail on `npx` presence |
| modify | tests/unit/install-sh.test.js | add tarball-fallback tests (consent yes/no/no-tty, checksum mismatch, npx-present unchanged) |

### Exact contracts

**`install.sh`** — add these functions (place them after the dependency gates,
before `main`). Every line must pass `shellcheck` and `shfmt -i 2`.

```sh
# --- npm-less tarball fallback (ADR-0016) -----------------------------------

# Prints the copy-paste fallback for when the tarball path can't/​won't run:
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
```

**`main` tail** — replace the single `exec npx …` line with the branch:

```sh
  local node_version
  node_version="$(node -v)"
  echo "Found Node $node_version — handing over to the Wienerdog installer…" >&2
  if command -v npx >/dev/null 2>&1; then
    exec npx --yes wienerdog@latest init "$@"
  fi
  echo "npm/npx isn't available — installing Wienerdog directly from the npm registry…" >&2
  install_via_tarball "$@"
```

### Example (evidence-shaped)

Node present, npx absent, user accepts:

```
npm/npx isn't available — installing Wienerdog directly from the npm registry…
Wienerdog will download and unpack the app (no npm needed):
    from: https://registry.npmjs.org/wienerdog/-/wienerdog-0.4.0.tgz
    to:   /home/u/.wienerdog/app/0.4.0
Download and install Wienerdog now? [Y/n] y
…(node .../app/0.4.0/bin/wienerdog.js init runs)…
```

Declined / no tty:

```
Download and install Wienerdog now? [Y/n] n
To install Wienerdog yourself, add npm and run:
    npx wienerdog@latest init
npm ships with Node.js — reinstall Node from https://nodejs.org to get it.
```

## Implementation notes & constraints

- **shellcheck + shfmt -i 2 are gating** (`npm run lint`). Quote all expansions;
  no unquoted word-splitting. The node one-liner is a single-quoted string — keep
  it on one line so `shfmt` doesn't reflow it.
- **`set -euo pipefail` trap (binding):** `main` sets these and your functions run
  under them. A non-matching `grep` in a pipeline returns 1 and, with `pipefail`,
  fails the whole pipeline — which `errexit` would turn into a script abort. The
  `ver=…/integrity=…` parse assignments therefore end with `|| true`; the trailing
  `sed` keeps the pipeline exit at 0 anyway, but the `|| true` is the explicit
  guard. `curl …` for the manifest ends with `|| meta=""`. Do NOT remove these.
- **`display == fetched` (ADR-0011 spirit):** the URL shown in the consent block
  (`from: $url`) is the same `$url` variable `do_tarball_install` curls. Keep them
  the same variable.
- **Checksum via `node`, not openssl:** Node ≥ 18 is guaranteed at this point;
  using it for sha512 avoids an openssl portability dependency and matches WP-053's
  verifier exactly. Never unpack unverified bytes (extract only after the compare).
- **Idempotency:** re-running the whole installer when `app/<version>/bin/wienerdog.js`
  already exists skips download and re-execs `init` (which is itself idempotent).
- **Scope:** touch ONLY the tarball path and the `main` branch. Do NOT change
  `ensure_node`, `ensure_git`, `detect_*`, `consent_run`, or any existing
  Node/git install behavior. Windows/`install.ps1` is explicitly out of scope.
- **Hermeticity (binding — no live registry, no real npx, no real handoff):** drive
  the FULL script with an **exclusive** stub PATH (`stubBin:hermeticBinDir([...])`)
  so no real `npx`/`node` leaks. Provide stubs:
  - **`npx` absent** — do NOT put an `npx` shim on PATH (so `command -v npx` fails
    and the tarball branch is taken). (The npx-present case reuses the existing
    handoff test — keep it.)
  - **`curl`** — arg-inspecting stub: when the URL argument ends with `/latest`,
    print a manifest JSON string the test built (`{"version":"<v>","dist":
    {"integrity":"<sri>"}}`); when a `-o <file>` is present, write the fixture
    tarball bytes to `<file>` and exit 0.
  - **`node`** — three behaviors in one shim: `-v` → echo `v20.0.0`; `-e` → `exec`
    the REAL node (resolve its absolute path in the test via `command -v node`) so
    the sha512 is genuinely computed over the downloaded fixture bytes; any other
    first arg (the `<dest>/bin/wienerdog.js init …` handoff) → append `"$@"` to an
    argv file and exit 0 (never actually run init).
  - **`tar`** — REAL `tar` (via `hermeticBinDir(['tar', …])`), so extraction really
    happens against the fixture; assert `<core>/app/<v>/bin/wienerdog.js` exists
    afterward.
  - **coreutils** the path uses — `mktemp grep sed head rm mkdir mv dirname
    printf`(builtin) `bash` `uname`(stub) — provide via stub or `hermeticBinDir`.
  - Set `WIENERDOG_HOME` to a temp core (so `dest` is under temp, not real `$HOME`)
    and `WIENERDOG_TTY` to a `writeFakeTty(root, 'y')` (or `'n'`, or a nonexistent
    path for the no-tty case).
  - **Fixture tarball + integrity:** build offline with `tar` — make
    `pkg/package/bin/wienerdog.js` etc., `tar -czf fixture.tgz -C pkg package`;
    compute `sri = 'sha512-' + crypto.createHash('sha512').update(
    fs.readFileSync(fixture)).digest('base64')`; embed `sri` in the manifest JSON
    the curl stub serves for `/latest`. (No `npm pack`, no network.)
- When uncertain: simpler option; record it in the PR under "Decisions made".

## Acceptance criteria

- [ ] **npx present** (a stub `npx` on PATH): `main` execs `npx --yes
      wienerdog@latest init` — unchanged (existing test stays green).
- [ ] **npx absent, consent yes:** the script fetches `/latest`, verifies the real
      sha512 against the manifest integrity, extracts the tarball, `<core>/app/<v>/
      bin/wienerdog.js` exists, and `node <core>/app/<v>/bin/wienerdog.js init` is
      invoked (asserted via the node argv file); exit 0.
- [ ] **npx absent, consent no:** no download; prints `npx wienerdog@latest init`
      fallback + the npm note; exit non-zero; `<core>/app/<v>` NOT created.
- [ ] **npx absent, no tty:** no prompt, no download, fallback note, exit non-zero.
- [ ] **checksum mismatch** (curl serves bytes whose sha512 ≠ manifest integrity):
      "Checksum mismatch" printed; nothing unpacked (`<core>/app/<v>` absent); exit
      non-zero.
- [ ] **bad/absent manifest** (curl returns non-JSON / no integrity): "Couldn't
      read … release info" + fallback; exit non-zero; no download attempted.
- [ ] **malicious manifest version — path traversal** (owner amendment,
      2026-07-05, from the WP-055 review): a manifest whose `version` is
      `1.2.3/../../<writable path>` (or any value containing `/` or `..`, or not
      strict semver) is REJECTED at the validation gate — no `curl`, no `mkdir`,
      no `mv`, nothing written outside `<core>`, exit non-zero with the fallback
      note. The version regex must be end-anchored strict semver
      (`^[0-9]+\.[0-9]+\.[0-9]+([-+][0-9A-Za-z.-]+)?$`); the start-anchored-only
      form previously prescribed accepted `1.2.3/…` and let the verified tarball
      `mv` escape `<core>`. Add a test planting a filesystem canary at the
      traversal target and asserting it never appears.
- [ ] `npm run lint` passes (shellcheck + shfmt clean); `npm test` passes; no test
      hits the real registry, a real `npx`, or runs a real `init`.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern 'install-sh'
npm test
npm run lint
```

## Out of scope (do NOT do these)

- The `wienerdog update` verb / notice switch — **WP-054**.
- The Node tarball module — **WP-053** (install.sh is pure bash; it does NOT import
  it).
- Any change to Node/git dependency installation, `consent_run`, or the detection
  engine.
- `install.ps1` / Windows bootstrap (ADR-0016: out of scope).
- The npm-less `googleapis` message (documentation follow-up, ADR-0016 §6).

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/055-install-sh-tarball-fallback`; conventional commits; PR titled
   `feat(install): npm-less registry-tarball fallback in install.sh (WP-055)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
