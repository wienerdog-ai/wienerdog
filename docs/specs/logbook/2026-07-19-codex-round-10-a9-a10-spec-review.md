---
date: 2026-07-19
title: Codex round-10 A9/A10 spec review
related_wps: [WP-a9-incident-runbook, WP-a9-private-modes-repair, WP-a10-reap-mechanism, WP-a10-escape-harness]
---

# Codex round-10 A9/A10 spec review (2026-07-19)

**Tenth Codex confirmation pass over the A9/A10 set. The two A9 specs are DONE this
round and were flipped to `Ready` separately — `WP-a9-incident-runbook` (APPROVE)
and `WP-a9-private-modes-repair` (APPROVED) — and were NOT touched here. Two
owner-ACCEPTed findings remained on the A10 pair (`WP-a10-reap-mechanism`,
`WP-a10-escape-harness`); both cited facts were re-verified against the current
working tree before disposition.** The A10 specs stayed `Draft` (they still need a
final confirm), so revisions landed as edits. ADR-0030 stayed **Proposed** and took
only the R10-2 alignment. No WP crossed its size cap (reap-mechanism M;
escape-harness M).

## WP-a9-incident-runbook (docs) + WP-a9-private-modes-repair (code)

- **DONE this round — flipped to `Ready` separately, NOT touched here.** Left exactly
  as-is.

## WP-a10-reap-mechanism (mechanism) + WP-a10-escape-harness (tests)

- **R10-1 (ACCEPT, HIGH) — the fallible hand-up pidfile write had no cleanup guard,
  so a write failure left the detached brain unsupervised.** The `dream.js` contract
  spawns the brain and THEN writes the per-token hand-up pidfile via the **fallible**
  `writeFilePrivate` (temp+rename, `0600`). On a disk-full / permission / rename
  failure the write throws AFTER the brain is already spawned: the middle can exit
  with an error **without** a pidfile on disk, and `run-job`'s outer backstop reaps
  group B **only** when the per-token pidfile is present — so the detached group-B
  brain survives the job, unsupervised and unreaped. This is **distinct** from the
  already-accepted sub-ms "middle dies in the spawn→write window" residual (a timing
  gap where the write never runs): here the **write itself fails** while the child
  lives — a durable, non-adversarial I/O path. The mandatory escape harness did not
  exercise it (its cases all assume a pidfile PRESENT). Contract-level.

  Owner ACCEPT: the entire post-spawn hand-up runs under a **cleanup guard** — if the
  `writeFilePrivate` hand-up write throws, `dream.js` **immediately** runs the checked
  `reapGroup(child.pid)` on the just-spawned brain group to VERIFIED quiescence, then
  **fails the run** (throw `WienerdogError` → run-job's durable fail-loud alert +
  error watermark + non-zero outcome) and does NOT proceed into the brain race as if
  supervised. The spec makes explicit this is separate from the sub-ms residual.
  Applied to `WP-a10-reap-mechanism`: a new "Write-failure guard on the hand-up
  (R10-1)" contract paragraph in the `dream.js` wiring prose; the `dream.js`
  Deliverables cell gains the guard + an injected `writeFilePrivate` seam (test-only);
  the `dream.test.js` Deliverables cell gains a seam-injected-throw assertion (reap
  seam invoked on `child.pid`, `WienerdogError` thrown); a new R10-1 acceptance
  criterion; and two verification greps. Applied to `WP-a10-escape-harness`: a new
  required-green POSIX-gate live proof #7 — a seam-injected `writeFilePrivate` throw
  while a REAL re-detached brain child lives drives the real `dream.js`
  `runBrainWithWatchdog` guard to `reapGroup(child.pid)` the brain to `ESRCH` and fail
  the run (non-vacuity: no-guard leaves the real brain alive); the re-detached brain
  fixture mode is reused (no new fixture); plus the Deliverables note, an acceptance
  criterion, and a verification grep. Both WPs stay M.

