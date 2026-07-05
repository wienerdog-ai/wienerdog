---
id: WP-054
title: "`wienerdog update` verb + update-notice command switch (npx vs wienerdog update)"
status: Ready
model: opus
size: M
depends_on: [WP-053]
adrs: [ADR-0016, ADR-0013, ADR-0015, ADR-0004]
branch: wp/054-update-verb-and-notice-switch
---

# WP-054: `wienerdog update` verb + update-notice command switch

## Context (read this, nothing else)

Wienerdog is installed as plain files under `~/.wienerdog/` (the **canonical
core**). **IRON RULE (ADR-0004): Wienerdog is just files** — no daemons, no
telemetry, nothing that outlives its job. **No auto-update (ADR-0015):** Wienerdog
only ever *tells* the user a new version exists; the user runs the update command.

ADR-0013 vendors the app into `~/.wienerdog/app/<version>/` behind a stable
`app/current` symlink; `sync` re-vendors the running version, atomically repoints
`current`, and refreshes managed blocks / digest / OS schedules (schedules already
target the stable `app/current` path, so they don't move). The canonical update
command has been `npx wienerdog@latest sync`.

The owner has decided (ADR-0016) to add an **npm-independent** update path so
users without `npm`/`npx` can update too. This WP delivers two things:

1. **A new CLI verb, `wienerdog update`.** It fetches the latest published version
   from the npm registry (checksum-verified, WP-053), unpacks it into
   `app/<new>/`, then hands off to the **new version's** `sync` so that version
   re-vendors itself, repoints `current`, and refreshes everything. It works with
   or without npm and **never runs without the explicit command** (ADR-0004/0015).
2. **A command switch in the "update available" NOTICE.** ADR-0015's notice (in
   the digest and in `doctor`) currently always quotes `npx wienerdog@latest sync`.
   It must quote `npx wienerdog@latest sync` **when `npx` resolves on PATH** and
   `wienerdog update` **when it does not** — decided at render time by a pure,
   spawn-free PATH scan and frozen into the rendered line.

**The load-bearing subtlety (read twice):** `sync` runs `vendorSelf`, which
vendors *the running package* and repoints `current` at it. So after `update`
unpacks `app/<new>/`, you must run sync **from the new version's bin**
(`node <core>/app/<new>/bin/wienerdog.js sync`) — NOT the in-process/old sync. If
you called sync in-process, the OLD version would re-vendor itself and repoint
`current` **back to old**, silently undoing the update. `installVersion` (WP-053)
deliberately does NOT repoint `current`; the spawned new-version sync does.

## Current state

### `src/core/tarball.js` (WP-053 — the module you build on)

```js
/** @returns {Promise<{version:string, integrity:string}>} */
async function fetchLatestManifest(opts)            // opts.fetchManifest seam
/** creates <core>/app/<version>/; idempotent; does NOT repoint current or write manifest */
async function installVersion(paths, {version, integrity, downloadBuffer, fetchManifest, spawn})
  // → {version, target, alreadyPresent}
module.exports = { fetchLatestManifest, installVersion, /* … */ };
```

### `src/core/update-check.js` (WP-045/046 — to extend)

Current relevant exports and the notice renderers (verbatim, from disk):

```js
function isSemver(v)               // strict semver shape gate
function cmpRelease(a, b)          // -1|0|1 on major.minor.patch
function currentVersion()          // this build's package.json version
function getUpdateNotice(paths, current = currentVersion())
  // → {available:boolean, current:string, latest:string|null}

/** Fixed-template digest callout, or '' when no newer version is cached. */
function renderUpdateLine(paths, current = currentVersion()) {
  const n = getUpdateNotice(paths, current);
  if (!n.available) return '';
  return `> [!note] A newer Wienerdog is available (${n.current} → ${n.latest}). ` +
    `Update with: npx wienerdog@latest sync`;
}
```

Call sites of `renderUpdateLine(paths)` you must NOT break (they pass only
`paths`; keep that valid by giving new params defaults):
- `src/cli/sync.js`  → `renderUpdateLine(paths)`
- `src/cli/dream.js` → `renderUpdateLine(paths)`

### `src/cli/doctor.js` (to modify) — current update line, verbatim

```js
const upd = getUpdateNotice(paths);
if (upd.available) {
  console.log(`[info] a newer Wienerdog is available (${upd.current} → ${upd.latest}) — update: npx wienerdog@latest sync`);
}
```

### `bin/wienerdog.js` (to modify) — command table + USAGE

