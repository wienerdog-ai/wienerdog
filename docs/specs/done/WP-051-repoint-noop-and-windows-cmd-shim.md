---
id: WP-051
title: repointCurrent same-target no-op + Windows-usable .cmd shim
status: Done
model: sonnet
size: S
depends_on: [WP-042, WP-049]
adrs: [ADR-0013, ADR-0004]
branch: wp/051-repoint-noop-and-windows-cmd-shim
---

# WP-051: repointCurrent same-target no-op + Windows-usable .cmd shim

## Context (read this, nothing else)

Wienerdog installs files, never a daemon (ADR-0004). To keep long-lived
references (scheduler entries, self-invocations) pointing at a stable path across
version bumps, `init`/`sync` **vendor** the running package into
`~/.wienerdog/app/<version>/` and maintain a symlink `~/.wienerdog/app/current`
that points at the active version dir (ADR-0013). Every night's job and every
`wienerdog …` call resolves through `~/.wienerdog/app/current/bin/wienerdog.js`.
The single module that owns this is `src/core/vendor.js`.

Two functions in that module are the subject of this WP:

- **`repointCurrent(paths, targetDir, opts)`** rewrites the `current` symlink to
  point at `targetDir`. It writes a temp symlink `current.tmp.<pid>` and renames
  it over `current`. On POSIX that rename is atomic; on Windows renaming over an
  existing directory symlink throws `EPERM`, so WP-049 added a remove-then-rename
  fallback (delete the old `current`, then rename the temp into place) plus an
  orphan sweep. `vendorSelf` calls `repointCurrent` on **every** sync — including
  the overwhelmingly common case where the version is unchanged and `current`
  **already** points at exactly `targetDir`.
- **`writeShim(paths, opts)`** writes an executable **bash** launcher at
  `~/.local/bin/wienerdog` that `exec`s the vendored bin, so bare `wienerdog …`
  resolves for the user and the brain. It is manifest-tracked (`kind:'file'`) and
  removed by `uninstall`.

**Two defects surfaced by a from-scratch Windows Server 2022 install (Node 24,
v0.3.0), driven by Claude Code running `npx wienerdog@latest init`:**

1. **Every sync re-writes the symlink even when it is already correct.**
   `repointCurrent` has no "already points at targetDir → skip" check, so a
   routine `sync` of the *same* version still deletes and recreates `current`.
   On Windows that unconditionally exercises the WP-049 remove-then-rename
   fallback, and the transcript demonstrated a **self-lock**: the normal
   invocation path is `node ~/.wienerdog/app/current/bin/wienerdog.js` (the shim
   and every scheduler entry run the bin *through* `current`), so a node process
   is executing from **inside** `app/current` and holds the reparse point. Both
   the `rename` and the fallback's `rmSync(link)` can then fail `EPERM`/`EBUSY`.
   The correct fix: the same-version re-vendor needs **no repoint at all** — if
   `current` already points at `targetDir`, skip the symlink+rename entirely
   (but still run the orphan sweep).

2. **The bash shim is useless on native Windows.** `~/.local/bin/wienerdog` is a
   `#!/usr/bin/env bash` script; `cmd.exe`/PowerShell cannot execute it. The
   reporter found the only reliable invocation was
   `node …app\<version>\bin\wienerdog.js` directly. The fix: on Windows,
   **additionally** write a `wienerdog.cmd` next to the bash shim that shells out
   to `node "<vendored current bin>" %*`, so bare `wienerdog` resolves in a
   Windows shell too. It is manifest-tracked and removed by `uninstall` like the
   bash shim.

Both fixes live entirely in `src/core/vendor.js` (+ its unit tests). Windows is a
**deferred support tier** (scheduling, `install.ps1` stay out — ADR-0013
§Windows-someday), but a published `npx` path must **degrade, not crash**: these
are defects on an unconditional code path regardless of support tier.

**Product invariants that bind here.** Wienerdog is just files — nothing here
starts a process that outlives its job (ADR-0004). The vendor module assumes a
**single writer** (install/sync is never concurrent, ADR-0013); the same-target
skip and the WP-049 fallback are both acceptable only under that assumption.

## Current state

`src/core/vendor.js` exists (WP-042, amended by WP-049). The two functions today:

```js
/** Point <core>/app/current at targetDir.
 *  POSIX: `rename` over the existing symlink is atomic. Windows: renaming over
 *  an existing directory symlink throws EPERM/EEXIST/ENOTEMPTY (MoveFileEx will
 *  not replace a reparse point in place) — fall back to remove-old-link then
 *  rename. That fallback has a brief non-atomic window (current momentarily
 *  absent), acceptable under the module's single-writer assumption (ADR-0013).
 *  Also sweeps orphaned `current.tmp.*` symlinks left by earlier crashed runs.
 *  @param {import('./paths').WienerdogPaths} paths
 *  @param {string} targetDir
 *  @param {{rename?: (from: string, to: string) => void}} [opts]
 *    test seam only; defaults to fs.renameSync. */
function repointCurrent(paths, targetDir, opts = {}) {
  const rename = opts.rename || fs.renameSync;
  const link = currentLink(paths);
  const tmp = `${link}.tmp.${process.pid}`;
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ }
  fs.symlinkSync(targetDir, tmp);
  try {
    rename(tmp, link); // atomic on POSIX
  } catch (err) {
    if (err && ['EPERM', 'EEXIST', 'ENOTEMPTY'].includes(err.code)) {
      fs.rmSync(link, { recursive: true, force: true });
      rename(tmp, link);
    } else {
      throw err;
    }
  }
  // Self-heal: remove orphaned current.tmp.* from earlier crashed runs (any pid).
  let leftovers = [];
  try { leftovers = fs.readdirSync(appDir(paths)); } catch { leftovers = []; }
  for (const name of leftovers) {
    if (name.startsWith('current.tmp.')) {
      try { fs.rmSync(path.join(appDir(paths), name), { recursive: true, force: true }); } catch { /* ignore */ }
    }
  }
}
```

```js
/**
 * Write the PATH shim ~/.local/bin/wienerdog → the vendored current bin, so bare
 * `wienerdog …` resolves for the brain and the user (ADR-0013). Idempotent (skip
 * when byte-identical). Records a manifest `file` entry (uninstall removes it).
 * Does NOT record/remove the ~/.local/bin dir (may be user-shared).
 * @param {import('./paths').WienerdogPaths} paths
 * @param {{manifest?: object}} [opts]
 * @returns {{path:string, changed:boolean, onPath:boolean}}
 */
function writeShim(paths, opts = {}) {
  const localBin = path.join(paths.home, '.local', 'bin');
  const shimPath = path.join(localBin, 'wienerdog');
  const content =
    '#!/usr/bin/env bash\n' +
    '# Wienerdog CLI shim (managed) — points at the vendored app entry (ADR-0013).\n' +
    `exec node "${currentBin(paths)}" "$@"\n`;
  let same = false;
  try { same = fs.readFileSync(shimPath, 'utf8') === content; } catch { same = false; }
  let changed = false;
  if (!same) {
    fs.mkdirSync(localBin, { recursive: true });
    fs.writeFileSync(shimPath, content, { mode: 0o755 });
    fs.chmodSync(shimPath, 0o755);
    changed = true;
  }
  if (opts.manifest) recordOnce(opts.manifest, { kind: 'file', path: shimPath });
  const onPath = (process.env.PATH || '').split(path.delimiter).includes(localBin);
  return { path: shimPath, changed, onPath };
}
```

Helpers already in the module and used below: `appDir(paths)` → `<core>/app`,
`currentLink(paths)` → `<core>/app/current`, `currentBin(paths)` →
`<core>/app/current/bin/wienerdog.js`, `recordOnce(manifest, entry)`.
`require('node:fs')` is bound as `fs` and `require('node:path')` as `path`.

`vendorSelf` calls `repointCurrent(paths, target)` (no third argument) and
`src/cli/sync.js` calls `writeShim(paths, { manifest })` (no `platform`). **Do not
change either call site** — the new options both default to preserve today's
behavior.

Existing `tests/unit/vendor.test.js` covers: prod copy, prod idempotency (second
`vendorSelf` of the same version leaves `current` a valid symlink), upgrade
repoint, EPERM fallback (injected `rename`), non-fallback rethrow, orphan sweep,
dev mode, `currentBin`, and the bash shim (write / byte-idempotency / `onPath`).
Test helpers: `tempPaths()` (fresh temp `HOME` + `WIENERDOG_HOME`, resolved
paths) and `fakeSource(version)` (fake published package root).

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file (the status flip),
     docs/specs/ROADMAP.md, package-lock.json. Everything else must be listed. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/core/vendor.js | `repointCurrent` gains a same-target no-op guard; `writeShim` gains an `opts.platform` seam + Windows `wienerdog.cmd` write. No other function changes. Both existing call sites unchanged. |
