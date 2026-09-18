---
date: 2026-09-18
title: "Re-pinning WP-dream-collect-parse-throw-quarantine to 297ef1df after #269"
related_wps: [WP-dream-collect-parse-throw-quarantine, WP-dream-primary-dialogue-collection]
---

# Re-pinning the parse-throw spec after the collection package landed

`WP-dream-primary-dialogue-collection` merged as **PR #269** (merge `297ef1df`,
tip `119137d2`) and rewrote the admission loop
`WP-dream-collect-parse-throw-quarantine` exists to wrap. This entry records
every citation's old→new value and the verdict on whether anything crossed from
cite refresh into design change.

**The spec stays `Ready` and is now dispatchable. No contract row's rule
changed.** Two facts were *added* to Table B because the new loop shape makes
them decidable where before they were silent; both follow from rules the table
already stated, and neither is a new decision. They are itemised at the bottom.

## Method

Every cite was re-derived **by construct** at `297ef1df` — locating the
construct and checking both ends of each range — never by adding a delta to the
old number. The full delta is
`git diff a60c14e6..297ef1df -- src tests skills scripts bin templates`, which
touches eleven files: `docs/adr/0020-skill-revision-lifecycle.md`,
`skills/wienerdog-dream/SKILL.md`, `src/cli/dream.js`,
`src/core/dream/scratch.js`, `src/core/runtime-skill-digests.json`,
`tests/integration/dream.test.js`, `tests/unit/dream-collect.test.js`,
`tests/unit/dream-pipeline.test.js`, `tests/unit/dream-skill-structure.test.js`
and the two new `tests/red-proofs/dream-primary-collection*.proofs.json`.

**Files this spec cites that #269 did not touch**, re-checked construct by
construct rather than assumed: `src/core/dream/ledger.js`,
`src/core/dream/warnings.js`, `src/core/dream/promote.js`,
`src/core/transcripts/codex.js`, `src/core/transcripts/claude.js`,
`tests/unit/ledger.test.js` and `scripts/red-proofs.js`.

## `src/core/dream/scratch.js` — every cite

| Construct | Old (`a60c14e6`) | New (`297ef1df`) |
|---|---|---|
| `sanitize(id)` definition | 18 | **18** (unchanged; body 18–20) |
| `over-ceiling` push (Table B row B4) | 68 | **86** |
| the admission loop over `underCeiling` | 98–150 | **128–195** |
| capacity stop, `remaining === 0` | 101–104 | **131–134** |
| deadline stop | 105–108 | **135–138** |
| cached-oversized memo skip | 112–115 | **142–145** |
| `delete oversizedExtracts[key]` | 118 | **148** |
| the unguarded parse call | 119, `parseWithOutcome`, one line, two destructured names | **149–150, `parsePrimaryWithOutcome`, two lines, FOUR destructured names** (`extract`, `gateExtract`, `intakeBytes`, `parse`) |
| non-`ok` quarantine arm | 120–123 | **151–154** |
| read-deferred arm | 124–127 | **155–158** |
| the byte measurement | 128, `const extractBytes = Buffer.byteLength(JSON.stringify(extract))` | **164, `const extractBytes = intakeBytes;`** |
| individually-oversized arm + memo write | 129–133 | **165–169** |
| capacity-stop-with-break | 134–137 | **170–173** |
| scratch-filename derivation | 138 | **174** |
| `writeFilePrivate(scratchFile, JSON.stringify(extract, null, 2))` | 139 | **178** |
| gate key `` `${d.harness}:${extract.session_id}` `` | — (did not exist) | **179** |
| eviction `gateExtracts.delete(evicted)` | — | **180–181** |
| `gateExtracts.set` / `gateKeyByFile.set` | — | **182–183** |
| `entries.push` | — (was 140–146) | **184–190** |
| `wrote.push` / `processed.push` | — | **191 / 192** |
| `intakeBytesTotal += intakeBytes` | — (did not exist) | **193** |
| `remaining -= extractBytes` | — | **194** |

## `src/cli/dream.js` — every cite

| Construct | Old | New |
|---|---|---|
| per-quarantine console line loop (Table A row A8) | 802–807 | **806–813** |
| `!dryRun` guard on the ledger write (Table A row A11) | 818 | **822** |

PR #269 edited this file (the `extractsBySession` disk rebuild was replaced by the
collector's in-memory map, and one dry-run byte line became two); the two
constructs above are unchanged in content.

## Cites verified unchanged

