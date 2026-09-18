---
title: WP-dream-collect-parse-throw-quarantine round zero — the crash, the four aborts, and both directions of every gate
date: 2026-09-17
related_wps: [WP-dream-collect-parse-throw-quarantine, WP-dream-primary-dialogue-projection, WP-dream-primary-dialogue-collection, WP-dream-report-run-skips]
---

# Round zero — WP-dream-collect-parse-throw-quarantine

Internal coherence pass by the drafting architect. The clean-context conformance
read is the orchestrator's and is not recorded here. Nothing below records the
owner approving anything; the spec's three owner items are open.

**Base.** Everything was executed against
`b46a384398a6ff3fa44a463ceb7773b3fd986179` (merge of PR #266), on Node v25.9.0,
macOS. Every fixture was written into a fresh `fs.mkdtempSync` directory; no
real transcript and no real secret was read or written at any point. The
prototype patches described below were applied in the worktree purely to
measure, and reverted with `git checkout -- src/` before the commit; the commit
contains this file and the spec only.

## 1. The crash, reproduced on `main`

A throwaway probe built crafted transcripts in a unique temp directory and
called the shipped entry points. Verbatim output:

```
P1  codex.js extractMessageText, via transcripts.parse():
  parse            : THREW TypeError: Cannot convert object to primitive value
  parseWithOutcome : THREW TypeError: Cannot convert object to primitive value
P1c codex.js extractToolOutputText:
  parse            : THREW TypeError: Cannot convert object to primitive value
P2  claude.js flattenToolResultContent:
  parse            : THREW TypeError: Cannot convert object to primitive value
P2b claude.js assistant text join:
  parse            : THREW TypeError: Cannot convert object to primitive value
P3  codex.js payload.id is a poisoned object:
  parse -> typeof session_id: RETURNED "object"
  scratch.js sanitize(that) : THREW TypeError: Cannot convert object to primitive value

== WHOLE-RUN ABORT: collectExtracts over a directory holding P1 plus three healthy sessions ==
  CONTROL  three healthy sessions -> entries: RETURNED 3
  POISONED three healthy + one crafted  : THREW TypeError: Cannot convert object to primitive value
  POISONED session_id (P3) via collectExtracts: THREW TypeError: Cannot convert object to primitive value
  LONG session_id (P4) via collectExtracts : THREW WienerdogError: refusing to write …/dream-scratch/codex-AAAA….json: could not create a private temp file (ENAMETOOLONG)
```

The control line is the load-bearing one: the same three healthy sessions are
admitted when the crafted file is absent and are **all** lost when it is
present. One file ends the whole run.

The crafted payload in every case is a JSON object with a null `toString`
(`{"toString":null}`). `Object.prototype.valueOf` returns the object and the own
`toString` is not callable, so `ToPrimitive` has nothing to call and throws. A
string, a number or an array coerces silently instead — which is why the
existing fixtures never found this.

## 2. Throwing paths found, and where each is covered

| # | Site | Reached by | Covered by |
|---|------|-----------|-----------|
| 1 | `codex.js:77-83` `extractMessageText` | a `message` payload's `input_text`/`output_text` block with a non-coercible `text` | the fault boundary (Table B row B1); the parser fix is deferred to the successor named in Out of scope |
| 2 | `codex.js:91-95` `extractToolOutputText` array branch | a `custom_tool_call_output` payload's `content` | same |
| 3 | `claude.js:57-66` `flattenToolResultContent` | a `user` record's `tool_result` block content | same |
| 4 | `claude.js:181-184` the assistant text join | an `assistant` record's `text` block | same |
| 5 | `scratch.js:138` `sanitize(extract.session_id)` — **outside the parser** | a Codex `session_meta` whose `payload.id` is a non-coercible object; the parse itself **returns** | the fault boundary. This is the case that decides the boundary's extent: a try/catch around the parse call alone does not cover it |
| 6 | `scratch.js:139` `writeFilePrivate`, `ENAMETOOLONG` | a `session_meta.id` of 4,000 characters | the `sanitize` width bound (Table B row B6), **not** the boundary — the write stays outside it so a full disk still fails loudly |

Checked and found **not** to throw on content: `Buffer.byteLength(JSON.stringify(extract))`
(the value came from `JSON.parse`, so no cycle, no BigInt and no callable
`toJSON` is reachable), the `oversizedExtracts` memo lookup, and
`ledgerLib.fingerprint(d)` (four numbers off the discovery record).
`src/core/transcripts/primary-dialogue.js` already carries the string check this
package's deferred successor would add to the default parsers, and says why in
its own comment — precedent in-tree, not a new idea.

## 3. Both directions of every verification command

A prototype of **exactly this package's Deliverables** (collector side only: the
fault boundary, the bounded `sanitize`, the `INFORMATIONAL_QUARANTINE_REASONS`
entry, the typedef union and the one `GROUPS` row) was applied and reverted.

