---
date: 2026-07-13
title: Containment-guard rewrite
related_wps: [WP-103, WP-104]
---

# Containment-guard rewrite (2026-07-13)

**Containment-guard rewrite (2026-07-13, owner-approved — reverses the guard's
DO-NOT-CHANGE status):** the closing review found a second real P2 — `resolveFromDeps`
resolved the **bare** `googleapis` request (ancestor walk), so on a machine with an
ancestor/global copy + empty deps dir, `isInstalled()` resolved+rejected the ancestor
but Node cached that resolution in `Module._pathCache`; the consented self-heal then
installed into the deps dir and same-process `loadGoogleapis()` re-resolved to the
cached ancestor → threw "needs a one-time install" right after consent+`npm` succeeded
(first-run failure in exactly the env the guard exists for). Fixed by rewriting
`resolveFromDeps` to **direct-path construction** (gate on the deps-dir copy's own
`package.json`; resolve the absolute in-dir candidate, never the bare request; retain
the realpath containment check). Strictly stronger containment (ancestor copies never
considered), cache-immune, symlink defense preserved. Containment tests (:205–230) stay
byte-identical; new in-process case (a4) FAILS on the old walk and passes on the
rewrite. WP-103's probe inherits it (no code change). WP-104/105 untouched.
