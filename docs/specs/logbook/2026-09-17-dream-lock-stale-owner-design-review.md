---
date: 2026-09-17
related_wps: [WP-dream-lock-stale-owner-loud, WP-dream-live-owner-lock]
---

# Design review round 1 — dispositions

Independent design gate, reviewed tip `0cb0d2f2`, verdict `needs-attention`,
four findings, no routed scope objections. Raw artifacts are committed beside
this entry as `2026-09-17-dream-lock-stale-owner-design-r1-raw.json`, `-focus.txt`
and `-meta.txt`. All four findings were accepted as sound. Nothing below records
an owner decision; the work package stays `Draft` with its owner items open.

| Finding | Band | Weight | Disposition | Rationale |
|---|---|---|---|---|
| R1-A1 — the pre-boot test is not proof that the probed owner is dead | A | heavy | **Fix by removal** | Nothing binds `startedAt` to the PID the probe found. A copied or backup-restored lock carries a genuine pre-boot timestamp while its PID names a running dream, and a forward clock step has the same effect — so the previous S4's "wrong only when uptime under-reports" claim was false. A wrong takeover puts two dreams on one scratch directory, and the pipeline consults `ownsLock` only before teardown, never before promotion. Once the stall is loud, takeover is a convenience and a wrong takeover is the worse failure. The boot proof, `os.uptime`, the 60 s margin, two owner items, their criteria and their ADR paragraphs are gone. |
| R1-B1 — a quiet decline prevents the hourly catch-up from observing the bound | B | heavy | **Fix the claim, keep the mechanism** | A within-bound `busy` exits 0, so the supervisor writes `last_success` and `catchUp` skips the job for the rest of that schedule day. The old "reported no later than the 10:00 catch-up" claim was wrong. The spec now walks the crash → reboot → same-day catch-up → next-night timeline explicitly and states the real cost: at most one lost night, then loud every hour. The six-hour bound is re-justified on what actually brackets it — above any live overrun a same-day contender can witness, below ~24 h so the next nightly run trips it. No new supervisor-visible outcome; `src/cli/run-job.js` is untouched. |
| R1-B2 — the byte-exact message is discarded before the durable alert and email | B | heavy | **Narrow the claim** | Verified: the child's stderr is piped to the per-run log and every non-zero exit becomes the generic `job "dream" exited 1` (`src/cli/run-job.js:1237`), with a `log_hint` of `~/.wienerdog/logs/dream/`. The message now declares that surface truthfully — the log and an attended run's terminal — and notes it is the same surface the existing `owner-unknown` throw has. The recovery instruction was rewritten for a non-developer: restart the computer, which *guarantees* no dream is running rather than merely observing it, then delete the named file. A structured reason channel for `run-job` is routed onward, not built. |
| R1-B3 — a valid huge deadline defeats both takeover and loudness indefinitely | B | heavy | **Fix, minimally** | `readDreamConfig` accepts any finite positive `dream_timeout_minutes`, and a crafted or copied record can claim any future deadline; either way the lock reads as unexpired and every run exits 0. A finite deadline further ahead than `max(24 h, 2 × the contender's own timeoutMs)` is now refused as `owner-unknown` — the existing loud path, no new reason code. A self-consistent installation cannot trip it; the one real cost (a timeout cut to less than half while a lock is in flight) is priced in an owner item. Inner-vs-outer timeout policy is routed onward, not reconciled here. |

## What the round cost, and the cheaper question

Both heavy findings against the boot proof and the alert-latency claim share one
root: **a mechanism was designed before its delivery path was traced end to
end.** The proof was reasoned about at the level of "is this evidence true?"
rather than "what binds this evidence to the thing it judges?", and the alert was
reasoned about at the level of "does it throw?" rather than "who reads the bytes,
and when?". Tracing the consumer first would have found all three of A1, B1 and
B2 before drafting.

The round-zero lesson recorded in the sibling entry generalises the same way: a
surface is not registered until you have walked it. Here the surfaces were a
supervisor's watermark, a catch-up predicate and an alert reason — none of them
in the spec's own Deliverables, all of them load-bearing for its claims.

## Resulting shape

Size drops from M to S. `tests/unit/dream-pipeline.test.js` leaves the
Deliverables table: with the boot proof gone the only CLI-level behavior left is
the decline branch, which the integration suite already owns end to end. Table S
is seven rows (result shape, `staleForMs`, implausible-deadline refusal, the
loud gate, the message and its real delivery surface, the exit-code doc-comment
errata, the ADR amendment). Six owner items remain, renumbered.
