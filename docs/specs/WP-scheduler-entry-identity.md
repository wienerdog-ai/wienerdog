---
id: WP-scheduler-entry-identity
title: Verify a scheduler entry's LOADED program identity, not its presence, in the product health probe and heal
status: Draft
model: opus
size: M
depends_on: []
adrs: [ADR-0004, ADR-0018, ADR-0023, ADR-0027, ADR-0028, ADR-0031]
epic: scheduler-integrity
---

# WP-scheduler-entry-identity: identity, not presence (product side)

## Context (read this, nothing else)

Wienerdog registers its scheduled jobs with the OS-native scheduler: launchd
LaunchAgents on macOS, systemd user timers on Linux, Task Scheduler tasks on
Windows. **IRON RULE (ADR-0004): Wienerdog is just files.** There is no daemon
and no watcher — every check in this WP runs only when something asks for it
(`wienerdog doctor`, `wienerdog sync`, `wienerdog run-job`), does its work, and
exits. Nothing this WP adds may outlive its caller.

Every OS entry invokes the **independent launcher** at
`<core>/launcher/launch.js` (where `<core>` is `~/.wienerdog` by default, or
`$WIENERDOG_HOME`). The launcher is deliberately *outside* the mutable
`app/current` tree: it verifies containment, the app-release digest and the
job-descriptor digest before it spawns anything, and refuses fail-closed on any
mismatch (WP-157). That design assumes one thing it never checks: **that the OS
is actually invoking OUR launcher.**

It was not. On the maintainer's machine the `ai.wienerdog.catchup` LaunchAgent
had been firing hourly for weeks against a **deleted** launcher path inside a
long-gone test temp directory (`/var/folders/…/T/wd-negative-UezlJP/core/launcher/launch.js`).
Every fire died with `MODULE_NOT_FOUND` inside node's module loader — *before a
single line of Wienerdog code ran*, so there was no refusal, no durable alert,
no product log entry. `launchctl print` reported `runs = 76`, `last exit code = 1`.
The `.plist` file on disk was **perfectly correct** the whole time. launchd
labels are per-user-global, so a scenario-harness run that bootstrapped a
catch-up agent from its own temp core simply **overwrote the loaded record for
the real label**, leaving the real file untouched, and then deleted the temp
launcher it had just registered.

Two independent safety nets were supposed to catch exactly this class, and both
missed it, because both checked the artifact that was fine:

- The **product health probe** (`src/scheduler/status.js`) asks the OS "is this
  entry registered?" and maps *exit code 0* to `loaded`. `launchctl print`
  exits 0 for a hijacked record, so `state/scheduler-status.json` reported
  `catchup: "loaded"` throughout, and `wienerdog doctor` printed a green line.
  **This WP fixes that probe and its heal.**
- The **scenario-harness leak guard** (`tests/scenarios/scheduler-guard.js`)
  scans `~/Library/LaunchAgents` for stray *plist files* whose contents
  reference the run's temp root. A registration that clobbers an existing label
  leaves **no new file behind**, so the guard reported clean. **That half is
  owned by the sibling spec `WP-scheduler-loaded-record-tripwire`, not by this
  WP.**

On 2026-07-23 a repair session inspected the plist files, found them clean, and
recorded "catchup plist clean" — while the loaded record was already poisoned.
The product, the harness, and a human all checked the same wrong artifact.

**Timeline correction — do not go hunting for a preventer bug.** WP-161's
containment shim shipped in `249b164` on **2026-07-23**, one day *after* the
`wd-negative-UezlJP` leak occurred (2026-07-22). The leak **predates** the
shim, so WP-161 is not broken and this WP is not fixing it. What survived
WP-161 is the **stale loaded record**, which a file-scanning observer cannot see
by construction — that is the sibling spec's subject.

This is the **third recurrence** of the same class (2026-07-07, 2026-07-21,
2026-07-22). The prior fix (WP-070/WP-071 + the ADR-0018 amendment) *built* the
presence probe this WP now corrects. The invariant that closes it is one
sentence: **a scheduler entry's health is the identity of the program the OS
will actually execute, not the fact that a record exists.**

**Neither this WP nor its sibling closes the incident on its own.** This one
makes the product's own health verdict and heal honest; `WP-scheduler-loaded-record-tripwire`
makes the test harness stop creating the poisoned records in the first place and
detect stale ones. The incident class is closed only when **both** have merged.
Say exactly that in the PR body; do not claim the class is closed.

Windows already proves the pattern works: `windowsLoadedTaskMatches`
(`src/cli/schedule.js:184`, from the A7 hardening pass / ADR-0028) reads a
registered task back and compares its `<Command>`/`<Arguments>` to canonical,
force-re-registering on mismatch. This WP does not invent a mechanism; it
extends that shipping pattern to the **health probe**.

## Current state

Every claim below was read in the tree at commit `efd1489`.

**Product probe — presence only.**

- `src/scheduler/status.js:80-86` — `defaultProbe(argv)`. Returns `'unknown'`
  when `WIENERDOG_LOADER_NOOP` or `WIENERDOG_TEST_NO_REAL_SCHEDULER` is set;
  otherwise `spawnSync(argv[0], argv.slice(1), { stdio: 'ignore' })` and
  **line 85** is literally:
  ```js
  return r.status === 0 ? 'loaded' : 'missing';
  ```
  `stdio: 'ignore'` means the record's contents are discarded unread.
- `src/scheduler/status.js:101-121` — `probeAll(paths, opts)`. Iterates
  manifest `scheduler-entry` records, skips anything not lexically inside a
  scheduler root (`lexicallyInRoot`, lines 31-38), re-derives the probe argv
  from the file's **basename** via `generators.deriveProbeArgv` (never the
  stored `entry.unload` — ADR-0027), and honors a
  `WIENERDOG_SCHEDULER_PROBE` JSON name→status override map. Returns
  `Array<{name, scheduler, status}>`. It calls `probe(d.probe)` with **one**
  argument and has **no `run` seam of its own** — the gap AC-4 closes.
- `src/scheduler/status.js:131-140` — `refreshSchedulerStatus` writes
  `state/scheduler-status.json` atomically as
  `{ checked_at, entries: [{name, scheduler, status}] }`. Called from
  `src/cli/run-job.js:1236` and `src/cli/sync.js:247`. Never throws.
- `src/scheduler/status.js:159-171` — `renderSchedulerStatusLine(paths)`.
  Cache-only. Filters `status === 'missing'`, and returns one fixed-template
  callout, or `''`. `<names>` is built at **line 162** — the `missing` names are
  mapped to a double-quoted form and joined with a comma plus a space.
- `src/scheduler/status.js:181-194` — `doctorSchedulerChecks(paths, opts)`.
  LIVE probe. `loaded` → `{status:'ok'}`, `missing` → `{status:'warn'}`,
  `unknown` → no line. Consumed at `src/cli/doctor.js:404-405`;
  `doctor`'s `check()` (`src/cli/doctor.js:315-318`) already supports a third
  severity `'fail'`, which sets `process.exitCode = 1` (line 432). Executed on
  the maintainer's machine at `efd1489`, `wienerdog doctor` printed one `ok` and
  one `warn` scheduler line and **exited 0** — confirming `warn` is not a hard
  fail today.
- `src/scheduler/status.js:238-264` — `reloadMissing(paths, opts)`, the ONLY
  mutation in the module (called from `src/cli/sync.js:240`). It enumerates
  **configured** jobs from `jobs.js`, probes each job's canonical registration,
  and at **line 257** gates the heal on exactly one status:
  ```js
  if (status !== 'missing') continue;
  ```
  then delegates to `schedule.reloadJob`. The catch-up entry is excluded here
  entirely; its repair is owned by `repointSchedules` → `repairCatchup`.

**Probe argv derivation.**

- `src/scheduler/generators.js:129-143` — `deriveProbeArgv(schedulePath, platform)`.
  Infers the scheduler kind from the basename **shape** (disjoint across
  schedulers, so it is host-agnostic) and returns:
  `*.plist` → `['launchctl','print','gui/<uid>/<label>']`;
  `wienerdog-*.timer` → `['systemctl','--user','is-active','<base>.timer']`;
  `wienerdog-*.xml` → `['schtasks','/query','/tn','\Wienerdog\<name>']`.
  All regexes fully anchored. Returns `null` for an unrecognized basename or a
  uid-less darwin.

**Heal path.**

- `src/cli/schedule.js:27-29` — `launcherPathFor(paths)` returns
  `path.join(paths.core, 'launcher', 'launch.js')`. Not exported. A hand-copied
  duplicate of the same join that `generators` will now own.
- `src/cli/schedule.js:699-743` — `reloadJob(paths, job, loader, platform)`
  regenerates canonical content from validated config, byte-verifies it via
  `writeCanonicalSchedule` (refuses any non-regular / symlink target), re-checks
  in-root containment, and registers. The darwin branch (**line 714**) is:
  ```js
  return loader(['launchctl', 'bootstrap', `gui/${uid}`, plistPath]).status === 0;
  ```
  There is **no `bootout`**. `launchctl bootstrap` on a label that is already
  loaded fails — so today this heal cannot replace a hijacked record. The win32
  branch (line 739) uses `schtasks /create … /f`, which *does* force-replace;
  the linux branch (line 728) uses `systemctl --user enable --now`.
- `src/cli/schedule.js:588-640` — `repairCatchup(paths, manifest, opts)`, the
  sole owner of catch-up repair (darwin + win32 only; Linux has no separate
  catch-up registration). It gates on exactly one status at **line 607**
  (darwin) and **line 626** (win32):
  ```js
  if (!probeArgv || probe(probeArgv) !== 'missing') return {};
  ```
  and the darwin register (**line 618**) is again a bare `bootstrap`.
- `src/cli/schedule.js:287` and `src/cli/schedule.js:402` already contain the
  literal token `bootout` — they build the manifest-recorded `unload` argv
  arrays. **A bare `grep -n "bootout" src/cli/schedule.js` therefore already
  succeeds on unmodified `main`** (executed at `efd1489`: it prints lines 287
  and 402). Verification step 5 must not use it.
- `src/cli/sync.js:219-247` — ordering inside `sync`: `repointSchedules`
  (which calls `repairCatchup`) → `reloadMissing` → `refreshSchedulerStatus`.
  `sync` never sets `process.exitCode`; a failed heal prints a `WARNING` line
  and exits 0. That stays true (see "Round-2 dispositions").
- `src/scheduler/spawn.js:24-36` — `schedulerSpawn`, the single mutation
  chokepoint; returns `{status, stdout}` with `encoding:'utf8'`, and throws
  loudly under `WIENERDOG_TEST_NO_REAL_SCHEDULER`.

**The Windows precedent already in the tree.**

- `src/scheduler/generators.js:494-497` — `windowsCmdExePath(env)` →
  `path.win32.join(env.SystemRoot || env.windir || 'C:\Windows', 'System32', 'cmd.exe')`.
  This is the canonical `<Command>` every Wienerdog task is registered with.
- `src/scheduler/generators.js:622-631` — `parseWindowsTaskExec(xml)`. **It does
  NOT return a pair.** It runs two *independent* `xml.match(…)` calls — one for
  `<Command>`, one for `<Arguments>` — so on a task document with more than one
  `<Exec>` it returns Exec₁'s command alongside Exec₂'s arguments. Returns
  `null` only when there is no `<Command>` at all. This is pre-existing shipping
  behavior relied on by `windowsLoadedTaskMatches` at *register* time; this WP
  promotes the same parser into the *health verdict*, so Table B's condition (0)
  rejects any multi-`<Exec>` document before the parser is consulted. The parser
  itself is not changed.
