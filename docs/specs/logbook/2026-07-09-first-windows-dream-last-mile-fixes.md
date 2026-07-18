---
date: 2026-07-09
title: First-Windows-dream last-mile fixes
related_wps: [WP-076, WP-077]
---

# First-Windows-dream last-mile fixes (2026-07-09)

**First-Windows-dream last-mile fixes (2026-07-09, credit: same external tester —
Windows 11 Pro hu-HU, non-elevated, wienerdog 0.6.5).** After his local workaround,
the first field Windows dream succeeded end-to-end (commit + watermark + alert
cleared); these two verified findings are the last mile, split by code region (both
confirmed against main). No shared files, no dependency — land in parallel.
**WP-076** (S, sonnet, ship-blocker, `src/cli/run-job.js` + `src/core/dream/validate.js`):
`buildCleanEnv()` builds the win32 job PATH deterministically from scratch (node,
`~\.local\bin`, `%APPDATA%\npm`, System32, `%SystemRoot%`, WindowsPowerShell) and
git's dir is absent — so the dream's `spawnSync('git', …)` ENOENTs and **every**
Windows dream exits 1, forever. The clean env is deterministic *by design* (must not
depend on the launching context — a scheduled child inherits a near-empty PATH), so
the fix keeps that property: **append the two well-known Git-for-Windows install dirs**
(`%ProgramFiles%\Git\cmd` admin, `%LOCALAPPDATA%\Programs\Git\cmd` per-user) — NOT a
parent-PATH scan (option b, rejected: git often absent from a Task-Scheduler child's
PATH) or an init/sync-time resolve+persist (option c, rejected: config surface +
staleness). Establishes the principle *the clean PATH must cover every binary
Wienerdog itself spawns* (node, claude, powershell, git); the POSIX branch already
satisfies it via `/usr/bin`, `/opt/homebrew/bin`, … so it is left untouched. Also
enriches `validate.js`'s git-ENOENT throw to a plain-language install hint.
Ship-blocker because the tester's fix is on his *vendored* 0.6.5 copy, which the next
update overwrites. **WP-077** (M, opus, `src/adapters/shared.js` + the two adapter
tests): adapters register Claude Code / Codex hook commands with backslash paths
(`path.join(binDir, 'session-end.sh')`), and both harnesses run command hooks through
**bash** on Windows, where an unquoted backslash is an escape char
(`C:\Users\…\session-end.sh` → `C:Users…session-end.sh`, ENOENT at every SessionEnd).
Fix at the single chokepoint `shared.applySettings` (both adapters route through it):
**normalize the command to forward slashes unconditionally** (valid for bash AND the
Windows API; a no-op on POSIX — one code path, no platform branch). **Update-safety
is explicit:** one `sync` must converge from BOTH the tester's hand-fixed
forward-slash settings (no-op) AND a stock broken backslash entry — so `applySettings`
**prunes any existing separator-variant of our own exact command** before ensuring the
forward-slash one is present, leaving exactly one working entry (never a second entry
beside the still-broken one); unrelated user hooks are never touched. No golden pins
hook command strings; `bootstrap-seam` passes unchanged. **Flagged for the owner
(out of scope in WP-077):** already-installed machines have backslash commands in the
uninstall manifest that `recordOnce` won't refresh, so a later `uninstall` would leave
one stray forward-slash hook line — a cosmetic residual, fixable by making
`manifest.js` `reverseSettingsEntry` normalize-tolerant, or accepted.
