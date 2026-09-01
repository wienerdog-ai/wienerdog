---
id: WP-failloud-survives-state-write-failure
title: A failed state write must never suppress a job's durable record, on any path
status: Draft
model: sonnet
size: S
depends_on: []
adrs: [ADR-0004]
epic: issue-168
---

# WP-failloud-survives-state-write-failure: the durable record outlives the state write

## Context (read this, nothing else)

Wienerdog is just files (ADR-0004): scheduled work runs as one-shot jobs, and a
job that fails has exactly one way to tell the user — **fail-loud**. `failLoud`
(`src/cli/run-job.js:611-634`) appends a durable record to `state/alerts.jsonl`
and best-effort emails it. That record is what `wienerdog doctor` reports, what
the injected digest surfaces at the next session start, and — per
`src/cli/run-job.js:1098-1108` — what the reap cleanup keys off. If the record is
not written, a failed job is silently indistinguishable from one that never ran.

`failLoud` is written to be **total**: its whole body sits in a `try` whose
`catch` is empty and commented "Fail-loud is best-effort; never mask the
original failure", and it returns a `persisted` boolean rather than throwing
(`:611-634`). So the record can never be lost by `failLoud` itself failing.

It can be lost by `failLoud` never being **reached**. `runJob` writes state to
`state/schedule.json` immediately before (failure paths) or instead of (success
path) reporting. Those state writes can throw, they are not guarded, and the
throw escapes `runJob` — so nothing durable records what happened. This WP fixes
that coupling at all five call sites. It changes no mode, no file format and no
alert content; it makes the durable record independent of whether state
persisted.

On the failure paths this is a **pre-existing defect**, measured on HEAD below.
On the success path it is a defect that `WP-private-state-writers-mode-pin`
would otherwise introduce: that WP moves the state writers onto
`writeFilePrivate`, which **refuses** anomalies the current writers silently
wrote through. This WP is that WP's `depends_on` and must land first, so no
refusal it adds can land on an unguarded site.

## Current state

Measured on HEAD `a6e0803`.

**The five sites.** `runJob` spans `src/cli/run-job.js:743-1113`.

| Site | Shape | Reports |
|------|-------|---------|
| `:797-799` | watermark → `failLoud` → throw | vault under a macOS protected folder (TCC refusal) |
| `:872-874` | watermark → `failLoud` → throw | pre-routine containment self-check did not pass |
| `:1096-1097` | watermark → `failLoud` → throw | the general failure/timeout/reap backstop |
| `:1060` | success watermark (`last_success`, `last_status:'ok'`) | nothing — no `failLoud` on this path |
| `:1061` | `clearAlerts(paths, name)` | nothing — no `failLoud` on this path |

**All five are unguarded.** They sit at `runJob`'s top level. `runJob`'s first
`try` opens at `:834` and closes at `:838`; the next opens at `:897` and closes
at `:1006`. Between `:743` and `:797` there is no `try` at all, `:872` falls
between the two, and `:1060-1061` and `:1096` follow the last one. A throw from
any state write propagates straight out of `runJob`.

**The failure-path writes can throw today.** `writeScheduleState`
(`src/scheduler/jobs.js:232-240`) calls `fs.mkdirSync`, `fs.writeFileSync` and
`fs.renameSync`, none guarded. Measured: with `state/` made unwritable — the
same class a full disk (`ENOSPC`), a read-only filesystem (`EROFS`) or a quota
(`EDQUOT`) produces — the call throws:

```text
TODAY's writeScheduleState throws: EACCES - open
```

So on HEAD, a job that fails while the disk is full loses its durable record
entirely: no `alerts.jsonl` record, no doctor warning, no digest line.

**The success path becomes reachable once the mode-pin WP lands.** Measured on a
symlinked leaf `state/schedule.json`:

```text
mechanicsRootUntrusted (dirs only) -> false   <- the entry gate PASSES
TODAY temp+rename over symlink -> dest is symlink? false ; OUTSIDE still "original\n"
writeFilePrivate: REFUSES -> WienerdogError
```

`mechanicsRootUntrusted` (`src/core/private-fs.js:1001-1007`) classifies only
the four **directories** `core`/`state`/`logs`/`secrets`, so a symlinked *leaf*
passes the entry gate. Today `renameSync` silently replaces that symlink and the
job completes; after the mode-pin WP, `writeFilePrivate` refuses and throws at
`:1060` — **after the job's work has already run**.