- **R10-2 (ACCEPT, MEDIUM) — the settle-path reap matrix was described
  inconsistently across FOUR locations; the same contract-dense-scattered-prose
  failure just fixed in the A9 runbook, now in A10's settle matrix.** The four drifted
  copies: reap-mechanism's abnormal-settle bullet said error/non-clean-close runs
  `reapTree(child.pid)` + `reapGroup(child.pid)`; a later reap-mechanism bullet said
  `reapTree` is timeout-ONLY; the escape harness required all three post-close ops
  (incl. `reapTree`); ADR-0030 named only group-A `reapTree` + group-B `reapGroup`,
  omitting the group-A `reapGroup` backstop that actually reaches a leaderless
  survivor. No single implementable/testable matrix existed — the accretion of
  R3-E/R6-2/R8-1/R9-1 drifted the scattered prose out of sync.

  Owner ACCEPT with the contract-extraction move (same as the runbook): the
  settle-path matrix is now ONE authoritative TABLE in `WP-a10-reap-mechanism` (rows =
  timeout / `'error'` / abnormal `'close'` / clean `'close'`; columns =
  `reapTree(child.pid)`? / checked `reapGroup(child.pid)` group-A / checked
  `reapGroup(brain.pgid)` group-B), filled with the UNIFIED rule: **timeout** =
  `reapTree(A)` + `reapGroup(A)` + `reapGroup(B)`; **error, abnormal close, and clean
  close** = `reapGroup(A)` + `reapGroup(B)` ONLY, no `reapTree` (the middle has
  exited, so its ppid-closure is empty — `reapTree` is a pointless no-op on those
  rows). Every `reapGroup` uses the checked `{ reaped }` contract; `{ reaped: false }`
  → the uniform R8-1 bounded escalation + fail-loud. POSIX-only (R5-2). Then: (a)
  reap-mechanism's abnormal-settle and clean-close prose bullets, plus the run-job
  Deliverables cell (c), now CITE the table (the drift phrase "reapTree on the
  timeout/abnormal path" is corrected to timeout-ONLY); (b) the escape harness
  Current-state bullet, live proof #1, and the Middle-death acceptance criterion
  REFERENCE the table and DROP the required post-`'close'` `reapTree` assertion (a
  no-op post-close, no longer a required op — the abnormal-close reap is now the two
  group reaps `reapGroup(child.pid)` + `reapGroup(brain.pgid)`); (c) ADR-0030's
  "Findable classes: closed" bullet now names the group-A `reapGroup(child.pid)`
  backstop and cites the WP's settle-path matrix rather than restating a divergent
  subset.

  **Every table cell was verified against the actual code before being written** —
  `run-job.js` settle wiring (`done` resolves on `'close'` with any code; `'error'`
  rejects; the timeout watchdog fires while the middle is still alive) and
  `dream.js`. On the timeout row the middle/group-A leader is alive so its ppid-closure
  is non-empty (`reapTree` useful); on `'error'` (spawn failure in run-job's usage) and
  on any `'close'` the leader has already exited so its ppid-closure is empty
  (`reapTree` a no-op). **No cell was inconsistent with the code or the unified rule,
  so nothing needed a STOP-and-report** — the change is a re-presentation of the
  already-intended behavior into a consistent table, plus removal of the pointless
  post-close `reapTree` op (behavior-neutral: a no-op call removed). ADR-0030 stays
  Proposed.

## Decision beyond the dispositions

- **None.** Both findings were applied exactly as owner-dispositioned. R10-1 reuses
  the already-specified `reapGroup(child.pid)` primitive + the existing fail-loud path
  (no new file/authority/seam beyond a test-only injectable `writeFilePrivate`).
  R10-2 is a contract-extraction into a single table the two sibling docs reference
  (the same move applied to the A9 runbook), with every cell code-verified and no
  behavior change beyond dropping a no-op post-close `reapTree`. Sizing re-checked:
  `WP-a10-reap-mechanism` stays **M** (one guarded branch at an existing spawn site +
  a re-presented matrix), `WP-a10-escape-harness` stays **M** (one added live proof,
  no new fixture). The two A9 specs went `Ready` this round and were untouched.
