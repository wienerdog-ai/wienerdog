---
date: 2026-07-19
title: Codex round-11 A9/A10 spec review
related_wps: [WP-a10-reap-mechanism, WP-a10-escape-harness, WP-a10-windows-reap]
---

# Codex round-11 A9/A10 spec review (2026-07-19)

**Eleventh Codex confirmation pass. The two A9 specs (`WP-a9-incident-runbook`,
`WP-a9-private-modes-repair`) were already `Ready` and were NOT touched. Three
owner-ACCEPTed findings remained on the A10 set (`WP-a10-reap-mechanism`,
`WP-a10-escape-harness`, `WP-a10-windows-reap`); all three cited facts were
re-verified against the current working tree before disposition.** The A10 WPs
stayed `Draft` and ADR-0030 stayed `Proposed` — the owner does the `Ready`-flip and
the ADR ratification separately after this lands. **This is the FINAL A10 revision
before `Ready`: the R11-1 and R11-3 edge cases became REQUIRED-GREEN POSIX-gate
harness regressions in `WP-a10-escape-harness`, so they cannot silently regress
after the flip.** No WP crossed its size cap (reap-mechanism M; escape-harness M;
windows-reap M).

## WP-a9-incident-runbook + WP-a9-private-modes-repair

- **Already `Ready` — NOT touched this round.** Left exactly as-is.

## The three A10 findings (all verified against code/specs first)

- **R11-1 (ACCEPT, HIGH) — the settle-matrix timeout-row rationale wrongly inferred
  middle-liveness from the timer winning the race.** Verified against
  `run-job.js:589–603`: the completion promise resolves on the child's **`'close'`**
  event, and the watchdog races the timer against that `'close'`, not `'exit'`. A
  descendant that inherited the middle's stdout/stderr pipe holds it open, delaying
  `'close'` past the middle's actual exit — so the timeout can fire while the middle
  has **already** exited and reparented its descendants, making
  `reapTree(child.pid)`'s ppid-closure empty. A non-adversarial group-A descendant
  stays in `pgid child.pid` and is still reached by `reapGroup(child.pid)`; only a
  descendant that re-detached into a **different** pgid (`setsid`) escapes, and that
  is the already-accepted ADR-0030 adversarial residual — not a new blocker.

  Owner ACCEPT: **correct the rationale, keep the ACTIONS unchanged.** `reapTree` on
  the timeout row is a **best-effort extra** (kills descendants while the middle is
  alive; a harmless no-op once it has exited); the guarantee rests on the group reaps
  (`reapGroup(child.pid)` group-A + `reapGroup(brain.pgid)` group-B) **regardless** of
  middle-liveness. Applied to `WP-a10-reap-mechanism`: the settle-matrix timeout-row
  rationale, the unified-rule prose, the Context "two primitives" bullet, the run-job
  Deliverables cell (c), the timeout prose bullet, and the R9-1 verification-grep
  comment ("timeout/abnormal" → "timeout ONLY") all corrected to drop the liveness
  claim and cite the `'close'` race. Applied to `WP-a10-escape-harness`: the
  Current-state bullet softened, **new required-green POSIX-gate live proof #8
  (leader-exited-at-timeout)** — the middle exits before a short timeout while a real
  same-group-A child holds the inherited stdio pipe open, and the real `run-job`
  timeout-path reap reaps the now-leaderless member via `reapGroup(child.pid)`
  (`reapTree` a no-op), with a non-vacuity clause; plus a new fixture mode in
  `supervised-child.js`, a Deliverables note, an acceptance criterion, and a
  verification grep. Applied to ADR-0030: the "Findable classes: closed" bullet's
  timeout-primitive sentence corrected + the different-pgid descendant mapped to the
  combined full-detach residual.

