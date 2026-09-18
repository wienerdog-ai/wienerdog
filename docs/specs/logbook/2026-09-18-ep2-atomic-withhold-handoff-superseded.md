---
date: 2026-09-18
title: "WP-ep2-atomic-withhold-handoff superseded — the withhold arm no longer reads then destroys; the surviving residue is a CAS window on the publish, filed as WP-vault-write-cas-window"
related_wps: [WP-ep2-atomic-withhold-handoff, WP-vault-write-cas-window, WP-secret-fence-ep2-redact-arm, WP-dream-promote-in-workspace, WP-dream-promote-module, WP-dream-vault-write-primitive]
---

# A mandated mechanism outlived its subject

`docs/specs/WP-ep2-atomic-withhold-handoff.md` was a Draft stub (size M,
`opus`), filed 2026-07-27 to carry an owner-decided follow-on: **capture the
withheld note by renaming its vault path away, instead of reading it and then
destroying it.** Two months of promotion work removed the read and removed the
destruction. The stub was assessed against `main` at `c05a575b` and is now
`status: Superseded`. Nothing was fixed and no code moved; this is a docs-only
pass over three spec files plus this entry.

## Why the mandate has no subject

Each claim below was read in the shipped source during this pass, not inferred
from the specs that describe it.

1. **`quarantinePreserve` is handed its bytes.** `src/core/dream/validate.js:936`
   — `function quarantinePreserve(stateDir, content, rel, date, kind = 'withheld')`.
   `content` is a `Buffer` parameter and nothing inside reads the vault path.
   The stub's premise, quoted from its own "The problem, stated once", was
   *"`quarantinePreserve` reads the working-tree file at
   `src/core/dream/validate.js:654`"*. That line does not do that any more.
2. **Both call sites pass workspace bytes.** `validate.js:1439` (withhold) and
   `:1416` (redact) pass `afterBytes`, destructured from the gate's input at
   `:1364`. `src/core/dream/delta.js:515` fills that field from `walk(root, …)`
   over the **dream workspace**, never the vault.
3. **`grep -rn "git checkout HEAD" src/` returns nothing.** The tracked half of
   the destruction is gone from the product.
4. **No `fs.rmSync` in `validate.js` targets the vault.** The three survivors
   — `:676`, `:1196`, `:1500` — are internal to the `state/quarantine/` shelves.
   Promotion writes nothing for a withheld path, so the vault object is never
   mutated on this arm.

**The tests that pinned the race are retired in place.**
`tests/unit/dream-validate.test.js:2138-2140` and `:2143-2145` carry the house
retirement form — *"the retired checkout race over a vault file"* and *"the
retired untracked-file removal race in the vault"*, each closing *"Under
promotion this machinery has no subject."* RP-1's section-header comment
survives at `:2131-2136` with nothing under it; `grep -n "RP-1"` over the file
returns that single line.

**What moved it.** `WP-dream-promote-in-workspace` row G7 extracted the four
gates and took `validate.js`'s EP2 **enforcement half** — the revert, re-stage
and index-drop core, its refusal-reason suffixes and its `reverted[]`
accounting — on the stated ground that under promotion those reverts have no
subject. `WP-dream-promote-module`'s Table Q is where the preservation record
and the vault write now live.

**The stub predicted this shape and was right about the logic.** Its own round-8
correction reads: *"RP-1 can fail simply because its seam no longer exists … A
tripwire that fires on the disappearance of its own hook proves nothing about
the property it was watching."* RP-1 did not fail. It was removed. So the
closure had to be argued from the source, which is what this pass did, and
RP-1's absence is **no evidence either way** — it is recorded as such in the
predecessor rather than read as a pass.

## What survives, and why it is a new package rather than a re-aim

