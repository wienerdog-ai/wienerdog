---
date: 2026-09-05
title: "Rulings: the eight owner items of the quarantine-durability design loop, and the standing instruction behind them"
related_wps: [WP-quarantine-preserve-durability, WP-quarantine-disposal-durability, WP-quarantine-banner-location, WP-preservation-abort-widening, WP-secret-fence-ep2-redact-arm]
---

# Rulings: the durability-queue owner items (2026-09-05)

**Provenance.** These are ruled by the owner's standing instruction of 2026-09-05,
recorded verbatim in `2026-09-05-owner-rulings-banner-queue.md` and quoted again
here so this record stands on its own:

```text
Regarding the decision items in the handoff document, let us go with your
recommendations. Also, I am going to sleep soon try and get as much done as
possible overnight. You have authorization to perform merges in this session.
```

The wording around the ruling is the orchestrator's; the decision is not. As with
the 2026-09-02 and the banner-queue records, this entry exists so the ruling has a
record of its own in the tree rather than living only inside the spec it governs.

**What is being ruled.** `WP-quarantine-preserve-durability`'s Dispatch
precondition carries **eight** items. Its own heading states the rule they were
written under: *accepting all eight recommendations changes no Deliverables row*.
Each item below gives the question in one sentence, the recommendation the spec
records, the ruling, and the cost of overruling it in one line.

**Items 1–4 existed when the ruling was given. Items 5–8 did not.** They were
parked by the design loop's **escalation (ii)** — *a finding whose only honest fix
adds durable state beyond the artifact, changes a shipped `best-effort` removal
posture, changes an owner-ruled value, or depends on a measurement on a Windows
host is PARKED* — at rounds 2, 4, 6 and 9 respectively, all after the owner's
message. **The orchestrator applies the standing instruction to them on the same
authority as items 1–4, and records that it did so rather than letting it pass
silently.** The owner may reverse any of the eight by dated amendment.

## 1. The platform scope

Question: are the flushes POSIX-only, with an explicit `process.platform === 'win32'`
branch that issues none and claims no durability? Recommendation: **yes** — a
half-protocol is worse than a stated absence, nothing here was measured on win32,
and this is the repo's own owner-approved win32 posture (`src/core/private-fs.js`).

**Ruled by the standing instruction — recommendation adopted.** Table F row **F5**
stands as written. **Overrule cost:** it makes an unmeasured Node behaviour
load-bearing on a platform this pipeline cannot test, and fail-closed — if
`fs.fsyncSync` behaves differently there, every dream run that withholds a note
aborts on Windows. It needs a measurement on a Windows host first.

## 2. A flush failure becomes a preservation failure

Question: confirm that a flush which does not complete is a preservation FAILURE
reaching the shipped only-copy abort, so a run that today reports a preserved copy
will abort instead on a filesystem where the flush errors. Recommendation:
**confirm**, on the owner's own 2026-09-02 *"fail-loud confirmed"*.

**Ruled by the standing instruction — recommendation adopted.** Row **F4** stands;
this adds one more way to reach `quarantinePreserve` returning `null`, which Table P
row P0 already carries — no new abort, no new message, no new field. **Overrule
cost:** the alternative — report success and note the failure somewhere — has no
carrier; the preservation record's fields are fixed by `WP-dream-promote-module`
Table Q row **Q9**, and adding one here is exactly the second-carrier move Q9
forbids.

## 3. The per-record delivery stamp, routed here by the banner package

Question: is a durable per-record delivery stamp on the transcript ledger worth
carrying so a surface can tell a record whose run delivered from one whose run did
not? Recommendation: **DECLINE permanently, and file no successor** — the class
cannot grow, its cost is one fruitless look, and **a stamp added later does not
separate the classes**, because records written between the banner package landing
and a stamp landing are sound-and-unstamped.

**Ruled by the standing instruction — recommendation adopted.** No successor is
filed; `src/core/dream/ledger.js` stays outside the boundary. **Overrule cost:** a
separate package (`WP-ledger-delivery-stamp`) owning the ledger record schema and
its migration, plus a second rendered form of the pointer sentence in all four of
the banner package's carriers.

## 4. The split

Question: confirm the split of the Draft stub into a SUCCESS half (this package)
and a DISPOSAL half (`WP-quarantine-disposal-durability`, Draft). Recommendation:
**confirm** — the two halves enforce different invariants with different
dispositions, and a flush that fails on the disposal side cannot take *preservation
failure* because the preservation has already failed.

**Ruled by the standing instruction — recommendation adopted.** The successor stays
`Draft` and `depends_on` this package. **Overrule cost:** folding it back adds three
call sites, one new failure disposition the owner has not been asked for, at least
two more Table C identities with their mutations, and a change to two shipped
`best-effort` postures — which is a contract change, not a fold-in.

## 5. Where the adversary is pinned — parked at round 2 by escalation (ii)

Question: is arbitrary same-user native code a NAMED RESIDUAL citing
`docs/THREAT-MODEL.md`'s class **A12**, with F8 and F9 defending against overlapping
runs and the user's own hand? Recommendation: **pin at A12 and cite the threat
model** — a process that can swap `qdir` aside during a flush can delete the
preserved copy one instruction after this function returns, so no durability
protocol holds against it.

