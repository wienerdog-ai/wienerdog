---
date: 2026-07-13
title: Codex round-1 spec review
related_wps: [WP-102, WP-103, WP-105]
---

# Codex round-1 spec review (2026-07-13)

**Codex round-1 spec review (2026-07-13, 4 findings, all owner-dispositioned;
WP-102/103 already implemented so the revisions land as surgical patches):**
Finding 3 (MUST FIX) — WP-102/103 messages wrongly told users to run `wienerdog
gws auth` "(no browser needed …)"; `auth.run` throws without `--client <path>`
and always opens the full browser OAuth loopback with it. Both messages now lead
with the self-heal + the exact npm one-liner and drop the `gws auth` / browser-
free claim. Finding 1 (TARGETED) — WP-103 upgraded to a load probe (above); WP-102
keeps its cheap resolve-only read-path check with the corrupt-install case
recorded as an accepted residual. Finding 2 (ADD BACKFILL) — became WP-105.
Finding 4 (MINIMAL VALIDATION) — WP-103 validates the token; WP-102's `hasToken`
stays existence-only (documented asymmetry — worst case there is a benign
consented install offer).
