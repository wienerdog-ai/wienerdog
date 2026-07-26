---
id: WP-scheduler-loaded-record-tripwire
title: Give the scenario harnesses a LOADED-RECORD tripwire that catches stale cross-run scheduler leaks
status: Draft
model: opus
size: S
depends_on: []
adrs: [ADR-0004, ADR-0018]
epic: scheduler-integrity
---

# WP-scheduler-loaded-record-tripwire: the harness must read the record, not the file

## Context (read this, nothing else)

Wienerdog registers its scheduled jobs with the OS-native scheduler: launchd
LaunchAgents on macOS, systemd user timers on Linux, Task Scheduler tasks on
Windows. **IRON RULE (ADR-0004): Wienerdog is just files.** No daemon, no
watcher. Everything in this WP runs once, inside a test harness's existing
`finally` block, and exits with it.

This repo has two **live scenario harnesses** —
`tests/scenarios/run-scenarios.js` and `tests/scenarios/negative/run-negative.js`
— that run the real `wienerdog init --fresh-vault --yes` as a subprocess. That
subprocess auto-schedules the nightly dream. Because those harnesses
deliberately leave `HOME` pointed at the maintainer's **real** home (so the
separate `claude -p` dream subprocess can reach the subscription/Keychain OAuth
— ADR-0009), the scheduler code resolves the **real** launchd/systemd
directories. WP-161 built a containment kit for exactly this
(`tests/scenarios/scheduler-guard.js`): a fail-closed PATH shim that captures any
real loader invocation, plus a post-run observer that scans the real scheduler
directory for stray entry **files** referencing the run's temp root.

That containment was not enough, and here is precisely why. On the maintainer's
machine the `ai.wienerdog.catchup` LaunchAgent had been firing hourly for weeks
against a **deleted** launcher inside a long-gone harness temp core
(`/var/folders/…/T/wd-negative-UezlJP/core/launcher/launch.js`). Every fire died
with `MODULE_NOT_FOUND` inside node's module loader — before a single line of
Wienerdog code ran — so there was no refusal, no alert, no log. `launchctl print`
reported `runs = 76, last exit code = 1`. **The `.plist` file on disk was
perfectly correct the whole time.** launchd labels are per-user-global: a harness
run that bootstrapped a catch-up agent from its own temp core simply **overwrote
the loaded record for the real label**, left the real file untouched, and then
deleted the temp launcher it had just registered.

So the existing observer reported clean, correctly and uselessly: a registration
that clobbers an existing label leaves **no new file behind**, and the observer
reads only files.

**Timeline correction — do not go hunting for a preventer bug.** WP-161's shim
shipped in `249b164` on **2026-07-23**, one day *after* the `wd-negative-UezlJP`
leak occurred (2026-07-22). The leak **predates** the shim; WP-161's preventer is
not broken, and this WP is not fixing it. What survived WP-161 is the **stale
loaded record**, which a file-scanning observer structurally cannot see — and
which a `tempRoot`-scoped observer would not have flagged even if it could,
because the offending root belonged to an *earlier* run. Both of those are what
this WP fixes.

**This WP does not close the incident class on its own.** Its sibling,
`WP-scheduler-entry-identity`, fixes the *product's* health probe and heal, which
mapped `launchctl print`'s exit code 0 to `loaded` and printed a green
`wienerdog doctor` line throughout the incident. This WP fixes the *test
harness's* observer. The class is closed only when **both** have merged; say
exactly that in the PR body and do not claim otherwise.

The two WPs are fully independent: this one touches **no `src/` file**, imports
**no product module** for its new logic (by construction — scenario
infrastructure must not import the product code it guards), and can be
implemented, reviewed and merged in either order.

## Current state

Every claim below was read in the tree at commit `efd1489`.

- `tests/scenarios/scheduler-guard.js:1-21` — module header. Lines 19-21 state
  *"Zero deps, plain Node >= 18: only node:fs/os/path. **No `child_process`
  here** — the shims are `sh` files written to disk, spawned only by the
  harnesses …"*. This WP changes that fact and the header sentence must change
  with it.
- `tests/scenarios/scheduler-guard.js:34` —
  `const DARWIN_ENTRY_PATTERN = /^ai\.wienerdog\.[a-z0-9.-]+\.plist$/;`
