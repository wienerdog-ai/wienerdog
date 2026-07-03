---
id: WP-032
title: macOS consented auto-install actions (git via CLT; Node via brew-if-present else official signed .pkg)
status: In-Review
model: opus
size: M
depends_on: [WP-031]
adrs: [ADR-0004, ADR-0006, ADR-0011]
branch: wp/032-macos-autoinstall-actions
---

# WP-032: macOS consented auto-install actions (git via CLT; Node via brew-if-present else official signed .pkg)

## Context (read this, nothing else)

Wienerdog's default install is `curl -fsSL <url>/install.sh | bash` (ADR-0006). Per **ADR-0011** the installer may now install missing dependencies (Node ≥ 18, git) — but **never without consent**: one `/dev/tty` `[Y/n]` prompt per action (default yes) that shows the exact command first, and always a mandatory print-the-command fallback when auto-install is not safe or possible.

**WP-031 built the platform-agnostic engine** and is a hard dependency. From it you get (already in `install.sh`; treat as fixed contracts):

- `detect_os` → sets `os`; `detect_pm` (Linux); `detect_sudo_mode` → sets `SUDO_MODE` (`none|passwordless|needs-password`).
- `tty_reachable` → returns 0 iff the controlling terminal can be opened (test-overridable via `WIENERDOG_TTY`).
- **`consent_run PROMPT DISPLAY_CMD EXEC_FN [ARGS...]`** — the per-hop harness. It gates on `tty_reachable`, prompts `[Y/n]` (default yes) after showing `DISPLAY_CMD`, runs `EXEC_FN` on yes, and **prints `DISPLAY_CMD` as the copy-paste fallback** in every non-success case (no-tty, declined, or `EXEC_FN` returned non-0). Returns 0 iff the dependency was actually installed. This is how per-hop consent + fallback is made structural — you add EXEC_FN install actions and call `consent_run` for each.
- `print_fallback DISPLAY_CMD` — prints the "To do this yourself, run: …" block.
- **`resolve_bin NAME DIR...`** — after an install, `hash -r` + prepend any DIR containing an executable NAME to PATH, prints the resolved path, returns 1 if still absent. Used so the just-installed binary works for the rest of this script run.
- `node_install_cmd()` / `git_install_cmd()` — return the exact per-OS command string (WP-031 defined the macOS strings; you use them as `DISPLAY_CMD`).
- The script is refactored into functions + `main`, with a `WIENERDOG_INSTALL_LIB=1` sourcing seam so tests can `source install.sh` and call functions with injected fakes.

**This WP wires the engine into the macOS branch** of the missing-dependency path — the real install actions:

- **git** (from the Xcode Command Line Tools): trigger `xcode-select --install`, poll for completion with a visible timeout, fall back to printing the command on decline / timeout / no-tty.
- **Node**: if `brew` is already present → `brew install node`; else download and install the **official signed nodejs.org `.pkg`** via `sudo installer -pkg`. **Never auto-bootstrap Homebrew** (ADR-0011: a nested `curl|bash` + sudo hop with no advantage over the signed `.pkg`).
- After a successful install, `resolve_bin` the new binary so the script proceeds to `exec npx wienerdog@latest init`, and print one follow-up line for the user's interactive shell.

Product invariants:

- **Wienerdog is just files; nothing outlives its job (ADR-0004).** These install actions run synchronously and return; the CLT poll is a bounded loop with a hard timeout, never a background watcher.
- **Never install without consent (ADR-0011).** Every install action is invoked *only* through `consent_run`. The script still refuses `EUID 0`; Node's `.pkg` uses per-action `sudo`.

## Current state

After WP-031, `install.sh`'s `main` (step 4) handles a missing dependency by printing the exact per-OS command (`node_install_cmd`/`git_install_cmd`) and exiting 1 — **no prompt, no install**. `consent_run`, `resolve_bin`, and the detection functions exist and are unit-tested but are not yet wired into `ensure_*`.

`tests/unit/install-sh.test.js` uses `node:test`, spawns bash with a stub PATH (`writeShim(dir, name, body)`), a `writeFakeTty(dir, answer)` helper, and drives functions via the `WIENERDOG_INSTALL_LIB=1` sourcing seam. All WP-031 tests are green.

