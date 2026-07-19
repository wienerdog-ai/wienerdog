# ADR-0030: Bounded user-level process supervision — reap the findable descendant tree to quiescence; adversarial full-detach is A12

Status: Proposed
Date: 2026-07-19

> **OWNER-APPROVED IN PRINCIPLE (2026-07-19).** In the A10 Codex round-1 review
> the owner ratified this decision *in principle*: the nightly supervisor reaps
> the **findable** descendant tree to quiescence and does **not** claim closure
> against an adversarially full-detaching native process — that residual is
> A12's, mitigated meanwhile by the A1 hermetic runtime profiles. Following the
> ADR-0028 flow, this ADR stays **Proposed** until the owner ratifies it at the
> `Ready`-flip of the A10 WPs that cite it; a later WP ruling that changes a
> detail here lands as a dated amendment (the ADR-0024 convention). The A10 WPs
> (`WP-a10-reap-mechanism`, `WP-a10-escape-harness`) are the per-file
> design-of-record; this ADR is the durable boundary they cite instead of an
> in-spec residual note.

## Context

Wienerdog runs its nightly **dream** (memory consolidation) as a short-lived
scheduled job. **IRON RULE (ADR-0004): Wienerdog is just files** — a job's
children must **never** outlive it. The 2026-07-15 security audit action **A10**
("one supervisor/process group and reliable timeout cleanup") requires that
after a timeout no descendant of the job remains, including `setsid`/double-fork
escape attempts.

The scheduled `builtin:dream` path has **two nested, independently-detached
watchdogs**: the outer `run-job` supervisor spawns `dream.js` detached in its own
process group ("group A"); `dream.js` spawns the real `claude` brain **detached
again** in a *different* group ("group B") with its own inner watchdog. An
outer `kill(-A)` never reaches the brain in group B; and if the middle `dream.js`
process dies for any reason, its inner watchdog's timer dies with it and the
brain (group B) is orphaned and keeps running past the deadline (WP-a10 code
analysis, verified 2026-07-19: `run-job`'s `done` promise resolves on child
`'close'` and the `finally` clears the watchdog timer, so a middle-process death
currently fires **no** cleanup at all).

A single **user-level** supervisor can only find a descendant by two authoritative
signals: the **parent-process (`ppid`) ancestry** chain, and the **process
groups** that its descendants belong to. A process that **both** `setsid`s into a
new session/group **and** double-forks so it fully reparents to `init`/`launchd`
is, by construction, in **no** descendant group and is **no longer** a
ppid-descendant — it is indistinguishable from arbitrary same-user background
code and is unreachable by any user-level reap. This ADR fixes the reap's
findability guarantee and states that unreachable class honestly rather than
booking it as a silent per-spec residual.

## Decision

**1. Reap the findable descendant tree to quiescence.** The supervisor's cleanup
primitive (`src/core/reap.js`) reaps, on POSIX, (a) every transitive
`ppid`-descendant of the supervised pid and (b) every process group that any such
descendant belongs to, then **re-snapshots and re-kills in a bounded loop until
two consecutive sweeps observe zero remaining descendants** (a fork occurring
between snapshot and kill is caught on the next sweep; the loop is capped so it
never spins unbounded). This replaces single-snapshot reaping and closes the
snapshot→kill TOCTOU for every process the supervisor can find. On win32 the OS
PID-table `taskkill /T /F` remains the primitive.

**2. Read the process table from an authoritative source, never a PATH-resolved
binary.** The nightly job PATH deliberately front-loads the user/agent-writable
`~/.local/bin` (ADR-0009), so a bare-name `ps` is the exact
executable-injection class ADR-0028/WP-154 closed — and worse here, because the
resolved binary is used as a **kill** authority. The reap therefore reads the
process table from Linux `/proc` directly (no external binary) and, on
macOS/BSD, from the **absolute, SIP-protected** `/bin/ps` verified structurally
before spawn (reusing the WP-154 `exec-identity` verification: regular file,
owner ∈ {current, root}, no group/other-writable ancestor). A `ps` planted
earlier on PATH can never be the reaper.

