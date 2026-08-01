---
id: WP-153
title: Make the manifest symlink reverser target-aware so uninstall never deletes a user's replacement link
status: Ready
model: opus
size: S
depends_on: [WP-144, WP-147]
adrs: [ADR-0004, ADR-0019, ADR-0031]
branch: wp/153-target-aware-symlink-reverser
---

# WP-153: Target-aware symlink reverser (audit A13 follow-up — Codex-found)

> **OWNER-DECIDED IN SESSION — 2026-08-01 (TRANSCRIBED, NOT OWNER-TYPED).**
> Gyula Fehér answered in conversation; this record was written by the
> orchestrator, not by him. It records that the decision was taken — it is
> **not** his signature and must never be treated as one, and **no gate keys on
> it**. Verbatim: *"fine to have installs predating the WP have uninstall leave
> all skill symlinks behind."*
>
> This closes the last open question in this spec — the disposition of **legacy
> (target-less) manifest entries**. The full framing, the two rejected
> alternatives and the accepted cost are recorded under
> **[Legacy-entry policy — owner-ruled](#legacy-entry-policy--owner-ruled-transcribed-2026-08-01)**.
> **Table A row 2 is settled by it**; every other row and section was already
> independent of it.
>
> **Process note, kept rather than smoothed over.** A revision of this spec
> earlier on 2026-08-01 moved itself to `Ready` by closing this question with an
> argument, and gate round 1 was right to reject that: the argument reached the
> same answer, but an architect reaching an owner's answer is not the owner
> answering. The status is `Ready` now because Gyula ruled, not because the
> argument improved.

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
is in-bounds and then delegates. **The excerpt below is dedented for readability
and its final `}` is synthetic** — at `e7c845e` line 730 is the next
`} else if (…)`, not a close. Read the file for the exact bytes:
`sed -n '718,729p' src/core/manifest.js`.

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

**`recordOnce` NO-OPS on an existing entry — so adding `target` at these three
sites does NOT migrate an existing install** (`shared.js:47-52`, verified at
`e7c845e`):

```js
function recordOnce(manifest, entry) {
  if (!manifest) return;
  if (!Array.isArray(manifest.entries)) manifest.entries = [];
  const exists = manifest.entries.some((e) => e.kind === entry.kind && e.path === entry.path);
  if (!exists) manifest.entries.push(entry);   // ← an EXISTING entry is left exactly as it was
}
```

An upgraded install already has `{kind:'symlink', path}` in its manifest, so
every later `sync` hits `exists === true` and the entry **stays target-less
permanently — through one sync, and through a hundred**. This was found by the
Codex adversarial leg of gate round 1 and it **falsifies an earlier revision of
this spec**, which claimed under "Out of scope" that *"the next `wienerdog sync`
re-records the entries through the three producer sites, which is the whole
migration"*.

**There is no migration, and by owner ruling (2026-08-01) none will be built.**
Backfilling would need an **upsert** — the shape `recordCopiedSkill`
(`shared.js:54-71`) and `recordSettingsEntry` (`shared.js:90`) already use — and
that was put to the owner and declined. **`recordOnce` therefore stays exactly as
it is at all three sites**, and "legacy" is a permanent state for any install
that predates this WP. See
[Legacy-entry policy](#legacy-entry-policy--owner-ruled-transcribed-2026-08-01).

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

`validateEntry` (`manifest.js:828-849` — **settled by bytes**, see below) rejects an unknown `kind` and a
missing/empty/non-string `path`; for every **listed** field it enforces the type
**only when the field is present** (`if (value === undefined) continue;`), and
its doc comment states *"extra keys are ignored (forward-compat)"*. Two
consequences the implementer must not re-derive:

- A **legacy** entry (no `target`) passes `validateEntry` both before and after
  this WP. Adding the field breaks no existing install.
- An entry carrying a non-string `target` is rejected fail-safe by `reverse()`
  **before** `reverseSymlink` runs, once the field is listed — so the reverser
  never has to defend against a non-string `target`.

**`validateEntry`'s range is `:828-849`, settled with the actual bytes.** Gate
round 1 advised `:828-849` was wrong and the closing brace was at `:850`; round 2
repeated it. It is not. `sed -n '848,851p' src/core/manifest.js | od -c` at
`e7c845e`:

```text
0000000       r  e  t  u  r  n     {     o  k  :     t
0000020    r  u  e     }  ;  \n  }  \n  \n  /  *  *  \n
```

Read positionally: `:848` is the `return { ok: true };` line, **`:849` is the
closing `}`**, `:850` is empty, `:851` opens the next JSDoc block. The range stands at
`:828-849`. Recorded with the bytes rather than re-declined a third time, so the
next reviewer can settle it in one command instead of re-raising it.

### 5. The entry-shape doc comment — `src/core/manifest.js:17`

The module header enumerates every entry shape. Line 17 reads:

```text
 *   {kind:'symlink', path}                          — a symlink we created
```

This is a **mirror of the entry shape** and goes stale the moment the field is
added. `manifest.js` is already a deliverable; the row is listed in the Mirrored
Surface Checklist so it cannot be missed.

### 6. The ownership-proof precedent this WP copies — `reverseCopiedSkill` (`manifest.js:404-437`)

The directory analogue already refuses on an unprovable entry. It has **three**
refuse arms, and they do not all say the same thing:

| Arm | Anchor | Test | stderr |
|-----|--------|------|--------|
| 1 | `manifest.js:408-412` | basename is not `wienerdog-*`, **or** the parent does not realpath-equal a harness skills root | `wienerdog: refusing to remove <path> — not a Wienerdog skill directly under a harness skills dir` |
| 2 | `manifest.js:424-428` | `fs.lstatSync(entry.path).isDirectory()` is false — a symlink at the path is *not* our directory | `wienerdog: keeping <path> — not the Wienerdog skill we recorded (modified, replaced, or unverifiable)` |
| 3 | `manifest.js:429-433` | `typeof entry.hash !== 'string' \|\| hashDir(entry.path) !== entry.hash` | same string as arm 2 |

**The last two arms** share the `keeping …` string; arm 1 has its own. (An
earlier revision of this spec said "both failure arms", which undercounted.)

**Arm 1 is the structural-ownership shape** that was put to the owner as the
declined alternative (ii). **Arm 3's hash-less half is the
preserve-on-unverifiable behaviour** Table A row 2 now matches; it is pinned by a
shipped test in `tests/unit/shared-skill-links.test.js:298`, green at `e7c845e`:

```text
✔ legacy hash-less copied-skill entry → PRESERVED, notice, never rmSync (unverifiable)
```

**That similarity is not the reason Table A row 2 exists** — it is a resemblance,
and gate round 1 was right that it does not settle anything on its own: for a
`copied-skill`, a hash-less entry is a **fallback-only edge** (the normal
`applySkillLinks` path symlinks; copying happens only on `EPERM`/`EACCES`,
`shared.js:457-460`), whereas for a **symlink** the legacy entry is the
**mainline** shape on every install created before this WP. Same mechanism, very
different cost. The cost is what the owner ruled on — see
[Legacy-entry policy](#legacy-entry-policy--owner-ruled-transcribed-2026-08-01).

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
| modify | src/adapters/shared.js | **D1** — add `target` to the entry object at all three `recordOnce(manifest, { kind: 'symlink', … })` sites (`:399`, `:450`, `:456` — Current state §3), per **Table B**. Nothing else in this file changes: the WP-146 preserve arm, `dropOwnedEntry`, the `readlinkSync` comparison and every notice string stay byte-identical. **`recordOnce` itself is NOT modified and is NOT replaced by an upsert** — the owner declined a backfill (2026-08-01). |
| modify | src/core/manifest.js | **D2** — `reverseSymlink` implements **Table A**; **D3** — `ENTRY_FIELD_TYPES.symlink` becomes `{ target: 'string' }` (`:809`); **D4** — the entry-shape doc comment at `:17` gains the optional field per **Table B**. No other function, no other kind, and **no change to `reverse()`'s symlink arm at `:718-729`** — `reverseSymlink` keeps its five-parameter signature. **D3 is THIS WP's edit, not WP-147's** — see "Sequencing" below. |
| modify | tests/unit/manifest.test.js | **T1–T4 and T6** — the exact set in the Test index below. **T6 is a required repair, not a new feature**: `manifest.test.js:297-312`'s deferred-member guard becomes vacuous under this WP unless its entry gains a `target`. |
| modify | tests/unit/shared-skill-links.test.js | **T5** — this is **an edit to three shipped assertions**, not a new test. `:52-55`, `:191-194` and `:337-340` each `assert.deepEqual(..., [{ kind: 'symlink', path: linkPath }])`; `deepEqual` **fails on the extra `target` key** (executed at `e7c845e`: `ERR_ASSERTION`). **Take the expected object for each from Table T** — including the dry-run row, whose test has no `coreSkill` in scope. **The four WP-146 sync-side tests at `:345`, `:371`, `:387` and `:405` are fenced — they must pass byte-unmodified.** |

Not deliverables, deliberately: `src/cli/uninstall.js`, every other reverser,
`docs/GLOSSARY.md`, `docs/adr/**`, `tests/golden/**`.

### Sequencing with WP-147 — why `depends_on: [WP-144, WP-147]`

`WP-147-managed-block-separator-roundtrip` (`Ready`) also edits
`src/core/manifest.js`, and the two overlap in two places:

1. **`ENTRY_FIELD_TYPES` (`:806-817`).** WP-147 lists adding `sepBefore`/`sepAfter`
   to the `managed-block` cell as an *optional, additive* nicety; **this WP
   REQUIRES** the `symlink` cell change (D3). Both edit the same object literal.
2. **Adjacency.** This WP's Current state §2 anchors `:718-729`, immediately above
   the caller block WP-147 pins as `:730-770` (its `openSync` at `:746`, its call
   at `:764`, its close at `:769`). Whichever lands first shifts the other's
   anchors.

**Decision: WP-147 lands first; WP-153 depends on it.** WP-147 is the older,
larger and more delicate of the two (it edits the F30 fd-bound IO region), and
its anchors are the ones that would be most expensive to re-derive; putting it
first means only this spec's anchors need re-checking, not both. Two consequences
the implementer must honour:

- **The `symlink` schema cell is WP-153's edit alone.** WP-147's Deliverables
  offer its `managed-block` addition as optional; nothing in WP-147 may touch the
  `symlink` cell.
- **Every `src/core/manifest.js` line anchor in this spec is stated against
  `e7c845e`, i.e. BEFORE WP-147 lands.** WP-147 grows `reverseManagedBlock`'s
  strip region by ~8 lines, so anchors at or after `:205` shift downward. The
  implementer must re-locate `ENTRY_FIELD_TYPES`, `validateEntry` and the symlink
  arm **by content, not by line number**, and the architect re-anchors this spec
  at the dispatch-time re-verification that follows WP-147's merge
  (`docs/runbooks/codex-review.md`, "Dispatch-time re-verification"). Anchors
  **before** `:205` (`reverseSymlink` `:144-159`, `isSymlink` `:136-142`, the doc
  comment `:17`) are unaffected.

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
| 2 | `typeof T !== 'string' \|\| T === ''` — a **LEGACY** entry | none | `skipped` | `wienerdog: keeping <L> — not the Wienerdog skill link we recorded (replaced, or unverifiable)` | Ownership is **unprovable** — the entry was recorded before this WP and, per the owner ruling, nothing will ever backfill it. Preserve. **This row and its accepted cost are owner-ruled (2026-08-01), not argued from precedent** — see [Legacy-entry policy](#legacy-entry-policy--owner-ruled-transcribed-2026-08-01). |
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
  larger permission than "the link we recorded". (**This prohibition scopes rows
  3–4 only** — but with the owner declining the structural legacy arm, it is now
  effectively total: no row of Table A uses an ancestor-scoped test.)

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

### Table T — the three shipped `deepEqual` assertions T5 must edit (canonical)

**Extracted under ADR-0031's loop circuit-breaker.** Gate rounds 1 and 2 both
landed findings on this same contract family — round 1 that AC3 was unsatisfiable
because these assertions break, round 2 that the branch labels were wrong and one
test lacks the variable the prose told it to use. Two rounds, one family, so the
facts are pulled into one table instead of being patched in prose a third time.

| Assertion | Owning test (`shared-skill-links.test.js`) | Producer site it exercises | Expected object after this WP | Source path, **as named in that test's scope** |
|-----------|--------------------------------------------|----------------------------|-------------------------------|-----------------------------------------------|
| `:52-55` | `:40` *skill symlinked into the target dir with the default seam (POSIX)* | `shared.js:456` — **create** | `[{ kind: 'symlink', path: linkPath, target: coreSkill }]` | `coreSkill` (destructured at `:42`) |
| `:191-194` | `:180` *dry-run records a symlink entry and reports the change without writing* | `shared.js:450` — **dryRun** | `[{ kind: 'symlink', path: linkPath, target: path.join(skillsDir, 'wienerdog-setup') }]` | **none** — `:181` destructures only `{ skillsDir, targetSkillsDir }`. Build it inline from `skillsDir`, which **is** in scope. |
| `:337-340` | `:324` *a pre-existing correct symlink is adopted into the manifest (recorded, reported unchanged)* | `shared.js:399` — **adopt** | `[{ kind: 'symlink', path: linkPath, target: coreSkill }]` | `coreSkill` (destructured at `:326`) |

**Row 2 is the one that bites.** An earlier revision of this spec prescribed
`target: coreSkill` for all three; that variable does not exist in the dry-run
test, and **AC6's line fence forbids editing `:181` to add it**. The inline
`path.join(skillsDir, 'wienerdog-setup')` keeps the whole edit inside `:191-194`
and leaves AC6 intact. (`path` and `skillsDir` are both already in scope; the
literal `'wienerdog-setup'` is the same one `:188` already uses to build
`linkPath`.)

**Branch labels were wrong in the earlier revision** — it named the adopt branch
twice and the create branch never. The mapping above is the corrected one, read
off the tests at `e7c845e`.

#### Mirrored surfaces of Table T

Every surface in this spec that restates any Table T fact, registered so a
future correction updates the table **and** all of them in one pass:

- [ ] Deliverables cell for `tests/unit/shared-skill-links.test.js`
- [ ] The **Test index** row **T5**
- [ ] **AC3** (which assertions may be edited)
- [ ] **AC6** (the line fence over the same ranges)

### Mirrored Surface Checklist

Tables A, B and T are the single place these facts are decided. Every surface in
this spec that restates them is registered here, so one review finding updates
the table **and** all its mirrors in one pass, and any new mirror found in review
is added here on the spot.

In this spec:

- [ ] Deliverables cell for `src/adapters/shared.js` (D1 — the three sites, Table B row `target`)
- [ ] Deliverables cell for `src/core/manifest.js` (D2/D3/D4 — Table A, the schema cell, the doc comment)
- [ ] Deliverables cell for `tests/unit/manifest.test.js` (it mirrors the **Test index** rows T1–T4 and T6)
- [ ] Deliverables cell for `tests/unit/shared-skill-links.test.js` (T5 — Table B **and Table T**)
- [ ] The **Sizing** paragraph (it restates the three-site count)
- [ ] "Exact contracts" — the JSDoc block, the `recordOnce` line, the schema cell
- [ ] Current state §3 (the three producer sites and their branches — Table B)
- [ ] Current state §4 (the schema's optional-field semantics — Table B)
- [ ] Current state §5 (the doc-comment mirror — Table B)
- [ ] Current state §6 (the legacy-preserve resemblance — Table A row 2)
- [ ] Current state §7 (`sameResolvedDir`'s fail-closed direction — Table A row 3)
- [ ] The **Test index** (every row names the Table A row, Table B field or Table T row it drives)
- [ ] Security checklist bullets 1–3 (Table A rows 2, 3 and 4)
- [ ] Acceptance criteria AC1–AC6
- [ ] Verification commands V1–V5
- [ ] Implementation notes §"Legacy entries — what to build" and §"Do not touch the sync side"
- [ ] **(+r2) BOTH copies of the owner-ruling block — the banner under the H1 and
      the `## Legacy-entry policy — owner-ruled (transcribed, 2026-08-01)`
      section.** They quote the same verbatim ruling and both restate **Table A
      row 2**. **This is the exact drift shape this checklist exists to catch**:
      two verbatim copies of an owner's words, unregistered, in a document whose
      other mirrors are all registered. If the ruling is ever restated, corrected
      or re-transcribed, **both** move together or neither does — and a
      transcription that drifts from the owner's actual words is worse than a
      stale line number.
- [ ] **(+r2) Table T's own four mirrors** — registered under Table T itself, in
      §"Mirrored surfaces of Table T", rather than duplicated here.

Out of this spec, registered so a later Table A/B change updates them too —
**none is a deliverable**, and none may be edited by the implementer:

- [ ] `src/adapters/shared.js:400-412` — the WP-146 preserve arm's comment names
      `reverseSymlink`'s target-blindness as the reason it drops the ownership
      entry. After this WP that sentence describes a defect that no longer
      exists. It is **left alone deliberately** (see "Out of scope"); registered
      so a future WP that rewords it knows this table is its source.
- [ ] `docs/specs/done/WP-146-settings-upsert-and-foreign-symlink-preserve.md` —
      the shipped record of the sync-side half. Never edited.

## Legacy-entry policy — owner-ruled (transcribed, 2026-08-01)

> **OWNER-DECIDED IN SESSION — 2026-08-01 (TRANSCRIBED, NOT OWNER-TYPED).**
> Gyula Fehér answered in conversation; this record was written by the
> orchestrator, not by him. It records that the decision was taken — it is
> **not** his signature and must never be treated as one, and **no gate keys on
> it**. Verbatim: *"fine to have installs predating the WP have uninstall leave
> all skill symlinks behind."*

### The question that was put

Every install created **before** this WP has manifest entries shaped
`{kind:'symlink', path}` with no `target`. `reverseSymlink` therefore cannot
prove those links are ours. What should `wienerdog uninstall` do with them?

### The ruling

**Preserve them. Table A row 2 as written: skip, notice, never unlink.** No
structural ownership arm, and no backfill migration. The two alternatives below
were put alongside it and are **declined**; they are kept so the choice stays
legible and so a future WP does not re-propose them as if new.

### The accepted cost, stated plainly

This is the part the owner accepted, so it is stated at full strength rather
than softened:

- On **every install created before this WP**, `wienerdog uninstall` leaves
  **all** `wienerdog-*` skill symlinks behind in the harness skills directory
  (`~/.claude/skills/`, `~/.codex/skills/`) and reports each as skipped.
- Because the core is disposed in the same run, those links are left **dangling**.
- **Nothing ever heals them.** A later `wienerdog sync` does not — see "Why there
  is no migration" below. The user removes them by hand.
- This is a real, bounded departure from CLAUDE.md's *"reversible —
  `wienerdog uninstall` fully undoes it via the install manifest"*, and it is
  accepted deliberately in exchange for the guarantee that uninstall can never
  delete a file it cannot prove it created (ADR-0004, ADR-0019).

### Why there is no migration, and why the spec used to claim there was

`recordOnce` **no-ops when a same-kind+path entry already exists**
(`shared.js:47-52`, quoted in Current state §3). An upgraded install already has
`{kind:'symlink', path}` in its manifest, so adding `target` at the three
producer sites changes nothing for it: `exists === true`, the push is skipped,
and the entry **stays target-less permanently — through one sync, and through a
hundred**.

An earlier revision of this spec asserted the opposite under "Out of scope"
(*"the next `wienerdog sync` re-records the entries … which is the whole
migration"*). **That was false**, and it was found by the Codex leg of gate
round 1. With the owner declining a backfill, the fix is to state the true
behaviour rather than to build the migration: **legacy is permanent**. Every
surface in this spec that implied otherwise has been corrected.

### The two declined alternatives, recorded so they are not re-proposed as new

**(ii) Structural ownership proof for legacy entries — DECLINED.** Row 2 would
have unlinked when all three held: `wienerdog-` basename; `path.dirname(L)`
realpath-equals a harness skills root; `readlink(L)` resolves into the app's own
skills source. This is the shape `reverseCopiedSkill` arm 1 already ships
(`manifest.js:406-412`), and `skillsRoots` is already computed and passed into
the reverse loop. It would have made legacy installs uninstall cleanly. It is a
**weaker** proof than rows 3–4's exact-target equality — it authorises deleting
any `wienerdog-*` link in a harness skills root that points into our skills
source, so a user who deliberately re-pointed one of our links at a *different
one of our own skills* would lose it — and it needs the skills-source directory
plumbed into `reverseSymlink`.

**(iii) Upsert-backfill so "legacy" drains over time — DECLINED.** Replace
`recordOnce` at the three producer sites with an upsert that sets `target` on an
existing entry after verifying the current link, mirroring `recordCopiedSkill`
(`shared.js:54-71`) and `recordSettingsEntry` (`shared.js:90`). It would have
shrunk the blast radius to "installs that uninstall without ever syncing again".
It does not help an install that upgrades and immediately uninstalls, so it was a
mitigation rather than an answer.

**The precedent argument that preceded the ruling, and its correction.** An
earlier revision closed this question by citing `reverseCopiedSkill`'s hash-less
arm as settled house policy. Gate round 1 rejected that reasoning and was right
to: for `copied-skill` a hash-less entry is a **fallback-only edge** (copying
happens only on `EPERM`/`EACCES`, `shared.js:457-460`), while for `symlink` a
target-less entry is the **mainline shape on every pre-WP-153 install**. Same
mechanism, very different cost — which is exactly why it was an owner call. The
owner reached the same answer; the argument did not become sufficient
retroactively.

## Implementation notes & constraints

### Legacy entries — what to build

A target-less entry is **preserved, never deleted** (Table A row 2), by owner
ruling of 2026-08-01. Build exactly that and nothing more. Three things follow,
and each is a way the implementer could accidentally exceed the ruling:

1. **Legacy is permanent — do not "helpfully" fix it.** `recordOnce` stays as it
   is; do not turn it into an upsert, do not add a one-off backfill, do not write
   a migration step into `sync`. An install that predates this WP keeps
   target-less symlink entries forever, its `uninstall` leaves **all** its
   `wienerdog-*` skill links behind (dangling, once the core is disposed), and
   nothing heals that. The owner accepted this cost explicitly; see
   [Legacy-entry policy](#legacy-entry-policy--owner-ruled-transcribed-2026-08-01).
2. **Do not infer ownership from where the link points** (e.g. "it resolves
   inside the core, so it is ours"). That is the structural arm the owner
   declined, and it is also the ancestor-scoped test Table A rows 3–4 forbid.
3. **Do not soften the notice.** Row 2's `keeping …` line is what makes the
   left-behind links visible to a user reading uninstall's output; it is the only
   signal they get.

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
| T5 | `tests/unit/shared-skill-links.test.js` | **An EDIT to three shipped assertions, not a new test.** All three facts — which test, which producer branch, which expected object, and what the source path is called *in that test's scope* — are in **Table T**. Do not derive any of them from prose. | Table B, Table T |
| T6 | `tests/unit/manifest.test.js` | **Vacuity repair, required.** `:297-312` (`global guard (iii): a {kind:symlink} whose path resolves to a deferred member is never unlinked`) records `{kind:'symlink', path: link}` with **no** `target`, where `link` points at `paths.manifest`. After this WP that is also a Table A row-2 legacy entry, so it would be preserved **for the wrong reason** and the deferred-member guard it exists to prove would stop being exercised — a regressed guard would stay green. Give the recorded entry `target: paths.manifest`, which makes `sameResolvedDir(L, T)` true → Table A row 4 → only the deferred-member guard stands between the entry and `fs.unlinkSync`. Assert the same outcomes as today (`:308-311`). | vacuity of the shipped guard |

**Prove T1 in both directions** (`docs/runbooks/codex-review.md`): run it against
the untouched `reverseSymlink` (expect **red** — the user's link is unlinked) and
against the finished one (expect **green**). A test that is only ever green after
the change does not show the defect was real.

**Prove T6 the same way**, and it is the more important of the two: with T6's
`target` in place, temporarily remove the deferred-member guard
(`manifest.js:578-586`'s `resolvesTo(entry.path, paths.manifest)` arm) and
confirm T6 goes **red**. Without that run, T6 is a test that cannot tell you
whether the guard exists.

**T3 is final** (the owner ruling settled its shape on 2026-08-01). It asserts
preservation in **both** legacy sub-cases — `L` pointing at `T`, and `L` pointing
elsewhere — because under the ruling those are treated identically. **Do not add
a test asserting that a legacy entry acquires `target` after a sync**: it never
does, by design (Current state §3).

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
- [ ] **AC2** — T2, T3, T4, T5 and T6 all pass (Table A rows 2 and 4; Table B;
      the vacuity repair).
- [ ] **AC3** — **Narrowed, because D1 makes three shipped assertions fail by
      construction.** Every **behavioural** test in
      `tests/unit/manifest.test.js` and `tests/unit/shared-skill-links.test.js`
      passes with its assertions unchanged. The **only** permitted edits to
      shipped tests are the four named in the Test index: the three
      whole-object `deepEqual` expectations **listed in Table T** (T5 — they
      compare the entry object, so the new key breaks them), and the recorded
      entry in `manifest.test.js:297-312` (T6). **The four WP-146 sync-side
      tests at `shared-skill-links.test.js:345`, `:371`, `:387` and `:405` must
      pass BYTE-UNMODIFIED** — they are the fence, and any diff touching them is
      a scope violation.
- [ ] **AC4** — `grep -c "kind: 'symlink', path: linkPath, target" src/adapters/shared.js`
      is `3`, and `grep -c "kind: 'symlink', path: linkPath }" src/adapters/shared.js`
      is `0` (no producer site left target-less). The call is still
      `recordOnce` — the owner declined the upsert.
- [ ] **AC5** — `npm test` and `npm run lint` are green.
- [ ] **AC6** — `git diff -- tests/unit/shared-skill-links.test.js` touches
      **only** lines inside the three **Table T** assertion ranges (`:52-55`,
      `:191-194`, `:337-340`). In particular `:181` is **not** touched — the
      dry-run test's destructuring stays as it is, and its `target` is built
      inline per Table T row 2. Paste the diff.

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

# V3 — the schema cell carries the Table B literal. Match the LITERAL, not the
# key: `grep -n "symlink: {"` already returns one line on the untouched tree
# (`809:  symlink: {},`), so it can never fail and proves nothing.
grep -n "symlink: { target: 'string' }," src/core/manifest.js

# V4 — the reverser consults the recorded target (Table A rows 3-4). Expect a
# `sameResolvedDir` and a `readlinkSync` inside the reverseSymlink body.
sed -n '/^function reverseSymlink/,/^}/p' src/core/manifest.js

# V5 — full gates.
npm test
npm run lint
```

**Untouched-tree baselines at `e7c845e`, so a red gate is legible.** V2 prints
`0` then `3` (inverted from the finished state). **V3 prints nothing and exits
1** — verified; the loose `grep -n "symlink: {"` form it replaced printed
`809:  symlink: {},` and was therefore green before any work. V4 prints the
nine-line pre-change body with no `sameResolvedDir` and no `readlinkSync`.

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
- Any change to `docs/GLOSSARY.md` or any ADR.
- **`src/core/manifest.js`'s `managed-block` schema cell and `reverseManagedBlock`**
  — those are `WP-147`'s, which lands first (see "Sequencing with WP-147").

- **Any backfill of `target` onto existing manifest entries** — no upsert, no
  migration step in `sync`, no one-off repair command. **Owner-declined
  2026-08-01.** Legacy entries stay target-less permanently.

**One bullet was REWORDED on 2026-08-01, because it stated a falsehood.** It
read: *"A migration that back-fills `target` onto existing manifests. The next
`wienerdog sync` re-records the entries through the three producer sites, which
is the whole migration."* The first sentence was right (a migration is out of
scope); **the second was false** — `recordOnce` no-ops on an existing entry
(`shared.js:47-52`; Current state §3), so no number of syncs ever backfills
anything. Found by the Codex leg of gate round 1. The bullet above keeps the
scope exclusion and drops the false justification: the reason a migration is out
of scope is that the owner declined one, not that `sync` already does it.

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
> now legitimately discharged**, one item per authority:
>
> - **(a) schema coordination with WP-144 — closed on evidence, by the
>   architect.** WP-144 is `Done`; the cell is `ENTRY_FIELD_TYPES.symlink` at
>   `manifest.js:809` and the change is one line. Nothing here needed a decision.
> - **(b) legacy-entry policy — closed by the OWNER, 2026-08-01.** See the
>   transcribed ruling at the head of this spec and
>   [Legacy-entry policy](#legacy-entry-policy--owner-ruled-transcribed-2026-08-01).
>
> **How this went wrong first, recorded so the pattern is visible.** An earlier
> revision on 2026-08-01 closed **(b)** by argument — citing
> `reverseCopiedSkill`'s hash-less arm as settled house policy — and moved itself
> to `Ready`. Gate round 1 rejected it on two grounds, both correct: the
> precedent covers a *fallback-only edge* while this is the *mainline* path, so
> it escalated an accepted cost rather than inheriting one; and the offered
> reassurance *"reverting is one line"* inverted an owner **opt-in** into an
> owner **opt-out**, which is the wrong default for a question about deleting
> user files. The spec went back to `Draft`, the question went to Gyula, and he
> ruled. **The answer happened to match the argument; that is not what makes it
> valid.**
>
> **2026-08-01 — gate round 1 corrections also folded in.** Codex [medium]: the
> claimed sync-heals-legacy migration does not exist (`recordOnce` no-ops) — with
> a backfill declined, the spec now states the true permanent-legacy behaviour
> instead. Reviewer: AC3 was unsatisfiable (three shipped `deepEqual` assertions
> break on the new key — T5 now owns that edit, with the four WP-146 sync-side
> tests fenced); V3 could not fail (now greps the Table B literal, red-verified
> on the untouched tree); `manifest.test.js:297-312`'s deferred-member guard
> would have gone vacuous (T6 repairs it); `depends_on` gains `WP-147` for the
> `manifest.js` collision; and three presentation defects were fixed (the
> three-arm count in Current state §6, the synthetic brace in §2, the
> `shared.js:457-460` anchor).
>
> **2026-08-01 — gate round 2 corrections (verdict: REQUEST CHANGES, narrow).**
>
> - **(b) T5 was unimplementable as written.** It prescribed `target: coreSkill`
>   for all three assertions, but the dry-run test destructures only
>   `{ skillsDir, targetSkillsDir }` at `:181` — there is no `coreSkill` — and
>   **AC6's line fence forbids editing `:181` to add one**. Fixed by building that
>   row's target inline from `skillsDir`, which is in scope, keeping the whole
>   edit inside `:191-194` and AC6 intact.
> - **(b) T5's branch labels were wrong** — it named the *adopt* branch twice and
>   the *create* branch never. Corrected mapping, read off the tests: `:52-55` ↔
>   `shared.js:456` (create), `:191-194` ↔ `:450` (dryRun), `:337-340` ↔ `:399`
>   (adopt).
> - **ADR-0031 extraction, not a third prose patch.** Rounds 1 and 2 both landed
>   findings on this same family (round 1: AC3 unsatisfiable because these
>   assertions break; round 2: wrong labels plus a missing variable), which is the
>   two-rounds-same-family trigger. The facts are now in **Table T** — one row per
>   assertion carrying its owning test, producer site, expected object **and the
>   source path's name in that test's scope** — with its four mirrors (Deliverables
>   cell, T5 row, AC3, AC6) registered under it.
> - **BOTH copies of the owner-ruling block are now registered** in the Mirrored
>   Surface Checklist under Table A row 2. They were duplicated verbatim and
>   unregistered — the exact drift shape the checklist exists to prevent, and
>   worse than a stale line number, because what would drift is a transcription of
>   the owner's own words.
> - **(adv, DECLINED a second time — now settled with bytes.)** `validateEntry`'s
>   range is `:828-849`, not `:828-850`. `sed -n '848,851p' src/core/manifest.js | od -c`
>   at `e7c845e` shows the closing `}` on `:849` and an empty `:850`; the byte dump
>   is pasted in Current state §4 so the point cannot be re-raised without
>   re-running one command. Round 1 raised it, round 2 repeated it; this is the
>   evidence that ends it.
> - **(nit, taken)** The ruling section heading now reads
>   *"owner-ruled (transcribed, 2026-08-01)"*, so the heading carries the
>   qualification its first line makes. Six in-document anchors updated with it.