`README.md`'s install block (from WP-016) currently says the script "only checks for Node and hands over" and is "~60 lines" — now inaccurate; you update that prose (scoped).

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file (status flip), docs/specs/ROADMAP.md. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | install.sh | add macOS EXEC_FN install actions + wire the macOS branch of `ensure_git`/`ensure_node` through `consent_run` |
| modify | tests/unit/install-sh.test.js | add macOS behavioral tests using fake `xcode-select`/`brew`/`installer`/`sudo`/`curl` shims + fake tty |
| modify | README.md | ONLY the install-command block prose (script now installs deps with consent; drop the "~60 lines / installs nothing" claim) — no other README edits |

Do not touch the Linux install path beyond leaving WP-031's print-only fallback in place for it (WP-033 owns Linux).

### Exact contracts

#### macOS decision tree (from the researched memo — this is the frozen slice)

```
# Node is the ONLY hard gate. git is offered on the same flow but is NON-BLOCKING:
# on decline / failure / no-tty, print a one-line git note and PROCEED to the handoff
# (exit 0). Never exit 1 on git alone (ADR-0011).

macOS, git missing:
  DISPLAY_CMD = "xcode-select --install"
  consent_run "Install the Xcode Command Line Tools (provides git) now?" \
              "xcode-select --install" install_git_macos
  # consent_run 1 (declined / timeout / no-tty) -> print the git note, PROCEED.
  install_git_macos:
    - run `xcode-select --install` (opens the GUI installer; returns immediately,
      the install proceeds asynchronously — its exit status does NOT mean "done").
    - poll for completion with a visible timeout: loop until `xcode-select -p`
      succeeds AND `command -v git` resolves, or the timeout elapses.
      Print a periodic "waiting for the Command Line Tools install to finish…" line.
    - success within timeout -> return 0. Timeout -> return 1 (consent_run prints the
      fallback). There is NO documented blocking API; polling is the only option.

macOS, Node missing/old:
  if `brew` present:
    DISPLAY_CMD = "brew install node"
    consent_run "Install Node 18+ with Homebrew now?" "brew install node" install_node_brew
  else:
    DISPLAY_CMD = "sudo installer -pkg <official nodejs.org .pkg> -target /   (downloaded from https://nodejs.org)"
    consent_run "Install Node 18+ from the official nodejs.org installer (needs your password)?" \
                "$DISPLAY_CMD" install_node_pkg
  # NEVER auto-install Homebrew to reach `brew install node` (ADR-0011).
```

#### `install_git_macos`

```bash
# Triggers the CLT install and polls for completion with a hard timeout.
# Returns 0 iff git resolves before the timeout; 1 otherwise.
install_git_macos()
```

Literal shape:

```bash
install_git_macos() {
  xcode-select --install >/dev/null 2>&1 || true   # GUI trigger; async; ignore status
  local waited=0 max="${WIENERDOG_CLT_TIMEOUT:-600}"   # seconds; test-overridable
  while [ "$waited" -lt "$max" ]; do
    if xcode-select -p >/dev/null 2>&1 && command -v git >/dev/null 2>&1; then
      return 0
    fi
    echo "Waiting for the Command Line Tools install to finish…" >&2
    sleep "${WIENERDOG_CLT_POLL:-10}"
    waited=$((waited + ${WIENERDOG_CLT_POLL:-10}))
  done
  return 1
}
```

`WIENERDOG_CLT_TIMEOUT` / `WIENERDOG_CLT_POLL` are **test-only seams** (document inline; a real user never sets them). Tests set the poll to a tiny value so the loop is fast.

**Verify-at-implementation (re-check against a live current-macOS box before relying on it):** the headless CLT trick — creating the sentinel file `/tmp/.com.apple.dt.CommandLineTools.installondemand.in-progress`, then `softwareupdate -l` / `softwareupdate -i "<product>"` — is the only fully non-GUI path and Apple has historically broken it across OS releases. **Do NOT depend on it in v1.** The GUI-trigger + poll + timeout + fallback above is the required behavior; the sentinel/softwareupdate approach is an optional enhancement only if you confirm it works on the current shipping macOS, and even then it must stay behind `consent_run` and keep the same fallback. If unconfirmed, skip it (choose the simpler path) and note it in "Decisions made".

