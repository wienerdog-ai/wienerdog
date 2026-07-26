---
id: WP-scheduler-loaded-record-tripwire
title: Give the scenario harnesses a LOADED-RECORD tripwire that catches stale cross-run scheduler leaks
status: Ready
model: opus
size: M
depends_on: []
adrs: [ADR-0004, ADR-0018]
epic: scheduler-integrity
---

# WP-scheduler-loaded-record-tripwire: the harness must read the record, not the file

> **DISPATCH STATUS — 2026-07-26: READY. No owner decision blocks this WP, and
> nothing further is required from the owner before an implementer starts.**
> Both adversarial review legs returned APPROVE — **wd-reviewer at round 3,
> Codex at round 6** — with no class-(a) or class-(b) findings outstanding.
> `depends_on` is **empty** and correctly so: this WP touches no `src/` file and
> imports no product module, so it is order-independent with respect to its
> sibling `WP-scheduler-entry-identity`. That sibling must also merge before the
> incident class is closed (Definition of done item 5), but it gates nothing
> here — the `LEAK` message's repair advice is true both before and after it
> lands. **Residual 8** (the different-temp-base blind spot) and the **routed
> launcher-identity follow-on** ("Considered and rejected this round") are
> deliberate, reviewed scoping: a future WP and a PR-body statement
> respectively, not dispatch blockers.

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

Every claim below was read in the tree at commit `efd1489` and **re-verified
first-hand at `6eb2d30`** during this WP's revision pass. Every line number below
holds at `6eb2d30`.

- `tests/scenarios/scheduler-guard.js:1-21` — module header. **Two sentences in
  it become false with this WP and both must change.**
  - Lines 13-17 state the module *"adds **two** fail-closed tripwires: a
    PATH-shim that captures + fails any real loader invocation
    (`makeLoaderShimDir` + `assertNoLoaderInvoked`), and a report-only observer
    that scans the real scheduler dir(s) for anything this run actually leaked
    (`assertNoRealSchedulerLeak`)."* This WP adds a third; the count **and** the
    enumeration must both change.
  - Lines 19-21 state *"Zero deps, plain Node >= 18: only node:fs/os/path. **No
    `child_process` here** — the shims are `sh` files written to disk, spawned
    only by the harnesses …"*. This WP changes that fact too.
- `tests/scenarios/scheduler-guard.js:283` — `const env = opts.env || process.env;`
  inside the **existing** `assertNoRealSchedulerLeak`. That call is legitimate
  and stays. It is why the "the new function never reads `opts.env`" check
  (verification step 4b) must be **scoped to the new function's source range**,
  not run over the whole file.
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
- **The `finally` blocks are greppable at a fixed indent, and that is what makes
  AC-8's placement check possible.** In both files the block opens on a line
  whose entire content is `} finally {` indented by exactly two spaces
  (`run-scenarios.js:469`, `run-negative.js:506`) and closes on the first
  following line whose entire content is `}` indented by exactly two spaces
  (`run-scenarios.js:487`, `run-negative.js:515`). Nothing between those pairs is
  a two-space `}` — `run-scenarios.js`'s inner `try/catch` closes at
  four spaces (`:478`) — so an `awk` range between them extracts exactly the
  `finally` body. Verified by execution during this WP's authoring, including
  the negative case: moving the existing `assertNoRealSchedulerLeak` call one
  line **above** the `} finally {` makes the range grep exit 1.
- Temp roots: `tests/scenarios/run-scenarios.js:302` (`wd-scenarios-`) and
  `tests/scenarios/negative/run-negative.js:470` (`wd-negative-`), both
  `fs.mkdtempSync(path.join(os.tmpdir(), …))`.
- Harness require-safety, which bounds what AC-8 can be:
  `tests/scenarios/run-scenarios.js:500` calls `main().catch(…)` **at require
  time with no `require.main` guard**; `tests/scenarios/negative/run-negative.js`
  **is** require-safe (`module.exports = { undeclaredMcpFailures };` at `:530`,
  `if (require.main === module)` at `:532`) but exports no seam over `main`'s
  `finally`. Both `main`s early-return unless `WIENERDOG_RUN_SCENARIOS === '1'`
  (`run-scenarios.js:282`, `run-negative.js:457`).
- `tests/unit/scheduler-guard.test.js:18-33` — an existing `withEnv(vals, fn)`
  helper that sets `WIENERDOG_TEST_NO_REAL_SCHEDULER` and `WIENERDOG_LOADER_NOOP`
  to given values (`undefined` = delete) and **restores both in a `finally`**, so
  the suite-wide setting is not disturbed. AC-5 uses this shape; it makes the
  test independent of whether the runner set the var.
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

**THE DOMAIN PRINT ENUMERATES, OBSERVED LIVE on macOS 26.5 during this WP's
round-3 pass.** `/bin/launchctl print gui/501` exits **0** and its output
contains a block whose **trimmed** opening line is exactly `services = {`,
closing at the next line whose trimmed content is `}`. Measured on this machine:
the block spans raw lines 24 → 482, **457 rows, zero nested braces**, and every
row splits on whitespace into exactly **3** fields (`PID`, `Status`, `Label`) —
so the **last whitespace-separated token of the trimmed row is the label**. The
one Wienerdog row was the raw line `"\t\t       0      0 \tai.wienerdog.dream"`,
and exactly one of the 457 extracted labels matched `LOADED_LABEL_PATTERN`.
Note that a *later* block in the same output opens with the trimmed content
`disabled services = {` (raw line 3095) — so the opener must be matched by
**exact trimmed equality**, never by `includes`.

**Why the observer enumerates from the domain print and not from `launchctl
list`.** `launchctl list` reports the caller's **session** domain, while every
record read is explicitly `gui/<uid>`. In a GUI login session the two agree —
observed here: `launchctl list | grep -c ai.wienerdog` → `1`, and the `gui/501`
services block → the same single label. In a session with **no GUI login** they
need not agree, and the disagreement is silent and fail-open: labels that exist
in `gui/<uid>` never appear in `list`, the per-record loop never runs, and the
observer returns `[]` — a green "verified clean" over a domain it never looked
at. This WP does not try to characterise when the two domains diverge; it
**removes the dependency on the answer** by enumerating and reading in the same
domain. That deletes a whole class of question rather than guarding it.

**`launchctl print` exit codes, OBSERVED LIVE on macOS 26.5 (build 25F71) during
this WP's revision passes.** Read-only probes of labels and domains that do not
exist, plus one bare domain query; nothing was mutated. These four observations
are what Table A's disposition column rests on — an earlier draft guessed `36`
and the guess was wrong:

| Probe (read-only) | Exit | stderr |
|---|---|---|
| `/bin/launchctl print gui/501` (the domain itself) | **0** | — (3116 lines of stdout) |
| `/bin/launchctl print gui/501/ai.wienerdog.does-not-exist-probe-8f3a2c` | **113** | `Could not find service "…" in domain for user gui: 501` |
| `/bin/launchctl print gui/424242` (and `gui/424242/<label>`) | **112** | `Could not find domain for user gui: 424242` |
| `/bin/launchctl print not-a-domain-target` | **64** | `Unrecognized target specifier.` |

`113` — not `36` — is the "there is no such service in this domain" code, and it
is the same code ADR-0018:139 records from the 2026-07-07 production incident
(*"`launchctl` had no record of them (exit 113 on `launchctl print`)"*). `112` is
a **different** condition — the domain itself is absent, which is exactly what a
headless/SSH session with no `gui/<uid>` domain produces — and must not be
skipped (Residual 7). `64` is a malformed target, i.e. an observer bug. Those two
are the concrete evidence that a blanket "any non-zero print exit is a skip"
would be a fail-open. The `gui/501` → `0` row is what makes the **enumeration**
call able to distinguish "this domain has no Wienerdog registration" from "this
process cannot see this domain at all".

