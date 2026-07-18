---
date: 2026-07-06
title: Windows scheduled dreaming chain
related_wps: [WP-058, WP-062, WP-063, WP-064]
---

# Windows scheduled dreaming chain (2026-07-06)

**Windows scheduled dreaming chain (2026-07-06, ADR-0018).** Closes the last
platform gap: a Windows install now auto-schedules the nightly dream at 03:30
at vault creation (ADR-0014, which had carved Windows out as "unsupported"),
with laptop-off / logged-off catch-up, watchdog/fail-loud, `schedule`
add/remove/list parity, manifest-tracked reversibility, IRON RULE intact
(OS-native Task Scheduler tasks, no daemon). The research spike
(`memory/research/2026-07-06-windows-scheduled-dreaming.md`) resolved the
load-bearing facts from primary sources: a standard user registers a per-user
task with **no elevation** via `schtasks /create … /it` at the default
`/rl LIMITED`; **`StartWhenAvailable` is XML-only**, so registration uses
`schtasks /create /tn <name> /xml <file> /f` (an XML *renderer*, the
launchd/systemd analog); an interactive per-user task does not run while logged
off, so an **ONLOGON + hourly catch-up task** is required exactly as on macOS;
`paths.js` is **already Windows-safe** (`env.HOME || os.homedir()`) so the
feared HOME-fix WP does not exist; and the watchdog's negative-PID
process-group kill is **POSIX-only** (Windows needs `taskkill /T /F`). Two
Task-Scheduler XML settings default to `true` and would silently skip/kill the
dream on an unplugged laptop — the generator forces
`DisallowStartIfOnBatteries`/`StopIfGoingOnBatteries` to `false`. **WP-062**
(independent, `run-job.js`) adds the two reliability-critical win32 branches —
Windows-shaped clean env (`;`-PATH + `USERPROFILE`/`APPDATA`/… so the dream
brain is findable + credential-bearing) and `taskkill /T /F` tree-kill — the
Windows twin of the launchd USER/PATH incident; both testable on POSIX via an
injected `platform` + kill/spawn seams (never `process.platform` mocking).
**WP-063** (independent, `generators.js`) adds the pure XML renderers
(`windowsDreamTaskXml`, `windowsCatchupTaskXml`) + name/path/escape helpers,
fully golden-testable in CI. **WP-064** (the capstone, `schedule.js`, depends
on both) adds the `registerPlatform` win32 branch (write XML via `ensureEntry`,
register via the injected loader, `WIENERDOG_LOADER_NOOP` honored), the Windows
catch-up ensure, the `remove()` basename, and a `platform` test seam so the
whole dispatch is CI-covered on POSIX — plus a **mandatory owner Windows-VPS
checklist** (no Windows CI runner; the physical UAC-free registration,
missed-run catch-up, live dream, and uninstall cleanliness gate merge, WP-058
precedent). `manifest.js` needs no change (reversal is already generic);
`init`/`adopt` already reach `ensureDreamSchedule`, which stops degrading
Windows once the branch exists. Serial only where they share files: WP-062 and
WP-063 land in parallel; WP-064 after both.
