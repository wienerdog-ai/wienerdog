---
id: WP-scheduler-mutation-home-authority
title: Invert the scheduler chokepoint's default — mutate the real OS scheduler only from the home it belongs to
status: Draft
model: opus
size: M
depends_on: [WP-smoke-live-scheduler-preflight]
adrs: [ADR-0004, ADR-0018, ADR-0027, ADR-0028, ADR-0031, ADR-0035, ADR-0041]
epic: scheduler-domain-safety
---

# WP-scheduler-mutation-home-authority: the chokepoint refuses by default

## Context (read this, nothing else)

**IRON RULE (ADR-0004): Wienerdog is just files.** This work package starts
nothing and removes a default. Its refusal branch spawns strictly less than the
code it replaces.

Wienerdog registers its nightly **dream** and its **catch-up** entry with the
user's OS scheduler: `launchd` on macOS (labels `ai.wienerdog.*` in the
`gui/$UID` domain), `systemd --user` on Linux, Task Scheduler on Windows. **Those
identifiers are per-user-global, not `$HOME`-scoped.** Every Wienerdog *file*
path is `$HOME`-derived — `getPaths()` computes the core as `$WIENERDOG_HOME ||
<$HOME>/.wienerdog` (`src/core/paths.js:54-55`). Redirecting `HOME` therefore
sandboxes the entire file namespace and **none** of the scheduler namespace: a
process running against a throwaway core still resolves `launchctl bootout
gui/501/ai.wienerdog.dream` to the *live* user's service.

ADR-0018 Decision 2 (`docs/adr/0018-windows-scheduled-dreaming.md:166-180`) named
this invariant after the 2026-07 incident and closed it **for the unit suite
only**: every real scheduler mutation was routed through one chokepoint,
`schedulerSpawn` (`src/scheduler/spawn.js:24-36`), and an **opt-out** environment
variable (`WIENERDOG_TEST_NO_REAL_SCHEDULER`) makes that chokepoint throw. Only
the test runner sets it (`tests/run.js:7`).

Issue #169 is the second instance. `scripts/smoke-install.sh` runs the real CLI
lifecycle under a redirected `HOME` and is not the test runner, so it set
nothing; run locally it removed the maintainer's live `ai.wienerdog.dream` and
`ai.wienerdog.catchup` from launchd. `WP-smoke-live-scheduler-preflight` — this
WP's `depends_on`, drafted in the same commit as this spec and **not yet
implemented** — stops *that script*. This work package closes
the **class**: it inverts the chokepoint's default so a real mutation happens
only under a positive authority, and every dev checkout, test wrapper, scenario
harness and CI script fails safe without having to remember a variable.

**ADR-0041 is the ratified decision this implements** and is binding. Its
one-sentence rule: *the file namespace and the scheduler namespace must belong to
the same user before anything mutates the scheduler; the default is refuse, and
reaching the real scheduler from anywhere else is an explicit, single-variable
opt-in.* Two constraints ADR-0041 carries and this WP inherits verbatim:

- **This is a coherence check, not a security control.** It defends against the
  developer accident — a sandbox that isolates every file and forgets that
  `gui/501` is not a file. It makes no claim in `docs/THREAT-MODEL.md`, defends
  against no adversary, and must not be described as doing either. (ADR-0035
  found that additive "guards" in this codebase relocate rather than close;
  removing a default is the subtractive shape that held.)
- **ADR-0028 amendment §3's durable rule is narrower than "no env var may gate
  anything", and this WP must not stretch it.** It reads, verbatim
  (`docs/adr/0028-scheduler-app-executable-integrity.md:865-870`): *"No mechanism
  may choose between the enforced (prod) and reduced (dev) verification paths on
  the basis of a signal that an A7-scoped write can produce."* That rule is **not
  engaged here**: nothing below chooses between the prod and dev verification
  arms, or between any two arms — it decides only whether a scheduler-mutating
  argv is spawned at all. State the relationship honestly rather than claiming
  compliance with a rule about a different decision.
