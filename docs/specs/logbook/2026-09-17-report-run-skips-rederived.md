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
`main` at `047a202c`.

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

## Round-zero conformance, same day

The re-derived spec failed a clean-context template-conformance read on two
points, both fixed in the follow-up commit — and both are the same failure mode
as the rot above, one level up: **a tailored surface that is content-equivalent to
the template's is not mechanically equivalent to it.**

1. The Mirrored Surface Checklist had eleven tailored bullets and no literal
   `Operative prose steps that apply it`. The prose WAS registered — under bullets
   named "Implementation notes" and "Out of scope" — but a reader matching the
   template's five literal bullets could not see that, and a reader matching by
   meaning had to decide it. Fixed by leading with all five template bullets in
   the template's wording, walking the operative-prose one in document order with
   the row each step applies, and folding the two bullets that duplicated it. The
   four claim-scoped registers that remain are relabelled `CLAIM REGISTER` and
   state that they introduce no surface, so nothing is registered twice.
2. The literal `### Contract table(s)` heading had been replaced by three named
   `### Table A/B/C` headings. Both shapes exist under `docs/specs/done/`:
   `WP-dream-denied-object-disposal` keeps the literal heading with `#### Table …`
   beneath it, and `WP-dream-promote-in-workspace` keeps it with an explicit
   `N/A — … three NAMED canonical tables` body. Followed the former.

**The rule both point at:** when a tailored surface replaces a template one, keep
the template's literal token and put the tailoring underneath it. Conformance is
read mechanically; equivalence that only a careful human can see costs a round.

Also recorded so it is not repeated: a temp file was written as `gate.sh` into the
session scratchpad **root** and overwrote the orchestrator's driver of the same
name. Temp files belong in a uniquely named subdirectory of the scratchpad.
