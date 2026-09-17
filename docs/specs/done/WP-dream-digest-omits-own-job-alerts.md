---
id: WP-dream-digest-omits-own-job-alerts
title: Stop the dream's own digest render from re-showing the alerts its success clears
status: Done
model: opus
size: M
depends_on: []
adrs: [ADR-0004, ADR-0012, ADR-0031, ADR-0042]
---

# WP-dream-digest-omits-own-job-alerts: the dream's digest render shows the state the run establishes

> **Errata, 2026-09-17 (post-merge) — two stale prose mirrors. Neither is a defect in what shipped.**
>
> Implemented in PR #257 (merge `a47f2546`, 2026-09-17), tip `a4bd6c03`. Both PR
> gates on that tip: wd-reviewer **APPROVE** with everything executed — `npm test`
> exit 0; targeted suites 176 pass / 0 fail; the **UNFILTERED**
> `npm run red-proofs` on the tip → `RUN: PROVEN` with all seven ids; lint;
> V3-V6 each exit 0; `boundary-check` exit 0; and the placement verified by
> reading all of `run()` — the filtered call is the **sole statement between the
> end of `finally B` and the start of `finally A`**, the flag defaults to
> unfiltered, the filter cannot drop another job's record, and the start instant
> is `run()`'s first statement. All three corrected mutation sets were replayed
> independently and reproduced exactly. Codex plugin `review` on `gpt-6-astra`
> clean, no findings (it disclosed that runtime tests were not run in its
> read-only environment). CI seven checks pass. Suite on the rebased tree
> 2783 / 2771 / 0 / 12.
>
> **Erratum 1 — "AC2 and AC6e are in no `expectRed` set" undercounts: AC6c and
> AC6d are in no set either.** *What is wrong:* the sentence closing Table C
> names two criteria as mutation-unprotected when four are. *What is true:*
> **AC6c and AC6d live in `tests/unit/scheduler-runjob.test.js`**, outside the
> declaration file's `suite` (`tests/unit/dream-pipeline.test.js`), and they drive
> a **fake child**, so **no mutation of `src/cli/dream.js` can reach them** — they
> are unprotected *by construction*, not by omission. A RED-proof declaration can
> only redden tests in its own suite, so declaring a cross-suite criterion is
> unprovable in principle. *Found:* wd-reviewer, PR #257 gate. *Routing:*
> corrected in place below and recorded here. **Class: a count that went stale
> when the table beneath it was corrected.**
>
> **Erratum 2 — "Five sets were measured … two are derived" is out of date: all
> seven are measured.** *What is wrong:* Table C's preamble describes a
> measured/derived split that the implementation dissolved. *What is true:* the
> spec authorized the implementer to correct any derived set to what actually
> reddens, and **three were corrected** — so every row is now measured, and the
> shipped declaration file carries: `filter-removed` → AC1, AC6f, AC7d, AC7e,
> AC7g; `always-on` → AC3, AC5, AC7d; `at-early-render` → AC6a, AC6b, AC7c, AC7d;
> `ignores-config` → AC4, AC8; `ignores-run-token` → AC5; `ignores-record-date` →
> AC6f; `at-step-nineteen` → AC7a, AC7b, AC7d (AC7c green — no early-exit path
> reaches step 19, as round 7 derived; **AC7f did not redden**). *Found:*
> wd-reviewer, PR #257 gate. *Routing:* corrected in place below and recorded
> here. **Class: prose mirroring a table the implementer was authorized to change
> but not authorized to re-describe.**
>
> **Recorded, not errata:**
> (i) **The implementer added an `onLog` hook to the TEST harness** `runDream`
> (`tests/unit/dream-pipeline.test.js` l.345, l.364-369; used at l.2534) to make
> the step-21 summary line throw. It is the right seam and the reason is worth
> keeping: between the step-19 render and the end of the dream's body **the only
> fallible statements are `console.log` calls** — `refreshWarnings` swallows
> everything — so a "body fails late" test needs a log seam, not an fs seam.
> (ii) **AC6c/AC6d pin `run-job`'s non-rendering rather than the filter**, which
> is what they were designed to do (Table A, "Out-of-process failures"); Erratum 1
> is the consequence of that design, not a flaw in it.
> (iii) **The managed-policy hook warning loses its only lasting surface.**
> `run-job` appends it under the job's own name **before the spawn**
> (`src/cli/run-job.js` l.953), so it is stamped earlier than this process's start
> instant and the filtered render now omits it. This was named in Table A and in
> Implementation notes before implementation, and it is **deferred by the
> maintainer ruling of 2026-09-10 — "this WP ships first; the follow-up WP is
> drafted later."** It is a warning, not a failure, and it does not belong in the
> failure-alert log; restoring a standing surface for it needs its own WP.
> (iv) **The PR title was renamed to the Definition of done's literal before
> merge.**
> (v) **On win32 no run token is minted** (`src/cli/run-job.js` l.934 guards the
> mint with `platform !== 'win32'`), so the omission never engages there and
> Windows keeps `main`'s behaviour — the safe direction, stated in Table A before
> implementation.
>
> **Line numbers moved with the implementation**, as they always do: the closure
> is now `src/cli/dream.js` l.733, the two unfiltered renders l.821 and l.1279,
> and the single filtered call l.1320. Every citation in the body below is the
> PRE-merge one it was verified against and is left as the record of what the
> implementer built from.

<!-- errata above; the spec as it shipped follows -->

- Authoring rules live in `docs/runbooks/spec-authoring.md` — the template gives
  the skeleton, the runbook the rules. Read both.

> **The design gate ran 2026-09-17 against `e545033c` and CLOSED at round 7.**
> **This spec is `Ready`.** Seven rounds across two reviewer models — rounds 1-3
> `gpt-5.6-sol` via `codex exec`, rounds 4-7 `gpt-6-astra` via the Codex plugin —
> with findings **3, 2, 0, then 3, 3, 3, 2**. The design changed shape twice on
> evidence, not on preference: the recovery mechanism was **removed** at round 5,
> and the filtered render was moved **back under the dream lock** at round 6.
> Round 7 found **nothing about the product** — its two findings were both about
> this document's own instructions — so the loop closes under
> `docs/runbooks/codex-review.md`, "Weighted closure". Every round's raw output
> was committed BEFORE adjudication. The per-round tables, dispositions, mirror
> walks and gate runs are
> `docs/specs/logbook/2026-09-17-dream-digest-omits-design-review.md`.
>
> **The history below is kept because it is the reason the contract reads as it
> does.** It records a gate that was re-opened AFTER this spec first went
> `Ready` and after an implementation had been dispatched — that implementation
> is **paused at `9d1282cf` and must RESUME from there** against the numbered
> delta in Implementation notes, never start over.
>
> **RE-OPENED 2026-09-17 (round 4) — what the confirming round found.** After round 3 closed the loop and this spec went `Ready` (merged
> as PR #248) **a confirming round by a DIFFERENT reviewer — round 4, Codex
> plugin adversarial-review, model `gpt-6-astra`, on tip `ebcdda00` — returned
> `needs-attention` with two product findings and one machinery finding**, each
> backed by in-memory execution of the production function bodies rather than by
> reading them. **An implementation had already been dispatched against the
> `Ready` spec; it is PAUSED, and the implementer must be RE-DISPATCHED against
> this revised spec** — work done against the previous text is not to be resumed,
> because two of that text's load-bearing assumptions were false:
>
> - **A-1 (HEAVY):** *"run-job appends a failure only after the child exits"* —
>   **false.** The watchdog rejects independently of the child's close event
>   (`src/cli/run-job.js` l.1086, raced at l.1090), so `failLoud` (l.1257) can
>   append **while the dream child is still alive**. That survivor holds a
>   legitimately minted run token and can reach step 19 and hide the supervisor's
>   already-recorded failure, which that supervisor will never clear.
> - **A-2 (HEAVY):** *"a failed recovery render leaves the previous filtered bytes
>   intact"* — **false.** `writeFilePrivate` renames at `src/core/private-fs.js`
>   l.360 and only then verifies destination identity, throwing
>   `WD_F10_POST_RENAME` (l.372) **after publication**.
> - **A-3 (LIGHT, machinery):** AC7 established neither finalizer coverage nor
>   exactly-once recovery.
>
> **Round 5 (same reviewer, tip `7bee5394`) then found two more, and the second
> round of findings about the SAME mechanism forced a design change rather than
> another patch** (`docs/runbooks/codex-review.md`: when two consecutive rounds
> land findings of the same kind, the next step is a design question). The
> unfiltered recovery re-render asked for in round 1 had by then needed two call
> sites, an exactly-once guarantee spanning them, arming before the render, a
> stderr diagnostic, a withdrawn preservation guarantee, compound-failure
> handling, and a conservative alert-set fallback — because a recovery render
> whose `readAlerts` silently returns `[]` **publishes an alert-free digest and
> erases other jobs' callouts**. **That mechanism is REMOVED.** Round 1's F2
> disposition is reversed on five rounds of evidence, and the reversal is recorded
> in the design-review logbook rather than quietly applied.
>
> **Round 6 (same reviewer, tip `b85f5496`) then corrected the PLACEMENT that
> removal chose.** Round 5 put the filtered render after the outer `finally`, so
> it ran **outside the dream lock**; round 6 measured that the lock was
> load-bearing — unlocked, a second dream could record a new quarantine and
> publish its banner while this run's stale closed-over `ledger` then overwrote
> it, and dream-to-dream digest write races became possible where `main` has none.
> **The render is therefore the last statement of `try A`'s BODY, under the
> lock** — after the workspace teardown, before `cleanScratch`/`releaseLock` —
> which keeps round 5's gain (no recovery mechanism) and restores the serialization
> `main` has always had. Round 6 also found **`dream.js:740` missing from round 5's
> exit inventory**: that inventory came from an indentation-bounded scan that
> silently skipped anything nested more than three levels. A depth-bounded scan is
> not an inventory, and the one in Table A is now re-derived with no depth bound.
>
> **The lesson, recorded because it is about the process and not this package:**
> three rounds of one model approved a design whose two load-bearing assumptions
> a second model falsified by **executing** the production function bodies.
> Reading is not evidence. Rounds 1-3 are still on the record and their fixes
> still stand; what they could not do is find these.
>
> Rounds 1-3 (3 findings, then 2, then 0) and round 4's dispositions are
> `docs/specs/logbook/2026-09-17-dream-digest-omits-design-review.md`; each
> round's raw output was committed before adjudication (`d86e1616`, `2eeba955`,
> `6c96471c`, `31bd9377`). Owner items **O1, O2, O3** remain recorded under the
> standing process in
> `docs/specs/logbook/2026-09-17-owner-rulings-felho-integration-3.md`; **O3's
> premise was overstated and is corrected below** — that record is not edited by
> this pass, so read O3 here for the current wording.

## Context (read this, nothing else)

Wienerdog is just files (ADR-0004): a scheduled job is an OS schedule entry that
runs `wienerdog run-job <name>`, and every durable fact it produces is a file
under `~/.wienerdog/`. Two of those files matter here.

**`state/alerts.jsonl` is the durable failure record.** When a scheduled job
fails, `src/cli/run-job.js` "fails loud": it appends one JSON line
(`{job, at, reason, log_hint}`) via `appendAlert` and best-effort emails the
user. When that job next *succeeds*, `run-job` calls `clearAlerts(paths, name)`
and removes every line for that job. Appending and clearing are **run-job's**,
never the job body's (WP-041). There is no expiry, no age-out: only a successful
run retires a record.

**`state/digest.md` is a derived view of it.** `renderDigest`
(`src/core/digest.js`) prepends one `> [!warning]` callout per failing job,
rendered by `formatAlerts`, whose closing sentence is byte-frozen code-owned
text (WP-neutralize-alert-callout-rendering):
`This note clears automatically when the job next succeeds.` The digest is
injected into every new Claude Code / Codex session by the SessionStart hook, so
whatever it says is what every session believes. **Exactly two places write
`digest.md`: `src/cli/dream.js` and `src/cli/sync.js`** — WP-041 deleted
run-job's own `writeDigestBanner` and made its absence an acceptance criterion.
`sync` is attended-only, so on an unattended machine the nightly dream is the
*only* thing that refreshes the digest.

**The promise is off by one for the `dream` job, and it lasts 24 hours.** The
dream regenerates `digest.md` as its own step 19, from inside the job body —
before `run-job` can observe that the job succeeded and clear its alerts.
Verified in production on 2026-09-10 (0.13.0): the 01:30 UTC dream failed and a
record landed in `alerts.jsonl`; the 02:00 catch-up dream **succeeded**, and at
its step 19 that record was still on file, so the fresh `digest.md` was written
with `> [!warning] Wienerdog: the "dream" job has failed …`; only afterwards did
run-job clear `alerts.jsonl`. Result: `alerts.jsonl` clean, `schedule.json`
`last_status: ok`, and every session for the next 24 hours told the model the
dream job had failed. All three files carried the same mtime.

WP-041 saw this and accepted it: *"**Known one-regeneration lag (accept it,
record it):** when a dream succeeds, `dream.js` regenerates `digest.md` before
`run-job` clears the alert (the clear happens after the child exits). So the
just-written digest may still show a stale block; the next `sync`/dream
regeneration drops it. … Do NOT couple `run-job` to the digest renderer to shave
this lag."* **This WP withdraws that acceptance and keeps the prohibition.** The
acceptance rested on "the next regeneration drops it"; in the field the next
regeneration is the next nightly dream — 24 hours of a false failure claim in
every session — or an attended `wienerdog sync` that an unattended machine never
gets. The prohibition stands untouched: run-job still renders no byte of
`digest.md`, and nothing new calls `renderDigest`.