#### `install_node_brew`

```bash
# `brew install node`. Returns brew's exit status.
install_node_brew()
```

```bash
install_node_brew() {
  brew install node
}
```

After a successful brew install, node lives in `/opt/homebrew/bin` (Apple silicon) or `/usr/local/bin` (Intel). The caller resolves it (below) and prints the interactive-shell follow-up line (verify-at-implementation: the current Homebrew env-setup incantation is `eval "$(/opt/homebrew/bin/brew shellenv)"` — re-check `docs.brew.sh/Installation` at implementation time; it has been stable for years but confirm the one-liner).

#### `install_node_pkg`

```bash
# Downloads the latest official nodejs.org .pkg and installs it with sudo.
# Returns 0 on a successful install, non-0 on any download/install failure.
install_node_pkg()
```

Literal shape (verify-at-implementation: the nodejs.org "latest" directory layout and .pkg filename pattern — re-check `https://nodejs.org/dist/latest/` at implementation time):

```bash
install_node_pkg() {
  local dir file url pkg
  dir="$(mktemp -d)"
  file="$(curl -fsSL https://nodejs.org/dist/latest/ | grep -o 'node-v[0-9][0-9.]*\.pkg' | head -1)"
  [ -n "$file" ] || return 1
  url="https://nodejs.org/dist/latest/$file"
  pkg="$dir/$file"
  curl -fSL "$url" -o "$pkg" || return 1
  sudo installer -pkg "$pkg" -target / || return 1
  rm -f "$pkg"; rmdir "$dir" 2>/dev/null || true
  return 0
}
```

The official `.pkg` installs into `/usr/local` and **always needs sudo** (there is no non-sudo variant). The `DISPLAY_CMD` shown to the user must make the download source (`https://nodejs.org`) and the `sudo` explicit — the string in the decision tree does this.

#### Wiring `ensure_git` / `ensure_node` (macOS branch)

In `ensure_git`'s `Darwin` branch (git is **non-blocking**): if git missing → `consent_run "..." "$(git_install_cmd)" install_git_macos`. If `consent_run` returns 0 → `resolve_bin git /usr/bin /usr/local/bin /opt/homebrew/bin` and continue. If it returns 1 (declined / CLT timeout / no tty) → **print the one-line git note and PROCEED** to the Node check / handoff; never exit 1 on git alone. The note (using `git_install_cmd()`):

```
git isn't installed — Wienerdog needs it once you create or adopt a vault. Install it with `xcode-select --install` before running /wienerdog-setup.
```

In `ensure_node`'s `Darwin` branch: if node missing/old → choose brew vs `.pkg` per the decision tree, call `consent_run` with the matching EXEC_FN. On success → `resolve_bin node /opt/homebrew/bin /usr/local/bin` (fail → treat as install failure, print fallback, exit 1), then print the interactive-shell follow-up line, then let `main` re-check and `exec npx …`. On `consent_run` returning 1 → exit 1.

**The Node fallback text MUST still contain `https://nodejs.org`** (keeps the WP-016 regression test green): the `.pkg` DISPLAY_CMD already contains it; on the brew branch, after a failed/declined install print an extra `Or install Node LTS from https://nodejs.org.` line.

#### Frozen MUST-fall-back-to-print cases (restated; enforced by `consent_run` + these actions)

Regardless of the `[Y/n]` default-yes, the script prints the exact command and does not auto-install when: (a) `/dev/tty` is unreachable; (b) the user answers no; (c) any install step fails or times out (CLT poll timeout, `installer`/`brew`/`curl` non-zero); (d) *(Linux only — sudo unavailable & not root; not applicable to this macOS WP but keep the shared list intact)*; (e) any second nested `curl|bash` would be required beyond the one consented to — on macOS this means **never** bootstrapping Homebrew to reach `brew install node`.

### Example I/O (macOS, exact before/after)

Node missing, no Homebrew, tty reachable, user accepts:

```
$ curl -fsSL <url>/install.sh | bash
Node.js was not found on your PATH.
About to run:
    sudo installer -pkg <official nodejs.org .pkg> -target /   (downloaded from https://nodejs.org)
Install Node 18+ from the official nodejs.org installer (needs your password)? [Y/n] ⏎
Password:                      # sudo prompts on its own terminal
installer: Package name is Node.js
installer: Installation succeeded.
Found Node v22.4.1 — handing over to the Wienerdog installer…
# → exec npx --yes wienerdog@latest init
```

