---
date: 2026-07-07
title: Silent scheduler-unload incident
related_wps: [WP-069, WP-070, WP-071]
---

# Silent scheduler-unload incident (2026-07-07)

**Silent scheduler-unload incident (2026-07-07, ADR-0018 amendment).** The
launchd **dream and catchup agents were silently UNLOADED** — plists intact on
disk, but `launchctl` had no record (exit 113 on `launchctl print`) — so 03:30
fired nothing, no run, **no alert** (fail-loud only triggers on a job that runs
and fails), discovered only by a missing report. Two owner-approved hardening WPs.
**WP-070** (opus M, independent) makes the invisible-failure class **visible**:
`wienerdog doctor` and the injected session digest surface any registered
`scheduler-entry` (manifest — includes the **catchup** agent, not just `jobs:`)
whose OS record is missing, via a **read-only** per-OS probe derived from the
stored `unload` argv (launchd `launchctl print`, systemd `systemctl --user
is-active <unit>.timer`, Windows `schtasks /query`; exit 0 = loaded). The digest
mirrors the ADR-0015 **cache-then-render** split (probe in `sync`/`run-job` writes
`state/scheduler-status.json`; the SessionStart hook only `cat`s the pre-rendered
digest); `doctor` probes **live** (catches even the all-jobs-unloaded case). A
missing entry is an actionable WARN, not a fail. The honest remediation is made
true: `sync` now **heals** (reloads any entry the OS lost — plain re-registration
previously no-op'd on identical files). doctor/digest never mutate. **WP-071**
(opus M, depends WP-070) fixes the **root cause**: launchd/systemd/schtasks
identifiers are **per-user-global, NOT HOME-scoped**, so a scheduler test under a
temp `HOME` still `bootout`'d the real agent (confirmed: `uninstall.test.js`
`init --fresh-vault` → `uninstall` unloaded the real dream agent). All real
scheduler **mutations** route through one `schedulerSpawn` chokepoint; a suite-wide
guard (`WIENERDOG_TEST_NO_REAL_SCHEDULER`, set by a zero-dep `tests/run.js`) makes
it **throw loudly** when a test reaches it without a seam — the belt to the
injected-loader / `WIENERDOG_LOADER_NOOP` suspenders. Depends on WP-070 (which
makes `doctor.test.js` hermetic and ships the self-guarding probe), so the two
share no test file. **Follow-up (unblocked, now that WP-069 merged):** wiring the
identical `schedulerLine` into `dream.js`'s digest render (step 15) is a 1-line
change deferred out of WP-070; the passive digest surface is `sync`-carried until
then, and `doctor` (live) is authoritative meanwhile. Amends ADR-0018.