| modify | tests/unit/vendor.test.js | add: same-target no-op (zero rename calls), broken/mismatched-link repair, `.cmd` written on win32 (byte-idempotent, manifest-tracked, bash shim still written), no `.cmd` off-win32 |

### Exact contract — `repointCurrent`

Replace `repointCurrent` with the following. The **only** change is the
`existing`-target guard wrapping the temp-symlink + rename + fallback block; the
orphan sweep is moved to run **unconditionally after** the guard (so it still
cleans prior crashes' orphans on the no-op path). The `rename` seam and the
fallback are unchanged from WP-049.

```js
/** Point <core>/app/current at targetDir.
 *  Fast path: when `current` already points at targetDir, do nothing (skip the
 *  symlink+rename). This is the common case (every sync re-vendors the SAME
 *  version) and on Windows the rewrite would needlessly exercise the
 *  remove-then-rename fallback below — which can self-lock when a node process is
 *  running from inside app/current (the shim/scheduler invocation path holds the
 *  reparse point, so rmSync and rename both raise EPERM/EBUSY).
 *  Otherwise: POSIX `rename` over the existing symlink is atomic; on Windows
 *  renaming over an existing directory symlink throws EPERM/EEXIST/ENOTEMPTY —
 *  fall back to remove-old-link then rename (brief non-atomic window, acceptable
 *  under the module's single-writer assumption, ADR-0013).
 *  Always sweeps orphaned `current.tmp.*` symlinks left by earlier crashed runs.
 *  @param {import('./paths').WienerdogPaths} paths
 *  @param {string} targetDir
 *  @param {{rename?: (from: string, to: string) => void}} [opts]
 *    test seam only; defaults to fs.renameSync. */
function repointCurrent(paths, targetDir, opts = {}) {
  const rename = opts.rename || fs.renameSync;
  const link = currentLink(paths);
  // Read the current stored target (null if `current` is absent or not a symlink).
  let existing = null;
  try { existing = fs.readlinkSync(link); } catch { existing = null; }
  // Compare via path.resolve: our stored targets are always absolute, so resolve
  // is pure normalization (no cwd dependence) and also reconciles a benign
  // trailing separator some platforms' readlink may append. Equal → no-op.
  const same = existing !== null && path.resolve(existing) === path.resolve(targetDir);
  if (!same) {
    const tmp = `${link}.tmp.${process.pid}`;
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ }
    fs.symlinkSync(targetDir, tmp);
    try {
      rename(tmp, link); // atomic on POSIX
    } catch (err) {
      if (err && ['EPERM', 'EEXIST', 'ENOTEMPTY'].includes(err.code)) {
        // Windows: cannot rename over an existing directory symlink. Remove the
        // old link, then rename into place (brief non-atomic window).
        fs.rmSync(link, { recursive: true, force: true });
        rename(tmp, link);
      } else {
        throw err;
      }
    }
  }
  // Self-heal: remove orphaned current.tmp.* from earlier crashed runs (any pid).
  // Runs on BOTH the no-op and the rewrite path. Our own tmp (if created) was
  // already renamed away and will not match.
  let leftovers = [];
  try { leftovers = fs.readdirSync(appDir(paths)); } catch { leftovers = []; }
  for (const name of leftovers) {
    if (name.startsWith('current.tmp.')) {
      try { fs.rmSync(path.join(appDir(paths), name), { recursive: true, force: true }); } catch { /* ignore */ }
    }
  }
}
```

Behavior summary (input → observable result):

- `current` **already → targetDir** (readlink resolves equal) → **no-op**: no
  temp symlink created, `rename` never called, `current` untouched. Orphan sweep
  still runs. *(This is the fix for defect 1.)*
- `current` absent, or a non-symlink, or points **elsewhere** (dangling or a
  different dir) → existing rewrite path (temp symlink + rename, with the WP-049
  Windows fallback). Orphan sweep runs.
- `rename` throws a non-fallback code → rethrown unchanged (real failure).

**Comparison decision (record in "Decisions made"):** compare with
`path.resolve(existing) === path.resolve(targetDir)`, not a raw string compare.
`path.resolve` is deterministic, so it subsumes raw equality (equal strings
resolve equal) while additionally reconciling benign form differences a
platform's `readlink` may return (e.g. a trailing separator on Windows). No
false-positive risk: two distinct real directories never resolve to the same
absolute path. Our stored targets are always absolute (`vendorSelf` passes
`path.join(app, version)` in prod and the source root in dev), so `resolve` has
no `process.cwd()` dependence.

### Exact contract — `writeShim`

Replace `writeShim` with the following. Additions: (1) an `opts.platform` seam
(defaults to `process.platform`; tests pass it explicitly to exercise both
branches — this is an honest host-platform branch in the writer, not a test-seam
lie); (2) on `win32`, an **additional** `wienerdog.cmd` next to the bash shim.
The bash-shim block is unchanged. The `.cmd` is manifest-tracked as a plain
`file` (uninstall already reverses `kind:'file'`), byte-idempotent, and uses
**CRLF** (canonical for `.cmd`). The return object gains `cmdPath` /
`cmdChanged`.

```js
/**
 * Write the PATH shim(s) so bare `wienerdog …` resolves for the brain and the
 * user (ADR-0013). Always writes an executable bash launcher
 * ~/.local/bin/wienerdog → the vendored current bin. On native Windows (where
 * cmd.exe/PowerShell cannot run the bash shim) it ADDITIONALLY writes a
 * ~/.local/bin/wienerdog.cmd that shells out to `node "<current bin>" %*`.
 * Idempotent (skip each file when byte-identical). Records a manifest `file`
 * entry per file written (uninstall removes them). Does NOT record/remove the
 * ~/.local/bin dir (may be user-shared).
 * @param {import('./paths').WienerdogPaths} paths
 * @param {{manifest?: object, platform?: string}} [opts]
 *   platform defaults to process.platform; tests pass it to exercise both branches.
 * @returns {{path:string, changed:boolean, onPath:boolean, cmdPath:(string|null), cmdChanged:boolean}}
 */
function writeShim(paths, opts = {}) {
  const platform = opts.platform || process.platform;
  const localBin = path.join(paths.home, '.local', 'bin');
  const shimPath = path.join(localBin, 'wienerdog');
  const content =
    '#!/usr/bin/env bash\n' +
    '# Wienerdog CLI shim (managed) — points at the vendored app entry (ADR-0013).\n' +
    `exec node "${currentBin(paths)}" "$@"\n`;
  let same = false;
  try { same = fs.readFileSync(shimPath, 'utf8') === content; } catch { same = false; }
  let changed = false;
  if (!same) {
    fs.mkdirSync(localBin, { recursive: true });
    fs.writeFileSync(shimPath, content, { mode: 0o755 });
    fs.chmodSync(shimPath, 0o755);
    changed = true;
  }
  if (opts.manifest) recordOnce(opts.manifest, { kind: 'file', path: shimPath });

  // Native Windows: the bash shim is not runnable by cmd.exe/PowerShell. Write a
  // .cmd launcher next to it that execs the vendored current bin. CRLF is
  // canonical for .cmd; the embedded absolute path comes from currentBin(paths).
  let cmdPath = null;
  let cmdChanged = false;
  if (platform === 'win32') {
    cmdPath = path.join(localBin, 'wienerdog.cmd');
    const cmdContent = `@echo off\r\nnode "${currentBin(paths)}" %*\r\n`;
    let cmdSame = false;
    try { cmdSame = fs.readFileSync(cmdPath, 'utf8') === cmdContent; } catch { cmdSame = false; }
    if (!cmdSame) {
      fs.mkdirSync(localBin, { recursive: true });
      fs.writeFileSync(cmdPath, cmdContent);
      cmdChanged = true;
    }
    if (opts.manifest) recordOnce(opts.manifest, { kind: 'file', path: cmdPath });
  }

  const onPath = (process.env.PATH || '').split(path.delimiter).includes(localBin);
  return { path: shimPath, changed, onPath, cmdPath, cmdChanged };
}
```

Frozen `.cmd` file contents (exact bytes; `<current bin>` is `currentBin(paths)`):

```text
@echo off<CR><LF>
node "<current bin>"  %*<CR><LF>
```

i.e. the string `` `@echo off\r\nnode "${currentBin(paths)}" %*\r\n` `` — two
lines, CRLF-terminated, one space between the quoted path and `%*`.

### Example (evidence-shaped)

- Windows re-`sync` of the already-installed 0.3.0: `current` already →
  `C:\Users\ada\.wienerdog\app\0.3.0`, so `repointCurrent` **no-ops** (no rename,
  no self-lock), the digest is written, and `~/.local/bin/wienerdog.cmd` contains
  `node "C:\Users\ada\.wienerdog\app\current\bin\wienerdog.js" %*`. Running
  `wienerdog doctor` in PowerShell now resolves via the `.cmd`.
- POSIX upgrade 0.2.1 → 0.3.0: `current` → 0.2.1 ≠ 0.3.0, so the rewrite path
  runs exactly as before; no `.cmd` is written.

## Implementation notes & constraints

- No new npm dependencies. Plain Node ≥ 18, JSDoc types only, no build step.
- Do NOT change `vendorSelf`, `sync.js`, or any other file/function. Both defaults
  (`opts.rename` → `fs.renameSync`, `opts.platform` → `process.platform`)
  preserve today's production behavior at the unchanged call sites.
- Test the no-op with an **injected `rename` spy** and assert it is called **zero
  times** when `current` already points at the target — do NOT mock
  `process.platform`. Plant a `current.tmp.*` orphan first and assert it is still
  swept on the no-op path.
- Test the broken/mismatched-link repair by pointing `current` at a **different**
  (or dangling) target, then repointing to the real target with an injected
  `rename` that delegates to `fs.renameSync`; assert `rename` is called once and
  `current` now resolves to the new target.
- Test the Windows `.cmd` via `opts.platform: 'win32'` (NOT `process.platform`):
  assert `cmdPath` = `<home>/.local/bin/wienerdog.cmd`, `cmdChanged: true`,
  exact CRLF byte content, a `kind:'file'` manifest entry for it, that the bash
  shim is **also** written, and that a second call is byte-idempotent
  (`cmdChanged: false`, manifest not grown). Test the off-Windows branch via
  `opts.platform: 'linux'`: `cmdPath` is `null` and no `.cmd` exists on disk.
- `currentBin(paths)` uses `path.join`, so on a real Windows host the embedded
  path is a proper backslash absolute path; in a POSIX test with
  `platform:'win32'` it is a POSIX path — assert against `currentBin(paths)`, not
  a hardcoded string.
- The PATH note in `sync.js` is intentionally unchanged: it already advises
  adding `~/.local/bin` to `PATH`, which also covers the `.cmd`. Windows-specific
  PATH wording is out of scope.
- When uncertain: choose the simpler option and note it in the PR under
  "Decisions made". Do NOT expand scope.

## Acceptance criteria

- [ ] With `current` already pointing at `targetDir`, `repointCurrent` calls the
      injected `rename` **zero** times, leaves `current` pointing at `targetDir`,
      and still removes a pre-planted `current.tmp.*` orphan.
- [ ] With `current` pointing at a different (or dangling) target,
      `repointCurrent` rewrites it: `rename` is called once and `current` now
      resolves to the new target.
- [ ] All existing `repointCurrent` tests still pass unchanged (EPERM fallback,
      non-fallback rethrow, orphan sweep, upgrade repoint, prod idempotency).
- [ ] `writeShim(paths, { manifest, platform: 'win32' })` writes both the bash
      shim and `~/.local/bin/wienerdog.cmd` with the exact CRLF content, records
      the `.cmd` as a `kind:'file'` manifest entry, and returns
      `cmdChanged: true`; a second identical call returns `cmdChanged: false` and
      does not grow the manifest.
- [ ] `writeShim(paths, { platform: 'linux' })` writes no `.cmd` and returns
      `cmdPath: null`.
- [ ] Existing bash-shim tests still pass; `sync` (unchanged) still writes the
      shim on the host platform.
- [ ] `npm test` and `npm run lint` pass.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern repointCurrent
npm test -- --test-name-pattern vendor
npm test -- --test-name-pattern writeShim
npm test
npm run lint
```

## Out of scope (do NOT do these)

- Threading `opts.platform` or `opts.rename` through `vendorSelf`/`sync.js` — not
  needed; production uses the defaults.
- Windows scheduling, `install.ps1`, junction/pointer-file mechanisms for
  `current` — deferred to M6–M7 (ADR-0013).
- Windows-specific PATH-note wording in `sync.js`.
- Pruning old `app/<version>/` dirs.
- Skill copy-fallback (WP-050, already Done) and the repoint EPERM fallback
  itself (WP-049, already Done) — this WP only adds the no-op guard around it.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/051-repoint-noop-and-windows-cmd-shim`; conventional commits; PR
   titled `fix(vendor): skip repoint when current is correct + add Windows .cmd shim (WP-051)`.
3. PR template filled, including "Decisions made" (or "none") and
   `Generated-by:`. Credit the external reporter in the PR body:
   `Reported-by: external user (userreports/issue-repointCurrent-eperm.md)`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
