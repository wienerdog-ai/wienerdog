---
id: WP-dream-lock-stale-owner-loud
title: Make a stale busy dream lock loud, and treat a pre-boot owner as proven dead
status: Draft
model: sonnet
size: M
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
adds no process, no timer, no watcher: it reads two numbers that are already in
hand and changes which branch the existing code takes.

**The dream is the nightly consolidation job.** `wienerdog dream` acquires
`state/dream.lock` *before* it rebuilds the shared scratch directory
`state/dream-scratch` (a destructive `rm` + `mkdir` + write), and holds that lock
through preprocessing, the brain run, validation/promotion and cleanup. The lock
file's payload is one line of JSON with no trailing newline:
`{"pid":…,"host":…,"startedAt":"<ISO>","deadline":<epoch ms>}`. `deadline` is
acquisition time plus `dream_timeout_minutes` (default 20, so 1,200,000 ms).
That payload has been unchanged since WP-008 (`git log -S startedAt --
src/core/dream/lock.js` names exactly one commit, `f17c7c72`), so every lock
that can exist in the wild carries all four fields.

**The schedule around it.** `src/cli/schedule.js` registers the dream at
**03:30** (`ensureDreamSchedule`, `const at = '03:30'`). A separate catch-up
entry fires **at login and hourly on the hour** (macOS `catchupPlist` renders
`RunAtLoad` plus a `StartCalendarInterval` with `Minute` 0 and no `Hour`;
Windows `windowsCatchupTaskXml` repeats at `PT1H`; Linux gets native replay from
`Persistent=true`). `catchUp` in `src/cli/run-job.js` runs a job only when
`now >= todaysFire(job.at) && (!last_success || last_success < fire)`. That
matters twice below: a run that exits **0** writes `last_success` and stops the
catch-up for that day; a run that exits **1** does not, so the catch-up retries
every hour. Release gate M6 in `docs/specs/MILESTONES.md` is binding here: *"job
missed by shutdown (dream included) runs within an hour of the machine being
back."*

**What `run-job` does with the exit code.** On a clean exit 0 it writes
`last_success` and calls `clearAlerts(paths, name)`, deleting every
`state/alerts.jsonl` line for that job. On a failure it "fails loud": one
`appendAlert` line plus a best-effort self-email, and the next `renderDigest`
puts a `> [!warning]` callout for that job into `state/digest.md`, which the
SessionStart hook injects into every new session.

