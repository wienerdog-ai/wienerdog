---
id: WP-050
title: Skills copy-fallback where symlink creation is unpermitted (Windows)
status: Done
model: opus
size: M
depends_on: [WP-006]
adrs: [ADR-0004]
branch: wp/050-skills-copy-fallback
---

# WP-050: Skills copy-fallback where symlink creation is unpermitted (Windows)

## Context (read this, nothing else)

Wienerdog registers its shipped skills with a harness by **symlinking** each
`wienerdog-*` skill folder from the canonical core (`~/.wienerdog/skills/`) into
the harness's skills dir (`~/.claude/skills/` for Claude Code,
`~/.codex/skills/` for Codex). The symlink is what makes the `/wienerdog-*`
slash commands register. `src/adapters/shared.js#applySkillLinks` is the single
chokepoint both adapters call.

**The defect (external report, same install as WP-049).** On Windows, symlink
creation needs privilege, so `applySkillLinks` currently bails at the top with a
notice (`skill linking unsupported on Windows in v1`) and links **nothing** —
the `/wienerdog-*` commands never register, and the reporter had to manually
copy the skill folders to get them working. Since v0.3.0 runs (degraded) on
Windows, the goal is a **working degraded install**: where symlinks are
unpermitted, **copy** the skill folder instead so the commands register. The
reporter's own workaround (copy the folders) is exactly this, automated and made
reversible.

**Product invariants that bind here.** Wienerdog is just files (ADR-0004) —
copying folders starts nothing. Everything the installer writes must be
**idempotent** (running twice = zero changes) and **reversible**
(`wienerdog uninstall` fully undoes it via the install manifest). A symlink is
reversed by unlinking; a **copied directory** is non-empty, so it needs its own
manifest kind whose reverse handler removes the tree recursively — a plain
`kind: 'dir'` entry only removes *empty* dirs and would leave the copy behind,
breaking the "install→use→uninstall leaves only the vault" release criterion.

The `wienerdog-*` prefix is Wienerdog's namespace under the harness skills dir;
the existing symlink logic already treats any `wienerdog-*` entry there as
Wienerdog's to manage (it re-points such symlinks freely). This WP extends that
posture to the copy case: a `wienerdog-*` **directory** at the target is treated
as a prior Wienerdog copy to refresh, never as a user file. A **regular file**
at that path is still left untouched (users don't create files there, but the
guard stays).

## Current state

`src/adapters/shared.js#applySkillLinks` today:

```js
function applySkillLinks(skillsDir, targetSkillsDir, dryRun, manifest, out) {
  if (process.platform === 'win32') {
    out.notices.push('skill linking unsupported on Windows in v1');
    return;
  }

  let names = [];
  try {
    names = fs
      .readdirSync(skillsDir, { withFileTypes: true })
      .filter((d) => (d.isDirectory() || d.isSymbolicLink()) && d.name.startsWith('wienerdog-'))
      .map((d) => d.name);
  } catch {
    names = [];
  }
  if (names.length === 0) return;

  // Ensure the target skills dir exists.
  if (!fs.existsSync(targetSkillsDir)) {
    if (!dryRun) fs.mkdirSync(targetSkillsDir, { recursive: true });
    recordOnce(manifest, { kind: 'dir', path: targetSkillsDir });
  }

  for (const name of names) {
    const target = path.join(skillsDir, name);
    const linkPath = path.join(targetSkillsDir, name);
    let stat = null;
    try {
      stat = fs.lstatSync(linkPath);
    } catch {
      stat = null;
    }

    if (stat === null) {
      if (!dryRun) fs.symlinkSync(target, linkPath);
      recordOnce(manifest, { kind: 'symlink', path: linkPath });
      out.changed.push(linkPath);
    } else if (stat.isSymbolicLink()) {
      let currentTarget = null;
      try {
        currentTarget = fs.readlinkSync(linkPath);
      } catch {
        currentTarget = null;
      }
      if (currentTarget === target) {
        out.unchanged.push(linkPath);
        recordOnce(manifest, { kind: 'symlink', path: linkPath });
      } else {
        if (!dryRun) {
          fs.unlinkSync(linkPath);
          fs.symlinkSync(target, linkPath);
        }
        recordOnce(manifest, { kind: 'symlink', path: linkPath });
        out.changed.push(linkPath);
      }
    } else {
      // Regular file/dir the user owns — never clobber.
      out.notices.push(`left user file untouched: ${linkPath}`);
    }
  }
}
```