- `src/scheduler/generators.js:516-528` — `cmdQuotedToken(s)` encodes one value
  for a double-quoted `cmd.exe` token (doubles a trailing backslash run;
  **throws** `WienerdogError` on an embedded `"`).
- `src/scheduler/generators.js:530-534` — `cmdArgToken(a)` leaves a
  `/^[A-Za-z0-9:._-]+$/` token bare and double-quotes anything else via
  `cmdQuotedToken`. Together with the throw above this is what makes the
  registered argline's double-quotes strictly paired — the property Table B's
  quote-aware split depends on.
- `src/scheduler/generators.js:556-571` — `windowsCmdArguments(o)` builds the
  registered `<Arguments>` as
  `` `/d /s /v:off /c "${[...sets, exec].join(' & ')}"` ``, where each `set` is
  `set "VAR=…"` and the final segment is
  `` `"${cmdQuotedToken(o.node)}" "${cmdQuotedToken(o.launcher)}" …` ``.
  **The `set "VAR=…"` chain embeds core paths**, so a substring test for the
  launcher token matches an argline in which the launcher is merely *mentioned*
  and never *executed*. Table B exists to prevent exactly that.
- `src/cli/schedule.js:184-195` — `windowsLoadedTaskMatches` compares a LOADED
  task's parsed Command/Arguments against canonical, and force-re-registers on
  any non-match.

**The digest surface is erased nightly (ADR-0023 class, already fixed once).**

- `src/cli/sync.js:278` passes `schedulerLine:
  require('../scheduler/status').renderSchedulerStatusLine(paths)` into
  `renderDigest`.
- `src/cli/dream.js:373-386` calls `renderDigest` with `alerts`, `updateLine`,
  `identityApprovals`, `quarantineLine`, `secretQuarantine`, `insecureModes` —
  and **no `schedulerLine`**. `src/core/digest.js:589` reads
  `opts.schedulerLine || ''`. So the scheduler callout is **wiped from
  `state/digest.md` on every nightly dream (03:30)** and restored only by an
  attended `wienerdog sync`. This is the same hole ADR-0023 already closed once
  for `quarantineLine`; the comment recording that fix is at
  `src/cli/sync.js:282-286`. This WP fixes it as a one-argument change, because
  otherwise the identity finding this WP creates would be invisible on the
  passive surface that was supposed to catch the incident.
- **Honest about latency.** `src/cli/run-job.js:1236` refreshes the cache *after*
  the job body runs, so the digest `dream` writes at 03:30 renders a cache up to
  ~24h stale (the hourly catch-up refreshes it in between). An identity finding
  therefore surfaces on the **next** night's digest. Not a defect this WP fixes —
  `doctor` is the authoritative live surface — but do not claim same-night
  visibility in the PR body.

**`state/alerts.jsonl` — what is actually true about it.**

- `src/core/alerts.js:198` — `clearAlerts(paths, job)` is
  `readAlerts(paths).filter((a) => a.job !== job)`. It is an **exact job
  match**: an alert keyed `job:'catchup'` is cleared **only** by a successful
  `catchup` run. A successful `dream` run can never clear a `catchup` alert.
- `src/cli/dream.js:378` **does** pass `alerts: readAlerts(paths)` — so
  `alerts.jsonl` records survive the nightly digest regeneration that erases
  `schedulerLine`.

## Deliverables (permission boundary — touch ONLY these)

| Action | Path | Notes |
|--------|------|-------|
| modify | src/scheduler/generators.js | add `launcherPath`, `deriveIdentityArgv`, `loadedEntryTargets` (+ export all three); no existing function's behavior changes |
| modify | src/scheduler/status.js | `defaultProbe` gains `expect` + `opts.run`; taxonomy per Table A; `probeAll` / `reloadMissing` build `expect` and forward `opts.run`; `renderSchedulerStatusLine` + `doctorSchedulerChecks` + `reloadMissing` handle the new members; pre-destructive marker refresh |
| modify | src/cli/schedule.js | `launcherPathFor` delegates to `generators.launcherPath`; new local `darwinReplaceEntry`; `reloadJob` + `repairCatchup` darwin use it; `repairCatchup` heal-gate + `expect` per Table A |
| modify | src/cli/doctor.js | comment only — the "never a hard fail" note at lines 401-403 becomes accurate for Table A. NO logic change |
| modify | src/cli/dream.js | ONE added argument at the `renderDigest` call (line ~377): `schedulerLine: require('../scheduler/status').renderSchedulerStatusLine(paths),`. Nothing else |
| modify | tests/unit/scheduler-status.test.js | ONLY the assertions named in Table D |
| create | tests/unit/scheduler-entry-identity.test.js | every test name prefixed `entry-identity:` (with a trailing space) |
| modify | docs/adr/0018-windows-scheduled-dreaming.md | **already written by the architect alongside this spec — do NOT edit it.** Listed only so `boundary-check` accepts it if the amendment rides on this branch |

**Honest file inventory.** Eight rows / eight files, at the README's `≤ 8 files`
bound, not under it. Of the eight: **one is the pre-written ADR** (zero
implementer edits), **two are tests**, **one is a comment-only edit**, and **one
is a single added object property** (`dream.js`). Genuine new non-test source is
≈150 lines across three files, well inside the `≤ ~400 lines` bound. This spec's
own `status:` flip is always allowed without listing (see `_TEMPLATE.md`) and is
**not** counted above. The harness/tripwire half of the original draft has been
split out to `WP-scheduler-loaded-record-tripwire` (4 files, no `src/` import),
which is what brought this WP back inside the bound. Do not treat any of this as
licence to widen scope.

### Exact contracts

#### `src/scheduler/generators.js` — three new exports

```js
/** Absolute path to the out-of-tree launcher every OS scheduler entry invokes
 *  (WP-157): `<core>/launcher/launch.js`. THE single source — src/cli/schedule.js's
 *  launcherPathFor now delegates here so the two can never drift.
 *  @param {import('../core/paths').WienerdogPaths} paths @returns {string} */
function launcherPath(paths)

/** Re-derive the READ-ONLY query whose STDOUT carries a registered entry's
 *  LOADED EXEC IDENTITY — what the OS will actually run, as the OS itself
 *  reports it. Basename-shape derivation, fully anchored, exactly like
 *  deriveProbeArgv (ADR-0027: never read an argv out of the manifest).
 *  `platform` selects only the basename separator flavor.
 *  Returns `{kind, argv:null}` for a RECOGNIZED scheduler kind whose identity
 *  query is DECLARED UNIMPLEMENTED (systemd today — Table B); returns `null`
 *  only for a basename this function does not recognize at all.
 *  @param {string} schedulePath @param {NodeJS.Platform} [platform]
 *  @returns {{argv:string[]|null, kind:'launchd'|'systemd'|'schtasks'}|null} */
function deriveIdentityArgv(schedulePath, platform = process.platform)

/** Decide whether a LOADED scheduler record runs OUR launcher. `stdout` is the
 *  raw output of deriveIdentityArgv().argv. Pure: parses, compares, never
 *  executes, never path-joins the parsed text, and **NEVER THROWS** — any
 *  internal throw (e.g. cmdQuotedToken on a `"` in expectLauncher) is caught and
 *  returned as 'indeterminate'.
 *  @param {string} stdout @param {'launchd'|'systemd'|'schtasks'} kind
 *  @param {string} expectLauncher  an absolute path (generators.launcherPath)
 *  @returns {'match'|'mismatch'|'indeterminate'} */
function loadedEntryTargets(stdout, kind, expectLauncher)
```

`deriveIdentityArgv` by basename shape (argv contents in Table B):

| basename shape | returns |
|---|---|
| `ai.wienerdog.<name>.plist` | `{kind:'launchd', argv:[…]}` |
| `wienerdog-<name>.timer` | `{kind:'systemd', argv:null}` — declared unimplemented |
| `wienerdog-<name>.xml` | `{kind:'schtasks', argv:[…]}` |
| anything else, or darwin without `process.getuid` | `null` |

`<name>` is `[a-z0-9][a-z0-9-]*` in all three, fully anchored — identical to
`deriveProbeArgv`. Keeping the `.timer` shape **recognized** (rather than
returning `null`) is what distinguishes "systemd, deliberately not verified" from
"a fourth scheduler someone added to `deriveProbeArgv` and forgot here"; Table A
maps the two to different statuses on purpose.

#### `src/scheduler/status.js` — probe seam and taxonomy

```js
/** @typedef {'loaded'|'missing'|'mismatched'|'unverified'|'unknown'} EntryStatus */

/** @typedef {{launcher:string, kind:'launchd'|'systemd'|'schtasks',
 *             identityArgv:string[]|null}} IdentityExpectation */

/**
 * Read-only probe. `expect` carries the identity query and the launcher this
 * install owns; it is MANDATORY — omitting it yields 'unverified', never
 * 'loaded'. There is deliberately NO presence-only mode and no default value
 * for `expect`: a probe that cannot say WHAT will run must not claim health.
 * `opts.run` is the TEST-ONLY spawn seam so the identity logic is unit-testable
 * with canned scheduler output and NEVER touches a real scheduler. No
 * production caller passes it (Table C).
 * @param {string[]} argv  the presence-probe argv (generators.deriveProbeArgv)
 * @param {IdentityExpectation|null} expect
 * @param {{run?: (argv:string[]) => {status:number|null, stdout?:string, error?:Error}}} [opts]
 * @returns {EntryStatus}
 */
