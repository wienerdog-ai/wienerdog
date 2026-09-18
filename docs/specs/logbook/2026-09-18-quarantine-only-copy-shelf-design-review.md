---
date: 2026-09-18
related_wps: [WP-quarantine-only-copy-shelf]
---

# WP-quarantine-only-copy-shelf — design gate dispositions

Raw reviewer output committed **before** adjudication, as the runbook requires.

| Round | Reviewer | Raw | Commit |
|-------|----------|-----|--------|
| 1 | Astra (design) | `docs/specs/logbook/2026-09-18-quarantine-only-copy-shelf-design-r1-astra-raw.json`, `…-r1-astra-focus.txt` | `ee17ae94` |
| 2 | Astra (design) | `docs/specs/logbook/2026-09-18-quarantine-only-copy-shelf-design-r2-astra-raw.json`, `…-r2-astra-focus.txt` | `051a2147` |
| 3 | Astra (design) | `docs/specs/logbook/2026-09-18-quarantine-only-copy-shelf-design-r3-astra-raw.json`, `…-r3-astra-focus.txt` | `ae230700` |
| 4 | Astra (design) | `docs/specs/logbook/2026-09-18-quarantine-only-copy-shelf-design-r4-astra-raw.json`, `…-r4-astra-focus.txt` | `6bd00d7c` |

Round zero reproduced probes `OC-P1`–`OC-P4` bit-for-bit and re-derived every
citation. Round 1 verdict: `needs-attention`, three findings. **All three
accepted in full; none dispositioned away.**

## Round 1

| # | Finding | Band | Weight | Disposition |
|---|---------|------|--------|-------------|
| R1-A | The universal only-copy premise excludes existing failure paths: `validate.js:1489-1504` retains duplicates when the identity read fails or the best-effort delete throws; a refused fall-through leaves no sanitized version in the vault; the shelf does not deduplicate | A | **HEAVY** | **ACCEPTED.** Row **O1** restated from a universal to a partition — **Class A** (successful redaction, sole pre-scrub form), **Class B** (refused fall-through with no withheld twin, sole form of the added content, vault note at baseline), **Class C** (retained duplicate, twin on the unbounded banner-announced withheld shelf, **not** an only-copy) — plus the no-dedup caveat, measured as `OC-P5`. Rows **O2, O5, O6, O7, O8** re-derived per class. **The decision (candidate (a)) survives**, and the per-class argument is now the argument: class C is pure housekeeping, classes A and B are the approved bounded loss. **The real damage was to the documentation**, and it is fixed: the two doc clauses now say the deleted file **may be** the only copy, and are forbidden from saying it always is (false for C) or that the vault note holds a redacted form (false for B). Row **O6**'s "mark is vacuous" argument is **withdrawn** and replaced — a mark would now genuinely distinguish A/B from C, and is rejected instead because the mark *is* the missing durable record |
| R1-B | The RED declaration names a nonexistent nested test: `expectRed[].test` is an outermost-first identity **path**, not a list | B | LIGHT-by-runbook, load-bearing | **ACCEPTED, and the recommended fix was measured and found insufficient.** Verified against the runner, not by reading: `scripts/red-proofs.js:693-694` rejects a bare name; `:1599-1602` fails BASELINE on an unresolvable identity; and **`:1668-1670` throws on any UNDECLARED `testCodeFailure`**, so "declare `[OC-1]` alone and note R8's collateral reddening" would also fail, and R8's assertion at `:1594` carries no message and so can emit no signal. The declaration was therefore **redesigned around a new mutation, chosen by measurement**: the prune **copies the evicted file aside before unlinking**. A first candidate (rename-aside) was applied and **measured to redden `dream-pipeline: … Table N row N2`**, whose spy counts `rmSync` deletions — caught only by running it. The shipped copy-then-delete mutation keeps the deletion real: applied at `c05a575b`, **the whole suite ran green (2895 pass, 0 fail)** while `[OC-1]`'s absence walk found the bytes, so `[OC-1]` is the sole red. `expectRed` is now one entry with a one-element path |
| R1-C | The two-run fixture either preserves a duplicate or never triggers pruning | B | LIGHT-by-runbook, load-bearing | **ACCEPTED, confirmed empirically.** `OC-P5`: two runs over the same note content leave two byte-identical shelf files, so evicting `R` cannot make the absence assertion pass. `OC-P7`: the gate returns `{ok:true}` on an already-scrubbed note, so a published run 1 followed by an unchanged run 2 completes no redaction and never prunes. `OC-P6` validates the corrected fixture end to end: run 1 `publish: true`; `R` explicitly aged oldest; 49 newer dummies; run 2 judges a **different** note with a **different** token; 50 → no prune, 51 → `R` evicted, walk visits 50 files and finds `R`'s bytes nowhere. Written into the fixture contract, acceptance criterion 2, and an Implementation-notes trap |
| R0-a | Template's "Authoring rules live in `docs/runbooks/spec-authoring.md`" bullet absent | B | LIGHT | **ACCEPTED.** Added under the title |
| R0-b | Trigger (ii) said only-copy "partitions" the shelf while O1 said it is not a partition | B | LIGHT | **ACCEPTED.** Re-worded to the shelf's three classes, aligned with the corrected O1 |
| R0-c | Trigger (iv) claimed precedence is decided here though the package ships no Table N change | B | LIGHT | **ACCEPTED.** Softened to *adjudicated* — row O8 decides it NO and ships no Table N change |