Both `src/adapters/claude.js` (line 76) and `src/adapters/codex.js` (line 90)
call it as `shared.applySkillLinks(skillsDir, targetSkillsDir, dryRun, manifest,
out)` — five positional args, no options object. **Do not change those call
sites**; the new options object is a trailing optional argument.

`src/core/manifest.js#reverse` dispatches on `entry.kind` with handlers for
`file`, `dir`, `symlink`, `managed-block`, `settings-entry`, `scheduler-entry`,
and `vendored-tree`; an unknown kind is skipped with a warning. The existing
`reverseVendoredTree` is the model for a recursive-removal handler:

```js
function reverseVendoredTree(entry, dryRun, removed, skipped, removedSet) {
  if (!isDir(entry.path)) { skipped.push(entry.path); return; }
  if (!dryRun) fs.rmSync(entry.path, { recursive: true, force: true });
  removedSet.add(entry.path);
  removed.push(entry.path);
}
```

`isDir(p)` and `isFile(p)` helpers exist in `manifest.js`. `module.exports`
currently lists `{ load, record, save, reverse, reverseSchedulerEntry,
reverseVendoredTree }`.

No test asserts the `skill linking unsupported on Windows in v1` notice string
(verified). The existing skill tests in `tests/unit/claude-adapter.test.js` all
self-guard with `if (process.platform === 'win32') return`, so they remain green
on POSIX after the early-return is removed.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file (the status flip),
     docs/specs/ROADMAP.md, package-lock.json. Everything else must be listed. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/adapters/shared.js | `applySkillLinks` gains a `symlink` test seam + copy-fallback + `copied-skill` records + refresh of an existing copy; add internal `dirsEqual` helper. Remove the `win32` early-return. |
| modify | src/core/manifest.js | add `reverseCopiedSkill`, wire `copied-skill` into `reverse()`, export it |
| create | tests/unit/shared-skill-links.test.js | seam, copy-fallback, idempotency, update, user-file tests |
| modify | tests/unit/manifest.test.js | `copied-skill` recursive-removal + already-gone tests |

### Exact contracts

**1. `applySkillLinks` (shared.js).** New signature (trailing optional `opts`):

```js
/** Step 3 — register each core skill dir into a harness's skills dir. Prefers a
 *  symlink; where symlink creation is unpermitted (Windows without privilege:
 *  EPERM/EACCES) falls back to COPYING the folder so /wienerdog-* still
 *  registers. A copied dir is recorded as `copied-skill` (reversed by recursive
 *  removal). A prior copy (a wienerdog-* directory at the target) is refreshed
 *  when its content differs from the source.
 *  @param {string} skillsDir core skills dir
 *  @param {string} targetSkillsDir the harness's skills dir
 *  @param {boolean} dryRun
 *  @param {object} [manifest]
 *  @param {{changed: string[], unchanged: string[], notices: string[]}} out
 *  @param {{symlink?: (target: string, path: string) => void}} [opts]
 *    test seam only; defaults to fs.symlinkSync. */
function applySkillLinks(skillsDir, targetSkillsDir, dryRun, manifest, out, opts = {}) {
```

Behavior:

- Delete the `process.platform === 'win32'` early-return entirely. Skill
  registration now runs on every platform; the copy-fallback handles hosts where
  symlinks are unpermitted.
- Keep the `names` discovery, the `names.length === 0` early-return, and the
  target-skills-dir creation (with its `kind: 'dir'` record) exactly as-is.
