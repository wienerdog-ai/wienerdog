---
id: WP-temp-root-wrapper
title: Front every test entry point with a run-scoped temp root, so test runs stop leaking directories
status: Draft
model: sonnet
size: S
depends_on: []
adrs: [ADR-0004]
---

# WP-temp-root-wrapper: a run-scoped temp root in front of every test entry point

## Context (read this, nothing else)

Wienerdog is a zero-runtime-dependency Node package that installs files. The
**iron rule (ADR-0004)** is that Wienerdog is just files: nothing it ships may
start a process that outlives its job. This work package respects that trivially
— it adds no process at all, only a directory created and removed inside one
already-running command.

The problem is in the **test harness**, not in shipped code. Test files across
the suite create scratch directories with
`fs.mkdtempSync(path.join(os.tmpdir(), 'wd-<name>-'))` and mostly never remove
them, so every `npm test` deposits ~1,676 directories into the developer's
per-user temp directory and leaves them there. Over months this accumulates
without bound. On the maintainer's Mac it reached **567,710 entries** in
`$TMPDIR`, at which point macOS Finder pinned a CPU core at 84% and grew to
3.5 GB RSS simply traversing that directory; the machine's load average sat at
7.37 until it was cleaned by hand. The system's own periodic purge did not
reclaim them — three-week-old entries were still present — most likely because
the purge skips non-empty directories, and every leaked directory has files in
it.

The direction is owner-decided and **not open for redesign**: rather than
migrating ~64 test files to per-test cleanup, one small generic wrapper is
placed **in front of every test entry point**. The wrapper creates one temp root
per run, points the child's temp directory at it, and deletes the whole root
when the run finishes. Test files keep calling `os.tmpdir()` exactly as they do
today and need no edits; what changes is where `os.tmpdir()` resolves to while a
run is in progress.

The wrapper fronts **six** entry points — `npm test` plus the five scenario
scripts, which each have their own entry file and would otherwise inherit
nothing. Because the wrapper sits outside them, **`tests/run.js` is not touched
at all**, and that is load-bearing rather than incidental: `tests/run.js` keeps
setting `WIENERDOG_TEST_NO_REAL_SCHEDULER=1` for its own children, so the unit
suite keeps its scheduler guard while the scenario harnesses — which exist to
drive real paths — correctly do not receive it.

One case makes a naive delete insufficient and is therefore part of the
contract: `tests/unit/private-fs.test.js` exercises Wienerdog's private-mode
repair by `chmod`-ing directories to `0o000` and never restoring them. Such a
tree cannot be removed until its permissions are restored — measured, see
Current state.

## Current state

Measured in this worktree on **2026-08-20** at commit `1d4c092`, macOS,
Node v24.18.0, unless a fact is labelled **read** (read from source, not
executed). No scenario harness and no `bin/wienerdog.js` verb was executed to
produce any fact here.

**The six entry points** (read — `package.json` `scripts`):

| npm script | entry file today | body today |
|---|---|---|
| `test` | `tests/run.js` | `node tests/run.js` |
| `scenarios` | `tests/scenarios/run-scenarios.js` | `node tests/scenarios/run-scenarios.js` |
| `scenarios:negative` | `tests/scenarios/negative/run-negative.js` | `node tests/scenarios/negative/run-negative.js` |
| `broker:selfcheck` | `tests/scenarios/broker/lifecycle-selfcheck.js` | `node tests/scenarios/broker/lifecycle-selfcheck.js` |
| `scenarios:broker-e2e` | `tests/scenarios/broker-e2e/run-broker-e2e.js` | `node tests/scenarios/broker-e2e/run-broker-e2e.js` |
| `scenarios:a7-integrity` | `tests/scenarios/a7-integrity/run-a7-integrity.js` | `node tests/scenarios/a7-integrity/run-a7-integrity.js` |

Nothing else in the repo invokes `tests/run.js` (read — grep): only
`package.json`, plus two comments in `tests/unit/scheduler-leak-guard.test.js`
and `tests/unit/scheduler-guard.test.js` noting that `tests/run.js` is where
`WIENERDOG_TEST_NO_REAL_SCHEDULER=1` comes from. Those comments stay true,
because this WP does not touch `tests/run.js`.

**`tests/run.js` — the whole file, unchanged by this WP (12 lines):**

