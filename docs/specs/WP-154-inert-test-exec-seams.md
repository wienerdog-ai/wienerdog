---
id: WP-154
title: Make production test-exec overrides inert without an explicit test flag, and keep every dispatch shell:false
status: Draft
model: sonnet
size: S
depends_on: [WP-153]
adrs: [ADR-0004, ADR-0028]
branch: wp/154-inert-test-exec-seams
---

# WP-154: Inert production test-exec seams + shell:false invariant (audit A7, part 2 of 6)

## Context (read this, nothing else)

Wienerdog's scheduled job dispatch carries two **test-only** environment seams
that let a test substitute the executable a job runs: `WIENERDOG_RUNJOB_CMD`
(in `src/cli/run-job.js` `resolveCommand`) and `WIENERDOG_DREAM_CMD` (in
`src/core/dream/brain.js` `spawnBrain`). These are test hooks living in the
**production** dispatch path. **IRON RULE (ADR-0004): Wienerdog is just files** —
nothing it ships should turn an environment variable into arbitrary code at
03:30. This WP is A7's smallest hardening (audit finding **F5**).

Two problems. First, the `WIENERDOG_RUNJOB_CMD` seam returns
`{command: fake, args: [], shell: true}` — a **shell:true** dispatch, the only
one in the scheduler, so a set env var becomes an arbitrary *shell* command
line. Second, both seams are honored **unconditionally in production**: anyone
who can set the var in the environment the scheduled `run-job` inherits
(`launchctl setenv`, a systemd user env drop-in, a shell profile the scheduler
reads) gets execution as the user. The audit's recommendation (F5): gate the
seams behind an explicit test flag so they are **inert in a production install**,
and drop `shell:true` for an argv dispatch.

This WP makes both seams honored **only** when `WIENERDOG_TEST === '1'` is set,
and makes the `resolveCommand` fake return **`shell:false`**. The npm `test`
script sets `WIENERDOG_TEST=1` so the existing suite keeps working without
per-test edits; `buildCleanEnv` passes `WIENERDOG_TEST` through only when already
present, so an end-to-end test's spawned child still honors the seam while a
production scheduled run (where the flag is never set) never does.

**Honest boundary (state this; do not overclaim).** Same-user control of BOTH
the core and the OS scheduler can still replace both anchors. A7 protects
**scoped core writes** and **detects drift**; it is **NOT** a claim against
arbitrary same-user native malware — that is A12's territory. This WP closes a
defense-in-depth smell (a shelled-out env seam in the production path); a
same-user actor who can set the OS scheduler's environment and the test flag is
outside the boundary by construction.

> **ADR note:** `ADR-0028` records the A7 architectural decision — a **new ADR**
> (owner-assigned 2026-07-18), distinct from ADR-0027 (A8's re-derived scheduler
> *unload*). The ADR-0028 file is written as the A7 spec walkthrough concludes;
> until then this spec set is the design-of-record.

## Current state

**`src/cli/run-job.js` `resolveCommand(paths, job, profile)`** (~L211):
```js
function resolveCommand(paths, job, profile) {
  const fake = process.env.WIENERDOG_RUNJOB_CMD;
  if (fake) return { command: fake, args: [], shell: true };   // ← shell:true, ungated
  ...
}
```
The resolved `{command, args, shell}` flows straight into the `spawn(command,
args, { …, shell })` call in `runJob` (~L548).

**`src/cli/run-job.js` `buildCleanEnv(paths, name, platform)`** builds the child
env and copies through `ENV_PASSTHROUGH = ['WIENERDOG_HOME','WIENERDOG_VAULT',
'CLAUDE_CONFIG_DIR','CODEX_HOME','ANTHROPIC_API_KEY']` (plus a Windows list).
`WIENERDOG_RUNJOB_CMD` / `WIENERDOG_DREAM_CMD` / `WIENERDOG_TEST` are **not**
passed through today.

**`src/core/dream/brain.js` `spawnBrain(o)`** (~L157):
```js
const fakeCmd = baseEnv.WIENERDOG_DREAM_CMD;   // ← ungated
...
if (fakeCmd) { command = fakeCmd; args = []; cwd = ensureBrainStaging(paths); }
else if (harness === 'codex') { … } else { … }   // WP-153 makes this the pinned claude
```
(WP-153, a dependency, replaces the `else`/`codex` bare-name spawns with the
verified pinned absolute path and must run first; this WP edits the `fakeCmd`
gating in the same function.)

**`package.json`** `"test"` script runs the node test runner (e.g. `node --test …`)
without setting `WIENERDOG_TEST`.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file, docs/specs/ROADMAP.md, package-lock.json. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/cli/run-job.js | Gate `WIENERDOG_RUNJOB_CMD` behind `WIENERDOG_TEST==='1'`; return `shell:false`. Add `WIENERDOG_TEST` to `ENV_PASSTHROUGH` (passed through ONLY when present). |
| modify | src/core/dream/brain.js | Gate `WIENERDOG_DREAM_CMD` behind `WIENERDOG_TEST==='1'` (read from `baseEnv`). |
| modify | package.json | The `test` script sets `WIENERDOG_TEST=1` for the whole run (POSIX inline; document the Windows-dev caveat). Do NOT change any other script. |
| create | tests/unit/test-seam-gate.test.js | Prove the seams are inert without the flag, honored with it, and the run-job fake is `shell:false`. |

### Exact contracts

