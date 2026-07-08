---
id: WP-075
title: Fail loud on failed scheduler mutations (never report an unloaded job as scheduled/reloaded)
status: In-Review
model: opus
size: M
depends_on: [WP-074]
adrs: [ADR-0018, ADR-0012, ADR-0004]
branch: wp/075-scheduler-fail-loud-on-load-failure
---

# WP-075: Fail loud on failed scheduler mutations (never report an unloaded job as scheduled/reloaded)

## Context (read this, nothing else)

Every real OS-scheduler **mutation** (launchd `bootstrap`/`bootout`, systemd
`enable`/`disable`, Windows `schtasks /create`//`/delete`) routes through one
chokepoint, `schedulerSpawn(argv)` in `src/scheduler/spawn.js`, which returns
`{status:number}` and — by design — **never throws on a nonzero exit**. The callers
(the "loader" seam) currently **discard** that status and unconditionally report
success. So when a `schtasks /create` (or `launchctl bootstrap`, etc.) *fails*,
Wienerdog still prints "scheduled" / "reloaded N jobs" and exits 0. This violates the
fail-loud principle (THREAT-MODEL **T6**: scheduled-job failures must surface, not hide;
ADR-0012's durable-alert posture).

This is not hypothetical. The first external Windows tester (Windows 11 Pro, hu-HU,
non-elevated, v0.6.4) hit it twice:

- `wienerdog sync` printed `wienerdog: reloaded 2 scheduled job(s) the OS had dropped:
  dream, catchup.` **and exited 0**, while `schtasks /query` showed the tasks did **not
  exist** — the `schtasks /create` had failed (encoding rejection), but `reloadMissing`
  pushed both names to `reloaded` regardless of exit code.
- The initial `init --fresh-vault` printed `Nightly memory (dreaming) is scheduled for
  03:30 …` although nothing registered (same root cause at first registration).

WP-074 fixes the *encoding* cause, so registration now succeeds on Windows. **This WP is
the safety net**: any future scheduler-mutation failure (encoding regression, a locked
scheduler, a permission change, an OS update that rejects the task) must be reported
truthfully, not as success. Product invariant: files-only, no daemon (ADR-0004) — this
WP adds no process; it only makes existing calls check their exit status.

**Surfacing is already half-built.** WP-070 added a read-only scheduler-load health
check: `wienerdog doctor` (live probe) and the injected digest (cached probe via
`refreshSchedulerStatus`) already surface any registered `scheduler-entry` whose OS
record is missing as an actionable WARN. So a job that *failed to load* already shows up
in doctor/digest after the fact — this WP does **not** need a new durable-alert channel;
it needs the **immediate** command output (`sync`, `init`, `adopt`, `schedule add`) to
stop lying, and `sync`'s post-heal cache refresh (already present) will then reflect the
still-missing job.

## Current state

### `src/scheduler/spawn.js` — unchanged by this WP

```js
function schedulerSpawn(argv) {
  if (process.env.WIENERDOG_LOADER_NOOP) return { status: 0 };
  if (process.env.WIENERDOG_TEST_NO_REAL_SCHEDULER) { throw new WienerdogError(/* … */); }
  const r = spawnSync(argv[0], argv.slice(1));
  return { status: r.status == null ? 1 : r.status };
}
```
The loader seams (`schedule.defaultLoader`, `generators.defaultCatchupLoader`) just call
`schedulerSpawn`. **Do not** make `schedulerSpawn` throw on nonzero — it is also the
uninstall/`bootout`//`/delete` path, where "already gone" is a benign nonzero that must
not throw. The fix is per-call-site status checking.

### Loader mutation call sites (the audit surface)

| # | File / function | current call (status discarded) | fix |
|---|---|---|---|
| 1 | `src/scheduler/status.js` `reloadMissing` | `try { loader(d.reload); reloaded.push(d.name); } catch {}` | push to `reloaded` only when `status===0`; else push to a new `failed[]` |
| 2 | `src/cli/schedule.js` `registerPlatform` (darwin) | `if (changed) loader(['launchctl','bootstrap',…])` | capture status → `loaded` |
| 3 | `src/cli/schedule.js` `registerPlatform` (linux) | `loader(['systemctl',…,'enable','--now',…])` | capture the `enable --now` status → `loaded` |
| 4 | `src/cli/schedule.js` `registerPlatform` (win32) | `if (changed) loader(['schtasks','/create',…])` | capture status → `loaded` |
| 5 | `src/cli/schedule.js` `ensureCatchup` (macOS) | `loader(['launchctl','bootstrap',…])` | return `{loaded}` |
| 6 | `src/cli/schedule.js` `ensureWindowsCatchup` | `loader(['schtasks','/create',…])` | return `{loaded}` |
| 7 | `src/scheduler/generators.js` `ensureCatchup` (run-job runtime backstop) | `loader(['launchctl','bootstrap',…])` | **out of scope for surfacing** — see notes; leave behavior unchanged |

`registerPlatform` return today: `{platform:string, changed:boolean}`.
`reloadMissing` return today: `{reloaded:string[]}`.

### Consumers of those returns

- `src/cli/sync.js` (lines 166–179): calls `repointSchedules` (→ `registerPlatform`) and
  `status.reloadMissing`. Prints `reloaded N scheduled job(s)…` when
  `heal.reloaded.length > 0`. Then `status.refreshSchedulerStatus(paths)` re-probes and
  rewrites the cache (already present).
- `src/cli/schedule.js` `add` (lines 322–330): prints
  `scheduled "<name>" … via <platform>` when `changed`.
- `src/cli/schedule.js` `repointSchedules` (lines 231–247): counts `changed`, collects
  `notices`.
- `src/cli/schedule.js` `ensureDreamSchedule` (lines 258–276): returns
  `{scheduled, at?, reason?, message?}`. `src/cli/init.js` (lines 165–173) and
  `src/cli/adopt.js` (lines 311–322) branch on `d.scheduled` / `d.reason` to print
  "Nightly … is scheduled" vs the `unsupported` fallback. Neither has a `load-failed`
  branch today.

## Deliverables (permission boundary — touch ONLY these)

| Action | Path | Notes |
|--------|------|-------|
| modify | src/scheduler/status.js | `reloadMissing` returns `{reloaded, failed}`; only `status===0` counts as reloaded |
| modify | src/cli/schedule.js | `registerPlatform` returns `{platform, changed, loaded}`; `ensureCatchup`/`ensureWindowsCatchup` return `{loaded}` and feed the aggregate; `add` fails loud; `ensureDreamSchedule` returns `reason:'load-failed'` on a load failure; `repointSchedules` notices load failures |
| modify | src/cli/sync.js | print a WARNING for `heal.failed` (never a success line); heal reporting reflects real status |
| modify | src/cli/init.js | add a `load-failed` branch to the dream-schedule report |
| modify | src/cli/adopt.js | add a `load-failed` branch to the dream-schedule report |
| modify | tests/unit/scheduler-status.test.js | `reloadMissing` splits reloaded vs failed on injected nonzero loader status |
| modify | tests/unit/scheduler-schedule.test.js | `registerPlatform`/`ensureDreamSchedule`/`add` report load failure via injected nonzero loader; success path unchanged |

### Exact contracts

**1. `reloadMissing` (status.js).** The loader returns `{status}`; honor it:

```js
/** @returns {{reloaded:string[], failed:string[]}} */
function reloadMissing(paths, opts = {}) {
  // … unchanged up to the per-entry loop …
    if (status !== 'missing') continue;
    let r;
    try { r = loader(d.reload); } catch { r = { status: 1 }; }
    if (r && r.status === 0) reloaded.push(d.name);
    else failed.push(d.name);
  }
  return { reloaded, failed };
}
```

**2. `sync.js` heal block.** Replace the success-only reporting:

```js
const heal = status.reloadMissing(paths, { loader: opts.loader });
if (heal.reloaded.length > 0) {
  console.log(`wienerdog: reloaded ${heal.reloaded.length} scheduled job(s) the OS had dropped: ${heal.reloaded.join(', ')}.`);
}
if (heal.failed.length > 0) {
  console.log(`wienerdog: WARNING — could not reload ${heal.failed.length} scheduled job(s): ${heal.failed.join(', ')}. Run 'wienerdog doctor' for details.`);
}
status.refreshSchedulerStatus(paths); // unchanged — re-probes; the digest will show the still-missing job
```
`sync` must still **exit 0** (a heal failure is a warning surfaced via doctor/digest, not
a crash — sync must never abort mid-install). Do not throw here.

**3. `registerPlatform` (schedule.js).** Return `loaded` = every mutation it performed
exited 0 (or nothing needed loading). Per branch, capture the PRIMARY registration
loader status and AND it with the catch-up ensure's `loaded`:

```js
// darwin
let loaded = true;
let changed = ensureEntry(manifest, plistPath, content, unload);
if (changed) loaded = loader(['launchctl','bootstrap',`gui/${uid}`, plistPath]).status === 0;
const cu = ensureCatchup(paths, manifest, loader, uid);       // now returns {loaded}
return { platform: 'launchd', changed, loaded: loaded && cu.loaded };

// linux — capture the `enable --now <timer>` status (the daemon-reload/linger
// calls stay best-effort; do not gate `loaded` on enable-linger)
let loaded = true;
if (changed) {
  loader(['systemctl','--user','daemon-reload']);
  loaded = loader(['systemctl','--user','enable','--now',`${unitBase}.timer`]).status === 0;
  const user = process.env.USER || process.env.LOGNAME || '';
  if (user) loader(['loginctl','enable-linger', user]);
}
return { platform: 'systemd', changed, loaded };

// win32
let loaded = true;
if (changed) loaded = loader(['schtasks','/create','/tn',taskName,'/xml',dreamXmlPath,'/f']).status === 0;
const cu = ensureWindowsCatchup(paths, manifest, loader);     // now returns {loaded}
return { platform: 'schtasks', changed, loaded: loaded && cu.loaded };
```

`ensureCatchup`/`ensureWindowsCatchup` return `{loaded:boolean}` — `true` when they did
not need to load (`ensureEntry` false), else the `status===0` of their create/bootstrap
call.

**4. `add` (schedule.js) fails loud.** After `registerPlatform`:

```js
const { platform, changed, loaded } = registerPlatform(paths, manifest, { name, hour, minute }, loader);
manifestLib.save(paths, manifest);
if (changed && !loaded) {
  throw new WienerdogError(
    `wienerdog: registered "${name}"'s schedule file but the OS scheduler (${platform}) rejected it — ` +
    `it is NOT active. Run 'wienerdog doctor' for details.`);
}
if (!changed) { /* unchanged "already scheduled" line */ }
// unchanged success line
```
(A thrown `WienerdogError` makes the CLI exit nonzero — the fail-loud the tester needed.)

**5. `ensureDreamSchedule` (schedule.js) reports a load failure.** It currently only
distinguishes `scheduled` vs `unsupported` (thrown). Add the load-failed case:

```js
let res;
try {
  res = registerPlatform(paths, manifest, { name:'dream', hour, minute }, loader, opts.platform || process.platform);
} catch (err) {
  manifestLib.save(paths, manifest);
  return { scheduled: false, reason: 'unsupported', message: err.message };
}
manifestLib.save(paths, manifest);
if (res.changed && !res.loaded) {
  return { scheduled: false, reason: 'load-failed', at };
}
return { scheduled: true, at };
```

**6. `init.js` + `adopt.js` load-failed branch.** In each dream-schedule report, add,
after the `scheduled` block and the `unsupported`/`reason` block:

```js
} else if (d.reason === 'load-failed') {
  console.log('Nightly dreaming was set up but your computer\'s scheduler did not accept it yet — run `wienerdog doctor` to see why, then `wienerdog sync` to retry.');
}
```
(Match each file's existing message voice/indentation. Do not remove the existing
`scheduled`/`unsupported` branches.)

**7. `repointSchedules` (schedule.js) notices load failures.** In its per-job loop:

```js
const res = registerPlatform(paths, manifest, { name: job.name, hour: hm.hour, minute: hm.minute }, loader);
repointed += 1;
if (res.changed) changed += 1;
if (res.changed && !res.loaded) notices.push(`"${job.name}" schedule file written but the OS scheduler did not accept it — run 'wienerdog doctor'.`);
```
`sync` already prints `r.notices`.

## Implementation notes & constraints

- **Do not change `schedulerSpawn`** (spawn.js) — it must keep returning `{status}` and
  not throw on nonzero (uninstall/`bootout`//`/delete` relies on that). All fixes are at
  the mutation call sites.
- **Site #7 (`generators.js` `ensureCatchup`, the run-job runtime backstop) is OUT OF
  SCOPE for surfacing.** It is invoked by `run-job` after a job succeeds; a failed reload
  there is already caught by the WP-070 read-only health probe (it probes the `catchup`
  manifest entry too), and threading it into run-job's output is a separate concern.
  Enumerated here for completeness; leave its behavior unchanged. If you find it trivial
  to make it return `{loaded}` without touching `run-job.js`, that is acceptable but not
  required — do **not** modify `run-job.js` under this WP.
- **`loaded` defaults `true` when nothing was loaded** (`changed===false`): the entry is
  presumed already loaded; the WP-070 live probe is the authority on whether it truly is.
  Only a `changed` registration whose loader returned nonzero is a `load-failed`.
- **Best-effort loaders are not gated.** `daemon-reload` and `enable-linger` (linux) can
  fail benignly; gate `loaded` only on the primary `enable --now`
  (systemd) / `bootstrap` (launchd) / `schtasks /create` (win32).
- **Test seams, never real scheduler.** Assert failure by injecting a loader that returns
  `{status:1}` for the create/bootstrap argv (and `{status:0}` otherwise). Never rely on
  `process.platform`; pass `platform` to `registerPlatform`/`ensureDreamSchedule`. The
  suite guard `WIENERDOG_TEST_NO_REAL_SCHEDULER` (WP-071) must stay satisfied (always use
  an injected loader or `WIENERDOG_LOADER_NOOP`).
- When uncertain, choose the simpler option and record it under "Decisions made".

## Security checklist (delete only if the WP touches no untrusted input)

- [ ] No new untrusted input. Job names still pass `windowsTaskName`/`^[a-z0-9-]$`
      validation before reaching any argv; this WP only reads exit codes and adds
      fixed-template English warnings built from those already-validated `[a-z0-9-]`
      names. No path or argv is newly constructed from user input.

## Acceptance criteria

- [ ] With an injected loader returning `{status:1}` for the reload argv,
      `reloadMissing` returns that job in `failed`, NOT in `reloaded`.
- [ ] `sync` prints a `WARNING — could not reload …` line (and no false "reloaded" line)
      for a failed heal, and still exits 0.
- [ ] With an injected loader returning `{status:1}` for `schtasks /create` (or
      `bootstrap`), `registerPlatform(...).loaded === false` and
      `ensureDreamSchedule(...)` returns `{scheduled:false, reason:'load-failed', at}`.
- [ ] `init` (and `adopt`) print the `load-failed` line — not "Nightly … is scheduled" —
      when the loader fails.
- [ ] `schedule add` throws (CLI exits nonzero) when the loader rejects the new task.
- [ ] The success path (loader status 0) prints exactly today's messages, unchanged.
- [ ] Second run with unchanged inputs is idempotent (`changed===false`, `loaded===true`,
      no warnings).

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern "status|schedule|sync|init|adopt"
npm run lint
```

## Out of scope (do NOT do these)

- The Windows XML encoding + LogonTrigger changes — **WP-074** (this WP depends on it;
  build on top of `windowsTaskXmlBytes`/the UTF-16 write in `ensureEntry`).
- The `repointCurrent` junction fix — **WP-073**.
- Making `schedulerSpawn` throw on nonzero, or changing the uninstall/`bootout`//`/delete`
  reversal path.
- Wiring `generators.js` `ensureCatchup` (site #7) failure into `run-job.js` output.
- New durable-alert channels — the WP-070 doctor/digest health surface already covers the
  after-the-fact "configured but not loaded" state; this WP fixes the immediate command
  output only.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch from frontmatter; conventional commits; PR titled
   `fix(scheduler): fail loud when a scheduler mutation is rejected (WP-075)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