- `tests/scenarios/scheduler-guard.js:194-205` — `realSchedulerDirs(platform, env)`
  returns `~/Library/LaunchAgents` on darwin, the systemd user dir on linux,
  and `[]` on every other platform (WP-161's accepted Windows residual).
- `tests/scenarios/scheduler-guard.js:282-354` — `assertNoRealSchedulerLeak(tempRoot, opts)`.
  `readdirSync`s those dirs, name-matches the pattern, opens each match by fd
  (`O_RDONLY | O_NONBLOCK`), `fstat`s the same fd, refuses non-regular files, and
  fails when the **file content** contains `tempRoot` in any of four
  serializer-escaped forms (`tempRootVariants`). It reads nothing but files, and
  it only detects a leak from **this** run. It **fails closed** on an unreadable
  directory or file (`:303-306`, `:322-327`) and on a non-regular entry
  (`:331-334`).
- `tests/scenarios/scheduler-guard.js:356` —
  `module.exports = { makeLoaderShimDir, buildInitEnv, assertNoLoaderInvoked, assertNoRealSchedulerLeak };`
- Call sites, both inside the existing `finally`, both immediately before
  `fs.rmSync(root, …)`:
  - `tests/scenarios/run-scenarios.js:484-486`
  - `tests/scenarios/negative/run-negative.js:512-514`
- Temp roots: `tests/scenarios/run-scenarios.js:302` (`wd-scenarios-`) and
  `tests/scenarios/negative/run-negative.js:470` (`wd-negative-`), both
  `fs.mkdtempSync(path.join(os.tmpdir(), …))`.
- `tests/unit/scheduler-leak-guard.test.js` unit-tests the guard under
  `npm test` (no quota, no real scheduler). Every test name is prefixed
  `scheduler-leak-guard:` (with a trailing space); its header (lines 10-13)
  explains why: *"a name-pattern that matches nothing passes vacuously"*. It
  imports `src/scheduler/generators` **read-only**, for the pre-existing
  `systemdUserDir` assertions only.
- `npm test` is `node tests/run.js`, which sets
  `WIENERDOG_TEST_NO_REAL_SCHEDULER=1` for the whole suite and forwards argv
  (`tests/run.js:1-12`).

**Facts verified first-hand on macOS 26 during this WP's authoring** (read-only
commands, real machine, `efd1489`):

- `/bin/launchctl` exists (`-rwxr-xr-x root:wheel`).
- `launchctl list` exits 0 and prints TAB-separated `PID\tStatus\tLabel` rows
  with a `PID\tStatus\tLabel` header row.
- `launchctl print gui/<uid>/ai.wienerdog.dream` exits 0; the raw lines of its
  arguments block, `JSON.stringify`d, are exactly:

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

  i.e. a line whose **trimmed** content is `arguments = {`, one argument per
  line, terminated by a line whose trimmed content is `}`. Your parser must
  `trim()` each line rather than match a literal indent (markdownlint forbids
  hard tabs in this file, so the block is shown escaped rather than pasted).
- `os.tmpdir()` is `/var/folders/…/T` while `fs.realpathSync(os.tmpdir())` is
  `/private/var/folders/…/T` — **they differ on macOS**, and the poisoned argv
  used the *non*-realpath form. Both must be in the prefix set.

## Deliverables (permission boundary — touch ONLY these)

| Action | Path | Notes |
|--------|------|-------|
| modify | tests/scenarios/scheduler-guard.js | add `assertNoLoadedSchedulerLeak` (+ export); update the module header's "No `child_process` here" sentence; existing exports and their behavior unchanged |
| modify | tests/unit/scheduler-leak-guard.test.js | tests for `assertNoLoadedSchedulerLeak`, every name prefixed `scheduler-leak-guard:` (with a trailing space) |
| modify | tests/scenarios/run-scenarios.js | ONE added line in the existing `finally` (after line 485) |
| modify | tests/scenarios/negative/run-negative.js | ONE added line in the existing `finally` (after line 513) |

**Honest file inventory.** Four files, all under `tests/`, two of them one-line
call sites. Zero `src/` files, zero product-code imports for the new logic, zero
new dependencies. Well inside the README's `≤ 8 files` / `≤ ~400 lines`
heuristic. This spec's own `status:` flip is always allowed without listing (see
`_TEMPLATE.md`) and is not counted above.

### Exact contracts

#### `tests/scenarios/scheduler-guard.js`

