---
date: 2026-07-19
title: Codex round-2 A9/A10 spec review
related_wps: [WP-a9-incident-runbook, WP-a9-private-modes-repair, WP-a10-reap-mechanism, WP-a10-escape-harness]
---

# Codex round-2 A9/A10 spec review (2026-07-19)

**Second Codex adversarial pass over the revised A9/A10 set (three per-spec review
jobs; 14 high findings, all owner-ACCEPTed 2026-07-19). Every cited code fact
re-verified against the current commit before disposition: catch-up scheduler
`ai.wienerdog.catchup` in `schedule.js ensureCatchup` (Windows `\Wienerdog\catchup`);
SessionStart hook deliberately fail-open (exit 0 on missing/unreadable digest,
missing node, inherited `WIENERDOG_JOB`); `memory approve` accepts only the
short-names profile|preferences|goals|instructions (or their `.md` basenames);
log dirs via bare `mkdirSync(recursive)` at `run-job.js:550` / `dream.js:339`.**
Specs stayed `Draft`, so revisions landed as edits. ADR-0030 stays Proposed; two
new residuals added (kill-induced late reparent; spawn→hand-up gap) plus the
PID→PID/PGID-reuse and per-run-isolation extensions. No re-split: reap-mechanism
stayed M (additive refinement of the same deliverable set); the escape-harness
merge-gate is expressed as a reap-mechanism DoD clause, not a third WP.

## WP-a9-incident-runbook (docs, 5)

