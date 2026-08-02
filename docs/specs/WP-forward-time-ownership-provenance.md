---
id: WP-forward-time-ownership-provenance
title: Record ownership provenance at forward time so uninstall can prove a separator and a symlink are ours before deleting them
status: Draft
model: opus
size: M
depends_on: [WP-147, WP-153]
adrs: [ADR-0004, ADR-0019, ADR-0031, ADR-0036]
epic: audit-a13
---

# WP-forward-time-ownership-provenance: forward-time ownership provenance for the managed-block and symlink reversers

> **Routing record — both residuals are OWNER-APPROVED (2026-08-02), both flagged
> FYI and NOT gated.** This WP is the consolidated FULL CLOSE of the two residuals
> the 2026-08-02 wave declared. Neither was an owner *decision* — both were
> equal-or-stronger than shipped 0.12.0, so there was no new cost to ratify — and
> both were flagged because reversibility is IRON-RULE-adjacent:
>
> - **Residual A (WP-147, PR #134).** *"WP-147 leaves a pre-existing
>   cross-paragraph-relocation blank-line-collapse unchanged from 0.12.0; full fix
>   routed to `WP-managed-block-insertion-anchor`."*
> - **Residual B (WP-153, PR #137).** *"WP-153 leaves a namespace-bounded
>   symlink-ownership residual — a `wienerdog-*`-named link under a skills root
>   resolving to our source can be removed even if the user made it — strictly
>   stronger than shipped 0.12.0; full close routed to
>   `WP-forward-time-ownership-provenance`."*
>
> **`WP-managed-block-insertion-anchor` is this WP.** WP-147 named the anchor
> mechanism before WP-153 existed and routed to that provisional slug; WP-153's
> architect routing call then folded both into one id — *"ONE WP covers both …
> they are the same shape (record more identity at forward time so ownership
> survives later user edits) — with a note it may split in review if the two
> mechanisms diverge."* Two `Done` specs still cite the old slug in prose
> (`docs/specs/done/WP-147-managed-block-separator-roundtrip.md`, several places).
> **They are not edited by this WP** — a `Done` spec describes the code it shipped;
> the alias is recorded here instead. See **Split plan** for the pre-cut line if a
> reviewer decides the mechanisms do diverge.

## Context (read this, nothing else)

Wienerdog is an install-time tool that writes configuration files onto a user's
machine and records every artifact it creates in an **install manifest**
(`~/.wienerdog/install-manifest.json`). `wienerdog uninstall` replays that
manifest in reverse to remove exactly what was created and nothing else.

**IRON RULE (ADR-0004): Wienerdog is just files.** No daemons, no servers, no
telemetry. **ADR-0019** states the reverse-side half: uninstall disposes the
core's machine-generated mechanics, and *anything it cannot prove it created is
preserved* — an unmodified install must leave **only the vault** behind, and it
must never delete a byte the user authored.

Two artifacts sit on that line, and both are governed by a proof the reverser
performs at delete time:

1. The **managed block** — the sentinel-delimited region
   (`<!-- wienerdog:begin -->` … `<!-- wienerdog:end -->`) Wienerdog splices into
   a harness markdown file the user also owns (Claude Code's `CLAUDE.md`, Codex's
   `AGENTS.md`). Forward: `sync` inserts the block plus a separator. Reverse:
   `uninstall` strips the block and **only the separator bytes Wienerdog added**.
2. The **skill symlink** — for each core skill named `wienerdog-*`,
   `applySkillLinks` creates `<harness skills dir>/wienerdog-<name>` pointing at
   `<core skills source>/wienerdog-<name>`. Reverse: `uninstall` unlinks it only
   after proving it is still the link we recorded.

**Both proofs are currently incomplete in the same way, and that is why one WP
covers both.** WP-147 and WP-153 each shipped a *shape* proof — the manifest
records **what** we wrote (the separator bytes; the link's target) — and each
declared the same residual: a shape can be reproduced by the user, so shape is
not authorship. WP-147 wrote it out in one sentence:

> *"the manifest records the separator's **shape** (`sepBefore`/`sepAfter`) but
> not its **position**. Full ownership closure would need an install-time
> **insertion anchor** — the prefix length at insertion, or a hash of the
> surrounding context."*

and WP-153 wrote the analogue:

> *"target-equality is standing in for authorship, and it cannot distinguish 'our
> link' from 'a user link that happens to resolve to the same place'."*

**This WP adds the missing forward-time evidence to both**: a **managed-block
insertion anchor** (a bounded hash of the content that immediately preceded our
separator) and a **symlink identity + origin** record (`lstat` device/inode, plus
whether we created the link or merely adopted one that was already there). Each
reverser must match its new evidence before the destructive step, and **fails
closed** — preserves — on any mismatch.

**Three constraints bound the whole design, and every contract table below is
written against them:**

- **Backward compatibility is mandatory.** Entries written by older versions lack
  the new fields. Missing provenance ⇒ **exactly the shipped 0.12.0 behaviour**,
  never stricter deletion and never wider deletion. `recordOnce` no-ops on an
  existing entry (`src/adapters/shared.js:47-52`), so an upgraded install keeps
  its old entries **permanently** — WP-153's owner ruling (2026-08-01: *"fine to
  have installs predating the WP have uninstall leave all skill symlinks
  behind"*) declined a backfill, and none is built here either. If missing
  provenance made uninstall *stricter*, every pre-existing install would stop
  removing its own artifacts and the ADR-0019 reversibility contract would break
  on upgrade.
- **The manifest is untrusted input.** It is a plaintext, user-editable,
  attacker-writable file (WP-144's founding premise). The two gate rounds that
  preceded this WP each found a forged field that was a deletion primitive:
  forged separator metadata could **empty a user's `CLAUDE.md`** (WP-147 Table M),
  and a forged `(path, target)` pair was **delete authority over any symlink the
  user owned** under a harness skills root (WP-153 row 4). The new fields carry
  the same posture, stated as a theorem this WP must prove: **a forged provenance
  field may only ever NARROW deletion, never widen it** (Table N).
- **A declared residual needs a pinning test.** That is what terminated the
  WP-147 and WP-153 adversarial loops — a permutation report resolves against a
  committed assertion instead of re-opening the WP. Every row of Table R below
  is pinned by a named test.

**Terminology note — `provenance` is an overloaded word in this repo.**
`docs/GLOSSARY.md` defines **provenance** as *"mandatory frontmatter on
auto-written notes: origin, source_sessions, confidence, recurrence,
derived_from_untrusted"* — a **vault** concept, entirely unrelated to this WP.
This spec never uses the bare word for its own mechanism. The two operative terms
are **insertion anchor** (managed block) and **link identity** (symlink); where a
name for both together is needed, it is spelled out in full as *forward-time
ownership provenance* and is the WP's title, not a glossary term. **Do not add
either term to `docs/GLOSSARY.md`** — that file is not a deliverable here.

## Current state

**Re-verification record.** Every executable claim in this section was run
first-hand against the working tree at commit **`0f9ee08`** (`git rev-parse HEAD`
→ `0f9ee088117671d9ce0b6f013329f8673ef5c131`) on **2026-08-02**. Line numbers
below are `0f9ee08`'s. **Nothing was found stale.** In addition, the whole design
below was **implemented as a throwaway prototype at `0f9ee08` and measured** —
every "measured" figure in this spec is that prototype's output, not reasoning.
The prototype was discarded; the tree is unmodified.

### 1. `applyManagedBlock` — the forward side, `src/adapters/shared.js:163-212`

Three branches, byte-identical at `0f9ee08` (the `// ←` annotations are this
spec's, not in the file):

```js
  if (current === null) {
    // File absent → create it holding exactly the block + newline.
    const next = `${block}\n`;
    if (!dryRun) {
      fs.mkdirSync(path.dirname(mdPath), { recursive: true });
      fs.writeFileSync(mdPath, next);
    }
    recordManagedBlock(manifest, mdPath, true, '', '\n', true);      // ← :179  createdFile
    out.changed.push(mdPath);
    return;
  }

  const span = locateManagedBlock(current, mdPath); // may throw on ambiguous markers
  if (span) {
    // Replace everything from begin sentinel through end sentinel (inclusive).
    const before = current.slice(0, span.begin);
    const after = current.slice(span.end);
    const next = `${before}${block}${after}`;
    if (next === current) {
      out.unchanged.push(mdPath);
    } else {
      if (!dryRun) fs.writeFileSync(mdPath, next);
      out.changed.push(mdPath);
    }
    // Manifest entry (if any) already exists from a prior run; do not re-record.
    recordManagedBlock(manifest, mdPath, false, null, null, false);  // ← :197  replace
    return;
  }

  // File present without sentinels → append with exactly one blank-line separator.
  // Non-lossy: keep the file's own trailing newline(s); insert exactly one blank
  // line before the block and record the exact bytes we add, so uninstall can
  // remove only OUR separators (audit A13).
  const pad = current.endsWith('\n') ? '' : '\n'; // ensure content ends with a newline first
  const sepBefore = `${pad}\n`; // '\n' (already newline-terminated) or '\n\n'
  const sepAfter = '\n'; // the block's own line terminator
  const next = `${current}${sepBefore}${block}${sepAfter}`;
  if (!dryRun) fs.writeFileSync(mdPath, next);
  recordManagedBlock(manifest, mdPath, false, sepBefore, sepAfter, true); // ← :210 append
  out.changed.push(mdPath);
```

**The file records the separator's shape and nothing about where it sat.** The
variable `current` — the exact prefix our separator was appended to — is in scope
at `:210` and is thrown away.

### 2. `recordManagedBlock` — `src/adapters/shared.js:100-128`

```js
function recordManagedBlock(manifest, mdPath, createdFile, sepBefore, sepAfter, inserted) {
  if (!manifest) return;
  if (!Array.isArray(manifest.entries)) manifest.entries = [];
  const existing = manifest.entries.find((e) => e.kind === 'managed-block' && e.path === mdPath);
  const entry = existing || { kind: 'managed-block', path: mdPath };
  // STICKY-TRUE (shared.js:95's rule): once we created the file, a later re-sync
  // that finds it present must NOT flip that truth back to false.
  entry.createdFile = existing ? (existing.createdFile === true ? true : createdFile) : createdFile;
  // UPDATE-ON-INSERT: record the separators THIS insertion wrote, replacing any
  // earlier ones — a delete-and-reinsert cycle can legitimately change them.
  if (inserted) {
    entry.sepBefore = sepBefore;
    entry.sepAfter = sepAfter;
  }
  if (!existing) manifest.entries.push(entry);
}
```

`createdFile` is **sticky-true**; the separators are **update-on-insert /
preserve-on-replace**. Both rules are WP-147's and neither changes here.

### 3. `reverseManagedBlock`'s leading-strip region — `src/core/manifest.js:285-311`

Byte-identical at `0f9ee08`:

```js
  // Leading separator: remove ONLY the exact bytes we added, and ONLY when doing so
  // preserves a line boundary — otherwise we would fuse two user lines (the A13 bug).
  if (sepBefore.length > 0 && before.endsWith(sepBefore)) {
    const candidate = before.slice(0, before.length - sepBefore.length);
    // The at-EOF disjunct is GATED on sepBefore === '\n\n' — i.e. on the forward
    // step having supplied the file's terminator itself. When sepBefore is '\n'
    // the file was already newline-terminated by the USER, so that newline is
    // theirs and survives even with nothing after the block.
    const weSuppliedTerminator = sepBefore === '\n\n';

    // (1) OWNERSHIP RE-CHECK. We wrote '\n\n' ONLY because the content did not end
    //     with a newline. If `candidate` ends with one now, the block is NOT at its
    //     recorded append position — the user moved it — and that newline is theirs.
    const ownershipOk = !weSuppliedTerminator || !candidate.endsWith('\n');

    // (2) ANTI-FUSION. Never remove a newline that is the boundary between two user
    //     lines.
    const noFusion =
      candidate === '' ||
      candidate.endsWith('\n') ||
      (weSuppliedTerminator && after === '') ||
      after.startsWith('\n');

    // BOTH are required. They are independent: (1) alone fuses (Table N row 7),
    // (2) alone eats a user blank line on relocation (row 6).
    if (ownershipOk && noFusion) before = candidate;
  }
  const remaining = before + after;
```

`ownershipOk` bites **only** when `sepBefore === '\n\n'`. For a recorded
`sepBefore === '\n'` the predicate reduces to `noFusion` alone, which is why a
relocated block preceded by a user blank line still collapses it — **residual A**.

### 4. `reverseSymlink` — `src/core/manifest.js:159-217`

Byte-identical at `0f9ee08`, WP-153's five rows:

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
it deletes on *target equality*, which a user's own link can satisfy — **residual
B**.

### 5. The three symlink producer sites — `src/adapters/shared.js`

`grep -n "kind: 'symlink'" src/adapters/shared.js` at `0f9ee08` returns exactly
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
| `:491` | **create** | nothing at `linkPath`; `symlink(target, linkPath)` has just succeeded |

The `else` of `:434` is WP-146's preserve arm (`:435-447`): a `wienerdog-*`
symlink whose `readlinkSync` is **not** `target` is left untouched, records no
entry, and calls `dropOwnedEntry(manifest, 'symlink', linkPath)`. **Not changed
by this WP.** The `EPERM`/`EACCES` fallback below `:491` copies the directory and
records a `copied-skill` entry — **also not changed.**

**A dry-run manifest is never persisted** — `src/cli/sync.js:340` is
`if (!dryRun) manifestMod.save(paths, manifest);` (verified at `0f9ee08`). The
`:485` entry is a report, and `uninstall` never sees it.

### 6. The entry schema — `src/core/manifest.js:902-953`

```js
const ENTRY_FIELD_TYPES = {
  file: { hash: 'string' },
  dir: {},
  symlink: { target: 'string' },
  // sepBefore/sepAfter (WP-147) are deliberately NOT type-gated here: a non-string
  // forgery must reach reverseManagedBlock so its SEP_BEFORE_OK allowlist degrades
  // to the legacy conservative strip and still removes the block (Table M:
  // "additive only, no rejection"). Type-gating would reject the entry upstream,
  // leaving the managed block installed — the disposition Table M explicitly rejects.
  'managed-block': { createdFile: 'boolean' },
  …
};
```

`validateEntry` (`:932-953`) rejects an unknown `kind` and a missing/empty/
non-string `path`; for every **listed** field it enforces the type **only when
the value is not `undefined`** (`if (value === undefined) continue;`), and extra
keys are ignored (forward-compat). `reverse()` runs it **first**, before kind
dispatch (`:658-665`), and a rejected entry is `skipped` with a notice — which,
for a symlink, means **the link is preserved**, and, for a managed block, means
**the block stays installed**. That asymmetry is why the two kinds get opposite
type-gating decisions in **Table P**.

### 7. The module doc comment — `src/core/manifest.js:16-29`

Two mirrors of the entry shapes go stale the moment fields are added:

```text
 *   {kind:'symlink', path, target?}                 — a symlink we created;
 *                                                     `target` is the source it
 *                                                     must still resolve to
 *                                                     (absent on legacy entries)
 *   {kind:'managed-block', path, createdFile:bool,
 *    sepBefore?:string, sepAfter?:string}           — a sentinel block we wrote
```

and the `@typedef ManifestEntry` at `:45-48`:

```text
 * @typedef {{kind: string, path: string, hash?: string, createdFile?: boolean,
 *            commands?: string[], unload?: string[], sepBefore?: string,
 *            sepAfter?: string}} ManifestEntry
```

Both are registered in the Mirrored Surface Checklist.

### 8. The adapters→core import direction is already established

`src/adapters/shared.js:5` is `const { hashDir } = require('../core/manifest');`
(verified at `0f9ee08`). **Adapters may import from core; core may never import
from adapters** — that is why `locateManagedBlock` is duplicated in both files
(`manifest.js:68-69` says so in a comment). This WP puts both new primitives in
`src/core/manifest.js` and imports them into `shared.js` on that same line, so
the anchor window and the hashing are defined **once**.

### 9. `fs.lstatSync(link, { bigint: true })` — measured at `0f9ee08`

```text
identity of a fresh symlink:        {"dev":"16777231","ino":"273462079"}
identity after delete+recreate:     {"dev":"16777231","ino":"273462080"}   ← CHANGED
identity of a plain file:           null   (isSymbolicLink() is false)
identity of a missing path:         null   (lstat throws)
bigint lstat ino type:              bigint
```

The inode changes on delete-and-recreate. That is the whole mechanism for
residual B's case 1. **`bigint: true` is mandatory** — a 64-bit inode exceeds
`Number.MAX_SAFE_INTEGER` and the plain form loses precision silently; `BigInt`
is not JSON-serializable, so the manifest stores **decimal strings**.

### 10. The four shipped assertions this WP flips — measured, not predicted

The prototype was run against the whole suite. **`npm test` at `0f9ee08`
unmodified: `tests 1901 / pass 1892 / fail 0`. With the prototype applied:
`tests 1901 / pass 1888 / fail 4`.** Same test count, four passes lost — so
nothing was added, skipped or silenced; exactly four
assertions flip, all four are listed in **Table F**, and all four are in files
this WP's Deliverables table already covers. No other test in the repository
changes state.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file itself (the status flip)
     and package-lock.json. Everything else must be listed. -->

**Sizing, recorded rather than implicit.** Two primitives (~18 lines) plus one
conjunct in one predicate and two rows in one reverser (~20 lines) in
`manifest.js`; one parameter and four call sites in `shared.js`; two schema/doc
cells; two test files extended, of which four shipped assertions are edited.
**M** — and it sits at the **top** of M, which is why the **Split plan** section
pre-cuts it. Do not add anything to this table without splitting.

| Action | Path | Notes |
|--------|------|-------|
| modify | src/core/manifest.js | **D1 (Part A)** — add `ANCHOR_WINDOW`, `ANCHOR_HEX` and `insertionAnchor()` beside `SEP_BEFORE_OK` (`:54-59`), and export `insertionAnchor`. **D2 (Part A)** — `reverseManagedBlock`'s leading-strip region (`:285-311`) gains the `anchorOk` conjunct per **Table Q**; **nothing else in that function changes** (Table U). **D3 (Part B)** — add `linkIdentity()` beside the other primitives and export it. **D4 (Part B)** — `reverseSymlink` gains rows **4a** and **4b** per **Table A2**, between the existing rows 4 and 5; rows 1–5 are otherwise byte-identical. **D5 (Part B)** — `ENTRY_FIELD_TYPES.symlink` becomes `{ target: 'string', origin: 'string', dev: 'string', ino: 'string' }` (`:908`); the `managed-block` cell and its comment are **unchanged** (Table P's validation column says why). **D6 (both)** — the module doc comment (`:17-26`) and the `@typedef ManifestEntry` (`:45-47`) gain the new optional fields per **Table P**. |
| modify | src/adapters/shared.js | **D7 (both)** — import the two primitives on `:5`. **D8 (Part A)** — `recordManagedBlock` (`:113`) takes a seventh parameter `anchorBefore` and assigns it inside the existing `if (inserted)` block, per **Table P**; the sticky-true `createdFile` line is **unchanged**. **D9 (Part A)** — `applyManagedBlock`'s three `recordManagedBlock` calls (`:179`, `:197`, `:210`) pass the anchor per **Table B**; **no other byte of that function changes** (Table U). **D10 (Part B)** — the three `recordOnce(manifest, { kind: 'symlink', … })` sites (`:434`, `:485`, `:491`) record `origin` (and, at `:491` only, `dev`/`ino`) per **Table B**. `recordOnce` itself is **NOT modified and NOT replaced by an upsert** — the owner declined a backfill (2026-08-01). The WP-146 preserve arm, `dropOwnedEntry`, the `readlinkSync` comparison, the `EPERM` copy fallback and every notice string stay byte-identical. |
| modify | tests/unit/manifest.test.js | **A-T1 … A-T5** and **B-T1 … B-T5** — the exact set in the Test index. **A-T5 is a required edit to a shipped assertion**, not a new test (**Table F** row 1): `manifest.test.js:1417`'s `assert.equal(forged, 'foo', …)` becomes `'foo\n\n'`. The WP-147 Table N suite (`:1336-1358`), T6, T7, T11 and T12 must pass **byte-unmodified** — they craft entries with no anchor, so they exercise the legacy arm and are the regression fence for it. |
| modify | tests/unit/shared-skill-links.test.js | **B-T6** — this is **an edit to three shipped `deepEqual` assertions** plus one new forward-side assertion. `:52-55`, `:191-194` and `:337-340` are **Table F** rows 2–4; take the expected object for each from that table. The four WP-146 sync-side tests at `:345`, `:371`, `:387` and `:405` are **fenced — they must pass byte-unmodified**. |

Not deliverables, deliberately: `src/cli/uninstall.js`, `src/cli/sync.js`, every
other reverser, `recordOnce`, `recordCopiedSkill`, `recordSettingsEntry`,
`docs/GLOSSARY.md`, `docs/adr/**`, `docs/specs/done/**`, `tests/golden/**`,
`tests/unit/claude-adapter.test.js` (measured green under the prototype — see
Table F's note).

### Exact contracts

**The two new core primitives (`src/core/manifest.js`, beside `SEP_BEFORE_OK`):**

```js
/** The bounded context window an insertion anchor covers, in JS string units
 *  (UTF-16 code units — both sides slice JS strings read with 'utf8'). Bounded
 *  ON PURPOSE: an unbounded/full-prefix anchor breaks on any edit anywhere above
 *  the block, which is the COMMON case; 256 is roughly three to four lines of
 *  markdown, enough to identify the block's neighbourhood and short enough that a
 *  distant edit does not disturb it. */
const ANCHOR_WINDOW = 256;
/** An anchor is a sha256 hex digest and nothing else. Read from the UNTRUSTED
 *  manifest, so the shape is checked before it is compared (Table N). */
const ANCHOR_HEX = /^[0-9a-f]{64}$/;

/** Hash of the last ANCHOR_WINDOW characters of the content that immediately
 *  preceded an inserted separator. HASHED, not stored raw: the manifest is a
 *  plaintext file and must never carry a copy of the user's document text.
 *  @param {string} prefix @returns {string} 64-char lowercase hex */
function insertionAnchor(prefix) {
  return crypto.createHash('sha256').update(String(prefix).slice(-ANCHOR_WINDOW), 'utf8').digest('hex');
}

/** lstat identity of a SYMLINK, as decimal strings (bigint: a 64-bit inode
 *  exceeds Number.MAX_SAFE_INTEGER, and BigInt is not JSON-serializable).
 *  Returns null when the path is not a symlink, is unreadable, or the platform
 *  cannot supply a non-zero (dev, ino) pair — see Table P's "when null" rule.
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

Both are added to `module.exports` (`manifest.js:1062`) and imported in
`src/adapters/shared.js:5`:

```js
const { hashDir, insertionAnchor, linkIdentity } = require('../core/manifest');
```

**`recordManagedBlock`'s new parameter (`shared.js:113`):**

```js
/** @param {string|null} anchorBefore the insertionAnchor() of the content that
 *  immediately preceded sepBefore. Moves with sepBefore/sepAfter under the SAME
 *  update-on-insert rule — the three fields are one fact and must never be
 *  written apart (Table P). */
function recordManagedBlock(manifest, mdPath, createdFile, sepBefore, sepAfter, inserted, anchorBefore) {
  …unchanged…
  if (inserted) {
    entry.sepBefore = sepBefore;
    entry.sepAfter = sepAfter;
    entry.anchorBefore = anchorBefore;   // ← the only added line
  }
  …unchanged…
}
```

**`reverseManagedBlock`'s new conjunct** — replaces exactly the line
`if (ownershipOk && noFusion) before = candidate;` (`manifest.js:310`):

```js
    // (3) INSERTION ANCHOR. `candidate` is the content that would remain in front
    //     of the block. It must still hash to the anchor we recorded when we wrote
    //     sepBefore — i.e. the block is still in the neighbourhood we appended it
    //     to. A relocated block lands next to bytes we never saw, so we cannot
    //     prove the separator is ours and we leave it (fail closed). An ABSENT or
    //     malformed anchor is a LEGACY entry: shipped behaviour, never stricter.
    const rec = entry.anchorBefore;
    const anchorOk = (typeof rec !== 'string' || !ANCHOR_HEX.test(rec))
      ? true
      : insertionAnchor(candidate) === rec;

    // ALL THREE are required, and the anchor is a CONJUNCT — never a disjunct.
    // It may only ever withhold a strip the other two would have allowed
    // (Table N); it may never authorise one they refused.
    if (anchorOk && ownershipOk && noFusion) before = candidate;
```

**`reverseSymlink`'s two new rows** — inserted **between** the existing row-4
block and the `// Row 5:` comment (`manifest.js:213`), nothing else touched:

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
  if (typeof entry.dev === 'string' && typeof entry.ino === 'string') {
    const id = linkIdentity(L);
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
*"not the Wienerdog skill link we recorded (replaced, or unverifiable)"*, which
is true of both new rows. Recorded as a decision so a reviewer does not read it
as an oversight.

**Producer sites (`shared.js`), per Table B:**

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

**Activation (ADR-0031's 2-of-7 test): five triggers fire, so the discipline is
on.** (i) two interface **shapes** change — the `{kind:'symlink'}` and
`{kind:'managed-block'}` manifest entries each gain fields; (iii) **schema
acceptance** changes — `ENTRY_FIELD_TYPES.symlink` gains three type-gated fields
while `managed-block` deliberately gains none; (iv) **fallback/precedence**
behaviour changes — a new legacy arm and a new fail-closed arm in two reversers;
(v) the task **crosses an authority boundary** — `shared.js` emits the evidence
and `manifest.js` alone decides what it authorises; (vii) the same contract
appears in **multiple mirrored surfaces** — four producer sites, one schema cell,
two doc comments, two reversers, two test files. **Six canonical tables** below;
every mirror is registered under the checklist.

### Table P — the provenance field schema (canonical)

**This is the single place these fields' names, types, writers, readers, legacy
behaviour and validation posture are decided.** Every other statement of them in
this spec is a mirror.

| Field | Kind | Type on disk | Written by | Exact value | Read by | Absent ⇒ | Type-gated in `ENTRY_FIELD_TYPES`? |
|-------|------|--------------|-----------|-------------|---------|----------|-----------------------------------|
| `anchorBefore` | `managed-block` | `string` — 64-char lowercase hex | `recordManagedBlock`, inside the existing `if (inserted)` block, from `applyManagedBlock`'s three call sites | `insertionAnchor(prefix)` where `prefix` is the content that immediately preceded the inserted `sepBefore`: `''` on the createdFile branch, `current` on the append branch, **not written** on the replace branch | `reverseManagedBlock`'s `anchorOk` (Table Q row 3) | **shipped 0.12.0 behaviour** — `anchorOk` is `true`, the other two conjuncts decide alone | **NO.** A non-string forgery must REACH `reverseManagedBlock` so it degrades to `anchorOk = true` and the block is still removed. Type-gating rejects the entry upstream and **leaves the managed block installed forever** — the disposition WP-147's Table M explicitly rejected, and the reason the `managed-block` cell's existing comment (`manifest.js:909-913`) exists. Measured: with `anchorBefore: 42`, the block is still removed. |
| `origin` | `symlink` | `string` — `'created'` or `'adopted'` | the three `recordOnce` sites | `'adopted'` at `:434`; `'created'` at `:485` and `:491` | `reverseSymlink` row 4a (Table A2) | **shipped 0.12.0 behaviour** — rows 1–5 as WP-153 shipped them | **YES** (`origin: 'string'`). For a symlink, a rejected entry means the **link is preserved**, which is the safe direction — the exact opposite of the managed-block case above. Any value other than the literal `'adopted'` falls through to rows 4b/5, so an unknown string is never delete authority it did not already have. |
| `dev` | `symlink` | `string` — decimal | `recordOnce` at `:491` **only** | `String(fs.lstatSync(link, {bigint:true}).dev)` | `reverseSymlink` row 4b | **shipped 0.12.0 behaviour** | **YES** (`dev: 'string'`) — same reasoning as `origin` |
| `ino` | `symlink` | `string` — decimal | `recordOnce` at `:491` **only** | `String(fs.lstatSync(link, {bigint:true}).ino)` | `reverseSymlink` row 4b | **shipped 0.12.0 behaviour** | **YES** (`ino: 'string'`) — same reasoning as `origin` |

**Rules that govern the fields as a set, decided here:**

- **P-1. `anchorBefore` moves with `sepBefore`/`sepAfter` and never apart.**
  Same `if (inserted)` block, same update-on-insert / preserve-on-replace rule.
  Writing one without the others is the exact defect class WP-147's gate rounds
  4 and 6 kept finding (a stale separator paired with a fresh one). There is no
  branch on which the anchor is recorded and the separators are not.
- **P-2. The createdFile branch records `insertionAnchor('')`, not `null`.**
  The prefix that preceded our insertion genuinely *was* the empty string (the
  file did not exist). Recording it keeps P-1 total — every insertion records all
  three — rather than adding a fourth rule. It is never consulted, because that
  branch records `sepBefore: ''` and the strip region is gated on
  `sepBefore.length > 0`; that is a consequence, not a reason to special-case it.
- **P-3. `dev`/`ino` are recorded ONLY where we created the link** (`:491`).
  Not at `:434` (we did not create it — that is what `origin: 'adopted'` says)
  and not at `:485` (nothing exists to `lstat`, and the entry is never saved).
- **P-4. When `linkIdentity()` returns `null`, record NO identity fields** —
  `origin: 'created'` alone, i.e. the legacy shape plus an origin. This is the
  **forward**-side "cannot establish identity" answer and it deliberately keeps
  shipped behaviour, because the alternative — treating unavailable identity as a
  reason to preserve — would make uninstall incomplete on any platform whose
  filesystem cannot supply a stable `(dev, ino)` pair, which is a regression
  against ADR-0019 for every user on that platform. **The fail-closed direction
  applies on the REVERSE side only** (Table A2 row 4b): identity that was
  recorded and no longer matches preserves.
- **P-5. Nothing backfills.** `recordOnce` no-ops on an existing entry
  (`shared.js:50-51`), so an install that predates this WP keeps its target-only
  symlink entries and its anchor-less managed-block entry **permanently**, through
  one sync and through a hundred. That is the owner-ruled position for `target`
  (2026-08-01) and it is inherited here unchanged. "Legacy" is a permanent state.

### Table Q — the managed-block leading-separator strip predicate (canonical)

The strip runs only when `sepBefore.length > 0 && before.endsWith(sepBefore)`
(unchanged). Inside that guard, **all three conjuncts must hold**; the first two
are WP-147's, unchanged, and are restated here only so the predicate has one home.

| # | Conjunct | Definition | Added by | Direction it can move the outcome |
|---|----------|------------|----------|-----------------------------------|
| 1 | `ownershipOk` | `!weSuppliedTerminator \|\| !candidate.endsWith('\n')`, where `weSuppliedTerminator` is `sepBefore === '\n\n'` | WP-147 | withhold only |
| 2 | `noFusion` | `candidate === '' \|\| candidate.endsWith('\n') \|\| (weSuppliedTerminator && after === '') \|\| after.startsWith('\n')` | WP-147 | withhold only |
| 3 | **`anchorOk`** | `true` when `entry.anchorBefore` is not a string or does not match `ANCHOR_HEX`; otherwise `insertionAnchor(candidate) === entry.anchorBefore` | **this WP** | **withhold only** |

**Measured behaviour, prototype vs base `0f9ee08`, on the cases that matter.**
Every row was executed end-to-end through `applyManagedBlock` → `reverse()`; the
recorded `sepBefore` is whatever the honest forward step wrote, never hand-set.

| # | Fixture (structural: how the state is produced) | recorded `sepBefore` | base `0f9ee08` | **this WP** | verdict |
|---|--------------------------------------------------|----------------------|----------------|-------------|---------|
| Q1 | **residual A, closed.** Original `paraA\n\nparaB\n`; sync appends; user **moves** the block to sit between the two paragraphs → `paraA\n\n<BLOCK>\nparaB\n` | `'\n'` | `"paraA\nparaB\n"` — the user's blank line is gone (paragraph merge) | `"paraA\n\nparaB\n"` — **byte-perfect** | **FIXED** |
| Q2 | WP-147 **T11(c)**'s existing fixture: original `paraA\n`; sync appends; user **adds** `paraB\n` *after* the block | `'\n'` | `"paraA\nparaB\n"` | `"paraA\nparaB\n"` | **unchanged — and correct.** The leading context is untouched, the anchor matches, and the `\n` really is ours. T11(c) stays green byte-unmodified. |
| Q3 | Ordinary in-place uninstall, no user edit at all, original `foo\n` | `'\n'` | `"foo\n"` | `"foo\n"` | unchanged |
| Q4 | User edits **far** above the block — first line changed, 400 filler chars between it and the block | `'\n'` | byte-perfect | byte-perfect | **unchanged — the load-bearing bound.** Red against a full-prefix or prefix-length anchor, which would withhold here and leave a stray blank line on the common path. |
| Q5 | **The declared cost.** User edits **inside** the 256-char window, immediately above the block: `paraA\n` → `paraA-EDITED\n` | `'\n'` | `"paraA-EDITED\n"` | `"paraA-EDITED\n\n"` — our blank line **stays** | **NEW COST, bounded**: one leftover whitespace byte we wrote. **Zero user bytes lost.** Table R row R2. |
| Q6 | A13 fusion probe: original `lineA\nlineB\n`; user relocates the block to `lineA\n<BLOCK>\nlineB\n` | `'\n'` | `"lineA\nlineB\n"` | `"lineA\nlineB\n"` | unchanged (`noFusion` already governed it) |
| Q7 | Q1's fixture, then an attacker **deletes** `anchorBefore` from the manifest | `'\n'` | `"paraA\nparaB\n"` | `"paraA\nparaB\n"` | **identical to base** — a stripped anchor buys exactly shipped behaviour, no more |
| Q8 | Q1's fixture, then an attacker sets `anchorBefore: 42` (non-string) | `'\n'` | `"paraA\nparaB\n"` | `"paraA\nparaB\n"`, block still removed | **identical to base** |
| Q9 | WP-147 **T9**'s in-vocabulary forgery: honest sync of `foo\n` records `sepBefore:'\n'`; the manifest is hand-edited to `'\n\n'`, no on-disk change | `'\n'` → forged `'\n\n'` | `"foo"` — the user's trailing newline is consumed | `"foo\n\n"` — **no user byte is lost**; our separator is left instead | **BOUND TIGHTENS.** Table F row 1; Table R row R1. |

**Rows Q3, Q4 and Q6 are baseline rows** (ADR-0036 A1 exemption (ii),
`PATCH: none — ordinary path`): each records the run and names the assertion that
fires only on it — Q3/Q4 assert byte-perfect restoration (red against any anchor
that withholds on the common path), Q6 asserts non-fusion (red against removing
`noFusion`). Their measured base-vs-prototype equality is the exemption's
evidence, not an author's claim.

### Table A2 — what `reverseSymlink(entry)` does after this WP (canonical)

Conditions are evaluated **in order**; the first that holds decides. `L` is
`entry.path` (the link), `T` is `entry.target`. Rows 1–5 are WP-153's and are
restated here in full so this spec is self-contained; **rows 4a and 4b are new.**

| # | Condition | Filesystem action | Bucket | stderr | Why it is the fail-safe answer |
|---|-----------|-------------------|--------|--------|--------------------------------|
| 1 | `!isSymlink(L)` | none | `skipped` | none | A real file/dir at `L`, or nothing at all, is definitionally not the link we made. |
| 2 | `typeof T !== 'string' \|\| T === ''` — a **LEGACY** entry | none | `skipped` | `wienerdog: keeping <L> — not the Wienerdog skill link we recorded (replaced, or unverifiable)` | Ownership unprovable; owner-ruled 2026-08-01. |
| 3 | `sameResolvedDir(L, T) === false` **and** `fs.readlinkSync(L) !== T` | none | `skipped` | same line | The link points somewhere else. Both sub-tests are fail-closed. **The lexical sub-test is dead through production and stays anyway** — see Implementation notes. |
| 4 | **`OWNED(L)` is false** — basename not `wienerdog-*`, **or** `path.dirname(L)` does not realpath-equal a harness skills root | none | `skipped` | same line | A forged `(path, target)` pair is not delete authority (WP-153 gate round 4). |
| **4a** | **`entry.origin === 'adopted'`** | none | `skipped` | same line | **NEW.** The link was already on disk when we first recorded it — `applySkillLinks`' adopt branch (`shared.js:434`) sees a `wienerdog-*` link already pointing at our source and records it. It is the user's. Closes residual B case 2. |
| **4b** | **`typeof entry.dev === 'string' && typeof entry.ino === 'string'`** **and** `linkIdentity(L)` is `null` **or** does not equal `(entry.dev, entry.ino)` | none | `skipped` | same line | **NEW.** We recorded which file object we created; this is not it. A delete-and-recreate gets a new inode (measured, Current state §9), so a user's same-source replacement no longer passes for ours. Closes residual B case 1. `linkIdentity` returning `null` is fail-closed by construction. |
| 5 | otherwise | `if (!dryRun) fs.unlinkSync(L)` | `removed` **and** `removedSet.add(L)` | none | In-namespace, under a harness skills root, resolves to the recorded source, **not adopted**, and **still the file object we created**. The only row that deletes. |

**Measured behaviour, prototype vs base `0f9ee08`.** Each row was run end-to-end
through `applySkillLinks` → `reverse()`.

| # | Fixture (structural) | base `0f9ee08` | **this WP** | verdict |
|---|----------------------|----------------|-------------|---------|
| S1 | our own link, untouched between sync and uninstall | removed | removed | **unchanged — the completeness fence.** Baseline row: red against making identity *required* rather than *checked-when-present*. |
| S2 | **residual B case 1.** User `unlink`s our link and re-creates their own `wienerdog-foo` pointing at the **same** core source | **removed** — the user's link is deleted | **preserved** | **FIXED** |
| S3 | **residual B case 2.** User had already created `wienerdog-foo` → our source *before* the first sync; the adopt branch records it | **removed** — a link the user created is deleted | **preserved** | **FIXED** |
| S4 | **legacy** entry: `{kind, path, target}`, no `origin`/`dev`/`ino` (an install written before this WP) | removed | **removed** | **unchanged — the backward-compat fence.** Red against "no identity ⇒ preserve", which would strand every pre-existing install's symlinks. |
| S5 | attacker forges `origin: 'adopted'` on our own entry | removed | preserved | **narrows only** |
| S6 | attacker sets a non-string `ino` | removed | preserved (`validateEntry` rejects the entry upstream) | **narrows only** |
| S7 | attacker forges a wrong `(dev, ino)` pair | removed | preserved | **narrows only** |

### Table B — what each producer site records (canonical)

| Site | Branch | `kind`/`path`/`target` | `origin` | `dev`/`ino` | `sepBefore`/`sepAfter`/`anchorBefore` |
|------|--------|------------------------|----------|-------------|----------------------------------------|
| `shared.js:434` | symlink **adopt** | unchanged | **`'adopted'`** | **none** (we did not create it) | n/a |
| `shared.js:485` | symlink **dryRun** | unchanged | **`'created'`** | **none** (nothing exists to `lstat`; never saved — `sync.js:340`) | n/a |
| `shared.js:491` | symlink **create** | unchanged | **`'created'`** | **`linkIdentity(linkPath)`**, or **none** when it returns `null` (P-4) | n/a |
| `shared.js:179` | managed-block **createdFile** | unchanged | n/a | n/a | `''` / `'\n'` / **`insertionAnchor('')`**, `inserted = true` |
| `shared.js:197` | managed-block **replace** | unchanged | n/a | n/a | `null` / `null` / **`null`**, `inserted = false` → **all three PRESERVED** |
| `shared.js:210` | managed-block **append** | unchanged | n/a | n/a | `sepBefore` / `'\n'` / **`insertionAnchor(current)`**, `inserted = true` |

**The replace branch must not refresh the anchor, and this is the one place an
implementer will get it wrong.** `sync` runs the replace branch on every re-sync,
and `span.begin` is in scope there, so recomputing the anchor from the current
file *looks* like a free accuracy win. It is the opposite: it would re-attest to
separator bytes we did **not** write in that run. A user relocates the block, the
next `sync` replaces the block's body, and a refreshed anchor would bless the
user's blank line as ours — re-opening residual A through the front door. The
anchor describes **the insertion that wrote the recorded separators**, which is
exactly the `inserted === true` condition it already lives under (P-1).

### Table N — the strictly-negative posture, proved per field (canonical)

**The theorem this WP must satisfy:** for every possible manifest, the set of
filesystem mutations performed after this WP is a **subset** of the set performed
by `0f9ee08`. New evidence may only withhold a deletion. Stated per field, with
the measured row that proves it:

| Forgery | What an attacker gains | Measured | Row |
|---------|------------------------|----------|-----|
| delete `anchorBefore` | exactly shipped 0.12.0 behaviour — bounded by WP-147's Table M envelope (at most one newline per side, cannot cross a line boundary into user text) | `"paraA\nparaB\n"`, identical to base | Q7 |
| set `anchorBefore` to a non-string / non-hex value | same as deleting it; the block is still removed, so uninstall is not made incomplete either | `"paraA\nparaB\n"`, block removed | Q8 |
| set `anchorBefore` to a *different valid* hash | a **withheld** strip — our separator is left behind. Incompleteness, never data loss | (subsumed by Q5's measurement of the same code path) | Q5 |
| set `anchorBefore` to the hash the attacker computed from the real file | shipped behaviour. Requires read access to the file whose bytes they want deleted, in which case they can already read and write it directly | — | see Implementation notes |
| delete `origin`/`dev`/`ino` | shipped 0.12.0 behaviour — bounded by row 4's `OWNED(L)` gate to the `wienerdog-` namespace in the two harness skills dirs | removed, identical to base | S4 |
| set `origin: 'adopted'` | a **preserved** link. Only ever narrows | preserved | S5 |
| non-string `dev`/`ino` | `validateEntry` rejects the entry → preserved. Only ever narrows | preserved | S6 |
| a wrong `(dev, ino)` pair | preserved. Only ever narrows | preserved | S7 |
| a *correct* `(dev, ino)` pair read off the live link | shipped behaviour. The attacker must already be able to `lstat` the link they want deleted | — | see Implementation notes |

**Neither mechanism closes manifest forgery, and neither claims to.** An
attacker who can rewrite the manifest can always delete the new fields and get
`0f9ee08`'s behaviour. **What this WP closes is HONEST-USE ownership** — a user
who moved a block or re-made a link, with nothing forged. That is precisely what
residuals A and B were, and it is stated here so a review does not read the
forgery bound as a gap this WP left open. Manifest integrity (signing/HMAC) is
declined for the same reason WP-147 and WP-153 declined it: the file carries no
integrity protection at all, `reverseCopiedSkill`'s `hash` lives with the
identical residual, and protecting one field while the file is otherwise
unprotected buys nothing. **Out of scope by declaration**, not by omission.

### Table F — the four shipped assertions this WP FLIPS (canonical)

**Measured, not predicted.** `npm test` at `0f9ee08` with the design applied:
`tests 1901 / pass 1888 / fail 4`. These are the four, and there are no others.

| # | File:line | Test | Current expectation | **New expectation** | Why the new one is correct |
|---|-----------|------|---------------------|---------------------|----------------------------|
| 1 | `tests/unit/manifest.test.js:1417` | `WP-147 T9 (Table M bound): an in-vocabulary at-EOF forgery loses exactly one newline, never text` | `assert.equal(forged, 'foo', 'forged entry loses exactly the trailing newline')` | `assert.equal(forged, 'foo\n\n', 'forged entry now loses NOTHING — the anchor refuses the forged separator claim and our blank line is left instead')` | The forgery claims `sepBefore: '\n\n'`, so `candidate` becomes `''`, which does not hash to the recorded anchor of `'foo\n'` → the strip is withheld. **The declared bound tightens from "one whitespace byte" to "zero user bytes".** Keep the third assertion (`control.replace(/\n/g,'') === forged.replace(/\n/g,'')`) **exactly as is** — it still holds and it is the assertion that fails if the loss ever widens past whitespace. Update the test's leading comment to say the bound tightened; **do not** rename the test. |
| 2 | `tests/unit/shared-skill-links.test.js:52-55` | `skill symlinked into the target dir with the default seam (POSIX)` | `assert.deepEqual(…, [{ kind: 'symlink', path: linkPath, target: coreSkill }])` | **Cannot stay a literal** — the entry now carries machine-specific `dev`/`ino`. Replace with: assert the entry's `kind`/`path`/`target`/`origin` equal `'symlink'`/`linkPath`/`coreSkill`/`'created'`, **and** assert `{ dev: entry.dev, ino: entry.ino }` deep-equals `linkIdentity(linkPath)` — i.e. the recorded identity is the live identity of the link that was just created. Get `linkIdentity` by extending the **existing** destructure at `shared-skill-links.test.js:10` (`const { hashDir } = require('../../src/core/manifest');`); do not add a second `require` of the same module | This is the create branch (`shared.js:491`) and it is the **only** site that records identity. Asserting against the live `linkIdentity` rather than a hardcoded number is what makes the row portable; asserting it is **non-null** on POSIX is what makes it non-vacuous. |
| 3 | `tests/unit/shared-skill-links.test.js:191-194` | `dry-run records a symlink entry and reports the change without writing` | `[{ kind: 'symlink', path: linkPath, target: path.join(skillsDir, 'wienerdog-setup') }]` | `[{ kind: 'symlink', path: linkPath, target: path.join(skillsDir, 'wienerdog-setup'), origin: 'created' }]` | Dry run writes nothing, so there is no link to `lstat` and no identity to record (Table B). The literal stays a literal. **`coreSkill` is NOT in scope in this test** — `:181` destructures only `{ skillsDir, targetSkillsDir }`; build the target inline from `skillsDir`, as the shipped assertion already does. |
| 4 | `tests/unit/shared-skill-links.test.js:337-340` | `a pre-existing correct symlink is adopted into the manifest (recorded, reported unchanged)` | `[{ kind: 'symlink', path: linkPath, target: coreSkill }]` | `[{ kind: 'symlink', path: linkPath, target: coreSkill, origin: 'adopted' }]` | This is the adopt branch (`shared.js:434`). No identity is recorded (P-3) and `origin` is `'adopted'` — the two facts that make row 4a fire on uninstall. |

**`tests/unit/claude-adapter.test.js` does NOT flip and is not a deliverable.**
Its `a user-relocated mid-file block uninstalls to exactly one blank line` test
(`:342`) goes through the adapter's **createdFile** branch, which records
`sepBefore: ''`; the strip region is gated on `sepBefore.length > 0`, so the
anchor is never consulted. Measured green under the prototype. Stated because a
previous WP on this exact code path *did* flip that test, and an implementer who
remembers that will go looking.

### Table U — the regions that must stay BYTE-IDENTICAL

**"Unchanged" means byte-for-byte against the FILE** — `sed -n '<range>p' <file>`
at `0f9ee08` — **not** against this spec's excerpts, which are dedented and carry
`// ←` annotations that are not in the file. Named explicitly because a stale
quote in a predecessor spec would have led an implementer to regress WP-144's
delete-time binding.

| Region | `0f9ee08` anchor | Must stay |
|--------|------------------|-----------|
| `reverseManagedBlock`'s signature | `manifest.js:240` | `reverseManagedBlock(entry, dryRun, removed, skipped, removedSet, fd, target)` — do **not** drop `fd`/`target` or re-derive them inside the function. |
| The read | `manifest.js:241-247` | `fs.readFileSync(fd, 'utf8')` inside its `try`. **Never re-open by pathname.** |
| The ambiguity `try/catch` and the `span === null` skip | `manifest.js:248-262` | unchanged |
| The `before`/`after` slice and the Table M separator-vocabulary block | `manifest.js:263-283` | unchanged — the two `content.slice` lines, `SEP_BEFORE_OK`, the stderr notice, the legacy defaults, the trailing-terminator strip |
| `ownershipOk` and `noFusion` | `manifest.js:287-306` | unchanged — the anchor is a **third** conjunct, not a replacement for either |
| The `createdFile` delete | `manifest.js:314-316` | `fs.rmSync(target, { force: true })` — the pathname delete using `target`, **not** `entry.path` |
| The fd-bound write | `manifest.js:317-321` | `Buffer.from(remaining)` + `fs.ftruncateSync(fd, 0)` + `fs.writeSync(fd, buf, 0, buf.length, 0)`. **Never `fs.writeFileSync(entry.path, remaining)`** — that is the pre-F30 shape and restoring it silently regresses WP-144's delete-time binding (a swap-to-symlink between read and write would escape the `O_NOFOLLOW` check the caller already paid for). **V3 is the guard.** |
| `reverseSymlink` rows 1–5 | `manifest.js:169-216` | unchanged except for the two new blocks inserted **before** the `// Row 5:` comment. In particular the row-3 `lexicalMatch` `try`/`catch` stays (see Implementation notes). |
| The `reverse()` symlink arm | `manifest.js:817-828` | unchanged — including the `skillsRoots` argument. `reverseSymlink`'s signature does **not** change in this WP. |
| The `reverse()` managed-block arm | `manifest.js:829-869` | unchanged — the `O_NOFOLLOW` open, the `ELOOP`/`ENOENT` arms, the `finally` close |
| `applyManagedBlock`'s branch bodies | `shared.js:164-211` | unchanged except the three `recordManagedBlock` argument lists. **`out.changed.push(mdPath);` at `:211` and `:180` must survive** — a predecessor spec's snippet dropped it and `sync` silently stopped reporting the file as changed. |
| `applySkillLinks`' preserve arm, directory arm and EPERM fallback | `shared.js:435-447`, `:448-479`, `:492-499` | unchanged |
| `recordOnce` | `shared.js:47-52` | unchanged — **not** replaced by an upsert (P-5) |

### Mirrored Surface Checklist

Every surface in this spec that mirrors a canonical table, registered so one
review finding updates the table and all its mirrors in a single pass. Any new
mirror found in review is added here on the spot.

**Table P (field schema)** — mirrors:

- [ ] Deliverables cells **D5**, **D6**, **D8**, **D10**
- [ ] Exact contracts: the `recordManagedBlock` JSDoc and the producer-site block
- [ ] `src/core/manifest.js:17-26` module doc comment (an in-code mirror — D6)
- [ ] `src/core/manifest.js:45-47` `@typedef ManifestEntry` (an in-code mirror — D6)
- [ ] `src/core/manifest.js:908` `ENTRY_FIELD_TYPES.symlink` (an in-code mirror — D5)
- [ ] Current state §6 (the schema quote) and §7 (the doc-comment quote)
- [ ] Table B (per-site values), Table N (per-field forgery posture)
- [ ] Acceptance criteria **AC1**, **AC2**, **AC9**
- [ ] Verification **V5**, **V6**

**Table Q (strip predicate)** — mirrors:

- [ ] Deliverables cell **D2**
- [ ] Exact contracts: the `anchorOk` snippet
- [ ] Current state §3 (the shipped predicate)
- [ ] Table U's `ownershipOk`/`noFusion` row
- [ ] Acceptance criteria **AC3**, **AC4**, **AC5**
- [ ] Test index **A-T1 … A-T5**; Table F row 1; Table R rows **R1**, **R2**
- [ ] Verification **V2**

**Table A2 (reverseSymlink rows)** — mirrors:

- [ ] Deliverables cell **D4**
- [ ] Exact contracts: the rows 4a/4b snippet and the one-stderr-string decision
- [ ] Current state §4 (the shipped five rows)
- [ ] Table U's `reverseSymlink` row
- [ ] Acceptance criteria **AC6**, **AC7**, **AC8**
- [ ] Test index **B-T1 … B-T5**; Table R rows **R3**, **R4**, **R5**
- [ ] Verification **V4**

**Table B (producer sites)** — mirrors:

- [ ] Deliverables cells **D9**, **D10**
- [ ] Exact contracts: the producer-site block
- [ ] Current state §1 and §5 (the shipped call sites)
- [ ] Table P's "Written by" and "Exact value" columns
- [ ] Table F rows 2–4 (the assertions that observe these values)
- [ ] Test index **B-T6**; Acceptance criterion **AC9**

**Table F (flipped assertions)** — mirrors:

- [ ] Deliverables cells for both test files
- [ ] Current state §10
- [ ] Test index **A-T5**, **B-T6**
- [ ] Acceptance criterion **AC10**

**Table N (strictly-negative posture)** — mirrors:

- [ ] Table P's type-gating column
- [ ] Table Q rows **Q7**, **Q8**; Table A2's measured rows **S4**–**S7**
- [ ] Security checklist
- [ ] Acceptance criterion **AC8**; Test index **A-T4**, **B-T5**

## Test index

Every row names how its state is produced **structurally** (the event that must
have happened), never by position in a sequence, and names the implementation it
reddens (ADR-0036 A1/A2). Rows whose job is to observe the ordinary path declare
`red against` explicitly rather than leaving reachability implied.

### Part A — `tests/unit/manifest.test.js`

Reuse the shipped `applyManagedBlock`-based harness at `manifest.test.js:1425-1445`
(T11's `run(original, expectedSep, template)`): it syncs an honest original, asserts
the recorded `sepBefore`, then rewrites the file from a template with `<BLOCK>`
substituted. **Set every Part A fixture up honestly through that path** — do not
hand-write manifest entries except where the row's job is forgery.

| # | Fixture (structural) | Assertion | Red against |
|---|----------------------|-----------|-------------|
| **A-T1** | Table Q row **Q1**: original `paraA\n\nparaB\n`, honest sync (records `sepBefore: '\n'`), then the file is rewritten to `paraA\n\n<BLOCK>\nparaB\n` — the block **moved**, the leading context changed | final content is **exactly** `paraA\n\nparaB\n`; also assert `typeof entry.anchorBefore === 'string'` so the row cannot pass by the legacy arm | base `0f9ee08` (yields `paraA\nparaB\n` — **measured**) and any implementation that treats the anchor as a disjunct |
| **A-T2** | Table Q rows **Q3** and **Q4**, two cases: (a) honest sync of `foo\n`, no edit, uninstall; (b) honest sync of `head\n` + 400 filler chars + `tail-para\n`, then the **first** line is edited and the block is left where it was | both restore **byte-perfectly** | (b) is red against a full-prefix or prefix-length anchor. **This is the row that justifies `ANCHOR_WINDOW` being bounded**; without it the design's central trade-off has no detector. |
| **A-T3** | Table Q row **Q5**: honest sync of `paraA\n`, then the line immediately above the block is edited to `paraA-EDITED\n` | final content is **exactly** `paraA-EDITED\n\n`; **and** assert `final.replace(/\n+$/, '') === 'paraA-EDITED'` — no user byte is lost, only our separator survives | `PATCH: none — this is the declared cost, pinned at its declared size.` Not red-first: it pins Table R row **R2** so the next "I found a case where a newline is left behind" report resolves against a committed assertion. It goes red only if the cost ever grows into user text. |
| **A-T4** | Table Q rows **Q7** and **Q8**: A-T1's fixture, then the manifest entry is mutated — (a) `delete entry.anchorBefore`, (b) `entry.anchorBefore = 42` | both yield **exactly** base behaviour `paraA\nparaB\n`, **and** the block is in `res.removed` (uninstall is not made incomplete), **and** no `ignoring out-of-vocabulary separator metadata` notice fires (that notice belongs to `sepBefore`/`sepAfter`, not the anchor) | any implementation that type-gates `anchorBefore` in `ENTRY_FIELD_TYPES` (the entry would be rejected upstream and the block left installed), and any that treats a malformed anchor as a mismatch |
| **A-T5** | **EDIT to the shipped test at `:1396-1423`** — Table F row 1. Fixture unchanged | `assert.equal(forged, 'foo\n\n', …)`; the control and the newline-stripped-equality assertions stay byte-unmodified | `PATCH: none — a shipped assertion whose expected value moved.` Its red-ness is Table F's measurement: it fails at `0f9ee08` + this design with `'foo\n\n' !== 'foo'`, which is exactly why it must be edited rather than left. |

### Part B — `tests/unit/manifest.test.js` and `tests/unit/shared-skill-links.test.js`

| # | Fixture (structural) | Assertion | Red against |
|---|----------------------|-----------|-------------|
| **B-T1** | Table A2 row **S2**: honest `applySkillLinks` create, then `fs.unlinkSync(link)` followed by `fs.symlinkSync(coreSkill, link)` — a new file object at the same path with the same target | the link **still exists** after `reverse()`, is in `skipped`, and the stderr `keeping …` line fired | base `0f9ee08` (**measured**: the link is deleted) |
| **B-T2** | Table A2 row **S3**: the link is created **before** `applySkillLinks` runs, so the adopt branch records it | the link **still exists** after `reverse()`, is in `skipped`; **and** the recorded entry has `origin: 'adopted'` and **no** `dev`/`ino` | base `0f9ee08` (**measured**: the link is deleted). Assert the entry shape too — the end state alone tells you something is wrong; the entry tells you which rule fired. |
| **B-T3** | Table A2 row **S1**: honest create, nothing touched, uninstall | the link is **removed** and is in `removed` | `TRIGGER: none — the ordinary path.` Baseline row; red against making identity *required*, and against any row 4a/4b that fires on our own untouched link. |
| **B-T4** | Table A2 row **S4**: honest create, then `delete entry.origin; delete entry.dev; delete entry.ino` — the shape an install written before this WP has | the link is **removed** | any implementation where absent identity means preserve. **This is the backward-compatibility fence** and the ADR-0019 reversibility contract's detector. |
| **B-T5** | Table A2 rows **S5**, **S6**, **S7**: three mutations of an honest entry, one per case — `origin = 'adopted'`; `ino = 12345` (non-string); `ino = '999999999'` (wrong value) | all three **preserve** the link | any implementation where a forged provenance field widens deletion. Three separate rows, three separate mutations (ADR-0036 A3) — they are independently revertible and each reddens a different arm (row 4a; `validateEntry`; row 4b). |
| **B-T6** | `shared-skill-links.test.js` — the three **Table F** rows 2–4 plus their forward-side identity assertion | exactly the expectations in Table F | `PATCH: none — shipped assertions whose expected values moved.` Their red-ness is Table F's measurement (three `ERR_ASSERTION` failures at `0f9ee08` + this design). |

**Idempotency (AC11) is asserted inside B-T3 and A-T2(a)** rather than as its own
row: run the forward step **twice** before uninstalling and assert the manifest
entries are deep-equal to the first run's and the file bytes are unchanged.
Measured on the prototype: second `applySkillLinks` → entries identical, `changed`
empty, one `unchanged`; second `applyManagedBlock` → bytes identical, entries
identical, one `unchanged`.

## Implementation notes & constraints

- **No new npm dependencies.** `node:crypto` is already required in
  `src/core/manifest.js:5`; `src/adapters/shared.js` gets the primitives by
  import, not by requiring `crypto` itself.
- **`ANCHOR_WINDOW` is defined ONCE**, in `src/core/manifest.js`, and reaches
  `shared.js` through the exported `insertionAnchor`. Do **not** duplicate the
  constant or the hashing into `shared.js`. The forward and reverse sides
  computing the same digest is the entire mechanism; two copies of a magic number
  is how it silently stops being the same digest. (`locateManagedBlock` **is**
  duplicated in both files — that duplication exists because `manifest.js` is
  core and may not import from `adapters/`. The reverse direction, `adapters/` →
  core, is already established at `shared.js:5`.)
- **Why a bounded window and not the whole prefix, or a prefix length.** All
  three detect the relocation in Table Q row Q1. The whole prefix and the prefix
  length also fire on **any** edit anywhere above the block — including adding a
  paragraph at the top of `CLAUDE.md`, which users do — and each false fire
  leaves a stray blank line on an ordinary uninstall. WP-147 named that exact
  trade in its own words: closing the residual must not *"trade a rare cosmetic
  collapse for a **common** leftover blank line."* A bounded window keeps the
  common case correct (Table Q row Q4, measured) and pays only in the narrow case
  where the user edited the text immediately above the block (row Q5). **A prefix
  length is additionally rejected on its own merits**: it is strictly weaker than
  the window (a relocation into a same-length neighbourhood defeats it) while
  being strictly more brittle (every edit above changes it), so it loses on both
  axes. Do not add it "for extra safety" — conjoining it would delete Q4's
  property.
- **Why a hash and not the raw context.** `install-manifest.json` is a plaintext
  file. Storing 256 raw characters of the user's `CLAUDE.md` in it would copy
  user document text into the core, which is a new disclosure surface for zero
  functional gain — equality is all the reverser needs.
- **Hash the string, not a normalized form.** `insertionAnchor` slices a JS
  string and hashes it as UTF-8. Both sides read their content with
  `fs.readFileSync(…, 'utf8')`, so both slice the same units. Do **not**
  normalize line endings, trim, or `NFC`-normalize — the anchor's job is exact
  byte-neighbourhood identity, and any normalization creates pairs of different
  files with the same anchor.
- **The anchor is a CONJUNCT.** There is one case where the anchor matching would
  arguably license a strip that `noFusion` refuses: an unterminated original
  `lineA`, `sepBefore: '\n\n'`, and the user appends `lineB\n` after the block.
  Byte-perfect restoration there is `lineAlineB\n` — which **fuses two lines**.
  WP-147's `noFusion` refuses it, and that refusal stands: fusion is the defect
  WP-147 exists to prevent and no new evidence overrides it. Pinned by WP-147's
  shipped T11(b), which must stay green byte-unmodified.
- **The row-3 lexical fallback in `reverseSymlink` stays.** WP-153's 2026-08-02
  post-merge note established that `fs.readlinkSync(L) === T` is **dead through
  production** — `reverse()`'s symlink arm calls `withinAllowedRoot`, whose
  `realpathSync` throws `ENOENT` on a dangling link and preserves the entry
  before `reverseSymlink` runs — and issued a **standing instruction**: the
  fallback stays in the code and in the contract until
  `WP-symlink-lexical-fallback-removal` lands. **Do not remove it here**, and do
  not "tidy" it while adding rows 4a/4b. The shipped test that reaches it
  (`manifest.test.js:1564`, *"reverseSymlink: a dangling own link is still removed
  via the lexical fallback — Table A row 3→5 (T4)"*) calls `reverseSymlink`
  **directly**; its entry (`:1585`) is `{ kind: 'symlink', path: link, target:
  source }` with no `origin`/`dev`/`ino`, so rows 4a and 4b do not fire and it
  stays green byte-unmodified. Measured.
- **Do not extend the anchor to the trailing side.** `sepAfter` is always exactly
  `'\n'` — the block's own line terminator, which is ours on every branch — and
  WP-147's Table M bounds a forged `sepAfter` to that single value. An
  `anchorAfter` would add a field, a check and a failure mode to protect one byte
  that is already bounded. Out of scope; see Out of scope.
- **The two "attacker supplies a correct value" rows of Table N are not
  weaknesses.** Forging a matching anchor requires reading the target file's
  bytes; forging a matching `(dev, ino)` requires `lstat`-ing the target link. An
  attacker with either capability can already read and write the artifact
  directly and does not need `uninstall` as a confused deputy. Stated because
  both will be raised in review.
- **Ambiguity → choose the simpler option** and record it in the PR body under
  "Decisions made". Do NOT expand scope. In particular: if a Table Q or Table A2
  row disagrees with prose anywhere in this spec, **the table wins** and the prose
  is a spec bug — say so in the PR body.

## Security checklist

- [ ] **The manifest is untrusted input and every new field is read from it.**
      `anchorBefore` is shape-checked against `ANCHOR_HEX` (`^[0-9a-f]{64}$`,
      fully anchored, no `m` flag) **before** it is compared, and a value failing
      that check is treated as **absent**, not as a mismatch — matching WP-147's
      Table M disposition, which rejected "skip the entry" precisely because it
      hands an attacker a way to make uninstall incomplete.
- [ ] **No new field flows into a filesystem path, a shell command, or an
      argument vector.** `anchorBefore` is hashed and compared; `dev`/`ino` are
      string-compared; `origin` is compared against one literal. None is joined,
      resolved, opened, spawned, or written. There is no untrusted-identifier
      path-traversal surface to anchor.
- [ ] **`linkIdentity` never dereferences.** `fs.lstatSync` is link-level by
      definition and the function returns `null` unless `isSymbolicLink()` is
      true, so a swapped file or directory at the recorded path can never produce
      an identity match. Every throw is caught and degrades to `null`, which
      Table A2 row 4b treats as **preserve**.
- [ ] **The new evidence only ever narrows deletion** (Table N), proved per field
      by measured rows A-T4 and B-T5. This is the property that keeps a forged
      manifest from being a *new* deletion primitive — the failure mode both
      predecessor WPs shipped a gate round to close.
- [ ] **WP-144's F30 delete-time binding is untouched.** All managed-block IO
      still goes through the single `O_NOFOLLOW`-verified fd; the `createdFile`
      delete still uses the canonical `target` pathname. **V3 is the executable
      guard and it is proved red as well as green.**
- [ ] **No user document text enters the manifest.** The anchor is a digest, not
      a copy (Implementation notes).

## Acceptance criteria

- [ ] **AC1.** `src/core/manifest.js` exports `insertionAnchor` and
      `linkIdentity`; `src/adapters/shared.js:5` imports both from
      `../core/manifest`. `ANCHOR_WINDOW` appears **exactly once** in `src/`.
- [ ] **AC2.** The module doc comment and `@typedef ManifestEntry` list
      `anchorBefore?`, `origin?`, `dev?` and `ino?` per Table P.
- [ ] **AC3.** Table Q row **Q1** yields byte-perfect `paraA\n\nparaB\n`
      (residual A is closed) — A-T1.
- [ ] **AC4.** Table Q rows **Q3** and **Q4** still restore byte-perfectly — the
      anchor does not withhold on the ordinary path or on a distant edit — A-T2.
- [ ] **AC5.** Table Q row **Q5** yields `paraA-EDITED\n\n`: our separator is left,
      **no user byte is lost** — A-T3.
- [ ] **AC6.** Table A2 rows **S2** and **S3** preserve the link (residual B is
      closed) — B-T1, B-T2.
- [ ] **AC7.** Table A2 rows **S1** and **S4** still remove the link — our own
      untouched link, and a legacy target-only entry. Uninstall stays complete for
      every install written before this WP.
- [ ] **AC8.** Every forgery row of Table N behaves exactly as measured: deleting
      or corrupting any new field yields **base `0f9ee08` behaviour**, and no
      forged value widens deletion — A-T4, B-T5.
- [ ] **AC9.** Each of the four producer sites records exactly what Table B says,
      no more and no less — B-T6, plus the `origin: 'adopted'` / no-identity
      assertion in B-T2.
- [ ] **AC10.** The four Table F assertions are updated to their new expectations
      and pass; **every other test in the repository passes byte-unmodified**,
      including WP-147's Table N suite, T6, T7, T11, T12 and WP-153's T1–T4, T6
      and the four fenced WP-146 sync-side tests.
- [ ] **AC11.** Running the forward step twice is idempotent: identical file bytes
      and deep-equal manifest entries after the second run.
- [ ] **AC12.** `npm run lint` passes.

## Verification steps (run these; paste output in the PR)

```bash
# V1 — the whole suite. Expect zero failures.
npm test

# V2 — Part A, targeted.
node tests/run.js tests/unit/manifest.test.js

# V3 — F30 delete-time binding survived (WP-144). MUST FAIL if the pre-F30 shape
#      returns. Prove it BOTH ways: run it once as-is, then once against a scratch
#      copy carrying the injection, and paste both outputs.
grep -q "fs.writeFileSync(entry.path, remaining)" src/core/manifest.js && {
  echo "FAIL: pre-F30 pathname write restored in reverseManagedBlock"; exit 1; }
grep -q "fs.ftruncateSync(fd, 0)" src/core/manifest.js || {
  echo "FAIL: fd-bound truncate is gone"; exit 1; }
grep -q "fs.rmSync(target, { force: true })" src/core/manifest.js || {
  echo "FAIL: the createdFile delete no longer uses the canonical target"; exit 1; }
echo "V3 ok"

# V4 — WP-153's row 3 lexical fallback is still present (standing instruction:
#      it stays until WP-symlink-lexical-fallback-removal lands).
grep -q "lexicalMatch = fs.readlinkSync(L) === T;" src/core/manifest.js || {
  echo "FAIL: the row-3 lexical fallback was removed out of scope"; exit 1; }
grep -q "!sameResolvedDir(L, T) && !lexicalMatch" src/core/manifest.js || {
  echo "FAIL: row 3's conjunction changed"; exit 1; }
echo "V4 ok"

# V5 — the anchor window is defined exactly once, and shared.js does not redefine
#      it or re-implement the digest.
test "$(grep -c 'ANCHOR_WINDOW' src/core/manifest.js)" -ge 2 || {
  echo "FAIL: ANCHOR_WINDOW missing from manifest.js"; exit 1; }
grep -q 'ANCHOR_WINDOW' src/adapters/shared.js && {
  echo "FAIL: ANCHOR_WINDOW duplicated into shared.js"; exit 1; }
grep -q "createHash('sha256')" src/adapters/shared.js && {
  echo "FAIL: shared.js re-implements the digest instead of importing insertionAnchor"; exit 1; }
echo "V5 ok"

# V6 — anchorBefore is NOT type-gated (Table P); the symlink cell IS.
grep -q "anchorBefore: 'string'" src/core/manifest.js && {
  echo "FAIL: anchorBefore type-gated — a non-string forgery would leave the block installed"; exit 1; }
grep -q "symlink: { target: 'string', origin: 'string', dev: 'string', ino: 'string' }" src/core/manifest.js || {
  echo "FAIL: the symlink schema cell does not match Table P"; exit 1; }
echo "V6 ok"

# V7 — lint.
npm run lint
```

**V3, V5 and V6 each have a real failure mode** — every one of them was written
as `grep -q … && exit 1` or `|| exit 1`, never as a bare `grep` that prints
matches and exits 0. A predecessor WP shipped a verification step that could not
fail; do not repeat it. **Paste the red run as well as the green run for V3.**

## Out of scope (do NOT do these)

- **Manifest integrity (signing/HMAC).** Declared out of scope by Table N, for
  the same reason WP-147 and WP-153 declined it. A separate design with its own
  review.
- **Removing the row-3 lexical fallback** from `reverseSymlink` — routed to
  `WP-symlink-lexical-fallback-removal`, under WP-153's standing instruction.
- **Backfilling `origin`/`dev`/`ino`/`anchorBefore` onto existing entries**, or
  replacing `recordOnce` with an upsert. The owner declined a backfill on
  2026-08-01 and P-5 inherits that ruling.
- **An `anchorAfter` / trailing-side anchor.** See Implementation notes.
- **Changing `locateManagedBlock`, `buildBlock`, the sentinel strings, or
  `SEP_BEFORE_OK`.**
- **Any change to `reverseManagedBlock`'s fd-bound IO, its signature, or its
  `target`-based delete** — WP-144 F30's, guarded by V3.
- **`reverseSymlink`'s signature.** Rows 4a/4b need no new parameter;
  `skillsRoots` is already there for row 4.
- **Any other reverser** — `reverseSettingsEntry`, `reverseCopiedSkill`,
  `reverseVendoredTree`, `reverseSchedulerEntry`. `reverseCopiedSkill` carries the
  structurally identical residual (its `hash` is read from the same untrusted
  file) and is **not** fixed here; it is a `copied-skill`, a fallback-only shape
  reached on `EPERM`/`EACCES`, and giving it forward-time identity is its own WP.
- **Editing `docs/specs/done/WP-147-…` or `docs/specs/done/WP-153-…`** to update
  their routing slugs or residual sections. A `Done` spec describes the code it
  shipped; the alias is recorded in this spec's header instead.
- **`docs/GLOSSARY.md`.** Neither *insertion anchor* nor *link identity* becomes a
  glossary term (Context, terminology note).

## Split plan — the pre-cut line

This WP is one document because the two mechanisms are one design: *record
ownership evidence when we write, verify it before we delete, fail closed.*
**It splits cleanly at a line that is already drawn**, and every section above is
labelled `(Part A)`, `(Part B)` or `(both)` so the cut is mechanical:

| | Part A — `WP-managed-block-insertion-anchor` | Part B — `WP-symlink-authorship-identity` |
|---|---|---|
| Deliverables | **D1, D2** (manifest.js), **D7, D8, D9** (shared.js), A-T1…A-T5 | **D3, D4, D5** (manifest.js), **D7, D10** (shared.js), B-T1…B-T6 |
| Canonical tables | **Table Q**, Table P's `anchorBefore` row, Table B's three managed-block rows, Table F row 1, Table N's four anchor rows | **Table A2**, Table P's `origin`/`dev`/`ino` rows, Table B's three symlink rows, Table F rows 2–4, Table N's five symlink rows |
| Acceptance | AC3, AC4, AC5 | AC6, AC7, AC8 |
| Sizing if split | **M** | **S** |
| Shared — goes to whichever part lands FIRST | **D6** (the doc comment / `@typedef` — one file, one hunk), **D7** (the `shared.js:5` import), AC1, AC2, Table U, the security checklist | **D6**/**D7** already landed; AC9, AC10, AC11, AC12 are asserted by both parts against their own surfaces |

**If it splits, Part A lands first and Part B `depends_on` it.** Both edit
`src/core/manifest.js` and `src/adapters/shared.js`, so they cannot run in
parallel without a merge collision — the same sequencing WP-153 took against
WP-147, and for the same reason. Part A is the more delicate of the two (it edits
the F30-adjacent strip region), so its anchors are the costlier ones to re-derive;
putting it first means only Part B's anchors need re-checking. **The whole of
`D6` and `D7` moves to Part A** in that case, and Part B's Deliverables cell for
`manifest.js` is amended to say the doc comment already carries its fields.

**The architect's own reading, recorded so the gate does not have to re-derive
it:** the mechanisms share their shape but **not** their failure semantics — a
withheld separator strip leaves whitespace, a withheld unlink leaves a file — and
only Part B carries a new completeness cost (the Open question below). That is a
genuine divergence and the case for splitting is real. It is written as one WP
because the shared surfaces (`shared.js:5`, the doc comment, the typedef, Table U,
the whole security checklist and the strictly-negative theorem) would otherwise be
duplicated across two specs and drift, which is the failure ADR-0031 exists to
prevent. **Either shape is defensible; this document is built so the decision can
be taken at the gate at near-zero cost.**

## Open question — an owner ruling is REQUIRED before this spec moves to `Ready`

**Table A2 row 4a introduces a NEW uninstall-completeness cost, and by WP-153's
own precedent that is an owner decision, not an architect's.**

**The trade.** Closing residual B case 2 means treating a `wienerdog-*` link that
was **already on disk** when we first recorded it as the user's, forever. That is
correct in the case the residual describes (the user made it). It is **wrong** in
one other case: we created the link, the manifest entry was later lost, and a
subsequent `sync` re-adopted our own link as `origin: 'adopted'`. On uninstall
that link is **left behind**.

**How narrow the wrong case is, stated with the mechanism rather than asserted.**
`recordOnce` no-ops when an entry already exists (`shared.js:50-51`), so an
ordinary re-sync of our own link never reaches the adopt-record at all — the
entry survives with `origin: 'created'` and its identity. The wrong case needs the
**entry** to be gone while the **link** remains, and `uninstall` refuses outright
when the manifest is absent (`src/cli/uninstall.js:43-46`, verified at `0f9ee08`).
So it requires: manifest deleted or reset → reinstall → sync → uninstall. Real,
but narrow.

**Why this is the owner's call and not mine.** WP-153's legacy ruling
(*"fine to have installs predating the WP have uninstall leave all skill symlinks
behind"*) is the same shape of cost — leftover skill symlinks after uninstall —
and it was **gated**: gate round 1 rejected a revision that reached the answer by
argument, on the grounds that *"an architect reaching an owner's answer is not the
owner answering."* The 2026-08-02 flags, by contrast, were FYI-only **because they
were equal-or-stronger than shipped**. Row 4a is not: it is stronger on safety and
**weaker on completeness**, which is a new cost, which is the gated register.

**The three dispositions, so the ruling is a choice and not an essay:**

| | Disposition | Residual B case 2 | Cost |
|---|---|---|---|
| (i) | **Ship row 4a as specified** (the spec's current shape) | **closed** | a link we created but can no longer prove is ours is left behind after a manifest-loss reinstall |
| (ii) | **Drop row 4a**; keep `origin` recorded but unread by the reverser | **stays open** — a pre-existing user link at our path resolving to our source is still deleted | none; uninstall completeness is exactly as shipped. Residual B case 1 still closes via row 4b, which carries no completeness cost at all. |
| (iii) | Drop row 4a **and** stop recording `origin` | stays open | none; but the field that makes (i) a one-line change later is gone |

**Architect's recommendation: (i)**, on the ground that ADR-0019 states the
priority explicitly — *anything uninstall cannot prove it created is preserved* —
and a leftover symlink in the user's own skills directory is a smaller harm than
deleting a file the user made. **(ii) is a legitimate answer** and would let this
WP ship without a ruling, at the price of leaving half of residual B open with a
`Done` spec claiming a full close; if (ii) is chosen, this spec's title, Table A2,
AC6, B-T2 and Table R must all be amended in the same pass and residual B case 2
re-routed. **Do not implement either arm until the ruling is recorded here.**

## Declared residuals after this WP (Table R — canonical)

Each row names its pinning test. A residual with no test is a claim.

| # | Residual | Bound | Pinned by | Routed |
|---|----------|-------|-----------|--------|
| **R1** | **Manifest forgery.** An attacker who can rewrite `install-manifest.json` deletes the new fields and gets `0f9ee08` behaviour | WP-147's Table M envelope for the managed block (≤ one newline per side, cannot cross a line boundary into user text) and WP-153's row-4 `OWNED(L)` gate for symlinks (the `wienerdog-` namespace in two directories the user gave us). **The anchor makes the managed-block half strictly tighter**: Q9 shows the in-vocabulary forgery now loses **zero** user bytes rather than one newline | A-T4, B-T5, and the shipped WP-147 T7/T9/T12 suites | manifest integrity — **declined by declaration**, not routed |
| **R2** | **In-window edit above the block.** A user edit inside the last 256 characters before the block leaves our blank line behind on uninstall | one separator, ≤ 2 whitespace bytes, **all of them ours**. Never a user byte | **A-T3** | not routed — this is the design's chosen trade (Implementation notes) |
| **R3** | **No stable `(dev, ino)` on some platform.** Where `linkIdentity` returns `null` at creation time, no identity is recorded and WP-153's residual persists on that platform | the WP-153 residual, unchanged: the `wienerdog-` namespace under a harness skills root | B-T4 covers the *reverse* arm (absent identity ⇒ shipped behaviour). **The forward arm has no test** — it needs a platform that reports a zero `dev`/`ino`, which this repo's CI does not have | a Windows-runner probe, if one is ever wanted; not routed today |
| **R4** | **Inode reuse.** A backup/restore or container rebuild can give our link a different inode (→ preserved, a leftover) or, vanishingly rarely, give a user's link ours (→ deleted) | the first direction is the fail-closed one and is the design's intent; the second requires the same inode on the same device at the same path | none — stated, not pinned; a test would have to fake `lstat` | not routed |
| **R5** | **Adopted-link leftover** — the cost in the Open question above | one symlink per core skill, in the harness skills dir, only after a manifest-loss reinstall | B-T2 pins the *behaviour*; the *cost* is what the owner rules on | **blocked on the owner ruling** |
| **R6** | **`reverseCopiedSkill` has the same authorship gap** — its `hash` is read from the same untrusted file and proves content, not authorship | out of scope here; a `copied-skill` is the `EPERM`/`EACCES` fallback shape, not the mainline | none | a future WP, not drafted |

## Definition of done

1. All verification steps pass locally; output pasted into the PR body — **V3's
   red run included**, since it is the proof the F30 tail survived.
2. Branch `wp/forward-time-ownership-provenance`; conventional commits; PR titled
   `fix(uninstall): prove ownership from forward-time evidence before stripping a separator or unlinking a skill link (WP-forward-time-ownership-provenance)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
5. **The Open question above carries a recorded owner ruling.** This spec does not
   move to `Ready` without it, and no implementer starts without `Ready`.

> **Provenance.** Consolidated full close of the two residuals declared by
> `WP-147` (PR #134, tip `4425122`, Codex finding #3) and `WP-153` (PR #137,
> `c283096`, Codex gate round 11), both owner-approved as FYI flags on
> 2026-08-02. Routing call — *one WP covers both* — is WP-153's, recorded in its
> 2026-08-02 double-gate note, with the note that it may split if the mechanisms
> diverge; the **Split plan** section is that note discharged.
>
> **2026-08-02 — architect drafting pass, tested SHA `0f9ee08`.** Every executable
> Current-state claim was run first-hand at `0f9ee08`. The complete design was
> then implemented as a throwaway prototype at that SHA and measured: the full
> suite (`tests 1901 / pass 1888 / fail 4`), the four flipped assertions
> (Table F), the nine managed-block cases (Table Q), the seven symlink cases
> (Table A2's measured half), the `lstat`-identity primitive (Current state §9)
> and both idempotency runs. The prototype was discarded; no source file is
> modified by this commit. **No stale claim was found in WP-147 or WP-153.**
>
> **One deferred nit checked and found already closed.** PR #144's gate deferred a
> citation fix in `docs/specs/done/WP-scheduler-node-path-durability.md` — the
> sibling range was said to read `:1881` instead of `:1880-1883`. At `0f9ee08` all
> three occurrences of that citation (`:815`, `:1078`, `:1679`) already read
> `:1880-1883`, `git log -S":1881"` on that path returns nothing, and
> `sed -n '1880,1883p'` of the sibling is the two-`print` call-count fact the
> citation is for. **Nothing to fix; no edit made.**
