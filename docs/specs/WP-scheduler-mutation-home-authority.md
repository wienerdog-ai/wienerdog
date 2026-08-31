---
id: WP-scheduler-mutation-home-authority
title: Invert the scheduler chokepoint's default — mutate the real OS scheduler only from the home it belongs to
status: Draft
model: opus
size: M
depends_on: [WP-smoke-live-scheduler-preflight]
adrs: [ADR-0004, ADR-0018, ADR-0019, ADR-0027, ADR-0028, ADR-0031, ADR-0035, ADR-0038, ADR-0041]
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

- **This is a mistake-guard, not a security control, and home-path equality is
  evidence of coherence rather than proof of it.** It defends against the
  developer accident — a sandbox that isolates every file and forgets that
  `gui/501` is not a file. It makes no claim in `docs/THREAT-MODEL.md`, defends
  against no adversary, and must not be described as doing either. An environment
  that deliberately presents its own filesystem at the passwd home's pathname
  while bridging the host scheduler is **outside** what it defends; the Security
  checklist names that residual and forbids adding detection for it. (ADR-0035
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
- `src/cli/uninstall.js` `run(argv)` (`:38`) takes **one** argument and has no
  seam. It loads the manifest at `:49-54`, prompts at `:95-112`, and the first
  thing that deletes anything is `manifestLib.reverse(…, { dryRun: false })` at
  `:114`. Its callers — in-process and subprocess, in both test files, with
  counts and line numbers — are inventoried once in **Table T**; every
  non-dry-run one reaches Table U's gate. Both test files build their env by
  spreading `...process.env` and setting `WIENERDOG_LOADER_NOOP: '1'`
  (`tests/unit/uninstall.test.js:20-26`,
  `tests/integration/uninstall-core-e2e.test.js:27-33`).
- `reverseSchedulerEntry` ignores its unload's result: `schedulerSpawn(argv)` sits
  inside a `try/catch` whose comment says *"Best-effort: the entry may already be
  unloaded. Ignore non-zero/errors; the goal is the file removal below"*
  (`src/core/manifest.js:529-536`), and the file is removed at `:539-545`
  regardless. That is today's behavior on `main` and is residual R-failed-unload
  under Table U.
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
| modify | src/scheduler/spawn.js | the four-branch precedence of Table A and the authority of Table B; refresh the JSDoc so it describes the new default. Export the authority predicate so `uninstall` uses the same one (Table U) rather than a second copy |
| modify | src/core/sandbox-guard.js | add `sameDir` to `module.exports` (`:115`). **Export only — no behavior change, no new function, no edit to `sameDir`, `physicalPath` or `sandboxMismatchWarning`** |
| modify | src/cli/uninstall.js | Table U's post-confirm sequence — reload + byte-compare against the disclosed snapshot, then the clearance gate — plus the `opts.probe` seam of Table T (Table U's ordering rows) |
| modify | tests/unit/scheduler-guard.test.js | cover the acceptance criteria below (the implementer designs the cases) |
| modify | tests/unit/uninstall.test.js | cover Table U/T's acceptance criteria, and give the existing callers what Table T's inventory says they need: `opts.probe` **with authority absent** on the 6 in-process calls, and the authority marker on the env of the 14 non-dry-run subprocess uninstalls **only**. Note `tempEnv()`'s `env` is shared with the in-process path via `Object.assign(process.env, env)` (`:278`), so the marker must not simply be added to it — Table T's separation row |
| modify | tests/integration/uninstall-core-e2e.test.js | `WIENERDOG_ALLOW_REAL_SCHEDULER: '1'` in its env builder (`:22-35`), for the one non-dry-run subprocess uninstall at `:88`. **Env addition only** — no test logic, no assertion changes |
| modify | scripts/smoke-install.sh | exactly two edits, both enumerated in Table C: (1) the probe-gated opt-in export; (2) the step-7 conditional — wrap step 7's body so it runs unchanged when the preflight was CLEAN, and on a non-CLEAN preflight prints one notice and skips the step's assertions. Nothing else in the file changes |

### Exact contracts

`schedulerSpawn`'s signature and return shape are **unchanged** — no new field,
no new parameter:

```js
/** @param {string[]} argv  e.g. ['launchctl','bootout','gui/501/ai.wienerdog.dream']
 *  @returns {{status:number, stdout?:string}} */
function schedulerSpawn(argv)
```

One export is added, because `uninstall` must ask the same question the
chokepoint asks and a second copy of the predicate would be free to drift from
it (ADR-0035's reuse-don't-duplicate lesson). Its shape carries what Table R's
second line needs, so the caller never re-runs a lookup that already threw:

```js
/** Table B, evaluated against `process.env` at call time. Never throws.
 *  @returns {{ok:boolean, core:string|null, home:string|null, error:string|null}}
 *    `ok` is the authority. `core`/`home` are the resolved absolute paths, or
 *    `null` when that lookup threw OR was never evaluated (arm 1 short-circuit);
 *    `error` is the failing lookup's message, or null. Callers read `core`/`home`
 *    only when `ok` is false — see Table B. */
function realSchedulerAuthority()
```

`uninstall`'s gate takes one new optional parameter, whose type is closed so that
neither a future refactor nor a malformed test double can turn "I could not tell"
into "clean":

```js
/** The live-domain probe (Table U step 2). SYNCHRONOUS by contract.
 *  @typedef {() => {status: 'clean'|'live', identifiers: string[]}} SchedulerProbe
 *    'clean' — the client was invoked, exited successfully, and reported no
 *              Wienerdog identifier. `identifiers` is empty.
 *    'live'  — it reported at least one; `identifiers` lists them, for the
 *              refusal message.
 *  There is no third success value: NOT-PROBEABLE is signalled by throwing.
 *  @param {string[]} argv
 *  @param {{probe?: SchedulerProbe}} [opts]  TEST-ONLY. No production caller
 *    passes it — see the call-site assertion in the verification steps. */
async function run(argv, opts = {})
```

| Probe outcome | Treated as |
|---|---|
| returns `{status:'clean', identifiers:[]}` | **CLEAN** — deletion clearance granted (Table U). This is the **only** shape that grants it |
| returns `{status:'live', identifiers:[…]}` | **LIVE** — abort, naming the identifiers |
| **throws** | **NOT-PROBEABLE** — abort (fail-closed) |
| returns a **thenable / Promise** | **NOT-PROBEABLE.** The contract is synchronous; a returned promise is malformed, not awaited. A gate that awaited an unexpected thenable could resolve after the decision it was supposed to inform |
| returns a **malformed** value — not an object, `status` not exactly `'clean'` or `'live'`, or `identifiers` not an array of strings | **NOT-PROBEABLE** |
| returns `{status:'clean'}` with a **non-empty** `identifiers`, or with `identifiers` absent | **NOT-PROBEABLE** — the **cross-field invariant**: `clean` is valid only with `identifiers.length === 0`. A result that says "nothing is live" while listing something live is internally contradictory, and the one reading that must never win is the permissive one. Validity is a property of the whole object, not of `status` alone |
| returns `{status:'live'}` with an absent or empty `identifiers` | **LIVE** — the abort still happens; the message says the identifiers were not reported. In the *aborting* direction the payload cannot soften the verdict |

The rule, stated so the two rows above do not read as a contradiction: **`status`
alone can never grant clearance, and the payload can never withdraw an abort.**
Granting requires the whole object to be coherent; aborting requires only
`status`. Every uncertain, malformed, hostile or self-contradictory case lands on
NOT-PROBEABLE, which Table U fails closed — so there is no input to this function
that produces a deletion the domain did not coherently clear.

