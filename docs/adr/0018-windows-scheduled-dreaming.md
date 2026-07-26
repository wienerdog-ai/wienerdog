# ADR-0018: Windows scheduled dreaming via Task Scheduler (per-user, no elevation)

Status: Accepted (amends ADR-0014; extends ADR-0013)
Date: 2026-07-06

OWNER-SIGNED 2026-07-25

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

## Amendment (2026-07-25): the health invariant is the LOADED entry's program IDENTITY, not its presence

Status: **Accepted. OWNER-SIGNED 2026-07-26.**

Amends the 2026-07-07
amendment, decision points 1 and 2. Born from the **third recurrence** of the
silent-scheduler class, confirmed first-hand on the owner's machine: the
`ai.wienerdog.catchup` LaunchAgent had fired **76 times** against a deleted
launcher path inside a long-since-removed scenario-harness temp core
(`/var/folders/…/T/wd-negative-UezlJP/core/launcher/launch.js`). Every fire died
with `MODULE_NOT_FOUND` inside node's module loader — before any Wienerdog code
ran — so there was no refusal, no durable alert, and no product log. The
`.plist` file on disk was correct throughout; only the **loaded record** was
poisoned, because launchd labels are per-user-global and a harness registration
from a temp core simply overwrote the record for the real label without touching
the real file.

Three checks existed and all three passed clean, because all three read the
artifact that was fine:

- the 2026-07-07 amendment's health probe mapped **exit code 0 → `loaded`**;
  `launchctl print` exits 0 for a hijacked record, so
  `state/scheduler-status.json` reported `catchup: "loaded"` and `wienerdog
  doctor` printed a green line for weeks;
- the WP-161 scenario-harness leak observer scanned `~/Library/LaunchAgents`
  for stray **plist files** referencing the run's temp root; a registration that
  clobbers an existing label leaves no new file, so it reported clean;
- a human repair session on 2026-07-23 inspected the plist **files**, found them
  clean, and recorded "catchup plist clean".

Three decisions follow.

1. **Presence is not health; identity is — and a probe that cannot establish
   identity must not claim health.** A registered scheduler entry is `loaded`
   only when the scheduler's OWN record of what it will execute names **this
   install's independent launcher** (`<core>/launcher/launch.js`), in the
   **execution position** the scheduler itself reports — never merely somewhere
   in the record's text. The probe therefore reads the loaded record back —
   launchd `launchctl print`'s `arguments` block (`arguments[1]`), Windows
   `schtasks /query /tn <name> /xml`'s `<Command>` plus the launcher token of the
   `<Arguments>` exec segment — and compares positionally. A substring test is
   explicitly forbidden: the registered Windows argline embeds core paths in its
   `set "VAR=…"` chain, so "the launcher appears in the argline" is true of a
   task that never invokes it. "Execution position" is read strictly: on Windows
   the task must declare exactly **one** action, and **nothing but the canonical
   `set "VAR=…"` binds may precede the launcher in the `cmd.exe` command chain**
   — a chain that runs something else first is not a position in which our
   launcher is what the scheduler executes, even though our launcher is also in
   it. Anything that cannot be established maps to `unverified`, never to
   `loaded`. This generalizes the verification Windows has had
   since the A7 hardening pass (ADR-0028, `windowsLoadedTaskMatches`), which
   reads a registered task back at *register* time; the same read now also gates
   the *health* verdict.

   The corollary is the part that matters: **the default is fail-closed.** A
   recognized entry for which no identity expectation can be derived, an identity
   query that fails, and an output that cannot be parsed unambiguously all map to
   `unverified` — never to `loaded`. There is no presence-only mode. This
   **supersedes** the 2026-07-07 amendment's "exit 0 = loaded; anything else =
   not loaded".

2. **A hijacked entry is a distinct, worse state than a missing one, and it is
   a hard `doctor` failure.** The 2026-07-07 amendment's "a missing entry is an
   actionable WARN, never a hard fail" stands for `missing`, but the entry-status
   taxonomy gains `mismatched` (a record exists and runs a program outside this
   install → `doctor` **fails**, exit 1) and `unverified` (a record exists but no
   identity verdict could be reached → warn). The member is named `mismatched`
   rather than `foreign` because `foreign` already means the opposite thing three
   lines away in the same subsystem: `deriveProbeArgv` returns `null` for a
   "foreign basename", which causes the entry to be **skipped**, whereas a
   foreign *record* is the loudest failure the taxonomy has.

   Both are surfaced through the **existing** scheduler channel —
   `state/scheduler-status.json` plus the digest callout built by WP-070 — with
   no new alert channel, and both are healed by the one command allowed to mutate
   the scheduler, `wienerdog sync`. For that channel to be real, the nightly
   `dream` digest regeneration must pass `schedulerLine` to `renderDigest`; it
   did not, so every nightly rewrite erased the scheduler callout and only an
   attended `sync` restored it. That is the same hole ADR-0023 closed once for
   the transcript-quarantine banner, and it is closed here for the same reason.

   To make the advice ("run `wienerdog sync`") true rather than aspirational, the
   darwin heal must be able to replace an already-loaded record, which a bare
   `launchctl bootstrap` cannot. It does so **bootstrap-first**: attempt
   `bootstrap`, and only when launchd refuses it — the signal that a record is
   already loaded under the label — issue `bootout` and `bootstrap` again. The
   naive bootout-first order is rejected: `unverified` is in the heal set and is
   what any read-back deviation on a perfectly healthy entry produces, so
   bootout-first would tear down a working job and then fail to restore it,
   leaving the user with **no scheduled job at all** — strictly worse than the
   start state. Bootstrap-first is also strictly cheaper for the common `missing`
   case (one spawn, no teardown) and never enters a destructive path for it.
   Before any destructive replacement, the durable status cache is refreshed from
   the live probe, so a process killed mid-replacement leaves a pessimistic
   record rather than a stale `loaded` one. doctor and the digest remain strictly
   read-only; `sync` remains the sole healer.

