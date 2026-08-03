---
id: WP-symlink-authorship-identity
title: Record symlink authorship and lstat identity at forward time so uninstall unlinks only links it can prove it created
status: Ready
model: opus
size: S
depends_on: [WP-153, WP-managed-block-insertion-anchor]
adrs: [ADR-0004, ADR-0019, ADR-0031, ADR-0036]
epic: audit-a13
---

# WP-symlink-authorship-identity: forward-time authorship evidence for the symlink reverser

> **OWNER-DECIDED IN SESSION — 2026-08-02 (TRANSCRIBED, NOT OWNER-TYPED).**
> Gyula Fehér answered in conversation; this record was written by the
> orchestrator, not by him. It records that the decision was taken — it is
> **not** his signature and must never be treated as one, and **no gate keys on
> it**. Verbatim, all three of his answers as given:
> *"1) ship as specified 2) ship 4a+4b 3) draft the ADR"*.
>
> **Answer 2 — "ship 4a+4b" — is this spec's ruling: disposition (i).**
> Ship both reverser rows. The owner accepts all five priced completeness
> costs — 4a's adopt-leftover, 4b's durability drift, the schema-valid
> wrong-pair row, the partial-pair leftover and D5's schema rejection — at the
> sizes the ledger measures. Dispositions (ii), (iii), (iv) and (v) are
> **declined**. (Answer 1 rules on `WP-managed-block-insertion-anchor`;
> answer 3 authorizes **ADR-0038**, which codifies the narrowing rule this
> spec's Table N states and does **not** gate this spec — see that ADR's
> "Relationship to the two specs".)
>
> **This ruling was the only thing gating this spec**, so its status moves
> `Draft` → `Ready` in the same commit. The non-selected dispositions are kept
> below as dated records, not deleted — the ledger is the evidence the ruling was
> made against, and a future reader must be able to see what was declined.
>
> **This is Part B of a two-part chain.** It was drafted as one half of a
> consolidated WP that the 2026-08-02 wave routed under the slug
> **`WP-forward-time-ownership-provenance`**; that document was split at its own
> pre-cut line after Codex design-gate round 3, and **deleted**. The split is
> recorded in
> `docs/specs/logbook/2026-08-02-forward-time-ownership-provenance-split.md`.
>
> **`docs/specs/done/WP-153-target-aware-symlink-reverser.md` routes its residual
> to the retired slug** in four places (`:514`, `:868`, `:1274`, `:1286`).
> **Those are inert historical records in a `Done` spec and are deliberately not
> edited** — the ROADMAP-retirement precedent (*"historical mentions inside
> `done/` spec bodies … are inert records — deliberately NOT edited"*). **This
> spec is where that routing lands**, and the logbook entry is the bridge from
> the retired name to these two files. WP-153's verbatim flag:
>
> *"WP-153 leaves a namespace-bounded symlink-ownership residual — a
> `wienerdog-*`-named link under a skills root resolving to our source can be
> removed even if the user made it — strictly stronger than shipped 0.12.0; full
> close routed to `WP-forward-time-ownership-provenance`."*
>
> **Part A is `WP-managed-block-insertion-anchor`** and this spec `depends_on` it
> — not for design reasons (the two mechanisms are independent) but because both
> edit `src/core/manifest.js` and `src/adapters/shared.js`, and three hunks are
> **shared and additive**: the module doc comment, the `@typedef ManifestEntry`,
> and the `shared.js:5` import line. Part A writes those hunks' `a` form; this
> spec **extends** them. Running the two in parallel is a merge collision.
>
> **What this spec claims, stated exactly — it is NOT an unqualified "full
> close".** Codex round 3 finding 1 was right that the consolidated draft's
> header overclaimed, and the overclaim was worst on this half. The honest scope:
>
> - **Narrowed:** the two honest-use cases WP-153 named. A user's **same-source
>   replacement** (they deleted our link and made their own) and a **pre-existing
>   exact-target adoption** (they made it before we ever synced) are no longer
>   deleted.
> - **Retained and declared:** where a stable `(dev, ino)` cannot be recorded at
>   creation time, the entry keeps **base behaviour** — WP-153's residual persists
>   on that platform (**R3**). Where the pair drifts or is **recycled**, the
>   mechanism mis-decides in both directions (**R4**). And the identity check and
>   the unlink are **two syscalls**, so a replacement landing between them is
>   deleted (**R7**).
>
> So: *this WP narrows the two honest-use residuals subject to R3, R4 and R7.*
> Nothing in this document may say "full close" without that qualifier.

## Context (read this, nothing else)

Wienerdog is an install-time tool that writes configuration files onto a user's
machine and records every artifact it creates in an **install manifest**
(`~/.wienerdog/install-manifest.json`). `wienerdog uninstall` replays that
manifest in reverse to remove exactly what was created and nothing else.

**IRON RULE (ADR-0004): Wienerdog is just files.** **ADR-0019** states the
reverse-side half: uninstall recursively removes the core's
machine-generated-mechanics subdirectories and then the core dir itself, so that
*"an unmodified install thus leaves **only the vault**"* — its **sole documented
exception** is a user-modified `config.yaml`.

> **A misattribution corrected here, because it has propagated.** Four specs in
> this repo — including earlier revisions of this one — attribute the sentence
> *"anything it cannot prove it created is preserved"* to ADR-0019. **It is not in
> ADR-0019.** Measured: the word *"prove"* appears **zero** times in
> `docs/adr/0019-uninstall-disposes-core-mechanics.md`, and no ADR in `docs/adr/`
> contains the phrase *"cannot prove"*. It is an architect gloss. The principle is
> real and this spec relies on it — it is the shape of every shipped reverser from
> WP-144 through WP-153 — but it is a **design convention**, not ratified ADR
> text. That matters here specifically: the owner ledger below **cannot be argued
> away by citing it as policy**. The `Done` specs carrying the misattribution are
> **not edited**; this correction lives here.

The artifact this WP is about is the **skill symlink**: for each core skill named
`wienerdog-*`, `applySkillLinks` (`src/adapters/shared.js`) creates
`<harness skills dir>/wienerdog-<name>` pointing at
`<core skills source>/wienerdog-<name>`, and records
`{kind:'symlink', path, target}` in the manifest. On uninstall, `reverseSymlink`
in `src/core/manifest.js` unlinks it only after proving it is still the link we
recorded.

**WP-153 shipped the target half of that proof and declared what it could not
do.** Its reverser refuses to unlink unless the link still resolves to the
recorded source **and** sits in the `wienerdog-` namespace directly under a
harness skills root. But a target can be reproduced by the user, so target
equality is not authorship. WP-153 wrote the residual out and routed the fix
here:

> *"target-equality is standing in for authorship, and it cannot distinguish 'our
> link' from 'a user link that happens to resolve to the same place'. … Closing
> it needs **authorship** evidence that target-equality cannot supply: record the
> link's `lstat` **device + inode** at forward creation time, and require
> *identity AND target* to match before unlink, failing closed where stable
> identity cannot be established (a re-created link gets a new inode; an adopted
> pre-existing link never had ours recorded)."*

**This WP adds that evidence**: at forward-creation time it records the link's
`lstat` device and inode, and — because inode identity alone cannot distinguish
"the link we made" from "the link that was already there when we first saw it" —
an explicit **`origin`** bit saying whether we **created** the link or merely
**adopted** one already on disk. The reverser must clear both before unlinking,
and **fails closed** — preserves — on any doubt.

**Three constraints bound the design, and every contract table below is written
against them:**

- **Backward compatibility is mandatory.** Entries written by older versions lack
  the new fields. Missing provenance ⇒ **exactly the shipped 0.12.0 behaviour**,
  never stricter deletion. `recordOnce` no-ops on an existing entry
  (`shared.js:47-52`), so an upgraded install keeps its old entries
  **permanently** — WP-153's owner ruling (2026-08-01: *"fine to have installs
  predating the WP have uninstall leave all skill symlinks behind"*) declined a
  backfill, and none is built here either. If missing provenance made uninstall
  *stricter*, every pre-existing install would stop removing its own links and
  the ADR-0019 reversibility contract would break on upgrade.
- **The manifest is untrusted input.** WP-153's gate round 4 established that a
  forged `(path, target)` pair was **delete authority over any symlink the user
  owned** under a harness skills root, and closed it with the structural `OWNED`
  gate. The new fields carry the same posture, stated as a theorem this WP must
  prove: **a forged provenance field may only ever NARROW deletion, never widen
  it** (Table N, and the exhaustive Table S).
- **A declared residual needs a pinning test.** Every row of Table R is pinned by
  a named test, and the four identity behaviours are made deterministic by a
  test-only seam because `(dev, ino)` is a *filesystem* property that cannot be
  produced on demand.

**Terminology note.** `docs/GLOSSARY.md` defines **provenance** as *"mandatory
frontmatter on auto-written notes"* — a **vault** concept, unrelated to this WP.
The operative term here is **link identity**, and it is not a glossary term.
**Do not edit `docs/GLOSSARY.md`** — it is not a deliverable.

## Current state

**Re-verification record.** Every executable claim in this section was run
first-hand against the working tree at commit **`8515eb1`** on **2026-08-03**,
in a **dispatch-time reconciliation pass** run after this spec's sibling merged.

> **Anchor history, and why the numbers below are the third set.** The claims
> were first measured at `18bc909` (`src/` byte-identical to `0f9ee08`). PR #151
> then rewrote `reverseSymlink`'s row 3 **line-count-neutrally**, so no anchor
> moved and only the row-3 *content* changed. **`WP-managed-block-insertion-anchor`
> then merged (PR #154, `336e67b`) and moved everything**:
> `src/core/manifest.js` went **1062 → 1122 lines**, `reverseSymlink`'s definition
> moved `:168 → :216`, and the symlink producer sites moved
> `:434/:485/:491 → :439/:490/:496`.
>
> **The dispatch gate caught this, which is what it is for.** Every anchor below
> was re-derived by locating its region **by content** at `8515eb1` — not by
> arithmetic on the old numbers — and the reconciliation record is in this
> spec's provenance block.
>
> **Nothing this spec designs was disturbed.** `reverseSymlink`'s function body is
> **byte-identical** at `9188a1c`, `17a2bc5` and `8515eb1` (verified by extracting
> and `cmp`-ing the function at all three), so Part A moved this spec's subject
> without touching it. What Part A *did* change is the three **shared hunks**,
> which are now half-shipped — see §5 and §6.

**Nothing was found stale.** The whole design was
additionally **implemented as a throwaway prototype and measured**, including an
exhaustive twenty-cell sweep of every schema-accepted entry shape (Table S).
The prototype was discarded.

### 1. `reverseSymlink` — `src/core/manifest.js:216-265` (JSDoc at `:207-215`)

Byte-identical at `8515eb1`, the five rows as they stand **after
`WP-symlink-lexical-fallback-removal` (PR #151, `91b12e2`)** — and **unchanged by
`WP-managed-block-insertion-anchor` (PR #154), which moved this function without
editing a byte of it**:

```js
function reverseSymlink(entry, dryRun, removed, skipped, removedSet, skillsRoots) {
  const L = entry.path;
  const T = entry.target;
  // Row 1: not a symlink (real file/dir, or already gone) — never ours to delete.
  if (!isSymlink(L)) {
    skipped.push(L);
    return;
  }
  // Row 2: LEGACY (target-less) entry — ownership is unprovable, preserve
  // unconditionally (owner ruling 2026-08-01). No backfill exists or ever will.
  if (typeof T !== 'string' || T === '') {
    process.stderr.write(
      `wienerdog: keeping ${L} — not the Wienerdog skill link we recorded (replaced, or unverifiable)\n`
    );
    skipped.push(L);
    return;
  }
  // Row 3: the link must PROVE it still resolves to the source we recorded.
  // sameResolvedDir is realpath-based (semantic, follows the link) and is itself
  // fail-closed — an unresolvable side returns false, which lands HERE, in preserve.
  // There is deliberately NO second, link-text comparison: WP-153 shipped one, and
  // WP-symlink-lexical-fallback-removal dropped it because raw-text equality is the
  // weaker proof and the manifest is UNTRUSTED — a recorded target may narrow this
  // delete, never authorize one the semantic proof refuses (e.g. a relative recorded
  // target, which Wienerdog never writes, matched the link text while realpath did
  // not). Strictly narrowing: every input this now preserves was previously deleted.
  if (!sameResolvedDir(L, T)) {
    process.stderr.write(
      `wienerdog: keeping ${L} — not the Wienerdog skill link we recorded (replaced, or unverifiable)\n`
    );
    skipped.push(L);
    return;
  }
  // Row 4: a target match is NOT delete authority — the manifest is untrusted, so
  // an attacker can forge a (path, target) pair. Require the STRUCTURAL ownership
  // proof reverseCopiedSkill uses: wienerdog-* basename AND parent realpath-equal
  // to a harness skills root.
  const parentIsRoot = skillsRoots.some((root) => sameResolvedDir(path.dirname(L), root));
  if (!path.basename(L).startsWith('wienerdog-') || !parentIsRoot) {
    process.stderr.write(
      `wienerdog: keeping ${L} — not the Wienerdog skill link we recorded (replaced, or unverifiable)\n`
    );
    skipped.push(L);
    return;
  }
  // Row 5: OWNED, in-namespace, and provably resolves to our recorded source.
  if (!dryRun) fs.unlinkSync(L);
  removedSet.add(L);
  removed.push(L);
}
```

Rows 2, 3 and 4 share one stderr string. Row 5 is the only row that deletes, and
it deletes on *target equality*, which a user's own link can satisfy — **the
residual this WP narrows**.

> **Row 3 changed under this spec on 2026-08-02 and the change is folded in
> here.** `WP-symlink-lexical-fallback-removal` (PR #151, `91b12e2`) dropped the
> `fs.readlinkSync(L) === T` lexical fallback, leaving `sameResolvedDir` as the
> sole proof. Every reference in this spec has been re-verified against `8515eb1`
> and moved with it: this quote, Table A2 row 3, Table U, the Implementation-notes
> bullet, V4 and Out of scope. **The change was strictly narrowing** — its own
> **shipped code comment** (`src/core/manifest.js:234-241`) says *"Strictly
> narrowing: every input this now preserves was previously deleted"* — its commit
> message carries the shorter *"every input now preserved was previously
> deleted"* —
> so it touches nothing this WP measures. **Suite at `8515eb1`:
> `1913 / 1904 / 0`** — it was `1903 / 1894 / 0` before
> `WP-managed-block-insertion-anchor` added its eleven test rows.

`isSymlink` (`manifest.js:199-205`) is `fs.lstatSync(p).isSymbolicLink()` inside
a `try`, returning `false` on any throw. `sameResolvedDir`
(`manifest.js:512-518`) is `realpathSync(a) === realpathSync(b)` inside a `try`,
returning `false` on any throw — fail-closed by construction.

### 2. The single call site — `src/core/manifest.js:877-888`

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
        reverseSymlink(entry, dryRun, removed, skipped, removedSet, skillsRoots);
      }
```

`skillsRoots` is built once at `manifest.js:680` as
`[<claudeDir>/skills, <codexDir>/skills]`.

**`grep -rn "reverseSymlink" src/` at `8515eb1` returns exactly FIVE lines**,
measured:

```text
src/core/manifest.js:216   the definition
src/core/manifest.js:878   the comment above the call
src/core/manifest.js:888   the ONE production call
src/core/manifest.js:1122  module.exports  ← WP-153's blessed implementer deviation
src/adapters/shared.js:446 one prose mention in a comment
```

**There is no second reverser and no second production call site.**

> **A stale claim inherited from WP-153, corrected here.** WP-153's own Current
> state says this grep *"returns exactly four lines … and one prose mention in
> `shared.js:406`"*. Both halves went stale **after WP-153 shipped**: its PR
> added `reverseSymlink` to `module.exports` (a deviation its 2026-08-02
> double-gate note formally blessed — *"`reverseSymlink` added to
> `module.exports` … forced by the unreachable-through-`reverse()` case"*), which
> is the fifth line; and the `shared.js` prose mention has moved from `:406` to
> `:446` (it was `:441` until PR #154 moved it). `docs/specs/done/WP-153-…` is
> **not edited** — a `Done` spec describes
> the code it shipped at the moment it was written — but this spec must not
> inherit its arithmetic, because **V5 asserts a count**. The export is what
> makes B-T7 and B-T8's direct unit calls possible.

`grep -c "reverseSymlink(" src/core/manifest.js` (with the parenthesis, one file)
is **2** — the definition and the one call. V5 asserts that number.

### 3. The three producer sites — `src/adapters/shared.js`

`grep -n "kind: 'symlink'" src/adapters/shared.js` at `8515eb1` returns exactly
three lines, all inside `applySkillLinks`'s `for (const name of names)` loop
whose first two lines (`:421-422`) are
`const target = path.join(skillsDir, name);` /
`const linkPath = path.join(targetSkillsDir, name);`:

```text
439:        recordOnce(manifest, { kind: 'symlink', path: linkPath, target });
490:      recordOnce(manifest, { kind: 'symlink', path: linkPath, target });
496:        recordOnce(manifest, { kind: 'symlink', path: linkPath, target });
```

| site | branch | reached when |
|------|--------|--------------|
| `:439` | **adopt** | a symlink already sits at `linkPath` and `fs.readlinkSync(linkPath) === target`; reported `unchanged` |
| `:490` | **dryRun** | nothing at `linkPath` and `dryRun` is true; nothing is written |
| `:496` | **create** | nothing at `linkPath`; `symlink(target, linkPath)` at `:495` has just succeeded |

The `else` of `:439` is WP-146's preserve arm (`:440-452`): a `wienerdog-*`
symlink whose `readlinkSync` is **not** `target` is left untouched, records no
entry, and calls `dropOwnedEntry(manifest, 'symlink', linkPath)`. **Not changed
by this WP.** The `EPERM`/`EACCES` fallback below `:496` copies the directory and
records a `copied-skill` entry — **also not changed.**

**`recordOnce` NO-OPS on an existing entry** (`shared.js:47-52`):

```js
function recordOnce(manifest, entry) {
  if (!manifest) return;
  if (!Array.isArray(manifest.entries)) manifest.entries = [];
  const exists = manifest.entries.some((e) => e.kind === entry.kind && e.path === entry.path);
  if (!exists) manifest.entries.push(entry);   // ← an EXISTING entry is left exactly as it was
}
```

So adding fields at these sites **does not migrate an existing install**, and an
ordinary re-sync of our own link never re-records it — the entry keeps the
`origin` and identity it was created with. That is load-bearing for Table S and
for the owner ledger's row 4a.

**A dry-run manifest is never persisted** — `src/cli/sync.js:340` is
`if (!dryRun) manifestMod.save(paths, manifest);` (verified at `8515eb1`, unmoved). The
`:490` entry is a report, and `uninstall` never sees it.

### 4. The entry schema — `src/core/manifest.js:965-1013`

```js
const ENTRY_FIELD_TYPES = {
  file: { hash: 'string' },
  dir: {},
  symlink: { target: 'string' },
  …
  'managed-block': { createdFile: 'boolean' },
  …
};
```

`validateEntry` (`:992-1013`) rejects an unknown `kind` and a missing/empty/
non-string `path`; for every **listed** field it enforces the type **only when
the value is not `undefined`**, and extra keys are ignored (forward-compat).
`reverse()` runs it **first**, before kind dispatch (`:718-724`), and a rejected
entry is `skipped` with a notice — which, **for a symlink, means the link is
preserved**. That is the safe direction, and it is why this WP type-gates its
three fields while Part A deliberately does not type-gate `anchorBefore` (for a
managed block a rejected entry leaves the block installed).

### 5. The module doc comment — `src/core/manifest.js:17-29` and `:48-50`

Two in-code mirrors of the entry shape. **Both are now HALF-SHIPPED**: Part A's
`D6a` landed with PR #154, so `anchorBefore?` is already there and this WP
**extends** the hunks rather than writing them fresh. The shipped bytes at
`8515eb1`:

```text
 *   {kind:'symlink', path, target?}                 — a symlink we created;
 *                                                     `target` is the source it
 *                                                     must still resolve to
 *                                                     (absent on legacy entries)
```

```text
 * @typedef {{kind: string, path: string, hash?: string, createdFile?: boolean,
 *            commands?: string[], unload?: string[], sepBefore?: string,
 *            sepAfter?: string, anchorBefore?: string}} ManifestEntry
```

**`anchorBefore?` is SHIPPED — Part A's `D6a` landed in PR #154**, and the
`managed-block` shape in the same comment block (`:21-29`) now documents it too.
This spec **extends** these two hunks with `origin?`, `dev?` and `ino?` on the
**`symlink`** shape; it does not rewrite them, and **`D6b` must not drop
`anchorBefore`** — V8 asserts all four fields together for exactly that reason.

### 6. The adapters→core import direction, and what Part A leaves

`src/adapters/shared.js:5` reads, **as shipped at `8515eb1`**:

```js
const { hashDir, insertionAnchor } = require('../core/manifest');
```

Part A's `D7a` has landed. This spec's **`D7b` extends that same line** with
`linkIdentity` — it does not rewrite it, and dropping `insertionAnchor` would
break the merged Part A. V7 asserts all three names together. Adapters may import from core; core
may never import from adapters.

### 7. `reverseSchedulerEntry`'s options-seam precedent — `src/core/manifest.js:447-449`

```text
 *   once in reverse(); defaults keep the exported function directly callable.
 */
function reverseSchedulerEntry(entry, dryRun, removed, skipped, removedSet, opts = {}) {
```

This is the in-tree precedent this WP copies for its identity seam: a trailing
`opts = {}` whose default preserves production behaviour exactly.

### 8. `fs.lstatSync(link, { bigint: true })` — measured at `18bc909`, re-run at `8515eb1`

```text
identity of a fresh symlink:        {"dev":"16777231","ino":"273462079"}
identity after delete+recreate:     {"dev":"16777231","ino":"273462080"}   ← CHANGED
identity of a plain file:           null   (isSymbolicLink() is false)
identity of a missing path:         null   (lstat throws)
bigint lstat ino type:              bigint
```

The inode changes on delete-and-recreate. That is the whole mechanism for
honest-use case 1. **`bigint: true` is mandatory** — a 64-bit inode exceeds
`Number.MAX_SAFE_INTEGER` and the plain form loses precision silently; `BigInt`
is not JSON-serializable, so the manifest stores **decimal strings**.

### 9. The three shipped assertions this WP flips — measured, not predicted

`npm test` at **`8515eb1`** unmodified: **`tests 1913 / pass 1904 / fail 0`**.
(It was `1901 / 1892 / 0` when this section was first written at `18bc909`, and
`1903 / 1894 / 0` at `17a2bc5`; Part A's eleven test rows account for the last
step. **1913 / 1904 / 0 is this WP's baseline.**) With this WP's design alone
applied, **exactly three** assertions flip, all three `deepEqual`s in
`tests/unit/shared-skill-links.test.js`, all three in Table F.

**Part A's flip has already landed and must not be re-counted**: WP-147's T9 in
`tests/unit/manifest.test.js` now reads `assert.equal(forged, 'foo\n\n', …)` in
`main`. It is **not** one of this WP's three; an implementer who sees it already
flipped is seeing Part A's shipped work.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file itself (the status flip)
     and package-lock.json. Everything else must be listed. -->

**Sizing.** One primitive (~12 lines), one default parameter and two rows in one
reverser (~20 lines), one schema cell, three doc-comment extensions in
`manifest.js` (module doc, `@typedef`, and `reverseSymlink`'s own JSDoc); one import extension and three call sites in `shared.js`; two test
files extended, of which three shipped assertions are edited, across eight test
rows. **S** — and it is the smaller half of the split. It is not split further:
recording the fields without consuming them ships dead data, and consuming fields
nothing records ships a branch no install reaches.

| Action | Path | Notes |
|--------|------|-------|
| modify | src/core/manifest.js | **D3** — add `linkIdentity()` beside Part A's primitives and export it. **D4** — `reverseSymlink` gains a 7th parameter `opts = {}` (the identity seam — Exact contracts) and rows **4a** and **4b** per **Table A2**, between the existing rows 4 and 5; rows 1–5 are otherwise byte-identical and `reverse()`'s call site is **not** changed. **D5** — `ENTRY_FIELD_TYPES.symlink` becomes `{ target: 'string', origin: 'string', dev: 'string', ino: 'string' }`; **no other cell changes**, and in particular `managed-block` must not gain `anchorBefore` (Part A's Table P forbids it). **D6b** — the module doc comment and `@typedef ManifestEntry` gain `origin?`, `dev?`, `ino?` per **Table P**, **extending** Part A's `anchorBefore?` rather than replacing it. **D6c** — `reverseSymlink`'s **own** JSDoc (currently `:207-215`, immediately above the mandated fence and **outside** it) gains exactly one line, `` * @param {{identity?: function}} [opts]  test seam only — see D4 ``, placed after the existing `skillsRoots` `@param`. See "D6c — why `opts` gets a JSDoc line" for the decision. |
| modify | src/adapters/shared.js | **D7b** — extend `:5` to `const { hashDir, insertionAnchor, linkIdentity } = require('../core/manifest');`. **Do not drop `insertionAnchor`** — Part A put it there. **D10** — the three `recordOnce(manifest, { kind: 'symlink', … })` sites (`:439`, `:490`, `:496`) record `origin` (and, at `:496` only, `dev`/`ino`) per **Table B**. `recordOnce` itself is **NOT modified and NOT replaced by an upsert** — the owner declined a backfill (2026-08-01). The WP-146 preserve arm, `dropOwnedEntry`, the `readlinkSync` comparison, the `EPERM` copy fallback and every notice string stay byte-identical, as does everything Part A touched in `applyManagedBlock`. |
| modify | tests/unit/manifest.test.js | **B-T1 … B-T5, B-T7, B-T8** — the exact set in the Test index. WP-153's shipped **T1–T3, T4a–T4c, T6 and T7** must pass **byte-unmodified**. WP-153's own roster line reads *"T1–T3, T4a–T4c and T6"*, but its Table also defines **T7** — the forged-`(path, target)` adversarial row — as a shipped `manifest.test.js` test, and `(T7)` is present in the file while T6 was a *repair to an existing test* rather than a new labelled one. **Both are pinned here**; naming only T6 left the one labelled row unfenced. They craft entries with no `origin`/`dev`/`ino`, so they exercise the legacy arm and are its regression fence. Part A's A-T1…A-T11 must also pass byte-unmodified. |
| modify | tests/unit/shared-skill-links.test.js | **B-T6** — this is **an edit to three shipped `deepEqual` assertions** plus one new forward-side assertion. `:52-55`, `:191-194` and `:337-340` are the **Table F** rows; take the expected object for each from that table. The four WP-146 sync-side tests at `:345`, `:371`, `:387` and `:405` are **fenced — they must pass byte-unmodified**. |

Not deliverables, deliberately: `reverseManagedBlock` and everything Part A
owns; `src/cli/**`; every other reverser; `recordOnce`; `recordCopiedSkill`;
`recordSettingsEntry`; `docs/GLOSSARY.md`; `docs/adr/**`; `docs/specs/done/**`;
`tests/golden/**`; `tests/unit/claude-adapter.test.js`.

### Exact contracts

**The new core primitive (`src/core/manifest.js`, beside Part A's primitives):**

```js
/** lstat identity of a SYMLINK, as decimal strings (bigint: a 64-bit inode
 *  exceeds Number.MAX_SAFE_INTEGER, and BigInt is not JSON-serializable).
 *  Returns null when the path is not a symlink, is unreadable, or the platform
 *  cannot supply a non-zero (dev, ino) pair — see Table P rule S-2.
 *  @param {string} linkPath @returns {{dev: string, ino: string}|null} */
function linkIdentity(linkPath) {
  try {
    const st = fs.lstatSync(linkPath, { bigint: true });
    if (!st.isSymbolicLink()) return null;
    if (st.dev === 0n || st.ino === 0n) return null;
    return { dev: String(st.dev), ino: String(st.ino) };
  } catch {
    return null;
  }
}
```

Added to `module.exports` and to the `shared.js:5` destructure.

**`reverseSymlink` is specified as a COMPLETE EXPECTED FUNCTION, not as prose
plus fragments.** The fence below is the **single source**: it is what the
implementer writes, and **V4 extracts these exact bytes out of this file** and
byte-diffs them against the implementation. There is no second copy to drift
against — an earlier revision kept the contract and the gate as separate
transcriptions and they had already diverged by one trailing comment, which made
a literal implementation of the contract fail the gate.

Three edits distinguish it from the function at **`8515eb1`**, and nothing else
changes. **The pin moved from `9188a1c` and the bytes did not**: the function is
byte-identical at `9188a1c`, `17a2bc5` and `8515eb1` (extracted and `cmp`-ed at
all three), so re-pinning is an anchor change, not a contract change: the `opts = {}` parameter, the `identityOf` binding, and rows **4a**
and **4b** inserted immediately before the `// Row 5:` comment.

<!-- EXPECTED-FUNCTION: reverseSymlink -->

```js
function reverseSymlink(entry, dryRun, removed, skipped, removedSet, skillsRoots, opts = {}) {
  const identityOf = opts.identity || linkIdentity;   // test seam only
  const L = entry.path;
  const T = entry.target;
  // Row 1: not a symlink (real file/dir, or already gone) — never ours to delete.
  if (!isSymlink(L)) {
    skipped.push(L);
    return;
  }
  // Row 2: LEGACY (target-less) entry — ownership is unprovable, preserve
  // unconditionally (owner ruling 2026-08-01). No backfill exists or ever will.
  if (typeof T !== 'string' || T === '') {
    process.stderr.write(
      `wienerdog: keeping ${L} — not the Wienerdog skill link we recorded (replaced, or unverifiable)\n`
    );
    skipped.push(L);
    return;
  }
  // Row 3: the link must PROVE it still resolves to the source we recorded.
  // sameResolvedDir is realpath-based (semantic, follows the link) and is itself
  // fail-closed — an unresolvable side returns false, which lands HERE, in preserve.
  // There is deliberately NO second, link-text comparison: WP-153 shipped one, and
  // WP-symlink-lexical-fallback-removal dropped it because raw-text equality is the
  // weaker proof and the manifest is UNTRUSTED — a recorded target may narrow this
  // delete, never authorize one the semantic proof refuses (e.g. a relative recorded
  // target, which Wienerdog never writes, matched the link text while realpath did
  // not). Strictly narrowing: every input this now preserves was previously deleted.
  if (!sameResolvedDir(L, T)) {
    process.stderr.write(
      `wienerdog: keeping ${L} — not the Wienerdog skill link we recorded (replaced, or unverifiable)\n`
    );
    skipped.push(L);
    return;
  }
  // Row 4: a target match is NOT delete authority — the manifest is untrusted, so
  // an attacker can forge a (path, target) pair. Require the STRUCTURAL ownership
  // proof reverseCopiedSkill uses: wienerdog-* basename AND parent realpath-equal
  // to a harness skills root.
  const parentIsRoot = skillsRoots.some((root) => sameResolvedDir(path.dirname(L), root));
  if (!path.basename(L).startsWith('wienerdog-') || !parentIsRoot) {
    process.stderr.write(
      `wienerdog: keeping ${L} — not the Wienerdog skill link we recorded (replaced, or unverifiable)\n`
    );
    skipped.push(L);
    return;
  }
  // Row 4a: ADOPTED — the link was already on disk when we first recorded it, so
  // it is the USER's, not ours, however exactly it matches. Preserve.
  if (entry.origin === 'adopted') {
    process.stderr.write(
      `wienerdog: keeping ${L} — not the Wienerdog skill link we recorded (replaced, or unverifiable)\n`
    );
    skipped.push(L);
    return;
  }
  // Row 4b: IDENTITY — when we recorded a (dev, ino) pair, the link on disk must
  // still BE that file object. A delete-and-recreate gets a new inode, so a user's
  // same-source replacement no longer passes for ours. Fail closed on any doubt.
  // A PARTIAL pair (one of the two) is a shape the forward step never writes, so
  // it is unverifiable, not absent — preserve (Table P rule S-4, Table S).
  const hasDev = typeof entry.dev === 'string';
  const hasIno = typeof entry.ino === 'string';
  if (hasDev || hasIno) {
    const id = hasDev && hasIno ? identityOf(L) : null;
    if (id === null || id.dev !== entry.dev || id.ino !== entry.ino) {
      process.stderr.write(
        `wienerdog: keeping ${L} — not the Wienerdog skill link we recorded (replaced, or unverifiable)\n`
      );
      skipped.push(L);
      return;
    }
  }
  // Row 5: OWNED, in-namespace, and provably resolves to our recorded source.
  if (!dryRun) fs.unlinkSync(L);
  removedSet.add(L);
  removed.push(L);
}
```

> **Design decision, 2026-08-03 — why V4 verifies the mandated region itself
> rather than delegating it to B-T4.** Three resolutions were on the table for
> the candidate-derived-span defect, and this spec takes the second:
>
> 1. **Codex** — validate the rows against an independently trusted exact
>    transformation. Correct in principle; it needs a trusted copy, which is what
>    (2) supplies.
> 2. **Two canonical copies in mechanical lockstep (TAKEN).** The fence and the
>    snippets both live in this spec, serve different readers, and each pins the
>    other: `base + snippets` must construct the fence byte for byte. Neither is
>    derived from the artifact under test.
> 3. **wd-reviewer** — accept content-tampering inside the mandated region as a
>    structural limit, scope V4's comment, and lean on **B-T4** to redden it.
>
> **The deciding question was whether B-T4 runs on every path that trusts V4.
> It does not.** V4 is meaningful — and runnable — at **spec-review time, on a
> tree where no implementation and no B-T4 exist yet**; that is precisely when a
> reviewer validates the contract structurally. A gate whose guarantee is
> conditional on a downstream artifact that may not exist is a gate that reports
> more confidence than it has, and this V-step has now failed review three times
> for exactly that shape of reason (classification, allow-lists, candidate-derived
> spans). Removing the last conditional is the consistent move.
>
> **The reviewer's adjudication was correct about the design it examined and does
> not carry to this one.** It measured `a493f2b`'s *candidate-derived inverter*,
> where tampering inside the rows text genuinely was invisible. Under the two-copy
> construction those same two cases are **caught** — measured: `hasDev || hasIno`
> → `&&` FAILS, and a delete-authorizing branch inside the rows block FAILS. The
> "structural limit" was a limit of the derived span, not of single-sourcing.
>
> **Its B-T4 mapping is kept anyway, because it is the honest backstop for the one
> residual this design does have:** an edit applied *consistently to both copies*
> is authoring, not evasion — visible as a two-place spec diff — and it is what
> B-T4 reddens. Cost accepted: the rows text appears twice. That is duplication
> with a registered, executable lockstep, which is ADR-0031's own prescription for
> duplication that has to exist, not a violation of it.

**The mandated edits also live here, each on its own, as the SECOND canonical
copy.** The fence above is what V4 compares the *implementation* against; the two
snippets below are what the *implementer reads* — and V4's self-check requires
that building `base + these snippets` reproduces the fence **byte for byte**.
Two copies, each pinning the other, **neither derived from the artifact under
test**. An earlier revision sliced the mandated rows out of the candidate fence
itself, which meant a branch smuggled *inside* that slice was removed as if it
were mandated and the gate stayed green (measured).

<!-- MANDATED-SIGNATURE: reverseSymlink -->

```js
function reverseSymlink(entry, dryRun, removed, skipped, removedSet, skillsRoots, opts = {}) {
  const identityOf = opts.identity || linkIdentity;   // test seam only
```

<!-- MANDATED-ROWS: reverseSymlink -->

```js
  // Row 4a: ADOPTED — the link was already on disk when we first recorded it, so
  // it is the USER's, not ours, however exactly it matches. Preserve.
  if (entry.origin === 'adopted') {
    process.stderr.write(
      `wienerdog: keeping ${L} — not the Wienerdog skill link we recorded (replaced, or unverifiable)\n`
    );
    skipped.push(L);
    return;
  }
  // Row 4b: IDENTITY — when we recorded a (dev, ino) pair, the link on disk must
  // still BE that file object. A delete-and-recreate gets a new inode, so a user's
  // same-source replacement no longer passes for ours. Fail closed on any doubt.
  // A PARTIAL pair (one of the two) is a shape the forward step never writes, so
  // it is unverifiable, not absent — preserve (Table P rule S-4, Table S).
  const hasDev = typeof entry.dev === 'string';
  const hasIno = typeof entry.ino === 'string';
  if (hasDev || hasIno) {
    const id = hasDev && hasIno ? identityOf(L) : null;
    if (id === null || id.dev !== entry.dev || id.ino !== entry.ino) {
      process.stderr.write(
        `wienerdog: keeping ${L} — not the Wienerdog skill link we recorded (replaced, or unverifiable)\n`
      );
      skipped.push(L);
      return;
    }
  }
```

**Why the seam exists.** `(dev, ino)` is a *filesystem* property, so the four
behaviors row 4b depends on — changed device, changed inode, reused identity,
unavailable identity — cannot be produced deterministically on a real
filesystem, and a test that relies on `unlink` + `symlink` happening to allocate
a fresh inode is a platform-dependent assumption pretending to be a contract.
The seam makes all four deterministic (**B-T7**, measured). `reverse()`'s call
site passes **nothing** — the default parameter keeps production behavior
byte-identical, exactly as `reverseSchedulerEntry` (Current state §7) already
does with its own `opts = {}`. `reverseSymlink` is already exported and already
unit-tested directly (WP-153's T4a). **`opts` comes from the call site and never
from a manifest entry**, so it is not an untrusted-input surface.

**One stderr string for rows 2, 3, 4, 4a and 4b, deliberately.** WP-153 already
shares it across rows 2–4; adding two more distinct strings would add two more
user-facing surfaces to keep in sync for no user benefit — the line already reads
*"not the Wienerdog skill link we recorded (replaced, or unverifiable)"*, which is
true of both new rows. Recorded as a decision so a reviewer does not read it as
an oversight.

**Schema cell:**

```js
  symlink: { target: 'string', origin: 'string', dev: 'string', ino: 'string' },
```

**Producer sites, per Table B:**

```js
// :439  adopt — the link was already there.
recordOnce(manifest, { kind: 'symlink', path: linkPath, target, origin: 'adopted' });

// :490  dryRun — a report only; nothing is written and sync.js:340 never saves it.
recordOnce(manifest, { kind: 'symlink', path: linkPath, target, origin: 'created' });

// :496  create — symlink(target, linkPath) has just succeeded. Write it out
//       explicitly; do NOT spread a possibly-null identity into the literal.
const id = linkIdentity(linkPath);
const symlinkEntry = { kind: 'symlink', path: linkPath, target, origin: 'created' };
if (id) {
  symlinkEntry.dev = id.dev;
  symlinkEntry.ino = id.ino;
}
recordOnce(manifest, symlinkEntry);
```

## Contract reference

**Activation (ADR-0031's 2-of-7 test): five triggers fire.** (i) an interface
**shape** changes; (ii) a **result taxonomy** is introduced — `origin`'s two
values; (iii) **schema acceptance** changes — `ENTRY_FIELD_TYPES.symlink` gains
three fields; (iv) **fallback/precedence** behaviour changes — two new rows and a
new legacy arm; (vii) the same contract appears in **multiple mirrored surfaces**
— three producer sites, one schema cell, two doc comments, one reverser, two test
files. **Seven canonical tables** below — P, S, A2, B, N, F and U.

### Table P — the provenance fields (canonical)

| Field | Type on disk | Written by | Exact value | Read by | Absent ⇒ | Type-gated? |
|-------|--------------|-----------|-------------|---------|----------|-------------|
| `origin` | `string` — `'created'` or `'adopted'` | the three `recordOnce` sites | `'adopted'` at `:439`; `'created'` at `:490` and `:496` | row 4a | see **Table S** — it depends on the other fields | **YES** (`origin: 'string'`). A rejected entry means the **link is preserved**, the safe direction — the exact opposite of Part A's managed-block case. |
| `dev` | `string` — decimal | `recordOnce` at `:496` **only** | `String(fs.lstatSync(link, {bigint:true}).dev)` | row 4b | see **Table S** | **YES** |
| `ino` | `string` — decimal | `recordOnce` at `:496` **only** | `String(fs.lstatSync(link, {bigint:true}).ino)` | row 4b | see **Table S** | **YES** |

**Rules that govern the fields as a set, decided here:**

- **S-1. `dev`/`ino` are recorded ONLY where we created the link** (`:496`). Not
  at `:439` — we did not create it, and that is exactly what `origin: 'adopted'`
  says — and not at `:490`, where nothing exists to `lstat` and the entry is
  never saved.
- **S-2. When `linkIdentity()` returns `null`, record NO identity fields** —
  `origin: 'created'` alone. This is the **forward**-side "cannot establish
  identity" answer and it deliberately keeps shipped behaviour, because the
  alternative — treating unavailable identity as a reason to preserve — would
  make uninstall incomplete on any platform whose filesystem cannot supply a
  stable `(dev, ino)` pair, a regression against ADR-0019 for every user on that
  platform. **The fail-closed direction applies on the REVERSE side only**
  (row 4b): identity that *was* recorded and no longer matches preserves.
- **S-3. Nothing backfills.** `recordOnce` no-ops on an existing entry
  (`shared.js:50-51`), so an install that predates this WP keeps its target-only
  entries **permanently** — through one sync and through a hundred. That is the
  owner-ruled position for `target` (2026-08-01) and it is inherited unchanged.
  "Legacy" is a permanent state.
- **S-4. The fields are TWO governed groups, and "absent" is not one condition, and the accepted shape space is bigger
  than the producer's output.** All three fields are optional and only
  type-gated, so `validateEntry` admits **twenty** distinct
  `{origin, dev, ino}` shapes while the forward step writes only **four**.
  **Table S enumerates all twenty, measured.**

### Table S — every schema-accepted `{origin, dev, ino}` shape (canonical)

**The twenty cells cover TWO governed groups, not one** (ADR-0038's grouping
test, applied 2026-08-03): `{origin}` is written at all three producer sites
and read by row 4a; `{dev, ino}` are written only at the create site and read
by row 4b. Splitting them makes ADR-0038's **R** bite in four places this
table already measures — `origin` absent with `both-wrong`/`dev-only`/`ino-only`,
and `origin: 'adopted'` with no identity. **All four are already priced in the
owner ledger** (the wrong-pair row, the partial-pair row, and 4a), so the split
reclassifies measured cells and moves no cost.

**This table exists because a six-row summary was not the shape space.** Codex
round 3 finding 2: all three fields are optional, `origin` is type- but not
value-gated, so schema-valid combinations the producer never writes reach the
reverser and take materially different paths. Here is the whole space,
**measured end-to-end through `applySkillLinks` → `reverse()`**, one run per cell.
`none` = neither field; `both` = a matching pair; `both-wrong` = a pair that does
not match the live link; `dev-only` / `ino-only` = a partial pair.

| `origin` \ identity | `none` | `both` (matching) | `both-wrong` | `dev-only` | `ino-only` |
|---|---|---|---|---|---|
| **absent** | removed | removed | **PRESERVED** | **PRESERVED** | **PRESERVED** |
| **`'created'`** | removed | removed | **PRESERVED** | **PRESERVED** | **PRESERVED** |
| **`'adopted'`** | **PRESERVED** | **PRESERVED** | **PRESERVED** | **PRESERVED** | **PRESERVED** |
| **`'bogus'`** (unknown string) | removed | removed | **PRESERVED** | **PRESERVED** | **PRESERVED** |

**At base every one of these twenty cells is `removed`** — measured at
`0f9ee08`, and **unchanged by PR #151**: every Table S fixture uses a link whose
target still resolves, so row 3 passes in all twenty and the removal of its
link-text fallback cannot move a single cell. (The fallback only ever mattered
when `realpath` failed, which no fixture here induces.) —
`reverseSymlink` unlinks any recorded-path symlink with no identity check at all.
**So every `PRESERVED` cell is a NARROWING and no cell is a widening.** That is
Table N's theorem, proved exhaustively rather than by argument.

**The four PRODUCER-VALID shapes**, distinguished from the sixteen that are
forgery or corruption only:

| Shape | Written by | Outcome | Why |
|-------|-----------|---------|-----|
| absent / `none` | an install predating this WP | **removed** — base behaviour | the legacy arm; the upgrade-safety criterion (AC8a) |
| `'created'` / `both` | `shared.js:496` when `linkIdentity` succeeded | row 4b decides | the mainline |
| `'created'` / `none` | `shared.js:490` (dry run), or `:496` when `linkIdentity` returned `null` (S-2) | **removed** — base behaviour | identity was never establishable; never make an existing platform's uninstall incomplete |
| `'adopted'` / `none` | `shared.js:439` | **preserved** (row 4a) | the link is the user's |

**The three semantic classes among the remaining sixteen**, each stated because
each is a distinct decision, not an accident:

1. **`origin: 'adopted'` with any identity** (4 cells). Row 4a fires first, so
   identity is never consulted. Only narrows. A forged `'adopted'` buys an
   attacker a preserved link and nothing else.
2. **An unknown `origin` string** (5 cells). Falls through row 4a and behaves
   exactly as `'created'` — identity decides, or base behaviour when there is
   none. **`origin` is deliberately compared against one literal rather than
   validated against an enum**: an unknown value must never be *more* permissive
   than `'created'`, and it is not, so an enum check would add a surface without
   changing an outcome.
3. **A partial `(dev, ino)` pair** (8 cells). **Preserved.** A half pair is a
   shape no branch writes, so it is *unverifiable*, not *absent*; treating it as
   absent would be a **wider** deletion than treating it as unverifiable, and
   fail-closed is the house rule. **This is a real completeness cost and it is in
   the owner ledger** — see the ledger's **partial-pair leftover** row.

### Table A2 — what `reverseSymlink(entry)` does after this WP (canonical)

Conditions are evaluated **in order**; the first that holds decides. `L` is
`entry.path`, `T` is `entry.target`. Rows 1–5 are WP-153's, restated in full so
this spec is self-contained; **rows 4a and 4b are new.**

| # | Condition | Filesystem action | Bucket | stderr | Why it is the fail-safe answer |
|---|-----------|-------------------|--------|--------|--------------------------------|
| 1 | `!isSymlink(L)` | none | `skipped` | none | A real file/dir at `L`, or nothing at all, is definitionally not the link we made. |
| 2 | `typeof T !== 'string' \|\| T === ''` — **LEGACY** | none | `skipped` | `wienerdog: keeping <L> — not the Wienerdog skill link we recorded (replaced, or unverifiable)` | Ownership unprovable; owner-ruled 2026-08-01. |
| 3 | `sameResolvedDir(L, T) === false` | none | `skipped` | same line | The link does not **prove** it resolves to the recorded source. `sameResolvedDir` is realpath-based and fail-closed by construction — an unresolvable side returns `false`, which lands here, in preserve. **There is deliberately no second, link-text comparison**: WP-153 shipped one and `WP-symlink-lexical-fallback-removal` dropped it, because raw-text equality is the weaker proof and the manifest is untrusted. |
| 4 | **`OWNED(L)` is false** — basename not `wienerdog-*`, **or** `path.dirname(L)` does not realpath-equal a harness skills root | none | `skipped` | same line | A forged `(path, target)` pair is not delete authority (WP-153 gate round 4). |
| **4a** | **`entry.origin === 'adopted'`** | none | `skipped` | same line | **NEW.** The link was already on disk when we first recorded it — the adopt branch (`shared.js:439`) sees a `wienerdog-*` link already pointing at our source and records it. It is the user's. Narrows honest-use case 2. |
| **4b** | **`entry.dev` or `entry.ino` is a string** — and either the pair is **partial**, or `identityOf(L)` is `null`, or it does not equal `(entry.dev, entry.ino)` | none | `skipped` | same line | **NEW.** We recorded which file object we created; this is not it. A delete-and-recreate gets a new inode (measured, Current state §8), so a user's same-source replacement no longer passes for ours. Narrows honest-use case 1. A `null` identity is fail-closed by construction. **`(dev, ino)` is durable but not permanent, and recyclable.** The two directions are split across the two ledger sections: the *drift* half is a completeness cost, the *recycling* half is **equal to base** and is deliberately NOT priced (Codex round 7). Both pinned by B-T7. |
| 5 | otherwise | `if (!dryRun) fs.unlinkSync(L)` | `removed` **and** `removedSet.add(L)` | none | In-namespace, under a harness skills root, resolves to the recorded source, **not adopted**, and **still the file object we created**. The only row that deletes. **Row 4b's check and this unlink are two syscalls, not one — see the TOCTOU note. This design is NOT claimed to be TOCTOU-free.** |

**Row 4b verifies identity; row 5 unlinks by pathname. Those are separate
syscalls, and nothing binds them.**

- **The window.** Between `identityOf(L)` returning and `fs.unlinkSync(L)`
  executing, another process can replace `L`. Uninstall then removes the
  replacement even though the identity it verified belonged to the previous
  object. **Measured** with an identity seam that replaces the link and *then*
  returns the recorded pair: the replacement is deleted (**B-T8**).
- **Why it is not closed in-process.** Node exposes no atomic compare-and-unlink
  for a symlink: there is no `unlinkat` with an identity predicate, and `lstat` +
  `unlink` cannot be fused from JS. Closing it needs an OS primitive Node does
  not surface.
- **Who can exploit it, and why that is outside the threat model.** The attacker
  must already be able to create and delete files at the recorded path inside the
  user's own harness skills directory — **arbitrary code running as the same OS
  user**. `docs/THREAT-MODEL.md` places that outside the boundary and says so
  repeatedly: *"arbitrary same-user native code (A12)"*, a
  *"trusted-computing-base residual"*, and of the 0600 file-permission boundary,
  *"this is … not an OS boundary"* — a same-user native actor *"can read the same
  0600 tokens and rewrite the same 0600 grant store"*. An attacker who can win
  this race can delete the link directly and does not need `uninstall` as a
  confused deputy.
- **The precedent for this disposition is the sibling's.** ADR-0028 carries the
  same shape for the scheduler's executable-integrity check: *"reopen-based; a
  TOCTOU-free design requires the deferred '2b' in-memory bootstrap … plainly in
  docs; not claimed as TOCTOU-free."* This spec takes the identical line.
- **It only ever narrows against base**, which unlinks with no identity check at
  all, so every outcome reachable through this race is reachable at base with no
  race required.
- **Residual R7, pinned by B-T8.** It is **not** a cost in the owner ledger:
  base removes the same replacement with no race required, so this is a limit on
  how much of honest-use case 1 closes, not a regression to ratify (Codex round 6,
  finding 2). The ledger lists it under *reclassified — equal to base*.

### Table B — what each producer site records (canonical)

| Site | Branch | `kind`/`path`/`target` | `origin` | `dev`/`ino` |
|------|--------|------------------------|----------|-------------|
| `shared.js:439` | **adopt** | unchanged | **`'adopted'`** | **none** (we did not create it) |
| `shared.js:490` | **dryRun** | unchanged | **`'created'`** | **none** (nothing exists to `lstat`; never saved — `sync.js:340`) |
| `shared.js:496` | **create** | unchanged | **`'created'`** | **`linkIdentity(linkPath)`**, or **none** when it returns `null` (S-2) |

### Table N — the strictly-negative posture (canonical)

**The theorem:** for every possible manifest, the set of filesystem mutations
performed after this WP is a **subset** of base's. **Table S proves it
exhaustively over all twenty accepted shapes.** The per-field summary:

| Forgery | What an attacker gains | Measured |
|---------|------------------------|----------|
| delete `origin`/`dev`/`ino` | shipped 0.12.0 behaviour — bounded by row 4's `OWNED(L)` gate to the `wienerdog-` namespace in the two harness skills dirs | Table S, `absent`/`none` |
| `origin: 'adopted'` | a **preserved** link. Only ever narrows | Table S, row 3 |
| an unknown `origin` string | exactly `'created'`'s behaviour — never more permissive | Table S, row 4 |
| a non-string `origin`/`dev`/`ino` | `validateEntry` rejects the entry → preserved. Only narrows | B-T5 |
| a wrong `(dev, ino)` pair, or a partial one | preserved. Only narrows | Table S, `both-wrong` / `dev-only` / `ino-only` |
| a *correct* `(dev, ino)` read off the live link, **or** an inode the filesystem recycled | shipped behaviour — the link is deleted, exactly as base does. The attacker must already be able to `lstat` the link they want deleted | B-T7(d); **R4**'s recycling half — declared and pinned, but **not a ledger cost**: base removes the same link with no check at all |

**This WP does not close manifest forgery and does not claim to.** An attacker
who can rewrite the manifest can always delete the fields and get base behaviour.
**What it narrows is HONEST-USE authorship** — a user who re-made or pre-made a
link, with nothing forged. Manifest integrity (signing/HMAC) is declined for the
same reason WP-153 declined it: the file carries no integrity protection at all
and `reverseCopiedSkill`'s `hash` lives with the identical residual. **Out of
scope by declaration**, not by omission.

### Table F — the three shipped assertions this WP FLIPS (canonical)

**Measured.** With this WP's design applied, exactly three assertions change
state, all in `tests/unit/shared-skill-links.test.js`.

| # | File:line | Test | Current expectation | **New expectation** | Why |
|---|-----------|------|---------------------|---------------------|-----|
| 1 | `:52-55` | `skill symlinked into the target dir with the default seam (POSIX)` | `assert.deepEqual(…, [{ kind: 'symlink', path: linkPath, target: coreSkill }])` | **Cannot stay a literal** — the entry now carries machine-specific `dev`/`ino`. Replace with: assert `kind`/`path`/`target`/`origin` equal `'symlink'`/`linkPath`/`coreSkill`/`'created'`, **and** assert `{ dev: entry.dev, ino: entry.ino }` deep-equals `linkIdentity(linkPath)`, **and** that it is non-null on POSIX. Get `linkIdentity` by extending the **existing** destructure at `:10` (`const { hashDir } = require('../../src/core/manifest');`); do not add a second `require` | This is the create branch (`:496`) and the **only** site that records identity. Asserting against the live `linkIdentity` rather than a hardcoded number is what makes the row portable; asserting non-null is what makes it non-vacuous. |
| 2 | `:191-194` | `dry-run records a symlink entry and reports the change without writing` | `[{ kind: 'symlink', path: linkPath, target: path.join(skillsDir, 'wienerdog-setup') }]` | `[{ kind: 'symlink', path: linkPath, target: path.join(skillsDir, 'wienerdog-setup'), origin: 'created' }]` | Dry run writes nothing, so there is no link to `lstat` and no identity to record (Table B). The literal stays a literal. **`coreSkill` is NOT in scope** — `:181` destructures only `{ skillsDir, targetSkillsDir }`; build the target inline from `skillsDir`, as the shipped assertion already does. |
| 3 | `:337-340` | `a pre-existing correct symlink is adopted into the manifest (recorded, reported unchanged)` | `[{ kind: 'symlink', path: linkPath, target: coreSkill }]` | `[{ kind: 'symlink', path: linkPath, target: coreSkill, origin: 'adopted' }]` | This is the adopt branch (`:439`). No identity is recorded (S-1) and `origin` is `'adopted'` — the two facts that make row 4a fire on uninstall. |

### Table U — the regions that must stay BYTE-IDENTICAL

**"Unchanged" means byte-for-byte against the FILE**, not against this spec's
excerpts, which are dedented and annotated.

| Region | Must stay |
|--------|-----------|
| `reverseSymlink` rows 1–5 | unchanged except the two new blocks inserted **before** the `// Row 5:` comment, the `opts = {}` parameter, and the `identityOf` binding. In particular row 3 stays the **single** `if (!sameResolvedDir(L, T))` test — do **not** reintroduce a link-text comparison anywhere in this function, under any identifier; `WP-symlink-lexical-fallback-removal` removed it deliberately. **V4 enforces this by reconstructing the whole expected function and byte-diffing it**, so an added branch fails whatever it is named. |
| The `reverse()` symlink arm | unchanged — **including the argument list**. `reverseSymlink` gains a 7th parameter `opts = {}`, and `reverse()` must **not** pass it: the default is production behaviour. A diff that adds an argument there is out of scope. |
| `reverseManagedBlock`, in full | **untouched by this WP** — Part A's. Its fd-bound read, WP-147's Table M vocabulary block, the `anchorOk` conjunct Part A added, the `createdFile` `fs.rmSync(target, …)` delete and the fd-bound `ftruncateSync`+`writeSync` all stay exactly as Part A left them. **V3 is the guard.** |
| `ENTRY_FIELD_TYPES`' other cells | unchanged — only the `symlink` cell moves. `managed-block` must **not** gain `anchorBefore` (Part A's Table P forbids it; V6 enforces it). |
| `applySkillLinks`' preserve arm, directory arm and EPERM fallback | unchanged |
| `applyManagedBlock`, in full | **untouched by this WP** — Part A's, including its three `recordManagedBlock` argument lists |
| `recordOnce` | unchanged — **not** replaced by an upsert (S-3) |
| `shared.js:5` | **extended, not rewritten** — `insertionAnchor` must survive |

### Mirrored Surface Checklist

**Table P + Table S (the fields and their accepted shapes)** — mirrors:

- [ ] Deliverables cells **D5**, **D6b**, **D10**
- [ ] Exact contracts: the producer-site block and the rows-4a/4b snippet
- [ ] `src/core/manifest.js` module doc comment and `@typedef` (in-code — D6b)
- [ ] `reverseSymlink`'s own JSDoc — the `opts` `@param` (in-code — D6c)
- [ ] `src/core/manifest.js` `ENTRY_FIELD_TYPES.symlink` (in-code — D5)
- [ ] Current state §3 (producer sites), §4 (schema), §5 (doc comment)
- [ ] Table B, Table N
- [ ] Acceptance criteria **AC1**, **AC2**, **AC8a**, **AC8a′**, **AC8b**, **AC9**
- [ ] Verification **V5**, **V6**
- [ ] **The owner cost ledger's corruption-only rows** — the partial-pair leftover,
      the schema-valid wrong identity pair, and D5's schema rejection — plus the
      ledger's `Keeps D5?` column and
      disposition **(v)** — the only arm with zero completeness cost
- [ ] **The ledger's *reclassified — equal to base* table** (4b's recycling arm and
      the verify→unlink race) and the `Completeness cost` column's restriction to
      preservation regressions — **Table A2's row 4b cell and Table N's recycling
      row mirror it**, and both were stale until round 7
- [ ] **The schema-valid wrong-pair cost row** and its three B-T4 cases
- [ ] Deliverable **D5** and Table N's non-string row — both move if the ruling
      is (v)

**Table A2 (reverser rows)** — mirrors:

- [ ] Deliverables cell **D4**
- [ ] Exact contracts: the rows-4a/4b snippet, the `opts = {}` signature, the
      one-stderr-string decision
- [ ] Current state §1 (the shipped five rows), §7 (the seam precedent)
- [ ] Table U's `reverseSymlink` and `reverse()`-arm rows
- [ ] Acceptance criteria **AC6**, **AC7**
- [ ] Test index **B-T1 … B-T8**; Table R rows **R3**, **R4**, **R5**, **R7**
- [ ] Verification **V4**
- [ ] **The owner cost ledger**, all five priced rows, **and** its
      *reclassified — equal to base* table

**Table B (the three producer sites) — mirrors. REGISTERED IN FULL after a census
found ELEVEN stale coordinates across them** (wd-reviewer, PR #156). The three
sites are a contract with roughly ten mirrors, and three successive hand sweeps
each updated only the subset they happened to grep — the reviewer's diagnosis is
the lesson: *"both were visited and both were updated only as far as the first
number on the line — the sweep was line-scoped, which is arithmetic-shaped, not
content-shaped."* Every surface carrying a producer coordinate is named here so
the next `src/` move relocates them mechanically:

- [ ] Deliverables cell **D10** — carries all three coordinates
- [ ] Exact contracts: the three `// :NNN` **code comments** inside the
      producer-site fence. They sit in a fence, so they have no backticks — the
      form every backtick-scoped sweep missed
- [ ] **Table B** itself — the canonical row per site
- [ ] **Table P**'s "Written by" column, one coordinate per field row, and
      **rule S-1**, which names all three
- [ ] **Table F** rows 1 and 3 — the create and the adopt site
- [ ] **Table S**'s producer-valid shape table
- [ ] **AC9** — all three, and they **wrap across two lines**, which is how two of
      them survived a line-scoped pass
- [ ] Current state §3 — the grep block and the per-site table
- [ ] The EPERM-fallback prose and the dry-run report prose
- [ ] **V11 resolves every one of them by content.** It is the only surface here
      that cannot go stale silently — **re-run it instead of sweeping**, *at base*
      (V11's header comment is the one place its directionality is decided; it is
      green at base and red after the work lands, by design)

**Table F (flipped assertions)** — mirrors:

- [ ] Deliverables cell for `tests/unit/shared-skill-links.test.js`
- [ ] Current state §9; Test index **B-T6**; Acceptance criterion **AC10**

## Test index

Every row names how its state is produced **structurally**, never by position in
a sequence, and names the implementation it reddens (ADR-0036 A1/A2).

| # | Fixture (structural) | Assertion | Red against |
|---|----------------------|-----------|-------------|
| **B-T1** | Honest `applySkillLinks` create, then a **replacement built so its inode CANNOT equal the recorded one** — see "B-T1's construction" below. Guard the row with the file's existing `isPosix` convention (`manifest.test.js:55`): `if (!isPosix) return t.skip('symlink creation may be unavailable');` | the link **still exists** after `reverse()`, is in `skipped`, and the stderr `keeping …` line fired. **Two assertions on the construction, both POSIX guarantees, not coin flips**: (i) immediately after the temp link is created and *before* the original is unlinked, its inode differs from the original's; (ii) after the rename, the link's inode equals the temp's. Do **NOT** assert "the recreated pair differs from the recorded pair" as a precondition — that is the defect this amendment removes | base (**measured**: the link is deleted). This is the end-to-end row; **B-T7(b)** proves the same rule deterministically through the seam, and remains the coverage that does not depend on filesystem behaviour at all. |
| **B-T2** | The link is created **before** `applySkillLinks` runs, so the adopt branch records it | the link **still exists** after `reverse()`, is in `skipped`; **and** the recorded entry has `origin: 'adopted'` and **no** `dev`/`ino` | base (**measured**: the link is deleted). Assert the entry shape too — the end state alone tells you something is wrong; the entry tells you which rule fired. |
| **B-T3** | Honest create, nothing touched, uninstall | the link is **removed** and is in `removed` | `PATCH: none — baseline / ordinary path.` Baseline row (ADR-0036 A1 exemption **(ii)**, not (i): there is no fault to inject here, so the missing field is the PATCH); red against making identity *required*, and against any row 4a/4b that fires on our own untouched link. **Run the forward step twice before uninstalling** and assert the entry is deep-equal to the first run's — that is AC11. |
| **B-T4** | **Table S, one case per row of the producer-valid table plus every semantic class — TWELVE rows, not one combined deletion**: all-absent; `'created'`+matching identity; `'created'`+no identity; `'adopted'`+no identity; `'adopted'`+identity; unknown `origin`+no identity; unknown `origin`+matching identity; **`dev`-only**; **`ino`-only**; and the **both-wrong** family added in round 7 — **both fields wrong**, **`ino` wrong only**, **`dev` wrong only**. **The three both-wrong rows must also assert the BASE contrast** (base removes all three; measured), because they are what pins the corruption-only ledger row | each behaves exactly as Table S tabulates — in particular all three both-wrong rows **preserve**, where base removes | the all-absent row is the **backward-compatibility fence** (red against "absent identity ⇒ preserve", which would strand every pre-existing install). The **two partial rows are required in both directions** — one alone is passed by an implementation that checks only the field it happens to test. **All measured.** |
| **B-T5** | Non-string forgeries, one per field: `origin = 1`, `dev = 1`, `ino = 12345`. **This row pins the owner ledger's schema-rejection cost**, so it must also assert the base contrast: at base the same entries **validated and the link was removed**, because `symlink: {}` gated none of these keys. Prove it in-test with `validateEntry({…, zzz: 12345})` — an ungated key — returning `{ok:true}`, which is what base did for `ino` | all three **preserve** the link, and the entry is rejected upstream by `validateEntry` with its notice and a `why` naming the field | any implementation where a non-string field reaches the reverser or widens deletion. Three separate rows, three separate mutations (ADR-0036 A3) — independently revertible, each reddening a different field of the schema cell. |
| **B-T6** | `shared-skill-links.test.js` — the three **Table F** rows plus the forward-side identity assertion | exactly the expectations in Table F | `PATCH: none — shipped assertions whose expected values moved.` Their red-ness is Table F's measurement (three `ERR_ASSERTION` failures). |
| **B-T7** | **The identity seam, four deterministic arms.** Honest create, then call `reverseSymlink` **directly** (WP-153 blessed the direct unit call) passing `{ identity: … }` as the 7th argument. Four separate rows: **(a) changed device** → `{dev: recorded.dev+1, ino: recorded.ino}`; **(b) changed inode** → `{dev: recorded.dev, ino: recorded.ino+1}`; **(c) unavailable** → `null`; **(d) reused** → the recorded pair verbatim | (a),(b),(c) → the link **survives**, is in `skipped`, `removed` empty. (d) → the link is **removed** — this arm pins **R4**'s recycling residual at its declared size; comment it as pinning current behaviour, not a fix | (a)(b)(c) red against any implementation that ignores a recorded identity or treats `null` as a match. (d) is `PATCH: none — residual pin`. **All four measured.** |
| **B-T8** | **The verify→unlink race**, deterministic. Honest create, then call `reverseSymlink` directly with an identity seam that **replaces the link on disk** (`unlinkSync` + `symlinkSync`) and *then* returns the **recorded** pair — simulating a replacement landing between the check and the unlink | the replacement **is deleted** and the link is in `removed` | `PATCH: none — residual pin.` Not red-first: it pins **R7** at its declared size, which is the only way "we do not claim TOCTOU-freedom" stops being a sentence. If it ever goes red, either an atomic primitive was adopted or the mechanism changed. **Measured.** |

### D6c — why `opts` gets a JSDoc line, and why it is not in the fence

**The gap.** `reverseSymlink`'s mandated signature adds a 7th parameter,
`opts = {}` (the identity seam). Its JSDoc lives at `manifest.js:207-215`, which
is **above** the `MANDATED-SIGNATURE` fence — the fence begins at the `function`
line. So the byte-lockstep gate that pins the signature does **not** see the
JSDoc, and without an explicit deliverable the parameter would ship undocumented,
against this repo's stated convention (CLAUDE.md: *"No TypeScript in `src/` —
JSDoc type annotations only"*). Every other parameter of this function has an
`@param`; `opts` would have been the only one without.

**Decision: document it, outside the fence, pinned by a grep — not by moving the
fence.** Three options were weighed:

| | Option | Verdict |
|---|---|---|
| 1 | **Leave it undocumented** — treat `opts` as an internal seam | **rejected.** It is a real parameter in a real signature; "internal" is not a property the reader can see, and the convention has no seam exemption |
| 2 | **Extend the `MANDATED-SIGNATURE` fence upward** to cover the JSDoc | **rejected.** The fence is byte-locked against a second copy and its extraction spans are content-anchored on `function reverseSymlink(`. Widening it means re-deriving the extractor, the construction self-check and the 31/13 V4z matrix — a large, measured surface disturbed for one comment line. Cost is wildly out of proportion to the gap |
| 3 | **One mandated JSDoc line above the fence, checked by grep (V8b)** | **TAKEN.** Zero disturbance to V4: the fence still starts at the `function` line and stays byte-identical. `@param` text is not behaviour, so a byte-lock buys nothing a presence check does not |

**Blast radius, checked rather than assumed.** Adding a line at `:215`
shifts `rsDef` and everything below it in `manifest.js` by one.

- **V4** is unaffected — its spans are content-anchored at `function
  reverseSymlink(` and the matching close brace, both of which move together.
- **V8/AC2** is unaffected — `wd-docfields.js` isolates the module header by
  slicing at `const BEGIN_SENTINEL` (`manifest.js:54`), far above this JSDoc.
- **V11** is affected, and that is already accounted for: it is a **base-only**
  gate (see its header comment), and the implementation shifts these coordinates
  by far more than one line regardless. The deferred post-merge citation
  re-derivation absorbs it.

**Exact text, so there is no judgment left.** One line, after the existing
`skillsRoots` `@param`:

```js
 * @param {{identity?: function}} [opts]  test seam only — see D4
```

### B-T1's construction — and why the naive one was a spec defect

**What failed.** The mandated text was *"`fs.unlinkSync(link)` followed by
`fs.symlinkSync(coreSkill, link)`"* plus an assertion that the new pair differs
from the recorded one. On APFS — every local run and CI's macOS runner — the
recreate gets a fresh inode and the assertion holds. **On ext4 the freed inode is
reused immediately**, the new link gets the *same* inode, and the assertion fails:
CI (ubuntu-latest) reported *"precondition: delete+recreate must change the
(dev, ino) pair — expected true, actual false"*.

**This was a spec defect, not an implementation one.** Codex's design-round-2
finding warned the row was filesystem-dependent; the answer written into the spec
— *"B-T1 asserts its filesystem precondition instead of assuming it"* — converted
a silent vacuous pass into a **hard failure on a conforming platform**. Asserting
a coin flip does not remove the dependency, it just makes the coin visible.

**The construction that removes the dependency.** Allocate the replacement's
inode **while the original still holds its own**, then swap the name:

```js
const tmp = `${link}.tmp`;
fs.symlinkSync(coreSkill, tmp);        // 1. new inode, allocated while `link` is still live
//    ASSERT (i): linkIdentity(tmp).ino !== recorded.ino
fs.unlinkSync(link);                   // 2. free the original
fs.renameSync(tmp, link);              // 3. move the DIRENT; the inode is preserved
//    ASSERT (ii): linkIdentity(link).ino === the inode observed at step 1
```

**Why this is guaranteed, and on what.** It rests on two POSIX properties, not on
any allocator policy:

1. **Two live files on one device cannot share an inode number.** At step 1 the
   original is still linked, so its inode is allocated; `symlink()` creates a new
   inode and therefore a different number. (`symlink()` never hardlinks.)
2. **`rename()` does not allocate an inode.** POSIX defines it as a
   directory-entry operation — *"the rename() function shall change the name of a
   file"* — and it does not follow symlinks: *"if the old argument points to a
   pathname of a symbolic link, the symbolic link shall be renamed."* So step 3
   moves the name and keeps the inode from step 1. Nothing between steps 2 and 3
   allocates anything, so the freed original inode cannot be handed back.

`tmp` is a sibling in the same directory, so the device is identical and `EXDEV`
is impossible. **Measured on APFS**: step 1 yields distinct inodes, step 3
preserves the temp's inode, the final pair differs from the recorded one, and the
link is still a symlink resolving to the core source. The ext4 behaviour that
broke the naive form — immediate reuse of a *freed* inode — cannot apply, because
under this construction the original's inode is never freed before the
replacement's is allocated.

**Design decision, recorded.** Two candidates were considered:

| | Design | Verdict |
|---|---|---|
| (a) | **skip-guard** — `t.skip(…)` when the recreated pair happens to equal the recorded one, leaning on **B-T7(b)** for the mismatch path | **not taken.** Correct and platform-independent, but it makes the row's end-to-end value a coin flip: on ext4 it would *always* skip, so the only platform CI actually gates on would lose the coverage entirely |
| (b) | **construct** — the rename swap above | **TAKEN.** It keeps the row-4b end-to-end proof live on **every** POSIX filesystem, including CI's own |

**(a) remains the documented fallback.** If a platform is ever found where either
POSIX property above does not hold, the row cannot be made deterministic there and
(a) is the correct amendment — with the same pointer: **B-T7(b) proves row 4b's
mismatch path through the identity seam, deterministically and without touching a
filesystem**, which is exactly why both rows exist. That division is unchanged by
this amendment: B-T1 is the end-to-end row, B-T7 is the deterministic one.

**The two assertions are derivation checks, not preconditions.** Each restates a
POSIX guarantee, so a failure means either the construction was built wrong (fail
loudly — correct) or the platform violates POSIX rename semantics (in which case
R3/R4's assumptions need revisiting, and that is also worth failing on). Neither
is the allocator coin flip the old row depended on.

## Implementation notes & constraints

- **No new npm dependencies.**
- **`bigint: true` is not optional.** A 64-bit inode exceeds
  `Number.MAX_SAFE_INTEGER` and the plain `lstatSync` form loses precision
  silently — two different links could then compare equal. `BigInt` is not
  JSON-serializable, hence decimal **strings** on disk.
- **`linkIdentity` never dereferences.** `fs.lstatSync` is link-level by
  definition and the function returns `null` unless `isSymbolicLink()` is true,
  so a swapped file or directory at the recorded path can never produce an
  identity match. Every throw degrades to `null`, which row 4b treats as
  **preserve**.
- **Row 3 is now a single semantic proof — do not add a second one.**
  WP-153 shipped `sameResolvedDir(L, T) === false && fs.readlinkSync(L) !== T`;
  `WP-symlink-lexical-fallback-removal` (PR #151) dropped the lexical half
  because raw link-text equality is the weaker proof and the manifest is
  untrusted — a recorded target may **narrow** a delete, never authorize one
  the semantic proof refuses. That is the same rule this WP's own fields obey
  (Table N), and it is the rule **ADR-0038** codifies. Row 3 is not this WP's
  to change: V4 asserts the single test is present **and** that `lexicalMatch`
  is absent.
- **A birth-time / generation field was considered and REJECTED.** It would
  narrow only the recycling half of R4, leaves the drift half untouched, and
  `birthtimeMs` is not dependably a creation time across the filesystems
  Wienerdog targets — a third field, a third failure mode and a third mirror for
  the smaller half of one row's cost. If the owner wants recycling closed, it is
  its own WP with its own platform survey.
- **`origin` is compared against one literal, not validated against an enum.**
  Table S class 2 shows an unknown value is never more permissive than
  `'created'`, so an enum check would add a surface without changing an outcome.
- **Ambiguity → choose the simpler option** and record it in the PR body under
  "Decisions made". If a table disagrees with prose anywhere in this spec, **the
  table wins** and the prose is a spec bug — say so in the PR body.

## Security checklist

- [ ] **The manifest is untrusted input and all three new fields are read from
      it.** All three are type-gated by `ENTRY_FIELD_TYPES`, so a non-string
      value is rejected by `validateEntry` **before** the reverser runs — and for
      a symlink a rejected entry means **preserve**, the safe direction.
- [ ] **No new field flows into a filesystem path, a shell command, or an
      argument vector.** `dev`/`ino` are string-compared; `origin` is compared
      against one literal. None is joined, resolved, opened, spawned, or written.
      There is no untrusted-identifier path-traversal surface to anchor.
- [ ] **`linkIdentity` never dereferences** (Implementation notes).
- [ ] **The identity seam is test-only and unreachable from production.**
      `opts = {}` defaults to `linkIdentity`, and `reverse()` passes six
      arguments — a manifest cannot reach it, because `opts` comes from the call
      site, never from the entry. Table U forbids adding an argument at the
      `reverse()` call site.
- [ ] **The new evidence only ever narrows deletion**, proved **exhaustively** by
      Table S over all twenty schema-accepted shapes, not by argument.
- [ ] **The authorship claim is stated at its real strength.** Identity is
      verified before, not atomically with, the unlink (**R7**); it can drift and
      be recycled (**R4**); and where it cannot be recorded the entry keeps base
      behaviour (**R3**). All three are declared and pinned rather than claimed
      closed.

## Acceptance criteria

> **Numbering note (One-Document Rule).** This spec's **AC** series skips 3, 4
> and 5, and its **Table R** skips R2/R2b/R2c: those ids belong to
> `WP-managed-block-insertion-anchor`, the sibling this WP `depends_on`. The
> gaps are deliberate — renumbering would break every cross-reference the two
> specs, the logbook and PR #149 already carry. **Nothing is missing here.**
> The `Table P` rules were originally numbered `P-3`…`P-6` for the same
> reason, but `P-3` collided with a **different** rule of the same id in the
> sibling, so they are renumbered **S-1**…**S-4** (S for symlink).

- [ ] **AC1.** `src/core/manifest.js` exports `linkIdentity`;
      `src/adapters/shared.js:5` imports it **alongside Part A's
      `insertionAnchor`**, which must survive the edit.
- [ ] **AC2b.** `reverseSymlink`'s own JSDoc documents `[opts]` with the exact
      `@param` line D6c mandates. It sits **above** the byte-locked fence, so V4
      cannot see it and **V8b** is what checks it (D6c records why the fence was
      not widened to cover it).
- [ ] **AC2.** The module doc comment and `@typedef ManifestEntry` list `origin?`,
      `dev?` and `ino?` **in addition to** Part A's `anchorBefore?`.
- [ ] **AC6.** Table A2 rows **4a** and **4b** preserve the link in the two
      honest-use cases — a same-source replacement and a pre-existing adoption —
      B-T1, B-T2.
- [ ] **AC7.** Our own untouched link is still **removed**, and so is a legacy
      target-only entry. Uninstall stays complete for every install written before
      this WP — B-T3, B-T4's all-absent row.
- [ ] **AC8a — legacy degradation.** With **ALL** provenance fields absent — the
      exact shape an install predating this WP has — the reverser reproduces base
      behaviour byte for byte and the link is removed. Scoped to the all-absent
      shape on purpose: an honest **adopted** entry also has no identity and must
      be **preserved**.
- [ ] **AC8a′ — the whole accepted shape space.** All twenty cells of **Table S**
      behave as tabulated. B-T4 asserts the four producer-valid shapes and **every**
      semantic class — `dev`-only and `ino`-only as separate rows, **and the
      both-wrong family** (both wrong; `ino` wrong only; `dev` wrong only) with the
      base contrast asserted, since those pin the corruption-only ledger row.
- [ ] **AC8b — narrowing only.** Every cell of Table S is `removed` at base;
      every cell that is `PRESERVED` after this WP is therefore a narrowing, and
      **no cell is a widening**.
- [ ] **AC9.** Each of the **three** producer sites in Table B — `shared.js:439`,
      `:490`, `:496` — records exactly what that table says, no more and no less
      — B-T6, plus B-T2's `origin: 'adopted'` / no-identity assertion.
- [ ] **AC10.** Table F's three assertions are updated and pass; **every other
      test in the repository passes byte-unmodified**, including WP-153's **T1–T3,
      T4a–T4c, T6 and T7** (T4 was split by
      `WP-symlink-lexical-fallback-removal`; T7 is the labelled forged-pair row
      that an earlier revision of this list omitted), the four fenced WP-146
      sync-side tests, and the whole of Part A's
      A-T1…A-T11 and `tests/unit/manifest.test.js`'s WP-147 suites.
- [ ] **AC11.** Running `applySkillLinks` twice is idempotent: deep-equal manifest
      entries and zero `changed` on the second run — B-T3.
- [ ] **AC12.** `npm run lint` passes.

## Verification steps (run these; paste output in the PR)

**Every command below runs from this spec alone.** An earlier revision told the
implementer to copy the guard helper out of Part A's spec, which broke the
One-Document Rule this spec's own Context heading asserts (Codex round 4, finding
3). The helper is inlined here in full. It is **byte-identical to Part A's V0** —
one helper, written twice on purpose, because a *verification command an
implementer cannot execute* is a worse failure than a duplicated 30-line script.

```bash
# V0 — the scoped guard helper (used by V3 and V4). Strips comments, refuses when
#      the function has more than one top-level definition, then matches inside
#      that function's body only.
cat > /tmp/wd-fnguard.js <<'GUARD'
const fs = require('node:fs');
const [file, fn, ...rules] = process.argv.slice(2);
const raw = fs.readFileSync(file, 'utf8');
function stripComments(s) {
  let out = ''; let i = 0; let mode = null;
  while (i < s.length) {
    const c = s[i]; const n = s[i + 1];
    if (mode === null) {
      if (c === '/' && n === '/') { mode = '//'; out += '  '; i += 2; continue; }
      if (c === '/' && n === '*') { mode = '/*'; out += '  '; i += 2; continue; }
      if (c === "'" || c === '"' || c === '`') { mode = c; out += c; i++; continue; }
      out += c; i++; continue;
    }
    if (mode === '//') { if (c === '\n') { mode = null; out += c; } else out += ' '; i++; continue; }
    if (mode === '/*') { if (c === '*' && n === '/') { mode = null; out += '  '; i += 2; } else { out += c === '\n' ? '\n' : ' '; i++; } continue; }
    if (c === '\\') { out += c + (n === undefined ? '' : n); i += 2; continue; }
    if (c === mode) mode = null;
    out += c; i++;
  }
  return out;
}
const s = stripComments(raw);
const decl = `\nfunction ${fn}(`;
const hits = [];
for (let k = s.indexOf(decl); k !== -1; k = s.indexOf(decl, k + 1)) hits.push(k);
if (hits.length === 0) { console.error(`GUARD: no top-level definition of ${fn} in ${file}`); process.exit(1); }
if (hits.length > 1) { console.error(`GUARD: ${hits.length} top-level definitions of ${fn} — the LAST one binds; refusing to guess`); process.exit(1); }
const i = hits[0];
const j = s.indexOf('\nfunction ', i + 1);
const body = j === -1 ? s.slice(i) : s.slice(i, j);
let bad = 0;
for (const r of rules) {
  const want = r[0] === '+'; const pat = r.slice(1); const has = body.includes(pat);
  if (want && !has) { console.error(`MISSING inside ${fn}: ${pat}`); bad = 1; }
  if (!want && has) { console.error(`FORBIDDEN inside ${fn}: ${pat}`); bad = 1; }
}
process.exit(bad);
GUARD
```

```bash
# V1 — the whole suite. Expect zero failures.
npm test

# V2 — targeted.
node tests/run.js tests/unit/manifest.test.js tests/unit/shared-skill-links.test.js

# V3 — Part A's managed-block region is UNTOUCHED by this WP, and WP-144's F30
#      delete-time binding still holds. Scoped to the one function.
node /tmp/wd-fnguard.js src/core/manifest.js reverseManagedBlock \
  "+fs.readFileSync(fd, 'utf8')" \
  "+fs.ftruncateSync(fd, 0)" \
  "+fs.writeSync(fd, buf, 0, buf.length, 0)" \
  "+fs.rmSync(target, { force: true })" \
  "+anchorProvesPosition(entry, candidate, candidate + after)" \
  "-fs.writeFileSync(" \
  "-entry.origin" "-entry.dev" && echo "V3 ok"

# V3 RED — MUST fail against a copy carrying the pre-F30 regression.
cp src/core/manifest.js /tmp/wd-v3-red.js
node -e 'const fs=require("node:fs"),p=process.argv[1];fs.writeFileSync(p,fs.readFileSync(p,"utf8").replace("fs.ftruncateSync(fd, 0);","fs.writeFileSync(entry.path, remaining);"))' /tmp/wd-v3-red.js
node /tmp/wd-fnguard.js /tmp/wd-v3-red.js reverseManagedBlock \
  "+fs.ftruncateSync(fd, 0)" "-fs.writeFileSync(" \
  && { echo "V3 BROKEN: the guard cannot fail"; exit 1; } || echo "V3 ok (red, as required)"

# V4x — the extractor. Prints ONE top-level function verbatim, and REFUSES when
#   the name is defined more than once or is rebound (`reverseSymlink = ...`),
#   so a later shadowing definition cannot slip past a first-match search.
cat > /tmp/wd-fnextract.js <<'EX'
const fs = require('node:fs');
const [file, fn] = process.argv.slice(2);
const s = fs.readFileSync(file, 'utf8');
const defs = [...s.matchAll(new RegExp(`\\nfunction ${fn}\\(`, 'g'))];
if (defs.length === 0) { console.error(`no top-level ${fn} in ${file}`); process.exit(1); }
if (defs.length > 1) { console.error(`${defs.length} definitions of ${fn} — refusing`); process.exit(1); }
const i = defs[0].index;
const j = s.indexOf('\n}\n', i);
if (j < 0) { console.error(`unterminated ${fn}`); process.exit(1); }
const rest = s.replace(s.slice(i, j + 3), '');
for (const [re, what] of [
  // The WHOLE assignment-operator family, not bare `=`: =, +=, -=, *=, /=, %=,
  // **=, <<=, >>=, >>>=, &=, ^=, |=, &&=, ||=, ??=. The lookahead keeps ==, ===
  // and => out. `reverseSymlink &&= unsafe` bypassed the bare-`=` form while the
  // extractor still emitted the original bytes (measured).
  [new RegExp(`(^|[^.\\w])${fn}\\s*(?:>>>|\\*\\*|<<|>>|&&|\\|\\||\\?\\?|[+\\-*/%&|^])?=(?![=>])`, 'm'), 'assignment'],
  [new RegExp(`for\\s*\\(\\s*(?:(?:var|let|const)\\s+)?${fn}\\s+(?:in|of)\\b`, 'm'), 'loop assignment'],
  // Update expressions rebind too: `reverseSymlink++` turns the binding into a
  // number while the exported property keeps the function, so a direct-import
  // test and production resolve DIFFERENT things. Horizontal whitespace only, so
  // an unrelated `count--` on the line above cannot false-positive.
  [new RegExp(`(^|[^.\\w])${fn}[ \\t]*(?:\\+\\+|--)`, 'm'), 'postfix update'],
  [new RegExp(`(?:\\+\\+|--)[ \\t]*${fn}\\b`, 'm'), 'prefix update'],
  [new RegExp(`\\{[^{}]*\\b${fn}\\b[^{}]*\\}\\s*=`, 'm'), 'object destructuring'],
  [new RegExp(`\\[[^\\[\\]]*\\b${fn}\\b[^\\[\\]]*\\]\\s*=`, 'm'), 'array destructuring'],
  [new RegExp(`\\b(var|let|const|function|class)\\s+${fn}\\b`, 'm'), 're-declaration'],
  [new RegExp(`\\bexports\\.${fn}\\s*=`, 'm'), 'export rebinding'],
]) {
  if (re.test(rest)) { console.error(`${fn} is rebound outside its definition (${what}) — refusing`); process.exit(1); }
}
process.stdout.write(s.slice(i + 1, j + 3));
EX

# V4y — pull the EXPECTED function out of THIS SPEC. The Exact-contracts fence is
#   the single source; nothing is transcribed twice.
cat > /tmp/wd-specfence.js <<'SF'
const fs = require('node:fs');
const [spec, marker] = process.argv.slice(2);
const s = fs.readFileSync(spec, 'utf8');
const m = s.indexOf(`<!-- ${marker} -->`);
if (m < 0) { console.error(`marker not found: ${marker}`); process.exit(1); }
const open = s.indexOf('```js', m);
const close = s.indexOf('```', open + 5);
if (open < 0 || close < 0) { console.error('no fenced block after the marker'); process.exit(1); }
process.stdout.write(s.slice(open + 6, close));
SF

# V4 — the implementation must be byte-identical to the spec's expected function.
node /tmp/wd-specfence.js docs/specs/WP-symlink-authorship-identity.md \
  'EXPECTED-FUNCTION: reverseSymlink' > /tmp/wd-expected-symlink.js
node /tmp/wd-fnextract.js src/core/manifest.js reverseSymlink > /tmp/wd-actual-symlink.js
#   POST-IMPLEMENTATION: at base this diff is non-empty by construction (rows
#   4a/4b do not exist yet). It goes green the moment the mandated edits land.
diff -u /tmp/wd-expected-symlink.js /tmp/wd-actual-symlink.js && echo "V4 ok (byte-identical to the spec's expected function)"

# V4 SELF-CHECK — CONSTRUCTION FROM INDEPENDENT SOURCES. Build the expected
#   function from the BASE plus the two mandated snippets, and require it to
#   byte-equal the fence. Nothing here is derived from the artifact under test:
#   the base comes from git, the two edits come from their own marked fences, and
#   the two anchors they replace are located IN THE BASE rather than transcribed.
#   An earlier revision instead sliced the rows out of the candidate fence and
#   removed that span — so a deleting branch smuggled inside the span was treated
#   as mandated and the check stayed green (measured, Codex delta 3).
#
#   SCOPE, stated exactly: this catches any SINGLE-COPY divergence — an addition,
#   a deletion, or a tampering inside the mandated region, in EITHER the fence or
#   the snippets, because the two must construct to each other byte for byte. What
#   it does NOT catch is the same edit applied CONSISTENTLY to both canonical
#   copies; that is an authoring change, visible as a two-place edit in the spec
#   diff, and it is pinned behaviourally downstream by B-T4 (a weakened
#   partial-pair arm reddens B-T4's dev-only/ino-only rows; a delete-authorizing
#   branch reddens its three both-wrong rows).
node /tmp/wd-specfence.js docs/specs/WP-symlink-authorship-identity.md \
  'MANDATED-SIGNATURE: reverseSymlink' > /tmp/wd-mand-sig.js
node /tmp/wd-specfence.js docs/specs/WP-symlink-authorship-identity.md \
  'MANDATED-ROWS: reverseSymlink' > /tmp/wd-mand-rows.js
git show 8515eb1:src/core/manifest.js > /tmp/wd-base-manifest.js
node /tmp/wd-fnextract.js /tmp/wd-base-manifest.js reverseSymlink > /tmp/wd-base-symlink.js
node -e '
const fs = require("node:fs");
const base = fs.readFileSync("/tmp/wd-base-symlink.js", "utf8");
const sig  = fs.readFileSync("/tmp/wd-mand-sig.js", "utf8");
const rows = fs.readFileSync("/tmp/wd-mand-rows.js", "utf8");
// Both anchors are located IN THE BASE, never transcribed here.
const sigOld = base.slice(0, base.indexOf("\n") + 1);
const r5 = base.indexOf("  // Row 5: OWNED");
if (r5 < 0) { console.error("base anchor missing"); process.exit(1); }
const row5 = base.slice(r5, base.indexOf("\n", r5) + 1);
fs.writeFileSync("/tmp/wd-constructed.js",
  base.replace(sigOld, sig).replace(row5, rows + row5));
'
diff -u /tmp/wd-constructed.js /tmp/wd-expected-symlink.js \
  && echo "V4 self-check ok (base + mandated snippets == the fence, byte for byte)"

# V4 RED — MUST fail against the evasion that defeated the previous token guard: a
#   provenance-conditioned link-text delete inserted before row 3, under no
#   `lexicalMatch` identifier, leaving every previously-asserted token intact.
cp src/core/manifest.js /tmp/wd-v4-red.js
node -e 'const fs=require("node:fs"),p=process.argv[1];fs.writeFileSync(p,fs.readFileSync(p,"utf8").replace("  // Row 3: the link must PROVE it still resolves to the source we recorded.","  if (entry.origin === \x27created\x27 && fs.readlinkSync(L) === T) { if (!dryRun) fs.unlinkSync(L); removedSet.add(L); removed.push(L); return; }\n  // Row 3: the link must PROVE it still resolves to the source we recorded."))' /tmp/wd-v4-red.js
node /tmp/wd-fnextract.js /tmp/wd-v4-red.js reverseSymlink > /tmp/wd-actual-red.js
diff -q /tmp/wd-expected-symlink.js /tmp/wd-actual-red.js >/dev/null \
  && { echo "V4 BROKEN: the guard cannot fail"; exit 1; } || echo "V4 ok (red, as required)"

# V4 RED 2 — the SELF-CHECK's own red case, required. Smuggle a deleting branch
#   INSIDE the Row 4a..Row 5 span of a copy of the fence. The previous
#   candidate-derived inverter sliced that span out of the fence itself, so the
#   smuggled branch was removed as if mandated and the check stayed GREEN
#   (measured). Construction from the independent snippets catches it, because the
#   constructed function simply does not contain it.
node /tmp/wd-specfence.js docs/specs/WP-symlink-authorship-identity.md \
  'EXPECTED-FUNCTION: reverseSymlink' > /tmp/wd-fence-span.js
node -e '
const fs = require("node:fs");
const p = "/tmp/wd-fence-span.js";
const s = fs.readFileSync(p, "utf8");
const at = s.indexOf("  // Row 4b: IDENTITY");
if (at < 0) { console.error("row 4b anchor missing"); process.exit(1); }
const inj = "  if (entry.origin === \x27created\x27) {\n    if (!dryRun) fs.unlinkSync(L);\n    removedSet.add(L); removed.push(L); return;\n  }\n";
fs.writeFileSync(p, s.slice(0, at) + inj + s.slice(at));
'
diff -q /tmp/wd-constructed.js /tmp/wd-fence-span.js >/dev/null \
  && { echo "V4 SELF-CHECK BROKEN: a branch inside the mandated span passed"; exit 1; } \
  || echo "V4 self-check ok (red: an inside-span branch is caught)"

# V4z — THE HELPER'S OWN RED/GREEN MATRIX, SHIPPED IN FULL. The extractor above
#   is embedded in TWO specs; a copy that silently loses its regex escapes still
#   *looks* right and refuses nothing. Part A's copy did exactly that — single
#   backslashes inside a JS template literal, so `\s*` became `s*` and `\b` became
#   a backspace, and it accepted every reassignment form while appearing to check
#   them (measured). So the matrix runs against the helper AS EXTRACTED FROM THIS
#   SPEC, every time, and a claim measured against any other copy does not count.
#
#   THE WHOLE MATRIX IS HERE, not described elsewhere. An earlier revision shipped
#   twelve fixtures while its report cited a twenty-seven-form measurement run in
#   a scratch harness — which is the exact gap this step exists to close, one level
#   up. 31 forms must be REFUSED, 13 benign forms and the clean tree must be
#   ACCEPTED.
cat > /tmp/wd-rebind-matrix.js <<'MX'
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { execFileSync } = require('node:child_process');
const FN = 'reverseSymlink';
const clean = fs.readFileSync('src/core/manifest.js', 'utf8');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-mx-'));

// Every form that REBINDS the local binding the production call site resolves.
const REJECT = [
  // the assignment-operator family, one fixture per operator
  'reverseSymlink = unsafe;', 'reverseSymlink += unsafe;', 'reverseSymlink -= unsafe;',
  'reverseSymlink *= unsafe;', 'reverseSymlink /= unsafe;', 'reverseSymlink %= unsafe;',
  'reverseSymlink **= unsafe;', 'reverseSymlink <<= unsafe;', 'reverseSymlink >>= unsafe;',
  'reverseSymlink >>>= unsafe;', 'reverseSymlink &= unsafe;', 'reverseSymlink ^= unsafe;',
  'reverseSymlink |= unsafe;', 'reverseSymlink &&= unsafe;', 'reverseSymlink ||= unsafe;',
  'reverseSymlink ??= unsafe;', 'reverseSymlink=unsafe;',
  // update expressions — these convert the binding to a number while the exported
  // property keeps the original function, so direct-import tests and production
  // resolve DIFFERENT things
  'reverseSymlink++;', '++reverseSymlink;', 'reverseSymlink--;', '--reverseSymlink;',
  // loop assignment targets
  'for (reverseSymlink of [unsafe]) {}', 'for (reverseSymlink in {a:1}) {}',
  'for (const reverseSymlink of [unsafe]) {}',
  // destructuring
  '({ reverseSymlink } = { reverseSymlink: unsafe });', '[reverseSymlink] = [unsafe];',
  // re-declaration
  'const reverseSymlink = unsafe;', 'let reverseSymlink;', 'function reverseSymlink() {}',
  // export rebinding — swaps what the tests import while production keeps the
  // lexical binding, so B-T7/B-T8 would exercise a different function
  'module.exports.reverseSymlink = unsafe;', 'exports.reverseSymlink = unsafe;',
];

// Benign forms that must NOT be flagged — the false-positive suite.
const ACCEPT = [
  'reverseSymlink(entry, dryRun, removed, skipped, removedSet, skillsRoots);',
  'if (reverseSymlink === unsafe) {}', 'if (reverseSymlink !== unsafe) {}',
  'if (reverseSymlink == unsafe) {}', 'if (reverseSymlink != unsafe) {}',
  'if (x <= reverseSymlink) {}', 'if (x >= reverseSymlink) {}',
  'const f = () => reverseSymlink;',
  'module.exports = { load, reverseSymlink, hashDir };',
  'obj.reverseSymlink = unsafe;', 'obj.reverseSymlink++;',
  'thing.exportsXreverseSymlink = unsafe;',
  ' * reverseSymlink lstat+unlinks the LINK ITSELF',
];

let bad = 0, n = 0;
const accepts = (snippet) => {
  const f = path.join(dir, `f${n++}.js`);
  fs.writeFileSync(f, snippet === null ? clean : clean + '\n' + snippet + '\n');
  try { execFileSync('node', ['/tmp/wd-fnextract.js', f, FN], { stdio: 'ignore' }); return true; }
  catch { return false; }
};
for (const s of REJECT) if (accepts(s)) { console.log(`  MATRIX FAIL (accepted): ${s}`); bad++; }
for (const s of ACCEPT) if (!accepts(s)) { console.log(`  MATRIX FAIL (refused):  ${s}`); bad++; }
if (!accepts(null)) { console.log('  MATRIX FAIL: clean tree refused'); bad++; }
fs.rmSync(dir, { recursive: true, force: true });
if (bad) { console.log(`V4z BROKEN (${bad} problem(s))`); process.exit(1); }
console.log(`V4z ok (${REJECT.length} refused, ${ACCEPT.length + 1} accepted)`);
MX
node /tmp/wd-rebind-matrix.js

# V5 — reverse() must NOT pass the test seam; the production call stays 6-arg.
grep -q "reverseSymlink(entry, dryRun, removed, skipped, removedSet, skillsRoots);" src/core/manifest.js || {
  echo "FAIL: the reverse() call site changed — the identity seam must not be passed from production"; exit 1; }
test "$(grep -c 'reverseSymlink(' src/core/manifest.js)" -eq 2 || {
  echo "FAIL: unexpected reverseSymlink( count — expected exactly 2 (the definition and the ONE production call)"; exit 1; }
echo "V5 ok"

# V6 — the schema table, scoped to the ENTRY_FIELD_TYPES object literal:
#      the symlink cell gains three fields; the managed-block cell gains none.
node -e '
const fs=require("node:fs");
const s=fs.readFileSync("src/core/manifest.js","utf8");
const i=s.indexOf("const ENTRY_FIELD_TYPES = {");
const j=s.indexOf("\n};", i);
if(i<0||j<0){console.error("could not isolate ENTRY_FIELD_TYPES");process.exit(1);}
const o=s.slice(i,j);
let bad=0;
if(!o.includes("symlink: { target: '"'"'string'"'"', origin: '"'"'string'"'"', dev: '"'"'string'"'"', ino: '"'"'string'"'"' }")){
  console.error("the symlink cell does not match Table P");bad=1;}
if(!o.includes("'"'"'managed-block'"'"': { createdFile: '"'"'boolean'"'"' }")){
  console.error("the managed-block cell changed — Part A forbids it");bad=1;}
if(o.includes("anchorBefore")){
  console.error("anchorBefore type-gated — Part A forbids it");bad=1;}
process.exit(bad);
' && echo "V6 ok"

# V7 — Part A's import survived this WP's edit.
grep -q "const { hashDir, insertionAnchor, linkIdentity } = require('../core/manifest');" src/adapters/shared.js || {
  echo "FAIL: shared.js:5 does not carry all three imports"; exit 1; }
echo "V7 ok"

# V8 — AC2: the two in-code doc mirrors carry ALL THREE new fields AND still carry
#      Part A's `anchorBefore`. Uses the same helper Part A's V7 writes; it is
#      reproduced here so this spec runs standalone.
#      BASE DIRECTION, restated after PR #154: `anchorBefore` now PASSES at base
#      because Part A shipped it, so the red signal comes from `origin`/`dev`/`ino`
#      alone. Measured at 8515eb1: asserting `anchorBefore` on its own exits 0;
#      asserting `origin dev ino anchorBefore` exits 1 with six MISSING lines, two
#      per absent field. Keep all four names in the assertion — dropping
#      `anchorBefore` would stop guarding Part A's shipped hunk.
cat > /tmp/wd-docfields.js <<'DOCS'
const fs = require('node:fs');
const [file, ...fields] = process.argv.slice(2);
const s = fs.readFileSync(file, 'utf8');
const head = s.slice(0, s.indexOf('const BEGIN_SENTINEL'));
if (!head || head.length === s.length) { console.error('could not isolate the module header'); process.exit(1); }
const shapes = head.slice(0, head.indexOf('@typedef'));
const typedef = head.slice(head.indexOf('@typedef'));
let bad = 0;
for (const f of fields) {
  if (!shapes.includes(f)) { console.error(`AC2: entry-shape doc comment does not mention ${f}`); bad = 1; }
  if (!typedef.includes(f)) { console.error(`AC2: @typedef ManifestEntry does not mention ${f}`); bad = 1; }
}
process.exit(bad);
DOCS
node /tmp/wd-docfields.js src/core/manifest.js origin dev ino anchorBefore && echo "V8 ok"

# V8b — D6c: `opts` must be documented in reverseSymlink's OWN JSDoc, which sits
#       ABOVE the mandated fence and so is invisible to V4. Scope the check to the
#       comment block immediately preceding the definition, so an `@param opts`
#       written anywhere else in the file does not satisfy it.
#       POST-IMPLEMENTATION (red at base — `opts` does not exist yet).
node -e '
const fs=require("node:fs"), L=fs.readFileSync("src/core/manifest.js","utf8").split("\n");
const d=L.findIndex(l=>l.startsWith("function reverseSymlink("));
let a=d-1; while(a>0 && !L[a].includes("/**")) a--;
const doc=L.slice(a,d).join("\n");
if(!/@param\s+\{\{identity\?: *function\}\} \[opts\]/.test(doc)){
  console.error("V8b: reverseSymlink JSDoc does not document [opts]"); process.exit(1);}
console.log("V8b ok");'

# V11 — CITATION SCAN. Resolves every `src/` line number this spec is allowed to
#   cite BY CONTENT, then flags any citation that resolves to nothing. It exists
#   because a HAND sweep has now missed mirrors three times: each pass grepped the
#   vocabulary it remembered (`shared.js:NNN`) and missed the form the spec
#   actually uses most (a bare `` `:NNN` ``). After PR #154 that left `:491`
#   pointing at `out.changed.push(linkPath)` while creation had moved to `:496`.
#   **Re-run this instead of sweeping.** When it fails, fix the citation — or, if
#   the code genuinely moved, fix the anchor and let it re-resolve.
#
#   DIRECTIONALITY — RUN THIS AT BASE, BEFORE YOU WRITE ANY CODE, AND ONLY THERE.
#   V11 runs BACKWARDS from every other gate here. V4's green arm, V7 and V8 are
#   red at base and go green when the work lands. V11 is GREEN AT BASE AND GOES
#   RED WHEN THE WORK LANDS — because it validates this spec's citations against
#   the code, and this spec's Current-state deliberately cites the BASE tree.
#   Growing `reverseSymlink` shifts every coordinate below it in manifest.js.
#   MEASURED, not argued: inserting 40 filler lines into the function body — a
#   conservative stand-in for rows 4a/4b plus the identity helper — turns V11 from
#   `ok` into `V11 BROKEN — 21 citation(s)`, starting with `manifest.js:265` (the
#   function's close, cited at spec line 195). That red is CORRECT and EXPECTED.
#   IMPLEMENTER: run V11 once, at base, paste the green output, and do NOT re-run
#   it after implementing and do NOT "fix" the citations. Re-deriving this spec's
#   src coordinates against the merged tree is the ARCHITECT's post-merge
#   task, deliberately deferred so it happens once against final line numbers
#   instead of N times against a moving branch. (Scale, as the scan reports it
#   today: 48 anchors, 187 citation occurrences.)
cat > /tmp/wd-citescan.js <<'CS'
// V11 — CITATION SCAN. Resolves every src/ line number this spec may cite BY
// CONTENT, per file, and fails on any citation that does not resolve against the
// file it is attributed to.
//
// THREE DESIGN ROUNDS, each closing a demonstrated false negative:
//   r1  exempted historical numbers GLOBALLY, so re-introducing a stale citation
//       anywhere still passed. Exemptions became context-scoped.
//   r2  scanned `:N` and file.js:N but not `// :N` — the fenced-comment form that
//       had survived three hand sweeps. All forms are scanned now.
//   r3  flattened every file's anchors into ONE set, so a citation qualified with
//       the WRONG file passed (manifest.js:216-265 rewritten to
//       shared.js:216-265 exited 0), and a non-source exempt integer could be
//       reused as a src citation (shared.js:5 -> shared.js:10 exited 0). Grouped
//       coordinates (:434/:485/:491) were not parsed at all.
// Validation is now PER FILE, exemptions are per CONTEXT, and an anchor that does
// not resolve exactly once fails the scan rather than silently widening it.
const fs = require('node:fs');
const spec = process.argv[2];
const text = fs.readFileSync(spec, 'utf8');
const LINES = text.split('\n');
const FILES = {
  'manifest.js': 'src/core/manifest.js',
  'shared.js': 'src/adapters/shared.js',
  'uninstall.js': 'src/cli/uninstall.js',
  'sync.js': 'src/cli/sync.js',
};
const SRC = Object.fromEntries(Object.entries(FILES).map(([k, v]) => [k, fs.readFileSync(v, 'utf8').split('\n')]));

let anchorFail = 0;
// Resolve `needle` in `file`. `of` is how many times it is EXPECTED to occur; a
// mismatch is ambiguity and fails the scan.
const A = (file, needle, { nth = 1, of = 1 } = {}) => {
  const hits = [];
  SRC[file].forEach((l, i) => { if (l.includes(needle)) hits.push(i + 1); });
  if (hits.length !== of) {
    console.log(`  ANCHOR AMBIGUOUS: ${file} "${needle.slice(0, 46)}" found ${hits.length}x, expected ${of}`);
    anchorFail++;
    return -1;
  }
  return hits[nth - 1];
};
const closeOf = (file, start) => { for (let i = start; i < SRC[file].length; i++) if (SRC[file][i] === '}') return i + 1; return -1; };

const rsDef = A('manifest.js', 'function reverseSymlink(');
const roDef = A('shared.js', 'function recordOnce(');
const P = (nth) => A('shared.js', "kind: 'symlink', path: linkPath, target", { nth, of: 3 });

const ANCHORS = [
  ['manifest.js', 'reverseSymlink definition', rsDef],
  ['manifest.js', 'reverseSymlink close', closeOf('manifest.js', rsDef)],
  ['manifest.js', 'reverseSymlink JSDoc open', A('manifest.js', "* Reverse a 'symlink' entry") - 1],
  ['manifest.js', 'reverseSymlink JSDoc close', rsDef - 1],
  ['manifest.js', 'row-3 comment head', A('manifest.js', '// Row 3: the link must PROVE')],
  ['manifest.js', 'row-3 comment block start', A('manifest.js', '// sameResolvedDir is realpath-based')],
  ['manifest.js', 'row-3 comment tail', A('manifest.js', 'Strictly narrowing: every input this now preserves')],
  ['manifest.js', 'isSymlink open', A('manifest.js', 'function isSymlink(')],
  ['manifest.js', 'isSymlink close', closeOf('manifest.js', A('manifest.js', 'function isSymlink('))],
  ['manifest.js', 'sameResolvedDir open', A('manifest.js', 'function sameResolvedDir(')],
  ['manifest.js', 'sameResolvedDir close', closeOf('manifest.js', A('manifest.js', 'function sameResolvedDir('))],
  ['manifest.js', 'reverseCopiedSkill hash arm', A('manifest.js', "typeof entry.hash !== 'string' || hashDir(")],
  ['manifest.js', 'reverseCopiedSkill hash arm end', A('manifest.js', "typeof entry.hash !== 'string' || hashDir(") + 3],
  ['manifest.js', 'skillsRoots', A('manifest.js', 'const skillsRoots = [')],
  ['manifest.js', 'reverse() symlink arm', A('manifest.js', "} else if (entry.kind === 'symlink') {")],
  ['manifest.js', 'F30 comment in that arm', A('manifest.js', '// F30: validate the canonical PARENT')],
  ['manifest.js', 'reverseSymlink call site', A('manifest.js', 'reverseSymlink(entry, dryRun, removed, skipped, removedSet, skillsRoots);')],
  ['manifest.js', 'module doc: symlink shape', A('manifest.js', "{kind:'symlink', path, target?}", { nth: 1, of: 2 })],
  ['manifest.js', 'module doc: managed-block shape', A('manifest.js', "{kind:'managed-block', path, createdFile:bool,")],
  ['manifest.js', 'module doc: managed-block shape end', A('manifest.js', 'content that preceded them')],
  ['manifest.js', '@typedef open', A('manifest.js', '@typedef {{kind: string')],
  ['manifest.js', '@typedef close', A('manifest.js', 'sepAfter?: string, anchorBefore?: string}} ManifestEntry')],
  ['manifest.js', 'BEGIN_SENTINEL (V8/AC2 header slice point)', A('manifest.js', 'const BEGIN_SENTINEL = ')],
  ['manifest.js', 'ENTRY_FIELD_TYPES', A('manifest.js', 'const ENTRY_FIELD_TYPES = {')],
  ['manifest.js', 'validateEntry open', A('manifest.js', 'function validateEntry(')],
  ['manifest.js', 'validateEntry close', closeOf('manifest.js', A('manifest.js', 'function validateEntry('))],
  ['manifest.js', 'pre-dispatch validate skip', A('manifest.js', 'const shape = validateEntry(entry);')],
  ['manifest.js', 'pre-dispatch skip end', A('manifest.js', 'const shape = validateEntry(entry);') + 6],
  ['manifest.js', 'reverseSchedulerEntry', A('manifest.js', 'function reverseSchedulerEntry(')],
  ['manifest.js', 'reverseSchedulerEntry JSDoc tail', A('manifest.js', 'function reverseSchedulerEntry(') - 2],
  ['manifest.js', 'module.exports', A('manifest.js', 'module.exports = {')],
  ['shared.js', 'core import', A('shared.js', "require('../core/manifest')")],
  ['shared.js', 'recordOnce open', roDef],
  ['shared.js', 'recordOnce close', closeOf('shared.js', roDef)],
  ['shared.js', 'recordOnce exists-check', A('shared.js', 'const exists = manifest.entries.some(')],
  ['shared.js', 'recordOnce push line', A('shared.js', 'if (!exists) manifest.entries.push(entry);')],
  ['shared.js', 'loop head: target', A('shared.js', 'const target = path.join(skillsDir, name);')],
  ['shared.js', 'loop head: linkPath', A('shared.js', 'const linkPath = path.join(targetSkillsDir, name);')],
  ['shared.js', 'producer: adopt', P(1)],
  ['shared.js', 'producer: dryRun', P(2)],
  ['shared.js', 'producer: create', P(3)],
  ['shared.js', 'symlink() call', A('shared.js', 'symlink(target, linkPath);')],
  ['shared.js', 'WP-146 preserve arm open', A('shared.js', '// A wienerdog-* symlink whose target is NOT our core skill source') - 1],
  ['shared.js', 'WP-146 preserve arm close', A('shared.js', 'left foreign symlink untouched') + 2],
  ['shared.js', 'prose mention of reverseSymlink', A('shared.js', 'reverseSymlink (which unlinks any symlink')],
  ['uninstall.js', 'manifest refusal', A('uninstall.js', 'if (!fileExists(paths.manifest)) {')],
  ['uninstall.js', 'manifest refusal close', A('uninstall.js', 'if (!fileExists(paths.manifest)) {') + 4],
  ['sync.js', 'save gated on !dryRun', A('sync.js', 'if (!dryRun) manifestMod.save(paths, manifest)')],
];

// PER-FILE valid sets. A citation qualified with a file is checked ONLY here.
const valid = {};
for (const [f, , ln] of ANCHORS) (valid[f] ||= new Set()).add(ln);
const anyValid = new Set(Object.values(valid).flatMap((s) => [...s]));

// Context, not integers. A citation is exempt only when its own neighbourhood
// says what it is: a record that a number MOVED, or a pointer into a test file
// or another spec.
const HISTORICAL = /→|->|went stale|moved from|until PR|After PR|it was `|rewritten to|false negative|re-parsed|re-opened/;
// The scan's OWN scaffolding quotes stale coordinates on purpose — the four red
// controls are built from them. Exempt the scaffolding, or the gate fails on the
// fixtures that prove it works.
const SCAFFOLD = /wd-c\.md|wd-citescan|V11 CONTROL/;
// This scan is EMBEDDED IN THE SPEC IT SCANS. Its own source quotes stale
// coordinates on purpose (the falsification record, the red-control fixtures), so
// the heredoc that carries it is skipped wholesale. Regex-matching its comment
// lines one by one was tried and is whack-a-mole.
const SELF = (() => {
  const a = LINES.findIndex((l) => l.includes("cat > /tmp/wd-citescan.js <<'CS'"));
  if (a < 0) return () => false;
  const b = LINES.findIndex((l, i) => i > a && l === 'CS');
  return (i) => i > a && i < b;
})();
const NON_SOURCE = /\.test\.js|tests\/unit|docs\/specs|WP-153|WP-147|shared-skill-links|manifest\.test/;
// 8 lines back: a table's preamble names its file that far above its rows
// (Table F does, at 4). Wider than the citation's own line, tight enough that
// naming a file still means the neighbourhood is about that file.
const ctx = (i) => LINES.slice(Math.max(0, i - 8), i + 1).join('\n');

let bad = 0, checked = 0, unbound = 0, grouped = 0;
const fails = [];
// FOUR forms. The grouped one is last and consumes the whole run.
// FIVE forms. The QUALIFIED SLASH-GROUP must come first and consume the whole
// run: matching `shared.js:439` first left `:216/:496` behind as an UNQUALIFIED
// group, which was union-checked — so `shared.js:439/:216/:496` passed because
// 216 is a manifest.js anchor. That recreated the cross-file false negative for
// grouped syntax (measured). A filename qualifies EVERY coordinate in its run.
const RE = new RegExp([
  String.raw`(?<qgfile>manifest|shared|uninstall|sync)\.js:(?<qgroup>\d+(?:\/:\d+)+)`,
  String.raw`(?<qfile>manifest|shared|uninstall|sync)\.js:(?<qa>\d+)(?:-(?<qb>\d+))?`,
  String.raw`\`:(?<ba>\d+)(?:-(?<bb>\d+))?\``,
  String.raw`\/\/\s*:(?<cc>\d+)`,
  String.raw`(?<ugroup>:\d+(?:\/:\d+)+)`,
].join('|'), 'g');
for (const m of text.matchAll(RE)) {
  const idx = text.slice(0, m.index).split('\n').length - 1;
  const c = ctx(idx);
  const g = m.groups;
  let file = null, nums;
  if (g.qgfile) { file = g.qgfile + '.js'; nums = g.qgroup.match(/\d+/g).map(Number); grouped++; }
  else if (g.qfile) { file = g.qfile + '.js'; nums = [g.qa, g.qb].filter(Boolean).map(Number); }
  else if (g.ugroup) { nums = g.ugroup.match(/\d+/g).map(Number); grouped++; }
  else nums = [g.ba, g.bb, g.cc].filter(Boolean).map(Number);
  // Unqualified citations are NOT bound by proximity. Guessing the file from the
  // neighbourhood was tried and mis-binds: the dry-run producer comment mentions
  // sync.js:340 on its own line, so `// :490` bound to sync.js and failed
  // spuriously. They are checked against the union instead, and the count is
  // reported so the residual is visible rather than implied.
  for (const n of nums) {
    checked++;
    if (SELF(idx)) continue;
    if (HISTORICAL.test(LINES[idx]) || SCAFFOLD.test(LINES[idx])) continue;
    // A citation QUALIFIED with a src filename is a src citation by
    // construction — the non-source exemption must not reach it.
    if (!file && NON_SOURCE.test(c)) continue;
    if (file && valid[file]) { if (valid[file].has(n)) continue; }
    else { unbound++; if (anyValid.has(n)) continue; }
    bad++;
    fails.push(`  UNRESOLVED ${file || '(unqualified)'}:${n}  at spec line ${idx + 1}`);
  }
}
console.log(`  anchors resolved: ${ANCHORS.length}   citations checked: ${checked}   grouped runs: ${grouped}   unbound: ${unbound}`);
for (const f of fails) console.log(f);
if (anchorFail) console.log(`  ${anchorFail} anchor(s) failed to resolve unambiguously`);
if (bad || anchorFail) { console.log(`V11 BROKEN — ${bad} citation(s) + ${anchorFail} anchor(s)`); process.exit(1); }
console.log('V11 ok (every src/ citation resolves, per file, to a content-anchored line)');
CS
node /tmp/wd-citescan.js docs/specs/WP-symlink-authorship-identity.md

# V11 RED CONTROLS — four, permanent. Each is a false negative a previous version
#   of this scan demonstrably had. A gate that has been redesigned three times
#   ships its falsification record as executable fixtures, not as prose.
for c in cross-file exempt-reuse grouped qualified-group fenced-comment; do
  cp docs/specs/WP-symlink-authorship-identity.md /tmp/wd-c.md
  case $c in
    cross-file)      # a citation qualified with the WRONG file
      node -e 'const f=require("node:fs"),p="/tmp/wd-c.md";f.writeFileSync(p,f.readFileSync(p,"utf8").replace("src/core/manifest.js:216-265","src/adapters/shared.js:216-265"))' ;;
    exempt-reuse)    # a src citation reusing a number that is exempt elsewhere
      node -e 'const f=require("node:fs"),p="/tmp/wd-c.md";f.writeFileSync(p,f.readFileSync(p,"utf8").replace("shared.js:5","shared.js:10"))' ;;
    grouped)         # a stale coordinate inside a slash-grouped run, operative context
      node -e 'const f=require("node:fs"),p="/tmp/wd-c.md";f.writeFileSync(p,f.readFileSync(p,"utf8").replace("`shared.js:439`,\n      `:490`, `:496`","`:439/:490/:491`"))' ;;
    qualified-group) # a FILENAME-qualified slash run whose TAIL names another
                     # file's anchor — the tails used to be parsed as a separate
                     # unqualified group and union-checked
      node -e 'const f=require("node:fs"),p="/tmp/wd-c.md";f.writeFileSync(p,f.readFileSync(p,"utf8").replace("`shared.js:439`","`shared.js:439/:216/:496`"))' ;;
    fenced-comment)  # a stale `// :NNN` inside a code fence
      node -e 'const f=require("node:fs"),p="/tmp/wd-c.md";f.writeFileSync(p,f.readFileSync(p,"utf8").replace("// :490  dryRun","// :485  dryRun"))' ;;
  esac
  node /tmp/wd-citescan.js /tmp/wd-c.md >/dev/null 2>&1 \
    && { echo "V11 CONTROL BROKEN: $c was not caught"; exit 1; } || echo "  control ok: $c caught"