```js
const commands = {
  init: () => require('../src/cli/init'),
  adopt: () => require('../src/cli/adopt'),
  sync: () => require('../src/cli/sync'),
  dream: () => require('../src/cli/dream'),
  schedule: () => require('../src/cli/schedule'),
  'run-job': () => require('../src/cli/run-job'),
  doctor: () => require('../src/cli/doctor'),
  uninstall: () => require('../src/cli/uninstall'),
  gws: () => require('../src/gws/index'),
  grant: () => require('../src/cli/grant'),
};
```

USAGE lists one line per command under `Commands:` (see the file). Add `update`.

### `tests/unit/doctor.test.js` (to modify)

Line ~78 asserts the doctor notice matches
`/\[info\] a newer Wienerdog is available \(.* → 999\.0\.0\) — update: npx wienerdog@latest sync/`.
That assertion is **host-dependent** once the command switches on `npx`
availability. You will make it deterministic (inject an env that guarantees npx)
and add an npm-absent variant asserting `— update: wienerdog update`.

### `src/core/paths.js` / `errors.js` / vendor isolation helper

`getPaths({HOME, WIENERDOG_HOME})`; `WienerdogError`. Tests isolate **both** HOME
and WIENERDOG_HOME (copy `tempPaths()` from `tests/unit/vendor.test.js`).

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file (status flip),
     docs/specs/ROADMAP.md, package-lock.json. -->

| Action | Path | Notes |
|--------|------|-------|
| create | src/cli/update.js | the `wienerdog update` verb |
| modify | bin/wienerdog.js | register `update` in the command table + USAGE line |
| modify | src/core/update-check.js | add `npxAvailable`, `updateCommand`; thread into `renderUpdateLine` |
| modify | src/cli/doctor.js | use `updateCommand(process.env)` in the notice line |
| create | tests/unit/update.test.js | hermetic; injected seams + fixture tgz + spawn-sync seam |
| modify | tests/unit/update-check.test.js | `npxAvailable`/`updateCommand` both variants; `renderUpdateLine` both variants |
| modify | tests/unit/doctor.test.js | make the notice assertion env-deterministic; add npm-absent variant |
| modify | src/core/tarball.js | partial-dir recovery (owner amendment, see below) |
| modify | tests/unit/tarball.test.js | partial-dir recovery cases (owner amendment, see below) |

### Owner amendment (2026-07-05, from the WP-053 review)

The WP-053 reviewer found (and reproduced) a recovery gap: a pre-existing
*partial* `app/<version>/` dir — a crash leftover, or the loser of two
same-version installs — makes `installVersion`'s final `renameSync` throw a raw
`ENOTEMPTY` (a stack trace, not a clean message), and the state can never
self-heal. Root cause: completeness is judged by the sentinel bin file, but
publish is rename-onto-absent-dir — inconsistent for the partial case.

Amended contract for `installVersion` (both changes, with tests):

1. After the completeness check decides the target is NOT complete (sentinel
   bin file absent) but the target dir EXISTS, remove the incomplete target
   dir (`fs.rmSync(target, { recursive: true, force: true })`) before the
   staging rename — the verified staged tree then publishes normally.
2. Wrap any residual rename failure in a `WienerdogError` with a
   plain-language message (never a raw fs stack for this path).

Tests: (a) plant a partial `app/<v>/` (dir present, sentinel bin absent) →
installVersion succeeds, dir replaced by the verified tree; (b) complete dir
still short-circuits with `alreadyPresent:true` and zero downloads (existing
behavior unchanged).

### Exact contracts

**Additions to `src/core/update-check.js`:**

```js
const path = require('node:path');  // already imported at top of the file
const fs = require('node:fs');      // already imported

/** True iff an `npx` executable resolves on PATH — pure scan, NO spawn, NO
 *  network. Mirrors what a shell's `command -v npx` decides.
 *  @param {NodeJS.ProcessEnv} [env] @returns {boolean} */
function npxAvailable(env = process.env) {
  const dirs = (env.PATH || '').split(path.delimiter).filter(Boolean);
  const names = process.platform === 'win32' ? ['npx.cmd', 'npx.exe', 'npx'] : ['npx'];
  for (const d of dirs) {
    for (const n of names) {
      const p = path.join(d, n);
      try {
        if (process.platform === 'win32') { if (fs.existsSync(p)) return true; }
        else { fs.accessSync(p, fs.constants.X_OK); return true; }
      } catch { /* not here; keep scanning */ }
    }
  }
  return false;
}

/** The exact update command to quote to the user: npx happy-path when present,
 *  else the npm-independent verb. @param {NodeJS.ProcessEnv} [env] @returns {string} */
function updateCommand(env = process.env) {
  return npxAvailable(env) ? 'npx wienerdog@latest sync' : 'wienerdog update';
}
```

Change `renderUpdateLine` to take an optional `env` (default `process.env`) and
use `updateCommand(env)` for the trailing command — keep the rest byte-identical:

```js
function renderUpdateLine(paths, current = currentVersion(), env = process.env) {
  const n = getUpdateNotice(paths, current);
  if (!n.available) return '';
  return `> [!note] A newer Wienerdog is available (${n.current} → ${n.latest}). ` +
    `Update with: ${updateCommand(env)}`;
}
```

Export `npxAvailable` and `updateCommand` alongside the existing exports. (Existing
callers `renderUpdateLine(paths)` still work — `current` and `env` default.)

**`src/cli/doctor.js`** — replace the hardcoded command with the switch:

```js
const { getUpdateNotice, updateCommand } = require('../core/update-check');
// …
const upd = getUpdateNotice(paths);
if (upd.available) {
  console.log(`[info] a newer Wienerdog is available (${upd.current} → ${upd.latest}) — update: ${updateCommand(process.env)}`);
}
```

**`src/cli/update.js`** — implement exactly this behavior:

```js
'use strict';
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { getPaths } = require('../core/paths');
const { WienerdogError } = require('../core/errors');
const { currentVersion, cmpRelease } = require('../core/update-check');
const { fetchLatestManifest, installVersion } = require('../core/tarball');
const { currentBin } = require('../core/vendor');

/**
 * `wienerdog update` — fetch the latest published version from the npm registry,
 * verify its checksum, unpack it into the vendored app dir, then hand off to the
 * NEW version's `sync` (which repoints current + refreshes managed blocks,
 * digest, schedules). Works with or without npm. Only ever runs when the user
 * types this command (ADR-0004/0015: no auto-update).
 *
 * @param {string[]} argv  supports --dry-run
 * @param {{fetchManifest?:Function, downloadBuffer?:Function, spawn?:Function,
 *          runSync?:(binPath:string)=>{status:number|null}, current?:string}} [opts]
 * @returns {Promise<void>}
 */
async function run(argv, opts = {}) {
  const dryRun = argv.includes('--dry-run');
  const paths = getPaths();
  const cur = opts.current || currentVersion();

  const man = await fetchLatestManifest(opts);          // {version, integrity} — throws on bad input
  if (cmpRelease(man.version, cur) <= 0) {
    console.log(`wienerdog: already up to date (v${cur}).`);
    return;
  }

  console.log(`wienerdog: updating v${cur} → v${man.version}.`);
  console.log(`  will download the verified package from the npm registry and unpack it to`);
  console.log(`  ${require('../core/vendor').appDir(paths)}/${man.version}`);
  if (dryRun) { console.log('--dry-run: no changes made.'); return; }

  const res = await installVersion(paths, {
    version: man.version, integrity: man.integrity,
    downloadBuffer: opts.downloadBuffer, fetchManifest: opts.fetchManifest, spawn: opts.spawn,
  });
  console.log(`wienerdog: unpacked v${res.version}${res.alreadyPresent ? ' (already present)' : ''}.`);

  // Hand off to the NEW version's sync so IT re-vendors + repoints current.
  const newBin = path.join(res.target, 'bin', 'wienerdog.js');
  const runSync = opts.runSync || ((bin) =>
    spawnSync(process.execPath, [bin, 'sync'], { stdio: 'inherit' }));
  const s = runSync(newBin);
  if (!s || s.status !== 0) {
    throw new WienerdogError(`update unpacked v${res.version} but 'sync' failed — run 'wienerdog sync' to finish.`);
  }
  console.log(`wienerdog: updated to v${res.version}.`);
}

module.exports = { run };
```

**`bin/wienerdog.js`** — add to the command table and USAGE:

```js
update: () => require('../src/cli/update'),
```

USAGE `Commands:` block — add after `sync` (plain language, knowledge-worker tone):

```
  update      Update Wienerdog to the latest published version (no npm required)
```

### Example (evidence-shaped)

Running version `0.3.1`, registry `latest` is `0.4.0`:

```
$ wienerdog update
wienerdog: updating v0.3.1 → v0.4.0.
  will download the verified package from the npm registry and unpack it to
  /Users/x/.wienerdog/app/0.4.0
wienerdog: unpacked v0.4.0.
wienerdog: vendored app 0.4.0.
…(sync output)…
wienerdog: updated to v0.4.0.
```

Already current:

```
$ wienerdog update
wienerdog: already up to date (v0.4.0).
```

Notice on a machine WITH npx (digest line):
`> [!note] A newer Wienerdog is available (0.3.1 → 0.4.0). Update with: npx wienerdog@latest sync`

Notice on a machine WITHOUT npx:
`> [!note] A newer Wienerdog is available (0.3.1 → 0.4.0). Update with: wienerdog update`

## Implementation notes & constraints