```js
const { spawnSync } = require('node:child_process');

/** The absolute launchd client path. ABSOLUTE BY CONTRACT: the harness prepends
 *  a fail-closed loader-shim dir to the sandboxed init env's PATH, and a
 *  bare-name lookup could resolve to that shim — the guard would then observe
 *  its own containment machinery instead of the OS and report a false clean. */
const LAUNCHCTL_PATH = '/bin/launchctl';

/** Loaded-record label pattern. Deliberately looser than the product's
 *  `[a-z0-9-]` job-name charset: the guard must be able to SEE a foreign-shaped
 *  Wienerdog label, not only the ones we would have written. Fully anchored, no
 *  `m` flag. */
const LOADED_LABEL_PATTERN = /^ai\.wienerdog\.[a-z0-9.-]+$/;

/**
 * Tripwire 3: the LOADED-RECORD observer. Reads what the OS scheduler will
 * ACTUALLY EXECUTE for every Wienerdog-named registration, and fails the run
 * when any of it points into a temp directory. Deliberately takes NO `env`
 * parameter — it must never be handed the sandboxed init env.
 * Reads NO file: not the plist, not the systemd unit. The file artifact was
 * clean throughout the incident this exists to catch.
 * @param {string} tempRoot  this run's temp root
 * @param {{platform?:NodeJS.Platform,
 *          run?: (argv:string[]) => {status:number|null, stdout?:string, error?:Error},
 *          uid?: number, prefixes?: string[],
 *          notice?: (msg:string) => void}} [opts]
 * @returns {string[]} one loud, actionable failure per offending record; [] if clean
 */
function assertNoLoadedSchedulerLeak(tempRoot, opts = {})
```

`module.exports` gains `assertNoLoadedSchedulerLeak`. The four existing exports
and their behavior are unchanged.

Behavior — the darwin arm, selected by
**`(opts.platform || process.platform) === 'darwin'`**.

> Note the parenthesisation. `(opts.platform || process.platform === 'darwin')`
> parses as `opts.platform || (process.platform === 'darwin')`, which is truthy
> for **any** non-empty `opts.platform` — including `'linux'`. Write it as shown.

1. **Prefixes.** `opts.prefixes` if given, else the deduped list
   `[tempRoot, os.tmpdir(), fs.realpathSync(os.tmpdir())]` (the `realpathSync`
   call wrapped in `try/catch`; on failure just omit that third entry). Strip any
   trailing separator from each. An argument `a` **leaks** when `a === p` or
   `a.startsWith(p + '/')` for some prefix `p`. Including the whole OS temp dir —
   not only `tempRoot` — is what makes a **stale** leak from an earlier run
   visible; that is the property whose absence let the 2026-07-22 record survive.
2. **Enumerate.** `run([LAUNCHCTL_PATH, 'list'])`. `r.error`, `r.status !== 0`,
   or a non-string stdout → return **one** failure (unverifiable → fail closed).
3. **Select labels.** Split stdout on `\n`; for each line take field index 2 of
   `line.split('\t')`; keep only labels matching `LOADED_LABEL_PATTERN`.
4. **Read each record.** `run([LAUNCHCTL_PATH, 'print', 'gui/' + uid + '/' + label])`
   where `uid = opts.uid ?? process.getuid()`. Then, per Table A:
   - `r.error` → **failure** (the observer could not run; unverifiable).
   - `r.status === 36` → **skip**, and emit a notice (Table A). This is the only
     tolerated non-zero exit: launchd's `EBADF`-family "could not find service"
     code, i.e. the label was listed a moment ago and is no longer loaded — a
     genuine race.
   - any other non-zero `r.status` → **failure** (unverifiable).
   - non-string stdout → **failure**.
   - status 0 → extract the arguments block: find the first line whose
     **trimmed** content is exactly `arguments = {`; collect subsequent non-empty
     trimmed lines until one whose trimmed content is exactly `}`. No
     `arguments = {` line, or no closing `}` line → **failure** (unverifiable).
   - any collected argument that leaks (step 1) → **failure**.
5. Return the accumulated failures.

Failure message shape (one per offending record):

```text
scheduler-guard: LEAK — the LOADED launchd record ai.wienerdog.catchup will execute
/var/folders/…/T/wd-negative-UezlJP/core/launcher/launch.js, which is inside a temp
directory. A harness run clobbered the real per-user label; the .plist FILE on disk is
not the artifact at fault and may look clean. Repair:
  launchctl bootout gui/$(id -u)/ai.wienerdog.catchup && wienerdog sync
```

Behavior — linux and every other platform: return `[]` **and** emit exactly one
notice naming the residual (Table B). `opts.notice` defaults to
`(m) => console.log(m)` so the unit tests can capture it without reading stdout.

Call sites — one line each, immediately after the existing
`assertNoRealSchedulerLeak` call and still before `fs.rmSync(root, …)`:

```js
if (root) failures.push(...scg.assertNoLoadedSchedulerLeak(root));
```

- `tests/scenarios/run-scenarios.js` — after line 485.
- `tests/scenarios/negative/run-negative.js` — after line 513.

The new guard reads only the OS scheduler, so it is order-independent with
respect to `fs.rmSync`; keeping it inside the same `finally` block guarantees it
runs on every exit path, which is why it goes there and not after the block.

## Contract reference