done
echo "V11 controls ok (5 false negatives all reproduce as failures)"

# V9 — lint.
npm run lint
```

**Measured at `9188a1c`** (i.e. **before** either part
landed, so the "must be present" checks for new code are post-implementation by
construction): V3's and V4's **red** runs both exit 1, and **V4's red arm catches
the evasion that defeated the previous token guard** — a provenance-conditioned
link-text delete under no `lexicalMatch` identifier. **V4's GREEN arm is
post-implementation** and shows a diff at base, because rows 4a/4b do not exist
yet; it was proved green against a scratch implementation built from the same
reconstruction. **V5's `grep -c 'reverseSymlink(' src/core/manifest.js`
is `2` today and must stay `2`** — the definition and the one production call.
Do not confuse that with the **five** *unparenthesized* textual occurrences of
`reverseSymlink` across `src/` (Current state §2), which include the comment above
the call, the `module.exports` line and a prose mention in `shared.js:446`.
**V11 is the one gate that runs backwards** — green at base, red once the
function grows (measured: 21 unresolved citations against a 40-line growth
simulation). Run it at base only; its header comment is the canonical statement
of that and of why the citation re-derivation is deferred to post-merge.
**The guards are tripwires; V1 and V2 are the load-bearing checks** —
they are not AST-aware and cannot tell reachable code from code after a `return`
(**R8**, routed to `WP-grep-gate-helper`).

## Out of scope (do NOT do these)

- **Everything in Part A** — `reverseManagedBlock`, `applyManagedBlock`,
  `recordManagedBlock`, `insertionAnchor`, `anchorProvesPosition`, and
  `anchorBefore` on the doc comment and typedef. Part A lands first; do not
  re-edit its hunks except to **extend** the three shared ones.
- **Manifest integrity (signing/HMAC).** Declared out of scope by Table N.
- **Touching row 3 at all.** `WP-symlink-lexical-fallback-removal` (PR #151)
  settled it on 2026-08-02: one semantic proof, no link-text comparison. V4
  asserts both halves of that.
- **Backfilling `origin`/`dev`/`ino` onto existing entries**, or replacing
  `recordOnce` with an upsert. Owner-declined 2026-08-01; S-3 inherits it.
- **A birth-time / generation field.** Rejected with reasons (Implementation
  notes); if wanted, it is its own WP with a platform survey.
- **Passing the identity seam from `reverse()`.** It is for tests only.
- **Any other reverser** — `reverseSettingsEntry`, `reverseCopiedSkill`,
  `reverseVendoredTree`, `reverseSchedulerEntry`. `reverseCopiedSkill` carries the
  structurally identical authorship gap (its `hash` is read from the same
  untrusted file) and is **not** fixed here; it is a `copied-skill`, the
  `EPERM`/`EACCES` fallback shape, not the mainline (**R6**).
- **Editing `docs/specs/done/WP-153-…`** to repoint its four routing mentions
  from the retired consolidated slug to this file. A `Done` spec describes the
  code it shipped; the logbook entry is the bridge.
- **`docs/GLOSSARY.md`.**

## Owner ruling — ONE decision over the WHOLE symlink-identity mechanism

**This spec does not move to `Ready` without a recorded owner ruling.** **Part A
carries its own, independent ledger** — Codex round 4 finding 2 overturned that
spec's no-ruling claim. Two specs, two ledgers, **one decision list**; neither
waits on the other's ruling.

**Why an owner and not the architect.** WP-153's legacy ruling (*"fine to have
installs predating the WP have uninstall leave all skill symlinks behind"*) is the
same shape of cost — leftover skill symlinks after uninstall — and it was
**gated**: its gate round 1 rejected a revision that reached the answer by
argument, on the grounds that *"an architect reaching an owner's answer is not the
owner answering."* The 2026-08-02 flags were FYI-only **because they were
equal-or-stronger than shipped**. This mechanism is not: it is stronger on safety
and **weaker on completeness**, which is the gated register.

### The complete cost ledger (canonical for the ruling)

**Two kinds of thing were conflated through round 5, and separating them lowers
4b's stated price** (Codex round 6, finding 2). A **completeness cost** is a case
where this WP **preserves a link base would have removed** — a genuine regression
against shipped behaviour, and the only thing the owner is being asked to accept.
A **residual limit on the benefit** is a case where this WP **removes a link base
also removes** — no regression at all, just a bound on how much safety the
mechanism buys. Only the first kind belongs in a cost table.

**Reclassified out of the cost ledger — equal to base, therefore NOT costs:**

| Item | What happens | vs base | Where it lives now |
|------|--------------|---------|--------------------|
| **4b's recycling arm** | an inode reallocated to a user's replacement at the same path with the same target passes 4b, and the link is removed | base removes it too, unconditionally and without any check | **R4**'s recycling half — a limit on how much of honest-use case 1 closes, pinned by **B-T7(d)** |
| **the verify→unlink race** | a replacement landing between the identity check and the unlink is removed | base removes it too, with no race required | **R7** — pinned by **B-T8**, and it is why case 1 is described as *narrowed*, not closed |

Neither can make an install worse off than shipped, so **neither is something to
ratify**. They remain fully declared and pinned in Table R; they are simply not
prices.

**The actual completeness costs — every row here preserves a link base removes:**

| Row | What it buys | What it costs | How narrow the cost is | Pinned by |
|-----|--------------|---------------|------------------------|-----------|
| **4a** (adopted ⇒ preserve) | narrows honest-use **case 2**: a link the user created before we synced is no longer deleted | a link **we** created is left behind when its manifest entry was lost and a later `sync` re-adopted it | `recordOnce` no-ops when an entry exists (`shared.js:50-51`), so an ordinary re-sync never re-records; and `uninstall` refuses outright without a manifest (`src/cli/uninstall.js:43-47`). It needs: manifest deleted or reset → reinstall → sync → uninstall | B-T2 |
| **4b** (identity must match) | narrows honest-use **case 1**: a user's same-source replacement is no longer deleted | **durability drift** — a backup/restore, volume remount, home migration, container rebuild or network filesystem changes `dev`/`ino` for a link nobody touched, which is then **left behind** where base removed it. **This row prices the HONEST-reachable half only**; a pair that was never correct is the corruption-only row below (Codex round 7) | the fail-closed direction; never loses data | B-T7 (a)–(c) |
| **the partial-pair leftover** (new in round 3) | nothing — it is the fail-closed reading of a shape no branch writes | an entry carrying **exactly one** of `dev`/`ino` **preserves** a link base would delete | **not reachable from any producer site** (Table S) — it needs a hand-edited or corrupted manifest. It is a cost the ledger owes the owner because the ledger claims to be complete, not because a user will hit it | B-T4's two partial rows |
| **a schema-valid WRONG identity pair** (new in round 7) | nothing — it is the same fail-closed arm as 4b, reached by a manifest that was never correct rather than by the world changing | an entry whose `dev`/`ino` are both strings but **do not match the live link** — including the case where only one of the two is wrong — **preserves** a link base removes | **corruption- or forgery-only**: no producer site can emit a wrong pair, and an honest pair that *becomes* wrong is 4b's durability row instead. Measured, base vs this WP, on three variants (both wrong; `ino` wrong only; `dev` wrong only): base **removes** all three, this WP **preserves** all three; both controls (honest pair, no fields at all) are **removed** by both | **B-T4**'s both-wrong case, which asserts the base contrast |
| **D5's schema rejection** (new in round 5) | a non-string forgery is stopped **upstream** of the reverser, so the reverser never has to defend against one | a **non-string** `origin`, `dev` or `ino` makes `validateEntry` reject the whole entry, so `reverse()` skips it and the link is **preserved** — where base **removed** it, because base's `symlink: {}` cell type-gated none of these keys | **only reachable from a hand-edited or corrupted manifest** — no producer site writes a non-string. But it is a **direct consequence of D5**, so it is present in **every disposition that keeps the schema cell**, including ones that read none of the fields | **B-T5** |

**No row is ever worse than shipped `0f9ee08` on SAFETY** — base unlinks any
recorded-path symlink with no ownership test at all, so every row here only ever
preserves more (Table S, exhaustively). **The cost is completeness only**, which
is precisely the axis WP-153's ruling spoke to.

### The five dispositions, so the ruling is a choice and not an essay

Ordered by how much of the residual narrows; all are safety-wise
equal-or-stronger than shipped.

**Every disposition below that keeps `D5` also keeps the schema-rejection cost.**
Rounds 3–4 wrote (iii) as *"the adopt-leftover only"* and (iv) as *"none"*, and
**both were false** for exactly that reason (Codex round 5, finding 2). The
`Keeps D5?` column is now explicit, and a disposition that genuinely wants zero
completeness cost must **also drop the type gates** — which is disposition (v).

**The `Completeness cost` column lists ONLY preservation regressions** — cases
where uninstall leaves a link base removes. Equal-to-base deletions (recycling,
the race) are **not** listed there; they are limits on the benefit and appear in
the `Case 1` column's qualifier instead.

| | Disposition | Keeps `D5`? | Case 1 | Case 2 | Completeness cost (preservation regressions only) |
|---|---|---|---|---|---|
| **(i) ✅ SELECTED** | **Ship rows 4a AND 4b** (this spec's shape) — **owner-ruled 2026-08-02** | yes | **narrowed** — bounded by recycling (R4) and the race (R7), both equal-to-base | **narrowed** | 4a's adopt-leftover, **4b's durability drift**, the **schema-valid wrong-pair** row, the partial-pair row, D5's schema rejection |
| (ii) *declined* | **Ship 4b only**; record `origin` but leave it unread | yes | **narrowed** — same two bounds | stays open | **4b's durability drift**, the **schema-valid wrong-pair** row, the partial-pair row, D5's schema rejection |
| (iii) *declined* | **Ship 4a only**; record `dev`/`ino` but leave them unread | yes | stays open | **narrowed** | the adopt-leftover **and D5's schema rejection** |
| (iv) *declined* | Ship neither; record all three fields, read none | yes | stays open | stays open | **D5's schema rejection** — *not* "none". And the WP then closes nothing, so it should not ship |
| (v) *declined* | Ship neither **and drop the type gates** — `symlink: { target: 'string' }` stays as WP-153 shipped it; the producer fields are still **recorded** (D10) but nothing reads or validates them | **no** | stays open | stays open | **none — uninstall behaves byte-for-byte as base.** The *manifest* still differs from base, because D10 keeps writing `origin`/`dev`/`ino`; they are inert, ignored by `validateEntry` as unknown keys, and reversible only by dropping D10 as well |

**Architect's recommendation was (i), and the owner ruled (i)** on 2026-08-02.
The ground below was offered as a *preference this WP proposes*, not an
established rule — it is kept because the ruling was made against it. Stated precisely, because round 4 replaced a
misattributed ADR quote with an equally unsupported universal claim (Codex round
5, finding 4):

- **What is true.** Several shipped reverser arms **do** fail closed on an
  unprovable ownership proof, and they are the arms this WP extends:
  `reverseCopiedSkill`'s hash arm (`manifest.js:588-591` —
  `if (typeof entry.hash !== 'string' || hashDir(entry.path) !== entry.hash)`, so a
  non-string **or** mismatching `hash` preserves), WP-153's Table A **row 2** (a target-less entry
  preserves) and **row 4** (`OWNED(L)` false preserves), WP-144's
  `withinAllowedRoot` arm (out-of-bounds preserves), and WP-147's `noFusion`
  (a strip that would fuse user lines is withheld).
- **What is NOT true, and round 4's wording implied it.** *"Every shipped
  reverser preserves what it cannot prove it created"* is false, and this spec's
  own premises are the counterexamples: **shipped WP-153 deletes a user's
  same-source replacement** on target equality alone — that is honest-use case 1,
  the thing this WP exists to narrow — and **shipped WP-147 strips separators
  without any position proof**, which is what Part A exists to fix. A rule with
  two counterexamples inside the very specs citing it is not a convention; it is
  the direction of travel.
- **So the recommendation rests on a judgement, offered as one:** a leftover
  symlink in the user's own skills directory is a smaller harm than deleting a
  file the user made, and the costs above are bounded and mostly
  forgery-reachable only. **That is the architect's preference. It is not
  precedent, and it does not settle the ruling.**

**(ii) and (iii) are both legitimate** and either would let this WP ship against a
narrower claim; **(iv) is only coherent if this WP is dropped**, since recording
fields nothing reads is dead data by CLAUDE.md's own rule; **(v) is the only
disposition with genuinely zero completeness cost**, and it is the honest floor
if the owner wants base behaviour preserved exactly.

**Whichever is chosen, the same surfaces move in the same pass** — this spec's
title and scope blockquote, Table A2, Table S, the Table B rows for any site that
stops recording, AC6, AC7, AC8a′, AC8b, B-T2/B-T4/B-T5/B-T7/B-T8, and Table R rows
R4/R5/R7. **And if the ruling is (v), these move too**: deliverable **D5**, the
type-gating column of **Table P**, **Table N**'s non-string row, the
schema-rejection ledger row above, and **B-T5**, whose whole subject is the gates.

**Table S does NOT move when only the gates are dropped, and the reason is worth
stating so nobody re-derives it wrongly** (I did, in the first draft of this
paragraph): **all twenty of its cells are string-valued or absent**, so the type
gates never fire on any of them — Table S is governed entirely by rows 4a/4b.
Dropping the gates changes exactly the **three non-string shapes in B-T5**, from
preserved back to removed. Table S moves only if rows 4a/4b are also dropped,
which is what (v) does *in addition*.

They are registered in the Mirrored Surface Checklist for exactly this reason.
**The ruling is recorded in this spec's header blockquote; implement arm (i).**

## Declared residuals after this WP (Table R — canonical)

| # | Residual | Bound | Pinned by | Routed |
|---|----------|-------|-----------|--------|
| **R1** | **Manifest forgery.** An attacker who can rewrite the manifest deletes the fields and gets base behaviour | WP-153's row-4 `OWNED(L)` gate: the `wienerdog-` namespace in the two directories the user gave us | Table S's `absent`/`none` column; B-T5 | manifest integrity — **declined by declaration**, not routed |
| **R3** | **No stable `(dev, ino)` on some platform.** Where `linkIdentity` returns `null` at creation time, no identity is recorded and WP-153's residual persists on that platform | the WP-153 residual, unchanged | B-T4's `'created'`+no-identity row covers the *reverse* arm. **The forward arm has no test** — it needs a platform reporting a zero `dev`/`ino`, which this repo's CI does not have | a Windows-runner probe, if one is ever wanted; not routed today |
| **R4** | **Identity drift and recycling.** `(dev, ino)` is durable but not permanent | drift is fail-closed and never loses data; recycling needs the exact inode at the exact path **plus** the user re-pointing it at our source, and is still equal-or-stronger than base | **B-T7**, all four arms deterministic through the identity seam | **split across the two ledger sections**: the *drift* half is a real completeness cost (ledger row 4b); the *recycling* half is equal to base and is listed under *reclassified — equal to base*, not as a price. A birth-time field was considered and rejected |
| **R5** | **Adopted-link leftover** — row 4a's half of the ledger | one symlink per core skill, in the harness skills dir, only after a manifest-loss reinstall | B-T2 pins the *behaviour*; the *cost* is what the owner rules on | **blocked on the owner ruling** |
| **R6** | **`reverseCopiedSkill` has the same authorship gap** — its `hash` is read from the same untrusted file and proves content, not authorship | out of scope here; a `copied-skill` is the `EPERM`/`EACCES` fallback shape, not the mainline | none | a future WP, not drafted |
| **R7** | **The verify→unlink race.** Row 4b's `identityOf(L)` and row 5's `fs.unlinkSync(L)` are separate syscalls | needs **arbitrary same-user native code** — outside the threat model per `docs/THREAT-MODEL.md`'s A12 posture — and such an actor can delete the link directly. **Only ever narrows against base** | **B-T8** | **not routed and not claimed closed.** Node exposes no atomic compare-and-unlink; ADR-0028's disposition for the scheduler's reopen-based check. **Listed in the ledger under *reclassified — equal to base*, deliberately NOT as a cost** — base removes the same replacement with no race required |

**R11 — V11's own falsification record, kept because it took three rounds.** The
citation scan closed a class the hand sweeps could not, and it was wrong three
times first; each version was defeated by a *measured* case, not an argued one:

| round | the false negative | closed by |
|---|---|---|
| 1 | historical numbers exempted **by integer**, so re-introducing a stale citation anywhere passed | exemption became **context**-scoped |
| 2 | `` `:N` `` and `file.js:N` scanned, `// :N` inside a fence not — the one form that had survived three hand sweeps | all forms scanned |
| 3 | every file's anchors flattened into **one** set, so `manifest.js:216-265` rewritten to `shared.js:216-265` passed, and an exempt test-file integer could be reused as a src citation | **per-file** validation; qualified citations never take the non-source exemption |
| 4 | a filename-qualified slash run had its **tail** re-parsed as a separate unqualified group, so `shared.js:439/:216/:496` passed — 216 is a `manifest.js` anchor. The same cross-file hole, re-opened by grouped syntax | the qualified slash-run is matched **first** and consumes the whole run; the filename qualifies **every** coordinate in it |

