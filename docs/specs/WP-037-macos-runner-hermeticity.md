---
id: WP-037
title: Hermetic resolve_bin isolation for the macOS CLT consent test
status: In-Review
model: opus
size: S
depends_on: [WP-036]
adrs: []
branch: wp/037-macos-runner-hermeticity
---

# WP-037: Hermetic resolve_bin isolation for the macOS CLT consent test

## Context (read this, nothing else)

Written from the completed root-cause investigation (PR #37) per the
incident-fix process. The macos-latest leg failed on
`install-sh macOS: git via CLT, consent yes …` with exit 254, masked for the
repo's entire history by the fail-fast matrix (now off).

Root cause, demonstrated in runner logs: after the fake CLT "install"
succeeds, `resolve_bin git /usr/bin /usr/local/bin /opt/homebrew/bin`
PREPENDS every real dir containing git — and the GitHub macos-latest image
preinstalls Homebrew git, so `/opt/homebrew/bin` (also holding a real node@24
and npx) shadowed all stubs. `main` then exec'd the REAL
`npx --yes wienerdog@latest init` — a live npm-registry download on every CI
run — which died with npm's `ENOENT spawn sh` (no `sh` on the curated PATH),
producing exit 254. Compounding latent bug: the test's git shim was written
via `cat`/`chmod`, both absent from the curated PATH, leaving an empty
non-executable file that "resolved" only because bash `command -v` matches
non-executable files.

`install.sh` is CORRECT (prepending a real freshly-installed git is desired);
the fix is test hermeticity — the exact mirror of WP-036's ubuntu case.

## Deliverables (permission boundary — touch ONLY these)

| Action | Path | Notes |
|--------|------|-------|
| modify | tests/unit/install-sh.test.js | CLT consent test → sourcing seam + HERMETIC_RESOLVE_BIN; shim built via printf + hermetic chmod |

### Exact contracts

- The CLT consent-yes test is converted to the sourcing seam with the
  PATH-only `resolve_bin` override (WP-036's shipped form:
  `resolve_bin() { command -v "$1"; }`), renamed to drop the npx-handoff
  claim (handoff coverage remains in the CLT-timeout and Linux git tests).
- The git shim is created with the `printf` builtin and a
  `hermeticBinDir(['chmod'])`-provided chmod (WP-035 pattern) — no bare
  `cat`/`chmod` from a curated PATH.
- No real npx/npm/registry access is reachable from any install-sh test.

## Acceptance criteria

- [ ] Both matrix legs green on the PR's own CI (proof: actions/runs/28697755316) and full macOS proof run 28697697507 (347/347).
- [ ] Diff touches only the named test file; debug workflow absent.
- [ ] Local `npm test` + `npm run lint` green.

## Out of scope

- install.sh changes (product correct). The noted latent risk (full-script git tests still meet real resolve_bin and stay green only while /usr/bin lacks npx on both images) — candidate for a later hardening WP if it ever bites.

## Definition of done

Standard; PR #37 body carries the full root-cause writeup and green-run URLs.
