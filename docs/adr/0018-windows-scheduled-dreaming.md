# ADR-0018: Windows scheduled dreaming via Task Scheduler (per-user, no elevation)

Status: Accepted (amends ADR-0014; extends ADR-0013)
Date: 2026-07-06

## Context

ADR-0014 made the nightly dream schedule itself at 03:30 the moment a vault is
created, but carved out an explicit exception: "On a platform where scheduling
is not yet supported (**Windows today**, or a non-systemd Linux), vault creation
must not fail" — it prints a "could not auto-schedule" notice and completes. The
owner's real Windows Server 2022 VPS install (via `install.ps1`, v0.5.0) now
works end-to-end **except** for that gap: the Windows user gets a vault, skills,
manual dream, and digest, but the nightly dream never auto-schedules. Windows is
the last platform gap.

`src/scheduler/generators.js` renders launchd plists (macOS) and systemd units
(Linux); `src/cli/schedule.js registerPlatform` dispatches on
`process.platform` (darwin → launchd, linux → systemd, else → throw, which
`ensureDreamSchedule` catches and degrades to the "unsupported" notice). Two
runtime pieces in `src/cli/run-job.js` — the clean-env builder and the watchdog
kill — are POSIX-shaped and would silently break a scheduled Windows dream even
if it were registered (a research code-audit finding, memo
`memory/research/2026-07-06-windows-scheduled-dreaming.md`).

The research spike resolved the load-bearing unknowns from primary sources:
a **standard user can register a per-user task with no elevation** via
`schtasks /create … /it` at the default `/rl LIMITED` run level; `/it`
(interactive-only) stores no password and avoids the elevation-ish
password-prompt path; **`StartWhenAvailable` is XML-only** (no `schtasks`
flag); an interactive per-user task does **not** run while logged off, so a
missed-run **catch-up** is required exactly as on macOS; **`HOME` is unset**
under Task Scheduler but `paths.js` already falls back to `os.homedir()`
(`USERPROFILE`), so it is safe; and the Node watchdog's negative-PID
**process-group kill does not exist on Windows** (`taskkill /T /F` is the tree
kill).

## Decision

Wienerdog **schedules the nightly dream on Windows through the OS-native Task
Scheduler**, registered per-user with no elevation, reversibly, mirroring the
launchd/systemd design one-to-one. No daemon, no stored password, no admin
(ADR-0004 intact).

1. **Registration mechanism: `schtasks /create /tn <name> /xml <file> /f`.**
   `generators.js` gains pure XML *renderers* (the launchd/systemd analog);
   `schedule.js registerPlatform` gains a `win32` branch that writes the XML via
   the existing `ensureEntry` (content-hash idempotency, manifest
   `scheduler-entry`) and registers it via the injected loader
   (`WIENERDOG_LOADER_NOOP` honored). XML — not the `schtasks` scheduling flags —
   because only XML can set `StartWhenAvailable`, and XML's `<Command>`/
   `<Arguments>` split avoids `/tr` quoting hazards (e.g. a profile path with a
   space). `Register-ScheduledTask` (PowerShell) is rejected: it has no
   file artifact to content-hash and pulls PowerShell into the reversal path.

