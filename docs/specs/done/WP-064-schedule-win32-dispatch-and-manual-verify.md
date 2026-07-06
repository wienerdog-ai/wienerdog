---
id: WP-064
title: schedule.js win32 dispatch — register dream + catch-up via schtasks; owner VPS verification
status: Done
model: opus
size: M
depends_on: [WP-062, WP-063]
adrs: [ADR-0018, ADR-0014, ADR-0013, ADR-0004]
branch: wp/064-schedule-win32-dispatch-and-manual-verify
---

# WP-064: schedule.js win32 dispatch — register dream + catch-up via schtasks; owner VPS verification

## Context (read this, nothing else)

`src/cli/schedule.js` is the dispatch layer that turns a job definition into
OS-native schedule entries. `registerPlatform(paths, manifest, o, loader)`
branches on platform: `darwin` writes+loads a launchd plist and ensures a
catch-up plist; `linux` writes+enables systemd timer/service units; **any other
platform throws** `scheduling is not supported on ${process.platform} yet`.
That throw is caught by `ensureDreamSchedule` (called from `init.js`/`adopt.js`
when a vault is created — ADR-0014) and degraded to a plain "could not
auto-schedule" notice, which is why **Windows users' nightly dream never
auto-schedules today**.

This WP adds the **win32 branch** so Windows reaches full parity (ADR-0018):
register two Task Scheduler tasks from the XML that WP-063 renders —
`\Wienerdog\dream` (daily 03:30) and `\Wienerdog\catchup` (ONLOGON + hourly
`run-job --catch-up`) — per-user, no elevation, manifest-tracked, reversible.
The invariants: Wienerdog is just files + OS-native schedules, no daemon
(ADR-0004); the schedule targets the stable vendored bin `…\app\current\…`
(ADR-0013); a `dream` job already existing is a no-op (ADR-0014, idempotent).

Registration goes through the existing `ensureEntry` helper (content-hash
idempotency + `scheduler-entry` manifest record) and the injected **loader**
seam (`WIENERDOG_LOADER_NOOP` neutralizes the real spawn in CI). Reversal needs
**no manifest.js change**: `manifest.reverseSchedulerEntry` already best-effort
`spawnSync`s the entry's stored `unload` argv then deletes the entry's file — so
storing `unload = ['schtasks','/delete','/tn','\\Wienerdog\\<name>','/f']` and
`path =` the XML file makes `uninstall` remove the Windows schedule for free.

CI has no Windows runner, so this WP carries a **mandatory owner Windows-VPS
verification checklist** that gates merge (WP-058 precedent). The pure XML
(WP-063) and this dispatch's idempotency/argv (via an injected `platform` seam +
`WIENERDOG_LOADER_NOOP`) are CI-covered on the POSIX fleet; only the physical
Windows facts are manual.

## Current state

`src/cli/schedule.js` exists. The pieces you extend:

- `ensureEntry(manifest, filePath, content, unload)` (lines 81-96) — writes the
  file + records a `scheduler-entry` (with optional `unload`) once; returns
  `true` iff the file was (re)written (→ an OS reload is due). Reuse verbatim;
  it already does UTF-8 write + content-hash idempotency.
- `registerPlatform(paths, manifest, o, loader)` (lines 124-171) — the
  darwin/linux/throw dispatch. `o = {name, hour, minute}`. Returns
  `{platform, changed}`.
- `ensureCatchup(paths, manifest, loader, uid)` (lines 105-114) — the macOS
  catch-up-plist installer, called from the darwin branch. You add a Windows
  analog beside it.
- `ensureDreamSchedule(paths, opts)` (lines 217-235) — saves the `dream` job,
  then `try { registerPlatform(...) } catch { degrade to unsupported notice }`.
- `add()` success-message suffix (line 288):
  `platform === 'launchd' && process.platform === 'darwin' ? '; catch-up ensured.' : '.'`.
- `remove()` (lines 297-330) builds a `basenames` set from `launchdLabel` /
  `systemdUnitBase` to match manifest entries for `schedule remove <name>`.

