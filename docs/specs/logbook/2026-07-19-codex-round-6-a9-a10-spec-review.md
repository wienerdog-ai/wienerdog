---
date: 2026-07-19
title: Codex round-6 A9/A10 spec review
related_wps: [WP-a9-incident-runbook, WP-a10-reap-mechanism, WP-a10-escape-harness]
---

# Codex round-6 A9/A10 spec review (2026-07-19)

**Sixth Codex confirmation pass over the A9/A10 set (two per-spec jobs this round).
`WP-a9-private-modes-repair` was already APPROVED in round 5 and was NOT
re-reviewed — left untouched. Two substantive findings remained, both
owner-ACCEPTed 2026-07-19. Every cited code fact re-verified against the current
working tree before disposition: `adapters/shared.js:111` `buildBlock` emits
`` `${BEGIN}\n${safeDigest.trimEnd()}\n${END}` `` — it trims trailing newlines and
neutralizes any full-line sentinel in the digest, so a normal `# digest\n` yields
an inner region `# digest` that is NEVER byte-identical to the raw
`state/digest.md`; and `templates/hooks/session-start.sh:27-28` reads
`state/digest.md` verbatim into `additionalContext` (so that separate drill
byte-compare is raw-digest-to-raw-digest and stays). For R6-2, the current
`dream.js` `runBrainWithWatchdog` is still pre-A10, and the WP-a10-reap-mechanism
contract removed the per-token pidfile UNCONDITIONALLY in the `finally` — while
`run-job`'s abnormal-settle only `reapGroup(brain.pgid)`s when the pidfile is
present.** Specs stayed `Draft`, so revisions landed as edits. ADR-0030 unchanged
this round (both findings are ordinary correctness, neither a new adversarial
residual). No WP crossed its size cap (incident-runbook S; reap-mechanism M;
escape-harness M).

## WP-a9-private-modes-repair (code)

- **APPROVED in round 5 — NOT re-reviewed this round.** Left exactly as-is.

## WP-a9-incident-runbook (docs)

- **R6-1 (ACCEPT, HIGH) — the acceptance drill's managed-block byte-compare
  FALSELY fails on a clean install and would wrongly block re-authorization.** The
  drill required byte-identity between the managed block's inner sentinel-region
  text and the RAW `state/digest.md`. But `buildBlock` (`adapters/shared.js:111`)
  writes `` `${BEGIN}\n${neutralized(digest.trimEnd())}\n${END}` `` — it trims
  trailing newlines and neutralizes any full-line sentinel — so even a normal
  `# digest\n` yields inner text `# digest` (no trailing newline) and the
  byte-compare always fails on a clean, correctly-synced install. Owner chose
  **option B**: drop the fragile byte-compare; prove block integrity with the
  three equivalent, human-followable checks that already exist in the step — (1)
  the poisoned marker appears NOWHERE in the whole `CLAUDE.md`/`AGENTS.md` file
  (the R3-A whole-file grep), AND (2) exactly ONE sentinel pair exists in each
  installed harness file (no orphaned out-of-sentinel remnant), AND (3) `wienerdog
  sync` ran from the clean digest with NO warning/notice. Rationale stated inline:
  `sync` writes the block AS `buildBlock(current digest)` by construction, so if
  the digest source is clean and `sync` succeeded, the block is clean by
  construction — a raw-digest byte-equality adds no security property and only
  produces false failures. The runbook explicitly tells the human NOT to reproduce
  `buildBlock`'s transform by hand. The SessionStart-hook `additionalContext`
  byte-compare against the raw digest is a **different**, legitimate check
  (raw-to-raw, the hook injects `digest.md` verbatim) and was left in place.
  Updated: the managed-block check intro line, the third drill sub-bullet (dropped
  the region-vs-digest compare, added a "by construction" explanation of why it
  would falsely fail), the Deliverables note, the fail-closed-drill acceptance
  criterion, and a new verification grep. WP stays docs-only, S.

## WP-a10-reap-mechanism (mechanism) + WP-a10-escape-harness (tests)

- **R6-2 (ACCEPT, HIGH) — the `dream.js` contract deleted the group-B hand-up
  pidfile BEFORE proving group-B quiescence, leaking a surviving brain child on a
  brain-leader non-zero exit.** `runBrainWithWatchdog`'s `finally` removed the
  per-token pidfile unconditionally. On a **non-timeout brain-leader non-zero
  exit** where a same-PGID group-B child survives, the sequence is: brain
  `'close'` → `dream.js` throws its `WienerdogError` → the `finally` deletes the
  pidfile BEFORE the middle settles non-zero. `run-job`'s abnormal-settle only
  calls `reapGroup(brain.pgid)` **if the pidfile is present**, so group B is never
  reaped and the surviving brain child leaks. The inner watchdog fires **only** on
  timeout (not on a brain-leader exit), and `run-job` reaps nothing on this path —
  so nothing reaps group B. The live harness missed it because it SIGKILLs the
  MIDDLE (a path where the pidfile survives for `run-job` to find). This is POSIX
  non-adversarial correctness, **NOT** an ADR-0030 residual (ADR-0030 unchanged).
  Owner ACCEPT: group-B quiescence must be **PROVEN before the pidfile is
  deleted**. Applied to `WP-a10-reap-mechanism`: the `dream.js` `finally` now, when
  a run token is present, does `reapGroup(child.pid)` (brain pgid == `child.pid`;
  negative-PGID kill reaches a surviving member even after the leader has exited)
  **before** removing the pidfile, on **every** settle where the brain leader has
  exited — not only timeout; stated that the unconditional pre-quiescence pidfile
  delete is the bug; kept `run-job`'s abnormal-settle as the **backstop** for the
  other leak path (a middle that dies before `dream.js`'s `finally` runs, leaving
  the pidfile behind). Updated: the `dream.js` Deliverables row, the `dream.js`
  Exact-contract prose (a new load-bearing ordering paragraph), the run-job
  settle-path bullet (division of labor), the `dream.test.js` Deliverables row, a
  new acceptance criterion, and a verification grep. WP stays M. Applied to
  `WP-a10-escape-harness`: added a **required-green POSIX-gate** live proof — the
  brain leader exits non-zero while a same-PGID group-B child survives; drive the
  REAL `dream.js` `finally` reap and assert the surviving group-B child reaches
  `ESRCH` **before** the pidfile is deleted (a skip is NOT a pass; omitting the
  `reapGroup` or deleting the pidfile first must fail it) — with fixture support
  (a re-detached "brain" that spawns a same-group-B child then exits non-zero), a
  Current-state note, an acceptance criterion, and a verification grep. WP stays M.

## Decision beyond the dispositions

- **None.** Both findings applied exactly as owner-dispositioned. ADR-0030 stays
  Proposed and unchanged — R6-1 is a runbook-drill correctness fix (a false-fail
  removal) and R6-2 is POSIX non-adversarial correctness, neither an adversarial
  residual. All three touched WPs kept their sizes (incident-runbook S;
  reap-mechanism M; escape-harness M); `WP-a9-private-modes-repair` untouched
  (already approved round 5).
