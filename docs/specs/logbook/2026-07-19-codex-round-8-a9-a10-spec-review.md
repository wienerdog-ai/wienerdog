---
date: 2026-07-19
title: Codex round-8 A9/A10 spec review
related_wps: [WP-a9-incident-runbook, WP-a10-reap-mechanism, WP-a10-escape-harness]
---

# Codex round-8 A9/A10 spec review (2026-07-19)

**Eighth Codex confirmation pass over the A9/A10 set. `WP-a9-private-modes-repair`
was APPROVED in round 5 and was NOT re-reviewed — left untouched. Five substantive
findings remained, all owner-ACCEPTed 2026-07-19. Every cited code fact was
re-verified against the current working tree before disposition: `src/core/paths.js:54`
resolves `home = env.HOME || os.homedir()` and `:55` `core = $WIENERDOG_HOME ||
<home>/.wienerdog` (so on Windows `HOME` is honored BEFORE `USERPROFILE`);
`src/cli/doctor.js:322` prints `core directory exists (<paths.core>)`, a
code-authoritative core-printing surface; `src/adapters/codex.js:106` and `:112` push
TWO unconditional info notices on every successful Codex sync; and the pre-revision
`reapGroup` returned `{reaped}` with a bounded poll but `run-job`'s abnormal-settle
silently proceeded on `{reaped:false}` (retaining a pidfile no later run ever reads).**
Specs stayed `Draft`, so revisions landed as edits. ADR-0030 stayed **Proposed** — one
residual bullet added, no status change. No WP crossed its size cap (incident-runbook
S; reap-mechanism M; escape-harness M).

## WP-a9-private-modes-repair (code)

- **APPROVED in round 5 — NOT re-reviewed this round.** Left exactly as-is.

## WP-a10-reap-mechanism (mechanism) + WP-a10-escape-harness (tests) + ADR-0030

- **R8-1 (ACCEPT, HIGH) — the final backstop silently completed on `{reaped:false}`,
  relying on a retained pidfile no later run ever reads; a live group could survive
  the job.** After R7-2, `run-job`'s abnormal-settle `reapGroup(brain.pgid)` returned
  a checked `{reaped}`, but on `{reaped:false}` `run-job` (the LAST backstop) still
  proceeded and "retained the pidfile for backstop retry" — hollow, because no later
  run reads another run's token pidfile, so a non-empty group (group A or the brain
  group) could outlive the job, violating the ADR-0004 "nothing survives the job"
  contract; and the escape harness's `{reaped:false}` case only asserted pidfile
  retention, not eventual quiescence. Owner ACCEPT with the **proportionate**
  resolution (NOT an infinite-retry hang). Applied to `WP-a10-reap-mechanism`: fixed
  the CONTRACT — on `{reaped:false}` `run-job` must NOT silently complete and must NOT
  rely on a never-read retained pidfile; it performs a **bounded FINAL escalation** (a
  bounded re-poll/re-kill of both the group-A pgid and the brain group) and, if a
  group is STILL non-empty, **FAILS LOUD** via the existing `failLoud` path (durable
  `state/alerts.jsonl` alert + `last_status:'error'`/`last_error_at` watermark) and
  surfaces a non-zero/error outcome, rather than certifying clean. Explicitly **NOT**
  an unbounded block-until-`ESRCH`: a D-state / uninterruptible-sleep process cannot
  be reaped by SIGKILL until the kernel returns, and blocking forever would itself
  violate ADR-0004's no-persistent-process spirit. Updated: the `run-job` Deliverables
  row (c), the `reapGroup` JSDoc return note (inner caller retains, final caller
  escalates+fails loud), the "Reap on every exit path" group-B backstop bullet + the
  best-effort caveat, the `scheduler-runjob.test.js` Deliverables note (assert
  `{reaped:false}` persisting across escalation drives `failLoud`+error outcome), a new
  R8-1 security-checklist item, a new R8-1 acceptance criterion, and two verification
  greps. WP stays M. Applied to `WP-a10-escape-harness`: added proof #5 — a
  seam-injected `reapGroup → {reaped:false}` early-return regression asserting run-job
  does a bounded final escalation then fails loud (never a silent clean completion nor
  an unbounded loop), on the POSIX gate — plus the Deliverables note, a Current-state
  sentence, an acceptance criterion, and a verification grep. WP stays M. Applied to
  ADR-0030 (residual only, status unchanged): a new **"Unkillable (kernel D-state)
  descendant"** honest-boundary bullet — a findable-but-unkillable member is beyond
  user-level supervision (same family as the adversarial full-detach and
  kill-induced-late-reparent boundaries), must never be silently leaked, is surfaced
  LOUDLY by the same final-backstop fail-loud, and its final closure belongs to A12
  alongside the other kernel-level residuals; mitigated meanwhile by A1.

## WP-a9-incident-runbook (docs)