## Note on process

One editing error occurred while applying R1-A: a replacement's end-anchor
matched a later occurrence and removed the `## Contract reference` and
`## Implementation notes` sections. Caught immediately by a structure check
(`grep -n '^## '`), recovered from `HEAD`, and the row rewrites re-applied. No
content was lost. Recorded here because an unnoticed truncation of the canonical
table would have been the worst possible failure of this package.

## Round 2

The three-class restatement, the RED redesign and the `OC-P6` fixture all held.
One finding, `needs-attention`. **Accepted in full.**

| # | Finding | Band | Weight | Disposition |
|---|---------|------|--------|-------------|
| R2-A | Class C treats unproven or unequal copies as safe duplicates. `validate.js:1489-1504` retains those files *because* equivalence is unproven; executing the identity branch and the real prune with unequal copies retained both, then destroyed the `redacted/` version while the different withheld version survived — which rows O2/O8 called "no loss / housekeeping" and used to justify the retention decision. A class-A-only test cannot expose it | A | **HEAVY** | **ACCEPTED.** The round-1 class C was **inverted**, and the inversion is now named in row O1 so it is not re-made: the gate DELETES proven-identical copies at `:1499` and KEEPS the unproven ones at `:1502`, so the fall-through files that actually survive are overwhelmingly potential only-copies. Class C is split: **C1** = `identical === true` **and** the best-effort `rmSync` at `:1500` threw — a proven byte-identical twin exists, true housekeeping, and (per the `else` never running) **not on the preservation record**; **C2** = `identical === false` with `preserved` non-null (read threw, or buffers differ) — kept **and recorded** at `:1502-1503`, and **the code's own comment at `:1478-1481` calls it *"the only copy of a version of the user's note that exists anywhere"***. C2 is now treated exactly as A and B are. Rows **O2**, **O5**, **O8** and **owner item 1** re-derived: the lossless part shrinks to C1 alone, so the item the owner signs is *bounded loss with a rare housekeeping case*, not the reverse. Doc clauses are unchanged in substance — the round-1 "**may be** the only copy" hedge is what makes them honest for C2, and it now hedges for **C1** instead. Regression coverage added as **`[OC-2]`** (buffers differ) and **`[OC-3]`** (comparison read throws), both fixture-level via `patchFs`, both driving the fall-through with the withheld preserve **succeeding**; the Deliverables cell widens from one test to three. Neither asserts the prune: the eviction is what `[OC-1]` already measures, and re-asserting it per class would be a drifting duplicate |

**Scope note.** `size: S` is retained: three tests in one already-listed file, one
RED declaration, two doc clauses, and still **no `src/` change**. If round 3 adds
a fourth class or a production path, the package should be split rather than grown.

## Round 3

The C1/C2 split, `[OC-2]`/`[OC-3]` and the dependents held. One finding,
`needs-attention`. **Accepted in full.**

| # | Finding | Band | Weight | Disposition |
|---|---------|------|--------|-------------|
| R3-A | A C1 duplicate can become the only copy before pruning: C1 proves equivalence at CREATION, but row O2 called its deletion in a later run unconditionally lossless. The owner can delete the announced withheld twin meanwhile — the incident runbook instructs it — leaving the unrecorded `redacted/` copy the sole survivor. Reproduced: cleanup failed, twin removed, a later prune destroyed the remaining original | B | HEAVY *(only insofar as it changes a user-facing doc clause)* | **ACCEPTED.** C1 is restated as **"duplicate AT CREATION TIME ONLY"**, with the two surfaces that invite the owner to falsify it cited inline (`src/core/dream/promote.js:600-603` *"delete that copy"*; `docs/runbooks/secret-incident.md:40-48`), and noted as the same state `WP-quarantine-disposal-durability`'s owner item **O10** already accepted for its row M6, reached by a different route. Row **O2** now leads with the general form rather than a per-class patch: **at prune time NO class is provably lossless, because `pruneRedactedOriginals` performs no identity check at all** — `readdirSync`, a date regex, `statSync`, `rmSync`; it never opens a file, never compares bytes, never consults a record, and every identity fact this package has is creation-time. Row **O8** and **owner item 1** re-worded: the lossless case is not a class but a *condition* the prune never checks. **The doc clauses needed no rewording, and that was verified rather than assumed:** round 1's "**may be** the only copy" hedge is true under A, B, C1 and C2, and row O8 now records that as the reason both clauses survived every correction. Regression `[OC-4]` added — fall-through with equal buffers so `identical === true`, `rmSync` forced to throw for the `redacted/` path, both copies asserted present and the shelf copy asserted **absent from the preservation record**, twin then deleted as the runbook instructs, then the prune fires and a non-vacuous whole-tree walk finds the bytes nowhere. **It asserts the loss; it does not prevent it.** No `src/` change |

