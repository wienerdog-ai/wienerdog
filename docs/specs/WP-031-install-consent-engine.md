---
id: WP-031
title: install.sh dependency-consent engine (detection, tty gate, sudo probe, consent harness)
status: In-Review
model: opus
size: M
depends_on: [WP-016]
adrs: [ADR-0004, ADR-0006, ADR-0011]
branch: wp/031-install-consent-engine
---

# WP-031: install.sh dependency-consent engine (detection, tty gate, sudo probe, consent harness)

## Context (read this, nothing else)

Wienerdog's default install command is `curl -fsSL <url>/install.sh | bash` (ADR-0006). Today `install.sh` is a pure bootstrapper: it checks for Node ≥ 18 and either hands off to `npx wienerdog@latest init` or **prints guidance and exits** — it installs nothing. A large share of our audience installed Claude Code via its native binary and has no Node or git at all, so "print guidance and exit" is a dead end.

**ADR-0011 changes the posture** from "never installs software silently" to **"never installs WITHOUT consent."** The installer will (in later WPs) actually install missing dependencies across platforms, behind a per-hop `/dev/tty` `[Y/n]` prompt (default yes) that shows the exact command first, and always with a mandatory print-the-command fallback when auto-install is not safe or possible.

**This work package builds the ENGINE** — the platform-agnostic machinery every install action will use, and nothing platform-specific yet:

- OS detection (already present) plus **package-manager detection** (Linux) and a **sudo-mode probe**.
- A **`/dev/tty` reachability gate** — the correct way to know whether *any* interactive consent is possible (CI/cron/`ssh 'bash -s'` have no controlling terminal and must get print-only).
- A **per-hop consent + print-fallback harness** (`consent_run`) that shows a command, prompts on the tty, runs an injected install action on yes, and prints the exact command as a copy-paste fallback in every non-success case.
- **`resolve_bin`** — after any install, re-resolve the dependency's absolute path for the rest of this script's own run.
- A **sourcing seam**: refactor the script into functions + a `main` dispatcher guarded so unit tests can `source` it and drive individual functions with injected fakes (fake tty, fake sudo/PM via PATH shims) **without installing anything or needing sudo in CI**.

Product invariants that govern every line here:

- **Wienerdog is just files; it starts nothing that outlives its job (ADR-0004).** This script runs synchronously and exits. No daemon, no telemetry, no background process.
- **Never install without consent (ADR-0011).** The engine's whole job is to make consent + fallback structural.
- **The script still refuses to run as root (`EUID 0`).** Installs (later WPs) go through per-action `sudo`, never a root-run script.

**Node is the only hard gate; git is recommended but non-blocking (ADR-0011).** The CLI itself is Node, so a missing/too-old Node that cannot be provided means the script prints the fallback and exits non-zero — Wienerdog cannot run at all. **git is different**: `wienerdog init` (what this script `exec`s into) creates only the core `~/.wienerdog` and does **not** need git; git is required later, at vault-creation/adopt/dream time, where those paths already fail with a clear "install git" error (WP-004/WP-026). So a missing git is *offered* on the same consent flow but **never blocks the handoff**: if git is absent and not installed, the script prints a one-line note (what git is for + the exact command) and **proceeds to hand off (exit 0)**.

**Scope boundary for THIS WP:** you add and *unit-test* the engine functions, but you do **not** yet wire real auto-install into the missing-dependency path. In this WP: a missing/too-old **Node** prints the *exact* per-OS command (+ nodejs.org) and exits 1 — no prompt, no install (same hard-gate behavior as today). A missing **git** prints the one-line git note and **proceeds to the Node handoff (exit 0)** — no prompt, no install. `consent_run`, `resolve_bin`, `detect_pm`, and `detect_sudo_mode` are exercised only by the new unit tests via the sourcing seam. The macOS install actions (WP-032) and Linux install actions (WP-033) wire the engine into the `ensure_*` handlers. Shipping the engine ahead of the platform actions is deliberate — it is the seam the next two WPs build on.

## Current state

`install.sh` exists (WP-016) and is a top-to-bottom script (`set -euo pipefail`, runs immediately). Its current shape:

- Refuses `EUID 0`; detects `os="$(uname -s)"`, exits 1 on non-Darwin/Linux with an npx note.
- `node_guidance()` prints a per-OS "install Node from nodejs.org / your package manager" message and `exit 1`.
- If `node` is missing or major `< 18` → `node_guidance`; else prints "Found Node … — handing over…" (to stderr) and `exec npx --yes wienerdog@latest init "$@"`.

