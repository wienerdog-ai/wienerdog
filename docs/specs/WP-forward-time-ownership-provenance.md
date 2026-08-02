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
`tests 1901 / pass 1888 / fail 4` — and the **same four**, with the **same
values**, after the round-2 revisions (the uniqueness conjunct and the identity
seam) were added to the prototype and re-measured.** Same test count, four passes
lost — so nothing was added, skipped or silenced; exactly four
assertions flip, all four are listed in **Table F**, and all four are in files
this WP's Deliverables table already covers. No other test in the repository
changes state.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file itself (the status flip)
     and package-lock.json. Everything else must be listed. -->

**Sizing, recorded rather than implicit, and RE-STATED after Codex round 1.**
Three primitives (~32 lines, up from two/~18 — `anchorProvesPosition` is new)
plus one conjunct in one predicate, one default parameter and two rows in one
reverser (~24 lines) in `manifest.js`; one parameter and four call sites in
`shared.js`; two schema/doc cells; two test files extended, of which four shipped
assertions are edited, across **eighteen** test rows (eleven at round 1, fourteen at round 2).

**Sizing pressure is now the dominant fact about this WP, and it is recorded
rather than resolved.** Round 1 added three test rows and a fourth primitive;
round 2 added four more test rows, a per-shape reverse arm and a hardened guard.
Eleven → fourteen → eighteen test rows, none removed. **The document is over the
top of M on volume and is held at `M` only because every added row is a table
row or a test, not new mechanism** — the two mechanisms are exactly what they
were at round 1.

**The architect's recommendation is now unambiguously: SPLIT.** It is not
executed here because the coordinator has asked for the consolidated document to
be kept for now; this paragraph is the standing note that the pressure is real
and compounding, and the **Split plan** is pre-cut, per-part and additive on
every shared hunk, so the cut costs one pass whenever it is called. **A round 4
that adds further rows should split first and revise second.**