What changes is which branch `schedulerSpawn` takes: Table A. Whether the
mutating branch is reachable: Table B. What it prints when it refuses: Table R.
What `uninstall` needs before deleting: Table U. How the gate stays testable:
Table T. What the smoke script does about it: Table C.

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

**Ordered, not independent.** The two arms are tried in this order and the first
that grants wins; nothing later can take that grant away. An earlier draft called
them independent *and* said any lookup throw means authority absent, which made
`WIENERDOG_ALLOW_REAL_SCHEDULER=1` plus a throwing `os.userInfo()` mean two
opposite things — and it disabled the escape hatch precisely in the degraded
environments where ADR-0041 names it as the correct authority.

| # | Arm | Rule | On success | On failure |
|---|-----|------|-----------|-----------|
| 1 | **Explicit opt-in** | `process.env.WIENERDOG_ALLOW_REAL_SCHEDULER === '1'` — **exact value, string comparison.** Not truthiness: `'0'`, `'false'`, `'no'` and `''` all mean *no grant*, because a variable people set to disable things must never enable the dangerous path | authority present, **short-circuit** — the coherence arm is **not evaluated**, so no lookup can throw and nothing about the environment can revoke the grant | fall through to arm 2 |
| 2 | **Home coherence** | `sameDir(getPaths().core, path.join(os.userInfo().homedir, '.wienerdog'))` — the core this run operates on IS the default core of the OS user whose per-user-global scheduler domain the argv would land in | authority present | authority absent → Table A row 4. A **throw** in either lookup disables *only this arm*; it is never treated as a failure of arm 1, which has already been decided |