`tests/unit/install-sh.test.js` (node:test, spawns bash with a stub PATH) has four tests:

1. missing/old Node (`v16` shim) → exit 1, stderr matches `/nodejs\.org/`.
2. recent Node (`v20` shim) + `npx` shim recording argv → exit 0, recorded argv equals `--yes wienerdog@latest init`.
3. script text contains a root check (`grep EUID` + `root`).
4. **forbidden-word test**: asserts `sudo|apt|apt-get|brew` appear only in comment or `echo`/`printf` lines. **This test's invariant is voided by ADR-0011** (the engine legitimately probes `sudo -n true` and detects `apt-get` via `command -v`) — you replace it (see Deliverables).

The lint pipeline (WP-001, `npm run lint`) runs `shellcheck` on `*.sh` when the binary is present; the script must pass `shellcheck` and `bash -n`.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file (status flip), docs/specs/ROADMAP.md. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | install.sh | refactor into functions + `main` + sourcing guard; add the engine functions; keep the missing-dep path as print-only (no install yet) |
| modify | tests/unit/install-sh.test.js | keep tests 1–3; replace test 4; add engine unit tests via the sourcing seam |

You touch **no other files.** WP-032/WP-033 wire the engine into platform install actions and update the README.

### Exact contracts

Refactor `install.sh` so its body is functions plus a `main "$@"` call, guarded so `source`-ing the file defines the functions **without running `main`**:

```bash
# --- test seam: allow `source install.sh` to load functions without running main.
#     A real user never sets WIENERDOG_INSTALL_LIB; curl|bash leaves it unset → main runs.
if [ "${WIENERDOG_INSTALL_LIB:-}" != "1" ]; then
  main "$@"
fi
```

Keep the existing header comment (update the third line: it no longer "installs nothing" — say it installs missing dependencies only with per-hop consent, ADR-0011). Keep `set -euo pipefail` and the root refusal at the top of `main`.

#### Detection

```bash
# Sets global `os` to the uname value; exits 1 (with the npx note) on unsupported OS.
detect_os()

# Linux only: sets global `PM` to the first available manager, or "" if none.
# Cascade (order matters): apt-get, dnf, yum, pacman, zypper, apk.
detect_pm()

# Sets global SUDO_MODE to one of: none | passwordless | needs-password.
#   none            -> `sudo` is not on PATH
#   passwordless    -> `sudo -n true` succeeds (no password needed)
#   needs-password  -> sudo present but a password would be required
# Uses `sudo -n true` (non-interactive probe: never prompts, returns immediately).
# NEVER uses `sudo -S` (we never capture a password). Safe to call on macOS too.
detect_sudo_mode()
```

Literal idioms (use these — they are the researched, verified-current forms):

```bash
detect_pm() {
  if   command -v apt-get >/dev/null 2>&1; then PM=apt-get
  elif command -v dnf     >/dev/null 2>&1; then PM=dnf
  elif command -v yum     >/dev/null 2>&1; then PM=yum
  elif command -v pacman  >/dev/null 2>&1; then PM=pacman
  elif command -v zypper  >/dev/null 2>&1; then PM=zypper
  elif command -v apk     >/dev/null 2>&1; then PM=apk
  else PM=""; fi
}

detect_sudo_mode() {
  if ! command -v sudo >/dev/null 2>&1; then SUDO_MODE=none
  elif sudo -n true 2>/dev/null;         then SUDO_MODE=passwordless
  else SUDO_MODE=needs-password; fi
}
```

#### `/dev/tty` reachability gate

```bash
# True (returns 0) iff the controlling terminal can be opened for reading.
# Do NOT use `[ -t 0 ]` — under curl|bash stdin is the piped script, so `[ -t 0 ]`
# is always false even when a real terminal is attached. The operative signal is
# whether opening the terminal device succeeds.
# Overridable for tests via WIENERDOG_TTY (defaults to /dev/tty). A real user never
# sets WIENERDOG_TTY; it is a test-only seam (documented inline).
tty_reachable()
```

Literal idiom:

```bash
tty_reachable() {
  local tty="${WIENERDOG_TTY:-/dev/tty}"
  [ -e "$tty" ] || return 1
  { exec 3<"$tty"; } 2>/dev/null || return 1
  exec 3<&-
  return 0
}
```

