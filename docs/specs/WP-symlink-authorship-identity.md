---
id: WP-symlink-authorship-identity
title: Record symlink authorship and lstat identity at forward time so uninstall unlinks only links it can prove it created
status: Draft
model: opus
size: S
depends_on: [WP-153, WP-managed-block-insertion-anchor]
adrs: [ADR-0004, ADR-0019, ADR-0031, ADR-0036]
epic: audit-a13
---

# WP-symlink-authorship-identity: forward-time authorship evidence for the symlink reverser

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
first-hand against the working tree at commit **`18bc909`** (`git rev-parse HEAD`
→ `18bc90931835d7e928ba897c794de217c6993777`) on **2026-08-02**. `src/` is
byte-identical to `0f9ee08` at that commit — the commits on this branch touch
`docs/specs/` only. **Nothing was found stale.** The whole design was
additionally **implemented as a throwaway prototype and measured**, including an
exhaustive twenty-cell sweep of every schema-accepted entry shape (Table S).
The prototype was discarded.

> **ANCHOR WARNING — every `src/core/manifest.js` and `src/adapters/shared.js`
> line number below is stated PRE-PART-A.** `WP-managed-block-insertion-anchor`
> lands first and inserts roughly thirty lines near `manifest.js:59` and edits
> `shared.js:5`, so **anchors at or after `:59` in `manifest.js` shift downward**.
> The implementer must re-locate every region **by content, not by line number**,
> and the architect re-anchors this spec at the dispatch-time re-verification
> that follows Part A's merge (`docs/runbooks/codex-review.md`, "Dispatch-time
> re-verification"). This is the same arrangement WP-153 carried against WP-147
> and for the same reason.

### 1. `reverseSymlink` — `src/core/manifest.js:159-217`