Two further defects surfaced while fixing round 3, both invisible to inspection
and caught only by running the controls: the per-file map was keyed `'shared.js'`
while the parser produced `'shared'`, so **per-file validation silently fell back
to the global set and was never active**; and binding an unqualified citation to
the nearest filename in its neighbourhood mis-bound `// :490` to `sync.js`,
because that comment names `sync.js:340` on its own line.

**All six slash-groups in this spec today are UNQUALIFIED** (they sit in drift
records and in the scan's own scaffolding), so round 4's hole was latent rather
than live — the control makes it stay closed if a qualified group is ever written.

**Residual, declared:** an **unqualified** citation (`` `:N` ``, `// :N`, or an
unqualified slash run) is
checked against the union of all anchors, so one whose number collides with a
different file's anchor is not caught. Qualified citations are exact. The scan
reports its unqualified count every run so the exposure is visible rather than
implied.

| **R8** | **The source guards are not AST-aware.** They strip comments and reject duplicate definitions, but cannot tell reachable code from code after a `return` | the guards are **tripwires**; V1/V2 are the load-bearing checks | the red mutations in Verification steps | **`WP-grep-gate-helper`** — already routed by WP-147; this spec does not re-route it |
| **R9** | **The partial-pair leftover** — see the ledger row of the same name | not reachable from any producer site | B-T4's two partial rows | a ledger cost |
| **R10** | **A schema-valid wrong identity pair.** An entry whose `dev`/`ino` are both strings but do not match the live link — including one-of-two wrong — **preserves** a link base removes | corruption- or forgery-only; an honest pair that *becomes* wrong is 4b's durability row instead. Measured: base removes all three variants, this WP preserves all three | B-T4's three both-wrong rows, which assert the base contrast | a ledger cost |

**R8 — the source guards are regex, not AST — updated 2026-08-03.** The rebinding
guard now covers the full assignment-operator family, **prefix and postfix update
expressions**, both loop-target forms, both destructuring forms, re-declaration
and `exports.` writes — **31 forms, each with a permanent V4z fixture, plus a
13-form false-positive suite**, all shipped in the step itself rather than
described in a report. **The residual is novel syntax outside the fixture set**:
regexes enumerate forms, an AST enumerates the language. This is the **sixth**
instance of the same class in this repo, and every one has been closed by adding
another pattern after a reviewer found the gap — which is the argument, not an
anecdote. Routed to **`WP-grep-gate-helper`** (already open, opened by WP-147 as
its fourth instance). A devDependency-free verification script cannot parse JS
itself, so regex-with-exhaustive-fixtures is the available path until that helper
lands; V1/V2 remain the load-bearing behavioural checks.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body — **V3's
   and both of V4's red runs included**.
2. Branch `wp/symlink-authorship-identity`; conventional commits; PR titled
   `fix(uninstall): prove a skill symlink's authorship before unlinking it (WP-symlink-authorship-identity)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
5. **`WP-managed-block-insertion-anchor` is `Done`** — merged as PR #154
   (`336e67b`) and filed in `docs/specs/done/` by PR #155 (`8515eb1`). **This
   precondition is SATISFIED**, and the post-Part-A anchor re-verification it
   required was carried out in the dispatch-time reconciliation pass recorded in
   this spec's provenance block. Nothing here waits on Part A any longer.
6. **The owner ruling above is recorded here.** This spec does not move to
   `Ready` without it, and no implementer starts without `Ready`.

> **Commit shape — this spec imposes NO commit-count rule, checked rather than
> assumed.** The one-commit lockstep gate is **V3d of
> `WP-symlink-lexical-fallback-removal`**, which counts commits touching *that*
> WP's four-path set (`src/core/manifest.js`, `tests/unit/manifest.test.js`, and
> its two spec files) on *that* branch. It is not part of this spec and does not
> govern this WP's PR: `grep -niE "one commit|single commit|lockstep|V3d"` over
> this file returns only the two **fence/snippet byte-lockstep** mentions, which
> are about Table B's two canonical copies, not about git. **So the amended B-T1
> may land as a second commit on the open PR** — no rebuild, no force-push, no
> licence needed. Stated here because the question was asked once and should not
> need re-deriving.

---

> **Provenance.** Part B of the split of the consolidated
> `WP-forward-time-ownership-provenance`, which was drafted 2026-08-02, taken
> through **three Codex design-gate rounds** (11 findings, 3 high), and split at
> its own pre-cut line rather than absorbing a fourth round. The consolidated file
> was deleted; the split is recorded in
> `docs/specs/logbook/2026-08-02-forward-time-ownership-provenance-split.md`.
> WP-153's four routing mentions of the retired slug are left unedited as inert
> `Done`-spec records.
>
> **2026-08-03 — DISPATCH-TIME RECONCILIATION against `8515eb1`, run because the
> gate blocked dispatch.** `WP-managed-block-insertion-anchor` merged (PR #154,
> `336e67b`) and moved `src/` under this spec: `manifest.js` 1062 → 1122 lines,
> `reverseSymlink` `:168` → `:216`, the symlink producer sites
> `:434/:485/:491` → `:439/:490/:496`. **Every anchor in this spec was re-derived
> by content at `8515eb1`**, never by arithmetic. Also re-stated: the suite
> baseline (`1913 / 1904 / 0`), the three **shared hunks** — which are now
> half-shipped, so `D6b`/`D7b` extend Part A's landed text rather than writing it
> — V4's base pin (`9188a1c` → `8515eb1`), V8's base direction (`anchorBefore`
> now passes at base; the red signal is `origin`/`dev`/`ino`), and the
> Definition-of-done precondition (Part A is `Done`; it is satisfied).
>
> **No design, ledger row or ruled disposition was touched.** The reconciliation
> is anchors and current-state only. The load-bearing check that permits that
> claim: **`reverseSymlink`'s function body is byte-identical at `9188a1c`,
> `17a2bc5` and `8515eb1`** — extracted and `cmp`-ed at all three — so Part A
> moved this spec's subject without editing it. Re-run from this spec after
> reconciliation: V4 self-check green, V4 red, inside-span red, V4z 31/14;
> V5's `reverseSymlink(` count still 2; V6's two schema cells still pre-Part-B
> (and Part A correctly did **not** type-gate `anchorBefore`).
>
> **2026-08-03 — B-T1 AMENDMENT, made against `81f43b7` while PR #157 is open and
> unmerged.** CI (ubuntu-latest) failed on B-T1: the mandated fixture asserted
> that a delete-and-recreate changes the `(dev, ino)` pair, which **ext4 falsifies
> by reusing the freed inode immediately**. That was a **spec** defect — the row
> mandated a filesystem coin flip and then asserted the coin. B-T1's mandate is
> replaced with a rename-based construction that cannot produce a colliding inode
> on any POSIX filesystem; the reasoning, the measurement, the rejected
> alternative and the retained fallback are in *"B-T1's construction"*. **No
> design, ledger row, contract table or ruled disposition changed** — only the
> fixture that proves row 4b end to end, and it still proves the same assertion.
> Folded in the same touch: the **V11 directionality** statement (measured, and
> the opposite of what was first written — see its header), the roster fix
> **T6 → T6 and T7**, and the **D6c** `opts` JSDoc decision with its **V8b** gate
> (measured red at base, green against the mandated line). **Commit shape:** this
> spec carries no commit-count rule (see the Definition-of-done note), so the
> implementer applies this as a **second commit** on the open PR.
>
> > **Design evidence carried forward, all measured at `18bc909` (`src/` identical
> to `0f9ee08`):** the full suite baseline (`1901 / 1892 / 0`), the three flipped
> assertions, the `lstat`-identity primitive including the inode change on
> delete-and-recreate, the **twenty-cell Table S sweep**, all four identity-seam
> arms, the race arm, and the idempotency run. **Round-1 finding:** `(dev, ino)`
> alone is not authorship — the `origin` bit was added and the cost ledger built.
> **Round-2 finding:** the ledger contradicted the residual table on 4b's cost;
> both rows were folded into one ledger and the identity seam added so the four
> arms are deterministic. **Round-3 findings:** the "full close" claim was
> retracted and replaced with the scoped statement above; the six-row shape
> summary was replaced by the exhaustive twenty-cell Table S; and the partial-pair
> leftover it exposed was added to the ledger.
