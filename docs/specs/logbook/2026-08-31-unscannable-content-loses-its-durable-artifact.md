---
title: Unscannable content lost its durable artifact — measured, and it is a regression, not a narrowing
date: 2026-08-31
related_wps: [WP-dream-promote-in-workspace, WP-dream-promote-module, WP-secret-fence-ep2-redact-arm]
---

# 2026-08-31 — unscannable content lost its durable artifact

**Subject:** `WP-dream-promote-in-workspace`, PR #55, round 1, item routed to the
architect. Tip measured: `42056d6`. Base: `152ae3a`.

**Status: OPEN — an OWNER DECISION, not settled here.** The measurement below is
settled; the disposition is not.

## The rule this entry applies

`docs/specs/logbook/2026-08-30-toctou-class-retired-with-its-cause.md` states it:

> **When a contract narrows a trigger, the record states the CAUSE that retired
> with it and NAMES where the protection now lives.** A narrowing recorded only
> as "these cases no longer fire" is indistinguishable, six months later, from a
> weakening nobody caught.

The TOCTOU move passed that test: an owner (Table H row **H5**), a rule, and a
named assertion. **This one does not pass it.** No owner, no assertion, and the
substitute that was written down in its place does not hold up when measured.

## What changed

| | Retired validator (`152ae3a:src/core/dream/validate.js`) | `promote()` today (`src/core/dream/promote.js`) |
|---|---|---|
| BINARY content | `reason` set, then falls through to the withhold arm's `quarantinePreserve(stateDir, vaultDir, rel, date)` — **durable copy in `state/quarantine/`** — then reverts | refused BEFORE `gates.secret` is called; `preserved` is `[]`. **No durable copy** |
| NON-LOSSLESS UTF-8 | reaches the same `quarantinePreserve` via the redact arm's fall-through — **durable copy** | refused BEFORE the gate; **no durable copy** |
| Transcript deferral | yes — the path counts as a `secretRevert` | yes — `disposition.withheld += 1` |

**The deferral is the same on both sides.** That is the measurement that settles
the substitution question: deferral was already there ALONGSIDE preservation in
the shipped design, so nothing was traded for it. It cannot be the thing that
replaced preservation, because it never replaced anything.

## Where the protection went — NOWHERE, measured four ways

1. **No code carrier.** `quarantinePreserve` appears in exactly one `.js` file
   (`src/core/dream/validate.js`) and is reached only from the EP2 gate's redact
   and withhold arms. Both run AFTER the refusal. The gate's own JSDoc states
   the ordering as a premise: *"`promote()` refuses binary and
   non-lossless-UTF-8 content BEFORE calling this gate, so both arms below may
   assume decodable text."*