**The non-vacuity gate's command, executed at `6eb2d30` on this runner (re-run
during the round-3 pass):** `node tests/run.js --test-reporter=tap
--test-name-pattern "scheduler-leak-guard" tests/unit/scheduler-leak-guard.test.js`
piped through the step-1 counter yields **22** named passing subtests on `main`;
the same command with the pattern `zzz-nope` yields **0**. The gate
discriminates. **The threshold in AC-9 and verification step 1 is `37`, not
`30`** — it is `22 + 15`, and the `15` is the count of distinct test names the
Mutation checks table requires. (It was `35` before the round-4 pass added M3c
and M14, each of which names a new test; re-derive it the same way if you add
another.) **Re-derived in the round-5 pass and unchanged at `37`**: that pass
collapsed AC-12's four clauses into a single equality assertion **inside the same
one test**, and added mutation rows M12b and M13c that **share** the existing
AC-12 test name — so the table grew from 20 rows to 22 while the distinct-name
count stayed at 15 (22 rows − 3 verification-step rows − 4 shared-name duplicates
= 15). AC-11's rewrite added assertions to an existing test, not a new name.
**The slack is exactly zero**: every one of those
15 names must exist and pass or step 1 goes red, and it will not tell you which
one is missing. Note the runner: `node tests/run.js …`, never a bare
`node --test` (see Table C's neutralizer row and verification step 1).

## Deliverables (permission boundary — touch ONLY these)

| Action | Path | Notes |
|--------|------|-------|
| modify | tests/scenarios/scheduler-guard.js | add `assertNoLoadedSchedulerLeak`, **defined last, immediately before `module.exports`** (+ export); update BOTH stale header sentences — the "two fail-closed tripwires" enumeration (`:13-17`) and "No `child_process` here" (`:19-21`); existing exports and their behavior unchanged |
| modify | tests/unit/scheduler-leak-guard.test.js | tests for `assertNoLoadedSchedulerLeak`, every name prefixed `scheduler-leak-guard:` (with a trailing space) |
| modify | tests/scenarios/run-scenarios.js | ONE added line in the existing `finally` (after line 485) |
| modify | tests/scenarios/negative/run-negative.js | ONE added line in the existing `finally` (after line 513) |

**Honest file inventory, and why this is `M` and not `S`.** Four files, all under
`tests/`, two of them one-line call sites. Zero `src/` files, zero product-code
imports for the new logic, zero new dependencies — well inside the README's
`≤ 8 files` half of the heuristic. The **line** half is what moves it: the
observer is ~90 lines and the acceptance criteria below name fifteen distinct
required tests (see the Mutation checks table), which lands the test file's
addition near 390 lines — putting the total **at or just past** the
`≤ ~400 lines` half of the heuristic rather than comfortably inside it, which is
precisely why this is `M` and not `S`. Sized `M` deliberately rather than optimistically;
the WP is still one coherent change with one permission boundary and is not
split further, because every one of those tests exists to make one row of
Table A or Table D falsifiable and splitting them from the code they gate would
ship the code ungated. This spec's own `status:` flip is always allowed without listing (see
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
 * Reads NO scheduler artifact file: not the plist, not the systemd unit, not
 * the manifest. That artifact was clean throughout the incident this exists to
 * catch. (`fs.realpathSync(os.tmpdir())` in the prefix step is a directory-name
 * resolution, not an artifact read — see AC-6.)
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

**Placement is contractual, not cosmetic:** define `assertNoLoadedSchedulerLeak`
**last in the file, immediately before the `module.exports` line**, and write the
signature exactly as shown above —
`function assertNoLoadedSchedulerLeak(tempRoot, opts = {}) {` on one line,
starting at column 0. Verification step 4b extracts the function's source as the
`awk` range from that line to `module.exports` in order to assert the no-`env`
property (Residual 6) against the new function only; the pre-existing
`assertNoRealSchedulerLeak` legitimately reads `opts.env`
(`scheduler-guard.js:283`), so a whole-file grep cannot express that property.

Behavior — the darwin arm, selected by
**`(opts.platform || process.platform) === 'darwin'`**.

> Note the parenthesisation. `(opts.platform || process.platform === 'darwin')`
> parses as `opts.platform || (process.platform === 'darwin')`, which is truthy
> for **any** non-empty `opts.platform` — including `'linux'`. Write it as shown.

1. **Decide whether an argument is temp-origin — ONE mechanism; see Table D.**
   Take `opts.prefixes` if given, else the deduped list
   `[tempRoot, os.tmpdir(), fs.realpathSync(os.tmpdir())]` (the `realpathSync`
   call wrapped in `try/catch`; on failure just omit that third entry). Strip any
   trailing separator from each. An argument `a` is **temp-origin** when
   `a === p` or `a.startsWith(p + '/')` for some prefix `p`. That is the whole
   predicate: no segment rule, no `wd-` string, no list of harness names.

   Why the whole OS temp dir and not just `tempRoot`: a record poisoned by an
   *earlier* run of these harnesses sits under a sibling directory of this run's
   root, so a `tempRoot`-only match would miss exactly the 2026-07-22 record this
   WP exists to catch (`/var/folders/…/T/wd-negative-UezlJP/…`, which is under
   the current `os.tmpdir()` on the affected machine). This is verbatim what
   ADR-0018 decision 3 requires — *"matches against the whole OS temp directory
   rather than only the current run's root"* — and the bar it sets is the bar
   this WP delivers, no more. What that bar does **not** cover is recorded as
   Residual 8; do not add a second mechanism to close it.
2. **Enumerate — from the SAME domain the records are read from.**
   `run([LAUNCHCTL_PATH, 'print', 'gui/' + uid])` where
   `uid = opts.uid ?? process.getuid()`. Dispositioned per **Table A's
   enumeration rows**: `r.error`, `r.status !== 0` (including `112`, the
   headless/no-GUI-domain case), a non-string stdout, a missing `services = {`
   opener, or an unterminated block → return **one** `UNVERIFIABLE` failure (fail
   closed) and read no records. This is what makes "zero Wienerdog labels" a
   *verified* clean rather than an unexamined one.
3. **Select labels.** Split stdout on `\n`. Find the first line whose
   **trimmed** content is **exactly** `services = {` (exact equality — the same
   output also contains a `disabled services = {` block, and `includes` would
   match it). **This rule is made falsifiable, not merely stated:** AC-2b's
   missing-opener fixture carries a `disabled services = {` decoy, and M3c
   mutates the equality to `includes`. Without the decoy an `includes`
   implementation would accept the disabled block, extract zero labels from rows
   whose last token is `enabled`/`disabled`, and return a **false clean** where
   the contract requires `UNVERIFIABLE`. Then read forward to the first line whose trimmed content is `}`. For
   each row between them, the label is the **last whitespace-separated token of
   the trimmed row** (`line.trim().split(/\s+/).pop()`) — observed live: 457
   rows, all exactly three whitespace-separated fields, zero nested braces. Keep
   only labels matching `LOADED_LABEL_PATTERN`.
   **Process every selected label** — the loop must not stop at the first match,
   the first leak, or the first failure; a clean record followed by a poisoned
   one must still report the poisoned one (AC-1b, M1b, M1c).
4. **Read each record.** `run([LAUNCHCTL_PATH, 'print', 'gui/' + uid + '/' + label])`
   with the same `uid`. Disposition per **Table A's
   per-record rows**. The single tolerated non-zero exit is **`113`** — observed
   live on macOS 26.5 as launchd's "could not find service … in domain" code and
   the same code ADR-0018:139 records from the 2026-07-07 incident — which is
   **skipped with a notice** (the label was listed a moment ago and is no longer
   loaded: a genuine race). Every other non-zero exit, including `112` (domain
   not found) and `64` (malformed target), is an `UNVERIFIABLE` failure. Do not
   restate any other cell of Table A here.
5. Return the accumulated failures, in enumeration order.

**Failure-message shape.** Every returned string starts with one of exactly two
class prefixes, and the class is decided by Table A's *Failure class* column:

- `scheduler-guard: LEAK — …` — a record was read successfully and an argument
  is temp-origin. Something is genuinely wrong on this machine.
- `scheduler-guard: UNVERIFIABLE — …` — the observer could not establish what a
  record will execute. Fail-closed, so it still fails the run, but it is **not**
  evidence of a leak.

Both fail the run identically; the split exists so a human (and verification
step 6) can tell "your machine is poisoned" from "this observer could not see"
without re-deriving it from prose.

**The contracted `LEAK` message (canonical — this is the one place its text is
decided).** It is not an illustration. AC-12 asserts
`assert.equal(msg, expectedLeakMessage(label, program))`, so every character
below is contractual and **any** change to it turns that test red. That is
correct, not brittle: this message routes a human through a destructive repair,
and a silent edit to it is exactly the stale-text failure class this WP exists to
fix. To change the wording, change it **here** first and update every mirror in
the same pass (Mirrored Surface Checklist).

The message is exactly **four lines joined by `\n`**, with no trailing newline,
`<label>` the matched label and `<program>` the offending argument, both
substituted verbatim. This construction is the normative form:

```js
[
  'scheduler-guard: LEAK — the LOADED launchd record ' + label +
    ' will execute ' + program +
    ', which is inside a temp directory. A harness run clobbered the real' +
    ' per-user label; the .plist FILE on disk is not the artifact at fault' +
    ' and may look clean. Repair, IN THIS ORDER:',
  '  1) wienerdog sync',
  '  2) only if a re-run still reports this record:',
  '     launchctl bootout gui/$(id -u)/' + label + ' ; wienerdog sync',
].join('\n')
```

Whitespace is part of the contract: two spaces before `1)` and `2)`, five before
`launchctl`, and exactly one space on each side of the `;`. Rendered with the
incident's own label and path (line 1 is a single long line; it wraps only in
your editor):

```text
scheduler-guard: LEAK — the LOADED launchd record ai.wienerdog.catchup will execute /var/folders/zz/T/wd-negative-UezlJP/core/launcher/launch.js, which is inside a temp directory. A harness run clobbered the real per-user label; the .plist FILE on disk is not the artifact at fault and may look clean. Repair, IN THIS ORDER:
  1) wienerdog sync
  2) only if a re-run still reports this record:
     launchctl bootout gui/$(id -u)/ai.wienerdog.catchup ; wienerdog sync
```

**If you factor this into a helper, define the helper ABOVE
`assertNoLoadedSchedulerLeak`.** Verification step 4b asserts the observer is the
**last** top-level `function` in the file; a `function leakMessage(…)` placed
after it turns 4b red for the wrong reason.

**The test must NOT import this template from `scheduler-guard.js`.** AC-12's
expected string comes from an `expectedLeakMessage(label, program)` helper
**written out in the test file**, built from the label and program of the record
under test. An imported template moves with the mutation, and M12, M12b, M13,
M13b and M13c would all stay green — the assertion would be a tautology.

The `UNVERIFIABLE` messages are **not** contracted verbatim; only their
`scheduler-guard: UNVERIFIABLE —` prefix is (Table A, AC-2, AC-2b). This one is
illustrative only:

```text
scheduler-guard: UNVERIFIABLE — could not enumerate the LOADED launchd records in
domain gui/501 (launchctl print exit 112). The observer cannot see this domain at all,
so it fails closed rather than reporting clean. This is NOT evidence of a leak: exit 112
is "no such domain", which is what a headless/SSH session with no gui/<uid> domain
produces. Re-run from a GUI login session.
```

**The repair advice is bootstrap-first by construction and must stay that way
(ADR-0018:283-297, signed).** `wienerdog sync` is the only command allowed to
mutate the scheduler and it heals **bootstrap-first**: it attempts `bootstrap`
and issues `bootout` only when launchd refuses — so step 1 is non-destructive
and, once `WP-scheduler-entry-identity` has merged, sufficient on its own. Two
properties of step 2 are load-bearing and neither may be "simplified":

- **`bootout` never comes first.** The signed ADR rejects bootout-first
  explicitly: it tears down a possibly-working job before it knows it can restore
  one, and a process killed in between leaves the user with **no scheduled job at
  all** — strictly worse than the start state.
- **The separator is `;` — never `&&`, and never `||`.** Both conditional
  operators strand the user, through opposite branches. With `&&`, a `bootout`
  that exits **non-zero** (already unloaded, wrong domain, anything) prevents
  `wienerdog sync` from running at all. With `||`, a `bootout` that **succeeds**
  skips the sync — the far more likely case, since the record was listed a moment
  earlier. Either way the user is left with a torn-down record and no healer.
  Only `;` makes the re-registration unconditional.

**Both properties are asserted on the RETURNED MESSAGE — and by EQUALITY, not by
properties of it (AC-12).** The whole assertion is
`assert.equal(msg, expectedLeakMessage(label, program))` against the contracted
template above, rebuilt inside the test from the label and program of the record
under test. Bootstrap-first ordering and the `;` separator are then true by
construction: no other string equals the template.

**Why equality, and why a fourth set of clauses is out of scope — the ADR-0031
loop circuit-breaker.** Three consecutive review rounds each produced a
weaker-than-intended assertion *about* this message, and each was evaded by a
message that still stranded the user:

| Round | Assertion shape | How it was evaded (all executed, not argued) |
|---|---|---|
| 2 | source grep ``bootout[^"'`]*&&`` | **passed** on `"Repair: 1) launchctl bootout gui/$(id -u)/LABEL ; 2) wienerdog sync"` — destructive-first, exactly what ADR-0018 rejects — and **failed** on a compliant file whose comment recorded this rationale, because the character class has no quote to stop at inside a comment. Also evaded by any source split (`"bootout … " + "&&" + " sync"`) |
| 3 | absence-only `msg.includes('&&') === false` | `bootout … \|\| wienerdog sync` passes it and strands the user through the opposite branch: a `bootout` that **succeeds** skips the sync |
| 4 | slice at the `Repair, IN THIS ORDER:` marker, then `indexOf` ordering + literal-sequence `includes` | (a) a repair block whose step 2 is `bootout … \|\| wienerdog sync` **followed by** a reference line carrying the contracted `;` sequence passes all four clauses, because `includes` only requires the sequence *somewhere*; (b) quoting the marker in the message **preamble** and renaming the real heading makes `indexOf` select the preamble occurrence, and all four clauses pass again |

Every one of those is an assertion about a *property* of a string whose exact
text this spec already pins. The correct assertion is therefore the string
**itself**. Equality is immune to every row above by construction — there is no
room for an extra `||` line, no marker to drain, no substring satisfiable from
elsewhere in the message, and no source formatting to evade — and it subsumes
both the ordering clause and the separator clause without stating either.
**Do not replace it with a fourth set of clauses.** If some element of the
message must legitimately vary, make that element a parameter of
`expectedLeakMessage` — as `label` and `program` already are — rather than
loosening the assertion.

The marker line `Repair, IN THIS ORDER:` remains part of the contracted text, so
it cannot drift silently; it is simply no longer load-bearing for slicing,
because nothing slices any more.

`wienerdog sync` cannot yet *replace* an already-loaded record until
`WP-scheduler-entry-identity` merges (see that WP: today's `reloadJob` has no
`bootout` path, so `bootstrap` on a live label fails). That is why step 2 exists
at all and why it is phrased as a conditional follow-up rather than as the
primary advice — the message is true both before and after the sibling merges,
and it is never destructive-first in either world.