#### The consent + print-fallback harness (the core deliverable)

```bash
# print_fallback DISPLAY_CMD
#   Prints, to stderr, the exact command the user should run themselves:
#       To do this yourself, run:
#           <DISPLAY_CMD>
#   Generic — knows nothing about node/git. Callers add any extra pointer lines.
print_fallback()

# consent_run PROMPT DISPLAY_CMD EXEC_FN [EXEC_ARGS...]
#   PROMPT       one-line question, e.g. "Install Node 18+ now?"
#   DISPLAY_CMD  the EXACT command string shown before running AND printed as the
#                copy-paste fallback in every non-success case (single source of
#                truth). For a nested curl|bash it MUST contain the full URL.
#   EXEC_FN      name of a shell function that performs the install and returns 0 on
#                success, non-0 on failure. Invoked as: "$EXEC_FN" "$@"
#
#   Behavior:
#     - tty not reachable         -> print_fallback "$DISPLAY_CMD"; return 1
#     - prompt on the tty ([Y/n], default yes; empty answer = yes):
#         * answer starts n/N     -> print_fallback "$DISPLAY_CMD"; return 1
#         * otherwise -> run "$EXEC_FN":
#               exit 0            -> return 0
#               exit non-0        -> print_fallback "$DISPLAY_CMD"; return 1
#
#   Returns 0 IFF the dependency was actually installed; returns 1 in every
#   fallback case, and in every 1-case it has ALREADY printed DISPLAY_CMD.
consent_run()
```

Literal idiom:

```bash
consent_run() {
  local prompt="$1" display="$2" exec_fn="$3"; shift 3
  local tty="${WIENERDOG_TTY:-/dev/tty}"
  if ! tty_reachable; then print_fallback "$display"; return 1; fi
  printf '%s\n    %s\n%s [Y/n] ' \
    "About to run:" "$display" "$prompt" >&2
  local reply=""
  read -r reply <"$tty" || reply=""
  case "$reply" in
    [nN]*) print_fallback "$display"; return 1 ;;
  esac
  if "$exec_fn" "$@"; then return 0; fi
  print_fallback "$display"; return 1
}
```

This makes the ADR-0011 rules structural: consent is **per-hop** (one `consent_run` per action), the displayed command **is** the executed command **is** the fallback, and a declined / no-tty / failed action always prints the exact command. A nested `curl|bash` hop (WP-033) is just another `consent_run` call → it can never be silently chained.

#### PATH-after-install resolution

```bash
# resolve_bin NAME DIR...
#   After an install, make a freshly-installed binary usable for the rest of THIS
#   script run: `hash -r`, then prepend any DIR that contains an executable NAME to
#   PATH, then print `command -v NAME` (its resolved path) on success, return 1 if
#   still not found. Never mutates the parent shell (impossible from a child) and
#   never re-execs.
resolve_bin()
```

Literal idiom:

```bash
resolve_bin() {
  hash -r 2>/dev/null || true
  local name="$1"; shift
  local d
  for d in "$@"; do
    if [ -x "$d/$name" ]; then PATH="$d:$PATH"; export PATH; fi
  done
  command -v "$name"
}
```

#### `main` control flow (this WP)

```bash
main() {
  # 1. refuse EUID 0 (unchanged message).
  # 2. detect_os          (unchanged: exits 1 on unsupported OS with npx note).
  # 3. ensure_node (HARD GATE): if node missing or major < 18:
  #       detect the install environment (tty_reachable; on Linux detect_pm,
  #       detect_sudo_mode). THIS WP does not install -> print the exact per-OS
  #       command via print_fallback (+ the nodejs.org pointer) and EXIT 1.
  #       (WP-032/033 replace this with consent_run + real actions.)
  # 4. ensure_git (NON-BLOCKING): if git missing:
  #       THIS WP does not install -> print the one-line git note (below) and
  #       PROCEED. Never exit 1 on git alone.
  #       (WP-032/033 replace this with consent_run + real actions, still
  #       warn-and-proceed on decline/failure/no-tty.)
  # 5. resolve node, print "Found Node <v> — handing over to the Wienerdog
  #    installer…" (stderr), exec npx --yes wienerdog@latest init "$@"
  #    # nothing after exec runs
}
```

Notes on the steps for this WP specifically:

