---
id: WP-094
title: install.sh network-integrity hardening — pin curl to HTTPS, show the exact Node URL before consent, gate the TTY test seam
status: Done
model: opus
size: M
depends_on: []
adrs: [ADR-0011, ADR-0016]
branch: wp/094-install-sh-network-hardening
---

# WP-094: install.sh network + consent hardening

## Context (read this, nothing else)

`install.sh` is Wienerdog's `curl … | bash` bootstrapper. Under ADR-0011 it may,
with **per-hop consent**, install missing dependencies (Node, git) and — on the
npm-less path (ADR-0016) — download and sha512-verify the registry tarball. Its
trust posture (T5a/T5b): every install hop prompts on `/dev/tty` showing the
**exact** command/URL before running it; a compromised upstream is bounded by
signed sources + TLS + the shown command.

Three verified hardening gaps:

1. **HTTPS→HTTP downgrade on redirect (installers #7, T5b/ADR-0016):** the `curl`
   calls use `-L` (follow redirects) **without** `--proto '=https'
   --proto-redir '=https'`. A compromised HTTPS endpoint can redirect to `http://`.
   On the npm-less path this is acute: the checksum comes from the **same**
   registry metadata, so an attacker controlling both redirected responses serves a
   checksum-valid malicious package.

2. **macOS Node consent shows a placeholder, not the resolved URL (installers #8,
   T5b exact-command consent):** the consent line is
   `sudo installer -pkg <official nodejs.org .pkg> -target /`. The real `.pkg`
   filename/URL is scraped and chosen **inside** `install_node_pkg`, *after*
   consent — so the user cannot inspect what will actually download/run.

3. **`WIENERDOG_TTY` env seam is honored in production (installers #9, T5b
   no-controlling-terminal):** `tty_reachable`/`consent_run`/`install_via_tarball`
   read `${WIENERDOG_TTY:-/dev/tty}` from the ambient environment. Pointing it at an
   attacker-prepared readable file defeats the "no controlling terminal → no
   auto-install" guard. **Gating it behind a second env marker (`WIENERDOG_TEST=1`)
   does NOT fix this** — a headless attacker who can set `WIENERDOG_TTY` can also set
   `WIENERDOG_TEST`, so both are ambient and both are attacker-settable. The env seam
   must be **removed entirely**: production must open ONLY the real controlling
   terminal `/dev/tty`, with no environment override of the terminal source.
   Testability must come from a **code-level** seam the environment cannot reach — the
   test suite already SOURCES the script (`WIENERDOG_INSTALL_LIB=1 source install.sh`,
   so `main` does not run), so tests can **redefine a `tty_dev` shell function** after
   sourcing (function redefinition requires code execution / sourcing, not an env
   var). Production `tty_dev` returns the literal `/dev/tty`.

**Product invariant that bounds this WP:** Wienerdog is just files (ADR-0004);
install.sh must pass `shellcheck` and `shfmt -i 2` (CLAUDE.md). Displayed ==
executed (ADR-0011 rule 1).

## Current state

- `tty_reachable()` (line ~71): `local tty="${WIENERDOG_TTY:-/dev/tty}"`.
  `consent_run()` (line ~143) and `install_via_tarball()` (line ~557) do the same.
  The test harness (`tests/unit/install-sh.test.js`) already has a `sourceAndRun`
  helper that does `WIENERDOG_INSTALL_LIB=1 source "$scriptPath"` then evaluates a
  body — so it can redefine a `tty_dev` function after sourcing; full-script tests
  can `source … ; tty_dev(){ …; } ; main "$@"` to drive `main` with the override.
- `install_node_pkg()` (line ~224) scrapes `curl -fsSL https://nodejs.org/dist/latest/`,
  greps a `node-v….pkg` filename, builds `url="https://nodejs.org/dist/latest/$file"`,
  `curl -fSL "$url" -o "$pkg"`, `sudo installer -pkg "$pkg" -target /`. Its caller
  `ensure_node()` (line ~365) passes a **placeholder** DISPLAY_CMD:
  `pkg_cmd="sudo installer -pkg <official nodejs.org .pkg> -target / (downloaded from https://nodejs.org)"`.
- `do_tarball_install()` (line ~495): `curl -fSL "$url" -o "$tmp/wd.tgz"`.
  `install_via_tarball()` (line ~536): `curl -fsSL "https://registry.npmjs.org/wienerdog/latest"`.
- Tests: `tests/unit/install-sh.test.js` drives the script and already uses
  `WIENERDOG_TTY` to inject a fake terminal.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file, docs/specs/ROADMAP.md, package-lock.json. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | install.sh | add `--proto '=https' --proto-redir '=https'` to registry/nodejs curl calls; resolve the Node `.pkg` URL BEFORE consent and show it; REMOVE the `WIENERDOG_TTY` env seam — add a `tty_dev()` function returning the literal `/dev/tty` and route `tty_reachable`/`consent_run`/`install_via_tarball` through it |
| modify | tests/unit/install-sh.test.js | inject the fake terminal by redefining `tty_dev` after sourcing (NOT via `WIENERDOG_TTY`); full-script cases source the lib and call `main` after the override; assert the resolved Node URL is shown; assert the https-proto flags present |

### Exact contracts

**(1) Pin curl to HTTPS end-to-end.** Add `--proto '=https' --proto-redir '=https'`
to every remote `curl` that fetches registry metadata, the tarball, or nodejs.org
content: `install_node_pkg`'s two curls, `do_tarball_install`'s tarball curl, and
`install_via_tarball`'s metadata curl. Example:

```bash
curl --proto '=https' --proto-redir '=https' -fSL "$url" -o "$tmp/wd.tgz"
```

This makes a redirect to any non-HTTPS scheme fail rather than silently downgrade.
(Do not alter the `-f`/`-s`/`-S`/`-L` flags already present.)

**(2) Resolve the Node `.pkg` URL before consent.** Split resolution from install:

- Add a resolver that scrapes and returns the exact URL (the current scrape logic,
  factored out), e.g. `resolve_node_pkg_url` echoing
  `https://nodejs.org/dist/latest/node-vX.Y.Z.pkg` (empty on failure).
- In `ensure_node`, call the resolver FIRST. If it yields a URL, build the
  DISPLAY_CMD with that **exact** URL:
  `"sudo installer -pkg <that URL> -target /"`, and pass the URL into
  `install_node_pkg` as an argument so it downloads exactly the shown URL (displayed
  == executed). If the resolver fails (no URL), fall back to print (no consent for a
  URL we can't name).
- `install_node_pkg` takes the URL as `$1` instead of re-scraping.

The user now sees the concrete `node-vX.Y.Z.pkg` URL and the `sudo installer`
command before consenting, satisfying T5b exact-command consent.

**(3) Remove the `WIENERDOG_TTY` env seam entirely; use a redefinable function.**
An env override — even one gated by a second env marker — stays attacker-settable,
so it must not exist in production. Introduce a `tty_dev` function that
**unconditionally** returns the literal `/dev/tty`, consulting NO environment:

```bash
# The controlling-terminal device. Always /dev/tty in production — there is NO
# environment override (an ambient env var must never be able to redirect the
# consent prompt to an attacker-prepared file). Tests SOURCE this script
# (WIENERDOG_INSTALL_LIB=1) and redefine this function to point at a fake tty.
tty_dev() {
  printf '%s' "/dev/tty"
}
```

Replace each `local tty="${WIENERDOG_TTY:-/dev/tty}"` (lines ~71, ~143, ~557) with
`local tty; tty="$(tty_dev)"`. Remove every `WIENERDOG_TTY` reference from the
production script. In production `tty_dev` ignores the environment completely, so no
ambient variable can defeat the no-controlling-terminal guard — an ordinary headless
run with redirected/closed stdin (CI/cron/`ssh host 'bash -s'`) still cannot
auto-install. (A same-user process that sources the lib and redefines `tty_dev`, or
allocates a PTY, is out of scope — see Round-2 dispositions.)

**Test injection (no env seam).** The test harness already sources the script with
`WIENERDOG_INSTALL_LIB=1` (so `main` does not run). Tests inject a fake terminal by
**redefining `tty_dev`** after sourcing — function redefinition requires sourcing
the library (code execution), not a settable environment variable:

```js
// engine-function test (existing sourceAndRun): redefine tty_dev, then drive one fn
sourceAndRun(`tty_dev() { printf '%s' "${fakeTtyPath}"; }\nconsent_run …`, { … });

// full-script test: source the lib, override tty_dev, then call main explicitly
spawnSync(BASH, ['-c',
  `WIENERDOG_INSTALL_LIB=1 source "${scriptPath}"\n` +
  `tty_dev() { printf '%s' "${fakeTtyPath}"; }\n` +
  `main "$@"`], { env: { …, PATH: stubPath } });
```

Update `tests/unit/install-sh.test.js` so every case that currently sets
`WIENERDOG_TTY` instead redefines `tty_dev` (via `sourceAndRun`, or via the
source-then-`main` form for full-script runs). No `WIENERDOG_TTY` remains in either
the script or the tests.

## Implementation notes & constraints

- Must pass `shellcheck` and `shfmt -i 2` (CLAUDE.md) — the lint step gates the PR.
- Keep every consent hop's "displayed == executed" invariant: the `.pkg` URL shown
  is the one downloaded; the curl flag change does not alter what is fetched.
- Do not change the NodeSource nested-script hop's separate-consent behavior, the
  sudo-probe logic, or the root-refusal. Do not touch install.ps1 (that is WP-099).
- If resolving the Node URL adds a network call before consent, that GET is a
  read-only index fetch (same as today's scrape) — keep it `--proto '=https'` too.

## Security checklist

- [ ] Every remote `curl` that fetches registry metadata, the tarball, or nodejs.org
      content uses `--proto '=https' --proto-redir '=https'`, so a redirect to a
      non-HTTPS scheme fails instead of enabling a checksum-valid downgrade attack.
- [ ] The macOS Node consent shows the EXACT resolved `.pkg` URL and `sudo installer`
      command before prompting; the downloaded/executed artifact is byte-identical to
      what was shown (displayed == executed).
- [ ] There is NO environment override of the terminal source: `tty_dev` returns the
      literal `/dev/tty` and consults no env var, so an ambient `WIENERDOG_TTY` (or any
      env var) cannot bypass the `/dev/tty` no-controlling-terminal guard — an
      ORDINARY headless invocation (CI/cron/`ssh host 'bash -s'` with redirected/closed
      stdin) still cannot auto-install. (Narrower-but-true — see Round-2 dispositions:
      the `WIENERDOG_INSTALL_LIB=1 source` + `tty_dev` redefinition is a TEST affordance
      requiring code execution, not an env var; a same-user process that uses it — or
      that allocates a PTY so `/dev/tty` reads succeed — is OUTSIDE the threat model,
      since it can edit `install.sh`/`config.yaml` directly and gains no new
      capability. Do NOT claim the sourced-lib path is "unreachable" or that a headless
      process can NEVER auto-install; the true, reachable bypass — an ambient env
      override — is what this removal closes.)

## Acceptance criteria

- [ ] The registry/nodejs curls in the script carry the `--proto`/`--proto-redir`
      HTTPS pins (grep-assertable).
- [ ] With a stubbed nodejs.org index, the macOS Node consent line contains the
      concrete `node-v*.pkg` URL (not the `<…>` placeholder), and the install uses
      that same URL.
- [ ] An exported `WIENERDOG_TTY` has NO effect on the production script (grep shows
      no `WIENERDOG_TTY` in `install.sh`); tests inject a fake terminal only by
      redefining `tty_dev` after sourcing, and those tests pass.
- [ ] `shellcheck install.sh` and `shfmt -i 2 -d install.sh` are clean.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern "install-sh"
npm run lint
npm test
```

## Out of scope (do NOT do these)

- install.ps1 hardening (Git-asset URL / elevation) — **WP-099**.
- The JS-core tarball member preflight / secure temp — **WP-093**.
- update-check wall-clock timeout (installers #6) — separate minor item.

## Round-2 dispositions

- **Codex round-2 P1 (an ambient test marker does not protect an ambient TTY
  override):** RESOLVED by removing the env seam entirely rather than gating it. The
  original draft gated `WIENERDOG_TTY` behind `WIENERDOG_TEST=1`; both are ambient
  and attacker-settable, preserving the bypass. Production `tty_dev` now returns the
  literal `/dev/tty` with no env consultation; tests inject via redefining `tty_dev`
  after sourcing the library (already how the harness runs engine functions). This
  is the same fix shape as WP-086 (grant): no env override, code-level seam only.
- Findings 1 (HTTPS `--proto` pinning) and 2 (resolve Node `.pkg` URL before
  consent) were confirmed sound by round-2 and are unchanged.
- **Codex round-3 P1 (`tty_dev` remains overridable via the sourced-lib path; TTY
  proves a device, not consent) — NARROWED CLAIM + ACCEPTED RESIDUAL.** Round-3 is
  correct that the `WIENERDOG_INSTALL_LIB=1 source install.sh` + `tty_dev()`
  redefinition path is production-reachable by any same-user process, and that a
  readable `/dev/tty` proves a terminal device (a PTY can be scripted), not human
  consent — so "CI/cron can NEVER auto-install" and "unreachable" were over-strong.
  Default applied per brief: narrow the guarantee to *an ambient environment override
  can no longer redirect the consent read* (the reachable bypass the env-seam removal
  actually closes), and record two residuals — (a) the sourced-lib `tty_dev`
  redefinition is a code-execution TEST affordance, and (b) a same-user PTY — both
  OUTSIDE the threat model at parity with THREAT-MODEL's "a local process that can
  write `config.yaml` can forge a grant" residual (that actor can edit
  `install.sh`/`config.yaml` directly, gaining no new capability). This mirrors
  WP-086's narrowing of the same-shaped TTY claim. The env-seam removal, the
  production `tty_dev` returning literal `/dev/tty`, and the sourced-redefinition test
  seam are unchanged; only the wording is corrected.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/094-install-sh-network-hardening`; conventional commits; PR titled
   `fix(install.sh): pin curl to HTTPS, show exact Node URL, gate TTY seam (WP-094)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.

## Done record (2026-07-13)

Merged to main as `1a67e45` (PR #99, squash). install.sh pins curl to HTTPS, shows the exact Node download URL before consent, and drops the TTY env seam. Double gate: wd-reviewer APPROVE + Codex clean; CI green. (Process note: the pr-title scope had to be `install-sh` — a dot in the scope fails the `[a-z0-9-]+` check.) Shipped in v0.8.0.