- **R8-2 (ACCEPT, HIGH) — the resolved core lived only in a shell variable, but the
  runbook mandates a reboot that wipes it.** After R7-1's step-0 preamble, `$CORE` (and
  any one-shot `WIENERDOG_HOME`) does NOT survive the step-1 reboot, so post-reboot
  sync / memory-approve / evidence / drill / verification could silently run against
  the WRONG (default) core — re-introducing exactly the R7-1 bug. Owner ACCEPT. Applied:
  step 0 now **persists** the confirmed absolute core path durably OUTSIDE the core
  (a home-dir `wienerdog-incident-<date>-CORE-PATH.txt` record that survives reboot,
  plus an off-machine note); step 1, after the reboot, gains a mandatory sub-step that
  RE-RESOLVES the core (via `doctor`), RE-CONFIRMS it equals the recorded value,
  RE-EXPORTS `WIENERDOG_HOME` for the session, and re-verifies the config/state/manifest
  triple; and every post-reboot CLI command runs with that explicit `WIENERDOG_HOME`.
  A new R8-2 acceptance criterion and verification grep; the CORE-PATH record is filed
  into the step-2 evidence folder.

- **R8-3 (ACCEPT, HIGH) — several operative paths were still RELATIVE.** The
  `state/digest.md` delete, the `state/quarantine/` review, the sync description, and
  the `state/schedule.json` snapshot all named `state/…` without the resolved `<core>`,
  so they resolve against the current working directory and a precise follower could
  delete/inspect the wrong file while the real compromised core artifact is untouched.
  Owner ACCEPT. Applied: every operative occurrence now uses the explicit resolved path
  — `$CORE/state/digest.md`, `$CORE/state/quarantine/`, Windows `$core\state\…` — plus
  a general Exact-contract rule, a new R8-3 acceptance criterion, and a **forbid** grep
  that fails if any bare relative `state/<file>` token appears in the runbook (cautions
  use an ellipsis `state/…`, not a concrete filename).

- **R8-4 (ACCEPT, HIGH) — the Windows default-core formula did not mirror the code
  order.** Step 0's Windows resolution used `$env:USERPROFILE\.wienerdog`, but the code
  resolves home as `env.HOME || os.homedir()` (`paths.js:54`), so on a Windows box with
  `HOME` set but `WIENERDOG_HOME` empty the runbook and CLI would target DIFFERENT
  cores and the confirmation could falsely pass. Owner ACCEPT, verified against code.
  Applied: step 0 now **reads the core from `wienerdog doctor`** — which prints `core
  directory exists (<getPaths().core>)` (`doctor.js:322`), guaranteed to match what the
  CLI acts on — and cross-checks it against the exact code-mirrored order
  (`WIENERDOG_HOME` → `HOME` → platform homedir → `.wienerdog`), with `HOME` tried
  BEFORE `USERPROFILE` on Windows. Updated the Current-state note, step 0, the
  Deliverables note, the R7-1 acceptance criterion (now R7-1/R8-4), and a new R8-4
  verification grep.

- **R8-5 (ACCEPT, MEDIUM) — the R6-1 "clean sync with NO notice" check could never
  pass on Codex.** `codex.js:106`/`:112` unconditionally emit two info notices (the
  `/hooks` hook-trust notice, the skills-aren't-slash-commands notice) on every
  successful sync, so a gate that requires the absence of ALL notices is impossible to
  satisfy on a Codex install. Owner ACCEPT. Applied: the managed-block integrity gate
  now blocks ONLY on concrete integrity failures — non-zero sync exit, "managed block
  not updated"/out-of-sync, missing digest, a skipped installed adapter, or a shadowing
  `AGENTS.override` — while the two constant Codex info notices are EXPLICITLY allowed.
  Updated the step-6 first managed-block check, the three-check descriptions
  (Deliverables + step-6 heading + the do-not-byte-compare rationale), a new R8-5
  acceptance criterion, and a verification grep.

- **Endgame dry-run gate (owner-directed, added).** A new acceptance criterion: before
  this WP leaves Draft the runbook must be DRY-RUN validated end-to-end against three
  configurations — a clean Claude-only install, a clean Codex-only install, and a
  custom-`WIENERDOG_HOME` install (with `HOME` set on Windows) — each walked step 0 →
  reboot → sync → drill → re-authorize, confirming correct core resolution (matching
  `doctor`, persisted CORE-PATH survives the reboot), no false catch-up resurrection,
  and a passing (notice-tolerant) managed-block gate, with the evidence pasted into the
  PR.

## Decision beyond the dispositions

- **None.** All five findings applied exactly as owner-dispositioned. ADR-0030 stays
  Proposed and unchanged except for the added D-state residual bullet — R8-1 is a
  correctness fix to the final-backstop completion contract (with the unkillable case
  named as the residual it always was), R8-2/R8-3/R8-4 are runbook path-resolution and
  reboot-persistence correctness, and R8-5 is a notice-tolerance correction; none is a
  new adversarial residual. Sizing re-checked: `WP-a9-incident-runbook` stays **S** —
  it remains a single docs-only runbook (plus the one cross-link); R8-2/R8-3/R8-4
  refine the step-0/step-1 core-resolution prose and R8-5 adjusts one check, adding no
  new deliverable file. The endgame dry-run gate adds real verifier effort (standing up
  three installs), but that is a validation activity, not additional authoring surface,
  so the implementation sizing is unchanged. `WP-a10-reap-mechanism` stays **M** — R8-1
  adds a bounded final-escalation branch + a fail-loud call at one existing settle site,
  reusing the already-specified bounded `reapGroup` poll and the pre-existing `failLoud`
  path; no new file, authority, or cross-cutting seam. `WP-a10-escape-harness` stays
  **M** — one seam-injected control-flow regression added to the existing harness.
  `WP-a9-private-modes-repair` untouched (already approved round 5).
