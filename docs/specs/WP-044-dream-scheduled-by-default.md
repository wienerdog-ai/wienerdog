---
id: WP-044
title: Schedule the nightly dream by default when a vault is created
status: In-Review
model: opus
size: M
depends_on: [WP-043]
adrs: [ADR-0014, ADR-0013, ADR-0004]
branch: wp/044-dream-scheduled-by-default
---

# WP-044: Schedule the nightly dream by default when a vault is created

## Context (read this, nothing else)

Dreaming is the nightly job that turns sessions into durable vault memory — the
product's core value. Today nothing is scheduled until the user opts in via the
routine catalog. A user with a vault but no dream schedule silently never learns.
**The owner has decided (ADR-0014): the moment a vault first exists, Wienerdog
silently schedules the nightly dream at 03:30 local — no prompt — and the summary
output states plainly that it did so and how to change or disable it.**

"The moment a vault first exists" = two places:

1. the end of the `wienerdog init --fresh-vault` path (a fresh default vault was
   just scaffolded), and
2. the end of `wienerdog adopt` (an existing vault was just adopted).

Requirements (ADR-0014):

- **Silent auto-schedule at 03:30**, `builtin:dream`, 20-minute timeout (matching
  `schedule add`'s dream default).
- **Idempotent**: if a `dream` job already exists, no-op.
- **Manifest-tracked + reversible**: recorded exactly like `schedule add` (a
  `scheduler-entry`), so `uninstall` reverses it.
- **Degrades, never breaks**: on a platform where scheduling is unsupported
  (Windows today; non-systemd Linux), vault creation must NOT fail — print a
  plain-language notice and continue.
- This is the SINGLE exception to ADR-0008's "nothing scheduled by default";
  catalog routines (digest, inbox triage, weekly review) stay opt-in.

Scheduling embeds the stable vendored bin path (ADR-0013, WP-042), so the vendored
copy must exist first. `init --fresh-vault` already runs `sync` (which vendors)
before this step. `adopt` does not run `sync`, so this WP has `adopt` call
`vendorSelf` defensively (idempotent) before scheduling.

## Current state

### `src/cli/init.js` — the fresh-vault branch (to extend)

`run(argv)` computes `vaultStep` (true only under `--fresh-vault` when no vault is
configured yet). When `vaultStep`, it scaffolds the vault, rewrites `vault:` in
config, then `await require('./sync').run(argv)` (which now vendors +
repoints), then prints:

```js
if (vaultStep) {
  console.log('\nwienerdog: installed with a fresh vault. Run `wienerdog doctor` to check the setup.');
}
```

You add the dream auto-schedule + summary inside this `vaultStep` branch, after
the `sync` call.

### `src/cli/adopt.js` — the tail (to extend)

`run(argv)` writes config (step 9), scaffolds mapped dirs (step 10),
`manifestLib.save(paths, manifest)` (step 11), then prints "adoption complete" and
a "Run wienerdog sync" hint. You add, after step 11, a defensive `vendorSelf` call
plus a manifest save, then the dream auto-schedule and a summary line.

### `src/cli/schedule.js` — registration you will reuse (WP-042/043)

`add()` builds `{name, at, run, timeoutMinutes}`, calls `jobsLib.saveJob(paths, job)`,
then `manifestLib.load`, `registerPlatform(paths, manifest, {name, hour, minute}, loader)`,
`manifestLib.save`. `registerPlatform` throws a `WienerdogError` on unsupported
platform / non-systemd Linux. `defaultLoader` honors `WIENERDOG_LOADER_NOOP`
(WP-043). `jobsLib.findJob(paths, name)` returns the job or `null`.

## Deliverables (permission boundary — touch ONLY these)

| Action | Path | Notes |
|--------|------|-------|
| modify | src/cli/schedule.js | add `ensureDreamSchedule()` |
| modify | src/cli/init.js | fresh-vault branch: call `ensureDreamSchedule` + summary line |
| modify | src/cli/adopt.js | after step 11: `vendorSelf` (defensive) + `ensureDreamSchedule` + summary |
| modify | tests/unit/scheduler-schedule.test.js | `ensureDreamSchedule`: schedules once, idempotent, degrades |
| modify | tests/unit/init.test.js | isolate HOME + `WIENERDOG_LOADER_NOOP`; assert dream scheduled + summary |
| modify | tests/integration/adopt-e2e.test.js | `WIENERDOG_LOADER_NOOP`; assert dream scheduled + summary |

### Exact contracts

**`src/cli/schedule.js` — `ensureDreamSchedule`.** Idempotent, degrades on
unsupported platforms, records the entry exactly like `add`:

```js
/**
 * Silently ensure the nightly dream is scheduled at 03:30 (ADR-0014). Idempotent:
 * if a `dream` job already exists, no-op. Degrades (no throw) on a platform where
 * scheduling is unsupported so vault creation never fails.
 * @param {import('../core/paths').WienerdogPaths} paths
 * @param {{loader?: (argv:string[])=>{status:number}}} [opts]
 * @returns {{scheduled:boolean, at?:string, reason?:string, message?:string}}
 */
function ensureDreamSchedule(paths, opts = {}) {
  const loader = opts.loader || defaultLoader;
  if (jobsLib.findJob(paths, 'dream')) return { scheduled: false, reason: 'exists' };
  const at = '03:30';
  const { hour, minute } = gen.parseAt(at);
  const job = { name: 'dream', at, run: 'builtin:dream', timeoutMinutes: 20 };
  jobsLib.saveJob(paths, job);
  const manifest = manifestLib.load(paths);
  try {
    registerPlatform(paths, manifest, { name: 'dream', hour, minute }, loader);
  } catch (err) {
    // Unsupported platform / non-systemd Linux: keep the job definition, but do
    // not fail vault creation. The user can schedule later once supported.
    manifestLib.save(paths, manifest);
    return { scheduled: false, reason: 'unsupported', message: err.message };
  }
  manifestLib.save(paths, manifest);
  return { scheduled: true, at };
}
```

Export `ensureDreamSchedule`.

**`src/cli/init.js` — fresh-vault branch.** After the `await require('./sync').run(argv)`
call, inside the `if (vaultStep)` summary block:

```js
if (vaultStep) {
  const { ensureDreamSchedule } = require('../scheduler/schedule');
  const d = ensureDreamSchedule(paths);
  console.log('\nwienerdog: installed with a fresh vault.');
  if (d.scheduled) {
    console.log(`Nightly memory (dreaming) is scheduled for ${d.at} to consolidate each day into your vault.`);
    console.log('Change or turn it off anytime: `wienerdog schedule remove dream`, or the routine menu (/wienerdog-routines).');
  } else if (d.reason === 'unsupported') {
    console.log('Nightly dreaming could not be auto-scheduled on this system yet; run `wienerdog dream` manually, or schedule it once supported.');
  }
  console.log('Run `wienerdog doctor` to check the setup.');
}
```

Replace the existing single `vaultStep` summary line with the block above (keep
the other branches — `vaultConfigured`, no-vault — unchanged).

**`src/cli/adopt.js` — after step 11 (`manifestLib.save(paths, manifest)`).**
Before the "adoption complete" prints:

```js
// Ensure the vendored app + PATH shim exist (adopt may run from an npx/temp copy
// and does not call sync), then silently schedule the nightly dream (ADR-0014).
const { vendorSelf, writeShim } = require('../core/vendor');
vendorSelf(paths, { manifest });
writeShim(paths, { manifest });
manifestLib.save(paths, manifest);
const { ensureDreamSchedule } = require('../scheduler/schedule');
const dream = ensureDreamSchedule(paths);
```

Then, inside the existing "next steps" prints, add:

```js
if (dream.scheduled) {
  console.log(`  Nightly dreaming: scheduled for ${dream.at} (change/disable: \`wienerdog schedule remove dream\` or /wienerdog-routines).`);
} else if (dream.reason === 'unsupported') {
  console.log('  Nightly dreaming: could not be auto-scheduled on this system yet — run `wienerdog dream` manually.');
}
```

### Example (evidence-shaped)

```
$ wienerdog init --fresh-vault --yes
…
wienerdog: installed with a fresh vault.
Nightly memory (dreaming) is scheduled for 03:30 to consolidate each day into your vault.
Change or turn it off anytime: `wienerdog schedule remove dream`, or the routine menu (/wienerdog-routines).
Run `wienerdog doctor` to check the setup.
```

`config.yaml` now has a `jobs:` block with `name: dream / at: "03:30" /
run: builtin:dream / timeout_minutes: 20`, and a `scheduler-entry` is recorded in
the manifest; `wienerdog uninstall` reverses it.

## Implementation notes & constraints

- No new npm dependencies; JSDoc only; idempotent + reversible (CLAUDE.md).
- **Hermeticity is critical — do NOT let tests touch the real scheduler or the
  real `~/Library/LaunchAgents`:**
  - `scheduler-schedule.test.js`: drive `ensureDreamSchedule(paths, {loader})`
    with a spy loader and a temp HOME (mirror the file's existing `setup()`).
    Cover: first call schedules a `dream` job (config gains the block, a
    `scheduler-entry` is recorded, loader spy called); second call is a no-op
    (`scheduled:false, reason:'exists'`); a simulated unsupported platform yields
    `scheduled:false, reason:'unsupported'` and NO throw.
  - `init.test.js`: `tempEnv()` already isolates `HOME` (added by WP-042 for the
    shim). Add `WIENERDOG_LOADER_NOOP: '1'` to the returned `env` so the default
    loader never spawns launchctl/systemctl. Then assert the fresh-vault run's
    stdout contains the dreaming summary, and that `config.yaml` gained the
    `jobs:`/`dream` block.
  - `adopt-e2e.test.js`: add `WIENERDOG_LOADER_NOOP: '1'` to the subprocess env
    (its HOME is already a temp dir). Assert the adopt run schedules the dream
    (stdout mentions nightly dreaming; `jobs:` block present) OR, if the CI
    platform cannot schedule, that it degraded gracefully (run still exits 0).
- `registerPlatform` on darwin also ensures the catch-up entry — that is desired
  and already idempotent; do not special-case it.
- Do not prompt. Do not gate on `--yes`. This is silent-by-design (ADR-0014).
- The summary lines reference interactive commands (`wienerdog schedule remove
  dream`, `wienerdog dream`) that resolve via the PATH shim WP-042 installs — a
  dependency already satisfied by the chain. Do not add any new PATH handling
  here.
- When uncertain: choose the simpler option, record it in the PR. Do NOT expand
  scope (e.g. do not add a config flag to opt out of default-scheduling —
  `schedule remove dream` is the documented off switch).

## Acceptance criteria

- [ ] `ensureDreamSchedule` schedules `dream` at 03:30 (`builtin:dream`, 20 min)
      exactly once; a second call returns `{scheduled:false, reason:'exists'}`
      and changes nothing.
- [ ] On a platform that cannot schedule, `ensureDreamSchedule` returns
      `{scheduled:false, reason:'unsupported'}` without throwing.
- [ ] `init --fresh-vault` schedules the dream and prints the summary + how to
      change/disable it; plain `init` (no vault) does NOT schedule.
- [ ] `adopt` vendors defensively, schedules the dream, and prints the summary.
- [ ] The scheduled dream is manifest-tracked; `uninstall` reverses it (covered
      by existing uninstall behavior — no new uninstall code).
- [ ] `npm test` and `npm run lint` pass; no test touches the real scheduler.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern 'scheduler-schedule'
npm test -- --test-name-pattern 'init'
npm test -- --test-name-pattern 'adopt'
npm test
npm run lint
```

## Out of scope (do NOT do these)

- Scheduling any catalog routine (digest, inbox, weekly review) by default — they
  stay opt-in (ADR-0008 unchanged).
- Update-availability checks — **WP-045/WP-046**.
- A config opt-out for default-scheduling — the off switch is
  `wienerdog schedule remove dream`.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/044-dream-scheduled-by-default`; conventional commits; PR titled
   `feat(schedule): schedule the nightly dream by default on vault creation (WP-044)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
