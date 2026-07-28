# ADR-0037: A register that cannot verify what the OS now holds must not report success

Status: Proposed

Date: 2026-07-28

Amends ADR-0018 decision 2 (2026-07-25 amendment), which granted the
already-loaded-record replace capability to the **heal** path only. This ADR does
not edit that ADR; per `docs/adr/README.md` ("Accepted ADRs are immutable —
supersede with a new ADR, never edit"), it amends it from here.

## Context

`wienerdog sync` registers each scheduled job by writing a schedule file and then
calling the OS scheduler. Idempotency is keyed off the **file bytes**
(`ensureEntry`, `src/cli/schedule.js:170-191`): identical bytes plus a manifest
entry ⇒ `changed = false` ⇒ no OS call at all. Two platforms then report success
from a call that did not, and could not, change what the OS holds.

On **macOS**, a changed plist is followed by a bare `launchctl bootstrap`
(`schedule.js:315`, `:431`). launchd refuses `bootstrap` for a label that is
already loaded — ADR-0018's own 2026-07-25 amendment says so in those words — so
the file updates and the loaded record does not. The next `sync` finds identical
bytes, makes **zero** OS calls, and reports success while launchd still runs the
previous registration. Because the entry argv carries `--expect-digest`, a
`wienerdog update` can leave a loaded record bound to a stale digest that the
launcher then refuses at fire time, while `doctor` reports the entry `loaded`.

On **Linux**, `systemctl --user daemon-reload` is explicitly best-effort and
**not gated** — only `enable --now` sets `loaded` (`schedule.js:457-465`). A
degraded reload followed by a successful `enable --now` starts the timer from the
units systemd already had, so the stale unit keeps running while `sync` reports
success. One stderr warning is emitted at that sync and nothing thereafter,
because the next sync sees identical bytes and makes no call at all.

**Windows already does the right thing** and is the model for both fixes:
`ensureWindowsTaskRegistered` (`schedule.js:240-245`) skips the OS call **only**
when it has re-read the LOADED task and verified it equals canonical; in every
other state — including unreadable and unverifiable — it forces
`schtasks /create /f`.

The common defect is not platform-specific. It is that **file-byte idempotency was
treated as evidence about operating-system state.**

## Decision

A registration step reports success only from a call whose outcome is evidence
about what the OS now holds, and it never skips that call on the strength of file
bytes alone.

Concretely, three obligations, applied on every platform:

1. **Gate the reported `loaded` on the call that determines OS state** — not on a
   neighbouring best-effort call. On Linux that means `daemon-reload` joins
   `enable --now` in gating; a reload whose status cannot be established is a
   failure, not a warning.
2. **Registration may replace an already-loaded record.** ADR-0018 decision 2's
   restriction of that capability to the heal path is amended: the attended
   register path may use the same bootstrap-first primitive
   (`darwinReplaceEntry`), under the same non-destructive-first discipline —
   attempt `bootstrap`, and tear down only after launchd has proven the bootstrap
   blocked. Bootout-first remains rejected, for ADR-0018's original reason.
3. **An unverified entry is retried, not skipped.** Byte-identical files permit
   skipping the OS call only when the last durable status for that entry is
   `loaded`. Absent, unreadable, or any other status ⇒ attempt the registration
   again. The fail-safe direction is redundant work, never silence.

## Consequences

- A `sync` that cannot establish what the OS holds now says so, every time,
  instead of once. The user-facing notice already exists
  (`schedule.js:583-585`); this decision makes it fire when it should.
- macOS registration becomes potentially destructive, so ADR-0018 decision 2's
  pre-destructive durable-marker rule extends to it: refresh the status cache from
  the live probe before the first teardown, so a process killed mid-replacement
  leaves a pessimistic record rather than a stale `loaded` one.
- Linux pays one extra `daemon-reload` per registration even when nothing changed.
  It is idempotent and cheap, and it is what removes the permanent silence after a
  degraded reload.
- A persistently broken scheduler now produces work and a notice on every `sync`
  rather than one warning and then quiet. That is the intended trade: the failure
  is loud and attended instead of silent and unattended.
- This does **not** make the loaded record's execution position *comparable* in
  the adversarial sense; substituted-but-existing executables remain out of scope
  (`WP-scheduler-stable-exec-position`). This ADR is about honesty of the register
  step, not about authenticating what is registered.
- ADR-0018 decision 2 is otherwise untouched: bootstrap-first ordering, the heal
  set, and the durable-marker rule all stand as written.

## Owner signature

This ADR is **Proposed** and carries **no owner signature**. It amends an
owner-signed decision (ADR-0018 is marked `Accepted. OWNER-SIGNED 2026-07-26.`),
so it requires an explicit owner ratification before the work package that depends
on it may merge.

The signature slot is the `Status:` line at the top of this file. Ratification
replaces `Proposed` with the accepted form plus the owner's dated sign-off, in the
same shape ADR-0018 line 204 uses. **No ratification token is present in this file
and none may be added by an implementer, an agent, or a reviewer** — only the
owner may write it, and only in an explicit ratification pass.

Stated as a negative, in words, so it cannot be satisfied by pattern-matching:
this ADR has **not** been signed, it is **not** accepted, and nothing in this
repository should be read as evidence that the owner has approved it. An agent
that believes it may add the sign-off itself has misread this section.