The fix is the mechanism the alert-acknowledgement WP already established —
**hand `renderDigest` a filtered array; never touch `formatAlerts`** — applied
at the dream's own call site. It is also the consistent application of the rule
the dream's step-19 comment already states in the same breath (*"THE ORDER IS
THE CONTENT (row G4, Table V row V10): `state/digest.md` is the next session's
context, so regenerating it BEFORE the ledger is persisted would show that
session a state this run has already changed"*): by step 19 the dream's work has
succeeded, so rendering "the dream job has failed" shows the next session a
state this run has already changed.

**And the same sentence bounds the fix — but step 19 is not where it lands.**
Step 19 is the first point at which the dream's *notes* are persisted, yet the
run is not over there: `destroyWorkspace`, `cleanScratch` and `releaseLock` are
all still ahead of it and any of them can fail. So **step 19 stays exactly as
`main` has it, UNFILTERED**, as does the earlier quarantine-only refresh, and
this WP adds **one filtered render as the last statement of the locked body** —
after the workspace teardown, before scratch cleanup and lock release (Table A,
"Where applied"). It is reached only by falling out of the whole body, so
reaching it *is* the run having succeeded, and **nothing renders after it**:
there is no recovery render and no second attempt anywhere in this design.
Design round 1 found the first draft filtered both existing sites and could
therefore hide a genuine unresolved failure; rounds 5 and 6 then moved the
filtered render out of the body and back under the lock. Table A's principle row
is the rule that survived all of it — *when in doubt the stale callout is shown;
a genuine one is never hidden*.

## Current state

