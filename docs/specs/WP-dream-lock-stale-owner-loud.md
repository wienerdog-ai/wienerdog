---
id: WP-dream-lock-stale-owner-loud
title: Make a stale busy dream lock loud, and refuse an implausible deadline
status: Draft
model: sonnet
size: S
depends_on: [WP-dream-live-owner-lock]
adrs: [ADR-0004, ADR-0012, ADR-0031, ADR-0042]
---

# WP-dream-lock-stale-owner-loud: a stale busy lock must not exit 0

- Authoring rules live in `docs/runbooks/spec-authoring.md` — the template gives
  the skeleton, the runbook the rules. Read both.

## Context (read this, nothing else)

**Wienerdog is just files (ADR-0004).** A scheduled job is an OS schedule entry
that runs `wienerdog run-job <name>`; every durable fact it produces is a file
under `~/.wienerdog/`. Nothing may keep running after its job. This work package
adds no process, no timer and no watcher: it reads numbers already in hand and
changes which branch existing code takes.

**The dream is the nightly consolidation job.** `wienerdog dream` acquires
`state/dream.lock` *before* it rebuilds the shared scratch directory
`state/dream-scratch` (a destructive `rm` + `mkdir` + write), and holds that lock
through preprocessing, the brain run, validation/promotion and cleanup. The lock
file's payload is one line of JSON with no trailing newline:
`{"pid":…,"host":…,"startedAt":"<ISO>","deadline":<epoch ms>}`. `deadline` is
acquisition time plus `dream_timeout_minutes` (default 20, so 1,200,000 ms).
This work package does not change that payload.

**The schedule around it.** `src/cli/schedule.js` registers the dream at
**03:30** (`ensureDreamSchedule`, `const at = '03:30'`). A separate catch-up
entry fires at login and hourly on the hour (macOS `catchupPlist` renders
`RunAtLoad` plus a `StartCalendarInterval` with `Minute` 0 and no `Hour`;
Windows `windowsCatchupTaskXml` repeats at `PT1H`; Linux gets native replay from
`Persistent=true`). `catchUp` in `src/cli/run-job.js:1402-1409` runs a job only
when `now >= todaysFire(job.at) && (!last_success || last_success < fire)`.

**What `run-job` does with the child's exit code.** On a clean exit 0 it writes
`last_success` and calls `clearAlerts(paths, name)`, deleting every
`state/alerts.jsonl` line for that job (`src/cli/run-job.js:1180-1212`). On a
non-zero exit it fails loud with the **generic** reason
`` `job "${name}" exited ${code}` `` (`src/cli/run-job.js:1237`) — the child's
own stderr is piped to the per-run log, not forwarded into the alert — plus a
`log_hint` of `~/.wienerdog/logs/dream/` and a best-effort self-email whose body
is `` `${reason}\n\nDetails: ${logHint}` `` (`:712-727`). The next
`renderDigest` then puts a `> [!warning]` callout for that job into
`state/digest.md`.