function defaultProbe(argv, expect, opts = {})
```

`defaultProbe` resolves its seam first — `const run = typeof opts.run === 'function' ? opts.run : null;`
(a **`typeof` test, not `'run' in opts`**: `probeAll` forwards `{ run: opts.run }`
unconditionally, so the property is present-and-`undefined` on every production
call) — then runs in order. It never throws:

1. **`run` is null** and `WIENERDOG_LOADER_NOOP` is set → `'unknown'`.
2. **`run` is null** and `WIENERDOG_TEST_NO_REAL_SCHEDULER` is set → `'unknown'`.
3. `(run || defaultRun)(argv)`, where `defaultRun` is
   `spawnSync(a[0], a.slice(1), { encoding: 'utf8' })`. Note the change from
   `stdio:'ignore'` to captured stdout.
4. `r.error` or `r.status !== 0` → `'missing'`. (unchanged semantics)
5. `expect` is falsy, or `expect.kind` / `expect.launcher` is falsy →
   `'unverified'`. **This is the fail-CLOSED default.** It fires for a
   derivation skew (a basename `deriveProbeArgv` recognizes and
   `deriveIdentityArgv` does not) and for any caller that forgets the argument.
6. `expect.identityArgv === null` → `'unknown'`. The scheduler kind is
   recognized and its identity query is *declared* unimplemented (Table B's
   systemd row). No health is claimed, no line is printed, nothing is healed.
7. `run(expect.identityArgv)`; `r2.error` or `r2.status !== 0` or
   `typeof r2.stdout !== 'string'` → `'unverified'`.
8. `loadedEntryTargets(r2.stdout, expect.kind, expect.launcher)` →
   `'match'` → `'loaded'`; `'mismatch'` → `'mismatched'`;
   `'indeterminate'` → `'unverified'`.

**Why steps 1-2 are gated on `run` being absent.** Unconditionally, the only way
to exercise steps 3-8 is to `delete` both env vars — which also disarms
`schedulerSpawn`'s throw (`src/scheduler/spawn.js:26`) for that test body.
Gating on `run` makes the read seam itself the neutralization, so no test ever
deletes a var and the mutation backstop stays armed. Production is unaffected:
no production caller passes `opts.run`. Table C decides the rest.

On darwin `expect.identityArgv` is byte-identical to `argv`, so step 7 runs one
extra sub-millisecond read-only spawn per entry. That duplication is
**deliberate**: one uniform code path beats an aliasing special case (record it
under "Decisions made").

`probeAll` builds `expect` once per entry and **forwards the run seam** — this is
the line whose absence would reproduce the incident verbatim, so AC-4 drives it
end-to-end:

```js
const idn = generators.deriveIdentityArgv(e.path, platform);
const expect = idn ? { launcher: generators.launcherPath(paths), kind: idn.kind, identityArgv: idn.argv } : null;
const status = envMap && hasOwn(envMap, d.name) ? envMap[d.name] : probe(d.probe, expect, { run: opts.run });
```

`probeAll`'s JSDoc gains `run?:` alongside `probe?:`. An injected `opts.probe`
may ignore the extra arguments — existing tests that pass `probe: () => 'missing'`
keep working unchanged.

`reloadMissing` builds `expect` the same way (from `canonicalProbePath`, not the
manifest) and calls `probe(probeArgv, expect, { run: opts.run })`. It also
forwards `opts` unchanged to the marker refresh, so the injected `run` reaches
`probeAll` (Table C). `WIENERDOG_SCHEDULER_PROBE`'s documented value set widens
to the full five-member `EntryStatus` set — **a JSDoc edit only**: `probeAll`
(`status.js:105-116`) and `reloadMissing` (`:243-256`) parse the map and use its
values verbatim with **no validation**, and this WP adds none.

`reloadMissing`'s heal loop, per Table A:

```js
if (!HEAL_SET.has(status)) continue;          // HEAL_SET = new Set(['missing','mismatched','unverified'])
if (status !== 'missing' && !markerWritten) { // pre-destructive durable marker
  refreshSchedulerStatus(paths, opts);        // best-effort; never throws
  markerWritten = true;
}
```

**Why the marker.** A `mismatched`/`unverified` heal is the only path that can
tear down an existing record (Table E). If the process dies mid-replacement, the
durable cache must not still say `loaded` from a stale earlier refresh. Writing
it from the live probe **before the replacement call** — the canonical phrase;
use it verbatim everywhere — makes the cache pessimistic for exactly the window
in which it could be wrong; `sync`'s trailing `refreshSchedulerStatus`
(`src/cli/sync.js:247`) clears it on success. No new file and no new format —
`state/scheduler-status.json` already is the durable scheduler-health channel.

#### `src/cli/schedule.js`

```js
function launcherPathFor(paths) { return gen.launcherPath(paths); }

/** Replace a launchd registration. BOOTSTRAP FIRST — it is non-destructive and
 *  succeeds outright when nothing is loaded under the label (the `missing`
 *  case, one spawn, no teardown). ONLY when bootstrap fails (which is what
 *  launchd does for an already-loaded label) do we tear the existing record
 *  down and bootstrap again. Never boots out a record it has not first proven
 *  bootstrap-blocked, so a working-but-unverifiable entry is never destroyed by
 *  a heal that then fails. The bootout's status is ignored on purpose:
 *  correctness must not depend on which error launchd returns.
 *  @param {(argv:string[])=>{status:number}} loader
 *  @param {number} uid @param {string} label @param {string} plistPath
 *  @returns {boolean} true when the final bootstrap exited 0 */
function darwinReplaceEntry(loader, uid, label, plistPath) {
  if (loader(['launchctl', 'bootstrap', `gui/${uid}`, plistPath]).status === 0) return true;
  loader(['launchctl', 'bootout', `gui/${uid}/${label}`]);
  return loader(['launchctl', 'bootstrap', `gui/${uid}`, plistPath]).status === 0;
}
```

- `reloadJob`, darwin branch, replaces the bare bootstrap at current line 714
  with `return darwinReplaceEntry(loader, uid, label, plistPath);`.
- `repairCatchup`, darwin branch, replaces the bare bootstrap at current line 618
  with `const loaded = darwinReplaceEntry(loader, uid, 'ai.wienerdog.catchup', plistPath);`.
- `repairCatchup`'s heal gates (current lines 607 and 626) become the Table A
  heal set, and each builds `expect` exactly as `probeAll` does:
  ```js
  const idn = gen.deriveIdentityArgv(plistPath, platform);
  const expect = idn ? { launcher: gen.launcherPath(paths), kind: idn.kind, identityArgv: idn.argv } : null;
  if (!probeArgv || !HEAL_SET.has(probe(probeArgv, expect, { run: opts.run }))) return {};
  ```
  **Before the replacement call**, when the observed status is not `missing`,
  call `require('../scheduler/status').refreshSchedulerStatus(paths, opts)`
  once — the same pre-destructive marker rule as `reloadMissing`. One rule, both
  destructive sites; no special case.
- The linux and win32 register calls are unchanged (`systemctl --user enable
  --now` and `schtasks /create … /f` already replace).

**Bootstrap-first is back-compatible with the existing suite, verified at
`efd1489`:** `tests/unit/scheduler-schedule.test.js:982` asserts
`assert.deepEqual(calls, [['launchctl','bootstrap',`gui/${uid}`,plistPath]])`
with a loader returning `{status:0}` — with bootstrap-first that is still
*exactly one* call. `:365` asserts `calls[0]` is the bootstrap — still true.
`tests/unit/catchup-authorization.test.js:336-339` asserts at least one
catchup bootstrap with `probe: () => 'missing'` and a status-0 loader — still
true. Bootout-first would have broken all three. That is a second, independent
reason to prefer this order.

#### `src/cli/dream.js`

Exactly one property added to the `renderDigest` options object inside
`regenerateDigest` (currently `src/cli/dream.js:377-386`):

```js
schedulerLine: require('../scheduler/status').renderSchedulerStatusLine(paths),
```

`renderSchedulerStatusLine` is **cache-only** (it reads
`state/scheduler-status.json`; it never probes and never spawns), so the nightly
path stays read-only and ADR-0018's read/heal split is preserved: `sync` remains
the sole healer. Do not add any other argument, and do not reorder the object.

## Contract reference

The ADR-0031 activation test fires on **7 of 7**: (i) `defaultProbe`'s signature
changes; (ii) the entry-status taxonomy grows from three members to five;
(iii) new parsing of two schedulers' output formats is introduced;
(iv) indeterminate/error precedence is new and load-bearing; (v) `generators.js`
emits the identity facts while `status.js` owns their interpretation and
`schedule.js` owns the resulting mutation; (vi) doctor, the digest,
`reloadMissing`, `repairCatchup` and the sibling tripwire spec all inherit the
contract; (vii) the same facts appear in Deliverables notes, acceptance criteria
and verification greps.

Four tables below are canonical: **A** (status taxonomy), **B** (per-platform
loaded-exec identity), **C** (test seams per call site) and **E** (the darwin
replacement). **D** is not a contract — it is the closed list of existing
assertions this WP invalidates. Table C was extracted in round 3 under
ADR-0031's loop circuit-breaker after two rounds of point fixes on the same
contract family.

### Table A — entry status taxonomy (canonical)

Every fact about a status member is decided here. Prose elsewhere cites this
table; it must not restate a cell.

| Status | Means | Probe step that yields it | `doctor` severity | Digest callout | Healed by `sync`? |
|--------|-------|---------------------------|-------------------|----------------|-------------------|
| `loaded` | a record exists AND runs this install's launcher | step 8 = `match` | `ok` | none | no |
| `missing` | no record | step 4 (`error` or non-zero exit) | `warn` | template M | yes |
| `mismatched` | a record exists but runs a program that is NOT this install's launcher | step 8 = `mismatch` | **`fail`** (sets exit 1) | template F | yes |
| `unverified` | a record exists and no identity verdict could be reached: no expectation derivable for a recognized entry, or the identity query failed, or its output was indeterminate | step 5, step 7, or step 8 = `indeterminate` | `warn` | template U | yes |
| `unknown` | no verdict is attempted BY DESIGN: a neutralized test seam, or a scheduler kind whose identity query is declared unimplemented (systemd — Table B) | steps 1-2, or step 6 | omitted (no line) | none | no |

Heal set = `{missing, mismatched, unverified}` — the gate in `reloadMissing`
(current line 257) and in `repairCatchup` (current lines 607, 626).

**Naming.** The member is `mismatched`, **not** `foreign`. `foreign` already
means the opposite thing in this same subsystem — `generators.js:126` says
`deriveProbeArgv` returns "null for a foreign basename", and a foreign *basename*
means the entry is silently skipped while a foreign *record* is the loudest
failure the taxonomy has — and it is load-bearing in `src/cli/doctor.js` and
`tests/unit/scheduler-status.test.js:91`. `mismatched` maps 1:1 onto
`loadedEntryTargets`'s `'mismatch'` return and needs no `docs/GLOSSARY.md` term:
these are internal enum values whose canonical home is this table plus the
ADR-0018 amendment, and the user-facing strings below use neither word. Record
the rename under "Decisions made".

`doctor` message text (fixed templates; `<n>` is the job name, `<k>` the
scheduler kind — both code-owned, `[a-z0-9-]` only):

| Status | Message |
|---|---|
| `loaded` | `scheduled job '<n>' is loaded (<k>)` — **byte-identical to today** |
| `missing` | `scheduled job '<n>' is configured but NOT loaded in <k> — run 'wienerdog sync' to reload it` — **byte-identical to today** |
| `mismatched` | `scheduled job '<n>' is registered in <k> but runs a program OUTSIDE this Wienerdog install, so it cannot work — run 'wienerdog sync' to re-register it from this install` |
| `unverified` | `scheduled job '<n>' is registered in <k> but Wienerdog could not read back the program it runs, so it cannot confirm the entry belongs to this install — run 'wienerdog sync' to re-register it, then 'wienerdog doctor' again` |

Digest callout templates. `renderSchedulerStatusLine` returns the non-empty
templates joined by **`\n\n`** (a blank line between them), in the order
**F, U, M**, or `''` when all three buckets are empty. Pluralization selects
whole words (never per-character suffixes — the WP-068 broken-safety-message
lesson).

**Why `\n\n` and not `\n`.** Each template is one `> [!warning]` line;
consecutive `>` lines separated by a single `\n` are ONE blockquote, so Obsidian
would render F, U and M as a single merged callout whose title is F's and whose
body silently absorbs U's and M's *different* remediations. `digest.js:588-591`
joins the whole prefix block with `\n\n`, so a `\n\n`-separated string lands as
three distinct callouts. This deliberately diverges from `formatAlerts`
(`digest.js:288-309`), which joins its per-job lines with `\n` — there the merged
lines share one template and one remediation, here they do not (WP-068). The
single-bucket output is unaffected, so template M alone stays byte-identical to
today.

- **template M** — unchanged, byte-for-byte:
  `> [!warning] Wienerdog: the scheduled {job|jobs} <names> {is|are} set up but not currently active in your computer's scheduler. Run 'wienerdog sync' to reactivate {it|them}. (This can happen after some system updates.)`