**Consequence, measured: the successful job is replayed.** `catchUp` decides
overdue at `src/cli/run-job.js:1244-1245`:

```js
const last = state[name] && state[name].last_success;
const overdue = now >= fire && (!last || new Date(last) < fire);
```

`last_success` — read from `schedule.json` — **is the replay guard**. `catchUp`
does not consult `alerts.jsonl` at all. So a refusal at `:1060` means
`last_success` is never recorded and the job is re-run on the next catch-up,
executing its side effects (emails sent, vault notes written, git commits)
again. This is **unbounded, not a single duplicate**: the fault that caused the
refusal (a symlinked `schedule.json`, a read-only `state/`) does not heal
itself, so *every* subsequent catch-up finds the job overdue and runs it again,
indefinitely, until a human repairs it.

The two success-path sites are **not** the same failure, which is why Tables B1
and B2 split them. A refusal at `:1061` happens *after* `:1060` already wrote
`last_success`, so the job is current and there is no replay at all — only the
previous run's alerts remain uncleared.

**What `alertPersisted` drives.** `:1106-1108` releases the reap token pidfiles
only when the alert persisted; when it did not, the pidfile is deliberately
RETAINED as the sole recovery breadcrumb. This WP must not change that.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing, per scripts/boundary-check.js:44-54: this
     spec file itself, package-lock.json, memory/lessons/inbox.md, and
     docs/specs/logbook/. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/cli/run-job.js | (a) the five state-write sites at `:797`, `:872`, `:1096`, `:1060`, `:1061`, per Tables A, B1 and B2; (b) `failLoud` (`:611-634`) gains an **outcome** input — enough to carry a non-default email subject and to skip the durable append per Table C. Its default behavior with no such input must be byte-identical to HEAD. Do NOT change the `appendAlert` call at `:840`, the reap logic at `:1106-1108`, `defaultSendAlert`, or any existing failure-path `reason` string |
| modify | tests/unit/scheduler-runjob.test.js | cover the acceptance criteria below; the implementer designs the cases |

### Exact contracts

No new exported function. `failLoud` gains one optional input (Deliverables row
(b)); called as it is on HEAD it behaves as on HEAD, including the
`` `job ${name} failed` `` subject. `runJob`'s observable behavior is unchanged
whenever the state writes succeed; Tables A, B1, B2 and C define what it must do
when they do not.

## Contract reference

Activation (ADR-0031, 2-of-7): **(iv)** error/fallback ordering and a new
reason-code case; **(v)** the state watermark and the durable alert are two
records with different owners, and this WP fixes which one's failure may
suppress the other; **(vi)** `WP-private-state-writers-mode-pin` inherits this
contract as its dispatch precondition.

### Table A — failure-path sites (`:797`, `:872`, `:1096`)

