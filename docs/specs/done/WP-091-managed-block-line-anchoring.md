---
id: WP-091
title: Anchor managed-block sentinels to full lines and fail closed on ambiguous markers
status: Done
model: opus
size: M
depends_on: [WP-088, WP-090]
adrs: []
branch: wp/091-managed-block-line-anchoring
---

# WP-091: Managed-block full-line anchoring + single-block invariant

## Context (read this, nothing else)

Wienerdog injects its per-session digest into the user's `CLAUDE.md` /
`AGENTS.md` inside a **managed block** delimited by sentinel comments
(`<!-- wienerdog:begin -->` … `<!-- wienerdog:end -->`). The core install
invariant (THREAT-MODEL T5) is that Wienerdog **only ever rewrites content between
its own sentinels** — it never touches the user's surrounding prose. The forward
write is `applyManagedBlock` (`src/adapters/shared.js`); the reverse (on uninstall)
is `reverseManagedBlock` (`src/core/manifest.js`).

The **verified defect (P1):** both directions locate the block with
`content.indexOf(SENTINEL)` — a raw **substring** search that pairs the **first**
`begin` found *anywhere* with the **first** `end` found *anywhere*, with no
line-boundary anchoring and no single-block check. Consequences:
- User prose or a code block that merely *contains* the sentinel text (even
  inline, mid-line) can be treated as a marker, so everything between it and a real
  `end` is **replaced or deleted** — swallowing user content.
- A duplicated or half-written block (two `begin`s, or an `end` before a `begin`
  after a partial/concurrent write) is silently mis-paired, corrupting the file.

The fix: match a sentinel only when it is the **entire line** (ignoring
surrounding whitespace), enforce **exactly one** `begin` and one `end` (with `end`
after `begin`), and **fail closed** (refuse to edit, with a plain-language error)
when the markers are ambiguous — never guess.

**Product invariant that bounds this WP:** Wienerdog is just files (ADR-0004);
this is markdown-editing code run by `sync`/`uninstall`. The normal round-trip
(fresh install → `sync` → `uninstall`) must stay **byte-identical** to today.

## Current state

`src/adapters/shared.js` `applyManagedBlock(mdPath, digest, dryRun, manifest, out)`:

```js
const begin = current.indexOf(BEGIN);
const end = current.indexOf(END);
if (begin !== -1 && end !== -1 && end > begin) {
  const before = current.slice(0, begin);
  const after = current.slice(end + END.length);
  const next = `${before}${block}${after}`;
  // …write if changed; recordOnce managed-block…
}
// else (no sentinels): append `${base}\n\n${block}\n`
```

where `block = \`${BEGIN}\n${digest.trimEnd()}\n${END}\``. In a Wienerdog-written
file the sentinels are already each on their own line, so today's offsets are:
`begin` = start of the BEGIN line, `end + END.length` = the position right after
the END sentinel's text (before its trailing `\n`).

`src/core/manifest.js` `reverseManagedBlock(entry, dryRun, removed, skipped,
removedSet)` mirrors it: `indexOf(BEGIN)`/`indexOf(END)`, then
`before = content.slice(0, begin)`, `after = content.slice(end + END.length)`,
strips one leading `\n` from `before` and one leading `\n` from `after` (the
blank-line separator + end-sentinel terminator), and deletes the file only if it
created it and nothing else remains. Both files define their own `BEGIN`/`END`
constants. **Neither file imports `WienerdogError` today** — `manifest.js` imports
only `fs`, `path`, `crypto` (verified at `manifest.js:1`), and WP-088 does NOT add
the import; `shared.js` imports only `fs`, `path`. Since the new `locateManagedBlock`
in BOTH files constructs `new WienerdogError`, THIS WP must add
`const { WienerdogError } = require('./errors');` to `manifest.js` and
`const { WienerdogError } = require('../core/errors');` to `shared.js`. Without the
import an ambiguous file throws a `ReferenceError`, not the intended caught
`WienerdogError` — the wrong type and notice.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file, docs/specs/ROADMAP.md, package-lock.json. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/adapters/shared.js | import `WienerdogError` from `../core/errors` (not imported today); add a full-line `locateManagedBlock` helper; use it in `applyManagedBlock`; fail closed on ambiguous markers; neutralize any full-line sentinel inside the digest in `buildBlock` so the block it emits always has exactly one BEGIN/END pair |
| modify | src/core/manifest.js | import `WienerdogError` from `./errors` (not imported today — WP-088 does not add it); mirror the same full-line locate in `reverseManagedBlock`, catching the ambiguity throw internally (skip + notice, do not abort the reverse loop) |
| modify | tests/unit/claude-adapter.test.js | tests: inline-sentinel-in-prose is NOT matched; duplicate/half-written markers fail closed; a digest that itself contains a full-line sentinel is neutralized so the written block round-trips (single pair); normal round-trip unchanged |
| modify | tests/unit/manifest.test.js | reverse-side: same anchoring + fail-closed; byte-identical round-trip |