**The defect this work package fixes.** `WP-dream-live-owner-lock` (PR #245)
correctly stopped the dream from stealing an expired lock whose local owner is
still alive. Its Table L4 accepted one residual in a single sentence: *"A reused
PID pointing at an unrelated live process conservatively blocks recovery."* What
that sentence did not examine is that the block is **silent**. A dream dies
uncleanly (power loss, forced reboot, `SIGKILL`) and leaves its lock; its PID is
later held by an unrelated long-lived process; every later run probes that PID,
sees it alive, prints one line and **returns exit 0**. `run-job` records success,
clears any prior alert, and the digest shows a healthy job — while consolidation
has stopped indefinitely.

**This work package makes that state loud and does not try to recover from it
automatically.** A design round rejected the obvious automatic repair — inferring
the owner's death by comparing the lock's `startedAt` against an estimate of boot
time — because nothing binds `startedAt` to the PID the probe found: a copied or
backup-restored lock carries a genuine pre-boot timestamp while its PID names a
currently running dream, and a forward clock step has the same effect. A wrong
takeover puts two dreams on the same scratch directory, and the pipeline has no
`ownsLock` check before promotion — only before teardown. Once the stall is loud,
automatic takeover is a convenience and a wrong takeover is the worse failure, so
it is out of scope here (see "Discovered issues / routed onward").

## Current state

Inspected at `047a202c`. Re-verify at dispatch.

| Claim | Current owner and behavior |
|---|---|
| C1 | `src/core/dream/lock.js` exports `acquireLock(stateDir, timeoutMs)`, `releaseLock(stateDir)`, `ownsLock(stateDir)`. `acquireLock` writes with `wx`; on `EEXIST` it parses the record, returns `owner-unknown` for an unreadable/non-object/array record or a non-finite non-number `deadline`, returns `busy` when `now <= deadline`, then requires `existing.host === os.hostname()` and an integer `pid` in `[1, 2147483647]` (else `owner-unknown`), then `process.kill(pid, 0)`: success or `EPERM` → `busy`; `ESRCH` → overwrite + `{acquired:true, stolen:true}`; any other error → `owner-unknown`. It requires `node:fs`, `node:os`, `node:path` and nothing else. The `timeoutMs` argument is used only to compute this process's own `deadline`. |
| C2 | `src/cli/dream.js:593-603` is the only consumer of the result: `const lock = acquireLock(paths.state, cfg.timeoutMs); if (!lock.acquired) { if (lock.reason === 'owner-unknown') throw new WienerdogError('dream lock owner could not be verified; no takeover was attempted. Check whether an earlier dream is still running before arranging lock recovery.'); console.log('wienerdog: another dream holds the lock.'); return; } if (lock.stolen) console.warn('wienerdog: warning — stole a stale dream lock from a prior run that never released it.');` — the `console.log` branch returns before the `try` block, so it collects nothing and touches neither scratch nor the lock. |
| C3 | `src/cli/dream.js:534-538` is `run`'s doc comment. Its `Exit 1` line reads `expected failure (WienerdogError): no vault, dirty tree, brain failure/timeout, git error.` — it does **not** mention the `owner-unknown` throw that C2 already ships. That omission is errata this work package folds in (Table S6). |
| C4 | `tests/unit/dream-lock.test.js` drives every branch by mocking through the module objects the source already calls: `t.mock.method(Date, 'now', …)`, `t.mock.method(os, 'hostname', …)`, `t.mock.method(process, 'kill', …)`, `t.mock.method(fs, 'readFileSync', …)`. Several tests `assert.deepEqual` the whole `busy` object, so adding a field to it changes those assertions. `tests/integration/dream.test.js:600-660` asserts the two decline behaviors end to end against real child processes; the first seeds an expired lock with `acquireLock(state, -1)` (≈1 ms past its deadline), the second seeds unparseable bytes. |
| C5 | `readDreamConfig` (`src/core/dream/config.js:56-65`) accepts any finite positive `dream_timeout_minutes` with no maximum. The scheduled outer watchdog is derived independently from `job.timeoutMinutes` (`src/cli/run-job.js:496-505`), so an inner timeout larger than the outer one is representable: the supervisor kills the owner while its lock still looks unexpired. ADR-0012's `## Amendment (2026-09-15): preserve live dream lock ownership after expiry` is the most recent amendment to part 6; it is silent on how a user learns that recovery has been delayed. |

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file itself (the status flip),
     package-lock.json, memory/lessons/inbox.md, and docs/specs/logbook/. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/core/dream/lock.js | Table S1–S3: the `staleForMs` field on `busy` and the implausible-deadline refusal. |
| modify | src/cli/dream.js | Table S4–S6: the staleness gate, its message, and the Exit-1 doc-comment errata. |
| modify | tests/unit/dream-lock.test.js | Table S1–S3, including the existing whole-object `busy` assertions. |
| modify | tests/integration/dream.test.js | Table S4–S5 end to end; the existing decline tests must still pass unchanged. |
| create | tests/red-proofs/dream-lock-stale-owner-loud.proofs.json | ADR-0042 declarations whose `suite` is `tests/unit/dream-lock.test.js`. |
| modify | docs/adr/0012-dream-run-lifecycle.md | Table S7: append the block in "ADR-0012 amendment text" below, byte-for-byte. |

### Exact contracts

Table S owns behavior. Exported signatures do not change; the `busy` result
object gains one field and nothing else does:

```js
acquireLock(stateDir, timeoutMs)
// -> { acquired: true,  stolen: false }
//  | { acquired: true,  stolen: true }
//  | { acquired: false, stolen: false, reason: 'busy', staleForMs: number }
//  | { acquired: false, stolen: false, reason: 'owner-unknown' }
ownsLock(stateDir)    // -> boolean, unchanged
releaseLock(stateDir) // -> undefined, unchanged
```

The lock path and the lock payload are byte-identical to today. No new lock
field, no new decline reason, no new state file, no new CLI flag, no new
configuration setting, no new runtime dependency.

## Contract reference

ADR-0031's activation trigger fires on four of its seven tests: (ii) the decline
taxonomy gains a field, (iv) the error/fallback behavior of a declined
acquisition changes, (v) `lock.js` emits staleness evidence that `dream.js`
alone interprets into a policy decision, and (vii) the same facts are mirrored
into the ADR amendment, the tests and the acceptance criteria. **Table S is
canonical**; every other surface in this spec cites it rather than restating it.

### Table S — stale-lock evidence, the implausible-deadline refusal, and the loud gate

| ID | Contract | Rule |
|---|---|---|
| S1 | Result shape | Only the `busy` result changes: it gains `staleForMs` (S2). `owner-unknown` and both `acquired` results keep their exact current fields, and no new reason code is introduced. Exported signatures, the lock path and the lock payload bytes are unchanged. **This work package changes no takeover decision**: Table L4's alive/`EPERM` retention and Table L5's `ESRCH` takeover behave exactly as shipped, as do L1 ordinary acquisition, L3 local-owner identity and the L5 non-atomic stale-claimant residual. |
| S2 | `staleForMs` | `now - existing.deadline`, computed from the same `now` and the same `deadline` that Table L2 already validated as a finite number, so it is never `NaN`. It is returned on **both** `busy` branches: `<= 0` on the unexpired branch (L2's `now <= deadline`, which still returns before any identity check or probe), `> 0` on the expired-and-alive branch. It is a number on every `busy` result; no caller may treat its absence as meaningful. |
| S3 | Implausible-deadline refusal | After L2 validates `deadline` as a finite number and **before** L2's `now <= deadline` busy branch: if `existing.deadline - now > Math.max(86400000, 2 * timeoutMs)` — twenty-four hours, or twice the contender's own `timeoutMs` argument when that is larger — the record is refused as **`owner-unknown`**, the existing loud path, with no takeover, no probe and no mutation of the lock or scratch. A self-consistent installation never trips this: the owner's deadline is `startedAt + timeoutMs` and the contender's `timeoutMs` is the same value, so the gap is at most `timeoutMs`. It trips on a crafted or copied record with a far-future deadline, and on an installation whose `dream_timeout_minutes` was cut to less than half its previous value while a lock was in flight — both of which become loud rather than silently unexpired for up to that deadline. |
| S4 | The loud gate (`src/cli/dream.js`) | On `!lock.acquired`, in order: (1) `reason === 'owner-unknown'` throws the existing Table L6 `WienerdogError` with its text unchanged; (2) otherwise, if `lock.staleForMs > STALE_LOCK_ALERT_MS` — a module constant in `src/cli/dream.js` equal to `6 * 60 * 60 * 1000` — throw a `WienerdogError` carrying S5's text; (3) otherwise print the existing `wienerdog: another dream holds the lock.` and `return`. All three branches keep L6 intact: none collects, none touches `state/dream-scratch`, none rewrites, deletes or releases the lock. Branch (3) is byte-identical to today's behavior, including its exit 0. The bound is measured past the deadline, which already contains the whole configured `dream_timeout_minutes`. |
| S5 | The stale-lock message and where it is actually read | One code-owned string with exactly two interpolations: `` `dream lock is stale: a dream has held it for more than ${hours} hours past its own time limit, so no later dream has run and nothing new has been written to your vault since then. The run that took the lock has almost certainly stopped without cleaning up. To recover safely: restart this computer — that guarantees no dream is still running — and then delete the file ${lockFile}. The next dream will run normally after that.` `` where `hours = Math.min(Math.floor(lock.staleForMs / 3600000), 9999)` (decimal digits only; the cap keeps a "more than N" claim true) and `lockFile = path.join(paths.state, 'dream.lock')`. No `pid`, no `host`, no `startedAt` and no byte read from the lock file appears in the text — Table L6's no-interpolation rule is kept. **Delivery, stated truthfully:** under the scheduler this text reaches the per-run log under `~/.wienerdog/logs/dream/` via the child's piped stderr and nothing else; the durable alert and the self-email carry `run-job`'s generic `` `job "dream" exited 1` `` plus that log hint. The byte-exact text is what an attended `wienerdog dream` prints, and what a user or their assistant finds in the log the alert points at. This is exactly the surface the `owner-unknown` throw shipped by `WP-dream-live-owner-lock` already has; no structured stderr channel is introduced. |
| S6 | Exit-code doc-comment errata | `src/cli/dream.js:534-538`'s `Exit 1` list must name every `WienerdogError` this function can raise on the lock path: the unverifiable-owner throw shipped by `WP-dream-live-owner-lock` (today omitted, C3) **and** S4's stale-lock throw. The `Exit 0` line keeps "another dream running" for branch (3) of S4 only. |
| S7 | ADR amendment | Append the block under "ADR-0012 amendment text" below to `docs/adr/0012-dream-run-lifecycle.md`, byte-for-byte, after the existing `## Amendment (2026-09-15): admit complete filtered sessions …` section. Every existing amendment, including both 2026-09-15 ones, stays intact. Its Status line reads exactly `Status: **PROPOSED — awaiting owner signature.**` — nothing in the amendment may say the owner approved, ratified, accepted or signed it. |

### The alert latency, walked

This timeline is the honest consequence of S4 branch (3) and is what O1 is
justified against. It replaces any claim that the hourly catch-up reports a
stale lock the same morning.

1. **Day 1, 03:30** — the scheduled dream acquires the lock; `deadline` is 03:50.
2. **03:35** — power loss. The lock file survives. The machine boots at 03:40.
3. **04:00 catch-up** — day 1's fire time has passed with no `last_success`, so
   the job runs. The lock is expired, its host matches and its PID is valid.
   If the probe returns `ESRCH` the existing Table L5 takeover runs and the
   dream proceeds — nothing in this work package applies. If the PID has been
   reused by a live process, the result is `busy` with `staleForMs` ≈ 10
   minutes, which is at or below S4's bound, so the dream prints its line and
   **exits 0**. `run-job` writes `last_success`, and `catchUp` therefore skips
   the job for the rest of day 1.
4. **Day 2, 03:30** — the scheduled run finds `staleForMs` ≈ 23 h 40 m, above
   the bound, and throws. `run-job` fails loud: an `alerts.jsonl` line, a
   best-effort email, and a `> [!warning]` callout in the next digest.
5. **Day 2, 04:00 onward** — no `last_success` was written, so `catchUp` finds
   the job overdue every hour and it fails loud every hour until a person
   clears the lock.

So the cost of a silent stall is **at most one lost night**, after which the
alert repeats hourly. That repeat cadence is not new: the `owner-unknown` throw
shipped in PR #245 already behaves this way (O3).

Worked cases, all deferring to Table S:

- Lock whose deadline has not passed → L2 returns `busy` before any probe,
  `staleForMs <= 0`, quiet, exit 0.
- Lock from a dream that is genuinely still running, 40 minutes past a 20-minute
  deadline → probe alive, `staleForMs` ≈ 2.4e6, below the bound → quiet, exit 0,
  exactly as today (Table L7 preserved).
- The same lock a day later → S4 branch (2) throws.
- Record whose deadline is a year in the future → S3 refuses it as
  `owner-unknown` and the dream throws the unchanged L6 error.
- Unreadable, foreign-host or invalid-PID lock → `owner-unknown`, unchanged.

### Mirrored Surface Checklist

Every surface below mirrors Table S. A finding updates Table S **and every
registered mirror in the same commit** — no commit may exist in which the table
and a registered mirror disagree. A new mirror found in review is added here in
the same pass.

- [ ] **Deliverables-table cells that restate a path or rule** — every Notes
      cell cites the S-rows its file carries (lock.js → S1–S3, dream.js →
      S4–S6, each test file → the rows it asserts, the proofs file → ADR-0042,
      the ADR → S7). A cell may name a row; it may not restate the rule.
- [ ] **Acceptance criteria that assert its facts** — AC1→S1, AC2→S2, AC3→S3,
      AC4→S4, AC5→S5, AC6→S6 and S7, AC7→ADR-0042 plus the S3 and S4
      comparisons. The idempotency line is an `N/A` disposition, not an S fact.
- [ ] **Verification commands / greps** — the `boundary-check` argument list
      must equal the Deliverables paths exactly; `npm run red-proofs --wp
      WP-dream-lock-stale-owner-loud` mirrors AC7; the both-directions sentence
      under the block is a repo-process rule, not an S fact.
- [ ] **Current-state description** — Context's schedule, payload and `run-job`
      facts and Current state C1–C5 record inherited behavior only, at
      `047a202c`. Any forward-looking sentence in either defers to S1–S7;
      neither may be rewritten as evidence that the change shipped.
- [ ] **Operative prose steps that apply it** — walked, with the row each step
      applies:
  - "The alert latency, walked", steps 1–5: applies **S4** branch (3) and the
    `run-job`/`catchUp` facts recorded in Context; it decides nothing and is the
    only place this spec states the latency.
  - Implementation notes, "Do not add fields to the lock payload": applies
    **S1**.
  - Implementation notes, "The far-future-deadline fixture": applies **S3**.
  - Implementation notes, rebase interaction: the named `src/cli/dream.js`
    regions are the ones **S4** and **S6** edit.
  - Dispatch precondition O1 applies **S4**, O2 **S3**, O3 the repeat cadence
    **S4** causes, O4 **S5**'s recovery instruction against Table L6, O5 the
    recovery consequence of leaving takeover unchanged (**S1**), O6 **S7**'s
    scope. Each states a preference; none decides a row.
  - Security checklist bullet 1 applies **S5**'s no-interpolation rule,
    bullet 2 **S3**, bullet 3 **S1**, bullet 4 **S4**.
  - Out of scope: the boot-identity and `ps`/spawn exclusions apply **S1**'s
    no-takeover-change rule; the CAS / heartbeat / new-lock-field exclusions
    apply **S1**; the structured-alert-channel exclusion applies **S5**; the
    alert rate-limiting exclusion applies **S4**. The digest-region exclusion is
    a work-package boundary, not an S fact.
  - The ADR-0012 amendment block: "A stale busy lock is loud" applies **S4** and
    **S5**, its latency sentence **S4**, "An implausible deadline is not trusted"
    **S3**, the closing paragraph **S1**; its Status line is an **S7** fact.
  - The byte-exact user message is decided once, in **S5**. Its paraphrases —
    O4's description and the amendment's summary sentence — describe it and must
    never restate its bytes.
  - "Discovered issues / routed onward" describes work this package does **not**
    do; each paragraph names the S-row whose boundary it sits outside (**S1**
    for the boot identity and for M6 recovery, **S3** for timeout reconciliation,
    **S5** for the alert channel).
- [ ] Frontmatter and title: the scope claim ("stale busy lock must not exit 0",
      "refuse an implausible deadline") mirrors S3 and S4; `size`/`model` are
      process facts.
- [ ] Exact contracts: the result-object block and the "no new field/reason/flag"
      sentence mirror S1.
- [ ] Contract-reference activation paragraph and the worked cases: they mirror
      S2–S5 and decide nothing.
- [ ] Register newly found mirrors here on the spot — including a new operative
      prose step, which is added to the walk above rather than as its own bullet.

## Dispatch precondition — owner items

`status: Ready` requires the owner to settle these. Each is a policy call, not
an implementation detail; none may be resolved silently by the implementer.

**O1 — The staleness bound. (Table S4)**
*Question:* how far past its deadline may a lock stay `busy` before the dream
fails loudly?
*Recommendation:* **six hours past the deadline.** Two constraints bracket it.
It must be **above** any legitimate live overrun a contender can witness: a
same-day catch-up contender can arrive about an hour after a slow owner started
and find it still finalizing, and for a scheduled dream the outer watchdog kills
the owner long before six hours. It must be **below about twenty-four hours** so
that the next nightly run trips it (step 4 of the walk above); a larger bound
costs a second lost night. **Named cost:** an *attended* `wienerdog dream` has
no outer watchdog, so a manual run that legitimately exceeds six hours past its
own deadline would make a contender loud. This spec does not claim that no
legitimate run can trip the gate; it claims that no scheduled one can.
*Overrule cost:* one-constant change to `STALE_LOCK_ALERT_MS` plus the tests
that pin it. Lower (e.g. 2 h) narrows the attended-run margin; higher (e.g. 30 h)
skips the next nightly run and costs a second night.

**O2 — The implausible-deadline cap. (Table S3)**
*Question:* how far in the future may a stored deadline be before the record is
refused as `owner-unknown` instead of trusted as `busy`?
*Recommendation:* **24 hours, or twice the contender's own `timeoutMs` when
that is larger.** A
self-consistent installation can never trip it (the gap is at most `timeoutMs`),
so it costs a legitimate large-timeout user nothing: `dream_timeout_minutes` of
2,880 gives a 96-hour cap against a 48-hour deadline. The one real cost is an
installation whose `dream_timeout_minutes` is cut to less than half its previous
value while a lock is in flight: that lock becomes loud instead of silently
honoured for its remaining life. Loud is the safe direction — nothing is
overwritten, and `owner-unknown` already tells the user to check for a running
dream.
*Overrule cost:* raising the cap widens the window in which a crafted or copied
record silences the dream; removing it restores the unbounded case the review
found. One-constant change either way.

**O3 — Hourly repeat alerts once the stale lock is loud. (Table S4)**
*Question:* from the first loud night onward, no `last_success` is written, so
the hourly catch-up retries and fails loud every hour until a person acts — one
`alerts.jsonl` line and one best-effort self-email per hour.
*Recommendation:* **accept, unchanged.** This is not a new class of behavior:
the `owner-unknown` throw shipped in PR #245 already has exactly this cadence.
Suppression would need per-reason rate limiting the repo does not have, and
`wienerdog alerts ack` deliberately silences only the session digest, never the
email or the exit code.
*Overrule cost:* a new work package for alert rate limiting, blocking this one.

**O4 — May the message tell the user how to recover? (Table S5 vs Table L6)**
*Question:* Table L6 of `WP-dream-live-owner-lock` says "Do not suggest blind
lock deletion". S5's message tells the user to restart the computer and then
delete the lock file. Does L6 stand as written, or is it amended to permit this
instruction?
*Recommendation:* **amend it to permit this instruction.** L6's prohibition is
on *blind* deletion. A restart is the one check a non-developer can perform
identically on macOS, Linux and Windows, and it does not merely observe that no
dream is running — it guarantees it. Naming a per-OS process-inspection command
instead would be three fragile instructions that a non-developer cannot verify.
Without any instruction the log tells the user their memory has stopped and
gives them no action.
*Overrule cost:* S5 loses its recovery sentences and becomes diagnostic only;
no recovery procedure is documented anywhere today.

**O5 — Recovery after a crash is now attended, not automatic.**
*Question:* with the boot-time proof dropped, an unclean shutdown whose PID is
later reused is no longer recovered automatically. Release gate M6 in
`docs/specs/MILESTONES.md` says *"job missed by shutdown (dream included) runs
within an hour of the machine being back."* That still holds whenever the probe
returns `ESRCH` (Table L5's takeover), which is the common case; it does not
hold when the PID has been reused.
*Recommendation:* **accept for this work package.** The alternative is a
takeover authorized by evidence that does not bind the timestamp to the probed
PID, whose failure mode is two dreams sharing one scratch directory with no
`ownsLock` check before promotion. A sound proof needs a payload change, routed
below.
*Overrule cost:* blocks this work package behind the payload-change work package
described under "Discovered issues / routed onward", leaving the silent stall in
place until that lands.

**O6 — Does anything here need an ADR beyond the part-6 amendment?**
*Recommendation:* **no.** S3 narrows which records are trusted and S4/S5 change
how a decline surfaces; both live inside ADR-0012 part 6, which the amendment
below revises. ADR-0004 is untouched (no process is started or kept alive) and
ADR-0031/ADR-0042 are applied, not changed.
*Overrule cost:* a separate ADR draft, blocking dispatch.

## Discovered issues / routed onward

Recorded here, not done here. Each needs its own work package.

- **A sound death proof needs a boot identity bound into the lock.** The
  rejected design compared the lock's `startedAt` against
  `Date.now() - os.uptime() * 1000`. Nothing binds that timestamp to the PID the
  probe found, so a copied or backup-restored lock — or a forward wall-clock
  step larger than any margin — makes a live owner look dead. The sound version
  writes a boot-session identity into the payload at acquisition time and
  compares identities rather than timestamps, so a record from another boot
  session, another machine or a backup is recognisable as such. That is a lock
  payload change, which `WP-dream-live-owner-lock` froze, so it needs its own
  work package and its own ADR-0012 amendment. It would also need to answer what
  a promoting dream does when it discovers mid-run that it no longer owns the
  lock: today `ownsLock` is consulted only before teardown, not before
  promotion.
- **Inner and outer timeout policy are unreconciled.** `dream_timeout_minutes`
  (the lock's own deadline) and `job.timeoutMinutes` (the supervisor's watchdog)
  are validated independently and may disagree, so a supervisor can kill an owner
  whose lock still looks unexpired. Table S3 bounds how long that can hide the
  stall; it does not reconcile the two settings, and reconciling them is
  separate work.
- **`run-job` cannot render a code-owned reason for a child's expected failure.**
  Every non-zero child exit becomes `` `job "<name>" exited <code>` ``, so no
  job body can put its own actionable sentence into the durable alert or the
  email. Table S5 states that limit truthfully rather than working around it. A
  structured channel (a code-owned reason file the supervisor reads, never
  forwarded stderr) would fix it for every job at once.

## Implementation notes & constraints

- **Test seam — extend the one that exists; do not invent a second.**
  `tests/unit/dream-lock.test.js` already drives every branch with
  `t.mock.method(Date, 'now', …)`, `t.mock.method(os, 'hostname', …)` and
  `t.mock.method(process, 'kill', …)`, which work because `lock.js` calls
  `Date.now()`, `os.hostname()` and `process.kill()` through those same module
  objects at call time. Every fixture this work package needs — a lock stale by
  a chosen amount, a far-future deadline — is a seeded record plus a mocked
  `Date.now`. No new seam, no spawn, no clock change.
- **The far-future-deadline fixture must pin `timeoutMs` too.** S3's cap depends
  on the `timeoutMs` argument the contender passes, so a fixture that leaves it
  at the default is testing `max(24 h, 2 × default)` and must say so.
- **Do not add fields to the lock payload.** The boot-identity design that would
  need one is routed above, not done here.
- **Ambiguity → the simpler option, recorded under "Decisions made".** Do not
  expand scope to resolve it.
- No new runtime dependency; plain Node ≥ 18; JSDoc types only; no golden
  fixture changes.
- **Rebase interaction.** `WP-dream-digest-omits-own-job-alerts` is being
  revised in parallel and also edits `src/cli/dream.js`, but a different region:
  it touches the digest regeneration (`regenerateDigest`, step 19, inside the
  `try` block), this one touches the lock-acquisition block at :593-603 and the
  doc comment at :534-538. Whichever lands second rebases; expect a textual
  conflict only if the other work package also edits the `Exit 0`/`Exit 1` doc
  comment, in which case both lists must survive.

## Security checklist

- [ ] The lock record is same-user input under `~/.wienerdog/state/`. S5
      interpolates only a code-derived decimal integer and a code-derived path;
      no `pid`, `host`, `startedAt` or raw file byte reaches the message, the
      per-run log line, the alert reason or the email body.
- [ ] S3 refuses an implausible record rather than trusting it; the refusal uses
      the existing `owner-unknown` path, which overwrites nothing and probes
      nothing.
- [ ] S1 widens nothing about who may be probed or overwritten: Table L3's
      local-host and PID-domain gate and Table L4/L5's takeover rule are
      untouched, and `owner-unknown` still authorizes nothing.
- [ ] S4's three branches mutate neither `state/dream-scratch` nor the lock.

## Acceptance criteria

- [ ] AC1 — S1: `busy` carries `staleForMs` and nothing else changed shape;
      `owner-unknown` and both `acquired` results are field-identical to today,
      and every takeover outcome (`ESRCH`, alive, `EPERM`, other probe error)
      is unchanged.
- [ ] AC2 — S2: `staleForMs` is `now - deadline` on both `busy` branches,
      `<= 0` on the unexpired one, `> 0` on the expired-and-alive one, never
      `NaN`.
- [ ] AC3 — S3: a finite deadline further ahead than the cap is refused as
      `owner-unknown` without probing or mutation; a deadline exactly at the cap
      is not refused; the cap follows `timeoutMs` when `2 * timeoutMs` exceeds
      24 h.
- [ ] AC4 — S4: `staleForMs` above the bound throws; at or below it prints the
      unchanged line and returns exit 0; `owner-unknown` throws its unchanged
      text. No branch collects, mutates scratch, or rewrites/deletes/releases
      the lock.
- [ ] AC5 — S5: the thrown message is byte-exact for a given `staleForMs` and
      state dir, contains no `pid`, `host` or `startedAt`, and an end-to-end run
      shows it on the child's stderr. No assertion claims it reaches
      `alerts.jsonl` or the email.
- [ ] AC6 — S6: the `Exit 1` doc comment names both the unverifiable-owner and
      the stale-lock throw; S7's amendment is appended byte-for-byte with its
      Status line exactly as specified, and every prior amendment survives.
- [ ] AC7 — RED evidence: every declared proof in
      `tests/red-proofs/dream-lock-stale-owner-loud.proofs.json` reports
      `PROVEN` (ADR-0042 — `PROVEN` is the only zero exit; a `FILTERED`
      criterion is not proven). At minimum the declarations must redden S3's
      far-future-deadline comparison and S4's bound comparison, so that a test
      which passes regardless of either is caught.
- [ ] Idempotency — `N/A — this work package ships no command that writes
      outside the repository; repeated declined acquisitions already leave the
      lock bytes and scratch unchanged, which AC4 asserts.`

## Verification steps (run these; paste output in the PR)

```bash
npm test -- tests/unit/dream-lock.test.js tests/integration/dream.test.js
npm test
npm run red-proofs -- --wp WP-dream-lock-stale-owner-loud
npm run lint
node scripts/boundary-check.js docs/specs/WP-dream-lock-stale-owner-loud.md src/core/dream/lock.js src/cli/dream.js tests/unit/dream-lock.test.js tests/integration/dream.test.js tests/red-proofs/dream-lock-stale-owner-loud.proofs.json docs/adr/0012-dream-run-lifecycle.md
git diff --check
```

Every NEW verification assertion needs both directions observed and pasted: a
real green on the implemented state and a real red against a deliberately broken
one (`docs/runbooks/spec-authoring.md`). For AC7 the red side is the machine-run
proof; for the rest it is pasted by hand. Review the appended ADR text against
S7 for AC6.

## Out of scope (do NOT do these)

- **Any change to when a lock may be taken over.** The boot-time proof, a boot
  identity in the payload, and reading a process's start time via `ps`,
  `/proc`, `sysctl` or any spawn are all excluded; the first two are routed
  under "Discovered issues / routed onward", and the third costs a child process
  on the dream's hot path, differs on each supported platform and adds an
  untrusted parsing surface.
- Atomic compare-and-swap for lock acquisition; the Table L5 simultaneous
  stale-claimant race stays as `WP-dream-live-owner-lock` accepted it.
- Heartbeats, lease renewal, automatic kill of a hung dream, a new lock field, a
  new decline reason, or any recovery CLI command.
- A structured channel for `run-job` to render a code-owned reason from a child's
  expected failure, and any change to `src/cli/run-job.js` at all (routed above).
- Rate limiting or deduplicating `alerts.jsonl` (owner item O3).
- Reconciling `dream_timeout_minutes` with `job.timeoutMinutes` (routed above).
- Anything in `src/cli/dream.js`'s digest regeneration — that region belongs to
  `WP-dream-digest-omits-own-job-alerts`.

## ADR-0012 amendment text

Append this block verbatim to `docs/adr/0012-dream-run-lifecycle.md`, after the
existing `## Amendment (2026-09-15): admit complete filtered sessions and report
exclusion causes` section (Table S7). Do not edit it; do not reword its Status
line.

```markdown
## Amendment (2026-09-17): a stale lock must be loud, and an implausible deadline is not trusted — WP-dream-lock-stale-owner-loud

Status: **PROPOSED — awaiting owner signature.**

**Decision (amends part 6 again, after the 2026-09-15 live-owner amendment).**
Table S in `docs/specs/WP-dream-lock-stale-owner-loud.md` is canonical. The
2026-09-15 amendment above stands in full: **which** locks may be taken over is
unchanged by this amendment, and nothing here weakens the retention of a live
local owner.

That amendment accepted, in one clause, that PID reuse "can delay recovery". It
did not examine that the delay is **silent**: a declined-as-busy dream prints one
line and exits 0, so the supervisor records success and clears the job's alerts,
and consolidation can stop indefinitely behind a healthy-looking digest.

**A stale busy lock is loud.** A declined acquisition whose deadline passed more
than six hours ago no longer returns exit 0. It raises a `WienerdogError` through
the existing job-failure path, so the supervisor fails loud, records a durable
alert and sends its best-effort self-email. `busy` within the bound — including
every unexpired lock — keeps today's quiet exit 0 exactly. The message names how
many whole hours the lock has been held past its limit, says that nothing has
been written to the vault since, and tells the user to restart the computer,
which guarantees no dream is running, before deleting the lock file, whose path
it names. The 2026-09-15 prohibition on suggesting **blind** lock deletion
stands; an instruction that first guarantees no owner is alive is not blind. No
transcript text, PID, host or raw lock byte appears in it.

That message reaches the per-run log under `~/.wienerdog/logs/dream/` and an
attended run's terminal. The durable alert and the email carry the supervisor's
own generic exited-non-zero reason and point at that log; no job body can put its
own sentence into them today, and this amendment does not change that.

**Latency, stated plainly.** Because a quiet decline still records success, the
catch-up mechanism skips the job for the remainder of that schedule day. The
first loud result is therefore normally the next day's scheduled run, and from
then on every hourly catch-up fails loud until a person clears the lock. The cost
of a silent stall is at most one lost night. The repeat cadence is not new: the
unverifiable-owner error introduced on 2026-09-15 already behaves this way.

**An implausible deadline is not trusted.** A record whose finite deadline lies
further ahead of now than twenty-four hours, or twice the reading process's own
configured timeout when that is larger, is refused as unverifiable ownership
rather than honoured as busy — the existing loud path, with no probe, no takeover
and no mutation. A self-consistent installation cannot trip this, because a
lock's deadline is its own start plus that same timeout. It catches a crafted or
copied record that would otherwise silence the dream for as long as its deadline
claims.

No heartbeat, lease renewal, automatic kill, new lock field, new decline reason
or recovery command is introduced, and no takeover rule changes. Part 7 and the
unrelated lifecycle and capacity amendments remain in force.
```

## Definition of done

1. Every owner item O1–O6 is settled and the spec is `Ready` before dispatch;
   re-verify C1–C5 at the dispatch revision.
2. All verification steps pass locally; output pasted into the PR body,
   including both directions of every new assertion.
3. Branch `wp/dream-lock-stale-owner-loud`; conventional commits; PR titled
   `fix(dream): make a stale busy dream lock loud (WP-dream-lock-stale-owner-loud)`.
4. PR template filled, including "Decisions made" (or "none"), "Discovered
   issues", WP-prefixed lessons and `Generated-by:`.
5. This spec's `status:` flipped to `In-Review` in the same PR.
6. Both PR review gates have run on the diff and are clean or fully
   dispositioned — they are defined in `docs/runbooks/codex-review.md` and not
   restated here. `In-Review` marks the START of review: this list is complete
   only when review is.