**The defect this work package fixes.** `WP-dream-live-owner-lock` (PR #245)
correctly stopped the dream from stealing an expired lock whose local owner is
still alive. Its Table L4 accepted one residual in one sentence: *"A reused PID
pointing at an unrelated live process conservatively blocks recovery."* What
that sentence did not examine is that the block is **silent**. A dream dies
uncleanly (power loss, forced reboot, `SIGKILL`) and leaves its lock; its PID is
later held by an unrelated long-lived process; every later nightly and hourly
run probes that PID, sees it alive, prints one line and **returns exit 0**.
`run-job` records success, clears any prior alert, and the digest shows a
healthy job — while consolidation has stopped indefinitely. Before PR #245 an
expired lock was always stolen, so this self-healed at the next run. Two changes
restore that: prove the owner dead when the machine has rebooted since it
started (Table S3/S4), and make a lock that stays stale beyond a bound fail
loudly instead of quietly (Table S5/S6).

## Current state

Inspected at `b4af715e` (merge of PR #245). Re-verify at dispatch.

| Claim | Current owner and behavior |
|---|---|
| C1 | `src/core/dream/lock.js` exports `acquireLock(stateDir, timeoutMs)`, `releaseLock(stateDir)`, `ownsLock(stateDir)`. `acquireLock` writes with `wx`; on `EEXIST` it parses the record, returns `owner-unknown` for an unreadable/non-object/array record or a non-finite non-number `deadline`, returns `busy` when `now <= deadline`, then requires `existing.host === os.hostname()` and an integer `pid` in `[1, 2147483647]` (else `owner-unknown`), then `process.kill(pid, 0)`: success or `EPERM` → `busy`; `ESRCH` → overwrite + `{acquired:true, stolen:true}`; any other error → `owner-unknown`. It requires `node:fs`, `node:os`, `node:path` and calls no other module. `os.uptime()` is not called anywhere in `src/`. |
| C2 | `src/cli/dream.js:593-603` is the only consumer of the result: `const lock = acquireLock(paths.state, cfg.timeoutMs); if (!lock.acquired) { if (lock.reason === 'owner-unknown') throw new WienerdogError('dream lock owner could not be verified; no takeover was attempted. Check whether an earlier dream is still running before arranging lock recovery.'); console.log('wienerdog: another dream holds the lock.'); return; } if (lock.stolen) console.warn('wienerdog: warning — stole a stale dream lock from a prior run that never released it.');` — the `console.log` branch returns before the `try` block, so it collects nothing and touches neither scratch nor the lock. |
| C3 | `src/cli/dream.js:534-538` is `run`'s doc comment. Its `Exit 1` line reads `expected failure (WienerdogError): no vault, dirty tree, brain failure/timeout, git error.` — it does **not** mention the `owner-unknown` throw that C2 already ships. That omission is errata this work package folds in (Table S7). |
| C4 | `tests/unit/dream-lock.test.js` drives every branch by mocking through the module objects the source already calls: `t.mock.method(Date, 'now', …)`, `t.mock.method(os, 'hostname', …)`, `t.mock.method(process, 'kill', …)`, `t.mock.method(fs, 'readFileSync', …)`. Several tests `assert.deepEqual` the whole `busy` object, so adding a field to it changes those assertions. `tests/unit/dream-pipeline.test.js:961-985` drives the CLI decline branches through probe codes and asserts `result.output` / `result.thrown.message`. `tests/integration/dream.test.js:600-660` asserts the two decline behaviors end to end against real child processes. |
| C5 | ADR-0012's `## Amendment (2026-09-15): preserve live dream lock ownership after expiry — WP-dream-live-owner-lock` is the most recent amendment to part 6. It records `startedAt` as informational and states that PID reuse "can delay recovery". It is silent on how the user learns that recovery has been delayed. |

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file itself (the status flip),
     package-lock.json, memory/lessons/inbox.md, and docs/specs/logbook/. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/core/dream/lock.js | Table S1–S4: the `staleForMs` field on `busy`, and the boot-derived proof on the probe-alive branch. |
| modify | src/cli/dream.js | Table S5–S7: the staleness gate, its message, and the Exit-1 doc-comment errata. |
| modify | tests/unit/dream-lock.test.js | Table S1–S4, including the existing whole-object `busy` assertions. |
| modify | tests/unit/dream-pipeline.test.js | Table S5–S6 at the CLI decline branches. |
| modify | tests/integration/dream.test.js | Table S5–S6 end to end; the existing S-unchanged decline tests must still pass. |
| create | tests/red-proofs/dream-lock-stale-owner-loud.proofs.json | ADR-0042 declarations whose `suite` is `tests/unit/dream-lock.test.js`. |
| modify | docs/adr/0012-dream-run-lifecycle.md | Table S8: append the block in "ADR-0012 amendment text" below, byte-for-byte. |

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
field, no new state file, no new CLI flag, no new configuration setting, no new
runtime dependency. `os.uptime()` is a read from `node:os`, which
`src/core/dream/lock.js` already requires.

## Contract reference

ADR-0031's activation trigger fires on four of its seven tests: (ii) the decline
taxonomy gains a field, (iv) the error/fallback behavior of a declined
acquisition changes, (v) `lock.js` emits staleness evidence that `dream.js`
alone interprets into a policy decision, and (vii) the same facts are mirrored
into the ADR amendment, the tests and the acceptance criteria. **Table S is
canonical**; every other surface in this spec cites it rather than restating it.

### Table S — stale-lock evidence, the death proof, and the loud gate

| ID | Contract | Rule |
|---|---|---|
| S1 | Result shape | Only the `busy` result changes: it gains `staleForMs` (S2). `owner-unknown` and both `acquired` results keep their exact current fields. Exported signatures, the lock path and the lock payload bytes are unchanged. Everything Table L of `WP-dream-live-owner-lock` decides that is not named in S2–S4 stays exactly as shipped, including L1 ordinary acquisition, L2 read/age ordering, L3 local-owner identity, the `owner-unknown` outcomes and the L5 non-atomic stale-claimant residual. |
| S2 | `staleForMs` | `now - existing.deadline`, computed from the same `now` and the same `deadline` that L2 already validated as a finite number, so it is never `NaN`. It is returned on **both** `busy` branches: `<= 0` on the unexpired branch (L2's `now <= deadline`, which still returns before any identity check or probe), `> 0` on the expired-and-alive branch (S4). It is a number on every `busy` result; no caller may treat its absence as meaningful. |
| S3 | Pre-boot death proof (internal to `lock.js`) | An internal boolean, computed **only** on the branch S4 names. It is `true` if and only if all of: `typeof existing.startedAt === 'string'`; `startedMs = Date.parse(existing.startedAt)` is finite; `u = os.uptime()` is finite and `>= 0`; and `startedMs < (now - u * 1000) - 60000`. The `60000` is the **boot margin**, a module constant in `src/core/dream/lock.js`. Every other case — missing, non-string or unparseable `startedAt`, a `startedAt` at or after the estimated boot, a non-finite or negative `os.uptime()` — is `false`, meaning *not established*, never *disproved*. No spawn, no `ps`, no file read beyond the lock record, nothing that outlives the call (ADR-0004). This boolean is never returned to any caller. |
| S4 | What the proof authorizes | The proof is evaluated at exactly one point: the expired record that passed L3 (exact local `os.hostname()`, integer PID in `[1, 2147483647]`) whose `process.kill(pid, 0)` probe **succeeded or returned `EPERM`** — the branch that today returns `busy`. There, `true` performs the existing overwrite takeover and returns `{acquired:true, stolen:true}`, reusing the unchanged stolen-lock `console.warn` text in `dream.js`; `false` returns `busy` with S2. The proof is **never** consulted on any other branch: an unexpired lock, an unreadable/invalid record, a foreign host, an invalid PID, an `ESRCH` probe (which already takes over, L5) and any other probe error all behave exactly as shipped. **Accepted residual:** this infers death from an estimate of boot time. It is wrong only when `os.uptime()` under-reports wall-clock time since boot by more than the boot margin *while the owner is genuinely alive* — for example a forward wall-clock step larger than the margin on a platform whose uptime derives from a monotonic counter. The margin bounds ordinary clock slew and `os.uptime()`'s whole-second resolution; no finite margin bounds an arbitrary step, and this spec claims none. |
| S5 | The loud gate (`src/cli/dream.js`) | On `!lock.acquired`, in order: (1) `reason === 'owner-unknown'` throws the existing L6 `WienerdogError` with its text unchanged; (2) otherwise, if `lock.staleForMs > STALE_LOCK_ALERT_MS` — a module constant in `src/cli/dream.js` equal to `6 * 60 * 60 * 1000` (six hours, measured **past the deadline**, which already includes the whole configured `dream_timeout_minutes` allowance) — throw a `WienerdogError` carrying S6's text; (3) otherwise print the existing `wienerdog: another dream holds the lock.` and `return`. All three branches keep L6 intact: none collects, none touches `state/dream-scratch`, none rewrites, deletes or releases the lock. Branch (3) is byte-identical to today's behavior, including its exit 0. |
| S6 | The stale-lock message | One code-owned string with exactly two interpolations: `` `dream lock is stale: a dream has held it for more than ${hours} hours past its own time limit, so no later dream has run and nothing new has been written to your vault since then. A dream may still be running on this computer — check for one first. If none is running, delete ${lockFile} and the next dream will run.` `` where `hours = Math.min(Math.floor(lock.staleForMs / 3600000), 9999)` (decimal digits only; the cap keeps a "more than N" claim true) and `lockFile = path.join(paths.state, 'dream.lock')`. No `pid`, no `host`, no `startedAt`, and no byte read from the lock file appears in the text — L6's no-interpolation rule is kept. This message is the reason recorded by `appendAlert` and the body of the fail-loud self-email. |
| S7 | Exit-code doc-comment errata | `src/cli/dream.js:534-538`'s `Exit 1` list must name every `WienerdogError` this function can raise on the lock path: the unverifiable-owner throw shipped by `WP-dream-live-owner-lock` (today omitted, C3) **and** S5's stale-lock throw. The `Exit 0` line keeps "another dream running" for branch (3) of S5 only. |
| S8 | ADR amendment | Append the block under "ADR-0012 amendment text" below to `docs/adr/0012-dream-run-lifecycle.md`, byte-for-byte, after the existing `## Amendment (2026-09-15): admit complete filtered sessions …` section. Every existing amendment, including both 2026-09-15 ones, stays intact. Its Status line reads exactly `Status: **PROPOSED — awaiting owner signature.**` — nothing in the amendment may say the owner approved, ratified, accepted or signed it. |

Worked cases, all deferring to Table S:

- Lock from a run that was killed by a power cut; the machine has since
  rebooted; its PID is now an unrelated live daemon → S3 establishes pre-boot,
  S4 takes over, the dream runs. This is the M6 case.
- Lock from a dream that is genuinely still running, 40 minutes past a 20-minute
  deadline → probe alive, S3 not established, `staleForMs` ≈ 2.4e6 which is
  below S5's bound → quiet, exit 0, exactly as today (Table L7 preserved).
- Same lock nine hours later → S5 branch (2) throws; `run-job` fails loud and
  emails; the hourly catch-up retries and throws again each hour until a human
  acts.
- Lock whose deadline has not passed → L2 returns `busy` before any probe,
  `staleForMs <= 0`, quiet, exit 0.
- Unreadable, foreign-host or invalid-PID lock → `owner-unknown`, unchanged.

### Mirrored Surface Checklist

Every surface below mirrors Table S. A finding updates Table S **and every
registered mirror in the same commit** — no commit may exist in which the table
and a registered mirror disagree. A new mirror found in review is added here in
the same pass.

- [ ] **Deliverables-table cells that restate a path or rule** — every Notes
      cell cites the S-rows its file carries (lock.js → S1–S4, dream.js →
      S5–S7, each test file → the rows it asserts, the proofs file → ADR-0042,
      the ADR → S8). A cell may name a row; it may not restate the rule.
- [ ] **Acceptance criteria that assert its facts** — AC1→S1, AC2→S2, AC3→S3,
      AC4→S4, AC5→S5, AC6→S6, AC7→S7 and S8, AC8→ADR-0042 plus the S3 margin
      and S5 bound arithmetic. The idempotency line is an `N/A` disposition, not
      an S fact.
- [ ] **Verification commands / greps** — the `boundary-check` argument list
      must equal the Deliverables paths exactly; `npm run red-proofs --wp
      WP-dream-lock-stale-owner-loud` mirrors AC8; the both-directions sentence
      under the block is a repo-process rule, not an S fact.
- [ ] **Current-state description** — Context's schedule, payload, `run-job`
      and defect facts and Current state C1–C5 record inherited behavior only,
      at `b4af715e`. Any forward-looking sentence in either defers to S1–S8;
      neither may be rewritten as evidence that the change shipped.
- [ ] **Operative prose steps that apply it** — walked, with the row each step
      applies:
  - Implementation notes, "Test seam": the requirement that `os.uptime()` be
    called through the `node:os` module object applies **S3**.
  - Implementation notes, "The integration test must not depend on the
    runner's real uptime": applies **S3** and **S4**.
  - Implementation notes, "Do not add fields to the lock payload": applies
    **S1**.
  - Implementation notes, rebase interaction: the named `src/cli/dream.js`
    regions are the ones **S5** and **S7** edit.
  - Dispatch precondition O1 applies **S4**, O2 **S5**, O3 **S3**, O4 **S6**
    (against Table L6), O5 the exit-1 cadence **S5** causes, O6 **S8**'s scope.
    Each recommendation states a preference; none of them decides a row.
  - Security checklist bullet 1 applies **S6**'s no-interpolation rule,
    bullet 2 **S3**, bullet 3 **S4**, bullet 4 **S5**.
  - Out of scope: the `ps`/spawn exclusion applies **S3**–**S5**'s residual
    boundary; the CAS / heartbeat / new-lock-field exclusions apply **S1** and
    **S4**; the alert rate-limiting exclusion applies **S5**. The digest-region
    exclusion is a work-package boundary, not an S fact.
  - The ADR-0012 amendment block: "Proven-dead by reboot" applies **S3** and
    **S4**, "Accepted residual" **S4**, "A stale busy lock is loud" **S5** and
    **S6**, the catch-up-cadence paragraph **S5**, the closing no-heartbeat
    paragraph **S1** and **S4**; its Status line is an **S8** fact.
  - The byte-exact user message is decided once, in **S6**. Its two paraphrases
    — O4's description and the amendment's "names how many whole hours" sentence
    — describe it and must never restate its bytes.
- [ ] Frontmatter and title: the scope claim ("stale busy lock must not exit 0")
      mirrors S5; `size`/`model` are process facts.
- [ ] Exact contracts: the result-object block and the "no new field/flag/setting"
      sentence mirror S1.
- [ ] Contract-reference activation paragraph and the worked cases immediately
      below Table S: they mirror S2–S6 and decide nothing.
- [ ] Register newly found mirrors here on the spot — including a new operative
      prose step, which is added to the walk above rather than as its own bullet.

## Dispatch precondition — owner items

`status: Ready` requires the owner to settle these. Each is a policy call, not
an implementation detail; none may be resolved silently by the implementer.

**O1 — May a boot-time estimate authorize automatic takeover? (Table S4)**
*Question:* the estimate can be wrong in one named way (S4's residual). May it
overwrite a lock whose PID probe says a local process is alive?
*Recommendation:* **yes.** Release gate M6 binds the project to running a
shutdown-missed dream within an hour of the machine being back, and after
PR #245 a PID collision defeats that gate indefinitely. The residual needs a
forward clock step larger than the margin, on a monotonic-uptime platform,
during a dream that has already overrun its deadline, in the same hour a
contender runs. The worst outcome if it does fire is the shared-scratch rebuild
Table L7 protects against — bad, but bounded: promotion is still gated and one
dream run is still one revertible vault commit.
*Overrule cost:* **a spec revision, not a toggle.** Declining takeover means the
proof survives only as a message discriminator, which needs the boolean exported
on the `busy` result (S1 changes), a second code-owned message for the
proven-pre-boot case (S6 changes), and its own tests. Roughly doubles S3/S4/S6.
Every unclean shutdown that reuses the PID then needs an attended file deletion.

**O2 — The staleness bound. (Table S5)**
*Question:* how far past its deadline may a lock stay `busy` before the dream
fails loudly?
*Recommendation:* **six hours past the deadline.** The bound is measured past a
deadline that already contains the whole configured `dream_timeout_minutes`
(default 20 min), so it scales with any timeout the user sets; the 60 s soft
preprocess deadline and its permitted overrun live inside that same allowance. A
03:30 dream is therefore reported no later than the 10:00 catch-up — same
morning, and at most one night of consolidation is delayed before the user is
told.
*Overrule cost:* lower (e.g. 2 h) risks alerting on a legitimately long run on a
slow machine, which trains the user to ignore the alert. Higher (e.g. 24 h)
costs a full extra night of silence per incident. Either is a one-constant
change to `STALE_LOCK_ALERT_MS` plus the tests that pin it.

**O3 — The boot margin. (Table S3)**
*Question:* how far before the estimated boot must `startedAt` be before we call
the owner dead?
*Recommendation:* **60 seconds.** One minute absorbs `os.uptime()`'s
whole-second resolution and the sub-second corrections a synced machine makes.
It is deliberately **not** sized to absorb a large manual or first-boot clock
step, because no finite margin can, and a larger margin suppresses the common
case — a dream that started only minutes before the machine went down.
*Overrule cost:* a larger margin (e.g. 15 min) shrinks the residual window a
little and loses every crash that happened within that window of the reboot,
which is the most common shape of the incident. One-constant change.

**O4 — May the message tell the user how to recover? (Table S6 vs Table L6)**
*Question:* Table L6 of `WP-dream-live-owner-lock` says "Do not suggest blind
lock deletion". S6's message tells the user to delete the lock file *after*
checking that no dream is running. Does L6 stand as written, or is it amended to
permit a conditional recovery hint?
*Recommendation:* **amend it to permit the conditional hint.** L6's prohibition
is on *blind* deletion; a hint gated on "check for one first" is not blind, and
without it the email tells the user their memory has stopped and gives them no
action. The amendment text below carries this.
*Overrule cost:* S6 loses its last two sentences and the alert becomes
diagnostic only; the user must find the recovery procedure elsewhere, and no
such document exists today.

**O5 — Hourly repeat alerts while a stale lock persists.**
*Question:* an exit-1 decline means no `last_success`, so the hourly catch-up
retries and fails loud every hour until a human acts — one `alerts.jsonl` line
and one best-effort self-email per hour.
*Recommendation:* **accept, unchanged.** This is not a new class of behavior:
the `owner-unknown` throw shipped in PR #245 already has exactly this cadence.
Suppression would need per-reason rate limiting the repo does not have, and
`wienerdog alerts ack` deliberately silences only the session digest, never the
email or the exit code.
*Overrule cost:* a new work package for alert rate limiting, blocking this one.

**O6 — Does anything here need an ADR beyond the part-6 amendment?**
*Recommendation:* **no.** S3/S4 narrow *when* takeover is permitted and S5/S6
change *how* a decline surfaces; both live inside ADR-0012 part 6, which the
amendment below revises. ADR-0004 is untouched (no process is started or kept
alive) and ADR-0031/ADR-0042 are applied, not changed.
*Overrule cost:* a separate ADR draft, blocking dispatch.

## Implementation notes & constraints

- **Test seam — extend the one that exists; do not invent a second.**
  `tests/unit/dream-lock.test.js` already drives every branch with
  `t.mock.method(Date, 'now', …)`, `t.mock.method(os, 'hostname', …)` and
  `t.mock.method(process, 'kill', …)`, which work because `lock.js` calls
  `Date.now()`, `os.hostname()` and `process.kill()` through those same module
  objects at call time. `os.uptime()` must be called the same way, so
  `t.mock.method(os, 'uptime', …)` reaches it. Simulating "the machine booted
  after `startedAt`" is therefore a mocked `Date.now` plus a mocked `os.uptime`
  plus a seeded lock record — no reboot, no spawn, no clock change.
- **The integration test must not depend on the runner's real uptime.** A
  seeded lock whose `startedAt` is hours in the past would be *proven pre-boot*
  on a CI machine that booted minutes ago and *not* on a long-lived laptop, so
  an integration fixture that wants the S5 loud path must pin `startedAt` to a
  value that cannot precede this machine's boot (the current time is the obvious
  one) while putting `deadline` far in the past. Test design is otherwise the
  implementer's.
- **Do not add fields to the lock payload.** Recording a boot identity at
  acquisition time was considered and rejected: it changes the payload (which
  `WP-dream-live-owner-lock` froze), it cannot read old locks, and it inherits
  the identical uptime-semantics residual as S4 without removing it.
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

- [ ] The lock record is same-user input under `~/.wienerdog/state/`. S6
      interpolates only a code-derived decimal integer and a code-derived path;
      no `pid`, `host`, `startedAt` or raw file byte reaches the message, the
      alert reason or the email body.
- [ ] S3 reads `os.uptime()` and parses `startedAt` with `Date.parse`; it runs
      no shell, spawns no child, and starts nothing that outlives the call
      (ADR-0004).
- [ ] S4 does not widen who may be probed or overwritten: L3's local-host and
      PID-domain gate still runs first, and `owner-unknown` still authorizes
      nothing.
- [ ] S5's three branches mutate neither `state/dream-scratch` nor the lock.

## Acceptance criteria

- [ ] AC1 — S1: `busy` carries `staleForMs` and nothing else changed shape;
      `owner-unknown` and both `acquired` results are field-identical to today.
- [ ] AC2 — S2: `staleForMs` is `now - deadline` on both `busy` branches,
      `<= 0` on the unexpired one, `> 0` on the expired-and-alive one, never
      `NaN`.
- [ ] AC3 — S3: the proof holds exactly for the enumerated conjunction and is
      `false` for missing / non-string / unparseable `startedAt`, for a
      `startedAt` inside the margin, and for a non-finite or negative
      `os.uptime()`.
- [ ] AC4 — S4: a probe-alive expired local owner proven pre-boot is taken over
      with `{acquired:true, stolen:true}`; the same owner not proven pre-boot
      keeps its lock; the unexpired, `ESRCH`, foreign-host, invalid-PID,
      unreadable and other-probe-error outcomes are unchanged.
- [ ] AC5 — S5: `staleForMs` above the bound throws; at or below it prints the
      unchanged line and returns; `owner-unknown` throws its unchanged text. No
      branch collects, mutates scratch, or rewrites/deletes/releases the lock.
- [ ] AC6 — S6: the thrown message is byte-exact for a given `staleForMs` and
      state dir, and contains no `pid`, `host` or `startedAt`.
- [ ] AC7 — S7: the `Exit 1` doc comment names both the unverifiable-owner and
      the stale-lock throw; S8's amendment is appended byte-for-byte with its
      Status line exactly as specified, and every prior amendment survives.
- [ ] AC8 — RED evidence: every declared proof in
      `tests/red-proofs/dream-lock-stale-owner-loud.proofs.json` reports
      `PROVEN` (ADR-0042 — `PROVEN` is the only zero exit; a `FILTERED`
      criterion is not proven). At minimum the declarations must redden the
      S3 margin arithmetic and the S5 bound comparison, so that a test which
      passes regardless of either is caught.
- [ ] Idempotency — `N/A — this work package ships no command that writes
      outside the repository; repeated declined acquisitions already leave the
      lock bytes and scratch unchanged, which AC5 asserts.`

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
one (`docs/runbooks/spec-authoring.md`). For AC8 the red side is the machine-run
proof; for the rest it is pasted by hand. Review the appended ADR text against
S8 for AC7.

## Out of scope (do NOT do these)

- **Reading a process's start time via `ps`, `/proc`, `sysctl` or any spawn.**
  Considered and rejected. It would close S4's residual for the live-owner case,
  but it costs a child process on the dream's hot path, is a different command
  and a different output format on each of the three supported platforms, and
  its parsing is a new untrusted-input surface — for a gap that S3+S5 already
  cover from opposite sides: a rebooted machine self-heals, and anything else
  becomes loud within the bound. If a later work package wants it, it needs its
  own ADR.
- Atomic compare-and-swap for lock acquisition; the L5 simultaneous
  stale-claimant race stays as `WP-dream-live-owner-lock` accepted it.
- Heartbeats, lease renewal, automatic kill of a hung dream, a new lock field, a
  boot identifier, cross-host coordination, or any recovery CLI command.
- Rate limiting or deduplicating `alerts.jsonl` (owner item O5).
- Anything in `src/cli/dream.js`'s digest regeneration — that region belongs to
  `WP-dream-digest-omits-own-job-alerts`.
- Changing `dream_timeout_minutes`, `dream_preprocess_timeout_seconds`, the
  schedule times or the catch-up cadence.

## ADR-0012 amendment text

Append this block verbatim to `docs/adr/0012-dream-run-lifecycle.md`, after the
existing `## Amendment (2026-09-15): admit complete filtered sessions and report
exclusion causes` section (Table S8). Do not edit it; do not reword its Status
line.

```markdown
## Amendment (2026-09-17): a stale lock must be loud, and a pre-boot owner is proven dead — WP-dream-lock-stale-owner-loud

Status: **PROPOSED — awaiting owner signature.**

**Decision (amends part 6 again, after the 2026-09-15 live-owner amendment).**
Table S in `docs/specs/WP-dream-lock-stale-owner-loud.md` is canonical. The
2026-09-15 amendment above stands except where this one narrows it.

That amendment accepted, in one clause, that PID reuse "can delay recovery". It
did not examine that the delay is **silent**: a declined-as-busy dream prints one
line and exits 0, so `run-job` records success and clears the job's alerts, and
consolidation can stop indefinitely behind a healthy-looking digest. Two
narrowings follow.

**Proven-dead by reboot.** On the one branch where an expired record has passed
the local host and PID-domain checks and its signal-zero probe succeeded or
returned `EPERM`, the lock's own `startedAt` is compared against an estimate of
the machine's boot time, `Date.now() - os.uptime() * 1000`, less a 60-second
margin. When `startedAt` parses and lies strictly before that, no process from
before the boot can still be alive, the owner is proven dead whatever now holds
its PID, and the existing overwrite takeover applies. A missing, non-string or
unparseable `startedAt`, a `startedAt` inside the margin, or a non-finite or
negative `os.uptime()` establishes nothing and retains the lock. `startedAt`
therefore stops being purely informational; the payload and path do not change.
The proof is consulted nowhere else: unexpired locks, unreadable or invalid
records, foreign hosts, invalid PIDs and other probe errors behave as before.
This is a read from `node:os` — no spawn, no new file, nothing that outlives the
call (ADR-0004).

**Accepted residual.** The proof rests on an estimate. It is wrong only when
`os.uptime()` under-reports wall-clock time since boot by more than the margin
while the owner is genuinely alive — a forward wall-clock step larger than the
margin, on a platform whose uptime derives from a monotonic counter, during a
dream that has already overrun its deadline. The margin bounds ordinary clock
slew and whole-second uptime resolution; no finite margin bounds an arbitrary
step, and none is claimed.

**A stale busy lock is loud.** A declined acquisition whose deadline passed more
than six hours ago no longer returns exit 0. It raises a `WienerdogError` through
the existing job-failure path, so `run-job` fails loud, records a durable alert
and sends its best-effort self-email. The bound is measured past a deadline that
already contains the whole configured `dream_timeout_minutes`, so a legitimately
long run does not trip it, and `busy` within the bound — including every
unexpired lock — keeps today's quiet exit 0 exactly. The message names how many
whole hours the lock has been held past its limit, says that nothing has been
written to the vault since, and tells the user to check for a running dream
before deleting the lock file, whose path it names. The 2026-09-15 prohibition on
suggesting **blind** lock deletion stands; a hint conditioned on that check is
not blind. No transcript text, PID, host or raw lock byte appears in it.

Because a failing run writes no `last_success`, the hourly catch-up retries and
fails loud each hour until a person acts. That cadence is not new: the
unverifiable-owner error introduced on 2026-09-15 already behaves this way.

No heartbeat, lease renewal, automatic kill, new lock field, boot identifier or
recovery command is introduced. Part 7 and the unrelated lifecycle and capacity
amendments remain in force.
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
