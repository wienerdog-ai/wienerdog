---
id: WP-073
title: repointCurrent uses a junction on Windows (unprivileged install no longer EPERM-crashes)
status: In-Review
model: sonnet
size: S
depends_on: []
adrs: [ADR-0013, ADR-0004]
branch: wp/073-vendor-junction-repoint
---

# WP-073: repointCurrent uses a junction on Windows (unprivileged install no longer EPERM-crashes)

## Context (read this, nothing else)

Wienerdog vendors the running package into `~/.wienerdog/app/<version>/` and points
a stable entry `~/.wienerdog/app/current` at it, so scheduler entries and PATH shims
reference a version-independent path (ADR-0013, the vendored-install layout). On a
version bump only `current`'s target changes; nothing else moves.

`current` is created as a **symlink** by `repointCurrent` in `src/core/vendor.js`.
On Windows, creating a symlink is a **privileged** operation: it requires either
Developer Mode (off by default) or an elevated shell. **Creating an NTFS junction
does not** — a standard, non-elevated user can always create a directory junction,
provided the target is an **absolute** path (junctions cannot be relative and only
point at directories). Wienerdog's vendored targets are always absolute directories
(`<core>/app/<version>` or the dev-checkout root), so a junction is always valid here.

This is a **published crash**, not a support-tier gap. The first external Windows
tester (Windows 11 Pro, hu-HU, non-elevated PowerShell, Developer Mode OFF,
wienerdog 0.6.4 via `npx wienerdog@latest init`) hit it: init vendored the full
`app\0.6.4` tree, then `repointCurrent` called `fs.symlinkSync(targetDir, tmp)` and
threw `EPERM: operation not permitted, symlink '…\app\0.6.4' -> '…\current.tmp.37088'`.
Install aborted with `current` missing; **re-running init printed "already installed,
nothing to do"** (the version dir exists, so `vendorSelf` skips the copy), leaving a
half-installed machine with no skills/hooks. Verified stack:
`fs.symlinkSync (node:fs) → repointCurrent (src/core/vendor.js:75) → vendorSelf
(vendor.js:135) → sync.run → init.run`.

**Product invariant:** Wienerdog is just files; it never starts a process that
outlives its job (ADR-0004). This WP changes only how the `current` reparse point is
created — no daemon, no new dependency.

The exact-analog fix already exists in-repo: `src/adapters/shared.js`
`applySkillLinks` (WP-050) and `src/core/vendor.js` `repointCurrent`'s rename
fallback (WP-049/051) both handle "symlink/rename creation is unpermitted on Windows
without privilege." `repointCurrent`'s symlink **creation** (line 75) is the one
remaining unguarded privileged filesystem op.

## Current state

`src/core/vendor.js` `repointCurrent(paths, targetDir, opts)` (lines 62–99). Relevant
excerpt (exact current code):

```js
function repointCurrent(paths, targetDir, opts = {}) {
  const rename = opts.rename || fs.renameSync;
  const link = currentLink(paths);
  let existing = null;
  try { existing = fs.readlinkSync(link); } catch { existing = null; }
  const same = existing !== null && path.resolve(existing) === path.resolve(targetDir);
  if (!same) {
    const tmp = `${link}.tmp.${process.pid}`;
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ }
    fs.symlinkSync(targetDir, tmp);              // ← line 75: EPERM on stock Windows
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
  }
  // … orphan current.tmp.* sweep (unchanged) …
}
```

- `repointCurrent` already accepts a test-seam opts object (`opts.rename`, default
  `fs.renameSync`). There is **no** `opts.symlink` or `opts.platform` seam yet.
- `writeShim` in the same file (lines 159–209) is the in-repo precedent for a
  `opts.platform` seam (`const platform = opts.platform || process.platform;`) used
  to exercise the win32 branch on POSIX CI without mocking `process.platform`.
- `applySkillLinks` in `src/adapters/shared.js` is the precedent for an
  `opts.symlink` seam (`const symlink = opts.symlink || fs.symlinkSync;`).
- `vendorSelf` (line 135) calls `repointCurrent(paths, target)` with **no** opts, so
  it uses production `process.platform` — no change needed there.
- Peter's machine already carries a **manual** junction at `app\current` (created via
  PowerShell `New-Item -ItemType Junction`, target `app\0.6.4`). On it,
  `fs.readlinkSync` returns the target and `fs.lstatSync().isSymbolicLink()` returns
  `true`, so the existing same-target fast path no-ops and the manifest's
  symlink-reversal treats it correctly. No manifest change is needed for junctions.

Existing tests: `tests/unit/vendor.test.js` already exercises `repointCurrent` via the
`opts.rename` seam on POSIX.

## Deliverables (permission boundary — touch ONLY these)

| Action | Path | Notes |
|--------|------|-------|
| modify | src/core/vendor.js | add `opts.symlink` + `opts.platform` seams to `repointCurrent`; create the tmp reparse point with type `'junction'` on win32 |
| modify | tests/unit/vendor.test.js | tests: win32 seam passes `'junction'` type; non-win32 passes no type; both round-trip the same-target no-op and the rewrite path |