- **`WIENERDOG_ALLOW_REAL_SCHEDULER` *is* an A7-producible signal**, and this WP
  says so rather than implying otherwise: ADR-0028 treats an `environment.d` /
  `launchctl setenv` write as in scope (`:502`, `:523-525`). What makes that
  acceptable is the marker's ceiling, not its provenance — its only effect is to
  restore exactly today's unconditional behavior. No value of it skips a check,
  selects a verification arm, or reaches any state weaker than the one this tree
  ships today.

## Current state

`src/scheduler/spawn.js` (38 lines) is the whole module. `schedulerSpawn(argv)`
(`:24-36`) has three branches, in this order:

1. `:25` — `process.env.WIENERDOG_LOADER_NOOP` truthy → `return { status: 0 }`.
2. `:26-33` — `process.env.WIENERDOG_TEST_NO_REAL_SCHEDULER` truthy → throw a
   `WienerdogError` naming the argv.
3. `:34-35` — otherwise `spawnSync(argv[0], argv.slice(1), { encoding: 'utf8' })`,
   returning `{ status: r.status == null ? 1 : r.status, stdout: <string> }`.

Its JSDoc (`:15-16`) already documents the trap this WP closes — *"launchd/
systemd/schtasks identifiers are NOT HOME-scoped — a temp-HOME test still hits
the real agent"* — as a note for tests only.

**Measured on this tree (HEAD `a6e0803`):**

- The chokepoint really is one. `schedulerSpawn(` has exactly **three** call
  sites under `src/`: `src/cli/schedule.js:22` (`defaultLoader`),
  `src/scheduler/generators.js:1107` (`defaultCatchupLoader`), and
  `src/core/manifest.js:533` (`reverseSchedulerEntry`'s best-effort unregister,
  wrapped in `try/catch`).
- Every path reaching those originates in an **attended CLI command**: `init`,
  `adopt`, `sync`, `schedule`, `uninstall`, and `update` (which re-enters through
  a `sync` subprocess). Nothing the OS scheduler spawns mutates the scheduler —
  `src/scheduler/launcher.js` and `src/cli/run-job.js` contain no call to
  `schedulerSpawn`, `repointSchedules` or `teardownCatchup`, and `run-job`'s only
  scheduler contact is the read-only probe reached via
  `src/scheduler/status.js`. **So no unattended legitimate path needs the opt-in
  threaded into it.**
- From a `mktemp -d` `HOME` with neither guard variable set,
  `schedulerSpawn(['true'])` returns `{status:0}` having really spawned. That is
  the defect, in one line.
- `os.userInfo().homedir` does **not** follow `$HOME` on POSIX: with
  `HOME=/tmp/fake-home`, `os.homedir()` returned `/tmp/fake-home` and
  `os.userInfo().homedir` returned the passwd home (measured, darwin).
- `src/core/sandbox-guard.js` already carries the directory-identity primitives
  this needs: `sameDir(a, b)` (`:76`) compares two paths by **physical**
  identity via `physicalPath` (`:87`), which realpaths the longest *existing*
  ancestor and re-appends the absent leaf — so a not-yet-created core under a
  symlinked or case-aliased home still compares correctly. Its
  `module.exports` (`:115`) currently exports **only** `sandboxMismatchWarning`.
