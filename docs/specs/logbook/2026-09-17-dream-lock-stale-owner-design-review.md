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
| R2-A1 — restart-then-delete can delete a newly acquired live lock | A | heavy | **Fix the instruction** | The reviewer's own trace carries the cure: after a restart the recorded PID is normally gone, so the next scheduled or catch-up run probes `ESRCH` and Table L5's existing takeover clears the lock unattended. The restart is usually the whole fix, and the deletion — which `RunAtLoad`, `Persistent=true` and `StartWhenAvailable` can race — was both unnecessary and the only destructive step. The message now says: how long it has been held; restart, and Wienerdog normally recovers by itself; delete the named file **only if the same message reappears afterwards**, at a time when no dream is about to start. Why that is safe enough was reasoned in Table S5: a reappearing message means the contender that printed it got `busy`, which by L4 means it neither acquired nor modified the record, so the file is still the dead owner's. The remaining race — squatter exits, contender takes over, user deletes a live record — is named as a residual and priced in O4. **Superseded in round 3 (R3-A1): that identity argument is withdrawn and the "about to start" condition is replaced.** `busy` proves only that the contender did not modify the record it just saw, not that the record is the one the first message diagnosed — the automatic takeover may have replaced it, and a fresh attended dream may legitimately own the new one. The condition is now that no dream is running at that moment, and the residual is that the instruction rests on that human check. An attended conditional-recovery command is routed onward; no scheduler-disable procedure is prescribed, because telling a non-developer to disable and re-enable an OS schedule entry is a larger hazard than the race it removes. |
| R2-B1 — the deadline cap still inherits the unbounded timeout | B | heavy | **Fix** | `readDreamConfig` puts no maximum on `dream_timeout_minutes`, so `max(24 h, 2 × timeoutMs)` inherits that: a twenty-day timeout leaves a twenty-day deadline below the cap and the stall stays silent for twenty days, and the multiplication can overflow to `Infinity`. The cap is now an absolute 24 hours with no multiplication and no dependence on configuration. Consequence stated and priced in O2: an install setting the timeout above a day has its own lock refused as `owner-unknown` for the part of its life more than a day ahead — loud, never silent, never a takeover. The unqualified "at most one lost night" is gone; the spec now separates the walked already-expired case (one night) from the worst case composed of the 24 h cap and the 6 h bound (two nights). Validating the setting and reconciling inner against outer timeouts is routed onward. **Superseded in round 3 (R3-B1): the two-night figure is withdrawn.** The two bounds are not additive on their own, because a quiet decline records success and stops that day's sampling; the true maximum is 54 h and three lost runs. |
| R2-B2 — the new busy shape breaks a test outside the boundary | B | light | **Fix (option A)** | `tests/unit/dream-pipeline.test.js:921` deep-compares the busy object and is run by the required `npm test`, so a conforming implementation would fail it while fixing it would break the permission boundary. The file is back in Deliverables for that one expectation, and C4 now carries the complete inventory from `grep -rn acquireLock tests/ src/ bin/`: one production consumer, three test files, one deep-compare outside the lock suite, two call sites that assert nothing about the result. The alternative — freeze the result shape and export a staleness helper — was rejected and the rejection recorded in the implementation notes: the parsed record lives only inside `acquireLock`, so a helper must re-read and re-parse the file, adding a second exported contract, a second read and a time-of-check window in place of one expectation whose new value is deterministically `1`. |

**The reusable lesson of round 2** is narrower than round 1's and worth keeping
separate: *a bound that is derived from a value nobody validates is not a bound.*
S3 was written as a cap and reviewed as a cap, but it multiplied an unvalidated
config number, so it inherited exactly the unboundedness it was introduced to
remove. The check is mechanical — for every limit, ask what constrains each input
to the limit, and stop only at a literal or a validated range.

## Round 3 — dispositions