- **template F** (the `mismatched` bucket):
  `> [!warning] Wienerdog: the scheduled {job|jobs} <names> {is|are} registered in your computer's scheduler but {points|point} at a program that is not part of this Wienerdog installation, so {it|they} cannot run. Run 'wienerdog sync' to re-register {it|them} from this installation.`
- **template U**:
  `> [!warning] Wienerdog: Wienerdog could not read back what your computer's scheduler will actually run for the scheduled {job|jobs} <names>, so it cannot confirm {it is|they are} still wired to this installation. Run 'wienerdog sync' to re-register {it|them}, then run 'wienerdog doctor'.`

`<names>` is the comma-joined `"name"` list, exactly as today (`status.js:162`).

### Table B — loaded exec identity, per platform (canonical)

The **authoritative artifact** for every row is the OS scheduler's own record of
what it will execute — never the schedule file on disk. That distinction is the
entire point of this WP: in the incident, the file was correct and the record
was poisoned.

**No row uses a substring test.** The launcher must be in the **execution
position** the scheduler itself reports, exactly as `args[1]` is on launchd.

| kind | `deriveIdentityArgv().argv` | Where the identity lives in stdout | `match` when | `mismatch` when | `indeterminate` when |
|---|---|---|---|---|---|
| `launchd` | `['launchctl','print','gui/<uid>/<label>']` | the block that starts at the line whose **trimmed** content is `arguments = {` and ends at the line whose trimmed content is `}`; one argument per line, trimmed | `args[1] === expectLauncher` | `args.length >= 2` and `args[1] !== expectLauncher` | no `arguments = {` line; no closing `}` line; `args.length < 2` |
| `systemd` | `null` — **identity query DECLARED UNIMPLEMENTED** (see Residual 1) | — | never | never | never — `defaultProbe` step 6 returns `unknown` before any parse, so `loadedEntryTargets` is never called with `kind:'systemd'`. If it is anyway, it returns `'indeterminate'` |
| `schtasks` | `['schtasks','/query','/tn','\Wienerdog\<name>','/xml']` | `parseWindowsTaskExec(stdout)` → `{command, arguments}` (generators.js:622), gated by condition (0) | **all six** of (0)-(d) below | (0)-(c) hold and (d) fails | `parseWindowsTaskExec` → `null`; any of (0), (a), (b), (c0), (c) fails; `cmdQuotedToken(expectLauncher)` throws |

The `schtasks` row's conditions, in order:

- **(0) the task declares exactly ONE action**:
  `(stdout.match(/<Exec\b/g) || []).length === 1`. **`parseWindowsTaskExec` does
  not return a pair** — see the corrected Current-state note — so on a
  multi-`<Exec>` task it would pair Exec₁'s `<Command>` with Exec₂'s
  `<Arguments>`, and (a)-(d) could all pass on a task whose *first* action is
  something else entirely. This condition is evaluated inside
  `loadedEntryTargets` on the raw stdout, **before** the parser is called;
  `parseWindowsTaskExec` itself is not changed (it is relied on at register time
  by `windowsLoadedTaskMatches` and is out of scope).
- **(a) the executed program is our `cmd.exe`**: `exec.command === generators.windowsCmdExePath()`.
  A task whose `<Command>` is anything else (Codex's executed proof-of-concept
  used `powershell.exe`) never runs our launcher, whatever its `<Arguments>` say.
- **(b) the canonical envelope**: `exec.arguments` matches
  `/^\/d \/s \/v:off \/c "([\s\S]*)"$/`; call capture 1 the *inner* string.
- **(c0) the chain splits, and every segment before the last is a `set`**:
  split the inner string into segments at each ` & ` that lies **outside** a
  double-quoted region (see the quote-aware split below), then require **every
  non-final segment** to match `/^set "[A-Za-z_][A-Za-z0-9_]*=[^"]*"$/`.
  Without this, a prepended command is invisible: `windowsCmdArguments` puts the
  exec **last**, so taking only the last segment accepts
  `/d /s /v:off /c "evil.exe & set "X=1" & "node" "<our launcher>" dream …"` —
  cmd.exe runs `evil.exe` first and (a)-(d) all pass. Table B's header rule is
  that the launcher must be in the **execution position the scheduler reports**;
  a chain with a foreign command ahead of it is not that position.
- **(c) the exec segment parses**: match the **last** segment against
  `/^"([^"]*)" "([^"]*)"(?: |$)/`. Capture 1 is the node path (**not compared** —
  node legitimately moves on upgrade); capture 2 is the launcher token.
- **(d) the launcher is in the launcher position**:
  `capture2 === generators.cmdQuotedToken(expectLauncher)`.

**The quote-aware split (one mechanism, two defects closed).** A naive
`inner.split(' & ')` is wrong in both directions. It is too permissive (defect
(c0) above) and too strict: `windowsCmdArguments` (`generators.js:556-571`)
joins with `' & '` and `cmdQuotedToken` (`:516-528`) does **not** escape `&`, so
a home like `C:\Users\Bob & Alice` splits a `set "HOME=…"` value mid-path — the
exec segment would still parse, but under (c0) every such install would go
`indeterminate` → `unverified` → heal set → `schtasks /create /f` on **every**
`sync`. That is the same permanent-warn-plus-churn failure this spec used to
justify declaring systemd unimplemented (Residual 1), and it would make the new
probe **strictly less precise than the shipping `windowsLoadedTaskMatches`
check** (`schedule.js:184-195`), which does exact full-argline equality and gets
`Bob & Alice` right. So split on quote structure instead, which is unambiguous
by construction: `cmdQuotedToken` **throws** on an embedded `"` and `cmdArgToken`
(`generators.js:530-534`) leaves only `[A-Za-z0-9:._-]` tokens bare, so every `"`
in a canonical inner string is a region delimiter and they are strictly paired.

- Walk the inner string, toggling an `inQuote` flag on each `"`. Split at each
  occurrence of ` & ` seen while `inQuote` is false.
- An **odd** total `"` count → `'indeterminate'` (the string is not canonical;
  fail closed rather than guess).

A `&` inside any `set "VAR=…"` value or any quoted exec argument is therefore
inside a quoted region and is never a split point, while a genuinely prepended
command (bare `evil.exe`, or the quoted `"evil.exe"`) is a real segment that
fails (c0).

**Why (0), (a), (b) and (c0) map to `indeterminate` and not `mismatch`.** No Windows host
was available to verify the round-trip of `<Command>`/`<Arguments>` through the
Task Scheduler DB (case, whitespace, encoding). A false `mismatched` would set
`doctor`'s exit code to 1 on every healthy Windows install; `unverified` is a
warn that still lands the entry in the heal set, so a genuinely hijacked task is
still re-registered — only the severity is softer. Fail-safe beats fail-loud on
an axis this spec could not verify. Residual 2 and the owner Windows-VPS
checklist cover it.

`loadedEntryTargets` **must not throw** on any input, including a
`expectLauncher` containing `"` (which makes `cmdQuotedToken` throw) — wrap and
return `'indeterminate'`. `defaultProbe` is contracted to never throw, and it
calls this function directly.

**Executed evidence for the launchd row** (real machine, macOS 26, this session,
read-only). `launchctl print gui/<uid>/ai.wienerdog.dream` exits 0 and its
`arguments` block is TAB-indented; `JSON.stringify` of the raw lines:

```text
"\targuments = {"
"\t\t/opt/homebrew/Cellar/node/25.9.0_2/bin/node"
"\t\t/Users/<u>/.wienerdog/launcher/launch.js"
"\t\tdream"
"\t\t--descriptor"
"\t\t/Users/<u>/.wienerdog/state/descriptors/dream.json"
"\t\t--expect-digest"
"\t\tsha256:5ab9a40…"
"\t}"
```

`args[1]` is the launcher. Your parser must `trim()` each line rather than match
a literal indent (markdownlint forbids hard tabs in this file, so the block is
shown escaped rather than pasted).

Also verified first-hand this session: `/bin/launchctl` exists
(`-rwxr-xr-x root:wheel`); `os.tmpdir()` is `/var/folders/…/T` while
`fs.realpathSync(os.tmpdir())` is `/private/var/folders/…/T` — **they differ on
macOS**, and the poisoned argv used the *non*-realpath form.

### Table C — test seams per call site (canonical)

Two consecutive review rounds produced the same family of finding — *an identity
expectation that is constructed but never proven constructed, and a heal seam
that is never required to be stubbed*. Per ADR-0031 that is the loop
circuit-breaker, so the seam contract is decided **here, once**, and the
acceptance criteria and mutation rows below are derived from this table rather
than patched individually. Prose elsewhere cites this table; it must not restate
a cell.

There are exactly three seams:

| Seam | What it replaces | Where the default lands if omitted |
|---|---|---|
| `opts.run` | the read-only spawn inside `defaultProbe` (**new in this WP**) | `spawnSync` → the real scheduler client, read-only |
| `opts.probe` | `defaultProbe` **wholesale** — steps 3-8, the `expect` argument and all identity logic are unreachable behind it | `status.defaultProbe` |
| `opts.loader` | the mutation call | `schedule.defaultLoader` → `schedulerSpawn` (`src/scheduler/spawn.js:24`) → a **real, per-user-global** `launchctl` / `systemctl` / `schtasks` mutation |

| Call site | `opts.run` | `opts.probe` | `opts.loader` | Can reach a mutation? |
|---|---|---|---|---|
| `defaultProbe(argv, expect, opts)` | **mandatory** — it is the only way past steps 1-2 | n/a — this *is* the probe | **not accepted** | no |
| `probeAll(paths, opts)` | **mandatory** when `opts.probe` is absent | optional; **forbidden** in AC-4 | **not accepted** | no |
| `doctorSchedulerChecks(paths, opts)` | **mandatory** when `opts.probe` is absent | optional | **not accepted** | no |
| `reloadMissing(paths, opts)` | **mandatory** when `opts.probe` is absent | optional; **forbidden** in AC-5 | **MANDATORY, unconditionally** | **yes** — `schedule.reloadJob` |
| `repairCatchup(paths, manifest, opts)` | **mandatory** when `opts.probe` is absent | optional; **forbidden** in AC-12b | **MANDATORY, unconditionally** | **yes** — `darwinReplaceEntry` / `schtasks /create /f` |

Four rules follow, and every acceptance criterion that touches a row must
satisfy them in addition to its own assertion:

- **R1 — no test in this WP deletes `WIENERDOG_LOADER_NOOP` or
  `WIENERDOG_TEST_NO_REAL_SCHEDULER`.** Injecting `opts.run` is what gets past
  `defaultProbe` steps 1-2 (see "Exact contracts"), so the deletion ritual at
  `tests/unit/scheduler-status.test.js:102-116` must **not** be copied into the
  new file. This is the whole point of the `run`-gating: with the vars intact,
  `schedulerSpawn`'s throw stays armed for every test in this WP, so a heal that
  slipped past R2 fails loudly instead of mutating the maintainer's launchd.
  Machine-checked by verification step 5's negative grep; mutation M17.
- **R2 — where `opts.loader` is MANDATORY it is a recording stub**: it pushes
  its argv onto an array and returns a canned `{status}` **without spawning**.
  The AC asserts the recorded list with `assert.deepEqual` against the exact
  expected argv sequence — never `.some(…)` / `.length > 0`, which cannot
  distinguish "the calls I expected" from "those plus others".