```js
'use strict';
// Zero-dep test entry. Activates the hard scheduler guard for the WHOLE suite
// (env inherits to every `node --test` per-file child process) and forwards argv
// so `npm test -- --test-name-pattern X` still works. Cross-platform (no shell
// env syntax).
const { spawnSync } = require('node:child_process');
const env = { ...process.env, WIENERDOG_TEST_NO_REAL_SCHEDULER: '1' };
const r = spawnSync(process.execPath, ['--test', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env,
});
process.exit(r.status == null ? 1 : r.status);
```

The `{ ...process.env, … }` spread is why the wrapper works without editing this
file: anything the wrapper injects into `tests/run.js`'s environment is passed
straight through to `node --test` and to every per-file child.

**Scale of the leak.** One full green run (`2028 pass / 0 fail`) with the temp
directory redirected to an empty directory left **1,676 directories** behind in
it, and zero files. They span ~90 distinct `wd-*` prefixes; the largest
producers in that run were `wd-validate-` (145), `wd-manifest-` (143),
`wd-sched-` (80), `wd-digest-` (70) and `wd-runjob-` (66). The leak is systemic,
not local to a few files: 88 files under `tests/` call `mkdtempSync` across 302
call sites; 64 of them contain fewer `rmSync`/`rmdirSync`/`rimraf` calls than
`mkdtempSync` calls, for 229 unmatched sites. The worst is
`tests/unit/private-fs.test.js` — 50 `mkdtempSync` calls against 1 removal call,
and that one targets a file, not a root.

**The suite is temp-directory-agnostic.** That redirected run was fully green,
so pointing the suite at a different temp directory breaks nothing. It set
`TMPDIR`, `TMP` and `TEMP` together, which is what this WP does; nothing in the
suite asserts on the absence of `TMP`/`TEMP`.

**The mode-`0o000` case, measured.** That run left exactly one unreadable
directory, `wd-privfs-XXXXXX/wd/secrets`, mode `000`. On it:

- `rm -rf` fails: `rm: .../wd/secrets: Permission denied`, then
  `Directory not empty` for each ancestor.
- `fs.rmSync(root, { recursive: true, force: true })` **throws `ENOTEMPTY`** and
  leaves the tree in place — `force: true` does not help, because the failure is
  the parent's unreadability, not a missing file.
- A recursive walk that `chmod`s each directory to owner-rwx *before* reading
  it, followed by the same `rmSync`, removes the tree cleanly.

