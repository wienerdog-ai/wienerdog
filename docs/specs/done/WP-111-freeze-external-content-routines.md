---
id: WP-111
title: Freeze external-content skill schedules behind the safety profile
status: Done
model: sonnet
size: S
depends_on: [WP-109]
adrs: [ADR-0004, ADR-0008]
branch: wp/111-freeze-external-content-routines
---

# WP-111: Freeze external-content skill schedules behind the safety profile

## Context (read this, nothing else)

Wienerdog is just files (ADR-0004). A **routine** is a scheduled job run by the OS
scheduler via `wienerdog run-job <name>`; its `run:` field is either
`builtin:dream` (the nightly dream) or `skill:<name>` (an opt-in catalog routine
such as the daily digest, which reads the user's email/calendar — external,
untrusted content). A 2026-07-15 security audit found that a `skill:` routine runs
as a **bare `claude -p /<skill>` with no Wienerdog-defined capability profile**, so
malicious external content could obtain ambient shell/network/MCP authority
(audit action A1). Until code-owned hermetic profiles exist and the P0 gates
close, **scheduling or running a `skill:` routine must be disabled — fail closed
BEFORE the model is spawned** — so a fresh install cannot create or execute an
external-content routine through any headless path. `builtin:dream` stays allowed
(the dream is the one permitted job; its own identity writes are frozen separately
by WP-112).

WP-109 shipped the mechanism: a code-owned **safety profile** with **capability
gates**, all BLOCKED, no runtime/env/flag override. This WP wires the
`external-content-routine` gate at **two** points (defense in depth):

1. **`schedule add --skill <s>`** (`src/cli/schedule.js`) — the primary creation
   path: a fresh install cannot even register a `skill:` job.
2. **`run-job`'s command resolution** (`src/cli/run-job.js` `resolveCommand`) — the
   execution path: even a hand-edited `config.yaml` with `run: skill:foo` fails
   before `claude` is spawned.

## Current state

**`src/cli/schedule.js`** — `add(argv, loader)` parses flags, validates the name /
`--at` / exactly-one-of `--skill`/`--job`, then:

```js
  const run = hasSkill ? `skill:${flags.skill}` : `builtin:${flags.job}`;
  // … timeout …
  const paths = getPaths();
  const job = { name, at: flags.at, run, timeoutMinutes };
  jobsLib.saveJob(paths, job);                 // writes config.yaml
  const manifest = manifestLib.load(paths);
  const { platform, changed, loaded } = registerPlatform(paths, manifest, …, loader);
  // …
```

`run(argv, { loader = defaultLoader } = {})` dispatches `add|remove|list`.

**`src/cli/run-job.js`** — `resolveCommand(paths, job)`:

```js
  const fake = process.env.WIENERDOG_RUNJOB_CMD;   // test seam: returns first
  if (fake) return { command: fake, args: [], shell: true };
  // … parse kind from job.run …
  if (kind === 'builtin') { if (rest === 'dream') return { command: node, args: [bin,'dream','--yes'], shell:false }; throw … }
  if (kind === 'skill') {
    return { command: 'claude', args: ['-p', `/${rest}`], shell: false };
  }
  throw new WienerdogError(`unknown job run kind in "${job.run}"`);
```

`resolveCommand` is called by `runJob` as `resolveCommand(paths, job)` (no third
arg). Note the `WIENERDOG_RUNJOB_CMD` seam returns **before** the kind switch, so
the many `scheduler-runjob.test.js` integration tests that run `skill:` jobs with
that fake command never reach the skill branch and are unaffected by the gate.

**`src/core/safety-profile.js`** (WP-109) exports `requireCapability(name,
profile?)`, `CAPABILITY.EXTERNAL_CONTENT_ROUTINE`, and `allowAll()`. No `profile`
→ frozen (all blocked); `profile` is a code seam for tests only.

**Tests.**
- `tests/unit/scheduler-schedule.test.js` — several tests call
  `runSchedule(env, ['add', 'daily-digest', '--at', '07:00', '--skill', '…'], loader)`
  and assert the job persists (lines ~271, ~681, ~847). The "exactly-one-of"
  validation test (~252–259) rejects *neither* and *both* `--skill`/`--job` and
  throws **before** any gate (validation precedes run-building) — unaffected.
