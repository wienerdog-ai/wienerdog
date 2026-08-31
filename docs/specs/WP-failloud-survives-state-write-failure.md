---
id: WP-failloud-survives-state-write-failure
title: A failed watermark write must never suppress a job's durable failure alert
status: Draft
model: sonnet
size: S
depends_on: []
adrs: [ADR-0004]
epic: issue-168
---

# WP-failloud-survives-state-write-failure: the alert outlives the watermark

## Context (read this, nothing else)

Wienerdog is just files (ADR-0004): scheduled work runs as one-shot jobs, and a
job that fails has exactly one way to tell the user — **fail-loud**. `failLoud`
(`src/cli/run-job.js:611-634`) appends a durable record to `state/alerts.jsonl`
and best-effort emails it. That record is what `wienerdog doctor` reports, what
the injected digest surfaces at the next session start, and — per
`src/cli/run-job.js:1098-1101` — what other cleanup keys off. If the alert is
not written, a failed job is silently indistinguishable from one that never ran.

`failLoud` is written to be **total**: its whole body sits in a `try` whose
`catch` is empty and commented "Fail-loud is best-effort; never mask the
original failure", and it returns a `persisted` boolean rather than throwing
(`:611-634`). So the alert can never be lost by `failLoud` itself failing.

It can be lost by `failLoud` never being **reached**. On each of `runJob`'s
three failure paths, the job writes an error watermark to `state/schedule.json`
and then calls `failLoud` on the very next line. The watermark write can throw,
it is not guarded, and the throw escapes `runJob` — so the alert for the
original failure is never appended. This WP fixes that ordering. It changes no
mode, no file format and no alert content; it only makes the alert's execution
independent of whether the watermark persisted.

This is a **pre-existing defect**, measured on HEAD (below), not one introduced
by other work. It is specified separately because
`WP-private-state-writers-mode-pin` hardens exactly those watermark writers, and
hardening a writer at an unguarded call site widens the ways this defect can
fire. That WP therefore depends on this one; this WP stands on its own merits
and is dispatchable first.

## Current state

Measured on HEAD `a6e0803`.

**The three sites.** `runJob` spans `src/cli/run-job.js:743-1113`. Three failure
paths share one shape — watermark, then alert, then throw:

| Site | Failure it reports |
|------|--------------------|
| `:797-799` | vault is under a macOS protected folder (TCC guard refusal) |
| `:872-874` | pre-routine containment self-check did not pass |
| `:1096-1097` | the general failure/timeout/reap backstop |

Each reads, at `:797`:

```js
jobsLib.writeScheduleState(paths, name, { last_status: 'error', last_error_at: nowIso() });
await failLoud(paths, name, reason, opts);
throw new WienerdogError(`job "${name}" ${reason}`);
```

**They are unguarded.** All three sit at `runJob`'s top level. `runJob`'s first
`try` opens at `:834` and closes at `:838`; the next opens at `:897` and closes
at `:1006`. Between `:743` and `:797` there is no `try` at all, `:872` falls
between the two, and `:1096` follows the last one. So a throw from
`writeScheduleState` propagates straight out of `runJob`, past the `failLoud`
call on the following line.

**The watermark write can throw today.** `writeScheduleState`
(`src/scheduler/jobs.js:232-240`) calls `fs.mkdirSync`, `fs.writeFileSync` and
`fs.renameSync`, none guarded. Measured: with `state/` made unwritable — the
same class a full disk (`ENOSPC`), a read-only filesystem (`EROFS`) or a quota
(`EDQUOT`) produces — the call throws:

```text
TODAY's writeScheduleState throws: EACCES - open
```

So on HEAD, a job that fails while the disk is full loses its durable alert
entirely: no `alerts.jsonl` record, no doctor warning, no digest line. The user
sees a job that reported nothing.

