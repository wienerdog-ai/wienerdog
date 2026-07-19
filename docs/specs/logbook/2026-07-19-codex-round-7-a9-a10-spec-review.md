---
date: 2026-07-19
title: Codex round-7 A9/A10 spec review
related_wps: [WP-a9-incident-runbook, WP-a10-reap-mechanism, WP-a10-escape-harness]
---

# Codex round-7 A9/A10 spec review (2026-07-19)

**Seventh Codex confirmation pass over the A9/A10 set. `WP-a9-private-modes-repair`
was APPROVED in round 5 and was NOT re-reviewed — left untouched. Three substantive
findings remained, all owner-ACCEPTed 2026-07-19. Every cited code fact was
re-verified against the current working tree before disposition: `src/core/paths.js:55`
resolves `core = $WIENERDOG_HOME || ~/.wienerdog` (so a custom-`WIENERDOG_HOME`
install does not live in `~/.wienerdog`); the pre-revision `reapGroup` contract was a
single `kill(-pgid, SIGKILL)` with a `void` return and no rescan; and the pre-revision
`readProcessTable` contract returned `null` on ANY error.** Specs stayed `Draft`, so
revisions landed as edits. ADR-0030 unchanged this round — all three findings are
ordinary correctness, none a new adversarial residual. No WP crossed its size cap
(incident-runbook S; reap-mechanism M; escape-harness M).

## WP-a9-private-modes-repair (code)

- **APPROVED in round 5 — NOT re-reviewed this round.** Left exactly as-is.

## WP-a9-incident-runbook (docs)

- **R7-1 (ACCEPT, HIGH) — the runbook hardcoded the core dir and would resurrect
  catch-up on a custom-`WIENERDOG_HOME` install.** The runbook named the Windows
  catch-up XML as `<core>\schedules\wienerdog-catchup.xml` where `<core>` was
  `$env:USERPROFILE\.wienerdog`, and drove the SessionStart-hook drill with a
  hardcoded `$HOME/.wienerdog` — but the shipped path layer resolves `core =
  $WIENERDOG_HOME` when set, else the platform default (`paths.js:55`). On a
  custom-`WIENERDOG_HOME` install the instructions unregister the OS task while
  leaving the REAL `<WIENERDOG_HOME>\schedules\wienerdog-catchup.xml` and its
  manifest entry intact; every check passes, then step-4 `wienerdog sync`
  `reloadMissing` resurrects catch-up before the drill. The same default-core
  assumption sat in the installed-hook command, the evidence paths, the Google-token
  path, and the digest reference. Owner ACCEPT: the runbook must resolve ONE
  authoritative core UP FRONT. Applied: a new **step 0 preamble** (before step 1)
  resolves `<core>` = `$WIENERDOG_HOME` if set else the platform default — giving
  both POSIX (`${WIENERDOG_HOME:-$HOME/.wienerdog}`) and Windows (`$env:WIENERDOG_HOME`
  else `$env:USERPROFILE\.wienerdog`) resolution — DISPLAYS it, and has the user
  CONFIRM it holds the real install (`config.yaml`, `state/`,
  `install-manifest.json`). Every later path now references that same resolved
  `<core>` (`$CORE`/`$core`): the catch-up scheduler XML, `install-manifest.json`,
  the evidence copy, `state/digest.md`, the SessionStart hook, and every
  verification — never a hardcoded `~/.wienerdog`. The one documented exception is
  the macOS catch-up LaunchAgent plist
  (`~/Library/LaunchAgents/ai.wienerdog.catchup.plist`, always home-based,
  independent of `WIENERDOG_HOME`). Updated: a new Current-state note, the
  Exact-contract intro, the inserted step 0, the step-1 config.yaml/Windows-XML/
  dual-re-verify paths, the step-2 evidence-copy paths, the step-3 Google-token
  path, the step-6 hook path + drill command + digest greps, the Context digest
  illustration, the Deliverables note, a new acceptance criterion, and a new
  verification grep. WP stays docs-only, S.

## WP-a10-reap-mechanism (mechanism) + WP-a10-escape-harness (tests)

