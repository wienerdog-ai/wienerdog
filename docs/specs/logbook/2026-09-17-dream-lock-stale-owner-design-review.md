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

## Closure (round 4 — superseded)

**Superseded 2026-09-17 by the confirming round below: this closure did not
hold, and the spec returned to `status: Draft`.** The round-4 reasoning stands as
written for round 4's own findings; what it got wrong was treating a single
reviewer's convergence as sufficient. The record of that mistake is the point of
leaving it here.

**The loop was closed at round 4**, per `docs/runbooks/codex-review.md`'s
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

The spec moved to `status: Ready` at this point and was **returned to `Draft` by
the confirming round below**. Owner items O1–O6 remain recorded as
recommendations adopted under the standing authorization in
`docs/specs/logbook/2026-09-17-owner-rulings-felho-integration-3.md`, each with
its overrule cost, none of them a direct ruling; **O1 and O4 changed materially
in the confirming round** and their entries in that record must be read with
round 5's dispositions.

## Round 5 — the confirming round, by a second reviewer

A **different** reviewer and a different model: Codex plugin 1.0.6
adversarial-review, `gpt-6-astra`, reviewed tip `9f7eb37d` against
`2d5e2465`. Verdict `needs-attention`: one product finding and one machinery
finding. Raw artifacts are committed beside this entry as
`2026-09-17-dream-lock-stale-owner-design-r5-astra-raw.json`, `-focus.txt` and
`-meta.txt`. **The loop is re-opened and the spec returns to `status: Draft`.**
Nothing below records an owner decision.

What the round confirmed, by execution rather than reading: the 54 h and 55 h
worked cases, re-derived with read-only Node simulations **using the actual
`catchUp`/`todaysFire` functions** and simulated success watermarks; that no raw
lock bytes enter the proposed message; and that the cited source, test, ADR and
proof-runner locations and the `acquireLock` consumer inventory all resolve. It
ran no suites, no lint and no proofs — the implementation does not exist.

| Finding | Band | Weight | Disposition | Rationale |
|---|---|---|---|---|
| A-1 — scheduled dreams can legitimately exceed the loud threshold | medium | **heavy** (it changes the user-visible message) | **Fix** | O1 claimed only an *attended* run can legitimately overrun six hours. False: `wienerdog schedule --timeout` accepts any positive integer number of minutes (`src/cli/schedule.js`) and `resolveTimeoutMs` uses it as given (`src/cli/run-job.js`), while `dream_preprocess_timeout_seconds` is configured independently — so a job registered with a ten-hour watchdog can be a *healthy scheduled* dream seven hours past a twenty-minute lock deadline. Two repairs: **(a)** O1's watchdog claim is qualified to the **default** configuration, and scheduled overruns are priced beside attended ones, with the consequence stated as an alert and never a takeover (Table L4's retention is untouched). **(b)** The half-hour start-time heuristic dies with the claim, and it took the deletion instruction with it — see below. |
| A-2 — the declared proof suite cannot exercise S4 | medium | light (machinery) | **Fix** | `scripts/red-proofs.js` executes only the suite a declaration names, and `tests/unit/dream-lock.test.js` imports the lock helpers alone, so a mutation of S4's comparison in `src/cli/dream.js` would leave the declared suite green and AC7 could never be satisfied. Executable S4–S5 CLI coverage moves into `tests/unit/dream-pipeline.test.js` — already in the Deliverables, already the suite that drives the dream CLI's decline branches — and gets its own declaration file. That is the smaller surface **and** the existing convention: `suite` is a top-level field, every declaration under `tests/red-proofs/` names one suite, every one of them names a *unit* suite, and `WP-quarantine-banner-location` already owns two files for that reason. The integration suite keeps its end-to-end assertions (AC5) and is not a proof carrier. Deliverables, AC7 and the `boundary-check` argument list updated together. |

### The deletion instruction is dropped

A-1(b) was the disposition that forced the choice, and the instruction was
reasoned through against the tree rather than reworded again. Every candidate
qualifier fails:

- *"at a time when no dream is about to start"* (round 3) does not exclude a
  dream that is already running.
- *"restart, then delete straight away"* is the **worst** timing available: the
  catch-up entry starts a dream at boot on all three platforms — `RunAtLoad`
  (`src/scheduler/generators.js:449`), `Persistent=true` (`:486`),
  `StartWhenAvailable` (`:1025`, `:1078`) — and that boot dream is precisely the
  one whose `ESRCH` probe takes a dead owner's lock over. The file the user
  deletes "straight away" is the most likely of all to be a fresh live owner's.
- *"only if the message reappears"* identifies nothing: a message is read from a
  log or an email after the fact, and the record may have been replaced since.
- *"if nothing started in the last half hour"* is false under A-1 itself.
- A process-listing command cannot be stood behind on macOS, Linux and Windows
  alike, and a non-developer cannot verify a wrong one.

There is no quiet window a user can identify unaided, because in the loud state
no run records success, so a dream attempt starts every hour **and** at every
boot. Preferring truthful-and-safe over helpful-and-risky, S5 now restarts the
computer, names the lock file as information, states that removing it is safe
only while no dream is running, and says Wienerdog cannot establish that from
where it stands — so the condition should be checked rather than guessed. No
troubleshooting page exists under `docs/` to point at and none was invented. The
attended conditional-recovery command is routed as **the real fix**, and O4's
overrule cost is restated accordingly.

**The lesson of round 5:** *a confirming round by a second model overturned a
safety premise four rounds of the first model had accepted, by evaluating the
actual watchdog resolver instead of reading the claim about it.* Four rounds had
each asked a sharper question about the bound — what constrains its inputs, when
it is sampled, in whose clock — and all four let "no scheduled run can
legitimately overrun" stand because it sounded like a fact about the default
rather than a claim about the configuration space. The premise was one `grep` of
`--timeout` away the whole time. A single reviewer converges; it does not
necessarily converge on the truth.

## Round 6 — the message states only what the decline observed

Same second reviewer as round 5: Codex plugin adversarial-review, `gpt-6-astra`,
tip `8a29f4ca`. Verdict `needs-attention`, one product finding, no blocking
machinery finding. Raw artifacts are committed beside this entry as
`2026-09-17-dream-lock-stale-owner-design-r6-astra-raw.json`, `-focus.txt` and
`-meta.txt`. Nothing below records an owner decision.

What the round confirmed, again by execution: A-1's watchdog qualification and
the removal of the deletion shortcut are fixed; A-2's proof routing is viable —
it ran **the real declaration loader** and validated representative declarations
against `runSuite` and the pipeline suite's CLI coverage; and the 54 h and 55 h
worked cases hold, re-derived with the real `catchUp`/`todaysFire`. It also ran
the real watchdog resolver, the real config reader and the real `acquireLock`
against in-memory fixtures with a live-PID probe and simulated `EPERM`/`ESRCH`.
No suites, lint or proofs — the implementation does not exist.

| Finding | Band | Weight | Disposition | Rationale |
|---|---|---|---|---|
| R6-1 — S5 still equates an overdue busy lock with stopped vault activity | medium | **heavy** (user-visible text) | **Fix** | Two sentences asserted facts `busy` cannot establish. (i) *"nothing new has been written to your vault since then"* — false: `src/cli/dream.js` promotes into the vault at ≈ l.956, **inside** the lock, and releases only at ≈ l.1221, so a held lock is fully consistent with a healthy owner that has already written; and A-1 established that such an owner can legitimately be running this long. (ii) *"Wienerdog cannot clear it on its own"* — false: the owner may finish and release, or the probed PID may exit and Table L5's `ESRCH` takeover then applies. Compounding both, the **unconditional** "Restart this computer" could destroy a healthy long-running dream on a false diagnosis; O1 priced the false alert but not the misleading guidance. The message is rewritten to state only the decline's own observations — the lock is past its deadline, a local process answered the probe, this run did not start — to present both possibilities and say Wienerdog cannot tell which, and to offer restart as an **option** conditioned on the messages continuing, with its cost named in the same sentence. The diagnosis word changes from *stale* (which asserts death) to *overdue* (which does not), and the identifying literal `dream lock is overdue:` is now pinned in AC5, in AC7's rule for declaration `find` strings, and in the mirrored-surface walk. The internal constant keeps its `STALE_` name, which matches the work package slug and describes the condition to the implementer; S4 records that split deliberately. O1 gains a second named cost — the alert can cost one run's work, never vault content, since a dream run is one commit and an interrupted run simply does not make it. **Superseded in round 7 (R7-1): that last assurance is withdrawn.** A commit does not make interrupted promotion atomic — `promote()` publishes paths one at a time before `commitNamedSet`, and `promote.js` itself declines to claim cross-path write-atomicity — so a restart mid-promotion can leave the vault half-published and the ledger unadvanced. O1 now prices those states instead. |