- **F1 (ACCEPT, simplified) — quiescence = reboot, not forensics.** (a) The
  runbook must also remove + re-verify the shared catch-up entry (macOS
  `ai.wienerdog.catchup`, Windows `\Wienerdog\catchup`; Linux has none) — per-job
  `schedule remove` deliberately leaves it. (b) Canonical quiescence path is now
  remove all schedules → remove+verify catch-up → **REBOOT** (zero WD processes,
  platform-independent, no forensics); the per-platform live check is kept only as
  optional confirmation for users who cannot reboot, with the Codex-named flaws
  fixed (Windows `\Wienerdog\` TaskPath, CommandLine/tree match not node.exe path,
  both claude+codex, two consecutive clean checks gate rotation).
- **F2 (ACCEPT) — evidence handling.** Create+verify the cloud/backup exclusion
  and private folder **before** copying; recursive `find … -type d -exec chmod 700`
  / `-type f -exec chmod 600` + blocking re-verify (the old `chmod 600 …/*` strips
  dir traversal and misses nested files); concrete Windows `icacls` + File
  History/OneDrive exclusion.
- **F3 (ACCEPT) — drill fail-closed.** The SessionStart hook is fail-open, so the
  drill runs the installed `<core>/bin/session-start.sh` with `WIENERDOG_HOME` set
  and `WIENERDOG_JOB` cleared, and BLOCKS on empty stdout / JSON-parse failure /
  wrong `hookEventName` / non-string `additionalContext`, byte-comparing to
  `state/digest.md`. Managed-block check tied to `sync`'s own notice + an explicit
  sentinel/marker check in CLAUDE.md AND AGENTS.md — **not** `doctor` (it prints
  neither the hook path nor a managed-block/sentinel integrity check).
- **F4 (ACCEPT) — snapshot schedule definitions before removal.** Step 1 now
  copies `state/schedule.json` into the private folder before any `schedule
  remove` — `schedule list` omits `timeoutMinutes` and `remove` deletes the entry,
  so a plain re-add cannot losslessly restore time/type/timeoutMinutes. Docs-only
  (snapshot a shipped state file).
- **F5 (ACCEPT) — `memory approve` form.** Corrected to a fixed short name
  (`profile`/`preferences`/`goals`/`instructions` or `.md` basename); dropped the
  "accepts a file path" / `06-Identity/*` implication.

## WP-a9-private-modes-repair (code, 3)

- **F6 (ACCEPT, fail-closed) — `createLogStreamPrivate`.** POSIX opens the fd with
  0600 and `fchmodSync`es that fd; on chmod/fchmod failure it closes the fd and
  **throws** (surfaces via run-job's fail-loud path) — never falls back to a
  world-readable file. Negative test: injected throwing `fchmodSync` → helper
  throws and zero log bytes written.
- **F7 (ACCEPT) — expected-mode predicate.** Enumerator carries each entry's
  expected mode; predicate flags full `(mode & 0o777) !== expectedMode`, so an
  over-tight `0600`/`000` `secrets/` (traversal-broken store) is caught + repaired,
  not passed as clean. Doctor message no longer speaks only of other-readability.
- **F8 (ACCEPT) — log SUBDIRS 0700.** `run-job.js:550` / `dream.js:339` bare
  `mkdirSync(recursive)` → `mkdirPrivate(logDir)`; enumerator includes every
  existing `logs/<job>` dir at expected 0700; umask-000 tests assert the job-dir
  0700 alongside the log-file 0600. (Same class as the already-accepted log-file
  finding; run-job/dream now change two lines each.)

## WP-a10-reap-mechanism + WP-a10-escape-harness + ADR-0030 (6)

- **F9 (ACCEPT, per-run token) — replace the single global
  `state/dream-brain.pid`.** Outer supervisor mints a run token before spawn and
  passes it down (env); middle writes/deletes only `state/dream-brain.<token>.pid`
  (atomic, immediately post-spawn); reaper reads only its own token. Fixes the
  cross-run kill (lock-losing concurrent dream must not kill the first run's live
  brain). Spawn→hand-up gap = documented ADR-0030 residual (no handshake). Tests:
  cross-run isolation + middle killed at the spawn/hand-up boundary.
- **F10 (ACCEPT) — abnormal-close reaps the FULL group-A tree.** On timeout /
  `'error'` / non-clean `'close'`, `reapTree(child.pid)` for group A **in addition
  to** the group-B brain `reapGroup`. Live test (harness): SIGKILL the middle while
  BOTH a group-A descendant and the detached brain live → ESRCH on both.
- **F11 (ACCEPT, negative-PGID) — authenticated-group kill.** New `reapGroup(pgid)`
  primitive issues `kill(-pgid)` (reaches surviving members even if the group
  leader exited); feeding the pgid to `reapTree` (positive-pid lookup) would leak
  them. No start-time check; PID/PGID-reuse micro-window = documented ADR-0030
  residual. Tests: exited-group-leader-with-live-member; recycled-id conceptual.
- **F12 (ACCEPT) — remove the Windows bare-name `taskkill` fallback.** Only the
  absolute System32 `taskkill.exe` may execute; its absence is a diagnosed no-op,
  never a bare-name spawn (same PATH-injection class as bare `ps`). Path held in a
  variable; grep-verification made robust to that. Windows fake-taskkill-in-PATH
  negative lives in `reap.test.js` (platform injected — harness stays POSIX-only).
- **F13 (ACCEPT, merge-gate not a third WP) — harness gates production activation.**
  reap-mechanism's DoD adds a hard merge-gate: the reap.js primitive + unit tests
  may land first, but the run-job/dream production wiring may not merge until
  WP-a10-escape-harness is green on the same stack. Expressed as a DoD clause (not
  a `depends_on` edge — the harness already `depends_on` reap-mechanism for the
  code; a reverse edge would be a frontmatter cycle). See Decision below.
- **F14 (ACCEPT, residual not test-barrier) — kill-induced late reparent.** A known
  child that `setsid`s AFTER the first snapshot and is reparented to init by the
  reaper's own kill of its parent survives two clean sweeps (no double-fork; the
  reparent is reaper-induced). ADR-0030 residual section extended to name it;
  cgroup containment forbidden by ADR-0004, deferred to A12. The harness keeps its
  best-effort matrix + non-vacuity baseline and its group-retaining late-fork
  required-green; the combined late-reparent case is recorded, not asserted — no
  deterministic snapshot/fork/setsid test-barrier machinery (disproportionate for a
  nightly note-taking job).

## Decision beyond the dispositions

- **F13 expressed as DoD merge-gate, not a `depends_on` cycle.** The disposition
  said "DoD + depends_on"; a reverse `depends_on` (reap-mechanism → escape-harness)
  would cycle with the harness's existing `depends_on: [WP-a10-reap-mechanism]`
  (which is truthful — the harness needs reap.js to exist). Kept the frontmatter
  acyclic and encoded the activation gate as a hard Definition-of-Done clause plus
  an Implementation-notes coordination note. reap-mechanism `depends_on` unchanged
  (`[WP-155, WP-157]`).
</content>
</invoke>