- **R3 — a criterion that claims to exercise `expect` construction must NOT pass
  `opts.probe`.** `opts.probe` replaces `defaultProbe` entirely, so
  `probeAll`/`reloadMissing`/`repairCatchup`'s own `expect` build is unreachable
  behind it. Dropping `const expect = null` into that call site turns nothing red
  unless at least one criterion drives it without `opts.probe` (mutations M12,
  M13, M16).
- **R4 — a mandatory seam is forwarded, not just accepted.** `reloadMissing` and
  `repairCatchup` pass their whole `opts` to `refreshSchedulerStatus` (the
  pre-destructive marker), which forwards `run` and `probe` into `probeAll`; an
  AC that asserts the marker must therefore see zero unexpected spawns.

The hazard this table removes, stated once so it is never re-derived: a temp
`paths.home` does **not** contain a scheduler mutation. It moves only the
schedule **file**; the label inside the argv
(`launchctl bootout gui/<uid>/ai.wienerdog.dream`) is per-user-global. That is
the exact mechanism of the incident this WP exists to fix, and with
`darwinReplaceEntry` it is a two-command teardown-and-replace, not a single
idempotent registration.

### Table D — existing assertions this WP DELIBERATELY updates

`tests/unit/scheduler-status.test.js` at `efd1489` **freezes the fail-open
default by back-compat constraint**: it asserts that a `defaultProbe` call with
no `expect` returns `'loaded'`. Under Table A that call now returns
`'unverified'`. AC-16's "no assertion weakened or deleted" applies to everything
*except* the two rows below. Change nothing else in that file.

| Location (`main` @ `efd1489`) | Today | Becomes | Why |
|---|---|---|---|
| `tests/unit/scheduler-status.test.js:110` | `assert.equal(status.defaultProbe([node, '-e', 'process.exit(0)']), 'loaded');` | `assert.equal(status.defaultProbe([node, '-e', 'process.exit(0)']), 'unverified');` | Table A step 5: a probe with no identity expectation must not claim health |
| `tests/unit/scheduler-status.test.js:101` (test name) | `'defaultProbe maps exit 0 → loaded, non-zero → missing, spawn error → missing'` | `'defaultProbe maps exit 0 without an expectation → unverified, non-zero → missing, spawn error → missing'` | the old name states the mapping this WP removes |

Lines 111, 112 (`process.exit(3)` → `'missing'`; unknown binary → `'missing'`)
and line 123 (neutralizer → `'unknown'`) are **unchanged**; do not touch them.

### Table E — the darwin replacement, step by step (canonical)

| Observed status | 1st `bootstrap` | `bootout` issued? | 2nd `bootstrap` | Pre-destructive marker refresh | End state on a crash mid-sequence |
|---|---|---|---|---|---|
| `missing` | succeeds (nothing loaded) | **no** | not reached | not written | n/a — no destructive step exists |
| `mismatched` | fails (label already loaded) | yes | issued | written before the replacement call | cache says `mismatched`; digest template F persists; `doctor`'s live probe reports `missing` |
| `unverified` | fails (label already loaded) | yes | issued | written before the replacement call | cache says `unverified`; digest template U persists; `doctor`'s live probe reports `missing` |
| `loaded` / `unknown` | never called | no | no | not written | n/a — not in the heal set |

### Mirrored Surface Checklist

**Table A (status taxonomy)** — surfaces that mirror it:

- [ ] Deliverables rows for `src/scheduler/status.js`, `src/cli/schedule.js`, `src/cli/doctor.js`, `src/cli/dream.js`
- [ ] "Exact contracts" → `defaultProbe` steps 5-8, `probeAll`'s `expect`, `reloadMissing`'s `HEAL_SET`, `repairCatchup`'s heal gate
- [ ] Acceptance criteria AC-3, AC-4, AC-5, AC-6, AC-7, AC-12, AC-12b
- [ ] Verification greps for `'mismatched'` / `'unverified'` in `src/scheduler/status.js`
- [ ] Current state: `status.js:85`, `status.js:159-171`, `status.js:181-194`, `status.js:257`, `schedule.js:607/626`
- [ ] Table D (the one existing assertion it invalidates)
- [ ] Table E (which statuses reach the destructive path)
- [ ] Mutation checks M3, M4, M5, M6, M7, M11, M12, M13, M14
- [ ] **`docs/adr/0018-windows-scheduled-dreaming.md` — the 2026-07-25 amendment,
      decisions 1-2** (it names the members, the fail-closed default and the
      `doctor` severities). It is both a Deliverables row and the merge gate
      (Definition of done 8), so it drifts silently unless registered here
- [ ] **`docs/specs/logbook/2026-07-25-third-scheduler-identity-incident.md`**
      (restates the member names and the heal set). Verified consistent with
      this table on 2026-07-25; **do not edit it from this WP** — if a future
      change makes it wrong, that is a logbook edit in its own pass

**Table B (per-platform identity)** — surfaces that mirror it:

- [ ] Deliverables row for `src/scheduler/generators.js`
- [ ] "Exact contracts" → `deriveIdentityArgv` / `loadedEntryTargets` signatures and the basename-shape table
- [ ] Acceptance criteria AC-1, AC-2
- [ ] Verification greps for `loadedEntryTargets` / `deriveIdentityArgv`; the darwin real-machine step 7
- [ ] Current state: `generators.js:129-143`, `:494-497`, `:516-528`, `:556-571`, `:622-631`; `schedule.js:184-195`
- [ ] Mutation checks M1, M2, M15
- [ ] Residuals 1, 2 and 7 (systemd declared-unimplemented; the unverified Windows round-trip; `parseWindowsTaskExec`)
- [ ] Definition of done item 7 (the owner Windows-VPS checklist)
- [ ] **`docs/adr/0018-windows-scheduled-dreaming.md`** — decision 1's positional
      rule and the "Scope and honesty about platforms" paragraph (systemd
      declared unimplemented, the Windows round-trip disposition)
- [ ] **`docs/specs/logbook/2026-07-25-third-scheduler-identity-incident.md`**
      (restates `argv[1]` and the Windows `<Arguments>` token). Verified
      consistent on 2026-07-25; not edited from this WP

**Table C (test seams)** — surfaces that mirror it:

- [ ] "Exact contracts" → `defaultProbe`'s seam resolution and steps 1-2, the
      `probeAll` / `reloadMissing` / `repairCatchup` forwarding snippets
- [ ] Implementation notes → "Test seams in the new tests"
- [ ] Security checklist bullet 3 (what backstops a mutation in these tests)
- [ ] Acceptance criteria AC-3, AC-4, AC-5, AC-12b, AC-14
- [ ] Verification step 5's negative grep for `delete process.env.WIENERDOG_`
- [ ] Current state: `status.js:80-86` (the neutralizer order), `spawn.js:24-36`
- [ ] Mutation checks M12, M13, M16, M17
- [ ] **`docs/adr/0018-windows-scheduled-dreaming.md`** — the 2026-07-07
      amendment's decision 2 invariant (*every scheduler mutation goes through
      `schedulerSpawn`; every scheduler test uses a seam AND is backstopped by
      the suite guard*), which the 2026-07-25 amendment's decision 3 claims to
      retain. R1 is what keeps that claim true

**Table E (the darwin replacement)** — surfaces that mirror it:

- [ ] Deliverables row for `src/cli/schedule.js`
- [ ] "Exact contracts" → `darwinReplaceEntry`, the two call sites, the marker rule
- [ ] Acceptance criteria AC-8, AC-9
- [ ] Verification grep for `darwinReplaceEntry`
- [ ] Current state: `schedule.js:714`, `:618`, `:287`, `:402`
- [ ] Implementation notes → "Why bootstrap first"
- [ ] Mutation checks M8, M9, M10
- [ ] **`docs/adr/0018-windows-scheduled-dreaming.md`** — decision 2's
      bootstrap-first ordering, its rejection of bootout-first, and the
      pre-destructive marker
- [ ] **`docs/specs/logbook/2026-07-25-third-scheduler-identity-incident.md`**
      (restates the ordering and why bootout-first was rejected). Verified
      consistent on 2026-07-25; not edited from this WP

## Implementation notes & constraints

- **No new npm deps, no build step, JSDoc not TypeScript, plain Node ≥ 18.**
  `src/` stays zero-runtime-dependency.
- **Nothing here may outlive its caller (ADR-0004).** Every added call is a
  short read-only `spawnSync` inside an already-running command.
- **Never execute an argv sourced from the manifest (ADR-0027).**
  `deriveIdentityArgv` re-derives from the basename shape with fully-anchored
  regexes, exactly like `deriveProbeArgv`. Do not read `entry.unload`.
- **Why bootstrap first (Table E).** `launchctl bootstrap` on a label that is
  already loaded fails; without a teardown, `sync` cannot replace a hijacked
  record and the `mismatched` message ("run `wienerdog sync`") would be a lie.
  But the naive fix — bootout, then bootstrap — is **crash-unsafe and destroys
  working entries**: `unverified` is in the heal set, and on Windows any
  round-trip deviation on a perfectly healthy task produces `unverified`. Under
  bootout-first, `reloadJob` would write canonical content (succeeds), tear the
  working record down, then fail to bootstrap — leaving the user with **no
  scheduled job at all**, strictly worse than the start state. Bootstrap-first is
  strictly better on every axis: `missing` needs one spawn instead of two and
  never enters a destructive path at all, and teardown happens only after
  launchd itself has proven the bootstrap is blocked.
- **Why `unverified` is healed too.** On win32 it costs nothing new:
  `ensureWindowsTaskRegistered` (schedule.js:214) already force-re-registers
  whenever `windowsLoadedTaskMatches` cannot verify, using the *same* parser. On
  darwin the replacement is bootstrap-first, so a healthy-but-unverifiable entry
  is only touched after launchd refuses the bootstrap. Only the attended
  `wienerdog sync` heals (`run-job` refreshes the cache but never heals), so the
  churn is user-initiated and bounded. Linux cannot reach `unverified` at all
  (Table B systemd row → `unknown`), which is the point of Residual 1.
- **`stdio: 'ignore'` → `encoding: 'utf8'`.** The presence spawn must now
  capture stdout. Bound nothing else: these outputs are small and
  scheduler-owned. Do not add a timeout or a size cap; do not introduce a new
  spawn helper.
- **The parsed scheduler output is untrusted text but is only ever compared.**
  It is never executed, never `path.join`ed, never written to disk.
- **Test seams in the new tests — Table C decides this; do not improvise.**
  `npm test` (`tests/run.js:7`) sets `WIENERDOG_TEST_NO_REAL_SCHEDULER` for the
  whole suite, and this WP keeps it that way: injecting `opts.run` is what gets
  past `defaultProbe` steps 1-2, so **no new test deletes an env var** (Table C
  R1) and `schedulerSpawn`'s throw stays armed throughout. `opts.loader` is
  mandatory wherever a heal is reachable (R2). Do **not** copy the
  save/`delete`/restore pattern at `tests/unit/scheduler-status.test.js:102-116`
  — it belongs to a pre-existing test that has no `run` seam, and reproducing it
  is exactly how a WP-mandated test issues a real `launchctl bootout` against the
  maintainer's launchd.
