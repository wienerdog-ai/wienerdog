---
title: The index refresh dropped with its cause, and the contract surface its absence explains
date: 2026-08-31
related_wps: [WP-dream-promote-in-workspace]
---

<!-- markdownlint-disable -->

# 2026-08-31 — the index refresh dropped with its cause

**Subject:** `WP-dream-promote-in-workspace`, the commit path (`commitNamedSet`).
**Status:** owner ruling, implemented at `dd18370`; contracted here and in
**Table W** of that spec.
**Pattern:** the same one as
`docs/specs/logbook/2026-08-30-toctou-class-retired-with-its-cause.md` — a
retirement records the CAUSE that retired with it, so a later reader cannot read
it as a silent weakening.

## What was dropped

After publishing its commit, the run used to refresh the user's git index so
`git status` would not report freshly committed paths as staged deletions. That
mechanism is gone. **The run now touches the user's index in no way at all.**

## Why — four defects in four rounds, each fixing the case it was shown

| round | what the mechanism did | the class it missed |
|---|---|---|
| 1 | overwrote the index entry for every committed path | destroyed the user's **staged content** |
| 2 | compared the staged blob before overwriting | a staged **deletion** has no entry, so the guard re-added the path; a staged **mode** change has an equal blob sha, so the guard flattened the mode |
| 3 | parsed `ls-tree` and `ls-files` output to compare properly | one reader for two formats — a parser bug that **disabled the refresh entirely**, silently |
| 4 | separate readers per format | an unresolved **merge** has three stages for one path; the refresh flattened them into one |

**The shape is the lesson, not any one row.** Each patch addressed the case the
review had just shown it, and each shipped green. What the mechanism actually
required was a hand-rolled re-derivation of git's own staging rules — every
entry shape git can hold, maintained here forever. **The owner ruled DROP rather
than a fifth patch.**

## The cause that retired with it

The mechanism read each path's existing index entry and then conditionally
rewrote it. **Two operations over a mutable index with a window between them is a
TOCTOU**, and a concurrent `git add` in the user's own shell landing in that
window was overwritten — measured, and one of the four losses above.

**That race is not mitigated. It is unrepresentable, because the act that created
it — this package writing the user's index — is gone.** No compare, no update,
no window. **Nothing inherits it and nothing needs to:** unlike the 2026-08-30
entry's TOCTOU, whose protected property was real and moved one package over
(Table H row H5 of `docs/specs/done/WP-dream-vault-write-primitive.md`), this
race protected nothing. It was created entirely by the mechanism, and it leaves
with it.

## What the drop costs, and the remedy

The user's index still describes the pre-run HEAD, so `git status` shows the
committed paths as staged deletions or reverse modifications and `git diff HEAD`
shows phantom deletions. **`git reset` in the vault clears all of it.** One
command; the committed history is correct throughout.

**The sharp edge, which is Table W row W4's:** until that reset,
`git revert <dream sha>` **REFUSES** — `error: your local changes would be
overwritten by revert`, exit 128. Re-derived at `dd18370` in both directions.
That makes ADR-0012's one-commit-per-run revertability **conditional on one
command** rather than immediate.

## The root cause of the DEFECTS, which is not the mechanism

The round-4 spec-fidelity gate's finding, and the reason this entry exists:

> **The mechanism had no canonical contract surface.** Its rules lived only in
> ~60 lines of code comments, and the one spec sentence that reached the area
> declined to contract it — *"How the bytes reach the index is not asserted —
> round-4 CUT ruling."* **A residual no spec names is a residual no gate can
> check.**

Four rounds of review could each only check the patch in front of them, because
there was nothing to check the patch AGAINST. **Table W is that surface**, and
the CUT sentence is now qualified to the run's PRIVATE index — unqualified, it
read as a decision not to contract the user's index either, which is precisely
where the four defects landed.

## Where the assertions went

Four tests retired with the mechanism. Two tested it directly, one of them
carrying the eighth vacuous assertion this package has paid for. **The other two
SURVIVED the deletion and passed — which is exactly why they had to go:** with
nothing touching the index they were trivially true and had no possible RED.

**One assertion replaces all four** —
`tests/unit/dream-pipeline.test.js`, *"the run does not touch the user's git
index — at all"*: ordinary staged content, a staged deletion, a staged mode
change and an unresolved merge in one fixture, asserting `git ls-files --stage`
is **byte-identical** across the run. It has a real RED against any reintroduced
write, and it covers shapes nobody has enumerated. **A total is what the
per-shape tests could not be:** each of them named a shape, and the mechanism
lost a different one every round.

Assertions that asked the index a question now ask **HEAD**, which is what they
meant; the warnings-file check asks the **file**, because `status` and
`diff HEAD` are both index-mediated and now carry the cost's noise.

## The standing condition, re-derived rather than inherited

The drop was conditional on nothing downstream depending on a refreshed index.
**That was re-derived at `dd18370` rather than taken from the removal commit's
claim**, and the measurement is Table W row W6. Its two loudest candidates both
came back negative for the same reason: `assertCleanTree` (the only real
`git status`) and `restoreVaultToHead` (the only `reset`) are **exported but
called nowhere in `src/`** — retired by row G3's re-base onto the workspace. Had
either still run, a stale index would have starved every subsequent run at its
own pre-flight, which is the failure this check existed to rule out.

## The rule this entry is an instance of

**A mechanism that keeps failing review in the same place is missing a contract,
not a patch.** The fifth patch was available and cheap; what was missing was the
surface that would have made the first one checkable. When the same contract is
hit round after round, extract it — and record the cause that leaves with the
mechanism, or the next reader cannot tell a retirement from a weakening.
