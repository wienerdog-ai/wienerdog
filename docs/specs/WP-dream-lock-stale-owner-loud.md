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
| C4 | **Complete inventory of everything that observes an `acquireLock` result** (`grep -rn acquireLock tests/ src/ bin/`): the only production consumer is `src/cli/dream.js:593` (C2). Three test files call it. `tests/unit/dream-lock.test.js` drives every branch by mocking through the module objects the source already calls — `t.mock.method(Date, 'now', …)`, `t.mock.method(os, 'hostname', …)`, `t.mock.method(process, 'kill', …)`, `t.mock.method(fs, 'readFileSync', …)` — and `assert.deepEqual`s the whole result object at lines 38, 57, 76, 103, 120, 124, 141 and 154. `tests/unit/dream-pipeline.test.js:919-921` runs `acquireLock` in a child with `Date.now` pinned to `record.deadline + 1` and deep-compares the output to `{ acquired: false, stolen: false, reason: 'busy' }`; that is the one deep-compare outside the lock suite, and it is why that file is in the Deliverables table. `tests/integration/dream.test.js:524` and `:610` call `acquireLock` in helper children for its side effect only and assert nothing about the returned object; `:600-660` asserts the two decline behaviors end to end, the first seeding an expired lock with `acquireLock(state, -1)` (≈1 ms past its deadline), the second seeding unparseable bytes. No other file in the repository reads the result (`tests/red-proofs/quarantine-preserve-durability.proofs.json` and `src/core/dream/validate.js:824` mention the name in prose only). |
| C5 | `readDreamConfig` (`src/core/dream/config.js:56-65`) accepts any finite positive `dream_timeout_minutes` with no maximum. The scheduled outer watchdog is derived independently from `job.timeoutMinutes` (`src/cli/run-job.js:496-505`), so an inner timeout larger than the outer one is representable: the supervisor kills the owner while its lock still looks unexpired. ADR-0012's `## Amendment (2026-09-15): preserve live dream lock ownership after expiry` is the most recent amendment to part 6; it is silent on how a user learns that recovery has been delayed. |

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file itself (the status flip),
     package-lock.json, memory/lessons/inbox.md, and docs/specs/logbook/. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/core/dream/lock.js | Table S1–S3: the `staleForMs` field on `busy` and the implausible-deadline refusal. |