**The two `grep` gates.**

| State | Result |
|-------|--------|
| compliant (prototype applied) | `ONE SITE OK` / `UNBOUND CATCH OK` |
| violating (`main`, no boundary) | both exit 1 |
| deliverable absent (`src/core/dream/NOPE.js`) | exit 1 — the `test -f` guard is what makes this red rather than green |

**The `node -e` boundary gate**, byte-identical to the spec's block.

| State | Result |
|-------|--------|
| fixture absent | exit 1, `ENOENT … codex-poisoned-text-block.jsonl` |
| fixture present, `main` code | exit 1: `the run ABORTED on a crafted transcript: Cannot convert object to primitive value \| a 4000-character session id ABORTED the run: … ENAMETOOLONG` |
| fixture present, prototype applied | `PARSE-THROW BOUNDARY OK`, exit 0 |

**`npm test`.**

| State | Result |
|-------|--------|
| `main`, baseline | `tests 2878 / pass 2866 / fail 0 / skipped 12` |
| prototype applied | `tests 2878 / pass 2865 / fail 1` — the single failure is `ledger: the decay constants are exported — a 7-day window and the informational reason set`, i.e. `tests/unit/ledger.test.js:485`, which pins `INFORMATIONAL_QUARANTINE_REASONS` exactly. That file is in the Deliverables for exactly this reason, and it is registered in the Mirrored Surface Checklist under Table A row A3. Nothing else in the suite moved — no golden, no dream-collect test, no integration test. |

## 4. Facts measured for the spec's tables, not assumed

- **The `reports/warnings.md` render** printed byte-for-byte what the spec's
  "Exact contracts" block shows, including `displayName`'s case-folding of the
  basename.
- **Banner decay.** `quarantineBannerLine` for a ledger holding one quarantine:
  `read-error` → day 0 `true`, day 8 `false`; `parse-threw` (with the
  `INFORMATIONAL_QUARANTINE_REASONS` entry) → identical; an unrecognized reason
  → day 8 still `true`. `hasFreshInformationalQuarantine` is **not exported**,
  which is why acceptance criterion 8 names the banner rather than the predicate.
- **The run report needs no wording change.** `runSkipSummarySection({newlyQuarantined:1, …zeros})`
  rendered `- 1 session transcript(s) were set aside by this run and will be
  skipped from now on, until they change.` plus the `reports/warnings.md`
  pointer. The bullet is built from the count and names no reason, so a
  `parse-threw` set-aside lands in the `newlyQuarantined` arm with no edit —
  the spec's Table A row A9 confirmed rather than asserted.
- **Retry on change, skip while unchanged** (three consecutive collector runs
  over one crafted rollout, with the ledger carried forward):

```
run1: newlyQuarantined 1 [ 'parse-threw' ] skipped 0
record: {"fingerprint":"259:…","outcome":"quarantined","reason":"parse-threw","updated_at":"…","harness":"codex"}
run2 (unchanged): newlyQuarantined 0 skippedQuarantined 1
run3 (changed):  newlyQuarantined 1 [ 'parse-threw' ] skippedQuarantined 0
```

  The record carries exactly five fields. No part of the caught `TypeError`
  appears in it, because the boundary binds nothing.

- **The RED runner's constraint.** `scripts/red-proofs.js:1655` refuses a red
  whose failure `code` is not `ERR_ASSERTION`. Measured: `assert.doesNotThrow`
  on a poisoned coercion reports `AssertionError` with `code=ERR_ASSERTION`, so
  a criterion whose mutation makes production code throw is provable — but only
  if the test asserts on a value rather than letting the throw escape. Recorded
  in the spec under Table C.

## 5. Open items carried out of round zero

- The three **owner items** in the spec are undecided: whether parser hardening
  joins this package or a successor, whether `parse-threw` is an informational
  (decaying-banner) reason and whether the taxonomy extension wants an ADR-0023
  amendment, and whether the Deliverables may gain `src/cli/doctor.js`.
- **A cross-spec fact this package falsifies.** `WP-dream-primary-dialogue-collection`
  (status `Ready`) states in its Deliverables that `sanitize` at
  `scratch.js:18-20` is **not** changed. Table B row B6 changes it. That spec
  also rewrites the same parse call site and appends to the same test file. The
  architect re-points it; nothing in this package edits it.
- **Scratch filename collisions are a pre-existing residual, slightly widened.**
  `sanitize` maps every byte outside `[A-Za-z0-9_-]` to `_`, so two crafted
  session ids differing only in excluded bytes already collide today and the
  second write overwrites the first. The 128-character bound adds ids sharing a
  128-character allowlisted prefix to that set. Both require a crafted
  transcript; neither is new in kind. Not fixed here, and named in the spec's
  Out of scope neighbourhood rather than silently absorbed.