From WP-063 (dependency) you now have on `gen` (`../scheduler/generators`):
`windowsTaskName(name)`, `windowsTasksDir(paths)`, `windowsTaskFileName(name)`,
`windowsTaskFile(paths, name)`, `windowsCurrentUserId(env?)`,
`windowsDreamTaskXml(o)`, `windowsCatchupTaskXml(o)`.

`tests/unit/scheduler-schedule.test.js` exists; it drives `schedule.run` with a
stubbed loader and guards platform-specific assertions with `{skip: !SCHED_SUPPORTED}`.

## Deliverables (permission boundary — touch ONLY these)

| Action | Path | Notes |
|--------|------|-------|
| modify | src/cli/schedule.js | win32 branch in `registerPlatform`; `ensureWindowsCatchup`; thread a `platform` seam; `remove()` basename; `add()` suffix |
| modify | tests/unit/scheduler-schedule.test.js | win32 dispatch + idempotency + remove tests via injected `platform` + loader (no real schtasks) |

### Exact contracts

**1. Platform seam (testability — the WP-049/051/038 rule: inject the value,
never mock `process.platform`).** Add an optional `platform` argument threaded
from the entry points to `registerPlatform`:

- `registerPlatform(paths, manifest, o, loader, platform = process.platform)` —
  branch on the `platform` param instead of reading `process.platform` inside
  (keep `process.getuid()` inside the darwin branch, guarded by it).
- `ensureDreamSchedule(paths, opts = {})` — read `opts.platform` and pass it:
  `registerPlatform(paths, manifest, {name:'dream',hour,minute}, loader, opts.platform || process.platform)`.
- `add()` and `repointSchedules()` call `registerPlatform` with
  `process.platform` (their current behavior — unchanged for production).

Existing production callers pass nothing → default `process.platform` → darwin/
linux behavior is **byte-identical**. Only tests pass `platform:'win32'`.

**2. `registerPlatform` win32 branch** (after the linux branch, before the final
throw):

```js
if (platform === 'win32') {
  const userId = gen.windowsCurrentUserId();
  const dreamXmlPath = gen.windowsTaskFile(paths, o.name);
  const content = gen.windowsDreamTaskXml({
    name: o.name, hour: o.hour, minute: o.minute, node, bin, userId,
  });
  const taskName = gen.windowsTaskName(o.name);            // '\Wienerdog\<name>'
  const unload = ['schtasks', '/delete', '/tn', taskName, '/f'];
  const changed = ensureEntry(manifest, dreamXmlPath, content, unload);
  if (changed) loader(['schtasks', '/create', '/tn', taskName, '/xml', dreamXmlPath, '/f']);
  // Catch-up task (ONLOGON + hourly): the missed-run mechanism, mirroring macOS.
  ensureWindowsCatchup(paths, manifest, loader);
  return { platform: 'schtasks', changed };
}
```
(`node`/`bin` are already computed at the top of `registerPlatform` via
`gen.nodePath()` / `gen.wienerdogBin(paths)`.)

**3. `ensureWindowsCatchup(paths, manifest, loader)`** — the Windows analog of
`ensureCatchup`, beside it:

```js
function ensureWindowsCatchup(paths, manifest, loader) {
  const userId = gen.windowsCurrentUserId();
  const content = gen.windowsCatchupTaskXml({ node: gen.nodePath(), bin: gen.wienerdogBin(paths), userId });
  const xmlPath = gen.windowsTaskFile(paths, 'catchup');
  const taskName = gen.windowsTaskName('catchup');          // '\Wienerdog\catchup'
  const unload = ['schtasks', '/delete', '/tn', taskName, '/f'];
  if (ensureEntry(manifest, xmlPath, content, unload)) {
    loader(['schtasks', '/create', '/tn', taskName, '/xml', xmlPath, '/f']);
  }
}
```

**4. `remove()` basename match.** Add the Windows XML basename so
`wienerdog schedule remove <name>` matches its entry:

```js
const basenames = new Set([
  `${gen.launchdLabel(name)}.plist`,
  `${gen.systemdUnitBase(name)}.timer`,
  `${gen.systemdUnitBase(name)}.service`,
  gen.windowsTaskFileName(name),          // 'wienerdog-<name>.xml'
]);
```
(The stored `unload` argv on the matched entry already runs `schtasks /delete`;
`reverseSchedulerEntry` handles it. `remove` reverses the dream entry; the shared
`catchup` task is intentionally left until `uninstall`, exactly as macOS leaves
its shared catch-up plist.)