- **Do not add a new alert channel — and here is the ACTUAL reason.** An earlier
  draft rejected `state/alerts.jsonl` on the grounds that "a successful run could
  clear a still-hijacked entry". **That premise is false** — see the Current-state
  note on `clearAlerts`'s exact job match. The real reasons: (1)
  `digest.formatAlerts` (`src/core/digest.js:288-309`) renders every record
  through one code-owned template — *"the \"X\" job has failed … clears
  automatically when the job next succeeds"* — the wrong sentence for a
  scheduler-identity finding; (2) a record keyed under anything but a real job
  name is never cleared by anything, so it would need a new lifecycle owner;
  (3) `state/scheduler-status.json` + the digest callout is already the durable
  channel WP-070 built for this class. `alerts.jsonl`'s one genuine advantage —
  surviving the nightly digest rewrite that drops `schedulerLine` — is closed by
  this WP's `dream.js` deliverable. Record this under "Decisions made" **with the
  corrected reasoning**, not the old one.
- **Out-of-scope adjacency you WILL notice.** `appTreeDigestOf`
  (`src/scheduler/descriptor.js:48`, mirrored at `src/scheduler/launcher.js:125`)
  hashes every regular file under the app root with no exclusion list. Do not
  touch it and do not report it: on a prod tree, hashing a planted `.git` is
  exactly what pins it. The narrower dev-side problem belongs to
  **WP-dev-descriptor-no-tree-hash**. Likewise `verifyCatchup`
  (`src/scheduler/launcher.js:352`) has no dev early-return — WP-157's **shipped
  disposition**, reaffirmed after a 2026-07-25 rejection (ADR-0028's 2026-07-25
  amendment, still `Proposed`). Do not re-propose either, and do not file them as
  Discovered issues. Note anything **else** you find there; do not fix it.
- **Ambiguity → choose the simpler option** and record it under "Decisions
  made" in the PR body. Do NOT expand scope to resolve ambiguity.

### Round-2 review dispositions (things deliberately NOT done)

Recorded here so a reviewer sees an argued decision rather than a silent drop.

1. **`sync` still exits 0 when a heal fails.** Making `wienerdog sync` return a
   non-zero exit code would need `src/cli/sync.js` in Deliverables (a 9th file,
   over the README bound) and changes a CLI's exit contract that scripts may
   depend on. The failure is already surfaced three ways: `sync` prints
   `WARNING — could not reload N scheduled job(s)` (`src/cli/sync.js:245`), the
   durable cache retains `mismatched`/`unverified`/`missing` so the digest
   template persists, and `wienerdog doctor` **does** exit 1 for `mismatched`
   (Table A). If the owner wants `sync` to fail loudly too, that is a one-line
   follow-up WP — see Residual 5.
2. **No post-replacement re-probe.** `reloadJob` byte-verifies the canonical
   content via `writeCanonicalSchedule` *before* registering and `bootstrap`
   loads that exact file, so a successful bootstrap implies the loaded identity
   by construction; a failed one already becomes `heal.failed` → the `sync`
   WARNING. A re-probe would add a spawn per healed job and change
   `repairCatchup`'s notice strings, breaking assertions in
   `tests/unit/catchup-authorization.test.js` (not in Deliverables) for no new
   information. The crash window is covered by the pre-destructive marker
   (Table E).
3. **No `docs/GLOSSARY.md` entry.** Resolved by renaming `foreign` →
   `mismatched` instead, which removes the collision that motivated the entry.
   See the "Naming" note under Table A.

### Residuals (state them; do not paper over them)

1. **systemd identity is declared unimplemented, not merely unverified
   (2026-07-25).** The exact output shape of
   `systemctl --user show <unit>.service --property=ExecStart` could not be
   confirmed on a real Linux host while this spec was written. Had it been
   *specified* anyway, a wrong parse would give **every Linux install**
   `unverified` on every entry → a permanent `doctor` warn, digest template U
   forever, and a bootout-and-re-register of both units on **every** `sync` —
   which is not idempotent in the sense CLAUDE.md requires. So Table B's systemd
   row returns `argv:null` and `defaultProbe` step 6 yields `unknown`: no line,
   no callout, no heal, no churn. Linux keeps full `missing` detection and
   healing (step 4 precedes identity). The cost is the green
   `scheduled job 'dream' is loaded (systemd)` doctor line, which disappears on
   Linux. Owner: architect. Follow-up: capture the real
   `--property=ExecStart` output on a Linux host, then implement the row.
2. **`schtasks /query /xml` round-trip and encoding are specified, not
   verified.** Windows may emit UTF-16 to a redirected handle; `schedulerSpawn`
   decodes as UTF-8 and `windowsLoadedTaskMatches` already lives with that. Per
   Table B, any deviation in `<Command>` or the argline envelope yields
   `indeterminate` → `unverified` → a re-register on the next `sync`, which is
   exactly today's behavior for the same parser. Confirm on the owner Windows
   VPS checklist (Definition of done item 7).
3. **A crash between `bootout` and the second `bootstrap`** leaves no loaded
   record. The window is two adjacent synchronous spawns, reached only after
   launchd has already refused the bootstrap. The pre-destructive marker
   (Table E) makes the durable cache pessimistic for exactly that window, and
   `run-job`'s hourly `refreshSchedulerStatus` (`src/cli/run-job.js:1236`) plus
   `doctor`'s live probe both detect it afterwards.
4. **`noticeIfCatchupMissing` is a THIRD wrong-artifact check and is NOT fixed
   here.** `src/cli/run-job.js:1043-1055`, called at `:984` after every
   successful job, decides catch-up health with `fs.accessSync(<plist path>)` —
   file existence, the same blind spot in a third location. It would have printed
   nothing across all 76 fires of the incident. It is **out of scope** for this
   WP: it is a best-effort stderr notice (non-durable, unattended, no exit code),
   strictly weaker than the `doctor` + digest + `scheduler-status.json` surfaces
   this WP fixes, and `run-job.js` is a large file whose inclusion would push
   this WP over the size bound again. Owner: architect. Follow-up: a small WP
   replacing the `accessSync` with the same identity probe, proposed slug
   `WP-catchup-notice-identity`.
5. **`wienerdog sync` exit code on a failed heal** — see Round-2 disposition 1.
   Owner: Gyula (it is a CLI contract change).
6. **A same-user actor who controls the OS scheduler is out of scope** (A7/A12
   territory, ADR-0028): this WP detects and repairs accidental and stale
   hijacks, not an adversary who re-poisons the record after every check. Note
   this residual does **not** cover Table B's conditions (0) and (c0): an
   accidentally-inherited legacy argline or a multi-action task left by an older
   Wienerdog is not an adversary, so those two are closed in code rather than
   deferred here.
7. **`parseWindowsTaskExec` still pairs independently.** It runs two separate
   `xml.match(…)` calls (`generators.js:622-631`), so on a multi-`<Exec>`
   document it mixes Exec₁'s `<Command>` with Exec₂'s `<Arguments>`. This WP
   fences the *health verdict* off from that with Table B condition (0) rather
   than changing the parser, because the parser also backs
   `windowsLoadedTaskMatches` at register time and is outside this WP's
   Deliverables note ("no existing function's behavior changes"). The register-
   time path therefore keeps the pre-existing ambiguity. Owner: architect.
   Follow-up: make `parseWindowsTaskExec` extract a single `<Exec>` element and
   pair within it, proposed slug `WP-windows-task-exec-pairing`.

## Security checklist

- [ ] `deriveIdentityArgv`'s three basename regexes are fully anchored
      (`^…$`, no `m` flag) and use the same `[a-z0-9][a-z0-9-]*` name charset as
      `deriveProbeArgv`, so `/`, `\`, `..`, spaces and quotes in a poisoned
      filename can never reach a derived argv.
- [ ] `loadedEntryTargets` treats its `stdout` argument as untrusted display
      text: string comparison only. No `path.join`, no `require`, no `fs` call,
      no spawn takes any value parsed out of it. It never throws.
- [ ] The new `launchctl bootout` argv is built only from `process.getuid()` and
      a code-derived label, and it goes through the existing `loader` seam →
      `schedulerSpawn`. The ADR-0018 (2026-07-07) decision-2 invariant is
      **preserved, not suspended**: because `defaultProbe`'s neutralizer steps
      are gated on `opts.run` being absent, no test in this WP deletes
      `WIENERDOG_TEST_NO_REAL_SCHEDULER`, so `schedulerSpawn` still throws on any
      mutation reached without an injected `opts.loader` (Table C R1). The
      first-line defence remains the mandatory `opts.loader` (Table C R2); the
      suite guard is the backstop behind it, and this WP keeps it armed.
- [ ] `renderSchedulerStatusLine`'s inputs stay code-owned: the names come from
      `state/scheduler-status.json`, which `refreshSchedulerStatus` writes from
      `describeEntry` (code-derived `[a-z0-9-]` job names), so the new templates
      F and U inject no untrusted bytes into the digest — the same rule
      `formatAlerts` follows.

## Acceptance criteria

**Preamble — read before writing a single test.** A test that passes against
unmodified `main` is **not evidence**. Every assertion below must be red before
the corresponding change and green after; the Mutation checks table makes that
literal. Two prior WPs in this area shipped a verification harness that shared
the spec's blind spot and reported the class closed when only an instance was.
For each new assertion, state in a comment **which artifact it reads** and **why
that artifact is the authoritative one**. For everything in this WP the
authoritative artifact is the OS scheduler's own record of what it will execute;
the schedule file on disk is not, and no assertion here may read one.

- [ ] **AC-1** `loadedEntryTargets` returns `match` / `mismatch` /
      `indeterminate` per Table B for `launchd` and `schtasks`, driven by canned
      stdout fixtures — no OS scheduler is invoked. The `schtasks` fixtures MUST
      include, each asserted separately and none returning `match`:
      (i) the executed hijack shape — `<Command>` = a PowerShell path, the
      expected launcher present *inside* the `set "VAR=…"` chain of
      `<Arguments>`, a different launcher in the exec segment;
      (ii) **the prepended-command shape** (Table B condition (c0)) — a
      canonical `<Command>`, a canonical envelope, our launcher in the final
      exec segment, and a **non-`set` first segment** (`evil.exe` and, as a
      second fixture, `"evil.exe"`) → `indeterminate`;
      (iii) **two `<Exec>` elements** (Table B condition (0)) where Exec₁ is a
      foreign command and Exec₂ is our canonical action → `indeterminate`;
      (iv) an **odd** double-quote count in the inner string → `indeterminate`.
      It must also assert the two shapes that MUST still be `match`:
      (v) a launcher path containing ` & ` (e.g. `C:\Users\Bob & Alice\...`) and
      a `set "HOME=…"` value containing ` & ` — the quote-aware split's whole
      purpose, and the case the shipping `windowsLoadedTaskMatches` already gets
      right; and (vi) a node path that differs from ours (node moves on upgrade).
      Also assert `loadedEntryTargets` does not throw when `expectLauncher`
      contains `"`.
- [ ] **AC-2** `deriveIdentityArgv` returns the Table B shape for each basename:
      `{kind:'launchd', argv:[…]}`, `{kind:'systemd', argv:null}`,
      `{kind:'schtasks', argv:[…]}`, and `null` for an unrecognized basename.
- [ ] **AC-3** `defaultProbe` returns, all through an injected `opts.run` and
      with **no env var deleted** (Table C R1): `mismatched` for an exit-0 record
      whose loaded argv names a launcher outside this core; `unverified` when the
      identity query fails, when its output is indeterminate, **and when `expect`
      is omitted entirely**; `unknown` when `expect.identityArgv` is `null`;
      `loaded` on a match; `missing` on a non-zero presence exit. Assert
      separately that with **no** `opts.run` and `WIENERDOG_LOADER_NOOP` set the
      result is `unknown`, and likewise for `WIENERDOG_TEST_NO_REAL_SCHEDULER`
      (which `npm test` already sets) — this is the pair of assertions that pins
      the seam-gating in "Exact contracts", so it must show that the *same* input
      returns `unknown` without `run` and a real verdict with it.
