---
id: WP-042
title: Vendor the package into the core; schedules target a stable app/current entry
status: Ready
model: opus
size: M
depends_on: []
adrs: [ADR-0013, ADR-0004]
branch: wp/042-vendored-install
---

# WP-042: Vendor the package into the core; schedules target a stable app/current entry

## Context (read this, nothing else)

Wienerdog installs files, never a daemon (ADR-0004). One of the files it writes
is an **OS-native scheduler entry** (a launchd plist on macOS, a systemd user
timer/service on Linux) that runs `wienerdog run-job <name>` every night. That
entry embeds an **absolute path to the `wienerdog` package copy** that created
it. Today `src/scheduler/generators.js` computes that path as
`path.resolve(__dirname, '..', '..', 'bin', 'wienerdog.js')` — the path of the
*running* package.

Under the shipped install flow (`curl … | bash` → `npx wienerdog@latest init`)
the running copy lives in the **npx cache**
(`~/.npm/_npx/<hash>/node_modules/wienerdog/`). That cache is ephemeral: any
`npm cache clean`, npx garbage-collection, or version churn can delete or move
it. The scheduler entry is long-lived and keeps pointing at the vanished path —
so the nightly dream silently stops running against a dead path. That is the bug
this WP fixes.

**The decided fix (ADR-0013): vendor the package into the canonical core.**
`init`/`sync` copy the published files into `~/.wienerdog/app/<version>/` and
maintain a stable symlink `~/.wienerdog/app/current` pointing at the active
version. Every long-lived reference — scheduler entries, the catch-up entry, and
`run-job`'s own self-invocations — targets the stable
`~/.wienerdog/app/current/bin/wienerdog.js`. Only the symlink's target changes
across versions, so the generated plist/unit content is version-independent and
idempotent. This WP builds the vendoring mechanism and repoints
`generators.wienerdogBin()` at the stable path. **A companion WP (WP-043)
migrates already-installed schedules to the stable path;** this WP does not.

Key facts you must respect:

- **Zero runtime deps in the vendored copy.** The published `files` list has no
  `node_modules`; `googleapis` (the one runtime dep) is *not* vendored. Commands
  that need it (`gws`) will not run from the vendored copy — that is acceptable
  and intentional (ADR-0013). `dream` and job dispatch need only Node.
- **Idempotent + reversible** (CLAUDE.md): a second `sync` makes zero *content*
  changes; `uninstall` removes the whole vendored tree.
- **Dev mode**: when the running package root is a git checkout (has a `.git`
  dir) or `WIENERDOG_DEV=1`, do NOT freeze a snapshot — point `current` at the
  checkout root so a developer's edits take effect. This repo runs that way.

## Current state

### `src/scheduler/generators.js` — the stale path (to fix)

```js
function nodePath() { return process.execPath; }          // KEEP unchanged
function wienerdogBin() {                                   // CHANGE: take paths
  return path.resolve(__dirname, '..', '..', 'bin', 'wienerdog.js');
}
```

`wienerdogBin()` is called (no args today) from:

- `generators.js` `ensureCatchup(paths, opts)` — `bin: wienerdogBin()`.
- `src/scheduler/schedule.js` `registerPlatform(paths, …)` — `const bin = gen.wienerdogBin();`
  and its local `ensureCatchup(paths, …)` — `gen.wienerdogBin()`.
- `src/cli/run-job.js` `resolveCommand(job)` (builtin dream) — `gen.wienerdogBin()`;
  and `defaultSendAlert(paths, …)` — `gen.wienerdogBin()`.

Every caller already has a `paths` in scope EXCEPT `resolveCommand(job)`, which
must gain a `paths` parameter (its only caller, `runJob`, has `paths`).

### `src/core/manifest.js` — reverse kinds (to extend)

`reverse()` dispatches on `entry.kind` (`file`/`dir`/`symlink`/`managed-block`/
`settings-entry`/`scheduler-entry`, else "unknown kind" warning). It maintains a
`removedSet` so a `dir` entry counts as empty when all its recorded children are
in the set. You will add one kind, `vendored-tree`, whose reverse recursively
removes the tree and adds its path to `removedSet` (so the enclosing core `dir`
still counts as empty and gets removed).

### `src/cli/sync.js` — the compiler pass (to extend)

`run(argv)` resolves `paths`, validates the vault, loads the manifest
(`const manifest = manifestMod.load(paths);`), renders the digest, stages skills,
applies adapters, saves the manifest. You will call `vendorSelf(paths, {manifest})`
right after the manifest load, on non-dry-run only. `init.js` already calls
`sync.run(argv)` at the end of every install, so init inherits vendoring for free.