Node missing, user declines (or no tty):

```
Node.js was not found on your PATH.
About to run:
    sudo installer -pkg <official nodejs.org .pkg> -target /   (downloaded from https://nodejs.org)
Install Node 18+ from the official nodejs.org installer (needs your password)? [Y/n] n
To do this yourself, run:
    sudo installer -pkg <official nodejs.org .pkg> -target /   (downloaded from https://nodejs.org)
Or install Node LTS from https://nodejs.org.
# exit 1
```

git missing, user accepts, CLT install completes:

```
About to run:
    xcode-select --install
Install the Xcode Command Line Tools (provides git) now? [Y/n] ⏎
Waiting for the Command Line Tools install to finish…
Waiting for the Command Line Tools install to finish…
# git now resolves → continues to the Node check
```

### Testing strategy (no real installs, no sudo, no GUI, no real tty)

Use the WP-031 seams: **PATH-shim fake `xcode-select`, `brew`, `installer`, `curl`, `sudo`, `git`, `node`** (each records its argv to a temp file and exits with a controllable code), plus **fake tty** (`WIENERDOG_TTY` = a file containing the answer), plus the CLT poll seams (`WIENERDOG_CLT_TIMEOUT`/`WIENERDOG_CLT_POLL` set small). Force the macOS branch by shimming `uname` to print `Darwin` on the stub PATH (the existing suite prepends the stub bin first).

Required tests:

- **Node via `.pkg`, consent yes, success**: no `brew` on PATH; fake `curl` returns a filename line then "downloads"; fake `sudo`/`installer` exit 0; fake tty = `y`; provide a `node` shim that reports `v22` *after* install (simplest: the `installer` shim writes a `node` shim into the stub bin dir, or the test asserts `install_node_pkg` was reached and `installer` recorded `-pkg … -target /`). Assert: `installer` argv recorded, `sudo` used, exit path proceeds to npx handoff (npx shim recorded `--yes wienerdog@latest init`).
- **Node via `.pkg`, consent no**: fake tty = `n` → `installer` NOT invoked (no recorded argv), fallback printed containing `sudo installer` and `https://nodejs.org`, exit 1.
- **Node via `.pkg`, no tty**: `WIENERDOG_TTY` nonexistent → no prompt, `installer` NOT invoked, fallback printed, exit 1.
- **Node via brew when brew present**: fake `brew` on PATH exits 0, fake tty = `y` → `brew install node` recorded; no `installer`/`curl` download invoked. Assert Homebrew is never bootstrapped (no nested curl to brew.sh anywhere — grep the script text that no `raw.githubusercontent…Homebrew` / `brew.sh/install` URL is fetched).
- **Node install fails → fallback**: fake `installer` exits 1 (or fake `brew` exits 1) with tty=`y` → fallback printed, exit 1.
- **git via CLT, consent yes, completes**: node present (`v20` shim); fake `xcode-select` such that `xcode-select -p` succeeds and a `git` shim resolves after the first poll; `WIENERDOG_CLT_POLL` tiny, `WIENERDOG_CLT_TIMEOUT` small → `install_git_macos` returns 0 (git available), script proceeds to the npx handoff.
- **git via CLT, timeout → warn-and-proceed (NOT exit 1)**: node present (`v20` shim); fake `xcode-select -p` always fails; small timeout → loop exits, `install_git_macos` returns 1, ensure_git prints the git note (`isn't installed` + `xcode-select --install`), and the script **still hands off to npx (exit 0)**. Assert exit 0 and the recorded npx argv — git alone never causes exit 1.
- **Unit-drive `install_node_pkg`/`install_git_macos` directly** via the sourcing seam for the failure branches (cleaner than full end-to-end).

No test may invoke real `sudo`, real `installer`, real `xcode-select`, real Homebrew, or a real terminal.

## Implementation notes & constraints

