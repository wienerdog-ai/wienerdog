---
date: 2026-09-15
related_wps: [WP-dream-filtered-input-budget]
---

# Dream preprocessing: proposed design package

## Purpose and status

Prevent avoidable loss of session content without making preprocessing resource
use unbounded. The owner agreed to assemble the basic package before measuring
numeric defaults. This note records that package and its remaining decisions;
it is not an implementation spec or owner sign-off on an ADR amendment.

The earlier independent review approved the draft that preserved the 200 MiB
aggregate raw-read cap. It does not approve the changed work-budget policy
below. The implementation WP remains Draft pending refinement and review.
The [Fable 5.1 feedback](2026-09-15-dream-filtered-input-budget-fable-51-feedback.md)
records the alternatives and their evidence limits.

## Proposed operating rules

| Concern | Rule | Scope of the guarantee |
|---|---|---|
| Final dream content | Keep the existing configured X (`dream_max_input_bytes`). Allocate it from complete filtered extract demands, including metadata, using the existing compact-JSON byte metric. | The final selected compact-JSON sum is at most X. Pretty-printed storage and the model's whole context are different measures. |
| Avoidable truncation | Measure demands before distributing capacity. Preserve the existing equal-share policy over the admitted set; if its full filtered content fits X, keep it whole. | Admission may be limited by preprocessing resources. This is not a claim that an arbitrary historical corpus fits one run. |
| Resident memory | Process one session at a time, release its content before retaining another session, and keep only corpus metadata resident. Preserve individual file/record guards. | Total raw bytes processed do not determine peak resident memory. The per-message caps currently apply after the harness parser accumulates one session; do not treat them as an earlier memory guard. |
| Temporary disk | Use private, run-local storage for measured extracts. Give it its own explicit space budget; it may exceed X. | Account for actual simultaneous storage, including preparation/final-output overlap and temporary publication copies. A chosen value must permit useful single-session progress; a too-large extract cannot be silently put in an endless retry loop. |
| Preprocessing work | Control the work separately from X and memory. Prefer the admission-deadline proposal below; decide whether a larger aggregate raw-byte guard adds value after measurement. | Do not retain 200 MiB merely by labelling it a memory requirement, and do not derive the work budget from X without a reason. |
| Result ownership | Build `entries`, `wrote`, and `processed` from final selected extracts only. Remove intermediate/unselected files before exposing scratch to the brain. | Staging a file does not mean the dream consumed it. Existing downstream successful-run and secret-disposition gates remain necessary. |
| Retry | Capacity-deferred or unfinished sessions get no processed record. Keep already completed usable work when the admission budget is exhausted. | No global backlog-drain guarantee under sustained arrivals at or above processing capacity. Newest-first priority retains that existing trade-off. |

## Work-budget recommendation: stop admission between sessions

Prefer a **soft preprocessing admission deadline** for the first version:
do not start another session after the deadline; finish the already-started
session, including parsing, redaction and staging, then allocate/finalize the
completed set. Use a monotonic elapsed-time source.

This is a refinement of the earlier mid-session-stop suggestion. Repeatedly
discarding a session at the same deadline can prevent it ever finishing.
Completing the current individually bounded session avoids adding persistent
partial-session checkpoints solely to make ordinary budget expiry progress.

The trade-off is explicit: **the admission duration is not a hard completion
timeout**. Finishing the current session and finalizing the selected output can
run beyond it. A hard wall-clock guarantee needs a separate interruption and
progress contract; this package does not claim one. Unexpected process failure
still leaves uncommitted work retryable under the existing lifecycle.

Likewise, a pure time policy makes the admitted set depend on machine load.
Preserve deterministic allocation for the same measured admission set, not an
unconditional claim that separate timed runs select identical sessions. A
hybrid time/byte policy does not eliminate this distinction.

## Decisions to finish before an implementable spec

| Decision | Evidence or ruling needed |
|---|---|
| Preprocessing admission duration | Measure representative per-session parsing, redaction and staging time, and the slow-session tail. Judge the acceptable overrun of the soft policy. |
| Temporary-disk budget and exhaustion behavior | Measure staged/final overlap and check large permitted extracts. Bound disk without an oversized candidate retrying forever. If an admission cut excludes older small sessions, make that trade-off explicit. |
| Optional aggregate raw-byte guard | Compare raw volume, duration and completed useful work. Keep a larger byte guard only for a named workload/resource benefit; choose neither the historical 200 MiB nor Fable's example values by inheritance. |
| Configuration surface | X keeps its current setting. Decide whether the new work/space limits are internal defaults or user settings; this note does not add knobs. |

A short, isolated local sizing experiment can inform these choices; several
nights of production operation are not a prerequisite for describing the
design. Record time, raw bytes, filtered demand, temporary-disk peak, selected
bytes and deferrals without recording transcript content. Sizing evidence is
separate from correctness tests. No production telemetry or logging change is
implied by an experiment.

## Boundaries and next artifact

Keep historical recovery, durable extract caches and partial-session ledger
checkpoints outside this first package. Genuine filtered-content overload may
still require the existing truncation policy; its processed semantics remain
an explicit owner decision, not a new losslessness promise.

Reject the one-pass provisional-share shortcut: it can trim an early session
before learning that the later sessions leave enough space. It fails the
avoidable-truncation rule above.

After the open decisions are resolved, revise the WP and ADR amendment scope
together, including any parser/clock/config/test deliverables the chosen policy
requires. Its current permission boundary covers only the earlier collector
change and is insufficient for changing the streaming reader's work limit.
Run the design review on the revised contract before Ready and dispatch.

## Lesson

- WP-dream-filtered-input-budget: bound model input, resident memory, temporary
  disk and preprocessing work separately. A soft admission deadline and a hard
  completion timeout make different promises; name which one is being built.