| Fact / rule | Value |
|-------------|-------|
| Result shape | `{ok, core, home, error}` (the `realSchedulerAuthority()` export under "Exact contracts"). Arm 1 short-circuits to `{ok:true, core:null, home:null, error:null}` — `core`/`home` are `null` meaning **not evaluated**, which is safe because Table R only reads them when `ok` is `false`. Arm 2 returns `{ok, core, home, error}` with each path resolved or `null` where that lookup threw, and `error` set to the failing lookup's message (the first, when both threw) |
| Which Table R line | the evaluation-failure form fires **iff** `ok === false && error !== null`. `ok === true` prints nothing at all |
| Home source | `os.userInfo().homedir` — **never** `os.homedir()` and never `process.env.HOME`. Measured: `os.userInfo().homedir` ignores a redirected `HOME` on POSIX, which is the entire point; `os.homedir()` follows it and would make the check vacuous |
| Core source | `getPaths()` with no argument, so it reads `process.env` at call time (`src/core/paths.js:54-55`) |
| Comparison | `sameDir` from `src/core/sandbox-guard.js` — physical-identity comparison that tolerates a symlinked/case-aliased home and a core that does not exist yet (a first `init`) |
| Evaluation failure | scoped to arm 2 by the ordering above. A throw in either lookup (`getPaths` rejects an unsafe `WIENERDOG_HOME`; `os.userInfo()` can throw when the uid has no passwd entry) is caught, fails **that arm only**, and — when arm 1 did not already grant — produces row 4 plus Table R's *second* line, whose placeholders exist precisely because the failed lookup has no value to interpolate. Never crash the chokepoint, and never re-run a failing lookup to fill a blank |
| Not consulted | the install stance, `.git`, `packageRoot()`, TTY state, argv contents, the manifest, and anything under `<core>/app`. ADR-0041 records why each was rejected; do not add one |
| Platform note | if some platform derives `os.userInfo().homedir` from the environment, the predicate degrades to today's behavior (allow) — the mistake-guard simply stops guarding there. Verified on darwin only. This is a **limit of the guard, not a safety property**: see the Security checklist's named residual, and use the explicit opt-in in any environment where the account home is not independent of the sandbox |
| CI and containers | **no special case, and no CI-detection variable is read by `schedulerSpawn`.** A runner or container whose `HOME` **is** the passwd home (GitHub Actions' `/home/runner`, a Docker image running as root with `HOME=/root`) satisfies the coherence arm exactly like a workstation. A runner that *redirects* `HOME` — which is what `scripts/smoke-install.sh` does — does not, and reaches the mutating branch only through the opt-in that Table C grants on a probed-clean domain |
| Exact-value rule, and what it does NOT cover | the exact-`'1'` rule applies to variables that **grant** the dangerous capability. `WIENERDOG_LOADER_NOOP` and `WIENERDOG_TEST_NO_REAL_SCHEDULER` (Table A rows 1–2) keep their existing truthiness checks unchanged: they only ever *suppress* a real mutation, so a loose comparison there can only fail safe. Do not "harmonize" them |

### Table C — the smoke-install opt-in, granted by a probed-clean domain

The authority to touch the real scheduler is earned by **evidence**, not by an
execution context. `$CI` is not read here, in the script or anywhere else: it
identifies where a process runs, not whether that process shares a live scheduler
domain, and `CI=false` is non-empty.

| Fact / rule | Value |
|-------------|-------|
| Trigger | `scripts/smoke-install.sh` exports `WIENERDOG_ALLOW_REAL_SCHEDULER=1` **if and only if its own preflight returned CLEAN** — `WP-smoke-live-scheduler-preflight`'s Table A exit 0, meaning the scheduler client was invoked, exited successfully, and reported no `ai.wienerdog.*` / `wienerdog-*` identifier |
| Never on the other two arms | a LIVE (exit 1) or NOT-PROBEABLE (exit 2) result grants nothing — including when the run continues past that result because `WIENERDOG_SMOKE_I_KNOW=1` or `WIENERDOG_SMOKE_ALLOW_UNPROBEABLE=1` was set. **Overriding the preflight lets the lifecycle run; it does not hand it scheduler authority.** Such a run still hits Table A row 4 at every mutation and refuses |
| Value | the exact string `1`, matching Table B's exact-value rule |
| Where | anchored to the **post-dependency** tree: immediately after the preflight block's CLEAN outcome is known, and before the sandbox `export HOME=…` block (at `:28-32` on HEAD `a6e0803`, shifted down by whatever the dependency inserted). Anchor by the surrounding preflight/`export` lines, not by a line number |
| Local runs | stopped twice, independently: by the dependency's preflight, and — if that is deliberately overridden — by row 4 of Table A, because an overridden preflight grants no authority |
| `set -e` trap | the export must be written so that a non-CLEAN branch cannot kill the script under `set -euo pipefail` (a bare `cond && export …` returns 1 when `cond` is false) |
| Step 7 on a non-CLEAN leg — **the second authorized edit** | when the script's own preflight was **not** CLEAN it has no authority, so its `uninstall` hits Table U and aborts, which under `set -euo pipefail` would end the leg non-zero. The script therefore wraps step 7's body in a conditional on its own recorded preflight outcome. CLEAN → the body runs **byte-unchanged**, including its three `ok` calls and its `die`s. Non-CLEAN → one notice line is printed naming the reason, the `WD uninstall` call and the three assertions after it are skipped, and no `ok`/`die` runs. This is the same "best-effort and reported, never asserted" discipline the script already applies to registration (`.github/workflows/install-smoke.yml:11`) |
| Check-count consequence, both legs | CLEAN leg: `SMOKE PASS — N checks.` is exactly today's total. Non-CLEAN leg: three fewer, because step 7's three `ok` calls did not run. The total is **not** asserted anywhere; it is printed. Neither leg's number is pinned by this WP |
| Scope of the two edits | those two, and nothing else. No other step, assertion, helper or message is touched — the earlier blanket "everything else unchanged" row is gone because it contradicted this row, which is the edit that makes the non-CLEAN leg green |

**End-to-end, both CI legs.** The chain below is the whole answer to "what happens
on a runner that cannot query its scheduler", and it turns on one fact that must
be stated because nothing else in the tree states it:

| Fact / rule | Value |
|-------------|-------|
| Does a soft-refused registration record a `scheduler-entry`? | **Yes — manifest recording is unchanged by this WP.** The schedule *file* was still written, so it must still be recorded or `uninstall` would leave it behind, which would be a reversibility regression. Nothing about the refusal changes what `schedule.js` records. This question gated the round-1 design; it gates nothing now, because Table U was moved off the manifest onto live evidence |
| CLEAN leg (expected: `macos-latest`) | probe CLEAN → Table C grants authority → registrations are real → `uninstall` has authority, Table U's step 1 passes, no probe → step 7 asserts in full, exactly as today |
| NOT-PROBEABLE leg (possible: `ubuntu-latest`) | override lets the lifecycle run → no authority → every registration soft-refuses (files written and recorded, nothing loaded) → `uninstall`'s Table U finds authority absent, probes, and the probe is unanswerable too → fail-closed abort → the script's non-CLEAN branch reports it and skips step 7 → **leg green** |
| Guarantee that real registration is exercised somewhere | `WP-smoke-live-scheduler-preflight` gives `WIENERDOG_SMOKE_ALLOW_UNPROBEABLE` a **Linux-conditional value** on the one shared smoke step, which runs on both legs. A `macos-latest` runner therefore receives an empty value — no override — so if its launchd domain stops being queryable its preflight aborts and the job goes **red**. That is the "at least one leg probed CLEAN" assertion, implemented by the value rather than by new cross-job machinery. See that WP's Table B for why an `if:` cannot be used here |

### Table U — `wienerdog uninstall` requires deletion CLEARANCE before it deletes

**Two predicates, deliberately not the same one.** The round-2 draft called both
"authority" and then permitted a deletion without it, which an implementer could
only resolve by picking a side:

| Predicate | Means | Granted by |
|---|---|---|
| **scheduler authority** | permission to *mutate* the OS scheduler | Table B, and nothing else |
| **deletion clearance** | permission for `uninstall` to *delete* | scheduler authority **OR** a probe that answered CLEAN — an install with no live Wienerdog identifier has nothing to orphan |

Clearance is the weaker predicate and it is the one this table gates on. A
relocated-core uninstall on a machine with no live Wienerdog registration
proceeds; it is not asked for authority it does not need.

A soft refusal (Table A row 4) is right for `init` / `sync` / `schedule`: the
schedule **file** is still written, nothing is destroyed, and the next authorized
`sync` registers it. It is **wrong for `uninstall`**, which deletes the schedule
files and the manifest records that are the only remaining handle on a live
registration. Owner ruling (2026-08-31): `uninstall` checks up front and aborts
loudly rather than deleting.

**The gate is armed by live evidence, not by the manifest.** The round-1 draft
armed it on the presence of a `scheduler-entry` record; round 2 refuted that from
both channels. The manifest is untrusted, and a record can be missing while its
OS registration is live — stripped, hand-edited, written by an older format, or
lost to a partial earlier run. Absence of an untrusted record is not evidence
that no registration exists, and treating it as such *widens* destructive
behavior, which ADR-0038 forbids. So the gate asks the **domain** instead, with a
read-only probe for **Wienerdog's own identifiers** — the enumerate-your-own-good
shape, the same discipline as `WP-smoke-live-scheduler-preflight`'s probe, in
code.

| Fact / rule | Value |
|-------------|-------|
| Where | in `src/cli/uninstall.js`'s `run()`, **after** the `confirm()` at `:95-112` and **immediately before** the first deletion — the `manifestLib.reverse(…, { dryRun: false })` call at `:114` |
| Applies to | a **non-dry-run** `uninstall` only |
| **The full order** | `confirm` → **reload + compare** → **probe** (clearance) → `reverse(<accepted snapshot>)`. Three separate concerns in one place, deliberately not merged: consent integrity, then clearance, then deletion |
| Ordering vs. the confirm prompt — **after, not before** | clearance is evidence with a shelf life, and an interactive prompt has no bound on how long it is left open. Establishing it *before* the prompt lets a CLEAN answer go stale for as long as the user takes to reply: a concurrent authorized `sync` for the same core can register a job in that window, and the uninstall then proceeds on pre-prompt evidence, has its unloads refused for want of authority, and orphans the job it just learned nothing about. Deciding immediately before the first deletion shrinks the window from prompt-length to the milliseconds between the probe and `reverse()` |
| **Reload + compare (consent integrity)** | moving the clearance after the prompt is not licence to move the *plan* after it. The user consented to a specific disclosed list (`:59-60`, and the plan at `:101-102`); a concurrent `sync` or edit during the prompt could otherwise add entries that `reverse()` then deletes **undisclosed**. So after the confirm the manifest is re-read and compared against the exact disclosed snapshot: **identical → accept and proceed; different → abort** |
| Comparison basis | **byte-exact on the raw manifest file contents**, compared against the bytes the disclosure was rendered from. Not a field-by-field or semantic diff: any concurrent write at all should stop the run, and a byte compare has no equality semantics to get subtly wrong |
| Abort, not redisplay-and-reconfirm — **choice recorded** | the alternative (recompute, redisplay, ask again) was weighed and rejected: it needs a second consent state machine, and a concurrent writer can drive the loop indefinitely. Aborting with "the install changed while you were deciding; run `wienerdog uninstall` again" is simpler, and the rerun discloses the new plan from scratch — which is the same guarantee, reached without a loop |
| Reload failure at this point → **abort** | missing, unreadable, or unparseable at the reload point aborts. In particular `manifestLib.load` converts **ENOENT into an empty manifest** (`src/core/manifest.js:662-664`, `return { version: 1, createdAt, entries: [] }`), and that fallback **must not** be used here: an empty manifest would make `reverse()` replay nothing — no scheduler entry unloaded — while `disposeCoreMechanics` still ran its recursive cleanup, orphaning exactly what this table exists to protect. A manifest that vanished during the prompt is a *change*, not an empty install |
| What `reverse()` acts on | the **accepted snapshot** — the same bytes that were disclosed and confirmed. Nothing between the compare and `reverse()` re-derives a value: the snapshot object and the pre-confirm `vaultPath` (`:57`) are carried forward as they are, so no input to the deletion is newer than the consent |
| Not part of the clearance gate (keeps ADR-0038 true) | the compare is a **consent** check, not a safety check. It asks "is this still the plan the user approved", never "is it safe to delete" — that remains the live-domain probe's job alone. The manifest therefore still never serves as safety evidence, and the compare can only ever *stop* a deletion, which is ADR-0038's permitted direction |
| Consequence for the interactive-decline path | a user who answers `n` is never reloaded, compared or probed, because all three sit after the prompt. `tests/unit/uninstall.test.js:613` therefore declines exactly as it does today; it is covered by the subprocess authority marker anyway (Table T), which costs nothing and keeps every subprocess caller uniform |
| Step 1 — scheduler authority | evaluate Table B. Present → **clearance granted**, no probe, no change from today |
| Step 2 — probe (only when authority is absent) | call the `SchedulerProbe` (typed under "Exact contracts"): a **read-only** query of this user's live scheduler domain for Wienerdog's **own** identifiers — `ai.wienerdog.*` (launchd `gui/$UID`), `wienerdog-*` (systemd `--user`), the Wienerdog-named Task Scheduler tasks. Same rules as WP-A's probe: absolute client path, fixed-string matching, no mutation of any kind |
| Step 3 — decide clearance | `clean` → **clearance granted, proceed** (an install with no live own identifier has nothing to orphan; the gate must not brick it). `live` → **abort**. Throw, thenable, or malformed result → NOT-PROBEABLE → **abort**, per the fail-closed row below |
| Effect of an abort | throw a `WienerdogError` — for a failed compare, a failed reload, or a refused clearance alike. **Nothing is deleted and the manifest is untouched** — all three aborts precede `reverse()`, so no deletion has begun. A user who confirmed and is then refused has lost nothing but the prompt |
| Residual, already accepted | the probe-to-delete window does not close, it shrinks. That is the **same point-in-time contract** the owner accepted as **R-probe-race**, whose wording now names this window explicitly alongside the smoke preflight's. No lock and no serialization — both were weighed and rejected (ADR-0041's rejected options) |
| Message | names the live identifiers found (or that the domain could not be queried), the resolved core, and `WIENERDOG_ALLOW_REAL_SCHEDULER=1` as the deliberate way to proceed |
| Fail-closed on an unanswerable probe | a client that is absent, errors, or has no supported query counts as **possibly live** → abort. Justification: fail-open here is round-2's own defect one level down — absence of evidence read as evidence of absence. The asymmetry decides it: a wrong abort costs the user one command (the message names the exact variable, so nobody is ever permanently stuck), while a wrong proceed silently orphans a job that keeps firing |
| `--dry-run` | never aborts and never probes. It deletes nothing, so it prints its plan exactly as today |
| Manifest trust (ADR-0038) | the **clearance decision** never consults the manifest — clearance comes from authority or the live-domain probe, and nothing else. The command does read the manifest twice (disclosure, then the reload+compare), but only to decide *what the user approved*, never *whether deleting is safe*. Both readings can only stop a deletion, which is ADR-0038's permitted direction; neither can widen one |
| What is NOT changed | `reverseSchedulerEntry` (`src/core/manifest.js:501-545`), `manifestLib.reverse`, `reverse()`'s ordering, the three `schedulerSpawn` call sites, and Table A row 4's soft, non-throwing shape. The whole fix is one precondition at the command's entry |