3. **A test-containment observer must read the loaded record, not the file.**
   The 2026-07-07 amendment's invariant — *every scheduler mutation goes through
   `schedulerSpawn`; every scheduler test uses a seam AND is backstopped by the
   suite guard* — is retained in full. Retaining it constrains decision 1's
   probe: the neutralizer env vars that make `schedulerSpawn` throw are the same
   ones the probe consults, so a probe that could only be exercised by *deleting*
   them would disarm the backstop for exactly the tests that drive a heal. The
   probe therefore treats **the presence of its injected read seam** as the
   neutralization and consults the env vars only when no seam was injected, so
   no test needs to delete one. The invariant is then also extended: the
   scenario harnesses' post-run
   observer must additionally enumerate the **loaded** per-user registrations and
   fail the run when any Wienerdog-named record will execute a program inside a
   temp directory. It must be immune to the very containment machinery it runs
   inside: it invokes the scheduler client by **absolute path** (so the
   harness's PATH loader-shim cannot intercept it), takes no `env` parameter (so
   the sandboxed init env cannot reach it), does not read
   `WIENERDOG_LOADER_NOOP` or `WIENERDOG_TEST_NO_REAL_SCHEDULER` (those
   neutralize the *product's* loader; honoring them would let the leaking
   configuration disable its own detector), reads no schedule file, and matches
   against the whole OS temp directory rather than only the current run's root —
   so a **stale** leak from an earlier run cannot hide. This closes the specific
   gap that let the 2026-07-22 poisoned record survive WP-161's gate.

**Scope and honesty about platforms.** Decision 1's identity check is
implemented for **launchd and Task Scheduler only**. The launchd format was
verified first-hand on a real macOS host; the Windows format rests on the
`parseWindowsTaskExec` parser that already ships and is already relied upon at
register time, with every round-trip deviation mapping to `unverified` (a warn
that still heals) rather than to a hard failure, and with a mandatory owner
Windows-VPS confirmation. **systemd identity is declared unimplemented, not
merely unverified**: the exact output of
`systemctl --user show <unit>.service --property=ExecStart` could not be
confirmed on a real Linux host, and specifying it anyway would give every Linux
install `unverified` on every entry — a permanent warn plus a bootout-and-
re-register of both units on *every* `sync`, which is not idempotent in the sense
CLAUDE.md requires. A systemd entry therefore yields `unknown`: no doctor line,
no digest callout, no heal, no churn. Linux keeps full `missing` detection, since
absence is decided before identity. Implementing the systemd row is a named,
dated residual, not an oversight.

Decision 3's observer is likewise implemented for **launchd only**: on Linux a
`systemd --user` manager's unit search path is fixed when the manager starts and
is not moved by a child process's `XDG_CONFIG_HOME`, so a harness cannot make it
load a unit from a temp dir at all — the only reachable leak shape writes a unit
*file* into the real user dir, which WP-161's file observer already catches; on
Windows the WP-161 "no `schtasks` interceptor, no Windows CI runner" residual is
unchanged. Both no-op arms print a residual notice on every run, so the gap stays
owner-visible rather than silent. Every unverifiable per-record condition in the
observer fails closed; the single tolerated exception (a label listed and then
unloaded between the two reads) prints a notice, so no disposition is silent.

This amendment does not claim protection against a same-user actor who re-poisons
the record after every check — that remains A7/A12 territory (ADR-0028).

**Implemented by two work packages, and by neither alone.** Decisions 1 and 2 are
implemented by **WP-scheduler-entry-identity** (the product's probe, taxonomy,
digest wiring and heal). Decision 3 is implemented by
**WP-scheduler-loaded-record-tripwire** (the scenario harnesses' loaded-record
observer). The two touch disjoint files, share no imports, and may merge in
either order — but **neither closes the incident class on its own**: the product
half stops Wienerdog from mis-reporting a poisoned record, and the harness half
stops Wienerdog's own tests from creating one and lets a stale one be seen. Any
claim that this class is closed requires both.

**Architect note (2026-07-26, architect-authored — this is NOT an owner
signature and confers no approval).** An empty `OWNER APPROVAL` block sat here
until 2026-07-26. It was vestigial and it was the only one of its kind in
`docs/adr/`: this ADR's ratification is recorded by the owner-typed
`OWNER-SIGNED 2026-07-25` line at the head of the file, and the 2026-07-25
amendment's ratification by the owner-typed
`Status: **Accepted. OWNER-SIGNED 2026-07-26.**` line above it. An empty
approval block underneath two signed markers reads as an approval still
outstanding, which is false, so it was removed rather than left to contradict
them. **The authoritative ratification marker for the 2026-07-25 amendment is
its own status line**; nothing downstream may key on an approval block. No
`OWNER-SIGNED` line, no Decision, and no amendment text was modified, moved or
retyped by this note.