- **Node is the hard gate.** If Node is missing/too-old and (in this WP) not installable, print the exact command + nodejs.org and `exit 1`. Do **not** run the sudo/PM probes unless Node (or, in later WPs, git) actually needs installing — keeps the common case side-effect-free and avoids running `sudo -n` when nothing needs installing.
- **git is non-blocking.** Add a git presence check (`command -v git`). If git is missing, print a **one-line note** and proceed to the handoff (exit 0) — never exit 1 on git alone. The note text (compute the exact per-OS install command via `git_install_cmd()`):
  ```
  git isn't installed — Wienerdog needs it once you create or adopt a vault. Install it with `<git_install_cmd>` before running /wienerdog-setup.
  ```
- Keep the **recent-Node handoff exactly as today** so WP-016 test 2 still passes: node present & ≥ 18 → `exec npx --yes wienerdog@latest init "$@"`. Because git is non-blocking, the handoff happens whether or not git is present (a missing git only adds the note to stderr).
- The **Node fallback text MUST still contain `https://nodejs.org`** (keeps WP-016 test 1 green): after `print_fallback "<exact node command>"`, print a line like `Or install Node LTS from https://nodejs.org.`
- Compute the exact per-OS Node command string in a helper `node_install_cmd()` and the git command string in `git_install_cmd()` (echoing the platform command as a string — e.g. Linux apt: `sudo apt-get install -y nodejs npm` / `sudo apt-get install -y git`; macOS: `brew install node` or the nodejs.org `.pkg` note / `xcode-select --install`). WP-032/033 reuse these helpers as the `DISPLAY_CMD` passed to `consent_run` and in the git note, so define them now with the exact strings. Because these are *strings inside `echo`/`printf`*, `sudo`/`apt`/`brew` appearing in them is fine.

### Testing strategy (no installs, no sudo, no real tty)

All new tests use the **sourcing seam** and **injected fakes**. Pattern for driving a single function:

```js
// Source the script (WIENERDOG_INSTALL_LIB=1 → main does NOT run), then call fn.
const r = spawnSync('bash', ['-c',
  `WIENERDOG_INSTALL_LIB=1 source "${scriptPath}"; <call and echo result>`],
  { env: { ...process.env, PATH: `${stubBin}:${process.env.PATH}`,
           WIENERDOG_TTY: fakeTtyPath }, encoding: 'utf8' });
```

Required new/changed tests (`node:test`):

- **Keep** WP-016 tests 1 (missing/old Node → exit 1, `/nodejs\.org/`), 2 (recent Node → npx handoff argv), and 3 (root-check grep). For test 1/2 the spawned script has no real tty → the tty gate is naturally unreachable, so behavior stays print-then-exit (Node) / handoff. Test 2 needs **no git shim** — git is non-blocking, so the recent-Node handoff fires whether or not git resolves (a missing git only adds the note to stderr; the npx argv is still recorded and exit is 0).
- **git is non-blocking**: add a test with a recent `node` shim (`v20`) and **no `git`** on a curated PATH → exit 0, npx argv recorded, and stderr contains the git note (`isn't installed` + the install command). Confirms a missing git never turns into exit 1.
- **Replace** WP-016 test 4 (the forbidden-word test) with a **no-password-capture** assertion: `assert.doesNotMatch(scriptText, /sudo\s+-S\b/)` (we never pipe a password) plus a comment referencing ADR-0011 (the old "never uses sudo/apt/brew" invariant is superseded — the engine legitimately probes `sudo -n true` and detects `apt-get`).
- **`consent_run` branch matrix** (fake executor = a shim function that `touch`es a marker file and returns a controllable code; fake tty = a regular file whose contents are the answer):
  - `WIENERDOG_TTY` = file containing `y` → executor runs (marker exists), `consent_run` returns 0.
  - `WIENERDOG_TTY` = file containing `n` → executor does NOT run (no marker), fallback (`To do this yourself` + the DISPLAY_CMD) printed, returns 1.
  - `WIENERDOG_TTY` = a nonexistent path → no prompt printed, executor does NOT run, fallback printed, returns 1 (the no-tty branch).
  - `WIENERDOG_TTY` = file containing `y` but executor returns 1 → fallback printed, returns 1 (install-failed branch).
  - Empty answer (file containing just a newline) → treated as yes (executor runs).
