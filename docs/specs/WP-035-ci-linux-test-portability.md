---
id: WP-035
title: Fix Linux CI test portability (usr-merge PATH curation, git identity)
status: Ready
model: sonnet
size: S
depends_on: [WP-033]
adrs: []
branch: wp/035-ci-linux-portability
---

# WP-035: Fix Linux CI test portability (usr-merge PATH curation, git identity)

## Context (read this, nothing else)

The GitHub Actions `test (ubuntu-latest)` job has been red since the WP-032/033 merges; all tests pass on macOS. Three failures, two root causes — both in TEST harnesses, none in product code:

1. **Debian usr-merge defeats PATH curation.** On Ubuntu, `/bin` → `/usr/bin` (symlink), so a curated test PATH like `stubBin:/bin` exposes the runner's REAL `git`/`node` in `/usr/bin`. Failing: `install-sh macOS: git via CLT times out …` (expects the git-missing note, but real git is found → straight handoff) and `install-sh Linux: apt repo Node < 18 → NodeSource offered` (real node shadows the v16 shim). On macOS `/bin` is genuinely minimal, which is why local runs were green.
2. **CI runners have no git identity.** `adopt-e2e`'s own `git()` helper runs `git revert` without `-c user.name/email` → "empty ident name". Product code is NOT affected: `src/core/vault.js:122`, `src/core/dream/validate.js:386-389`, `src/cli/adopt.js:226-229` all pass `-c user.name=wienerdog -c user.email=wienerdog@localhost` (verify, don't change).

## Current state

- `tests/unit/install-sh.test.js` — several full-script tests build PATHs from `stubBin` + system dirs (`SYS_PATH_GIT`-style constants around the macOS/Linux sections; find every PATH built from `/bin` or `/usr/bin`).
- `tests/integration/adopt-e2e.test.js` — `git(dir, args)` helper (~line 33) uses `execFileSync('git', ['-C', dir, ...args])` with no identity; used for the revert step (~line 149) and possibly setup commits.

## Deliverables (permission boundary — touch ONLY these)

| Action | Path | Notes |
|--------|------|-------|
| modify | tests/unit/install-sh.test.js | hermetic PATH construction (no /bin, no /usr/bin) |
| modify | tests/integration/adopt-e2e.test.js | git helper passes identity |

### Exact contracts

**install-sh.test.js:** replace system-dir inclusion in curated PATHs with a
hermetic `binDir` built per test-group in the temp root: symlink (or 1-line
exec-wrapper) ONLY the specific system binaries the script legitimately needs
(`bash`, `uname`, `mktemp`, `grep`, `cut`, `head`, `tr`, `dirname`, `sleep`,
`curl` if shimmed, etc. — derive the exact list by running the affected tests
with an empty PATH and adding what fails, NOT by guessing) from their
`command -v`-resolved absolute paths. `git`/`node`/`npx`/`brew`/`sudo`/PM
binaries appear ONLY as stubs when a test provides them. Apply to every test
that previously mixed `stubBin` with `/bin` or `/usr/bin`; leave pure-sourcing
tests untouched. The two named failing tests must pass with the REAL
`/usr/bin/git` and a real modern node present on the machine (that's the CI
condition — reproduce locally by asserting the curated PATH excludes them).

**adopt-e2e.test.js:** the `git()` helper gains
`['-c', 'user.name=wienerdog-test', '-c', 'user.email=test@localhost']`
before the subcommand (all call sites inherit). No other changes.

## Implementation notes & constraints

- Do NOT touch install.sh or any src/ file — product behavior is correct.
- The hermetic-PATH helper must be one shared function, not copy-paste per test.
- Sanity guard: after building the hermetic dir, assert `command -v git` fails
  under that PATH in a probe subshell (a self-test that the technique holds on
  usr-merged systems).
- When uncertain: simpler option + Decisions note.

## Acceptance criteria

- [ ] Full `npm test` green locally (macOS).
- [ ] The three previously-failing tests pass under a simulated usr-merge condition: run them with a temp `/bin`-equivalent that symlinks to a dir containing real git/node (document the simulation in the PR) — or minimally, assert the curated PATH string contains neither `/bin` nor `/usr/bin`.
- [ ] The sanity-guard probe (git unresolvable under hermetic PATH) is part of the suite.
- [ ] `npm run lint` passes.
- [ ] After merge, the `ubuntu-latest` CI job is green (owner verifies on the run).

## Verification steps (run these; paste output in the PR)

```bash
npm test
npm run lint
npm test -- --test-name-pattern install-sh
node --test tests/integration/adopt-e2e.test.js
```

## Out of scope (do NOT do these)

- Any src/ or install.sh change. CI workflow changes. Branch-protection setup (owner task).

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/035-ci-linux-portability`; PR titled `test(ci): hermetic PATHs and git identity for Linux runners (WP-035)`.
3. PR template filled, including "Decisions made" and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