### Exact contracts

Change **only** `repointCurrent`'s signature and its tmp-reparse-point creation.
Everything else in the function (the `same` fast path, the rename + rename-fallback,
the orphan `current.tmp.*` sweep) is unchanged.

```js
/** …existing doc… plus:
 *  @param {{rename?: (from: string, to: string) => void,
 *           symlink?: (target: string, path: string, type?: string) => void,
 *           platform?: string}} [opts]
 *    test seams only; default fs.renameSync / fs.symlinkSync / process.platform.
 *  On win32 the tmp reparse point is created as a directory JUNCTION (type
 *  'junction'), which a non-elevated user can always create for an ABSOLUTE
 *  target — unlike a symlink, which needs Developer Mode or elevation. Our
 *  targets are always absolute directories (ADR-0013), so a junction is valid. */
function repointCurrent(paths, targetDir, opts = {}) {
  const rename = opts.rename || fs.renameSync;
  const symlink = opts.symlink || fs.symlinkSync;
  const platform = opts.platform || process.platform;
  // … unchanged up to the tmp creation …
    const tmp = `${link}.tmp.${process.pid}`;
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ }
    if (platform === 'win32') symlink(targetDir, tmp, 'junction');
    else symlink(targetDir, tmp);
  // … unchanged rename + fallback + orphan sweep …
}
```

Behavior table:

| platform | call made | privilege needed |
|----------|-----------|------------------|
| win32    | `symlink(targetDir, tmp, 'junction')` | none (junction, absolute target) |
| darwin/linux | `symlink(targetDir, tmp)` | none (POSIX symlink) |

## Implementation notes & constraints

- **Do NOT touch the rename/rename-fallback or the orphan sweep.** The EPERM the
  report hit is exclusively at symlink *creation* (line 75). The WP-049/051 fallback
  already handles the *rename-over-existing-junction* case on a version bump.
- **Junction type only for win32.** Passing `'junction'` on POSIX would break
  (`fs.symlinkSync` junction type is Windows-only). Branch on the injected `platform`.
- **No `process.platform` mocking** — follow the WP-049/051/038 rule and exercise the
  win32 branch by passing `opts.platform:'win32'` + an `opts.symlink` spy that records
  its third argument. The spy should create a real POSIX symlink (drop the type) so
  the subsequent rename + readlink + no-op assertions still work on CI.
- **No manifest change.** A junction reverses identically to a symlink (the manifest's
  `symlink` kind removal uses `fs.rmSync`/`unlink`, which removes junctions).
- Zero new dependencies; no build step (CLAUDE.md).
- When uncertain, choose the simpler option and record it under "Decisions made".

## Security checklist

- [ ] No untrusted identifier is introduced. `targetDir` is computed by `vendorSelf`
      from the validated package version and the fixed app dir; this WP does not add
      any new path segment or shell command. (The type argument `'junction'` is a
      fixed literal, never user input.)

## Acceptance criteria

- [ ] With `opts.platform:'win32'`, `repointCurrent` calls its `symlink` seam with a
      third argument of exactly `'junction'`.
- [ ] With `opts.platform` unset/`'linux'`/`'darwin'`, `repointCurrent` calls its
      `symlink` seam with **no** third argument.
- [ ] The same-target fast path still no-ops (no symlink/rename) on both platforms.
- [ ] The orphan `current.tmp.*` sweep still runs on both the no-op and rewrite paths.
- [ ] `vendorSelf` (which passes no opts) is unchanged and still green.
- [ ] Running the relevant flow twice is idempotent (second run: zero changes).

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern vendor
npm run lint
```

### Manual Windows verification (owner/tester gate — CI has no Windows runner)

CI cannot exercise the real privileged-symlink refusal. Before this WP merges, on a
**stock Windows machine (Developer Mode OFF, non-elevated shell)** confirm:

1. A fresh `npx wienerdog@latest init` (built from this branch) completes without the
   `EPERM … symlink … current.tmp.*` crash; `~/.wienerdog/app/current` exists and
   `Get-Item …\app\current` shows it as a junction/reparse point resolving to the
   version dir.
2. On the tester's existing 0.6.4 machine (manual junction at `app\current` → `0.6.4`):
   a `wienerdog sync` from a **bumped** version re-vendors, and `repointCurrent`
   repoints `current` to the new version dir without an EPERM crash (the WP-049/051
   remove-then-rename fallback handles the rename-over-existing-junction).

Paste the console/`Get-Item` output into the PR under "Manual verification".

## Out of scope (do NOT do these)

- The Task Scheduler XML encoding fix and LogonTrigger drop — **WP-074**.
- Fail-loud on failed scheduler mutations — **WP-075**.
- Any change to the rename fallback, orphan sweep, or manifest reversal (already
  shipped by WP-049/051).
- Migrating the manifest `symlink` kind to a `junction` kind — unnecessary; reversal
  is byte-identical.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body. The manual
   Windows check is completed (or explicitly deferred to the owner with the reproduction
   steps) before merge.
2. Branch from frontmatter; conventional commits; PR titled
   `fix(vendor): repointCurrent uses a junction on Windows (WP-073)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