### Two hedges that had to survive the rewrite

Checked sentence by sentence against the tree, and both are conditional for a
reason:

- *"If it is still working it will release the lock when it finishes, and these
  messages will stop on their own."* True only under its own `if` — the owner
  releases via `releaseLock`, which is itself guarded by `ownsLock`.
- *"Wienerdog **normally** clears the lock by itself the next time it runs."*
  "Normally" is load-bearing: the `ESRCH` takeover is defeated if the PID is
  reused again, which is the very failure this work package exists to make loud.

**The lesson of round 6:** *a diagnostic message is a set of claims, and each one
needs a source in what the code actually observed.* The message had drifted into
narrating the incident — memory stopped, recovery impossible — rather than
reporting the decline. The check that catches it is per-sentence and mechanical:
for each assertion, name the value or branch that establishes it. Three of the
sentences had no such source, and one of them contradicted a line number the spec
itself already cited.

## Round 7 — disposition and closure

Codex plugin adversarial-review, `gpt-6-astra`, tip `c0acf8c1`. Verdict
`needs-attention`, one finding, no blocking machinery finding. Raw artifacts are
committed beside this entry as
`2026-09-17-dream-lock-stale-owner-design-r7-astra-raw.json`, `-focus.txt` and
`-meta.txt`. Nothing below records an owner decision.

What the round confirmed: *"reviewed every S5 sentence against acquisition,
promotion and teardown. The vault-inactivity and impossible-recovery claims are
withdrawn, restart names ongoing-work loss, and deletion remains conditional."*
S5, AC5 and AC7 carry `dream lock is overdue:` and no `dream lock is stale:`
literal remains anywhere. The cited locations resolve.

| Finding | Band | Weight | Disposition | Rationale |
|---|---|---|---|---|
| R7-1 — O1 assumes a commit makes interrupted promotion atomic | medium | **light** | **Fix the claim** | O1's round-6 pricing ended with an assurance that an interrupted run costs "one run's work, never vault content, since a dream run is one commit and an interrupted run simply does not make it". False. `promote()` runs at `src/cli/dream.js` ≈ l.956 and `commitNamedSet` only at ≈ l.1055, and `src/core/dream/promote.js` ≈ l.808-812 says in its own words that *"Cross-path WRITE-atomicity is not claimed — a first `rename` that succeeds followed by one that fails leaves a half-applied pair"*. So a restart inside that window can leave some vault changes published and others absent, uncommitted, with the transcript ledger unadvanced (`writeLedger` ≈ l.1164) and those sessions reprocessed next run; and a restart after the commit but before the ledger is persisted leaves committed work eligible for reprocessing. O1 now prices both states and says plainly that they are properties of **any** interruption of a dream — power loss, the outer watchdog — which this work package neither introduces nor repairs, without implying transactional rollback. The finding lives in an owner item's pricing and in a logbook rationale, not in the byte-exact message and not in anything the implementer builds, so it is LIGHT under the weighted-closure rule. The message's own sentence — *"ends whatever is holding the lock — including a dream that is still working"* — is true and unchanged; a stronger non-developer warning is **offered as a one-string overrule inside O1** rather than applied, because changing S5 would be a user-visible text change and would re-open the loop. |