- `scripts/smoke-install.sh` exports its sandbox at `:28-32` (`HOME`,
  `CLAUDE_CONFIG_DIR`, `CODEX_HOME`; unsets `WIENERDOG_HOME`/`WIENERDOG_VAULT`)
  and is run by `.github/workflows/install-smoke.yml:42` on
  `[ubuntu-latest, macos-latest]`. GitHub Actions sets `CI=true`. **On this tree
  the script has no preflight**; `WP-smoke-live-scheduler-preflight` adds one
  between `set -euo pipefail` and the `mktemp -d` at `:23`, so after that
  dependency merges the line numbers quoted here shift. Every `:NN` in this
  Current-state section was measured on HEAD `a6e0803`; re-verify them at
  dispatch (`docs/specs/README.md`'s dispatch-time re-verification gate), since
  the dependency merging is exactly the window in which they go stale.
- `tests/unit/scheduler-guard.test.js` (66 lines) is the chokepoint's own test:
  a `withEnv({guard, noop})` helper that saves and restores both variables, and
  four tests covering branches 1 and 2 directly and through both default loaders.
  **No test exercises branch 3.**
- No other test depends on branch 3 firing. The one place that strips both
  variables in a child process —
  `tests/unit/scheduler-entry-identity.test.js:473` — states in its own comment
  that the child never calls a scheduler client (`spawn.js` is in its
  require-cache but "loaded but never called").

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing, per scripts/boundary-check.js: this spec file
     itself, package-lock.json, memory/lessons/inbox.md, and docs/specs/logbook/. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/scheduler/spawn.js | the four-branch precedence of Table A and the authority of Table B; refresh the JSDoc so it describes the new default |
| modify | src/core/sandbox-guard.js | add `sameDir` to `module.exports` (`:115`). **Export only — no behavior change, no new function, no edit to `sameDir`, `physicalPath` or `sandboxMismatchWarning`** |
| modify | tests/unit/scheduler-guard.test.js | cover the acceptance criteria below (the implementer designs the cases) |
| modify | scripts/smoke-install.sh | the CI-only opt-in of Table C; no other change |

### Exact contracts

`schedulerSpawn`'s signature and return shape are **unchanged** — no new field,
no new parameter, no new export:

```js
/** @param {string[]} argv  e.g. ['launchctl','bootout','gui/501/ai.wienerdog.dream']
 *  @returns {{status:number, stdout?:string}} */
function schedulerSpawn(argv)
```

What changes is which branch it takes: Table A. Whether the mutating branch is
reachable at all: Table B. What the smoke script does about it: Table C.

## Contract reference

Activation (ADR-0031, 2-of-7): **(ii)** a result taxonomy changes — a fourth
outcome, *refused*, joins noop / throw / real; **(iv)** the branch precedence and
fallback behavior of the chokepoint change; **(vi)** all three call sites and
every command above them inherit the new contract; **(vii)** the same facts are
mirrored in ADR-0041, the tests, the smoke script and the verification commands.

### Table A — `schedulerSpawn` branch precedence (the single source of this order)

Evaluated **on every call**, reading `process.env` at call time — never cached at
module load, because tests and the CLI both mutate the environment after load.

| # | Condition | Spawns? | Returns / throws | stderr |
|---|-----------|---------|------------------|--------|
| 1 | `process.env.WIENERDOG_LOADER_NOOP` truthy | no | `{ status: 0 }` | nothing |
| 2 | `process.env.WIENERDOG_TEST_NO_REAL_SCHEDULER` truthy | no | throws the existing `WienerdogError` naming the argv, message unchanged | nothing |
| 3 | authority present (Table B) | **yes** | `{ status, stdout }` exactly as today (`status` is `1` when `spawnSync` returns `null`; `stdout` is best-effort UTF-8, `''` when absent) | nothing |
| 4 | otherwise — **the new default** | no | `{ status: 1, stdout: '' }` | exactly one line, Table R |

Rows 1 and 2 keep today's precedence and today's behavior byte for byte. Row 4 is
what row 3 used to do unconditionally.

### Table B — the authority (what makes row 3 reachable)

Authority is present when **either** holds. Each is evaluated independently; a
failure to evaluate one is not a failure of the other.

| Authority | Rule |
|-----------|------|
| **Explicit opt-in** | `process.env.WIENERDOG_ALLOW_REAL_SCHEDULER` is truthy |
| **Home coherence** | `sameDir(getPaths().core, path.join(os.userInfo().homedir, '.wienerdog'))` is true — the core this run operates on IS the default core of the OS user whose per-user-global scheduler domain the argv would land in |

| Fact / rule | Value |
|-------------|-------|
| Home source | `os.userInfo().homedir` — **never** `os.homedir()` and never `process.env.HOME`. Measured: `os.userInfo().homedir` ignores a redirected `HOME` on POSIX, which is the entire point; `os.homedir()` follows it and would make the check vacuous |
| Core source | `getPaths()` with no argument, so it reads `process.env` at call time (`src/core/paths.js:54-55`) |
| Comparison | `sameDir` from `src/core/sandbox-guard.js` — physical-identity comparison that tolerates a symlinked/case-aliased home and a core that does not exist yet (a first `init`) |
| Evaluation failure | any throw while evaluating either authority (`getPaths` rejects an unsafe `WIENERDOG_HOME`; `os.userInfo()` can throw when the uid has no passwd entry) is caught and treated as **authority absent** → row 4. Fail safe, never crash the chokepoint |
| Not consulted | the install stance, `.git`, `packageRoot()`, TTY state, argv contents, the manifest, and anything under `<core>/app`. ADR-0041 records why each was rejected; do not add one |
| Platform note | if some platform derives `os.userInfo().homedir` from the environment, the predicate degrades to today's behavior (allow) and never to a new refusal. Verified on darwin only; the failure direction is the safe one |
| CI and containers | no special case. A runner or container whose `HOME` **is** the passwd home (GitHub Actions' `/home/runner`, a Docker image running as root with `HOME=/root`) satisfies the coherence arm exactly like a workstation. A runner that *redirects* `HOME` — which is what `scripts/smoke-install.sh` does — does not, and must set the opt-in; Table C is that setting. No CI-detection variable is read by `schedulerSpawn` |

### Table C — the smoke-install opt-in

| Fact / rule | Value |
|-------------|-------|
| What | `scripts/smoke-install.sh` exports `WIENERDOG_ALLOW_REAL_SCHEDULER=1` **only when `${CI:-}` is non-empty**, so a clean CI runner keeps exercising real registration exactly as today |
| Where | anchored to the **post-dependency** tree, not to this one: adjacent to the sandbox `export HOME=…` block (at `:28-32` on HEAD `a6e0803`, shifted down by whatever `WP-smoke-live-scheduler-preflight` inserted above it). Anchor by the surrounding `export`/`unset` lines, not by a line number |
| Local runs | a local run sets nothing, so it is stopped twice and independently: by that dependency's preflight, and — if the preflight is overridden — by row 4 of Table A |
| `set -e` trap | a bare `[ -n "${CI:-}" ] && export …` returns 1 when `CI` is unset and kills the script under `set -euo pipefail`. Use a form that cannot |
| Everything else | unchanged: no step, assertion, helper, message or check count is touched |

### Table R — the refusal line (row 4's only output)

One line, written to stderr, terminated by `\n`. `<core>`, `<home>` and `<argv>`
are interpolated; `<argv>` is `argv.join(' ')`.

```text
wienerdog: skipping a real OS-scheduler command — this run's core is <core>, not <home>/.wienerdog, and launchd/systemd/Task Scheduler names are per-user-global, so this would hit the live user's jobs. Not run: <argv>. Set WIENERDOG_ALLOW_REAL_SCHEDULER=1 to allow it.
```

| Fact / rule | Value |
|-------------|-------|
| Stream | `process.stderr.write` — never stdout, which `schedulerSpawn`'s callers read as scheduler-client output |
| Frequency | once per refused call. No de-duplication, no module-level state: each refused argv is named |
| Required substrings (what tests assert) | `WIENERDOG_ALLOW_REAL_SCHEDULER`, the resolved core path, and `argv.join(' ')` |

### Mirrored Surface Checklist

- [ ] Deliverables-table cells (each row names the table it implements)
- [ ] Acceptance criteria that assert Tables A, B, C and R
- [ ] Verification commands (they exercise rows 3 and 4 and Table C)
- [ ] Current-state description (today's three branches and the measured row-3 leak)
- [ ] "Exact contracts" — the unchanged signature and return shape
- [ ] Implementation notes (the require-cycle note and the `set -e` trap)
- [ ] Security checklist (the coherence-not-security sentence and the ADR-0028
      amendment §3 rule-not-engaged statement, which the Context section also
      carries — the two move together)
- [ ] **ADR-0041's Decision paragraph and its Consequences bullets** — they state
      Table B's predicate and Table A's refusal shape. Editable only while
      ADR-0041 is unsigned; once the owner signs it, a divergence is fixed by a
      new dated amendment, never by rewriting the Decision

## Implementation notes & constraints

- Zero new dependencies; plain Node ≥ 18; JSDoc types only; no build step
  (CLAUDE.md). `node:os` and `node:path` are builtins.
- **No require cycle is introduced.** `src/core/vendor.js` requires only
  `./errors` and `./update-check`; `src/core/sandbox-guard.js` requires only
  `node:fs`/`os`/`path`; `src/core/paths.js` requires only `node:os`/`path` and
  `./errors`. None of them requires anything under `src/scheduler/`, so
  `spawn.js` may require `paths.js` and `sandbox-guard.js` at module top level.
- **Reuse `sameDir`; do not write a second comparison.** ADR-0035 records that in
  this codebase every *additive* predicate produced the next finding, and that
  the fixes which held reused an existing one. A lexical `===` on two path
  strings is wrong here for the reasons `physicalPath`'s comment already gives.
- The existing `WIENERDOG_TEST_NO_REAL_SCHEDULER` stays exactly as it is. After
  this change it is no longer load-bearing — it becomes what it should always
  have been: a loud failure for a test that reached the chokepoint at all.
- `reverseSchedulerEntry` (`src/core/manifest.js:533`) already wraps its call in
  `try/catch` and ignores the result, and row 4 throws nothing, so `uninstall`
  keeps removing the schedule **files** and stays reversible. Do not change it.
- When uncertain: choose the simpler option and record it under "Decisions made"
  in the PR body. Do NOT expand scope to resolve ambiguity.

## Security checklist

- [ ] The template's untrusted-identifier item is **N/A — no untrusted identifier
      reaches a filesystem path or a shell command here.** The argv arriving at
      the chokepoint is already code-derived (ADR-0027: a manifest-stored `unload`
      argv is never executed; `deriveUnloadArgv` rebuilds it from the file's
      basename identity), and this WP neither constructs nor rewrites it — it only
      decides whether to spawn it. The paths compared in Table B never become path
      segments of anything written.
- [ ] **This is a coherence check, not a security control** (ADR-0041). It defends
      against the developer accident, not an adversary: the same user can set
      `WIENERDOG_ALLOW_REAL_SCHEDULER`. Nothing in `docs/THREAT-MODEL.md` changes
      and no claim of protection may be written into code comments or the PR.
- [ ] ADR-0028 amendment §3's rule (`0028:865-870`) is **not engaged**: nothing
      here chooses between the enforced (prod) and reduced (dev) verification
      paths, or between any two verification arms. The opt-in marker is an
      A7-producible signal (`0028:502`, `:523-525`), and what bounds it is its
      ceiling: its only effect is to restore exactly today's unconditional
      behavior — no reachable state is weaker than the one this tree ships today.

## Acceptance criteria

- [ ] Table A rows 1 and 2 are unchanged: with `WIENERDOG_LOADER_NOOP` set the
      call returns `{status: 0}` and spawns nothing; with
      `WIENERDOG_TEST_NO_REAL_SCHEDULER` set (and NOOP unset) it throws the same
      `WienerdogError` naming the argv; NOOP still wins when both are set.
- [ ] Table A row 4: with both test variables unset, `WIENERDOG_ALLOW_REAL_SCHEDULER`
      unset, and a `HOME` redirected to a temp dir, the call **spawns nothing**
      and returns a non-zero `status`.
- [ ] Table A row 3, opt-in arm: the same call with
      `WIENERDOG_ALLOW_REAL_SCHEDULER=1` really spawns and returns the process's
      own status.
- [ ] Table A row 3, coherence arm: with `HOME` left at the real user's home and
      no variable set, the call really spawns — a legitimate `wienerdog init` /
      `sync` / `uninstall` on a real machine is not changed by this WP.
- [ ] Table B: the decision is made from `os.userInfo().homedir`, so setting
      `HOME` to a temp dir whose `.wienerdog` child would satisfy a naive
      `os.homedir()`-based check still refuses.
- [ ] Table B's evaluation-failure row: an environment that makes an authority
      lookup throw produces a refusal, not an exception out of `schedulerSpawn`.
- [ ] Table R: a refusal writes exactly one line to stderr containing
      `WIENERDOG_ALLOW_REAL_SCHEDULER`, the resolved core path and the joined
      argv — and writes nothing to stdout.
- [ ] Both default loaders inherit the behavior unchanged:
      `src/cli/schedule.js`'s `defaultLoader` and `src/scheduler/generators.js`'s
      `defaultCatchupLoader` refuse and throw under the same conditions as the
      chokepoint itself.
- [ ] `src/core/sandbox-guard.js`'s diff against `main` is **exactly one changed
      line** (one insertion, one deletion — the `module.exports` line gaining
      `sameDir`), asserted by the numstat gate in the verification steps.
      `sandboxMismatchWarning`, `sameDir` and `physicalPath` are behaviorally
      untouched.
- [ ] Table C: `scripts/smoke-install.sh` exports the opt-in when `CI` is
      non-empty and does not when it is unset, and the script still parses and
      passes `shellcheck`.
- [ ] `npm test` and `npm run lint` pass, with no test disabled, skipped or
      granted a new environment variable to keep it passing.
- [ ] Idempotence: **N/A — this WP changes one in-process decision; it ships no
      command and writes nothing outside the repo.**

## Verification steps (run these; paste output in the PR)

```bash
npm test
npm run lint
bash -n scripts/smoke-install.sh && shellcheck --severity=warning scripts/smoke-install.sh

# The chokepoint is still ONE chokepoint: exactly three call sites under src/.
test "$(grep -rn 'schedulerSpawn(' src/ | grep -vc 'function schedulerSpawn')" = 3

# Table A row 4 (the fix). A harmless argv — `true` — so this is safe to run on a
# machine with a live install: nothing scheduler-related is ever spawned.
# BEFORE this change this exits 0 (measured on a6e0803: it really spawned).
# AFTER, it must exit non-zero.
TMPH="$(mktemp -d)"; env -u WIENERDOG_TEST_NO_REAL_SCHEDULER -u WIENERDOG_LOADER_NOOP \
  -u WIENERDOG_ALLOW_REAL_SCHEDULER HOME="$TMPH" node -e \
  'const {schedulerSpawn}=require("./src/scheduler/spawn");const r=schedulerSpawn(["true"]);console.log("status="+r.status);process.exit(r.status===0?0:1)'; \
  echo "exit=$? (must be non-zero)"; rm -rf "$TMPH"

# Table A row 3, opt-in arm: the same call with the marker really spawns.
TMPH="$(mktemp -d)"; env -u WIENERDOG_TEST_NO_REAL_SCHEDULER -u WIENERDOG_LOADER_NOOP \
  WIENERDOG_ALLOW_REAL_SCHEDULER=1 HOME="$TMPH" node -e \
  'const {schedulerSpawn}=require("./src/scheduler/spawn");process.exit(schedulerSpawn(["true"]).status)'; \
  echo "exit=$? (must be 0)"; rm -rf "$TMPH"

# Table A row 3, coherence arm: real HOME, no variable set — still spawns.
env -u WIENERDOG_TEST_NO_REAL_SCHEDULER -u WIENERDOG_LOADER_NOOP \
  -u WIENERDOG_ALLOW_REAL_SCHEDULER node -e \
  'const {schedulerSpawn}=require("./src/scheduler/spawn");process.exit(schedulerSpawn(["true"]).status)'; \
  echo "exit=$? (must be 0)"

# Table C: the opt-in is present and CI-gated.
grep -q 'WIENERDOG_ALLOW_REAL_SCHEDULER' scripts/smoke-install.sh

# sandbox-guard.js is EXPORT-ONLY: exactly one line added and one removed.
test "$(git diff --numstat main -- src/core/sandbox-guard.js | cut -f1)" = 1
test "$(git diff --numstat main -- src/core/sandbox-guard.js | cut -f2)" = 1
```

- The three `node -e` steps, the chokepoint-count test, the Table C grep and the
  two numstat gates are NEW, and each is an ASSERTION that exits non-zero on
  failure rather than printing a value to judge. Paste a real green on the
  finished state AND a real red from a deliberately broken state for each: for
  row 4, the pre-change tree already provides it (it exits 0 today, measured);
  for the coherence arm, temporarily swap `os.userInfo().homedir` for
  `os.homedir()` and watch it refuse; for Table C, remove the export line; for
  the numstat gates, add one throwaway line to `sandbox-guard.js`.
- **Do not** substitute a real scheduler command for `true` in any of these.
  `true` is chosen precisely so the row-3 arms can be observed on a machine with
  a live install without touching it.

## Out of scope (do NOT do these)

- Anything in `WP-smoke-live-scheduler-preflight` (the probe script and the smoke
  preflight). It is this WP's `depends_on`, so it will have merged before this WP
  is dispatched — do not revise, re-verify or extend what it shipped.
- Removing or weakening `WIENERDOG_TEST_NO_REAL_SCHEDULER`, `WIENERDOG_LOADER_NOOP`,
  `tests/run.js`'s suite-wide setting, or `tests/scenarios/scheduler-guard.js`.
  All four stay exactly as they are.
- Threading the opt-in into `bin/wienerdog.js`, the installed launcher, the shim,
  or any command. Measured: no unattended legitimate path mutates the scheduler,
  so none needs it — and a CLI that always sets it makes the inversion vacuous
  (ADR-0041's rejected options).
- Adding a stance, `.git`, `packageRoot()`, TTY or manifest signal to Table B.
  ADR-0041 weighed and rejected each; adding one is a violation of it.
- Any change to `docs/THREAT-MODEL.md`, `docs/runbooks/scheduler-and-executable-integrity.md`,
  `docs/GLOSSARY.md`, or `README.md`. Documenting the `WIENERDOG_HOME`-relocated
  install's new second command is a follow-up, not this WP.
- Teaching `wienerdog doctor` to report a refusal. It already probes live
  registrations and reports missing ones.
- Any change to the three call sites, to `repointSchedules`, to
  `reverseSchedulerEntry`, or to the catch-up teardown.

## Definition of done

0. **DISPATCH PRECONDITION.** This WP is not dispatched and not implemented until
   `docs/adr/0041-real-scheduler-mutation-is-opt-in.md` carries the owner's
   hand-written signature in place of its `Status: Proposed` line. It inverts a
   product default that ADR-0018 Decision 2 set, and the two rejected-option
   findings it rests on (the dev-checkout predicate is fail-broken for the
   maintainer's own install; `installStance` is the wrong polarity) are the
   owner's to accept. The dispatch message records that the signature was
   observed.
1. All verification steps pass locally; output pasted into the PR body.
2. Conventional commits; PR titled
   `fix(scheduler): mutate the real OS scheduler only from the home it belongs to (WP-scheduler-mutation-home-authority)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
5. Both PR review gates have run on the diff and are clean or fully
   dispositioned — they are defined in `docs/runbooks/codex-review.md`
   and not restated here. `In-Review` marks the START of review: this
   list is complete only when review is.
