---
date: 2026-07-05
title: Second silent-starvation incident
related_wps: [WP-041, WP-048]
---

# Second silent-starvation incident (2026-07-05)

**Second silent-starvation incident (2026-07-05).** The 03:30 dream reported
"nothing new to dream" (exit 0) while four fresh Claude sessions existed past
the watermark: each extract alone exceeded the 400 000-byte input budget, the
newest-first size loop `break`s at the first over-budget session (dropping the
smaller ones behind it), and `entries.length === 0` masqueraded as success — so
no watermark advanced, no report was written, and the WP-041 durable-alert path
(which only fires on a *failing* dream) stayed unreachable. Heavy Claude days
starved the dream permanently and invisibly. **WP-048** closes it: raise the
default `dream_max_input_bytes` to 8 000 000; replace the break loop with
water-filling that **truncates boundary sessions to fit** (keep newest messages,
per-session floor 32 768 B) instead of dropping them whole — guaranteeing the
newest session is always fed and the watermark always advances; and make a
wedged (nothing-fed) dream **throw** rather than report "nothing new", so
`run-job`'s fail-loud records a durable `alerts.jsonl` entry the digest surfaces.
Extends ADR-0012 (parts 4–5).