**5. `add()` success suffix.** Replace line 288 so schtasks also reports catch-up:

```js
const suffix = platform === 'launchd' || platform === 'schtasks' ? '; catch-up ensured.' : '.';
```
(`platform` here is the value returned by `registerPlatform`.)

### Example (win32 dispatch, driven in a POSIX test via the seam)

`registerPlatform(paths, manifest, {name:'dream',hour:3,minute:30}, loader, 'win32')`
with a temp `paths.core`:
- writes `<core>/schedules/wienerdog-dream.xml` and `<core>/schedules/wienerdog-catchup.xml`;
- records two `scheduler-entry` manifest entries, each with
  `unload:['schtasks','/delete','/tn','\\Wienerdog\\dream'|'…\\catchup','/f']`;
- calls `loader` with `['schtasks','/create','/tn','\\Wienerdog\\dream','/xml',<dreamXmlPath>,'/f']`
  and the catch-up equivalent;
- returns `{platform:'schtasks', changed:true}`.
Second identical call: no file rewrite, `changed:false`, **zero** loader calls.

## Implementation notes & constraints

- No new npm deps. Reuse `ensureEntry` (do not reimplement idempotency). The
  `WIENERDOG_LOADER_NOOP` kill-switch already lives in `defaultLoader`; tests
  inject their own loader and never hit it.
- `ensureDreamSchedule` needs **no other change** — once `registerPlatform`
  succeeds on win32, its `try` no longer throws, so it stops degrading Windows to
  the "unsupported" notice and actually schedules. The init/adopt wiring already
  reaches it (`init.js:165`, `adopt.js:292`); do not touch those files.
- Do not touch `manifest.js` (reversal already generic), `run-job.js` (WP-062),
  `generators.js` (WP-063), `init.js`, `adopt.js`, `doctor.js`.
- Windows tasks run **only while the user is logged on** (InteractiveToken —
  ADR-0018). That is intentional; the catch-up task covers missed runs on next
  logon. Do not attempt a "run whether logged on or not" mode (needs elevation).
- When uncertain: choose the simpler option and record it under "Decisions made".
  Do NOT expand scope.

## Security checklist

