---
id: WP-153
title: Make the manifest symlink reverser target-aware so uninstall never deletes a user's replacement link
status: Ready
model: opus
size: S
depends_on: [WP-144]
adrs: [ADR-0004, ADR-0019, ADR-0031]
branch: wp/153-target-aware-symlink-reverser
---

# WP-153: Target-aware symlink reverser (audit A13 follow-up — Codex-found)

## Context (read this, nothing else)

Wienerdog is an install-time tool that writes configuration files onto a user
machine and records every artifact it creates in an **install manifest**
(`~/.wienerdog/install-manifest.json`). `wienerdog uninstall` replays that
manifest in reverse to remove exactly what was created and nothing else.
**IRON RULE (ADR-0004): Wienerdog is just files** — uninstall must remove only
what Wienerdog created, and **never delete a user's file**. ADR-0019 states the
same rule from the other side: uninstall disposes the core's machine-generated
mechanics, and anything it cannot *prove* it created is preserved.

One of the artifacts Wienerdog creates is a **skill symlink**: for each core
skill named `wienerdog-*`, `applySkillLinks` (`src/adapters/shared.js`) creates
`<harness skills dir>/wienerdog-<name>` pointing at `<core skills source>/
wienerdog-<name>`, and records `{kind:'symlink', path: linkPath}` in the
manifest. On uninstall, `reverseSymlink` in `src/core/manifest.js` unlinks
**whatever symlink now sits at `path`**, checking only that the path is *still a
symlink* — never that it still points at a Wienerdog source.

Audit finding **A13** (foreign-symlink preservation, WP-146) fixed the SYNC
side: `applySkillLinks` now preserves a `wienerdog-*` symlink whose target is
not our core skill source, and drops the stale ownership entry when it observes
the replacement. But that drop only happens on a **re-sync**. The uninstall
side is still target-blind, so two paths remain where a user's replacement link
is deleted:

1. **Direct uninstall (no healing re-sync).** We created the link (manifest has
   the entry); the user replaces it with their own `wienerdog-*` symlink; they
   uninstall without ever re-running sync. `reverseSymlink` sees a symlink at
   the recorded path and unlinks the user's link.
2. **Re-sync that fails before `manifest.save`.** The in-memory drop never
   persists, so the stale entry survives to uninstall.

This was found by the WP-146 Codex adversarial review. `reverseCopiedSkill`
already models the correct defense for the directory case (lstat + `hashDir`
ownership proof); the symlink reverser needs the analogous check.

## Current state

**Re-verification record.** Every executable claim below was read and re-run
first-hand against the working tree at commit **`e7c845e`** on **2026-08-01**
(architect pass; the original draft was written against the WP-146 review tree).
Every line number, code shape and grep result below holds at `e7c845e`. The
two named test files were run green at that commit with
`node tests/run.js tests/unit/manifest.test.js tests/unit/shared-skill-links.test.js`
(86 tests, 85 pass, 1 skipped, 0 fail).

### 1. `reverseSymlink` — `src/core/manifest.js:144-159`