- `tests/unit/scheduler-runjob.test.js` — line ~318 unit-tests `resolveCommand`
  directly (no fake cmd): it asserts `builtin:dream` maps to the node/dream argv,
  `skill:wienerdog-daily-digest` maps to `claude -p /…`, and rejects unknown
  kinds. The `skill:` case here reaches the new gate.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file, docs/specs/ROADMAP.md, package-lock.json. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/cli/schedule.js | gate `--skill` in `add`; thread `opts.profile` through `run`→`add` |
| modify | src/cli/run-job.js | gate the `skill:` branch in `resolveCommand`; add optional `profile` param |
| modify | tests/unit/scheduler-schedule.test.js | thread `{ profile: allowAll() }` into `--skill` add tests; add a freeze-rejection test |
| modify | tests/unit/scheduler-runjob.test.js | pass `allowAll()` to the `resolveCommand` skill case; add a freeze-rejection assertion |

### Exact contracts

**1. `src/cli/schedule.js`.** Import the gate; thread a `profile` seam from `run`
into `add`; fire the gate when `--skill` is chosen, before `saveJob`:

```js
const { requireCapability, CAPABILITY } = require('../core/safety-profile');

function add(argv, loader, profile) {
  // … existing name / --at / exactly-one-of validation UNCHANGED …
  const run = hasSkill ? `skill:${flags.skill}` : `builtin:${flags.job}`;

  // A0 pre-use freeze (WP-109): skill-based (external-content) routines are disabled
  // until code-owned hermetic profiles exist (audit A1). Fail closed BEFORE writing
  // config.yaml or registering an OS entry. builtin:* (the dream) is unaffected.
  if (hasSkill) requireCapability(CAPABILITY.EXTERNAL_CONTENT_ROUTINE, profile);

  // … timeout resolution, getPaths, saveJob, registerPlatform UNCHANGED …
}
```

In `run(argv, { loader = defaultLoader, profile } = {})`, pass `profile` through:
`case 'add': add(rest, loader, profile); return;`. `remove`/`list` are unchanged.
`bin/wienerdog.js` calls `schedule.run(rest)` (no `profile`) → frozen. Keep
`module.exports` unchanged.

**2. `src/cli/run-job.js`.** Add an optional third param to `resolveCommand` and
gate the `skill:` branch (the `WIENERDOG_RUNJOB_CMD` early-return stays first):

```js
const { requireCapability, CAPABILITY } = require('../core/safety-profile');

function resolveCommand(paths, job, profile) {
  const fake = process.env.WIENERDOG_RUNJOB_CMD;
  if (fake) return { command: fake, args: [], shell: true };
  // … kind parsing + builtin branch UNCHANGED …
  if (kind === 'skill') {
    // A0 pre-use freeze: refuse to spawn a bare `claude -p /<skill>` for an
    // external-content routine (audit A1) — fail closed BEFORE the model spawn,
    // even for a hand-edited config.yaml job.
    requireCapability(CAPABILITY.EXTERNAL_CONTENT_ROUTINE, profile);
    return { command: 'claude', args: ['-p', `/${rest}`], shell: false };
  }
  throw new WienerdogError(`unknown job run kind in "${job.run}"`);
}
```

`runJob` keeps calling `resolveCommand(paths, job)` (no profile → frozen); do not
thread a profile through `runJob`/`run` (production must stay frozen). Keep
`resolveCommand` in `module.exports` (already exported).

**3. Tests.**
- `scheduler-schedule.test.js`: `const { allowAll } = require('../../src/core/safety-profile');`
  The existing `runSchedule(env, argv, loader)` helper calls
  `schedule.run(argv, { loader })` and does NOT forward a profile. Extend it to take
  an optional 4th arg — `async function runSchedule(env, argv, loader, profile)` →
  `await schedule.run(argv, { loader, profile })` (a plain `undefined` profile
  preserves the frozen behavior for every existing caller byte-for-byte). Then pass
  `allowAll()` as that 4th arg to each `runSchedule` call that does `add … --skill …`
  and expects success (lines ~271, ~681, ~847), so those exercise the allowed path
  via the code seam. Add ONE new test: `runSchedule(env, ['add','daily-digest','--at','07:00','--skill','x'], loader)`
  with NO profile → `assert.rejects(…, /disabled in this release/)`, and assert the
  job was NOT written (`jobsLib.listJobs(paths)` has no `daily-digest`) and no OS
  entry was registered (loader not called with a register argv).
