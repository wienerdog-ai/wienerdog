---
id: WP-043
title: sync repoints existing schedules to the vendored entry (migration)
status: In-Review
model: opus
size: S
depends_on: [WP-042]
adrs: [ADR-0013, ADR-0004]
branch: wp/043-sync-repoints-schedules
---

# WP-043: sync repoints existing schedules to the vendored entry (migration)

## Context (read this, nothing else)

WP-042 made Wienerdog vendor its own package into `~/.wienerdog/app/<version>/`
and point new scheduler entries at the stable
`~/.wienerdog/app/current/bin/wienerdog.js` (ADR-0013). But **already-installed
machines** — including the two live dogfood installs — have launchd plists /
systemd units that still embed the OLD path (a git checkout, or a now-stale npx
cache dir). Those stale entries do not fix themselves; the nightly dream keeps
firing against a path that may be gone.

**`npx wienerdog@latest sync` is the canonical update command (ADR-0013).** This
WP makes `sync`, right after it vendors the new version (WP-042), **idempotently
re-register every scheduled job** so its OS entry points at the stable vendored
bin. Because `registerPlatform` already writes plist/unit content deterministically
and only rewrites+reloads when the content changed, the first post-upgrade `sync`
rewrites each stale entry once and reloads it; every subsequent `sync` is a
no-op. That is the migration.

Iron rule (ADR-0004): this starts nothing that outlives its job — it rewrites
files and asks the OS scheduler to reload, synchronously, then returns.

## Current state

### `src/cli/schedule.js` — registration you will reuse

> Spec-path note (WP-043 impl): the registration lives in `src/cli/schedule.js`
> (not `src/scheduler/schedule.js`, which does not exist). Paths corrected below.

`registerPlatform(paths, manifest, {name, hour, minute}, loader)` writes the
per-job launchd plist (darwin) or systemd `.timer`+`.service` (systemd Linux) via
`ensureEntry` (idempotent: rewrites+reloads only when content differs) and, on
darwin, ensures the catch-up entry. It **throws** a `WienerdogError` on an
unsupported platform or a non-systemd Linux. It uses a `loader` to talk to the OS
(`launchctl`/`systemctl`); tests inject a spy. `parseAt(at)` → `{hour, minute}`.
`jobsLib.listJobs(paths)` returns all defined jobs (`{name, at, run, timeoutMinutes}`).

`defaultLoader(argv)` runs `spawnSync(argv[0], argv.slice(1))`. `run(argv, {loader})`
is the CLI entry.

### `src/scheduler/generators.js` — catch-up loader

`defaultCatchupLoader(argv)` runs `spawnSync(...)` (used by `ensureCatchup`).

### `src/cli/sync.js` — the compiler pass (extended by WP-042)

After WP-042, `run(argv)` loads the manifest and calls `vendorSelf(paths, {manifest})`
on non-dry-run. You will add a repoint step right after vendoring, and give `sync.run`
an injectable `loader` seam so higher-level tests stay off the real scheduler.

## Deliverables (permission boundary — touch ONLY these)

| Action | Path | Notes |
|--------|------|-------|
| modify | src/cli/schedule.js | add `repointSchedules()`; `defaultLoader` honors `WIENERDOG_LOADER_NOOP` |
| modify | src/scheduler/generators.js | `defaultCatchupLoader` honors `WIENERDOG_LOADER_NOOP` |
| modify | src/cli/sync.js | `run(argv, opts)`; call `repointSchedules` after vendoring (non-dry-run) |
| create | tests/unit/sync-repoint.test.js | old-path plist → rewritten to stable path; idempotent second run |
| modify | tests/unit/scheduler-schedule.test.js | `repointSchedules` idempotency + unsupported-platform degrade |

### Exact contracts

**`src/cli/schedule.js` — `repointSchedules`.** Re-register every defined
job on the current platform so its OS entry points at the (now vendored) stable
bin. Idempotent; never throws (a job on an unsupported platform degrades to a
notice, so `sync` never fails because of it):

```js
/**
 * Re-register every defined job's OS scheduler entry (ADR-0013 migration): after
 * vendoring, this rewrites any entry that still embeds an old bin path so it
 * targets the stable vendored bin. Idempotent — registerPlatform rewrites+reloads
 * only when content changed. A job on a platform that cannot be scheduled
 * (unsupported OS / non-systemd Linux) is skipped with a notice, never a throw.
 * @param {import('../core/paths').WienerdogPaths} paths
 * @param {import('../core/manifest').Manifest} manifest
 * @param {{loader?: (argv:string[])=>{status:number}}} [opts]
 * @returns {{repointed:number, changed:number, notices:string[]}}
 */
function repointSchedules(paths, manifest, opts = {}) {
  const loader = opts.loader || defaultLoader;
  const jobs = jobsLib.listJobs(paths);
  let repointed = 0;
  let changed = 0;
  /** @type {string[]} */ const notices = [];
  for (const job of jobs) {
    let hm;
    try { hm = gen.parseAt(job.at); } catch { notices.push(`skip "${job.name}": bad time ${job.at}`); continue; }
    try {
      const res = registerPlatform(paths, manifest, { name: job.name, hour: hm.hour, minute: hm.minute }, loader);
      repointed += 1;
      if (res.changed) changed += 1;
    } catch (err) {
      notices.push(`could not repoint "${job.name}": ${err.message}`);
    }
  }
  return { repointed, changed, notices };
}
```