Verbatim at `e7c845e` (the `// ← …` annotation is this spec's, not in the file):

```js
/**
 * Reverse a 'symlink' entry: unlink only if it is still a symlink we created.
 * @param {ManifestEntry} entry
 * @param {boolean} dryRun
 * @param {string[]} removed @param {string[]} skipped @param {Set<string>} removedSet
 */
function reverseSymlink(entry, dryRun, removed, skipped, removedSet) {
  if (!isSymlink(entry.path)) {
    // User replaced it with a real file/dir, or it is already gone.
    skipped.push(entry.path);
    return;
  }
  if (!dryRun) fs.unlinkSync(entry.path);   // ← deletes ANY symlink here, foreign or ours
  removedSet.add(entry.path);
  removed.push(entry.path);
}
```

Its doc comment already claims *"unlink only if it is still a symlink we
created"* — a claim the body does not implement. This WP makes the comment true.

`isSymlink` (`manifest.js:136-142`) is `fs.lstatSync(p).isSymbolicLink()` inside
a `try`, returning `false` on any throw.

### 2. The single call site — `src/core/manifest.js:718-729`

`reverse()` dispatches by kind. The symlink arm validates the canonical PARENT
is in-bounds and then delegates:

```js
      } else if (entry.kind === 'symlink') {
        // F30: validate the canonical PARENT is in-bounds, then reverseSymlink
        // lstat+unlinks the LINK ITSELF (it must NOT resolve through the link).
        const target = path.join(fs.realpathSync(path.dirname(entry.path)), path.basename(entry.path));
        if (!withinAllowedRoot(target, allowedRoots, localBin)) {
          process.stderr.write(
            `wienerdog: preserving ${entry.path} — outside every Wienerdog-owned root (not deleting)\n`
          );
          skipped.push(entry.path);
          continue;
        }
        reverseSymlink(entry, dryRun, removed, skipped, removedSet);
      }
```

`grep -rn "reverseSymlink" src/` at `e7c845e` returns exactly four lines:
the definition (`manifest.js:150`), a comment (`manifest.js:719`), the one call
(`manifest.js:729`), and one prose mention in `shared.js:406`. **There is no
second reverser and no second call site.**

### 3. The three producer sites — `src/adapters/shared.js`

`grep -rn "kind: 'symlink'" src/` at `e7c845e` returns exactly three lines, all
in `applySkillLinks`, all target-less:

```text
src/adapters/shared.js:399:        recordOnce(manifest, { kind: 'symlink', path: linkPath });
src/adapters/shared.js:450:      recordOnce(manifest, { kind: 'symlink', path: linkPath });
src/adapters/shared.js:456:        recordOnce(manifest, { kind: 'symlink', path: linkPath });
```

All three sit inside one `for (const name of names)` loop whose first two lines
(`shared.js:381-382`) are:

```js
    const target = path.join(skillsDir, name);
    const linkPath = path.join(targetSkillsDir, name);
```

so the value this WP must record is **already in scope, already named `target`,
at every one of the three sites**. Their branches are:

- `:399` — a pre-existing symlink whose `fs.readlinkSync(linkPath) === target`
  (our own link, adopted into the manifest; reported `unchanged`).
- `:450` — the `dryRun` branch for an absent link (reports the common case).
- `:456` — the real creation branch: `symlink(target, linkPath)` succeeded.

The `else` of `:399` is WP-146's preserve arm (`shared.js:400-412`): a
`wienerdog-*` symlink whose `readlinkSync` is **not** `target` is left untouched,
gets a notice, records **no** entry, and calls
`dropOwnedEntry(manifest, 'symlink', linkPath)` (`shared.js:76`, `:408`). Its
own comment names this WP's defect in so many words: *"reverseSymlink (which
unlinks any symlink at a recorded path, without a target check) would delete the
user's replacement on uninstall."*

### 4. The manifest entry schema — `src/core/manifest.js:806-817` (shipped by WP-144, Done)

```js
const ENTRY_FIELD_TYPES = {
  file: { hash: 'string' },
  dir: {},
  symlink: {},
  'managed-block': { createdFile: 'boolean' },
  …
};
```

`validateEntry` (`manifest.js:828-849`) rejects an unknown `kind` and a
missing/empty/non-string `path`; for every **listed** field it enforces the type
**only when the field is present** (`if (value === undefined) continue;`), and
its doc comment states *"extra keys are ignored (forward-compat)"*. Two
consequences the implementer must not re-derive:

- A **legacy** entry (no `target`) passes `validateEntry` both before and after
  this WP. Adding the field breaks no existing install.
- An entry carrying a non-string `target` is rejected fail-safe by `reverse()`
  **before** `reverseSymlink` runs, once the field is listed — so the reverser
  never has to defend against a non-string `target`.

### 5. The entry-shape doc comment — `src/core/manifest.js:17`

The module header enumerates every entry shape. Line 17 reads:

```text
 *   {kind:'symlink', path}                          — a symlink we created
```

This is a **mirror of the entry shape** and goes stale the moment the field is
added. `manifest.js` is already a deliverable; the row is listed in the Mirrored
Surface Checklist so it cannot be missed.

### 6. The ownership-proof precedent this WP copies — `reverseCopiedSkill` (`manifest.js:404-437`)

