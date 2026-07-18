---
date: 2026-07-08
title: First external-tester Windows report
related_wps: [WP-050, WP-070, WP-073, WP-074, WP-075]
---

# First external-tester Windows report (2026-07-08)

**First external-tester Windows report (2026-07-08, credit: Peter — Windows 11 Pro
hu-HU, non-elevated, Developer Mode OFF, wienerdog 0.6.4 via `npx wienerdog@latest
init`).** Our first outside install surfaced three verified defects on stock Windows,
split into three WPs by code region (all findings confirmed against main). **WP-073**
(S, sonnet, independent, `src/core/vendor.js`): `repointCurrent` created `app/current`
with `fs.symlinkSync` — a **privileged** op on Windows without Developer Mode/elevation
— so init EPERM-crashed mid-install (app tree vendored, `current` missing, re-run said
"already installed"). Fix: create the tmp reparse point as a **directory junction**
(`symlink(target, tmp, 'junction')`) on win32 — always creatable unprivileged for an
absolute target — via new `opts.symlink`/`opts.platform` seams (WP-050/051 precedent,
POSIX-testable, no `process.platform` mocking). **WP-074** (M, opus, independent,
`generators.js` + `schedule.js` + ADR-0018 amendment): two Task-Scheduler XML defects —
(a) files were UTF-8 with `encoding="UTF-8"`, which `schtasks /create /xml` rejects
(`(1,40) cannot convert the encoding`, hu-HU) since Task Scheduler's canonical XML is
UTF-16 → write **UTF-16 LE + BOM** with a matching declaration (new
`windowsTaskXmlBytes` helper; `ensureEntry` made Buffer-aware, byte-neutral for the
UTF-8 string callers); and (b) the catchup task's `<LogonTrigger>` needs **admin** to
register (0x80070005) → **drop it**, relying on the retained hourly TimeTrigger +
`StartWhenAvailable` (≤1h post-logon catch-up, within the advertised guarantee).
**WP-075** (M, opus, depends WP-074 — shares `schedule.js`): the fail-loud gap
(THREAT-MODEL T6). `schedulerSpawn` returns `{status}` but **never throws** on nonzero,
and every loader call site discarded it — so a failed `schtasks /create` still printed
`reloaded 2 scheduled job(s)…` / `Nightly … is scheduled` and exited 0. Audit ALL
mutation call sites (`reloadMissing`, `registerPlatform` ×3 platforms, the two
`ensureCatchup`s) so a nonzero status is reported as a WARNING/thrown error, never
success; `sync` stays exit-0 (the after-the-fact "not loaded" state is already surfaced
by WP-070's doctor/digest health probe). **Update-safety (all three):** after the fixes
ship, `wienerdog sync` on the tester's hand-patched machine converges his state to the
shipped one — the manual junction at `app\current` no-ops via the readlink fast path,
and the hand-registered `\Wienerdog\dream`/`catchup` tasks are re-registered with `/f`
to the UTF-16, no-LogonTrigger shipped XML (his hand-stripped catchup already matches).