### Exact contracts

**Line-anchored locator (define identically in each file — deliberate duplication;
the two modules must not cross-depend).** It returns the character offsets of the
single managed block, `null` when there is no block, or throws `WienerdogError`
when markers are ambiguous:

```js
/** Locate the SINGLE managed block by FULL-LINE sentinel match (a line whose
 *  trimmed content equals the sentinel). Returns {begin, end} character offsets
 *  where `begin` = start of the BEGIN line and `end` = position just past the END
 *  sentinel text on its line (matching the historical slice offsets), OR null when
 *  no sentinel line exists. Throws WienerdogError when the markers are AMBIGUOUS:
 *  more than one BEGIN or END line, or an END line before the BEGIN line, or exactly
 *  one of the two present — refuse to edit rather than guess and swallow user text.
 *  @param {string} content @param {string} what  file path, for the error message
 *  @returns {{begin:number, end:number}|null} */
function locateManagedBlock(content, what) {
  const lines = content.split('\n');
  const starts = []; let off = 0;
  for (const l of lines) { starts.push(off); off += l.length + 1; }
  const begins = []; const ends = [];
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t === BEGIN) begins.push(i);
    else if (t === END) ends.push(i);
  }
  if (begins.length === 0 && ends.length === 0) return null;
  if (begins.length !== 1 || ends.length !== 1 || ends[0] < begins[0]) {
    throw new WienerdogError(`ambiguous wienerdog managed-block markers in ${what} — refusing to edit (resolve by hand)`);
  }
  const b = begins[0], e = ends[0];
  // `end` = right after the END sentinel text on its line (excludes trailing \n),
  // matching the historical `indexOf(END) + END.length` for a clean written block.
  const end = starts[e] + lines[e].indexOf(END) + END.length;
  return { begin: starts[b], end };
}
```

**`applyManagedBlock`** uses it in place of the `indexOf` pair:

```js
const span = locateManagedBlock(current, mdPath);   // may throw (ambiguous)
if (span) {
  const before = current.slice(0, span.begin);
  const after = current.slice(span.end);
  const next = `${before}${block}${after}`;
  // …unchanged: write if next !== current; recordOnce managed-block createdFile:false…
} else {
  // no sentinels → unchanged append path (`${base}\n\n${block}\n`)
}
```

**`reverseManagedBlock`** uses it identically, but MUST catch the ambiguity throw
**internally** — the reverse loop in `manifest.js` (`for (const entry of
[...manifest.entries].reverse())`, line ~316) has **no per-entry try/catch**, so a
propagated throw would abort the ENTIRE uninstall, not "skip and continue." Wrap
the `locateManagedBlock` call in `reverseManagedBlock` itself; on a
`WienerdogError` (ambiguous markers), write the stderr notice, push to `skipped`,
and RETURN without deleting or rewriting — leaving the file for the user and
letting the reverse loop continue to the next entry:

```js
function reverseManagedBlock(entry, dryRun, removed, skipped, removedSet) {
  let content;
  try { content = fs.readFileSync(entry.path, 'utf8'); }
  catch { skipped.push(entry.path); return; }
  let span;
  try {
    span = locateManagedBlock(content, entry.path); // may throw on ambiguity
  } catch (err) {
    // Ambiguous markers → do NOT guess and delete user text; skip this entry and
    // keep the uninstall going (the reverse loop has no try/catch of its own).
    process.stderr.write(`wienerdog: ${err.message}; leaving ${entry.path} in place\n`);
    skipped.push(entry.path);
    return;
  }
  if (span === null) { skipped.push(entry.path); return; } // user removed the block
  // …unchanged from here: derive before/after from span.begin/span.end, keep the
  //   before.endsWith('\n')→slice + after.startsWith('\n')→slice separator trimming
  //   and the `createdFile && remaining.trim()===''` delete rule, operating on span…
}
```