**What this gate does and does not guarantee** — stated precisely, because the
round-1 draft's "all-or-nothing" claim was false:

| Claim | Status |
|-------|--------|
| No deletion happens without **deletion clearance** — scheduler authority, or a probe that positively answered CLEAN | **Guaranteed** by the rows above |
| A deletion that *does* proceed was preceded by a **successful** unload | **NOT guaranteed, and never was.** `reverseSchedulerEntry` ignores the unload's result (`src/core/manifest.js:529-536`) and deletes the file regardless, so a `launchctl`/`systemctl` failure, or a `WIENERDOG_LOADER_NOOP` neutralizer, still leaves an orphan. **Residual R-failed-unload, pre-existing:** this is today's behavior on `main`, unchanged by this WP in either direction. `wienerdog doctor` probes live registrations and is what surfaces such an orphan |
| An uninstall that proceeds on a CLEAN probe had **scheduler authority** | **Not claimed — deliberately.** Clearance and authority are different predicates (the table above). A CLEAN domain needs no permission to mutate, because there is nothing there to mutate |
| Transactional uninstall (propagate the unload result out of `reverseSchedulerEntry`, process scheduler entries before destructive file reversal, abort retaining recovery metadata on a non-zero or suppressed unload) | **Rejected here, not rejected in general.** It rewrites `reverseSchedulerEntry` and `reverse()`'s ordering — a different, larger change to a function this WP is explicitly forbidden to touch, and it would have to decide what a partially-reversed install looks like. It closes R-failed-unload and belongs to its own work package |

### Table T — how the gate stays unbypassable in production and hermetic in tests

This table answers **one** design question, and Table U's testability follows
from it rather than being patched case by case:

> How does a product-side safety gate stay unbypassable in production while
> every test caller — in-process **and** subprocess — reaches it hermetically?

The answer is that a caller has exactly two channels, they are different in kind,
and **neither of them is a "pretend the domain is clean" switch**:

| Caller class | Channel | What it does to the gate | Why it is not a bypass |
|---|---|---|---|
| **In-process** (`require(...).run(argv, opts)`) | the `opts.probe` **seam**, with **authority absent** | the gate still arms, still decides, but inspects the domain the test supplies | the test controls the *evidence*, not the *verdict*. The gate's decision is exactly what is under test |
| **Subprocess** (`node bin/wienerdog.js uninstall …`) | the **environment**, the only channel a subprocess has: `WIENERDOG_ALLOW_REAL_SCHEDULER=1` | Table B grants authority, so the gate is **never armed** — no probe, no query, no domain contact at all | authority is the real product predicate. The run genuinely *is* authorized; it is not being told a falsehood about the world |
| **Neither channel** (a test that sets up neither) | — | the gate refuses to answer (row below) | a forgotten seam fails deterministically instead of depending on the host |

**The two channels must not be mixed, and on this tree they would be by
accident.** `tests/unit/uninstall.test.js`'s `tempEnv()` returns one `env` object
that its subprocess helper passes to `execFileSync` **and** its in-process tests
splat into the live environment — `Object.assign(process.env, env)` at `:278`.
Putting the authority marker in that shared object would therefore grant
authority to the six in-process calls as well, the gate would never arm, and
their injected probes would be **dead seams** that keep passing after the
in-process path breaks. The channels are separated by where the marker is placed:

| Rule | Value |
|---|---|
| Where the marker may be set | **only on the env handed to a subprocess invocation.** It must not reach the object that in-process tests assign into `process.env` |
| In-process calls | run with `WIENERDOG_ALLOW_REAL_SCHEDULER` **absent**, so the gate arms and the injected `SchedulerProbe` is what decides |
| Observable invocation | an in-process test must assert its probe was **actually consulted** — a call count, not just a return value. A seam that is never called cannot be distinguished from a broken gate by its result alone, which is the failure this row exists to make impossible |