| Fact / rule | Value |
|-------------|-------|
| Invariant | a throw from the watermark write MUST NOT prevent the `failLoud` call that follows it |
| Precedence | the alert reports the **original job failure** (`reason`), never the watermark's I/O error — the persistence failure must not overwrite, prefix or replace it |
| Attempt counts | exactly one watermark attempt and exactly one `failLoud` attempt per site, whether or not either succeeds — no retry, no second alert |
| What `runJob` still throws | the same `WienerdogError` carrying the original `reason`, as on HEAD |
| Watermark failure visibility | surfaced once on a **non-alert** channel (the run's stderr/log). It must never become a second `alerts.jsonl` record, which would double-report one job failure |
| Both-writes-fail (the principal field case) | when the same condition takes out `schedule.json` **and** `alerts.jsonl` — `ENOSPC`, `EROFS`, `EDQUOT`, an unwritable `state/` — the contract is: one watermark attempt, one `failLoud` attempt, **zero** alert records, `failLoud` returns `false`, the thrown error still carries the original `reason`, and exactly one non-alert persistence diagnostic is emitted |
| `alertPersisted === false` behavior | unchanged from HEAD: the reap token pidfiles at `:1106-1108` are RETAINED, not released |
| Ordering | the alert is still attempted after the watermark attempt; only the failure coupling is broken |

### Table B — success-path sites: two DIFFERENT outcomes, not one

`:1060` and `:1061` fail differently and must never share a reason. At `:1060`
the success marker was not saved, so the job looks un-run and **will be
replayed**. At `:1061` the marker *was* saved — only the previous run's alert
cleanup failed, so there is **no replay consequence**. A record that told the
operator otherwise would send them after the wrong problem.

Rules common to both, then the per-site split:

| Fact / rule | Value |
|-------------|-------|
| Trigger | the call throwing — including `writeFilePrivate`'s refusals once `WP-private-state-writers-mode-pin` lands (symlinked/non-regular destination, symlinked in-core ancestor, post-rename inode mismatch) |
| Attempt, not record | exactly **one** `failLoud` attempt for the run — never "exactly one durable record". `failLoud` is best-effort by construction (`:630-632`), so under a shared-storage fault the record is impossible and **zero records is a permitted, contracted outcome**. A `:1060` failure must not additionally produce an attempt from `:1061` |
| Both-writes-fail | when one condition takes out `schedule.json` **and** `alerts.jsonl` (`ENOSPC`, `EROFS`, `EDQUOT`, unwritable `state/`): one state-write attempt, one `failLoud` attempt, **zero** alert records permitted, `failLoud` returns `false`, exactly one non-alert persistence diagnostic, and the distinct thrown reason preserved — the same shape Table A contracts for the failure sites |
| Outcome | `runJob` reports the run as not-clean (throws `WienerdogError` carrying the site's distinct reason) rather than returning success: state the next run depends on is not on disk, and a silent "ok" would hide that. The distinction the operator needs lives in the reason text |
| Notification wording | the email must match the record. `failLoud`'s fixed subject `` `job ${name} failed` `` (`:623`) is **false** for both of these — the work completed. Both channels (durable reason and email subject + body) must say the work completed and which state operation was refused |
| When both succeed | behavior byte-identical to HEAD: watermark written, alerts cleared, `runJob` returns normally |

**B1 — `:1060`, the success watermark.**

| Fact / rule | Value |
|-------------|-------|
| What happened | the job's work completed; the **success marker was not saved** |
| Reason must say | work completed, `last_success` could not be recorded, and — because that is the replay guard — the job will be re-run |
| Operator guidance (required in the text) | repair or remove `state/schedule.json`, or disable the job, to stop the repetition |
| Replay consequence (**named residual, not closed here**) | `last_success` is the replay guard (`:1244-1245`, measured). It did not persist, so `catchUp` treats the job as overdue. This is **UNBOUNDED, not a one-time duplicate**: while the fault persists (a symlinked `schedule.json`, a read-only `state/`) *every* catch-up re-runs the job, repeating its side effects — emails sent, vault notes written, git commits — indefinitely until the fault is repaired. This WP makes the loop **diagnosable and actionable**; it does not bound it. Prevention is routed to the marker WP under Out of scope |

**B2 — `:1061`, `clearAlerts`.**

| Fact / rule | Value |
|-------------|-------|
| What happened | the job's work completed **and** the success marker was saved; only the previous run's alert cleanup failed |
| Reason must say | work completed and recorded, stale alerts could not be cleared |
| Reason must NOT say | anything about replay — there is none. `last_success` was written, so `catchUp` sees the job as current |
| Consequence | the previous run's alerts remain visible, which is fail-safe (a stale alert is visible; a missing one is not) |
| **The refused artifact must not be the reporting channel** | when `clearAlerts` refused, the artifact it refused **is** `alerts.jsonl`, and the durable append MUST NOT be attempted through it — see Table C |

### Table C — the recovery path must not write through the artifact it refused

The `:1061` refusal case has a hazard the other four sites do not: the reporting
channel *is* the refused file. Routing that refusal through `failLoud` →
`appendAlert` writes the alert out of the mechanics root. Measured on HEAD with
`state/alerts.jsonl` a symlink to an outside file:

```text
alerts.jsonl is a symlink -> true
1) does appendFileSync FOLLOW the symlink?
   OUTSIDE now contains appended line -> true
   dest still a symlink -> true
2) does chmodSync FOLLOW it? (chmodAlerts:15)
   OUTSIDE mode is now -> 0600 (0600 = the chmod landed OUTSIDE the core)
3) can clearAlerts REACH the writeFilePrivate refusal on this shape?
   readAlerts through the link sees 2 record(s) -> non-empty remaining -> rewrite branch
```

So the sequence is reachable and harmful: a leaf symlink passes
`mechanicsRootUntrusted` (directories only), `readAlerts` follows it and returns
records, `clearAlerts` reaches its rewrite branch and — after the mode-pin WP —
refuses; the refusal handler then appends the job's failure reason and log hint
into an attacker-chosen file and chmods it `0600`.

| Fact / rule | Value |
|-------------|-------|
| Rule | a refusal whose refused artifact is `alerts.jsonl` MUST NOT attempt the durable append. The recovery path never writes through the artifact it just refused |
| Observable | after a `:1061` refusal on a symlinked `alerts.jsonl`: the symlink's target is **byte-identical** and its mode **unchanged**; `state/alerts.jsonl` is still a symlink; no alert record is created anywhere |
| Still required | the non-alert persistence diagnostic **and** the best-effort email. `defaultSendAlert` (`:576-584`) spawns `wienerdog gws _alert` and never touches `alerts.jsonl` (verified), so email remains a valid fallback channel when the durable one is unsafe |
| Record count | zero durable records for this case — consistent with Table B's attempt-not-record rule, not an exception to it |
| Smallest shape (implementer's choice, both acceptable) | (i) pass the already-known refusal fact into `failLoud` so it skips the append and does the diagnostic + email only — no new predicate, no TOCTOU window; or (ii) have the refusal handler apply the same `lstat`-based predicate `writeFilePrivate` uses (`dest` exists and is not a regular file → do not append). Shape (i) is preferred: the caller already caught the throw and therefore already knows |
| Not in scope here | the `appendAlert` **create** window on an absent `alerts.jsonl` — that still needs an `appendFilePrivate` and stays a residual of the mode-pin WP. This rule covers the present-destination refusal case only |

### Mirrored Surface Checklist

- [ ] Deliverables-table cells (the `run-job.js` row cites Tables A, B1, B2 and
      the `failLoud` outcome input that Tables B and C both rely on)
- [ ] Acceptance criteria that assert both tables, including the both-fail row
      and the success-path single-record rule
- [ ] Verification steps
- [ ] Current-state: the five sites, their unguarded position, the measured
      throw, the measured symlink-leaf reachability, and the measured
      `catchUp` replay guard
- [ ] The replay residual, stated as **unbounded until repaired** — it appears
      in Current state, Table B1, the Security checklist and Out of scope, and
      the four move together
- [ ] The **attempt-not-record** wording — Table B, Table C's record-count row,
      and the acceptance criteria must never promise a guaranteed durable record
      on any of the five sites
- [ ] The **reason taxonomy** — B1 (marker not saved, replay) and B2 (marker
      saved, no replay) are distinct on every surface: tables, acceptance
      criteria, and the email subject/body rule
- [ ] `WP-private-state-writers-mode-pin`'s Context, `depends_on`, Table B
      added-refusals row and Definition-of-done precondition (a) — this WP is
      its stated precondition and now covers five sites, not three

## Implementation notes & constraints

- Zero new dependencies; plain Node ≥ 18; JSDoc types; no build step (CLAUDE.md).
- The change is local to five call sites. Do not introduce a wrapper helper, do
  not re-order the paths, and do not touch the reap/token logic at `:1106-1108`.
- Do not make the state writers themselves non-throwing in
  `src/scheduler/jobs.js` or `src/core/alerts.js`: other callers rely on their
  errors, and `WP-private-state-writers-mode-pin` changes both for an unrelated
  reason. The fix belongs at the call sites.
- Swallowing a state-write error **silently** is not acceptable (Table A
  visibility row). A job whose state did not persist and whose operator was
  never told is the same class of defect this WP fixes.
- The success-path reason is new user-facing text: plain language for knowledge
  workers, per CLAUDE.md — say that the routine finished, that its record could
  not be saved, and what the user should check.
- When uncertain: choose the simpler option and record it under "Decisions made"
  in the PR body. Do NOT expand scope to resolve ambiguity.

## Security checklist

- [ ] The template's untrusted-identifier item is **N/A — no untrusted
      identifier reaches a filesystem path or a shell command here.** This WP
      adds no path construction and no command; it re-sequences existing calls
      and adds one reason string.
- [ ] The surface this WP touches is **the integrity of the failure-reporting
      channel.** Today an attacker or an accident that makes one small write
      fail (fill the disk, remount read-only) suppresses the durable record of
      every failing job while the jobs go on failing. A planted symlink at
      `state/schedule.json` is not caught by `mechanicsRootUntrusted` (measured,
      directories only), so after the mode-pin WP it would silently convert a
      successful run into an unreported one. After this WP, neither can suppress
      the record.
- [ ] Residual, named: `failLoud` remains best-effort by design (`:630-632`) —
      if `alerts.jsonl` itself cannot be written the record is still lost, which
      is exactly Table A's both-fail row; `alertPersisted` is how the caller
      already accounts for it. This WP guarantees the attempt, not the write.
- [ ] Residual, named: the replay consequence in Table B1. A job whose success
      watermark is refused re-runs on **every** catch-up until the fault is
      repaired — unbounded repetition of its side effects, not one duplicate.
      This WP makes it diagnosable and tells the operator how to stop it;
      closing it is routed under Out of scope.
- [ ] Measured exfiltration closed (Table C): before this WP, routing a
      `:1061` refusal through `failLoud` would append the job's reason and log
      hint into an attacker-chosen file outside the mechanics root and chmod it
      `0600` — both `appendFileSync` and `chmodSync` follow a symlinked
      `alerts.jsonl`, and a leaf symlink passes `mechanicsRootUntrusted`. The
      recovery path may never write through the artifact it refused.

## Acceptance criteria

- [ ] With the watermark write forced to throw at each of `:797`, `:872`,
      `:1096`, the durable alert for the original failure is still appended, its
      `reason` is the original job-failure reason, and no second alert record is
      created (Table A).
- [ ] In the same three cases `runJob` still rejects with a `WienerdogError`
      carrying the original reason, and the watermark failure is surfaced once
      on a non-alert channel.
- [ ] **Both-writes-fail:** with a single condition making both `schedule.json`
      and `alerts.jsonl` unwritable, each of the three failure sites performs
      exactly one watermark attempt and exactly one `failLoud` attempt, produces
      zero alert records, still rejects with the original reason, emits exactly
      one non-alert persistence diagnostic, and leaves the reap token pidfiles
      RETAINED (`alertPersisted === false`, `:1106-1108`).
- [ ] With the success watermark at `:1060` forced to throw after a job whose
      work succeeded, there is exactly one `failLoud` attempt; its reason states
      the work completed, that `last_success` could not be recorded, that the
      job will be re-run until the fault is repaired, and what the operator
      should do (Table B1) — and `runJob` reports the run as not-clean.
- [ ] With `clearAlerts` at `:1061` throwing instead, the reason states the work
      completed **and was recorded** and only stale-alert cleanup failed, and it
      makes **no** replay claim (Table B2). A `:1060` failure does not
      additionally produce an attempt from `:1061`.
- [ ] **Success-path both-writes-fail:** with one condition making both
      `schedule.json` and `alerts.jsonl` unwritable, each success site performs
      one state-write attempt and one `failLoud` attempt, produces **zero** alert
      records, emits exactly one non-alert persistence diagnostic, and still
      throws its distinct reason (Table B attempt-not-record row).
- [ ] **Table C:** after a `:1061` refusal on a symlinked `alerts.jsonl`, the
      symlink's target is byte-identical and its mode unchanged, `alerts.jsonl`
      is still a symlink, no alert record exists anywhere, and the non-alert
      diagnostic and the best-effort email still happen.
- [ ] For both success-path outcomes the **email** subject and body say the work
      completed and name the refused state operation — neither sends
      `` `job <name> failed` ``.
- [ ] `failLoud` called without the new outcome input behaves exactly as on
      HEAD, subject included, on all three failure paths.
- [ ] When every state write succeeds, behavior is byte-identical to HEAD on all
      five sites: same watermark, same alert-clearing, same throw or same
      normal return.
- [ ] Idempotence: `N/A — this WP ships no command and writes no new file; it
      re-sequences existing calls and adds one reason string.`
- [ ] `npm test` and `npm run lint` pass.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern "run-job|runjob"
npm test
npm run lint
```

Plus the **pre-existing-defect reproduction**, which must go from RED on HEAD to
GREEN on the branch. It exercises both mechanisms this WP contains: the
failure-path watermark throw, and the success-path refusal that
`WP-private-state-writers-mode-pin` will make reachable.

```bash
cat > /tmp/wd-alert-survives.js <<'LITERAL'
// Demonstrates the two defects this WP fixes.
// (1) With state/ unwritable, TODAY's writeScheduleState throws; at
//     run-job.js:797/:872/:1096 that throw escapes runJob before failLoud runs.
// (2) A symlinked leaf state/schedule.json passes mechanicsRootUntrusted
//     (directories only), so once the mode-pin WP lands writeFilePrivate
//     refuses at :1060 — after the job's work already ran — and last_success,
//     the replay guard at :1244-1245, is never recorded.
// Exits non-zero while either defect stands.
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const R = process.cwd();
const { getPaths } = require(R + '/src/core/paths');
const { mechanicsRootUntrusted, writeFilePrivate } = require(R + '/src/core/private-fs');
const mk = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-alert-'));
  const paths = getPaths({ HOME: root, WIENERDOG_HOME: path.join(root, 'wd') });
  for (const d of [paths.state, paths.logs, paths.secrets]) fs.mkdirSync(d, { recursive: true, mode: 0o700 });
  return { root, paths };
};
const bad = [];
{ // (1) failure-path watermark throw
  const { paths } = mk();
  fs.chmodSync(paths.state, 0o500); // unwritable: the ENOSPC/EROFS/EDQUOT class
  let code = null;
  try { require(R + '/src/scheduler/jobs').writeScheduleState(paths, 'dream', { last_status: 'error' }); }
  catch (e) { code = e.code; }
  fs.chmodSync(paths.state, 0o700);
  if (!code) bad.push('watermark write did not throw; probe (1) no longer reproduces');
  else console.log(`(1) watermark write throws ${code} -> at :797/:872/:1096 this escapes runJob before failLoud`);
}
{ // (2) success-path refusal reachability
  const { root, paths } = mk();
  const outside = path.join(root, 'OUTSIDE'); fs.writeFileSync(outside, 'original\n');
  fs.symlinkSync(outside, path.join(paths.state, 'schedule.json'));
  const gate = mechanicsRootUntrusted(paths);
  if (gate !== false) bad.push('mechanicsRootUntrusted now catches a symlinked leaf; probe (2) no longer reproduces');
  let refused = false;
  try { writeFilePrivate(path.join(paths.state, 'schedule.json'), '{}\n', { core: paths.core }); }
  catch { refused = true; }
  if (!refused) bad.push('writeFilePrivate did not refuse the symlinked leaf');
  else console.log(`(2) entry gate passes (mechanicsRootUntrusted=${gate}) and writeFilePrivate REFUSES -> :1060 throws after the work ran`);
}
if (bad.length) { console.error('PROBE STALE:\n  ' + bad.join('\n  ')); process.exit(2); }
console.log('Both mechanisms reproduce on this tree.');
process.exit(1); // RED until the call sites guard them
LITERAL
node /tmp/wd-alert-survives.js
```

- The probe establishes the **mechanisms** and is red by construction on HEAD
  (exit 1; exit 2 means the probe itself no longer reproduces and must be
  re-derived before it is trusted). The real acceptance evidence is the test
  file: it must drive `runJob` itself, forcing each state write to fail at each
  of the five sites, and assert the contracted outcome. Paste the probe's HEAD
  output, the new tests' green run, and a red run from deliberately reverting
  one guard — a guard that is never exercised is a guard nobody has tested.

## Out of scope (do NOT do these)

- The mode of `state/schedule.json`, or any change to `writeScheduleState`'s or
  `clearAlerts`' body — that is `WP-private-state-writers-mode-pin`, which
  depends on this WP.
- **Preventing the catch-up replay** in Table B1's residual row. Bounding or
  stopping the unbounded re-run needs a durable marker `catchUp` consults, or a
  change to how `last_success` is derived — a new persistence mechanism and a
  separate WP. This WP only makes the loop visible and tells the operator how to
  stop it by hand. Note the follow-up under "Discovered issues".
- **The `appendAlert` create window** on an absent `alerts.jsonl` — Table C
  covers the present-destination refusal only; the create window needs an
  `appendFilePrivate` and stays a residual of `WP-private-state-writers-mode-pin`.
- Making `failLoud` throw, retry, or report persistence failures differently.
- The `appendAlert` call at `:840` and the reap/token release at `:1106-1108`.
- Any other unguarded write in `runJob` that is not one of the five sites in
  Tables A and B — note them under "Discovered issues".
- Cross-process locking or durability guarantees for `alerts.jsonl` (ADR-0004
  keeps that out; `failLoud` is best-effort by design).

## Definition of done

1. All verification steps pass locally; output pasted into the PR body,
   including the HEAD-red / branch-green pair.
2. Conventional commits; PR titled
   `fix(run-job): keep the durable record when a state write fails (WP-failloud-survives-state-write-failure)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
5. Both PR review gates have run on the diff and are clean or fully
   dispositioned — they are defined in `docs/runbooks/codex-review.md`
   and not restated here. `In-Review` marks the START of review: this
   list is complete only when review is.
