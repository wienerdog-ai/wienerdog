---
date: 2026-09-17
related_wps: [WP-dream-live-owner-lock, WP-dream-lock-stale-owner-loud]
---

# A residual accepted in one clause was a silent failure mode

## What happened

`WP-dream-live-owner-lock` shipped in PR #245 and correctly stopped the dream
from stealing an expired lock whose local owner is still alive. Its Table L4
accepted one residual in a single sentence: *"A reused PID pointing at an
unrelated live process conservatively blocks recovery."*

The sentence is true and the review rounds passed it. What none of them asked is
**how the user finds out**. In `src/cli/dream.js` a `busy` decline prints one
line and returns, so the process exits 0; `src/cli/run-job.js` then writes
`last_success`, calls `clearAlerts` and leaves `state/digest.md` showing a
healthy job. So the blocked recovery is not merely conservative — it is
invisible, it survives every later nightly and hourly catch-up run, and the only
symptom is a vault that quietly stops growing.

Before PR #245 an expired lock was always stolen, so the same crash self-healed
at the next run. The regression is not in the liveness rule; it is that the rule
turned a self-healing state into a terminal one without moving it onto a
reporting channel.

## The reusable lesson

When a work package accepts a residual, ask the second question in the same
breath: **if this residual fires, what does the user see?** A residual whose
only observable is the absence of work is not conservative, it is silent, and
silence has to be designed in deliberately rather than inherited from whichever
branch happened to `return` instead of `throw`.

This is the same shape as a false-green assertion (ADR-0042): the system reports
success in exactly the state where the work was never done. Here the reporting
surface was the process exit code rather than a test assertion.

## Disposition

`WP-dream-lock-stale-owner-loud` is drafted against this. It keeps the liveness
rule, adds a boot-time death proof so a rebooted machine self-heals again, and
puts a bound past which a `busy` decline raises through the existing
job-failure path. Nothing here is implemented; the work package is `Draft` and
carries owner items that must be settled before it can be dispatched.
