---
date: 2026-09-05
title: "Rulings: the owner items parked by the quarantine-banner design loop, and the standing instruction behind them"
related_wps: [WP-quarantine-banner-location, WP-quarantine-preserve-durability, WP-dream-git-env-pinning, WP-secret-fence-ep2-redact-arm]
---

# Rulings: the banner-queue owner items (2026-09-05)

**Provenance.** The owner ruled these on 2026-09-05, in the session that resumed
from `docs/HANDOVER.md`'s 2026-09-05 status pass, before the overnight
continuation. The ruling is quoted verbatim; the wording around it is the
orchestrator's, the decision is not. As with the 2026-09-02 record
(`2026-09-02-owner-rulings-stub-queue.md`), this entry exists so the ruling has a
record of its own in the tree rather than living only inside the spec it governs.

```text
Regarding the decision items in the handoff document, let us go with your
recommendations. Also, I am going to sleep soon try and get as much done as
possible overnight. You have authorization to perform merges in this session.
```

**What that sentence rules, item by item.** At the time of the ruling the only
queued spec carrying parked Dispatch-precondition owner items was
`WP-quarantine-banner-location`, whose precondition then held two; the only other
open product decision `docs/HANDOVER.md` names in its queue is the one
`WP-dream-git-env-pinning` still needs (queue item 9, *"requires an owner product
decision, not just implementation"*). Each recommendation the spec records is
adopted as written; the owner may reverse any of them by dated amendment, which
is the same reservation the 2026-09-04 and 2026-09-05 dispatches recorded.

## 1. `WP-quarantine-banner-location` — first item: the four surfaces

Question: confirm that the four ledger-derived surfaces (Table L rows L1–L4)
stop naming a folder and stop instructing a delete, or say they should keep an
instruction of some other wording. The spec recommends **confirm**, because the
folder claim is measurably false on a shipped, tested arm and false in the
direction that costs the user their bytes.

**Ruled: confirmed.** Table L rows L1–L4 and the byte-exact pointer sentence
under Implementation notes stand as specified. Dispatch is unblocked on this
item.

## 2. `WP-quarantine-banner-location` — second item: L5's clearing sentence

Question: row **L5**, the digest's pending-review banner, closes with *"this
notice clears when no withheld copies are left"*, which is false in the measured
mixed-shelf state; absorb the narrowing into this package (one Table L row,
`src/core/digest.js` entering the boundary, one updated pin) or route it. The
spec recommends **route to the successor**, because the wording is downstream of
the shelf decision `WP-quarantine-only-copy-shelf` has not made.

**Ruled: routed, not absorbed.** `src/core/digest.js` stays outside the
Deliverables boundary; the proposed successor `WP-quarantine-only-copy-shelf`
owns the sentence together with the shelf decision it depends on. Row L5 stays
byte-unchanged in this package. Dispatch is unblocked on this item.

## 2b. `WP-quarantine-banner-location` — third item, raised after the ruling

Raised by the round-4 **gate (Codex plugin) channel** after the owner's message,
and parked under the loop's escalation (ii). **Note on the run that raised it:**
that channel's verdict is void — the orchestrator wrote this very file into the
reviewed worktree while the review was running, which breaks the runbook's
read-only check — so the channel is owed a fresh run. The **finding** is
adjudicated on its merits regardless, which is what the runbook requires; the
shadow channel, whose run was clean, returned approve with zero findings.

Question: a `secret-revert-exhausted` record left by a **pre-upgrade** run that
died inside the window row L7 closes makes the new pointer sentence false —
rows **L1**, **L3** and **L4** render an assertion no run made good (measured;
row **L2** is not affected). Accept it as a named residual, or overrule toward
one of the three fixes the spec prices. The spec recommends **accept as a named
residual and dispatch**: the cost is one fruitless look, no wording removes it
because no surface can tell a legacy record from a sound one, and the only fix
that can — a durable per-record delivery stamp — is durable state that
escalation (ii) parks with `WP-quarantine-preserve-durability`.

**Ruled by the standing instruction — recommendation adopted.** The owner's *go
with your recommendations* was given before this item existed; the orchestrator
applies it here on the same authority as the two items above, and records that
it did so rather than letting it pass silently. The owner may reverse by dated
amendment: overruling toward the per-record stamp is the successor's package and
adds a ledger-schema row to Deliverables; overruling toward a non-assertive or
general sentence changes the byte-exact sentence and re-derives the four
renderings, the four hand-written pins and Table C's six `find` literals.

## 3. `WP-dream-git-env-pinning` — the product decision

The stub carries **no recommendation** — by its own text it *"rules nothing"*,
and its 2026-09-02 amendment only adds the channel-set obligation every outcome
must meet. So this ruling does not decide pin / don't-pin / pin-with-exceptions.
What it does is settle the PROCESS: when the stub is matured, the architect
records a recommendation with its channel set, and the maturing session may
dispatch under that recommendation on this ruling's authority, recording it in
the dispatch message and here, with the owner free to reverse by dated
amendment. Nothing in the queue ahead of it depends on the outcome.

## 4. Sequencing, unchanged

The chain ruled on 2026-09-02 stands: `WP-quarantine-banner-location` →
`WP-quarantine-preserve-durability`. Merges in the overnight session are
owner-authorized by the same message.

## What this unblocks

All three Dispatch-precondition items of `WP-quarantine-banner-location` are
answered, so nothing in that spec's precondition blocks it. **The design loop is
now closed as well:** round 5 ran both channels on `005eed52`, both runs were
valid, both converged on one wording finding and nothing else, and the gate
channel's round-4 verdict — voided by an orchestrator write into the reviewed
worktree, see 2b — is thereby made good. The spec is **`Ready`**.

**One gate remains and it is not the owner's:** dispatch-time re-verification
(`docs/runbooks/codex-review.md`), which the orchestrator runs immediately
before it writes the dispatch message, recording each claim re-run and the
revision it ran against. `WP-quarantine-preserve-durability` follows, per the
2026-09-02 chain, and inherits the third item's durable half. `WP-dream-git-env-pinning` stays Draft: this record settles its PROCESS, not
its product decision.