| modify | src/cli/dream.js | Table S4–S6: the staleness gate, its message, and the Exit-1 doc-comment errata. |
| modify | tests/unit/dream-lock.test.js | Table S1–S3, including the existing whole-object `busy` assertions (C4). |
| modify | tests/unit/dream-pipeline.test.js | Table S1 only: the deep-compared busy object at `:921` gains `staleForMs` (C4). No other change. |
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
| S3 | Implausible-deadline refusal | After L2 validates `deadline` as a finite number and **before** L2's `now <= deadline` busy branch: if `existing.deadline - now > 86400000` — an **absolute** twenty-four hours, with no multiplication, so no overflow and no dependence on the contender's own `timeoutMs` — the record is refused as **`owner-unknown`**, the existing loud path, with no takeover, no probe and no mutation of the lock or scratch. The cap is deliberately independent of configuration: `readDreamConfig` accepts any finite positive `dream_timeout_minutes` (C5), so a cap derived from it inherits that unboundedness and a twenty-day deadline stays silently unexpired for twenty days. This bounds how long any record — crafted, copied, or written under a configured timeout longer than a day — can read as unexpired. **Consequence, stated:** an installation that legitimately sets `dream_timeout_minutes` above 1,440 has its own lock refused by a contender for the part of its life that is more than 24 h ahead. That is loud, never silent, and never a takeover; O2 prices it. |
| S4 | The loud gate (`src/cli/dream.js`) | On `!lock.acquired`, in order: (1) `reason === 'owner-unknown'` throws the existing Table L6 `WienerdogError` with its text unchanged; (2) otherwise, if `lock.staleForMs > STALE_LOCK_ALERT_MS` — a module constant in `src/cli/dream.js` equal to `6 * 60 * 60 * 1000` — throw a `WienerdogError` carrying S5's text; (3) otherwise print the existing `wienerdog: another dream holds the lock.` and `return`. All three branches keep L6 intact: none collects, none touches `state/dream-scratch`, none rewrites, deletes or releases the lock. Branch (3) is byte-identical to today's behavior, including its exit 0. The bound is measured past the deadline, which already contains the whole configured `dream_timeout_minutes`. The comparison is **strict** (`>`): making it `>=` was evaluated against the worst case in "The alert latency, walked" and moves it by one minute rather than by a whole run, so the simpler existing form stands. |
| S5 | The stale-lock message and where it is actually read | One code-owned string with exactly two interpolations: `` `dream lock is stale: a dream has held it for more than ${hours} hours past its own time limit, so no later dream has run and nothing new has been written to your vault since then. Restart this computer — that ends whatever run left the lock behind, and Wienerdog normally clears the lock by itself the next time it runs. Only if you see this same message again after a restart: first make sure no dream is running at that moment — none that you started yourself in a terminal, and none that Wienerdog started on its own in the last half hour (it runs overnight, and hourly while it is catching up) — and only then delete the file ${lockFile}. The next dream will run normally after that.` `` where `hours = Math.min(Math.floor(lock.staleForMs / 3600000), 9999)` (decimal digits only; the cap keeps a "more than N" claim true) and `lockFile = path.join(paths.state, 'dream.lock')`. No `pid`, no `host`, no `startedAt` and no byte read from the lock file appears in the text — Table L6's no-interpolation rule is kept. **Restart first, delete only on repeat:** after a restart the recorded PID is normally gone, so the next run's probe returns `ESRCH` and Table L5's existing takeover clears the lock unattended — the restart is usually the whole cure, and the deletion is both unnecessary and the only destructive step. Deletion is therefore conditioned on the message *reappearing*. **Repetition is a trigger, never an identification:** a second message does not establish that the file is the same record the first one diagnosed. Between the two, Table L5's takeover may have replaced it, and a fresh attended dream may be the legitimate owner of the new record, overrunning its own deadline exactly as O1 admits. The only thing that makes the deletion safe is the user's own check that no dream is running at that moment, which is why the message requires it in those terms rather than asking only whether one is about to start. **Named residual:** the instruction rests on that human check. If the user deletes while a dream is in fact running — because the check was wrong, or because a scheduled or catch-up run acquired the lock between the check and the `rm` — a later run can acquire and destructively rebuild the shared scratch directory underneath the live one. O4 prices it. No scheduler-disable procedure is prescribed. **Delivery, stated truthfully:** under the scheduler this text reaches the per-run log under `~/.wienerdog/logs/dream/` via the child's piped stderr and nothing else; the durable alert and the self-email carry `run-job`'s generic `` `job "dream" exited 1` `` plus that log hint. The byte-exact text is what an attended `wienerdog dream` prints, and what a user or their assistant finds in the log the alert points at. This is exactly the surface the `owner-unknown` throw shipped by `WP-dream-live-owner-lock` already has; no structured stderr channel is introduced. |
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

In this walked case — a lock that is **already expired** when the first
contender sees it, which is what a crash under the default 20-minute timeout
leaves behind — the cost of a silent stall is **one lost night**, after which
the alert repeats hourly.

**The worst case is longer than that, because the bounds are only sampled when a
run happens.** A record may claim a deadline in the future. S3 caps that at 24
hours; below the cap the record reads as unexpired and is quiet, and only after
it expires must it also exceed S4's six-hour bound. Those two are **not**
additive on their own: a quiet decline writes `last_success`, so `catchUp`
stops sampling for the rest of that schedule day and the next observation is
normally the following 03:30. The true maximum is therefore
**24 h (S3's cap) + 6 h (S4's bound) + up to 24 h of sampling interval = 54
hours, with three scheduled runs lost before the loud one.**

The alignment that attains it: a catch-up at 21:30 on day 1 observes a deadline
exactly 24 h ahead (S3 permits exactly 24 h, so this is quiet); day 2's 03:30 run
is still 18 h before that deadline (quiet); day 3's 03:30 run is exactly 6 h past
it, and S4's comparison is strict, so that is quiet too; day 4's 03:30 run is 30 h
past it and is loud. **Making S4's comparison `>=` does not help:** it would
redden that one knife-edge alignment, but shifting the first observation by a
minute restores a 53 h 59 m worst case, because the bound is set by the sampling
interval and not by the comparison. The strict form stands (S4).