The `$(id -u)` and the label are **display text the human pastes into their own
shell**; the guard never runs them. The label is safe to paste because it was
already matched against the fully-anchored `LOADED_LABEL_PATTERN` before it
reached the message (see the security checklist), so it cannot carry a shell
metacharacter.

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
introduced (clean / skip+notice / `LEAK` failure / `UNVERIFIABLE` failure, per
call); (iii) structured parsing of `launchctl print` output — both the domain's
`services` block and each record's `arguments` block
is introduced; (iv) error/precedence behavior — which unverifiable condition
fails closed and which single one is tolerated — is new and load-bearing.

Four canonical tables follow. **Table A** owns every call disposition and the
failure class that goes with it; **Table B** owns platform coverage; **Table C**
owns the recursion-hazard properties; **Table D** owns the temp-origin predicate
and exactly what bounds its completeness claim. A fifth canonical surface is not
a table but a string: **the contracted `LEAK` message** in "Exact contracts"
owns that message's exact text, because AC-12 now asserts it by equality. All
five are registered in the Mirrored Surface Checklist.

### Table A — per-call disposition (canonical)

Every fact about how one `launchctl` call is dispositioned is decided here — both
the single **enumeration** call and each **per-record** call. Prose elsewhere
cites this table; it must not restate a cell. The *Failure class* column decides
the returned message's prefix (`LEAK` / `UNVERIFIABLE`) verbatim.

The enumeration call is `run(['/bin/launchctl','print','gui/<uid>'])` — the
**same domain** every per-record read targets. Its failure rows are what turn a
domain this process cannot see into a red run instead of a green one.

| Stage | Condition | Disposition | Failure class | Notice emitted? | Why |
|---|---|---|---|---|---|
| enumerate | `r.error` on `run(['/bin/launchctl','print','gui/<uid>'])` | **failure**, return immediately | `UNVERIFIABLE` | no (the failure IS the signal) | the observer could not start; nothing may be reported clean behind it |
| enumerate | `r.status !== 0` on the domain print — **including `112`** | **failure**, return immediately | `UNVERIFIABLE` | no | the read domain is unreachable. `112` is the headless/SSH no-`gui/<uid>` case, observed live (Residual 7). Reporting `[]` here would be a green line over a domain that was never examined |
| enumerate | `typeof r.stdout !== 'string'` on the domain print | **failure**, return immediately | `UNVERIFIABLE` | no | same |
| enumerate | status 0, no line whose trimmed content is exactly `services = {` | **failure**, return immediately | `UNVERIFIABLE` | no | the domain answered but its service list could not be located; an unparsed list is not an empty list. **Exact trimmed equality, never `includes`** — the same output carries a `disabled services = {` block (Current state), whose rows end in `enabled`/`disabled` and would yield zero labels, i.e. a false clean. AC-2b's fixture for this row carries that decoy; M3c is the mutation |
| enumerate | status 0, `services = {` found but no closing line trimming to `}` | **failure**, return immediately | `UNVERIFIABLE` | no | truncated output; a partial list would under-enumerate silently |
| enumerate | domain print succeeded and parsed, zero labels match `LOADED_LABEL_PATTERN` | clean (`[]`) | — | no | the read domain **was** reachable and **was** enumerated, and it holds no Wienerdog registration; a real, verified clean |
| per record | `r.error` (spawn failed) | **failure** | `UNVERIFIABLE` | no | the observer could not observe; every other unverifiable branch in this module fails closed (`:303-306`, `:322-327`, `:331-334`) |
| per record | `r.status === 113` | **skip** | — | **yes** — `scheduler-guard: note — label <label> was listed but is no longer loaded (launchctl print exit 113); skipped.` | launchd's "could not find service … in domain" code, OBSERVED LIVE on macOS 26.5 during this WP's authoring and the same code ADR-0018:139 records from the 2026-07-07 incident: a genuine listed-then-unloaded race |
| per record | any other `r.status !== 0` | **failure** | `UNVERIFIABLE` | no | `launchctl print` exits non-zero for conditions that are NOT "no longer loaded" — observed live: `112` = no such domain (a headless/SSH session with no `gui/<uid>`; Residual 7), `64` = malformed target (an observer bug). A blanket skip would fail open in a module whose entire doctrine is fail-closed |
| per record | `typeof r.stdout !== 'string'` | **failure** | `UNVERIFIABLE` | no | unverifiable |
| per record | status 0, no line trimming to `arguments = {` | **failure** | `UNVERIFIABLE` | no | the record exists but its exec identity could not be read |
| per record | status 0, block opened but no line trimming to `}` | **failure** | `UNVERIFIABLE` | no | truncated output |
| per record | status 0, block parsed, some argument is temp-origin (Table D) | **failure** | `LEAK` | no | the leak |
| per record | status 0, block parsed, no argument is temp-origin | clean | — | no | verified clean |

**No disposition in this table is silent.** A skip prints; a failure is returned
to the harness, which prints it and sets `process.exitCode = 1`
(`run-scenarios.js:489-493`, `run-negative.js:518-521`). **`113` is the only
tolerated non-zero exit anywhere in the table**, which is what keeps this table
consistent with ADR-0018's *"Every unverifiable per-record condition in the
observer fails closed; the single tolerated exception … prints a notice"*. The
`LEAK`/`UNVERIFIABLE` split changes no disposition — both are failures — it only
names which of the two things a reader is looking at.

### Table B — per-platform coverage (canonical)

| Platform | What `assertNoLoadedSchedulerLeak` does | Why that is honest |
|----------|------------------------------------------|--------------------|
| `darwin` | enumerates loaded labels from the `services` block of `/bin/launchctl print gui/<uid>`, then reads each `ai.wienerdog.*` record's `arguments` block via `/bin/launchctl print gui/<uid>/<label>`, disposition per Table A | this is the only platform where a harness can clobber a per-user-global loaded record while leaving the real file untouched — the observed incident |
| `linux` | returns `[]`; emits one notice naming this row | a `systemd --user` manager's unit search path is fixed when the **manager** starts and is not moved by a *child* process's `XDG_CONFIG_HOME`, so `systemctl --user enable` can never load a unit from the harness's temp dir (it resolves nothing). The only reachable leak shape writes a unit **file** into the real `~/.config/systemd/user`, which `assertNoRealSchedulerLeak` (`scheduler-guard.js:282`) already catches. **Owner-visible residual:** if a harness ever writes into the real systemd user dir and enables from there, this arm must be implemented |
| `win32` (and any other) | returns `[]`; emits one notice naming this row | WP-161's already-accepted Windows residual: no `schtasks` PATH interceptor exists and CI has no Windows runner |

### Table C — recursion-hazard properties the darwin arm must satisfy (canonical)

It runs *inside* the harness that does the leaking, so every property below is a
requirement, not a nicety.

| Property | How | Gated by |
|---|---|---|
| the loader shim cannot intercept the observer | argv[0] is the absolute `/bin/launchctl`, never a bare name | AC-4, M2 |
| the sandboxed init env cannot reach the observer | the function takes **no `env` parameter**; the default `run` inherits the *runner's* `process.env` | Residual 6 + step 4b, M10 — **not** a unit test; the property is structurally unfalsifiable behind `opts.run` |
| the neutralizers that caused the leak cannot silence the observer | `WIENERDOG_LOADER_NOOP` and `WIENERDOG_TEST_NO_REAL_SCHEDULER` are **not read** here — they neutralize the *product's* loader, and honoring them would let the leaking configuration disable its own detector. Note `npm test` sets the second one for the whole suite (`tests/run.js:7`), so a guard that honored it would be dead under CI | AC-5, M5 |
| the clean-looking artifact cannot satisfy the observer | it reads **no scheduler artifact file** — not the plist, not the systemd unit, not the manifest. The one permitted `fs` call is `realpathSync(os.tmpdir())`, a directory-name resolution that reads no content | AC-6, M6 |
| a stale leak from an earlier run **under the current OS temp base** cannot hide | Table D's prefix set covers the whole current OS temp dir (`os.tmpdir()` **and** its realpath), not just `tempRoot`. This is exactly ADR-0018 decision 3's bar; a leak under a *different* temp base is Residual 8, named rather than guarded | AC-3, M4 |
| an unverifiable record cannot pass as clean | Table A: exactly one non-zero exit code (`113`) is tolerated, and it prints | AC-2, AC-2b, M3, M3b |
| a domain this process cannot see cannot pass as clean | Table A's enumerate rows: the observer enumerates from `print gui/<uid>` — the **same domain** it reads from — and every way that call can fail (including `112`, no such domain) returns one `UNVERIFIABLE` failure. There is no path from "unreachable domain" to `[]`. The opener is matched by exact trimmed equality so a `disabled services = {` block cannot stand in for the real one | AC-2b, M3b, M3c |
| the repair advice cannot become destructive-first or conditionally chained (`&&` **or** `\|\|`) | the returned `LEAK` string is asserted by **equality** against the contracted template ("The contracted `LEAK` message"), rebuilt in the test from the label and program under test — not by properties of it, and not by a source grep. Bootstrap-first ordering and the unconditional `;` are true by construction; three earlier property-shaped formulations were each evaded (see the loop-circuit-breaker table in "Exact contracts") | AC-12, M12, M12b, M13, M13b, M13c |

### Table D — the temp-origin predicate (canonical)

"Is this argument temp-origin?" is decided here and nowhere else. There is
**exactly one** mechanism. Do not add a second; see "The mechanism that was
subtracted" below before proposing one.

| Mechanism | Rule | Catches | Cannot catch | Completeness claim |
|---|---|---|---|---|
| **prefix (the only one)** | `a === p` or `a.startsWith(p + '/')` for some `p` in the deduped, separator-stripped `opts.prefixes ?? [tempRoot, os.tmpdir(), fs.realpathSync(os.tmpdir())]` | anything under this run's root, **and anything under the OS temp base as this process sees it** — which includes every sibling root left by an *earlier* run on the same machine, i.e. the 2026-07-22 `/var/folders/…/T/wd-negative-UezlJP/…` record | a root minted under a *different* temp base — another `TMPDIR`, a rotated per-boot `/var/folders/<hash>/T`. Named as **Residual 8**, not guarded | **complete for temp bases reachable from the current process**, and nothing wider. This is verbatim ADR-0018 decision 3's bar |

**The mechanism that was subtracted, and why you must not re-add it.** An earlier
revision of this spec OR'd in a second rule: *flag any `/`-separated segment of
the argument that starts with `wd-`*. It was removed in the round-3 pass under
ADR-0031's loop circuit-breaker, after two consecutive review rounds landed on
this same predicate. The reason it was wrong is not a fixable bug in it:

- **`wd-` is not a temp marker.** It is this project's abbreviation for itself,
  used repo-wide in non-temp positions. Verified at `6eb2d30`: a contributor
  running with `WIENERDOG_HOME=~/wd-dev` has a perfectly healthy record whose
  launcher argument is `/Users/x/wd-dev/launcher/launch.js`
  (`src/core/paths.js:55` → `core = $WIENERDOG_HOME || ~/.wienerdog`; the
  registered argv is built at `src/scheduler/generators.js:167`); a job named
  `wd-test` is valid under the name pattern at `src/scheduler/generators.js:453`
  and puts that literal string in argv; and any home under
  `/Users/wd-user` or `/Users/x/wd-projects/…` carries the segment in every path.
