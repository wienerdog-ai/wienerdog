---
id: WP-049
title: Windows-safe repointCurrent fallback + orphan current.tmp.* cleanup
status: In-Review
model: sonnet
size: S
depends_on: [WP-042]
adrs: [ADR-0013, ADR-0004]
branch: wp/049-repoint-windows-fallback
---

# WP-049: Windows-safe repointCurrent fallback + orphan current.tmp.* cleanup

## Context (read this, nothing else)

Wienerdog vendors its own package into the canonical core (`~/.wienerdog/`) and
points every long-lived reference at a stable entry that survives version
changes (ADR-0013). The mechanism: `init`/`sync` copy the published files into
`~/.wienerdog/app/<version>/`, then repoint the symlink
`~/.wienerdog/app/current` at the active version dir. Scheduler entries and
self-invocations target `~/.wienerdog/app/current/bin/wienerdog.js`, so only the
symlink's target changes across versions. The repoint is done the classic POSIX
way: write a temporary symlink `current.tmp.<pid>`, then `fs.renameSync` it
**over** the existing `current` symlink — atomic on POSIX.

**The defect (external report, verified).** On Windows (Server 2022, Node 24),
`fs.renameSync(tmp, link)` where `link` already exists as a **directory
symlink** raises `EPERM`: Win32 `MoveFileEx` will not transparently replace an
existing directory reparse point the way POSIX `rename(2)` does. It works the
first time (when `current` does not yet exist), then **every subsequent**
`wienerdog sync`/`init` hard-crashes before doing any useful work (the digest is
never written), and each failed run orphans a `current.tmp.<pid>` symlink under
`app/`. This is an unconditional code path, so a published-version crash on
Windows is a defect regardless of Windows being a deferred support tier — the
goal is a **working degraded install**, not a crash. Full Windows support
(scheduling, `install.ps1`) stays deferred (ADR-0013 §Windows-someday).

**Product invariants that bind here.** Wienerdog is just files — this WP starts
nothing that outlives its job (ADR-0004). The vendor module assumes a
**single writer** (install/sync is never concurrent, ADR-0013); that assumption
is what makes the fix below acceptable.

**The accepted fix.** Fall back to remove-then-rename when the atomic replace is
rejected: on `EPERM`/`EEXIST`/`ENOTEMPTY`, remove the old `current` link, then
rename the temp symlink into place. This introduces a **brief non-atomic
window** (a moment where `current` is absent) which is acceptable under the
module's single-writer assumption. Additionally, sweep any orphaned
`current.tmp.*` symlinks left by earlier crashed runs so a fixed install
self-heals the mess prior crashes left behind.

## Current state

`src/core/vendor.js` exists (WP-042). The relevant function today:

```js
/** Atomically point <core>/app/current at targetDir (temp symlink + rename).
 *  @param {import('./paths').WienerdogPaths} paths @param {string} targetDir */
function repointCurrent(paths, targetDir) {
  const link = currentLink(paths);
  const tmp = `${link}.tmp.${process.pid}`;
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ }
  fs.symlinkSync(targetDir, tmp);
  fs.renameSync(tmp, link); // rename over an existing symlink is atomic on POSIX
}
```

Helpers already in the module: `appDir(paths)` → `<core>/app`,
`currentLink(paths)` → `<core>/app/current`. `repointCurrent` is already
exported and is called by `vendorSelf(paths, opts)` as `repointCurrent(paths,
target)` (no third argument). `require('node:fs')` is bound as `fs` and
`require('node:path')` as `path` at the top of the file.

Existing tests in `tests/unit/vendor.test.js` cover the happy path (`current` is
a symlink → version dir) and the upgrade path (atomic repoint to a new version).
Test helper `tempPaths()` returns resolved paths over a fresh temp `HOME` +
`WIENERDOG_HOME`; `fakeSource(version)` builds a fake published package root.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file (the status flip),
     docs/specs/ROADMAP.md, package-lock.json. Everything else must be listed. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/core/vendor.js | `repointCurrent` gains a `rename` test seam + remove-then-rename fallback + orphan-tmp sweep. `vendorSelf` call site is unchanged. |
| modify | tests/unit/vendor.test.js | add fallback, rethrow, and orphan-sweep tests |
| modify | docs/adr/0013-vendored-install.md | append a dated amendment note (exact prose below) |

### Exact contracts

Replace `repointCurrent` with the following. The **only** behavioral additions
are: (1) an optional injectable `rename` (test seam; production keeps
`fs.renameSync`), (2) the `try/catch` fallback, (3) the orphan sweep. Do not
alter `vendorSelf` — because `vendorSelf` calls `repointCurrent(paths, target)`
with no third argument, `opts` defaults to `{}` and production uses
`fs.renameSync` exactly as before.

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
      // Windows: cannot rename over an existing directory symlink. Remove the
      // old link, then rename into place (brief non-atomic window).
      fs.rmSync(link, { recursive: true, force: true });
      rename(tmp, link);
    } else {
      throw err;
    }
  }
  // Self-heal: remove orphaned current.tmp.* from earlier crashed runs (any pid).
  // Our own tmp has already been renamed away and will not match.
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

