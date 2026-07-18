---
date: 2026-07-07
title: Third silent-loss incident — overlapping dreams
related_wps: [WP-039, WP-048, WP-069]
---

# Third silent-loss incident — overlapping dreams (2026-07-07)

**Third silent-loss incident — overlapping dreams (2026-07-07, credit: real
production dogfooding).** A catch-up dream (A) held the lock with 5 live extracts
in the shared `state/dream-scratch` and its brain mid-read; the hourly catch-up
fired again (B) ~26 s later (the daily run had not yet written `last_success`).
B's `collectExtracts` ran **before** it tried the lock and rebuilt the shared
scratch dir (`rm -rf` + `mkdir`), destroying A's inputs; B then failed to acquire
A's lock and, on the backoff path, called `cleanScratch` — a second deletion.
Brain A found its scratch gone, wrote only failure-doc notes, exited 0 — and
orchestrator A still committed and **advanced its watermark past all 5 extracts,
3 of which no dream had ever consolidated** (silent permanent drop — the WP-048
capacity-starvation outcome via a new cause). Two defects: (1) scratch is shared
state mutated *before* the lock and deleted by the lock-loser; (2) the watermark
advances on any successful commit, not on whether the brain actually consumed the
extracts. **WP-069** (one opus M WP; the fixes interlock in the same `run()`
flow) closes both: acquire the lock **before** any collect and make the
lock-loser a **pure no-op** (frozen concurrency invariant — a concurrent dream
can never touch the holder's inputs); pid-guard the teardown so a legitimately
superseded (stale-lock-stolen) dream cleans neither the stealer's scratch nor its
lock; and gate the watermark on `scratchIntact` — every input extract still
present and byte-identical to its pre-brain baseline when the brain finished —
so a brain that exited 0 on vanished inputs restores the vault, advances no
watermark, and fails loud (durable alert), exactly like the WP-039 crash path.
Keeps the single shared scratch dir + strict lock ordering (per-run scratch
isolation declined — lock-first already makes the loser never touch scratch).
Extends ADR-0012 (parts 6–7).