The directory analogue already refuses on an unprovable entry. Its sequence is:
`isDir` → `wienerdog-` basename + parent-realpath-is-a-harness-skills-root →
`fs.lstatSync(...).isDirectory()` (a symlink at the path is *not* our directory)
→ `typeof entry.hash !== 'string' || hashDir(entry.path) !== entry.hash`. Both
failure arms write
`wienerdog: keeping <path> — not the Wienerdog skill we recorded (modified, replaced, or unverifiable)`
to stderr and `skipped.push`.

**Its hash-less (legacy) branch is the settled house policy this WP inherits**,
and it is already pinned by a shipped test in
`tests/unit/shared-skill-links.test.js`, green at `e7c845e`:

```text
✔ legacy hash-less copied-skill entry → PRESERVED, notice, never rmSync (unverifiable)
```

### 7. The realpath-equality helper — `src/core/manifest.js:353-359`

```js
function sameResolvedDir(a, b) {
  try {
    return fs.realpathSync(a) === fs.realpathSync(b);
  } catch {
    return false;
  }
}
```

It is **fail-closed by construction**: any unresolvable side returns `false`,
which in this WP's Table A means *preserve*, never *delete*. Used today at
`manifest.js:377` (vendored-tree) and `:407` (copied-skill).

### 8. The two test files, and what they already cover

Both exist and were run green at `e7c845e`.

- `tests/unit/manifest.test.js` — the reverser suite.
- `tests/unit/shared-skill-links.test.js` — the `applySkillLinks` suite. It
  already contains the WP-146 sync-side tests, including
  `a link WE created, then user-replaced with a foreign target, loses its manifest ownership entry on re-sync — so uninstall cannot delete the replacement (WP-146)`.
  **That test proves only the healing-re-sync path.** No shipped test covers the
  direct-uninstall path, which is exactly the gap this WP closes.

### 9. What re-verification found stale, and what was corrected

The 2026-07-18 draft said *"Extend the symlink schema (coordinate with WP-144)"*
and *"Coordinate the schema addition with WP-144's per-kind schema."* **WP-144
is `Done` and lives in `docs/specs/done/WP-144-manifest-untrusted-schema-and-bounded-deletes.md`.**
There is nothing left to coordinate: the schema shipped, its exact location is
`ENTRY_FIELD_TYPES` at `manifest.js:806-817` (Current state §4), and this spec
now states the one-line change instead of routing it to a conversation. No other
claim in the draft was stale.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file itself (the status flip)
     and package-lock.json. Everything else must be listed. -->

**Sizing (recorded, not left implicit).** One expression added at three call
sites in `shared.js`; one schema cell, one doc-comment line and one function body
(≈ 12 lines) in `manifest.js`; two test files extended. No new module, no new
export, no CLI change, no ADR. **S.** It is not split further: recording the
field without consuming it ships dead data, and consuming a field nothing records
ships a branch no install reaches.

| Action | Path | Notes |
|--------|------|-------|
| modify | src/adapters/shared.js | **D1** — add `target` to the entry object at all three `recordOnce(manifest, { kind: 'symlink', … })` sites (`:399`, `:450`, `:456` — Current state §3), per **Table B**. Nothing else in this file changes: the WP-146 preserve arm, `dropOwnedEntry`, the `readlinkSync` comparison and every notice string stay byte-identical. |
| modify | src/core/manifest.js | **D2** — `reverseSymlink` implements **Table A**; **D3** — `ENTRY_FIELD_TYPES.symlink` becomes `{ target: 'string' }` (`:809`); **D4** — the entry-shape doc comment at `:17` gains the optional field per **Table B**. No other function, no other kind, no change to `reverse()`'s symlink arm at `:718-729`. |
| modify | tests/unit/manifest.test.js | **T1–T4** — the exact set in the Test index below. |
| modify | tests/unit/shared-skill-links.test.js | **T5** — assert the recorded symlink entry now carries the expected `target` at all three producer branches (Table B). Every existing test in this file must pass **unmodified**. |

Not deliverables, deliberately: `src/cli/uninstall.js`, every other reverser,
`docs/GLOSSARY.md`, `docs/adr/**`, `tests/golden/**`.

### Exact contracts

