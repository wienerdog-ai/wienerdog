---
date: 2026-07-13
title: Codex round-3 spec review
related_wps: [WP-102, WP-103]
---

# Codex round-3 spec review (2026-07-13)

**Codex round-3 spec review (2026-07-13, one localized finding, WP-102 only —
the mirror of round-2 Finding 2):** WP-102's token-present `loadGoogleapis` error
still claimed the next `wienerdog gws` command "will offer to install it" for the
corrupt-but-resolvable case, where the read-path self-heal has just no-op'd — so
the user would loop on a contradictory message. Fixed by making that branch
state-aware (same absent/broken split as WP-103's warns), keyed on a `resolvable`
flag reused from the resolve attempt already made; added a corrupt-deps
`loadGoogleapis` test. WP-103/104/105 untouched.
