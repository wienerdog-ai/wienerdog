---
date: 2026-07-19
title: Codex round-3 A9/A10 spec review
related_wps: [WP-a9-incident-runbook, WP-a9-private-modes-repair, WP-a10-reap-mechanism]
---

# Codex round-3 A9/A10 spec review (2026-07-19)

**Third Codex confirmation pass over the A9/A10 set (three per-spec jobs,
substantive-only focus). Codex CONFIRMED the round-1 and round-2 fixes are REAL,
not reworded — the earlier dispositions landed as genuine spec changes — and
returned only 5 new substantive findings, all owner-ACCEPTed 2026-07-19. Every
cited code fact re-verified against the current working tree before disposition:
`adapters/shared.js` `locateManagedBlock` returns `null` when no sentinel line
exists (`:30`) and the writer then APPENDS a fresh block at EOF (`:171–176`),
leaving orphaned text OUTSIDE the sentinels; job DEFINITIONS live in the managed
`jobs:` section of `config.yaml` (`scheduler/jobs.js:10–13`; `renderJob` writes
name/at/run/timeout_minutes; `removeJob:174` mutates config.yaml) while
`state/schedule.json` holds only run watermarks (last_success/last_status/
last_error_at); `sync` applies only the DETECTED harness adapter (`sync.js:288–303`,
single-harness Claude-only/Codex-only installs supported+tested); `private-fs.js`
`repairPrivateModes` does one `listA5Entries` enumeration then chmods, and
`listFiles` returns `[]` on a `readdirSync` error (`:86–94`), so a `000` `secrets/`
hides its `0644` contents from a single-pass repair; the reap-mechanism
abnormal-close branch specified only `reapTree(child.pid)`, whose ppid-closure is
empty once the group-A leader (the middle) has exited.** Specs stayed `Draft`, so
revisions landed as edits. ADR-0030 unchanged this round (R3-E is a genuine fix,
not a new residual). No re-split: all three WPs kept their sizes (S / M / M).

## WP-a9-incident-runbook (docs, 3)

- **R3-A (ACCEPT, CRITICAL) — byte-level drill false-passes a still-poisoned file
  when BOTH sentinels are deleted.** With both managed-block sentinels removed but
  the poisoned prose left in place, `locateManagedBlock` finds no sentinel → `sync`
  APPENDS a fresh clean block at end-of-file, leaving the old poisoned text OUTSIDE
  the (new) sentinels; the harness reads the WHOLE file, so it is still injected; a
  drill that greps only inside the sentinel region certifies a poisoned file as
  clean. Fixed the runbook's managed-block check to (a) state that a MISSING
  sentinel pair means `sync` did NOT prove cleanup — the orphaned content outside
  the sentinels must be manually removed/quarantined and the drill re-run; (b) run
  the marker `grep -F` over the ENTIRE `CLAUDE.md`/`AGENTS.md`, not just the
  sentinel region (the load-bearing check); (c) confirm exactly one sentinel pair
  and byte-compare its region against the clean `state/digest.md`.
- **R3-B (ACCEPT, HIGH) — round-2 snapshot pointed at the WRONG file.** The round-2
  disposition told the runbook to snapshot `state/schedule.json` as the restore
  source; that file holds only run watermarks. The recoverable job definitions
  (name/at/run/timeout_minutes) live in `config.yaml`'s managed `jobs:` section,
  which `schedule remove` mutates. Fixed step 1 to snapshot the `config.yaml`
  `jobs:` section (schedule.json optional as watermark evidence only), and step 7
  to reconstruct explicit `schedule add <name> --at … --job/--skill … --timeout …`
  commands from that snapshot. Corrected the wording that claimed schedule.json
  enables lossless restore. (My own round-2 disposition error.)
- **R3-C (ACCEPT, MEDIUM) — drill required a sentinel pair in BOTH files, blocking
  single-harness installs.** `sync` runs only the detected harness's adapter, and
  Claude-only / Codex-only installs are supported+tested, so one of CLAUDE.md /
  AGENTS.md legitimately does not exist — the old "sentinel pair in both, absence =
  failure" gate would block re-authorization forever. Made the sentinel/marker
  check mandatory **per INSTALLED harness file**: both when both are present, only
  the single present file on a single-harness install (an un-installed harness's
  absent file is not a failure).

## WP-a9-private-modes-repair (code, 1)

- **R3-D (ACCEPT, MEDIUM) — single-pass repair misses a `0644` token trapped in a
  `000` `secrets/`.** The file enumeration runs while `secrets/` is still `000`
  (`listFiles`'s `readdirSync` fails → `[]`), so `repairPrivateModes` chmods the
  DIR to `0700` but never sees the `0644` file inside → the token survives until
  the NEXT sync, breaking the single-sync `0600` guarantee. The separate "000 dir"
  and "0644 token" tests both pass while the combination slips through. Specified a
  TWO-PHASE repair: chmod the explicit private dirs to `0700` FIRST, THEN
  re-enumerate their now-traversable contents and chmod files to `0600`. Added the
  combined acceptance test: a `000` `secrets/` containing a `0644` token/client
  file → a SINGLE `repairPrivateModes` call fixes both, follow-up
  `scanPrivateModes` returns `{insecure: 0}`. Single-enumerator invariant kept
  (phase 2 re-calls the same enumerator).

## WP-a10-reap-mechanism (code, 1)

- **R3-E (ACCEPT, HIGH) — abnormal-close group-A reap was an incomplete round-2
  fix.** The abnormal branch specified only `reapTree(child.pid)`, but by the time
  `run-job` receives `'close'` the middle (group-A leader) has exited; a group-A
  child reparented to `init` still carries `child.pid` as its PGID, yet `reapTree`
  builds its kill set from VISIBLE ppid-descendants of `child.pid` — with the
  leader gone from the process table, the set is empty and no `kill(-child.pid)` is
  sent, so a fully NON-adversarial sleeping group-A child survives the middle's
  death (breaking the mandatory live-harness case). Round-2 gave the brain group
  `reapGroup` but left group-A's abnormal path on `reapTree`. Fixed: on abnormal
  settle call an explicit `reapGroup(child.pid)` (negative-PGID kill, reaches a
  leaderless reparented member) ALONGSIDE `reapTree(child.pid)`. The live harness
  must prove, on the real post-`'close'` path, that a reparented leaderless group-A
  member also ends up ESRCH. Kept the WP at M (one-call wiring addition + a harness
  assertion refinement, same six-deliverable set). No new ADR-0030 residual — this
  is inside the guaranteed non-adversarial boundary and is now actually closed.

## Decision beyond the dispositions

- **None.** All five findings applied exactly as owner-dispositioned. Sizes
  unchanged (incident-runbook S; private-modes-repair M; reap-mechanism M). ADR-0030
  stays Proposed with no amendment — R3-E is a fix within the existing
  non-adversarial guarantee, not a newly-discovered residual. Confirmed no lingering
  claim that `reapTree` alone reaches a leaderless group-A member survives in the
  reap-mechanism spec.