```js
/**
 * Reverse a 'symlink' entry: unlink ONLY when the link still resolves to the
 * source we recorded. A legacy (target-less) entry and a target mismatch are
 * both PRESERVED and reported as skipped — never unlinked.
 * @param {ManifestEntry} entry  {kind:'symlink', path, target?}
 * @param {boolean} dryRun
 * @param {string[]} removed @param {string[]} skipped @param {Set<string>} removedSet
 */
function reverseSymlink(entry, dryRun, removed, skipped, removedSet)
```

Producer, at all three sites (`target` is already the in-scope local from
`shared.js:381`):

```js
recordOnce(manifest, { kind: 'symlink', path: linkPath, target });
```

Schema cell (`manifest.js:809`):

```js
  symlink: { target: 'string' },
```

## Contract reference

**Activation (ADR-0031, 2-of-7): four triggers fire, so the discipline is on.**
(i) an interface **shape** changes — the `{kind:'symlink'}` manifest entry gains
a field; (iii) **schema acceptance** changes — `ENTRY_FIELD_TYPES.symlink` stops
being `{}`; (v) the task **crosses an authority boundary** — `shared.js` emits
the `target` and `manifest.js` alone decides what it authorizes; (vii) the same
contract appears in **multiple mirrored surfaces** — three producer sites, one
schema cell, one module doc comment, one reverser, two test files. **Two
canonical tables** below; every mirror is registered under them.

### Table A — what `reverseSymlink(entry)` does (canonical)

Conditions are evaluated **in order**; the first that holds decides. `L` is
`entry.path` (the link), `T` is `entry.target` (the recorded source).

| # | Condition | Filesystem action | Bucket | stderr | Why this is the fail-safe answer |
|---|-----------|-------------------|--------|--------|----------------------------------|
| 1 | `!isSymlink(L)` | none | `skipped` | none | Unchanged shipped behavior. A real file/dir at `L`, or nothing at all, is definitionally not the link we made. |
| 2 | `typeof T !== 'string' \|\| T === ''` — a **LEGACY** entry | none | `skipped` | `wienerdog: keeping <L> — not the Wienerdog skill link we recorded (replaced, or unverifiable)` | Recorded before this WP, so ownership is **unprovable**. Preserve. This is the same disposition `reverseCopiedSkill` already ships for a hash-less entry (Current state §6), not a new policy. |
| 3 | `sameResolvedDir(L, T) === false` **and** `readlinkSync(L) !== T` | none | `skipped` | same line as row 2 | The link at `L` points somewhere else — a user's replacement, or a stale link from another install root. Both sub-tests are fail-closed (`sameResolvedDir` catches and returns `false`; the lexical test runs inside a `try` whose `catch` yields no match), so **every** error path lands in this row, i.e. in *preserve*. |
| 4 | otherwise | `if (!dryRun) fs.unlinkSync(L)` | `removed` **and** `removedSet.add(L)` | none | The link provably resolves to the source we recorded. This is the only row that deletes. |

**Row 3 has two sub-tests on purpose, and the order is fixed: realpath first,
lexical second.**

- `sameResolvedDir(L, T)` is `realpath(L) === realpath(T)` (Current state §7).
  On a symlink, `realpath` follows the link — so this is the *semantic* proof and
  it matches what every other reverser in this file uses.
- The lexical fallback `fs.readlinkSync(L) === T` exists for **one** reachable
  case: the user deleted the core by hand and then ran `uninstall`, so
  `realpath(T)` throws and the realpath test cannot succeed for *our own* link.
  Without the fallback, `wienerdog uninstall` would leave its own dangling links
  behind on that path. The fallback **cannot** widen row 4 to a foreign link: a
  foreign link's `readlink` is by definition some other path, and `T` is a value
  only Wienerdog ever wrote.
- Both are **string/inode equality only**. Do **not** add a prefix, `startsWith`,
  `path.relative`, or "is under the core" test — an ancestor-scoped test would
  authorize deleting any link pointing anywhere inside the core, which is a
  larger permission than "the link we recorded".

### Table B — the `{kind:'symlink'}` entry shape (canonical)

