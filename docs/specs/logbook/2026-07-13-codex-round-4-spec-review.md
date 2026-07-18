---
date: 2026-07-13
title: Codex round-4 spec review
related_wps: [WP-102, WP-103, WP-104]
---

# Codex round-4 spec review (2026-07-13)

**Codex round-4 spec review (2026-07-13, one finding, WP-102 + WP-103 mirror):**
the broken-state remedy `npm install --prefix <deps> …` can **no-op** on a corrupt
install — npm/arborist compares tree metadata, not file contents, so a
resolvable-but-corrupt `googleapis` reads as "up to date" and stays unloadable.
Both broken messages now prescribe a **clean reinstall — delete the folder
`<depsDir>` first, then install** (platform-neutral prose; the deps dir is
single-purpose so wholesale removal is safe). WP-102's corrupt test now also
executes the repair (rmSync + fake install) and asserts `loadGoogleapis` succeeds,
proving the flow shape (real npm no-op semantics are out of unit-test reach).
WP-104/105 untouched.