Export `repointSchedules` from `schedule.js`'s `module.exports`.

**Loader no-op seam (both files).** So higher-level tests (this WP's, and
WP-044's init/adopt tests) never touch the real scheduler, make the DEFAULT
loaders honor an env kill-switch. Add as the FIRST line of each default loader:

```js
// schedule.js defaultLoader AND generators.js defaultCatchupLoader:
if (process.env.WIENERDOG_LOADER_NOOP) return { status: 0 };
```

(Injected loaders passed via `opts.loader` are unaffected; this only neutralizes
the real-spawn defaults.)

**`src/cli/sync.js` — wire repoint + loader seam.** Change the signature to
`async function run(argv, opts = {})` and, right after the WP-042 vendoring block
(non-dry-run only), repoint:

```js
if (!dryRun) {
  const { repointSchedules } = require('./schedule');
  const r = repointSchedules(paths, manifest, { loader: opts.loader });
  if (r.changed > 0) console.log(`wienerdog: repointed ${r.changed} schedule(s) to the vendored app.`);
  for (const n of r.notices) console.log(`  note: ${n}`);
}
```

`init.js` calls `sync.run(argv)` (no opts) → production uses `defaultLoader`
(which honors `WIENERDOG_LOADER_NOOP` for subprocess tests). This WP does NOT
change `init.js`.

### Example (evidence-shaped)

A machine upgraded from a checkout install has
`~/Library/LaunchAgents/ai.wienerdog.dream.plist` embedding
`…/some-checkout/bin/wienerdog.js`. `npx wienerdog@latest sync` vendors 0.3.0,
then `repointSchedules` rewrites that plist to
`…/.wienerdog/app/current/bin/wienerdog.js` and reloads it (prints
`repointed 1 schedule(s)`). Running `sync` again prints nothing about schedules
(content identical → no rewrite, no reload).

## Implementation notes & constraints

- No new npm dependencies; JSDoc only; idempotent + reversible (CLAUDE.md).
- **Hermeticity**: `sync-repoint.test.js` runs in a temp `WIENERDOG_HOME`, sets
  `WIENERDOG_LOADER_NOOP=1` (so the default loaders never spawn), and pre-seeds a
  job (`jobsLib.saveJob`) plus a plist/unit file whose embedded bin path is a
  fake "old" path; it asserts `sync` rewrites that file to contain
  `vendor.currentBin(paths)`, and that a second `sync` leaves the file
  byte-identical. Use `{skip}` guards for platform-specific assertions (mirror
  `scheduler-schedule.test.js`), or drive `repointSchedules` directly with an
  injected loader spy for the platform-neutral idempotency assertions.
- `scheduler-schedule.test.js` additions: a `repointSchedules` call after a
  `schedule add` is a no-op (`changed:0`); after hand-editing the entry's bin
  path to an old value it reports `changed:1` and rewrites it; on a simulated
  unsupported platform the job is collected in `notices` and no throw escapes.
- Do not couple `sync` to a specific OS — `repointSchedules` already degrades on
  unsupported platforms.

## Acceptance criteria

- [ ] `repointSchedules` re-registers every defined job idempotently: no content
      change → `changed:0`; a stale bin path → rewritten to the stable vendored
      bin and `changed` incremented.
- [ ] A job on an unsupported platform / non-systemd Linux is reported in
      `notices` and does NOT throw; `sync` completes successfully.
- [ ] `sync` (non-dry-run) repoints after vendoring; `sync --dry-run` repoints
      nothing.
- [ ] Both default loaders return `{status:0}` without spawning when
      `WIENERDOG_LOADER_NOOP` is set; injected loaders are unaffected.
- [ ] `npm test` and `npm run lint` pass.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern 'sync-repoint'
npm test -- --test-name-pattern 'scheduler-schedule'
npm test
npm run lint
```

## Out of scope (do NOT do these)

- Auto-scheduling the dream on vault creation — **WP-044** (it reuses the loader
  no-op seam this WP adds).
- Update-availability checks — **WP-045/WP-046**.
- Changing `init.js` or `adopt.js`.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/043-sync-repoints-schedules`; conventional commits; PR titled
   `feat(sync): repoint existing schedules to the vendored app entry (WP-043)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
