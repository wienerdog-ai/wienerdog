---
date: 2026-07-19
title: Codex round-4 A9/A10 spec review
related_wps: [WP-a9-incident-runbook, WP-a9-private-modes-repair, WP-a10-escape-harness]
---

# Codex round-4 A9/A10 spec review (2026-07-19)

**Fourth Codex confirmation pass over the A9/A10 set (three per-spec jobs,
substantive-only focus). Codex CONFIRMED the round-1/2/3 fixes are REAL — the
earlier dispositions landed as genuine spec changes, not rewording — and returned
only 4 new substantive findings, all owner-ACCEPTed 2026-07-19. Every cited code
fact re-verified against the current working tree before disposition:
`run-job.js` opens the log stream at `:552`, **before** the `try` block that starts
at `:560`, so a throw from the private log-open escapes the `catch (err){failure=err}`
(`:605`) and never reaches the error-watermark + `failLoud` branch (`:664–672`) — in
catch-up it is swallowed by `catchUp`'s `catch` (`~:710`) under a now-false "runJob
already failed loud" comment; the escape-harness live-proof (`~:119–124`) and
acceptance listed only `reapTree(child.pid)` + `reapGroup(brain.pgid)`, OMITTING the
`reapGroup(child.pid)` that R3-E added to the mechanism WP; the runbook's optional
live-check used `pgrep -fl` name-match + one-level `pgrep -P` (POSIX) / a
name-substring `Get-Process` (Windows), which a differently-named injected helper
survives; `schedule.js` `add()` gates `--skill` behind `requireCapability(
EXTERNAL_CONTENT_ROUTINE, profile)` (`:439–442`) and production never passes the
`profile` seam (`:415`), so `schedule add … --skill` always fails closed.** Specs
stayed `Draft`, so revisions landed as edits. ADR-0030 unchanged this round (no new
residual). No re-split: all three WPs kept their sizes (S / M / M).

## WP-a9-private-modes-repair (code, 1)

- **R4-A (ACCEPT, MEDIUM) — the round-2 "fail-loud path, no new handling" claim was
  contradicted by the actual code.** `createLogStreamPrivate`'s throw was said to
  surface through run-job's existing fail-loud path, but the log-open sits at
  `run-job.js:552` OUTSIDE/BEFORE the `try` (`:560`): a private-open/`fchmod` failure
  escapes uncaught, so a normal run writes **no** error watermark and fires **no**
  alert, and catch-up's `catch` (`~:710`) swallows it under a false "already failed
  loud" comment. Fixed: the spec now REQUIRES run-job move the `mkdirPrivate` +
  `createLogStreamPrivate` open INSIDE the existing `try` (declare `let logStream =
  null;` before it; guard the `finally` close with `if (logStream)`) so the throw
  hits the `writeScheduleState('error')` + `failLoud` + throw branch — no NEW
  alerting plumbing, just the try-boundary move. Permitted that structural edit
  explicitly in the run-job Deliverables row; corrected the round-2 rationale note
  and the out-of-scope note that carried the false framing; updated the A10
  shared-surface coordination note (run-job is no longer a pure two-line swap).
  Added the two required wiring tests: force a log-open failure through the **real**
  `runJob` **and** `catchUp` paths (real FS condition, no new run-job seam) and
  assert the persisted `last_status:'error'` watermark AND the injected `sendAlert`
  fire — not just the helper's isolated unit test. `rotateLogs` (returns on a
  missing/!dir logDir) and the `try`-wrapped skill-evidence block already tolerate
  the failure path. Kept the WP at M.

## WP-a10-escape-harness (tests, 1)

- **R4-B (ACCEPT, HIGH) — R3-E was applied to the mechanism WP but not propagated to
  the harness (the merge-gate proof).** The live-proof (`~:119–124`) and acceptance
  still described the abnormal-close settle as `reapTree(child.pid)` for group A +
  `reapGroup(brain.pgid)` for group B, OMITTING `reapGroup(child.pid)` — so the gate
  tested the old two-call sequence, under which a leaderless reparented group-A
  member (its PGID still `child.pid`, but no ppid ancestry once the middle exited)
  survives, making the gate hollow. Fixed: added `reapGroup(child.pid)` to BOTH the
  live-settle-path sequence and the acceptance criterion (three reap operations —
  `reapTree(child.pid)` + `reapGroup(child.pid)` for group A, `reapGroup(brain.pgid)`
  for group B); required the test to drive the REAL post-`'close'` reap path, assert
  BOTH group-A reap ops occur, and assert the leaderless group-A member reaches
  `ESRCH` before fixture cleanup (with an explicit "omitting `reapGroup(child.pid)`
  must fail this test" clause). Also fixed the harness's Current-state description of
  run-job's reap to the three-call sequence, so the two a10 specs are now mutually
  consistent. Kept the WP at M.

## WP-a9-incident-runbook (docs, 2)

- **R4-C (ACCEPT, HIGH) — the optional live-process quiescence check gives a
  false-clean.** It used `pgrep -fl` name-match + one-level `pgrep -P` (POSIX) and a
  name-substring `Get-Process` filter (Windows), so a prompt-injected run's
  differently-named spawned helper (a `git`, a shell, an arbitrary binary) survives
  the parent's stop and both grep passes still call the machine clean — after which
  the runbook starts credential rotation while a stale-privilege child can still
  write/commit. Owner decision (consistent with the round-2 reboot-canonical choice):
  REMOVED the optional live-check as a quiescence PROOF. **Reboot is now the sole
  authoritative proof.** Kept a NON-authoritative pre-reboot hint that explicitly
  states it is NOT proof (a clean grep proves nothing; it can only *reveal* a live
  job), and the "cannot reboot" branch now **stops and escalates** rather than
  grep-certifying clean. No shipped recursive process-tree reaper introduced (that is
  A10's mechanism work, out of scope here). Updated the Deliverables note, step 1,
  and the acceptance criterion to match.
- **R4-D (ACCEPT, MEDIUM) — step 7 promised a `schedule add … --skill …` that always
  fails.** `schedule.js` `add()` enforces the A0 pre-use freeze: `--skill` is frozen
  in production with no flag/env override (`requireCapability`, no `profile` seam),
  so re-adding a legacy install's `skill:*` job as promised is always rejected.
  Fixed: state that ONLY `builtin:dream` is restorable via `schedule add --job` this
  release; the step-1 `config.yaml` `jobs:` snapshot must still PRESERVE any `skill:*`
  definition (added that clause at the snapshot point), but step 7 no longer promises
  a working `--skill` re-add — it points the user at preserving the definition for
  later, until the external-content-routine capability gate opens (audit A1). Added
  the matching acceptance criterion and verification grep.

## Decision beyond the dispositions

- **None.** All four findings applied exactly as owner-dispositioned. Sizes
  unchanged (incident-runbook S; private-modes-repair M; escape-harness M) — no WP
  crossed its cap. ADR-0030 stays Proposed with no amendment (R4-B is a
  propagation of the already-accepted R3-E fix within the existing non-adversarial
  guarantee, not a new residual). The two a10 specs are now consistent on the
  three-call abnormal-settle sequence.