## Deliverables (permission boundary — touch ONLY these)

| Action | Path | Notes |
|--------|------|-------|
| create | src/core/vendor.js | `vendorSelf`, path helpers, dev detection, atomic repoint |
| modify | src/core/manifest.js | add `vendored-tree` kind + `reverseVendoredTree` + export + doc comment |
| modify | src/scheduler/generators.js | `wienerdogBin(paths)`; `ensureCatchup` passes `paths` |
| modify | src/scheduler/schedule.js | pass `paths` to every `gen.wienerdogBin()` call |
| modify | src/cli/run-job.js | `resolveCommand(paths, job)` + call site; `defaultSendAlert` passes `paths` |
| modify | src/cli/sync.js | call `vendorSelf(paths, {manifest})` after manifest load (skip on dry-run) |
| create | tests/unit/vendor.test.js | prod-mode copy, dev-mode symlink, idempotency, atomic repoint |
| modify | tests/unit/manifest.test.js | `vendored-tree` reverse removes the tree + empties the core |
| modify | tests/unit/scheduler-generators.test.js | update `wienerdogBin(paths)` call(s) |
| modify | tests/unit/scheduler-runjob.test.js | update `resolveCommand(paths, job)` call(s) |

### Exact contracts

**`src/core/vendor.js`** — implement exactly this shape:

```js
'use strict';
const fs = require('node:fs');
const path = require('node:path');

// Published-files list to vendor (matches package.json "files" + package.json
// itself). NEVER copies node_modules or .git (not in this list). ADR-0013.
const COPY_INCLUDE = ['bin', 'src', 'skills', 'templates', 'package.json'];

/** Root of the RUNNING package (…/wienerdog). @returns {string} */
function packageRoot() { return path.resolve(__dirname, '..', '..'); }

/** @param {string} root @returns {string} version from <root>/package.json */
function readVersion(root) {
  return JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
}

/** @param {import('./paths').WienerdogPaths} paths @returns {string} <core>/app */
function appDir(paths) { return path.join(paths.core, 'app'); }
/** @param {import('./paths').WienerdogPaths} paths @returns {string} <core>/app/current */
function currentLink(paths) { return path.join(appDir(paths), 'current'); }
/** Stable bin the scheduler + self-invocations target.
 *  @param {import('./paths').WienerdogPaths} paths @returns {string} */
function currentBin(paths) { return path.join(currentLink(paths), 'bin', 'wienerdog.js'); }

/** Dev checkout? A `.git` dir at `root`, or WIENERDOG_DEV=1.
 *  @param {string} root @param {NodeJS.ProcessEnv} [env] @returns {boolean} */
function isDevCheckout(root, env = process.env) {
  if (env.WIENERDOG_DEV === '1') return true;
  try { return fs.statSync(path.join(root, '.git')).isDirectory(); } catch { return false; }
}

/** Copy the COPY_INCLUDE entries from srcRoot into destRoot (overwrite).
 *  @param {string} srcRoot @param {string} destRoot */
function copyTree(srcRoot, destRoot) {
  fs.mkdirSync(destRoot, { recursive: true });
  for (const name of COPY_INCLUDE) {
    const src = path.join(srcRoot, name);
    let st;
    try { st = fs.statSync(src); } catch { continue; } // missing entry → skip
    const dest = path.join(destRoot, name);
    if (st.isDirectory()) fs.cpSync(src, dest, { recursive: true });
    else fs.copyFileSync(src, dest);
  }
}

/** Atomically point <core>/app/current at targetDir (temp symlink + rename).
 *  @param {import('./paths').WienerdogPaths} paths @param {string} targetDir */
function repointCurrent(paths, targetDir) {
  const link = currentLink(paths);
  const tmp = `${link}.tmp.${process.pid}`;
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ }
  fs.symlinkSync(targetDir, tmp);
  fs.renameSync(tmp, link); // rename over an existing symlink is atomic on POSIX
}

/**
 * Vendor the running package into the core and repoint `current`.
 * - Prod: copy the published files into <core>/app/<version>/ (idempotent: if
 *   that version dir already exists, do NOT re-copy), then repoint current.
 * - Dev: point current at the checkout root itself (no copy).
 * Records the vendored-tree manifest entry once. Never throws on an already-
 * present version. Single-writer assumption (install is not concurrent).
 * @param {import('./paths').WienerdogPaths} paths
 * @param {{manifest?: object, env?: NodeJS.ProcessEnv, sourceRoot?: string}} [opts]
 * @returns {{version:string, target:string, dev:boolean, copied:boolean}}
 */
function vendorSelf(paths, opts = {}) {
  const env = opts.env || process.env;
  const root = opts.sourceRoot || packageRoot();
  const version = readVersion(root);
  const dev = isDevCheckout(root, env);
  const app = appDir(paths);
  fs.mkdirSync(app, { recursive: true });
  if (opts.manifest) recordOnce(opts.manifest, { kind: 'vendored-tree', path: app });

  let target;
  let copied = false;
  if (dev) {
    target = root;
  } else {
    target = path.join(app, version);
    if (!fs.existsSync(target)) {
      const staging = `${target}.staging.${process.pid}`;
      fs.rmSync(staging, { recursive: true, force: true });
      copyTree(root, staging);
      fs.renameSync(staging, target); // atomic publish of the version dir
      copied = true;
    }
  }
  repointCurrent(paths, target);
  return { version, target, dev, copied };
}

/** Record an entry only if no entry with the same kind+path exists. */
function recordOnce(manifest, entry) {
  const exists = manifest.entries.some((e) => e.kind === entry.kind && e.path === entry.path);
  if (!exists) manifest.entries.push(entry);
}

module.exports = {
  packageRoot, readVersion, appDir, currentLink, currentBin,
  isDevCheckout, copyTree, repointCurrent, vendorSelf,
};
```

