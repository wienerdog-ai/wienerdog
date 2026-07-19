---
date: 2026-07-19
title: Codex round-5 A9/A10 spec review
related_wps: [WP-a9-incident-runbook, WP-a10-reap-mechanism, WP-a10-escape-harness, WP-a10-windows-reap]
---

# Codex round-5 A9/A10 spec review (2026-07-19)

**Fifth Codex confirmation pass over the A9/A10 set (three per-spec jobs,
substantive-only). `WP-a9-private-modes-repair` came back APPROVE / shippable this
round — left untouched. Two substantive findings remained, both owner-ACCEPTed
2026-07-19. Every cited code fact re-verified against the current working tree
before disposition: `sync.js:197` calls `status.reloadMissing`, which walks
`install-manifest.json` and re-registers any `scheduler-entry` whose OS probe is
`missing` but whose manifest entry **and** scheduler file survive, via the platform
reload command (`status.js:31` `launchctl bootstrap` / `:40` `systemctl enable
--now` / `:49` `schtasks /create /xml`) — cross-platform, not Windows-only; the
catch-up `entry.path` is the macOS LaunchAgents plist / Windows
`<core>/schedules/wienerdog-catchup.xml`, and the manifest is
`<core>/install-manifest.json`. And `reapGroup`'s win32 branch reduces to
`taskkill /PID <pgid> /T /F`, which targets a LIVE pid + its live child tree; on
the abnormal `'close'` path the group-A leader has already exited, so both
`reapTree(child.pid)` and `reapGroup(child.pid)` target a gone pid and never reach
a surviving reparented group-A child — POSIX negative-pgid semantics save it,
Windows has no equivalent, so R4-B's fix is a no-op on win32 (and the escape
harness skips win32, so the merge-gate can't catch it).** Specs stayed `Draft`, so
revisions landed as edits. ADR-0030 unchanged this round (both findings are ordinary
correctness / platform scope, neither a new adversarial residual). One new Draft
follow-up WP was spun out to track the deferred Windows work. No WP crossed its size
cap (incident-runbook S; reap-mechanism M; escape-harness M; new windows-reap M).

## WP-a9-private-modes-repair (code)

- **APPROVE / shippable this round — not touched.** Codex returned no substantive
  finding; left exactly as-is.

## WP-a9-incident-runbook (docs)

