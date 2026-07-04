# ADR-0014: Dreaming is scheduled by default when a vault is created

Status: Accepted (amends ADR-0008)
Date: 2026-07-04

## Context

ADR-0008 set the posture "nothing is scheduled by default" and routed all
scheduled jobs through the opt-in **routine catalog** (`/wienerdog-routines`),
including the daily digest. That posture was written when every scheduled job
was an optional "quick win." Dreaming is different: it is the mechanism that
turns sessions into durable memory — the product's core value. A Wienerdog with
a vault but no dream schedule silently never learns; the user sees a static
memory and concludes the product does nothing. The owner has reclassified
dreaming from optional routine to integral core.

## Decision

The moment a vault first exists — at the end of the `wienerdog init
--fresh-vault` path **and** at the end of `wienerdog adopt` — Wienerdog
**silently schedules the nightly dream at 03:30 local time. No prompt.** The
install/adopt summary output states plainly that dreaming was scheduled and how
to change or disable it (the routine catalog `/wienerdog-routines`, or
`wienerdog schedule remove dream`).

- **Idempotent.** If a `dream` job already exists, this is a no-op (no second
  schedule, no reload).
- **Manifest-tracked and reversible.** The schedule is recorded exactly as
  `schedule add` records it (a `scheduler-entry`); `uninstall` reverses it.
- **Catch-up already applies** (WP-020): a dream missed while the machine was
  off runs on next login/timer.
- **Degrades, never breaks.** On a platform where scheduling is not yet
  supported (Windows today, or a non-systemd Linux), vault creation must **not**
  fail: Wienerdog prints a plain-language notice that dreaming could not be
  auto-scheduled and how to run it, then completes normally.

This amends ADR-0008: **dreaming is now the single exception to "nothing
scheduled by default."** Every catalog routine (daily digest, inbox triage,
weekly review) and every Google-touching job stays opt-in through the catalog,
exactly as before.

## Consequences

- A fresh or adopted vault starts accumulating memory automatically the first
  night — the product demonstrates its core value without a configuration step.
- The default behavior now writes an OS scheduler entry at vault-creation time;
  this is covered by the existing manifest/uninstall machinery, so
  install→use→uninstall still leaves only the vault (M7 acceptance holds).
- ADR-0008's "spectacular first win" framing still holds for catalog routines;
  dreaming is simply promoted out of the catalog into the default path.
- ADR-0004 is unchanged: the dream runs as a short-lived OS-scheduled job; auto-
  scheduling it starts nothing that outlives the job.