- `const symlink = opts.symlink || fs.symlinkSync;`
- Per-name state machine at `linkPath = path.join(targetSkillsDir, name)`, with
  `target = path.join(skillsDir, name)` and `stat = lstatSync(linkPath)` (or
  `null` if absent):

  - **`stat` is a symlink** → existing reconciliation, unchanged (compare
    `readlinkSync` to `target`; re-point if different; `kind: 'symlink'`).

  - **`stat` is a directory** (a prior copy in the `wienerdog-*` namespace) →
    refresh: if `dirsEqual(target, linkPath)` push `linkPath` to
    `out.unchanged`; else (when `!dryRun`) `fs.rmSync(linkPath, {recursive:
    true, force: true})` then `fs.cpSync(target, linkPath, {recursive: true})`
    and push to `out.changed`. Always `recordOnce(manifest, {kind:
    'copied-skill', path: linkPath})`.

  - **`stat` is any other real file** → `out.notices.push(\`left user file
    untouched: ${linkPath}\`)` (unchanged guard).

  - **`stat === null`** (absent):
    - On `dryRun`: `recordOnce(manifest, {kind: 'symlink', path: linkPath})`;
      `out.changed.push(linkPath)` (advisory — a dry run does not probe symlink
      permission; report the common case).
    - Else attempt `symlink(target, linkPath)`. On success:
      `recordOnce(manifest, {kind: 'symlink', path: linkPath})`. On an error
      with `code === 'EPERM'` or `code === 'EACCES'`: `fs.cpSync(target,
      linkPath, {recursive: true})` then `recordOnce(manifest, {kind:
      'copied-skill', path: linkPath})`. On any other error: rethrow. Then
      `out.changed.push(linkPath)`.

**2. `dirsEqual` helper (shared.js, internal — not exported).** Recursively
compares two directory trees by relative entry set and file bytes. Include
verbatim (the byte comparison is what makes the copy refresh idempotent):

```js
/** Deep-equal two directory trees: identical relative entry set + file bytes.
 *  @param {string} a @param {string} b @returns {boolean} */
function dirsEqual(a, b) {
  const listRel = (root) => {
    const acc = [];
    const walk = (dir, prefix) => {
      let ents = [];
      try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
      for (const e of ents.slice().sort((x, y) => x.name.localeCompare(y.name))) {
        const rp = prefix ? `${prefix}/${e.name}` : e.name;
        if (e.isDirectory()) { acc.push(`d:${rp}`); walk(path.join(dir, e.name), rp); }
        else acc.push(`f:${rp}`);
      }
    };
    walk(root, '');
    return acc;
  };
  const ra = listRel(a);
  const rb = listRel(b);
  if (ra.length !== rb.length || ra.some((v, i) => v !== rb[i])) return false;
  for (const entry of ra) {
    if (!entry.startsWith('f:')) continue;
    const relParts = entry.slice(2).split('/');
    if (!fs.readFileSync(path.join(a, ...relParts)).equals(fs.readFileSync(path.join(b, ...relParts)))) {
      return false;
    }
  }
  return true;
}
```

Leave `module.exports` of shared.js as-is (do not export `dirsEqual`).

**3. `reverseCopiedSkill` (manifest.js).** Mirror `reverseVendoredTree`:

```js
/** Reverse a 'copied-skill' entry: recursively remove the copied skill folder
 *  (entirely Wienerdog-authored, regenerable by `sync`). Adds the path to
 *  removedSet so the enclosing skills dir still counts as empty.
 *  @param {ManifestEntry} entry
 *  @param {boolean} dryRun
 *  @param {string[]} removed @param {string[]} skipped @param {Set<string>} removedSet */
function reverseCopiedSkill(entry, dryRun, removed, skipped, removedSet) {
  if (!isDir(entry.path)) { skipped.push(entry.path); return; }
  if (!dryRun) fs.rmSync(entry.path, { recursive: true, force: true });
  removedSet.add(entry.path);
  removed.push(entry.path);
}
```

Wire it into `reverse()` alongside the other `else if (entry.kind === …)`
branches:

```js
} else if (entry.kind === 'copied-skill') {
  reverseCopiedSkill(entry, dryRun, removed, skipped, removedSet);
}
```

