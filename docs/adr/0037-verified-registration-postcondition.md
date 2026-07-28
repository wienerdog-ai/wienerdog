# ADR-0037: A register that cannot verify what the OS now holds must not report success

Status: Accepted. OWNER-SIGNED 2026-07-28.
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
**not gated** — only `enable --now` (`schedule.js:466`) sets `loaded`; the block
is `schedule.js:457-466`. A
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
3. **An unverified entry is retried, not skipped, and the evidence is a LIVE
   READBACK, and it must cover the whole REGISTRATION, not one field of it.**
   The OS call may be skipped **only** when a read performed *at that moment* shows
   the OS holding what we would register — every field of it that can vary between
   two renders, not merely the command line.
   **A platform's verified skip covers exactly the fields its readback can
   compare, and those fields are enumerated per platform with the remainder named
   as a residual.** No platform may claim the general form of this obligation on
   the strength of a partial readback: macOS compares the loaded plist path, the
   program, the full argument vector, the log paths, the spawn type, the
   environment bindings and a **unique** calendar trigger — but **not**
   `RunAtLoad`, whose readback shape could not be established on any executed
   record, so a catch-up registration with `RunAtLoad` removed by hand would pass
   every compared field, be granted a verified skip, and silently stop running at
   login while continuing to fire hourly (bounded to a manually edited record —
   our renderer cannot produce it — and routed); Windows compares the executed
   command and argument line **only**, leaving triggers and settings unread; Linux
   can compare nothing and therefore never skips. Where a readback cannot reach a behaviour-bearing field, the honest
   options are to not skip, or to skip and record the exposure — never to describe
   the platform as fully conforming.
   **The readback is the whole of the evidence: file state is neither sufficient
   NOR necessary.** Not sufficient, because byte-identical files say nothing about
   what the OS loaded. Not necessary either — an earlier draft of this obligation
   made byte-identity a precondition, which meant a file rewritten for an incidental
   reason (a missing bookkeeping record) forced the replacement of a record that was
   already exactly right, putting a healthy schedule through a destructive path for
   no benefit. A live match is permission to skip on its own; file and bookkeeping
   convergence still happen, but they touch nothing the OS owns. A durable cache is explicitly **not**
   acceptable evidence: it is not written by every registration entry point, it
   cannot represent every platform's state, and it can record `loaded` for an
   entry the OS no longer holds (a crash between a teardown and its replacement
   leaves exactly that). Where no such readback exists for a platform, that
   platform does not skip. The fail-safe direction is redundant work, never
   silence.

**Precondition.** Registration is an **attended, single-invocation** operation.
Two concurrent registrations racing the same scheduler entry are outside this
decision: the OS loads whatever is on disk when it is asked, so a concurrent writer
can invalidate any readback taken moments earlier. No lock is introduced here —
the repository's only lock serializes dream runs, not registrations — and
obligation 3's "verify, don't assume" already requires the cheapest available
mitigation, a re-read after the mutating call — **checked, not assumed: that
obligation makes no distinction between a first registration and a replacement, so
it already binds every successful mutating call, and no new obligation was added
for the post-bootstrap verify.** Cross-process serialization is
routed separately.

## Consequences

- A `sync` that cannot establish what the OS holds now says so, every time,
  instead of once. The user-facing notice already exists
  (`schedule.js:583-585`); this decision makes it fire when it should.
- macOS registration may replace a loaded record, so it **must not leave an
  unbounded destruction window**: the prior schedule file's bytes are captured
  before they are overwritten, and if the replacement cannot be bootstrapped after
  a teardown, the prior file is restored and re-bootstrapped. The register still
  reports failure — a rollback restores the **prior state, healthy or not**; it
  does not make the replacement a success, and the retry loop is what carries the
  user forward. (Owner ruling, 2026-07-28. An earlier draft treated the destruction
  window as an accepted residual; that is superseded.)