`src/core/dream/vault-write.js`'s conditional publish is check-then-act. `:437-442`
re-reads the target and compares it against `expect`; `:452` renames over it. A
save landing between those two is lost, and the call preserved nothing of the
target because its premise was that the target still held `expect`. Disclosed as
narrowed-not-closed in three places — `vault-write.js:48-50` (limit **B**,
`CHECK-TO-PUBLISH WINDOW`), `promote.js:1601`, `promote.js:1757-1761` (row
**R4**) — plus row **H5** of `docs/specs/done/WP-dream-vault-write-primitive.md:217`,
whose "Out of scope" already declined to close it in as many words.

**It is a different defect.** Different arm (the publish, not the withhold),
different file, different victim: a concurrent *vault* edit rather than an
uncaptured save. Re-aiming the stub onto it would have kept an id whose title,
premise, scope items, open questions and mandated mechanism are all false
against the tree — a file that reads as continuity and is actually a
replacement. So it is filed as `docs/specs/WP-vault-write-cas-window.md`
(Draft, **M** provisionally, `epic: dream-promotion`,
`depends_on: [WP-dream-vault-write-primitive]`), a **NOT-DISPATCHABLE backlog
entry** recording the window, the three disclosure sites and two candidate
closures — hold a descriptor across compare→rename; publish by `linkat`/`O_EXCL`
— **with no decision taken and no design round run.**

Both candidates are recorded with what they do **not** reach, which is the one
piece of craft carried over from the superseded stub: it caught itself
presenting an `O_CREAT|O_EXCL` placeholder as windowless when it narrowed to two
syscalls, and wrote *"a candidate that only looks windowless is worse than one
that is honest about its width."* Candidate 1 does not close the arm where an
editor saves by atomic-rename, because `rename(2)` resolves by path. Candidate 2
closes the **create** arm outright and does not close the **overwrite** arm,
because unlink-then-link is a wider window than today's. Both are written that
way.

## What changed on disk

| File | Change |
|---|---|
| `docs/specs/WP-ep2-atomic-withhold-handoff.md` | `status: Draft` → `Superseded`; supersede banner carrying the four constructs, the retired tests, the packages that moved it, the pointer at the residue, and a `Dispatch precondition — owner items` section in the standing form. The superseded stub is preserved unedited below the rule. |
| `docs/specs/done/WP-secret-fence-ep2-redact-arm.md` | dated **ERRATUM — 2026-09-18** under accepted residual **11**, striking it as no longer open, plus deferral notes on its three mirrors (`:460`'s "What it does NOT settle" sentence, option **A**'s cost cell, Table T row **RP-1**'s closing instruction). Every dated 2026-07-27 sentence is untouched. |
| `docs/specs/WP-vault-write-cas-window.md` | new Draft backlog stub. |
| `docs/specs/logbook/2026-09-18-ep2-atomic-withhold-handoff-superseded.md` | this entry. |

**Nothing in `src/` or `tests/` was touched**, and the erratum says explicitly
what it does not claim: the dream still has a loss window; it is on the publish,
it is open, and it is filed.

## Lessons

- WP-ep2-atomic-withhold-handoff: a follow-on stub is a bet that its subject
  will still be there when it is dispatched. Two intervening packages
  (`WP-dream-promote-in-workspace`, `WP-dream-promote-module`) removed the read
  and the destruction this one was written to make atomic, and nothing in the
  stub's own `depends_on` would have caught it. Re-derive a stub's premise
  against the tree before dispatching it, not after.
- WP-ep2-atomic-withhold-handoff: a retired tripwire is not a passing one. RP-1
  was written to go red when the race closed; instead both its test bodies were
  retired in place, so it neither passes nor fails. The stub had already written
  down why that inference is unsound — and the closure still had to be argued
  from four constructs in the shipped source.
- WP-vault-write-cas-window: when the residue of a superseded package is a
  different defect on a different arm, file a new id rather than re-aiming the
  old one. Keeping the file name would have kept a title, a premise and a
  mandated mechanism that are all false against the tree.
