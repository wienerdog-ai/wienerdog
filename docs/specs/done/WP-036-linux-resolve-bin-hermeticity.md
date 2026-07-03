---
id: WP-036
title: Hermetic resolve_bin isolation for Linux ensure_node tests
status: Done
model: opus
size: S
depends_on: [WP-035]
adrs: []
branch: wp/036-linux-consent-debug
---

# WP-036: Hermetic resolve_bin isolation for Linux ensure_node tests

## Context (read this, nothing else)

Written from the completed root-cause investigation (PR #36) per the incident-fix
process: diagnosis first on the real runner, spec from the proven root cause,
then review against this contract.

Three Linux `ensure_node` tests failed only on ubuntu-latest. Root cause,
demonstrated with a `bash -x` trace on the runner: `install.sh`'s
`resolve_bin node /usr/bin /usr/local/bin` scans those directories DIRECTLY,
bypassing PATH — and GitHub's ubuntu image ships a real Node v22 at
`/usr/local/bin/node`. After a fake PM "install", `resolve_bin` found the real
v22, `node_is_recent` passed, and `ensure_node` returned success before the
NodeSource/fallback paths under test were ever reached. macOS runners have no
`/usr/local/bin/node`, hence local green. `install.sh` is CORRECT (finding a
real recent Node at a standard location is desired product behavior); the bug
is test-harness hermeticity — the WP-035 class, but through a PATH-bypassing
dir scan that PATH curation cannot catch.

## Deliverables (permission boundary — touch ONLY these)

| Action | Path | Notes |
|--------|------|-------|
| modify | tests/unit/install-sh.test.js | PATH-only resolve_bin override in Linux ensure_node sourcing-seam tests |

### Exact contracts

The six Linux `ensure_node` sourcing-seam tests prepend (after sourcing the
lib) a test-local override:

```bash
resolve_bin() { command -v "$1"; }
```

— PATH-only resolution, no dir scan (command -v returns 1 when absent) — so the curated hermetic PATH is the
single source of binary truth in those tests. Product `install.sh` unchanged.
Applied uniformly to all six (not just the three red) for a uniform guarantee.

## Acceptance criteria

- [ ] Full `npm test` green on macOS locally AND on ubuntu-latest (proof run: actions/runs/28682663316, 347/0).
- [ ] Diff touches only the named test file; surgical (+26/−12), no reformat.
- [ ] `npm run lint` passes.

## Out of scope

- The unmasked PRE-EXISTING macos-latest runner failure (`git via CLT, consent yes` → 254; proven pre-existing on main: actions/runs/28682857975) — follow-up WP-037.
- ci.yml fail-fast setting (owner/WP-037 scope).

## Definition of done

Standard; PR #36 body carries the full root-cause writeup and green-run URLs.