| Fact / rule | Value |
|-------------|-------|
| Seam | `run(argv, opts)` gains an optional `opts.probe`, defaulting to the real read-only query — the pattern `src/scheduler/status.js` already uses (`probeAll(paths, {probe, run})`, `:165-182`). `bin/wienerdog.js` keeps calling `run(rest)` with one argument and is **not** changed |
| Why a subprocess needs no seam, **measured** | granting authority skips the gate, and the mutation it then permits is *still* neutralized — because Table A puts both test neutralizers **ahead** of the authorized-spawn row. Measured on this tree: `ALLOW=1 + NOOP=1 + GUARD=1` → `status=0`, nothing spawned (row 1 wins); `ALLOW=1 + GUARD=1`, no NOOP → `WienerdogError` (row 2 wins); `ALLOW=1` alone → really spawns (row 3). Both uninstall test files spread `...process.env` (so `tests/run.js:7`'s suite-wide guard is inherited) **and** set `WIENERDOG_LOADER_NOOP: '1'` explicitly (`tests/unit/uninstall.test.js:26`, `tests/integration/uninstall-core-e2e.test.js:33`), so **row 1 is what actually fires**, with row 2 as the inherited backstop if NOOP were ever dropped. Adding the authority marker changes nothing about the real scheduler |
| Forgotten-seam determinism | when `WIENERDOG_TEST_NO_REAL_SCHEDULER` is set **and** the gate is armed (no authority) **and** no `opts.probe` was injected, the gate throws a dedicated *"a test reached the uninstall scheduler gate without injecting a probe or granting authority"* error **before any real query**. Deterministic on every machine, clean or not |
| The invariant that makes that safe | **`WIENERDOG_TEST_NO_REAL_SCHEDULER` is monotone in the safe direction: it can move the gate from *would query* to *refuse*, never from *abort* to *proceed*.** It is never read as evidence that the domain is CLEAN. This is why "the probe does not honor the test guard" (below) and "the test guard makes a seamless call fail" are the same rule, not two |
| Does the probe honor the guard as CLEAN? | **No, and it never can** — see the invariant above. The variable exists to stop a test from *mutating* the scheduler; ADR-0018 Decision 2 exempts read-only probes explicitly (`docs/adr/0018-windows-scheduled-dreaming.md:176`). Treating it as CLEAN would let a test variable silence a product safety gate in exactly the configuration that needs it |
| Does the probe route through `schedulerSpawn`? | **No.** That is the *mutation* chokepoint; a read must not enter it |
| Reconciliation with the leak-guard rule | `tests/unit/scheduler-leak-guard.test.js:752-756` holds that the product's neutralizer env vars must not silence the observer, because the leaking configuration would disable its own detector. Same reasoning, one step further: that observer is a **test-side detector**, this is a **product-side safety gate**, and both must be immune to the product's mutation-neutralizers. Neither channel in the table above silences anything — one supplies evidence, the other supplies authority |

**Measured caller inventory** (HEAD `a6e0803`; the counts a reviewer should
re-run, not take on trust):

| Where | Kind | Count | Sites |
|---|---|---|---|
| `tests/unit/uninstall.test.js` | in-process `run()` | **6** | `:284`, `:348`, `:364`, `:411`, `:427`, `:470` — all non-dry-run |
| `tests/unit/uninstall.test.js` | subprocess via its `run()` helper (`:51-58`) | **15** | `:81`, `:93`, `:104`, `:114`, `:124`, `:131`, `:141`, `:173`, `:185`, `:217`, `:241`, `:253`, `:496`, `:523`, `:643` — of which `:81` and `:185` are `--dry-run` and the other 13 are `--yes` |
| `tests/unit/uninstall.test.js` | subprocess via `spawnSync` | **1** | `:613`, no `--yes`, stdin `n\n` — an interactive decline. It declines *at* the confirm, so with the gate now sitting after it (Table U) this call never reaches the gate; it carries the marker anyway, so every subprocess caller stays uniform |
| `tests/integration/uninstall-core-e2e.test.js` | subprocess via its `run()` helper (`:39-46`) | **1** | `:88`, `--yes` |

So **14 non-dry-run subprocess uninstalls in the unit file and 1 in the
integration file** carry the authority marker — 14 of those 15 actually reach the
gate, the exception being `:613`, which declines at the confirm before the gate
runs and carries the marker only for uniformity. The 6 in-process calls take the
seam instead, with the marker **absent** (the separation rows above). Both files
are in the Deliverables.

### Table R — the refusal line (row 4's only output)

One line, written to stderr, terminated by `\n`. `<core>`, `<home>` and `<argv>`
are interpolated; `<argv>` is `argv.join(' ')`.

**Refusal because the namespaces differ** — both lookups succeeded:

```text
wienerdog: skipping a real OS-scheduler command — this run's core is <core>, not <home>/.wienerdog, and launchd/systemd/Task Scheduler names are per-user-global, so this would hit the live user's jobs. Not run: <argv>. Set WIENERDOG_ALLOW_REAL_SCHEDULER=1 to allow it.
```

**Refusal because an authority lookup failed** — Table B's evaluation-failure row.
This is a *separate* line, because the first one cannot be written: there is no
resolved `<core>` when `getPaths()` rejects `WIENERDOG_HOME`, and no `<home>`
when `os.userInfo()` throws. Re-running the failing lookup to fill the blank
would be the same throw again, so the contract names a stable placeholder
instead:

```text
wienerdog: skipping a real OS-scheduler command — could not establish which user's scheduler this run belongs to (core: <core-or-unavailable>, home: <home-or-unavailable>; <error>). Not run: <argv>. Set WIENERDOG_ALLOW_REAL_SCHEDULER=1 to allow it.
```

| Fact / rule | Value |
|-------------|-------|
| Stream | `process.stderr.write` — never stdout, which `schedulerSpawn`'s callers read as scheduler-client output |
| Frequency | exactly one line per refused call, whichever form. No de-duplication, no module-level state: each refused argv is named |
| Which form | the second form is used **iff** at least one authority lookup threw. Exactly one of the two is written; they are never combined |
| Placeholder | a value that could not be resolved renders as the literal string `<unavailable>` — not an empty string, not `undefined`, not a partially-built path. Each of `<core-or-unavailable>` and `<home-or-unavailable>` is independently either the resolved absolute path or `<unavailable>` |
| `<error>` | the failing lookup's `message`, or the first one's when both threw. A message, never a stack |
| Never throws | producing either line, including the placeholder path, cannot itself throw. Table B's evaluation-failure row and this row are one contract: an unresolvable environment yields a refusal *with a diagnostic*, never a propagated error |
| Required substrings (what tests assert) | in **both** forms: `WIENERDOG_ALLOW_REAL_SCHEDULER` and `argv.join(' ')`. In the first form additionally the resolved core path; in the second, the literal `<unavailable>` for each value that failed to resolve |

### Mirrored Surface Checklist

- [ ] Deliverables-table cells (each row names the table it implements)
- [ ] Acceptance criteria that assert Tables A, B, C, U, T and R
- [ ] Verification commands (rows 3 and 4, the exact-value arm, the Table B
      ordering arm, the Table R evaluation-error arm, Table C's structural gates,
      and Table T's call-site gate)
- [ ] **Table T's measured caller inventory** — the counts and line numbers are
      the single source for which test call sites need the seam and which need
      the authority marker; the Deliverables rows for both test files and the
      Current-state paragraph both defer to it rather than restating counts
- [ ] The `SchedulerProbe` type and its outcome table under "Exact contracts" —
      Table U's step 3 cites it instead of re-listing the malformed cases
- [ ] Current-state description (today's three branches and the measured row-3 leak)
- [ ] "Exact contracts" — the unchanged signature and return shape
- [ ] Implementation notes (the require-cycle note, the `set -e` trap, and the
      `reverseSchedulerEntry`-is-why-Table-U-exists bullet)
- [ ] Security checklist — three things that move together with the tables: the
      mistake-guard-not-security-control scoping, the same-pathname namespace
      residual, and the ADR-0028 amendment §3 rule-not-engaged statement (the
      Context section carries the last one too)
- [ ] **`WP-smoke-live-scheduler-preflight`'s Table A** — Table C consumes its
      CLEAN/LIVE/NOT-PROBEABLE exit codes, so a change to either moves both
- [ ] **ADR-0041's Decision items and its Consequences bullets** — they state
      Table B's predicate, Table A's refusal shape, Table U's uninstall rule and
      the same scoping and residual as the Security checklist. Editable only while
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
- **`reverseSchedulerEntry` is not changed — and that is exactly why `uninstall`
  needs Table U.** It wraps its `schedulerSpawn` call in `try/catch` and ignores
  the result (`src/core/manifest.js:529-536`), and row 4 throws nothing, so a
  refused unload would be invisible to it and the file deletion would proceed
  anyway. Left alone, that turns a refusal into an **orphaned live job whose
  recovery metadata has just been deleted**. The fix is *not* to make row 4 throw
  (that would abort `init` and `sync` too, and `reverseSchedulerEntry` would
  swallow it regardless); it is Table U's precondition at the command entry. Do
  not modify it, and do not add a return-value check to it — the *failed*-unload
  case that same swallowing also permits is residual R-failed-unload, named under
  Table U and deliberately left where it already is.
- **Why this stays one work package, at the top of M.** Six files and roughly 90
  lines of new non-test code is within `docs/specs/README.md`'s M heuristics, but
  it grew across two review rounds and the sizing question is worth answering
  rather than leaving to drift. It is not split off at the `uninstall` gate
  because splitting would ship an intermediate state that is *worse than either
  end*: a merged chokepoint inversion without Table U is exactly the
  refused-unload-then-delete orphan the round-1 and round-2 gates found. The two
  land together or not at all. If a reviewer judges this over-sized, the correct
  response is to send it back to the architect, not to implement half of it.
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
- [ ] **This is a mistake-guard, not a security control, and not a namespace
      prover** (ADR-0041). What it defends against is the developer accident: a
      run that redirected `HOME` into a temp directory and forgot that `gui/$UID`
      is not a file. It does not defend against an adversary — the same user can
      set `WIENERDOG_ALLOW_REAL_SCHEDULER`. Nothing in `docs/THREAT-MODEL.md`
      changes, and no claim of protection may be written into code comments, the
      refusal line, or the PR.
- [ ] **Named residual — same-pathname namespace bridging.** Home-path equality
      is evidence of coherence, not proof of it. An environment that presents its
      own filesystem at the passwd home's pathname (a container or chroot with
      `/home/<user>/.wienerdog` of its own) while still reaching the host user bus
      or launchd domain satisfies `sameDir` and is granted authority. Likewise a
      platform whose `os.userInfo().homedir` follows an environment-controlled
      profile directory. **Both are outside what this rule defends**, and the
      correct authority for such an environment is the explicit opt-in.
- [ ] **Do not add detection for that residual.** No probe of mount namespaces,
      bus addresses, container markers or filesystem identity, and **no contract
      test for same-path/different-namespace operation**. That is the
      enumerate-the-bad shape ADR-0035 records as producing findings two through
      six rather than closing one; the residual is closed by scoping the claim,
      which the two items above do.
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
- [ ] Table B's exact-value rule: `WIENERDOG_ALLOW_REAL_SCHEDULER` set to `0`,
      `false`, `no` or the empty string does **not** grant authority; only the
      exact string `1` does.
- [ ] Table B's evaluation-failure row: an environment that makes an authority
      lookup throw (an unsafe `WIENERDOG_HOME`; a uid with no passwd entry)
      produces a refusal, not an exception out of `schedulerSpawn`.
- [ ] Table B's ordering: `WIENERDOG_ALLOW_REAL_SCHEDULER=1` grants authority
      **even when a coherence lookup would throw** — the opt-in short-circuits and
      the coherence arm is never evaluated. Tested with each lookup failing and
      with both failing; in every case the call spawns and nothing is printed.
- [ ] Table R: a refusal writes exactly one line to stderr — never two, never
      none — containing `WIENERDOG_ALLOW_REAL_SCHEDULER` and the joined argv, and
      writes nothing to stdout.
- [ ] Table R's two forms are distinguishable and correctly selected: with both
      lookups succeeding, the line carries the resolved core path; with a lookup
      failing, it carries the literal `<unavailable>` in that value's place plus
      the lookup's error message, and no partially-built path.
- [ ] Both default loaders inherit the behavior unchanged:
      `src/cli/schedule.js`'s `defaultLoader` and `src/scheduler/generators.js`'s
      `defaultCatchupLoader` refuse and throw under the same conditions as the
      chokepoint itself.
- [ ] `src/core/sandbox-guard.js`'s diff against `main` is **exactly one changed
      line** (one insertion, one deletion — the `module.exports` line gaining
      `sameDir`), asserted by the numstat gate in the verification steps.
      `sandboxMismatchWarning`, `sameDir` and `physicalPath` are behaviorally
      untouched.
- [ ] Table U, abort: with authority absent and the probe reporting a live
      Wienerdog identifier, `wienerdog uninstall --yes` exits non-zero naming the
      live identifier and `WIENERDOG_ALLOW_REAL_SCHEDULER`, and **nothing is
      deleted** — every file the manifest records still exists and the manifest
      itself is byte-identical afterwards.
- [ ] Table U, **the round-2 case**: the same abort happens when the manifest
      carries **no** `scheduler-entry` record at all while the probe still reports
      a live identifier. The gate's decision must not change when manifest records
      are stripped, stale, or in an older format.
- [ ] Table U, proceed: with authority absent and the probe answering with no
      live Wienerdog identifier, uninstall completes normally.
- [ ] Table U, fail-closed: with authority absent and the probe unable to answer
      (absent client, erroring client, unsupported platform), uninstall aborts and
      deletes nothing.
- [ ] Table U, authority present: uninstall completes normally and **does not
      probe at all**.
- [ ] Table U's `--dry-run`: never aborts, never probes, never reloads or
      compares, prints its plan and deletes nothing under every combination above.
- [ ] Table U's reload + compare: when the manifest's bytes change between the
      disclosure and the confirm, `uninstall` **aborts and deletes nothing**,
      telling the user to rerun. The entry that appeared during the prompt is
      never deleted, and neither is anything that was disclosed.
- [ ] Table U's reload failure: when the manifest is **missing** at the reload
      point, `uninstall` aborts — it must **not** take `manifestLib.load`'s
      ENOENT-to-empty path (`src/core/manifest.js:662-664`) and proceed to
      mechanics cleanup having replayed no scheduler entry. An unreadable or
      unparseable manifest at that point aborts the same way.
- [ ] Table U's accepted snapshot: when the compare passes, `reverse()` acts on
      the **disclosed** bytes, and no value it or `disposeCoreMechanics` consumes
      is re-derived after the confirm.
- [ ] The compare runs **before** the probe, and a run that aborts on the compare
      never probes the domain at all.
- [ ] Table U's clearance/authority split: an uninstall with **no** scheduler
      authority whose probe answers CLEAN **completes**; the same run whose probe
      answers `live` aborts. Clearance, not authority, is what gates deletion.
- [ ] The probe type contract: a probe that **throws**, that returns a
      **thenable/Promise**, or that returns a malformed value (not an object,
      `status` outside `'clean'|'live'`, `identifiers` not an array of strings)
      is treated as NOT-PROBEABLE and **aborts**. No such input can produce a
      deletion.
- [ ] Both contradictory-payload cases, explicitly: `{status:'clean',
      identifiers:['ai.wienerdog.dream']}` and `{status:'clean'}` with
      `identifiers` absent **abort** as NOT-PROBEABLE (the cross-field
      invariant); `{status:'live'}` with absent or empty `identifiers` **aborts**
      as LIVE. Granting needs the whole object coherent; aborting needs only
      `status`.
- [ ] Table T, in-process channel: `run(argv, opts)` accepts an injected
      `opts.probe`; `bin/wienerdog.js` still calls `run(rest)` with one argument
      and is not edited.
- [ ] Table T, subprocess channel: with `WIENERDOG_ALLOW_REAL_SCHEDULER=1` set in
      the environment, the gate is never armed — **no probe function is called**
      and no scheduler query is made.
- [ ] Table T, forgotten-seam determinism: with
      `WIENERDOG_TEST_NO_REAL_SCHEDULER` set, no authority, and no injected probe,
      `uninstall` throws the dedicated "must inject a probe or grant authority"
      error **before** any real query — on a clean machine and a machine with live
      registrations alike, so the outcome does not depend on the host.
- [ ] Table T's monotonicity invariant: there is no combination of
      `WIENERDOG_TEST_NO_REAL_SCHEDULER` and `WIENERDOG_LOADER_NOOP` that makes
      the gate **proceed** where it would otherwise abort. Neither is ever read as
      evidence that the domain is CLEAN.
- [ ] Table T's call-site rule: no production caller passes `opts` to
      `uninstall`'s `run` — asserted by the call-site gate in the verification
      steps, which enumerates the production call sites that exist.
- [ ] `npm test` passes on a machine **with** live `ai.wienerdog.*` registrations
      and performs no real scheduler query from any uninstall test — the six
      in-process calls inject a probe, the fifteen non-dry-run subprocess calls
      carry the authority marker (Table T's inventory).
- [ ] Table C: `scripts/smoke-install.sh` contains the opt-in export exactly once,
      it is not an unconditional top-level `export`, and the script reads no `CI`
      variable; the script still parses and passes `shellcheck`.
- [ ] Table C's step-7 conditional, on a **forced NOT-PROBEABLE** preflight:
      exactly one notice line is printed, `WD uninstall` is not invoked, none of
      step 7's three `ok` calls run, and no `die` fires.
- [ ] Table C's step-7 conditional, on a **CLEAN** preflight: step 7 runs
      byte-unchanged — `WD uninstall` is invoked and all three `ok` calls run —
      and the printed total equals today's.
- [ ] The two printed `SMOKE PASS — N checks.` totals differ by **exactly 3**.
- [ ] Both forced-branch runs were executed with `WIENERDOG_LOADER_NOOP=1` and a
      `PATH`-first logging shim for the four bare-name loader commands, and the
      shim log is **empty** afterwards — no real scheduler client was invoked by
      either run.
- [ ] `npm test` and `npm run lint` pass, with no test disabled or skipped, and
      none given an environment variable to paper over a failing assertion. The
      subprocess authority marker (Table T) is **not** an exception to that rule
      and should not be read as one: it is not a switch that suppresses a check,
      it is the product's real authority predicate, supplied through the only
      channel a subprocess has, to a run that genuinely is authorized. The
      distinction is testable — it grants the *same* thing a user grants, and it
      is forbidden on the in-process path precisely because there the seam, not
      the variable, is the correct channel.
- [ ] Idempotence: **N/A — this WP changes one in-process decision; it ships no
      command and writes nothing outside the repo.**

## Verification steps (run these; paste output in the PR)

**Every arm captures its exit code as its own statement (`rc=$?`) immediately
after the command that produced it, and asserts it before anything else runs.**
A trailing `echo "exit=$?"` or `rm -rf …` consumes the status and makes the whole
sequence succeed regardless of what the command did — the failure mode the
round-1 shadow review found in the previous draft of this block.

```bash
npm test
npm run lint
bash -n scripts/smoke-install.sh && shellcheck --severity=warning scripts/smoke-install.sh

# The chokepoint is still ONE chokepoint: exactly three call sites under src/.
test "$(grep -rn 'schedulerSpawn(' src/ | grep -vc 'function schedulerSpawn')" = 3

# --- Table A rows 3 and 4 -------------------------------------------------
# A harmless argv — `true` — so every arm below is safe to run on a machine with
# a live install: nothing scheduler-related is ever spawned. Do NOT substitute a
# real scheduler command.
SPAWN='const {schedulerSpawn}=require("./src/scheduler/spawn");process.exit(schedulerSpawn(["true"]).status===0?0:1)'

# Row 4 (the fix): temp HOME, no marker → refuses, so node exits non-zero.
# BEFORE this change this exits 0 (measured on a6e0803: it really spawned).
TMPH="$(mktemp -d)"
env -u WIENERDOG_TEST_NO_REAL_SCHEDULER -u WIENERDOG_LOADER_NOOP \
  -u WIENERDOG_ALLOW_REAL_SCHEDULER HOME="$TMPH" node -e "$SPAWN"
rc=$?; rm -rf "$TMPH"; test "$rc" -ne 0

# Row 3, opt-in arm: the same call with the exact marker really spawns.
TMPH="$(mktemp -d)"
env -u WIENERDOG_TEST_NO_REAL_SCHEDULER -u WIENERDOG_LOADER_NOOP \
  WIENERDOG_ALLOW_REAL_SCHEDULER=1 HOME="$TMPH" node -e "$SPAWN"
rc=$?; rm -rf "$TMPH"; test "$rc" -eq 0

# Table B exact-value rule: '0' is NOT authority — this must still refuse.
TMPH="$(mktemp -d)"
env -u WIENERDOG_TEST_NO_REAL_SCHEDULER -u WIENERDOG_LOADER_NOOP \
  WIENERDOG_ALLOW_REAL_SCHEDULER=0 HOME="$TMPH" node -e "$SPAWN"
rc=$?; rm -rf "$TMPH"; test "$rc" -ne 0

# Row 3, coherence arm: real HOME, no marker — a legitimate install still spawns.
env -u WIENERDOG_TEST_NO_REAL_SCHEDULER -u WIENERDOG_LOADER_NOOP \
  -u WIENERDOG_ALLOW_REAL_SCHEDULER node -e "$SPAWN"
rc=$?; test "$rc" -eq 0

# Table R, evaluation-error arm: an unsafe WIENERDOG_HOME makes getPaths() throw.
# schedulerSpawn must still REFUSE rather than propagate — non-zero, no throw.
TMPH="$(mktemp -d)"
env -u WIENERDOG_TEST_NO_REAL_SCHEDULER -u WIENERDOG_LOADER_NOOP \
  -u WIENERDOG_ALLOW_REAL_SCHEDULER HOME="$TMPH" WIENERDOG_HOME='relative/not/absolute' \
  node -e "$SPAWN"
rc=$?; rm -rf "$TMPH"; test "$rc" -ne 0

# Table B ordering: the SAME broken environment WITH the opt-in must SPAWN — the
# opt-in short-circuits, so no coherence lookup runs and none can revoke it.
# This is the cell the round-1 draft got wrong in both directions at once.
TMPH="$(mktemp -d)"
env -u WIENERDOG_TEST_NO_REAL_SCHEDULER -u WIENERDOG_LOADER_NOOP \
  WIENERDOG_ALLOW_REAL_SCHEDULER=1 HOME="$TMPH" WIENERDOG_HOME='relative/not/absolute' \
  node -e "$SPAWN"
rc=$?; rm -rf "$TMPH"; test "$rc" -eq 0

# --- Table C (structural; the behavioral half runs in CI, see below) -------
# The export exists exactly once and is NOT unconditional: no top-level
# `export WIENERDOG_ALLOW_REAL_SCHEDULER` line. Guarded on the file existing so
# an absent deliverable reads red, not green.
test -f scripts/smoke-install.sh
test "$(grep -c 'WIENERDOG_ALLOW_REAL_SCHEDULER' scripts/smoke-install.sh)" = 1
test -f scripts/smoke-install.sh && ! grep -qE '^export WIENERDOG_ALLOW_REAL_SCHEDULER' scripts/smoke-install.sh
# …and no CI sniff was introduced anywhere in the script.
test -f scripts/smoke-install.sh && ! grep -qE '\$\{?CI[:}]' scripts/smoke-install.sh

# --- sandbox-guard.js is EXPORT-ONLY: one line added, one removed ----------
test "$(git diff --numstat main -- src/core/sandbox-guard.js | cut -f1)" = 1
test "$(git diff --numstat main -- src/core/sandbox-guard.js | cut -f2)" = 1

# --- Table T call-site gate: no production caller can pass opts -------------
# Enumerate-your-own-GOOD. Two facts, both measured on a6e0803 and both red if a
# second argument ever appears:
#   (1) src/cli/uninstall is required from exactly ONE production place — the
#       dispatch table in bin/wienerdog.js.
#   (2) that dispatch table is invoked with exactly ONE argument.
# NOTE: a blanket "no .run( takes two args" check would be FALSE on this tree —
# src/gws/index.js:117,148 and src/cli/init.js:182 legitimately pass options.
# The gate is scoped to uninstall's reachability instead.
test "$(grep -rhoE "require\('[^']*cli/uninstall'\)" bin/ src/ | wc -l | tr -d ' ')" = 1
grep -qE '^[[:space:]]*await loader\(\)\.run\(rest\);[[:space:]]*$' bin/wienerdog.js
```

- Every command above is an ASSERTION: it exits non-zero on failure rather than
  printing a value someone has to judge. Paste a real green on the finished state
  AND a real red from a deliberately broken state for each. Ready-made red
  states: row 4 — the pre-change tree already provides it (it exits 0 today,
  measured); the coherence arm — temporarily swap `os.userInfo().homedir` for
  `os.homedir()`; the exact-value arm — loosen the comparison to truthiness; the
  Table R arm — let the `getPaths()` throw propagate; Table C — remove the
  export, or make it unconditional; the numstat gates — add one throwaway line to
  `sandbox-guard.js`.
- **The Table B ordering arm passes on the pre-change tree too** (measured: it
  exits 0 today, because no gate exists yet), so its green is not evidence on its
  own. Its red state is specific and must be pasted: evaluate the coherence arm
  before or regardless of the opt-in — the round-1 draft's behavior — and the
  `getPaths()` throw makes authority absent and the call refuses. That is the
  contradiction round 2 found; the arm exists to keep it from coming back.
- **Table U (uninstall) is verified by `npm test`, not by a shell command here.**
  Its observable contract is in the acceptance criteria; the implementer writes
  the cases. A *manual* reproduction — pointing a real `wienerdog uninstall` at a
  manifest carrying a `scheduler-entry` — is **safe only after this WP is
  implemented** (before it, the unload argv reaches the live domain), so it is
  not a "before" measurement and is not required.
- **Table C's export gating is proven by CI on this PR**, because the only way to
  exercise the export end to end is to run the full smoke lifecycle. The
  `install-smoke` workflow runs it on a clean runner: paste the step's log showing
  either real registration attempts (a CLEAN-probing runner, which granted
  authority) or Table R refusal lines (a NOT-PROBEABLE runner, which did not).
  Either outcome confirms the gating; a run showing real registration on a runner
  whose probe was *not* CLEAN is a failure.
- **Table C's step-7 conditional is proven LOCALLY and DETERMINISTICALLY, because
  CI cannot be relied on to reach it.** If both hosted runners happen to probe
  CLEAN, the non-CLEAN branch never executes and could ship broken — surfacing
  only later, on the unprobeable runner it exists for. Force both branches with
  the technique this family already uses for `WP-smoke-live-scheduler-preflight`'s
  exit-2 arm: temporarily point the probe's client constant at a path that cannot
  answer (→ NOT-PROBEABLE), and at a stub that exits 0 printing nothing (→ CLEAN).
  Both are local edits, reverted after the observation; **no product code, no new
  variable and no new seam is added for them**. Run the script once per branch and
  paste both outputs, asserting:

  | Branch | Must hold |
  |---|---|
  | forced **NOT-PROBEABLE** (with `WIENERDOG_SMOKE_ALLOW_UNPROBEABLE=1` so the preflight proceeds) | exactly **one** notice line; `WD uninstall` is **not** invoked; **zero** of step 7's three `ok` calls run; no `die` |
  | forced **CLEAN** | step 7 runs byte-unchanged: `WD uninstall` invoked, **all three** `ok` calls run, and the printed total equals today's |
  | the pair | the two printed `SMOKE PASS — N checks.` totals differ by **exactly 3** |

  **Both forced runs are executed with `WIENERDOG_LOADER_NOOP=1`, and neither may
  be run without it.** A forced CLEAN result is a *fabricated* CLEAN: it makes
  Table C export the authority marker, which selects Table A's real-spawn branch
  even though `HOME` is redirected — so on a maintainer machine the run would
  replace and bootout the live `ai.wienerdog.*` identifiers. That is issue #169,
  reproduced by its own verification step. `WIENERDOG_LOADER_NOOP` neutralizes it
  because it is Table A **row 1**, ahead of both the test guard and the
  authorized-spawn row — measured in Table T (`ALLOW=1 + NOOP=1 + GUARD=1` →
  `status=0`, nothing spawned). Assert that neutralization rather than trusting
  it: put a temp dir first on `PATH` holding logging stand-ins for the bare-name
  loader commands the chokepoint can invoke (`launchctl`, `systemctl`, `loginctl`,
  `schtasks` — the set `tests/scenarios/scheduler-guard.js:52` already names), and
  require the log to be **empty** after both runs. The smoke preflight is
  unaffected by that `PATH`: it invokes its client by absolute path by contract.

  **Standing prohibition: a fabricated CLEAN probe result must never be run with
  real mutation enabled**, on any machine, for any reason.

  The NOT-PROBEABLE arm carries the same neutralization even though it earns no
  authority and would refuse every mutation on its own. That is deliberate: a
  verification procedure must not depend on the correctness of the thing it is
  verifying. If the step-7 conditional or Table C's gating is implemented wrong,
  the non-CLEAN run is exactly where that shows up — and it must show up as a
  failed assertion, not as a destroyed agent. One rule for both arms, no exception
  to remember.

  Run these only after the row-4 and Table C structural arms above are green.

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
  `docs/GLOSSARY.md`, or `README.md`. **Owner ruling D3 (2026-08-31):** the
  `WIENERDOG_HOME`-relocated install is a **named residual**, not a code special
  case. Such an install sets `WIENERDOG_ALLOW_REAL_SCHEDULER=1` for *every*
  scheduler-touching command — `init`, `sync`, `update`, `schedule add/remove`
  and `uninstall`, not only the first `init` — and documenting that is a follow-up
  work package, not this one. Do not add a branch for it.
- Teaching `wienerdog doctor` to report a refusal. It already probes live
  registrations and reports missing ones.
- Any change to the three `schedulerSpawn` call sites, to `repointSchedules`, to
  `reverseSchedulerEntry`, or to the catch-up teardown. `uninstall` is fixed at
  its own entry (Table U), not inside them.
- Making Table A row 4 throw, or adding a return-value check to
  `reverseSchedulerEntry`. Owner ruling D2 (2026-08-31): the soft refusal stays
  for `init` / `sync` / `schedule`, and `uninstall` is fixed by a precondition.
- **Transactional uninstall** — propagating the unload result out of
  `reverseSchedulerEntry`, reordering `reverse()` to process scheduler entries
  before destructive file reversal, or aborting mid-reversal while retaining
  recovery metadata. That closes residual R-failed-unload and is its own work
  package; doing it here would rewrite a function this WP is forbidden to touch.
- Changing what `schedule.js` records in the manifest for a refused registration.
  Recording is unchanged (Table C), and the schedule file must stay recorded or
  `uninstall` would leave it behind.
- Adding a per-user scheduler lock, or re-verifying domain ownership immediately
  before each destructive operation. That is `WP-smoke-live-scheduler-preflight`'s
  named residual R-probe-race, owner-accepted; the probe's contract is
  point-in-time.
- Detecting mount namespaces, container markers, bus addresses or filesystem
  identity, and writing a contract test for same-path/different-namespace
  operation. The Security checklist records why (the residual is closed by
  scoping the claim, not by enumerating the bad).

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