- **BINDING (PR #31 review): display==exec identity is YOUR obligation.** The
  engine's `consent_run(PROMPT, DISPLAY_CMD, EXEC_FN)` cannot enforce that the
  displayed command equals what `EXEC_FN` runs — ADR-0011 rule 1 requires it.
  Every consent hop you wire MUST make `EXEC_FN` execute byte-for-byte the
  command shown in `DISPLAY_CMD` (same binary, same args, same URL). The
  reviewer will byte-verify each pair; divergence is an automatic
  REQUEST-CHANGES.

- **Zero dependencies; bash only.** Pass `shellcheck` + `bash -n`; `shfmt -i 2`.
- **Every install action runs only through `consent_run`.** Do not call `installer`/`brew`/`xcode-select` outside an EXEC_FN. This is what makes per-hop consent structural.
- **Never bootstrap Homebrew** (ADR-0011). `brew` is used only if already on PATH; otherwise the official `.pkg`. Do not add any code that fetches Homebrew's installer.
- **The CLT poll is bounded and synchronous** (ADR-0004): a `while` loop with a hard timeout, no background job, no `&`, no trap-based watcher.
- **`resolve_bin` after every successful install**, then let `main` re-check and `exec npx`. Print one interactive-shell follow-up line (brew: the `brew shellenv` eval; `.pkg`: usually `/usr/local/bin` is already on PATH, so a "you may need to open a new terminal" line suffices). Never mutate or re-exec the parent shell.
- **Test-only env seams** (`WIENERDOG_TTY`, `WIENERDOG_INSTALL_LIB`, `WIENERDOG_CLT_TIMEOUT`, `WIENERDOG_CLT_POLL`) must be documented inline as "test seam — a real user never sets this." Add no other knobs.
- Verify-at-implementation before shipping: (1) nodejs.org `/dist/latest/` layout + `.pkg` filename pattern; (2) current `brew shellenv` one-liner; (3) whether the CLT sentinel-file headless trick still works on current macOS (default: do not use it — GUI trigger + poll + fallback is sufficient). Record what you confirmed in "Decisions made".
- When uncertain, choose the simpler option and record it. Do NOT touch the Linux path (WP-033).

## Acceptance criteria

- [ ] `bash -n install.sh` and `shellcheck install.sh` pass.
- [ ] macOS Node-missing + brew present + consent yes → `brew install node` invoked, then npx handoff; Homebrew is never bootstrapped (asserted by grep: no Homebrew-installer URL fetched anywhere).
- [ ] macOS Node-missing + no brew + consent yes → official `.pkg` downloaded from nodejs.org and installed via `sudo installer -pkg … -target /`, then npx handoff.
- [ ] macOS Node-missing + consent no OR no tty → `installer`/`brew` NOT invoked; fallback printed containing the exact command and `https://nodejs.org`; exit 1.
- [ ] macOS install-failure (installer/brew non-zero) → fallback printed, exit 1.
- [ ] macOS git-missing + consent yes + CLT completes (fake) → git resolves, script proceeds to handoff; git-missing + timeout/decline/no-tty → git note printed and script **still hands off (exit 0)** — git alone never causes exit 1 (Node is the only hard gate).
- [ ] Every install action is reached only via `consent_run` (no `installer`/`brew`/`xcode-select` invocation outside an EXEC_FN — assert by structural grep in a test).
- [ ] README install block updated: mentions consented dependency install; the "installs nothing / ~60 lines" claim removed; "read it first" invitation kept.
- [ ] All WP-031 tests still pass; no test needs real sudo/installer/tty/GUI.

## Verification steps (run these; paste output in the PR)

```bash
bash -n install.sh
npm run lint
npm test -- --test-name-pattern install-sh
```

## Out of scope (do NOT do these)

- **Linux install actions** (PM install, NodeSource fallback, sudo-mode branching) — WP-033.
- **The engine** (`consent_run`, detection, `resolve_bin`, sourcing seam) — WP-031; reuse, do not reimplement.
- **PowerShell / Windows** (`install.ps1`, M6–M7).
- **The headless CLT sentinel-file trick** unless you confirm it on current macOS — default to the GUI-trigger + poll + fallback path.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/032-macos-autoinstall-actions`; PR titled `feat(install): macOS consented auto-install — CLT git, official .pkg / brew Node (WP-032)`.
3. PR template filled, including "Decisions made" (incl. the verify-at-implementation confirmations) and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
