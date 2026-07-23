---
id: WP-identity-digest-hashgate-toctou
title: Close the identity digest hash-gate TOCTOU (hash+parse one read) and give an accurate banner reason
status: Done
model: opus
size: S
depends_on: []
adrs: [ADR-0004, ADR-0021]
epic: p0-ungate
---

# WP-identity-digest-hashgate-toctou: Hash-and-parse the same bytes; accurate identity banner reason

## Context (read this, nothing else)

Wienerdog is just files (ADR-0004). The injected **digest**
(`src/core/digest.js` `renderDigest`) injects each of the four injected **identity**
files ONLY when its current exact bytes match a human-approved `sha256` in the
identity trust registry (ADR-0021). `renderDigest` is pure and total (never throws);
an omitted identity note is surfaced by a fixed, code-owned banner.

The pre-takeover double-gate review found two impl-bugs in the read-side gate that
must be closed before the 0.10.0 un-freeze:

- **TOCTOU (Finding 2).** The identity loop reads the file bytes, hashes them, then
  reads the file a SECOND time to get the body it injects. The hash gate therefore
  validates read #1 while the injected content comes from read #2 — a concurrent
  local writer or a symlink-target swap between the two reads injects unapproved
  content past the hash gate. The exact-byte invariant is "hash-and-use the SAME
  bytes."
- **Inaccurate banner (Finding 3).** On any hash mismatch the loop reports
  `changed since you last approved it`, which is wrong for a present-but-never-
  approved file (that reason implies a prior approval). `identityStatus` already
  distinguishes `'unapproved'` from `'mismatch'`.

## Current state

`src/core/digest.js`:

`readNote(filePath)` (l.54-70) reads `fs.readFileSync(filePath, 'utf8')`, `parse`s,
applies the `derived_from_untrusted` gate, returns `{note:{data,body}|null,
exclusion}`.

The identity loop (l.379-423):

```js
  const approvals = opts.identityApprovals || {};
  const identityExclusions = [];
  for (const [file, header] of identity) {
    const abs = path.join(idDir, file);
    let bytes;
    try { bytes = fs.readFileSync(abs); } catch { continue; }        // read #1 (Buffer)
    const foldedRel = foldKey(`${layout.identity_dir}/${file}`);
    if (approvals[foldedRel] !== hashBytes(bytes)) {                 // hash of read #1
      if (opts.identityApprovals !== undefined) identityExclusions.push({ file, reason: 'changed since you last approved it' });
      continue;
    }
    const r = readNote(abs);                                        // read #2 (unbounded, separate)
    if (!r.note) { /* malformed / untrusted-invalid → banner; else silent */ continue; }
    // … cap + secret scan → parts.push(`${header}\n${content}`) …
  }
```

`identity-approvals.js` exports `hashBytes(buf)`, `foldKey(rel)`. The frontmatter
parser is `src/core/frontmatter.js` `parse(text)`; `readBool(fields, key)` and
`INVALID` come from the same module (already imported in `digest.js`).

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file, package-lock.json. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/core/digest.js | factor `readNote`'s parse into `parseNoteResult(text)`; identity loop parses the ALREADY-READ `bytes` (no 2nd read); accurate banner reason from approval presence |
| modify | tests/unit/digest.test.js | injected content derives from the hashed bytes (TOCTOU-closed via a seam); banner reason distinguishes "not yet approved" vs "changed…" |

### Exact contracts

**1. Factor the parse so the same bytes are hashed and injected.** Split
`readNote(filePath)` into a pure `parseNoteResult(text)` (the parse + provenance
gate) and a thin `readNote(filePath)` that reads then delegates:

```js
/** The parse + trust gate on already-read text (no fs). Same classes as readNote. */
function parseNoteResult(text) {
  const fm = parse(text);
  if (fm.malformed) return { note: null, exclusion: 'malformed' };
  const t = readBool(fm.fields, 'derived_from_untrusted');
  if (t === true) return { note: null, exclusion: 'untrusted-exact' };
  if (t === INVALID) return { note: null, exclusion: 'untrusted-invalid' };
  return { note: { data: Object.fromEntries(fm.fields), body: fm.body }, exclusion: null };
}

function readNote(filePath) {
  let text;
  try { text = fs.readFileSync(filePath, 'utf8'); } catch { return { note: null, exclusion: 'absent' }; }
  return parseNoteResult(text);
}
```