**3. Bound the guarantee — full closure for findable trees; adversarial
full-detach is A12.** The reap is a **total** guarantee for the process classes a
user-level supervisor can find: a plain child tree, a child re-detached into its
own process group (the dream-brain leak), a `setsid` child (new session, `ppid`
intact), and a double-fork-no-`setsid` child (reparented to init, group
retained). It is **not** a claim against a process that combines `setsid` **and**
double-fork to fully detach — that escapee is beyond user-level supervision.
Wienerdog does not leave that gap unmitigated: the dream **brain is hermetically
contained (A1, ADR-0025): it has no Bash/shell**, so it cannot `fork`/`setsid`
anything, and the combined escapee cannot be produced by the contained job.
Final closure of arbitrary same-user native code is **audit A12's** territory.

No sentence anywhere (docs, README, VISION) may claim the scheduled run is
tamper-proof against same-user native code, or that the reap defeats a full
setsid+double-fork detach.

## Honest boundary (the A10 residual)

- **Findable classes: closed.** After a timeout — or after the middle `dream.js`
  dies while the brain lives — the supervisor reaps the brain and every reachable
  descendant to quiescence, whichever watchdog fires and even when none does
  (the outer supervisor learns the brain's pid/pgid before the middle can die,
  so it can reap a reparented orphan). This is proven by the live escape harness,
  not by argv assertions.
- **Combined `setsid`+double-fork full-detach: open, mitigated, deferred.** The
  escapee is in no descendant group and has no ppid ancestry to the supervisor;
  it is the documented residual, mitigated by A1 (the contained brain has no
  shell to create one) and handed to A12 (arbitrary same-user native code).
- **PID reuse.** The handed-up brain identity is reaped by its **process group**
  (`kill(-pgid)`), not by a bare pid, so an unrelated process that happens to
  reuse the brain's exited pid is not group-killed unless it deliberately joined
  that pgid — an astronomically unlikely, self-inflicted case. The narrow window
  is a stated, accepted residual.

## Consequences

- The nightly supervisor's cleanup reaches descendants that re-detached or
  `setsid`'d, and reaches a reparented orphan after a middle-process death — the
  defining A10 gap for unattended use — while starting nothing that outlives the
  job (ADR-0004): the reap is verify-then-kill logic at existing spawn sites.
- The reap never trusts a PATH-resolved binary as a kill authority; adding a new
  supported OS means adding an authoritative process-table reader, not shelling a
  bare tool.
- The A10 guarantee is stated as a **bound**, not an absolute: reviewers and docs
  can point at one durable record for "what the supervisor does and does not
  promise," and the combined full-detach escapee is an explicit A12 hand-off
  rather than a residual re-litigated per spec.
- Accepted cost: the reap's quiescence loop and process-table read run on every
  timeout/abnormal termination; both are bounded and best-effort, and a failed
  read degrades to the legacy group-kill so the watchdog always still raises its
  timeout error.

## Relations to prior ADRs

- **Completes ADR-0028 / WP-141's "single timeout authority" (A7).** `run-job`
  stays the timeout authority; this ADR makes its kill reach re-detached
  descendants and adds the cross-process brain-pid hand-up. It introduces no new
  timeout owner.
- **Reuses ADR-0028 / WP-154 executable-identity verification** for the macOS
  `/bin/ps` reaper — the same structural checks, applied to the reap's own tool.
- **Depends on the ADR-0025 (A1) hermetic runtime profiles** as the mitigation
  for the unclosable residual: the contained brain has no shell, so it cannot
  produce the combined full-detach escapee.
- **Honors ADR-0004 (no-daemon invariant).** The reap is files and
  verify-then-kill logic; nothing added here outlives its job.