**The lesson of round 7** is the round-6 lesson applied one surface outward:
*the per-sentence source check belongs to the reasoning too, not only to the
user-facing string.* Round 6 audited every sentence of the message against the
code and fixed it. The very same paragraph that recorded that fix then asserted
an atomicity guarantee nobody had checked — in an owner item, where a wrong
assurance is exactly as load-bearing, because it is what the owner would be
deciding against.

## Closure

**The loop is closed at round 7**, per `docs/runbooks/codex-review.md`'s
weighted-closure rule: round 7's single finding is LIGHT — it changes no rule, no
constant, no test and no byte of the user-facing message — it is fixed, and its
three citations were verified against the tree before adjudication.

**Seven rounds, on two channels and two models.** Rounds 1–4 were `gpt-5.6-sol`
via `codex exec`; rounds 5–7 were `gpt-6-astra` via the Codex plugin. Findings:
**4, 3, 2, 1 — then 2, 1, 1.** The second channel's first round re-opened a loop
the first had closed, by evaluating the actual watchdog resolver rather than
reading the claim about it; that is the single most useful thing either channel
did, and it is why the round count is not a measure of convergence on its own.

Every finding is dispositioned in the tables above. None was dropped, and none
was accepted as a residual without being written into the spec. Each round's raw
reviewer output was committed **before** adjudication — post-rebase `0b926fe2`
(round 1), `1a6c8f6d` (round 2), `2f4b509d` (round 3), `b815864e` (round 4),
`eef9b885` (round 5), `54aa0a6d` (round 6), `92c6d57f` (round 7).

What the reviewers executed: **static reads throughout, plus real execution of
non-test code in the later rounds.** Rounds 1–4: repository history and status
queries, a whitespace check, and `nl`/`sed`/`rg` over the design documents and
the source, test, ADR, milestone and runbook regions they cite; round 1 added
read-only web research into `os.uptime()` platform semantics, and rounds 3–4
added Node schedule arithmetic. Rounds 5–7 went further and ran the product's own
functions: the real `catchUp`/`todaysFire` with simulated watermarks (confirming
54 h and 55 h), the real watchdog resolver and config reader, the real
`acquireLock` against in-memory fixtures with a live-PID probe and simulated
`EPERM`/`ESRCH`, and the real RED-proof declaration loader against representative
declarations. **`npm test`, the targeted suites, `npm run lint` and `npm run
red-proofs` were NOT run in any round**, and every round said so: this is a
design-only branch, the implementation and the declared proofs do not exist yet,
and both-directions evidence is the implementer's obligation at PR time
(Verification steps, AC7).

The spec moves to `status: Ready`. Owner items O1–O6 are recorded as
recommendations adopted under the standing authorization in
`docs/specs/logbook/2026-09-17-owner-rulings-felho-integration-3.md`, each with
its overrule cost, none of them a direct ruling.

## Resulting shape

Size drops from M to S after round 1 and stays S through round 7. Table S is seven
rows (result shape, `staleForMs`, implausible-deadline refusal, the loud gate,
the message and its real delivery surface, the exit-code doc-comment errata, the
ADR amendment). Six owner items, renumbered once in round 1.

Deliverables after round 5 (eight paths — round 5 added the second declaration
file): `src/core/dream/lock.js`,
`src/cli/dream.js`, `tests/unit/dream-lock.test.js`,
`tests/unit/dream-pipeline.test.js`, `tests/integration/dream.test.js`,
`tests/red-proofs/dream-lock-stale-owner-loud.proofs.json` (create),
`tests/red-proofs/dream-lock-stale-owner-loud-pipeline.proofs.json` (create),
`docs/adr/0012-dream-run-lifecycle.md`. Round 1 removed
`tests/unit/dream-pipeline.test.js` on the reasoning that the integration suite
owned the only remaining CLI behavior; round 2 put it back for a different
reason — it deep-compares the result object that S1 changes. Both decisions were
about the same file and neither was wrong about its own question, which is why
the complete consumer inventory now lives in C4 rather than in an argument.