**`src/core/manifest.js` — new `vendored-tree` kind.** Add this reverse and wire
it into `reverse()`'s dispatch and `module.exports`; extend the shape doc comment
(one line: `{kind:'vendored-tree', path}` — the vendored app tree, removed
recursively on uninstall):

```js
/**
 * Reverse a 'vendored-tree' entry: recursively remove the vendored app tree
 * (entirely Wienerdog-authored, regenerable by `sync`). Adds the path to
 * removedSet so the enclosing core dir still counts as empty. In dev mode the
 * tree holds only the `current` symlink; removing it never touches the checkout.
 */
function reverseVendoredTree(entry, dryRun, removed, skipped, removedSet) {
  if (!isDir(entry.path)) { skipped.push(entry.path); return; }
  if (!dryRun) fs.rmSync(entry.path, { recursive: true, force: true });
  removedSet.add(entry.path);
  removed.push(entry.path);
}
```

Dispatch: add `else if (entry.kind === 'vendored-tree') reverseVendoredTree(entry, dryRun, removed, skipped, removedSet);` in `reverse()`, BEFORE the "unknown kind" fallback. Export `reverseVendoredTree` alongside `reverseSchedulerEntry`.

**`src/scheduler/generators.js` — stable bin.** Change the signature and body:

```js
/** Absolute path to the STABLE vendored bin (ADR-0013). Survives version bumps:
 *  only the `current` symlink's target changes, so scheduler entries are
 *  version-independent. @param {import('../core/paths').WienerdogPaths} paths */
function wienerdogBin(paths) {
  return require('../core/vendor').currentBin(paths);
}
```

Update `ensureCatchup` in this file: `bin: wienerdogBin(paths)` (it already has `paths`). `nodePath()` is unchanged.

**`src/scheduler/schedule.js`** — replace every `gen.wienerdogBin()` with
`gen.wienerdogBin(paths)` (both in `registerPlatform` and the local `ensureCatchup`;
`paths` is in scope in both).

**`src/cli/run-job.js`** — `resolveCommand` gains `paths`:

```js
function resolveCommand(paths, job) {
  const fake = process.env.WIENERDOG_RUNJOB_CMD;
  if (fake) return { command: fake, args: [], shell: true };
  // …unchanged, except:
  //   builtin dream → args: [gen.wienerdogBin(paths), 'dream', '--yes']
}
```

Update its only call site in `runJob`: `const { command, args, shell } = resolveCommand(paths, job);`. In `defaultSendAlert(paths, …)`, change `gen.wienerdogBin()` → `gen.wienerdogBin(paths)`. Update the exported `resolveCommand` and its test call (below).

**`src/cli/sync.js`** — after `const manifest = manifestMod.load(paths);`, before
the digest step, add (dry-run makes no writes):

```js
const { vendorSelf } = require('../core/vendor');
if (!dryRun) {
  const v = vendorSelf(paths, { manifest });
  console.log(`wienerdog: vendored app ${v.version}${v.dev ? ' (dev checkout — linked in place)' : ''}.`);
}
```

