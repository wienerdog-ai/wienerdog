---
id: WP-147
title: Managed-block uninstall must remove only Wienerdog-added separators, never fuse a user's surrounding lines
status: Ready
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
| modify | tests/unit/claude-adapter.test.js | Round-trip cases incl. the relocated-block-between-single-newline-lines case (**Table N row 4**). |
| modify | tests/unit/manifest.test.js | Direct `reverseManagedBlock` cases for recorded + legacy (no sep metadata) entries — **Table N rows 1, 2, 4, 6** — plus **T6**: rows **3 and 5** as a matched pair (relocated-to-EOF with `sepBefore='\n'` keeps the trailing newline; with `sepBefore='\n\n'` it does not), which is the only thing that proves the gate discriminates rather than just disabling the disjunct. |

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
recordManagedBlock(manifest, mdPath, false, sepBefore, sepAfter);
out.changed.push(mdPath);                              // ← UNCHANGED, and easy to drop
```
- createdFile branch: record `recordManagedBlock(manifest, mdPath, true, '', '\n')`
  (file is exactly `block + '\n'`; no leading separator).
- replace branch (sentinels already present): unchanged splice; keep calling
  `recordOnce`/upsert so it does NOT overwrite the sep metadata recorded at first
  insertion (a re-sync must not clobber the original separators). Simplest:
  `recordManagedBlock` UPSERTS but only sets `sepBefore`/`sepAfter` when absent
  (first insertion wins); it always keeps `createdFile`.

Add `recordManagedBlock(manifest, path, createdFile, sepBefore, sepAfter)` in
`shared.js` (mirror `recordCopiedSkill`'s upsert style): find existing
`managed-block` entry for `path`; create if absent; set `createdFile`; set
`sepBefore`/`sepAfter` ONLY if the existing entry has none (or on create). Never
duplicate the entry.

**Forward-side "unchanged" regions — the same standard as the reverse side.**
Only the three lines `const base = …` / `const next = …` / `recordOnce(…)`
(`shared.js:172-175`) are replaced. Byte-for-byte **against the file**
(`sed -n '133,177p' src/adapters/shared.js` at `e7c845e`):

| Region | `e7c845e` anchor | Must stay |
|--------|------------------|-----------|
| `buildBlock` call and the read | `shared.js:134-140` | unchanged. |
| The absent-file branch | `shared.js:142-152` | unchanged **except** its `recordOnce` becomes `recordManagedBlock(manifest, mdPath, true, '', '\n')`. The written bytes stay `` `${block}\n` `` — the digest golden depends on it. |
| The `locateManagedBlock` call + splice-replace branch | `shared.js:154-169` | unchanged **except** its `recordOnce` becomes the upsert. The `next === current` → `out.unchanged.push` arm is untouched. |
| **`out.changed.push(mdPath);`** | `shared.js:176` | **unchanged — and this is the one an implementer drops**, because the round-1 draft of the append-branch snippet above omitted it. `sync` reports the file as changed via this line; without it the file is silently rewritten and reported as untouched. |
| The function close | `shared.js:177` | unchanged. |

**Reverse (`reverseManagedBlock` in manifest.js):**
```js
let before = content.slice(0, span.begin);
let after = content.slice(span.end);

// Trailing terminator: the block's own line end is always Wienerdog's — remove it.
const sepAfter = typeof entry.sepAfter === 'string' ? entry.sepAfter : '\n';
if (after.startsWith(sepAfter)) after = after.slice(sepAfter.length);
else if (after.startsWith('\n')) after = after.slice(1); // legacy fallback

// Leading separator: remove ONLY the exact bytes we added, and ONLY when doing so
// preserves a line boundary — otherwise we would fuse two user lines (the A13 bug).
const sepBefore = typeof entry.sepBefore === 'string' ? entry.sepBefore : '\n';
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

### Table N — the `safe` predicate, every case (canonical)

Executed at `e7c845e`, all six cases, three implementations side by side.
"round-1" is the ungated `after === ''`; "gated" is the contract above.

| # | Case | `sepBefore` | Want | today (shipped) | round-1 | **gated** |
|---|------|-------------|------|-----------------|---------|-----------|
| 1 | genuine append onto `foo\n` | `'\n'` | `"foo\n"` | `"foo\n"` | `"foo\n"` ok | `"foo\n"` **ok** |
| 2 | genuine append onto `foo` | `'\n\n'` | `"foo"` | `"foo\n"` **lossy** | `"foo"` ok | `"foo"` **ok** |
| 3 | **relocated to EOF, original `foo\n`** | `'\n'` | `"foo\n"` | `"foo"` | `"foo"` **XX** | `"foo\n"` **ok** |
| 4 | relocated between two lines | `'\n'` | `"lineA\nlineB\n"` | `"lineAlineB\n"` **fusion** | ok | **ok** |
| 5 | relocated to EOF, original `foo` | `'\n\n'` | `"foo"` | `"foo"` | ok | **ok** |
| 6 | empty original | `'\n\n'` | `""` | `"\n"` | ok | **ok** |

**Round-1 scored 5/6; the gated predicate scores 6/6.** Rows 2, 4 and 6 are the
bugs this WP exists to fix; row 3 is the one the gate adds.

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
      step supplied the file's terminator itself (Table N row 3 vs row 5).
- [ ] A re-sync does not overwrite the sep metadata captured at first insertion.

## Acceptance criteria

- [ ] Round-trip on a file whose original content ends in one `\n` restores it
      **byte-identically** after sync→uninstall.
- [ ] Round-trip on a file with no trailing newline restores it byte-identically.
- [ ] A block manually relocated to sit between two single-newline user lines
      uninstalls to `lineA\nlineB\n` (no fusion), NOT `lineAlineB\n`.
- [ ] A createdFile managed block uninstalls by deleting the file.
- [ ] A legacy `managed-block` entry (no `sepBefore`/`sepAfter`) still restores a
      genuine append and no longer fuses a relocated block.
- [ ] **AC7 (new — Table N row 3).** A block relocated to **end of file** on an
      originally newline-terminated file (`sepBefore === '\n'`) uninstalls to
      `"foo\n"`, **not** `"foo"` — the user's own trailing newline survives. Its
      companion, Table N row 5 (`sepBefore === '\n\n'`, original `foo`), still
      restores `"foo"`, so the gate is proved to discriminate rather than to
      simply disable the disjunct. **Both are T6.**
- [ ] `npm test` and `npm run lint` are green (digest golden unchanged).

## Verification steps (run these; paste output in the PR)

```bash
# V1 — the two suites this WP touches. Never a bare `node --test`; tests/run.js
# sets the scheduler guard the whole suite depends on.
node tests/run.js tests/unit/claude-adapter.test.js tests/unit/manifest.test.js

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

# V4 — full gates.
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
