---
date: 2026-09-15
related_wps: [WP-dream-filtered-input-budget]
---

# Dream preprocessing: design package

## Purpose and status

Prevent raw transcript volume from wasting the configured useful-content
capacity. The owner accepted the operating rules below, including the final
whole-session overflow distinction. Numeric defaults and oversized-session retry
invalidation remain open. This is not final approval of the implementation
spec or its ADR amendment; the WP remains Draft.

The earlier independent review approved a different proposal: filtered-demand
equal shares with the existing 200 MiB aggregate raw-read cap. That verdict does
not cover this revision. The historical
[Fable 5.1 feedback](2026-09-15-dream-filtered-input-budget-fable-51-feedback.md)
records advice and alternatives, not approval of the current policy.

## Accepted operating rules

| Concern | Rule | Scope of the guarantee |
|---|---|---|
| Useful-content budget | Keep X (`dream_max_input_bytes`). Charge complete filtered extracts, including metadata, using the existing compact-JSON byte metric. | Selected content is at most X. Pretty-printed disk bytes and the model's entire context are different measures. |
| Selection | Process one eligible session at a time, newest first. Admit its complete filtered extract if it fits the remaining space. Stop as soon as selected bytes equal X, even if time and sessions remain. | Do not preprocess the entire corpus before selecting content. Existing parser filtering, redaction and message caps remain unchanged. |
| Remaining-space overflow | If an extract is at most X but exceeds the remaining space, omit that entire session from this run and stop preprocessing. | Use the already selected content; leave the omitted session unprocessed for a later run. Do not search older sessions for a smaller fit. Spare capacity is an accepted trade-off. |
| Individually oversized session | If the filtered extract itself exceeds X, report it, skip it and continue older sessions while time remains. Never mark it processed. | It must not block the entire backlog. The retry/invalidation rule remains open; avoid both repeated futile parsing and permanent exclusion after relevant changes. |
| Resident memory | Release one session's parsed content before retaining another; retain corpus metadata and selected files on disk. Preserve individual intake guards. | Aggregate raw bytes are an I/O/work measure, not peak memory. Message caps currently apply after a harness parser has accumulated a session. |
| Temporary disk | Keep private selected extracts plus bounded current-session/finalization overhead. Remove intermediate or unselected files before the brain can inspect scratch. | There is no corpus-wide staging set. Physical disk accounting includes pretty JSON and any overlapping copies; X alone is not a literal disk ceiling. |
| Preprocessing work | Use a soft admission deadline: after expiry start no new session; finish the current session, including redaction, and apply the same content admission rules. | This can overrun by the current session and finalization. The duration and any additional aggregate byte guard remain undecided. |
| Persistence | Only final selected extracts enter `entries`, `wrote` and `processed`; existing successful-run and secret-disposition gates still apply. | Ordinary capacity or deadline exclusions create no processed record and no partial-session checkpoint. |

## Concrete stopping examples

Use decimal bytes here to avoid mixing MB and MiB:

- X = 8,000,000; selected = 7,000,000; next extract = 2,000,000:
  omit the next session, stop preprocessing, dream the selected 7,000,000.
  The omitted session can fit a later run's empty budget.
- X = 8,000,000; selected = 0; next extract = 9,000,000:
  report and skip that session. Continue to older eligible sessions if time
  remains, since the skipped session cannot fit even an empty budget.
- X = 8,000,000; selected = 7,000,000; next extract = 1,000,000:
  admit it whole and stop at exactly X.
- The deadline expires during a session: complete parsing and redaction, then
  admit, omit-and-stop, or skip it according to the same size rules. Start no
  subsequent session. Already selected content remains usable.

These rules replace equal-share allocation, budget-induced suffix truncation
and the earlier proposal to measure/stage all candidates before allocation.
A whole filtered extract can still reflect the parser's existing caps; this
is not a promise that every original transcript message survives filtering.

Newest-first priority is deliberate, including during onboarding. Defaults
should leave useful catch-up capacity, but the older backlog drains only when
processing capacity exceeds new/changed eligible demand on average. There is
no catch-up guarantee under sustained overload.

## Deadline meaning and repeatability

Use monotonic elapsed time. The deadline limits how long a run keeps starting
new preprocessing work. It is independent of the later model-call timeout.
Finish an already started, individually bounded session including post-parse
redaction; a streaming-read deadline alone would not cover that work.

The deadline is not a hard completion timeout. A hard timeout would need a
separate interruption/progress contract. Unexpected process failure follows
the existing cleanup and retry lifecycle; no partial-session state is added.

With identical inputs, eligibility, settings and admission clock decisions,
selection and output remain deterministic. Real timed runs can admit different
sets under different machine load. Adding a raw-byte guard does not remove
that distinction.

## Decisions to finish before an implementable spec

| Decision | Evidence or ruling needed |
|---|---|
| Oversized retry/invalidation | Define when an unchanged extract known to exceed X is retried. Source fingerprint, X changes and extractor changes are relevant candidates; no exact persistence scheme or trigger set has been chosen. Specify diagnostics and ownership alongside the state contract. |
| Admission duration and clock boundary | Measure representative per-session parsing/redaction time and the slow-session tail; choose an acceptable overrun. Define exactly where timing starts and how it reaches the collector. |
| Optional aggregate raw-byte guard | Keep one only for a named I/O/work benefit and specify exhaustion/progress semantics compatible with finishing the current session. Do not inherit 200 MiB as a supposed memory requirement. |
| Configuration surface | X keeps its setting. Decide whether the work limit is an internal default or a user setting; no additional knobs have been accepted. |
| Physical storage bound | Check selected pretty JSON plus current-session and finalization overlap. Reassess any need for a separate guard under sequential admission; the earlier corpus-wide staging proposal is superseded. |

A short isolated sizing experiment can inform numeric defaults after the
behavior contract is settled. Multiple production nights are not required to
form this package. Measure timing, raw bytes, filtered bytes and disk peak
without recording transcript content; this does not authorize production
telemetry or a logging change.

## Boundaries and next artifact

No partial-session checkpoints, historical recovery, durable extract cache or
new content-filtering path. Oversized eligibility metadata, if chosen, is a
separate unresolved contract, not permission to store partial transcript state.

The WP now records these accepted rules. Its Deliverables and exact interface
changes remain provisional until the open decisions are resolved. Finalize
stream/clock/configuration/reporting/ledger/test ownership as needed and update
the ADR amendment scope together. Obtain a fresh design review and final owner
sign-off before Ready and dispatch. Earlier raw reviewer evidence stays intact.

## Lesson

- WP-dream-filtered-input-budget: stop preprocessing when the selected useful
  content reaches its budget. Distinguish a session that cannot fit the remaining
  space from one that can never fit the whole budget; they need different
  stopping and retry behavior.