- [ ] `name` reaches `schtasks` argv and the XML `<URI>` only through
      `gen.windowsTaskName(name)`, which is **fully anchored**
      (`/^[a-z0-9][a-z0-9-]*$/`, WP-063) and throws on `/`, `\`, `..`, spaces, or
      quotes — so no untrusted identifier can inject a task path or extra argv
      token. `add`'s own `name` gate (`/^[a-z0-9][a-z0-9-]*$/`, schedule.js:249)
      is the first line; `windowsTaskName` is the second. The XML file path is
      built from the same validated `name` via `path.join` under `paths.core`.
- [ ] The loader receives an **argv array** (`spawnSync(argv[0], argv.slice(1))`,
      no shell) — no string concatenation, so a space or metacharacter in a path
      argument is passed as one argv element, not re-split.

## Acceptance criteria

- [ ] **Validator-before-renderer invariant (owner amendment, 2026-07-06, from
      the WP-063 review):** every job name the win32 dispatch passes to
      `windowsDreamTaskXml`/`windowsCatchupTaskXml` MUST first pass through
      `windowsTaskName` (which validates `^[a-z0-9][a-z0-9-]*$` and throws on
      anything else). The renderers embed the name raw by design — validated
      names byte-match the schtasks task path; an unvalidated name would only
      fail closed as malformed XML, but the dispatch must never rely on that.
      Add a test asserting a hostile job name (e.g. `foo&<bar>`) is rejected by
      the dispatch with a `WienerdogError` BEFORE any XML is rendered or file
      written.
- [ ] `registerPlatform(..., 'win32')` writes both XML files under
      `<core>/schedules/`, records two reversible `scheduler-entry` entries with
      the correct `schtasks /delete` unload argv, calls the loader with the two
      `schtasks /create … /xml … /f` argvs, and returns `{platform:'schtasks'}`.
- [ ] A second identical `registerPlatform(..., 'win32')` call makes zero file
      rewrites and zero loader calls (idempotent).
- [ ] `ensureDreamSchedule(paths, {loader, platform:'win32'})` returns
      `{scheduled:true, at:'03:30'}` (no longer `{reason:'unsupported'}`), saves
      the `dream` job, and registers both tasks; a second call → `{reason:'exists'}`.
- [ ] `remove('dream')` after a win32 register reverses the dream entry (runs the
      stored `schtasks /delete` unload and deletes the XML file) and removes the
      job from config; the shared `catchup` entry remains until uninstall.
- [ ] Darwin/linux dispatch and every existing test are unchanged (the `platform`
      param defaults preserve current behavior).
- [ ] `npm test` and `npm run lint` pass.

## Owner manual verification checklist (Windows Server 2022 VPS — GATES MERGE)

CI cannot run these (no Windows runner). This mirrors WP-058's coverage split:
**automated** = pure XML (WP-063) + this dispatch's idempotency/argv via the
`platform` seam + `WIENERDOG_LOADER_NOOP`; **manual (owner)** = the physical
Windows facts below. The PR must not merge until the owner pastes the results.

1. On a fresh `install.ps1 → wienerdog init --fresh-vault` (or `sync` on the
   existing install), confirm both tasks registered **without a UAC prompt** as
   the standard logged-on user:
   `schtasks /query /tn "\Wienerdog\dream"` and `… "\Wienerdog\catchup"` → present.
2. **Encoding sanity:** confirm `schtasks /create … /xml` accepted the UTF-8 XML
   (no "The task XML is malformed / invalid" error). If it rejected UTF-8, STOP
   and report — the UTF-16LE+BOM contingency (WP-063 notes) becomes a follow-up.
3. **Battery/settings sanity:** in Task Scheduler UI, the dream task shows
   "Run only when user is logged on," "Run with lowest privileges,"
   "Start the task only if the computer is on AC power" **unchecked**, and
   "Run task as soon as possible after a scheduled start is missed" **checked**.
4. **Live short-interval run:** temporarily add `schedule add probe --at <now+2min>
   --job dream` (or a 1-minute test task), confirm it fires, writes a log under
   `~/.wienerdog/logs/`, and — critically — the run's env let the Claude brain
   authenticate and produce a real dream commit (not just "process started").
   Paste the run log tail.
5. **Watchdog tree-kill (WP-062):** with a wedged child, confirm the watchdog
   `taskkill /T /F` kills the whole tree and no console window flashes.
6. **Missed-run catch-up:** reboot (or log off, then log on) with the dream
   overdue; confirm the catch-up task runs it **within an hour** of the session
   being back (M6 acceptance). Note whether it fired via ONLOGON or the hourly
   trigger.
7. **Uninstall cleanliness:** `wienerdog uninstall` → `schtasks /query /tn
   "\Wienerdog\dream"` and `… catchup` both report **not found**, the
   `~/.wienerdog/schedules/*.xml` files are gone, and only the vault remains.

## Out of scope (do NOT do these)

- `run-job.js` clean-env/watchdog (WP-062) and `generators.js` XML (WP-063).
- `init.js`/`adopt.js` wiring changes (already reach `ensureDreamSchedule`).
- A per-run Windows catch-up backstop in `run-job`'s success path (the catch-up
  task is installed once here).
- Skill-routine (`skill:*`) execution on Windows / `resolveCommand` `claude`
  resolution — a separate future concern; the dream is `builtin:dream`.
- The UTF-16 encoding contingency (only triggered if checklist step 2 fails).

## Definition of done

1. All automated verification steps pass locally; output pasted into the PR.
2. **The owner manual VPS checklist above is completed and its results pasted
   into the PR; merge is gated on it** (state clearly in the DoD which coverage
   is CI vs manual — the "coverage split").
3. Branch from frontmatter; conventional commits; PR titled
   `feat(scheduler): Windows schtasks dispatch for scheduled dreaming (WP-064)`.
4. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
5. This spec's `status:` flipped to `In-Review` in the same PR.