2. **Two tasks, namespaced under a `\Wienerdog\` task folder** (mirroring the
   macOS "per-job plist + single catch-up plist" pair):
   - `\Wienerdog\dream` — daily at 03:30, `LogonType=InteractiveToken`,
     `RunLevel=LeastPrivilege`, `StartWhenAvailable=true` (fires on wake after a
     missed start), `DisallowStartIfOnBatteries=false` and
     `StopIfGoingOnBatteries=false` (**required** — the defaults are `true` and
     would skip/kill the dream on an unplugged laptop),
     `MultipleInstancesPolicy=IgnoreNew`. Action: `node.exe` +
     `"<core>\app\current\bin\wienerdog.js" run-job dream`.
   - `\Wienerdog\catchup` — ONLOGON trigger + hourly `Repetition (PT1H)`, action
     `run-job --catch-up`. This is the missed-run mechanism (the macOS
     RunAtLoad+hourly catch-up analog): `catchUp()` recomputes overdue from the
     `last_success` watermark with unbounded lookback, so a dream missed by
     power-off or logoff runs on next logon (or within the hour if already
     logged on) — the M6 acceptance. `WakeToRun` is deliberately NOT set (waking
     the machine is intrusive and can need power-policy rights; we catch up on
     wake instead, exactly as macOS does).

3. **Interactive-only is the accepted posture.** Like a macOS LaunchAgent, the
   Windows dream runs only while the user is logged on. It does not run when
   logged off; the catch-up covers that on next logon. This keeps registration
   elevation-free and password-free. (A "run whether logged on or not" task would
   need admin or a stored password — rejected.)

4. **Runtime win32 branches in `run-job.js` (reliability-critical, incident
   class):**
   - `buildCleanEnv` builds a Windows-shaped clean env: `;`-separated PATH
     (node dir first, then `%USERPROFILE%\.local\bin`, `%APPDATA%\npm`, System32
     dirs) and the Windows env essentials (`USERPROFILE`, `APPDATA`,
     `LOCALAPPDATA`, `SystemRoot`, `TEMP`/`TMP`, `PATHEXT`, `ComSpec`, …) instead
     of the POSIX `HOME`-only + `:`-PATH shape. Without this the Claude brain the
     dream spawns is unfindable or credential-blind — the Windows twin of the
     launchd USER/PATH incident (WP-038).
   - the watchdog kills the wedged tree with
     `taskkill /PID <pid> /T /F` instead of `process.kill(-pid, 'SIGKILL')`
     (negative-PID process-group kill does not exist on Windows), does not set
     `detached:true` on Windows, and sets `windowsHide:true`.

5. **`paths.js` and `manifest.js` are unchanged.** `paths.js` already falls back
   `env.HOME || os.homedir()` (Windows-safe). `manifest.reverseSchedulerEntry` is
   already platform-agnostic — storing `unload =
   ['schtasks','/delete','/tn','\\Wienerdog\\<name>','/f']` and `path =` the XML
   file makes `uninstall` reverse the Windows schedule with no new manifest code.
   `tccguard` already no-ops on non-darwin (TCC is macOS-only) — recorded here as
   deliberate.

This **amends ADR-0014**: Windows is no longer the "scheduling unsupported"
platform. The degrade-to-notice branch remains only for genuinely unsupported
platforms (non-systemd Linux). Every non-dream routine stays opt-in via the
catalog, unchanged.

## Consequences

- **Easier:** a Windows install now reaches full parity — the nightly dream
  auto-schedules at vault creation, catches up after downtime, and is fully
  reversible by `uninstall`, with no elevation. The XML-renderer design reuses
  the exact generators/manifest/idempotency machinery already proven for
  launchd/systemd; the `schedule add/remove/list` verbs gain Windows for free
  (list is already platform-agnostic; remove needs only a basename addition).
- **Harder / given up:** the dream runs **only while the user is logged on**
  (interactive-only). A Windows box that is powered on but logged off overnight
  will not dream at 03:30; it dreams via catch-up at next logon. This is the
  deliberate cost of an elevation-free, password-free install and matches the
  macOS LaunchAgent semantics users on the other platform already live with. A
  "runs whether logged on or not" mode would need admin and is out of scope.
- **Testing gap made explicit:** CI has no Windows runner. Pure XML renderers,
  the clean-env/watchdog seam tests, and the dispatch idempotency (via
  `WIENERDOG_LOADER_NOOP` + injected loaders) run on the existing POSIX fleet;
  the physical facts (real UAC-free registration, real missed-run fire after a
  reboot/logoff, real scheduled-env brain run, real `taskkill` tree death, real
  uninstall) are on a **mandatory owner Windows-VPS checklist** that gates the
  capstone WP's merge (WP-058 precedent).
- **Watched:** `StartWhenAvailable`'s exact fire timing and the battery-setting
  behavior are recalled, not executed — the VPS/laptop checklist confirms them.
  If they disappoint, the ONLOGON+hourly catch-up is the real safety net and is
  independent of them.

## Amendment (2026-07-07): scheduler-load health check + the per-user-global-labels test invariant

Status: Accepted. Born from a confirmed production incident (2026-07-07): the
user's launchd **dream and catchup agents were silently UNLOADED** — the `.plist`
files stayed on disk, but `launchctl` had no record of them (exit 113 on
`launchctl print`), so 03:30 fired nothing, no run happened, and **no failure
alert was raised** (the fail-loud path only triggers on a job that *runs* and
*fails*). It was discovered only by a missing morning report. Two decisions follow.

1. **A configured-but-not-loaded scheduled job is a first-class, surfaced health
   state (WP-070).** `wienerdog doctor` and the injected session digest detect and
   surface any registered scheduler entry (`scheduler-entry` in the install
   manifest — which includes the **catchup** agent, not just `jobs:` entries) whose
   OS record is missing. The detection is **strictly read-only** from doctor and
   the digest — a **per-OS read-only probe** derived from each entry's stored
   `unload` argv: launchd `launchctl print gui/<uid>/<label>`, systemd
   `systemctl --user is-active <unit>.timer`, Windows `schtasks /query /tn
   "\Wienerdog\<name>"` (exit 0 = loaded; anything else = not loaded). A missing
   entry is an **actionable WARN**, never a hard fail. The **only** command that
   *reloads* an unloaded entry is `wienerdog sync` (which now heals: it re-loads any
   registered entry the OS has lost — plain re-registration previously no-op'd on
   identical files and did not reload). doctor/digest never mutate the scheduler.

   The digest follows the **cache-then-render** split already used for the
   update-availability notice (ADR-0015): the probe (a subprocess) runs inside
   `sync`/`run-job` and writes `state/scheduler-status.json`; the SessionStart hook
   only `cat`s the pre-rendered `state/digest.md`, so it stays <200ms with no
   subprocess budget. `doctor` (interactive, not on the SessionStart budget) probes
   **live**, so it catches even the all-jobs-unloaded case where nothing re-renders
   the digest — doctor is the authoritative surface, the digest the passive nudge.

2. **launchd/systemd/schtasks identifiers are per-user-global, NOT HOME-scoped —
   so tests must never invoke the real OS scheduler (WP-071).** The probable
   *cause* of the incident was a scheduler test running under a temp `HOME` that
   still `launchctl bootout`'d the real agent: setting `HOME=<tempdir>` changes only
   where the plist *file* is written, while `launchctl bootout gui/<uid>/ai.wienerdog.dream`
   targets the label in the user's **global** launchd domain. The structural fix: all
   real scheduler **mutations** route through one chokepoint (`schedulerSpawn`), and
   a suite-wide guard (`WIENERDOG_TEST_NO_REAL_SCHEDULER`, set by the test runner)
   makes that chokepoint **throw loudly** rather than mutate when a test reached it
   without neutralizing the scheduler (injected loader or `WIENERDOG_LOADER_NOOP`).
   Read-only probes are exempt (they cannot corrupt state). This is the binding
   invariant: **every scheduler mutation goes through `schedulerSpawn`; every
   scheduler test uses a seam AND is backstopped by the suite guard.** It amends the
   ADR-0018 "Testing gap made explicit" note — the POSIX fleet's scheduler tests are
   now provably incapable of touching the real per-user scheduler.

## Amendment (2026-07-08): unprivileged catchup (no LogonTrigger) + UTF-16 file encoding

Status: Accepted (amends decision points 1–2). Born from the first external Windows
tester's report (Windows 11 Pro, hu-HU, non-elevated, Developer Mode off, v0.6.4).

1. **The Windows task XML file is written as UTF-16 LE with a BOM**, declaration
   `encoding="UTF-16"`. `schtasks /create /xml <file>` reads the file's bytes and
   rejects UTF-8 (`(1,40): cannot convert the encoding`, reproduced on hu-HU) — Task
   Scheduler's canonical task XML is UTF-16. launchd/systemd files stay UTF-8.

2. **The `\Wienerdog\catchup` task drops its `<LogonTrigger>`; the hourly `TimeTrigger`
   (PT1H) with `StartWhenAvailable=true` is retained as the sole trigger.** A
   logon-trigger task requires **admin rights** to register (0x80070005 Access denied
   from a standard shell), which breaks the elevation-free install promise. The hourly
   trigger + StartWhenAvailable already recovers a dream missed by power-off or logoff
   shortly after the machine/user is next available; the accepted cost is that
   post-logon catch-up can lag up to ~1h (the next hourly tick) instead of firing at
   logon — within Wienerdog's existing "within an hour" catch-up guarantee. This
   supersedes decision point 2's "ONLOGON trigger + hourly" for Windows.
