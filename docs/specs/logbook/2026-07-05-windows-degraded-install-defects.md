---
date: 2026-07-05
title: Windows degraded-install defects
related_wps: [WP-048, WP-049, WP-050]
---

# Windows degraded-install defects (2026-07-05)

**Windows degraded-install defects (2026-07-05).** A high-quality external
report (Windows Server 2022, Node 24, published v0.3.0) surfaced two hard gaps
in an unconditional code path: (1) `wienerdog sync`/`init` crash with `EPERM`
in `repointCurrent` because `fs.renameSync` over an **existing** directory
symlink is not permitted on Win32 — the POSIX-atomic-rename assumption ADR-0013
made — so every run after the first aborts before writing the digest and
orphans a `current.tmp.<pid>` link; and (2) skills are never linked into
`~/.claude/skills/` (symlink creation unpermitted), so the `/wienerdog-*`
commands never register. Windows scheduling/`install.ps1` stay deferred to
M6–M7, but a published crash is a defect regardless of support tier. **WP-049**
(independent, `src/core/vendor.js`) adds a remove-then-rename fallback on
`EPERM`/`EEXIST`/`ENOTEMPTY` plus an orphan-tmp sweep (brief non-atomic window
accepted under the module's single-writer assumption; recorded as a dated
ADR-0013 amendment). **WP-050** (independent, `src/adapters/shared.js` +
`src/core/manifest.js`) copies each `wienerdog-*` skill folder where symlinks
are unpermitted, behind a new reversible `copied-skill` manifest kind. Both are
testable on POSIX via injected `rename`/`symlink` seams (no `process.platform`
mocking) and can land in parallel — they share no files with each other or with
WP-048.
