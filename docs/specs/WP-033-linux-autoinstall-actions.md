---
id: WP-033
title: Linux consented auto-install actions (PM install + ≥18 verify; NodeSource as a separately-consented fallback)
status: Ready
model: opus
size: M
depends_on: [WP-031, WP-032]
adrs: [ADR-0004, ADR-0006, ADR-0011]
branch: wp/033-linux-autoinstall-actions
---

# WP-033: Linux consented auto-install actions (PM install + ≥18 verify; NodeSource as a separately-consented fallback)

## Context (read this, nothing else)

Wienerdog's default install is `curl -fsSL <url>/install.sh | bash` (ADR-0006). Per **ADR-0011** the installer may now install missing dependencies (Node ≥ 18, git) — but **never without consent**: one `/dev/tty` `[Y/n]` prompt per action (default yes) showing the exact command first, and always a mandatory print-the-command fallback when auto-install is not safe or possible.

**WP-031 built the engine; WP-032 wired the macOS branch.** This WP wires the **Linux branch** of the missing-dependency path. From WP-031 you get (already in `install.sh`; fixed contracts):

- `detect_pm` → sets `PM` to the first available manager or `""`. Cascade order: `apt-get, dnf, yum, pacman, zypper, apk`.
- `detect_sudo_mode` → sets `SUDO_MODE` ∈ `none | passwordless | needs-password` via `sudo -n true` (never `sudo -S`; no password capture).
- `tty_reachable` → 0 iff the controlling terminal opens (test-overridable via `WIENERDOG_TTY`).
- **`consent_run PROMPT DISPLAY_CMD EXEC_FN [ARGS...]`** — the per-hop harness: gates on tty, prompts `[Y/n]` (default yes) after showing `DISPLAY_CMD`, runs `EXEC_FN` on yes, prints `DISPLAY_CMD` as the fallback in every non-success case, returns 0 iff installed.
- `print_fallback DISPLAY_CMD`; **`resolve_bin NAME DIR...`** (post-install absolute-path resolution); `node_install_cmd()`/`git_install_cmd()` (WP-031 defined the Linux strings — you use them as `DISPLAY_CMD`).
- The script is functions + `main` with the `WIENERDOG_INSTALL_LIB=1` sourcing seam; tests inject fake `sudo`/PM/tty via PATH shims + `WIENERDOG_TTY`.

**This WP adds the Linux install actions:**

- **git**: install via the detected package manager (no version concern) — with `sudo` when not root.
- **Node**: try the distro repo first via the package manager; **then verify the installed `node -v` is actually ≥ 18** (do not assume — some distros ship old Node). If the repo Node is still < 18 (or there is no `nodejs` package), offer **NodeSource** as a *separate, explicitly consented* extra step — it is a second nested `curl|bash`, so it is its own `consent_run` hop with the full URL shown, pinned to a specific major.
- Honor `SUDO_MODE`: if `sudo` is unavailable and the user is not root → print-only fallback for that action (frozen case (d)).

Product invariants:

- **Wienerdog is just files; nothing outlives its job (ADR-0004).** Install actions run synchronously and return. No daemon, no telemetry.
- **Never install without consent (ADR-0011).** Every install action runs *only* through `consent_run`. The script still refuses `EUID 0`; PM installs go through per-action `sudo`. The NodeSource nested script is a distinct consent hop — never auto-chained after the distro-repo attempt.

## Current state

After WP-031 + WP-032: `install.sh`'s macOS branch installs deps through `consent_run`; the **Linux branch of `ensure_git`/`ensure_node` still uses WP-031's print-only fallback** (prints `node_install_cmd`/`git_install_cmd` + the nodejs.org pointer and exits 1 — no prompt, no install). The engine (`consent_run`, `detect_pm`, `detect_sudo_mode`, `resolve_bin`) exists and is unit-tested.

`tests/unit/install-sh.test.js` (`node:test`) spawns bash with a stub PATH (`writeShim`), a fake tty (`writeFakeTty`/`WIENERDOG_TTY`), forces OS via a `uname` shim, and drives functions through the sourcing seam. All WP-031/032 tests are green. `README.md`'s install block was updated by WP-032.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file (status flip), docs/specs/ROADMAP.md. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | install.sh | add Linux EXEC_FN install actions (PM install, ≥18 verify, NodeSource fallback) + wire the Linux branch of `ensure_git`/`ensure_node` through `consent_run` |
| modify | tests/unit/install-sh.test.js | add Linux behavioral tests using fake `sudo`/`apt-get`/`dnf`/etc. + fake `curl` + fake tty |

