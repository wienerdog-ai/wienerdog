---
date: 2026-09-18
related_wps: [WP-quarantine-only-copy-shelf]
---

# WP-quarantine-only-copy-shelf — design gate dispositions

Raw reviewer output committed **before** adjudication, as the runbook requires.

| Round | Reviewer | Raw | Commit |
|-------|----------|-----|--------|
| 1 | Astra (design) | `docs/specs/logbook/2026-09-18-quarantine-only-copy-shelf-design-r1-astra-raw.json`, `…-r1-astra-focus.txt` | `ee17ae94` |

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
