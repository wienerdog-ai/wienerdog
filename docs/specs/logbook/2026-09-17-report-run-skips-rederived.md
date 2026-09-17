---
title: A Ready spec outlived the surface it was written against, for the second time
date: 2026-09-17
related_wps: [WP-dream-report-run-skips, WP-dream-filtered-input-budget, WP-quarantine-warnings-file]
---

# A Ready spec outlived the surface it was written against, for the second time

`WP-dream-report-run-skips` was `Ready` and undispatchable. PR #245 merged
`WP-dream-filtered-input-budget`, which rewrote `collectExtracts` underneath it:
equal shares and suffix truncation were retired, and the collector's exclusions
became five disjoint arms where the spec had assumed three causes and one
truncation category. The spec has been returned to `Draft` and re-derived against
`main` at `b4af715e`.

This is the same failure the 2026-08-30 entry recorded for
`WP-quarantine-banner-decay`, and the second time it has hit **this** spec: the
previous revision carried an explicit PROVISIONAL mechanism because the promotion
family was rewriting its surface. That mechanism worked — the markers named
exactly the rows that moved, and the rewrite landing is what discharged them. It
did not protect the rows it did **not** mark. The stale statements this round were
almost all in rows marked **STABLE**.

## What went stale, by class

1. **Statements of what the code contains.** `sel.truncated` is now the literal
   `[]` and `truncatedToFit` the literal `false`, so the "truncated sessions are
   not counted" row described a category that cannot occur, and the
   "truncated-but-consolidated" acceptance criterion was unsatisfiable.
2. **Statements of what a number means.** `sel.dropped.length` was the spec's
   whole `capacityDeferred` count. It is now the capacity stop alone; three other
   exclusion arms — oversized, deadline, incomplete read — would have gone
   uncounted while the report claimed to account for the run.
3. **Statements about a negative record's absence.** "A capacity-deferred
   transcript carries no ledger record at all" stayed true for `deferred` and
   became false for `oversized`, which now memoises its measurement in the
   ledger's `oversizedExtracts`. The pointer rule that rode on that sentence
   survived only because its real ground was "is it a *quarantine* record", not
   "is there any record".
4. **Line citations under a rewritten file.** The console line at
   `src/cli/dream.js:410-415` is deleted; the adopt-with-history return at
   `:467-470` moved to the idle branch.

## The class that generalises

A **STABLE** marker is a claim about which *specs* list a file, not about which
*commits* touch it. `src/core/dream/scratch.js` was marked stable because
`WP-dream-promote-in-workspace`'s Out of scope said the promotion rewrite did not
modify it — which was true, and irrelevant, because a different work package in a
different family rewrote it. **A marker that names the packages expected to move a
file is not a guard against the packages nobody thought of.** The guard that would
have caught this is the one the runbook already states: re-run the spec's
executable Current-state claims against `main` at dispatch, whatever any marker
says.

## Two things the re-derivation found that were not spec rot

- **`reports/warnings.md` cannot name an oversized session**, and that is by
  design: ADR-0023 Amendment 3 deliberately introduces no new quarantine reason
  for the oversized arm, and the warnings renderer reads quarantined `files`
  records alone. So an individually oversized transcript — one skipped every
  night until its file or `dream_max_input_bytes` changes — has no durable surface
  at all today. The re-derived spec closes that with a report bullet naming the
  setting; changing the warnings file is out of scope and nothing is filed for it.
- **The default `dream_max_input_bytes` (8,000,000) is below the parser's
  worst-case single extract** (`MAX_MESSAGES` 2000 × `MAX_MSG_CHARS` 4000, plus
  per-message JSON scaffolding, plus UTF-8 expansion), so the oversized arm can
  fire on a session that broke no cap. Routed to its own work package and ADR
  question under the spec's "Discovered issues"; nothing is filed.