`depends_on` includes WP-032 **only to serialize edits to the shared `install.sh` / test file** (WP-033 has no logical dependency on macOS code). Do not touch the macOS path.

### Exact contracts

#### Linux decision tree (from the researched memo — the frozen slice)

```
# Node is the ONLY hard gate. git is offered on the same flow but is NON-BLOCKING:
# on decline / failure / no-tty / no-PM / no-sudo, print a one-line git note and
# PROCEED to the handoff (exit 0). Never exit 1 on git alone (ADR-0011).

Linux, before any install:
  detect_pm      -> PM (or "")
  detect_sudo_mode -> SUDO_MODE
  SUDO = "sudo"  (non-root; we refuse EUID 0 earlier)
  CAN_INSTALL = (PM != "") AND NOT (SUDO_MODE == none)   # can we elevate + install?

Linux, Node missing/old (HARD GATE):
  If NOT CAN_INSTALL -> no supported package manager, or sudo unavailable & not root
     (frozen case (d)): print node fallback (node_install_cmd + nodejs.org) and EXIT 1.
     No install, no prompt.
  1. DISPLAY_CMD = "<SUDO> <PM-install-line-for nodejs [npm]>"
     consent_run "Install Node with <PM> now?" "$DISPLAY_CMD" install_pkg_linux nodejs
  2. AFTER a successful PM install, VERIFY: re-resolve node and check `node -v` >= 18.
       - >= 18 -> done, proceed.
       - < 18 or still missing -> the distro repo's Node is too old. Treat exactly like
         "no Node" and offer NodeSource as a SEPARATE consent hop (below).
  # Never assume the repo Node satisfies >= 18. Debian 12 ships 18.20.x (ok); older LTS
  # (Ubuntu 20.04 / Debian 11) ship Node 10-12. Ubuntu 24.04 is VERIFY-AT-IMPLEMENTATION.

Linux, NodeSource fallback (apt/dnf-family only; separate consent):
  Only if the distro repo Node is confirmed < 18 (or absent) AND PM is apt-get (deb) or
  dnf/yum (rpm) — the families NodeSource provides.
  DISPLAY_CMD (apt example, pinned major):
    "curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -  &&  sudo apt-get install -y nodejs"
  consent_run "Node from your distro is older than 18. Install Node 20 from NodeSource
               (runs a script from deb.nodesource.com)? [this is a second download]" \
              "$DISPLAY_CMD" install_node_nodesource
  # For pacman/zypper/apk (no NodeSource family) or if the user declines: print the
  # fallback (nodejs.org) and exit 1 — do NOT reach for nvm automatically in v1.

Linux, git missing (NON-BLOCKING — runs AFTER Node is satisfied):
  If NOT CAN_INSTALL -> print the git note (git_install_cmd) and PROCEED (exit 0). No prompt.
  Else:
    DISPLAY_CMD = "<SUDO> <PM-install-line-for git>"   (exact, per PM)
    consent_run "Install git with <PM> now?" "$DISPLAY_CMD" install_pkg_linux git
    consent_run 1 (declined / failed / no-tty) -> print the git note, PROCEED (exit 0).
  # Never exit 1 on git alone. git note:
  #   "git isn't installed — Wienerdog needs it once you create or adopt a vault.
  #    Install it with `<git_install_cmd>` before running /wienerdog-setup."
```

#### `install_pkg_linux`

```bash
# Installs one or more packages with the detected PM, prefixed with $SUDO.
# Args: package names (e.g. `git` or `nodejs npm`). Returns the PM's exit status.
install_pkg_linux()
```

Exact per-PM invocations (recalled/standard flags; all require root → `$SUDO` prefix):

```bash
install_pkg_linux() {
  case "$PM" in
    apt-get) $SUDO apt-get update && \
             $SUDO DEBIAN_FRONTEND=noninteractive apt-get install -y "$@" ;;
    dnf)     $SUDO dnf install -y "$@" ;;
    yum)     $SUDO yum install -y "$@" ;;
    pacman)  $SUDO pacman -Sy --noconfirm "$@" ;;
    zypper)  $SUDO zypper --non-interactive install "$@" ;;
    apk)     $SUDO apk add --no-cache "$@" ;;
    *)       return 1 ;;
  esac
}
```