No change to the reverse loop is required (and none is in Deliverables) —
`reverseManagedBlock` fully contains its own failure. The forward
`applyManagedBlock` still THROWS on ambiguity (surfaced per-adapter by `sync`);
only the reverse side must swallow-and-skip.

**`buildBlock` self-wedge guard (keep the single-pair invariant self-consistent).**
The digest is derived from consolidated session/vault content, so — however
unlikely — a digest LINE could itself trim exactly to `<!-- wienerdog:begin -->`
or `<!-- wienerdog:end -->`. If `buildBlock` embedded it verbatim, the block it
writes would contain a SECOND begin/end line, and the very next `sync` (or
`uninstall`) would see two markers, hit the new single-pair invariant, and FAIL
CLOSED on Wienerdog's own output — permanently wedging digest updates. Neutralize
any full-line sentinel inside the digest before wrapping it (idempotent; only a
line that trims exactly to a sentinel is touched — inline mentions, already safe
under full-line matching, are left alone):

```js
function buildBlock(digest) {
  const safeDigest = digest
    .split('\n')
    .map((line) => {
      const t = line.trim();
      if (t === BEGIN) return line.replace(BEGIN, '<!-- wienerdog begin -->'); // colon → space: no longer a sentinel
      if (t === END) return line.replace(END, '<!-- wienerdog end -->');
      return line;
    })
    .join('\n');
  return `${BEGIN}\n${safeDigest.trimEnd()}\n${END}`;
}
```

This guarantees the block `buildBlock` emits always has exactly ONE begin/end pair,
so `locateManagedBlock` never rejects Wienerdog's own writes. A normal digest (no
full-line sentinel) is unchanged, so existing golden output stays byte-identical.

**Byte-identical round-trip requirement:** for a normally written block (each
sentinel a full line, exactly one pair), `locateManagedBlock` returns the SAME
offsets the old `indexOf` produced, so `applyManagedBlock` and `reverseManagedBlock`
yield byte-identical output to today. The existing round-trip test
(`sync` → `uninstall` restores the pre-existing file byte-for-byte) MUST still pass
unchanged.

**Fail-closed behavior:**
- Forward: an ambiguous file throws — `sync` surfaces the error for that adapter
  and does not corrupt the file. (A single adapter throw should be reported, not
  crash the whole `sync`; match how `sync` already handles per-adapter errors — if
  it currently lets them propagate, keep that; do not expand scope to add new error
  handling in `sync.js`, which is not in Deliverables.)
- Reverse: `reverseManagedBlock` catches the ambiguity throw internally, leaves the
  file untouched, records it in `skipped`, writes a stderr notice, and returns — so
  the reverse loop (which has no try/catch of its own) continues with the other
  entries and uninstall does not abort.

## Implementation notes & constraints

- Zero new dependencies; plain Node ≥ 18, JSDoc types only (CLAUDE.md).
- Depends on **WP-088** (shares `manifest.js`) and **WP-090** (shares
  `shared.js`) — sequence after both to avoid merge conflicts.
- Duplicate `locateManagedBlock` in both files (each already owns its `BEGIN`/`END`
  constants). Do NOT introduce a new shared module or make `manifest.js` depend on
  `adapters/` (wrong direction). Note the deliberate duplication in "Decisions made".
- BOTH files must import `WienerdogError` from `src/core/errors.js` — neither does
  today, and WP-088 does not add it to `manifest.js`. Add
  `const { WienerdogError } = require('../core/errors');` to `shared.js` and
  `const { WienerdogError } = require('./errors');` to `manifest.js`. A missing import
  turns the intended caught `WienerdogError` into an uncaught `ReferenceError`.
- Sentinel match is on the **trimmed** line so a user who indented or trailing-spaced
  a sentinel line still round-trips; a sentinel appearing inline with other
  non-whitespace content is NOT a match.
- Do not change the block content format, the append path, the `createdFile` logic,
  or the manifest entry shape. The `buildBlock` neutralization touches ONLY a digest
  line that trims exactly to a sentinel; a normal digest is unchanged (golden output
  stays byte-identical).

## Security checklist

- [ ] A sentinel is recognized ONLY as a full line (trimmed) — user prose/code that
      contains the sentinel text inline is never treated as a marker, so user content
      outside the real block can never be replaced or deleted.
