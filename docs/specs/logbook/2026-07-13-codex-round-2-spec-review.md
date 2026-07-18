---
date: 2026-07-13
title: Codex round-2 spec review
related_wps: [WP-103, WP-104, WP-105]
---

# Codex round-2 spec review (2026-07-13)

**Codex round-2 spec review (2026-07-13, 3 new defects in the revised material,
all inside the already-approved dispositions):** (1, high, WP-105) the backfill
insertion sat between sync's disk mutations and `manifestMod.save`, so an
interrupt at the prompt / during npm could strand unpersisted manifest entries —
moved to run **after** the manifest save, the final statement of `run()` (the
install is not manifest-tracked). (2, medium, WP-103) the single "missing or
broken" warn falsely promised self-heal for the corrupt-but-resolvable case
(self-heal no-ops there) — split into two messages via `isInstalled`: **absent**
keeps the offer, **broken** points only to `npm` reinstall. (3, medium, WP-103)
`refresh_token` validation was truthiness-only — tightened to a non-empty string.
Revision logs on WP-103/105 record the deltas; WP-104 untouched.
