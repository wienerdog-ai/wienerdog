---
date: 2026-07-19
title: Codex round-9 A9/A10 spec review
related_wps: [WP-a9-incident-runbook, WP-a9-private-modes-repair, WP-a10-reap-mechanism, WP-a10-escape-harness]
---

# Codex round-9 A9/A10 spec review (2026-07-19)

**Ninth Codex confirmation pass over the A9/A10 set. `WP-a9-incident-runbook`
reached APPROVE/SHIPPABLE this round and `WP-a9-private-modes-repair` remains
APPROVED (round 5) — both were left untouched. One substantive finding remained on
the A10 pair, owner-ACCEPTed 2026-07-19. The cited code fact was re-verified against
the current working tree before disposition: `src/cli/run-job.js:589–592` resolves
the completion promise on the child `'close'` event (`resolve(c)`) with no group-A
reap on a clean exit, and the pre-revision `WP-a10-reap-mechanism` spec explicitly
told run-job NOT to reap group A after a clean `'close'` (exit 0) — leaving the
clean-`close(0)`-with-surviving-group-A-child path unexercised on the settle-path
matrix.** Specs stayed `Draft`, so revisions landed as edits. ADR-0030 stayed
**Proposed** and was left unchanged (no actual inconsistency — see below). No WP
crossed its size cap (reap-mechanism M; escape-harness M).

## WP-a9-incident-runbook (docs)

- **APPROVE / SHIPPABLE this round — NOT re-reviewed for changes.** Left exactly
  as-is.

## WP-a9-private-modes-repair (code)

- **APPROVED in round 5 — NOT re-reviewed this round.** Left exactly as-is.

## WP-a10-reap-mechanism (mechanism) + WP-a10-escape-harness (tests)

- **R9-1 (ACCEPT, HIGH) — the CLEAN-exit settle path skipped the group-A reap, so
  a non-adversarial surviving group-A child could outlive the job under a false
  `code === 0` success.** After R4-B/R8-1, run-job's *abnormal* settle reaps group A
  via `reapTree(child.pid)` + `reapGroup(child.pid)`, but the *clean* `'close'`
  (exit 0) path assumed "nothing to do" and skipped the group-A reap entirely (the
  pre-revision spec bullet literally said "Do **not** `reapTree(child.pid)` after a
  clean `'close'`"). On POSIX the middle (`dream.js`) can exit 0 while a plain
  group-A child that did NOT inherit the stdout/stderr pipe keeps running: the
  process group persists after the leader exits and the survivor reparents to `init`
  still carrying `child.pid` as its PGID, reapable only by the negative-PGID
  `kill(-child.pid)`. run-job watermarks `code === 0` as success and clears the
  alert, so that survivor is left behind under a FALSE success — an ADR-0004
  "nothing outlives the job" violation. The mandatory escape harness did NOT catch
  it: its leaderless-group-A case induced an ABNORMAL settle via SIGKILL and the
  escape matrix calls `reapTree` directly, so the clean-`close(0)`-with-surviving-
  group-A-child path was untested. This was the last uncovered settle path —
  contract-level, POSIX, fully non-adversarial, inside the guaranteed boundary.

  Owner ACCEPT with the proportionate, uniform resolution: on **every** settle path,
  including a clean `'close'`, run-job runs the **checked** `reapGroup(child.pid)`
  group-A reap (the negative-PGID `kill(-child.pid)` that reaches a leaderless
  reparented member). `reapGroup` is idempotent — a no-op returning `{ reaped: true }`
  on an already-empty group — so the normal clean case costs nothing. On
  `{ reaped: false }` the SAME bounded final escalation + fail-loud rule already
  defined for the abnormal path (R8-1) applies uniformly — run-job never certifies a
  job clean while a findable group-A member is live. Crucially, this uses
  `reapGroup(child.pid)` (negative-PGID group kill), **not** `reapTree(child.pid)`
  (ppid-closure tree kill): `reapTree` is pointless after a clean leader exit (its
  closure finds nothing once the leader is gone), so it stays on the timeout path
  only. This completes the settle-path matrix: timeout, `'error'`, non-clean
  `'close'`, AND clean `'close'` all now reap group A (and, for `builtin:dream`,
  group B) to VERIFIED quiescence.

  Applied to `WP-a10-reap-mechanism`: rewrote the clean-`'close'` Exact-contract
  prose bullet (was "do not reapTree / nothing to do"; now the checked
  `reapGroup(child.pid)` + uniform `{ reaped: false }` escalation, `reapTree`
  explicitly excluded and confined to the timeout path); updated the run-job
  Deliverables row (c) to spell out clean-close `reapGroup(child.pid)`-only; a
  one-word consistency touch on the R8-1 escalation bullet ("abnormal-settle" →
  "settle-path", group A on every path); the `scheduler-runjob.test.js` Deliverables
  note (assert `reapGroup(child.pid)` invoked and `reapTree(child.pid)` NOT on the
  clean-close path, and an injected `{ reaped: false }` there drives the escalation +
  `failLoud`); a new R9-1 acceptance criterion; and two verification greps. WP stays
  M. Applied to `WP-a10-escape-harness`: added live proof #6 — a required-green POSIX
  gate regression where the middle exits 0 cleanly (NOT SIGKILLed) while a plain
  same-pgid group-A child (spawned `stdio:'ignore'` so it does not hold `'close'`
  open) survives, and the REAL run-job clean-`'close'` settle path reaps it via
  `reapGroup(child.pid)` to `ESRCH`; plus the `reap-escape.test.js` Deliverables
  note, a new `supervised-child.js` clean-exit fixture mode, a Current-state
  sentence, an acceptance criterion, and a verification grep. A skip is not a pass;
  the test must drive the real clean-`close(0)` path, not a SIGKILL-induced abnormal
  settle. WP stays M.

## ADR-0030

- **Left unchanged / Proposed — no actual inconsistency (owner: verify, do not
  touch unless inconsistent).** The "nothing outlives the job" guarantee is stated
  in the "Findable classes: closed" bullet as reaching "every reachable descendant
  to quiescence, whichever watchdog fires **and even when none does**" — already an
  all-settle-paths (including clean-exit, no-watchdog) statement. R9-1 makes that
  guarantee MORE true (group A now reaped on all four settle paths), not less; the
  ADR's illustrative "On an abnormal middle exit the supervisor reaps two distinct
  targets" sentence describes the primary leak path without claiming the clean path
  is uncovered. No wording change was required, so ADR-0030 stays Proposed and
  untouched.

## Decision beyond the dispositions

- **None.** The single finding was applied exactly as owner-dispositioned. R9-1 is a
  correctness completion of the settle-path matrix (the clean-`close(0)` group-A
  reap), reusing the already-specified `reapGroup(child.pid)` primitive and the
  pre-existing R8-1 bounded-escalation + `failLoud` path — no new file, authority, or
  cross-cutting seam. Sizing re-checked: `WP-a10-reap-mechanism` stays **M** (one
  added branch at an existing settle site plus prose), `WP-a10-escape-harness` stays
  **M** (one added live proof + one fixture mode on the existing harness).
  `WP-a9-incident-runbook` (APPROVE this round) and `WP-a9-private-modes-repair`
  (approved round 5) untouched.
