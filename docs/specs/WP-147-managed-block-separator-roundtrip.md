---
id: WP-147
title: Managed-block uninstall must remove only Wienerdog-added separators, never fuse a user's surrounding lines
status: In-Review
model: opus
size: M
depends_on: [WP-145, WP-146]
adrs: [ADR-0004]
branch: wp/147-managed-block-separator-roundtrip
---

# WP-147: Managed-block separator round-trip fidelity (audit A13)

## Context (read this, nothing else)

Wienerdog injects a **managed block** — a sentinel-delimited region holding the
session digest — into a harness markdown file the user also owns (Claude Code's
`CLAUDE.md`, Codex's `AGENTS.md`). Forward: `sync` splices the block in.
Reverse: `uninstall` strips it back out, and the file the user owns must survive
byte-clean. **IRON RULE (ADR-0004): Wienerdog is just files** — uninstall must
remove exactly what Wienerdog added and **never corrupt the user's surrounding
text**.

The block is bracketed by full-line sentinels
`<!-- wienerdog:begin -->` / `<!-- wienerdog:end -->`. Audit finding **A13**
(managed-block separators) reports that the reverse step strips a fixed one
leading + one trailing newline around the located block. That heuristic corrupts
the file whenever the user has **relocated** the block between two single-newline
lines: the leading-newline strip removes the terminator between the user's own
`lineA` and `lineB`, **fusing** them (`lineA\nBLOCK\nlineB\n` → `lineAlineB\n`).
The fix is to remove **only the separators Wienerdog actually added**, recorded as
origin metadata on the manifest entry, and to refuse any strip that would erase a
user line boundary.

This WP depends on **WP-145** (it edits `manifest.js`, which WP-144→WP-145 also
edit — sequence to avoid a merge collision) and **WP-146** (it edits
`shared.js`, which WP-146 also edits).

## Current state

**Re-verification record.** Every executable claim in this section was re-run
first-hand against the working tree at commit **`e7c845e`** on **2026-08-01**
(architect pass; this spec reached `Ready` at `3695f4f`, 2026-07-18, and `main`
has moved underneath it since). Line numbers below are `e7c845e`'s. **One claim
was stale and is corrected here — the reverse-side tail quote; see §"What
re-verification found stale" at the end of this section.** Everything else was
confirmed by execution, including both bugs reproduced live end-to-end.

**Forward** — `src/adapters/shared.js`, `applyManagedBlock(...)`. Absent file →
write `block + '\n'`, record `{kind:'managed-block', path, createdFile:true}`
(`shared.js:142-151`). Sentinels present → splice replace, no separator change
(`shared.js:155-169`). **Present, no sentinels (append)** — `shared.js:172-175`,
byte-identical at `e7c845e`:

```js
const base = current.replace(/\n+$/, '');      // ← LOSSY: destroys the file's own trailing newlines
const next = `${base}\n\n${block}\n`;          // ← inserts a blank-line separator + block + one newline
if (!dryRun) fs.writeFileSync(mdPath, next);
recordOnce(manifest, { kind: 'managed-block', path: mdPath, createdFile: false });
```

The manifest entry records NO information about how many separator bytes were
inserted.

**Reverse** — `src/core/manifest.js`, `reverseManagedBlock(...)`. **The signature
gained two parameters in WP-144's F30 pass and is now, at `manifest.js:182`:**

```js
function reverseManagedBlock(entry, dryRun, removed, skipped, removedSet, fd, target)
```

`fd` is an already-open `O_NOFOLLOW`-verified fd for the file (`O_RDWR`, or
`O_RDONLY` under `dryRun`); `target` is its canonical-parent +
`O_NOFOLLOW`-checked basename. The caller opens it once at `manifest.js:730-770`
(the `openSync` is at `:746`, this call at `:764`, the `finally` close at `:769`)
and read+modify+write all go through that **same fd**, so the final component's
identity cannot change between read and write. **This is a security property
(delete-time binding, WP-144 F30) and this WP must not touch it.**

The separator logic this WP changes is `manifest.js:205-213`, byte-identical at
`e7c845e`:

```js
let before = content.slice(0, span.begin);
let after = content.slice(span.end);
// (comment block omitted)
if (before.endsWith('\n')) before = before.slice(0, -1);   // ← strips ONE leading newline unconditionally
if (after.startsWith('\n')) after = after.slice(1);        // ← strips ONE trailing newline
const remaining = before + after;
```

The **tail that follows it** is `manifest.js:215-223`, also byte-identical at
`e7c845e`, and is **not** changed by this WP:

```js
if (entry.createdFile === true && remaining.trim() === '') {
  if (!dryRun) fs.rmSync(target, { force: true });   // pathname delete — needs `target`, not the fd
  removedSet.add(entry.path);
} else if (!dryRun) {
  const buf = Buffer.from(remaining);                // fd-bound write — WP-144 F30
  fs.ftruncateSync(fd, 0);
  fs.writeSync(fd, buf, 0, buf.length, 0);
}
removed.push(entry.path);
```

`span` comes from `locateManagedBlock(content, path)` (duplicated in both files;
NOT changed by this WP): `begin` = start of the BEGIN sentinel line, `end` =
just past the END sentinel text (excludes the block's own trailing `\n`).

The unconditional `before.endsWith('\n') → slice(0,-1)` is the fusion bug.

**Both bugs reproduce live at `e7c845e`** — executed through the real
`applyManagedBlock` → `manifest.reverse()` round trip, not reasoned about:

```text
seed "seed\n"     → forward "seed\n\n<BLOCK>\n" ; relocate to "lineA\n<BLOCK>\nlineB\n"
                  → uninstall yields "lineAlineB\n"        ← FUSION
seed "seed\n\n\n" → forward "seed\n\n<BLOCK>\n" → uninstall yields "seed\n"   ← LOSSY
seed "seed"       → forward "seed\n\n<BLOCK>\n" → uninstall yields "seed\n"   ← LOSSY
```

WP-144's manifest schema validator ignores unknown/extra entry keys (it only
enforces required keys/types for the listed fields), so adding
`sepBefore`/`sepAfter` to a `managed-block` entry is safe and needs no schema
change. **Executed at `e7c845e`:**

```text
validateEntry({kind:'managed-block', path:'…', createdFile:false,
               sepBefore:'\n', sepAfter:'\n'})  →  {"ok":true}
```

Optionally list them as known-optional keys in `ENTRY_FIELD_TYPES`
(`manifest.js:806-817`) — additive only, no rejection.

### What re-verification found stale

**One item, and it was a security hazard.** This spec reached `Ready` at
`3695f4f` (2026-07-18) quoting the *pre-F30* reverse tail:

```js
if (entry.createdFile === true && remaining.trim() === '') { /* delete file */ }
else if (!dryRun) fs.writeFileSync(entry.path, remaining);
```

**WP-144's F30 pass (`a4415a5`, 2026-07-20) replaced that** with the fd-bound
`ftruncateSync` + `writeSync` shown above, changed the delete to
`fs.rmSync(target, …)`, and added the `fd` and `target` parameters. Because this
spec's Exact contracts say *"the rest of `reverseManagedBlock` … is unchanged"*,
an implementer reconstructing the tail from the stale quote would have written
`fs.writeFileSync(entry.path, remaining)` back in — **silently regressing the
delete-time-binding fix to a path-based re-open.** The snippets above are the
`e7c845e` text, and the Exact contracts section now names the tail explicitly
instead of gesturing at it.

Everything else was confirmed by execution: the forward absent-file branch
(`shared.js:142-151`), the append-branch quote (`shared.js:172-175`) byte-identical,
the strip logic (`manifest.js:205-213`) byte-identical, `validateEntry` accepting
the two new keys, both bugs reproduced live, both dependencies (`WP-145`,
`WP-146`) `Done` in `docs/specs/done/`, all four Deliverables paths present, and
the suite green (`npm test` → 1825 tests / 1820 pass / 0 fail; `npm run lint`
passed). One further correction, not a code claim: the Deliverables comment
listed `docs/specs/ROADMAP.md` as always-allowed; that file was retired by
`WP-roadmap-retirement` and does not exist at `e7c845e`, so the line now matches
the current template.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file itself (the status flip)
     and package-lock.json. Everything else must be listed.
     (Corrected 2026-08-01: this comment used to also list docs/specs/ROADMAP.md,
     which WP-roadmap-retirement removed — it does not exist at e7c845e.) -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/adapters/shared.js | `applyManagedBlock`: replace the lossy append with a non-lossy insert that records the exact inserted separator bytes (`sepBefore`, `sepAfter`) on the manifest entry. `createdFile` and `replace` branches keep behavior; record `sepAfter:'\n'` on the createdFile branch. |
| modify | src/core/manifest.js | `reverseManagedBlock`: strip only the recorded (or legacy-default) separators, and only when the strip preserves a line boundary — never fuse user lines, **and never consume a newline the user supplied** (the `weSuppliedTerminator` gate on the at-EOF disjunct — Table N). |
| modify | tests/unit/claude-adapter.test.js | Round-trip cases incl. the relocated-block-between-single-newline-lines case (**Table N row 4**), plus **T8**: create (absent file) → **sync again at least twice** → uninstall, asserting the file is **REMOVED**, not truncated to empty (the sticky-`createdFile` guard, red against a plain-overwrite upsert), plus **T10**: the two **delete-and-reinsert** round trips from the per-field/per-branch matrix — both directions, red against first-insertion-wins. **AND one MANDATORY update to a shipped assertion at `:342-361` — see "The one shipped assertion this WP flips".** |
| modify | tests/unit/manifest.test.js | Direct `reverseManagedBlock` cases for recorded + legacy (no sep metadata) entries — **all of Table N** — plus **T6**, the discrimination pair (**rows 3 and 2**, which differ only in `sepBefore`; both are required, see Table N's T6 note), **T7**, the out-of-vocabulary forged-metadata rows from **Table M**, and **T9**, the *in-vocabulary* at-EOF forgery that makes Table M's declared bound executable. |

### Exact contracts

**Forward (`applyManagedBlock`, append branch — present file, no sentinels):**
```js
// Non-lossy: keep the file's own trailing newline(s); insert exactly one blank
// line before the block and record the exact bytes we add, so uninstall can
// remove only OUR separators (audit A13).
const pad = current.endsWith('\n') ? '' : '\n';       // ensure content ends with a newline first
const sepBefore = `${pad}\n`;                          // '\n' (already newline-terminated) or '\n\n'
const sepAfter = '\n';                                 // the block's own line terminator
const next = `${current}${sepBefore}${block}${sepAfter}`;
if (!dryRun) fs.writeFileSync(mdPath, next);
recordManagedBlock(manifest, mdPath, false, sepBefore, sepAfter, true);  // inserted → UPDATE
out.changed.push(mdPath);                              // ← UNCHANGED, and easy to drop
```
- createdFile branch: `recordManagedBlock(manifest, mdPath, true, '', '\n', true)`
  (file is exactly `block + '\n'`; no leading separator). **`inserted = true`** —
  this branch really does write separators.
- replace branch (sentinels already present): unchanged splice; call
  `recordManagedBlock(manifest, mdPath, false, null, null, false)`.
  **`inserted = false`** — the splice writes **no** separators, so this branch
  must not touch the recorded ones. `createdFile` is sticky-true, so its `false`
  cannot clobber a real create either.

Add `recordManagedBlock(manifest, path, createdFile, sepBefore, sepAfter, inserted)`
in `shared.js`. **Mirror `recordSettingsEntry` (`shared.js:90-98`), not
`recordCopiedSkill`** — it is the in-tree helper that already solves the sticky
half of this:

```js
/** @param {boolean} inserted TRUE only on the two branches that actually WRITE
 *  separators (createdFile, append). The replace branch splices between existing
 *  sentinels and writes none, so it passes false and the recorded separators
 *  are left exactly as they are. */
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

### The per-field, per-branch matrix (canonical)

**The two fields follow THREE distinct rules between them**, and every round that
touched this helper got caught by conflating two of them. The matrix is the
contract; do not derive it from prose.

| Branch | writes separators? | `createdFile` | `sepBefore` / `sepAfter` |
|--------|--------------------|---------------|--------------------------|
| **createdFile** (file absent) | **yes** — `''` + block + `'\n'` | set `true` (sticky-true keeps it true forever) | **UPDATE** to `''` / `'\n'` |
| **append** (file present, no sentinels) | **yes** — `sepBefore` + block + `'\n'` | pass `false`; **sticky-true preserves an earlier `true`** | **UPDATE** to what was just inserted |
| **replace** (sentinels present) | **no** — splice only | pass `false`; **sticky-true preserves an earlier `true`** | **PRESERVE** — pass `inserted = false` |

- **`createdFile` → sticky-true, in all three branches.** The replace branch calls
  with `false` on every re-sync; a plain overwrite flips `true → false` on the
  first re-sync after a create, and uninstall then **truncates the file instead of
  deleting it**, leaving an empty `CLAUDE.md` we made. Exactly the defect
  `shared.js:83-87` documents for `settings-entry`. (Found gate round 4.)
- **Separators → update-on-insert / preserve-on-replace.** They must describe the
  bytes of the **most recent actual insertion**. Preserving them on replace is
  required (that branch inserts nothing); **updating them on insert is equally
  required** — see the delete-and-reinsert defect below. (Found gate round 6.)

**Sticky-true is safe here for the same reason it is safe there:** the reverser
deletes the file only when it is **also** empty after the strip
(`remaining.trim() === ''`, `manifest.js:215`), so a stale `createdFile: true`
can never delete a file that still holds user text.

#### Why first-insertion-wins was wrong — the delete-and-reinsert cycle

An earlier revision made the separators **first-insertion-wins** (set only when
absent). That is correct for the replace branch and **wrong for the append
branch**, because a user can delete the managed block by hand and leave the file
in a *different* termination state than it had at first insertion — after which
the next `sync` genuinely inserts **different separator bytes** while the manifest
keeps the stale ones. **Both directions measured at `e7c845e`:**

```text
rule = first-wins
  (a) "foo" -> delete, left "foo\n"   recorded sepBefore="\n\n" -> uninstall "foo"    want "foo\n"   *** WRONG ***
  (b) "foo\n" -> delete, left "foo"   recorded sepBefore="\n"   -> uninstall "foo\n"  want "foo"     *** WRONG ***

rule = per-branch
  (a) "foo" -> delete, left "foo\n"   recorded sepBefore="\n"   -> uninstall "foo\n"  want "foo\n"   ok
  (b) "foo\n" -> delete, left "foo"   recorded sepBefore="\n\n" -> uninstall "foo"    want "foo"     ok
```

Direction (a) **eats the user's newline**; direction (b) **leaves an extra one**.
The existing tests never caught it because they exercise only the
**sentinel-replacement** re-sync, where nothing is inserted and first-wins and
per-branch agree.

**Declared residual — unchanged by this fix.** The in-vocabulary forgery bound in
**Table M** is unaffected: this changes *which* in-vocabulary value gets recorded
by an honest sync, not the set of accepted values, and a stale-vs-fresh separator
is the same one-whitespace-byte envelope. Nothing else in the threat model moves.

**Forward-side "unchanged" regions — the same standard as the reverse side.**
Only the three lines `const base = …` / `const next = …` / `recordOnce(…)`
(`shared.js:172-175`) are replaced. Byte-for-byte **against the file**
(`sed -n '133,177p' src/adapters/shared.js` at `e7c845e`):

| Region | `e7c845e` anchor | Must stay |
|--------|------------------|-----------|
| `buildBlock` call and the read | `shared.js:134-140` | unchanged. |
| The absent-file branch | `shared.js:142-152` | unchanged **except** its `recordOnce` becomes `recordManagedBlock(manifest, mdPath, true, '', '\n', true)` — `inserted = true`. The written bytes stay `` `${block}\n` `` — the digest golden depends on it. |
| The `locateManagedBlock` call + splice-replace branch | `shared.js:154-169` | unchanged **except** its `recordOnce` becomes `recordManagedBlock(manifest, mdPath, false, null, null, false)` — **`inserted = false`**, because this branch writes no separators. The `next === current` → `out.unchanged.push` arm is untouched. |
| **`out.changed.push(mdPath);`** | `shared.js:176` | **unchanged — and this is the one an implementer drops**, because the round-1 draft of the append-branch snippet above omitted it. `sync` reports the file as changed via this line; without it the file is silently rewritten and reported as untouched. |
| The function close | `shared.js:177` | unchanged. |

**Reverse (`reverseManagedBlock` in manifest.js):**
```js
let before = content.slice(0, span.begin);
let after = content.slice(span.end);

// The manifest is UNTRUSTED (WP-144). Accept ONLY values the forward step can
// actually emit; anything else is treated exactly as a legacy entry. Table M.
let sepBefore = entry.sepBefore;
let sepAfter = entry.sepAfter;
if (!SEP_BEFORE_OK.has(sepBefore) || sepAfter !== '\n') {
  if (sepBefore !== undefined || sepAfter !== undefined) {
    process.stderr.write(
      `wienerdog: ignoring out-of-vocabulary separator metadata on ${entry.path} — ` +
      'stripping conservatively\n'
    );
  }
  sepBefore = '\n';
  sepAfter = '\n';
}

// Trailing terminator: the block's own line end is always Wienerdog's — remove it.
if (after.startsWith(sepAfter)) after = after.slice(sepAfter.length);
else if (after.startsWith('\n')) after = after.slice(1); // legacy fallback

// Leading separator: remove ONLY the exact bytes we added, and ONLY when doing so
// preserves a line boundary — otherwise we would fuse two user lines (the A13 bug).
if (sepBefore.length > 0 && before.endsWith(sepBefore)) {
  const candidate = before.slice(0, before.length - sepBefore.length);
  // The at-EOF disjunct is GATED on sepBefore === '\n\n' — i.e. on the forward
  // step having supplied the file's terminator itself. When sepBefore is '\n'
  // the file was already newline-terminated by the USER, so that newline is
  // theirs and survives even with nothing after the block.
  const weSuppliedTerminator = sepBefore === '\n\n';
  const safe =
    candidate === '' ||
    candidate.endsWith('\n') ||
    (weSuppliedTerminator && after === '') ||
    after.startsWith('\n');
  if (safe) before = candidate; // else: leave the user's newline intact (no fusion)
}
const remaining = before + after;
```

**The `weSuppliedTerminator` gate is load-bearing — do not simplify it back to a
bare `after === ''`.** That ungated form is what an earlier revision of this spec
specified, and it consumes the user's own trailing newline when the block has
been relocated to end-of-file. Table N below is the canonical case set; the gate
is the only difference between its two right-hand columns.

### Table M — the accepted separator vocabulary (canonical)

**`entry.sepBefore` and `entry.sepAfter` are read from
`~/.wienerdog/install-manifest.json`, which WP-144 established is UNTRUSTED
input** — a plaintext, user-editable, attacker-writable file. A `typeof … ===
'string'` check is **not** a validation: the values are then byte-matched against
the user's own file and the match is *deleted*. So the accepted set is an
allowlist of exactly what `applyManagedBlock` can emit, and nothing else.

| Field | Accepted values | Emitted by | Anything else |
|-------|-----------------|------------|---------------|
| `sepAfter` | **`'\n'`** and nothing else | every forward branch — the block's own line terminator is always one newline | treated as legacy |
| `sepBefore` | **`''`**, **`'\n'`**, **`'\n\n'`** | `''` createdFile branch; `'\n'` append onto newline-terminated content; `'\n\n'` append onto unterminated content | treated as legacy |

```js
const SEP_BEFORE_OK = new Set(['', '\n', '\n\n']);   // module-level, beside the sentinels
```

**Cross-field rule: the pair is validated together and rejected together.** If
either field is out of vocabulary, **both** are discarded and the entry is
reversed exactly as a legacy (absent-metadata) entry — `sepBefore = '\n'`,
`sepAfter = '\n'`, under the same `safe` guard — with one stderr notice.

**Disposition, recorded because it was a real choice:** the alternative was to
*skip* the entry with a notice. **Rejected.** Skipping leaves Wienerdog's own
managed block sitting in the user's `CLAUDE.md` forever with no path to removal,
and it hands an attacker a trivial way to make uninstall incomplete. The legacy
fallback is **provably bounded** — it can strip at most one newline on each side,
both already protected by the `safe` predicate — so it removes our block without
ever reaching user text. Invalid metadata is therefore treated as *absent*, which
also keeps the reverser at two modes rather than three.

**Executed at `e7c845e` — the two data-loss primitives, and the fix.** User file
`"lineA\n<BLOCK>\nlineB\n"`, want `"lineA\nlineB\n"`:

```text
                    UNBOUNDED (round-3 contract)    BOUNDED (this contract)
honest metadata     "lineA\nlineB\n"                "lineA\nlineB\n"
forged sepAfter     "lineA\n"           ← lineB     "lineA\nlineB\n"
forged sepBefore    "lineB\n"           ← lineA     "lineA\nlineB\n"
forged both         ""                  ← ALL       "lineA\nlineB\n"
```

`sepAfter: "\nlineB\n"` eats the trailing user line; `sepBefore: "lineA\n"` eats
the leading one — and note the `safe` predicate's `candidate === ''` disjunct
*assists* that second one, which is why bounding the input is the fix rather than
tightening the guard. Together they empty the file.

**This is not covered by `ENTRY_FIELD_TYPES`.** Adding `sepBefore`/`sepAfter`
there as `'string'` is harmless and still optional, but a forged value **is** a
string and passes. The allowlist above is the only thing that closes this, and it
lives in `reverseManagedBlock`.

**Declared threat model, and the residual after bounding.** In scope and closed:
any out-of-vocabulary value, which is every string that can reach past a newline.
**The residual is an *in-vocabulary* forgery** — swapping `sepBefore` between
`''`, `'\n'` and `'\n\n'`, or claiming `sepAfter: '\n'` when we wrote none. Its
worst case is bounded by **the vocabulary's longest value: two bytes, both
newlines**. It therefore cannot delete a character of user *text*, cannot cross a
line boundary into a user line, and cannot reach further than the strip the
legacy path already performs — the same one-newline-per-side envelope the `safe`
predicate governs. Measured: with the allowlist in place, all three forged
entries against `"lineA\n<BLOCK>\nlineB\n"` return `"lineA\nlineB\n"` — byte-identical
to the honest result. **Not closed, deliberately:** the manifest has no integrity
protection, which is a separate design.

#### Disposition — Codex round 4 [high], the in-vocabulary at-EOF case

Codex raised a **concrete instance** of exactly the residual above: on an honest
install whose recorded `sepBefore` is `'\n'`, editing the manifest to the
**in-vocabulary** `'\n\n'` makes the at-EOF disjunct fire (Table N's gate keys on
that value) and consumes the user's trailing newline. **Measured at `e7c845e`:**

```text
original user file   "foo\n"
after sync           "foo\n\n<BLOCK>\n"
honest  sepBefore="\n"    -> "foo\n"
FORGED  sepBefore="\n\n"  -> "foo"
delta = 1 byte | all whitespace? true | text preserved? true
```

**Disposition: NOT A REDESIGN — it lands inside the declared bound, and the bound
is now executable.** One newline. No text. No line boundary crossed. That is the
residual Table M already declares, and the point of declaring a bound is that
instances of it are dispositioned against the bound rather than re-opening the
design each time one is demonstrated. **T9 makes the bound testable** (see the
Test index), which is what turns a declared residual into a checked one.

**Explicitly declined: integrity-protecting the metadata.** Signing or HMAC-ing
manifest fields would close in-vocabulary forgery, and it is **out of scope by
declaration** — the manifest carries no integrity protection at all, and
`reverseCopiedSkill` lives with the *same* residual for the *same* reason: its
`hash` field is likewise read from the untrusted manifest, so an attacker who can
rewrite `sepBefore` can equally rewrite a recorded `hash`. Adding integrity to one
field while the file is otherwise unprotected buys nothing. That is a separate
design with its own review, not a fold-in here.

### Table N — the `safe` predicate, every REACHABLE case (canonical)

**Reachability first, because it bounds the table.** `locateManagedBlock`
(`manifest.js:57-76`) matches a line whose **`.trim()`** equals the sentinel and
sets `span.begin` to the **start of that line**. Therefore `before` is always
either `''` or newline-terminated — no other shape exists. Executed at `e7c845e`:

```text
content "foo<BLOCK>\n"    -> locateManagedBlock THROWS "ambiguous" (the begin
                             sentinel is not alone on its line) => reverseManagedBlock
                             SKIPS this file entirely
content "foo\n<BLOCK>\n"  -> before = "foo\n"   (reachable)
content "<BLOCK>\n"       -> before = ""        (reachable)
```

Every row below is a state the forward step can actually produce, with
`sepBefore` **derived from the forward contract** rather than asserted. All four
implementations run side by side: `today` is the shipped strip; `ungated` is
round-1's `after === ''`; `no-disjunct` removes it entirely; **`gated`** is the
contract above.

| # | Case | `sepBefore` | Want | today | ungated | **gated** |
|---|------|-------------|------|-------|---------|-----------|
| 1 | genuine append onto `foo\n` | `'\n'` | `"foo\n"` | `"foo\n"` ok | `"foo\n"` ok | `"foo\n"` **ok** |
| 2 | genuine append onto `foo` — block ends at EOF, **we** supplied the terminator | `'\n\n'` | `"foo"` | `"foo\n"` **XX lossy** | `"foo"` ok | `"foo"` **ok** |
| 3 | **relocated to EOF, original `foo\n`** | `'\n'` | `"foo\n"` | `"foo"` **XX** | `"foo"` **XX** | `"foo\n"` **ok** |
| 4 | relocated between two user lines | `'\n'` | `"lineA\nlineB\n"` | `"lineAlineB\n"` **XX fusion** | ok | **ok** |
| 5 | empty original | `'\n\n'` | `""` | `"\n"` **XX** | ok | **ok** |

```text
SCORE  today 1/5   ungated 4/5   gated 5/5
```

Rows 2, 4 and 5 are the bugs this WP exists to fix; **row 3 is the one the gate
adds**.

**Row 5 of the round-3 table was UNSATISFIABLE and has been removed.** It
described *"relocated to EOF, original `foo`"* — a file shaped
`foo<BLOCK>\n`, with the sentinel glued to the end of the user's unterminated
text. No such state is reachable: `locateManagedBlock` requires the sentinel to
be alone on its line, so that content **throws `ambiguous` and the file is
skipped entirely**, and its published cells silently blended two different
constructions. Gate round 3 found it by implementing every predicate variant and
brute-forcing the `(before, after)` space. **The gate itself was verified
correct; this was an evidence-table defect.** The construction it was reaching
for is row 2, so the two are merged.

#### T6 — the discrimination pair is row 3 vs row 2

Both rows reach `after === ''`. They differ **only** in `sepBefore`, which is
exactly the bit the gate consults, so together they pin the gate from both sides:

```text
                          want       gated      ungated    no-disjunct
row 3  sepBefore="\n"     "foo\n"    "foo\n"    "foo"      "foo\n"
row 2  sepBefore="\n\n"   "foo"      "foo"      "foo"      "foo\n\n"

=> ungated (disjunct always ON)   fails row 3
   no-disjunct (disjunct removed) fails row 2
   only the GATED form satisfies both
```

**T6 must assert both rows.** Either alone is passed by a wrong implementation:
row 3 alone is satisfied by deleting the disjunct, row 2 alone by leaving it
ungated. This is what "proves the gate discriminates rather than disabling the
disjunct" means, stated as the two-sided measurement rather than as a claim.

#### The one shipped assertion this WP FLIPS — `claude-adapter.test.js:342-361`

**Implementing the forward and reverse contracts TOGETHER flips exactly one
shipped test, and you must update it.** It is
`a user-relocated mid-file block uninstalls to exactly one blank line`
(`tests/unit/claude-adapter.test.js:342`).

| Implementation | Result of that test |
|----------------|---------------------|
| reverse side only | **24/24** — passes |
| **full forward + reverse pair (what this WP ships)** | **23/24** — this one fails |

**Measured**, with the adapter's `createdFile` branch recording `sepBefore: ''`
per this WP's forward contract:

```text
shipped expectation   = "# Above\n\n# Below\ntail\n"
reverse-only          = "# Above\n\n# Below\ntail\n"    PASSES
FULL forward+reverse  = "# Above\n\n\n# Below\ntail\n"  *** FLIPS ***
```

**Change the expected literal to `'# Above\n\n\n# Below\ntail\n'`** and update the
assertion message. **The new behaviour is correct by this WP's own thesis:** the
adapter created the file, so the forward step recorded **`sepBefore: ''`** — *we
added nothing on the leading side* — so the leading strip must not run, and
**both of the user's blank lines survive**. The shipped expectation encodes the
old fixed-one-newline heuristic, which is **the A13 defect this WP exists to
remove**.

**Three readings are available when you hit this red test, and two are wrong:**

1. ~~Collapse the blank lines in the reverser~~ — **re-introduces user-byte
   consumption**, i.e. re-creates A13. CLAUDE.md's *"choose the simpler option"*
   tiebreak points here, which is exactly why this section exists.
2. ~~Record `sepBefore: '\n'` on the createdFile branch~~ — **false**: that branch
   writes `block + '\n'` and inserts **no** leading separator. Recording one would
   claim we wrote bytes we did not.
3. **Update the assertion.** The behaviour changed on purpose; the test encodes
   the pre-fix heuristic.

**This is spec text only** — `tests/unit/claude-adapter.test.js` is already in the
Deliverables table.

#### T10 — delete-and-reinsert, both directions (the per-branch rule)

Each case is one full lifecycle: **sync → hand-delete the block → sync →
uninstall**. The hand-delete step writes the file directly; it must **not** go
through `applyManagedBlock`.

| # | Original | File after the hand-delete | Recorded `sepBefore` after the 2nd sync | Uninstall must yield |
|---|----------|----------------------------|------------------------------------------|----------------------|
| (a) | `"foo"` | `"foo\n"` | **`'\n'`** (updated) | **`"foo\n"`** |
| (b) | `"foo\n"` | `"foo"` | **`'\n\n'`** (updated) | **`"foo"`** |

**Assert the recorded `sepBefore` as well as the final bytes.** The end-state
assertion alone tells you *that* something is wrong; the manifest assertion tells
you *which* rule fired, and it is the one that fails loudly the moment someone
reinstates first-insertion-wins.

**Red-first:** under first-insertion-wins (a) yields `"foo"` and (b) yields
`"foo\n"` — measured.

#### T9 — the in-vocabulary at-EOF forgery (makes Table M's bound executable)

Same file, same install, **two entries**, one assertion each:

| Case | Manifest entry | Expected result |
|------|----------------|-----------------|
| control (honest) | `sepBefore: '\n'`, `sepAfter: '\n'` | `"foo\n"` |
| **forged, in-vocabulary** | `sepBefore: '\n\n'`, `sepAfter: '\n'` | **`"foo"`** |

Set up by syncing an original `"foo\n"` (the forward step records `'\n'`), then
hand-editing the manifest entry to `'\n\n'` — **no on-disk content changes**. The
forged row must lose **exactly the trailing newline and nothing else**; assert the
*text* is byte-identical to the control with newlines removed, so the test fails
if the loss ever widens beyond whitespace. **This is not a red-first test** — it
pins a *declared residual* at its declared size, which is the only way a bound
stops being a claim.

**Legacy entries are unaffected in the direction that matters.** A pre-WP entry
has no `sepBefore`, so the default `'\n'` applies and `weSuppliedTerminator` is
`false` — the tighter branch. For a legacy genuine append the file is
`foo\n\n<BLOCK>\n` whichever way the original ended (the old forward code
`replace(/\n+$/, '')`-ed the tail), so `candidate` is `foo\n`, disjunct 2 fires,
and the strip happens exactly as before. The gate can only ever *withhold* a
strip, never authorise a new one, so it cannot introduce fusion or deletion.

**Everything else in `reverseManagedBlock` is unchanged, and "unchanged" here
means BYTE-FOR-BYTE AGAINST THE FILE — `sed -n '182,224p' src/core/manifest.js`
at `e7c845e` — not against this spec's excerpts, and not "reconstruct something
equivalent".** The excerpts in Current state are dedented and carry `// ← …`
annotations that are **not** in the file; they show shape, the file is the
authority. Named explicitly, because a stale quote in an earlier revision of this
spec would have led an implementer to rewrite one of these regions incorrectly:

| Region | `e7c845e` anchor | Must stay |
|--------|------------------|-----------|
| The signature | `manifest.js:182` | `reverseManagedBlock(entry, dryRun, removed, skipped, removedSet, fd, target)` — do **not** drop `fd`/`target` or re-derive them inside the function. |
| The read | `manifest.js:183-189` | `fs.readFileSync(fd, 'utf8')` inside its `try`. Never re-open by pathname. |
| The ambiguity `try/catch` | `manifest.js:190-199` | unchanged. |
| The `span === null` skip | `manifest.js:200-204` | unchanged. |
| The `createdFile` delete | `manifest.js:215-217` | `fs.rmSync(target, { force: true })` — the pathname delete, using `target`, **not** `entry.path`. |
| The write | `manifest.js:218-222` | the **fd-bound** `Buffer.from(remaining)` + `fs.ftruncateSync(fd, 0)` + `fs.writeSync(fd, buf, 0, buf.length, 0)`. **Never `fs.writeFileSync(entry.path, remaining)`** — that is the pre-F30 shape, and restoring it silently regresses WP-144's delete-time binding (a swap-to-symlink between read and write would escape the `O_NOFOLLOW` check the caller already paid for). |
| The tail push | `manifest.js:223` | `removed.push(entry.path)`. |

Only the ten-or-so lines between `const before = …` and `const remaining = …`
change. If your diff of `manifest.js` touches anything in the table above, it is
out of scope for this WP.

**Owner walkthrough (2026-07-18): Ready.** The owner ratified the two-part fix —
record the exact inserted separator bytes (`sepBefore`/`sepAfter`) as origin
metadata AND an anti-fusion safety guard that refuses any leading-separator strip
which would erase a user line boundary — plus the legacy `'\n'` fallback (old
manifests get the same guard, so they stop fusing too) and the non-lossy forward
insert. The safety guard is the load-bearing correctness property (it prevents
corruption even without recorded metadata); the metadata adds byte-perfect
precision. Depends on WP-145 (manifest.js) and WP-146 (shared.js).

**Why this is correct (worked cases the tests must cover):**
- Genuine append, `current='foo\n'` → file `foo\n\nblock\n`, `sepBefore='\n'`.
  Reverse: `after` loses `\n`; `before='foo\n\n'` ends with `\n`, candidate=`foo\n`
  ends with `\n` → strip → `foo\n`. **Byte-perfect.**
- Genuine append, `current='foo'` (no newline) → `foo\n\nblock\n`,
  `sepBefore='\n\n'`. Reverse: candidate=`foo`, `after===''` → safe → `foo`.
  **Byte-perfect.**
- **Relocated block** `lineA\nBLOCK\nlineB\n` (user moved it; `sepBefore` recorded
  as `'\n'` from the original append). Reverse: `after='\nlineB\n'` loses one `\n`
  → `lineB\n`; `before='lineA\n'` ends with `\n`, candidate=`lineA` NOT
  ending in `\n` and `after` (now `lineB\n`) does not start with `\n` and is
  non-empty → **NOT safe → keep** `lineA\n`. Result `lineA\nlineB\n`. **No fusion.**
- Legacy entry (no `sepBefore`/`sepAfter`, pre-WP manifest): defaults `'\n'` apply
  with the SAME safety guard, so an old genuine append still restores and an old
  relocated block no longer fuses.
- createdFile: `block\n` → both strips empty the file → `remaining.trim()===''` →
  file deleted.

- **Block relocated to EOF**, original `foo\n`, `sepBefore='\n'`: `after` is `''`
  but `weSuppliedTerminator` is `false`, so the at-EOF disjunct does **not** fire;
  candidate `foo` fails the other three → **NOT safe → keep** `foo\n`. Result
  `foo\n`. **Byte-perfect** (Table N row 3).

### The EOF edge — Codex round 2 found it, and the finding is ADOPTED

An earlier revision of this spec documented the at-EOF case as **accepted known
behaviour**: with the ungated `after === ''` disjunct, a block relocated to
end-of-file consumed the user's trailing newline (`"foo\n"` → `"foo"`). The
argument was that today's shipped code does the same, so it is not a regression,
and that the disjunct is load-bearing for the no-trailing-newline case. A
wd-reviewer measured that table and approved the acceptance.

**Codex's round-2 finding rejected the acceptance, and it is right.** Its
argument is specific and this spec had no answer to it: **this WP is the very
change that ships `sepBefore`**, and `sepBefore` is exactly the bit that
distinguishes *"the file was already newline-terminated by the user"* (`'\n'`)
from *"we supplied the terminator ourselves"* (`'\n\n'`). Shipping the metadata
that resolves the ambiguity and then declining to consult it is not an accepted
cost; it is an unfinished fix. The old third justification —
*"the disjunct cannot be dropped"* — was answering the wrong question: nobody
needed it dropped, only **gated**.

**What changed:** the at-EOF disjunct is now `weSuppliedTerminator && after === ''`
(Exact contracts). **Measured effect: round-1 scored 5/6 on Table N, the gated
predicate scores 6/6**, and the case it adds is precisely the one the acceptance
was documenting. The gate can only withhold a strip, never authorise one, so it
introduces no fusion and no deletion risk (Table N's note).

**Consequences elsewhere in this spec**, all applied: Table N is new and
canonical; the "Why this is correct" list gains the relocated-to-EOF row; **T6**
is a new test row; **AC7** is a new acceptance criterion; and this is no longer
listed under "Out of scope".

## Implementation notes & constraints

- Zero new dependencies; plain Node ≥ 18, JSDoc types only (CLAUDE.md).
- `locateManagedBlock` (both copies) is NOT changed.
- The digest golden output must stay byte-identical for the normal create case:
  `buildBlock` is untouched; only the append separator handling changes, and the
  common path (absent file → `block\n`) is unchanged.
- `sepBefore`/`sepAfter` are additive optional keys on the `managed-block` entry;
  they must not break WP-144's schema (extras are ignored). Optionally add them to
  the managed-block known-optional key list in the WP-144 validator — additive
  only, no rejection.
- **Do not touch the fd-bound IO.** Every region in the Exact-contracts
  "unchanged" table stays byte-for-byte. In particular `manifest.js:218-222` is
  the WP-144 F30 delete-time binding, and the single most likely way to break
  this WP is to "tidy" it back into `fs.writeFileSync(entry.path, remaining)`.
  V2 exists to catch exactly that.
- When uncertain, choose the simpler option and record it under "Decisions made".

## Security checklist

- [ ] Uninstall never strips a newline that is a boundary between two user lines
      (the `safe` predicate), so a relocated block can never fuse user content.
- [ ] Only the exact recorded separator bytes (or the legacy `'\n'` default,
      under the same guard) are removed; nothing before them is touched.
- [ ] **Uninstall never consumes a newline the USER supplied.** The at-EOF
      disjunct fires only when `sepBefore === '\n\n'`, i.e. only when the forward
      step supplied the file's terminator itself (Table N, rows 3 vs 2).
- [ ] **The separator metadata is treated as UNTRUSTED INPUT, not as a string.**
      `sepAfter` is accepted only as `'\n'` and `sepBefore` only from
      `{'', '\n', '\n\n'}` (Table M); the pair is validated together and
      discarded together. **A `typeof … === 'string'` check is not sufficient** —
      the value is byte-matched against the user's own file and the match is
      deleted, so an unbounded string is a direct data-deletion primitive
      (measured: a forged pair empties the file).
- [ ] **Invalid metadata degrades to the legacy conservative strip, never to a
      wider one**, so the worst case is one newline on each side under the same
      `safe` guard — bounded by construction, and it still removes our block.
- [ ] A re-sync does not overwrite the sep metadata captured at first insertion.

## Acceptance criteria

- [ ] Round-trip on a file whose original content ends in one `\n` restores it
      **byte-identically** after sync→uninstall.
- [ ] Round-trip on a file with no trailing newline restores it byte-identically.
- [ ] A block manually relocated to sit between two single-newline user lines
      uninstalls to `lineA\nlineB\n` (no fusion), NOT `lineAlineB\n`.
- [ ] A createdFile managed block uninstalls by deleting the file.
- [ ] **AC9 (sticky `createdFile`, T8).** A file Wienerdog created is still
      **deleted** by uninstall after **two or more** intervening `sync` runs, not
      truncated to empty. **Red-first** against a plain-overwrite upsert, where the
      replace branch's `createdFile: false` wins on the first re-sync.
- [ ] **AC11 (new — delete-and-reinsert, T10, BOTH directions).** A user who
      deletes the managed block by hand and leaves the file in a *different*
      termination state still round-trips byte-perfectly through the next
      sync → uninstall:
      **(a)** sync `"foo"` → hand-delete the block leaving `"foo\n"` → sync →
      uninstall → **`"foo\n"`** (the user's newline survives);
      **(b)** sync `"foo\n"` → hand-delete leaving `"foo"` → sync → uninstall →
      **`"foo"`** (no extra newline appears).
      **Red-first against first-insertion-wins**, where (a) yields `"foo"` and
      (b) yields `"foo\n"`. The shipped tests do **not** cover this — they
      exercise only the sentinel-replacement re-sync, where the two rules agree.
- [ ] **AC10 (the declared bound is EXECUTABLE, T9).** On an honest install
      of original `"foo\n"`, a manifest hand-edited to the **in-vocabulary**
      `sepBefore: '\n\n'` uninstalls to **exactly `"foo"`** — i.e. the loss is
      **one newline and nothing else**: no user text is removed, and the honest
      control (`sepBefore: '\n'`) still yields `"foo\n"`. This asserts Table M's
      residual **is** the bound, rather than leaving it a claim.
- [ ] A legacy `managed-block` entry (no `sepBefore`/`sepAfter`) still restores a
      genuine append and no longer fuses a relocated block.
- [ ] **AC7 (Table N, the discrimination pair).** **Row 3** — a block relocated
      to end of file on an originally newline-terminated install
      (`sepBefore === '\n'`) uninstalls to `"foo\n"`, **not** `"foo"`. **Row 2** —
      a genuine append onto an unterminated file (`sepBefore === '\n\n'`, block
      also at EOF) still uninstalls to `"foo"`. **Both are required and both are
      T6**: row 3 alone is satisfied by deleting the disjunct, row 2 alone by
      leaving it ungated.
- [ ] **AC8 (new — Table M, forged metadata).** With the user file
      `"lineA\n<BLOCK>\nlineB\n"`, a manifest entry carrying
      `sepAfter: "\nlineB\n"`, or `sepBefore: "lineA\n"`, or both, uninstalls to
      `"lineA\nlineB\n"` — **every byte of user text survives** — and the block is
      still removed. Assert the stderr notice fires. **Prove it red-first**
      against the unbounded contract, where the same three entries yield
      `"lineA\n"`, `"lineB\n"` and `""`.
- [ ] **AC12 (new — the BOTH-SIDES run).** With the **forward and reverse
      contracts both implemented**, `tests/unit/claude-adapter.test.js` is
      **24/24** — after updating the one assertion at `:342-361` named above.
      **Red baseline: 23/24** with that assertion left as shipped. Paste both
      runs. **This is the only configuration that exercises what this WP actually
      ships**, and no verification pass before gate round 8 ran it.
- [ ] `npm test` and `npm run lint` are green (digest golden unchanged).

## Verification steps (run these; paste output in the PR)

```bash
# V1 — the two suites this WP touches. Never a bare `node --test`; tests/run.js
# sets the scheduler guard the whole suite depends on.
node tests/run.js tests/unit/claude-adapter.test.js tests/unit/manifest.test.js

# V1b (AC12) — THE BOTH-SIDES RUN. Run the SHIPPED adapter suite with the FORWARD
# AND REVERSE contracts BOTH implemented. This is the only configuration that
# exercises what this WP ships, and it is the step seven rounds of review did not
# take: every earlier pass verified one side at a time, which is why the flipped
# assertion at :342 stayed latent from round 1.
#   BEFORE updating the :342 assertion -> 23/24 (that one test red)
#   AFTER  updating it                 -> 24/24
# Paste BOTH runs; a single 24/24 does not show you found the flip.
node tests/run.js tests/unit/claude-adapter.test.js

# V2 — the F30 tail was NOT regressed (Exact contracts table). This gate FAILS
# LOUDLY: `grep -q` on the pre-F30 shape exits the script non-zero. Note NO `-n`
# — the extracted body's line numbers SHIFT when this WP grows the strip region,
# so a numbered expected-output paste would be stale by construction.
BODY=$(sed -n '/^function reverseManagedBlock/,/^}/p' src/core/manifest.js)
printf '%s\n' "$BODY" | grep -E "ftruncateSync|fs\.writeSync|rmSync"
# Assert each fd-bound line is PRESENT (-F: fixed string, no regex surprises).
# Asserting presence — not merely the absence of one bad spelling — is what
# closes the hole a reviewer found in the earlier form: a path-based re-open
# spelled `fs.openSync(entry.path,'w')` + `fs.writevSync(...)` contains no
# `writeFileSync` and would have passed green.
for L in "fs.ftruncateSync(fd, 0);" "fs.writeSync(fd, buf, 0, buf.length, 0);" \
         "fs.rmSync(target, { force: true });"; do
  printf '%s\n' "$BODY" | grep -qF "$L" || {
    echo "REGRESSED: missing fd-bound line: $L"; exit 1; }
done
printf '%s\n' "$BODY" | grep -q "fs\.writeFileSync" && {
  echo "REGRESSED: pre-F30 path-based write restored in reverseManagedBlock"; exit 1; }
echo "V2 ok — fd-bound write intact, no writeFileSync in the body"

# V3 — the signature still carries fd + target. Also FAILS LOUDLY.
grep -q "^function reverseManagedBlock(entry, dryRun, removed, skipped, removedSet, fd, target) {" \
  src/core/manifest.js || {
  echo "REGRESSED: reverseManagedBlock signature changed (fd/target dropped)"; exit 1; }
echo "V3 ok — signature intact"

# V4 (Table M) — the separator vocabulary is an ALLOWLIST, not a typeof check.
# Presence is asserted on DISTINCTIVE LITERALS with grep -qF, the V2 idiom: a
# bare `grep -q "SEP_BEFORE_OK"` is satisfiable by a COMMENT mentioning the name,
# which is the soft-guard shape gate rounds 2, 4 and 7 each found once.
MBODY=$(sed -n '/^function reverseManagedBlock/,/^}/p' src/core/manifest.js)
for L in "SEP_BEFORE_OK.has(sepBefore)" "sepAfter !== '\\n'"; do
  printf '%s\n' "$MBODY" | grep -qF "$L" || {
    echo "REGRESSED: Table M vocabulary check missing from reverseManagedBlock: $L"; exit 1; }
done
grep -qF "const SEP_BEFORE_OK = new Set(['', '\\n', '\\n\\n']);" src/core/manifest.js || {
  echo 'REGRESSED: SEP_BEFORE_OK allowlist literal missing or widened'; exit 1; }
printf '%s\n' "$MBODY" | grep -q "typeof entry.sep" && {
  echo 'REGRESSED: separator metadata still accepted on a bare typeof check'; exit 1; }
echo "V4 ok — separator vocabulary is bounded"

# V5 (per-branch separator rule) — same idiom. Assert the OPERATIVE lines of the
# helper, not the word `inserted`, which a comment satisfies.
RBODY=$(sed -n '/^function recordManagedBlock/,/^}/p' src/adapters/shared.js)
for L in "if (inserted) {" "entry.sepBefore = sepBefore;" "entry.sepAfter = sepAfter;"; do
  printf '%s\n' "$RBODY" | grep -qF "$L" || {
    echo "REGRESSED: recordManagedBlock lost its per-branch update: $L"; exit 1; }
done
grep -qF "recordManagedBlock(manifest, mdPath, false, null, null, false)" src/adapters/shared.js || {
  echo 'REGRESSED: the replace branch no longer passes inserted=false'; exit 1; }
printf '%s\n' "$RBODY" | grep -q "typeof entry.sepBefore !== 'string'" && {
  echo 'REGRESSED: first-insertion-wins reinstated — delete-and-reinsert will corrupt'; exit 1; }
echo "V5 ok — separator update rule is per-branch"

# V6 — full gates.
npm test
npm run lint
```

**Expected V2 output — content only, no line numbers**, because the strip region
this WP rewrites grows from 9 to ~17 lines and every number in an extracted body
shifts with it:

```text
    if (!dryRun) fs.rmSync(target, { force: true });
    fs.ftruncateSync(fd, 0);
    fs.writeSync(fd, buf, 0, buf.length, 0);
V2 ok — fd-bound write intact, no writeFileSync in the body
```

**Expected V3 output:** `V3 ok — signature intact`.

**V4's baseline at `e7c845e`:** both greps miss (`SEP_BEFORE_OK` exit 1,
`typeof entry.sep` exit 1) — neither field exists yet, so V4's *first* grep is a
genuine progress gate (must print after the work) while its second is an
**absence check** that must keep missing. The failure mode it guards is an
implementer writing the vulnerable
`typeof entry.sepBefore === 'string' ? … : '\n'` shape, which was this spec's own
contract until gate round 3.

**V5's baseline at `e7c845e`:** both greps also miss (exit 1) — `shared.js` has
no `recordManagedBlock` yet. Its **first** grep is a progress gate (the
`inserted` flag must exist after the work); its **second** is an **absence
check** that must keep missing, guarding against an implementer reinstating the
first-insertion-wins shape this spec itself specified until gate round 6.

**Both were proved in BOTH directions** (`docs/runbooks/codex-review.md`) on the
untouched tree at `e7c845e`:

- **Green as-is** — they are *regression guards*, not progress gates, so passing
  before the work is correct. The progress gates are V1's new round-trip cases.
- **Red when regressed** — gate round 1's reviewer injected the exact pre-F30
  body (`else if (!dryRun) fs.writeFileSync(entry.path, remaining);`) and the
  earlier form of V2 **still exited 0**, because it only *printed* matches and
  never tested for the bad one. The `grep -q … && { …; exit 1; }` shape above is
  the fix, and it was re-proved on a scratch copy of `manifest.js` carrying that
  same injection **plus** the signature reverted to five parameters:

  ```text
  --- V2 ---
      if (!dryRun) fs.rmSync(entry.path, { force: true });
  REGRESSED: pre-F30 path-based write restored in reverseManagedBlock
  exit=1

  --- V3 (run standalone against the same copy) ---
  REGRESSED: reverseManagedBlock signature changed (fd/target dropped)
  exit=1
  ```

  `writeFileSync` does not collide with the `fs\.writeSync` alternation, because
  that alternative is anchored on the `fs.` prefix and the offending call is
  `fs.writeFileSync`.

- **Red against an evasion that carries no `writeFileSync` at all** — the round-2
  advisory. A path-based re-open spelled `fs.openSync(entry.path, 'w')` +
  `fs.writevSync(...)` regresses the delete-time binding just as thoroughly while
  containing none of the strings the absence check looks for. Measured on a
  scratch copy carrying exactly that body:

  ```text
  # round-2 V2 (absence check only)
  V2 ok — fd-bound write intact, no writeFileSync in the body      exit=0   ← THE HOLE

  # round-3 V2 (per-line `grep -qF` presence assertions)
  REGRESSED: missing fd-bound line: fs.ftruncateSync(fd, 0);       exit=1   ← closed
  ```

  and still `exit=0` on the clean tree. **Asserting presence, not just the
  absence of one known-bad spelling, is what makes this gate general.**

**Why `grep -q … && { …; exit 1; }` is safe under `set -e`**: the left operand of
`&&` is errexit-exempt, so a *non*-matching `grep -q` (the good case) does not
abort the script — it simply skips the block. Measured, not assumed.

## Out of scope (do NOT do these)

- Changing `locateManagedBlock`, `buildBlock`, or the sentinel strings.
- The settings-upsert / foreign-symlink fixes — **WP-146** (dependency).
- Any other manifest reverser — those are WP-144 / WP-145.
- **Any change to `reverseManagedBlock`'s fd-bound IO, its signature, or its
  `target`-based delete** (the Exact-contracts "unchanged" table). Those are
  WP-144 F30's, they shipped, and V2/V3 are the guards.
- `reverseSettingsEntry`, which took the same `(…, fd, target)` signature change
  in the same F30 pass. Untouched here.
- ~~The block-at-EOF trailing-newline edge~~ — **no longer out of scope.** It was
  listed here as accepted known behaviour until gate round 2; Codex's finding was
  adopted and it is now **fixed** by the `weSuppliedTerminator` gate (Table N
  row 3, AC7, T6). Struck rather than deleted so the reversal is visible.
- **`ENTRY_FIELD_TYPES.symlink`** (`manifest.js:809`). This WP's own
  `managed-block` addition to that object is *optional*; the `symlink` cell
  belongs to **WP-153**, which `depends_on` this WP and lands after it. Do not
  touch it.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body — V2 and
   V3 included, since they are the proof the F30 tail survived.
2. Branch `wp/147-managed-block-separator-roundtrip`; conventional commits;
   PR titled `fix(uninstall): remove only Wienerdog-added managed-block separators, never fuse user lines (WP-147)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.

> **Provenance.** Audit A13 (managed-block separators). Owner walkthrough
> 2026-07-18 ratified the two-part fix; spec reached `Ready` at `3695f4f`.
>
> **2026-08-01 — architect re-verification pass, tested SHA `e7c845e`.** Every
> executable Current-state claim was re-run first-hand against the working tree
> at `e7c845e`, and both bugs were reproduced live end-to-end through
> `applyManagedBlock` → `manifest.reverse()`. Result: **one stale claim**, the
> reverse-side tail quote, which had gone stale under WP-144's F30 pass
> (`a4415a5`, 2026-07-20) *after* this spec reached `Ready` — and which, combined
> with the old "the rest is unchanged" wording, would have led an implementer to
> regress the fd-bound delete-time binding. Corrected in Current state (the
> `e7c845e` snippets and the new signature), hardened in Exact contracts (the
> byte-for-byte "unchanged" table), and made executable as verification steps V2
> and V3. One non-code correction: the Deliverables comment listed the retired
> `docs/specs/ROADMAP.md`. **Status stays `Ready`** — the design is unaffected;
> only the snapshot of the code it lands on had drifted.
>
> **2026-08-01 — gate round 1 corrections (verdict: REQUEST CHANGES).** The
> reviewer implemented this spec's Exact contracts verbatim and reports all five
> acceptance criteria and the whole security checklist pass, including the
> relocated-block no-fusion case. Five defects were found in the *spec*, not the
> design:
>
> - **(a) WP-147 × WP-153 collision, no dependency edge.** Both were `Ready` on
>   this branch and both edit `src/core/manifest.js` — this WP's optional
>   `ENTRY_FIELD_TYPES` addition against WP-153's required `symlink` cell, and
>   WP-153's `:718-729` anchors sit directly above the `:730-770` caller block
>   this spec pins. Resolved by **`WP-153 depends_on WP-147`**: this WP lands
>   first (it is the more delicate F30 region and its anchors are the costlier
>   ones to re-derive), the `symlink` cell is WP-153's edit alone, and WP-153
>   carries the note that its `manifest.js` anchors are stated pre-WP-147.
> - **(b) V2's pasted expected output was stale by construction.** It used
>   `grep -n` over an *extracted* function body, and this WP grows the strip
>   region 9 → ~17 lines, shifting those numbers. `-n` dropped; the paste is
>   content-only.
> - **(b) V2 could not fail.** The reviewer injected the exact pre-F30
>   regression and V2 still exited 0 — it printed matches without testing for the
>   bad one. Both V2 and V3 now carry `grep -q … && { …; exit 1; }` failure
>   modes, **re-proved in both directions** on a scratch copy carrying the
>   injection (output pasted under Verification steps).
> - **(b) The "BYTE-FOR-BYTE" standard pointed at this spec's own quotes**, which
>   are dedented and annotated. Retargeted at the file
>   (`sed -n '182,224p' src/core/manifest.js`), with the excerpts labelled.
> - **(b) One unspecified edge**: a block relocated to EOF loses the file's
>   trailing newline (`"foo\n"` → `"foo"`). Now recorded as accepted known
>   behaviour — **identical under today's code and the proposed predicate**
>   (executed, four cases side by side), not fusion, and the `after === ''`
>   disjunct that causes it is load-bearing for the no-trailing-newline case, so
>   it cannot be dropped. Fenced in Out of scope so nobody writes a failing test
>   for it.
> - **(adv, taken)** The forward-side contract had no "unchanged" table and its
>   snippet silently dropped `out.changed.push(mdPath);` (`shared.js:176`). Both
>   fixed.
>
> **Watch item carried forward** (reviewer's note): three of the five findings
> land on the **F30 IO contract family** in a single round. If gate round 2
> repeats on that family, apply ADR-0031's loop circuit-breaker — extract the F30
> fd-bound-IO contract to its canonical owner (WP-144 / ADR-0028) and reference it
> by name from here instead of restating it.
>
> **2026-08-01 — gate round 2 (verdict: APPROVE, one advisory + one Codex
> finding). Both taken.**
>
> - **Codex round 2 [medium] — the EOF acceptance is ADOPTED as a fix, not
>   dispositioned.** Its argument was one this spec had no answer to: **this WP
>   ships the `sepBefore` metadata that distinguishes the two cases**, so
>   declining to consult it was an unfinished fix rather than an accepted cost.
>   The round-1 justification *"the disjunct cannot be dropped"* answered the
>   wrong question — nobody needed it dropped, only **gated**. The at-EOF disjunct
>   is now `weSuppliedTerminator && after === ''`. **Measured: 5/6 → 6/6 on the
>   new canonical Table N**, with the added row being exactly the one the
>   acceptance documented. New AC7, new T6 (rows 3 **and** 5 as a matched pair, so
>   the gate is proved to discriminate rather than to disable), and the item is
>   struck from Out of scope. The wd-reviewer had approved the documented
>   acceptance; approving a documented cost is not the same as preferring it to a
>   fix that removes the cost.
> - **(adv, taken) V2 was one-literal-wide.** It only asserted the *absence* of
>   `fs.writeFileSync`, so a path-based re-open spelled
>   `fs.openSync(entry.path,'w')` + `fs.writevSync(...)` regressed the delete-time
>   binding and passed **green** — measured. V2 now also asserts the **presence**
>   of the three fd-bound lines via per-line `grep -qF`, verified red on that
>   evasion copy and green on the clean tree. The reviewer did not block on this;
>   it is taken because the hole is the same class the gate exists to close.
>
> **Routed, NOT done on this branch:** extract the F30 fd-bound-IO contract to its
> canonical owner (WP-144 / ADR-0028) with a **single canonical guard**, and have
> this spec and any sibling reference it by name — the ADR-0031 circuit-breaker
> the watch item above anticipates. Candidate slug `WP-f30-io-contract-extraction`.
> It is a cross-spec refactor and does not belong in a round-3 fix pass.
>
> **2026-08-01 — gate round 3 (verdict: REQUEST CHANGES, one blocking + one
> Codex finding). Both closed.**
>
> - **(a) Table N row 5 was UNSATISFIABLE.** The reviewer implemented every
>   predicate variant and brute-forced the `(before, after)` space: the published
>   row blended two constructions and **no reachable state satisfied all three of
>   its cells**. The root cause is a reachability fact the table never stated —
>   `locateManagedBlock` is **line-anchored** (it matches a line whose `.trim()`
>   is the sentinel and sets `span.begin` to that line's start), so `before` is
>   always `''` or newline-terminated. Re-derived first-hand, the old row 5's
>   content (`foo<BLOCK>\n`) is worse than unreachable: it makes
>   `locateManagedBlock` **throw `ambiguous`**, so `reverseManagedBlock` skips the
>   file entirely. **The gate itself was verified correct — this was an
>   evidence-table defect.** Fixed as the reviewer proposed: the construction row 5
>   was reaching for *is* row 2, so they are merged; the table is rebuilt from
>   reachable states only with `sepBefore` **derived from the forward contract**;
>   the reachability rule is now stated above it; and the score line is re-run and
>   re-pasted — **today 1/5, ungated 4/5, gated 5/5**. T6's discrimination pair
>   becomes **row 3 vs row 2**, with a measured four-column table showing that
>   *ungated* fails row 3 and *no-disjunct* fails row 2, so both rows are required.
> - **(a) Codex round 3 [high] — forged separator metadata is a data-deletion
>   primitive.** `sepBefore`/`sepAfter` are read from the **untrusted** install
>   manifest (WP-144's premise) behind only a `typeof === 'string'` check, then
>   byte-matched against the user's own file and the match **deleted**. Measured:
>   `sepAfter: "\nlineB\n"` eats the trailing user line, `sepBefore: "lineA\n"`
>   eats the leading one — assisted by the `safe` predicate's own
>   `candidate === ''` disjunct — and both together **empty the file**. Closed by
>   **Table M**: an allowlist of exactly the producer-emittable values
>   (`sepAfter === '\n'`; `sepBefore ∈ {'', '\n', '\n\n'}`), validated as a **pair**
>   and discarded as a pair. **Design call recorded:** invalid metadata degrades to
>   the *legacy conservative strip*, not to a skip — skipping would strand our own
>   managed block in the user's file forever and hand an attacker a one-line way to
>   make uninstall incomplete, while the legacy path is provably bounded to one
>   newline per side under the `safe` guard. New AC8, new T7 rows, new V4;
>   noted explicitly that `ENTRY_FIELD_TYPES` cannot close this, because a forged
>   value *is* a string.
>
> **2026-08-02 — gate round 4 (verdict: APPROVE, dispatch-ready; two reviewer
> carries + one Codex finding). All three closed.**
>
> - **Codex [medium] — `createdFile` stickiness was self-contradictory.** The
>   helper cell said both *"set `createdFile`"* and *"always keeps
>   `createdFile`"*. A straightforward upsert resolves that the wrong way: the
>   **replace** branch passes `false` on every re-sync, so the first re-sync after
>   a create flips `true → false`, and uninstall then **truncates the file instead
>   of deleting it** — leaving behind an empty `CLAUDE.md` we created. Fixed by
>   specifying the helper against **`recordSettingsEntry` (`shared.js:90-98`)**
>   rather than `recordCopiedSkill`: it is the in-tree helper that already solves
>   exactly this, and `shared.js:95`'s
>   `existing.createdFile === true ? true : createdFile` is copied verbatim, with
>   `shared.js:83-87`'s own safety argument (sticky-true is safe because the
>   reverser still requires `remaining.trim() === ''`). A table now states the
>   **two fields follow different rules** — `createdFile` sticky-true,
>   `sepBefore`/`sepAfter` first-insertion-wins — since conflating them was the
>   defect. New **T8** (create → ≥2 syncs → uninstall asserts the file is
>   **removed**) and **AC9**, red against a plain-overwrite upsert.
> - **(b) V4's first grep was an unenforced progress gate** — it printed a match
>   but never failed without one, so a missing allowlist would have passed green.
>   Now `grep -q … || { echo "REGRESSED: …"; exit 1; }`, matching V2's standard;
>   both halves of V4 now fail loudly.
> - **(adv) Table M gains the in-vocabulary forgery bound.** The residual after
>   the allowlist is swapping among `''`/`'\n'`/`'\n\n'`, whose worst case is
>   bounded by **the vocabulary's longest value — two bytes, both newlines** — so
>   it cannot delete user *text* or cross a line boundary, and stays inside the
>   one-newline-per-side envelope the `safe` predicate already governs. Measured:
>   all three forged entries return the honest result byte-identically.
>
> **2026-08-02 — gate round 5, Codex [high]: DISPOSITIONED, not redesigned.**
>
> Codex raised the **in-vocabulary at-EOF** case: on an honest install whose
> recorded `sepBefore` is `'\n'`, hand-editing the manifest to the
> **in-vocabulary** `'\n\n'` fires Table N's at-EOF disjunct and eats the user's
> trailing newline. **Measured at `e7c845e`:** honest → `"foo\n"`, forged →
> `"foo"`; **delta one byte, all whitespace, text preserved**.
>
> **That is Table M's declared residual, exactly at its declared size**, so it is
> dispositioned against the bound rather than re-opening the design — which is the
> entire purpose of declaring a bound. **What changed is that the bound is now
> EXECUTABLE:** new **T9** pins both the forged result (`"foo"`) and the honest
> control (`"foo\n"`), and asserts the *text* is byte-identical with newlines
> removed, so the test fails the moment the loss widens past whitespace. New
> **AC10**. A declared residual that nothing checks is a claim; one with a test is
> a bound, and that is what terminates this loop.
>
> **Explicitly declined: integrity-protecting the metadata.** It would close
> in-vocabulary forgery, and it is **out of scope by declaration** — the manifest
> has no integrity protection at all, and **`reverseCopiedSkill` carries the same
> residual for the same reason**: its `hash` is read from the same untrusted file,
> so an attacker who can rewrite `sepBefore` can equally rewrite a recorded hash.
> Hardening one field while the file is otherwise unprotected buys nothing. A
> separate design, with its own review.
>
> **2026-08-02 — gate round 6, Codex [metadata lifecycle]: CLOSED.**
>
> **The separator rule was wrong across a delete-and-reinsert cycle.** Round 4
> made `sepBefore`/`sepAfter` **first-insertion-wins**, which is right for the
> replace branch and **wrong for the append branch**: a user can delete the
> managed block by hand and leave the file in a *different* termination state, so
> the next `sync` genuinely inserts **different separator bytes** while the
> manifest keeps the stale ones. **Both directions measured at `e7c845e`:**
>
> ```text
> rule = first-wins
>   (a) "foo" -> delete, left "foo\n"   recorded "\n\n" -> uninstall "foo"    want "foo\n"  WRONG
>   (b) "foo\n" -> delete, left "foo"   recorded "\n"   -> uninstall "foo\n"  want "foo"    WRONG
> rule = per-branch
>   (a) ... recorded "\n"   -> "foo\n"  ok
>   (b) ... recorded "\n\n" -> "foo"    ok
> ```
>
> Direction (a) **eats the user's newline**; (b) **leaves an extra one**. The
> shipped tests never caught it because they exercise only the
> **sentinel-replacement** re-sync, where nothing is inserted and the two rules
> agree — which is exactly why the new rows are lifecycle round trips rather than
> unit assertions on the helper.
>
> **Fix (Codex's recommendation, adopted):** the separator update rule is
> **per-branch**. `recordManagedBlock` takes an explicit `inserted` flag;
> the **createdFile** and **append** branches pass `true` and **UPDATE** the
> recorded separators to what they just wrote, the **replace** branch passes
> `false` and **PRESERVES** them. `createdFile` stays **sticky-true in all three**,
> unchanged from round 4.
>
> **Made structural so this shape cannot recur:** the two fields now carry
> **three distinct rules between them** (sticky-true, update-on-insert,
> preserve-on-replace), so the contract is a **per-field, per-branch matrix**
> rather than prose. Every round that touched this helper was caught by conflating
> two of the three; a matrix makes the omission visible instead of arguable.
> New **T10** (both directions, asserting the **recorded `sepBefore`** as well as
> the final bytes, so a failure says *which* rule fired), new **AC11**, new **V5**
> — whose absence-check half fails loudly if first-insertion-wins is reinstated.
>
> **Declared residual — unchanged.** Table M's in-vocabulary forgery bound does
> not move: this changes *which* in-vocabulary value an honest sync records, not
> the accepted set, and a stale-vs-fresh separator sits inside the same
> one-whitespace-byte envelope. No other part of the threat model shifts.
>
> **2026-08-02 — gate round 8 (round-7 micro-delta APPROVED the lifecycle work;
> one blocking omission + two carries). All closed.**
>
> - **(a) BLOCKING — implementing BOTH sides flips a shipped test, and no round
>   had ever run that configuration.** With the forward *and* reverse contracts
>   implemented, `tests/unit/claude-adapter.test.js:342`
>   (*"a user-relocated mid-file block uninstalls to exactly one blank line"*)
>   goes **23/24**; with the reverse side alone it is **24/24**. Reproduced here:
>   shipped expectation `"# Above\n\n# Below\ntail\n"`, actual under the full pair
>   `"# Above\n\n\n# Below\ntail\n"`. **The new behaviour is correct by this WP's
>   thesis** — the adapter *created* the file, so the forward step records
>   `sepBefore: ''` (*we added nothing on the leading side*), the leading strip
>   never runs, and both of the user's blank lines survive; the shipped assertion
>   encodes the **fixed-one-newline heuristic that IS the A13 defect**. The spec
>   now names the test, its new expected literal, the one-sentence reason, and —
>   critically — **the two wrong readings an implementer would otherwise pick**,
>   because CLAUDE.md's *"choose the simpler option"* tiebreak points straight at
>   "collapse the blank lines", which re-introduces user-byte consumption. New
>   **AC12** and **V1b**, the both-sides run, with 23/24 stated as the red baseline
>   and both runs required in the PR.
> - **(b) V5 had a shell bug** — backticks inside a double-quoted `echo` triggered
>   command substitution (`bash: inserted: command not found`, and the word
>   vanished from the message). Exit status was still right, but V-step output gets
>   pasted into PR bodies. All runnable `echo`s are now single-quoted or
>   backtick-free; verified by running them.
> - **(b) THIRD instance of the soft-guard shape — canonical pass done.** V5's
>   presence check was a bare `grep -q "inserted"`, satisfiable by a **comment**
>   (the reviewer built a reverted implementation that kept the word in a comment
>   and V5 passed). This is V2 (round 2) / V4 (round 4) / V5 (round 7) with the
>   identical defect, while the fix idiom — **per-line `grep -qF` on distinctive
>   operative literals, scoped to the function body** — already existed at V2. **V4
>   and V5 are both converted now** rather than leaving a fourth instance for the
>   next reviewer: they assert the actual expressions
>   (`SEP_BEFORE_OK.has(sepBefore)`, `if (inserted) {`,
>   `recordManagedBlock(…, null, null, false)`) inside the extracted function
>   bodies. Verified shell-clean and correctly red on the untouched tree.
>
> **Structural lesson, recorded because it cost seven rounds:** *a spec whose
> deliverables span **two sides of one contract** needs at least one V-step that
> implements **both sides** and runs the **shipped** suite.* Every pass here
> verified one side at a time — forward or reverse, never the pair — so a flipped
> shipped assertion stayed latent from round 1 through round 7 while eight
> separate gates reported green. **V1b is that step.** The generalisation: a
> verification plan that never assembles the whole change has not verified the
> change, however many of its parts it checked.
