---
id: WP-155
title: Delete the test-exec environment seams from production dispatch (DI + pinned fakes); keep every dispatch shell:false
status: In-Review
model: opus
size: M
depends_on: [WP-154]
adrs: [ADR-0004, ADR-0028]
branch: wp/155-inert-test-exec-seams
---

# WP-155: Delete the test-exec env seams; DI + pinned-fake front door; shell:false invariant (audit A7, part 2 of 6)

## Context (read this, nothing else)

Wienerdog's scheduled job dispatch carries **four** test-only environment seams
that let a test substitute or bypass what a job runs. Two pick the executable a
job runs: `WIENERDOG_RUNJOB_CMD` (in `src/cli/run-job.js` `resolveCommand`) and
`WIENERDOG_DREAM_CMD` (in `src/core/dream/brain.js` `spawnBrain`). Two more
gate/redirect the **pre-dream containment probe**: `WIENERDOG_SKIP_CONTAINMENT_PROBE`
(in `src/cli/dream.js`, skips the probe) and `WIENERDOG_CONTAINMENT_PROBE_CMD`
(in `src/core/dream/containment-probe.js`, redirects the probe's `claude` spawn).
All four are test hooks living in the **production** dispatch path. **IRON RULE
(ADR-0004): Wienerdog is just files** — nothing it ships should turn an
environment variable into arbitrary code (or into *disabling a security check*)
at 03:30. This WP is A7's smallest hardening (audit finding **F5**).

> The original b4fb865 rework of this WP deleted only the first two seams and
> deliberately **kept** `WIENERDOG_SKIP_CONTAINMENT_PROBE` /
> `WIENERDOG_CONTAINMENT_PROBE_CMD` as the probe's test path. The A7 walkthrough
> owner **rejected** that (see the probe-seam amendment below): a production
> security check that can be disabled or redirected by an env var is the **same
> disease** as an exec seam. The probe seams now go with the other two.

Two problems in the code today. First, the `WIENERDOG_RUNJOB_CMD` seam returns
`{command: fake, args: [], shell: true}` — a **shell:true** dispatch, the only
one in the scheduler, so a set env var becomes an arbitrary *shell* command
line. Second, both seams are honored **unconditionally in production**: anyone
who can set the var in the environment the scheduled `run-job` inherits gets
execution as the user.

**The original design for this WP is ABANDONED. RESOLVED (OWNER-APPROVED
2026-07-18, A7 walkthrough):** the earlier plan — gate both seams behind an
explicit `WIENERDOG_TEST=1` flag so they are inert in a production install — is
**rejected as circular**. The gate variable and the attack variable live in the
**same place**: any attacker who can set `WIENERDOG_RUNJOB_CMD` /
`WIENERDOG_DREAM_CMD` in the scheduled job's environment can set
`WIENERDOG_TEST=1` with the **same capability** (e.g. one systemd
`~/.config/environment.d/*.conf` write — an in-boundary scoped write for A7).
Gating an env-var attack behind another env var is not a boundary; it is
security theatre that also leaves a live `shell:true` code path.

**The approved design: DELETE both test-exec env seams from production code
entirely.** A production dispatch path must contain **zero** branches that read
a test env var to choose what to execute. Tests keep working through two
*non-attacker-reachable* mechanisms:

1. **Dependency injection for `run-job`.** The `WIENERDOG_RUNJOB_CMD` env read is
   removed. The tests that used it already invoke `run-job` **in-process** with
   injected `opts` (`loader`, `sendAlert`, `profile`, …); the fake command
   becomes one more injected `opts` — a JS-only seam reachable only by a JS
   caller, exactly like the existing `opts.profile` (the CLI entry never passes
   one, so production stays frozen). The `shell:true` branch dies with the seam;
   afterward there is **no** `shell:true` dispatch anywhere in the scheduler path.

2. **The WP-154 pinned front door for the dream brain.** The `WIENERDOG_DREAM_CMD`
   env read is removed. Subprocess-level dream tests install their fake brain
   **legitimately** in their own temp `WIENERDOG_HOME`: a pin store
   (`exec-pins.json`, WP-154's schema) whose `claude`/`codex` pin points at the
   fake executable. The **real** dispatch path (`spawnPinned*` internally:
   `loadPins → verifyPin → bindInterpreter → spawn`) then runs **unmodified**, and
   full pin-path integration coverage falls out for free. **[R13]** Consumer sites
   call the encapsulated `spawnPinnedSync`/`spawnPinned`; `resolvePinnedSpawn`/
   `bindInterpreter` are module-internal to `exec-identity.js`.

3. **Dependency injection for the containment probe (probe-seam amendment).**
   The `WIENERDOG_SKIP_CONTAINMENT_PROBE` and `WIENERDOG_CONTAINMENT_PROBE_CMD`
   env reads are removed. `dream.run(argv)` gains a **test-only** second argument
   `opts` (same injected-dependency idiom this WP already establishes for
   `run-job`'s `opts.resolveCommand`): `opts.skipContainmentProbe` (boolean,
   replaces the env skip) and `opts.probeCmd` (forwarded to
   `runContainmentProbe`'s existing `opts.probeCmd` DI seam, replaces the env
   redirect). The CLI entry never passes `opts` (`bin/wienerdog.js` calls
   `run(rest)` with argv only), so **production always runs the probe and can
   never skip or redirect it** — there is no env knob left to do so.

> **RESOLVED (OWNER-APPROVED 2026-07-18, A7 walkthrough) — the probe env seams
> go too.** The b4fb865 rework kept `WIENERDOG_SKIP_CONTAINMENT_PROBE` as the
> test path for skipping the pre-dream containment probe and left
> `WIENERDOG_CONTAINMENT_PROBE_CMD` untouched. The owner **rejected** that: it is
> the **same circularity disease** as the abandoned `WIENERDOG_TEST` gate —
> production security behavior (whether the containment self-check runs, and what
> binary it probes) branching on an env var an in-boundary scoped write can set.
> **Feasibility (verified against the code):** every probe-relevant test already
> drives `dream` **in-process** — `tests/integration/dream.test.js`'s `runDream`
> helper mutates `process.env` and calls `dream.run(argv)` directly, and
> `tests/integration/adopt-e2e.test.js` calls `dream.run(['--yes'])` in-process
> — so a JS-only `opts` argument reaches every one of them with no subprocess
> boundary to cross. And `runContainmentProbe(paths, opts)` **already** exposes
> an `opts.probeCmd` injection path (`src/core/dream/containment-probe.js`: the
> command is `opts.probeCmd || env.WIENERDOG_CONTAINMENT_PROBE_CMD || <pinned
> claude>`); this WP deletes only the middle env term, leaving the DI path and
> WP-154's pinned resolve. So the probe seams cost nothing extra to remove.

**Iron-rule alignment.** After this WP, "Wienerdog is just files" is true of the
dispatch code too: no shipped file reads an environment variable to decide what
binary to run. The A7 acceptance bullet "Production test command overrides are
inert without an explicit test build and remain shell:false" is now satisfied by
**nonexistence** — the overrides do not exist in production code at all, which is
strictly stronger than "inert". State this mapping honestly (see Acceptance).

**Honest boundary (state this; do not overclaim).** Same-user control of BOTH
the core and the OS scheduler can still replace both anchors. A7 protects
**scoped core writes** and **detects drift**; it is **NOT** a claim against
arbitrary same-user native malware — that is A12's territory. This WP removes a
defense-in-depth smell (a test-exec env seam in the production path) and its
`shell:true` code path.

> **ADR note:** `ADR-0028` records the A7 architectural decision — a **new ADR**
> (owner-assigned 2026-07-18), distinct from ADR-0027 (A8's re-derived scheduler
> *unload*). The ADR-0028 file is written as the A7 spec walkthrough concludes;
> until then this spec set is the design-of-record.

## Current state

> WP-154 (a dependency) lands **before** this WP and edits both
> `src/cli/run-job.js` and `src/core/dream/brain.js`. The bytes quoted below are
> today's; the notes call out what WP-154 leaves in place for this WP to remove.
> The implementer reads the actual post-WP-154 code.

**`src/cli/run-job.js` `resolveCommand(paths, job, profile)`** (~L217) — the env
seam and the sole `shell:true` in the scheduler:
```js
function resolveCommand(paths, job, profile) {
  const fake = process.env.WIENERDOG_RUNJOB_CMD;
  if (fake) return { command: fake, args: [], shell: true };   // ← env read + shell:true, to be DELETED
  // …builtin:dream → {…, shell:false}; skill:* → composeRoutineRun(…) → {…, shell:false}…
}
```
Every real branch already returns `shell:false` (`builtin:dream` at ~L226 sets
`shell: false`; `composeRoutineRun` in `src/core/routine-runtime.js` returns
`{command:'claude', args, cwd, shell: false, …}`). The **only** `shell:true`
producer is the fake branch. The resolved `{command, args, shell, cwd?}` flows
into the spawn at ~L557 (`spawn(command, args, { …, shell })`).

`runJob(paths, job, opts)` (~L461) already threads a JS-only test seam
`opts.profile` into `resolveCommand(paths, job, opts.profile)` at ~L516, with
sibling seams `opts.sendAlert`, `opts.loader`, `opts.platform`,
`opts.detectPolicyHooks` (each defaulted, reachable only by a JS caller — the CLI
entry `run(argv)` passes none). This is the idiom the new fake-command seam joins.

**`src/core/dream/brain.js` `spawnBrain(o)`** (~L157) — the second env seam:
```js
// WIENERDOG_DREAM_CMD is the test seam: run that executable instead of claude/codex.
const fakeCmd = baseEnv.WIENERDOG_DREAM_CMD;                    // ← env read, to be DELETED
const paths = getPaths(baseEnv);
let command; let args; let cwd;
if (fakeCmd) { command = fakeCmd; args = []; cwd = ensureBrainStaging(paths); }  // ← branch, to be DELETED
else if (harness === 'codex') { … }   // WP-154 makes this spawn the pinned absolute codex
else { … }                            // WP-154 makes this spawn the pinned absolute claude
```
The version-probe (~L199) is guarded `if (!fakeCmd && command === 'claude')`;
WP-154 rewrites the `command === 'claude'` half (the command becomes an absolute
realpath), leaving the `!fakeCmd` half for this WP to remove. After WP-154 the
brain executes the real executable via **`spawnPinned('claude'|'codex',
getPaths(baseEnv), { args, …, env: baseEnv, platform })`** ([R13] the encapsulated
public API — WP-154's `src/core/exec-identity.js`), which internally re-resolves
`name` on `baseEnv.PATH` live and requires the live command path +
`dirname(realpath)` to match the pin and the target to pass `verifyExecutable`
(regular file, exec bit, owner ∈ {uid,0}, no group/other-writable ancestor).

**`src/cli/dream.js` `run(argv)`** (~L153, gate at ~L309) — a **production**
behavior branch on **two** test vars: it skips the pre-dream containment
self-check when `WIENERDOG_DREAM_CMD` is set OR when
`WIENERDOG_SKIP_CONTAINMENT_PROBE === '1'`:
```js
let containmentProbe = null;
if (!process.env.WIENERDOG_DREAM_CMD && process.env.WIENERDOG_SKIP_CONTAINMENT_PROBE !== '1') {
  containmentProbe = runContainmentProbe(paths, { model: cfg.model, env: process.env });
  if (containmentProbe.outcome !== 'pass') { throw new WienerdogError(`dream halted: …`); }
}
```
`run` currently takes **only** `argv`; it is `module.exports = { run }` (~L411)
and the CLI entry `bin/wienerdog.js` (~L72) calls `run(rest)` with argv only.
`dream.run` is invoked **in-process** by the integration tests (they call
`dream.run` directly after setting `process.env`), and as `wienerdog dream
--yes` on the scheduled path. `getPaths(env)`: `core = $WIENERDOG_HOME ||
~/.wienerdog`; `state = <core>/state`; so the pin store is
`<WIENERDOG_HOME>/state/exec-pins.json`.

**`src/core/dream/containment-probe.js` `runContainmentProbe(paths, opts)`**
(~L133) — the probe command is chosen at ~L136:
```js
const command = opts.probeCmd || env.WIENERDOG_CONTAINMENT_PROBE_CMD || 'claude';
```
The `'claude'` bare-name fallback is **replaced by WP-154** with the encapsulated
`spawnPinnedSync('claude', …)` call ([R13]); the `opts.probeCmd`
injection path (used by `tests/unit/containment-probe.test.js`) stays. This WP
deletes only the **middle** term — the `env.WIENERDOG_CONTAINMENT_PROBE_CMD ||`
production seam — leaving `opts.probeCmd || <WP-154 spawnPinnedSync call>`. Read the
actual post-WP-154 line before editing (WP-154 lands first, on this same file).

**Tests that read the four env seams today** (all convert here):
- `tests/unit/scheduler-runjob.test.js` — a `withRun(env, envOverrides, argv,
  opts)` helper (~L93) sets `process.env.WIENERDOG_RUNJOB_CMD` from
  `envOverrides` (its `keys` array at ~L94 lists it) then calls
  `runjob.run(argv, opts)`; ~20 call sites pass `{ WIENERDOG_RUNJOB_CMD: fake }`
  where `fake` is a `writeScript(...)` `#!/bin/sh` script (shebang + `chmod
  0755`). The `resolveCommand` unit test (~L319) save/restores the var.
- `tests/unit/routine-runtime.test.js` (~L143, ~L166) — save/deletes/restores
  `WIENERDOG_RUNJOB_CMD` around two cases.
- `tests/unit/dream-brain.test.js` (~L141, ~L206, ~L239) — three cases run
  bespoke `#!/bin/sh` fakes via `env: { WIENERDOG_DREAM_CMD: fakeCmd, … }`
  (exit-code, stderrTail, redaction). WP-154 already edits this file to add
  pinned-path assertions and keep the fake seam working; this WP removes the
  seam and converts these three cases.
- `tests/integration/dream.test.js` — `runDream(ctx, argv, extraEnv)` (~L143)
  sets `WIENERDOG_DREAM_CMD: FAKE_BRAIN` for every run and calls `dream.run`
  in-process; its `ENV_KEYS` array (~L20) save/restores `WIENERDOG_DREAM_CMD`,
  `WIENERDOG_CONTAINMENT_PROBE_CMD`, and `WIENERDOG_SKIP_CONTAINMENT_PROBE`
  (`WIENERDOG_FAKE_BRAIN_MODE` also, but that one stays — see note). The
  probe-gating cases (~L744–833) exploit `WIENERDOG_DREAM_CMD:''` (falsy ⇒ probe
  runs), `WIENERDOG_CONTAINMENT_PROBE_CMD` (fail/garbage fakes, ~L756/L774/L788),
  `WIENERDOG_SKIP_CONTAINMENT_PROBE:'1'` (~L800), and the fake-brain-skips-probe
  premise. All of these move to the `opts` argument (below).
- `tests/integration/adopt-e2e.test.js` (~L81) — runs `init → adopt → sync →
  dream` in-process with `WIENERDOG_DREAM_CMD: FAKE_BRAIN`; `sync` runs WP-154's
  `createPins`.
- `tests/unit/codex-adapter.test.js` (~L424–431) — drives `spawnBrain({harness:
  'codex', …, env: { WIENERDOG_DREAM_CMD: fakeCodex }})`.

Fixtures `tests/fixtures/dream/fake-brain.js` and
`tests/fixtures/adopt/fake-brain-mapped.js` are already regular files with the
exec bit set (`rwxr-xr-x`) and a `#!/usr/bin/env node` shebang — directly
spawnable as pinned targets, no fixture edit needed.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file, docs/specs/ROADMAP.md, package-lock.json. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/cli/run-job.js | **Delete** the `WIENERDOG_RUNJOB_CMD` env read + `shell:true` fake branch in `resolveCommand`; `resolveCommand` no longer reads any env. Add a JS-only `opts.resolveCommand` injection in `runJob` (default = the module `resolveCommand`). Update the two stale JSDoc references to the seam. No `shell: true` literal remains in the file. **Fix-pass ([R2:F5]): also delete the `WIENERDOG_RUNJOB_TIMEOUT_MS` read in `resolveTimeoutMs` (~L271); inject via a JS-only `opts.timeoutMs`.** |
| modify | src/core/dream/brain.js | **Delete** every `fakeCmd`/`WIENERDOG_DREAM_CMD` reference `spawnBrain` still contains after WP-154: the `const fakeCmd = …` line, the `if (fakeCmd)` dispatch branch, and the `!fakeCmd &&` guard on the version-probe. Leave WP-154's pinned resolution intact. |
| modify | src/cli/dream.js | Change `run(argv)` → `run(argv, opts = {})`. **Delete** both env reads from the containment-probe gate (~L309): replace `if (!process.env.WIENERDOG_DREAM_CMD && process.env.WIENERDOG_SKIP_CONTAINMENT_PROBE !== '1')` with `if (!opts.skipContainmentProbe)`, and forward `probeCmd: opts.probeCmd` into the `runContainmentProbe(paths, {…})` call. **Fix-pass ([R2:F5]): also delete the `WIENERDOG_FAKE_TODAY` read in `today()` (~L32); inject via `opts.now`.** No other behavior change; production passes no `opts`. |
| modify | src/core/vault.js | Fix-pass ([R2:F5]): **delete** the `WIENERDOG_FAKE_TODAY` production read (~L15) — a test time-seam in the dispatch path; tests inject the date via a JS-only dependency. Same class as the exec seams (nonexistence > inertness). |
| modify | src/core/dream/containment-probe.js | **Delete** the `env.WIENERDOG_CONTAINMENT_PROBE_CMD` middle term at ~L136 (the `\|\|` alternative sitting before the WP-154 pinned resolve), so the command is `opts.probeCmd` falling back to the pinned resolve only. Nothing in the module reads any env var to choose or skip a spawn afterward. WP-154 has already replaced the bare `'claude'` fallback with the pinned resolve on this line — do not reintroduce a bare name. |
| modify | tests/unit/scheduler-runjob.test.js | Convert every `withRun(..., { WIENERDOG_RUNJOB_CMD: fake }, ...)` call to inject the fake via `opts.resolveCommand`; drop `WIENERDOG_RUNJOB_CMD` from the `keys` array and the `resolveCommand` test's save/restore. Add the shell:false invariant + "env var has no effect" assertions (below). |
| modify | tests/unit/routine-runtime.test.js | Drop the now-dead `WIENERDOG_RUNJOB_CMD` save/delete/restore in both cases (the module never reads env now). |
| modify | tests/unit/dream-brain.test.js | Convert the three `WIENERDOG_DREAM_CMD` fake cases to the pinned-fake front door via a `pinFakeBrain` helper (below); add a "`WIENERDOG_DREAM_CMD` set has no effect — the pinned brain runs" assertion. |
| modify | tests/integration/dream.test.js | `runDream` gains an `opts` param forwarded to `dream.run(argv, opts)` and defaults `opts.skipContainmentProbe = true`; it installs a pinned fake `claude`; drop `WIENERDOG_DREAM_CMD`, `WIENERDOG_CONTAINMENT_PROBE_CMD`, and `WIENERDOG_SKIP_CONTAINMENT_PROBE` from `ENV_KEYS` (keep `WIENERDOG_FAKE_BRAIN_MODE`). Re-spec the probe-gating cases via `opts` (below); delete the fake-brain-skips-probe case; convert the evidence case to the pinned fake. |
| modify | tests/integration/adopt-e2e.test.js | Install the fake `claude` at `<home>/.local/bin/claude` so `sync`'s `createPins` pins it against the job PATH and `dream` spawns it; drop `WIENERDOG_DREAM_CMD` (and it from `ENV_KEYS`); call `dream.run(['--yes'], { skipContainmentProbe: true })` (the fake brain cannot satisfy a live probe). |
| modify | tests/unit/codex-adapter.test.js | Install a pinned fake `codex` (harness `'codex'`) via `pinFakeBrain(root, core, fakeCodex, 'codex')`; drop `WIENERDOG_DREAM_CMD`. |

`package.json` is **NOT** touched (the abandoned design set `WIENERDOG_TEST=1` in
the `test` script; there is no test flag now). No new test file is created — the
negative/invariant assertions live in the converted files above.

### Exact contracts

**`resolveCommand` (run-job.js) — after the edit:**
```js
/** Resolve the child command + args from a job's `run` field.
 *  @returns {{command:string, args:string[], shell:false, cwd?:string}} */
function resolveCommand(paths, job, profile) {
  // (no env read — the deleted fake branch was the only env dependency)
  const sep = job.run.indexOf(':');
  const kind = sep === -1 ? job.run : job.run.slice(0, sep);
  // …builtin:dream → { …, shell:false }; skill:* → composeRoutineRun (shell:false); else throw…
}
```
`shell` is now `false` on every returned path. Keep threading `shell` at the
spawn site (it is provably always `false`); do not introduce a `shell:true`
literal anywhere.

**`runJob` (run-job.js) — the new JS-only injection seam:**
```js
// in runJob, replacing the direct call at ~L516:
const resolveCmd = opts.resolveCommand || resolveCommand;
const { command, args, shell, cwd: composedCwd } = resolveCmd(paths, job, opts.profile);
```
Document `opts.resolveCommand` in `runJob`'s JSDoc exactly like `opts.profile`: a
**code seam for tests only**, reachable only by a JS caller — `run(argv)` (the CLI
entry) never sets it, so production always uses the module `resolveCommand`. A
test override returns the fake directly, e.g.
`{ resolveCommand: () => ({ command: fakeScript, args: [], shell: false }) }`.
(The `#!/bin/sh` fake scripts already carry a shebang + exec bit, so `shell:false`
spawns them fine — no fixture change.)

**`spawnBrain` (brain.js) — after the edit:** the brain is executed
**only** via WP-154's `spawnPinned`/`spawnPinnedSync` for the `codex`/`claude`
paths ([R13] encapsulated — never a raw path); there is no `fakeCmd` variable, no
`if (fakeCmd)` branch, and the version-probe guard no longer mentions `fakeCmd`.
Nothing in the function reads `WIENERDOG_DREAM_CMD`.

**`dream.js` — after the edit.** `run` gains a JS-only `opts` argument (documented
in its JSDoc as a **test-only** seam, exactly like `run-job`'s `opts`: reachable
only by a JS caller — `bin/wienerdog.js` calls `run(rest)`, so production sees
`opts = {}`):
```js
/** @param {string[]} argv
 *  @param {{skipContainmentProbe?:boolean, probeCmd?:string}} [opts]
 *    TEST-ONLY. skipContainmentProbe: skip the pre-dream containment self-check
 *    (a fake brain cannot satisfy a live probe). probeCmd: forwarded to
 *    runContainmentProbe's opts.probeCmd DI seam. The CLI entry passes neither,
 *    so production ALWAYS runs the probe against the WP-154 pinned claude. */
async function run(argv, opts = {}) {
  …
  let containmentProbe = null;
  if (!opts.skipContainmentProbe) {
    containmentProbe = runContainmentProbe(paths, { model: cfg.model, env: process.env, probeCmd: opts.probeCmd });
    if (containmentProbe.outcome !== 'pass') { throw new WienerdogError(`dream halted: …`); }
  }
}
```
No production caller sets `opts`, so `skipContainmentProbe` is falsy and
`probeCmd` is undefined in production — the probe runs and resolves its `claude`
via WP-154's pinned front door. There is **no** env var that can skip or redirect
the probe.

**`containment-probe.js` — after the edit:**
```js
// [R13] WP-154 already made the fallback the encapsulated spawnPinnedSync call;
// this WP deletes only the env term, leaving injection + the pinned call:
const result = opts.probeCmd
  ? spawnSync(opts.probeCmd, args, …)
  : spawnPinnedSync('claude', paths, { env, platform, args });
```
The exact right-hand side is WP-154's (mirror the shipped line — read
`src/core/dream/containment-probe.js` post-WP-154). Nothing in the function reads
`WIENERDOG_CONTAINMENT_PROBE_CMD` (or any other env var) to choose the spawn.
`tests/unit/containment-probe.test.js` already injects exclusively via
`opts.probeCmd`, so **it needs no change from this WP** — do not touch it (it is
WP-154's deliverable for the pinned-path case).

**Test helper `pinFakeBrain` (added to the test files that need it — dream-brain,
dream, codex-adapter; each may keep its own copy or a tiny shared local).** This
is the pinned-fake install recipe. It MUST satisfy WP-154's structural checks so
the implementer does not fight `verifyExecutable`/`verifyPin`:

```js
/** Install `fakeScriptPath` as the pinned `name` ('claude'|'codex') in `core`'s
 *  pin store, and return an env fragment that makes the REAL dispatch path
 *  (spawnPinned* internally: resolve → verifyPin → verifyExecutable → bind → spawn) run it.
 *  @param {string} root  a fresh mkdtemp root (used for the bin dir)
 *  @param {string} core  WIENERDOG_HOME for this test (pin store at <core>/state)
 *  @param {string} fakeScriptPath  an executable #! script (regular file, +x)
 *  @param {string} [name='claude']
 *  @returns {{PATH:string, WIENERDOG_HOME:string}} env fragment to spread into env */
function pinFakeBrain(root, core, fakeScriptPath, name = 'claude') {
  // 1. realpath the root FIRST (macOS /var → /private/var) so commandPath and
  //    dirname(realpath) are stable and the pin's string-equality checks pass.
  const realRoot = fs.realpathSync(root);
  const binDir = path.join(realRoot, 'bin');       // user-owned; 0755 ⇒ NOT group/other-writable
  fs.mkdirSync(binDir, { recursive: true });
  const cmd = path.join(binDir, name);
  fs.copyFileSync(fakeScriptPath, cmd);            // regular file (copy, not symlink)
  fs.chmodSync(cmd, 0o755);                        // exec bit; owner = the test user
  // 2. Write the 0600 pin store: commandPath = first PATH hit, installDir =
  //    dirname(realpath) — both equal `cmd`/`binDir` because realRoot is real
  //    and `cmd` is a plain file (no symlink components).
  const store = { schema: 1, pins: { [name]: {
    commandPath: cmd, installDir: binDir, version: 'fake', pinnedAt: new Date().toISOString(),
  } } };
  const stateDir = path.join(core, 'state');
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(path.join(stateDir, 'exec-pins.json'), JSON.stringify(store), { mode: 0o600 });
  // 3. binDir FIRST on PATH so resolveExecutable(name) hits `cmd`.
  return { PATH: binDir + path.delimiter + process.env.PATH, WIENERDOG_HOME: core };
}
```
The exact `exec-pins.json` key/schema (`schema`, `pins.<name>.commandPath`,
`installDir`, `version`, `pinnedAt`) is WP-154's; if WP-154 changes it, mirror the
shipped shape (read `src/core/exec-identity.js`). Spawn resolution flow to keep in
mind: `spawnBrain` calls `spawnPinned(name, getPaths(baseEnv), { …, env: baseEnv,
platform })` ([R13]), which internally re-resolves `name` on `baseEnv.PATH` (hence
the env fragment must be spread into the `env` passed to `spawnBrain`/`dream.run`'s
`process.env`).

**`runDream` helper — after the edit.** Gains a fourth `opts` argument forwarded
to `dream.run`, defaulting to skip (a fake brain cannot satisfy a live probe):
```js
async function runDream(ctx, argv, extraEnv = {}, opts = {}) {
  …                                             // (env apply/restore unchanged)
  await dream.run(argv, { skipContainmentProbe: true, ...opts });
}
```
Cases that want the probe to actually run pass `{ skipContainmentProbe: false,
probeCmd: … }` as the fourth arg — no env var involved.

**Re-spec of `dream.test.js` probe-gating cases (~L744–833):**
- **default path:** `runDream` installs the pinned fake `claude` (via
  `pinFakeBrain`) and defaults `opts.skipContainmentProbe = true`; drop
  `WIENERDOG_DREAM_CMD`. Most cases inherit this and just commit.
- **probe FAIL / probe INCONCLUSIVE cases (~L744, ~L767):** these WANT the probe
  to run. Pass `opts = { skipContainmentProbe: false, probeCmd: failFake }` (resp.
  `garbageFake`) as `runDream`'s fourth arg; drop the `WIENERDOG_DREAM_CMD:''` and
  `WIENERDOG_CONTAINMENT_PROBE_CMD` `extraEnv`. The probe throws at step 8b
  **before** `spawnBrain`, so no pin is required to reach the assertion (the
  default pin install is harmless).
- **"the fake-brain seam SKIPS the probe entirely" case (~L781): DELETE it.** Its
  premise — setting `WIENERDOG_DREAM_CMD` skips the probe — no longer exists.
- **"WIENERDOG_SKIP_CONTAINMENT_PROBE=1 skips the probe" case (~L793):** keep it,
  re-specced to prove the **opts** skip suppresses even a present fail-probe fake:
  `runDream(ctx, ['--yes'], {}, { skipContainmentProbe: true, probeCmd: failFake })`
  → the dream commits (the probe never ran). Rename the test title away from the
  deleted env var (e.g. "…`opts.skipContainmentProbe` skips the probe…").
- **evidence case (~L806):** replace `env: { WIENERDOG_DREAM_CMD: FAKE_BRAIN, … }`
  on the direct `spawnBrain` call with `env: { ...process.env,
  ...pinFakeBrain(ctx.root, ctx.core, FAKE_BRAIN) }`; keep the `containmentProbe:
  { outcome:'pass', … }` assertion (unchanged by the probe-seam amendment — it
  passes `containmentProbe` straight to `spawnBrain`, never touching the gate).

## Implementation notes & constraints

- Zero new dependencies; plain Node ≥ 18, JSDoc types only; no build step.
- **Serialization with WP-154 (three shared source files).** WP-154 lands first
  and rewrites (a) the brain's `codex`/`claude` resolution to pinned absolute
  paths and the version-probe's `command === 'claude'` check, and (b) the
  containment probe's bare-`'claude'` fallback to a pinned resolve
  (`src/core/dream/containment-probe.js` — WP-154's spec-gap amendment). WP-155
  removes only what remains that references the deleted seams: the
  `WIENERDOG_RUNJOB_CMD`/`WIENERDOG_DREAM_CMD` exec seams **and** the
  `WIENERDOG_SKIP_CONTAINMENT_PROBE`/`WIENERDOG_CONTAINMENT_PROBE_CMD` probe seams.
  Read the actual post-WP-154 `brain.js`/`run-job.js`/`containment-probe.js`; do
  not reintroduce a bare-name spawn, and keep WP-154's pinned resolve intact.
- **`adopt-e2e` runs `sync` ⇒ `createPins` (WP-154).** Do NOT hand-write a pin
  that `sync` will overwrite. Instead place the fake `claude` at
  `<home>/.local/bin/claude` (the dir the job clean PATH front-loads) so
  `createPins` pins it, and prepend that same dir to `process.env.PATH` so the
  in-process dream's `spawnPinned*` (which internally resolves on `process.env.PATH`)
  resolves the **same** command path — otherwise pin-time and spawn-time paths
  diverge and the dream fails safe. If you cannot make the two PATHs agree
  (createPins must pin against the **job clean PATH** that `run-job`/`dream` later
  spawn under), that is a **WP-154 PATH-consistency gap**: STOP and route it back
  as a spec bug (do not paper over it by disabling the pin path in the test).
- **Probe seams are now IN scope (A7-walkthrough amendment).**
  `WIENERDOG_SKIP_CONTAINMENT_PROBE` (in `dream.js`) and
  `WIENERDOG_CONTAINMENT_PROBE_CMD` (in `containment-probe.js`) are **deleted** by
  this WP and replaced with the JS-only `dream.run(argv, opts)` seam
  (`opts.skipContainmentProbe`, `opts.probeCmd`). `containment-probe.test.js`
  already injects via `opts.probeCmd` and needs **no** change; do not touch it.
  The containment-probe.js edit is a **one-line deletion** of the env term left by
  WP-154's pinned resolve — do not otherwise rewrite that line.
- **Scenario-runner `delete env.WIENERDOG_DREAM_CMD` lines** in
  `tests/scenarios/run-scenarios.js` (~L314, ~L371 comment) and
  `tests/scenarios/negative/run-negative.js` (~L218) become dead no-ops after the
  seam is gone. **Decision: leave them** — they are cosmetic residue in a
  live-run harness that `npm test` never executes, and touching them would widen
  the deliverables to scenario files for zero behavioral gain. (They are why the
  grep acceptance below is scoped to `src/`.)
- The `WIENERDOG_RUNJOB_TIMEOUT_MS` timeout knob is a different, non-exec seam and
  stays; keep it in `withRun`'s `keys` array.
- When uncertain, choose the simpler option and record it under "Decisions made".

## Security checklist

- [ ] `resolveCommand` reads **no** environment variable; a set
      `WIENERDOG_RUNJOB_CMD` has zero effect on what a scheduled job dispatches.
- [ ] `spawnBrain` reads **no** `WIENERDOG_DREAM_CMD`; the brain is resolved only
      via WP-154's pinned front door; a set `WIENERDOG_DREAM_CMD` has zero effect.
- [ ] There is **no** `shell:true` dispatch anywhere in the scheduler path
      (`grep -n 'shell: true' src/cli/run-job.js` returns nothing; every
      `resolveCommand` return is `shell:false`).
- [ ] `dream.js` no longer branches production behavior on `WIENERDOG_DREAM_CMD`.
- [ ] **The containment probe cannot be skipped or redirected in production.**
      `dream.js` reads **no** `WIENERDOG_SKIP_CONTAINMENT_PROBE`, and
      `containment-probe.js` reads **no** `WIENERDOG_CONTAINMENT_PROBE_CMD`; the
      only skip/redirect is the JS-only `dream.run(argv, opts)` seam, which the CLI
      entry never sets — so a scheduled dream **always** runs the probe against the
      WP-154 pinned `claude`. No env knob can disable the security check.
- [ ] Grep acceptance: `grep -rnE 'WIENERDOG_RUNJOB_CMD|WIENERDOG_DREAM_CMD|WIENERDOG_SKIP_CONTAINMENT_PROBE|WIENERDOG_CONTAINMENT_PROBE_CMD' src/`
      returns **nothing** — none of the four seams exist in production code.
- [ ] No unlisted file is modified; the suite passes via DI + pinned fakes, not a
      global test flag.

## Acceptance criteria (mapped to the A7 acceptance bullets)

- [ ] **[A7 — "Production test command overrides are inert without an explicit
      test build and remain shell:false."]** Satisfied by **nonexistence**, which
      is stronger than inertness: `grep -rn 'WIENERDOG_RUNJOB_CMD\|WIENERDOG_DREAM_CMD'
      src/` is empty, and no `resolveCommand` path returns `shell:true`. A unit
      test sets `process.env.WIENERDOG_RUNJOB_CMD=/bin/echo` and asserts
      `resolveCommand({}, {name:'dream', run:'builtin:dream'})` still returns the
      real `builtin:dream` resolution with `shell:false` (the env var is ignored).
- [ ] A unit/integration test sets `WIENERDOG_DREAM_CMD` and asserts `spawnBrain`
      ignores it — the **pinned** brain runs (via `pinFakeBrain`), proving the env
      seam is dead and the WP-154 pin path is the only substitution mechanism.
- [ ] **[probe-seam amendment]** Setting `WIENERDOG_SKIP_CONTAINMENT_PROBE=1` and
      `WIENERDOG_CONTAINMENT_PROBE_CMD` has **zero** effect: the probe still runs
      against the pinned `claude`. The probe is skipped/redirected only via
      `dream.run(argv, {skipContainmentProbe|probeCmd})`, which the CLI entry never
      passes. `grep -rnE 'WIENERDOG_SKIP_CONTAINMENT_PROBE|WIENERDOG_CONTAINMENT_PROBE_CMD' src/`
      is empty.
- [ ] The `run-job` fake is injected via `opts.resolveCommand` (JS-only); the CLI
      entry passes none, so production `resolveCommand` is always used.
- [ ] The dream integration/adopt/codex tests drive the real pinned dispatch via
      `spawnPinned*` (internally: resolve → verifyPin → bind → spawn) against a fake
      installed in a temp `WIENERDOG_HOME` pin store — full pin-path coverage, no env seam.
- [ ] The full suite passes with **no** `WIENERDOG_TEST` flag and no
      `package.json` change.
- [ ] `npm test` and `npm run lint` are green.

## Verification steps (run these; paste output in the PR)

```bash
# none of the four seams exist in production code:
grep -rnE 'WIENERDOG_RUNJOB_CMD|WIENERDOG_DREAM_CMD|WIENERDOG_SKIP_CONTAINMENT_PROBE|WIENERDOG_CONTAINMENT_PROBE_CMD' src/ ; test $? -eq 1 && echo "OK: absent from src/"
# no shell:true dispatch remains:
grep -n 'shell: true' src/cli/run-job.js ; test $? -eq 1 && echo "OK: no shell:true"
# the converted suites:
npm test -- --test-name-pattern "scheduler-runjob|routine-runtime|dream-brain|dream-integration|adopt-e2e|codex-adapter"
npm test
npm run lint
```

## Out of scope (do NOT do these)

- Resolving/verifying/pinning the executables — **WP-154** (this WP consumes the
  pin front door; it does not change how the real command is resolved).
- The `WIENERDOG_UPDATE_FETCH_CMD` update-fetch seam — different seam, separate
  agenda item (flag, do not touch). (**Fix-pass 2026-07-19 [R2:F5]: the
  `WIENERDOG_RUNJOB_TIMEOUT_MS` timeout seam and the `WIENERDOG_FAKE_TODAY` date
  seam are now IN scope — this earlier "do not touch" carve-out is REVERSED. See
  the Fix-pass amendments.** The probe seams `WIENERDOG_SKIP_CONTAINMENT_PROBE` /
  `WIENERDOG_CONTAINMENT_PROBE_CMD` were already brought in by the probe-seam
  amendment in Context.)
- Cleaning the dead `delete env.WIENERDOG_DREAM_CMD` lines in `tests/scenarios/*`
  (decision above: left as harmless residue).
- The job descriptor, digest binding, or the launcher — **WP-156 / WP-157**.
- The `schedulerSpawn` `WIENERDOG_LOADER_NOOP` / `WIENERDOG_TEST_NO_REAL_SCHEDULER`
  seams in `src/scheduler/spawn.js` — leave untouched.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/155-inert-test-exec-seams`; conventional commits; PR titled
   `fix(security): delete test-exec env seams — DI + pinned fakes, shell:false invariant (WP-155)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.

> **Fork note:** work lands directly on `main` per the WORKING-NOTES; `branch:`/PR
> fields are kept for template/upstream-porting fidelity.

## Fix-pass amendments (2026-07-19)

The round-2 design review (WP-156 F5) found that the exec seams are **not** the
only test seams living in the production dispatch path: two **time/timeout** env
seams shape the scheduled spawn and are settable by an in-scope scheduler-env
write, defeating the "everything shaping the 03:30 spawn is digest-covered"
invariant. Same class as this WP's exec seams — folded in here.

### A1 — delete the production time/timeout env seams [Codex HIGH, R2:F5]

- **`WIENERDOG_FAKE_TODAY`** — read on the production path in `src/core/vault.js`
  (~L15) and `src/cli/dream.js` `today()` (~L32); it changes the date →
  `DREAM_PROMPT` → daily-note location → `WIENERDOG_DREAM_LAYOUT`. **Delete** both
  reads; inject the date via a JS-only dependency (`opts.now`), reachable only by
  a JS caller — the CLI entry passes none, so production uses the system clock.
- **`WIENERDOG_RUNJOB_TIMEOUT_MS`** — read in `src/cli/run-job.js`
  `resolveTimeoutMs` (~L271) for the outer watchdog. **Delete**; inject via a
  JS-only `opts.timeoutMs`.

After deletion the date derives from the system clock (not attacker-controllable
via env, and legitimately daily), so it needs no descriptor field; the outer
timeout is added to the descriptor digest by WP-156 A2. Deliverables add
`src/core/vault.js`; `run-job.js`/`dream.js` are already listed. **Acceptance /
grep:** extend the seam grep to
`grep -rnE 'WIENERDOG_FAKE_TODAY|WIENERDOG_RUNJOB_TIMEOUT_MS' src/` → empty; add a
behavioral test that a set `WIENERDOG_FAKE_TODAY` has **zero** effect (the
injected clock is used).

**Note:** this reverses this WP's original "do not touch `WIENERDOG_RUNJOB_TIMEOUT_MS`"
out-of-scope carve-out (now withdrawn — see Out of scope).