- **The remaining data-loss window, stated exactly — this is what the owner's
  signature approves.** A rollback restores *the disk state that preceded the
  register*, which is the previous **registration** only when the previous register
  succeeded. The compound case that survives is: (i) a pre-existing divergent
  history — the OS holds record **A** while the disk holds a different plist **B**,
  which is what an earlier failed register leaves behind; **and** (ii) the freshly
  rendered plist **C** passes a `plutil -lint` preflight yet still fails to
  bootstrap (permissions, or launchd state). Then the teardown — authorized, since
  A was a positively established **FATAL** mismatch (it differs in the argument
  vector, the program, the calendar, the trigger set or the environment bindings —
  a record already failing to do its authorized job; one diverging only in a benign
  field such as its log paths, spawn type or source file is never torn down at all)
  — destroys **A**, and the rollback
  restores **B**, which may itself be unbootstrappable. **A is lost.** The outcome
  is loud (`loaded:false` plus the user-facing notice on every subsequent
  register), it is bounded to records that were **already failing** — not merely
  already different, which is a strictly narrower set than an earlier draft of this
  Consequence described — and the `plutil -lint` preflight removes the malformed-replacement
  cause, which is the likeliest one. It is **not** eliminated. Ratifying this ADR
  approves that specific window, not a vague residual.
- **The rollback is bounded, not total, and the bound comes from obligation 3.**
  Where the disk is already canonical and only the loaded record is stale, the
  captured bytes *are* canonical, so nothing can restore the record a teardown
  destroys. That is tolerable only because a verified skip compares every canonical
  field that can vary — so any record reaching a teardown is **already divergent**
  and already failing, never a healthy one. The remainder is loud and converges. A
  stricter rule (never tear down without an artifact proven to represent the loaded
  record) is rejected: it would forbid replacement in exactly the stale-record case
  this decision exists to fix.
- **Crash safety comes from the readback, not from the marker — say so plainly.**
  ADR-0018 decision 2's pre-destructive status refresh is retained as an
  **advisory** signal for `doctor`, and this ADR makes no promise about its
  contents. It cannot: the refresh reads the live probe *before* the teardown, so
  it can legitimately record `loaded`, and `refreshSchedulerStatus` swallows every
  write error and returns `void`, so no caller can know it landed
  (`WP-scheduler-status-write-observable` owns that gap). What actually recovers a
  process killed mid-replacement is obligation 3: the next registration re-reads
  the live state, finds it not matching, and re-registers. An earlier draft of this
  ADR promised a "pessimistic status record"; the mechanism never delivered it, and
  the promise is withdrawn rather than restated.
- Linux pays a `daemon-reload` and an `enable --now` on **every** registration,
  including one whose files did not change. Both are idempotent no-ops against an
  already-correct unit, and running them unconditionally is what removes the
  permanent silence after a degraded reload. Linux therefore has **no** verified
  skip: there is no readback of a loaded unit's *content* that could be specified
  and executed when this was written, and obligation 3 forbids skipping without
  evidence. A later WP may add one.
- "Idempotent" keeps its CLAUDE.md meaning — running twice changes nothing. What
  changes is the **call count** of a re-register: a verified skip costs one
  read-only readback (which is what Windows has always cost), and Linux costs two
  idempotent calls. Any test asserting *zero* calls on a re-register is asserting
  the old contract.
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

**RATIFIED 2026-07-28 — the owner's dated sign-off is in the `Status:` line at
the top of this file**, hand-typed by the owner in an explicit ratification pass.
The paragraphs below are the pre-ratification record, kept as provenance: this
ADR was written Proposed and unsigned, amends an owner-signed decision —
ADR-0018's status line records an owner sign-off dated 2026-07-26, described
here rather than reproduced — and required this explicit owner ratification
before the work package that depends on it could merge.

The signature slot is the `Status:` line at the top of this file. Ratification
replaces `Proposed` with the accepted form plus the owner's dated sign-off, in the
same shape ADR-0018's status line uses (again: described, not quoted). **No
ratification token is present in this file
and none may be added by an implementer, an agent, or a reviewer** — only the
owner may write it, and only in an explicit ratification pass.

Stated as a negative, in words, so it cannot be satisfied by pattern-matching:
this ADR has **not** been signed, it is **not** accepted, and nothing in this
repository should be read as evidence that the owner has approved it. An agent
that believes it may add the sign-off itself has misread this section.