| Action | Path | Notes |
|--------|------|-------|
| modify | src/core/manifest.js | **D1 (Part A)** — add `ANCHOR_WINDOW`, `ANCHOR_HEX`, `insertionAnchor()` and `anchorProvesPosition()` beside `SEP_BEFORE_OK` (`:54-59`), and export `insertionAnchor`. **D2 (Part A)** — `reverseManagedBlock`'s leading-strip region (`:285-311`) gains the `userText` slice and the `anchorOk` conjunct per **Table Q**; **nothing else in that function changes** (Table U). **D3 (Part B)** — add `linkIdentity()` beside the other primitives and export it. **D4 (Part B)** — `reverseSymlink` gains a 7th parameter `opts = {}` (the identity seam — Exact contracts) and rows **4a** and **4b** per **Table A2**, between the existing rows 4 and 5; rows 1–5 are otherwise byte-identical, and `reverse()`'s call site is **not** changed. **D5 (Part B)** — `ENTRY_FIELD_TYPES.symlink` becomes `{ target: 'string', origin: 'string', dev: 'string', ino: 'string' }` (`:908`); the `managed-block` cell and its comment are **unchanged** (Table P's validation column says why). **D6 (both)** — the module doc comment (`:17-26`) and the `@typedef ManifestEntry` (`:45-47`) gain the new optional fields per **Table P**. |
| modify | src/adapters/shared.js | **D7 (both)** — import the two primitives on `:5`. **D8 (Part A)** — `recordManagedBlock` (`:113`) takes a seventh parameter `anchorBefore` and assigns it inside the existing `if (inserted)` block, per **Table P**; the sticky-true `createdFile` line is **unchanged**. **D9 (Part A)** — `applyManagedBlock`'s three `recordManagedBlock` calls (`:179`, `:197`, `:210`) pass the anchor per **Table B**; **no other byte of that function changes** (Table U). **D10 (Part B)** — the three `recordOnce(manifest, { kind: 'symlink', … })` sites (`:434`, `:485`, `:491`) record `origin` (and, at `:491` only, `dev`/`ino`) per **Table B**. `recordOnce` itself is **NOT modified and NOT replaced by an upsert** — the owner declined a backfill (2026-08-01). The WP-146 preserve arm, `dropOwnedEntry`, the `readlinkSync` comparison, the `EPERM` copy fallback and every notice string stay byte-identical. |
| modify | tests/unit/manifest.test.js | **A-T1 … A-T10** and **B-T1 … B-T5, B-T7, B-T8** — the exact set in the Test index. **A-T5 is a required edit to a shipped assertion**, not a new test (**Table F** row 1): `manifest.test.js:1417`'s `assert.equal(forged, 'foo', …)` becomes `'foo\n\n'`. The WP-147 Table N suite (`:1336-1358`), T6, T7, T11 and T12 must pass **byte-unmodified** — they craft entries with no anchor, so they exercise the legacy arm and are the regression fence for it. |
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

/** Does the recorded anchor prove the block is still at its RECORDED POSITION?
 *  A hash match alone does NOT: it proves only that `candidate` ends with the
 *  same window we recorded, and a window that occurs twice in the user's own
 *  document has two positions that satisfy it (Table Q row Q10 — measured, no
 *  forgery and no hash collision needed). So the match is paired with a
 *  UNIQUENESS test over `userText`, the RECONSTRUCTED user document.
 *  Both together are the position proof; either alone is not.
 *  @param {ManifestEntry} entry
 *  @param {string} candidate  the content that would remain in front of the block
 *  @param {string} userText   the RECONSTRUCTED user document: `candidate + after`,
 *    i.e. what uninstall is about to leave on disk. It must NOT be
 *    `content.slice(0, span.begin) + content.slice(span.end)` — that still holds
 *    Wienerdog's own separator bytes, which manufacture false ambiguity on
 *    newline-only content (Table Q row Q13, measured; Codex round 2 finding 2).
 *  @returns {boolean} */
function anchorProvesPosition(entry, candidate, userText) {
  const rec = entry.anchorBefore;
  // LEGACY (absent or not a sha256 hex digest) → shipped 0.12.0 behaviour.
  if (typeof rec !== 'string' || !ANCHOR_HEX.test(rec)) return true;
  if (insertionAnchor(candidate) !== rec) return false;
  const win = candidate.slice(-ANCHOR_WINDOW);
  // The empty prefix exists at exactly one offset (0), so it is self-locating.
  if (win === '') return true;
  const first = userText.indexOf(win);
  return first !== -1 && userText.indexOf(win, first + 1) === -1;
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
    // (3) INSERTION ANCHOR + UNIQUENESS. `candidate` is the content that would
    //     remain in front of the block. It must hash to the anchor we recorded
    //     when we wrote sepBefore, AND that window must occur exactly once in the
    //     user's document — otherwise a block moved to a second occurrence of the
    //     same window passes the hash at the wrong position. An ABSENT or
    //     malformed anchor is a LEGACY entry: shipped behaviour, never stricter.
    //     The corpus is `candidate + after` — the document uninstall is about to
    //     leave — NOT the block-excised `content`, which still holds our own
    //     separator and makes newline-only files look ambiguous (Q13).
    const anchorOk = anchorProvesPosition(entry, candidate, candidate + after);

    // ALL THREE are required, and the anchor is a CONJUNCT — never a disjunct.
    // It may only ever withhold a strip the other two would have allowed
    // (Table N); it may never authorise one they refused.
    if (anchorOk && ownershipOk && noFusion) before = candidate;
```

**`reverseSymlink` gains an injectable identity seam.** Its signature becomes:

```js
function reverseSymlink(entry, dryRun, removed, skipped, removedSet, skillsRoots, opts = {}) {
  const identityOf = opts.identity || linkIdentity;   // test seam only
```

**This is a real signature change and it reverses what round 1 of this spec
said.** Codex round 1 finding 2 is the reason: `(dev, ino)` is a *filesystem*
property, so the four behaviours row 4b depends on — changed device, changed
inode, reused identity, unavailable identity — cannot be produced deterministically
on a real filesystem, and a test that relies on `unlink` + `symlink` happening to
allocate a fresh inode is a platform-dependent assertion pretending to be a
contract. The seam makes all four deterministic (**B-T7**, measured).
`reverse()`'s call site passes **nothing** — the default parameter keeps
production behaviour byte-identical, exactly as `reverseSchedulerEntry`
(`manifest.js:389`) already does with its own `opts = {}` and for the same stated
reason (*"defaults keep the exported function directly callable"*). `reverseSymlink`
is already exported and already unit-tested directly (WP-153's T4).

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
  // A PARTIAL pair (one of the two) is a shape the forward step never writes, so
  // it is unverifiable, not absent — preserve (Table P rule P-6).
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
appears in **multiple mirrored surfaces** — six producer sites, one schema cell,
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
- **P-6. Every accepted symlink entry SHAPE is enumerated here, because "absent"
  is not one condition.** Round 2's AC8a said *"any new field absent ⇒ base
  behaviour"*, which is false for an honest adopted entry — it deliberately has
  `origin: 'adopted'` and **no** `dev`/`ino`, and must be preserved (Codex round 2,
  finding 4). The complete table, **all six rows measured**:

  | `origin` | `dev`/`ino` | Written by | Reverse outcome | Why |
  |----------|-------------|-----------|-----------------|-----|
  | absent | absent | an install predating this WP | **base behaviour — removed** | the legacy arm; AC8a |
  | `'created'` | both present | `shared.js:491` when `linkIdentity` succeeded | row 4b decides | the mainline |
  | `'created'` | absent | `shared.js:485` (dry run), or `:491` when `linkIdentity` returned `null` (P-4) | **base behaviour — removed** | identity was never establishable; never make an existing platform's uninstall incomplete |
  | `'adopted'` | absent | `shared.js:434` | **preserved** (row 4a) | the link is the user's |
  | `'adopted'` | both present | **never written by any branch** | preserved (row 4a fires first) | a forgery; only narrows |
  | absent | **exactly one** of the two | **never written by any branch** | **preserved** (row 4b's partial arm) | a partial pair is unverifiable, not absent. Treating it as absent would be a *wider* deletion than treating it as unverifiable, and fail-closed is the house rule |

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
| 3 | **`anchorOk`** | `anchorProvesPosition(entry, candidate, userText)` — `true` when `entry.anchorBefore` is not a sha256 hex string (legacy); otherwise **both** `insertionAnchor(candidate) === entry.anchorBefore` **and** the window `candidate.slice(-ANCHOR_WINDOW)` occurs **exactly once** in `userText` = `candidate + after`, the document uninstall is about to leave. `win === ''` short-circuits to `true` — offset 0 is the only empty prefix | **this WP** | **withhold only** |

**The hash match ALONE is not a position proof, and this was a real defect in
this spec's round-1 draft.** Codex design-gate round 1 finding 1 raised it, it
was reproduced, and the reproduction falsifies two designs:

```text
FIXTURE  W = 256 chars ending in '\n'.  User document:  W + "\nTAIL\n" + W
         honest sync appends -> ...W + '\n' + BLOCK + '\n'   (sepBefore='\n', anchor=H(W))
         user MOVES the block to the FIRST occurrence:  W + '\n' + BLOCK + '\n' + "TAIL\n" + W
         candidate = W  ->  H(W) MATCHES, at a position that is NOT the recorded one

                                                          result
  base 0f9ee08 (no anchor)                                FAIL — the user's blank line is eaten
  anchor, hash match only (round-1 draft)                  FAIL — same
  anchor + uniqueness gated on candidate.length <= 256     FAIL — the shortcut fires and skips the test
  anchor + uniqueness over the EXCISED document            PASS — byte-perfect
```

**The `candidate.length <= ANCHOR_WINDOW` shortcut was this architect's first
repair and it is unsound** — it reasoned *"the window is the whole prefix, so a
match determines the prefix"*, which is true, but the **recorded** anchor was a
suffix of a *longer* original prefix, so whole-prefix equality on the current
document proves nothing about position. Recorded because the reasoning is
seductive and a later round would otherwise re-propose it. Only the third form
ships; it is what `anchorProvesPosition` implements.

**The corpus is `candidate + after`, and getting this wrong is an ordinary-path
regression.** Three corpora were measured; only the third is correct.

| corpus | what is still in it | verdict |
|--------|---------------------|---------|
| `content` (the whole file) | the block body **and** our separators | wrong — the digest body can contain the window, withholding the strip for a reason that has nothing to do with the user |
| `content.slice(0, span.begin) + content.slice(span.end)` — **round 2's shipped form** | our `sepBefore` and `sepAfter` | **wrong, and measured red on the ORDINARY path** (Q13) |
| **`candidate + after`** — the document uninstall is about to leave | nothing of ours | **correct** |

**Codex round 2 finding 2, reproduced.** For a file whose entire content is
`"\n"`, an honest sync writes `"\n" + "\n" + BLOCK + "\n"`. Round 2's corpus was
`"\n\n\n"`, the window is `"\n"`, `indexOf` finds it three times, ambiguity is
declared, and uninstall leaves `"\n\n"` where base restores `"\n"`. **No
relocation, no user edit, no forgery — the ambiguity was manufactured entirely by
Wienerdog's own bytes**, which contradicts both the ordinary-path guarantee (AC4)
and R2b's premise that ambiguity is a property of the *user's* document.
Measured, all four rows:

```text
content     base 0f9ee08   round-2 corpus   candidate+after
"\n"        "\n"           "\n\n"    XX     "\n"        ok
"\n\n\n"    "\n\n\n"       "\n\n\n\n" XX    "\n\n\n"    ok
"a\na\na\n" "a\na\na\n"    "a\na\na\n" ok   "a\na\na\n" ok
"x\r\ny\r\n" (CRLF)        "x\r\ny\r\n" ok  "x\r\ny\r\n" ok
```

`candidate + after` fixes both failures and changes none of the rows the
uniqueness conjunct was added for — Q10, Q1, Q3 and Q4 are byte-identical under
both corpora (measured). It is also the *semantically* right corpus: the question
"could this window match somewhere else in the user's document?" is a question
about the document that will exist after uninstall, which is exactly
`candidate + after`.

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
| **Q10** | **The duplicate-window move** (Codex round 1, finding 1). Document `W + "\nTAIL\n" + W` with `W` exactly 256 chars ending in `\n`; honest sync; user moves the block to the **first** occurrence | `'\n'` | the user's blank line is eaten | **byte-perfect** | **FIXED by the uniqueness conjunct.** Red against base, against the round-1 hash-only draft, **and** against the `<=WINDOW` shortcut — all three measured above. Pinned by **A-T6**. |
| **Q11** | Same shape, but the duplicated context is **shorter than the window** (15 chars, twice) | `'\n'` | one newline eaten | **byte-perfect** | already correct under the hash-only draft — a short `candidate` is a *whole-prefix* mismatch. Kept as the boundary's other side. |
| **Q12** | Boundary sweep at `candidate.length` = **255 / 256 / 257**, each under an ordinary in-place uninstall **and** an honest relocation — six runs | `'\n'` | — | **byte-perfect in all six** | pins that nothing special happens at the window edge now the `<=WINDOW` shortcut is gone. Pinned by **A-T7**. |
| **Q13** | **The ordinary-path corpus sweep** (Codex round 2, finding 2). Six whole-file contents, each synced and immediately uninstalled with **no relocation and no user edit**: `"\n"`, `"\n\n\n"`, `"a\na\na\n"`, CRLF `"x\r\ny\r\n"`, `"foo\n"`, and `""` (present but empty) | `'\n'` / `'\n\n'` | byte-perfect in all six | **byte-perfect in all six** | **Round 2's corpus regressed two of these** (`"\n"` → `"\n\n"`, `"\n\n\n"` → `"\n\n\n\n"`). Fixed by the `candidate + after` corpus. Pinned by **A-T10**. |
| **Q14** | **R2c made executable** (Codex round 2, finding 6). Original `` `PPPP\n${W}` ``; honest sync; the user then **replaces the prefix** with `` `QQ\n${W}` `` — the same window at a new, unique position — and relocates the block there | `'\n'` | one newline stripped | **one newline stripped — the DECLARED residual, unchanged** | **R2c is pinnable after all** — round 2 claimed it was not. Measured: it is **red** against a full-prefix anchor and against an always-withhold anchor, so it discriminates. Pinned by **A-T9**. |

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
| **4b** | **`entry.dev` or `entry.ino` is a string** — and either the pair is **partial** (only one of the two), or `identityOf(L)` is `null`, or it does not equal `(entry.dev, entry.ino)` | none | `skipped` | same line | **NEW.** We recorded which file object we created; this is not it. A delete-and-recreate gets a new inode (measured, Current state §9), so a user's same-source replacement no longer passes for ours. Closes residual B case 1. A `null` identity is fail-closed by construction. **`(dev, ino)` is durable but not permanent, and recyclable — both directions are costed in the Owner-ruling table and pinned by B-T7.** |
| 5 | otherwise | `if (!dryRun) fs.unlinkSync(L)` | `removed` **and** `removedSet.add(L)` | none | In-namespace, under a harness skills root, resolves to the recorded source, **not adopted**, and **still the file object we created**. The only row that deletes. **Row 4b's check and this unlink are two syscalls, not one — see the TOCTOU note below. This design is NOT claimed to be TOCTOU-free.** |

**Row 4b verifies identity; row 5 unlinks by pathname. Those are separate
syscalls, and nothing binds them.** Codex round 2 finding 1 is correct and is
**declared, bounded and pinned — not claimed closed.**

- **The window.** Between `identityOf(L)` returning and `fs.unlinkSync(L)`
  executing, another process can replace `L`. Uninstall then removes the
  replacement even though the identity it verified belonged to the previous
  object. **Measured** with an identity seam that replaces the link and *then*
  returns the recorded pair: the replacement is deleted (**B-T8**).
- **Why it is not closed in-process.** Node exposes no atomic
  compare-and-unlink for a symlink: there is no `unlinkat` with an identity
  predicate, and `lstat` + `unlink` cannot be fused from JS. Closing it needs an
  OS primitive Node does not surface.
- **Who can exploit it, and why that is outside the threat model.** The attacker
  must already be able to create and delete files at the recorded path inside the
  user's own harness skills directory — i.e. **arbitrary code running as the same
  OS user**. `docs/THREAT-MODEL.md` places that squarely outside the boundary and
  says so repeatedly: it is *"arbitrary same-user native code (A12)"*, on the
  *"trusted-computing-base residual"* shelf, and the file states plainly that the
  0600 file-permission boundary *"is not an OS boundary"* and that a same-user
  native actor *"can read the same 0600 tokens and rewrite the same 0600 grant
  store"*. An attacker who can win this race can delete the link directly and
  does not need `uninstall` as a confused deputy.
- **The precedent for this disposition is the sibling's, not an invention here.**
  ADR-0028 carries the same shape for the scheduler's executable-integrity check:
  *"reopen-based; a TOCTOU-free design requires the deferred '2b' in-memory
  bootstrap … plainly in docs; not claimed as TOCTOU-free."* This spec takes the
  identical line — state it, bound it, pin it, do not claim what it cannot
  demonstrate.
- **It only ever narrows against base.** At `0f9ee08` `reverseSymlink` unlinks any
  recorded-path symlink with no identity check at all, so every outcome reachable
  through this race is also reachable at base, with no race required. Row 4b is
  strictly stronger even with the window open.
- **Recorded as residual R7, pinned by B-T8, and costed in the Owner-ruling
  ledger** so the ruling covers it alongside 4a and 4b.

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
| a wrong `(dev, ino)` pair | preserved. Only ever narrows | preserved | S7, and deterministically **B-T7(a)/(b)** through the identity seam |
| a *correct-looking* `(dev, ino)` an attacker read off the link, **or** an inode the filesystem recycled | shipped behaviour — the link is deleted, exactly as base does | preserved-vs-deleted measured | **B-T7(d)**; costed as **R4** |
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
| `reverseSymlink` rows 1–5 | `manifest.js:169-216` | unchanged except for the two new blocks inserted **before** the `// Row 5:` comment, and `linkIdentity(L)` → `identityOf(L)` inside row 4b. In particular the row-3 `lexicalMatch` `try`/`catch` stays (see Implementation notes). |
| The `reverse()` symlink arm | `manifest.js:817-828` | unchanged — **including the argument list**. `reverseSymlink` gains a **7th parameter `opts = {}`** (the identity seam), and `reverse()` must **not** pass it: the default is production behaviour. A diff that adds an argument at `:828` is out of scope. |
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
- [ ] The **ADR-0031 activation paragraph**'s producer-site count (registered
      after Codex round 1 finding 5 found it stating four where Table B has six)
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
- [ ] Test index **A-T1 … A-T10**; Table F row 1; Table R rows **R1**, **R2**,
      **R2b**, **R2c**
- [ ] Verification **V2**
- [ ] The falsification record under Table Q (the three rejected anchor designs)
      and the `userText`-not-`content` note

**Table A2 (reverseSymlink rows)** — mirrors:

- [ ] Deliverables cell **D4**
- [ ] Exact contracts: the rows 4a/4b snippet and the one-stderr-string decision
- [ ] Current state §4 (the shipped five rows)
- [ ] Table U's `reverseSymlink` row
- [ ] Acceptance criteria **AC6**, **AC7**, **AC8a**, **AC8a′**, **AC8b**
- [ ] Test index **B-T1 … B-T8**; Table R rows **R3**, **R4**, **R5**
- [ ] Verification **V4**
- [ ] **The Owner-ruling cost ledger** (rows 4a and 4b) and its four dispositions
- [ ] Exact contracts: the `opts = {}` identity-seam signature and Table U's
      `reverse()`-symlink-arm row (the seam must not be passed from production)

**Table B (producer sites)** — mirrors:

- [ ] Deliverables cells **D9**, **D10**
- [ ] Exact contracts: the producer-site block
- [ ] Current state §1 and §5 (the shipped call sites)
- [ ] Table P's "Written by" and "Exact value" columns
- [ ] Table F rows 2–4 (the assertions that observe these values)
- [ ] Test index **B-T6**; Acceptance criterion **AC9** (**six** sites, not four)
- [ ] The Split plan's per-part `D6a`/`D6b`, `D7a`/`D7b` rows

**Table F (flipped assertions)** — mirrors:

- [ ] Deliverables cells for both test files
- [ ] Current state §10
- [ ] Test index **A-T5**, **B-T6**
- [ ] Acceptance criterion **AC10**

**Table N (strictly-negative posture)** — mirrors:

- [ ] Table P's type-gating column
- [ ] Table Q rows **Q7**, **Q8**; Table A2's measured rows **S4**–**S7**
- [ ] Security checklist
- [ ] Acceptance criteria **AC8a**, **AC8a′**, **AC8b**; Test index **A-T4**, **B-T4**, **B-T5**, **B-T7**

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
| **A-T6** | Table Q row **Q10**, the duplicate-window move. Build `W = 'w'.repeat(251) + '\nEND\n'` (**exactly 256 characters, newline-terminated — assert `W.length === 256` in the test** so the fixture cannot silently drift off the boundary); original document `` `${W}\nTAIL\n${W}` ``; honest sync (records `sepBefore: '\n'`); rewrite the file to `` `${W}\n<BLOCK>\nTAIL\n${W}` `` | the final content is **exactly** the original document — **and** additionally assert the result contains no fewer `W` occurrences than the original, so the row fails loudly if the withhold ever becomes a strip | base `0f9ee08`, the hash-only anchor, **and** an anchor whose uniqueness test is gated on `candidate.length <= ANCHOR_WINDOW` — **all three measured red**. This row is the finding-1 detector and the only test that separates the three anchor designs. |
| **A-T8** | **The createdFile producer site** (`shared.js:179`) — the one site nothing exercised (Codex round 2, finding 5). Fixture: the markdown file is **absent**; `applyManagedBlock` creates it | assert the whole entry: `createdFile === true`, `sepBefore === ''`, `sepAfter === '\n'`, **and `anchorBefore === insertionAnchor('')`** (import it; do not hardcode the digest). Then sync a **second** time and assert the entry and the file bytes are unchanged, and finally that uninstall **deletes** the file | red against any implementation that records `null`, omits the anchor, or records a non-empty `sepBefore` on this branch. **Measured**: the entry is `{createdFile:true, sepBefore:'', sepAfter:'\n', anchorBefore:'e3b0c442…b855'}` and uninstall deletes the file. Closes AC9's third managed-block site. |
| **A-T9** | Table Q row **Q14** — **R2c, executable** (Codex round 2, finding 6). Original `` `PPPP\n${W}` ``, honest sync; then rewrite the file so the prefix is `` `QQ\n${W}` `` — the same 256-char window at a new, **unique** position — with the block relocated after it | assert the exact resulting bytes, and additionally assert the delta against the pre-uninstall content is **exactly one newline** and is whitespace-only — the R2c safety bound made executable | red against a full-prefix anchor **and** against an always-withhold anchor — **both measured**. Round 2 claimed this residual could not be pinned "because a test would pass on every implementation"; **that claim was wrong and is retracted**. |
| **A-T10** | Table Q row **Q13**, the ordinary-path corpus sweep. Six whole-file contents — `"\n"`, `"\n\n\n"`, `"a\na\na\n"`, CRLF `"x\r\ny\r\n"`, `"foo\n"`, `""` — each synced and immediately uninstalled with **no relocation and no edit** | every one restores **byte-perfectly**. Add one further assertion in the same test: a file with **ambiguous** sentinels is skipped with the shipped notice and left untouched, proving the anchor never runs on a file `locateManagedBlock` refuses | red against round 2's block-excised corpus, which yields `"\n\n"` and `"\n\n\n\n"` on the first two rows — **measured**. This is the ordinary-path regression detector. |
| **A-T7** | Table Q row **Q12**, the boundary sweep. Six runs: `candidate.length` ∈ {255, 256, 257} × {ordinary in-place uninstall, honest relocation} | in-place restores byte-perfectly at all three lengths; the relocation preserves byte-perfectly at all three | `PATCH: none — boundary pin.` Not red-first against the shipped design; it exists so the removal of the `<=ANCHOR_WINDOW` shortcut stays removed. Red against any re-introduction of a length-conditional branch. |

### Part B — `tests/unit/manifest.test.js` and `tests/unit/shared-skill-links.test.js`

| # | Fixture (structural) | Assertion | Red against |
|---|----------------------|-----------|-------------|
| **B-T1** | Table A2 row **S2**: honest `applySkillLinks` create, then `fs.unlinkSync(link)` followed by `fs.symlinkSync(coreSkill, link)` — a new file object at the same path with the same target. **Assert the precondition explicitly**: `linkIdentity(link)` must now differ from the recorded `(dev, ino)`, so a filesystem that recycled the inode fails the *precondition* loudly instead of silently turning this into a vacuous pass | the link **still exists** after `reverse()`, is in `skipped`, and the stderr `keeping …` line fired | base `0f9ee08` (**measured**: the link is deleted). **This is the end-to-end row and it is filesystem-dependent by nature** — the deterministic proof of the same rule is **B-T7(b)**, which is why both exist (Codex round 1, finding 2). |
| **B-T2** | Table A2 row **S3**: the link is created **before** `applySkillLinks` runs, so the adopt branch records it | the link **still exists** after `reverse()`, is in `skipped`; **and** the recorded entry has `origin: 'adopted'` and **no** `dev`/`ino` | base `0f9ee08` (**measured**: the link is deleted). Assert the entry shape too — the end state alone tells you something is wrong; the entry tells you which rule fired. |
| **B-T3** | Table A2 row **S1**: honest create, nothing touched, uninstall | the link is **removed** and is in `removed` | `TRIGGER: none — the ordinary path.` Baseline row; red against making identity *required*, and against any row 4a/4b that fires on our own untouched link. |
| **B-T4** | Table A2 row **S4** and **Table P rule P-6** — **six rows, one per accepted shape**, not one combined deletion: all-absent; created+identity; created+no-identity; adopted+no-identity; adopted+identity; **exactly one of `dev`/`ino`** | each behaves as P-6 tabulates — removed, row-4b, removed, preserved, preserved, preserved | the all-absent row is the **backward-compatibility fence** (red against "absent identity ⇒ preserve", which would strand every pre-existing install). The **partial** row is red against treating a half pair as absent. **All six measured.** Round 2 deleted all three fields in one case and called that coverage (Codex round 2, finding 4). |
| **B-T5** | Table A2 rows **S5**, **S6**, **S7**: three mutations of an honest entry, one per case — `origin = 'adopted'`; `ino = 12345` (non-string); `ino = '999999999'` (wrong value) | all three **preserve** the link | any implementation where a forged provenance field widens deletion. Three separate rows, three separate mutations (ADR-0036 A3) — they are independently revertible and each reddens a different arm (row 4a; `validateEntry`; row 4b). |
| **B-T6** | `shared-skill-links.test.js` — the three **Table F** rows 2–4 plus their forward-side identity assertion | exactly the expectations in Table F | `PATCH: none — shipped assertions whose expected values moved.` Their red-ness is Table F's measurement (three `ERR_ASSERTION` failures at `0f9ee08` + this design). |
| **B-T7** | **The identity seam, four deterministic arms.** Honest `applySkillLinks` create, then call `reverseSymlink` **directly** (WP-153 already blessed the direct unit call) passing `{ identity: … }` as the 7th argument. Four separate rows, four separate seams: **(a) changed device** → `{dev: recorded.dev+1, ino: recorded.ino}`; **(b) changed inode** → `{dev: recorded.dev, ino: recorded.ino+1}`; **(c) unavailable** → `null`; **(d) reused** → the recorded pair verbatim | (a), (b), (c) → the link **survives**, is in `skipped`, `removed` is empty. (d) → the link is **removed** — this arm pins Table R row **R4**'s recycling residual at its declared size, and its comment must say it pins current behaviour, not a fix | (a)(b)(c) are red against any implementation that ignores a recorded identity or treats a `null` identity as a match. (d) is `PATCH: none — residual pin`, red only if recycling ever stops deleting, which would mean the mechanism changed. **This row replaces round 1's plan of relying on `unlink`+`symlink` allocating a fresh inode**, which is a filesystem-dependent assumption, not a contract (Codex round 1, finding 2). |

| **B-T8** | **The verify→unlink race** (Codex round 2, finding 1), deterministic. Honest `applySkillLinks` create, then call `reverseSymlink` directly with an identity seam that **replaces the link on disk** (`unlinkSync` + `symlinkSync`) and *then* returns the **recorded** pair — simulating a replacement landing between the check and the unlink | the replacement **is deleted** and the link is in `removed` | `PATCH: none — residual pin.` Not red-first: it pins **R7** at its declared size, which is the only way "we do not claim TOCTOU-freedom" stops being a sentence. Comment it as pinning current behaviour, not a fix. If it ever goes red, either an atomic primitive was adopted or the mechanism changed — both worth a failure. **Measured.** |

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
- **A bounded window costs a uniqueness test, and that is not optional.** The
  price of bounding is that the window is a *suffix*, not the whole prefix, so it
  can occur twice. `anchorProvesPosition` therefore pairs the hash match with a
  uniqueness scan of `userText` (Table Q, and the falsification record under it).
  **Do not "simplify" the function back to the hash comparison** — the
  duplicate-window move needs no forgery and no hash collision, and A-T6 is red
  against exactly that simplification. Equally, **do not re-introduce a
  `candidate.length <= ANCHOR_WINDOW` early return**: it is measured red on the
  same row, for the reason stated under Table Q.
- **The uniqueness scan is two `String.prototype.indexOf` calls** over a file that
  is a user's `CLAUDE.md`. Do not reach for a regex, a rolling hash, or a
  precomputed index; there is no measurement suggesting this is hot, and
  CLAUDE.md's *"no abstractions for single-use code"* applies.
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
- [ ] **The identity seam is test-only and unreachable from production.**
      `reverseSymlink`'s `opts = {}` defaults to `linkIdentity`, and `reverse()`
      passes six arguments — a manifest cannot reach it, because `opts` comes from
      the **call site**, never from the entry. Table U forbids adding an argument
      at `manifest.js:828`, and a diff that does is out of scope.
- [ ] **The anchor's position proof is stated at its real strength, not a
      stronger one.** A hash match alone does not prove position; the uniqueness
      conjunct is what does, and its own edge — a window the user reproduces
      elsewhere — is declared as **R2c** rather than claimed closed. A security
      claim this spec cannot demonstrate is not made.
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
      `../core/manifest`. `ANCHOR_WINDOW` is **defined exactly once** in `src/`
      (V5 counts definitions, not mentions). *(Splits into **AC1a**/**AC1b** —
      see Split plan.)*
- [ ] **AC2.** The module doc comment and `@typedef ManifestEntry` list
      `anchorBefore?`, `origin?`, `dev?` and `ino?` per Table P. *(Splits into
      **AC2a**/**AC2b**.)*
- [ ] **AC3.** Table Q rows **Q1** and **Q10** both yield byte-perfect results —
      the true relocation **and** the duplicate-window move, which is the case a
      hash match alone does not cover — A-T1, A-T6.
- [ ] **AC4.** Table Q rows **Q3**, **Q4** and **Q12** still restore
      byte-perfectly — the anchor does not withhold on the ordinary path, on a
      distant edit, or at any of the three window-boundary lengths — A-T2, A-T7.
- [ ] **AC5.** Table Q row **Q5** yields `paraA-EDITED\n\n`: our separator is left,
      **no user byte is lost** — A-T3.
- [ ] **AC6.** Table A2 rows **S2** and **S3** preserve the link (residual B is
      closed) — B-T1, B-T2.
- [ ] **AC7.** Table A2 rows **S1** and **S4** still remove the link — our own
      untouched link, and a legacy target-only entry. Uninstall stays complete for
      every install written before this WP.
- [ ] **AC8a — legacy degradation.** With **ALL** provenance fields absent — the
      exact shape an install predating this WP has — both reversers reproduce
      **base `0f9ee08` behaviour byte for byte**: the managed block is still
      stripped with the shipped predicate (A-T4(a)) and the symlink is still
      removed (B-T4). This is the upgrade-safety criterion. **It is scoped to the
      all-absent shape on purpose**: round 2 said *"any field absent"*, which
      contradicted row 4a, since an honest adopted entry has `origin: 'adopted'`
      and no identity and must be **preserved** (Codex round 2, finding 4).
- [ ] **AC8a′ — every accepted partial shape.** All six rows of **Table P rule
      P-6** behave as tabulated, each asserted separately: all-absent → removed;
      created+identity → row 4b; created+no-identity → removed; adopted+no-identity
      → preserved; adopted+identity → preserved; **exactly one of `dev`/`ino`** →
      preserved. **B-T4 must not delete all three fields in one case and call that
      coverage** — that was round 2's gap.
- [ ] **AC8b — narrowing only.** For **every** non-absent value of every new
      field, the action taken is a **subset** of base's: never a wider deletion.
      Per Table N, the outcomes differ by field and both shapes must hold —
      a non-hex `anchorBefore` **degrades to base** and the block is still removed
      (A-T4(b)); `origin: 'adopted'`, a non-string `dev`/`ino`, and a mismatching
      `(dev, ino)` all **preserve** a link base would have deleted (B-T5, B-T7).
      **Round 1 stated AC8 as a single "yields base behaviour" clause, which
      contradicted Table N's own preserve rows** (Codex round 1, finding 5).
- [ ] **AC9.** Each of the **six** producer sites in Table B — `shared.js:179`,
      `:197`, `:210`, `:434`, `:485`, `:491` — records exactly what that table
      says, no more and no less. **Every site has a named test**: `:434`/`:485`/
      `:491` → B-T6; `:210` (append) → A-T1's `anchorBefore` assertion; `:179`
      (createdFile) → **A-T8**, which asserts the full entry including
      `anchorBefore === insertionAnchor('')`; `:197` (replace) → the
      preserve-on-replace assertion in AC11's second-run check. **Round 2 left
      `:179` with no test at all** (Codex round 2, finding 5).
- [ ] **AC10.** The four Table F assertions are updated to their new expectations
      and pass; **every other test in the repository passes byte-unmodified**,
      including WP-147's Table N suite, T6, T7, T11, T12 and WP-153's T1–T4, T6
      and the four fenced WP-146 sync-side tests.
- [ ] **AC11.** Running the forward step twice is idempotent: identical file bytes
      and deep-equal manifest entries after the second run.
- [ ] **AC12.** `npm run lint` passes.

## Verification steps (run these; paste output in the PR)

**Round 1 of this spec used whole-file `grep`s here and Codex round 1 finding 3
took them apart: `fs.ftruncateSync(fd, 0)` occurs in `reverseSettingsEntry` too
(measured: 2 occurrences at `0f9ee08`), so a whole-file "it is present" grep says
nothing about `reverseManagedBlock`; and `grep -c … -ge 2` does not mean "defined
once".** Every structural check below is now **scoped to one function or one
object** and is **executable**, and V3/V4 carry a literal red-run command.

Write the guard helper first — it isolates a named top-level function's source
and asserts `+must-contain` / `-must-not-contain` patterns **inside that function
only**:

**Round 2's guard was still evadable three ways and Codex round 2 finding 3 named
them: a block-commented call satisfied a `+` rule, `indexOf` picked the FIRST
definition when a later duplicate is the effective binding, and V5's `^const`
missed an indented shadow.** All three are fixed below and **each has an executed
red mutation**. The fourth — telling reachable code from code after a `return` —
needs an AST and is **not** attempted: **residual R8**, routed to the already-open
`WP-grep-gate-helper` (WP-147 opened it as *"the fourth instance of this shape"*;
this is the fifth). **The guards are tripwires; V1/V2 are the load-bearing
checks** — WP-147's own words for the same class, and the reason this spec's
behavioural claims all rest on tests, not greps.

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

# V2 — Part A, targeted.
node tests/run.js tests/unit/manifest.test.js

# V3 GREEN — F30 delete-time binding survived (WP-144), SCOPED to the one function.
node /tmp/wd-fnguard.js src/core/manifest.js reverseManagedBlock \
  "+fs.readFileSync(fd, 'utf8')" \
  "+fs.ftruncateSync(fd, 0)" \
  "+fs.writeSync(fd, buf, 0, buf.length, 0)" \
  "+fs.rmSync(target, { force: true })" \
  "-fs.writeFileSync(" && echo "V3 ok (green)"

# V3 RED — the same check against a copy carrying the pre-F30 regression. It MUST
#          fail; a green here means the check cannot detect the thing it guards.
cp src/core/manifest.js /tmp/wd-v3-red.js
node -e 'const fs=require("node:fs"),p=process.argv[1];fs.writeFileSync(p,fs.readFileSync(p,"utf8").replace("fs.ftruncateSync(fd, 0);","fs.writeFileSync(entry.path, remaining);"))' /tmp/wd-v3-red.js
node /tmp/wd-fnguard.js /tmp/wd-v3-red.js reverseManagedBlock \
  "+fs.readFileSync(fd, 'utf8')" \
  "+fs.ftruncateSync(fd, 0)" \
  "+fs.writeSync(fd, buf, 0, buf.length, 0)" \
  "+fs.rmSync(target, { force: true })" \
  "-fs.writeFileSync(" && { echo "V3 BROKEN: the guard cannot fail"; exit 1; } || echo "V3 ok (red, as required)"

# V4 — WP-153's row-3 lexical fallback and row-4 OWNED gate are still present,
#      scoped to reverseSymlink (standing instruction: the fallback stays until
#      WP-symlink-lexical-fallback-removal lands).
node /tmp/wd-fnguard.js src/core/manifest.js reverseSymlink \
  "+lexicalMatch = fs.readlinkSync(L) === T;" \
  "+!sameResolvedDir(L, T) && !lexicalMatch" \
  "+skillsRoots.some((root) => sameResolvedDir(path.dirname(L), root))" && echo "V4 ok"

# V4 RED — the same check against a copy with the row-3 fallback deleted. MUST fail.
cp src/core/manifest.js /tmp/wd-v4-red.js
node -e 'const fs=require("node:fs"),p=process.argv[1];fs.writeFileSync(p,fs.readFileSync(p,"utf8").replace("  if (!sameResolvedDir(L, T) && !lexicalMatch) {","  if (!sameResolvedDir(L, T)) {"))' /tmp/wd-v4-red.js
node /tmp/wd-fnguard.js /tmp/wd-v4-red.js reverseSymlink \
  "+!sameResolvedDir(L, T) && !lexicalMatch" && { echo "V4 BROKEN: the guard cannot fail"; exit 1; } || echo "V4 ok (red, as required)"

# V3/V4 RED — the two EVASIONS Codex round 2 named. Both must fail.
cp src/core/manifest.js /tmp/wd-ev1.js
node -e 'const fs=require("node:fs"),p=process.argv[1];fs.writeFileSync(p,fs.readFileSync(p,"utf8").replace("    fs.ftruncateSync(fd, 0);","    /* fs.ftruncateSync(fd, 0); */"))' /tmp/wd-ev1.js
node /tmp/wd-fnguard.js /tmp/wd-ev1.js reverseManagedBlock "+fs.ftruncateSync(fd, 0)" \
  && { echo "EVASION 1 (block comment) NOT DETECTED"; exit 1; } || echo "evasion 1 (block-commented call) detected"
cp src/core/manifest.js /tmp/wd-ev2.js
printf '\nfunction reverseManagedBlock(entry, dryRun, removed, skipped, removedSet, fd, target) {\n  fs.writeFileSync(entry.path, "");\n}\n' >> /tmp/wd-ev2.js
node /tmp/wd-fnguard.js /tmp/wd-ev2.js reverseManagedBlock "+fs.ftruncateSync(fd, 0)" \
  && { echo "EVASION 2 (later duplicate) NOT DETECTED"; exit 1; } || echo "evasion 2 (later duplicate definition) detected"

# V5 — ANCHOR_WINDOW is DEFINED exactly once, in core, and shared.js neither
#      redefines it nor re-implements the digest. Counts DEFINITIONS, not mentions,
#      and the pattern allows leading whitespace so an INDENTED shadow is counted
#      (round 2's ^const missed it — Codex round 2, finding 3).
test "$(grep -cE '^[[:space:]]*const ANCHOR_WINDOW[[:space:]]*=' src/core/manifest.js)" -eq 1 || {
  echo "FAIL: ANCHOR_WINDOW is not defined exactly once in manifest.js"; exit 1; }
test "$(grep -c 'ANCHOR_WINDOW' src/adapters/shared.js)" -eq 0 || {
  echo "FAIL: ANCHOR_WINDOW leaked into shared.js"; exit 1; }
test "$(grep -c "createHash('sha256')" src/adapters/shared.js)" -eq 0 || {
  echo "FAIL: shared.js re-implements the digest instead of importing insertionAnchor"; exit 1; }
echo "V5 ok"

# V6 — the schema table, scoped to the ENTRY_FIELD_TYPES object literal:
#      the symlink cell gains three fields, the managed-block cell gains none.
node -e '
const fs=require("node:fs");
const s=fs.readFileSync("src/core/manifest.js","utf8");
const i=s.indexOf("const ENTRY_FIELD_TYPES = {");
const j=s.indexOf("\n};", i);
if(i<0||j<0){console.error("could not isolate ENTRY_FIELD_TYPES");process.exit(1);}
const o=s.slice(i,j);
let bad=0;
if(!o.includes("symlink: { target: 'string', origin: 'string', dev: 'string', ino: 'string' }")){
  console.error("symlink cell does not match Table P");bad=1;}
if(!o.includes("'managed-block': { createdFile: 'boolean' }")){
  console.error("managed-block cell changed — Table P says it must not");bad=1;}
if(o.includes("anchorBefore")){
  console.error("anchorBefore type-gated — a non-string forgery would leave the block installed");bad=1;}
process.exit(bad);
' && echo "V6 ok"

# V7 — lint.
npm run lint
```

**Every structural check has a demonstrated failure mode, and the block executes
its own red runs — paste all of them.** Measured at `0f9ee08` while writing this
spec:

```text
V3 green (unmodified tree)                                        exit 0
V3 red   (ftruncateSync -> writeFileSync(entry.path, remaining))  exit 1
V4 green (unmodified tree)                                        exit 0
V4 red   (row-3 lexical fallback conjunct deleted)                exit 1
evasion 1: the guarded call wrapped in /* … */                    exit 1  (comment-stripping)
evasion 2: a LATER duplicate reverseManagedBlock appended         exit 1  ("2 top-level definitions … refusing to guess")
evasion 3: an INDENTED `  const ANCHOR_WINDOW = 8;`               counted 1 by the new V5 pattern, 0 by round 2's
```

The one evasion **not** covered is unreachable code — a guarded call sitting
after a `return`. That needs an AST, it is **residual R8**, and it is routed to
`WP-grep-gate-helper`. **V1 and V2 are the load-bearing checks**; these guards
exist to catch an implementer who edits the wrong region, not to prove behaviour.

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
- **Passing the identity seam from `reverse()`.** `reverseSymlink` gains
  `opts = {}` for tests only; production must keep calling it with six
  arguments so the default binds `linkIdentity`. (Round 1 of this spec listed
  the whole signature as out of scope; Codex round 1 finding 2 overturned that
  — see Exact contracts.)
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
| Deliverables — **exclusive** | **D1, D2** (manifest.js), **D8, D9** (shared.js), A-T1…A-T10 | **D3, D4, D5** (manifest.js), **D10** (shared.js), B-T1…B-T8 |
| Deliverables — **shared hunks, split ADDITIVELY** | **D6a** — the doc comment + `@typedef` gain `anchorBefore?` **only**. **D7a** — `shared.js:5` becomes `const { hashDir, insertionAnchor } = …`. **AC1a** — `insertionAnchor` exported and imported. **AC2a** — `anchorBefore?` documented | **D6b** — the *same* two hunks gain `origin?`, `dev?`, `ino?`, **extending** what Part A wrote. **D7b** — the *same* import line gains `linkIdentity`. **AC1b** — `linkIdentity` exported and imported. **AC2b** — the three symlink fields documented |
| Canonical tables | **Table Q**, Table P's `anchorBefore` row, Table B's three managed-block rows, Table F row 1, Table N's four anchor rows | **Table A2**, Table P's `origin`/`dev`/`ino` rows, Table B's three symlink rows, Table F rows 2–4, Table N's five symlink rows, **the Owner-ruling cost ledger** |
| Acceptance | AC3, AC4, AC5, AC1a, AC2a | AC6, AC7, AC1b, AC2b |
| Acceptance asserted by **both**, each against its own surfaces | AC8a, AC8a′, AC8b, AC9, AC10, AC11, AC12 | AC8a, AC8a′, AC8b, AC9, AC10, AC11, AC12 |
| Shared, unsplit | Table U's `manifest.js` rows for the region it edits; the security checklist's anchor bullets | Table U's `reverseSymlink` and `reverse()`-arm rows; the security checklist's identity bullets |
| Sizing if split | **M** | **S** |
| Owner ruling required? | **no** | **yes** — the cost ledger is entirely Part B's |

**Round 1's split table was not executable and Codex round 1 finding 4 was
right**: it handed *all* of D7 and AC1 to Part A while `linkIdentity` (D3) stayed
in Part B, so Part A could not satisfy its own acceptance criterion, and it gave
Part A the whole of D6 including fields only Part B introduces. The row above
replaces those with **additive per-part versions** — `a` for Part A, `b` for
Part B — so each part's hunk is complete and correct on its own.

**If it splits, Part A lands first and Part B `depends_on` it**, and the shared
hunks are edited **twice, additively**: Part A writes the `a` form, Part B extends
it to the `b` form. Both parts edit `src/core/manifest.js` and
`src/adapters/shared.js`, so they cannot run in parallel without a merge collision
— the same sequencing WP-153 took against WP-147, and for the same reason. Part A
is the more delicate of the two (it edits the F30-adjacent strip region), so its
anchors are the costlier ones to re-derive; putting it first means only Part B's
anchors need re-checking. **A second consequence of the ordering:** Part B carries
the owner ruling, so if the ruling is slow, Part A still ships.

**The architect's own reading, recorded so the gate does not have to re-derive
it:** the mechanisms share their shape but **not** their failure semantics — a
withheld separator strip leaves whitespace, a withheld unlink leaves a file — and
only Part B carries new completeness costs and therefore the owner ruling (the
cost ledger below). That is a genuine divergence — Codex round 1 sharpened it by
showing Part B has **two** such costs, not one — and the case for splitting is
real. It is written as one WP
because the shared surfaces (`shared.js:5`, the doc comment, the typedef, Table U,
the whole security checklist and the strictly-negative theorem) would otherwise be
duplicated across two specs and drift, which is the failure ADR-0031 exists to
prevent. **Either shape is defensible; this document is built so the decision can
be taken at the gate at near-zero cost.**

## Open question — ONE owner ruling over the WHOLE symlink-identity mechanism

**Rows 4a AND 4b each introduce a new uninstall-completeness cost, and by
WP-153's own precedent that is an owner decision, not an architect's.** Round 1
of this spec gated only row 4a and asserted that row 4b *"carries no completeness
cost at all"*; Codex round 1 finding 2 showed that contradicts this spec's own
residual table, which already admitted a restore or rebuild can change the
recorded pair. **Both rows are now costed in one table so Gyula rules once, over
the whole mechanism, rather than twice over halves of it.**

### The complete cost ledger for Part B (canonical for the ruling)

| Row | What it buys | What it costs | How narrow the cost is | Pinned by |
|-----|--------------|---------------|------------------------|-----------|
| **4a** (adopted ⇒ preserve) | closes residual B **case 2**: a link the user created before we synced is no longer deleted | a link **we** created is left behind when its manifest entry was lost and a later `sync` re-adopted it | `recordOnce` no-ops when an entry exists (`shared.js:50-51`), so an ordinary re-sync never re-records; and `uninstall` refuses outright without a manifest (`src/cli/uninstall.js:43-46`). It needs: manifest deleted or reset → reinstall → sync → uninstall | B-T2 |
| **4b** (identity must match) | closes residual B **case 1**: a user's same-source replacement is no longer deleted | **(a) durability** — a backup/restore, volume remount, home-directory migration, container rebuild or network filesystem can change `dev` and/or `ino` for a link nobody touched, which is then **left behind**; **(b) recycling** — an inode handed back to a user's replacement link at the same path with the same target passes 4b and is **deleted**, re-opening case 1 in that narrow subset | (a) is the fail-closed direction and never loses data; (b) requires the FS to reallocate the exact recorded inode at the exact path **and** the user to have re-pointed it at our source | B-T7 rows *changed-device*, *changed-inode*, *unavailable*, *reused* — all four deterministic through the identity seam |
| **4b's verify→unlink race** (not a separate row to ship; a property of 4b) | nothing — it is 4b's cost, not its benefit | the identity check and the unlink are two syscalls; a replacement landing between them is deleted despite the verified identity belonging to the previous object | requires **arbitrary same-user native code**, which `docs/THREAT-MODEL.md` places outside the boundary (A12), and which can delete the link directly without the race. Node exposes no atomic compare-and-unlink, so this cannot be closed in-process | **B-T8**, deterministic through the identity seam. **Residual R7; not claimed closed** (same disposition ADR-0028 takes for the scheduler's reopen-based check) |

**Neither row is ever worse than shipped `0f9ee08` on SAFETY** — base
`reverseSymlink` unlinks any recorded-path symlink with no ownership test at all,
so every row here only ever preserves more. The cost is **completeness only**,
and that is precisely the axis WP-153's owner ruling spoke to.

**Rejected while costing 4b, recorded so it is not re-proposed: adding a
birth-time / generation field** to make recycling detectable. It would narrow
cost (b) only, leaves cost (a) untouched, and `birthtimeMs` is not dependably a
creation time across the filesystems Wienerdog targets — buying a third field, a
third failure mode and a third mirror for the smaller half of one row's cost. If
the owner wants recycling closed, it is its own WP with its own platform survey.

### The trade for row 4a, in full

Closing residual B case 2 means treating a `wienerdog-*` link that
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

**The four dispositions, so the ruling is a choice and not an essay.** They are
ordered by how much of residual B closes; every one of them is safety-wise
equal-or-stronger than shipped `0f9ee08`.

| | Disposition | Residual B case 1 (same-source replacement) | Residual B case 2 (pre-existing adoption) | Completeness cost |
|---|---|---|---|---|
| (i) | **Ship rows 4a AND 4b** (this spec's current shape) | **closed**, except inode recycling | **closed** | both ledger rows above: adopt-leftover **and** identity-drift leftover |
| (ii) | **Ship 4b only**; record `origin` but leave it unread | **closed**, except inode recycling | **stays open** | identity-drift leftover only |
| (iii) | **Ship 4a only**; record `dev`/`ino` but leave them unread | stays open | **closed** | adopt-leftover only |
| (iv) | Ship neither; record all three fields, read none | stays open | stays open | none — but then this WP closes nothing on the symlink side and Part B should not ship |

**Architect's recommendation: (i)**, on the ground that ADR-0019 states the
priority explicitly — *anything uninstall cannot prove it created is preserved* —
and a leftover symlink in the user's own skills directory is a smaller harm than
deleting a file the user made. **(ii) and (iii) are both legitimate** and either
would let Part B ship against a narrower claim; **(iv) is only coherent if Part B
is dropped entirely**, since recording fields nothing reads is dead data by
CLAUDE.md's own rule.

**Whichever is chosen, the same surfaces move in the same pass** — this spec's
title, Table A2, the Table B rows for any site that stops recording, AC6, AC7,
B-T2/B-T7, Table R rows R4/R5 and this section. They are registered in the
Mirrored Surface Checklist under Table A2 for exactly this reason. **Do not
implement any arm until the ruling is recorded here.**

## Declared residuals after this WP (Table R — canonical)

Each row names its pinning test. A residual with no test is a claim.

| # | Residual | Bound | Pinned by | Routed |
|---|----------|-------|-----------|--------|
| **R1** | **Manifest forgery.** An attacker who can rewrite `install-manifest.json` deletes the new fields and gets `0f9ee08` behaviour | WP-147's Table M envelope for the managed block (≤ one newline per side, cannot cross a line boundary into user text) and WP-153's row-4 `OWNED(L)` gate for symlinks (the `wienerdog-` namespace in two directories the user gave us). **The anchor makes the managed-block half strictly tighter**: Q9 shows the in-vocabulary forgery now loses **zero** user bytes rather than one newline | A-T4, B-T5, and the shipped WP-147 T7/T9/T12 suites | manifest integrity — **declined by declaration**, not routed |
| **R2** | **In-window edit above the block.** A user edit inside the last 256 characters before the block leaves our blank line behind on uninstall | one separator, ≤ 2 whitespace bytes, **all of them ours**. Never a user byte | **A-T3** | not routed — this is the design's chosen trade (Implementation notes) |
| **R2b** | **Duplicated window ⇒ withheld strip.** When the recorded 256-character window occurs more than once in the user's document, `anchorProvesPosition` cannot tell the positions apart and **preserves**, leaving our blank line | same bound as R2 — one separator, all of it ours, never a user byte. This is the *fail-closed* half of the finding-1 fix and its price | **A-T6** asserts the preserve; its companion assertion is that **no user byte is lost**, which is what distinguishes this from a defect | not routed — preserve-on-ambiguity is the chosen answer (Codex round 1, finding 1) |
| **R2c** | **Window reproduced elsewhere.** A user who deletes the block's original neighbourhood **and** reproduces the same 256 characters at another position gets a strip at the new site: the anchor matches and the window is unique | the strip is still bounded by `ownershipOk` and `noFusion` — **at most one newline, never a fusion, never text** — i.e. the WP-147 envelope. Requires reproducing 256 exact characters by hand | none — stated, not pinned. A test would encode a contrived edit sequence and would pass on every implementation, so it would pin nothing | not routed. This is the honest edge of what a bounded window can prove and it is declared rather than papered over |
| **R3** | **No stable `(dev, ino)` on some platform.** Where `linkIdentity` returns `null` at creation time, no identity is recorded and WP-153's residual persists on that platform | the WP-153 residual, unchanged: the `wienerdog-` namespace under a harness skills root | B-T4 covers the *reverse* arm (absent identity ⇒ shipped behaviour). **The forward arm has no test** — it needs a platform that reports a zero `dev`/`ino`, which this repo's CI does not have | a Windows-runner probe, if one is ever wanted; not routed today |
| **R4** | **Identity drift and identity recycling.** `(dev, ino)` is durable but not permanent: a restore, remount, home migration, container rebuild or network filesystem can change it for a link nobody touched (→ **preserved**, a leftover); and a recycled inode handed to a user's replacement at the same path with the same target passes row 4b (→ **deleted**, case 1 re-opens in that subset) | drift is the fail-closed direction and never loses data; recycling needs the exact inode at the exact path **plus** the user re-pointing it at our source, and is still equal-or-stronger than base, which deletes unconditionally | **B-T7** — all four arms (*changed-device*, *changed-inode*, *unavailable*, *reused*) are deterministic through the identity seam. Round 1 recorded this as *"stated, not pinned; a test would have to fake `lstat`"*; the seam is that fake, so it is pinned now | **costed in the Owner-ruling ledger, row 4b.** A birth-time/generation field was considered and rejected there |
| **R5** | **Adopted-link leftover** — row 4a's half of the ledger | one symlink per core skill, in the harness skills dir, only after a manifest-loss reinstall | B-T2 pins the *behaviour*; the *cost* is what the owner rules on | **blocked on the owner ruling** |
| **R7** | **The verify→unlink race in `reverseSymlink`.** Row 4b's `identityOf(L)` and row 5's `fs.unlinkSync(L)` are separate syscalls; a replacement landing in the window is deleted | requires **arbitrary same-user native code** — outside the threat model per `docs/THREAT-MODEL.md`'s A12 / *"not an OS boundary"* posture — and such an actor can delete the link directly. **Only ever narrows against base**, which unlinks with no identity check at all | **B-T8** (identity seam replaces the link, then returns the recorded pair) | **not routed and not claimed closed.** Node exposes no atomic compare-and-unlink for a symlink; the same disposition ADR-0028 takes for the scheduler's reopen-based integrity check (*"not claimed as TOCTOU-free"*). Costed in the Owner-ruling ledger |
| **R8** | **The V3–V6 source guards are not AST-aware.** They strip comments and reject duplicate definitions, but cannot tell reachable code from code after a `return` | the guards are **tripwires**; V1/V2 — the test suite — are the load-bearing checks. This is WP-147's own stated disposition for the same class | the four evasions Codex named are each covered by an executed red mutation (see Verification steps); the uncovered one is unreachable-code | **`WP-grep-gate-helper`** — already routed by WP-147 as the canonical comment-stripping/AST gate helper, *"fourth instance of this shape"*. This spec is the fifth and does not re-route it |
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
> **2026-08-02 — Codex design-gate round 1 (`eb45674`): needs-attention, 5
> findings, 2 high. All five citations were spot-checked against the file first
> and all five were accurate; none was refuted; all five are ADOPTED.**
>
> - **(1, high) The hash match is not a position proof.** Reproduced: a document
>   containing the same 256-character window twice, with an honest move of the
>   block to the earlier occurrence, eats the user's blank line — no forgery, no
>   collision. The architect's *first* repair (a `candidate.length <=
>   ANCHOR_WINDOW` early return) was **also measured red on the same fixture**.
>   Fixed by pairing the hash with a uniqueness scan over the block-excised
>   document; four designs measured side by side under Table Q. New rows Q10–Q12,
>   new tests **A-T6** (duplicate window, red against all three rejected designs)
>   and **A-T7** (255/256/257 boundary sweep), new residuals **R2b**/**R2c**.
> - **(2, high) `(dev, ino)` is durable but not permanent, and is recyclable.**
>   The draft contradicted itself — R4 admitted drift while the Open question
>   claimed row 4b had "no completeness cost at all". Both rows now sit in **one
>   owner-ruling cost ledger** with four dispositions, so the ruling covers the
>   whole identity mechanism at once. `reverseSymlink` gains a **test-only
>   identity seam** (`opts = {}`, mirroring `reverseSchedulerEntry`) so all four
>   arms — changed-device, changed-inode, unavailable, reused — are deterministic
>   (**B-T7**, measured); **B-T1** keeps the end-to-end path but now asserts its
>   filesystem precondition instead of assuming it. A birth-time/generation field
>   was considered and rejected, with reasons, in the ledger.
> - **(3, medium) The verification greps were whole-file and evadable.**
>   Confirmed by measurement: `fs.ftruncateSync(fd, 0)` occurs **twice** at
>   `0f9ee08`, so V3's positive checks said nothing about `reverseManagedBlock`;
>   and `grep -c … -ge 2` never meant "defined once". V3 and V4 are now
>   **function-scoped** through a small guard helper (V0) and V6 is scoped to the
>   `ENTRY_FIELD_TYPES` literal; V5 counts **definitions**. V3 ships a literal
>   red-run command and both directions were executed at `0f9ee08`.
> - **(4, medium) The split table could not satisfy its own assignments.**
>   Correct: Part A was handed all of `D7`/`AC1`, which require `linkIdentity`,
>   a Part B deliverable. Replaced with **additive per-part** `D6a/D6b`,
>   `D7a/D7b`, `AC1a/AC1b`, `AC2a/AC2b`, and the shared-hunk edit order stated.
> - **(5, medium) Two acceptance mirrors contradicted their canonical tables.**
>   Correct on both: **AC8** claimed every corrupted field yields base behaviour
>   while Table N requires several to *preserve* — split into **AC8a** (absent ⇒
>   base) and **AC8b** (any other value ⇒ narrowing only, with the per-field
>   outcomes named); **AC9** said four producer sites where Table B enumerates
>   **six** — corrected, along with the same "four" in the ADR-0031 activation
>   paragraph, which was an unregistered mirror and is now registered.
>
> **2026-08-02 — Codex design-gate round 2 (`ae6f35d`): needs-attention, 1 high +
> 5 mediums. All six citations spot-checked against the file first; all six
> accurate; none refuted; all six ADOPTED.**
>
> - **(1, high) Verify→unlink is not atomic.** Correct, and reproduced with an
>   identity seam that replaces the link before returning the recorded pair.
>   **Declared, bounded and pinned rather than claimed closed** — Node exposes no
>   atomic compare-and-unlink for a symlink, the attacker needs arbitrary
>   same-user native code (`docs/THREAT-MODEL.md`'s A12 / *"not an OS boundary"*
>   posture, verified first-hand), and the outcome is reachable at base without
>   any race. Same disposition ADR-0028 takes for the scheduler's reopen-based
>   check (*"not claimed as TOCTOU-free"*). Residual **R7**, test **B-T8**, and a
>   row in the Owner-ruling ledger.
> - **(2, medium) Wienerdog's own separators manufactured ambiguity — and this
>   was an ORDINARY-PATH regression, the most serious item of the round.**
>   Reproduced exactly as reported: content `"\n"` restored as `"\n\n"`, content
>   `"\n\n\n"` as `"\n\n\n\n"`. The corpus is now `candidate + after` — the
>   document uninstall is about to leave — instead of the block-excised `content`.
>   Three corpora measured side by side; the fix changes none of Q1/Q3/Q4/Q10.
>   New row **Q13** and test **A-T10**, which also covers CRLF and
>   ambiguous-marker preservation.
> - **(3, medium) The guard still accepted comments and the wrong duplicate.**
>   Correct on all four sub-points. V0 now strips comments and refuses when a
>   function has more than one top-level definition; V5 counts definitions with a
>   whitespace-tolerant pattern. **Three evasions plus V4's red are executed in
>   the verification block.** The remaining one — unreachable code — needs an AST,
>   is residual **R8**, and is routed to the already-open `WP-grep-gate-helper`
>   (WP-147 opened it as the fourth instance; this is the fifth).
> - **(4, medium) AC8a contradicted row 4a.** Correct: an honest adopted entry has
>   `origin: 'adopted'` and no identity and must be preserved. AC8a is now scoped
>   to the **all-absent** shape, **AC8a′** enumerates all six accepted shapes, and
>   Table P gains rule **P-6** with every shape measured. **Row 4b additionally
>   changed**: a *partial* `dev`/`ino` pair is now unverifiable ⇒ preserve, rather
>   than being treated as absent ⇒ delete. B-T4 becomes six rows.
> - **(5, medium) The createdFile producer site had no test.** Correct — nothing
>   exercised `shared.js:179`. New test **A-T8** asserts the whole entry including
>   `anchorBefore === insertionAnchor('')`, plus second-run idempotency and the
>   file delete.
> - **(6, medium) R2c was pinnable and the round-2 claim was false.** Correct, and
>   **the claim is retracted in the spec text**. Codex's construction discriminates:
>   measured red against a full-prefix anchor and against an always-withhold
>   anchor. New row **Q14** and test **A-T9**, which also asserts the one-newline
>   whitespace-only safety bound.
>
> **Re-measured after the round-2 revisions:** `npm test` still `1901 / 1888 / 4`
> with the same four flips and the same values; all round-1 and round-2 rows
> unchanged; the six ordinary-path contents byte-perfect; all six provenance
> shapes as tabulated; all five identity-seam arms plus the race arm as declared.
>
> **One deferred nit checked and found already closed.** PR #144's gate deferred a
> citation fix in `docs/specs/done/WP-scheduler-node-path-durability.md` — the
> sibling range was said to read `:1881` instead of `:1880-1883`. At `0f9ee08` all
> three occurrences of that citation (`:815`, `:1078`, `:1679`) already read
> `:1880-1883`, `git log -S":1881"` on that path returns nothing, and
> `sed -n '1880,1883p'` of the sibling is the two-`print` call-count fact the
> citation is for. **Nothing to fix; no edit made.**