- **R11-2 (ACCEPT, HIGH) — the R10-2 table extraction was INCOMPLETE; stale
  three-reap-on-abnormal claims survived in five mandatory locations that now
  CONTRADICTED the authoritative table.** The R10-2 matrix says `reapTree(child.pid)`
  runs on the **timeout row ONLY**; abnormal `'error'`/`'close'` reap group A via
  `reapGroup(child.pid)` only. But the old "both group-A primitives on the abnormal
  path" statements survived in: (1) the `[Abnormal-close group-A]` acceptance
  criterion ("On timeout / 'error' / non-clean 'close' … both reapTree and reapGroup
  … unit-asserted that both are invoked on the abnormal path"); (2) the Context
  "Abnormal close reaps the FULL group-A tree — via BOTH primitives … the abnormal
  path issues three reaps" bullet; (3) the `scheduler-runjob.test.js` Deliverables
  cell ("on abnormal close … BOTH reapTree and reapGroup … assert both seams are
  invoked"); (4) the escape-harness R4-B verification-grep comment ("drives BOTH
  group-A reaps (reapTree + reapGroup)"); (5) the Windows WP Current-state ("On POSIX
  the abnormal settle runs three reaps"). An implementer could not satisfy both the
  single-source table and these leftover contracts.

  Owner ACCEPT: **finish the extraction — every one of those locations now cites the
  settle-path reap matrix instead of independently restating the per-path set**, and
  the stale "reapTree on the abnormal path" requirement is removed (reapTree confined
  to the timeout row; `reapGroup(child.pid)` is the group-A reap on every non-timeout
  row). Post-edit `git grep -n "reapTree"` across the three specs confirms every
  remaining `reapTree` mention is inside the table, in the timeout-row context, a
  primitive definition, or a reference to the table — **no independent post-close
  reapTree requirement survives.**

- **R11-3 (ACCEPT, HIGH) — the R10-1 write-failure guard's `{ reaped: false }` branch
  was undefined; a live unsupervised brain could remain.** `reapGroup` can return
  `{ reaped: false }` at the bounded-poll end. On the R10-1 hand-up-write-failure
  path the pidfile write has already FAILED, so no identity is handed up and
  `run-job`'s backstop (which `reapGroup(brain.pgid)`s only when the pidfile is
  present) can never learn group B's pgid — the guard in `dream.js` is the only reaper
  holding `child.pid`. The R10-1 acceptance only checked the reap was called + a
  `WienerdogError` thrown; the live regression used a SIGKILL-fast fixture that ends
  `{ reaped: true }`, so it missed the `{ reaped: false }` case entirely.

  Owner ACCEPT: **define the `{ reaped: false }` branch explicitly, unified with the
  existing R8-1 rule (no divergent one).** On `{ reaped: false }` after the immediate
  guard reap, `dream.js` does **one bounded FINAL escalation** while still holding
  `child.pid`, then throws — a plain `WienerdogError` on `false → true`, and a
  **survivor-specific** `WienerdogError` on `false → false` (the ADR-0030 D-state
  residual) so it is surfaced LOUDLY (fail-loud / error outcome), never a silent exit.
  Applied to `WP-a10-reap-mechanism`: the R10-1 guard prose, its acceptance criterion,
  the `dream.js` + `dream.test.js` Deliverables cells, and two verification greps.
  Applied to `WP-a10-escape-harness`: live proof #7 gains seam-injected `false → true`
  and `false → false` sequences (asserting a bounded escalation call count and a
  loud, non-silent failure), plus the Deliverables note, the acceptance criterion, and
  a verification grep.

## Decision beyond the dispositions

- **None.** All three findings were applied exactly as owner-dispositioned. R11-1
  changes only rationale text + one new regression (the ACTIONS/table cells are
  unchanged — `reapTree` stays on the timeout row). R11-2 is pure contract-extraction
  completion (removing stale restatements, no behavior change beyond dropping a
  never-required post-close `reapTree` assertion). R11-3 reuses the already-specified
  `reapGroup(child.pid)` primitive + the existing fail-loud path, unified with R8-1 —
  no new file/authority/seam. Sizing re-checked: `WP-a10-reap-mechanism` stays **M**
  (rationale corrections + one guarded branch already at an existing spawn site),
  `WP-a10-escape-harness` stays **M** (two added live proofs, one added fixture mode,
  no new fixture file), `WP-a10-windows-reap` stays **M** (one Current-state
  correction). The A10 WPs stay `Draft`; ADR-0030 stays `Proposed`.