Byte-identical at `18bc909`, WP-153's five rows:

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
  // Row 3: the link no longer resolves to the source we recorded. Realpath first
  // (semantic, follows the link); lexical fallback for the one reachable case
  // where the core was deleted by hand so realpath(T) throws. Both fail-closed.
  let lexicalMatch = false;
  try {
    lexicalMatch = fs.readlinkSync(L) === T;
  } catch {
    lexicalMatch = false;
  }
  if (!sameResolvedDir(L, T) && !lexicalMatch) {
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

`isSymlink` (`manifest.js:151-157`) is `fs.lstatSync(p).isSymbolicLink()` inside
a `try`, returning `false` on any throw. `sameResolvedDir`
(`manifest.js:452-458`) is `realpathSync(a) === realpathSync(b)` inside a `try`,
returning `false` on any throw — fail-closed by construction.

### 2. The single call site — `src/core/manifest.js:817-828`

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

`skillsRoots` is built once at `manifest.js:620` as
`[<claudeDir>/skills, <codexDir>/skills]`.

**`grep -rn "reverseSymlink" src/` at `18bc909` returns exactly FIVE lines**,
measured:

```text
src/core/manifest.js:168   the definition
src/core/manifest.js:818   the comment above the call
src/core/manifest.js:828   the ONE production call
src/core/manifest.js:1062  module.exports  ← WP-153's blessed implementer deviation
src/adapters/shared.js:441 one prose mention in a comment
```

**There is no second reverser and no second production call site.**

> **A stale claim inherited from WP-153, corrected here.** WP-153's own Current
> state says this grep *"returns exactly four lines … and one prose mention in
> `shared.js:406`"*. Both halves went stale **after WP-153 shipped**: its PR
> added `reverseSymlink` to `module.exports` (a deviation its 2026-08-02
> double-gate note formally blessed — *"`reverseSymlink` added to
> `module.exports` … forced by the unreachable-through-`reverse()` case"*), which
> is the fifth line; and the `shared.js` prose mention has moved from `:406` to
> `:441`. `docs/specs/done/WP-153-…` is **not edited** — a `Done` spec describes
> the code it shipped at the moment it was written — but this spec must not
> inherit its arithmetic, because **V5 asserts a count**. The export is what
> makes B-T7 and B-T8's direct unit calls possible.

`grep -c "reverseSymlink(" src/core/manifest.js` (with the parenthesis, one file)
is **2** — the definition and the one call. V5 asserts that number.

### 3. The three producer sites — `src/adapters/shared.js`

`grep -n "kind: 'symlink'" src/adapters/shared.js` at `18bc909` returns exactly
three lines, all inside `applySkillLinks`'s `for (const name of names)` loop
whose first two lines (`:416-417`) are
`const target = path.join(skillsDir, name);` /
`const linkPath = path.join(targetSkillsDir, name);`:

```text
434:        recordOnce(manifest, { kind: 'symlink', path: linkPath, target });
485:      recordOnce(manifest, { kind: 'symlink', path: linkPath, target });
491:        recordOnce(manifest, { kind: 'symlink', path: linkPath, target });
```

| site | branch | reached when |
|------|--------|--------------|
| `:434` | **adopt** | a symlink already sits at `linkPath` and `fs.readlinkSync(linkPath) === target`; reported `unchanged` |
| `:485` | **dryRun** | nothing at `linkPath` and `dryRun` is true; nothing is written |
| `:491` | **create** | nothing at `linkPath`; `symlink(target, linkPath)` at `:490` has just succeeded |

The `else` of `:434` is WP-146's preserve arm (`:435-447`): a `wienerdog-*`
symlink whose `readlinkSync` is **not** `target` is left untouched, records no
entry, and calls `dropOwnedEntry(manifest, 'symlink', linkPath)`. **Not changed
by this WP.** The `EPERM`/`EACCES` fallback below `:491` copies the directory and
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
`if (!dryRun) manifestMod.save(paths, manifest);` (verified at `18bc909`). The
`:485` entry is a report, and `uninstall` never sees it.

### 4. The entry schema — `src/core/manifest.js:902-953`

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

`validateEntry` (`:932-953`) rejects an unknown `kind` and a missing/empty/
non-string `path`; for every **listed** field it enforces the type **only when
the value is not `undefined`**, and extra keys are ignored (forward-compat).
`reverse()` runs it **first**, before kind dispatch (`:658-665`), and a rejected
entry is `skipped` with a notice — which, **for a symlink, means the link is
preserved**. That is the safe direction, and it is why this WP type-gates its
three fields while Part A deliberately does not type-gate `anchorBefore` (for a
managed block a rejected entry leaves the block installed).

### 5. The module doc comment — `src/core/manifest.js:16-29` and `:45-48`

Two in-code mirrors of the entry shape:

```text
 *   {kind:'symlink', path, target?}                 — a symlink we created;
 *                                                     `target` is the source it
 *                                                     must still resolve to
 *                                                     (absent on legacy entries)
```

```text
 * @typedef {{kind: string, path: string, hash?: string, createdFile?: boolean,
 *            commands?: string[], unload?: string[], sepBefore?: string,
 *            sepAfter?: string}} ManifestEntry
```

**Part A adds `anchorBefore?` to both before this WP lands.** This spec
**extends** the same two hunks with `origin?`, `dev?` and `ino?`; it does not
rewrite them and must not drop Part A's field.

### 6. The adapters→core import direction, and what Part A leaves

`src/adapters/shared.js:5` is `const { hashDir } = require('../core/manifest');`
at `18bc909`; **after Part A it reads
`const { hashDir, insertionAnchor } = require('../core/manifest');`**. This spec
extends that same line with `linkIdentity`. Adapters may import from core; core
may never import from adapters.

### 7. `reverseSchedulerEntry`'s options-seam precedent — `src/core/manifest.js:387-389`

```text
 *   once in reverse(); defaults keep the exported function directly callable.
 */
function reverseSchedulerEntry(entry, dryRun, removed, skipped, removedSet, opts = {}) {
```

This is the in-tree precedent this WP copies for its identity seam: a trailing
`opts = {}` whose default preserves production behaviour exactly.

### 8. `fs.lstatSync(link, { bigint: true })` — measured at `18bc909`

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

`npm test` at `18bc909` unmodified: **`tests 1901 / pass 1892 / fail 0`**. With
this WP's design alone applied, **exactly three** assertions flip, all three
`deepEqual`s in `tests/unit/shared-skill-links.test.js`, all three in Table F.
(WP-147's T9 in `tests/unit/manifest.test.js` also flips under the *consolidated*
design — that flip belongs entirely to **Part A** and will already have landed.)

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file itself (the status flip)
     and package-lock.json. Everything else must be listed. -->

**Sizing.** One primitive (~12 lines), one default parameter and two rows in one
reverser (~20 lines), one schema cell, two doc-comment extensions in
`manifest.js`; one import extension and three call sites in `shared.js`; two test
files extended, of which three shipped assertions are edited, across eight test
rows. **S** — and it is the smaller half of the split. It is not split further:
recording the fields without consuming them ships dead data, and consuming fields
nothing records ships a branch no install reaches.

| Action | Path | Notes |
|--------|------|-------|
| modify | src/core/manifest.js | **D3** — add `linkIdentity()` beside Part A's primitives and export it. **D4** — `reverseSymlink` gains a 7th parameter `opts = {}` (the identity seam — Exact contracts) and rows **4a** and **4b** per **Table A2**, between the existing rows 4 and 5; rows 1–5 are otherwise byte-identical and `reverse()`'s call site is **not** changed. **D5** — `ENTRY_FIELD_TYPES.symlink` becomes `{ target: 'string', origin: 'string', dev: 'string', ino: 'string' }`; **no other cell changes**, and in particular `managed-block` must not gain `anchorBefore` (Part A's Table P forbids it). **D6b** — the module doc comment and `@typedef ManifestEntry` gain `origin?`, `dev?`, `ino?` per **Table P**, **extending** Part A's `anchorBefore?` rather than replacing it. |
| modify | src/adapters/shared.js | **D7b** — extend `:5` to `const { hashDir, insertionAnchor, linkIdentity } = require('../core/manifest');`. **Do not drop `insertionAnchor`** — Part A put it there. **D10** — the three `recordOnce(manifest, { kind: 'symlink', … })` sites (`:434`, `:485`, `:491`) record `origin` (and, at `:491` only, `dev`/`ino`) per **Table B**. `recordOnce` itself is **NOT modified and NOT replaced by an upsert** — the owner declined a backfill (2026-08-01). The WP-146 preserve arm, `dropOwnedEntry`, the `readlinkSync` comparison, the `EPERM` copy fallback and every notice string stay byte-identical, as does everything Part A touched in `applyManagedBlock`. |
| modify | tests/unit/manifest.test.js | **B-T1 … B-T5, B-T7, B-T8** — the exact set in the Test index. WP-153's shipped T1–T4 and T6 must pass **byte-unmodified**; they craft entries with no `origin`/`dev`/`ino`, so they exercise the legacy arm and are its regression fence. Part A's A-T1…A-T10 must also pass byte-unmodified. |
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
 *  cannot supply a non-zero (dev, ino) pair — see Table P rule P-4.
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

**`reverseSymlink` gains an injectable identity seam:**

```js
function reverseSymlink(entry, dryRun, removed, skipped, removedSet, skillsRoots, opts = {}) {
  const identityOf = opts.identity || linkIdentity;   // test seam only
```

`(dev, ino)` is a *filesystem* property, so the four behaviours row 4b depends on
— changed device, changed inode, reused identity, unavailable identity — cannot
be produced deterministically on a real filesystem, and a test that relies on
`unlink` + `symlink` happening to allocate a fresh inode is a platform-dependent
assumption pretending to be a contract. The seam makes all four deterministic
(**B-T7**, measured). `reverse()`'s call site passes **nothing** — the default
parameter keeps production behaviour byte-identical, exactly as
`reverseSchedulerEntry` (Current state §7) already does with its own `opts = {}`.
`reverseSymlink` is already exported and already unit-tested directly (WP-153's
T4). **`opts` comes from the call site and never from a manifest entry**, so it
is not an untrusted-input surface.

**The two new rows** — inserted **between** the existing row-4 block and the
`// Row 5:` comment, nothing else touched:

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
  // it is unverifiable, not absent — preserve (Table P rule P-6, Table S).
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
// :434  adopt — the link was already there.
recordOnce(manifest, { kind: 'symlink', path: linkPath, target, origin: 'adopted' });

// :485  dryRun — a report only; nothing is written and sync.js:340 never saves it.
recordOnce(manifest, { kind: 'symlink', path: linkPath, target, origin: 'created' });

// :491  create — symlink(target, linkPath) has just succeeded. Write it out
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
files. **Six canonical tables** below.

### Table P — the provenance fields (canonical)

| Field | Type on disk | Written by | Exact value | Read by | Absent ⇒ | Type-gated? |
|-------|--------------|-----------|-------------|---------|----------|-------------|
| `origin` | `string` — `'created'` or `'adopted'` | the three `recordOnce` sites | `'adopted'` at `:434`; `'created'` at `:485` and `:491` | row 4a | see **Table S** — it depends on the other fields | **YES** (`origin: 'string'`). A rejected entry means the **link is preserved**, the safe direction — the exact opposite of Part A's managed-block case. |
| `dev` | `string` — decimal | `recordOnce` at `:491` **only** | `String(fs.lstatSync(link, {bigint:true}).dev)` | row 4b | see **Table S** | **YES** |
| `ino` | `string` — decimal | `recordOnce` at `:491` **only** | `String(fs.lstatSync(link, {bigint:true}).ino)` | row 4b | see **Table S** | **YES** |

**Rules that govern the fields as a set, decided here:**

- **P-3. `dev`/`ino` are recorded ONLY where we created the link** (`:491`). Not
  at `:434` — we did not create it, and that is exactly what `origin: 'adopted'`
  says — and not at `:485`, where nothing exists to `lstat` and the entry is
  never saved.
- **P-4. When `linkIdentity()` returns `null`, record NO identity fields** —
  `origin: 'created'` alone. This is the **forward**-side "cannot establish
  identity" answer and it deliberately keeps shipped behaviour, because the
  alternative — treating unavailable identity as a reason to preserve — would
  make uninstall incomplete on any platform whose filesystem cannot supply a
  stable `(dev, ino)` pair, a regression against ADR-0019 for every user on that
  platform. **The fail-closed direction applies on the REVERSE side only**
  (row 4b): identity that *was* recorded and no longer matches preserves.
- **P-5. Nothing backfills.** `recordOnce` no-ops on an existing entry
  (`shared.js:50-51`), so an install that predates this WP keeps its target-only
  entries **permanently** — through one sync and through a hundred. That is the
  owner-ruled position for `target` (2026-08-01) and it is inherited unchanged.
  "Legacy" is a permanent state.
- **P-6. "Absent" is not one condition, and the accepted shape space is bigger
  than the producer's output.** All three fields are optional and only
  type-gated, so `validateEntry` admits **twenty** distinct
  `{origin, dev, ino}` shapes while the forward step writes only **four**.
  **Table S enumerates all twenty, measured.**

### Table S — every schema-accepted `{origin, dev, ino}` shape (canonical)

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

**At base `0f9ee08` every one of these twenty cells is `removed`** —
`reverseSymlink` unlinks any recorded-path symlink with no identity check at all.
**So every `PRESERVED` cell is a NARROWING and no cell is a widening.** That is
Table N's theorem, proved exhaustively rather than by argument.

**The four PRODUCER-VALID shapes**, distinguished from the sixteen that are
forgery or corruption only:

| Shape | Written by | Outcome | Why |
|-------|-----------|---------|-----|
| absent / `none` | an install predating this WP | **removed** — base behaviour | the legacy arm; the upgrade-safety criterion (AC8a) |
| `'created'` / `both` | `shared.js:491` when `linkIdentity` succeeded | row 4b decides | the mainline |
| `'created'` / `none` | `shared.js:485` (dry run), or `:491` when `linkIdentity` returned `null` (P-4) | **removed** — base behaviour | identity was never establishable; never make an existing platform's uninstall incomplete |
| `'adopted'` / `none` | `shared.js:434` | **preserved** (row 4a) | the link is the user's |

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
   the owner ledger** — see the ledger's fourth row.

### Table A2 — what `reverseSymlink(entry)` does after this WP (canonical)

Conditions are evaluated **in order**; the first that holds decides. `L` is
`entry.path`, `T` is `entry.target`. Rows 1–5 are WP-153's, restated in full so
this spec is self-contained; **rows 4a and 4b are new.**

| # | Condition | Filesystem action | Bucket | stderr | Why it is the fail-safe answer |
|---|-----------|-------------------|--------|--------|--------------------------------|
| 1 | `!isSymlink(L)` | none | `skipped` | none | A real file/dir at `L`, or nothing at all, is definitionally not the link we made. |
| 2 | `typeof T !== 'string' \|\| T === ''` — **LEGACY** | none | `skipped` | `wienerdog: keeping <L> — not the Wienerdog skill link we recorded (replaced, or unverifiable)` | Ownership unprovable; owner-ruled 2026-08-01. |
| 3 | `sameResolvedDir(L, T) === false` **and** `fs.readlinkSync(L) !== T` | none | `skipped` | same line | The link points somewhere else. Both sub-tests are fail-closed. **The lexical sub-test is dead through production and stays anyway** — see Implementation notes. |
| 4 | **`OWNED(L)` is false** — basename not `wienerdog-*`, **or** `path.dirname(L)` does not realpath-equal a harness skills root | none | `skipped` | same line | A forged `(path, target)` pair is not delete authority (WP-153 gate round 4). |
| **4a** | **`entry.origin === 'adopted'`** | none | `skipped` | same line | **NEW.** The link was already on disk when we first recorded it — the adopt branch (`shared.js:434`) sees a `wienerdog-*` link already pointing at our source and records it. It is the user's. Narrows honest-use case 2. |
| **4b** | **`entry.dev` or `entry.ino` is a string** — and either the pair is **partial**, or `identityOf(L)` is `null`, or it does not equal `(entry.dev, entry.ino)` | none | `skipped` | same line | **NEW.** We recorded which file object we created; this is not it. A delete-and-recreate gets a new inode (measured, Current state §8), so a user's same-source replacement no longer passes for ours. Narrows honest-use case 1. A `null` identity is fail-closed by construction. **`(dev, ino)` is durable but not permanent, and recyclable — both directions are costed in the owner ledger and pinned by B-T7.** |
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
- **Residual R7, pinned by B-T8, costed in the owner ledger.**

### Table B — what each producer site records (canonical)

| Site | Branch | `kind`/`path`/`target` | `origin` | `dev`/`ino` |
|------|--------|------------------------|----------|-------------|
| `shared.js:434` | **adopt** | unchanged | **`'adopted'`** | **none** (we did not create it) |
| `shared.js:485` | **dryRun** | unchanged | **`'created'`** | **none** (nothing exists to `lstat`; never saved — `sync.js:340`) |
| `shared.js:491` | **create** | unchanged | **`'created'`** | **`linkIdentity(linkPath)`**, or **none** when it returns `null` (P-4) |

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
| a *correct* `(dev, ino)` read off the live link, **or** an inode the filesystem recycled | shipped behaviour — the link is deleted, exactly as base does. The attacker must already be able to `lstat` the link they want deleted | B-T7(d); costed as **R4** |

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
| 1 | `:52-55` | `skill symlinked into the target dir with the default seam (POSIX)` | `assert.deepEqual(…, [{ kind: 'symlink', path: linkPath, target: coreSkill }])` | **Cannot stay a literal** — the entry now carries machine-specific `dev`/`ino`. Replace with: assert `kind`/`path`/`target`/`origin` equal `'symlink'`/`linkPath`/`coreSkill`/`'created'`, **and** assert `{ dev: entry.dev, ino: entry.ino }` deep-equals `linkIdentity(linkPath)`, **and** that it is non-null on POSIX. Get `linkIdentity` by extending the **existing** destructure at `:10` (`const { hashDir } = require('../../src/core/manifest');`); do not add a second `require` | This is the create branch (`:491`) and the **only** site that records identity. Asserting against the live `linkIdentity` rather than a hardcoded number is what makes the row portable; asserting non-null is what makes it non-vacuous. |
| 2 | `:191-194` | `dry-run records a symlink entry and reports the change without writing` | `[{ kind: 'symlink', path: linkPath, target: path.join(skillsDir, 'wienerdog-setup') }]` | `[{ kind: 'symlink', path: linkPath, target: path.join(skillsDir, 'wienerdog-setup'), origin: 'created' }]` | Dry run writes nothing, so there is no link to `lstat` and no identity to record (Table B). The literal stays a literal. **`coreSkill` is NOT in scope** — `:181` destructures only `{ skillsDir, targetSkillsDir }`; build the target inline from `skillsDir`, as the shipped assertion already does. |
| 3 | `:337-340` | `a pre-existing correct symlink is adopted into the manifest (recorded, reported unchanged)` | `[{ kind: 'symlink', path: linkPath, target: coreSkill }]` | `[{ kind: 'symlink', path: linkPath, target: coreSkill, origin: 'adopted' }]` | This is the adopt branch (`:434`). No identity is recorded (P-3) and `origin` is `'adopted'` — the two facts that make row 4a fire on uninstall. |

### Table U — the regions that must stay BYTE-IDENTICAL

**"Unchanged" means byte-for-byte against the FILE**, not against this spec's
excerpts, which are dedented and annotated.

| Region | Must stay |
|--------|-----------|
| `reverseSymlink` rows 1–5 | unchanged except the two new blocks inserted **before** the `// Row 5:` comment, the `opts = {}` parameter, and the `identityOf` binding. In particular the row-3 `lexicalMatch` `try`/`catch` stays. |
| The `reverse()` symlink arm | unchanged — **including the argument list**. `reverseSymlink` gains a 7th parameter `opts = {}`, and `reverse()` must **not** pass it: the default is production behaviour. A diff that adds an argument there is out of scope. |
| `reverseManagedBlock`, in full | **untouched by this WP** — Part A's. Its fd-bound read, WP-147's Table M vocabulary block, the `anchorOk` conjunct Part A added, the `createdFile` `fs.rmSync(target, …)` delete and the fd-bound `ftruncateSync`+`writeSync` all stay exactly as Part A left them. **V3 is the guard.** |
| `ENTRY_FIELD_TYPES`' other cells | unchanged — only the `symlink` cell moves. `managed-block` must **not** gain `anchorBefore` (Part A's Table P forbids it; V6 enforces it). |
| `applySkillLinks`' preserve arm, directory arm and EPERM fallback | unchanged |
| `applyManagedBlock`, in full | **untouched by this WP** — Part A's, including its three `recordManagedBlock` argument lists |
| `recordOnce` | unchanged — **not** replaced by an upsert (P-5) |
| `shared.js:5` | **extended, not rewritten** — `insertionAnchor` must survive |

### Mirrored Surface Checklist

**Table P + Table S (the fields and their accepted shapes)** — mirrors:

- [ ] Deliverables cells **D5**, **D6b**, **D10**
- [ ] Exact contracts: the producer-site block and the rows-4a/4b snippet
- [ ] `src/core/manifest.js` module doc comment and `@typedef` (in-code — D6b)
- [ ] `src/core/manifest.js` `ENTRY_FIELD_TYPES.symlink` (in-code — D5)
- [ ] Current state §3 (producer sites), §4 (schema), §5 (doc comment)
- [ ] Table B, Table N
- [ ] Acceptance criteria **AC1**, **AC2**, **AC8a**, **AC8a′**, **AC8b**, **AC9**
- [ ] Verification **V5**, **V6**
- [ ] **The owner cost ledger's fourth row** (the partial-pair leftover)

**Table A2 (reverser rows)** — mirrors:

- [ ] Deliverables cell **D4**
- [ ] Exact contracts: the rows-4a/4b snippet, the `opts = {}` signature, the
      one-stderr-string decision
- [ ] Current state §1 (the shipped five rows), §7 (the seam precedent)
- [ ] Table U's `reverseSymlink` and `reverse()`-arm rows
- [ ] Acceptance criteria **AC6**, **AC7**
- [ ] Test index **B-T1 … B-T8**; Table R rows **R3**, **R4**, **R5**, **R7**
- [ ] Verification **V4**
- [ ] **The owner cost ledger**, all four rows

**Table F (flipped assertions)** — mirrors:

- [ ] Deliverables cell for `tests/unit/shared-skill-links.test.js`
- [ ] Current state §9; Test index **B-T6**; Acceptance criterion **AC10**

## Test index

Every row names how its state is produced **structurally**, never by position in
a sequence, and names the implementation it reddens (ADR-0036 A1/A2).

| # | Fixture (structural) | Assertion | Red against |
|---|----------------------|-----------|-------------|
| **B-T1** | Honest `applySkillLinks` create, then `fs.unlinkSync(link)` followed by `fs.symlinkSync(coreSkill, link)` — a new file object at the same path with the same target. **Assert the precondition explicitly**: `linkIdentity(link)` must now differ from the recorded pair, so a filesystem that recycled the inode fails the *precondition* loudly instead of silently turning this into a vacuous pass | the link **still exists** after `reverse()`, is in `skipped`, and the stderr `keeping …` line fired | base (**measured**: the link is deleted). **This is the end-to-end row and it is filesystem-dependent by nature** — the deterministic proof of the same rule is **B-T7(b)**, which is why both exist. |
| **B-T2** | The link is created **before** `applySkillLinks` runs, so the adopt branch records it | the link **still exists** after `reverse()`, is in `skipped`; **and** the recorded entry has `origin: 'adopted'` and **no** `dev`/`ino` | base (**measured**: the link is deleted). Assert the entry shape too — the end state alone tells you something is wrong; the entry tells you which rule fired. |
| **B-T3** | Honest create, nothing touched, uninstall | the link is **removed** and is in `removed` | `TRIGGER: none — the ordinary path.` Baseline row; red against making identity *required*, and against any row 4a/4b that fires on our own untouched link. **Run the forward step twice before uninstalling** and assert the entry is deep-equal to the first run's — that is AC11. |
| **B-T4** | **Table S, one case per row of the producer-valid table plus the three semantic classes — nine rows, not one combined deletion**: all-absent; `'created'`+matching identity; `'created'`+no identity; `'adopted'`+no identity; `'adopted'`+identity; unknown `origin`+no identity; unknown `origin`+matching identity; **`dev`-only**; **`ino`-only** | each behaves exactly as Table S tabulates | the all-absent row is the **backward-compatibility fence** (red against "absent identity ⇒ preserve", which would strand every pre-existing install). The **two partial rows are required in both directions** — one alone is passed by an implementation that checks only the field it happens to test. **All measured.** |
| **B-T5** | Non-string forgeries, one per field: `origin = 1`, `dev = 1`, `ino = 12345` | all three **preserve** the link, and the entry is rejected upstream by `validateEntry` with its notice | any implementation where a non-string field reaches the reverser or widens deletion. Three separate rows, three separate mutations (ADR-0036 A3) — independently revertible, each reddening a different field of the schema cell. |
| **B-T6** | `shared-skill-links.test.js` — the three **Table F** rows plus the forward-side identity assertion | exactly the expectations in Table F | `PATCH: none — shipped assertions whose expected values moved.` Their red-ness is Table F's measurement (three `ERR_ASSERTION` failures). |
| **B-T7** | **The identity seam, four deterministic arms.** Honest create, then call `reverseSymlink` **directly** (WP-153 blessed the direct unit call) passing `{ identity: … }` as the 7th argument. Four separate rows: **(a) changed device** → `{dev: recorded.dev+1, ino: recorded.ino}`; **(b) changed inode** → `{dev: recorded.dev, ino: recorded.ino+1}`; **(c) unavailable** → `null`; **(d) reused** → the recorded pair verbatim | (a),(b),(c) → the link **survives**, is in `skipped`, `removed` empty. (d) → the link is **removed** — this arm pins **R4**'s recycling residual at its declared size; comment it as pinning current behaviour, not a fix | (a)(b)(c) red against any implementation that ignores a recorded identity or treats `null` as a match. (d) is `PATCH: none — residual pin`. **All four measured.** |
| **B-T8** | **The verify→unlink race**, deterministic. Honest create, then call `reverseSymlink` directly with an identity seam that **replaces the link on disk** (`unlinkSync` + `symlinkSync`) and *then* returns the **recorded** pair — simulating a replacement landing between the check and the unlink | the replacement **is deleted** and the link is in `removed` | `PATCH: none — residual pin.` Not red-first: it pins **R7** at its declared size, which is the only way "we do not claim TOCTOU-freedom" stops being a sentence. If it ever goes red, either an atomic primitive was adopted or the mechanism changed. **Measured.** |

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
- **The row-3 lexical fallback stays.** WP-153's 2026-08-02 post-merge note
  established that `fs.readlinkSync(L) === T` is **dead through production** —
  `reverse()`'s symlink arm calls `withinAllowedRoot`, whose `realpathSync`
  throws `ENOENT` on a dangling link and preserves the entry before
  `reverseSymlink` runs — and issued a **standing instruction**: the fallback
  stays in the code and in the contract until `WP-symlink-lexical-fallback-removal`
  lands. **Do not remove it here**, and do not "tidy" it while adding rows 4a/4b.
  The shipped test that reaches it (`reverseSymlink: a dangling own link is still
  removed via the lexical fallback — Table A row 3→5 (T4)`) calls `reverseSymlink`
  **directly**; its entry is `{ kind: 'symlink', path: link, target: source }`
  with no `origin`/`dev`/`ino`, so rows 4a and 4b do not fire and it stays green
  byte-unmodified. Measured.
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

- [ ] **AC1.** `src/core/manifest.js` exports `linkIdentity`;
      `src/adapters/shared.js:5` imports it **alongside Part A's
      `insertionAnchor`**, which must survive the edit.
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
      behave as tabulated. B-T4 asserts the four producer-valid shapes and the
      three semantic classes, **including `dev`-only and `ino`-only as separate
      rows**.
- [ ] **AC8b — narrowing only.** Every cell of Table S is `removed` at base;
      every cell that is `PRESERVED` after this WP is therefore a narrowing, and
      **no cell is a widening**.
- [ ] **AC9.** Each of the **three** producer sites in Table B — `shared.js:434`,
      `:485`, `:491` — records exactly what that table says, no more and no less
      — B-T6, plus B-T2's `origin: 'adopted'` / no-identity assertion.
- [ ] **AC10.** Table F's three assertions are updated and pass; **every other
      test in the repository passes byte-unmodified**, including WP-153's T1–T4
      and T6, the four fenced WP-146 sync-side tests, and the whole of Part A's
      A-T1…A-T10 and `tests/unit/manifest.test.js`'s WP-147 suites.
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

# V4 GREEN — this WP's own rows are present AND WP-153's are intact.
node /tmp/wd-fnguard.js src/core/manifest.js reverseSymlink \
  "+lexicalMatch = fs.readlinkSync(L) === T;" \
  "+!sameResolvedDir(L, T) && !lexicalMatch" \
  "+skillsRoots.some((root) => sameResolvedDir(path.dirname(L), root))" \
  "+entry.origin === 'adopted'" \
  "+const identityOf = opts.identity || linkIdentity;" \
  "+hasDev || hasIno" && echo "V4 ok"

# V4 RED — MUST fail against a copy with WP-153's row-3 fallback deleted.
cp src/core/manifest.js /tmp/wd-v4-red.js
node -e 'const fs=require("node:fs"),p=process.argv[1];fs.writeFileSync(p,fs.readFileSync(p,"utf8").replace("  if (!sameResolvedDir(L, T) && !lexicalMatch) {","  if (!sameResolvedDir(L, T)) {"))' /tmp/wd-v4-red.js
node /tmp/wd-fnguard.js /tmp/wd-v4-red.js reverseSymlink \
  "+!sameResolvedDir(L, T) && !lexicalMatch" \
  && { echo "V4 BROKEN: the guard cannot fail"; exit 1; } || echo "V4 ok (red, as required)"

# V4 RED 2 — MUST fail against a copy with THIS WP's partial-pair arm weakened to
#            the round-2 form (which treated a half pair as absent and deleted).
cp src/core/manifest.js /tmp/wd-v4-red2.js
node -e 'const fs=require("node:fs"),p=process.argv[1];fs.writeFileSync(p,fs.readFileSync(p,"utf8").replace("  if (hasDev || hasIno) {","  if (hasDev && hasIno) {"))' /tmp/wd-v4-red2.js
node /tmp/wd-fnguard.js /tmp/wd-v4-red2.js reverseSymlink "+hasDev || hasIno" \
  && { echo "V4 BROKEN: the partial-pair arm is not guarded"; exit 1; } || echo "V4 ok (red 2, as required)"

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

# V8 — lint.
npm run lint
```

**Measured at `18bc909` while writing this spec** (i.e. **before** either part
landed, so the "must be present" checks for new code are post-implementation by
construction): V3's and V4's **red** runs both exit 1, and V4's green run passes
against WP-153's shipped rows. **V5's `grep -c 'reverseSymlink(' src/core/manifest.js`
is `2` today and must stay `2`** — the definition and the one production call.
Do not confuse that with the **five** *unparenthesized* textual occurrences of
`reverseSymlink` across `src/` (Current state §2), which include the comment above
the call, the `module.exports` line and a prose mention in `shared.js:441`.
**The guards are tripwires; V1 and V2 are the load-bearing checks** —
they are not AST-aware and cannot tell reachable code from code after a `return`
(**R8**, routed to `WP-grep-gate-helper`).

## Out of scope (do NOT do these)

- **Everything in Part A** — `reverseManagedBlock`, `applyManagedBlock`,
  `recordManagedBlock`, `insertionAnchor`, `anchorProvesPosition`, and
  `anchorBefore` on the doc comment and typedef. Part A lands first; do not
  re-edit its hunks except to **extend** the three shared ones.
- **Manifest integrity (signing/HMAC).** Declared out of scope by Table N.
- **Removing the row-3 lexical fallback** — routed to
  `WP-symlink-lexical-fallback-removal`, under WP-153's standing instruction.
- **Backfilling `origin`/`dev`/`ino` onto existing entries**, or replacing
  `recordOnce` with an upsert. Owner-declined 2026-08-01; P-5 inherits it.
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

| Row | What it buys | What it costs | How narrow the cost is | Pinned by |
|-----|--------------|---------------|------------------------|-----------|
| **4a** (adopted ⇒ preserve) | narrows honest-use **case 2**: a link the user created before we synced is no longer deleted | a link **we** created is left behind when its manifest entry was lost and a later `sync` re-adopted it | `recordOnce` no-ops when an entry exists (`shared.js:50-51`), so an ordinary re-sync never re-records; and `uninstall` refuses outright without a manifest (`src/cli/uninstall.js:43-46`). It needs: manifest deleted or reset → reinstall → sync → uninstall | B-T2 |
| **4b** (identity must match) | narrows honest-use **case 1**: a user's same-source replacement is no longer deleted | **(a) durability** — a backup/restore, volume remount, home migration, container rebuild or network filesystem can change `dev` and/or `ino` for a link nobody touched, which is then **left behind**; **(b) recycling** — an inode handed back to a user's replacement at the same path with the same target passes 4b and is **deleted** | (a) is the fail-closed direction and never loses data; (b) needs the FS to reallocate the exact inode at the exact path **and** the user to have re-pointed it at our source | B-T7 (a)–(d) |
| **4b's verify→unlink race** | nothing — it is 4b's cost, not its benefit | a replacement landing between the identity check and the unlink is deleted despite the verified identity belonging to the previous object | needs **arbitrary same-user native code**, which `docs/THREAT-MODEL.md` places outside the boundary (A12) and which can delete the link directly. Node exposes no atomic compare-and-unlink | **B-T8**. Residual **R7**; not claimed closed (ADR-0028's disposition for the scheduler's reopen-based check) |
| **the partial-pair leftover** (new in round 3) | nothing — it is the fail-closed reading of a shape no branch writes | an entry carrying **exactly one** of `dev`/`ino` **preserves** a link base would delete | **not reachable from any producer site** (Table S) — it needs a hand-edited or corrupted manifest. It is a cost the ledger owes the owner because the ledger claims to be complete, not because a user will hit it | B-T4's two partial rows |

**No row is ever worse than shipped `0f9ee08` on SAFETY** — base unlinks any
recorded-path symlink with no ownership test at all, so every row here only ever
preserves more (Table S, exhaustively). **The cost is completeness only**, which
is precisely the axis WP-153's ruling spoke to.

### The four dispositions, so the ruling is a choice and not an essay

Ordered by how much of the residual narrows; all are safety-wise
equal-or-stronger than shipped.

| | Disposition | Honest-use case 1 | Honest-use case 2 | Completeness cost |
|---|---|---|---|---|
| (i) | **Ship rows 4a AND 4b** (this spec's shape) | **narrowed**, except recycling and the race | **narrowed** | all four ledger rows |
| (ii) | **Ship 4b only**; record `origin` but leave it unread | **narrowed**, except recycling and the race | stays open | 4b's two directions, the race, the partial-pair row |
| (iii) | **Ship 4a only**; record `dev`/`ino` but leave them unread | stays open | **narrowed** | the adopt-leftover only |
| (iv) | Ship neither; record all three fields, read none | stays open | stays open | none — but then this WP closes nothing and should not ship |

**Architect's recommendation: (i)**, on the ground that every shipped reverser
from WP-144 through WP-153 preserves what it cannot prove it created — a design
convention, **not** ADR-0019 text (see the Context correction) — and a leftover symlink in the user's own skills directory is a smaller harm than
deleting a file the user made. **(ii) and (iii) are both legitimate** and either
would let this WP ship against a narrower claim; **(iv) is only coherent if this
WP is dropped**, since recording fields nothing reads is dead data by CLAUDE.md's
own rule.

**Whichever is chosen, the same surfaces move in the same pass** — this spec's
title and scope blockquote, Table A2, Table S, the Table B rows for any site that
stops recording, AC6, AC7, AC8a′, B-T2/B-T4/B-T7/B-T8, and Table R rows R4/R5/R7.
They are registered in the Mirrored Surface Checklist for exactly this reason.
**Do not implement any arm until the ruling is recorded here.**

## Declared residuals after this WP (Table R — canonical)

| # | Residual | Bound | Pinned by | Routed |
|---|----------|-------|-----------|--------|
| **R1** | **Manifest forgery.** An attacker who can rewrite the manifest deletes the fields and gets base behaviour | WP-153's row-4 `OWNED(L)` gate: the `wienerdog-` namespace in the two directories the user gave us | Table S's `absent`/`none` column; B-T5 | manifest integrity — **declined by declaration**, not routed |
| **R3** | **No stable `(dev, ino)` on some platform.** Where `linkIdentity` returns `null` at creation time, no identity is recorded and WP-153's residual persists on that platform | the WP-153 residual, unchanged | B-T4's `'created'`+no-identity row covers the *reverse* arm. **The forward arm has no test** — it needs a platform reporting a zero `dev`/`ino`, which this repo's CI does not have | a Windows-runner probe, if one is ever wanted; not routed today |
| **R4** | **Identity drift and recycling.** `(dev, ino)` is durable but not permanent | drift is fail-closed and never loses data; recycling needs the exact inode at the exact path **plus** the user re-pointing it at our source, and is still equal-or-stronger than base | **B-T7**, all four arms deterministic through the identity seam | costed in the ledger, row 4b. A birth-time field was considered and rejected |
| **R5** | **Adopted-link leftover** — row 4a's half of the ledger | one symlink per core skill, in the harness skills dir, only after a manifest-loss reinstall | B-T2 pins the *behaviour*; the *cost* is what the owner rules on | **blocked on the owner ruling** |
| **R6** | **`reverseCopiedSkill` has the same authorship gap** — its `hash` is read from the same untrusted file and proves content, not authorship | out of scope here; a `copied-skill` is the `EPERM`/`EACCES` fallback shape, not the mainline | none | a future WP, not drafted |
| **R7** | **The verify→unlink race.** Row 4b's `identityOf(L)` and row 5's `fs.unlinkSync(L)` are separate syscalls | needs **arbitrary same-user native code** — outside the threat model per `docs/THREAT-MODEL.md`'s A12 posture — and such an actor can delete the link directly. **Only ever narrows against base** | **B-T8** | **not routed and not claimed closed.** Node exposes no atomic compare-and-unlink; ADR-0028's disposition for the scheduler's reopen-based check. Costed in the ledger |
| **R8** | **The source guards are not AST-aware.** They strip comments and reject duplicate definitions, but cannot tell reachable code from code after a `return` | the guards are **tripwires**; V1/V2 are the load-bearing checks | the red mutations in Verification steps | **`WP-grep-gate-helper`** — already routed by WP-147; this spec does not re-route it |
| **the partial-pair leftover** | see the ledger's fourth row | not reachable from any producer site | B-T4's two partial rows | costed in the ledger |

## Definition of done

1. All verification steps pass locally; output pasted into the PR body — **V3's
   and both of V4's red runs included**.
2. Branch `wp/symlink-authorship-identity`; conventional commits; PR titled
   `fix(uninstall): prove a skill symlink's authorship before unlinking it (WP-symlink-authorship-identity)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
5. **`WP-managed-block-insertion-anchor` is merged**, and this spec's
   `src/` anchors have been re-verified against the post-Part-A tree.
6. **The owner ruling above is recorded here.** This spec does not move to
   `Ready` without it, and no implementer starts without `Ready`.

> **Provenance.** Part B of the split of the consolidated
> `WP-forward-time-ownership-provenance`, which was drafted 2026-08-02, taken
> through **three Codex design-gate rounds** (11 findings, 3 high), and split at
> its own pre-cut line rather than absorbing a fourth round. The consolidated file
> was deleted; the split is recorded in
> `docs/specs/logbook/2026-08-02-forward-time-ownership-provenance-split.md`.
> WP-153's four routing mentions of the retired slug are left unedited as inert
> `Done`-spec records.
>
> **Design evidence carried forward, all measured at `18bc909` (`src/` identical
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