**Node's temp-directory resolution**, which decides what must be set. On POSIX
(measured): `TMPDIR`, then `TMP`, then `TEMP`, then `/tmp`. On win32 (read from
the runtime's own `require('node:os').tmpdir.toString()`): `TEMP`, then `TMP`,
then `SystemRoot`/`windir` + `\temp`. Setting all three covers both.

**Two prototype measurements, and exactly what each proves.**

1. A throwaway prototype of the create-root / inject-`TMPDIR`+`TMP`+`TEMP` /
   permission-restoring-walk / `rmSync`-in-`finally` sequence was run against
   the full suite: `2028 pass / 0 fail`, 1,676 entries found in the root, root
   fully removed, **teardown 2.9 seconds**, exit 0, on the real long
   `/var/folders/.../T` path. This proves the mechanism at full-suite scale. It
   spawned `node --test` directly, so it does **not** cover the extra hop this
   WP's design adds.
2. That hop was measured separately: with `TMPDIR`/`TMP`/`TEMP` set to a
   redirected root, `node tests/run.js <a temp test file>` reported
   `CHILD_TMPDIR=<the redirected root>` and `CHILD_GUARD=1` from inside the
   `node --test` grandchild. This proves that a wrapper-injected temp directory
   reaches the test children through an **unmodified** `tests/run.js`, and that
   the scheduler guard still arrives.

**All five scenario entry points refuse to run without an env var** (read — the
guard in each file). Each prints its own distinct skip line and exits 0:

- `tests/scenarios/run-scenarios.js:282` — inside `main()`, prints and returns.
- `tests/scenarios/negative/run-negative.js:457` — inside `main()`, sets
  `process.exitCode = 0` and returns.
- `tests/scenarios/broker/lifecycle-selfcheck.js:28-30` — module top level,
  `process.exit(0)`.
- `tests/scenarios/broker-e2e/run-broker-e2e.js:44-46` — module top level,
  `process.exit(0)`.
- `tests/scenarios/a7-integrity/run-a7-integrity.js:31-33` — module top level,
  `process.exit(0)`.

Those strings are **not** this WP's contract and must not be pinned by a test.
The CI workflow that would run these live (`.github/workflows/scenarios.yml`) is
dormant by its own header comment; the real scenario run is a manual,
quota-spending, local run.

**What creates temp directories under `tests/scenarios`** (measured by grep):
7 files, 13 `mkdtempSync` call sites — the five entry files plus
`a7-integrity/fixtures/cases.js` and `.../fixtures/build.js`, which are
libraries the a7 runner requires. Counting removal calls per file, only two show
a deficit: `fixtures/build.js` (5 vs 1) and `run-a7-integrity.js` (3 vs 2). Those
counts say nothing about whether the calls sit on every path, and none of it was
measured by running a harness. This WP does not depend on any leak volume: it
makes the question moot by scoping and deleting the whole root.

**A repo lesson that shapes verification below** (read —
`memory/lessons/inbox.md:142`, WP-073): `npm test -- --test-name-pattern X`
does **not** scope the run — the full suite still runs and prints. Treat that
flag as "the named tests are included", never as a filter, and never as a way to
make a verification step cheap.

**Precedent for the guard test.** `tests/unit/scheduler-leak-guard.test.js` is
an existing meta-guard in this suite. Its header records a trap worth repeating:
it prefixes every test name with a fixed string precisely so a
`--test-name-pattern` command genuinely selects it, because **a name pattern
that matches nothing passes vacuously**.

**Shipped code is already correct** and is not touched: `src/` has exactly two
`mkdtempSync` sites — `src/core/tarball.js:213` (removed at `:244`) and
`src/core/dream/containment-probe.js:163` (removed at `:277`) — both inside
`finally` blocks.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing, per scripts/boundary-check.js: this spec file
     itself, package-lock.json, memory/lessons/inbox.md, and docs/specs/logbook/. -->

| Action | Path | Notes |
|--------|------|-------|
| create | tests/with-temp-root.js | the whole mechanism, per Table A |
| create | tests/unit/tmpdir-leak-guard.test.js | the regression guard; the implementer designs the cases, which must establish the properties in Acceptance criteria |
| modify | package.json | route all six `scripts` entries through the wrapper AND add the `//` convention note, both per Table B; no dependency change |

`tests/run.js` is deliberately **absent** from this table and must not be
edited. `CHANGELOG.md` is absent too: in this repo it is written at release time
(`chore(release): …`), never per work package, and this change has no
user-facing behavior.

### Exact contracts

Every npm script keeps its **name** and its observable behavior. `npm test`
still runs the unit suite and still forwards arguments;
`npm test -- --test-name-pattern X` and `npm test -- path/to/one.test.js` behave
exactly as today. `npm run scenarios` still runs the scenario harness and still
refuses without `WIENERDOG_RUN_SCENARIOS=1`. `.github/workflows/ci.yml` calls
`npm test` and `.github/workflows/scenarios.yml` calls `npm run scenarios`;
neither is edited, and both keep working because only script *bodies* change.

## Contract reference

Activation (ADR-0031, 2-of-7): **(iv)** the runner's error/precedence behavior is
new and easy to get wrong — a teardown failure must lose to a failing child yet
still be able to fail a passing one; and **(vii)** the same facts (which
variables are injected, which are deliberately *not*, the exit-code precedence,
the six wired entry points) are mirrored in the wrapper, in `package.json`, in
the guard test, in the acceptance criteria and in the verification commands.
Tables A and B are the single place those facts are decided.

### Table A — `tests/with-temp-root.js`

| Fact / rule | Value |
|-------------|-------|
| Invocation | `node tests/with-temp-root.js <script.js> [args…]` |
| What it runs | `process.execPath` with `[<script.js>, ...args]` — a **Node script path plus its arguments**, never an arbitrary command string. No shell, no `PATH` resolution. This keeps a test helper from becoming a general execution seam |
| Argument forwarding | every argument after `<script.js>` is passed through unchanged. This is what makes `npm test -- --test-name-pattern X` keep working: npm appends those args to the script body, so they arrive here and must reach the script |
| Where the root is created | before the child is spawned: `fs.mkdtempSync(path.join(os.tmpdir(), 'wd-testrun-'))`. `os.tmpdir()` here resolves against the **ambient** temp directory, so a caller who already redirects `TMPDIR` keeps control of where the root lands |
| Variables injected into the child env | `TMPDIR`, `TMP` and `TEMP`, all three set to the root, on every platform. The rest of `process.env` passes through unchanged |
| Why all three | Node resolves `os.tmpdir()` from `TMPDIR`→`TMP`→`TEMP`→`/tmp` on POSIX and from `TEMP`→`TMP`→`SystemRoot\temp` on win32 (Current state); the repo is cross-platform, so one variable is not enough |
| **What it must NOT inject** | nothing else — in particular **not** `WIENERDOG_TEST_NO_REAL_SCHEDULER` and **not** `WIENERDOG_RUN_SCENARIOS`. `tests/run.js` sets the scheduler guard for the unit suite itself and is untouched; the scenario harnesses exist to drive real paths and must not have it forced on them. A child sees either variable only if the caller's own environment already had it |
| When teardown runs | after the child has exited, on every path out of the spawn — normal exit, signal death, or a throw from `spawnSync` itself (i.e. from a `finally`) |
| Teardown step 1 — permission restore | walk the root recursively and `chmod` every **directory** to owner read+write+execute, applying the `chmod` to a directory **before** reading its entries (an unreadable directory cannot be listed until it is restored). Required because `rmSync` alone throws `ENOTEMPTY` on the mode-`0o000` tree the suite leaves behind (Current state) |
| Symlinks during the walk | never followed and never `chmod`ed — classified with `lstat`, and a symbolic link is left for `rmSync` to unlink. Some tests deliberately create links pointing outside their own root; a following walk would change modes outside the run root |
| Teardown step 2 — removal | `fs.rmSync(root, { recursive: true, force: true })` |
| Teardown never throws | every filesystem call in teardown is individually best-effort; a failure is recorded, not propagated. Teardown must not be able to turn a run's outcome into a crash |
| Diagnostics on failure | when the root still exists after teardown, one clearly-labelled message on **stderr** naming the root and up to ~10 surviving paths, so the failure is actionable |
| Exit status — child failed | when the child's status is non-zero, or the child died on a signal / failed to spawn (`status == null` → `1`), the wrapper exits with exactly that status. A teardown problem **never** replaces it and never turns a red run green |
| Exit status — child passed | when the child's status is `0`: exit `0` if the root no longer exists after teardown, and exit `1` if it does. A run that passes while leaving an unremovable temp root is the regression this WP exists to prevent, and it must be loud rather than a warning in a log |
| Missing or empty first argument | exit non-zero with a one-line usage message on stderr, rather than spawning nothing and reporting success |
| Dependencies | none. The walk is hand-rolled on `node:fs`; no `rimraf`, no new dependency of any kind (CLAUDE.md: zero runtime dependencies) |
| Nothing is started | no watcher, no background process, nothing that outlives the `node tests/with-temp-root.js` process (ADR-0004) |

### Table B — the `package.json` wiring

| Fact / rule | Value |
|-------------|-------|
| Which scripts change | exactly the six in Current state's entry-point table: `test`, `scenarios`, `scenarios:negative`, `broker:selfcheck`, `scenarios:broker-e2e`, `scenarios:a7-integrity` |
| How each changes | the body gains the wrapper prefix and keeps its entry file: `node <entry file>` becomes `node tests/with-temp-root.js <entry file>`. For `test` that is `node tests/with-temp-root.js tests/run.js` |
| Script names | unchanged, all six — so `.github/workflows/ci.yml` (`npm test`), the dormant `.github/workflows/scenarios.yml` (`npm run scenarios`), and every habit keep working |
| Not routed through the wrapper | `lint` and `gen:agents` — they create no temp directories |
| The convention note (protects future scripts) | a `"//"` pseudo-key as the **first** entry inside the `scripts` object, whose value is exactly: `Any script that runs tests must go through tests/with-temp-root.js — it scopes and deletes the run's temp directory (WP-temp-root-wrapper).` |
| Why a `"//"` key in `scripts` | npm treats `//` as a comment key: measured on Node v24.18.0 that `npm run test` is unaffected and `npm run` prints the note in its script listing — so it is visible in the one place a person is standing when they add a seventh script. Exactly one such key (a JSON object must not carry duplicates) |
| What the note is NOT | it is a convention, not an enforcement mechanism. The guard test asserts the note is **present** and names the wrapper; nothing can make a future script obey it. Do not build machinery that tries |
| Dependencies | unchanged; this WP adds and removes none |

### Mirrored Surface Checklist

- [ ] Deliverables-table cells (the wrapper row cites Table A, the
      `package.json` row cites Table B)
- [ ] "Exact contracts" — the preserved script names and forwarding behavior
- [ ] Acceptance criteria — each asserts one or more rows of Table A or B
- [ ] Verification steps — the ambient-count assertion, the skip-mode loop, the
      synthetic-child proof, the exit-status and usage commands
- [ ] Current state — the measured facts the tables are derived from (the
      `ENOTEMPTY` measurement, the variable-resolution order, the two prototype
      measurements, the six entry-point bodies)
- [ ] Implementation notes — the "do not run these" list and the teardown cost
- [ ] The **must-not-inject** rule, which appears in Table A, in the
      Acceptance criteria and in verification step 8 — all three move together
- [ ] The `"//"` convention note's literal text, which Table B decides and which
      the Deliverables cell, one acceptance criterion and verification step 10
      all mirror

## Implementation notes & constraints

- **Do not run these, at any point, for any reason:** the five scenario scripts
  **with `WIENERDOG_RUN_SCENARIOS=1` set**, and any `bin/wienerdog.js` verb
  (`init`, `sync`, `schedule`, `uninstall`, `run-job`, …) against your real
  `HOME`. They spend real model quota and reach the real user-global OS
  scheduler, whose identifiers are not `HOME`-scoped. Every verification step
  below runs those five in **skip** mode only and proves the mechanism with a
  synthetic child instead.
- Set `WIENERDOG_TEST_NO_REAL_SCHEDULER=1` on **every** test invocation you make
  by any route, including ad-hoc `node --test <file>` runs and the skip-mode
  runs below. `npm test` gets it from `tests/run.js`; a direct `node --test`
  does not.
- **`tests/run.js` is not in the Deliverables table.** Do not edit it, not even
  to "simplify" it now that the wrapper exists. Its `{ ...process.env, … }`
  spread is what carries the injected variables through, and it is the reason
  the scheduler guard reaches the unit suite but not the harnesses.
- Zero new dependencies; plain Node ≥ 18; JSDoc type annotations only; no build
  step; no TypeScript (CLAUDE.md). Keep the wrapper small and obvious.
- **No test file and no scenario runner is edited by this WP.** The ~64 files
  with a cleanup deficit stay exactly as they are; the runners are wrapped from
  outside, not modified.
- Teardown cost is real but bounded: removing 1,676 directories took 2.9 seconds
  against a ~39-second suite in the prototype. No optimization is wanted;
  simplicity is.
- The permission walk must `chmod` a directory before `readdir`-ing it. The
  other order silently skips the contents of every unreadable directory — the
  exact case the step exists for.
- `fs.chmodSync` on Windows only toggles a read-only bit and cannot fail the way
  POSIX modes can; the walk is harmless there and needs no platform branch.
- `tests/with-temp-root.js` sits next to `tests/run.js`, which `node --test`
  does not collect as a test file. Keep the same shape (no `.test.js` suffix);
  if it were ever collected, `npm test` would spawn itself recursively, which
  the suite would surface immediately.
- If the root ever survives teardown on a green run because a test leaked a
  **still-running** child process holding the directory, the resulting red is
  correct and points at a real bug in that test — do not weaken Table A's
  exit-status rule to accommodate it.
- When uncertain: choose the simpler option and record it under "Decisions
  made" in the PR body. Do NOT expand scope to resolve ambiguity.

## Security checklist

- [ ] The template's untrusted-identifier item is **N/A — no untrusted
      identifier reaches a filesystem path or a shell command here.** The only
      constructed path is the run root (`os.tmpdir()` + a fixed prefix +
      `mkdtempSync`'s random suffix); the wrapper's script argument comes from
      `package.json`'s own `scripts`, not from user input; the teardown walk
      operates only on paths it read from that root with `readdir`.
- [ ] **The wrapper must not become a command-execution surface.** Table A
      restricts it to `process.execPath` plus a script path and arguments — no
      shell, no `PATH` resolution, no command string.
- [ ] **Recursive `chmod` + recursive delete must not escape the run root.**
      Entries are classified with `lstat` and symbolic links are never followed
      or `chmod`ed (Table A), and the root is a fresh `mkdtempSync` directory
      owned by this process, so no pre-existing path is reachable through it.

## Acceptance criteria

- [ ] A full `npm test` leaves its ambient temp directory's `wd-*` entry count
      unchanged — the run-scoped root is created inside it and is gone
      afterwards, together with everything the suite created (Table A). This
      count is evaluated in an **isolated** temp root (see the verification
      preamble), never in the machine's shared temp directory.
- [ ] The suite still passes with the same pass/skip counts as before the
      change, and `tests/run.js` is byte-identical to its current content.
- [ ] All six `package.json` scripts are routed through the wrapper and keep
      their names (Table B); the guard test asserts this by reading
      `package.json`, so a future entry point that loses the prefix is caught.
- [ ] `package.json`'s `scripts` object carries the `"//"` convention note from
      Table B, and the guard test asserts it is present and names
      `tests/with-temp-root.js` — a presence check, not an enforcement
      mechanism, and `npm test` still runs normally with the key in place.
- [ ] Argument forwarding survives the extra hop: `npm test -- <a test file
      path>` and `npm test -- --test-name-pattern <x>` still include what they
      include today. (Per the WP-073 lesson in Current state, the pattern flag
      does not filter the run — do not assert that it does.)
- [ ] The wrapper injects **only** `TMPDIR`, `TMP` and `TEMP`: a child run
      through it does not see `WIENERDOG_TEST_NO_REAL_SCHEDULER` or
      `WIENERDOG_RUN_SCENARIOS` unless the caller's own environment had them.
- [ ] The unit suite still receives `WIENERDOG_TEST_NO_REAL_SCHEDULER=1`, from
      the untouched `tests/run.js`.
- [ ] All five scenario scripts still exit 0 in skip mode and still print their
      existing skip lines, which are neither modified nor pinned by any test.
- [ ] Teardown removes a tree containing a directory whose mode is `0o000`. The
      guard test constructs that case itself rather than relying on
      `tests/unit/private-fs.test.js` happening to produce one.
- [ ] Teardown does not follow a symbolic link out of the root: a link inside
      the root pointing at a directory outside it is unlinked, and the target
      directory keeps its modes and contents.
- [ ] Exit status follows Table A in both directions: a failing child's non-zero
      status reaches the caller unchanged, and a passing child exits 0.
- [ ] `node tests/with-temp-root.js` with no argument exits non-zero with a
      usage message rather than reporting success.
- [ ] The guard cases fail if the env injection is removed from the wrapper, and
      fail if the permission-restore step is removed. Both are demonstrated by a
      real red run, not asserted.
- [ ] Every test name in the new test file carries a fixed shared prefix, so a
      `--test-name-pattern` command genuinely selects it instead of passing
      vacuously.
- [ ] Idempotence: two consecutive `npm test` runs each leave that same
      isolated temp root's `wd-*` count unchanged.
- [ ] `npm run lint` passes.

## Verification steps (run these; paste output in the PR)

Run the whole block in ONE shell session, top to bottom: the preamble's exports
and `$COUNT` are used by later steps.

```bash
# 0 — PREAMBLE (required). Every counted step below must observe a temp
#     directory that no other process writes to. On the machine where this WP is
#     implemented, other agent sessions run the suite around the clock and
#     currently leak ~30k wd-* directories a day into the shared temp directory
#     — roughly one new entry every few seconds. Counting there would produce
#     both false reds (a concurrent leak lands mid-run) and false greens (a
#     concurrent leak and delete cancel out). Redirecting is not a workaround
#     for a contract gap: Table A states that a caller who already redirects
#     TMPDIR keeps control of where the run root lands, so this exercises the
#     documented behavior.
WD_VERIFY_TMP=$(mktemp -d)
export TMPDIR="$WD_VERIFY_TMP" TMP="$WD_VERIFY_TMP" TEMP="$WD_VERIFY_TMP"
echo "isolated verification temp root: $WD_VERIFY_TMP"

# 1 — the suite is green, through the wrapper
npm test

# 2 — a full run leaves its temp directory exactly as it found it. Counts are
#     taken in the isolated root from step 0, so `os.tmpdir()` below resolves
#     there too. Keep the `wd-*` filter rather than a bare entry count: it holds
#     the assertion to Wienerdog-created entries and ignores the `tmp.*` scratch
#     dirs later steps create, wherever a given platform's `mktemp` puts them
#     (macOS `mktemp -d` was observed NOT to honor an exported TMPDIR).
#     ASSERTION: exits non-zero when the counts differ.
COUNT='const fs=require("node:fs"),os=require("node:os");console.log(fs.readdirSync(os.tmpdir()).filter(n=>n.startsWith("wd-")).length)'
BEFORE=$(node -e "$COUNT")
npm test
AFTER=$(node -e "$COUNT")
echo "ambient wd-* before=$BEFORE after=$AFTER"
test "$BEFORE" = "$AFTER"

# 3 — run step 2 again; same result (idempotence)

# 4 — argument forwarding survives the wrapper hop
npm test -- tests/unit/manifest.test.js
npm test -- --test-name-pattern "tmpdir-leak-guard"

# 5 — the five scenario scripts in SKIP mode leave the isolated temp root
#     as they found it. WIENERDOG_RUN_SCENARIOS is deliberately UNSET;
#     WIENERDOG_TEST_NO_REAL_SCHEDULER=1 is a second line of defense.
#     ASSERTION: exits non-zero if any script fails or the counts differ.
BEFORE=$(node -e "$COUNT")
for s in scenarios scenarios:negative broker:selfcheck scenarios:broker-e2e scenarios:a7-integrity; do
  echo "--- $s (skip mode) ---"
  WIENERDOG_TEST_NO_REAL_SCHEDULER=1 npm run --silent "$s" || exit 1
done
AFTER=$(node -e "$COUNT")
echo "ambient wd-* before=$BEFORE after=$AFTER"
test "$BEFORE" = "$AFTER"

# 6 — the mechanism itself, proved with a SYNTHETIC leaky child: it creates two
#     temp dirs and makes one unreadable — the case rmSync alone cannot remove.
#     ASSERTION: exits non-zero if anything survives.
D=$(mktemp -d)
cat > "$D/leaky.js" <<'LEAKY'
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
fs.mkdtempSync(path.join(os.tmpdir(), 'wd-synthleak-'));
const b = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-synthleak-'));
fs.mkdirSync(path.join(b, 'locked'));
fs.writeFileSync(path.join(b, 'locked', 'f'), 'x');
fs.chmodSync(path.join(b, 'locked'), 0o000);
LEAKY
BEFORE=$(node -e "$COUNT")
node tests/with-temp-root.js "$D/leaky.js"; echo "wrapper exit=$?"
AFTER=$(node -e "$COUNT")
echo "ambient wd-* before=$BEFORE after=$AFTER"
test "$BEFORE" = "$AFTER"

# 7 — exit status, red side. ASSERTION: non-zero only if the wrapper FAILED to
#     propagate the child's status.
printf "process.exit(7);\n" > "$D/boom.js"
node tests/with-temp-root.js "$D/boom.js"; RC=$?
echo "child status propagated as $RC"
test "$RC" -eq 7

# 8 — the wrapper injects NOTHING beyond the three temp variables. ASSERTION.
printf "console.log(process.env.WIENERDOG_TEST_NO_REAL_SCHEDULER || '<unset>');\n" > "$D/env.js"
SEEN=$(WIENERDOG_TEST_NO_REAL_SCHEDULER= node tests/with-temp-root.js "$D/env.js" | tail -1)
echo "child saw guard: $SEEN"
test "$SEEN" = "<unset>"

# 9 — no argument: usage, not silent success. ASSERTION.
node tests/with-temp-root.js; RC=$?
test "$RC" -ne 0
rm -rf "$D"

# 10 — the convention note is present and names the wrapper (Table B). ASSERTION.
node -e 'const s=require("./package.json").scripts; const n=s["//"]||""; console.log("note:", n||"<missing>"); process.exit(n.includes("tests/with-temp-root.js") ? 0 : 1)'

# 11 — lint
npm run lint

# 12 — TEARDOWN of the isolated root. The chmod is what lets this succeed if a
#      deliberate-red run above left an unreadable directory behind; `|| true`
#      keeps the teardown from being the thing that fails the block.
chmod -R u+rwx "$WD_VERIFY_TMP" 2>/dev/null || true
rm -rf "$WD_VERIFY_TMP"
```

Steps 2 and 5–10 are NEW, and each is an assertion that exits non-zero on failure
rather than printing something a reader must judge. Per
`docs/runbooks/spec-authoring.md`, each must be observed on **both** sides —
paste a real green on the finished state AND a real red from a deliberately
broken state. Run each red under the step-0 preamble as well: the isolation is
what makes a red mean "the break caused this" rather than "another session wrote
into the temp directory mid-run". A red may leave residue (including an
unreadable directory) in the isolated root; step 12 is written to clear it.

- steps 2, 5 and 6: with the three temp variables removed from the wrapper's env;
- step 6 again: with the permission-restore walk removed, leaving only `rmSync`
  — the case measured to throw `ENOTEMPTY`;
- step 7: with the exit rule changed to always exit `0`;
- step 8: with `WIENERDOG_TEST_NO_REAL_SCHEDULER: '1'` added to the wrapper's
  injected env — the trap Table A names;
- step 10: with the `"//"` key removed from `scripts`.

## Out of scope (do NOT do these)

- **Editing `tests/run.js`.** It is not in the Deliverables table. The wrapper
  works precisely because that file is left alone.
- **Per-file migration.** Do not add cleanup to any of the 64 test files with a
  deficit, do not introduce a shared `mkTemp`/`afterEach` test helper, and do
  not edit `tests/unit/private-fs.test.js` — including its `chmod 0o000` calls,
  which are deliberate setup for private-mode repair. No file under
  `tests/scenarios/` is edited either.
- **Direct `node tests/run.js` or `node --test <file>` invocations**, which
  bypass the wrapper and keep leaking into the ambient temp directory. This is a
  **known, accepted gap**, not an oversight — and it doubles as the escape hatch
  this WP would otherwise remove: when a test fails and you want to inspect the
  scratch directory it left, run that one file directly instead of through
  `npm test`.
- **Running the scenario harnesses live**, or any `bin/wienerdog.js` verb — see
  Implementation notes.
- **`src/`, `bin/`, `.github/workflows/`.** Both `src/` `mkdtempSync` sites
  already clean up in `finally`; the workflows call the scripts by name, which
  does not change.
- **A CI step or a lint layer.** The guard is a test in the suite CI already
  runs.
- **Cleaning the maintainer's accumulated leftovers.** Already done by hand; not
  a code change.

### Discovered issues (pointer only — another session owns this)

Recorded so the finding is not lost. It has nothing to do with temp directories,
is **not** this WP's work, and must not be expanded here or acted on in this PR.

A reproduction on 2026-08-20 (full unit suite with a shimmed `launchctl` and no
`WIENERDOG_TEST_NO_REAL_SCHEDULER`) recorded **16 real OS-scheduler mutations**:
12 × `launchctl bootout gui/501/ai.wienerdog.catchup`, whose caller is the real
CLI spawned by integration tests (`bin/wienerdog.js init --yes`), plus 4
`bootstrap` calls with real labels from the codex integration test.
launchd/systemd/schtasks identifiers are per-user-global, not `HOME`-scoped, so
a temp-`HOME` test still reaches the real user agent. The structural idea on the
table is inverting the protection — real mutation requiring an explicit opt-in
set only by the installed launcher, rather than today's opt-out test guard. A
separate session owns this topic and any WP that comes of it.

## Definition of done

1. All verification steps pass locally, including the required deliberate-red
   runs; output pasted into the PR body.
2. Conventional commits; PR titled
   `test(harness): run-scoped temp root in front of every test entry point (WP-temp-root-wrapper)`.
3. PR template filled, including "Decisions made" (or "none") and
   `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
5. Both PR review gates have run on the diff and are clean or fully
   dispositioned — they are defined in `docs/runbooks/codex-review.md` and not
   restated here. `In-Review` marks the START of review: this list is complete
   only when review is.