- `scheduler-runjob.test.js`: in the `resolveCommand` unit test, call the `skill:`
  case as `runjob.resolveCommand(paths, { name:'x', run:'skill:wienerdog-daily-digest' }, allowAll())`
  and keep asserting it maps to `claude -p /…`. Add an assertion that the same call
  WITHOUT the profile throws: `assert.throws(() => runjob.resolveCommand(paths, {
  name:'x', run:'skill:wienerdog-daily-digest' }), /disabled in this release/)`. The
  `builtin:dream` and unknown-kind assertions are unchanged.

## Implementation notes & constraints

- **`builtin:dream` stays allowed.** Only the `skill:` path is gated. Never gate
  `builtin:*`.
- **Gate before side effects.** In `add`, the gate precedes `saveJob` (config
  write) and `registerPlatform` (OS entry). In `resolveCommand`, it precedes the
  returned `claude` argv (the model spawn happens later in `runJob`). "Fails before
  spawning a model."
- **Keep the `WIENERDOG_RUNJOB_CMD` seam first** — it is an existing test seam and
  must still short-circuit; the gate lives only in the real `skill:` branch, so the
  fake-cmd integration tests stay green.
- **No env/flag override** (A0): the only "allowed" path is the `profile` code seam
  passed by tests. `runJob` never passes one, so production is frozen.
- Zero new deps; plain Node ≥ 18; JSDoc types; no build step.
- When uncertain, choose the simpler option and record it under "Decisions made".

## Security checklist

- [ ] No untrusted identifier reaches a shell or filesystem path differently than
      before — this WP only *refuses* the `skill:` path; it changes no argv
      construction. Both gates fire before a side effect: `schedule add --skill`
      throws before `saveJob`/OS registration (assert config.yaml unchanged), and
      `resolveCommand`'s `skill:` branch throws before returning the `claude` argv
      (assert `runJob` never spawns). `profile` is a code seam (tests only), never
      env/argv; `runJob` passes none → frozen.

## Acceptance criteria

- [ ] `wienerdog schedule add <name> --at HH:MM --skill <s>` fails closed with the
      `external-content-routine` "disabled … no … override" error, and writes no
      job to `config.yaml` and no OS scheduler entry — a fresh install cannot create
      an external-content schedule headlessly.
- [ ] `resolveCommand` on a `skill:` job (the `run-job` execution path) throws the
      freeze error before returning a `claude -p` command — a hand-edited
      `config.yaml` `skill:` job cannot spawn a model.
- [ ] `schedule add … --job dream` / `builtin:dream` and `resolveCommand` on
      `builtin:dream` are unaffected (dream still schedules and resolves).
- [ ] With `{ profile: allowAll() }`, the `--skill` add path and the `skill:`
      `resolveCommand` still behave exactly as before the freeze.
- [ ] `npm test` and `npm run lint` pass.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern "scheduler-schedule"
npm test -- --test-name-pattern "scheduler-runjob"
npm test
npm run lint
```

## Out of scope (do NOT do these)

- Hermetic runtime profiles, per-routine capability sets, `--strict-mcp-config`,
  the broker, or vendored routine prompts — those are audit action A1, a separate
  future WP.
- Gating `builtin:dream` or any change to the dream run itself (WP-112 freezes the
  dream's identity writes separately).
- Removing the `skill:` catalog or the routine skills — the freeze refuses to
  schedule/run them; it does not delete them (ADR-0008 catalog stays, inert).
- Threading a `profile` through `runJob`/`run` — production must stay frozen.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/111-freeze-external-content-routines`; conventional commits; PR titled
   `feat(schedule,run-job): freeze external-content skill routines (WP-111)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.

> **Fork note:** in this private security fork, work lands directly on `main`
> per `docs/security-audit/2026-07-15/WORKING-NOTES.md`; the `branch:`/PR fields
> are kept for template/upstream-porting fidelity.