- **`detect_pm`**: PATH-shim a fake `apt-get` (any executable) first → `detect_pm; echo "$PM"` prints `apt-get`. (One case is enough; the cascade is a literal copy.)
- **`detect_sudo_mode`**: PATH-shim a fake `sudo` whose `sudo -n true` exits 0 → `passwordless`; a fake `sudo` that exits 1 → `needs-password`; a PATH with no `sudo` at all → `none`. (Use a stub bin dir as the *only* relevant dir; note that removing real `sudo` from PATH also removes system tools, so build a minimal PATH containing the stub bin + a copy/shim of `bash`, or shim `command`-resolvable tools as needed — simplest is to test `none` by shimming nothing and pointing PATH at an empty dir plus the coreutils needed; if that is impractical, test `none` by asserting the code path via a `sudo` shim that is absent from a curated PATH. Choose the simplest working approach and note it.)
- **`tty_reachable`**: regular-file `WIENERDOG_TTY` → returns 0; nonexistent → returns 1.
- **`resolve_bin`**: make a temp dir with an executable `node`; `resolve_bin node <dir>` prints `<dir>/node` and exits 0; with a dir lacking `node` → exits non-0.

Keep the existing `writeShim(dir, name, body)` helper; add a `writeFakeTty(dir, answer)` helper (writes a file containing `answer` + newline) and reuse it.

## Implementation notes & constraints

- **Zero dependencies; bash only.** Must pass `shellcheck` and `bash -n`. Format with `shfmt -i 2` (2-space indent) to match the repo.
- **`WIENERDOG_TTY` and `WIENERDOG_INSTALL_LIB` are test-only seams.** Document both inline as "test seam — a real user never sets this." They are inert in production (`/dev/tty` default; main runs when unset). Do not add any other env knobs.
- **`consent_run` reads the answer from the same tty it gated on.** Reading from a regular file (test tty) consumes its first line — fine for tests. In production the tty is the real terminal.
- **Do not prompt on the happy path.** Only detect tty/sudo/PM when a dependency is actually missing.
- **Refuse root stays.** Keep the `EUID -eq 0` refusal as the first thing `main` does.
- When uncertain, choose the simpler option and record it under "Decisions made" in the PR. Do NOT wire real install actions (that is WP-032/033) and do NOT expand scope.

## Acceptance criteria

- [ ] `bash -n install.sh` and `shellcheck install.sh` pass.
- [ ] `install.sh` is refactored into functions + `main` with the `WIENERDOG_INSTALL_LIB` sourcing guard; `source`-ing it does not run `main`.
- [ ] Recent-Node + git present → still `exec npx --yes wienerdog@latest init` (WP-016 test 2 green); the sudo/PM probes do NOT run on this path.
- [ ] Missing/old Node with an unreachable tty → prints the exact install command and `https://nodejs.org`, exits 1 (WP-016 test 1 green). No install is attempted anywhere in this WP.
- [ ] Recent Node + git missing → prints the one-line git note and still hands off (exit 0); a missing git never causes exit 1.
- [ ] `consent_run` passes the full branch matrix (yes-runs, no-fallback, no-tty-fallback, exec-fails-fallback, empty=yes) using the fake-tty + fake-executor seam — no real install, no sudo.
- [ ] `detect_pm`, `detect_sudo_mode`, `tty_reachable`, `resolve_bin` pass their unit tests via the sourcing seam with PATH shims.
- [ ] The forbidden-word test is replaced by the no-`sudo -S` assertion; no test requires real sudo or a real tty.
- [ ] Running `install.sh` twice with the same environment produces identical behavior (it is a check/print/handoff script — inherently idempotent; assert it exits the same way on a second run in the missing-Node test).

## Verification steps (run these; paste output in the PR)

```bash
bash -n install.sh
npm run lint
npm test -- --test-name-pattern install-sh
```

## Out of scope (do NOT do these)

- **Any real dependency install** — macOS actions (git CLT poll, Node `.pkg`/brew) are WP-032; Linux actions (PM install, NodeSource fallback) are WP-033. This WP only adds and unit-tests the engine and keeps the missing-dep path print-only.
- **README changes** — WP-032 updates the install-block prose (the script is no longer "installs nothing / ~60 lines").
- **PowerShell / Windows** (`install.ps1`, M6–M7).
- **Wiring `consent_run` into `ensure_*`** — that is exactly what WP-032/033 do.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/031-install-consent-engine`; PR titled `feat(install): dependency-consent engine — detection, tty gate, consent harness (WP-031)`.
3. PR template filled, including "Decisions made" and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