- **The false positive drove a destructive repair.** This spec bans suppression
  flags, and the `LEAK` message routes the human to `wienerdog sync` and then to
  `bootout ; sync`. On a false positive, `sync` re-registers the same legitimate
  path and the guard stays red forever — after tearing down a healthy record on
  the way. A false positive that cannot be silenced and whose advice is
  destructive is worse than the gap it closed.
- **The message became untrue.** The `LEAK` text says *"which is inside a temp
  directory"* — false for `/Users/x/wd-dev/launcher/launch.js`, and that sentence
  is what the human diagnoses from. With one mechanism the sentence is true again
  by construction.
- **It widened a signed contract.** ADR-0018 decision 3 requires failing when a
  record *"will execute a program **inside a temp directory**"*. A segment rule
  fails for programs that are **not** inside a temp directory. Decision 3 is a
  registered mirror of this table (see the Mirrored Surface Checklist); widening
  it needed an ADR amendment that was never made.

**Relationship to ADR-0018 — no amendment required.** With the single prefix
mechanism, this table is *exactly* decision 3's wording: it matches *"against the
whole OS temp directory rather than only the current run's root"*, and it fails
only for programs inside a temp directory. Nothing here widens, narrows, or
contradicts a signed sentence, and **no ADR edit is required by this WP**.

### Mirrored Surface Checklist

**Table A (per-call disposition)** — surfaces that mirror it:

- [ ] Deliverables row for `tests/scenarios/scheduler-guard.js`
- [ ] "Exact contracts" → the darwin arm's steps 2 and 4, and the
      `LEAK` / `UNVERIFIABLE` failure-message shapes
- [ ] Acceptance criteria AC-1, AC-1b, AC-1c, AC-2, AC-2b
- [ ] Verification step 6's LEAK-vs-UNVERIFIABLE classification
- [ ] Current-state note on `assertNoRealSchedulerLeak`'s fail-closed branches
- [ ] Current-state's observed-exit-code table (0 / 113 / 112 / 64) and the
      `services = {` block observation
- [ ] Current-state's "why the observer enumerates from the domain print"
      paragraph
- [ ] Mutation checks M1, M1b, M1c, M3, M3b, M3c, M9, M11
- [ ] **`docs/adr/0018-windows-scheduled-dreaming.md`**, 2026-07-25 amendment,
      **`:347-349`, the "Scope and honesty about platforms" paragraph** —
      *"Every unverifiable per-record condition in the observer fails closed; the
      single tolerated exception … prints a notice"*. This is the **same
      paragraph** the Table B checklist registers below; both entries resolve to
      one place on purpose, so an editor touching it sees both registrations

**Table B (per-platform coverage)** — surfaces that mirror it:

- [ ] "Exact contracts" → the non-darwin arm and the `(opts.platform || process.platform) === 'darwin'` selector
- [ ] Acceptance criterion AC-7
- [ ] Residuals 1 and 2
- [ ] Mutation check M7
- [ ] **`docs/adr/0018-windows-scheduled-dreaming.md`**, 2026-07-25 amendment,
      **`:347-349`, the final "Scope and honesty about platforms" paragraph** —
      the launchd-only implementation, the systemd search-path argument, the
      win32 residual. Same paragraph as the Table A entry above

**Table C (recursion hazards)** — surfaces that mirror it:

- [ ] Deliverables rows for the two harness call sites
- [ ] "Exact contracts" → `LAUNCHCTL_PATH`, the absent `env` parameter, the
      placement contract, step 1's temp-origin predicate
- [ ] Acceptance criteria AC-3, AC-4, AC-5, AC-6, AC-12
- [ ] Verification steps 4a / 4b — the placement-anchored call-site range check,
      and the placement + exact-signature + scoped no-`opts.env` range checks
- [ ] Current state: the module header's "No `child_process` here" sentence and
      the `opts.env` note on `scheduler-guard.js:283`
- [ ] Residual 6 (the no-`env` property is signature-review-enforced)
- [ ] Mutation checks M2, M4, M5, M6, M8, M8b, M10, M12, M12b, M13, M13b, M13c
- [ ] **`docs/adr/0018-windows-scheduled-dreaming.md`**, 2026-07-25 amendment,
      decision 3 — it restates the absolute-path, no-`env`, no-neutralizer,
      no-file and whole-temp-dir properties nearly verbatim
- [ ] **`docs/specs/logbook/2026-07-25-third-scheduler-identity-incident.md`**,
      final paragraph — same five properties plus the prefix-set rule

**Table D (temp-origin predicate)** — surfaces that mirror it:

- [ ] "Exact contracts" → the darwin arm's step 1
- [ ] Table A's two "argument is temp-origin" rows
- [ ] Table C's "a stale leak from an earlier run **under the current OS temp
      base** cannot hide" row
- [ ] The `LEAK` message's *"which is inside a temp directory"* sentence — it is
      true only while this table has exactly one, location-shaped mechanism
- [ ] Acceptance criterion AC-3
- [ ] Residual 8 (the different-temp-base blind spot)
- [ ] Out of scope: "Adding a second temp-origin mechanism" and "Adding a
      launcher-identity check"
- [ ] Mutation check M4
- [ ] **`docs/adr/0018-windows-scheduled-dreaming.md`**, 2026-07-25 amendment,
      decision 3 — *"will execute a program **inside a temp directory**"* and
      *"matches against the whole OS temp directory rather than only the current
      run's root"*. This table is now **word-for-word inside** that sentence, so
      nothing needs editing there; it is registered because **any** future
      mechanism added to this table widens decision 3's failure condition and
      therefore requires an ADR-0018 amendment first, in a separate pass. That is
      precisely the check the subtracted `wd-` mechanism skipped.

**The contracted `LEAK` message** (canonical text, in "Exact contracts") —
surfaces that mirror it:

- [ ] "Exact contracts" → the `scheduler-guard: LEAK — …` bullet in the
      failure-message shape list (prefix only) and the darwin arm's step 4
- [ ] The bootstrap-first repair-advice rationale immediately below the template
      (the `;`-not-`&&`-not-`||` argument) — it explains the template's last
      line; it must not restate it as a separate contract
- [ ] Table A's single `LEAK` failure-class row — the per-record
      "some argument is temp-origin" row. It is the only row in the table whose
      *Failure class* cell is `LEAK`; every other failure row is `UNVERIFIABLE`
      (Table D's checklist above registers **two** rows because both the
      temp-origin and the not-temp-origin rows mirror that predicate — only the
      first of them mirrors this message)
- [ ] Table C's "the repair advice cannot become destructive-first or
      conditionally chained" row
- [ ] Table D's *"which is inside a temp directory"* bullet — that sentence lives
      **inside** this template, so the two registrations resolve to one place on
      purpose (same pattern as ADR-0018:347-349 above): an editor touching the
      wording sees both
- [ ] Acceptance criteria AC-1 (prefix + both names), AC-11 (the returned element
      equals this template) and AC-12 (equality — the deciding assertion)
- [ ] Verification step 6's `startsWith("scheduler-guard: LEAK — ")` filter
- [ ] Mutation checks M11 (the prefix), M12, M12b, M13, M13b, M13c (the text)
- [ ] **`docs/adr/0018-windows-scheduled-dreaming.md`:283-297** — the signed
      bootstrap-first heal that the template's two repair steps encode. Changing
      the repair steps' order or separator contradicts that ADR and needs an
      amendment first, in a separate pass

Neither the ADR nor the logbook is in this WP's Deliverables and **neither may be
edited from this branch**; they are registered so a future change to Table A, B,
C, D or the contracted `LEAK` message is known to require a separate pass over
them.

**ADR-0018 scope determination, round 3 — re-done from the ADR text, not
inherited.** Every change in this pass was checked sentence by sentence against
decision 3 (`docs/adr/0018-windows-scheduled-dreaming.md:299-321`) **and** the
amendment's final "Scope and honesty about platforms" paragraph (`:347-349`),
which is where the fail-closed / one-tolerated-exception rule actually lives:

- **The temp-origin predicate** now matches decision 3's *"inside a temp
  directory"* / *"whole OS temp directory rather than only the current run's
  root"* exactly. Removing the `wd-` mechanism moved the spec **back inside** the
  signed contract; nothing widened.
- **Enumerating from `print gui/<uid>` instead of `launchctl list`** is invisible
  to decision 3, which says the observer *"must additionally enumerate the
  **loaded** per-user registrations"* and names no command. Reading the loaded
  per-user domain directly is if anything a more literal reading.
- **The new enumerate-level fail-closed rows** strengthen the amendment's *"Every
  unverifiable per-record condition in the observer fails closed"* rule
  (`:347-349`, the "Scope and honesty about platforms" paragraph) in the same
  direction (a fail-closed condition is added, none is removed or tolerated).
- **The exit-code facts, the `LEAK`/`UNVERIFIABLE` split and the repair-advice
  assertions** are invisible: ADR-0018:347-349 names no exit code and no repair
  command, and `2026-07-25-third-scheduler-identity-incident.md` names neither.

**Conclusion: this WP stays inside ADR-0018 decision 3 and no amendment is
required.** No external mirror needs editing. The alternative design considered
this round — a launcher-**identity** check — does **not** stay inside it; see
"Considered and rejected" in the implementation notes.

## Implementation notes & constraints

- **No new npm deps, plain Node ≥ 18, JSDoc not TypeScript.** The module gains
  exactly one new core import: `node:child_process`.
- **Update the module header — BOTH stale sentences.** A stale comment that
  contradicts the code is the same failure class this WP exists to fix, so this
  is not housekeeping.
  1. Lines 13-17 say the module *"adds **two** fail-closed tripwires"* and then
     enumerate them. Make it **three** and add the third to the enumeration:
     `assertNoLoadedSchedulerLeak`, the loaded-record observer.
  2. Lines 19-21 claim *"No `child_process` here"*. Replace that sentence with
     the new fact **and its reason**: the loaded-record observer must ask the OS
     itself, and it does so read-only through an injectable seam.
  Verification step 5 asserts both, by inverted grep.
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
- **Never run the unit tests with a bare `node --test`.** `WIENERDOG_TEST_NO_REAL_SCHEDULER`
  is set only by `tests/run.js:7`; a bare `node --test` leaves it undefined,
  which (i) makes AC-5's "both vars present" assertion unsatisfiable and silently
  drains M5 of discrimination, and (ii) disarms the suite-wide real-scheduler
  backstop that ADR-0018:172-180 declares binding — *"every scheduler mutation
  goes through `schedulerSpawn`; every scheduler test uses a seam AND is
  backstopped by the suite guard"* — in the one WP whose subject is checks that
  read the wrong thing. Every command in this spec that runs tests runs them as
  `node tests/run.js …` (which forwards argv to `node --test`) or as `npm test`.
  AC-5 additionally sets both vars itself, with restore in a `finally`, so it is
  correct under either runner rather than relying on this note.
- **Every verification step states what it proves and records the input that
  makes it red.** This is a standing rule for this WP, adopted in the round-3
  pass after an audit found the defect distribution to be exact: every step that
  carried a recorded red probe or a mutation partner was sound, and every step
  without one was defective. A step you cannot make red is not evidence — either
  give it a mutation partner or narrow its stated claim to what it actually
  covers. Steps that were only ever restating a property a unit test already
  gates were **deleted** in that pass rather than repaired.
- **Ambiguity → choose the simpler option** and record it under "Decisions
  made" in the PR body. Do NOT expand scope to resolve ambiguity.

### Considered and rejected this round: a launcher-identity check