Every line citation below was re-derived at `b4af715e` (`origin/main` after
PR #245) and re-verified by the design gate at **`545df8bd`**, the base this spec
was approved against; `src/` is byte-identical between the two. Follow a citation
by grepping its quoted text; the line number disambiguates, it does not locate.

**Round 4 added executable claims to this section and they carry the same
obligation**: the watchdog race, the rename-then-verify order, the alert record's
shape and ordering, and the `try`/`finally` topology are all runnable and all
re-run at dispatch. **The dispatcher re-runs these claims before handing this WP
to an implementer** and records the SHA it ran them against, per
`docs/runbooks/codex-review.md`, "Dispatch-time re-verification". `Ready` is not the same as "still true": any
merge landing between this approval and dispatch can falsify a line number here
without anyone editing this file. A stale claim routes back to wd-architect, not
to the implementer, whose Deliverables boundary usually excludes the file that
would fix it.

- `src/cli/dream.js` (1233 lines). Inside `run()`, the closure
  `regenerateDigest` (l.641 `const regenerateDigest = () => {` through l.660
  `};`) assembles every digest input and writes the file. Its alerts input is,
  verbatim, l.646:
  `alerts: unacknowledgedAlerts(paths, readAlerts(paths)),`. The closure is
  called from exactly **two** sites: l.724 (the quarantine-only refresh, after
  `writeLedger`, dry-run-guarded) and l.1182 (step 19, after `writeLedger`).
  Both are inside the same `run()` and both see the same closure.
- **`dream.js` does not currently require the scheduler's jobs module.** Its
  require block is l.3-39 and carries no `require('../scheduler/jobs')`; the
  cross-check in "Exact contracts" adds one. It is a first-party module — zero
  new package dependencies (CLAUDE.md).
- **The paths out of `run()` that reach no render**, measured in call order from
  the lock:
  - l.593 `const lock = acquireLock(paths.state, cfg.timeoutMs);`
  - l.595-600: `lock.reason === 'owner-unknown'` → `throw new WienerdogError(…)`.
    **New in PR #245.** Non-zero exit, nothing rendered.
  - l.601-602: any other declined acquisition (the lock module's `busy`, see
    `src/core/dream/lock.js` l.20 and l.40) →
    `console.log('wienerdog: another dream holds the lock.'); return;`
    **Exit 0, nothing rendered.** Pre-existing; PR #245 changed only the message
    string. See Table A row "Paths that render nothing" and Out of scope.
  - l.736-743: `sel.entries.length === 0 && exclusions.length > 0` →
    `throw new WienerdogError('dream: no complete session was admitted. …')`.
    The throw is pre-existing (it was the capacity wedge); PR #245 widened its
    trigger from one cause to four (`sel.deferred`, `sel.deadlineDeferred`,
    `sel.oversized`, `sel.readDeferred`, assembled at l.683-700). **It sits
    AFTER the l.724 render site**, so a run can render and then fail.
  - l.746-757 (`nothing new to dream`, exit 0) and l.765-768 (dry-run) also
    return without reaching step 19; the l.724 site is dry-run-guarded at l.721.
- `src/cli/sync.js` l.278 carries the identical alerts expression. It is **not**
  edited by this WP.
- `src/core/alerts.js`: `appendAlert` (append-only, self-compacting),
  `readAlerts` (oldest-first, sanitized, byte-bounded), `clearAlerts(paths, job)`
  (removes every record whose `job === job`, deletes the file when none remain,
  and first calls `pruneAcksForJob`).
- `src/core/alert-ack.js` (146 lines) `unacknowledgedAlerts(paths, alerts)`
  (l.131) returns `alerts` minus the acknowledged pairs. Its JSDoc ends, at
  l.125-127, with these three lines verbatim:

  ```text
   *  A non-array `alerts` returns [] — an upstream PROGRAMMING-ERROR guard, not a
   *  suppression path (both callers pass readAlerts, which always returns an
   *  array). This is the ONLY suppression point (Table B).
  ```

  Those two callers are `dream.js` l.646 and `sync.js` l.278 — the complete set
  in `src/` and `bin/`.
- `src/core/digest.js` l.486-513 `formatAlerts` (l.486 `function formatAlerts(alerts) {`
  through l.513 `}`), whose template ends at l.509 with the "clears
  automatically" sentence. **Not a Deliverable — byte-frozen.**
- `src/cli/run-job.js` (1514 lines): `failLoud` (l.692) appends + emails; the
  policy-hook warning appends at l.953 *before* the spawn (l.1036); the success
  path writes the success marker (B1, l.1188 `jobsLib.writeScheduleState(paths,
  name, { last_success: nowIso(), last_status: 'ok' });`) and then
  `clearAlerts(paths, name)` (B2, l.1204). `runJob` is only ever reached with a
  `job` object obtained from `jobsLib.findJob` / `jobsLib.listJobs` (l.1494 and
  l.1343), i.e. a job that is present in the managed `jobs:` section of
  `config.yaml` at spawn time.
- `buildCleanEnv` (l.150) sets `WIENERDOG_JOB: name` in the child environment on
  **both** platform branches (l.180 win32, l.219 POSIX), and that env object is
  what `spawn` (l.1036) hands the child. `resolveCommand` (l.433) runs
  `builtin:dream` as `node <bin> dream --yes` at l.439, so the dream is a child
  process that reads that variable through `process.env`.
- **`run-job`'s ORDINARY failure path, and when the record appears relative to
  any render** (design round 2): on a failed job `runJob` writes the error
  watermark at l.1251 (`jobsLib.writeScheduleState(paths, name, { last_status:
  'error', last_error_at: nowIso() })`), calls `failLoud` at l.1257
  (`const alertPersisted = await failLoud(paths, name, reason,
  ordinaryFailLoudOpts(opts));`) whose `appendAlert` runs at l.715, and throws at
  l.1269. **Every one of those is after the child has exited**, so the failing
  dream made no render that could have shown the new record; the only render it
  could have made at all is the conditional l.724 refresh, which ran earlier.
- **`wienerdog doctor` does not surface alerts.** Measured on this tree:
  `grep -ci alert src/cli/doctor.js` returns **0**, and the only `readAlerts` /
  `unacknowledgedAlerts` consumers in `src/` and `bin/` are `src/cli/alerts.js`
  (the `wienerdog alerts` command), `src/cli/dream.js` and `src/cli/sync.js`. So
  the channels that carry a dream failure are the fail-loud email and
  `alerts.jsonl` itself — `doctor` is not one and must not be cited as one.
- `src/scheduler/jobs.js`: `findJob(paths, name)` (l.190) is
  `listJobs(paths).find((j) => j.name === name) || null`; `listJobs` (l.199-208)
  wraps its `readConfig` in `try { … } catch { return []; }`. **An unreadable or
  missing `config.yaml` therefore resolves no job by construction**, which is
  Table A's failure direction already built into the lookup.
- **The per-run token channel, both ends, read in full** (round 1's F1 correlate):
  - **Minted** at `src/cli/run-job.js` l.934-938 (the `if` block, both ends
    checked), inside `runJob`, immediately after
    `const env = buildCleanEnv(paths, name, platform);` (l.917) and onto
    that same object: `if (job.run === 'builtin:dream' && platform !== 'win32')
    { const runToken = crypto.randomBytes(8).toString('hex');
    env.WIENERDOG_DREAM_RUN_TOKEN = runToken; … }`. That `env` is what `spawn`
    (l.1036) hands the child, so `WIENERDOG_JOB` and the token arrive together.
  - **Also set under `--catch-up`**: `catchUp` (l.1340) runs its due jobs through
    `const doRun = opts.runJob || runJob;` (l.1398) → `await doRun(paths, job,
    opts)` (l.1411), i.e. the same `runJob` and the same mint. There is no
    catch-up-only path that skips it.
  - **NOT set on win32**: l.934's guard is `platform !== 'win32'`, a deliberate
    A10 scope limit (its own comment names `WP-a10-windows-reap`). Consequence
    for this WP in Table A, "Supervisor correlate".
  - **Consumed** at `src/cli/dream.js` l.827-828, inside the brain-spawn block:
    `const rawToken = process.env.WIENERDOG_DREAM_RUN_TOKEN; const runToken =
    typeof rawToken === 'string' && /^[a-f0-9]{16}$/.test(rawToken) ? rawToken
    : null;` — *anything else treated as absent (standalone run)*. That is the
    validation Table A reuses; it is re-applied at the render, not re-invented,
    and the existing read at l.827-828 is not moved or altered.
  - What it does **not** establish: dream holds no prior copy of the token and
    the hand-up pidfile named after it does not exist yet at render time, so the
    check is shape-and-presence only — possession, not parentage (Table A,
    "Supervisor correlate", limit (b)).
- Tests: `tests/unit/dream-pipeline.test.js` (2220 lines) drives whole in-process
  dream runs through a `runDream(ctx, argv, opts)` harness — see its existing
  case *"the digest is regenerated AFTER the ledger is persisted (row G4, Table V
  row V10)"* (l.829). `tests/unit/scheduler-runjob.test.js` (3026 lines) drives
  `run-job` with fake commands (`opts.resolveCommand`, `opts.skipContainmentProbe`,
  `opts.sendAlert`) and already covers B1/B2 and the policy-hook warning.
  `tests/unit/dream-pipeline.known-calls.js` is SHA-pinned but pins only the git
  call set — nothing in this WP touches it.
  `tests/red-proofs/dream-pipeline.proofs.json` already exists and declares
  `"suite": "tests/unit/dream-pipeline.test.js"`; a declaration file is per WORK
  PACKAGE, not per suite, so this WP adds a file of its own rather than editing
  that one.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing, per scripts/boundary-check.js: this spec file
     itself, package-lock.json, memory/lessons/inbox.md, and docs/specs/logbook/. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/cli/dream.js | per Table A: give `regenerateDigest` a per-call flag defaulting to UNFILTERED; **leave the l.724 refresh and step 19 (l.1182) UNFILTERED, byte-identical to `main`**; add ONE filtered call as **the last statement of `try A`'s body** — after the inner `try`/`finally` closes at l.1212, before `finally A` at l.1213 — so it runs while this process still holds the dream lock; apply all THREE conjuncts including the per-record date test; capture the process start instant at the top of `run()`; and add the `require('../scheduler/jobs')` the cross-check needs. **No `catch`, no arming flag, no second render site, no stderr diagnostic, no write counting, and no hoisted binding** (Table A, "No hoist is needed"). The existing `WIENERDOG_DREAM_RUN_TOKEN` read at l.827-828 is re-used, not moved. No other behavior changes |
| modify | src/core/alert-ack.js | **comment only, zero code lines**: narrow the stale universal in `unacknowledgedAlerts`' JSDoc per Table B |
| modify | tests/unit/dream-pipeline.test.js | cover the dream-layer acceptance criteria below (the implementer designs the cases) |
| modify | tests/unit/scheduler-runjob.test.js | cover the run-job-layer acceptance criteria below |
| create | tests/red-proofs/dream-digest-omits-own-job-alerts.proofs.json | this WP's seven RED declarations (Table C); `suite` is `tests/unit/dream-pipeline.test.js` |

### Exact contracts

One predicate is added to `src/cli/dream.js`. Its name and placement are the
implementer's; its behavior is Table A's, and this is the shape:

```js
/** The job name whose success THIS dream run will establish, or null when this
 *  process is not a supervised dream job. Env is the supervisor's channel,
 *  config is the authority, and the per-run token is the correlate — ALL THREE
 *  are required (Table A, "Resolved job name"): `process.env.WIENERDOG_JOB`
 *  names a job that config.yaml defines with `run: builtin:dream`, AND
 *  `process.env.WIENERDOG_DREAM_RUN_TOKEN` matches /^[a-f0-9]{16}$/ — the same
 *  validation this file already applies to that variable. Anything else → null.
 *  @param {import('../core/paths').WienerdogPaths} paths
 *  @returns {string|null} */
function supervisingDreamJob(paths)
```

**The closure gains an explicit per-call flag and its default is UNFILTERED**
(Table A, "Where applied"), so the filtering behaviour exists only where a call
site asks for it by name. The alerts input at `src/cli/dream.js` l.646 becomes
the same expression with Table A's filter applied to its **result**, conditioned
on that flag:

```js
alerts: <filter>(unacknowledgedAlerts(paths, readAlerts(paths))),
```

The call sites, and the whole of the placement contract:

| Call site | Flag | Why |
|-----------|------|-----|
| l.724, the quarantine-only refresh | **unfiltered** | unchanged from `main`; this run may still fail, and a record hidden here would be a genuine unresolved failure |
| l.1182, step 19 | **unfiltered — unchanged from `main`, byte for byte** | the run has not finished: `destroyWorkspace` is still ahead of it and can throw |
| **NEW: the last statement of `try A`'s body** — after the inner `try`/`finally` closes (l.1212), before `finally A` (l.1213) | **filtered** | reached only by falling out of the whole body, so the dream's work AND the workspace teardown both succeeded — **and it runs while this process still holds the dream lock** |

`regenerateDigest` (l.641) and `ledger` (l.618) are declared in that same block,
so the new statement sees both: **no hoisted binding, no `catch`, no arming flag,
no second site, no write counting** (Table A, "No hoist is needed" and "Why there
is no recovery render").

Worked example. `config.yaml` defines `- name: dream / run: builtin:dream`;
`state/alerts.jsonl` holds

```json
{"job":"dream","at":"2026-09-10T01:30:04.001Z","reason":"job \"dream\" exited 1","log_hint":"~/.wienerdog/logs/dream/"}
{"job":"daily-digest","at":"2026-09-10T05:00:11.900Z","reason":"job \"daily-digest\" exited 1","log_hint":"~/.wienerdog/logs/daily-digest/"}
```

and the dream runs with `WIENERDOG_JOB=dream`.

**The literal `state/digest.md` this writes, in full.** Both files below were
produced by running the real renderer — `renderDigest` from `src/core/digest.js`
at this spec's pinned base — over an empty `mktemp -d` vault directory with
`opts.identityApprovals` left undefined, so no identity section exists and the
alert callouts are the entire file. That is the smallest fixture that still
demonstrates the contract: the own-job callout omitted, another job's kept.
(How it was produced is recorded in
`docs/specs/logbook/2026-09-17-dream-digest-omits-own-job-alerts-round-zero.md`.)

Supervised (`WIENERDOG_JOB=dream`) — **207 bytes**, the whole file:

```markdown
> [!warning] Wienerdog: the "daily-digest" job has failed. Latest error: job "daily-digest" exited 1. Details in ~/.wienerdog/logs/daily-digest/. This note clears automatically when the job next succeeds.


```

Unsupervised (`WIENERDOG_JOB` absent — an attended `wienerdog dream`; these are
today's bytes, unchanged by this WP) — **391 bytes**, the whole file:

```markdown
> [!warning] Wienerdog: the "dream" job has failed. Latest error: job "dream" exited 1. Details in ~/.wienerdog/logs/dream/. This note clears automatically when the job next succeeds.
> [!warning] Wienerdog: the "daily-digest" job has failed. Latest error: job "daily-digest" exited 1. Details in ~/.wienerdog/logs/daily-digest/. This note clears automatically when the job next succeeds.


```

**The trailing bytes are part of the expected output and a fenced block cannot
show them unambiguously**, so they are stated: each file ends with the last
callout line's `\n` followed by **exactly two more** `\n` — the rendered string
ends `succeeds.\n\n\n`, which is 3 lines by `wc -l` for the supervised file and
4 for the unsupervised one. The two callout lines are **not** wrapped: each is
one long line. The difference between the two files is exactly the 184 bytes of
the `"dream"` callout line, and nothing else — which is Table A's
empty-omission identity in bytes.

## Contract reference

Activation (ADR-0031, 2-of-7): **(v)** the task crosses an authority boundary —
`run-job` owns the alert lifecycle while `dream.js` owns the render that
displays it; and **(vii)** the same contract appears in mirrored surfaces
(Deliverables cells, acceptance criteria, verification gates, the RED
declarations' `why` fields, the JSDoc in `alert-ack.js`).

### Table A — the alerts the dream's digest render omits

| Fact / rule | Value |
|-------------|-------|
| **THE PRINCIPLE** | **when in doubt the stale callout is SHOWN; a genuine one is never hidden.** Every unresolved question resolves to rendering the record: an unresolved name, an absent or malformed run token, an unreadable config, a lookup that throws, a render reached before this run's success is established, a failure after that render. The principle governs what **this process's own renders** show, which is all a render in `dream.js` can govern. It does **not** promise that a failure recorded after this process exits reaches the digest at all — that is a separate, pre-existing property of the product, stated in the "What reaches the digest for the dream's OWN failures" row and unresolved as owner item O3. Every other row of this table is an application of one of those two |
| Where applied — **the filtered render is the LAST STATEMENT OF `try A`'s BODY, under the dream lock** | the `regenerateDigest` closure in `src/cli/dream.js` and nowhere else. The closure takes an **explicit per-call flag whose default is UNFILTERED**, so a call site added later is safe by construction. **Step 19 (l.1182) and the quarantine-only refresh (l.724) stay exactly as `main` has them: UNFILTERED.** The filtering call is a **new, single statement placed after the inner `try`/`finally` closes at l.1212 and before `finally A` at l.1213** — i.e. the last thing `try A`'s body does. **It therefore runs while this process still holds the dream lock**, which `finally A` releases at l.1221. `src/cli/sync.js` is unchanged; **no third feeder of the digest's alerts array is created** |
| When it may omit — **the body AND the workspace teardown both succeeded** | The filtered render runs only when control reaches the end of `try A`'s body normally: steps 11-21 completed, then `finally B`'s `destroyWorkspace` (l.1206-1212) completed, neither throwing. Nothing earlier omits anything, because until then the run may still fail and leave the record genuine. What is still AHEAD of it is only `finally A` — see "What can still fail after it" |
| **Why the lock is load-bearing, and why round 5's placement was wrong** | Round 5 put this render **after** `finally A`, outside the lock. Round 6 measured two consequences and both are removed by moving it back inside. **(i) A stale ledger could erase a newer quarantine banner.** `regenerateDigest` closes over **this run's** `ledger` (declared l.618, read into the render at l.644) rather than re-reading state. Unlocked, a second dream could acquire the lock, record a new quarantine, publish its banner and then fail — and this run's later render would overwrite that banner from its older ledger, leaving the quarantine active but invisible. Under the lock **no second dream can interleave at all**, so the closed-over ledger is by construction still current: nothing else has changed it. **(ii) Dream-to-dream write races disappear**, because there is no concurrent dream to race. `main`'s serialized dream renders never permitted either ordering, and this WP must not introduce them |
| **No hoist is needed** (round 5's obstacle is gone with the placement) | At the END of `try A`'s body, `regenerateDigest` (l.641) and `ledger` (l.618) are **in the same block** and therefore in scope, so the implementer declares nothing before `try A` and hoists nothing. `paths`, `vaultDir` and `layout` are outside the try anyway (l.564, l.581, l.582). Round 5's design needed a hoisted binding only because the statement sat after `finally A`; **L′ removes that plumbing along with the problem it existed for** |
| **Why NO guard is needed — the COMPLETE exit inventory of `run()`** | Every other exit is a `return` or a `throw`, and **neither falls through to the end of the enclosing `try` body**: a `return` inside `try A` jumps straight to `finally A`, skipping the new statement. Measured on this tree, at **every** nesting depth: **before `try A`** (opens l.608) — `throw` l.573 (mechanics-root entry gate), `throw` l.596 (`owner-unknown` lock), `return` l.602 (declined lock). **Inside `try A`** — `return` **l.740** (the dry-run arm of step 6), `throw` l.742 (no complete session admitted), `return` l.756 (nothing new to dream), `return` l.767 (dry-run plan), `throw` l.785 (containment halt), `throw` l.871, `throw` l.899, `throw` l.932, `throw` l.980, plus any throw from deeper code. **l.740 was MISSING from round 5's inventory** — that inventory was produced by an indentation-bounded scan which silently excluded anything nested more than three levels, and l.740 sits four levels in. A depth-bounded scan is not an inventory; this one is re-derived with no depth bound. A success boolean would still be redundant: reaching the end of `try A`'s body already means everything before it succeeded |
| **How many digest writes a run performs — NOT "exactly two"** | The rule is **ONE ADDITIONAL filtered write**, and the total depends on what else ran. A fully successful supervised run with **no** newly quarantined input writes **twice**: step 19, then the filtered render. A fully successful supervised run **with** a newly quarantined input writes **three** times, because the existing early refresh at l.724 also fires. Any run that does not reach the end of `try A`'s body writes whatever `main` would write and **nothing additional**. Round 5's spec asserted "exactly two" as a universal; **that is withdrawn** — round 6 measured the three-write case. The first write is byte-identical to `main`'s in every case, and every write is a whole-file atomic render through the same renderer, so no partial or blended state is observable |
| **What can still fail AFTER the filtered render** | Only `finally A` (l.1213-1222), and its three statements were read: `ownsLock` (`src/core/dream/lock.js` l.96-103) catches everything and returns `false` on any error — **cannot throw**; `releaseLock` (l.77-85) wraps its body in `try`/`catch` and its JSDoc at l.74 says **"Never throws"** — confirmed by reading it; `cleanScratch` (`src/core/dream/scratch.js` l.163-165) is a **bare `fs.rmSync(scratchDirOf(stateDir), { recursive: true, force: true })` with no `try`/`catch`**, and `force: true` suppresses only ENOENT — so **EACCES, EBUSY or EPERM propagate**. **Residual 1, and it is the main one:** if `cleanScratch` throws after the filtered render, the run exits non-zero with the filtered digest already on disk. The dream's work succeeded, the digest reflects that, and the supervisor certifies the job failed — the same shape as B1 |
| **Residual 2 — an ordinary concurrent `sync` can make a successful render throw** | Round 5 claimed a **temp substitution by a same-owner attacker** was the prerequisite for `WD_F10_POST_RENAME`. **That is false and is withdrawn.** `writeFilePrivate` renames at `src/core/private-fs.js` l.360 and lstats the destination at l.365; **any** writer that publishes its own whole-file render into `digest.md` in that window makes the identity check fail, with **no attacker and no substituted temp**. The writer that can do it is `wienerdog sync`, which **takes no dream lock at all** (measured: no `acquireLock`/`ownsLock`/`releaseLock` anywhere in `src/cli/sync.js`), so the lock does not exclude it. **This exposure is PRE-EXISTING**: step 19's render has exactly the same race with the same writer today. What this WP adds is **one more render per fully successful supervised run, and therefore one more window**. The consequence, as measured: the render throws → `run()` exits 1 → `last_success` is left unchanged, `last_status` becomes `error`, `clearAlerts` is **skipped**, and `job "dream" exited 1` is appended — a false failure for a run whose work succeeded. **Not fixed here**: the fix is in `writeFilePrivate`'s detection, which this WP does not own and which is deliberately detection-not-prevention. Owner item **O4**; routed under Discovered |
| **Why there is no recovery render** (the mechanism rounds 1-4 built, now REMOVED) | Round 1's F2 asked for an unfiltered re-render on any post-filter failure. Across rounds 2-5 that one mechanism required two call sites, an exactly-once guarantee spanning them, arming before the render, a fixed-text stderr diagnostic, a withdrawn preservation guarantee, compound-failure handling, and — round 5's finding — a conservative alert-set fallback, because a re-render whose `readAlerts` silently returns `[]` **publishes an alert-free digest and erases OTHER jobs' callouts**. A mechanism that grows its surface every round is the treadmill `docs/runbooks/codex-review.md` names. **Making the filtered render the last statement of the locked body removes the need for it**: almost nothing runs after it, and what does is enumerated in the row above |
| **A silent `readAlerts` failure renders an alert-free digest — on EVERY render, today included** | `readAlerts` returns `[]` when it cannot open the file (`src/core/alerts.js` l.157) **and** when `fstat`/`read` fails after opening (the `catch` opens at l.200; its `return []` is at l.201). So any render whose alert read fails transiently publishes a digest with **no callouts at all**, for every job, while every record remains stored. **This is pre-existing and unchanged by this WP** — step 19 and `sync` have always had it — and what this WP does is expose it on **one more render per fully successful supervised run**. It is stated rather than fixed: making it fail closed would change `readAlerts`' contract and every caller's behaviour, which is a different work package. Routed under **Discovered** |
| Filter position | applied to the **result** of `unacknowledgedAlerts(paths, readAlerts(paths))`, leaving that expression textually intact. Both orders yield the same set; this order is required so `alert-ack.js`'s standing claim that *both callers pass `readAlerts`* stays true (Table B narrows only the sentence that this WP actually falsifies) |
| Resolved job name | **two conjuncts about the RUN, both required** (a third conjunct about each RECORD is the next row). (1) `process.env.WIENERDOG_JOB` names a job that `jobsLib.findJob(paths, thatValue)` returns with `run` exactly the string `builtin:dream`; AND (2) `process.env.WIENERDOG_DREAM_RUN_TOKEN` is present and passes **the same validation dream.js already applies to it** — `typeof === 'string'` and `/^[a-f0-9]{16}$/` (l.827-828), re-applied, not re-invented. Every other case resolves to **no name**: either variable absent, not a string, empty or malformed; a name `config.yaml` does not define; a job whose `run` is anything else |
| **Record date — the THIRD conjunct, and it is per-RECORD not per-run** | Even with a resolved name, a record is omitted **only if its `at` is STRICTLY EARLIER than this dream process's start instant.** The start instant is captured **once, at the top of `run()`** — `src/cli/dream.js` l.557 `async function run(argv, opts = {}) {`, before l.558's first statement — as a wall-clock millisecond value, and it is **not** taken from the `opts.now` seam: that seam exists to resolve the dream's DATE STRING, and letting a test's date injection move this boundary would make a safety property depend on a test seam. Parsing is **strict**: the record is omitted only when `at` is a non-empty string that parses to a finite timestamp AND that timestamp is `< start`. **A missing, empty or unparseable `at` means the record is SHOWN**, as does a timestamp equal to the start instant. Why this conjunct exists: `run-job`'s watchdog rejects independently of the child's close event (`src/cli/run-job.js` l.1086, raced at l.1090), so `failLoud` at l.1257 can append a record **while this dream child is still alive** — a record dated AFTER this process started, describing a failure this run is already being blamed for and which that supervisor will never clear. The run-level conjuncts cannot see that case; the record's own date can |
| Clock movement, and which way the error falls | the comparison is wall-clock on both sides by construction — `at` is an ISO timestamp written by `nowIso()` and the start instant is the same clock — because a monotonic reading cannot be compared to a stored ISO string. **A clock that moves FORWARD is safe**: an older record can only end up dated later than the start instant, and a record not strictly earlier is SHOWN. **A clock that steps BACKWARD between this process's start and a supervisor append is the unsafe direction**: that append can be stamped earlier than the start instant and would then be omitted. Named, not chased — it needs a backward wall-clock step inside that specific window, and closing it would need a record field (a run token or a monotonic stamp) that `{job, at, reason, log_hint}` does not have (`src/core/alerts.js` `sanitizeAlert` l.46-50 drops unknown keys). Adding one is a change to the alert record's schema and is out of scope |
| **Every writer that can append under the dream's own name — the COMPLETE inventory, and what happens to each** | Two questions per writer: is the record **present at the final render** at all, and if so is its `at` before or after this process's start? A record appended **after** the final render is not filtered — it does not exist yet — which is a different thing from being omitted, and the row says which applies. **(a) `src/scheduler/launcher.js` l.509** `appendRefuseAlert(p, jobName, reason)` — a separate process; the record is built at l.192 as `{ job, at: new Date().toISOString(), reason, log_hint: '' }`. A fire refused while this dream is running is present and dated AFTER this process's start → **SHOWN**. **(b) `src/cli/run-job.js` l.953**, the managed-policy warning, appended under the job's name **before the spawn** → present and dated **before** this run's start → **OMITTED**. That loss is already priced in this table's last row and already deferred by the **Maintainer ruling (2026-09-10): "this WP ships first; the follow-up WP is drafted later."** Do not fix it here. **(c) `src/cli/run-job.js` l.911**, the TCC / protected-folder refusal — that run never spawns a dream, so nothing of ours renders during it; a LATER dream finds the record dated before its own start → **OMITTED** at that render, and the same later success's `clearAlerts` deletes it anyway. **(d) `src/cli/run-job.js` l.1257** on the watchdog-timeout path with the child still alive, and on the reap-failure path after the child exited → present, dated after this process's start → **SHOWN** (the timeout case is what the date conjunct exists for). **(e) `src/cli/run-job.js` l.1194 (B1)**, success-marker refused → appended **after** the dream child has exited, so **after** the final render: **not present, therefore not filtered** — it reaches the digest at the next render like any post-render record. **(f) `src/cli/run-job.js` l.1384 / l.1386 / l.1388**, the three named catch-up authorization refusals, appended under the job's name in the catch-up parent → the job did not run, so no render of ours happens; a later dream finds them dated earlier → **OMITTED** at that render, and that later success's `clearAlerts` deletes them. **(g) B2 (l.1204) deliberately skips the append** — the refused artifact IS `alerts.jsonl` — so it contributes no record at all |
| Supervisor correlate (the run token) | the token is minted per `runJob` invocation in the `if` block at `src/cli/run-job.js` **l.934-938** (both ends checked: l.934 `if (job.run === 'builtin:dream' && platform !== 'win32') {`, l.938 its closing `}`) — `crypto.randomBytes(8).toString('hex')` at **l.935**, the export at **l.936** — onto the same `env` object `buildCleanEnv` returned at **l.917**, which `spawn` (l.1036) hands the child — so on the supervised path both variables arrive together, **including under `--catch-up`**, which calls the same `runJob` (l.1398 `const doRun = opts.runJob \|\| runJob`). **Two limits, stated rather than implied.** (a) The mint is guarded by `job.run === 'builtin:dream' && platform !== 'win32'` (l.934), so **no token is minted on win32** and the omission therefore never engages on Windows — the stale callout stays, which is the safe direction, but this WP's fix does not reach that platform. (b) The token proves **possession of a supervisor-minted per-run value, not parentage**: dream has nothing to compare it against, so a process inheriting both variables still passes. It strictly narrows the accidental-inheritance vector; it does not close it. See O1's residual |
| Why this channel at all | the supervisor owns the alert lifecycle, so the supervisor is the only party that can say which job's alerts this run's success will clear; both variables are set by it in the child env. The config cross-check makes the accepted value config-derived rather than merely asserted, and it can never be inert on the scheduled path, because `runJob` is only reachable with a job that `findJob`/`listJobs` returned (`src/cli/run-job.js` l.1494, l.1343). **Not ruled on by the owner — see "Dispatch precondition — owner items", O1, which also carries the residual this channel leaves open** |
| Omitted set | when a name resolves **and** the call site is the filtering one: every record in the array whose `job` **strictly equals** that name **and whose `at` is strictly earlier than this process's start instant** (row above) — exactly the set `clearAlerts(paths, name)` will remove. Otherwise nothing is omitted, and the rendered bytes equal today's |
| Failure direction | **fail-safe toward SHOWING** (the principle row). Nothing in this filter may throw out of `regenerateDigest`. `listJobs`' own `catch { return []; }` (`src/scheduler/jobs.js` l.199-208) already gives the config-read half by construction |
| Paths that render nothing | a run that returns or throws without reaching a render leaves `digest.md` byte-untouched, so the filter has no effect there and the spec claims none: the `owner-unknown` lock throw (l.595-600, new in PR #245), the declined-lock exit-0 return (l.601-602), `nothing new to dream` (l.746-757) and the dry-run return (l.765-768). What the **supervisor** does on those paths is run-job's contract, not this one — the exit-0 declined-lock case is named in Out of scope |
| Early render then failure | a run can render at l.724 and then throw — the no-complete-input throw at l.736-743, the step-8b containment halt, a brain failure. **Both renders that a failing run can reach are unfiltered**, so the genuine callout is on screen on every one of those paths, and AC6a-AC6b assert the digest's content there, not only `alerts.jsonl`'s |
| **What reaches the digest for the dream's OWN failures** | **A pre-existing property of the product, measured in design round 2, which this WP does not create and does not fix.** A failed dream never reaches step 19, and on the ORDINARY failure path `run-job` appends the failure record after the child has exited (**not always — see the next row; round 4 falsified the "only after exit" universal**) (`src/cli/run-job.js` l.1251 error watermark → l.1257 `failLoud` → the append inside it at l.715 → l.1269 throw). The only render the failing run could have made is the **conditional** early quarantine refresh at `dream.js` l.724, and that ran *before* the record existed. So **today, before this WP**, a dream-job failure's callout enters `digest.md` only at a LATER render — an attended `wienerdog sync`, or a later dream's render — which means the run that typically displays it is the successful one whose success is about to clear it: the user sees the warning **after the failure has already been resolved**. That after-the-fact display is precisely the off-by-one this WP removes. **After this WP** a dream-job failure's callout reaches the digest only via (a) an attended `sync` render or (b) a later dream's l.724 early quarantine render, which is conditional on `sel.newlyQuarantined`. **There is no finite bound on that and this spec claims none.** The durable, timely channels for a dream failure are unchanged: the fail-loud **email** (best-effort — `failLoud` l.729 inside a `try`/`catch`, never retried) and `alerts.jsonl` itself, read by `wienerdog alerts`. **One qualifier, added in round 5:** a record stays in `alerts.jsonl` only until the job next succeeds, because `clearAlerts` (l.1204) deletes **every** record for that job by name alone — which is correct for an ordinary failure the success resolves, and is the crux of O3's survivor case where it is not. **Measured: `wienerdog doctor` surfaces alerts not at all** — `src/cli/doctor.js` contains **zero** occurrences of the string `alert` — so it is not one of those channels and must not be cited as one. Whether this is acceptable is owner item **O3**, which is unresolved |
| Out-of-process failures, and **the "post-exit-only" claim is WITHDRAWN** | `run-job`'s B1 (success-marker refused, l.1188) and B2 (alert-cleanup refused, l.1204) are **instances of the row above, not separate narrowings**. Round 1's claim that B1/B2 were the SOLE narrowing, and round 1's claim that the exposure was finitely bounded by "the next unfiltered render", were withdrawn in round 2. **Round 4 withdraws one more: the claim that `run-job` records a failure only AFTER the child exits.** It does not. The watchdog's `reject` (`src/cli/run-job.js` l.1086) is raced against the child's close event at l.1090, so on a **timeout** the flow reaches the error watermark (l.1251) and `failLoud` (l.1257) **while the dream child may still be running** — confirmed by round 4's in-memory execution of those bodies, not by reading them. That surviving child holds a legitimately minted run token and can go on to reach step 19. **The record-date conjunct is what covers it**: the supervisor's record is dated after this process started, so it is shown. The surviving general rule, stated without the false universal: **anything `run-job` appends or leaves that this process cannot re-render is invisible in the digest until some later unfiltered render happens, and nothing guarantees one.** Coupling `run-job` to the renderer is rejected alternative A (WP-041 forbids it), so any real fix is supervisor-side and outside this WP |
| **What this run's success actually establishes — and what it does NOT** | It establishes exactly one thing: **this dream process's own body ran to step 19 without throwing.** It does **not** establish that every record it omits describes a resolved condition. The measured counter-case is a **prior run's surviving process group**: `settleReaps` (`src/cli/run-job.js` l.362) examines only **the current run's** groups and token pidfile, so a later run's success proves nothing about a group an earlier run failed to reap — yet that earlier run's reap-failure record predates this process's start and is therefore omitted by the record-date conjunct. **This is not fixable with the record shape we have.** `{job, at, reason, log_hint}` carries no reason class and no run token (`src/core/alerts.js` l.46-50), and discriminating on the free-text `reason` would be brittle string-matching against a message this WP does not own — explicitly out of bounds. **Priced in O3, not fixed here**, and every claim of the form "an omitted callout describes a failure that has been resolved" is **WITHDRAWN** from this spec |
| Never changed | `formatAlerts` and every byte of its template, including the "clears automatically" sentence (byte-frozen, WP-neutralize-alert-callout-rendering); `src/core/digest.js` in any respect; `src/core/alerts.js` and every writer of `alerts.jsonl` (`appendAlert`, `failLoud`, the launcher's `appendRefuseAlert`); `clearAlerts` and where it is called; the acknowledgement store and `addAcks`/`pruneAcksForJob`/`unacknowledgedAlerts`' behavior; `src/cli/sync.js`; `wienerdog alerts`; `schedule.json`; the fail-loud email; the dream's lock handling in every arm. `run-job` still writes no byte of `digest.md` |
| Empty-omission identity | when nothing is omitted the digest is byte-identical to today's, so **no golden fixture moves** |
| Named consequence (managed-policy warning) | `run-job` l.953 appends a *warning* record under the job's own name before the spawn, and the job's success clears it, so today its only lasting surface is the very off-by-one this WP removes — rendered, wrongly, as `the "dream" job has failed`. After this change that banner is gone for the dream. Restoring a standing surface for it is a separate WP (Implementation notes; Out of scope) — it is not a failure and does not belong in the failure-alert log |

### Table B — the `alert-ack.js` comment narrowing

| Fact / rule | Value |
|-------------|-------|
| Anchor | `src/core/alert-ack.js`, the sentence at l.127 whose exact text is `This is the ONLY suppression point (Table B).` It occurs once in the file |
| Replacement | that sentence becomes: `This is the ONLY ACKNOWLEDGEMENT suppression point (Table B) — the only place this store is read. It is NOT the only filter applied to the array a caller hands renderDigest: at its FINAL render only, dream.js drops this result's records for the job whose success that run has just established (WP-dream-digest-omits-own-job-alerts, Table A).` Re-wrapped to the file's JSDoc style; the wrapping is the implementer's, the claim is not |
| Diff shape | **every** changed line in this file is a JSDoc continuation line (matches `^[+-] \*`). Zero executable lines change; behavior is identical before and after |
| Why it is in scope at all | the sentence is an ungated universal that this WP falsifies. `docs/runbooks/spec-authoring.md`: a universal either quantifies over a named table or names its exception set in place. Leaving it standing is how the next reader concludes no other filter exists |
| Not touched | the two sentences before it (the programming-error guard and the both-callers-pass-`readAlerts` parenthetical, which Table A's filter position keeps true), and every other comment or line in the file |

### Table C — the RED declarations (ADR-0042)

`id`, `wp` and `criterion` are fixed here so AC11 can name them without a
repo-wide count. The mutation literal, the marker and the `expectRed` identities
are the implementer's, because the filter's own name and shape are. **Each
declaration breaks exactly ONE conjunct or placement rule and no other**, so the
criterion it reddens is the one that owns that rule.

**Read the last column before using any row.** `scripts/red-proofs.js` requires
the observed own-body failing set to **EQUAL** the declared set, so a wrong set
fails the lane just as loudly as a missing proof. **As shipped, ALL SEVEN sets
are measured** *(corrected post-merge, see Erratum 2 — the Ready text said five
were measured and two derived; the implementer, as this paragraph authorized,
corrected three of them to what actually reddens)*. The rule that produced that
outcome stands and is why the column exists: **a derived row is a prediction and
the measurement is authoritative** — the implementer applies each mutation,
records what actually reddens, and commits THAT set, correcting this table in the
same PR if it differs. Design round 7 found the previous version of
this table requiring a mutant to redden criteria it cannot reach, which is the
failure this column exists to prevent.

| id | breaks exactly | must redden | must NOT redden | measured or derived |
|----|----------------|-------------|-----------------|---------------------|
| `dream-digest-filter-removed` | the filter itself: the alerts input reaches `renderDigest` unfiltered at every site, the call still being made | **AC1, AC6f, AC7d, AC7e, AC7g** — each asserts a digest that OMITS the own-job callout | AC2-AC5, AC6a, AC6b, AC6e (they assert nothing is omitted, which a removed filter satisfies); AC7a-AC7c and AC7f (the write still happens, so counts and placement are unchanged); AC8 | **MEASURED by the implementer** on the revised tests; the previous derivation named AC6c/AC6d and is **corrected**. AC6c/AC6d live in `tests/unit/scheduler-runjob.test.js`, which is not this declaration's `suite`, and they drive a FAKE child, so no mutation of `dream.js` can reach them. AC6f, AC7d and AC7e each carry a non-vacuity assertion on the omitted content and therefore redden too |
| `dream-digest-filter-ignores-config` | **only** the `findJob` + `run: builtin:dream` conjunct; the env conditional, the token conjunct and the date conjunct are retained | **AC4 AND AC8** — AC8 necessarily, because it asserts an unreadable config omits nothing, which is exactly what this conjunct delivers | AC1 (still omits), AC3 (env conditional retained), AC5 (token conjunct retained), AC6f (date conjunct retained), all of AC7 (placement untouched) | **measured** on `9d1282cf` |
| `dream-digest-filter-always-on` | **both** environment conditionals: the configured dream job's records are omitted whether or not either variable is set | **AC3, AC5 AND AC7d** | AC4 (the filter targets the CONFIGURED job's name, and AC4's fixture names a different one), AC1, AC6f, the rest of AC7 | **MEASURED by the implementer** on the revised tests; AC3/AC5 were measured on `9d1282cf` and AC7d is **added**, because AC7d's unsupervised control run now omits too, so its "the additional write omits nothing" assertion fires |
| `dream-digest-filter-ignores-run-token` | **only** the `WIENERDOG_DREAM_RUN_TOKEN` conjunct | **AC5** | AC1, AC3, AC4, AC6f, all of AC7 | **measured** on `9d1282cf` |
| `dream-digest-filter-ignores-record-date` | **only** the record-date conjunct: records are omitted by name alone, without comparing `at` to this process's start instant | **AC6f** — the timeout survivor's record is hidden, and the missing / unparseable / equal-`at` edges stop being shown | AC1 (its record predates the start, so it is omitted either way), AC2-AC5, all of AC7 | **MEASURED by the implementer** — the derivation was exact: AC6f alone |
| `dream-digest-filter-at-early-render` | **only** the placement rule at the early end: the quarantine-only refresh at l.724 passes the filtering value too | **AC6a, AC6b, AC7c AND AC7d** | AC7a, AC7b, AC7e-AC7g (the l.724 write is not an ADDITIONAL write; counts are unchanged), AC1-AC5 | **MEASURED by the implementer** on the revised tests; AC6a/AC6b were measured on `9d1282cf`, and **AC7c and AC7d are added** — AC7c's no-complete-input arm renders at l.724 and then asserts the digest content, and AC7d's quarantined fixture finds a pre-existing render filtered |
| `dream-digest-filter-at-step-nineteen` | **only** the placement rule at the late end: step 19's call passes the filtering value, so the omission happens before the finalizers instead of after them | **AC7a, AC7b and AC7d** — AC7a/AC7b because each asserts the digest left by a late failure is the UNFILTERED one `main` would leave, and AC7d because it asserts step 19's write is byte-identical to `main`'s, which this mutation changes | **AC7c** — *removed in round 7*: none of its early-exit paths (l.602, l.740, l.742, l.756, l.767) reaches step 19, so the mutation cannot change them. Also AC6a/AC6b (they fail before step 19), AC6c/AC6d (the run succeeds, so the final render filters either way), AC7g, AC1-AC5 | **MEASURED by the implementer** — the derivation was exact: AC7a, AC7b and AC7d, and AC7c stayed green. **AC7f did not redden**: it asserts the write count and the propagated error only, not digest content |

`wp` is `WP-dream-digest-omits-own-job-alerts` for all seven. **AC2, AC6c, AC6d
and AC6e are in no `expectRed` set** *(corrected post-merge, see Erratum 1 — the
Ready text named only AC2 and AC6e)*: AC2 observes nothing any mutation changes;
AC6e pins a PRE-EXISTING product property that no mutation of this WP's code can
alter; and **AC6c and AC6d live in `tests/unit/scheduler-runjob.test.js`, outside
this declaration file's `suite`, and drive a fake child — so no mutation of
`src/cli/dream.js` can reach them.** A declaration can only redden tests in its
own suite, which makes a cross-suite criterion unprovable by construction rather
than merely undeclared. AC9-AC12 are gate criteria the verification steps
establish, not mutation targets.

### Mirrored Surface Checklist

Each of these restates a fact decided in Table A, Table B or Table C. A review
finding updates the table **and every mirror below in the same commit** — no
commit exists in which they disagree — and any new mirror found in review is
added here on the spot:

- [ ] Deliverables-table cells (the `dream.js` row cites Table A's flag default,
      the unchanged step-19 call, the single post-`finally` filtering call and the
      explicit absence of a recovery mechanism; the `alert-ack.js` row Table B;
      the `.proofs.json` row Table C's count)
- [ ] Acceptance criteria that assert Table A's principle, its omitted set, ALL
      THREE conjuncts of its resolution rule (the two run-level ones and the
      per-record date test, AC5/AC6f), its failure direction, its per-site
      placement (AC6), the out-of-process class including the ordinary failure
      (AC6c/AC6d/AC6e), and the last-statement-under-the-lock placement — not
      reached on any early return or throw, reached exactly once on full success,
      ONE ADDITIONAL filtered write, step 19 byte-identical to `main`, and
      `ownsLock` still true at the moment it renders (AC7a-AC7g); Table B's diff
      shape; Table C's ids, MEASURED expectRed sets, criteria and count
- [ ] Verification commands (V3/V4 assert Table B, V5 asserts Table A's frozen
      template, V2/V6 assert Table C — V6's `want` array is the literal mirror of
      Table C's id column, **seven ids as of round 4**, and must be re-sorted
      whenever that column changes)
- [ ] Current-state description (l.646's expression, the two call sites, the
      non-rendering paths, the `WIENERDOG_JOB` channel, **both ends of the
      run-token channel including its win32 and catch-up facts**, the `findJob`
      reachability argument, `listJobs`' catch, **run-job's ordinary failure path
      l.1251/l.1257/l.1269 and the measured fact that `doctor` reads no alerts**,
      **the watchdog race l.1086/l.1090 that falsifies "post-exit only", the
      `writeFilePrivate` rename-then-verify order (`private-fs.js` l.360/l.372),
      the record shape and ordering facts in `alerts.js` l.46/l.151/l.222, and the
      try/finally topology at `dream.js` l.608/l.815/l.1206/l.1213, the complete
      exit inventory of `run()` that makes the last-statement placement
      guard-free, `readAlerts`' fail-open at `alerts.js` l.157/l.201, and
      `sync.js` holding no dream lock**)
- [ ] The `why` field of each declaration in
      `tests/red-proofs/dream-digest-omits-own-job-alerts.proofs.json`
- [ ] Operative prose steps that apply it — there are **twelve**, and they are
      enumerated rather than gestured at, because this is the class no gate
      reaches:
      (a) the predicate sketch's JSDoc under "Exact contracts" (Table A,
      *Resolved job name*, both conjuncts);
      (b) the sentence replacing l.646's expression, the `alerts:` code line
      under it, and **the three-row call-site table beneath it** (Table A,
      *Filter position* and *Where applied*);
      (c) the worked example and the two literal `digest.md` files with their
      byte counts and trailing-byte note (Table A, *Omitted set* and
      *Empty-omission identity*);
      (d) Implementation notes' first bullet, that `../scheduler/jobs` is
      first-party (the Deliverables `dream.js` row's added require);
      (e) Implementation notes' TWO "Named residual" bullets — the
      out-of-process one (Table A, *What reaches the digest for the dream's OWN
      failures* and *Out-of-process failures are ONE class*, including its
      explicit withdrawal of round 1's sole-narrowing and finite-bound claims)
      and the TWO placement residuals — `cleanScratch` throwing after the render
      (Table A, *What can still fail AFTER the filtered render*) and the ordinary
      concurrent `sync` write (Table A, *Residual 2*, mirrored again in O4 and
      under Discovered);
      (f) Implementation notes' "Named consequence" and Definition of done item
      3, which requires it in "Decisions made" (Table A, last row);
      (g) Implementation notes' "Config edited mid-run" and the
      attended-`wienerdog dream` bullet (Table A, *Failure direction* and
      *Resolved job name*);
      (h) Out of scope's declined-lock bullet (Table A, *Paths that render
      nothing*) and its `sync.js` bullet (Table A, *Where applied*);
      (i) Security checklist items 1 and 3 (Table A, *Resolved job name* and
      *Supervisor correlate*);
      (j) Table B's *Replacement* text, whose narrowed sentence describes when
      dream.js drops records and must stay true to Table A's *When it may omit*
      and to the record-date conjunct;
      (l) Implementation notes' **RESUME-from-`9d1282cf`** bullet, whose numbered
      list 1-5 is a delta against what Table A said at `2d5e2465` and must be
      re-derived whenever Table A changes again;
      (k) the Context section's closing paragraph, which argues the fix from the
      step-19 comment and therefore asserts Table A's *When it may omit*.
      The rejected alternatives A and C are NOT in this set: they apply no table
      fact, they record why two designs outside every table were refused.
- [ ] "Dispatch precondition — owner items" O1, which mirrors Table A's
      *Supervisor correlate* and *Why this channel at all* rows, and whose
      residual (a)/(b)/(c) mirror that row's two limits; **O3, which mirrors
      the whole of *What reaches the digest for the dream's OWN failures*,
      including the `doctor` measurement and the no-finite-bound statement**; and
      **O4, which mirrors *Residual 2* — the rename/lstat window, `sync` holding
      no dream lock, the withdrawal of the temp-substitution prerequisite, and the
      measured exit-1 consequence**
- [ ] Context: the WP-041 quote and the statement that its accepted lag is
      withdrawn while its prohibition is kept

## Dispatch precondition — owner items

Four decisions in this package are the owner's. **The owner has ruled on none of
them directly.** Each is dispatched under this repo's standing process — *the
maturing architect records a recommendation with the cost of overruling it, the
session may dispatch under that recommendation, and the owner reverses any of
them by dated amendment* — settled in
`docs/specs/logbook/2026-09-05-owner-rulings-git-env-pinning-queue.md` and
carried into this session by
`docs/specs/logbook/2026-09-17-owner-rulings-felho-integration-3.md`, whose
"Items dispatched under the standing process" section lists all three with their
overrule costs. Nothing in this file is a ruling, an approval or an acceptance,
and nothing below should be read as one.

**The one ruling that IS on record** and is cited as such in Out of scope:
*Maintainer ruling (2026-09-10): this WP ships first; the follow-up WP is drafted
later.* It governs the managed-policy-warning follow-up only.

### O1 — is the env-plus-config-plus-token channel trustworthy as job identity?

**The question.** The filter needs to know which job's success this run will
establish. Design round 1 found that `WIENERDOG_JOB` plus the `findJob`
cross-check establishes *that a job name is plausible*, not *that this process is
the child whose success will resolve the alert*: an attended or wrapper-launched
`wienerdog dream` that merely inherits `WIENERDOG_JOB=dream` passes it whenever
the normal dream job exists. Table A's rule was **narrowed in response** and now
requires a second conjunct, the supervisor's per-run
`WIENERDOG_DREAM_RUN_TOKEN` (Table A, "Supervisor correlate"). Should the dream
trust the narrowed channel?

**Recommendation: yes, with all three conjuncts, and with the residual below
stated in the spec rather than left to a reader.** The narrowing costs **zero new
surface**: the token already exists, is already minted per `runJob` invocation
including under `--catch-up`, already travels in the same `env` object as
`WIENERDOG_JOB`, and is already validated in this very file at l.827-828 by the
regex this rule re-applies. It is strictly better than the round-1 design and
cannot be inert on the supervised POSIX path.

**The residual, stated honestly.** Two parts, and neither is closed.
(a) **Possession is not parentage.** A process that inherits *both* variables —
a wrapper script, an exported shell environment, a re-exec — still passes. The
token narrows the accidental-inheritance vector from "a guessable job name" to
"a live 16-hex value the supervisor minted", which is a large narrowing and not
a closure; dream holds no prior copy to compare against, and the hand-up pidfile
named after the token does not exist yet at render time.
(b) **What is actually at risk after the F2 fix is smaller than it was.** The
filter now applies only at the final render, i.e. only after THIS process's dream
run has succeeded, so the callout a spoofed or inherited environment can hide is
*"the dream job has failed"* shown immediately after a dream in fact succeeded.
The record is never touched: it stays in `alerts.jsonl`, `wienerdog alerts`
still prints it, and the callout returns at the next **unfiltered** render — any
`wienerdog sync`, or the next dream's l.724 refresh — and stays gone from
`alerts.jsonl` only once a genuinely supervised success clears it.
(c) **On win32 the omission never engages at all**, because no token is minted
there (Table A, "Supervisor correlate", limit (a)). The Windows behaviour after
this WP is today's behaviour.

**Standing-process status.** O1's recommendation is **adopted under standing
authorization, not by a direct ruling** — recorded 2026-09-17 in
`docs/specs/logbook/2026-09-17-owner-rulings-felho-integration-3.md` and
reversible by dated amendment at any time, at the cost below.

**Overrule cost.** If the owner rules this channel still untrustworthy, the WP
does not shrink — it changes shape. The remaining alternative is a supervisor→
child channel that proves parentage, for example a per-run file under `state/`
that `run-job` writes before the spawn and whose content the dream must match:
that adds a writer to `state/`, an uninstall/cleanup obligation, a lifecycle to
keep in step with `clearAlerts`, and a new failure mode of its own. It is a
different, larger work package. Concretely rewritten in that case: Table A's
"Resolved job name" and "Supervisor correlate" rows, the predicate sketch in
"Exact contracts", AC3, AC4, AC5, and the `dream-digest-filter-ignores-config`,
`dream-digest-filter-always-on` and `dream-digest-filter-ignores-run-token`
declarations — after which this spec returns to drafting rather than being
amended in place.

### O2 — should the pre-dream containment probe get a single retry?

**The question.** The run that exposed this defect failed for an unrelated
reason: the pre-dream containment probe
(`src/core/dream/containment-probe.js`, `PROBE_TIMEOUT_MS = 120_000`) received
no assistant message within its 120 s budget and returned ETIMEDOUT — a
transient upstream API stall, not a containment regression. The probe has no
retry: one stall halts the dream fail-closed for that fire, which is the correct
default for a containment check but converts a transient network event into a
nightly miss. Should it retry once before halting?

**Recommendation: decide it separately, and not here.** It is a change to a
fail-closed security check's semantics, on a file this WP does not touch, with
its own threat-model argument to make (a retry doubles the window in which a
genuinely broken runtime is re-probed rather than refused). It is listed under
Out of scope and stays there whichever way it goes.

**Standing-process status.** O2's recommendation is **adopted under standing
authorization, not by a direct ruling** — recorded 2026-09-17 in
`docs/specs/logbook/2026-09-17-owner-rulings-felho-integration-3.md` and
reversible by dated amendment at any time, at the cost below.

**Overrule cost.** If the owner rules the retry in scope of *this* WP: the
Deliverables table gains `src/core/dream/containment-probe.js` and its test file,
the WP crosses from M into a second concern, and per the sizing rule it splits
rather than grows. Nothing in Table A, Table B or Table C changes either way —
the two concerns share no surface.

### O3 — is it acceptable that the dream's own failures lose their after-the-fact digest callout, given what success does and does not prove?

**Round 4 rewrote this item's premise. The earlier wording overstated what a
successful run establishes, and that overstatement is withdrawn here.**

**The question.** Two parts, and the second is new.

*(a) The after-the-fact display.* A failed dream does not reach step 19, so its
record's callout is displayed by a LATER render — typically the next *successful*
dream, i.e. after that failure has been resolved by the very run that shows it.
After this WP that later successful render filters the job out, so a dream-job
failure's callout reaches the digest only via an attended `wienerdog sync` or a
later dream's conditional l.724 quarantine render, with **no finite bound**. The
failure still reaches the user through the fail-loud **email** and through
`alerts.jsonl` / `wienerdog alerts`; **`doctor` does not show alerts at all**
(measured: zero occurrences of `alert` in `src/cli/doctor.js`, re-run
independently by the round-3 reviewer).

*(b) What success proves — the part that was overstated.* The earlier wording of
this item said that every callout the filter removes describes a failure that has
already been resolved. **That is not true, and it is withdrawn.** What a
successful run establishes is only that **this dream process's own body ran to
step 19 without throwing** (Table A, "What this run's success actually
establishes"). Round 4 measured two cases where a record the filter would remove
is *not* resolved:

- **A timeout survivor.** `run-job`'s watchdog rejects independently of the
  child's close event (l.1086, raced at l.1090), so the supervisor can record a
  failure **while this dream child is still running**. **This case is FIXED, not
  priced**: the record-date conjunct (Table A) shows any record dated at or after
  this process's start, so the supervisor's record survives the filter.
- **A prior run's surviving process group.** `settleReaps` (l.362) examines only
  the current run's groups and token, so this run's success proves nothing about a
  group an earlier run failed to reap — and that earlier record predates this
  process's start, so the filter *does* remove it. **This case is PRICED, not
  fixed.** It cannot be fixed with the record shape we have: `{job, at, reason,
  log_hint}` carries no reason class and no run token, and discriminating on the
  free-text `reason` would be brittle matching against a message this WP does not
  own.

  **Round 5 corrected the mitigation this item used to claim, and the correction
  cuts both ways.** The old wording said the record stays available through
  `alerts.jsonl` and `wienerdog alerts`. **It does not stay.** A later successful
  supervised run calls `clearAlerts(paths, name)` (`src/cli/run-job.js` l.1204),
  which deletes **every** record for that job (`src/core/alerts.js` l.222 filters
  on `job` alone) **regardless of whether a prior run's group survived** — round 5
  reproduced exactly that by executing `runJob`, `settleReaps` and `clearAlerts`.
  And the fail-loud email is **best-effort**: `failLoud` calls `send` at l.729 inside its own
  `try {} catch {}` (l.728-732), so delivery is attempted once and never retried
  or reported, and the whole of `failLoud`'s body sits in a second
  best-effort `catch` (l.733). So the honest
  statement is that for this case **the callout is removed by this WP and the
  record is removed by the existing supervisor moments later**.

  **What is pre-existing, and it is most of it.** The deletion is today's
  behaviour and is not this WP's doing. And the callout's disappearance is today's
  behaviour too, one render later: today that later successful run renders the
  survivor's callout at step 19, `clearAlerts` then deletes the record, and the
  **next** render drops the callout anyway. **What this WP changes is one
  render's worth of display** — roughly, one nightly cycle in which the callout
  would have been visible before the record vanished — not whether the record
  survives or whether the condition is ever surfaced again. Stated that way the
  residual is real and much smaller than the old wording implied, and the old
  wording's *mitigation* was the part that was wrong, not the risk.

So the question is: **is (a) acceptable given the email channel, and is (b)
acceptable as a priced residual?**

**Recommendation: yes to both, and (b) is the one to look at hardest.** On (a):
that display *is* the bug this WP was filed for — the 2026-09-10 report is a
session being told the dream job had failed when it had just succeeded — and
keeping it means keeping a warning that is wrong at the moment it is shown. On
(b): the exposure is a pre-existing ADR-0030 residual (a group wedged beyond a
bounded escalation) whose own alert text says so, the loud channels already fired
when it happened, and the alternatives are all worse than the problem — a reason
class on the alert record is a schema change to a durable file, and matching free
text is exactly the brittleness this repo has paid for before. The only fix that
would make either case visible in the digest *while unresolved* is a render
performed by the supervisor, which is rejected alternative A, prohibited by name
in WP-041.

**Standing-process status.** O3's recommendation was **adopted under standing
authorization, not by a direct ruling** — recorded 2026-09-17 in
`docs/specs/logbook/2026-09-17-owner-rulings-felho-integration-3.md`, where it is
listed FIRST as the item most likely to want the owner's eye. **That record
carries the pre-round-4 premise and is not edited by this pass**, so this section
is the current wording and the two differ: the record says every omitted callout
describes a resolved failure; **this section withdraws that**. The recommendation
remains reversible by dated amendment at any time, at the cost below, and the
widened premise is itself a reason the owner may want to revisit it.

**Overrule cost.** If the owner rules the loss unacceptable, this WP does not
ship as drafted: the fix has to be a supervisor-side notification surface, which
means re-opening WP-041's prohibition (an ADR-level decision, not a spec edit) or
designing a standing warning channel that is not the failure log — the same shape
the managed-policy-warning follow-up needs, and plausibly the same WP. Table A's
principle row survives, but "When it may omit", the whole filtering design and
AC1 are then moot, and this spec is superseded rather than amended. Two smaller
overrules exist and neither blocks this WP: "ship the filter, and also give
`doctor` an unacknowledged-alerts section", and "ship the filter, and add a reason
class to the alert record so survivor alerts can be excluded from omission" — the
second is the honest fix for (b) and is a schema change to `alerts.jsonl` with its
own migration question.

### O4 — is one more `digest.md` write per successful dream an acceptable added race window?

**The question.** `writeFilePrivate` renames into place (`src/core/private-fs.js`
l.360) and then lstats the destination to confirm it is the inode it wrote
(l.365), throwing `WD_F10_POST_RENAME` if not. That check is
**detection-not-prevention** by design, and it does not distinguish a hostile
temp substitution from an ordinary writer that legitimately published its own
render in the same window. `wienerdog sync` is exactly such a writer and **takes
no dream lock**, so no lock excludes it. **The race is pre-existing** — step 19's
render has it today — and this WP adds **one more render per fully successful
supervised run**, therefore one more window. When it fires the run exits 1, and
the measured consequence is `last_success` unchanged, `last_status: error`,
`clearAlerts` skipped, and `job "dream" exited 1` appended: **a false failure
alert for a run whose work succeeded**. Is the added window acceptable?

**Recommendation: yes, accept it here and fix it where it belongs, if at all.**
It requires an attended `sync` to land inside a sub-millisecond window at the end
of a nightly dream; the failure is loud rather than silent; the dream's work is
already committed and the vault is unaffected; and the next successful run clears
the alert. The honest fix is to make `writeFilePrivate` tolerate a legitimate
concurrent replacement — a change to a security-relevant detector used by every
private writer in the product, which is its own work package with its own threat
argument. Doing it inside this WP would mean editing a file that is not a
Deliverable and weakening a check this WP did not design.

**Standing-process status.** O4's recommendation is **adopted under standing
authorization, not by a direct ruling** — the process settled in
`docs/specs/logbook/2026-09-05-owner-rulings-git-env-pinning-queue.md` and carried
into this session by
`docs/specs/logbook/2026-09-17-owner-rulings-felho-integration-3.md`. It is
reversible by dated amendment at any time, at the cost below. **O4 post-dates
that record's entry for this WP**, so the entry there is out of date; the
replacement text is in this package's hand-off and this section is the current
wording.

**Overrule cost.** If the owner rules the added window unacceptable, the smallest
honest fix is not in this WP either: it is either the `writeFilePrivate` change
above, or making `sync` take the dream lock — which changes the locking contract
for an attended command and can make `sync` refuse while a dream runs, a
user-visible behaviour change. Either way this WP's Table A placement rows and
AC7 survive unchanged; what changes is whether it may add a second render at all,
and if the answer is no the WP reverts to a single filtered render at step 19 and
re-acquires all of round 5's problems.

## Implementation notes & constraints

- Zero new dependencies; plain Node ≥ 18; JSDoc types; no build step (CLAUDE.md).
  `../scheduler/jobs` is a first-party module already in the tree.
- **RESUME from `9d1282cf`, do not start over** (branch
  `wp/dream-digest-omits-own-job-alerts`, on `origin`; suite 2767 pass / 2755 /
  0 fail / 12 skipped, lint clean). That work was dispatched against the spec as
  it stood at `2d5e2465`. Much of it survives — the predicate, the conjuncts, the
  per-call flag — but **the render placement is now different in shape, not just
  in detail.** What CHANGED relative to `2d5e2465`, and nothing else has:
  1. **The filter gains a third conjunct, per RECORD** (Table A, "Record date").
     At `2d5e2465` a resolved job name omitted every record with that `job`. Now
     it omits only those whose `at` is **strictly earlier** than the process start
     instant, with missing/unparseable/equal-`at` all **shown**. No schema change
     is needed: `sanitizeAlert` (`src/core/alerts.js` l.46) coerces every record
     to exactly `{job, at, reason, log_hint}` as strings and drops unknown keys,
     `at` is `run-job`'s `nowIso()`, `readAlerts` (l.151) returns **file order,
     not parsed order**, and `clearAlerts` (l.222) matches on `job` alone. That
     also settles what is NOT implementable here: anything keyed on a run token or
     a reason class, because neither is in the record.
  2. **The recovery mechanism comes OUT, entirely.** Delete the `catch A` and any
     `finally A` wrapper you added, delete `restoreAfterStepNineteen` and its
     arming statement, delete the stderr diagnostic and any write counting. There
     is no recovery render in this design.
  3. **Step 19 reverts to the UNFILTERED call** — byte-identical to `main`'s
     `regenerateDigest();` at l.1182. Your `regenerateDigest({omitOwnJobAlerts:true})`
     there is removed.
  4. **One new call becomes the LAST STATEMENT OF `try A`'s BODY** — after the
     inner `try`/`finally` closes at l.1212, before `finally A` at l.1213 —
     passing the filtering flag. **It must run while the dream lock is still
     held**; `finally A` releases it at l.1221. **No hoisted binding is needed**:
     `regenerateDigest` (l.641) and `ledger` (l.618) are in that same block.
     (If you already built round 5's "after `finally A`" placement plus a hoisted
     binding, remove both — round 6 measured that the lock is load-bearing.)
  5. **AC7 is entirely different**: it no longer counts recovery attempts. It
     proves the filtered render is NOT reached on the early returns and throws —
     including **l.740**, the step-6 dry-run arm, which round 5's exit inventory
     missed — IS reached exactly once on full success as **one ADDITIONAL write**
     measured against `main` for the same fixture, happens while `ownsLock` is
     still true, and still happens when `cleanScratch` later throws.
  6. **Table C's `expectRed` sets are the measured ones**, including the AC4+AC8
     pair your run surfaced; `dream-digest-no-recovery-render` is replaced by
     `dream-digest-filter-at-step-nineteen`.
  7. **Two claims the earlier text made are withdrawn** and must not reappear in
     your tests: "exactly two digest writes" (a run with a newly quarantined input
     performs three) and "a temp substitution is the prerequisite for
     `WD_F10_POST_RENAME`" (an ordinary concurrent `sync` write suffices).
  Your measured red sets for the five declarations that survive are unchanged and
  are carried into Table C as measurements.
- **Test seams that bracket the render exactly**, measured on the paused branch:
  `identityApprovals.readRegistry` (called before the alerts array is built) and
  `identityApprovals.approvalsMap` (called after it, before the atomic write),
  both reached through the module object so `t.mock.method` can patch them. **Trap
  the implementer already hit:** `createWorkspace` calls `destroyWorkspace` on its
  own failure arms, so an `fs.rmSync` probe keyed on the workspace dirname fires
  **before** step 19 unless it is gated on "a render has already happened".
- **Rejected alternative A — have `run-job` re-render `digest.md` after a
  successful `clearAlerts`.** Rejected twice over: WP-041 states *"Do NOT couple
  `run-job` to the digest renderer"* and made the deletion of run-job's
  `writeDigestBanner` an acceptance criterion; and run-job would have to
  reassemble every digest input the dream assembles (identity approvals
  registry, quarantine banner line, scheduler status line, secret quarantine,
  insecure-modes count), creating a third feeder where WP-attended-alert-
  acknowledgement records that there are exactly two and *"there is no third
  feeder"*.
- **Rejected alternative C — clear the job's alerts before the job body runs.**
  It destroys WP-041's durability invariant: a run that fails mid-way would have
  spent part of its life with no record on file, and a crash between the clear
  and the failure would erase a real, unresolved failure. Only success may
  retire a record.
- **Not considered: changing what `formatAlerts` says.** The sentence is
  code-owned, byte-frozen text with two live tests asserting its bytes
  (`tests/unit/digest-alert-callout-neutralize.test.js`, `tests/unit/alerts.test.js`).
  This WP makes the sentence true; it does not renegotiate it.
- **Named residual — anything `run-job` records after the child exits is
  invisible in the digest until some later unfiltered render, and nothing
  guarantees one** (Table A, "What reaches the digest for the dream's OWN
  failures" and "Out-of-process failures are ONE class"). Round 1's version of
  this bullet claimed the exposure was B1/B2 only and finitely bounded; design
  round 2 measured **both claims false** and they are withdrawn. What is true:
  round 1's in-process half really was fixed, and rounds 5-6 fixed it by
  PLACEMENT rather than by a recovery render — **both existing renders (l.724 and
  step 19) stay unfiltered**, so the quarantine-then-no-complete-input path, the
  step-8b containment halt and a brain failure all leave the genuine callout on
  screen, and the filtered render is reached only when the whole body has already
  succeeded. There is no re-render on any failure path: **the recovery mechanism
  was removed at round 5** and nothing replaced it. What remains is the
  out-of-process half, and it is **wider than B1/B2**: an ordinary dream-body
  failure is recorded the same way, after the child has exited
  (`src/cli/run-job.js` l.1251 → l.1257 → l.1269), and the failing run made no
  render after that record existed. `schedule.json` carries the signal only on
  that ordinary path (`last_status: 'error'`): B1 fires *because* the marker
  write threw, so it records neither status, and B2 fires after
  `last_status: 'ok'` was already written. **This is a pre-existing property of
  the product, not something this WP introduces** — what this WP changes is that
  a later successful dream no longer displays the record after the fact, which is
  the misleading display the WP exists to remove. The channels that do carry it
  are the fail-loud **email** and `alerts.jsonl` / `wienerdog alerts`; `doctor`
  does not (measured, Table A). AC6c, AC6d and AC6e pin the behaviour. Do not
  widen this WP to chase it — the honest fix is supervisor-side, rejected
  alternative A forbids the obvious one, and whether the change is acceptable at
  all is owner item **O3**.
- **Named residual 1 — `cleanScratch` can throw after the filtered render**
  (Table A, "What can still fail AFTER the filtered render"). Under L′ the only
  code left after the filtered write is `finally A`, and of its three statements
  only one can throw: `cleanScratch` is a bare
  `fs.rmSync(scratchDirOf(stateDir), { recursive: true, force: true })`
  (`src/core/dream/scratch.js` l.163-165) with no `try`/`catch`, and `force: true`
  suppresses only ENOENT — EACCES, EBUSY and EPERM propagate. `ownsLock`
  (`src/core/dream/lock.js` l.96-103) and `releaseLock` (l.77-85, JSDoc l.74
  "Never throws") both catch everything. So: the dream's work succeeded, the
  filtered digest is on disk, and the supervisor certifies the job failed — the
  same shape as B1, and AC7g pins it. Not fixed here: making `cleanScratch`
  best-effort changes teardown semantics this WP does not own.
- **Named residual 2 — an ordinary concurrent `sync` can make a successful render
  throw** (Table A, "Residual 2"). **Round 5's claim that a same-owner attacker's
  temp substitution was the prerequisite is WITHDRAWN**: `writeFilePrivate`
  renames at `src/core/private-fs.js` l.360 and lstats at l.365, and **any**
  writer publishing its own whole-file render into `digest.md` in that window
  fails the identity check. `wienerdog sync` is such a writer and **takes no dream
  lock at all**, so the lock does not exclude it. The exposure is **pre-existing**
  — step 19's render races the same writer today — and this WP adds one more
  render per fully successful supervised run, hence one more window. Measured
  consequence: exit 1, `last_success` unchanged, `last_status: error`,
  `clearAlerts` skipped, `job "dream" exited 1` appended. Whether that added
  window is acceptable is **owner item O4**; the fix would be in
  `writeFilePrivate`, which is deliberately detection-not-prevention and which
  this WP does not own.
- **Named consequence — the managed-policy hook warning loses its banner**
  (Table A, last row). Today `run-job` l.953 appends it under the job's own name
  before the spawn and the job's success clears it, so on a managed machine its
  only lasting surface is the dream's stale render — displayed as `the "dream"
  job has failed`, which it is not. This WP removes that. The honest fix is a
  standing warning surface of its own, not a record in the failure log that
  every success erases; that is a separate WP and is named in Out of scope. Flag
  it in the PR body under "Decisions made" so the maintainer sees it land.
- **Config edited mid-run.** A dream brain can run for tens of minutes; if the
  `dream` job is renamed or removed from `config.yaml` in that window the
  cross-check resolves no name and the render falls back to today's behavior
  (a stale banner until the next render). Fail-safe direction, accepted.
- The filter must not change what `wienerdog dream` does when run attended with
  no `WIENERDOG_JOB` set: nothing clears alerts on that path, so nothing may be
  hidden on it either.
- **`scripts/red-proofs.js` refuses a `node_modules` SYMLINK** at snapshot
  (`ERROR: SNAPSHOT — unsupported entry type: symbolic link at node_modules`) —
  which is what a git worktree sharing the main checkout's dependencies has. If
  yours does, run V2 with `--root` pointed at a
  `git archive HEAD | tar -x -C <dir>` copy. A normal clone is unaffected.
- When uncertain: choose the simpler option and record it under "Decisions made"
  in the PR body. Do NOT expand scope to resolve ambiguity.

## Security checklist

- [ ] The template's untrusted-identifier item is **N/A — no identifier this WP
      reads reaches a filesystem path or a shell command.** `WIENERDOG_JOB` is
      used for exactly two things: an in-memory key lookup
      (`jobsLib.findJob` → `listJobs().find(j => j.name === name)`, which builds
      no path from it) and a string equality against each record's `job` field.
      `WIENERDOG_DREAM_RUN_TOKEN` is used for exactly one: a shape test against
      `/^[a-f0-9]{16}$/`, whose result is a boolean — this WP never uses the
      token's VALUE for anything, and in particular never builds the hand-up
      pidfile name from it (that remains l.827-828's existing job). No path
      segment, no shell word, no regex is constructed from either.
- [ ] **The surface this WP touches is what the injected digest tells the model.**
      It can only ever *remove* a callout, never add or alter one: `formatAlerts`,
      its template and every stored record are untouched, so no new bytes reach
      the digest and the neutralizing guarantees of
      WP-neutralize-alert-callout-rendering are unaffected.
- [ ] **Env-trust residual, named — and narrowed once by design round 1.** An
      environment that carries BOTH `WIENERDOG_JOB` naming the configured dream
      job AND a valid-shaped `WIENERDOG_DREAM_RUN_TOKEN` could hide that job's
      callout from one render of an unsupervised run. Both conjuncts are now
      required (Table A, "Resolved job name"); possession of the token is not
      parentage, and O1's residual says so rather than claiming closure. The
      record itself is never touched, `wienerdog alerts` still prints it, and the
      next unfiltered render restores it. No privilege boundary is crossed — the
      only actor who can set either variable is the process that spawns the
      dream: `run-job` (which sets the true values) or the user's own shell. The
      decision to accept this channel at all is O1, which is unresolved.

## Acceptance criteria

Numbered so Table C's declarations and the verification steps can name them.

- [ ] **AC1 — the reproduction.** With `config.yaml` defining `dream` as
      `run: builtin:dream`, one unresolved `dream` record on file, and the dream
      run under `WIENERDOG_JOB=dream`: the `state/digest.md` the run writes
      contains no `> [!warning]` line naming `"dream"`. The other half of the
      sequence is asserted at the layer that owns it — a successful `run-job`
      leaves no record for that job in `alerts.jsonl`. **Verified by V1.**
- [ ] **AC2 — other jobs are never omitted.** With records for `dream` and for a
      second job on file and the run supervised as `dream`, the second job's
      callout renders unchanged. **Verified by V1.**
- [ ] **AC3 — unsupervised runs are unchanged.** With `WIENERDOG_JOB` absent from
      the environment, the same fixture renders both callouts, byte-identical to
      the pre-change output. **Verified by V1.**
- [ ] **AC4 — the resolution rule holds in both refusing directions** (Table A):
      a `WIENERDOG_JOB` naming a job absent from `config.yaml`, and one naming a
      job whose `run` is not `builtin:dream`, each omit nothing — including when
      an alert for that very name is on file. **Verified by V1.**
- [ ] **AC5 — a valid job name without a valid run token omits nothing** (Table
      A, "Resolved job name", second conjunct): a direct `wienerdog dream`
      carrying `WIENERDOG_JOB=dream` that `config.yaml` really does define as
      `builtin:dream`, but with `WIENERDOG_DREAM_RUN_TOKEN` absent, empty, of the
      wrong length or containing a non-hex character, renders the `dream` callout
      in every one of those cases. **Verified by V1.**
- [ ] **AC6 — the two render sites behave DIFFERENTLY, and that is the
      contract** (Table A, "Where applied" / "When it may omit"). Each of the
      FIVE sub-criteria asserts the CONTENT of the `state/digest.md` on disk at
      the end of the run **together with** the `alerts.jsonl` state, so neither
      surface is ever checked alone — round 1's finding was precisely a criterion
      that checked the record and not the view. (`alerts.jsonl` on B2 is the one
      place a new record is NOT expected: the `alert-cleanup-refused` outcome
      deliberately skips the append because the refused artifact IS that file —
      existing contract, unchanged by this WP.) The five:
      **(AC6a)** quarantine-only refresh at l.724, then the no-complete-input
      throw at l.736-743: the digest shows the `dream` callout, because l.724 is
      unfiltered.
      **(AC6b)** a supervised run that renders at l.724 and then fails later —
      the step-8b containment halt and a brain failure: same, the callout is
      shown.
      **(AC6c)** B1, success-marker refused. B1 runs in `run-job` **after the
      dream child exited 0**, so by then the filtered render — the last statement
      of the locked body — has already run and published. The test therefore
      asserts: the digest on disk is **the filtered one** (no `dream` callout),
      and `alerts.jsonl` holds the new `success-marker-refused` record that the
      digest does not show. It is an instance of Table A's "Out-of-process
      failures" row, PINNED so a future change to it is visible, not claimed as
      safe. Note what this criterion does NOT say: it makes no claim about step
      19's bytes, which are `main`'s and are AC7d's subject.
      **(AC6d)** B2, alert-cleanup refused: the digest omits the callout and the
      job's earlier records survive in `alerts.jsonl` — same row, same reason.
      **Verified by V1.**
- [ ] **AC6e — the ordinary dream failure, end to end, PINNING the stated
      behaviour** (Table A, "What reaches the digest for the dream's OWN
      failures"). Starting from a digest with no `dream` callout in it, make the
      dream child fail so `run-job` takes its ordinary failure path (l.1251
      watermark → l.1257 `failLoud` → l.1269 throw): assert the new record IS
      appended to `alerts.jsonl`, and assert the digest content is exactly what
      that Table A row says it is — **the callout is NOT there**, because the
      failing run made no render after the record existed. This criterion exists
      to pin a pre-existing product property so that a later change to it cannot
      pass unnoticed; it asserts no improvement and must not be read as one.
      **Verified by V1.**
- [ ] **AC6f — the timeout survivor, which the record-date conjunct exists for**
      (Table A, "Record date"). A supervised run in which `run-job` appends an
      own-job record **while this dream child is still alive** — the watchdog
      path at `src/cli/run-job.js` l.1086/l.1090 reaching `failLoud` at l.1257 —
      and the child then goes on to reach step 19 with a valid `WIENERDOG_JOB`
      and a validly-shaped run token: **the digest still shows the `dream`
      callout**, because that record's `at` is not strictly earlier than this
      process's start instant. Assert digest CONTENT, with `alerts.jsonl`
      alongside. Also assert the two parsing edges from the same Table A row: a
      record whose `at` is missing or unparseable is **shown**, and a record whose
      `at` equals the start instant is **shown**.

- [ ] **AC7 — the filtered render is the last statement of the locked body, and
      only a fully successful run reaches it** (Table A, "Where applied", "Why the
      lock is load-bearing", "Why NO guard is needed"). Each sub-criterion
      asserts the CONTENT of `state/digest.md` at the end of the run; the
      "not reached" ones assert the digest still carries the own-job callout.
      **NOT reached** — inject each of these and assert **no additional digest
      write happens** and the digest is the unfiltered one `main` would leave:
      **(AC7a)** the body throws after step 19 (steps 20-21);
      **(AC7b)** `destroyWorkspace` throws (`src/cli/dream.js` l.1211, inside
      `finally B` at l.1206-1212);
      **(AC7c)** the run returns early — the step-6 dry-run arm (**l.740**), the
      no-complete-input throw (l.742), *nothing new to dream* (l.756), the
      dry-run plan return (l.767), and the declined-lock return (l.602).
      **Reached** —
      **(AC7d)** on a fully successful supervised run the filtered render happens
      **exactly once**, observed as actual digest WRITES: **one ADDITIONAL write**
      beyond what `main` performs for the same fixture, with the step-19 write
      byte-identical to `main`'s. Assert the count against `main`'s for the SAME
      fixture rather than against a literal — a run with a newly quarantined input
      performs three writes and one without performs two (Table A, "How many
      digest writes a run performs").
      **(AC7e)** **the render happens while the lock is still held**: at the
      moment the filtered write occurs, `ownsLock(paths.state)` is still true.
      This is the regression for round 6's stale-ledger finding and it is what
      makes "no second dream can interleave" a checked claim rather than an
      argument.
      **(AC7f)** a compound failure — the body AND `destroyWorkspace` both throw —
      still performs **no** additional write, and the error that propagates is the
      one the unmodified code would propagate.
      **(AC7g)** `cleanScratch` throws (`src/core/dream/scratch.js` l.163-165,
      inside `finally A`): the filtered write **did** happen, the digest on disk
      is the filtered one, and the run still exits non-zero. This pins Table A's
      Residual 1 rather than leaving it unstated.
      **Verified by V1.**
- [ ] **AC8 — nothing throws out of the filter** (Table A, failure direction): a
      run whose config is missing or unreadable still renders a digest, and
      renders it with nothing omitted. **Verified by V1.**
- [ ] **AC9 — `src/core/alert-ack.js` changes comments only** and carries Table
      B's narrowed claim; its behavior is unchanged and
      `tests/unit/alert-ack.test.js` passes untouched. **Verified by V1, V3, V4.**
- [ ] **AC10 — the frozen surfaces did not move**: every file under
      `tests/golden/` is byte-identical and none is edited, and
      `src/core/digest.js` is unchanged. **Verified by V1, V5.**
- [ ] **AC11 — the RED declarations exist and prove.** The file named in
      Deliverables declares exactly the seven ids of Table C under this WP's `wp`,
      and `scripts/red-proofs.js` reports `RUN: PROVEN` over the whole tree.
      **Verified by V2, V6.**
- [ ] **AC12 — the repo gates pass**: `npm test`, `npm run lint`, and
      `scripts/boundary-check.js` over the changed set. **Verified by V1, V7.**
- [ ] Idempotence: **N/A — this WP ships no command and adds no write to a user
      machine.** It changes one input to a render that already rewrites
      `state/digest.md` in full on every call.

## Verification steps (run these; paste output in the PR)

```bash
# V1 — AC1-AC10 and AC12: the whole suite, plus the three focused runs.
npm test
npm test -- --test-name-pattern "dream-pipeline"
npm test -- --test-name-pattern "scheduler-runjob"
npm test -- --test-name-pattern "alert"

# V2 — AC11, THE GATE. Whole tree: exit 0 and `RUN: PROVEN` required. A `--wp`
# SELECTION never exits 0 while any other WP has declarations — the runner's
# design, not a failure — so it is the readable per-proof view, NOT the gate.
node scripts/red-proofs.js
node scripts/red-proofs.js --wp WP-dream-digest-omits-own-job-alerts  # expect: PROVEN lines, rc 1 (FILTERED)

# The three gates below diff against the MERGE BASE, not `main`'s tip: `main`
# moving for unrelated reasons must not colour this branch's diff.
MB=$(git merge-base origin/main HEAD)

# V3 — AC9 / Table B gate 1: every changed line in alert-ack.js is a JSDoc
# continuation line (leading "+"/"-", then " * "). Empty output = pass. The
# `test -f` guard is deliberate: without it a deleted file makes the pipeline
# read greenest.
test -f src/core/alert-ack.js && \
  [ -z "$(git diff "$MB" -- src/core/alert-ack.js | grep -E '^[+-]' \
      | grep -vE '^(\+\+\+|---)' | grep -vE '^[+-] \*')" ]

# V4 — AC9 / Table B gate 2: the narrowed claim is present exactly once…
test "$(grep -Fc 'ONLY ACKNOWLEDGEMENT suppression point' src/core/alert-ack.js)" = 1
# …and the ungated universal it replaces is gone. Guarded for the same reason.
test -f src/core/alert-ack.js && ! grep -Fq 'This is the ONLY suppression point' src/core/alert-ack.js

# V5 — AC10 / Table A gate: digest.js is not a Deliverable, so the frozen template
# cannot have moved. An empty numstat means the file is untouched.
test -z "$(git diff --numstat "$MB" -- src/core/digest.js)"

# V6 — AC11's identity check: this WP's own `wp` field names exactly the seven
# declared ids, in the declaration file whose suite is the dream-pipeline suite.
node -e 'const d=require("./tests/red-proofs/dream-digest-omits-own-job-alerts.proofs.json");
if (d.suite !== "tests/unit/dream-pipeline.test.js") { console.log("FAIL: suite is " + d.suite); process.exit(1); }
const ids = d.proofs.filter((p) => p.wp === "WP-dream-digest-omits-own-job-alerts").map((p) => p.id).sort();
const want = ["dream-digest-filter-always-on", "dream-digest-filter-at-early-render", "dream-digest-filter-at-step-nineteen", "dream-digest-filter-ignores-config", "dream-digest-filter-ignores-record-date", "dream-digest-filter-ignores-run-token", "dream-digest-filter-removed"];
console.log(ids.join(","));
process.exit(JSON.stringify(ids) === JSON.stringify(want) ? 0 : 1)'

# V7 — AC12: the repo gates. boundary-check takes the spec and the changed set as
# .github/workflows/ci.yml invokes it, but WITHOUT `mapfile` (absent from macOS
# /bin/bash 3.2.57). No tracked path in this repo carries a space.
npm run lint
node scripts/boundary-check.js docs/specs/WP-dream-digest-omits-own-job-alerts.md $(git diff --name-only origin/main...HEAD)
```

- **V3, V4, V5 and V6 are NEW steps, and each is an ASSERTION**: it exits
  non-zero on failure rather than printing something a reader has to judge. Paste
  a real green on the finished state **and** a real red from each of three
  deliberately broken states — the deliverable ABSENT (delete
  `src/core/alert-ack.js`; delete the `.proofs.json`), the deliverable VIOLATING
  (change one executable line in `alert-ack.js`; reword the narrowed sentence
  past its prefix; touch `src/core/digest.js`; rename a declared proof id), and
  the compliant state — so a check that cannot fail is caught before anyone
  believes it. V2's own both-directions evidence is the runner's, which reports
  each phase.

## Out of scope (do NOT do these)

- **Changing `formatAlerts`, its template, or any digest text** — including
  adding a "some alerts are hidden" line. Frozen by
  WP-neutralize-alert-callout-rendering; `src/core/digest.js` is not a
  Deliverable.
- **Making `run-job` render or re-render `digest.md`** (rejected alternative A),
  and **making `sync.js` filter anything** — an attended sync establishes no
  job's success, so it must keep showing every unresolved record.
- **Moving, adding or removing any call to `clearAlerts`/`appendAlert`**, and any
  change to `src/core/alerts.js` or the launcher's `appendRefuseAlert`.
- **The declined-lock exit-0 path, and what the supervisor does with it.** When
  `acquireLock` declines as `busy`, `dream.js` prints and returns **exit 0**
  (l.601-602), so `run-job` certifies the run as a success, writes the success
  marker (l.1188) and calls `clearAlerts(paths, 'dream')` (l.1204) although no
  dream body ran — and because that path renders nothing, a pre-existing callout
  can outlive the record it derives from. That is a lock/supervisor-semantics
  defect, present identically before and after this WP, and it belongs to
  **`WP-dream-lock-stale-owner-loud`**, being drafted in parallel. Do not change
  any lock arm, the exit code, or run-job's success handling here.
- **Giving the managed-policy hook warning a standing surface.** Named in Table
  A and Implementation notes; it needs its own WP, because the correct fix is a
  channel that a successful run does not erase, not a record in the failure log.
  **Maintainer ruling (2026-09-10): this WP ships first; the follow-up WP is
  drafted later.** Losing the warning's only (mislabelled) surface in the
  interim is accepted.
- **Retrying the pre-dream containment probe** — owner item O2, unresolved.
  Nothing in this WP touches `src/core/dream/containment-probe.js`.
- The `--catch-up` pseudo-job's records, which nothing ever clears
  (WP-attended-alert-acknowledgement), and bounding the launcher's unbounded
  writer (WP-launcher-alert-bound, Superseded — never implemented).
- Editing `docs/specs/done/WP-041-persistent-failure-alerts.md`. Its accepted
  lag is withdrawn by *this* spec's Context; a Done spec is a point-in-time
  record and is not rewritten.

## Discovered (not this WP's work — recorded so it is not lost)

- The containment-probe stall that produced the observed failure, and the
  question of whether the probe should retry once: stated in full as owner item
  **O2** above, and listed in Out of scope. Not restated here.
- **`readAlerts` fails open to an alert-free digest, on every render, today.**
  `src/core/alerts.js` `readAlerts` returns `[]` both when the file cannot be
  opened (l.157) and when `fstat`/`read` fails after opening (the `catch` opens at l.200 and its
  `return []` is at l.201). A transient read error therefore makes ANY render —
  step 19's, `sync`'s, and now the final filtered one — publish a digest with no
  callouts for any job, while every record remains stored and `wienerdog alerts`
  still prints them. Design round 5 reproduced this by executing the production
  reader, the regeneration closure and `formatAlerts` together. **Pre-existing,
  not introduced here, and deliberately not fixed here**: making the reader fail
  closed changes its contract and every caller's behaviour, and the digest has no
  way today to say "the alert list could not be read". This WP's only effect on it
  is to expose it on one additional render per fully successful supervised run.
  A separate WP should decide whether `readAlerts` should distinguish "no alerts"
  from "could not read alerts", and what the digest should say in the second case.
- **`writeFilePrivate`'s post-rename identity check cannot tell a hostile temp
  substitution from an ordinary concurrent writer.** `src/core/private-fs.js`
  renames at l.360 and lstats at l.365, throwing `WD_F10_POST_RENAME` (l.372)
  whenever the destination is no longer the inode it wrote — which is equally
  true when `wienerdog sync` legitimately publishes its own whole-file render in
  that window. Design round 6 reproduced this by executing `writeFilePrivate`
  with a competing legitimate write between the rename and the lstat: no
  attacker, no substituted temp, and the competing writer's bytes correctly on
  disk. The check is deliberately detection-not-prevention, so this is a known
  design limit rather than a bug, but the **consequence** — a false job-failure
  alert for a run whose work succeeded — is worth its own decision. **Pre-existing
  and not introduced here**; this WP only adds one more render per fully
  successful supervised run, and prices that as owner item **O4**. A separate WP
  should decide whether the detector can distinguish the two cases, or whether
  the writers that can collide should be serialized instead.

## Definition of done

0. **RESUME, do not restart.** Branch `wp/dream-digest-omits-own-job-alerts`
   already exists on `origin` at **`9d1282cf`** with most of this work done
   against an earlier version of this spec. Continue on that branch — do not
   re-cut it — rebased onto the SHA the dispatcher's re-verification names
   (Current state), and work through the **numbered delta** in Implementation
   notes ("RESUME from `9d1282cf`"), which lists exactly what changed and what
   to delete. Never commit to `main`.
1. All verification steps pass locally; output pasted into the PR body,
   including the deliberately-broken red runs for V3-V6.
2. Conventional commits (`fix|test|docs(dream): … (WP-dream-digest-omits-own-job-alerts)`);
   ONE PR, titled exactly
   `fix(dream): the digest render omits the alerts this run's success clears (WP-dream-digest-omits-own-job-alerts)`.
3. PR template filled, including "Decisions made" — which must name the
   managed-policy-warning consequence (Table A, last row) — and `Generated-by:`.
   Keep the body well under ~30 KB; put long round dispositions in a PR comment
   (`docs/runbooks/codex-review.md`, Rules).
4. This spec's `status:` flipped from `Ready` to `In-Review` in the same PR.
5. Both PR review gates have run on the diff and are clean or fully
   dispositioned — they are defined in `docs/runbooks/codex-review.md` and not
   restated here. `In-Review` marks the START of review: this list is complete
   only when review is.