- [ ] **AC-4** *(the incident regression)* `probeAll` end-to-end, **`opts.probe`
      forbidden** (Table C): a temp core + manifest carrying an
      `ai.wienerdog.dream.plist` scheduler-entry inside **the LaunchAgents root
      of the test's own `paths.home`** — i.e.
      `generators.launchAgentsDir(paths.home)`, **not** the real
      `~/Library/LaunchAgents`. `probeAll` gates every entry on
      `lexicallyInRoot(e.path, schedulerRoots(paths), platform)` and
      `schedulerRoots` (`status.js:17-23`) derives the launchd root from
      `paths.home`, so an entry under the real LaunchAgents dir is out of root,
      is skipped, and `probeAll` returns `[]` — an assertion against `[0]` would
      then throw and one against an empty array would pass vacuously. The entry
      **file need not exist**: `lexicallyInRoot` is lexical by design (see its
      JSDoc), so only the manifest record is required. `opts.run` returns exit 0
      for the presence argv and a canned `launchctl print` stdout for the
      identity argv. Assert `probeAll(…).length === 1` **first**, then that the
      single entry is `mismatched` when the canned `arguments` block's second
      entry is a temp-dir launcher, and `loaded` when it is
      `generators.launcherPath(paths)`.
- [ ] **AC-5** *(same gap, heal side)* `reloadMissing` end-to-end, **`opts.probe`
      forbidden**, `opts.run` injected the same way and `opts.loader` a recording
      stub (Table C R2 — mandatory here, because this criterion drives the heal).
      Two separately-named tests:
      **AC-5a** a configured job whose canned identity output names a foreign
      launcher IS healed — `assert.deepEqual` on the recorded loader argv list
      against the exact expected sequence;
      **AC-5b** *(the negative)* the same setup with the canned output naming
      `generators.launcherPath(paths)` heals **nothing** — the recorded loader
      argv list is `[]` and `reloaded`/`failed` are both empty.
- [ ] **AC-6** `doctorSchedulerChecks` maps the five members to the Table A
      severities (`mismatched` → `fail`), and the `loaded` / `missing` message
      strings are byte-identical to today's.
- [ ] **AC-7** `renderSchedulerStatusLine` emits templates F, U and M in that
      order, each only when its bucket is non-empty, `''` when all are empty,
      and its single-`missing` output is byte-identical to today's.
- [ ] **AC-8** `reloadJob` (darwin) issues `launchctl bootstrap` **first**; with
      a loader returning `{status:0}` it issues **exactly one** call and **no
      `bootout`**; with a loader returning non-zero for the first bootstrap it
      issues `bootstrap`, `bootout gui/<uid>/<label>`, `bootstrap` in that order
      and returns the second bootstrap's status. Asserted on a recorded injected-loader
      argv list. Same for `repairCatchup` (darwin).
- [ ] **AC-9** `reloadMissing` refreshes `state/scheduler-status.json` **before
      the replacement call** (observed status not `missing`) and does **not**
      write it when every healed entry was `missing`. Assert on the file's
      `checked_at`/`entries` contents captured by the mandatory recording
      `opts.loader` (Table C R2) at its first call.
- [ ] **AC-10** `schedule.launcherPathFor` and `generators.launcherPath` return
      the identical string for the same `paths` — the drift-prevention that is
      the whole purpose of the delegation.
- [ ] **AC-11** `src/cli/dream.js` passes `schedulerLine` into `renderDigest`,
      and so does `src/cli/sync.js`. This is a **structural** check, not a
      behavioral one: `regenerateDigest` is a closure inside the dream flow that
      needs a real `claude` login to reach end-to-end, so no affordable
      executable regression exists (unlike the sync-side equivalent at
      `tests/unit/sync-digest-quarantine.test.js`). Verified by verification
      step 5's per-file conditional grep and gated by mutation M14.
- [ ] **AC-12** *(the gate)* `repairCatchup`'s heal gate uses the Table A heal
      set on both the darwin and win32 branches: with `opts.probe` returning each
      member in turn and `opts.loader` a recording stub (Table C R2 — mandatory
      even here, because a repair fires), it repairs on `missing`, `mismatched`
      and `unverified`, and returns `{}` with an **empty** recorded loader argv
      list on `loaded` and `unknown`.
- [ ] **AC-12b** *(the `expect` construction, modelled on AC-5)* `repairCatchup`
      driven with **no `opts.probe`** (Table C), `opts.run` injected and
      `opts.loader` a recording stub. Two separately-named tests:
      **AC-12b-i** a canned poisoned `arguments` block (second entry = a temp-dir
      launcher) produces a repair — `assert.deepEqual` on the recorded loader
      argv list; **AC-12b-ii** a canned block naming
      `generators.launcherPath(paths)` produces `{}` and an **empty** recorded
      loader argv list. Without this criterion, dropping `const expect = null`
      into `src/cli/schedule.js:607`/`:626` turns nothing red — and the catch-up
      entry is the exact one that was hijacked 76 times.
- [ ] **AC-13** Every new test name is prefixed `entry-identity:` (with a
      trailing space), and the non-vacuity gate in verification step 1 reports at
      least 18 **named** passing subtests. (Raised from 15: AC-5 and AC-12b are
      each two named tests, and AC-1 gained fixtures.)
