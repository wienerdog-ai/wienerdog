---
title: The Mirrored Surface Checklist becomes a canonical table (WP-dream-promote-module)
date: 2026-08-30
related_wps: [WP-dream-promote-module, WP-dream-promote-report, WP-dream-promote-in-workspace]
---

<!-- markdownlint-disable -->

# ADR-0031 extraction of the Mirrored Surface Checklist

## Why

The PR-review gate landed findings INSIDE `### Mirrored Surface Checklist` in
three consecutive rounds (round 4's finding 2, round 5's findings 1 and 2). The
gate's own reading, which the owner accepted: neither of the round-5 findings is
a thinking error. A stale mirror list and an undercounted mirror set are what a
~250-line hand-maintained prose registry produces. The section IS the
contract-dense prose ADR-0031 says to extract. Raw output:
`docs/specs/logbook/2026-08-30-promote-module-pr-gate-round-5-wd-reviewer-raw.txt`.

## What changed

21 bulleted paragraphs became a 21-row canonical table, ids `MS-01`–`MS-21`,
columns: **contract registered / mirror set / prohibitions / walk state**. Item
positions map to ids in order, so the gate's mechanically-verified `1, 2, 3, 4,
13, 16` are `MS-01`–`MS-04`, `MS-13` (*Table Q*) and `MS-16` (*Table S*).

**The arithmetic is now DERIVED, not asserted beside the data.** The tick boxes
are gone; the Walk-state column is the only record of a walk, and the section
preamble carries the three greps that produce 21 / 6 / 15 from it. Those greps
are anchored on `^| MS-` specifically so that the preamble's own text cannot
match itself — the first draft was not anchored and self-counted to 7 / 16.

Three findings folded in, values not re-derived:

1. **`MS-13`'s cross-package criterion citation.** Was "its criterion asserting
   Q3, Q8 and Q10", which names no criterion `WP-dream-promote-report` contains.
   Now "rows Q1–Q3, Q8, Q9 and Q10" with the file:line. The walk paragraph one
   screen below had already carried the true value for a round.
2. **The `date` registry-gap paragraph** claimed the row had "one mirror".
   Corrected to the enumeration: three surfaces CITE the row, and its literal
   content lives in the deliverable code as the pattern and the error message,
   asserted in the test. Adds no row — the paragraph is prose.
3. **Round 5's finding 3 (band C, explicitly the architect's call): FIXED.** The
   rule that was applied to `promote.js` one round earlier is now applied to the
   canonical it mirrors, and to the second surface in the same section that the
   original fix missed. The rule is registered on `MS-13` so it does not have to
   be rediscovered: *no block that DISCLAIMS restating row Q9 or Q10 may narrate
   a named field's filler or its moment in the same breath.* It binds disclaiming
   blocks only — Table Q's preamble DECIDES the provenance and an acceptance
   criterion ASSERTS it, and neither disclaims. The two typedefs name no
   individual field and stand.

## Two owner-calls deliberately NOT discharged

Both are recorded in the section rather than quietly resolved, because either
would change the owner-fixed six-of-twenty-one arithmetic or mis-file a contract:

- **`docs/GLOSSARY.md`** carries TWO contracts — the EP2 outcome taxonomy (which
  is `MS-11`'s) and the gates' input split (which is Table D's, and no row owns
  it). The old gap paragraph routed registration to "the next architect touch of
  the EP2 taxonomy item"; this pass was that touch and declined, because
  registering the whole file on `MS-11` files a gate-input claim under a taxonomy
  row, and a new row breaks the arithmetic. The paragraph now says so.
- **Table D's `date` row** stays unregistered for the same arithmetic reason,
  with its enumeration now correct.

## `scripts/mirror-walk.js` cannot read the table yet

The walker (unmerged, branch `tools/mirror-walk`) recognises a checklist entry
only by a leading `- [ ]` / `- [x]` bullet, so the table parses as ZERO entries.
It fails LOUDLY rather than silently — the vacuity guard exits 1 on
`--scope promote-module` and `--list` errors — which is the design working.

Measured on a scratch copy: teaching `checklistEntries` to treat the delimiter
row as the table's opener, every subsequent pipe row as one entry, and the first
blank line as the closer makes all 21 rows resolve, with **zero** unresolved
references and the reverse index (`--surface Q10`, `--surface S`) answering
correctly. Two pre-existing extraction gaps are unchanged by the form: `Q1–Q3`
yields only `Q1` (the en dash stops the run) and a bare `Q4's` is not extracted
at all. The known `stripFindingIds` defect is also unchanged — but a table cell
boundary `|` terminates its runaway match, which the prose form did not offer.

That script is outside this package's Deliverables; the fix belongs on its own
branch and its own gate.