Add `reverseCopiedSkill` to `module.exports`.

### Example: Windows install → uninstall round-trip

Source `~/.wienerdog/skills/wienerdog-setup/SKILL.md` exists. First `sync` on a
symlink-less host copies it to `~/.claude/skills/wienerdog-setup/` (a real dir
with `SKILL.md`) and records `{kind: 'copied-skill', path:
'~/.claude/skills/wienerdog-setup'}`. Re-running `sync` finds the dir equal to
source → `unchanged`, one manifest entry. A version bump that changes
`SKILL.md` → `sync` refreshes the copy → `changed`. `uninstall` removes the
copied folder recursively and, once its children are gone, the now-empty
`~/.claude/skills` dir (from its `kind: 'dir'` entry).

## Implementation notes & constraints

- No new npm dependencies. Plain Node ≥ 18, JSDoc types only, no build step.
- Do NOT modify `src/adapters/claude.js` or `src/adapters/codex.js`. Both call
  `applySkillLinks` with five positional args; `opts` defaults to `{}` and
  production uses `fs.symlinkSync`. The seam is exercised only by the new tests
  calling `shared.applySkillLinks` directly.
- Test the copy fallback with an **injected `symlink`** that throws an `EPERM`
  error — do NOT mock `process.platform`. On the first (absent) run the injected
  symlink fires; on later runs the target is already a directory, so the
  directory-refresh branch is taken and the seam is not called.
- Idempotency is load-bearing: a second identical `sync` must report the copied
  skill as `unchanged` and must not grow the manifest — `dirsEqual` + `recordOnce`
  guarantee both.
- A `copied-skill` folder must reverse cleanly so that install→use→uninstall
  leaves only the vault (M7 criterion). This is why it gets its own manifest
  kind rather than reusing `kind: 'dir'` (which only removes empty dirs).
- When uncertain: choose the simpler option and note it in the PR under
  "Decisions made". Do NOT expand scope.

## Acceptance criteria

- [ ] On POSIX with the default seam, a `wienerdog-*` skill is **symlinked**
      into the target dir (existing behavior preserved; the `win32` early-return
      is gone).
- [ ] With an injected `symlink` that throws `EPERM`, the skill folder is
      **copied** into the target dir (a real directory whose `SKILL.md` is
      present, so `/wienerdog-*` registers), and a `copied-skill` manifest entry
      is recorded.
- [ ] A second run over an existing copy reports it as `unchanged` and does not
      add a second manifest entry (idempotent).
- [ ] When the source skill's content changes, the next run refreshes the copy
      (`changed`) and the copied folder's bytes match the new source.
- [ ] A plain regular file the user placed at the target path is left untouched
      with a notice.
- [ ] `manifest.reverse` removes a `copied-skill` folder recursively and lets
      the enclosing (now-empty) skills dir be removed; an already-gone
      `copied-skill` entry is reported as `skipped`.
- [ ] All existing tests still pass.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern skill
npm test -- --test-name-pattern copied-skill
npm test -- --test-name-pattern manifest
npm test
npm run lint
```

## Out of scope (do NOT do these)

- The `repointCurrent` Windows fallback — that is **WP-049**
  (`src/core/vendor.js`).
- Windows scheduling, `install.ps1`, junctions — deferred to M6–M7 (ADR-0013).
- Changing the Claude/Codex adapter call sites or their own test files. The
  stale `// symlinking skipped on Windows in v1` comment in
  `tests/unit/claude-adapter.test.js` is left for a later sweep (not in this
  table).
- Copying skills over an existing **symlink** (that path already reconciles
  correctly and is unchanged).

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/050-skills-copy-fallback`; conventional commits; PR titled
   `fix(adapters): copy skills where symlink creation is unpermitted (WP-050)`.
3. PR template filled, including "Decisions made" (or "none") and
   `Generated-by:`. Credit the external reporter in the PR body:
   `Reported-by: external user (userreports/issue-repointCurrent-eperm.md)`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