**The realistic case is the walked one above: one lost night.** Reaching 54 hours
requires a record whose deadline is nearly a day in the future, which the default
20-minute `dream_timeout_minutes` never produces. Before S3 there was no bound at
all: a twenty-day deadline stayed quiet for twenty days (C5).

The repeat cadence is not new: the `owner-unknown` throw shipped in PR #245
already behaves this way (O3).

Worked cases, all deferring to Table S:

- Lock whose deadline has not passed → L2 returns `busy` before any probe,
  `staleForMs <= 0`, quiet, exit 0.
- Lock from a dream that is genuinely still running, 40 minutes past a 20-minute
  deadline → probe alive, `staleForMs` ≈ 2.4e6, below the bound → quiet, exit 0,
  exactly as today (Table L7 preserved).
- The same lock a day later → S4 branch (2) throws.
- Deadline exactly 24 h ahead of the observing run → S3 does not refuse it (its
  comparison is strict) and L2 returns `busy`; a later run exactly 6 h past that
  deadline is also quiet, because S4's comparison is strict too. Both boundaries
  are quiet by construction, and "The alert latency, walked" shows what that
  costs.
- Record whose deadline is more than 24 h ahead — a year, or a legitimate
  twenty-day configured timeout — → S3 refuses it as `owner-unknown` and the
  dream throws the unchanged L6 error. Exactly 24 h ahead is not refused.
- Unreadable, foreign-host or invalid-PID lock → `owner-unknown`, unchanged.

### Mirrored Surface Checklist

Every surface below mirrors Table S. A finding updates Table S **and every
registered mirror in the same commit** — no commit may exist in which the table
and a registered mirror disagree. A new mirror found in review is added here in
the same pass.