## Convergence — the surface is frozen

Three rounds; every dependent row re-derived twice. **The deliverable surface is
now frozen at: four tests in `tests/unit/dream-validate.test.js`, one RED
declaration, two documentation clauses, and no `src/` change.** Any further
finding is either fixed **within** that surface or accepted as a **named
residual** in this file — it does not grow the package. If a finding cannot be
accommodated either way, the right move is a **successor package**, not a fifth
revision: `size: S` has been retained through three rounds precisely because the
boundary never moved off tests and docs, and the two live successors are already
named (owner item 2's `WP-ep2-prune-overlap-guard`, and owner item 3's
reconciliation pass if it is ever overruled).

**What the three rounds actually converged on**, recorded because it is the
package's result and not merely its history: the shelf holds four classes; the
prune is the only path in `src/` that can destroy a sole-surviving copy; **it
performs no identity check, so at prune time nothing it deletes is provably a
spare**; and candidate (a) is nonetheless right, because that is the bargain an
owner-approved count cap on such a shelf already is. The package's whole job is to
make that legible and pin the premise.

## Round 4

Nothing about the product: the round-3 fix held. One finding, **LIGHT**
(verification machinery), and it falls **inside** the frozen surface, so it is
fixed within it exactly as the convergence note provides.

| # | Finding | Band | Weight | Disposition |
|---|---------|------|--------|-------------|
| R4-A | `[OC-4]`'s whole-tree absence walk also reddens under the prescribed copy-then-delete mutation, so `expectRed` cannot name `[OC-1]` alone | C | **LIGHT** | **ACCEPTED, and re-measured rather than taken on report.** The mutation was hand-applied to a throwaway copy at `c05a575b` and both absence assertions exercised through their probe equivalents — `OC-P6` for `[OC-1]`, and a new `OC-P8` modelling `[OC-4]`'s C1 leftover (shelf file placed directly, aged oldest, 49 newer dummies, a redacting run to 51, then the prune). **Baseline: walk visits 50 files, 0 matches — absence holds, `[OC-4]` passes. Mutated: walk visits 51 files, 1 match in `.pruned/` — `[OC-4]` reddens.** Since `scripts/red-proofs.js:1668-1670` throws on an undeclared `testCodeFailure`, `[OC-4]` is now a second `expectRed` entry with its own **one-element** identity path (`:693-694`, `:1599-1602`) and its own signal, `O2-C1-decayed-copy-is-destroyed`, which the spec now requires to sit in the message of the assertion that actually reddens. `[OC-2]` and `[OC-3]` do **not** redden — neither seeds to the cap, so neither prunes and the mutated line never executes. Acceptance criterion 6 changes from "exactly one entry / `[OC-1]` as the sole red" to "exactly two entries / exactly `[OC-1]` and `[OC-4]`". Mirrored into Table O row **O8**'s O8c clause and the Mirrored Surface Checklist. **Stated in the spec and repeated here: the four tests do not exist yet, so this is a measurement of their ASSERTIONS, not of them — the implementer re-measures with a bare `npm run red-proofs` once all four exist and pastes the observed red set into the PR** |

## Gate closed

**The design gate is CLOSED at round 4, 2026-09-18.** Rounds 1–3 landed HEAVY
product findings, round 4 one LIGHT verification-machinery finding; **all four
accepted in full, none dispositioned away.** Every round's raw output was
committed before adjudication (`ee17ae94`, `051a2147`, `ae230700`, `6bd00d7c`).
`status:` is flipped to `Ready` in the same commit as this record.

**A closed design gate is a review gate, not owner approval.** Owner items 1, 2
and 3 remain open in the standing form — recommendation plus cost of overruling,
reversible by dated amendment — and **nothing in this repo records the owner
approving, accepting or ratifying any of them.** The frozen surface stands: four
tests, one RED declaration, two documentation clauses, **no `src/` change**.