The ADR-0031 activation test fires on **3 of 7**: (ii) a result taxonomy is
introduced (fail / skip / notice per record); (iii) structured parsing of
`launchctl list` and `launchctl print` output is introduced; (iv)
error/precedence behavior — which unverifiable condition fails closed and which
single one is tolerated — is new and load-bearing.

### Table A — per-record disposition (canonical)

Every fact about how one enumerated label is dispositioned is decided here.
Prose elsewhere cites this table; it must not restate a cell.

| Condition on `run(['/bin/launchctl','print','gui/<uid>/<label>'])` | Disposition | Notice emitted? | Why |
|---|---|---|---|
| `r.error` (spawn failed) | **failure** | no (the failure IS the signal) | the observer could not observe; every other unverifiable branch in this module fails closed (`:303-306`, `:322-327`, `:331-334`) |
| `r.status === 36` | **skip** | **yes** — `scheduler-guard: note — label <label> was listed but is no longer loaded (launchctl print exit 36); skipped.` | launchd's "could not find service" code: a genuine listed-then-unloaded race |
| any other `r.status !== 0` | **failure** | no | `launchctl print` exits non-zero for reasons other than "no longer loaded" (permissions, a malformed domain target). A blanket skip is a silent fail-open in a module whose entire doctrine is fail-closed |
| `typeof r.stdout !== 'string'` | **failure** | no | unverifiable |
| status 0, no line trimming to `arguments = {` | **failure** | no | unverifiable — the record exists but its exec identity could not be read |
| status 0, block opened but no line trimming to `}` | **failure** | no | truncated output; unverifiable |
| status 0, block parsed, some argument leaks (prefix rule) | **failure** | no | the leak |
| status 0, block parsed, no argument leaks | clean | no | verified clean |

**No disposition in this table is silent.** A skip prints; a failure is returned
to the harness, which prints it and sets `process.exitCode = 1`
(`run-scenarios.js:489-493`, `run-negative.js:518-521`).

### Table B — per-platform coverage (canonical)

| Platform | What `assertNoLoadedSchedulerLeak` does | Why that is honest |
|----------|------------------------------------------|--------------------|
| `darwin` | enumerates loaded labels via `/bin/launchctl list`, reads each `ai.wienerdog.*` record's `arguments` block via `/bin/launchctl print`, disposition per Table A | this is the only platform where a harness can clobber a per-user-global loaded record while leaving the real file untouched — the observed incident |
| `linux` | returns `[]`; emits one notice naming this row | a `systemd --user` manager's unit search path is fixed when the **manager** starts and is not moved by a *child* process's `XDG_CONFIG_HOME`, so `systemctl --user enable` can never load a unit from the harness's temp dir (it resolves nothing). The only reachable leak shape writes a unit **file** into the real `~/.config/systemd/user`, which `assertNoRealSchedulerLeak` (`scheduler-guard.js:282`) already catches. **Owner-visible residual:** if a harness ever writes into the real systemd user dir and enables from there, this arm must be implemented |
| `win32` (and any other) | returns `[]`; emits one notice naming this row | WP-161's already-accepted Windows residual: no `schtasks` PATH interceptor exists and CI has no Windows runner |

### Table C — recursion-hazard properties the darwin arm must satisfy (canonical)

It runs *inside* the harness that does the leaking, so every property below is a
requirement, not a nicety.

| Property | How | Gated by |
|---|---|---|
| the loader shim cannot intercept the observer | argv[0] is the absolute `/bin/launchctl`, never a bare name | AC-4, M2 |
| the sandboxed init env cannot reach the observer | the function takes **no `env` parameter**; the default `run` inherits the *runner's* `process.env` | AC-4 |
| the neutralizers that caused the leak cannot silence the observer | `WIENERDOG_LOADER_NOOP` and `WIENERDOG_TEST_NO_REAL_SCHEDULER` are **not read** here — they neutralize the *product's* loader, and honoring them would let the leaking configuration disable its own detector. Note `npm test` sets the second one for the whole suite (`tests/run.js:7`), so a guard that honored it would be dead under CI | AC-5, M5 |
| the clean-looking artifact cannot satisfy the observer | it reads **no file** — not the plist, not the systemd unit, not the manifest | AC-6, M6 |
| a stale leak from an earlier run cannot hide | the prefix set includes the whole OS temp dir (`os.tmpdir()` **and** its realpath), not only this run's `tempRoot` | AC-3, M4 |
| an unverifiable record cannot pass as clean | Table A: exactly one non-zero exit code is tolerated, and it prints | AC-2, M3 |

### Mirrored Surface Checklist

**Table A (per-record disposition)** — surfaces that mirror it:

- [ ] Deliverables row for `tests/scenarios/scheduler-guard.js`
- [ ] "Exact contracts" → the darwin arm's step 4
- [ ] Acceptance criteria AC-1, AC-2
- [ ] Verification step 5's grep for the exit-36 discriminant
- [ ] Current-state note on `assertNoRealSchedulerLeak`'s fail-closed branches
- [ ] Mutation checks M1, M3
- [ ] **`docs/adr/0018-windows-scheduled-dreaming.md`**, 2026-07-25 amendment,
      decision 3 — *"Every unverifiable per-record condition in the observer
      fails closed; the single tolerated exception … prints a notice"*

**Table B (per-platform coverage)** — surfaces that mirror it:

- [ ] "Exact contracts" → the non-darwin arm and the `(opts.platform || process.platform) === 'darwin'` selector
- [ ] Acceptance criterion AC-7
- [ ] Residuals 1 and 2
- [ ] Mutation check M7
- [ ] **`docs/adr/0018-windows-scheduled-dreaming.md`**, 2026-07-25 amendment,
      final "Scope and honesty about platforms" paragraph — the launchd-only
      implementation, the systemd search-path argument, the win32 residual

**Table C (recursion hazards)** — surfaces that mirror it:

- [ ] Deliverables rows for the two harness call sites
- [ ] "Exact contracts" → `LAUNCHCTL_PATH`, the absent `env` parameter, the prefix rule
- [ ] Acceptance criteria AC-3, AC-4, AC-5, AC-6
- [ ] Verification step 5's greps for `/bin/launchctl` and the two call sites
- [ ] Current state: the module header's "No `child_process` here" sentence
- [ ] Mutation checks M2, M4, M5, M6
- [ ] **`docs/adr/0018-windows-scheduled-dreaming.md`**, 2026-07-25 amendment,
      decision 3 — it restates the absolute-path, no-`env`, no-neutralizer,
      no-file and whole-temp-dir properties nearly verbatim
- [ ] **`docs/specs/logbook/2026-07-25-third-scheduler-identity-incident.md`**,
      final paragraph — same five properties plus the prefix-set rule

Neither the ADR nor the logbook is in this WP's Deliverables and **neither may be
edited from this branch**; they are registered so a future change to Table A, B
or C is known to require a separate pass over them.

## Implementation notes & constraints

- **No new npm deps, plain Node ≥ 18, JSDoc not TypeScript.** The module gains
  exactly one new core import: `node:child_process`.
- **Update the module header.** Lines 19-21 currently claim *"No `child_process`
  here"*. Replace that sentence with the new fact **and its reason**: the
  loaded-record observer must ask the OS itself, and it does so read-only through
  an injectable seam. A stale comment that contradicts the code is the same
  failure class this WP exists to fix.
- **Do not import any `src/` module for the new guard's logic.** Scenario
  infrastructure must not import the product code it guards — an independent read
  is the whole point. (`scheduler-leak-guard.test.js` may keep its existing
  read-only `generators` import for the *pre-existing* tests; do not add new
  product imports.)
- **Read-only, and nothing outlives the caller (ADR-0004).** Every added call is
  a short read-only `spawnSync` inside the harness's already-running `finally`.
  The observer never mutates the scheduler and never issues `bootout`.
- **The guard will fail on a machine that already carries a leak from a previous
  run.** That is correct and intended; the failure message carries the exact
  repair command. Do not add a suppression flag.
- **`opts.run` is the only way the tests reach the OS.** Every unit test must
  inject it. **No test in this WP may spawn a real `launchctl`.** The default
  `run` is `(argv) => spawnSync(argv[0], argv.slice(1), { encoding: 'utf8' })`.
- **Ambiguity → choose the simpler option** and record it under "Decisions
  made" in the PR body. Do NOT expand scope to resolve ambiguity.

### Residuals (state them; do not paper over them)

1. **linux is a structural no-op, not an implementation.** Table B row 2. The
   argument is that a child process cannot move a running `systemd --user`
   manager's unit search path, so the temp-core leak shape is unreachable; the
   reachable shape (a unit file written into the real user dir) is already caught
   by `assertNoRealSchedulerLeak`. The notice prints on every run so the gap
   cannot rot silently. Owner: architect.
2. **win32 is uncovered** — WP-161's pre-existing, already-accepted residual (no
   `schtasks` PATH interceptor, no Windows CI runner). Also printed every run.
3. **The observer sees only `ai.wienerdog.*` labels.** A harness that registered
   under a label outside that namespace would be invisible. Accepted: the product
   only ever mints labels in that namespace (`generators.launchdLabel`), and the
   pattern is deliberately looser than the product's own charset so a
   *foreign-shaped* Wienerdog label is still seen.