For Node the package list is `nodejs npm` on apt/pacman/apk, `nodejs` on dnf/yum/zypper (npm bundled) — the `node_install_cmd()` string (WP-031) must match what you actually run so the DISPLAY_CMD is honest. `sudo`'s own password prompt reads from the controlling terminal (not stdin), so a `sudo apt-get …` invoked from a `curl|bash` script generally prompts correctly — but only when a controlling terminal exists, which `consent_run`'s tty gate already guaranteed before we got here.

#### Node ≥ 18 verification

```bash
# Returns 0 iff `node` resolves and its major version is >= 18.
node_is_recent()
```

```bash
node_is_recent() {
  command -v node >/dev/null 2>&1 || return 1
  local v; v="$(node -v 2>/dev/null)"; v="${v#v}"; v="${v%%.*}"
  [ -n "$v" ] && [ "$v" -ge 18 ] 2>/dev/null
}
```

Call `resolve_bin node /usr/bin /usr/local/bin` before `node_is_recent` so a just-installed binary is seen this run.

#### `install_node_nodesource`

```bash
# apt/dnf-family only. Runs NodeSource's setup script (pinned major) then installs
# nodejs via the PM. Returns 0 on success. This is a SECOND nested curl|bash — it is
# only ever invoked through its own consent_run hop.
install_node_nodesource()
```

Literal shape (apt shown; use the rpm setup URL for dnf/yum):

```bash
install_node_nodesource() {
  local major="20"   # PINNED major, not a "latest" alias
  case "$PM" in
    apt-get)
      curl -fsSL "https://deb.nodesource.com/setup_${major}.x" | $SUDO -E bash - || return 1
      $SUDO apt-get install -y nodejs ;;
    dnf|yum)
      curl -fsSL "https://rpm.nodesource.com/setup_${major}.x" | $SUDO -E bash - || return 1
      $SUDO "$PM" install -y nodejs ;;
    *) return 1 ;;
  esac
}
```

**Verify-at-implementation:** NodeSource's `setup_20.x` one-liners are **deprecated upstream but still functional** as of the research date; confirm the URL still resolves and the script has not been pulled before shipping. Pin an explicit major (`20`), never a floating alias. Show the full URL in `DISPLAY_CMD` (the decision tree does). If the script is gone, the fallback (declining → nodejs.org print) still protects the user.

#### Wiring `ensure_git` / `ensure_node` (Linux branch)

- Set `SUDO="sudo"` (non-root; we already refused `EUID 0`). `CAN_INSTALL = [ -n "$PM" ] && [ "$SUDO_MODE" != none ]`.
- **ensure_node (HARD GATE)** — runs first. If node missing/old:
  - `CAN_INSTALL` false → print the node fallback (`node_install_cmd`) + `Or install Node LTS from https://nodejs.org.` and **exit 1** (frozen case (d)); no prompt.
  - Else → `consent_run "Install Node with $PM now?" "$(node_install_cmd)" install_pkg_linux nodejs npm` (adjust package list per PM). On 0 → `resolve_bin node /usr/bin /usr/local/bin`; if `node_is_recent` → done. Else (too old / still missing) → the NodeSource hop for apt/dnf/yum, or (other PMs / on decline) print node fallback + `https://nodejs.org` and **exit 1**. On the first `consent_run` returning 1 → exit 1.
- **ensure_git (NON-BLOCKING)** — runs after Node is satisfied, before the handoff. If git missing:
  - `CAN_INSTALL` false → print the git note and **PROCEED** (exit 0); no prompt.
  - Else → `consent_run "Install git with $PM now?" "$(git_install_cmd)" install_pkg_linux git`; on 0 → `resolve_bin git /usr/bin /usr/local/bin`, continue; on 1 (declined / failed / no-tty) → **print the git note and PROCEED** (exit 0). Never exit 1 on git alone. Git note:
    ```
    git isn't installed — Wienerdog needs it once you create or adopt a vault. Install it with `<git_install_cmd>` before running /wienerdog-setup.
    ```
- **The Node fallback text MUST still contain `https://nodejs.org`** (keeps the WP-016 regression test green, which runs on Linux CI): after any Node `print_fallback`, print `Or install Node LTS from https://nodejs.org.`

#### Frozen MUST-fall-back-to-print cases (restated; enforced by `consent_run` + these actions)

The script prints the exact command and does not auto-install when: (a) `/dev/tty` unreachable; (b) user answers no; (c) any install step fails or times out; **(d) `sudo` unavailable and the user is not root (Linux) — this WP enforces (d) via `SUDO_MODE == none`**; (e) any second nested `curl|bash` beyond the one consented to — here, the **NodeSource** hop is that second nested script and is *always* its own `consent_run`, never auto-chained after the distro-repo attempt.