**`resolveCommand` fake branch:**
```js
const seams = process.env.WIENERDOG_TEST === '1';
const fake = seams ? process.env.WIENERDOG_RUNJOB_CMD : undefined;
if (fake) return { command: fake, args: [], shell: false };   // gated + shell:false
```
With `WIENERDOG_TEST` unset, `WIENERDOG_RUNJOB_CMD` is **ignored entirely** —
`resolveCommand` proceeds to the real `builtin:`/`skill:` resolution.

**`spawnBrain` fake branch:**
```js
const fakeCmd = baseEnv.WIENERDOG_TEST === '1' ? baseEnv.WIENERDOG_DREAM_CMD : undefined;
```
With the flag unset, the brain resolves the real (WP-153-pinned) `claude`/`codex`.

**`buildCleanEnv`:** add `'WIENERDOG_TEST'` to `ENV_PASSTHROUGH`. The existing
loop copies a var **only if present** (`if (process.env[k]) env[k] = …`), so a
production run (flag absent) still gets a clean child env with no flag, while an
end-to-end test that sets `WIENERDOG_TEST=1` propagates it into the spawned dream
child so `WIENERDOG_DREAM_CMD` is honored there. No other passthrough changes.

**`package.json` `test` script:** prefix the runner with `WIENERDOG_TEST=1`, e.g.
`"test": "WIENERDOG_TEST=1 node --test …"` (keep the existing runner + globs
otherwise byte-identical). This makes the whole suite run with the flag, so no
individual test file needs editing.

## Implementation notes & constraints

- Zero new dependencies; plain Node ≥ 18, JSDoc types only.
- **No dependency on WP-144/145** — this WP touches none of `manifest.js`, the
  `scheduler-entry` kind, `schedule.js`, or `generators.js`. It depends on
  **WP-153** solely because both edit `src/core/dream/brain.js` (serialize; WP-153
  lands the pinned-spawn `else` branches first, this WP edits the `fakeCmd`
  gating).
- **Windows-dev caveat:** the inline `WIENERDOG_TEST=1 …` form is POSIX. If a
  cross-platform `npm test` on native Windows is required, use a zero-dep
  approach (a tiny `node -e` pre-step that re-execs the runner with the env set,
  or the `env` field of a wrapper) — CI runs POSIX, so the inline form is
  acceptable for now; record the choice under "Decisions made".
- If gating breaks a test that spawns `run-job`/`dream` through a **bespoke env
  that strips inherited vars** (rare), that missing propagation is a real gap:
  STOP and report it (do not edit unlisted test files to paper over it) — it is a
  spec bug to route back.
- The child dream never sees `WIENERDOG_RUNJOB_CMD` (not in any passthrough) —
  only `run-job`'s own process reads it, which is the intended surface.
- When uncertain, choose the simpler option and record it under "Decisions made".

## Security checklist

- [ ] With `WIENERDOG_TEST` unset, both `WIENERDOG_RUNJOB_CMD` and
      `WIENERDOG_DREAM_CMD` are **ignored** — a production scheduled run dispatches
      only the real code-owned command.
- [ ] The `resolveCommand` fake returns **`shell:false`** — there is no
      `shell:true` dispatch anywhere in the scheduler path.
- [ ] `buildCleanEnv` passes `WIENERDOG_TEST` through **only when already set** —
      production child envs carry no test flag.
- [ ] No unlisted file (especially existing tests) is modified; the suite passes
      because the npm script sets the flag globally.

## Acceptance criteria (mapped to the A7 acceptance bullets)

- [ ] **[A7 — "Production test command overrides are inert without an explicit
      test build and remain shell:false."]** With `WIENERDOG_TEST` unset and
      `WIENERDOG_RUNJOB_CMD=/bin/echo` set, `resolveCommand` returns the real
      `builtin:dream` resolution (not the fake); with `WIENERDOG_TEST=1` it returns
      `{command:'/bin/echo', args:[], shell:false}`.
- [ ] With `WIENERDOG_TEST` unset and `WIENERDOG_DREAM_CMD` set, `spawnBrain`
      resolves the real brain (asserted via the WP-153 pinned-path seam / a
      throw when no pin), not the fake.
- [ ] The full existing suite passes unchanged (the npm `test` script provides the
      flag); no per-test edits.
- [ ] `npm test` and `npm run lint` are green.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern "test-seam-gate|run-job|dream-brain"
# prove production inertness directly (flag unset ⇒ fake ignored):
WIENERDOG_RUNJOB_CMD=/bin/echo node -e "const {resolveCommand}=require('./src/cli/run-job'); console.log(resolveCommand({}, {name:'dream', run:'builtin:dream'}))"
npm test
npm run lint
```

## Out of scope (do NOT do these)

- Resolving/verifying/pinning the executables — **WP-153** (this WP only gates the
  fake seams; it does not change how the real command is resolved).
- The job descriptor, digest binding, or the launcher — **WP-155 / WP-156**.
- The `schedulerSpawn` `WIENERDOG_LOADER_NOOP` / `WIENERDOG_TEST_NO_REAL_SCHEDULER`
  seams (already correctly guarded in `src/scheduler/spawn.js`) — leave untouched.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/154-inert-test-exec-seams`; conventional commits; PR titled
   `fix(security): gate test-exec seams behind WIENERDOG_TEST + drop shell:true (WP-154)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.

> **Fork note:** work lands directly on `main` per the WORKING-NOTES; `branch:`/PR
> fields are kept for template/upstream-porting fidelity.