- **R7-2 (ACCEPT, HIGH) — `reapGroup` was a fire-and-forget kill; deleting the
  pidfile after it lost the identity while a member could still be alive.**
  `reapGroup` was specified as a single `kill(-pgid, SIGKILL)` with no rescan, a
  `void` return, and swallowed errors. A successful kill only means the signal was
  ACCEPTED, not that every group member is `ESRCH`; on error it proves even less.
  `dream.js` then deleted the pidfile — so the outer `run-job` backstop (which only
  `reapGroup(brain.pgid)`s when the pidfile is present) loses the identity while a
  member may still exist, directly contradicting the escape-harness requirement to
  assert `ESRCH` BEFORE pidfile deletion. Owner ACCEPT: fix the `reapGroup` contract
  to return a CHECKED result and bounded-poll to quiescence. Applied to
  `WP-a10-reap-mechanism`: `reapGroup` now POSIX SIGKILLs the negative pgid then
  bounded-polls (`kill(-pgid, 0)` re-SIGKILL until `ESRCH` or `maxPolls`, default 5)
  and returns `{ reaped: boolean }` — `reaped:true` only when the group is verified
  empty, `reaped:false` on a bounded timeout with a member still present; win32
  returns `{ reaped: true }` best-effort after the taskkill (it cannot verify the
  leaderless case it explicitly does not cover, R5-2). The pidfile may be deleted
  ONLY on `{ reaped: true }`; on `{ reaped: false }` the pidfile is RETAINED for the
  outer backstop retry. Updated: the `reapGroup` JSDoc, a new "poll to verified
  quiescence" algorithm paragraph, the `reap.js`/`run-job.js`/`dream.js` Deliverables
  rows, the run-job and dream.js wiring prose, the `reap.test.js`/`scheduler-runjob`/
  `dream.test.js` Deliverables notes, two acceptance criteria (a new R7-2 one plus
  the Authenticated-PGID and Group-B-quiescence ones), and a verification grep. WP
  stays M. Applied to `WP-a10-escape-harness` for consistency only: the Current-state
  dream.js note and the proof-#4 body now state that the pidfile delete is gated on
  `reapGroup`'s `{ reaped: true }`, so the ESRCH-before-delete ordering the harness
  asserts is now a mechanism guarantee rather than incidental timing. WP stays M.

- **R7-3 (ACCEPT, HIGH) — the `/proc` reader nulled the whole snapshot on a single
  per-PID disappearance, degrading to a group-kill that misses group B.** The Linux
  `readProcessTable` contract returned `null` on ANY error, but normal system churn
  routinely has a process exit between `readdir` and reading its `stat` file
  (per-entry `ENOENT`); a single vanishing unrelated `/proc` entry would null the
  whole snapshot and fall back to the legacy group-kill — which does NOT reach the
  separately-detached group-B brain — a fully non-adversarial timeout leak. Owner
  ACCEPT: handle per-PID disappearance races by SKIPPING that pid and continuing the
  snapshot; only an unreadable `/proc` root or an otherwise unusable full snapshot
  (missing/unverifiable `/bin/ps`, zero usable rows) yields `null`. Applied to
  `WP-a10-reap-mechanism`: updated the `readProcessTable` JSDoc (per-PID
  `ENOENT`/`ESRCH` skips-and-continues; `null` only when the snapshot is unusable as
  a whole), added a churn-regression to the `reap.test.js` Deliverables note (a
  mid-scan vanishing unrelated pid must not abort the descendant reap), a new
  acceptance criterion, and a verification grep (over both `reap.js` and the test).
  WP stays M.

## Decision beyond the dispositions

- **None.** All three findings applied exactly as owner-dispositioned. ADR-0030 stays
  Proposed and unchanged — R7-1 is a runbook path-resolution correctness fix, R7-2 is
  POSIX non-adversarial reap-completion correctness, and R7-3 is non-adversarial
  `/proc`-churn robustness; none is an adversarial residual. Sizing re-checked: R7-2
  and R7-3 add a bounded poll loop + checked return to `reapGroup` (the same shape as
  `reapTree`'s existing kill-rescan loop) and a per-entry skip to `readProcessTable`,
  threaded through two pre-existing call sites — no new file, authority, or
  cross-cutting seam — so `WP-a10-reap-mechanism` stays within M (no split needed).
  All three touched WPs kept their sizes (incident-runbook S; reap-mechanism M;
  escape-harness M); `WP-a9-private-modes-repair` untouched (already approved round 5).