### Example I/O (Linux, exact before/after)

apt distro, Node absent, tty reachable, user accepts, repo Node ≥ 18:

```
$ curl -fsSL <url>/install.sh | bash
Node.js was not found on your PATH.
About to run:
    sudo apt-get update && sudo DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs npm
Install Node with apt-get now? [Y/n] ⏎
[sudo] password for ada:        # sudo prompts on its own terminal
... apt output ...
Found Node v18.20.4 — handing over to the Wienerdog installer…
# → exec npx --yes wienerdog@latest init
```

apt distro, repo Node is < 18 → NodeSource offered as a separate hop:

```
About to run:
    sudo apt-get update && sudo DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs npm
Install Node with apt-get now? [Y/n] ⏎
... installs nodejs 12 ...
Node from your distro is older than 18. Install Node 20 from NodeSource (runs a script
from deb.nodesource.com)? [this is a second download]
About to run:
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -  &&  sudo apt-get install -y nodejs
[Y/n] ⏎
... NodeSource + apt output ...
Found Node v20.15.0 — handing over to the Wienerdog installer…
```

Node missing + no supported PM (or sudo unavailable & not root) — Node is the hard gate:

```
Node.js was not found on your PATH.
To do this yourself, run:
    sudo apt-get install -y nodejs npm
Or install Node LTS from https://nodejs.org.
# exit 1  (no prompt — cannot elevate / no known package manager)
```

git missing but Node is present — git is non-blocking, so the script proceeds:

```
git isn't installed — Wienerdog needs it once you create or adopt a vault. Install it with `sudo apt-get install -y git` before running /wienerdog-setup.
Found Node v20.15.0 — handing over to the Wienerdog installer…
# → exec npx --yes wienerdog@latest init   (exit 0)
```

### Testing strategy (no real installs, no sudo, no network, no real tty)

Use the WP-031/032 seams: **PATH-shim fake `sudo`, `apt-get`/`dnf`/`pacman`/…, `curl`, `node`, `git`, `uname` (prints `Linux`)** — each records argv to a temp file, exits with a controllable code. Fake tty via `WIENERDOG_TTY`. Force `PM` and `SUDO_MODE` either by shimming the probed binaries or by calling the wired handlers through the sourcing seam with the globals preset.

Required tests:

- **apt Node install, consent yes, repo ≥ 18**: fake `apt-get` exits 0 and the test arranges `node -v` to report `v18` after (e.g. the `apt-get` shim writes a `node` shim reporting `v18.20.4`); fake `sudo` passes through to its args; tty=`y`. Assert: `sudo apt-get … install -y nodejs npm` recorded, `node_is_recent` passes, npx handoff recorded. No NodeSource `curl` invoked.
- **apt Node install, repo < 18 → NodeSource hop consented**: first `apt-get` install yields `node -v` = `v12`; `node_is_recent` fails; second `consent_run` (tty=`y`) → fake `curl`(setup script) + `apt-get install -y nodejs` recorded; then `node -v` = `v20` → handoff. Assert the NodeSource URL `deb.nodesource.com/setup_20.x` appears in the shown command and the `curl` shim was invoked exactly once (second hop), never auto-chained without the prompt.
- **NodeSource hop declined**: second-hop tty answer `n` → NodeSource `curl` NOT invoked; fallback printed containing `deb.nodesource.com` and `https://nodejs.org`; exit 1.
- **git install via PM, consent yes** (node present so handoff proceeds): fake `apt-get` exits 0, tty=`y` → `sudo apt-get … install -y git` recorded, git resolves, npx handoff (exit 0).
- **git non-blocking, consent no** (node present): tty=`n` for the git hop → git note printed (`isn't installed` + install command), `apt-get install … git` NOT recorded for git, and the script **still hands off (exit 0)**. Assert exit 0 and recorded npx argv — git decline never causes exit 1.
- **git non-blocking, no PM** (node present, curated PATH with no manager): `CAN_INSTALL` false → no git prompt, git note printed, handoff (exit 0).
- **No supported PM, Node missing** (HARD GATE): curated stub PATH with none of the managers → `PM==""`, node missing → no prompt, node fallback (nodejs.org) printed, exit 1. Assert no `sudo`/PM shim invoked.
- **sudo unavailable & not root, Node missing**: `SUDO_MODE==none` (no `sudo` shim on the curated PATH) → no prompt, node fallback printed, exit 1, no install attempted (frozen case (d)).
- **Non-apt PM (pacman/zypper/apk) with old repo Node**: NodeSource is NOT offered (wrong family) → fallback (nodejs.org) printed, exit 1. Assert no NodeSource `curl`.
- **Unit-drive `node_is_recent`** directly: `v18`→0, `v16`→1, missing→1.
- **Idempotency of the check path**: with node already present ≥ 18, the Linux path is never entered → npx handoff (shared with WP-031's recent-Node test).

No test may invoke real `sudo`, a real package manager, real network, or a real terminal.

## Implementation notes & constraints

- **Zero dependencies; bash only.** Pass `shellcheck` + `bash -n`; `shfmt -i 2`.
- **Every install action runs only through `consent_run`** — including the NodeSource hop, which is *always* a distinct `consent_run` (frozen case (e): never auto-chain a second nested `curl|bash`).
- **Verify Node ≥ 18 after any PM install** — never assume the distro repo satisfies it. Use `resolve_bin` + `node_is_recent`.
- **NodeSource:** apt/dnf-family only, pinned major (`20`), full URL shown, deprecated-but-functional (verify at implementation). For other PMs or a decline, fall back to the nodejs.org print — do **not** auto-reach for nvm in v1 (its current-shell PATH problem makes it unsuitable as a default; note this in "Decisions made" if you considered it).
- **sudo:** always `$SUDO` (= `sudo` for non-root; we refuse root). Never `sudo -S`, never capture/pipe a password. If `SUDO_MODE==none` and not root → print-only.
- **Test-only env seams** (`WIENERDOG_TTY`, `WIENERDOG_INSTALL_LIB`) documented inline. Add no new production env knobs.
- Verify-at-implementation before shipping: (1) Ubuntu 24.04's current apt `nodejs` major (research was inconsistent — Debian 12 confirmed 18.20.x; do not hardcode an assumed Ubuntu version, rely on the runtime `node_is_recent` check); (2) NodeSource `setup_20.x` URL/behavior still live. Record confirmations in "Decisions made".
- When uncertain, choose the simpler option and record it. Do NOT touch the macOS path (WP-032) or the engine (WP-031).

## Acceptance criteria

- [ ] `bash -n install.sh` and `shellcheck install.sh` pass.
- [ ] Linux Node-missing + consent yes + repo ≥ 18 → PM install (`$SUDO <PM> install … nodejs …`) then npx handoff; NodeSource never invoked.
- [ ] Linux repo Node < 18 (apt/dnf) → NodeSource offered as a SEPARATE consent hop with `deb.nodesource.com`/`rpm.nodesource.com` and pinned `setup_20.x` shown; on yes installs Node 20; on no → fallback (nodejs.org), exit 1.
- [ ] `node_is_recent` verifies the actually-installed version (v18→ok, v16→too old, missing→too old); the repo version is never assumed.
- [ ] Node missing + (no supported PM OR `sudo` unavailable & not root) → no prompt, node fallback printed (with `https://nodejs.org`), exit 1, no install attempted (frozen case (d)).
- [ ] git missing + declined / failed / no-tty / no-PM / no-sudo → git note printed and the script **still hands off (exit 0)**; git alone never causes exit 1 (Node is the only hard gate).
- [ ] Non-apt/dnf PM with old repo Node → NodeSource NOT offered; fallback printed.
- [ ] Every install action (incl. NodeSource) is reached only via `consent_run`; the NodeSource hop is never auto-chained without its own prompt (asserted).
- [ ] The Node fallback text still contains `https://nodejs.org` (WP-016 regression test green on Linux CI).
- [ ] All WP-031/032 tests still pass; no test needs real sudo/PM/network/tty.

## Verification steps (run these; paste output in the PR)

```bash
bash -n install.sh
npm run lint
npm test -- --test-name-pattern install-sh
```

## Out of scope (do NOT do these)

- **macOS install actions** (CLT git, `.pkg`/brew Node) — WP-032.
- **The engine** (`consent_run`, `detect_pm`, `detect_sudo_mode`, `resolve_bin`, sourcing seam) — WP-031; reuse, do not reimplement.
- **nvm as a default Node path** — excluded in v1 (current-shell PATH problem); nodejs.org print is the non-PM fallback.
- **PowerShell / Windows** (`install.ps1`, M6–M7).

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/033-linux-autoinstall-actions`; PR titled `feat(install): Linux consented auto-install — PM install + ≥18 verify + NodeSource fallback (WP-033)`.
3. PR template filled, including "Decisions made" (incl. verify-at-implementation confirmations) and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
