---
id: WP-scheduler-entry-identity
title: Verify a scheduler entry's LOADED program identity, not its presence, in the product health probe and heal
status: Ready
model: opus
size: M
depends_on: []
adrs: [ADR-0004, ADR-0018, ADR-0023, ADR-0027, ADR-0028, ADR-0031]
epic: scheduler-integrity
---

# WP-scheduler-entry-identity: identity, not presence (product side)

> **DISPATCH STATUS — 2026-07-26: READY. No owner decision blocks this WP, and
> nothing further is required from the owner before an implementer starts.**
> Both adversarial review legs returned APPROVE after eight rounds. The three
> places this WP touches owner authority are all settled: **Definition of done
> item 8**'s ratification marker was typed by Gyula himself in ADR-0018 and only
> needs *verifying* with the anchored grep in that item; **items 9 and 10** were
> ruled verbally in session on 2026-07-26 and are transcribed under
> "Owner decisions" at the end of this spec. **Item 11 is advisory and blocks
> nothing.** Those transcriptions are decision records, **not** signatures — they
> are deliberately not `OWNER-SIGNED` lines and satisfy no gate that demands one.
> The only gate here that demands an owner-typed marker is item 8's, and that
> marker already exists.

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
  `src/cli/run-job.js:1236` and `src/cli/sync.js:247`. Never throws — **because
  the whole body, `mkdirSync` + `writeFileSync` + `renameSync` included, sits in
  one `try { … } catch { /* status is best-effort; never blocks the caller */ }`
  at line 139.** It returns `void`; a swallowed `EACCES`/`ENOSPC` is
  indistinguishable from success to every caller. This WP does not change that
  (Residual 10) and does not claim otherwise anywhere.
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
- **`repairCatchup` has THREE production entry points, not one.** All go through
  `repointSchedules` (`src/cli/schedule.js:565`, which pushes `cu.notice` onto
  its `notices` array): `src/cli/sync.js:222`, **`src/cli/adopt.js:422`**
  (`wienerdog adopt`'s existing-job rebind) and **`src/cli/schedule.js:895`**
  (`wienerdog schedule remove`'s catch-up teardown/rebind). The latter two pass
  `{ loader }` with **no `probe`**, so under this WP they inherit the full new
  behavior: the widened heal set, the pre-destructive marker, and
  `darwinReplaceEntry`'s `bootout`. All three are **attended** commands. Any
  statement that `sync` is the sole healer is **false** — see the correction
  under "Round-2 / 3 / 5 review dispositions" item 5 and Residual 8.
- `src/cli/schedule.js:619` and `:639` — on a successful repair `repairCatchup`
  returns `{ notice: 'restored the missing catch-up registration.' }`; on a
  failed one, `"catch-up entry rewritten but the OS scheduler did not accept it
  — run 'wienerdog doctor'."`. `src/cli/adopt.js:420-424` treats **any** notice
  as `rebindFailed = true` and surfaces it as an adoption failure. Executed at
  `efd1489`: `tests/unit/catchup-authorization.test.js` asserts loader argv
  (line 339) but never asserts either notice string, so the notice discipline in
  disposition 4 does not touch that suite.
- `src/cli/schedule.js:287` and `src/cli/schedule.js:402` already contain the
  literal token `bootout` — they build the manifest-recorded `unload` argv
  arrays. **A bare `grep -n "bootout" src/cli/schedule.js` therefore already
  succeeds on unmodified `main`** (executed at `efd1489`: it prints lines 287
  and 402). Verification step 5 must not use it.
- `src/cli/sync.js:219-247` — ordering inside `sync`: `repointSchedules`
  (which calls `repairCatchup`) → `reloadMissing` → `refreshSchedulerStatus`.
  `sync` never sets `process.exitCode`; a failed heal prints a `WARNING` line
  and exits 0. That stays true (see "Round-2 / 3 / 5 review dispositions").
- `src/scheduler/spawn.js:24-36` — `schedulerSpawn`, the single mutation
  chokepoint; returns `{status, stdout}` with `encoding:'utf8'`, and throws
  loudly under `WIENERDOG_TEST_NO_REAL_SCHEDULER`.

**The Windows precedent already in the tree.**

- `src/scheduler/generators.js:494-497` — `windowsCmdExePath(env = process.env)` →
  `path.win32.join(env.SystemRoot || env.windir || 'C:\Windows', 'System32', 'cmd.exe')`.
  This is the canonical `<Command>` every Wienerdog task is registered with. **The
  parameter defaults to `process.env`**, and all six shipping call sites in
  `src/cli/schedule.js` call it with no argument — Table B condition (a) does the
  same, so the health check and the register path resolve `cmd.exe` identically,
  including the `C:\Windows` fallback that makes the fixtures render off-Windows.
- `src/scheduler/generators.js:622-631` — `parseWindowsTaskExec(xml)`. **It does
  NOT return a pair.** It runs two *independent* `xml.match(…)` calls — one for
  `<Command>`, one for `<Arguments>` — so on a task document with more than one
  `<Exec>` it returns Exec₁'s command alongside Exec₂'s arguments. Returns
  `null` only when there is no `<Command>` at all. This is pre-existing shipping
  behavior relied on by `windowsLoadedTaskMatches` at *register* time; this WP
  promotes the same parser into the *health verdict*, so Table B's condition (0)
  rejects any multi-`<Exec>` document before the parser is consulted. The parser
  itself is not changed.
- `src/scheduler/generators.js:516-524` — `cmdQuotedToken(s)` encodes one value
  for a double-quoted `cmd.exe` token (doubles a trailing backslash run;
  **throws** `WienerdogError` on an embedded `"`).
- `src/scheduler/generators.js:530-532` — `cmdArgToken(a)` leaves a
  `/^[A-Za-z0-9:._-]+$/` token bare and double-quotes anything else via
  `cmdQuotedToken`. Together with the throw above this is what makes the
  registered argline's double-quotes strictly paired — the property Table B1's
  quote-aware split depends on. That bare charset is also **disjoint from every
  cmd.exe unquoted operator**, which is the fact Table B1's single delimiter
  alphabet rests on.
- `src/scheduler/generators.js:556-567` — `windowsCmdArguments(o)` builds the
  registered `<Arguments>` as
  `` `/d /s /v:off /c "${[...sets, exec].join(' & ')}"` ``, where each `set` is
  `set "VAR=…"` and the final segment is
  `` `"${cmdQuotedToken(o.node)}" "${cmdQuotedToken(o.launcher)}" …` ``.
  **The `set "VAR=…"` chain embeds core paths**, so a substring test for the
  launcher token matches an argline in which the launcher is merely *mentioned*
  and never *executed*. Table B exists to prevent exactly that.
- `src/scheduler/generators.js:261-270` — `scheduledEnvPairs(home, core)`, the
  **closed** list `sets` is built from, in this exact order:
  `HOME=<home>`, `WIENERDOG_HOME=<core>`, then `NODE_OPTIONS`, `NODE_PATH`,
  `CLAUDE_CONFIG_DIR`, `CODEX_HOME`, `ANTHROPIC_API_KEY` **each bound to the
  empty string**; `windowsCmdArguments` then appends one more bind in eighth
  position, `USERPROFILE=<home>` (`generators.js:562-564`). The JSDoc at
  `:250-256` states why the empties are load-bearing, verbatim: *"An inherited
  `NODE_OPTIONS=--require <evil>` would otherwise run attacker code in the
  launcher's OWN node process BEFORE launch.js — bypassing every check."*
  Table B condition (c0) binds to **this list**, not to the shape of a `set`
  command, for exactly that reason.
- `src/core/paths.js:21-31` — `assertSafeOverride(name, value)`. On a SET value it
  requires `path.isAbsolute(value)` and rejects a `.` or `..` **component**, with
  the component scan at **`:23-29`** being literally
  `const segs = value.split(/[\\/]+/)` … `segs.includes('..') || segs.includes('.')`.
  `getPaths` runs `WIENERDOG_HOME` through it (`:55`) and otherwise falls back to
  `path.join(home, '.wienerdog')`. **This is the canonical statement of what a
  usable `WIENERDOG_HOME` is, and Table B condition (c0) rule 4a mirrors it
  instead of restating it.** Every `windowsCmdArguments` call site passes
  `core: paths.core` (`src/cli/schedule.js:315-320`, `:471-476`, `:629-634`,
  `:734`), so **our writer provably cannot emit a `WIENERDOG_HOME` bind whose
  value has a `.`/`..` component**: the override branch throws and the fallback
  branch's `path.join` collapses it. Executed: `getPaths` throws on
  `WIENERDOG_HOME=/home/bob/.wienerdog/child/..`, and the fallback yields
  `/home/bob/.wienerdog` for `HOME ∈ {'/home/bob','/home/bob/','/home/./bob','/home/bob/x/..'}`.
  **This file is NOT a deliverable and is not edited** (Deliverables note;
  disposition 6(b)).
- `src/scheduler/launcher.js:426-431`, `:217-231`, `:472-478` — the vendored
  launcher **does not trust the bound `WIENERDOG_HOME`**: it anchors its core to
  its own on-disk location (`anchoredCore(__filename)`) and overwrites
  `WIENERDOG_HOME` with that anchored value for both the fire-time digest
  re-derivation (`derivationEnv`) and the child spawn
  (`childEnv.WIENERDOG_HOME = core`). **Consequence, stated because it is easy to
  get backwards:** a poisoned bind value never reaches `assertSafeOverride` at
  fire time, so such a record **does** fire. Rule 4a's justification is
  therefore *"our writer cannot have emitted it"*, **never** *"it cannot run"*.
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
| modify | src/scheduler/generators.js | add `launcherPath`, `deriveIdentityArgv`, `loadedEntryTargets` (+ export all three); no existing function's behavior changes. **No new constant** — Table B1's `BARE` production reuses `cmdArgToken`'s existing charset (`:530-532`) and `cmdArgToken` is already exported |
| modify | src/scheduler/status.js | `defaultProbe` gains `expect` + `opts.run`; taxonomy per Table A; **step 8b's `fs.existsSync` on the execution position** (Table B, Residual 9); `probeAll` / `reloadMissing` build `expect` and forward `opts.run`; `renderSchedulerStatusLine` + `doctorSchedulerChecks` + `reloadMissing` handle the new members; pre-destructive marker refresh — **unconditional**, once per call, before the first replacement call (Table E) |
| modify | src/cli/schedule.js | `launcherPathFor` delegates to `generators.launcherPath`; new local `darwinReplaceEntry`; `reloadJob` + `repairCatchup` darwin use it; `repairCatchup` heal-gate + `expect` per Table A + the same **unconditional** pre-destructive marker (Table E) + the notice discipline of disposition 7; **add `repairCatchup` to `module.exports`** — a one-token change, authorized here and gated by verification step 5, see "Why `repairCatchup` is exported" |
| modify | src/cli/doctor.js | comment only — the "never a hard fail" note at lines 401-403 becomes accurate for Table A. NO logic change |
| modify | src/cli/dream.js | ONE added argument at the `renderDigest` call (line ~377): `schedulerLine: require('../scheduler/status').renderSchedulerStatusLine(paths),`. Nothing else |
| modify | tests/unit/scheduler-status.test.js | ONLY the assertions named in Table D |
| create | tests/unit/scheduler-entry-identity.test.js | every test name prefixed `entry-identity:` (with a trailing space) |

**`docs/adr/0018-windows-scheduled-dreaming.md` is deliberately NOT a
deliverable.** An earlier draft listed it so `boundary-check` would accept the
2026-07-25 amendment if it rode on this branch. It does not: the amendment is
**already on `main` and already ratified** (Definition of done 8). Keeping the
row would only widen this WP's write boundary to include an owner-signed ADR,
which is the opposite of what the Deliverables table is for. Do not edit it.

**Honest file inventory.** Seven rows / seven files, one under the README's
`≤ 8 files` bound. Of the seven: **two are tests**, **one is a comment-only
edit**, and **one is a single added object property** (`dream.js`). Genuine new
non-test source is ≈195 lines across three files (round 3 added Table B1's
alphabet + end-anchored grammar, step 8b, `repairCatchup`'s marker and its notice
discipline — ≈45 lines; round 5 added one exported name, one `path.win32.resolve`
pair in condition (c0) rule 4, and **deleted** a verification step — net ≈+3
lines; round 8 added condition (c0) **rule 4a**, a two-line component check
mirroring `src/core/paths.js:23-29` — net ≈+2 lines), still inside the
`≤ ~400 lines` bound. **`src/cli/adopt.js`,
`src/cli/sync.js` and `src/core/paths.js` are deliberately NOT rows** even though
rounds 3 and 5 examined all three: dispositions 1, 6(b) and 7 record why each was
rejected rather than added. This spec's
own `status:` flip is always allowed without listing (see `_TEMPLATE.md`) and is
**not** counted above. The harness/tripwire half of the original draft has been
split out to `WP-scheduler-loaded-record-tripwire` (4 files, no `src/` import),
which is what brought this WP back inside the bound. Do not treat any of this as
licence to widen scope.

**ARCHITECT'S SIZING NOTE — read before scheduling this WP (round 5).** The
*source* diff is small and inside every bound; the **executable surface is not**.
This spec now carries 5 canonical tables, 16 criteria, **28 mandated named
tests** (AC-13 enumerates them) and **30 mutation checks**, and rounds 5 and 8
each added no named test but did add a mutation (M29, M30) — round 5 also added
two owner decisions. That is at or
past what one implementer session can execute in a single pass, and the
reviewer flagged it in round 4. **The recommended split, if the owner wants one,
is the Windows leg**: Table B's `schtasks` row + Table B1 + AC-1's schtasks
fixtures + M18/M22/M23/M24/M29/M30 move to `WP-scheduler-entry-identity-windows`,
depending on this WP; what stays is the launchd leg, the taxonomy, the probe seam,
the heal and the marker. The split is clean because the two legs share only
`loadedEntryTargets`'s signature, which the remaining WP still defines. **This is
a recommendation, not a decision** — splitting a spec the owner has already
reviewed four times has its own cost, so it is listed with the owner decisions in
Definition of done rather than executed unilaterally.

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

/** Decide whether a LOADED scheduler record runs OUR launcher, and report the
 *  program the OS will actually START. `stdout` is the raw output of
 *  deriveIdentityArgv().argv. PURE: parses, compares, never executes, never
 *  touches the filesystem (no fs call of any kind — the existence check on
 *  `exec` belongs to defaultProbe step 8b), and never derives a path FROM THE
 *  PARSED TEXT. It does derive the expected core from `expectLauncher` —
 *  `path.win32.dirname` twice, Table B condition (c0) rule 4 — which is
 *  code-owned input, not scheduler output, and therefore needs no component
 *  check of its own (rule 4a screens the PARSED value only; the expectation
 *  already passed `assertSafeOverride` in this same process, `paths.js:55`).
 *  `verdict` is decided by the LAUNCHER position; `exec` is the EXECUTION
 *  position, reported and never compared (Table B, Table B1, Residual 9). `exec`
 *  is set whenever it could be parsed — including alongside a 'mismatch' — and
 *  is null otherwise.
 *  **NEVER THROWS** — any internal throw (e.g. cmdQuotedToken on a `"` in
 *  expectLauncher) is caught and returned as
 *  `{verdict:'indeterminate', exec:null}`.
 *  @param {string} stdout @param {'launchd'|'systemd'|'schtasks'} kind
 *  @param {string} expectLauncher  an absolute path (generators.launcherPath)
 *  @returns {{verdict:'match'|'mismatch'|'indeterminate', exec:string|null}} */
function loadedEntryTargets(stdout, kind, expectLauncher)
```

**No fourth export.** Table B1's grammar reuses the alphabet that already exists
— `cmdArgToken`'s bare charset at `generators.js:530-532` — and `cmdArgToken` is
already in `module.exports`, so AC-1's closure family reads the writer's real
behavior instead of a copy. Do not add a constant for this.

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
3. `RUN(argv)`, where **`RUN` is `run || defaultRun`, bound ONCE before step 1
   and used for BOTH spawns** (steps 3 and 7), and `defaultRun` is
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
7. `RUN(expect.identityArgv)` — the **same `RUN` as step 3, never a bare
   `run(…)`**; `r2.error` or `r2.status !== 0` or
   `typeof r2.stdout !== 'string'` → `'unverified'`.
   **Why this is spelled out.** `run` is `null` on every production call (no
   production caller passes `opts.run` — Table C), so a bare
   `run(expect.identityArgv)` here throws `TypeError: run is not a function`
   on the **healthy** path: a real loaded entry passes the presence query at
   step 4, is not caught by steps 5-6, and reaches step 7.
   `doctorSchedulerChecks` (`src/scheduler/status.js:181-194`) does **not**
   wrap `probe(…)` in a try, so that throw escapes `wienerdog doctor` instead
   of producing a status. AC-3b is the executable gate on this; mutation M19
   reverts it.
8. `const { verdict, exec } = loadedEntryTargets(r2.stdout, expect.kind, expect.launcher)` →
   `'mismatch'` → `'mismatched'`; `'indeterminate'` → `'unverified'`;
   `'match'` → continue to step 8b.
   **Step 8b — the execution position must exist.** `verdict === 'match'` proves
   only that OUR launcher sits in the launcher position. It says nothing about
   the program the OS will actually *start*, which is `exec` (Table B). Grade
   `'loaded'` only when `typeof exec === 'string' && exec !== '' &&
   fs.existsSync(exec)`; otherwise `'mismatched'`.
   **Why this step exists, and why it is `mismatched` rather than `unverified`.**
   Without it a routine `brew upgrade node && brew cleanup` reproduces the
   incident verbatim: `generators.nodePath()` (`generators.js:20-22`) registers
   `process.execPath`, which on the maintainer's machine is the version-pinned
   Cellar path shown in the executed launchd evidence below
   (`/opt/homebrew/Cellar/node/25.9.0_2/bin/node`). Deleting it leaves the
   `.plist` correct, the loaded record correct, `args[1]` still our launcher, and
   `launchctl print` still exiting 0 — while every hourly fire dies in
   `posix_spawn` with `ENOENT` **before a single line of Wienerdog code runs**:
   no refusal, no `alerts.jsonl` record, no product log. That is the Context
   paragraph of this spec with "launcher path" replaced by "node path", and a
   probe that graded it `loaded` would be the fourth recurrence of the class this
   WP exists to close. It is a definite verdict, not an unreachable one — the
   entry **cannot work** — so Table A's `fail` severity applies and the entry
   enters the heal set, which re-registers it with the running `process.execPath`
   and converges in one `sync`. A `loaded` or `unverified` grading would leave it
   silent or merely warned, which is exactly what failed three times already.
   **This is the ONLY `fs` call in the identity path, and it is deliberately here
   rather than in `loadedEntryTargets`**, which the Security checklist keeps
   filesystem-free and which must stay runnable against Windows fixtures on a
   POSIX test host. `fs.existsSync` never throws; it returns `false` on ELOOP,
   ENAMETOOLONG, EACCES and every other error, which is the fail-closed direction.
   It is a `stat`, never an open, an exec or a write.
   **What it does not do:** an executable that *exists* is not thereby ours.
   Substituting a real binary in the execution position still grades `loaded` —
   see Residual 9, which states that boundary rather than hiding it.

**Why steps 1-2 are gated on `run` being absent.** Unconditionally, the only way
to exercise steps 3-8b is to `delete` both env vars — which also disarms
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
if (!HEAL_SET.has(status)) continue;   // HEAL_SET = new Set(['missing','mismatched','unverified'])
if (!markerAttempted) {                // pre-destructive durable marker — UNCONDITIONAL
  refreshSchedulerStatus(paths, opts); // BEST-EFFORT; never throws, may silently not land
  markerAttempted = true;
}
```

**The flag is `markerAttempted`, not `markerWritten` — and that is not a naming
nit.** `refreshSchedulerStatus` (`src/scheduler/status.js:131-140`) wraps its
`mkdirSync` / `writeFileSync` / `renameSync` in a bare `catch {}`, so an `EACCES`
or `ENOSPC` is swallowed and the caller cannot tell. An earlier draft called the
flag `markerWritten` and thereby asserted a durability the code does not provide.
The flag's only job is **once per call**; it never was and never could be proof
that anything landed. Residual 10 states the consequence.

**Why the marker, and why it is UNCONDITIONAL.** A heal can tear down an
existing record (Table E). If the process dies mid-replacement, the durable
cache must not still say `loaded` from a stale earlier refresh. Writing it from
the live probe **before the replacement call** — the canonical phrase; use it
verbatim everywhere — makes the cache pessimistic for that window **whenever the
write lands and the re-probe agrees with the heal verdict**;
`sync`'s trailing `refreshSchedulerStatus` (`src/cli/sync.js:247`) clears it on
success. No new file and no new format — `state/scheduler-status.json` already is
the durable scheduler-health channel.
**Both qualifiers are load-bearing and neither is hedging.** "Whenever the write
lands": Residual 10, and why this WP deliberately does **not** gate the
replacement on it — the owner ruled that ungated form permissible on 2026-07-26
(disposition 4, Reading B). "And the re-probe agrees": **Residual 8, which round 5
reclassified from an accepted residual to a real defect, and which the owner
accepted on 2026-07-26 as a known-open defect this WP ships with.**
The marker re-probes rather than persisting the verdict that triggered the heal,
and on the very transient-failure path the next paragraph relies on, the re-probe
can succeed and persist `loaded` for the unchanged record — leaving the cache
**optimistic** across the `bootout`, which is the opposite of what this marker is
for. **Do not write anywhere that the marker guarantees a pessimistic record.**

The condition an earlier draft had here — *write it only when the observed
status is not `missing`* — was **wrong, and its removal is load-bearing**. The
observed status does not predict whether a destructive step is reached. A
**transient** failure of the presence query (a killed spawn, `launchctl` busy,
an `r.error` of any kind) yields `missing` at step 4 for a label that is in fact
still loaded; the heal then calls `darwinReplaceEntry`, whose first `bootstrap`
**fails** because the label IS occupied, so `bootout` issues — a destructive step
reached on the one path that wrote no marker, while the cache may still say
`loaded` from the last `run-job` refresh (`src/cli/run-job.js:1236`). That
violates ADR-0018's 2026-07-25 amendment, decision 2: *"Before any destructive
replacement, the durable status cache is refreshed from the live probe, so a
process killed mid-replacement leaves a pessimistic record rather than a stale
`loaded` one."* The rule must hold on **every** path, and the only condition that
guarantees that is none: **once per call, before the first replacement call,
whatever the observed status.** The cost is one extra read-only probe pass on a
heal that would previously have skipped it — `sync`-only, attended, bounded, and
it mutates nothing. Mutation M21 re-adds the condition and must turn AC-9a red.

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
  **Before the replacement call — unconditionally, whatever the observed
  status** — call `require('../scheduler/status').refreshSchedulerStatus(paths, opts)`
  once. The same pre-destructive marker rule as `reloadMissing`, including the
  reason it carries no status condition (see "Why the marker, and why it is
  UNCONDITIONAL" above): `repairCatchup` reaches this line only when the entry is
  already in the heal set, and a `missing` verdict there can be a transient
  presence-query failure on a label that `darwinReplaceEntry` will then `bootout`.
  One rule, both destructive sites; no special case, no status test.
- **Notice discipline (both branches) — the string must not lie, and `adopt`
  must not fail on a healthy install.** Keep the observed status in a local and
  return, on a **successful** repair:
  - observed `missing` → `{ notice: 'restored the missing catch-up registration.' }`
    — **byte-identical to today** (`schedule.js:619`, `:639`);
  - observed `mismatched` or `unverified` → **`{}`, no notice.**

  Two independent reasons, both executed. (1) The shipped string says
  *"the missing catch-up registration"*; emitting it for a hijacked or unreadable
  entry states something false to the user, which CLAUDE.md's plain-language rule
  forbids. (2) `src/cli/adopt.js:420-424` sets `rebindFailed = true` on **any**
  notice and prints an adoption failure with a `wienerdog sync` remediation.
  Residual 2 says `unverified` is the **expected** outcome for any
  `schtasks /query /xml` round-trip deviation, so without this rule
  `wienerdog adopt` would report failure on a healthy Windows install — a loud,
  wrong, user-facing regression introduced by widening the heal set. `adopt.js`
  is **not** a deliverable and its heuristic is not this WP's to change, so the
  fix lives where the notice is produced.
  **Failure notices are unchanged for every member** — a repair that was
  attempted and rejected by the OS is a real failure and `adopt` should still
  flag it. The cost of returning `{}` on a successful non-`missing` repair is
  that `sync` prints nothing for it; that is acceptable because the repair
  **succeeded**, `sync`'s trailing `refreshSchedulerStatus` records the
  post-repair truth, and `doctor`'s live probe is the authoritative surface.
  Record this under "Decisions made".
- The linux and win32 register calls are unchanged (`systemctl --user enable
  --now` and `schtasks /create … /f` already replace).

**Why `repairCatchup` is exported (and why the alternative does not work).**
Add `repairCatchup` to `src/cli/schedule.js`'s `module.exports`, which at
`efd1489` is exactly:

```js
module.exports = { run, defaultLoader, repointSchedules, ensureDreamSchedule, registerPlatform, reloadJob };
```

Without it **AC-9c, AC-12b and AC-12c are literally unwritable**, and this WP's
own criteria would be unproducible — the failure mode a spec must never ship.
Executed this session against a `mkdtemp` copy of `src/` (the repo tree itself
untouched):

- with the export added, `schedule.repairCatchup(paths, manifest, { probe: () => 'missing', loader: rec, platform: 'darwin' })`
  records **exactly one** loader call,
  `['launchctl','bootstrap','gui/<uid>','<temp home>/Library/LaunchAgents/ai.wienerdog.catchup.plist']`,
  and `state/scheduler-status.json` does **not** exist at that first call on
  unmodified code — precisely the red-before / green-after property AC-9c needs;
- driving the same fixture through the **exported** `repointSchedules` instead
  records **three** loader calls, the first being the per-job
  `ai.wienerdog.dream` bootstrap from `registerPlatform` and the catch-up entry
  appearing twice (once from `ensureCatchup` at register time, once from
  `repairCatchup`). So "the recording loader's **first** call" cannot be an
  assertion about `repairCatchup` at all through that seam. `repointSchedules`
  also calls `repairCatchup(paths, manifest, { loader, platform, probe: opts.probe })`
  and does **not** forward `opts.run` (`schedule.js:565`), so AC-12b's
  no-`opts.probe` construction is unreachable through it too.

Two things this export is **not** licence for. It does not change
`repairCatchup`'s behavior, signature or callers — `repointSchedules` stays its
only production caller, and this WP adds no CLI surface. And it does not make
`repairCatchup` a supported API: it is exported for the same **structural**
reason `reloadJob` already is — another file in this repo must reach it across a
module boundary. The two differ in *which* file, and the distinction is worth
stating plainly rather than glossing: `reloadJob` is reached by a production
module (`src/scheduler/status.js:257` calls `schedule.reloadJob`), whereas
`repairCatchup`'s consumer is this WP's **test** file. That is a narrower claim,
not a weaker one, and nothing external is widened by it: `package.json` declares
`bin` only — no `main`, no `exports` — so `src/cli/schedule.js` is unreachable by
any consumer of the published package, and this WP adds no CLI surface.
Verification step 5 greps for the export so it cannot be silently dropped.

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
path stays read-only and ADR-0018's read/heal split is preserved: **the nightly
`dream` path adds no heal.** Do **not** write "`sync` remains the sole healer"
anywhere — that claim is false on `main` (`repairCatchup` is reachable from
`sync.js:222`, `adopt.js:422` and `schedule.js:895`; see Current state and
disposition 5). The property this argument preserves is narrower and true:
`dream` reads the cache and heals nothing. Do not add any other argument, and do
not reorder the object.

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

Five tables below are canonical: **A** (status taxonomy), **B** (per-platform
loaded-exec identity), **B1** (the Windows exec segment's shared token alphabet
and end-anchored grammar), **C** (test seams per call site) and **E** (the darwin replacement).
**D** is not a contract — it is the closed list of existing assertions this WP
invalidates. Tables **C** and **B1** were both extracted under ADR-0031's loop
circuit-breaker after repeated point fixes on the same contract family: C after
two rounds on the seam family, B1 after two rounds on Table B's condition family
(a shape-based (c0) in round 1, a prefix-matched exec segment in round 2). The
rule that produced them, stated so it does not have to be rediscovered: **when a
second finding lands in the same contract family, the table is the bug — extract
the sub-contract instead of patching the condition again.**

**Round 5 applied the circuit-breaker's OTHER outcome: subtraction.** A per-line
structural check on the test file's JavaScript source (verification step 5c) had
been respecified three times and broken three times, in both directions. There is
no sub-contract to extract there — the mechanism itself is unbuildable with a
zero-dependency toolchain — so it was **deleted** and its guarantee re-expressed
at runtime (AC-14). Extraction is the move when the contract is real and the
statement of it is wrong; subtraction is the move when the *mechanism* cannot
exist. Both are the circuit-breaker; neither is another refinement.

### Table A — entry status taxonomy (canonical)

Every fact about a status member is decided here. Prose elsewhere cites this
table; it must not restate a cell.

| Status | Means | Probe step that yields it | `doctor` severity | Digest callout | Healed by `sync`? |
|--------|-------|---------------------------|-------------------|----------------|-------------------|
| `loaded` | a record exists, runs this install's launcher, AND the program in its execution position still exists on disk | step 8 = `match` **and** step 8b passes | `ok` | none | no |
| `missing` | no record | step 4 (`error` or non-zero exit) | `warn` | template M | yes |
| `mismatched` | a record exists but the program it will actually execute is not one this install can run: **either** the launcher position holds a launcher that is not ours, **or** the execution position names a program that does not exist on this machine (a deleted node — see step 8b) | step 8 = `mismatch`, **or** step 8 = `match` with step 8b failing | **`fail`** (sets exit 1) | template F | yes |
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

**Why a deleted execution-position program is `mismatched` and NOT a sixth
member.** ADR-0018's 2026-07-25 amendment, decision 2 is owner-signed and names
exactly two new members, `mismatched` and `unverified`. Adding a third would
contradict signed text, which a WP may not do. So step 8b's finding is placed
inside `mismatched`, whose signed gloss is *"a record exists and runs a program
outside this install → doctor fails, exit 1"* — a deleted node binary is
literally a program outside this install, and the verdict is definite (the entry
cannot fire) rather than unreached, which is what separates `mismatched` from
`unverified`. If the owner reads that gloss more narrowly, the fix is an ADR
amendment in its own pass, never an edit from this WP; the Mirrored Surface
Checklist registers the ADR so the divergence cannot go unnoticed.

`doctor` message text (fixed templates; `<n>` is the job name, `<k>` the
scheduler kind — both code-owned, `[a-z0-9-]` only):

| Status | Message |
|---|---|
| `loaded` | `scheduled job '<n>' is loaded (<k>)` — **byte-identical to today** |
| `missing` | `scheduled job '<n>' is configured but NOT loaded in <k> — run 'wienerdog sync' to reload it` — **byte-identical to today** |
| `mismatched` | `scheduled job '<n>' is registered in <k> but the program it would run is not this Wienerdog install's, or no longer exists on this computer, so it cannot work — run 'wienerdog sync' to re-register it from this install` |
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
  `> [!warning] Wienerdog: the scheduled {job|jobs} <names> {is|are} registered in your computer's scheduler, but the program {it|they} would run is either not part of this Wienerdog installation or no longer on this computer, so {it|they} cannot run. Run 'wienerdog sync' to re-register {it|them} from this installation.`
- **template U**:
  `> [!warning] Wienerdog: Wienerdog could not read back what your computer's scheduler will actually run for the scheduled {job|jobs} <names>, so it cannot confirm {it is|they are} still wired to this installation. Run 'wienerdog sync' to re-register {it|them}, then run 'wienerdog doctor'.`

`<names>` is the comma-joined `"name"` list, exactly as today (`status.js:162`).

### Table B — loaded exec identity, per platform (canonical)

The **authoritative artifact** for every row is the OS scheduler's own record of
what it will execute — never the schedule file on disk. That distinction is the
entire point of this WP: in the incident, the file was correct and the record
was poisoned.

Every loaded record has **two** positions this WP must keep apart, and round 2
found an earlier draft of this table conflating them:

- the **execution position** — the program the OS itself starts. `args[0]` on
  launchd; the first quoted token of the exec segment on schtasks (the "node
  position").
- the **launcher position** — the first argument that program receives.
  `args[1]` on launchd; the second quoted token on schtasks.

**The verdict is decided by the launcher position. The execution position is
returned, not compared.** `loadedEntryTargets` therefore returns a **pair**,
`{verdict, exec}`; `defaultProbe` **step 8b** — not this function, which makes no
`fs` call — requires `exec` to still exist on disk before it will grade `loaded`.
Table B1 fixes the Windows lexical structure the two positions are read out of,
and **Residual 9** states exactly what a `match` still permits in the execution
position. **No row uses a substring test.**

| kind | `deriveIdentityArgv().argv` | Where the identity lives in stdout | `exec` (execution position, returned) | `verdict:'match'` when | `verdict:'mismatch'` when | `verdict:'indeterminate'` when |
|---|---|---|---|---|---|---|
| `launchd` | `['launchctl','print','gui/<uid>/<label>']` | the block that starts at the line whose **trimmed** content is `arguments = {` and ends at the line whose trimmed content is `}`; one argument per line, trimmed | `args[0]`, or `null` when the block did not parse or `args.length < 1` | `args[1] === expectLauncher` | `args.length >= 2` and `args[1] !== expectLauncher` | no `arguments = {` line; no closing `}` line; `args.length < 2` |
| `systemd` | `null` — **identity query DECLARED UNIMPLEMENTED** (see Residual 1) | — | always `null` | never | never | never — `defaultProbe` step 6 returns `unknown` before any parse, so `loadedEntryTargets` is never called with `kind:'systemd'`. If it is anyway, it returns `{verdict:'indeterminate', exec:null}` |
| `schtasks` | `['schtasks','/query','/tn','\Wienerdog\<name>','/xml']` | `parseWindowsTaskExec(stdout)` → `{command, arguments}` (generators.js:622), gated by condition (0) | Table B1's `NODE` capture, or `null` when the split or the grammar rejected the string | **all six** of (0)-(d) below | (0), (a), (b) hold, the Table B1 split and grammar both parse, and **(d) fails** — a launcher that is not ours sits in the launcher position | `parseWindowsTaskExec` → `null`; any of (0), (a), (b), (c) fails; **the Table B1 split fails** (B1 decides when — do not restate its rule here); **(d) holds but (c0) fails**; `cmdQuotedToken(expectLauncher)` throws |

**Evaluation order is part of the contract**: `(0) → (a) → (b) → the Table B1
split → (c) → (d) → (c0)`. Only (d) can produce `mismatch`; every other failure
produces `indeterminate`. **(d) is evaluated BEFORE (c0) on purpose.** A record
whose exec segment names a launcher that is not ours is unambiguously foreign
whatever its `set` chain says, and that is the loudest verdict the taxonomy has
(`mismatched` → `doctor` exit 1, Table A). If (c0) ran first, the poisoned
Windows record from the incident class — registered from a temp core, so its
`WIENERDOG_HOME` bind names that temp core — would fail (c0) rule 4 and be
reported `unverified` (a warn) instead of `mismatched` (a fail). Ordering (d)
first keeps the hijack loud and leaves (c0) doing what it is for: catching a
chain that runs **our** launcher inside a **non-canonical** envelope, which is
exactly the case where we can say something is wrong but not that the program is
foreign.

The `schtasks` row's conditions (the bullets are lettered for reference; the
evaluation order is the one stated above):

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
- **(c0) everything before the exec is EXACTLY the canonical env-binding set** —
  bound by NAME and, where derivable, by VALUE; **never by the syntactic shape of
  a `set` command**. Split the inner string into segments at each ` & ` that lies
  **outside** a double-quoted region (Table B1's split — do not re-derive it here); call every
  segment except the last the *binds*. Then, in order:
  1. every bind matches `/^set "([A-Za-z_][A-Za-z0-9_]*)=([^"]*)"$/` — anything
     else (a bare `evil.exe`, a quoted `"evil.exe"`, a second `/c`, an `if`, an
     `@echo`) → `indeterminate`;
  2. the captured NAMES, **in order and with no extras and none missing**, are
     exactly
     `['HOME','WIENERDOG_HOME','NODE_OPTIONS','NODE_PATH','CLAUDE_CONFIG_DIR','CODEX_HOME','ANTHROPIC_API_KEY','USERPROFILE']`
     — the eight `windowsCmdArguments` emits (`generators.js:556-571`, from
     `scheduledEnvPairs` at `:261-270` plus the appended `USERPROFILE`), in that
     exact order;
  3. the five **scrubbed** vars — `NODE_OPTIONS`, `NODE_PATH`,
     `CLAUDE_CONFIG_DIR`, `CODEX_HOME`, `ANTHROPIC_API_KEY` — each have the
     **empty** captured value (the generator emits the literal `set "NAME="` for
     them);
  4. `WIENERDOG_HOME`'s bound value must be a value **our own writer could have
     emitted**, and must name the same core as the expectation. Let `captured` be
     rule 1's capture 2 for the `WIENERDOG_HOME` bind and `core` be
     `path.win32.dirname(path.win32.dirname(expectLauncher))` (the launcher is
     `<core>\launcher\launch.js`, so the core IS derivable from the
     expectation). Apply, **in this order**:

     **4a — the component check, evaluated BEFORE any normalization.** Split
     `captured` on `/[\\/]+/`; if the resulting array contains a `'.'` or a
     `'..'` component → `indeterminate`. **This rule is a MIRROR of
     `assertSafeOverride`'s own component scan (`src/core/paths.js:23-29`) —
     `segs = value.split(/[\\/]+/)`, reject on
     `segs.includes('..') || segs.includes('.')`. That function is the canonical
     statement of what a usable `WIENERDOG_HOME` is; use its split regex and its
     two component tests verbatim and do NOT re-derive an equivalent by hand.**
     (Three review rounds of this spec have now lost a fact by restating a rule
     that already existed in code; cite, do not restate.) Only the **component**
     half of that function is mirrored — its absoluteness half is 4b below, which
     must say `path.win32.isAbsolute` rather than the platform-native
     `path.isAbsolute` the real function uses, because AC-1 parses Windows
     arglines on a POSIX host. A trailing separator is **not** a `.` component
     (`'C:\Users\bob\.wienerdog\'.split(/[\\/]+/)` ends in `''`, executed), and a
     **leading-dot directory name** like `.wienerdog` is not one either — the test
     is component **equality**, never a substring or a `startsWith('.')`.

     **Why 4a is needed even with 4c's normalization.**
     `path.win32.resolve()` maps many distinct strings onto the same directory,
     so 4c alone accepts strings that are *not* the canonical bind. Executed this
     session against arglines built by the real `windowsCmdArguments`, with
     `expectLauncher = C:\Users\bob\.wienerdog\launcher\launch.js`: a bind of
     `C:\Users\bob\.wienerdog\child\..` resolves to `C:\Users\bob\.wienerdog`,
     passes 4c, reaches (d), and is graded **`match` → `loaded` → a green
     `doctor`** — while `assertSafeOverride` rejects that exact value. Same for
     `C:\Users\bob\.wienerdog\.\`. That is the round-4 defect's mirror image
     (over-acceptance instead of over-rejection) and it is closed here, not by
     widening 4c.

     **The reason is "our writer provably cannot emit it", NOT "it cannot fire" —
     state it correctly.** The tempting argument is that such a record dies at
     fire time because `assertSafeOverride` throws on it. **That argument is
     false and must not be written into this spec.** The vendored launcher
     ANCHORS its core to its own on-disk location
     (`src/scheduler/launcher.js:426-431`, `anchoredCore(__filename)`) and then
     **overwrites** `WIENERDOG_HOME` with that anchored value for both the
     fire-time digest re-derivation (`:217-231`, `derivationEnv`) and the child
     spawn (`:472-478`, `childEnv.WIENERDOG_HOME = core`) — so the bound value
     never reaches `assertSafeOverride` at fire time at all. The record **would**
     fire. What is true, and is the whole reason (c0) rejects it, is that **we
     could not have written it**: every `windowsCmdArguments` call site passes
     `core: paths.core` (`schedule.js:315-320`, `:471-476`, `:629-634`, `:734`),
     and `paths.core` is either an `assertSafeOverride`-validated override — which
     rejects `.`/`..` components — or `path.join(home, '.wienerdog')`, which
     collapses them. Executed: `getPaths({HOME:'/home/bob',
     WIENERDOG_HOME:'/home/bob/.wienerdog/child/..'})` **throws**, and the
     fallback branch yields `/home/bob/.wienerdog` for every one of
     `HOME ∈ {'/home/bob', '/home/bob/', '/home/./bob', '/home/bob/x/..'}`. A bind
     carrying such a component therefore did not come from us, and (c0)'s charter
     is "**exactly** the canonical env-binding set" — not "any spelling that
     denotes the same directory".
     **And 4a cannot regress a healthy install** — the round-4 failure mode, which
     is the one to check every time this rule is tightened. A user who sets
     `WIENERDOG_HOME` to such a value gets a `WienerdogError` out of `getPaths` on
     **every** wienerdog command, so no install can be running with one. 4a can
     only fire on a record we did not write, and its verdict there is
     `indeterminate` → `unverified` → a warn plus **one** heal that re-registers
     the canonical argline, after which it is idempotent — not the permanent
     warn-plus-churn Residual 1 rules out.

     **4b — absoluteness.** `path.win32.isAbsolute(captured)` must hold —
     otherwise `indeterminate`. This gate is what keeps the comparison
     independent of `process.cwd()` (`path.win32.resolve('evil')` prepends the
     cwd; an absolute win32 path is returned unchanged).

     **4c — the normalized comparison.**
     `path.win32.resolve(captured) === path.win32.resolve(core)`.
     Use `path.win32` explicitly, on **both** sides, so the fixtures parse
     identically on a POSIX test host.

     **Do NOT write the raw form `captured === generators.cmdQuotedToken(core)`.
     It false-`indeterminate`s a HEALTHY non-default core, and that is a
     regression versus `main`.** `assertSafeOverride` (`src/core/paths.js:21-31`)
     validates `WIENERDOG_HOME` for absoluteness and rejects `.`/`..`, then
     returns the value **verbatim, unnormalized**, while `launcherPath` is a
     `path.join` and therefore normalizes. The two sides can differ on nothing
     but separator flavor and a trailing separator — and **with 4a in force that
     is exactly the residual skew 4c is allowed to absorb**, which is what makes
     4c a normalizer rather than a loophole. Executed this session against
     arglines built by the real `windowsCmdArguments`, with
     `expectLauncher = C:\Users\bob\.wienerdog\launcher\launch.js` throughout —
     the third column is **the rule as specified above (4a+4b+4c)** and is the one
     an implementer must reproduce:

     | `WIENERDOG_HOME` in the argline | raw equality | `resolve()` alone (rounds 5-7) | **4a + 4b + 4c (this rule)** |
     |---|---|---|---|
     | `C:\Users\bob\.wienerdog` (the default shape) | `match` | `match` | **`match`** — unchanged |
     | `C:\Users\bob\.wienerdog\` (trailing separator) | **`indeterminate`** — `cmdQuotedToken` doubles the trailing backslash run, so the bind carries `C:\Users\bob\.wienerdog\\` | `match` | **`match`** — 4a does not fire (the split's last element is `''`, not `'.'`) |
     | `C:/Users/bob/.wienerdog` (forward slashes) | **`indeterminate`** | `match` | **`match`** |
     | `C:\Users\bob\.wienerdog\child\..` (climb-and-return) | `indeterminate` | **`match` — the over-acceptance Codex found: a record graded healthy that our writer cannot emit** | **`indeterminate`** — 4a rejects the `'..'` component |
     | `C:\Users\bob\.wienerdog\.\` (same directory, non-canonical spelling) | `indeterminate` | **`match`** | **`indeterminate`** — 4a rejects the `'.'` component |
     | a genuinely **foreign** core bound while `expectLauncher` names ours (the incident's temp-core shape) | `indeterminate` | `indeterminate` | **`indeterminate`** |
     | a **foreign launcher** in the exec position **and** a foreign core in the bind | `mismatch` | `mismatch` | **`mismatch`** — (d) still outranks (c0), unchanged |

     Read the round-5 claim that "the normalization does not over-accept" as
     **withdrawn**: rounds 5-7 proved only that it does not accept a *foreign
     directory*, and rows 4-5 show it did accept **non-canonical spellings of the
     right directory**. 4a is what makes the withdrawn claim true.

     Under the raw form those two supported shapes give permanent `unverified` →
     permanent `doctor` warn → digest template U forever → `schtasks /create /f`
     on **every** `sync`, rewriting the same non-normalized string, so it never
     converges. That is the permanent-warn-plus-churn mode Residual 1 cites as
     the reason systemd was declared unimplemented, and `main`'s shipping
     `windowsLoadedTaskMatches` (`src/cli/schedule.js:184-195`) does **not** have
     it: it compares the same raw string on both sides and matches. Note also
     that `resolve()` needs no cmd-decoding step — `cmdQuotedToken` only doubles a
     **trailing** backslash run, and `resolve()` collapses trailing separators.

     **Why here and not in `src/core/paths.js`.** Normalizing `paths.core` at
     construction would fix it too, but it needs `src/core/paths.js` in
     Deliverables (an 8th file, over the README bound) and it changes the
     identity of a security-validated value used by every other consumer of
     `paths.core` — manifest containment, uninstall roots, the launcher's own
     containment check. This WP's blast radius must not include that. Normalize
     at the comparison, where the skew actually is;
  5. `HOME` and `USERPROFILE` have the **same, non-empty** value as each other —
     the generator binds both to the one `o.home`, which this function cannot
     derive from `expectLauncher`, so equality-plus-non-empty is the strongest
     check available here. It is not a containment check and is not claimed to be
     one;

  any deviation → `indeterminate`.

  **Why by name and value, not by shape.** A shape test (`every non-final segment
  looks like a set`) admits **any** binding, and one of them is fatal:
  `set "NODE_OPTIONS=--require C:\evil.js" & … & "node" "<our launcher>" dream`
  passes a shape test, yet node loads the attacker's module **inside the
  launcher's own process before `launch.js`'s first line** — ahead of every
  containment, app-digest and descriptor check WP-157 performs. That is precisely
  the hazard `scheduledEnvPairs` scrubs (`generators.js:250-270` documents it in
  those words), so the health probe must not re-open it. This is also what
  ADR-0018's 2026-07-25 amendment, decision 1 requires literally: "**nothing but
  the canonical `set "VAR=…"` binds may precede the launcher in the `cmd.exe`
  command chain**". A prepended *command* is caught by rule 1 —
  `windowsCmdArguments` puts the exec **last**, so a checker that looked only at
  the last segment would accept
  `/d /s /v:off /c "evil.exe & set "X=1" & "node" "<our launcher>" dream …"`,
  where cmd.exe runs `evil.exe` first and (a)-(d) all still pass.
  **Version skew is a deliberate, bounded cost:** a task registered by an older
  Wienerdog whose binding set differs from the eight above yields `indeterminate`
  → `unverified` → one heal → a canonical re-registration, idempotent thereafter.
  That is Residual 6's "accidentally-inherited legacy argline", closed in code
  rather than deferred.
- **(c) the exec segment parses**: the **last** segment matches **Table B1's
  end-anchored grammar**. Capture `NODE` is the execution position (**not
  compared**; returned as `exec` and checked for existence by `defaultProbe`
  step 8b — Residual 9); capture `LAUNCHER` is the launcher token.
- **(d) the launcher is in the launcher position**:
  `LAUNCHER === generators.cmdQuotedToken(expectLauncher)`.

The split and the grammar (c) applies are **Table B1's**, not this row's; do not
restate them here.

**Why (0), (a), (b) and (c0) map to `indeterminate` and not `mismatch`.** No Windows host
was available to verify the round-trip of `<Command>`/`<Arguments>` through the
Task Scheduler DB (case, whitespace, encoding). A false `mismatched` would set
`doctor`'s exit code to 1 on every healthy Windows install; `unverified` is a
warn that still lands the entry in the heal set, so a genuinely hijacked task is
still re-registered — only the severity is softer. Fail-safe beats fail-loud on
an axis this spec could not verify. Residual 2 and the owner Windows-VPS
checklist cover it. **This is exactly why (d) is evaluated before (c0)** (see the
evaluation order above): the softening applies to conditions whose round-trip
fidelity is unverified, and it must not swallow the one condition that *is*
unambiguous — a foreign launcher in the launcher position, which stays
`mismatch`.

`loadedEntryTargets` **must not throw** on any input, including an
`expectLauncher` containing `"` (which makes `cmdQuotedToken` throw) — wrap and
return `{verdict:'indeterminate', exec:null}`. `defaultProbe` is contracted to
never throw, and it calls this function directly.

### Table B1 — the Windows exec segment: one token alphabet, one end-anchored grammar (canonical)

Round 2 landed a **second** finding inside Table B's condition family: an exec
segment matched by *prefix*, so `…dream&C:\evil.exe` appended after the last
launch argument graded `match` (executed — see the evidence table below). Per the
reviewer's standing instruction, the exec segment is **extracted here** rather
than patched a third time. **This table is the single place the Windows argline's
lexical structure is decided.** Table B's schtasks row and conditions (b), (c),
(c0), (d) cite it; none of them may restate a cell.

The defect both rounds found has one shape: **the writer and the checker
disagreeing about a token alphabet.** `windowsCmdArguments` decides what to leave
unquoted with `cmdArgToken`'s bare charset (`generators.js:530-532`); the round-2
checker's `(c)` matched only a *prefix* and never constrained the tail against
that charset at all, so a bare `&` in the tail was simply unexamined. That is
structurally the same bypass the `secret-lifecycle` epic hit with `+` cloaking,
and the move that terminated it there is the move used here: **ONE alphabet, used
by both the writer and the checker, plus a generated closure family asserting the
sharing actually holds.**

**The alphabet is `cmdArgToken`'s bare charset, `/^[A-Za-z0-9:._-]+$/`, and there
is exactly one of it.** The writer already owns it (`generators.js:530-532`: a
token matching it is emitted **bare**, anything else is double-quoted). The
grammar's `BARE` production below **must be that same regex**, not a
similar-looking one. No new runtime constant, no second list, nothing exported
for this — a denylist of cmd operators would be **redundant dead code** (proven
by execution below: with the grammar end-anchored and the bind regex anchored,
every unquoted-operator injection is already rejected), and CLAUDE.md's
minimum-code rule forbids shipping a mechanism no test can redden.

**Consumer 1 — the split (unchanged from round 2, and it is enough).** Walk the
inner string once, toggling an `inQuote` flag on each `"`. While `inQuote` is
**false**, split at each occurrence of ` & ` — the only delimiter
`windowsCmdArguments` emits (`generators.js:565`). An **odd** total `"` count →
`indeterminate` (fail closed rather than guess).

**Why the split needs no operator rule of its own.** Every unquoted character
lands in exactly one segment. Non-final segments are checked by (c0) rule 1's
**anchored** `^set "…"$` regex; the final segment is checked by the
**end-anchored** grammar below, whose only unquoted production is `BARE`. Since
`BARE` excludes every cmd operator, an injected operator cannot survive either
check — wherever it lands. A `&&`, a bare `&`, a `|`, a `^` all reduce to "some
segment is not canonical". Executed: see the evidence table.

A `&` inside any `set "VAR=…"` value or any quoted exec argument is inside a
quoted region, is never seen by rules 1-2, and is therefore never a split point.
That is the whole reason the split is quote-aware rather than
`inner.split(' & ')`: `cmdQuotedToken` (`generators.js:516-524`) does **not**
escape `&`, so a home like `C:\Users\Bob & Alice` would otherwise split a
`set "HOME=…"` value mid-path and drive **every** such install to
`indeterminate` → `unverified` → `schtasks /create /f` on every `sync` — the
permanent-warn-plus-churn failure that justified declaring systemd unimplemented
(Residual 1), and strictly less precise than the shipping
`windowsLoadedTaskMatches` (`schedule.js:184-195`), which gets `Bob & Alice`
right today. The quote structure is unambiguous by construction: `cmdQuotedToken`
**throws** on an embedded `"` and `cmdArgToken` (`generators.js:530-532`) leaves
only `[A-Za-z0-9:._-]` tokens bare, so every `"` in a canonical inner string is a
region delimiter and they are strictly paired.

**Consumer 2 — the exec-segment grammar**, applied to the **last** segment and
**END-ANCHORED**:

```text
EXEC   := QTOKEN " " QTOKEN ( " " ARG )*     anchored ^…$
QTOKEN := '"' [^"]* '"'
ARG    := QTOKEN | BARE
BARE   := [A-Za-z0-9:._-]+                   exactly cmdArgToken's bare charset (generators.js:530-532)
```

Capture 1 is `NODE`, the **execution position** — returned as `exec`, never
compared (Table B; Residual 9). Capture 2 is `LAUNCHER`, what condition (d)
compares. The `( " " ARG )*` tail is the region the round-2 prefix match left
completely unvalidated, and end-anchoring it is the single change that closes
every appended **operator** vector — a `&`, `|`, `<`, `>`, `(`, `)`, `^` or `%`
appended anywhere in the tail now falls outside `BARE` and outside `QTOKEN`, so
the grammar rejects it.

**What end-anchoring does NOT close, stated because a canonical table must not
assert more than it delivers.** The grammar constrains the tail's **lexical
shape**; it does not authenticate the tail's **content**. Anything satisfying
`ARG := QTOKEN | BARE` still grades `match`. Executed by the reviewer against
this grammar: a space followed by a bare `evil.exe` appended (it is a token from
`cmdArgToken`'s own charset) → `match`; a space followed by `"C:\evil.exe"` →
`match`; the canonical
`--descriptor` value swapped to `"C:\evil\forged.json"` → `match`; the
`--expect-digest` value swapped to `sha256:deadbeef` → `match`; a space followed
by `--job-digests <attacker base64url map>` appended → `match`. The launchd row
has the identical hole by construction: Table B decides `match` on `args[1]` alone,
so `args[2..]` — the launcher's own `--descriptor` and `--expect-digest`
authorization arguments — are equally uncompared. **This entire argument tail is
named in Residual 9**, which also records that the routed follow-up
`WP-scheduler-stable-exec-position` does **not** close it. Do not read this
grammar as an authorization check on what the launcher is told to do.

**The closure property: `BARE` must BE `cmdArgToken`'s charset, not resemble it.**
The safety argument above ("an injected operator cannot survive either check")
holds only while the checker's `BARE` and the writer's bare-token test are the
same set. Widen one without the other and the argument silently evaporates —
which is exactly the failure mode that produced this finding in two consecutive
rounds. AC-1's **closure family** is what pins it, and it is **generated, not
hand-asserted**: it iterates a list of cmd.exe metacharacters
(`& | < > ( ) ^ %` — `"` excluded, it is the region delimiter the walk consumes)
and asserts for **every** member `ch`:

1. `generators.cmdArgToken(ch)` returns a **double-quoted** token, i.e. the
   shipping writer would never emit `ch` bare — this reads the writer's real
   charset rather than a copy of it, so the two cannot drift apart unnoticed;
2. `ch` injected **unquoted** into an otherwise-canonical inner string yields
   `indeterminate` — once appended to the exec segment with no spaces, once
   between two binds.

It also asserts the converse direction on a canonical fixture: every token
`windowsCmdArguments` emits bare (`dream`, `--expect-digest`, `sha256:…`) is
accepted by the grammar, so tightening `BARE` away from `cmdArgToken` breaks the
canonical case rather than passing silently.

**Executed evidence** (this session, POSIX host, `mkdtemp` scratch; every fixture
built from the real `generators.windowsCmdArguments`, never hand-written). The
last two columns are the two mutations, run against the same fixtures:

| fixture | round-2 prefix `(c)` (= **M23**) | `BARE` widened to `[^ ]+` (= **M24**) | Table B1 |
|---|---|---|---|
| canonical | `match` | `match` | `{verdict:'match', exec:'C:\Program Files\nodejs\node.exe'}` |
| `&C:\evil.exe` appended, **no spaces** | **`match`** | **`match`** | `indeterminate` |
| `\|C:\evil.exe` appended, **no spaces** | **`match`** | **`match`** | `indeterminate` |
| a space then `C:\evil.exe`, appended (no operator at all) | **`match`** | **`match`** | `indeterminate` |
| `&&` injected between two binds | `indeterminate` | `indeterminate` | `indeterminate` ((c0) rule 1) |
| `evil.exe` then a spaced ` & `, prepended | `indeterminate` | `indeterminate` | `indeterminate` ((c0) rule 1) |
| launcher **and** `HOME` both containing ` & ` | `match` | `match` | `match` — the ` & ` is inside a quoted region |
| `"C:\evil\fake-node.exe"` in the node position | **`match`** | **`match`** | `{verdict:'match', exec:'C:\evil\fake-node.exe'}` — **still `match` here**; `defaultProbe` step 8b and **Residual 9** own this one, not this table |

Two things to read off that table. First, **both mutations redden the same three
append fixtures and nothing else** — which is why M23 and M24 are the only two
mutations Table B1 needs, and why a third mechanism (a runtime operator denylist)
would have had no mutation that could redden it. Second, the last row is the
honest one: Table B1 fixes the argline's *lexical* structure and nothing more.
Whether a syntactically canonical record is *runnable* is step 8b's question, and
whether a runnable-but-substituted executable is acceptable is Residual 9's.

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
| `opts.probe` | `defaultProbe` **wholesale** — steps 3-8b, the `expect` argument and all identity logic are unreachable behind it | `status.defaultProbe` |
| `opts.loader` | the mutation call | `schedule.defaultLoader` → `schedulerSpawn` (`src/scheduler/spawn.js:24`) → a **real, per-user-global** `launchctl` / `systemctl` / `schtasks` mutation |

| Call site | `opts.run` | `opts.probe` | `opts.loader` | Can reach a mutation? |
|---|---|---|---|---|
| `defaultProbe(argv, expect, opts)` | **mandatory in-process** — under the suite's neutralizers it is the only way past steps 1-2; the single exception is AC-3b, which reaches steps 3-8b with **no seam** in a child process whose env omits both neutralizers and whose two argvs are node one-liners | n/a — this *is* the probe | **not accepted** | no |
| `probeAll(paths, opts)` | **mandatory** when `opts.probe` is absent | optional; **forbidden** in AC-4 | **not accepted** | no |
| `doctorSchedulerChecks(paths, opts)` | **mandatory** when `opts.probe` is absent | optional | **not accepted** | no |
| `reloadMissing(paths, opts)` | **mandatory** when `opts.probe` is absent | optional; **forbidden** in AC-5 | **MANDATORY, unconditionally** | **yes** — `schedule.reloadJob` |
| `repairCatchup(paths, manifest, opts)` — **called DIRECTLY via the export this WP adds**, never through `repointSchedules` (see "Why `repairCatchup` is exported") | **mandatory** when `opts.probe` is absent | optional; **forbidden** in AC-12b | **MANDATORY, unconditionally** | **yes** — `darwinReplaceEntry` / `schtasks /create /f`, reached from **three** attended production callers (`sync.js:222`, `adopt.js:422`, `schedule.js:895`) |

Four rules follow, and every acceptance criterion that touches a row must
satisfy them in addition to its own assertion:

- **R1 — no test in this WP deletes `WIENERDOG_TEST_NO_REAL_SCHEDULER`.**
  Injecting `opts.run` is what gets past `defaultProbe` steps 1-2 (see "Exact
  contracts"), so the deletion ritual at
  `tests/unit/scheduler-status.test.js:102-116` must **not** be copied into the
  new file — it deletes **both** neutralizers, and its
  `WIENERDOG_TEST_NO_REAL_SCHEDULER` line is the forbidden one. With that var
  intact, `schedulerSpawn`'s throw stays armed for every test in this WP, so a
  heal that slipped past R2 fails loudly instead of mutating the maintainer's
  launchd.
  **The rule is scoped to the guard var deliberately (round 7), because the two
  neutralizers are not symmetric.** `src/scheduler/spawn.js:24-33` checks
  `WIENERDOG_LOADER_NOOP` **first** and returns `{status:0}`, and
  `WIENERDOG_TEST_NO_REAL_SCHEDULER` **second** and throws. So deleting
  `WIENERDOG_LOADER_NOOP` while the guard var stays set strictly **RE-ARMS** the
  throw — it is the safe direction, and AC-3 *requires* it, because that var is
  **absent** from the suite env (`tests/run.js:7` sets only the guard var) and
  AC-3 must restore it to absent after setting it.
  **Setting `WIENERDOG_LOADER_NOOP` is permitted only in AC-3's neutralizer
  assertion, and only inside a `try … finally` that restores it to ABSENT**,
  using the repo's own idiom at `tests/unit/scheduler-status.test.js:118-127`
  (`if (saved === undefined) delete process.env.WIENERDOG_LOADER_NOOP; else …`).
  Leaving it set is the one way to silently disarm AC-14 layer (ii) for every
  test that follows, since `spawn.js:25` returns `{status:0}` *before* the throw
  at `:26`. (`process.env.WIENERDOG_LOADER_NOOP = ''` also re-arms the throw —
  executed this session: THREW, because every consumer tests truthiness — but it
  does not restore the env to absent, so use `delete`.)
  Machine-checked by verification step 5b's negative grep, which is scoped to
  `WIENERDOG_TEST_NO_REAL_SCHEDULER` alone for exactly this reason; mutation M17.
- **R2 — where `opts.loader` is MANDATORY it is a recording stub**: it pushes its
  argv onto an array and returns a canned `{status}` **without spawning**. The AC
  asserts the recorded list with `assert.deepEqual` against the exact expected
  argv sequence — never `.some(…)` / `.length > 0`, which cannot distinguish "the
  calls I expected" from "those plus others".
  **How R2 is enforced: at RUNTIME, not by reading the test file's source text.**
  Round 3 additionally required the `loader:` key to sit inline on the call's own
  line so a per-line check could police it. That check went through three forms,
  each executed and broken **in both directions**, and it is **deleted** — see
  verification step 5c's replacement comment, which records every bypass and
  every false reject and forbids a fourth attempt (ADR-0031's loop
  circuit-breaker: subtract the mechanism, keep the guarantee). **The inline /
  one-statement / no-comment formatting constraints are withdrawn with it.**
  What remains is stronger because it is executable: R1 keeps
  `WIENERDOG_TEST_NO_REAL_SCHEDULER` set, so an unstubbed call hits
  `schedulerSpawn`'s throw (`src/scheduler/spawn.js:26`) before any scheduler
  process is created. Executed this session: it **throws out of `repairCatchup`**,
  and in `reloadMissing` it is swallowed into `failed` (`status.js:259`) — which
  is exactly why AC-5a and AC-9a additionally assert the returned
  `{reloaded, failed}`. AC-14 states the three layers in order.
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

The marker column is **not** a function of the observed status: it is written
once per `reloadMissing` / `repairCatchup` call, before the **first** replacement
call, for every entry that enters the heal set. The first two rows are why (C3).

| Observed status | 1st `bootstrap` | `bootout` issued? | 2nd `bootstrap` | Pre-destructive marker refresh | End state on a crash mid-sequence |
|---|---|---|---|---|---|
| `missing`, and the label really is absent | succeeds (nothing loaded) | **no** | not reached | **attempted** (before the 1st bootstrap) | n/a — no destructive step is reached |
| `missing`, but the label is in fact still loaded — a **transient** presence-query failure (step 4 maps `r.error` and any non-zero exit to `missing`) | **fails** (label already loaded) | **yes** | issued | **attempted** (before the 1st bootstrap) | whatever the marker's live probe found (†)(‡) — usually `missing`/`mismatched`/`unverified`, **but `loaded` when the transient failure has cleared by the time the marker re-probes**, which leaves the cache optimistic across the destructive window (Residual 8 — a known-open defect, ACCEPTED by the owner on 2026-07-26). `doctor`'s live probe reports `missing` either way |
| `mismatched` | fails (label already loaded) | yes | issued | **attempted** (before the 1st bootstrap) | cache says `mismatched` (†)(‡); digest template F persists; `doctor`'s live probe reports `missing` |
| `unverified` | fails (label already loaded) | yes | issued | **attempted** (before the 1st bootstrap) | cache says `unverified` (†)(‡); digest template U persists; `doctor`'s live probe reports `missing` |
| `loaded` / `unknown` | never called | no | no | **not attempted** — not in the heal set, so no replacement call happens at all | n/a |

(†) The marker re-probes rather than persisting the verdict that triggered the
heal, so what lands in the cache is what the live probe found at that instant —
usually the same member. **It is not always.** A transient failure of the heal
loop's own presence query grades a still-loaded label `missing`; if the transient
condition has cleared when the marker re-probes, the marker persists `loaded` for
that same unchanged record and the cache is optimistic exactly across the
`bootout` window. That needs **no concurrency and no external mutation**.
**Residual 8 is therefore a real defect, not a modelling artefact** — an earlier
draft of this table asserted "never a stale `loaded`" here, and that claim is
false. It was routed to the owner and **accepted on 2026-07-26 as a known-open
defect this WP ships with** (transcribed under Residual 8); the follow-up
`WP-scheduler-marker-persists-verdict` stays routed.

(‡) **"Attempted", not "written".** `refreshSchedulerStatus`
(`src/scheduler/status.js:131-140`) swallows every `mkdir`/`write`/`rename`
error in a bare `catch {}`, so the marker is best-effort **by inheritance** and
the caller is not told. Atomic rename prevents a *partial* file; it does not make
a failed write durable. When the write does not land, the pre-existing cache
contents are left intact — possibly a stale `loaded` from the last
`run-job` refresh (`src/cli/run-job.js:1236`) — and the "End state" column above
degrades to that stale value for exactly the crash window. The replacement
**still proceeds** — and **whether it may** was an owner decision, not this
spec's: Residual 10 and round-2/3 disposition 4 set out the two readings of
ADR-0018:294-296, Definition of done item 9 routed it, and the owner ruled on
2026-07-26 that **Reading B governs — so it may**. `doctor`'s live probe
is the recovery either way.

### Mirrored Surface Checklist

**Table A (status taxonomy)** — surfaces that mirror it:

- [ ] Deliverables rows for `src/scheduler/status.js`, `src/cli/schedule.js`, `src/cli/doctor.js`, `src/cli/dream.js`
- [ ] "Exact contracts" → `defaultProbe` steps 5-8 **and step 8b**, `probeAll`'s `expect`, `reloadMissing`'s `HEAL_SET`, `repairCatchup`'s heal gate **and its notice discipline**
- [ ] Acceptance criteria AC-3, AC-3c, AC-4, AC-5, AC-6, AC-7, AC-12, AC-12b **and AC-12c** (the notice discipline is a Table A fact — which observed member gets which notice — so it belongs on this row; its absence here in round 3 was the same partial-registration drift this checklist exists to prevent)
- [ ] Verification greps for `'mismatched'` / `'unverified'` in `src/scheduler/status.js`
- [ ] Current state: `status.js:85`, `status.js:159-171`, `status.js:181-194`, `status.js:257`, `schedule.js:607/626`, `schedule.js:619/639` (the notice strings), `generators.js:20-22` (`nodePath` = `process.execPath`, why step 8b exists)
- [ ] Table D (the one existing assertion it invalidates)
- [ ] Table E (which statuses reach the destructive path)
- [ ] The **"why a deleted execution-position program is `mismatched` and NOT a sixth member"** note, which is the one place this WP reads owner-signed ADR text rather than restating it
- [ ] Mutation checks M3, M4, M5, M6, M7, M11, M12, M13, M14, M25 **and M28**
      (M28 appeared in **no** table's checklist before round 5 — structurally the
      same drift that left the `repairCatchup` marker ungated until AC-9c)
- [ ] **`docs/adr/0018-windows-scheduled-dreaming.md` — the 2026-07-25 amendment,
      decisions 1-2** (it names the members, the fail-closed default and the
      `doctor` severities). It is **not** a Deliverables row (nobody edits it from
      this WP) but it **is** the merge gate (Definition of done 8), so it drifts
      silently unless registered here. It is owner-signed: a future divergence is
      resolved by amending the ADR in its own pass, never by editing it from a WP
- [ ] **`docs/specs/logbook/2026-07-25-third-scheduler-identity-incident.md`**
      (restates the member names and the heal set). Verified consistent with
      this table on 2026-07-25; **do not edit it from this WP** — if a future
      change makes it wrong, that is a logbook edit in its own pass

**Table B (per-platform identity)** — surfaces that mirror it:

- [ ] Deliverables row for `src/scheduler/generators.js`
- [ ] "Exact contracts" → `deriveIdentityArgv` / `loadedEntryTargets` signatures (**the `{verdict, exec}` pair**) and the basename-shape table
- [ ] `defaultProbe` step 8 and **step 8b** — the only consumers of `exec`
- [ ] Acceptance criteria AC-1 (including fixture (ii-b), the poisoned canonical bind), AC-2, AC-3c
- [ ] Verification greps for `loadedEntryTargets` / `deriveIdentityArgv`; the darwin real-machine step 7 (**which asserts `.verdict`, not a bare string**)
- [ ] Current state: `generators.js:20-22`, `:129-143`, `:261-270` (the canonical binding set condition (c0) binds to), `:494-497`, `:516-524`, `:530-532`, `:556-567`, `:622-631`; `schedule.js:184-195`; **`paths.js:21-31` (rule 4a's source of truth) and `launcher.js:426-431`/`:217-231`/`:472-478` (why rule 4a's justification is writer-canonicality, not runnability)**
- [ ] Mutation checks M1, M2, M15, M18, M22, **M29** (condition (c0) rule 4's normalized comparison), **M30** (rule 4a's pre-normalization component check), M25
- [ ] **`src/core/paths.js:23-29` — `assertSafeOverride`'s component scan
      (`segs = value.split(/[\\/]+/)`; reject on
      `segs.includes('..') || segs.includes('.')`), which condition (c0) **rule
      4a** mirrors rather than restates.** It is **not** a Deliverables row
      (nothing in this WP edits it — disposition 6(b) records why) and it is not
      owner-signed prose but shipping code, so the mirror is kept true by citing
      it at the point of use in rule 4a and in AC-1 (ii-b). If a future change
      widens or narrows that function's component rule, rule 4a follows it in the
      same pass — never the reverse, and never by hand-copying a
      similar-looking regex
- [ ] The **evaluation order** `(0) → (a) → (b) → the Table B1 split → (c) → (d) → (c0)` and
      the reason (d) outranks (c0) — mirrored in AC-1 (ii-b) and in the
      "Why (0), (a), (b) and (c0) map to `indeterminate`" note
- [ ] Residuals 1, 2, 7 and **9** (systemd declared-unimplemented; the unverified Windows round-trip; `parseWindowsTaskExec`; the unauthenticated execution position)
- [ ] Definition of done item 7 (the owner Windows-VPS checklist)
- [ ] **`docs/adr/0018-windows-scheduled-dreaming.md`** — decision 1's positional
      rule and the "Scope and honesty about platforms" paragraph (systemd
      declared unimplemented, the Windows round-trip disposition)
- [ ] **`docs/specs/logbook/2026-07-25-third-scheduler-identity-incident.md`**
      (restates `argv[1]` and the Windows `<Arguments>` token). Verified
      consistent on 2026-07-25; not edited from this WP

**Table B1 (the Windows exec segment)** — surfaces that mirror it:

- [ ] Deliverables row for `src/scheduler/generators.js` (the "no new constant" note — B1 reuses `cmdArgToken`'s charset)
- [ ] `src/scheduler/generators.js:530-532` — `cmdArgToken`, the **single** owner of the bare-token alphabet B1's `BARE` production must equal
- [ ] Table B's schtasks row (`exec` column, `match`/`mismatch`/`indeterminate` cells) and its conditions (b), (c), (c0), (d) — **all of which cite B1 and none of which restate it**
- [ ] Acceptance criteria AC-1 (ii), (ii-b), (iv), (v), **(vii) the closure family**, and (viii) the appended-operator fixtures
- [ ] Mutation checks M18, M22, M23, M24
- [ ] Residual 9 (what a syntactically canonical record may still execute)
- [ ] Current state: `generators.js:516-524`, `:530-532`, `:556-567` (the bare-token charset, the `' & '` join, the no-`&`-escaping fact the quote-aware split rests on)
- [ ] **`docs/adr/0018-windows-scheduled-dreaming.md`** — decision 1's *"nothing
      but the canonical `set "VAR=…"` binds may precede the launcher in the
      `cmd.exe` command chain"*. B1 additionally constrains what may **follow**
      it; that is a narrowing inside the same decision, not a new one, but it is
      registered here so a future ADR pass can widen the sentence if the owner
      prefers it stated explicitly

**Table C (test seams)** — surfaces that mirror it:

- [ ] "Exact contracts" → `defaultProbe`'s seam resolution and steps 1-2, the
      `probeAll` / `reloadMissing` / `repairCatchup` forwarding snippets, **and
      "Why `repairCatchup` is exported"** (the export is a seam fact: it is what
      makes AC-9c / AC-12b / AC-12c writable at all)
- [ ] Deliverables row for `src/cli/schedule.js` (the `module.exports` addition)
      and verification step 5's anchored exports-line grep
- [ ] Implementation notes → "Test seams in the new tests"
- [ ] Security checklist bullet 3 (what backstops a mutation in these tests)
- [ ] Acceptance criteria AC-3, AC-3b (the one no-seam exception to the row), AC-4, AC-5, AC-12b, AC-14
- [ ] Verification step 5b's negative grep, scoped in round 7 to `delete process.env.WIENERDOG_TEST_NO_REAL_SCHEDULER` (R1) — the `LOADER_NOOP` alternation was removed because R1 *requires* that deletion in AC-3's restore-to-absent `finally`, and the grep was rejecting a conforming test. AC-3's restoration idiom is a mirror of R1 too. **Step 5c is DELETED** — R2 is now enforced at runtime (the armed suite guard plus AC-5a/AC-9a's `{reloaded, failed}` assertions and every criterion's recorded-argv `deepEqual`), not by any structural check on the test file's source; step 5c's replacement comment is the record of why, and it forbids re-adding one
- [ ] Current state: `status.js:80-86` (the neutralizer order), `spawn.js:24-36`, `schedule.js:565` + `sync.js:222` + `adopt.js:422` + `schedule.js:895` (the three attended production callers that reach `repairCatchup`'s mutation)
- [ ] Mutation checks M12, M13, M16, M17, M19, **M20 (repurposed in round 5 — it now removes an `opts.loader` and must redden a TEST, not a grep)**
- [ ] **`docs/adr/0018-windows-scheduled-dreaming.md`** — the 2026-07-07
      amendment's decision 2 invariant (*every scheduler mutation goes through
      `schedulerSpawn`; every scheduler test uses a seam AND is backstopped by
      the suite guard*), which the 2026-07-25 amendment's decision 3 claims to
      retain. R1 is what keeps that claim true

**Table E (the darwin replacement)** — surfaces that mirror it:

- [ ] Deliverables row for `src/cli/schedule.js`
- [ ] "Exact contracts" → `darwinReplaceEntry`, the two call sites, the marker
      rule (**unconditional** at both sites — `reloadMissing`'s `HEAL_SET` snippet
      and `repairCatchup`'s bullet)
- [ ] Acceptance criteria AC-8, AC-9a, AC-9b **and AC-9c** — AC-9c is what makes
      the checklist's own "unconditional at BOTH sites" claim executable; before
      round 3 this row registered only the `reloadMissing` criteria while the rule
      spanned two sites, which is a **drifted mirror** and is why the
      `repairCatchup` marker had no gate at all
- [ ] Verification grep for `darwinReplaceEntry`, **and for `refreshSchedulerStatus` in `src/cli/schedule.js`** (0 matches on `main` — discriminating)
- [ ] Current state: `schedule.js:714`, `:618`, `:287`, `:402`; `status.js:131-140`
      (`refreshSchedulerStatus` re-probes — Residual 8, a known-open defect the owner accepted on 2026-07-26 — **and swallows every write
      error** — Residual 10)
- [ ] Implementation notes → "Why bootstrap first" and "Why the marker, and why
      it is UNCONDITIONAL" (including the `markerAttempted` naming rule)
- [ ] Residuals 3, **8 (a real defect as of round 5, routed to the owner and ACCEPTED by him on 2026-07-26 as known-open — the marker's re-probe can persist `loaded` with no concurrency at all; Table E row 2 and the `(†)` footnote were corrected to match, and both now carry the accepted disposition)** and 10 (the crash window; the marker's best-effort write — the ungated replacement was ruled permissible on 2026-07-26, Reading B)
- [ ] Mutation checks M8, M9, M10, M21, M26, M27
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
  is only touched after launchd refuses the bootstrap. **Three attended commands
  heal, not one** — `wienerdog sync`, `wienerdog adopt` and
  `wienerdog schedule remove` all reach `repairCatchup` through
  `repointSchedules` (see Current state); no unattended path heals (`run-job`
  refreshes the cache but never heals, `status.js:257`). The churn is therefore
  still user-initiated and bounded, but the count is three, and the
  `repairCatchup` notice discipline above exists precisely because one of those
  three (`adopt`) turns any notice into a user-facing failure. Linux cannot reach
  `unverified` at all (Table B systemd row → `unknown`), which is the point of
  Residual 1.
- **`stdio: 'ignore'` → `encoding: 'utf8'`.** The presence spawn must now
  capture stdout. Bound nothing else: these outputs are small and
  scheduler-owned. Do not add a timeout or a size cap; do not introduce a new
  spawn helper.
- **The parsed scheduler output is untrusted text but is only ever compared.**
  It is never executed, never `path.join`ed, never written to disk.
- **Test seams in the new tests — Table C decides this; do not improvise.**
  `npm test` (`tests/run.js:7`) sets `WIENERDOG_TEST_NO_REAL_SCHEDULER` for the
  whole suite, and this WP keeps it that way: injecting `opts.run` is what gets
  past `defaultProbe` steps 1-2, so **no new test deletes
  `WIENERDOG_TEST_NO_REAL_SCHEDULER`** (Table C R1) and `schedulerSpawn`'s throw
  stays armed throughout. `opts.loader` is mandatory wherever a heal is
  reachable (R2). Do **not** copy the save/`delete`/restore pattern at
  `tests/unit/scheduler-status.test.js:102-116` — it belongs to a pre-existing
  test that has no `run` seam, it deletes the guard var, and reproducing it is
  exactly how a WP-mandated test issues a real `launchctl bootout` against the
  maintainer's launchd. The *other* neutralizer is different: AC-3 must set
  `WIENERDOG_LOADER_NOOP` and restore it to absent with `delete` in a `finally`
  (the idiom at `tests/unit/scheduler-status.test.js:118-127`) — deleting that
  one re-arms the throw, and **leaving it set** is what would disarm it for the
  rest of the file. Table C R1 states both halves; do not improvise either.
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
  amendment, `Accepted. OWNER-SIGNED 2026-07-26.` — ratified, not proposed:
  `docs/adr/0028-scheduler-app-executable-integrity.md:752`). Do not re-propose
  either, and do not file them as
  Discovered issues. Note anything **else** you find there; do not fix it.
- **Ambiguity → choose the simpler option** and record it under "Decisions
  made" in the PR body. Do NOT expand scope to resolve ambiguity.

### Round-2 / 3 / 5 review dispositions (things deliberately NOT done)

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
4. **Gating the destructive replacement on the marker having been persisted —
   NOT AN ARCHITECT'S CALL. ROUTED TO THE OWNER, BOTH READINGS PRESENTED, AND
   RULED ON 2026-07-26: Reading B governs, so this disposition STANDS AS
   WRITTEN.** Both readings are kept below deliberately: they are the record of
   how the question was settled, not an open question.
   Round 2's Codex leg asked for `refreshSchedulerStatus` to report success and
   for the `bootout` to be skipped when it failed. The **observation** behind it
   is correct and is recorded (`markerAttempted`, Table E's `(‡)` footnote,
   Residual 10): with `EACCES`/`ENOSPC` the refresh silently fails, a stale
   `loaded` cache survives, the replacement proceeds anyway, and a kill after the
   `bootout` reproduces the outcome ADR-0018's signed postcondition describes as
   excluded.

   **This turns on what owner-signed text MEANS, and the two review legs read it
   oppositely.** `docs/adr/0018-windows-scheduled-dreaming.md:294-296` reads, in
   full: *"Before any destructive replacement, the durable status cache is
   refreshed from the live probe, so a process killed mid-replacement leaves a
   pessimistic record rather than a stale `loaded` one."*

   - **Reading A (Codex — the WP is blocked).** The sentence states a
     *postcondition*, not just a step: "leaves a pessimistic record rather than a
     stale `loaded` one" is the guaranteed outcome. A best-effort refresh whose
     failure is invisible does not deliver it, so shipping the ungated
     replacement **waives a signed postcondition**. In Codex's words: *"The
     tradeoff may be reasonable policy, but it requires an owner amendment; a WP
     residual cannot waive the current signed postcondition."*
   - **Reading B (wd-reviewer — the disposition is sound).** The sentence
     mandates that the cache be *refreshed* before a destructive replacement; the
     "so …" clause states the intent of doing so, not an independent obligation
     to **abandon** the replacement when the refresh fails. The refresh is
     performed unconditionally, therefore the requirement is met; naming the
     residual honestly is the correct disposition.

   **The architect did not pick — the owner did.** Which reading governs is an
   authority question about signed text, and neither an architect nor a reviewer
   may settle it. It was Definition of done item 9, and it is now answered:

   > **OWNER-RATIFIED IN SESSION (TRANSCRIBED, NOT OWNER-TYPED)** — 2026-07-26.
   > Gyula ruled verbally in session, in one word: **"refresh"**. **Reading B
   > (wd-reviewer) governs**: the signed sentence mandates that the durable cache
   > be *refreshed* before a destructive replacement, **not** that the replacement
   > be abandoned when the refresh fails. **Reading A (Codex) is not the governing
   > reading**, so the residual-and-honesty disposition below is not a waiver of
   > signed text. Transcribed by the orchestrating session, **not typed by
   > Gyula**: a decision record, not a signature, deliberately **not** an
   > `OWNER-SIGNED` line, and satisfying no gate that requires one.

   **Do not delete Reading A and do not reopen the choice in a later round.** The
   side-by-side presentation above is the record of how this was settled.

   **Reading B governs, so** the three reasons the ungated form was
   preferred stand and belong in the PR's "Decisions made", in order of weight.
   (i) When `state/scheduler-status.json` cannot be written, the durable channel
   is already dead on that machine — `run-job`'s hourly refresh and `sync`'s
   trailing refresh use the same swallowing writer — so gating does not make the
   cache honest, it only withholds the repair. (ii) The harm gating prevents needs
   **two** independent failures at once (an unwritable state dir **and** a kill
   inside a window of two adjacent synchronous spawns); the harm gating **causes**
   needs only the first, and it is the refusal to repair a hijacked entry — the
   exact failure this WP exists to end. (iii) `doctor`'s live probe is unaffected
   by an unwritable state dir and still reports `mismatched` with exit 1, so the
   user is not left silent either way.
   **Had the owner picked Reading A — he did not** — this WP would have been
   blocked on an ADR-0018 amendment
   that either (a) qualifies the postcondition to match a best-effort writer, or
   (b) requires the replacement to be abandoned on a failed refresh — in which
   case `refreshSchedulerStatus` would first have had to report persistence, which
   is `WP-scheduler-status-write-observable` (Residual 10) and would have been a
   prerequisite of this WP rather than a follow-up. That branch is recorded so the
   counterfactual stays visible; **it is moot**. Either way the ADR's unconditional
   *"leaves a pessimistic record"* clause is still reported as a Discovered issue
   (disposition 5); do not edit the ADR from this WP.
5. **Two ADR-side inaccuracies are reported, NOT fixed here.** `docs/adr/0018-…:297`
   says *"`sync` remains the sole healer"*; executed at `efd1489`, `repairCatchup`
   is reachable from `sync.js:222`, `adopt.js:422` and `schedule.js:895` — the
   claim is false on `main`, before this WP, and this spec no longer repeats it.
   Decision 2's *"so a process killed mid-replacement leaves a pessimistic
   record"* is likewise unconditional where the writer is best-effort
   (disposition 4, and the subject of the owner decision in Definition of done
   item 9 — **ruled 2026-07-26 for Reading B, which settles which reading governs
   but leaves this wording imprecision to the amendment**).
   The ADR is **owner-signed and deliberately not a deliverable**; per this spec's own Mirrored Surface rule a divergence is
   resolved by amending the ADR in its own pass. Put both under **"Discovered
   issues"** in the PR body with the proposed follow-up slug
   `WP-adr-0018-healer-and-marker-precision`. Do not edit the ADR to make them
   agree, and do not treat either as a blocker for this WP.
6. **Round 5: two SUBTRACTIONS and one one-token addition — recorded so they read
   as decisions, not drift.**
   (a) **Verification step 5c is DELETED, not refined.** Three successive forms
   of a per-line structural check on the test file's JavaScript source were
   specified and all three were executed and broken **in both directions** (the
   third accepts `status.reloadMissing(paths, (schedule.repairCatchup(paths, m, { loader: rec }), {}));`
   — one statement, one `;`, an inline `loader:`, no comment, outer call
   unstubbed — and rejects conforming calls whose options object contains a
   string with `;` or `//`, an inline `https://…` fixture being the ordinary
   case). ADR-0031's loop circuit-breaker says subtract, and the guarantee it was
   approximating already exists at runtime (AC-14 layers (ii) and (iii)). The
   round-3 formatting constraints it imposed are withdrawn with it. Mutation M20
   is repurposed to redden a **test** instead of a grep.
   (b) **Table B condition (c0) rule 4 compares `path.win32.resolve()`-normalized
   paths** (rule 4c), not raw strings — a healthy non-default `$WIENERDOG_HOME`
   (trailing separator, or forward slashes) otherwise gets permanent `unverified`
   plus a `schtasks /create /f` on every `sync` that never converges.
   `src/core/paths.js`
   was **rejected** as the place to fix it: it would be an 8th deliverable and
   would change the identity of a security-validated value for every other
   consumer. Mutation M29 gates it.
   **Round 8 bounded that normalization with rule 4a**, a component check applied
   **before** it: round 6 review found `resolve()` alone accepts non-canonical
   *spellings* of the right directory (`…\.wienerdog\child\..`,
   `…\.wienerdog\.\`) and grades them `match` → `loaded` → green `doctor`, even
   though `paths.core` — the only value any call site ever passes as `core` — can
   never contain such a component. 4a is stated as a **mirror of
   `assertSafeOverride`'s component scan (`src/core/paths.js:23-29`)** and cites
   it rather than restating it; that file is still not a deliverable and is still
   not edited. **Decided deliberately for `…\.wienerdog\.\`: it is REJECTED**,
   even though it denotes the same directory and the round-6 reviewer read it as
   a correct `match` on directory-equivalence grounds. (c0)'s charter is
   "**exactly** the canonical env-binding set", and directory equivalence is not
   canonicality — our writer cannot emit that string, so a record carrying it is
   not one of ours and `unverified` (a warn plus one idempotent heal) is the
   honest grade. Mutation M30 gates 4a; M29 does not, because reverting to the
   raw comparison rejects both spellings for an unrelated reason.
   (c) **`repairCatchup` is added to `src/cli/schedule.js`'s `module.exports`.**
   AC-9c, AC-12b and AC-12c are literally unwritable without it — executed
   evidence under "Why `repairCatchup` is exported". No behavior, signature or
   caller changes; verification step 5 greps the exports line so it cannot be
   dropped.
7. **`repairCatchup`'s success notice is narrowed rather than rewritten, and
   `src/cli/adopt.js` is NOT touched.** See the notice discipline under "Exact
   contracts". The alternative — teaching `adopt`'s `rebindFailed` heuristic to
   distinguish "repaired an `unverified` entry" from "repaired a `missing` one" —
   would add another deliverable file and change an unrelated command's
   success/failure semantics to fix a problem this WP creates at the notice
   source. Fix it at the source.

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
   (Table E) makes the durable cache pessimistic for that window **when its write
   lands** (Residual 10 covers when it does not), and
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
5. **`wienerdog sync` exit code on a failed heal** — see disposition 1.
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
8. **KNOWN-OPEN DEFECT, ACCEPTED BY THE OWNER FOR NOW (2026-07-26): the
   pre-destructive marker RE-PROBES rather than persisting the verdict that
   triggered the heal.**
   *(Routed to the owner and RULED — the transcription sits at the end of
   "Routing" below. Two consecutive rounds produced two different accepting
   arguments and BOTH were falsified. This spec does not offer a third, and the
   ruling is not one: it accepts the defect, it does not justify it. Everything
   from here to "Routing" is the round-5 text, unchanged — only the disposition
   changed, from open blocker to accepted known-open defect.)*

   **What the code does.** `refreshSchedulerStatus` (`src/scheduler/status.js:131-140`)
   runs `probeAll` and writes what it finds *now*, not the verdict that put the
   entry in the heal set. Two probes of the same entry, moments apart, decide
   what lands in the durable cache immediately before a `bootout`.

   **The falsification — no concurrency is required, and this is the second time
   the accepting grounds were wrong.** Round 3 argued "only a second concurrent
   healer can make the marker optimistic". Round 4 narrowed it to "only an
   external mutation can make the two probes disagree, because `launchctl print`
   is deterministic for an unchanged record". Both are false, and a **single
   process on an idle machine** defeats them:

   1. the heal loop's presence query fails **transiently** — a killed spawn, a
      busy `launchctl`, any `r.error`. `defaultProbe` step 4 maps that to
      `missing` for a label that is in fact still loaded;
   2. the entry enters the heal set, and the marker's `refreshSchedulerStatus`
      re-probes. That second query **succeeds** (the transient condition is gone)
      and grades the **unchanged** record `loaded`, which is what gets persisted;
   3. `darwinReplaceEntry`'s first `bootstrap` fails, because the label really is
      occupied, so `bootout` issues;
   4. a kill between the `bootout` and the second `bootstrap` leaves **no entry**
      while the durable cache says `loaded`.

   The two probes read the same unchanged record and disagreed because the
   **first** one failed, not because anything was mutated. That falsifies the
   determinism premise directly, and with it Table E row 2's former claim that
   the cache is "never a stale `loaded`" — which is why that cell now says the
   opposite. Note this is the *same* transient-failure path that the
   "Why the marker is UNCONDITIONAL" note relies on to justify writing the marker
   at all: the spec cannot invoke that path to argue the marker is necessary and
   then assume it away to argue the marker is sufficient.

   **The dissent that was right (leg 1, Codex).** An open behavioral defect, not
   an acceptable residual: concurrency is an ordinary operating condition rather
   than an A12-only one, `src/scheduler/status.js` is already a deliverable so the
   fix needs no new file, and ADR-0018's postcondition is not qualified.

   **What is still true and is NOT in dispute.** The three production callers
   (`sync.js:222`, `adopt.js:422`, `schedule.js:895`), the correction that
   `sync` is not the sole healer, and the fact that no unattended path heals
   (`status.js:257`) were all re-verified in round 4 and stand.

   **Routing — this is the honest disposition, and it is not a justification.**
   *We know of no accepting argument that survives review.* Closing it in code
   means persisting the **observed** status for the entry being replaced instead
   of re-probing, which needs (a) a new targeted single-entry writer in
   `src/scheduler/status.js`, and (b) an **ADR-0018 amendment**, because the
   owner-signed text says the cache is refreshed *"from the live probe"* and
   persisting the observed verdict reads against that wording. An architect may
   not override owner-signed text from inside a WP. **Owner: Gyula.** Follow-up:
   `WP-scheduler-marker-persists-verdict`, carrying the ADR amendment with it —
   **still routed; the ruling below does not close it.**

   > **OWNER-RATIFIED IN SESSION (TRANSCRIBED, NOT OWNER-TYPED)** — 2026-07-26.
   > Gyula ruled verbally in session: **"ship as a known-open defect for now."**
   > This WP therefore ships with the defect **stated**, as an **accepted**
   > residual rather than an open blocker. **"For now" is his own qualifier and is
   > load-bearing:** it accepts the current state; it does **not** close the
   > underlying defect and it is **not** a third accepting argument — the two
   > falsified accepting grounds above and Codex's recorded dissent stand exactly
   > as written. `WP-scheduler-marker-persists-verdict` (the single-entry writer in
   > `src/scheduler/status.js` plus the ADR-0018 amendment) **remains routed**.
   > Transcribed by the orchestrating session, **not typed by Gyula**: a decision
   > record, not a signature, deliberately **not** an `OWNER-SIGNED` line, and
   > satisfying no gate that requires one.

   **The PR body must still name this as a known open defect in those words**, and
   must still not restate it as an accepted **tradeoff**. What the owner accepted
   is *shipping with* the defect; he did not accept the argument that the defect is
   harmless, because no such argument survived review.

9. **The EXECUTION POSITION is authenticated for existence only, and THE ENTIRE
   LAUNCHER ARGUMENT TAIL is not authenticated at all.** Stated exactly, because
   this is the boundary of what a `loaded` verdict means: **a record graded
   `loaded` may start ANY program that exists on disk, provided our launcher sits
   in the launcher position immediately after it — and may pass that launcher ANY
   arguments whatsoever** (`args[0]`/`args[1]` on launchd, with `args[2..]`
   uncompared; Table B1's `NODE`/`LAUNCHER` on schtasks, with the
   `( " " ARG )*` tail constrained only in lexical shape).

   **The argument tail is not a footnote — it carries the launcher's own
   authorization.** `--descriptor` names the job descriptor `launch.js` will
   execute and `--expect-digest` is the digest it checks that descriptor against
   (`generators.js:534-567`); `--job-digests` carries the catch-up authorization
   map. Executed by the reviewer against Table B1's end-anchored grammar, all
   five still grade `match`: a space plus a bare `evil.exe` appended; a space plus
   a quoted `"C:\evil.exe"`; `--descriptor` swapped to `"C:\evil\forged.json"`;
   `--expect-digest` swapped to `sha256:deadbeef`; and a space plus
   `--job-digests <attacker map>` appended. The launchd row is the same by
   construction. So end-anchoring closed every appended **operator** vector and
   nothing else; Table B1 says so in those words.

   **The routed follow-up does NOT cover this.**
   `WP-scheduler-stable-exec-position` (below) makes the **execution position**
   comparable. It says nothing about the argument tail, so that follow-up alone
   would leave this residual half-open. Closing the tail needs its own decision —
   compare the whole launch argv against what `windowsCmdArguments` /
   `launchdPlist` would emit for this install, which is a stricter contract than
   this WP's `unverified`-on-any-deviation posture can absorb without a Windows
   round-trip verification (Residual 2). Proposed slug for the tail:
   `WP-scheduler-argument-tail-identity`. Owner: architect. Both follow-ups are
   needed; neither subsumes the other. `defaultProbe` step 8b closes the *accidental* half of this — a
   node binary deleted by a `brew upgrade` / `nvm uninstall` / package removal,
   which is the incident restated with "node path" for "launcher path" — because
   a path that no longer exists is a definite failure. It does **not** close the
   *substituted* half: `"C:\evil\fake-node.exe"` or `/bin/sh` in the execution
   position, with our launcher as its first argument, still grades `loaded`.
   **Why not compare it.** There is nothing stable to compare against. The value
   is `process.execPath` at registration time (`generators.js:20-22`), which
   legitimately moves on every node upgrade and differs between `nvm`-managed
   shells on the same machine. Comparing it would give `unverified` → heal →
   re-register on machines that are perfectly healthy, and under `nvm` it would
   **flap** — two CLIs run under different node binaries would re-register on
   every alternating `sync`, which is exactly the permanent-churn failure mode
   that justified Residual 1. Existence is the strongest predicate available that
   converges.
   **Who this leaves exposed.** Rewriting the execution position needs the same
   privilege as re-registering the entry outright: on Windows the value lives in
   the registered `<Arguments>` (`generators.js:534-555` documents that changing
   them needs registration privilege), on macOS in the loaded record. That is
   **Residual 6's** out-of-scope same-user actor, and unlike (0)/(c0) — which
   this spec deliberately carves OUT of Residual 6 because an inherited legacy
   argline is not an adversary — a substituted-but-existing executable has no
   accidental origin. Owner: architect. Follow-up (a real one, not a
   never): bind the execution position by requiring the registered entry to
   invoke a Wienerdog-owned trampoline under `<core>` whose path IS stable, so
   the execution position becomes comparable; proposed slug
   `WP-scheduler-stable-exec-position`.
10. **The pre-destructive marker's write is BEST-EFFORT and its failure is
    invisible.** `refreshSchedulerStatus` swallows every `mkdir`/`write`/`rename`
    error in a bare `catch {}` (`src/scheduler/status.js:139`) and returns
    `void`, so `reloadMissing` / `repairCatchup` cannot tell whether the marker
    landed — which is why this spec's flag is `markerAttempted` and why Table E's
    marker column says *attempted*. Atomic rename prevents a **partial** file; it
    does not make a **failed** write durable. When the write does not land, the
    previous cache contents survive — possibly a stale `loaded` from the last
    `run-job` refresh — and the destructive replacement **proceeds anyway**.
    **Whether that is permissible under ADR-0018:294-296 was an OWNER decision, and
    it is RULED: Reading B governs, so it is permissible** (2026-07-26, transcribed
    under disposition 4 and again under "Owner decisions"). Disposition 4 keeps
    both readings on the page as the record of how it was settled, and the three
    reasons the ungated form was preferred therefore apply. **This residual stands
    as written — it is not a blocker.**
    Recovery is `doctor`'s live probe, which never reads the cache. Owner:
    architect. Follow-up: make `refreshSchedulerStatus` report persistence and
    decide the fail-closed direction in a spec of its own; proposed slug
    `WP-scheduler-status-write-observable`. That WP would also carry the
    ADR-0018 precision amendment named in disposition 5.

## Security checklist

- [ ] `deriveIdentityArgv`'s three basename regexes are fully anchored
      (`^…$`, no `m` flag) and use the same `[a-z0-9][a-z0-9-]*` name charset as
      `deriveProbeArgv`, so `/`, `\`, `..`, spaces and quotes in a poisoned
      filename can never reach a derived argv.
- [ ] `loadedEntryTargets` treats its `stdout` argument as untrusted display
      text: string comparison only. No `path.join`, no `require`, no `fs` call,
      no spawn takes any value parsed out of it. It never throws. This is why the
      execution-position check lives in `defaultProbe` step 8b instead — keeping
      the function filesystem-free is also what lets AC-1 run Windows fixtures on
      a POSIX host.
- [ ] `defaultProbe` step 8b's `fs.existsSync(exec)` is the **single** filesystem
      touch anywhere in the identity path, and `exec` is scheduler-supplied text.
      It is a `stat` and nothing else: never an `open`, never a spawn, never a
      `require`, never a write, and the result is used only as a boolean. It is
      not `path.join`ed with anything, not normalized, and not passed on.
      `fs.existsSync` does not throw — it returns `false` on `ELOOP`,
      `ENAMETOOLONG`, `EACCES` and every other error, which is the fail-closed
      direction (`mismatched` → heal). A hostile `exec` value can therefore cost
      one `stat` and nothing more.
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

**One rule that applies to every canned `launchctl print` fixture below.** The
`arguments` block's **first** entry is the execution position, and `defaultProbe`
step 8b `stat`s it. Any fixture that must produce `loaded` therefore has to put a
path that **exists** there — use `process.execPath`. Any fixture that must
produce `mismatched` may achieve it either way (a foreign `args[1]`, or a
nonexistent `args[0]`); say which in a comment so the next reader knows what the
assertion is actually pinning. AC-3c is the criterion that isolates the second
mechanism.

- [ ] **AC-1** `loadedEntryTargets` returns `{verdict, exec}` per Table B and
      Table B1 for `launchd` and `schtasks`, driven by canned stdout fixtures —
      no OS scheduler is invoked, and (per the Security checklist) no filesystem
      is touched, which is what lets the Windows fixtures run on this POSIX host.
      **Assert `.verdict` explicitly, never the whole return value against a bare
      string** — a `{verdict, exec}` object is truthy, so `assert.equal(ret,
      'match')` would fail and `assert.ok(ret)` would pass vacuously. Where a
      fixture's execution position matters (the closure family, (vi), (ix)),
      assert `.exec` too.
      **Wrap EVERY `<Arguments>` and `<Command>` value in
      `gen.windowsXmlEscape(...)` when building a `schtasks` fixture.** Real
      `schtasks /query /xml` output is XML-escaped and `parseWindowsTaskExec`
      (`generators.js:622-631`) unescapes on the way back in; an unescaped fixture
      is not what the product will see. Executed at `efd1489`: the round-trip
      `parseWindowsTaskExec(escape(argline)).arguments === argline` holds
      (including for a `home` containing ` & `), and
      `windowsXmlUnescape(rawArgline) === rawArgline`, so **no verdict changes
      either way** — the wrapping costs nothing and exercises the unescape leg
      that would otherwise never run in this suite.
      The `schtasks` fixtures MUST include, each asserted separately and none
      returning `match`:
      (i) the executed hijack shape — `<Command>` = a PowerShell path, the
      expected launcher present *inside* the `set "VAR=…"` chain of
      `<Arguments>`, a different launcher in the exec segment;
      (ii) **the prepended-command shape** (Table B condition (c0)) — a
      canonical `<Command>`, a canonical envelope, our launcher in the final
      exec segment, and a **non-`set` first segment** (`evil.exe` and, as a
      second fixture, `"evil.exe"`) → `indeterminate`;
      (ii-b) **the poisoned-binding shape** (Table B condition (c0), rules 2-3) —
      a canonical `<Command>`, a canonical envelope, our launcher alone in the
      final exec segment, and the canonical binds **except** that `NODE_OPTIONS`
      is bound to `--require C:\evil.js` instead of the empty string →
      `indeterminate`. This fixture gets **its own named test** — name it
      `entry-identity: schtasks (c0) binds to the canonical set, and (d) outranks it`
      — because it is the one shape a *shape-based* (c0) scores `match` while node
      loads the attacker's module inside the launcher's own process before
      `launch.js` runs. Assert in that same named test: an **extra** bind appended
      to the canonical eight (`set "FOO=1"`) → `indeterminate`; a **missing** one
      (drop `set "CODEX_HOME="`) → `indeterminate`; and — the evaluation-order
      assertion — a record whose exec segment names a **foreign** launcher **and**
      whose `WIENERDOG_HOME` bind names that foreign core (the incident's own
      temp-core shape) → **`mismatch`, not `indeterminate`**, because (d) is
      evaluated before (c0). Assert in the same named test **the HEALTHY
      NON-DEFAULT CORE fixtures (rule 4's normalization)** — this is the round-4
      regression, and without them a healthy Windows install with a supported
      `$WIENERDOG_HOME` warns forever and re-registers on every `sync`. Build the
      argline with `generators.windowsCmdArguments` passing `core` **exactly as a
      user may set `WIENERDOG_HOME`** — `assertSafeOverride`
      (`src/core/paths.js:21-31`) returns it verbatim, so the two supported skews
      are real — and pass `launcher = path.win32.join(core,'launcher','launch.js')`:
      `C:\Users\bob\.wienerdog\` (trailing separator) → **`match`**, and
      `C:/Users/bob/.wienerdog` (forward slashes) → **`match`**. Executed this
      session: under the raw comparison both return `indeterminate`, and under the
      `path.win32.resolve()` comparison both return `match` while the default
      shape `C:\Users\bob\.wienerdog` is unchanged.
      Assert in the same named test **the two NON-CANONICAL SPELLINGS rule 4a
      rejects**, built the same way (same `core` value passed to
      `windowsCmdArguments` and to `path.win32.join(core,'launcher','launch.js')`
      — so the *expectation* is the canonical
      `C:\Users\bob\.wienerdog\launcher\launch.js` in both, because
      `path.win32.join` collapses the component):
      `C:\Users\bob\.wienerdog\child\..` → **`indeterminate`**, and
      `C:\Users\bob\.wienerdog\.\` → **`indeterminate`**. These are the round-6
      finding: executed this session, both return **`match`** under a rule 4 that
      normalizes without 4a — a record `launchctl`/`schtasks` reports fine, that
      grades `loaded`, that shows green in `doctor`, and that our own writer
      provably cannot emit (`getPaths` throws on the first and collapses the
      second). Mutations M18, M22, M29 and M30 all target this test;
      (iii) **two `<Exec>` elements** (Table B condition (0)) where Exec₁ is a
      foreign command and Exec₂ is our canonical action → `indeterminate`;
      (iv) an **odd** double-quote count in the inner string → `indeterminate`;
      (vii) **the WRITER/CHECKER CLOSURE FAMILY (Table B1) — its own named
      test**, name it
      `entry-identity: schtasks exec grammar shares cmdArgToken's bare alphabet and rejects every unquoted operator`.
      It **iterates a local list of cmd.exe metacharacters** —
      `['&','|','<','>','(',')','^','%']`, with `"` deliberately excluded (it is
      the region delimiter the split walk consumes) — and for **every** member
      `ch` asserts two things:
      (1) **`generators.cmdArgToken(ch)` returns a DOUBLE-QUOTED token**, i.e.
      `ch` is outside the writer's bare charset. Assert this against the shipping
      `cmdArgToken`, **never** against a re-typed `/^[A-Za-z0-9:._-]+$/` — reading
      the writer's real behavior is the entire point, because the drift this
      catches is a checker whose `BARE` no longer equals the writer's;
      (2) `ch` injected **unquoted** yields `indeterminate` in both positions:
      appended to the exec segment with no surrounding spaces
      (`…sha256:abc${ch}C:\evil.exe`), and between two binds
      (`… & set "CODEX_HOME="${ch}evil & …`).
      Assert in the same named test the **converse** direction, or the family is
      one-sided: a canonical fixture whose `launchArgs` include the bare tokens
      the writer really emits (`dream`, `--expect-digest`, `sha256:<hex>`) must
      still return `match`, so tightening `BARE` away from `cmdArgToken` breaks a
      test rather than passing quietly. Mutations M23 and M24 both target this
      test;
      (viii) **the three executed append vectors, asserted by name** even though
      (vii) generates two of them: `&C:\evil.exe`, `|C:\evil.exe`, and — the one
      with **no operator character at all** — a plain space followed by
      `C:\evil.exe`, each appended to a canonical inner string →
      `indeterminate`. All three graded `match` under the round-2 prefix-matched
      (c) (executed). The third is the one that proves the fix is the **end
      anchor** and not an operator filter, so do not drop it;
      It must also assert the shapes that MUST still be `match`:
      (v) a launcher path containing ` & ` (e.g. `C:\Users\Bob & Alice\...`) and
      a `set "HOME=…"` value containing ` & ` — the quote-aware split's whole
      purpose, and the case the shipping `windowsLoadedTaskMatches` already gets
      right;
      (vi) a node path that differs from ours (node moves on upgrade) — assert
      `.verdict === 'match'` **and** `.exec` equal to that differing node path,
      which is what `defaultProbe` step 8b consumes; and
      (ix) **the honest boundary (Residual 9) — its own named test**, name it
      `entry-identity: schtasks reports a substituted execution position instead of judging it (Residual 9)`.
      `"C:\evil\fake-node.exe"`
      substituted into the node position of an otherwise canonical argline
      returns `{verdict:'match', exec:'C:\evil\fake-node.exe'}`. Assert that
      exactly, with a comment naming Residual 9: this is the one fixture that
      documents what `loadedEntryTargets` deliberately does **not** decide, and
      an implementer who "fixes" it to `mismatch` has silently taken a design
      decision this spec routed to a follow-up WP.
      **Build every fixture that must be `match` by calling
      `generators.windowsCmdArguments({node, launcher, home, core, launchArgs})`
      and wrapping its return in the `<Arguments>` element** — it is the canonical
      writer, so a hand-written "canonical" argline that drifts from it (now that
      (c0) binds to the canonical binding set) would prove nothing. Pass
      `core = path.win32.dirname(path.win32.dirname(launcher))` so the fixture and
      the checker agree by construction, and for (v) pass the ` & `-containing
      home as `home` so both `HOME` and `USERPROFILE` carry it. Hand-write only
      the fixtures that must **not** match.
      Also assert `loadedEntryTargets` does not throw when `expectLauncher`
      contains `"`.
- [ ] **AC-2** `deriveIdentityArgv` returns the Table B shape for each basename:
      `{kind:'launchd', argv:[…]}`, `{kind:'systemd', argv:null}`,
      `{kind:'schtasks', argv:[…]}`, and `null` for an unrecognized basename.
- [ ] **AC-3** `defaultProbe` returns, all through an injected `opts.run` and
      with **`WIENERDOG_TEST_NO_REAL_SCHEDULER` never deleted** (Table C R1):
      `mismatched` for an exit-0 record
      whose loaded argv names a launcher outside this core; `unverified` when the
      identity query fails, when its output is indeterminate, **and when `expect`
      is omitted entirely**; `unknown` when `expect.identityArgv` is `null`;
      `loaded` on a match; `missing` on a non-zero presence exit. Assert
      separately that with **no** `opts.run` and `WIENERDOG_LOADER_NOOP` set the
      result is `unknown`, and likewise for `WIENERDOG_TEST_NO_REAL_SCHEDULER`
      (which `npm test` already sets) — this is the pair of assertions that pins
      the seam-gating in "Exact contracts", so it must show that the *same* input
      returns `unknown` without `run` and a real verdict with it.
      **How to set and restore `WIENERDOG_LOADER_NOOP` — mandatory, and NOT a
      style point (Table C R1).** That var is **absent** from the suite env:
      `tests/run.js:7` sets only `WIENERDOG_TEST_NO_REAL_SCHEDULER`. So this
      assertion must set it and restore it to **absent**, using the repo's own
      idiom at `tests/unit/scheduler-status.test.js:118-127`:
      ```js
      const saved = process.env.WIENERDOG_LOADER_NOOP;
      process.env.WIENERDOG_LOADER_NOOP = '1';
      try {
        assert.equal(status.defaultProbe(argv, expect, {}), 'unknown');
      } finally {
        if (saved === undefined) delete process.env.WIENERDOG_LOADER_NOOP;
        else process.env.WIENERDOG_LOADER_NOOP = saved;
      }
      ```
      That `delete` is **permitted** and is not what verification step 5b
      rejects — 5b is scoped to `WIENERDOG_TEST_NO_REAL_SCHEDULER`, and deleting
      `WIENERDOG_LOADER_NOOP` while the guard var stays set strictly *re-arms*
      `schedulerSpawn`'s throw. **Leaving `WIENERDOG_LOADER_NOOP` set instead of
      restoring it silently breaks the WP:** `src/scheduler/spawn.js:25` returns
      `{status:0}` *before* the throw at `:26`, so every test after this one
      would run with `schedulerSpawn` neutralized and AC-14 layer (ii) would not
      hold. `= ''` re-arms the throw but does not restore the env to absent — use
      `delete`. The `WIENERDOG_TEST_NO_REAL_SCHEDULER` half of this pair needs no
      setup at all (it is already set) and must be neither deleted nor restored.
      **Every canned `launchctl print` fixture in this criterion must put a path
      that EXISTS in the `arguments` block's FIRST entry** — use
      `process.execPath`, which is guaranteed present and is what a real entry
      carries. Step 8b `stat`s that entry, so a placeholder like
      `/usr/bin/node-that-is-not-there` would grade `mismatched` and the `loaded`
      assertion would fail for a reason unrelated to what it tests.
- [ ] **AC-3c** *(step 8b — the deleted-node regression, **its own named test**)*
      Name it
      `entry-identity: defaultProbe grades a record whose execution position no longer exists as mismatched`.
      Same shape as AC-3 (injected `opts.run`; this criterion touches the env not
      at all — no set, no delete): a canned
      `launchctl print` whose `arguments` block has **our launcher in `args[1]`**
      — so `loadedEntryTargets` returns `verdict:'match'` — and, in `args[0]`, a
      path inside a `mkdtemp` directory that the test **creates and then deletes**
      before probing. Assert `'mismatched'`. Assert in the **same** named test
      that the identical fixture with `process.execPath` in `args[0]` returns
      `'loaded'`, so the criterion discriminates on existence alone and not on
      anything else about the fixture. Comment which artifact it reads and why:
      the OS's own record of what it will start, which is the only artifact that
      would have shown the incident. This is the criterion that would fail if an
      implementer omitted step 8b; mutation M25 targets it.
      **Do not use a fixed `/tmp` path** and do not leave the temp dir behind.
- [ ] **AC-3b** *(the PRODUCTION no-seam path — the gap AC-3 cannot close)*
      Every AC-3 identity assertion runs through an injected `opts.run`, so all of
      them stay green if step 7 calls a bare `run(…)` — which is `null` on every
      production call (Table C). This criterion drives `defaultProbe` to step 7
      with **no seam at all**, in a **child process** whose env omits the two
      neutralizers, without deleting anything from the test process's env (Table C
      R1 stays intact) and without any scheduler client being invoked. **Its own
      named test**, built exactly like this:
      - build the child env by **omission**, never by `delete`:
        `const { WIENERDOG_LOADER_NOOP: _a, WIENERDOG_TEST_NO_REAL_SCHEDULER: _b, ...childEnv } = process.env;`
      - `spawnSync(process.execPath, ['-e', SCRIPT], { env: childEnv, encoding: 'utf8' })`,
        where `SCRIPT` is a fixed inline string that requires **only**
        `src/scheduler/status.js`, calls `defaultProbe(presenceArgv, expect)` with
        **two arguments and no `opts`**, and writes the returned status to stdout;
      - `presenceArgv` is `[process.execPath, '-e', 'process.exit(0)']` and
        `expect.identityArgv` is
        `[process.execPath, '-e', 'process.stdout.write(<canned launchctl print output>)']`.
        **The child requires no CLI module, and both argvs are node one-liners, so
        no scheduler client is ever spawned and no mutation is reachable — which
        is what makes running it without the backstop inert by construction rather
        than by luck.** Put exactly that sentence in a comment above `SCRIPT`.
        **Do NOT write that `src/scheduler/spawn.js` is not loaded — it IS.**
        Verified at `efd1489` in a scratch dir: `src/scheduler/status.js:6`
        requires `./generators`, and `src/scheduler/generators.js:7` is
        `const { schedulerSpawn } = require('./spawn');`, so requiring status.js
        alone puts `spawn.js` in the child's `require.cache`.
        (`src/cli/schedule.js` is correctly absent.) It is **loaded but never
        called**, which is fine — but this criterion is the ONLY one that runs
        product code with **both** neutralizers absent, so in this child
        `schedulerSpawn`'s throw is disarmed and the by-construction argument is
        the entire safety case. Resting that case on a false clause is how a later
        auditor stops reading at "spawn.js is not even loaded" and never checks
        the load-bearing invariant — that **both argvs are test-controlled node
        one-liners** — when someone edits `SCRIPT`.
      - the canned `arguments` block's **first** entry must be `process.execPath`
        (step 8b `stat`s it — see AC-3c).
      Assert the child exits **0** and prints `loaded` when the canned `arguments`
      block's second entry is `expect.launcher`, and `mismatched` when it is a
      temp-dir launcher. Mutation M19 reverts step 7 to a bare `run(…)`; the child
      then throws `TypeError: run is not a function` and exits non-zero, so this
      test — and only this test — turns red.
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
- [ ] **AC-5** *(same gap, heal side)* `reloadMissing` end-to-end, `opts.loader` a
      recording stub (Table C R2 — mandatory here, because this criterion drives
      the heal). **Three separately-named tests**, the first two with
      **`opts.probe` forbidden** and `opts.run` injected:
      **AC-5a** — name it
      `entry-identity: reloadMissing heals a configured job whose loaded record names a foreign launcher`.
      A configured job whose canned identity output names a foreign launcher IS
      healed: `assert.deepEqual` on the recorded loader argv list against the
      exact expected sequence, **and** `assert.deepEqual` on the return value
      against `{reloaded: ['dream'], failed: []}`.
      **The return-value assertion is not decoration — it is the runtime
      replacement for the deleted verification step 5c** (AC-14 layer (iii)).
      `reloadMissing` swallows a throwing loader into `failed` (`status.js:259`),
      so an omitted `opts.loader` produces an EMPTY recorded list and
      `{reloaded: [], failed: ['dream']}` rather than an error — executed this
      session. Mutation M20 is exactly that omission and must redden this test;
      **AC-5b** *(the negative)* the same setup with the canned output naming
      `generators.launcherPath(paths)` heals **nothing** — the recorded loader
      argv list is `[]` and `reloaded`/`failed` are both empty;
      **AC-5c** *(the `unverified` member — the test M7 names and no criterion
      previously mandated)* name it
      `entry-identity: reloadMissing heals an unverified entry`.
      `opts.probe: () => 'unverified'` (this one MAY use `opts.probe`: it exercises
      the `HEAL_SET` membership, not the `expect` construction — Table C R3) with
      the recording `opts.loader`: the job IS healed, asserted with
      `assert.deepEqual` on the recorded argv list and on
      `{reloaded: ['dream'], failed: []}`. Mutation M7 drops `'unverified'` from
      `HEAL_SET` and must redden it. **Before round 5 M7 named a test no criterion
      required** — the same ungated-mutation drift that left the `repairCatchup`
      marker with no gate until AC-9c, and the reason the Mirrored Surface
      Checklist now registers M28 too.
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
- [ ] **AC-9** *(the pre-destructive marker, Table E — **three** separately-named
      tests)* The mandatory recording `opts.loader` (Table C R2) reads
      `state/scheduler-status.json` at **every** call and records what it saw
      (`{exists, parsed}`), so both assertions are about the file **at the moment
      of the first loader call**, never about its state afterwards.
      **AC-9a** *(the C3 regression — the one that must exist)* Name it
      `entry-identity: reloadMissing writes the durable marker even for an observed missing entry`.
      A configured job whose canned presence result is a **non-zero exit** — i.e.
      observed `missing` — is healed, and at the recording loader's **first** call
      the file already exists, parses, and has a `checked_at` string plus an
      `entries` array. Assert the return value too —
      `{reloaded: ['dream'], failed: []}` — for the AC-14 layer (iii) reason
      spelled out under AC-5a: an omitted `opts.loader` is swallowed into `failed`
      rather than thrown, and this assertion is what makes it red. The marker is
      written **even for an observed `missing`**, because that verdict can be a
      transient presence-query failure on a label the very next `bootout` will
      destroy (Table E, row 2). Mutation M21 re-adds the old
      `status !== 'missing'` condition and must turn **this** test red.
      **AC-9b** *(the negative)* with `opts.probe` reporting `loaded` for every
      job, the recorded loader argv list is `[]` **and
      `state/scheduler-status.json` does not exist** — the marker is tied to a
      reachable replacement call, not to the mere act of calling `reloadMissing`.
      AC-9b may reuse AC-15's fixture, but it is a **separate named test** with
      the file-absence assertion AC-15 does not make (AC-13 counts it).
      **AC-9c** *(the SECOND destructive site — the one round 2 found ungated)*
      Name it
      `entry-identity: repairCatchup writes the durable marker before its first replacement call`.
      **Call `schedule.repairCatchup` DIRECTLY** — this WP adds it to
      `src/cli/schedule.js`'s `module.exports` for exactly this reason (see "Why
      `repairCatchup` is exported"). Do **not** route through `repointSchedules`:
      executed this session, that seam makes the per-job `ai.wienerdog.dream`
      bootstrap the **first** loader call and registers the catch-up entry twice,
      so "the first loader call" is not an assertion about `repairCatchup` at all
      — the criterion would be unwritable.
      `repairCatchup` on **darwin**, driven the same way (`opts.run` injected,
      `opts.probe` absent, a recording `opts.loader` that reads
      `state/scheduler-status.json` at every call). Assert that at the recording
      loader's **first** call the file already exists and parses.
      **Executed evidence that this is producible and discriminating** (mkdtemp
      copy of `src/`, repo tree untouched): with the export added and the current
      unmodified body, the direct call records exactly one loader call,
      `['launchctl','bootstrap','gui/<uid>','<temp home>/Library/LaunchAgents/ai.wienerdog.catchup.plist']`,
      and `state/scheduler-status.json` does **not** exist at it — so the
      assertion is red before the change and green after.
      **Why this criterion is mandatory and why its absence was a real hole.**
      The marker rule is stated as "unconditional at BOTH destructive sites", but
      AC-9a/AC-9b both drive a **configured job** through `reloadMissing`, and the
      catch-up entry is deliberately **not** a configured job (`status.js:230-231`
      excludes it entirely). Mutations M10 and M21 mutate only `reloadMissing`.
      Before AC-9c, an implementation that omitted `repairCatchup`'s
      `refreshSchedulerStatus` **entirely** satisfied every criterion and every
      mutation in this WP — for the very entry that was hijacked 76 times.
      Mutations M26 (delete the call) and M27 (re-condition it on
      `status === 'missing'`) both target this test.
      **Honest about what AC-9a/AC-9b/AC-9c prove.** They are **call gates**: they
      show the marker call HAPPENED before the first mutation, not that it
      recorded anything meaningful. With a fixture whose manifest carries no
      `scheduler-entry` record, `probeAll` returns `[]` and the file is written
      with `entries: []`, which satisfies them. That is deliberate and
      sufficient — what Table E needs is that the write is *attempted* at the
      right moment (and Residual 10 says even that may not land) — and it keeps
      the fixtures cheap. Use the same cheap pattern for all three; do not
      manufacture a richer manifest to make the assertion look stronger than it is.
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
      **AC-12, AC-12b and AC-12c all call `schedule.repairCatchup` DIRECTLY**, via
      the export this WP adds to `src/cli/schedule.js`'s `module.exports` — see
      "Why `repairCatchup` is exported" for the executed evidence that
      `repointSchedules` cannot carry these three criteria (it prepends per-job
      loader calls, registers the catch-up entry twice, and does not forward
      `opts.run` at all, which alone makes AC-12b unwritable through it).
- [ ] **AC-12b** *(the `expect` construction, modelled on AC-5)* `repairCatchup`
      driven with **no `opts.probe`** (Table C), `opts.run` injected and
      `opts.loader` a recording stub. Two separately-named tests:
      **AC-12b-i** a canned poisoned `arguments` block (second entry = a temp-dir
      launcher) produces a repair — `assert.deepEqual` on the recorded loader
      argv list. (No `{reloaded, failed}` analogue is needed here: `repairCatchup`
      has no such return, and an omitted `opts.loader` **throws** out of it rather
      than being swallowed — executed this session — so the test fails outright.)
      **AC-12b-ii** a canned block naming
      `generators.launcherPath(paths)` produces `{}` and an **empty** recorded
      loader argv list. Without this criterion, dropping `const expect = null`
      into `src/cli/schedule.js:607`/`:626` turns nothing red — and the catch-up
      entry is the exact one that was hijacked 76 times.
- [ ] **AC-12c** *(the notice discipline — "Exact contracts", disposition 7)*
      `repairCatchup` (darwin), `opts.probe` injected, a recording `opts.loader`
      returning `{status:0}` so the repair **succeeds**: observed `missing`
      returns the notice `'restored the missing catch-up registration.'`
      byte-for-byte, and observed `mismatched` and observed `unverified` each
      return `{}` with **no** `notice` key — while the recorded loader argv list
      is non-empty in all three, proving the repair still happened and only the
      notice differs. Assert separately that a **failing** loader
      (`{status:1}`) still produces the unchanged failure notice for every
      member. Without this criterion, `wienerdog adopt` reports adoption failure
      on any Windows install whose task round-trip deviates (Residual 2), and the
      shipped string *"restored the **missing** catch-up registration"* lies about
      a hijacked one. Mutation M28 targets it.
- [ ] **AC-13** Every new test name is prefixed `entry-identity:` (with a
      trailing space), and the non-vacuity gate in verification step 1 reports at
      least **28** **named** passing subtests.
      **The number is RE-DERIVED in round 5 by enumeration, not carried forward.**
      Rounds 1-3 grew it by narrative increments (15 → 18 → 21 → 26) and the
      round-4 review found the gate still literally reading `-ge 21`, i.e. counts
      of 21-25 passed while failing this criterion — and the five round-3 tests
      are precisely the ones that make M23, M24, M25, M26/M27 and M28 reddenable,
      so an implementer who skipped all five still passed. Do not increment this
      number again; re-enumerate. The 28 are:
      **(a) 22 tests named by a mutation row** — one per distinct name in the
      Mutation checks table: M1, M2, M3, M4, M5, M6, M7 (AC-5c), M8, M9,
      M10/M21 (AC-9a), M11, M12, M13 (AC-5b), M15, M16 (AC-12b-ii),
      M18/M22/M29/M30 (AC-1 (ii-b)), M19 (AC-3b), M20 (AC-5a),
      M23/M24 (AC-1 (vii)), M25 (AC-3c), M26/M27 (AC-9c), M28 (AC-12c).
      Where two or more mutations name the same test it counts **once**; M14 and
      M17 name a verification step, not a test, so they count zero.
      **Round 8 re-derived this, it did not assume it:** the round-8 revision added
      mutation M30 and two AC-1 (ii-b) fixtures, both of which land in a test name
      already counted here, so the distinct-name count is still 22 and the floor is
      still 28. Nothing in this enumeration moved.
      **(b) 6 more mandated by a criterion but targeted by no mutation** —
      AC-1 (ix) the Residual 9 boundary, AC-9b, AC-12b-i, AC-2, AC-12's
      five-member gate, and AC-15.
      Everything else a criterion asks for (AC-1's (i)-(viii) fixtures beyond the
      named ones, AC-3's remaining mappings and its seam-gating pair, AC-7's
      order/empty/byte-identity assertions) may be folded into the tests above, so
      it is **not** counted here. The gate is a floor: writing more is fine;
      writing fewer than the criteria mandate is what it catches. **If you add or
      remove a named test, update this enumeration AND the literal in verification
      step 1 in the same edit** — they drifted apart once already.
- [ ] **AC-14** *(Table C, and what is and is NOT mechanically checked)* No test
      in this WP spawns a real scheduler client. **This criterion rests on a
      RUNTIME guarantee plus the criteria's own assertions — not on any structural
      analysis of the test file's source text.** Three layers, in the order they
      fire:
      **(i) R1, mechanically checked by verification step 5b** — the file
      contains no `delete process.env.WIENERDOG_TEST_NO_REAL_SCHEDULER`, so that
      var (set for the whole suite by `tests/run.js:7`) stays set for every test
      here. Mutation M17. AC-3's `finally` *may* delete `WIENERDOG_LOADER_NOOP`
      and 5b does not reject that — deleting it while the guard var stays set
      re-arms the throw — but AC-3 **must** restore that var to absent, because
      `spawn.js:25` returns `{status:0}` before the throw at `:26`, so a leaked
      `WIENERDOG_LOADER_NOOP` would disarm layer (ii) for every test that
      follows. That restoration is part of AC-3, not of this layer.
      **(ii) the armed suite guard — the real guarantee.** With that var set, any
      call that reaches `schedule.defaultLoader` hits `schedulerSpawn`'s throw
      (`src/scheduler/spawn.js:26`) **before** a `launchctl` / `systemctl` /
      `schtasks` process is created. Executed this session against a `mkdtemp`
      copy of `src/` with no `opts.loader` injected:
      `reloadMissing(paths, { probe: () => 'missing', platform: 'darwin' })`
      returns `{reloaded: [], failed: ['dream']}` (the throw is swallowed into
      `failed` at `status.js:259` — nothing real ran), and
      `repairCatchup(paths, manifest, { probe: () => 'missing', platform: 'darwin' })`
      **throws** `WienerdogError: refusing to invoke the real OS scheduler in a
      test: launchctl bootstrap gui/501 …`.
      **(iii) the criteria themselves.** Every criterion that drives a heal
      asserts the **recorded** loader argv list with `assert.deepEqual` — never
      `.some(…)` / `.length > 0`. An unstubbed `reloadMissing` records nothing, so
      those assertions fail; and because the throw is swallowed rather than
      propagated there, **AC-5a and AC-9a additionally assert the returned
      `{reloaded, failed}` explicitly** (`reloaded: ['dream'], failed: []` on a
      successful heal), which is what makes the swallowed case red at runtime
      rather than merely unproven. An unstubbed `repairCatchup` throws, so every
      criterion driving it (AC-9c, AC-12, AC-12b, AC-12c) fails outright.
      **There is deliberately NO per-line structural check.** Three successive
      forms of one were specified and all three were executed and broken in both
      directions; verification step 5c's replacement comment records each form,
      its bypass and its false-reject, and forbids a fourth. ADR-0031's loop
      circuit-breaker is what ended it: **subtract the mechanism, keep the
      guarantee.** Consequently the round-3 constraints that existed only to feed
      that check are **withdrawn** — you may factor an options object into a
      variable, wrap a call across lines, or comment a call line. The one thing
      you may not do is call `reloadMissing` or `repairCatchup` without an
      injected `opts.loader`, and layers (ii) and (iii) are what catch it.
      Plus, by construction, every call that reaches `defaultProbe` steps 3-8b
      passes `opts.run` — except AC-3b's subprocess, which reaches them with no
      seam and cannot spawn a scheduler client either (see AC-3b).
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
| M10 | `reloadMissing`: delete the pre-destructive `refreshSchedulerStatus` call | `entry-identity: reloadMissing writes the durable marker even for an observed missing entry` (AC-9a — the same named test M21 targets; M10 removes the marker, M21 re-conditions it) |
| M11 | `renderSchedulerStatusLine`: drop the `mismatched` bucket | `entry-identity: digest emits template F for a mismatched entry` |
| M12 | `probeAll`: `const expect = null;` | `entry-identity: probeAll reports mismatched end-to-end for a poisoned loaded record` |
| M13 | `reloadMissing`: pass `null` as the probe's `expect` argument | `entry-identity: reloadMissing heals NOTHING when the loaded record names this install's launcher (no opts.probe)` (AC-5b) |
| M14 | `src/cli/dream.js`: delete the `schedulerLine` property | verification step 5's dream.js conditional grep exits 1 |
| M15 | `launcherPathFor`: restore the hand-written `path.join(paths.core, 'launcher', 'launch.js')` **and** change `generators.launcherPath` to join `'launch.mjs'` | `entry-identity: launcherPathFor delegates to generators.launcherPath (no drift)` |
| M16 | `repairCatchup`: `const expect = null;` on both branches | `entry-identity: repairCatchup repairs NOTHING when the loaded catchup record names this install's launcher (no opts.probe)` (AC-12b-ii) |
| M17 | in the new test file, add `delete process.env.WIENERDOG_TEST_NO_REAL_SCHEDULER;` at the top of any test | verification step 5's negative grep exits 1 |
| M18 | `loadedEntryTargets` condition (c0): replace the canonical-binding-set check with the old shape test — `every non-final segment matches /^set "[A-Za-z_][A-Za-z0-9_]*=[^"]*"$/` | `entry-identity: schtasks (c0) binds to the canonical set, and (d) outranks it` (AC-1 (ii-b)) — **M22 is its evaluation-order partner and targets the same named test; they are numbered apart, not mis-transcribed** |
| M19 | `defaultProbe` step 7: `run(expect.identityArgv)` instead of `RUN(expect.identityArgv)` | `entry-identity: defaultProbe reaches the identity query with NO run seam (subprocess)` (AC-3b) — the child throws `TypeError` and exits non-zero |
| M20 | in the new test file, **delete the `loader:` key from AC-5a's `reloadMissing` call** (leaving `opts.run` in place), so the call falls through to `schedule.defaultLoader` | `entry-identity: reloadMissing heals a configured job whose loaded record names a foreign launcher` (AC-5a) — the recorded argv list is `[]` and the return is `{reloaded: [], failed: ['dream']}` because `schedulerSpawn` throws (`spawn.js:26`) and `status.js:259` swallows it. **This is the round-5 replacement for the deleted verification step 5c**: the same property, checked by running code instead of by grepping JavaScript source |
| M21 | `reloadMissing`: re-add the `status !== 'missing' &&` condition in front of the pre-destructive marker | `entry-identity: reloadMissing writes the durable marker even for an observed missing entry` (AC-9a) |
| M22 | `loadedEntryTargets` schtasks branch: evaluate (c0) **before** (d) | **the same named test as M18** — the temp-core hijack fixture returns `indeterminate` instead of `mismatch` |
| M23 | Table B1's exec grammar: drop the trailing `$` anchor (back to a round-2 prefix match) | `entry-identity: schtasks exec grammar shares cmdArgToken's bare alphabet and rejects every unquoted operator` (AC-1 (vii)) plus the (viii) assertions — executed: all three append fixtures return `match` again |
| M24 | Table B1's grammar: widen `BARE` from `[A-Za-z0-9:._-]+` to `[^ ]+`, so it no longer equals `cmdArgToken`'s charset | the same named test as M23 (AC-1 (vii)) plus the (viii) assertions — executed: all three append fixtures return `match` again. This is the writer/checker drift the closure family exists to catch |
| M25 | `defaultProbe`: delete step 8b (grade `'loaded'` on `verdict === 'match'` without checking `exec`) | `entry-identity: defaultProbe grades a record whose execution position no longer exists as mismatched` (AC-3c) |
| M26 | `repairCatchup`: delete its pre-destructive `refreshSchedulerStatus` call | `entry-identity: repairCatchup writes the durable marker before its first replacement call` (AC-9c) |
| M27 | `repairCatchup`: gate its pre-destructive marker on `status !== 'missing'` | the same named test as M26 (AC-9c) — M26 removes the marker, M27 re-conditions it, exactly as M10/M21 do for `reloadMissing` |
| M28 | `repairCatchup`: return `{ notice: 'restored the missing catch-up registration.' }` for **every** successful repair, not only an observed `missing` | `entry-identity: repairCatchup emits the "restored the missing" notice only for an observed missing entry` (AC-12c) |
| M29 | Table B condition (c0) **rule 4**: revert the normalized comparison to the raw one — `captured === cmdQuotedToken(core)` instead of `path.win32.resolve(captured) === path.win32.resolve(core)` | **the same named test as M18/M22** (AC-1 (ii-b)) — the two healthy non-default-core fixtures return `indeterminate` instead of `match` (executed) |
| M30 | Table B condition (c0) **rule 4a**: delete the pre-normalization component check (leave 4b+4c — i.e. exactly the rounds 5-7 rule) | **the same named test as M18/M22/M29** (AC-1 (ii-b)) — the `…\child\..` and `…\.wienerdog\.\` fixtures return `match` instead of `indeterminate` (executed). It needs its own row because **M29 does not cover it**: reverting to the raw comparison happens to reject both spellings for the wrong reason, so M29 stays red without 4a existing at all. **Adds NO new named test** — the fixtures live in the AC-1 (ii-b) test M18/M22/M29 already name, so AC-13's floor is unmoved |

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
[ "$n" -ge 28 ] || { echo "VACUOUS OR INCOMPLETE — the pattern selected $n named subtests"; exit 1; }

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
#    Every target below is absent on unmodified `main` and is therefore genuinely
#    discriminating — WITH ONE STATED EXEMPTION: `schedulerLine` in
#    src/cli/sync.js ALREADY matches on `main` at src/cli/sync.js:278 (executed).
#    That one line is a REGRESSION GUARD (this WP must not remove sync's
#    schedulerLine while adding dream's), not a discriminator; do not read it as
#    evidence that anything changed. `darwinReplaceEntry`, `refreshSchedulerStatus`
#    in src/cli/schedule.js, and the other six targets were each verified absent at
#    efd1489 (exit 1). Note that a bare `grep -n "bootout" src/cli/schedule.js` is
#    NOT a valid check: it already matches lines 287 and 402 on `main` (the
#    `unload` argv arrays) — executed and confirmed.
for pat in loadedEntryTargets deriveIdentityArgv launcherPath; do
  grep -n "$pat" src/scheduler/generators.js || { echo "MISSING: $pat in generators.js"; exit 1; }
done
for pat in "'mismatched'" "'unverified'" "opts.run" "existsSync"; do
  grep -n "$pat" src/scheduler/status.js || { echo "MISSING: $pat in status.js"; exit 1; }
done
grep -n "darwinReplaceEntry" src/cli/schedule.js || { echo "MISSING: darwinReplaceEntry"; exit 1; }
# The export AC-9c / AC-12b / AC-12c are written against. ANCHORED on the exports
# line, not a bare name grep: `repairCatchup` already matches twice in this file
# on `main` (its declaration at :588 and its call at :565), so a bare grep is NOT
# discriminating. Executed: the anchored form exits 1 on `main` and 0 once the
# name is added to module.exports.
grep -nE "^module\.exports = \{.*\brepairCatchup\b" src/cli/schedule.js \
  || { echo "MISSING: repairCatchup is not exported — AC-9c/AC-12b/AC-12c cannot be written"; exit 1; }
# The SECOND destructive site's marker (AC-9c / M26). 0 matches on `main`.
grep -n "refreshSchedulerStatus" src/cli/schedule.js || { echo "MISSING: repairCatchup's pre-destructive marker"; exit 1; }
grep -n "schedulerLine" src/cli/dream.js || { echo "MISSING: schedulerLine in dream.js"; exit 1; }
# REGRESSION GUARD, not a discriminator — already present on main at sync.js:278.
grep -n "schedulerLine" src/cli/sync.js  || { echo "MISSING: schedulerLine in sync.js"; exit 1; }

# 5b. Table C R1, MECHANICALLY CHECKED (AC-14(i)). No test in this WP may delete
#     WIENERDOG_TEST_NO_REAL_SCHEDULER: that is the ONLY deletion that disarms
#     schedulerSpawn's throw (spawn.js:24-33 checks LOADER_NOOP first and returns
#     {status:0}; the guard var second and throws). After such a deletion a heal
#     reached without opts.loader issues a REAL `launchctl bootout` +
#     `bootstrap` against the per-user-global label. Must exit 1 while any such
#     line is present (mutation M17).
#     SCOPED TO THE GUARD VAR IN ROUND 7 — the earlier form also matched
#     `delete process.env.WIENERDOG_LOADER_NOOP`, which AC-3 REQUIRES in its
#     restore-to-absent `finally` (that var is absent from the suite env), so it
#     rejected a conforming test. The narrowing is LOSSLESS: the ritual R1 exists
#     to keep out (tests/unit/scheduler-status.test.js:102-116) deletes BOTH
#     vars, so its guard-var line is still caught. Both directions executed this
#     session against fixtures written to a `mkdtemp` dir:
#       (a) a minimally-written conforming AC-3 test whose finally reads
#           `if (saved === undefined) delete process.env.WIENERDOG_LOADER_NOOP;`
#           → OLD regex MATCHED (the defect: "FAIL" on a conforming test);
#             NEW regex NO MATCH → "OK". Accepted.
#       (b) lines 102-116 of scheduler-status.test.js, verbatim
#           → OLD regex matched 2 lines; NEW regex matched the
#             `delete process.env.WIENERDOG_TEST_NO_REAL_SCHEDULER` line.
#             Still rejected.
#     THIS ONE SURVIVED THE 5c DELETION ON PURPOSE, and the difference matters:
#     it greps for ONE LITERAL STATEMENT that no conforming test in this WP has
#     any reason to contain. It makes no attempt to decide what a line "is", so
#     it has no bypass class to chase. Its only false-reject is a COMMENT that
#     quotes that one literal — so do not write
#     `delete process.env.WIENERDOG_TEST_NO_REAL_SCHEDULER` in a comment in the
#     test file; the prohibition lives in this spec, not there.
if grep -nE "delete[[:space:]]+process\.env\.WIENERDOG_TEST_NO_REAL_SCHEDULER" \
     tests/unit/scheduler-entry-identity.test.js; then
  echo "FAIL: a test deletes the suite guard var — see Table C R1"; exit 1
else
  echo "OK: the suite guard stays armed for every test in this WP"
fi

# 5c. DELETED IN ROUND 5 — DO NOT RE-ADD IT IN ANY FORM.
#     Three consecutive review rounds produced three forms of a per-line
#     structural check on JavaScript source, and every form was executed and
#     broken IN BOTH DIRECTIONS. ADR-0031's loop circuit-breaker applies: the
#     move is to SUBTRACT, not to refine a fourth time.
#
#     Form 1 (file-wide counts) was bypassed by
#       reloadMissing(paths); repairCatchup(paths, m, {loader: s}); const x = {loader: s};
#     Form 2 (a per-line `loader:` grep) was bypassed by
#       status.reloadMissing(paths); schedule.repairCatchup(paths, m, {loader: s});
#       status.reloadMissing(paths); // loader: required by AC-14
#     Form 3 (inline `loader:` + exactly one `;` + no comment) was bypassed by
#       status.reloadMissing(paths, (schedule.repairCatchup(paths, m, { loader: rec }), {}));
#     — one statement, one `;`, an inline `loader:`, no comment, and the OUTER
#     reloadMissing still has NO loader (executed this session: exit 0). Form 3
#     also FALSE-REJECTS valid JavaScript: a conforming single-statement call
#     whose options object contains a string or template with a `;`, or a string
#     containing `//` — an inline `https://…` fixture is the ordinary case —
#     exits 1 (both executed this session: exit 1).
#
#     WHAT REPLACES IT IS A RUNTIME GUARANTEE, NOT A TEXTUAL ONE. Table C R1
#     keeps WIENERDOG_TEST_NO_REAL_SCHEDULER set for every test in this WP
#     (tests/run.js:7 sets it; step 5b checks no test deletes it), so ANY call
#     that reaches defaultLoader hits schedulerSpawn's throw at
#     src/scheduler/spawn.js:26 BEFORE any launchctl/systemctl/schtasks process
#     is created. Executed this session against a mkdtemp copy of src/, with the
#     var set and no opts.loader injected:
#       status.reloadMissing(paths, { probe: () => 'missing', platform: 'darwin' })
#         => { reloaded: [], failed: ['dream'] }   (the throw is swallowed at
#            status.js:259 into `failed` — no real scheduler was invoked)
#       schedule.repairCatchup(paths, manifest, { probe: () => 'missing', platform: 'darwin' })
#         => THROWS WienerdogError: "refusing to invoke the real OS scheduler in
#            a test: launchctl bootstrap gui/501 …"
#     The repairCatchup leg reddens on its own — it THROWS, so every criterion
#     that drives it (AC-9c, AC-12, AC-12b, AC-12c) fails outright if its loader
#     is missing. The reloadMissing leg is caught by the criteria themselves,
#     which is why AC-5a and AC-9a each assert `reloaded`/`failed` explicitly in
#     addition to their recorded-argv deepEqual: an unstubbed call yields
#     `{reloaded: [], failed: ['dream']}` and an EMPTY recorded list, so it turns
#     those tests red at runtime. That is the belt-and-braces layer, and it needs
#     no source-text analysis.
#
#     If a future round wants a mechanical per-call-site check, it needs a real
#     JavaScript parser, which this repo's zero-dependency toolchain does not
#     have. A grep is not one. Do not try again.

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
#
#    A FAILURE HERE MAY BE A REAL FINDING, NOT A CODE DEFECT — it asserts against
#    the live loaded record of ai.wienerdog.dream on THIS machine. The first
#    assert fires if the label is not loaded at all; the `match` assert fires if
#    the loaded record does not name this install's launcher — i.e. exactly the
#    incident this WP exists to detect. Do not "fix" the code to make it pass:
#    re-run `wienerdog sync`, re-check, and report what you found in the PR body.
#    If this machine has NO loaded dream agent (a fresh checkout, no install, or a
#    $WIENERDOG_HOME-redirected core), say so in the PR and skip steps 7-8 —
#    Definition of done 2 allows exactly that, stated explicitly.
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
const ok = g.loadedEntryTargets(r.stdout, "launchd", mine);
// loadedEntryTargets returns {verdict, exec}. Asserting the RETURN VALUE against
// a bare string would always fail (an object is never === "match"), and
// assert.ok(ret) would pass vacuously — assert the FIELD.
assert.equal(ok.verdict, "match", `expected match for ${mine}`);
assert.equal(typeof ok.exec, "string", "the execution position must be reported");
// Step 8b`s input on THIS machine. A false here is a REAL FINDING: the loaded
// record names a node binary that no longer exists (e.g. after `brew upgrade
// node && brew cleanup`) — the failure mode step 8b exists to catch. Re-run
// `wienerdog sync`, then re-check, and report it in the PR body.
assert.equal(require("node:fs").existsSync(ok.exec), true, `execution position does not exist: ${ok.exec}`);
assert.equal(g.loadedEntryTargets(r.stdout, "launchd", "/var/folders/x/T/wd-gone/core/launcher/launch.js").verdict, "mismatch");
assert.equal(g.loadedEntryTargets("no arguments block here", "launchd", mine).verdict, "indeterminate");
console.log("OK: positive=match, negative=mismatch, truncated=indeterminate; launcher =", mine, "; exec =", ok.exec);
'

# 8. Real-machine doctor — macOS only, READ-ONLY. Preserves doctor's OWN exit
#    status (the old form reported grep's status instead) and now ASSERTS on it
#    instead of only echoing it: the old form ended in `echo`, so a doctor that
#    CRASHED (rc=1, no scheduler line at all — the exact outcome of a probe that
#    throws, since doctorSchedulerChecks does not catch) still left the step
#    exiting 0. Paste the scheduler lines AND the exit code. Executed against
#    `main` at efd1489 this printed one [ok] dream line, one [warn] catchup line,
#    and "doctor exit=0". A `mismatched`/`unverified` line is a REAL FINDING
#    about this machine, not a test failure; the discriminator below is that a
#    non-zero doctor exit must be explained by a printed [fail] line.
out=$(node bin/wienerdog.js doctor 2>&1); rc=$?
printf '%s\n' "$out" | grep -n "scheduled job" \
  || { echo "FAIL: doctor printed no scheduler line — it crashed, or the probe threw"; exit 1; }
echo "doctor exit=$rc"
if [ "$rc" -ne 0 ]; then
  printf '%s\n' "$out" | grep -n "^\[fail\]" \
    || { echo "FAIL: doctor exited $rc with no [fail] line — that is a crash, not a health verdict"; exit 1; }
  echo "NOTE: exit=$rc is explained by the [fail] line(s) above. If one of them is a scheduler line, it is a REAL FINDING about this machine — say so in the PR."
fi
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
- **Editing `memory/lessons/inbox.md`.** `scripts/boundary-check.js:48` allows
  that file on every branch, so CI will **not** stop you — but CLAUDE.md does:
  parallel WP branches editing it conflict on merge. Report your lessons as
  bullets in the PR body, one per lesson, prefixed with this WP's id; the
  maintainer appends them on `main`.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body,
   including the named-subtest counts from steps 1-2 and the completed Mutation
   checks table.
2. Steps 7-8 run on macOS and their output pasted. Two explicit outs, and they
   are outs only if you **say so in the PR body** rather than silently omitting
   the steps: (a) the implementer is not on macOS; (b) the implementer is on
   macOS but this machine has **no loaded `ai.wienerdog.dream` agent** (a fresh
   checkout with no install, or a `$WIENERDOG_HOME`-redirected core) — step 7's
   first assert and step 8's scheduler-line check both fail in that case for a
   reason that is not a code defect. State which out applies and paste the
   evidence (`launchctl print gui/$(id -u)/ai.wienerdog.dream` exit code is
   enough). A failing step 7/8 on a machine that *does* have the agent loaded is
   a **real finding** — report it; do not edit code to make it pass.
3. Conventional commits; PR titled
   `fix(scheduler): verify loaded entry identity, not presence (WP-scheduler-entry-identity)`.
4. PR template filled, including "Decisions made" — at minimum: the
   `defaultProbe` double-spawn on darwin, the `foreign`→`mismatched` rename, the
   **corrected** `alerts.jsonl` rationale, the bootstrap-first ordering,
   **step 8b's existence check and the fact that it maps to `mismatched` rather
   than a sixth taxonomy member**, **`repairCatchup`'s notice discipline**, **the `repairCatchup` export and why the three catch-up criteria need it**, **condition (c0) rule 4's `path.win32.resolve()` normalization (4c) and the `assertSafeOverride`-mirroring component check that bounds it (4a) — including why `…\.wienerdog\.\` is rejected despite denoting the right directory**, **the deletion of verification step 5c and the runtime guarantee that replaces it**, and
   anything else chosen under ambiguity — and `Generated-by:`.
   **"Discovered issues" must contain the two ADR-side items from
   disposition 5** (`docs/adr/0018-…:297`'s *"sync remains the sole healer"*,
   false on `main` before this WP; and decision 2's unconditional *"leaves a
   pessimistic record"* clause over a best-effort writer), each with the
   proposed follow-up slug. The ADR is owner-signed and is not a deliverable —
   report, do not edit.
5. The PR body states explicitly that **this WP does not close the incident
   class on its own**; `WP-scheduler-loaded-record-tripwire` must also merge.
6. This spec's `status:` flipped to `In-Review` in the same PR.
7. **Owner Windows-VPS checklist item added to the PR body** (not performed by
   the implementer): confirm on a real Windows install that `wienerdog doctor`
   reports the two scheduled tasks as `loaded` and not `unverified` — i.e. that
   `schtasks /query /tn … /xml` round-trips well enough for Table B's four
   `schtasks` conditions. This mirrors ADR-0018's existing "mandatory owner
   Windows-VPS checklist" precedent for facts CI cannot reach.
8. **The ADR-0018 amendment is already ratified — VERIFY it, do not request it.**
   This WP implements the 2026-07-25 amendment, and the owner signed it on
   2026-07-26. **The authoritative ratification marker is the amendment's own
   status line**, `docs/adr/0018-windows-scheduled-dreaming.md:204`, which reads
   exactly:
   `Status: **Accepted. OWNER-SIGNED 2026-07-26.**`
   Paste the evidence into the PR body — **use the ANCHORED, exact-line form**:

   ```bash
   grep -nE '^Status: \*\*Accepted\. OWNER-SIGNED 2026-07-26\.\*\*$' \
     docs/adr/0018-windows-scheduled-dreaming.md
   ```

   It must print **exactly one line, `204:`**. An earlier draft told you to run a
   bare `grep -n "OWNER-SIGNED"`; that is **not** a valid gate and must not be
   used. Executed this session, the bare form prints **five** lines — `:6`,
   `:204`, and `:368`/`:370`/`:375` from the architect note added in round 2, one
   of which renders as ``…`Status: **Accepted. OWNER-SIGNED 2026-07-26.**` line
   above it. An empty…`` and is near-indistinguishable from a real status line in
   a pasted PR body. Also executed: with the real status line removed, the bare
   form still prints four lines and exits 0 (green on a mutilated ADR) while the
   anchored form prints nothing and exits 1. This is the same "a gate satisfied by
   prose that merely names the marker" trap this project has hit before — anchor
   it. Nothing keys on an approval block — the vestigial empty
   one that used to sit at the end of that ADR was removed on 2026-07-26 and an
   architect note records why. The implementer **does not edit the ADR** (it is
   deliberately not a deliverable). If the status line does **not** read as
   above, stop and ask the owner rather than proceeding or editing it.

### Owner decisions — ALL RULED; none blocks this WP

Item 8 above and items 9-10 below are the three places this WP touches owner
authority, and **all three are now settled**. Item 8 was already settled when
this spec was written (the amendment is ratified — verify it, do not request it).
**Items 9 and 10 were the two that blocked dispatch, and Gyula ruled on both
verbally in session on 2026-07-26**; the transcription is immediately below.
Neither was an ambiguity an implementer could have resolved with CLAUDE.md's
"choose the simpler option" — both were questions about what owner-signed text
means or whether a defect may ship, and an architect may not settle either, which
is why they were routed rather than decided here. Item 11 is advisory and blocks
nothing. **An implementer may now start.**

> **OWNER-RATIFIED IN SESSION (TRANSCRIBED, NOT OWNER-TYPED)** — 2026-07-26.
>
> Gyula ruled verbally in session on items 9 and 10 on 2026-07-26. **Transcribed
> here by the orchestrating session; not typed by Gyula.** This is the record of
> a decision, not a signature. It is deliberately **not** an `OWNER-SIGNED` line,
> it does not satisfy any gate that requires one, and it must never be rewritten
> as one. The single gate in this spec that *does* require an owner-typed marker
> is **Definition of done item 8**, and that marker already exists — Gyula typed
> it into `docs/adr/0018-windows-scheduled-dreaming.md:204` on 2026-07-26.
> **Nothing further needs to be typed by Gyula for this WP.**
>
> - **Item 9 — the ADR-0018:294-296 reading. Gyula: "refresh".**
>   **Reading B (wd-reviewer) GOVERNS.** The signed sentence mandates that the
>   durable cache be *refreshed* before a destructive replacement; it does **not**
>   mandate that the replacement be **abandoned** when that refresh fails.
>   **Reading A (Codex) — that the sentence states a forbidden postcondition, so a
>   WP residual cannot waive it — is therefore NOT the governing reading.**
>   Consequence: disposition 4's honesty-plus-residual disposition and Residual 10
>   **stand as written** — `markerAttempted`, an unconditional best-effort refresh,
>   and no gating of the destruction on confirmed persistence. Both readings stay
>   on the page under disposition 4 as the record of how the question was settled;
>   **do not reopen it in a later round.**
> - **Item 10 — Residual 8. Gyula: "ship as a known-open defect for now."**
>   Residual 8 is **accepted** — a known-open defect this WP ships with, rather
>   than an open blocker. **"For now" is Gyula's own qualifier and is
>   load-bearing:** this accepts the current state; it does **not** close the
>   underlying defect, and it is **not** a third accepting argument. Residual 8's
>   own text is unchanged and stays unchanged — the two falsified accepting
>   grounds and Codex's recorded dissent included. The follow-up remains routed: a
>   single-entry writer in `src/scheduler/status.js` plus an ADR-0018 amendment,
>   `WP-scheduler-marker-persists-verdict`. The PR body must still name Residual 8
>   as a known open defect in those words.

**Item 9 — does ADR-0018:294-296's pre-destructive-marker sentence permit a
BEST-EFFORT refresh? RULED 2026-07-26: yes — Reading B governs.**
The two review legs read the same signed sentence oppositely; both readings are
set out verbatim under disposition 4 and both are kept there. **Reading A
(Codex):** it states a postcondition, so an invisible refresh failure waives
signed text and the WP needs an amendment first. **Reading B (wd-reviewer):** it
mandates the refresh, not the abandonment of the replacement when the refresh
fails, so the honest-residual disposition is consistent with it. Disposition 4
states what changes under each. **The owner picked Reading B** (transcribed
above), so the `refreshSchedulerStatus` marker rule in "Exact contracts" and
Table E is **settled, not provisional** — implement it as written.

**Item 10 — Residual 8 is a real defect, not a modelling artefact; does it block?
RULED 2026-07-26: no — it ships, stated, as a known-open defect.**
The pre-destructive marker re-probes instead of persisting the heal verdict, and
a **transient** presence-query failure alone (no concurrency, no external
mutation) makes it persist `loaded` immediately before a `bootout`. Two rounds
produced two accepting arguments and both were falsified; this spec offers no
third, and the owner's ruling is not one either — it accepts the defect, it does
not justify it. Closing it in code needs a single-entry writer in
`src/scheduler/status.js` **and** an ADR-0018 amendment, because the signed text
says the cache is refreshed *"from the live probe"*. **The owner ruled that this
WP ships with the defect stated**, and `WP-scheduler-marker-persists-verdict`
follows, carrying the ADR amendment. The PR body must name it as a known open
defect in those words.

**Item 11 (advisory, not blocking) — split the Windows leg?**
See "ARCHITECT'S SIZING NOTE" under Deliverables. 28 mandated named tests and 30
mutations is at the edge of one implementer pass. The architect recommends
`WP-scheduler-entry-identity-windows` (Table B's `schtasks` row, Table B1, AC-1's
schtasks fixtures, M18/M22/M23/M24/M29/M30) as a dependent WP, leaving the launchd
leg here. The owner may decline; this WP is executable either way, just long.
**Items 9 and 10 are now answered** (transcribed above), so the precondition that
used to hold this split back is met — note, though, that the split is less
clean than it looks: the Windows leg would still need Table A, Table C's seam
rules and the `expect` plumbing, so the shared surface does not shrink much.
**If the split is elected, it must be executed by wd-architect as a full spec
pass that RE-DERIVES AC-13's enumeration and verification step 1's literal
count in BOTH resulting WPs — not by moving rows between files.** That is not a
formality: this exact class of drift is what review caught in round 4 (step 1's
literal `26` against a gate of `-ge 21`) and again in round 5 (M28 unregistered,
M7 unmandated). The Deliverables table, the mutation numbering, AC-13's
enumeration and step 1's literal are four mirrors of one contract, and a
row-moving edit desynchronizes all four.
