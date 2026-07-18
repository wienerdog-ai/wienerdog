---
id: WP-147
title: Managed-block uninstall must remove only Wienerdog-added separators, never fuse a user's surrounding lines
status: Draft
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

**Forward** — `src/adapters/shared.js`, `applyManagedBlock(...)`. Absent file →
write `block + '\n'`, record `{kind:'managed-block', path, createdFile:true}`.
Sentinels present → splice replace (no separator change). **Present, no
sentinels (append):**
```js
const base = current.replace(/\n+$/, '');      // ← LOSSY: destroys the file's own trailing newlines
const next = `${base}\n\n${block}\n`;          // ← inserts a blank-line separator + block + one newline
if (!dryRun) fs.writeFileSync(mdPath, next);
recordOnce(manifest, { kind: 'managed-block', path: mdPath, createdFile: false });
```
The manifest entry records NO information about how many separator bytes were
inserted.

**Reverse** — `src/core/manifest.js`, `reverseManagedBlock(...)`:
```js
let before = content.slice(0, span.begin);
let after = content.slice(span.end);
if (before.endsWith('\n')) before = before.slice(0, -1);   // ← strips ONE leading newline unconditionally
if (after.startsWith('\n')) after = after.slice(1);        // ← strips ONE trailing newline
const remaining = before + after;
if (entry.createdFile === true && remaining.trim() === '') { /* delete file */ }
else if (!dryRun) fs.writeFileSync(entry.path, remaining);
```
`span` comes from `locateManagedBlock(content, path)` (duplicated in both files;
NOT changed by this WP): `begin` = start of the BEGIN sentinel line, `end` =
just past the END sentinel text (excludes the block's own trailing `\n`).

The unconditional `before.endsWith('\n') → slice(0,-1)` is the fusion bug.

WP-144's manifest schema validator ignores unknown/extra entry keys (it only
enforces required keys/types), so adding `sepBefore`/`sepAfter` to a
`managed-block` entry is safe and needs no schema change (optionally list them as
known-optional keys — additive only).

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file, docs/specs/ROADMAP.md, package-lock.json. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/adapters/shared.js | `applyManagedBlock`: replace the lossy append with a non-lossy insert that records the exact inserted separator bytes (`sepBefore`, `sepAfter`) on the manifest entry. `createdFile` and `replace` branches keep behavior; record `sepAfter:'\n'` on the createdFile branch. |
| modify | src/core/manifest.js | `reverseManagedBlock`: strip only the recorded (or legacy-default) separators, and only when the strip preserves a line boundary — never fuse user lines. |
| modify | tests/unit/claude-adapter.test.js | Round-trip cases incl. the relocated-block-between-single-newline-lines case. |
| modify | tests/unit/manifest.test.js | Direct `reverseManagedBlock` cases for recorded + legacy (no sep metadata) entries. |

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
  const safe = candidate === '' || candidate.endsWith('\n') || after === '' || after.startsWith('\n');
  if (safe) before = candidate; // else: leave the user's newline intact (no fusion)
}
const remaining = before + after;
```
The rest of `reverseManagedBlock` (the `createdFile && remaining.trim()===''`
delete, the ambiguity try/catch, the `span===null` skip) is unchanged.

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
- When uncertain, choose the simpler option and record it under "Decisions made".

## Security checklist

- [ ] Uninstall never strips a newline that is a boundary between two user lines
      (the `safe` predicate), so a relocated block can never fuse user content.
- [ ] Only the exact recorded separator bytes (or the legacy `'\n'` default,
      under the same guard) are removed; nothing before them is touched.
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
- [ ] `npm test` and `npm run lint` are green (digest golden unchanged).

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern "adapter|manifest|managed"
npm test
npm run lint
```

## Out of scope (do NOT do these)

- Changing `locateManagedBlock`, `buildBlock`, or the sentinel strings.
- The settings-upsert / foreign-symlink fixes — **WP-146** (dependency).
- Any other manifest reverser — those are WP-144 / WP-145.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/147-managed-block-separator-roundtrip`; conventional commits;
   PR titled `fix(uninstall): remove only Wienerdog-added managed-block separators, never fuse user lines (WP-147)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
