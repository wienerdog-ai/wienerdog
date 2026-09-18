---
date: 2026-09-18
title: "Re-pinning WP-dream-primary-dialogue-collection to b46a3843 after #264 and #266"
related_wps: [WP-dream-primary-dialogue-collection, WP-dream-primary-dialogue-projection, WP-dream-report-run-skips]
---

# Re-pinning the collection spec after two sibling merges

Two merges moved code this `Ready` spec cites. **PR #264**
(`WP-dream-report-run-skips`) edited `src/core/dream/scratch.js`,
`src/core/dream/promote.js`, `src/cli/dream.js` and
`tests/unit/dream-collect.test.js`. **PR #266**
(`WP-dream-primary-dialogue-projection`, merge `b46a3843`) edited
`src/core/transcripts/{claude,codex,index}.js` and **added**
`src/core/transcripts/primary-dialogue.js`.

Every cite was re-derived **by construct** at `b46a3843` — locating the
construct and checking both ends of each range, never adding a delta to the old
number. **The spec stays `Ready`: this is a mechanical re-pin with no contract
change.** The reasoning for that verdict is at the bottom.

## `src/core/dream/scratch.js`

| Construct | Before | After |
|---|---|---|
| `collectExtracts` whole function | `:46-157` | `:46-173` |
| eligibility filter | `:54` | `:56-64` (now a loop that also counts quarantine skips) |
| pre-read ceiling split | `:57-60` | `:67-70` |
| newest-mtime-first sort | `:61` | `:71` |
| oversized-memo prune | `:66-74` | `:76-84` |
| scratch recreate | `:76-78` | `:87-88` |
| admission loop | `:88-140` | `:98-150` |
| capacity stop, `remaining === 0` | `:91-94` | `:101-104` |
| preprocessing deadline | `:95-98` | `:105-108` |
| oversized memo hit | `:102-105` | `:112-115` |
| non-`ok` parse → quarantine | `:110-113` | `:120-123` |
| `parse.runExhausted` → read-deferred | `:114-117` | `:124-127` |
| `parseWithOutcome` call | `:109` | `:119` |
| **the admission measurement** | `:118` | **`:128`** |
| fresh oversized measurement | `:119-123` | `:129-133` |
| oversized memo write | `:120` | `:130` |
| capacity overflow, `extractBytes > remaining` | `:124-127` | `:134-137` |
| scratch filename / `sanitize` call | `:128` | `:138` |
| **the scratch write** | `:129` | **`:139`** |
| `sanitize` definition | `:18-20` | `:18-20` (unchanged) |
| `startedAt = now()` | `:50` | `:50` (unchanged) |

## `src/cli/dream.js`

| Construct | Before | After |
|---|---|---|
| `extractsBySession` rebuild | `:1042-1049` | `:1043-1049` |
| map handed to `promote` | `:1050-1064` | `:1050-1064` (unchanged) |
| `printPlan` / its byte line | `:136-159` / `:154` | unchanged |
| `scratchIntact` guard | `:995-1000` | unchanged |
| capacity-stop console line | `:782-783` | unchanged |
| `cleanScratch` in the `finally` | `:1328` | **`:1339`** |

`src/core/dream/validate.js` and `src/core/dream/promote.js` were not moved by
either merge in any cited construct: `invocationWindowTainted` `:510-527`, the
ledger checks `:631-649`, the refusal reason `:646-648`, `tier3Decision`
`:191-216`, and `promote.js:1386-1394` / `:1397-1400` all resolve unchanged.

## What the merges added, and why none of it is a contract change

- **`skippedQuarantined` is a new field on the collector's return**, so the
  spec's `collectExtracts` JSDoc block gained it. It counts files whose
  `selectState` answered `skip-quarantined` — **files never selected**, not a
  sixth exclusion arm over admitted candidates. Row C1's "five exclusion arms"
  and row C1a's regime argument are untouched, and row C1's byte-policy
  equivalence is stated over the arms, not over this count.
- **The report section #264 added** renders counts the collector already
  returned. It reads no field this package changes and asserts nothing about the
  admitted set, so row C1a's "its bullets count what *this* run classified"
  reading still holds.
- **The sibling entry point ships exactly the shape Table C consumes**:
  `parsePrimaryWithOutcome(entry, budget)` → `{extract, gateExtract,
  intakeBytes, parse}` (`src/core/transcripts/index.js:253`). Every "will
  return" in the spec is now the present tense, and
  `src/core/transcripts/primary-dialogue.js` exports exactly one thing,
  `createPrimaryProjection(harness)`.
- **Row C4's eviction rule re-checked against the code as it now stands.** The
  filename is still built by `sanitize(extract.session_id)` at `:138` and the
  write is still the same call at `:139`, so two ids that sanitize to one
  filename still collide, the same path still lands in `wrote` twice, and
  `dream.js:1043-1049` still rebuilds the map from the surviving file only. The
  eviction rule reproduces that, unchanged.
- **AC7's measurement re-checked.** It compares the base commit's collector with
  this package's over one corpus and reports each run's regime. Nothing in
  either merge changes what a regime is or how it is observed; the only
  difference is that the baseline is now `b46a3843` rather than `c94e0e66`.

**Verdict: `Ready` stands.** No row's facts moved — only the line numbers under
them, and one additive field on a return shape the spec documents.
