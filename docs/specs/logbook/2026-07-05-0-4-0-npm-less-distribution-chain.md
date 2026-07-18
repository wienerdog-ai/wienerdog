---
date: 2026-07-05
title: 0.4.0 npm-less distribution chain
related_wps: [WP-053, WP-054, WP-055]
---

# 0.4.0 npm-less distribution chain (2026-07-05)

**0.4.0 npm-less distribution chain (2026-07-05).** Live 0.3.x testing found
users with Node ≥ 18 but no `npx`/`npm`. Since Wienerdog has zero runtime deps,
the published npm tarball IS the whole app, and ADR-0013's vendored layout
(`~/.wienerdog/app/<version>/` behind `app/current`) is literally "unpack a
tarball here." **ADR-0016** adds an npm-independent install/update channel that
fetches the registry tarball over HTTPS, verifies its **sha512** SRI integrity
before unpacking, and lands it in the vendored layout; npm/npx stays the happy
path where present. **WP-053** builds the reusable core module
(`src/core/tarball.js`: fetch `/wienerdog/latest` manifest → validate → download
→ verify sha512 → `tar --strip-components=1` into `app/<v>/`, atomic staging,
idempotent, no manifest write — the `vendored-tree` entry already covers it).
**WP-054** adds the `wienerdog update` CLI verb (fetch+verify+unpack, then hand
off to the **new version's** `sync` so it re-vendors + repoints `current` — never
the in-process/old sync, or the update silently reverts) and switches ADR-0015's
"update available" notice to quote `wienerdog update` when `npx` is absent and
`npx wienerdog@latest sync` when present (pure spawn-free PATH scan at render
time). **WP-055** gives `install.sh` a consented tarball fallback (ADR-0011
posture: show what/where, `/dev/tty` prompt, fail-to-print) when Node is present
but `npx` is not: `curl` the tarball, verify sha512 with the guaranteed-present
`node`, `tar` into `app/<v>/`, `exec node .../init` (extract-into-final-dir means
`vendorSelf` sees the version dir exists and skips the copy — no double copy).
Serial chain (shared ADR + ROADMAP rows; avoids merge conflicts). No auto-update
invariant (ADR-0004/0015) unchanged: `update` runs only on explicit command; the
notice only tells. `googleapis` stays npm-only (ADR-0016 §6 — documented, a
wd-docs follow-up on the google-setup message; no npm-less googleapis path).
`install.ps1`/Windows bootstrap remains out of scope.