Export `parseNoteResult` (the daily-summary WP reuses it for its bounded read).

**2. Identity loop parses the hashed bytes; accurate banner reason:**

```js
    let bytes;
    try { bytes = fs.readFileSync(abs); } catch { continue; }
    const foldedRel = foldKey(`${layout.identity_dir}/${file}`);
    if (approvals[foldedRel] !== hashBytes(bytes)) {
      if (opts.identityApprovals !== undefined) {
        // Accurate reason: an unrecorded file was never approved; a differing hash
        // for a recorded file changed since approval.
        const reason = approvals[foldedRel] === undefined
          ? 'not yet approved — run `wienerdog memory approve`'
          : 'changed since you last approved it';
        identityExclusions.push({ file, reason });
      }
      continue;
    }
    // Parse the SAME bytes just hashed (no second read → no TOCTOU window).
    const r = parseNoteResult(bytes.toString('utf8'));
    if (!r.note) {
      if (r.exclusion === 'malformed') identityExclusions.push({ file, reason: 'malformed frontmatter' });
      else if (r.exclusion === 'untrusted-invalid') identityExclusions.push({ file, reason: 'unclear derived_from_untrusted value' });
      continue;
    }
    // … existing cap + secret scan → parts.push(`${header}\n${content}`) unchanged …
```

`hashBytes(bytes)` hashes the raw Buffer; `bytes.toString('utf8')` decodes the SAME
buffer for parsing — the injected body derives from exactly the bytes that were
hashed. The daily block keeps calling `readNote`/`readNoteBounded` (unaffected here).

## Implementation notes & constraints

- **Exact-byte invariant:** the digest injects an injected-identity file's body ⟺
  `∃ approvals[k] == sha256(B)` where `B` is the SINGLE buffer read for that file and
  the injected body is `parseNoteResult(B.toString('utf8')).body`. No second read.
- **Banner stays code-owned** — it names code-constant filenames + fixed reason
  strings only, never note content (unchanged rule).
- **`renderDigest` stays pure and total.**
- The banner remedy text at the bottom of `renderDigest` (naming `wienerdog memory
  approve <note>`) is unchanged; only the per-file `reason` becomes accurate.
- Zero new deps; plain Node ≥ 18; JSDoc types; no build step.
- When uncertain, choose the simpler option and record it under "Decisions made".

## Security checklist

- [ ] The identity content injected into the digest is parsed from the exact bytes
      whose hash the gate checked — a single read, no TOCTOU window (asserted via a
      test seam that would surface a second read). The banner reason accurately
      names "not yet approved" vs "changed since you last approved it". No untrusted
      identifier flows into a path/shell; `renderDigest` never throws.

## Acceptance criteria

- [ ] The golden byte-identity digest test still passes (identity rendering
      unchanged for the approved-and-matching case).
- [ ] A test proves the injected identity body derives from the hashed bytes (e.g.
      a fs read seam records exactly one read of each identity file per render, or
      an equivalent assertion that no second read occurs).
- [ ] A present-but-unrecorded identity file (approvals supplied, no entry) yields
      the banner reason "not yet approved — run wienerdog memory approve"; a
      recorded-but-changed file yields "changed since you last approved it".
- [ ] `parseNoteResult` is exported and pure (no fs).
- [ ] `npm test` and `npm run lint` pass.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern "digest"
npm test -- --test-name-pattern "identity"
npm test
npm run lint
```

## Out of scope (do NOT do these)

- The `seedApprovals` gate-coupling + write-side case-variant — `WP-identity-seed-gate-couple`.
- The daily-summary fence + bounded read — `WP-daily-summary-untrusted-fence`
  (it reuses `parseNoteResult` this WP exports).
- Opening any capability gate.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Conventional commits; PR titled
   `fix(digest): hash-and-parse one read for the identity gate + accurate banner reason (WP-identity-digest-hashgate-toctou)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