- **No new npm dependencies.** JSDoc types; no TypeScript; no build step.
- **Do not call sync in-process.** The whole point (see Context) is to run sync
  **from the new version's bin** via a child process so the NEW version vendors
  itself. `opts.runSync` is the test seam; default spawns
  `process.execPath <newBin> sync` with inherited stdio.
- **`update` forces a fresh registry read** (it does NOT consult the 24h
  update-check cache / `maybeRefresh`) — the user asked explicitly. Use
  `fetchLatestManifest` directly.
- **Idempotency:** if `installVersion` returns `alreadyPresent:true` (the version
  dir already existed) still run sync (it repoints current + refreshes; sync is
  itself idempotent). Running `update` twice ends in the same state.
- **`--dry-run`** prints the plan and stops before any download.
- **Hermeticity (binding):** `update.test.js` MUST NOT touch the network. Inject
  `opts.fetchManifest` (returns a manifest JSON string with `version` +
  `integrity`), `opts.downloadBuffer` (returns fixture-tgz bytes), and
  `opts.runSync` (a stub recording the bin path; return `{status:0}`). Build the
  fixture tgz with `tar` offline exactly as WP-053's test does, computing its real
  sha512 integrity so `installVersion`'s verify passes. Run everything under a
  temp `HOME`+`WIENERDOG_HOME`.
- **Update tests to cover:** (a) newer available → installs + runSync called with
  `<core>/app/<new>/bin/wienerdog.js`; (b) already current (manifest.version ≤
  `opts.current`) → prints "already up to date", `downloadBuffer`/`runSync` NEVER
  called; (c) `--dry-run` → no download, no runSync; (d) runSync returns
  `{status:1}` → throws `WienerdogError` mentioning `wienerdog sync`.
- **`update-check.test.js` — host-independence is binding.** Existing assertions
  on `renderUpdateLine`'s command MUST inject an env: for the npx variant, an env
  whose `PATH` contains a temp dir with an executable `npx` stub; for the
  wienerdog-update variant, an env whose `PATH` is a temp dir with NO npx. Never
  rely on whether the CI host happens to have npx. Add direct `npxAvailable`
  true/false tests and `updateCommand` tests the same way.
- **`doctor.test.js`:** make the existing notice test deterministic by running
  doctor with a `PATH` env that contains an npx stub (assert `— update: npx
  wienerdog@latest sync`), and add a second case with an npx-free `PATH` (assert
  `— update: wienerdog update`). doctor reads `process.env` inside its process, so
  set `PATH` in the child's `env` (doctor is spawned in that test — mirror the
  existing spawn setup).
- When uncertain: simpler option; record it in the PR. Do NOT expand scope.

## Acceptance criteria

- [ ] `npxAvailable(env)` is `true` when `PATH` has an executable `npx`, `false`
      otherwise (tested with temp dirs, not the host).
- [ ] `updateCommand(env)` returns `npx wienerdog@latest sync` with npx present,
      `wienerdog update` without.
- [ ] `renderUpdateLine` emits the correct command for each env; the `available`
      gate and template text are otherwise unchanged; `renderUpdateLine(paths)`
      (single arg) still works.
- [ ] `doctor` prints `— update: npx wienerdog@latest sync` when npx is on PATH and
      `— update: wienerdog update` when it is not.
- [ ] `wienerdog update` when newer: unpacks `app/<new>/` and runs sync from
      `app/<new>/bin/wienerdog.js` (asserted via the `runSync` seam).
- [ ] `wienerdog update` when already current: prints "already up to date" and
      performs no download and no sync.
- [ ] `wienerdog update --dry-run`: prints the plan, downloads nothing.
- [ ] A failed handoff sync throws a `WienerdogError` telling the user to run
      `wienerdog sync`.
- [ ] `bin/wienerdog.js help` lists `update`; `wienerdog update` dispatches.
- [ ] `npm test` and `npm run lint` pass; no test performs real network I/O.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern 'update'
npm test -- --test-name-pattern 'doctor'
npm test
npm run lint
node bin/wienerdog.js help | grep -E '^\s+update\b'
```

## Out of scope (do NOT do these)

- The tarball fetch/verify/unpack module itself — **WP-053** (you only consume it).
- Any change to `install.sh` — **WP-055**.
- Changing `vendorSelf`/`repointCurrent`/`sync`'s vendor logic — you reuse them
  as-is; the new version's `sync` does the repoint.
- Wiring `update` into any scheduled/automatic path — it is user-invoked ONLY
  (ADR-0004/0015).
- The npm-less `googleapis` message (documentation follow-up, ADR-0016 §6).

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/054-update-verb-and-notice-switch`; conventional commits; PR titled
   `feat(update): add 'wienerdog update' verb + npx-aware notice switch (WP-054)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