- **R5-1 (ACCEPT, HIGH) — the catch-up stop only unregistered; `wienerdog sync`
  RESURRECTS the catch-up job before the drill / re-authorization.** The runbook's
  catch-up removal unregistered the OS task and (on macOS) deleted the LaunchAgents
  plist, but left the scheduler FILE reachable and, on both platforms, left the
  catch-up **manifest entry** in `install-manifest.json`. `sync`'s `reloadMissing`
  (`sync.js:197`) re-registers any entry whose file + manifest record survive — so
  the step-4 `wienerdog sync` (and again the step-6 drill's `sync`) would re-arm
  the catch-up job **before** the acceptance drill and step-7 re-authorization. This
  is cross-platform (all three reload commands exist), though the Windows stop text
  was weakest (it never deleted the `wienerdog-catchup.xml` file). Fixed: the
  catch-up stop now **deletes the scheduler FILE AND removes the catch-up
  `install-manifest.json` entry** (not merely unregister) — stated generally, with
  the exact macOS/Windows file paths and the manifest-edit called out — with a
  **blocking dual re-verify** that BOTH the OS registration AND the scheduler file
  are gone (plus no catch-up manifest entry) before proceeding; added an explicit
  statement at the step-4 `sync` that `sync` runs `reloadMissing` and must **not** be
  able to reactivate ANY schedule before step 7. Noted that named `schedule remove`
  already deletes a job's own file + drops its manifest entry (so a per-job-removed
  job can't be resurrected) — the gap is specifically the catch-up entry, which
  per-job `remove` deliberately leaves. Updated the Deliverables note, the
  Current-state catch-up bullet, step 1's catch-up sub-bullet, the step-4 `sync`
  bullet, two acceptance criteria, and the verification greps. WP stays docs-only, S.

## WP-a10-reap-mechanism (mechanism) + WP-a10-escape-harness (tests)

- **R5-2 (ACCEPT, HIGH) — the win32 `reapGroup` doc implied a working leaderless
  group kill it cannot deliver.** `taskkill /PID <pgid> /T /F` reaches only a live
  pid + its live tree; once the group-A leader (the middle) has exited on the
  abnormal-close path, win32 `reapGroup(child.pid)` reaches nothing and a plain
  surviving reparented group-A child leaks. POSIX's negative-pgid `kill(-pgid)`
  covers it; Windows has no equivalent, so R4-B's leaderless-member fix is a
  **no-op on win32**, and the win32-skipping escape harness can't catch it. This is
  **non-adversarial correctness / platform scope**, NOT an ADR-0030 adversarial
  residual. Owner decision: **POSIX-only guarantee this release; Windows reap
  DEFERRED, win32 kill-authority activation BLOCKED.** Concretely — (a) the
  leaderless-member reap-to-quiescence guarantee is **scoped to POSIX** (Linux
  `/proc`, macOS `/bin/ps`); (b) on **win32 the new group-reap authority MUST NOT
  activate** — the win32 abnormal-close path falls back to the existing pre-A10
  single-timeout `taskkill /T /F` behavior (no regression, explicitly documented as
  NOT providing the leaderless-descendant guarantee); (c) Windows post-parent-exit
  reaping is a **follow-up WP** (needs an absolute-path Windows authoritative
  process-table enumeration — `tasklist` / `Get-CimInstance Win32_Process`
  `ParentProcessId` walk — AND a **live** Windows merge-gate test; a skipped harness
  is not proof; **Job Objects explicitly OUT**). Applied to `WP-a10-reap-mechanism`:
  a new **Platform-scope** note in Context recording the owner-approved POSIX-only
  boundary (explicitly not an ADR-0030 residual), the `reapGroup` win32 JSDoc + the
  win32 prose corrected to state no leaderless-member guarantee, the run-job
  abnormal-close wiring bullet scoped to POSIX (win32 keeps pre-A10 behavior), the
  abnormal-close acceptance criterion scoped to POSIX + a new win32-platform-scope
  criterion, the reap.js/run-job.js Deliverables notes annotated, an Out-of-scope
  bullet + a verification grep added; WP stays M. Applied to `WP-a10-escape-harness`:
  the Live-test posture now states the win32 skip is an **accepted, owner-approved
  platform-scope boundary (POSIX-only merge-gate this release), not a hidden gap**,
  pointing at the follow-up for the live Windows gate; WP stays M.
- **New follow-up: `WP-a10-windows-reap` (Draft, epic audit-a10, size M, depends_on
  [WP-a10-reap-mechanism]).** Captures the deferred Windows work so the deferral is
  tracked, not lost: a win32 authoritative process-table reader (absolute-path
  System32 `Get-CimInstance`/`tasklist`, `exec-identity`-verified, never bare-name),
  a win32 **ppid-closure** descendant kill that reaches a leaderless reparented
  member post-parent-exit, run-job activation of the win32 group-reap authority, and
  a **live Windows merge-gate** test (`reap-windows.test.js`, runs on a Windows
  runner — a skip is not a pass). Job Objects explicitly out; ADR-0030 stays the
  boundary for the adversarial escapee only. Carries the same merge-gate discipline
  as the POSIX mechanism: no win32 activation until the live Windows test is green.

## Decision beyond the dispositions

- **None.** Both findings applied exactly as owner-dispositioned; the follow-up WP
  is the tracked landing of R5-2's deferral (b)/(c). ADR-0030 stays Proposed and
  unchanged — R5-1 is a runbook-mechanism correctness fix and R5-2 is ordinary
  per-platform scope, neither an adversarial residual. All existing WPs kept their
  sizes; the new WP is M.