2. **No spec owner.** Swept every WP in `docs/specs/` and `docs/specs/done/` for
   a row assigning preservation to unscannable content. The only hits are the
   RETIRED contract (`WP-123-staged-output-secret-gate`, "unscannable →
   quarantine-preserve, then revert") and the two rows that pin it in prose
   (below). `WP-dream-promote-module` says only *"A delta record marked binary,
   or carrying bytes that are not lossless UTF-8, is refused by EP2 with that
   reason"* — refused, and preservation is never mentioned for that class.
3. **No assertion — it was DELETED and a justification put in its place.** Both
   binary tests carried a byte-identical quarantine assertion at base
   (`152ae3a:tests/unit/dream-validate.test.js:1186-1188`, `:1207`, including
   the `0600` mode check). The migration replaced them with
   `assert.deepEqual(res.preservedFor(rel), [], 'the refusal precedes preservation')`
   and this comment, in both tests: *"Nothing was written to the vault to
   preserve FROM, and the brain's own copy rides the workspace, whose transcript
   defers and regenerates it."*
4. **A SHIPPED SECURITY CLAIM IS FALSIFIED BY THIS BRANCH.**
   `docs/THREAT-MODEL.md:124` says *"Staged content that is binary — and so
   unscannable — is withheld the same way as a quarantine-severity finding,
   fail-closed"*, and the quarantine-severity way it names is *"the flagged
   working-tree copy is first preserved into `state/quarantine/`"*. That
   sentence is TRUE on `main` today — `152ae3a:src/cli/dream.js` still calls
   `validateAndCommit` — and becomes FALSE the moment this package wires
   `promote()` in. It is not an incidental doc: it is pinned by rows **Q10** and
   **Q17** of the shipped `docs/specs/done/WP-secret-fence-ep2-redact-arm.md`,
   which require the threat model and the `validate.js` header comment to state
   the parenthetical **"(and unscannable binary content)"** in one voice, and
   which are mutation-covered there. **`docs/THREAT-MODEL.md` is not in this
   package's Deliverables table**, so no in-boundary change can repair it.

## Both stated substitutes fail on measurement

**"the transcript defers and regenerates it."** The deferral is **bounded at
three**: `SECRET_REVERT_MAX_DEFERRALS = 3` (`src/core/dream/ledger.js:30`).
On the fourth run `src/cli/dream.js` calls `recordSecretExhausted`, which writes
the transcript into the ledger with outcome `quarantined` and a **sticky skip**.
A binary note is binary deterministically, so it is refused every run: three
regenerations, then the transcript is retired and the bytes are gone for good.
A bounded retry of the SOURCE is not a durable artifact, and it does not survive
the source itself being retired.

**"Nothing was written to the vault to preserve FROM."** True of a PATH and
irrelevant to the act. Since the TOCTOU retirement, `quarantinePreserve` is
handed a **buffer** (`quarantinePreserve(stateDir, afterBytes, rel, date, kind)`)
— that was the whole point of the change. There is no path to preserve from and
there was never meant to be one; there are BYTES, and the sibling arm four lines
below preserves exactly those bytes for a hard-secret refusal.

**"brain-authored, never in the vault" does not distinguish the two.** It is the
strongest form of the argument and it is defeated by that sibling. Under
promotion, a hard-secret withhold preserves brain-authored workspace bytes that
were never in the vault. Same origin, same author, same "destroyed with the
workspace" fate — one gets a durable copy and a digest banner, the other gets
nothing. Whatever "brain-authored, never in the vault" is supposed to license,
this design already declines to take it for the adjacent class.

## What the user loses, concretely

The pending-review banner is driven by a **directory listing**:
`listSecretQuarantine` (`src/core/digest.js:854`) reads
`state/quarantine/`. No quarantine copy means no banner, ever. So an
unscannable note produces exactly one refusal line in one run's dream report and
then nothing — no artifact to inspect, no banner, no restore path — while the
hard-secret case beside it produces all three.

## One nuance in the other direction, recorded rather than smoothed over

For NON-LOSSLESS content the current code is **stricter in the refusal** than
what it replaced. In the retired validator the non-lossless check lived inside
the redact arm, so it only fired on a note that ALSO had a soft finding;
non-lossless content with no finding was committed. `promote()` refuses all
non-lossless content up front. That widening is a genuine improvement — and it
also means the class that never had preservation is now destroyed too. The
refusal got broader while the preservation went to zero.

## Verdict

**REGRESSION, not a narrowing.** A narrowing has a cause that retired with it
and a named home for the protection. Here the cause did not retire — unscannable
content is still unscannable, and the bytes are still the only copy — and the
protection has no home in code, no owner in any spec, and no assertion anywhere.

## The decision is the owner's, because the fix is a scope question

The refusal is at `src/core/dream/promote.js:1171-1179`. That file belongs to
`WP-dream-promote-module`, which is **Done**, and this package's Deliverables
table excludes it in load-bearing prose (*"`src/core/dream/promote.js` … are all
CONSUMED and none is modified"*). Four dispositions, and only the owner can pick:

| | Disposition | What it costs |
|---|---|---|
| **A** | **Restore the protection.** Preserve before refusing, for both classes. | Reopens a `Done` package: an amended Table D/Q row, `promote.js` added to this table, tests restored. `THREAT-MODEL.md:124` and rows Q10/Q17 stay true with no edit |
| **B** | **Move the refusal behind the gate** so the existing withhold arm preserves it. | Same reopening, plus it re-crosses the ordering the module spec argues for (the empty scan must never read as a pass) |
| **C** | **Accept the loss and RECORD it.** | Then `THREAT-MODEL.md:124` and rows **Q10**/**Q17** of a shipped `Done` spec must be amended in the same pass, and `docs/THREAT-MODEL.md` added to a Deliverables table. **An accepted residual that leaves the threat model asserting the retired behaviour is not accepted, it is hidden** |
| **D** | **Defer to a successor WP**, with C's amendments landing now. | The window between merge and successor is a window in which the shipped security claim is false. Naming the successor does not close it |

**A and B keep the claim true; C and D require the claim to be rewritten in the
same pass that lands them.** What is NOT available is merging PR #55 with
`THREAT-MODEL.md:124` untouched, because that sentence is false the moment the
pipeline is wired.

## The rule this entry adds

**The narrowing test has a second half: a protection has a HOME only if the
record can name an owner AND an assertion.** A comment in a test explaining why
the assertion was deleted is neither. It is the deletion, arguing its own case,
in the one place a reader would look for the check.