Reviewed tip `a70fbb76`, verdict `needs-attention`, two findings, no
review-machinery findings. The round confirmed R2-B1's cap is genuinely absolute
and configuration-independent and that R2-B2's consumer boundary is complete.
Raw artifacts are committed beside this entry as
`2026-09-17-dream-lock-stale-owner-design-r3-raw.json`, `-focus.txt` and
`-meta.txt`. Nothing below records an owner decision.

| Finding | Band | Weight | Disposition | Rationale |
|---|---|---|---|---|
| R3-A1 — a repeated message does not prove this is still the dead owner's lock | A | heavy | **Fix, at the reviewer's stated minimum** | Round 2's repair kept one sentence too many. `busy` proves that the contender did not modify the record it observed; it says nothing about whether that record is the one the earlier message diagnosed. Between the two messages Table L5's takeover can replace the record, and a fresh attended dream — with no outer watchdog, the case O1 already admits — can be the legitimate owner overrunning its own deadline. "At a time when no dream is about to start" does not exclude a dream that is *already* running. Three things changed: the identity claim is deleted from Table S5, O4, the ADR block and the round-2 rationale above; the byte-exact message now requires the user to establish that **no dream is running at that moment**, in terms a non-developer can act on without a command (nothing they started in a terminal, nothing Wienerdog started in the last half hour); and the residual is restated as resting on that human check, with a wrong deletion letting a later run rebuild shared scratch under a live owner. The overrule stays an attended conditional-recovery command that compares the diagnosed record with the current one immediately before removal — routed under Discovered, not designed. |
| R3-B1 — success watermarking stretches the worst case to 54 hours | B | heavy | **Fix the claim, keep the mechanism** | Arithmetic re-derived and confirmed: a catch-up at 21:30 sees a deadline exactly 24 h ahead (S3's comparison is strict, so this is permitted); the next 03:30 is still 18 h early; the following 03:30 is exactly 6 h stale and S4's comparison is strict, so also quiet; the third 03:30 is loud — 54 h after the first observation, three scheduled runs lost. The composition is not `cap + bound` but `cap + bound + one sampling interval`, because every quiet decline writes `last_success` and stops that day's hourly catch-up. Every "~30 h / two nights" statement — Table S, O2, the timeline and the ADR block — is replaced by 54 h / three lost runs, kept clearly separate from the realistic case (default 20-minute deadline, crash: one lost night). **`>` versus `>=`:** evaluated by sweeping every start minute; `>=` moves the maximum from 54 h 00 m to 53 h 59 m, because the bound is set by the daily sampling interval and not by the comparison. It does not shorten the worst case by a run, so the existing strict form stands and S4 now records that. The boundary schedule is added as a worked example. No supervisor-visible deferred outcome, no `run-job` change; the absence of an end-to-end scheduler test is stated under Out of scope with its reason (that file is outside the boundary). |

**The reusable lesson of round 3:** *a composed bound must include the interval
at which it is sampled.* S3 and S4 were each correct and each tested at its own
boundary, and the sum of two correct bounds was still wrong by a whole day
because nothing observes them continuously — the observer's own cadence is a term
in the bound. The same shape as round 2's lesson one level up: round 2 asked what
constrains each input to a limit, round 3 asks what constrains when the limit is
evaluated.

## Round 4 — disposition and closure

Reviewed tip `b31c03ac`, verdict `needs-attention`, one finding, no
review-machinery findings. The round confirmed R3-A1 substantively fixed —
*"the operative contract withdraws record-identity claims and truthfully prices
deletion as resting on a fallible human check"* — and accepted the explicitly
superseded historical text above as historical. Raw artifacts are committed
beside this entry as `2026-09-17-dream-lock-stale-owner-design-r4-raw.json`,
`-focus.txt` and `-meta.txt`. Nothing below records an owner decision.

| Finding | Band | Weight | Disposition | Rationale |
|---|---|---|---|---|
| R4-B1 — the claimed 54-hour maximum assumes every local schedule day is 24 hours | B | **light** | **Fix the claim** | The dream is scheduled at 03:30 *local* time, so one sampling interval is one local schedule day, which is 25 hours across a daylight-saving fall-back. The reviewer's Europe/Budapest walk is exact and was re-derived here (below): the alert arrives at 55 hours, not 54. The finding changes nothing an implementer builds — no rule, no constant, no test — so under `docs/runbooks/codex-review.md`'s weighted-closure rule it is LIGHT: fixed, verified mechanically, and the loop closes without another external round. No schedule-aware bound is specified. Every operative surface — the timeline, Table S3 and S4, O2, the mirrored-surface rule, the out-of-scope test description and the ADR amendment block — now says plainly that the spec states **no hard wall-clock maximum**: it states the sampling rule (S3's cap + S4's bound + one *local* schedule day) and two worked cases, 54 h while the machine stays on at a stable UTC offset and 55 h across a fall-back, with downtime adding its own length. |

### The fall-back arithmetic, re-derived

Run here rather than taken on the reviewer's word (`TZ=Europe/Budapest node`,
explicit UTC instants, S3's cap 24 h, S4's bound 6 h, both comparisons strict):

