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

## Round 2 — dispositions

Reviewed tip `94b77b9a`, verdict `needs-attention`, three new findings, no routed
scope objections. The round confirmed the round-1 repairs held: R1-A1's takeover
mechanism is genuinely gone, the latency timeline is accurate for an
already-expired lock, the message-surface narrowing is correct, the ADR block
does not contradict Table L, and every cite resolves. Raw artifacts are committed
beside this entry as `2026-09-17-dream-lock-stale-owner-design-r2-raw.json`,
`-focus.txt` and `-meta.txt`. Nothing below records an owner decision.

| Finding | Band | Weight | Disposition | Rationale |
|---|---|---|---|---|
| R2-A1 — restart-then-delete can delete a newly acquired live lock | A | heavy | **Fix the instruction** | The reviewer's own trace carries the cure: after a restart the recorded PID is normally gone, so the next scheduled or catch-up run probes `ESRCH` and Table L5's existing takeover clears the lock unattended. The restart is usually the whole fix, and the deletion — which `RunAtLoad`, `Persistent=true` and `StartWhenAvailable` can race — was both unnecessary and the only destructive step. The message now says: how long it has been held; restart, and Wienerdog normally recovers by itself; delete the named file **only if the same message reappears afterwards**, at a time when no dream is about to start. Why that is safe enough is reasoned in Table S5: a reappearing message means the contender that printed it got `busy`, which by L4 means it neither acquired nor modified the record, so the file is still the dead owner's. The remaining race — squatter exits, contender takes over, user deletes a live record — is named as a residual and priced in O4. An attended conditional-recovery command is routed onward; no scheduler-disable procedure is prescribed, because telling a non-developer to disable and re-enable an OS schedule entry is a larger hazard than the race it removes. |
| R2-B1 — the deadline cap still inherits the unbounded timeout | B | heavy | **Fix** | `readDreamConfig` puts no maximum on `dream_timeout_minutes`, so `max(24 h, 2 × timeoutMs)` inherits that: a twenty-day timeout leaves a twenty-day deadline below the cap and the stall stays silent for twenty days, and the multiplication can overflow to `Infinity`. The cap is now an absolute 24 hours with no multiplication and no dependence on configuration. Consequence stated and priced in O2: an install setting the timeout above a day has its own lock refused as `owner-unknown` for the part of its life more than a day ahead — loud, never silent, never a takeover. The unqualified "at most one lost night" is gone; the spec now separates the walked already-expired case (one night) from the worst case composed of the 24 h cap and the 6 h bound (two nights). Validating the setting and reconciling inner against outer timeouts is routed onward. |
| R2-B2 — the new busy shape breaks a test outside the boundary | B | light | **Fix (option A)** | `tests/unit/dream-pipeline.test.js:921` deep-compares the busy object and is run by the required `npm test`, so a conforming implementation would fail it while fixing it would break the permission boundary. The file is back in Deliverables for that one expectation, and C4 now carries the complete inventory from `grep -rn acquireLock tests/ src/ bin/`: one production consumer, three test files, one deep-compare outside the lock suite, two call sites that assert nothing about the result. The alternative — freeze the result shape and export a staleness helper — was rejected and the rejection recorded in the implementation notes: the parsed record lives only inside `acquireLock`, so a helper must re-read and re-parse the file, adding a second exported contract, a second read and a time-of-check window in place of one expectation whose new value is deterministically `1`. |

**The reusable lesson of round 2** is narrower than round 1's and worth keeping
separate: *a bound that is derived from a value nobody validates is not a bound.*
S3 was written as a cap and reviewed as a cap, but it multiplied an unvalidated
config number, so it inherited exactly the unboundedness it was introduced to
remove. The check is mechanical — for every limit, ask what constrains each input
to the limit, and stop only at a literal or a validated range.

## Resulting shape

Size drops from M to S after round 1 and stays S after round 2. Table S is seven
rows (result shape, `staleForMs`, implausible-deadline refusal, the loud gate,
the message and its real delivery surface, the exit-code doc-comment errata, the
ADR amendment). Six owner items, renumbered once in round 1.

Deliverables after round 2 (seven paths): `src/core/dream/lock.js`,
`src/cli/dream.js`, `tests/unit/dream-lock.test.js`,
`tests/unit/dream-pipeline.test.js`, `tests/integration/dream.test.js`,
`tests/red-proofs/dream-lock-stale-owner-loud.proofs.json` (create),
`docs/adr/0012-dream-run-lifecycle.md`. Round 1 removed
`tests/unit/dream-pipeline.test.js` on the reasoning that the integration suite
owned the only remaining CLI behavior; round 2 put it back for a different
reason — it deep-compares the result object that S1 changes. Both decisions were
about the same file and neither was wrong about its own question, which is why
the complete consumer inventory now lives in C4 rather than in an argument.