- [ ] **Deliverables-table cells that restate a path or rule** — every Notes
      cell cites the S-rows its file carries (lock.js → S1–S3, dream.js →
      S4–S6, `dream-pipeline.test.js` → S1 only, each other test file → the
      rows it asserts, the proofs file → ADR-0042, the ADR → S7). A cell may
      name a row; it may not restate the rule.
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
  - "The alert latency, walked", steps 1–5 and the paragraphs after them:
    applies **S4** branch (3) and its strict comparison for the one-night
    realistic case, and **S3**'s cap plus the sampling interval for the
    fifty-four-hour maximum, over the `run-job`/`catchUp` facts recorded in
    Context. It decides nothing, it is the only place this spec derives a
    latency, and it is where S4's `>` versus `>=` question was settled. No other
    surface may carry an unqualified "one lost night", or any figure other than
    54 h / three lost runs for the maximum.
  - Implementation notes, "Do not add fields to the lock payload": applies
    **S1**.
  - Implementation notes, "The `busy` shape change reaches exactly one test
    outside the lock suite": applies **S1** and mirrors C4's inventory.
  - Implementation notes, rebase interaction: the named `src/cli/dream.js`
    regions are the ones **S4** and **S6** edit.
  - Dispatch precondition O1 applies **S4**, O2 **S3**, O3 the repeat cadence
    **S4** causes, O4 **S5**'s restart-first, no-dream-running recovery instruction and
    its named human-check residual against Table L6, O5 the recovery consequence
    of leaving takeover unchanged (**S1**), O6 **S7**'s scope. Each states a
    preference; none decides a row.
  - Security checklist bullet 1 applies **S5**'s no-interpolation rule,
    bullet 2 **S3**, bullet 3 **S1**, bullet 4 **S4**.
  - Out of scope: the boot-identity and `ps`/spawn exclusions apply **S1**'s
    no-takeover-change rule; the CAS / heartbeat / new-lock-field exclusions
    apply **S1**; the structured-alert-channel, attended-recovery-command and
    scheduler-disable exclusions apply **S5**; the alert rate-limiting and
    no-end-to-end-scheduler-test exclusions apply **S4**; the
    `dream_timeout_minutes` validation exclusion applies **S3**. The digest-region exclusion is a work-package boundary, not an S
    fact.
  - The ADR-0012 amendment block: "A stale busy lock is loud" applies **S4** and
    **S5**, its delivery paragraph **S5**, its latency paragraph **S4** *and*
    **S3** (both bounds, the sampling interval, and both the realistic and the
    54-hour figures), "An implausible deadline is not trusted" **S3**, the
    closing paragraph **S1**; its Status line is an **S7** fact.
  - The byte-exact user message is decided once, in **S5**. Its paraphrases —
    O4's description and the amendment's summary sentence — describe it and must
    never restate its bytes.
  - "Discovered issues / routed onward" describes work this package does **not**
    do; each paragraph names the S-row whose boundary it sits outside (**S1**
    for the boot identity and for M6 recovery, **S3** for validating
    `dream_timeout_minutes` and reconciling inner against outer timeouts,
    **S5** for the attended recovery command and for the alert channel).
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
*Recommendation:* **an absolute 24 hours, independent of configuration.** A cap
derived from the contender's own `timeoutMs` was tried and rejected in review:
`readDreamConfig` puts no maximum on `dream_timeout_minutes` (C5), so such a cap
inherits that unboundedness and a twenty-day deadline stays quiet for twenty
days — the very silence this work package exists to end. An absolute constant
also has no multiplication, so no `Infinity` from overflow. **The cost, priced:**
an installation that legitimately sets `dream_timeout_minutes` above 1,440 has
its own lock refused by a contender for the part of its life that is more than
24 h ahead of the contender's clock. That is loud, never silent, and never a
takeover — the contender declines as `owner-unknown`, which overwrites nothing
and leaves scratch alone. Such a value is more than seventy times the default
and already exceeds any plausible supervisor watchdog, so validating
`dream_timeout_minutes` itself is the real fix; it is routed under "Discovered
issues / routed onward", not done here.
*Overrule cost:* raising the cap widens the window in which a crafted, copied or
long-timeout record silences the dream, night for night; removing it restores the
unbounded case review found twice. One-constant change either way.

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
lock deletion". S5's message tells the user to restart, and to delete the lock
file **only if the same message reappears afterwards, and only after checking
that no dream is running**. Does L6 stand as written, or is it amended to permit
this instruction?
*Recommendation:* **amend it to permit this instruction.** L6's prohibition is on
*blind* deletion, and this is not blind twice over. First, a restart is the one
step a non-developer can perform identically on macOS, Linux and Windows, and
after it the recorded PID is normally gone, so the next scheduled or catch-up run
probes `ESRCH` and Table L5's existing takeover clears the lock with no human
action at all — the deletion is reached only when that automatic cure did not
work. Second, the message requires the user to establish that **no dream is
running at that moment** before deleting anything, in terms a non-developer can
act on without a command: nothing they started themselves, and nothing Wienerdog
started in the last half hour. That check is the safety, and it is the only
safety — repetition of the message is a trigger for looking, never a proof about
the file. A second message does **not** establish that the record is the one the
first message diagnosed: Table L5's takeover may have replaced it in between, and
a fresh attended dream can legitimately be the new owner, overrunning its own
deadline exactly as O1 admits.
**Named residual:** the instruction rests on a human check. If the user deletes
while a dream is in fact running — the check was wrong, or a scheduled or
catch-up run acquired the lock between the check and the `rm` — a later run can
acquire and destructively rebuild shared scratch underneath the live one. The
wording narrows the window; it does not close it. Closing it needs an attended
conditional-recovery command that compares the diagnosed record with the current
one and re-checks ownership immediately before removal — its own work package,
routed under "Discovered issues / routed onward", not designed here. No
scheduler-disable procedure is prescribed: telling a non-developer to disable and
re-enable an OS schedule entry is a larger and more dangerous instruction than
the race it would remove.
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
- **`dream_timeout_minutes` has no maximum, and inner and outer timeout policy
  are unreconciled.** `readDreamConfig` accepts any finite positive value (C5),
  and `job.timeoutMinutes` (the supervisor's watchdog) is validated
  independently, so a supervisor can kill an owner whose lock still looks
  unexpired for days. Table S3's absolute cap bounds how long that can hide the
  stall at 24 hours; it does not validate the setting and it does not reconcile
  the two. Both belong to one follow-on work package: give
  `dream_timeout_minutes` a supported maximum, and decide whether the lock's
  deadline should be derived from the supervisor's watchdog rather than set
  independently of it.
- **An attended conditional-recovery command.** Table S5's deletion step carries
  a named race (O4): the record can be replaced by Table L5's takeover, or a
  contender can legitimately acquire it, between the diagnosis and the user's
  `rm`. A command that re-reads the record, compares it byte-for-byte with the
  one that was diagnosed, re-probes its PID and removes the file only if both
  still agree would close it, and would also give the user something safer to
  copy than a path. It needs its own work package: a new CLI surface, its own
  argument and confirmation design, and its own boundary against the scheduler.
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
- **The `busy` shape change reaches exactly one test outside the lock suite.**
  C4 is the complete inventory; `tests/unit/dream-pipeline.test.js:921` is the
  only deep-compare elsewhere, and its fixture pins the contender's clock to
  `record.deadline + 1`, so the field it gains has the deterministic value `1`.
  Keeping the result shape unchanged and exporting a second staleness helper was
  considered and rejected: the parsed record lives only inside `acquireLock`, so
  a helper would have to re-read and re-parse the lock file, which adds a second
  exported contract, a second read and a time-of-check window — three new
  surfaces in place of one changed expectation with a deterministic value.
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
- [ ] S3 refuses an implausible record rather than trusting it, on an absolute
      bound that no configuration value can widen; the refusal uses the existing
      `owner-unknown` path, which overwrites nothing and probes nothing.
- [ ] S1 widens nothing about who may be probed or overwritten: Table L3's
      local-host and PID-domain gate and Table L4/L5's takeover rule are
      untouched, and `owner-unknown` still authorizes nothing.
- [ ] S4's three branches mutate neither `state/dream-scratch` nor the lock.

## Acceptance criteria

- [ ] AC1 — S1: `busy` carries `staleForMs` and nothing else changed shape;
      `owner-unknown` and both `acquired` results are field-identical to today,
      and every takeover outcome (`ESRCH`, alive, `EPERM`, other probe error)
      is unchanged. Every deep-compared result in C4's inventory — the lock
      suite's and `tests/unit/dream-pipeline.test.js:921` — agrees with the
      implemented shape.
- [ ] AC2 — S2: `staleForMs` is `now - deadline` on both `busy` branches,
      `<= 0` on the unexpired one, `> 0` on the expired-and-alive one, never
      `NaN`.
- [ ] AC3 — S3: a finite deadline more than 24 h ahead of `now` is refused as
      `owner-unknown` without probing or mutation; a deadline exactly at 24 h is
      not refused; the refusal is unchanged by the `timeoutMs` argument,
      including a large configured timeout (e.g. `dream_timeout_minutes` of
      28,800 = 20 days) whose own lock would otherwise read as unexpired for
      weeks.
- [ ] AC4 — S4: `staleForMs` above the bound throws; at or below it — including
      **exactly** at six hours, where the strict comparison is quiet — prints the
      unchanged line and returns exit 0; `owner-unknown` throws its unchanged
      text. No branch collects, mutates scratch, or rewrites/deletes/releases
      the lock.
- [ ] AC5 — S5: the thrown message is byte-exact for a given `staleForMs` and
      state dir, contains no `pid`, `host` or `startedAt`, conditions its
      deletion step on both a repeat after a restart and on no dream running at
      that moment, and an end-to-end run shows it on the child's stderr. No
      assertion claims it reaches `alerts.jsonl` or the email.
- [ ] AC6 — S6: the `Exit 1` doc comment names both the unverifiable-owner and
      the stale-lock throw; S7's amendment is appended byte-for-byte with its
      Status line exactly as specified, and every prior amendment survives.
- [ ] AC7 — RED evidence: every declared proof in
      `tests/red-proofs/dream-lock-stale-owner-loud.proofs.json` reports
      `PROVEN` (ADR-0042 — `PROVEN` is the only zero exit; a `FILTERED`
      criterion is not proven). At minimum the declarations must redden S3's
      24-hour comparison (including under a large configured timeout) and S4's
      bound comparison, so that a test which passes regardless of either is
      caught.
- [ ] Idempotency — `N/A — this work package ships no command that writes
      outside the repository; repeated declined acquisitions already leave the
      lock bytes and scratch unchanged, which AC4 asserts.`

## Verification steps (run these; paste output in the PR)

```bash
npm test -- tests/unit/dream-lock.test.js tests/unit/dream-pipeline.test.js tests/integration/dream.test.js
npm test
npm run red-proofs -- --wp WP-dream-lock-stale-owner-loud
npm run lint
node scripts/boundary-check.js docs/specs/WP-dream-lock-stale-owner-loud.md src/core/dream/lock.js src/cli/dream.js tests/unit/dream-lock.test.js tests/unit/dream-pipeline.test.js tests/integration/dream.test.js tests/red-proofs/dream-lock-stale-owner-loud.proofs.json docs/adr/0012-dream-run-lifecycle.md
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
- An attended conditional-recovery command, and any scheduler-disable /
  re-enable procedure in the message or the docs (both routed above; O4).
- **An end-to-end scheduler test of the 54-hour latency.** Reproducing it needs
  `run-job`'s `last_success` watermark and `catchUp`'s due predicate across three
  simulated schedule days, and `src/cli/run-job.js` is outside this work
  package's Deliverables boundary. The latency is a stated consequence of S3 and
  S4 over behavior this spec records in Context, not a behavior this spec ships;
  what the tests must pin are S3's and S4's own boundaries (AC3, AC4).
- Rate limiting or deduplicating `alerts.jsonl` (owner item O3).
- Validating or capping `dream_timeout_minutes`, and reconciling it with
  `job.timeoutMinutes` (routed above). Table S3 bounds the damage; it does not
  fix the setting.
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
been written to the vault since, and tells the user to restart the computer —
after which the recorded process is normally gone, so the next run's existing
signal-zero probe returns `ESRCH` and the unchanged automatic takeover clears
the lock with no further action. Deleting the lock file, whose path the message
names, is instructed **only if the same message reappears after a restart**, and
only after the user has established that no dream is running at that moment —
none they started themselves, and none Wienerdog started in the last half hour.
The 2026-09-15 prohibition on suggesting **blind** lock deletion stands, and that
check is what makes this instruction not blind. A repeated message is a trigger
for looking, not evidence about the file: the record may have been replaced by
the automatic takeover in between, and a fresh attended dream may legitimately
own the new one. The residual is therefore that the instruction rests on a human
check — a deletion made while a dream is running lets a later run rebuild shared
scratch underneath it. An attended recovery command that compares the diagnosed
record with the current one immediately before removal would close it and is not
introduced here. No transcript text, PID, host or raw lock byte appears in the
message.

That message reaches the per-run log under `~/.wienerdog/logs/dream/` and an
attended run's terminal. The durable alert and the email carry the supervisor's
own generic exited-non-zero reason and point at that log; no job body can put its
own sentence into them today, and this amendment does not change that.

**Latency, stated plainly.** Because a quiet decline still records success, the
catch-up mechanism skips the job for the remainder of that schedule day. For a
lock that is already expired when the first contender sees it, the first loud
result is therefore the next day's scheduled run — one lost night — and from then
on every hourly catch-up fails loud until a person clears the lock. That is the
realistic case, and the only one the default twenty-minute timeout can produce.
A record that still claims a future deadline is quiet until that deadline passes,
which the next paragraph bounds at twenty-four hours. Because a quiet decline
records success, those bounds are only sampled once a day, so the true maximum is
twenty-four hours of unexpired life, plus the six-hour bound, plus up to a full
day until the next run observes it: **fifty-four hours, with three scheduled runs
lost before the loud one.** The repeat cadence is not new: the unverifiable-owner
error introduced on 2026-09-15 already behaves this way.

**An implausible deadline is not trusted.** A record whose finite deadline lies
more than twenty-four hours ahead of now is refused as unverifiable ownership
rather than honoured as busy — the existing loud path, with no probe, no takeover
and no mutation. The bound is absolute and independent of configuration,
deliberately: `dream_timeout_minutes` has no validated maximum, so a bound
derived from it would inherit that and let a record silence the dream for as long
as its own timeout claims. The cost is that an installation configuring a dream
timeout longer than a day has its own lock refused by a contender for the part of
its life that is more than a day ahead — loud, never silent, and never a
takeover. Giving that setting a supported maximum, and reconciling it with the
supervisor's independently configured watchdog, is separate work.

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
