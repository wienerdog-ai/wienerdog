---
date: 2026-09-15
related_wps: [WP-dream-filtered-input-budget]
---

# Dream preprocessing: architect design package

## Status and contract owner

The owner accepted whole-session admission, newest-first priority, the overflow
distinction and finishing a started session after the soft deadline. The
architect has now made the remaining choices concrete as proposals for review.
They are not owner approval. The WP remains Draft.

The canonical contract is Table A in
[WP-dream-filtered-input-budget](../WP-dream-filtered-input-budget.md).
This note summarizes it. The earlier independent equal-share design verdict
and historical [Fable 5.1 advice](2026-09-15-dream-filtered-input-budget-fable-51-feedback.md)
do not approve this revision.

## Accepted behavior

| Concern | Summary of the WP contract |
|---|---|
| Content limit | Keep X, measured as compact JSON bytes of the complete filtered extract including metadata. Selected content never exceeds X. |
| Order | Process newest eligible sessions first, one at a time. Keep whole filtered extracts; existing parser caps remain. |
| Exact fit | Admit the session and stop immediately at X. |
| Remaining-space overflow | If the session fits X but not the remainder, omit it from this run and stop. Use already selected content. The omitted session remains unprocessed. |
| Individually oversized | If a whole filtered extract exceeds X, report and skip it, then continue older candidates while time remains. |
| Deadline | Start no new session after expiry. Finish the current session including redaction, then apply the same admission rules. |
| Storage | Keep selected private scratch files plus bounded current-session work, not an all-corpus extract cache or staging set. |
| Progress | No budget-induced truncation or partial-session checkpoint. Existing successful-run/secret gates own processed records. |

For X=8,000,000 and 7,000,000 selected, a 2,000,000-byte next session is omitted
and collection stops. A 1,000,000-byte next session fits exactly and also stops
collection. A 9,000,000-byte session is skipped and permits older candidates.

This replaces equal shares, suffix truncation and measuring/staging the entire
corpus before allocation. Newest-first priority is intentional. Backlog catch-up
requires capacity to exceed new/changed demand on average.

## Concrete proposals requiring owner sign-off

| Proposal | Choice | Trade-off |
|---|---|---|
| P1 — duration/configuration | 60-second soft admission allowance, configurable via dream_preprocess_timeout_seconds. Time begins at collector entry, including discovery and setup; use a monotonic clock. | This is a policy judgment, not a measured guarantee. A slow current session can overrun it. The later model timeout remains separate. |
| P2 — raw work | Remove the aggregate 200 MiB cap across sessions; give each session a fresh existing finite read budget. | Its 200 MiB now bounds emergency per-session read work. The 50 MiB pre-read ceiling and other individual guards remain. No new reader behavior or extra work knob. |
| P3 — oversized retry | Keep only oversized-size metadata in an optional part of the existing ledger, separate from processed/quarantine records and secret counters. | Retry after source fingerprint or application-version changes, or when X can fit the previously measured bytes. No expiry or stored transcript content. Same-version development/runtime changes are an explicit limitation. |
| P4 — diagnostics | CLI reports separate counts for capacity, time, oversized and incomplete-read exclusions. A real run with no admitted input and such exclusions fails with an actionable message; dry-run only diagnoses. | Keeps the existing durable job-failure channel for zero progress. Full dream-report work stays in its own WP. |

Lowering X or increasing it insufficiently need not reparse a session known to
exceed it. The memo stores a size independent of X. Missing/malformed metadata
causes fresh parsing. A normal run persists changed measurement metadata even if
the later brain fails; dry-run does not persist it. Successful/secret-exhausted
ledger decisions still take precedence.

No representative timing measurement has been used to justify 60 seconds. A
small isolated sizing experiment can tune that policy later; neither production
telemetry nor multiple production nights are needed to review the basic design.

## Boundaries and limitations

The revised WP names collector, config, ledger, CLI and their test owners, plus
documentation-only parser/stream changes and narrow ADR-0023/ADR-0012 amendments.
Its implementation remains one coherent M-sized work package.

The 50 MiB ceiling uses discovery metadata. The existing reader's live-append
and exhaustion/EOF behavior is inherited; no snapshot or stronger source-stability
claim is added. A soft deadline is not a maximum total-runtime guarantee.

The pending WP-dream-report-run-skips still reads capacity-only dropped counts.
Its own pre-dispatch check must revisit new deadline/oversized/read categories
before claiming complete reporting. This is not permission to implement that
sibling's report work here.

## Next gate

Run a fresh independent design review of the complete proposed contract. Record
findings and dispositions, obtain owner decisions P1–P4 and ADR ratification,
then mark Ready and re-verify source claims at the dispatch revision. Historical
review raw artifacts remain unchanged.

## Lesson

- WP-dream-filtered-input-budget: a session exceeding the remainder needs a stop
  and later retry; one exceeding the entire budget needs a skip and meaningful
  invalidation. Keep those outcomes separate from time exhaustion.