**Not a candidate here.** `:1060` writes the *success* watermark and is followed
by `clearAlerts` (`:1061`). It is deliberately left alone: there is no alert to
lose on that path, and a throw there leaves prior alerts uncleared, which is
fail-safe (a stale alert is visible; a missing one is not).

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing, per scripts/boundary-check.js:44-54: this
     spec file itself, package-lock.json, memory/lessons/inbox.md, and
     docs/specs/logbook/. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/cli/run-job.js | the three failure-path watermark calls at `:797`, `:872`, `:1096` only, per Table A. Do NOT change `failLoud` (`:611-634`), the success-path pair at `:1060-1061`, or any `reason` string |
| modify | tests/unit/scheduler-runjob.test.js | cover the acceptance criteria below; the implementer designs the cases |

### Exact contracts

`runJob`'s observable behavior on these three paths is unchanged except that the
durable alert is now reached unconditionally. No signature changes, no new
exported function, no change to any `reason` text or to what `failLoud` writes.

## Contract reference

Activation (ADR-0031, 2-of-7): **(iv)** error/fallback ordering on the failure
paths changes; and **(v)** the watermark and the alert are two different durable
records with different owners, and this WP fixes which one's failure may
suppress the other.

### Table A — failure-path ordering contract

| Fact / rule | Value |
|-------------|-------|
| Sites | `src/cli/run-job.js:797`, `:872`, `:1096` — and only these three |
| Invariant | a throw from the watermark write MUST NOT prevent the `failLoud` call that follows it |
| Precedence | the alert reports the **original job failure** (`reason`), never the watermark's I/O error — the persistence failure must not overwrite, prefix or replace it |
| What `runJob` still throws | the same `WienerdogError` carrying the original `reason`, as on HEAD — a watermark failure does not change the exception the caller sees |
| Watermark failure visibility | it must not vanish silently; surface it on a non-alert channel (the run's stderr/log). It must not become a second `alerts.jsonl` record, which would double-report one job failure |
| Success path | `:1060-1061` is NOT changed (see Current state) |
| Ordering | the alert must still be attempted after the watermark attempt, not before — the existing sequence is preserved, only its failure coupling is broken |
| Unchanged | `failLoud` itself, every `reason` string, the `alertPersisted` return at `:1097` and the cleanup at `:1098-1101` that keys off it |

### Mirrored Surface Checklist

- [ ] Deliverables-table cells (the `run-job.js` row cites Table A)
- [ ] Acceptance criteria that assert Table A's invariant and precedence rows
- [ ] Verification steps
- [ ] Current-state (the three sites, their unguarded position, the measured throw)
- [ ] The dependency note in `WP-private-state-writers-mode-pin`'s Context and
      its `depends_on` — this WP is its stated precondition

## Implementation notes & constraints

- Zero new dependencies; plain Node ≥ 18; JSDoc types; no build step (CLAUDE.md).
- The whole change is local to three call sites. Do not introduce a wrapper
  helper, do not re-order the failure paths, and do not touch the reap/token
  logic at `:1098-1111`.
- Do not make the watermark write itself non-throwing inside
  `src/scheduler/jobs.js`: other callers rely on its errors, and
  `WP-private-state-writers-mode-pin` changes that function for an unrelated
  reason. The fix belongs at the call sites.
- Swallowing the watermark error **silently** is not acceptable — Table A's
  visibility row. A job whose state did not persist and whose operator was never
  told is the same class of defect this WP is fixing.
- When uncertain: choose the simpler option and record it under "Decisions made"
  in the PR body. Do NOT expand scope to resolve ambiguity.

## Security checklist

- [ ] The template's untrusted-identifier item is **N/A — no untrusted
      identifier reaches a filesystem path or a shell command here.** This WP
      adds no path construction and no command; it only re-sequences two
      existing calls.
- [ ] The surface this WP touches is **the integrity of the failure-reporting
      channel.** Today an attacker or an accident that can make one small write
      fail (fill the disk, remount read-only) can suppress the durable record of
      every failing job while the jobs go on failing. After this WP the alert no
      longer depends on the watermark succeeding.
- [ ] Residual, named: `failLoud` remains best-effort by design (`:630-632`) —
      if `alerts.jsonl` itself cannot be written the alert is still lost, and
      `:1097`'s `alertPersisted` is how the caller already accounts for that.
      This WP does not change that contract; it only guarantees the attempt.

## Acceptance criteria

- [ ] With the watermark write forced to throw at each of the three sites, the
      durable alert for the original failure is still appended to
      `state/alerts.jsonl` (Table A invariant).
- [ ] That alert's `reason` is the original job-failure reason, not the
      watermark's I/O error, and no second alert record is created for the same
      failure (Table A precedence + visibility).
- [ ] With the watermark write forced to throw, `runJob` still rejects with a
      `WienerdogError` carrying the original reason — the caller-visible outcome
      is unchanged.
- [ ] The watermark failure is surfaced on a non-alert channel rather than
      discarded silently.
- [ ] When the watermark write succeeds, behavior is byte-identical to HEAD on
      all three paths: same watermark written, same alert, same throw.
- [ ] The success path at `:1060-1061` is unmodified, and a successful job still
      writes `last_success` and clears its alerts.
- [ ] Idempotence: `N/A — this WP ships no command and writes nothing new; it
      re-sequences two existing calls on three failure paths.`
- [ ] `npm test` and `npm run lint` pass.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern "run-job|runjob"
npm test
npm run lint
```

Plus the **pre-existing-defect reproduction**, which must go from RED on HEAD to
GREEN on the branch. It makes the watermark write fail the way a full disk does
(an unwritable `state/`) and asserts the durable alert still lands:

```bash
cat > /tmp/wd-alert-survives.js <<'LITERAL'
// Demonstrates the defect this WP fixes: with state/ unwritable, TODAY's
// writeScheduleState throws, and at run-job.js:797/:872/:1096 that throw
// escapes runJob before failLoud runs. Exits non-zero while the defect stands.
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const R = process.cwd();
const { getPaths } = require(R + '/src/core/paths');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-alert-'));
const paths = getPaths({ HOME: root, WIENERDOG_HOME: path.join(root, 'wd') });
fs.mkdirSync(paths.state, { recursive: true, mode: 0o700 });
fs.chmodSync(paths.state, 0o500); // unwritable: the ENOSPC/EROFS/EDQUOT class
let threw = null;
try { require(R + '/src/scheduler/jobs').writeScheduleState(paths, 'dream', { last_status: 'error' }); }
catch (e) { threw = e.code; }
fs.chmodSync(paths.state, 0o700);
if (!threw) { console.error('FAIL: the watermark write did not throw; this probe no longer reproduces'); process.exit(1); }
console.log(`watermark write throws ${threw} — at :797/:872/:1096 this is thrown`);
console.log('BEFORE the failLoud on the next line, so the durable alert is lost.');
process.exit(1); // RED until the call sites guard it
LITERAL
node /tmp/wd-alert-survives.js
```

- The probe above establishes the **mechanism** and is red by construction on
  HEAD. The real acceptance evidence is the test file: it must force the
  watermark write to fail at each of the three sites through `runJob` itself and
  assert the alert survives. Paste both the probe's HEAD output and the new
  tests' green run, plus a red run from deliberately reverting one of the three
  guards — a guard that is never exercised is a guard nobody has tested.

## Out of scope (do NOT do these)

- The mode of `state/schedule.json`, or any change to `writeScheduleState`'s
  body — that is `WP-private-state-writers-mode-pin`, which depends on this WP.
- Making `failLoud` throw, retry, or report persistence failures differently.
- The success path at `:1060-1061`, and the reap/token release at `:1098-1111`.
- Any other unguarded write in `runJob` that is not one of the three sites in
  Table A — note them under "Discovered issues" if you find them.
- Cross-process locking or durability guarantees for `alerts.jsonl` (ADR-0004
  keeps that out; `failLoud` is best-effort by design).

## Definition of done

1. All verification steps pass locally; output pasted into the PR body,
   including the HEAD-red / branch-green pair.
2. Conventional commits; PR titled
   `fix(run-job): keep the durable alert when the watermark write fails (WP-failloud-survives-state-write-failure)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
5. Both PR review gates have run on the diff and are clean or fully
   dispositioned — they are defined in `docs/runbooks/codex-review.md`
   and not restated here. `In-Review` marks the START of review: this
   list is complete only when review is.