- [ ] Exactly one BEGIN and one END (END after BEGIN) are required; any other
      configuration FAILS CLOSED (throws / leaves the file untouched) rather than
      mis-pairing markers and swallowing content — in BOTH the forward and reverse
      directions.

## Acceptance criteria

- [ ] A file whose user prose contains `<!-- wienerdog:begin -->` inline (not as a
      whole line) plus a real managed block is edited/reversed using ONLY the real
      full-line block; the inline text is untouched.
- [ ] A file with two BEGIN lines, or an END before a BEGIN, or only one of the two:
      forward throws `WienerdogError`; reverse leaves the file untouched and reports it.
- [ ] The normal fresh-install → `sync` → `uninstall` round-trip restores a
      pre-existing file byte-for-byte (existing round-trip test passes unchanged).
- [ ] A second `sync` on an already-blocked file is a no-op (`unchanged`).
- [ ] A digest whose content includes a line that trims exactly to
      `<!-- wienerdog:begin -->` (or `end`) is neutralized by `buildBlock`, so the
      written file has exactly one begin/end pair and a following `sync`/`uninstall`
      locates it without hitting the ambiguity fail-closed.
- [ ] An ambiguous file on the REVERSE side does not abort uninstall: the other
      manifest entries are still reversed (proved by a manifest with an ambiguous
      managed-block entry plus another removable entry). The thrown-and-caught error
      is a `WienerdogError` (from the newly added `require('./errors')` import), NOT a
      `ReferenceError` — assert the reverse skips the entry cleanly and the process
      does not crash.
- [ ] Forward: an ambiguous file throws a `WienerdogError` instance (not a
      `ReferenceError`), proving `shared.js` imports `WienerdogError`.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern "managed|adapter|manifest|uninstall"
npm test
npm run lint
```

## Out of scope (do NOT do these)

- CRLF line-ending normalization of the block (adapters #14) — separate; do not
  change the LF-only block format here.
- `sync.js` error-handling changes — not in Deliverables. Adding a per-entry
  try/catch to the `manifest.js` reverse LOOP — not needed: `reverseManagedBlock`
  contains its own failure (skip + notice), so the loop stays as-is.

## Round-2 dispositions

- **Codex round-2 P1 (reverse-side fail-closed assumes non-existent exception
  handling):** RESOLVED. The reverse loop has no per-entry try/catch, so
  `reverseManagedBlock` now catches the `locateManagedBlock` ambiguity throw
  INTERNALLY (skip + stderr notice + return), leaving the loop unchanged and
  uninstall un-aborted. The earlier "propagate as a caught skip" wording is removed.
- **Codex round-2 P2 (a digest that contains a full-line sentinel self-wedges the
  single-pair invariant):** RESOLVED by bringing minimal `buildBlock` neutralization
  IN scope (previously parked as out-of-scope). Only a digest line that trims exactly
  to a sentinel is neutralized (colon→space), guaranteeing Wienerdog's own block
  always has exactly one pair. Grounding the "digest can never contain a sentinel"
  claim was rejected: the digest derives from arbitrary consolidated content and
  cannot be proven sentinel-free, so a defensive neutralization is the safe call.
- **Codex round-3 P2 (`manifest.js` wrongly assumed to already import
  `WienerdogError`):** RESOLVED. The earlier draft claimed WP-088 leaves `manifest.js`
  importing `WienerdogError`; it does not (verified: `manifest.js` imports only
  `fs`/`path`/`crypto`, and WP-088 adds no such import). Since `locateManagedBlock`
  constructs `new WienerdogError` in both files, this WP now explicitly requires
  adding `require('./errors')` to `manifest.js` and `require('../core/errors')` to
  `shared.js`, with ACs asserting an ambiguous file yields a caught `WienerdogError`
  (not a `ReferenceError`) on both directions.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/091-managed-block-line-anchoring`; conventional commits; PR titled
   `fix(managed-block): anchor sentinels to full lines, fail closed on ambiguity (WP-091)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.

## Done record (2026-07-13)

Merged to main as `fcd6b53` (PR #93, squash). Managed-block sentinels are anchored to full lines (substring `indexOf` could swallow user prose); an ambiguous marker is caught and skipped as a `WienerdogError` (not a `ReferenceError`) and uninstall continues. Double gate: wd-reviewer APPROVE + Codex clean; CI green. Shipped in v0.8.0.