- [ ] **AC-14** *(Table C, mechanically checked)* No test in this WP spawns a
      real scheduler client. Two conditions, both greppable by verification
      step 5: (i) the file contains **no** `delete process.env.WIENERDOG_…`
      (R1 — the neutralizers stay set, so `schedulerSpawn`'s throw stays armed);
      (ii) every `reloadMissing(` and `repairCatchup(` call in the file passes
      `loader:` (R2). Plus, by construction, every call that reaches
      `defaultProbe` steps 3-8 passes `opts.run`.
- [ ] **AC-15** *(the heal gate excludes a healthy entry)* with `opts.probe`
      reporting `loaded` for every job, `reloadMissing` issues **zero** loader
      calls (recorded argv list is `[]`). This is a gate assertion, **not** an
      idempotence proof: it never runs `wienerdog sync`, and the second-run
      behaviour of the real CLI is not exercised anywhere in this WP.
- [ ] **AC-16** `npm test` and `npm run lint` pass; the existing
      `scheduler-status`, `scheduler-generators`, `scheduler-schedule`,
      `catchup-authorization` and `scheduler-leak-guard` suites stay green with
      no assertion weakened or deleted **except the two rows in Table D**.
      (`scheduler-leak-guard` is also the sibling WP's file. Its subtest count —
      22 on `main`, and 30+ once the sibling merges — appears only as prose
      evidence for verification step 1's discrimination proof, never as a
      threshold, so merge order between the two WPs does not matter here.)

### Mutation checks (one-line source mutation → the test that must turn red)

Apply each mutation on top of your finished branch, run the named command,
confirm it **fails**, then revert. Paste the resulting table into the PR.

| # | Mutation | Must turn red |
|---|----------|---------------|
| M1 | `loadedEntryTargets` launchd branch: `return 'match';` unconditionally | `entry-identity: launchd mismatch when arguments[1] is not this install's launcher` |
| M2 | `loadedEntryTargets` schtasks branch: replace conditions (a)-(d) with `arguments.includes('"' + cmdQuotedToken(expectLauncher) + '"')` | `entry-identity: schtasks does NOT match a task whose Command is not our cmd.exe and whose launcher token is only inside the set-chain` |
| M3 | `defaultProbe`: `return 'loaded'` right after the presence spawn exits 0 (skip steps 5-8) | `entry-identity: defaultProbe returns mismatched for an exit-0 record naming a foreign launcher` |
| M4 | `defaultProbe` step 5: `return 'loaded'` instead of `'unverified'` when `expect` is falsy | `entry-identity: defaultProbe with NO expectation returns unverified, never loaded` |
| M5 | `defaultProbe` step 6: `return 'loaded'` instead of `'unknown'` for `identityArgv === null` | `entry-identity: a systemd entry yields unknown, not a health claim` |
| M6 | `doctorSchedulerChecks`: emit `'warn'` instead of `'fail'` for `mismatched` | `entry-identity: doctorSchedulerChecks maps mismatched to fail` |
| M7 | `reloadMissing`: drop `'unverified'` from `HEAL_SET` | `entry-identity: reloadMissing heals an unverified entry` |
| M8 | `reloadJob` darwin: swap `darwinReplaceEntry` back to a bare `bootstrap` | `entry-identity: reloadJob replaces a bootstrap-blocked label (darwin)` |
| M9 | `darwinReplaceEntry`: issue the `bootout` unconditionally, before the first bootstrap | `entry-identity: reloadJob issues NO bootout when the first bootstrap succeeds` |
| M10 | `reloadMissing`: delete the pre-destructive `refreshSchedulerStatus` call | `entry-identity: reloadMissing writes the durable marker before a destructive replacement` |
| M11 | `renderSchedulerStatusLine`: drop the `mismatched` bucket | `entry-identity: digest emits template F for a mismatched entry` |
| M12 | `probeAll`: `const expect = null;` | `entry-identity: probeAll reports mismatched end-to-end for a poisoned loaded record` |
| M13 | `reloadMissing`: pass `null` as the probe's `expect` argument | `entry-identity: reloadMissing heals NOTHING when the loaded record names this install's launcher (no opts.probe)` (AC-5b) |
| M14 | `src/cli/dream.js`: delete the `schedulerLine` property | verification step 5's dream.js conditional grep exits 1 |
| M15 | `launcherPathFor`: restore the hand-written `path.join(paths.core, 'launcher', 'launch.js')` **and** change `generators.launcherPath` to join `'launch.mjs'` | `entry-identity: launcherPathFor delegates to generators.launcherPath (no drift)` |
| M16 | `repairCatchup`: `const expect = null;` on both branches | `entry-identity: repairCatchup repairs NOTHING when the loaded catchup record names this install's launcher (no opts.probe)` (AC-12b-ii) |
| M17 | in the new test file, add `delete process.env.WIENERDOG_TEST_NO_REAL_SCHEDULER;` at the top of any test | verification step 5's negative grep exits 1 |

**Why M13 and M16 name the NEGATIVE test.** Passing `null` as `expect` makes
every entry with a record `unverified`, and `unverified ∈ HEAL_SET` (Table A) —
so the entry is **still healed**. A test asserting "a heal happened" stays green
under the mutation and reports a false pass. Only the assertion that a
*matching* record is left alone reddens. This is why AC-5 and AC-12b are each
split into two separately-named tests rather than one test with two assertions.

## Verification steps (run these; paste output in the PR)

```bash
# 1. The new suite, with a MACHINE-CHECKED non-vacuity gate.
#
#    RUN IT THROUGH `npm test`, NOT `node --test`. Only tests/run.js:7 sets
#    WIENERDOG_TEST_NO_REAL_SCHEDULER, and that is the backstop that makes
#    schedulerSpawn THROW instead of mutating the real per-user scheduler.
#    Executed at efd1489: a child under `node --test <file>` sees
#    WIENERDOG_TEST_NO_REAL_SCHEDULER=undefined; under `npm test` it sees "1".
#    tests/run.js forwards argv, so the flags below reach `node --test` intact.
#
#    A bare `--test-name-pattern` that matches nothing exits 0 with "pass 1",
#    because the FILE wrapper counts as a passing test — executed on this runner
#    at efd1489 against tests/unit/scheduler-status.test.js with the pattern
#    "zzz-definitely-nonexistent-pattern-42": exit 0, "ℹ pass 1". So count NAMED
#    subtest records in the TAP stream instead. Executed evidence for the gate
#    itself, same runner, same commit, against the existing guard suite:
#      pattern "scheduler-leak-guard" → 22 named subtests
#      pattern "zzz-nope"             → 0 named subtests
n=$(npm test --silent -- --test-reporter=tap --test-name-pattern "entry-identity" \
      tests/unit/scheduler-entry-identity.test.js \
      | grep -E "^ok [0-9]+ - entry-identity: " | wc -l | tr -d ' ')
echo "named passing subtests: $n"
[ "$n" -ge 18 ] || { echo "VACUOUS OR INCOMPLETE — the pattern selected $n named subtests"; exit 1; }

# 2. The touched existing suite, same gate (Table D changes two of its records).
#    The grep is ANCHORED ON THE SELECTED NAMES, not on a bare "^ok N - ".
#    Executed at efd1489 on `main`: the unanchored form returns 1 even for the
#    bogus pattern "zzz-nope" (it matches the file wrapper) — i.e. it is the very
#    vacuity the step-1 comment warns about. The anchored form below returns 0
#    for "zzz-nope" and 13 for the real pattern.
n=$(npm test --silent -- --test-reporter=tap \
      --test-name-pattern "defaultProbe|probeAll|reloadMissing|doctorSchedulerChecks" \
      tests/unit/scheduler-status.test.js \
      | grep -E "^ok [0-9]+ - (defaultProbe|probeAll|reloadMissing|doctorSchedulerChecks)" \
      | wc -l | tr -d ' ')
echo "named passing subtests: $n"
[ "$n" -ge 8 ] || { echo "VACUOUS OR INCOMPLETE — selected $n named subtests"; exit 1; }

# 3. No regression anywhere, including the golden files.
npm test

# 4. Lint pipeline (markdownlint + shellcheck + shfmt + frontmatter schema).
npm run lint

# 5. Structural greps, each ASSERTED. Plain `grep -n` only — never `grep -c`,
#    which exits 1 on a zero count and has silently "passed" in this repo before.
#    Each target below is absent on unmodified `main`, so each conditional is
#    genuinely discriminating (`darwinReplaceEntry` verified absent at efd1489,
#    exit 1). Note that a bare `grep -n "bootout" src/cli/schedule.js` is NOT a
#    valid check: it already matches lines 287 and 402 on `main` (the `unload`
#    argv arrays) — executed and confirmed.
for pat in loadedEntryTargets deriveIdentityArgv launcherPath; do
  grep -n "$pat" src/scheduler/generators.js || { echo "MISSING: $pat in generators.js"; exit 1; }
done
for pat in "'mismatched'" "'unverified'" "opts.run"; do
  grep -n "$pat" src/scheduler/status.js || { echo "MISSING: $pat in status.js"; exit 1; }
done
grep -n "darwinReplaceEntry" src/cli/schedule.js || { echo "MISSING: darwinReplaceEntry"; exit 1; }
grep -n "schedulerLine" src/cli/dream.js || { echo "MISSING: schedulerLine in dream.js"; exit 1; }
grep -n "schedulerLine" src/cli/sync.js  || { echo "MISSING: schedulerLine in sync.js"; exit 1; }

# 5b. Table C R1, MECHANICALLY CHECKED (AC-14(i)). No test in this WP may delete
#     a neutralizer env var: doing so disarms schedulerSpawn's throw for that
#     test body, and a heal reached without opts.loader then issues a REAL
#     `launchctl bootout` + `bootstrap` against the per-user-global label. Must
#     exit 1 while any such line is present (mutation M17).
if grep -nE "delete[[:space:]]+process\.env\.WIENERDOG_(LOADER_NOOP|TEST_NO_REAL_SCHEDULER)" \
     tests/unit/scheduler-entry-identity.test.js; then
  echo "FAIL: a test deletes a neutralizer env var — see Table C R1"; exit 1
else
  echo "OK: the suite guard stays armed for every test in this WP"
fi

# 5c. Table C R2, MECHANICALLY CHECKED (AC-14(ii)). Every reloadMissing /
#     repairCatchup call in the new suite must inject a loader. Counts the call
#     sites and the `loader:` keys and requires the latter to be at least the
#     former; a bare `grep -n` on each keeps the zero-count exit-1 hazard away.
calls=$(grep -cE "(reloadMissing|repairCatchup)\(" tests/unit/scheduler-entry-identity.test.js || true)
loaders=$(grep -cE "loader:" tests/unit/scheduler-entry-identity.test.js || true)
echo "mutating call sites: $calls   loader: keys: $loaders"
[ "$loaders" -ge "$calls" ] || { echo "FAIL: a mutating call site has no injected loader — Table C R2"; exit 1; }

# 6. NEGATIVE grep: the presence-only mapping must be GONE. This must exit 1
#    when the old line is still present. Executed against `main` at efd1489 it
#    printed "85:  return r.status === 0 ? 'loaded' : 'missing';" followed by
#    "FAIL: the presence-only status mapping is still present" — i.e. it
#    discriminates. (The old form, `grep … || echo OK`, exited 0 either way.)
if grep -n "return r.status === 0 ? 'loaded' : 'missing';" src/scheduler/status.js; then
  echo "FAIL: the presence-only status mapping is still present"; exit 1
else
  echo "OK: the presence-only status mapping is gone"
fi

# 7. Real-machine discrimination — macOS only, READ-ONLY, no mutation.
#    ASSERTS (does not merely print). Core is derived from getPaths(), not from
#    $HOME, so a dev-stance or $WIENERDOG_HOME-redirected install is not a false
#    alarm by construction. Uses the 'dream' label because it is the one verified
#    loaded on the maintainer's machine at efd1489 (catchup currently reports
#    warn/NOT loaded — that is a real finding, not a test failure).
#    Skip on non-darwin and say so in the PR.
node -e '
const assert = require("node:assert");
const { spawnSync } = require("node:child_process");
const g = require("./src/scheduler/generators");
const { getPaths } = require("./src/core/paths");
const paths = getPaths(process.env);
const label = "ai.wienerdog.dream";
const r = spawnSync("/bin/launchctl", ["print", `gui/${process.getuid()}/${label}`], { encoding: "utf8" });
assert.equal(r.status, 0, `launchctl print ${label} exited ${r.status} — is it loaded?`);
const mine = g.launcherPath(paths);
assert.equal(g.loadedEntryTargets(r.stdout, "launchd", mine), "match", `expected match for ${mine}`);
assert.equal(g.loadedEntryTargets(r.stdout, "launchd", "/var/folders/x/T/wd-gone/core/launcher/launch.js"), "mismatch");
assert.equal(g.loadedEntryTargets("no arguments block here", "launchd", mine), "indeterminate");
console.log("OK: positive=match, negative=mismatch, truncated=indeterminate; launcher =", mine);
'

# 8. Real-machine doctor — macOS only, READ-ONLY. Preserves doctor's OWN exit
#    status (the old form reported grep's status instead). A `mismatched` or
#    `unverified` line here is a real finding, not a test failure. Paste the
#    scheduler lines AND the exit code. Executed against `main` at efd1489 this
#    printed one [ok] dream line, one [warn] catchup line, and "doctor exit=0".
out=$(node bin/wienerdog.js doctor 2>&1); rc=$?
printf '%s\n' "$out" | grep -n "scheduled job" || echo "(no scheduler lines)"
echo "doctor exit=$rc"
```

The scenario harnesses (`WIENERDOG_RUN_SCENARIOS`) consume quota and need a real
`claude` login; do NOT run them for this WP. They are the sibling spec's subject.

## Out of scope (do NOT do these)

- **Everything in `WP-scheduler-loaded-record-tripwire`** — the scenario-harness
  loaded-record observer (`tests/scenarios/scheduler-guard.js`,
  `tests/unit/scheduler-leak-guard.test.js`, and the two harness call sites).
  Do not touch those four files. **Neither WP closes the incident alone.**
- **The live repair of the maintainer's hijacked `ai.wienerdog.catchup`.**
  Already done by hand before this spec was written. Do not script it, do not
  re-run it. (`doctor` currently reports `catchup` as not loaded; leave it.)
- **`src/cli/run-job.js`'s `noticeIfCatchupMissing`** (Residual 4) — the third
  wrong-artifact check. Named, owned, and deliberately not fixed here.
- **`src/cli/sync.js`'s exit code** (Residual 5 / disposition 1).
- **Implementing the systemd identity query** (Residual 1). Table B's systemd row
  returns `argv:null` on purpose.
- **The dev descriptor's tree hashing** — owned by
  **WP-dev-descriptor-no-tree-hash**. (There is no "`.git`-in-digest defect": on
  prod, hashing `.git` is what pins a planted one.) **The dev-stance catch-up
  containment refusal is not in scope for anyone** — it is WP-157's ratified
  disposition, reaffirmed after the reversal was proposed and rejected.
- **Automating the `bootout` repair anywhere other than the existing heal
  path.** No new CLI verb, no new flag, no `--force`.
- **Adding `state/alerts.jsonl` records, email, or any new alert channel.**
- **Changing `deriveProbeArgv`, `deriveUnloadArgv`, `schedulerSpawn`,
  `writeCanonicalSchedule`, or `registerPlatform`.**
- **Adding a `docs/GLOSSARY.md` term** (disposition 3 — the rename removes the
  need).
- **Anything in the `secret-lifecycle` epic.**
- **Hand-writing any aggregate status table or dependency graph** (ADR-0029) —
  views are generated from frontmatter on demand.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body,
   including the named-subtest counts from steps 1-2 and the completed Mutation
   checks table.
2. Steps 7-8 run on macOS and their output pasted; if the implementer is not on
   macOS, say so explicitly rather than silently omitting them.
3. Conventional commits; PR titled
   `fix(scheduler): verify loaded entry identity, not presence (WP-scheduler-entry-identity)`.
4. PR template filled, including "Decisions made" — at minimum: the
   `defaultProbe` double-spawn on darwin, the `foreign`→`mismatched` rename, the
   **corrected** `alerts.jsonl` rationale, the bootstrap-first ordering, and
   anything else chosen under ambiguity — and `Generated-by:`.
5. The PR body states explicitly that **this WP does not close the incident
   class on its own**; `WP-scheduler-loaded-record-tripwire` must also merge.
6. This spec's `status:` flipped to `In-Review` in the same PR.
7. **Owner Windows-VPS checklist item added to the PR body** (not performed by
   the implementer): confirm on a real Windows install that `wienerdog doctor`
   reports the two scheduled tasks as `loaded` and not `unverified` — i.e. that
   `schtasks /query /tn … /xml` round-trips well enough for Table B's four
   `schtasks` conditions. This mirrors ADR-0018's existing "mandatory owner
   Windows-VPS checklist" precedent for facts CI cannot reach.
8. **The ADR-0018 amendment is ratified before merge.** The amendment at
   `docs/adr/0018-windows-scheduled-dreaming.md:202` is `Proposed — awaiting
   owner ratification` with an empty approval block. This WP implements it, so it
   must not ship while the ADR still reads `Proposed`. The implementer does
   **not** edit the ADR (see the Deliverables note): flag in the PR body that
   merge is blocked on Gyula ratifying it, and let the owner make that edit.
