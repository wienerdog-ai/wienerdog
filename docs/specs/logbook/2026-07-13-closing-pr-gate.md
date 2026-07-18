---
date: 2026-07-13
title: Closing PR-gate
related_wps: [WP-102, WP-103, WP-104]
---

# Closing PR-gate (2026-07-13)

**Closing PR-gate (2026-07-13; wd-reviewer re-APPROVED all three, Codex PR review
found one real P2 on WP-103 — plus a rejected P1 stacking artifact):** the load
probe treated any successfully-required module as usable, so a shape-broken
install (zero-byte `index.js` → `{}`) passed → `doctor` falsely `[ok]` and the
next gws read crashed with a raw `TypeError` in `getServices`. Fixed at a single
point in WP-102's `loadGoogleapis` (validate a truthy `.google` object after the
require; a shape-fail is classified **broken**), which fixes the read path AND is
inherited by WP-103's probe (no `doctor.js` change). Tests: WP-102 (a3) asserts a
`WienerdogError` not a `TypeError`; WP-103 adds an empty-module → `[warn]` case.
Shape check is minimal (presence of `.google`), not full API-surface validation —
accepted residual. WP-104/105 untouched.