The obvious replacement for the subtracted `wd-` mechanism is an **identity**
check — the harness knows the launcher argument must be `<core>/launcher/launch.js`
with `core = $WIENERDOG_HOME || ~/.wienerdog`, so flag when
`args[1] !== expectedLauncher`. It is strictly stronger than any location
heuristic. It is **not** in this WP, for four reasons, in descending weight:

1. **The sibling WP already implements exactly this check, in the product, as a
   single source of truth.** `WP-scheduler-entry-identity` adds
   `generators.launcherPath(paths)` — *"THE single source — `src/cli/schedule.js`'s
   `launcherPathFor` now delegates here so the two can never drift"* — and
   `loadedEntryTargets`, whose launchd row is literally `args[1] === expectLauncher`
   on the same `arguments = {` block. This WP may **not** import any `src/`
   module (scenario infrastructure must not import the product code it guards),
   so adopting identity here means **hand-copying** that derivation into
   `tests/scenarios/`: a second, un-delegatable copy of the exact contract the
   sibling WP exists to centralise.
2. **It would widen a signed contract.** Identity fails for programs that are not
   inside a temp directory (a record registered under a different
   `WIENERDOG_HOME` than the runner's), which is the same drift that condemned
   the `wd-` mechanism. It requires an ADR-0018 decision-3 amendment first, and
   ADR-0018 is not in this WP's Deliverables.
3. **It carries its own false-positive surface with an unclear repair** — the
   foreign-`WIENERDOG_HOME` case, where `wienerdog sync` would re-point the
   contributor's real install. That is the *shape* of the defect being removed,
   not an escape from it.
4. **It buys nothing for the motivating incident.** The 2026-07-22 record
   `/var/folders/…/T/wd-negative-UezlJP/core/launcher/launch.js` is under the
   current `os.tmpdir()` on the affected machine and is caught by the prefix rule
   alone. Identity's marginal coverage is Residual 8's hypothetical alternate
   temp base, plus non-temp foreign launchers, which are out of this WP's scope.

**Routed to the owner, not dropped:** if the harness observer should also verify
launcher identity, that is a follow-on WP gated on `WP-scheduler-entry-identity`
merging — at which point the question of whether scenario infra may import
`generators.launcherPath` (or must be given a checked-in constant) can be decided
once, with an ADR-0018 amendment, instead of guessed here. Owner: architect.

### Residuals (state them; do not paper over them)

1. **linux is a structural no-op, not an implementation.** Table B row 2. The
   argument is that a child process cannot move a running `systemd --user`
   manager's unit search path, so the temp-core leak shape is unreachable; the
   reachable shape (a unit file written into the real user dir) is already caught
   by `assertNoRealSchedulerLeak`. The notice prints on every run so the gap
   cannot rot silently. Owner: architect.
2. **win32 is uncovered** — WP-161's pre-existing, already-accepted residual (no
   `schtasks` PATH interceptor, no Windows CI runner). Also printed every run.
3. **The observer sees only `ai.wienerdog.*` labels, and only labels its row
   parser can extract.** A harness that registered under a label outside that
   namespace would be invisible. Accepted: the product only ever mints labels in
   that namespace (`generators.launchdLabel`), and the pattern is deliberately
   looser than the product's own charset so a *foreign-shaped* Wienerdog label is
   still seen. Second, narrower part: the `services` row parser takes the **last
   whitespace-separated token** of each row, so a label containing whitespace
   would be extracted as a fragment and then rejected by the anchored
   `LOADED_LABEL_PATTERN` — i.e. skipped. That is a pre-existing limit of the
   pattern (which admits no whitespace either way), not a new one, and it was
   checked live: all 457 rows in the real `gui/501` services block split into
   exactly three fields. Owner: architect.
4. **The tolerated-exit set is `{113}`, and `113` was observed for a
   *nonexistent* label, not for a *raced* one.** The code itself is no longer a
   guess: `/bin/launchctl print gui/501/<label-that-does-not-exist>` exits `113`
   live on macOS 26.5 (Current state), and ADR-0018:139 records the same code
   from the 2026-07-07 incident. What remains unexercised is the *race* —
   confirming that a label unloaded **between** the domain print and the record
   print yields `113`
   rather than something else — because producing it requires an unload, i.e. a
   mutation this WP forbids. Two directions, both acceptable: if a real race
   returns some other code, the result is a **false `UNVERIFIABLE` failure**
   (loud); if some other condition returns `113`, the result is a **skip that
   prints a notice** (visible). Neither is silent. If a future macOS moves the
   code, widen the set to `{113, <observed>}` and record the observation the way
   Current state does — never widen it to "any non-zero", which is the fail-open
   Table A exists to forbid. Owner: architect.
5. **AC-8's call-site check is structural, and the two harnesses are
   unrequirable in *different* ways.** `run-scenarios.js` calls `main()` at
   require time with no `require.main` guard (`:500`), so requiring it executes
   the harness entrypoint. `run-negative.js` **is** require-safe (`:530`,
   `:532`) but exports only `undeclaredMcpFailures` — it exposes no seam over
   `main`'s `finally`, and driving `main` for real needs
   `WIENERDOG_RUN_SCENARIOS=1`, real model quota and a real `claude` login.
   Either way there is no affordable executable regression for "the harness
   actually calls the guard **from inside its `finally`**". Verification step 4a
   substitutes a placement-aware check: an `awk` range over each file's
   `finally` body (the two-space-indented `} finally {` line through the next
   two-space-indented `}` line) grepped for the exact,
   comment-rejecting call line, so a call placed before the block or commented
   out fails. Gated by mutations M8 and M8b. Stated plainly rather than dressed
   up as behavioral coverage. Owner: architect.
6. **"Takes no `env` parameter" is enforced by signature review, not by a test.**
   The property is structurally unfalsifiable from a unit test: every test
   injects `opts.run`, so an implementation that *did* read `opts.env` would
   change nothing observable — which is why Table C's row for it has no mutation
   partner. A test exercising the **default** `run` would spawn a real
   `launchctl`, which this WP forbids outright. Verification step 4b therefore
   asserts, in this order: that the new function is the **last** top-level
   function in the file (without which the source range below is not exact —
   and, verified by execution, the signature grep *passes* on a misplaced
   function, so a placement bug would otherwise report itself as an `opts.env`
   bug and send the implementer after the wrong line); then the exact one-line
   signature `function assertNoLoadedSchedulerLeak(tempRoot, opts = {}) {`; then
   an inverted grep for `opts.env` **within the new function's source range
   only** (the pre-existing `assertNoRealSchedulerLeak` reads `opts.env`
   legitimately at `scheduler-guard.js:283`), gated by mutation M10. Owner:
   architect. Same honesty stance as Residual 5: a structural check named as one.