```text
t0       2026-10-22T19:30:00.000Z = 21:30 CEST 22 Oct   (catch-up, first observation)
deadline 2026-10-23T19:30:00.000Z (t0 + 24h, exactly at S3's cap -> not refused)
23/10/2026, 03:30:00   stale=  -18.00 h quiet  elapsed since t0 =  6.00 h
24/10/2026, 03:30:00   stale=    6.00 h quiet  elapsed since t0 = 30.00 h
25/10/2026, 03:30:00   stale=   31.00 h LOUD   elapsed since t0 = 55.00 h
```

The 24 → 25 October interval is 25 hours because the EU fall-back lands inside
it; the 24 October run is quiet at exactly the bound because S4's comparison is
strict; so the first loud run is 55 elapsed hours after the first observation,
one hour later than the figure round 3 recorded.

**The reusable lesson of round 4** completes the series: *a sampling interval is
a calendar quantity, not a duration.* Round 2 asked what constrains each input to
a bound; round 3 asked what constrains when the bound is evaluated; round 4 asks
in whose clock. Three rounds, one root — a bound stated as a number when the
honest statement was a rule.

## Closure

**The loop is closed at round 4**, per `docs/runbooks/codex-review.md`'s
weighted-closure rule: round 4's single finding is LIGHT — it changes nothing the
work package builds — it is fixed, and its arithmetic is verified mechanically
above, so no further external round is required.

Four rounds on one channel: **4 findings, then 3, then 2, then 1.** Every finding
is dispositioned in the tables above; none was dropped, and none was accepted as
a residual without being written into the spec. Each round's raw reviewer output
was committed **before** adjudication — post-rebase `ba19772e` (round 1),
`46061d59` (round 2), `e7856efb` (round 3), `83e658d8` (round 4).

What the reviewer executed, each round: **static readings only** — repository
history and status queries, a whitespace check, and `nl`/`sed`/`rg` over the two
design documents and the source, test, ADR, milestone and runbook regions they
cite. Round 1 additionally did read-only web research into `os.uptime()` platform
semantics; rounds 3 and 4 additionally ran Node schedule arithmetic. **`npm
test`, the targeted suites, `npm run lint` and `npm run red-proofs` were NOT run
in any round**, and the reviewer said so each time: this is a design-only branch,
the implementation and the declared RED proofs do not exist yet, and
both-directions evidence is the implementer's obligation at PR time (Verification
steps, AC7).

The spec moves to `status: Ready`. Owner items O1–O6 are recorded as
recommendations adopted under the standing authorization in
`docs/specs/logbook/2026-09-17-owner-rulings-felho-integration-3.md`, each with
its overrule cost, none of them a direct ruling.

## Resulting shape

Size drops from M to S after round 1 and stays S through round 4. Table S is seven
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