### Example (evidence-shaped)

Prod install of 0.2.1 → `~/.wienerdog/app/0.2.1/{bin,src,skills,templates,package.json}`
plus `~/.wienerdog/app/current -> ~/.wienerdog/app/0.2.1`. A launchd plist then
embeds `<string>/Users/ada/.wienerdog/app/current/bin/wienerdog.js</string>`. On
upgrade to 0.3.0, `sync` copies `app/0.3.0/`, atomically repoints `current`, and
the plist text is unchanged (still `…/app/current/bin/wienerdog.js`).

Dev checkout → no copy; `~/.wienerdog/app/current -> /path/to/checkout` and the
bin resolves to `/path/to/checkout/bin/wienerdog.js`.

## Implementation notes & constraints

- No new npm dependencies; plain Node ≥ 18 (`fs.cpSync` is available). JSDoc only.
- **`nodePath()` (`process.execPath`) is intentionally unchanged** — it is a
  system node binary, not the npx cache. nvm-version staleness is a separate,
  out-of-scope concern (ADR-0013).
- **Windows**: symlinks need privilege there and scheduling is macOS/Linux-only
  today; the POSIX symlink is the decided v1 mechanism (ADR-0013). Do not add a
  Windows code path.
- **Do NOT edit `tests/unit/init.test.js` or `tests/unit/uninstall.test.js` or
  the integration tests.** Analysis says they still pass: init's "already
  installed" path returns before `sync` (no re-vendor); their `snapshot()` walks
  with `readdirSync(withFileTypes)` and does not recurse into the `current`
  symlink; and `reverseVendoredTree` empties `app/` so the core is still fully
  removed on uninstall. **If `npm test` shows any of those failing, STOP: that
  means `vendorSelf`/`reverseVendoredTree` is wrong (not idempotent, or not
  emptying `app/`) — fix `vendor.js`/`manifest.js`, do NOT edit those tests.**
- Tests for `vendor.js` MUST be hermetic: operate entirely in a temp
  `WIENERDOG_HOME`; exercise **prod mode** by passing `opts.sourceRoot` pointing
  at a temp fake package root (a dir with `bin/`, `src/`, `package.json`, and NO
  `.git`); exercise **dev mode** via `opts.env = { WIENERDOG_DEV: '1' }` (or a
  fake root containing `.git`). Never copy the real repo in a unit test.
- When uncertain: choose the simpler option and note it in the PR under
  "Decisions made". Do NOT expand scope.

## Acceptance criteria

- [ ] `vendorSelf` in **prod mode** (fake `sourceRoot`, no `.git`) creates
      `<core>/app/<version>/` with the COPY_INCLUDE entries, creates
      `<core>/app/current` as a symlink to that dir, and returns `copied:true`;
      a second call with the same version does NOT re-copy (`copied:false`) and
      leaves `current` valid.
- [ ] `vendorSelf` in **dev mode** creates `<core>/app/current` as a symlink to
      the source root and copies nothing (`dev:true`, `copied:false`).
- [ ] `currentBin(paths)` equals `<core>/app/current/bin/wienerdog.js`.
- [ ] `wienerdogBin(paths)` returns `currentBin(paths)`; every caller passes
      `paths`; `npm test` scheduler suites pass.
- [ ] A manifest with a `vendored-tree` entry reverses by recursively removing
      the app tree and marking it removed, so the enclosing core dir is removed.
- [ ] `sync` (non-dry-run) vendors and prints one line; `sync --dry-run` vendors
      nothing.
- [ ] `npm test` and `npm run lint` pass unchanged for init/uninstall/integration.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern 'vendor'
npm test -- --test-name-pattern 'manifest'
npm test -- --test-name-pattern 'scheduler-generators'
npm test -- --test-name-pattern 'scheduler-runjob'
npm test
npm run lint
```

## Out of scope (do NOT do these)

- Repointing EXISTING scheduler entries to the stable path (the migration for
  the two live installs) — **WP-043**.
- Auto-scheduling the dream on vault creation — **WP-044**.
- Vendoring `node_modules`/`googleapis`; fixing `gws` from the vendored copy —
  explicitly not done (ADR-0013).
- Pruning old `app/<version>/` dirs — future; leave them.
- Changing `nodePath()` / `process.execPath` handling.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/042-vendored-install`; conventional commits; PR titled
   `feat(vendor): vendor the package into the core with a stable app/current entry (WP-042)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
