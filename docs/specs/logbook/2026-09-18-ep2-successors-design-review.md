---
date: 2026-09-18
title: "Design gate for the ep2 successors — round dispositions"
related_wps: [WP-ep2-n2-rehome, WP-ep2-prune-once-per-run-test, WP-secret-fence-ep2-redact-arm, WP-ep2-retention-prune-timing-test]
---

# Design gate — `WP-ep2-n2-rehome` and `WP-ep2-prune-once-per-run-test`

One row per finding, per round. **Band** is the reviewer's own severity; **weight**
is the runbook's LIGHT/HEAVY classification of the fix; **disposition** is what the
architect did, and every finding has one — fixed or explicitly declined, never
silently dropped.

## Round 1 — Astra, medium, adversarial

- **Raw:** `docs/specs/logbook/2026-09-18-ep2-successors-design-r1-astra-raw.json`
- **Focus:** `docs/specs/logbook/2026-09-18-ep2-successors-design-r1-astra-focus.txt`
- **Committed at:** `6b9e515d`
- **Reviewed tip:** `1e13759a`, branch diff against `08de2bc3`
- **Verdict:** `needs-attention`, one finding

| # | finding | band | weight | disposition |
|---|---------|------|--------|-------------|
| **R1-1** | **The detector misses the regression N2 exists for.** `WP-ep2-prune-once-per-run-test.md:240-243`: with **49** seeded files, per-redaction pruning and correct once-per-run pruning both attempt **one** intercepted delete (the first call sees 50, returns at the cap; the second sees 51 and deletes once), so only the duplicate-at-the-end mutation separates. Astra executed the helper against simulated entries to confirm | **B** (medium) | **LIGHT** — verification machinery, no contract rule changes. *Recorded as LIGHT and flagged anyway: it is the whole content of the package, which is why a confirming round follows* | **FIXED as recommended.** Seed count **49 → 50**, so the directory ends **two** over the cap and every schedule separates. Table P rows **P-4, P-6, P-7, P-8, P-9, P-10** rewritten; the RED declaration now carries **two** proofs, one per single-file schedule; **V-2** rewritten to validate both and proven both ways; Mirrored Surface Checklist gains the seed-count/expected-count pairing; Implementation notes gain the seed-count rule. **All three schedules re-measured by hand** — see below |
| **R1-2** | **Round zero, cite:** `src/cli/dream.js:33-38` for the require-time destructure is off at both ends; the statement is `:34-39`. Appears in the rehome Current state and in the test WP's `S-1` and Current state | — | **LIGHT** | **FIXED.** Both specs now cite `:34-39` and name the two boundary lines |
| **R1-3** | **Round zero, count:** the rehome Current state says `grep -rn 'pruneRedacted' src/` returns four hits; it returns **five** — `validate.js:1174` matches because `pruneRedactedOriginals` contains the string. The one-call-site claim stands | — | **LIGHT** | **FIXED.** The bullet now enumerates all five and states which one is the invocation, deferring to N2R-5 for the claim |
| **R1-4** | **Round zero, enrichment:** the `S-2` three-reads chain is exact; the two non-prune reads reach `private-fs.js:393` through `regenerateDigest`, which a successful run calls twice (`dream.js:1300`, `:1341`) | — | **LIGHT** | **FIXED.** `S-2` now names the outer callers as well as the inner chain |

Everything else Astra checked was verified exact: Table M's sixteen rows and their
verdict tally, the eight-occurrence routed-slug count across seven lines, and every
locus at both ends.

## Round 2 — Astra, confirming

- **Raw:** `docs/specs/logbook/2026-09-18-ep2-successors-design-r2-astra-raw.json`
- **Focus:** `docs/specs/logbook/2026-09-18-ep2-successors-design-r2-astra-focus.txt`
- **Committed at:** `5ced42cd`
- **Reviewed tip:** `02ad7838`
- **Verdict:** `approve`, **no findings**

| # | finding | band | weight | disposition |
|---|---------|------|--------|-------------|
| — | none | — | — | **R1-1 confirmed closed by execution**: Astra ran the real prune helper against mocked directory entries and reproduced the revised counts (control 2, (a) 4, (b) 5, (c) 3) and the zero-redaction guard. Its own scope note is recorded rather than smoothed over — *"Full pipeline tests were not run"* — which is exactly why P-10's numbers stay the hand-measured whole-suite runs below and P-11 keeps the unfiltered `npm run red-proofs` as the implementer's evidence |

## Gate closed

**The design gate is CLOSED at round 2, 2026-09-18** — round 1 LIGHT by the
runbook's classification but load-bearing (it was the package's whole contract),
so a confirming round was run; round 2 approved with no findings. Both specs move
to `status: Ready`.