4. **`launchctl print`'s exit code 36 is treated as the sole "no longer loaded"
   discriminant.** It was not exercised against a real unloaded label in this
   session (doing so requires racing an unload). If it proves wrong on some macOS
   version, the failure mode is a *false failure* — loud, not silent — which is
   the correct direction for this module. Owner: architect.
5. **AC-8's call-site check is structural.** Neither harness can be required from
   a unit test (both start executing scenarios on require, consume quota, and
   need a real `claude` login), so no affordable executable regression exists for
   "the harness actually calls the guard". Verification step 5 uses a per-file,
   comment-rejecting conditional grep instead, gated by mutation M8. Stated
   plainly rather than dressed up as behavioral coverage.

## Security checklist

- [ ] The launchd label read out of `launchctl list` is matched against the
      **fully anchored** `/^ai\.wienerdog\.[a-z0-9.-]+$/` before it is
      interpolated into `gui/<uid>/<label>`. It never becomes a filesystem path
      and never reaches a shell (`spawnSync` with an argv array, no
      `shell: true`), so the `.` the pattern admits cannot form a traversal
      primitive. Confirm the regex is `^…$`-anchored with **no `m` flag** — JS
      `$` without `m` is end-of-string, so a newline-bearing field cannot smuggle
      a second line past it.
- [ ] `uid` is `opts.uid ?? process.getuid()` — a number, never a string from
      parsed output.
- [ ] The parsed `launchctl print` output is untrusted display text and is only
      ever **compared** (prefix/equality) and **interpolated into a failure
      message**. No value parsed out of it is executed, `path.join`ed, written to
      disk, or turned into an argv.
- [ ] `LAUNCHCTL_PATH` is an absolute literal. A bare `'launchctl'` would resolve
      through `PATH`, which the harness deliberately poisons with a fail-closed
      shim dir (Table C row 1).

## Acceptance criteria

**Preamble — read before writing a single test.** A test that passes against
unmodified `main` is **not evidence**. Every assertion below must be red before
the corresponding change and green after; the Mutation checks table makes that
literal. Two prior WPs in this area shipped verification that shared the spec's
blind spot and reported the class closed when only an instance was. For each new
assertion, state in a comment **which artifact it reads** and **why that artifact
is the authoritative one**. Here the authoritative artifact is the OS scheduler's
own record of what it will execute; the plist file on disk is not, and **no
assertion in this WP may read one**.

- [ ] **AC-1** `assertNoLoadedSchedulerLeak` returns a failure naming both the
      label and the offending argument when a loaded `ai.wienerdog.*` record's
      arguments block contains a path under the OS temp dir; and returns `[]`
      when every argument is outside every prefix. Driven entirely by canned
      `opts.run` output.
- [ ] **AC-2** Table A, exhaustively: a spawn `error` → failure; `status === 36`
      → skip **plus** exactly one captured notice; `status === 1` (and any other
      non-zero) → failure; non-string stdout → failure; status 0 with no
      `arguments = {` line → failure; status 0 with an unterminated block →
      failure. Assert the `status === 1` case separately from the `36` case —
      that distinction is the whole point of the row.
- [ ] **AC-3** *(the stale-leak property)* a record whose argument lies under a
      **different** temp root than the `tempRoot` passed in is still reported as
      a leak.
- [ ] **AC-4** the observer invokes the loader by the absolute `/bin/launchctl`
      for **both** the `list` and the `print` calls (asserted on the captured
      argv arrays), and it accepts no `env` parameter: passing
      `{ env: { HOME: '/nonexistent', PATH: '/nonexistent' } }` in `opts` changes
      neither the captured argv nor the returned failures.
- [ ] **AC-5** *(the neutralizer-immunity property)* with **both**
      `WIENERDOG_LOADER_NOOP=1` **and** `WIENERDOG_TEST_NO_REAL_SCHEDULER=1` set
      in `process.env` for the duration of the test, a leaking canned record
      still produces a failure. (Note `npm test` sets the second one globally, so
      this test must set only the first and assert both are present.)
- [ ] **AC-6** *(the wrong-artifact property)* the observer consults no
      filesystem path: with `opts.run` returning a leaking record, the failure is
      produced while a spy on `fs.readFileSync` / `fs.readdirSync` /
      `fs.openSync` records **zero** calls for the duration of the guard call.
      Restore the originals in a `finally`.
- [ ] **AC-7** on a non-darwin platform (`opts.platform: 'linux'` and
      `opts.platform: 'win32'`) the observer returns `[]`, emits exactly one
      notice per call, and makes **zero** `run` calls. Also assert that passing
      `opts.platform: 'linux'` does **not** take the darwin arm — the
      operator-precedence trap in the selector.
