---
date: 2026-07-13
title: PR-gate review
related_wps: [WP-047, WP-102, WP-103, WP-104]
---

# PR-gate review (2026-07-13)

**PR-gate review (2026-07-13; wd-reviewer re-APPROVED both branches, Codex PR
review found one P2 each — both spot-checked):** **P2-A** (WP-102 + WP-103) — every
emitted npm command interpolated the deps dir **unquoted**, so a home path with
spaces (`C:\Users\John Smith\…`) splits when pasted; now `--prefix "<dir>"` in
every user-facing command string (`loadGoogleapis`'s two messages,
`ensureGoogleapis`'s prompt/decline/failed messages, WP-103's two warns);
`defaultRunInstall`'s argv array unchanged (no shell). **P2-B** (WP-102) —
`ensureGoogleapis` advertised default-yes but called `confirm` without
`{defaultYes:true}`, so Enter *declined* (latent WP-047 defect; in-scope because
self-heal makes this the primary recovery prompt); fixed to
`ask('Install it now? [Y/n] ', {defaultYes:true})` (not `opts.yes`, which bypasses
consent) + a seam-capture test. WP-104/105 untouched.
