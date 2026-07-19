---
date: 2026-07-19
title: Codex round-1 A9/A10 spec review
related_wps: [WP-a9-incident-runbook, WP-a9-private-modes-repair, WP-a10-reap-mechanism, WP-a10-escape-harness]
---

# Codex round-1 A9/A10 spec review (2026-07-19)

**Codex round-1 adversarial review of the three A9/A10 closeout drafts (verdict:
needs-attention; 8 high findings, all owner-dispositioned 2026-07-19; every cited
code fact verified against 08d898a before disposition). Specs were still `Draft`,
so revisions land as edits, not patches.** New ADR **ADR-0030** (Bounded
user-level process supervision; Proposed — owner ratifies at the A10 `Ready`-flip,
ADR-0028 flow) drafted for finding 8. `WP-a10-supervisor-race-close` **split** into
`WP-a10-reap-mechanism` (mechanism + wiring + unit) and `WP-a10-escape-harness`
(live negatives), the latter `depends_on` the former — findings 6+7+8 pushed the
single WP past the M cap.

## WP-a9-incident-runbook (docs)

- **F1 (ACCEPT) — `schedule remove` ≠ quiescence.** `remove` only unregisters
  future fires (OS-unregister best-effort, empty catch in
  `manifest.js reverseSchedulerEntry`); a job running *now* keeps going. Added a
  proven-quiescence gate to step 1: platform live-process checks
  (`pgrep`/`launchctl`/`systemctl`/`Get-ScheduledTask`), explicit stop/kill, and a
  hard gate — credential rotation begins only at proven zero active jobs.
- **F2 (ACCEPT) — evidence is not secret-free.** Redaction is best-effort
  (ADR-0024 + run-job EP3: boundary-split partial, unknown/encoded pass). Dropped
  the "safe to keep" claim; step 2 now requires a `0700` incident folder, `0600`
  copies, and explicit cloud-sync/backup exclusion. Integrity hashes left optional
  (kept as an optional nicety).
- **F3 (ACCEPT) — drill before re-auth, byte-level.** Swapped steps 6/7: the
  acceptance drill now runs BEFORE re-authorization and schedules return only after
  a recorded pass. Strengthened from model-behavior observation to byte-level: run
  the SessionStart hook and grep its decoded `additionalContext`, grep the
  regenerated digest, check BOTH managed blocks (CLAUDE.md + AGENTS.md), any sync
  sentinel/adapter notice is blocking; the new-session check is an optional extra,
  not the proof. Added ADR-0027 to frontmatter.

## WP-a9-private-modes-repair (code)

- **F4 (ACCEPT) — "no writer changes" false for logs.** `run-job.js:552` and
  `dream.js:340` open log streams via bare `createWriteStream` (0666 under
  umask 000). Added both writers + their tests to Deliverables; introduced a shared
  `createLogStreamPrivate` (0600 mode + post-open chmod for the append case); the
  fresh-install acceptance now runs the ACTUAL run-job/dream writer paths under
  umask 000, not just the predicate.
- **F5 (MIDDLE PATH, owner) — metadata files in-predicate, writers untouched.**
  config.yaml, install-manifest.json, schedule.json, watermarks.json now enter the
  predicate/repair/scan set (doctor detects, sync repairs to 0600) — closing
  WP-126's deferral + ADR-0024's hand-off — but their writers stay unchanged;
  fresh-write privacy relies on the 0700 parent dirs + sync-time repair (dated
  accepted residual, replacing the old "OUT of the 0600 set" note).

## WP-a10 (split)

- **F6 (ACCEPT) — reap on ALL exit paths + brain-PID hand-up.** `run-job`'s `done`
  resolves on child `'close'` and the `finally` clears the timer, so a middle
  `dream.js` death currently fires no watchdog; the brain (group B) orphans.
  Mechanism WP now reaps on timeout/child-error/unexpected-close, and `dream.js`
  hands the brain pid/pgid up via a `state/dream-brain.pid` (0600) that `run-job`
  reaps on settle. Mandatory live test (harness WP): SIGKILL the middle while the
  brain lives → zero survivors.
- **F7 (ACCEPT) — no PATH-resolved bare `ps` as kill authority.** The clean job
  PATH front-loads user-writable `~/.local/bin` (the WP-154/ADR-0028 injection
  class, more destructive since it kills). Reap now reads Linux `/proc` directly
  and macOS absolute `/bin/ps` verified via WP-154 `exec-identity`; never a bare
  name. Unit asserts `/bin/ps` absolute; harness plants a fake `ps` ahead in PATH
  and proves it is unused.
- **F8 (ACCEPT, 2nd branch) — no booked survivor; bound the guarantee.** (a)
  single-snapshot reaping → kill–rescan until two consecutive zero sweeps (closes
  snapshot→kill TOCTOU for all findable processes) + a timed fork/setsid
  interleaving attack test. (b) ADR-0030 explicitly bounds the user-level
  guarantee: full closure for findable trees; the combined setsid+double-fork
  full-detach escapee is beyond user-level supervision, mitigated by the A1
  hermetic runtime profiles, final closure deferred to A12. The WPs cite ADR-0030
  instead of an in-spec residual note.