- [ ] **AC-8** Both harnesses call the new guard inside their existing `finally`
      block. **Structural check** (see Residual 5), verified per file by
      verification step 5 with a pattern that a commented-out line cannot satisfy.
- [ ] **AC-9** Every new test name is prefixed `scheduler-leak-guard:` (with a
      trailing space), and the non-vacuity gate in verification step 1 reports at
      least 30 **named** passing subtests (the file already has 22 on `main`, so
      the gate also proves the pre-existing ones still run).
- [ ] **AC-10** `npm test` and `npm run lint` pass; the existing
      `scheduler-leak-guard` suite stays green with **no** assertion weakened or
      deleted, and `makeLoaderShimDir` / `buildInitEnv` / `assertNoLoaderInvoked`
      / `assertNoRealSchedulerLeak` are unchanged.
- [ ] **AC-11** Running the guard twice against the same canned input returns
      identical results and mutates nothing (idempotent, read-only).

### Mutation checks (one-line source mutation → the test that must turn red)

Apply each mutation on top of your finished branch, run the named command,
confirm it **fails**, then revert. Paste the resulting table into the PR.

| # | Mutation | Must turn red |
|---|----------|---------------|
| M1 | `assertNoLoadedSchedulerLeak`: return `[]` when an argument matches a temp prefix | `scheduler-leak-guard: loaded-record observer FAILS on a record whose loaded argv is under the OS temp dir` |
| M2 | change `LAUNCHCTL_PATH` to the bare `'launchctl'` | `scheduler-leak-guard: loaded-record observer invokes the loader by ABSOLUTE path (list and print)` |
| M3 | treat **any** non-zero `print` exit as a skip (the fail-open the spec removes) | `scheduler-leak-guard: a print exit of 1 is a FAILURE, not a skip` |
| M3b | treat a non-zero `list` exit as clean | `scheduler-leak-guard: loaded-record observer fails closed when enumeration fails` |
| M4 | build prefixes from `tempRoot` only | `scheduler-leak-guard: loaded-record observer catches a STALE leak from another run's temp root` |
| M5 | early-return `[]` when `process.env.WIENERDOG_TEST_NO_REAL_SCHEDULER` is set | `scheduler-leak-guard: the product's neutralizer env vars do NOT silence the observer` |
| M6 | read the plist at `~/Library/LaunchAgents/<label>.plist` and skip the label when its content has no temp path | `scheduler-leak-guard: the loaded-record observer reads NO file` |
| M7 | write the selector as `(opts.platform \|\| process.platform === 'darwin')` | `scheduler-leak-guard: opts.platform 'linux' does not take the darwin arm` |
| M8 | comment out the call in `tests/scenarios/negative/run-negative.js` | verification step 5's per-file conditional grep exits 1 |
| M9 | drop the exit-36 notice (skip silently) | `scheduler-leak-guard: a listed-then-unloaded label is skipped WITH a notice` |

## Verification steps (run these; paste output in the PR)

```bash
# 1. The guard suite, with a MACHINE-CHECKED non-vacuity gate. A bare
#    `--test-name-pattern` that matches nothing exits 0 with "pass 1", because
#    the FILE wrapper counts as a passing test — executed on this runner at
#    efd1489 against tests/unit/scheduler-status.test.js with the pattern
#    "zzz-definitely-nonexistent-pattern-42": exit 0, "ℹ pass 1". So count NAMED
#    subtest records in the TAP stream instead. Executed evidence that this gate
#    discriminates, same runner, same commit, against THIS file on `main`:
#      pattern "scheduler-leak-guard" → 22 named subtests
#      pattern "zzz-nope"             → 0 named subtests
n=$(node --test --test-reporter=tap --test-name-pattern "scheduler-leak-guard" \
      tests/unit/scheduler-leak-guard.test.js \
      | grep -E "^ok [0-9]+ - scheduler-leak-guard: " | wc -l | tr -d ' ')
echo "named passing subtests: $n"
[ "$n" -ge 30 ] || { echo "VACUOUS OR INCOMPLETE — the pattern selected $n named subtests"; exit 1; }

# 2. No regression anywhere, including the golden files.
npm test

# 3. Lint pipeline (markdownlint + shellcheck + shfmt + frontmatter schema).
npm run lint

# 4. The observer must not have acquired a product import. This must print
#    NOTHING and exit 0 (`grep -q` inverted): scenario infra never imports the
#    product code it guards.
if grep -nE "require\(['\"](\.\./)+src/" tests/scenarios/scheduler-guard.js; then
  echo "FAIL: scheduler-guard.js imports a src/ module"; exit 1
else
  echo "OK: scheduler-guard.js imports no src/ module"
fi

# 5. Structural greps, each ASSERTED and each checked PER FILE. Plain `grep -n`
#    only — never `grep -c`, which exits 1 on a zero count and has silently
#    "passed" in this repo before. The two call-site patterns are anchored at
#    `if (root)` so a commented-out line (`// if (root) …`) cannot satisfy them —
#    the previous draft's bare name grep did.
grep -n "'/bin/launchctl'" tests/scenarios/scheduler-guard.js \
  || { echo "FAIL: LAUNCHCTL_PATH is not the absolute literal"; exit 1; }