- `current` absent → temp symlink created, `rename` succeeds (first-install
  path, unchanged). No orphans.
- `current` present, `rename` succeeds (POSIX) → `current` now → `targetDir`,
  temp gone, orphans (if any) swept. Unchanged from today for POSIX.
- `current` present, `rename` throws `EPERM`/`EEXIST`/`ENOTEMPTY` (Windows) →
  old link removed, temp renamed into place, `current` → `targetDir`, temp gone,
  orphans swept. **No crash.**
- `rename` throws any other error code → rethrown unchanged (real failure).

### ADR-0013 amendment (append verbatim at the end of the file)

Add this section to the end of `docs/adr/0013-vendored-install.md`:

```markdown
## Amendment (2026-07-05, WP-049): Windows repoint fallback

An external user report (Windows Server 2022, Node 24, wienerdog 0.3.0)
established that `fs.renameSync` over an **existing** directory symlink throws
`EPERM` on Win32 — the POSIX-atomic-rename assumption above holds only for the
first `current` creation, so every subsequent `sync`/`init` crashed before
writing the digest and orphaned a `current.tmp.<pid>` link. `repointCurrent`
now falls back to **remove-old-link then rename** on `EPERM`/`EEXIST`/
`ENOTEMPTY`, accepting a brief non-atomic window (`current` momentarily absent)
under this module's single-writer assumption, and sweeps orphaned
`current.tmp.*` left by earlier crashed runs. This makes Windows a **working
degraded install** (vendored app + digest). Full Windows support (scheduling,
`install.ps1`) remains deferred to M6–M7; the junction/pointer-file mechanism
noted above is still the someday-atomic approach.
```

## Implementation notes & constraints

- No new npm dependencies. Plain Node ≥ 18, JSDoc types only, no build step.
- Do NOT change `vendorSelf` or any other function. The seam lives solely on
  `repointCurrent`'s optional third argument; `vendorSelf`'s existing call
  `repointCurrent(paths, target)` is correct as-is.
- The fallback removes the OLD `current` **symlink** (or reparse point), never
  its target: `fs.rmSync` on a symlink removes the link itself. Verified in the
  report.
- The orphan sweep runs unconditionally after a successful repoint (both the
  atomic and the fallback path) so it also cleans orphans on POSIX machines that
  inherited them from a bad prior run.
- Test the fallback with an **injected `rename`** that throws `EPERM` on its
  first call and delegates to `fs.renameSync` thereafter — do NOT mock
  `process.platform`. The fallback calls `rename` a second time, so the injected
  function must succeed on the second call for `current` to land.
- When uncertain: choose the simpler option and note it in the PR under
  "Decisions made". Do NOT expand scope.

## Acceptance criteria

- [ ] `repointCurrent(paths, targetDir)` with no seam behaves exactly as today
      on POSIX (atomic rename over an existing symlink; `current` → target).
- [ ] With an injected `rename` that throws `EPERM` on the first call and
      succeeds on the second, `repointCurrent` completes without throwing,
      `current` points at the new target, and no `current.tmp.*` remains under
      `app/`.
- [ ] With an injected `rename` that throws a non-fallback code (e.g. `ENOSPC`),
      `repointCurrent` rethrows that error.
- [ ] A pre-existing `app/current.tmp.<something>` orphan is removed after a
      successful `repointCurrent` call.
- [ ] ADR-0013 carries the dated amendment section verbatim.
- [ ] All existing `vendor.test.js` tests still pass unchanged.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern repointCurrent
npm test -- --test-name-pattern vendor
npm run lint
```

## Out of scope (do NOT do these)

- Windows scheduling, `install.ps1`, or any junction/pointer-file mechanism for
  `current` — deferred to M6–M7 (ADR-0013).
- Threading the `rename` seam through `vendorSelf` — not needed; production
  always uses `fs.renameSync`.
- Skill copy-fallback on Windows — that is **WP-050** (different files:
  `src/adapters/shared.js` + `src/core/manifest.js`).
- Pruning old `app/<version>/` dirs — out of scope per ADR-0013.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/049-repoint-windows-fallback`; conventional commits; PR titled
   `fix(vendor): Windows-safe repointCurrent fallback + orphan cleanup (WP-049)`.
3. PR template filled, including "Decisions made" (or "none") and
   `Generated-by:`. Credit the external reporter in the PR body:
   `Reported-by: external user (userreports/issue-repointCurrent-eperm.md)`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