**Ruled by the standing instruction — recommendation adopted.** Row **F10**'s
GUARANTEED / DISCLOSED / OUTSIDE split stands. **Overrule cost:** descriptor
retention for every directory in the chain held to the last gate with a bigint
`(dev, ino)` re-compare per position, plus a race test per substitution point — a
permanent maintenance surface that still cannot stop a delete-after-success, and
that moves the package's claim from *what a success means* to *what it prevents*.

## 6. Whether this call removes by pathname at all — parked at round 4

Question: keep the three gated pathname removals and disclose the check-then-unlink
window at each, or stop removing? Recommendation: **keep all three and disclose all
three** — never removing `tmp` after a successful commit leaves a second link at a
deterministic pid-derived name and fails a later preservation that should have
succeeded, and never removing on failure leaves this invocation's own secret-bearing
bytes under a name no record, no cleanup pass and no abort message reaches.

**Ruled by the standing instruction — recommendation adopted.** F10 discloses one
class with an instance at each removal, all three destructive, one of them silently.
**Overrule cost:** amending two canonical rows of a `Done` spec whose disposal
contract the owner ruled on 2026-09-02; a new retained-artifact state with its own
lifecycle, naming and disclosure; a cleanup pass that does not exist; and a
collision-recovery path for a temp name that is never freed.

## 7. The supported filesystem — parked at round 6

Question: `O_EXCL`'s exclusive create and `link(2)`'s `EEXIST` refusal are atomic on
a local POSIX filesystem and Node warns the exclusive flag *"might not work with
network file systems"*, while a user's core can sit on a network-mounted home — state
the precondition, or add a runtime check? Recommendation: **state the precondition,
disclose the residual, add no runtime check** — a probe cheap enough to run per
preservation cannot distinguish *this filesystem does not honour `O_EXCL`* from
*nothing raced me just now*.

**Ruled by the standing instruction — recommendation adopted.** The precondition is
*a local POSIX filesystem with atomic `O_EXCL` and hard links*; what fails elsewhere
is exclusivity and therefore provenance under overlapping runs, and everything that
consults only the held descriptor still holds. **Overrule cost:** a compatibility
probe with its own false-positive disposition — what does a dream do when the probe
says *unsupported*? — plus a supported-filesystem list to maintain across platforms.

## 8. An ownership check that cannot complete — parked at round 9

Question: when `ownsName`'s stat fails for any reason but `ENOENT`, the name may
still be this invocation's — answer `false` (skip the act), act anyway, or raise?
Recommendation: **RAISE**, reusing `WP-preservation-abort-widening` Table D row
**D3**'s existing `WienerdogError` class and route, because *I could not look* is not
*it is not there*: answering `false` reports SUCCESS with this invocation's own
secret-bearing `tmp` link still at a deterministic name, or returns `null` with its
own `dest` still present — against rows D3 and D4.

**Ruled by the standing instruction — recommendation adopted.** It is a second way
for a dream run to fail loud, in the same direction as item 2 and the owner's
2026-09-02 *"fail-loud confirmed"*; one added reason inside a class that already
exists, with no new abort and nothing added to Table P's taxonomy. **Overrule cost:**
keeping the blanket `false` requires amending D3 and D4 to admit a *failed with a
known-orphaned path* state with a lifecycle, a name and a disclosure, and accepting
a silent success over a leftover secret-bearing link; acting anyway hands a same-UID
process the deletion primitive row F8 exists to deny.

## What this unblocks

**All eight Dispatch-precondition items are answered, so nothing in that spec's
precondition blocks it. The design loop is closed as well** — round zero plus
eleven double-channel external rounds, closed at round 11 on two independent
grounds: weighted closure (the only remaining finding was LIGHT verification
wording, fixed and verified mechanically inside the frozen surface) and the pinned
stop criterion (no material design finding on either channel; the hermetic shadow
returned `approve` with zero findings on that exact tip). The record is
`2026-09-05-quarantine-preserve-durability-design-gate-rounds.md`, whose §9.4 holds
the GUARANTEED / DISCLOSED / OUTSIDE statement the loop claims and §11.5 the shape
of the loop. `WP-quarantine-preserve-durability` is **`Ready`**.

**One gate remains and it is not the owner's:** dispatch-time re-verification
(`docs/runbooks/codex-review.md`), which the orchestrator runs immediately before it
writes the dispatch message, recording each claim re-run and the revision it ran
against. **V2 reads the LOCAL `main` ref** — `git show main:<file>` — so `main` must
be fetched and current before that run, or V2 reconstructs both amended rows against
a stale base and reports a difference that is not there.

**`WP-quarantine-disposal-durability` stays `Draft`.** It inherits row **F7(a)**,
the crash-after-D2 window routed by the round-1 shadow, and the live-run pruning
ownership question routed by the round-3 shadow; its own failure disposition has not
been asked of the owner and this record does not decide it.
