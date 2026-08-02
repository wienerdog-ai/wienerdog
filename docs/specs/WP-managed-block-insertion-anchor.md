---
id: WP-managed-block-insertion-anchor
title: Record a managed-block insertion anchor at forward time so uninstall strips only separators it can prove are ours
status: In-Review
model: opus
size: M
depends_on: [WP-147]
adrs: [ADR-0004, ADR-0019, ADR-0031, ADR-0036]
epic: audit-a13
---

# WP-managed-block-insertion-anchor: forward-time position evidence for the managed-block reverser

> **OWNER-DECIDED IN SESSION — 2026-08-02 (TRANSCRIBED, NOT OWNER-TYPED).**
> Gyula Fehér answered in conversation; this record was written by the
> orchestrator, not by him. It records that the decision was taken — it is
> **not** his signature and must never be treated as one, and **no gate keys on
> it**. Verbatim, all three of his answers as given:
> *"1) ship as specified 2) ship 4a+4b 3) draft the ADR"*.
>
> **Answer 1 — "ship as specified" — is this spec's ruling: disposition (i).**
> Ship the anchor with the uniqueness conjunct. The owner accepts **R2** and
> **R2b**, the two bounded whitespace-leftover costs, at the sizes and
> frequencies the ledger measures. Dispositions (ii) and (iii) are **declined**.
> (Answer 2 rules on `WP-symlink-authorship-identity`; answer 3 authorizes
> **ADR-0038**, which codifies the narrowing rule and does **not** gate this
> spec — see that ADR's "Relationship to the two specs".)
>
> **This ruling was the only thing gating this spec**, so its status moves
> `Draft` → `Ready` in the same commit. The non-selected dispositions are kept
> below as dated records, not deleted — the ledger is the evidence the ruling was
> made against, and a future reader must be able to see what was declined.
>
> **This is Part A of a two-part chain.** It was drafted as one half of a
> consolidated WP that the 2026-08-02 wave routed under two names; the
> consolidated document was split at its own pre-cut line after Codex design-gate
> round 3, and **deleted** (the split is recorded in
> `docs/specs/logbook/2026-08-02-forward-time-ownership-provenance-split.md`).
>
> - **Part A — this spec, `WP-managed-block-insertion-anchor`.** The slug is the
>   one **WP-147 itself routed to**: *"Routed: `WP-managed-block-insertion-anchor`
>   — record the insertion position (prefix length or a context hash) at forward
>   time so the reverser can prove ownership on a relocated block."* Those
>   pointers in `docs/specs/done/WP-147-managed-block-separator-roundtrip.md`
>   resolve to this file.
> - **Part B — `WP-symlink-authorship-identity`**, which `depends_on` this spec.
>   It carries the symlink half and the owner ruling. `WP-153`'s prose routes to
>   the retired consolidated slug `WP-forward-time-ownership-provenance`; those
>   are **inert historical records in a `Done` spec and are deliberately not
>   edited** (the ROADMAP-retirement precedent), so the logbook entry is the
>   bridge from that name to these two.
>
> **Owner status: A RULING IS REQUIRED before this spec moves to `Ready`** — see
> the **Owner ruling** section. Rounds 1–3 of this spec asserted the opposite,
> and **that assertion was wrong**. It leaned on the 2026-08-02 FYI flag
> (*"WP-147 leaves a pre-existing cross-paragraph-relocation blank-line-collapse
> unchanged from 0.12.0; full fix routed to `WP-managed-block-insertion-anchor`"*),
> but that flag was FYI **because the behaviour it described was unchanged from
> shipped**. This WP's withhold cases (**R2**, **R2b**) are *not* unchanged: they
> leave a Wienerdog-authored separator that shipped code removes. By the repo's
> own discriminator — *"a residual may be a cost the design accepts; it may not be
> worse than the code it replaces"* (`done/WP-147-…:1461-1462`) — that is a **new
> cost**, and a new cost is the gated register.
>
> **A search for an existing delegation was run and found none.** ADR-0019,
> ADR-0004, MILESTONES M7, THREAT-MODEL, ARCHITECTURE, every `OWNER-*` marker in
> `docs/`, and the WP-144/WP-147/WP-153 owner walkthroughs were checked. Every
> owner marker in the repo ratifies **a named design**, not a class of tradeoff;
> none contains transferable language. The closest near-miss — WP-153's
> 2026-08-01 ruling — is scoped by its own spec to *"legacy (target-less) entries
> — Table A **row 2**"*, and WP-153 explicitly says *"Nothing in the ruling speaks
> to that"* about adjacent questions. **Do not cite a delegation; there is none.**
>
> **What this spec claims, stated exactly — it is NOT an unqualified "full
> close".** Codex round 3 finding 1 was right that the consolidated draft's
> header overclaimed. The honest scope:
>
> - **Closed:** every relocation where the anchor can *establish* the block's
>   position. That includes the case WP-147 declared and could not fix — a block
>   moved off its recorded append position with `sepBefore: '\n'` — which now
>   restores byte-perfectly instead of collapsing a user blank line.
> - **Converted, not closed:** cases where position cannot be established are
>   **withheld** rather than guessed. The cost is one leftover separator of
>   **our own** bytes, never a user byte (**R2**, **R2b**).
> - **Retained, bounded, pinned:** one case where the anchor establishes position
>   *wrongly* — a user who deletes the original neighbourhood and reproduces the
>   same 256 characters elsewhere. Cost: **at most the recorded `sepBefore` — two
>   whitespace characters — never text, never a fusion**, and **equal to base in
>   both arms** (**R2c**, pinned by A-T9's two cases). Rounds 1–3 stated this
>   bound as *"one newline"*, which is true only for the `'\n'` arm; Codex round 4
>   finding 1 found the `'\n\n'` arm and it is measured below.
>
> So: *this WP closes the relocation residual for every case the anchor can
> decide, subject to R2, R2b and R2c.* Nothing in this document may say "full
> close" without that qualifier.

## Context (read this, nothing else)

Wienerdog is an install-time tool that writes configuration files onto a user's
machine and records every artifact it creates in an **install manifest**
(`~/.wienerdog/install-manifest.json`). `wienerdog uninstall` replays that
manifest in reverse to remove exactly what was created and nothing else.

**IRON RULE (ADR-0004): Wienerdog is just files.** No daemons, no servers, no
telemetry. **ADR-0019** states the reverse-side half: uninstall recursively
removes the core's machine-generated-mechanics subdirectories and then the core
dir itself, so that *"an unmodified install thus leaves **only the vault**"* — its
**sole documented exception** is a user-modified `config.yaml`.

> **A misattribution corrected here, because it has propagated.** Four specs in
> this repo — including earlier revisions of this one — attribute the sentence
> *"anything it cannot prove it created is preserved"* to ADR-0019. **It is not in
> ADR-0019.** Measured: the word *"prove"* appears **zero** times in
> `docs/adr/0019-uninstall-disposes-core-mechanics.md`, and no ADR in `docs/adr/`
> contains the phrase *"cannot prove"*. It is an architect gloss. The principle is
> real and this spec relies on it, but it is a **design convention argued from
> WP-144/WP-146/WP-147/WP-153's shipped reversers**, not ratified ADR text — which
> is precisely why the Owner ruling below cannot be argued away by citing it. The
> `Done` specs carrying the misattribution are **not edited** (they describe what
> they shipped); this correction lives here.

The artifact this WP is about is the **managed block** — the sentinel-delimited
region (`<!-- wienerdog:begin -->` … `<!-- wienerdog:end -->`) Wienerdog splices
into a harness markdown file the user also owns (Claude Code's `CLAUDE.md`,
Codex's `AGENTS.md`). Forward: `sync` inserts the block plus a separator.
Reverse: `uninstall` strips the block and **only the separator bytes Wienerdog
added**.

**WP-147 shipped the shape half of that proof and declared what it could not
do.** Its manifest entry records `sepBefore`/`sepAfter` — the exact separator
bytes the last insertion wrote — and its reverser refuses any strip that would
fuse two user lines. But a shape can be reproduced by the user, so shape is not
position. WP-147 wrote the residual out in one sentence and routed the fix here:

> *"Once the user has **moved the block away from its recorded append position**,
> the reverser has no way to prove which surrounding bytes were Wienerdog's
> separators and which are the user's, because **the manifest records the
> separator's *shape* (`sepBefore`/`sepAfter`) but not its *position***. Full
> ownership closure would need an install-time **insertion anchor** — the prefix
> length at insertion, or a hash of the surrounding context — which this WP does
> not add."*

**This WP adds that anchor**: at forward-insertion time it records a bounded hash
of the content that immediately preceded the separator it wrote, and the reverser
must both match that hash **and** establish that the matching window is
unambiguous before it strips anything. On any doubt it **fails closed** — it
leaves the separator, which costs whitespace we wrote and never a byte the user
wrote.

**Three constraints bound the design, and every contract table below is written
against them:**

- **Backward compatibility is mandatory.** Entries written by older versions lack
  the new field. Missing provenance ⇒ **exactly the shipped 0.12.0 behaviour**,
  never stricter and never wider. `recordOnce`-style no-op semantics mean an
  upgraded install keeps its old entry shape **permanently**; if missing
  provenance made uninstall *stricter*, every pre-existing install would stop
  removing its own block and the ADR-0019 reversibility contract would break on
  upgrade.
- **The manifest is untrusted input.** It is a plaintext, user-editable,
  attacker-writable file (WP-144's founding premise). WP-147's gate rounds
  established that forged separator metadata was a **file-emptying primitive**,
  and closed it with a strict allowlist. The new field carries the same posture,
  stated as a theorem this WP must prove: **a forged anchor may only ever NARROW
  deletion, never widen it** (Table N).
- **A declared residual needs a pinning test.** That is what terminated WP-147's
  adversarial loop — a permutation report resolves against a committed assertion
  instead of re-opening the WP. Every row of Table R is pinned by a named test.

**Terminology note.** `docs/GLOSSARY.md` defines **provenance** as *"mandatory
frontmatter on auto-written notes"* — a **vault** concept, unrelated to this WP.
The operative term here is **insertion anchor**, and it is not a glossary term.
**Do not edit `docs/GLOSSARY.md`** — it is not a deliverable.

## Current state

**Re-verification record.** Every executable claim in this section was run
first-hand against the working tree at commit **`9188a1c`** on **2026-08-02**,
and **re-verified there again on 2026-08-03** after `WP-symlink-lexical-fallback-removal`
(PR #151) landed. The claims were first measured at `18bc909`, where `src/` was
byte-identical to `0f9ee08`; PR #151's change was **line-count-neutral**
(`src/core/manifest.js` is 1062 lines at both SHAs), so **no line number in this
spec shifted**. This WP touches no region PR #151 changed — only its V4 guard
references `reverseSymlink`, and that guard moved with it.
**Nothing was found stale.** The whole design was additionally **implemented as a
throwaway prototype and measured**; every "measured" figure in this spec is that
prototype's output, not reasoning. The prototype was discarded.

### 1. `applyManagedBlock` — the forward side, `src/adapters/shared.js:163-212`

Three branches, byte-identical (the `// ←` annotations are this spec's, not in
the file):

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

### 3. `reverseManagedBlock`'s leading-strip region — `src/core/manifest.js:285-312`

Byte-identical:

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
relocated block preceded by a user blank line still collapses it — **the residual
this WP closes**.

**The surrounding region of the same function, which this WP must NOT change**
(`manifest.js:240-284` and `:312-323`), is pinned byte-for-byte by **Table U**:
the fd-bound read, the ambiguity `try/catch`, the `span === null` skip, WP-147's
Table M separator-vocabulary block, and WP-144's F30 fd-bound truncate+write and
`target`-based delete.

### 4. The entry schema — `src/core/manifest.js:902-953`

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
the value is not `undefined`**, and extra keys are ignored (forward-compat).
`reverse()` runs it **first**, before kind dispatch (`:658-665`), and a rejected
entry is `skipped` — which for a managed block means **the block stays
installed**. That is why `anchorBefore` must **not** be listed here; the existing
comment already states the rule for its siblings.

### 5. The module doc comment — `src/core/manifest.js:16-29` and `:45-48`

Two in-code mirrors of the entry shape go stale the moment a field is added:

```text
 *   {kind:'managed-block', path, createdFile:bool,
 *    sepBefore?:string, sepAfter?:string}           — a sentinel block we wrote
```

```text
 * @typedef {{kind: string, path: string, hash?: string, createdFile?: boolean,
 *            commands?: string[], unload?: string[], sepBefore?: string,
 *            sepAfter?: string}} ManifestEntry
```

Both are registered in the Mirrored Surface Checklist. **Part B extends the same
two hunks with its own fields; this spec adds only `anchorBefore?`.**

### 6. The adapters→core import direction is already established

`src/adapters/shared.js:5` is `const { hashDir } = require('../core/manifest');`.
**Adapters may import from core; core may never import from adapters** — that is
why `locateManagedBlock` is duplicated in both files (`manifest.js:68-69` says so
in a comment). This WP puts its primitives in `src/core/manifest.js` and imports
them into `shared.js` on that same line, so the anchor window and the hashing are
defined **once**.

### 7. The one shipped assertion this WP flips — measured, not predicted

`npm test` at `18bc909` unmodified: **`tests 1901 / pass 1892 / fail 0`**. With
Part A's design alone applied, **exactly one** assertion flips —
`tests/unit/manifest.test.js:1417`, WP-147's T9 — and it is Table F's only row.
(The consolidated prototype flipped four; the other three are three `deepEqual`
assertions in `tests/unit/shared-skill-links.test.js` and belong entirely to
**Part B**. They are named here only so an implementer who runs the full suite
after Part A knows they must **not** move.)

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file itself (the status flip)
     and package-lock.json. Everything else must be listed. -->

**Sizing.** Three primitives (~32 lines) plus one conjunct in one predicate
(~6 lines) in `manifest.js`; one parameter and three call sites in `shared.js`;
two doc-comment cells; one test file extended, of which one shipped assertion is
edited, across eleven test rows. **M.** This is the larger half of the split and it
sits comfortably inside M now that the symlink mechanism is gone.

| Action | Path | Notes |
|--------|------|-------|
| modify | src/core/manifest.js | **D1** — add `ANCHOR_WINDOW`, `ANCHOR_HEX`, `insertionAnchor()` and `anchorProvesPosition()` beside `SEP_BEFORE_OK` (`:54-59`), and export `insertionAnchor`. **D2** — `reverseManagedBlock`'s leading-strip region (`:285-312`) gains the `anchorOk` conjunct per **Table Q**; **nothing else in that function changes** (Table U). **D6a** — the module doc comment (`:21-26`) and `@typedef ManifestEntry` (`:45-47`) gain **`anchorBefore?: string` only**; do **not** add Part B's symlink fields. **`ENTRY_FIELD_TYPES` is NOT edited by this WP** — Table P says why, and V6 enforces it. |
| modify | src/adapters/shared.js | **D7a** — `:5` becomes `const { hashDir, insertionAnchor } = require('../core/manifest');`. Do **not** import `linkIdentity`; it does not exist until Part B. **D8** — `recordManagedBlock` (`:113`) takes a seventh parameter `anchorBefore` and assigns it inside the existing `if (inserted)` block, per **Table P**; the sticky-true `createdFile` line is **unchanged**. **D9** — `applyManagedBlock`'s three `recordManagedBlock` calls (`:179`, `:197`, `:210`) pass the anchor per **Table B**; **no other byte of that function changes** (Table U). |
| modify | tests/unit/manifest.test.js | **A-T1 … A-T11** — the exact set in the Test index. **A-T5 is a required edit to a shipped assertion**, not a new test (**Table F**): `:1417`'s `assert.equal(forged, 'foo', …)` becomes `'foo\n\n'`. The WP-147 Table N suite (`:1336-1358`), T6, T7, T11 and T12 must pass **byte-unmodified** — they craft entries with no anchor, so they exercise the legacy arm and are the regression fence for it. |

Not deliverables, deliberately: `src/core/manifest.js`'s `reverseSymlink`,
`ENTRY_FIELD_TYPES`, and every other reverser; `applySkillLinks`; `recordOnce`;
`src/cli/**`; `docs/GLOSSARY.md`; `docs/adr/**`; `docs/specs/done/**`;
`tests/golden/**`; `tests/unit/shared-skill-links.test.js`;
`tests/unit/claude-adapter.test.js` (measured green under the prototype — see
Table F's note).

### Exact contracts

**The three new core primitives (`src/core/manifest.js`, beside `SEP_BEFORE_OK`):**

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
 *  UNIQUENESS test. Both together are the position proof; either alone is not.
 *  @param {ManifestEntry} entry
 *  @param {string} candidate  the content that would remain in front of the block
 *  @param {string} userText   the RECONSTRUCTED user document: `candidate + after`,
 *    i.e. what uninstall is about to leave on disk. It must NOT be the whole
 *    `content`, nor `content` with only the block excised — both still hold
 *    Wienerdog's own separator bytes, which manufacture false ambiguity on
 *    newline-only content (Table Q row Q13, measured).
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
```

`insertionAnchor` is added to `module.exports` (`manifest.js:1062`) and imported
in `src/adapters/shared.js:5`. `anchorProvesPosition` and the two constants are
**not** exported — nothing outside `manifest.js` needs them, and V5 asserts
`ANCHOR_WINDOW` never appears in `shared.js`.

**`recordManagedBlock`'s new parameter (`shared.js:113`):**

```js
/** @param {string|null} anchorBefore the insertionAnchor() of the content that
 *  immediately preceded sepBefore. Moves with sepBefore/sepAfter under the SAME
 *  update-on-insert rule — the three fields are one fact and must never be
 *  written apart (Table P rule P-1). */
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
    //     leave — NOT `content`, which still holds our own separator and makes
    //     newline-only files look ambiguous (Table Q row Q13).
    const anchorOk = anchorProvesPosition(entry, candidate, candidate + after);

    // ALL THREE are required, and the anchor is a CONJUNCT — never a disjunct.
    // It may only ever withhold a strip the other two would have allowed
    // (Table N); it may never authorise one they refused.
    if (anchorOk && ownershipOk && noFusion) before = candidate;
```

**Forward call sites, per Table B:**

```js
// :179  createdFile — the prefix that preceded our insertion was the empty string.
recordManagedBlock(manifest, mdPath, true, '', '\n', true, insertionAnchor(''));
// :197  replace — writes NO separators, so it must not touch the recorded ones.
recordManagedBlock(manifest, mdPath, false, null, null, false, null);
// :210  append — `current` is the exact prefix our sepBefore was appended to.
recordManagedBlock(manifest, mdPath, false, sepBefore, sepAfter, true, insertionAnchor(current));
```

## Contract reference

**Activation (ADR-0031's 2-of-7 test): four triggers fire.** (i) an interface
**shape** changes — the `{kind:'managed-block'}` entry gains a field; (iii)
**schema acceptance** is deliberately *not* changed, which is itself a decision
with a canonical row; (iv) **fallback/precedence** behaviour changes — a new
legacy arm and a new fail-closed arm in one reverser; (vii) the same contract
appears in **multiple mirrored surfaces** — three producer sites, two doc
comments, one reverser, one test file. **Six canonical tables** below.

### Table P — the `anchorBefore` field (canonical)

| Field | Type on disk | Written by | Exact value | Read by | Absent ⇒ | Type-gated in `ENTRY_FIELD_TYPES`? |
|-------|--------------|-----------|-------------|---------|----------|-----------------------------------|
| `anchorBefore` | `string` — 64-char lowercase hex | `recordManagedBlock`, inside the existing `if (inserted)` block, from `applyManagedBlock`'s three call sites | `insertionAnchor(prefix)` where `prefix` is the content that immediately preceded the inserted `sepBefore`: `''` on the createdFile branch, `current` on the append branch, **not written** on the replace branch | `reverseManagedBlock`'s `anchorOk` (Table Q row 3) | **shipped 0.12.0 behaviour** — `anchorOk` is `true`, the other two conjuncts decide alone | **NO.** A non-string forgery must REACH `reverseManagedBlock` so it degrades to `anchorOk = true` and the block is still removed. Type-gating rejects the entry upstream and **leaves the managed block installed forever** — the disposition WP-147's Table M explicitly rejected, and the reason the `managed-block` cell's existing comment (`manifest.js:909-913`) exists. Measured: with `anchorBefore: 42`, the block is still removed. |

**Rules that govern the field, decided here:**

- **P-1. `anchorBefore` moves with `sepBefore`/`sepAfter` and never apart.** Same
  `if (inserted)` block, same update-on-insert / preserve-on-replace rule.
  Writing one without the others is the exact defect class WP-147's gate rounds 4
  and 6 kept finding (a stale separator paired with a fresh one). There is no
  branch on which the anchor is recorded and the separators are not.
- **P-2. The createdFile branch records `insertionAnchor('')`, not `null`.** The
  prefix that preceded our insertion genuinely *was* the empty string (the file
  did not exist). Recording it keeps P-1 total — every insertion records all
  three — rather than adding a fourth rule. It is never consulted, because that
  branch records `sepBefore: ''` and the strip region is gated on
  `sepBefore.length > 0`; that is a consequence, not a reason to special-case it.
- **P-3. The replace branch must not refresh the anchor**, and this is the one
  place an implementer will get it wrong. `sync` runs that branch on every
  re-sync and `span.begin` is in scope there, so recomputing the anchor *looks*
  like a free accuracy win. It is the opposite: it would re-attest to separator
  bytes we did **not** write in that run. A user relocates the block, the next
  `sync` replaces the block's body, and a refreshed anchor would bless the user's
  blank line as ours — re-opening the residual through the front door.
- **P-4. Nothing backfills.** An install that predates this WP keeps its
  anchor-less entry until the next branch that actually *inserts* separators
  runs. "Legacy" is a durable state and the legacy arm is a shipped code path,
  not a migration window.

### Table Q — the managed-block leading-separator strip predicate (canonical)

The strip runs only when `sepBefore.length > 0 && before.endsWith(sepBefore)`
(unchanged). Inside that guard, **all three conjuncts must hold**; the first two
are WP-147's, unchanged, and are restated here only so the predicate has one home.

| # | Conjunct | Definition | Added by | Direction it can move the outcome |
|---|----------|------------|----------|-----------------------------------|
| 1 | `ownershipOk` | `!weSuppliedTerminator \|\| !candidate.endsWith('\n')`, where `weSuppliedTerminator` is `sepBefore === '\n\n'` | WP-147 | withhold only |
| 2 | `noFusion` | `candidate === '' \|\| candidate.endsWith('\n') \|\| (weSuppliedTerminator && after === '') \|\| after.startsWith('\n')` | WP-147 | withhold only |
| 3 | **`anchorOk`** | `anchorProvesPosition(entry, candidate, candidate + after)` — `true` when `entry.anchorBefore` is not a sha256 hex string (legacy); otherwise **both** `insertionAnchor(candidate) === entry.anchorBefore` **and** the window `candidate.slice(-ANCHOR_WINDOW)` occurs **exactly once** in `candidate + after`. `win === ''` short-circuits to `true` — offset 0 is the only empty prefix | **this WP** | **withhold only** |

**The hash match ALONE is not a position proof, and two plausible designs were
measured red before the third was adopted.** Codex design-gate round 1 finding 1
raised it; the reproduction falsifies three designs:

```text
FIXTURE  W = 256 chars ending in '\n'.  User document:  W + "\nTAIL\n" + W
         honest sync appends -> ...W + '\n' + BLOCK + '\n'   (sepBefore='\n', anchor=H(W))
         user MOVES the block to the FIRST occurrence:  W + '\n' + BLOCK + '\n' + "TAIL\n" + W
         candidate = W  ->  H(W) MATCHES, at a position that is NOT the recorded one

                                                          result
  base (no anchor)                                        FAIL — the user's blank line is eaten
  anchor, hash match only                                 FAIL — same
  anchor + uniqueness gated on candidate.length <= 256    FAIL — the shortcut fires and skips the test
  anchor + uniqueness, unconditional                      PASS — byte-perfect
```

**The `candidate.length <= ANCHOR_WINDOW` shortcut was this architect's first
repair and it is unsound** — it reasoned *"the window is the whole prefix, so a
match determines the prefix"*, which is true, but the **recorded** anchor was a
suffix of a *longer* original prefix, so whole-prefix equality on the current
document proves nothing about position. Recorded because the reasoning is
seductive and a later round would otherwise re-propose it. **Do not re-introduce
a length-conditional branch**; A-T6 is measured red against it.

**The corpus is `candidate + after`, and getting this wrong is an ordinary-path
regression.** Three corpora were measured; only the third is correct.

| corpus | what is still in it | verdict |
|--------|---------------------|---------|
| `content` (the whole file) | the block body **and** our separators | wrong — the digest body can contain the window, withholding the strip for a reason that has nothing to do with the user |
| `content` with the block excised | our `sepBefore` and `sepAfter` | **wrong, and measured red on the ORDINARY path** (Q13) |
| **`candidate + after`** — the document uninstall is about to leave | nothing of ours | **correct** |

Codex round 2 finding 2, reproduced: for a file whose entire content is `"\n"`,
an honest sync writes `"\n" + "\n" + BLOCK + "\n"`; the block-excised corpus is
`"\n\n\n"`, the window is `"\n"`, `indexOf` finds it three times, ambiguity is
declared, and uninstall leaves `"\n\n"` where base restores `"\n"`. **No
relocation, no user edit, no forgery — the ambiguity was manufactured entirely by
Wienerdog's own bytes.**

**Measured behaviour, prototype vs base, on the cases that matter.** Every row
was executed end-to-end through `applyManagedBlock` → `reverse()`; the recorded
`sepBefore` is whatever the honest forward step wrote, never hand-set.

| # | Fixture (structural: how the state is produced) | recorded `sepBefore` | base | **this WP** | verdict |
|---|--------------------------------------------------|----------------------|------|-------------|---------|
| Q1 | **The routed residual, closed.** Original `paraA\n\nparaB\n`; sync appends; user **moves** the block to sit between the two paragraphs → `paraA\n\n<BLOCK>\nparaB\n` | `'\n'` | `"paraA\nparaB\n"` — the user's blank line is gone (paragraph merge) | `"paraA\n\nparaB\n"` — **byte-perfect** | **FIXED** |
| Q2 | WP-147 **T11(c)**'s existing fixture: original `paraA\n`; sync appends; user **adds** `paraB\n` *after* the block | `'\n'` | `"paraA\nparaB\n"` | `"paraA\nparaB\n"` | **unchanged — and correct.** The leading context is untouched, the anchor matches, and the `\n` really is ours. T11(c) stays green byte-unmodified. |
| Q3 | Ordinary in-place uninstall, no user edit at all, original `foo\n` | `'\n'` | `"foo\n"` | `"foo\n"` | unchanged |
| Q4 | User edits **far** above the block — first line changed, 400 filler chars between it and the block | `'\n'` | byte-perfect | byte-perfect | **unchanged — the load-bearing bound.** Red against a full-prefix or prefix-length anchor, which would withhold here and leave a stray blank line on the common path. |
| Q5 | **The declared cost.** User edits **inside** the 256-char window, immediately above the block: `paraA\n` → `paraA-EDITED\n` | `'\n'` | `"paraA-EDITED\n"` | `"paraA-EDITED\n\n"` — our blank line **stays** | **cost, bounded**: one leftover whitespace byte we wrote. **Zero user bytes lost.** Table R row R2. |
| Q6 | A13 fusion probe: original `lineA\nlineB\n`; user relocates the block to `lineA\n<BLOCK>\nlineB\n` | `'\n'` | `"lineA\nlineB\n"` | `"lineA\nlineB\n"` | unchanged (`noFusion` already governed it) |
| Q7 | Q1's fixture, then an attacker **deletes** `anchorBefore` from the manifest | `'\n'` | `"paraA\nparaB\n"` | `"paraA\nparaB\n"` | **identical to base** — a stripped anchor buys exactly shipped behaviour, no more |
| Q8 | Q1's fixture, then an attacker sets `anchorBefore: 42` (non-string) | `'\n'` | `"paraA\nparaB\n"` | `"paraA\nparaB\n"`, block still removed | **identical to base** |
| Q9 | WP-147 **T9**'s in-vocabulary forgery: honest sync of `foo\n` records `sepBefore:'\n'`; the manifest is hand-edited to `'\n\n'`, no on-disk change | `'\n'` → forged `'\n\n'` | `"foo"` — the user's trailing newline is consumed | `"foo\n\n"` — **no user byte is lost**; our separator is left instead | **BOUND TIGHTENS.** Table F; Table R row R1. |
| **Q10** | **The duplicate-window move.** Document `W + "\nTAIL\n" + W` with `W` exactly 256 chars ending in `\n`; honest sync; user moves the block to the **first** occurrence | `'\n'` | the user's blank line is eaten | **byte-perfect** | **FIXED by the uniqueness conjunct.** Red against base, against the hash-only draft, **and** against the `<=WINDOW` shortcut. Pinned by **A-T6**. |
| **Q11** | Same shape, but the duplicated context is **shorter than the window** (15 chars, twice) | `'\n'` | one newline eaten | **byte-perfect** | already correct under the hash-only draft — a short `candidate` is a *whole-prefix* mismatch. The boundary's other side. |
| **Q12** | Boundary sweep at `candidate.length` = **255 / 256 / 257**, each under an ordinary in-place uninstall **and** an honest relocation — six runs | `'\n'` | — | **byte-perfect in all six** | pins that nothing special happens at the window edge now the `<=WINDOW` shortcut is gone. Pinned by **A-T7**. |
| **Q13** | **The ordinary-path corpus sweep.** Six whole-file contents, each synced and immediately uninstalled with **no relocation and no user edit**: `"\n"`, `"\n\n\n"`, `"a\na\na\n"`, CRLF `"x\r\ny\r\n"`, `"foo\n"`, and `""` (present but empty) | `'\n'` / `'\n\n'` | byte-perfect in all six | **byte-perfect in all six** | the block-excised corpus regressed two of these (`"\n"` → `"\n\n"`, `"\n\n\n"` → `"\n\n\n\n"`). Fixed by `candidate + after`. Pinned by **A-T10**. |
| **Q14** | **R2c, arm 1 — the `'\n'` separator.** `W` is 256 chars **ending in a newline**, so an honest append onto `` `PPPP\n${W}` `` records `sepBefore: '\n'`. The user then **replaces the prefix** with `` `QQ\n${W}` `` — the same window at a new, unique position — and relocates the block there | `'\n'` | **one** char stripped | **one char stripped — the DECLARED residual, EQUAL to base** | measured **red** against a full-prefix anchor and against an always-withhold anchor, so it discriminates. Pinned by **A-T9(a)**. |
| **Q15** | **R2c, arm 2 — the `'\n\n'` separator** (Codex round 4, finding 1). `W` is 256 chars **NOT** newline-terminated, so an honest append onto `` `PPPP\n${W}` `` records `sepBefore: '\n\n'`. Same reproduction, and the block sits **at EOF** | `'\n\n'` | **two** chars stripped | **two chars stripped — EQUAL to base** | **This is the arm rounds 1–3 missed.** With `sepBefore='\n\n'`, `candidate` has no trailing newline so `ownershipOk` passes, and `after === ''` at EOF so `noFusion`'s at-EOF disjunct passes — the strip removes **both** newlines. Pinned by **A-T9(b)**. |
| **Q16** | **R2b's cost, measured** (Codex round 5, finding 1). Content `"A\n"`; honest sync; the user **appends `"A\n"` after the block** — no relocation, no edit above it. The window is `candidate.slice(-256)` = `"A\n"`, **2 characters, not 256**, and it now occurs twice in the reconstructed document | `'\n'` | `"A\nA\n"` — the separator is removed | `"A\n\nA\n"` — **our separator is left**, one surplus character | **This is R2b, and it is far more ordinary than rounds 1–4 described.** Not a defect — zero user bytes move — but a **frequency correction to the ledger**. Pinned by **A-T11**, with a control (`"A\n"` + `"B\n"`) that costs nothing. |

**The R2c bound corrected, and why it is still a residual rather than a defect.**
Measured, both arms, base = WP-147 shipped:

```text
arm        recorded sepBefore   base strips   this WP strips   delta
'\n'       "\n"                 1 char        1 char           EQUAL
'\n\n'     "\n\n"               2 chars       2 chars          EQUAL
```

The correct bound is **"at most the recorded `sepBefore`"**, whose vocabulary
WP-147's Table M fixes at `''` / `'\n'` / `'\n\n'` — so **at most two whitespace
characters, never text, never a fusion**. Rounds 1–3 wrote *"at most one
newline"*, which is the `'\n'` arm only.

**It stays a residual and not a defect because it is EQUAL to base in both arms**
— the repo's own rule is *"a residual may be a cost the design accepts; it may not
be worse than the code it replaces"* (`done/WP-147-…:1461-1462`), and neither arm
is worse. **The mechanism cannot be changed to make the one-newline bound true**:
the `'\n\n'` at-EOF strip is exactly what an *honest* append onto unterminated
content requires (Table Q's genuine-append row), and the anchor matched, so
nothing distinguishes the honest case from this one. Narrowing it would break the
honest case; that is why the bound moves and the mechanism does not.

**Rows Q3, Q4, Q6, Q11 and Q13 are baseline rows** (ADR-0036 A1 exemption (ii),
`PATCH: none — baseline / ordinary path`): each records the run and names the assertion that
fires only on it. Their measured base-vs-prototype equality is the exemption's
evidence, not an author's claim.

### Table B — what each producer site records (canonical)

| Site | Branch | `createdFile` | `sepBefore` / `sepAfter` / **`anchorBefore`** |
|------|--------|---------------|-----------------------------------------------|
| `shared.js:179` | **createdFile** (file absent) | `true` (sticky-true keeps it true forever) | `''` / `'\n'` / **`insertionAnchor('')`**, `inserted = true` |
| `shared.js:197` | **replace** (sentinels present) | pass `false`; sticky-true preserves an earlier `true` | `null` / `null` / **`null`**, `inserted = false` → **all three PRESERVED** (rule P-3) |
| `shared.js:210` | **append** (present, no sentinels) | pass `false`; sticky-true preserves an earlier `true` | `sepBefore` / `'\n'` / **`insertionAnchor(current)`**, `inserted = true` |

### Table N — the strictly-negative posture (canonical)

**The theorem this WP must satisfy:** for every possible manifest, the set of
filesystem mutations performed after this WP is a **subset** of base's. New
evidence may only withhold a strip. **This is the rule `ADR-0038` codifies**
(Proposed, unsigned — cited as context, not as law; it gates nothing here, and
this WP measured the property independently).

| Forgery | What an attacker gains | Measured | Row |
|---------|------------------------|----------|-----|
| delete `anchorBefore` | exactly shipped 0.12.0 behaviour — bounded by WP-147's Table M envelope (at most one newline per side, cannot cross a line boundary into user text) | `"paraA\nparaB\n"`, identical to base | Q7 |
| set it to a non-string / non-hex value | same as deleting it; the block is still removed, so uninstall is not made incomplete either | `"paraA\nparaB\n"`, block removed | Q8 |
| set it to a *different valid* hash | a **withheld** strip — our separator is left behind. Incompleteness, never data loss | same code path as Q5 | Q5 |
| set it to the hash the attacker computed from the real file | shipped behaviour. Requires read access to the file whose bytes they want deleted, in which case they can already read and write it directly | — | Implementation notes |

**This WP does not close manifest forgery and does not claim to.** An attacker
who can rewrite the manifest can always delete the field and get base behaviour.
**What it closes is HONEST-USE position ambiguity** — a user who moved a block,
with nothing forged. Manifest integrity (signing/HMAC) is declined for the same
reason WP-147 declined it: the file carries no integrity protection at all,
`reverseCopiedSkill`'s `hash` lives with the identical residual, and protecting
one field while the file is otherwise unprotected buys nothing. **Out of scope by
declaration**, not by omission.

### Table F — the ONE shipped assertion this WP FLIPS (canonical)

**Measured.** With Part A's design applied to `18bc909`, exactly one assertion in
the whole repository changes state.

| File:line | Test | Current expectation | **New expectation** | Why the new one is correct |
|-----------|------|---------------------|---------------------|----------------------------|
| `tests/unit/manifest.test.js:1417` | `WP-147 T9 (Table M bound): an in-vocabulary at-EOF forgery loses exactly one newline, never text` | `assert.equal(forged, 'foo', 'forged entry loses exactly the trailing newline')` | `assert.equal(forged, 'foo\n\n', 'forged entry now loses NOTHING — the anchor refuses the forged separator claim and our blank line is left instead')` | The forgery claims `sepBefore: '\n\n'`, so `candidate` becomes `''`, which does not hash to the recorded anchor of `'foo\n'` → the strip is withheld. **The declared bound tightens from "one whitespace byte" to "zero user bytes".** Keep the third assertion (`control.replace(/\n/g,'') === forged.replace(/\n/g,'')`) **exactly as is** — it still holds and it is the assertion that fails if the loss ever widens past whitespace. Update the test's leading comment to say the bound tightened; **do not** rename the test. |

**Two files that do NOT flip, stated because an implementer will wonder.**
`tests/unit/claude-adapter.test.js`'s `a user-relocated mid-file block uninstalls
to exactly one blank line` (`:342`) goes through the adapter's **createdFile**
branch, which records `sepBefore: ''`; the strip region is gated on
`sepBefore.length > 0`, so the anchor is never consulted — measured green.
`tests/unit/shared-skill-links.test.js` is untouched by Part A entirely; its
three `deepEqual` assertions flip only under **Part B**.

### Table U — the regions that must stay BYTE-IDENTICAL

**"Unchanged" means byte-for-byte against the FILE** — `sed -n '<range>p' <file>`
at `18bc909` — **not** against this spec's excerpts, which are dedented and carry
`// ←` annotations that are not in the file.

| Region | anchor | Must stay |
|--------|--------|-----------|
| `reverseManagedBlock`'s signature | `manifest.js:240` | `reverseManagedBlock(entry, dryRun, removed, skipped, removedSet, fd, target)` — do **not** drop `fd`/`target` or re-derive them inside the function. |
| The read | `manifest.js:241-247` | `fs.readFileSync(fd, 'utf8')` inside its `try`. **Never re-open by pathname.** |
| The ambiguity `try/catch` and the `span === null` skip | `manifest.js:248-262` | unchanged |
| The `before`/`after` slice and WP-147's Table M vocabulary block | `manifest.js:263-283` | unchanged — the two `content.slice` lines, `SEP_BEFORE_OK`, the stderr notice, the legacy defaults, the trailing-terminator strip |
| `ownershipOk` and `noFusion` | `manifest.js:287-306` | unchanged — the anchor is a **third** conjunct, not a replacement for either |
| The `createdFile` delete | `manifest.js:314-316` | `fs.rmSync(target, { force: true })` — the pathname delete using `target`, **not** `entry.path` |
| The fd-bound write | `manifest.js:317-321` | `Buffer.from(remaining)` + `fs.ftruncateSync(fd, 0)` + `fs.writeSync(fd, buf, 0, buf.length, 0)`. **Never `fs.writeFileSync(entry.path, remaining)`** — that is the pre-F30 shape and restoring it silently regresses WP-144's delete-time binding. **V3 is the guard.** |
| `reverseSymlink`, in full | `manifest.js:168-217` (JSDoc `:159-167`) | **untouched by this WP** — it is Part B's, and PR #151 already narrowed its row 3 |
| `ENTRY_FIELD_TYPES` | `manifest.js:902-921` | **untouched by this WP** (Table P; V6 enforces it) |
| The `reverse()` managed-block arm | `manifest.js:829-869` | unchanged — the `O_NOFOLLOW` open, the `ELOOP`/`ENOENT` arms, the `finally` close |
| `applyManagedBlock`'s branch bodies | `shared.js:164-211` | unchanged except the three `recordManagedBlock` argument lists. **`out.changed.push(mdPath);` at `:180` and `:211` must survive** — a predecessor spec's snippet dropped it and `sync` silently stopped reporting the file as changed. |
| `applySkillLinks`, in full | `shared.js:395-503` | **untouched by this WP** — it is Part B's |

### Mirrored Surface Checklist

**Table P (the field)** — mirrors:

- [ ] Deliverables cells **D1**, **D6a**, **D8**
- [ ] Exact contracts: the `recordManagedBlock` JSDoc and the producer-site block
- [ ] `src/core/manifest.js:21-26` module doc comment (in-code mirror — D6a)
- [ ] `src/core/manifest.js:45-47` `@typedef ManifestEntry` (in-code mirror — D6a)
- [ ] Current state §4 (the schema quote) and §5 (the doc-comment quote)
- [ ] Table B (per-site values), Table N (forgery posture)
- [ ] Acceptance criteria **AC1**, **AC2**, **AC9**; Verification **V5**, **V6**

**Table Q (strip predicate)** — mirrors:

- [ ] Deliverables cell **D2**
- [ ] Exact contracts: the `anchorProvesPosition` body and the `anchorOk` snippet
- [ ] Current state §3 (the shipped predicate)
- [ ] Table U's `ownershipOk`/`noFusion` row
- [ ] Acceptance criteria **AC3**, **AC4**, **AC5**
- [ ] Test index **A-T1 … A-T11**; Table F; Table R rows **R1**, **R2**, **R2b**, **R2c**
- [ ] Verification **V2**
- [ ] The falsification record (the three rejected anchor designs) and the
      three-corpus table

**Table B (producer sites)** — mirrors:

- [ ] Deliverables cell **D9**; Exact contracts' producer-site block
- [ ] Current state §1 (the shipped call sites)
- [ ] Table P's "Written by" and "Exact value" columns
- [ ] Test index **A-T1**, **A-T8**; Acceptance criterion **AC9**

**Table F (the flipped assertion)** — mirrors:

- [ ] Deliverables cell for `tests/unit/manifest.test.js`
- [ ] Current state §7; Test index **A-T5**; Acceptance criterion **AC10**

**Table R (residuals)** — mirrors:

- [ ] Table Q rows **Q5**, **Q10**, **Q14**, **Q15**, **Q16**; Table N
- [ ] Test index **A-T3**, **A-T6**, **A-T9** (both arms), **A-T11** — the ONLY
      pinning test the ledger and Table R name for **R2b**
- [ ] The security checklist's position-proof bullet
- [ ] **The Owner ruling section** — its cost ledger repeats R2/R2b's bounds and
      its disposition table repeats Q1/Q10's outcomes
- [ ] The header blockquote's scope statement (the R2c bound and the owner status)

## Test index

Every row names how its state is produced **structurally** (the event that must
have happened), never by position in a sequence, and names the implementation it
reddens (ADR-0036 A1/A2). Rows whose job is to observe the ordinary path declare
`red against` explicitly rather than leaving reachability implied.

Reuse the shipped `applyManagedBlock`-based harness at
`tests/unit/manifest.test.js:1425-1445` (WP-147 T11's
`run(original, expectedSep, template)`): it syncs an honest original, asserts the
recorded `sepBefore`, then rewrites the file from a template with `<BLOCK>`
substituted. **Set every fixture up honestly through that path** — do not
hand-write manifest entries except where the row's job is forgery.

| # | Fixture (structural) | Assertion | Red against |
|---|----------------------|-----------|-------------|
| **A-T1** | Table Q row **Q1**: original `paraA\n\nparaB\n`, honest sync (records `sepBefore: '\n'`), then the file is rewritten to `paraA\n\n<BLOCK>\nparaB\n` — the block **moved**, the leading context changed | final content is **exactly** `paraA\n\nparaB\n`; also assert `typeof entry.anchorBefore === 'string'` so the row cannot pass by the legacy arm | base (yields `paraA\nparaB\n` — **measured**) and any implementation that treats the anchor as a disjunct |
| **A-T2** | Table Q rows **Q3** and **Q4**, two cases: (a) honest sync of `foo\n`, no edit, uninstall; (b) honest sync of `head\n` + 400 filler chars + `tail-para\n`, then the **first** line is edited and the block is left where it was | both restore **byte-perfectly** | (b) is red against a full-prefix or prefix-length anchor. **This is the row that justifies `ANCHOR_WINDOW` being bounded**; without it the design's central trade-off has no detector. |
| **A-T3** | Table Q row **Q5**, **both producer-valid separators — two arms, both required.** (a) honest sync of `paraA\n` (newline-terminated ⇒ `sepBefore: '\n'`), then the line immediately above the block is edited to `paraA-EDITED\n`. (b) honest sync of `paraA` (**unterminated** ⇒ `sepBefore: '\n\n'`), then the same edit to `paraA-EDITED`. **Assert the recorded `sepBefore` in each arm** so a fixture drifting onto the other one fails loudly | (a) final is **exactly** `paraA-EDITED\n\n`; (b) final is **exactly** `paraA-EDITED\n\n` *from a base of* `paraA-EDITED` — i.e. a **two**-character surplus. In both: assert the surplus against base equals `sepBefore.length`, and that `final.replace(/\n/g, '')` equals base's — no user byte is lost | `PATCH: none — the declared cost, pinned at its declared size on BOTH separators.` Not red-first, but **arm (b) is red against any implementation that mishandles the second separator byte**, which every rounds-1–5 fixture would have passed (Codex round 6, finding 1). |
| **A-T4** | Table Q rows **Q7** and **Q8**: A-T1's fixture, then the manifest entry is mutated — (a) `delete entry.anchorBefore`, (b) `entry.anchorBefore = 42` | both yield **exactly** base behaviour `paraA\nparaB\n`, **and** the block is in `res.removed` (uninstall is not made incomplete), **and** no `ignoring out-of-vocabulary separator metadata` notice fires (that notice belongs to `sepBefore`/`sepAfter`, not the anchor) | any implementation that type-gates `anchorBefore` in `ENTRY_FIELD_TYPES` (the entry would be rejected upstream and the block left installed), and any that treats a malformed anchor as a mismatch |
| **A-T5** | **EDIT to the shipped test at `:1396-1423`** — Table F. Fixture unchanged | `assert.equal(forged, 'foo\n\n', …)`; the control and the newline-stripped-equality assertions stay byte-unmodified | `PATCH: none — a shipped assertion whose expected value moved.` Its red-ness is Table F's measurement: it fails with `'foo\n\n' !== 'foo'`, which is exactly why it must be edited rather than left. |
| **A-T6** | Table Q row **Q10**, the duplicate-window move. Build `W = 'w'.repeat(251) + '\nEND\n'` (**exactly 256 characters, newline-terminated — assert `W.length === 256` in the test** so the fixture cannot silently drift off the boundary); original document `` `${W}\nTAIL\n${W}` ``; honest sync; rewrite the file to `` `${W}\n<BLOCK>\nTAIL\n${W}` `` | the final content is **exactly** the original document — **and** additionally assert the result contains no fewer `W` occurrences than the original, so the row fails loudly if the withhold ever becomes a strip | base, the hash-only anchor, **and** an anchor whose uniqueness test is gated on `candidate.length <= ANCHOR_WINDOW` — **all three measured red**. This is the only test that separates the three anchor designs. |
| **A-T7** | Table Q row **Q12**, the boundary sweep. Six runs: `candidate.length` ∈ {255, 256, 257} × {ordinary in-place uninstall, honest relocation} | in-place restores byte-perfectly at all three lengths; the relocation preserves byte-perfectly at all three | `PATCH: none — boundary pin.` Not red-first against the shipped design; it exists so the removal of the `<=ANCHOR_WINDOW` shortcut stays removed. Red against any re-introduction of a length-conditional branch. |
| **A-T8** | **The createdFile producer site** (`shared.js:179`). Fixture: the markdown file is **absent**; `applyManagedBlock` creates it | assert the whole entry: `createdFile === true`, `sepBefore === ''`, `sepAfter === '\n'`, **and `anchorBefore === insertionAnchor('')`** (import it; do not hardcode the digest). Then sync a **second** time and assert the entry and the file bytes are unchanged, and finally that uninstall **deletes** the file | red against any implementation that records `null`, omits the anchor, or records a non-empty `sepBefore` on this branch. **Measured**: the entry is `{createdFile:true, sepBefore:'', sepAfter:'\n', anchorBefore:'e3b0c442…b855'}` and uninstall deletes the file. |
| **A-T9** | Table Q rows **Q14** and **Q15** — **R2c, executable, BOTH producer-valid separators. Two cases, and both are required.** (a) `W = 'w'.repeat(251) + '\nEND\n'` — 256 chars, newline-terminated, so the honest append records `sepBefore: '\n'`; original `` `PPPP\n${W}` ``; rewrite the prefix to `` `QQ\n${W}` `` with the block after it. (b) `W = 'w'.repeat(253) + 'END'` — 256 chars, **not** newline-terminated, so the honest append records `sepBefore: '\n\n'`; same reproduction, block **at EOF**. **Assert the recorded `sepBefore` in each case** so a fixture that drifts onto the other arm fails loudly | each asserts the exact resulting bytes. **The bound assertion needs an explicitly defined baseline, because the pre-uninstall file still contains the block and `sepAfter`** and a raw delta against it can never be one or two characters (Codex round 5, finding 3). Define `noBlock` = the pre-uninstall content with **the block and its trailing `sepAfter` excised but the leading separator RETAINED**; then assert `noBlock.length - final.length === sepBefore.length`, that the removed characters are whitespace, and that `final` equals what **base** produces on the same fixture — (a) one character, (b) **two** | (a) red against a full-prefix anchor **and** an always-withhold anchor — both measured. (b) is `PATCH: none — the second arm of the same residual`, pinning the two-character bound; it is red only if the bound ever widens past `sepBefore`, or if a future change makes the arms diverge from base. **Rounds 1–3 had only (a), and the stated bound was wrong as a result** (Codex round 4, finding 1). |
| **A-T10** | Table Q row **Q13**, the ordinary-path corpus sweep. Six whole-file contents — `"\n"`, `"\n\n\n"`, `"a\na\na\n"`, CRLF `"x\r\ny\r\n"`, `"foo\n"`, `""` — each synced and immediately uninstalled with **no relocation and no edit** | every one restores **byte-perfectly**. Add one further assertion in the same test: a file with **ambiguous** sentinels is skipped with the shipped notice and left untouched, proving the anchor never runs on a file `locateManagedBlock` refuses | red against the block-excised corpus, which yields `"\n\n"` and `"\n\n\n\n"` on the first two rows — **measured**. This is the ordinary-path regression detector. |
| **A-T11** | Table Q row **Q16** — **R2b's COST**, which A-T6 does not pin. Six rows, honest sync then a **pure append after the block**, no relocation and no edit above it. **`sepBefore='\n'` arms:** `"A\n"` + `"A\n"`; `"hi\n"` + `"hi\n"`; `"# Notes\n"` + `"# Notes\n"`; control `"A\n"` + `"B\n"`. **`sepBefore='\n\n'` arms** (unterminated original — the two-byte case): `"A"` + `"\nA"`; control `"A"` + `"\nB"`. **Assert the recorded `sepBefore` per arm** | every repeating row yields a surplus versus base equal to **`sepBefore.length`** — one for the `'\n'` arms, **two** for the `'\n\n'` arm — the surplus is the recorded separator, and `final.replace(/\n/g, '')` is **byte-identical to base**, so no user byte moves. **Both controls yield base exactly**, proving the withhold is caused by the repetition and not by the append | `PATCH: none — the declared cost, pinned at its measured size and frequency.` Not red-first. It goes red if the cost ever widens past whitespace, or if the control starts costing too — either would mean the uniqueness test fires more broadly than declared. **This row exists because rounds 1–4 stated R2b's cost with the wrong fixture class** (Codex round 5, finding 1). |

**Idempotency (AC11) is asserted inside A-T2(a) and A-T8**: run the forward step
**twice** before uninstalling and assert the manifest entry is deep-equal to the
first run's and the file bytes are unchanged. Measured: second
`applyManagedBlock` → bytes identical, entry identical, one `unchanged`.

## Implementation notes & constraints

- **No new npm dependencies.** `node:crypto` is already required at
  `src/core/manifest.js:5`; `src/adapters/shared.js` gets the primitive by
  import, not by requiring `crypto` itself.
- **`ANCHOR_WINDOW` is defined ONCE**, in `src/core/manifest.js`, and reaches
  `shared.js` through the exported `insertionAnchor`. Do **not** duplicate the
  constant or the hashing into `shared.js`. The forward and reverse sides
  computing the same digest is the entire mechanism; two copies of a magic number
  is how it silently stops being the same digest. (`locateManagedBlock` **is**
  duplicated in both files — that duplication exists because `manifest.js` is
  core and may not import from `adapters/`. The reverse direction is already
  established at `shared.js:5`.)
- **Why a bounded window and not the whole prefix, or a prefix length.** All
  three detect the relocation in Q1. The whole prefix and the prefix length also
  fire on **any** edit anywhere above the block — including adding a paragraph at
  the top of `CLAUDE.md`, which users do — and each false fire leaves a stray
  blank line on an ordinary uninstall. WP-147 named that exact trade: closing the
  residual must not *"trade a rare cosmetic collapse for a **common** leftover
  blank line."* A bounded window keeps the common case correct (Q4, measured) and
  pays only in the narrow case where the user edited the text immediately above
  the block (Q5). **A prefix length is additionally rejected on its own merits**:
  it is strictly weaker than the window (a relocation into a same-length
  neighbourhood defeats it) while being strictly more brittle (every edit above
  changes it), so it loses on both axes.
- **A bounded window costs a uniqueness test, and that is not optional.** The
  price of bounding is that the window is a *suffix*, not the whole prefix, so it
  can occur twice. **Do not "simplify" `anchorProvesPosition` back to the hash
  comparison** — A-T6 is red against exactly that. Equally, **do not
  re-introduce a `candidate.length <= ANCHOR_WINDOW` early return**.
- **The uniqueness scan is two `String.prototype.indexOf` calls** over a user's
  `CLAUDE.md`. Do not reach for a regex, a rolling hash, or a precomputed index;
  there is no measurement suggesting this is hot, and CLAUDE.md's *"no
  abstractions for single-use code"* applies.
- **Why a hash and not the raw context.** `install-manifest.json` is a plaintext
  file. Storing 256 raw characters of the user's `CLAUDE.md` in it would copy
  user document text into the core — a new disclosure surface for zero functional
  gain, since equality is all the reverser needs.
- **Hash the string, not a normalized form.** Both sides read content with
  `fs.readFileSync(…, 'utf8')`, so both slice the same units. Do **not** normalize
  line endings, trim, or `NFC`-normalize — the anchor's job is exact
  byte-neighbourhood identity, and any normalization creates pairs of different
  files with the same anchor. CRLF content is covered by A-T10.
- **The anchor is a CONJUNCT.** There is one case where a matching anchor would
  arguably license a strip that `noFusion` refuses: an unterminated original
  `lineA`, `sepBefore: '\n\n'`, and the user appends `lineB\n` after the block.
  Byte-perfect restoration there is `lineAlineB\n` — which **fuses two lines**.
  WP-147's `noFusion` refuses it and that refusal stands: fusion is the defect
  WP-147 exists to prevent and no new evidence overrides it. Pinned by WP-147's
  shipped T11(b), which must stay green byte-unmodified.
- **Ambiguity → choose the simpler option** and record it in the PR body under
  "Decisions made". Do NOT expand scope. If a Table Q row disagrees with prose
  anywhere in this spec, **the table wins** and the prose is a spec bug — say so
  in the PR body.

## Security checklist

- [ ] **The manifest is untrusted input and the new field is read from it.**
      `anchorBefore` is shape-checked against `ANCHOR_HEX` (`^[0-9a-f]{64}$`,
      fully anchored, no `m` flag) **before** it is compared, and a value failing
      that check is treated as **absent**, not as a mismatch — matching WP-147's
      Table M disposition, which rejected "skip the entry" precisely because it
      hands an attacker a way to make uninstall incomplete.
- [ ] **The new field never flows into a filesystem path, a shell command, or an
      argument vector.** It is hashed and compared. There is no
      untrusted-identifier path-traversal surface to anchor.
- [ ] **The new evidence only ever narrows deletion** (Table N), proved by the
      measured rows A-T4, Q7 and Q8. This is the property that keeps a forged
      manifest from being a *new* deletion primitive.
- [ ] **No user document text enters the manifest.** The anchor is a digest, not
      a copy.
- [ ] **The position proof is stated at its real strength, not a stronger one.**
      A hash match alone does not prove position; the uniqueness conjunct is what
      does, and its own edge — a window the user reproduces elsewhere — is
      declared as **R2c** and pinned by A-T9 rather than claimed closed.
- [ ] **WP-144's F30 delete-time binding is untouched.** All managed-block IO
      still goes through the single `O_NOFOLLOW`-verified fd; the `createdFile`
      delete still uses the canonical `target` pathname. **V3 is the executable
      guard and it is proved red as well as green.**

## Acceptance criteria

> **Numbering note (One-Document Rule).** This spec's **AC** series skips 6 and
> 7: those ids belong to `WP-symlink-authorship-identity`, the sibling that
> `depends_on` this spec. The gap is deliberate — renumbering would break every
> cross-reference the two specs, the logbook and PR #149 already carry.
> **Nothing is missing here.** Note also that this spec's `Table P` rules
> **P-1…P-4** are its own; the sibling's equivalent rules are numbered
> **S-1…S-4** precisely so no id means two different things across the pair.

- [ ] **AC1.** `src/core/manifest.js` exports `insertionAnchor`;
      `src/adapters/shared.js:5` imports it from `../core/manifest`.
      `ANCHOR_WINDOW` is **defined exactly once** in `src/` and appears nowhere in
      `shared.js`.
- [ ] **AC2.** The module doc comment and `@typedef ManifestEntry` list
      `anchorBefore?` — and **only** that new field; Part B's symlink fields are
      not added here.
- [ ] **AC3.** Table Q rows **Q1** and **Q10** both yield byte-perfect results —
      the true relocation **and** the duplicate-window move — A-T1, A-T6.
- [ ] **AC4.** Table Q rows **Q3**, **Q4**, **Q12** and **Q13** still restore
      byte-perfectly — the anchor does not withhold on the ordinary path, on a
      distant edit, at any window-boundary length, or on newline-only and CRLF
      content — A-T2, A-T7, A-T10.
- [ ] **AC5.** The three declared costs each land at their declared size, with
      **zero user bytes moved** in all of them: row **Q5** yields
      `paraA-EDITED\n\n` (A-T3); rows **Q14** and **Q15** — **both arms** — strip
      exactly `sepBefore.length` whitespace characters against the defined
      no-block baseline and match base (A-T9); and row **Q16** leaves exactly one
      surplus separator with a control that costs nothing (A-T11).
- [ ] **AC8a — legacy degradation.** With `anchorBefore` **absent**, the reverser
      reproduces base behaviour byte for byte and the block is still removed —
      A-T4(a). This is the upgrade-safety criterion.
- [ ] **AC8b — narrowing only.** For **every** non-absent value, the action taken
      is a **subset** of base's. A non-hex value **degrades to base** and the block
      is still removed (A-T4(b)); a valid-but-different hash **withholds**
      (A-T3's code path).
- [ ] **AC9.** Each of the **three** producer sites in Table B — `shared.js:179`,
      `:197`, `:210` — records exactly what that table says. **Every site has a
      named test**: `:210` → A-T1's `anchorBefore` assertion; `:179` → **A-T8**,
      which asserts the full entry including `anchorBefore === insertionAnchor('')`;
      `:197` → the preserve-on-replace assertion in A-T8's second-run check.
- [ ] **AC10.** Table F's assertion is updated to its new expectation and passes;
      **every other test in the repository passes byte-unmodified**, including
      WP-147's Table N suite, T6, T7, T11, T12, and the whole of
      `tests/unit/shared-skill-links.test.js` and
      `tests/unit/claude-adapter.test.js`.
- [ ] **AC11.** Running the forward step twice is idempotent: identical file bytes
      and a deep-equal manifest entry after the second run.
- [ ] **AC12.** `npm run lint` passes.

## Verification steps (run these; paste output in the PR)

The structural checks are **scoped to one function or one object** and are
**executable**; V3 and V4 carry literal red-run commands. A whole-file `grep` is
not sufficient here — measured: `fs.ftruncateSync(fd, 0)` occurs **twice** in
`manifest.js`, so a whole-file "it is present" grep says nothing about
`reverseManagedBlock`.

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

# V1 — the whole suite. Expect zero failures.
npm test

# V2 — targeted.
node tests/run.js tests/unit/manifest.test.js

# V3 GREEN — F30 delete-time binding survived (WP-144), SCOPED to the one function.
node /tmp/wd-fnguard.js src/core/manifest.js reverseManagedBlock \
  "+fs.readFileSync(fd, 'utf8')" \
  "+fs.ftruncateSync(fd, 0)" \
  "+fs.writeSync(fd, buf, 0, buf.length, 0)" \
  "+fs.rmSync(target, { force: true })" \
  "-fs.writeFileSync(" && echo "V3 ok (green)"

# V3 RED — the same check against a copy carrying the pre-F30 regression. It MUST fail.
cp src/core/manifest.js /tmp/wd-v3-red.js
node -e 'const fs=require("node:fs"),p=process.argv[1];fs.writeFileSync(p,fs.readFileSync(p,"utf8").replace("fs.ftruncateSync(fd, 0);","fs.writeFileSync(entry.path, remaining);"))' /tmp/wd-v3-red.js
node /tmp/wd-fnguard.js /tmp/wd-v3-red.js reverseManagedBlock \
  "+fs.ftruncateSync(fd, 0)" "-fs.writeFileSync(" \
  && { echo "V3 BROKEN: the guard cannot fail"; exit 1; } || echo "V3 ok (red, as required)"

# V3 EVASIONS — the two the guard is hardened against. Both MUST fail.
cp src/core/manifest.js /tmp/wd-ev1.js
node -e 'const fs=require("node:fs"),p=process.argv[1];fs.writeFileSync(p,fs.readFileSync(p,"utf8").replace("    fs.ftruncateSync(fd, 0);","    /* fs.ftruncateSync(fd, 0); */"))' /tmp/wd-ev1.js
node /tmp/wd-fnguard.js /tmp/wd-ev1.js reverseManagedBlock "+fs.ftruncateSync(fd, 0)" \
  && { echo "EVASION 1 (block comment) NOT DETECTED"; exit 1; } || echo "evasion 1 (block-commented call) detected"
cp src/core/manifest.js /tmp/wd-ev2.js
printf '\nfunction reverseManagedBlock(entry, dryRun, removed, skipped, removedSet, fd, target) {\n  fs.writeFileSync(entry.path, "");\n}\n' >> /tmp/wd-ev2.js
node /tmp/wd-fnguard.js /tmp/wd-ev2.js reverseManagedBlock "+fs.ftruncateSync(fd, 0)" \
  && { echo "EVASION 2 (later duplicate) NOT DETECTED"; exit 1; } || echo "evasion 2 (later duplicate definition) detected"

# V4x — the extractor. Prints ONE top-level function verbatim, and REFUSES when
#   the name is defined more than once or is rebound (`reverseSymlink = ...`), so
#   a later shadowing definition cannot slip past a first-match search. A token
#   guard was proven evadable here: a branch calling `fs.readlinkSync(L) === T`
#   under a different identifier, inserted before row 4, kept every asserted
#   token and passed clean (measured, both review legs).
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
git show 9188a1c:src/core/manifest.js > /tmp/wd-base-manifest.js

# V4 — `reverseSymlink` is UNTOUCHED by this WP (it is Part B's). Assert it by
#   RECONSTRUCTION: the implemented function must be byte-identical to the one at
#   `9188a1c`, i.e. as `WP-symlink-lexical-fallback-removal` (PR #151) left it.
node /tmp/wd-fnextract.js /tmp/wd-base-manifest.js reverseSymlink > /tmp/wd-expected-symlink.js
node /tmp/wd-fnextract.js src/core/manifest.js      reverseSymlink > /tmp/wd-actual-symlink.js
diff -u /tmp/wd-expected-symlink.js /tmp/wd-actual-symlink.js && echo "V4 ok (byte-identical)"

# V4 RED — MUST fail against a copy that reintroduces a link-text comparison
#   under a DIFFERENT identifier, which is exactly what defeated the old token guard.
cp src/core/manifest.js /tmp/wd-v4-red.js
node -e 'const fs=require("node:fs"),p=process.argv[1];fs.writeFileSync(p,fs.readFileSync(p,"utf8").replace("  // Row 3: the link must PROVE it still resolves to the source we recorded.","  if (fs.readlinkSync(L) === T) { if (!dryRun) fs.unlinkSync(L); removedSet.add(L); removed.push(L); return; }\n  // Row 3: the link must PROVE it still resolves to the source we recorded."))' /tmp/wd-v4-red.js
node /tmp/wd-fnextract.js /tmp/wd-v4-red.js reverseSymlink > /tmp/wd-actual-red.js
diff -q /tmp/wd-expected-symlink.js /tmp/wd-actual-red.js >/dev/null \
  && { echo "V4 BROKEN: the guard cannot fail"; exit 1; } || echo "V4 ok (red, as required)"

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

# V5 — ANCHOR_WINDOW is DEFINED exactly once, in core, and shared.js neither
#      redefines it nor re-implements the digest. Counts DEFINITIONS, not mentions,
#      and the pattern allows leading whitespace so an INDENTED shadow is counted.
test "$(grep -cE '^[[:space:]]*const ANCHOR_WINDOW[[:space:]]*=' src/core/manifest.js)" -eq 1 || {
  echo "FAIL: ANCHOR_WINDOW is not defined exactly once in manifest.js"; exit 1; }
test "$(grep -c 'ANCHOR_WINDOW' src/adapters/shared.js)" -eq 0 || {
  echo "FAIL: ANCHOR_WINDOW leaked into shared.js"; exit 1; }
test "$(grep -c "createHash('sha256')" src/adapters/shared.js)" -eq 0 || {
  echo "FAIL: shared.js re-implements the digest instead of importing insertionAnchor"; exit 1; }
echo "V5 ok"

# V6 — ENTRY_FIELD_TYPES is UNCHANGED by this WP: anchorBefore must NOT be
#      type-gated, and the symlink cell is Part B's, not ours.
node -e '
const fs=require("node:fs");
const s=fs.readFileSync("src/core/manifest.js","utf8");
const i=s.indexOf("const ENTRY_FIELD_TYPES = {");
const j=s.indexOf("\n};", i);
if(i<0||j<0){console.error("could not isolate ENTRY_FIELD_TYPES");process.exit(1);}
const o=s.slice(i,j);
let bad=0;
if(o.includes("anchorBefore")){console.error("anchorBefore type-gated — a non-string forgery would leave the block installed");bad=1;}
if(!o.includes("symlink: { target: '"'"'string'"'"' }")){console.error("the symlink cell changed — it belongs to Part B");bad=1;}
if(!o.includes("'"'"'managed-block'"'"': { createdFile: '"'"'boolean'"'"' }")){console.error("the managed-block cell changed — Table P says it must not");bad=1;}
process.exit(bad);
' && echo "V6 ok"

# V7 — AC2: the two in-code doc mirrors carry the new field. SCOPED to the module
#      header (everything above `const BEGIN_SENTINEL`), so a mention anywhere
#      else in the file cannot satisfy it. AC2 had no executable check before
#      round 8's review.
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
node /tmp/wd-docfields.js src/core/manifest.js anchorBefore && echo "V7 ok"

# V8 — lint.
npm run lint
```

**Measured at `18bc909` while writing this spec:** V3 green exits 0; V3 red exits
1 (`MISSING inside reverseManagedBlock: fs.ftruncateSync(fd, 0)` +
`FORBIDDEN inside reverseManagedBlock: fs.writeFileSync(`); both evasions exit 1;
V4 green exits 0 and V4 red exits 1; V5's negative counters are all 0 and V6's
negatives are clean. V5's positive counter and V6 are post-implementation checks.

**The one evasion NOT covered** is unreachable code — a guarded call sitting
after a `return`. That needs an AST; it is **residual R8** and is routed to the
already-open `WP-grep-gate-helper`. **V1 and V2 are the load-bearing checks**;
these guards exist to catch an implementer who edits the wrong region, not to
prove behaviour.

## Out of scope (do NOT do these)

- **Everything in Part B** — `reverseSymlink`, `ENTRY_FIELD_TYPES`,
  `applySkillLinks`, `linkIdentity`, and the symlink fields on the doc comment
  and typedef. Part B `depends_on` this spec and lands after it.
- **Manifest integrity (signing/HMAC).** Declared out of scope by Table N, for
  the same reason WP-147 declined it.
- **An `anchorAfter` / trailing-side anchor.** `sepAfter` is always exactly
  `'\n'` — the block's own line terminator, ours on every branch — and WP-147's
  Table M bounds a forged `sepAfter` to that single value. An `anchorAfter` would
  add a field, a check and a failure mode to protect one byte that is already
  bounded.
- **Changing `locateManagedBlock`, `buildBlock`, the sentinel strings, or
  `SEP_BEFORE_OK`.**
- **Any change to `reverseManagedBlock`'s fd-bound IO, its signature, or its
  `target`-based delete** — WP-144 F30's, guarded by V3.
- **Any other reverser** — `reverseSettingsEntry`, `reverseCopiedSkill`,
  `reverseVendoredTree`, `reverseSchedulerEntry`.
- **Editing `docs/specs/done/WP-147-…`** to update its routing prose. A `Done`
  spec describes the code it shipped; its `WP-managed-block-insertion-anchor`
  pointers already resolve to this file.
- **`docs/GLOSSARY.md`.**

## Owner ruling — REQUIRED before this spec moves to `Ready`

**Rounds 1–3 of this spec claimed no ruling was needed. That was wrong** (Codex
round 4, finding 2), and the correction is recorded here rather than quietly
applied, because the wrong claim was argued rather than measured.

**The discriminator is the repo's own, stated twice in `Done` specs.**
`done/WP-147-…:1461-1462`: *"A residual may be a cost the design accepts — **it
may not be worse than the code it replaces**."* `done/WP-153-…:1286-1288`: an
FYI flag rather than a ruling is correct *"because it is equal-or-stronger than
base, so there is no new cost to ratify (contrast WP-153's legacy ruling, which
**accepted a new cost**)."* A new cost is the gated register.

**Measured against that bar, this WP has two rows on each side:**

| | vs shipped base | Register |
|---|---|---|
| The relocation fix (Q1, Q10) | **stronger** — user bytes that base deletes are preserved | FYI, already flagged 2026-08-02 |
| R2c (Q14, Q15) | **equal** in both arms — base strips the same 1 and 2 characters | FYI |
| **R2** (in-window edit) | **weaker on completeness** — our separator is left where base removes it | **GATED** |
| **R2b** (duplicated window) | **weaker on completeness** — same | **GATED** |

**No existing delegation covers this, and one was genuinely looked for.** ADR-0019
mandates completeness and its **sole documented exception** is a user-modified
`config.yaml`; it contains no tolerance clause and, measured, does not contain the
word *"prove"* at all. MILESTONES M7 (*"uninstall leaves only the vault"*) is
**silent** here rather than permissive — the managed block lives inside the user's
own `CLAUDE.md`, which uninstall never deletes — and silence is not delegation.
THREAT-MODEL and ARCHITECTURE state the completeness promise without a tolerance
clause. Every `OWNER-*` marker in `docs/` ratifies a **named design**, not a class
of tradeoff. **Do not construct a delegation citation.**

### The cost ledger (canonical for the ruling)

| Row | What it buys | What it costs | How narrow | Pinned by |
|-----|--------------|---------------|------------|-----------|
| **R2** — in-window edit ⇒ withhold | the anchor stays *bounded*, so an edit far above the block does **not** cost a leftover (Q4). This row is the price of that bound | when the user edits inside the last 256 characters immediately above the block, uninstall leaves **our** separator. **Measured on BOTH producer-valid separators**: `sepBefore='\n'` ⇒ **1** character, `sepBefore='\n\n'` ⇒ **2**. In both, every user character is preserved byte-for-byte against base | needs an edit in the 256-character window directly above the block, between the last `sync` and the uninstall | **A-T3**, **both arms** — the `'\n\n'` arm added in round 6 after Codex found the two-byte claim asserted but never exercised |
| **R2b** — repeated window ⇒ withhold | the position proof is sound; without it the duplicate-window move (Q10) silently eats a user blank line | when the window occurs more than once in the reconstructed document, uninstall leaves **our** separator. **Measured on BOTH producer-valid separators**: `sepBefore='\n'` ⇒ **1** character, `sepBefore='\n\n'` ⇒ **2**, each equal to the recorded `sepBefore.length`, with every user character preserved | **NOT "a 256-character run"** — the window is `candidate.slice(-ANCHOR_WINDOW)`, so for any prefix shorter than 256 characters it is **the whole prefix**, and repetition becomes easy. **Measured**: a `CLAUDE.md` whose content is `"A\n"`, with the user simply **appending `"A\n"` after the block** — no relocation, no edit above the block — already trips it. See the cost table below | **A-T11** (the cost). **A-T6 pins the benefit, not this cost** — Codex round 5 finding 1 |

**R2b's frequency, measured, because the ruling turns on it.** Rounds 1–4
described R2b as needing *"a 256-character run repeated in the user's own
`CLAUDE.md`"*, which made it sound vanishingly rare. **That was wrong**: the
window is `candidate.slice(-ANCHOR_WINDOW)`, so when the content before the block
is shorter than 256 characters the window is **the entire prefix**, and a single
repeated short line is enough. Measured end-to-end, base vs this WP, with **no
relocation and no edit above the block** — the user only appends a line *after*
the block:

```text
CLAUDE.md content   user then appends   base        this WP        surplus
"A\n"               "A\n"               "A\nA\n"    "A\n\nA\n"     1 char (ours)
"hi\n"              "hi\n"              "hi\nhi\n"  "hi\n\nhi\n"   1 char (ours)
"# Notes\n"         "# Notes\n"         "…\n…\n"    "…\n\n…\n"     1 char (ours)
"A\n"               "B\n"  (control)    "A\nB\n"    "A\nB\n"       0 — no cost
```

In every costing row the **user text is byte-identical** to base
(`final.replace(/\n/g,'')` equal) and the surplus is the single `\n` **we** wrote.

**The two-byte arm of both costs, measured** (Codex round 6, finding 1 — rounds
1–5 asserted "at most two whitespace characters" while every fixture used
`sepBefore='\n'` and therefore only ever exercised **one**). The two-byte cost
needs a **producer-valid unterminated original**, which is what records `'\n\n'`:

```text
row  original      user action                     sepBefore  base            this WP             surplus
R2   "paraA"       edit above -> "paraA-EDITED"    "\n\n"     "paraA-EDITED"  "paraA-EDITED\n\n"  2
R2   "paraA\n"     edit above -> "paraA-EDITED\n"  "\n"       "paraA-EDITED\n" "paraA-EDITED\n\n" 1
R2b  "A"           append "\nA" after the block    "\n\n"     "A\nA"          "A\n\n\nA"          2
R2b  "A\n"         append "A\n" after the block    "\n"       "A\nA\n"        "A\n\nA\n"          1
R2b  "A"           append "\nB"  (control)         "\n\n"     "A\nB"          "A\nB"              0
```

**In both two-byte rows the leftover length equals the recorded
`sepBefore.length` exactly, and every user character is preserved** — verified
directly, not inferred: `base.replace(/\n/g,'') === thisWP.replace(/\n/g,'')` is
`true` in all four costing rows. **A faulty implementation that mishandled the
second byte would have passed every test rounds 1–5 specified**; that is the gap
this measurement closes.

**How to read this for the ruling.** R2b is *frequent-ish on small files and rare
on large ones*: a real `CLAUDE.md` with more than 256 characters above the block
needs a genuine 256-character repetition, which is unlikely; a short or nearly
empty one needs only a duplicated line. The cost never changes shape — it is
always ≤ 2 whitespace characters Wienerdog authored, in a file uninstall does not
delete — but its **frequency** is higher than rounds 1–4 implied, and that is the
correction the ledger owes.

**A refinement was considered and NOT taken.** Recording, at forward time,
whether the anchor covered the *whole* prefix (`current.length <= ANCHOR_WINDOW`)
would let the reverser skip the uniqueness test in exactly the short-file case,
because a whole-prefix match *is* a position proof. It needs a second field and a
fourth rule in Table P, and it arrived at round 5 of a spec already over its
sizing budget. **Routed, not folded in: `WP-anchor-whole-prefix-flag`** (not
drafted). If the owner finds R2b's frequency unacceptable, that is the mechanism
that reduces it — and disposition (ii) below is the alternative that removes the
cost entirely at the price of Q10.

**Both costs are whitespace Wienerdog wrote, inside a file uninstall does not
delete, and neither can ever reach a user byte** — that is the argument *for*
accepting them, and it is the architect's argument, not a ruling.

### The three dispositions

| | Disposition | Q1/Q10 relocation fix | Cost |
|---|---|---|---|
| **(i) ✅ SELECTED** | **Ship as specified** (this spec's shape) — **owner-ruled 2026-08-02** | **closed** | R2 + R2b: a bounded whitespace leftover in the two withhold cases |
| (ii) *declined* | **Ship the anchor without the uniqueness conjunct** | Q1 closed, **Q10 stays open** (a duplicate-window move still eats a user blank line) | R2 only |
| (iii) *declined* | **Do not ship**; leave WP-147's residual open | stays open | none |

**Architect's recommendation was (i), and the owner ruled (i)** on 2026-08-02. The costs are whitespace we authored; the
thing bought is user-authored bytes that shipped code destroys. (ii) and (iii)
remain recorded above as declined alternatives. **The ruling is recorded in this
spec's header blockquote; implement arm (i).**

**Whichever is chosen, the same surfaces move in one pass** — this spec's header
blockquote, Table Q (rows Q5/Q10/Q14/Q15/Q16), Table R rows R2/R2b/R2c,
AC3/AC4/AC5, A-T3/A-T6/A-T9/A-T11, and this
section. They are registered in the Mirrored Surface Checklist.

## Declared residuals after this WP (Table R — canonical)

Each row names its pinning test. A residual with no test is a claim.

| # | Residual | Bound | Pinned by | Routed |
|---|----------|-------|-----------|--------|
| **R1** | **Manifest forgery.** An attacker who can rewrite `install-manifest.json` deletes the field and gets base behaviour | WP-147's Table M envelope: at most one newline per side, cannot cross a line boundary into user text. **The anchor makes it strictly tighter** — Q9 shows the in-vocabulary forgery now loses **zero** user bytes rather than one newline | A-T4, and the shipped WP-147 T7/T9/T12 suites | manifest integrity — **declined by declaration**, not routed |
| **R2** | **In-window edit above the block.** A user edit inside the last 256 characters before the block leaves our blank line behind on uninstall | one separator, ≤ 2 whitespace bytes, **all of them ours**. Never a user byte | **A-T3** | not routed — the design's chosen trade (Implementation notes) |
| **R2b** | **Repeated window ⇒ withheld strip.** When the window occurs more than once in the reconstructed user document, `anchorProvesPosition` cannot tell the positions apart and **preserves**, leaving our separator. **The window is `candidate.slice(-ANCHOR_WINDOW)`, so on a prefix shorter than 256 characters it is the WHOLE prefix** — a single repeated short line is enough, with no relocation and no edit above the block | at most two whitespace characters, all of them ours, **never a user byte** — measured, the user text is byte-identical to base in every costing fixture. This is the *fail-closed* half of the uniqueness conjunct and its price | **A-T11** pins the COST (three repeating fixtures + a non-repeating control). **A-T6 pins the BENEFIT** (Q10) and does not pin this row — the two were conflated through round 4 (Codex round 5, finding 1) | not routed — preserve-on-ambiguity is the chosen answer. A frequency-reducing refinement is routed to `WP-anchor-whole-prefix-flag` and deliberately not folded in |
| **R2c** | **Window reproduced elsewhere.** A user who deletes the block's original neighbourhood **and** reproduces the same 256 characters at another position gets a strip at the new site: the anchor matches and the window is unique | **at most the recorded `sepBefore`** — WP-147's Table M fixes that vocabulary at `''`/`'\n'`/`'\n\n'`, so **at most two whitespace characters, never a fusion, never text**. **EQUAL to base in both arms** (measured: base strips 1 and 2 respectively), which is why it is a residual and not a defect | **A-T9**, both arms, each asserting the delta is exactly `sepBefore.length` whitespace characters. Arm (a) discriminates: measured **red** against a full-prefix anchor and against an always-withhold anchor | not routed. This is the honest edge of what a bounded window can prove. **The bound was stated as "one newline" through round 3 and corrected in round 4** — the mechanism cannot be narrowed without breaking the honest unterminated-append case |
| **R8** | **The V3–V6 source guards are not AST-aware.** They strip comments and reject duplicate definitions, but cannot tell reachable code from code after a `return` | the guards are **tripwires**; V1/V2 — the test suite — are the load-bearing checks. This is WP-147's own stated disposition for the same class | the evasions listed in Verification steps each have an executed red mutation; the uncovered one is unreachable code | **`WP-grep-gate-helper`** — already routed by WP-147 as the canonical comment-stripping/AST gate helper, *"fourth instance of this shape"*. This spec does not re-route it |

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
   and V4's red runs and both evasion runs included**.
2. Branch `wp/managed-block-insertion-anchor`; conventional commits; PR titled
   `fix(uninstall): prove a managed-block separator's position before stripping it (WP-managed-block-insertion-anchor)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
5. **The Owner ruling above is recorded here.** This spec does not move to
   `Ready` without it, and no implementer starts without `Ready`. Its ledger is
   **independent of Part B's** — two specs, two ledgers, one decision list.

> **Provenance.** Part A of the split of the consolidated
> `WP-forward-time-ownership-provenance`, which was drafted 2026-08-02, taken
> through **three Codex design-gate rounds** (11 findings, 3 high), and split at
> its own pre-cut line rather than absorbing a fourth round. The consolidated file
> was deleted; the split is recorded in
> `docs/specs/logbook/2026-08-02-forward-time-ownership-provenance-split.md`.
> The slug is the one WP-147 routed to.
>
> **Design evidence carried forward, all measured at `0f9ee08`/`18bc909`
> (`src/` is identical at both):** the full suite baseline
> (`1901 / 1892 / 0`), the single flipped assertion, the sixteen Table Q rows,
> the three-design falsification of the anchor (hash-only and the `<=WINDOW`
> shortcut both red), the three-corpus comparison, and both idempotency runs.
> **Round-1 finding:** a hash match alone is not a position proof — the
> uniqueness conjunct was added and the architect's own first repair was measured
> red. **Round-2 finding:** the block-excised corpus manufactured ambiguity from
> Wienerdog's own separator bytes on newline-only content, an ordinary-path
> regression — the corpus became `candidate + after`. **Round-3 finding:** the
> R2c row's "unpinnable" claim was retracted; A-T9 pins it and discriminates.
