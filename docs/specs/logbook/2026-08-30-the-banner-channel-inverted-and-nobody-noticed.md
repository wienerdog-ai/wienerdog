---
date: 2026-08-30
title: The banner channel inverted from over-rendering to zero rendering in three days, and the same single point of failure caused both
related_wps: [WP-launcher-refusal-banner, WP-refusal-banner-delivery, WP-shim-recovery-message, WP-launcher-alert-bound]
---

# The banner channel inverted from over-rendering to zero rendering in three days, and the same single point of failure caused both (2026-08-30)

**What the previous entry measured.** On 2026-08-01
(`2026-08-01-a-correct-refusal-that-repeats-is-a-different-defect.md`) the defect
was **over**-rendering: 119 durable alert records, 118 identical, one per hour, and
a digest banner telling the owner on every single session start for six days that he
might be compromised and should reinstall. Every record was correct. The fix that
survived was `wienerdog alerts ack` — an owner-attended, typed terminal
confirmation that suppresses the **re-rendering** of one already-seen `(job, reason)`
pair. That entry's own framing was that the open door "changes a different noun":
the problem was never verification, it was rendering.

**What was measured today.** The same install, the same refusal, twenty-nine days
later: `state/digest.md` was dated **2026-08-02 19:11** and had not been rewritten
since. The banner rendered **zero** times in four weeks. `alerts.jsonl` had grown to
**433 KB** — roughly five times the 2026-08-01 measurement — and was still being
appended to hourly. The owner learned about it from a user report, not from the
system.

The inversion took three days. On 08-01 the channel was shouting; by 08-05 it was
silent; nothing about the failure changed in between. What changed is that the
**dream stopped succeeding**, and the dream is one of only two writers of
`digest.md`.

**Why both failures have one cause.** The digest is the only banner channel, and
only `sync` and `dream` can produce it. `wienerdog alerts ack` fixed the case where
a writer keeps running and re-renders a stale truth. It could not touch the case
where no writer runs at all. Both are the same single point of failure observed from
opposite sides, and an acknowledgement mechanism is structurally incapable of
noticing the second one — a suppressed banner and an unrendered banner are
indistinguishable to everything downstream.

**The part that should have been caught by reading, not by a user report.** The
refusal text promises, verbatim, *"This alert will appear in your next digest."*
That promise was never true for this refusal class, and the code says so plainly:
`refuse()` lives in `src/scheduler/launcher.js`, runs before `run-job` is ever
spawned, and never calls `renderDigest`. It **cannot** call it — the launcher
deliberately requires no code from the tree it is verifying, which is exactly why
`appendRefuseAlert` is a hand-written duplicate of the app-side alert writer sitting
right next to it. The duplicate is a comment-documented signal that the launcher
cannot reach app code, and the sentence promising digest delivery sits about eighty
lines above it. Two adjacent, individually correct pieces of code, and the promise
between them was never checked against the mechanism.

**The second dead leg, which nobody had looked for.** GLOSSARY defines **fail-loud**
as "alert email (`gws _alert`) **or** a banner line in the digest" — an *or*, which
reads as redundancy. At launcher stage both legs are dead. The email path
(`defaultSendAlert` in `src/cli/run-job.js`) spawns `gen.wienerdogBin(paths)`, the
shim at `~/.local/bin/wienerdog`, which is `exec node "$HOME/.wienerdog/app/current/bin/wienerdog.js"`
— unusable precisely when `app/current` is the thing that failed. And the launcher
never reaches `run-job.js` anyway. An *or* between two channels is only redundancy
if the failure modes are independent; here a single dangling symlink took out both,
plus `sync`, `alerts`, `doctor` and `dream`, all of which route through that same
shim and died with a raw `MODULE_NOT_FOUND`. The owner could not list the alerts
that were being recorded for him hourly.

**The lesson worth keeping.** When a mechanism's job is to tell a human something,
"is the message correct?" and "will the message arrive?" are separate questions with
separate failure modes, and the second one is the one nobody writes a test for. The
2026-08-01 entry answered the first exhaustively — remedy classes, forgeable
signals, ADR-0028 §3 — and the delivery path was assumed throughout. Worth stating
as a rule: **a fail-loud channel must be verified from the stage that will actually
use it, not from the stage that is convenient to test.** The launcher's refusal path
had no test that asserted a human-visible artifact existed afterwards, because the
artifact it promised was produced by a different process entirely.

**Recorded, not fixed here.** The 2026-08-01 entry already flagged that
`appendRefuseAlert` is the only writer of `alerts.jsonl` with no record or byte
bound, and withdrew the obvious repair because collapsing consecutive identical
records would make `formatAlerts` understate a genuine 118-failure streak. That
defect is now four weeks older and 433 KB large. The non-lossy repair — a `count`
field in the record schema, so the bound and the honest count can coexist — is
specified as `WP-launcher-alert-bound` rather than deferred again.

**Incident status.** Resolved on the maintainer's machine the same day by running
`sync` from the real checkout (dev stance), which repointed `app/current` and
regenerated the digest. The structural defects are unaffected by that repair and are
the subject of ADR-0039.