**This is a review gate and nothing more.** It is not owner approval and grants
nothing the owner has not been asked for.

**Owner item O-1 is no longer open — corrected 2026-09-18.** This section first
said it "remains OPEN". By the time the gate closed it had been **taken under the
standing process** and recorded on `main` in
`docs/specs/logbook/2026-09-17-owner-rulings-felho-integration-3.md`, under
*"Items dispatched under the standing process, 2026-09-18 (continued)"* (PR #283):
the recommendation was adopted — grant, bounded to the one slug
(`WP-ep2-retention-prune-timing-test` → `WP-ep2-prune-once-per-run-test`), with
`OWNER-SIGNED`, A3's divisibility claim and its dated 2026-07-28 measurement
unchanged. **That record states, and this one repeats, that nothing there is the
owner approving, accepting, ratifying or signing the change**; it is a dispatch
under the standing process, reversible by dated amendment. The ADR row is
therefore in `WP-ep2-n2-rehome`'s Deliverables as an exercised row, and the
"Dispatch precondition — owner items" section is read together with that ruling.

## PR gate round 1 — the implementation (PR #285, tip `8a24ebff`)

Both gates landed on one family. **The root cause is in the SPEC, not the diff:**
Table M enumerated only N2's trigger-LOCUS mirrors, while N2R-9 re-keys a second
contract — M-48's mutation IDENTITY — whose mirror family Table M never listed.

| # | finding | source | weight | disposition |
|---|---------|--------|--------|-------------|
| **P1-1** | **Table B row B10 still says pruning inside the chain is *"exactly what mutation M-48 does"*** while the PR re-keys M-48 to the duplicate-invocation form — a registered mirror contradicting its canonical row | Astra, independent | HEAVY (contract) | **FIXED in the spec by erratum 1**: new canonical row **N2R-13(a)** with the literal replacement clause; **M-2** widened from one clause to two |
| **P1-2** | **Root cause — Table M's axis.** M-2 (`:276`) bounded B10 to the locus clause; M-6 (`:280`) to "that clause and nothing else"; M-13 (`:287`) cleared as "it states no locus" while its errata sentence asserts B10 *"cites M-48 more accurately after the split"* — now false | wd-reviewer, REQUEST-CHANGES | HEAVY | **FIXED**: **N2R-13** enumerates the identity axis with a literal replacement per surface; **M-2**, **M-6**, **M-8** and **M-13** widened to it |
| **P1-3** | The PR's M-6 edit **dates a 2026-09-18 statement to 2026-07-28** and leaves *"only the per-call half now has a row"* false | wd-reviewer | HEAVY | **FIXED**: **N2R-13(c)** re-keys the clause; **N2R-13(d)** appends the four words `, and again on 2026-09-18` to the provenance, exactly as M-9's row already carries |
| **P1-4** | **The repair instruction is unexecutable**: the Checklist says a further mirror is "added to Table M on the spot", but the Deliverables row forbids any change to this spec except `status:` | wd-reviewer | LIGHT | **FIXED**: further mirrors are now routed to **this logbook entry**, which an implementation branch may always write (`scripts/boundary-check.js`); the architect folds them back into Table M by erratum |
| **P1-5** | **M-10 / M-11 register their additions by the ordinal "the last two"** — false, since B10 is **first** in M-48's six-surface enumeration, and forbidden by ADR-0036 row **A2** | coordinator, round zero | LIGHT | **FIXED**: **N2R-12** now requires the additions to be named, in M-12's form *"the two surfaces that pass added"* |
| **P1-6** | **AC-8 cites the JSDoc as `:1159-1171`** where Deliverables and M-15 say `:1159-1173` | coordinator, round zero | LIGHT | **FIXED**: AC-8 now locates the block **by construct** and states no range — the block's own length changes under this WP, so any number there is wrong before the work starts and again after it. V-6 already anchors on the construct |
| **P1-7** | **M-8's census cell** should carry M-9's `as it was spelled at that date` qualifier | coordinator, round zero | LIGHT | **FIXED**: **N2R-13(e)**; M-8's verdict is now `EDIT, ROUTING PLUS ONE QUALIFIER`. Limb stays `gap` |
| **P1-8** | **The JSDoc grows three lines to five**, so `validate.js` constructs below it shift `+2` and `WP-ep2-prune-once-per-run-test`'s cites go stale the moment the rehome lands | coordinator, round zero | LIGHT | **FIXED**: **N2R-14** pins the landed shape and the shift, and the successor spec is **re-pinned in the same PR** — `:1176`, `:1180`, `:1182`, `:1194`, `:1322`, `:1324`, `:1417`, `:1420`, `:1558-1560`. **Widened beyond the three cites the gate named**, because a line count that moved is wrong wherever any sentence states it. `src/` stays pinned at `08de2bc3`: the change is comment text only, so no executable byte moves |

**Neither spec's `status:` changes.** Erratum 1 is an architect's amendment to a
`Ready` spec and lands as its own docs PR; the implementer rebases PR #285 onto it
and applies N2R-13 and N2R-14.

## PR gate round 2 — the implementation (PR #285, tip `b78d3cb2`)

**Erratum 1's own mandated literals broke erratum 1's own gate**, and the
implementer surfaced it correctly rather than working around it.

| # | finding | source | weight | disposition |
|---|---------|--------|--------|-------------|
| **P2-1** | **The slug count is off by exactly the erratum's own literals.** N2R-13(a) and N2R-13(c) each spell `WP-ep2-prune-once-per-run-test` inside a **mandated replacement clause**, so a byte-exact application takes the new slug from eight occurrences to **ten** — while N2R-11's count sentence, **AC-6** and **V-5** all still said eight. **V-5 failed on a correct implementation** | PR gate round 2 | HEAVY (contract) | **FIXED by erratum 2.** N2R-11 now states two facts separately — **(i)** the eight OLD occurrences are re-routed and the old slug ends at **zero**; **(ii)** the new slug ends at **exactly ten**, those eight plus N2R-13(a) and N2R-13(c). **AC-6 and V-5 assert both counts.** V-5's diagnostics now name the sub-row that failed |
| **P2-2** | **The implementer's precedence call**: they applied the canonical rows byte-exactly and left V-5 red rather than reword a mandated literal to make a verification step pass | PR gate round 2 | — | **ENDORSED, and recorded as the rule.** A mandated literal outranks a verification count: the literal is the contract, the count is a check over it, and a check that disagrees with its own canonical row is the check that is wrong. Rewording the literal would have made the gate green while leaving Table M's registered mirrors saying two different things |
| **P2-3** | **A third ordinal, fixed on the implementer's own initiative.** M-48's enumeration read *"The seventh was added"*; the implementer replaced it with the named form N2R-12 mandates for M-10/M-11/M-12 | PR gate round 2 | LIGHT | **REGISTERED by erratum 2.** Table M row **M-9**'s verdict now states that N2R-12's naming rule binds M-48's own enumeration too. *A rule a spec relies on but does not state is not a contract, and the fix should not have depended on the implementer noticing* |

**Everything else on that tip is green** and is recorded so the next round does not
re-derive it: the old slug at zero, all eight contracted re-routings present,
V-1…V-4 and V-6…V-8, `npm test` 2904 with zero failures, `npm run lint`, and the
boundary check.

**Measured on `b78d3cb2`** — old slug **0**, new slug **10**, across nine lines
(`:4525` carries two). **V-5 as erratum 2 rewrites it was run both ways:** green
against that tree, and red against `main`'s unimplemented one (`FAIL V-5:
N2R-11(i) — the old slug still occurs 8 time(s), want 0`).

**Neither spec's `status:` changes.**

### The three regression schedules, re-measured by hand at `08de2bc3`

Each mutation applied to a worktree carrying the candidate test, the **whole** suite
run each time, then reverted. **Every mutated run gives
`tests 2905, pass 2892, fail 1, skipped 12`, the single failure being the new test
and nothing else in the repository reddening.**

| schedule | mutation | files | declared? | delete-path count |
|----------|----------|-------|-----------|-------------------|
| control | — | — | — | **2** — `tests 2905, pass 2893, fail 0, skipped 12` |
| **(a) duplicate at the call site** | a second `gates.pruneRedacted();` beside `src/cli/dream.js:1102` | 1 | **yes** — proof `ep2-prune-runs-once-per-run` | **4** |
| **(b) per-redaction, added** | `pruneRedactedOriginals(stateDir, redactedCreated);` after `completedRedactions += 1;` (`validate.js:1418`), end call left in place | 1 | **yes** — proof `ep2-prune-not-once-per-redaction` | **5** |
| **(c) per-redaction, moved** | (b) with the `dream.js:1102` call removed — a true move | 2 | **no** — a RED proof mutates one file; hand-measured provenance only | **3** |

**Under the 49-seed fixture the finding reproduces exactly as stated:** the earlier
measurement of (a) reported **2** deletes against a control of **1**, and (b) and
(c) would both have produced **1** — indistinguishable from the control. The
schedule Astra named is the one M-48 itself describes, so the defect was a detector
that missed its own contract row's historical mutation.

### Note on M-48

`WP-ep2-n2-rehome` re-keys M-48 to schedule **(a)** only, byte-for-byte with proof
(a). ADR-0036 row A3 permits exactly one mutation per row, so schedules (b) and (c)
get no row in the `Done` ep2 spec; they belong to the successor's declaration and to
this entry.