| Field | Type | Written by | Value | Read by |
|-------|------|-----------|-------|---------|
| `kind` | `'symlink'` | `shared.js:399`, `:450`, `:456` | literal | `reverse()` dispatch (`manifest.js:718`) |
| `path` | `string` (required) | same three sites | `linkPath` = `path.join(targetSkillsDir, name)` (`shared.js:382`) | `validateEntry`, `withinAllowedRoot`, Table A |
| `target` | `string` (**optional** — absent on legacy entries) | same three sites | `target` = `path.join(skillsDir, name)` (`shared.js:381`) — the core skill source the link points at | Table A rows 2–4 only |

Mirrors of this table, stated so they cannot drift:

- Schema cell (`manifest.js:809`): `symlink: { target: 'string' }` — listed, so
  a present-but-non-string `target` is rejected by `validateEntry` before the
  reverser sees it, and an **absent** `target` still validates (Current state §4).
- Module doc comment (`manifest.js:17`) becomes exactly:

  ```text
   *   {kind:'symlink', path, target?}                 — a symlink we created;
   *                                                     `target` is the source it
   *                                                     must still resolve to
   *                                                     (absent on legacy entries)
  ```

**`target` is never used as a path to write, delete, open, or spawn.** It is
compared and nothing else. There is no untrusted-identifier flow to anchor.

### Mirrored Surface Checklist

Tables A and B are the single place these facts are decided. Every surface in
this spec that restates them is registered here, so one review finding updates
the table **and** all its mirrors in one pass, and any new mirror found in review
is added here on the spot.

In this spec:

- [ ] Deliverables cell for `src/adapters/shared.js` (D1 — the three sites, Table B row `target`)
- [ ] Deliverables cell for `src/core/manifest.js` (D2/D3/D4 — Table A, the schema cell, the doc comment)
- [ ] Deliverables cell for `tests/unit/manifest.test.js` (it mirrors the **Test index** rows T1–T4)
- [ ] Deliverables cell for `tests/unit/shared-skill-links.test.js` (T5 — Table B)
- [ ] The **Sizing** paragraph (it restates the three-site count)
- [ ] "Exact contracts" — the JSDoc block, the `recordOnce` line, the schema cell
- [ ] Current state §3 (the three producer sites and their branches — Table B)
- [ ] Current state §4 (the schema's optional-field semantics — Table B)
- [ ] Current state §5 (the doc-comment mirror — Table B)
- [ ] Current state §6 (the legacy-preserve precedent — Table A row 2)
- [ ] Current state §7 (`sameResolvedDir`'s fail-closed direction — Table A row 3)
- [ ] The **Test index** (every row names the Table A row or Table B field it drives)
- [ ] Security checklist bullets 1–3 (Table A rows 2, 3 and 4)
- [ ] Acceptance criteria AC1–AC5
- [ ] Verification commands V1–V5
- [ ] Implementation notes §"Legacy entries" and §"Do not touch the sync side"

Out of this spec, registered so a later Table A/B change updates them too —
**none is a deliverable**, and none may be edited by the implementer:

- [ ] `src/adapters/shared.js:400-412` — the WP-146 preserve arm's comment names
      `reverseSymlink`'s target-blindness as the reason it drops the ownership
      entry. After this WP that sentence describes a defect that no longer
      exists. It is **left alone deliberately** (see "Out of scope"); registered
      so a future WP that rewords it knows this table is its source.
- [ ] `docs/specs/done/WP-146-settings-upsert-and-foreign-symlink-preserve.md` —
      the shipped record of the sync-side half. Never edited.

## Implementation notes & constraints

### Legacy entries — the policy, and why it is not a judgment call

A target-less entry is **preserved, never deleted** (Table A row 2). This is not
a new decision: `reverseCopiedSkill` has shipped exactly this disposition for a
hash-less `copied-skill` entry since WP-146, and it is pinned by a green test
(Current state §6). The cost is stated rather than hidden: **on an install
created before this WP, `wienerdog uninstall` will leave the `wienerdog-*` skill
symlinks in place** and report them as skipped, until one `wienerdog sync`
re-records them with a `target`. That is the same bounded cost already accepted
for legacy copied-skill directories, and it is the correct direction: leaving a
file behind is recoverable, deleting a user's file is not.

Do **not** try to recover the legacy case by inferring ownership from the link's
current target (e.g. "it points inside the core, so it is ours"). That is the
ancestor-scoped test Table A row 3 forbids, and it re-opens the deletion
permission this WP exists to close.

### Do not touch the sync side

`applySkillLinks`'s foreign-link preserve arm, its `dropOwnedEntry` call and its
lexical `readlinkSync(linkPath) === target` comparison all stay byte-identical.
They ship correct behavior (WP-146) and their tests must pass unmodified. This
WP only adds `target` to the three `recordOnce` calls in that same file.

### General

- No new npm dependency and no new `require` in either source file. `manifest.js`
  already requires `node:fs` and `node:path`.
- Guard the lexical fallback: `fs.readlinkSync` throws on a dangling-parent or
  permission error, so it must sit inside a `try`/`catch` whose `catch` yields
  "no match" (→ Table A row 3 → preserve).
- `dryRun` changes **only** whether `fs.unlinkSync` runs (Table A row 4). The
  bucket assignment is identical in both modes, exactly as today.
- No daemon, no watcher, no telemetry, no background process (ADR-0004).
- When uncertain: choose the simpler option and record it in the PR under
  "Decisions made". Do NOT expand scope to resolve ambiguity.

### Test index

| # | File | What it asserts | Drives |
|---|------|-----------------|--------|
| T1 | `tests/unit/manifest.test.js` | **The regression, red-first.** Manifest holds `{kind:'symlink', path: L, target: T}`; the user has replaced `L` with a symlink to their own directory. `reverse()` leaves `L` on disk, its readlink unchanged, and reports it in `skipped`, not `removed`. | Table A row 3 |
| T2 | `tests/unit/manifest.test.js` | **No regression.** `L` is still our own unmodified link to `T`. `reverse()` unlinks it and reports it in `removed`. Repeat with `dryRun: true`: `L` still exists, and it is still reported in `removed`. | Table A row 4 |
| T3 | `tests/unit/manifest.test.js` | **Legacy.** The entry has no `target` at all. `reverse()` leaves `L` on disk and reports it in `skipped`, whatever `L` currently points at (assert both: pointing at `T`, and pointing elsewhere). | Table A row 2 |
| T4 | `tests/unit/manifest.test.js` | **Dangling core.** The entry carries `target: T`, `L` is still our link with `readlink(L) === T`, but `T` has been removed from disk. `reverse()` still unlinks `L` (the lexical fallback), and reports it in `removed`. | Table A row 3, lexical fallback |
| T5 | `tests/unit/shared-skill-links.test.js` | The recorded entry carries `target === path.join(skillsDir, name)` at **all three** producer branches: the adopt-existing-link branch, the `dryRun` branch, and the create branch. | Table B |

**Prove T1 in both directions** (`docs/runbooks/codex-review.md`): run it against
the untouched `reverseSymlink` (expect **red** — the user's link is unlinked) and
against the finished one (expect **green**). A test that is only ever green after
the change does not show the defect was real.

## Security checklist

- [ ] A user's replacement `wienerdog-*` symlink survives a **direct** uninstall
      (no intervening sync) and a re-sync-that-failed-before-save — Table A row 3,
      pinned by T1.
- [ ] Our own unmodified link is still removed on uninstall, in both real and
      dry-run mode — Table A row 4, pinned by T2. No regression.
- [ ] A legacy target-less symlink entry is preserved, not deleted — Table A
      row 2, pinned by T3. No uninstall breakage for installs created before
      this WP.
- [ ] `entry.target` is **compared only** — never passed to `unlink`, `rm`,
      `open`, `require`, or any spawn (Table B). There is no untrusted identifier
      flowing into a filesystem path or a shell command in this WP, so no
      anchored-pattern validation is required; the schema's `'string'` type check
      is the whole input contract.
- [ ] Every error path in Table A lands in *preserve*, never in *delete*:
      `sameResolvedDir` catches and returns `false`, and the lexical fallback's
      `catch` yields no match.

## Acceptance criteria

- [ ] **AC1** — T1 is red against the untouched `reverseSymlink` and green after
      (Table A row 3). Both runs pasted into the PR.
- [ ] **AC2** — T2, T3, T4 and T5 all pass (Table A rows 2 and 4; Table B).
- [ ] **AC3** — Every pre-existing test in `tests/unit/manifest.test.js` and
      `tests/unit/shared-skill-links.test.js` passes **unmodified**; in
      particular the WP-146 sync-side tests are untouched.
- [ ] **AC4** — `grep -c "kind: 'symlink', path: linkPath, target" src/adapters/shared.js`
      is `3`, and `grep -c "kind: 'symlink', path: linkPath }" src/adapters/shared.js`
      is `0` (no producer site left target-less).
- [ ] **AC5** — `npm test` and `npm run lint` are green.

## Verification steps (run these; paste output in the PR)

```bash
# V1 — the two suites this WP touches (never a bare `node --test`; tests/run.js
# sets the scheduler guard the whole suite depends on).
node tests/run.js tests/unit/manifest.test.js tests/unit/shared-skill-links.test.js

# V2 — all three producer sites carry the target (AC4). Expect: 3 then 0.
# (On the untouched tree at e7c845e these print 0 then 3 — i.e. the gate is red
# before the work, which is the proof it is not vacuous. `grep -c` exits 1 on a
# zero count; that exit code is the expected result for the second command
# after the change, not a failure.)
grep -c "kind: 'symlink', path: linkPath, target" src/adapters/shared.js
grep -c "kind: 'symlink', path: linkPath }" src/adapters/shared.js

# V3 — the schema cell is listed (Table B). Expect exactly one line:
#   symlink: { target: 'string' },
grep -n "symlink: {" src/core/manifest.js

# V4 — the reverser consults the recorded target (Table A rows 3-4). Expect a
# `sameResolvedDir` and a `readlinkSync` inside the reverseSymlink body.
sed -n '/^function reverseSymlink/,/^}/p' src/core/manifest.js

# V5 — full gates.
npm test
npm run lint
```

## Out of scope (do NOT do these)

- The SYNC-side preserve + `dropOwnedEntry` (shipped in WP-146). Do not edit
  `applySkillLinks`' preserve arm, its notices, or its lexical comparison — only
  the three `recordOnce` calls.
- Rewording `shared.js:400-412`'s comment, even though this WP makes part of it
  historical. It is registered in the Mirrored Surface Checklist for a later
  pass; editing it here would put a documentation change inside a behavior WP.
- Any other reverser. `reverseCopiedSkill` already has its ownership proof;
  `reverseVendoredTree`, `reverseManagedBlock` and `reverseSettingsEntry` are
  untouched.
- A migration that back-fills `target` onto existing manifests. The next
  `wienerdog sync` re-records the entries through the three producer sites,
  which is the whole migration.
- Any change to `docs/GLOSSARY.md` or any ADR.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body, including
   **both** directions of T1 (AC1).
2. Branch `wp/153-target-aware-symlink-reverser`; conventional commits; PR titled
   `fix(manifest): make the symlink reverser target-aware (WP-153)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.

> **Provenance.** Raised by the Codex adversarial review of the A13 batch (Gyula
> side, 2026-07-18) as the complete fix for the WP-146 F1 residual.
>
> **2026-08-01 — architect re-verification pass, tested SHA `e7c845e`.** Every
> executable Current-state claim was re-run first-hand against the working tree
> at `e7c845e` (see the re-verification record at the head of "Current state").
> Result: **all claims hold**; one instruction was stale and is corrected in
> Current state §9 (WP-144 is `Done`, so "coordinate the schema addition with
> WP-144" is replaced by the exact one-line change at `manifest.js:809`).
>
> **The 2026-07-18 draft's "needs an owner walkthrough before Ready" note is
> resolved and removed**, on this evidence and by the architect, not the owner:
> its two named agenda items were (a) *schema coordination with WP-144* — now
> moot, WP-144 shipped and the cell is `ENTRY_FIELD_TYPES.symlink` at
> `manifest.js:809`; and (b) *legacy-entry policy* — settled by shipped,
> tested precedent rather than by a new decision (`reverseCopiedSkill`'s
> hash-less arm and its green test, Current state §6), with the bounded cost
> written down in Implementation notes §"Legacy entries". Status moved
> `Draft` → `Ready` in the same pass. **If the owner disagrees with either
> resolution, reverting is one line: set `status: Draft`.**