grep -nE "status === 36" tests/scenarios/scheduler-guard.js \
  || { echo "FAIL: the print-exit discriminant (Table A) is missing"; exit 1; }
for f in tests/scenarios/run-scenarios.js tests/scenarios/negative/run-negative.js; do
  grep -nE "^[[:space:]]*if \(root\) failures\.push\(\.\.\.scg\.assertNoLoadedSchedulerLeak\(root\)\);" "$f" \
    || { echo "FAIL: missing or commented-out call site in $f"; exit 1; }
done

# 6. NEGATIVE grep: the module header's stale claim must be GONE. This must exit
#    1 while the old sentence is present. Executed against `main` at efd1489 it
#    matches line 19 — i.e. it discriminates.
if grep -n "No \`child_process\` here" tests/scenarios/scheduler-guard.js; then
  echo "FAIL: the module header still claims there is no child_process here"; exit 1
else
  echo "OK: the module header records the new fact"
fi

# 7. Real-machine sanity — macOS only, READ-ONLY, no mutation, no product code.
#    ASSERTS (does not merely print). On a clean machine this prints OK; a
#    non-empty result here is a REAL leak on this machine, not a test failure —
#    paste it and stop. Skip on non-darwin and say so in the PR.
node -e '
const assert = require("node:assert");
const os = require("node:os");
const scg = require("./tests/scenarios/scheduler-guard");
const out = scg.assertNoLoadedSchedulerLeak(os.tmpdir() + "/wd-nonexistent-probe");
assert.ok(Array.isArray(out), "returns an array");
if (out.length) { console.log("REAL LEAK ON THIS MACHINE:"); for (const f of out) console.log("  - " + f); process.exit(1); }
console.log("OK: no loaded Wienerdog record executes anything under the OS temp dir");
'
```

**Do NOT run the scenario harnesses** (`npm run scenarios`,
`npm run scenarios:negative`, `WIENERDOG_RUN_SCENARIOS`) for this WP: they
consume quota and need a real `claude` login. AC-8 is covered by verification
step 5, and the guard's own behavior by its unit tests — which exercise the exact
function the harnesses call.

## Out of scope (do NOT do these)

- **Everything in `WP-scheduler-entry-identity`** — the product's health probe,
  taxonomy, digest callout and darwin heal (`src/scheduler/status.js`,
  `src/scheduler/generators.js`, `src/cli/schedule.js`, `src/cli/doctor.js`,
  `src/cli/dream.js`). Touch **no `src/` file**. **Neither WP closes the incident
  alone.**
- **Implementing the linux or win32 arm** of the observer (Table B). Both stay
  no-ops that print a notice.
- **Changing `makeLoaderShimDir`, `buildInitEnv`, `assertNoLoaderInvoked` or
  `assertNoRealSchedulerLeak`.** The new observer is additive; the file observer
  keeps its `tempRoot`-scoped contract, because the two answer different
  questions.
- **The live repair of the maintainer's hijacked `ai.wienerdog.catchup`.**
  Already done by hand before this spec was written. Do not script it.
- **Adding a suppression / allowlist flag** so a machine with a pre-existing leak
  can pass. The failure is the product.
- **Any `bootout`, `bootstrap` or other scheduler mutation** from the observer.
  It is strictly read-only.
- **Hand-writing any aggregate status table or dependency graph** (ADR-0029) —
  views are generated from frontmatter on demand.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body,
   including the named-subtest count from step 1 and the completed Mutation
   checks table.
2. Step 7 runs on macOS and its output is pasted; if the implementer is not on
   macOS, say so explicitly rather than silently omitting it.
3. Conventional commits; PR titled
   `test(scenarios): add a loaded-record scheduler tripwire (WP-scheduler-loaded-record-tripwire)`.
4. PR template filled, including "Decisions made" (at minimum: the exit-36
   discriminant, and anything else chosen under ambiguity) and `Generated-by:`.
5. The PR body states explicitly that **this WP does not close the incident class
   on its own**; `WP-scheduler-entry-identity` must also merge.
6. This spec's `status:` flipped to `In-Review` in the same PR.