| Cite | Construct | Verdict |
|---|---|---|
| `ledger.js:41` | `INFORMATIONAL_QUARANTINE_REASONS = Object.freeze(['over-ceiling', 'too-many-lines', 'read-error'])` | unchanged |
| `ledger.js:92` | the `reason?:` union in the `Ledger` typedef | unchanged |
| `warnings.js:108-123` | `GROUPS`, `read-error` row at 115, `SECRET_REVERT_EXHAUSTED_REASON` row at 117, catch-all `reason: null` at 122 | unchanged |
| `promote.js:642-644` | the count-only "set aside by this run" bullet | unchanged |
| `ledger.test.js:485` | the pinned `INFORMATIONAL_QUARANTINE_REASONS` array | unchanged |
| `red-proofs.js:1655` | the `code !== 'ERR_ASSERTION'` refusal | unchanged |
| `codex.js:77-83`, `codex.js:91-95` | the two coercing joins | unchanged |
| `claude.js:57-66`, `claude.js:175-178` | the two coercing joins | unchanged |

## `tests/unit/dream-collect.test.js`

Not a line cite, but a dispatch instruction: the file's tail was
`WP-dream-report-run-skips`' partition tests and is now
`WP-dream-primary-dialogue-collection`'s block (the file ends at **1656** with
that package's cached-oversized-memo test). The Implementation note now names
three prior appenders instead of two. The suite's `assertPartition` helper
(`:1051`) is unchanged and still requires every discovered file to be counted
exactly once across the arms, so a `parse-threw` set-aside in
`newlyQuarantined` keeps it holding.

## Consequences that are more than a cite refresh — and why they are not a design round

Both follow from rules Table B already stated; neither changes a rule; neither
is a decision left open. They are written into the spec so an implementer does
not have to re-derive them, per the re-pin's own instruction to say so
explicitly if the fix now has to touch the gate map.

1. **The measured quantity is no longer a serialization (row B1).** It was
   `Buffer.byteLength(JSON.stringify(extract))`; it is now
   `const extractBytes = intakeBytes`, a plain assignment of a number the parser
   returned. The old argument for keeping it inside the boundary ("it cannot
   throw on `JSON.parse`d data") is replaced by a simpler one ("a `let`
   assignment of a number cannot throw at all"), and it stays inside because it
   belongs to the iteration's ordered preparation, not because it can throw. The
   `JSON.stringify(extract, null, 2)` that row B1 also names still exists, as
   `writeFilePrivate`'s second argument at `:178`. **Row B1's extent is
   unchanged.**
2. **The collector now returns two in-memory gate maps, and the fix touches
   NEITHER (rows B3, B5).** `gateExtracts` is the text-free evidence
   `src/cli/dream.js` hands the learnings-ledger gate; `gateKeyByFile` implements
   the filename eviction. Every mutation of both sits **after**
   `writeFilePrivate` (`:179-183`), which row B5 already places outside the
   boundary, so a `continue` from inside the boundary can never reach them and
   **an eviction-adjacent throw cannot leave a stale gate entry**. Row B3's
   "consumes nothing" therefore already covered them; its enumeration now
   *names* them (along with `intakeBytesTotal`) so the fact is checkable rather
   than implied, and the `node -e` boundary gate gained a `checkGateMap` arm and
   criterion 4 a clause. **This is an enumeration completed over a return shape
   that grew, not a new rule.** The reason it is written down at all: a future
   edit that moved a gate-map write above the boundary's end would silently
   weaken an authorization gate, and nothing in the spec would have caught it.

   One adjacent fact, checked rather than assumed: the gate key at `:179`
   interpolates `extract.session_id`, which is content-derived and therefore
   looks like a new throw site outside the boundary. It is not. Line `:174`'s
   `sanitize` calls `String()` on that same value first, and a value that
   survives `String()` cannot make a template literal throw — the only value
   class where the two diverge is `Symbol`, which `JSON.parse` cannot produce.

## Other sentences updated by this re-pin

- The base pin, in all four places it appears: the header bullet, Current
  state's opening, the Mirrored Surface Checklist's Current-state bullet, and
  Definition of done item 0(d).
- Definition of done item 0(c) and Out of scope's collision bullet: the sibling
  **has landed**, so the dispatch-order precondition is satisfied and the rebase
  this package was told it would own is done. Both were in the future tense.
- Current state's measured-abort 4, whose two line cites (`scratch.js:138` and
  `:139`) became `:174` and `:178`.
- Table C's `pt-only-parse-is-caught` note, which says `extract` is assigned the
  moment the parse returns — still true, now of a four-name destructuring.
- The Implementation note on how to order the change: seven `let` declarations
  above the `try` instead of four, assigned by a parenthesized destructuring.
- The Verification-steps red-proofs line, which gained the note that the run
  must be **unfiltered** — a `--wp`-scoped run is `RUN: FILTERED`, exit 1, by
  construction (`scripts/red-proofs.js:2152-2154`, `:1893`), so it cannot
  satisfy criterion 10. This is the same defect recorded as Erratum 7 of
  `WP-dream-primary-dialogue-collection` and, before that, as erratum 1 of
  `WP-quarantine-failed-preserve-disposal-flush`.