7. **A session with no `gui/<uid>` domain makes the whole run `UNVERIFIABLE`, and
   that is a red run, not a leak.** The observer both enumerates and reads in
   `gui/<uid>`; a headless or SSH session where the user has no GUI login has no
   such domain, and `launchctl print` returns `112` ("Could not find domain for
   user gui: …", observed live). Table A's enumerate rows disposition that as
   **one** fail-closed `UNVERIFIABLE` failure — one, not one per record, because
   the failure is now caught at enumeration. That is correct (the observer
   genuinely cannot see) but it means the scenario harnesses are **not runnable
   to a green result from a headless session**. The important part is what this
   replaced: an earlier revision enumerated with `launchctl list`, which reports
   the caller's **session** domain, so a headless run could find zero labels,
   never issue a single `print`, and return `[]` — a *green* line over the very
   domain that was poisoned. Reporting `UNVERIFIABLE` is the fail-closed
   counterpart of that fail-open. This WP does not add a `user/<uid>` fallback:
   choosing between the two domains without a live read of both would be exactly
   the guess this WP was re-opened to remove, and the harnesses already require
   an interactive `claude` login. Owner: architect.
8. **A leak minted under a temp base this process cannot see is invisible.**
   Table D's prefix set is built from `tempRoot`, `os.tmpdir()` and its realpath,
   so a record poisoned by a run under a *different* `TMPDIR` (`/tmp/custom-a/…`,
   or a `/var/folders/<hash>/T` that has since rotated) matches nothing and is
   reported clean. **This residual is deliberate and is the ADR's own bar**:
   ADR-0018 decision 3 scopes the property to *"the whole OS temp directory"*,
   not to every temp base that has ever existed. An earlier revision tried to
   close it with a `wd-`-segment heuristic; that mechanism was subtracted this
   round (see Table D) because closing this gap by pattern-matching the
   project's own name flagged legitimate installs and widened a signed contract.
   The next honest step is a launcher-**identity** check, which is a separate WP
   and needs an ADR-0018 amendment first (see "Considered and rejected"). Do not
   close this residual with a third heuristic. Owner: architect.

## Security checklist

- [ ] The launchd label extracted from the domain print's `services` block is
      matched against the
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
- [ ] The `LEAK` message's repair block embeds the label in a command a **human**
      pastes into their own shell. The guard never executes it. It is safe to
      paste for the same reason as above: the label already passed the fully
      anchored `LOADED_LABEL_PATTERN`, whose charset (`a-z0-9.-`) contains no
      shell metacharacter, no whitespace and no newline.

## Acceptance criteria

**Preamble — read before writing a single test.** A test that passes against
unmodified `main` is **not evidence**. Every assertion below must be red before
the corresponding change and green after; the Mutation checks table makes that
literal, including for AC-11 (mutation M14). The two exceptions are **AC-9 and
AC-10**, which are the gates themselves rather than assertions about the
observer's behavior. Two prior WPs in this area shipped verification that shared the spec's
blind spot and reported the class closed when only an instance was. For each new
assertion, state in a comment **which artifact it reads** and **why that artifact
is the authoritative one**. Here the authoritative artifact is the OS scheduler's
own record of what it will execute; the plist file on disk is not, and **no
assertion in this WP may read one**.

- [ ] **AC-1** `assertNoLoadedSchedulerLeak` returns a failure prefixed
      `scheduler-guard: LEAK —` and naming **both** the label and the offending
      argument when a loaded `ai.wienerdog.*` record's arguments block contains a
      path under the OS temp dir; and returns `[]` when **no** argument matches
      the Table D temp-origin predicate. Driven entirely by canned `opts.run`
      output. *(The message's full text is contracted elsewhere and AC-12 asserts
      it by equality — assert the prefix and the two names here and nothing more,
      so this criterion stays a mirror rather than a second contract.)*
- [ ] **AC-1b** *(not only the first label)* with a canned domain print whose
      `services` block yields **two** matching labels — `ai.wienerdog.dream`
      **first** with a clean arguments block, `ai.wienerdog.catchup` **second**
      with a temp-origin one — the result is exactly **one** failure and it names
      `ai.wienerdog.catchup`. Assert a per-record `print` call was captured for
      **both** labels. An implementation that inspects only the first matching
      label passes AC-1 and must fail this.
- [ ] **AC-1c** *(the every-label property, for real)* the same shape with
      **three** matching labels and the temp-origin one in position **three**
      (`ai.wienerdog.dream` clean, `ai.wienerdog.weekly` clean,
      `ai.wienerdog.catchup` leaking): exactly one failure, naming
      `ai.wienerdog.catchup`, and a per-record `print` captured for all three.
      AC-1b alone is satisfied by `labels.slice(0, 2)` — which is a real
      implementation shape and which skips a poisoned third label — so the
      "every label" property is only actually proved by this third one. Gated by
      M1c, whose mutation is exactly `labels.slice(0, 2)`.
- [ ] **AC-2** *(per-record rows of Table A)* exhaustively: a spawn `error` →
      failure; `status === 113` → **skip** plus exactly one captured notice and
      **zero** failures; `status === 1` → failure; `status === 112` → failure;
      non-string stdout → failure; status 0 with no `arguments = {` line →
      failure; status 0 with an unterminated block → failure. Assert the `1` and
      `112` cases **separately** from the `113` case — that `113` and only `113`
      is tolerated is the whole point of the row. Assert every one of these
      failures carries the `UNVERIFIABLE` prefix and **not** the `LEAK` prefix.
- [ ] **AC-2b** *(enumerate rows of Table A — the domain must be reachable before
      anything may be called clean)* all five enumeration failure branches on
      `['/bin/launchctl','print','gui/<uid>']` — `r.error`, `r.status !== 0`
      (assert `112` **specifically**, the headless no-GUI-domain case),
      non-string stdout, stdout with no line trimming to exactly `services = {`,
      and stdout whose `services` block is never closed by a line trimming to
      `}` — each return **exactly one** `UNVERIFIABLE` failure and make **zero
      per-record calls** (assert the captured argv list has length 1: the domain
      print and nothing else).
      **The missing-opener fixture must carry a `disabled services = {` DECOY
      block**, with rows in the shape observed live
      (`"com.google.keystone.user.xpcservice" => enabled`) and at least one
      Wienerdog-shaped one (`"ai.wienerdog.dream" => disabled`), and that test
      must be named `scheduler-leak-guard: a disabled services block is NOT
      accepted as the services block`. Without the decoy the exact-equality rule
      is unfalsifiable: an implementation using
      `line.trim().includes('services = {')` still fails a bare no-opener
      fixture, but accepts the decoy as the services block, extracts zero labels
      (every disabled row's last token is `enabled`/`disabled`, which
      `LOADED_LABEL_PATTERN` rejects) and returns a **false clean** where Table A
      requires `UNVERIFIABLE`. Gated by M3c. A gate must be able to fail.
      Plus the clean case: a domain print that succeeds
      and parses with no `ai.wienerdog.*` label returns `[]` with exactly that
      one captured call. **The `112` case is the load-bearing one** — it is the
      difference between a headless run reporting `UNVERIFIABLE` and a headless
      run printing a green "no loaded Wienerdog record executes anything under
      the OS temp dir" over a domain it never opened.
- [ ] **AC-3** *(the stale-leak property)* a record whose argument lies under a
      **different** temp root than the `tempRoot` passed in — but still under the
      current `os.tmpdir()` — is reported as a `LEAK`. Also assert the converse
      with `opts.prefixes: ['/nonexistent-root']`: an argument like
      `/Users/u/.wienerdog/launcher/launch.js` is clean, **and so is**
      `/Users/u/wd-dev/launcher/launch.js` — the second half pins the
      subtraction, so a future re-introduction of a `wd-`-segment mechanism
      (Table D) turns this test red instead of shipping silently.
- [ ] **AC-4** the observer invokes the loader by the absolute `/bin/launchctl`
      for **both** the domain print and every record print, asserted on the captured
      argv arrays (`argv[0] === '/bin/launchctl'` for every captured call). *(The
      companion "takes no `env` parameter" property is deliberately NOT asserted
      here — it is structurally unfalsifiable from a unit test; see Residual 6
      and verification step 4b.)*
- [ ] **AC-5** *(the neutralizer-immunity property)* a leaking canned record
      still produces a `LEAK` failure while **both** `WIENERDOG_LOADER_NOOP=1`
      **and** `WIENERDOG_TEST_NO_REAL_SCHEDULER=1` are set in `process.env`. The
      test must **set both itself and restore both in a `finally`** — copy the
      shape of the existing `withEnv(vals, fn)` helper at
      `tests/unit/scheduler-guard.test.js:18-33` (save, set, `try/finally`,
      restore; `undefined` means delete). Do **not** assume the runner set
      `WIENERDOG_TEST_NO_REAL_SCHEDULER`: `tests/run.js:7` sets it, a bare
      `node --test` does not, and a test that merely *asserts both are present*
      would be red under one runner and green under the other while M5 quietly
      lost all discrimination. Assert both values inside the `withEnv` body
      (they are now true by construction) and assert the failure.
- [ ] **AC-6** *(the wrong-artifact property)* the observer consults **no
      scheduler artifact file**: with `opts.run` returning a leaking record, the
      failure is produced while a spy on `fs.readFileSync` / `fs.readdirSync` /
      `fs.openSync` records **zero** calls for the duration of the guard call.
      Restore the originals in a `finally`. *(Note the deliberate scope: step 1
      calls `fs.realpathSync(os.tmpdir())`, which is a permitted metadata call —
      it resolves a directory name and reads no content — and it is outside the
      spied set on purpose. The property being asserted is "the clean-looking
      plist cannot satisfy the observer", not "the module never touches `fs`".)*
- [ ] **AC-7** on a non-darwin platform (`opts.platform: 'linux'` and
      `opts.platform: 'win32'`) the observer returns `[]`, emits exactly one
      notice per call, and makes **zero** `run` calls. Also assert that passing
      `opts.platform: 'linux'` does **not** take the darwin arm — the
      operator-precedence trap in the selector.
- [ ] **AC-8** Both harnesses call the new guard **inside** their existing
      `finally` block — not merely somewhere in the file. **Structural check**
      (see Residual 5): verification step 4a extracts each file's `finally` body
      as an `awk` range — the two-space-indented `} finally {` line through the
      next two-space-indented `}` line — and greps *that range* for the exact
      call line, so a call placed above the
      block, below the block, or commented out all fail. Gated by M8 and M8b.
- [ ] **AC-9** Every new test name is prefixed `scheduler-leak-guard:` (with a
      trailing space), and the non-vacuity gate in verification step 1 reports at
      least **37** named passing subtests — **passing: not skipped, not todo**.
      Step 1 filters `# SKIP` and `# TODO` records out and **enforces a non-root
      POSIX host**, because one of the six guarded tests also skips under
      `getuid() === 0` (see step 1's comment; as root the floor false-reds at
      36). That floor is **derived, not
      invented**: 22 pre-existing named subtests on `main` (counted by execution
      at `6eb2d30`; see Current state) **plus the 15 distinct test names the
      Mutation checks table requires to exist** — count them from the table: 22
      rows, minus the 3 that name a *verification step* rather than a test (M8,
      M8b, M10) = 19 test-naming rows, minus the 4 duplicates created by M12,
      M12b, M13, M13b and M13c all sharing one name = **15** (M1, M1b, M1c, M2,
      M3, M3b, M3c, M4, M5, M6, M7, M9, M11, M14, and the one AC-12 name).
      **Slack is
      exactly zero** — miss one name and the gate is red without telling you
      which. If you add a mutation row with a new test name, raise this floor in
      the same PR. The gate therefore proves both that your new tests run and
      that the pre-existing ones still do.
- [ ] **AC-10** `npm test` and `npm run lint` pass; the existing
      `scheduler-leak-guard` suite stays green with **no** assertion weakened or
      deleted, and `makeLoaderShimDir` / `buildInitEnv` / `assertNoLoaderInvoked`
      / `assertNoRealSchedulerLeak` are unchanged.
- [ ] **AC-11** Running the guard twice against the same canned input returns
      identical results and mutates nothing (idempotent, read-only). Use **AC-1's
      leaking canned record**, so each call returns exactly one failure and that
      failure is the contracted `LEAK` message — a clean fixture returns `[]`
      twice and would make this criterion vacuous under M14. Test name:
      `scheduler-leak-guard: two calls on the same canned input return identical
      results`. Gated by M14, whose mutation hoists the `failures` accumulator to
      module scope — a real implementation shape under which call two returns
      call one's failures a second time.
      **A bare `assert.deepEqual(first, second)` does NOT kill M14 and is
      forbidden here.** Under M14 both calls return the **same array object**, so
      call two mutates the object already held as `first`; `first` *is* `second`
      and the comparison passes. Reproduced by execution during this pass:
      `first === second` → `true`, both lengths `2`, assertion green. The captured
      argv sequences are identical too, so that assertion does not save it either.
      Assert all four of the following, in this order:
      1. Call one into `first`, with its **own** capture array `callsA`; then,
         **before call two**, take `const firstSnapshot = structuredClone(first)`
         and `const firstCalls = structuredClone(callsA)` (`structuredClone` is a
         global on Node ≥ 18).
      2. `assert.equal(firstSnapshot.length, 1)` and
         `assert.equal(firstSnapshot[0], expectedLeakMessage(label, program))` —
         explicit cardinality and content, not just "the two agree".
      3. Call two into `second`, with a **fresh** capture array `callsB`, then
         `assert.notStrictEqual(first, second, 'each call must return a FRESH array')`,
         `assert.equal(second.length, 1)` and
         `assert.deepEqual(second, firstSnapshot)`.
      4. `assert.deepEqual(callsB, firstCalls)` — same argv sequence, compared
         against a snapshot, from two arrays that cannot alias because each call
         got its own.
      Verified by execution: under M14 the three assertions in step 3 each turn
      red **independently** (`first === second`; `second.length` is `2`; the
      snapshot comparison is `[x]` vs `[x, x]`), and all four steps are green
      against a correct implementation.
- [ ] **AC-12** *(the repair advice, asserted by EQUALITY on the message)* take
      the `LEAK` string produced in AC-1, for a canned record with label `label`
      and offending argument `program`, and assert exactly one thing —
      `assert.equal(msg, expectedLeakMessage(label, program));` —
      where `expectedLeakMessage` is a helper **written out in the test file**
      (never imported from `scheduler-guard.js` — an imported template moves with
      the mutation and every gate below stays green) reproducing the contracted
      template in "Exact contracts" character for character, with `label` and
      `program` taken from the record under test rather than hardcoded.
      **That is the whole criterion.** Do not add positional clauses,
      `indexOf` ordering checks, `includes` substring checks or an
      absence-of-`&&` check alongside it: three earlier rounds shipped exactly
      those shapes and each was evaded (see the loop-circuit-breaker table in
      "Exact contracts"). Equality subsumes all of them, and it makes **any**
      change to a contractual message red — which is the intent, because a silent
      edit to a message that routes a human through a destructive repair is the
      stale-text failure class this WP exists to fix.
      Gated by M12, M12b, M13, M13b and M13c, all of which mutate the message
      itself; all five share this one test. Verified by execution during this
      pass: green on the contracted message, red on each of the five mutants and
      on round 2's destructive-first-with-`;` string.

### Mutation checks (one-line source mutation → the test that must turn red)

Apply each mutation on top of your finished branch, run the check named in the
last column, confirm it **fails**, then revert. Paste the resulting table into
the PR.

**The command, stated once.** Every row whose "Must turn red" cell is a *test
name* is run as:

```bash
node tests/run.js --test-name-pattern "<the test name from the last column>" \
  tests/unit/scheduler-leak-guard.test.js
```

(`node tests/run.js`, never a bare `node --test` — see the implementation note.
`npm test -- --test-name-pattern "<name>"` is equivalent and also acceptable.)
Rows whose cell names a **verification step** are run by executing that step.

**`--test-name-pattern` is a REGEX, not a literal — escape the metacharacters.**
Pasting a test name verbatim is wrong whenever the name contains `(`, `)`, `[`,
`]`, `{`, `}`, `.`, `*`, `+`, `?`, `|`, `^` or `$`. A pattern that matches
nothing **exits 0** (the file wrapper counts as "pass 1", the same vacuity
verification step 1 gates against), so an unescaped paste makes a *survived*
mutation indistinguishable from correct code — the mutation check silently
proves nothing. **Exactly one row below is affected: M2**, whose test name ends
in `(domain print and record print)`. Run it as:

```bash
node tests/run.js --test-name-pattern \
  "scheduler-leak-guard: loaded-record observer invokes the loader by ABSOLUTE path \(domain print and record print\)" \
  tests/unit/scheduler-leak-guard.test.js
```

Executed on this runner (Node 25.9.0) against the finished branch's
`tests/unit/scheduler-leak-guard.test.js`: the **unescaped** verbatim name
selects **0** named subtests and exits 0 (TAP prints only
`ok 1 - tests/unit/scheduler-leak-guard.test.js`, naming the FILE); the escaped
form above selects **exactly 1**, and TAP names the TEST. The parenthesis-free
prefix `"invokes the loader by ABSOLUTE path"` also selects exactly that one
test and is an acceptable substitute. **Do not rename the test to avoid the
escaping** — the name is contractual (AC-9's floor counts it; Table C's
loader-shim row cites it via AC-4/M2).

**How to tell a real selection from a vacuous one.** The `✔` / `ok` line must
name the **test**, not the file. If the only record you get back is
`ok 1 - tests/unit/scheduler-leak-guard.test.js`, your pattern matched nothing
and the row is unproven.

| # | Mutation | Must turn red |
|---|----------|---------------|
| M1 | `assertNoLoadedSchedulerLeak`: return `[]` when an argument matches a temp prefix | test `scheduler-leak-guard: loaded-record observer FAILS on a record whose loaded argv is under the OS temp dir` |
| M1b | process only the **first** selected label (`labels.slice(0, 1)`) | test `scheduler-leak-guard: loaded-record observer does not stop at the FIRST selected label` |
| M1c | process only the first **two** selected labels (`labels.slice(0, 2)`) | test `scheduler-leak-guard: loaded-record observer inspects EVERY selected label, including the last`. M1b's test passes under this mutation — that is why both rows exist |
| M2 | change `LAUNCHCTL_PATH` to the bare `'launchctl'` | test `scheduler-leak-guard: loaded-record observer invokes the loader by ABSOLUTE path (domain print and record print)`. **The parentheses in this name are regex metacharacters — escape them (or use the parenthesis-free prefix) exactly as spelled out above the table; an unescaped verbatim paste selects zero tests and exits 0** |
| M3 | treat **any** non-zero `print` exit as a skip (the fail-open the spec removes) | test `scheduler-leak-guard: a print exit of 1 or 112 is a FAILURE, not a skip` |
| M3b | return `[]` when the domain print exits non-zero (e.g. `112`) instead of failing closed | test `scheduler-leak-guard: loaded-record observer fails closed when the domain cannot be enumerated` |
| M3c | match the services-block opener with `line.trim().includes('services = {')` instead of exact trimmed equality | test `scheduler-leak-guard: a disabled services block is NOT accepted as the services block`. A bare no-opener fixture stays green under this mutation — only the `disabled services = {` decoy (AC-2b) turns it red, because `includes` then parses the disabled block, extracts zero labels and returns a false clean |
| M4 | build prefixes from `tempRoot` only | test `scheduler-leak-guard: loaded-record observer catches a STALE leak from another run's temp root` |
| M5 | early-return `[]` when `process.env.WIENERDOG_TEST_NO_REAL_SCHEDULER` is set | test `scheduler-leak-guard: the product's neutralizer env vars do NOT silence the observer` |
| M6 | read the plist at `~/Library/LaunchAgents/<label>.plist` and skip the label when its content has no temp path | test `scheduler-leak-guard: the loaded-record observer reads NO scheduler artifact file` |
| M7 | write the selector as `(opts.platform \|\| process.platform === 'darwin')` | test `scheduler-leak-guard: opts.platform 'linux' does not take the darwin arm` |
| M8 | comment out the call in `tests/scenarios/negative/run-negative.js` | **verification step 4a**'s per-file `finally`-range grep exits 1 |
| M8b | **move** the call in `tests/scenarios/run-scenarios.js` one line **above** the `} finally {` (still present in the file, just outside the block) | **verification step 4a**'s per-file `finally`-range grep exits 1. This is the mutation a whole-file grep cannot catch, and it is why the check is range-scoped |
| M9 | drop the exit-113 notice (skip silently) | test `scheduler-leak-guard: a listed-then-unloaded label is skipped WITH a notice` |
| M10 | add `const env = opts.env \|\| process.env;` inside `assertNoLoadedSchedulerLeak` | **verification step 4b**'s scoped no-`opts.env` range check exits 1 |
| M11 | change the `LEAK` prefix on the temp-origin failure to `UNVERIFIABLE` | test `scheduler-leak-guard: a temp-origin argument is classed LEAK, an unreadable record UNVERIFIABLE` |
| M12 | swap the two repair steps in the `LEAK` message so `bootout` is named first | test `scheduler-leak-guard: the LEAK message equals its contracted text exactly` |
| M12b | leave the repair block correct but quote the marker `Repair, IN THIS ORDER:` in the message **preamble** and rename the real repair heading | the **same** test as M12. This is round 5's W2: it defeated the round-4 marker-slicing clauses (`indexOf` selected the *preamble* occurrence and all four clauses passed) and cannot defeat equality |
| M13 | change the repair separator from `;` to `&&` in the `LEAK` message | the **same** test as M12 |
| M13b | change the repair separator from `;` to `\|\|` in the `LEAK` message | the **same** test as M12. A `bootout` that SUCCEEDS then skips the sync and strands the user — the `&&` failure reached through the opposite branch |
| M13c | change the separator to `\|\|` **and** append a reference line carrying the contracted `bootout gui/$(id -u)/<label> ; wienerdog sync` sequence | the **same** test as M12. This is round 5's W1: it defeated the round-4 literal-sequence `includes` clause (which only required the sequence to appear *somewhere*) and cannot defeat equality |
| M14 | hoist the `failures` accumulator out of `assertNoLoadedSchedulerLeak` into module scope, so it persists across calls | test `scheduler-leak-guard: two calls on the same canned input return identical results` (AC-11) — but **only in AC-11's snapshot form**. A bare `deepEqual(first, second)` stays GREEN under this mutation because both calls return the same array object, so `first` *is* `second`; reproduced by execution. This is why AC-11 mandates the snapshot, the explicit cardinality and `notStrictEqual` |

## Verification steps (run these; paste output in the PR)

**Standing rule for every step below (see the implementation note).** Each step
says in its comment **exactly what it proves** and **what input makes it red**,
and no step claims more than it covers. Steps whose only content was restating a
property a unit test already gates were deleted rather than repaired: the round-3
audit found four such steps and every one of them was defective (a vacuous seed
re-derivation, two source greps duplicating M2/M3/M11, and a repair-advice grep
that passed the violation and failed the compliance). **Do not re-add a source
grep for a property the guard's own output can be asserted on** — assert the
output.

```bash
# 1. The guard suite, with a MACHINE-CHECKED non-vacuity gate. A bare
#    `--test-name-pattern` that matches nothing exits 0 with "pass 1", because
#    the FILE wrapper counts as a passing test — executed on this runner at
#    efd1489 against tests/unit/scheduler-status.test.js with the pattern
#    "zzz-definitely-nonexistent-pattern-42": exit 0, "ℹ pass 1". So count NAMED
#    subtest records in the TAP stream instead.
#
#    RUN IT THROUGH `node tests/run.js`, NOT a bare `node --test`. tests/run.js:7
#    is the only place WIENERDOG_TEST_NO_REAL_SCHEDULER=1 is set; a bare
#    `node --test` leaves it undefined, which disarms the suite-wide
#    real-scheduler backstop ADR-0018:172-180 declares binding and drains M5 of
#    discrimination. tests/run.js forwards argv to `node --test` unchanged, so
#    the reporter and pattern flags work identically.
#
#    Executed evidence that this gate discriminates — this exact command, this
#    runner, at 6eb2d30, against THIS file on `main`:
#      pattern "scheduler-leak-guard" → 22 named subtests
#      pattern "zzz-nope"             → 0 named subtests
#
#    NON-PASS TAP RECORDS MUST NOT COUNT. node:test renders BOTH a skipped and
#    an unexecuted-todo subtest as an `ok` line that `^ok [0-9]+ - ` matches:
#    `ok N - <name> # SKIP` and `ok N - <name> # TODO`. Either one would satisfy
#    a count floor with a test that never ran — the exact vacuity this gate
#    exists to prevent, reintroduced through the back door. Converting a required
#    test to `test.todo(...)` must LOWER the count, not preserve it. Executed on
#    this runner (Node 25.9.0) against a three-test probe:
#      ok 1 - <name> # TODO      ← dropped by the filter
#      ok 2 - <name> # SKIP      ← dropped by the filter
#      ok 3 - <name>             ← counted
#      # pass 1 / # skipped 1 / # todo 1   (exit 0 — the run itself is GREEN)
#    Hence `grep -vE "# (SKIP|TODO)"` below, not a bare `grep -v "# SKIP"`.
#
#    PREREQUISITE — run this gate as a NON-ROOT POSIX user; it is ENFORCED on
#    the line below, not merely documented. Two things skip on this file:
#      - 5 tests guarded `{ skip: process.platform === 'win32' }`
#      - 1 test (`assertNoLoaderInvoked — an UNWRITABLE log at assert time`,
#        tests/unit/scheduler-leak-guard.test.js:177-181) guarded
#        `win32 || (typeof process.getuid === 'function' && process.getuid() === 0)`
#        — it needs POSIX permission enforcement, which root does not experience.
#    So the floor of 37 has ZERO slack on a non-root POSIX host, is 36 as root
#    (a FALSE red), and 31 on win32. Rather than make the arithmetic UID-aware —
#    which would mean carrying a second floor and still having to prove all 37
#    names exist — the gate DECLARES the host it is valid on and refuses to run
#    anywhere else. That is the simpler of the two options and it cannot report a
#    misleading green. On win32 the gate is RED and that is correct: the darwin
#    arm this WP adds is unverified there (Table B's win32 row; CI has no Windows
#    runner). Containerized runners commonly default to root — if this fires,
#    re-run as an ordinary user; do NOT lower the floor.
[ "$(id -u)" -ne 0 ] || { echo "PREREQUISITE UNMET: run this gate as a NON-ROOT POSIX user (as root the unwritable-log test skips and the floor of 37 false-reds at 36)"; exit 1; }
n=$(node tests/run.js --test-reporter=tap --test-name-pattern "scheduler-leak-guard" \
      tests/unit/scheduler-leak-guard.test.js \
      | grep -E "^ok [0-9]+ - scheduler-leak-guard: " | grep -vE "# (SKIP|TODO)" \
      | wc -l | tr -d ' ')
#    PROVES: your new tests actually run AND the pre-existing ones still do.
#    RED WHEN: any required test name is missing or failing (floor not met), or
#    the pattern matches nothing (0). The floor is 22 (pre-existing, counted
#    above) + 15 (the distinct test names the Mutation checks table requires:
#    22 rows - 3 that name a verification step - 4 duplicates from the five
#    AC-12 rows sharing one name) = 37, with ZERO slack. Re-derived in the
#    round-5 pass and unchanged. See AC-9; raise it if you add a mutation row
#    with a NEW test name.
echo "named passing subtests: $n"
[ "$n" -ge 37 ] || { echo "VACUOUS OR INCOMPLETE — the pattern selected $n named subtests"; exit 1; }

# 2. No regression anywhere, including the golden files.
#    PROVES: nothing outside this WP's four files broke — the whole unit suite
#    and the golden-file checks still pass with the new observer and the two new
#    call sites in the tree.
#    RED WHEN: any existing test or golden fixture fails; e.g. weakening or
#    deleting an existing scheduler-leak-guard assertion (AC-10), or changing
#    behavior of makeLoaderShimDir / buildInitEnv / assertNoLoaderInvoked /
#    assertNoRealSchedulerLeak.
npm test

# 3. Lint pipeline (markdownlint + shellcheck + shfmt + frontmatter schema).
#    PROVES: the four touched files satisfy the repo's lint contract.
#    RED WHEN: any of them violates it — e.g. an unused variable or a style
#    violation in scheduler-guard.js, or a malformed frontmatter block in this
#    spec when its status: is flipped.
npm run lint

# 4. PROVES: scenario infra has not acquired a product import (the new logic must
#    read the OS independently of the code it guards).
#    RED WHEN: any `require('../..*/src/…')` appears in the file — verified by
#    execution during this pass by appending
#    `const gen = require('../../src/scheduler/generators');` to a scratch copy:
#    the grep matched and the branch fired. Clean on `main`.
#    Plain `grep -n` only — never `grep -c`, which exits 1 on a zero count and
#    has silently "passed" in this repo before.
if grep -nE "require\(['\"](\.\./)+src/" tests/scenarios/scheduler-guard.js; then
  echo "FAIL: scheduler-guard.js imports a src/ module"; exit 1
else
  echo "OK: scheduler-guard.js imports no src/ module"
fi

# 4a. The CALL SITES, checked for PLACEMENT, not merely for presence (AC-8).
#     PROVES: each harness calls the new guard from INSIDE its finally body.
#     RED WHEN: the call is missing, commented out, or sits outside the block
#     (mutations M8 and M8b).
#     A whole-file grep passes on a call sitting above `try {` — it would never
#     run on a throwing path, which is the entire reason the call belongs in the
#     `finally`. So extract each file's finally BODY as an awk range — from the
#     line that is exactly `  } finally {` to the next line that is exactly
#     `  }` — and grep only that. Verified by execution at 6eb2d30 and again in
#     the round-3 pass that the range is exact for both files (run-scenarios.js
#     469→487, whose inner try/catch closes at FOUR spaces and so cannot end the
#     range early; run-negative.js 506→515, the existing
#     assertNoRealSchedulerLeak call landing inside both ranges) and that moving
#     that call one line above the `} finally {` makes the grep exit 1
#     (mutation M8b's shape).
for f in tests/scenarios/run-scenarios.js tests/scenarios/negative/run-negative.js; do
  awk '/^  \} finally \{$/{inb=1} inb{print} inb && /^  \}$/{exit}' "$f" \
    | grep -nE "^[[:space:]]*if \(root\) failures\.push\(\.\.\.scg\.assertNoLoadedSchedulerLeak\(root\)\);" \
    || { echo "FAIL: the guard call is missing, commented out, or OUTSIDE the finally block in $f"; exit 1; }
done

# 4b. PROVES three things, in order, each with its OWN failure message so a red
#     run names the right line:
#       (i)  PLACEMENT — assertNoLoadedSchedulerLeak is the LAST top-level
#            function in the file (the Deliverables contract). This is asserted
#            FIRST because (iii)'s awk range is only exact while it holds; a
#            misplaced function would otherwise fail with (iii)'s message and
#            send you after the wrong line.
#       (ii) SIGNATURE — the contracted one-line form, no `env` parameter.
#       (iii) Residual 6's no-`opts.env` property, scoped to the new function's
#            source range. The pre-existing assertNoRealSchedulerLeak reads
#            opts.env legitimately at scheduler-guard.js:283, so a whole-file
#            grep cannot express this.
#     RED WHEN: (i) the function is defined anywhere but last — on `main` the
#     last top-level function is `assertNoRealSchedulerLeak`, so (i) is red
#     before this WP, verified by execution; (ii) the signature is reformatted or
#     gains a parameter; (iii) mutation M10 — verified by execution on a scratch
#     copy: injecting `const env = opts.env || process.env;` into the new
#     function made the range grep match, and removing it made it silent.
#     No temp FILE: the awk output is piped, so there is no fixed /tmp path.
last_fn=$(grep -oE "^function [A-Za-z0-9_]+" tests/scenarios/scheduler-guard.js | tail -1)
echo "last top-level function: $last_fn"
[ "$last_fn" = "function assertNoLoadedSchedulerLeak" ] \
  || { echo "FAIL: assertNoLoadedSchedulerLeak is not the LAST top-level function (Deliverables placement contract) — it is currently '$last_fn'"; exit 1; }
grep -nE "^function assertNoLoadedSchedulerLeak\(tempRoot, opts = \{\}\) \{$" tests/scenarios/scheduler-guard.js \
  || { echo "FAIL: the signature is not the contracted one-line form"; exit 1; }
if awk '/^function assertNoLoadedSchedulerLeak\(/{inf=1} inf{print} /^module\.exports/{if(inf) exit}' \
     tests/scenarios/scheduler-guard.js | grep -nE "opts\.env"; then
  echo "FAIL: assertNoLoadedSchedulerLeak reads opts.env — it must take no env (Table C row 2)"; exit 1
else
  echo "OK: assertNoLoadedSchedulerLeak is defined last and never reads opts.env"
fi

# 5. PROVES: BOTH stale module-header claims are gone (they contradict the code
#    after this WP, which is the same failure class this WP exists to fix).
#    RED WHEN: either old sentence survives. Executed against `main` at 6eb2d30
#    they match line 19 and line 13 respectively — i.e. both discriminate.
if grep -n "No \`child_process\` here" tests/scenarios/scheduler-guard.js; then
  echo "FAIL: the module header still claims there is no child_process here"; exit 1
else
  echo "OK: the module header records the new child_process fact"
fi
if grep -n "adds two fail-closed tripwires" tests/scenarios/scheduler-guard.js; then
  echo "FAIL: the module header still says TWO tripwires; there are now three"; exit 1
else
  echo "OK: the module header's tripwire count is current"
fi
grep -n "assertNoLoadedSchedulerLeak" tests/scenarios/scheduler-guard.js | head -1 \
  || { echo "FAIL: the new observer is not even present"; exit 1; }

# 6. Real-machine sanity — macOS only, READ-ONLY, no mutation, no product code.
#    PROVES: on THIS machine, in THIS session, no loaded Wienerdog record
#    executes anything under the OS temp dir — and it proves it only when the
#    read domain was actually reachable, because Table A's enumerate rows turn an
#    unreachable gui/<uid> into an UNVERIFIABLE failure rather than an empty
#    array. That is the whole reason the green line below can be pasted into a PR
#    as evidence; before the round-3 pass it could be printed from a headless
#    session that had never opened the poisoned domain.
#    RED WHEN: any record is temp-origin (LEAK), or the domain/record could not
#    be read (UNVERIFIABLE). It ASSERTS (does not merely print) and CLASSIFIES:
#    a non-empty return is NOT automatically a leak. Paste whichever block
#    prints.
node -e '
const assert = require("node:assert");
const os = require("node:os");
const scg = require("./tests/scenarios/scheduler-guard");
const out = scg.assertNoLoadedSchedulerLeak(os.tmpdir() + "/wd-nonexistent-probe");
assert.ok(Array.isArray(out), "returns an array");
const leaks = out.filter((f) => f.startsWith("scheduler-guard: LEAK — "));
const unver = out.filter((f) => f.startsWith("scheduler-guard: UNVERIFIABLE — "));
assert.equal(leaks.length + unver.length, out.length, "every failure carries a Table A class prefix");
if (leaks.length) {
  console.log("REAL LEAK ON THIS MACHINE — stop and repair before merging:");
  for (const f of leaks) console.log("  - " + f);
}
if (unver.length) {
  console.log("UNVERIFIABLE — the observer could not see. NOT a leak.");
  console.log("Most likely cause: no gui/<uid> domain (headless/SSH session; see Residual 7).");
  console.log("Re-run from a GUI login session before drawing any conclusion.");
  for (const f of unver) console.log("  - " + f);
}
if (out.length) process.exit(1);
console.log("OK: the gui/<uid> domain was enumerated and no loaded Wienerdog record");
console.log("    executes anything under the OS temp dir");
'
```

**Do NOT run the scenario harnesses** (`npm run scenarios`,
`npm run scenarios:negative`, `WIENERDOG_RUN_SCENARIOS`) for this WP: they
consume quota and need a real `claude` login. AC-8 is covered by verification
step 4a, and the guard's own behavior by its unit tests — which exercise the
exact function the harnesses call.

**Never run the unit tests with a bare `node --test`** — not in a mutation check,
not "just to see". Use `node tests/run.js …` or `npm test`; see the
implementation note and ADR-0018:172-180.

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
- **Adding a `user/<uid>` domain fallback** when `gui/<uid>` is absent
  (Residual 7). Choosing between the two domains needs a live read of both, which
  this WP cannot do; guessing is the failure mode this WP was re-opened to
  remove. A headless session correctly yields `UNVERIFIABLE`.
- **Adding a second temp-origin mechanism to Table D.** Table D has exactly one,
  location-shaped mechanism and that is the design, not an oversight. The `wd-`
  segment rule was subtracted this round for cause (Table D); re-adding it, or
  any name-shaped substitute, is out of scope. If Residual 8 must be closed,
  that is an ADR-0018 amendment plus a separate WP, not an edit here.
- **Adding a launcher-identity check** (`args[1] !== <core>/launcher/launch.js`)
  to this observer. Considered and rejected this round — see "Considered and
  rejected" in the implementation notes. It duplicates
  `WP-scheduler-entry-identity`'s `generators.launcherPath`, which this WP may
  not import, and it widens ADR-0018 decision 3.
- **Adding a `user/<uid>` or `launchctl list` fallback** when the `gui/<uid>`
  domain print fails. The observer enumerates and reads in one domain on purpose;
  falling back to a second one re-opens the enumerate/read mismatch this round
  closed. A headless session correctly yields one `UNVERIFIABLE` failure.
- **Any `bootout`, `bootstrap` or other scheduler mutation** from the observer.
  It is strictly read-only.
- **Hand-writing any aggregate status table or dependency graph** (ADR-0029) —
  views are generated from frontmatter on demand.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body,
   including the named-subtest count from step 1 and the completed Mutation
   checks table.
2. Step 6 runs on macOS **from a GUI login session** and its output is pasted. If
   it reports `UNVERIFIABLE` results, say which class and why (Residual 7) —
   `UNVERIFIABLE` is not `LEAK`. If the implementer is not on macOS, say so
   explicitly rather than silently omitting the step.
3. Conventional commits; PR titled
   `test(scenarios): add a loaded-record scheduler tripwire (WP-scheduler-loaded-record-tripwire)`.
4. PR template filled, including "Decisions made" and `Generated-by:`. The
   exit-`113` discriminant, the `LEAK`/`UNVERIFIABLE` split, the single-mechanism
   temp-origin predicate and the repair-advice ordering are all **decided here**,
   not open questions — do not re-litigate them; record only what you chose under
   remaining ambiguity.
5. The PR body states explicitly that **this WP does not close the incident class
   on its own**; `WP-scheduler-entry-identity` must also merge.
6. This spec's `status:` flipped to `In-Review` in the same PR.
